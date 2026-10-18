package com.lifetempo.app;

import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/** Explicit, app-owned PendingIntents; separate from launcher widget lifecycle broadcasts. */
public final class CalendarWidgetActionsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        handleAction(context, intent);
    }

    static void handleAction(Context context, Intent intent) {
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        String action = intent.getAction();
        android.util.Log.i("LifeTempoWidget", "Calendar tap received: " + id + " " + action);
        int[] installed = AppWidgetManager.getInstance(context).getAppWidgetIds(
                new ComponentName(context, CalendarWidgetProvider.class));
        boolean valid = false;
        for (int widgetId : installed) if (widgetId == id) valid = true;
        if (!valid) {
            android.util.Log.w("LifeTempoWidget", "Calendar tap has stale widget ID: " + id);
            HomeWidgetRenderer.refreshAll(context);
            return;
        }
        if (CalendarWidgetProvider.ACTION_TODAY.equals(action)) HomeWidgetRenderer.resetCalendarMonth(context, id);
        else if (CalendarWidgetProvider.ACTION_PREVIOUS_MONTH.equals(action)) HomeWidgetRenderer.shiftCalendarMonth(context, id, -1);
        else if (CalendarWidgetProvider.ACTION_NEXT_MONTH.equals(action)) HomeWidgetRenderer.shiftCalendarMonth(context, id, 1);
        else return;
        android.util.Log.i("LifeTempoWidget", "Calendar widget updated: " + id);
    }
}
