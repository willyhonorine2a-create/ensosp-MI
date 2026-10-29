import {normalizeInventory} from './public-inventory.js';

// Une liste par engin. Un matériel présent dans plusieurs compartiments n'est
// jamais affecté arbitrairement à l'un d'eux dans le signalement.
export function reportMaterials(sheet){
 const materials=new Map();
 for(const section of sheet?.sections||[]){
  for(const item of section.items){
   const key=normalizeInventory(item.designation);
   if(!materials.has(key))materials.set(key,{designation:item.designation,sections:new Map()});
   materials.get(key).sections.set(section.id,section.label);
  }
 }
 return [...materials.values()].map(({designation,sections})=>{
  const unique=sections.size===1?[...sections.entries()][0]:null;
  return {designation,sectionId:unique?.[0]??null,section:unique?.[1]??'Non précisé'};
 }).sort((a,b)=>a.designation.localeCompare(b.designation,'fr'));
}
