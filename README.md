# 냠냠 레시피북 🍳

기존 파스텔 화면을 유지하는 Capacitor 안드로이드 프로젝트입니다. 레시피 CRUD, 검색, 즐겨찾기, 대표 이모지·음식 사진, 인분 계산을 제공합니다.

## 현재 상태

`index.html`을 브라우저에서 열면 기존처럼 사용할 수 있습니다. `firebase-config.js`와 `cloud.bundle.js`도 같은 폴더에 있어야 계정·백업 기능이 작동합니다. 소스 변경 후 `npm run build`로 번들을 갱신합니다.

웹 Firebase 설정은 `nyam-recipe-book` 프로젝트를 사용합니다. Android FCM 설정 파일은 저장소에 포함하지 않습니다. 로그인·레시피·친구·채팅은 기존 웹 SDK를 유지하며, 실기기의 종료 상태 푸시 수신은 아래 서버 설정을 마친 뒤 확인해야 합니다.

## 데이터와 이전

- 기존 `cuteRecipes` 저장 키를 유지합니다. 계정별 캐시는 `nyamRecipes:<uid>`에 분리합니다.
- 로그인하면 계정 레시피를 표시합니다. 기존 기기 레시피는 삭제하거나 자동 업로드하지 않습니다.
- **계정 · 백업 → 백업 파일 내보내기**로 사진까지 포함한 JSON을 저장하세요. 앱에서는 공유 메뉴에서 보관 위치를 선택합니다.
- 다른 기기에서 같은 계정으로 로그인하거나 **백업 파일 가져오기**로 이전하세요.
- 가져오기는 새 ID로 추가합니다. 기존 레시피는 유지되며 반복 가져오기는 중복을 만듭니다. 서버 가져오기는 순차 처리이므로 실패하면 일부만 추가될 수 있습니다.
- 로그인한 계정에 **기존 기기 레시피를 계정에 복사**할 수 있습니다.
- 사진은 최대 800px JPEG로 줄여 문서에 함께 저장합니다. 사진 문자열은 600,000자 이하입니다. 사진이 많은 서비스로 확장할 때는 별도 파일 저장소 이전이 필요합니다.
- 계정 모드에서는 온라인일 때 편집합니다. 오프라인에서는 이 기기에 캐시된 레시피를 읽을 수 있습니다.
- 다른 기기가 같은 레시피를 먼저 수정하면 버전 충돌로 저장을 중단합니다. 최신 내용을 다시 열어 수정하세요.
- 서버 삭제는 삭제 표시와 버전을 남겨 오래된 수정으로 복구되는 일을 막습니다.

## Firebase 연결

1. https://console.firebase.google.com/ 에서 프로젝트를 만들고 **웹 앱**을 등록하세요. 현재 앱 내부는 Firebase 웹 SDK를 사용합니다.
2. Authentication → 로그인 방법 → **이메일/비밀번호**를 활성화하세요.
3. Cloud Firestore → 데이터베이스 만들기 → 프로덕션 모드로 생성하세요. 데이터베이스 위치는 서비스 지역에 맞게 선택하세요.
4. 프로젝트 설정 → 웹 앱의 `firebaseConfig`에서 `apiKey`, `authDomain`, `projectId`, `appId`를 `firebase-config.js`에 입력하세요. 관리자 서비스 계정 비밀 키는 넣지 마세요.
5. Firestore 규칙 탭에 `firestore.rules`를 적용하세요. 로그인한 본인 UID의 데이터만 읽고 쓸 수 있습니다. Firebase CLI를 사용하는 경우 `firebase deploy --only firestore --project 실제프로젝트ID`로 규칙과 인덱스 설정을 함께 배포합니다.
6. `npm run android:sync` 후 앱에서 회원가입하세요. 두 기기에서 같은 계정으로 로그인해 사진·추가·수정·삭제·즐겨찾기를 검증하세요.

현재 서버 프로젝트 생성이나 규칙 배포는 수행하지 않았습니다. API 설정값만 넣어서는 충분하지 않으며, 보안 규칙도 반드시 적용해야 합니다.

## 안드로이드 빌드

Node.js 22 이상과 Android Studio, Android SDK/JDK가 필요합니다. 공식 환경 설정: https://capacitorjs.com/docs/getting-started/environment-setup

