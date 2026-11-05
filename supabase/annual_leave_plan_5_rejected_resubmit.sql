-- =========================================================
-- خطة الإجازة السنوية — تحديث: الموظف اللي انرفضت خطته يقدر يعيد الاختيار
-- حتى لو المشرف قفل استقبال الخطط
-- آمن لإعادة التشغيل
-- =========================================================

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

  select * into v_old from public.leave_plans where year = v_link.year and employee_id = v_link.employee_id;
  select * into v_set from public.leave_plan_settings where year = v_link.year;
  -- الاستقبال المقفل ما يمنع اللي انرفضت خطته من إعادة الاختيار
  if v_set.year is not null and not v_set.is_open and coalesce(v_old.status,'') <> 'rejected' then
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
