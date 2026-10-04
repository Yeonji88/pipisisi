import {collection,doc,getDoc,onSnapshot,query,where,orderBy,limit,runTransaction,serverTimestamp,Timestamp,setDoc} from 'firebase/firestore';
import {CHAT_LIFETIME,messageText,visibleMessages,threadId,chatChoices,unreadMessages,normalizeReadIds} from './chat-data.mjs';

export function createChat({app,session,report,friends,onIncoming=()=>{}}){
  const $=id=>document.getElementById(id);
  let epoch=0,rooms=[],active='',activePeer='',messages=[],stopRooms,stopMessages,renewTimer,expiryTimer,sending=false;
  let readIds={},monitorTimer,lastUnreadRoom='',selection=0;
  const monitors=new Map();
  function reading(room){return active===room&&$('chatDialog').open&&!document.hidden;}
  function markRead(room,list){
    const uid=session().user?.uid;if(!uid||!reading(room))return;
    const ids=visibleMessages(list).filter(m=>m.senderUid!==uid).map(m=>m.id);
    readIds[room]=[...new Set([...(readIds[room]||[]),...ids])].slice(-1000);
    try{localStorage.setItem(`nyamChatRead:${uid}`,JSON.stringify(readIds));}catch(e){}
  }
  function count(room){return unreadMessages(monitors.get(room)?.messages||[],session().user?.uid,readIds[room]||[]).length;}
  function badge(){
    const total=[...monitors.keys()].reduce((sum,id)=>sum+count(id),0);
    $('messageUnreadBadge').textContent=total>99?'99+':String(total);$('messageUnreadBadge').hidden=!total;
    friends.refreshBadges();
  }
  function monitor(room,token){
    const s=session();let state=monitors.get(room.id);
    if(!state){state={messages:[],known:new Set(),initialized:false};monitors.set(room.id,state);}
    state.stop?.();
    const q=query(collection(s.db,'chatThreads',room.id,'chatMessages'),where('expiresAt','>',Timestamp.fromMillis(Date.now()+60000)),orderBy('expiresAt','desc'),limit(100));
    state.stop=onSnapshot(q,snapshot=>{
      if(token!==epoch)return;
      const list=snapshot.docs.map(d=>({...d.data(),id:d.id,sentAt:d.data().sentAt.toMillis(),expiresAt:d.data().expiresAt.toMillis()}));
      const incoming=list.filter(m=>m.senderUid!==s.user.uid&&!state.known.has(m.id)&&!readIds[room.id]?.includes(m.id));
      state.messages=list;markRead(room.id,list);
      if(state.initialized&&incoming.length&&!reading(room.id)){
        lastUnreadRoom=room.id;
        const peerCode=room.initiatorUid===s.user.uid?room.targetCode:room.initiatorCode;
        const name=friends.getFriends().find(f=>f.code===peerCode)?.name||'친구';
        $('messageNoticeText').textContent=`${name}에게 새 메시지 ${incoming.length}개가 왔어요.`;$('messageNotice').hidden=false;
        app.toast(`${name}에게 새 메시지가 왔어요.`);
        onIncoming({name,count:incoming.length,peerCode});
      }
      list.forEach(m=>state.known.add(m.id));state.initialized=true;badge();
    },()=>{state.messages=[];badge();});
  }
  function requireUser(){const s=session();if(!s.user)throw Error('로그인 후 메시지를 이용해주세요.');if(!navigator.onLine)throw Error('메시지를 주고받으려면 인터넷 연결이 필요해요.');return s;}
  function status(text){$('chatStatus').textContent=text;}
  function stopConversation(){selection++;stopMessages?.();stopMessages=null;clearInterval(renewTimer);clearInterval(expiryTimer);messages=[];active='';activePeer='';$('chatConversation').hidden=true;$('chatCurrentFriend').textContent='대화할 친구를 선택해주세요.';$('chatInput').value='';}
  function render(){
    const box=$('chatMessages'),s=session();
    const nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80;
    box.replaceChildren();const live=visibleMessages(messages);
    if(!live.length){const empty=document.createElement('p');empty.className='meta';empty.textContent='최근 24시간 내 메시지가 없어요.';box.appendChild(empty);}
    live.forEach(m=>{
      const row=document.createElement('div');row.className=`chatRow ${m.senderUid===s.user?.uid?'mine':''}`;
      const bubble=document.createElement('div');bubble.className='chatBubble';bubble.textContent=m.text;
      const time=document.createElement('small');time.className='meta';time.textContent=new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit'}).format(new Date(m.sentAt));row.appendChild(bubble);row.appendChild(time);box.appendChild(row);
    });
    if(nearBottom)box.scrollTop=box.scrollHeight;
  }
  async function renderRooms(token){
    const select=$('chatRoomSelect'),previous=active,s=session();select.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='대화할 친구 선택';select.appendChild(placeholder);
    const choices=chatChoices(friends.getFriends(),rooms,s.user?.uid);
    for(const choice of choices){
      const n=api.unreadFor(choice.peerCode),suffix=n?` (${n})`:'';
      const option=document.createElement('option');option.value=choice.value;option.textContent=choice.label+suffix;select.appendChild(option);
      if(s.db&&s.user)getDoc(doc(s.db,'recipeShares',choice.peerCode)).then(snapshot=>{if(token===epoch&&snapshot.exists()){const name=snapshot.data().displayName||choice.label;option.textContent=name+suffix;if(activePeer===choice.peerCode)$('chatCurrentFriend').textContent=`${name} 님과 대화 중`;}}).catch(()=>{});
    }
    const chosen=choices.find(c=>c.value===`room:${previous}`)||choices.find(c=>c.peerCode===activePeer);
    if(chosen){select.value=chosen.value;$('chatCurrentFriend').textContent=`${chosen.label} 님과 대화 중`;}
    else select.value='';
  }
  function listenMessages(room){
    const token=epoch,{db}=requireUser();stopMessages?.();
    // 만료 직전 1분은 제외하는 조회 범위로 서버 보안 규칙에서도 만료된 메시지를 차단한다.
    const cutoff=Timestamp.fromMillis(Date.now()+60000);
    const q=query(collection(db,'chatThreads',room,'chatMessages'),where('expiresAt','>',cutoff),orderBy('expiresAt','desc'),limit(100));
    stopMessages=onSnapshot(q,snapshot=>{
      if(token!==epoch||room!==active)return;
      messages=snapshot.docs.map(d=>({...d.data(),id:d.id,sentAt:d.data().sentAt.toMillis(),expiresAt:d.data().expiresAt.toMillis()}));markRead(room,messages);badge();render();status('메시지는 전송 후 24시간 동안 보관됩니다.');
    },e=>{if(token!==epoch||room!==active)return;messages=[];render();status('메시지를 불러오지 못했어요. 데이터베이스 보안 설정과 자동 삭제 설정을 확인해주세요.');report(e);});
  }
  function choose(room){
    try{
      const s=requireUser(),known=rooms.find(r=>r.id===room),peer=known?(known.initiatorUid===s.user.uid?known.targetCode:known.initiatorCode):activePeer;
      stopConversation();active=room;activePeer=room?peer:'';renderRooms(epoch);render();
      if(!room)return;
      $('chatConversation').hidden=false;
      listenMessages(room);renewTimer=setInterval(()=>{if(navigator.onLine&&$('chatDialog').open)listenMessages(room);},30000);
      expiryTimer=setInterval(()=>{if(messages.some(m=>m.expiresAt<=Date.now())){messages=visibleMessages(messages);render();}},1000);
    }catch(e){report(e);}
  }
  $('chatRoomSelect').addEventListener('change',event=>{const value=event.target.value;if(value.startsWith('friend:'))api.open(value.slice(7));else choose(value.startsWith('room:')?value.slice(5):'');});
  $('chatDialog').addEventListener('close',()=>{stopConversation();});
  $('chatForm').addEventListener('submit',event=>{event.preventDefault();api.send();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active&&$('chatDialog').open){messages=visibleMessages(messages);markRead(active,messages);badge();render();if(navigator.onLine)listenMessages(active);}});
  const api={
    async openThread(id){
      const token=epoch,request=++selection;
      try{
        const {db,user}=requireUser();
        if(!/^[a-f0-9]{64}$/.test(id||''))throw Error('대화 정보를 확인해주세요.');
        const snapshot=await getDoc(doc(db,'chatThreads',id));
        if(token!==epoch||request!==selection||session().user?.uid!==user.uid)return;
        const room=snapshot.exists()?snapshot.data():null;
        if(!room||!Array.isArray(room.members)||room.members.length!==2||new Set(room.members).size!==2||!room.members.includes(user.uid))throw Error('현재 계정으로 볼 수 없는 대화입니다.');
        if(!rooms.some(r=>r.id===id))rooms.push({...room,id});
        if(!$('chatDialog').open)$('chatDialog').showModal();app.resetScroll($('chatDialog'));choose(id);
      }catch(e){if(token===epoch&&request===selection){report(e);await api.open();}}
    },
    unreadFor(code){const uid=session().user?.uid;return rooms.filter(r=>(r.initiatorUid===uid?r.targetCode:r.initiatorCode)===code).reduce((n,r)=>n+count(r.id),0);},
    async openUnread(){const room=lastUnreadRoom;await api.open();if(room)choose(room);$('messageNotice').hidden=true;},
    refreshFriends(){renderRooms(epoch);},
    reset(){
      epoch++;stopRooms?.();clearInterval(monitorTimer);for(const state of monitors.values())state.stop?.();monitors.clear();readIds={};lastUnreadRoom='';$('messageNotice').hidden=true;stopConversation();rooms=[];if($('chatDialog').open)$('chatDialog').close();$('chatMessages').replaceChildren();$('chatRoomSelect').replaceChildren();badge();
      const s=session();if(!s.user)return;const token=epoch;
      try{readIds=normalizeReadIds(JSON.parse(localStorage.getItem(`nyamChatRead:${s.user.uid}`)||'{}'));}catch(e){}
      monitorTimer=setInterval(()=>{if(token!==epoch)return;if(navigator.onLine)rooms.forEach(r=>monitor(r,token));badge();},30000);
      stopRooms=onSnapshot(query(collection(s.db,'chatThreads'),where('members','array-contains',s.user.uid)),snapshot=>{
        if(token!==epoch)return;rooms=snapshot.docs.map(d=>({...d.data(),id:d.id}));for(const [id,state]of monitors){if(!rooms.some(r=>r.id===id)){state.stop?.();monitors.delete(id);}}rooms.forEach(r=>monitor(r,token));renderRooms(token);badge();
      },()=>{renderRooms(token);status('메시지 기능의 데이터베이스 보안 설정 업데이트가 필요합니다.');});
    },
    async open(peerCode){
      const token=epoch;
      try{
        const {db,user}=requireUser();if(!$('chatDialog').open)$('chatDialog').showModal();app.resetScroll($('chatDialog'));renderRooms(token);status('대화할 친구를 선택해주세요.');render();
        if(!peerCode)return;
        stopConversation();const request=selection;activePeer=peerCode;renderRooms(token);
        const current=()=>token===epoch&&request===selection&&$('chatDialog').open;
        const ownCode=await friends.createCode(false);if(!ownCode||!current())return;
        const peer=await getDoc(doc(db,'recipeShares',peerCode));if(!current())return;if(!peer.exists())throw Error('친구 코드를 확인해주세요.');
        const target=peer.data().ownerUid,id=await threadId(user.uid,target);
        if(!current())return;
        await runTransaction(db,async tx=>{
          const ref=doc(db,'chatThreads',id),snapshot=await tx.get(ref);if(!current())throw Error('대화 선택이 변경되었습니다.');
          if(!snapshot.exists())tx.set(ref,{members:[user.uid,target].sort(),initiatorUid:user.uid,initiatorCode:ownCode,targetCode:peerCode,createdAt:serverTimestamp()});
        });
        if(!current())return;activePeer=peerCode;choose(id);
      }catch(e){report(e);}
    },
    async send(){
      if(sending)return;const token=epoch,room=active;
      try{
        const {db,user}=requireUser();if(!room)throw Error('먼저 대화할 친구를 선택해주세요.');
        const text=messageText($('chatInput').value);sending=true;$('chatSendButton').disabled=true;
        const sentAt=Timestamp.now(),expiresAt=Timestamp.fromMillis(sentAt.toMillis()+CHAT_LIFETIME);
        await setDoc(doc(collection(db,'chatThreads',room,'chatMessages')),{senderUid:user.uid,text,sentAt,expiresAt});
        if(token===epoch&&room===active){if($('chatInput').value.trim()===text)$('chatInput').value='';$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
      }catch(e){report(e);}
      finally{sending=false;$('chatSendButton').disabled=false;}
    }
  };
  return api;
}
