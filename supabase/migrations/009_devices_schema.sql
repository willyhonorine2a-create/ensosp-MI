begin;
alter table public.stock_assets add column if not exists tracking_mode text not null default 'quantity' check(tracking_mode in ('quantity','individual'));
alter table public.stock_assets add column if not exists merged_into uuid references public.stock_assets(id);
create table if not exists public.stock_devices (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references public.stock_assets(id),
 device_number bigint generated always as identity unique,
 serial_number text check(length(serial_number)<=30),
 purchased_at date, warranty_until date,
 status text not null default 'available' check(status in ('available','maintenance','unavailable')),
 notes text check(length(notes)<=512),
 updated_at timestamptz not null default clock_timestamp(),
 retired_at timestamptz
);
create unique index if not exists stock_device_serial_unique on public.stock_devices(asset_id,lower(btrim(serial_number))) where serial_number is not null and retired_at is null;
create table if not exists public.stock_tracking_events (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.stock_assets(id),
 user_id uuid not null references auth.users(id), request_id uuid not null,
 payload jsonb not null, before_quantity integer not null, after_quantity integer not null,
 reason text not null, created_at timestamptz not null default now(), unique(user_id,request_id)
);
create table if not exists public.stock_device_events (
 id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.stock_assets(id),
 device_id uuid not null references public.stock_devices(id),user_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null, before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now(),unique(user_id,request_id)
);
alter table public.stock_devices enable row level security;
alter table public.stock_tracking_events enable row level security;
alter table public.stock_device_events enable row level security;
revoke all on public.stock_devices,public.stock_tracking_events,public.stock_device_events from anon,authenticated;
grant select on public.stock_devices,public.stock_tracking_events,public.stock_device_events to authenticated;
drop policy if exists member_read on public.stock_devices;
create policy member_read on public.stock_devices for select to authenticated using(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
drop policy if exists member_read on public.stock_tracking_events;
create policy member_read on public.stock_tracking_events for select to authenticated using(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
drop policy if exists member_read on public.stock_device_events;
create policy member_read on public.stock_device_events for select to authenticated using(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
create or replace view public.stock_reference_inventory with(security_invoker=true) as
select a.*,(select count(*) from public.stock_devices d where d.asset_id=a.id and d.retired_at is null and d.status='available') as available_devices from public.stock_assets a;
revoke all on public.stock_reference_inventory from anon;
grant select on public.stock_reference_inventory to authenticated;
commit;
