import {App} from '@capacitor/app';
import {Capacitor,registerPlugin} from '@capacitor/core';
const Navigation=registerPlugin('NyamNavigation');

export function setupBackNavigation({app,closePicker=()=>false}){
  const native=Capacitor.getPlatform()==='android',stack=[],watched=new WeakSet();
  let busy=false,lastHandled=null;
  function forget(dialog){const index=stack.indexOf(dialog);if(index>=0)stack.splice(index,1);}
  function remember(dialog){watch(dialog);forget(dialog);if(dialog.open)stack.push(dialog);}
  function duplicate(source){return lastHandled&&lastHandled.source!==source&&Date.now()-lastHandled.at<300;}
  function handled(source){lastHandled={source,at:Date.now()};}
  function topDialog(){
    const opened=Array.from(document.querySelectorAll('dialog[open]'));
    for(const dialog of [...stack])if(!opened.includes(dialog))forget(dialog);
    for(const dialog of opened)if(!stack.includes(dialog))remember(dialog);
    return stack.at(-1);
  }
  function closePopup(source){
    const dialog=topDialog();
    if((!dialog||dialog.id==='chatDialog')&&closePicker()){handled(source);return true;}
    if(!dialog)return false;
    // Exactly the existing X/cancel action: no save/delete and no synthetic cancel event.
    dialog.close();forget(dialog);handled(source);return true;
  }
  function cancel(event){
    event.preventDefault();
    // WebView cancel and native backButton may describe the same physical input.
    if(busy||duplicate('cancel'))return;
    if(native)return performBack('cancel',{});
    closePopup('cancel');
  }
  function watch(dialog){
    if(watched.has(dialog))return;watched.add(dialog);
    dialog.addEventListener('cancel',cancel);
    dialog.addEventListener('close',()=>{if(!dialog.open)forget(dialog);});
  }
  // Track top-layer order synchronously, rather than assuming DOM order is open order.
  const prototype=window.HTMLDialogElement?.prototype;
  for(const method of ['showModal','show']){
    const original=prototype?.[method];if(!original)continue;
    prototype[method]=function(...args){const wasOpen=this.open,result=Reflect.apply(original,this,args);watch(this);if(!wasOpen)remember(this);return result;};
  }
  document.querySelectorAll('dialog').forEach(dialog=>{watch(dialog);if(dialog.open)remember(dialog);});
  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'&&record.target.tagName==='DIALOG'){
        if(record.target.open)remember(record.target);else forget(record.target);
      }
    }
    document.querySelectorAll('dialog').forEach(watch);
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  async function performBack(source,{canGoBack=false}={}){
    if(busy||duplicate(source))return;busy=true;
    const initialDialog=topDialog();
    try{
      // Android normally consumes IME back before dispatch. This also handles WebViews
      // which forward the event while the keyboard is still visible.
      if((await Navigation.consumeKeyboardBack()).consumed){handled(source);return;}
      // An X click or a newly opened popup during the native round-trip must not
      // turn this input into a second close, a page change, or an app exit.
      if(topDialog()!==initialDialog){handled(source);return;}
      if(closePopup(source))return;
      if(source==='cancel')return;
      const friendsPage=document.getElementById('friendRecipesPage'),main=document.getElementById('recipeApp');
      if(main&&!main.hidden&&friendsPage&&!friendsPage.hidden){window.recipeFriends.page(false);handled(source);return;}
      handled(source);
      if(canGoBack)window.history.back();
      else await App.minimizeApp(); // Standard Android root-task back behavior; retain the process session.
    }catch(error){app.toast('뒤로가기를 처리하지 못했어요. 닫기 버튼을 사용해주세요.');}
    finally{busy=false;}
  }
  const back=event=>performBack('android',event);
  if(native)void App.addListener('backButton',back).catch(()=>app.toast('뒤로가기 연결에 실패했어요. 앱을 다시 열어주세요.'));
  return {topDialog,back};
}
