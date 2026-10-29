import {centerLine,colorCenterControl} from './centers.js';
import {loadInventory} from './inventory-repository.js';
import {supabaseUrl} from './config.js';
import {kinds,validateSubmission} from '../supabase/functions/_shared/report-model.js';
import {illustrationFor} from './report-illustrations.js';
import {reportMaterials} from './report-materials.js';
const $=id=>document.getElementById(id),make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
let fleet=null,illustrations={},sending=false;
const requestId=crypto.randomUUID();let materialFields=null,materials=[];
const vehicle=()=>fleet?.vehicles.find(v=>v.id===$('reportVehicle').value);
const sheet=()=>fleet?.sheets.find(s=>s.id===vehicle()?.sheetId);
const label=(text,input)=>{const node=make('label',text);input.setAttribute('aria-label',text);node.append(input);return node;};
function renderMaterial(){
 materialFields=null;$('reportItems').replaceChildren();
 if(!vehicle()){$('reportItems').append(make('p','Choisissez un engin pour afficher sa liste de matériel.'));return;}
 materials=reportMaterials(sheet());
 const equipment=make('select'),custom=make('input'),kind=make('select'),quantity=make('input'),description=make('textarea'),image=make('img');
 equipment.required=true;equipment.id='reportEquipment';kind.required=true;quantity.type='number';quantity.min=1;quantity.max=9999;quantity.step=1;quantity.value=1;quantity.required=true;description.required=true;description.minLength=3;description.maxLength=1500;description.rows=3;description.placeholder='Ce qui manque, ce qui est cassé, les circonstances…';custom.maxLength=200;
 equipment.append(new Option('Choisir un matériel',''),...materials.map(m=>new Option(m.designation,m.designation)),new Option('Autre matériel','__other'));
 kind.append(...Object.entries(kinds).map(([key,text])=>new Option(text,key)));
 const extra=label('Précisez le matériel',custom);extra.hidden=true;
 image.className='material-illustration';image.hidden=true;image.alt='Illustration indicative du matériel';
 equipment.onchange=()=>{const other=equipment.value==='__other';extra.hidden=!other;custom.required=other;const path=illustrationFor(other?custom.value:equipment.value,illustrations);image.hidden=!path;if(path)image.src=path;else image.removeAttribute('src');};
 custom.oninput=()=>equipment.onchange();
 const fields=make('div');fields.className='fields';fields.append(label('Matériel',equipment),extra,label('Problème',kind),label('Quantité concernée',quantity));
 $('reportItems').append(fields,image,label('Description',description));
 materialFields={equipment,custom,kind,quantity,description};
}
function vehicleChanged(){
 const v=vehicle();colorCenterControl($('reportCenter'));if(v)centerLine($('reportVehicleInfo'),v.center,{before:`${v.name} · ${v.registration} · `});else $('reportVehicleInfo').replaceChildren();renderMaterial();
}
function centerChanged(selected=''){
 const list=fleet.vehicles.filter(v=>v.center===$('reportCenter').value);$('reportVehicle').replaceChildren(new Option('Choisir un engin',''),...list.map(v=>new Option(`${v.name} — ${v.registration}`,v.id)));if(list.some(v=>v.id===selected))$('reportVehicle').value=selected;vehicleChanged();
}
async function load(){
 $('reloadFleet').hidden=true;
 try{fleet=await loadInventory();const images=await fetch('/signalement/illustrations.json');if(!images.ok)throw Error();illustrations=await images.json();const centers=[...new Set(fleet.vehicles.map(v=>v.center))].sort();$('reportCenter').replaceChildren(new Option('Choisir un centre',''),...centers.map(c=>new Option(c,c)));const v=fleet.vehicles.find(v=>v.id===new URLSearchParams(location.search).get('engin'));const initialCenter=new URLSearchParams(location.search).get('centre');if(v)$('reportCenter').value=v.center;else if(centers.includes(initialCenter))$('reportCenter').value=initialCenter;centerChanged(v?.id);$('reportForm').hidden=false;$('reportStatus').textContent='';$('sendReport').disabled=false;}catch{$('reportStatus').textContent='Impossible de charger le parc. Réessayez avant de remplir le formulaire.';$('reloadFleet').hidden=false;}
}
$('reportCenter').onchange=()=>{if(materialFields?.description.value&&!confirm('Changer de centre efface le matériel saisi. Continuer ?')){$('reportCenter').value=vehicle()?.center||'';return;}centerChanged();};
let lastVehicle='';$('reportVehicle').addEventListener('focus',()=>{lastVehicle=$('reportVehicle').value;});$('reportVehicle').onchange=()=>{if(materialFields?.description.value&&!confirm('Changer d’engin efface le matériel saisi. Continuer ?')){$('reportVehicle').value=lastVehicle;return;}vehicleChanged();lastVehicle=$('reportVehicle').value;};
$('reloadFleet').onclick=load;
$('reportForm').onsubmit=async event=>{
 event.preventDefault();if(sending)return;const v=vehicle();if(!v){$('reportError').textContent='Choisissez un engin.';return;}sending=true;$('reportForm').inert=true;$('reportForm').setAttribute('aria-busy','true');$('sendReport').textContent='Envoi en cours…';$('sendReport').disabled=true;$('reportError').textContent='';
 try{const payload=validateSubmission({requestId,vehicleId:v.id,revision:v.revision,name:$('reportName').value,contact:$('reportContact').value,consent:$('reportConsent').checked,website:$('reportWebsite').value,photos:[],items:[{
 ...((materials.find(m=>m.designation===materialFields.equipment.value))||{sectionId:null,section:'Non précisé'}),
 designation:materialFields.equipment.value==='__other'?materialFields.custom.value:materialFields.equipment.value,
 kind:materialFields.kind.value,quantity:Number(materialFields.quantity.value),description:materialFields.description.value
 }]});
 const response=await fetch(`${supabaseUrl}/functions/v1/inventory-report`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,consent:true}),signal:AbortSignal.timeout(45000)});const body=await response.json();if(!response.ok)throw Error(body.error||'Envoi non confirmé');
 $('reportForm').hidden=true;$('reportReceipt').hidden=false;centerLine($('receiptNumber'),v.center,{before:`Référence : SIG-${body.reference}. Centre : `,after:` · ${v.name}.`});$('reportReceipt').focus();
 }catch(error){$('reportError').textContent=error.name==='TimeoutError'?'Envoi non confirmé. Gardez le formulaire ouvert et réessayez pour éviter un doublon.':error.message||'Connexion interrompue : réessayez sans fermer le formulaire.';}
 finally{sending=false;$('reportForm').inert=false;$('reportForm').removeAttribute('aria-busy');$('sendReport').textContent='Envoyer le signalement';$('sendReport').disabled=false;}
};
await load();
