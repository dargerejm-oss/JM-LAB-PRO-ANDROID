/* Regard Pur - interface : grille, vue en grand, comparaison, tri automatique, export */
"use strict";
(function () {
var $ = function (id) { return document.getElementById(id); };
var N = window.RPNative || null;               // partie PC (absente dans un simple navigateur)
var RAWX = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|srw|x3f|3fr|iiq|rwl|mrw|kdc|erf)$/i;
var IMGX = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif|hif)$/i, HEICX = /\.(heic|heif|hif)$/i;

var AVER = 5; // version de l'analyse : si elle change, les photos sont reanalysees (les choix P / X / etoiles sont gardes)
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
/* vrais RAW : developpement complet avec LibRaw (donnees du capteur, balance des blancs de l'appareil, hautes lumieres
   recuperees) au lieu du petit apercu JPEG cache dans le fichier ; fait une fois, garde dans .regardpur/raw */
var LIBRAW = null, RAWQ = Promise.resolve();
function rawEnsure(p) {
  if (!N || !p.raw || p.rawDev) return Promise.resolve(false);
  RAWQ = RAWQ.then(async function () {
    if (p.rawDev) return false;
    var el = $("aiState"), msg = "⏳ Développement du RAW (" + p.name + ")…"; toast(msg, 3000);
    if (!LIBRAW) LIBRAW = (await import("./vendor/libraw/index.js")).default;
    var b = await N.read(p.path, false), raw = new LIBRAW();
    try {
      await raw.open(b, {useCameraWb: true, outputBps: 8, userQual: 3, highlight: 2, outputColor: 1});
      var im = await raw.imageData(), W = im.width, H = im.height, d = im.data, c = new OffscreenCanvas(W, H), x = c.getContext("2d"), id = x.createImageData(W, H), o = id.data;
      for (var i = 0, j = 0; i < W * H; i++, j += 3) { o[i * 4] = d[j]; o[i * 4 + 1] = d[j + 1]; o[i * 4 + 2] = d[j + 2]; o[i * 4 + 3] = 255; }
      x.putImageData(id, 0, 0);
      var jpg = new Uint8Array(await (await c.convertToBlob({type: "image/jpeg", quality: 0.95})).arrayBuffer());
      var f = sessPath("raw" + N.sep + String(p.rel || p.name).replace(/[\\\/:*?"<>|]+/g, "_").replace(/\.[^.]+$/, "") + ".jpg");
      await N.writeBin(f, jpg); p.rawDev = f; full.cache.delete(p.id); saveSoon();
      toast("RAW développé : " + p.name + " (" + W + " × " + H + ")", 2500); return true;
    } catch (e) { toast("RAW non développé (" + (e.message || e) + ") : l'aperçu de l'appareil est utilisé.", 4000); return false; }
    finally { try { raw.close && raw.close(); } catch (e2) {} }
  });
  return RAWQ;
}
function heicOf(p) { return !!p.heic && !p.ai; }
async function readBytes(p, orig) {
  if (N && p.ai && !orig) { var bi = await N.read(p.ai.file, false); if (bi) return bi; }
  if (N && p.raw && p.rawDev) { try { var br = await N.read(p.rawDev, false); if (br) return br; } catch (e) { p.rawDev = null; } }
  if (N) return await N.read(p.path, p.raw);
  var b = new Uint8Array(await p.file.arrayBuffer());
  return p.raw ? rawPreview(b) : b;
}

/* ---------------- score ---------------- */
var TH = { // seuils selon l'exigence : souple / normale / stricte
  sharp: [18, 28, 40], eye: [12, 20, 28], motion: [85, 70, 55], hi: [22, 12, 7], lo: [50, 32, 20], dark: [26, 36, 48], keep: [48, 58, 68], burst: [28, 16, 8]
};
function strict() { return +$("sStrict").value; }
function bigFaces(a) {
  return (a && a.faces || []).filter(function (f) { return f.w > 0.035; }).map(function (x) {
    // yeux fermes / mi-clos selon votre seuil appris (« Pas d'accord »)
    if (x.blinkMin != null) { x.closed = x.blinkMin > CALT.blink; x.half = !x.closed && x.blink > CALT.blink - 0.05; }
    // derriere des verres teintes, l'etat des yeux n'est pas lisible : on ne devine pas (TRI_YEUX_LUNETTES_PRO)
    if (x.tinted) { x.closed = false; x.half = false; x.unread = true; }
    return x;
  });
}
/* ---------------- « Pas d'accord » : vos corrections reglent les seuils de Regard Pur ----------------
   chaque correction garde la mesure de la photo et votre verdict ; on cherche le seuil qui colle le mieux
   a vos verdicts, sans trop s'eloigner du seuil d'origine. */
var CAL = (function () { try { return JSON.parse(localStorage.getItem("rp_cal")) || {ex: []}; } catch (e) { return {ex: []}; } })();
var CALT = {eyeD: 0, sceneD: 0, blink: 0.5};
function calFit(kind, def, lo, hi, step, bad) { // bad(v, t) : vrai si la mesure v serait jugee « mauvaise » avec le seuil t
  var ex = CAL.ex.filter(function (o) { return o.k === kind; }); if (!ex.length) return def;
  var best = def, bc = Infinity;
  for (var t = lo; t <= hi + 1e-9; t += step) {
    var c = Math.abs(t - def) / (hi - lo) * 1.5;
    ex.forEach(function (o) { if (bad(o.v, t) !== !!o.y) c += 1; });
    if (c < bc) { bc = c; best = t; }
  }
  return best;
}
function calUpdate() {
  CALT.eyeD = calFit("eye", 20, 0, 70, 1, function (v, t) { return v < t; }) - 20;
  CALT.sceneD = calFit("scene", 28, 0, 80, 1, function (v, t) { return v < t; }) - 28;
  CALT.blink = calFit("blink", 0.5, 0.15, 0.9, 0.01, function (v, t) { return v > t; });
}
calUpdate();
function calAdd(p, what) {
  var a = p.a; if (!a || a.err) return;
  var er = eyeRaw(a), f = bigFaces(a);
  p.ov = p.ov || {};
  if (what === "floue" || what === "nette") {
    if (er != null) CAL.ex.push({k: "eye", v: er, y: what === "floue" ? 1 : 0}); else CAL.ex.push({k: "scene", v: a.sharp, y: what === "floue" ? 1 : 0});
    p.ov.sharp = what;
  } else if (what === "fermes" || what === "ouverts") {
    f.forEach(function (x) { if (x.blinkMin != null) CAL.ex.push({k: "blink", v: what === "fermes" ? x.blink : x.blinkMin, y: what === "fermes" ? 1 : 0}); });
    p.ov.eyes = what;
  }
  if (CAL.ex.length > 600) CAL.ex.splice(0, CAL.ex.length - 600);
  try { localStorage.setItem("rp_cal", JSON.stringify(CAL)); } catch (e) {}
  calUpdate(); rescore(); refresh(false); saveSoon(); updLearn();
  toast("Merci, c'est noté. Regard Pur a revu tout le dossier avec votre correction.");
}
function calReset() { CAL = {ex: []}; try { localStorage.removeItem("rp_cal"); } catch (e) {} S.photos.forEach(function (p) { p.ov = null; }); calUpdate(); rescore(); refresh(false); saveSoon(); updLearn(); toast("Réglages appris remis à zéro."); }
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
  // avec un visage, c'est la nettete des yeux qui compte (pas un detail net ailleurs, comme une fourrure ou le fond)
  return Math.round(e == null ? a.sharp : Math.min(100, e * 1.45));
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
  if (a.pix) s -= 30; else if (a.up != null && a.up > 0.07) s -= 10;
  if (a.jq != null && a.jq < 50) s -= (50 - a.jq) * 0.3;
  if (a.noiseView != null && a.noiseView > 5 && (a.mp || 0) >= 0.8) s -= (a.noiseView - 5) * 2.5;
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
  var se = sharpEff(a), f = bigFaces(a), er = eyeRaw(a), ov = p.ov || {}, tE = TH.eye[k] + CALT.eyeD, tS = TH.sharp[k] + CALT.sceneD;
  if (ov.sharp === "floue") rej.push(f.length ? "Visage / yeux flous (votre avis)" : "Floue (votre avis)");
  else if (ov.sharp === "nette") good.push(f.length ? "Yeux nets (votre avis)" : "Nette (votre avis)");
  else if (er != null ? er < tE : se < tS) rej.push(f.length ? "Visage / yeux flous" : "Floue");
  else if (er != null ? er < tE + 8 : se < tS + 12) warn.push("Netteté moyenne");
  else good.push(f.length ? "Yeux nets" : "Nette");
  if (a.motion >= TH.motion[k] && a.sharp < 70) rej.push("Flou de bougé");
  else if (a.motion >= TH.motion[k] - 20 && a.sharp < 70) warn.push("Léger bougé");
  if (f.length && ov.eyes === "fermes") rej.push("Yeux fermés (votre avis)");
  else if (f.length && ov.eyes === "ouverts") good.push("Yeux ouverts (votre avis)");
  else if (f.length) {
    var cl = f.filter(function (x) { return x.closed; }).length, hf = f.filter(function (x) { return x.half; }).length, gls = f.filter(function (x) { return x.glasses != null && x.glasses >= 0.25; }).length, ur = f.filter(function (x) { return x.unread; }).length;
    if (ur) warn.push("Verres teintés : yeux non lisibles" + (f.length > 1 ? " (" + ur + " sur " + f.length + ")" : ""));
    else if (gls) warn.push("Lunettes" + (f.length > 1 ? " (" + gls + " sur " + f.length + ")" : "") + " : vérifiez les reflets");
    if (cl === f.length) rej.push(f.length > 1 ? "Yeux fermés (tout le monde)" : "Yeux fermés");
    else if (cl) (k >= 1 ? rej : warn).push("Yeux fermés (" + cl + " sur " + f.length + ")");
    else if (hf) warn.push("Yeux mi-clos");
    else if (ur < f.length) good.push(f.length > 1 ? f.length + " visages, yeux ouverts" : "Yeux ouverts");
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
  // qualite d'image : pixelisation, photo agrandie, compression, bruit, definition, informations de prise de vue
  if (a.pix) (k >= 1 ? rej : warn).push("Pixelisée (agrandie sans lissage)");
  else if (a.up != null && a.up > 0.07) warn.push("Photo agrandie (vraie définition plus faible)");
  if (a.jq != null && a.jq < 50) (a.jq < 30 && k === 2 ? rej : warn).push("Compression JPEG forte (qualité " + a.jq + ")");
  if (a.noiseView != null && (a.mp || 0) >= 0.8) { if (a.noiseView > 8.5) (k === 2 ? rej : warn).push("Très bruitée"); else if (a.noiseView > 5) warn.push("Grain / bruit visible"); }
  if (a.mp != null) { var cmW = Math.round(Math.max(a.w, a.h) / 200 * 2.54), cmH = Math.round(Math.min(a.w, a.h) / 200 * 2.54);
    if (a.mp < 0.8) warn.push("Très petite définition (" + String(a.mp).replace(".", ",") + " Mpx) : écran seulement");
    else if (a.mp < 2.5) warn.push("Petite définition (" + String(a.mp).replace(".", ",") + " Mpx) : tirage jusqu'à ~" + cmW + "×" + cmH + " cm"); }
  if (!a.exif || (!a.exif.date && !a.exif.model && !a.exif.make)) warn.push("Sans EXIF (copie, capture ou photo envoyée par message ?)");
  var ae = aesScore(a); if (ae != null && ae >= 72 && !rej.length && !warn.some(function (t) { return /Netteté|bougé/.test(t); })) good.push("Belle image (œil artistique)");
  if (a.cadre) warn.push("Cadre ajouté (export déjà finalisé ?)");
  if (p.sig != null && p.sig >= 0.6) warn.push("Signature / filigrane trouvé (export déjà signé ?)");
  if (p.dup >= 0) { var dg = S.dups[p.dup], od = S.byId[dg.orig];
    if (p.dupOrig) good.push("Original gardé (" + dg.length + " versions de cette photo)");
    else warn.push("Doublon : autre version de " + (od ? od.name : "une photo") + (p.dupSize ? " (taille différente)" : ""));
  }
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
/* doublons (repris d'AUDIT PHOTOS PRO) : la meme photo dans un autre fichier (reexport, retouche, recadrage, version redressee,
   avec cadre ou plus petite). Original garde : sans cadre, puis la plus grande, puis la plus ancienne. */
function pc32(x) { x = x - ((x >>> 1) & 0x55555555); x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
function hx(h) { return [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8, 16), 16) >>> 0]; }
function hd(a, b) { return pc32((a[0] ^ b[0]) >>> 0) + pc32((a[1] ^ b[1]) >>> 0); }
function buildDups() {
  var L = S.photos.filter(function (p) { p.dup = -1; p.dupOrig = false; p.dupSize = false; return p.a && !p.a.err && p.a.dh; });
  var H = L.map(function (p) { return p.a.dh.map(hx); }), par = L.map(function (x, i) { return i; });
  var find = function (i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
    var d0 = hd(H[i][0], H[j][0]); if (d0 > 22) continue;
    var dc = d0; for (var k = 1; k < 5; k++) { dc = Math.min(dc, hd(H[i][0], H[j][k]), hd(H[j][0], H[i][k])); }
    if (d0 > 6 && dc > 10) continue;
    // une rafale (deux instants differents) n'est pas un doublon : meme date de prise de vue, ou date absente
    var ea = L[i].a.exif && L[i].a.exif.date, eb = L[j].a.exif && L[j].a.exif.date;
    if (ea && eb && Math.abs(ea - eb) > 1000) continue;
    if (ea && eb && d0 > 4 && dc > 6 && Math.abs(ea - eb) > 0) continue;
    par[find(i)] = find(j);
  }
  var G = {}; L.forEach(function (p, i) { var r = find(i); (G[r] = G[r] || []).push(p); });
  S.dups = [];
  Object.keys(G).forEach(function (r) {
    var g = G[r]; if (g.length < 2) return;
    var gi = S.dups.length, key = function (p) { return [p.a.cadre ? 1 : 0, -(p.a.w * p.a.h), p.mtime || 0]; };
    var o = g.slice().sort(function (a, b) { var A = key(a), B = key(b); for (var q = 0; q < 3; q++) if (A[q] !== B[q]) return A[q] - B[q]; return 0; })[0];
    var dims = {}; g.forEach(function (p) { var dk = p.a.w + "x" + p.a.h; dims[dk] = (dims[dk] || 0) + 1; });
    var modal = Object.keys(dims).sort(function (a, b) { return dims[b] - dims[a]; })[0].split("x").map(Number);
    g.forEach(function (p) { p.dup = gi; p.dupOrig = p === o; p.dupSize = Math.abs(p.a.w * p.a.h - modal[0] * modal[1]) / (modal[0] * modal[1]) >= 0.05; });
    var ids = g.map(function (p) { return p.id; }); ids.orig = o.id; S.dups.push(ids);
  });
}
function rejectDups() {
  var n = 0; pushUndo(S.photos.filter(function (p) { return p.dup >= 0 && !p.dupOrig; }));
  S.photos.forEach(function (p) { if (p.dup >= 0 && !p.dupOrig && p.status !== "R") { p.status = "R"; p.auto = false; n++; updCard(p); } });
  drawFilters(); showPanel(); saveSoon(); toast(n ? n + " doublon" + (n > 1 ? "s rejetés" : " rejeté") + " : les originaux sont gardés (Ctrl+Z pour annuler)." : "Aucun doublon à rejeter.", 4000);
}
/* signature / filigrane (repris d'AUDIT PHOTOS PRO) : correlation normalisee avec l'image de la signature, dans les coins
   du haut et la bande du bas, a plusieurs tailles ; signature claire ou foncee (valeur absolue de la correlation) */
var SIG = null; try { SIG = JSON.parse(localStorage.getItem("rp_sig") || "null"); } catch (e) {}
function grayOfCanvas(c) { var d = c.getContext("2d", {willReadFrequently: true}).getImageData(0, 0, c.width, c.height).data, g = new Float32Array(c.width * c.height); for (var i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return g; }
function hipass(g, w, h, r) { // retire le fond (moyenne locale) : seuls les traits fins comptent, quel que soit le fond
  var t = new Float32Array(w * h), o = new Float32Array(w * h), x, y, s, n;
  for (y = 0; y < h; y++) { s = 0; n = 0; for (x = -r; x < w + r; x++) { if (x + r < w && x + r >= 0) { s += g[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= g[y * w + x - r - 1]; n--; } if (x >= 0 && x < w) t[y * w + x] = s / n; } }
  for (x = 0; x < w; x++) { s = 0; n = 0; for (y = -r; y < h + r; y++) { if (y + r < h && y + r >= 0) { s += t[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= t[(y - r - 1) * w + x]; n--; } if (y >= 0 && y < h) o[y * w + x] = g[y * w + x] - s / n; } }
  return o;
}
function shrink(src, sw, sh, w, h) { var c = new OffscreenCanvas(w, h), x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, sw, sh, 0, 0, w, h); return c; }
function ncc(Z, zw, zh, T, tw, th) {
  var n = tw * th, tm = 0, i, x, y; for (i = 0; i < n; i++) tm += T[i]; tm /= n; var Tc = new Float32Array(n), ts = 0; for (i = 0; i < n; i++) { Tc[i] = T[i] - tm; ts += Tc[i] * Tc[i]; } ts = Math.sqrt(ts); if (ts < 1e-3) return 0;
  var I = new Float64Array((zw + 1) * (zh + 1)), I2 = new Float64Array((zw + 1) * (zh + 1)), W1 = zw + 1;
  for (y = 0; y < zh; y++) { var a = 0, a2 = 0; for (x = 0; x < zw; x++) { var v = Z[y * zw + x]; a += v; a2 += v * v; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + a; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + a2; } }
  var best = 0;
  for (y = 0; y + th <= zh; y++) for (x = 0; x + tw <= zw; x++) {
    var s1 = I[(y + th) * W1 + x + tw] - I[y * W1 + x + tw] - I[(y + th) * W1 + x] + I[y * W1 + x], s2 = I2[(y + th) * W1 + x + tw] - I2[y * W1 + x + tw] - I2[(y + th) * W1 + x] + I2[y * W1 + x];
    var zs = Math.sqrt(Math.max(0, s2 - s1 * s1 / n)); if (zs < 1e-3) continue;
    var c = 0; for (var yy = 0; yy < th; yy++) { var zo = (y + yy) * zw + x, to = yy * tw; for (var xx = 0; xx < tw; xx++) c += Z[zo + xx] * Tc[to + xx]; }
    c = Math.abs(c / (zs * ts)); if (c > best) best = c;
  }
  return best;
}
async function sigScore(p, tmpl) {
  var by = await readBytes(p, true), bm;
  if (by && !p.heic) { try { bm = await createImageBitmap(new Blob([by]), {imageOrientation: "from-image"}); var k0 = Math.min(1, 1200 / Math.max(bm.width, bm.height)); if (k0 < 1) { var b2 = await createImageBitmap(bm, {resizeWidth: Math.round(bm.width * k0), resizeHeight: Math.round(bm.height * k0), resizeQuality: "high"}); bm.close(); bm = b2; } } catch (e) { bm = null; } }
  if (!bm) { if (!p.thumbUrl) return null; bm = await createImageBitmap(await (await fetch(p.thumbUrl)).blob()); }
  var W = bm.width, H = bm.height, best = 0;
  var zones = [[0, 0, W / 4, H / 4], [W * 3 / 4, 0, W / 4, H / 4], [0, H * 3 / 4, W, H / 4]];
  var RL = [0.08, 0.11, 0.14, 0.17, 0.2, 0.24, 0.29, 0.35];
  for (var k = 0; k < RL.length; k++) {
    var rel = RL[k], tw0 = W * rel, th0 = tw0 * tmpl.h / tmpl.w, f = Math.max(1, tw0 / 64), tw = Math.max(8, Math.round(tw0 / f)), th = Math.max(4, Math.round(th0 / f));
    var T = hipass(grayOfCanvas(shrink(tmpl.img, tmpl.w, tmpl.h, tw, th)), tw, th, 3);
    for (var z = 0; z < zones.length; z++) { var Z = zones[z], zw = Math.round(Z[2] / f), zh = Math.round(Z[3] / f); if (zw <= tw || zh <= th) continue;
      var zc = new OffscreenCanvas(zw, zh); zc.getContext("2d").drawImage(bm, Z[0], Z[1], Z[2], Z[3], 0, 0, zw, zh);
      best = Math.max(best, ncc(hipass(grayOfCanvas(zc), zw, zh, 3), zw, zh, T, tw, th)); }
  }
  bm.close(); return Math.round(best * 100) / 100;
}
async function sigScan() {
  if (!SIG) return; var im = new Image(); im.src = SIG.url; await im.decode();
  var tmpl = {img: im, w: im.naturalWidth, h: im.naturalHeight}, L = S.photos.filter(function (p) { return p.thumbUrl; }), t0 = Date.now();
  for (var i = 0; i < L.length; i++) {
    try { L[i].sig = await sigScore(L[i], tmpl); } catch (e) {}
    if (i % 10 === 0) { $("sigInfo").textContent = "⏳ " + (i + 1) + " / " + L.length; await new Promise(function (r) { setTimeout(r, 0); }); }
  }
  var n = L.filter(function (p) { return p.sig >= 0.6; }).length;
  $("sigInfo").textContent = "Signature trouvée sur " + n + " / " + L.length + " (" + Math.round((Date.now() - t0) / 1000) + " s)";
  rescore(); refresh(false); drawFilters(); saveSoon();
}
$("bSig").onclick = function () { $("fSig").click(); };
$("fSig").addEventListener("change", function () {
  var f = this.files[0]; if (!f) return; var rd = new FileReader();
  rd.onload = function () { var im = new Image(); im.onload = function () { var k = Math.min(1, 240 / im.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    SIG = {url: c.toDataURL("image/png"), name: f.name}; try { localStorage.setItem("rp_sig", JSON.stringify(SIG)); } catch (e) {} sigUi(); sigScan(); }; im.src = rd.result; };
  rd.readAsDataURL(f);
});
$("bSigScan").onclick = function () { sigScan(); };
function sigUi() { $("bSigScan").style.display = SIG ? "" : "none"; if (SIG && !/⏳|trouvée/.test($("sigInfo").textContent)) $("sigInfo").textContent = SIG.name; }
sigUi();
function rescore() { S.photos.forEach(function (p) { p.score = score(p); }); buildGroups(); buildDups(); buildSessions(); S.photos.forEach(function (p) { p.why = reasons(p); }); }

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
      if (t) { var ss = JSON.parse(t); persNames = ss.persons || {}; if (ss.cat && CATS[ss.cat] || ss.cat === "auto") $("sCat").value = ss.cat; $("tClient").value = ss.client || ""; Object.keys(ss.photos || {}).forEach(function (k) { var p = S.byId[k], o = ss.photos[k]; if (!p) return; p.status = o.st || ""; p.auto = !!o.au; p.stars = o.s || 0; p.adj = o.adj || null; p.ret = o.ret || null; p.heals = o.heals || null; p.ov = o.ov || null; p.dev = o.dev || null; p.ai = o.ai || null; p.sig = o.sig == null ? null : o.sig; p.rot = o.rot || 0; p.qc = o.qc || null; p.place = o.place || null; p.rawDev = o.rawDev || null; if (o.a && o.sz === p.size && o.a.v === AVER) { p.a = o.a; p.cached = true; } }); }
    } catch (e) {}
  }
  $("empty").style.display = "none"; $("grid").style.display = "grid";
  ["bAuto", "bCompare", "bStats", "bFix"].forEach(function (b) { $(b).disabled = false; });
  rescore(); buildPersons(); buildCards(); refresh(); updLearn(); setTab("trier");
  var todo = S.photos.filter(function (p) { return !p.a; });
  // session reprise : note artistique des photos qui n'en ont pas encore (vignettes chargees petit a petit)
  S.photos.filter(function (p) { return p.a && !p.a.err && p.a.aes == null; }).forEach(function (p, i) { setTimeout(function () { if (p.thumbUrl) queueNima(p); else loadThumb(p); }, 50 + i * 5); });
  if (todo.length) { quickThumbs(todo); analyse(todo); } else toast("Session reprise : " + items.length + " photos déjà analysées.");
}
/* enregistrement de la seance : l'analyse de chaque photo (lourde, elle ne change pas quand on retouche) est mise en texte
   une seule fois et reutilisee ; on n'enregistre qu'une fois les curseurs relaches (5000 photos : plus de blocage) */
var AJV = 0;
function aJson(p) { if (p._aRef !== p.a || p._aV !== AJV) { p._aRef = p.a; p._aV = AJV; p._aj = JSON.stringify(p.a === undefined ? null : p.a); } return p._aj; }
function saveSoon() {
  if (!N || !S.dir) return;
  clearTimeout(S.saveT);
  S.saveT = setTimeout(saveNow, 1500);
}
function saveNow(sync) {
  S.saveT = null; if (!N || !S.dir) return;
  {
    var head = {v: 1, saved: Date.now(), persons: persNames, cat: $("sCat").value, client: $("tClient").value}, parts = [];
    S.photos.forEach(function (p) {
      var r = JSON.stringify({st: p.status, au: p.auto, s: p.stars, sz: p.size, adj: p.adj || undefined, ret: p.ret || undefined, heals: p.heals || undefined, ov: p.ov || undefined, dev: p.dev || undefined, ai: p.ai || undefined, sig: p.sig == null ? undefined : p.sig, rot: p.rot || undefined, qc: p.qc || undefined, place: p.place || undefined, rawDev: p.rawDev || undefined});
      parts.push(JSON.stringify(p.id) + ':{"a":' + aJson(p) + (r.length > 2 ? "," + r.slice(1) : "}"));
    });
    var txt = JSON.stringify(head).slice(0, -1) + ',"photos":{' + parts.join(",") + "}}";
    if (sync && N.writeTextSync) N.writeTextSync(sessPath("session.json"), txt); else N.writeText(sessPath("session.json"), txt);
  }
}
/* fermeture du programme : ce qui n'est pas encore enregistre l'est tout de suite */
window.addEventListener("beforeunload", function () { if (S.saveT) { clearTimeout(S.saveT); saveNow(true); } });

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
  // un assistant par coeur (moins un), jusqu'a 6 si le PC a assez de memoire (chaque assistant garde ses modeles)
  var n = clamp((navigator.hardwareConcurrency || 4) - 1, 1, (navigator.deviceMemory || 8) >= 8 ? 6 : 3);
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
  doneN = 0; totalN = queue.length; S.analysing = true; S.t0 = Date.now(); prog(); pump();
}
/* pendant qu'on retouche, l'analyse en arriere-plan laisse la place a l'apercu (moitie des assistants, un travail chacun) */
function retouching() { S.busyUntil = Date.now() + 3000; clearTimeout(S.busyT); if (S.analysing) S.busyT = setTimeout(pump, 3100); }
function pump() {
  var rid = runId, calm = !(S.busyUntil > Date.now()), half = Math.ceil(pool.length / 2);
  pool.forEach(function (w, wi) {
    var lim = calm ? 2 : wi < half ? 1 : 0;
    while (w.inflight < lim && queue.length) {
      var p = queue.shift(); w.inflight++;
      (function (p, w) {
        readBytes(p, true).then(function (buf) { return !buf && p.raw && N ? rawEnsure(p).then(function () { return readBytes(p, true); }) : buf; }).then(function (buf) {
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
  if (r.pmask !== undefined) { var cbk = prevWait[r.id]; delete prevWait[r.id]; if (cbk) cbk(r); return; }
  if (r.meas !== undefined) { var cbm = prevWait[r.id]; delete prevWait[r.id]; if (cbm) cbm(r); return; }
  if (r.faces5 !== undefined) { var cbf = prevWait[r.id]; delete prevWait[r.id]; if (cbf) cbf(r); return; }
  if (r.joined !== undefined) { var cbj = prevWait[r.id]; delete prevWait[r.id]; if (cbj) cbj(r); return; }
  if (r.warm !== undefined) { var cbw = prevWait[r.id]; delete prevWait[r.id]; if (cbw) cbw(r); else if (r.warm) r.warm.close(); return; }
  if (r.profs !== undefined) { var cbq = prevWait[r.id]; delete prevWait[r.id]; if (cbq) cbq(r); return; }
  if (r.prev !== undefined) { var cbp = prevWait[r.id]; delete prevWait[r.id]; if (cbp) cbp(r); return; }
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
  var eta = "";
  if (S.t0 && doneN >= 3 && doneN < totalN) { var sec = Math.round((Date.now() - S.t0) / doneN * (totalN - doneN) / 1000); eta = " · reste " + (sec >= 60 ? Math.round(sec / 60) + " min" : sec + " s"); }
  $("progTxt").textContent = "Analyse " + doneN + " / " + totalN + eta;
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
      p.a.aes = Math.round(nimaScore(net, c) * 100) / 100; AJV++; p.score = score(p); p.why = reasons(p); updCard(p);
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
    var ids = {}; c.items.forEach(function (o) { ids[o.p.id] = 1; o.f.pid = i; }); AJV++;
    var rep = c.items.slice().sort(function (a, b) { return (b.f.eyeSharp || 0) - (a.f.eyeSharp || 0); })[0];
    var name = ""; Object.keys(persNames).forEach(function (k) { var o = persNames[k]; if (!name && dist(o.cen, c.cen) < 0.45) name = o.name; });
    return {i: i, cen: c.cen, ids: ids, n: Object.keys(ids).length, ic: rep.f.ic, name: name || "Personne " + (i + 1)};
  });
}
/* seances (repris de TRI_SHOOTING_PRO) : decoupage par pauses ; une seance riche en personnes = seance de pose */
var SESS = [], SGAP = 60; try { SGAP = +localStorage.getItem("rp_sgap") || 60; } catch (e) {}
function buildSessions() {
  // date de prise de vue (EXIF), sinon date du fichier (comme TRI SHOOTING PRO)
  var L = S.photos.filter(function (p) { p.sess = -1; return p.a && !p.a.err && when(p); }).sort(function (a, b) { return when(a) - when(b); });
  SESS = []; var cur = null;
  L.forEach(function (p) {
    var t = when(p);
    if (!cur || t - cur.end > SGAP * 60000 || t - cur.start > 180 * 60000) { cur = {start: t, end: t, ids: []}; SESS.push(cur); }
    cur.end = t; cur.ids.push(p.id); p.sess = SESS.length - 1;
  });
  SESS.forEach(function (o) {
    var posed = o.ids.filter(function (id) { return bigFaces(S.byId[id].a).length > 0; }).length, r = posed / o.ids.length;
    o.posed = posed; o.kind = posed >= 10 && r >= 0.6 ? "Séance de pose" : r >= 0.6 ? "Portraits" : r < 0.2 ? "Paysages, détails" : "Mixte";
  });
}
function drawSessions() {
  var el = $("sessions"); if (!el) return;
  if (!SESS.length) { el.innerHTML = '<div class="note">Aucune photo datée (EXIF) : pas de séance à afficher.</div>'; return; }
  var hm = function (t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + "h" + ("0" + d.getMinutes()).slice(-2); };
  el.innerHTML = SESS.map(function (o, i) { var d = new Date(o.start);
    return '<div class="flt' + (S.filter === "sess:" + i ? " on" : "") + '" data-f="sess:' + i + '"><span>' + d.toLocaleDateString("fr-FR") + " " + hm(o.start) + "–" + hm(o.end) + "<small>" + o.kind + (o.posed ? " · " + o.posed + " avec personnes" : "") + "</small></span><span>" + o.ids.length + "</span></div>"; }).join("");
}
$("sessGap").value = SGAP; $("sessGapV").textContent = SGAP + " min";
$("sessGap").addEventListener("input", function () { SGAP = +this.value; $("sessGapV").textContent = SGAP + " min"; try { localStorage.setItem("rp_sgap", SGAP); } catch (e) {} buildSessions(); drawSessions(); });
$("sessions").addEventListener("click", function () { setTimeout(drawSessions, 0); });
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
  ["glasses", "Lunettes / verres teintés", function (p) { return has(p, /Lunettes|Verres teintés/); }],
  ["expo", "Exposition ratée", function (p) { return has(p, /exposée|sombre|brûlés/i); }],
  ["compo", "Composition (bord, tête, horizon)", function (p) { return has(p, /coupé|tête|Horizon/); }],
  ["qual", "Qualité d'image (bruit, pixels, compression, définition)", function (p) { return has(p, /Pixelisée|agrandie|Compression|bruit|Bruit|bruitée|définition/); }],
  ["noexif", "Sans EXIF", function (p) { return has(p, /Sans EXIF/); }],
  ["faces", "Avec visages", function (p) { return bigFaces(p.a).length > 0; }],
  ["groups", "Rafales et séries", function (p) { return p.g >= 0; }],
  ["dups", "Doublons (même photo, autre fichier)", function (p) { return p.dup >= 0; }],
  ["dupsize", "Doublons de taille différente", function (p) { return p.dup >= 0 && p.dupSize; }],
  ["cadre", "Cadre ajouté", function (p) { return !!(p.a && p.a.cadre); }],
  ["sig", "Avec ma signature", function (p) { return p.sig != null && p.sig >= 0.6; }],
  ["nosig", "Sans ma signature", function (p) { return p.sig != null && p.sig < 0.6; }]
];
function has(p, re) { var w = p.why; if (!w) return false; return w.rej.concat(w.warn).some(function (t) { return re.test(t); }); }
function fnOf(k) {
  if (/^sess:/.test(k)) { var so = SESS[+k.slice(5)]; return function (p) { return !!so && so.ids.indexOf(p.id) >= 0; }; }
  if (/^person:/.test(k)) { var o = PERS[+k.slice(7)]; return function (p) { return !!(o && o.ids[p.id]); }; }
  if (/^similar:/.test(k)) { var ref = S.byId[k.slice(8)]; return function (p) { return !!ref && simDist(ref, p) <= 26; }; }
  var f = FILTERS.concat(ISSUES).filter(function (x) { return x[0] === k; })[0]; return f ? f[2] : FILTERS[0][2]; }
function drawFilters() {
  drawSessions();
  function row(f) { var n = S.photos.filter(f[2]).length; return '<div class="flt' + (S.filter === f[0] ? " on" : "") + '" data-f="' + f[0] + '"><span>' + f[1] + "</span><span>" + n + "</span></div>"; }
  $("filters").innerHTML = FILTERS.map(row).join("");
  $("issues").innerHTML = ISSUES.map(row).join("") + (S.dups && S.dups.some(function (g) { return g.some(function (id) { var q = S.byId[id]; return q && !q.dupOrig && q.status !== "R"; }); }) ? '<button id="bRejDup" class="mini" style="width:100%;margin-top:4px" data-tip="Rejette toutes les versions en double et garde l\'original de chaque photo (sans cadre, la plus grande, puis la plus ancienne)">Rejeter les doublons (garder les originaux)</button>' : "");
}
$("side").addEventListener("click", function (e) { if (e.target.id === "bRejDup") { rejectDups(); return; } var f = e.target.closest(".flt"); if (!f) return; S.filter = f.dataset.f; S.openGroup = -1; refresh(true); });

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
  c.classList.toggle("qc", !!p.qc);
  var im = c.querySelector(".im");
  if (p.thumbUrl && !im.querySelector("img")) { im.innerHTML = '<img alt="">'; im.querySelector("img").src = p.thumbUrl; }
  else if (p.thumbUrl && im.querySelector("img").src !== p.thumbUrl) im.querySelector("img").src = p.thumbUrl;
  var ti = im.querySelector("img"); if (ti) ti.style.transform = (p.quick && p.quick !== 0.001 ? "rotate(" + p.quick + "deg)" : "") + (p.rot ? " rotate(" + p.rot + "deg)" : "");
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
  var n = L.ex.length, k = L.ex.filter(function (o) { return o.y; }).length, nc = CAL.ex.length;
  $("learn").innerHTML = "🧠 <b>Apprentissage</b> : " + n + " choix retenus (" + k + " gardées, " + (n - k) + " rejetées)." +
    (n >= 15 && k >= 3 && n - k >= 3 ? " Le score suit maintenant vos goûts." : " Le score s'adaptera à vos goûts après une quinzaine de choix P / X.") +
    (nc ? "<br>🎯 <b>Détection réglée sur votre œil</b> : " + nc + " correction" + (nc > 1 ? "s" : "") + " « Pas d'accord »" +
      (CALT.eyeD ? " · netteté des yeux " + (CALT.eyeD > 0 ? "plus" : "moins") + " stricte" : "") + (CALT.sceneD ? " · netteté générale " + (CALT.sceneD > 0 ? "plus" : "moins") + " stricte" : "") +
      (CALT.blink !== 0.5 ? " · yeux fermés " + (CALT.blink < 0.5 ? "plus" : "moins") + " vite détectés" : "") +
      ". <a href='#' id='calReset' style='color:var(--mut)'>Remettre à zéro</a>" : "");
  var cr = $("calReset"); if (cr) cr.onclick = function (e) { e.preventDefault(); if (confirm("Oublier toutes vos corrections « Pas d'accord » ?")) calReset(); };
}

/* ---------------- tri automatique ---------------- */
/* « Garder les N meilleures » : classement par score, une seule photo par serie (plus de variete), jamais une photo rejetee
   par vous ; dans la vue affichee ou dans chaque seance ; les autres peuvent etre mises de cote (« A voir ») ou rejetees */
function bestN() {
  rescore();
  dialog("<h3>Garder les meilleures</h3><div style='display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;margin:8px 0'>" +
    "<span>Nombre</span><input type='number' id='bnN' min='1' max='5000' value='" + (+localStorage.getItem("rp_bestn") || 50) + "' style='width:90px'>" +
    "<span>Parmi</span><select id='bnScope'><option value='view'>Les photos affichées (" + S.view.length + ")</option><option value='sess'>Chaque séance (N par séance)</option></select>" +
    "<span>Les autres</span><select id='bnRest'><option value='keep'>Ne pas y toucher</option><option value='todo'>Mettre « À voir »</option><option value='rej'>Rejeter</option></select></div>" +
    "<label class='ck'><input type='checkbox' id='bnDiv' checked> Une seule par série de photos semblables (plus de variété)</label>" +
    "<p class='small'>Vos choix faits à la main (Garder / Rejeter) ne sont jamais changés. Ctrl+Z pour annuler.</p><div class='row'><button data-c='no'>Annuler</button><button data-c='go2' class='pri'>Garder</button></div>", function (c) {
    if (c !== "go2") return;
    var N2 = Math.max(1, +$("bnN").value || 50), scope = $("bnScope").value, rest = $("bnRest").value, div = $("bnDiv").checked;
    try { localStorage.setItem("rp_bestn", N2); } catch (e) {}
    var pool = S.view.map(function (id) { return S.byId[id]; }).filter(function (p) { return p && p.a && !p.a.err; });
    var groups = scope === "sess" ? SESS.map(function (o) { return pool.filter(function (p) { return o.ids.indexOf(p.id) >= 0; }); }) : [pool];
    pushUndo(pool); var kept = 0;
    groups.forEach(function (gp) {
      var cand = gp.filter(function (p) { return !(p.status === "X" && !p.auto) && !(p.why && p.why.rej.length); }).sort(function (a, b) { return b.score - a.score; });
      var seen = {}, pick = [];
      cand.forEach(function (p) { if (pick.length >= N2) return; if (p.dup >= 0) { if (seen["d" + p.dup]) return; seen["d" + p.dup] = 1; } if (div && p.g >= 0) { if (seen[p.g]) return; seen[p.g] = 1; } pick.push(p); });
      var ids = {}; pick.forEach(function (p) { ids[p.id] = 1; if (!(p.status && !p.auto)) { p.status = "P"; p.auto = true; } kept++; });
      gp.forEach(function (p) { if (ids[p.id] || (p.status && !p.auto)) return; if (rest === "todo") { p.status = ""; p.auto = true; } else if (rest === "rej") { p.status = "X"; p.auto = true; } });
    });
    S.photos.forEach(updCard); drawFilters(); showPanel(); saveSoon();
    toast(kept + " meilleure" + (kept > 1 ? "s gardées" : " gardée") + (scope === "sess" ? " (" + N2 + " par séance)" : "") + ". Ctrl+Z pour annuler.", 4000);
  });
}
$("bBestN").onclick = bestN;
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
  $("pvCal").innerHTML = "";
  if (!a) { $("pvScore").innerHTML = "<small>Analyse en cours…</small>"; $("pvBars").innerHTML = ""; $("pvWhy").innerHTML = ""; $("pvExif").innerHTML = ""; return; }
  if (a.err) { $("pvScore").innerHTML = "<small>" + esc(a.err) + "</small>"; $("pvBars").innerHTML = ""; $("pvWhy").innerHTML = ""; return; }
  $("pvScore").innerHTML = '<b style="color:' + colOf(p.score) + '">' + p.score + "</b><small>/ 100 — " + (p.status === "P" ? "✔ gardée" : p.status === "X" ? "✖ rejetée" : "à voir") + (p.auto && p.status ? " (auto)" : "") + "</small>";
  var f = bigFaces(a), h = "";
  h += bar("Netteté", a.sharp, colOf(a.sharp));
  if (f.length) { var es = sharpEff(a); h += bar("Netteté des yeux / visage", es, colOf(es)); var ey = eyesScore(a); h += bar("Yeux ouverts", ey, colOf(ey), f.length + " visage" + (f.length > 1 ? "s" : "")); }
  h += bar("Flou de bougé", a.motion, a.motion >= 60 ? "var(--rej)" : a.motion >= 40 ? "var(--doubt)" : "var(--keep)", a.motion >= 40 ? a.motion : "non");
  var ae = aesScore(a); h += ae == null ? bar("Œil artistique", 0, "var(--bg3)", "en cours…") : bar("Œil artistique (lumière, couleurs, composition)", ae, colOf(ae), (a.aes).toFixed(1) + " / 10");
  if (a.noiseView != null) { var nb = Math.max(0, Math.min(100, Math.round(100 - a.noiseView * 8))); h += "<div class='expert'>" + bar("Bruit (grain)", nb, colOf(nb), a.noiseView < 2 ? "très faible" : a.noiseView < 5 ? "faible" : a.noiseView < 8.5 ? "visible" : "fort") + "</div>"; }
  var ex = expoScore(a); h += bar("Exposition", ex, colOf(ex), ex + (a.expo.hi > 2 ? " · blancs brûlés " + a.expo.hi + " %" : "") + (a.expo.lo > 5 ? " · noirs " + a.expo.lo + " %" : ""));
  $("pvBars").innerHTML = h;
  var w = p.why || reasons(p);
  var ab = adjBias(p);
  $("pvWhy").innerHTML = "<div style='color:var(--mut)'>📁 Catégorie : " + CATS[catOf(p)].nom + ($("sCat").value === "auto" ? " (devinée)" : "") + "</div>" +
    (p.adj ? "<div style='color:var(--gold)'>🎚 Votre retouche : " + (p.adj.ev > 0 ? "+" : "") + p.adj.ev.toFixed(1) + " EV, chaleur " + (p.adj.wb > 0 ? "+" : "") + p.adj.wb + "</div>" : ab ? "<div style='color:var(--gold)'>🧠 Retouche apprise (" + ab.n + " photos) : " + (ab.ev > 0 ? "+" : "") + ab.ev.toFixed(1).replace(".", ",") + " EV, chaleur " + (ab.wb > 0 ? "+" : "") + ab.wb + "</div>" : "") + w.rej.map(function (t) { return '<div style="color:var(--rej)">✖ ' + esc(t) + "</div>"; }).join("") + w.warn.map(function (t) { return '<div style="color:var(--doubt)">⚠ ' + esc(t) + "</div>"; }).join("") + w.good.map(function (t) { return '<div style="color:var(--keep)">✔ ' + esc(t) + "</div>"; }).join("");
  var fz = bigFaces(a).length, ov2 = p.ov || {};
  $("pvCal").innerHTML = "<div class='disagree'><span>Pas d'accord avec Regard Pur ? Corrigez-le, il apprend :</span>" +
    "<button data-cal='floue'" + (ov2.sharp === "floue" ? " class='on'" : "") + ">Elle est floue</button><button data-cal='nette'" + (ov2.sharp === "nette" ? " class='on'" : "") + ">Elle est nette</button>" +
    (fz ? "<button data-cal='fermes'" + (ov2.eyes === "fermes" ? " class='on'" : "") + ">Yeux fermés</button><button data-cal='ouverts'" + (ov2.eyes === "ouverts" ? " class='on'" : "") + ">Yeux ouverts</button>" : "") + "</div>";
  var cv = $("pvHist"), x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height);
  if (a.hist) { var mx = Math.max.apply(null, a.hist.slice(1, 63)) || 1; x.fillStyle = "#9aa3b2"; a.hist.forEach(function (v, i) { var hh = Math.min(1, v / mx) * (cv.height - 4); x.fillRect(i * cv.width / 64, cv.height - hh, cv.width / 64 + 0.5, hh); }); }
  $("pvExif").innerHTML = (exifTxt(a) || "⚠ Aucune information de prise de vue (EXIF)") + (a.w ? "<br>🖼️ " + a.w + " × " + a.h + " px · " + String(a.mp || "").replace(".", ",") + " Mpx" + (a.jq ? " · JPEG qualité " + a.jq : "") + (p.raw ? " (aperçu du RAW)" : "") : "");
  if (p.place) $("pvExif").innerHTML += "<br>📍 " + esc(p.place.replace(/-/g, " · "));
  $("pvExif").innerHTML += printCheck(p);
}
$("pvCal").addEventListener("click", function (e) { var b = e.target.closest("button[data-cal]"); if (!b) return; var p = S.byId[S.view[S.cur]]; if (p) calAdd(p, b.dataset.cal); });
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
  devShow(p);
}
function adjSet() {
  var p = S.byId[S.view[S.cur]]; if (!p) return; retouching();
  var old = p.adj ? {ev: p.adj.ev, wb: p.adj.wb} : null, ev = Math.round(+$("lpEv").value) / 10, wb = +$("lpWb").value;
  p.adj = (ev || wb) ? {ev: ev, wb: wb} : null;
  clearTimeout(adjSet.t); adjShow(p);
  adjSet.t = setTimeout(function () { adjLearn(p, old && (old.ev || old.wb) ? old : null); }, 600); saveSoon();
  rpPreview(true);
}
$("lpEv").addEventListener("input", adjSet); $("lpWb").addEventListener("input", adjSet);
function resetAll() {
  var L = fixTargets(); if (!L.length) return;
  L.forEach(function (p) { p.dev = null; p.adj = null; p.ret = null; if (p.ai) { p.ai = null; } full.cache.delete(p.id); updCard(p); });
  var p = S.byId[S.view[S.cur]]; $("lpEv").value = 0; $("lpWb").value = 0; rp.cur = null; rp.live = false; if (rp.open) rpDraw(); if (p) { devShow(p); aiShow(p); rpPreview(); }
  saveSoon(); toast("↺ " + (L.length > 1 ? L.length + " photos remises" : "Photo remise") + " à l'origine : réglages, portrait et IA enlevés (le correcteur au pinceau est gardé).", 4000);
}
$("lpAdj0").onclick = resetAll;
$("dvZero").onclick = resetAll;

/* ---------------- REGLAGES COMPLETS (meme moteur que JM LAB PRO) ---------------- */
// par defaut : rendu neutre (seuls les curseurs que vous touchez changent l'image) ; le bouton Auto, lui, applique le rendu complet
var DEV_DEF = function () { return {profile: "LABO PRO EV5", pro: false, dose: 100, v: {}, curve: null, neutral: true}; };
function devGet(p) { if (!p.dev) p.dev = DEV_DEF(); return p.dev; }
function devShow(p) {
  var sel = $("dvProf"); if (!sel.options.length) sel.innerHTML = "<option value='cat'>Selon le type de photo (conseillé)</option>" + PROFS.map(function (o) { return "<option value='" + o[0] + "'>" + o[1] + "</option>"; }).join("");
  var d = p.dev || DEV_DEF();
  $("dvProf").value = d.profile || "cat"; $("dvDose").value = d.dose; $("dvDoseV").textContent = d.dose; $("dvPro").checked = d.pro !== false;
  Array.prototype.forEach.call(document.querySelectorAll("#rtTop input[data-dv]"), function (r) { var v = +(d.v[r.dataset.dv] || 0); r.value = v; r.nextElementSibling.textContent = v > 0 ? "+" + v : v; });
  curveDraw(CRV.ch === "m" ? d.curve : (d.curves || {})[CRV.ch]);
  var db = d.deblur || {}; $("dbAmt").value = db.amt || 0; $("dbAmt").nextElementSibling.textContent = db.amt || 0; $("dbKind").value = db.kind || "auto"; if (!(db.amt > 0)) $("dbInfo").textContent = "";
  Array.prototype.forEach.call(document.querySelectorAll("#rtTop input[data-lv]"), function (r) { var v = +((d.levels || {})[r.dataset.lv] || 0); r.value = v; r.nextElementSibling.textContent = v > 0 && r.dataset.lv === "g" ? "+" + v : v; });
  aiShow(p); typeShow(p); profThumbs(p);
  Array.prototype.forEach.call(document.querySelectorAll("#rtTop input[data-sky]"), function (rg) { var v = +((d.sky || {})[rg.dataset.sky] || 0); rg.value = v; rg.nextElementSibling.textContent = v; });
  $("crRatio").value = d.crop && d.crop.r ? d.crop.r : "orig"; $("crOff").disabled = !d.crop;
  $("dvFixed").textContent = d.fix && d.fix.length ? "🩺 Corrigé : " + d.fix.join(", ") : "";
  var lk = d.looks || {};
  Array.prototype.forEach.call(document.querySelectorAll("#rtTop [data-lk]"), function (r) { var k = r.dataset.lk.split("."), v = +((lk[k[0]] || {})[k[1]] || 0); r.value = v; if (r.tagName === "INPUT") r.nextElementSibling.textContent = v > 0 ? "+" + v : v; });
}
/* reglages d'une photo pour le moteur : profil, ProLab, curseurs, courbe, correction du type de photo, retouche rapide */
function devStyle(p) {
  if (!p.dev && !p.adj && !p.ret && !p.heals) return p.rot ? {rotOnly: true, rot: p.rot, q: 95} : null;
  // sans reglage enregistre (retouche rapide seule) : rendu neutre, pas de profil ni ProLab
  var d = p.dev || {profile: "LABO PRO EV5", pro: false, dose: 100, v: {}, curve: null, neutral: true}, cat = CATS[catOf(p)], o = {profile: d.profile === "cat" ? cat.prof : d.profile, off: d.pro === false, dose: d.dose, hp: d.neutral ? 0 : REND.hp == null ? 30 : REND.hp, v: JSON.parse(JSON.stringify(d.v)), curve: d.curve, curves: d.curves || null, levels: d.levels || null, sky: d.sky || null, crop: d.crop || null, deblur: d.deblur && d.deblur.amt > 0 ? Object.assign({mo: p.a && p.a.motion != null ? p.a.motion : null}, d.deblur) : null, looks: d.looks || null, q: 92, jm: !!(p.dev || p.adj)};
  if (d.ia) { o.auto = {cibles: cat.cibles, ev: cat.ev, wb: cat.wb, tint: cat.tint}; o.skin = cat.peau; }
  var ad = p.adj || (d.ia ? adjBias(p) : null);
  if (ad) { o.v.Exposition = (+o.v.Exposition || 0) + ad.ev / (0.5 * 0.85 * (o.dose || 65) / 100); o.v.Temperature = Math.max(-100, Math.min(100, (+o.v.Temperature || 0) + ad.wb)); }
  if (d.tilt && p.a && p.a.tilt) o.tilt = p.a.tilt;
  if (p.ret) o.ret = rpEff(p.ret); if (p.heals) o.heals = p.heals;
  if (p.rot) o.rot = p.rot;
  return o;
}
/* outils adaptes au type de photo : un clic applique la recette (reglages de depart, a affiner) ou lance l'outil */
var TYPE_CUR = [];
var TYPE_TOOLS = {
  portrait: [["Peau naturelle", "rp:naturel"], ["Éclat du visage", {lk: {glow: {g: 22, sat: 5, w: 0}}}], ["Regard (yeux, iris)", "rp:eclat"], ["Visages (IA)", "ai:face"]],
  mariage: [["Retouche mariage", "rp:mariage"], ["Lumière douce", {v: {Contraste: -12, Ombres: 15}, lk: {glow: {g: 30, sat: 0, w: 10}}}], ["Blancs propres", {v: {Blanc: 15}, lk: {wb: {t: -8, ti: 0}}}], ["Visages (IA)", "ai:face"]],
  famille: [["Visages éclaircis", {v: {Ombres: 30}}], ["Peau naturelle", "rp:naturel"], ["Netteté de groupe", {lk: {details: {s: 10, n: 30}}}]],
  "contre-jour": [["Déboucher le sujet", {v: {Ombres: 55, "Hautes SANS GRIS": -40}}], ["HDR personnes", {lk: {hdr: {st: 1, f: 35, b: 0, sat: 0}}}], ["Ciel récupéré", {lk: {tone: {hi: -35, mid: 0, lo: 10}}}]],
  plage: [["Ciel plus profond", {sky: {dark: 25, blue: 30, clar: 15}}], ["Mer et ciel", {v: {Vibrance: 20, Dehaze: 10}, lk: {tone: {hi: -20, mid: 0, lo: 0}}}], ["Horizon droit", "tilt"], ["Peau protégée", {v: {Vibrance: 8}}]],
  paysage: [["Ciel plus profond", {sky: {dark: 30, blue: 25, clar: 20}}], ["Recadrage auto", "crop"], ["Détails", {lk: {details: {s: 30, n: 25}}}], ["Ciel et relief", {v: {Dehaze: 15}, lk: {tone: {hi: -25, mid: 5, lo: 20}}}], ["HDR nature", {lk: {hdr: {st: 0, f: 40, b: 0, sat: 10}}}], ["Horizon droit", "tilt"]],
  nuit: [["Débruiter (IA)", "ai:scu"], ["Ombres", {v: {Ombres: 30, Noir: -10}}], ["Lumières maîtrisées", {v: {"Hautes SANS GRIS": -35}}], ["Lissage du grain", {lk: {details: {s: -30, n: 0}}}]]
};
function typeShow(p) {
  if (!p || !p.a) { $("typeBox").style.display = "none"; return; }
  var c = catOf(p), T = (MYSTYLE ? [["Mon style", {v: MYSTYLE.v, curve: MYSTYLE.curve, my: 1, evIL: !!MYSTYLE.evIL}]] : []).concat(TYPE_TOOLS[c] || []); TYPE_CUR = T; $("typeBox").style.display = T.length ? "" : "none";
  $("typeTitle").textContent = "Pour ce type de photo : " + (CATS[c] ? CATS[c].nom : c);
  var used = (p.dev && p.dev.tt) || [];
  $("typeTools").innerHTML = T.filter(function (t) { return !/^ai:/.test(t[1]) || AI.has[t[1] === "ai:face" ? "gfp" : t[1].slice(3)]; }).map(function (t) { return "<button data-tt='" + T.indexOf(t) + "'" + (used.indexOf(t[0]) >= 0 ? " class='done'" : "") + ">" + t[0] + "</button>"; }).join("");
}
$("typeTools").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-tt]"), p = S.byId[S.view[S.cur]]; if (!b || !p) return;
  var t = TYPE_CUR[+b.dataset.tt], a = t[1];
  if (typeof a === "string" && a.indexOf("ai:") === 0) { aiRun(a.slice(3)); return; }
  if (typeof a === "string" && a.indexOf("rp:") === 0) { var k = a.slice(3); p.ret = {preset: k, str: 100, v: JSON.parse(JSON.stringify(RP_PRESETS[k].v))}; rp.cur = p.ret; }
  else if (a === "crop") { var cc = autoCrop(p, "orig"); if (!cc) { toast("Le cadrage est déjà bon."); return; } devGet(p).crop = cc; }
  else if (a === "tilt") { if (!p.a.tilt) { toast("L'horizon de cette photo est déjà droit."); return; } devGet(p).tilt = true; }
  else { var d = devGet(p); if (a.sky) d.sky = JSON.parse(JSON.stringify(a.sky)); if (a.curve) d.curve = JSON.parse(JSON.stringify(a.curve)); if (a.my && a.evIL && a.v && a.v.Exposition != null) { a = JSON.parse(JSON.stringify(a)); a.v.Exposition = Math.round(a.v.Exposition / (0.5 * 0.85 * (d.dose || 65) / 100) * 10) / 10; } if (a.v) Object.keys(a.v).forEach(function (k) { d.v[k] = a.v[k]; }); if (a.lk) { d.looks = d.looks || {}; Object.keys(a.lk).forEach(function (k) { d.looks[k] = JSON.parse(JSON.stringify(a.lk[k])); }); } }
  var d2 = devGet(p); d2.tt = (d2.tt || []).filter(function (x) { return x !== t[0]; }).concat([t[0]]);
  devShow(p); devChanged(p); toast("« " + t[0] + " » appliqué — affinez avec les curseurs si besoin.");
});
/* recadrage automatique : sujet sur les tiers, aucun visage coupe, au plus 20 % enleve */
function autoCrop(p, ratio) {
  var a = p.a; if (!a || !a.w) return null;
  var W = a.w, H = a.h, R0 = W / H, R1 = ratio === "orig" ? R0 : +ratio, f = bigFaces(a), sx, sy;
  if (f.length) { var big = f.slice().sort(function (u, v) { return v.w * v.h - u.w * u.h; })[0]; sx = big.x + big.w / 2; sy = big.y + big.h * 0.4; }
  else if (a.zone) { sx = a.zone.x + a.zone.w / 2; sy = a.zone.y + a.zone.h / 2; } else { sx = 0.5; sy = 0.5; }
  var best = null;
  [1, 0.95, 0.9, 0.85, 0.8].forEach(function (s) {
    var cw, ch; if (R1 >= R0) { cw = s; ch = s * R0 / R1; } else { ch = s; cw = s * R1 / R0; }
    if (cw > 1 || ch > 1) return;
    [1 / 3, 0.5, 2 / 3].forEach(function (tx) { [1 / 3, 0.5, 2 / 3].forEach(function (ty) {
      var x = Math.max(0, Math.min(1 - cw, sx - tx * cw)), y = Math.max(0, Math.min(1 - ch, sy - ty * ch));
      var px = (sx - x) / cw, py = (sy - y) / ch, cut = f.some(function (q) { return q.x < x - 0.005 || q.y < y - 0.005 || q.x + q.w > x + cw + 0.005 || q.y + q.h > y + ch + 0.005; });
      var dth = Math.min(Math.abs(px - 1 / 3), Math.abs(px - 2 / 3)) + Math.min(Math.abs(py - 1 / 3), Math.abs(py - 2 / 3)) * (f.length ? 1.2 : 1);
      var cost = dth + (1 - s) * 0.9 + (cut ? 5 : 0) + (tx === 0.5 ? 0.04 : 0);
      if (!best || cost < best.cost) best = {cost: cost, x: x, y: y, w: cw, h: ch};
    }); });
  });
  if (!best) return null;
  if (ratio === "orig" && best.w > 0.995 && best.h > 0.995) return null;
  return {x: Math.round(best.x * 1e4) / 1e4, y: Math.round(best.y * 1e4) / 1e4, w: Math.round(best.w * 1e4) / 1e4, h: Math.round(best.h * 1e4) / 1e4, r: ratio};
}
$("crAuto").onclick = function () { fixTargets().forEach(function (p) { var c = autoCrop(p, $("crRatio").value); if (c) devGet(p).crop = c; }); var p = S.byId[S.view[S.cur]]; if (p) { devShow(p); devChanged(p); } toast("Recadrage auto appliqué (bouton « Sans » pour revenir)."); };
$("crRatio").addEventListener("change", function () { $("crAuto").click(); });
$("crOff").onclick = function () { fixTargets().forEach(function (p) { if (p.dev) delete p.dev.crop; }); var p = S.byId[S.view[S.cur]]; if (p) { devShow(p); devChanged(p); } };
function devChanged(p) { retouching(); saveSoon(); rpPreview(true); updCard(p); clearTimeout(PFV.t); if ($("profBox").open) PFV.t = setTimeout(function () { if (S.byId[S.view[S.cur]] === p) profThumbs(p); }, 1500); }
$("rtTop").addEventListener("input", function (e) {
  var t = e.target, p = S.byId[S.view[S.cur]]; if (!p) return;
  if (t.id === "dbAmt" || t.id === "dbKind") { var dd = devGet(p); dd.deblur = dd.deblur || {}; if (t.id === "dbAmt") { dd.deblur.amt = +t.value; t.nextElementSibling.textContent = t.value; } else dd.deblur.kind = t.value; devChanged(p); return; }
  if (t.dataset.sky) { var dsk = devGet(p); dsk.sky = dsk.sky || {}; dsk.sky[t.dataset.sky] = +t.value; t.nextElementSibling.textContent = t.value; devChanged(p); return; }
  if (t.dataset.lv) { var dl = devGet(p); dl.levels = dl.levels || {}; dl.levels[t.dataset.lv] = +t.value; t.nextElementSibling.textContent = t.value; devChanged(p); return; }
  if (t.dataset.lk) { var k = t.dataset.lk.split("."), d = devGet(p); d.looks = d.looks || {}; d.looks[k[0]] = d.looks[k[0]] || {}; d.looks[k[0]][k[1]] = +t.value; if (t.tagName === "INPUT") t.nextElementSibling.textContent = +t.value > 0 ? "+" + t.value : t.value; devChanged(p); return; }
  if (t.dataset.dv) { devGet(p).v[t.dataset.dv] = +t.value; t.nextElementSibling.textContent = +t.value > 0 ? "+" + t.value : t.value; devChanged(p); }
  else if (t.id === "dvDose") { devGet(p).dose = +t.value; $("dvDoseV").textContent = t.value; devChanged(p); }
});
$("rtTop").addEventListener("change", function (e) {
  var t = e.target, p = S.byId[S.view[S.cur]]; if (!p) return;
  if (t.dataset.lk && t.tagName === "SELECT") { var k = t.dataset.lk.split("."), d = devGet(p); d.looks = d.looks || {}; d.looks[k[0]] = d.looks[k[0]] || {}; d.looks[k[0]][k[1]] = +t.value; devChanged(p); return; }
  if (t.id === "dvProf") { profSet(p, t.value); }
  else if (t.id === "dvPro") { var dq = devGet(p); dq.pro = t.checked; if (t.checked) delete dq.neutral; else if (dq.profile === "LABO PRO EV5") dq.neutral = true; devChanged(p); profThumbs(p); }
});
/* profils : chaque profil est montre sur la photo elle-meme (vignettes) ; un clic l'applique et l'image change aussitot */
function profSet(p, v) {
  var dp = devGet(p); dp.profile = v;
  if (v === "LABO PRO EV5" && dp.pro === false) dp.neutral = true; else delete dp.neutral;
  $("dvProf").value = v; profMark(p); devChanged(p);
}
function profMark(p) { var d = p.dev || DEV_DEF(); Array.prototype.forEach.call(document.querySelectorAll("#profGrid [data-pf]"), function (b) { b.classList.toggle("on", b.dataset.pf === (d.profile || "cat")); }); }
var PFV = {id: null, n: 0, urls: []};
function profThumbs(p) {
  var g = $("profGrid"); if (!g || !$("profBox").open || !p) return;
  var cat = CATS[catOf(p)], list = [["cat", "Selon le type (" + (PROFS.filter(function (o) { return o[0] === cat.prof; })[0] || ["", cat.prof])[1] + ")"]].concat(PROFS);
  var base = devStyle(p) || {}; base = JSON.parse(JSON.stringify(base)); ["ret", "heals", "tilt", "crop", "deblur", "rotOnly"].forEach(function (k) { delete base[k]; });
  var styles = list.map(function (o) { var st = JSON.parse(JSON.stringify(base)); if (!st.v) { st.v = {}; st.dose = 100; st.off = true; st.q = 92; } st.profile = o[0] === "cat" ? cat.prof : o[0]; st.jm = true; st.hp = o[0] === "LABO PRO EV5" && st.off ? 0 : (REND.hp == null ? 30 : REND.hp); return st; });
  var key = p.id + "|" + JSON.stringify(base); if (PFV.id === key) { profMark(p); return; }
  PFV.id = key; var my = ++PFV.n;
  g.innerHTML = list.map(function (o) { return "<button data-pf='" + o[0] + "' title='" + o[1].replace(/'/g, "&#39;") + "'><span class='pfi'></span><i>" + o[1] + "</i></button>"; }).join("");
  profMark(p); $("profMsg").textContent = "⏳ Calcul des aperçus…";
  readBytes(p).then(function (b) {
    if (!b || my !== PFV.n) return;
    if (!PFV.w) { PFV.w = new Worker("analyse.js"); PFV.w.inflight = 0; PFV.w.jobs = {}; PFV.w.onmessage = onResult.bind(null, PFV.w); }
    var w = PFV.w, id = "profs:" + p.id + ":" + my, c = b.buffer.byteLength === b.byteLength ? b : b.slice();
    prevWait[id] = function (r) {
      if (my !== PFV.n) return; $("profMsg").textContent = r.profs && r.profs.length ? "" : "Aperçus impossibles : " + (r.err || "");
      PFV.urls.forEach(function (u) { URL.revokeObjectURL(u); }); PFV.urls = (r.profs || []).map(function (bl) { return URL.createObjectURL(bl); });
      Array.prototype.forEach.call(g.querySelectorAll(".pfi"), function (sp, i) { if (PFV.urls[i]) sp.style.backgroundImage = "url(" + PFV.urls[i] + ")"; });
    };
    w.postMessage({id: id, profs: styles, buf: c, heic: heicOf(p), max: 240}, [c.buffer]);
  });
}
$("profBox").addEventListener("toggle", function () { var p = S.byId[S.view[S.cur]]; if ($("profBox").open) { PFV.id = null; profThumbs(p); } });
$("profGrid").addEventListener("click", function (e) { var b = e.target.closest("[data-pf]"), p = S.byId[S.view[S.cur]]; if (!b || !p) return; profSet(p, b.dataset.pf); });
/* ✨ Auto : ProLab automatique + correction selon le type de photo + peau protegee + vos habitudes apprises */
$("dvAuto").onclick = function () {
  var p = S.byId[S.view[S.cur]]; if (!p) return;
  p.dev = {profile: "cat", pro: true, dose: 65, v: {}, curve: null, ia: true}; p.adj = null;
  devShow(p); adjShow(p); devChanged(p);
  var ab = adjBias(p); toast("Réglage automatique : " + CATS[catOf(p)].nom + (ab ? ", avec vos habitudes (" + ab.n + " photos)" : "") + ".");
};
var DEVCLIP = null;
$("dvCopy").onclick = function () { var p = S.byId[S.view[S.cur]]; if (!p) return; DEVCLIP = {dev: p.dev ? JSON.parse(JSON.stringify(p.dev)) : null, adj: p.adj ? JSON.parse(JSON.stringify(p.adj)) : null}; toast("Réglages copiés."); };
function devPasteTo(list) { if (!DEVCLIP) { toast("Copiez d'abord les réglages d'une photo."); return; } list.forEach(function (q) { q.dev = DEVCLIP.dev ? JSON.parse(JSON.stringify(DEVCLIP.dev)) : null; q.adj = DEVCLIP.adj ? JSON.parse(JSON.stringify(DEVCLIP.adj)) : null; updCard(q); }); saveSoon(); }
$("dvPaste").onclick = function () { var p = S.byId[S.view[S.cur]]; if (!p) return; devPasteTo([p]); devShow(p); adjShow(p); rpPreview(); toast("Réglages collés."); };
$("rtTop").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-sync]"); if (!b) return;
  var p = S.byId[S.view[S.cur]]; if (!p) return; var a = b.dataset.sync, list = [];
  if (a === "sel") list = Array.from(S.sel).map(function (id) { return S.byId[id]; });
  if (a === "serie" && p.g >= 0) list = S.groups[p.g].map(function (id) { return S.byId[id]; });
  if (a === "person") { var f = bigFaces(p.a)[0], o = f && PERS[f.pid]; if (o) list = S.photos.filter(function (q) { return o.ids[q.id]; }); }
  if (a === "keep") list = S.photos.filter(function (q) { return q.status === "P"; });
  list = list.filter(function (q) { return q !== p; });
  if (!list.length) { toast(a === "sel" ? "Sélectionnez d'abord des photos dans la grille (Ctrl + clic)." : a === "serie" ? "Cette photo ne fait pas partie d'une série." : a === "person" ? "Aucune personne reconnue sur cette photo." : "Aucune photo gardée."); return; }
  DEVCLIP = {dev: p.dev ? JSON.parse(JSON.stringify(p.dev)) : null, adj: p.adj ? JSON.parse(JSON.stringify(p.adj)) : null};
  devPasteTo(list); toast("Réglages appliqués à " + list.length + " autre" + (list.length > 1 ? "s" : "") + " photo" + (list.length > 1 ? "s" : "") + ".");
});
$("lkPip").onclick = function () { var on = !$("lkPip").classList.contains("on"); $("lkPip").classList.toggle("on", on); $("lpView").classList.toggle("pip", on); if (on) toast("Cliquez sur une zone qui devrait être blanche ou grise."); };
$("lpView").addEventListener("mousedown", function (e) {
  if (!$("lkPip").classList.contains("on") || e.button !== 0) return; e.stopImmediatePropagation(); e.preventDefault();
  var p = S.byId[S.view[S.cur]], img = $("lpImg"), r = $("lpView").getBoundingClientRect(); if (!p || !img.naturalWidth) return;
  var fx = (e.clientX - r.left - full.tx) / (img.naturalWidth * full.sc), fy = (e.clientY - r.top - full.ty) / (img.naturalHeight * full.sc);
  fullUrl(p).then(function (u) { var im = new Image(); im.onload = function () {
    var c = document.createElement("canvas"), sz = 9; c.width = c.height = sz; var x = c.getContext("2d"), cx = fx * im.naturalWidth, cy = fy * im.naturalHeight; x.drawImage(im, cx - 4, cy - 4, sz, sz, 0, 0, sz, sz);
    var dd = x.getImageData(0, 0, sz, sz).data, R = 0, G = 0, B = 0; for (var i = 0; i < dd.length; i += 4) { R += dd[i]; G += dd[i + 1]; B += dd[i + 2]; }
    // meme calcul que la pipette de JM LAB PRO
    var KT = 0.5, KM = 0.4; R = Math.max(1, R); G = Math.max(1, G); B = Math.max(1, B);
    var t = Math.max(-100, Math.min(100, Math.round(100 * Math.log2(B / R) / (2 * KT)))), ti = Math.max(-100, Math.min(100, Math.round(100 * Math.log2(G / Math.sqrt(R * B)) / (1.5 * KM))));
    var d = devGet(p); d.looks = d.looks || {}; d.looks.wb = {t: t, ti: ti}; devShow(p); devChanged(p);
    $("lkPip").classList.remove("on"); $("lpView").classList.remove("pip"); toast("Balance des blancs réglée : température " + t + ", teinte " + ti + ".");
  }; im.src = u; });
}, true);
/* ---------------- REGLER EN GLISSANT SUR LA PHOTO (comme Snapseed / Retouches de JM LAB PRO) ----------------
   glisser de haut en bas : choisir le reglage ; de gauche a droite : le doser */
