'use strict';
const {createHash}=require('node:crypto');
const DAY=86400000;
function hash(...values){return createHash('sha256').update(JSON.stringify(values)).digest('hex');}
function millis(value){return value&&typeof value.toMillis==='function'?value.toMillis():NaN;}
function recipient(thread,message,now){
  const members=thread?.members;
  if(!Array.isArray(members)||members.length!==2||new Set(members).size!==2||!members.every(uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&!uid.includes('/')))return null;
  if(typeof message?.senderUid!=='string'||!members.includes(message.senderUid))return null;
  const sent=millis(message.sentAt),expires=millis(message.expiresAt);
  if(!Number.isFinite(sent)||!Number.isFinite(expires)||expires<=now||sent>now+30000||expires-sent!==DAY)return null;
  if(typeof message.text!=='string'||!message.text.length||message.text.length>2000)return null;
  return members.find(uid=>uid!==message.senderUid);
}
function payload(threadId,messageId,expiresAt,now){
  return {
    notification:{title:'냠냠 레시피북 🍳',body:'새 메시지가 왔어요.'},
    data:{type:'chat',threadId},
    android:{priority:'high',ttl:Math.max(0,Math.min(DAY,expiresAt-now)),notification:{
      channelId:'nyam_messages',icon:'ic_message_notification',sound:'default',visibility:'private',tag:hash(threadId,messageId)
    }}
  };
}
function invalidToken(code){return ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code);}
module.exports={DAY,hash,millis,recipient,payload,invalidToken};
