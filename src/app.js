import {physicalLocations,locationCounts,locationSummary} from './locations.js';
import {fields,identificationFields,validateAsset} from './patrimoine.js';
const $ = id => document.getElementById(id);
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './config.js';
import {createRepository} from './data.js';
import {validatePhoto} from './photos.js';
import {groupReferences,deviceCode,dateLabel,deviceStatus} from './references.js';
import {buildDashboard} from './dashboard.js';
const client=createClient(supabaseUrl,supabasePublishableKey,{
 auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:true}
});
const repository=createRepository(client);
let session=null, revision=0, inventoryAction=null;
for (const [name,label,code,max,type] of identificationFields) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  if(['serial','purchasedAt','warrantyUntil'].includes(name))wrapper.classList.add('individual-metadata');
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.name=name; input.maxLength=max; if(type === 'date') input.type='date';
  wrapper.append(input); const hint=document.createElement('small'); hint.textContent=code; wrapper.append(hint);
  $('assetFields').append(wrapper);
}
let editingId = null, pendingPhoto=null, previewObjectUrl=null, creationRequest=null;
let state = {items:[],history:[]};
let authMode='login',accountsOffset=0,accountsRevision=0;
const isAdmin=()=>Boolean(session && state.access?.role==='admin');
function renderAccess(){
 const role=state.access?.role;
 document.body.classList.toggle('is-admin',isAdmin());
 if(!isAdmin()){accountsRevision++;$('accountsList').replaceChildren();$('refreshAccounts').disabled=false;}
 document.querySelectorAll('[data-admin]').forEach(el=>{el.hidden=!isAdmin();});
 $('accountRole').hidden=!role;$('accountRole').textContent=role==='admin'?'Administrateur':role==='reader'?'Lecteur':'';
 document.querySelector('.auth-tabs').hidden=Boolean(session);
 $('loginForm').hidden=Boolean(session) || authMode!=='login';$('signupForm').hidden=Boolean(session) || authMode!=='signup';
 $('showLogin').setAttribute('aria-pressed',String(authMode==='login'));$('showSignup').setAttribute('aria-pressed',String(authMode==='signup'));
 $('accessPanel').hidden=!session || Boolean(role);$('retry').hidden=!session;
 const status=state.access?.status;
 $('accessTitle').textContent=status==='rejected'?'Accès refusé ou retiré':status==='pending'?'Demande en attente':'Vérification de votre accès';
 $('accessMessage').textContent=status==='rejected'?'Votre compte ne dispose pas d’un accès au magasin. Contactez un administrateur.':status==='pending'?'Votre demande doit être approuvée par un administrateur. Vous pouvez actualiser votre accès après sa validation.':'Actualisez votre accès pour vérifier vos droits.';
}
function readonlyForm(form,readonly){
 form.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=readonly;});
 form.querySelector('[type=submit]').hidden=readonly;
}

