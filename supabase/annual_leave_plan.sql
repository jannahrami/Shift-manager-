-- =========================================================
-- خطة الإجازة السنوية — Annual Leave Plan (اختيار الشهر)
-- كل موظف يختار 3 أشهر بالترتيب: الخيار الأول، الثاني، الثالث.
-- الخيار الأول هو اللي يحجز، والشهر يمتلئ عند الحد (افتراضي 6).
-- شغّل هذا الملف مرة وحدة في Supabase → SQL Editor → Run
-- آمن لإعادة التشغيل (ما يحذف بيانات موجودة)
-- =========================================================

-- 1) الإعدادات لكل سنة
create table if not exists public.leave_plan_settings (
  year           int primary key,
  max_per_month  int not null default 6 check (max_per_month between 1 and 60),
  is_open        boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- 2) رابط شخصي لكل موظف (token سري)
create table if not exists public.leave_plan_links (
  token        uuid primary key default gen_random_uuid(),
  year         int  not null,
  employee_id  text not null,
  badge        text not null default '',
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (year, employee_id)
);

-- 3) الخطط — خطة وحدة لكل موظف في السنة
--    assigned_month = الشهر المحجوز (يبدأ = الخيار الأول، والأدمن يقدر ينقله للثاني أو الثالث)
create table if not exists public.leave_plans (
  year            int  not null,
  employee_id     text not null,
  badge           text not null default '',
  name            text not null,
  choice1         int  not null check (choice1 between 1 and 12),
  choice2         int  not null check (choice2 between 1 and 12),
  choice3         int  not null check (choice3 between 1 and 12),
  assigned_month  int  not null check (assigned_month between 1 and 12),
  status          text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  admin_note      text not null default '',
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (year, employee_id),
  check (choice1 <> choice2 and choice1 <> choice3 and choice2 <> choice3)
);

alter table public.leave_plan_settings enable row level security;
alter table public.leave_plan_links    enable row level security;
alter table public.leave_plans         enable row level security;

-- الأدمن فقط يقرأ ويعدّل الجداول مباشرة. الموظفين يوصلون عبر الدوال تحت فقط.
create or replace function public.lp_is_admin() returns boolean
language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt()->>'email','')) = 'jannahrami@yahoo.com'
$$;

drop policy if exists lp_settings_admin on public.leave_plan_settings;
create policy lp_settings_admin on public.leave_plan_settings
  for all to authenticated using (public.lp_is_admin()) with check (public.lp_is_admin());

drop policy if exists lp_links_admin on public.leave_plan_links;
create policy lp_links_admin on public.leave_plan_links
  for all to authenticated using (public.lp_is_admin()) with check (public.lp_is_admin());

drop policy if exists lp_plans_admin on public.leave_plans;
create policy lp_plans_admin on public.leave_plans
  for all to authenticated using (public.lp_is_admin()) with check (public.lp_is_admin());

revoke all on public.leave_plan_settings, public.leave_plan_links, public.leave_plans from anon;

-- 4) عدد المحجوزين في كل شهر (بدون أسماء)، مع استثناء الموظف نفسه
create or replace function public.lp_month_counts(p_year int, p_exclude_employee text)
returns table (month int, n int)
language sql stable security definer set search_path = public as $$
  select assigned_month, count(*)::int
  from public.leave_plans
  where year = p_year and status <> 'rejected' and employee_id <> p_exclude_employee
  group by assigned_month
$$;
revoke all on function public.lp_month_counts(int, text) from public, anon, authenticated;

-- 5) يفتح صفحة الموظف: بياناته + خطته + الأشهر الممتلئة
create or replace function public.lp_get_plan(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_link public.leave_plan_links;
  v_set  public.leave_plan_settings;
  v_plan public.leave_plans;
  v_max  int;
begin
  select * into v_link from public.leave_plan_links where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;
  select * into v_set from public.leave_plan_settings where year = v_link.year;
  v_max := coalesce(v_set.max_per_month, 6);
  select * into v_plan from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;

  return jsonb_build_object(
    'ok', true,
    'year', v_link.year,
    'name', v_link.name,
    'badge', v_link.badge,
    'max_per_month', v_max,
    'is_open', coalesce(v_set.is_open, true),
    'plan', case when v_plan.employee_id is null then null else jsonb_build_object(
              'choice1', v_plan.choice1, 'choice2', v_plan.choice2, 'choice3', v_plan.choice3,
              'assigned_month', v_plan.assigned_month, 'status', v_plan.status,
              'admin_note', v_plan.admin_note, 'submitted_at', v_plan.submitted_at) end,
    'full_months', coalesce((select jsonb_agg(month order by month)
                              from public.lp_month_counts(v_link.year, v_link.employee_id)
                              where n >= v_max), '[]'::jsonb)
  );
end $$;

-- 6) إرسال الخطة — أول من يرسل يحجز الخيار الأول. يرفض إذا الشهر ممتلئ.
create or replace function public.lp_submit_plan(p_token uuid, p_choice1 int, p_choice2 int, p_choice3 int)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_link public.leave_plan_links;
  v_set  public.leave_plan_settings;
  v_old  public.leave_plans;
  v_max  int;
  v_n    int;
begin
  select * into v_link from public.leave_plan_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_link'); end if;

  -- قفل على مستوى السنة: الطلبات تنعالج وحدة وحدة، فأول واحد يرسل هو اللي يحجز
  perform pg_advisory_xact_lock(hashtext('leave_plan'), v_link.year);

  select * into v_set from public.leave_plan_settings where year = v_link.year;
  if v_set.year is not null and not v_set.is_open then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  v_max := coalesce(v_set.max_per_month, 6);

  if p_choice1 is null or p_choice2 is null or p_choice3 is null
     or p_choice1 not between 1 and 12 or p_choice2 not between 1 and 12 or p_choice3 not between 1 and 12 then
    return jsonb_build_object('ok', false, 'error', 'bad_choices');
  end if;
  if p_choice1 = p_choice2 or p_choice1 = p_choice3 or p_choice2 = p_choice3 then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  select * into v_old from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;
  if v_old.status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;

  select coalesce(n, 0) into v_n
  from public.lp_month_counts(v_link.year, v_link.employee_id) where month = p_choice1;
  v_n := coalesce(v_n, 0);

  if v_n >= v_max then
    return jsonb_build_object('ok', false, 'error', 'full', 'month', p_choice1, 'max_per_month', v_max,
      'full_months', coalesce((select jsonb_agg(month order by month)
                                from public.lp_month_counts(v_link.year, v_link.employee_id)
                                where n >= v_max), '[]'::jsonb));
  end if;

  insert into public.leave_plans (year, employee_id, badge, name, choice1, choice2, choice3, assigned_month, status)
  values (v_link.year, v_link.employee_id, v_link.badge, v_link.name, p_choice1, p_choice2, p_choice3, p_choice1, 'submitted')
  on conflict (year, employee_id) do update
    set choice1 = excluded.choice1, choice2 = excluded.choice2, choice3 = excluded.choice3,
        assigned_month = excluded.assigned_month, status = 'submitted',
        badge = excluded.badge, name = excluded.name, admin_note = '', updated_at = now();

  return jsonb_build_object('ok', true, 'choice1', p_choice1, 'choice2', p_choice2, 'choice3', p_choice3);
end $$;

revoke all on function public.lp_get_plan(uuid)                    from public;
revoke all on function public.lp_submit_plan(uuid, int, int, int)  from public;
grant execute on function public.lp_get_plan(uuid)                    to anon, authenticated;
grant execute on function public.lp_submit_plan(uuid, int, int, int)  to anon, authenticated;
