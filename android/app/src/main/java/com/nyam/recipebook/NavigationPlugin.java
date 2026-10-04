package com.nyam.recipebook;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.view.View;

@CapacitorPlugin(name="NyamNavigation")
public class NavigationPlugin extends Plugin {
    @PluginMethod public void consumeKeyboardBack(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            View view = getActivity().getWindow().getDecorView();
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(view);
            boolean visible = insets != null && insets.isVisible(WindowInsetsCompat.Type.ime());
            if (visible) {
                WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getActivity().getWindow(), view);
                controller.hide(WindowInsetsCompat.Type.ime());
            }
            JSObject result = new JSObject(); result.put("consumed", visible); call.resolve(result);
        });
    }
}
