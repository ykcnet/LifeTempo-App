package com.lifetempo.app;

import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.Collections;
import java.util.List;

/** Collection adapter for Android 8–11; newer versions receive inline collection items. */
public final class UpcomingWidgetService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            private List<org.json.JSONObject> rows = Collections.emptyList();
            public void onCreate() { onDataSetChanged(); }
            public void onDataSetChanged() {
                rows = HomeWidgetRenderer.upcomingEvents(UpcomingWidgetService.this, intent.getIntExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID, -1));
            }
            public void onDestroy() { rows = Collections.emptyList(); }
            public int getCount() { return rows.size(); }
            public RemoteViews getViewAt(int position) {
                if (position < 0 || position >= rows.size()) return null;
                return HomeWidgetRenderer.upcomingRow(UpcomingWidgetService.this, rows.get(position), position, intent.getIntExtra(android.appwidget.AppWidgetManager.EXTRA_APPWIDGET_ID, -1));
            }
            public RemoteViews getLoadingView() { return null; }
            public int getViewTypeCount() { return 1; }
            public long getItemId(int position) { return position; }
            public boolean hasStableIds() { return false; }
        };
    }
}
