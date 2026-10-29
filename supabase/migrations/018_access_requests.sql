begin;
alter table public.stock_members add column if not exists role text not null default 'reader' check(role in ('admin','reader'));
create table if not exists public.stock_access_requests(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=80),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),decided_at timestamptz,decided_by uuid references auth.users(id)
);
create table if not exists public.stock_access_events(
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id),
 target_id uuid not null references auth.users(id),request_id uuid not null,
 payload jsonb not null,before_data jsonb not null,after_data jsonb not null,
 created_at timestamptz not null default now(),unique(actor_id,request_id)
);
create or replace function public.stock_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.stock_members where user_id=auth.uid() and role='admin');
$$;
create or replace function public.require_stock_admin()
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.stock_is_admin() then raise exception 'Action réservée aux administrateurs' using errcode='42501'; end if;
end;
$$;
revoke all on function public.stock_is_admin(),public.require_stock_admin() from public,anon;
grant execute on function public.stock_is_admin(),public.require_stock_admin() to authenticated;
alter table public.stock_access_requests enable row level security;
alter table public.stock_access_events enable row level security;
revoke all on public.stock_access_requests,public.stock_access_events from anon,authenticated;
grant select on public.stock_access_requests,public.stock_access_events to authenticated;
drop policy if exists own_request on public.stock_access_requests;
create policy own_request on public.stock_access_requests for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists admin_read on public.stock_access_events;
create policy admin_read on public.stock_access_events for select to authenticated using((select public.stock_is_admin()));
create or replace function public.register_stock_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.stock_access_requests(user_id,display_name)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),80)) on conflict(user_id) do nothing;
 return new;
end;
$$;
revoke all on function public.register_stock_request() from public,anon,authenticated;
drop trigger if exists stock_account_request on auth.users;
create trigger stock_account_request after insert on auth.users for each row execute function public.register_stock_request();
insert into public.stock_access_requests(user_id,display_name,status)
select u.id,left(coalesce(u.raw_user_meta_data->>'display_name',''),80),case when m.user_id is null then 'pending' else 'approved' end
from auth.users u left join public.stock_members m on m.user_id=u.id on conflict(user_id) do nothing;
commit;