var TUNE = [["Luminosité", "#lpEv"], ["Contraste", "[data-dv=Contraste]"], ["Ambiance", "[data-dv=Clarte]"], ["Saturation", "[data-dv=Vibrance]"], ["Hautes lumières", "[data-dv='Hautes SANS GRIS']"],
  ["Ombres", "[data-dv=Ombres]"], ["Chaleur", "#lpWb"], ["Teinte", "[data-dv=Teinte]"], ["Blancs", "[data-dv=Blanc]"], ["Noirs", "[data-dv=Noir]"], ["Voile", "[data-dv=Dehaze]"],
  ["Vignette", "[data-dv=Vignette]"], ["Structure", "[data-lk='details.s']"], ["Netteté", "[data-lk='details.n']"], ["Déflouter", "#dbAmt"]];
var tune = {i: 0, st: null};
function tuneEl(i) { return document.querySelector("#rtTop " + TUNE[i][1]); }
function tuneTxt(i) { var r = tuneEl(i), v = +r.value; if (TUNE[i][1] === "#lpEv") return (v > 0 ? "+" : "") + (v / 10).toFixed(1).replace(".", ","); return (v > 0 ? "+" : "") + v; }
function tuneHud(mode) {
  var h = $("tuneHud"); h.className = mode ? "show " + mode : "";
  if (mode === "list") $("tuneList").innerHTML = TUNE.map(function (t, i) { return "<div" + (i === tune.i ? " class='on'" : "") + "><span>" + t[0] + "</span><span>" + tuneTxt(i) + "</span></div>"; }).join("");
  if (mode === "adj") $("tuneVal").textContent = TUNE[tune.i][0] + "  " + tuneTxt(tune.i);
}
try { $("tuneOn").checked = localStorage.getItem("rp_tune") === "1"; } catch (e) { $("tuneOn").checked = false; }
$("tuneOn").addEventListener("change", function () { try { localStorage.setItem("rp_tune", this.checked ? "1" : "0"); } catch (e) {} });
$("lpView").addEventListener("mousedown", function (e) {
  if (!$("loupe").classList.contains("rmode") || !$("tuneOn").checked || heal.on || $("lkPip").classList.contains("on") || e.button !== 0 || full.zoom) return;
  e.stopImmediatePropagation(); e.preventDefault();
  var r = tuneEl(tune.i); tune.st = {x: e.clientX, y: e.clientY, mode: "", i0: tune.i, v0: +r.value};
}, true);
window.addEventListener("mousemove", function (e) {
  if (!tune.st) return; var dx = e.clientX - tune.st.x, dy = e.clientY - tune.st.y;
  if (!tune.st.mode) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) tune.st.mode = "list"; else if (Math.abs(dx) > 6) { tune.st.mode = "adj"; tune.st.v0 = +tuneEl(tune.i).value; } else return; }
  if (tune.st.mode === "list") { tune.i = Math.max(0, Math.min(TUNE.length - 1, tune.st.i0 + Math.round(dy / 28))); tuneHud("list"); }
  else { var r = tuneEl(tune.i), mn = +r.min, mx = +r.max, nv = Math.max(mn, Math.min(mx, Math.round(tune.st.v0 + dx / 600 * (mx - mn)))); if (+r.value !== nv) { r.value = nv; r.dispatchEvent(new Event("input", {bubbles: true})); } tuneHud("adj"); }
});
window.addEventListener("mouseup", function () { if (!tune.st) return; tune.st = null; setTimeout(function () { tuneHud(""); }, 700); });

