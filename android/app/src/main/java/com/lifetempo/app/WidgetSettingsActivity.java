package com.lifetempo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;

public final class WidgetSettingsActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        SharedPreferences prefs = getSharedPreferences("lifetempo_widgets", MODE_PRIVATE);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        panel.setPadding(padding, padding, padding, padding);
        CheckBox divider = new CheckBox(this);
        divider.setText("顯示事件分隔線");
        divider.setChecked(prefs.getBoolean("upcomingDivider." + id, true));
        panel.addView(divider);
        TextView label = new TextView(this);
        label.setText("顯示事件則數");
        panel.addView(label);
        Spinner count = new Spinner(this);
        String[] options = new String[20];
        for (int i = 0; i < options.length; i++) options[i] = (i + 1) + " 則";
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, options);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        count.setAdapter(adapter);
        count.setSelection(Math.max(0, Math.min(19, prefs.getInt("upcomingCount." + id, 3) - 1)));
        panel.addView(count);
        new AlertDialog.Builder(this).setTitle("近日行程設定").setView(panel)
                .setPositiveButton("儲存", (dialog, which) -> {
                    prefs.edit().putBoolean("upcomingDivider." + id, divider.isChecked())
                            .putInt("upcomingCount." + id, count.getSelectedItemPosition() + 1).apply();
                    HomeWidgetRenderer.update(this, AppWidgetManager.getInstance(this), new int[]{id}, false);
                    finish();
                }).setNegativeButton("取消", (dialog, which) -> finish())
                .setOnCancelListener(dialog -> finish()).show();
    }
}
