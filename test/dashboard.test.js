import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildDashboard,todayInParis} from '../src/dashboard.js';
const categories=[{code:'TUY',label:'TUYAUX'},{code:'MAC',label:'MACHINES À FUMÉE'},{code:'CAM',label:'CAMÉRAS THERMIQUES'}];
const items=[
 {id:'t1',name:'Tuyau Ø45',reference:'T45',category:'TUY',service:'A',trackingMode:'quantity',stock:10,minimum:2,quantityDefaulted:true},
 {id:'t2',name:'Tuyau Ø45',reference:'T45',category:'TUY',service:'B',trackingMode:'quantity',stock:5,minimum:2},
 {id:'m',name:'Générateur ANTARI',reference:'ANT',category:'MAC',service:'A',trackingMode:'individual',stock:3,availableStock:2,minimum:1},
 {id:'c',name:'Caméra FLIR',reference:'FLIR',category:'CAM',service:'B',trackingMode:'individual',stock:1,availableStock:0,minimum:0}
];
const facts=[
 {id:'1',asset_id:'m',status:'maintenance',warranty_until:'2026-10-27'},
 {id:'2',asset_id:'m',status:'available',warranty_until:'2026-11-30'},
 {id:'3',asset_id:'m',status:'available',warranty_until:null},
 {id:'4',asset_id:'c',status:'unavailable',warranty_until:'2026-10-28'},
 {id:'5',asset_id:'c',status:'unavailable',warranty_until:'2020-01-01',retired_at:'2026-01-01'},
 {id:'6',asset_id:'archived-parent',status:'unavailable',warranty_until:'2020-01-01'}
];
const dashboard=filters=>buildDashboard(items,categories,facts,filters,'2026-10-28');
test('KPI globaux : quantités et appareils sont distingués, les références sont regroupées',()=>{
 const data=dashboard({});
 assert.equal(data.references.length,3);assert.equal(data.globalReferences,3);assert.equal(data.units,19);assert.equal(data.available,17);assert.equal(data.availabilityRate,89);
 assert.equal(data.tracked,4);assert.equal(data.maintenance,1);assert.equal(data.unavailable,1);assert.equal(data.expired,1);assert.equal(data.expiring,2);assert.equal(data.unknownWarranty,1);
 assert.equal(data.alerts,1);assert.equal(data.defaultQuantities,1);
 assert.deepEqual(data.distribution.map(c=>[c.code,c.units]),[['TUY',15],['MAC',3],['CAM',1]]);
});
test('catégorie, recherche sans accents, mode, service et alertes changent ensemble les lignes et les KPI',()=>{
 const mac=dashboard({category:'MAC'});assert.equal(mac.units,3);assert.equal(mac.available,2);assert.equal(mac.availabilityRate,67);assert.equal(mac.expired,1);assert.equal(mac.expiring,1);
 const service=dashboard({service:'A'});assert.equal(service.units,13);assert.equal(service.references.length,2);assert.equal(service.references.find(r=>r.category==='TUY').stock,10);
 const search=dashboard({search:'camera'});assert.equal(search.references.length,1);assert.equal(search.units,1);assert.equal(search.expiring,1);assert.equal(search.expired,0);
 const quantity=dashboard({mode:'quantity'});assert.equal(quantity.units,15);assert.equal(quantity.tracked,0);assert.equal(quantity.expiring,0);assert.equal(quantity.availabilityRate,100);
 const alerts=dashboard({onlyAlerts:true});assert.equal(alerts.references.length,1);assert.equal(alerts.units,1);assert.equal(alerts.available,0);assert.equal(alerts.expiring,1);
 const combined=dashboard({category:'MAC',mode:'individual',service:'A',search:'antari'});assert.equal(combined.units,3);assert.equal(combined.tracked,3);
});
test('une sélection vide n’invente ni disponibilité ni garanties',()=>{
 const data=dashboard({search:'introuvable'});assert.equal(data.units,0);assert.equal(data.availabilityRate,null);assert.equal(data.expiring,0);assert.equal(data.expired,0);assert.equal(data.unknownWarranty,0);assert.deepEqual(data.distribution,[]);
});
test('les limites des garanties sont inclusives à aujourd’hui et 90 jours ; une date vide reste inconnue',()=>{
 const deviceItems=[{...items[2],stock:5,availableStock:5}];
 const devices=['2026-10-27','2026-10-28','2027-01-26','2027-01-27',null].map((warranty_until,i)=>({id:String(i),asset_id:'m',status:'available',warranty_until}));
 const data=buildDashboard(deviceItems,categories,devices,{},'2026-10-28');assert.equal(data.expired,1);assert.equal(data.expiring,2);assert.equal(data.unknownWarranty,1);
});
test('les calculs de date utilisent le jour de Paris, indépendamment du fuseau de la machine',()=>{
 assert.equal(todayInParis(new Date('2026-10-28T23:30:00Z')),'2026-10-29');
 assert.equal(todayInParis(new Date('2026-07-01T22:30:00Z')),'2026-07-02');
});
