import {moveStock} from './stock.js';
import {fields,validateAsset} from './patrimoine.js';
const $ = id => document.getElementById(id);
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './config.js';
import {createRepository} from './data.js';
import {validatePhoto} from './photos.js';
const client=createClient(supabaseUrl,supabasePublishableKey,{
 auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:false}
});
const repository=createRepository(client);
let session=null, revision=0, pendingMovement=null, inventoryAction=null;
for (const [name,label,code,max,type] of fields) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.name=name; input.maxLength=max; if(type === 'date') input.type='date';
  wrapper.append(input); const hint=document.createElement('small'); hint.textContent=code; wrapper.append(hint);
  $('assetFields').append(wrapper);
}
let editingId = null, pendingPhoto=null, previewObjectUrl=null;
let state = {items:[],history:[]};
function clearInventory() {
 revision++; state={items:[],history:[]}; render();
 $('workspace').hidden=true; $('loginPanel').hidden=false;
 $('itemDialog').close(); $('moveDialog').close(); $('categoryDialog').close(); $('stockActionDialog').close();
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
  $('references').textContent = state.items.length;
  $('units').textContent = state.items.reduce((sum,i) => sum + i.stock,0);
  $('alerts').textContent = state.items.filter(i => i.stock <= i.minimum).length;
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
  const visible = state.items.filter(i => [i.name,i.reference,i.location,...fields.map(([key]) => i[key] || ''),categoryLabel(i.category)].join(' ').toLocaleLowerCase('fr').includes(query) && [['categoryFilter','category'],['serviceFilter','service']].every(([id,key]) => !$(id).value || i[key] === $(id).value) && (!$('onlyAlerts').checked || i.stock <= i.minimum));
  $('inventory').replaceChildren();
  visible.forEach(i => {
    const tr = document.createElement('tr'); tr.setAttribute('role','row');
    const name=element('td',i.name); name.append(element('small',i.assetCode ? `Code : ${i.assetCode}` : 'Code du bien non renseigné'));
    const classification=element('td',categoryLabel(i.category));
    const location=element('td',i.location || 'Non renseigné'); location.append(element('small',i.service ? `Service : ${i.service}` : 'Service non renseigné'));
    const photo=document.createElement('td');
    if(i.photoUrl) {
     const button=element('button','','photo-button');button.setAttribute('aria-label',`Voir la photo de ${i.name}`);
     const img=document.createElement('img');img.src=i.photoUrl;img.alt=`Photo : ${i.name}`;img.loading='lazy';img.className='stock-photo';
     img.onerror=()=>{button.replaceChildren(element('span','Photo indisponible'));};
     button.append(img);button.onclick=()=>openAsset(i);photo.append(button);
    } else photo.append(element('span',i.photoUnavailable ? 'Photo indisponible' : '—'));
    tr.append(photo,name,element('td',i.reference || '—'),classification,location);
    const stock = element('td',String(i.stock)); stock.append(element('small',`Seuil : ${i.minimum}`)); if(i.quantityDefaulted) stock.append(element('small','Quantité initiale par défaut : 1'));  tr.append(stock);
    const status = document.createElement('td'); status.append(element('span',i.stock === 0 ? 'Rupture' : i.stock <= i.minimum ? 'Stock faible' : 'Disponible',`pill ${i.stock <= i.minimum ? 'warning' : ''}`)); tr.append(status);
    const action = document.createElement('td'); const button = element('button','Mouvement','secondary'); button.setAttribute('aria-label',`Mouvement : ${i.name}`);
    button.onclick = () => { selected = i.id; pendingMovement={id:crypto.randomUUID(),signature:null}; $('moveForm').reset(); $('moveError').textContent=''; $('moveName').textContent=`${i.name} · Stock actuel : ${i.stock}`; $('moveDialog').showModal(); };
    const edit=element('button','Fiche','secondary'); edit.setAttribute('aria-label',`Fiche : ${i.name}`); edit.onclick=()=>openAsset(i);
    const adjust=element('button','Corriger le stock','secondary');adjust.setAttribute('aria-label',`Corriger le stock : ${i.name}`);adjust.onclick=()=>openStockAction(i,'adjust');
    const remove=element('button','Supprimer','danger-outline');remove.setAttribute('aria-label',`Supprimer : ${i.name}`);remove.onclick=()=>openStockAction(i,'archive');
    action.className='row-actions';const actionButtons=document.createElement('div');actionButtons.className='action-buttons';actionButtons.append(edit,button,adjust,remove);action.append(actionButtons);tr.append(action);
    const columns=[['photo','Photo'],['name','Matériel'],['reference','Référence'],['category','Catégorie'],['location','Affectation'],['stock','Stock'],['status','Disponibilité'],['actions','Actions']];
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
 editingId=item?.id || null; pendingPhoto=null; $('itemForm').reset(); $('itemError').textContent='';
 $('itemTitle').textContent=item ? 'Fiche du matériel' : 'Ajouter du matériel';
 for(const control of $('itemForm').elements) if(control.name && item && control.name!=='category') control.value=item[control.name] ?? '';
 fillCategories($('itemForm').elements.category,item?.category || '','Choisir une catégorie');
 $('photoFile').value='';$('removePhoto').checked=false;$('removePhoto').disabled=!item?.photoPath;
 showPhoto(item?.photoUrl || '');
 $('itemForm').elements.stock.disabled=Boolean(item);
 $('stockHelp').textContent=item ? 'Pour modifier la quantité, enregistrez un mouvement.' : 'Quantité initiale du matériel.';
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
  item.category=String(data.get('category') || '');
  item.categoryName=state.categories?.find(c=>c.code===item.category)?.label || '';
  for(const [key] of fields) item[key]=String(data.get(key) || '').trim();
  try {
    validateAsset(item,state.items,editingId,{allowMissingIdentifiers:true,allowDuplicateReference:true});
    if(!state.categories?.some(c=>c.code===item.category)) throw Error('Choisissez une catégorie du catalogue.');
    submit.disabled=true;
    const file=$('photoFile').files[0];
    if(file) {
     if(!pendingPhoto || pendingPhoto.file!==file) pendingPhoto={file,path:await repository.uploadPhoto(file)};
     item.photoPath=pendingPhoto.path;
    } else if($('removePhoto').checked) item.photoPath='';
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
