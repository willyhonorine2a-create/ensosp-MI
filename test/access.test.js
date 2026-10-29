import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('comptes : inscription sans privilège, validation admin, lecture seule effective et accès public isolé',async()=>{
 const db=new PGlite();try {
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
 const files=['001_stock','002_preview','005_simple_categories','007_inventory_actions','008_manage_stock','009_devices_schema','010_devices_counts','011_save_reference','012_convert_reference','013_manage_device','014_physical_locations','015_location_counts','016_device_locations','017_located_stock'];
 for(const name of files)await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 // Un membre existant n'est jamais promu automatiquement lors de la migration.
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id(1),'admin@example.test']);await db.query('insert into stock_members(user_id) values($1)',[id(1)]);
 const migrations=['018_access_requests','019_admin_writes','020_list_accounts','021_decide_accounts'];
 for(const name of migrations){const sql=await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);}
 assert.equal((await db.query('select role from stock_members')).rows[0].role,'reader');
 assert.equal((await db.query('select status from stock_access_requests')).rows[0].status,'approved');
 // Amorçage par le propriétaire SQL seulement.
 await db.query("update stock_members set role='admin' where user_id=$1",[id(1)]);
 for(const n of [2,3,4])await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[id(n),`user${n}@example.test`,n===4?null:'2026-10-29T09:00:00Z',{display_name:'Personne '+n,role:'admin'}]);
 assert.equal((await db.query('select count(*)::int n from stock_members')).rows[0].n,1);
 const as=async(n,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);await db.exec(`set role ${role}`);};
 let request=100;const decide=(n,status,role,expected='pending',expectedRole=null,req=id(request++))=>db.query('select decide_stock_account($1,$2,$3,$4,$5,$6)',[id(n),status,role,expected,expectedRole,req]);
 await as(1);
 const asset=(await db.query('select save_stock_reference(null,$1,5,$2) id',[{designation:'Tuyaux',category:'TUY',minimum_quantity:0},'quantity'])).rows[0].id;
 assert.equal((await db.query("select * from list_stock_accounts('pending',0,50)")).rows.length,3);
 await assert.rejects(decide(4,'approved','reader'));
 const approveRequest=id(request++);await decide(2,'approved','reader','pending',null,approveRequest);await decide(2,'approved','reader','pending',null,approveRequest);
 await assert.rejects(decide(2,'approved','admin','pending',null,approveRequest));
 await decide(3,'rejected',null);await assert.rejects(decide(1,'rejected',null,'approved','admin'));
 await as(2);
 assert.equal((await db.query('select designation from stock_assets')).rows.length,1);
 assert.equal((await db.query('select * from stock_members')).rows.length,1);assert.equal((await db.query('select role from stock_members')).rows[0].role,'reader');
 await assert.rejects(db.query('select * from list_stock_accounts()'));
 await assert.rejects(decide(3,'approved','admin','rejected',null));
 await assert.rejects(db.query("update stock_members set role='admin' where user_id=$1",[id(2)]));
 await assert.rejects(db.query("update stock_access_requests set status='approved' where user_id=$1",[id(2)]));
 const writes=[
  ['select record_stock_movement($1,$2,1,$3)',[asset,'entry','Interdit']],
  ['select record_stock_movement_once($1,$2,1,$3,$4)',[asset,'entry','Interdit',id(request++)]],
  ['select save_stock_asset(null,$1,1)',[{designation:'Interdit',category:'TUY',minimum_quantity:0}]],
  ['select create_stock_category($1,$2)',['TEST','Interdit']],
  ['select manage_stock_asset($1,$2,5,5,$3,$4)',[asset,'archive','Interdit',id(request++)]],
  ['select save_stock_reference(null,$1,1,$2)',[{designation:'Interdit',category:'TUY',minimum_quantity:0},'quantity']],
  ['select convert_stock_reference($1,5,$2,$3)',[[{id:asset,quantity:5}],'Interdit',id(request++)]],
  ['select manage_stock_device($1,null,$2,$3,null,$4)',[asset,'create',{},id(request++)]],
  ['select manage_located_stock($1,$2,$3,$4,1,$5,$6,$7)',[asset,'transfer','UNSET','MI',[5,0,0],'Interdit',id(request++)]]
 ];
 for(const [sql,args] of writes)await assert.rejects(db.query(sql,args),e=>e.code==='42501');
 await assert.rejects(db.query('insert into stock_assets(designation) values($1)',['Interdit']));
 await assert.rejects(db.query('insert into storage.objects values($1,$2)',['stock-photos','photos/'+id(99)+'.png']));
 await as(3);assert.equal((await db.query('select * from stock_assets')).rows.length,0);assert.equal((await db.query('select status from stock_access_requests')).rows[0].status,'rejected');
 await as(4);assert.equal((await db.query('select * from stock_assets')).rows.length,0);assert.equal((await db.query('select status from stock_access_requests')).rows[0].status,'pending');
 await as(null,'anon');await assert.rejects(db.query('select * from stock_assets'));await assert.rejects(db.query('select * from stock_access_requests'));await assert.rejects(db.query('select * from list_stock_accounts()'));
 await as(1);
 // Une nouvelle demande peut être approuvée administrateur puis révoquée.
 await decide(3,'approved','admin','rejected',null);await decide(2,'rejected',null,'approved','reader');
 await assert.rejects(decide(3,'approved','reader','rejected',null));
 await as(3);await db.query('select create_stock_category($1,$2)',['TEST','Création administrateur']);
 await as(2);assert.equal((await db.query('select * from stock_assets')).rows.length,0);
 await as(1);await decide(3,'approved','reader','approved','admin');
 await as(3);await assert.rejects(db.query('select create_stock_category($1,$2)',['TEST2','Refusé']));
 // Rejouer les migrations préserve les décisions et ne recrée aucun accès.
 await as(null);await db.exec('reset role');for(const name of migrations)await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 assert.equal((await db.query('select role from stock_members where user_id=$1',[id(1)])).rows[0].role,'admin');
 assert.equal((await db.query('select status from stock_access_requests where user_id=$1',[id(2)])).rows[0].status,'rejected');
 assert.equal((await db.query('select role from stock_members where user_id=$1',[id(3)])).rows[0].role,'reader');
 }finally{await db.close();}
});
