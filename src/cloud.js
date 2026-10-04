import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, runTransaction, serverTimestamp, getDocsFromServer } from 'firebase/firestore';
import { normalizeRecipe, parseBackup, assertRevision, backupRecipe, recipeContent, backupDuplicates, sharedRecipe } from './recipe-data.mjs';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createFriends } from './friends.js';
import { createChat } from './chat.js';
import { setupFriendSelect } from './friend-select.js';
import { setupChatLayout } from './chat-layout.js';
import { createBiometric } from './biometric.js';
import { createMessageAlerts } from './message-alerts.js';

const $ = id => document.getElementById(id);
const app = window.nyamApp;
let autoLogin=true;
try {autoLogin=localStorage.getItem('nyamAutoLogin')!=='false';}catch(e){}
try{$('authEmail').value=localStorage.getItem('nyamSavedEmail')||'';}catch(e){}
function refreshEmailButton(){
  let saved='';try{saved=localStorage.getItem('nyamSavedEmail')||'';}catch(e){}
  $('saveEmailButton').textContent=saved&&saved===$('authEmail').value.trim()?'이메일 저장됨 · 해제':'이메일 저장';
}
$('authEmail').addEventListener('input',refreshEmailButton);
refreshEmailButton();
let auth, db, user = null, unsubscribe, generation = 0, ready = false, busy = false, configured = false, backingUp = false, authChecked = false;
window.recipeFriends=createFriends({app,session:()=>({db,user}),report:e=>app.toast(errorMessage(e))});
window.messageAlerts=createMessageAlerts({app,session:()=>({db,user})});
window.recipeChat=createChat({app,session:()=>({db,user}),report:e=>app.toast(errorMessage(e)),friends:window.recipeFriends,onIncoming:details=>window.messageAlerts.incoming(details)});
window.recipeBiometric=createBiometric({app,logout:()=>window.recipeCloud.logout(),ensureAutoLogin:async()=>{
  if(!user)throw Error('먼저 로그인해주세요.');
  if(!autoLogin){await setPersistence(auth,browserLocalPersistence);localStorage.setItem('nyamAutoLogin','true');autoLogin=true;refreshControls();}
}});
setupFriendSelect();
setupChatLayout();
function status(message) { $('syncStatus').textContent = message; if(!user)$('loginStatus').textContent=message; }
function editable() { return !backingUp && (!user || (ready && navigator.onLine && !busy)); }
function check() { if (!editable()) throw Error('동기화 연결을 기다려주세요. 연결이 끊긴 동안에는 레시피를 읽을 수 있습니다.'); }
function errorMessage(e) {
  if (e.code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' || e.code === 'auth/invalid-api-key') return 'Firebase API 키가 올바르지 않습니다. 프로젝트의 웹 앱 설정값을 다시 확인해주세요.';
  if (e.code === 'auth/operation-not-allowed') return 'Firebase Authentication에서 이메일/비밀번호 로그인을 사용 설정해주세요.';
  if (e.code === 'auth/configuration-not-found') return 'Firebase Authentication 설정이 필요합니다. 콘솔에서 시작하기를 누르고 이메일/비밀번호 로그인을 켜주세요.';
  if (e.code === 'auth/unauthorized-domain') return '현재 주소가 로그인 허용 도메인에 없습니다. Firebase Authentication의 승인된 도메인을 확인해주세요.';
  if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') return '이메일 또는 비밀번호를 확인해주세요.';
  if (e.code === 'auth/email-already-in-use') return '이미 가입된 이메일입니다. 로그인해주세요.';
  if (e.code === 'auth/weak-password') return '비밀번호를 더 길고 복잡하게 입력해주세요.';
  if (e.code === 'auth/invalid-email') return '이메일 형식을 확인해주세요.';
  if (e.code === 'auth/too-many-requests') return '시도가 많습니다. 잠시 후 다시 시도해주세요.';
  if (e.code === 'permission-denied') return '동기화 권한을 확인해주세요. Firebase 보안 규칙 설정이 필요합니다.';
  if (e.code === 'auth/network-request-failed' || e.code === 'unavailable') return '인터넷 연결을 확인해주세요.';
  return e.code ? `서버 연결에 실패했습니다. 오류 코드: ${e.code}` : e.message;
}
function refreshControls() {
  $('authLoading').hidden=authChecked;
  $('loginPage').hidden=!authChecked||!!user;$('recipeApp').hidden=!authChecked||!user;
  $('loginButton').disabled=!configured||busy;
  $('signupButton').disabled=!configured||busy;
  $('autoLoginButton').textContent = autoLogin ? '자동 로그인: 켜짐' : '자동 로그인: 꺼짐';
  $('autoLoginButton').setAttribute('aria-pressed',String(autoLogin));
  $('autoLoginButton').disabled = busy || backingUp || !configured;
  $('accountEmail').textContent = user?.email || '이 기기에 저장 중';
  $('loginFields').hidden = !!user;
  $('logoutButton').hidden = !user;
  $('uploadLocalButton').hidden = !user;
  $('addRecipeButton').disabled = !editable();
  $('uploadLocalButton').disabled = busy || backingUp;
}
function attachListener(token) {
  unsubscribe?.();ready = false;
  const uid = user.uid;
  unsubscribe = onSnapshot(collection(db, 'users', uid, 'recipes'), { includeMetadataChanges: true }, snap => {
    if (token !== generation) return;
    // Firebase memory cache starts empty after a restart. Keep the device copy
    // until the server has confirmed the full account collection.
    if(snap.metadata.fromCache){ready=false;status('연결 확인 중 · 기기에 저장된 레시피를 표시합니다');refreshControls();return;}
    const recipes = snap.docs.map(d => {
      const data = d.data();
      return { ...normalizeRecipe(data, d.id), revision: data.revision, deleted: data.deleted, updatedAt: data.updatedAt?.toMillis?.() || 0 };
    }).filter(r => !r.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
    app.replace(recipes);
    ready = !snap.metadata.fromCache && navigator.onLine;
    status(ready ? '동기화 완료' : '오프라인 · 저장된 레시피를 읽을 수 있어요');
    refreshControls();
  }, e => { if (token !== generation) return; ready = false;status(errorMessage(e));refreshControls(); });
}
async function write(recipe, deleted = false) {
  check();
  const normalized = normalizeRecipe(recipe);
  if (!user) return null;
  const uid = user.uid, token = generation, expected = recipe.revision || 0;
  busy = true;refreshControls();status('저장 및 동기화 중…');
  try {
    return await runTransaction(db, async transaction => {
      if (token !== generation) throw Error('로그인 계정이 변경되었습니다.');
      const ref = doc(db, 'users', uid, 'recipes', normalized.id);
      const snapshot = await transaction.get(ref);
      const shareCode=window.recipeFriends.getCode();
      const shareRef=shareCode?doc(db,'recipeShares',shareCode,'recipes',normalized.id):null;
      const published=shareRef?await transaction.get(shareRef):null;
      const revision = snapshot.exists() ? snapshot.data().revision : 0;
      assertRevision(revision, expected);
      const result = { ...normalized, deleted, revision: revision + 1 };
      transaction.set(ref, { ...result, updatedAt: serverTimestamp() });
      if(published?.exists()){
        if(deleted)transaction.delete(shareRef);
        else transaction.set(shareRef,{...sharedRecipe(normalized),updatedAt:serverTimestamp()});
      }
      return result;
    });
  } finally { busy = false;refreshControls();status(ready ? '동기화 연결됨' : '동기화 연결을 기다리는 중'); }
}
async function exportBackup() {
  const data = JSON.stringify({format:'nyam-recipe-book',version:1,exportedAt:new Date().toISOString(),recipes:app.getRecipes()},null,2);
  const filename = `nyam-recipes-${new Date().toISOString().slice(0,10)}.json`;
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data, encoding: Encoding.UTF8 });
      await Share.share({ title: '레시피 백업 저장', files: [result.uri], dialogTitle: '백업 파일을 보관할 곳을 선택해주세요' });
    } catch(e) {app.toast('백업 공유를 완료하지 못했어요. 다시 시도해주세요.');}
    return;
  }
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;link.download = filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function addImported(records) {
  check();
  const token = generation;
  let count = 0;
  for (const record of records) {
    const recipe = {...record,id:crypto.randomUUID()};
    try {
      if (generation !== token) throw Error('로그인 계정이 변경되어 가져오기를 중단했습니다.');
      if (user) await write(recipe);
      else app.addImported(recipe);
      count++;
    } catch (e) { throw Error(`${count}개 추가 완료. ${errorMessage(e)} 원본 백업은 그대로 보관해주세요.`); }
  }
  app.toast(`${count}개 레시피를 추가했어요.`);
}
window.recipeCloud = {
  editable, write, report: e => app.toast(errorMessage(e)),
  open() { $('accountDialog').showModal(); },
  exportBackup,
  saveEmail(){
    const email=$('authEmail').value.trim();
    try{
      if(localStorage.getItem('nyamSavedEmail')===email&&email){localStorage.removeItem('nyamSavedEmail');app.toast('저장된 이메일을 지웠어요.');}
      else{if(!$('authEmail').checkValidity()||!email){app.toast('올바른 이메일을 입력해주세요.');return;}localStorage.setItem('nyamSavedEmail',email);app.toast('이메일을 저장했어요. 다음에 자동으로 입력됩니다.');}
      refreshEmailButton();
    }catch(e){app.toast('이 기기에 이메일을 저장하지 못했어요.');}
  },
  async toggleAutoLogin() {
    if(!configured||busy||backingUp)return;
    busy=true;refreshControls();
    try {
      if(autoLogin&&await window.recipeBiometric.isEnabled())throw Error('자동 로그인을 끄려면 지문 잠금을 먼저 꺼주세요.');
      const next=!autoLogin;
      await setPersistence(auth,next?browserLocalPersistence:browserSessionPersistence);
      autoLogin=next;
      try{localStorage.setItem('nyamAutoLogin',String(next));}catch(e){app.toast('로그인 유지 설정을 이 기기에 저장하지 못했어요.');return;}
      app.toast(next?'자동 로그인을 켰어요. 다음에 앱을 열어도 로그인 상태가 유지됩니다.':'자동 로그인을 껐어요. 현재 세션에서만 로그인 상태를 유지합니다.');
    }catch(e){app.toast(errorMessage(e));}
    finally{busy=false;refreshControls();}
  },
  async backupFirebase() {
    if (!configured) {app.toast('Firebase 프로젝트 연결이 필요합니다.');return;}
    if (!user) { $('accountDialog').showModal();app.toast('Firebase에 백업하려면 먼저 로그인해주세요.');return; }
    let added = 0, skipped = 0, cleaned = 0, ownsLock = false;
    try {
      check();
      const records = JSON.parse(localStorage.getItem('cuteRecipes') || '[]');
      if (!Array.isArray(records)) throw Error('기기에 저장된 레시피 형식을 확인해주세요.');
      if (!records.length) {app.toast('현재 계정의 레시피는 자동 동기화됩니다. 추가로 백업할 기기 레시피가 없어요.');return;}
      const prepared = await Promise.all(records.map(backupRecipe));
      check();
      const uid = user.uid, token = generation;
      ownsLock = true;backingUp = true;busy = true;refreshControls();
      const snapshot=await getDocsFromServer(collection(db,'users',uid,'recipes'));
      const existingRecords=snapshot.docs.map(d=>({...d.data(),id:d.id}));
      const contents=new Set(existingRecords.filter(r=>!r.deleted).map(recipeContent));
      const duplicates=backupDuplicates(existingRecords);
      // 정리 전 원본 전체를 이 기기에 남긴다. 실패하면 정리를 진행하지 않는다.
      if(duplicates.length)localStorage.setItem(`nyamBeforeDedup:${uid}`,JSON.stringify({format:'nyam-recipe-book',version:1,recipes:existingRecords.filter(r=>!r.deleted)}));
      for(const {original,duplicate} of duplicates){
        const removed=await runTransaction(db,async transaction=>{
          if(token!==generation)throw Error('계정이 변경되어 백업을 중단했습니다.');
          const keepRef=doc(db,'users',uid,'recipes',original.id),removeRef=doc(db,'users',uid,'recipes',duplicate.id);
          const keep=await transaction.get(keepRef),remove=await transaction.get(removeRef);
          if(!keep.exists()||!remove.exists()||keep.data().deleted||remove.data().deleted)return false;
          if(recipeContent(keep.data())!==recipeContent(remove.data()))return false;
          transaction.set(removeRef,{...normalizeRecipe(remove.data(),duplicate.id),revision:remove.data().revision+1,deleted:true,updatedAt:serverTimestamp()});
          return true;
        });
        if(removed)cleaned++;
      }
      for (const record of prepared) {
        if(token !== generation)throw Error('계정이 변경되어 백업을 중단했습니다.');
        status(`백업 중 · ${added + skipped + 1}/${prepared.length}`);
        if(contents.has(recipeContent(record))){skipped++;continue;}
        const created = await runTransaction(db, async transaction => {
          if(token !== generation)throw Error('계정이 변경되어 백업을 중단했습니다.');
          const ref = doc(db,'users',uid,'recipes',record.id);
          const existing = await transaction.get(ref);
          // 이미 백업된 버전이나 삭제된 버전은 덮어쓰거나 되살리지 않는다.
          if(existing.exists())return false;
          transaction.set(ref,{...record,revision:1,deleted:false,updatedAt:serverTimestamp()});
          return true;
        });
        if(created){added++;contents.add(recipeContent(record));}else skipped++;
      }
      app.toast(`백업 완료 · ${added}개 추가, ${skipped}개 이미 백업됨, 동일한 백업 복사본 ${cleaned}개 정리.`);
    } catch(e) {app.toast(`백업 중단 · ${added}개 추가 완료. ${errorMessage(e)} 다시 누르면 이어서 백업합니다.`);}
    finally {if(ownsLock){backingUp=false;busy=false;refreshControls();status(user?(ready?'동기화 연결됨':'동기화 연결을 기다리는 중'):'기기에 저장 중');}}
  },
  async authenticate(create = false) {
    if (!configured) { app.toast('Firebase 프로젝트 연결이 필요합니다.');return; }
    if (busy) return;
    busy = true;
    try {
      const email = $('authEmail').value.trim(), password = $('authPassword').value;
      if (create) await createUserWithEmailAndPassword(auth,email,password);
      else await signInWithEmailAndPassword(auth,email,password);
      $('authPassword').value='';
      if($('accountDialog').open)$('accountDialog').close();
      window.recipeFriends.page(false);
    } catch(e) { app.toast(errorMessage(e)); }
    finally {busy=false;refreshControls();}
  },
  async resetPassword() {
    if (!configured) {app.toast('Firebase 프로젝트 연결이 필요합니다.');return;}
    try {await sendPasswordResetEmail(auth,$('authEmail').value.trim());app.toast('가입된 이메일이라면 재설정 메일이 전송됩니다.');}catch(e){app.toast(errorMessage(e));}
  },
  async logout() {
    if(busy){app.toast('저장이 끝난 뒤 로그아웃해주세요.');return;}
    try{
      await signOut(auth);
      await window.recipeBiometric.loggedOut();await window.messageAlerts.clear();
      app.closeDialogs();
      $('recipeApp').hidden=true;$('loginPage').hidden=false;
      $('authPassword').value='';status('로그인하고 맛있는 기록을 이어가세요.');
    }catch(e){app.toast(errorMessage(e));}
  },
  async uploadLocal() {
    try {
      check();
      const records = JSON.parse(localStorage.getItem('cuteRecipes') || '[]');
      if (!records.length) {app.toast('이 기기에 가져올 기존 레시피가 없어요. 백업 파일을 선택해주세요.');return;}
      if (!confirm(`기존 레시피 ${records.length}개를 현재 계정에 복사할까요? 기존 데이터는 유지됩니다.`)) return;
      await addImported(parseBackup(JSON.stringify(records)));
    } catch(e) {app.toast(errorMessage(e));}
  }
};
$('backupInput').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try {
    if(file.size>30*1024*1024)throw Error('30MB 이하 백업 파일을 선택해주세요.');
    const records=parseBackup(await file.text());
    if(confirm(`${records.length}개 레시피를 추가할까요? 기존 레시피는 유지되며, 같은 파일을 다시 가져오면 중복 추가됩니다.`))await addImported(records);
  } catch(e) {app.toast(errorMessage(e));}
  finally {event.target.value='';}
});
const config=window.NYAM_FIREBASE_CONFIG;
if(config?.apiKey && config?.projectId && config?.appId){
  try {
    const firebase=initializeApp(config);auth=getAuth(firebase);db=getFirestore(firebase);
    setPersistence(auth,autoLogin?browserLocalPersistence:browserSessionPersistence).then(()=>{
    configured=true;refreshControls();
    onAuthStateChanged(auth,current=>{
      authChecked=true;
      generation++;unsubscribe?.();user=current;ready=false;
      app.closeDialogs();
      if(current){if($('accountDialog').open)$('accountDialog').close();window.recipeFriends.page(false);}
      app.switchAccount(current?.uid);
      window.recipeFriends.reset();
      window.recipeChat.reset();
      window.messageAlerts.reset();window.recipeBiometric.refresh();
      if(!current)window.recipeBiometric.loggedOut().catch(()=>{});
      refreshControls();
      if(current)attachListener(generation);else status('로그인하면 여러 기기에서 동기화할 수 있어요');
    },e=>{authChecked=true;status(errorMessage(e));refreshControls();});
    }).catch(e=>{authChecked=true;status(errorMessage(e));refreshControls();});
  }catch(e){authChecked=true;status(errorMessage(e));}
}else {authChecked=true;status('기기에 저장 중 · 클라우드 연결 준비 중');}
window.addEventListener('offline',()=>{ready=false;status(user?'오프라인 · 레시피 읽기 가능':'기기에 저장 중');refreshControls();});
window.addEventListener('online',()=>{if(user)attachListener(generation);});
refreshControls();
