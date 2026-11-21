package com.zoomtech.pdv;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.util.DisplayMetrics;
import android.os.Build;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersiveMode();
        getBridge().getWebView().addJavascriptInterface(new DeviceInfoInterface(), "ZoomDevice");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    private void enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }

    private class DeviceInfoInterface {
        @JavascriptInterface
        public String getDeviceInfo() {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            String systemVersion = Build.VERSION.RELEASE;
            String platform = "Android";
            String json = "{"
                + "\"brand\":\"" + escape(Build.BRAND) + "\","
                + "\"manufacturer\":\"" + escape(Build.MANUFACTURER) + "\","
                + "\"model\":\"" + escape(Build.MODEL) + "\","
                + "\"hardware\":\"" + escape(Build.HARDWARE) + "\","
                + "\"product\":\"" + escape(Build.PRODUCT) + "\","
                + "\"platform\":\"" + platform + "\","
                + "\"system\":\"" + platform + "\","
                + "\"systemVersion\":\"" + escape(systemVersion) + "\","
                + "\"sdk\":\"" + Build.VERSION.SDK_INT + "\","
                + "\"width\":" + metrics.widthPixels + ","
                + "\"height\":" + metrics.heightPixels
                + "}";
            return json;
        }

        private String escape(String value) {
            if (value == null) return "";
            return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", " ")
                .replace("\r", " ");
        }
    }
}
