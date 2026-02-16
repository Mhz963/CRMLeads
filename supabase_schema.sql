-- Supabase schema for AI CRM Leads
-- Run this in the Supabase SQL editor for your project

-- Enable pgcrypto for UUID generation (if not already enabled)
create extension if not exists "pgcrypto";

-- USERS
-- Supabase uses auth.users; reference it via auth schema

-- COMPANIES
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  website text,
  created_at timestamptz default now(),
  owner_id uuid references auth.users(id)
);

-- LEADS
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

-- CONTACTS
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  email text,
  phone text
);

-- DEALS
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  value numeric(12,2),
  stage text default 'New',
  expected_close date,
  created_at timestamptz default now()
);

-- ACTIVITIES (calls, emails, meetings, etc.)
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  type text, -- call, email, meeting
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- TASKS
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead_id uuid references public.leads(id) on delete cascade,
  assigned_to uuid references auth.users(id),
  due_date date,
  status text default 'pending',
  created_at timestamptz default now()
);

-- EMAIL TEMPLATES
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- BASIC INDEXES
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
create index if not exists leads_created_by_idx on public.leads(created_by);
create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);

-- =========================
-- ROLE-BASED ACCESS (RLS)
-- =========================

-- Enable RLS on core tables
alter table public.leads enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.email_templates enable row level security;

-- Helper: JWT custom claim `role` is expected in auth.jwt() as ->> 'role'
-- You set this via Supabase dashboard (Auth → Policies → JWT custom claims)

-- Leads policies
create policy "leads_admin_all"
  on public.leads
  for all
  using (auth.jwt() ->> 'role' = 'admin');

create policy "leads_manager_all"
  on public.leads
  for all
  using (auth.jwt() ->> 'role' = 'sales_manager');

create policy "leads_agent_own"
  on public.leads
  for select using (
    auth.jwt() ->> 'role' = 'sales_agent'
    and (assigned_to = auth.uid() or created_by = auth.uid())
  )
  with check (
    auth.jwt() ->> 'role' = 'sales_agent'
    and (assigned_to = auth.uid() or created_by = auth.uid())
  );

-- Companies: visible if user owns at least one lead pointing to it or owns the company
create policy "companies_admin_all"
  on public.companies
  for all
  using (auth.jwt() ->> 'role' = 'admin');

create policy "companies_manager_all"
  on public.companies
  for all
  using (auth.jwt() ->> 'role' = 'sales_manager');

create policy "companies_agent_related"
  on public.companies
  for select using (
    exists (
      select 1 from public.leads l
      where l.company_id = companies.id
        and (l.assigned_to = auth.uid() or l.created_by = auth.uid())
    )
  );

-- Tasks: agents see tasks assigned to them; admins/managers see all
create policy "tasks_admin_all"
  on public.tasks
  for all
  using (auth.jwt() ->> 'role' in ('admin','sales_manager'));

create policy "tasks_agent_assigned"
  on public.tasks
  for all
  using (assigned_to = auth.uid());

-- Activities: scoped similarly to leads
create policy "activities_admin_all"
  on public.activities
  for all
  using (auth.jwt() ->> 'role' in ('admin','sales_manager'));

create policy "activities_agent_leads"
  on public.activities
  for all
  using (
    exists (
      select 1 from public.leads l
      where l.id = activities.lead_id
        and (l.assigned_to = auth.uid() or l.created_by = auth.uid())
    )
  );

-- Email templates: per-owner, plus admins
create policy "email_templates_admin_all"
  on public.email_templates
  for all
  using (auth.jwt() ->> 'role' = 'admin');

create policy "email_templates_owner"
  on public.email_templates
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

