import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAsset} from '../src/patrimoine.js';
const item={id:'1',name:'Lance',reference:'L1',location:'Atelier',stock:3,minimum:1,assetCode:'BIEN1',genre:'INC',service:'AR'};
test('la fiche existante reste compatible avec les nouveaux champs optionnels',()=>assert.doesNotThrow(()=>validateAsset(item,[],null)));
test('la modification conserve sa propre référence',()=>assert.doesNotThrow(()=>validateAsset(item,[item],'1')));
test('les codes de bien dupliqués sont refusés',()=>assert.throws(()=>validateAsset({...item,reference:'L2'},[item],null),/code du bien/));
test('les longueurs de la trame et les dates sont contrôlées',()=>{
 assert.throws(()=>validateAsset({...item,genre:'INCENDIE'},[],null),/5 caractères/);
 assert.throws(()=>validateAsset({...item,purchasedAt:'2025-02-30'},[],null),/date invalide/);
 assert.doesNotThrow(()=>validateAsset({...item,purchasedAt:'2024-02-29'},[],null));
});
