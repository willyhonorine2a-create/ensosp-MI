import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {fromRow,toRow} from '../src/data.js';
import {validateAsset} from '../src/patrimoine.js';

test('les lignes importées sans référence ni lieu restent modifiables sans inventer de valeurs',()=>{
 const row={id:'1',designation:'Lance',quantity:1,minimum_quantity:0,quantity_defaulted:true,reference:null,location:null,genre:'INC'};
 const item=fromRow(row);
 assert.equal(item.reference,'');assert.equal(item.location,'');assert.equal(item.quantityDefaulted,true);
 assert.doesNotThrow(()=>validateAsset(item,[],item.id,{allowMissingIdentifiers:true,allowDuplicateReference:true}));
 assert.equal(toRow(item).location,null);
 assert.equal(toRow(item).designation,'Lance');
 assert.ok(!('quantity' in toRow(item)));assert.ok(!('source_data' in toRow(item)));
});

test('PostgreSQL : RLS, fiches, mouvements atomiques et doubles envois',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for(const name of ['001_stock.sql','002_preview.sql']) {
   const sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
   await db.exec(sql);await db.exec(sql);
  }
  const member='00000000-0000-4000-8000-000000000001',outsider='00000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users values ($1),($2)',[member,outsider]);
  await db.query('insert into stock_members(user_id) values ($1)',[member]);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from stock_assets'));
  await assert.rejects(db.query('select save_stock_asset(null,$1,2)',[{designation:'Lance',minimum_quantity:0}]));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from stock_assets')).rows.length,0);
  await assert.rejects(db.query('select save_stock_asset(null,$1,2)',[{designation:'Lance',minimum_quantity:0}]));
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);await db.exec('set role authenticated');
  const asset=(await db.query('select save_stock_asset(null,$1,2) as id',[{designation:'Lance',minimum_quantity:0,genre:'INC'}])).rows[0].id;
  await assert.rejects(db.query('update stock_assets set quantity=999'));
  await db.query('select save_stock_asset($1,$2,null)',[asset,{designation:'Lance modifiée',minimum_quantity:1,genre:'INC'}]);
  assert.equal((await db.query('select quantity from stock_assets')).rows[0].quantity,2);
  await assert.rejects(db.query('select save_stock_asset($1,$2,99)',[asset,{designation:'Lance',minimum_quantity:1}]));
  await assert.rejects(db.query('select save_stock_asset(null,$1,2)',[{designation:'Lance',genre:'TOOLONG',minimum_quantity:0}]));
  const request='00000000-0000-4000-8000-000000000003';
  await assert.rejects(db.query('select record_stock_movement_once($1,$2,$3,$4,$5)',[asset,'exit',3,'Test',request]));
  assert.equal((await db.query('select count(*)::int as n from stock_movements')).rows[0].n,0);
  for(let i=0;i<2;i++)await db.query('select record_stock_movement_once($1,$2,$3,$4,$5)',[asset,'exit',1,'Test',request]);
  assert.equal((await db.query('select quantity from stock_assets')).rows[0].quantity,1);
  assert.equal((await db.query('select count(*)::int as n from stock_movements')).rows[0].n,1);
  await assert.rejects(db.query('select record_stock_movement_once($1,$2,$3,$4,$5)',[asset,'exit',2,'Test',request]));
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from stock_assets')).rows.length,0);
  await assert.rejects(db.query('select record_stock_movement_once($1,$2,$3,$4,$5)',[asset,'exit',1,'Test',request]));
 } finally {await db.close();}
});
