-- =========================================================
-- خطة الإجازة السنوية — المرحلة الثانية (تحديث):
--   عدد الشفتات: يناير–مارس حد أدنى شفتين (والأعلى 3) · أبريل–ديسمبر 3 شفتات
--   الحد الأعلى للمجازين في نفس اليوم (يشمل الموظف نفسه):
--     ليلي N = 6 · صباحي M / مسائي A = 5
-- شغّله بعد annual_leave_plan_2_dates.sql — آمن لإعادة التشغيل
-- =========================================================

create or replace function public.lp_required_shifts(m int) returns int
language sql immutable as $$ select case when m between 1 and 3 then 2 else 3 end $$;

create or replace function public.lp_max_shifts(m int) returns int
language sql immutable as $$ select 3 $$;

-- الحد حسب نوع الشفت في اليوم (null = راحة)
create or replace function public.lp_day_cap(d date) returns int
language sql immutable as $$
  select case when public.lp_shift_idx(d) between 0 and 6 then 6
              when public.lp_shift_idx(d) between 9 and 15 or public.lp_shift_idx(d) between 18 and 24 then 5
              else null end
$$;

-- عدد الموظفين المجازين (غير الموظف نفسه) في كل يوم من الفترة — أعداد فقط بدون أسماء
create or replace function public.lp_day_load(p_year int, p_exclude text, p_from date, p_to date)
returns table (day date, n int)
language sql stable security definer set search_path = public as $$
  with ranges as (
    select coalesce(l->>'employeeId','') as emp, (l->>'start')::date as s, (l->>'end')::date as e
    from public.shift_manager_state st, jsonb_array_elements(coalesce(st.data->'leaves','[]'::jsonb)) l
    where st.id = 'main'
      and coalesce(l->>'employeeId','') <> p_exclude
      and coalesce(l->>'start','') ~ '^\d{4}-\d{2}-\d{2}$'
      and coalesce(l->>'end','')   ~ '^\d{4}-\d{2}-\d{2}$'
      and (l->>'end') >= p_from::text and (l->>'start') <= p_to::text
    union all
    select lp.employee_id, (p->>'start')::date, (p->>'end')::date
    from public.leave_plans lp, jsonb_array_elements(coalesce(lp.periods,'[]'::jsonb)) p
    where lp.year = p_year and lp.employee_id <> p_exclude and lp.dates_status = 'submitted'
  )
  select g::date, count(distinct emp)::int
  from ranges, generate_series(greatest(s, p_from), least(e, p_to), interval '1 day') g
  where e >= s
  group by 1
$$;
revoke all on function public.lp_day_load(int, text, date, date) from public, anon, authenticated;

create or replace function public.lp_get_plan(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_link public.leave_plan_links;
  v_set  public.leave_plan_settings;
  v_plan public.leave_plans;
  v_max  int;
  v_load jsonb := '[]'::jsonb;
  v_from date;
begin
  select * into v_link from public.leave_plan_links where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;
  select * into v_set from public.leave_plan_settings where year = v_link.year;
  v_max := coalesce(v_set.max_per_month, 6);
  select * into v_plan from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;

  if v_plan.status = 'approved' then
    v_from := make_date(v_link.year, v_plan.assigned_month, 1) - 7;
    select coalesce(jsonb_agg(jsonb_build_object('d', day::text, 'n', n) order by day), '[]'::jsonb) into v_load
    from public.lp_day_load(v_link.year, v_link.employee_id, v_from, (v_from + 7 + interval '2 months' + interval '14 days')::date);
  end if;

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
              'admin_note', v_plan.admin_note, 'submitted_at', v_plan.submitted_at,
              'periods', v_plan.periods, 'dates_status', v_plan.dates_status, 'dates_note', v_plan.dates_note,
              'required_shifts', public.lp_required_shifts(v_plan.assigned_month),
              'max_shifts', public.lp_max_shifts(v_plan.assigned_month)) end,
    'full_months', coalesce((select jsonb_agg(month order by month)
                              from public.lp_month_counts(v_link.year, v_link.employee_id)
                              where n >= v_max), '[]'::jsonb),
    'load', v_load,
    'caps', jsonb_build_object('N', 6, 'A', 5, 'M', 5)
  );
end $$;

