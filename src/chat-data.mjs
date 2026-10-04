export const CHAT_LIFETIME=24*60*60*1000;
export function normalizeReadIds(saved){
  const result=Object.create(null);
  if(!saved||typeof saved!=='object'||Array.isArray(saved))return result;
  for(const [room,ids]of Object.entries(saved)){
    if(/^[a-f0-9]{64}$/.test(room)&&Array.isArray(ids))result[room]=[...new Set(ids.filter(id=>typeof id==='string'))].slice(-1000);
  }
  return result;
}
export function unreadMessages(messages,uid,readIds=[],now=Date.now()){
  const read=new Set(readIds);return visibleMessages(messages,now).filter(m=>m.senderUid!==uid&&!read.has(m.id));
}
export function chatChoices(friends,rooms,uid){
  const byCode=new Map();
  for(const room of rooms){const code=room.initiatorUid===uid?room.targetCode:room.initiatorCode;byCode.set(code,{value:`room:${room.id}`,peerCode:code,label:'친구'});}
  friends.forEach((friend,i)=>{const room=byCode.get(friend.code);byCode.set(friend.code,{value:room?.value||`friend:${friend.code}`,peerCode:friend.code,label:friend.name||`친구 ${i+1}`});});
  return [...byCode.values()];
}
export function messageText(value){const text=String(value||'').trim();if(!text||text.length>2000)throw Error('메시지는 1~2000자로 입력해주세요.');return text;}
export function visibleMessages(messages,now=Date.now()){return messages.filter(m=>m.expiresAt>now).sort((a,b)=>a.sentAt-b.sentAt);}
export async function threadId(a,b){
  if(!a||!b||a===b)throw Error('다른 친구를 선택해주세요.');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([a,b].sort())));
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
