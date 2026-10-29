begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventory-report-photos','inventory-report-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy inventory_report_photo_admin on storage.objects for select to authenticated
using(bucket_id='inventory-report-photos' and public.stock_is_admin());
-- Téléversement uniquement par la fonction serveur après vérification anti-abus.
commit;
