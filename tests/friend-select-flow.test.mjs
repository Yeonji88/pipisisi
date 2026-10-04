import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function harness(){
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{hidden:true,handlers:{},attributes:{},style:{},selectedOptions:[],options:[],parentElement:{contains:()=>false},
    classList:{remove(){},add(){}},setAttribute(name,value){this.attributes[name]=value;},addEventListener(type,callback){this.handlers[type]=callback;},replaceChildren(){}});return elements.get(id);};
  const context={document:{getElementById:get,addEventListener(){}},window:{addEventListener(){}},MutationObserver:class{observe(){}}};vm.createContext(context);
  const source=readFileSync('src/friend-select.js','utf8').replace('export function setupFriendSelect','function setupFriendSelect');
  vm.runInContext(source+'\nglobalThis.api=setupFriendSelect();',context);return {get,api:context.api};
}
test('friend picker Escape consumes its event so the containing chat dialog is not also cancelled',()=>{
  const h=harness(),menu=h.get('friendSelectMenu'),button=h.get('friendSelectButton');menu.hidden=false;
  let prevented=false,stopped=false;button.handlers.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.equal(menu.hidden,true);assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(button.attributes['aria-expanded'],'false');
});
test('closeIfOpen reports consumption only when there is actually an open picker',()=>{
  const h=harness();assert.equal(h.api.closeIfOpen(),false);h.get('friendSelectMenu').hidden=false;assert.equal(h.api.closeIfOpen(),true);assert.equal(h.api.closeIfOpen(),false);
});
