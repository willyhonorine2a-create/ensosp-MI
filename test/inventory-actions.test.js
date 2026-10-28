import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('correction et suppression : droits, historique, quantités, rejeu et protection des lignes supprimées',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
  for(const file of ['001_stock.sql','002_preview.sql','007_inventory_actions.sql','008_manage_stock.sql']){
   const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');await db.exec(sql);if(file.startsWith('007')||file.startsWith('008'))await db.exec(sql);
  }
  await db.exec('alter table stock_assets add column photo_path text');
  const member='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users values($1),($2)',[member,outsider]);await db.query('insert into stock_members(user_id) values($1)',[member]);
  const asset=(await db.query("insert into stock_assets(designation,quantity,quantity_defaulted,photo_path,source_data) values('Caméra',6,true,'photos/photo.jpg','{\"QTE\":\"6\"}') returning id")).rows[0].id;
  const req=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const call=(action,target,expected,reason,id)=>db.query('select manage_stock_asset($1,$2,$3,$4,$5,$6)',[asset,action,target,expected,reason,req(id)]);
  await db.exec('set role anon');await assert.rejects(call('adjust',3,6,'Comptage',10));await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await db.exec('set role authenticated');
  await assert.rejects(call('archive',6,6,'Doublon',11));assert.equal((await db.query('select * from stock_asset_events')).rows.length,0);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);await db.exec('set role authenticated');
  await assert.rejects(db.query('update stock_assets set quantity=0'));
  await assert.rejects(db.query('delete from stock_assets'));
  await assert.rejects(call('adjust',3,6,' ',12));
  await assert.rejects(call('adjust',-1,6,'Comptage',13));
  await assert.rejects(call('adjust',3,5,'Ancien affichage',14));
  assert.equal((await db.query('select quantity from stock_assets')).rows[0].quantity,6);
  for(let i=0;i<2;i++)await call('adjust',3,6,'Comptage physique',15);
  assert.equal((await db.query('select quantity,quantity_defaulted from stock_assets')).rows[0].quantity,3);
  assert.equal((await db.query('select quantity_defaulted from stock_assets')).rows[0].quantity_defaulted,false);
  let movement=(await db.query('select * from stock_movements')).rows;
  assert.equal(movement.length,1);assert.equal(movement[0].movement_type,'exit');assert.equal(movement[0].quantity,3);
  await assert.rejects(call('adjust',4,6,'Comptage physique',15));
  await call('adjust',8,3,'Inventaire complémentaire',16);
  await call('adjust',0,8,'Stock épuisé',17);
  await call('adjust',0,0,'Vérification du zéro',18);
  assert.equal((await db.query('select count(*)::int as n from stock_movements')).rows[0].n,3);
  await call('adjust',2,0,'Retour inventaire',19);
  await assert.rejects(call('archive',0,2,'Retrait',20));
  for(let i=0;i<2;i++)await call('archive',2,2,'Ligne en doublon',21);
  const row=(await db.query('select * from stock_assets')).rows[0];
  assert.ok(row.archived_at);assert.equal(row.archived_by,member);assert.equal(row.quantity,2);assert.equal(row.photo_path,'photos/photo.jpg');assert.deepEqual(row.source_data,{QTE:'6'});
  assert.equal((await db.query('select * from stock_assets where archived_at is null')).rows.length,0);
  assert.equal((await db.query("select count(*)::int as n from stock_asset_events where action='archive'")).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from stock_asset_events')).rows[0].n,6);
  assert.equal((await db.query('select a.designation from stock_movements m join stock_assets a on a.id=m.asset_id limit 1')).rows[0].designation,'Caméra');
  await assert.rejects(call('adjust',3,2,'Après suppression',22));
  await assert.rejects(db.query('select record_stock_movement_once($1,$2,1,$3,$4)',[asset,'entry','Après suppression',req(23)]));
  await assert.rejects(db.query('select save_stock_asset($1,$2,null)',[asset,{designation:'Modifié',minimum_quantity:0}]));
  assert.equal((await db.query('select quantity from stock_assets')).rows[0].quantity,2);
 } finally {await db.close();}
});
