import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function harness(){
  const elements=new Map(),replacements=[];let authCallback,snapshotCallback;
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,open:false,addEventListener(){},setAttribute(){},close(){this.open=false;}});return elements.get(id);};
  const app={toast(){},closeDialogs(){},switchAccount(){},replace:next=>replacements.push(next)};
  const context={window:{nyamApp:app,NYAM_FIREBASE_CONFIG:{apiKey:'test',projectId:'test',appId:'test'},addEventListener(){}},
    document:{getElementById:get},localStorage:{getItem(){return null;}},navigator:{onLine:true},
    createFriends:()=>({reset(){},page(){}}),createChat:()=>({reset(){}}),setupFriendSelect(){},setupChatLayout(){},
    createBiometric:()=>({refresh(){},loggedOut:async()=>{},isEnabled:async()=>false}),createMessageAlerts:()=>({reset(){}}),
    initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),setPersistence:async()=>{},browserLocalPersistence:{},browserSessionPersistence:{},
    onAuthStateChanged:(auth,callback)=>{authCallback=callback;},collection(){},onSnapshot:(ref,options,callback)=>{snapshotCallback=callback;return ()=>{};}};
  vm.createContext(context);
  const source=readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInContext(source,context);await Promise.resolve();
  return {get,replacements,authenticate:user=>authCallback(user),snapshot:snap=>snapshotCallback(snap)};
}
test('자동 로그인 확인 전에는 로그인 폼을 숨기고 확인 후 메인으로 바로 이동',async()=>{
  const h=await harness();assert.equal(h.get('authLoading').hidden,false);assert.equal(h.get('loginPage').hidden,true);assert.equal(h.get('recipeApp').hidden,true);
  h.authenticate({uid:'me',email:'me@example.com'});
  assert.equal(h.get('authLoading').hidden,true);assert.equal(h.get('loginPage').hidden,true);assert.equal(h.get('recipeApp').hidden,false);
});
test('로그아웃 상태가 확정되면 로그인 화면만 표시',async()=>{
  const h=await harness();h.authenticate(null);
  assert.equal(h.get('authLoading').hidden,true);assert.equal(h.get('loginPage').hidden,false);assert.equal(h.get('recipeApp').hidden,true);
});
test('시작 시 빈 Firebase 메모리 캐시는 기기의 레시피를 덮어쓰지 않음',async()=>{
  const h=await harness();h.authenticate({uid:'me'});
  h.snapshot({metadata:{fromCache:true},docs:[]});assert.equal(h.replacements.length,0);
  h.snapshot({metadata:{fromCache:false},docs:[]});assert.equal(h.replacements.length,1);
});
