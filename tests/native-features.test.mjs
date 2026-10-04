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
