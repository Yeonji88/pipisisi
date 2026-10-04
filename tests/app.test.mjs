import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
function harness(){
  const html=fs.readFileSync('index.html','utf8'),elements=new Map(),storage=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},innerHTML:'',open:false,addEventListener(){},replaceChildren(){this.options=[]},appendChild(x){x.parentElement=this;(this.options??=[]).push(x)},prepend(x){x.parentElement=this;},querySelector(){return this;},setAttribute(){},removeAttribute(){},showModal(){this.open=true},close(){this.open=false},focus(){}});return elements.get(id);};
  const context=vm.createContext({document:{getElementById:get,createElement:()=>{const e={style:{},setAttribute(){}};elements.set("toast",e);return e;},body:{appendChild(x){x.parentElement=this;}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>0,clearTimeout(){},window:{},crypto:{randomUUID},console,confirm:()=>true});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  return {context,storage,get};
}
test('로컬 CRUD, 사진, 인분, 상세 이벤트 구문 회귀 확인',async()=>{
  const {context,get,storage}=harness();
  await vm.runInContext(`(async()=>{openEditor();nameEl.value='사진 레시피';editorPhoto='data:image/jpeg;base64,AA==';await saveRecipe();showDetail(recipes[0].id);await fav(recipes[0].id);showDetail(recipes[0].id);})()`,context);
  assert.ok(get('grid').innerHTML.includes('<img'));assert.ok(get('detailContent').innerHTML.includes('<img'));assert.ok(storage.get('cuteRecipes'));
  const handlers=[...get('detailContent').innerHTML.matchAll(/onclick="([^"]+)"/g)];for(const [,handler]of handlers)new vm.Script(handler);
  assert.equal(vm.runInContext(`scaleIngredients('콩나물 200 g',1.5)`,context),'콩나물 300 g');
});
test('계정 전환은 기존 게스트 데이터를 유지하고 계정별 저장소 분리',()=>{
  const {context,storage}=harness();
  storage.set('cuteRecipes',JSON.stringify([{id:'g',name:'기존',ingredients:'',memo:'',emoji:'🍳',category:'한식',servings:2}]));
  vm.runInContext(`window.nyamApp.switchAccount('accountA');window.nyamApp.addImported({id:'a',name:'A',ingredients:'',memo:'',emoji:'🍳',category:'한식',servings:2});window.nyamApp.switchAccount('accountB');`,context);
  assert.equal(vm.runInContext('recipes.length',context),0);assert.equal(JSON.parse(storage.get('cuteRecipes'))[0].name,'기존');assert.equal(JSON.parse(storage.get('nyamRecipes:accountA'))[0].name,'A');
  vm.runInContext(`window.nyamApp.switchAccount();`,context);assert.equal(vm.runInContext('recipes[0].name',context),'기존');
});
test('저장 실패 시 데이터와 편집창 유지',async()=>{
  const {context,get}=harness();
  await vm.runInContext(`(async()=>{openEditor();nameEl.value='실패';localStorage.setItem=()=>{throw Error('quota')};await saveRecipe();})()`,context);
  assert.equal(get('editor').open,true);assert.equal(vm.runInContext('recipes.length',context),3);
});
test('서버 저장 실패 시 로컬 레시피를 변경하지 않음',async()=>{
  const {context,get}=harness();
  await vm.runInContext(`window.recipeCloud={editable:()=>true,write:async()=>{throw Error('conflict')},report(){}};recipeCloud=window.recipeCloud;(async()=>{openEditor('a');nameEl.value='덮어쓰기';await saveRecipe();})()`,context);
  assert.equal(vm.runInContext('recipes[0].name',context),'마제소바');assert.equal(get('editor').open,true);
});
test('손상된 저장 데이터는 쓰기로 덮어쓰지 않음',()=>{
  const {context,storage}=harness();storage.set('nyamRecipes:broken','{broken');
  vm.runInContext(`window.nyamApp.switchAccount('broken');`,context);
  assert.throws(()=>vm.runInContext(`window.nyamApp.addImported({id:'x',name:'새 레시피'});`,context));
  assert.equal(storage.get('nyamRecipes:broken'),'{broken');
});

test('팝업 오류는 열린 팝업 안에 표시하고 닫으면 본문으로 이동',()=>{
  const {context,get}=harness();get('accountDialog').open=true;
  vm.runInContext('toast("로그인 오류")',context);
  assert.equal(get('toast').parentElement,get('accountDialog'));assert.equal(get('toast').textContent,'로그인 오류');
  get('accountDialog').open=false;vm.runInContext('toast("저장 완료")',context);
  assert.notEqual(get('toast').parentElement,get('accountDialog'));
});

test('최근 저장 순으로 표시하고 날짜 없는 기존 레시피 순서 유지',()=>{
 const {context,get}=harness();
 vm.runInContext(`recipes=[{id:'old',name:'오래된 요리',updatedAt:10},{id:'new',name:'최근 요리',updatedAt:20},{id:'legacy',name:'기존 요리'},{id:'legacy2',name:'기존 두번째'}].map(r=>({...r,ingredients:'',memo:'',emoji:'🍳',servings:2,category:'한식'}));render();`,context);
 const html=get('grid').innerHTML;assert.ok(html.indexOf('최근 요리')<html.indexOf('오래된 요리'));assert.ok(html.indexOf('오래된 요리')<html.indexOf('기존 요리'));assert.ok(html.indexOf('기존 요리')<html.indexOf('기존 두번째'));
});

test('레시피를 새로 열면 맨 위로 이동하고 인분 변경은 현재 위치 유지',()=>{
 const {context,get}=harness();
 vm.runInContext("showDetail('a')",context);get('detail').scrollTop=300;
 vm.runInContext("showDetail('a',3)",context);assert.equal(get('detail').scrollTop,300);
 vm.runInContext("showDetail('b')",context);assert.equal(get('detail').scrollTop,0);
 get('detail').scrollTop=300;get('detail').close();vm.runInContext("showDetail('b')",context);assert.equal(get('detail').scrollTop,0);
 get('editor').scrollTop=300;vm.runInContext("openEditor('a')",context);assert.equal(get('editor').scrollTop,0);
});

test('상세 화면에 친구 공유·해제 버튼을 표시',()=>{
 const {context,get}=harness();vm.runInContext("showDetail('a')",context);assert.ok(get('detailContent').innerHTML.includes('친구에게 공유'));
 vm.runInContext("window.recipeFriends={isShared:()=>true};showDetail('a')",context);assert.ok(get('detailContent').innerHTML.includes('공유 해제'));
});
