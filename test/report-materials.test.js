import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportMaterials} from '../src/report-materials.js';
import {validateSubmission} from '../supabase/functions/_shared/report-model.js';
test('liste par engin : doublons regroupés sans inventer de compartiment pour un matériel partagé',()=>{
 const materials=reportMaterials({sections:[{id:'cabine',label:'CABINE',items:[{designation:'Lampe'},{designation:'ARI'}]},{id:'coffre',label:'COFFRE 1',items:[{designation:'ARI'},{designation:'Tuyau'}]}]});
 assert.equal(materials.length,3);assert.deepEqual(materials.find(m=>m.designation==='ARI'),{designation:'ARI',sectionId:null,section:'Non précisé'});
 assert.deepEqual(materials.find(m=>m.designation==='Lampe'),{designation:'Lampe',sectionId:'cabine',section:'CABINE'});
 assert.deepEqual(reportMaterials(null),[]);
});
test('formulaire simplifié : une seule ligne et aucune photo restent compatibles avec la fonction existante',()=>{
 const payload=validateSubmission({requestId:'00000000-0000-4000-8000-000000000001',vehicleId:'fpt-18',revision:1,consent:true,photos:[],items:[{sectionId:null,section:'Non précisé',designation:'Autre matériel',kind:'broken',quantity:1,description:'Matériel cassé pendant utilisation.'}]});
 assert.equal(payload.items.length,1);assert.deepEqual(payload.photos,[]);assert.equal(payload.items[0].sectionId,null);
});
