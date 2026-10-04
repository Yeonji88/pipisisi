import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';

export function createMessageAlerts({app,session}){
  const native=Capacitor.getPlatform()==='android',button=document.getElementById('messageAlertButton');
  let enabled=false,busy=false,initialized;
  function key(){return `nyamMessageAlerts:${session().user?.uid}`;}
  function render(){button.hidden=!native;button.disabled=busy;button.textContent=enabled?'메시지 소리 알림: 켜짐':'메시지 소리 알림 켜기';}
  async function init(){
    if(!initialized)initialized=(async()=>{
      await LocalNotifications.createChannel({id:'nyam_messages_local',name:'친구 메시지',description:'앱 사용 중 새 메시지 알림',importance:5,visibility:0,vibration:true});
      await LocalNotifications.addListener('localNotificationActionPerformed',event=>{
        const extra=event.notification.extra||{};
        if(session().user?.uid===extra.uid)window.recipeChat.open(extra.peerCode);
      });
    })();
    return initialized;
  }
  const api={
    reset(){enabled=false;if(native&&session().user){try{enabled=localStorage.getItem(key())==='true';}catch(e){}}render();},
    async toggle(){
      if(!native||busy||!session().user)return;
      busy=true;render();
      try{
        if(enabled){localStorage.setItem(key(),'false');enabled=false;}
        else{
          await init();let permission=await LocalNotifications.checkPermissions();
          if(permission.display!=='granted')permission=await LocalNotifications.requestPermissions();
          if(permission.display!=='granted')throw Error('휴대폰 설정에서 냠냠 레시피북 알림을 허용해주세요.');
          localStorage.setItem(key(),'true');enabled=true;
        }
        app.toast(enabled?'앱을 켜둔 동안 새 메시지에 소리 알림을 표시해요.':'메시지 소리 알림을 껐어요.');
      }catch(e){app.toast(e.message);}
      finally{busy=false;render();}
    },
    async incoming({name,count,peerCode}){
      const uid=session().user?.uid;if(!native||!enabled||!uid)return;
      try{
        await init();if((await LocalNotifications.checkPermissions()).display!=='granted')return;
        if(!enabled||session().user?.uid!==uid)return;
        const id=(crypto.getRandomValues(new Uint32Array(1))[0]%2147483646)+1;
        await LocalNotifications.schedule({notifications:[{id,title:'냠냠 레시피북 🍳',body:`${name}에게 새 메시지 ${count}개가 왔어요.`,channelId:'nyam_messages_local',smallIcon:'ic_message_notification',extra:{uid,peerCode}}]});
      }catch(e){app.toast('휴대폰 알림을 표시하지 못했어요. 앱 알림 설정을 확인해주세요.');}
    },
    async clear(){if(native)try{await LocalNotifications.removeAllDeliveredNotifications();}catch(e){}}
  };
  render();return api;
}
