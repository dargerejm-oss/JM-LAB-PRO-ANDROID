/* Regard Pur - interface : grille, vue en grand, comparaison, tri automatique, export */
"use strict";
(function () {
var $ = function (id) { return document.getElementById(id); };
var N = window.RPNative || null;               // partie PC (absente dans un simple navigateur)
var RAWX = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|srw|x3f|3fr|iiq|rwl|mrw|kdc|erf)$/i;
var IMGX = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif|hif)$/i, HEICX = /\.(heic|heif|hif)$/i;

var S = {
  photos: [], byId: {}, view: [], cur: -1, sel: new Set(), filter: "all", dir: null, groups: [], openGroup: -1,
  undo: [], analysing: false, saveT: 0
};

/* ---------------- petits outils ---------------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function avg(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
function toast(t, ms) { var e = $("toast"); e.innerHTML = t; e.style.display = "block"; clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = "none"; }, ms || 2600); }
function join() { var a = Array.prototype.slice.call(arguments), sep = N ? N.sep : "/"; return a.join(sep).replace(/[\\\/]+/g, sep); }
function strHash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function ham(a, b) { if (!a || !b) return 64; var d = 0; for (var i = 0; i < a.length; i++) { var x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; }
function colDist(a, b) { if (!a || !b) return 999; var s = 0; for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; }
function when(p) { return p.a && p.a.exif && p.a.exif.date ? p.a.exif.date : p.mtime || 0; }
function fmtDate(t) { if (!t) return ""; var d = new Date(t); return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR"); }

/* plus grande image JPEG cachee dans un RAW (version navigateur ; sur PC c'est fait par la partie Windows) */
function rawPreview(buf) {
  var best = null;
  for (var i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0xFF || buf[i + 1] !== 0xD8 || buf[i + 2] !== 0xFF) continue;
    var j = i + 2, ok = false;
    while (j < buf.length - 4) { if (buf[j] !== 0xFF) break; if (buf[j + 1] === 0xDA) { ok = true; break; } j += 2 + (buf[j + 2] << 8 | buf[j + 3]); }
    if (!ok) continue;
    var k = j; while (k < buf.length - 1 && !(buf[k] === 0xFF && buf[k + 1] === 0xD9)) k++;
    if (!best || k + 2 - i > best.len) best = {start: i, len: k + 2 - i};
    i = k;
  }
  return best && best.len > 20000 ? buf.subarray(best.start, best.start + best.len) : null;
}
async function readBytes(p) {
  if (N) return await N.read(p.path, p.raw);
  var b = new Uint8Array(await p.file.arrayBuffer());
  return p.raw ? rawPreview(b) : b;
}

/* ---------------- score ---------------- */
var TH = { // seuils selon l'exigence : souple / normale / stricte
  sharp: [18, 28, 40], eye: [12, 20, 28], motion: [85, 70, 55], hi: [22, 12, 7], lo: [50, 32, 20], dark: [26, 36, 48], keep: [48, 58, 68], burst: [28, 16, 8]
};
function strict() { return +$("sStrict").value; }
function bigFaces(a) { return (a && a.faces || []).filter(function (f) { return f.w > 0.035; }); }
function expoScore(a) {
  var e = a.expo, s = 100, fl = bigFaces(a).filter(function (x) { return x.lum != null; }).map(function (x) { return x.lum; });
  if (fl.length && avg(fl) >= 55 && avg(fl) <= 225) return clamp(Math.round(100 - Math.max(0, e.hi - 8) * 1.5 - Math.max(0, e.lo - 15)), 60, 100); s -= Math.max(0, e.hi - 1.5) * 5; s -= Math.max(0, e.lo - 4) * 3;
  var d = Math.abs(e.mean - 118); if (d > 55) s -= (d - 55) * 2; return clamp(Math.round(s), 0, 100);
}
/* nettete des yeux mesuree (le visage le plus net) ; reglee sur de vraies photos :
   portraits nets 30 a 70, flou d'1 pixel 15 a 27, flou de 2 pixels 2 a 10 */
function eyeRaw(a) { var f = bigFaces(a); if (!f.length) return null; return Math.max.apply(null, f.map(function (x) { return x.eyeSharp != null ? x.eyeSharp : (x.faceSharp != null ? x.faceSharp : 0); })); }
function sharpEff(a) {
  var e = eyeRaw(a);
  return Math.round(e == null ? a.sharp : Math.min(100, Math.max(e * 1.45, a.sharp * 0.6)));
}
function eyesScore(a) { var f = bigFaces(a); return f.length ? avg(f.map(function (x) { return x.closed ? 0 : x.half ? 50 : 100; })) : null; }
var NF = 8;
function aesScore(a) { return a.aes == null ? null : clamp(Math.round((a.aes - 3.0) / (5.5 - 3.0) * 100), 0, 100); }
function feat(a) { var e = eyesScore(a), f = bigFaces(a), ae = aesScore(a); return [1, sharpEff(a) / 100, expoScore(a) / 100, e == null ? 0.7 : e / 100, f.length ? avg(f.map(function (x) { return x.smile; })) : 0, (a.motion || 0) / 100, f.length ? 1 : 0, ae == null ? 0.5 : ae / 100]; }
function baseScore(a) {
  var se = sharpEff(a), ex = expoScore(a), e = eyesScore(a), f = bigFaces(a), s;
  if (e == null) s = 0.72 * se + 0.28 * ex;
  else s = 0.45 * se + 0.2 * ex + 0.35 * e + 5 * avg(f.map(function (x) { return x.smile; }));
  if (a.motion > 40) s -= (a.motion - 40) * 0.35;
  // une photo floue ou mal exposee ne peut pas avoir une bonne note, meme si le reste va bien
  s = Math.min(s, se + 25, ex + 25);
  // oeil artistique : lumiere, couleurs, composition (modele NIMA, sur le PC)
  var ae = aesScore(a); if (ae != null) s = s * 0.8 + Math.min(ae, s + 20) * 0.2;
  return clamp(Math.round(s), 0, 100);
}
/* apprentissage : le score s'adapte a vos choix P / X (regression logistique simple) */
var L = (function () { try { return JSON.parse(localStorage.getItem("rp_learn")) || null; } catch (e) { return null; } })() || {w: [], ex: [], n: 0};
if (!L.ex.length || L.ex[0].x.length !== NF) { L.ex = (L.ex || []).filter(function (o) { return o.x.length === NF; }); L.w = []; }
function sig(z) { return 1 / (1 + Math.exp(-z)); }
function learnFrom(p, keep) {
  if (!p.a || p.a.err) return;
  L.ex.push({x: feat(p.a), y: keep ? 1 : 0}); if (L.ex.length > 800) L.ex.shift(); L.n++;
  var w = new Array(NF).fill(0);
  for (var it = 0; it < 200; it++) {
    var g = new Array(NF).fill(0);
    L.ex.forEach(function (o) { var z = 0; for (var i = 0; i < NF; i++) z += w[i] * o.x[i]; var d = sig(z) - o.y; for (i = 0; i < NF; i++) g[i] += d * o.x[i]; });
    for (var i = 0; i < NF; i++) w[i] -= 0.5 * (g[i] / L.ex.length + 0.01 * w[i]);
  }
  L.w = w; try { localStorage.setItem("rp_learn", JSON.stringify(L)); } catch (e) {}
}
function score(p) {
  if (!p.a || p.a.err) return 0;
  var b = baseScore(p.a), keeps = L.ex.filter(function (o) { return o.y; }).length;
  if (L.ex.length < 15 || keeps < 3 || keeps > L.ex.length - 3 || L.w.length !== NF) return b;
  var x = feat(p.a), z = 0; for (var i = 0; i < NF; i++) z += L.w[i] * x[i];
  var al = Math.min(0.4, L.ex.length / 150);
  return clamp(Math.round(b * (1 - al) + sig(z) * 100 * al), 0, 100);
}

/* ---------------- raisons (pourquoi garder / rejeter) ---------------- */
/* ---------------- categories de seance (reprises de « Vrai Regard », sans doublon avec ProLab) ----------------
   cibles : niveaux visés (L*, 0-100) pour ombres, sombres, moyens, clairs, hautes lumières ; peau : protection de la peau ;
   prof : profil JM LAB PRO conseillé ; ev / wb / tint : petits décalages. */
var CATS = {
  "mariage":     {nom: "Mariage", cibles: [18, 35, 50, 70, 86], peau: 0.85, prof: "Astia", ev: 0.18, wb: 6, tint: 2},
  "portrait":    {nom: "Portrait", cibles: [15, 32, 48, 68, 85], peau: 0.90, prof: "Astia", ev: 0.15, wb: 5, tint: 0},
  "famille":     {nom: "Famille / groupe", cibles: [16, 34, 50, 70, 86], peau: 0.85, prof: "Provia", ev: 0.15, wb: 5, tint: 1},
  "contre-jour": {nom: "Contre-jour", cibles: [22, 38, 52, 68, 84], peau: 0.90, prof: "Provia", ev: 0.27, wb: 8, tint: 0},
  "plage":       {nom: "Plage", cibles: [12, 30, 48, 70, 86], peau: 0.80, prof: "Astia", ev: 0.0, wb: 3, tint: 0},
  "paysage":     {nom: "Paysage", cibles: [10, 30, 48, 70, 88], peau: 0.60, prof: "Velvia", ev: 0.0, wb: 2, tint: 0},
  "nuit":        {nom: "Nuit", cibles: [10, 28, 45, 65, 82], peau: 0.80, prof: "Classic Chrome", ev: 0.2, wb: 8, tint: 3}
};
function guessCat(a) {
  if (!a || a.err) return "portrait";
  var f = bigFaces(a), col = a.col || [];
  if (f.length) {
    var fl = avg(f.filter(function (x) { return x.lum != null; }).map(function (x) { return x.lum; }));
    if (a.expo.hi > 6 && fl && fl < a.expo.mean - 10) return "contre-jour";
    return f.length >= 3 ? "famille" : "portrait";
  }
  // nuit : seulement si la prise de vue le confirme (heure, ISO eleves, pose longue) ; une photo de jour ratee reste « trop sombre »
  var ex = a.exif || {}, hr = ex.date ? new Date(ex.date).getHours() : 12;
  if (a.expo.mean < 80 && (hr >= 20 || hr < 6 || (ex.iso || 0) >= 1600 || (ex.speed || 0) >= 1 / 30)) return "nuit";
  // ciel bleu en haut, sable clair et chaud en bas
  var top = [0, 0, 0], bot = [0, 0, 0];
  for (var i = 0; i < 4; i++) for (var k = 0; k < 3; k++) { top[k] += (col[i * 3 + k] || 0) / 4; bot[k] += (col[36 + i * 3 + k] || 0) / 4; }
  if (top[2] > top[0] + 15 && bot[0] > 140 && bot[0] >= bot[1] && bot[1] > bot[2]) return "plage";
  return "paysage";
}
function catOf(p) { var c = $("sCat").value; return c === "auto" ? guessCat(p.a) : c; }

function reasons(p) {
  var a = p.a, k = strict(), rej = [], warn = [], good = [];
  if (!a) return {rej: rej, warn: ["Analyse en cours…"], good: good};
  if (a.err) return {rej: ["Image illisible"], warn: [], good: []};
  var se = sharpEff(a), f = bigFaces(a), er = eyeRaw(a);
  if (er != null ? er < TH.eye[k] : se < TH.sharp[k]) rej.push(f.length ? "Visage / yeux flous" : "Floue");
  else if (er != null ? er < TH.eye[k] + 8 : se < TH.sharp[k] + 12) warn.push("Netteté moyenne");
  else good.push(f.length ? "Yeux nets" : "Nette");
  if (a.motion >= TH.motion[k] && a.sharp < 70) rej.push("Flou de bougé");
  else if (a.motion >= TH.motion[k] - 20 && a.sharp < 70) warn.push("Léger bougé");
  if (f.length) {
    var cl = f.filter(function (x) { return x.closed; }).length, hf = f.filter(function (x) { return x.half; }).length;
    if (cl === f.length) rej.push(f.length > 1 ? "Yeux fermés (tout le monde)" : "Yeux fermés");
    else if (cl) (k >= 1 ? rej : warn).push("Yeux fermés (" + cl + " sur " + f.length + ")");
    else if (hf) warn.push("Yeux mi-clos");
    else good.push(f.length > 1 ? f.length + " visages, yeux ouverts" : "Yeux ouverts");
    if (avg(f.map(function (x) { return x.smile; })) > 0.55) good.push("Sourire");
  }
  // portrait : si le visage est bien expose, un fond tres clair ou tres sombre est un choix, pas une erreur
  var fl = f.filter(function (x) { return x.lum != null; }).map(function (x) { return x.lum; }), faceOk = fl.length && avg(fl) >= 55 && avg(fl) <= 225;
  // la categorie change ce qui est normal : nuit sombre, contre-jour et plage tres clairs, robe blanche au mariage
  var cat = catOf(p), hiTol = {"contre-jour": 99, "plage": 8, "mariage": 10}[cat] || 0, dark = cat === "nuit";
  if (a.expo.hi > TH.hi[k] + hiTol) (faceOk ? warn : rej).push(faceOk ? "Fond très clair" : "Très surexposée"); else if (a.expo.hi > 4 + hiTol) warn.push(cat === "contre-jour" ? "Contre-jour : ciel très clair" : "Blancs brûlés (" + a.expo.hi + " %)");
  if ((a.expo.lo > TH.lo[k] || a.expo.mean < TH.dark[k]) && !dark) (faceOk ? warn : rej).push(faceOk ? "Fond très sombre" : "Très sombre"); else if (a.expo.mean < (dark ? 18 : 62) && !faceOk) warn.push(dark ? "Nuit très sombre" : "Sombre");
  // composition
  if (f.some(function (x) { return x.x < 0.004 || x.y < 0.004 || x.x + x.w > 0.996 || x.y + x.h > 0.996; }) && f.length) warn.push("Visage coupé par le bord");
  if (f.length >= 2) { var turned = f.filter(function (x) { return x.yaw != null && Math.abs(x.yaw) > 0.42; }).length; if (turned) warn.push(turned + " personne" + (turned > 1 ? "s tournent" : " tourne") + " la tête"); }
  if (a.tilt) warn.push("Horizon penché (" + Math.abs(a.tilt).toFixed(1).replace(".", ",") + "°)");
  var ae = aesScore(a); if (ae != null && ae >= 72) good.push("Belle image (œil artistique)");
  var g = p.g >= 0 ? S.groups[p.g] : null;
  if (g) {
    if (p.best) good.push("Meilleure de la série (" + g.length + " photos)");
    else { var b = S.byId[g.best]; if (b && b.score - p.score > TH.burst[k]) rej.push("Moins bonne de la série"); else warn.push("Série de " + g.length + " : la meilleure est mise en avant"); }
  }
  return {rej: rej, warn: warn, good: good};
}

