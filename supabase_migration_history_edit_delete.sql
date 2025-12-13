-- Migration: Owner-only edit/delete for Dispatch/Inward history with automatic stock adjustments
-- Run this in Supabase Dashboard -> SQL Editor.
-- Safe to run multiple times (uses CREATE OR REPLACE).

-- Owner-only history edit/delete RPCs (keeps stock consistent)
-- ----------------------------

create or replace function public.update_dispatch(
  p_dispatch_id uuid,
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
  v_old_item uuid;
  v_old_qty_pieces int;
  v_new_qty_pieces int;
  v_new_qty_bags int;
  v_ppb int;
  v_stock int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_owner() then
    raise exception 'Only owner can edit dispatch history.';
  end if;
  if p_dispatch_id is null then
    raise exception 'Missing dispatch id.';
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

  -- Lock the dispatch row
  select item_id, qty_pieces
    into v_old_item, v_old_qty_pieces
  from public.dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'Dispatch not found.';
  end if;

  -- Lock involved item rows in a stable order to avoid deadlocks
  if v_old_item = p_item_id then
    perform 1 from public.items where id = p_item_id for update;
  else
    perform 1 from public.items where id in (v_old_item, p_item_id) order by id for update;
  end if;

  -- Compute new qty in pieces/bags based on NEW item
  select pieces_per_bag, stock_pieces into v_ppb, v_stock
  from public.items
  where id = p_item_id;

  if v_ppb is null or v_ppb <= 0 then
    raise exception 'This item has invalid pieces-per-bag.';
  end if;

  if p_entered_qty_type = 'bags' then
    v_new_qty_bags := p_qty;
    v_new_qty_pieces := p_qty * v_ppb;
  else
    v_new_qty_bags := null;
    v_new_qty_pieces := p_qty;
  end if;

  if v_new_qty_pieces <= 0 then
    raise exception 'Invalid computed quantity.';
  end if;

  -- Adjust stock
  if v_old_item = p_item_id then
    -- Same item: apply delta
    if v_new_qty_pieces > v_old_qty_pieces then
      -- Need extra stock
      if v_stock < (v_new_qty_pieces - v_old_qty_pieces) then
        raise exception 'Insufficient stock for edit. Need % more pcs, available % pcs.', (v_new_qty_pieces - v_old_qty_pieces), v_stock;
      end if;
      update public.items set stock_pieces = stock_pieces - (v_new_qty_pieces - v_old_qty_pieces) where id = p_item_id;
    elsif v_new_qty_pieces < v_old_qty_pieces then
      update public.items set stock_pieces = stock_pieces + (v_old_qty_pieces - v_new_qty_pieces) where id = p_item_id;
    end if;
  else
    -- Different item: reverse old then apply new
    update public.items set stock_pieces = stock_pieces + v_old_qty_pieces where id = v_old_item;

    -- refresh stock for new item after locks
    select stock_pieces into v_stock from public.items where id = p_item_id;
    if v_stock < v_new_qty_pieces then
      raise exception 'Insufficient stock for new item. Available % pcs, requested % pcs.', v_stock, v_new_qty_pieces;
    end if;
    update public.items set stock_pieces = stock_pieces - v_new_qty_pieces where id = p_item_id;
  end if;

  update public.dispatches
  set customer_id = p_customer_id,
      item_id = p_item_id,
      challan_no = nullif(p_challan_no, ''),
      qty_pieces = v_new_qty_pieces,
      qty_bags = v_new_qty_bags,
      entered_qty_type = p_entered_qty_type,
      date = p_date
  where id = p_dispatch_id;

  return p_dispatch_id;
end;
$$;

create or replace function public.delete_dispatch(p_dispatch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
  v_qty int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_owner() then
    raise exception 'Only owner can delete dispatch history.';
  end if;

  select item_id, qty_pieces into v_item, v_qty
  from public.dispatches
  where id = p_dispatch_id
  for update;

  if not found then
    raise exception 'Dispatch not found.';
  end if;

  -- Reverse stock OUT
  update public.items set stock_pieces = stock_pieces + v_qty where id = v_item;
  delete from public.dispatches where id = p_dispatch_id;
end;
$$;

create or replace function public.update_inward(
  p_inward_id uuid,
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
  v_old_item uuid;
  v_old_qty_pieces int;
  v_new_qty_pieces int;
  v_new_qty_bags int;
  v_ppb int;
  v_stock int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_owner() then
    raise exception 'Only owner can edit inward history.';
  end if;
  if p_inward_id is null then
    raise exception 'Missing inward id.';
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

  -- Lock the inward row
  select item_id, qty_pieces
    into v_old_item, v_old_qty_pieces
  from public.inwards
  where id = p_inward_id
  for update;

  if not found then
    raise exception 'Inward not found.';
  end if;

  -- Lock involved item rows in a stable order
  if v_old_item = p_item_id then
    perform 1 from public.items where id = p_item_id for update;
  else
    perform 1 from public.items where id in (v_old_item, p_item_id) order by id for update;
  end if;

  -- Compute new qty based on NEW item
  select pieces_per_bag, stock_pieces into v_ppb, v_stock
  from public.items
  where id = p_item_id;

  if v_ppb is null or v_ppb <= 0 then
    raise exception 'This item has invalid pieces-per-bag.';
  end if;

  if p_entered_qty_type = 'bags' then
    v_new_qty_bags := p_qty;
    v_new_qty_pieces := p_qty * v_ppb;
  else
    v_new_qty_bags := null;
    v_new_qty_pieces := p_qty;
  end if;

  if v_new_qty_pieces <= 0 then
    raise exception 'Invalid computed quantity.';
  end if;

  -- Adjust stock (IN)
  if v_old_item = p_item_id then
    -- delta = new - old (because inward adds stock)
    if v_new_qty_pieces < v_old_qty_pieces then
      -- Need to remove some previously added stock
      if v_stock < (v_old_qty_pieces - v_new_qty_pieces) then
        raise exception 'Cannot reduce inward. Stock already used. Need remove % pcs but only % pcs available.', (v_old_qty_pieces - v_new_qty_pieces), v_stock;
      end if;
      update public.items set stock_pieces = stock_pieces - (v_old_qty_pieces - v_new_qty_pieces) where id = p_item_id;
    elsif v_new_qty_pieces > v_old_qty_pieces then
      update public.items set stock_pieces = stock_pieces + (v_new_qty_pieces - v_old_qty_pieces) where id = p_item_id;
    end if;
  else
    -- reverse old inward from old item
    select stock_pieces into v_stock from public.items where id = v_old_item;
    if v_stock < v_old_qty_pieces then
      raise exception 'Cannot move inward to another item. Old item stock already used.';
    end if;
    update public.items set stock_pieces = stock_pieces - v_old_qty_pieces where id = v_old_item;
    -- apply new inward to new item
    update public.items set stock_pieces = stock_pieces + v_new_qty_pieces where id = p_item_id;
  end if;

  update public.inwards
  set item_id = p_item_id,
      type = p_type,
      qty_pieces = v_new_qty_pieces,
      qty_bags = v_new_qty_bags,
      entered_qty_type = p_entered_qty_type,
      date = p_date
  where id = p_inward_id;

  return p_inward_id;
end;
$$;

create or replace function public.delete_inward(p_inward_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid;
  v_qty int;
  v_stock int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_owner() then
    raise exception 'Only owner can delete inward history.';
  end if;

  select item_id, qty_pieces into v_item, v_qty
  from public.inwards
  where id = p_inward_id
  for update;

  if not found then
    raise exception 'Inward not found.';
  end if;

  -- Reverse stock IN; prevent negative
  select stock_pieces into v_stock from public.items where id = v_item for update;
  if v_stock < v_qty then
    raise exception 'Cannot delete inward. Stock already used.';
  end if;

  update public.items set stock_pieces = stock_pieces - v_qty where id = v_item;
  delete from public.inwards where id = p_inward_id;
end;
$$;

revoke all on function public.update_dispatch(uuid,uuid,uuid,text,text,int,date) from public;
revoke all on function public.delete_dispatch(uuid) from public;
revoke all on function public.update_inward(uuid,uuid,text,text,int,date) from public;
revoke all on function public.delete_inward(uuid) from public;

grant execute on function public.update_dispatch(uuid,uuid,uuid,text,text,int,date) to authenticated;
grant execute on function public.delete_dispatch(uuid) to authenticated;
grant execute on function public.update_inward(uuid,uuid,text,text,int,date) to authenticated;
grant execute on function public.delete_inward(uuid) to authenticated;
