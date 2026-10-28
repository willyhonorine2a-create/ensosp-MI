import {moveStock} from './stock.js';
import {fields,identificationFields,validateAsset} from './patrimoine.js';
const $ = id => document.getElementById(id);
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './config.js';
import {createRepository} from './data.js';
import {validatePhoto} from './photos.js';
import {groupReferences,deviceCode,dateLabel,deviceStatus} from './references.js';
const client=createClient(supabaseUrl,supabasePublishableKey,{
 auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:false}
});
const repository=createRepository(client);
let session=null, revision=0, pendingMovement=null, inventoryAction=null;
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
function clearInventory() {
 revision++; state={items:[],history:[]}; render();
 $('workspace').hidden=true; $('loginPanel').hidden=false;
 $('itemDialog').close(); $('moveDialog').close(); $('categoryDialog').close(); $('stockActionDialog').close(); $('trackingDialog').close();$('deviceDialog').close();
}
async function refresh() {
 if(!session) return;
 const current=++revision;
 $('refresh').disabled=true;
 try {
  const next=await repository.load(session.user.id);
  if(current !== revision) return;
  state=next; render(); $('workspace').hidden=false; $('loginPanel').hidden=true;
  $('notice').textContent='Stock chargé depuis Supabase.';
 } catch(e) {
  if(current !== revision) return;
  // Ne pas laisser agir sur un stock qui n'a pas pu être relu.
  state={items:[],history:[]}; render(); $('workspace').hidden=true; $('loginPanel').hidden=false;
  $('notice').textContent=e.message || 'Chargement impossible. Réessayez.';
 } finally { if(current === revision) $('refresh').disabled=false; }
}
async function updateSession(next) {
 const changed=session?.user.id !== next?.user.id;
 session=next;
 $('logout').hidden=!session;
 $('account').textContent=session?.user.email || '';
 if(changed || !session) clearInventory();
 $('loginForm').hidden=Boolean(session);
 $('retry').hidden=!session;
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
function render() {
  const references=groupReferences(state.items);
  $('references').textContent = references.length;
  $('units').textContent = state.items.reduce((sum,i) => sum + i.stock,0);
  $('alerts').textContent = references.filter(i => i.availableStock <= i.minimum).length;
  $('defaultQuantities').textContent=state.items.filter(i => i.quantityDefaulted).length;
  const unclassified=state.items.filter(i=>!state.categories?.some(c=>c.code===i.category)).length;
  $('classificationWarnings').textContent=unclassified ? `${unclassified} matériels à classer dans une catégorie.` : '';
  fillCategories($('categoryFilter'),$('categoryFilter').value);
  $('categoryRows').replaceChildren();
  (state.categories || []).forEach(c=>{const tr=document.createElement('tr');tr.append(element('td',c.code),element('td',c.label));$('categoryRows').append(tr);});
  const services=$('serviceFilter'), previousService=services.value;
  services.replaceChildren(new Option('Tous',''));
  [...new Set(state.items.map(i=>i.service).filter(Boolean))].sort().forEach(v=>services.add(new Option(v,v)));
  services.value=[...services.options].some(o=>o.value===previousService)?previousService:'';
  const query = $('search').value.toLocaleLowerCase('fr');
  const visible = references.filter(i => [i.name,i.reference,i.location,...fields.map(([key]) => i[key] || ''),categoryLabel(i.category)].join(' ').toLocaleLowerCase('fr').includes(query) && [['categoryFilter','category'],['serviceFilter','service']].every(([id,key]) => !$(id).value || i[key] === $(id).value) && (!$('onlyAlerts').checked || i.availableStock <= i.minimum));
  $('inventory').replaceChildren();
  visible.forEach(i => {
    const tr = document.createElement('tr'); tr.setAttribute('role','row');
    const name=element('td',i.name);
    const photo=document.createElement('td');
    if(i.photoUrl) {
     const button=element('button','','photo-button');button.setAttribute('aria-label',`Voir la photo de ${i.name}`);
     const img=document.createElement('img');img.src=i.photoUrl;img.alt=`Photo : ${i.name}`;img.loading='lazy';img.className='stock-photo';
     img.onerror=()=>{button.replaceChildren(element('span','Photo indisponible'));};
     button.append(img);button.onclick=()=>i.members.length>1?openTracking(i):openAsset(i);photo.append(button);
    } else photo.append(element('span',i.photoUnavailable ? 'Photo indisponible' : '—'));
    const stock=document.createElement('td'), stockButton=element('button',String(i.stock),'stock-link');
    stockButton.setAttribute('aria-label',`Voir le stock : ${i.name}`);stockButton.onclick=()=>openTracking(i);stock.append(stockButton);
    stock.append(element('small',i.trackingMode==='individual'?`${i.availableStock} disponible(s)`:'Gestion en quantité'));
    if(i.members.length>1)stock.append(element('small',`${i.members.length} lignes regroupées`));
    const status=document.createElement('td');status.append(element('span',i.availableStock===0?(i.trackingMode==='individual'?'Indisponible':'Rupture'):i.availableStock<=i.minimum?'Stock faible':'Disponible',`pill ${i.availableStock<=i.minimum?'warning':''}`));
    tr.append(photo,name,element('td',i.reference || '—'),element('td',categoryLabel(i.category)),stock,status);
    const action = document.createElement('td'); const button = element('button','Mouvement','secondary'); button.setAttribute('aria-label',`Mouvement : ${i.name}`);
    button.onclick = () => { if(i.trackingMode==='individual' || i.members.length>1){void openTracking(i);return;} selected = i.id; pendingMovement={id:crypto.randomUUID(),signature:null}; $('moveForm').reset(); $('moveError').textContent=''; $('moveName').textContent=`${i.name} · Stock actuel : ${i.stock}`; $('moveDialog').showModal(); };
    const edit=element('button','Fiche','secondary'); edit.setAttribute('aria-label',`Fiche : ${i.name}`); edit.onclick=()=>i.members.length>1?openTracking(i):openAsset(i);
    const adjust=element('button','Corriger le stock','secondary');adjust.setAttribute('aria-label',`Corriger le stock : ${i.name}`);adjust.onclick=()=>openStockAction(i,'adjust');
    const remove=element('button','Supprimer','danger-outline');remove.setAttribute('aria-label',`Supprimer : ${i.name}`);remove.onclick=()=>openStockAction(i,'archive');
    action.className='row-actions';const actionButtons=document.createElement('div');actionButtons.className='action-buttons';if(i.trackingMode==='individual'){button.textContent='Appareils';actionButtons.append(edit,button,remove);}else if(i.members.length>1){edit.textContent='Voir les lignes';button.textContent='Suivi individuel';actionButtons.append(edit,button);}else actionButtons.append(edit,button,adjust,remove);action.append(actionButtons);tr.append(action);
    const columns=[['photo','Photo'],['name','Matériel'],['reference','Référence'],['category','Catégorie'],['stock','Stock'],['status','Disponibilité'],['actions','Actions']];
    [...tr.children].forEach((cell,index)=>{cell.classList.add(`cell-${columns[index][0]}`);cell.dataset.label=columns[index][1];cell.setAttribute('role','cell');});
    $('inventory').append(tr);
  });
  $('empty').hidden = visible.length > 0;
  $('history').replaceChildren(); $('noHistory').hidden = state.history.length > 0;
  state.history.slice(0,20).forEach(m => $('history').append(element('li',`${m.type === 'entry' ? '+' : '−'}${m.quantity} · ${m.name} — ${new Date(m.date).toLocaleString('fr-FR')}${m.reason ? ' · '+m.reason : ''}`)));
  $('stockEvents').replaceChildren();$('noStockEvents').hidden=Boolean(state.events?.length);
  (state.events || []).forEach(e=>$('stockEvents').append(element('li',`${e.action==='archive' ? 'Ligne supprimée' : 'Stock corrigé'} · ${e.stock_assets?.designation || 'Matériel'} · ${e.before_quantity} → ${e.after_quantity} · ${e.reason} — ${new Date(e.created_at).toLocaleString('fr-FR')}`)));

}
let selected;
$('search').oninput = render; $('onlyAlerts').onchange = render;
function openAsset(item) {
 editingId=item?.id || null; pendingPhoto=null;creationRequest={id:crypto.randomUUID(),signature:null}; $('itemForm').reset(); $('itemError').textContent='';
 $('itemTitle').textContent=item ? 'Fiche du matériel' : 'Ajouter du matériel';
 for(const control of $('itemForm').elements) if(control.name && item && control.name!=='category') control.value=item[control.name] ?? '';
 fillCategories($('itemForm').elements.category,item?.category || '','Choisir une catégorie');
 $('photoFile').value='';$('removePhoto').checked=false;$('removePhoto').disabled=!item?.photoPath;
 showPhoto(item?.photoUrl || '');
 $('itemForm').elements.stock.disabled=Boolean(item);
 $('trackingMode').disabled=Boolean(item);$('trackingMode').value=item?.trackingMode || 'quantity';syncTrackingMode();
 $('stockHelp').textContent=item?.trackingMode==='individual'?'Pour modifier ce stock, ajoutez ou retirez un appareil depuis le chiffre du stock.':item?'Pour modifier la quantité, enregistrez un mouvement.':'Quantité initiale du matériel.';
 $('itemDialog').showModal();
}
$('add').onclick = () => openAsset();
for(const id of ['categoryFilter','serviceFilter']) $(id).onchange=render;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('itemForm').onsubmit = async event => {
  event.preventDefault(); const form=event.currentTarget; const submit=form.querySelector('[type=submit]'); if(submit.disabled || !session) return;
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
$('moveForm').onsubmit = async event => {
 event.preventDefault(); const form=event.currentTarget; const submit=form.querySelector('[type=submit]');
 if(submit.disabled || !session) return;
 const data=new FormData(form),type=data.get('type'),quantity=Number(data.get('quantity')),reason=data.get('reason').trim();
 try {
  moveStock(state.items,selected,type,quantity); // retour immédiat ; la base reste autoritaire
  const signature=JSON.stringify([selected,type,quantity,reason]);
  if(pendingMovement.signature && pendingMovement.signature !== signature) pendingMovement.id=crypto.randomUUID();
  pendingMovement.signature=signature;
  submit.disabled=true;
  await repository.move(selected,type,quantity,reason,pendingMovement.id);
  $('moveDialog').close();
  await afterWrite('Mouvement enregistré dans Supabase.');
 } catch(e) { $('moveError').textContent=e.message; } finally { submit.disabled=false; }
};
function openStockAction(item,action) {
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
 if(submit.disabled || !session || !inventoryAction) return;
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
async function openTracking(reference){
 trackingReference=reference;const ticket=++trackingLoad;conversionRequest={id:crypto.randomUUID(),signature:null};
 $('trackingTitle').textContent=reference.name;
 $('trackingSummary').textContent=`${reference.stock} ${reference.trackingMode==='individual'?'appareils':'unités'} · ${categoryLabel(reference.category)}`;
 $('trackingError').textContent='';$('devicesList').replaceChildren();$('quantityLines').replaceChildren();$('convertForm').reset();$('conversionError').textContent='';
 $('addDevice').hidden=true;$('convertForm').hidden=reference.trackingMode==='individual';
 if(!$('trackingDialog').open)$('trackingDialog').showModal();
 if(reference.trackingMode==='individual'){
  try {
   const devices=await repository.devices(reference.id);
   if(ticket!==trackingLoad || !session)return;
   $('addDevice').hidden=false;
   if(!devices.length)$('devicesList').append(element('p','Aucun appareil. Vous pouvez en ajouter sans renseigner son numéro de série.'));
   devices.forEach(device=>{
    const card=element('article','','device-card');card.append(element('h3',deviceCode(device)));
    const dl=document.createElement('dl');
    for(const [label,value] of [['Numéro de série',device.serial_number || 'Non renseigné'],['Date d’achat',dateLabel(device.purchased_at)],['Fin de garantie',dateLabel(device.warranty_until)],['Disponibilité',deviceStatus[device.status]]])dl.append(element('dt',label),element('dd',value));
    const edit=element('button','Compléter / modifier','secondary');edit.onclick=()=>openDevice(device);card.append(dl,edit);$('devicesList').append(card);
   });
  } catch(e){if(ticket===trackingLoad)$('trackingError').textContent=e.message;}
 } else {
  $('trackingSummary').textContent+=' · Gestion en quantité, sans fiches d’appareils.';
  for(const item of reference.members || [reference]){
   const row=element('article','','quantity-line');row.append(element('p',`${item.name} · ${item.stock} unité(s)`));
   if(item.serial || item.purchasedAt || item.warrantyUntil)row.append(element('small',`Série : ${item.serial || '—'} · Achat : ${dateLabel(item.purchasedAt)} · Garantie : ${dateLabel(item.warrantyUntil)}`));
   const controls=element('div','','actions');
   const edit=element('button','Fiche','secondary');edit.onclick=()=>{ $('trackingDialog').close();openAsset(item); };
   const adjust=element('button','Corriger cette quantité','secondary');adjust.onclick=()=>{ $('trackingDialog').close();openStockAction(item,'adjust'); };
   const archive=element('button','Supprimer cette ligne','danger-outline');archive.onclick=()=>{ $('trackingDialog').close();openStockAction(item,'archive'); };
   controls.append(edit,adjust,archive);row.append(controls);$('quantityLines').append(row);
  }
  $('convertForm').elements.count.value=reference.stock<=500?reference.stock:'';
 }
}
$('convertForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');if(submit.disabled || !session)return;
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
 editingDevice=device;deviceRequest={id:crypto.randomUUID(),signature:null};$('deviceForm').reset();$('deviceError').textContent='';
 $('deviceTitle').textContent=device?deviceCode(device):'Ajouter un appareil';
 $('retireDevice').hidden=!device;
 for(const key of ['serial_number','purchased_at','warranty_until','notes'])$('deviceForm').elements[key].value=device?.[key] || '';
 $('deviceForm').elements.status.value=device?.status || 'available';$('deviceDialog').showModal();
}
$('addDevice').onclick=()=>openDevice();
async function saveDevice(action){
 if($('saveDevice').disabled || !session)return;
 const form=$('deviceForm'),data=Object.fromEntries(new FormData(form));
 try {
  const signature=JSON.stringify([action,data]);if(deviceRequest.signature && deviceRequest.signature!==signature)deviceRequest.id=crypto.randomUUID();deviceRequest.signature=signature;
  $('saveDevice').disabled=true;$('retireDevice').disabled=true;
  const assetId=trackingReference.id;
  await repository.saveDevice(assetId,editingDevice,action,data,deviceRequest.id);
  $('deviceDialog').close();await afterWrite(action==='retire'?'Appareil retiré du stock, historique conservé.':'Appareil enregistré. Le stock est recalculé.');
  const reference=groupReferences(state.items).find(i=>i.id===assetId);
  if(reference)await openTracking(reference);else $('trackingDialog').close();
 } catch(e){$('deviceError').textContent=e.code==='23505'?'Ce numéro de série est déjà utilisé pour cette référence.':e.message;}finally{$('saveDevice').disabled=false;$('retireDevice').disabled=false;}
}
$('deviceForm').onsubmit=event=>{event.preventDefault();void saveDevice(editingDevice?'save':'create');};
$('retireDevice').onclick=()=>{if(confirm('Retirer cet appareil du stock ? Sa fiche et son historique seront conservés.'))void saveDevice('retire');};

$('manageCategories').onclick=()=>{ $('categoryForm').reset();$('categoryError').textContent='';$('categoryDialog').showModal(); };
$('categoryForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');
 if(submit.disabled || !session) return;
 const data=new FormData(form),code=data.get('code').trim().toUpperCase(),label=data.get('label').trim();
 try {
  if(!/^[A-Z0-9_]{1,10}$/.test(code) || !label || label.length>50) throw Error('Code : 1 à 10 lettres/chiffres ; libellé : 1 à 50 caractères.');
  if(state.categories.some(c=>c.code===code)) throw Error('Ce code de catégorie existe déjà.');
  submit.disabled=true; await repository.createCategory(code,label); $('categoryDialog').close();await afterWrite('Catégorie créée. Elle est disponible pour les nouveaux matériels.');
 } catch(e) { $('categoryError').textContent=e.message; } finally {submit.disabled=false;}
};
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
render();
try {
 const {data,error}=await client.auth.getSession();
 if(error) throw error;
 await updateSession(data.session);
} catch { clearInventory(); $('notice').textContent='Impossible de restaurer la session. Connectez-vous à nouveau.'; }
