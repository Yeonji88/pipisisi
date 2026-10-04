package com.nyam.recipebook;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="NyamBiometric")
public class BiometricPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        MainActivity activity = (MainActivity)getActivity();
        JSObject result = new JSObject();
        result.put("available",activity.biometricAvailable()); result.put("enabled",activity.biometricEnabled()); call.resolve(result);
    }
    @PluginMethod public void toggle(PluginCall call) {
        MainActivity activity = (MainActivity)getActivity();
        getActivity().runOnUiThread(() -> activity.authenticate((success,message) -> {
            if (!success) { call.reject(message); return; }
            boolean enabled = !activity.biometricEnabled(); activity.setBiometricEnabled(enabled);
            JSObject result = new JSObject(); result.put("enabled",enabled); call.resolve(result);
        }));
    }
    // Disabling after logout is safe: the Firebase session has already been removed.
    @PluginMethod public void loggedOut(PluginCall call) {
        getActivity().runOnUiThread(() -> { ((MainActivity)getActivity()).setBiometricEnabled(false); call.resolve(); });
    }
}
