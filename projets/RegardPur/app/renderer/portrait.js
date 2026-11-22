/* Regard Pur - RETOUCHE PORTRAIT (charge dans l'assistant d'analyse, sans internet)
   S'appuie sur les 478 points du visage (MediaPipe) et sur la separation peau / cheveux / vetements / fond.
   Reglages de 0 a 100 :
     peau (lissage qui garde le grain), acne, taches, rousseur, cernes, sourire (rides du sourire), front,
     yeux (blanc des yeux), iris, dents, levres, eclat (visage plus lumineux et relief), fondFlou, fondSombre, fondGris */
"use strict";
var SEG = null;
function initSeg() {
  if (SEG) return SEG;
  SEG = (async function () {
    if (!MP || !MP.ImageSegmenter) return null;
    try {
      var fs = await MP.FilesetResolver.forVisionTasks(new URL("vendor/wasm", self.location.href).href);
      var buf = await (await fetch(new URL("vendor/selfie_multiclass.tflite", self.location.href).href)).arrayBuffer();
      return await MP.ImageSegmenter.createFromOptions(fs, {baseOptions: {modelAssetBuffer: new Uint8Array(buf), delegate: "CPU"}, runningMode: "IMAGE", outputCategoryMask: true, outputConfidenceMasks: false});
    } catch (e) { self.postMessage({log: "separation indisponible : " + e.message}); return null; }
  })();
  return SEG;
}
/* contour ferme a partir des liaisons de MediaPipe */
function loop(conn, pts, W, H) {
  var nx = {}; conn.forEach(function (c) { nx[c.start] = c.end; });
  var s = conn[0].start, out = [], k = s, n = 0;
  do { out.push([pts[k].x * W, pts[k].y * H]); k = nx[k]; n++; } while (k !== undefined && k !== s && n < 200);
  return out;
}
var BROW_L = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46], BROW_R = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
var INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
function blurOf(src, w, h, r) {
  var c = canvas(w, h), x = c.getContext("2d", {willReadFrequently: true});
  if (r > 0.3) { x.filter = "blur(" + r.toFixed(1) + "px)"; }
  // bords : on etend l'image pour que le flou ne fonce pas les bords
  x.drawImage(src, 0, 0);
  return x.getImageData(0, 0, w, h).data;
}
function maskOf(w, h, draw, feather) {
  var c = canvas(w, h), x = c.getContext("2d", {willReadFrequently: true});
  x.fillStyle = "#fff"; x.strokeStyle = "#fff"; if (feather > 0.3) x.filter = "blur(" + feather.toFixed(1) + "px)";
  draw(x);
  var d = x.getImageData(0, 0, w, h).data, m = new Float32Array(w * h);
  for (var i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}
function poly(x, pts, ox, oy, mode) { x.beginPath(); pts.forEach(function (p, i) { if (i) x.lineTo(p[0] - ox, p[1] - oy); else x.moveTo(p[0] - ox, p[1] - oy); }); x.closePath(); if (mode === "cut") { x.save(); x.globalCompositeOperation = "destination-out"; x.fill(); x.restore(); } else x.fill(); }
function ell(x, cx, cy, rx, ry, a) { x.beginPath(); x.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), a || 0, 0, Math.PI * 2); x.fill(); }

