begin;
create or replace function public.convert_stock_reference(p_items jsonb,p_count integer,p_reason text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare parent public.stock_assets; prior public.stock_tracking_events; ids uuid[]; n integer; total integer; row_item public.stock_assets;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then raise exception 'Accès au magasin non autorisé'; end if;
 if p_request_id is null or p_count is null or p_count not between 0 and 500 or p_reason is null or length(btrim(p_reason)) not between 1 and 512 or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Conversion invalide'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||p_request_id::text,0));
 select * into prior from public.stock_tracking_events where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if prior.payload<>p_items or prior.after_quantity<>p_count or prior.reason<>btrim(p_reason) then raise exception 'Requête déjà utilisée'; end if;
  return prior.asset_id;
 end if;
 select array_agg(id),count(distinct id) into ids,n from jsonb_to_recordset(p_items) as x(id uuid,quantity integer);
 if n is null or n<1 or n>100 or n<>jsonb_array_length(p_items) then raise exception 'Sélection invalide'; end if;
 perform id from public.stock_assets where id=any(ids) order by id for update;
 select * into parent from public.stock_assets where id=any(ids) order by (photo_path is null),id limit 1;
 if not found then raise exception 'Référence introuvable'; end if;
 if (select count(*) from public.stock_assets where id=any(ids) and archived_at is null and tracking_mode='quantity')<>n then raise exception 'Sélection périmée. Actualisez.'; end if;
 total:=0;
 for row_item in select * from public.stock_assets where id=any(ids) loop
  if row_item.quantity is distinct from (select quantity from jsonb_to_recordset(p_items) as x(id uuid,quantity integer) where x.id=row_item.id)
   or row(coalesce(row_item.category,''),lower(regexp_replace(btrim(row_item.designation),'\s+',' ','g')),lower(regexp_replace(btrim(coalesce(row_item.reference,'')),'\s+',' ','g')))
   is distinct from row(coalesce(parent.category,''),lower(regexp_replace(btrim(parent.designation),'\s+',' ','g')),lower(regexp_replace(btrim(coalesce(parent.reference,'')),'\s+',' ','g'))) then raise exception 'Les références ou stocks ont changé. Actualisez.'; end if;
  total:=total+row_item.quantity;
 end loop;
 insert into public.stock_devices(asset_id) select parent.id from generate_series(1,p_count);
 if n=1 and parent.quantity=1 and p_count>0 then
  update public.stock_devices set serial_number=parent.serial_number,purchased_at=parent.purchased_at,warranty_until=parent.warranty_until where id=(select id from public.stock_devices where asset_id=parent.id order by device_number limit 1);
 end if;
 update public.stock_assets set merged_into=parent.id,archived_at=now(),archived_by=auth.uid(),archive_reason='Regroupement : '||btrim(p_reason) where id=any(ids) and id<>parent.id;
 update public.stock_assets set tracking_mode='individual',quantity=p_count,quantity_defaulted=false where id=parent.id;
 insert into public.stock_tracking_events(asset_id,user_id,request_id,payload,before_quantity,after_quantity,reason) values(parent.id,auth.uid(),p_request_id,p_items,total,p_count,btrim(p_reason));
 return parent.id;
end;
$$;
revoke all on function public.convert_stock_reference(jsonb,integer,text,uuid) from public,anon;
grant execute on function public.convert_stock_reference(jsonb,integer,text,uuid) to authenticated;
commit;
