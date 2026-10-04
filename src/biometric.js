import {Capacitor,registerPlugin} from '@capacitor/core';
const Biometric=registerPlugin('NyamBiometric');
export function createBiometric({app,ensureAutoLogin,logout}){
  const button=document.getElementById('biometricButton'),native=Capacitor.getPlatform()==='android';
  let busy=false;
  async function refresh(){button.hidden=!native;if(!native)return;try{const state=await Biometric.status();button.textContent=state.enabled?'지문 잠금: 켜짐':'지문 잠금 켜기';button.disabled=busy||(!state.available&&!state.enabled);}catch(e){button.hidden=true;}}
  const api={
    async isEnabled(){return native&&(await Biometric.status()).enabled;},
    async canOpenMessages(){return !native||!(await Biometric.status()).locked;},
    async toggle(){if(!native||busy)return;busy=true;await refresh();try{if(!(await Biometric.status()).enabled)await ensureAutoLogin();const state=await Biometric.toggle();app.toast(state.enabled?'다음 실행부터 생체인증으로 앱을 열어요.':'지문 잠금을 껐어요.');}catch(e){app.toast(String(e.message||'지문 잠금 설정에 실패했어요.').replace(/firebase/gi,'데이터베이스'));}finally{busy=false;await refresh();}},
    async loggedOut(){if(native)await Biometric.loggedOut();},refresh
  };
  window.addEventListener('nyamBiometricLogout',()=>logout());refresh();return api;
}