/* ---------------- groupes : rafales et doublons ---------------- */
function similar(p, q) {
  if (!p.a || !q.a || p.a.err || q.a.err) return false;
  var dt = Math.abs(when(p) - when(q)) / 1000, h = ham(p.a.hash, q.a.hash), c = colDist(p.a.col, q.a.col);
  if (dt <= 2.5 && h <= 22 && c < 40) return true;     // rafale
  if (h <= 10 && c < 22 && dt <= 180) return true;     // meme scene, quelques instants plus tard
  if (h <= 4 && c < 10) return true;                    // doublon (copie)
  return false;
}
function buildGroups() {
  var list = S.photos.filter(function (p) { return p.a && !p.a.err; }).sort(function (a, b) { return when(a) - when(b) || (a.name < b.name ? -1 : 1); });
  var groups = [], g = null;
  S.photos.forEach(function (p) { p.g = -1; p.best = false; });
  list.forEach(function (p) {
    if (g && (similar(p, g[g.length - 1]) || (g.length > 1 && similar(p, g[0])))) g.push(p); else { g = [p]; groups.push(g); }
  });
  S.groups = [];
  groups.forEach(function (arr) {
    if (arr.length < 2) return;
    var gi = S.groups.length, best = arr[0];
    arr.forEach(function (p) { p.g = gi; if (p.score > best.score) best = p; });
    best.best = true;
    var ids = arr.map(function (p) { return p.id; }); ids.best = best.id; S.groups.push(ids);
  });
}
function rescore() { S.photos.forEach(function (p) { p.score = score(p); }); buildGroups(); S.photos.forEach(function (p) { p.why = reasons(p); }); }

/* ---------------- ouverture d'un dossier ---------------- */
async function openFolder() {
  if (!N) { $("fallbackPick").click(); return; }
  var dir = await N.pickFolder(); if (!dir) return;
  var list = await N.list(dir);
  await load(dir, list.map(function (o) { return {id: o.rel, name: o.name, path: o.path, rel: o.rel, size: o.size, mtime: o.mtime, raw: o.raw, heic: o.heic}; }));
}
$("fallbackPick").addEventListener("change", function () {
  var fs = Array.prototype.filter.call(this.files, function (f) { return IMGX.test(f.name) || RAWX.test(f.name); });
  var root = fs.length ? (fs[0].webkitRelativePath || fs[0].name).split("/")[0] : "Dossier";
  load(null, fs.map(function (f) { var rel = f.webkitRelativePath || f.name; return {id: rel, name: f.name, rel: rel, size: f.size, mtime: f.lastModified, raw: RAWX.test(f.name), heic: HEICX.test(f.name), file: f}; }), root);
  this.value = "";
});
function sessPath(n) { return join(S.dir, ".regardpur", n); }
async function load(dir, items, label) {
  if (!items.length) { toast("Aucune photo dans ce dossier."); return; }
  stopAnalysis();
  S.photos.forEach(function (p) { if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl); });
  persNames = {}; PERS = []; descQueue = []; $("sCat").value = "auto"; $("tClient").value = "";
  S.dir = dir; S.photos = items; S.byId = {}; S.sel.clear(); S.cur = 0; S.openGroup = -1; S.undo = []; S.filter = "all";
  items.forEach(function (p) { p.status = ""; p.auto = false; p.stars = 0; p.a = null; p.score = 0; p.g = -1; S.byId[p.id] = p; });
  $("folderName").textContent = (dir || label || "") + " — " + items.length + " photos";
  // reprise de la session precedente (choix + analyses + vignettes deja faites)
  if (N && dir) {
    try {
      var t = await N.readText(sessPath("session.json"));
      if (t) { var ss = JSON.parse(t); persNames = ss.persons || {}; if (ss.cat && CATS[ss.cat] || ss.cat === "auto") $("sCat").value = ss.cat; $("tClient").value = ss.client || ""; Object.keys(ss.photos || {}).forEach(function (k) { var p = S.byId[k], o = ss.photos[k]; if (!p) return; p.status = o.st || ""; p.auto = !!o.au; p.stars = o.s || 0; p.adj = o.adj || null; if (o.a && o.sz === p.size) { p.a = o.a; p.cached = true; } }); }
    } catch (e) {}
  }
  $("empty").style.display = "none"; $("grid").style.display = "grid";
  ["bAuto", "bCompare", "bExport", "bStats"].forEach(function (b) { $(b).disabled = false; });
  rescore(); buildPersons(); buildCards(); refresh(); updLearn();
  var todo = S.photos.filter(function (p) { return !p.a; });
  // session reprise : note artistique des photos qui n'en ont pas encore (vignettes chargees petit a petit)
  S.photos.filter(function (p) { return p.a && !p.a.err && p.a.aes == null; }).forEach(function (p, i) { setTimeout(function () { if (p.thumbUrl) queueNima(p); else loadThumb(p); }, 50 + i * 5); });
  if (todo.length) { quickThumbs(todo); analyse(todo); } else toast("Session reprise : " + items.length + " photos déjà analysées.");
}
function saveSoon() {
  if (!N || !S.dir) return;
  clearTimeout(S.saveT);
  S.saveT = setTimeout(function () {
    var o = {v: 1, saved: Date.now(), photos: {}, persons: persNames, cat: $("sCat").value, client: $("tClient").value};
    S.photos.forEach(function (p) { o.photos[p.id] = {st: p.status, au: p.auto, s: p.stars, sz: p.size, a: p.a, adj: p.adj || undefined}; });
    N.writeText(sessPath("session.json"), JSON.stringify(o));
  }, 700);
}

/* ---------------- vignettes immediates : petite image cachee dans la photo (EXIF), avant l'analyse ---------------- */
var ROT = {3: 180, 6: 90, 8: -90};
function quickThumbs(list) {
  var rid = runId + 1, i = 0, order = {}; S.view.forEach(function (id, k) { order[id] = k; });
  list = list.slice().sort(function (a, b) { return (order[a.id] == null ? 1e9 : order[a.id]) - (order[b.id] == null ? 1e9 : order[b.id]); });
  function next() {
    if (i >= list.length || rid < runId) return Promise.resolve();
    var p = list[i++];
    if (p.thumbUrl) return next();
    var head = N ? N.readHead(p.path, 262144) : p.file.slice(0, 262144).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return head.then(function (h) {
      return Promise.all([window.exifr.thumbnail(h).catch(function () { return null; }), window.exifr.orientation(h).catch(function () { return 1; })]).then(function (r) {
        if (r[0] && r[0].length > 500 && !p.thumbUrl) { p.thumbUrl = URL.createObjectURL(new Blob([r[0]], {type: "image/jpeg"})); p.quick = ROT[r[1]] || 0.001; updCard(p); if (S.view[S.cur] === p.id) showPanel(); }
      });
    }).catch(function () {}).then(next);
  }
  if (window.exifr) for (var k = 0; k < 4; k++) next();
}

/* ---------------- analyse en arriere-plan ---------------- */
var pool = [], queue = [], runId = 0, doneN = 0, totalN = 0;
function stopAnalysis() { runId++; queue = []; pool.forEach(function (w) { w.inflight = 0; }); }
function ensurePool() {
  if (pool.length) return;
  var n = clamp((navigator.hardwareConcurrency || 4) - 1, 1, 4);
  for (var i = 0; i < n; i++) {
    var w = new Worker("analyse.js"); w.inflight = 0; w.jobs = {};
    w.onmessage = onResult.bind(null, w); pool.push(w);
  }
}
function analyse(list) {
  ensurePool();
  // une analyse est deja en cours : on ajoute a la file sans l'interrompre
  if (S.analysing && queue.length) { list.forEach(function (p) { if (queue.indexOf(p) < 0) { queue.push(p); totalN++; } }); prog(); pump(); return; }
  runId++;
  // d'abord les photos visibles, dans l'ordre de la grille
  var order = {}; S.view.forEach(function (id, i) { order[id] = i; });
  queue = list.slice().sort(function (a, b) { return (order[a.id] == null ? 1e9 : order[a.id]) - (order[b.id] == null ? 1e9 : order[b.id]); });
  doneN = 0; totalN = queue.length; S.analysing = true; prog(); pump();
}
function pump() {
  var rid = runId;
  pool.forEach(function (w) {
    while (w.inflight < 2 && queue.length) {
      var p = queue.shift(); w.inflight++;
      (function (p, w) {
        readBytes(p).then(function (buf) {
          if (rid !== runId) { w.inflight--; return; }
          if (!buf) { w.inflight--; done(p, {err: "Aperçu introuvable dans ce RAW"}); return; }
          var copy = buf.buffer.byteLength === buf.byteLength ? buf : buf.slice();
          w.jobs[p.id] = rid; w.postMessage({id: p.id, buf: copy, heic: !!p.heic}, [copy.buffer]);
        }, function () { w.inflight--; done(p, {err: "Fichier illisible"}); });
      })(p, w);
    }
  });
}
function onResult(w, e) {
  var r = e.data; if (r.log) { console.log(r.log); return; } if (r.ready) return;
  if (r.dev !== undefined) { var cbd = devWait[r.id]; delete devWait[r.id]; if (cbd) cbd(r); return; }
  if (r.full !== undefined) { var cb = fullWait[r.id]; delete fullWait[r.id]; if (cb) cb(r.full); return; }
  if (w.jobs[r.id] == null) return;
  var rid = w.jobs[r.id]; delete w.jobs[r.id]; w.inflight--;
  if (rid !== runId) { pump(); return; }
  var p = S.byId[r.id]; if (p) done(p, r);
  pump();
}
function done(p, r) {
  if (r.thumb) {
    if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
    p.thumbUrl = URL.createObjectURL(r.thumb); p.quick = 0;
    if (N && S.dir) r.thumb.arrayBuffer().then(function (b) { N.writeBin(sessPath(join("vignettes", strHash(p.id) + ".jpg")), new Uint8Array(b)); });
    delete r.thumb;
  }
  delete r.id;
  (r.faces || []).forEach(function (f) { if (f.px) { if (f.w > 0.035) descQueue.push({p: p, f: f, px: f.px}); delete f.px; } });
  p.a = r; p.score = score(p); p.why = reasons(p); runDesc(); queueNima(p);
  doneN++; prog(); updCard(p);
  if (S.view[S.cur] === p.id) showPanel();
  if (doneN >= totalN) { S.analysing = false; prog(); rescore(); refresh(); saveSoon(); toast("Analyse terminée : " + totalN + " photos. Touchez <b>✨ Tri automatique</b> ou triez vous-même (P / X)."); }
  else if (doneN % 25 === 0) { rescore(); refresh(); saveSoon(); }
}
function prog() {
  var e = $("prog"); if (!S.analysing) { e.style.display = "none"; return; }
  e.style.display = "block"; $("progBar").style.width = (doneN / Math.max(1, totalN) * 100) + "%";
  $("progTxt").textContent = "Analyse " + doneN + " / " + totalN;
}
/* vignettes deja faites (session reprise) : chargees quand elles deviennent visibles */
var io = new IntersectionObserver(function (es) {
  es.forEach(function (en) {
    if (!en.isIntersecting) return;
    var p = S.byId[en.target.dataset.id]; if (p) loadThumb(p);
  });
}, {root: $("grid"), rootMargin: "400px"});
function loadThumb(p) {
    if (!p || p.thumbUrl || p.loadingT || !N || !S.dir) return;
    p.loadingT = true;
    N.read(sessPath(join("vignettes", strHash(p.id) + ".jpg")), false).then(function (b) {
      p.loadingT = false;
      if (b && b.length) { p.thumbUrl = URL.createObjectURL(new Blob([b], {type: "image/jpeg"})); updCard(p); if (S.view[S.cur] === p.id) showPanel(); queueNima(p); }
      else if (p.a) { p.a = null; analyse([p]); }
    }, function () { p.loadingT = false; if (p.a) { p.a = null; analyse([p]); } });
}

