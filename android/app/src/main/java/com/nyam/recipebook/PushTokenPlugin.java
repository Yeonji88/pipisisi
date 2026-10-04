package com.nyam.recipebook;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

// Capacitor's unregister() resolves before deleteToken() completes. For logout,
// wait for Firebase's actual acknowledgement so failure cannot silently leak alerts.
@CapacitorPlugin(name="NyamPushToken")
public class PushTokenPlugin extends Plugin {
    @PluginMethod public void revoke(PluginCall call) {
        try {
            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(false);
            messaging.deleteToken().addOnCompleteListener(task -> {
                if (task.isSuccessful()) call.resolve();
                else call.reject("알림 기기 해제에 실패했어요. 인터넷 연결 후 다시 시도해주세요.");
            });
        } catch (Exception error) {
            call.reject("알림 기기 해제에 실패했어요. 앱 설정을 확인해주세요.");
        }
    }
}
