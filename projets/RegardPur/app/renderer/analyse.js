/* Regard Pur - analyse d'une photo (tourne en arriere-plan, plusieurs a la fois)
   Mesures reelles :
   - nettete a 100 % sur les zones les plus detaillees (et sur les yeux s'il y a un visage) ;
   - flou de bouge : nettete tres differente selon la direction ;
   - exposition : histogramme, blancs brules, noirs bouches ;
   - visages, yeux fermes, sourire (modele MediaPipe, sans internet) ;
   - empreinte de l'image pour trouver les doublons et les rafales. */
"use strict";
importScripts("vendor/exifr.js");
var module = {exports: {}}, exports = module.exports;
var MP = null, faceLM = null, faceReady = null;
var MPERR = ""; try { importScripts("vendor/vision_bundle.js"); MP = module.exports; } catch (e) { MP = null; MPERR = String(e && e.message || e); }

/* photos HEIC (iPhone) : decodees par libheif, charge seulement si besoin */
var PORT = false;
function needPortrait() { if (!PORT) { importScripts("portrait.js"); PORT = true; } }
var HEIF = null;
async function heifLib() {
  if (HEIF) return HEIF;
  module = {exports: {}}; exports = module.exports;
  importScripts("vendor/libheif-bundle.js");
  var f = typeof module.exports === "function" ? module.exports : self.libheif, r = f();
  HEIF = r && typeof r.then === "function" ? await r : r;
  return HEIF;
}
async function heicCanvas(buf) {
  var lib = await heifLib(), dec = new lib.HeifDecoder(), imgs = dec.decode(buf);
  if (!imgs || !imgs.length) throw new Error("HEIC illisible");
  var im = imgs[0], w = im.get_width(), h = im.get_height(), c = canvas(w, h), x = c.getContext("2d"), id = x.createImageData(w, h);
  await new Promise(function (res, rej) { im.display(id, function (d) { if (d) res(); else rej(new Error("HEIC illisible")); }); });
  x.putImageData(id, 0, 0);
  imgs.forEach(function (o) { try { o.free(); } catch (e) {} });
  return c;
}

/* visages : d'abord sur toute l'image ; si rien n'est trouve, dans 5 morceaux agrandis
   (le detecteur rate les visages petits dans le cadre : portrait en pied, groupe…) */
function detectFaces(lm, bmp, W, H) {
  function run(sx, sy, sw, sh) {
    var k = Math.min(1, 1280 / Math.max(sw, sh)), c = canvas(sw * k, sh * k); c.getContext("2d").drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    var r = lm.detect(c), L = [], B = [];
    (r.faceLandmarks || []).forEach(function (pts, i) {
      L.push(pts.map(function (q) { return {x: (sx + q.x * sw) / W, y: (sy + q.y * sh) / H, z: q.z}; }));
      B.push((r.faceBlendshapes || [])[i] || {categories: []});
    });
    return {faceLandmarks: L, faceBlendshapes: B};
  }
  var res = run(0, 0, W, H);
  if (res.faceLandmarks.length) return res;
  var cw = W * 0.6, ch = H * 0.6, boxes = [];
  [[0, 0], [W - cw, 0], [0, H - ch], [W - cw, H - ch], [(W - cw) / 2, (H - ch) / 2]].forEach(function (o) {
    var r = run(o[0], o[1], cw, ch);
    r.faceLandmarks.forEach(function (pts, i) {
      var xs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.y; });
      var b = {x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys)};
      // le meme visage vu dans deux morceaux : on ne le garde qu'une fois
      var dup = boxes.some(function (o2) { var ix = Math.max(0, Math.min(b.x1, o2.x1) - Math.max(b.x0, o2.x0)), iy = Math.max(0, Math.min(b.y1, o2.y1) - Math.max(b.y0, o2.y0)); return ix * iy > 0.3 * (b.x1 - b.x0) * (b.y1 - b.y0); });
      if (dup) return; boxes.push(b);
      res.faceLandmarks.push(pts); res.faceBlendshapes.push(r.faceBlendshapes[i]);
    });
  });
  return res;
}

function initFaces() {
  if (faceReady) return faceReady;
  faceReady = (async function () {
    if (!MP) { self.postMessage({log: "module visages non charge : " + MPERR}); return null; }
    try {
      var base = new URL("vendor/wasm", self.location.href).href;
      var fs = await MP.FilesetResolver.forVisionTasks(base);
      var model = await (await fetch(new URL("vendor/face_landmarker.task", self.location.href).href)).arrayBuffer();
      faceLM = await MP.FaceLandmarker.createFromOptions(fs, {
        baseOptions: {modelAssetBuffer: new Uint8Array(model), delegate: "CPU"},
        runningMode: "IMAGE", numFaces: 6, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.45, minFacePresenceConfidence: 0.45
      });
      return faceLM;
    } catch (e) { self.postMessage({log: "visages indisponibles : " + e.message}); return null; }
  })();
  return faceReady;
}

