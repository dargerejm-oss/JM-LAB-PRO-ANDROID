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
import java.util.Collections;
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
                String vp = r.getUrl().getPath();
                if (vp != null && vp.startsWith("/vimg/")) {
                    return vImage(vp);
                }
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
        String vs = getSharedPreferences("jmlab", MODE_PRIVATE).getString("vsrc", null);
        String vd = getSharedPreferences("jmlab", MODE_PRIVATE).getString("vdst", null);
        if (vs != null) {
            vSrc = Uri.parse(vs);
        }
        if (vd != null) {
            vDst = Uri.parse(vd);
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
        if (code == 9 || code == 10) {
            if (res == RESULT_OK && data != null && data.getData() != null) {
                Uri u = data.getData();
                Uri other = code == 9 ? vDst : vSrc;
                try {
                    if (other != null && u.getAuthority().equals(other.getAuthority())
                            && DocumentsContract.getTreeDocumentId(u)
                            .equals(DocumentsContract.getTreeDocumentId(other))) {
                        toast("Le dossier à regarder et le dossier d'enregistrement doivent être différents.");
                        return;
                    }
                } catch (Exception ignored) {
                }
                try {
                    getContentResolver().takePersistableUriPermission(u,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored) {
                }
                if (code == 9) {
                    vSrc = u;
                } else {
                    vDst = u;
                }
                getSharedPreferences("jmlab", MODE_PRIVATE).edit()
                        .putString(code == 9 ? "vsrc" : "vdst", u.toString()).apply();
                js("window.__jmvFolder&&window.__jmvFolder(" + (code - 9) + ")");
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
        public String vState() {
            try {
                return new org.json.JSONObject().put("src", nameOf(vSrc)).put("dst", nameOf(vDst)).toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void vPick(int which) {
            final int code = which == 0 ? 9 : 10;
            runOnUiThread(() -> {
                try {
                    startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), code);
                } catch (Exception e) {
                    toast("Impossible d'ouvrir le sélecteur de dossier.");
                }
            });
        }

        @JavascriptInterface
        public void vList(boolean rec) {
            vDoList(rec);
        }

        @JavascriptInterface
        public String vListGet() {
            return vListJson;
        }

        @JavascriptInterface
        public String vDimsOf(int gen, int idx) {
            return vDims(gen, idx);
        }

        @JavascriptInterface
        public void vCopy(int gen, int idx, int deg) {
            vDoCopy(gen, idx, deg);
        }

        @JavascriptInterface
        public void vRotSaved(String tag, String uri, int deg) {
            vDoRotSaved(tag, uri, deg);
        }

        @JavascriptInterface
        public void vDelete(int gen, int idx) {
            vDoDelete(gen, idx);
        }

        @JavascriptInterface
        public boolean vUndo(String uri, long size) {
            try {
                ContentResolver cr = getContentResolver();
                Uri u = Uri.parse(uri);
                long sz = docSize(cr, u);
                if (size > 0 && sz != size) {
                    return false;
                }
                return DocumentsContract.deleteDocument(cr, u);
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void vOpenDst() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(DocumentsContract.buildDocumentUriUsingTree(vDst,
                            DocumentsContract.getTreeDocumentId(vDst)), DocumentsContract.Document.MIME_TYPE_DIR);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(i);
                } catch (Exception e) {
                    toast("Impossible d'ouvrir le dossier : " + e.getMessage());
                }
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

    // ======================================================================
    //  VISIONNEUSE : regarder un dossier, copier l'image choisie dans un dossier fixe
    // ======================================================================
    static class VDoc {
        String id, name, rel, parent;
        long size, mtime;
        boolean raw;
    }

    static final String[] EXT_STD = {"jpg", "jpeg", "jpe", "png", "tif", "tiff", "webp", "bmp", "gif"};
    static final String[] EXT_RAW = {"dng", "raf", "cr2", "cr3", "crw", "nef", "nrw", "arw", "srf", "sr2",
            "orf", "rw2", "raw", "pef", "srw", "3fr", "erf", "kdc", "mrw", "rwl", "iiq"};

    private Uri vSrc, vDst;
    private int vGen = 0;
    private final ArrayList<VDoc> vdocs = new ArrayList<>();
    private String vListJson = "";
    private final java.util.concurrent.ExecutorService vPool =
            java.util.concurrent.Executors.newFixedThreadPool(2);
    private final java.util.concurrent.ExecutorService vCopyPool =
            java.util.concurrent.Executors.newSingleThreadExecutor();
    private final android.util.LruCache<String, byte[]> rawCache =
            new android.util.LruCache<String, byte[]>(24 * 1024 * 1024) {
                @Override
                protected int sizeOf(String k, byte[] v) {
                    return v.length;
                }
            };

    static String ext(String n) {
        int i = n.lastIndexOf('.');
        return i < 0 ? "" : n.substring(i + 1).toLowerCase(java.util.Locale.ROOT);
    }

    static boolean has(String[] a, String e) {
        for (String s : a) {
            if (s.equals(e)) {
                return true;
            }
        }
        return false;
    }

    private void js(final String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    private String nameOf(Uri tree) {
        if (tree == null) {
            return "";
        }
        try {
            String id = DocumentsContract.getTreeDocumentId(tree);
            return Uri.decode(id).replace("primary:", "Téléphone/");
        } catch (Exception e) {
            return "dossier choisi";
        }
    }

    private void walk(ContentResolver cr, Uri tree, String dirId, String rel, boolean rec,
                      String excludeId, ArrayList<VDoc> out, int depth) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId);
        ArrayList<String[]> dirs = new ArrayList<>();
        try (Cursor c = cr.query(children, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED}, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String id = c.getString(0), name = c.getString(1), mime = c.getString(2);
                if (name == null) {
                    continue;
                }
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    if (rec && depth < 8 && !name.equals("_SUPPRIMES") && !id.equals(excludeId)) {
                        dirs.add(new String[]{id, name});
                    }
                    continue;
                }
                if (name.startsWith("._")) {
                    continue;
                }
                String e = ext(name);
                boolean raw = has(EXT_RAW, e);
                if (!raw && !has(EXT_STD, e)) {
                    continue;
                }
                VDoc d = new VDoc();
                d.id = id;
                d.name = name;
                d.rel = rel;
                d.parent = dirId;
                d.size = c.getLong(3);
                d.mtime = c.getLong(4);
                d.raw = raw;
                out.add(d);
            }
        }
        for (String[] dd : dirs) {
            walk(cr, tree, dd[0], rel.isEmpty() ? dd[1] : rel + "/" + dd[1], rec, excludeId, out, depth + 1);
        }
    }

    private HashMap<String, Long> destNames(ContentResolver cr, Uri tree) {
        HashMap<String, Long> m = new HashMap<>();
        try {
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                    DocumentsContract.getTreeDocumentId(tree));
            try (Cursor c = cr.query(children, new String[]{
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE}, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    if (c.getString(0) != null
                            && !DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(1))) {
                        m.put(c.getString(0).toLowerCase(), c.getLong(2));
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return m;
    }

    private static String freeName(HashMap<String, Long> have, String name) {
        if (!have.containsKey(name.toLowerCase())) {
            return name;
        }
        int dot = name.lastIndexOf('.');
        String b = dot < 0 ? name : name.substring(0, dot), e = dot < 0 ? "" : name.substring(dot);
        int i = 2;
        while (have.containsKey((b + "_" + i + e).toLowerCase())) {
            i++;
        }
        return b + "_" + i + e;
    }

    private void vDoList(final boolean rec) {
        int g;
        synchronized (vdocs) {
            vGen++;
            g = vGen;
            vdocs.clear();
        }
        final int gen = g;
        final Uri src = vSrc, dst = vDst;
        vPool.execute(() -> {
            try {
                if (src == null) {
                    throw new Exception("Choisis d'abord le dossier à regarder.");
                }
                ContentResolver cr = getContentResolver();
                String dstId = null;
                if (dst != null && src.getAuthority().equals(dst.getAuthority())) {
                    dstId = DocumentsContract.getTreeDocumentId(dst);
                }
                ArrayList<VDoc> l = new ArrayList<>();
                walk(cr, src, DocumentsContract.getTreeDocumentId(src), "", rec, dstId, l, 0);
                Collections.sort(l, (a, b) -> {
                    int c = a.rel.toLowerCase().compareTo(b.rel.toLowerCase());
                    return c != 0 ? c : a.name.toLowerCase().compareTo(b.name.toLowerCase());
                });
                HashMap<String, Long> have = dst != null ? destNames(cr, dst) : new HashMap<String, Long>();
                org.json.JSONArray arr = new org.json.JSONArray();
                for (VDoc d : l) {
                    org.json.JSONObject o = new org.json.JSONObject();
                    o.put("n", d.name);
                    o.put("r", d.rel);
                    o.put("z", d.size);
                    o.put("m", d.mtime);
                    o.put("w", d.raw ? 1 : 0);
                    Long t = have.get(d.name.toLowerCase());
                    o.put("s", t != null && t.longValue() == d.size ? 1 : 0);
                    arr.put(o);
                }
                org.json.JSONObject res = new org.json.JSONObject();
                res.put("gen", gen);
                res.put("items", arr);
                synchronized (vdocs) {
                    if (gen != vGen) {
                        return;
                    }
                    vdocs.addAll(l);
                }
                vListJson = res.toString();
            } catch (Exception e) {
                vListJson = "{\"gen\":" + gen + ",\"err\":" + org.json.JSONObject.quote(String.valueOf(e.getMessage())) + "}";
            }
            js("window.__jmvList&&window.__jmvList(" + gen + ")");
        });
    }

    private VDoc vGet(int gen, int idx) {
        synchronized (vdocs) {
            if (gen != vGen || idx < 0 || idx >= vdocs.size()) {
                return null;
            }
            return vdocs.get(idx);
        }
    }

    private static long u32(byte[] h, int o) {
        return ((h[o] & 0xffL) << 24) | ((h[o + 1] & 0xffL) << 16) | ((h[o + 2] & 0xffL) << 8) | (h[o + 3] & 0xffL);
    }

    /** JPEG integre d'un RAW (Fuji RAF : lecture directe ; autres : le plus grand JPEG trouve). */
    private byte[] rawJpeg(ContentResolver cr, Uri u, String key) throws Exception {
        byte[] hit = rawCache.get(key);
        if (hit != null) {
            return hit;
        }
        byte[] res = null;
        try (android.os.ParcelFileDescriptor pfd = cr.openFileDescriptor(u, "r");
             java.io.FileInputStream fis = new java.io.FileInputStream(pfd.getFileDescriptor())) {
            java.nio.channels.FileChannel ch = fis.getChannel();
            java.nio.ByteBuffer hb = java.nio.ByteBuffer.allocate(100);
            ch.read(hb, 0);
            byte[] h = hb.array();
            if (new String(h, 0, 15, "ISO-8859-1").equals("FUJIFILMCCD-RAW")) {
                long off = u32(h, 84), n = u32(h, 88);
                if (off > 0 && n > 1000 && n < 64L * 1024 * 1024) {
                    java.nio.ByteBuffer b = java.nio.ByteBuffer.allocate((int) n);
                    long got = 0;
                    while (b.hasRemaining()) {
                        int r = ch.read(b, off + got);
                        if (r < 0) {
                            break;
                        }
                        got += r;
                    }
                    byte[] j = b.array();
                    if (got == n && (j[0] & 0xff) == 0xff && (j[1] & 0xff) == 0xd8) {
                        res = j;
                    }
                }
            }
            if (res == null) {
                int cap = (int) Math.min(ch.size(), 48L * 1024 * 1024);
                byte[] all = new byte[cap];
                java.nio.ByteBuffer b = java.nio.ByteBuffer.wrap(all);
                long pos = 0;
                while (b.hasRemaining()) {
                    int r = ch.read(b, pos);
                    if (r < 0) {
                        break;
                    }
                    pos += r;
                }
                int best = -1;
                long bestArea = 0;
                int found = 0;
                for (int i = 0; i + 3 < cap && found < 60; i++) {
                    if ((all[i] & 0xff) == 0xff && (all[i + 1] & 0xff) == 0xd8 && (all[i + 2] & 0xff) == 0xff) {
                        found++;
                        android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                        o.inJustDecodeBounds = true;
                        android.graphics.BitmapFactory.decodeByteArray(all, i, cap - i, o);
                        long a = (long) o.outWidth * o.outHeight;
                        if (a > bestArea) {
                            bestArea = a;
                            best = i;
                        }
                        i += 2;
                    }
                }
                if (best >= 0) {
                    res = java.util.Arrays.copyOfRange(all, best, cap);
                }
            }
        }
        if (res != null) {
            rawCache.put(key, res);
        }
        return res;
    }

    private static android.graphics.Matrix oriMatrix(int ori) {
        android.graphics.Matrix m = new android.graphics.Matrix();
        switch (ori) {
            case 2: m.setScale(-1, 1); break;
            case 3: m.setRotate(180); break;
            case 4: m.setRotate(180); m.postScale(-1, 1); break;
            case 5: m.setRotate(90); m.postScale(-1, 1); break;
            case 6: m.setRotate(90); break;
            case 7: m.setRotate(-90); m.postScale(-1, 1); break;
            case 8: m.setRotate(-90); break;
            default: break;
        }
        return m;
    }

    private int readOri(ContentResolver cr, Uri u, byte[] embedded) {
        try {
            if (embedded != null) {
                return new android.media.ExifInterface(new java.io.ByteArrayInputStream(embedded))
                        .getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
            }
            try (InputStream is = cr.openInputStream(u)) {
                return new android.media.ExifInterface(is)
                        .getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
            }
        } catch (Throwable e) {
            return 1;
        }
    }

    /** Apercu ou vignette JPEG, redresse selon l'EXIF, reduit a `max` pixels. */
    private byte[] vDecode(VDoc d, int max, int q) throws Exception {
        ContentResolver cr = getContentResolver();
        Uri u = DocumentsContract.buildDocumentUriUsingTree(vSrc, d.id);
        byte[] emb = null;
        if (d.raw) {
            emb = rawJpeg(cr, u, d.id + "|" + d.size);
            if (emb == null) {
                return null;
            }
        }
        android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        if (emb != null) {
            android.graphics.BitmapFactory.decodeByteArray(emb, 0, emb.length, o);
        } else {
            try (InputStream is = cr.openInputStream(u)) {
                android.graphics.BitmapFactory.decodeStream(is, null, o);
            }
        }
        if (o.outWidth <= 0) {
            return null;
        }
        int s = 1;
        while (Math.max(o.outWidth, o.outHeight) / (s * 2) >= max) {
            s *= 2;
        }
        android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
        o2.inSampleSize = s;
        android.graphics.Bitmap bm;
        if (emb != null) {
            bm = android.graphics.BitmapFactory.decodeByteArray(emb, 0, emb.length, o2);
        } else {
            try (InputStream is = cr.openInputStream(u)) {
                bm = android.graphics.BitmapFactory.decodeStream(is, null, o2);
            }
        }
        if (bm == null) {
            return null;
        }
        if (bm.hasAlpha()) {
            android.graphics.Bitmap b2 = android.graphics.Bitmap.createBitmap(bm.getWidth(), bm.getHeight(),
                    android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas cv = new android.graphics.Canvas(b2);
            cv.drawColor(Color.rgb(40, 40, 40));
            cv.drawBitmap(bm, 0, 0, null);
            bm = b2;
        }
        android.graphics.Matrix m = oriMatrix(readOri(cr, u, emb));
        float sc = max / (float) Math.max(bm.getWidth(), bm.getHeight());
        if (sc < 1f) {
            m.postScale(sc, sc);
        }
        android.graphics.Bitmap out2 = android.graphics.Bitmap.createBitmap(bm, 0, 0, bm.getWidth(),
                bm.getHeight(), m, true);
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        out2.compress(android.graphics.Bitmap.CompressFormat.JPEG, q, bo);
        return bo.toByteArray();
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), new java.io.ByteArrayInputStream(new byte[0]));
    }

    /** Sert /vimg/<gen>/<index>/<t|p> : vignette ou apercu d'une image du dossier regarde. */
    private WebResourceResponse vImage(String path) {
        try {
            String[] s = path.split("/");
            VDoc d = vGet(Integer.parseInt(s[2]), Integer.parseInt(s[3]));
            if (d == null || vSrc == null) {
                return notFound();
            }
            boolean thumb = s[4].startsWith("t");
            byte[] jpg = vDecode(d, thumb ? 360 : 2000, thumb ? 78 : 88);
            if (jpg == null) {
                return notFound();
            }
            HashMap<String, String> h = new HashMap<>();
            h.put("Cache-Control", "max-age=600");
            return new WebResourceResponse("image/jpeg", null, 200, "OK", h,
                    new java.io.ByteArrayInputStream(jpg));
        } catch (Throwable e) {
            return notFound();
        }
    }

    private String vDims(int gen, int idx) {
        try {
            VDoc d = vGet(gen, idx);
            if (d == null) {
                return "";
            }
            ContentResolver cr = getContentResolver();
            Uri u = DocumentsContract.buildDocumentUriUsingTree(vSrc, d.id);
            byte[] emb = d.raw ? rawJpeg(cr, u, d.id + "|" + d.size) : null;
            if (d.raw && emb == null) {
                return "";
            }
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            if (emb != null) {
                android.graphics.BitmapFactory.decodeByteArray(emb, 0, emb.length, o);
            } else {
                try (InputStream is = cr.openInputStream(u)) {
                    android.graphics.BitmapFactory.decodeStream(is, null, o);
                }
            }
            if (o.outWidth <= 0) {
                return "";
            }
            int ori = readOri(cr, u, emb);
            boolean sw = ori >= 5 && ori <= 8;
            return (sw ? o.outHeight : o.outWidth) + " × " + (sw ? o.outWidth : o.outHeight) + " px";
        } catch (Throwable e) {
            return "";
        }
    }

    private static int degOf(int o) {
        return o == 6 ? 90 : o == 3 ? 180 : o == 8 ? 270 : 0;
    }

    private static int oriOf(int deg) {
        int d = ((deg % 360) + 360) % 360;
        return d == 90 ? 6 : d == 180 ? 3 : d == 270 ? 8 : 1;
    }

    private static void copyTo(InputStream is, OutputStream os) throws Exception {
        byte[] buf = new byte[65536];
        int r;
        while ((r = is.read(buf)) > 0) {
            os.write(buf, 0, r);
        }
    }

    private String dispName(ContentResolver cr, Uri u, String fallback) {
        try (Cursor c = cr.query(u, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) {
                return c.getString(0);
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    private long docSize(ContentResolver cr, Uri u) {
        try (Cursor c = cr.query(u, new String[]{DocumentsContract.Document.COLUMN_SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                return c.getLong(0);
            }
        } catch (Exception ignored) {
        }
        return -1;
    }

    /**
     * Ecrit dans `tmp` une copie de `src` tournee de `deg` (sens horaire). JPEG : l'etiquette EXIF
     * d'orientation est modifiee (sans perte). Autres formats : pixels tournes. Renvoie null si ok,
     * ou un message si la copie a ete faite sans rotation.
     */
    private String makeRotated(ContentResolver cr, Uri src, File tmp, String e, int deg) throws Exception {
        boolean jpeg = e.equals("jpg") || e.equals("jpeg") || e.equals("jpe");
        boolean png = e.equals("png"), webp = e.equals("webp");
        int ori = 1;
        if (jpeg) {
            ori = readOri(cr, src, null);
            if (ori != 2 && ori != 4 && ori != 5 && ori != 7) {
                try (InputStream is = cr.openInputStream(src); OutputStream os = new FileOutputStream(tmp)) {
                    copyTo(is, os);
                }
                android.media.ExifInterface ex = new android.media.ExifInterface(tmp.getAbsolutePath());
                ex.setAttribute(android.media.ExifInterface.TAG_ORIENTATION,
                        String.valueOf(oriOf(degOf(ori) + deg)));
                ex.saveAttributes();
                return null;
            }
        }
        if (!jpeg && !png && !webp) {
            try (InputStream is = cr.openInputStream(src); OutputStream os = new FileOutputStream(tmp)) {
                copyTo(is, os);
            }
            return "Ce format ne peut pas être tourné : copie faite sans rotation.";
        }
        android.graphics.Bitmap bm;
        try (InputStream is = cr.openInputStream(src)) {
            bm = android.graphics.BitmapFactory.decodeStream(is);
        }
        if (bm == null) {
            throw new Exception("image illisible");
        }
        android.graphics.Matrix m = oriMatrix(ori);
        m.postRotate(deg);
        android.graphics.Bitmap r = android.graphics.Bitmap.createBitmap(bm, 0, 0, bm.getWidth(),
                bm.getHeight(), m, true);
        try (OutputStream os = new FileOutputStream(tmp)) {
            if (png) {
                r.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, os);
            } else if (webp) {
                r.compress(Build.VERSION.SDK_INT >= 30
                        ? android.graphics.Bitmap.CompressFormat.WEBP_LOSSLESS
                        : android.graphics.Bitmap.CompressFormat.WEBP, 100, os);
            } else {
                r.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, os);
            }
        }
        return null;
    }

    private void vDoCopy(final int gen, final int idx, final int deg) {
        vCopyPool.execute(() -> {
            org.json.JSONObject r = new org.json.JSONObject();
            try {
                VDoc d = vGet(gen, idx);
                if (d == null) {
                    throw new Exception("liste périmée : recharge le dossier");
                }
                if (vDst == null) {
                    throw new Exception("pas de dossier d'enregistrement");
                }
                ContentResolver cr = getContentResolver();
                Uri srcUri = DocumentsContract.buildDocumentUriUsingTree(vSrc, d.id);
                Uri dstDir = DocumentsContract.buildDocumentUriUsingTree(vDst,
                        DocumentsContract.getTreeDocumentId(vDst));
                HashMap<String, Long> have = destNames(cr, vDst);
                boolean rotate = (deg % 360) != 0 && !d.raw;
                if (!rotate) {
                    Long t = have.get(d.name.toLowerCase());
                    if (t != null && t.longValue() == d.size) {
                        r.put("ok", true);
                        r.put("already", true);
                        r.put("name", d.name);
                        r.put("size", d.size);
                        r.put("uri", "");
                        js("window.__jmvCopy&&window.__jmvCopy(" + gen + "," + idx + "," + org.json.JSONObject.quote(r.toString()) + ")");
                        return;
                    }
                }
                String name = freeName(have, d.name);
                String e = ext(d.name);
                String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(e);
                if (mime == null) {
                    mime = "application/octet-stream";
                }
                long outSize;
                Uri dstUri;
                String note = null;
                if (rotate) {
                    File tmp = new File(getCacheDir(), "vrot_" + System.nanoTime() + "." + (e.isEmpty() ? "jpg" : e));
                    try {
                        note = makeRotated(cr, srcUri, tmp, e, deg);
                        dstUri = DocumentsContract.createDocument(cr, dstDir, mime, name);
                        if (dstUri == null) {
                            throw new Exception("création du fichier refusée");
                        }
                        try (InputStream is = new java.io.FileInputStream(tmp); OutputStream os = cr.openOutputStream(dstUri)) {
                            copyTo(is, os);
                        }
                        outSize = tmp.length();
                    } finally {
                        tmp.delete();
                    }
                } else {
                    dstUri = DocumentsContract.createDocument(cr, dstDir, mime, name);
                    if (dstUri == null) {
                        throw new Exception("création du fichier refusée");
                    }
                    long cnt = 0;
                    try (InputStream is = cr.openInputStream(srcUri); OutputStream os = cr.openOutputStream(dstUri)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = is.read(buf)) > 0) {
                            os.write(buf, 0, n);
                            cnt += n;
                        }
                    }
                    outSize = cnt;
                    if (d.size > 0 && cnt != d.size) {
                        try {
                            DocumentsContract.deleteDocument(cr, dstUri);
                        } catch (Exception ignored) {
                        }
                        throw new Exception("copie incomplète");
                    }
                }
                r.put("ok", true);
                r.put("already", false);
                r.put("name", dispName(cr, dstUri, name));
                r.put("size", outSize);
                r.put("uri", dstUri.toString());
                if (note != null) {
                    r.put("note", note);
                }
            } catch (Throwable ex) {
                try {
                    r = new org.json.JSONObject();
                    r.put("ok", false);
                    r.put("err", String.valueOf(ex.getMessage()));
                } catch (Exception ignored) {
                }
            }
            js("window.__jmvCopy&&window.__jmvCopy(" + gen + "," + idx + "," + org.json.JSONObject.quote(r.toString()) + ")");
        });
    }

    private void vDoRotSaved(final String tag, final String uriStr, final int deg) {
        vCopyPool.execute(() -> {
            org.json.JSONObject r = new org.json.JSONObject();
            try {
                ContentResolver cr = getContentResolver();
                Uri u = Uri.parse(uriStr);
                String nm = dispName(cr, u, "x.jpg");
                String e = ext(nm);
                File tmp = new File(getCacheDir(), "vrs_" + System.nanoTime() + "." + (e.isEmpty() ? "jpg" : e));
                try {
                    String note = makeRotated(cr, u, tmp, e, deg);
                    if (note != null) {
                        throw new Exception(note);
                    }
                    try (InputStream is = new java.io.FileInputStream(tmp); OutputStream os = cr.openOutputStream(u, "wt")) {
                        copyTo(is, os);
                    }
                    r.put("ok", true);
                    r.put("name", nm);
                    r.put("size", tmp.length());
                } finally {
                    tmp.delete();
                }
            } catch (Throwable ex) {
                try {
                    r = new org.json.JSONObject();
                    r.put("ok", false);
                    r.put("err", String.valueOf(ex.getMessage()));
                } catch (Exception ignored) {
                }
            }
            js("window.__jmvRot&&window.__jmvRot(" + org.json.JSONObject.quote(tag) + "," + org.json.JSONObject.quote(r.toString()) + ")");
        });
    }

    private Uri findOrMakeDir(ContentResolver cr, Uri tree, Uri parent, String name) throws Exception {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree,
                DocumentsContract.getDocumentId(parent));
        try (Cursor c = cr.query(children, new String[]{
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE}, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))
                        && DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                }
            }
        }
        Uri n = DocumentsContract.createDocument(cr, parent, DocumentsContract.Document.MIME_TYPE_DIR, name);
        if (n == null) {
            throw new Exception("dossier " + name + " impossible à créer");
        }
        return n;
    }

    /** Suppression sans danger : l'image est DEPLACEE dans un dossier _SUPPRIMES (recuperable). */
    private void vDoDelete(final int gen, final int idx) {
        vCopyPool.execute(() -> {
            org.json.JSONObject r = new org.json.JSONObject();
            try {
                VDoc d = vGet(gen, idx);
                if (d == null) {
                    throw new Exception("liste périmée : recharge le dossier");
                }
                ContentResolver cr = getContentResolver();
                Uri srcUri = DocumentsContract.buildDocumentUriUsingTree(vSrc, d.id);
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(vSrc, d.parent);
                Uri root = DocumentsContract.buildDocumentUriUsingTree(vSrc,
                        DocumentsContract.getTreeDocumentId(vSrc));
                Uri trash = findOrMakeDir(cr, vSrc, root, "_SUPPRIMES");
                Uri moved = null;
                try {
                    moved = DocumentsContract.moveDocument(cr, srcUri, parent, trash);
                } catch (Exception ignored) {
                }
                if (moved == null) {
                    String e = ext(d.name);
                    String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(e);
                    if (mime == null) {
                        mime = "application/octet-stream";
                    }
                    Uri t = DocumentsContract.createDocument(cr, trash, mime, d.name);
                    if (t == null) {
                        throw new Exception("copie de sécurité impossible");
                    }
                    long cnt = 0;
                    try (InputStream is = cr.openInputStream(srcUri); OutputStream os = cr.openOutputStream(t)) {
                        byte[] buf = new byte[65536];
                        int n;
                        while ((n = is.read(buf)) > 0) {
                            os.write(buf, 0, n);
                            cnt += n;
                        }
                    }
                    if (d.size > 0 && cnt != d.size) {
                        try {
                            DocumentsContract.deleteDocument(cr, t);
                        } catch (Exception ignored) {
                        }
                        throw new Exception("copie de sécurité incomplète : l'image n'a pas été touchée");
                    }
                    if (!DocumentsContract.deleteDocument(cr, srcUri)) {
                        try {
                            DocumentsContract.deleteDocument(cr, t);
                        } catch (Exception ignored) {
                        }
                        throw new Exception("le dossier refuse la suppression : l'image n'a pas été touchée");
                    }
                }
                r.put("ok", true);
                r.put("where", "dossier _SUPPRIMES");
            } catch (Throwable ex) {
                try {
                    r = new org.json.JSONObject();
                    r.put("ok", false);
                    r.put("err", String.valueOf(ex.getMessage()));
                } catch (Exception ignored) {
                }
            }
            js("window.__jmvDel&&window.__jmvDel(" + gen + "," + idx + "," + org.json.JSONObject.quote(r.toString()) + ")");
        });
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
