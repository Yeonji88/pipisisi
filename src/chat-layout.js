export function setupChatLayout(){
  const dialog=document.getElementById('chatDialog'),viewport=window.visualViewport;
  function resize(){
    const height=viewport?.height||window.innerHeight,offset=viewport?.offsetTop||0;
    dialog.style.setProperty('--chat-height',Math.max(0,Math.min(height-24,height*.88))+'px');
    dialog.style.setProperty('--chat-top',(offset+height/2)+'px');
  }
  window.addEventListener('resize',resize);
  viewport?.addEventListener('resize',resize);
  viewport?.addEventListener('scroll',resize);
  resize();
}
