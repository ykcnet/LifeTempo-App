package com.lifetempo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class HomeWidgetRenderer {
    private static final String CALENDAR_MONTH_KEY = "calendarMonth.";

    private HomeWidgetRenderer() {}

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] eventIds = manager.getAppWidgetIds(new ComponentName(context, TodayEventsWidgetProvider.class));
        int[] taskIds = manager.getAppWidgetIds(new ComponentName(context, TodoWidgetProvider.class));
        int[] calendarIds = manager.getAppWidgetIds(new ComponentName(context, CalendarWidgetProvider.class));
        update(context, manager, eventIds, false);
        update(context, manager, taskIds, true);
        updateCalendar(context, manager, calendarIds);
    }

    static void updateCalendar(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        java.util.Map<String, List<JSONObject>> eventsByDate = new java.util.HashMap<>();
        try {
            JSONArray rows = new JSONArray(WidgetDataStore.events(context));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                String date = item == null ? "" : item.optString("date", "");
                if (date.matches("\\d{4}-\\d{2}-\\d{2}")) {
                    if (!item.optString("title", "").trim().isEmpty()) {
                        eventsByDate.computeIfAbsent(date, ignored -> new ArrayList<>()).add(item);
                    }
                }
            }
        } catch (Exception ignored) {}

        LocalDate today = LocalDate.now();
        int weekStart = context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE)
                .getInt("weekStart", 0);

        for (int id : ids) {
            LocalDate displayedMonth = displayedCalendarMonth(context, id, today);
            LocalDate first = displayedMonth.withDayOfMonth(1);
            int firstDay = first.getDayOfWeek().getValue() % 7;
            LocalDate gridStart = first.minusDays((firstDay - weekStart + 7) % 7);
            Bundle options = manager.getAppWidgetOptions(id);
            int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 200);
            float dayTextSize = minWidth < 230 ? 9f : 12f;
            float weekdayTextSize = minWidth < 230 ? 8f : 10f;
            if (minHeight < 150) dayTextSize = 8f;
            int eventLimit = minHeight < 270 ? 1 : minHeight < 420 ? 2 : 3;

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);
                views.setTextViewText(R.id.widget_title, displayedMonth.getYear() + " 年 " + displayedMonth.getMonthValue() + " 月");
                views.setOnClickPendingIntent(R.id.calendar_month_prev,
                    calendarMonthIntent(context, id, CalendarWidgetProvider.ACTION_PREVIOUS_MONTH, false));
                views.setOnClickPendingIntent(R.id.calendar_month_next,
                    calendarMonthIntent(context, id, CalendarWidgetProvider.ACTION_NEXT_MONTH, true));

            String[] weekdays = weekStart == 1
                    ? new String[]{"一", "二", "三", "四", "五", "六", "日"}
                    : new String[]{"日", "一", "二", "三", "四", "五", "六"};
            views.removeAllViews(R.id.calendar_weekdays);
            for (String weekday : weekdays) {
                RemoteViews label = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_weekday);
                label.setTextViewText(R.id.calendar_weekday, weekday);
                label.setTextViewTextSize(R.id.calendar_weekday, 2, weekdayTextSize);
                views.addView(R.id.calendar_weekdays, label);
            }

            views.removeAllViews(R.id.calendar_days);
            for (int week = 0; week < 6; week++) {
                RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_week);
                for (int day = 0; day < 7; day++) {
                    LocalDate date = gridStart.plusDays(week * 7L + day);
                    RemoteViews cell = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_day);
                    List<JSONObject> dayEvents = eventsByDate.getOrDefault(date.toString(), new ArrayList<>());
                    cell.setTextViewText(R.id.calendar_day, String.valueOf(date.getDayOfMonth()));
                    cell.setTextViewTextSize(R.id.calendar_day, 2, dayTextSize);
                    int textColor = date.getYear() == today.getYear() && date.getMonth() == today.getMonth() ? 0xFF303744 : 0xFF9AA1AE;
                    if (date.equals(today)) textColor = Color.WHITE;
                    cell.setTextColor(R.id.calendar_day, textColor);
                    cell.setInt(R.id.calendar_day_cell, "setBackgroundResource", R.drawable.widget_calendar_cell);
                    cell.setInt(R.id.calendar_day, "setBackgroundResource", date.equals(today) ? R.drawable.widget_calendar_today : 0);
                    int visibleEvents = Math.min(dayEvents.size(), eventLimit);
                    if (dayEvents.size() > eventLimit && visibleEvents > 0) visibleEvents--;
                    for (int eventIndex = 0; eventIndex < visibleEvents; eventIndex++) {
                        JSONObject item = dayEvents.get(eventIndex);
                        RemoteViews eventView = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_event);
                        eventView.setTextViewText(R.id.calendar_event, item.optString("title", "").trim());
                        eventView.setInt(R.id.calendar_event, "setBackgroundColor", eventTint(item.optString("color", "")));
                        cell.addView(R.id.calendar_day_events, eventView);
                    }
                    if (dayEvents.size() > eventLimit) {
                        RemoteViews overflow = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_event);
                        overflow.setTextViewText(R.id.calendar_event, "+" + (dayEvents.size() - visibleEvents) + " 項");
                        overflow.setTextColor(R.id.calendar_event, 0xFF586174);
                        overflow.setInt(R.id.calendar_event, "setBackgroundColor", 0xFFE8EBF0);
                        cell.addView(R.id.calendar_day_events, overflow);
                    }
                    row.addView(R.id.calendar_week_row, cell);
                }
                views.addView(R.id.calendar_days, row);
            }

            Intent open = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra("widget", "calendar");
            PendingIntent pending = PendingIntent.getActivity(context, 3, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }

    static void shiftCalendarMonth(Context context, int id, int amount) {
        LocalDate today = LocalDate.now();
        LocalDate nextMonth = displayedCalendarMonth(context, id, today).plusMonths(amount);
        context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE).edit()
                .putString(CALENDAR_MONTH_KEY + id, nextMonth.withDayOfMonth(1).toString()).apply();
        updateCalendar(context, AppWidgetManager.getInstance(context), new int[]{id});
    }

    private static LocalDate displayedCalendarMonth(Context context, int id, LocalDate today) {
        String month = context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE)
                .getString(CALENDAR_MONTH_KEY + id, "");
        try {
            return month.isEmpty() ? today.withDayOfMonth(1) : LocalDate.parse(month).withDayOfMonth(1);
        } catch (RuntimeException ignored) {
            return today.withDayOfMonth(1);
        }
    }

    private static PendingIntent calendarMonthIntent(Context context, int id, String action, boolean next) {
        String direction = next ? "next" : "previous";
        Intent intent = new Intent(context, CalendarWidgetProvider.class).setAction(action)
                .setData(Uri.parse("lifetempo://calendar/" + id + "/" + direction))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(context, id * 2 + (next ? 1 : 0), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static int eventTint(String value) {
        if (!value.matches("#[A-Fa-f0-9]{6}")) return 0xFFE4F1E5;
        int color = Color.parseColor(value);
        return Color.rgb((Color.red(color) + 765) / 4, (Color.green(color) + 765) / 4, (Color.blue(color) + 765) / 4);
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