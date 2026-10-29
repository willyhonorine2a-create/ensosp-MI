import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createMailHandler} from '../supabase/functions/_shared/report-handlers.js';
const code=await readFile(new URL('../integrations/gmail-notifications.gs',import.meta.url),'utf8');
const relaySecret='unit-test-only-'.repeat(4),id='00000000-0000-4000-8000-000000000001';
function relay(){
 const properties={REPORT_GMAIL_SECRET:relaySecret},sent=[];let quota=100,fail=false;
 const context=vm.createContext({
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>[...createHash('sha256').update(text).digest()]},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]||null,getProperties:()=>({...properties}),deleteProperty:key=>delete properties[key],setProperty:(key,value)=>properties[key]=value})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:mail=>{if(fail)throw Error('provider');sent.push(mail);}}
 });vm.runInContext(code,context);
 return {sent,properties,send:input=>context.doPost({postData:{contents:JSON.stringify(input)}}),setQuota:value=>quota=value,setFailure:value=>fail=value};
}
test('relais Gmail : secret requis, destinataire fixé, aucun doublon dans la fenêtre de sept jours',()=>{
 const r=relay(),message={id,secret:relaySecret,subject:'SIG-1 — ALPHA',text:'Lampe manquante',to:'intrus@example.test'};
 assert.equal(r.send({...message,secret:'wrong'}).ok,false);assert.equal(r.sent.length,0);
 assert.equal(r.send(message).ok,true);assert.equal(r.sent.length,1);assert.equal(r.sent[0].to,'magasin-central@ensosp.fr');assert.equal(r.sent[0].body,'Lampe manquante');
 assert.equal(r.send(message).duplicate,true);assert.equal(r.sent.length,1);
});
test('relais Gmail : quota et erreur d’envoi ne marquent pas le message comme envoyé',()=>{
 const r=relay(),message={id,secret:relaySecret,subject:'SIG-1',text:'Test sans mail réel'};
 r.setQuota(0);assert.equal(r.send(message).error,'daily_quota');assert.equal(r.properties['sent_report_'+id],undefined);
 r.setQuota(100);r.setFailure(true);assert.equal(r.send(message).error,'mail_failed');assert.equal(r.properties['sent_report_'+id],undefined);
 r.setFailure(false);assert.equal(r.send(message).ok,true);assert.equal(r.sent.length,1);
});
test('Supabase vers Gmail : configuration contrôlée, résultat JSON vérifié et échec conservé pour reprise',async()=>{
 const calls=[],outbound=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='claim_inventory_report_mail'?[{report_id:id,lease_id:id}]:null};},from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{id,reference:1,center:'ALPHA',vehicle_name:'FPT 18',registration:'ES-676-MV',created_at:'2026-10-29',items:[],photos:[],reporter_name:'',reporter_contact:''}})};return q;}};
 const env=key=>({REPORT_WORKER_SECRET:'test-worker',REPORT_MAIL_PROVIDER:'gmail',GMAIL_WEBAPP_URL:'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec',GMAIL_WEBAPP_SECRET:relaySecret,REPORT_EMAIL_ENABLED:'true',PUBLIC_APP_URL:'https://example.test'})[key];
 let ok=false;const handler=createMailHandler({db,env,fetchImpl:async(url,options)=>{outbound.push({url,options});return Response.json({ok,error:'daily_quota'});}});
 const request=()=>new Request('https://function.example.test',{method:'POST',headers:{'x-report-worker-secret':'test-worker'}});
 await handler(request());assert.equal(calls.find(c=>c.name==='finish_inventory_report_mail').args.p_success,false);
 const body=JSON.parse(outbound[0].options.body);assert.equal(body.id,id);assert.equal(body.secret,relaySecret);assert.equal(body.to,undefined);
 ok=true;await handler(request());assert.equal(calls.filter(c=>c.name==='finish_inventory_report_mail').at(-1).args.p_success,true);
 const before=outbound.length;const invalid=createMailHandler({db,env:key=>key==='GMAIL_WEBAPP_URL'?'https://intrus.example/exec':env(key),fetchImpl:async()=>{throw Error('must not send');}});assert.equal((await invalid(request())).status,503);assert.equal(outbound.length,before);
});
