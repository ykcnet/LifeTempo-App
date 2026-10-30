package com.lifetempo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableString;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class HomeWidgetRenderer {
    private static final String CALENDAR_MONTH_KEY = "calendarMonth.";
    private static final int COLOR_OFF = 0xFFD64545;

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

        JSONObject dayInfo = new JSONObject();
        try { dayInfo = new JSONObject(WidgetDataStore.days(context)); } catch (Exception ignored) {}

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
            float dayTextSize = minWidth < 230 ? 10f : 12f;
            float weekdayTextSize = minWidth < 230 ? 9f : 11f;
            float subTextSize = minWidth < 230 ? 7f : 8f;
            if (minHeight < 150) dayTextSize = 9f;
            int eventLimit = minHeight < 270 ? 1 : minHeight < 420 ? 2 : 3;

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);
                views.setTextViewText(R.id.widget_title, displayedMonth.getYear() + " 年 " + displayedMonth.getMonthValue() + " 月");
                views.setOnClickPendingIntent(R.id.calendar_month_prev,
                    calendarMonthIntent(context, id, CalendarWidgetProvider.ACTION_PREVIOUS_MONTH, false));
                views.setOnClickPendingIntent(R.id.calendar_month_next,
                    calendarMonthIntent(context, id, CalendarWidgetProvider.ACTION_NEXT_MONTH, true));
                views.setOnClickPendingIntent(R.id.calendar_month_today,
                    calendarMonthIntent(context, id, CalendarWidgetProvider.ACTION_TODAY, false));

            String[] weekdays = weekStart == 1
                    ? new String[]{"一", "二", "三", "四", "五", "六", "日"}
                    : new String[]{"日", "一", "二", "三", "四", "五", "六"};
            views.removeAllViews(R.id.calendar_weekdays);
            for (String weekday : weekdays) {
                RemoteViews label = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_weekday);
                label.setTextViewText(R.id.calendar_weekday, weekday);
                label.setTextViewTextSize(R.id.calendar_weekday, 2, weekdayTextSize);
                if (weekday.equals("日") || weekday.equals("六")) label.setTextColor(R.id.calendar_weekday, COLOR_OFF);
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
                    int textColor = date.getYear() == displayedMonth.getYear() && date.getMonth() == displayedMonth.getMonth() ? 0xFF303744 : 0xFFB3B9C4;
                    JSONObject info = dayInfo.optJSONObject(date.toString());
                    boolean weekend = date.getDayOfWeek().getValue() >= 6;
                    boolean off = info != null ? info.optInt("o", weekend ? 1 : 0) == 1 : weekend;
                    String sub = info == null ? "" : info.optString("s", "");
                    boolean special = info != null && info.optInt("x", 0) == 1;
                    boolean inMonth = date.getMonth() == displayedMonth.getMonth();
                    if (off && inMonth) textColor = COLOR_OFF;
                    else if (off) textColor = 0xFFE8B4B0;
                    if (date.equals(today)) textColor = Color.WHITE;
                    cell.setTextColor(R.id.calendar_day, textColor);
                    cell.setTextViewText(R.id.calendar_sub, sub);
                    cell.setTextViewTextSize(R.id.calendar_sub, 2, subTextSize);
                    cell.setTextColor(R.id.calendar_sub, !inMonth ? 0xFFB3B9C4 : special ? (off ? COLOR_OFF : 0xFF2E7D4F) : 0xFF8A91A0);
                    cell.setInt(R.id.calendar_day_cell, "setBackgroundResource", off && inMonth ? R.drawable.widget_calendar_off : R.drawable.widget_calendar_cell);
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
                    .setData(Uri.parse("lifetempo://calendar-open/" + id))
                    .putExtra("widget", "calendar")
                    .putExtra("widgetDate", displayedMonth.toString());
            PendingIntent pending = PendingIntent.getActivity(context, 3, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            // Keep the month controls outside the app-launch click target.
            views.setOnClickPendingIntent(R.id.widget_title, pending);
            views.setOnClickPendingIntent(R.id.calendar_days, pending);
            manager.updateAppWidget(id, views);
        }
    }

    static void resetCalendarMonth(Context context, int id) {
        context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE).edit()
                .remove(CALENDAR_MONTH_KEY + id).apply();
        updateCalendar(context, AppWidgetManager.getInstance(context), new int[]{id});
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
        Intent intent = new Intent(context, CalendarWidgetActionActivity.class).setAction(action)
                .setData(Uri.parse("lifetempo://calendar-action/" + id + "/" + action))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        int slot = CalendarWidgetProvider.ACTION_TODAY.equals(action) ? 2 : next ? 1 : 0;
        return PendingIntent.getActivity(context, id * 3 + slot, intent,
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
            RemoteViews views = new RemoteViews(context.getPackageName(), todo ? R.layout.widget_todo : R.layout.widget_today);
            views.setTextViewText(R.id.widget_title, todo ? "待辦事項" : "近日行程");
            if (todo) bindTodo(context, views, id);
            else views.setTextViewText(R.id.widget_content, content(json, false, 8));

            Intent open = new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    .putExtra("widget", todo ? "todo" : "today")
                                        .putExtra("widgetView", todo ? "todo" : "upcoming");
            if (!todo) {
                List<JSONObject> nearest = upcoming(json, 1);
                if (!nearest.isEmpty()) open.putExtra("widgetDate", nearest.get(0).optString("date", ""));
            }
            PendingIntent pending = PendingIntent.getActivity(context, todo ? 2 : 1, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
            manager.updateAppWidget(id, views);
            if (todo && android.os.Build.VERSION.SDK_INT < 31) manager.notifyAppWidgetViewDataChanged(id, R.id.widget_todo_rows);
        }
    }

    private static void bindTodo(Context context, RemoteViews views, int id) {
        Intent add = new Intent(context, TodoAddActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .setData(Uri.parse("lifetempo://todo-add/" + id))
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        views.setOnClickPendingIntent(R.id.widget_todo_add, PendingIntent.getActivity(context, id, add,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent template = new Intent(context, TodoWidgetActionActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                .setData(Uri.parse("lifetempo://todo-action/" + id));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
        views.setPendingIntentTemplate(R.id.widget_todo_rows, PendingIntent.getActivity(context, id, template, flags));
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            RemoteViews.RemoteCollectionItems.Builder items = new RemoteViews.RemoteCollectionItems.Builder()
                    .setViewTypeCount(1);
            List<JSONObject> rows = todoRows(context);
            for (int i = 0; i < rows.size(); i++) items.addItem(i, todoRow(context, rows.get(i)));
            views.setRemoteAdapter(R.id.widget_todo_rows, items.build());
        } else {
            Intent adapter = new Intent(context, TodoWidgetService.class)
                    .setData(Uri.parse("lifetempo://todo-adapter/" + id))
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            views.setRemoteAdapter(R.id.widget_todo_rows, adapter);
        }
    }

    static List<JSONObject> todoRows(Context context) {
        List<JSONObject> result = new ArrayList<>();
        try {
            JSONArray rows = new JSONArray(WidgetDataStore.tasks(context));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject task = rows.optJSONObject(i);
                if (task == null || task.optBoolean("done", false)) continue;
                if (task.optString("id").isEmpty() || task.optString("title").trim().isEmpty()) continue;
                result.add(task);
            }
        } catch (Exception ignored) {}
        if (result.isEmpty()) {
            JSONObject empty = new JSONObject();
            try { empty.put("title", "目前沒有待辦事項"); } catch (Exception ignored) {}
            result.add(empty);
        }
        return result;
    }

    static RemoteViews todoRow(Context context, JSONObject task) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_todo_row);
        String id = task.optString("id");
        boolean real = !id.isEmpty();
        String title = task.optString("title").trim();
        if (real && task.optBoolean("widgetPlan", false)) title = "◷ " + title;
        String due = task.optString("due");
        row.setTextViewText(R.id.widget_todo_text, title);
        row.setTextViewText(R.id.widget_todo_due, real && due.length() >= 10 ? due.substring(5, 10) : "");
        row.setViewVisibility(R.id.widget_todo_due, real && due.length() >= 10 ? android.view.View.VISIBLE : android.view.View.GONE);
        row.setViewVisibility(R.id.widget_todo_check, real ? android.view.View.VISIBLE : android.view.View.GONE);
        if (real) {
            row.setOnClickFillInIntent(R.id.widget_todo_check,
                    new Intent().putExtra("todoAction", "toggle").putExtra("todoId", id));
        }
        row.setOnClickFillInIntent(R.id.widget_todo_body, new Intent().putExtra("todoAction", "open"));
        return row;
    }

    static List<JSONObject> upcomingEvents(Context context, int widgetId) {
        List<JSONObject> result = new ArrayList<>();
        try {
            JSONArray rows = new JSONArray(WidgetDataStore.events(context));
            for (int i = 0; i < rows.length(); i++) {
                JSONObject event = rows.optJSONObject(i);
                if (event == null || event.optString("title").trim().isEmpty()) continue;
                try {
                    if (!LocalDate.parse(event.optString("date")).isBefore(LocalDate.now())) result.add(event);
                } catch (RuntimeException ignored) {}
            }
            result.sort(Comparator.comparing(e -> e.optString("date") + "T" + e.optString("start")));
        } catch (Exception ignored) {}
        int limit = Math.max(1, Math.min(20, context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE)
                .getInt("upcomingCount." + widgetId, 3)));
        if (result.size() > limit) result = new ArrayList<>(result.subList(0, limit));
        if (result.isEmpty()) {
            JSONObject empty = new JSONObject();
            try { empty.put("title", "近期沒有行程"); } catch (Exception ignored) {}
            result.add(empty);
        }
        return result;
    }

    static RemoteViews upcomingRow(Context context, JSONObject event, int position, int widgetId) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_upcoming_row);
        String date = event.optString("date"), start = event.optString("start");
        String time = event.optBoolean("allDay") ? "全天" : start;
        String label = date.length() == 10 ? (date.equals(LocalDate.now().toString()) ? time : date.substring(5) + " " + time) + "\n" : "";
        android.text.SpannableString text = new android.text.SpannableString(label + event.optString("title"));
        if (!label.isEmpty()) text.setSpan(new android.text.style.StyleSpan(android.graphics.Typeface.BOLD),
                0, label.length() - 1, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        row.setTextViewText(R.id.widget_event_text, text);
        android.content.SharedPreferences prefs = context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE);
        boolean divider = prefs.getBoolean("upcomingDivider." + widgetId, true);
        row.setTextViewTextSize(R.id.widget_event_text, android.util.TypedValue.COMPLEX_UNIT_SP,
                12);
        row.setViewVisibility(R.id.widget_event_divider, position == 0 || !divider ? android.view.View.GONE : android.view.View.VISIBLE);
        Intent click = new Intent().putExtra("widgetDate", date)
                .putExtra("widgetEventId", event.optString("id"))
                .putExtra("widgetRecurrence", event.optString("recurrenceKey"))
                .putExtra("widgetStart", start);
        row.setOnClickFillInIntent(R.id.widget_event_row, click);
        return row;
    }

    private static void renderUpcoming(Context context, RemoteViews views, String json, int id, int rowLimit) {
        boolean divider = context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE).getBoolean("upcomingDivider." + id, true);
        int limit = Math.max(1, Math.min(8, context.getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE).getInt("upcomingCount." + id, 4)));
        List<JSONObject> items = upcoming(json, limit);
        if (items.isEmpty()) {
            views.setTextViewText(R.id.widget_content, "近期沒有行程");
            return;
        }
        int visibleLimit = Math.max(1, Math.min(items.size(), rowLimit));
        SpannableStringBuilder content = new SpannableStringBuilder();
        for (int i = 0; i < visibleLimit; i++) {
            if (i > 0) content.append(divider ? "\n────────\n" : "\n\n");
            content.append(upcomingLabel(items.get(i)));
        }
        views.setTextViewText(R.id.widget_content, content);
    }

    private static List<JSONObject> upcoming(String json, int limit) {
        List<JSONObject> visible = new ArrayList<>();
        try {
            JSONArray rows = new JSONArray(json);
            LocalDate today = LocalDate.now();
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null || item.optString("title", "").trim().isEmpty()) continue;
                String date = item.optString("date", "");
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}") || LocalDate.parse(date).isBefore(today)) continue;
                visible.add(item);
            }
            visible.sort(Comparator.comparing(item -> item.optString("date") + "T" + item.optString("start")));
        } catch (Exception ignored) {}
        return visible.subList(0, Math.min(limit, visible.size()));
    }

    private static CharSequence upcomingLabel(JSONObject item) {
        String date = item.optString("date", "");
        String when = item.optBoolean("allDay", false) ? "全天" : widgetTime(item);
        String prefix = date.length() >= 10 ? date.substring(5) + " " + when : when;
        String text = prefix + "  " + item.optString("title", "").trim();
        SpannableString styled = new SpannableString(text);
        styled.setSpan(new StyleSpan(Typeface.BOLD), 0, prefix.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return styled;
    }

    private static String widgetTime(JSONObject item) {
        String start = item.optString("start", "");
        if (!start.matches("\\d{2}:\\d{2}")) return start;
        try {
            ZoneId zone = ZoneId.of(item.optString("timezone", ZoneId.systemDefault().getId()));
            LocalTime time = LocalDate.parse(item.optString("date")).atTime(LocalTime.parse(start)).atZone(zone)
                    .withZoneSameInstant(ZoneId.systemDefault()).toLocalTime();
            return time.format(DateTimeFormatter.ofPattern("HH:mm"));
        } catch (Exception ignored) { return start; }
    }

    private static String content(String json, boolean todo, int limit) {
        return String.join("\n", contentLines(json, todo, limit));
    }

    static List<String> contentLines(String json, boolean todo, int limit) {
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
                    try {
                        if (!date.isEmpty() && !LocalDate.parse(date).isBefore(today)) visible.add(item);
                    } catch (java.time.format.DateTimeParseException ignored) {}
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
                    lines.add((date.equals(today.toString()) ? time : date.substring(5) + " " + time) + "\n" + title);
                }
            }
            if (!lines.isEmpty()) return lines;
            return java.util.Collections.singletonList(todo ? "目前沒有待辦事項" : "近期沒有行程");
        } catch (Exception error) {
            return java.util.Collections.singletonList(todo ? "無法讀取待辦事項" : "無法讀取行程");
        }
    }
}
