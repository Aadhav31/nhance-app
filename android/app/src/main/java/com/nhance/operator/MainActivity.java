package com.nhance.operator;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERM_REQUEST = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestAppPermissions();
    }

    /**
     * Request all runtime permissions the app needs.
     * Called once on startup; Android only prompts the user for permissions
     * that haven't been granted yet.
     */
    private void requestAppPermissions() {
        List<String> toRequest = new ArrayList<>();

        // Core permissions always needed
        String[] always = {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.MODIFY_AUDIO_SETTINGS,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        };

        for (String perm : always) {
            if (ContextCompat.checkSelfPermission(this, perm)
                    != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(perm);
            }
        }

        // Android 13+ requires explicit POST_NOTIFICATIONS permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        // Storage — only needed below Android 10 for writes, Android 13 uses scoped storage
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                toRequest.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!toRequest.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                toRequest.toArray(new String[0]),
                PERM_REQUEST
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode,
                                           String[] permissions,
                                           int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Capacitor bridge handles its own permissions; we just let super propagate.
        // Any denied permissions that are truly required will surface as errors in the web layer.
    }
}
