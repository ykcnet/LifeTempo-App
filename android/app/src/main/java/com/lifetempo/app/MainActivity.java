package com.lifetempo.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.IntentSender;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net/";
    private static final int FILE_CHOOSER_REQUEST = 4201;
    private static final int EXPORT_FILE_REQUEST = 4202;
    private static final int DRIVE_AUTH_REQUEST = 4203;
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private static final String DRIVE_AUTH_TAG = "LifeTempoDriveAuth";
    private WebView webView;
    private boolean pageReady;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String pendingExportContent;
    private String pendingDriveRequestId;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.addJavascriptInterface(new LifeTempoWidgetBridge(this), "LifeTempoWidget");
        webView.addJavascriptInterface(new ExportBridge(), "LifeTempoFiles");
        webView.addJavascriptInterface(new DriveAuthBridge(), "LifeTempoDriveNative");
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageReady = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = url.startsWith(APP_ORIGIN);
            }
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
        if (android.os.Build.VERSION.SDK_INT >= 35) {
            // Android 15 draws edge-to-edge; keep the page clear of the status and navigation bars.
            webView.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return android.view.WindowInsets.CONSUMED;
            });
        }
        setContentView(webView);
        loadApp(getIntent());
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Import todo edits made on the home-screen widget while the app was in the background.
        if (pageReady && webView != null) {
            webView.evaluateJavascript("typeof window.applyWidgetTodoOps === 'function' && window.applyWidgetTodoOps()", null);
        }
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
        if (requestCode == DRIVE_AUTH_REQUEST) {
            String requestId = pendingDriveRequestId;
            pendingDriveRequestId = null;
            if (data == null) {
                String message = resultCode == RESULT_CANCELED
                        ? "Google 授權畫面已關閉，未取得授權"
                        : "Google 授權沒有回傳結果，請重新連接";
                completeDriveAuthorization(requestId, null, message);
                return;
            }
            try {
                AuthorizationResult result = Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data);
                deliverAuthorizationResult(requestId, result);
            } catch (Exception error) {
                String message = authorizationFailureMessage(error, resultCode == RESULT_CANCELED);
                Log.e(DRIVE_AUTH_TAG, message, error);
                completeDriveAuthorization(requestId, null, message);
            }
            return;
        }
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
        String widget = intent == null ? null : intent.getStringExtra("widget");
        webView.loadUrl(APP_ORIGIN + "index.html" + (widget == null ? "" : "?widget=" + Uri.encode(widget)));
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

    private final class DriveAuthBridge {
        @android.webkit.JavascriptInterface
        public void authorize(String requestId) {
            if (requestId == null || !requestId.matches("[0-9]{1,10}")) return;
            runOnUiThread(() -> requestDriveAuthorization(requestId));
        }
    }

    private void requestDriveAuthorization(String requestId) {
        AuthorizationRequest request = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
                .setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
                .build();
        Identity.getAuthorizationClient(this).authorize(request)
                .addOnSuccessListener(result -> deliverAuthorizationResult(requestId, result))
                .addOnFailureListener(error -> {
                    String message = authorizationFailureMessage(error, false);
                    Log.e(DRIVE_AUTH_TAG, message, error);
                    completeDriveAuthorization(requestId, null, message);
                });
    }

    private String authorizationFailureMessage(Exception error, boolean wasCanceled) {
        if (error instanceof ApiException) {
            ApiException apiError = (ApiException) error;
            String statusMessage = apiError.getStatus() == null
                    ? null : apiError.getStatus().getStatusMessage();
                String exceptionMessage = apiError.getMessage();
                if ("UNREGISTERED_ON_API_CONSOLE".equals(statusMessage)
                    || (exceptionMessage != null && exceptionMessage.contains("UNREGISTERED_ON_API_CONSOLE"))) {
                return "Google Cloud 尚未登記 Android OAuth 用戶端：套件 com.ykcnet.lifetempo，SHA-1 3B:01:52:AB:C7:B6:16:AD:42:F8:2A:9F:40:17:C6:7E:4D:CE:D8:F1";
            }
            if (apiError.getStatusCode() == 10) {
                return "Google OAuth 設定錯誤（10）：請確認 Android 用戶端套件名稱與 release SHA-1";
            }
            if (apiError.getStatusCode() == 16 || wasCanceled) {
                return "Google 授權未完成或已取消（" + apiError.getStatusCode() + "），請重新連接";
            }
            return "Google 授權失敗（" + apiError.getStatusCode() + "），請稍後重試";
        }
        return wasCanceled
                ? "Google 授權未完成或已取消，請重新連接"
                : "Google 授權失敗，請稍後重試";
    }

    private void deliverAuthorizationResult(String requestId, AuthorizationResult result) {
        if (result.hasResolution()) {
            pendingDriveRequestId = requestId;
            try {
                startIntentSenderForResult(result.getPendingIntent().getIntentSender(),
                        DRIVE_AUTH_REQUEST, null, 0, 0, 0);
            } catch (IntentSender.SendIntentException error) {
                pendingDriveRequestId = null;
                completeDriveAuthorization(requestId, null, "無法開啟 Google 帳號授權畫面");
            }
            return;
        }
        String accessToken = result.getAccessToken();
        if (accessToken == null || accessToken.isEmpty()) {
            completeDriveAuthorization(requestId, null, "Google 未授予 Drive 存取權");
            return;
        }
        completeDriveAuthorization(requestId, accessToken, null);
    }

    private void completeDriveAuthorization(String requestId, String accessToken, String error) {
        if (requestId == null || webView == null) return;
        String script = "window.LifeTempoDriveSync?.completeNativeAuthorization("
                + org.json.JSONObject.quote(requestId) + ","
                + org.json.JSONObject.quote(accessToken == null ? "" : accessToken) + ","
                + org.json.JSONObject.quote(error == null ? "" : error) + ")";
        webView.evaluateJavascript(script, null);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