function canvas(w, h) { return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
function grayOf(img, w, h) {
  var d = img.data, g = new Float32Array(w * h);
  for (var i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

/* nettete "largeur des bords" : sur les bords francs, quelle part du saut se fait en un seul pixel ?
   bord net -> proche de 1 ; bord flou -> proche de 1/3. Mesure dans 4 directions (pour le bouge). */
var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function edgeSharp(g, w, h) {
  var res = [];
  for (var k = 0; k < 4; k++) {
    var dx = DIRS[k][0], dy = DIRS[k][1], vals = [], spans = [];
    var y0 = dy < 0 ? 3 : 0, y1 = dy > 0 ? h - 3 : h, x1 = w - 3;
    // seuil : bords parmi les plus forts de l'image
    for (var y = y0; y < y1; y += 2) for (var x = 0; x < x1; x += 2) {
      var p = y * w + x, st = dy * w + dx, a = g[p], b = g[p + st], c = g[p + 2 * st], d = g[p + 3 * st];
      var t = d - a; if (t < 0) t = -t; if (t >= 24) spans.push(t);
    }
    if (spans.length < 30) { res.push(null); continue; }
    spans.sort(function (u, v) { return v - u; });
    var T = Math.max(24, spans[Math.min(spans.length - 1, Math.floor(spans.length * 0.15))]);
    for (y = y0; y < y1; y++) for (x = 0; x < x1; x++) {
      p = y * w + x; st = dy * w + dx; a = g[p]; b = g[p + st]; c = g[p + 2 * st]; d = g[p + 3 * st];
      var s1 = b - a, s2 = c - b, s3 = d - c, tot = d - a;
      if ((tot >= T && s1 >= 0 && s2 >= 0 && s3 >= 0) || (tot <= -T && s1 <= 0 && s2 <= 0 && s3 <= 0)) {
        var m = Math.max(Math.abs(s1), Math.abs(s2), Math.abs(s3)); vals.push(m / Math.abs(tot));
      }
    }
    if (vals.length < 20) { res.push(null); continue; }
    vals.sort(function (u, v) { return u - v; });
    // moyenne du quart superieur : les bords les plus nets de la zone (le sujet net)
    var from = Math.floor(vals.length * 0.6), s = 0; for (var i = from; i < vals.length; i++) s += vals[i];
    res.push({v: s / (vals.length - from), n: vals.length});
  }
  return res;
}
/* grandes photos (plus de 2500 px) : on mesure a 100 % et a 50 %, et on garde le meilleur des deux
   (une photo bien mise au point d'un capteur de 24 Mpx n'est jamais "piquee au pixel" a 100 %) */
function sharpOfCrop(bmp, sx, sy, sw, sh) {
  var r1 = sharpAt(bmp, sx, sy, sw, sh, 1);
  if (Math.max(bmp.width, bmp.height) <= 2500) return r1;
  var cx = sx + sw / 2, cy = sy + sh / 2, r2 = sharpAt(bmp, cx - sw, cy - sh, sw * 2, sh * 2, 0.5);
  if (!r2) return r1; if (!r1) return r2;
  var v2 = r2.v - 0.06;
  return v2 > r1.v ? {v: v2, max: r2.max - 0.06, min: r2.min - 0.06, n: r2.n} : r1;
}
function sharpAt(bmp, sx, sy, sw, sh, k) {
  sx = Math.max(0, Math.round(sx)); sy = Math.max(0, Math.round(sy));
  sw = Math.round(Math.min(sw, bmp.width - sx)); sh = Math.round(Math.min(sh, bmp.height - sy));
  var dw = Math.round(sw * k), dh = Math.round(sh * k);
  if (dw < 24 || dh < 24) return null;
  var c = canvas(dw, dh), x = c.getContext("2d", {willReadFrequently: true});
  x.imageSmoothingQuality = "high";
  x.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh); sw = dw; sh = dh;
  var g = grayOf(x.getImageData(0, 0, sw, sh), sw, sh), r = edgeSharp(g, sw, sh), ok = r.filter(Boolean);
  if (!ok.length) return null;
  // une direction sans presque aucun bord franc alors que les autres en ont : elle est floue (bouge)
  var nmax = Math.max.apply(null, ok.map(function (o) { return o.n; }));
  var vs = r.map(function (o) { return !o || o.n < nmax * 0.12 ? 0.36 : o.v; }), mx = Math.max.apply(null, vs), mn = Math.min.apply(null, vs);
  // nettete : moyenne de la direction la plus nette et de la plus floue ; bouge : ecart entre les deux
  return {v: (mx + mn) / 2, max: mx, min: mn, n: ok.reduce(function (s, o) { return s + o.n; }, 0)};
}
/* flou par « re-floutage » (Crété-Roffet, 2007) : on floute la zone et on regarde ce qui change.
   Une zone nette perd beaucoup de detail, une zone deja floue presque rien. Resultat : 0 = net, 1 = tres flou.
   La zone est d'abord ramenee a une taille fixe (ex. l'oeil a 160 px) : la mesure ne depend plus de la taille de la photo. */
function cropGray(bmp, sx, sy, sw, sh, dw) {
  sx = Math.max(0, Math.round(sx)); sy = Math.max(0, Math.round(sy)); sw = Math.round(Math.min(sw, bmp.width - sx)); sh = Math.round(Math.min(sh, bmp.height - sy));
  if (sw < 16 || sh < 16) return null;
  var k = Math.min(1, dw / sw), w = Math.max(16, Math.round(sw * k)), h = Math.max(16, Math.round(sh * k));
  var c = canvas(w, h), x = c.getContext("2d", {willReadFrequently: true}); x.imageSmoothingQuality = "high"; x.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  return {g: grayOf(x.getImageData(0, 0, w, h), w, h), w: w, h: h};
}
function creteBlur(o) {
  if (!o) return null;
  var g = o.g, w = o.w, h = o.h, R = 4, res = [];
  [[1, 0], [0, 1]].forEach(function (d) {
    var dx = d[0], dy = d[1], sF = 0, sV = 0;
    for (var y = R + 1; y < h - R; y++) for (var x = R + 1; x < w - R; x++) {
      var p = y * w + x, q = p - dy * w - dx, b1 = 0, b2 = 0;
      for (var t = -R; t <= R; t++) { b1 += g[p + t * (dy * w + dx)]; b2 += g[q + t * (dy * w + dx)]; }
      var dF = Math.abs(g[p] - g[q]), dB = Math.abs(b1 - b2) / (2 * R + 1);
      sF += dF; sV += Math.max(0, dF - dB);
    }
    res.push(sF > 0 ? (sF - sV) / sF : 1);
  });
  return Math.max(res[0], res[1]);
}
function creteScore(b) { return b == null ? null : Math.max(0, Math.min(100, Math.round((0.62 - b) / (0.62 - 0.30) * 100))); }
/* ---------- qualite d'image : bruit, pixelisation, compression, definition ---------- */
var STDQ = [16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
function jpegQuality(b) { // qualite JPEG lue dans la table de quantification du fichier (marqueur DQT)
  if (!b || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  var i = 2;
  while (i < b.length - 4 && b[i] === 0xFF) {
    var m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
    if (m === 0xDB) {
      var pq = b[i + 4] >> 4, q = [], o = i + 5;
      for (var k = 0; k < 64; k++) q.push(pq ? (b[o + 2 * k] << 8 | b[o + 2 * k + 1]) : b[o + k]);
      // la table est rangee en zigzag ; on compare les sommes (insensible a l'ordre)
      var sum = q.reduce(function (a, v) { return a + v; }, 0), best = 50, bd = Infinity;
      for (var Q = 1; Q <= 100; Q++) { var sc = Q < 50 ? 5000 / Q : 200 - 2 * Q, t = 0; for (k = 0; k < 64; k++) t += Math.max(1, Math.min(255, Math.floor((STDQ[k] * sc + 50) / 100))); var dd = Math.abs(t - sum); if (dd < bd) { bd = dd; best = Q; } }
      return best;
    }
    if (m === 0xDA) break; i += 2 + len;
  }
  return null;
}
function noiseSigma(o) { // bruit (Immerkaer 1996) : filtre qui annule les zones lisses et garde le grain
  if (!o) return null;
  var g = o.g, w = o.w, h = o.h, sum = 0, n = 0;
  for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) {
    var p = y * w + x, v = g[p - w - 1] - 2 * g[p - w] + g[p - w + 1] - 2 * g[p - 1] + 4 * g[p] - 2 * g[p + 1] + g[p + w - 1] - 2 * g[p + w] + g[p + w + 1];
    sum += Math.abs(v); n++;
  }
  return n ? Math.sqrt(Math.PI / 2) * sum / (6 * n) : null;
}
function blockiness(o) { // petits carres de compression : ecarts plus forts tous les 8 pixels
  if (!o || o.w < 64) return null;
  var g = o.g, w = o.w, h = o.h, a = 0, na = 0, b = 0, nb = 0;
  for (var y = 0; y < h; y++) for (var x = 1; x < w - 1; x++) { var d = Math.abs(g[y * w + x] - g[y * w + x - 1]); if (x % 8 === 0) { a += d; na++; } else { b += d; nb++; } }
  return nb && b > 0 ? (a / na) / (b / nb) : null;
}
function pixelStep(o) { // pixelisation : un « escalier » regulier tous les k pixels (image agrandie sans lissage)
  if (!o || o.w < 48) return 0;
  var g = o.g, w = o.w, h = o.h, best = 0;
  for (var k = 2; k <= 8; k++) {
    var acc = new Float64Array(k), cnt = new Float64Array(k);
    for (var y = 0; y < h; y += 2) for (var x = 1; x < w; x++) { var d = Math.abs(g[y * w + x] - g[y * w + x - 1]); acc[x % k] += d; cnt[x % k]++; }
    var mx = 0, rest = 0, nr = 0; for (var i = 0; i < k; i++) { var m = acc[i] / Math.max(1, cnt[i]); if (m > mx) mx = m; }
    for (i = 0; i < k; i++) { m = acc[i] / Math.max(1, cnt[i]); if (m < mx) { rest += m; nr++; } }
    rest = nr ? rest / nr : mx;
    if (mx > 2 && rest < mx * 0.25) best = Math.max(best, k);
  }
  return best;
}
function equalPairs(o) { // pixels repetes (image agrandie « au plus proche »)
  if (!o) return null;
  var g = o.g, w = o.w, h = o.h, e = 0, n = 0;
  for (var y = 0; y < h; y += 2) for (var x = 1; x < w; x++) { var d = Math.abs(g[y * w + x] - g[y * w + x - 1]); if (d > 0.5) n++; else e++; }
  return (e + n) ? e / (e + n) : null;
}
function fullCrop(bmp, cx, cy, size) { // morceau a 100 % (sans reduction)
  return cropGray(bmp, cx - size / 2, cy - size / 2, size, size, size);
}

function toScore(v) { return Math.max(0, Math.min(100, Math.round((v - 0.40) / (0.80 - 0.40) * 100))); }

/* horizon penche : parmi les bords forts, cherche une ligne longue presque horizontale (entre 0,8 et 8 degres) */
function horizonTilt(g, w, h) {
  // une vraie longue ligne droite presque horizontale (horizon, bord de mer, mur) : transformee de Hough
  var mags = [];
  for (var y = 1; y < h - 1; y += 2) for (var x = 1; x < w - 1; x += 2) {
    var p = y * w + x, gy = g[p + w] - g[p - w]; if (Math.abs(gy) > 30) mags.push(Math.abs(gy));
  }
  if (mags.length < 300) return 0;
  mags.sort(function (a, b) { return b - a; }); var T = Math.max(30, mags[Math.floor(mags.length * 0.25)]);
  var NA = 33, R = h + w, acc = new Uint16Array(NA * R), cs = [], sn = [];
  for (var k = 0; k < NA; k++) { var t = (k - 16) * 0.5 * Math.PI / 180; cs.push(Math.cos(t)); sn.push(Math.sin(t)); }
  for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x += 2) {
    p = y * w + x; var gx = g[p + 1] - g[p - 1]; gy = g[p + w] - g[p - w];
    if (Math.abs(gy) < T || Math.abs(gx) > Math.abs(gy) * 0.2) continue;   // bord presque horizontal
    for (k = 0; k < NA; k++) { var r = Math.round(y * cs[k] - x * sn[k]) + w; if (r >= 0 && r < R) acc[k * R + r]++; }
  }
  var best = 0, bk = 16; for (k = 0; k < NA; k++) for (r = 0; r < R; r++) { var v = acc[k * R + r] + (r + 1 < R ? acc[k * R + r + 1] : 0); if (v > best) { best = v; bk = k; } }
  // la ligne doit couvrir au moins un tiers de la largeur (un point sur deux est compte)
  if (best < w / 2 * 0.33) return 0;
  var ang = (bk - 16) * 0.5;
  return Math.abs(ang) >= 1 && Math.abs(ang) <= 8 ? ang : 0;
}

function dhash(g, w, h) {
  // empreinte 8x8 (difference horizontale) sur l'image reduite
  var W = 9, H = 8, s = new Float32Array(W * H);
  for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
    var x0 = Math.floor(i * w / W), x1 = Math.floor((i + 1) * w / W), y0 = Math.floor(j * h / H), y1 = Math.floor((j + 1) * h / H), t = 0, n = 0;
    for (var y = y0; y < y1; y += 2) for (var x = x0; x < x1; x += 2) { t += g[y * w + x]; n++; }
    s[j * W + i] = n ? t / n : 0;
  }
  var hex = "", nib = 0, bits = 0;
  for (j = 0; j < H; j++) for (i = 0; i < 8; i++) { nib = (nib << 1) | (s[j * W + i] < s[j * W + i + 1] ? 1 : 0); bits++; if (bits === 4) { hex += nib.toString(16); nib = 0; bits = 0; } }
  return hex;
}
function colorSig(img) {
  // couleur moyenne en 4x4 cases : aide a separer deux scenes qui se ressemblent en noir et blanc
  var d = img.data, w = img.width, h = img.height, out = [];
  for (var j = 0; j < 4; j++) for (var i = 0; i < 4; i++) {
    var r = 0, g = 0, b = 0, n = 0;
    for (var y = Math.floor(j * h / 4); y < Math.floor((j + 1) * h / 4); y += 4) for (var x = Math.floor(i * w / 4); x < Math.floor((i + 1) * w / 4); x += 4) { var p = (y * w + x) * 4; r += d[p]; g += d[p + 1]; b += d[p + 2]; n++; }
    out.push(Math.round(r / n), Math.round(g / n), Math.round(b / n));
  }
  return out;
}

async function analyse(msg) {
  var out = {id: msg.id, v: 3};
  var blob = new Blob([msg.buf], {type: "image/jpeg"});
  // informations de prise de vue
  try {
    var ex = await exifr.parse(msg.buf, {tiff: true, exif: true, gps: false, xmp: false, icc: false, iptc: false, pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "LensModel", "ISO", "ExposureTime", "FNumber", "FocalLength", "Orientation", "SubSecTimeOriginal"]});
    if (ex) {
      var dt = ex.DateTimeOriginal || ex.CreateDate;
      out.exif = {date: dt instanceof Date ? dt.getTime() + (ex.SubSecTimeOriginal ? Number("0." + ex.SubSecTimeOriginal) * 1000 : 0) : null, make: ex.Make || "", model: ex.Model || "", lens: ex.LensModel || "", iso: ex.ISO || null, speed: ex.ExposureTime || null, f: ex.FNumber || null, focal: ex.FocalLength || null};
    }
  } catch (e) {}
  var bmp;
  try { bmp = msg.heic ? await createImageBitmap(await heicCanvas(msg.buf)) : await createImageBitmap(blob, {imageOrientation: "from-image"}); }
  catch (e) { out.err = "Image illisible"; return out; }
  var W = bmp.width, H = bmp.height; out.w = W; out.h = H;
  // vignette
  var ts = Math.min(1, 480 / Math.max(W, H)), tc = canvas(W * ts, H * ts), tx = tc.getContext("2d");
  tx.imageSmoothingQuality = "high"; tx.drawImage(bmp, 0, 0, tc.width, tc.height);
  out.thumb = await tc.convertToBlob({type: "image/jpeg", quality: 0.82});
  // image d'analyse (1200 px)
  var as = Math.min(1, 1200 / Math.max(W, H)), aw = Math.round(W * as), ah = Math.round(H * as);
  var ac = canvas(aw, ah), ax = ac.getContext("2d", {willReadFrequently: true});
  ax.drawImage(bmp, 0, 0, aw, ah);
  var aimg = ax.getImageData(0, 0, aw, ah), g = grayOf(aimg, aw, ah);
  // exposition
  // un cadre uni (blanc ou noir) autour de la photo n'est pas compte
  function flatRow(y) { var s = 0, s2 = 0; for (var x = 0; x < aw; x += 2) { var v = g[y * aw + x]; s += v; s2 += v * v; } var m = s / (aw / 2); return Math.sqrt(Math.max(0, s2 / (aw / 2) - m * m)) < 6 && (m > 235 || m < 20); }
  function flatCol(x) { var s = 0, s2 = 0; for (var y = 0; y < ah; y += 2) { var v = g[y * aw + x]; s += v; s2 += v * v; } var m = s / (ah / 2); return Math.sqrt(Math.max(0, s2 / (ah / 2) - m * m)) < 6 && (m > 235 || m < 20); }
  var bt = 0, bb = ah - 1, bl = 0, br = aw - 1, lim = 0.15;
  while (bt < ah * lim && flatRow(bt)) bt++; while (bb > ah * (1 - lim) && flatRow(bb)) bb--;
  while (bl < aw * lim && flatCol(bl)) bl++; while (br > aw * (1 - lim) && flatCol(br)) br--;
  // un fin liseré dans le cadre : on le saute aussi
  if (bt || bl) { bt = Math.min(Math.round(ah * lim), bt + 6); bl = Math.min(Math.round(aw * lim), bl + 6); bb = Math.max(Math.round(ah * (1 - lim)), bb - 6); br = Math.max(Math.round(aw * (1 - lim)), br - 6); }
  out.frame = !!(bt || bl);
  var hist = new Uint32Array(64), hi = 0, lo = 0, sum = 0, n = 0;
  for (var yy = bt; yy <= bb; yy++) for (var xx = bl; xx <= br; xx++) { var v = g[yy * aw + xx]; sum += v; n++; hist[Math.min(63, v >> 2)]++; if (v >= 250) hi++; if (v <= 5) lo++; }
  n = Math.max(1, n); out.expo = {mean: Math.round(sum / n), hi: Math.round(hi / n * 1000) / 10, lo: Math.round(lo / n * 1000) / 10};
  out.hist = Array.prototype.slice.call(hist);
  out.hash = dhash(g, aw, ah); out.col = colorSig(aimg);
  out.tilt = horizonTilt(g, aw, ah);
  // zones les plus detaillees (grille 6 x 4) -> nettete mesuree a 100 % sur les 3 meilleures
  var GX = 6, GY = 4, tiles = [];
  for (var ty = 0; ty < GY; ty++) for (var tx2 = 0; tx2 < GX; tx2++) {
    var x0 = Math.floor(tx2 * aw / GX), x1 = Math.floor((tx2 + 1) * aw / GX), y0 = Math.floor(ty * ah / GY), y1 = Math.floor((ty + 1) * ah / GY), e = 0, m = 0;
    for (var y = Math.max(1, y0); y < Math.min(ah - 1, y1); y += 2) for (var x = Math.max(1, x0); x < Math.min(aw - 1, x1); x += 2) {
      var p = y * aw + x, L = 4 * g[p] - g[p - 1] - g[p + 1] - g[p - aw] - g[p + aw]; e += L * L; m++;
    }
    tiles.push({x: x0 / aw, y: y0 / ah, w: (x1 - x0) / aw, h: (y1 - y0) / ah, e: m ? e / m : 0});
  }
  tiles.sort(function (a, b) { return b.e - a.e; });
  var crop = Math.min(700, Math.max(W, H) / 4), best = null, all = [];
  for (var t = 0; t < 3; t++) {
    var T0 = tiles[t], cx = (T0.x + T0.w / 2) * W, cy = (T0.y + T0.h / 2) * H;
    var r = sharpOfCrop(bmp, cx - crop / 2, cy - crop / 2, crop, crop);
    if (r) { all.push(r); if (!best || r.v > best.v) { best = r; best.zone = {x: (cx - crop / 2) / W, y: (cy - crop / 2) / H, w: crop / W, h: crop / H}; } }
  }
  out.sharp = best ? toScore(best.v) : 0;
  // qualite d'image : bruit dans les zones unies (les moins detaillees, ni trop sombres ni brulees)
  try {
    out.mp = Math.round(W * H / 1e5) / 10; out.jq = jpegQuality(new Uint8Array(msg.buf));
    var flat = tiles.slice().sort(function (a, b) { return a.e - b.e; }).filter(function (t) {
      var x0 = Math.floor(t.x * aw), y0 = Math.floor(t.y * ah), s2 = 0, n2 = 0; for (var yy = y0; yy < y0 + t.h * ah; yy += 4) for (var xx = x0; xx < x0 + t.w * aw; xx += 4) { s2 += g[yy * aw + xx]; n2++; } var mm = s2 / Math.max(1, n2); return mm > 35 && mm < 225;
    }).slice(0, 3), sig = [];
    flat.forEach(function (t) { var sz = Math.min(256, Math.floor(Math.min(t.w * W, t.h * H))); var r = noiseSigma(fullCrop(bmp, (t.x + t.w / 2) * W, (t.y + t.h / 2) * H, sz)); if (r != null) sig.push(r); });
    sig.sort(function (a, b) { return a - b; });
    var sFull = sig.length ? sig[0] : null; // la zone la plus calme : le grain, pas un detail
    out.noise = sFull != null ? Math.round(sFull * 10) / 10 : null;
    // vu a la taille d'un ecran (2400 px), le grain se moyenne
    out.noiseView = sFull != null ? Math.round(sFull * Math.min(1, Math.sqrt(2400 / Math.max(W, H))) * 10) / 10 : null;
    // zone la plus detaillee a 100 % : carres de compression, pixels repetes, image agrandie
    var dt = tiles[0], cz = Math.min(320, Math.floor(Math.min(W, H) / 3)), oc = fullCrop(bmp, (dt.x + dt.w / 2) * W, (dt.y + dt.h / 2) * H, cz);
    out.pix = oc ? pixelStep(oc) : 0;
    var bF = creteBlur(oc), bH = creteBlur(cropGray(bmp, (dt.x + dt.w / 2) * W - cz, (dt.y + dt.h / 2) * H - cz, cz * 2, cz * 2, cz));
    out.up = bF != null && bH != null ? Math.round((bF - bH) * 100) / 100 : null; // tres flou a 100 % mais net a 50 % : photo agrandie
  } catch (e) {}
  // double verification par « re-floutage » sur la zone la plus nette, ramenee a une taille fixe
  if (best && best.zone) { var zb = creteBlur(cropGray(bmp, best.zone.x * W, best.zone.y * H, best.zone.w * W, best.zone.h * H, 360)); out.sharpBlur = zb != null ? Math.round(zb * 1000) / 1000 : null; var zc = creteScore(zb); if (zc != null) out.sharp = Math.min(out.sharp, Math.round(zc * 0.5 + out.sharp * 0.5)); }
  out.sharpRaw = best ? Math.round(best.max * 1000) / 1000 + "/" + Math.round(best.min * 1000) / 1000 : 0;
  out.zone = best ? best.zone : null;
  // bouge : toutes les zones detaillees sont nettes dans une direction mais floues dans l'autre
  if (best) { var ratio = best.min / best.max; out.motion = Math.round(Math.max(0, Math.min(100, (0.92 - ratio) / 0.35 * 100))); if (out.sharp > 75) out.motion = Math.min(out.motion, 20); }
  else out.motion = 0;
  // visages et yeux
  out.faces = [];
  if (msg.faces !== false) {
    var lm = await initFaces();
    if (lm) {
      try {
        var res = detectFaces(lm, bmp, W, H);
        (res.faceLandmarks || []).forEach(function (pts, k) {
          var minx = 1, miny = 1, maxx = 0, maxy = 0;
          pts.forEach(function (q) { if (q.x < minx) minx = q.x; if (q.y < miny) miny = q.y; if (q.x > maxx) maxx = q.x; if (q.y > maxy) maxy = q.y; });
          var bw = maxx - minx, bh = maxy - miny; if (bw * W < 40) return; // visage trop petit pour juger
          var bs = {}; (res.faceBlendshapes[k] || {categories: []}).categories.forEach(function (c) { bs[c.categoryName] = c.score; });
          var blink = Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0), blinkMin = Math.min(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0);
          var smile = ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2;
          // nettete sur la zone des yeux (points 33 et 263 = coins exterieurs des yeux)
          var ex1 = pts[33], ex2 = pts[263], eyeW = Math.abs(ex2.x - ex1.x) * W, ecx = (ex1.x + ex2.x) / 2 * W, ecy = (ex1.y + ex2.y) / 2 * H;
          var ew = Math.max(48, eyeW * 1.6), eh = Math.max(36, eyeW * 0.7);
          var es = sharpOfCrop(bmp, ecx - ew / 2, ecy - eh / 2, ew, eh);
          var ecb = creteBlur(cropGray(bmp, ecx - ew / 2, ecy - eh / 2, ew, eh, 160 * 1.6)), eCre = creteScore(ecb);
          var fs2 = sharpOfCrop(bmp, minx * W, miny * H, bw * W, bh * H), fCre = creteScore(creteBlur(cropGray(bmp, minx * W, miny * H, bw * W, bh * H, 300)));
          // visage redresse (yeux a l'horizontale) 150 x 150 : sert a reconnaitre la personne
          var le = {x: (pts[33].x + pts[133].x) / 2 * W, y: (pts[33].y + pts[133].y) / 2 * H}, re = {x: (pts[263].x + pts[362].x) / 2 * W, y: (pts[263].y + pts[362].y) / 2 * H};
          var ang = Math.atan2(re.y - le.y, re.x - le.x), fcx = (minx + bw / 2) * W, fcy = (miny + bh / 2) * H, side = Math.max(bw * W, bh * H) * 1.1;
          var ac2 = canvas(150, 150), ax2 = ac2.getContext("2d", {willReadFrequently: true});
          ax2.imageSmoothingQuality = "high"; ax2.translate(75, 75); ax2.rotate(-ang); ax2.scale(150 / side, 150 / side); ax2.drawImage(bmp, -fcx, -fcy);
          var px = ax2.getImageData(0, 0, 150, 150).data;
          var fl = 0, fn = 0; for (var fy = Math.floor((miny + bh * 0.25) * ah); fy < (miny + bh * 0.8) * ah; fy += 2) for (var fx = Math.floor((minx + bw * 0.2) * aw); fx < (minx + bw * 0.8) * aw; fx += 2) { if (fy >= 0 && fy < ah && fx >= 0 && fx < aw) { fl += g[fy * aw + fx]; fn++; } }
          var nose = pts[1], eyeMid = (le.x + re.x) / 2, eyeD = Math.max(1, Math.hypot(re.x - le.x, re.y - le.y));
          var yaw = Math.round((nose.x * W - eyeMid) / eyeD * 100) / 100;
          out.faces.push({yaw: yaw, px: px, lum: fn ? Math.round(fl / fn) : null, x: minx, y: miny, w: bw, h: bh, blink: Math.round(blink * 100) / 100, blinkMin: Math.round(blinkMin * 100) / 100,
            closed: blinkMin > 0.5, half: !(blinkMin > 0.5) && blink > 0.45, smile: Math.round(smile * 100) / 100,
            eyeSharp: eCre != null ? (es ? Math.min(toScore(es.v), eCre) : eCre) : (es ? toScore(es.v) : null), eyeBlur: ecb != null ? Math.round(ecb * 1000) / 1000 : null, eyeRatio: es ? toScore(es.v) : null, faceSharp: fs2 ? (fCre != null ? Math.min(toScore(fs2.v), fCre) : toScore(fs2.v)) : fCre});
        });
      } catch (e) { self.postMessage({log: "visages : " + e.message}); }
    }
  }
  bmp.close();
  return out;
}

