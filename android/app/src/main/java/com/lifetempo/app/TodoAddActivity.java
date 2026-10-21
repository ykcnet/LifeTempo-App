package com.lifetempo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.Toast;

/** Adds a todo from the home-screen widget; the user chooses plain tracking or calendar scheduling. */
public final class TodoAddActivity extends Activity {
    private static final String LAST_MODE = "todoAddPlan";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences prefs = getSharedPreferences("lifetempo_widgets", MODE_PRIVATE);
        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(padding, padding / 2, padding, 0);

        EditText input = new EditText(this);
        input.setHint("待辦內容，例如：晚上完成作業");
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setSingleLine(true);
        panel.addView(input);

        RadioGroup mode = new RadioGroup(this);
        RadioButton plain = new RadioButton(this);
        plain.setId(1);
        plain.setText("單獨待辦（不解析文字，僅記錄是否完成）");
        RadioButton plan = new RadioButton(this);
        plan.setId(2);
        plan.setText("排入行程（解析日期與時間，開啟 App 後自動排入）");
        mode.addView(plain);
        mode.addView(plan);
        mode.check(prefs.getBoolean(LAST_MODE, false) ? 2 : 1);
        panel.addView(mode);

        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("新增待辦事項").setView(panel)
                .setPositiveButton("新增", null)
                .setNegativeButton("取消", (d, which) -> finish())
                .setOnCancelListener(d -> finish()).create();
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String title = input.getText().toString().trim();
            if (title.isEmpty()) {
                input.setError("請輸入待辦內容");
                return;
            }
            boolean schedule = mode.getCheckedRadioButtonId() == 2;
            prefs.edit().putBoolean(LAST_MODE, schedule).apply();
            if (WidgetDataStore.addTodo(this, title, schedule)) {
                Toast.makeText(this, schedule ? "已加入，開啟 LifeTempo 後將自動排入行程" : "已加入待辦事項",
                        Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "待辦暫存已滿，請先開啟 LifeTempo", Toast.LENGTH_LONG).show();
            }
            dialog.dismiss();
            finish();
        });
    }
}
