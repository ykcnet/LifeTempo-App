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
        if (eventsJson == null || tasksJson == null || eventsJson.length() > 20_000_000 || tasksJson.length() > 250_000) return;
        WidgetDataStore.update(context, eventsJson, tasksJson, weekStart);
    }

    @JavascriptInterface
    public void updateSnapshot(String eventsJson, String tasksJson, int weekStart, String daysJson) {
        if (eventsJson == null || tasksJson == null || eventsJson.length() > 20_000_000 || tasksJson.length() > 250_000) return;
        if (daysJson != null && daysJson.length() > 200_000) daysJson = null;
        WidgetDataStore.update(context, eventsJson, tasksJson, weekStart, daysJson);
    }

    /** JSON array of todo edits made on the home-screen widget; cleared once read. */
    @JavascriptInterface
    public String takeTodoOps() {
        return WidgetDataStore.takeTodoOps(context);
    }
}
