-- À exécuter dans le SQL Editor d'un projet Supabase de TEST.
-- Aucune suppression de données, aucun accès anonyme.
begin;
create table if not exists public.stock_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.stock_members enable row level security;
revoke all on public.stock_members from anon, authenticated;
grant select on public.stock_members to authenticated;
drop policy if exists own_membership on public.stock_members;
create policy own_membership on public.stock_members for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.stock_assets (
  id uuid primary key default gen_random_uuid(),
  import_key text unique,
  designation text not null check (length(btrim(designation)) between 1 and 100),
  asset_code text,
  short_name text,
  genre text,
  category text,
  category_name text,
  subcategory text,
  subcategory_name text,
  reference text,
  serial_number text,
  barcode text,
  service_code text,
  service_name text,
  location text,
  condition_code text,
  supplier_code text,
  manager_code text,
  parent_code text,
  registered_at date,
  purchased_at date,
  assigned_at date,
  warranty_until date,
  notes text,
  quantity integer not null default 0 check (quantity between 0 and 1000000),
  minimum_quantity integer not null default 0 check (minimum_quantity between 0 and 1000000),
  quantity_defaulted boolean not null default false,
  source_row integer,
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists stock_asset_code_unique on public.stock_assets(lower(asset_code)) where asset_code is not null and asset_code <> '';
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.stock_assets(id),
  movement_type text not null check (movement_type in ('entry','exit')),
  quantity integer not null check (quantity between 1 and 1000000),
  reason text not null default '' check (length(reason) <= 512),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.stock_assets enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.stock_assets, public.stock_movements from anon, authenticated;
grant select on public.stock_assets, public.stock_movements to authenticated;
-- Les écritures de stock passent par une transaction, jamais par un UPDATE client.
drop policy if exists member_read_assets on public.stock_assets;
create policy member_read_assets on public.stock_assets for select to authenticated
using (exists (select 1 from public.stock_members where user_id = (select auth.uid())));
drop policy if exists member_read_movements on public.stock_movements;
create policy member_read_movements on public.stock_movements for select to authenticated
using (exists (select 1 from public.stock_members where user_id = (select auth.uid())));

create or replace function public.record_stock_movement(p_asset_id uuid, p_type text, p_quantity integer, p_reason text default '')
returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  current_quantity integer;
  next_quantity integer;
  movement public.stock_movements;
begin
  if auth.uid() is null or not exists (select 1 from public.stock_members where user_id = auth.uid()) then
    raise exception 'Accès au magasin non autorisé' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('entry','exit') or p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then
    raise exception 'Mouvement invalide' using errcode = '22023';
  end if;
  if p_reason is null or length(p_reason) > 512 then raise exception 'Motif invalide' using errcode = '22023'; end if;
  select quantity into current_quantity from public.stock_assets where id = p_asset_id for update;
  if not found then raise exception 'Matériel introuvable' using errcode = '22023'; end if;
  next_quantity := current_quantity + case when p_type = 'entry' then p_quantity else -p_quantity end;
  if next_quantity < 0 or next_quantity > 1000000 then raise exception 'Stock insuffisant ou quantité maximale dépassée' using errcode = '22023'; end if;
  update public.stock_assets set quantity = next_quantity where id = p_asset_id;
  insert into public.stock_movements(asset_id,movement_type,quantity,reason,user_id)
    values(p_asset_id,p_type,p_quantity,p_reason,auth.uid()) returning * into movement;
  return movement;
end;
$$;
revoke all on function public.record_stock_movement(uuid,text,integer,text) from public, anon;
grant execute on function public.record_stock_movement(uuid,text,integer,text) to authenticated;
commit;
