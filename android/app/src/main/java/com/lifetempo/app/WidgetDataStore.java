package com.lifetempo.app;

import android.content.Context;
import android.content.SharedPreferences;

public final class WidgetDataStore {
    private static final String PREFS = "lifetempo_widgets";

    private WidgetDataStore() {}

    public static void update(Context context, String eventsJson, String tasksJson) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        preferences.edit().putString("events", eventsJson).putString("tasks", tasksJson).apply();
        HomeWidgetRenderer.refreshAll(context);
    }

    static String events(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", "[]");
    }

    static String tasks(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("tasks", "[]");
    }
}