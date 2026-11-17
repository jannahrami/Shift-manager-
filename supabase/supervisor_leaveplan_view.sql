-- =========================================================
-- رابط السوبرفايزر لصفحة خطة الإجازة (للعرض فقط).
-- نفس جدول sm_share_links بس بنوع (scope) = 'leaveplan'.
-- رابط المؤشرات ما يفتح خطة الإجازة، ورابط خطة الإجازة ما يفتح المؤشرات.
-- ما يرجع: روابط الموظفين، الجوالات، الأرصدة، الملاحظات.
-- آمن لإعادة التشغيل
-- =========================================================
alter table public.sm_share_links add column if not exists scope text not null default 'insights';
alter table public.sm_share_links drop constraint if exists sm_share_links_scope_chk;
alter table public.sm_share_links add constraint sm_share_links_scope_chk check (scope in ('insights','leaveplan'));

create or replace function public.sm_supervisor_view(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.sm_share_links;
  v_data jsonb;
  v_marine jsonb;
  v_year int := extract(year from (now() at time zone 'Asia/Riyadh'))::int;
begin
  select * into v_link from public.sm_share_links where token = p_token and not revoked and scope = 'insights';
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_link'); end if;
  update public.sm_share_links set last_seen = now() where token = p_token;

  select data into v_data from public.shift_manager_state where id = 'main';
  select value into v_marine from public.shift_manager_config where key = 'marine_id_expiry';
  v_marine := coalesce(v_marine, '{}'::jsonb);

  return jsonb_build_object(
    'ok', true,
    'today', (now() at time zone 'Asia/Riyadh')::date,
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->>'id',
        'name', coalesce(nullif(e->>'nameAr',''), e->>'name'),
        'empId', e->>'empId',
        'leaveBalance', e->'leaveBalance',
        'marineIdExpiry', coalesce(nullif(e->>'marineIdExpiry',''), v_marine->>(e->>'empId'))))
      from jsonb_array_elements(coalesce(v_data->'employees','[]'::jsonb)) e), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeId', l->>'employeeId',
        'start', l->>'start',
        'end', l->>'end',
        'course', coalesce(l->>'note','') ~* '(cour|coure|دورة|تدريب|training)',
        'pending', (l ? 'pendingChargeYear') and coalesce(l->>'pendingChargeYear','') <> ''))
      from jsonb_array_elements(coalesce(v_data->'leaves','[]'::jsonb)) l), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_object_agg(y::text, coalesce((
        select jsonb_agg(jsonb_build_object('employee_id', p.employee_id, 'name', p.name, 'assigned_month', p.assigned_month))
        from public.leave_plans p
        where p.year = y and p.status = 'approved' and coalesce(p.dates_status,'') <> 'approved'), '[]'::jsonb))
      from generate_series(v_year, v_year + 1) y), '{}'::jsonb),
    'plan_max', (select jsonb_object_agg(year::text, max_per_month) from public.leave_plan_settings where year between v_year and v_year + 1)
  );
end $$;
revoke all on function public.sm_supervisor_view(uuid) from public;
grant execute on function public.sm_supervisor_view(uuid) to anon, authenticated;


create or replace function public.sm_leaveplan_view(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  v_year int;
  v_set public.leave_plan_settings;
begin
  if not exists (select 1 from public.sm_share_links where token = p_token and not revoked and scope = 'leaveplan') then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;
  update public.sm_share_links set last_seen = now() where token = p_token;
  v_year := extract(year from v_today)::int + case when extract(month from v_today) >= 10 then 1 else 0 end;
  select * into v_set from public.leave_plan_settings where year = v_year;
  select data into v_data from public.shift_manager_state where id = 'main';

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'year', v_year,
    'max', coalesce(v_set.max_per_month, 6),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->>'id',
        'name', coalesce(nullif(e->>'nameAr',''), e->>'name'),
        'badge', coalesce(e->>'empId','')))
      from jsonb_array_elements(coalesce(v_data->'employees','[]'::jsonb)) e), '[]'::jsonb),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', l.employee_id, 'name', l.name, 'badge', l.badge))
      from public.leave_plan_links l where l.year = v_year), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', p.employee_id, 'choice1', p.choice1, 'choice2', p.choice2, 'choice3', p.choice3,
        'assigned_month', p.assigned_month, 'status', p.status,
        'periods', p.periods, 'dates_status', p.dates_status))
      from public.leave_plans p where p.year = v_year), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object('employeeId', l->>'employeeId', 'start', l->>'start', 'end', l->>'end',
        'course', coalesce(l->>'note','') ~* '(cour|coure|دورة|تدريب|training)'))
      from jsonb_array_elements(coalesce(v_data->'leaves','[]'::jsonb)) l
      where coalesce(l->>'end','') >= (v_year - 1)::text || '-01-01' and coalesce(l->>'start','') <= (v_year - 1)::text || '-12-31'), '[]'::jsonb)
  );
end $$;
revoke all on function public.sm_leaveplan_view(uuid) from public;
grant execute on function public.sm_leaveplan_view(uuid) to anon, authenticated;
