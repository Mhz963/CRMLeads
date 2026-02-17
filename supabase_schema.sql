-- ════════════════════════════════════════════════════════════════════════
-- Supabase schema for AI CRM Leads
-- Run this in the Supabase SQL editor for your project
-- ════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for UUID generation (if not already enabled)
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────
-- CRM USERS (mirrors auth.users with role)
-- ──────────────────────────────────────────────────────

create table if not exists public.crm_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'team_member' check (role in ('admin', 'team_member')),
  created_at timestamptz default now()
);

-- If the table already exists without the role column, add it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_users' and column_name = 'role'
  ) then
    alter table public.crm_users
      add column role text not null default 'team_member'
      check (role in ('admin', 'team_member'));
  end if;
end $$;

alter table public.crm_users enable row level security;

-- Drop old policy that used FOR ALL (causes errors)
drop policy if exists "crm_users_self" on public.crm_users;

-- Users can read all team members (needed for admin page & assignment dropdowns)
drop policy if exists "crm_users_select_all" on public.crm_users;
create policy "crm_users_select_all"
  on public.crm_users
  for select
  using (true);

-- Users can insert their own row (signup sync)
drop policy if exists "crm_users_insert_self" on public.crm_users;
create policy "crm_users_insert_self"
  on public.crm_users
  for insert
  with check (auth.uid() = id);

-- Users can update their own row
drop policy if exists "crm_users_update_self" on public.crm_users;
create policy "crm_users_update_self"
  on public.crm_users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can update any row (role changes)
drop policy if exists "crm_users_admin_update" on public.crm_users;
create policy "crm_users_admin_update"
  on public.crm_users
  for update
  using (
    exists (
      select 1 from public.crm_users cu
      where cu.id = auth.uid() and cu.role = 'admin'
    )
  );

-- Admins can delete any member (remove team member)
drop policy if exists "crm_users_admin_delete" on public.crm_users;
create policy "crm_users_admin_delete"
  on public.crm_users
  for delete
  using (
    exists (
      select 1 from public.crm_users cu
      where cu.id = auth.uid() and cu.role = 'admin'
    )
  );

-- ──────────────────────────────────────────────────────
-- COMPANIES
-- ──────────────────────────────────────────────────────

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  website text,
  created_at timestamptz default now(),
  owner_id uuid references auth.users(id)
);

-- ──────────────────────────────────────────────────────
-- LEADS
-- ──────────────────────────────────────────────────────

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  company_id uuid references public.companies(id) on delete set null,
  source text,
  status text default 'New',
  score integer,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ──────────────────────────────────────────────────────
-- CONTACTS
-- ──────────────────────────────────────────────────────

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  email text,
  phone text
);

-- ──────────────────────────────────────────────────────
-- DEALS
-- ──────────────────────────────────────────────────────

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  value numeric(12,2),
  stage text default 'New',
  expected_close date,
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────────────
-- ACTIVITIES (calls, emails, meetings, etc.)
-- ──────────────────────────────────────────────────────

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  type text, -- call, email, meeting
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────────────
-- TASKS
-- ──────────────────────────────────────────────────────

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  due_date date,
  status text default 'pending',
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────────────
-- EMAIL TEMPLATES
-- ──────────────────────────────────────────────────────

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ──────────────────────────────────────────────────────
-- INDEXES
-- ──────────────────────────────────────────────────────

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
create index if not exists leads_created_by_idx on public.leads(created_by);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);

-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════

alter table public.leads enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.email_templates enable row level security;

-- ─────────── Helper: is current user an admin? ───────────
-- (used in policies below via sub-select)

-- ══════════════  LEADS  ══════════════

-- Admins: full access
drop policy if exists "leads_admin_select" on public.leads;
create policy "leads_admin_select"
  on public.leads for select
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

