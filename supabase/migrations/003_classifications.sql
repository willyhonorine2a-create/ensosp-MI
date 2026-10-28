-- Référentiel du document Classifications magasin.docx.
-- Codes complétés par les codes correspondants de la trame Excel.
-- Aucun reclassement de codes existants, aucune modification des quantités.
begin;
create table if not exists public.stock_genres (
 code text primary key, label text not null
);
create table if not exists public.stock_categories (
 genre_code text not null references public.stock_genres(code),
 code text not null, label text not null,
 primary key (genre_code,code)
);
create table if not exists public.stock_subcategories (
 genre_code text not null, category_code text not null, code text not null, label text not null,
 primary key (genre_code,category_code,code),
 foreign key (genre_code,category_code) references public.stock_categories(genre_code,code)
);
insert into public.stock_genres (code,label) values
('INC','Matériel d’intervention incendie'),
('SR','Secours routier'),
('NET','Nettoyage'),
('PID','Pièces détachées'),
('EEE','Équipement électrique et électronique')
on conflict (code) do update set label=excluded.label;
alter table public.stock_genres enable row level security;
revoke all on public.stock_genres from anon,authenticated;
grant select on public.stock_genres to authenticated;
drop policy if exists member_read on public.stock_genres;
create policy member_read on public.stock_genres for select to authenticated using
(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
insert into public.stock_categories (genre_code,code,label) values
('INC','LAN','Lances'),
('INC','TUY','Tuyaux'),
('INC','JON','Pièces de jonction'),
('INC','ECH','Échelles'),
('INC','FDF','Feu de forêt'),
('INC','CLE','Clés'),
('INC','MAT','Matériels'),
('SR','OUT','Outillages'),
('EEE','ECA','Éclairage et alimentation')
on conflict (genre_code,code) do update set label=excluded.label;
alter table public.stock_categories enable row level security;
revoke all on public.stock_categories from anon,authenticated;
grant select on public.stock_categories to authenticated;
drop policy if exists member_read on public.stock_categories;
create policy member_read on public.stock_categories for select to authenticated using
(exists(select 1 from public.stock_members where user_id=(select auth.uid())));
insert into public.stock_subcategories (genre_code,category_code,code,label) values
('SR','OUT','COU','Outils de coupe'),
('SR','OUT','LEV','Outils de levage'),
('SR','OUT','ECA','Outils d’écartement'),
('SR','OUT','POL','Outils polyvalents'),
('SR','OUT','CAL','Outils de calage'),
('SR','OUT','MAT','Matériel'),
('EEE','ECA','ECL','Éclairage'),
('EEE','ECA','BAT','Batterie'),
('EEE','ECA','DET','Détecteurs'),
('EEE','ECA','COM','Communication'),
('EEE','ECA','RAL','Rallonges'),
('EEE','ECA','MAC','Machines à fumée'),
('EEE','ECA','VEN','Ventilateurs'),
('EEE','ECA','CAM','Caméras thermiques')
on conflict (genre_code,category_code,code) do update set label=excluded.label;
alter table public.stock_subcategories enable row level security;
revoke all on public.stock_subcategories from anon,authenticated;
grant select on public.stock_subcategories to authenticated;
drop policy if exists member_read on public.stock_subcategories;
create policy member_read on public.stock_subcategories for select to authenticated using
(exists(select 1 from public.stock_members where user_id=(select auth.uid())));

create or replace function public.validate_stock_classification()
returns trigger language plpgsql security definer set search_path='' as $$
declare category_label text; subcategory_label text;
begin
 -- Un ancien import rejoué avec ON CONFLICT DO NOTHING doit rester sans effet,
 -- y compris si sa classification historique est hors référentiel.
 if TG_OP='INSERT' and new.import_key is not null then
  if exists(select 1 from public.stock_assets a where a.import_key=new.import_key
   and row(a.genre,a.category,a.subcategory) is not distinct from row(new.genre,new.category,new.subcategory)) then
   return new;
  end if;
 end if;
 -- Permet de modifier les autres champs d'une ancienne fiche non conforme,
 -- sans inventer un reclassement. Toute NOUVELLE combinaison doit être valide.
 if TG_OP='UPDATE' then
  if row(new.genre,new.category,new.subcategory) is not distinct from row(old.genre,old.category,old.subcategory) then
   new.category_name := old.category_name;
   new.subcategory_name := old.subcategory_name;
   return new;
  end if;
 end if;
 if nullif(new.genre,'') is null then
  if nullif(new.category,'') is not null or nullif(new.subcategory,'') is not null then
   raise exception 'Choisissez un genre avant une catégorie';
  end if;
 else
  if not exists(select 1 from public.stock_genres where code=new.genre) then raise exception 'Genre hors référentiel'; end if;
 end if;
 if nullif(new.category,'') is null then
  if nullif(new.subcategory,'') is not null then raise exception 'Choisissez une catégorie avant une sous-catégorie'; end if;
 else
  select label into category_label from public.stock_categories where genre_code=new.genre and code=new.category;
  if not found then raise exception 'Catégorie incompatible avec ce genre'; end if;
 end if;
 if nullif(new.subcategory,'') is not null then
  select label into subcategory_label from public.stock_subcategories where genre_code=new.genre and category_code=new.category and code=new.subcategory;
  if not found then raise exception 'Sous-catégorie incompatible avec cette catégorie'; end if;
 end if;
 new.category_name := category_label;
 new.subcategory_name := subcategory_label;
 return new;
end;
$$;
revoke all on function public.validate_stock_classification() from public,anon,authenticated;
-- Renseigne uniquement les libellés des combinaisons déjà reconnues.
-- Le trigger est reposé après la mise à jour pour rendre le script réexécutable.
drop trigger if exists stock_asset_classification on public.stock_assets;
update public.stock_assets a set category_name=c.label
from public.stock_categories c where a.genre=c.genre_code and a.category=c.code;
update public.stock_assets a set subcategory_name=s.label
from public.stock_subcategories s where a.genre=s.genre_code and a.category=s.category_code and a.subcategory=s.code;
create trigger stock_asset_classification before insert or update on public.stock_assets
for each row execute function public.validate_stock_classification();
commit;
-- Les lignes retournées ci-dessous sont à rapprocher manuellement ; aucun code n'est modifié.
select genre,category,subcategory,count(*) as biens_a_verifier from public.stock_assets a
where (nullif(genre,'') is not null and not exists(select 1 from public.stock_genres g where g.code=a.genre))
or (nullif(category,'') is not null and not exists(select 1 from public.stock_categories c where c.genre_code=a.genre and c.code=a.category))
or (nullif(subcategory,'') is not null and not exists(select 1 from public.stock_subcategories s where s.genre_code=a.genre and s.category_code=a.category and s.code=a.subcategory))
group by genre,category,subcategory order by genre,category,subcategory;
