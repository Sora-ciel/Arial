package com.sora.arial;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Registered before the bridge starts so the web layer can call it
        // as soon as it loads.
        registerPlugin(MediaNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