async function portraitRetouch(c, R) {
  var W = c.width, H = c.height, k = function (n) { return Math.max(0, Math.min(100, R[n] || 0)) / 100; };
  var lm = await initFaces(); if (!lm) return 0;
  // apercu : visages et silhouette de la photo en cours gardes en memoire (bouger un curseur ne les recherche plus)
  var pk = self.PRKEY ? self.PRKEY + "|" + W + "x" + H : null, hit = pk && self.PRC && self.PRC.key === pk ? self.PRC : null;
  var res = hit ? hit.res : detectFaces(lm, c, W, H), faces = res.faceLandmarks || [];
  if (pk && !hit) self.PRC = hit = {key: pk, res: res};
  var F = MP.FaceLandmarker, ctx = c.getContext("2d", {willReadFrequently: true});
  // separation : peau du visage et du corps, fond
  var segData = null, sw = 0, sh = 0;
  var needSeg = k("peau") > 0 || k("fondFlou") > 0 || k("fondSombre") > 0 || k("fondGris") > 0;
  if (needSeg && hit && hit.seg) { segData = hit.seg; sw = hit.sw; sh = hit.sh; }
  else if (needSeg) {
    var sg = await initSeg();
    if (sg) {
      var ss = Math.min(1, 768 / Math.max(W, H)); sw = Math.round(W * ss); sh = Math.round(H * ss);
      var sc = canvas(sw, sh); sc.getContext("2d").drawImage(c, 0, 0, sw, sh);
      try { var r = sg.segment(sc); segData = r.categoryMask.getAsUint8Array().slice(); r.categoryMask.close(); } catch (e) { segData = null; }
      if (hit && segData) { hit.seg = segData; hit.sw = sw; hit.sh = sh; }
    }
  }
  function segCanvas(cats) { // masque de la separation, a la taille de l'image
    var m = canvas(sw, sh), mx = m.getContext("2d"), id = mx.createImageData(sw, sh);
    for (var i = 0; i < segData.length; i++) if (cats.indexOf(segData[i]) >= 0) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = 255; }
    mx.putImageData(id, 0, 0); return m;
  }
  var done = 0;
  faces.forEach(function (pts) {
    var xs = pts.map(function (p) { return p.x * W; }), ys = pts.map(function (p) { return p.y * H; });
    var fx0 = Math.min.apply(null, xs), fx1 = Math.max.apply(null, xs), fy0 = Math.min.apply(null, ys), fy1 = Math.max.apply(null, ys), fw = fx1 - fx0;
    if (fw < 60) return; // visage trop petit : rien a retoucher
    var mg = fw * 0.25, ox = Math.max(0, Math.floor(fx0 - mg)), oy = Math.max(0, Math.floor(fy0 - mg * 1.4)), w = Math.min(W, Math.ceil(fx1 + mg)) - ox, h = Math.min(H, Math.ceil(fy1 + mg)) - oy;
    var u = fw / 100; // unite : 1 % de la largeur du visage
    var reg = canvas(w, h), rx = reg.getContext("2d", {willReadFrequently: true}); rx.drawImage(c, ox, oy, w, h, 0, 0, w, h);
    var id = rx.getImageData(0, 0, w, h), o = id.data;
    var fine = blurOf(reg, w, h, u * 0.6), mid = blurOf(reg, w, h, u * 1.6), coarse = blurOf(reg, w, h, u * 3.2), big = blurOf(reg, w, h, u * 8);
    var oval = loop(F.FACE_LANDMARKS_FACE_OVAL, pts, W, H), le = loop(F.FACE_LANDMARKS_LEFT_EYE, pts, W, H), re = loop(F.FACE_LANDMARKS_RIGHT_EYE, pts, W, H);
    var lb = loop(F.FACE_LANDMARKS_LEFT_EYEBROW, pts, W, H), rb = loop(F.FACE_LANDMARKS_RIGHT_EYEBROW, pts, W, H), lips = loop(F.FACE_LANDMARKS_LIPS, pts, W, H);
    var inner = INNER_LIPS.map(function (i) { return [pts[i].x * W, pts[i].y * H]; });
    // peau : separation (peau visage + corps) ou, a defaut, ovale du visage ; jamais les yeux, sourcils, levres
    var skin = maskOf(w, h, function (x) {
      if (segData) { x.drawImage(segCanvas([2, 3]), ox * sw / W, oy * sh / H, w * sw / W, h * sh / H, 0, 0, w, h); }
      else poly(x, oval, ox, oy);
      x.filter = "blur(" + (u * 1.2).toFixed(1) + "px)";
      [le, re, lips].forEach(function (pp) { x.save(); x.lineWidth = u * 2.5; x.globalCompositeOperation = "destination-out"; x.beginPath(); pp.forEach(function (p, i) { if (i) x.lineTo(p[0] - ox, p[1] - oy); else x.moveTo(p[0] - ox, p[1] - oy); }); x.closePath(); x.fill(); x.stroke(); x.restore(); });
      // narines et ailes du nez : on garde leur relief
      x.save(); x.globalCompositeOperation = "destination-out";
      var na = pts[98], nb = pts[327], nt = pts[2], nw = Math.hypot((nb.x - na.x) * W, (nb.y - na.y) * H);
      x.beginPath(); x.ellipse(((na.x + nb.x) / 2 * 0.6 + nt.x * 0.4) * W - ox, ((na.y + nb.y) / 2 * 0.6 + nt.y * 0.4) * H - oy, nw * 0.68, nw * 0.32, Math.atan2((nb.y - na.y) * H, (nb.x - na.x) * W), 0, Math.PI * 2); x.fill(); x.restore();
      // sourcils : large bande le long de chaque sourcil (les points ne forment pas un contour ferme)
      [BROW_L, BROW_R].forEach(function (ids) { x.save(); x.lineWidth = u * 7; x.lineCap = "round"; x.lineJoin = "round"; x.globalCompositeOperation = "destination-out"; x.beginPath(); ids.forEach(function (k2, i) { var q = pts[k2]; if (i) x.lineTo(q.x * W - ox, q.y * H - oy); else x.moveTo(q.x * W - ox, q.y * H - oy); }); x.stroke(); x.restore(); });
    }, u * 0.8);
    var faceM = maskOf(w, h, function (x) { poly(x, oval, ox, oy); }, u * 3);
    // zones de rides
    var P = function (i) { return [pts[i].x * W - ox, pts[i].y * H - oy]; }, cen = function (pp) { var a = [0, 0]; pp.forEach(function (p) { a[0] += p[0]; a[1] += p[1]; }); return [a[0] / pp.length - ox, a[1] / pp.length - oy]; };
    var lec = cen(le), rec = cen(re), ew = Math.hypot(P(263)[0] - P(362)[0], P(263)[1] - P(362)[1]);
    var cernes = maskOf(w, h, function (x) { [lec, rec].forEach(function (e) { ell(x, e[0], e[1] + ew * 0.42, ew * 0.62, ew * 0.26); }); }, u * 2.5);
    var sourire = maskOf(w, h, function (x) { [[P(129), P(61)], [P(358), P(291)]].forEach(function (s2) { var a = s2[0], b = s2[1], ang = Math.atan2(b[1] - a[1], b[0] - a[0]); ell(x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.62, ew * 0.22, ang); }); }, u * 2.5);
    var front = maskOf(w, h, function (x) { var t = P(10), b1 = P(105), b2 = P(334), my = (b1[1] + b2[1]) / 2; ell(x, (b1[0] + b2[0]) / 2, (t[1] + my) / 2 + (my - t[1]) * 0.05, fw * 0.34, Math.max(4, (my - t[1]) * 0.42)); }, u * 3);
    // yeux, iris, dents, levres
    var eyes = maskOf(w, h, function (x) { poly(x, le, ox, oy); poly(x, re, ox, oy); }, u * 0.4);
    var iris = maskOf(w, h, function (x) { [[468, 469, 471], [473, 474, 476]].forEach(function (q) { var cc = P(q[0]), rr = Math.hypot(P(q[1])[0] - P(q[2])[0], P(q[1])[1] - P(q[2])[1]) / 2; ell(x, cc[0], cc[1], rr * 1.05, rr * 1.05); }); }, u * 0.3);
    var teeth = maskOf(w, h, function (x) { poly(x, inner, ox, oy); }, u * 0.3);
    var lipM = maskOf(w, h, function (x) { poly(x, lips, ox, oy); poly(x, inner, ox, oy, "cut"); }, u * 0.5);
    var sP = k("peau"), sA = k("acne"), sT = k("taches"), sR = k("rousseur"), sC = k("cernes"), sS = k("sourire"), sF = k("front"), sY = k("yeux"), sI = k("iris"), sD = k("dents"), sL = k("levres"), sE = k("eclat");
    for (var i = 0, j = 0; i < o.length; i += 4, j++) {
      var m = skin[j], fm = faceM[j];
      for (var ch = 0; ch < 3; ch++) {
        var p = i + ch, v = o[p], f = fine[p], md = mid[p], cr = coarse[p], bg = big[p];
        if (m > 0.01) {
          // boutons et taches : petits points plus sombres que la peau autour
          var dA = md - f, dT = bg - md, dR = cr - f;
          // un vrai bouton ou une tache est discret : les points tres sombres (narines, grains de beaute marques, bijoux) sont gardes
          if (sA && dA > 3 && dA < 34) v += (md - v) * Math.min(1, (dA - 3) / 6) * Math.min(1, (34 - dA) / 10) * sA * m;
          if (sT && dT > 5 && dT < 45) v += (bg - v) * Math.min(1, (dT - 5) / 10) * Math.min(1, (45 - dT) / 12) * sT * m * 0.9;
          if (sR && dR > 1.5) v += (cr - v) * Math.min(1, (dR - 1.5) / 5) * sR * m * 0.7;
          // lissage : on retire les marbrures (moyennes frequences) mais on garde le grain fin
          // et tous les vrais contours (narines, levres, bijoux) : plus l'ecart est fort, moins on y touche
          var dd = f - cr, keep = 1 / (1 + (dd * dd) / 110);
          v -= dd * sP * 0.85 * m * keep;
          var z = cernes[j] * sC + sourire[j] * sS + front[j] * sF;
          if (z > 0) { z = Math.min(1, z) * m; var kz = 1 / (1 + (dd * dd) / 260); v -= (dd * 0.9 + (v - f) * 0.35) * z * kz; if (cernes[j] * sC > 0) v += Math.max(0, cr - v) * cernes[j] * sC * 0.5 * kz; }
        }
        // eclat : relief local et lumiere sur le visage
        if (sE && fm > 0.01) v += ((v - bg) * 0.45 + 6) * sE * fm;
        o[p] = v;
      }
      var r = o[i], g = o[i + 1], b = o[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
      // blanc des yeux : plus clair, moins rouge (hors iris)
      var ey = eyes[j] * (1 - iris[j]);
      if (sY && ey > 0.01 && l > 60) { var t = ey * sY; r = r + (l - r) * t * 0.6 + (255 - l) * t * 0.18; g = g + (l - g) * t * 0.6 + (255 - l) * t * 0.18; b = b + (l - b) * t * 0.6 + (255 - l) * t * 0.18; }
      // iris : plus net et un peu plus lumineux
      if (sI && iris[j] > 0.01) { var ti = iris[j] * sI; r += (r - fine[i]) * ti * 1.4 + r * 0.08 * ti; g += (g - fine[i + 1]) * ti * 1.4 + g * 0.08 * ti; b += (b - fine[i + 2]) * ti * 1.4 + b * 0.08 * ti; }
      // dents : seulement les zones claires dans la bouche ; on enleve le jaune
      if (sD && teeth[j] > 0.01 && l > 80) { var td = teeth[j] * sD; r += (l * 1.04 - r) * td * 0.55; g += (l * 1.04 - g) * td * 0.55; b += (l * 1.06 - b) * td * 0.75; }
      // levres : couleur ravivee
      if (sL && lipM[j] > 0.01) { var tl = lipM[j] * sL * 0.45; r += (r - l) * tl; g += (g - l) * tl; b += (b - l) * tl; }
      o[i] = r; o[i + 1] = g; o[i + 2] = b;
    }
    rx.putImageData(id, 0, 0); ctx.drawImage(reg, ox, oy); done++;
  });
  // arriere-plan
  var bF = k("fondFlou"), bS = k("fondSombre"), bG = k("fondGris");
  if (segData && (bF || bS || bG)) {
    var mk = canvas(W, H), mkx = mk.getContext("2d", {willReadFrequently: true}); mkx.filter = "blur(" + Math.max(2, W / 400).toFixed(1) + "px)"; mkx.drawImage(segCanvas([0]), 0, 0, W, H);
    var src = canvas(W, H), sx = src.getContext("2d", {willReadFrequently: true});
    if (bF) { var q = 0.25, sm = canvas(W * q, H * q), smx = sm.getContext("2d"); smx.filter = "blur(" + (W * q / 120 * (0.5 + bF)).toFixed(1) + "px)"; smx.drawImage(c, 0, 0, sm.width, sm.height); sx.imageSmoothingQuality = "high"; sx.drawImage(sm, 0, 0, W, H); }
    else sx.drawImage(c, 0, 0);
    var band = Math.max(1, Math.floor(3000000 / W));
    for (var y = 0; y < H; y += band) {
      var bh = Math.min(band, H - y), A = ctx.getImageData(0, y, W, bh), B = sx.getImageData(0, y, W, bh), M = mkx.getImageData(0, y, W, bh), a = A.data, bb = B.data, mm = M.data;
      for (i = 0; i < a.length; i += 4) {
        var t2 = mm[i + 3] / 255 * (mm[i] / 255); if (t2 < 0.01) continue;
        var R2 = bF ? a[i] + (bb[i] - a[i]) * t2 : a[i], G2 = bF ? a[i + 1] + (bb[i + 1] - a[i + 1]) * t2 : a[i + 1], B2 = bF ? a[i + 2] + (bb[i + 2] - a[i + 2]) * t2 : a[i + 2];
        var L2 = 0.299 * R2 + 0.587 * G2 + 0.114 * B2, gm = 1 - bG * t2 * 0.85, dm = 1 - bS * t2 * 0.45;
        a[i] = (L2 + (R2 - L2) * gm) * dm; a[i + 1] = (L2 + (G2 - L2) * gm) * dm; a[i + 2] = (L2 + (B2 - L2) * gm) * dm;
      }
      ctx.putImageData(A, 0, y);
    }
  }
  return done;
}
