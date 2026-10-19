package com.lifetempo.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net/";
    private static final int FILE_CHOOSER_REQUEST = 4201;
    private static final int EXPORT_FILE_REQUEST = 4202;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingExportContent;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.addJavascriptInterface(new LifeTempoWidgetBridge(this), "LifeTempoWidget");
        webView.addJavascriptInterface(new ExportBridge(), "LifeTempoFiles");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
            }
        });

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                    .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority() + "/")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        setContentView(webView);
        loadApp(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadApp(intent);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == EXPORT_FILE_REQUEST) {
            String content = pendingExportContent;
            pendingExportContent = null;
            Uri destination = data == null ? null : data.getData();
            if (resultCode != RESULT_OK || destination == null || content == null) return;
            try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                if (output == null) throw new IllegalStateException("Unable to open destination");
                output.write(content.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "檔案已儲存", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "無法儲存檔案，請重新匯出", Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    private void loadApp(Intent intent) {
        String widget = intent == null ? null : intent.getStringExtra("widgetView");
        if (widget == null && intent != null) widget = intent.getStringExtra("widget");
        String date = intent == null ? null : intent.getStringExtra("widgetDate");
        String query = widget == null ? "" : "?widget=" + Uri.encode(widget);
        if (date != null && date.matches("\\d{4}-\\d{2}-\\d{2}")) query += (query.isEmpty() ? "?" : "&") + "date=" + Uri.encode(date);
        webView.loadUrl(APP_ORIGIN + "index.html" + query);
    }

    private final class ExportBridge {
        @android.webkit.JavascriptInterface
        public void saveText(String filename, String mimeType, String content) {
            if (content == null || content.length() > 5_000_000
                    || !("application/json".equals(mimeType) || "text/calendar".equals(mimeType))) return;
            runOnUiThread(() -> {
                pendingExportContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType);
                String safeName = filename == null ? "lifetempo-export" : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try {
                    startActivityForResult(intent, EXPORT_FILE_REQUEST);
                } catch (Exception error) {
                    pendingExportContent = null;
                    Toast.makeText(MainActivity.this, "無法開啟檔案儲存位置", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}