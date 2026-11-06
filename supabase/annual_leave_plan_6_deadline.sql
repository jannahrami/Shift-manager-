-- =========================================================
-- خطة الإجازة — المرحلة 6: آخر موعد للتسليم + تتبّع التذكير
-- deadline        = آخر يوم لاختيار الأشهر (شامل، بتوقيت الرياض)
-- dates_deadline  = آخر يوم لتحديد التواريخ
-- بعد الموعد يقفل الاستقبال تلقائيًا، إلا للمرفوضين (يقدرون يعدّلون).
-- reminded_at     = آخر مرة أرسل المشرف تذكير للموظف
-- آمن لإعادة التشغيل
-- =========================================================
alter table public.leave_plan_settings add column if not exists deadline date;
alter table public.leave_plan_settings add column if not exists dates_deadline date;
alter table public.leave_plan_links    add column if not exists reminded_at timestamptz;

create or replace function public.lp_today() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

-- lp_get_plan: يرجّع المواعيد، و is_open يصير مقفل تلقائيًا بعد الموعد
do $$
declare d text;
begin
  select pg_get_functiondef('public.lp_get_plan(uuid)'::regprocedure) into d;
  if position('deadline' in d) = 0 then
    d := replace(d, $r$'is_open', coalesce(v_set.is_open, true),$r$,
      $r$'is_open', coalesce(v_set.is_open, true) and (v_set.deadline is null or public.lp_today() <= v_set.deadline),
    'manual_closed', not coalesce(v_set.is_open, true),
    'deadline', v_set.deadline,
    'dates_deadline', v_set.dates_deadline,
    'dates_open', v_set.dates_deadline is null or public.lp_today() <= v_set.dates_deadline,
    'today', public.lp_today(),$r$);
    execute d;
  end if;
end $$;

-- lp_submit_plan: يرفض بعد الموعد (إلا المرفوض)
do $$
declare d text;
begin
  select pg_get_functiondef('public.lp_submit_plan(uuid,int,int,int)'::regprocedure) into d;
  if position('deadline' in d) = 0 then
    d := replace(d, $r$if v_set.year is not null and not v_set.is_open and coalesce(v_old.status,'') <> 'rejected' then$r$,
      $r$if v_set.year is not null and coalesce(v_old.status,'') <> 'rejected'
     and (not v_set.is_open or (v_set.deadline is not null and public.lp_today() > v_set.deadline)) then$r$);
    execute d;
  end if;
end $$;

-- lp_submit_dates: يرفض بعد موعد التواريخ (إلا لو التواريخ مرفوضة)
do $$
declare d text;
begin
  select pg_get_functiondef('public.lp_submit_dates(uuid,jsonb)'::regprocedure) into d;
  if position('dates_deadline' in d) = 0 then
    d := replace(d, $r$    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;
$r$, $r$    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;
  if coalesce(v_plan.dates_status,'') <> 'rejected' and exists (
       select 1 from public.leave_plan_settings s
        where s.year = v_link.year and s.dates_deadline is not null and public.lp_today() > s.dates_deadline) then
    return jsonb_build_object('ok', false, 'error', 'dates_closed');
  end if;
$r$);
    execute d;
  end if;
end $$;

grant execute on function public.lp_get_plan(uuid), public.lp_submit_plan(uuid,int,int,int), public.lp_submit_dates(uuid,jsonb) to anon, authenticated;
