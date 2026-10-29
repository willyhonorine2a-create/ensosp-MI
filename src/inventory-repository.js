import {centerBadge,centerLine,colorCenterControl} from './centers.js';
import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabasePublishableKey} from './config.js';
export const client=createClient(supabaseUrl,supabasePublishableKey,{auth:{persistSession:true,storage:sessionStorage,detectSessionInUrl:true}});
export async function loadInventory(){
 const {data,error}=await client.from('inventory_vehicles').select('*').order('name');if(error)throw error;
 return {vehicles:data.map(v=>({...v,sheetId:v.sheet?v.id:null})),sheets:data.filter(v=>v.sheet).map(v=>({...v.sheet,id:v.id}))};
}
export function parseEquipment(text){
 return text.split('\n').filter(line=>line.trim()).map(line=>{
 const match=line.match(/^\s*(\d+)\s*;\s*(.+)$/);if(!match||!Number.isSafeInteger(Number(match[1])))throw Error('Chaque ligne doit contenir une quantité entière, un point-virgule et un matériel.');
 return {quantity:Number(match[1]),designation:match[2].trim()};
 });
}
export function installInventoryAdmin({getData,reload,onAdmin}){
 const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const panel=make('section');panel.className='panel inventory-admin';
 const status=make('p');status.setAttribute('role','status');
 const login=make('form'),email=make('input'),password=make('input'),submit=make('button','Connexion administrateur'),logout=make('button','Déconnexion'),create=make('button','Créer un engin');
 email.type='email';email.placeholder='Adresse e-mail';email.setAttribute('aria-label','Adresse e-mail');email.required=true;email.autocomplete='username';
 password.type='password';password.placeholder='Mot de passe';password.setAttribute('aria-label','Mot de passe');password.required=true;password.autocomplete='current-password';
 const access=make('details'),accessLabel=make('summary','Accès administrateur'),adminActions=make('div');
 access.className='admin-access';adminActions.className='admin-toolbar';logout.className='secondary';create.className='primary';
 for(const [input,text] of [[email,'Adresse e-mail'],[password,'Mot de passe']]){const label=make('label',text);label.append(input);login.append(label);}
 login.append(submit);access.append(accessLabel,login);const reports=make('a','Suivre les signalements');reports.href='/signalements/';reports.className='public-inventory-link';reports.dataset.reportAdminLink='';adminActions.append(create,reports,logout);panel.append(status,access,adminActions);document.querySelector('main').prepend(panel);
 const dialog=make('dialog'),form=make('form'),title=make('h2'),fields={},sections=make('div'),events=make('div'),message=make('p'),save=make('button','Enregistrer'),cancel=make('button','Annuler');
 for(const [key,label] of [['name','Nom de l’engin'],['registration','Immatriculation'],['center','Centre / affectation'],['reason','Motif de la modification']]){const l=make('label',label),input=make(key==='center'?'select':'input');input.required=true;input.maxLength=key==='reason'?500:key==='registration'?40:key==='center'?80:100;if(key==='reason')input.minLength=3;l.append(input);form.append(l);fields[key]=input;}
 dialog.className='inventory-editor';dialog.setAttribute('aria-labelledby','inventoryEditorTitle');title.id='inventoryEditorTitle';
 const identity=make('div'),sectionHeading=make('div'),actions=make('div');identity.className='editor-identity';sections.className='editor-sections';events.className='editor-history';
 message.className='error';message.setAttribute('role','alert');actions.className='actions editor-actions';
 for(const label of [...form.children])identity.append(label);
 const sectionFields=[];let current=null;
 const addSection=(section={label:'',items:[]})=>{const box=make('fieldset'),label=make('input'),items=make('textarea'),remove=make('button','Retirer ce compartiment');label.placeholder='Nom du compartiment';label.setAttribute('aria-label','Nom du compartiment');label.required=true;label.value=section.label;items.setAttribute('aria-label','Matériel : quantité ; désignation');items.placeholder='2 ; Tuyau';items.rows=6;items.value=section.items.map(i=>`${i.quantity} ; ${i.designation}`).join('\n');remove.type='button';remove.className='danger-outline';const legend=make('legend','Compartiment');box.append(legend);const entry={section,label,items,box};remove.onclick=()=>{sectionFields.splice(sectionFields.indexOf(entry),1);box.remove();};box.append(label,make('p','Une ligne par matériel : quantité ; désignation'),items,remove);sectionFields.push(entry);sections.append(box);};
 const add=make('button','Ajouter un compartiment');add.type='button';add.onclick=()=>addSection();cancel.type='button';cancel.onclick=()=>dialog.close();
 add.className='secondary';cancel.className='secondary';save.textContent='Enregistrer les modifications';
 sectionHeading.className='editor-section-heading';sectionHeading.append(make('h3','Dotation par compartiment'),add);
 actions.append(cancel,save);form.append(title,make('p','Renseignez l’engin, son affectation et sa dotation. Chaque modification est conservée dans l’historique.'),identity,sectionHeading,sections,message,events,actions);dialog.append(form);document.body.append(dialog);
 async function refresh(){const {data:{session}}=await client.auth.getSession();let admin=false;if(session){const {data,error}=await client.rpc('stock_is_admin');admin=!error&&data===true;}access.hidden=!!session;logout.hidden=!session;create.hidden=!admin;panel.querySelector('[data-report-admin-link]').hidden=!admin;status.textContent=session?(admin?'Administration des inventaires':'Consultation seule : compte non administrateur'):'Consultation publique — connexion facultative';onAdmin(admin);}
 login.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const {error}=await client.auth.signInWithPassword({email:email.value,password:password.value});password.value='';if(error)throw error;await refresh();}catch{status.textContent='Connexion impossible. Vérifiez vos identifiants.';}finally{submit.disabled=false;}};
 logout.onclick=async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error){status.textContent='Déconnexion impossible';return;}await refresh();};
 async function editVehicle(vehicle=null){current=vehicle;title.textContent=vehicle?'Modifier l’engin':'Créer un engin';message.textContent='';events.replaceChildren();sections.replaceChildren();sectionFields.length=0;const centers=[...new Set([...getData().vehicles.map(v=>v.center),vehicle?.center].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));fields.center.replaceChildren(new Option('Choisir un centre',''),...centers.map(center=>new Option(center,center)));for(const key in fields)fields[key].value=vehicle?.[key]||'';colorCenterControl(fields.center);for(const section of vehicle?.sheet?.sections||[])addSection(section);dialog.showModal();
 if(vehicle){const {data,error}=await client.from('inventory_events').select('created_at,reason,before_data,after_data').eq('vehicle_id',vehicle.id).order('id',{ascending:false}).limit(50);if(current!==vehicle||!dialog.open)return;events.append(make('h3','Historique (50 dernières modifications)'));if(error)events.append(make('p','Historique indisponible'));else for(const event of data){const row=make('p',`${new Date(event.created_at).toLocaleString('fr-FR')} · ${event.reason} · `);row.append(centerBadge(event.before_data?.center||'Création'),document.createTextNode(' → '),centerBadge(event.after_data.center));events.append(row);}}}
 create.onclick=()=>editVehicle();
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{
 const previous=current?.sheet;const edited=sectionFields.map(({section,label,items},i)=>({...section,id:section.id||`section-${i+1}`,label:label.value.trim(),items:items.value===section.items?.map(i=>`${i.quantity} ; ${i.designation}`).join('\n')?section.items:parseEquipment(items.value)}));
 const sheet=edited.length?{...previous,sections:edited,photos:previous?.photos||[],source:previous?.source||'Saisie administrateur',version:String(Number(previous?.version||0)+1),updatedAt:new Date().toLocaleDateString('fr-FR')}:null;
 const {error}=await client.rpc('save_inventory_vehicle',{p_id:current?.id||null,p_expected_revision:current?.revision||null,p_name:fields.name.value,p_registration:fields.registration.value,p_center:fields.center.value,p_sheet:sheet,p_reason:fields.reason.value});if(error)throw error;
 dialog.close();await reload();status.textContent='Engin enregistré.';
 }catch(error){message.textContent=error.message||'Enregistrement impossible';}finally{save.disabled=false;}};
 // Évite une requête Supabase imbriquée dans le verrou de notification Auth.
 client.auth.onAuthStateChange(()=>setTimeout(()=>refresh(),0));refresh();return {editVehicle};
}
