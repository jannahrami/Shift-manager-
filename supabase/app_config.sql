-- =========================================================
-- إعدادات البرنامج الحساسة (تواريخ Marine ID، قوائم الصلاحيات)
-- محفوظة هنا بدل الكود العام. القراءة للأدمن و Guest، التعديل للأدمن.
-- القيم نفسها تنضاف من Supabase مباشرة (ما تنحفظ في المستودع).
-- =========================================================
create table if not exists public.shift_manager_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shift_manager_config enable row level security;
drop policy if exists smc_read on public.shift_manager_config;
drop policy if exists smc_write on public.shift_manager_config;
create policy smc_read on public.shift_manager_config for select to authenticated
  using (public.lp_is_admin() or lower(coalesce(auth.jwt()->>'email','')) = 'guest@shiftmanager.app');
create policy smc_write on public.shift_manager_config for all to authenticated
  using (public.lp_is_admin()) with check (public.lp_is_admin());
revoke all on public.shift_manager_config from anon;
-- keys: 'marine_id_expiry' = {"badge":"YYYY-MM-DD",...}
--       'access_groups'    = [{id,title,icon,badges:[...],names:{badge:name}}, ...]
