begin;
create or replace function public.manage_stock_asset(p_asset_id uuid,p_action text,p_quantity integer,p_expected_quantity integer,p_reason text,p_request_id uuid)
returns public.stock_asset_events language plpgsql security definer set search_path='' as $$
declare item public.stock_assets; previous public.stock_asset_events; result public.stock_asset_events; delta integer;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then
  raise exception 'Accès au magasin non autorisé' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('adjust','archive') or p_request_id is null or p_quantity is null or p_quantity not between 0 and 1000000 or p_expected_quantity is null or p_expected_quantity not between 0 and 1000000 or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then
  raise exception 'Action ou quantité invalide';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text,0));
 select * into previous from public.stock_asset_events where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if previous.asset_id is distinct from p_asset_id or previous.action is distinct from p_action or previous.before_quantity is distinct from p_expected_quantity or previous.after_quantity is distinct from p_quantity or previous.reason is distinct from btrim(p_reason) then
   raise exception 'Identifiant déjà utilisé pour une autre action';
  end if;
  return previous;
 end if;
 select * into item from public.stock_assets where id=p_asset_id for update;
 if not found then raise exception 'Matériel introuvable'; end if;
 if item.archived_at is not null then raise exception 'Ce matériel est supprimé de l’inventaire'; end if;
 if item.quantity<>p_expected_quantity then raise exception 'Le stock a changé. Fermez cette fenêtre et actualisez avant de recommencer.'; end if;
 if p_action='archive' then
  if p_quantity<>item.quantity then raise exception 'La suppression ne modifie pas la quantité conservée'; end if;
  update public.stock_assets set archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason) where id=p_asset_id;
 else
  delta:=p_quantity-item.quantity;
  if delta<>0 then
   perform public.record_stock_movement_once(p_asset_id,case when delta>0 then 'entry' else 'exit' end,abs(delta),left('Correction manuelle : '||btrim(p_reason),512),p_request_id);
  end if;
  update public.stock_assets set quantity_defaulted=false where id=p_asset_id;
 end if;
 insert into public.stock_asset_events(asset_id,action,before_quantity,after_quantity,reason,user_id,request_id)
 values(p_asset_id,p_action,item.quantity,p_quantity,btrim(p_reason),auth.uid(),p_request_id) returning * into result;
 return result;
end;
$$;
revoke all on function public.manage_stock_asset(uuid,text,integer,integer,text,uuid) from public,anon;
grant execute on function public.manage_stock_asset(uuid,text,integer,integer,text,uuid) to authenticated;
commit;
