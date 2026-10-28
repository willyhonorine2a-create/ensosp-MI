import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validatePhoto} from '../src/photos.js';
import {fromRow,toRow} from '../src/data.js';

test('photos : seuls JPEG, PNG et WebP de moins de 5 Mo sont admis',async()=>{
 for(const [type,bytes,expected] of [
  ['image/jpeg',[255,216,255,224],'jpg'],
  ['image/png',[137,80,78,71,13,10,26,10],'png'],
  ['image/webp',[82,73,70,70,0,0,0,0,87,69,66,80],'webp']
 ])assert.equal(await validatePhoto(new File([new Uint8Array(bytes)],'photo',{type})),expected);
 await assert.rejects(validatePhoto(new File(['<svg/>'],'photo.svg',{type:'image/svg+xml'})));
 await assert.rejects(validatePhoto(new File(['faux png'],'photo.png',{type:'image/png'})));
 await assert.rejects(validatePhoto(new File([new Uint8Array(5*1024*1024+1)],'trop-grand.jpg',{type:'image/jpeg'})));
 await assert.rejects(validatePhoto(new File([],'vide.png',{type:'image/png'})));
 const row=toRow(fromRow({id:'1',designation:'Caméra',category:'CAM',quantity:1,minimum_quantity:0,photo_path:'photos/a.jpg',genre:'EEE',subcategory:'CAM'}));
 assert.equal(row.photo_path,'photos/a.jpg');assert.equal(row.category,'CAM');assert.ok(!('genre' in row));assert.ok(!('subcategory' in row));
});

test('base : catégories simples, photos privées, accès membres et conservation des stocks',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create schema storage;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
   alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated;
   grant select,insert on storage.objects to authenticated;`);
  for(const name of ['001_stock.sql','002_preview.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const asset=(await db.query("insert into stock_assets(designation,genre,category,subcategory,quantity,source_data) values('Caméra','EQT','ECA','CAM',6,'{\"GENRE\":\"EQT\"}') returning id")).rows[0].id;
  for(const name of ['003_classifications.sql','005_simple_categories.sql','006_photos_storage.sql']){
   const sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');await db.exec(sql);if(name!=='003_classifications.sql')await db.exec(sql);
  }
  assert.equal((await db.query('select count(*)::int as n from stock_category_catalog')).rows[0].n,12);
  const old=(await db.query('select * from stock_assets where id=$1',[asset])).rows[0];
  assert.equal(old.quantity,6);assert.equal(old.legacy_classification.category,'ECA');assert.equal(old.category,null);
  assert.equal((await db.query("select public from storage.buckets where id='stock-photos'")).rows[0].public,false);
  const uid='00000000-0000-4000-8000-000000000001',out='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users values($1),($2)',[uid,out]);await db.query('insert into stock_members(user_id) values($1)',[uid]);
  await db.exec('set role anon');await assert.rejects(db.query('select * from stock_category_catalog'));await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[out]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from stock_category_catalog')).rows.length,0);
  await assert.rejects(db.query('select create_stock_category($1,$2)',['NEW','Nouveau']));
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('stock-photos','photos/00000000-0000-4000-8000-000000000009.jpg')"));
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  await db.query('select create_stock_category($1,$2)',['new','Nouvelle catégorie']);
  assert.equal((await db.query("select label from stock_category_catalog where code='NEW'")).rows[0].label,'Nouvelle catégorie');
  await assert.rejects(db.query('select create_stock_category($1,$2)',['NEW','Doublon']));
  await assert.rejects(db.query('select create_stock_category($1,$2)',['bad code','Libellé']));
  const data={designation:'Caméra',category:'CAM',minimum_quantity:0,photo_path:null};
  await db.query('select save_stock_asset($1,$2,null)',[asset,data]);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[asset])).rows[0].quantity,6);
  await assert.rejects(db.query('select save_stock_asset($1,$2,null)',[asset,{...data,category:'INCONNU'}]));
  const path='photos/00000000-0000-4000-8000-000000000009.jpg';
  await assert.rejects(db.query('select save_stock_asset($1,$2,null)',[asset,{...data,photo_path:path}]));
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['stock-photos',path]);
  await db.query('select save_stock_asset($1,$2,null)',[asset,{...data,photo_path:path}]);
  let row=(await db.query('select * from stock_assets where id=$1',[asset])).rows[0];
  assert.equal(row.photo_path,path);assert.equal(row.category_name,'CAMERAS THERMIQUES');assert.equal(row.genre,'EQT');assert.deepEqual(row.source_data,{GENRE:'EQT'});
  assert.equal(row.quantity,6);
  await db.query('select record_stock_movement_once($1,$2,1,$3,$4)',[asset,'exit','Test','00000000-0000-4000-8000-000000000010']);
  await db.query('select save_stock_asset($1,$2,null)',[asset,data]);
  row=(await db.query('select * from stock_assets where id=$1',[asset])).rows[0];assert.equal(row.photo_path,null);assert.equal(row.quantity,5);
  assert.equal((await db.query('select count(*)::int as n from storage.objects')).rows[0].n,1);
  await db.query('select save_stock_asset(null,$1,3)',[{designation:'Nouveau matériel',category:'NEW',minimum_quantity:1}]);
  assert.equal((await db.query("select quantity from stock_assets where designation='Nouveau matériel'")).rows[0].quantity,3);
 } finally {await db.close();}
});
