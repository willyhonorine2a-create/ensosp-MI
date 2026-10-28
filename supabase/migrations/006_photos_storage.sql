-- Stockage privé : lecture et ajout réservés aux membres du magasin.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('stock-photos','stock-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists stock_photo_read on storage.objects;
create policy stock_photo_read on storage.objects for select to authenticated using
(bucket_id='stock-photos' and exists(select 1 from public.stock_members where user_id=(select auth.uid())));
drop policy if exists stock_photo_upload on storage.objects;
create policy stock_photo_upload on storage.objects for insert to authenticated with check
(bucket_id='stock-photos' and name ~ '^photos/[0-9a-f-]{36}\.(jpg|png|webp)$'
and exists(select 1 from public.stock_members where user_id=(select auth.uid())));
commit;
