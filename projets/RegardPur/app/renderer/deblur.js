// Defloutage repris de CORRECTION_FLOU_PRO (JM Dargere) : classement du flou (Laplacien a 900 px),
// taille du flou estimee depuis le score, deconvolution de Wiener (optique ou bouge) sur la luminance,
// debruitage doux, renforcement a halo borne, puis filet de securite (on refloute la correction : si elle
// ne ressemble plus a l'original, la deconvolution est annulee et remplacee par un renforcement leger).
// Calcul sur une version reduite, puis transfert du « delta de detail » a la pleine resolution.
var DEBLUR = (function () {
  var GA = -1.3859, GB = -6.2439, MA = -0.8489, MB = -0.8360, GCAP = 6, MCAP = 45, GKX = 0.05, MKX = 0.09, RESID = 3.0, WORK = 1000;
  var cache = null;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lapVar(Y, w, h) {
    var s = 0, s2 = 0, n = 0;
    for (var y = 1; y < h - 1; y++) for (var x = 1; x < w - 1; x++) { var i = y * w + x, l = Y[i - 1] + Y[i + 1] + Y[i - w] + Y[i + w] - 4 * Y[i]; s += l; s2 += l * l; n++; }
    var m = s / n; return s2 / n - m * m;
  }
  function resize(Y, w, h, nw, nh) { // moyenne par boites (reduction) ou bilineaire (agrandissement)
    var o = new Float32Array(nw * nh), fx = w / nw, fy = h / nh;
    if (fx >= 1 && fy >= 1) {
      for (var y = 0; y < nh; y++) { var y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
        for (var x = 0; x < nw; x++) { var x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx)), s = 0, c = 0;
          for (var yy = y0; yy < y1 && yy < h; yy++) for (var xx = x0; xx < x1 && xx < w; xx++) { s += Y[yy * w + xx]; c++; }
          o[y * nw + x] = s / c; } }
    } else {
      for (y = 0; y < nh; y++) { var sy = clamp((y + 0.5) * fy - 0.5, 0, h - 1), ya = Math.floor(sy), yb = Math.min(h - 1, ya + 1), ty = sy - ya;
        for (x = 0; x < nw; x++) { var sx = clamp((x + 0.5) * fx - 0.5, 0, w - 1), xa = Math.floor(sx), xb = Math.min(w - 1, xa + 1), tx = sx - xa;
          o[y * nw + x] = (Y[ya * w + xa] * (1 - tx) + Y[ya * w + xb] * tx) * (1 - ty) + (Y[yb * w + xa] * (1 - tx) + Y[yb * w + xb] * tx) * ty; } }
    }
    return o;
  }
  // FFT radix 2 en place
  function fft1(re, im, off, stride, n, inv) {
    for (var i = 1, j = 0; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
      if (i < j) { var a = off + i * stride, b = off + j * stride, t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (i = 0; i < n; i += len) { var cr = 1, ci = 0;
        for (var k = 0; k < h; k++) { var p = off + (i + k) * stride, q = p + h * stride, xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
    }
  }
  function fft2(re, im, W, H, inv) {
    for (var y = 0; y < H; y++) fft1(re, im, y * W, 1, W, inv);
    for (var x = 0; x < W; x++) fft1(re, im, x, W, H, inv);
    if (inv) { var s = 1 / (W * H); for (var i = 0; i < re.length; i++) { re[i] *= s; im[i] *= s; } }
  }
  function p2(n) { var p = 1; while (p < n) p <<= 1; return p; }
  function gaussPsf(sig) { var sz = Math.max(5, 2 * Math.round(3 * sig) + 1); if (!(sz & 1)) sz++; var k = new Float32Array(sz * sz), c = sz >> 1, s = 0;
    for (var y = 0; y < sz; y++) for (var x = 0; x < sz; x++) { var v = Math.exp(-((x - c) * (x - c) + (y - c) * (y - c)) / (2 * sig * sig)); k[y * sz + x] = v; s += v; }
    for (var i = 0; i < k.length; i++) k[i] /= s; return {k: k, n: sz}; }
  function motionPsf(len, deg) { len = Math.max(3, Math.round(len)); var sz = len + 4; if (!(sz & 1)) sz++; var k = new Float32Array(sz * sz), c = sz >> 1, a = deg * Math.PI / 180, s = 0;
    for (var i = 0; i < len * 4; i++) { var t = -len / 2 + len * i / (len * 4 - 1), x = Math.round(c + t * Math.cos(a)), y = Math.round(c + t * Math.sin(a)); if (x >= 0 && x < sz && y >= 0 && y < sz) k[y * sz + x] = 1; }
    for (i = 0; i < k.length; i++) s += k[i]; if (!s) { k[c * sz + c] = 1; s = 1; } for (i = 0; i < k.length; i++) k[i] /= s; return {k: k, n: sz}; }
  function refl(i, n) { var p = 2 * (n - 1) || 1; i = ((i % p) + p) % p; return i < n ? i : p - i; }
  // Wiener : renvoie la luminance deflouee + la fonction pour reflouer (filet de securite)
  function wiener(Y, w, h, psf, k) {
    var pad = psf.n * 2, W = p2(w + 2 * pad), H = p2(h + 2 * pad), re = new Float32Array(W * H), im = new Float32Array(W * H);
    for (var y = 0; y < H; y++) { var sy = refl(y - pad, h); for (var x = 0; x < W; x++) re[y * W + x] = Y[sy * w + refl(x - pad, w)]; }
    var pr = new Float32Array(W * H), pi = new Float32Array(W * H), c = psf.n >> 1;
    for (y = 0; y < psf.n; y++) for (x = 0; x < psf.n; x++) pr[((y - c + H) % H) * W + ((x - c + W) % W)] = psf.k[y * psf.n + x];
    fft2(re, im, W, H, false); fft2(pr, pi, W, H, false);
    for (var i = 0; i < re.length; i++) { var a = pr[i], b = pi[i], d = a * a + b * b + k, fr = re[i], fi = im[i]; re[i] = (a * fr + b * fi) / d; im[i] = (a * fi - b * fr) / d; }
    fft2(re, im, W, H, true);
    var o = new Float32Array(w * h); for (y = 0; y < h; y++) for (x = 0; x < w; x++) o[y * w + x] = clamp(re[(y + pad) * W + x + pad], 0, 255);
    return {out: o, reblur: function (Z) {
      var zr = new Float32Array(W * H), zi = new Float32Array(W * H);
      for (var y = 0; y < H; y++) { var sy = refl(y - pad, h); for (var x = 0; x < W; x++) zr[y * W + x] = Z[sy * w + refl(x - pad, w)]; }
      fft2(zr, zi, W, H, false);
      for (var i = 0; i < zr.length; i++) { var a = pr[i], b = pi[i], fr = zr[i], fi = zi[i]; zr[i] = a * fr - b * fi; zi[i] = a * fi + b * fr; }
      fft2(zr, zi, W, H, true);
      var r = new Float32Array(w * h); for (y = 0; y < h; y++) for (x = 0; x < w; x++) r[y * w + x] = clamp(zr[(y + pad) * W + x + pad], 0, 255); return r; }};
  }
  function blur(Y, w, h, r) { // flou de boite separable, deux passes (approche gaussienne)
    var a = new Float32Array(Y), b = new Float32Array(w * h);
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 0; y < h; y++) { var s = 0, n = 0; for (var x = -r; x < w + r; x++) { if (x + r < w && x + r >= 0) { s += a[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= a[y * w + x - r - 1]; n--; } if (x >= 0 && x < w) b[y * w + x] = s / n; } }
      for (x = 0; x < w; x++) { s = 0; n = 0; for (y = -r; y < h + r; y++) { if (y + r < h && y + r >= 0) { s += b[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= b[(y - r - 1) * w + x]; n--; } if (y >= 0 && y < h) a[y * w + x] = s / n; } }
    }
    return a;
  }
  function sharpen(Y, w, h, amt, mx) { var B = blur(Y, w, h, 1), o = new Float32Array(w * h); for (var i = 0; i < o.length; i++) o[i] = clamp(Y[i] + clamp((Y[i] - B[i]) * amt, -mx, mx), 0, 255); return o; }
  function denoise(Y, w, h, wt) { // bilateral 5x5 leger sur la luminance
    var st = clamp(wt / 0.12, 0, 1); if (st <= 0.02) return Y; var sc = 12 + st * 45, ss = 5 + st * 6, o = new Float32Array(w * h), R = 2;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var c = Y[y * w + x], s = 0, n = 0;
      for (var dy = -R; dy <= R; dy++) { var yy = clamp(y + dy, 0, h - 1); for (var dx = -R; dx <= R; dx++) { var v = Y[yy * w + clamp(x + dx, 0, w - 1)], d = v - c, f = Math.exp(-(dx * dx + dy * dy) / (2 * ss * ss) - d * d / (2 * sc * sc)); s += v * f; n += f; } }
      o[y * w + x] = s / n; }
    return o;
  }
  // classement : score (variance du Laplacien a 900 px), sujet net malgre un grand fond plat, direction du bouge
  function classify(Y, w, h) {
    var sw = Math.min(900, w), sh = Math.round(h * sw / w), G = sw < w ? resize(Y, w, h, sw, sh) : Y, score = lapVar(G, sw, sh);
    var jxx = 0, jyy = 0, jxy = 0;
    for (var y = 1; y < sh - 1; y++) for (var x = 1; x < sw - 1; x++) { var i = y * sw + x, gx = G[i + 1] - G[i - 1], gy = G[i + sw] - G[i - sw]; jxx += gx * gx; jyy += gy * gy; jxy += gx * gy; }
    var tr = jxx + jyy, dt = Math.sqrt((jxx - jyy) * (jxx - jyy) + 4 * jxy * jxy), l1 = (tr + dt) / 2, l2 = Math.max(1e-6, (tr - dt) / 2);
    var dir = l1 / l2, ang = 0.5 * Math.atan2(2 * jxy, jxx - jyy) * 180 / Math.PI + 90, bouge = dir > 1.6;
    var cat = score >= 110 ? "NET" : score >= 55 ? "LEGER" : score >= 22 ? (bouge ? "BOUGE" : "MOYEN") : score >= 9 ? (bouge ? "BOUGE" : "FORT") : "IRRECUPERABLE";
    if (cat !== "NET") { // nettete des 10 % de blocs les plus nets
      var B = 16, vs = [];
      for (y = 1; y + B < sh - 1; y += B) for (x = 1; x + B < sw - 1; x += B) { var s = 0, s2 = 0, n = 0;
        for (var yy = y; yy < y + B; yy++) for (var xx = x; xx < x + B; xx++) { i = yy * sw + xx; var l = G[i - 1] + G[i + 1] + G[i - sw] + G[i + sw] - 4 * G[i]; s += l; s2 += l * l; n++; }
        vs.push(s2 / n - (s / n) * (s / n)); }
      vs.sort(function (a, b) { return b - a; }); var top = vs.slice(0, Math.max(1, Math.round(vs.length * 0.1))), m = 0; top.forEach(function (v) { m += v; }); m /= top.length;
      if (m >= 110 * 2.2) { cat = "NET"; bouge = false; }
    }
    return {cat: cat, score: score, bouge: bouge, ang: ang, dir: dir};
  }
  function correct(Y, w, h, D) {
    var it = clamp((D.amt || 0) / 100, 0, 1), dn = D.dn == null ? 0.35 : D.dn, C = classify(Y, w, h), cat = C.cat;
    if (D.kind === "optique") cat = C.score >= 55 ? "LEGER" : C.score >= 22 ? "MOYEN" : "FORT";
    else if (D.kind === "bouge") cat = C.score >= 110 ? "LEGER" : "BOUGE";
    else if (cat === "NET") cat = "LEGER"; // reglage demande a la main : renforcement leger
    var ang = D.ang != null && D.ang !== "" ? +D.ang : C.ang, mult = 0.7 + 0.6 * it, res = {cat: cat, score: Math.round(C.score), ang: Math.round(((ang % 180) + 180) % 180), safe: false};
    if (cat === "LEGER") { res.Y = sharpen(Y, w, h, 0.15 + 1.15 * it, 20); return res; }
    var psf, k, st, dw, sa, rad;
    if (cat === "BOUGE" || (cat === "IRRECUPERABLE" && C.bouge)) {
      var len = clamp(Math.exp((Math.log(clamp(C.score, 1, 200)) - MB) / MA) * w, 3, MCAP) * mult; psf = motionPsf(len, ang);
      k = (cat === "BOUGE" ? 0.016 - 0.009 * it : 0.009) + MKX * clamp(len / MCAP, 0, 1.3); st = cat === "BOUGE" ? 0.45 + 0.35 * it : 0.55 + 0.3 * it;
      dw = cat === "BOUGE" ? 0.03 + 0.06 * dn : 0.07 + 0.09 * dn; sa = 0.14 + 0.12 * it; res.taille = Math.round(len);
    } else {
      var sig = clamp(Math.exp((Math.log(clamp(C.score, 1, 200)) - GB) / GA) * w, 0.5, GCAP) * mult; psf = gaussPsf(sig);
      k = (cat === "MOYEN" ? 0.026 - 0.012 * it : cat === "FORT" ? 0.022 - 0.010 * it : 0.012) + GKX * clamp(sig / GCAP, 0, 1.3);
      st = cat === "MOYEN" ? 0.40 + 0.30 * it : cat === "FORT" ? 0.45 + 0.32 * it : 0.55 + 0.3 * it;
      dw = cat === "MOYEN" ? 0.02 + 0.05 * dn : cat === "FORT" ? 0.04 + 0.07 * dn : 0.07 + 0.09 * dn; sa = cat === "MOYEN" ? 0.12 + 0.10 * it : 0.14 + 0.12 * it; res.taille = Math.round(sig * 10) / 10;
    }
    var Wn = wiener(Y, w, h, psf, k), O = new Float32Array(w * h);
    for (var i = 0; i < O.length; i++) O[i] = Y[i] * (1 - st) + Wn.out[i] * st;
    O = sharpen(denoise(O, w, h, dw), w, h, sa, 22);
    var R = Wn.reblur(O), df = 0; for (i = 0; i < R.length; i++) df += Math.abs(R[i] - Y[i]); df /= R.length; res.ecart = Math.round(df * 100) / 100;
    if (df > RESID) { res.safe = true; res.Y = sharpen(Y, w, h, 0.10 + 0.25 * it, 14); } else res.Y = O;
    return res;
  }
  // applique au canevas (en place) ; resultat garde en memoire pour ne pas recalculer a chaque reglage
  function apply(c, D) {
    if (!D || !(D.amt > 0)) return null;
    var W = c.width, H = c.height, x = c.getContext("2d", {willReadFrequently: true}), id = x.getImageData(0, 0, W, H), p = id.data, N = W * H;
    var sum = 0; for (var i = 0; i < p.length; i += 4 * 997) sum = (sum * 31 + p[i] + p[i + 1] * 3 + p[i + 2] * 7) % 1e9;
    var key = [W, H, sum, D.amt, D.kind || "", D.ang == null ? "" : D.ang].join("|"), dl, info;
    if (cache && cache.key === key) { dl = cache.dl; info = cache.info; }
    else {
      var Y = new Float32Array(N); for (i = 0; i < N; i++) Y[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
      var sc = Math.min(1, WORK / Math.max(W, H)), w = Math.max(16, Math.round(W * sc)), h = Math.max(16, Math.round(H * sc)), Ys = sc < 1 ? resize(Y, W, H, w, h) : Y;
      info = correct(Ys, w, h, D); var d = new Float32Array(w * h); for (i = 0; i < d.length; i++) d[i] = info.Y[i] - Ys[i]; delete info.Y;
      dl = sc < 1 ? resize(d, w, h, W, H) : d; cache = {key: key, dl: dl, info: info};
    }
    for (i = 0; i < N; i++) { var v = dl[i]; if (v) { p[i * 4] += v; p[i * 4 + 1] += v; p[i * 4 + 2] += v; } }
    x.putImageData(id, 0, 0);
    return info;
  }
  return {apply: apply, classify: classify, correct: correct};
})();
