-- =========================================================
-- رابط السوبرفايزر: صفحة مؤشرات للقراءة فقط بدون تسجيل دخول.
-- الرابط فيه token؛ الأدمن يسوي الرابط أو يلغيه.
-- البيانات اللي ترجع: الاسم، الرقم الوظيفي، الرصيد، تاريخ Marine،
-- الإجازات (بداية/نهاية/هل هي دورة)، أشهر خطة الإجازة المعتمدة.
-- ما ترجع: الجوالات، الملاحظات، أي شي ثاني.
-- آمن لإعادة التشغيل
-- =========================================================
create table if not exists public.sm_share_links (
  token uuid primary key default gen_random_uuid(),
  label text not null default '',
  created_at timestamptz not null default now(),
  revoked boolean not null default false,
  last_seen timestamptz
);
alter table public.sm_share_links enable row level security;
drop policy if exists sm_share_admin on public.sm_share_links;
create policy sm_share_admin on public.sm_share_links for all to authenticated
  using (public.lp_is_admin()) with check (public.lp_is_admin());
revoke all on public.sm_share_links from anon;

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
  select * into v_link from public.sm_share_links where token = p_token and not revoked;
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
