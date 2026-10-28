import {moveStock} from './stock.js';
import {fields,validateAsset} from './patrimoine.js';
const $ = id => document.getElementById(id);
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './config.js';
import {createRepository} from './data.js';
const client=createClient(supabaseUrl,supabasePublishableKey,{
 auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:false}
});
const repository=createRepository(client);
let session=null, revision=0, pendingMovement=null;
for (const [name,label,code,max,type] of fields) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.name=name; input.maxLength=max; if(type === 'date') input.type='date';
  wrapper.append(input); const hint=document.createElement('small'); hint.textContent=code; wrapper.append(hint);
  $('assetFields').append(wrapper);
}
let editingId = null;
let state = {items:[],history:[]};
function clearInventory() {
 revision++; state={items:[],history:[]}; render();
 $('workspace').hidden=true; $('loginPanel').hidden=false;
 $('itemDialog').close(); $('moveDialog').close();
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
function render() {
  $('references').textContent = state.items.length;
  $('units').textContent = state.items.reduce((sum,i) => sum + i.stock,0);
  $('alerts').textContent = state.items.filter(i => i.stock <= i.minimum).length;
  $('defaultQuantities').textContent=state.items.filter(i => i.quantityDefaulted).length;
  for (const [id,field] of [['genreFilter','genre'],['categoryFilter','category'],['serviceFilter','service']]) {
    const select=$(id), previous=select.value;
    select.replaceChildren(new Option('Tous', ''));
    [...new Set(state.items.map(i => i[field]).filter(Boolean))].sort().forEach(value => select.add(new Option(value,value)));
    select.value=[...select.options].some(o => o.value === previous) ? previous : '';
  }
  const query = $('search').value.toLocaleLowerCase('fr');
  const visible = state.items.filter(i => [i.name,i.reference,i.location,...fields.map(([key]) => i[key] || '')].join(' ').toLocaleLowerCase('fr').includes(query) && [['genreFilter','genre'],['categoryFilter','category'],['serviceFilter','service']].every(([id,key]) => !$(id).value || i[key] === $(id).value) && (!$('onlyAlerts').checked || i.stock <= i.minimum));
  $('inventory').replaceChildren();
  visible.forEach(i => {
    const tr = document.createElement('tr');
    const name=element('td',i.name); name.append(element('small',i.assetCode ? `Code : ${i.assetCode}` : 'Code du bien non renseigné'));
    const classification=element('td',i.genre || '—'); classification.append(element('small',[i.category,i.subcategory].filter(Boolean).join(' / ') || 'Non classé'));
    const location=element('td',i.location || 'Non renseigné'); location.append(element('small',i.service ? `Service : ${i.service}` : 'Service non renseigné'));
    tr.append(name,element('td',i.reference || '—'),classification,location);
    const stock = element('td',String(i.stock)); stock.append(element('small',`Seuil : ${i.minimum}`)); if(i.quantityDefaulted) stock.append(element('small','Quantité initiale par défaut : 1'));  tr.append(stock);
    const status = document.createElement('td'); status.append(element('span',i.stock === 0 ? 'Rupture' : i.stock <= i.minimum ? 'Stock faible' : 'Disponible',`pill ${i.stock <= i.minimum ? 'warning' : ''}`)); tr.append(status);
    const action = document.createElement('td'); const button = element('button','Mouvement','secondary'); button.setAttribute('aria-label',`Mouvement : ${i.name}`);
    button.onclick = () => { selected = i.id; pendingMovement={id:crypto.randomUUID(),signature:null}; $('moveForm').reset(); $('moveError').textContent=''; $('moveName').textContent=`${i.name} · Stock actuel : ${i.stock}`; $('moveDialog').showModal(); };
    const edit=element('button','Fiche','secondary'); edit.setAttribute('aria-label',`Fiche : ${i.name}`); edit.onclick=()=>openAsset(i);
    action.append(edit,button); tr.append(action); $('inventory').append(tr);
  });
  $('empty').hidden = visible.length > 0;
  $('history').replaceChildren(); $('noHistory').hidden = state.history.length > 0;
  state.history.slice(0,20).forEach(m => $('history').append(element('li',`${m.type === 'entry' ? '+' : '−'}${m.quantity} · ${m.name} — ${new Date(m.date).toLocaleString('fr-FR')}`)));
}
let selected;
$('search').oninput = render; $('onlyAlerts').onchange = render;
function openAsset(item) {
 editingId=item?.id || null; $('itemForm').reset(); $('itemError').textContent='';
 $('itemTitle').textContent=item ? 'Fiche du matériel' : 'Ajouter du matériel';
 for(const control of $('itemForm').elements) if(control.name && item) control.value=item[control.name] ?? '';
 $('itemForm').elements.stock.disabled=Boolean(item);
 $('stockHelp').textContent=item ? 'Pour modifier la quantité, enregistrez un mouvement.' : 'Quantité initiale du matériel.';
 $('itemDialog').showModal();
}
$('add').onclick = () => openAsset();
for(const id of ['genreFilter','categoryFilter','serviceFilter']) $(id).onchange=render;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('itemForm').onsubmit = async event => {
  event.preventDefault(); const form=event.currentTarget; const submit=form.querySelector('[type=submit]'); if(submit.disabled || !session) return;
  const data = new FormData(form);
  const previous=state.items.find(i => i.id === editingId);
  const item = {...previous,id:editingId || crypto.randomUUID(),name:data.get('name').trim(),reference:data.get('reference').trim(),location:data.get('location').trim(),stock:previous ? previous.stock : Number(data.get('stock')),minimum:Number(data.get('minimum'))};
  for(const [key] of fields) item[key]=String(data.get(key) || '').trim();
  try {
    validateAsset(item,state.items,editingId,{allowMissingIdentifiers:true,allowDuplicateReference:true});
    submit.disabled=true;
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
