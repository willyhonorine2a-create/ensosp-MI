const normalized=value=>(value || '').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
export function groupReferences(items) {
 const groups=new Map();
 for(const item of items) {
  const key=item.trackingMode==='individual' ? item.id : JSON.stringify([item.category || '',normalized(item.name),normalized(item.reference)]);
  if(!groups.has(key)) groups.set(key,{...item,members:[],stock:0,availableStock:0,quantityMi:0,quantityCs:0,totalStock:0});
  const group=groups.get(key);group.members.push(item);group.minimum=Math.max(group.minimum || 0,item.minimum || 0);if(!group.photoUrl && item.photoUrl){group.photoUrl=item.photoUrl;group.photoPath=item.photoPath;}group.quantityMi+=item.quantityMi || 0;group.quantityCs+=item.quantityCs || 0;group.totalStock+=item.totalStock ?? item.stock;group.stock+=item.stock;group.availableStock+=item.trackingMode==='individual'?item.availableStock:item.stock;
 }
 return [...groups.values()];
}
export const deviceCode=device=>`APP-${String(device.device_number).padStart(6,'0')}`;
export const dateLabel=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):'—';
export const deviceStatus={available:'Disponible',maintenance:'En maintenance',unavailable:'Indisponible'};