drop policy if exists "leads_admin_insert" on public.leads;
create policy "leads_admin_insert"
  on public.leads for insert
  with check (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

drop policy if exists "leads_admin_update" on public.leads;
create policy "leads_admin_update"
  on public.leads for update
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  )
  with check (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

drop policy if exists "leads_admin_delete" on public.leads;
create policy "leads_admin_delete"
  on public.leads for delete
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

-- Team members: own leads only (created_by = self)
drop policy if exists "leads_member_select" on public.leads;
create policy "leads_member_select"
  on public.leads for select
  using (created_by = auth.uid());

drop policy if exists "leads_member_insert" on public.leads;
create policy "leads_member_insert"
  on public.leads for insert
  with check (created_by = auth.uid());

drop policy if exists "leads_member_update" on public.leads;
create policy "leads_member_update"
  on public.leads for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "leads_member_delete" on public.leads;
create policy "leads_member_delete"
  on public.leads for delete
  using (created_by = auth.uid());

-- Remove old public/dev policies
drop policy if exists "leads_public_select" on public.leads;
drop policy if exists "leads_public_insert" on public.leads;
drop policy if exists "leads_public_update" on public.leads;
drop policy if exists "leads_public_delete" on public.leads;
drop policy if exists "leads_owner_select" on public.leads;
drop policy if exists "leads_owner_insert" on public.leads;
drop policy if exists "leads_owner_update" on public.leads;
drop policy if exists "leads_owner_delete" on public.leads;

-- ══════════════  COMPANIES  ══════════════

drop policy if exists "companies_admin_all" on public.companies;
drop policy if exists "companies_manager_all" on public.companies;
drop policy if exists "companies_agent_related" on public.companies;

create policy "companies_admin_select"
  on public.companies for select
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "companies_owner_select"
  on public.companies for select
  using (owner_id = auth.uid());

create policy "companies_insert"
  on public.companies for insert
  with check (owner_id = auth.uid());

create policy "companies_admin_update"
  on public.companies for update
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "companies_owner_update"
  on public.companies for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ══════════════  TASKS  ══════════════

drop policy if exists "tasks_admin_all" on public.tasks;
drop policy if exists "tasks_agent_assigned" on public.tasks;

create policy "tasks_admin_select"
  on public.tasks for select
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "tasks_admin_insert"
  on public.tasks for insert
  with check (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "tasks_admin_update"
  on public.tasks for update
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "tasks_admin_delete"
  on public.tasks for delete
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "tasks_member_select"
  on public.tasks for select
  using (assigned_to = auth.uid());

create policy "tasks_member_insert"
  on public.tasks for insert
  with check (assigned_to = auth.uid());

create policy "tasks_member_update"
  on public.tasks for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

create policy "tasks_member_delete"
  on public.tasks for delete
  using (assigned_to = auth.uid());

-- ══════════════  ACTIVITIES  ══════════════

drop policy if exists "activities_admin_all" on public.activities;
drop policy if exists "activities_agent_leads" on public.activities;

create policy "activities_admin_select"
  on public.activities for select
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "activities_member_select"
  on public.activities for select
  using (created_by = auth.uid());

create policy "activities_insert"
  on public.activities for insert
  with check (created_by = auth.uid());

-- ══════════════  EMAIL TEMPLATES  ══════════════

drop policy if exists "email_templates_admin_all" on public.email_templates;
drop policy if exists "email_templates_owner_select" on public.email_templates;
drop policy if exists "email_templates_owner_insert" on public.email_templates;
drop policy if exists "email_templates_owner_update" on public.email_templates;

create policy "email_templates_admin_select"
  on public.email_templates for select
  using (
    exists (select 1 from public.crm_users cu where cu.id = auth.uid() and cu.role = 'admin')
  );

create policy "email_templates_owner_select"
  on public.email_templates for select
  using (owner_id = auth.uid());

create policy "email_templates_insert"
  on public.email_templates for insert
  with check (owner_id = auth.uid());

create policy "email_templates_owner_update"
  on public.email_templates for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- MIGRATION: Add new columns for Demo CRM (NZ Business Clients)
-- Run this section if tables already exist without these columns
-- ══════════════════════════════════════════════════════════════

-- New fields on leads table
alter table public.leads add column if not exists services text;
alter table public.leads add column if not exists user_ip text;
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists tag text;

-- Update default status for new leads
alter table public.leads alter column status set default 'New Lead';
