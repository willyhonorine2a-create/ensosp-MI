-- Complément à exécuter après 001_stock.sql dans le projet de test.
begin;
alter table public.stock_movements add column if not exists request_id uuid;
create unique index if not exists stock_movement_request_unique on public.stock_movements(user_id,request_id) where request_id is not null;

create or replace function public.record_stock_movement_once(p_asset_id uuid,p_type text,p_quantity integer,p_reason text,p_request_id uuid)
returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare previous public.stock_movements; result public.stock_movements;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then
  raise exception 'Accès au magasin non autorisé' using errcode='42501';
 end if;
 if p_request_id is null then raise exception 'Identifiant de requête manquant'; end if;
 -- Sérialise les doubles envois du même mouvement, sans bloquer les autres requêtes.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_request_id::text,0));
 select * into previous from public.stock_movements where user_id=auth.uid() and request_id=p_request_id;
 if found then
  if previous.asset_id is distinct from p_asset_id or previous.movement_type is distinct from p_type or previous.quantity is distinct from p_quantity or previous.reason is distinct from p_reason then
   raise exception 'Identifiant de requête déjà utilisé pour un autre mouvement';
  end if;
  return previous;
 end if;
 result := public.record_stock_movement(p_asset_id,p_type,p_quantity,p_reason);
 update public.stock_movements set request_id=p_request_id where id=result.id returning * into result;
 return result;
end;
$$;
revoke all on function public.record_stock_movement_once(uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.record_stock_movement_once(uuid,text,integer,text,uuid) to authenticated;

create or replace function public.save_stock_asset(p_id uuid,p_data jsonb,p_initial_quantity integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare item public.stock_assets; result_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then
  raise exception 'Accès au magasin non autorisé' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Fiche invalide'; end if;
 item := jsonb_populate_record(null::public.stock_assets,p_data);
 if item.designation is null or length(btrim(item.designation))=0 then raise exception 'Désignation obligatoire'; end if;
 if length(item.designation) > 100 then raise exception 'Champ designation trop long (100 caractères maximum)'; end if;
 if length(item.asset_code) > 25 then raise exception 'Champ asset_code trop long (25 caractères maximum)'; end if;
 if length(item.short_name) > 30 then raise exception 'Champ short_name trop long (30 caractères maximum)'; end if;
 if length(item.genre) > 5 then raise exception 'Champ genre trop long (5 caractères maximum)'; end if;
 if length(item.category) > 10 then raise exception 'Champ category trop long (10 caractères maximum)'; end if;
 if length(item.category_name) > 50 then raise exception 'Champ category_name trop long (50 caractères maximum)'; end if;
 if length(item.subcategory) > 10 then raise exception 'Champ subcategory trop long (10 caractères maximum)'; end if;
 if length(item.subcategory_name) > 50 then raise exception 'Champ subcategory_name trop long (50 caractères maximum)'; end if;
 if length(item.reference) > 40 then raise exception 'Champ reference trop long (40 caractères maximum)'; end if;
 if length(item.serial_number) > 30 then raise exception 'Champ serial_number trop long (30 caractères maximum)'; end if;
 if length(item.barcode) > 25 then raise exception 'Champ barcode trop long (25 caractères maximum)'; end if;
 if length(item.service_code) > 7 then raise exception 'Champ service_code trop long (7 caractères maximum)'; end if;
 if length(item.service_name) > 30 then raise exception 'Champ service_name trop long (30 caractères maximum)'; end if;
 if length(item.location) > 80 then raise exception 'Champ location trop long (80 caractères maximum)'; end if;
 if length(item.condition_code) > 2 then raise exception 'Champ condition_code trop long (2 caractères maximum)'; end if;
 if length(item.supplier_code) > 10 then raise exception 'Champ supplier_code trop long (10 caractères maximum)'; end if;
 if length(item.manager_code) > 7 then raise exception 'Champ manager_code trop long (7 caractères maximum)'; end if;
 if length(item.parent_code) > 25 then raise exception 'Champ parent_code trop long (25 caractères maximum)'; end if;
 if length(item.notes) > 512 then raise exception 'Champ notes trop long (512 caractères maximum)'; end if;
 if item.minimum_quantity is null or item.minimum_quantity < 0 or item.minimum_quantity > 1000000 then raise exception 'Seuil invalide'; end if;
 if p_id is null then
  if p_initial_quantity is null or p_initial_quantity < 0 or p_initial_quantity > 1000000 then raise exception 'Quantité initiale invalide'; end if;
  insert into public.stock_assets (designation, asset_code, short_name, genre, category, category_name, subcategory, subcategory_name, reference, serial_number, barcode, service_code, service_name, location, condition_code, supplier_code, manager_code, parent_code, notes, registered_at, purchased_at, assigned_at, warranty_until, minimum_quantity,quantity) values (item.designation, item.asset_code, item.short_name, item.genre, item.category, item.category_name, item.subcategory, item.subcategory_name, item.reference, item.serial_number, item.barcode, item.service_code, item.service_name, item.location, item.condition_code, item.supplier_code, item.manager_code, item.parent_code, item.notes, item.registered_at, item.purchased_at, item.assigned_at, item.warranty_until, item.minimum_quantity,p_initial_quantity) returning id into result_id;
 else
  if p_initial_quantity is not null then raise exception 'Utilisez un mouvement pour modifier le stock'; end if;
  update public.stock_assets set designation=item.designation, asset_code=item.asset_code, short_name=item.short_name, genre=item.genre, category=item.category, category_name=item.category_name, subcategory=item.subcategory, subcategory_name=item.subcategory_name, reference=item.reference, serial_number=item.serial_number, barcode=item.barcode, service_code=item.service_code, service_name=item.service_name, location=item.location, condition_code=item.condition_code, supplier_code=item.supplier_code, manager_code=item.manager_code, parent_code=item.parent_code, notes=item.notes, registered_at=item.registered_at, purchased_at=item.purchased_at, assigned_at=item.assigned_at, warranty_until=item.warranty_until, minimum_quantity=item.minimum_quantity where id=p_id returning id into result_id;
  if not found then raise exception 'Matériel introuvable'; end if;
 end if;
 return result_id;
end;
$$;
revoke all on function public.save_stock_asset(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_stock_asset(uuid,jsonb,integer) to authenticated;
commit;
