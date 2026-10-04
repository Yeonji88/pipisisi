import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({configured=true,platform='android',saved=false}={}){
  let user={uid:'me'},permission='granted',locked=false,revokeError=false;
  const storage=new Map(saved?[['nyamMessageAlerts:me','true']]:[]),listeners={},events={},writes=[],deleted=[],opened=[],notices=[],operations=[],button={};
  const push={
    addListener:async(name,callback)=>{listeners[name]=callback;},createChannel:async()=>{},
    checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>({receive:permission}),
    register:async()=>{operations.push('register');listeners.registration?.({value:'current-token'});},
    removeAllDeliveredNotifications:async()=>{operations.push('clear');}
  };
  const context={__NYAM_FCM_CONFIGURED__:configured,Capacitor:{getPlatform:()=>platform},PushNotifications:push,
    registerPlugin:()=>({revoke:async()=>{operations.push('revoke');if(revokeError)throw Error('offline');}}),
    document:{getElementById:()=>button},window:{addEventListener:(name,callback)=>{events[name]=callback;},recipeChat:{openThread:async id=>opened.push(id)},recipeBiometric:{canOpenMessages:async()=>!locked}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},crypto:{randomUUID:()=> 'a'.repeat(32)},
    doc:(db,...path)=>path.join('/'),setDoc:async(ref,data)=>{writes.push({ref,data});},deleteDoc:async ref=>{deleted.push(ref);},serverTimestamp:()=>123,
    setTimeout,clearTimeout};
  vm.createContext(context);
  const source=readFileSync(new URL('../src/message-alerts.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function createMessageAlerts','function createMessageAlerts');
  vm.runInContext(source+'\nglobalThis.factory=createMessageAlerts;',context);
  const api=context.factory({app:{toast:message=>notices.push(message)},session:()=>({db:{},user})});
  return {api,storage,listeners,events,writes,deleted,opened,notices,operations,button,setUser:value=>{user=value;},permission:value=>{permission=value;},lock:value=>{locked=value;},revokeFails:value=>{revokeError=value;}};
}
test('FCM permission denied never registers a token and creates no local notification',async()=>{
  const h=harness();h.api.reset();h.permission('denied');await h.api.toggle();await h.api.incoming({count:1});await tick();
  assert.equal(h.writes.length,0);assert.equal(h.operations.includes('register'),false);assert.equal(h.storage.get('nyamMessageAlerts:me'),undefined);
});
test('FCM token rotation replaces the same device document; logout removes only that document',async()=>{
  const h=harness();h.api.reset();await h.api.toggle();await tick();
  h.listeners.registration({value:'rotated/token:value'});await tick();
  assert.equal(h.writes.length,2);assert.equal(h.writes[0].ref,h.writes[1].ref);
  assert.equal(h.writes[1].ref,'users/me/pushTokens/'+ 'a'.repeat(32));assert.equal(h.writes[1].data.token,'rotated/token:value');
  await h.api.beforeLogout();h.listeners.registration({value:'late-token'});await tick();
  assert.deepEqual(h.deleted,[h.writes[0].ref]);assert.equal(h.writes.length,2);assert.equal(h.operations.includes('revoke'),true);
});
test('OFF unregisters the device; restored ON registers without requesting a new permission',async()=>{
  const h=harness({saved:true});h.api.reset();await tick();assert.equal(h.operations.includes('register'),true);
  await h.api.toggle();assert.equal(h.storage.get('nyamMessageAlerts:me'),'false');assert.equal(h.deleted.length,1);
});
test('cold-start notification waits for login and biometric unlock, then opens its thread once',async()=>{
  const h=harness();h.setUser(null);await tick();h.lock(true);
  const threadId='b'.repeat(64);h.listeners.pushNotificationActionPerformed({notification:{data:{type:'chat',threadId}}});await tick();assert.equal(h.opened.length,0);
  h.setUser({uid:'me'});h.api.reset();await tick();assert.equal(h.opened.length,0);
  h.lock(false);h.events.nyamBiometricUnlocked();h.events.nyamBiometricUnlocked();await tick();assert.deepEqual(h.opened,[threadId]);
});
test('malformed push routing and unavailable Android configuration safely preserve the app',async()=>{
  const missing=harness({configured:false});missing.api.reset();await missing.api.toggle();assert.equal(missing.writes.length,0);assert.match(missing.notices[0],/설정 파일/);
  const h=harness();await tick();h.listeners.pushNotificationActionPerformed({notification:{data:{type:'chat',threadId:'../other-user'}}});await tick();assert.equal(h.opened.length,0);
  const browser=harness({platform:'web'});browser.api.reset();await browser.api.toggle();assert.equal(browser.button.hidden,true);assert.equal(browser.writes.length,0);
});
test('failed native revocation blocks logout instead of silently leaving a valid token',async()=>{
  const h=harness({saved:true});h.api.reset();await tick();h.revokeFails(true);
  await assert.rejects(h.api.beforeLogout(),/offline/);assert.equal(h.deleted.length,0);
});
test('a user who never enabled FCM can still log out without a native network request',async()=>{
  const h=harness();h.api.reset();await tick();h.revokeFails(true);await h.api.beforeLogout();assert.equal(h.operations.includes('revoke'),false);
});
test('a late callback during user switching cannot write to the previous UID',async()=>{
  const h=harness({saved:true});h.api.reset();await tick();await h.api.beforeLogout();h.setUser({uid:'other'});h.api.reset();
  h.listeners.registration({value:'old-callback'});await tick();assert.equal(h.writes.filter(w=>w.ref.startsWith('users/other/')).length,0);
  await h.api.toggle();await tick();assert.equal(h.writes.at(-1).ref.startsWith('users/other/'),true);
});
