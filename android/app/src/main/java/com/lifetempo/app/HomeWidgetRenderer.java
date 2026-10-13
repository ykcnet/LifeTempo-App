package com.lifetempo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class HomeWidgetRenderer {
    private HomeWidgetRenderer() {}

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] eventIds = manager.getAppWidgetIds(new ComponentName(context, TodayEventsWidgetProvider.class));
        int[] taskIds = manager.getAppWidgetIds(new ComponentName(context, TodoWidgetProvider.class));
        update(context, manager, eventIds, false);
        update(context, manager, taskIds, true);
    }

    static void update(Context context, AppWidgetManager manager, int[] ids, boolean todo) {
        if (ids == null || ids.length == 0) return;
        String json = todo ? WidgetDataStore.tasks(context) : WidgetDataStore.events(context);
        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            int height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 100);
            int rowLimit = Math.max(1, Math.min(8, (height - 50) / 27));
            RemoteViews views = new RemoteViews(context.getPackageName(), todo ? R.layout.widget_todo : R.layout.widget_today);
            views.setTextViewText(R.id.widget_title, todo ? "待辦事項" : "今日行程");
            views.setTextViewText(R.id.widget_content, content(json, todo, rowLimit));

            Intent open = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra("widget", todo ? "todo" : "today");
            PendingIntent pending = PendingIntent.getActivity(context, todo ? 2 : 1, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }

    private static String content(String json, boolean todo, int limit) {
        try {
            JSONArray rows = new JSONArray(json);
            List<JSONObject> visible = new ArrayList<>();
            LocalDate today = LocalDate.now();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null) continue;
                if (todo) {
                    if (!item.optBoolean("done", false)) visible.add(item);
                } else {
                    String date = item.optString("date", "");
                    if (!date.isEmpty() && !LocalDate.parse(date).isBefore(today)) visible.add(item);
                }
            }
            if (!todo) visible.sort(Comparator.comparing(item -> item.optString("date") + "T" + item.optString("start")));
            List<String> lines = new ArrayList<>();
            for (JSONObject item : visible) {
                if (lines.size() >= limit) break;
                String title = item.optString("title", "").trim();
                if (title.isEmpty()) continue;
                if (todo) {
                    String due = item.optString("due", "");
                    String dueLabel = due.length() >= 10 ? due.substring(5, 10) + "  " : "";
                    lines.add(dueLabel + "• " + title);
                } else {
                    String date = item.optString("date", "");
                    String time = item.optBoolean("allDay", false) ? "全天" : item.optString("start", "");
                    lines.add((date.equals(today.toString()) ? time : date.substring(5) + " " + time) + "  " + title);
                }
            }
            if (!lines.isEmpty()) return String.join("\n", lines);
            return todo ? "目前沒有待辦事項" : "近期沒有行程";
        } catch (Exception error) {
            return todo ? "無法讀取待辦事項" : "無法讀取行程";
        }
    }
}