```powershell
npm install
npm test
npm run android:sync
npm run android:open
```

`android/` 프로젝트는 생성되어 있습니다. Android Studio에서 Gradle 동기화 후 기기 실행 및 APK 생성을 진행하세요. 디버그 APK는 `android/app/build/outputs/apk/debug/`에 생성됩니다. 출시 APK/AAB는 별도 서명이 필요합니다. 패키지 ID는 현재 `com.nyam.recipebook`이며 배포 전에 확정하세요.

이 PC에는 전용 임시 폴더의 Java 21 및 Android SDK를 준비했습니다. 재빌드는 `powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1`로 실행합니다. 도구 폴더가 삭제되었다면 다시 준비해야 합니다. 생성 파일은 `dist/nyam-recipe-book.apk`이며 디버그 서명으로 설치하는 테스트용 APK입니다. 스토어 출시는 별도 출시 서명이 필요합니다.

## 검증 범위

`npm test`는 기존 CRUD·사진·인분 계산, 저장 실패 시 데이터 유지, 계정 캐시 분리, 백업 입력 검증, 버전 충돌 차단, 손상된 데이터 덮어쓰기 방지를 확인합니다. 실제 Firebase 보안 규칙, 두 기기 동기화, 안드로이드 사진 선택과 공유는 서버 연결 및 실기기에서 추가 검증이 필요합니다.

## 로그인 시작 화면과 친구 메시지

처음 실행하면 로그인 화면만 표시합니다. 유효한 자동 로그인 상태는 메인 화면으로 들어가며 로그아웃하면 로그인 화면으로 돌아갑니다. 기존 기기 레시피 데이터는 삭제하지 않습니다.

메인 화면의 `메시지` 버튼으로 기존 대화를 열 수 있고, 친구 페이지에서 친구를 선택한 뒤 `선택한 친구와 대화`를 눌러 새 대화를 시작합니다. 메시지는 텍스트만 지원하며 한 번에 최근 100개를 표시합니다. 대화 참여자 두 사람만 메시지를 조회·작성할 수 있습니다. 메시지는 백업 JSON이나 localStorage에 포함하지 않습니다.

서버 설정이 완료되어야 실제 송수신과 자동 삭제가 작동합니다.

1. Firebase Firestore 규칙을 현재 `firestore.rules` 내용으로 게시하세요.
2. Google Cloud Firestore의 TTL 정책에서 컬렉션 그룹 `chatMessages`, 타임스탬프 필드 `expiresAt`을 선택해 정책을 활성화하세요. 또는 Firebase CLI로 `firebase deploy --only firestore --project nyam-recipe-book`를 실행하면 규칙 및 `firestore.indexes.json`의 TTL 설정을 배포합니다. 활성화 완료까지 시간이 걸릴 수 있습니다.
3. TTL 삭제에는 문서 삭제 비용이 적용되므로 콘솔에서 요구하는 결제 설정을 확인하세요.
4. 두 계정에서 각자의 친구 코드를 교환하고 송수신을 확인하세요.

24시간 만료 시 메시지는 보안 규칙에서 조회가 차단됩니다. 조회 범위가 안전하게 유지되도록 만료 직전 최대 1분은 미리 제외될 수 있습니다. 서버의 실제 문서 삭제는 TTL 정책이 활성화된 뒤 비동기로 진행되며, Firebase는 일반적으로 만료 후 추가 24시간 내 삭제한다고 안내합니다. **정확히 전송 24시간 시점에 서버에서 영구 삭제하는 기능은 아닙니다.** 대화방의 참여자·코드 메타데이터는 대화를 다시 연결하기 위해 남겨두며, 메시지 본문만 만료 처리합니다.

TTL 공식 안내: https://firebase.google.com/docs/firestore/ttl

현재 서버 규칙·TTL 정책의 배포와 실제 계정 간 송수신은 수행하지 않았습니다. 테스트는 메시지 만료 판별, 입력 제한, 대화방 구분, 기존 레시피 기능을 확인합니다.

## 메시지 알림과 지문 잠금

