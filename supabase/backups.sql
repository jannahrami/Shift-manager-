-- =========================================================
-- نسخ احتياطية تلقائية لبيانات Shift Manager
-- • تنحفظ نسخة تلقائياً قبل أي تعديل (بحد أقصى نسخة كل ساعة)
-- • الاحتفاظ: كل النسخ لآخر 7 أيام، ثم نسخة وحدة لكل يوم لين 120 يوم
-- • الأدمن فقط يشوف النسخ ويسترجعها
-- آمن لإعادة التشغيل
-- =========================================================

create table if not exists public.shift_manager_backups (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  reason      text not null default 'auto',
  state       jsonb not null,
  leave_plans jsonb not null default '[]'::jsonb
);
create index if not exists shift_manager_backups_created_idx on public.shift_manager_backups (created_at desc);

alter table public.shift_manager_backups enable row level security;
drop policy if exists smb_admin_read on public.shift_manager_backups;
create policy smb_admin_read on public.shift_manager_backups
  for select to authenticated using (public.lp_is_admin());
revoke all on public.shift_manager_backups from anon;
revoke insert, update, delete on public.shift_manager_backups from authenticated;

-- تاخذ نسخة (لو آخر نسخة أقدم من p_min_gap) وتنظف القديم
create or replace function public.sm_take_backup(p_reason text, p_state jsonb default null, p_min_gap interval default interval '1 hour')
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare v_id bigint; v_state jsonb;
begin
  if p_min_gap is not null and exists (select 1 from public.shift_manager_backups where created_at > now() - p_min_gap) then
    return null;
  end if;
  v_state := coalesce(p_state, (select data from public.shift_manager_state where id = 'main'));
  if v_state is null then return null; end if;
  insert into public.shift_manager_backups (reason, state, leave_plans)
  values (p_reason, v_state, coalesce((select jsonb_agg(to_jsonb(t)) from public.leave_plans t), '[]'::jsonb))
  returning id into v_id;

  -- الاحتفاظ
  delete from public.shift_manager_backups where created_at < now() - interval '120 days';
  delete from public.shift_manager_backups b
   where b.created_at < now() - interval '7 days'
     and b.id <> (select max(x.id) from public.shift_manager_backups x
                  where date_trunc('day', x.created_at) = date_trunc('day', b.created_at));
  return v_id;
end $$;
revoke all on function public.sm_take_backup(text, jsonb, interval) from public, anon, authenticated;

-- قبل أي تعديل على بيانات التطبيق: نحفظ النسخة القديمة
create or replace function public.sm_backup_before_state_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data is distinct from new.data then
    perform public.sm_take_backup('auto', old.data);
  end if;
  return new;
end $$;
drop trigger if exists sm_backup_before_state_update on public.shift_manager_state;
create trigger sm_backup_before_state_update before update on public.shift_manager_state
  for each row execute function public.sm_backup_before_state_update();

-- بعد تغييرات خطة الإجازة
create or replace function public.sm_backup_after_plans_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sm_take_backup('auto');
  return null;
end $$;
drop trigger if exists sm_backup_after_plans_change on public.leave_plans;
create trigger sm_backup_after_plans_change after insert or update or delete on public.leave_plans
  for each statement execute function public.sm_backup_after_plans_change();

-- نسخة يدوية الحين (الأدمن)
create or replace function public.sm_backup_now() returns bigint
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.lp_is_admin() then raise exception 'not allowed'; end if;
  return public.sm_take_backup('manual', null, null);
end $$;
revoke all on function public.sm_backup_now() from public, anon;
grant execute on function public.sm_backup_now() to authenticated;

-- استرجاع نسخة (الأدمن): ياخذ نسخة من الوضع الحالي أول، بعدين يرجّع البيانات
-- p_with_plans = true يرجّع خطط الإجازة بعد
create or replace function public.sm_restore_backup(p_id bigint, p_with_plans boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b public.shift_manager_backups;
begin
  if not public.lp_is_admin() then raise exception 'not allowed'; end if;
  select * into b from public.shift_manager_backups where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public.sm_take_backup('before_restore', null, null);
  update public.shift_manager_state set data = b.state, updated_at = now() where id = 'main';
  if p_with_plans then
    delete from public.leave_plans;
    insert into public.leave_plans select * from jsonb_populate_recordset(null::public.leave_plans, b.leave_plans);
  end if;
  return jsonb_build_object('ok', true, 'restored_from', b.created_at);
end $$;
revoke all on function public.sm_restore_backup(bigint, boolean) from public, anon;
grant execute on function public.sm_restore_backup(bigint, boolean) to authenticated;

-- أول نسخة
select public.sm_take_backup('initial', null, null);
