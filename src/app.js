import {moveStock} from './stock.js';
const $ = id => document.getElementById(id);
const key = 'ensosp-stock-v1';
const sample = [
  {id:'1',name:'Tuyau incendie Ø 45 mm',reference:'TUY-045',location:'Allée A · Étagère 1',stock:24,minimum:10},
  {id:'2',name:'Lance à débit variable',reference:'LAN-500',location:'Allée A · Étagère 2',stock:4,minimum:5},
  {id:'3',name:'Gants de protection',reference:'EPI-GAN',location:'Allée B · Bac 3',stock:38,minimum:15}
];
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
  const query = $('search').value.toLocaleLowerCase('fr');
  const visible = state.items.filter(i => `${i.name} ${i.reference} ${i.location}`.toLocaleLowerCase('fr').includes(query) && (!$('onlyAlerts').checked || i.stock <= i.minimum));
  $('inventory').replaceChildren();
  visible.forEach(i => {
    const tr = document.createElement('tr');
    tr.append(element('td',i.name),element('td',i.reference),element('td',i.location));
    const stock = element('td',String(i.stock)); stock.append(element('small',`Seuil : ${i.minimum}`)); tr.append(stock);
    const status = document.createElement('td'); status.append(element('span',i.stock === 0 ? 'Rupture' : i.stock <= i.minimum ? 'Stock faible' : 'Disponible',`pill ${i.stock <= i.minimum ? 'warning' : ''}`)); tr.append(status);
    const action = document.createElement('td'); const button = element('button','Mouvement','secondary'); button.setAttribute('aria-label',`Mouvement : ${i.name}`);
    button.onclick = () => { selected = i.id; $('moveForm').reset(); $('moveError').textContent=''; $('moveName').textContent=`${i.name} · Stock actuel : ${i.stock}`; $('moveDialog').showModal(); };
    action.append(button); tr.append(action); $('inventory').append(tr);
  });
  $('empty').hidden = visible.length > 0;
  $('history').replaceChildren(); $('noHistory').hidden = state.history.length > 0;
  state.history.slice(0,20).forEach(m => $('history').append(element('li',`${m.type === 'entry' ? '+' : '−'}${m.quantity} · ${m.name} — ${new Date(m.date).toLocaleString('fr-FR')}`)));
}
let selected;
$('search').oninput = render; $('onlyAlerts').onchange = render;
$('add').onclick = () => { $('itemForm').reset(); $('itemError').textContent=''; $('itemDialog').showModal(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
$('itemForm').onsubmit = event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const item = {id:crypto.randomUUID(),name:data.get('name').trim(),reference:data.get('reference').trim(),location:data.get('location').trim(),stock:Number(data.get('stock')),minimum:Number(data.get('minimum'))};
  try {
    if (!item.name || !item.reference || !item.location) throw Error('Complétez chaque champ.');
    if (![item.stock,item.minimum].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) throw Error('Les quantités doivent être des entiers entre 0 et 1 000 000.');
    if (state.items.some(i => i.reference.toLocaleLowerCase('fr') === item.reference.toLocaleLowerCase('fr'))) throw Error('Cette référence existe déjà.');
    save({...state,items:[...state.items,item]}); $('itemDialog').close(); $('notice').textContent='Matériel ajouté.';
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
