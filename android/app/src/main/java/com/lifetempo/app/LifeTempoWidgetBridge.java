package com.lifetempo.app;

import android.content.Context;
import android.webkit.JavascriptInterface;

public final class LifeTempoWidgetBridge {
    private final Context context;

    public LifeTempoWidgetBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void updateSnapshot(String eventsJson, String tasksJson, int weekStart) {
        if (eventsJson == null || tasksJson == null || eventsJson.length() > 1_000_000 || tasksJson.length() > 250_000) return;
        WidgetDataStore.update(context, eventsJson, tasksJson, weekStart);
    }
}