/* ---------- rendu JM LAB PRO (meme moteur que l'appli : profils, ProLab, curseurs) ---------- */
var JMC = false;
function exifOf(buf) {
  // segment EXIF de la photo d'origine (JPEG), avec l'orientation remise a 1 (l'image est deja redressee)
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  var i = 2;
  while (i < buf.length - 4 && buf[i] === 0xFF) {
    var m = buf[i + 1], len = buf[i + 2] << 8 | buf[i + 3];
    if (m === 0xE1 && buf[i + 4] === 0x45 && buf[i + 5] === 0x78 && buf[i + 6] === 0x69 && buf[i + 7] === 0x66) {
      var seg = buf.slice(i, i + 2 + len), t = 10, le = seg[t] === 0x49;
      var r16 = function (o) { return le ? seg[o] | seg[o + 1] << 8 : seg[o] << 8 | seg[o + 1]; };
      var r32 = function (o) { return le ? (seg[o] | seg[o + 1] << 8 | seg[o + 2] << 16 | seg[o + 3] << 24) >>> 0 : ((seg[o] << 24) | seg[o + 1] << 16 | seg[o + 2] << 8 | seg[o + 3]) >>> 0; };
      try { var ifd = t + r32(t + 4), n = r16(ifd); for (var k = 0; k < n; k++) { var e = ifd + 2 + k * 12; if (r16(e) === 0x0112) { if (le) { seg[e + 8] = 1; seg[e + 9] = 0; } else { seg[e + 8] = 0; seg[e + 9] = 1; } } } } catch (x) {}
      return seg;
    }
    if (m === 0xDA) break; i += 2 + len;
  }
  return null;
}
/* rendu « JM LAB PRO » d'une image (en place) : correction de categorie, profil + ProLab + curseurs, peau protegee, courbe.
   Utilise a l'export (pleine resolution) ET pour l'apercu de l'etape Retoucher : meme resultat. */
