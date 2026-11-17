-- =========================================================
-- «إرجاع للانتظار» صار يخلي التواريخ. لو الموظف بعدها غيّر شهره
-- من رابطه، التواريخ القديمة تنمسح (لأنها لشهر ثاني).
-- آمن لإعادة التشغيل
-- =========================================================
create or replace function public.lp_clear_dates_on_month_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.assigned_month is distinct from old.assigned_month
     and coalesce(old.dates_status,'') <> 'approved' then
    new.periods := null; new.dates_status := null; new.dates_note := ''; new.dates_submitted_at := null;
  end if;
  return new;
end $$;
drop trigger if exists lp_clear_dates_on_month_change on public.leave_plans;
create trigger lp_clear_dates_on_month_change before update of assigned_month on public.leave_plans
  for each row execute function public.lp_clear_dates_on_month_change();