/* ---------------- personnes : reconnaissance des visages (face-api, sans internet) ---------------- */
var descQueue = [], descBusy = false, faNet = null, PERS = [], persNames = {};
function loadFaceNet() {
  if (faNet) return faNet;
  faNet = (async function () {
    if (!window.faceapi) return null;
    try {
      try { await faceapi.tf.setBackend("webgl"); } catch (e) { await faceapi.tf.setBackend("cpu"); }
      await faceapi.tf.ready();
      await faceapi.nets.faceRecognitionNet.loadFromUri("vendor/faceapi");
      return faceapi;
    } catch (e) { console.log("personnes indisponibles : " + e.message); return null; }
  })();
  return faNet;
}
/* ---------------- oeil artistique (NIMA MobileNet, idealo, licence Apache 2.0) ---------------- */
var nimaQueue = [], nimaBusy = false, nimaNet = null;
function loadNima() {
  if (nimaNet) return nimaNet;
  nimaNet = (async function () {
    try {
      var fa = await loadFaceNet(); if (!fa) return null; var tf = fa.tf;
      var man = await (await fetch("vendor/nima/nima.json")).json(), buf = new Float32Array(await (await fetch("vendor/nima/nima.bin")).arrayBuffer()), W = {};
      man.forEach(function (m) { var n = m.s.reduce(function (a, b) { return a * b; }, 1); W[m.n] = tf.tensor(buf.subarray(m.o, m.o + n), m.s); });
      return {tf: tf, W: W};
    } catch (e) { console.log("oeil artistique indisponible : " + e.message); return null; }
  })();
  return nimaNet;
}
var NSTR = [1, 2, 1, 2, 1, 2, 1, 1, 1, 1, 1, 2, 1];
function nimaScore(net, c) {
  var tf = net.tf, W = net.W;
  return tf.tidy(function () {
    var x = tf.browser.fromPixels(c).toFloat().div(127.5).sub(1).expandDims(0);
    x = tf.pad(x, [[0, 0], [0, 1], [0, 1], [0, 0]]);
    x = tf.relu6(tf.conv2d(x, W["conv1.w"], 2, "valid").add(W["conv1.b"]));
    for (var i = 1; i <= 13; i++) {
      var st = NSTR[i - 1];
      if (st === 2) x = tf.pad(x, [[0, 0], [0, 1], [0, 1], [0, 0]]);
      x = tf.relu6(tf.depthwiseConv2d(x, W["dw" + i + ".w"], st, st === 2 ? "valid" : "same").add(W["dw" + i + ".b"]));
      x = tf.relu6(tf.conv2d(x, W["pw" + i + ".w"], 1, "same").add(W["pw" + i + ".b"]));
    }
    var p = tf.softmax(tf.matMul(x.mean([1, 2]), W["dense.w"]).add(W["dense.b"])).dataSync(), m = 0;
    for (var k = 0; k < 10; k++) m += (k + 1) * p[k];
    return m;
  });
}
function queueNima(p) { if (p.a && !p.a.err && p.a.aes == null && p.thumbUrl && nimaQueue.indexOf(p) < 0) { nimaQueue.push(p); runNima(); } }
async function runNima() {
  if (nimaBusy || !nimaQueue.length) return;
  nimaBusy = true;
  var net = await loadNima(), c = document.createElement("canvas"); c.width = c.height = 224; var x = c.getContext("2d"), n = 0;
  while (net && nimaQueue.length) {
    var p = nimaQueue.shift();
    try {
      var im = new Image(); im.src = p.thumbUrl; await im.decode();
      x.drawImage(im, 0, 0, 224, 224);
      p.a.aes = Math.round(nimaScore(net, c) * 100) / 100; p.score = score(p); p.why = reasons(p); updCard(p);
      if (S.view[S.cur] === p.id) showPanel();
    } catch (e) {}
    if (++n % 8 === 0) await new Promise(function (r) { setTimeout(r, 0); });
  }
  nimaBusy = false;
  if (n) { rescore(); refresh(false); saveSoon(); }
}

async function runDesc() {
  if (descBusy || !descQueue.length) return;
  descBusy = true;
  var fa = await loadFaceNet();
  var c = document.createElement("canvas"); c.width = c.height = 150; var x = c.getContext("2d");
  var ic = document.createElement("canvas"); ic.width = ic.height = 56;
  while (descQueue.length) {
    var j = descQueue.shift();
    try {
      x.putImageData(new ImageData(new Uint8ClampedArray(j.px), 150, 150), 0, 0);
      ic.getContext("2d").drawImage(c, 20, 14, 110, 110, 0, 0, 56, 56); j.f.ic = ic.toDataURL("image/jpeg", 0.75);
      if (fa) { var d = await fa.computeFaceDescriptor(c); j.f.d = Array.prototype.map.call(d, function (v) { return Math.round(v * 1000) / 1000; }); }
    } catch (e) {}
    if (descQueue.length % 10 === 0) await new Promise(function (r) { setTimeout(r, 0); });
  }
  descBusy = false;
  buildPersons(); drawPersons(); saveSoon();
}
function dist(a, b) { var s = 0; for (var i = 0; i < a.length; i++) { var t = a[i] - b[i]; s += t * t; } return Math.sqrt(s); }
function buildPersons() {
  var faces = [];
  S.photos.slice().sort(function (a, b) { return when(a) - when(b); }).forEach(function (p) { bigFaces(p.a).forEach(function (f) { if (f.d) faces.push({p: p, f: f}); }); });
  var cl = [];
  faces.forEach(function (o) {
    var best = null, bd = 0.52;
    cl.forEach(function (c) { var d = dist(o.f.d, c.cen); if (d < bd) { bd = d; best = c; } });
    if (best) { best.items.push(o); var n = best.items.length; best.cen = best.cen.map(function (v, i) { return v + (o.f.d[i] - v) / n; }); }
    else cl.push({cen: o.f.d.slice(), items: [o]});
  });
  cl.sort(function (a, b) { return b.items.length - a.items.length; });
  PERS = cl.map(function (c, i) {
    var ids = {}; c.items.forEach(function (o) { ids[o.p.id] = 1; o.f.pid = i; });
    var rep = c.items.slice().sort(function (a, b) { return (b.f.eyeSharp || 0) - (a.f.eyeSharp || 0); })[0];
    var name = ""; Object.keys(persNames).forEach(function (k) { var o = persNames[k]; if (!name && dist(o.cen, c.cen) < 0.45) name = o.name; });
    return {i: i, cen: c.cen, ids: ids, n: Object.keys(ids).length, ic: rep.f.ic, name: name || "Personne " + (i + 1)};
  });
}
function drawPersons() {
  var box = $("persons");
  if (!PERS.length) { box.innerHTML = '<div class="note">' + (S.photos.some(function (p) { return bigFaces(p.a).length; }) ? "Reconnaissance des personnes…" : "Aucun visage reconnu pour l'instant.") + "</div>"; return; }
  var show = PERS.filter(function (o) { return o.n >= 2 || PERS.length <= 8; }).slice(0, 30);
  box.innerHTML = show.map(function (o) { return '<div class="prs' + (S.filter === "person:" + o.i ? " on" : "") + '" data-p="' + o.i + '" title="Double-clic pour donner un nom">' + (o.ic ? '<img src="' + o.ic + '">' : "<i>👤</i>") + "<b>" + esc(o.name) + "</b><span>" + o.n + "</span></div>"; }).join("") +
    (PERS.length > show.length ? '<div class="note">+ ' + (PERS.length - show.length) + " personne(s) vue(s) une seule fois</div>" : "");
  $("persHint").textContent = "(" + PERS.length + ")";
}
$("persons").addEventListener("click", function (e) { var r = e.target.closest(".prs"); if (!r) return; var k = "person:" + r.dataset.p; S.filter = S.filter === k ? "all" : k; S.openGroup = -1; refresh(true); });
$("persons").addEventListener("dblclick", function (e) {
  var r = e.target.closest(".prs"); if (!r) return; var o = PERS[+r.dataset.p];
  dialog("<h3>Nom de la personne</h3><input type='text' id='pName' style='width:100%' value='" + esc(/^Personne \d+$/.test(o.name) ? "" : o.name) + "' placeholder='ex. Julie'><div class='row'><button data-c='cancel'>Annuler</button><button class='pri' data-c='ok2'>OK</button></div>", function (c) {
    if (c !== "ok2") return; var v = ($("pName") ? $("pName").value : "").trim(); if (!v) return;
    persNames[strHash(o.cen.join(","))] = {name: v, cen: o.cen}; o.name = v; drawPersons(); saveSoon();
  });
  setTimeout(function () { var i = $("pName"); if (i) i.focus(); }, 50);
});

/* ---------------- photos semblables ---------------- */
function simDist(a, b) { if (!a.a || !b.a || a.a.err || b.a.err) return 999; return ham(a.a.hash, b.a.hash) + colDist(a.a.col, b.a.col) / 4; }
$("bSim").onclick = function () { var p = S.byId[S.view[S.cur]]; if (!p) return; S.filter = S.filter === "similar:" + p.id ? "all" : "similar:" + p.id; S.openGroup = -1; refresh(true); };

/* ---------------- filtres ---------------- */
var FILTERS = [
  ["all", "Toutes", function () { return true; }],
  ["P", "✔ Gardées", function (p) { return p.status === "P"; }],
  ["X", "✖ Rejetées", function (p) { return p.status === "X"; }],
  ["todo", "À voir", function (p) { return !p.status; }],
  ["stars", "★ Avec étoiles", function (p) { return p.stars > 0; }]
];
var ISSUES = [
  ["blur", "Floues", function (p) { return has(p, /Flou|flous/); }],
  ["motion", "Flou de bougé", function (p) { return has(p, /bougé/i); }],
  ["eyes", "Yeux fermés / mi-clos", function (p) { return has(p, /Yeux fermés|mi-clos/); }],
  ["expo", "Exposition ratée", function (p) { return has(p, /exposée|sombre|brûlés/i); }],
  ["compo", "Composition (bord, tête, horizon)", function (p) { return has(p, /coupé|tête|Horizon/); }],
  ["faces", "Avec visages", function (p) { return bigFaces(p.a).length > 0; }],
  ["groups", "Rafales et doublons", function (p) { return p.g >= 0; }]
];
function has(p, re) { var w = p.why; if (!w) return false; return w.rej.concat(w.warn).some(function (t) { return re.test(t); }); }
function fnOf(k) {
  if (/^person:/.test(k)) { var o = PERS[+k.slice(7)]; return function (p) { return !!(o && o.ids[p.id]); }; }
  if (/^similar:/.test(k)) { var ref = S.byId[k.slice(8)]; return function (p) { return !!ref && simDist(ref, p) <= 26; }; }
  var f = FILTERS.concat(ISSUES).filter(function (x) { return x[0] === k; })[0]; return f ? f[2] : FILTERS[0][2]; }
function drawFilters() {
  function row(f) { var n = S.photos.filter(f[2]).length; return '<div class="flt' + (S.filter === f[0] ? " on" : "") + '" data-f="' + f[0] + '"><span>' + f[1] + "</span><span>" + n + "</span></div>"; }
  $("filters").innerHTML = FILTERS.map(row).join("");
  $("issues").innerHTML = ISSUES.map(row).join("");
}
$("side").addEventListener("click", function (e) { var f = e.target.closest(".flt"); if (!f) return; S.filter = f.dataset.f; S.openGroup = -1; refresh(true); });

/* ---------------- grille ---------------- */
var cards = {};
function buildCards() {
  var g = $("grid"); g.innerHTML = ""; cards = {}; io.disconnect();
  S.photos.forEach(function (p) {
    var c = document.createElement("div"); c.className = "card"; c.dataset.id = p.id;
    c.innerHTML = '<div class="im"><span class="ph">⏳</span></div><div class="ft"><span class="nm"></span><span class="st"></span></div>';
    c.querySelector(".nm").textContent = p.name; cards[p.id] = c; io.observe(c);
  });
}
function updCard(p) {
  var c = cards[p.id]; if (!c) return;
  var im = c.querySelector(".im");
  if (p.thumbUrl && !im.querySelector("img")) { im.innerHTML = '<img alt="">'; im.querySelector("img").src = p.thumbUrl; }
  else if (p.thumbUrl && im.querySelector("img").src !== p.thumbUrl) im.querySelector("img").src = p.thumbUrl;
  var ti = im.querySelector("img"); if (ti) ti.style.transform = p.quick && p.quick !== 0.001 ? "rotate(" + p.quick + "deg)" : "";
  var cls = "card" + (p.status ? " " + p.status : "") + (p.auto && p.status ? " auto" : "") + (S.view[S.cur] === p.id ? " cur" : "") + (S.sel.has(p.id) ? " sel" : "") + (p.best && $("cGroup").checked ? " best" : "") + (p.g >= 0 && p.g === S.openGroup ? " open" : "");
  if (c.className !== cls) c.className = cls;
  var extra = im.querySelectorAll(".sc,.tags,.grp"); Array.prototype.forEach.call(extra, function (x) { x.remove(); });
  if (p.a && !p.a.err) {
    var sc = document.createElement("div"); sc.className = "sc " + (p.score >= 65 ? "g" : p.score >= 45 ? "m" : "b"); sc.textContent = p.score; im.appendChild(sc);
    var w = p.why || {rej: [], warn: []}, tg = document.createElement("div"); tg.className = "tags";
    w.rej.slice(0, 2).forEach(function (t) { tg.innerHTML += '<span class="tag r">' + esc(t) + "</span>"; });
    if (!w.rej.length) w.warn.filter(function (t) { return !/^Série/.test(t); }).slice(0, 1).forEach(function (t) { tg.innerHTML += '<span class="tag y">' + esc(t) + "</span>"; });
    im.appendChild(tg);
  }
  if (p.g >= 0 && $("cGroup").checked && p.best && S.openGroup !== p.g) { var gb = document.createElement("div"); gb.className = "grp"; gb.textContent = "▣ " + S.groups[p.g].length; gb.title = "Série : cliquez pour voir toutes les photos"; gb.dataset.g = p.g; im.appendChild(gb); }
  c.querySelector(".st").textContent = p.stars ? "★".repeat(p.stars) : "";
}
function computeView() {
  var f = fnOf(S.filter), list = S.photos.filter(f), sort = $("sSort").value;
  if (sort === "score") list.sort(function (a, b) { return b.score - a.score || when(a) - when(b); });
  else if (sort === "name") list.sort(function (a, b) { return a.rel < b.rel ? -1 : 1; });
  else list.sort(function (a, b) { return when(a) - when(b) || (a.name < b.name ? -1 : 1); });
  if (/^similar:/.test(S.filter)) { var ref = S.byId[S.filter.slice(8)]; list.sort(function (a, b) { return simDist(ref, a) - simDist(ref, b); }); return list.map(function (p) { return p.id; }); }
  if ($("cGroup").checked && S.filter !== "groups" && !/^person:/.test(S.filter)) {
    // une seule photo par serie (la meilleure), sauf la serie ouverte
    var out = [], seen = {};
    list.forEach(function (p) {
      if (p.g < 0) { out.push(p); return; }
      if (seen[p.g]) return;
      if (p.g === S.openGroup) { seen[p.g] = 1; S.groups[p.g].forEach(function (id) { var q = S.byId[id]; if (f(q)) out.push(q); }); return; }
      var best = S.byId[S.groups[p.g].best];
      if (f(best)) { seen[p.g] = 1; out.push(best); } else out.push(p);
    });
    list = out;
  }
  return list.map(function (p) { return p.id; });
}
function refresh(keepCur) {
  var curId = S.view[S.cur];
  S.view = computeView();
  var g = $("grid"), frag = document.createDocumentFragment();
  S.view.forEach(function (id) { frag.appendChild(cards[id]); });
  g.innerHTML = ""; g.appendChild(frag);
  var i = S.view.indexOf(curId); S.cur = i >= 0 ? i : (S.view.length ? clamp(S.cur, 0, S.view.length - 1) : -1);
  S.photos.forEach(updCard); drawFilters(); drawPersons(); showPanel();
  $("bSim").textContent = /^similar:/.test(S.filter) ? "✖ Fermer les photos semblables (" + S.view.length + ")" : "🔍 Montrer les photos semblables";
  if (keepCur !== false) scrollToCur();
}
function scrollToCur() { var c = cards[S.view[S.cur]]; if (c && c.scrollIntoView) c.scrollIntoView({block: "nearest"}); }
function setCur(i, opt) {
  if (!S.view.length) return;
  var old = S.byId[S.view[S.cur]]; S.cur = clamp(i, 0, S.view.length - 1);
  if (old) updCard(old); updCard(S.byId[S.view[S.cur]]); scrollToCur(); showPanel();
  if ($("loupe").classList.contains("show")) showLoupe();
}
$("grid").addEventListener("click", function (e) {
  var gb = e.target.closest(".grp");
  if (gb) { S.openGroup = S.openGroup === +gb.dataset.g ? -1 : +gb.dataset.g; refresh(); return; }
  var c = e.target.closest(".card"); if (!c) return;
  var i = S.view.indexOf(c.dataset.id);
  if (e.ctrlKey || e.metaKey) { if (S.sel.has(c.dataset.id)) S.sel.delete(c.dataset.id); else S.sel.add(c.dataset.id); if (!S.sel.size) {} }
  else if (e.shiftKey && S.cur >= 0) { var a = Math.min(S.cur, i), b = Math.max(S.cur, i); for (var k = a; k <= b; k++) S.sel.add(S.view[k]); }
  else { S.sel.forEach(function (id) { S.sel.delete(id); updCard(S.byId[id]); }); }
  setCur(i);
  S.sel.forEach(function (id) { updCard(S.byId[id]); });
});
$("grid").addEventListener("dblclick", function (e) { var c = e.target.closest(".card"); if (c) { setCur(S.view.indexOf(c.dataset.id)); openLoupe(); } });
$("rSize").addEventListener("input", function () { $("grid").style.setProperty("--sz", this.value + "px"); try { localStorage.setItem("rp_size", this.value); } catch (e) {} });
try { var sz = localStorage.getItem("rp_size"); if (sz) { $("rSize").value = sz; $("grid").style.setProperty("--sz", sz + "px"); } var st = localStorage.getItem("rp_strict"); if (st) $("sStrict").value = st; } catch (e) {}
$("sSort").addEventListener("change", function () { refresh(); });
$("sCat").addEventListener("change", function () { rescore(); refresh(); saveSoon(); });
$("tClient").addEventListener("change", function () { saveSoon(); });
$("cGroup").addEventListener("change", function () { S.openGroup = -1; refresh(); });
$("sStrict").addEventListener("change", function () { try { localStorage.setItem("rp_strict", this.value); } catch (e) {} rescore(); refresh(); toast("Exigence : " + this.options[this.selectedIndex].text + ". Relancez ✨ Tri automatique pour l'appliquer."); });

