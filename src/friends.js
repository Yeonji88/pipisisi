import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { normalizeRecipe, sharedRecipe } from './recipe-data.mjs';

export function createFriends({app,session,report}){
  const $=id=>document.getElementById(id),esc=app.escape;
  let code='',friends=[],selected='',recipes=[],shared=new Set(),stop,stopMine,epoch=0;
  const profileStops=new Map();
  function watchProfile(friend,token=epoch){
    if(profileStops.has(friend.code))return;
    const {db}=requireUser();
    profileStops.set(friend.code,onSnapshot(doc(db,'recipeShares',friend.code),snapshot=>{
      if(token!==epoch)return;
      friend.name=snapshot.exists()&&typeof snapshot.data().displayName==='string'?snapshot.data().displayName:'';
      renderList();
    },()=>{}));
  }
  function requireUser(){const s=session();if(!s.user)throw Error('로그인 후 친구 레시피를 이용해주세요.');if(!navigator.onLine)throw Error('친구 레시피를 이용하려면 인터넷 연결이 필요해요.');return s;}
  function message(text){$('friendStatus').textContent=text;}
  function saveFriends(){const s=requireUser();localStorage.setItem(`nyamFriends:${s.user.uid}`,JSON.stringify(friends));}
  function renderList(){
    window.recipeChat?.refreshFriends();
    $('friendList').replaceChildren();
    $('friendManageActions').replaceChildren();
    friends.forEach((friend,i)=>{
      const button=document.createElement('button');button.className=`chip ${selected===friend.code?'on':''}`;
      const unread=window.recipeChat?.unreadFor(friend.code)||0;
      button.textContent=`👩‍🍳 ${friend.name||`친구 ${i+1}`}${unread?` · 💬 ${unread}`:''}`;button.addEventListener('click',()=>select(friend.code));$('friendList').appendChild(button);
    });
    if(selected){const remove=document.createElement('button');remove.className='chip';remove.textContent='선택한 친구 삭제';remove.addEventListener('click',()=>{try{const old=selected;friends=friends.filter(f=>f.code!==old);saveFriends();profileStops.get(old)?.();profileStops.delete(old);stop?.();selected='';recipes=[];renderList();render();if(friends.length)select(friends[0].code);}catch(e){report(e);}});$('friendManageActions').appendChild(remove);}
  }
  function render(){
    const q=$('friendSearch').value.trim().toLowerCase(),grid=$('friendGrid');grid.replaceChildren();
    const list=recipes.filter(r=>!q||(r.name+r.ingredients).toLowerCase().includes(q));
    if(!list.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=selected?'공유된 레시피가 없거나 검색 결과가 없어요.':'친구 코드를 추가하고 친구를 선택해주세요.';grid.appendChild(empty);return;}
    list.forEach(r=>{const card=document.createElement('article');card.className='card';card.tabIndex=0;card.setAttribute('role','button');card.innerHTML=`<div class="cover">${app.image(r)}</div><div class="cardbody"><h3>${esc(r.name)}</h3><div class="meta">${esc(r.category)} · ${r.servings}인분</div>${r.recipeDate?`<small class="recipeDateLabel">등록일 · ${esc(r.recipeDate)}</small>`:''}</div>`;card.addEventListener('click',()=>detail(r));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();detail(r);}});grid.appendChild(card);});
  }
  function detail(r,serv=r.servings){
    const dialog=$('friendDetail'),content=$('friendDetailContent');
    content.innerHTML=`<div class="detailHero">${app.image(r)}</div><div class="detailTitle"><h2>${esc(r.name)}</h2><div class="meta">친구 레시피 · ${esc(r.category)}</div>${r.recipeDate?`<small class="recipeDateLabel">등록일 · ${esc(r.recipeDate)}</small>`:''}<div class="serv"><button id="friendServMinus" aria-label="인분 줄이기">−</button><b>${serv}인분</b><button id="friendServPlus" aria-label="인분 늘리기">＋</button></div></div><div class="section"><h3>🧺 재료</h3><pre>${esc(app.scale(r.ingredients,serv/r.servings))}</pre></div><div class="section"><h3>👩‍🍳 만드는 순서</h3><pre>${esc(r.steps)}</pre></div>`;
    $('friendServMinus').addEventListener('click',()=>detail(r,Math.max(1,serv-1)));$('friendServPlus').addEventListener('click',()=>detail(r,serv+1));
    if(!dialog.open){dialog.showModal();app.resetScroll(dialog);}
  }
  async function select(next){
    const token=epoch;
    try{
      const {db}=requireUser();stop?.();selected=next;recipes=[];renderList();render();message('친구 레시피를 불러오는 중…');
      stop=onSnapshot(collection(db,'recipeShares',next,'recipes'),snap=>{
        if(token!==epoch||selected!==next)return;
        recipes=snap.docs.map(d=>({...normalizeRecipe(d.data(),d.id),updatedAt:d.data().updatedAt?.toMillis?.()||0})).sort((a,b)=>b.updatedAt-a.updatedAt);
        if($('friendDetail').open)$('friendDetail').close();render();message('');
      },e=>{if(token!==epoch||selected!==next)return;recipes=[];if($('friendDetail').open)$('friendDetail').close();render();message('친구 레시피를 불러오지 못했어요. 친구 코드와 Firebase 규칙을 확인해주세요.');report(e);});
    }catch(e){report(e);}
  }
  function subscribeMine(db,token){
    stopMine?.();
    stopMine=onSnapshot(collection(db,'recipeShares',code,'recipes'),snap=>{if(token!==epoch)return;shared=new Set(snap.docs.map(d=>d.id));app.refreshDetail();},e=>{if(token===epoch)message('공유 기능의 Firebase 보안 규칙 업데이트가 필요합니다.');});
  }
  async function reset(){
    epoch++;const token=epoch;stop?.();stopMine?.();for(const cancel of profileStops.values())cancel();profileStops.clear();code='';friends=[];selected='';recipes=[];shared=new Set();$('displayName').value='';$('myFriendCode').value='';$('friendCodeInput').value='';if($('friendDetail').open)$('friendDetail').close();renderList();render();
    if($('friendManager').open)$('friendManager').close();
    const s=session();if(!s.user){message('로그인 후 친구와 레시피를 공유하세요.');return;}
    message('친구 코드를 만들거나 입력해주세요.');
    try{
      const cached=JSON.parse(localStorage.getItem(`nyamFriends:${s.user.uid}`)||'[]');friends=Array.isArray(cached)?cached.filter(f=>f&&typeof f==='object'&&/^[a-f0-9]{32}$/.test(f.code||'')):[];renderList();friends.forEach(f=>watchProfile(f,token));if(!$('friendRecipesPage').hidden&&friends.length)select(friends[0].code);
      const profile=await getDoc(doc(s.db,'users',s.user.uid,'settings','profile'));if(token!==epoch)return;
      $('displayName').value=profile.exists()?profile.data().displayName||'':'';
      const setting=await getDoc(doc(s.db,'users',s.user.uid,'settings','sharing'));if(token!==epoch)return;
      if(setting.exists()){code=setting.data().code;$('myFriendCode').value=code;subscribeMine(s.db,token);}
    }catch(e){if(token===epoch)message('친구 기능을 사용하려면 Firebase 규칙을 업데이트해주세요.');}
  }
  $('friendSearch').addEventListener('input',render);
  const api={
    page(show){$('myRecipesPage').hidden=show;$('friendRecipesPage').hidden=!show;$('myRecipesTab').classList.toggle('on',!show);$('friendRecipesTab').classList.toggle('on',show);if(show&&!selected&&friends.length)select(friends[0].code);},
    openManager(){$('friendManager').showModal();app.resetScroll($('friendManager'));},
    openChat(){if(!selected){report(Error('먼저 대화할 친구를 선택해주세요.'));return;}window.recipeChat.open(selected);},
    reset,isShared:id=>shared.has(id),getCode:()=>code,getFriends:()=>friends.map(f=>({...f})),refreshBadges:renderList,
    async saveName(){
      const token=epoch;
      try{
        const {db,user}=requireUser(),name=$('displayName').value.trim();
        if(!name||name.length>30)throw Error('이름을 1~30자로 입력해주세요.');
        if(!code&&!(await api.createCode(false)))return;
        await runTransaction(db,async tx=>{
          const root=doc(db,'recipeShares',code),snapshot=await tx.get(root);
          if(token!==epoch)throw Error('계정이 변경되었습니다.');
          if(!snapshot.exists())throw Error('친구 코드를 다시 확인해주세요.');
          tx.set(doc(db,'users',user.uid,'settings','profile'),{displayName:name,updatedAt:serverTimestamp()});
          tx.set(root,{...snapshot.data(),displayName:name,updatedAt:serverTimestamp()});
        });
        if(token===epoch)app.toast('이름을 저장했어요. 친구에게 이 이름으로 표시됩니다.');
      }catch(e){report(e);}
    },
    async createCode(copy=true){
      const token=epoch;
      try{
        const {db,user}=requireUser();
        const result=await runTransaction(db,async tx=>{
          const ref=doc(db,'users',user.uid,'settings','sharing'),setting=await tx.get(ref);
          if(setting.exists())return setting.data().code;
          const next=crypto.randomUUID().replaceAll('-','');
          if(token!==epoch)throw Error('계정이 변경되었습니다.');
          tx.set(ref,{code:next,createdAt:serverTimestamp()});
          tx.set(doc(db,'recipeShares',next),{ownerUid:user.uid,createdAt:serverTimestamp()});return next;
        });
        if(token!==epoch)return;code=result;$('myFriendCode').value=code;subscribeMine(db,token);
        if(copy){try{await navigator.clipboard.writeText(code);app.toast('친구 코드를 복사했어요. 친구에게 보내주세요.');}catch(e){app.toast('코드가 표시됐어요. 길게 누르거나 선택해서 복사해주세요.');}}
        return code;
      }catch(e){report(e);}
    },
    async addFriend(){
      const token=epoch;
      try{
        const {db,user}=requireUser(),next=$('friendCodeInput').value.trim().toLowerCase();
        if(!/^[a-f0-9]{32}$/.test(next))throw Error('친구의 32자리 코드를 입력해주세요.');
        if(next===code)throw Error('내 코드 대신 친구 코드를 입력해주세요.');
        const profile=await getDoc(doc(db,'recipeShares',next));if(token!==epoch)return;
        if(!profile.exists())throw Error('친구 코드를 찾지 못했어요. 코드를 확인해주세요.');
        if(profile.data().ownerUid===user.uid)throw Error('내 코드 대신 친구 코드를 입력해주세요.');
        if(!friends.some(f=>f.code===next)){const friend={code:next,name:profile.data().displayName||''};friends.push(friend);saveFriends();watchProfile(friend,token);}
        $('friendCodeInput').value='';$('friendManager').close();await select(next);
      }catch(e){report(e);}
    },
    async share(id){
      const token=epoch;
      try{
        const {db,user}=requireUser();
        if(!code&&!(await api.createCode(false)))return;
        if(token!==epoch)throw Error('계정이 변경되었습니다.');
        await runTransaction(db,async tx=>{
          const privateRef=doc(db,'users',user.uid,'recipes',id),publicRef=doc(db,'recipeShares',code,'recipes',id);
          const own=await tx.get(privateRef),published=await tx.get(publicRef);
          if(token!==epoch)throw Error('계정이 변경되었습니다.');
          if(!own.exists()||own.data().deleted)throw Error('먼저 레시피를 저장해주세요.');
          if(published.exists()){tx.delete(publicRef);return;}
          const r=sharedRecipe({...own.data(),id});tx.set(publicRef,{...r,updatedAt:serverTimestamp()});
        });
        if(token===epoch)app.toast('친구 공유 설정을 변경했어요. 개인 메모는 공유하지 않습니다.');
      }catch(e){report(e);}
    }
  };
  return api;
}