var DBI = null;
function renderStyle(c, S) {
  if (!JMC) { importScripts("vendor/jmlab_core.js"); JMC = true; }
  // defloutage (CORRECTION FLOU PRO) : avant les reglages de tons, sur les pixels d'origine
  DBI = null;
  if (S.deblur && S.deblur.amt > 0) { if (typeof DEBLUR === "undefined") importScripts("deblur.js"); try { DBI = DEBLUR.apply(c, S.deblur); } catch (e) { self.postMessage({log: "defloutage : " + e.message}); } }
  var W = c.width, H = c.height, x = c.getContext("2d", {willReadFrequently: true});
  // exposition automatique ProLab : meme mesure que l'appli (image reduite a 256 px, un point sur 16)
  var aw = Math.min(256, W), ah = Math.min(256, H), ac = canvas(aw, ah), ax = ac.getContext("2d", {willReadFrequently: true}); ax.drawImage(c, 0, 0, aw, ah);
  var d = ax.getImageData(0, 0, aw, ah).data, K = 0, he = 0;
  for (var i = 0; i < d.length; i += 64) { K += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; he++; }
  var ze = he ? K / he : 128, dn = S.off || S.auto ? 0 : Math.max(-5, Math.min(5, (128 - ze) / 38)), v = S.v || {};
  // correction selon la categorie (reprise de « Vrai Regard ») : les niveaux de la photo sont amenes vers des cibles
  // (en L*, converties en niveaux d'ecran) ; elle remplace l'exposition automatique ProLab pour ne pas corriger deux fois
  var LUT = null, AU = S.auto;
  if (AU) {
    var ys = []; for (i = 0; i < d.length; i += 16) ys.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    ys.sort(function (a, b) { return a - b; });
    var pc = function (q) { return ys[Math.min(ys.length - 1, Math.floor(ys.length * q))]; };
    var toV = function (L) { var y = L > 8 ? Math.pow((L + 16) / 116, 3) : L / 903.3; return 255 * (y <= 0.0031308 ? 12.92 * y : 1.055 * Math.pow(y, 1 / 2.4) - 0.055); };
    var xs = [0, pc(0.10), pc(0.25), pc(0.50), pc(0.75), pc(0.90), 255], tg = [0].concat(AU.cibles.map(toV)).concat([255]);
    // a moitie chemin seulement : on rapproche, on n'ecrase pas le caractere de la photo
    LUT = new Float32Array(256); var evf = Math.pow(2, AU.ev || 0);
    for (var vv = 0; vv < 256; vv++) {
      var j = 1; while (j < xs.length - 1 && vv > xs[j]) j++;
      var x0 = xs[j - 1], x1 = Math.max(xs[j], x0 + 1), t = Math.max(0, Math.min(1, (vv - x0) / (x1 - x0))), y = tg[j - 1] + (tg[j] - tg[j - 1]) * t;
      LUT[vv] = Math.min(255, (vv + (y - vv) * 0.55) * evf);
    }
  }
  function isSkin(r, g, b) { var mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 40 || mx === mn || r !== mx) return 0; var h = (g - b) / (mx - mn) * 60; if (h < 0 || h > 50) return 0; var sa = (mx - mn) / mx; return sa > 0.1 && sa < 0.75 ? 1 : 0; }
  var g = function (k) { return +v[k] || 0; }, Z = (S.dose == null ? 65 : S.dose) / 100;
  var P = {off: !!S.off, hp: S.hp || 0, fe: Math.pow(2, (dn + g("Exposition") * 20 / 100 * 2.5) * Z * 0.85), le: 1 + g("Contraste") / 100 * Z * 0.9,
    Qe: g("Temperature") / 100 * 28 * Z, se: g("Teinte") / 100 * 22 * Z, c: g("Teinte"), I: g("Hautes SANS GRIS") / 100 * Z, O: g("Ombres") / 100 * Z, R: g("Vibrance") / 100 * Z,
    On: 1 + g("Saturation") / 100 * Z, He: g("Clarte") / 100 * Z, Zb: g("Noir") / 100 * Z, Zw: g("Blanc") / 100 * Z, Zd: g("Dehaze") / 100 * Z, Zv: g("Vignette") / 100 * Z,
    In: S.profile || "LABO PRO EV5", Z: Z, w: W, h: H, y0: 0};
  // par bandes, pour ne pas reserver trop de memoire d'un coup sur les grandes photos
  var band = Math.max(1, Math.floor(4000000 / W));
  for (var y = 0; y < H; y += band) {
    var bh = Math.min(band, H - y), id = x.getImageData(0, y, W, bh), px = id.data, pre = null;
    if (LUT) for (i = 0; i < px.length; i += 4) {
      var r = px[i], gg = px[i + 1], b = px[i + 2], Y = 0.299 * r + 0.587 * gg + 0.114 * b, k = LUT[Y | 0] / Math.max(1, Y);
      r *= k; gg *= k; b *= k; var wb = (AU.wb || 0) * 0.6, ti = (AU.tint || 0) * 0.35;
      px[i] = r + wb + ti * 0.8; px[i + 1] = gg - ti; px[i + 2] = b - wb + ti * 0.5;
    }
    if (S.skin) pre = new Uint8ClampedArray(px);
    if (S.jm !== false) { P.px = px; P.y0 = y; JMRUN(P); }
    // protection de la peau : le profil peut renforcer les couleurs, mais pas sur la peau (au-dela de +10 %)
    if (pre) for (i = 0; i < px.length; i += 4) {
      if (!isSkin(pre[i], pre[i + 1], pre[i + 2])) continue;
      var r0 = pre[i], g0 = pre[i + 1], b0 = pre[i + 2], s0 = (Math.max(r0, g0, b0) - Math.min(r0, g0, b0)) / Math.max(1, Math.max(r0, g0, b0));
      var r1 = px[i], g1 = px[i + 1], b1 = px[i + 2], m1 = Math.max(r1, g1, b1), s1 = (m1 - Math.min(r1, g1, b1)) / Math.max(1, m1), lim = s0 * (1 + 0.1 + (1 - S.skin) * 0.5);
      if (s1 > lim && s1 > 0) { var l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1, f = 1 - (1 - lim / s1) * S.skin; px[i] = l1 + (r1 - l1) * f; px[i + 1] = l1 + (g1 - l1) * f; px[i + 2] = l1 + (b1 - l1) * f; }
    }
    x.putImageData(id, 0, y);
  }
  // outils de JM LAB PRO : details, theatral, eclat glamour, balance des blancs, contraste des tons, HDR
  if (S.looks && JMLOOKS.lookOn(S.looks)) { var lk = JMLOOKS.looks(c, S.looks); if (lk !== c) x.drawImage(lk, 0, 0); }
  // courbe (monotone, sans rebond) appliquee a la fin, sur les trois couleurs
  // niveaux (point noir, tons moyens, point blanc) puis courbe generale et courbes rouge / vert / bleu
  var LV = null, lv = S.levels;
  if (lv && (lv.b || lv.w || lv.g)) { LV = new Uint8ClampedArray(256); var b0 = (lv.b || 0) * 1.2, w0 = 255 - (lv.w || 0) * 1.2, gm = Math.pow(2, -(lv.g || 0) / 100); for (var u = 0; u < 256; u++) LV[u] = 255 * Math.pow(Math.max(0, Math.min(1, (u - b0) / Math.max(1, w0 - b0))), gm); }
  var CM = S.curve && S.curve.length >= 2 ? curveLut(S.curve) : null, CC = S.curves || {};
  var CR = CC.r ? curveLut(CC.r) : null, CG = CC.g ? curveLut(CC.g) : null, CB = CC.b ? curveLut(CC.b) : null;
  if (LV || CM || CR || CG || CB) {
    var TR = new Uint8ClampedArray(256), TG = new Uint8ClampedArray(256), TB = new Uint8ClampedArray(256);
    for (u = 0; u < 256; u++) { var v0 = LV ? LV[u] : u; v0 = CM ? CM[v0] : v0; TR[u] = CR ? CR[v0] : v0; TG[u] = CG ? CG[v0] : v0; TB[u] = CB ? CB[v0] : v0; }
    for (y = 0; y < H; y += band) {
      var bh2 = Math.min(band, H - y), id2 = x.getImageData(0, y, W, bh2), q = id2.data;
      for (i = 0; i < q.length; i += 4) { q[i] = TR[q[i]]; q[i + 1] = TG[q[i + 1]]; q[i + 2] = TB[q[i + 2]]; }
      x.putImageData(id2, 0, y);
    }
  }
}
function curveLut(pts) { // courbe passant par les points, monotone (Fritsch-Carlson)
  pts = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
  var n = pts.length, xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }), dl = [], m = [], L = new Uint8ClampedArray(256);
  for (var i = 0; i < n - 1; i++) dl.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = dl[0]; m[n - 1] = dl[n - 2]; for (i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : (dl[i - 1] + dl[i]) / 2;
  for (i = 0; i < n - 1; i++) { if (dl[i] === 0) { m[i] = m[i + 1] = 0; continue; } var a2 = m[i] / dl[i], b2 = m[i + 1] / dl[i], h = a2 * a2 + b2 * b2; if (h > 9) { var t3 = 3 / Math.sqrt(h); m[i] = t3 * a2 * dl[i]; m[i + 1] = t3 * b2 * dl[i]; } }
  for (var v = 0; v < 256; v++) {
    if (v <= xs[0]) { L[v] = ys[0]; continue; } if (v >= xs[n - 1]) { L[v] = ys[n - 1]; continue; }
    var k = 0; while (v > xs[k + 1]) k++;
    var hh = xs[k + 1] - xs[k], t = (v - xs[k]) / hh, t2 = t * t, t4 = t2 * t;
    L[v] = (2 * t4 - 3 * t2 + 1) * ys[k] + (t4 - 2 * t2 + t) * hh * m[k] + (-2 * t4 + 3 * t2) * ys[k + 1] + (t4 - t2) * hh * m[k + 1];
  }
  return L;
}
async function develop(m) {
  if (!JMC) { importScripts("vendor/jmlab_core.js"); JMC = true; }
  var S = m.style, bmp = m.heic ? await createImageBitmap(await heicCanvas(m.buf)) : await createImageBitmap(new Blob([m.buf]), {imageOrientation: "from-image"});
  var W = bmp.width, H = bmp.height, c = canvas(W, H), x = c.getContext("2d", {willReadFrequently: true}); x.drawImage(bmp, 0, 0);
  bmp.close();
  // correcteur / suppression d'objets : avant tout le reste (meme methode que JM LAB PRO)
  if (S.heals && S.heals.length) JMHEAL(c, S.heals);
  renderStyle(c, S);
  if (S.ret) { needPortrait(); try { await portraitRetouch(c, S.ret); } catch (e) { self.postMessage({log: "retouche portrait : " + e.message}); } }
  // horizon penche : on tourne et on recadre juste ce qu'il faut pour ne pas voir de coins vides
  if (S.tilt) {
    var th = S.tilt * Math.PI / 180, cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th)), kz = Math.max((W * cs + H * sn) / W, (W * sn + H * cs) / H);
    var c2 = canvas(W, H), x2 = c2.getContext("2d"); x2.imageSmoothingQuality = "high";
    x2.translate(W / 2, H / 2); x2.rotate(-th); x2.scale(kz, kz); x2.drawImage(c, -W / 2, -H / 2); c = c2;
  }
  var out = new Uint8Array(await (await c.convertToBlob({type: "image/jpeg", quality: (S.q || 92) / 100})).arrayBuffer());
  var ex = m.heic ? null : exifOf(new Uint8Array(m.buf));
  if (ex) { var r = new Uint8Array(out.length + ex.length); r.set(out.subarray(0, 2), 0); r.set(ex, 2); r.set(out.subarray(2), 2 + ex.length); out = r; }
  return out;
}

