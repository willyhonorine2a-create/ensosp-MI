begin;
alter table public.stock_assets add column if not exists archived_at timestamptz;
alter table public.stock_assets add column if not exists archived_by uuid references auth.users(id);
alter table public.stock_assets add column if not exists archive_reason text;
create table if not exists public.stock_asset_events (
 id uuid primary key default gen_random_uuid(),
 asset_id uuid not null references public.stock_assets(id),
 action text not null check(action in ('adjust','archive')),
 before_quantity integer not null check(before_quantity between 0 and 1000000),
 after_quantity integer not null check(after_quantity between 0 and 1000000),
 reason text not null check(length(btrim(reason)) between 1 and 512),
 user_id uuid not null references auth.users(id),
 request_id uuid not null,
 created_at timestamptz not null default now(),
 unique(user_id,request_id)
);
alter table public.stock_asset_events enable row level security;
revoke all on public.stock_asset_events from anon,authenticated;
grant select on public.stock_asset_events to authenticated;
drop policy if exists member_read on public.stock_asset_events;
create policy member_read on public.stock_asset_events for select to authenticated using
(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
create or replace function public.protect_archived_stock()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.archived_at is not null then raise exception 'Ce matériel est supprimé de l’inventaire'; end if;
 return new;
end;
$$;
revoke all on function public.protect_archived_stock() from public,anon,authenticated;
drop trigger if exists protect_archived_stock on public.stock_assets;
create trigger protect_archived_stock before update on public.stock_assets
for each row execute function public.protect_archived_stock();
commit;
