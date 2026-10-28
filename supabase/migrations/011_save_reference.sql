begin;
create or replace function public.save_stock_reference(p_id uuid,p_data jsonb,p_initial_quantity integer,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; current_mode text; request uuid; payload jsonb; prior public.stock_tracking_events;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then raise exception 'Accès au magasin non autorisé'; end if;
 if p_mode is null or p_mode not in ('quantity','individual') then raise exception 'Mode de suivi invalide'; end if;
 if p_id is not null then
  select tracking_mode into current_mode from public.stock_assets where id=p_id for update;
  if not found then raise exception 'Référence introuvable'; end if;
  if p_mode<>current_mode then raise exception 'Utilisez la conversion pour changer le mode de suivi'; end if;
  return public.save_stock_asset(p_id,p_data,null);
 end if;
 request:=coalesce(nullif(p_data->>'request_id','')::uuid,gen_random_uuid());
 payload:=jsonb_build_object('creation',p_data,'mode',p_mode,'quantity',p_initial_quantity);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||request::text,0));
 select * into prior from public.stock_tracking_events where user_id=auth.uid() and request_id=request;
 if found then
  if prior.payload<>payload then raise exception 'Requête déjà utilisée'; end if;
  return prior.asset_id;
 end if;
 if p_initial_quantity is null or p_initial_quantity<0 or (p_mode='individual' and p_initial_quantity>500) then raise exception 'Nombre initial invalide (500 appareils maximum)'; end if;
 result:=public.save_stock_asset(null,p_data,case when p_mode='individual' then 0 else p_initial_quantity end);
 if p_mode='individual' then
  insert into public.stock_devices(asset_id) select result from generate_series(1,p_initial_quantity);
  update public.stock_assets set tracking_mode='individual',quantity=p_initial_quantity,quantity_defaulted=false where id=result;
 end if;
 insert into public.stock_tracking_events(asset_id,user_id,request_id,payload,before_quantity,after_quantity,reason) values(result,auth.uid(),request,payload,0,p_initial_quantity,'Création de référence');
 return result;
end;
$$;
revoke all on function public.save_stock_reference(uuid,jsonb,integer,text) from public,anon;
grant execute on function public.save_stock_reference(uuid,jsonb,integer,text) to authenticated;
commit;
