-- =========================================================
-- قفل بيانات البرنامج: القراءة والتعديل للأدمن فقط، وحساب Guest قراءة فقط.
-- قبل: أي حساب مسجّل (حتى لو أحد سجّل حساب جديد) يقدر يقرأ ويعدّل.
-- آمن لإعادة التشغيل
-- =========================================================
drop policy if exists "Authenticated users can read"   on public.shift_manager_state;
drop policy if exists "Authenticated users can insert" on public.shift_manager_state;
drop policy if exists "Authenticated users can update" on public.shift_manager_state;
drop policy if exists sm_state_read   on public.shift_manager_state;
drop policy if exists sm_state_insert on public.shift_manager_state;
drop policy if exists sm_state_update on public.shift_manager_state;
create policy sm_state_read on public.shift_manager_state for select to authenticated
  using (public.lp_is_admin() or lower(coalesce(auth.jwt()->>'email','')) = 'guest@shiftmanager.app');
create policy sm_state_insert on public.shift_manager_state for insert to authenticated with check (public.lp_is_admin());
create policy sm_state_update on public.shift_manager_state for update to authenticated using (public.lp_is_admin()) with check (public.lp_is_admin());
revoke all on public.shift_manager_state from anon;
