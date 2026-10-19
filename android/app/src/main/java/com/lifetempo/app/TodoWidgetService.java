package com.lifetempo.app;

import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.Collections;
import java.util.List;

/** Collection adapter for Android 8–11; newer versions receive inline collection items. */
public final class TodoWidgetService extends RemoteViewsService {
    @Override public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new RemoteViewsFactory() {
            private List<org.json.JSONObject> rows = Collections.emptyList();
            public void onCreate() { onDataSetChanged(); }
            public void onDataSetChanged() { rows = HomeWidgetRenderer.todoRows(TodoWidgetService.this); }
            public void onDestroy() { rows = Collections.emptyList(); }
            public int getCount() { return rows.size(); }
            public RemoteViews getViewAt(int position) {
                if (position < 0 || position >= rows.size()) return null;
                return HomeWidgetRenderer.todoRow(TodoWidgetService.this, rows.get(position));
            }
            public RemoteViews getLoadingView() { return null; }
            public int getViewTypeCount() { return 1; }
            public long getItemId(int position) { return position; }
            public boolean hasStableIds() { return false; }
        };
    }
}
