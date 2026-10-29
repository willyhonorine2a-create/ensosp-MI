// Couleurs des CS fournies par le gestionnaire (jaune, cyan, vert, rouge,
// gris, orange et noir). MUTUALISE/OPE et les centres inconnus restent neutres.
export const centerColors=Object.freeze({
 ALPHA:{background:'#ffff00',foreground:'#111111'},
 BRAVO:{background:'#00b0f0',foreground:'#111111'},
 CHARLIE:{background:'#00b050',foreground:'#111111'},
 ECHO:{background:'#ff0000',foreground:'#111111'},
 GOLF:{background:'#d0cece',foreground:'#111111'},
 HOTEL:{background:'#c55a11',foreground:'#000000'},
 INDIA:{background:'#000000',foreground:'#ffffff'}
});
export function centerKey(value){
 const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/^(?:CENTRES? DE SECOURS|CS)[\s·:_-]+(?:DE\s+)?/,'').trim();
 return Object.hasOwn(centerColors,key)?key:null;
}
export function paintCenter(node,value){
 const key=centerKey(value);
 if(key){node.dataset.csCenter=key;node.style.setProperty('--cs-bg',centerColors[key].background);node.style.setProperty('--cs-fg',centerColors[key].foreground);}
 else{delete node.dataset.csCenter;node.style.removeProperty('--cs-bg');node.style.removeProperty('--cs-fg');}
 return node;
}
export function centerBadge(value,className=''){
 const badge=document.createElement('span');badge.className=`cs-badge ${className}`.trim();badge.textContent=value||'Affectation à confirmer';return paintCenter(badge,value);
}
export function centerLine(node,value,{before='',after=''}={}){
 node.replaceChildren(document.createTextNode(before),centerBadge(value),document.createTextNode(after));return node;
}
const bindings=new WeakMap();
export function colorCenterControl(control,resolve=value=>value){
 let binding=bindings.get(control);
 if(!binding){
  binding={resolve};bindings.set(control,binding);control.classList.add('cs-control');
  binding.refresh=()=>{paintCenter(control,binding.resolve(control.value));for(const option of control.options||[])paintCenter(option,binding.resolve(option.value));};
  control.addEventListener('change',binding.refresh);control.addEventListener('input',binding.refresh);
  binding.observer=new MutationObserver(binding.refresh);binding.observer.observe(control,{childList:true});
 }
 binding.resolve=resolve;binding.refresh();return control;
}
