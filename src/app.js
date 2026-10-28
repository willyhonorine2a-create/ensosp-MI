import {moveStock} from './stock.js';
import {fields,validateAsset} from './patrimoine.js';
const $ = id => document.getElementById(id);
const key = 'ensosp-stock-v1';
const sample = [
  {id:'1',name:'Tuyau incendie Ø 45 mm',reference:'TUY-045',location:'Allée A · Étagère 1',stock:24,minimum:10},
  {id:'2',name:'Lance à débit variable',reference:'LAN-500',location:'Allée A · Étagère 2',stock:4,minimum:5},
  {id:'3',name:'Gants de protection',reference:'EPI-GAN',location:'Allée B · Bac 3',stock:38,minimum:15}
];
for (const [name,label,code,max,type] of fields) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  input.name=name; input.maxLength=max; if(type === 'date') input.type='date';
  wrapper.append(input); const hint=document.createElement('small'); hint.textContent=code; wrapper.append(hint);
  $('assetFields').append(wrapper);
}
let editingId = null;
let state = {items:sample,history:[]};
try {
  const saved = localStorage.getItem(key);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.history) || !parsed.items.every(i => ['id','name','reference','location'].every(k => typeof i[k] === 'string') && Number.isSafeInteger(i.stock) && i.stock >= 0 && Number.isSafeInteger(i.minimum) && i.minimum >= 0) || !parsed.history.every(m => typeof m.name === 'string' && ['entry','exit'].includes(m.type) && Number.isSafeInteger(m.quantity) && m.quantity > 0 && Number.isFinite(Date.parse(m.date)))) throw Error();
    state = parsed;
  }
} catch { $('notice').textContent = 'Le stockage local est indisponible ou illisible. Les exemples sont affichés ; vos anciennes données ne seront pas remplacées sans une nouvelle action.'; }
function save(next) {
  try { localStorage.setItem(key, JSON.stringify(next)); }
  catch { throw new Error('Enregistrement impossible : vérifiez que le stockage du navigateur est disponible.'); }
  state = next;
  render();
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
    const location=element('td',i.location); location.append(element('small',i.service ? `Service : ${i.service}` : 'Service non renseigné'));
    tr.append(name,element('td',i.reference),classification,location);
    const stock = element('td',String(i.stock)); stock.append(element('small',`Seuil : ${i.minimum}`)); tr.append(stock);
    const status = document.createElement('td'); status.append(element('span',i.stock === 0 ? 'Rupture' : i.stock <= i.minimum ? 'Stock faible' : 'Disponible',`pill ${i.stock <= i.minimum ? 'warning' : ''}`)); tr.append(status);
    const action = document.createElement('td'); const button = element('button','Mouvement','secondary'); button.setAttribute('aria-label',`Mouvement : ${i.name}`);
    button.onclick = () => { selected = i.id; $('moveForm').reset(); $('moveError').textContent=''; $('moveName').textContent=`${i.name} · Stock actuel : ${i.stock}`; $('moveDialog').showModal(); };
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
$('itemForm').onsubmit = event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const previous=state.items.find(i => i.id === editingId);
  const item = {...previous,id:editingId || crypto.randomUUID(),name:data.get('name').trim(),reference:data.get('reference').trim(),location:data.get('location').trim(),stock:previous ? previous.stock : Number(data.get('stock')),minimum:Number(data.get('minimum'))};
  for(const [key] of fields) item[key]=String(data.get(key) || '').trim();
  try {
    validateAsset(item,state.items,editingId);
    save({...state,items:editingId ? state.items.map(i => i.id === editingId ? item : i) : [...state.items,item]});
    $('itemDialog').close(); $('notice').textContent=editingId ? 'Fiche mise à jour.' : 'Matériel ajouté.';
  } catch(e) { $('itemError').textContent=e.message; }
};
$('moveForm').onsubmit = event => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const type = data.get('type'); const quantity = Number(data.get('quantity'));
  try {
    const items = moveStock(state.items,selected,type,quantity);
    const movement = {name:state.items.find(i => i.id === selected).name,type,quantity,date:new Date().toISOString()};
    save({items,history:[movement,...state.history]}); $('moveDialog').close(); $('notice').textContent='Mouvement enregistré.';
  } catch(e) { $('moveError').textContent=e.message; }
};
render();
