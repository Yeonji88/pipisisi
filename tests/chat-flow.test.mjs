import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as helpers from '../src/chat-data.mjs';

function harness(room){
  const elements=new Map(),pending=[],listened=[],errors=[];
  function element(){return {hidden:true,open:false,value:'',children:[],scrollHeight:0,scrollTop:0,clientHeight:0,
    handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},replaceChildren(){this.children=[];},appendChild(item){this.children.push(item);},
    showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const context={...helpers,threadId:async(a,b)=>b,document:{getElementById:get,createElement:element,hidden:false,addEventListener(){}},navigator:{onLine:true},
    setInterval:()=>1,clearInterval(){},localStorage:{setItem(){},getItem(){return null;}},
    collection:(db,...path)=>path.join('/'),doc:(db,...path)=>path.join('/'),query:ref=>ref,where(){},orderBy(){},limit(){},serverTimestamp(){return 1;},
    Timestamp:{fromMillis:value=>value},
    getDoc:async ref=>({exists:()=>true,data:()=>ref.startsWith('chatThreads/')?room:{ownerUid:ref.split('/').at(-1)}}),
    runTransaction:async(db,callback)=>callback({get:async()=>({exists:()=>false}),set(){}}),
    onSnapshot:ref=>{listened.push(ref);return ()=>{};},setDoc:async()=>{}};
  vm.createContext(context);
  const source=readFileSync(new URL('../src/chat.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createChat','function createChat');
  vm.runInContext(source+'\nglobalThis.makeChat=createChat;',context);
  const api=context.makeChat({app:{resetScroll(){},toast(){}},session:()=>({db:{},user:{uid:'me'}}),report:e=>errors.push(e),
    friends:{refreshBadges(){},getFriends:()=>[{code:'A',name:'A'},{code:'B',name:'B'}],createCode:()=>new Promise(resolve=>pending.push(resolve))}});
  return {api,pending,listened,errors,get};
}
test('친구를 빠르게 바꿔도 늦게 완료된 이전 선택은 대화를 덮어쓰지 않음',async()=>{
  const h=harness(),first=h.api.open('A'),second=h.api.open('B');
  h.pending[1]('mine');await second;h.pending[0]('mine');await first;
  assert.deepEqual(h.listened,['chatThreads/B/chatMessages']);assert.equal(h.get('chatConversation').hidden,false);assert.equal(h.errors.length,0);
});

test('푸시로 대화를 열 때 현재 계정의 참여 권한을 검사하고 기존 방을 재사용',async()=>{
  const id='a'.repeat(64),room={members:['me','other'],initiatorUid:'me',initiatorCode:'mine',targetCode:'A'};
  const h=harness(room);await h.api.openThread(id);
  assert.deepEqual(h.listened,[`chatThreads/${id}/chatMessages`]);assert.equal(h.get('chatDialog').open,true);assert.equal(h.errors.length,0);
  const denied=harness({...room,members:['stranger','other']});await denied.api.openThread(id);
  assert.equal(denied.listened.length,0);assert.equal(denied.errors.length,1);assert.equal(denied.get('chatConversation').hidden,true);
});
test('대화 생성 중 팝업을 닫으면 완료 후 다시 대화가 열리지 않음',async()=>{
  const h=harness(),opening=h.api.open('A');h.get('chatDialog').close();h.pending[0]('mine');await opening;
  assert.equal(h.get('chatConversation').hidden,true);assert.deepEqual(h.listened,[]);
});
