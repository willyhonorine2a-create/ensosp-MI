import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveStock} from '../src/stock.js';
const items=[{id:'hose',stock:3}];
test('une entrée augmente le stock sans modifier les données initiales',()=>{assert.equal(moveStock(items,'hose','entry',2)[0].stock,5);assert.equal(items[0].stock,3);});
test('une sortie peut épuiser le stock',()=>assert.equal(moveStock(items,'hose','exit',3)[0].stock,0));
test('une sortie supérieure au stock est refusée',()=>assert.throws(()=>moveStock(items,'hose','exit',4),/insuffisant/));
test('les quantités invalides sont refusées',()=>{for(const n of [0,-1,1.5,NaN,Infinity])assert.throws(()=>moveStock(items,'hose','entry',n));});
test('les références et types inconnus sont refusés',()=>{assert.throws(()=>moveStock(items,'missing','entry',1));assert.throws(()=>moveStock(items,'hose','unknown',1));});
