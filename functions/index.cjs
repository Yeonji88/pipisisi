'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getMessaging}=require('firebase-admin/messaging');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const logger=require('firebase-functions/logger');
const {createChatPushHandler}=require('./chat-push.cjs');
initializeApp();
exports.notifyChatMessage=onDocumentCreated({
  document:'chatThreads/{threadId}/chatMessages/{messageId}',
  region:'asia-northeast3',retry:true,timeoutSeconds:120,maxInstances:10
},createChatPushHandler({db:getFirestore(),messaging:getMessaging(),logger}));
