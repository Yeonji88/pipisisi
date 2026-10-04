import {test,before,after,beforeEach} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,collection,getDocs,serverTimestamp,Timestamp,query,where,limit} from 'firebase/firestore';
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-nyam-push',firestore:{rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});
});
beforeEach(async()=>{await env.clearFirestore();});
after(async()=>{await env?.cleanup();});
const device='a'.repeat(32),path=`users/alice/pushTokens/${device}`;
const token=()=>({token:'token/with:characters',platform:'android',updatedAt:serverTimestamp()});
test('owner can store, rotate, list and delete device tokens',async()=>{
  const db=env.authenticatedContext('alice').firestore();await assertSucceeds(setDoc(doc(db,path),token()));
  await assertSucceeds(setDoc(doc(db,path),{...token(),token:'rotated'}));await assertSucceeds(getDocs(collection(db,'users/alice/pushTokens')));
  await assertSucceeds(deleteDoc(doc(db,path)));
});
test('other users and unauthenticated clients cannot read, list or modify tokens',async()=>{
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),path),{...token(),updatedAt:Timestamp.now()});});
  for(const db of [env.authenticatedContext('bob').firestore(),env.unauthenticatedContext().firestore()]){
    await assertFails(getDoc(doc(db,path)));await assertFails(getDocs(collection(db,'users/alice/pushTokens')));
    await assertFails(setDoc(doc(db,path),token()));await assertFails(deleteDoc(doc(db,path)));
  }
});
test('invalid token schema and arbitrary device IDs are rejected',async()=>{
  const db=env.authenticatedContext('alice').firestore();
  for(const data of [{...token(),token:''},{...token(),platform:'web'},{...token(),extra:'not-allowed'},{...token(),updatedAt:Timestamp.fromMillis(0)}])await assertFails(setDoc(doc(db,path),data));
  await assertFails(setDoc(doc(db,'users/alice/pushTokens/unsafe'),token()));
});
test('server delivery and receipt documents cannot be accessed by clients',async()=>{
  const db=env.authenticatedContext('alice').firestore();
  for(const name of ['pushDeliveries','pushReceipts']){await assertFails(setDoc(doc(db,name,'a'),{state:'done'}));await assertFails(getDocs(collection(db,name)));}
});
test('existing private recipe and share profile permissions remain intact',async()=>{
  const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),code='c'.repeat(32);
  await assertSucceeds(setDoc(doc(alice,'users/alice/settings/profile'),{displayName:'Alice',updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(bob,'users/alice/settings/profile')));
  await assertSucceeds(setDoc(doc(alice,'recipeShares',code),{ownerUid:'alice',createdAt:serverTimestamp()}));await assertSucceeds(getDoc(doc(bob,'recipeShares',code)));
  await env.withSecurityRulesDisabled(async context=>{await setDoc(doc(context.firestore(),'users/alice/recipes/r1'),{name:'preserved'});});
  await assertSucceeds(getDoc(doc(alice,'users/alice/recipes/r1')));await assertFails(getDoc(doc(bob,'users/alice/recipes/r1')));
});
test('existing participants can send/read live messages while nonmembers and expired messages remain blocked',async()=>{
  const room='b'.repeat(64),sentAt=Timestamp.now(),expiresAt=Timestamp.fromMillis(sentAt.toMillis()+86400000-1000);
  // Existing rule requires exact 24h lifetime; leave margin against request.time for query safety.
  const sent=Timestamp.fromMillis(sentAt.toMillis()-1000);
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'chatThreads',room),{members:['alice','bob'],initiatorUid:'alice',initiatorCode:'A',targetCode:'B'});
    await setDoc(doc(context.firestore(),'chatThreads',room,'chatMessages','expired'),{senderUid:'alice',text:'old',sentAt:Timestamp.fromMillis(0),expiresAt:Timestamp.fromMillis(1)});
  });
  const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),outsider=env.authenticatedContext('eve').firestore();
  const message=db=>doc(db,'chatThreads',room,'chatMessages','live');
  await assertSucceeds(setDoc(message(alice),{senderUid:'alice',text:'hello',sentAt:sent,expiresAt}));
  await assertSucceeds(getDoc(message(bob)));await assertFails(getDoc(message(outsider)));
  await assertSucceeds(getDocs(query(collection(bob,'chatThreads',room,'chatMessages'),where('expiresAt','>',Timestamp.fromMillis(Date.now()+60000)),limit(100))));
  await assertFails(getDoc(doc(bob,'chatThreads',room,'chatMessages','expired')));
  await assertFails(setDoc(message(outsider),{senderUid:'eve',text:'bad',sentAt:sent,expiresAt}));
});