/* ---------------- 🩺 CORRIGER LES PROBLEMES : chaque photo recoit les outils dont elle a besoin ---------------- */
function fixPhoto(p) {
  var a = p.a; if (!a || a.err) return null;
  // sans reglage existant : rendu NEUTRE (aucun profil, pas de ProLab) ; seules les corrections utiles changent l'image
  var d = p.dev ? JSON.parse(JSON.stringify(p.dev)) : {profile: "LABO PRO EV5", pro: false, dose: 100, v: {}, curve: null, neutral: true}, L = d.looks = d.looks || {}, done = [];
  // exposition (douce) : surtout l'image entiere ; les visages comptent un peu, sauf avec lunettes / verres teintes (trop sombres)
  var e = a.expo || {}, f = bigFaces(a).filter(function (x) { return x.lum != null && !x.tinted && !(x.glasses != null && x.glasses >= 0.25); });
  var fl = f.length ? avg(f.map(function (x) { return x.lum; })) : null, lum = e.mean == null ? fl : fl == null ? e.mean : e.mean * 0.65 + fl * 0.35;
  if (lum != null && (lum < 75 || lum > 180 || e.hi > 8 || e.lo > 25)) {
    var ev = Math.max(-0.8, Math.min(1, Math.log2(115 / Math.max(10, lum)) * 0.5)); ev = Math.round(ev * 10) / 10;
    if (e.hi > 8 && ev > 0) ev = Math.min(ev, 0.3); // deja des blancs brules : on n'eclaircit presque pas
    if (Math.abs(ev) >= 0.2) { d.v.Exposition = Math.round(ev / (0.5 * 0.85 * d.dose / 100) * 10) / 10; /* 1 cran = 0,5 IL x intensite x 0,85 dans le moteur */ done.push("exposition " + (ev > 0 ? "+" : "") + String(ev).replace(".", ",")); }
    if (e.hi > 8) { d.v["Hautes SANS GRIS"] = -Math.min(60, Math.round(15 + e.hi * 2)); done.push("hautes lumières récupérées"); }
    if (e.lo > 25 || lum < 75) { d.v.Ombres = Math.min(40, Math.round(10 + (e.lo || 0) * 0.8)); done.push("ombres débouchées"); }
    d.pro = false; // l'exposition est reglee ici : pas de deuxieme correction automatique
  }
  // leger flou : nettete et structure (un flou fort ne se rattrape pas)
  var er = eyeRaw(a), sh = er != null ? er : a.sharp;
  if (sh < 55) { var k = sh < 15 ? 1 : (55 - sh) / 40; d.deblur = {amt: Math.round(60 + 30 * k), kind: a.motion > 50 ? "bouge" : "auto"};
    L.details = {s: Math.round(20 + 15 * k), n: Math.round(45 + 35 * k)}; done.push((a.motion > 50 ? "bougé" : "flou") + " corrigé" + (sh < 15 ? " (flou fort : amélioration limitée)" : "")); }
  // bruit : lissage leger
  if (a.noiseView != null && a.noiseView > 5) { L.details = L.details || {s: 0, n: 0}; L.details.s = Math.min(L.details.s, -Math.round(Math.min(60, (a.noiseView - 4) * 8))); done.push("grain lissé"); }
  // dominante de couleur chaude ou froide (orange / bleu) seulement : une photo verte (vegetation) n'est pas une dominante
  var col = a.col || [];
  if (col.length) { var R = 0, B = 0; for (var i = 0; i < col.length; i += 3) { R += col[i]; B += col[i + 2]; }
    var rb = Math.log2(Math.max(1, B) / Math.max(1, R));
    // le bleu d'un ciel ou de la mer n'est pas une dominante : pas de compensation sur paysage / plage / nuit, ni si le haut (ciel) est le plus bleu
    var cg = catOf(p), topB = 0, topR = 0, botB = 0, botR = 0;
    for (i = 0; i < col.length; i += 3) { if (i < 12) { topR += col[i]; topB += col[i + 2]; } else { botR += col[i]; botB += col[i + 2]; } }
    var skyBlue = Math.log2(Math.max(1, topB) / Math.max(1, topR)) > Math.log2(Math.max(1, botB) / Math.max(1, botR)) + 0.15;
    var blueOk = rb > 0 && (cg === "paysage" || cg === "plage" || cg === "nuit" || skyBlue);
    if (Math.abs(rb) > 0.32 && Math.abs(rb) < 1.2 && !blueOk) { var t = Math.max(-45, Math.min(45, Math.round(100 * rb * 0.45))); L.wb = {t: t, ti: 0}; done.push(rb < 0 ? "dominante orangée corrigée" : "dominante bleutée corrigée"); } }
  // horizon
  if (a.tilt) { d.tilt = true; done.push("horizon redressé (" + Math.abs(a.tilt).toFixed(1).replace(".", ",") + "°)"); }
  d.fix = done;
  return done.length ? d : null;
}
/* « Corriger les problemes » plus efficace : le bon outil pour chaque defaut, dans le bon ordre (bruit, flou, pixels / compression,
   visages), chaque correction IA mesuree avant / apres et annulee si elle n'ameliore pas ; les corrections que vous annulez
   souvent ne sont plus proposees d'office (apprentissage) */
