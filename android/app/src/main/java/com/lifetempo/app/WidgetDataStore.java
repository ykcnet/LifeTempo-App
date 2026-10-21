package com.lifetempo.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.UUID;

public final class WidgetDataStore {
    private static final String PREFS = "lifetempo_widgets";
    private static final String TODO_OPS = "todoOps";
    private static final int MAX_TODO_OPS = 200;
    private static final Object LOCK = new Object();

    private WidgetDataStore() {}

    public static void update(Context context, String eventsJson, String tasksJson, int weekStart) {
        update(context, eventsJson, tasksJson, weekStart, null);
    }

    public static void update(Context context, String eventsJson, String tasksJson, int weekStart, String daysJson) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        synchronized (LOCK) {
            // Widget edits not yet imported by the app must survive a stale app snapshot.
            String merged = applyTodoOps(tasksJson, readTodoOps(preferences));
            SharedPreferences.Editor editor = preferences.edit().putString("events", eventsJson).putString("tasks", merged)
                    .putInt("weekStart", weekStart == 1 ? 1 : 0);
            if (daysJson != null) editor.putString("days", daysJson);
            editor.apply();
        }
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

    /** Adds a task from the widget; plan=true asks the app to parse it into a calendar event on next open. */
    static boolean addTodo(Context context, String title, boolean plan) {
        String clean = title == null ? "" : title.trim();
        if (clean.isEmpty()) return false;
        if (clean.length() > 200) clean = clean.substring(0, 200);
        try {
            JSONObject op = new JSONObject().put("type", "add").put("id", UUID.randomUUID().toString())
                    .put("title", clean).put("mode", plan ? "plan" : "plain")
                    .put("due", LocalDate.now().toString());
            return queueTodoOp(context, op);
        } catch (JSONException error) {
            return false;
        }
    }

    static boolean completeTodo(Context context, String id) {
        if (id == null || id.isEmpty()) return false;
        try {
            return queueTodoOp(context, new JSONObject().put("type", "done").put("id", id));
        } catch (JSONException error) {
            return false;
        }
    }

    /** Returns queued widget edits as JSON and clears them; the app applies them to its own storage. */
    static String takeTodoOps(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        synchronized (LOCK) {
            String ops = preferences.getString(TODO_OPS, "[]");
            if (!"[]".equals(ops)) preferences.edit().putString(TODO_OPS, "[]").apply();
            return ops;
        }
    }

    private static boolean queueTodoOp(Context context, JSONObject op) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        synchronized (LOCK) {
            JSONArray ops = readTodoOps(preferences);
            if (ops.length() >= MAX_TODO_OPS) return false;
            ops.put(op);
            preferences.edit().putString(TODO_OPS, ops.toString())
                    .putString("tasks", applyTodoOps(preferences.getString("tasks", "[]"), new JSONArray().put(op)))
                    .apply();
        }
        HomeWidgetRenderer.refreshAll(context);
        return true;
    }

    private static JSONArray readTodoOps(SharedPreferences preferences) {
        try {
            return new JSONArray(preferences.getString(TODO_OPS, "[]"));
        } catch (JSONException error) {
            return new JSONArray();
        }
    }

    private static String applyTodoOps(String tasksJson, JSONArray ops) {
        if (ops.length() == 0) return tasksJson;
        try {
            JSONArray tasks = new JSONArray(tasksJson);
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.optJSONObject(i);
                if (op == null) continue;
                String id = op.optString("id");
                int index = -1;
                for (int j = 0; j < tasks.length(); j++) {
                    JSONObject task = tasks.optJSONObject(j);
                    if (task != null && id.equals(task.optString("id"))) { index = j; break; }
                }
                if ("done".equals(op.optString("type"))) {
                    if (index >= 0) tasks.remove(index);
                } else if ("add".equals(op.optString("type")) && index < 0) {
                    tasks.put(new JSONObject().put("id", id).put("title", op.optString("title"))
                            .put("due", op.optString("due")).put("done", false)
                            .put("widgetPlan", "plan".equals(op.optString("mode"))));
                }
            }
            return tasks.toString();
        } catch (JSONException error) {
            return tasksJson;
        }
    }
}