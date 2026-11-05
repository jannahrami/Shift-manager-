-- =========================================================
-- خطة الإجازة السنوية — المرحلة الثانية: تحديد التواريخ
-- بعد اعتماد الشهر، الموظف يختار شفتات كاملة من تقويم الشفت:
--   يناير–أبريل: شفتين · مايو–ديسمبر: 3 شفتات · يقدر يقسمها لفترتين
--   أول شفت يبدأ في الشهر المعتمد، والباقي ممكن يمتد للشهر اللي بعده
-- شغّله بعد annual_leave_plan.sql — آمن لإعادة التشغيل
-- =========================================================

alter table public.leave_plans add column if not exists periods            jsonb;
alter table public.leave_plans add column if not exists dates_status       text;
alter table public.leave_plans add column if not exists dates_note         text not null default '';
alter table public.leave_plans add column if not exists dates_submitted_at timestamptz;
alter table public.leave_plans add column if not exists leave_ids          jsonb not null default '[]'::jsonb;
alter table public.leave_plans drop constraint if exists leave_plans_dates_status_check;
alter table public.leave_plans add constraint leave_plans_dates_status_check
  check (dates_status is null or dates_status in ('submitted','approved','rejected'));

-- دورة شفت Group A (نفس SHIFT_ANCHOR و SHIFT_CYCLE في index.html):
-- 28 يوم: ليلي 0–6 · راحة 7–8 · مسائي 9–15 · راحة 16–17 · صباحي 18–24 · راحة 25–27
create or replace function public.lp_shift_idx(d date) returns int
language sql immutable as $$ select (((d - date '2026-08-30') % 28) + 28) % 28 $$;

create or replace function public.lp_required_shifts(m int) returns int
language sql immutable as $$ select case when m between 1 and 4 then 2 else 3 end $$;

-- صفحة الموظف: نضيف بيانات المرحلة الثانية + فترات الزملاء (بدون أسماء)
create or replace function public.lp_get_plan(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_link public.leave_plan_links;
  v_set  public.leave_plan_settings;
  v_plan public.leave_plans;
  v_max  int;
  v_taken jsonb := '[]'::jsonb;
begin
  select * into v_link from public.leave_plan_links where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_link');
  end if;
  select * into v_set from public.leave_plan_settings where year = v_link.year;
  v_max := coalesce(v_set.max_per_month, 6);
  select * into v_plan from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;

  if v_plan.status = 'approved' then
    select coalesce(jsonb_agg(jsonb_build_object('start', s, 'end', e)), '[]'::jsonb) into v_taken
    from (
      select (l->>'start') as s, (l->>'end') as e
      from public.shift_manager_state st, jsonb_array_elements(coalesce(st.data->'leaves','[]'::jsonb)) l
      where st.id = 'main'
        and coalesce(l->>'employeeId','') <> v_link.employee_id
        and coalesce(l->>'start','') ~ '^\d{4}-\d{2}-\d{2}$'
        and coalesce(l->>'end','')   ~ '^\d{4}-\d{2}-\d{2}$'
        and (l->>'end')   >= make_date(v_link.year, 1, 1)::text
        and (l->>'start') <= make_date(v_link.year + 1, 1, 31)::text
      union all
      select p->>'start', p->>'end'
      from public.leave_plans lp, jsonb_array_elements(coalesce(lp.periods,'[]'::jsonb)) p
      where lp.year = v_link.year and lp.employee_id <> v_link.employee_id and lp.dates_status = 'submitted'
    ) t;
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
              'required_shifts', public.lp_required_shifts(v_plan.assigned_month)) end,
    'full_months', coalesce((select jsonb_agg(month order by month)
                              from public.lp_month_counts(v_link.year, v_link.employee_id)
                              where n >= v_max), '[]'::jsonb),
    'taken', v_taken
  );
end $$;

-- إرسال التواريخ
create or replace function public.lp_submit_dates(p_token uuid, p_periods jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_link  public.leave_plan_links;
  v_plan  public.leave_plans;
  v_req   int;
  v_total int := 0;
  v_blocks int;
  v_clean jsonb := '[]'::jsonb;
  v_prev_end date;
  v_first date;
  v_mstart date;
  v_mlimit date;
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

  v_req    := public.lp_required_shifts(v_plan.assigned_month);
  v_mstart := make_date(v_link.year, v_plan.assigned_month, 1);
  v_mlimit := (v_mstart + interval '2 months' - interval '1 day')::date;  -- نهاية الشهر اللي بعده

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
    v_clean := v_clean || jsonb_build_object('start', r.s::text, 'end', r.e::text);
  end loop;

  if extract(month from v_first) <> v_plan.assigned_month or extract(year from v_first) <> v_link.year then
    return jsonb_build_object('ok', false, 'error', 'bad_month');
  end if;
  if v_total <> v_req then
    return jsonb_build_object('ok', false, 'error', 'wrong_count', 'required', v_req, 'got', v_total);
  end if;

  update public.leave_plans
     set periods = v_clean, dates_status = 'submitted', dates_note = '', dates_submitted_at = now(), updated_at = now()
   where year = v_link.year and employee_id = v_link.employee_id;

  return jsonb_build_object('ok', true, 'periods', v_clean);
end $$;

revoke all on function public.lp_submit_dates(uuid, jsonb) from public;
grant execute on function public.lp_submit_dates(uuid, jsonb) to anon, authenticated;
