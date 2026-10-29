import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildDashboard} from '../src/dashboard.js';

test('localisation : transferts conservatifs, droits, concurrence, corrections et comptage individuel',async()=>{
 const db=new PGlite();try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.objects(bucket_id text,name text);`);
 const files=['001_stock','002_preview','005_simple_categories','007_inventory_actions','008_manage_stock','009_devices_schema','010_devices_counts','011_save_reference','012_convert_reference','013_manage_device','014_physical_locations','015_location_counts','016_device_locations','017_located_stock'];
 for(const f of files){const sql=await readFile(new URL(`../supabase/migrations/${f}.sql`,import.meta.url),'utf8');await db.exec(sql);if(Number(f.slice(0,3))>=14)await db.exec(sql);}
 const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users values($1),($2)',[uid,other]);await db.query('insert into stock_members(user_id) values($1)',[uid]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 const create=async(mode,n)=>(await db.query('select save_stock_reference(null,$1,$2,$3) id',[{designation:'Tuyaux',category:'TUY',minimum_quantity:0},n,mode])).rows[0].id;
 const id=await create('quantity',10);let sequence=100;
 const req=()=>`00000000-0000-4000-8000-${String(sequence++).padStart(12,'0')}`;
 const snapshot=async()=>{const a=(await db.query('select quantity,quantity_mi,quantity_cs from stock_assets where id=$1',[id])).rows[0];return [a.quantity,a.quantity_mi,a.quantity_cs];};
 const call=(action,from,to,n,expected,request=req())=>db.query('select manage_located_stock($1,$2,$3,$4,$5,$6,$7,$8)',[id,action,from,to,n,expected,'Comptage ou transfert',request]);
 assert.deepEqual(await snapshot(),[10,0,0]);
 await db.exec('reset role;set role anon');await assert.rejects(call('transfer','UNSET','MI',1,[10,0,0]));await db.exec('reset role;set role authenticated');
 const request=req();await call('transfer','UNSET','MI',10,[10,0,0],request);await call('transfer','UNSET','MI',10,[10,0,0],request);
 assert.deepEqual(await snapshot(),[10,10,0]);
 await assert.rejects(call('transfer','MI','CS',2,[10,10,0],request));
 await call('transfer','MI','CS',4,[10,10,0]);assert.deepEqual(await snapshot(),[10,6,4]);
 await assert.rejects(call('transfer','MI','CS',1,[10,10,0]));
 await assert.rejects(call('transfer','MI','CS',7,[10,6,4]));
 await assert.rejects(call('exit','CS','CS',5,[10,6,4]));
 await call('entry','MI','MI',2,[10,6,4]);assert.deepEqual(await snapshot(),[12,8,4]);
 await call('exit','CS','CS',1,[12,8,4]);assert.deepEqual(await snapshot(),[11,8,3]);
 await call('adjust','MI','MI',5,[11,8,3]);assert.deepEqual(await snapshot(),[8,5,3]);
 await call('adjust','CS','CS',7,[8,5,3]);assert.deepEqual(await snapshot(),[12,5,7]);
 assert.equal((await db.query('select count(*)::int n from stock_location_events')).rows[0].n,6);
 await assert.rejects(db.query('update stock_assets set quantity_mi=0 where id=$1',[id]));
 await assert.rejects(db.query('select record_stock_movement_once($1,$2,1,$3,$4)',[id,'exit','Ancien client',req()]));
 await assert.rejects(db.query('select convert_stock_reference($1,12,$2,$3)',[[{id,quantity:12}],'Conversion',req()]));assert.deepEqual(await snapshot(),[12,5,7]);
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from stock_location_events')).rows.length,0);await assert.rejects(call('transfer','MI','CS',1,[12,5,7]));
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
 const parent=await create('individual',2);let device=(await db.query('select *,updated_at::text stamp from stock_devices where asset_id=$1 order by device_number',[parent])).rows[0];
 const save=(action,data,stamp,deviceId=device.id,request=req())=>db.query('select manage_stock_device($1,$2,$3,$4,$5,$6)',[parent,deviceId,action,data,stamp,request]);
 await save('save',{physical_location:'CS'},device.stamp);
 let a=(await db.query('select quantity,quantity_mi,quantity_cs from stock_assets where id=$1',[parent])).rows[0];assert.deepEqual(a,{quantity:2,quantity_mi:0,quantity_cs:1});
 await assert.rejects(save('save',{physical_location:'MI'},device.stamp));
 device=(await db.query('select *,updated_at::text stamp from stock_devices where id=$1',[device.id])).rows[0];
 await assert.rejects(save('save',{physical_location:'BAD'},device.stamp));
 await save('save',{physical_location:'MI',status:'maintenance'},device.stamp);
 a=(await db.query('select quantity,quantity_mi,quantity_cs from stock_assets where id=$1',[parent])).rows[0];assert.deepEqual(a,{quantity:2,quantity_mi:1,quantity_cs:0});
 device=(await db.query('select *,updated_at::text stamp from stock_devices where id=$1',[device.id])).rows[0];await save('retire',{},device.stamp);
 a=(await db.query('select quantity,quantity_mi,quantity_cs from stock_assets where id=$1',[parent])).rows[0];assert.deepEqual(a,{quantity:1,quantity_mi:0,quantity_cs:0});
 await save('create',{physical_location:'CS'},null,null);
 a=(await db.query('select quantity,quantity_mi,quantity_cs from stock_assets where id=$1',[parent])).rows[0];assert.deepEqual(a,{quantity:2,quantity_mi:0,quantity_cs:1});
 const unlocated=await create('quantity',2);
 await db.query('select convert_stock_reference($1,2,$2,$3)',[[{id:unlocated,quantity:2}],'Conversion sans affectation',req()]);
 assert.equal((await db.query('select count(*)::int n from stock_devices where asset_id=$1 and physical_location=$2',[unlocated,'UNSET'])).rows[0].n,2);
 await db.exec('reset role');
 for(const f of files.slice(-4))await db.exec(await readFile(new URL(`../supabase/migrations/${f}.sql`,import.meta.url),'utf8'));
 assert.deepEqual(await snapshot(),[12,5,7]);
 assert.equal((await db.query('select physical_location from stock_devices where id=$1',[device.id])).rows[0].physical_location,'MI');
 }finally{await db.close();}
});

test('les filtres MI / CS portent sur les quantités et appareils réels, y compris les garanties',()=>{
 const items=[{id:'q',name:'Tuyaux',stock:10,quantityMi:6,quantityCs:3,trackingMode:'quantity',minimum:0},{id:'d',name:'Caméras',stock:3,quantityMi:1,quantityCs:1,trackingMode:'individual',availableStock:2,minimum:0}];
 const facts=[{asset_id:'d',physical_location:'MI',status:'maintenance',warranty_until:'2020-01-01'},{asset_id:'d',physical_location:'CS',status:'available',warranty_until:'2030-01-01'},{asset_id:'d',physical_location:'UNSET',status:'available'}];
 const all=buildDashboard(items,[],facts,{},'2026-10-29');assert.deepEqual(all.locationTotals,{MI:7,CS:4,UNSET:2});assert.equal(all.units,13);
 const mi=buildDashboard(items,[],facts,{location:'MI'},'2026-10-29');assert.equal(mi.units,7);assert.equal(mi.available,6);assert.equal(mi.expired,1);assert.equal(mi.maintenance,1);assert.equal(mi.tracked,1);
 const cs=buildDashboard(items,[],facts,{location:'CS'},'2026-10-29');assert.equal(cs.units,4);assert.equal(cs.available,4);assert.equal(cs.expired,0);assert.equal(cs.unknownWarranty,0);
 const unknown=buildDashboard(items,[],facts,{location:'UNSET'},'2026-10-29');assert.equal(unknown.units,2);assert.equal(unknown.unknownWarranty,1);
 assert.equal(items[0].stock,10);
});
