-- Migration: allow supervisor role to manage Masters (categories/components/colors/customers)
-- Run this in Supabase SQL Editor if you already have a live DB.

-- Ensure helper exists (safe to re-run)
create or replace function public.is_supervisor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'supervisor'
  );
$$;

-- Update Masters write policies to include supervisor
drop policy if exists "masters_write_owner" on public.categories;
create policy "masters_write_owner" on public.categories
for all to authenticated
using (public.is_owner() or public.is_staff() or public.is_supervisor())
with check (public.is_owner() or public.is_staff() or public.is_supervisor());

drop policy if exists "masters_write_owner" on public.components;
create policy "masters_write_owner" on public.components
for all to authenticated
using (public.is_owner() or public.is_staff() or public.is_supervisor())
with check (public.is_owner() or public.is_staff() or public.is_supervisor());

drop policy if exists "masters_write_owner" on public.colors;
create policy "masters_write_owner" on public.colors
for all to authenticated
using (public.is_owner() or public.is_staff() or public.is_supervisor())
with check (public.is_owner() or public.is_staff() or public.is_supervisor());

drop policy if exists "masters_write_owner" on public.customers;
create policy "masters_write_owner" on public.customers
for all to authenticated
using (public.is_owner() or public.is_staff() or public.is_supervisor())
with check (public.is_owner() or public.is_staff() or public.is_supervisor());
