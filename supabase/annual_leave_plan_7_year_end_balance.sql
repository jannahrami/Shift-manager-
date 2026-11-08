-- =========================================================
-- خطة الإجازة السنوية — أكتوبر / نوفمبر / ديسمبر:
--   اللي شهره 10 أو 11 أو 12 يختار عدد الشفتات بنفسه (من 1 إلى 5)
--   بشرط إن مجموع أيام إجازته يخلّي رصيده المتوقع للسنة 9 أيام أو أقل.
--   الرصيد المتوقع = (رصيده الحالي بحد أعلى 9) + 30 − إجازات السنة المدخلة مسبقًا
--   (نفس قاعدة التطبيق في ensureAnnualLeaveCredit و lpProjectedBalance)
-- شغّله بعد annual_leave_plan_6_deadline.sql — آمن لإعادة التشغيل
-- =========================================================

create or replace function public.lp_is_year_end(m int) returns boolean
language sql immutable as $$ select m between 10 and 12 $$;

create or replace function public.lp_required_shifts(m int) returns int
language sql immutable as $$ select case when m between 1 and 3 then 2 when m between 10 and 12 then 1 else 3 end $$;

create or replace function public.lp_max_shifts(m int) returns int
language sql immutable as $$ select case when m between 10 and 12 then 5 else 3 end $$;

-- رصيد الموظف المتوقع لسنة الخطة (بدون إجازات الخطة نفسها)
create or replace function public.lp_projected_balance(p_year int, p_emp text, p_exclude jsonb)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_data jsonb;
  v_bal  numeric;
  v_used numeric := 0;
  v_cur  int := extract(year from public.lp_today())::int;
  l jsonb;
begin
  select data into v_data from public.shift_manager_state where id = 'main';
  select coalesce(nullif(e->>'leaveBalance','')::numeric, 0) into v_bal
    from jsonb_array_elements(coalesce(v_data->'employees','[]'::jsonb)) e
   where e->>'id' = p_emp limit 1;
  if v_bal is null then return null; end if;
  for l in select x from jsonb_array_elements(coalesce(v_data->'leaves','[]'::jsonb)) x
           where x->>'employeeId' = p_emp
  loop
    if coalesce(p_exclude,'[]'::jsonb) ? (l->>'id') then
      -- إجازة الخطة نفسها: لو انخصمت من الرصيد الحالي نرجّعها
      if p_year <= v_cur then v_bal := v_bal + coalesce(nullif(l->>'balanceDaysCharged','')::numeric, 0); end if;
      continue;
    end if;
    if p_year > v_cur and (l->>'pendingChargeYear') = p_year::text then
      v_used := v_used + coalesce(nullif(l->>'pendingChargeDays','')::numeric,
                                  ((l->>'end')::date - (l->>'start')::date + 1));
    end if;
  end loop;
  if p_year > v_cur then
    return least(greatest(v_bal, 0), 9) + 30 * (p_year - v_cur) - v_used;
  end if;
  return v_bal;
end $$;
revoke all on function public.lp_projected_balance(int, text, jsonb) from public, anon, authenticated;

-- lp_get_plan: يضيف الرصيد المتوقع والأيام المطلوبة لأشهر نهاية السنة
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
  v_bal  numeric;
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
    if public.lp_is_year_end(v_plan.assigned_month) then
      v_bal := public.lp_projected_balance(v_link.year, v_link.employee_id, v_plan.leave_ids);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'year', v_link.year,
    'name', v_link.name,
    'badge', v_link.badge,
    'max_per_month', v_max,
    'is_open', coalesce(v_set.is_open, true) and (v_set.deadline is null or public.lp_today() <= v_set.deadline),
    'manual_closed', not coalesce(v_set.is_open, true),
    'deadline', v_set.deadline,
    'dates_deadline', v_set.dates_deadline,
    'dates_open', v_set.dates_deadline is null or public.lp_today() <= v_set.dates_deadline,
    'today', public.lp_today(),
    'plan', case when v_plan.employee_id is null then null else jsonb_build_object(
              'choice1', v_plan.choice1, 'choice2', v_plan.choice2, 'choice3', v_plan.choice3,
              'assigned_month', v_plan.assigned_month, 'status', v_plan.status,
              'admin_note', v_plan.admin_note, 'submitted_at', v_plan.submitted_at,
              'periods', v_plan.periods, 'dates_status', v_plan.dates_status, 'dates_note', v_plan.dates_note,
              'required_shifts', public.lp_required_shifts(v_plan.assigned_month),
              'max_shifts', public.lp_max_shifts(v_plan.assigned_month),
              'year_end', public.lp_is_year_end(v_plan.assigned_month),
              'balance', v_bal,
              'min_days', case when v_bal is null then null else greatest(v_bal - 9, 0) end) end,
    'full_months', coalesce((select jsonb_agg(month order by month)
                              from public.lp_month_counts(v_link.year, v_link.employee_id)
                              where n >= v_max), '[]'::jsonb),
    'load', v_load,
    'caps', jsonb_build_object('N', 6, 'A', 5, 'M', 5)
  );
end $$;

-- lp_submit_dates: لأشهر نهاية السنة لازم مجموع الأيام يخلّي الرصيد 9 أو أقل
create or replace function public.lp_submit_dates(p_token uuid, p_periods jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link  public.leave_plan_links;
  v_plan  public.leave_plans;
  v_min   int;
  v_maxs  int;
  v_total int := 0;
  v_days  int := 0;
  v_bal   numeric;
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
  perform pg_advisory_xact_lock(hashtext('leave_plan'), v_link.year);

  select * into v_plan from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;
  if v_plan.employee_id is null or v_plan.status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;
  if v_plan.dates_status = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'already_approved');
  end if;
  if coalesce(v_plan.dates_status,'') <> 'rejected' and exists (
       select 1 from public.leave_plan_settings s
        where s.year = v_link.year and s.dates_deadline is not null and public.lp_today() > s.dates_deadline) then
    return jsonb_build_object('ok', false, 'error', 'dates_closed');
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
    if public.lp_shift_idx(r.s) not in (0, 9, 18) or public.lp_shift_idx(r.e) not in (8, 17, 27) then
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
    v_days  := v_days + (r.e - r.s + 1);
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
  if public.lp_is_year_end(v_plan.assigned_month) then
    v_bal := public.lp_projected_balance(v_link.year, v_link.employee_id, v_plan.leave_ids);
    if v_bal is not null and v_bal - v_days > 9 then
      return jsonb_build_object('ok', false, 'error', 'balance_left', 'balance', v_bal,
                                'min_days', v_bal - 9, 'got_days', v_days);
    end if;
  end if;

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

grant execute on function public.lp_get_plan(uuid), public.lp_submit_dates(uuid,jsonb) to anon, authenticated;