/* ---------------- statut, etoiles, annuler ---------------- */
function targets() { if (S.sel.size > 1) return Array.from(S.sel).map(function (id) { return S.byId[id]; }); var p = S.byId[S.view[S.cur]]; return p ? [p] : []; }
function pushUndo(list) { S.undo.push(list.map(function (p) { return {id: p.id, st: p.status, au: p.auto, s: p.stars}; })); if (S.undo.length > 200) S.undo.shift(); }
function setStatus(st, list) {
  list = list || targets(); if (!list.length) return;
  pushUndo(list);
  list.forEach(function (p) { p.status = st; p.auto = false; if (st) learnFrom(p, st === "P"); updCard(p); });
  updLearn(); drawFilters(); saveSoon();
  if (list.length === 1 && st && $("cAdvance").checked && !$("compare").classList.contains("show")) {
    // la photo peut sortir du filtre en cours : on reste a la meme place
    var keepFilter = fnOf(S.filter)(list[0]);
    if (keepFilter) setCur(S.cur + 1); else { var i = S.cur; refresh(); setCur(Math.min(i, S.view.length - 1)); }
  } else { showPanel(); if ($("loupe").classList.contains("show")) showLoupe(); }
  if ($("compare").classList.contains("show")) drawCompare();
}
function setStars(n, list) {
  list = list || targets(); if (!list.length) return;
  pushUndo(list); list.forEach(function (p) { p.stars = p.stars === n ? 0 : n; updCard(p); });
  drawFilters(); showPanel(); saveSoon(); if ($("loupe").classList.contains("show")) showLoupe();
}
function undo() {
  var u = S.undo.pop(); if (!u) { toast("Rien à annuler."); return; }
  u.forEach(function (o) { var p = S.byId[o.id]; if (!p) return; p.status = o.st; p.auto = o.au; p.stars = o.s; updCard(p); });
  drawFilters(); showPanel(); saveSoon(); toast("Annulé.");
}
function updLearn() {
  var n = L.ex.length, k = L.ex.filter(function (o) { return o.y; }).length;
  $("learn").innerHTML = "🧠 <b>Apprentissage</b> : " + n + " choix retenus (" + k + " gardées, " + (n - k) + " rejetées)." +
    (n >= 15 && k >= 3 && n - k >= 3 ? " Le score suit maintenant vos goûts." : " Le score s'adaptera à vos goûts après une quinzaine de choix P / X.");
}

/* ---------------- tri automatique ---------------- */
function autoCull() {
  rescore();
  var k = strict(), nP = 0, nX = 0, nT = 0, manual = 0;
  S.photos.forEach(function (p) {
    if (!p.a) return;
    if (p.status && !p.auto) { manual++; return; }
    var w = p.why;
    if (w.rej.length) { p.status = "X"; nX++; }
    else if (p.score >= TH.keep[k] && (p.g < 0 || p.best) && !w.warn.some(function (t) { return /Netteté|bougé|Yeux/.test(t); })) { p.status = "P"; nP++; }
    else { p.status = ""; nT++; }
    p.auto = !!p.status;
  });
  refresh(); saveSoon();
  dialog("<h3>✨ Tri automatique</h3><p><b style='color:var(--keep)'>" + nP + " gardées</b>, <b style='color:var(--rej)'>" + nX + " rejetées</b>, <b>" + nT + " à voir</b>" + (manual ? " — vos " + manual + " choix faits à la main ne sont pas touchés." : ".") + "</p>" +
    "<p class='small'>Les choix automatiques ont un contour pointillé. Vérifiez vite les rejetées (filtre « ✖ Rejetées ») et les « À voir », puis corrigez avec P / X : chaque correction apprend vos goûts.</p>" +
    "<div class='row'><button data-c='rej'>Voir les rejetées</button><button data-c='todo'>Voir les « À voir »</button><button class='pri' data-c='ok'>OK</button></div>",
    function (c) { if (c === "rej") { S.filter = "X"; refresh(); } if (c === "todo") { S.filter = "todo"; refresh(); } });
}

/* ---------------- panneau de droite ---------------- */
function bar(label, v, col, txt) { return '<div class="bar"><div class="l"><span>' + label + "</span><span>" + (txt != null ? txt : v) + '</span></div><div class="t"><i style="width:' + clamp(v, 0, 100) + "%;background:" + col + '"></i></div></div>'; }
function colOf(v) { return v >= 65 ? "var(--keep)" : v >= 45 ? "var(--doubt)" : "var(--rej)"; }
function marks(over, img, a, big) {
  over.innerHTML = ""; if (!a || a.err || !img.naturalWidth) return;
  var W = img.clientWidth, H = img.clientHeight; over.style.left = img.offsetLeft + "px"; over.style.top = img.offsetTop + "px"; over.style.width = W + "px"; over.style.height = H + "px";
  if (a.zone && !bigFaces(a).length) over.innerHTML += '<div class="box-zone" style="left:' + a.zone.x * W + "px;top:" + a.zone.y * H + "px;width:" + a.zone.w * W + "px;height:" + a.zone.h * H + 'px"></div>';
  bigFaces(a).forEach(function (f) {
    var t = f.closed ? "yeux fermés" : f.half ? "mi-clos" : "yeux ouverts";
    over.innerHTML += '<div class="box-face' + (f.closed ? " closed" : f.half ? " half" : "") + '" style="left:' + f.x * W + "px;top:" + f.y * H + "px;width:" + f.w * W + "px;height:" + f.h * H + 'px">' + (big ? "<span>" + t + (f.eyeSharp != null ? " · netteté yeux " + f.eyeSharp : "") + "</span>" : "") + "</div>";
  });
}
function starsHtml(n) { var h = ""; for (var i = 1; i <= 5; i++) h += '<span class="star' + (i <= n ? " on" : "") + '" data-s="' + i + '">★</span>'; return h; }
function exifTxt(a) {
  var e = a && a.exif; if (!e) return "";
  var t = [];
  if (e.date) t.push("📅 " + fmtDate(e.date));
  if (e.make || e.model) t.push("📷 " + esc((e.model || "").indexOf(e.make || "#") === 0 ? e.model : ((e.make || "") + " " + (e.model || "")).trim()));
  if (e.lens) t.push("🔭 " + esc(e.lens));
  var s = [];
  if (e.speed) s.push(e.speed >= 1 ? e.speed + " s" : "1/" + Math.round(1 / e.speed) + " s");
  if (e.f) s.push("f/" + e.f); if (e.iso) s.push("ISO " + e.iso); if (e.focal) s.push(Math.round(e.focal) + " mm");
  if (s.length) t.push("⚙️ " + s.join(" · "));
  return t.join("<br>");
}
function showPanel() {
  var p = S.byId[S.view[S.cur]];
  if (!p) { $("pvFaces").innerHTML = ""; $("pvImg").removeAttribute("src"); $("pvName").textContent = ""; ["pvScore", "pvBars", "pvWhy", "pvExif", "pvStars", "pvOver"].forEach(function (k) { $(k).innerHTML = ""; }); return; }
  var img = $("pvImg");
  if (p.thumbUrl) { if (img.src !== p.thumbUrl) img.src = p.thumbUrl; } else img.removeAttribute("src");
  img.onload = function () { marks($("pvOver"), img, p.a, false); }; if (img.complete) marks($("pvOver"), img, p.a, false);
  drawFaces($("pvFaces"), p);
  $("pvName").textContent = p.rel + (S.sel.size > 1 ? "  (+" + (S.sel.size - 1) + " sélectionnées)" : "");
  $("pvStars").innerHTML = starsHtml(p.stars);
  var a = p.a;
  if (!a) { $("pvScore").innerHTML = "<small>Analyse en cours…</small>"; $("pvBars").innerHTML = ""; $("pvWhy").innerHTML = ""; $("pvExif").innerHTML = ""; return; }
  if (a.err) { $("pvScore").innerHTML = "<small>" + esc(a.err) + "</small>"; $("pvBars").innerHTML = ""; $("pvWhy").innerHTML = ""; return; }
  $("pvScore").innerHTML = '<b style="color:' + colOf(p.score) + '">' + p.score + "</b><small>/ 100 — " + (p.status === "P" ? "✔ gardée" : p.status === "X" ? "✖ rejetée" : "à voir") + (p.auto && p.status ? " (auto)" : "") + "</small>";
  var f = bigFaces(a), h = "";
  h += bar("Netteté", a.sharp, colOf(a.sharp));
  if (f.length) { var es = sharpEff(a); h += bar("Netteté des yeux / visage", es, colOf(es)); var ey = eyesScore(a); h += bar("Yeux ouverts", ey, colOf(ey), f.length + " visage" + (f.length > 1 ? "s" : "")); }
  h += bar("Flou de bougé", a.motion, a.motion >= 60 ? "var(--rej)" : a.motion >= 40 ? "var(--doubt)" : "var(--keep)", a.motion >= 40 ? a.motion : "non");
  var ae = aesScore(a); h += ae == null ? bar("Œil artistique", 0, "var(--bg3)", "en cours…") : bar("Œil artistique (lumière, couleurs, composition)", ae, colOf(ae), (a.aes).toFixed(1) + " / 10");
  var ex = expoScore(a); h += bar("Exposition", ex, colOf(ex), ex + (a.expo.hi > 2 ? " · blancs brûlés " + a.expo.hi + " %" : "") + (a.expo.lo > 5 ? " · noirs " + a.expo.lo + " %" : ""));
  $("pvBars").innerHTML = h;
  var w = p.why || reasons(p);
  var ab = adjBias(p);
  $("pvWhy").innerHTML = "<div style='color:var(--mut)'>📁 Catégorie : " + CATS[catOf(p)].nom + ($("sCat").value === "auto" ? " (devinée)" : "") + "</div>" +
    (p.adj ? "<div style='color:var(--gold)'>🎚 Votre retouche : " + (p.adj.ev > 0 ? "+" : "") + p.adj.ev.toFixed(1) + " EV, chaleur " + (p.adj.wb > 0 ? "+" : "") + p.adj.wb + "</div>" : ab ? "<div style='color:var(--gold)'>🧠 Retouche apprise (" + ab.n + " photos) : " + (ab.ev > 0 ? "+" : "") + ab.ev.toFixed(1).replace(".", ",") + " EV, chaleur " + (ab.wb > 0 ? "+" : "") + ab.wb + "</div>" : "") + w.rej.map(function (t) { return '<div style="color:var(--rej)">✖ ' + esc(t) + "</div>"; }).join("") + w.warn.map(function (t) { return '<div style="color:var(--doubt)">⚠ ' + esc(t) + "</div>"; }).join("") + w.good.map(function (t) { return '<div style="color:var(--keep)">✔ ' + esc(t) + "</div>"; }).join("");
  var cv = $("pvHist"), x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height);
  if (a.hist) { var mx = Math.max.apply(null, a.hist.slice(1, 63)) || 1; x.fillStyle = "#9aa3b2"; a.hist.forEach(function (v, i) { var hh = Math.min(1, v / mx) * (cv.height - 4); x.fillRect(i * cv.width / 64, cv.height - hh, cv.width / 64 + 0.5, hh); }); }
  $("pvExif").innerHTML = exifTxt(a) + (a.w ? "<br>🖼️ " + a.w + " × " + a.h + " px" + (p.raw ? " (aperçu du RAW)" : "") : "");
}
$("pvBtns").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setStatus(b.dataset.st); });
$("pvStars").addEventListener("click", function (e) { var s = e.target.closest(".star"); if (s) setStars(+s.dataset.s); });

