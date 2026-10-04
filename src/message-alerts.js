import {Capacitor,registerPlugin} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
import {doc,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
const PushToken=registerPlugin('NyamPushToken');

export function createMessageAlerts({app,session}){
  const native=Capacitor.getPlatform()==='android',configured=typeof __NYAM_FCM_CONFIGURED__!=='undefined'&&__NYAM_FCM_CONFIGURED__;
  const button=document.getElementById('messageAlertButton');
  let enabled=false,busy=false,uid=null,epoch=0,initialized,installation,chain=Promise.resolve(),nativeChain=Promise.resolve(),pendingTap=null,routing=false,registeredOwner=null;
  try{registeredOwner=localStorage.getItem('nyamPushOwner');}catch(e){}
  function key(id){return `nyamMessageAlerts:${id}`;}
  function deviceId(){
    if(installation)return installation;
    const saved=localStorage.getItem('nyamPushInstallation');
    installation=/^[a-f0-9]{32}$/.test(saved||'')?saved:crypto.randomUUID().replaceAll('-','');
    localStorage.setItem('nyamPushInstallation',installation);return installation;
  }
  function render(){button.hidden=!native;button.disabled=busy;button.textContent=enabled?'메시지 소리 알림: 켜짐':'메시지 소리 알림 켜기';}
  function enqueue(task){const result=chain.then(task);chain=result.catch(()=>{});return result;}
  function nativeTask(task){const result=nativeChain.then(task);nativeChain=result.catch(()=>{});return result;}
  async function queuedWrite(promise){let timer;try{await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(resolve,3000);})]);}finally{clearTimeout(timer);}}
  async function saveToken(token){
    const owner=uid,generation=epoch,{db}=session();
    if(!enabled||!owner||!db||typeof token!=='string'||!token.length)return;
    await enqueue(async()=>{
      if(generation!==epoch||!enabled||session().user?.uid!==owner)return;
      registeredOwner=owner;localStorage.setItem('nyamPushOwner',owner);
      await queuedWrite(setDoc(doc(db,'users',owner,'pushTokens',deviceId()),{token,platform:'android',updatedAt:serverTimestamp()}));
    });
  }
  async function flushTap(){
    if(!pendingTap||!session().user||routing)return;
    routing=true;let opened=false;
    try{
      if(window.recipeBiometric&&!(await window.recipeBiometric.canOpenMessages()))return;
      const tap=pendingTap;pendingTap=null;
      await window.recipeChat.openThread(tap.threadId);
      opened=true;
    }catch(e){app.toast('메시지 화면을 열지 못했어요. 메시지 버튼에서 다시 확인해주세요.');}
    finally{routing=false;if(opened&&pendingTap)void flushTap();}
  }
  async function init(){
    if(!native||!configured)return;
    if(!initialized)initialized=(async()=>{
      await PushNotifications.addListener('pushNotificationActionPerformed',event=>{
        const data=event.notification?.data;
        if(data?.type==='chat'&&/^[a-f0-9]{64}$/.test(data.threadId||'')){pendingTap={threadId:data.threadId};void flushTap();}
      });
      await PushNotifications.addListener('registration',event=>{void saveToken(event.value).catch(()=>app.toast('알림 기기 등록에 실패했어요. 인터넷 연결과 서버 규칙을 확인해주세요.'));});
      await PushNotifications.addListener('registrationError',()=>app.toast('알림 등록에 실패했어요. 앱의 데이터베이스 Android 연결 설정을 확인해주세요.'));
      await PushNotifications.createChannel({id:'nyam_messages',name:'친구 메시지',description:'친구가 보낸 새 메시지',importance:5,visibility:0,vibration:true});
    })().catch(e=>{initialized=null;throw e;});
    return initialized;
  }
  async function register(request){
    const generation=epoch,owner=uid;
    if(!configured)throw Error('Android 데이터베이스 설정 파일을 넣고 앱을 다시 빌드해주세요.');
    await init();let permission=await PushNotifications.checkPermissions();
    if(request&&permission.receive!=='granted')permission=await PushNotifications.requestPermissions();
    if(permission.receive!=='granted'){if(request)throw Error('휴대폰 설정에서 냠냠 레시피북 알림을 허용해주세요.');return;}
    await nativeTask(async()=>{if(generation===epoch&&enabled&&uid===owner)await PushNotifications.register();});
  }
  async function detach(owner){
    if(!native||!configured||!owner)return;
    // Invalidate the token before removing its document, including when Firestore is offline.
    // If invalidation fails, keep the user signed in rather than leaking notifications after logout.
    if(registeredOwner)await nativeTask(()=>PushToken.revoke());
    const {db}=session();
    await enqueue(async()=>{
      if(!db||session().user?.uid!==owner)return;
      await queuedWrite(deleteDoc(doc(db,'users',owner,'pushTokens',deviceId())));
    });
    registeredOwner=null;localStorage.removeItem('nyamPushOwner');
    await api.clear();
  }
  const api={
    reset(){
      const previous=uid||registeredOwner,generation=++epoch;uid=session().user?.uid||null;enabled=false;
      if(native&&uid){try{enabled=localStorage.getItem(key(uid))==='true';}catch(e){}}
      const restoreRegistration=enabled;
      render();
      if(native&&configured)void (async()=>{
        if(previous&&previous!==uid&&registeredOwner){await nativeTask(()=>PushToken.revoke());registeredOwner=null;localStorage.removeItem('nyamPushOwner');}
        if(generation!==epoch)return;
        await init();if(generation!==epoch)return;if(restoreRegistration&&enabled&&uid)await register(false);await flushTap();
      })().catch(()=>app.toast('메시지 알림 설정을 확인해주세요.'));
      else void flushTap();
    },
    async toggle(){
      if(!native||busy||!session().user)return;
      busy=true;render();const owner=uid=session().user.uid;
      try{
        if(enabled){epoch++;enabled=false;await detach(owner);localStorage.setItem(key(owner),'false');}
        else{enabled=true;await register(true);localStorage.setItem(key(owner),'true');}
        app.toast(enabled?'앱을 닫아도 새 메시지 알림을 받을 수 있어요.':'메시지 소리 알림을 껐어요.');
      }catch(e){enabled=localStorage.getItem(key(owner))==='true';app.toast(String(e.message||'알림 설정에 실패했어요.').replace(/firebase/gi,'데이터베이스'));}
      finally{busy=false;render();}
    },
    async beforeLogout(){
      const owner=uid||session().user?.uid;epoch++;enabled=false;pendingTap=null;
      try{await detach(owner);uid=null;}catch(error){enabled=localStorage.getItem(key(owner))==='true';throw error;}
      finally{render();}
    },
    // FCM alone displays system notifications. Firestore retains its in-app badge/banner.
    async incoming(){},
    async clear(){if(native&&configured)try{await PushNotifications.removeAllDeliveredNotifications();}catch(e){}},
    flushTap
  };
  window.addEventListener('nyamBiometricUnlocked',()=>{void flushTap();});
  window.addEventListener('online',()=>{if(enabled&&uid)void register(false).catch(()=>{});void flushTap();});
  if(native&&configured)void init().catch(()=>{});
  render();return api;
}
