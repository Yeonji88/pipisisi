import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function load(file,context,name){vm.createContext(context);const source=readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(`export function ${name}`,`function ${name}`);vm.runInContext(source+`\nglobalThis.factory=${name};`,context);return context.factory;}
test('지문 잠금을 켤 때만 자동 로그인을 준비하고 시스템 인증 취소는 안내',async()=>{
  let enabled=false,auto=0,cancel=false;const notices=[],button={};
  const plugin={status:async()=>({available:true,enabled}),toggle:async()=>{if(cancel)throw Error('취소');enabled=!enabled;return {enabled};}};
  const context={Capacitor:{getPlatform:()=> 'android'},registerPlugin:()=>plugin,document:{getElementById:()=>button},window:{addEventListener(){}}};
  const create=load('../src/biometric.js',context,'createBiometric');
  const api=create({app:{toast:message=>notices.push(message)},ensureAutoLogin:async()=>{auto++;},logout(){}});
  await api.toggle();assert.equal(enabled,true);assert.equal(auto,1);
  await api.toggle();assert.equal(enabled,false);assert.equal(auto,1);
  cancel=true;await api.toggle();assert.equal(enabled,false);assert.equal(notices.at(-1),'취소');
});
test('무료 기기 알림은 사용자가 켜고 권한을 허용한 경우에만 표시',async()=>{
  let permission='denied',sent=0;const storage=new Map(),button={};
  const local={createChannel:async()=>{},addListener:async()=>{},checkPermissions:async()=>({display:permission}),requestPermissions:async()=>({display:permission}),schedule:async()=>{sent++;}};
  const context={Capacitor:{getPlatform:()=> 'android'},LocalNotifications:local,document:{getElementById:()=>button},window:{},crypto:{getRandomValues:array=>{array[0]=12;return array;}},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}};
  const create=load('../src/message-alerts.js',context,'createMessageAlerts');
  const api=create({app:{toast(){}},session:()=>({user:{uid:'me'}})});
  const message={name:'친구',count:1,peerCode:'code'};
  await api.incoming(message);assert.equal(sent,0);
  await api.toggle();await api.incoming(message);assert.equal(sent,0);
  permission='granted';await api.toggle();await api.incoming(message);assert.equal(sent,1);
  await api.toggle();await api.incoming(message);assert.equal(sent,1);
});