/* ---------------- gros plans des visages (a pleine resolution) ---------------- */
var fcCache = new Map();
function faceCrops(p) {
  var f = bigFaces(p.a); if (!f.length) return Promise.resolve([]);
  if (fcCache.has(p.id)) return fcCache.get(p.id);
  var pr = fullUrl(p).then(function (u) {
    return new Promise(function (res) {
      var im = new Image(); im.onload = function () {
        var W = im.naturalWidth, H = im.naturalHeight;
        res(f.map(function (o) {
          var m = 0.18, x0 = Math.max(0, (o.x - o.w * m) * W), y0 = Math.max(0, (o.y - o.h * m) * H), x1 = Math.min(W, (o.x + o.w * (1 + m)) * W), y1 = Math.min(H, (o.y + o.h * (1 + m)) * H);
          var sc = Math.min(1, 360 / Math.max(1, y1 - y0)), c = document.createElement("canvas"); c.width = Math.max(1, (x1 - x0) * sc); c.height = Math.max(1, (y1 - y0) * sc);
          var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
          return {url: c.toDataURL("image/jpeg", 0.88), f: o};
        }));
      };
      im.onerror = function () { res([]); }; im.src = u;
    });
  });
  fcCache.set(p.id, pr); if (fcCache.size > 40) fcCache.delete(fcCache.keys().next().value);
  return pr;
}
function drawFaces(box, p) {
  box.innerHTML = ""; if (!p || !p.a || p.a.err || !bigFaces(p.a).length) return;
  var id = p.id;
  faceCrops(p).then(function (list) {
    if (box.dataset.for !== id) return;
    box.innerHTML = list.map(function (o, i) { var f = o.f, t = f.closed ? "yeux fermés" : f.half ? "mi-clos" : "yeux ouverts"; return '<div class="fc' + (f.closed ? " closed" : f.half ? " half" : "") + '" data-k="' + i + '" title="Cliquez pour zoomer sur ce visage"><img src="' + o.url + '"><span>' + t + (f.eyeSharp != null ? " · net " + f.eyeSharp : "") + "</span></div>"; }).join("");
  });
  box.dataset.for = id;
}
function zoomFace(k) {
  var p = S.byId[S.view[S.cur]], f = p && bigFaces(p.a)[k]; if (!f) return;
  if (!$("loupe").classList.contains("show")) openLoupe();
  var img = $("lpImg"), go = function () { if (!img.naturalWidth) return; full.zoom = false; zoomAt(full.tx + (f.x + f.w / 2) * img.naturalWidth * full.sc, full.ty + (f.y + f.h * 0.4) * img.naturalHeight * full.sc); };
  if (img.dataset.full === p.id) go(); else setTimeout(go, 600);
}
$("pvFaces").addEventListener("click", function (e) { var c = e.target.closest(".fc"); if (c) zoomFace(+c.dataset.k); });
$("lpFaces").addEventListener("click", function (e) { var c = e.target.closest(".fc"); if (c) zoomFace(+c.dataset.k); });

/* ---------------- retouche rapide + apprentissage de vos corrections (idee de « Vrai Regard ») ----------------
   chaque correction (exposition, chaleur) est retenue par categorie et par client ; a l'export, les photos
   sans retouche recoivent votre correction habituelle */
var LADJ = (function () { try { return JSON.parse(localStorage.getItem("rp_adj")) || {}; } catch (e) { return {}; } })();
function adjKeys(p) { var c = catOf(p), cl = ($("tClient").value || "").trim(); return cl ? [c + "|" + cl, c] : [c]; }
function adjLearn(p, old) {
  adjKeys(p).forEach(function (k) {
    var o = LADJ[k] || {n: 0, ev: 0, wb: 0, s: {}};
    if (old) { o.ev -= old.ev; o.wb -= old.wb; o.n--; }
    if (p.adj && (p.adj.ev || p.adj.wb)) { o.ev += p.adj.ev; o.wb += p.adj.wb; o.n++; }
    o.n = Math.max(0, o.n); LADJ[k] = o;
  });
  try { localStorage.setItem("rp_adj", JSON.stringify(LADJ)); } catch (e) {}
}
function adjBias(p) { var ks = adjKeys(p); for (var i = 0; i < ks.length; i++) { var o = LADJ[ks[i]]; if (o && o.n >= 3) return {ev: Math.round(o.ev / o.n * 10) / 10, wb: Math.round(o.wb / o.n), n: o.n, k: ks[i]}; } return null; }
function adjShow(p) {
  var a = p.adj || {ev: 0, wb: 0};
  $("lpEv").value = Math.round(a.ev * 10); $("lpWb").value = a.wb;
  $("lpEvV").textContent = (a.ev > 0 ? "+" : "") + a.ev.toFixed(1).replace(".", ","); $("lpWbV").textContent = (a.wb > 0 ? "+" : "") + a.wb;
  var img = $("lpImg"), w = $("lpWarm");
  img.style.filter = a.ev ? "brightness(" + Math.pow(2, a.ev * 0.85).toFixed(3) + ")" : "";
  w.style.background = a.wb > 0 ? "#ff9a3c" : "#3c8cff"; w.style.opacity = Math.min(0.6, Math.abs(a.wb) / 50);
  w.style.left = full.tx + "px"; w.style.top = full.ty + "px"; w.style.width = img.naturalWidth * full.sc + "px"; w.style.height = img.naturalHeight * full.sc + "px";
}
function adjSet() {
  var p = S.byId[S.view[S.cur]]; if (!p) return;
  var old = p.adj ? {ev: p.adj.ev, wb: p.adj.wb} : null, ev = +$("lpEv").value / 10, wb = +$("lpWb").value;
  p.adj = (ev || wb) ? {ev: ev, wb: wb} : null;
  clearTimeout(adjSet.t); adjShow(p);
  adjSet.t = setTimeout(function () { adjLearn(p, old && (old.ev || old.wb) ? old : null); saveSoon(); }, 600);
}
$("lpEv").addEventListener("input", adjSet); $("lpWb").addEventListener("input", adjSet);
$("lpAdj0").onclick = function () { $("lpEv").value = 0; $("lpWb").value = 0; adjSet(); };

/* ---------------- vue en grand (loupe) ---------------- */
var full = {cache: new Map(), zoom: false, sc: 1, tx: 0, ty: 0}, fullWait = {};
function fullUrl(p) {
  if (full.cache.has(p.id)) return full.cache.get(p.id);
  var pr = readBytes(p).then(function (b) {
    if (!b) return p.thumbUrl;
    if (!p.heic) return URL.createObjectURL(new Blob([b], {type: "image/jpeg"}));
    // HEIC : le navigateur ne sait pas l'afficher, un assistant la convertit
    ensurePool(); var w = pool[pool.length - 1], key = "full:" + p.id + ":" + Date.now();
    return new Promise(function (res) { fullWait[key] = function (bl) { res(bl ? URL.createObjectURL(bl) : p.thumbUrl); }; var c = b.buffer.byteLength === b.byteLength ? b : b.slice(); w.postMessage({id: key, buf: c, full: true}, [c.buffer]); });
  });
  full.cache.set(p.id, pr);
  if (full.cache.size > 8) { var k = full.cache.keys().next().value; var old = full.cache.get(k); full.cache.delete(k); old.then(function (u) { if (u && u.indexOf("blob:") === 0 && !Object.values(S.byId).some(function (q) { return q.thumbUrl === u; })) URL.revokeObjectURL(u); }); }
  return pr;
}
function openLoupe() { if (S.cur < 0) return; $("loupe").classList.add("show"); showLoupe(); }
function closeLoupe() { $("loupe").classList.remove("show"); full.zoom = false; scrollToCur(); }
function fit() {
  var v = $("lpView"), img = $("lpImg"); if (!img.naturalWidth) return;
  var s = Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight, 1);
  full.sc = s; full.tx = (v.clientWidth - img.naturalWidth * s) / 2; full.ty = (v.clientHeight - img.naturalHeight * s) / 2; apply();
}
function apply() {
  var img = $("lpImg"); img.style.transform = "translate(" + full.tx + "px," + full.ty + "px) scale(" + full.sc + ")";
  $("lpView").classList.toggle("zoom", full.zoom);
  var o = $("lpOver"), W = img.naturalWidth * full.sc, H = img.naturalHeight * full.sc, wm = $("lpWarm");
  wm.style.left = full.tx + "px"; wm.style.top = full.ty + "px"; wm.style.width = W + "px"; wm.style.height = H + "px";
  o.style.left = full.tx + "px"; o.style.top = full.ty + "px"; o.style.width = W + "px"; o.style.height = H + "px";
}
function drawLoupeMarks(p) {
  var o = $("lpOver"); o.innerHTML = "";
  if (!$("lpMarks").checked || !p.a || p.a.err) return;
  var img = $("lpImg"), fake = {clientWidth: img.naturalWidth * full.sc, clientHeight: img.naturalHeight * full.sc, offsetLeft: full.tx, offsetTop: full.ty, naturalWidth: 1};
  marks(o, fake, p.a, true);
}
function showLoupe() {
  var p = S.byId[S.view[S.cur]]; if (!p) return;
  $("lpName").textContent = p.rel + "  —  " + (S.cur + 1) + " / " + S.view.length;
  $("lpStars").innerHTML = starsHtml(p.stars);
  var img = $("lpImg"), id = p.id;
  if (img.dataset.id !== id) {
    full.zoom = false; img.dataset.id = id;
    if (p.thumbUrl) { img.src = p.thumbUrl; img.onload = function () { if (img.dataset.id === id) { fit(); drawLoupeMarks(p); } }; }
    img.dataset.full = "";
    fullUrl(p).then(function (u) { if (img.dataset.id !== id || !u) return; img.onload = function () { img.dataset.full = id; if (!full.zoom) fit(); drawLoupeMarks(p); }; img.src = u; });
    var nx = S.byId[S.view[S.cur + 1]]; if (nx) fullUrl(nx);
  } else drawLoupeMarks(p);
  drawFaces($("lpFaces"), p); adjShow(p);
  var w = p.why || {rej: [], warn: [], good: []};
  $("lpInfo").innerHTML = (p.a && !p.a.err ? "<b style='font-size:18px;color:" + colOf(p.score) + "'>" + p.score + "</b> / 100 · " + (p.status === "P" ? "<span style='color:var(--keep)'>✔ gardée</span>" : p.status === "X" ? "<span style='color:var(--rej)'>✖ rejetée</span>" : "à voir") + "<br>" : "") +
    w.rej.map(function (t) { return "<span style='color:var(--rej)'>✖ " + esc(t) + "</span>"; }).concat(w.warn.map(function (t) { return "<span style='color:var(--doubt)'>⚠ " + esc(t) + "</span>"; }), w.good.map(function (t) { return "<span style='color:var(--keep)'>✔ " + esc(t) + "</span>"; })).join("<br>");
  // bande de vignettes
  var st = $("lpStrip"), a = Math.max(0, S.cur - 30), b = Math.min(S.view.length, S.cur + 31), h = "";
  for (var i = a; i < b; i++) { var q = S.byId[S.view[i]]; h += '<div class="th' + (i === S.cur ? " cur" : "") + (q.status ? " " + q.status : "") + '" data-i="' + i + '">' + (q.thumbUrl ? '<img src="' + q.thumbUrl + '">' : '<span style="color:#555;padding:8px;display:block">⏳</span>') + "</div>"; }
  st.innerHTML = h; var c = st.querySelector(".cur"); if (c) c.scrollIntoView({inline: "center", block: "nearest"});
}
$("lpStrip").addEventListener("click", function (e) { var t = e.target.closest(".th"); if (t) setCur(+t.dataset.i); });
$("lpBack").onclick = closeLoupe;
$("lpMarks").onchange = function () { showLoupe(); };
$("loupe").querySelector("#lpBar").addEventListener("click", function (e) { var b = e.target.closest("button[data-st]"); if (b) setStatus(b.dataset.st); var s = e.target.closest(".star"); if (s) setStars(+s.dataset.s); });
function zoomAt(cx, cy) {
  var img = $("lpImg"); if (!img.naturalWidth) return;
  if (full.zoom) { full.zoom = false; fit(); drawLoupeMarks(S.byId[S.view[S.cur]]); return; }
  var px = (cx - full.tx) / full.sc, py = (cy - full.ty) / full.sc, v = $("lpView");
  full.zoom = true; full.sc = 1 / (window.devicePixelRatio || 1); full.tx = v.clientWidth / 2 - px * full.sc; full.ty = v.clientHeight / 2 - py * full.sc; apply(); drawLoupeMarks(S.byId[S.view[S.cur]]);
}
$("lpZoom").onclick = function () {
  var p = S.byId[S.view[S.cur]], img = $("lpImg"), v = $("lpView");
  if (full.zoom || !p || !p.a) { zoomAt(v.clientWidth / 2, v.clientHeight / 2); return; }
  // zoom sur les yeux s'il y a un visage, sinon sur la zone la plus nette
  var f = bigFaces(p.a)[0], z = p.a.zone, fx = f ? f.x + f.w / 2 : z ? z.x + z.w / 2 : 0.5, fy = f ? f.y + f.h * 0.4 : z ? z.y + z.h / 2 : 0.5;
  zoomAt(full.tx + fx * img.naturalWidth * full.sc, full.ty + fy * img.naturalHeight * full.sc);
};
(function () {
  var v = $("lpView"), drag = null, moved = false;
  v.addEventListener("mousedown", function (e) { drag = {x: e.clientX, y: e.clientY, tx: full.tx, ty: full.ty}; moved = false; });
  window.addEventListener("mousemove", function (e) { if (!drag || !full.zoom) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; full.tx = drag.tx + dx; full.ty = drag.ty + dy; apply(); });
  window.addEventListener("mouseup", function (e) { if (drag && !moved && e.target.closest && e.target.closest("#lpView")) { var r = v.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top); } drag = null; });
  v.addEventListener("wheel", function (e) { e.preventDefault(); setCur(S.cur + (e.deltaY > 0 ? 1 : -1)); }, {passive: false});
  window.addEventListener("resize", function () { if ($("loupe").classList.contains("show") && !full.zoom) { fit(); drawLoupeMarks(S.byId[S.view[S.cur]]); } });
})();

