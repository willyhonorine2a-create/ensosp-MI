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
 const matching=items.filter(item=>{
  if(filters.category && item.category!==filters.category)return false;
  if(filters.service && item.service!==filters.service)return false;
  if(filters.mode && (item.trackingMode || 'quantity')!==filters.mode)return false;
  return !query || normalized([item.name,item.reference,item.category,catalog.get(item.category),item.location,...fields.map(([key])=>item[key])].join(' ')).includes(query);
 });
 const references=groupReferences(matching).filter(r=>!filters.onlyAlerts || r.availableStock<=r.minimum);
 const selected=references.flatMap(r=>r.members);
 const selectedIds=new Set(selected.filter(i=>i.trackingMode==='individual').map(i=>i.id));
 const devices=deviceFacts.filter(d=>selectedIds.has(d.asset_id) && !d.retired_at);
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
 return {
  references,selected,globalReferences:groupReferences(items).length,
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
