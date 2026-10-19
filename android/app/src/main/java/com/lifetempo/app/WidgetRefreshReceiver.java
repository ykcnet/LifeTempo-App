package com.lifetempo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Replace cached layouts and PendingIntents immediately after an app upgrade. */
public final class WidgetRefreshReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) HomeWidgetRenderer.refreshAll(context);
    }
}