/* ---------------- comparaison cote a cote ---------------- */
var cmp = {ids: [], cur: 0, zoom: false, rx: 0.5, ry: 0.5};
function openCompare() {
  var ids;
  if (S.sel.size >= 2) ids = Array.from(S.sel);
  else { var p = S.byId[S.view[S.cur]]; if (!p) return; ids = p.g >= 0 ? S.groups[p.g].slice() : S.view.slice(S.cur, S.cur + 2); }
  ids.sort(function (a, b) { return S.byId[b].score - S.byId[a].score; });
  if (ids.length > 6) { toast("Comparaison des 6 meilleures de la série (" + ids.length + " photos)."); ids = ids.slice(0, 6); }
  if (ids.length < 2) { toast("Sélectionnez au moins 2 photos (Ctrl + clic), ou une photo d'une série."); return; }
  cmp.ids = ids; cmp.cur = 0; cmp.zoom = false;
  $("compare").classList.add("show"); drawCompare(true);
}
function closeCompare() { $("compare").classList.remove("show"); refresh(); }
function drawCompare(rebuild) {
  var g = $("cpGrid"), n = cmp.ids.length;
  $("cpTitle").textContent = n + " photos — la meilleure (score) est en premier";
  if (rebuild || g.children.length !== n) {
    g.style.gridTemplateColumns = "repeat(" + (n <= 3 ? n : n === 4 ? 2 : 3) + ",1fr)";
    g.style.gridTemplateRows = n <= 3 ? "1fr" : "1fr 1fr";
    g.innerHTML = cmp.ids.map(function (id, i) { return '<div class="cp" data-i="' + i + '"><div class="v"><img alt="" draggable="false"><div class="badge"></div></div><div class="h"><span class="nm"></span><button data-st="P" class="keep">✔</button><button data-st="X" class="rej">✖</button></div></div>'; }).join("");
    cmp.ids.forEach(function (id, i) {
      var p = S.byId[id], el = g.children[i], img = el.querySelector("img");
      img.onload = function () { layoutCp(); };
      if (p.thumbUrl) img.src = p.thumbUrl;
      fullUrl(p).then(function (u) { if (u) img.src = u; });
    });
  }
  cmp.ids.forEach(function (id, i) {
    var p = S.byId[id], el = g.children[i], w = p.why || {rej: []};
    el.className = "cp" + (i === cmp.cur ? " cur" : "") + (p.status ? " " + p.status : "");
    el.querySelector(".nm").textContent = p.name + (p.stars ? "  " + "★".repeat(p.stars) : "");
    el.querySelector(".badge").innerHTML = "<b style='color:" + colOf(p.score) + "'>" + p.score + "</b>" + (w.rej.length ? " · <span style='color:var(--rej)'>" + esc(w.rej[0]) + "</span>" : "") + (p.best ? " · <span style='color:var(--gold)'>meilleure</span>" : "");
  });
  layoutCp();
}
function layoutCp() {
  Array.prototype.forEach.call($("cpGrid").children, function (el) {
    var v = el.querySelector(".v"), img = el.querySelector("img"); if (!img.naturalWidth) return;
    var s = cmp.zoom ? 1 / (window.devicePixelRatio || 1) : Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight);
    var W = img.naturalWidth * s, H = img.naturalHeight * s, tx, ty;
    if (cmp.zoom) { tx = v.clientWidth / 2 - cmp.rx * W; ty = v.clientHeight / 2 - cmp.ry * H; } else { tx = (v.clientWidth - W) / 2; ty = (v.clientHeight - H) / 2; }
    img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
    el.style.cursor = cmp.zoom ? "grab" : "zoom-in";
  });
}
(function () {
  var g = $("cpGrid"), drag = null, moved = false;
  g.addEventListener("mousedown", function (e) { if (e.target.closest("button")) return; var el = e.target.closest(".cp"); if (!el) return; drag = {x: e.clientX, y: e.clientY, rx: cmp.rx, ry: cmp.ry, el: el}; moved = false; });
  window.addEventListener("mousemove", function (e) {
    if (!drag || !cmp.zoom) return; var img = drag.el.querySelector("img"), s = 1 / (window.devicePixelRatio || 1);
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    cmp.rx = clamp(drag.rx - dx / (img.naturalWidth * s), 0, 1); cmp.ry = clamp(drag.ry - dy / (img.naturalHeight * s), 0, 1); layoutCp();
  });
  window.addEventListener("mouseup", function (e) {
    if (drag && !moved) {
      var el = drag.el, i = +el.dataset.i, v = el.querySelector(".v"), img = el.querySelector("img"), r = v.getBoundingClientRect();
      cmp.cur = i;
      if (!cmp.zoom && img.naturalWidth) {
        var s = Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight), W = img.naturalWidth * s, H = img.naturalHeight * s;
        cmp.rx = clamp((e.clientX - r.left - (v.clientWidth - W) / 2) / W, 0, 1); cmp.ry = clamp((e.clientY - r.top - (v.clientHeight - H) / 2) / H, 0, 1); cmp.zoom = true;
      } else cmp.zoom = false;
      drawCompare();
    }
    drag = null;
  });
  g.addEventListener("click", function (e) { var b = e.target.closest("button[data-st]"); if (!b) return; var i = +b.closest(".cp").dataset.i; cmp.cur = i; setStatus(b.dataset.st, [S.byId[cmp.ids[i]]]); });
  window.addEventListener("resize", function () { if ($("compare").classList.contains("show")) layoutCp(); });
})();
$("cpBack").onclick = closeCompare;
$("cpKeepBest").onclick = function () {
  var keep = S.byId[cmp.ids[cmp.cur]], others = cmp.ids.filter(function (id, i) { return i !== cmp.cur; }).map(function (id) { return S.byId[id]; });
  pushUndo([keep].concat(others));
  keep.status = "P"; keep.auto = false; learnFrom(keep, true);
  others.forEach(function (p) { p.status = "X"; p.auto = false; learnFrom(p, false); });
  updLearn(); saveSoon(); drawCompare(); toast("1 gardée, " + others.length + " rejetée" + (others.length > 1 ? "s" : "") + ".");
};