create or replace function public.lp_submit_dates(p_token uuid, p_periods jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_link  public.leave_plan_links;
  v_plan  public.leave_plans;
  v_min   int;
  v_maxs  int;
  v_total int := 0;
  v_blocks int;
  v_clean jsonb := '[]'::jsonb;
  v_prev_end date;
  v_first date;
  v_last date;
  v_mstart date;
  v_mlimit date;
  v_full record;
  r record;
begin
  select * into v_link from public.leave_plan_links where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_link'); end if;
  -- قفل: الطلبات تنعالج وحدة وحدة، فأول من يرسل ياخذ المكان
  perform pg_advisory_xact_lock(hashtext('leave_plan'), v_link.year);

  select * into v_plan from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;
  if v_plan.employee_id is null or v_plan.status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;
  if v_plan.dates_status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;

  if jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) not between 1 and 2 then
    return jsonb_build_object('ok', false, 'error', 'bad_periods');
  end if;
  if exists (select 1 from jsonb_array_elements(p_periods) x
             where jsonb_typeof(x) <> 'object'
                or coalesce(x->>'start','') !~ '^\d{4}-\d{2}-\d{2}$'
                or coalesce(x->>'end','')   !~ '^\d{4}-\d{2}-\d{2}$') then
    return jsonb_build_object('ok', false, 'error', 'bad_periods');
  end if;
  begin
    perform (x->>'start')::date, (x->>'end')::date from jsonb_array_elements(p_periods) x;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'bad_periods');
  end;

  v_min    := public.lp_required_shifts(v_plan.assigned_month);
  v_maxs   := public.lp_max_shifts(v_plan.assigned_month);
  v_mstart := make_date(v_link.year, v_plan.assigned_month, 1);
  v_mlimit := (v_mstart + interval '2 months' - interval '1 day')::date;

  for r in select (x->>'start')::date s, (x->>'end')::date e
           from jsonb_array_elements(p_periods) x order by (x->>'start')::date
  loop
    if r.e < r.s or r.e - r.s > 60 then return jsonb_build_object('ok', false, 'error', 'bad_periods'); end if;
    if public.lp_shift_idx(r.s) not in (0, 9, 18) or public.lp_shift_idx(r.e) not in (6, 15, 24) then
      return jsonb_build_object('ok', false, 'error', 'not_shift_aligned');
    end if;
    if v_prev_end is not null and r.s <= v_prev_end then
      return jsonb_build_object('ok', false, 'error', 'overlap');
    end if;
    if r.s < v_mstart or r.s > v_mlimit then
      return jsonb_build_object('ok', false, 'error', 'bad_month');
    end if;
    select count(*) into v_blocks from generate_series(r.s, r.e, interval '1 day') g
      where public.lp_shift_idx(g::date) in (0, 9, 18);
    v_total := v_total + v_blocks;
    v_first := coalesce(v_first, r.s);
    v_prev_end := r.e;
    v_last := r.e;
    v_clean := v_clean || jsonb_build_object('start', r.s::text, 'end', r.e::text);
  end loop;

  if extract(month from v_first) <> v_plan.assigned_month or extract(year from v_first) <> v_link.year then
    return jsonb_build_object('ok', false, 'error', 'bad_month');
  end if;
  if v_total < v_min or v_total > v_maxs then
    return jsonb_build_object('ok', false, 'error', 'wrong_count', 'required', v_min, 'max', v_maxs, 'got', v_total);
  end if;

  -- الحد حسب الشفت: ليلي 6 · صباحي/مسائي 5 (يشمل الموظف نفسه)
  select l.day, l.n, public.lp_day_cap(l.day) as cap into v_full
  from public.lp_day_load(v_link.year, v_link.employee_id, v_first, v_last) l
  where public.lp_day_cap(l.day) is not null
    and l.n >= public.lp_day_cap(l.day)
    and exists (select 1 from jsonb_array_elements(v_clean) p
                where l.day between (p->>'start')::date and (p->>'end')::date)
  order by l.day limit 1;
  if v_full.day is not null then
    return jsonb_build_object('ok', false, 'error', 'shift_full', 'date', v_full.day::text, 'cap', v_full.cap);
  end if;

  update public.leave_plans
     set periods = v_clean, dates_status = 'submitted', dates_note = '', dates_submitted_at = now(), updated_at = now()
   where year = v_link.year and employee_id = v_link.employee_id;

  return jsonb_build_object('ok', true, 'periods', v_clean);
end $$;

revoke all on function public.lp_submit_dates(uuid, jsonb) from public;
grant execute on function public.lp_submit_dates(uuid, jsonb) to anon, authenticated;
