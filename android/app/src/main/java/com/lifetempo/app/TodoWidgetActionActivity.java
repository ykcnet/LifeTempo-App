package com.lifetempo.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

/** Handles todo widget row taps without showing a screen: check completes, text opens the app. */
public final class TodoWidgetActionActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            Intent intent = getIntent();
            String action = intent.getStringExtra("todoAction");
            if ("toggle".equals(action)) {
                if (WidgetDataStore.completeTodo(this, intent.getStringExtra("todoId"))) {
                    Toast.makeText(this, "已完成待辦事項", Toast.LENGTH_SHORT).show();
                }
            } else if ("open".equals(action)) {
                startActivity(new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        .setData(Uri.parse("lifetempo://todo-open"))
                        .putExtra("widget", "todo"));
            }
        } catch (RuntimeException error) {
            Log.e("LifeTempoWidget", "Todo action failed", error);
            Toast.makeText(this, "待辦操作失敗，請開啟 LifeTempo 後再試", Toast.LENGTH_LONG).show();
        } finally {
            finish();
            overridePendingTransition(0, 0);
        }
    }
}
