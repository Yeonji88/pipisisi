'use strict';
const {DAY,hash,millis,recipient,payload,invalidToken}=require('./push-logic.cjs');

// Only push metadata is changed. Saved chat messages are never mutated by this handler.
function createChatPushHandler({db,messaging,logger,now=Date.now}){
  async function removeInvalid(ref,token){
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      // Token rotation may have replaced this device document during the FCM request.
      if(current.exists&&current.data().token===token)tx.delete(ref);
    });
  }
  return async event=>{
    if(!event.data)return;
    const {threadId,messageId}=event.params||{};
    if(!/^[a-f0-9]{64}$/.test(threadId||'')||typeof messageId!=='string'||!messageId.length)return;
    const message=event.data.data(),thread=await db.doc(`chatThreads/${threadId}`).get();
    const target=thread.exists?recipient(thread.data(),message,now()):null;
    if(!target)return;
    const delivery=db.doc(`pushDeliveries/${hash(threadId,messageId)}`),expiresAt=new Date(millis(message.expiresAt)+DAY);
    const claimed=await db.runTransaction(async tx=>{
      const previous=await tx.get(delivery),data=previous.exists?previous.data():{};
      if(data.state==='done')return false;
      if(data.leaseUntil?.toMillis()>now())throw Error('Push delivery is already in progress');
      tx.set(delivery,{state:'sending',leaseUntil:new Date(now()+150000),expiresAt});return true;
    });
    if(!claimed)return;
    try{
      const documents=(await db.collection(`users/${target}/pushTokens`).get()).docs;
      // Multiple device documents may contain the same token after backup/restoration.
      const tokens=new Map();
      for(const document of documents){
        const data=document.data();
        if(data.platform!=='android'||typeof data.token!=='string'||!data.token.length||data.token.length>4096)continue;
        if(!tokens.has(data.token))tokens.set(data.token,[]);tokens.get(data.token).push(document.ref);
      }
      const pending=[];
      for(const [token,refs]of tokens){
        const receipt=db.doc(`pushReceipts/${hash(threadId,messageId,token)}`);
        pending.push({token,refs,receipt});
      }
      let retry=false;
      for(let start=0;start<pending.length;start+=500){
        if(millis(message.expiresAt)<=now())break;
        const batch=pending.slice(start,start+500),receipts=await db.getAll(...batch.map(item=>item.receipt));
        const unsent=batch.filter((item,index)=>!receipts[index].exists);
        if(!unsent.length)continue;
        const result=await messaging.sendEachForMulticast({...payload(threadId,messageId,millis(message.expiresAt),now()),tokens:unsent.map(item=>item.token)});
        for(let index=0;index<unsent.length;index++){
          const item=unsent[index],response=result.responses[index];
          if(response?.success){await item.receipt.set({expiresAt});continue;}
          if(invalidToken(response?.error?.code)){
            for(const ref of item.refs)await removeInvalid(ref,item.token);
            await item.receipt.set({expiresAt});
          }else{retry=true;logger.warn('FCM delivery will retry',{code:response?.error?.code||'missing-response'});}
        }
      }
      if(retry)throw Error('Temporary FCM delivery failure');
      await delivery.set({state:'done',expiresAt});
    }catch(error){
      // Successful device receipts survive retries; failed tokens are tried again.
      await delivery.set({state:'retry',leaseUntil:new Date(0),expiresAt});
      logger.error('Chat push failed; the saved message is unaffected',{code:error.code||'push-delivery-failed'});
      throw error;
    }
  };
}
module.exports={createChatPushHandler};
