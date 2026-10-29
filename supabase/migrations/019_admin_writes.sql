begin;
-- Renforce toutes les anciennes RPC avant leur contrôle de rejeu.
-- Les signatures et les transactions existantes sont conservées.
do $$
declare signature text; definition text;
begin
 foreach signature in array array[
 'public.record_stock_movement(uuid,text,integer,text)',
 'public.record_stock_movement_once(uuid,text,integer,text,uuid)',
 'public.save_stock_asset(uuid,jsonb,integer)',
 'public.create_stock_category(text,text)',
 'public.manage_stock_asset(uuid,text,integer,integer,text,uuid)',
 'public.save_stock_reference(uuid,jsonb,integer,text)',
 'public.convert_stock_reference(jsonb,integer,text,uuid)',
 'public.manage_stock_device(uuid,uuid,text,jsonb,timestamptz,uuid)',
 'public.manage_located_stock(uuid,text,text,text,integer,jsonb,text,uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if strpos(definition,'perform public.require_stock_admin();')=0 then
   if strpos(definition,E'\nbegin\n')=0 then raise exception 'Fonction à vérifier : %',signature; end if;
   execute regexp_replace(definition,E'\nbegin\n',E'\nbegin\n perform public.require_stock_admin();\n');
  end if;
 end loop;
end;
$$;
-- Défense complémentaire sur les écritures de données.
create or replace function public.guard_stock_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Les migrations SQL sans JWT restent possibles pour le propriétaire de base.
 if auth.uid() is not null then perform public.require_stock_admin(); end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.guard_stock_write() from public,anon,authenticated;
do $$
declare table_name text;
begin
 foreach table_name in array array['stock_assets','stock_movements','stock_devices','stock_category_catalog','stock_asset_events','stock_tracking_events','stock_device_events','stock_location_events'] loop
  execute format('drop trigger if exists admin_write on public.%I',table_name);
  execute format('create trigger admin_write before insert or update or delete on public.%I for each row execute function public.guard_stock_write()',table_name);
 end loop;
end;
$$;
drop policy if exists stock_photo_upload on storage.objects;
create policy stock_photo_upload on storage.objects for insert to authenticated with check
(bucket_id='stock-photos' and name ~ '^photos/[0-9a-f-]{36}\.(jpg|png|webp)$' and (select public.stock_is_admin()));
commit;
