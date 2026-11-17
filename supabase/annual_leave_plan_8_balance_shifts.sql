-- =========================================================
-- خطة الإجازة — المرحلة 8: الحد الأدنى للشفتات حسب الرصيد
--   يناير إلى أبريل: شفتين على الأقل،
--     إلا اللي مجموع رصيده للسنة 35 يوم أو أكثر → لازم 3 شفتات.
--   مجموع الرصيد للسنة = (رصيده الحالي بحد أعلى 9) + 30، بدون خصم شي.
--   مايو إلى سبتمبر: 3 شفتات. أكتوبر إلى ديسمبر: من 1 (بدون تغيير).
-- شغّله بعد annual_leave_plan_7_year_end_balance.sql — آمن لإعادة التشغيل
-- =========================================================

create or replace function public.lp_total_balance(p_year int, p_emp text)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  v_bal numeric;
  v_cur int := extract(year from public.lp_today())::int;
begin
  select coalesce(nullif(e->>'leaveBalance','')::numeric, 0) into v_bal
    from public.shift_manager_state s, jsonb_array_elements(coalesce(s.data->'employees','[]'::jsonb)) e
   where s.id = 'main' and e->>'id' = p_emp limit 1;
  if v_bal is null then return null; end if;
  if p_year > v_cur then return least(greatest(v_bal, 0), 9) + 30 * (p_year - v_cur); end if;
  return v_bal;
end $$;
revoke all on function public.lp_total_balance(int, text) from public, anon, authenticated;

create or replace function public.lp_required_shifts(p_year int, p_emp text, m int)
returns int
language sql stable security definer set search_path = public as $$
  select case
    when m between 1 and 4 then case when coalesce(public.lp_total_balance(p_year, p_emp), 0) >= 35 then 3 else 2 end
    when m between 10 and 12 then 1
    else 3 end
$$;
revoke all on function public.lp_required_shifts(int, text, int) from public, anon, authenticated;

-- النسخة القديمة (بالشهر بس) تبقى للتوافق: أبريل صار شفتين
create or replace function public.lp_required_shifts(m int) returns int
language sql immutable as $$ select case when m between 1 and 4 then 2 when m between 10 and 12 then 1 else 3 end $$;

-- lp_get_plan و lp_submit_dates يستخدمون النسخة اللي تعرف الرصيد
do $$
declare d text; f text;
begin
  foreach f in array array['public.lp_get_plan(uuid)','public.lp_submit_dates(uuid,jsonb)'] loop
    select pg_get_functiondef(f::regprocedure) into d;
    if position('lp_required_shifts(v_plan.assigned_month)' in d) > 0 then
      d := replace(d, 'lp_required_shifts(v_plan.assigned_month)', 'lp_required_shifts(v_link.year, v_link.employee_id::text, v_plan.assigned_month)');
      execute d;
    end if;
  end loop;
end $$;
