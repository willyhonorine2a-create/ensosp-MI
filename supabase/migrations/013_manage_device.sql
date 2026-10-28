begin;
create or replace function public.manage_stock_device(p_asset_id uuid,p_id uuid,p_action text,p_data jsonb,p_expected_at timestamptz,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare parent public.stock_assets; device public.stock_devices; old_data jsonb; payload jsonb; prior public.stock_device_events;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then raise exception 'Accès au magasin non autorisé'; end if;
 if p_request_id is null or p_action is null or p_action not in ('create','save','retire') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Action invalide'; end if;
 payload:=jsonb_build_object('id',p_id,'action',p_action,'data',p_data,'expected',p_expected_at);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into prior from public.stock_device_events where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if prior.asset_id<>p_asset_id or prior.payload<>payload then raise exception 'Requête déjà utilisée'; end if;
  return prior.device_id;
 end if;
 select * into parent from public.stock_assets where id=p_asset_id for update;
 if not found or parent.archived_at is not null or parent.tracking_mode<>'individual' then raise exception 'Référence indisponible pour le suivi individuel'; end if;
 if p_action='create' then
  if p_id is not null or p_expected_at is not null then raise exception 'Nouvel appareil invalide'; end if;
  insert into public.stock_devices(asset_id) values(p_asset_id) returning * into device;
 else
  select * into device from public.stock_devices where id=p_id and asset_id=p_asset_id and retired_at is null for update;
  if not found or p_expected_at is null or device.updated_at<>p_expected_at then raise exception 'Appareil modifié ou retiré. Actualisez la liste.'; end if;
  old_data:=to_jsonb(device);
 end if;
 if p_action='retire' then
  update public.stock_devices set retired_at=now(),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=device.id returning * into device;
 else
  update public.stock_devices set
   serial_number=nullif(btrim(p_data->>'serial_number'),''),
   purchased_at=nullif(p_data->>'purchased_at','')::date,
   warranty_until=nullif(p_data->>'warranty_until','')::date,
   status=coalesce(nullif(p_data->>'status',''),'available'),notes=nullif(btrim(p_data->>'notes'),''),
   updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=device.id returning * into device;
 end if;
 insert into public.stock_device_events(asset_id,device_id,user_id,request_id,payload,before_data,after_data) values(p_asset_id,device.id,auth.uid(),p_request_id,payload,old_data,to_jsonb(device));
 return device.id;
end;
$$;
revoke all on function public.manage_stock_device(uuid,uuid,text,jsonb,timestamptz,uuid) from public,anon;
grant execute on function public.manage_stock_device(uuid,uuid,text,jsonb,timestamptz,uuid) to authenticated;
commit;
