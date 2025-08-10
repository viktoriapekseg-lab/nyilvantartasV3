-- Supabase schema for shared database
create extension if not exists pgcrypto;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  note text
);

create table if not exists public.crate_types (
  id text primary key,
  label text not null,
  archived boolean not null default false
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  direction text not null check (direction in ('out','in')),
  crate_type_id text not null references public.crate_types(id) on delete restrict,
  qty int not null check (qty > 0),
  date date not null,
  note text,
  driver_name text,
  created_at timestamptz default now()
);

alter table public.partners enable row level security;
alter table public.crate_types enable row level security;
alter table public.movements enable row level security;

drop policy if exists "partners read"   on public.partners;
drop policy if exists "partners insert" on public.partners;
drop policy if exists "partners update" on public.partners;
drop policy if exists "partners delete" on public.partners;

drop policy if exists "crate_types read"   on public.crate_types;
drop policy if exists "crate_types insert" on public.crate_types;
drop policy if exists "crate_types update" on public.crate_types;
drop policy if exists "crate_types delete" on public.crate_types;

drop policy if exists "movements read"   on public.movements;
drop policy if exists "movements insert" on public.movements;
drop policy if exists "movements update" on public.movements;
drop policy if exists "movements delete" on public.movements;

create policy "partners read"   on public.partners for select using (true);
create policy "partners insert" on public.partners for insert with check (true);
create policy "partners update" on public.partners for update using (true);
create policy "partners delete" on public.partners for delete using (true);

create policy "crate_types read"   on public.crate_types for select using (true);
create policy "crate_types insert" on public.crate_types for insert with check (true);
create policy "crate_types update" on public.crate_types for update using (true);
create policy "crate_types delete" on public.crate_types for delete using (true);

create policy "movements read"   on public.movements for select using (true);
create policy "movements insert" on public.movements for insert with check (true);
create policy "movements update" on public.movements for update using (true);
create policy "movements delete" on public.movements for delete using (true);
