package com.lifetempo.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

public final class CalendarWidgetProvider extends AppWidgetProvider {
    static final String ACTION_PREVIOUS_MONTH = "com.ykcnet.lifetempo.widget.PREVIOUS_MONTH";
    static final String ACTION_NEXT_MONTH = "com.ykcnet.lifetempo.widget.NEXT_MONTH";

    @Override
    public void onReceive(Context context, android.content.Intent intent) {
        String action = intent.getAction();
        if (ACTION_PREVIOUS_MONTH.equals(action) || ACTION_NEXT_MONTH.equals(action)) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                HomeWidgetRenderer.shiftCalendarMonth(context, id,
                        ACTION_PREVIOUS_MONTH.equals(action) ? -1 : 1);
            }
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgetRenderer.updateCalendar(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        HomeWidgetRenderer.updateCalendar(context, manager, new int[]{id});
    }
}
