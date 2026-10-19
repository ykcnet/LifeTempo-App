package com.lifetempo.app;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

/** User-initiated widget action without opening the WebView or creating a visible screen. */
public final class CalendarWidgetActionActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            CalendarWidgetActionsReceiver.handleAction(this, getIntent());
        } catch (RuntimeException error) {
            Log.e("LifeTempoWidget", "Calendar action failed", error);
            Toast.makeText(this, "月曆更新失敗，請開啟 LifeTempo 後再試", Toast.LENGTH_LONG).show();
        } finally {
            finish();
            overridePendingTransition(0, 0);
        }
    }
}
