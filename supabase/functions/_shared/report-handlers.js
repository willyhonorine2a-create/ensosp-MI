import {validateSubmission,decodePhoto,mailFor} from './report-model.js';
const response=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
export async function sha256(value){const bytes=new TextEncoder().encode(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function limitedJSON(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Requête vide');let size=0,chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8500000){await reader.cancel();throw Error('Envoi trop volumineux (trois photos de 2 Mo maximum)');}chunks.push(value);}}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let position=0;for(const chunk of chunks){all.set(chunk,position);position+=chunk.length;}return JSON.parse(new TextDecoder().decode(all));
}
export function createSubmitHandler({db,env}){
 const allowed=(env('REPORT_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
 return async request=>{
 const origin=request.headers.get('origin');if(!allowed.includes(origin))return response(403,{error:'Origine non autorisée'});
 const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return response(405,{error:'Méthode non autorisée'},cors);
 if(!env('REPORT_RATE_SECRET'))return response(503,{error:'Le service de signalement n’est pas encore activé.'},cors);
 let input,payload,photos;
 try{input=await limitedJSON(request);payload=validateSubmission(input);photos=payload.photos.map(decodePhoto);}catch(error){return response(400,{error:error.message||'Formulaire invalide'},cors);}
 const paths=[];let saveStarted=false;
 try{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env('REPORT_RATE_SECRET')),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  // Le dernier saut de x-forwarded-for doit être fixé par la passerelle Supabase.
  const ip=(request.headers.get('x-forwarded-for')||'unknown').split(',').at(-1).trim().slice(0,100);
  const digest=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const quota=await db.rpc('take_inventory_report_quota',{p_key:digest});if(quota.error)throw Error('quota');if(!quota.data)return response(429,{error:'Trop d’envois. Réessayez plus tard.'},cors);
  const hash=await sha256(JSON.stringify(payload));
  const existing=await db.from('inventory_reports').select('reference,submission_hash').eq('request_id',payload.requestId).maybeSingle();if(existing.error)throw Error('lookup');
  if(existing.data){if(existing.data.submission_hash!==hash)return response(409,{error:'Cet envoi a changé. Rechargez le formulaire pour créer un nouveau signalement.'},cors);return response(200,{reference:existing.data.reference},cors);}
  for(let i=0;i<photos.length;i++){
   const path=`${payload.requestId}/${crypto.randomUUID()}.${photos[i].extension}`;
   paths.push(path);const result=await db.storage.from('inventory-report-photos').upload(path,photos[i].bytes,{contentType:payload.photos[i].type,upsert:false});if(result.error)throw Error('upload');
  }
  saveStarted=true;const saved=await db.rpc('submit_inventory_report',{p_request_id:payload.requestId,p_hash:hash,p_vehicle_id:payload.vehicleId,p_revision:payload.revision,p_name:payload.name,p_contact:payload.contact,p_items:payload.items,p_photos:paths.map(path=>({path}))});
  if(saved.error){if(paths.length)await db.storage.from('inventory-report-photos').remove(paths);return response(saved.error.code==='40001'?409:400,{error:saved.error.code==='40001'?'La fiche ou l’affectation a changé. Rechargez la page avant de recommencer.':'Enregistrement impossible. Vérifiez les champs et rechargez la fiche.'},cors);}
  if(saved.data.existing&&paths.length)await db.storage.from('inventory-report-photos').remove(paths);
  return response(200,{reference:saved.data.reference},cors);
 }catch{
  if(!saveStarted&&paths.length){try{await db.storage.from('inventory-report-photos').remove(paths);}catch{/* Nettoyage manuel si Storage est indisponible. */}}
  // Ne pas effacer de photos après une réponse SQL perdue : le signalement peut être enregistré.
  return response(503,{error:'Envoi non confirmé. Gardez ce formulaire ouvert et réessayez : aucun doublon ne sera créé.'},cors);
 }
 };
}
async function secretMatches(a,b){if(!a||!b)return false;const x=await sha256(a),y=await sha256(b);let different=0;for(let i=0;i<x.length;i++)different|=x.charCodeAt(i)^y.charCodeAt(i);return different===0;}
export function createMailHandler({db,env,fetchImpl=fetch}){
 return async request=>{
 if(request.method!=='POST')return response(405,{error:'POST requis'});
 if(!await secretMatches(request.headers.get('x-report-worker-secret'),env('REPORT_WORKER_SECRET')))return response(401,{error:'Accès refusé'});
 const provider=env('REPORT_MAIL_PROVIDER')||'resend';
 const gmailUrl=env('GMAIL_WEBAPP_URL');
 const providerReady=provider==='gmail'?gmailUrl&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gmailUrl)&&(env('GMAIL_WEBAPP_SECRET')||'').length>=32:provider==='resend'&&env('RESEND_API_KEY')&&env('REPORT_EMAIL_FROM');
 if(env('REPORT_EMAIL_ENABLED')!=='true'||!providerReady||!env('PUBLIC_APP_URL'))return response(503,{error:'Notifications non activées ou configuration incomplète'});
 try{mailFor({reference:0,items:[],photos:[]},env('PUBLIC_APP_URL'));}catch{return response(503,{error:'URL publique invalide'});}
 const expired=await db.rpc('expire_inventory_report_mail');if(expired.error)return response(503,{error:'File indisponible'});
 const jobs=await db.rpc('claim_inventory_report_mail');if(jobs.error)return response(503,{error:'File indisponible'});
 let sent=0,failed=0;
 for(const job of jobs.data){
  let success=false,errorCode='notification_failed';
  try{
   const result=await db.from('inventory_reports').select('*').eq('id',job.report_id).single();if(result.error)throw Error('report');
   const mail=mailFor(result.data,env('PUBLIC_APP_URL'));
   if(provider==='gmail'){
    const email=await fetchImpl(gmailUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env('GMAIL_WEBAPP_SECRET'),id:job.report_id,subject:mail.subject,text:mail.text}),signal:AbortSignal.timeout(20000)});
    if(email.ok){const result=await email.json();success=result.ok===true;errorCode='gmail_relay_failed';}else errorCode=`provider_http_${email.status}`;
   }else{
    const email=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json','Idempotency-Key':`inventory-report/${job.report_id}`},body:JSON.stringify({from:env('REPORT_EMAIL_FROM'),...mail}),signal:AbortSignal.timeout(15000)});
    success=email.ok;errorCode=`provider_http_${email.status}`;
   }
  }catch{errorCode='transport_or_configuration_error';}
  const finished=await db.rpc('finish_inventory_report_mail',{p_report:job.report_id,p_lease:job.lease_id,p_success:success,p_error:success?null:errorCode});
  if(success&&!finished.error)sent++;else failed++;
 }
 return response(200,{sent,failed});
 };
}
