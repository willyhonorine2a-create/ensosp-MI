import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateSubmission,decodePhoto,mailFor,recipient} from '../supabase/functions/_shared/report-model.js';
import {createSubmitHandler,createMailHandler,sha256} from '../supabase/functions/_shared/report-handlers.js';
const requestId='00000000-0000-4000-8000-000000000001';
const item={sectionId:'a-10',section:'CABINE AVANT',designation:'Lampe sur chargeur',kind:'missing',quantity:1,description:'La lampe est absente de son support.'};
const input=()=>({requestId,vehicleId:'fpt-18',revision:1,consent:true,name:'Personne',contact:'contact@example.test',items:[{...item}],photos:[]});
test('signalements : validation partagée, photos contrôlées et mail texte à destinataire fixe',()=>{
 const payload=validateSubmission(input());assert.equal(payload.items[0].quantity,1);
 for(const patch of [{items:[]},{consent:false},{revision:0},{items:[{...item,quantity:-1}]},{items:[{...item,kind:'__proto__'}]}])assert.throws(()=>validateSubmission({...input(),...patch}));
 assert.throws(()=>decodePhoto({type:'image/jpeg',data:btoa('<script>alert(1)</script>')}));
 const photo=decodePhoto({type:'image/png',data:btoa(String.fromCharCode(137,80,78,71,13,10,26,10,0,0,0,0))});assert.equal(photo.extension,'png');
 const mail=mailFor({id:requestId,reference:7,center:'ALPHA',vehicle_name:'FPT 18',registration:'ES-676-MV',created_at:'2026-10-29',items:[item],photos:[],reporter_name:'<img src=x>',reporter_contact:'contact'},'https://exemple.ensosp.fr');assert.deepEqual(mail.to,[recipient]);assert.ok(!mail.html);assert.ok(mail.text.includes('/signalements/#report='+requestId));assert.throws(()=>mailFor({items:[],photos:[]},'javascript:alert(1)'));
});
test('signalements PostgreSQL : isolation publique, cliché d’affectation, historique, rejouabilité et file mail',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 create function stock_is_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;
 create function require_stock_admin() returns void language plpgsql as $$begin if not public.stock_is_admin() then raise exception 'Interdit';end if;end;$$;
 create schema storage;grant usage on schema storage to anon,authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;`);
 for(const name of ['022_public_inventory','023_seed_public_inventory','025_inventory_reports','026_inventory_report_photos'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
 await db.exec("insert into storage.objects(bucket_id,name) values('inventory-report-photos','private.jpg')");
 assert.equal((await db.query("select public from storage.buckets where id='inventory-report-photos'")).rows[0].public,false);
 const submit=(id=requestId,revision=1,items=[item],hash='a'.repeat(64))=>db.query('select submit_inventory_report($1,$2,$3,$4,$5,$6,$7,$8) r',[id,hash,'fpt-18',revision,'Nom','Contact',items,[]]);
 await db.exec('set role anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(submit());await assert.rejects(db.query('select * from inventory_reports'));
 await db.exec('reset role;set role authenticated');await assert.rejects(submit());assert.equal((await db.query('select * from inventory_reports')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(db.query("insert into inventory_reports(request_id) values($1)",[requestId]));
 await db.exec('reset role;set role service_role');const saved=(await submit()).rows[0].r;assert.equal(saved.existing,false);assert.equal((await submit()).rows[0].r.reference,saved.reference);await assert.rejects(submit(requestId,1,[item],'b'.repeat(64)));
 assert.equal((await db.query('select * from inventory_report_mail')).rows.length,1);
 await db.exec("reset role;update inventory_vehicles set center='BRAVO',revision=2 where id='fpt-18';set role service_role");
 assert.equal((await db.query('select center from inventory_reports')).rows[0].center,'ALPHA');
 await assert.rejects(submit('00000000-0000-4000-8000-000000000002'));
 await assert.rejects(submit('00000000-0000-4000-8000-000000000002',2,[{...item,designation:'Inventé'}]));
 const job=(await db.query('select * from claim_inventory_report_mail()')).rows[0];assert.ok(job.lease_id);assert.equal((await db.query('select * from claim_inventory_report_mail()')).rows.length,0);
 await db.query('select finish_inventory_report_mail($1,$2,false,$3)',[job.report_id,job.lease_id,'provider_http_503']);assert.equal((await db.query('select state from inventory_report_mail')).rows[0].state,'pending');
 await db.exec("reset role;update inventory_report_mail set available_at=now()-interval '1 second';set role service_role");
 const next=(await db.query('select * from claim_inventory_report_mail()')).rows[0];
 await db.query('select finish_inventory_report_mail($1,$2,true,null)',[job.report_id,job.lease_id]);assert.equal((await db.query('select state from inventory_report_mail')).rows[0].state,'sending');
 await db.query('select finish_inventory_report_mail($1,$2,true,null)',[next.report_id,next.lease_id]);assert.equal((await db.query('select state from inventory_report_mail')).rows[0].state,'sent');
 for(let n=0;n<10;n++)assert.equal((await db.query('select take_inventory_report_quota($1) ok',['c'.repeat(64)])).rows[0].ok,true);
 assert.equal((await db.query('select take_inventory_report_quota($1) ok',['c'.repeat(64)])).rows[0].ok,false);
 await db.exec('reset role;set role authenticated');assert.equal((await db.query('select * from inventory_reports')).rows.length,0);await assert.rejects(db.query('select claim_inventory_report_mail()'));
 await db.exec("select set_config('test.admin','true',false)");assert.equal((await db.query('select * from storage.objects')).rows.length,1);assert.equal((await db.query('select * from inventory_reports')).rows.length,1);
 await db.query('select update_inventory_report($1,1,$2,$3)',[job.report_id,'in_progress','Prise en charge magasin']);await assert.rejects(db.query('select update_inventory_report($1,1,$2,$3)',[job.report_id,'resolved','Matériel remplacé']));
 assert.equal((await db.query('select * from inventory_report_events')).rows.length,1);await assert.rejects(db.query("update inventory_reports set status='resolved'"));
 assert.equal((await db.query("select sheet->'sections'->0->'items'->0->>'quantity' quantity from inventory_vehicles where id='fpt-18'")).rows[0].quantity,'2');
 }finally{await db.close();}
});
function mockDB(){
 const calls=[],uploads=[],saved=[];
 const db={calls,uploads,saved,existing:null,
 rpc:async(name,args)=>{calls.push({name,args});if(name==='take_inventory_report_quota')return {data:true};if(name==='submit_inventory_report'){saved.push(args);return {data:{reference:42,existing:false}};}if(name==='claim_inventory_report_mail')return {data:[{report_id:requestId,lease_id:requestId}]};return {data:null};},
 from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:db.existing}),single:async()=>({data:{id:requestId,reference:42,center:'ALPHA',vehicle_name:'FPT 18',registration:'ES-676-MV',created_at:'2026-10-29',items:[item],photos:[],reporter_name:'Nom',reporter_contact:'Contact'}})};return q;},
 storage:{from:()=>({upload:async(path)=>{uploads.push(path);return {};},remove:async()=>({})})}};return db;
}
const origin='https://preview.example.test';
const environment=key=>({REPORT_ALLOWED_ORIGINS:origin,REPORT_RATE_SECRET:'test-rate',REPORT_WORKER_SECRET:'test-worker',RESEND_API_KEY:'fake-only',REPORT_EMAIL_FROM:'test@example.test',PUBLIC_APP_URL:origin,REPORT_EMAIL_ENABLED:'true'})[key];
const post=(body,requestOrigin=origin)=>new Request('https://function.example.test',{method:'POST',headers:{origin:requestOrigin,'Content-Type':'application/json','x-forwarded-for':'192.0.2.1'},body:JSON.stringify(body)});
test('fonction publique sans CAPTCHA : origine, piège robot, quota, panne et rejeu sans doublon',async()=>{
 const db=mockDB();const handler=createSubmitHandler({db,env:environment});
 assert.equal((await handler(post(input(),'https://intrus.test'))).status,403);
 assert.equal((await handler(post({...input(),website:'robot.example'}))).status,400);assert.equal(db.saved.length,0);
 const result=await handler(post(input()));assert.equal(result.status,200);assert.equal((await result.json()).reference,42);assert.equal(db.saved.length,1);assert.equal(db.saved[0].p_vehicle_id,'fpt-18');
 db.existing={reference:42,submission_hash:await sha256(JSON.stringify(validateSubmission(input())))};const repeated=await handler(post(input()));assert.equal(repeated.status,200);assert.equal(db.saved.length,1);db.existing=null;
 const failing=mockDB();failing.rpc=async()=>({error:{message:'database unavailable'}});const unavailable=createSubmitHandler({db:failing,env:environment});assert.equal((await unavailable(post(input()))).status,503);
 const limited=mockDB();limited.rpc=async()=>({data:false});assert.equal((await createSubmitHandler({db:limited,env:environment})(post(input()))).status,429);assert.equal(limited.saved.length,0);
 const disabled=createSubmitHandler({db,env:key=>key==='REPORT_RATE_SECRET'?undefined:environment(key)});assert.equal((await disabled(post(input()))).status,503);
});
test('worker mail : secret requis, destinataire fixe, idempotence fournisseur, erreurs conservées pour reprise',async()=>{
 const db=mockDB(),sent=[];const handler=createMailHandler({db,env:environment,fetchImpl:async(url,options)=>{sent.push({url,options});return new Response('',{status:503});}});
 assert.equal((await handler(new Request('https://function.example.test',{method:'POST'}))).status,401);assert.equal(sent.length,0);
 const request=()=>new Request('https://function.example.test',{method:'POST',headers:{'x-report-worker-secret':'test-worker'}});
 assert.equal((await handler(request())).status,200);assert.deepEqual(JSON.parse(sent[0].options.body).to,[recipient]);assert.equal(sent[0].options.headers['Idempotency-Key'],'inventory-report/'+requestId);
 const finish=db.calls.find(c=>c.name==='finish_inventory_report_mail');assert.equal(finish.args.p_success,false);assert.equal(finish.args.p_error,'provider_http_503');
 const success=createMailHandler({db,env:environment,fetchImpl:async()=>new Response('{}',{status:200})});await success(request());assert.equal(db.calls.filter(c=>c.name==='finish_inventory_report_mail').at(-1).args.p_success,true);
 const disabled=createMailHandler({db,env:key=>key==='REPORT_EMAIL_ENABLED'?'false':environment(key),fetchImpl:async()=>{throw Error('must not send');}});assert.equal((await disabled(request())).status,503);
});
