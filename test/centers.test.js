import {test} from 'node:test';
import assert from 'node:assert/strict';
import {centerColors,centerKey} from '../src/centers.js';
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
test('centres : noms normalisés sans attribuer une couleur aux regroupements ou noms inconnus',()=>{
 assert.equal(centerKey('CS - Alpha'),'ALPHA');assert.equal(centerKey('Centre de secours CHARLIE'),'CHARLIE');assert.equal(centerKey(' india '),'INDIA');
 for(const name of ['CS','MUTUALISE','OPE','GOLFE','__proto__'])assert.equal(centerKey(name),null);
});
test('les sept couleurs de centres conservent un contraste de texte accessible',()=>{
 assert.equal(Object.keys(centerColors).length,7);
 for(const [name,palette] of Object.entries(centerColors)){const a=luminance(palette.background),b=luminance(palette.foreground);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,name);}
});