var AIPREF = {}; try { AIPREF = JSON.parse(localStorage.getItem("rp_aipref") || "{}"); } catch (e) {}
function aiPrefAdd(k, f) { var o = AIPREF[k] = AIPREF[k] || {auto: 0, undo: 0}; o[f]++; try { localStorage.setItem("rp_aipref", JSON.stringify(AIPREF)); } catch (e) {} }
function aiRefused(k) { var o = AIPREF[k]; return !!o && o.undo >= 2 && o.undo > o.auto * 0.5; }
function aiNeeds(p) {
  var a = p.a; if (!a || a.err) return [];
  var out = [], er = eyeRaw(a), sh = er != null ? er : a.sharp, f = bigFaces(a);
  if (AI.has.scu && a.noiseView != null && a.noiseView > 5 && (a.mp || 0) >= 0.8) out.push("scu");
  if (AI.has.naf && sh != null && (sh < 35 || a.motion > 55)) out.push("naf");
  if (AI.has.esr && (a.pix || (a.up != null && a.up > 0.07) || (a.jq != null && a.jq < 45))) out.push("esr");
  if (AI.has.gfp && $("fixFace").checked && f.length && er != null && er < 30) out.push("face");
  return out;
}
function measure(p) {
  return readBytes(p).then(function (b) { if (!b) return null; ensurePool(); var w = pool[0], key = "ms:" + p.id + Date.now(), c = b.slice();
    return new Promise(function (res) { prevWait[key] = function (r) { res(r.meas); }; w.postMessage({id: key, buf: c.buffer, heic: heicOf(p), measure: true}, [c.buffer]); }); });
}
function qualOf(a, k) { // ce qu'on attend de chaque correction
  if (!a || a.err) return null; var er = eyeRaw(a), sh = er != null ? er : a.sharp;
  if (k === "scu") return {v: -(a.noiseView || 0), txt: "bruit " + String(Math.round((a.noiseView || 0) * 10) / 10).replace(".", ","), sh: sh};
  return {v: sh || 0, txt: "netteté " + Math.round(sh || 0), sh: sh};
}
async function fixRun(list) {
  var n = 0, none = 0, ai = AI.ok && N && $("fixAi").checked, gains = [], skipped = {};
  list.forEach(function (p) { var d = fixPhoto(p); if (d) { p.dev = d; n++; updCard(p); } else none++; });
  if (ai) {
    var todo = list.map(function (p) { return [p, aiNeeds(p).filter(function (k) { if (aiRefused(k)) { skipped[k] = 1; return false; } return true; })]; }).filter(function (x) { return x[1].length; });
    // beaucoup de photos a reparer par l'IA : on previent du temps avant de lancer (environ 8 s par reparation)
    var nk = todo.reduce(function (t, x) { return t + x[1].length; }, 0), mn = Math.round(nk * 8 / 60);
    if (todo.length > 15 && mn >= 3 && !confirm("L'IA doit réparer " + todo.length + " photos : environ " + (mn >= 120 ? Math.round(mn / 60) + " heures" : mn + " minutes") + ".\n\nOK = lancer l'IA maintenant\nAnnuler = garder seulement les corrections rapides (déjà faites)")) todo = [];
    AI.busy = true; aiShow();
    for (var i = 0; i < todo.length; i++) {
      var p = todo[i][0], ks = todo[i][1], before = p.a;
      if (p.ai) { p.ai = null; full.cache.delete(p.id); } // on repart de l'original
      for (var j = 0; j < ks.length; j++) {
        var k = ks[j], q0 = qualOf(before, k), save = p.ai;
        try {
          await aiOne(p, k, i + 1, todo.length, true);
          if (k !== "face") {
            $("aiState").textContent = "⏳ Vérification du résultat…";
            var m = await measure(p), q1 = qualOf(m, k);
            window.__rpLastMeas = {k: k, q0: q0, q1: q1};
            // debruitage : seul le bruit compte (le bruit gonfle la nettete mesuree) ; autres : la nettete doit monter
            var worse = !q0 || !q1 ? false : k === "scu" ? -q1.v > -q0.v * 0.85 : q1.v <= q0.v + 2;
            if (worse) { p.ai = save; full.cache.delete(p.id); gains.push(p.name + " : " + AIW[k] + " annulée (pas d'amélioration)"); continue; }
            if (q0 && q1) { var g = q0.txt + " → " + q1.txt.replace(/^\D+/, ""); p.ai.gain = (p.ai.gain ? p.ai.gain + ", " : "") + g; before = m; }
          }
          p.ai.auto = true; aiPrefAdd(k, "auto");
          if (p.dev) { p.dev.fix = (p.dev.fix || []).concat([AIW[k] + " par IA" + (k !== "face" && p.ai.gain ? "" : "")]);
            var L2 = p.dev.looks || {};
            if (k === "naf") { p.dev.deblur = null; if (L2.details) L2.details.n = Math.min(L2.details.n || 0, 15); }
            if (k === "scu" && L2.details && L2.details.s < 0) { L2.details.s = 0; p.dev.fix = p.dev.fix.filter(function (t) { return t !== "grain lissé"; }); } }
          else { p.dev = {profile: "LABO PRO EV5", pro: false, dose: 100, v: {}, curve: null, neutral: true, fix: [AIW[k] + " par IA"]}; }
        } catch (e) { gains.push(p.name + " : " + (e.message || e)); }
      }
      if (p.ai && p.ai.gain) gains.push(p.name + " : " + p.ai.gain);
      updCard(p); n += p.dev && !list.indexOf ? 0 : 0;
    }
    AI.busy = false;
  }
  saveSoon();
  var nn = list.filter(function (p) { return p.dev && p.dev.fix && p.dev.fix.length; }).length;
  if (!nn) { aiShow(S.byId[S.view[S.cur]]); toast("Aucun problème corrigeable sur " + (list.length > 1 ? "ces photos" : "cette photo") + "."); return; }
  var sk = Object.keys(skipped).map(function (k) { return AIW[k]; });
  toast(nn + " photo" + (nn > 1 ? "s corrigées" : " corrigée") + ". " + (gains.length ? gains.slice(0, 3).join(" · ") + (gains.length > 3 ? "…" : "") + ". " : "") + (sk.length ? "Non proposé (souvent annulé par vous) : " + sk.join(", ") + ". " : "") + "Finition possible dans Retoucher.", 7000);
  if (S.tab !== "retoucher") setTab("retoucher"); else { var pc = S.byId[S.view[S.cur]]; devShow(pc); rpPreview(); }
}
function fixTargets() { return S.sel.size ? Array.from(S.sel).map(function (id) { return S.byId[id]; }) : [S.byId[S.view[S.cur]]].filter(Boolean); }
/* la case « IA » est decochee par defaut (corriger reste instantane) ; votre choix est memorise */
try { $("fixAi").checked = localStorage.getItem("rp_fixai") === "1"; } catch (e) {}
$("fixAi").addEventListener("change", function () { try { localStorage.setItem("rp_fixai", $("fixAi").checked ? "1" : "0"); } catch (e) {} });
$("bFix").onclick = function () { fixRun(fixTargets()); };
$("dvFix").onclick = function () { fixRun(fixTargets()); };