var queue = Promise.resolve();
self.onmessage = function (e) {
  var m = e.data;
  if (m.develop) {
    queue = queue.then(function () { return develop(m); }).then(function (b) { self.postMessage({id: m.id, dev: b}, [b.buffer]); }, function (err) { self.postMessage({id: m.id, dev: null, err: String(err && err.message || err)}); });
    return;
  }
  if (m.preview) { // apercu de la retouche portrait
    queue = queue.then(async function () {
      needPortrait();
      var bm = m.heic ? await createImageBitmap(await heicCanvas(m.buf)) : await createImageBitmap(new Blob([m.buf]), {imageOrientation: "from-image"});
      var k2 = Math.min(1, (m.max || 2400) / Math.max(bm.width, bm.height)), cv = canvas(bm.width * k2, bm.height * k2); cv.getContext("2d").drawImage(bm, 0, 0, cv.width, cv.height); bm.close();
      if (m.heals && m.heals.length) { if (!JMC) { importScripts("vendor/jmlab_core.js"); JMC = true; } JMHEAL(cv, m.heals); }
      DBI = null; if (m.style) renderStyle(cv, m.style);
      var n = m.ret ? await portraitRetouch(cv, m.ret) : 0;
      if (m.style && m.style.tilt) { var th = m.style.tilt * Math.PI / 180, W2 = cv.width, H2 = cv.height, cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th)), kz = Math.max((W2 * cs + H2 * sn) / W2, (W2 * sn + H2 * cs) / H2), c3 = canvas(W2, H2), x3 = c3.getContext("2d"); x3.imageSmoothingQuality = "high"; x3.translate(W2 / 2, H2 / 2); x3.rotate(-th); x3.scale(kz, kz); x3.drawImage(cv, -W2 / 2, -H2 / 2); cv = c3; }
      return {b: await cv.convertToBlob({type: "image/jpeg", quality: 0.9}), n: n};
    }).then(function (r) { self.postMessage({id: m.id, prev: r.b, faces: r.n, db: DBI}); }, function (err) { self.postMessage({id: m.id, prev: null, err: String(err && err.message || err)}); });
    return;
  }
  if (m.faces5) { // points des visages pour la reparation des visages par IA
    queue = queue.then(async function () {
      var lm = await initFaces(); if (!lm) return [];
      var bm = m.heic ? await createImageBitmap(await heicCanvas(m.buf)) : await createImageBitmap(new Blob([m.buf]), {imageOrientation: "from-image"}), W = bm.width, H = bm.height;
      var r = detectFaces(lm, bm, W, H); bm.close();
      var avg = function (pts, ids) { var x = 0, y = 0; ids.forEach(function (i) { x += pts[i].x; y += pts[i].y; }); return [x / ids.length * W, y / ids.length * H]; };
      return r.faceLandmarks.map(function (pts) {
        var e = [avg(pts, [468, 469, 470, 471, 472]), avg(pts, [473, 474, 475, 476, 477])].sort(function (a, b) { return a[0] - b[0]; });
        var mo = [[pts[61].x * W, pts[61].y * H], [pts[291].x * W, pts[291].y * H]].sort(function (a, b) { return a[0] - b[0]; });
        return [e[0], e[1], [pts[1].x * W, pts[1].y * H], mo[0], mo[1]];
      }).filter(function (f) { return Math.hypot(f[1][0] - f[0][0], f[1][1] - f[0][1]) >= 18; });
    }).then(function (f) { self.postMessage({id: m.id, faces5: f}); }, function (err) { self.postMessage({id: m.id, faces5: [], err: String(err && err.message || err)}); });
    return;
  }
  if (m.exifjoin) { // JPEG produit par l'IA : on y remet les informations de prise de vue de l'original
    var ej = new Uint8Array(m.jpg), ex2 = m.orig ? exifOf(new Uint8Array(m.orig)) : null;
    if (ex2) { var rj = new Uint8Array(ej.length + ex2.length); rj.set(ej.subarray(0, 2), 0); rj.set(ex2, 2); rj.set(ej.subarray(2), 2 + ex2.length); ej = rj; }
    self.postMessage({id: m.id, joined: ej}, [ej.buffer]); return;
  }
  if (m.full) { // image en grand pour une photo HEIC
    queue = queue.then(function () { return heicCanvas(m.buf).then(function (c) { return c.convertToBlob({type: "image/jpeg", quality: 0.92}); }); })
      .then(function (b) { self.postMessage({id: m.id, full: b}); }, function (err) { self.postMessage({id: m.id, full: null, err: String(err && err.message || err)}); });
    return;
  }
  if (m.init) { initFaces().then(function (l) { self.postMessage({ready: true, faces: !!l}); }); return; }
  queue = queue.then(function () { return analyse(m); }).then(function (r) { self.postMessage(r); }, function (err) { self.postMessage({id: m.id, err: String(err && err.message || err)}); });
};
