import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ids=['editor','detail','accountDialog','chatDialog','friendManager','friendDetail'];
function harness({native=true}={}){
  const dialogs=[],elements=new Map(),operations=[],notices=[];let now=1000,keyboard=false,picker=false,listener,observer;
  class Dialog{
    constructor(id){this.id=id;this.tagName='DIALOG';this.open=false;this.closed=0;this.handlers={};this.isConnected=true;}
    addEventListener(type,callback){(this.handlers[type]??=[]).push(callback);}
    showModal(){this.open=true;}
    show(){this.open=true;}
    close(){this.open=false;this.closed++;for(const callback of this.handlers.close||[])callback();}
    async cancel(){const event={prevented:false,preventDefault(){this.prevented=true;}};for(const callback of this.handlers.cancel||[])await callback(event);return event;}
  }
  function add(id){const dialog=new Dialog(id);dialogs.push(dialog);elements.set(id,dialog);return dialog;}
  ids.forEach(add);elements.set('friendRecipesPage',{hidden:true});elements.set('recipeApp',{hidden:false});
  const context={
    Capacitor:{getPlatform:()=>native?'android':'web'},registerPlugin:()=>({consumeKeyboardBack:async()=>{const consumed=keyboard;keyboard=false;return {consumed};}}),
    App:{addListener:async(type,callback)=>{assert.equal(type,'backButton');listener=callback;return {remove(){}};},minimizeApp:async()=>operations.push('minimize')},
    window:{HTMLDialogElement:Dialog,history:{back:()=>operations.push('history')},recipeFriends:{page:show=>{elements.get('friendRecipesPage').hidden=!show;operations.push('my-recipes');}}},
    document:{body:{},querySelectorAll:selector=>dialogs.filter(dialog=>dialog.isConnected&&(selector==='dialog'||dialog.open)),getElementById:id=>elements.get(id)},
    MutationObserver:class{constructor(callback){observer=callback;}observe(){}},Date:{now:()=>now}
  };
  vm.createContext(context);
  const source=readFileSync(new URL('../src/back-navigation.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function setupBackNavigation','function setupBackNavigation');
  vm.runInContext(source+'\nglobalThis.setup=setupBackNavigation;',context);
  const api=context.setup({app:{toast:message=>notices.push(message)},closePicker:()=>{if(!picker)return false;picker=false;operations.push('picker');return true;}});
  return {api,get:id=>elements.get(id),add,operations,notices,back:event=>listener(event),advance:()=>{now+=500;},keyboard:()=>{keyboard=true;},picker:()=>{picker=true;},observe:records=>observer(records)};
}
for(const id of ids)test(`Android back closes ${id} without leaving the app`,async()=>{
  const h=harness(),dialog=h.get(id);dialog.showModal();await h.back({canGoBack:true});
  assert.equal(dialog.open,false);assert.equal(dialog.closed,1);assert.deepEqual(h.operations,[]);assert.deepEqual(h.notices,[]);
});
test('nested dialogs follow actual open order, not DOM order; only the top closes',async()=>{
  const h=harness(),lower=h.get('friendDetail'),upper=h.get('editor');lower.showModal();upper.showModal();
  await h.back();assert.equal(upper.open,false);assert.equal(lower.open,true);assert.deepEqual(h.operations,[]);
  await h.back();assert.equal(lower.open,false);assert.equal(lower.closed,1);
});
test('a duplicate showModal call does not incorrectly promote a lower dialog',async()=>{
  const h=harness();h.get('detail').showModal();h.get('accountDialog').showModal();h.get('detail').showModal();await h.back();
  assert.equal(h.get('detail').open,true);assert.equal(h.get('accountDialog').open,false);
});
test('backButton then cancel for the same input does not close a lower dialog or exit',async()=>{
  const h=harness(),lower=h.get('detail'),upper=h.get('accountDialog');lower.showModal();upper.showModal();await h.back();
  assert.equal((await upper.cancel()).prevented,true);assert.equal(lower.open,true);assert.deepEqual(h.operations,[]);
});
test('cancel then backButton for the same input does not close a lower dialog or exit',async()=>{
  const h=harness(),lower=h.get('detail'),upper=h.get('accountDialog');lower.showModal();upper.showModal();
  assert.equal((await upper.cancel()).prevented,true);await h.back();assert.equal(upper.closed,1);assert.equal(lower.open,true);assert.deepEqual(h.operations,[]);
});
test('an open dialog takes priority over returning from friends to main; root alone minimizes',async()=>{
  const h=harness();h.get('friendRecipesPage').hidden=false;h.get('friendManager').showModal();
  await h.back();assert.equal(h.get('friendRecipesPage').hidden,false);assert.deepEqual(h.operations,[]);
  await h.back();assert.equal(h.get('friendRecipesPage').hidden,true);assert.deepEqual(h.operations,['my-recipes']);
  await h.back();assert.deepEqual(h.operations,['my-recipes','minimize']);
});
test('existing WebView history is respected after app subpages and popups are gone',async()=>{
  const h=harness();await h.back({canGoBack:true});assert.deepEqual(h.operations,['history']);
});
test('message keyboard is dismissed before closing the popup; no input is cleared by navigation',async()=>{
  const h=harness(),dialog=h.get('chatDialog');dialog.input='unsent draft';dialog.showModal();h.keyboard();
  await h.back();assert.equal(dialog.open,true);assert.equal(dialog.closed,0);assert.equal(dialog.input,'unsent draft');
  await h.back();assert.equal(dialog.open,false);assert.deepEqual(h.operations,[]);
});
test('native cancel also respects an open keyboard rather than closing the dialog underneath',async()=>{
  const h=harness(),dialog=h.get('chatDialog');dialog.showModal();h.keyboard();assert.equal((await dialog.cancel()).prevented,true);assert.equal(dialog.open,true);
  await dialog.cancel();assert.equal(dialog.open,false);
});
test('new dialogs are automatically tracked, and manually closed dialogs do not remain in the stack',async()=>{
  const h=harness(),old=h.get('accountDialog'),future=h.add('futureDialog');old.showModal();future.show();future.close();
  await h.back();assert.equal(old.open,false);assert.deepEqual(h.operations,[]);
  future.showModal();await h.back();assert.equal(future.closed,2);
});
test('attribute-open dialogs are tracked; browser Escape uses only close and never Android navigation',async()=>{
  const h=harness({native:false}),dialog=h.get('editor');dialog.open=true;h.observe([{type:'attributes',target:dialog}]);
  assert.equal((await dialog.cancel()).prevented,true);assert.equal(dialog.closed,1);assert.deepEqual(h.operations,[]);
});
test('friend picker is dismissed before its message dialog',async()=>{
  const h=harness(),dialog=h.get('chatDialog');dialog.showModal();h.picker();await h.back();assert.equal(dialog.open,true);assert.deepEqual(h.operations,['picker']);
  await h.back();assert.equal(dialog.open,false);
});
test('a newer modal takes priority over a picker left open in the dialog underneath',async()=>{
  const h=harness();h.get('chatDialog').showModal();h.picker();h.get('accountDialog').showModal();
  await h.back();assert.equal(h.get('accountDialog').open,false);assert.equal(h.get('chatDialog').open,true);assert.deepEqual(h.operations,[]);
  await h.back();assert.equal(h.get('chatDialog').open,true);assert.deepEqual(h.operations,['picker']);
});
test('closing the target manually during a native round-trip never closes its parent',async()=>{
  const h=harness();h.get('detail').showModal();h.get('accountDialog').showModal();const back=h.back();h.get('accountDialog').close();await back;
  assert.equal(h.get('detail').open,true);assert.deepEqual(h.operations,[]);
});
test('a newly opened dialog during a root back round-trip prevents an app exit',async()=>{
  const h=harness(),back=h.back();h.get('editor').showModal();await back;assert.equal(h.get('editor').open,true);assert.deepEqual(h.operations,[]);
});
