begin;
create table if not exists public.stock_category_catalog (
 code text primary key check (code ~ '^[A-Z0-9_]{1,10}$'),
 label text not null check (length(btrim(label)) between 1 and 50)
);
insert into public.stock_category_catalog(code,label) values
('LAN','LANCES'),
('TUY','TUYAUX'),
('JON','PIECES JONCTION'),
('ECH','ECHELLES'),
('MAT','MATERIELS DIVERS'),
('CAM','CAMERAS THERMIQUES'),
('SER','SECOURS ROUTIER'),
('NET','NETTOYAGE'),
('PID','PIECES DETACHEES'),
('MAC','MACHINES A FUMEES'),
('COM','COMMUNICATION'),
('DET','DETECTEURS')
on conflict(code) do update set label=excluded.label;
alter table public.stock_category_catalog enable row level security;
revoke all on public.stock_category_catalog from anon,authenticated;
grant select on public.stock_category_catalog to authenticated;
drop policy if exists member_read on public.stock_category_catalog;
create policy member_read on public.stock_category_catalog for select to authenticated using
(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
alter table public.stock_assets add column if not exists legacy_classification jsonb;
alter table public.stock_assets add column if not exists photo_path text;
drop trigger if exists stock_asset_classification on public.stock_assets;
update public.stock_assets set legacy_classification=jsonb_build_object('genre',genre,'category',category,'subcategory',subcategory,'category_name',category_name,'subcategory_name',subcategory_name)
where legacy_classification is null;
-- Les anciens codes non retenus sont archivés et affichés « À classer ».
update public.stock_assets a set category=null,category_name=null
where nullif(category,'') is not null and not exists(select 1 from public.stock_category_catalog c where c.code=a.category);
update public.stock_assets a set category_name=c.label from public.stock_category_catalog c where c.code=a.category;
alter table public.stock_assets drop constraint if exists stock_assets_category_catalog_fkey;
alter table public.stock_assets add constraint stock_assets_category_catalog_fkey foreign key(category) references public.stock_category_catalog(code);

create or replace function public.validate_stock_classification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if nullif(new.category,'') is null then new.category:=null; new.category_name:=null;
 else
  select label into new.category_name from public.stock_category_catalog where code=new.category;
  if not found then raise exception 'Catégorie inconnue'; end if;
 end if;
 -- Les anciennes colonnes ne sont plus utilisées pour le classement.
 if TG_OP='UPDATE' then
  new.genre:=old.genre; new.subcategory:=old.subcategory; new.subcategory_name:=old.subcategory_name;
  new.legacy_classification:=old.legacy_classification;
 else new.genre:=null; new.subcategory:=null; new.subcategory_name:=null;
 end if;
 if new.photo_path is not null then
  if new.photo_path !~ '^photos/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'Chemin de photo invalide'; end if;
  if TG_OP='INSERT' or new.photo_path is distinct from old.photo_path then
   if not exists(select 1 from storage.objects where bucket_id='stock-photos' and name=new.photo_path) then raise exception 'Photo non téléversée'; end if;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.validate_stock_classification() from public,anon,authenticated;
create trigger stock_asset_classification before insert or update on public.stock_assets
for each row execute function public.validate_stock_classification();

create or replace function public.create_stock_category(p_code text,p_label text)
returns public.stock_category_catalog language plpgsql security definer set search_path='' as $$
declare result public.stock_category_catalog;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then raise exception 'Accès au magasin non autorisé' using errcode='42501'; end if;
 insert into public.stock_category_catalog(code,label) values(upper(btrim(p_code)),btrim(p_label)) returning * into result;
 return result;
end;
$$;
revoke all on function public.create_stock_category(text,text) from public,anon;
grant execute on function public.create_stock_category(text,text) to authenticated;
create or replace function public.save_stock_asset(p_id uuid,p_data jsonb,p_initial_quantity integer default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare item public.stock_assets; result_id uuid; field text; max_length integer;
begin
 if auth.uid() is null or not exists(select 1 from public.stock_members where user_id=auth.uid()) then
  raise exception 'Accès au magasin non autorisé' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Fiche invalide'; end if;
 item := jsonb_populate_record(null::public.stock_assets,p_data);
 if item.designation is null or length(btrim(item.designation))=0 then raise exception 'Désignation obligatoire'; end if;
 for field, max_length in select key,value::integer from jsonb_each_text('{"designation": 100, "asset_code": 25, "short_name": 30, "category": 10, "reference": 40, "serial_number": 30, "barcode": 25, "service_code": 7, "service_name": 30, "location": 80, "condition_code": 2, "supplier_code": 10, "manager_code": 7, "parent_code": 25, "notes": 512}'::jsonb) loop
  if length(p_data->>field)>max_length then raise exception 'Champ % : % caractères maximum',field,max_length; end if;
 end loop;
 if item.minimum_quantity is null or item.minimum_quantity < 0 or item.minimum_quantity > 1000000 then raise exception 'Seuil invalide'; end if;
 if p_id is null then
  if p_initial_quantity is null or p_initial_quantity < 0 or p_initial_quantity > 1000000 then raise exception 'Quantité initiale invalide'; end if;
  insert into public.stock_assets (designation, asset_code, short_name, genre, category, category_name, subcategory, subcategory_name, reference, serial_number, barcode, service_code, service_name, location, condition_code, supplier_code, manager_code, parent_code, notes, registered_at, purchased_at, assigned_at, warranty_until, minimum_quantity,photo_path,quantity) values (item.designation, item.asset_code, item.short_name, item.genre, item.category, item.category_name, item.subcategory, item.subcategory_name, item.reference, item.serial_number, item.barcode, item.service_code, item.service_name, item.location, item.condition_code, item.supplier_code, item.manager_code, item.parent_code, item.notes, item.registered_at, item.purchased_at, item.assigned_at, item.warranty_until, item.minimum_quantity,item.photo_path,p_initial_quantity) returning id into result_id;
 else
  if p_initial_quantity is not null then raise exception 'Utilisez un mouvement pour modifier le stock'; end if;
  update public.stock_assets set designation=item.designation, asset_code=item.asset_code, short_name=item.short_name, genre=item.genre, category=item.category, category_name=item.category_name, subcategory=item.subcategory, subcategory_name=item.subcategory_name, reference=item.reference, serial_number=item.serial_number, barcode=item.barcode, service_code=item.service_code, service_name=item.service_name, location=item.location, condition_code=item.condition_code, supplier_code=item.supplier_code, manager_code=item.manager_code, parent_code=item.parent_code, notes=item.notes, registered_at=item.registered_at, purchased_at=item.purchased_at, assigned_at=item.assigned_at, warranty_until=item.warranty_until, minimum_quantity=item.minimum_quantity, photo_path=item.photo_path where id=p_id returning id into result_id;
  if not found then raise exception 'Matériel introuvable'; end if;
 end if;
 return result_id;
end;
$$;
revoke all on function public.save_stock_asset(uuid,jsonb,integer) from public,anon;
grant execute on function public.save_stock_asset(uuid,jsonb,integer) to authenticated;

commit;