/* courbe : points a tirer */
var CRV = {pts: null, drag: -1, ch: "m"};
function crvLut(pts) { pts = pts.slice().sort(function (a, b) { return a[0] - b[0]; }); var L = []; for (var v = 0; v < 256; v++) { var k = 0; while (k < pts.length - 2 && v > pts[k + 1][0]) k++; var a = pts[k], b = pts[k + 1], t = Math.max(0, Math.min(1, (v - a[0]) / Math.max(1, b[0] - a[0]))), t2 = t * t * (3 - 2 * t); L.push(a[1] + (b[1] - a[1]) * (t * 0.5 + t2 * 0.5)); } return L; }
function curveDraw(pts) {
  var cv = $("dvCurve"); if (!cv) return; var x = cv.getContext("2d"), W = cv.width, H = cv.height;
  CRV.pts = pts ? pts.map(function (q) { return q.slice(); }) : [[0, 0], [255, 255]];
  x.fillStyle = "#000"; x.fillRect(0, 0, W, H); x.strokeStyle = "#222"; x.lineWidth = 1;
  for (var i = 1; i < 4; i++) { x.beginPath(); x.moveTo(W * i / 4, 0); x.lineTo(W * i / 4, H); x.moveTo(0, H * i / 4); x.lineTo(W, H * i / 4); x.stroke(); }
  var p = S.byId[S.view[S.cur]]; if (p && p.a && p.a.hist) { var mx = Math.max.apply(null, p.a.hist.slice(1, 63)) || 1; x.fillStyle = "#2a2f38"; p.a.hist.forEach(function (v, k) { var hh = Math.min(1, v / mx) * H; x.fillRect(k * W / 64, H - hh, W / 64 + 0.5, hh); }); }
  var L = crvLut(CRV.pts); x.strokeStyle = {m: "#d4af37", r: "#ff6b6b", g: "#5fd068", b: "#5aa2ff"}[CRV.ch || "m"]; x.lineWidth = 2; x.beginPath();
  for (var v = 0; v < 256; v++) { var X = v / 255 * W, Y = H - L[v] / 255 * H; if (v) x.lineTo(X, Y); else x.moveTo(X, Y); } x.stroke();
  x.fillStyle = "#fff"; CRV.pts.forEach(function (q) { x.beginPath(); x.arc(q[0] / 255 * W, H - q[1] / 255 * H, 4, 0, 7); x.fill(); });
}
(function () {
  var cv = $("dvCurve");
  function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(255, (e.clientX - r.left) / r.width * 255)), Math.max(0, Math.min(255, (1 - (e.clientY - r.top) / r.height) * 255))]; }
  function near(q) { var best = -1, bd = 14; CRV.pts.forEach(function (o, i) { var d = Math.hypot(o[0] - q[0], o[1] - q[1]); if (d < bd) { bd = d; best = i; } }); return best; }
  function commit() { var p = S.byId[S.view[S.cur]]; if (!p) return; var pts = CRV.pts.slice().sort(function (a, b) { return a[0] - b[0]; }).map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }); var lin = pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 255 && pts[1][1] === 255, d = devGet(p);
    if (CRV.ch === "m") d.curve = lin ? null : pts; else { d.curves = d.curves || {}; d.curves[CRV.ch] = lin ? null : pts; }
    devChanged(p); }
  cv.addEventListener("mousedown", function (e) { var q = pos(e), i = near(q); if (i < 0) { CRV.pts.push(q); i = CRV.pts.length - 1; } CRV.drag = i; curveDraw(CRV.pts); });
  window.addEventListener("mousemove", function (e) { if (CRV.drag < 0) return; var q = pos(e), pt = CRV.pts[CRV.drag], end = CRV.drag < 2 && (pt[0] === 0 || pt[0] === 255); CRV.pts[CRV.drag] = end ? [pt[0], q[1]] : q; curveDraw(CRV.pts); });
  window.addEventListener("mouseup", function () { if (CRV.drag < 0) return; CRV.drag = -1; commit(); });
  cv.addEventListener("dblclick", function (e) { var i = near(pos(e)); if (i > 1) { CRV.pts.splice(i, 1); curveDraw(CRV.pts); commit(); } });
  document.querySelector("#rtTop .chan").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ch]"); if (!b) return; CRV.ch = b.dataset.ch;
    Array.prototype.forEach.call(document.querySelectorAll("#rtTop .chan button"), function (x) { x.classList.toggle("on", x === b); });
    var p = S.byId[S.view[S.cur]], d = p && p.dev || {}; curveDraw(CRV.ch === "m" ? d.curve : (d.curves || {})[CRV.ch]);
  });
  $("dvCurve0").onclick = function () { CRV.pts = [[0, 0], [255, 255]]; curveDraw(CRV.pts); commit(); };
})();

/* ---------------- RETOUCHE PORTRAIT (dans la vue en grand) ---------------- */
var RP_GROUPS = [
  ["Peau", [["peau", "Lissage (garde le grain)"], ["acne", "Acné / boutons"], ["taches", "Taches"], ["rousseur", "Taches de rousseur"]]],
  ["Rides", [["cernes", "Cernes"], ["sourire", "Rides du sourire"], ["front", "Rides du front"]]],
  ["Yeux", [["yeux", "Blanc des yeux"], ["iris", "Iris (netteté, éclat)"]]],
  ["Bouche", [["dents", "Blanchir les dents"], ["levres", "Couleur des lèvres"]]],
  ["Visage", [["eclat", "Éclat du visage"]]],
  ["Arrière-plan", [["fondFlou", "Flouter le fond"], ["fondSombre", "Assombrir le fond"], ["fondGris", "Désaturer le fond"]]]
];
var RP_PRESETS = {
  "naturel":  {nom: "Naturel", v: {peau: 35, acne: 60, taches: 35, rousseur: 0, cernes: 30, sourire: 15, front: 15, yeux: 25, iris: 20, dents: 25, levres: 10, eclat: 15}},
  "eclat":    {nom: "Éclat (Face Pop)", v: {peau: 30, acne: 55, taches: 30, cernes: 35, sourire: 15, front: 15, yeux: 40, iris: 45, dents: 30, levres: 25, eclat: 55}},
  "glamour":  {nom: "Glamour", v: {peau: 65, acne: 80, taches: 60, rousseur: 40, cernes: 60, sourire: 45, front: 45, yeux: 45, iris: 40, dents: 45, levres: 30, eclat: 35}},
  "mariage":  {nom: "Mariage", v: {peau: 45, acne: 75, taches: 45, rousseur: 15, cernes: 45, sourire: 30, front: 30, yeux: 35, iris: 30, dents: 45, levres: 20, eclat: 25}},
  "homme":    {nom: "Homme (léger)", v: {peau: 15, acne: 60, taches: 25, cernes: 30, sourire: 0, front: 10, yeux: 25, iris: 30, dents: 20, eclat: 25}},
  "enfant":   {nom: "Enfant (très léger)", v: {peau: 10, acne: 30, taches: 10, cernes: 15, yeux: 15, iris: 15, eclat: 10}}
};
var RPL = (function () { try { return JSON.parse(localStorage.getItem("rp_ret")) || {}; } catch (e) { return {}; } })();
var rp = {open: false, cur: null, t: 0, busy: 0, url: null};
function rpDefault(p) { var k = adjKeys(p); for (var i = 0; i < k.length; i++) if (RPL[k[i]]) return JSON.parse(JSON.stringify(RPL[k[i]])); return {preset: "naturel", str: 80, v: JSON.parse(JSON.stringify(RP_PRESETS.naturel.v))}; }
function rpEff(r) { if (!r) return null; var o = {}, n = 0; Object.keys(r.v).forEach(function (k) { o[k] = Math.round((r.v[k] || 0) * r.str / 100); n += o[k]; }); return n ? o : null; }
function rpDraw() {
  var p = S.byId[S.view[S.cur]], box = $("rpPanel"); if (!p) return;
  var r = p.ret || rp.cur || rpDefault(p); rp.cur = r;
  var faces = bigFaces(p.a).length;
  box.innerHTML = "<h3><svg class='ic'><use href='#i-face'/></svg>Retouche portrait</h3>" +
    (faces ? "" : "<div class='note' style='color:var(--doubt)'>Aucun visage assez grand sur cette photo : seuls les réglages d'arrière-plan peuvent agir.</div>") +
    "<label class='sel full'>Préréglage<select id='rpPre'><option value=''>Personnalisé</option>" + Object.keys(RP_PRESETS).map(function (k) { return "<option value='" + k + "'" + (r.preset === k ? " selected" : "") + ">" + RP_PRESETS[k].nom + "</option>"; }).join("") + "</select></label>" +
    "<div class='rl'><span>Intensité</span><input type='range' id='rpStr' min='0' max='100' value='" + r.str + "'><b>" + r.str + "</b></div>" +
    "<div class='expert'>" + RP_GROUPS.map(function (g) { return "<h5>" + g[0] + "</h5>" + g[1].map(function (it) { var v = r.v[it[0]] || 0; return "<div class='rl'><span>" + it[1] + "</span><input type='range' data-k='" + it[0] + "' min='0' max='100' value='" + v + "'><b>" + v + "</b></div>"; }).join(""); }).join("") + "</div>" +
    (document.body.classList.contains("simple") ? "<p class='small' style='margin:8px 0 0'>Mode Simple : choisissez un préréglage et son intensité. Passez en mode Expert pour régler chaque point.</p>" : "") +
    "<div id='rpBusy'></div>" +
    "<h5>Appliquer à</h5><div class='apply'><button data-a='photo' class='pri'>Cette photo</button><button data-a='person'" + (faces && bigFaces(p.a)[0].pid != null ? "" : " disabled") + ">Cette personne</button><button data-a='serie'" + (p.g >= 0 ? "" : " disabled") + ">Cette série</button><button data-a='all'>Toutes avec visage</button></div>" +
    "<div class='apply'><button data-a='none'>Retirer la retouche</button><button data-a='hold' title='Maintenez pour voir l avant'>👁 Avant (maintenir)</button></div>" +
    "<div class='note'>" + (p.ret ? "✔ Cette photo est retouchée (appliqué à l'export)." : "Aperçu seulement : touchez « Appliquer à » pour garder la retouche.") + "</div>";
}
/* apercu rapide : un assistant de calcul reserve (n'attend jamais l'analyse), la photo decodee gardee en memoire,
   calcul a la taille de l'ecran (pleine resolution seulement au zoom), et seule la derniere position d'un curseur est calculee */
