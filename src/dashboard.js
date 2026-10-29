import {locationCounts} from './locations.js';
import {groupReferences} from './references.js';
import {fields} from './patrimoine.js';
const normalized=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
export function todayInParis(date=new Date()) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function buildDashboard(items,categories=[],deviceFacts=[],filters={},today=todayInParis()) {
 const catalog=new Map(categories.map(c=>[c.code,c.label]));
 const query=normalized(filters.search);
 let matching=items.filter(item=>{
  if(filters.category && item.category!==filters.category)return false;
  if(filters.service && item.service!==filters.service)return false;
  if(filters.mode && (item.trackingMode || 'quantity')!==filters.mode)return false;
  return !query || normalized([item.name,item.reference,item.category,catalog.get(item.category),item.location,...fields.map(([key])=>item[key])].join(' ')).includes(query);
 });
 if(filters.location)matching=matching.map(item=>{
  const stock=locationCounts(item)[filters.location] || 0;
  const availableStock=item.trackingMode==='individual'?deviceFacts.filter(d=>d.asset_id===item.id && !d.retired_at && (d.physical_location || 'UNSET')===filters.location && d.status==='available').length:stock;
  return {...item,stock,availableStock,totalStock:item.stock};
 }).filter(item=>item.stock>0);
 const references=groupReferences(matching).filter(r=>!filters.onlyAlerts || r.availableStock<=r.minimum);
 const selected=references.flatMap(r=>r.members);
 const selectedIds=new Set(selected.filter(i=>i.trackingMode==='individual').map(i=>i.id));
 const devices=deviceFacts.filter(d=>selectedIds.has(d.asset_id) && !d.retired_at && (!filters.location || (d.physical_location || 'UNSET')===filters.location));
 const horizon=new Date(`${today}T00:00:00Z`);horizon.setUTCDate(horizon.getUTCDate()+90);
 const lastDay=horizon.toISOString().slice(0,10);
 const expired=devices.filter(d=>d.warranty_until && d.warranty_until<today).length;
 const expiring=devices.filter(d=>d.warranty_until && d.warranty_until>=today && d.warranty_until<=lastDay).length;
 const units=references.reduce((sum,r)=>sum+r.stock,0);
 const available=references.reduce((sum,r)=>sum+Math.min(r.stock,Math.max(0,r.availableStock)),0);
 const groups=new Map();
 for(const reference of references){
  const code=reference.category || '';
  if(!groups.has(code))groups.set(code,{code,label:catalog.get(code)||'À classer',units:0,references:0});
  const group=groups.get(code);group.units+=reference.stock;group.references++;
 }
 const locationTotals={MI:0,CS:0,UNSET:0};
 for(const item of selected){
  if(filters.location)locationTotals[filters.location]+=item.stock;
  else {const counts=locationCounts(item);for(const code of Object.keys(locationTotals))locationTotals[code]+=counts[code];}
 }
 return {
  locationTotals,references,selected,globalReferences:groupReferences(items).length,
  units,available,availabilityRate:units?Math.round(available/units*100):null,
  alerts:references.filter(r=>r.availableStock<=r.minimum).length,
  empty:references.filter(r=>r.availableStock===0).length,
  tracked:references.filter(r=>r.trackingMode==='individual').reduce((sum,r)=>sum+r.stock,0),
  maintenance:devices.filter(d=>d.status==='maintenance').length,
  unavailable:devices.filter(d=>d.status==='unavailable').length,
  expired,expiring,unknownWarranty:devices.filter(d=>!d.warranty_until).length,
  defaultQuantities:selected.filter(i=>i.quantityDefaulted).length,
  unclassified:references.filter(r=>!catalog.has(r.category)).length,
  distribution:[...groups.values()].sort((a,b)=>b.units-a.units||a.code.localeCompare(b.code,'fr'))
 };
}
