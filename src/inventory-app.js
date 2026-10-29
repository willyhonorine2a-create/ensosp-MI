import {filterVehicles,filterSections,inventoryTotals} from './public-inventory.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
let data=null,limit=12,selectedSheet=null;
const hashFor=(center='',vehicle='')=>'#'+new URLSearchParams({...center?{centre:center}:{},...vehicle?{engin:vehicle}:{}}).toString();
const sheetFor=vehicle=>data.sheets.find(sheet=>sheet.id===vehicle.sheetId);
function renderFleet(){
 const center=$('centerFilter').value,search=$('vehicleSearch').value,onlySheets=$('onlySheets').checked;
 const visible=filterVehicles(data.vehicles,{center,search,onlySheets});
 $('vehiclesHeading').textContent=center?`Les engins · ${center}`:'Les engins';$('vehicleCount').textContent=`${visible.length} engin(s)`;
 $('centerCards').querySelectorAll('a').forEach(link=>{if(link.dataset.center===center)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
 $('vehicleCards').replaceChildren();
 for(const vehicle of visible.slice(0,limit)){
  const sheet=sheetFor(vehicle),card=el('article',undefined,'vehicle-card');
  const visual=el('div',undefined,'vehicle-visual');
  if(sheet?.photos.length){const image=el('img');image.src=sheet.photos[0].src;image.alt=`Photo de la fiche ${vehicle.name}`;image.loading='lazy';visual.append(image);}
  else {visual.append(el('span',vehicle.name.match(/^[A-Z]+/)[0],'vehicle-type'));visual.setAttribute('aria-hidden','true');}
  const content=el('div',undefined,'vehicle-content');content.append(el('span',vehicle.center || 'Affectation à confirmer','vehicle-center'),el('h3',vehicle.name),el('p',vehicle.registration,'registration'));
  if(sheet){const link=el('a','Consulter l’inventaire →','sheet-link');link.href=hashFor(vehicle.center,vehicle.id);content.append(link);}
  else content.append(el('span','Fiche à ajouter','sheet-pending'));
  card.append(visual,content);$('vehicleCards').append(card);
 }
 $('noVehicles').hidden=visible.length>0;$('moreVehicles').hidden=visible.length<=limit;
}
function renderEquipment(){
 const sections=filterSections(selectedSheet.sections,$('equipmentSearch').value);
 $('compartments').replaceChildren();$('compartmentNav').replaceChildren();
 for(const section of sections){
  const card=el('section',undefined,'compartment');card.id=`compartment-${section.id}`;
  card.append(el('h3',section.label));const table=el('table');
  const head=el('thead'),tr=el('tr'),nameHeading=el('th','Matériel'),quantityHeading=el('th','Quantité');nameHeading.scope='col';quantityHeading.scope='col';tr.append(nameHeading,quantityHeading);head.append(tr);table.append(head);
  const body=el('tbody');
  for(const item of section.items){const row=el('tr');row.append(el('td',item.designation),el('td',item.quantityText || String(item.quantity),'equipment-quantity'));body.append(row);}
  table.append(body);card.append(table);$('compartments').append(card);
  const link=el('a',section.label);link.href=`#${card.id}`;link.onclick=event=>{event.preventDefault();card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};$('compartmentNav').append(link);
 }
 $('noEquipment').hidden=sections.length>0;
}
function openSheet(vehicle,sheet){
 selectedSheet=sheet;$('fleetView').hidden=true;$('sheetView').hidden=false;
 $('sheetTitle').textContent=vehicle.name;$('sheetCenter').textContent=`${vehicle.center || 'Affectation à confirmer'} · INVENTAIRE DE L’ENGIN`;
 $('sheetRegistration').textContent=vehicle.registration;$('sheetMetadata').textContent=`Document : ${sheet.source} · Mise à jour : ${sheet.updatedAt} · Version ${sheet.version}`;
 $('backToFleet').href=hashFor(vehicle.center);$('equipmentSearch').value='';
 const totals=inventoryTotals(sheet);$('sheetTotals').replaceChildren(...[[totals.sections,'compartiments'],[totals.lines,'lignes de matériel'],[totals.units,'unités dans la fiche']].map(([count,label])=>{const stat=el('div');stat.append(el('strong',String(count)),el('span',label));return stat;}));
 $('sheetPhotos').replaceChildren();
 for(const photo of sheet.photos){
  const figure=el('figure'),button=el('button',undefined,'sheet-photo-button'),image=el('img');image.src=photo.src;image.alt=photo.caption;image.loading='lazy';button.setAttribute('aria-label',`Agrandir : ${photo.caption}`);button.append(image);
  button.onclick=()=>{$('fullPhoto').src=photo.src;$('fullPhoto').alt=photo.caption;$('photoCaption').textContent=photo.caption;$('photoViewer').showModal();};
  figure.append(button,el('figcaption',photo.caption));$('sheetPhotos').append(figure);
 }
 document.title=`${vehicle.name} · ${vehicle.center} · Inventaire ENSOSP`;renderEquipment();window.scrollTo(0,0);
}
function route(){
 if(!data)return;
 const params=new URLSearchParams(location.hash.slice(1));const center=params.get('centre') || '',vehicle=data.vehicles.find(v=>v.id===params.get('engin'));
 const sheet=vehicle && sheetFor(vehicle);
 $('inventoryStatus').textContent='';
 if(sheet){openSheet(vehicle,sheet);return;}
 selectedSheet=null;$('sheetView').hidden=true;$('fleetView').hidden=false;
 $('centerFilter').value=[...$('centerFilter').options].some(o=>o.value===center)?center:'';
 if(params.has('engin'))$('inventoryStatus').textContent='Cette fiche n’est pas disponible. Retrouvez les engins ci-dessous.';
 document.title='Inventaires des engins · ENSOSP';limit=12;renderFleet();
}
async function load(){
 $('retryInventory').hidden=true;$('inventoryStatus').textContent='Chargement des inventaires…';
 try {
  const response=await fetch('/inventaire/data.json');if(!response.ok)throw Error();data=await response.json();
  const centers=[...new Set(data.vehicles.map(v=>v.center).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  $('fleetCount').textContent=data.vehicles.length;$('centerCount').textContent=centers.length;$('sheetCount').textContent=data.sheets.length;
  $('centerFilter').replaceChildren(new Option('Toutes les affectations',''),...centers.map(c=>new Option(c,c)));
  $('centerCards').replaceChildren();
  for(const center of centers){
   const vehicles=data.vehicles.filter(v=>v.center===center),sheets=vehicles.filter(v=>sheetFor(v));
   const link=el('a',undefined,'center-card');link.href=hashFor(center);link.dataset.center=center;
   link.append(el('span',center,'center-name'),el('strong',`${vehicles.length} engins`),el('small',sheets.length?`${sheets.length} fiche disponible`:'Fiches à compléter'));$('centerCards').append(link);
  }
  route();
 }catch{data=null;$('inventoryStatus').textContent='Impossible de charger les inventaires. Vérifiez votre connexion puis réessayez.';$('retryInventory').hidden=false;}
}
$('centerFilter').onchange=()=>{limit=12;history.replaceState(null,'',hashFor($('centerFilter').value));renderFleet();};
$('vehicleSearch').oninput=()=>{limit=12;renderFleet();};$('onlySheets').onchange=()=>{limit=12;renderFleet();};
$('resetFleet').onclick=()=>{$('centerFilter').value='';$('vehicleSearch').value='';$('onlySheets').checked=false;limit=12;history.replaceState(null,'',hashFor());renderFleet();};
$('moreVehicles').onclick=()=>{limit+=12;renderFleet();};$('equipmentSearch').oninput=renderEquipment;
$('printSheet').onclick=()=>{$('equipmentSearch').value='';renderEquipment();window.print();};$('closePhoto').onclick=()=>$('photoViewer').close();$('photoViewer').addEventListener('close',()=>{$('fullPhoto').removeAttribute('src');});
window.addEventListener('hashchange',route);$('retryInventory').onclick=load;await load();
