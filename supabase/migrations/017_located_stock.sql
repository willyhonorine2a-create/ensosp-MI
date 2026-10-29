begin;
create or replace function public.manage_located_stock(p_asset_id uuid,p_action text,p_from text,p_to text,p_quantity integer,p_expected jsonb,p_reason text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.stock_assets; prior public.stock_location_events; payload jsonb; q integer; mi integer; cs integer; delta integer; amount integer; result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then raise exception 'Accès non autorisé'; end if;
 if p_request_id is null or p_action is null or p_action not in ('transfer','entry','exit','adjust') or p_from is null or p_from not in ('MI','CS','UNSET') or p_to is null or p_to not in ('MI','CS','UNSET') or p_quantity is null or p_quantity not between 0 and 1000000 or (p_action<>'adjust' and p_quantity=0) or p_reason is null or length(btrim(p_reason)) not between 1 and 512 then raise exception 'Action invalide'; end if;
 payload:=jsonb_build_array(p_action,p_from,p_to,p_quantity,p_expected,btrim(p_reason));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into prior from public.stock_location_events where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if prior.asset_id<>p_asset_id or prior.payload<>payload then raise exception 'Requête déjà utilisée'; end if;
  return prior.id;
 end if;
 select * into a from public.stock_assets where id=p_asset_id for update;
 if not found or a.archived_at is not null or a.tracking_mode<>'quantity' then raise exception 'Référence indisponible'; end if;
 if p_expected is distinct from jsonb_build_array(a.quantity,a.quantity_mi,a.quantity_cs) then raise exception 'La répartition a changé. Actualisez puis recommencez.'; end if;
 q:=a.quantity;mi:=a.quantity_mi;cs:=a.quantity_cs;
 amount:=case p_from when 'MI' then mi when 'CS' then cs else q-mi-cs end;
 if p_action='transfer' then
  if p_from=p_to or p_quantity>amount then raise exception 'Transfert impossible : origine, destination ou quantité incorrecte'; end if;
  mi:=mi+case when p_to='MI' then p_quantity else 0 end-case when p_from='MI' then p_quantity else 0 end;
  cs:=cs+case when p_to='CS' then p_quantity else 0 end-case when p_from='CS' then p_quantity else 0 end;
 else
  delta:=case p_action when 'entry' then p_quantity when 'exit' then -p_quantity else p_quantity-amount end;
  if delta<0 and -delta>amount then raise exception 'Stock insuffisant à cet emplacement'; end if;
  q:=q+delta;
  mi:=mi+case when (case when p_action='entry' then p_to else p_from end)='MI' then delta else 0 end;
  cs:=cs+case when (case when p_action='entry' then p_to else p_from end)='CS' then delta else 0 end;
 end if;
 if q not between 0 and 1000000 or mi<0 or cs<0 or mi+cs>q then raise exception 'Répartition invalide'; end if;
 update public.stock_assets set quantity_mi=least(quantity_mi,mi),quantity_cs=least(quantity_cs,cs) where id=a.id;
 if q<>a.quantity then
  perform public.record_stock_movement_once(a.id,case when q>a.quantity then 'entry' else 'exit' end,abs(q-a.quantity),left(p_action||' '||p_from||' → '||p_to||' : '||btrim(p_reason),512),p_request_id);
 end if;
 update public.stock_assets set quantity_mi=mi,quantity_cs=cs,quantity_defaulted=case when p_action='adjust' then false else quantity_defaulted end where id=a.id;
 insert into public.stock_location_events(asset_id,user_id,request_id,action,reason,payload,before_data,after_data) values(a.id,auth.uid(),p_request_id,p_action,btrim(p_reason),payload,jsonb_build_array(a.quantity,a.quantity_mi,a.quantity_cs),jsonb_build_array(q,mi,cs)) returning id into result;
 return result;
end;
$$;
revoke all on function public.manage_located_stock(uuid,text,text,text,integer,jsonb,text,uuid) from public,anon;
grant execute on function public.manage_located_stock(uuid,text,text,text,integer,jsonb,text,uuid) to authenticated;
commit;
