-- Inventory Management System (Supabase Postgres) schema
-- Run this inside Supabase SQL Editor.
--
-- Includes:
-- - Masters, Items, Dispatches, Inwards
-- - Profiles table + roles (owner/staff)
-- - RLS + safe RPCs for staff to create Dispatch/Inward while stock updates atomically

create extension if not exists "pgcrypto";

-- ----------------------------
-- Roles / Profiles
-- ----------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'staff')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'staff'
  );
$$;

-- ----------------------------
-- Masters
-- ----------------------------

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.components (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------
-- Items
-- ----------------------------

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  item_number bigint not null unique,
  name text not null,
  category_id uuid references public.categories(id) on update cascade on delete restrict,
  component_id uuid references public.components(id) on update cascade on delete restrict,
  color_id uuid references public.colors(id) on update cascade on delete restrict,
  size_num int not null,
  sku text not null unique,
  weight_g numeric(10,2) not null,
  pieces_per_bag int not null,
  low_stock_threshold_pieces int null,
  stock_pieces int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_name on public.items using btree (name);
create index if not exists idx_items_sku on public.items using btree (sku);

-- ----------------------------
-- Dispatches (Stock OUT)
-- ----------------------------

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on update cascade on delete restrict,
  item_id uuid not null references public.items(id) on update cascade on delete restrict,
  challan_no text null,
  qty_pieces int not null,
  qty_bags int null,
  entered_qty_type text null check (entered_qty_type in ('pieces','bags')),
  date date not null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dispatches_date on public.dispatches using btree (date);
create index if not exists idx_dispatches_customer on public.dispatches using btree (customer_id);

-- ----------------------------
-- Inwards (Stock IN)
-- ----------------------------

create table if not exists public.inwards (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on update cascade on delete restrict,
  type text not null,
  qty_pieces int not null,
  qty_bags int null,
  entered_qty_type text null check (entered_qty_type in ('pieces','bags')),
  date date not null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inwards_date on public.inwards using btree (date);

-- ----------------------------
-- Safe RPCs for staff (atomic stock update)
-- ----------------------------

create or replace function public.create_dispatch(
  p_customer_id uuid,
  p_item_id uuid,
  p_challan_no text,
  p_entered_qty_type text,
  p_qty int,
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ppb int;
  v_stock int;
  v_qty_pieces int;
  v_qty_bags int;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_item_id is null then
    raise exception 'Select item.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be > 0.';
  end if;
  if p_date is null then
    raise exception 'Select date.';
  end if;
  if p_entered_qty_type not in ('pieces','bags') then
    raise exception 'Invalid quantity type.';
  end if;

  -- Lock the item row to avoid race conditions.
  select pieces_per_bag, stock_pieces
    into v_ppb, v_stock
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Invalid item.';
  end if;
  if v_ppb is null or v_ppb <= 0 then
    raise exception 'This item has invalid pieces-per-bag. Fix it in Inventory.';
  end if;

  if p_entered_qty_type = 'bags' then
    v_qty_bags := p_qty;
    v_qty_pieces := p_qty * v_ppb;
  else
    v_qty_bags := null;
    v_qty_pieces := p_qty;
  end if;

  if v_qty_pieces <= 0 then
    raise exception 'Invalid computed quantity.';
  end if;

  if v_stock < v_qty_pieces then
    raise exception 'Insufficient stock. Available % pcs, requested % pcs.', v_stock, v_qty_pieces;
  end if;

  insert into public.dispatches (
    customer_id,
    item_id,
    challan_no,
    qty_pieces,
    qty_bags,
    entered_qty_type,
    date,
    created_by
  )
  values (
    p_customer_id,
    p_item_id,
    nullif(p_challan_no, ''),
    v_qty_pieces,
    v_qty_bags,
    p_entered_qty_type,
    p_date,
    auth.uid()
  )
  returning id into v_id;

  update public.items
  set stock_pieces = stock_pieces - v_qty_pieces
  where id = p_item_id;

  return v_id;
end;
$$;

create or replace function public.create_inward(
  p_item_id uuid,
  p_type text,
  p_entered_qty_type text,
  p_qty int,
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ppb int;
  v_qty_pieces int;
  v_qty_bags int;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_item_id is null then
    raise exception 'Select item.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be > 0.';
  end if;
  if p_date is null then
    raise exception 'Select date.';
  end if;
  if p_type is null or btrim(p_type) = '' then
    raise exception 'Type is required.';
  end if;
  if p_entered_qty_type not in ('pieces','bags') then
    raise exception 'Invalid quantity type.';
  end if;

  -- Lock the item row.
  select pieces_per_bag
    into v_ppb
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Invalid item.';
  end if;
  if v_ppb is null or v_ppb <= 0 then
    raise exception 'This item has invalid pieces-per-bag. Fix it in Inventory.';
  end if;

  if p_entered_qty_type = 'bags' then
    v_qty_bags := p_qty;
    v_qty_pieces := p_qty * v_ppb;
  else
    v_qty_bags := null;
    v_qty_pieces := p_qty;
  end if;

  if v_qty_pieces <= 0 then
    raise exception 'Invalid computed quantity.';
  end if;

  insert into public.inwards (
    item_id,
    type,
    qty_pieces,
    qty_bags,
    entered_qty_type,
    date,
    created_by
  )
  values (
    p_item_id,
    p_type,
    v_qty_pieces,
    v_qty_bags,
    p_entered_qty_type,
    p_date,
    auth.uid()
  )
  returning id into v_id;

  update public.items
  set stock_pieces = stock_pieces + v_qty_pieces
  where id = p_item_id;

  return v_id;
end;
$$;

revoke all on function public.create_dispatch(uuid,uuid,text,text,int,date) from public;
revoke all on function public.create_inward(uuid,text,text,int,date) from public;
grant execute on function public.create_dispatch(uuid,uuid,text,text,int,date) to authenticated;
grant execute on function public.create_inward(uuid,text,text,int,date) to authenticated;

-- ----------------------------
-- Row Level Security
-- ----------------------------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.components enable row level security;
alter table public.colors enable row level security;
alter table public.customers enable row level security;
alter table public.items enable row level security;
alter table public.dispatches enable row level security;
alter table public.inwards enable row level security;

-- Profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_owner());

drop policy if exists "profiles_update_owner" on public.profiles;
create policy "profiles_update_owner" on public.profiles
for update to authenticated
using (public.is_owner())
with check (public.is_owner());

-- Masters (read for everyone logged in, write for owner + staff)
drop policy if exists "masters_select_all" on public.categories;
create policy "masters_select_all" on public.categories for select to authenticated using (true);
drop policy if exists "masters_write_owner" on public.categories;
create policy "masters_write_owner" on public.categories for all to authenticated using (public.is_owner() or public.is_staff()) with check (public.is_owner() or public.is_staff());

drop policy if exists "masters_select_all" on public.components;
create policy "masters_select_all" on public.components for select to authenticated using (true);
drop policy if exists "masters_write_owner" on public.components;
create policy "masters_write_owner" on public.components for all to authenticated using (public.is_owner() or public.is_staff()) with check (public.is_owner() or public.is_staff());

drop policy if exists "masters_select_all" on public.colors;
create policy "masters_select_all" on public.colors for select to authenticated using (true);
drop policy if exists "masters_write_owner" on public.colors;
create policy "masters_write_owner" on public.colors for all to authenticated using (public.is_owner() or public.is_staff()) with check (public.is_owner() or public.is_staff());

drop policy if exists "masters_select_all" on public.customers;
create policy "masters_select_all" on public.customers for select to authenticated using (true);
drop policy if exists "masters_write_owner" on public.customers;
create policy "masters_write_owner" on public.customers for all to authenticated using (public.is_owner() or public.is_staff()) with check (public.is_owner() or public.is_staff());

-- Items (read for everyone, write for owner)
drop policy if exists "items_select_all" on public.items;
create policy "items_select_all" on public.items for select to authenticated using (true);
drop policy if exists "items_write_owner" on public.items;
create policy "items_write_owner" on public.items for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Dispatches / Inwards: owner only (staff uses RPC which runs as definer)
drop policy if exists "dispatches_owner_only" on public.dispatches;
create policy "dispatches_owner_only" on public.dispatches
for all to authenticated
using (public.is_owner())
with check (public.is_owner());

drop policy if exists "inwards_owner_only" on public.inwards;
create policy "inwards_owner_only" on public.inwards
for all to authenticated
using (public.is_owner())
with check (public.is_owner());
