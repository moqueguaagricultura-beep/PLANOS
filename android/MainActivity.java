package com.edc.planosdxf;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String TAG = "PlanosDXF_EDC";
    private WebView webView;
    private boolean isPageLoaded = false;
    
    // Variables para almacenar temporalmente el DXF entrante desde el Intent
    private volatile String pendingDxfData = null;
    private volatile String pendingDxfFileName = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Inicializar WebView
        webView = new WebView(this);
        setContentView(webView);

        configureWebView();

        // 1. Interceptar si la app se abrió desde un Intent inicial (ej: tocar DXF en WhatsApp)
        handleIncomingIntent(getIntent());

        // 2. Cargar la aplicación web (archivo local en assets o URL de producción)
        // Ejemplo: webView.loadUrl("file:///android_asset/index.html");
        // O si está desplegada en servidor web:
        webView.loadUrl("file:///android_asset/index.html");
    }

    /**
     * Intercepta Intents cuando la app ya estaba abierta en segundo plano
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    /**
     * Configuración del WebView con soporte de JS, LocalStorage, IndexedDB y GPS
     */
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);

        // Registrar puente JavaScript <-> Android Native
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                // Permitir geolocalización para el botón de GPS
                callback.invoke(origin, true, false);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                isPageLoaded = true;
                
                // Si había un DXF esperando ser procesado al iniciar la app
                if (pendingDxfData != null) {
                    notifyWebToProcessDxf();
                }
            }
        });
    }

    /**
     * Procesa la URI del Intent entrante (desde WhatsApp, Telegram o Gestor de Archivos)
     */
    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        Uri dataUri = intent.getData();

        if (Intent.ACTION_VIEW.equals(action) && dataUri != null) {
            Log.d(TAG, "Intent ACTION_VIEW detectado. URI: " + dataUri.toString());
            readDxfFromUri(dataUri);
        }
    }

    /**
     * Lee de forma segura el archivo DXF usando ContentResolver (compatible con FileProvider de WhatsApp)
     */
    private void readDxfFromUri(Uri uri) {
        new Thread(() -> {
            try {
                // 1. Obtener nombre del archivo mediante ContentResolver
                String fileName = "Plano.dxf";
                if ("content".equalsIgnoreCase(uri.getScheme())) {
                    Cursor cursor = getContentResolver().query(uri, null, null, null, null);
                    if (cursor != null) {
                        if (cursor.moveToFirst()) {
                            int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                            if (nameIndex != -1) {
                                String name = cursor.getString(nameIndex);
                                if (name != null && !name.trim().isEmpty()) {
                                    fileName = name;
                                }
                            }
                        }
                        cursor.close();
                    }
                } else if (uri.getLastPathSegment() != null) {
                    fileName = uri.getLastPathSegment();
                }

                // 2. Abrir stream del archivo a través del ContentResolver
                InputStream inputStream = getContentResolver().openInputStream(uri);
                if (inputStream == null) {
                    Log.e(TAG, "No se pudo abrir el stream para la URI: " + uri);
                    return;
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
                StringBuilder stringBuilder = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    stringBuilder.append(line).append("\n");
                }
                reader.close();
                inputStream.close();

                pendingDxfData = stringBuilder.toString();
                pendingDxfFileName = fileName;

                Log.d(TAG, "DXF leído exitosamente: " + fileName + " (" + pendingDxfData.length() + " caracteres)");

                // Notificar a la interfaz web
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Cargando plano: " + pendingDxfFileName, Toast.LENGTH_SHORT).show();
                    if (isPageLoaded) {
                        notifyWebToProcessDxf();
                    }
                });

            } catch (Exception e) {
                Log.error(TAG, "Error al leer archivo DXF desde URI", e);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Error al abrir el plano: " + e.getMessage(), Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    /**
     * Dispara la función JavaScript en app.js para cargar y renderizar el plano
     */
    private void notifyWebToProcessDxf() {
        if (webView != null) {
            webView.evaluateJavascript("if (window.checkNativeDxf) { window.checkNativeDxf(); }", null);
        }
    }

    /**
     * Interfaz puente expuesta a window.AndroidBridge en JavaScript
     */
    public class WebAppInterface {

        @JavascriptInterface
        public boolean hasPendingDxf() {
            return pendingDxfData != null && !pendingDxfData.isEmpty();
        }

        @JavascriptInterface
        public String getDxfData() {
            return pendingDxfData != null ? pendingDxfData : "";
        }

        @JavascriptInterface
        public String getDxfFileName() {
            return pendingDxfFileName != null ? pendingDxfFileName : "Plano.dxf";
        }

        @JavascriptInterface
        public void clearPendingDxf() {
            pendingDxfData = null;
            pendingDxfFileName = null;
        }
    }

    @Override
    public void onBackPressed() {
        // Permitir retroceso en el historial del mapa o salir
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