function clearInventory() {
 revision++;accountsRevision++;$('accountsList').replaceChildren();document.body.classList.remove('dashboard-ready'); state={items:[],history:[]}; render();
 $('workspace').hidden=true; $('loginPanel').hidden=false;
 $('itemDialog').close(); $('categoryDialog').close(); $('stockActionDialog').close(); $('trackingDialog').close();$('deviceDialog').close();$('locationDialog').close();
}
async function refresh() {
 if(!session) return;
 const current=++revision;
 $('refresh').disabled=true;
 try {
  const next=await repository.load(session.user.id);
  if(current !== revision) return;
  if(state.access?.role!==next.access?.role)document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  state=next;render();
  const approved=Boolean(state.access?.role);
  document.body.classList.toggle('dashboard-ready',approved);$('workspace').hidden=!approved;$('loginPanel').hidden=approved;
  $('notice').textContent=approved?'Données du magasin actualisées.':'';
  if(isAdmin())void refreshAccounts();
 } catch(e) {
  if(current !== revision) return;
  // Ne pas laisser agir sur un stock qui n'a pas pu être relu.
  state={items:[],history:[]}; render();document.body.classList.remove('dashboard-ready'); $('workspace').hidden=true; $('loginPanel').hidden=false;
  $('notice').textContent=e.message || 'Chargement impossible. Réessayez.';
 } finally { if(current === revision) $('refresh').disabled=false; }
}
async function updateSession(next) {
 const changed=session?.user.id !== next?.user.id;
 session=next;
 $('logout').hidden=!session;
 $('account').textContent=session?.user.email || '';
 $('accountAvatar').textContent=(session?.user.email || 'M').slice(0,1).toUpperCase();
 if(changed || !session) clearInventory();
 renderAccess();
 if(session) await refresh();
 else $('notice').textContent='Connectez-vous pour consulter le magasin.';
}
async function afterWrite(message) {
 $('notice').textContent=message;
 await refresh();
 if(!$('workspace').hidden) $('notice').textContent=message;
 else $('notice').textContent=message+' Actualisation impossible : cliquez sur Réessayer. Ne répétez pas l’enregistrement.';
}
function element(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function categoryLabel(code) {
 const row=state.categories?.find(c=>c.code===code);
 return row ? `${row.code} · ${row.label}` : code ? `${code} · À classer` : 'À classer';
}
function fillCategories(control,value='',emptyLabel='Toutes les catégories') {
 control.replaceChildren(new Option(emptyLabel,''));
 (state.categories || []).forEach(row=>control.add(new Option(`${row.code} · ${row.label}`,row.code)));
 control.value=[...control.options].some(o=>o.value===value) ? value : '';
}
function showPhoto(url) {
 if(previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl=null; }
 $('photoPreview').hidden=!url;
 if(url) $('photoPreview').src=url; else $('photoPreview').removeAttribute('src');
}
$('photoFile').onchange=async()=>{
 pendingPhoto=null; $('itemError').textContent='';
 const file=$('photoFile').files[0];
 if(!file) {showPhoto(state.items.find(i=>i.id===editingId)?.photoUrl || '');return;}
 try {
  await validatePhoto(file);
  showPhoto(''); previewObjectUrl=URL.createObjectURL(file);
  $('photoPreview').src=previewObjectUrl; $('photoPreview').hidden=false; $('removePhoto').checked=false;
 } catch(e) { $('photoFile').value=''; showPhoto(''); $('itemError').textContent=e.message; }
};
$('removePhoto').onchange=()=>{
 if($('removePhoto').checked) { $('photoFile').value='';pendingPhoto=null;showPhoto(''); }
 else showPhoto(state.items.find(i=>i.id===editingId)?.photoUrl || '');
};
$('itemDialog').addEventListener('close',()=>showPhoto(''));
const number=new Intl.NumberFormat('fr-FR');
function renderDashboard(data,filters){
 for(const [id,value] of Object.entries({references:data.references.length,units:data.units,alerts:data.alerts,trackedDevices:data.tracked,warrantyAlerts:data.expired+data.expiring,defaultQuantities:data.defaultQuantities}))$(id).textContent=number.format(value);
 $('availableRate').textContent=data.availabilityRate===null?'—':`${data.availabilityRate} %`;
 $('availabilityRing').style.setProperty('--rate',data.availabilityRate || 0);
 $('availableDetail').textContent=data.units?`${number.format(data.available)} unités disponibles sur ${number.format(data.units)}`:'Aucun stock dans cette sélection';
 $('trackedDetail').textContent=`${data.maintenance} en maintenance · ${data.unavailable} indisponibles`;
 $('unitsDetail').textContent=`Dont ${number.format(data.tracked)} appareils suivis individuellement`;
 $('warrantyDetail').textContent=`${data.expired} expirées · ${data.expiring} sous 90 jours`;
 $('alertsDetail').textContent=`${data.empty} référence(s) sans stock disponible`;
 $('scopeCount').textContent=`${number.format(data.references.length)} référence(s) sur ${number.format(data.globalReferences)}`;
 $('resultCount').textContent=`${number.format(data.references.length)} résultat(s)`;
 $('classificationWarnings').textContent=data.unclassified?`${data.unclassified} référence(s) à classer dans une catégorie.`:'';
 const chips=[];
 if(filters.search.trim())chips.push(`Recherche : ${filters.search.trim()}`);
 if(filters.category)chips.push(categoryLabel(filters.category));
 if(filters.location)chips.push(physicalLocations[filters.location]);
 for(const [code,id] of [['MI','unitsMi'],['CS','unitsCs'],['UNSET','unitsUnlocated']])$(id).textContent=number.format(data.locationTotals[code]);
 if(filters.mode)chips.push(filters.mode==='individual'?'Suivi individuel':'Gestion en quantité');
 if(filters.onlyAlerts)chips.push('Alertes uniquement');
 $('activeFilters').replaceChildren(...chips.map(label=>element('span',label,'filter-chip')));
 $('filterScope').textContent=chips.length?'Indicateurs calculés sur la sélection':'Tous les matériels actifs';
 $('resetFilters').disabled=chips.length===0;
 $('categoryChart').replaceChildren();
 const max=Math.max(1,...data.distribution.map(d=>d.units));
 for(const entry of data.distribution.slice(0,4)){
  const row=element('div','','category-bar');const heading=element('div','','category-bar-heading');
  heading.append(element('span',`${entry.code || '—'} · ${entry.label}`),element('strong',number.format(entry.units)));
  const track=element('div','','bar-track');track.setAttribute('aria-hidden','true');
  const bar=element('span');bar.style.width=`${entry.units/max*100}%`;track.append(bar);row.append(heading,track);$('categoryChart').append(row);
 }
 $('categoryChartEmpty').hidden=data.distribution.length>0;
 $('categoryChartNote').textContent=data.distribution.length>4?`Les 4 catégories les plus représentées sur ${data.distribution.length}`:'Unités en stock, selon les filtres actifs';
 const watch=[
  [data.expired,'garantie(s) expirée(s)','danger'],
  [data.expiring,'garantie(s) arrivant à échéance sous 90 jours','amber'],
  [data.maintenance,'appareil(s) en maintenance','amber'],
  [data.unavailable,'appareil(s) indisponible(s)','danger'],
  [data.unknownWarranty,'date(s) de garantie non renseignée(s) — facultatif','neutral']
 ];
 $('watchList').replaceChildren();
 for(const [count,label,tone] of watch)if(count){const row=element('li','',`watch-item ${tone}`);row.append(element('strong',number.format(count)),element('span',label));$('watchList').append(row);}
 $('watchEmpty').hidden=Boolean(watch.some(([count])=>count));
 $('defaultsNote').hidden=data.defaultQuantities===0;
}
$('resetFilters').onclick=()=>{ $('search').value='';for(const id of ['categoryFilter','locationFilter','modeFilter'])$(id).value='';$('onlyAlerts').checked=false;render(); };
function render() {
  renderAccess();
  fillCategories($('categoryFilter'),$('categoryFilter').value);
  $('categoryRows').replaceChildren();
  (state.categories || []).forEach(c=>{const tr=document.createElement('tr');tr.append(element('td',c.code),element('td',c.label));$('categoryRows').append(tr);});
  const filters={search:$('search').value,category:$('categoryFilter').value,location:$('locationFilter').value,mode:$('modeFilter').value,onlyAlerts:$('onlyAlerts').checked};
  const dashboard=buildDashboard(state.items,state.categories,state.deviceFacts,filters);
  const visible=dashboard.references;
  renderDashboard(dashboard,filters);
  $('inventory').replaceChildren();
  const fullReferences=groupReferences(state.items);
  visible.forEach(i => {
    const fullReference=fullReferences.find(r=>r.members.some(m=>m.id===i.id));
    const actionItem=state.items.find(row=>row.id===i.id);
    const tr = document.createElement('tr'); tr.setAttribute('role','row');
    const name=element('td',i.name);
    const photo=document.createElement('td');
    if(i.photoUrl) {
     const button=element('button','','photo-button');button.setAttribute('aria-label',`Voir la photo de ${i.name}`);
     const img=document.createElement('img');img.src=i.photoUrl;img.alt=`Photo : ${i.name}`;img.loading='lazy';img.className='stock-photo';
     img.onerror=()=>{button.replaceChildren(element('span','Photo indisponible'));};
     button.append(img);button.onclick=()=>fullReference.members.length>1?openTracking(fullReference):openAsset(actionItem);photo.append(button);
    } else {const placeholder=element('span','▥','photo-placeholder');placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',i.photoUnavailable?'Photo indisponible':'Aucune photo');photo.append(placeholder);}
    const stock=document.createElement('td'), stockButton=element('button',String(i.stock),'stock-link');
    stockButton.setAttribute('aria-label',`Voir le stock : ${i.name}`);stockButton.onclick=()=>openTracking(fullReference);stock.append(stockButton);
    stock.append(element('small',i.trackingMode==='individual'?`${i.availableStock} disponible(s)`:'Gestion en quantité'));
    stock.append(element('small',`Total : ${fullReference.stock} · ${locationSummary(fullReference)}`,'location-caption'));
    if(fullReference.members.length>1)stock.append(element('small',`${fullReference.members.length} lignes regroupées`));
    const status=document.createElement('td');status.append(element('span',i.availableStock===0?(i.trackingMode==='individual'?'Indisponible':'Rupture'):i.availableStock<=i.minimum?'Stock faible':'Disponible',`pill ${i.availableStock<=i.minimum?'warning':''}`));
    const category=document.createElement('td');category.append(element('span',i.category || '—','category-tag'),element('small',state.categories?.find(c=>c.code===i.category)?.label || 'À classer'));
    tr.append(photo,name,element('td',i.reference || '—'),category,stock,status);
    const action = document.createElement('td'); const button = element('button','MI / CS','secondary'); button.setAttribute('aria-label',`Répartition MI / CS : ${i.name}`);
    button.onclick = () => { if(!isAdmin() || i.trackingMode==='individual' || fullReference.members.length>1){void openTracking(fullReference);return;} openLocation(actionItem); };
    const edit=element('button','Fiche','secondary'); edit.setAttribute('aria-label',`Fiche : ${i.name}`); edit.onclick=()=>fullReference.members.length>1?openTracking(fullReference):openAsset(actionItem);
    const adjust=element('button','Corriger le stock','secondary');adjust.setAttribute('aria-label',`Corriger le stock : ${i.name}`);adjust.onclick=()=>openLocation(actionItem,'adjust');
    const remove=element('button','Supprimer','danger-outline');remove.setAttribute('aria-label',`Supprimer : ${i.name}`);remove.onclick=()=>openStockAction(actionItem,'archive');
    action.className='row-actions';const actionButtons=document.createElement('div');actionButtons.className='action-buttons';if(!isAdmin()){if(i.trackingMode==='individual'){button.textContent='Appareils';actionButtons.append(edit,button);}else actionButtons.append(edit);}else if(i.trackingMode==='individual'){button.textContent='Appareils';actionButtons.append(edit,button,remove);}else if(fullReference.members.length>1){edit.textContent='Voir les lignes';button.textContent='Suivi individuel';actionButtons.append(edit,button);}else actionButtons.append(edit,button,adjust,remove);action.append(actionButtons);tr.append(action);
    const columns=[['photo','Photo'],['name','Matériel'],['reference','Référence'],['category','Catégorie'],['stock','Stock'],['status','Disponibilité'],['actions','Actions']];
    [...tr.children].forEach((cell,index)=>{cell.classList.add(`cell-${columns[index][0]}`);cell.dataset.label=columns[index][1];cell.setAttribute('role','cell');});
    $('inventory').append(tr);
  });
  $('empty').hidden = visible.length > 0;
  $('history').replaceChildren(); $('noHistory').hidden = state.history.length > 0;
  state.history.slice(0,20).forEach(m => $('history').append(element('li',`${m.type === 'entry' ? '+' : '−'}${m.quantity} · ${m.name} — ${new Date(m.date).toLocaleString('fr-FR')}${m.reason ? ' · '+m.reason : ''}`)));
  $('locationHistory').replaceChildren();$('noLocationHistory').hidden=Boolean(state.locationEvents?.length);
  for(const e of state.locationEvents || []){
   const [action,from,to,quantity]=e.payload;
   const label={transfer:'Transfert',entry:'Entrée',exit:'Sortie',adjust:'Correction'}[action];
   const path=action==='transfer'?`${physicalLocations[from]} → ${physicalLocations[to]}`:physicalLocations[action==='entry'?to:from];
   $('locationHistory').append(element('li',`${label} · ${e.stock_assets?.designation || 'Matériel'} · ${quantity} · ${path} · ${e.reason} — ${new Date(e.created_at).toLocaleString('fr-FR')}`));
  }
  $('stockEvents').replaceChildren();$('noStockEvents').hidden=Boolean(state.events?.length);
  (state.events || []).forEach(e=>$('stockEvents').append(element('li',`${e.action==='archive' ? 'Ligne supprimée' : 'Stock corrigé'} · ${e.stock_assets?.designation || 'Matériel'} · ${e.before_quantity} → ${e.after_quantity} · ${e.reason} — ${new Date(e.created_at).toLocaleString('fr-FR')}`)));

}
$('search').oninput = render; $('onlyAlerts').onchange = render;
function openAsset(item) {
 if(!item && !isAdmin())return;
 readonlyForm($('itemForm'),!isAdmin());
 editingId=item?.id || null; pendingPhoto=null;creationRequest={id:crypto.randomUUID(),signature:null}; $('itemForm').reset(); $('itemError').textContent='';
 $('itemTitle').textContent=item ? (isAdmin()?'Fiche du matériel':'Consulter le matériel') : 'Ajouter du matériel';
 for(const control of $('itemForm').elements) if(control.name && item && control.name!=='category') control.value=item[control.name] ?? '';
 fillCategories($('itemForm').elements.category,item?.category || '','Choisir une catégorie');
 $('photoFile').value='';$('removePhoto').checked=false;$('removePhoto').disabled=!item?.photoPath;
 showPhoto(item?.photoUrl || '');
 $('itemForm').elements.stock.disabled=Boolean(item);
 $('trackingMode').disabled=Boolean(item);$('trackingMode').value=item?.trackingMode || 'quantity';syncTrackingMode();
 if(!isAdmin())readonlyForm($('itemForm'),true);
 $('stockHelp').textContent=item?.trackingMode==='individual'?'Pour modifier ce stock, ajoutez ou retirez un appareil depuis le chiffre du stock.':item?'Pour modifier la quantité, enregistrez un mouvement.':'Quantité initiale du matériel.';
 $('itemDialog').showModal();
}
$('add').onclick = () => openAsset();
for(const id of ['categoryFilter','locationFilter','modeFilter']) $(id).onchange=render;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('itemForm').onsubmit = async event => {
  event.preventDefault(); const form=event.currentTarget; const submit=form.querySelector('[type=submit]'); if(submit.disabled || !isAdmin()) return;
  const data = new FormData(form);
  const previous=state.items.find(i => i.id === editingId);
  const item = {...previous,id:editingId || crypto.randomUUID(),name:data.get('name').trim(),reference:data.get('reference').trim(),location:data.get('location').trim(),stock:previous ? previous.stock : Number(data.get('stock')),minimum:Number(data.get('minimum'))};
  item.trackingMode=previous?.trackingMode || data.get('trackingMode');
  item.category=String(data.get('category') || '');
  item.categoryName=state.categories?.find(c=>c.code===item.category)?.label || '';
  for(const [key] of identificationFields) item[key]=String(data.get(key) || '').trim();
  try {
    validateAsset(item,state.items,editingId,{allowMissingIdentifiers:true,allowDuplicateReference:true});
    if(!state.categories?.some(c=>c.code===item.category)) throw Error('Choisissez une catégorie du catalogue.');
    submit.disabled=true;
    const file=$('photoFile').files[0];
    if(file) {
     if(!pendingPhoto || pendingPhoto.file!==file) pendingPhoto={file,path:await repository.uploadPhoto(file)};
     item.photoPath=pendingPhoto.path;
    } else if($('removePhoto').checked) item.photoPath='';
    if(!editingId){
     const signature=JSON.stringify(item,Object.keys(item).filter(k=>k!=='id').sort());
     if(creationRequest.signature && creationRequest.signature!==signature)creationRequest.id=crypto.randomUUID();
     creationRequest.signature=signature;item.creationRequestId=creationRequest.id;
    }
    await repository.saveAsset(item,Boolean(editingId));
    $('itemDialog').close();
    await afterWrite(editingId ? 'Fiche mise à jour dans Supabase.' : 'Matériel ajouté dans Supabase.');
  } catch(e) { $('itemError').textContent=e.message; } finally { submit.disabled=false; }
};
function openStockAction(item,action) {
 if(!isAdmin())return;
 inventoryAction={item,action,id:crypto.randomUUID(),signature:null};
 $('stockActionForm').reset();$('stockActionError').textContent='';
 $('stockActionTitle').textContent=action==='adjust'?'Corriger le stock':'Supprimer la ligne du stock';
 $('stockActionItem').textContent=`${item.name} · Stock actuel : ${item.stock}`;
 $('targetQuantityLabel').hidden=action==='archive';
 $('stockActionForm').elements.quantity.disabled=action==='archive';
 $('stockActionForm').elements.quantity.value=item.stock;
 $('stockActionExplanation').textContent=action==='archive'
  ? `Cette ligne et ses ${item.stock} unités seront retirées de l’inventaire actif. La fiche, sa photo et son historique seront conservés. Cette action concerne uniquement ce matériel.`
  : 'Saisissez la quantité réellement constatée. La différence sera enregistrée dans les mouvements avec votre motif.';
 $('stockActionSubmit').textContent=action==='archive'?'Confirmer la suppression':'Enregistrer la quantité';
 $('stockActionSubmit').className=action==='archive'?'danger':'';
 $('stockActionDialog').showModal();
}
$('stockActionForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=$('stockActionSubmit');
 if(submit.disabled || !isAdmin() || !inventoryAction) return;
 const {item,action}=inventoryAction;const quantity=action==='archive'?item.stock:Number(form.elements.quantity.value),reason=form.elements.reason.value.trim();
 try {
  if(!Number.isSafeInteger(quantity) || quantity<0 || quantity>1000000) throw Error('Saisissez une quantité entière entre 0 et 1 000 000.');
  if(!reason || reason.length>512) throw Error('Renseignez un motif (512 caractères maximum).');
  const signature=JSON.stringify([quantity,reason]);
  if(inventoryAction.signature && inventoryAction.signature!==signature)inventoryAction.id=crypto.randomUUID();
  inventoryAction.signature=signature;submit.disabled=true;
  await repository.manageStock(item.id,action,quantity,item.stock,reason,inventoryAction.id);
  $('stockActionDialog').close();
  await afterWrite(action==='archive'?'Ligne supprimée de l’inventaire. Son historique est conservé.':'Stock corrigé et historique enregistré.');
 } catch(e) { $('stockActionError').textContent=e.message; } finally {submit.disabled=false;}
};
let trackingReference=null,trackingLoad=0,conversionRequest=null,editingDevice=null,deviceRequest=null;
function syncTrackingMode(){
 const individual=$('trackingMode').value==='individual';
 $('initialStockLabel').textContent=individual?'Nombre initial d’appareils':'Stock initial';
 document.querySelectorAll('.individual-metadata').forEach(el=>{el.hidden=individual;});
 $('itemForm').elements.stock.max=individual?'500':'1000000';
 $('trackingModeHelp').textContent=individual?'Le stock correspond au nombre d’appareils. Leurs informations individuelles pourront être complétées plus tard.':'Le stock est une quantité : aucune fiche individuelle n’est nécessaire.';
}
$('trackingMode').onchange=syncTrackingMode;
async function openTracking(reference,keepLocation=false){
 trackingReference=reference;const ticket=++trackingLoad;conversionRequest={id:crypto.randomUUID(),signature:null};
 $('trackingTitle').textContent=reference.name;
 $('trackingSummary').textContent=`${reference.stock} ${reference.trackingMode==='individual'?'appareils':'unités'} · ${categoryLabel(reference.category)}`;
 $('deviceLocationFilterLabel').hidden=reference.trackingMode!=='individual';if(!keepLocation)$('deviceLocationFilter').value=$('locationFilter').value;
 $('trackingError').textContent='';$('devicesList').replaceChildren();$('quantityLines').replaceChildren();$('convertForm').reset();$('conversionError').textContent='';
 $('addDevice').hidden=true;$('convertForm').hidden=!isAdmin() || reference.trackingMode==='individual';
 if(!$('trackingDialog').open)$('trackingDialog').showModal();
 if(reference.trackingMode==='individual'){
  try {
   const allDevices=await repository.devices(reference.id);
   const devices=allDevices.filter(d=>!$('deviceLocationFilter').value || (d.physical_location || 'UNSET')===$('deviceLocationFilter').value);
   if(ticket!==trackingLoad || !session)return;
   $('addDevice').hidden=!isAdmin();
   if(!devices.length)$('devicesList').append(element('p','Aucun appareil dans cet emplacement. Vous pouvez modifier le filtre ou ajouter un appareil sans numéro de série.'));
   devices.forEach(device=>{
    const card=element('article','','device-card');card.append(element('h3',deviceCode(device)));
    const dl=document.createElement('dl');
    for(const [label,value] of [['Numéro de série',device.serial_number || 'Non renseigné'],['Date d’achat',dateLabel(device.purchased_at)],['Fin de garantie',dateLabel(device.warranty_until)],['Disponibilité',deviceStatus[device.status]],['Emplacement physique',physicalLocations[device.physical_location || 'UNSET']]])dl.append(element('dt',label),element('dd',value));
    const edit=element('button',isAdmin()?'Compléter / modifier':'Consulter','secondary');edit.onclick=()=>openDevice(device);card.append(dl,edit);$('devicesList').append(card);
   });
  } catch(e){if(ticket===trackingLoad)$('trackingError').textContent=e.message;}
 } else {
  $('trackingSummary').textContent+=' · Gestion en quantité, sans fiches d’appareils.';
  for(const item of reference.members || [reference]){
   const row=element('article','','quantity-line');row.append(element('p',`${item.name} · ${item.stock} unité(s)`),element('p',locationSummary(item),'location-current'));
   if(item.serial || item.purchasedAt || item.warrantyUntil)row.append(element('small',`Série : ${item.serial || '—'} · Achat : ${dateLabel(item.purchasedAt)} · Garantie : ${dateLabel(item.warrantyUntil)}`));
   const controls=element('div','','actions');
   const edit=element('button','Fiche','secondary');edit.onclick=()=>{ $('trackingDialog').close();openAsset(item); };
   const adjust=element('button','Corriger cette quantité','secondary');adjust.onclick=()=>{ $('trackingDialog').close();openLocation(item,'adjust'); };
   const archive=element('button','Supprimer cette ligne','danger-outline');archive.onclick=()=>{ $('trackingDialog').close();openStockAction(item,'archive'); };
   const locate=element('button','Répartir / transférer MI / CS','secondary');locate.onclick=()=>{ $('trackingDialog').close();openLocation(item); };
   if(isAdmin())controls.append(edit,locate,adjust,archive);else controls.append(edit);row.append(controls);$('quantityLines').append(row);
  }
  $('convertForm').elements.count.value=reference.stock<=500?reference.stock:'';
 }
}
$('convertForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');if(submit.disabled || !isAdmin())return;
 const count=Number(form.elements.count.value),reason=form.elements.reason.value.trim();
 try {
  if(!Number.isSafeInteger(count)||count<0||count>500||!reason||!form.elements.confirm.checked)throw Error('Confirmez un nombre de 0 à 500 appareils et renseignez le motif.');
  const signature=JSON.stringify([count,reason]);if(conversionRequest.signature && conversionRequest.signature!==signature)conversionRequest.id=crypto.randomUUID();conversionRequest.signature=signature;submit.disabled=true;
  const id=await repository.convert(trackingReference.members || [trackingReference],count,reason,conversionRequest.id);
  await afterWrite('Référence regroupée : le stock est désormais calculé depuis les appareils.');
  const reference=groupReferences(state.items).find(i=>i.id===id);
  if(reference)await openTracking(reference);else $('trackingDialog').close();
 } catch(e){$('conversionError').textContent=e.message;}finally{submit.disabled=false;}
};
function openDevice(device=null){
 if(!device && !isAdmin())return;
 readonlyForm($('deviceForm'),!isAdmin());
 editingDevice=device;deviceRequest={id:crypto.randomUUID(),signature:null};$('deviceForm').reset();$('deviceError').textContent='';
 $('deviceTitle').textContent=device?deviceCode(device):'Ajouter un appareil';
 $('retireDevice').hidden=!device || !isAdmin();
 for(const key of ['serial_number','purchased_at','warranty_until','notes'])$('deviceForm').elements[key].value=device?.[key] || '';
 $('deviceForm').elements.physical_location.value=device?.physical_location || $('deviceLocationFilter').value || 'UNSET';
 $('deviceForm').elements.status.value=device?.status || 'available';$('deviceDialog').showModal();
}
$('deviceLocationFilter').onchange=()=>openTracking(trackingReference,true);
$('addDevice').onclick=()=>openDevice();
async function saveDevice(action){
 if($('saveDevice').disabled || !isAdmin())return;
 const form=$('deviceForm'),data=Object.fromEntries(new FormData(form));
 try {
  const signature=JSON.stringify([action,data]);if(deviceRequest.signature && deviceRequest.signature!==signature)deviceRequest.id=crypto.randomUUID();deviceRequest.signature=signature;
  $('saveDevice').disabled=true;$('retireDevice').disabled=true;
  const assetId=trackingReference.id;
  await repository.saveDevice(assetId,editingDevice,action,data,deviceRequest.id);
  $('deviceDialog').close();await afterWrite(action==='retire'?'Appareil retiré du stock, historique conservé.':'Appareil enregistré. Le stock est recalculé.');
  const reference=groupReferences(state.items).find(i=>i.id===assetId);
  if(reference)await openTracking(reference,true);else $('trackingDialog').close();
 } catch(e){$('deviceError').textContent=e.code==='23505'?'Ce numéro de série est déjà utilisé pour cette référence.':e.message;}finally{$('saveDevice').disabled=false;$('retireDevice').disabled=false;}
}
$('deviceForm').onsubmit=event=>{event.preventDefault();void saveDevice(editingDevice?'save':'create');};
$('retireDevice').onclick=()=>{if(confirm('Retirer cet appareil du stock ? Sa fiche et son historique seront conservés.'))void saveDevice('retire');};

$('manageCategories').onclick=()=>{if(!isAdmin())return; $('categoryForm').reset();$('categoryError').textContent='';$('categoryDialog').showModal(); };
$('categoryForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');
 if(submit.disabled || !isAdmin()) return;
 const data=new FormData(form),code=data.get('code').trim().toUpperCase(),label=data.get('label').trim();
 try {
  if(!/^[A-Z0-9_]{1,10}$/.test(code) || !label || label.length>50) throw Error('Code : 1 à 10 lettres/chiffres ; libellé : 1 à 50 caractères.');
  if(state.categories.some(c=>c.code===code)) throw Error('Ce code de catégorie existe déjà.');
  submit.disabled=true; await repository.createCategory(code,label); $('categoryDialog').close();await afterWrite('Catégorie créée. Elle est disponible pour les nouveaux matériels.');
 } catch(e) { $('categoryError').textContent=e.message; } finally {submit.disabled=false;}
};
let locationAction=null;
function syncLocationAction(){
 const form=$('locationForm'),action=form.elements.action.value;
 $('locationFromLabel').hidden=action==='entry';$('locationToLabel').hidden=action==='exit' || action==='adjust';
 $('locationFromLabel').firstChild.textContent=action==='transfer'?'Origine':'Emplacement concerné';
 $('locationQuantityLabel').textContent=action==='adjust'?'Quantité réelle à cet emplacement':action==='transfer'?'Quantité à transférer':'Quantité';
 form.elements.quantity.min=action==='adjust'?'0':'1';
 if(action==='adjust' && locationAction)form.elements.quantity.value=locationCounts(locationAction.item)[form.elements.from.value];
}
function openLocation(item,action='transfer'){
 if(!isAdmin())return;
 locationAction={item,id:crypto.randomUUID(),signature:null};$('locationForm').reset();$('locationError').textContent='';
 $('locationName').textContent=`${item.name} · Stock total : ${item.stock}`;$('locationCurrent').textContent=locationSummary(item);
 const form=$('locationForm');form.elements.action.value=action;
 form.elements.from.value=$('locationFilter').value || (locationCounts(item).UNSET?'UNSET':'MI');
 form.elements.to.value=form.elements.from.value==='MI'?'CS':'MI';syncLocationAction();$('locationDialog').showModal();
}
$('locationForm').elements.action.onchange=syncLocationAction;$('locationForm').elements.from.onchange=syncLocationAction;
$('locationForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');if(submit.disabled || !isAdmin() || !locationAction)return;
 const data=Object.fromEntries(new FormData(form)),quantity=Number(data.quantity);
 try {
  if(!Number.isSafeInteger(quantity) || quantity<0 || quantity>1000000 || (data.action!=='adjust' && quantity===0))throw Error('Saisissez une quantité entière valide.');
  const signature=JSON.stringify(data);if(locationAction.signature && locationAction.signature!==signature)locationAction.id=crypto.randomUUID();locationAction.signature=signature;submit.disabled=true;
  await repository.locate(locationAction.item,data.action,data.from,data.to,quantity,data.reason.trim(),locationAction.id);
  $('locationDialog').close();await afterWrite(data.action==='transfer'?'Répartition mise à jour. Le stock total est conservé.':'Stock de l’emplacement mis à jour et historique enregistré.');
 }catch(e){$('locationError').textContent=e.message;}finally{submit.disabled=false;}
};
function selectAuthMode(mode){authMode=mode;$('loginError').textContent='';$('signupError').textContent='';$('authMessage').textContent='';renderAccess();}
$('showLogin').onclick=()=>selectAuthMode('login');$('showSignup').onclick=()=>selectAuthMode('signup');
$('signupForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');if(submit.disabled || session)return;
 const data=new FormData(form);$('signupError').textContent='';$('authMessage').textContent='';
 if(data.get('password')!==data.get('confirmation')){$('signupError').textContent='Les deux mots de passe doivent être identiques.';return;}
 submit.disabled=true;
 try {
  const {data:result,error}=await client.auth.signUp({email:data.get('email').trim(),password:data.get('password'),options:{emailRedirectTo:new URL('/',location.href).href,data:{display_name:data.get('display_name').trim()}}});
  if(error)throw error;
  form.reset();authMode='login';renderAccess();
  $('authMessage').textContent='Si votre adresse permet une inscription, un message de confirmation vous sera envoyé. Confirmez votre adresse, puis connectez-vous. L’accès au magasin nécessite aussi l’accord d’un administrateur.';
  if(result.session)await updateSession(result.session);
 }catch(e){$('signupError').textContent=e.status===429?'Trop de demandes. Patientez avant de réessayer.':'Inscription impossible. Vérifiez les informations saisies ou contactez un administrateur.';}
 finally{submit.disabled=false;}
};
async function refreshAccounts(){
 if(!isAdmin())return;
 const ticket=++accountsRevision;$('refreshAccounts').disabled=true;$('accountsError').textContent='';$('accountsList').replaceChildren();
 try {
  const rows=await repository.accounts($('accountStatusFilter').value,accountsOffset);
  if(ticket!==accountsRevision || !isAdmin())return;
  $('accountsPage').textContent=`Page ${accountsOffset/50+1}`;$('previousAccounts').disabled=accountsOffset===0;$('nextAccounts').disabled=rows.length<50;
  if(!rows.length)$('accountsList').append(element('p','Aucun compte dans cette sélection.'));
  for(const account of rows){
   const card=element('article','','account-card');card.append(element('h3',account.display_name || 'Nom non renseigné'),element('p',account.email));
   const status={pending:'En attente',approved:'Autorisé',rejected:'Refusé / accès retiré'}[account.status];
   card.append(element('p',`${status} · ${account.email_confirmed?'E-mail confirmé':'E-mail à confirmer'}`));
   if(account.user_id===session.user.id){card.append(element('small','Votre compte administrateur — modification de votre propre accès désactivée.'));}
   else {
    const label=element('label','Rôle à attribuer');const select=document.createElement('select');select.append(new Option('Lecteur','reader'),new Option('Administrateur','admin'));select.value=account.role || 'reader';label.append(select);card.append(label);
    const controls=element('div','','account-actions');
    const accept=element('button',account.status==='approved'?'Enregistrer le rôle':'Accepter');accept.disabled=!account.email_confirmed;
    accept.onclick=()=>decideAccount(account,'approved',select.value,card);
    const reject=element('button',account.status==='approved'?'Retirer l’accès':'Refuser','danger-outline');reject.disabled=account.status==='rejected';
    reject.onclick=()=>{if(confirm(account.status==='approved'?`Retirer l’accès au magasin à ${account.email} ?`:`Refuser la demande de ${account.email} ?`))void decideAccount(account,'rejected',null,card);};
    controls.append(accept,reject);card.append(controls);
   }
   $('accountsList').append(card);
  }
 }catch(e){if(ticket===accountsRevision)$('accountsError').textContent=e.message;}
 finally{if(ticket===accountsRevision)$('refreshAccounts').disabled=false;}
}
async function decideAccount(account,status,role,card){
 if(!isAdmin())return;
 if(status==='approved' && role==='admin' && !confirm(`Accorder les droits administrateur à ${account.email} ?`))return;
 const ticket=accountsRevision;card.querySelectorAll('button,select').forEach(el=>{el.disabled=true;});$('accountsMessage').textContent='';
 try {
  await repository.decideAccount(account,status,role,crypto.randomUUID());
  if(ticket!==accountsRevision || !isAdmin())return;
  $('accountsMessage').textContent=status==='approved'?'Accès et rôle enregistrés.':'Demande refusée ou accès retiré.';await refreshAccounts();
 }catch(e){if(ticket===accountsRevision){$('accountsError').textContent=e.message;await refreshAccounts();$('accountsError').textContent=e.message;}}
}
$('refreshAccounts').onclick=refreshAccounts;$('accountStatusFilter').onchange=()=>{accountsOffset=0;void refreshAccounts();};
$('previousAccounts').onclick=()=>{accountsOffset=Math.max(0,accountsOffset-50);void refreshAccounts();};$('nextAccounts').onclick=()=>{accountsOffset+=50;void refreshAccounts();};
$('loginForm').onsubmit=async event=>{
 event.preventDefault(); const form=event.currentTarget,submit=form.querySelector('[type=submit]');
 if(submit.disabled) return;
 submit.disabled=true; $('loginError').textContent='';
 const data=new FormData(form);
 try {
  const {data:result,error}=await client.auth.signInWithPassword({email:data.get('email').trim(),password:data.get('password')});
  if(error) throw error;
  form.elements.password.value='';
  await updateSession(result.session);
 } catch { $('loginError').textContent='Connexion impossible. Vérifiez votre adresse, votre mot de passe et la connexion réseau.'; }
 finally { submit.disabled=false; }
};
$('logout').onclick=async()=>{
 const {error}=await client.auth.signOut({scope:'local'});
 await updateSession(null);
 if(error) $('notice').textContent='Session locale fermée. La révocation distante n’a pas pu être vérifiée.';
};
$('refresh').onclick=refresh; $('retry').onclick=refresh;
client.auth.onAuthStateChange((event,next)=>{
 if(event === 'SIGNED_OUT') void updateSession(null);
 if(event === 'TOKEN_REFRESHED') session=next;
});
const navigationLinks=[...document.querySelectorAll('.app-sidebar nav a[href^="#"],.mobile-nav a[href^="#"],.admin-navigation')];
function markSection(id){navigationLinks.forEach(link=>{if(link.hash===`#${id}`)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
navigationLinks.forEach(link=>link.addEventListener('click',()=>markSection(link.hash.slice(1))));
if(typeof IntersectionObserver!=='undefined'){
 const observer=new IntersectionObserver(entries=>{const visible=entries.find(entry=>entry.isIntersecting);if(visible)markSection(visible.target.id);},{rootMargin:'-10% 0px -60% 0px'});
 for(const id of ['overview','activity-section','accounts-section'])observer.observe($(id));
}
render();
try {
 const {data,error}=await client.auth.getSession();
 if(error) throw error;
 await updateSession(data.session);
} catch { clearInventory(); $('notice').textContent='Impossible de restaurer la session. Connectez-vous à nouveau.'; }
