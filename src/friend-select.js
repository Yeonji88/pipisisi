export function setupFriendSelect(){
  const $=id=>document.getElementById(id),select=$('chatRoomSelect'),button=$('friendSelectButton'),menu=$('friendSelectMenu'),wrap=button.parentElement;
  const supportsPopover=typeof menu.showPopover==='function';
  if(supportsPopover)menu.setAttribute('popover','manual');
  function close(){if(supportsPopover&&menu.matches(':popover-open'))menu.hidePopover();$('chatDialog').classList.remove('chatMenuFallback');menu.hidden=true;button.setAttribute('aria-expanded','false');}
  function position(){
    const rect=button.getBoundingClientRect();
    menu.style.left=rect.left+'px';menu.style.top=(rect.bottom+7)+'px';menu.style.width=rect.width+'px';
    menu.style.maxHeight=Math.max(48,Math.min(220,window.innerHeight-rect.bottom-19))+'px';
  }
  function refresh(){
    $('friendSelectLabel').textContent=select.selectedOptions[0]?.textContent||'대화할 친구 선택';
    menu.replaceChildren();
    Array.from(select.options).forEach(option=>{
      const item=document.createElement('button');item.type='button';item.className='friendSelectOption';item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.value===select.value));
      const icon=document.createElement('span');icon.textContent=option.value?'👩‍🍳':'💌';icon.setAttribute('aria-hidden','true');
      const label=document.createElement('span');label.textContent=option.textContent;item.append(icon,label);
      if(option.value===select.value){const mark=document.createElement('span');mark.className='friendSelectCheck';mark.textContent='♡';item.appendChild(mark);}
      item.addEventListener('click',()=>{select.value=option.value;close();select.dispatchEvent(new Event('change',{bubbles:true}));refresh();button.focus();});
      menu.appendChild(item);
    });
  }
  function open(){refresh();position();menu.hidden=false;if(supportsPopover){if(!menu.matches(':popover-open'))menu.showPopover();}else $('chatDialog').classList.add('chatMenuFallback');button.setAttribute('aria-expanded','true');}
  button.addEventListener('click',()=>{if(menu.hidden)open();else close();});
  button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open();const items=menu.querySelectorAll('button');(event.key==='ArrowUp'?items[items.length-1]:items[0])?.focus();}if(event.key==='Escape')close();});
  menu.addEventListener('keydown',event=>{
    const items=Array.from(menu.querySelectorAll('button')),index=items.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close();button.focus();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
  });
  select.addEventListener('change',refresh);
  new MutationObserver(refresh).observe(select,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',event=>{if(!wrap.contains(event.target))close();});
  $('chatDialog').addEventListener('close',close);
  window.addEventListener('resize',()=>{if(!menu.hidden)position();});
  document.addEventListener('scroll',event=>{if(!menu.hidden&&!menu.contains(event.target))position();},true);
  refresh();
}