var PV = {w: null, src: null, busy: false, next: null};
function prevWorker() { if (!PV.w) { PV.w = new Worker("analyse.js"); PV.w.inflight = 0; PV.w.jobs = {}; PV.w.onmessage = onResult.bind(null, PV.w); } return PV.w; }
function prevSize() { var v = $("lpView"), r = window.devicePixelRatio || 1; return full.zoom ? 4000 : Math.min(2400, Math.max(1000, Math.round(Math.max(v.clientWidth, v.clientHeight) * r))); }
function prevSend(job) {
  if (PV.busy) { PV.next = job; return; }
  PV.busy = true;
  var go = function (b) {
    var w = prevWorker(), msg = {id: job.key, src: job.src, heic: job.heic, preview: true, max: job.max, ret: job.eff, heals: job.heals, style: job.dst, fast: job.fast || 0};
    prevWait[job.key] = function (r) { PV.busy = false; if (!r.prev && /source/.test(r.err || "")) PV.src = null; job.done(r); if (PV.next) { var n = PV.next; PV.next = null; prevSend(n); } };
    if (b) { var c = b.buffer.byteLength === b.byteLength ? b : b.slice(); msg.buf = c; w.postMessage(msg, [c.buffer]); } else w.postMessage(msg);
  };
  var sk = job.src + "|" + job.max;
  if (PV.src === sk) go(null);
  else if (WARM.has(sk)) { var wb = WARM.get(sk); WARM.delete(sk); PV.src = sk; var w0 = prevWorker(), msg0 = {id: job.key, src: job.src, heic: job.heic, preview: true, max: job.max, ret: job.eff, heals: job.heals, style: job.dst, fast: job.fast || 0, bmp: wb};
    prevWait[job.key] = function (r) { PV.busy = false; if (!r.prev && /source/.test(r.err || "")) PV.src = null; job.done(r); if (PV.next) { var n = PV.next; PV.next = null; prevSend(n); } }; w0.postMessage(msg0, [wb]); }
  else readBytes(job.p).then(function (b) { if (!b) { PV.busy = false; return; } PV.src = sk; go(b); });
}
/* la photo suivante (et la precedente) est decodee a l'avance par un assistant a part : elle s'affiche corrigee tout de suite */
var WARM = new Map(), WARMW = null, WARMING = {};
function warmNear() {
  if (S.tab !== "retoucher") return;
  [S.cur + 1, S.cur - 1].forEach(function (i) {
    var q = S.byId[S.view[i]]; if (!q) return;
    var st = devStyle(q); if (!st || (!st.jm && !st.tilt && !st.rot && !st.crop) && !q.ret && !q.heals) return;
    var max = prevSize(), sk = q.id + "|" + (q.ai ? q.ai.file : "") + "|" + (q.rawDev || "") + "|" + max;
    if (PV.src === sk || WARM.has(sk) || WARMING[sk]) return; WARMING[sk] = 1;
    readBytes(q).then(function (b) {
      if (!b) { delete WARMING[sk]; return; }
      if (!WARMW) { WARMW = new Worker("analyse.js"); WARMW.inflight = 0; WARMW.jobs = {}; WARMW.onmessage = onResult.bind(null, WARMW); }
      var id = "warm:" + sk, c = b.buffer.byteLength === b.byteLength ? b : b.slice();
      prevWait[id] = function (r) { delete WARMING[sk]; if (!r.warm) return; WARM.set(sk, r.warm); while (WARM.size > 3) { var k0 = WARM.keys().next().value; WARM.get(k0).close(); WARM.delete(k0); } };
      WARMW.postMessage({id: id, warm: true, buf: c, heic: heicOf(q), max: max}, [c.buffer]);
    });
  });
}
function rpPreview(fast) {
  var p = S.byId[S.view[S.cur]]; if (!p) return;
  var eff = rp.open && rp.live ? rpEff(rp.cur) : rpEff(p.ret), heals = p.heals || [], id = p.id, dst = devStyle(p);
  if (dst) { delete dst.ret; delete dst.heals; if (!dst.jm && !dst.tilt && !dst.rot && !dst.crop) dst = null; }
  clearTimeout(rp.t); clearTimeout(rp.tf);
  // en glissant : apercu rapide tout de suite (image plus petite), puis l'image nette des qu'on s'arrete
  var go = function (fs) {
    if (!eff && !heals.length && !dst) { fullUrl(p).then(function (u) { if ($("lpImg").dataset.id === id) $("lpImg").src = u; }); return; }
    var busy = $("rpBusy"); if (busy) busy.textContent = "⏳ Calcul de l'aperçu…";
    var my = ++rp.busy;
    prevSend({p: p, key: "prev:" + id + ":" + my, src: id + "|" + (p.ai ? p.ai.file : "") + "|" + (p.rawDev || ""), heic: heicOf(p), max: prevSize(), eff: eff, heals: heals, dst: dst, fast: fs, done: function (r) {
      // on affiche tout resultat plus recent que celui a l'ecran (l'apercu rapide n'est plus jete quand l'image nette est demandee)
      if (my <= (rp.shown || 0) || $("lpImg").dataset.id !== id) return; if (r.prev) rp.shown = my; if (!fs) setTimeout(warmNear, 300);
      if (busy) busy.textContent = r.prev ? (r.faces || !eff || !rp.open ? "" : "Aucun visage retouché sur cette photo.") : "Aperçu impossible : " + (r.err || "");
      var hb = $("healMsg"); if (hb) hb.textContent = "";
      var di = $("dbInfo"); if (di) di.textContent = r.db ? dbText(r.db) : "";
      if (r.prev) { if (rp.url) URL.revokeObjectURL(rp.url); rp.url = URL.createObjectURL(r.prev); var img = $("lpImg"), oldW = img.naturalWidth;
        img.onload = function () {
          if (!full.zoom) fit();
          else if (oldW && img.naturalWidth !== oldW) { var k = img.naturalWidth / oldW, v = $("lpView"), cx = v.clientWidth / 2, cy = v.clientHeight / 2; full.tx = cx - (cx - full.tx) * k; full.ty = cy - (cy - full.ty) * k; apply(); }
          drawLoupeMarks(p); adjShow(p); };
        img.src = rp.url; }
    }});
  };
  if (fast && !full.zoom) { rp.t = setTimeout(function () { go(Math.max(640, Math.round(prevSize() / 2))); }, 25); rp.tf = setTimeout(function () { go(0); }, 250); }
  else rp.t = setTimeout(function () { go(0); }, fast ? 60 : 120);
}
var prevWait = {};
/* ---------------- AMELIORATION IA (NAFNet, Real-ESRGAN) : calcul sur le PC, resultat enregistre a part ---------------- */
var AI = {ok: false, busy: false, has: {}};
var AIK = {naf: "Déflouée par IA", esr: "Restaurée par IA", x2: "Agrandie ×2 par IA", scu: "Débruitée par IA", face: "Visages réparés par IA"};
/* prechargement : en Retoucher, le modele d'IA dont la photo aura sans doute besoin est charge a l'avance (rien n'est calcule) */
var AIWARM = {};
function aiWarm(p) {
  if (!AI.ok || !N || !N.aiWarm || !p || !p.a || S.tab !== "retoucher") return;
  clearTimeout(aiWarm.t); aiWarm.t = setTimeout(function () {
    var m = aiNeeds(p).map(function (k) { return k === "face" ? "gfp" : k; }).filter(function (k) { return !AIWARM[k]; });
    if (!m.length) return; m.forEach(function (k) { AIWARM[k] = 1; }); N.aiWarm(m);
  }, 1500);
}
function aiShow(p) {
  aiWarm(p);
  if (!AI.ok) return; $("aiBox").style.display = ""; $("fixOpts").style.display = "";
  [["aiNaf", "naf"], ["aiEsr", "esr"], ["aiX2", "esr"], ["aiScu", "scu"], ["aiGfp", "gfp"]].forEach(function (k) { $(k[0]).disabled = AI.busy; $(k[0]).style.display = AI.has[k[1]] ? "" : "none"; });
  if (!AI.busy) $("aiState").textContent = p && p.ai ? "✓ " + aiLabel(p.ai) + (p.ai.gain ? " — " + p.ai.gain : "") + " (vos réglages s'appliquent par-dessus)." : "";
  $("aiOff").style.display = p && p.ai && !AI.busy ? "" : "none";
}
var AIW = {naf: "défloutée", esr: "restaurée", x2: "agrandie ×2", scu: "débruitée", face: "visages réparés"};
function aiLabel(ai) { var k = ai.kinds || [ai.kind]; return k.length === 1 ? AIK[k[0]] : "IA : " + k.map(function (x) { return AIW[x]; }).join(", puis "); }
function aiJoin(jpg, orig) { // remet les informations de prise de vue (EXIF) de l'original
  ensurePool(); var w = pool[0], key = "ej:" + Date.now() + Math.random();
  return new Promise(function (res) { prevWait[key] = function (r) { res(r.joined || jpg); }; w.postMessage({id: key, exifjoin: true, jpg: jpg.buffer, orig: orig ? orig.buffer : null}); });
}
async function aiOne(p, kind, nb, of, chain) {
  if (kind === "face") return aiFace(p, nb, of, chain);
  var first = await readBytes(p, true), orig = chain && p.ai ? await readBytes(p) : first; if (!orig) throw new Error("photo illisible");
  var blob;
  if (heicOf(p) && !(chain && p.ai)) { blob = await new Promise(function (res) { ensurePool(); var w = pool[pool.length - 1], key = "full:ai:" + Date.now(), c = orig.slice(); fullWait[key] = function (bl) { res(bl); }; w.postMessage({id: key, buf: c.buffer, full: true}, [c.buffer]); }); if (!blob) throw new Error("HEIC illisible"); }
  else blob = new Blob([orig]);
  var bm = await createImageBitmap(blob, {imageOrientation: "from-image"}), W = bm.width, H = bm.height, MP = W * H;
  var same = kind === "naf" || kind === "scu", model = same ? kind : $("aiSoft").value, d, tw, th;
  if (same) { d = Math.min(1, Math.sqrt((kind === "scu" ? 6e6 : 8e6) / MP)); }
  else if (kind === "esr") { d = Math.max(0.25, Math.min(1, Math.sqrt(3e6 / MP))); }
  else { var t = Math.min(2, Math.sqrt(60e6 / MP)); d = Math.max(t / 4, Math.min(1, Math.sqrt(3e6 / MP))); }
  var iw = Math.max(16, Math.round(W * d)), ih = Math.max(16, Math.round(H * d));
  if (same) { tw = iw; th = ih; } else if (kind === "esr") { tw = W; th = H; } else { tw = Math.round(W * Math.min(2, Math.sqrt(60e6 / MP))); th = Math.round(H * tw / W); }
  var ci = new OffscreenCanvas(iw, ih), xi = ci.getContext("2d"); xi.imageSmoothingQuality = "high"; xi.drawImage(bm, 0, 0, iw, ih);
  var src = xi.getImageData(0, 0, iw, ih), t0 = Date.now();
  N.onAiProg(function (f, ep) {
    var el = (Date.now() - t0) / 1000, rest = f > 0.02 ? Math.round(el / f - el) : null;
    $("aiState").textContent = "⏳ " + AIK[kind].replace(" par IA", "") + " " + (of > 1 ? "(photo " + nb + " / " + of + ") " : "") + Math.round(f * 100) + " %" + (rest != null ? " — encore ~" + (rest > 90 ? Math.round(rest / 60) + " min" : rest + " s") : "") + " · " + ep;
  });
  var out = await N.aiRun(model, new Uint8Array(src.data.buffer), iw, ih, tw, th);
  var co = new OffscreenCanvas(same ? W : tw, same ? H : th), xo = co.getContext("2d");
  if (same && (tw !== W || th !== H)) {
    // grande photo : l'IA travaille sur une version reduite, puis on ajoute seulement la difference a l'image pleine taille
    xo.drawImage(bm, 0, 0); var fimg = xo.getImageData(0, 0, W, H), fd = fimg.data;
    var cd = new OffscreenCanvas(tw, th), xd = cd.getContext("2d"), dd = new ImageData(tw, th);
    for (var i = 0; i < dd.data.length; i += 4) { dd.data[i] = Math.max(0, Math.min(255, 128 + (out[i] - src.data[i]))); dd.data[i + 1] = Math.max(0, Math.min(255, 128 + (out[i + 1] - src.data[i + 1]))); dd.data[i + 2] = Math.max(0, Math.min(255, 128 + (out[i + 2] - src.data[i + 2]))); dd.data[i + 3] = 255; }
    xd.putImageData(dd, 0, 0); var cu = new OffscreenCanvas(W, H), xu = cu.getContext("2d"); xu.imageSmoothingQuality = "high"; xu.drawImage(cd, 0, 0, W, H);
    var up = xu.getImageData(0, 0, W, H).data;
    for (i = 0; i < fd.length; i += 4) { fd[i] += up[i] - 128; fd[i + 1] += up[i + 1] - 128; fd[i + 2] += up[i + 2] - 128; }
    xo.putImageData(fimg, 0, 0);
  } else xo.putImageData(new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.length), tw, th), 0, 0);
  // defloutage du sujet seulement : le resultat n'est garde que sur les personnes, en fondu ; le fond flou (bokeh) reste
  if (kind === "naf" && $("aiKeepBg").checked && p.a && bigFaces(p.a).length) {
    $("aiState").textContent = "⏳ Repérage des personnes…";
    var pm = await new Promise(function (res) { ensurePool(); var w = pool[0], key = "pm:" + Date.now(), c = orig.slice(); prevWait[key] = function (r) { res(r.pmask); }; w.postMessage({id: key, buf: c.buffer, heic: heicOf(p) && !(chain && p.ai), pmask: true}, [c.buffer]); });
    if (pm) {
      var mc = new OffscreenCanvas(pm.w, pm.h), mx = mc.getContext("2d"), mi = mx.createImageData(pm.w, pm.h);
      for (var q = 0; q < pm.d.length; q++) { mi.data[q * 4 + 3] = pm.d[q]; }
      mx.putImageData(mi, 0, 0);
      var mb = new OffscreenCanvas(W, H), xb = mb.getContext("2d"); xb.filter = "blur(" + Math.max(2, Math.round(W / 250)) + "px)"; xb.drawImage(mc, 0, 0, W, H);
      var al = xb.getImageData(0, 0, W, H).data, oc = new OffscreenCanvas(W, H), xoc = oc.getContext("2d"); xoc.drawImage(bm, 0, 0);
      var od = xoc.getImageData(0, 0, W, H), o2 = od.data, nimg = xo.getImageData(0, 0, W, H), nd = nimg.data;
      for (q = 0; q < nd.length; q += 4) { var a = al[q + 3] / 255; nd[q] = o2[q] + (nd[q] - o2[q]) * a; nd[q + 1] = o2[q + 1] + (nd[q + 1] - o2[q + 1]) * a; nd[q + 2] = o2[q + 2] + (nd[q + 2] - o2[q + 2]) * a; }
      xo.putImageData(nimg, 0, 0);
    }
  }
  bm.close();
  await aiSave(p, kind, co, p.heic || p.raw ? null : first, chain);
}
async function aiSave(p, kind, co, orig, chain) {
  var jpg = new Uint8Array(await (await co.convertToBlob({type: "image/jpeg", quality: 0.95})).arrayBuffer());
  jpg = await aiJoin(jpg, orig);
  var kinds = (chain && p.ai ? (p.ai.kinds || [p.ai.kind]) : []).concat([kind]);
  var file = sessPath("ia" + N.sep + String(p.rel || p.name).replace(/[\\\/:*?"<>|]+/g, "_").replace(/\.[^.]+$/, "") + "_" + kinds.join("-") + ".jpg");
  await N.writeBin(file, jpg);
  p.aiPrev = p.ai || null; p.ai = {kind: kind, kinds: kinds, file: file, w: co.width, h: co.height}; full.cache.delete(p.id);
}
/* visages : chaque visage est redresse sur le modele FFHQ (512 px), repare par GFPGAN, puis recolle en fondu */
var FFHQ = [[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935], [201.26117, 371.41043], [313.08905, 371.15118]];
function simil(src, dst) { // similitude (echelle, rotation, deplacement) au sens des moindres carres
  var n = src.length, sx = 0, sy = 0, dx = 0, dy = 0, i; for (i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; } sx /= n; sy /= n; dx /= n; dy /= n;
  var num1 = 0, num2 = 0, den = 0; for (i = 0; i < n; i++) { var x = src[i][0] - sx, y = src[i][1] - sy, u = dst[i][0] - dx, v = dst[i][1] - dy; num1 += x * u + y * v; num2 += x * v - y * u; den += x * x + y * y; }
  var a = num1 / den, b = num2 / den; return {a: a, b: b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy)};
}
async function aiFace(p, nb, of, chain) {
  $("aiState").textContent = "⏳ Recherche des visages…";
  var cur = await readBytes(p); if (!cur) throw new Error("photo illisible");
  var hc = heicOf(p), blob;
  var f5 = await new Promise(function (res) { ensurePool(); var w = pool[0], key = "f5:" + Date.now(), c = cur.slice(); prevWait[key] = function (r) { res(r.faces5 || []); }; w.postMessage({id: key, buf: c.buffer, heic: hc, faces5: true}, [c.buffer]); });
  if (!f5.length) throw new Error("aucun visage trouvé sur " + p.name);
  if (hc) { blob = await new Promise(function (res) { ensurePool(); var w = pool[pool.length - 1], key = "full:ai:" + Date.now(), c = cur.slice(); fullWait[key] = function (bl) { res(bl); }; w.postMessage({id: key, buf: c.buffer, full: true}, [c.buffer]); }); }
  else blob = new Blob([cur]);
  var bm = await createImageBitmap(blob, {imageOrientation: "from-image"}), W = bm.width, H = bm.height, co = new OffscreenCanvas(W, H), xo = co.getContext("2d"); xo.drawImage(bm, 0, 0); bm.close();
  var mk = new OffscreenCanvas(512, 512), xm = mk.getContext("2d"); xm.filter = "blur(26px)"; xm.fillStyle = "#fff"; xm.beginPath(); xm.ellipse(256, 280, 190, 215, 0, 0, Math.PI * 2); xm.fill();
  var al = +$("aiFace").value || 0.6;
  for (var i = 0; i < f5.length; i++) {
    $("aiState").textContent = "⏳ Visage " + (i + 1) + " / " + f5.length + (of > 1 ? " (photo " + nb + " / " + of + ")" : "") + "…";
    var T = simil(f5[i], FFHQ), ci = new OffscreenCanvas(512, 512), xi = ci.getContext("2d"); xi.imageSmoothingQuality = "high";
    xi.setTransform(T.a, T.b, -T.b, T.a, T.tx, T.ty); xi.drawImage(co, 0, 0); xi.setTransform(1, 0, 0, 1, 0, 0);
    var src = xi.getImageData(0, 0, 512, 512), out = await N.aiRun("gfp", new Uint8Array(src.data.buffer), 512, 512, 512, 512);
    var rc = new OffscreenCanvas(512, 512), xr = rc.getContext("2d"); xr.putImageData(new ImageData(new Uint8ClampedArray(out.buffer, out.byteOffset, out.length), 512, 512), 0, 0);
    xr.globalCompositeOperation = "destination-in"; xr.drawImage(mk, 0, 0);
    var det = T.a * T.a + T.b * T.b, A = T.a / det, B = -T.b / det, C = T.b / det, D = T.a / det;
    xo.save(); xo.imageSmoothingQuality = "high"; xo.globalAlpha = al; xo.setTransform(A, B, C, D, -(A * T.tx + C * T.ty), -(B * T.tx + D * T.ty)); xo.drawImage(rc, 0, 0); xo.restore();
  }
  await aiSave(p, "face", co, p.heic || p.raw || p.ai ? null : cur, true);
  return f5.length;
}
async function aiRun(kind) {
  if (AI.busy || !N) return; var list = fixTargets(); if (!list.length) return;
  AI.busy = true; aiShow(); var ok = 0, t0 = Date.now(), errs = [];
  for (var i = 0; i < list.length; i++) { try { await aiOne(list[i], kind, i + 1, list.length); ok++; updCard(list[i]); } catch (e) { errs.push(e.message || String(e)); } }
  AI.busy = false; saveSoon();
  var p = S.byId[S.view[S.cur]]; aiShow(p); if (p) rpPreview();
  var VB = {naf: ["défloutée", "défloutées"], esr: ["restaurée", "restaurées"], x2: ["agrandie ×2", "agrandies ×2"], scu: ["débruitée", "débruitées"], face: ["aux visages réparés", "aux visages réparés"]}[kind];
  toast(ok ? ok + " photo" + (ok > 1 ? "s " + VB[1] : " " + VB[0]) + " par IA en " + Math.round((Date.now() - t0) / 1000) + " s." + (errs.length ? " Échec : " + errs[0] : "") : "Échec de l'IA : " + (errs[0] || ""), 5000);
}
$("aiNaf").onclick = function () { aiRun("naf"); };
$("aiEsr").onclick = function () { aiRun("esr"); };
$("aiX2").onclick = function () { aiRun("x2"); };
$("aiOff").onclick = function () { var p = S.byId[S.view[S.cur]]; if (!p || !p.ai) return; if (p.ai.auto) (p.ai.kinds || [p.ai.kind]).forEach(function (k) { aiPrefAdd(k, "undo"); }); p.ai = null; full.cache.delete(p.id); saveSoon(); aiShow(p); rpPreview(); updCard(p); };
$("aiScu").onclick = function () { aiRun("scu"); };
$("aiGfp").onclick = function () { aiRun("face"); };
if (N && N.aiOk) N.aiOk().then(function (v) { AI.has = v || {}; AI.ok = Object.keys(AI.has).some(function (k) { return AI.has[k]; }); aiShow(S.byId[S.view[S.cur]]); });

function dbText(i) {
  var t = {LEGER: "flou léger : renforcement", MOYEN: "flou de mise au point moyen", FORT: "flou de mise au point fort", BOUGE: "bougé (direction " + i.ang + "°)", IRRECUPERABLE: "flou très fort : amélioration limitée"}[i.cat] || i.cat;
  return "Détecté : " + t + (i.safe ? " — correction prudente (la déconvolution aurait abîmé la photo)" : "") + ".";
}

/* ---------------- CORRECTEUR au pinceau (meme moteur que JM LAB PRO) ---------------- */
var heal = {on: false, size: 18, pts: null};
function healToggle() {
  heal.on = !heal.on; $("lpHeal").classList.toggle("on", heal.on); $("healBar").style.display = heal.on ? "flex" : "none"; $("lpView").classList.toggle("heal", heal.on);
  healDrawAll();
}
function healCanvas() {
  var cv = $("lpPaint"), img = $("lpImg"), W = Math.round(img.naturalWidth * full.sc), H = Math.round(img.naturalHeight * full.sc);
  cv.style.left = full.tx + "px"; cv.style.top = full.ty + "px"; if (cv.width !== W || cv.height !== H) { cv.width = Math.max(1, W); cv.height = Math.max(1, H); }
  return cv;
}
function healDrawAll() {
  var cv = healCanvas(), x = cv.getContext("2d"); x.clearRect(0, 0, cv.width, cv.height);
  if (!heal.on) return;
  var p = S.byId[S.view[S.cur]], mn = Math.min(cv.width, cv.height);
  x.strokeStyle = x.fillStyle = "rgba(255,60,60,0.35)"; x.lineCap = x.lineJoin = "round";
  ((p && p.heals) || []).concat(heal.pts ? [{pts: heal.pts, r: heal.r}] : []).forEach(function (st) {
    x.lineWidth = st.r * mn * 2; x.beginPath();
    st.pts.forEach(function (q, i) { var X = q[0] * cv.width, Y = q[1] * cv.height; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
    if (st.pts.length === 1) { x.arc(st.pts[0][0] * cv.width, st.pts[0][1] * cv.height, st.r * mn, 0, 7); x.fill(); } else x.stroke();
  });
}
function healPt(e) { var r = $("lpView").getBoundingClientRect(), img = $("lpImg"); return [(e.clientX - r.left - full.tx) / (img.naturalWidth * full.sc), (e.clientY - r.top - full.ty) / (img.naturalHeight * full.sc)]; }
(function () {
  var v = $("lpView");
  v.addEventListener("mousedown", function (e) {
    if (!heal.on || e.button !== 0) return; e.stopImmediatePropagation(); e.preventDefault();
    var img = $("lpImg"); heal.r = heal.size / Math.min(img.naturalWidth * full.sc, img.naturalHeight * full.sc); heal.pts = [healPt(e)]; healDrawAll();
  }, true);
  window.addEventListener("mousemove", function (e) { if (!heal.pts) return; heal.pts.push(healPt(e)); healDrawAll(); });
  window.addEventListener("mouseup", function (e) {
    if (!heal.pts) return; e.stopImmediatePropagation();
    var p = S.byId[S.view[S.cur]]; if (p) { p.heals = (p.heals || []).concat([{pts: heal.pts.filter(function (q, i) { return i % 2 === 0 || i === heal.pts.length - 1; }), r: heal.r}]); saveSoon(); $("healMsg").textContent = "⏳ Reconstruction de la zone…"; rpPreview(); }
    heal.pts = null; healDrawAll();
  }, true);
  v.addEventListener("contextmenu", function (e) { if (heal.on) e.preventDefault(); });
})();
$("lpHeal").onclick = healToggle;
$("healSize").addEventListener("input", function () { heal.size = +this.value; });
$("healUndo").onclick = function () { var p = S.byId[S.view[S.cur]]; if (p && p.heals && p.heals.length) { p.heals.pop(); if (!p.heals.length) p.heals = null; saveSoon(); healDrawAll(); rpPreview(); } };
$("healClear").onclick = function () { var p = S.byId[S.view[S.cur]]; if (p && p.heals) { p.heals = null; saveSoon(); healDrawAll(); rpPreview(); } };
function rpToggle() {
  rp.open = !rp.open; $("rpPanel").classList.toggle("show", rp.open);
  rp.cur = null; rp.live = false; if (rp.open) { rpDraw(); rpPreview(); } else { var p = S.byId[S.view[S.cur]]; if (p) fullUrl(p).then(function (u) { $("lpImg").src = u; }); }
}
$("lpRet").onclick = rpToggle;
$("rpPanel").addEventListener("input", function (e) {
  var t = e.target, r = rp.cur; if (!r) return; rp.live = true;
  if (t.id === "rpStr") { r.str = +t.value; t.nextElementSibling.textContent = t.value; }
  else if (t.dataset.k) { r.v[t.dataset.k] = +t.value; t.nextElementSibling.textContent = t.value; r.preset = ""; $("rpPre").value = ""; }
  rpPreview();
});
$("rpPanel").addEventListener("change", function (e) {
  if (e.target.id !== "rpPre" || !e.target.value) return;
  rp.cur = {preset: e.target.value, str: rp.cur ? rp.cur.str : 80, v: JSON.parse(JSON.stringify(RP_PRESETS[e.target.value].v))}; rpDraw(); rpPreview();
});
$("rpPanel").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-a]"); if (!b || b.dataset.a === "hold") return;
  var p = S.byId[S.view[S.cur]], a = b.dataset.a, list = [p];
  if (a === "person") { var pid = bigFaces(p.a)[0].pid, o = PERS[pid]; list = o ? S.photos.filter(function (q) { return o.ids[q.id]; }) : [p]; }
  if (a === "serie" && p.g >= 0) list = S.groups[p.g].map(function (id) { return S.byId[id]; });
  if (a === "all") list = S.photos.filter(function (q) { return bigFaces(q.a).length; });
  var r = a === "none" ? null : JSON.parse(JSON.stringify(rp.cur));
  list.forEach(function (q) { q.ret = r ? JSON.parse(JSON.stringify(r)) : null; });
  if (r) { adjKeys(p).forEach(function (k) { RPL[k] = r; }); try { localStorage.setItem("rp_ret", JSON.stringify(RPL)); } catch (x) {} }
  saveSoon(); rpDraw(); if (a === "none") { rp.cur = null; rpDraw(); }
  toast(r ? "Retouche portrait appliquée à " + list.length + " photo" + (list.length > 1 ? "s" : "") + " (faite à l'export)." : "Retouche retirée.");
});
(function () {
  var holding = false;
  $("rpPanel").addEventListener("mousedown", function (e) { var b = e.target.closest("button[data-a=hold]"); if (!b) return; holding = true; var p = S.byId[S.view[S.cur]]; fullUrl(p).then(function (u) { if (holding) $("lpImg").src = u; }); });
  window.addEventListener("mouseup", function () { if (holding) { holding = false; if (rp.url) $("lpImg").src = rp.url; } });
})();

/* ---------------- vue en grand (loupe) ---------------- */
var full = {cache: new Map(), zoom: false, sc: 1, tx: 0, ty: 0}, fullWait = {};
function fullUrl(p) {
  if (full.cache.has(p.id)) return full.cache.get(p.id);
  var pr = readBytes(p).then(function (b) {
    if (!b) return p.thumbUrl;
    if (!heicOf(p)) return URL.createObjectURL(new Blob([b], {type: "image/jpeg"}));
    // HEIC : le navigateur ne sait pas l'afficher, un assistant la convertit
    ensurePool(); var w = pool[pool.length - 1], key = "full:" + p.id + ":" + Date.now();
    return new Promise(function (res) { fullWait[key] = function (bl) { res(bl ? URL.createObjectURL(bl) : p.thumbUrl); }; var c = b.buffer.byteLength === b.byteLength ? b : b.slice(); w.postMessage({id: key, buf: c, full: true}, [c.buffer]); });
  });
  full.cache.set(p.id, pr);
  if (full.cache.size > 8) { var k = full.cache.keys().next().value; var old = full.cache.get(k); full.cache.delete(k); old.then(function (u) { if (u && u.indexOf("blob:") === 0 && !Object.values(S.byId).some(function (q) { return q.thumbUrl === u; })) URL.revokeObjectURL(u); }); }
  return pr;
}
function openLoupe() { if (S.cur < 0) return; $("loupe").classList.add("show"); showLoupe(); }
function closeLoupe() { if ($("loupe").classList.contains("rmode")) { setTab("trier"); return; } if (rp.open) rpToggle(); if (heal.on) healToggle(); $("loupe").classList.remove("show"); full.zoom = false; scrollToCur(); }
/* avant / apres : la photo d'ORIGINE en entier (sans redressement, recadrage ni reglages) a la place de la version corrigee ;
   appui long sur la photo = avant tant qu'on appuie ; bouton « Avant / Apres » ou touche B = bascule */
var AB = {on: false, id: null, url: null, hold: false};
function abPlace() {
  var b = $("abImg"), v = $("lpView"); if (!b.naturalWidth) return;
  var s = Math.min(v.clientWidth / b.naturalWidth, v.clientHeight / b.naturalHeight, 1), w = b.naturalWidth * s, h = b.naturalHeight * s;
  b.style.width = w + "px"; b.style.height = h + "px"; b.style.left = (v.clientWidth - w) / 2 + "px"; b.style.top = (v.clientHeight - h) / 2 + "px"; b.style.transform = "none";
}
function abLoad() {
  var p = S.byId[S.view[S.cur]]; if (!p || AB.id === p.id) { abPlace(); return; }
  AB.id = p.id; $("abImg").removeAttribute("src");
  readBytes(p, true).then(function (b) {
    if (!b || AB.id !== p.id) return;
    var done = function (u) { if (AB.url) URL.revokeObjectURL(AB.url); AB.url = u; $("abImg").onload = abPlace; $("abImg").src = u; };
    if (!p.heic) { done(URL.createObjectURL(new Blob([b], {type: "image/jpeg"}))); return; }
    ensurePool(); var w = pool[pool.length - 1], key = "full:ab:" + Date.now(), c = b.slice(); fullWait[key] = function (bl) { if (bl) done(URL.createObjectURL(bl)); }; w.postMessage({id: key, buf: c.buffer, full: true}, [c.buffer]);
  });
}
function abToggle(on) { AB.on = on == null ? !AB.on : on; $("lpView").classList.toggle("ab", AB.on); $("lpAB").classList.toggle("on", AB.on); if (AB.on) abLoad(); }
$("lpAB").onclick = function () { abToggle(); };
function fit() {
  var v = $("lpView"), img = $("lpImg"); if (!img.naturalWidth) return;
  var s = Math.min(v.clientWidth / img.naturalWidth, v.clientHeight / img.naturalHeight, 1);
  full.sc = s; full.tx = (v.clientWidth - img.naturalWidth * s) / 2; full.ty = (v.clientHeight - img.naturalHeight * s) / 2; apply();
}
function apply() {
  var img = $("lpImg"); img.style.transform = "translate(" + full.tx + "px," + full.ty + "px) scale(" + full.sc + ")";
  if (AB.on) abPlace();
  $("lpView").classList.toggle("zoom", full.zoom);
  var o = $("lpOver"), W = img.naturalWidth * full.sc, H = img.naturalHeight * full.sc, wm = $("lpWarm");
  wm.style.left = full.tx + "px"; wm.style.top = full.ty + "px"; wm.style.width = W + "px"; wm.style.height = H + "px";
  if (heal.on) healDrawAll();
  o.style.left = full.tx + "px"; o.style.top = full.ty + "px"; o.style.width = W + "px"; o.style.height = H + "px";
}
function drawLoupeMarks(p) {
  var o = $("lpOver"); o.innerHTML = "";
  if (!$("lpMarks").checked || !p.a || p.a.err || p.rot || (p.dev && (p.dev.crop || p.dev.tilt))) return; // reperes inexacts sur une photo recadree ou tournee
  var img = $("lpImg"), fake = {clientWidth: img.naturalWidth * full.sc, clientHeight: img.naturalHeight * full.sc, offsetLeft: full.tx, offsetTop: full.ty, naturalWidth: 1};
  marks(o, fake, p.a, true);
}
function showLoupe() {
  var p = S.byId[S.view[S.cur]]; if (!p) return;
  if (p.raw && !p.rawDev && S.tab === "retoucher" && N) { rawEnsure(p).then(function (ok) { if (ok && S.byId[S.view[S.cur]] === p) { $("lpImg").dataset.id = ""; showLoupe(); } }); }
  if (AB.on) { AB.id = null; abLoad(); }
  $("lpName").textContent = p.rel + "  —  " + (S.cur + 1) + " / " + S.view.length;
  $("lpStars").innerHTML = starsHtml(p.stars);
  var img = $("lpImg"), id = p.id;
  if (img.dataset.id !== id) {
    full.zoom = false; img.dataset.id = id;
    if (p.thumbUrl) { img.src = p.thumbUrl; img.onload = function () { if (img.dataset.id === id) { fit(); drawLoupeMarks(p); } }; }
    img.dataset.full = "";
    fullUrl(p).then(function (u) { if (img.dataset.id !== id || !u) return; img.onload = function () { img.dataset.full = id; if (!full.zoom) fit(); drawLoupeMarks(p); healDrawAll(); }; img.src = u; if (p.heals || p.ret || devStyle(p)) rpPreview(); });
    var nx = S.byId[S.view[S.cur + 1]]; if (nx) fullUrl(nx);
  } else drawLoupeMarks(p);
  drawFaces($("lpFaces"), p); adjShow(p); healDrawAll();
  if (rp.open && $("rpPanel").dataset.for !== p.id) { $("rpPanel").dataset.for = p.id; rp.cur = null; rp.live = false; rpDraw(); rpPreview(); }
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
  // version corrigee affichee : on la recalcule en pleine resolution pour un vrai 100 %
  var q = S.byId[S.view[S.cur]]; if (q && (devStyle(q) || q.ret || q.heals) && S.tab === "retoucher") rpPreview();
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
  v.addEventListener("mousedown", function (e) {
    drag = {x: e.clientX, y: e.clientY, tx: full.tx, ty: full.ty}; moved = false;
    if (e.button === 0 && !heal.on && !$("lkPip").classList.contains("on") && !AB.on) { clearTimeout(AB.t); AB.t = setTimeout(function () { if (drag && !moved) { AB.hold = true; abToggle(true); } }, 250); }
  });
  window.addEventListener("mousemove", function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (!full.zoom) return; full.tx = drag.tx + dx; full.ty = drag.ty + dy; apply(); });
  window.addEventListener("mouseup", function (e) { clearTimeout(AB.t); if (AB.hold) { AB.hold = false; abToggle(false); drag = null; return; } if (drag && !moved && e.target.closest && e.target.closest("#lpView")) { var r = v.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top); } drag = null; });
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
/* export : les photos corrigees sont exportees TELLES QU'ON LES VOIT dans Retoucher (aucun profil choisi a l'aveugle ici) */
function renderUI() {
  return "<p class='small'>Les photos <b>corrigées ou retouchées</b> dans ② Retoucher sont exportées <b>telles que vous les voyez</b> (JPEG). Les autres sont copiées telles quelles. Pour changer le rendu (profil, couleurs…), faites-le dans Retoucher, où vous voyez le résultat.</p>" +
    "<label class='opt'><input type='checkbox' id='rOrig'" + (REND.orig ? " checked" : "") + "><div>Joindre aussi l'<b>original</b> des photos corrigées</div></label>" +
    "<label class='opt'><input type='checkbox' id='rName'" + (REND.name ? " checked" : "") + "><div>Nommer les photos corrigées <b>catégorie_client_001.jpg</b> (sinon : nom d'origine + _JMD_LAB_PRO)</div></label>";
}
function renderWire() {}
function renderRead() {
  REND.orig = $("rOrig").checked; REND.name = $("rName").checked; REND.on = false;
  try { localStorage.setItem("rp_render", JSON.stringify(REND)); } catch (e) {}
  var cl = ($("tClient").value || "").trim(); if (cl) { CLI[cl] = REND; try { localStorage.setItem("rp_clients", JSON.stringify(CLI)); } catch (e) {} }
  return null;
}
function styleFor(p, base) {
  // la photo a ses propres reglages (etape Retoucher) : ils passent avant ceux de l'export
  if (p.dev) { var ds = devStyle(p); if (REND.tilt && p.a && p.a.tilt) ds.tilt = p.a.tilt; if (!ds.skin) ds.skin = 0.85; return ds; }
  var o = JSON.parse(JSON.stringify(base)), cat = CATS[catOf(p)];
  if (REND.cat) { o.auto = {cibles: cat.cibles, ev: cat.ev, wb: cat.wb, tint: cat.tint}; o.skin = cat.peau; }
  else o.skin = 0.85;
  if (o.profile === "cat") o.profile = cat.prof;
  if (REND.tilt && p.a && p.a.tilt) o.tilt = p.a.tilt;
  if (p.ret) o.ret = rpEff(p.ret);
  if (p.heals) o.heals = p.heals;
  if (p.rot) o.rot = p.rot;
  var ad = p.adj || adjBias(p);
  if (ad) { o.v = o.v || {}; o.v.Exposition = (+o.v.Exposition || 0) + ad.ev / (0.5 * 0.85 * (o.dose || 65) / 100); o.v.Temperature = Math.max(-100, Math.min(100, (+o.v.Temperature || 0) + ad.wb)); }
  return o;
}
var devWait = {};
function developOne(p, style) {
  return readBytes(p).then(function (b) {
    if (!b) throw new Error("aperçu introuvable");
    ensurePool(); var w = pool[(developOne.rr = ((developOne.rr || 0) + 1)) % pool.length], key = "dev:" + p.id + ":" + Date.now() + Math.random(), c = b.buffer.byteLength === b.byteLength ? b : b.slice();
    return new Promise(function (res, rej) { devWait[key] = function (r) { if (r.dev) res(r.dev); else rej(new Error(r.err || "échec")); }; w.postMessage({id: key, buf: c, heic: heicOf(p), develop: true, style: style}, [c.buffer]); });
  });
}

