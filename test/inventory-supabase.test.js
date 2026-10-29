import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('inventaires : consultation anonyme, écritures admin, historique atomique et concurrence',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.stock_is_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
 create function public.require_stock_admin() returns void language plpgsql as $$begin if not public.stock_is_admin() then raise exception 'Admin requis'; end if; end;$$;`);
 await db.exec(await readFile(new URL('../supabase/migrations/022_public_inventory.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/023_seed_public_inventory.sql',import.meta.url),'utf8'));
 await db.exec('set role anon');assert.equal((await db.query('select * from inventory_vehicles')).rows.length,46);
 const save=(id=null,revision=null,center='ALPHA',sheet=null)=>db.query('select save_inventory_vehicle($1,$2,$3,$4,$5,$6,$7) id',[id,revision,'FPT TEST','TEST-001',center,sheet,'Test affectation']);
 await assert.rejects(save());await assert.rejects(db.query("insert into inventory_vehicles(name,registration,center) values('A','B','C')"));
 await db.exec('reset role;set role authenticated');await assert.rejects(save());
 await db.exec("select set_config('test.admin','true',false)");const id=(await save()).rows[0].id;
 await save(id,1,'BRAVO');await assert.rejects(save(id,1,'CHARLIE'));
 const events=(await db.query('select * from inventory_events order by id')).rows;assert.equal(events.length,2);assert.equal(events[1].before_data.center,'ALPHA');assert.equal(events[1].after_data.center,'BRAVO');
 await assert.rejects(save(id,2,'CHARLIE',{sections:[{label:'Cabine',items:[{designation:'Tuyau',quantity:-1}]}],photos:[]}));
 assert.equal((await db.query('select revision from inventory_vehicles where id=$1',[id])).rows[0].revision,2);
 await assert.rejects(db.query("update inventory_vehicles set center='DIRECT' where id=$1",[id]));await assert.rejects(db.query('delete from inventory_events'));
 await db.exec("select set_config('test.admin','false',false)");assert.equal((await db.query('select * from inventory_events')).rows.length,0);
 await db.exec('reset role');
 await db.exec("update inventory_vehicles set center='CENTRE MODIFIE' where id='fpt-13';update inventory_vehicles set revision=2 where id='fpt-14'");
 const batch=await readFile(new URL('../supabase/migrations/024_import_vehicle_sheets.sql',import.meta.url),'utf8');
 await db.exec(batch);
 assert.equal((await db.query("select center from inventory_vehicles where id='fpt-13'")).rows[0].center,'CENTRE MODIFIE');
 assert.equal((await db.query("select sheet from inventory_vehicles where id='fpt-14'")).rows[0].sheet,null);
 assert.equal((await db.query('select count(*)::int n from inventory_vehicles where sheet is not null')).rows[0].n,16);
 const imported=(await db.query("select sheet from inventory_vehicles where id='ccrmsr-23'")).rows[0].sheet;
 assert.equal(imported.sections.reduce((n,s)=>n+s.items.length,0),80);assert.equal(imported.photos.length,2);
 const count=(await db.query('select count(*)::int n from inventory_events')).rows[0].n;
 await db.exec(batch);assert.equal((await db.query('select count(*)::int n from inventory_events')).rows[0].n,count);
 assert.equal((await db.query("select count(*)::int n from inventory_vehicles where registration='DC-315-JR'")).rows[0].n,0);
 }finally{await db.close();}
});
