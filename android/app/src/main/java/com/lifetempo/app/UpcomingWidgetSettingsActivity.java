package com.lifetempo.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.NumberPicker;
import android.widget.TextView;

public final class UpcomingWidgetSettingsActivity extends Activity {
    private int widgetId;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        android.content.SharedPreferences prefs = getSharedPreferences("lifetempo_widgets", Context.MODE_PRIVATE);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        root.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("近日行程設定");
        title.setTextSize(20);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(title);
        TextView label = new TextView(this);
        label.setText("顯示事件數量");
        label.setPadding(0, padding, 0, 0);
        root.addView(label);
        NumberPicker count = new NumberPicker(this);
        count.setMinValue(1);
        count.setMaxValue(8);
        count.setValue(prefs.getInt("upcomingCount." + widgetId, 4));
        root.addView(count);
        CheckBox divider = new CheckBox(this);
        divider.setText("事件之間顯示分隔線");
        divider.setChecked(prefs.getBoolean("upcomingDivider." + widgetId, true));
        root.addView(divider);
        android.widget.Button save = new android.widget.Button(this);
        save.setText("儲存");
        save.setOnClickListener(view -> {
            prefs.edit().putInt("upcomingCount." + widgetId, count.getValue())
                    .putBoolean("upcomingDivider." + widgetId, divider.isChecked()).apply();
            HomeWidgetRenderer.update(this, AppWidgetManager.getInstance(this), new int[]{widgetId}, false);
            finish();
        });
        root.addView(save);
        setContentView(root);
    }
}