/* ---------------- export ---------------- */
function xmpPacket(p) {
  var label = p.status === "P" ? "Green" : p.status === "X" ? "Red" : "", rating = p.status === "X" ? -1 : p.stars;
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Regard Pur">\n <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n  <rdf:Description rdf:about=""\n    xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n    xmp:Rating="' + rating + '"' + (label ? '\n    xmp:Label="' + label + '"' : "") + "/>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>\n";
}
function xmpMerge(old, p) {
  // un fichier XMP existe deja (Lightroom, DxO…) : on ne change que la note et le libelle
  var label = p.status === "P" ? "Green" : p.status === "X" ? "Red" : "", rating = String(p.status === "X" ? -1 : p.stars), s = old;
  function setAttr(name, val) {
    var re = new RegExp("xmp:" + name + '="[^"]*"'), re2 = new RegExp("<xmp:" + name + ">[^<]*</xmp:" + name + ">");
    if (re.test(s)) s = val === "" ? s.replace(re, "") : s.replace(re, "xmp:" + name + '="' + val + '"');
    else if (re2.test(s)) s = val === "" ? s.replace(re2, "") : s.replace(re2, "<xmp:" + name + ">" + val + "</xmp:" + name + ">");
    else if (val !== "") s = s.replace(/<rdf:Description\b/, '<rdf:Description xmp:' + name + '="' + val + '"');
  }
  if (!/xmlns:xmp=/.test(s)) s = s.replace(/<rdf:Description\b/, '<rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/"');
  setAttr("Rating", rating); setAttr("Label", label);
  return s;
}
/* ---------------- rendu JM LAB PRO a l'export ---------------- */
var PROFS = [["LABO PRO EV5", "ProLab (neutre)"], ["Velvia+", "Éclat Intense+"], ["Velvia", "Éclat Intense"], ["Provia", "Naturel"], ["Astia", "Doux Portrait"], ["Classic Chrome", "Chrome Doux"], ["Classic Chrome+", "Chrome Doux+"], ["Eterna", "Cinéma"], ["Eterna Bleach", "Cinéma Délavé"], ["Acros", "Noir & Blanc"], ["Acros+R", "Noir & Blanc Rouge"], ["Superia", "Pellicule Couleur"], ["Natura", "Lumière Naturelle"]];
var RKEY = {Expo: "Exposition", Contrast: "Contraste", Temp: "Temperature", Tint: "Teinte", High: "Hautes SANS GRIS", Shadow: "Ombres", Vibr: "Vibrance", Sat: "Saturation", Clarity: "Clarte", Black: "Noir", White: "Blanc", Dehaze: "Dehaze", Vign: "Vignette", Dose: "Dosage"};
var REND = (function () { try { return JSON.parse(localStorage.getItem("rp_render")) || {}; } catch (e) { return {}; } })();
function parseStyle(t) {
  var v = {}, m, re = /([A-Za-z]+):([+-]?\d+(?:\.\d+)?)/g, name = (t.match(/JMLAB_PRESET:(\S+)/) || [])[1];
  while ((m = re.exec(t))) if (RKEY[m[1]]) v[RKEY[m[1]]] = +m[2];
  return Object.keys(v).length ? {name: name ? name.replace(/_/g, " ") : "style", v: v} : null;
}
function renderUI() {
  return "<label class='opt'><input type='checkbox' id='rOn'" + (REND.on ? " checked" : "") + "><div><b>🎨 Retoucher les photos exportées</b> (rendu JM LAB PRO, même moteur que l'appli) : elles sont développées en JPEG. Les originaux ne sont jamais modifiés.</div></label>" +
    "<div id='rBox' style='display:" + (REND.on ? "grid" : "none") + ";grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;margin:4px 0 8px 26px'>" +
    "<span>Correction auto</span><label class='ck' style='margin:0'><input type='checkbox' id='rCat'" + (REND.cat === false ? "" : " checked") + "> selon la catégorie de chaque photo (tons, peau protégée)</label>" +
    "<span>Profil</span><select id='rProf'><option value='cat'" + ((REND.profile || "cat") === "cat" ? " selected" : "") + ">Selon la catégorie (conseillé)</option>" + PROFS.map(function (o) { return "<option value='" + o[0] + "'" + (REND.profile === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
    "<span>ProLab automatique</span><label class='ck' style='margin:0'><input type='checkbox' id='rAuto'" + (REND.off ? "" : " checked") + "> exposition corrigée photo par photo</label>" +
    "<span>Intensité</span><div style='display:flex;gap:8px;align-items:center'><input type='range' id='rDose' min='0' max='100' value='" + (REND.dose == null ? 65 : REND.dose) + "'><b id='rDoseV' style='width:42px'>" + (REND.dose == null ? 65 : REND.dose) + " %</b></div>" +
    "<span>Protection hautes lumières</span><div style='display:flex;gap:8px;align-items:center'><input type='range' id='rHp' min='0' max='100' value='" + (REND.hp == null ? 30 : REND.hp) + "'><b id='rHpV' style='width:42px'>" + (REND.hp == null ? 30 : REND.hp) + " %</b></div>" +
    "<span>Code de style<br><small class='small'>(facultatif)</small></span><div><input type='text' id='rCode' style='width:100%' placeholder='Collez un code JMLAB_PRESET:… de l&#39;appli (Styles › Partager)' value='" + esc(REND.code || "") + "'><div id='rCodeI' class='small'></div></div>" +
    "<span>Horizon</span><label class='ck' style='margin:0'><input type='checkbox' id='rTilt'" + (REND.tilt === false ? "" : " checked") + "> redresser l'horizon penché (recadrage automatique)</label>" +
    "<span>Noms</span><label class='ck' style='margin:0'><input type='checkbox' id='rName'" + (REND.name ? " checked" : "") + "> catégorie_client_001.jpg</label>" +
    "<span></span><label class='ck' style='margin:0'><input type='checkbox' id='rOrig'" + (REND.orig ? " checked" : "") + "> joindre aussi l'original</label>" +
    "</div>";
}
function renderWire() {
  var upd = function () {
    $("rBox").style.display = $("rOn").checked ? "grid" : "none"; $("rDoseV").textContent = $("rDose").value + " %"; $("rHpV").textContent = $("rHp").value + " %";
    var st = parseStyle($("rCode").value || ""); $("rCodeI").textContent = $("rCode").value ? (st ? "Style « " + st.name + " » : " + Object.keys(st.v).map(function (k) { return k.replace("Hautes SANS GRIS", "Hautes") + " " + st.v[k]; }).join(", ") : "Code non reconnu") : "Sans code : seuls le profil et ProLab s'appliquent.";
  };
  ["rOn", "rDose", "rHp", "rCode"].forEach(function (id) { $(id).addEventListener("input", upd); $(id).addEventListener("change", upd); }); upd();
}
function renderRead() {
  REND = {on: $("rOn").checked, cat: $("rCat").checked, profile: $("rProf").value, off: !$("rAuto").checked, dose: +$("rDose").value, hp: +$("rHp").value, code: $("rCode").value.trim(), orig: $("rOrig").checked, tilt: $("rTilt").checked, name: $("rName").checked};
  try { localStorage.setItem("rp_render", JSON.stringify(REND)); } catch (e) {}
  // memoire par client : ses reglages sont retrouves la prochaine fois
  var cl = ($("tClient").value || "").trim(); if (cl) { CLI[cl] = REND; try { localStorage.setItem("rp_clients", JSON.stringify(CLI)); } catch (e) {} }
  if (!REND.on) return null;
  var st = parseStyle(REND.code) || {v: {}}, dose = st.v.Dosage != null ? st.v.Dosage : REND.dose;
  return {profile: REND.profile, off: REND.off, dose: dose, hp: REND.hp, v: st.v, q: 92};
}
var CLI = (function () { try { return JSON.parse(localStorage.getItem("rp_clients")) || {}; } catch (e) { return {}; } })();
/* reglages propres a une photo : categorie (cibles, profil conseille, peau) et horizon */
function styleFor(p, base) {
  var o = JSON.parse(JSON.stringify(base)), cat = CATS[catOf(p)];
  if (REND.cat) { o.auto = {cibles: cat.cibles, ev: cat.ev, wb: cat.wb, tint: cat.tint}; o.skin = cat.peau; }
  else o.skin = 0.85;
  if (o.profile === "cat") o.profile = cat.prof;
  if (REND.tilt && p.a && p.a.tilt) o.tilt = p.a.tilt;
  var ad = p.adj || adjBias(p);
  if (ad) { o.v = o.v || {}; o.v.Exposition = (+o.v.Exposition || 0) + ad.ev / ((o.dose || 65) / 100) / 0.85 * 0.85; o.v.Temperature = Math.max(-100, Math.min(100, (+o.v.Temperature || 0) + ad.wb)); }
  return o;
}
var devWait = {};
function developOne(p, style) {
  return readBytes(p).then(function (b) {
    if (!b) throw new Error("aperçu introuvable");
    ensurePool(); var w = pool[0], key = "dev:" + p.id + ":" + Date.now(), c = b.buffer.byteLength === b.byteLength ? b : b.slice();
    return new Promise(function (res, rej) { devWait[key] = function (r) { if (r.dev) res(r.dev); else rej(new Error(r.err || "échec")); }; w.postMessage({id: key, buf: c, heic: !!p.heic, develop: true, style: style}, [c.buffer]); });
  });
}

function openExport() {
  var cl = ($("tClient").value || "").trim(), mem = cl && CLI[cl];
  if (mem) REND = JSON.parse(JSON.stringify(mem));
  var nP = S.photos.filter(function (p) { return p.status === "P"; }).length, nX = S.photos.filter(function (p) { return p.status === "X"; }).length, nS = S.photos.filter(function (p) { return p.stars > 0; }).length;
  if (!N) { dialog("<h3>📤 Exporter</h3><p>L'export (copie des photos, fichiers XMP) se fait dans la version PC de Regard Pur.</p><div class='row'><button class='pri' data-c='ok'>OK</button></div>"); return; }
  dialog("<h3>📤 Exporter</h3>" +
    "<label class='opt'><input type='radio' name='eW' value='P' checked><div><b>Les gardées</b> (" + nP + ")</div></label>" +
    "<label class='opt'><input type='radio' name='eW' value='PT'><div><b>Les gardées et les « à voir »</b> (tout sauf les rejetées)</div></label>" +
    "<label class='opt'><input type='radio' name='eW' value='S'><div><b>Avec au moins <select id='eS'><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select> étoile(s)</b> (" + nS + " avec étoiles)</div></label>" +
    "<div style='display:flex;gap:8px;align-items:center;margin:10px 0'><select id='eA'><option value='copy'>Copier</option><option value='move'>Déplacer</option></select> dans le sous-dossier <input type='text' id='eD' value='Retenues' style='flex:1'></div>" +
    (mem ? "<p class='small' style='color:var(--gold)'>Réglages retrouvés pour « " + esc(cl) + " ».</p>" : "") + renderUI() +
    "<label class='opt'><input type='checkbox' id='eRej'><div>Ranger aussi les <b>rejetées</b> (" + nX + ") dans le sous-dossier « Rejetées » (rien n'est effacé)</div></label>" +
    "<label class='opt'><input type='checkbox' id='eX' checked><div><b>Écrire les fichiers XMP</b> à côté de toutes les photos : étoiles, vert = gardée, rouge = rejetée. Lus par <b>Lightroom</b>, <b>Capture One</b>, <b>DxO</b>, <b>Bridge</b>.</div></label>" +
    "<div class='row'><button data-c='cancel'>Annuler</button><button class='pri' data-c='go'>Exporter</button></div>",
    function (c) { if (c === "go") doExport(); });
  renderWire();
}
async function doExport() {
  var w = document.querySelector("input[name=eW]:checked").value, minS = +$("eS").value, move = $("eA").value === "move", sub = ($("eD").value || "Retenues").replace(/[\\\/:*?"<>|]/g, "_"), rej = $("eRej").checked, xmp = $("eX").checked;
  var pick = S.photos.filter(function (p) { return w === "P" ? p.status === "P" : w === "PT" ? p.status !== "X" : p.stars >= minS; });
  var rejs = rej ? S.photos.filter(function (p) { return p.status === "X"; }) : [];
  var style = renderRead(), withOrig = !style || REND.orig;
  closeDialog();
  var tot = (xmp ? S.photos.length : 0) + pick.length + rejs.length, k = 0, err = 0;
  S.analysing = true; totalN = tot; doneN = 0; prog(); $("progTxt").textContent = "Export…";
  function step() { doneN = ++k; prog(); $("progTxt").textContent = "Export " + k + " / " + tot; }
  if (xmp) for (var i = 0; i < S.photos.length; i++) {
    var p = S.photos[i], xp = p.path.replace(/\.[^.\\\/]+$/, ".xmp");
    try { var old = await N.readText(xp); await N.writeText(xp, old && /<rdf:Description/.test(old) ? xmpMerge(old, p) : xmpPacket(p)); } catch (e) { err++; }
    step();
  }
  var dest = join(S.dir, sub);
  for (i = 0; i < pick.length; i++) {
    if (style) {
      // developpement avec le rendu JM LAB PRO (nom comme dans l'appli : _JMD_LAB_PRO.jpg)
      $("progTxt").textContent = "Retouche " + (i + 1) + " / " + pick.length;
      var nm = REND.name ? (catOf(pick[i]) + "_" + (($("tClient").value || "").trim() || "seance").replace(/[\\\/:*?"<>|&\s]+/g, "_") + "_" + pad(i + 1, 3)) : pick[i].name.replace(/\.[^.]+$/, "") + "_JMD_LAB_PRO";
      try { var jpg = await developOne(pick[i], styleFor(pick[i], style)); await N.writeBin(join(dest, nm + ".jpg"), jpg); } catch (e) { err++; }
    }
    if (withOrig) { try { var np = await N.copy(pick[i].path, dest, move); if (move) pick[i].path = np; } catch (e) { err++; } }
    step();
  }
  for (i = 0; i < rejs.length; i++) { try { rejs[i].path = await N.copy(rejs[i].path, join(S.dir, "Rejetées"), true); } catch (e) { err++; } step(); }
  S.analysing = false; prog(); saveSoon();
  dialog("<h3>✔ Export terminé</h3><p>" + pick.length + " photo(s) " + (style ? "retouchée(s) avec le rendu JM LAB PRO" + (withOrig ? (move ? " (originaux déplacés)" : " (originaux copiés)") : "") : (move ? "déplacée(s)" : "copiée(s)")) + " dans <b>" + esc(sub) + "</b>" + (rejs.length ? ", " + rejs.length + " rejetée(s) rangée(s) dans <b>Rejetées</b>" : "") + (xmp ? ", fichiers XMP écrits" : "") + "." + (err ? "<br><span style='color:var(--rej)'>" + err + " erreur(s).</span>" : "") + "</p>" +
    (xmp ? "<p class='small'>Dans Lightroom : sélectionnez les photos puis « Métadonnées › Lire les métadonnées à partir des fichiers ». Les JPEG gardent leurs notes dans Lightroom uniquement s'ils sont importés après l'export.</p>" : "") +
    "<div class='row'><button data-c='open'>📂 Ouvrir le dossier</button><button class='pri' data-c='ok'>OK</button></div>",
    function (c) { if (c === "open") N.openPath(dest); });
}

/* ---------------- importer depuis une carte SD (copie + renommage + copie de securite) ---------------- */
var IMP = (function () { try { return JSON.parse(localStorage.getItem("rp_import")) || {}; } catch (e) { return {}; } })();
function impSave() { try { localStorage.setItem("rp_import", JSON.stringify(IMP)); } catch (e) {} }
function pad(n, k) { n = String(n); while (n.length < k) n = "0" + n; return n; }
function ymd(t) { var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2); }
function hms(t) { var d = new Date(t); return pad(d.getHours(), 2) + "-" + pad(d.getMinutes(), 2) + "-" + pad(d.getSeconds(), 2); }
async function openImport() {
  if (!N) { dialog("<h3>📥 Importer une carte</h3><p>L'import depuis une carte SD se fait dans la version PC de Regard Pur.</p><div class='row'><button class='pri' data-c='ok'>OK</button></div>"); return; }
  var src = await N.pickDir("Choisir la carte SD (ou le dossier à importer)"); if (!src) return;
  var list = await N.list(src); if (!list.length) { toast("Aucune photo sur cette carte."); return; }
  if (!IMP.dest) IMP.dest = join(await N.picturesDir(), "Regard Pur");
  var done = IMP.seen || {}, fresh = list.filter(function (o) { return !done[o.name + "|" + o.size]; }).length;
  dialog("<h3>📥 Importer " + list.length + " photos</h3><p class='small'>Depuis : " + esc(src) + "</p>" +
    "<label class='opt' style='display:block'><b>Copier vers</b><div style='display:flex;gap:6px;margin-top:6px'><input type='text' id='iDest' value='" + esc(IMP.dest) + "' style='flex:1'><button data-c='dest'>Changer…</button></div></label>" +
    "<div style='display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;margin:10px 0'>" +
    "<span>Sous-dossier</span><select id='iSub'><option value='date'>Date de prise de vue (" + ymd(Date.now()) + ")</option><option value='name'>Date + nom de la séance</option><option value='none'>Aucun</option></select>" +
    "<span>Nom de la séance</span><input type='text' id='iName' placeholder='ex. Mariage Julie' value='" + esc(IMP.name || "") + "'>" +
    "<span>Renommer</span><select id='iRen'><option value='keep'>Garder le nom d'origine</option><option value='dt'>Date et heure (" + ymd(Date.now()) + "_" + hms(Date.now()) + ")</option><option value='dn'>Date + numéro (" + ymd(Date.now()) + "_0001)</option><option value='nn'>Nom de la séance + numéro (Seance_0001)</option></select>" +
    "</div>" +
    "<label class='opt'><input type='checkbox' id='iBak'" + (IMP.bak ? " checked" : "") + "><div><b>Copie de sécurité</b> en même temps vers : <span id='iBakP'>" + esc(IMP.bak || "(choisir…)") + "</span> <button data-c='bak' style='padding:2px 8px'>Choisir…</button></div></label>" +
    "<label class='opt'><input type='checkbox' id='iSkip' checked><div>Ne pas recopier les photos <b>déjà importées</b> (" + (list.length - fresh) + " sur cette carte)</div></label>" +
    "<p class='small'>Rien n'est effacé de la carte. Les fichiers RAW + JPEG d'une même photo gardent le même nom.</p>" +
    "<div class='row'><button data-c='cancel'>Annuler</button><button class='pri' data-c='go'>Importer puis trier</button></div>",
    async function (c) {
      if (c === "dest") { var d = await N.pickDir("Dossier où copier les photos", $("iDest").value); if (d) $("iDest").value = d; return keepOpen(); }
      if (c === "bak") { var b = await N.pickDir("Dossier de la copie de sécurité (autre disque, clé USB…)"); if (b) { IMP.bak = b; $("iBakP").textContent = b; $("iBak").checked = true; } return keepOpen(); }
      if (c === "go") doImport(src, list);
    });
  $("iSub").value = IMP.sub || "date"; $("iRen").value = IMP.ren || "keep";
}
function keepOpen() { $("dlg").classList.add("show"); }
async function doImport(src, list) {
  var dest = $("iDest").value.trim(), sub = $("iSub").value, name = ($("iName").value || "").trim().replace(/[\\\/:*?"<>|]/g, "_"), ren = $("iRen").value, bak = $("iBak").checked && IMP.bak, skip = $("iSkip").checked;
  if (!dest) { toast("Choisissez le dossier de destination."); keepOpen(); return; }
  if ((sub === "name" || ren === "nn") && !name) { toast("Indiquez le nom de la séance."); keepOpen(); return; }
  IMP.dest = dest; IMP.sub = sub; IMP.ren = ren; IMP.name = name; if (!$("iBak").checked) IMP.bak = IMP.bak || ""; impSave();
  closeDialog();
  IMP.seen = IMP.seen || {};
  var todo = list.filter(function (o) { return !skip || !IMP.seen[o.name + "|" + o.size]; });
  if (!todo.length) { toast("Toutes ces photos ont déjà été importées."); return; }
  // date de prise de vue de chaque photo (pour les dossiers et les noms)
  S.analysing = true; totalN = todo.length * 2; doneN = 0; prog();
  for (var i = 0; i < todo.length; i++) {
    var o = todo[i];
    try { var h = await N.readHead(o.path, 262144), ex = await window.exifr.parse(h, {pick: ["DateTimeOriginal", "CreateDate"]}).catch(function () { return null; }); var dt = ex && (ex.DateTimeOriginal || ex.CreateDate); o.t = dt instanceof Date ? dt.getTime() : o.mtime; } catch (e) { o.t = o.mtime; }
    doneN++; prog(); $("progTxt").textContent = "Lecture des dates " + (i + 1) + " / " + todo.length;
  }
  todo.sort(function (a, b) { return a.t - b.t || (a.name < b.name ? -1 : 1); });
  // numerotation : une meme photo en RAW + JPEG garde le meme numero
  var num = 0, last = null, out = [], err = 0, skipped = 0;
  for (i = 0; i < todo.length; i++) {
    o = todo[i];
    var base = o.name.replace(/\.[^.]+$/, ""), ext = o.name.slice(base.length).toLowerCase();
    if (base !== last) { num++; last = base; }
    var folder = sub === "date" ? join(dest, ymd(o.t)) : sub === "name" ? join(dest, ymd(o.t) + " " + name) : dest;
    var nm = ren === "dt" ? ymd(o.t) + "_" + hms(o.t) : ren === "dn" ? ymd(o.t) + "_" + pad(num, 4) : ren === "nn" ? name.replace(/\s+/g, "_") + "_" + pad(num, 4) : base;
    try {
      var r = await N.copyAs(o.path, join(folder, nm + ext));
      if (r.skipped) skipped++;
      if (bak) await N.copyAs(o.path, join(bak, folder.slice(dest.length).replace(/^[\\\/]/, ""), nm + ext));
      IMP.seen[o.name + "|" + o.size] = 1;
      out.push({path: r.path, name: r.path.split(/[\\\/]/).pop(), size: o.size, mtime: o.t, raw: o.raw, heic: o.heic});
    } catch (e) { err++; }
    doneN++; prog(); $("progTxt").textContent = "Copie " + (i + 1) + " / " + todo.length;
  }
  impSave(); S.analysing = false; prog();
  toast(out.length + " photo(s) importée(s)" + (skipped ? " (" + skipped + " déjà présentes)" : "") + (bak ? ", copie de sécurité faite" : "") + (err ? " — " + err + " erreur(s)" : "") + ". Analyse en cours…", 5000);
  // on trie directement ce qui vient d'etre importe
  var root = dest;
  await load(root, out.map(function (o) { var rel = o.path.slice(root.length).replace(/^[\\\/]/, ""); return {id: rel, name: o.name, path: o.path, rel: rel, size: o.size, mtime: o.mtime, raw: o.raw, heic: o.heic}; }), "");
}

/* ---------------- bilan de la seance ---------------- */
function stats() {
  var A = S.photos.filter(function (p) { return p.a && !p.a.err; }), n = S.photos.length;
  var c = function (f) { return S.photos.filter(f).length; };
  var why = {}; A.forEach(function (p) { (p.why ? p.why.rej : []).forEach(function (t) { t = t.replace(/ \(.*\)$/, ""); why[t] = (why[t] || 0) + 1; }); });
  var nP = c(function (p) { return p.status === "P"; }), nX = c(function (p) { return p.status === "X"; }), nA = c(function (p) { return p.status === "P" && p.auto || p.status === "X" && p.auto; });
  var sc = A.map(function (p) { return p.score; }), moy = sc.length ? Math.round(avg(sc)) : 0, best = A.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
  var ae = A.filter(function (p) { return p.a.aes != null; }).map(function (p) { return p.a.aes; });
  var bar2 = function (lbl, v, tot, col) { return "<div class='bar'><div class='l'><span>" + lbl + "</span><span>" + v + " (" + Math.round(v / Math.max(1, tot) * 100) + " %)</span></div><div class='t'><i style='width:" + (v / Math.max(1, tot) * 100) + "%;background:" + col + "'></i></div></div>"; };
  dialog("<h3>📊 Bilan de la séance</h3>" +
    "<p><b>" + n + "</b> photos · score moyen <b>" + moy + "</b>/100" + (ae.length ? " · œil artistique moyen <b>" + avg(ae).toFixed(1).replace(".", ",") + "</b>/10" : "") + " · <b>" + S.groups.length + "</b> série" + (S.groups.length > 1 ? "s" : "") + " · <b>" + PERS.length + "</b> personne" + (PERS.length > 1 ? "s" : "") + "</p>" +
    bar2("✔ Gardées", nP, n, "var(--keep)") + bar2("✖ Rejetées", nX, n, "var(--rej)") + bar2("À voir", n - nP - nX, n, "var(--mut)") +
    (nA ? "<p class='small'>" + nA + " choix faits par le tri automatique, " + (nP + nX - nA) + " faits à la main. Temps gagné estimé : environ " + Math.max(1, Math.round(nA * 4 / 60)) + " min.</p>" : "") +
    (Object.keys(why).length ? "<h4 style='margin:12px 0 4px'>Pourquoi des photos sont écartées</h4><table>" + Object.keys(why).sort(function (a, b) { return why[b] - why[a]; }).map(function (k) { return "<tr><td>" + why[k] + "</td><td>" + esc(k) + "</td></tr>"; }).join("") + "</table>" : "") +
    (best.length ? "<h4 style='margin:12px 0 4px'>Les 5 meilleures</h4><div style='display:flex;gap:6px'>" + best.map(function (p) { return "<div style='flex:1;text-align:center'>" + (p.thumbUrl ? "<img src='" + p.thumbUrl + "' style='width:100%;height:80px;object-fit:cover;border-radius:6px'>" : "") + "<div class='small'>" + p.score + "</div></div>"; }).join("") + "</div>" : "") +
    "<div class='row'><button class='pri' data-c='ok'>OK</button></div>");
}

/* ---------------- guide du premier lancement ---------------- */
var GUIDE = [
  ["👁️ Bienvenue dans Regard Pur", "Regard Pur trie vos photos pour vous : il repère les <b>floues</b>, les <b>bougées</b>, les <b>yeux fermés</b>, les <b>expositions ratées</b> et regroupe les <b>rafales</b>. Tout se passe sur votre PC, sans internet."],
  ["📂 1. Ouvrir ou importer", "<b>Ouvrir un dossier</b> pour des photos déjà sur le PC, ou <b>📥 Importer une carte</b> pour copier une carte SD (renommage et copie de sécurité possibles). L'analyse démarre toute seule."],
  ["✨ 2. Trier", "<b>Tri automatique</b> garde les meilleures et écarte les ratées, avec la raison écrite. Corrigez avec <b>P</b> (garder), <b>X</b> (rejeter), <b>1 à 5</b> (étoiles) : Regard Pur <b>apprend vos goûts</b>."],
  ["🔍 3. Vérifier", "<b>Entrée</b> : photo en grand, <b>Z</b> : zoom 100 % sur les yeux, <b>C</b> : comparer une série côte à côte. Colonne de gauche : filtres, problèmes repérés et <b>personnes</b>."],
  ["📤 4. Exporter", "<b>Exporter</b> copie les retenues, écrit les fichiers pour Lightroom et peut <b>retoucher avec le rendu JM LAB PRO</b>. Le bouton <b>❔</b> rappelle tous les raccourcis."]
];
function guide(i) {
  i = i || 0; var g = GUIDE[i];
  dialog("<h3>" + g[0] + "</h3><p style='line-height:1.6'>" + g[1] + "</p><p class='small'>" + (i + 1) + " / " + GUIDE.length + "</p><div class='row'>" + (i ? "<button data-c='prev'>← Précédent</button>" : "<button data-c='skip'>Passer</button>") + "<button class='pri' data-c='" + (i < GUIDE.length - 1 ? "next" : "end") + "'>" + (i < GUIDE.length - 1 ? "Suivant →" : "C'est parti !") + "</button></div>",
    function (c) { if (c === "next") guide(i + 1); else if (c === "prev") guide(i - 1); try { localStorage.setItem("rp_intro", "1"); } catch (e) {} });
}

/* ---------------- fenetres de dialogue ---------------- */
var dlgCb = null;
function dialog(html, cb) { $("dlgBox").innerHTML = html; $("dlg").classList.add("show"); dlgCb = cb || null; }
function closeDialog() { $("dlg").classList.remove("show"); }
$("dlg").addEventListener("click", function (e) {
  if (e.target === $("dlg")) { closeDialog(); return; }
  var b = e.target.closest("[data-c]"); if (!b || b.tagName === "LABEL") return;
  var c = b.dataset.c, cb = dlgCb; if (c !== "go") closeDialog(); if (cb) cb(c);
});
function help() {
  dialog("<h3>⌨️ Raccourcis clavier</h3><table>" +
    [["P", "Garder"], ["X", "Rejeter"], ["U", "Annuler le choix (à voir)"], ["1 … 5", "Étoiles (même chiffre = enlever)"], ["← →", "Photo précédente / suivante"], ["↑ ↓", "Ligne du dessus / dessous (grille)"],
     ["Entrée", "Vue en grand"], ["Échap", "Revenir à la grille"], ["Z", "Zoom 100 % sur les yeux ou la zone nette"], ["F", "Montrer / cacher visages et zone nette"],
     ["C", "Comparer (sélection ou série)"], ["Espace", "Ouvrir / fermer la série"], ["G", "Regrouper les séries oui / non"], ["Ctrl + clic", "Sélectionner plusieurs photos"], ["Maj + clic", "Sélectionner une suite"],
     ["Ctrl + A", "Tout sélectionner"], ["Ctrl + Z", "Annuler la dernière action"]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
    "</table><p class='small'>Score : netteté mesurée à 100 % (sur les yeux s'il y a un visage), flou de bougé, yeux fermés, exposition. Il apprend de vos choix P / X.</p><div class='row'><button data-c='guide'>Revoir le guide</button><button class='pri' data-c='ok'>OK</button></div>", function (c) { if (c === "guide") guide(0); });
}

/* ---------------- clavier ---------------- */
function cols() { var g = $("grid"), c = g.querySelector(".card"); if (!c) return 1; return Math.max(1, Math.round(g.clientWidth / (c.offsetWidth + 10))); }
document.addEventListener("keydown", function (e) {
  if ($("dlg").classList.contains("show")) { if (e.key === "Escape") closeDialog(); return; }
  if (e.target.tagName === "INPUT" && e.target.type === "text" || e.target.tagName === "SELECT") return;
  if (!S.photos.length) { if (e.key === "Enter" || (e.key === "o" && e.ctrlKey)) openFolder(); return; }
  var k = e.key, inCmp = $("compare").classList.contains("show"), inLp = $("loupe").classList.contains("show");
  if (e.ctrlKey && k.toLowerCase() === "z") { undo(); e.preventDefault(); return; }
  if (e.ctrlKey && k.toLowerCase() === "a") { S.view.forEach(function (id) { S.sel.add(id); }); S.photos.forEach(updCard); showPanel(); e.preventDefault(); return; }
  if (e.ctrlKey && k.toLowerCase() === "o") { openFolder(); e.preventDefault(); return; }
  if (inCmp) {
    if (k === "Escape") closeCompare();
    else if (k === "ArrowRight" || k === "ArrowDown") { cmp.cur = (cmp.cur + 1) % cmp.ids.length; drawCompare(); }
    else if (k === "ArrowLeft" || k === "ArrowUp") { cmp.cur = (cmp.cur + cmp.ids.length - 1) % cmp.ids.length; drawCompare(); }
    else if (/^[pxu]$/i.test(k)) setStatus(k.toLowerCase() === "p" ? "P" : k.toLowerCase() === "x" ? "X" : "", [S.byId[cmp.ids[cmp.cur]]]);
    else if (/^[0-5]$/.test(k)) setStars(+k, [S.byId[cmp.ids[cmp.cur]]]);
    else if (k.toLowerCase() === "z") { cmp.zoom = !cmp.zoom; layoutCp(); }
    else return;
    e.preventDefault(); return;
  }
  switch (k) {
    case "ArrowRight": setCur(S.cur + 1); break;
    case "ArrowLeft": setCur(S.cur - 1); break;
    case "ArrowDown": if (inLp) setCur(S.cur + 1); else setCur(S.cur + cols()); break;
    case "ArrowUp": if (inLp) setCur(S.cur - 1); else setCur(S.cur - cols()); break;
    case "Home": setCur(0); break;
    case "End": setCur(S.view.length - 1); break;
    case "Enter": if (!inLp) openLoupe(); break;
    case "Escape": if (inLp) closeLoupe(); else { S.sel.clear(); S.photos.forEach(updCard); showPanel(); } break;
    case " ": var p = S.byId[S.view[S.cur]]; if (p && p.g >= 0) { S.openGroup = S.openGroup === p.g ? -1 : p.g; refresh(); } break;
    default:
      var l = k.toLowerCase();
      if (l === "p") setStatus("P"); else if (l === "x") setStatus("X"); else if (l === "u") setStatus("");
      else if (/^[0-5]$/.test(k)) setStars(+k);
      else if (l === "c") openCompare();
      else if (l === "z") { if (!inLp) openLoupe(); $("lpZoom").click(); }
      else if (l === "f") { $("lpMarks").checked = !$("lpMarks").checked; if (inLp) showLoupe(); }
      else if (l === "g") { $("cGroup").checked = !$("cGroup").checked; S.openGroup = -1; refresh(); }
      else return;
  }
  e.preventDefault();
});

/* ---------------- boutons ---------------- */
$("bOpen").onclick = openFolder; $("bOpen2").onclick = openFolder;
$("bAuto").onclick = function () { if (S.analysing) { toast("Attendez la fin de l'analyse…"); return; } autoCull(); };
$("bImport").onclick = openImport; $("bCompare").onclick = openCompare; $("bExport").onclick = openExport; $("bHelp").onclick = help; $("bStats").onclick = stats;
try { if (!localStorage.getItem("rp_intro")) setTimeout(function () { guide(0); }, 400); } catch (e) {}
updLearn();
window.__rp = {S: S, score: score, reasons: reasons, autoCull: autoCull, load: load};
})();