// photo corrigee ou retouchee (curseurs, corrections, IA, portrait, correcteur, rotation…)
function edited(p) { var d = p.dev; return !!(p.adj || p.ret || p.heals || p.ai || p.rot || (d && (Object.keys(d.v || {}).some(function (k) { return +d.v[k]; }) || d.curve || d.curves || d.levels || d.sky || d.crop || d.deblur || d.tilt || !d.neutral || (d.looks && Object.keys(d.looks).length)))); }
function openExport() {
  var cl = ($("tClient").value || "").trim(), mem = cl && CLI[cl];
  if (mem) REND = JSON.parse(JSON.stringify(mem));
  var c = function (f) { return S.photos.filter(f).length; }, nP = c(function (p) { return p.status === "P"; }), nX = c(function (p) { return p.status === "X"; }), nS = c(function (p) { return p.stars > 0; }), nT = c(function (p) { return p.status !== "X"; });
  var nR = c(function (p) { return edited(p); });
  var pg = $("exportPage");
  if (!N) { pg.innerHTML = "<div class='exp'><h2>Exporter</h2><p>L'export (copie des photos, fichiers pour DxO et Lightroom, retouche) se fait dans la version PC de Regard Pur.</p></div>"; return; }
  if (!S.photos.length) { pg.innerHTML = "<div class='exp'><h2>Exporter</h2><p>Ouvrez d'abord un dossier de photos (étape 1 : Trier).</p></div>"; return; }
  pg.innerHTML = "<div class='exp'><h2>Exporter</h2><p class='small'>Trois choix, puis « Exporter ». Rien n'est effacé, vos originaux ne sont jamais modifiés.</p>" +
    (mem ? "<p class='small' style='color:var(--gold)'>Réglages retrouvés pour « " + esc(cl) + " ».</p>" : "") +
    "<div class='card2'><h3><i>1</i>Quelles photos ?</h3>" +
      "<label class='opt'><input type='radio' name='eW' value='P' checked><div><b>Les gardées</b> (" + nP + ")</div></label>" +
      "<label class='opt'><input type='radio' name='eW' value='PT'><div><b>Tout sauf les rejetées</b> (" + nT + ")</div></label>" +
      "<label class='opt'><input type='radio' name='eW' value='R'><div><b>Seulement les photos corrigées ou retouchées</b> (" + nR + ")</div></label>" +
      "<label class='opt'><input type='radio' name='eW' value='S'><div><b>Avec au moins <select id='eS'><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select> étoile(s)</b> (" + nS + " avec étoiles)</div></label>" +
    "</div>" +
    "<div class='card2'><h3><i>2</i>Où ?</h3>" +
      "<div style='display:flex;gap:8px;align-items:center;flex-wrap:wrap'><select id='eA'><option value='copy'>Copier</option><option value='move'>Déplacer</option></select> dans le sous-dossier <input type='text' id='eD' value='Retenues' style='flex:1;min-width:160px'> <span class='small'>du dossier des photos</span></div>" +
      "<label class='opt'><input type='checkbox' id='eX' checked><div><b>Fichiers pour DxO, Lightroom, Capture One</b> (XMP) à côté de toutes les photos : étoiles, vert = gardée, rouge = rejetée.</div></label>" +
      "<details class='adv'><summary>Plus d'options</summary><label class='opt'><input type='checkbox' id='eRej'><div>Ranger aussi les <b>rejetées</b> (" + nX + ") dans le sous-dossier « Rejetées » (rien n'est effacé)</div></label></details>" +
    "</div>" +
    "<div class='card2'><h3><i>3</i>Retouche</h3>" + renderUI() +
      (nR ? "<p class='small' style='color:var(--gold)'>" + nR + " photo(s) corrigée(s) ou retouchée(s).</p>" : "") +
    "</div>" +
    "<div class='go'><button class='pri big' data-c='go'><svg class='ic'><use href='#i-export'/></svg>Exporter</button></div>" +
    "<div class='go'><button data-c='cmpo' data-tip='Pour chaque photo corrigée du dossier d’export, retrouve la photo originale dans le dossier source et les montre côte à côte'><svg class='ic'><use href='#i-compare'/></svg>Comparer les corrigées avec leurs originaux</button></div></div>";
  renderWire();
}
async function doExport() {
  var w = document.querySelector("input[name=eW]:checked").value, minS = +$("eS").value, move = $("eA").value === "move", sub = ($("eD").value || "Retenues").replace(/[\\\/:*?"<>|]/g, "_"), rej = $("eRej").checked, xmp = $("eX").checked;
  var pick = S.photos.filter(function (p) { return w === "P" ? p.status === "P" : w === "PT" ? p.status !== "X" : w === "R" ? edited(p) : p.stars >= minS; });
  var rejs = rej ? S.photos.filter(function (p) { return p.status === "X"; }) : [];
  var style = renderRead(), withOrig = !!REND.orig;
  closeDialog();
  var tot = (xmp ? S.photos.length : 0) + pick.length + rejs.length, k = 0, err = 0;
  S.analysing = true; totalN = tot; doneN = 0; prog(); $("progTxt").textContent = "Export…";
  function step() { doneN = ++k; prog(); $("progTxt").textContent = "Export " + k + " / " + tot; }
  if (xmp) for (var i = 0; i < S.photos.length; i++) {
    var p = S.photos[i], xp = p.path.replace(/\.[^.\\\/]+$/, ".xmp");
    try { var old = await N.readText(xp); await N.writeText(xp, old && /<rdf:Description/.test(old) ? xmpMerge(old, p) : xmpPacket(p)); } catch (e) { err++; }
    step();
  }
  var dest = join(S.dir, sub), MAP = {}, nDev = 0;
  // plusieurs photos developpees en meme temps (une par assistant de calcul, 3 au plus)
  ensurePool(); var nextI = 0, K = Math.max(1, Math.min(3, pool.length));
  async function one(i) {
    var st2 = edited(pick[i]) ? devStyle(pick[i]) : null;
    if (st2 && pick[i].raw && !pick[i].rawDev) { $("progTxt").textContent = "Développement RAW " + (i + 1) + " / " + pick.length; await rawEnsure(pick[i]); }
    if (st2) {
      // developpement avec le rendu JM LAB PRO (nom comme dans l'appli : _JMD_LAB_PRO.jpg)
      $("progTxt").textContent = "Retouche " + (k + 1) + " / " + pick.length;
      var nm = st2.rotOnly ? pick[i].name.replace(/\.[^.]+$/, "") : REND.name ? (catOf(pick[i]) + "_" + (($("tClient").value || "").trim() || "seance").replace(/[\\\/:*?"<>|&\s]+/g, "_") + "_" + pad(i + 1, 3)) : pick[i].name.replace(/\.[^.]+$/, "") + "_JMD_LAB_PRO";
      try { var jpg = await developOne(pick[i], st2); await N.writeBin(join(dest, nm + ".jpg"), jpg); MAP[nm + ".jpg"] = pick[i].path; nDev++; } catch (e) { err++; }
    } else if (pick[i].ai) { // seulement l'amelioration IA : on livre la version amelioree a cote de l'original
      try { var nIA = pick[i].name.replace(/\.[^.]+$/, "") + "_IA.jpg"; await N.copyAs(pick[i].ai.file, join(dest, nIA)); MAP[nIA] = pick[i].path; nDev++; } catch (e) { err++; }
    }
    if ((withOrig && !(st2 && st2.rotOnly)) || !st2) { try { var op = pick[i].path, np = await N.copy(op, dest, move); if (move) { pick[i].path = np; Object.keys(MAP).forEach(function (k) { if (MAP[k] === op) MAP[k] = np; }); } } catch (e) { err++; } }
    step();
  }
  await Promise.all(Array.from({length: K}, async function () { while (nextI < pick.length) await one(nextI++); }));
  // le dossier d'export est marque (il n'est pas relu comme des photos a trier) et garde le lien photo corrigee -> original
  try { if (!(await N.exists(join(dest, ".regardpur-export")))) await N.writeText(join(dest, ".regardpur-export"), "Dossier cree par Regard Pur");
    var old = {}; try { old = JSON.parse(await N.readText(join(dest, ".regardpur-originaux.json")) || "{}"); } catch (e) {}
    if (Object.keys(MAP).length) await N.writeText(join(dest, ".regardpur-originaux.json"), JSON.stringify(Object.assign(old, MAP))); } catch (e) {}
  for (i = 0; i < rejs.length; i++) { try { rejs[i].path = await N.copy(rejs[i].path, join(S.dir, "Rejetées"), true); } catch (e) { err++; } step(); }
  S.analysing = false; prog(); saveSoon();
  dialog("<h3>✔ Export terminé</h3><p>" + (nDev ? nDev + " photo(s) retouchée(s)" + (withOrig ? (move ? " (originaux déplacés)" : " (originaux joints)") : "") + (pick.length > nDev ? " et " + (pick.length - nDev) + " " + (move ? "déplacée(s)" : "copiée(s)") + " telles quelles" : "") : pick.length + " photo(s) " + (move ? "déplacée(s)" : "copiée(s)")) + " dans <b>" + esc(sub) + "</b>" + (rejs.length ? ", " + rejs.length + " rejetée(s) rangée(s) dans <b>Rejetées</b>" : "") + (xmp ? ", fichiers XMP écrits" : "") + "." + (err ? "<br><span style='color:var(--rej)'>" + err + " erreur(s).</span>" : "") + "</p>" +
    (xmp ? "<p class='small'>Dans Lightroom : sélectionnez les photos puis « Métadonnées › Lire les métadonnées à partir des fichiers ». Les JPEG gardent leurs notes dans Lightroom uniquement s'ils sont importés après l'export.</p>" : "") +
    "<div class='row'><button data-c='open'>📂 Ouvrir le dossier</button>" + (nDev ? "<button data-c='cmpo'>Comparer avec les originaux</button>" : "") + "<button class='pri' data-c='ok'>OK</button></div>",
    function (c) { if (c === "open") N.openPath(dest); if (c === "cmpo") cmpOrig(dest); });
}

/* ---------------- comparer les photos corrigees (dossier d'export) avec leurs originaux (dossier source) ---------------- */
var CO = {pairs: [], i: 0, urls: []};
async function cmpOrig(dir) {
  if (!N) return;
  if (!dir) { var sub = (($("eD") && $("eD").value) || "Retenues").replace(/[\\\/:*?"<>|]/g, "_"); dir = S.dir ? join(S.dir, sub) : null; if (!dir || !(await N.exists(dir))) dir = await N.pickDir(); }
  if (!dir) return;
  toast("Recherche des originaux…");
  var files = (await N.list(dir)).filter(function (f) { return /\.jpe?g$/i.test(f.name) && f.path.indexOf(dir) === 0 && !/[\\\/]/.test(f.rel); });
  var map = {}; try { map = JSON.parse(await N.readText(join(dir, ".regardpur-originaux.json")) || "{}"); } catch (e) {}
  // originaux connus : photos du dossier ouvert, sinon fichiers du dossier parent
  var byBase = {}, add = function (path, name, p) { var b = name.replace(/\.[^.]+$/, "").toLowerCase(); if (!byBase[b] || /\.(jpe?g)$/i.test(name)) byBase[b] = {path: path, p: p || null}; };
  S.photos.forEach(function (p) { add(p.path, p.name, p); });
  if (!S.photos.length) { var parent = dir.replace(/[\\\/][^\\\/]+[\\\/]?$/, ""); (await N.list(parent)).forEach(function (f) { if (f.path.indexOf(dir) !== 0) add(f.path, f.name); }); }
  var byPath = {}; S.photos.forEach(function (p) { byPath[p.path] = p; });
  var pairs = [];
  files.forEach(function (f) {
    var o = null;
    if (map[f.name]) o = {path: map[f.name], p: byPath[map[f.name]] || null};
    else { var b = f.name.replace(/\.[^.]+$/, "").replace(/_(JMD_LAB_PRO|IA)$/i, "").toLowerCase(); if (b !== f.name.replace(/\.[^.]+$/, "").toLowerCase()) o = byBase[b] || null; }
    if (o) pairs.push({fix: f.path, name: f.name, orig: o.path, p: o.p});
  });
  if (!pairs.length) { dialog("<h3>Comparer avec les originaux</h3><p>Aucune photo corrigée avec son original n'a été trouvée dans <b>" + esc(dir) + "</b>.</p><p class='small'>Les photos corrigées s'appellent « nom_JMD_LAB_PRO.jpg » ou ont été exportées par Regard Pur.</p><div class='row'><button class='pri' data-c='ok'>OK</button></div>"); return; }
  pairs.sort(function (a, b) { return a.name.localeCompare(b.name); });
  CO.pairs = pairs; CO.i = 0; $("coView").classList.add("show"); coShow();
}
async function coUrl(path, p) {
  if (p) return fullUrl(p);
  var raw = /\.(cr2|cr3|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|srw|x3f|3fr|iiq|rwl|mrw|kdc|erf)$/i.test(path);
  if (/\.(heic|heif|hif)$/i.test(path)) return null;
  var b = await N.read(path, raw); if (!b) return null; var u = URL.createObjectURL(new Blob([b], {type: "image/jpeg"})); CO.urls.push(u); return u;
}
async function coShow() {
  var c = CO.pairs[CO.i]; if (!c) return;
  CO.urls.forEach(function (u) { URL.revokeObjectURL(u); }); CO.urls = [];
  $("coName").textContent = c.name + "  —  " + (CO.i + 1) + " / " + CO.pairs.length;
  $("coOrigName").textContent = "Original : " + c.orig.split(/[\\\/]/).pop();
  $("coA").removeAttribute("src"); $("coB").removeAttribute("src");
  var my = c, u1 = await coUrl(c.orig, c.p), u2 = await coUrl(c.fix, null);
  if (CO.pairs[CO.i] !== my) return;
  if (u1) $("coA").src = u1; else $("coOrigName").textContent += " (aperçu impossible)";
  if (u2) $("coB").src = u2;
}
function coMove(d) { if (!CO.pairs.length) return; CO.i = (CO.i + d + CO.pairs.length) % CO.pairs.length; coShow(); }
function coClose() { $("coView").classList.remove("show"); CO.urls.forEach(function (u) { URL.revokeObjectURL(u); }); CO.urls = []; }
$("coPrev").onclick = function () { coMove(-1); }; $("coNext").onclick = function () { coMove(1); }; $("coClose").onclick = coClose;
$("coSwap").onclick = function () { $("coView").classList.toggle("one"); $("coView").classList.remove("showA"); };
$("coView").addEventListener("click", function (e) { if (e.target.tagName === "IMG" && $("coView").classList.contains("one")) $("coView").classList.toggle("showA"); });
document.addEventListener("keydown", function (e) {
  if (!$("coView").classList.contains("show")) return;
  if (e.key === "ArrowRight") coMove(1); else if (e.key === "ArrowLeft") coMove(-1); else if (e.key === "Escape") coClose(); else if (e.key === " ") { if ($("coView").classList.contains("one")) $("coView").classList.toggle("showA"); else $("coView").classList.add("one"); } else return;
  e.preventDefault(); e.stopPropagation();
}, true);

/* ---------------- importer depuis une carte SD (copie + renommage + copie de securite) ---------------- */
var IMP = (function () { try { return JSON.parse(localStorage.getItem("rp_import")) || {}; } catch (e) { return {}; } })();
function impSave() { try { localStorage.setItem("rp_import", JSON.stringify(IMP)); } catch (e) {} }
function pad(n, k) { n = String(n); while (n.length < k) n = "0" + n; return n; }
function ymd(t) { var d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2); }
function hms(t) { var d = new Date(t); return pad(d.getHours(), 2) + "-" + pad(d.getMinutes(), 2) + "-" + pad(d.getSeconds(), 2); }
async function openImport() {
  if (!N) { dialog("<h3>📥 Importer une carte</h3><p>L'import depuis une carte SD se fait dans la version PC de Regard Pur.</p><div class='row'><button class='pri' data-c='ok'>OK</button></div>"); return; }
  var card = N.sdCard ? await N.sdCard() : null; if (card) toast("Carte détectée : " + card);
  var src = await N.pickDir("Choisir la carte SD (ou le dossier à importer)", card || undefined); if (!src) return;
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
  ["Bienvenue dans Regard Pur", "Regard Pur trie vos photos pour vous : il repère les <b>floues</b>, les <b>bougées</b>, les <b>yeux fermés</b>, les <b>expositions ratées</b> et regroupe les <b>rafales</b>. Tout se passe sur votre PC, sans internet.<br><br>Le travail se fait en <b>3 étapes</b>, en haut de l'écran : <b>① Trier · ② Retoucher · ③ Exporter</b>."],
  ["① Trier", "<b>Ouvrir un dossier</b>, ou <b>Importer une carte</b> SD. L'analyse démarre toute seule.<br><b>Tri automatique</b> garde les meilleures et écarte les ratées, avec la raison écrite. Corrigez avec <b>P</b> (garder), <b>X</b> (rejeter), <b>1 à 5</b> (étoiles) : Regard Pur <b>apprend vos goûts</b>. <b>Entrée</b> : photo en grand."],
  ["② Retoucher", "Choisissez une photo dans la bande du bas : <b>retouche rapide</b> (exposition, chaleur), <b>correcteur</b> (enlever une tache ou un objet au pinceau) et <b>retouche portrait</b> (peau, yeux, dents…). Appliquez-la à la photo, à la <b>personne</b> ou à toute la <b>série</b>."],
  ["③ Exporter", "Trois choix : <b>quelles photos</b>, <b>où</b>, et si elles doivent être <b>retouchées</b> avec le rendu JM LAB PRO. Les fichiers pour <b>DxO</b> et <b>Lightroom</b> sont écrits aussi. Vos originaux ne sont jamais modifiés."],
  ["Simple ou Expert", "En haut à droite : le mode <b>Simple</b> montre l'essentiel, le mode <b>Expert</b> tous les réglages fins. Les petits <b>?</b> expliquent chaque réglage au survol, et le bouton d'aide rappelle tous les raccourcis."]
];
function guide(i) {
  i = i || 0; var g = GUIDE[i];
  dialog("<h3>" + g[0] + "</h3><p style='line-height:1.6'>" + g[1] + "</p><p class='small'>" + (i + 1) + " / " + GUIDE.length + "</p><div class='row'>" + (i ? "<button data-c='prev'>← Précédent</button>" : "<button data-c='skip'>Passer</button>") + "<button class='pri' data-c='" + (i < GUIDE.length - 1 ? "next" : "end") + "'>" + (i < GUIDE.length - 1 ? "Suivant →" : "C'est parti !") + "</button></div>",
    function (c) { if (c === "next") guide(i + 1); else if (c === "prev") guide(i - 1); try { localStorage.setItem("rp_intro", "1"); } catch (e) {} });
}

/* ---------------- fenetres de dialogue ---------------- */
var dlgCb = null;
/* repris de VISIONNEUSE_ENREGISTRE : tourner d'un quart de tour (applique a l'export, jamais a l'original),
   corbeille de Windows (recuperable), copie rapide d'une touche vers un dossier toujours le meme */
function rotate(delta) {
  var L = fixTargets(); if (!L.length) return;
  L.forEach(function (p) { p.rot = (((p.rot || 0) + delta) % 360 + 360) % 360; updCard(p); full.cache.delete(p.id); });
  saveSoon(); if ($("loupe").classList.contains("show")) rpPreview();
  toast("↻ Rotation " + (delta === 180 ? "180° (photo retournée)" : delta < 0 ? "à gauche" : "à droite") + (L.some(function (p) { return p.raw; }) ? " (RAW : appliquée à l'export JPEG seulement)" : " — appliquée à l'export, l'original n'est pas modifié"));
}
Array.prototype.forEach.call(document.querySelectorAll(".rotL,.rotR,.rot180"), function (b) { b.onclick = function () { rotate(b.classList.contains("rotL") ? -90 : b.classList.contains("rot180") ? 180 : 90); }; });
function trashSel() {
  if (!N) return; var L = fixTargets(); if (!L.length) return;
  dialog("<h3>Mettre à la corbeille ?</h3><p>" + (L.length > 1 ? L.length + " photos" : L[0].name) + " iront dans la Corbeille de Windows : vous pourrez les récupérer.</p><div class='row'><button data-c='no'>Annuler</button><button data-c='yes' class='pri'>Corbeille</button></div>", async function (c) {
    if (c !== "yes") return; var n = 0;
    for (var i = 0; i < L.length; i++) { try { await N.trash(L[i].path); n++; var j = S.photos.indexOf(L[i]); if (j >= 0) S.photos.splice(j, 1); delete S.byId[L[i].id]; S.sel.delete(L[i].id); } catch (e) {} }
    rescore(); refresh(false); drawFilters(); saveSoon(); toast(n + " photo" + (n > 1 ? "s" : "") + " à la corbeille.");
  });
}
var QC = null; try { QC = localStorage.getItem("rp_qc") || null; } catch (e) {}
async function quickCopy() {
  if (!N) return; var L = fixTargets(); if (!L.length) return;
  if (!QC) { QC = await N.pickDir("Dossier de copie rapide (choisi une seule fois)", S.dir); if (!QC) return; try { localStorage.setItem("rp_qc", QC); } catch (e) {} }
  var n = 0, dj = 0;
  for (var i = 0; i < L.length; i++) { var p = L[i]; if (p.qc) { dj++; continue; }
    try { var st = p.rot && !p.raw ? devStyle(p) : null;
      if (st && st.rotOnly) { var jpg = await developOne(p, st); await N.writeBin(join(QC, p.name.replace(/\.[^.]+$/, "") + ".jpg"), jpg); }
      else await N.copyAs(p.path, join(QC, p.name));
      p.qc = true; n++; updCard(p); } catch (e) {} }
  saveSoon(); toast((n ? n + " copiée" + (n > 1 ? "s" : "") + " vers « " + QC.split(/[\\/]/).pop() + " »" : "") + (dj ? (n ? " · " : "") + dj + " déjà copiée" + (dj > 1 ? "s" : "") : "") + " (touche S ; Maj+S pour changer de dossier)");
}
/* lieux (repris d'ARCHIVAGE_TRI_PRO), seulement a la demande : GPS -> Ville-Pays */
async function placesRun() {
  if (!N || !N.placeName) return; var L = S.photos.filter(function (p) { return p.a && p.a.exif && p.a.exif.gps && !p.place; });
  if (!L.length) { $("placeInfo").textContent = "Aucune photo avec position GPS à nommer."; return; }
  dialog("<h3>Nommer les lieux ?</h3><p>" + L.length + " photo(s) ont une position GPS. Regard Pur va demander la ville et le pays à OpenStreetMap (gratuit). <b>Internet est utilisé</b> : seules les coordonnées arrondies à environ 1 km sont envoyées, une demande par seconde ; les réponses sont gardées sur votre PC.</p><div class='row'><button data-c='no'>Annuler</button><button data-c='yes' class='pri'>Nommer les lieux</button></div>", async function (c) {
    if (c !== "yes") return; var n = 0;
    for (var i = 0; i < L.length; i++) { var g = L[i].a.exif.gps; $("placeInfo").textContent = "⏳ " + (i + 1) + " / " + L.length;
      var v = await N.placeName(g[0], g[1]); if (v) { L[i].place = v; n++; } else if (v === null && i > 2 && !n) break; }
    $("placeInfo").textContent = n ? n + " lieu(x) trouvé(s)" : "Lieux indisponibles (pas d'internet ?)"; saveSoon(); drawFilters(); showPanel();
  });
}
$("bPlaces").onclick = placesRun;
/* controle avant impression (repris d'ARCHIVAGE_TRI_PRO) : resolution effective a chaque format apres recadrage centre au
   bon rapport (bon >= 250 dpi, juste >= 150, trop petite en dessous), et visage coupe par ce recadrage */
var PRINTF = [[10, 15], [13, 18], [15, 20], [20, 30], [30, 40], [30, 45], [40, 60], [50, 75]];
function printCheck(p) {
  var a = p.a; if (!a || !a.w) return "";
  var w = a.w, h = a.h; if (p.rot === 90 || p.rot === 270) { var t = w; w = h; h = t; }
  var land = w >= h, f = bigFaces(a), out = [];
  PRINTF.forEach(function (fm) {
    var zw = land ? fm[1] : fm[0], zh = land ? fm[0] : fm[1], rz = zw / zh, rp = w / h, bx;
    if (rp > rz) { var nw = h * rz; bx = [(w - nw) / 2 / w, 0, (w + nw) / 2 / w, 1]; } else { var nh = w / rz; bx = [0, (h - nh) / 2 / h, 1, (h + nh) / 2 / h]; }
    var dpi = Math.round((bx[2] - bx[0]) * w / (zw / 2.54)), cut = f.some(function (x) { return x.x < bx[0] - 0.01 || x.y < bx[1] - 0.01 || x.x + x.w > bx[2] + 0.01 || x.y + x.h > bx[3] + 0.01; });
    out.push("<span title='" + dpi + " dpi effectifs" + (cut ? " — un visage serait coupé par le recadrage" : "") + "' style='color:" + (dpi >= 250 ? "#5fd068" : dpi >= 150 ? "#e0b84a" : "#ff6b6b") + "'>" + fm[0] + "×" + fm[1] + (dpi >= 250 ? " ✓" : dpi >= 150 ? " ≈" : " ✗") + (cut ? " ✂" : "") + "</span>");
  });
  return "<div class='expert' style='margin-top:4px'>🖨️ Tirage (cm) : " + out.join(" · ") + "<br><small>✓ bon (≥ 250 dpi) · ≈ juste · ✗ trop petite · ✂ visage coupé par le recadrage</small></div>";
}
/* style appris de Lightroom (reglages « crs: » des .xmp / JPEG exportes) et de DxO (.dop) : moyenne robuste (mediane)
   de vos reglages, convertie en reglages Regard Pur ; propose dans « Pour ce type de photo » sous le nom « Mon style » */
var MYSTYLE = null; try { MYSTYLE = JSON.parse(localStorage.getItem("rp_mystyle") || "null"); } catch (e) {}
var LRMAP = [["Exposure2012", "Exposition", 1], ["Contrast2012", "Contraste", 0.7], ["Highlights2012", "Hautes SANS GRIS", 0.7], ["Shadows2012", "Ombres", 0.7],
  ["Whites2012", "Blanc", 0.6], ["Blacks2012", "Noir", 0.6], ["Clarity2012", "Clarte", 0.6], ["Dehaze", "Dehaze", 0.6], ["Vibrance", "Vibrance", 0.7], ["Saturation", "Saturation", 0.7],
  ["IncrementalTemperature", "Temperature", 0.6], ["IncrementalTint", "Teinte", 0.6], ["PostCropVignetteAmount", "Vignette", 0.6]];
function lrParse(txt) {
  if (!txt || txt.indexOf("crs:") < 0) return null; var o = {}, n = 0;
  LRMAP.forEach(function (m) { var re = new RegExp("crs:" + m[0] + "\\s*=\\s*\"([+\\-0-9.]+)\"|<crs:" + m[0] + ">([+\\-0-9.]+)<"), r = re.exec(txt); if (r) { o[m[0]] = parseFloat(r[1] || r[2]); n++; } });
  return n ? o : null;
}
/* DxO PhotoLab (.dop) : fichier en forme de tableau Lua ; on fusionne les reglages de base (Base) et ceux que vous avez
   changes (Overrides), puis on les traduit en reglages Regard Pur (meme sens, echelle prudente) */
function luaParse(txt) {
  var i = 0, n = txt.length;
  function ws() { while (i < n && /[\s,]/.test(txt[i])) i++; }
  function val() {
    ws(); var c = txt[i];
    if (c === "{") { i++; var obj = {}, arr = [], keyed = false; for (;;) { ws(); if (txt[i] === "}") { i++; break; } if (i >= n) break;
        var m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(txt.slice(i, i + 80));
        if (m) { i += m[0].length; obj[m[1]] = val(); keyed = true; } else arr.push(val()); }
      return keyed ? obj : arr; }
    if (c === '"') { var j = i + 1, out = ""; while (j < n && txt[j] !== '"') { if (txt[j] === "\\") j++; out += txt[j++]; } i = j + 1; return out; }
    var mm = /^(true|false|-?[0-9.eE+-]+|[A-Za-z_][A-Za-z0-9_]*)/.exec(txt.slice(i, i + 40)); if (!mm) { i++; return null; } i += mm[0].length;
    return mm[0] === "true" ? true : mm[0] === "false" ? false : isNaN(+mm[0]) ? mm[0] : +mm[0];
  }
  var m0 = /Sidecar\s*=/.exec(txt); if (m0) i = m0.index + m0[0].length; return val();
}
function dopParse(txt) {
  if (!txt || txt.indexOf("Sidecar") < 0) return null; var t; try { t = luaParse(txt); } catch (e) { return null; }
  var it = t && t.Source && t.Source.Items && t.Source.Items[0], st = it && it.Settings; if (!st) return null;
  var S2 = Object.assign({}, st.Base || {}, st.Overrides || {}), o = {}, n = 0, put = function (k, v) { if (v != null && isFinite(v) && v !== 0) { o[k] = v; n++; } };
  if (S2.ExposureActive) put("Exposure2012", S2.ExposureBias);
  if (S2.ContrastControlGroupActive !== false) { put("Contrast2012", S2.ColorModeContrast); put("Clarity2012", S2.LightingV2LocalContrastAmount); }
  if (S2.ContrastEnhancementActive) { put("Contrast2012", (o.Contrast2012 || 0) + (S2.ContrastEnhancementGlobalIntensity || 0)); put("Clarity2012", (o.Clarity2012 || 0) + (S2.ContrastEnhancementMidlightIntensity || 0) * 0.5); }
  put("Vibrance", S2.VibrancyIntensity); put("Saturation", S2.ColorModeSaturation);
  if (S2.HazeRemovalActive) put("Dehaze", ((S2.DehazingValue || 0) - 0) * 0.8);
  if (S2.SelectiveTonalControlActive) { put("Highlights2012", S2.LightingV3Highlights); put("Shadows2012", S2.LightingV3Shadows); put("Blacks2012", S2.LightingV3BlackPoint); put("Whites2012", S2.LightingV3WhitePoint); }
  if (S2.LightingActive) { var li = S2.LightingV3Intensity != null ? S2.LightingV3Intensity : 25, f = /Strong/.test(S2.LightingMode || "") ? 1.6 : /Medium/.test(S2.LightingMode || "") ? 1.2 : 0.8;
    put("Shadows2012", (o.Shadows2012 || 0) + li * f); put("Highlights2012", (o.Highlights2012 || 0) - li * f * 0.6); } // Smart Lighting : debouche les ombres, garde les hautes lumieres
  if (S2.ArtisticVignettingActive) put("PostCropVignetteAmount", -(S2.ArtisticVignettingCornerAttenuation || 0));
  if (S2.ToneCurveActive && S2.ToneCurveMasterPoints && S2.ToneCurveMasterPoints.length >= 4) {
    var P = S2.ToneCurveMasterPoints, pts = []; for (var k = 0; k + 1 < P.length; k += 2) pts.push([Math.round(P[k] * 255), Math.round(P[k + 1] * 255)]);
    var lin = pts.length === 2 && pts[0][1] === 0 && pts[1][1] === 255; if (!lin) { o.__curve = pts; n++; }
  }
  return n ? o : null;
}
async function learnStyle() {
  if (!N || !N.styleFiles) return; var dir = await N.pickDir("Dossier de photos retouchées (Lightroom ou DxO)", S.dir); if (!dir) return;
  $("styleInfo").textContent = "⏳ Lecture…"; var L = await N.styleFiles(dir), vals = {}, nf = 0, src = {lr: 0, dxo: 0}, curves = [];
  for (var i = 0; i < L.length; i++) {
    var f = L[i], o = null;
    try { if (f.kind === "dop") { o = dopParse(await N.readText(f.path)); if (o) src.dxo++; }
      else { var t = f.kind === "xmp" ? await N.readText(f.path) : new TextDecoder("latin1").decode(await N.readHead(f.path, 262144)); o = lrParse(t); if (o) src.lr++; } } catch (e) {}
    if (o) { nf++; if (o.__curve) { curves.push(o.__curve); delete o.__curve; } Object.keys(o).forEach(function (k) { (vals[k] = vals[k] || []).push(o[k]); }); }
    if (i % 25 === 0) $("styleInfo").textContent = "⏳ " + (i + 1) + " / " + L.length;
  }
  if (nf < 3) { $("styleInfo").textContent = "Pas assez de photos retouchées trouvées (" + nf + ")."; return; }
  var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }, v = {};
  LRMAP.forEach(function (m) { var a = vals[m[0]]; if (!a || a.length < nf * 0.3) return; var x = med(a); if (m[0] !== "Exposure2012") x = x * m[2]; x = Math.round(x * 10) / 10; if (Math.abs(x) >= (m[0] === "Exposure2012" ? 0.1 : 2)) v[m[1]] = Math.max(-100, Math.min(100, x)); });
  // courbe des tons : mediane des courbes (lues a 5 hauteurs), si au moins un tiers des photos en a une
  var curve = null; if (curves.length >= Math.max(1, nf * 0.3)) { curve = [[0, 0]]; [64, 128, 192].forEach(function (x) { curve.push([x, Math.round(med(curves.map(function (c) { return crvLut(c)[x]; })))]); }); curve.push([255, 255]); }
  if (Object.keys(v).length === 0 && !curve) { $("styleInfo").textContent = "Vos photos n'ont pas de réglage commun à reprendre."; return; }
  MYSTYLE = {v: v, curve: curve, evIL: true, n: nf, lr: src.lr, dxo: src.dxo, date: Date.now()}; try { localStorage.setItem("rp_mystyle", JSON.stringify(MYSTYLE)); } catch (e) {}
  $("styleInfo").textContent = "Style appris sur " + nf + " photo(s) (" + (src.lr ? "Lightroom " + src.lr : "") + (src.lr && src.dxo ? ", " : "") + (src.dxo ? "DxO " + src.dxo : "") + ")";
  var p = S.byId[S.view[S.cur]]; if (p) typeShow(p);
}
$("bStyle").onclick = learnStyle;
if (MYSTYLE) setTimeout(function () { $("styleInfo").textContent = "Style appris (" + MYSTYLE.n + " photos)"; }, 0);
function dialog(html, cb) { $("dlgBox").innerHTML = html; $("dlg").classList.add("show"); dlgCb = cb || null; }
function closeDialog() { $("dlg").classList.remove("show"); }
$("dlg").addEventListener("click", function (e) {
  if (e.target === $("dlg")) { closeDialog(); return; }
  var b = e.target.closest("[data-c]"); if (!b || b.tagName === "LABEL") return;
  var c = b.dataset.c, cb = dlgCb; if (c !== "go") closeDialog(); if (cb) cb(c);
});
function help() {
  dialog("<h3>⌨️ Raccourcis clavier</h3><table>" +
    [["P", "Garder"], ["X", "Rejeter"], ["[  ]", "Tourner à gauche / à droite"], ["Suppr", "Mettre à la corbeille"], ["S", "Copie rapide (Maj+S : changer de dossier)"], ["B", "Avant / Après (Retoucher)"], ["U", "Annuler le choix (à voir)"], ["1 … 5", "Étoiles (même chiffre = enlever)"], ["← →", "Photo précédente / suivante"], ["↑ ↓", "Ligne du dessus / dessous (grille)"],
     ["Entrée", "Vue en grand"], ["Échap", "Revenir à la grille"], ["Z", "Zoom 100 % sur les yeux ou la zone nette"], ["F", "Montrer / cacher visages et zone nette"],
     ["C", "Comparer (sélection ou série)"], ["Espace", "Ouvrir / fermer la série"], ["G", "Regrouper les séries oui / non"], ["Ctrl + clic", "Sélectionner plusieurs photos"], ["Maj + clic", "Sélectionner une suite"],
     ["Ctrl + A", "Tout sélectionner"], ["Ctrl + Z", "Annuler la dernière action"]].map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("") +
    "</table><p class='small'>Score : netteté mesurée à 100 % (sur les yeux s'il y a un visage), flou de bougé, yeux fermés, exposition. Il apprend de vos choix P / X.</p><div class='row'><button data-c='lang' class='notr'>" + (window.__rpLang === "en" ? "🇫🇷 Français" : "🇬🇧 English") + "</button><button data-c='manual'>📘 Mode d'emploi (PDF)</button><button data-c='guide'>Revoir le guide</button><button class='pri' data-c='ok'>OK</button></div>", function (c) { if (c === "guide") guide(0); if (c === "manual" && N && N.openManual) N.openManual(window.__rpLang || "fr"); if (c === "lang" && window.__rpSetLang) window.__rpSetLang(window.__rpLang === "en" ? "fr" : "en"); });
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
    case "Delete": trashSel(); break;
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
      else if (l === "b" && S.tab === "retoucher") { abToggle(); }
      else if (k === "[") rotate(-90); else if (k === "]") rotate(90);
      else if (k === "S") { QC = null; try { localStorage.removeItem("rp_qc"); } catch (e2) {} quickCopy(); }
      else if (l === "s") quickCopy();
      else if (l === "f") { $("lpMarks").checked = !$("lpMarks").checked; if (inLp) showLoupe(); }
      else if (l === "g") { $("cGroup").checked = !$("cGroup").checked; S.openGroup = -1; refresh(); }
      else return;
  }
  e.preventDefault();
});

/* ---------------- les 3 etapes : TRIER · RETOUCHER · EXPORTER ---------------- */
S.tab = "trier";
function setTab(t) {
  if (t !== "trier" && !S.photos.length) { toast("Ouvrez d'abord un dossier de photos."); t = "trier"; }
  S.tab = t; document.body.classList.remove("tab-trier", "tab-retoucher", "tab-exporter"); document.body.classList.add("tab-" + t);
  Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.t === t); });
  Array.prototype.forEach.call(document.querySelectorAll(".subT"), function (d) { d.classList.toggle("on", d.dataset.for === t); });
  var L = $("loupe");
  if (t === "retoucher") {
    $("exportPage").style.display = "none"; $("grid").style.display = S.photos.length ? "grid" : "none";
    if (S.cur < 0) setCur(0);
    L.classList.add("rmode");
    if (!L.classList.contains("show")) openLoupe();
    if (!rp.open) rpToggle(); else { rpDraw(); rpPreview(); }
  } else {
    if (L.classList.contains("rmode")) { L.classList.remove("rmode"); if (rp.open) rpToggle(); if (heal.on) healToggle(); L.classList.remove("show"); full.zoom = false; }
    var ex = t === "exporter";
    $("exportPage").style.display = ex ? "block" : "none"; $("grid").style.display = !ex && S.photos.length ? "grid" : "none";
    $("empty").style.display = S.photos.length ? "none" : "flex";
    if (ex) { $("empty").style.display = "none"; openExport(); }
    else refresh(false);
  }
}
$("tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) setTab(b.dataset.t); });
$("exportPage").addEventListener("click", function (e) { var b = e.target.closest("[data-c=go]"); if (b) doExport(); if (e.target.closest("[data-c=cmpo]")) cmpOrig(); });
/* mode Simple / Expert */
function setMode(expert) { document.body.classList.toggle("simple", !expert); $("cExpert").checked = expert; try { localStorage.setItem("rp_expert", expert ? "1" : "0"); } catch (e) {} }
$("cExpert").addEventListener("change", function () { setMode(this.checked); if (rp.open) rpDraw(); });
try { setMode(localStorage.getItem("rp_expert") === "1"); } catch (e) { setMode(false); }

/* ---------------- boutons ---------------- */
$("bOpen").onclick = openFolder; $("bOpen2").onclick = openFolder; $("bImport2").onclick = openImport;
$("bAuto").onclick = function () { if (S.analysing) { toast("Attendez la fin de l'analyse…"); return; } autoCull(); };
$("bImport").onclick = openImport; $("bCompare").onclick = openCompare; $("bHelp").onclick = help; $("bStats").onclick = stats;
try { if (!localStorage.getItem("rp_intro")) setTimeout(function () { guide(0); }, 400); } catch (e) {}
setTab("trier");
updLearn();
window.__rp = {S: S, score: score, reasons: reasons, autoCull: autoCull, load: load, devStyle: devStyle, pool: function () { return pool; }, rpPreview: rpPreview, developOne: developOne, fixPhoto: fixPhoto, devShow: devShow}; window.__rp_full = function () { return full; };
})();
