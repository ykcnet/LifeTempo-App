package com.lifetempo.app;

import android.content.Context;
import android.content.SharedPreferences;

public final class WidgetDataStore {
    private static final String PREFS = "lifetempo_widgets";

    private WidgetDataStore() {}

    public static void update(Context context, String eventsJson, String tasksJson, int weekStart) {
        update(context, eventsJson, tasksJson, weekStart, null);
    }

    public static void update(Context context, String eventsJson, String tasksJson, int weekStart, String daysJson) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = preferences.edit().putString("events", eventsJson).putString("tasks", tasksJson)
                .putInt("weekStart", weekStart == 1 ? 1 : 0);
        if (daysJson != null) editor.putString("days", daysJson);
        editor.apply();
        HomeWidgetRenderer.refreshAll(context);
    }

    static String days(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("days", "{}");
    }

    static String events(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("events", "[]");
    }

    static String tasks(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("tasks", "[]");
    }
}