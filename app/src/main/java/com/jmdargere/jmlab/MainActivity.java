package com.jmdargere.jmlab;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * JM LAB PRO : la web app JM.DARGERE LAB PRO dans une vraie appli Android.
 * La page est servie depuis les fichiers de l'appli (aucune connexion necessaire).
 */
public class MainActivity extends Activity {

    static final String HOME = "https://appassets.androidplatform.net/assets/index.html";

    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private PermissionRequest pendingCam;

    // ecriture en cours (envoi par morceaux depuis la page)
    private OutputStream out;
    private Uri outUri;
    private File outFile;
    private String outName = "";
    private boolean outPictures;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0f0f0f"));
        root.addView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        web.setBackgroundColor(Color.parseColor("#0f0f0f"));

        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        web.addJavascriptInterface(new Bridge(), "JMNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("appassets.androidplatform.net".equals(u.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams p) {
                if (chooser != null) {
                    chooser.onReceiveValue(null);
                }
                chooser = cb;
                try {
                    startActivityForResult(p.createIntent(), 7);
                } catch (Exception e) {
                    chooser = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest req) {
                runOnUiThread(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA)
                            == PackageManager.PERMISSION_GRANTED) {
                        req.grant(req.getResources());
                    } else {
                        pendingCam = req;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, 3);
                    }
                });
            }

            // les fenetres alert() de la page deviennent de vraies boites Android
            @Override
            public boolean onJsAlert(WebView v, String url, String msg,
                                     android.webkit.JsResult r) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(msg)
                        .setPositiveButton("OK", (d, w) -> r.confirm())
                        .setOnCancelListener(d -> r.cancel())
                        .show();
                return true;
            }
        });

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, 4);
        }
        web.loadUrl(HOME);
    }

    @Override
    protected void onActivityResult(int code, int res, Intent data) {
        super.onActivityResult(code, res, data);
        if (code == 7 && chooser != null) {
            chooser.onReceiveValue(res == RESULT_OK && data != null
                    ? android.webkit.WebChromeClient.FileChooserParams.parseResult(res, data) : null);
            chooser = null;
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == 3 && pendingCam != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) {
                pendingCam.grant(pendingCam.getResources());
            } else {
                pendingCam.deny();
            }
            pendingCam = null;
        }
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        // la page ferme d'abord ses fenetres (lot, presets) ; sinon on quitte
        web.evaluateJavascript("window.__jmsBack?window.__jmsBack():0", v -> {
            if (!"1".equals(v)) {
                finish();
            }
        });
    }

    private void toast(String t) {
        runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_LONG).show());
    }

    /** Pont page -> Android : enregistrement des images / ZIP dans la galerie ou Telechargements. */
    class Bridge {
        @JavascriptInterface
        public void saveBegin(String name, String mime) {
            saveBeginIn(name, mime, "");
        }

        @JavascriptInterface
        public void saveBeginIn(String name, String mime, String sub) {
            closeQuiet();
            if (sub == null) {
                sub = "";
            }
            sub = sub.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
            outName = name;
            outPictures = mime != null && mime.startsWith("image/");
            try {
                String dir = "JM LAB PRO" + (sub.isEmpty() ? "" : "/" + sub);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            (outPictures ? Environment.DIRECTORY_PICTURES
                                    : Environment.DIRECTORY_DOWNLOADS) + "/" + dir);
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    ContentResolver cr = getContentResolver();
                    outUri = cr.insert(outPictures
                            ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                            : MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    out = cr.openOutputStream(outUri);
                } else {
                    File d = new File(Environment.getExternalStoragePublicDirectory(
                            outPictures ? Environment.DIRECTORY_PICTURES
                                    : Environment.DIRECTORY_DOWNLOADS), dir);
                    d.mkdirs();
                    outFile = new File(d, name);
                    out = new FileOutputStream(outFile);
                }
            } catch (Exception e) {
                out = null;
                toast("Enregistrement impossible : " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void saveChunk(String b64) {
            try {
                if (out != null) {
                    out.write(Base64.decode(b64, Base64.DEFAULT));
                }
            } catch (Exception e) {
                closeQuiet();
                toast("Erreur d'écriture : " + e.getMessage());
            }
        }

        @JavascriptInterface
        public boolean saveEnd() {
            return finishSave(true);
        }

        @JavascriptInterface
        public boolean saveEndQuiet() {
            return finishSave(false);
        }

        private boolean finishSave(boolean say) {
            boolean ok = out != null;
            try {
                if (out != null) {
                    out.flush();
                    out.close();
                }
                out = null;
                if (outUri != null) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContentResolver().update(outUri, v, null, null);
                } else if (outFile != null) {
                    android.media.MediaScannerConnection.scanFile(MainActivity.this,
                            new String[]{outFile.getAbsolutePath()}, null, null);
                }
            } catch (Exception e) {
                ok = false;
            }
            outUri = null;
            outFile = null;
            if (ok && say) {
                toast("✔ Enregistré : " + (outPictures ? "Images/" : "Téléchargements/")
                        + "JM LAB PRO/" + outName);
            }
            return ok;
        }

        @JavascriptInterface
        public void shareText(String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Partager mon style"));
            });
        }

        @JavascriptInterface
        public void vibrate() {
            try {
                Vibrator vb = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (Build.VERSION.SDK_INT >= 26) {
                    vb.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 120, 250}, -1));
                } else {
                    vb.vibrate(400);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void toFront() {
            runOnUiThread(() -> {
                Intent i = new Intent(MainActivity.this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(i);
            });
        }
    }

    private void closeQuiet() {
        try {
            if (out != null) {
                out.close();
            }
        } catch (Exception ignored) {
        }
        out = null;
        outUri = null;
        outFile = null;
    }
}
