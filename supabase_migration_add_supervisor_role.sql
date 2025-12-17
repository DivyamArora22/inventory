-- Migration: add supervisor role
-- Run this in Supabase SQL Editor (safe to run once).
-- This updates the profiles.role check constraint and adds an is_supervisor() helper.

do $$
declare c record;
begin
  -- Drop any existing CHECK constraint that restricts profiles.role (name may differ between projects)
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner','staff','supervisor'));

create or replace function public.is_supervisor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'supervisor'
  );
$$;
