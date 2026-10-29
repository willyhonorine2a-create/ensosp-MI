begin;
create or replace function public.list_stock_accounts(p_status text default '',p_offset integer default 0,p_limit integer default 50)
returns table(user_id uuid,email text,display_name text,status text,role text,email_confirmed boolean,requested_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_stock_admin();
 if p_status is null or p_status not in ('','pending','approved','rejected') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Filtre invalide'; end if;
 return query select r.user_id,u.email::text,r.display_name,r.status,m.role,(u.email_confirmed_at is not null),r.requested_at
 from public.stock_access_requests r join auth.users u on u.id=r.user_id
 left join public.stock_members m on m.user_id=r.user_id
 where p_status='' or r.status=p_status order by r.requested_at,r.user_id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.list_stock_accounts(text,integer,integer) from public,anon;
grant execute on function public.list_stock_accounts(text,integer,integer) to authenticated;
commit;
