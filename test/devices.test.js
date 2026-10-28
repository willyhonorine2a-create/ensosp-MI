import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {groupReferences} from '../src/references.js';

test('regrouper les quantités par catégorie, désignation et référence, sans confondre les modes',()=>{
 const a={id:'a',name:' ANTARI  FOG ',reference:'R1',category:'MAC',stock:2,trackingMode:'quantity'};
 const b={...a,id:'b',name:'antari fog',stock:3};
 const groups=groupReferences([a,b,{...a,id:'c',reference:'R2',stock:1},{...a,id:'d',trackingMode:'individual',stock:7,availableStock:5}]);
 assert.equal(groups.length,3);assert.equal(groups[0].stock,5);assert.equal(groups[0].members.length,2);assert.equal(groups[2].availableStock,5);
 assert.equal(a.stock,2);
});
test('références et appareils : conversion, droits, comptage automatique, fiches facultatives et concurrence',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create schema storage;create table storage.objects(bucket_id text,name text);`);
  const files=['001_stock.sql','002_preview.sql','005_simple_categories.sql','007_inventory_actions.sql','008_manage_stock.sql','009_devices_schema.sql','010_devices_counts.sql','011_save_reference.sql','012_convert_reference.sql','013_manage_device.sql'];
  for(const file of files){const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');await db.exec(sql);if(Number(file.slice(0,3))>=9)await db.exec(sql);}
  const user='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users values($1),($2)',[user,outsider]);await db.query('insert into stock_members(user_id) values($1)',[user]);
  const req=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const create=(name,quantity,mode)=>db.query('select save_stock_reference(null,$1,$2,$3) as id',[{designation:name,category:'MAC',minimum_quantity:0},quantity,mode]);
  await db.exec('set role anon');await assert.rejects(create('Refus',1,'individual'));await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await db.exec('set role authenticated');await assert.rejects(create('Refus',1,'individual'));assert.equal((await db.query('select * from stock_reference_inventory')).rows.length,0);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  const quantityId=(await create('Tuyaux',54,'quantity')).rows[0].id;
  assert.equal((await db.query('select count(*)::int as n from stock_devices')).rows[0].n,0);
  const creationData={designation:'Générateurs',category:'MAC',minimum_quantity:0,request_id:req(9)};
  const individualId=(await db.query('select save_stock_reference(null,$1,7,$2) as id',[creationData,'individual'])).rows[0].id;
  assert.equal((await db.query('select save_stock_reference(null,$1,7,$2) as id',[creationData,'individual'])).rows[0].id,individualId);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[individualId])).rows[0].quantity,7);
  assert.equal((await db.query('select * from stock_devices where asset_id=$1 and serial_number is null and purchased_at is null',[individualId])).rows.length,7);
  await assert.rejects(db.query('insert into stock_devices(asset_id) values($1)',[individualId]));
  await assert.rejects(db.query('select manage_stock_asset($1,$2,8,7,$3,$4)',[individualId,'adjust','Interdit',req(10)]));
  assert.equal((await db.query('select count(*)::int as n from stock_movements where asset_id=$1',[individualId])).rows[0].n,0);
  const a=(await create('ANTARI FOG',1,'quantity')).rows[0].id,b=(await create('ANTARI FOG',1,'quantity')).rows[0].id;
  const items=[{id:a,quantity:1},{id:b,quantity:1}];
  await assert.rejects(db.query('select convert_stock_reference($1,7,$2,$3)',[[{id:a,quantity:2},{id:b,quantity:1}],'Comptage',req(11)]));
  let parent;
  for(let i=0;i<2;i++)parent=(await db.query('select convert_stock_reference($1,7,$2,$3) as id',[items,'Comptage réel validé à 7',req(12)])).rows[0].id;
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[parent])).rows[0].quantity,7);
  assert.equal((await db.query('select count(*)::int as n from stock_devices where asset_id=$1',[parent])).rows[0].n,7);
  assert.equal((await db.query('select * from stock_assets where id=any($1) and archived_at is null',[[a,b]])).rows.length,1);
  const audit=(await db.query("select * from stock_tracking_events where reason='Comptage réel validé à 7'")).rows[0];assert.equal(audit.before_quantity,2);assert.equal(audit.after_quantity,7);
  const manage=(id,action,data,expected,n)=>db.query('select manage_stock_device($1,$2,$3,$4,$5,$6) as id',[parent,id,action,data,expected,req(n)]);
  let deviceId;
  for(let i=0;i<2;i++)deviceId=(await manage(null,'create',{},null,13)).rows[0].id;
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[parent])).rows[0].quantity,8);
  let device=(await db.query('select id,updated_at::text as updated_at from stock_devices where id=$1',[deviceId])).rows[0];
  await manage(deviceId,'save',{serial_number:'SN001',purchased_at:'2024-01-10',warranty_until:'2027-01-10',status:'maintenance'},device.updated_at,14);
  await assert.rejects(manage(deviceId,'save',{},device.updated_at,15));
  assert.equal(Number((await db.query('select available_devices from stock_reference_inventory where id=$1',[parent])).rows[0].available_devices),7);
  await assert.rejects(manage(null,'create',{serial_number:'SN001'},null,16));
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[parent])).rows[0].quantity,8);
  device=(await db.query('select id,updated_at::text as updated_at from stock_devices where id=$1',[deviceId])).rows[0];
  for(let i=0;i<2;i++)await manage(deviceId,'retire',{},device.updated_at,17);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[parent])).rows[0].quantity,7);
  assert.ok((await db.query('select retired_at from stock_devices where id=$1',[deviceId])).rows[0].retired_at);
  await db.query('select record_stock_movement_once($1,$2,1,$3,$4)',[quantityId,'exit','Tuyau utilisé',req(18)]);
  assert.equal((await db.query('select quantity from stock_assets where id=$1',[quantityId])).rows[0].quantity,53);
  await db.query('select manage_stock_asset($1,$2,7,7,$3,$4)',[parent,'archive','Référence retirée',req(19)]);
  await assert.rejects(manage(null,'create',{},null,20));
 }finally{await db.close();}
});
