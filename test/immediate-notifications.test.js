import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createSubmitHandler,createImmediateNotifier,claimReportMail,sha256} from '../supabase/functions/_shared/report-handlers.js';
import {validateSubmission} from '../supabase/functions/_shared/report-model.js';
const requestId='00000000-0000-4000-8000-000000000001';
const payload=()=>({requestId,vehicleId:'fpt-18',revision:1,consent:true,name:'',contact:'',photos:[],items:[{sectionId:null,section:'Non précisé',designation:'Lampe',kind:'missing',quantity:1,description:'Lampe absente de son support.'}]});
const origin='https://example.test';
const env=key=>({REPORT_ALLOWED_ORIGINS:origin,REPORT_RATE_SECRET:'test-rate',REPORT_EMAIL_ENABLED:'true',REPORT_WORKER_SECRET:'test-worker',REPORT_MAIL_PROVIDER:'gmail',GMAIL_WEBAPP_URL:'https://script.google.com/macros/s/TEST/exec',GMAIL_WEBAPP_SECRET:'fake-test-secret-'.repeat(4),PUBLIC_APP_URL:origin})[key];
const post=input=>new Request('https://function.example.test',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
function submitDB(){
 const db={existing:null,fail:false,rpc:async(name)=>name==='take_inventory_report_quota'?{data:true}:db.fail?{error:{code:'22023'}}:{data:{reference:7,existing:false}}};
 db.from=()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:db.existing})};return q;};return db;
}
test('accusé immédiat : notification en arrière-plan après écriture, sans attendre la réponse Gmail',async()=>{
 const db=submitDB(),background=[];let started,finish;const begun=new Promise(resolve=>started=resolve),mail=new Promise(resolve=>finish=resolve);let notified;
 const handler=createSubmitHandler({db,env,notify:async id=>{notified=id;started();await mail;},waitUntil:task=>background.push(task)});
 let timeout;try{
 const result=await Promise.race([handler(post(payload())),new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Le mail bloque l’accusé')),500))]);
 assert.equal(result.status,200);assert.equal((await result.json()).reference,7);await begun;assert.equal(notified,requestId);assert.equal(background.length,1);
 }finally{clearTimeout(timeout);finish();await Promise.all(background);}
});
test('reprise du formulaire : réveille le même mail ; erreur mail indépendante et aucun réveil après échec SQL',async()=>{
 const db=submitDB(),background=[];let wakeups=0;
 const handler=createSubmitHandler({db,env,notify:async()=>{wakeups++;throw Error('Google unavailable');},waitUntil:p=>background.push(p)});
 db.existing={reference:7,submission_hash:await sha256(JSON.stringify(validateSubmission(payload())))};
 assert.equal((await handler(post(payload()))).status,200);await Promise.all(background);assert.equal(wakeups,1);
 db.existing=null;db.fail=true;assert.equal((await handler(post(payload()))).status,400);assert.equal(wakeups,1);
 assert.equal((await handler(post({...payload(),website:'robot'}))).status,400);assert.equal(wakeups,1);
});
// Adaptateur PostgREST de test : les réservations sont réellement exécutées dans PostgreSQL.
function postgresClient(pg){
 return {
 from(table){
  assert.ok(['inventory_reports','inventory_report_mail'].includes(table));
  const query={filters:[],patch:null,columns:'*',select(columns){this.columns=columns;return this;},eq(key,value){this.filters.push([key,'=',value]);return this;},lte(key,value){this.filters.push([key,'<=',value]);return this;},update(value){this.patch=value;return this;},
   async run(){try{
    const params=[],identifier=name=>{assert.match(name,/^[a-z_]+$/);return '"'+name+'"';};
    const set=this.patch?Object.entries(this.patch).map(([key,value])=>{params.push(value);return identifier(key)+'=$'+params.length;}).join(','):'';
    const where=this.filters.map(([key,op,value])=>{params.push(value);return identifier(key)+op+'$'+params.length;}).join(' and ');
    const columns=this.columns==='*'?'*':this.columns.split(',').map(identifier).join(',');
    const sql=this.patch?`update ${identifier(table)} set ${set} where ${where} returning ${columns}`:`select ${columns} from ${identifier(table)} where ${where}`;
    return {data:(await pg.query(sql,params)).rows};
   }catch(error){return {error};}},
   async maybeSingle(){const result=await this.run();return result.error?result:{data:result.data[0]||null};},async single(){return this.maybeSingle();},then(resolve,reject){return this.run().then(resolve,reject);}
  };return query;
 },
 async rpc(name,args){try{
  if(name==='expire_inventory_report_mail'){await pg.query('select expire_inventory_report_mail()');return {data:null};}
  if(name==='finish_inventory_report_mail'){await pg.query('select finish_inventory_report_mail($1,$2,$3,$4)',[args.p_report,args.p_lease,args.p_success,args.p_error]);return {data:null};}
  throw Error('RPC inattendue : '+name);
 }catch(error){return {error};}}
 };
}
test('immédiat ciblé : le nouveau formulaire passe avant le retard de file, sans doubler une réservation concurrente',async()=>{
 const pg=new PGlite();try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 create function public.stock_is_admin() returns boolean language sql stable as $$select false$$;
 create function public.require_stock_admin() returns void language plpgsql as $$begin raise exception 'Interdit';end;$$;`);
 for(const name of ['022_public_inventory','023_seed_public_inventory','025_inventory_reports'])await pg.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 const nextRequest='00000000-0000-4000-8000-000000000002';
 for(const id of [requestId,nextRequest])await pg.query('select submit_inventory_report($1,$2,$3,1,$4,$5,$6,$7)',[id,'a'.repeat(64),'fpt-18','','',payload().items,[]]);
 const reports=(await pg.query('select id,request_id from inventory_reports order by reference')).rows;
 // Simule un léger décalage d'horloge pour le mail nouvellement créé.
 await pg.query("update inventory_report_mail set available_at=now()+interval '1 second' where report_id=$1",[reports[1].id]);
 const client=postgresClient(pg),outbound=[];
 const notify=createImmediateNotifier({db:client,env,fetchImpl:async(url,options)=>{outbound.push({url,body:JSON.parse(options.body)});return Response.json({ok:true});}});
 await notify(nextRequest);assert.equal(outbound.length,1);assert.equal(outbound[0].body.id,reports[1].id);
 assert.equal((await pg.query('select state from inventory_report_mail where report_id=$1',[reports[1].id])).rows[0].state,'sent');
 assert.equal((await pg.query('select state from inventory_report_mail where report_id=$1',[reports[0].id])).rows[0].state,'pending');
 await notify(nextRequest);assert.equal(outbound.length,1);
 const claimed=await Promise.all([claimReportMail(client,reports[0].id),claimReportMail(client,reports[0].id)]);
 assert.equal(claimed.reduce((n,result)=>n+(result.data?.length||0),0),1);
 assert.equal((await claimReportMail(client,reports[0].id)).data.length,0);
 await pg.query("update inventory_report_mail set state='pending',available_at=now()+interval '1 hour' where report_id=$1",[reports[0].id]);
 assert.equal((await claimReportMail(client,reports[0].id)).data.length,0);
 }finally{await pg.close();}
});