계정 팝업의 **메시지 소리 알림 켜기**와 기존 ON/OFF 설정을 유지합니다. APK 1.3부터 시스템 알림은 공식 Capacitor Push Notifications 플러그인과 FCM으로만 표시하며, LocalNotifications를 함께 예약하지 않습니다. 서버 설정 후에는 앱이 백그라운드에 있거나 프로세스가 종료되어도 Android가 알림을 표시합니다. 앱 안의 새 메시지 안내와 안읽은 숫자는 기존 채팅 기능을 그대로 사용합니다. 소리·진동·표시는 휴대폰의 알림 채널, 무음, 방해금지, 배터리 설정에 따릅니다.

휴대폰에 지문 등 강한 생체인증을 등록한 뒤 계정 팝업의 **지문 잠금 켜기**를 누릅니다. Android 시스템 생체인증에 성공해야 잠금 설정이 변경됩니다. 자동 로그인이 함께 켜지며, 앱 프로세스가 종료된 뒤 새로 실행할 때 Android 잠금 화면이 웹 화면을 가리고 시스템 생체인증을 요청합니다. 단순히 앱을 내렸다가 올리거나 같은 프로세스에서 화면이 재생성되면 인증 상태를 유지합니다. 인증 상태는 메모리에만 두므로 Android가 백그라운드 앱을 종료한 뒤 다시 실행하면 지문을 다시 확인합니다. 인증을 취소하면 잠금 화면에 머뭅니다. 지문을 사용할 수 없으면 **로그아웃하고 이메일로 로그인**을 선택할 수 있습니다. 앱은 Firebase 비밀번호나 지문 데이터를 별도로 저장하지 않습니다. 이 기능은 저장된 Firebase 세션의 로컬 앱 잠금이며 새 Firebase 인증 수단을 등록하는 기능이 아닙니다.

메시지 팝업은 visualViewport 높이에 맞춰 키보드 위에 배치됩니다. 입력 폼은 고정 크기를 유지하고 메시지 목록만 줄어들어 스크롤됩니다. 아이콘 원본은 `assets/app-icon.svg`, 크기별 재생성은 `node scripts/generate-app-icons.mjs`입니다.

자동 웹 코드 배포(OTA)는 아직 추가하지 않았습니다. 현재 수정 사항을 설치 기기에 반영하려면 새 APK를 기존 앱 위에 설치해야 합니다. 같은 서명으로 덮어설치하면 앱 데이터가 유지됩니다. 앱을 삭제하지 마세요. 실제 휴대폰의 생체인증, 키보드 및 알림 소리는 실기기 검증이 필요합니다.

## Android FCM 설정: 직접 해야 할 순서

### 1. 같은 Firebase 프로젝트와 요금제 확인

Firebase Console에서 기존 **nyam-recipe-book** 프로젝트를 여세요. 새 프로젝트로 바꾸지 않아야 기존 계정·레시피·친구·채팅 데이터가 유지됩니다.

FCM 자체에는 별도 발송 요금이 없지만, 이번 **Cloud Functions 서버 배포에는 Blaze 요금제와 결제 계정 연결이 필요**합니다. 무료 사용량이 있어도 완전 무료를 보장하지 않으며 Functions 실행, 빌드 이미지 보관, Firestore 읽기/쓰기/TTL 삭제 비용이 발생할 수 있습니다. 먼저 콘솔에서 요금제를 확인하고 필요하면 Blaze로 변경하세요. 이 저장소의 작업으로 결제 등록이나 서버 배포를 자동 실행하지는 않습니다.

