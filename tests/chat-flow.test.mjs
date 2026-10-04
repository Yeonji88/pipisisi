import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as helpers from '../src/chat-data.mjs';

function harness(){
  const elements=new Map(),pending=[],listened=[],errors=[];
  function element(){return {hidden:true,open:false,value:'',children:[],scrollHeight:0,scrollTop:0,clientHeight:0,
    handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},replaceChildren(){this.children=[];},appendChild(item){this.children.push(item);},
    showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const context={...helpers,threadId:async(a,b)=>b,document:{getElementById:get,createElement:element,hidden:false,addEventListener(){}},navigator:{onLine:true},
    setInterval:()=>1,clearInterval(){},localStorage:{setItem(){},getItem(){return null;}},
    collection:(db,...path)=>path.join('/'),doc:(db,...path)=>path.join('/'),query:ref=>ref,where(){},orderBy(){},limit(){},serverTimestamp(){return 1;},
    Timestamp:{fromMillis:value=>value},
    getDoc:async ref=>({exists:()=>true,data:()=>({ownerUid:ref.split('/').at(-1)})}),
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
test('대화 생성 중 팝업을 닫으면 완료 후 다시 대화가 열리지 않음',async()=>{
  const h=harness(),opening=h.api.open('A');h.get('chatDialog').close();h.pending[0]('mine');await opening;
  assert.equal(h.get('chatConversation').hidden,true);assert.deepEqual(h.listened,[]);
});
