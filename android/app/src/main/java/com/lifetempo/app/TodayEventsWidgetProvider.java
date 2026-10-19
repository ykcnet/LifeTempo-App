package com.lifetempo.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

public final class TodayEventsWidgetProvider extends AppWidgetProvider {
    static final String ACTION_SETTINGS = "com.lifetempo.app.action.UPCOMING_SETTINGS";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgetRenderer.update(context, manager, ids, false);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        HomeWidgetRenderer.update(context, manager, new int[]{id}, false);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || !ACTION_SETTINGS.equals(intent.getAction())) return;
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        Intent settings = new Intent(context, UpcomingWidgetSettingsActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        context.startActivity(settings);
    }
}