공식 안내: [Functions 배포와 Blaze 요금제](https://firebase.google.com/docs/functions/get-started), [Firebase 요금](https://firebase.google.com/pricing).

### 2. Android 앱 등록과 설정 파일 다운로드

1. Firebase Console 왼쪽 위 **프로젝트 개요 옆 톱니바퀴 → 프로젝트 설정 → 일반**을 여세요.
2. **내 앱 → 앱 추가 → Android 아이콘**을 선택하세요. 이미 등록되어 있다면 기존 Android 앱을 선택하세요.
3. **Android 패키지 이름**에 정확히 `com.nyam.recipebook`을 입력하세요. 앱 닉네임은 원하는 이름으로 정해도 됩니다. 이메일 로그인과 FCM 등록에는 SHA 인증서 입력이 필수는 아닙니다.
4. **google-services.json 다운로드**를 눌러 받은 실제 파일을 프로젝트의 **`android/app/google-services.json`** 위치에 넣으세요. 이름 끝에 `(1)`이 붙었다면 제거하세요.
5. 이 파일은 `.gitignore`에 등록되어 GitHub에 올라가지 않습니다. 가짜 파일이나 웹 `firebaseConfig`를 이 파일 대신 넣지 마세요. 별도의 관리자 서비스 계정 키도 앱에 넣지 마세요.

설정 파일 없이도 기존 기능 확인용 APK 빌드는 성공하지만 **실제 FCM 토큰 등록은 비활성화**됩니다. 파일 추가 후에는 반드시 웹 빌드와 `cap sync` 및 APK 빌드를 다시 해야 합니다. 잘못된 패키지 또는 다른 Firebase 프로젝트 파일은 빌드 단계에서 차단합니다.

### 3. Cloud Messaging 확인

프로젝트 설정의 **Cloud Messaging** 탭에서 **Firebase Cloud Messaging API (V1)**가 사용 설정되어 있는지 확인하세요. 꺼져 있으면 해당 화면의 API 관리 링크에서 같은 프로젝트의 Firebase Cloud Messaging API를 사용 설정하세요. 예전 Legacy 서버 키를 발급하거나 앱 코드에 넣을 필요는 없습니다. Functions는 서버의 기본 서비스 계정으로 Admin SDK를 사용합니다.

### 4. Firebase CLI 설치와 프로젝트 연결

Node.js 22와 Android Studio/JDK 21 및 Android SDK가 필요합니다. PowerShell을 열고 프로젝트 폴더에서 아래 명령을 순서대로 실행하세요.

```powershell
cd "C:\Users\SC TRADE\Documents\ChatGPT\요리책 2"
npm install -g firebase-tools
firebase login
firebase use --add
```

브라우저에서 프로젝트 관리 권한이 있는 Google 계정으로 로그인하세요. `firebase use --add`의 목록에서 **nyam-recipe-book**을 선택하고 별칭에 `default`를 입력하세요. 이미 연결한 경우 `firebase use nyam-recipe-book`으로 선택할 수 있습니다. 아래 배포 명령에도 프로젝트 ID를 명시해서 다른 프로젝트에 잘못 배포하는 일을 줄입니다.

### 5. 앱·Functions 의존성 설치와 테스트

```powershell
npm ci
npm --prefix functions ci
npm test
npm --prefix functions test
npm run test:rules
```

`npm test`는 기존 기능과 FCM 클라이언트/서버 로직을 함께 검사합니다. `test:rules`는 Java 21 이상이 필요하며, 고정 버전 Firebase CLI를 일시 실행해 `demo-nyam-push` 로컬 Firestore 에뮬레이터에서 접근 권한을 검사합니다. 실제 서버 데이터에는 접근하지 않습니다. `functions/`의 배포 런타임은 Node.js 22입니다.

### 6. Firestore 규칙과 TTL 설정 배포

```powershell
firebase deploy --only firestore --project nyam-recipe-book
```

기존 recipe/chat/share 규칙에 본인 전용 `users/{uid}/pushTokens/{installationId}` 규칙만 추가했습니다. 다른 UID의 토큰은 읽기·목록 조회·쓰기·삭제가 모두 차단됩니다. 기존 `chatMessages.expiresAt` TTL은 유지하고 서버의 중복 방지 문서 `pushDeliveries`와 `pushReceipts`에도 TTL을 추가했습니다. 콘솔에서 TTL 정책이 활성화되었는지 확인하세요. TTL의 물리 삭제는 비동기이며 메시지는 기존 규칙대로 24시간 이후 조회가 차단됩니다.

### 7. 알림 Functions 배포

```powershell
firebase deploy --only functions:nyam-notifications --project nyam-recipe-book
```

`nyam-notifications` 코드베이스의 **notifyChatMessage** 함수만 배포합니다. 이미 다른 Functions가 있다면 삭제를 승인하지 말고 프로젝트와 코드베이스 선택을 확인하세요. 첫 배포는 Functions/Cloud Build/Artifact Registry/Eventarc 등 필요한 API 활성화 때문에 시간이 걸릴 수 있습니다. 함수는 `asia-northeast3`에서 실행하도록 구성했습니다. 다른 데이터베이스 지역을 사용하는 경우 지역 간 지연/비용을 검토하세요.

배포 완료 후 콘솔 Functions 목록에서 함수를 확인하세요. 문제 발생 시 로그를 확인합니다.

```powershell
firebase functions:log --only notifyChatMessage --project nyam-recipe-book
```

### 8. Android 동기화와 APK 재빌드

실제 `google-services.json`을 넣은 상태에서 실행하세요.

```powershell
npm run android:sync
```

이 PC의 기존 빌드 도구를 사용하는 정확한 APK 생성 명령:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1
```

위 스크립트가 웹 빌드와 `cap sync android`도 실행하고 **`dist/nyam-recipe-book.apk`**에 디버그 APK를 복사합니다. 다른 PC에서는 JDK/SDK를 설정하고 Android Studio로 빌드하거나 다음 명령을 실행하세요.

```powershell
.\android\gradlew.bat -p android assembleDebug --no-daemon "-Pandroid.overridePathCheck=true"
```

Gradle 직접 실행은 `npm run android:sync` 후에 사용하세요. 결과는 `android/app/build/outputs/apk/debug/app-debug.apk`입니다. 같은 서명의 APK를 기존 앱 위에 덮어설치하세요. 앱 삭제는 기기 데이터 손실을 유발할 수 있습니다.

### 9. 두 휴대폰에서 실제 알림 확인

1. 두 기기에 새 APK를 설치하고 서로 다른 기존 계정으로 로그인하세요.
2. 각 기기의 **계정 · 백업 → 메시지 소리 알림 켜기**를 누르세요. Android 13 이상에서는 시스템 권한 요청을 허용하세요. 이전 ON 설정은 권한이 이미 허용되어 있으면 자동 복원합니다.
3. Firestore에서 해당 사용자 `users → UID → pushTokens`에 기기별 문서가 생성되는지 확인하세요. 문서에는 `token`, `platform: android`, `updatedAt`이 저장됩니다. 같은 기기의 토큰 갱신은 같은 문서를 덮어쓰고 다른 기기는 별도 문서를 사용합니다. 토큰을 타인에게 공유하지 마세요.
4. 친구에게 메시지를 보내고 수신 기기가 **앱 화면 / 홈 화면으로 내린 상태 / 프로세스 종료 상태**일 때 각각 알림을 확인하세요. 일반적인 최근 앱 목록 종료와 Android 설정의 **강제 종료**는 다릅니다. 강제 종료된 앱은 사용자가 다시 열기 전까지 알림 수신이 제한됩니다. 기기 제조사의 절전 정책도 수신을 지연시킬 수 있습니다.
5. 알림은 **냠냠 레시피북 🍳 / 새 메시지가 왔어요.**로 표시되며 실제 메시지 본문을 넣지 않습니다. 알림을 누르면 로그인과 지문 잠금이 해제된 후 해당 대화의 참여 권한을 확인하고 엽니다. 권한이 없거나 대화가 없으면 메시지 선택 화면으로 안전하게 돌아갑니다.
6. 알림 OFF와 로그아웃은 **현재 기기의 토큰만** 해제합니다. 다른 기기는 유지됩니다. 네트워크 문제로 토큰 해제를 확인하지 못하면 로그아웃을 중단하고 재시도를 안내합니다. Firestore 삭제가 오프라인 대기 중이더라도 네이티브 토큰 해제를 먼저 확인하며, 서버는 더 이상 유효하지 않은 토큰을 정리합니다.

## FCM 구현 및 검증 범위

- Firestore `chatThreads/{threadId}/chatMessages/{messageId}` 생성만 트리거합니다. 정확히 두 명의 참여자, 발신자 참여 여부, 24시간 유효 기간을 검사하고 상대방 기기에만 보냅니다. 저장된 채팅 메시지는 푸시 실패 시에도 수정하거나 삭제하지 않습니다.
- 서버는 상대방의 Android 토큰들을 500개 이하 묶음으로 전송합니다. `registration-token-not-registered`와 `invalid-registration-token`만 삭제하며, 전송 중 새 토큰으로 갱신된 문서는 삭제하지 않습니다.
- 시스템 알림은 foreground/background 모두 FCM 하나만 사용합니다. 재시도는 성공 기기별 영수증과 전송 임대 문서로 중복을 줄이고, 같은 메시지는 같은 Android 알림 태그를 사용합니다. 서버 전송 직후 기록 전 장애처럼 FCM과 Firestore 사이의 완전한 원자성이 없는 경우까지 정확히 한 번 전달을 보장하지는 않습니다.
- 알림 data는 `type: chat`, `threadId`만 포함합니다. 서버 중복 방지 문서는 클라이언트에서 접근할 수 없습니다. 관리자 자격 증명은 앱에 저장하지 않습니다.
- 공식 플러그인의 `unregister()`는 Firebase 토큰 삭제 완료를 기다리지 않고 반환합니다. 작은 네이티브 `NyamPushToken` 보조 플러그인이 로그아웃/OFF에서 실제 삭제 완료를 확인합니다. 토큰 발급·권한·수신·알림 탭 처리는 공식 Push Notifications 플러그인을 사용합니다.
- 로그인/회원가입/자동 로그인, 생체 잠금의 프로세스 수명 정책, 레시피 CRUD/사진/동기화, 친구 코드/공유, 메시지 송수신/안읽음/24시간 만료, 백업/복원과 기존 UI 배치는 유지합니다.

자동 테스트는 로직과 로컬 Firestore 규칙을 확인하며 APK도 빌드할 수 있습니다. 실제 프로젝트의 Functions 배포, 실기기 FCM 수신/권한/지문/알림 소리는 배포 후 위 절차로 추가 검증해야 합니다. 현재 설정 파일 없는 빌드 결과만으로 실기기 푸시 작동을 확인했다고 볼 수 없습니다.

공식 문서: [Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications), [Android FCM 수신](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Firestore Functions 트리거](https://firebase.google.com/docs/functions/firestore-events), [FCM 토큰 관리](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

## 이번 변경 파일과 검증 결과 (2026-10-05)

| 범위 | 변경/추가 파일 |
| --- | --- |
| 앱 | `src/message-alerts.js`, `src/chat.js`, `src/cloud.js`, `src/biometric.js`, `index.html`, `cloud.bundle.js` |
| Android | `android/app/src/main/java/com/nyam/recipebook/MainActivity.java`, `BiometricPlugin.java`, `PushTokenPlugin.java`(같은 디렉터리), `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`, `capacitor.config.json` |
| 서버 | `functions/index.cjs`, `functions/chat-push.cjs`, `functions/push-logic.cjs`, `functions/package.json`, `functions/package-lock.json`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` |
| 테스트 | `tests/push-client.test.mjs`, `tests/chat-flow.test.mjs`, `tests/cloud-flow.test.mjs`, `tests/native-features.test.mjs`, `tests/emulator/push-rules.test.mjs`, `functions/test/chat-push.test.cjs` |
| 빌드·문서 | `scripts/build.mjs`, `package.json`, `package-lock.json`, `.gitignore`, `README.md` |

- `npm test`: 기존 회귀 테스트와 FCM 로직 **49개 통과**. 이 수에는 서버 테스트 9개가 포함됩니다.
- `npm --prefix functions test`: 서버 테스트 **9개 통과**.
- `npm run test:rules`: 실제 로컬 Firestore 에뮬레이터에서 **6개 통과**. 타 사용자 접근 거부, 입력 검증, 기존 프로필/레시피/공유/채팅/만료 규칙을 확인했습니다.
- 실제 Firebase Functions SDK로 함수 정의를 로딩해 `gcfv2`임을 확인했습니다. 실제 서버에는 배포하지 않았습니다.
- 실제 설정 파일을 만들지 않고 메모리의 빌드 옵션으로 **FCM 활성 경로의 번들 컴파일**도 확인했습니다.
- `powershell -ExecutionPolicy Bypass -File scripts/build-apk.ps1`: **APK 빌드 성공**. `com.nyam.recipebook`, versionCode **4**, versionName **1.3**, 앱 이름과 `POST_NOTIFICATIONS` 권한을 확인했습니다. APK 서명 검증도 통과했습니다.
- `npm audit`와 `npm audit --prefix functions`: 앱과 서버의 고정 의존성에서 **알려진 취약점 0개**. 에뮬레이터용 Firebase CLI는 앱 의존성에서 분리해 필요할 때 고정 버전으로 실행합니다.
- `google-services.json` 다운로드/서버 배포/실기기 알림 수신은 아직 미실행입니다. 현재 APK는 설정 파일 없는 기능 확인용이며, 실제 푸시는 위 설정 완료 후 재빌드 및 실기기 검증이 필요합니다.
