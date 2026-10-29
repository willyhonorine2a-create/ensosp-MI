export const normalizeInventory=value=>String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
export function filterVehicles(vehicles,{center='',search='',onlySheets=false}={}){
 const query=normalizeInventory(search);
 return vehicles.filter(vehicle=>(!center || vehicle.center===center) && (!onlySheets || vehicle.sheetId) && (!query || normalizeInventory([vehicle.name,vehicle.registration,vehicle.center].join(' ')).includes(query)));
}
export function filterSections(sections,search=''){
 const query=normalizeInventory(search);
 return sections.map(section=>({...section,items:section.items.filter(item=>!query || normalizeInventory(section.label+' '+item.designation).includes(query))})).filter(section=>section.items.length);
}
export function inventoryTotals(sheet){
 return {sections:sheet.sections.length,lines:sheet.sections.reduce((sum,s)=>sum+s.items.length,0),units:sheet.sections.reduce((sum,s)=>sum+s.items.reduce((n,i)=>n+i.quantity,0),0)};
}
