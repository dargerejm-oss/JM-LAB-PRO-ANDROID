package com.jmdargere.jmlab;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.DocumentsContract;
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
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;

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
    private boolean outPending;

    // dossier choisi par l'utilisateur (carte SD, cle USB, dossier du telephone...)
    private Uri treeUri;
    private boolean useTree;
    private final HashMap<String, Uri> dirCache = new HashMap<>();

    // images recues par "Partager vers JM LAB PRO" (Snapseed, galerie...)
    private String sharedJson = "";

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
                .addPathHandler("/shared/", new WebViewAssetLoader.InternalStoragePathHandler(
                        this, new File(getCacheDir(), "shared")))
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
        String saved = getSharedPreferences("jmlab", MODE_PRIVATE).getString("tree", null);
        if (saved != null) {
            treeUri = Uri.parse(saved);
        }
        collectShared(getIntent());
        web.loadUrl(HOME);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        collectShared(i);
        if (!sharedJson.isEmpty()) {
            final String j = sharedJson;
            sharedJson = "";
            web.evaluateJavascript("window.__jmsShared&&window.__jmsShared("
                    + org.json.JSONObject.quote(j) + ")", null);
        }
    }

    /** Copie les images partagees dans le cache et prepare la liste pour la page. */
    private void collectShared(Intent in) {
        if (in == null) {
            return;
        }
        String act = in.getAction();
        if (!Intent.ACTION_SEND.equals(act) && !Intent.ACTION_SEND_MULTIPLE.equals(act)) {
            return;
        }
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(act)) {
            Uri u = in.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) {
                uris.add(u);
            }
        } else {
            ArrayList<Uri> l = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) {
                uris.addAll(l);
            }
        }
        if (uris.isEmpty()) {
            return;
        }
        File dir = new File(getCacheDir(), "shared");
        if (dir.exists()) {
            File[] old = dir.listFiles();
            if (old != null) {
                for (File f : old) {
                    f.delete();
                }
            }
        }
        dir.mkdirs();
        org.json.JSONArray arr = new org.json.JSONArray();
        int n = 0;
        for (Uri u : uris) {
            try (InputStream is = getContentResolver().openInputStream(u)) {
                if (is == null) {
                    continue;
                }
                n++;
                String fn = "img" + n + "_" + System.currentTimeMillis() + ".jpg";
                try (FileOutputStream os = new FileOutputStream(new File(dir, fn))) {
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = is.read(buf)) > 0) {
                        os.write(buf, 0, r);
                    }
                }
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("url", "https://appassets.androidplatform.net/shared/" + fn);
                o.put("name", "Snapseed_" + n + ".jpg");
                arr.put(o);
            } catch (Exception e) {
                // image illisible : on passe a la suivante
            }
        }
        if (arr.length() > 0) {
            sharedJson = arr.toString();
        }
    }

    @Override
    protected void onActivityResult(int code, int res, Intent data) {
        super.onActivityResult(code, res, data);
        if (code == 8) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                treeUri = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(treeUri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored) {
                }
                getSharedPreferences("jmlab", MODE_PRIVATE).edit()
                        .putString("tree", treeUri.toString()).apply();
                dirCache.clear();
                String n = org.json.JSONObject.quote(treeName());
                web.evaluateJavascript("window.__jmsFolder&&window.__jmsFolder(" + n + ")", null);
            }
            return;
        }
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
        public String takeShared() {
            String j = sharedJson;
            sharedJson = "";
            return j;
        }

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
            outPending = false;
            try {
                String dir = "JM LAB PRO" + (sub.isEmpty() ? "" : "/" + sub);
                if (useTree && treeUri != null) {
                    ContentResolver cr = getContentResolver();
                    Uri parent = DocumentsContract.buildDocumentUriUsingTree(treeUri,
                            DocumentsContract.getTreeDocumentId(treeUri));
                    if (!sub.isEmpty()) {
                        parent = childDir(cr, parent, sub);
                    }
                    outUri = DocumentsContract.createDocument(cr, parent, mime, name);
                    out = cr.openOutputStream(outUri);
                } else if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            (outPictures ? Environment.DIRECTORY_PICTURES
                                    : Environment.DIRECTORY_DOWNLOADS) + "/" + dir);
                    v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    outPending = true;
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
                if (outUri != null && outPending) {
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
            if (!ok && say) {
                toast("✖ Échec de l'enregistrement. Réessaie ou change de dossier.");
            }
            if (ok && say) {
                toast(useTree ? "✔ Enregistré dans " + treeName() + " : " + outName
                        : "✔ Enregistré : " + (outPictures ? "Images/" : "Téléchargements/")
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
        public void pickFolder() {
            runOnUiThread(() -> {
                try {
                    startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), 8);
                } catch (Exception e) {
                    toast("Impossible d'ouvrir le sélecteur de dossier.");
                }
            });
        }

        @JavascriptInterface
        public void setTarget(boolean tree) {
            useTree = tree && treeUri != null;
        }

        @JavascriptInterface
        public String folderName() {
            return treeUri == null ? "" : treeName();
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

    private String treeName() {
        try {
            String id = DocumentsContract.getTreeDocumentId(treeUri);
            return Uri.decode(id).replace("primary:", "Téléphone/");
        } catch (Exception e) {
            return "dossier choisi";
        }
    }

    private Uri childDir(ContentResolver cr, Uri parent, String name) throws Exception {
        String key = parent + "|" + name;
        Uri cached = dirCache.get(key);
        if (cached != null) {
            return cached;
        }
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri,
                DocumentsContract.getDocumentId(parent));
        Uri found = null;
        try (Cursor c = cr.query(children, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))
                        && DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    found = DocumentsContract.buildDocumentUriUsingTree(treeUri, c.getString(0));
                    break;
                }
            }
        }
        if (found == null) {
            found = DocumentsContract.createDocument(cr, parent,
                    DocumentsContract.Document.MIME_TYPE_DIR, name);
        }
        dirCache.put(key, found);
        return found;
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
