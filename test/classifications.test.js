import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {classificationLabel,classificationIssue,classificationChoices} from '../src/classifications.js';
const ref=JSON.parse(await readFile(new URL('../reference/classifications.json',import.meta.url),'utf8'));
test('le référentiel Word fournit les libellés et les enfants du bon parent',()=>{
 assert.equal(ref.genres.length,5);assert.equal(ref.categories.length,9);assert.equal(ref.subcategories.length,14);
 assert.equal(classificationChoices(ref,'categories','INC').length,7);
 assert.equal(classificationChoices(ref,'categories','NET').length,0);
 assert.equal(classificationChoices(ref,'subcategories','EEE','ECA').length,8);
 assert.equal(classificationChoices(ref,'subcategories','SR','OUT').length,6);
 assert.equal(classificationLabel(ref,'subcategories',{genre:'SR',category:'OUT',subcategory:'ECA'}),'ECA · Outils d’écartement');
 assert.equal(classificationIssue(ref,{genre:'EQT',category:'ECA',subcategory:'CAM'}),true);
 assert.equal(classificationIssue(ref,{genre:'SR',category:'OUT',subcategory:'POLY'}),true);
 assert.equal(classificationIssue(ref,{genre:'EEE',category:'ECA',subcategory:'CAM'}),false);
});
test('la migration relie les classifications, protège les droits et conserve les anciens codes et stocks',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const name of ['001_stock.sql','002_preview.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const good=(await db.query("insert into stock_assets(designation,genre,category,subcategory,quantity) values ('Batterie','EEE','ECA','BAT',7) returning id")).rows[0].id;
  const legacy=(await db.query("insert into stock_assets(designation,genre,category,subcategory,quantity,import_key) values ('Caméra','EQT','ECA','CAM',6,'fixture:1') returning id")).rows[0].id;
  const sql=await readFile(new URL('../supabase/migrations/003_classifications.sql',import.meta.url),'utf8');
  const audit=await db.exec(sql);await db.exec(sql);
  assert.deepEqual(audit.at(-1).rows.map(r=>({...r,biens_a_verifier:Number(r.biens_a_verifier)})),[{genre:'EQT',category:'ECA',subcategory:'CAM',biens_a_verifier:1}]);
  await db.query("insert into stock_assets(designation,genre,category,subcategory,quantity,import_key) values ('Caméra','EQT','ECA','CAM',999,'fixture:1') on conflict(import_key) do nothing");
  assert.equal((await db.query('select count(*)::int as n from stock_genres')).rows[0].n,5);
  assert.equal((await db.query('select count(*)::int as n from stock_categories')).rows[0].n,9);
  assert.equal((await db.query('select count(*)::int as n from stock_subcategories')).rows[0].n,14);
  const row=(await db.query('select * from stock_assets where id=$1',[good])).rows[0];
  assert.equal(row.category_name,'Éclairage et alimentation');assert.equal(row.subcategory_name,'Batterie');assert.equal(row.quantity,7);
  const old=(await db.query('select * from stock_assets where id=$1',[legacy])).rows[0];assert.equal(old.genre,'EQT');assert.equal(old.quantity,6);
  const uid='00000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users values($1)',[uid]);await db.query('insert into stock_members(user_id) values($1)',[uid]);
  await db.exec('set role anon');await assert.rejects(db.query('select * from stock_genres'));await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from stock_genres')).rows.length,5);
  await assert.rejects(db.query("insert into stock_genres values('XXX','Inconnu')"));
  await db.query('select save_stock_asset($1,$2,null)',[legacy,{designation:'Caméra renommée',genre:'EQT',category:'ECA',subcategory:'CAM',minimum_quantity:0}]);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[legacy])).rows[0].quantity,6);
  await assert.rejects(db.query('select save_stock_asset(null,$1,1)',[{designation:'Incohérent',genre:'INC',category:'OUT',minimum_quantity:0}]));
  await assert.rejects(db.query('select save_stock_asset(null,$1,1)',[{designation:'Incohérent',genre:'EEE',category:'ECA',subcategory:'COU',minimum_quantity:0}]));
  await assert.rejects(db.query('select save_stock_asset(null,$1,1)',[{designation:'Inconnu',genre:'EQT',minimum_quantity:0}]));
  await db.query('select save_stock_asset($1,$2,null)',[legacy,{designation:'Caméra reclassée',genre:'EEE',category:'ECA',subcategory:'CAM',subcategory_name:'Faux libellé',minimum_quantity:0}]);
  const corrected=(await db.query('select * from stock_assets where id=$1',[legacy])).rows[0];
  assert.equal(corrected.subcategory_name,'Caméras thermiques');assert.equal(corrected.quantity,6);
  await db.query('select record_stock_movement_once($1,$2,$3,$4,$5)',[good,'exit',1,'Test','00000000-0000-4000-8000-000000000003']);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[good])).rows[0].quantity,6);
 } finally {await db.close();}
});

test('le reclassement MAC/CAM corrige uniquement EQT/ECA, sans changer les stocks et les données source',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  await db.exec(await readFile(new URL('../supabase/migrations/001_stock.sql',import.meta.url),'utf8'));
  await db.exec(`insert into stock_assets(designation,genre,category,subcategory,quantity,source_data)
   values ('Machine','EQT','ECA','MAC',7,'{"GENRE":"EQT"}'),
          ('Caméra','EQT','ECA','CAM',6,'{"GENRE":"EQT"}'),
          ('Machine déjà classée','EEE','ECA','MAC',3,'{}'),
          ('Autre classement','EQT','ECA','VEN',4,'{}'),
          ('Autre catégorie','EQT','AUTRE','CAM',5,'{}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/003_classifications.sql',import.meta.url),'utf8'));
  const before=(await db.query('select id,designation,quantity,source_data from stock_assets order by id')).rows;
  const sql=await readFile(new URL('../supabase/migrations/004_reclassify_mac_cam.sql',import.meta.url),'utf8');
  const results=await db.exec(sql);
  assert.deepEqual(results[0].rows.map(r=>({...r,biens_reclasses:Number(r.biens_reclasses),unites_conservees:Number(r.unites_conservees)})),[
   {sous_categorie:'CAM',biens_reclasses:1,unites_conservees:6},
   {sous_categorie:'MAC',biens_reclasses:1,unites_conservees:7}
  ]);
  assert.deepEqual((await db.query('select id,designation,quantity,source_data from stock_assets order by id')).rows,before);
  const fixed=(await db.query("select * from stock_assets where designation in ('Machine','Caméra') order by designation")).rows;
  for(const row of fixed){assert.equal(row.genre,'EEE');assert.equal(row.category,'ECA');assert.equal(row.category_name,'Éclairage et alimentation');}
  assert.equal(fixed[0].subcategory_name,'Caméras thermiques');assert.equal(fixed[1].subcategory_name,'Machines à fumée');
  assert.equal((await db.query("select count(*)::int as n from stock_assets where genre='EQT'")).rows[0].n,2);
  assert.equal((await db.exec(sql))[0].rows.length,0);
 } finally {await db.close();}
});
