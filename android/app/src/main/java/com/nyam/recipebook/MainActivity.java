package com.nyam.recipebook;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.annotation.NonNull;

public class MainActivity extends BridgeActivity {
    private View lockView;
    // Kept only in process memory: background/resume and activity recreation
    // preserve authentication; a new process always starts locked.
    private static boolean unlockedForProcess = false;
    private boolean authenticating = false;
    interface AuthResult { void complete(boolean success, String message); }
    boolean biometricEnabled() { return getSharedPreferences("nyam-lock", MODE_PRIVATE).getBoolean("enabled", false); }
    boolean biometricAvailable() { return BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS; }
    void setBiometricEnabled(boolean enabled) {
        getSharedPreferences("nyam-lock", MODE_PRIVATE).edit().putBoolean("enabled", enabled).apply();
        unlock();
    }
    @Override public void onCreate(Bundle state) {
        registerPlugin(BiometricPlugin.class);
        super.onCreate(state);
        if (biometricEnabled() && !unlockedForProcess) showLock();
    }
    @Override public void onResume() {
        super.onResume();
        if (biometricEnabled() && !unlockedForProcess) { showLock(); getWindow().getDecorView().post(this::unlockWithBiometric); }
    }
    private void unlock() {
        unlockedForProcess = true;
        if (lockView != null) { ((FrameLayout)findViewById(android.R.id.content)).removeView(lockView); lockView = null; }
    }
    private void showLock() {
        if (lockView != null) return;
        FrameLayout root = findViewById(android.R.id.content);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER); panel.setPadding(40, 40, 40, 40);
        panel.setBackgroundColor(Color.rgb(255,248,239)); panel.setClickable(true); panel.setFocusable(true);
        TextView title = new TextView(this); title.setText("냠냠 레시피북 🍳\n지문으로 잠금을 해제해주세요"); title.setTextSize(22); title.setGravity(Gravity.CENTER); title.setTextColor(Color.rgb(81,72,63));
        Button unlockButton = new Button(this); unlockButton.setText("지문으로 열기"); unlockButton.setOnClickListener(v -> unlockWithBiometric());
        Button emailButton = new Button(this); emailButton.setText("로그아웃하고 이메일로 로그인");
        emailButton.setOnClickListener(v -> { if (bridge != null) bridge.triggerWindowJSEvent("nyamBiometricLogout"); });
        panel.addView(title); panel.addView(unlockButton); panel.addView(emailButton);
        root.addView(panel, new FrameLayout.LayoutParams(-1,-1)); lockView = panel;
    }
    private void unlockWithBiometric() { authenticate((success,message) -> { if (success) unlock(); }); }
    void authenticate(AuthResult result) {
        if (authenticating) { result.complete(false,"생체인증이 진행 중입니다."); return; }
        if (!biometricAvailable()) { result.complete(false,"휴대폰 설정에서 지문을 등록해주세요."); return; }
        authenticating = true;
        BiometricPrompt prompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(this), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult authentication) { authenticating = false; result.complete(true, ""); }
            @Override public void onAuthenticationError(int code, @NonNull CharSequence error) { authenticating = false; result.complete(false, error.toString()); }
        });
        prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("냠냠 레시피북 잠금 해제").setSubtitle("등록된 지문 등 생체인증을 확인합니다").setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG).setNegativeButtonText("취소").build());
    }
}
