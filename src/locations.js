export const physicalLocations={MI:'MI · Magasin incendie',CS:'CS · Centres de secours',UNSET:'À localiser'};
export function locationCounts(item){
 const MI=Number(item.quantityMi || 0),CS=Number(item.quantityCs || 0);
 return {MI,CS,UNSET:Math.max(0,item.stock-MI-CS)};
}
export function locationSummary(item){
 const counts=locationCounts(item);
 return `MI : ${counts.MI} · CS : ${counts.CS}${counts.UNSET?` · À localiser : ${counts.UNSET}`:''}`;
}
