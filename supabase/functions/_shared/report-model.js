export const kinds={missing:'Matériel manquant',broken:'Matériel cassé',faulty:'Dysfonctionnement',other:'Autre anomalie'};
export const statuses={new:'Nouveau',in_progress:'En cours',resolved:'Résolu'};
export const recipient='magasin-central@ensosp.fr';
const clean=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Champ absent ou trop long');return value.trim();};
export function validateSubmission(input){
 if(!input||typeof input!=='object'||input.website)throw Error('Envoi invalide');
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId))throw Error('Identifiant invalide');
 if(!Number.isSafeInteger(input.revision)||input.revision<1)throw Error('Rechargez la fiche de l’engin');
 if(input.consent!==true)throw Error('Veuillez accepter la transmission du signalement');
 if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20)throw Error('Ajoutez de 1 à 20 matériels');
 const items=input.items.map(item=>{
  if(!Object.hasOwn(kinds,item.kind)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>9999)throw Error('Type ou quantité invalide');
  const description=clean(item.description,1500,true);if(description.length<3)throw Error('Précisez le problème en quelques mots');
  return {sectionId:item.sectionId===null?null:clean(item.sectionId,100,true),section:clean(item.section,120,true),designation:clean(item.designation,200,true),kind:item.kind,quantity:item.quantity,description};
 });
 if(!Array.isArray(input.photos)||input.photos.length>3)throw Error('Trois photos maximum');
 return {requestId:input.requestId,vehicleId:clean(input.vehicleId,100,true),revision:input.revision,name:clean(input.name||'',80),contact:clean(input.contact||'',160),items,photos:input.photos.map(photo=>({type:clean(photo.type,30,true),data:clean(photo.data,2796204,true)}))};
}
export function decodePhoto(photo){
 if(!['image/jpeg','image/png','image/webp'].includes(photo.type)||!/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data))throw Error('Photo JPEG, PNG ou WebP requise');
 const bytes=Uint8Array.from(atob(photo.data),c=>c.charCodeAt(0));if(bytes.length>2097152||bytes.length<12)throw Error('Photo vide ou supérieure à 2 Mo');
 const match=photo.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:photo.type==='image/png'?[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b):String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!match)throw Error('Le contenu de la photo ne correspond pas à son format');
 return {bytes,extension:{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type]};
}
export function mailFor(report,appUrl){
 const url=new URL(appUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('URL publique HTTPS requise');
 return {to:[recipient],subject:`[Inventaire #${report.reference}] ${report.center} — ${report.vehicle_name}`,
 text:[`Signalement n°${report.reference}`,`Centre : ${report.center}`,`Engin : ${report.vehicle_name} — ${report.registration}`,`Date : ${report.created_at}`,'',...report.items.map(i=>`${i.section} · ${i.designation}\n${kinds[i.kind]} · quantité concernée : ${i.quantity}\n${i.description}\n`),`Déclarant : ${report.reporter_name||'Non renseigné'}`,`Contact : ${report.reporter_contact||'Non renseigné'}`,`Photos jointes : ${report.photos.length} (consultables dans l’espace administrateur)`,'',`Consulter et traiter : ${url.origin}/signalements/#report=${report.id}`].join('\n')};
}
