import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAT_LIFETIME,messageText,visibleMessages,threadId,chatChoices,unreadMessages,normalizeReadIds} from '../src/chat-data.mjs';
test('손상된 읽음 저장 데이터는 무시하고 유효한 메시지 ID만 유지',()=>{
  const room='a'.repeat(64),other='b'.repeat(64);
  const result=normalizeReadIds({[room]:['one',null,4,'one','two'],[other]:'invalid',bad:['x']});
  assert.deepEqual(result[room],['one','two']);assert.equal(result[other],undefined);assert.equal(result.bad,undefined);
  assert.equal(Object.keys(normalizeReadIds(null)).length,0);
  assert.equal(normalizeReadIds({[room]:Array.from({length:1100},(_,i)=>String(i))})[room].length,1000);
});
test('안읽은 숫자는 받은 메시지만 세고 읽었거나 만료된 메시지는 제외',()=>{
  const list=[{id:'a',senderUid:'me',sentAt:10,expiresAt:200},{id:'b',senderUid:'friend',sentAt:20,expiresAt:200},{id:'c',senderUid:'friend',sentAt:30,expiresAt:200},{id:'d',senderUid:'friend',sentAt:0,expiresAt:100}];
  assert.equal(unreadMessages(list,'me',['b'],100).length,1);assert.equal(unreadMessages(list,'me',['b','c'],100).length,0);
});
test('대화방이 없어도 등록된 친구가 표시되고 기존 대화방은 중복되지 않음',()=>{
  const friends=[{code:'codeA',name:'친구이름'}];assert.equal(chatChoices(friends,[],'me')[0].value,'friend:codeA');
  const result=chatChoices(friends,[{id:'room1',initiatorUid:'me',targetCode:'codeA'}],'me');assert.equal(result.length,1);assert.equal(result[0].value,'room:room1');assert.equal(result[0].label,'친구이름');
});
test('메시지 보관 시간은 24시간이고 만료된 메시지는 표시하지 않음',()=>{
  assert.equal(CHAT_LIFETIME,86400000);
  assert.deepEqual(visibleMessages([{text:'만료',sentAt:0,expiresAt:100},{text:'새 메시지',sentAt:50,expiresAt:101}],100).map(m=>m.text),['새 메시지']);
});
test('빈 메시지와 과도한 길이는 차단',()=>{assert.equal(messageText(' 안녕 '),'안녕');assert.throws(()=>messageText('  '));assert.throws(()=>messageText('가'.repeat(2001)));});
test('두 친구는 어느 쪽에서 시작해도 같은 대화방이며 다른 친구와 분리',async()=>{
  assert.equal(await threadId('a','b'),await threadId('b','a'));assert.notEqual(await threadId('a','b'),await threadId('a','c'));await assert.rejects(()=>threadId('a','a'));
});
