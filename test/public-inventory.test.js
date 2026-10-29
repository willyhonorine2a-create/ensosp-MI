import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterVehicles,filterSections,inventoryTotals} from '../src/public-inventory.js';
const data=JSON.parse(await readFile(new URL('../public/inventaire/data.json',import.meta.url),'utf8'));
test('parc public : le FPT 18 est relié au CS ALPHA sans inventer les fiches des autres engins',()=>{
 assert.equal(data.vehicles.length,46);assert.equal(new Set(data.vehicles.map(v=>v.center)).size,9);
 assert.equal(new Set(data.vehicles.map(v=>v.id)).size,46);assert.equal(data.sheets.length,1);
 const alpha=filterVehicles(data.vehicles,{center:'ALPHA'});assert.equal(alpha.length,5);
 const available=filterVehicles(alpha,{onlySheets:true});assert.equal(available.length,1);assert.equal(available[0].name,'FPT 18');assert.equal(available[0].registration,'ES-676-MV');
 assert.equal(data.sheets[0].id,available[0].sheetId);assert.equal(data.sheets[0].registration,available[0].registration);
 assert.equal(filterVehicles(data.vehicles,{center:'BRAVO',onlySheets:true}).length,0);
 assert.equal(data.vehicles.some(v=>v.id==='fpt-06'),false);
});
test('filtres du parc : centre, immatriculation et disponibilité se combinent',()=>{
 assert.equal(filterVehicles(data.vehicles,{center:'ALPHA',search:'es-676',onlySheets:true})[0].id,'fpt-18');
 assert.equal(filterVehicles(data.vehicles,{center:'BRAVO',search:'FPT 18'}).length,0);
 assert.equal(filterVehicles(data.vehicles,{search:'introuvable'}).length,0);
});
test('fiche FPT 18 : quantités et métadonnées fidèles, y compris la notation 1+1',()=>{
 const sheet=data.sheets[0];assert.deepEqual(inventoryTotals(sheet),{sections:16,lines:50,units:92});
 assert.equal(sheet.updatedAt,'29/04/2026');assert.equal(sheet.version,'01');assert.equal(sheet.source,'FPT 18.xlsx');
 const ghv=sheet.sections.flatMap(s=>s.items).find(i=>i.sourceCell==='A12');assert.equal(ghv.quantity,2);assert.equal(ghv.quantityText,'1+1');
 assert.equal(sheet.photos.length,2);for(const photo of sheet.photos)assert.ok(photo.src.startsWith('/inventaire/photos/fpt-18-'));
 const cells=sheet.sections.flatMap(s=>s.items.map(i=>i.sourceCell));assert.equal(new Set(cells).size,50);
});
test('recherche dans les compartiments : accents ignorés et libellés de coffre conservés',()=>{
 const sheet=data.sheets[0],before=JSON.stringify(sheet);
 const hose=filterSections(sheet.sections,'tuyau');assert.ok(hose.length>0);assert.ok(hose.every(s=>s.items.every(i=>i.designation.toLowerCase().includes('tuyau'))));
 const ladder=filterSections(sheet.sections,'echelle');assert.equal(ladder.length,1);assert.equal(ladder[0].label,'TOIT');
 const lower=filterSections(sheet.sections,'coffre 1 · coffre du bas');assert.equal(lower.length,1);assert.equal(lower[0].items.length,2);
 assert.equal(filterSections(sheet.sections,'introuvable').length,0);assert.equal(JSON.stringify(sheet),before);
});
