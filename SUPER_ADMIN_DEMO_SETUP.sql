-- Run after creating user in Supabase Auth:
-- Email: demo.superadmin@crmleads.app
-- Password: Demo@12345

begin;

insert into public.crm_users (id, email, full_name, role)
select
  au.id,
  au.email,
  coalesce(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    'Demo Super Admin'
  ),
  'super_admin'
from auth.users au
where lower(au.email) = lower('demo.superadmin@crmleads.app')
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.crm_users.full_name, excluded.full_name),
  role = 'super_admin';

update public.crm_users
set role = 'super_admin'
where lower(email) = lower('demo.superadmin@crmleads.app');

commit;
