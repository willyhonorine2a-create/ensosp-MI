begin;
-- Les stocks historiques restent à localiser : aucune affectation supposée.
alter table public.stock_assets add column if not exists quantity_mi integer not null default 0;
alter table public.stock_assets add column if not exists quantity_cs integer not null default 0;
alter table public.stock_assets drop constraint if exists physical_quantities;
alter table public.stock_assets add constraint physical_quantities check(quantity_mi>=0 and quantity_cs>=0 and quantity_mi+quantity_cs<=quantity);
alter table public.stock_devices add column if not exists physical_location text not null default 'UNSET' check(physical_location in ('MI','CS','UNSET'));
create table if not exists public.stock_location_events(
 id uuid primary key default gen_random_uuid(),asset_id uuid not null references public.stock_assets(id),
 user_id uuid not null references auth.users(id),request_id uuid not null,
 action text not null,reason text not null,payload jsonb not null,
 before_data jsonb not null,after_data jsonb not null,created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
alter table public.stock_location_events enable row level security;
revoke all on public.stock_location_events from anon,authenticated;
grant select on public.stock_location_events to authenticated;
drop policy if exists member_read on public.stock_location_events;
create policy member_read on public.stock_location_events for select to authenticated using(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
commit;
