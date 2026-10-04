import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
let fcmConfigured=false;
try{
  const config=JSON.parse(await readFile('android/app/google-services.json','utf8'));
  const webConfig=await readFile('firebase-config.js','utf8');
  if(!config.client?.some(client=>client.client_info?.android_client_info?.package_name==='com.nyam.recipebook'))throw Error('google-services.json의 Android 패키지가 com.nyam.recipebook과 다릅니다.');
  if(!webConfig.includes(config.project_info?.project_id||'__missing_project__'))throw Error('웹 앱과 Android Firebase 프로젝트가 다릅니다.');
  fcmConfigured=true;
}catch(error){if(error.code!=='ENOENT')throw error;}
await build({ absWorkingDir: process.cwd(), tsconfigRaw: {}, define:{__NYAM_FCM_CONFIGURED__:String(fcmConfigured)}, entryPoints: ['./src/cloud.js'], bundle: true, platform: 'browser', format: 'iife', outfile: 'cloud.bundle.js', target: 'chrome110', minify: true });
console.log(fcmConfigured?'Android FCM 설정 확인 완료':'google-services.json 없음: 실제 푸시 등록은 설정 파일 추가 후 재빌드해야 합니다.');
await mkdir('www', { recursive: true });
for (const file of ['index.html', 'firebase-config.js', 'cloud.bundle.js']) await copyFile(file, `www/${file}`);
console.log('웹 코드 및 안드로이드 앱용 www 생성 완료');
