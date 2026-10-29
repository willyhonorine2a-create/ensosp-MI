import {loadInventory} from './inventory-repository.js';
import {supabaseUrl} from './config.js';
import {kinds,validateSubmission} from '../supabase/functions/_shared/report-model.js';
import {illustrationFor} from './report-illustrations.js';
const $=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
let fleet=null,illustrations={},captchaToken='',captchaWidget=null,config={},sending=false;
let photoReading=false;let requestId=crypto.randomUUID(),photoData=[],previewUrls=[];const lines=[];
const vehicle=()=>fleet?.vehicles.find(v=>v.id===$('reportVehicle').value);
const sheet=()=>fleet?.sheets.find(s=>s.id===vehicle()?.sheetId);
const label=(text,input)=>{const node=make('label',text);input.setAttribute('aria-label',text);node.append(input);return node;};
function clearPhotoPreviews(){previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];$('photoPreviews').replaceChildren();}
function addLine(){
 if(lines.length>=20)return;
 const card=make('fieldset'),legend=make('legend',`Matériel ${lines.length+1}`),section=make('select'),equipment=make('select'),customSection=make('input'),custom=make('input'),kind=make('select'),quantity=make('input'),description=make('textarea'),image=make('img'),remove=make('button','Retirer ce matériel');
 const entry={card,section,equipment,customSection,custom,kind,quantity,description};lines.push(entry);
 section.required=true;equipment.required=true;kind.required=true;quantity.type='number';quantity.min=1;quantity.max=9999;quantity.step=1;quantity.value=1;quantity.required=true;description.required=true;description.minLength=3;description.maxLength=1500;description.rows=3;description.placeholder='Ce qui manque, ce qui est cassé, les circonstances…';custom.maxLength=200;customSection.maxLength=120;
 section.append(new Option('Choisir un compartiment',''),...(sheet()?.sections||[]).map(s=>new Option(s.label,s.id)),new Option('Autre / non référencé','__other'));
 kind.append(...Object.entries(kinds).map(([key,text])=>new Option(text,key)));
 const extraSection=label('Précisez le compartiment',customSection),extraItem=label('Précisez le matériel',custom),equipmentLabel=label('Matériel',equipment);
 image.className='material-illustration';image.hidden=true;image.alt='Illustration indicative du matériel';
 const updateImage=()=>{const path=illustrationFor(equipment.value,illustrations);image.hidden=!path;if(path)image.src=path;else image.removeAttribute('src');};
 equipment.onchange=()=>{const other=equipment.value==='__other';extraItem.hidden=!other;custom.required=other;updateImage();};
 section.onchange=()=>{const other=section.value==='__other';extraSection.hidden=!other;customSection.required=other;equipmentLabel.hidden=other;equipment.required=!other;const selected=sheet()?.sections.find(s=>s.id===section.value);equipment.replaceChildren(new Option('Choisir un matériel',''),...(selected?.items||[]).map(i=>new Option(i.designation,i.designation)),new Option('Autre matériel','__other'));if(other)equipment.value='__other';equipment.onchange();};
 remove.type='button';remove.className='danger-outline';remove.onclick=()=>{lines.splice(lines.indexOf(entry),1);card.remove();$('addReportItem').disabled=lines.length>=20;};
 const fields=make('div');fields.className='fields';fields.append(label('Compartiment',section),equipmentLabel,extraSection,extraItem,label('Problème',kind),label('Quantité concernée',quantity));card.append(legend,fields,image,label('Description',description),remove);$('reportItems').append(card);section.onchange();$('addReportItem').disabled=lines.length>=20;
}
function vehicleChanged(){
 photoData=[];clearPhotoPreviews();$('reportPhotos').value='';const v=vehicle();$('reportVehicleInfo').textContent=v?`${v.name} · ${v.registration} · ${v.center}`:'';lines.length=0;$('reportItems').replaceChildren();if(v)addLine();
}
function centerChanged(selected=''){
 const list=fleet.vehicles.filter(v=>v.center===$('reportCenter').value);$('reportVehicle').replaceChildren(new Option('Choisir un engin',''),...list.map(v=>new Option(`${v.name} — ${v.registration}`,v.id)));if(list.some(v=>v.id===selected))$('reportVehicle').value=selected;vehicleChanged();
}
async function captcha(){
 if(!config.turnstileSiteKey){$('reportStatus').textContent='Le formulaire est en préparation : l’envoi sera disponible après activation de la vérification anti-robot.';return;}
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
 script.onload=()=>window.turnstile.ready(()=>{captchaWidget=window.turnstile.render($('reportCaptcha'),{sitekey:config.turnstileSiteKey,action:'inventory-report',callback:token=>{captchaToken=token;$('sendReport').disabled=sending||photoReading;},'expired-callback':()=>{captchaToken='';$('sendReport').disabled=true;},'error-callback':()=>{captchaToken='';$('sendReport').disabled=true;$('reportError').textContent='Vérification anti-robot indisponible. Réessayez plus tard.';}});});
 script.onerror=()=>{$('reportError').textContent='Impossible de charger la vérification anti-robot.';};document.head.append(script);
}
async function load(){
 $('reloadFleet').hidden=true;
 try{fleet=await loadInventory();const [images,settings]=await Promise.all([fetch('/signalement/illustrations.json'),fetch('/signalement/config.json')]);if(!images.ok||!settings.ok)throw Error();illustrations=await images.json();config=await settings.json();const centers=[...new Set(fleet.vehicles.map(v=>v.center))].sort();$('reportCenter').replaceChildren(new Option('Choisir un centre',''),...centers.map(c=>new Option(c,c)));const v=fleet.vehicles.find(v=>v.id===new URLSearchParams(location.search).get('engin'));const initialCenter=new URLSearchParams(location.search).get('centre');if(v)$('reportCenter').value=v.center;else if(centers.includes(initialCenter))$('reportCenter').value=initialCenter;centerChanged(v?.id);$('reportForm').hidden=false;$('reportStatus').textContent='';await captcha();}catch{$('reportStatus').textContent='Impossible de charger le parc. Réessayez avant de remplir le formulaire.';$('reloadFleet').hidden=false;}
}
$('reportCenter').onchange=()=>{if(lines.some(l=>l.description.value)&&!confirm('Changer de centre efface les matériels saisis. Continuer ?')){$('reportCenter').value=vehicle()?.center||'';return;}centerChanged();};
let lastVehicle='';$('reportVehicle').addEventListener('focus',()=>{lastVehicle=$('reportVehicle').value;});$('reportVehicle').onchange=()=>{if(lines.some(l=>l.description.value)&&!confirm('Changer d’engin efface les matériels saisis. Continuer ?')){$('reportVehicle').value=lastVehicle;return;}vehicleChanged();lastVehicle=$('reportVehicle').value;};
$('addReportItem').onclick=addLine;$('reloadFleet').onclick=load;
$('reportPhotos').onchange=async()=>{photoReading=true;$('reportPhotos').disabled=true;$('reportCenter').disabled=true;$('reportVehicle').disabled=true;$('sendReport').disabled=true;photoData=[];clearPhotoPreviews();$('reportError').textContent='';const files=[...$('reportPhotos').files];try{if(files.length>3)throw Error('Trois photos maximum');for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2097152)throw Error('Chaque photo doit être un JPEG, PNG ou WebP de 2 Mo maximum.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});photoData.push({type:file.type,data});const image=make('img');image.alt='Photo jointe au signalement';const url=URL.createObjectURL(file);previewUrls.push(url);image.src=url;$('photoPreviews').append(image);}}catch(error){photoData=[];clearPhotoPreviews();$('reportPhotos').value='';$('reportError').textContent=error.message;}finally{photoReading=false;$('reportPhotos').disabled=false;$('reportCenter').disabled=false;$('reportVehicle').disabled=false;$('sendReport').disabled=sending||!captchaToken;}};
$('reportForm').onsubmit=async event=>{
 event.preventDefault();if(sending||photoReading)return;const v=vehicle();if(!v){$('reportError').textContent='Choisissez un engin.';return;}sending=true;$('reportForm').inert=true;$('reportForm').setAttribute('aria-busy','true');$('sendReport').textContent='Envoi en cours…';$('sendReport').disabled=true;$('reportError').textContent='';
 try{const payload=validateSubmission({requestId,vehicleId:v.id,revision:v.revision,name:$('reportName').value,contact:$('reportContact').value,consent:$('reportConsent').checked,website:$('reportWebsite').value,photos:photoData,items:lines.map(l=>({sectionId:l.section.value==='__other'?null:(l.equipment.value==='__other'?null:l.section.value),section:l.section.value==='__other'?l.customSection.value:l.section.selectedOptions[0].textContent,designation:l.equipment.value==='__other'?l.custom.value:l.equipment.value,kind:l.kind.value,quantity:Number(l.quantity.value),description:l.description.value}))});
 const response=await fetch(`${supabaseUrl}/functions/v1/inventory-report`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,consent:true,captchaToken}),signal:AbortSignal.timeout(45000)});const body=await response.json();if(!response.ok)throw Error(body.error||'Envoi non confirmé');
 $('reportForm').hidden=true;$('reportReceipt').hidden=false;$('receiptNumber').textContent=`Référence : SIG-${body.reference}. Centre : ${v.center} · ${v.name}.`;$('reportReceipt').focus();clearPhotoPreviews();photoData=[];
 }catch(error){$('reportError').textContent=error.name==='TimeoutError'?'Envoi non confirmé. Gardez le formulaire ouvert et réessayez pour éviter un doublon.':error.message||'Connexion interrompue : réessayez sans fermer le formulaire.';}
 finally{sending=false;$('reportForm').inert=false;$('reportForm').removeAttribute('aria-busy');$('sendReport').textContent='Envoyer le signalement';captchaToken='';$('sendReport').disabled=true;if(captchaWidget!==null)window.turnstile.reset(captchaWidget);}
};
await load();
