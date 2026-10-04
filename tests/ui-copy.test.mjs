import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('앱 소스의 고정 사용자 문구에 Firebase 브랜드가 남지 않고 기술적 import와 설정 이름은 유지',()=>{
  for(const file of ['src/cloud.js','src/friends.js','src/chat.js','src/biometric.js','src/message-alerts.js']){
    const source=readFileSync(file,'utf8');
    const copy=source.replace(/^import .*;\r?\n/gm,'').replace(/^\s*\/\/.*$/gm,'');
    assert.equal(/["'`][^"'`\r\n]*Firebase[^"'`\r\n]*["'`]/.test(copy),false,file);
  }
  const cloud=readFileSync('src/cloud.js','utf8');assert.match(cloud,/from 'firebase\/auth'/);assert.match(cloud,/from 'firebase\/firestore'/);assert.match(cloud,/backupFirebase\(\)/);
  const html=readFileSync('index.html','utf8');assert.match(html,/<script src="firebase-config.js"><\/script>/);
  const visible=html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]*>/g,'');assert.doesNotMatch(visible,/firebase/i);
});
