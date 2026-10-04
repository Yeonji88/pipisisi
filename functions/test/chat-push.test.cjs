'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DAY,hash,recipient,payload,invalidToken}=require('../push-logic.cjs');
const {createChatPushHandler}=require('../chat-push.cjs');
const time=1000000000,stamp=value=>({toMillis:()=>value});
const message=()=>({senderUid:'sender',text:'SECRET MESSAGE',sentAt:stamp(time),expiresAt:stamp(time+DAY)});
const threadId='a'.repeat(64);
function harness(tokens=['one','two']){
  const store=new Map([[`chatThreads/${threadId}`,{members:['sender','recipient']}] ]),calls=[],changes=[];
  const snapshot=path=>({exists:store.has(path),data:()=>store.get(path),ref:ref(path)});
  const prepare=data=>Object.fromEntries(Object.entries(data).map(([key,value])=>[key,value instanceof Date?stamp(value.getTime()):value]));
  const ref=path=>({path,get:async()=>snapshot(path),set:async data=>{changes.push(path);store.set(path,prepare(data));}});
  tokens.forEach((token,index)=>store.set(`users/recipient/pushTokens/device${index}`,{token,platform:'android'}));
  const db={doc:ref,collection:path=>({get:async()=>({docs:[...store.keys()].filter(key=>key.startsWith(path+'/')).map(snapshot)})}),
    getAll:async(...refs)=>refs.map(r=>snapshot(r.path)),runTransaction:async action=>action({get:async r=>snapshot(r.path),set:(r,data)=>{changes.push(r.path);store.set(r.path,prepare(data));},delete:r=>{changes.push(r.path);store.delete(r.path);}})};
  let responses=null,afterSend=null,throwSend=false;
  const messaging={sendEachForMulticast:async data=>{calls.push(data);afterSend?.();if(throwSend)throw Object.assign(Error('failure'),{code:'messaging/server-unavailable'});return {responses:responses||data.tokens.map(()=>({success:true}))};}};
  const logs=[],handler=createChatPushHandler({db,messaging,now:()=>time,logger:{warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args)}});
  const event={params:{threadId,messageId:'m1'},data:{data:message}};
  return {store,calls,changes,handler,event,logs,responses:value=>{responses=value;},afterSend:callback=>{afterSend=callback;},throwSend:value=>{throwSend=value;}};
}
test('valid two-person membership and unexpired 24h messages are required',()=>{
  assert.equal(recipient({members:['sender','recipient']},message(),time),'recipient');
  for(const members of [[],['sender'],['sender','sender'],['sender','recipient','third'],['x','y']])assert.equal(recipient({members},message(),time),null);
  assert.equal(recipient({members:['sender','recipient']},{...message(),senderUid:'attacker'},time),null);
  assert.equal(recipient({members:['sender','recipient']},message(),time+DAY),null);
  assert.equal(recipient({members:['sender','recipient']},{...message(),expiresAt:stamp(time+DAY+1)},time),null);
});
test('notification contains only a generic body and minimal data; tag is stable per message',()=>{
  const push=payload(threadId,'m1',time+DAY,time);
  assert.deepEqual(push.notification,{title:'냠냠 레시피북 🍳',body:'새 메시지가 왔어요.'});
  assert.deepEqual(push.data,{type:'chat',threadId});assert.equal(JSON.stringify(push).includes('SECRET MESSAGE'),false);
  assert.equal(push.android.notification.tag,payload(threadId,'m1',time+DAY,time+1000).android.notification.tag);
  assert.notEqual(push.android.notification.tag,payload(threadId,'m2',time+DAY,time).android.notification.tag);
  assert.equal(push.android.ttl,DAY);assert.equal(push.android.notification.visibility,'private');
});
test('sender never receives the push; all recipient devices receive it; duplicate trigger is skipped',async()=>{
  const h=harness();h.store.set('users/sender/pushTokens/device',{token:'sender-token',platform:'android'});
  await h.handler(h.event);await h.handler(h.event);
  assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0].tokens,['one','two']);
  assert.equal(h.changes.some(path=>path.startsWith('chatThreads/')),false);
});
test('invalid membership and expired messages never query/send to recipient tokens',async()=>{
  const h=harness();h.store.set(`chatThreads/${threadId}`,{members:['other','recipient']});await h.handler(h.event);assert.equal(h.calls.length,0);assert.equal(h.changes.length,0);
  h.store.set(`chatThreads/${threadId}`,{members:['sender','recipient']});h.event.data.data=()=>({...message(),sentAt:stamp(time-DAY),expiresAt:stamp(time)});await h.handler(h.event);assert.equal(h.calls.length,0);
});
test('invalid tokens are deleted while successful and rotated tokens survive',async()=>{
  const h=harness(['bad','rotating','good']);h.responses([{success:false,error:{code:'messaging/registration-token-not-registered'}},{success:false,error:{code:'messaging/invalid-registration-token'}},{success:true}]);
  h.afterSend(()=>h.store.set('users/recipient/pushTokens/device1',{token:'new-token',platform:'android'}));
  await h.handler(h.event);
  assert.equal(h.store.has('users/recipient/pushTokens/device0'),false);assert.equal(h.store.get('users/recipient/pushTokens/device1').token,'new-token');assert.equal(h.store.has('users/recipient/pushTokens/device2'),true);
  assert.equal(invalidToken('messaging/invalid-argument'),false);
});
test('retry sends only failed devices; never damages saved messages or logs their content',async()=>{
  const h=harness();h.responses([{success:true},{success:false,error:{code:'messaging/server-unavailable'}}]);
  await assert.rejects(h.handler(h.event),/Temporary/);h.responses(null);await h.handler(h.event);
  assert.deepEqual(h.calls[1].tokens,['two']);assert.equal(h.changes.some(path=>path.startsWith('chatThreads/')),false);
  assert.equal(JSON.stringify(h.logs).includes('SECRET MESSAGE'),false);assert.equal(JSON.stringify(h.logs).includes('one'),false);
});
test('duplicate device tokens are sent once; temporary request failure keeps token documents',async()=>{
  const h=harness(['one','one']);h.throwSend(true);await assert.rejects(h.handler(h.event));assert.equal(h.store.has('users/recipient/pushTokens/device0'),true);
  h.throwSend(false);await h.handler(h.event);assert.deepEqual(h.calls[1].tokens,['one']);
});
test('an active delivery lease rejects concurrent execution; completed receipt skips send',async()=>{
  const h=harness(['one']);h.store.set('pushDeliveries/'+hash(threadId,'m1'),{state:'sending',leaseUntil:stamp(time+1000)});
  await assert.rejects(h.handler(h.event),/in progress/);assert.equal(h.calls.length,0);
  h.store.delete('pushDeliveries/'+hash(threadId,'m1'));h.store.set('pushReceipts/'+hash(threadId,'m1','one'),{expiresAt:stamp(time+DAY)});
  await h.handler(h.event);assert.equal(h.calls.length,0);
});
test('FCM multicast batches never exceed 500 devices',async()=>{
  const h=harness(Array.from({length:501},(_,index)=>`token${index}`));await h.handler(h.event);
  assert.equal(h.calls.length,2);assert.equal(h.calls[0].tokens.length,500);assert.equal(h.calls[1].tokens.length,1);
});
