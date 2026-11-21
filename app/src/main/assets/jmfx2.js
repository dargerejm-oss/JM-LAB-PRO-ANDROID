/* JM LAB PRO - RETOUCHES, COURBES, RECADRAGE LIBRE, CORRECTEUR
   Branche dans le rendu des effets (jmfx.js) :
   - avant les effets : correcteur (photo seule), courbes, rotation / recadrage (photo seule)
   Les courbes s'appliquent aussi au lot ; correcteur et recadrage seulement a la photo ouverte. */
(function(){
"use strict";
/* meme choix de langue que jmlang.js (ce fichier est charge avant lui) */
var EN = !/^fr/i.test(navigator.language || "fr"); try{ var fl = localStorage.getItem("jms_lang"); if(fl === "fr" || fl === "en") EN = fl === "en"; }catch(e){}
function T(fr, en){ return EN ? en : fr; }
function $(id){ return document.getElementById(id); }
function cvs(w, h){ var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/* ---------- correction automatique ProLab : activee / desactivee (memorise) ---------- */
try{ window.__jmsProLabOff = localStorage.getItem("jms_prolab") === "off"; }catch(e){ window.__jmsProLabOff = false; }

/* ---------- etat ---------- */
var KEY = "jms_fx2";
var D = {curve:{m:[[0,0],[255,255]], r:[[0,0],[255,255]], g:[[0,0],[255,255]], b:[[0,0],[255,255]]}, halo:0, leak:0, leakPos:"tl", dust:0, border:"", date:false};
function get(){ try{ var o = JSON.parse(localStorage.getItem(KEY) || "{}"); var r = Object.assign({}, D, o); r.curve = Object.assign({}, D.curve, o.curve || {}); return r; }catch(e){ return JSON.parse(JSON.stringify(D)); } }
function put(o){ try{ localStorage.setItem(KEY, JSON.stringify(o)); }catch(e){} }
/* propres a la photo ouverte (remis a zero a chaque nouvelle photo) */
var geo = {r90:0, flip:false, rot:0, crop:null};   /* crop = {x,y,w,h} en fractions */
var heals = [];                                     /* correcteur : traits {r, pts} en fractions */
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple){ geo = {r90:0, flip:false, rot:0, crop:null}; heals = []; bar(); } }, true);

function isLin(p){ return p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255; }
function curveOn(s){ return !(isLin(s.curve.m) && isLin(s.curve.r) && isLin(s.curve.g) && isLin(s.curve.b)); }
function geoOn(){ return !!(geo.r90 || geo.flip || geo.rot || geo.crop); }
function active(Q){ var s = get(); return curveOn(s) || lookOn(s) || !!(Q && Q.single && (geoOn() || heals.length || localOn() || dblOn())); }
function summary(){
  var s = get(), a = [];
  if(curveOn(s)) a.push(T("courbes", "curves"));
  if(wbOn(s)) a.push(T("balance des blancs", "white balance"));
  if(toneOn(s)) a.push(T("contraste des tons", "tonal contrast"));
  if(hdrOn(s)) a.push("HDR");
  if(detailsOn(s)) a.push(T("détails", "details"));
  if(dramaOn(s)) a.push(T("théâtral", "drama"));
  if(glowOn(s)) a.push(T("éclat glamour", "glamour glow"));
  return a.join(" • ");
}

/* ---------- courbes : interpolation monotone -> table 256 valeurs ---------- */
function lut(pts){
  var p = pts.slice().sort(function(a, b){ return a[0] - b[0]; }), n = p.length, out = new Uint8ClampedArray(256);
  if(n < 2){ for(var i = 0; i < 256; i++) out[i] = i; return out; }
  var dx = [], dy = [], m = [], t = [];
  for(var i = 0; i < n - 1; i++){ dx.push(Math.max(1e-6, p[i+1][0] - p[i][0])); dy.push(p[i+1][1] - p[i][1]); m.push(dy[i] / dx[i]); }
  t.push(m[0]);
  for(var i = 1; i < n - 1; i++) t.push(m[i-1] * m[i] <= 0 ? 0 : (m[i-1] + m[i]) / 2);
  t.push(m[n-2]);
  for(var i = 0; i < n - 1; i++){
    if(m[i] === 0){ t[i] = t[i+1] = 0; continue; }
    var a = t[i] / m[i], b = t[i+1] / m[i], h = a * a + b * b;
    if(h > 9){ var k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i+1] = k * b * m[i]; }
  }
  for(var x = 0; x < 256; x++){
    var j = 0; if(x <= p[0][0]){ out[x] = p[0][1]; continue; } if(x >= p[n-1][0]){ out[x] = p[n-1][1]; continue; }
    while(j < n - 2 && x > p[j+1][0]) j++;
    var hh = dx[j], s = (x - p[j][0]) / hh, s2 = s * s, s3 = s2 * s;
    out[x] = (2*s3 - 3*s2 + 1) * p[j][1] + (s3 - 2*s2 + s) * hh * t[j] + (-2*s3 + 3*s2) * p[j+1][1] + (s3 - s2) * hh * t[j+1];
  }
  return out;
}
function applyCurves(ctx, w, h, s){
  var M = lut(s.curve.m), R = lut(s.curve.r), G = lut(s.curve.g), B = lut(s.curve.b);
  var LR = new Uint8ClampedArray(256), LG = new Uint8ClampedArray(256), LB = new Uint8ClampedArray(256);
  for(var i = 0; i < 256; i++){ LR[i] = R[M[i]]; LG[i] = G[M[i]]; LB[i] = B[M[i]]; }
  var step = Math.max(1, Math.floor(4e6 / w));        /* par bandes pour limiter la memoire */
  for(var y = 0; y < h; y += step){
    var hh = Math.min(step, h - y), id = ctx.getImageData(0, y, w, hh), d = id.data;
    for(var k = 0; k < d.length; k += 4){ d[k] = LR[d[k]]; d[k+1] = LG[d[k+1]]; d[k+2] = LB[d[k+2]]; }
    ctx.putImageData(id, 0, y);
  }
}

/* ---------- rotation / recadrage ---------- */
function geometry(src, g){
  var w = src.width, h = src.height, q = ((g.r90 % 4) + 4) % 4, W = q % 2 ? h : w, H = q % 2 ? w : h;
  var c = cvs(W, H), x = c.getContext("2d"), th = (g.rot || 0) * Math.PI / 180;
  var k = th ? Math.abs(Math.cos(th)) + Math.abs(Math.sin(th)) * Math.max(W / H, H / W) : 1;   /* zoom pour ne pas voir de coins vides */
  x.imageSmoothingQuality = "high";
  x.translate(W / 2, H / 2); x.rotate(th); x.scale(k * (g.flip ? -1 : 1), k); x.rotate(q * Math.PI / 2);
  x.drawImage(src, -w / 2, -h / 2);
  if(!g.crop) return c;
  var cr = g.crop, cw = Math.max(1, Math.round(cr.w * W)), ch = Math.max(1, Math.round(cr.h * H)), ox = Math.round(cr.x * W), oy = Math.round(cr.y * H);
  if(cr.ratio){   /* format impose : proportion exacte sur la vraie photo */
    var rr = cr.ratio < 0 ? W / H : cr.ratio, mx = ox + cw / 2, my = oy + ch / 2;
    if(cw / ch > rr) cw = Math.round(ch * rr); else ch = Math.round(cw / rr);
    ox = Math.round(Math.max(0, Math.min(W - cw, mx - cw / 2))); oy = Math.round(Math.max(0, Math.min(H - ch, my - ch / 2)));
  }
  var o = cvs(cw, ch);
  o.getContext("2d").drawImage(c, ox, oy, cw, ch, 0, 0, cw, ch);
  return o;
}

/* ---------- correcteur (comme Snapseed) : on peint la zone, elle est reconstruite avec la matiere voisine ----------
   Methode : remplissage multi-echelle par correspondance de morceaux (PatchMatch + vote), proche du
   "remplissage selon le contenu". Travail sur une petite fenetre autour du trait. */
function rng(seed){ var s = seed >>> 0 || 1; return function(){ s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function inpaint(img, hole, w, h, seed){
  var R = rng(seed || 12345), HALF = 3;
  /* pyramide */
  var lv = [{img:img, hole:hole, w:w, h:h}];
  while(true){
    var L = lv[lv.length - 1], hx0 = L.w, hx1 = -1, hy0 = L.h, hy1 = -1;
    for(var i = 0; i < L.w * L.h; i++) if(L.hole[i]){ var x = i % L.w, y = (i / L.w) | 0; if(x < hx0) hx0 = x; if(x > hx1) hx1 = x; if(y < hy0) hy0 = y; if(y > hy1) hy1 = y; }
    if(hx1 < 0) return img;
    if(Math.max(hx1 - hx0, hy1 - hy0) <= 8 || L.w < 40 || L.h < 40 || lv.length > 6) break;
    var w2 = L.w >> 1, h2 = L.h >> 1, im2 = new Float32Array(w2 * h2 * 3), ho2 = new Uint8Array(w2 * h2);
    for(var y = 0; y < h2; y++) for(var x = 0; x < w2; x++){
      var o = y * w2 + x, a = (2*y) * L.w + 2*x, b = a + 1, c = a + L.w, d = c + 1;
      ho2[o] = (L.hole[a] | L.hole[b] | L.hole[c] | L.hole[d]) ? 1 : 0;
      for(var ch = 0; ch < 3; ch++) im2[o*3+ch] = (L.img[a*3+ch] + L.img[b*3+ch] + L.img[c*3+ch] + L.img[d*3+ch]) / 4;
    }
    lv.push({img:im2, hole:ho2, w:w2, h:h2});
  }
  /* niveau le plus grossier : remplissage par diffusion depuis le bord */
  (function(L){
    var known = new Uint8Array(L.w * L.h), todo = [];
    for(var i = 0; i < L.w * L.h; i++){ known[i] = L.hole[i] ? 0 : 1; if(L.hole[i]) todo.push(i); }
    var guard = 0;
    while(todo.length && guard++ < 4000){
      var next = [], upd = [];
      todo.forEach(function(i){
        var x = i % L.w, y = (i / L.w) | 0, s = [0,0,0], n = 0;
        [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]].forEach(function(dd){ var xx = x + dd[0], yy = y + dd[1]; if(xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) return; var j = yy * L.w + xx; if(known[j]){ s[0] += L.img[j*3]; s[1] += L.img[j*3+1]; s[2] += L.img[j*3+2]; n++; } });
        if(n){ upd.push([i, s[0]/n, s[1]/n, s[2]/n]); } else next.push(i);
      });
      upd.forEach(function(u){ L.img[u[0]*3] = u[1]; L.img[u[0]*3+1] = u[2]; L.img[u[0]*3+2] = u[3]; known[u[0]] = 1; });
      if(!upd.length) break; todo = next;
    }
    for(var it = 0; it < 30; it++) for(var i = 0; i < L.w * L.h; i++){
      if(!L.hole[i]) continue; var x = i % L.w, y = (i / L.w) | 0;
      if(x < 1 || y < 1 || x >= L.w - 1 || y >= L.h - 1) continue;
      for(var ch = 0; ch < 3; ch++) L.img[i*3+ch] = (L.img[(i-1)*3+ch] + L.img[(i+1)*3+ch] + L.img[(i-L.w)*3+ch] + L.img[(i+L.w)*3+ch]) / 4;
    }
  })(lv[lv.length - 1]);
  var nnf = null, prevW = 0;
  for(var l = lv.length - 1; l >= 0; l--){
    var L = lv[l], W = L.w, H = L.h, I = L.img, Ho = L.hole;
    if(l < lv.length - 1){
      var C = lv[l + 1];
      for(var i = 0; i < W * H; i++){
        if(!Ho[i]) continue; var x = i % W, y = (i / W) | 0;
        var fx = Math.max(0, Math.min(C.w - 1.001, x / 2 - 0.25)), fy = Math.max(0, Math.min(C.h - 1.001, y / 2 - 0.25)), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        for(var ch = 0; ch < 3; ch++){ var p00 = C.img[(y0*C.w+x0)*3+ch], p10 = C.img[(y0*C.w+x0+1)*3+ch], p01 = C.img[((y0+1)*C.w+x0)*3+ch], p11 = C.img[((y0+1)*C.w+x0+1)*3+ch];
          I[i*3+ch] = (p00*(1-ax) + p10*ax)*(1-ay) + (p01*(1-ax) + p11*ax)*ay; }
      }
    }
    /* sources valides : morceau 7x7 entierement connu */
    var valid = new Uint8Array(W * H), vlist = [];
    for(var y = HALF; y < H - HALF; y++) for(var x = HALF; x < W - HALF; x++){
      var ok = 1; for(var dy = -HALF; dy <= HALF && ok; dy++) for(var dx = -HALF; dx <= HALF; dx++) if(Ho[(y+dy)*W + x+dx]){ ok = 0; break; }
      if(ok){ valid[y*W+x] = 1; vlist.push(y*W+x); }
    }
    if(!vlist.length){ prevW = W; continue; }
    /* cibles : centres dont le morceau touche le trou */
    var isT = new Uint8Array(W * H), tlist = [];
    for(var i = 0; i < W * H; i++){ if(!Ho[i]) continue; var x = i % W, y = (i / W) | 0;
      for(var dy = -HALF; dy <= HALF; dy++) for(var dx = -HALF; dx <= HALF; dx++){ var xx = x + dx, yy = y + dy; if(xx < 0 || yy < 0 || xx >= W || yy >= H) continue; var j = yy * W + xx; if(!isT[j]){ isT[j] = 1; tlist.push(j); } } }
    tlist.sort(function(a, b){ return a - b; });
    var nn = new Int32Array(W * H).fill(-1), nd = new Float32Array(W * H);
    /* preference pour la matiere proche du trou (comme Snapseed) */
    var hcx = 0, hcy = 0, hn = 0; for(var i = 0; i < W * H; i++) if(Ho[i]){ hcx += i % W; hcy += (i / W) | 0; hn++; } hcx /= hn; hcy /= hn;
    var PEN = 150000 / Math.pow(Math.max(W, H), 2);
    function dist(p, q, cut){
      var px = p % W, py = (p / W) | 0, qx = q % W, qy = (q / W) | 0, s = PEN * ((qx - hcx) * (qx - hcx) + (qy - hcy) * (qy - hcy));
      for(var dy = -HALF; dy <= HALF; dy++){ var yy = py + dy; if(yy < 0 || yy >= H) continue;
        for(var dx = -HALF; dx <= HALF; dx++){ var xx = px + dx; if(xx < 0 || xx >= W) continue;
          var a = (yy*W + xx) * 3, b = ((qy+dy)*W + qx+dx) * 3, d0 = I[a]-I[b], d1 = I[a+1]-I[b+1], d2 = I[a+2]-I[b+2];
          s += d0*d0 + d1*d1 + d2*d2; }
        if(s > cut) return s; }
      return s;
    }
    tlist.forEach(function(p){
      var q = -1;
      if(nnf && prevW){ var x = p % W, y = (p / W) | 0, cp = (y >> 1) * prevW + (x >> 1), cq = nnf[cp];
        if(cq >= 0){ var qx = (cq % prevW) * 2 + (x & 1), qy = ((cq / prevW) | 0) * 2 + (y & 1); if(qx < W && qy < H && valid[qy*W+qx]) q = qy*W+qx; } }
      if(q < 0) q = vlist[(R() * vlist.length) | 0];
      nn[p] = q; nd[p] = dist(p, q, Infinity);
    });
    var em = l === lv.length - 1 ? 6 : (l === 0 ? 3 : 4);
    for(var e = 0; e < em; e++){
      for(var pm = 0; pm < 3; pm++){
        var rev = pm % 2 === 1, n = tlist.length;
        for(var k = 0; k < n; k++){
          var p = tlist[rev ? n - 1 - k : k], x = p % W, y = (p / W) | 0, best = nn[p], bd = nd[p], st = rev ? 1 : -1;
          /* propagation */
          [[st,0],[0,st]].forEach(function(dd){ var xx = x + dd[0], yy = y + dd[1]; if(xx < 0 || yy < 0 || xx >= W || yy >= H) return; var nb = yy*W+xx, qn = nn[nb]; if(qn < 0) return;
            var qx = (qn % W) - dd[0], qy = ((qn / W) | 0) - dd[1]; if(qx < 0 || qy < 0 || qx >= W || qy >= H) return; var c = qy*W+qx; if(!valid[c] || c === best) return;
            var d = dist(p, c, bd); if(d < bd){ bd = d; best = c; } });
          /* recherche aleatoire */
          var rad = Math.max(W, H), bx = best % W, by = (best / W) | 0;
          while(rad >= 1){ var cx = Math.round(bx + (R() * 2 - 1) * rad), cy = Math.round(by + (R() * 2 - 1) * rad);
            if(cx >= 0 && cy >= 0 && cx < W && cy < H){ var c = cy*W+cx; if(valid[c] && c !== best){ var d = dist(p, c, bd); if(d < bd){ bd = d; best = c; bx = cx; by = cy; } } }
            rad = rad >> 1; }
          nn[p] = best; nd[p] = bd;
        }
      }
      /* vote : chaque pixel du trou = moyenne ponderee des morceaux qui le recouvrent */
      var md = 0; tlist.forEach(function(p){ md += nd[p]; }); md = md / tlist.length + 1e-3;
      var acc = new Float32Array(W * H * 3), ws = new Float32Array(W * H);
      tlist.forEach(function(p){
        var px = p % W, py = (p / W) | 0, q = nn[p], qx = q % W, qy = (q / W) | 0, wgt = Math.exp(-nd[p] / md);
        for(var dy = -HALF; dy <= HALF; dy++){ var yy = py + dy; if(yy < 0 || yy >= H) continue;
          for(var dx = -HALF; dx <= HALF; dx++){ var xx = px + dx; if(xx < 0 || xx >= W) continue; var t = yy*W + xx; if(!Ho[t]) continue;
            var s2 = ((qy+dy)*W + qx+dx) * 3; acc[t*3] += wgt * I[s2]; acc[t*3+1] += wgt * I[s2+1]; acc[t*3+2] += wgt * I[s2+2]; ws[t] += wgt; } }
      });
      for(var t = 0; t < W * H; t++) if(Ho[t] && ws[t] > 0){ I[t*3] = acc[t*3] / ws[t]; I[t*3+1] = acc[t*3+1] / ws[t]; I[t*3+2] = acc[t*3+2] / ws[t]; }
      tlist.forEach(function(p){ nd[p] = dist(p, nn[p], Infinity); });
    }
    nnf = nn; prevW = W;
  }
  return lv[0].img;
}
/* applique un trait de correcteur sur le canvas c (coordonnees du trait en fractions de l'image) */
function healStroke(c, st){
  var W = c.width, H = c.height, mn = Math.min(W, H), r = Math.max(1.5, st.r * mn);
  var xs = st.pts.map(function(p){ return p[0] * W; }), ys = st.pts.map(function(p){ return p[1] * H; });
  var x0 = Math.min.apply(null, xs) - r, x1 = Math.max.apply(null, xs) + r, y0 = Math.min.apply(null, ys) - r, y1 = Math.max.apply(null, ys) + r;
  var m = Math.max(24, Math.max(x1 - x0, y1 - y0) * 1.3);
  var cx0 = Math.max(0, Math.floor(x0 - m)), cy0 = Math.max(0, Math.floor(y0 - m)), cx1 = Math.min(W, Math.ceil(x1 + m)), cy1 = Math.min(H, Math.ceil(y1 + m));
  var cw = cx1 - cx0, ch = cy1 - cy0; if(cw < 12 || ch < 12) return;
  var sc = Math.min(1, 480 / Math.max(cw, ch)), ww = Math.max(8, Math.round(cw * sc)), wh = Math.max(8, Math.round(ch * sc));
  var wc = cvs(ww, wh), wx = wc.getContext("2d"); wx.imageSmoothingQuality = "high"; wx.drawImage(c, cx0, cy0, cw, ch, 0, 0, ww, wh);
  var mc = cvs(ww, wh), mx = mc.getContext("2d");
  mx.strokeStyle = mx.fillStyle = "#fff"; mx.lineCap = mx.lineJoin = "round"; mx.lineWidth = 2 * r * sc + 3;
  var P = st.pts.map(function(p){ return [(p[0] * W - cx0) * sc, (p[1] * H - cy0) * sc]; });
  if(P.length === 1){ mx.beginPath(); mx.arc(P[0][0], P[0][1], r * sc + 1.5, 0, 7); mx.fill(); }
  else { mx.beginPath(); mx.moveTo(P[0][0], P[0][1]); for(var i = 1; i < P.length; i++) mx.lineTo(P[i][0], P[i][1]); mx.stroke(); }
  var md = mx.getImageData(0, 0, ww, wh).data, id = wx.getImageData(0, 0, ww, wh), d = id.data, n = ww * wh;
  var img = new Float32Array(n * 3), hole = new Uint8Array(n), any = 0;
  for(var i = 0; i < n; i++){ img[i*3] = d[i*4]; img[i*3+1] = d[i*4+1]; img[i*3+2] = d[i*4+2]; if(md[i*4+3] > 40){ hole[i] = 1; any = 1; } }
  if(!any) return;
  var out = inpaint(img, hole, ww, wh, Math.round(st.pts[0][0] * 1e5 + st.pts[0][1] * 1e3));
  for(var i = 0; i < n; i++){ d[i*4] = out[i*3]; d[i*4+1] = out[i*3+1]; d[i*4+2] = out[i*3+2]; d[i*4+3] = hole[i] ? 255 : 0; }
  wx.putImageData(id, 0, 0);
  /* bord tres legerement adouci pour l'incrustation */
  var fc = cvs(ww, wh), fx = fc.getContext("2d"); fx.filter = "blur(0.6px)"; fx.drawImage(wc, 0, 0);
  fx.filter = "none"; fx.globalCompositeOperation = "source-over"; fx.drawImage(wc, 0, 0);
  var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(fc, 0, 0, ww, wh, cx0, cy0, cw, ch);
}
function healAll(c, list){ list.forEach(function(st){ healStroke(c, st); }); }

/* ================= ECRAN CORRECTEUR (disposition type Snapseed) ================= */
function healer(){
  var ph = needPhoto(); if(!ph) return;
  var base = cvs(ph.width, ph.height); base.getContext("2d").drawImage(ph, 0, 0);
  var snaps = [base], list = [], redo = [], brush = 8, showOrig = false;
  /* on rejoue les corrections deja faites sur cette photo */
  if(heals.length){ var cur0 = cvs(base.width, base.height); cur0.getContext("2d").drawImage(base, 0, 0); heals.forEach(function(st){ healStroke(cur0, st); list.push(st); var s2 = cvs(cur0.width, cur0.height); s2.getContext("2d").drawImage(cur0, 0, 0); snaps.push(s2); }); }
  show('<div class="x2Top"><div class="jmsTitle">🩹 ' + T("CORRECTEUR", "HEALING") + '</div>' +
     '<button data-a="eye" id="x2Eye" style="background:#3a3a3a" title="' + T("Maintenir pour voir l'original", "Hold to see the original") + '">👁</button>' +
     '<button data-a="undo" style="background:#3a3a3a">↶</button><button data-a="redo" style="background:#3a3a3a">↷</button>' +
     '<button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2HW" style="position:relative;touch-action:none"><canvas id="x2HC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>' +
     '<div id="x2Busy" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000c;color:#fff;font-weight:900;padding:10px 16px;border-radius:12px;display:none">⏳ ' + T("Correction…", "Healing…") + '</div></div>' +
   '<div class="x2Hint" id="x2HHelp" style="flex:none;margin:2px 0">' + T("Passe le doigt sur la tache. Deux doigts pour zoomer et déplacer.", "Paint over the spot with your finger. Two fingers to zoom and move.") + '</div>' +
   '<div style="display:flex;align-items:center;gap:10px;flex:none;padding:6px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     '<div style="flex:1"><div class="x2Lb" style="margin:0;text-align:center">' + T("Taille du pinceau", "Brush size") + ' : <b id="x2Bv">8</b></div><input type="range" id="x2Bs" min="3" max="50" value="8" style="width:100%"></div>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var wrap = $("x2HW"), cv = $("x2HC"), ctx = cv.getContext("2d"), dpr = window.devicePixelRatio || 1;
  var zoom = 1, ox = 0, oy = 0, fit = 1, CW = 0, CH = 0;
  function cur(){ return snaps[snaps.length - 1]; }
  function layout(){
    if(!document.body.contains(cv)){ window.removeEventListener("resize", layout); return; }
    CW = Math.max(10, wrap.clientWidth); CH = Math.max(10, wrap.clientHeight); cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
    fit = Math.min(cv.width / base.width, cv.height / base.height); clamp(); draw();
  }
  function scale(){ return fit * zoom; }
  function clamp(){
    var s = scale(), vw = cv.width / s, vh = cv.height / s;
    ox = vw >= base.width ? (base.width - vw) / 2 : Math.max(0, Math.min(base.width - vw, ox));
    oy = vh >= base.height ? (base.height - vh) / 2 : Math.max(0, Math.min(base.height - vh, oy));
  }
  var trail = null;
  function draw(){
    var s = scale(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#111"; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(s, 0, 0, s, -ox * s, -oy * s); ctx.imageSmoothingQuality = "high";
    ctx.drawImage(showOrig ? base : cur(), 0, 0);
    if(trail && trail.length){
      ctx.strokeStyle = ctx.fillStyle = "rgba(255,40,40,.55)"; ctx.lineCap = ctx.lineJoin = "round"; ctx.lineWidth = 2 * trail.r;
      ctx.beginPath(); ctx.moveTo(trail[0][0], trail[0][1]); for(var i = 1; i < trail.length; i++) ctx.lineTo(trail[i][0], trail[i][1]);
      if(trail.length === 1){ ctx.arc(trail[0][0], trail[0][1], trail.r, 0, 7); ctx.fill(); } else ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function toImg(e){ var r = cv.getBoundingClientRect(), s = scale(); return [ox + (e.clientX - r.left) * dpr / s, oy + (e.clientY - r.top) * dpr / s]; }
  var ptrs = {}, mode = null, pin = null;
  cv.onpointerdown = function(e){
    cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    var k = Object.keys(ptrs);
    if(k.length === 1){ mode = "paint"; trail = [toImg(e)]; trail.r = brush * dpr / scale(); draw(); }
    else if(k.length === 2){
      mode = "pinch"; trail = null; draw();
      var a = ptrs[k[0]], b = ptrs[k[1]], r = cv.getBoundingClientRect(), mxp = ((a.x + b.x) / 2 - r.left) * dpr, myp = ((a.y + b.y) / 2 - r.top) * dpr;
      pin = {d:Math.hypot(a.x - b.x, a.y - b.y), z:zoom, ix:ox + mxp / scale(), iy:oy + myp / scale()};
    }
  };
  cv.onpointermove = function(e){
    if(!ptrs[e.pointerId]) return; ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(mode === "paint" && trail){ var p = toImg(e), l = trail[trail.length - 1]; if(Math.hypot(p[0] - l[0], p[1] - l[1]) > trail.r * 0.25){ trail.push(p); draw(); } }
    else if(mode === "pinch"){
      var k = Object.keys(ptrs); if(k.length < 2) return; var a = ptrs[k[0]], b = ptrs[k[1]], r = cv.getBoundingClientRect();
      zoom = Math.max(1, Math.min(10, pin.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pin.d)));
      var mxp = ((a.x + b.x) / 2 - r.left) * dpr, myp = ((a.y + b.y) / 2 - r.top) * dpr, s = scale();
      ox = pin.ix - mxp / s; oy = pin.iy - myp / s; clamp(); draw();
    }
  };
  function up(e){
    if(!ptrs[e.pointerId]) return; delete ptrs[e.pointerId];
    if(mode === "paint" && trail && Object.keys(ptrs).length === 0){
      var st = {r:trail.r / Math.min(base.width, base.height), pts:trail.map(function(p){ return [p[0] / base.width, p[1] / base.height]; })};
      trail = null; $("x2Busy").style.display = "block";
      setTimeout(function(){
        var c = cvs(base.width, base.height); c.getContext("2d").drawImage(cur(), 0, 0);
        try{ healStroke(c, st); }catch(err){}
        snaps.push(c); list.push(st); redo = []; $("x2Busy").style.display = "none"; draw();
      }, 30);
    }
    if(Object.keys(ptrs).length === 0) mode = null;
  }
  cv.onpointerup = up; cv.onpointercancel = up;
  $("x2Bs").oninput = function(){ brush = +this.value; $("x2Bv").textContent = this.value; };
  var eye = $("x2Eye");
  eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.eye = function(){};
  HH.undo = function(){ if(snaps.length > 1){ redo.push([snaps.pop(), list.pop()]); draw(); } };
  HH.redo = function(){ var r = redo.pop(); if(r){ snaps.push(r[0]); list.push(r[1]); draw(); } };
  HH.help = function(){ var h = $("x2HHelp"); h.style.color = "#FFD600"; h.textContent = T("Passe le doigt sur la tache (elle devient rouge), lève le doigt : elle est remplacée. Deux doigts pour zoomer. 👁 maintenu = photo d'origine.", "Paint over the spot (it turns red), lift your finger: it is replaced. Two fingers to zoom. Hold 👁 = original photo."); };
  HH.cancel = hide;
  HH.ok = function(){ heals = list.slice(); hide(); if(heals.length) note("🩹 " + heals.length + T(" correction(s) appliquée(s) à l'enregistrement de cette photo", " fix(es) applied when this photo is saved")); };
  window.addEventListener("resize", layout); requestAnimationFrame(layout);
}

/* ================= DETAILS, THEATRAL, ECLAT GLAMOUR =================
   Calcules avec les operations de dessin accelerees du telephone (flous, melanges, filtres) :
   rapides, meme en pleine taille. Ils s'appliquent a la photo enregistree et au lot. */
var LD = {details:{s:0, n:0}, drama:{f:0, sat:0, st:0}, glow:{g:0, sat:0, w:0}, wb:{t:0, ti:0}, tone:{hi:0, mid:0, lo:0, ps:0, ph:0}, hdr:{f:0, b:0, sat:0, st:0}};
function lookGet(s, k){ return Object.assign({}, LD[k], s[k] || {}); }
function detailsOn(s){ var d = lookGet(s, "details"); return !!(d.s || d.n); }
function dramaOn(s){ return lookGet(s, "drama").f > 0; }
function glowOn(s){ var g = lookGet(s, "glow"); return !!(g.g || g.sat || g.w); }
function wbOn(s){ var w = lookGet(s, "wb"); return !!(w.t || w.ti); }
function toneOn(s){ var t = lookGet(s, "tone"); return !!(t.hi || t.mid || t.lo); }
function hdrOn(s){ return lookGet(s, "hdr").f > 0; }
function lookOn(s){ return wbOn(s) || toneOn(s) || hdrOn(s) || detailsOn(s) || dramaOn(s) || glowOn(s); }
/* passe-haut centre sur le gris : base de la structure et de la nettete */
function highpass(src, r){
  var w = src.width, h = src.height, hp = cvs(w, h), hx = hp.getContext("2d"), inv = cvs(w, h), ix = inv.getContext("2d");
  hx.drawImage(src, 0, 0); ix.filter = "blur(" + Math.max(0.6, r).toFixed(1) + "px) invert(1)"; ix.drawImage(src, 0, 0);
  hx.globalAlpha = 0.5; hx.drawImage(inv, 0, 0); return hp;
}
function blend(c, layer, mode, a){
  if(a <= 0) return; var x = c.getContext("2d"); x.save(); x.globalCompositeOperation = mode;
  while(a > 0){ x.globalAlpha = Math.min(1, a); x.drawImage(layer, 0, 0); a -= 1; }
  x.restore();
}
function filtered(c, f){ var t = cvs(c.width, c.height), x = t.getContext("2d"); x.filter = f; x.drawImage(c, 0, 0); return t; }
function looks(src, s){
  if(!lookOn(s)) return src;
  var c = cvs(src.width, src.height); c.getContext("2d").drawImage(src, 0, 0);
  var mn = Math.min(c.width, c.height);
  if(wbOn(s)) wbApply(c, lookGet(s, "wb"));
  if(toneOn(s)) toneApply(c, lookGet(s, "tone"));
  if(hdrOn(s)) hdrApply(c, lookGet(s, "hdr"));
  var d = lookGet(s, "details");
  if(d.s > 0) blend(c, highpass(c, mn / 110), "overlay", d.s / 100 * 1.1);
  if(d.s < 0){ var bl = filtered(c, "blur(" + (mn / 260).toFixed(1) + "px)"); blend(c, bl, "source-over", -d.s / 100 * 0.6); }
  if(d.n > 0) blend(c, highpass(c, Math.max(0.8, mn / 1000)), "overlay", d.n / 100 * 1.6);
  var m = lookGet(s, "drama");
  if(m.f > 0){
    var k = m.f / 100, st = m.st | 0, rad = st % 2 ? mn / 18 : mn / 32;
    blend(c, highpass(c, rad), "overlay", k * (st % 2 ? 2.2 : 1.6));
    var br = st < 2 ? 1 + 0.06 * k : 1 - (st === 2 ? 0.12 : 0.2) * k, ct = 1 + (st % 2 ? 0.12 : 0.05) * k, sa = Math.max(0, 1 + (st < 2 ? 0.1 : -0.35) * k + m.sat / 100);
    var t = filtered(c, "brightness(" + br.toFixed(3) + ") contrast(" + ct.toFixed(3) + ") saturate(" + sa.toFixed(3) + ")");
    c.getContext("2d").drawImage(t, 0, 0);
  }
  var g = lookGet(s, "glow");
  if(g.g > 0){
    var gl = filtered(c, "blur(" + (mn / 45).toFixed(1) + "px) brightness(1.12)");
    blend(c, gl, "screen", g.g / 100 * 0.5); blend(c, gl, "soft-light", g.g / 100 * 0.6);
  }
  if(g.sat) c.getContext("2d").drawImage(filtered(c, "saturate(" + Math.max(0, 1 + g.sat / 100).toFixed(3) + ")"), 0, 0);
  if(g.w){ var x = c.getContext("2d"); x.save(); x.globalCompositeOperation = "soft-light"; x.globalAlpha = Math.abs(g.w) / 100 * 0.55; x.fillStyle = g.w > 0 ? "rgb(255,150,40)" : "rgb(40,120,255)"; x.fillRect(0, 0, c.width, c.height); x.restore(); }
  return c;
}

/* ---------- balance des blancs : gains R/V/B (temperature, teinte) ---------- */
var KT = 0.5, KM = 0.4;   /* amplitude en diaphragmes pour +/-100 */
function wbGains(w){
  var t = (w.t || 0) / 100, m = (w.ti || 0) / 100;
  var gr = Math.pow(2, KT * t + KM * m / 2), gb = Math.pow(2, -KT * t + KM * m / 2), gg = Math.pow(2, -KM * m);
  var n = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb; return [gr / n, gg / n, gb / n];
}
/* pipette : la couleur touchee devient neutre */
function wbFromColor(r, g, b){
  r = Math.max(1, r); g = Math.max(1, g); b = Math.max(1, b);
  var t = 100 * Math.log2(b / r) / (2 * KT), ti = 100 * Math.log2(g / Math.sqrt(r * b)) / (1.5 * KM);
  return {t:Math.max(-100, Math.min(100, Math.round(t))), ti:Math.max(-100, Math.min(100, Math.round(ti)))};
}
function wbApply(c, w){
  var G = wbGains(w), L = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for(var i = 0; i < 256; i++){ L[0][i] = i * G[0]; L[1][i] = i * G[1]; L[2][i] = i * G[2]; }
  var x = c.getContext("2d"), W = c.width, H = c.height, step = Math.max(1, Math.floor(4e6 / W));
  for(var y = 0; y < H; y += step){ var hh = Math.min(step, H - y), id = x.getImageData(0, y, W, hh), d = id.data;
    for(var k = 0; k < d.length; k += 4){ d[k] = L[0][d[k]]; d[k+1] = L[1][d[k+1]]; d[k+2] = L[2][d[k+2]]; } x.putImageData(id, 0, y); }
}
/* ---------- contraste des tons : contraste local par zone de luminosite ---------- */
function sstep(a, b, v){ var t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); }
function toneApply(c, t){
  var W = c.width, H = c.height, mn = Math.min(W, H), bl = filtered(c, "blur(" + (mn / 70).toFixed(1) + "px)");
  var x = c.getContext("2d"), bx = bl.getContext("2d"), step = Math.max(1, Math.floor(3e6 / W));
  var hi = t.hi / 100 * 1.8, mi = t.mid / 100 * 1.8, lo = t.lo / 100 * 1.8, ps = (t.ps || 0) / 100, ph = (t.ph || 0) / 100;
  /* poids par niveau de luminosite (table de 256 valeurs) */
  var WT = new Float32Array(256);
  for(var i = 0; i < 256; i++){ var l = i / 255, wl = 1 - sstep(0.12, 0.5, l), wh = sstep(0.5, 0.88, l), wm = Math.max(0, 1 - Math.abs(l - 0.5) * 2.2); WT[i] = lo * wl + mi * wm + hi * wh; }
  for(var y = 0; y < H; y += step){
    var hh = Math.min(step, H - y), id = x.getImageData(0, y, W, hh), d = id.data, b = bx.getImageData(0, y, W, hh).data;
    for(var k = 0; k < d.length; k += 4){
      var L = (54 * d[k] + 183 * d[k+1] + 19 * d[k+2]) >> 8, Lb = (54 * b[k] + 183 * b[k+1] + 19 * b[k+2]) >> 8, dl = (L - Lb) * WT[L];
      if(dl < 0 && ps && L < 64) dl *= 1 - ps * (1 - L / 64);
      if(dl > 0 && ph && L > 192) dl *= 1 - ph * ((L - 192) / 63);
      d[k] += dl; d[k+1] += dl; d[k+2] += dl;
    }
    x.putImageData(id, 0, y);
  }
}
/* ---------- HDR : compression locale des tons + details ---------- */
var HDRS = [[1.0, 0.9, 60, 0.15], [0.8, 0.45, 40, 0.0], [0.7, 1.2, 200, 0.05], [1.4, 1.6, 45, 0.25]];   /* nature, personnes, fin, fort */
function hdrApply(c, h){
  var k = h.f / 100, S = HDRS[h.st | 0] || HDRS[0], mn = Math.min(c.width, c.height);
  var inv = filtered(c, "grayscale(1) blur(" + (mn / 25).toFixed(1) + "px) invert(1)");
  blend(c, inv, "soft-light", k * S[0]);
  blend(c, highpass(c, Math.max(0.8, mn / S[2])), "overlay", k * S[1]);
  var br = 1 + (h.b || 0) / 250, sa = Math.max(0, 1 + S[3] * k + (h.sat || 0) / 100);
  if(br !== 1 || sa !== 1) c.getContext("2d").drawImage(filtered(c, "brightness(" + br.toFixed(3) + ") saturate(" + sa.toFixed(3) + ")"), 0, 0);
}

/* ---------- ecran de reglage commun (gestes facon Snapseed) ---------- */
var TOOLS = {
  details:{title:T("DÉTAILS", "DETAILS"), icon:"🔎", params:[["s", T("Structure", "Structure"), -100, 100], ["n", T("Netteté", "Sharpening"), 0, 100]], start:{s:25}},
  drama:{title:T("THÉÂTRAL", "DRAMA"), icon:"🎭", params:[["f", T("Force", "Strength"), 0, 100], ["sat", T("Saturation", "Saturation"), -100, 100]], start:{f:50},
    styles:[T("Lumineux 1", "Bright 1"), T("Lumineux 2", "Bright 2"), T("Sombre 1", "Dark 1"), T("Sombre 2", "Dark 2")]},
  wb:{title:T("BALANCE DES BLANCS", "WHITE BALANCE"), icon:"💧", params:[["t", T("Température", "Temperature"), -100, 100], ["ti", T("Teinte", "Tint"), -100, 100]], start:{}, pipette:true},
  tone:{title:T("CONTRASTE DES TONS", "TONAL CONTRAST"), icon:"🌗", params:[["hi", T("Tons clairs", "High tones"), -100, 100], ["mid", T("Tons moyens", "Mid tones"), -100, 100], ["lo", T("Tons foncés", "Low tones"), -100, 100], ["ps", T("Protéger les ombres", "Protect shadows"), 0, 100], ["ph", T("Protéger les hautes lumières", "Protect highlights"), 0, 100]], start:{mid:30}},
  hdr:{title:"HDR", icon:"🌄", params:[["f", T("Force", "Strength"), 0, 100], ["b", T("Luminosité", "Brightness"), -100, 100], ["sat", T("Saturation", "Saturation"), -100, 100]], start:{f:50},
    styles:[T("Nature", "Nature"), T("Personnes", "People"), T("Fin", "Fine"), T("Fort", "Strong")]},
  glow:{title:T("ÉCLAT GLAMOUR", "GLAMOUR GLOW"), icon:"✨", params:[["g", T("Éclat", "Glow"), 0, 100], ["sat", T("Saturation", "Saturation"), -100, 100], ["w", T("Chaleur", "Warmth"), -100, 100]], start:{g:40}}
};
function paramTool(key){
  var def = TOOLS[key], ph = needPhoto(); if(!ph) return;
  var all = get(), st = lookGet(all, key), first = !Object.keys(def.start).some(function(k){ return st[k]; });
  if(first) Object.assign(st, def.start);
  var idx = 0, showOrig = false, P = def.params;
  var sz = Math.min(1, 1100 / Math.max(ph.width, ph.height)), base = cvs(ph.width * sz, ph.height * sz);
  base.getContext("2d").drawImage(ph, 0, 0, base.width, base.height);
  /* les courbes deja reglees sont visibles dans l'apercu */
  if(curveOn(all)) applyCurves(base.getContext("2d"), base.width, base.height, all);
  show('<div class="x2Top"><div class="jmsTitle">' + def.icon + ' ' + def.title + '</div>' +
     '<button id="x2KEye" style="background:#3a3a3a">👁</button><button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2KW" style="position:relative;touch-action:none">' +
     '<canvas id="x2KC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>' +
     '<div id="x2KL" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);background:#000b;color:#fff;font-weight:900;font-size:17px;padding:8px 16px;border-radius:20px;white-space:nowrap;pointer-events:none"></div>' +
     '<div id="x2KM" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000d;border-radius:14px;padding:6px 0;display:none;min-width:200px;pointer-events:none"></div></div>' +
   (def.styles ? '<div class="x2Chips" id="x2KS">' + def.styles.map(function(n, i){ return '<button data-a="sty" data-i="' + i + '">' + n + '</button>'; }).join("") + '</div>' : '') +
   '<div class="x2Hint" id="x2KH" style="flex:none;margin:2px 0">' + T("Glisse ↕ sur la photo pour choisir le réglage, ↔ pour le modifier.", "Swipe ↕ on the photo to pick a setting, ↔ to change it.") + '</div>' +
   '<div style="flex:none;display:flex;align-items:center;gap:8px;margin:2px 0"><button data-a="pick" style="border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-weight:900;padding:8px 10px;font-size:13px">☰</button>' +
     '<div style="flex:1;font-weight:800;color:#ddd" id="x2KN"></div><div id="x2KV" style="font-weight:900;color:#FFD600;font-family:monospace;font-size:16px"></div></div>' +
   '<canvas id="x2KR" style="display:block;flex:none;width:100%;height:46px;touch-action:none"></canvas>' +
   '<div style="display:flex;align-items:center;justify-content:space-between;flex:none;padding:6px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     (def.pipette ? '<button data-a="pip" id="x2Pip" style="border:0;background:#1E88E5;color:#fff;border-radius:22px;padding:10px 16px;font-weight:900">💧 ' + T("Pipette", "Picker") + '</button>' : '') +
     '<button data-a="zero" style="border:0;background:#3a3a3a;color:#fff;border-radius:22px;padding:10px 18px;font-weight:900">' + T("Désactiver", "Turn off") + '</button>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var wrap = $("x2KW"), cv = $("x2KC"), ctx = cv.getContext("2d"), rul = $("x2KR"), rx = rul.getContext("2d"), dpr = window.devicePixelRatio || 1, menu = $("x2KM");
  function fmt(v){ return (v > 0 && P[idx][2] < 0 ? "+" : "") + Math.round(v); }
  function labels(){
    var p = P[idx], v = st[p[0]] || 0; $("x2KL").textContent = p[1] + "  " + fmt(v); $("x2KN").textContent = p[1]; $("x2KV").textContent = fmt(v);
    if($("x2KS")) Array.prototype.forEach.call($("x2KS").children, function(b, i){ b.classList.toggle("on", i === (st.st | 0)); b.style.background = i === (st.st | 0) ? "#1E88E5" : ""; });
    ruler();
  }
  function ruler(){
    var p = P[idx], W = rul.clientWidth * dpr, H = 46 * dpr; if(rul.width !== W) rul.width = W; rul.height = H;
    var f = ((st[p[0]] || 0) - p[2]) / (p[3] - p[2]), z = (0 - p[2]) / (p[3] - p[2]); rx.clearRect(0, 0, W, H);
    for(var i = 0; i <= 60; i++){ var x = 8 * dpr + (W - 16 * dpr) * i / 60; rx.fillStyle = "#bbb"; rx.fillRect(x - dpr, H * 0.35, 2 * dpr, H * 0.45); }
    var zx = 8 * dpr + (W - 16 * dpr) * z, vx = 8 * dpr + (W - 16 * dpr) * f;
    rx.fillStyle = "rgba(255,214,0,.35)"; rx.fillRect(Math.min(zx, vx), H * 0.35, Math.abs(vx - zx), H * 0.45);
    rx.fillStyle = "#FFD600"; rx.fillRect(vx - 2 * dpr, H * 0.2, 4 * dpr, H * 0.65); rx.beginPath(); rx.moveTo(vx - 8 * dpr, 0); rx.lineTo(vx + 8 * dpr, 0); rx.lineTo(vx, H * 0.2); rx.fill();
  }
  var pend = 0;
  function draw(){
    if(!document.body.contains(cv)) return;
    var CW = Math.max(10, wrap.clientWidth), CH = Math.max(10, wrap.clientHeight);
    if(cv.width !== Math.round(CW * dpr) || cv.height !== Math.round(CH * dpr)){ cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); }
    var tmp = {}; tmp[key] = st; var img = showOrig ? base : looks(base, tmp);
    var k = Math.min(cv.width / img.width, cv.height / img.height), w = img.width * k, h = img.height * k;
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
  }
  function later(){ if(!pend) pend = requestAnimationFrame(function(){ pend = 0; draw(); }); }
  function setV(v){ var p = P[idx]; st[p[0]] = Math.max(p[2], Math.min(p[3], Math.round(v))); labels(); later(); }
  function drawMenu(sel){ menu.innerHTML = P.map(function(p, i){ return '<div style="padding:9px 18px;font-weight:900;font-size:15px;' + (i === sel ? 'background:#1E88E5;color:#fff' : 'color:#ccc') + '">' + p[1] + '<span style="float:right;margin-left:14px;color:' + (i === sel ? '#fff' : '#FFD600') + '">' + fmt(st[p[0]] || 0) + '</span></div>'; }).join(""); menu.style.display = "block"; }
  var g = null;
  var pip = false;
  function pipPick(e){
    var r = cv.getBoundingClientRect(), k = Math.min(cv.width / base.width, cv.height / base.height), ox = (cv.width - base.width * k) / 2, oy = (cv.height - base.height * k) / 2;
    var bx = Math.round(((e.clientX - r.left) * dpr - ox) / k), by = Math.round(((e.clientY - r.top) * dpr - oy) / k);
    if(bx < 2 || by < 2 || bx >= base.width - 2 || by >= base.height - 2) return false;
    var d = base.getContext("2d").getImageData(bx - 2, by - 2, 5, 5).data, R = 0, G2 = 0, B = 0;
    for(var i = 0; i < d.length; i += 4){ R += d[i]; G2 += d[i+1]; B += d[i+2]; }
    var w = wbFromColor(R / 25, G2 / 25, B / 25); st.t = w.t; st.ti = w.ti; return true;
  }
  function pipMode(on){ pip = on; var b = $("x2Pip"); if(b){ b.style.outline = on ? "3px solid #FFD600" : ""; } $("x2KH").style.color = on ? "#FFD600" : ""; $("x2KH").textContent = on ? T("Touchez un endroit qui devrait être gris ou blanc.", "Tap a spot that should be grey or white.") : T("Glisse ↕ sur la photo pour choisir le réglage, ↔ pour le modifier.", "Swipe ↕ on the photo to pick a setting, ↔ to change it."); }
  cv.onpointerdown = function(e){
    if(pip){ if(pipPick(e)){ pipMode(false); labels(); later(); } return; }
    cv.setPointerCapture(e.pointerId); g = {x:e.clientX, y:e.clientY, mode:null, v0:st[P[idx][0]] || 0, i0:idx}; };
  cv.onpointermove = function(e){
    if(!g) return; var dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(!g.mode && Math.hypot(dx, dy) > 10) g.mode = Math.abs(dy) > Math.abs(dx) ? "menu" : "value";
    if(g.mode === "value"){ var p = P[idx]; setV(g.v0 + dx * (p[3] - p[2]) / (wrap.clientWidth * 2)); }
    else if(g.mode === "menu"){ var i = Math.max(0, Math.min(P.length - 1, g.i0 + Math.round(dy / 30))); if(i !== g.sel){ g.sel = i; drawMenu(i); } }
  };
  function up(){ if(g && g.mode === "menu" && g.sel !== undefined){ idx = g.sel; labels(); } menu.style.display = "none"; g = null; }
  cv.onpointerup = up; cv.onpointercancel = up;
  function rulerSet(e){ var p = P[idx], b = rul.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - b.left - 8) / (b.width - 16))); setV(p[2] + f * (p[3] - p[2])); }
  rul.onpointerdown = function(e){ rul.setPointerCapture(e.pointerId); rulerSet(e); rul.onpointermove = rulerSet; };
  rul.onpointerup = rul.onpointercancel = function(){ rul.onpointermove = null; };
  var eye = $("x2KEye"); eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.pick = function(){ idx = (idx + 1) % P.length; labels(); };
  HH.sty = function(b){ st.st = +b.dataset.i; labels(); later(); };
  HH.pip = function(){ pipMode(!pip); };
  HH.zero = function(){ P.forEach(function(p){ st[p[0]] = 0; }); labels(); later(); };
  HH.help = function(){ var h = $("x2KH"); h.style.color = "#FFD600"; h.textContent = T("↕ glisser : choisir le réglage • ↔ glisser : moins / plus • 👁 maintenu : sans l'outil • ✓ garder, ✕ annuler.", "↕ swipe: pick a setting • ↔ swipe: less / more • hold 👁: without the tool • ✓ keep, ✕ cancel."); };
  HH.cancel = hide;
  HH.ok = function(){ var s2 = get(); s2[key] = st; put(s2); hide(); };
  function layout(){ if(!document.body.contains(cv)){ window.removeEventListener("resize", layout); return; } labels(); draw(); }
  if(def.pipette && !st.t && !st.ti) setTimeout(function(){ pipMode(true); }, 50);
  window.addEventListener("resize", layout); requestAnimationFrame(layout);
}

/* ================= SELECTION ET PINCEAU (retouche locale, photo ouverte seulement) =================
   Les zones sont decrites en fractions de la photo : le meme reglage sert a l'apercu et a l'enregistrement en pleine taille. */
var sels = [];      /* points de selection : {x, y, r, lum, con, sat, str} */
var brushes = [];   /* traits de pinceau : {k, v, r, pts:[[x,y]...]} ; k = lum | temp | sat | str ; v = -100..100 ; v = 0 : gomme */
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple){ sels = []; brushes = []; } }, true);
function localOn(){ return sels.some(function(p){ return p.lum || p.con || p.sat || p.str; }) || brushes.some(function(b){ return b.v; }); }

/* applique un reglage a travers un masque (canvas de n'importe quelle taille ; l'opacite = la force) */
function applyMasked(c, mask, kind, a){
  if(!a) return;
  var W = c.width, H = c.height, mn = Math.min(W, H), L;
  if(kind === "lum") L = filtered(c, "brightness(" + (a > 0 ? 1 + 0.85 * a : 1 + 0.55 * a).toFixed(3) + ")");
  else if(kind === "con") L = filtered(c, "contrast(" + Math.max(0.2, 1 + 0.8 * a).toFixed(3) + ")");
  else if(kind === "sat") L = filtered(c, "saturate(" + Math.max(0, 1 + 1.2 * a).toFixed(3) + ")");
  else if(kind === "temp"){ L = cvs(W, H); var lx = L.getContext("2d"); lx.drawImage(c, 0, 0); lx.globalCompositeOperation = "soft-light"; lx.globalAlpha = Math.min(1, Math.abs(a) * 0.8); lx.fillStyle = a > 0 ? "rgb(255,140,30)" : "rgb(30,110,255)"; lx.fillRect(0, 0, W, H); }
  else if(kind === "str"){ if(a > 0){ L = cvs(W, H); L.getContext("2d").drawImage(c, 0, 0); blend(L, highpass(c, mn / 110), "overlay", a * 1.8); } else L = filtered(c, "blur(" + (mn / 220 * -a).toFixed(1) + "px)"); }
  if(!L) return;
  var x = L.getContext("2d"); x.save(); x.globalCompositeOperation = "destination-in"; x.globalAlpha = 1; x.imageSmoothingQuality = "high"; x.drawImage(mask, 0, 0, W, H); x.restore();
  c.getContext("2d").drawImage(L, 0, 0);
}
/* petite copie de travail pour calculer les masques (rapide) */
function smallCopy(c, max){ var k = Math.min(1, max / Math.max(c.width, c.height)), s = cvs(c.width * k, c.height * k); s.getContext("2d").drawImage(c, 0, 0, s.width, s.height); return s; }
/* masque d'un point de selection : proche du point ET de couleur semblable */
function pointMask(sm, p){
  var W = sm.width, H = sm.height, R = Math.max(3, p.r * Math.min(W, H)), cx = p.x * W, cy = p.y * H;
  var x = sm.getContext("2d"), all = x.getImageData(0, 0, W, H).data;
  var sx = Math.max(0, Math.min(W - 1, Math.round(cx))), sy = Math.max(0, Math.min(H - 1, Math.round(cy))), cr = 0, cg = 0, cb = 0, n = 0;
  for(var yy = Math.max(0, sy - 2); yy <= Math.min(H - 1, sy + 2); yy++) for(var xx = Math.max(0, sx - 2); xx <= Math.min(W - 1, sx + 2); xx++){ var i = (yy * W + xx) * 4; cr += all[i]; cg += all[i+1]; cb += all[i+2]; n++; }
  cr /= n; cg /= n; cb /= n;
  var m = cvs(W, H), mx = m.getContext("2d"), id = mx.createImageData(W, H), d = id.data;
  var x0 = Math.max(0, Math.floor(cx - 2 * R)), x1 = Math.min(W, Math.ceil(cx + 2 * R)), y0 = Math.max(0, Math.floor(cy - 2 * R)), y1 = Math.min(H, Math.ceil(cy + 2 * R));
  for(var y = y0; y < y1; y++) for(var x2 = x0; x2 < x1; x2++){
    var dd = Math.hypot(x2 - cx, y - cy) / R; if(dd > 2) continue;
    var j = (y * W + x2) * 4, dr = all[j] - cr, dg = all[j+1] - cg, db = all[j+2] - cb;
    var dc = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
    var w = Math.exp(-dd * dd * 1.3) * Math.exp(-dc * dc / (2 * 38 * 38));
    d[j] = d[j+1] = d[j+2] = 255; d[j+3] = Math.round(w * 255);
  }
  mx.putImageData(id, 0, 0);
  var b = cvs(W, H), bx = b.getContext("2d"); bx.filter = "blur(" + Math.max(0.6, Math.min(W, H) / 400).toFixed(1) + "px)"; bx.drawImage(m, 0, 0); return b;
}
function applySels(c, list){
  if(!list.length) return; var sm = smallCopy(c, 900);
  list.forEach(function(p){
    if(!(p.lum || p.con || p.sat || p.str)) return; var m = pointMask(sm, p);
    applyMasked(c, m, "lum", (p.lum || 0) / 100); applyMasked(c, m, "con", (p.con || 0) / 100);
    applyMasked(c, m, "sat", (p.sat || 0) / 100); applyMasked(c, m, "str", (p.str || 0) / 100);
  });
}
/* masques du pinceau : un par effet et par sens (+ / -), la gomme efface tout */
function brushMasks2(W, H, list){
  var k = Math.min(1, 1600 / Math.max(W, H)), MW = Math.max(8, Math.round(W * k)), MH = Math.max(8, Math.round(H * k)), mn = Math.min(MW, MH), M = {};
  function get(key){ if(!M[key]){ M[key] = cvs(MW, MH); } return M[key]; }
  list.forEach(function(s){
    var keys = s.v ? [s.k + (s.v > 0 ? "+" : "-")] : Object.keys(M), r = Math.max(1.5, s.r * mn), a = Math.min(1, Math.abs(s.v) / 100);
    keys.forEach(function(key){
      var x = get(key).getContext("2d"); x.save();
      if(!s.v) x.globalCompositeOperation = "destination-out";
      var pts = s.pts.map(function(p){ return [p[0] * MW, p[1] * MH]; }), stamps = [pts[0]];
      for(var i = 1; i < pts.length; i++){ var a0 = pts[i-1], a1 = pts[i], dist = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]), n = Math.ceil(dist / (r * 0.3)); for(var t = 1; t <= n; t++) stamps.push([a0[0] + (a1[0] - a0[0]) * t / n, a0[1] + (a1[1] - a0[1]) * t / n]); }
      stamps.forEach(function(p){ var g = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, "rgba(255,255,255," + (s.v ? 0.22 * a : 0.5) + ")"); g.addColorStop(0.6, "rgba(255,255,255," + (s.v ? 0.12 * a : 0.3) + ")"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r); });
      x.restore();
    });
  });
  return M;
}
function applyBrushes(c, list){
  if(!list.length) return; var M = brushMasks2(c.width, c.height, list);
  Object.keys(M).forEach(function(key){ applyMasked(c, M[key], key.slice(0, -1), key.slice(-1) === "+" ? 1 : -1); });
}

/* ---------- outils communs aux deux ecrans : affichage avec zoom / deplacement ---------- */
function viewer(cv, wrap, getImg){
  var V = {zoom:1, ox:0, oy:0, dpr:window.devicePixelRatio || 1};
  V.fit = function(){ var im = getImg(); return Math.min(cv.width / im.width, cv.height / im.height); };
  V.scale = function(){ return V.fit() * V.zoom; };
  V.clamp = function(){ var im = getImg(), s = V.scale(), vw = cv.width / s, vh = cv.height / s;
    V.ox = vw >= im.width ? (im.width - vw) / 2 : Math.max(0, Math.min(im.width - vw, V.ox)); V.oy = vh >= im.height ? (im.height - vh) / 2 : Math.max(0, Math.min(im.height - vh, V.oy)); };
  V.size = function(){ var CW = Math.max(10, wrap.clientWidth), CH = Math.max(10, wrap.clientHeight); if(cv.width !== Math.round(CW * V.dpr) || cv.height !== Math.round(CH * V.dpr)){ cv.width = Math.round(CW * V.dpr); cv.height = Math.round(CH * V.dpr); } V.clamp(); };
  V.draw = function(img){ var x = cv.getContext("2d"), s = V.scale(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#111"; x.fillRect(0, 0, cv.width, cv.height); x.setTransform(s, 0, 0, s, -V.ox * s, -V.oy * s); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0); };
  V.toImg = function(e){ var r = cv.getBoundingClientRect(), s = V.scale(); return [V.ox + (e.clientX - r.left) * V.dpr / s, V.oy + (e.clientY - r.top) * V.dpr / s]; };
  V.toScr = function(ix, iy){ var s = V.scale(); return [(ix - V.ox) * s, (iy - V.oy) * s]; };
  V.pinchStart = function(a, b){ var r = cv.getBoundingClientRect(), mx = ((a.x + b.x) / 2 - r.left) * V.dpr, my = ((a.y + b.y) / 2 - r.top) * V.dpr; V.pin = {d:Math.hypot(a.x - b.x, a.y - b.y), z:V.zoom, ix:V.ox + mx / V.scale(), iy:V.oy + my / V.scale()}; };
  V.pinchMove = function(a, b){ var r = cv.getBoundingClientRect(); V.zoom = Math.max(1, Math.min(10, V.pin.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, V.pin.d))); var mx = ((a.x + b.x) / 2 - r.left) * V.dpr, my = ((a.y + b.y) / 2 - r.top) * V.dpr, s = V.scale(); V.ox = V.pin.ix - mx / s; V.oy = V.pin.iy - my / s; V.clamp(); };
  return V;
}
function localBase(){ var ph = needPhoto(); if(!ph) return null; var b = smallCopy(ph, 1100); var all = get(); if(curveOn(all)) applyCurves(b.getContext("2d"), b.width, b.height, all); return b; }
var BTN = 'style="border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-weight:900;padding:8px 10px;font-size:13px"';

/* ================= ECRAN PINCEAU ================= */
var BK = [["lum", T("Lumière", "Light")], ["temp", T("Température", "Temperature")], ["sat", T("Saturation", "Saturation")], ["str", T("Structure", "Structure")]];
function brushTool(){
  var base = localBase(); if(!base) return;
  var list = brushes.slice(), redo = [], kind = "lum", val = 30, size = 22, showOrig = false, showMask = false, rendered = null;
  show('<div class="x2Top"><div class="jmsTitle">🖌️ ' + T("PINCEAU", "BRUSH") + '</div>' +
     '<button id="x2BEye" style="background:#3a3a3a">👁</button><button data-a="mask" id="x2BMk" style="background:#3a3a3a">▦</button>' +
     '<button data-a="undo" style="background:#3a3a3a">↶</button><button data-a="redo" style="background:#3a3a3a">↷</button><button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2BW" style="position:relative;touch-action:none"><canvas id="x2BC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas></div>' +
   '<div class="x2Hint" id="x2BH" style="flex:none;margin:2px 0">' + T("Peins sur la photo. Deux doigts pour zoomer et se déplacer.", "Paint on the photo. Two fingers to zoom and move.") + '</div>' +
   '<div class="x2Chips" id="x2BK">' + BK.map(function(k){ return '<button data-a="kind" data-k="' + k[0] + '">' + k[1] + '</button>'; }).join("") + '</div>' +
   '<div class="x2Chips" id="x2BV">' + [-100, -50, -25, 0, 25, 50, 100].map(function(v){ return '<button data-a="val" data-v="' + v + '">' + (v ? (v > 0 ? "+" : "") + v : "🧽 " + T("Gomme", "Eraser")) + '</button>'; }).join("") + '</div>' +
   '<div style="flex:none;display:flex;align-items:center;gap:10px;padding:4px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     '<div style="flex:1"><div class="x2Lb" style="margin:0;text-align:center">' + T("Taille du pinceau", "Brush size") + ' : <b id="x2BSv">22</b></div><input type="range" id="x2BS" min="6" max="70" value="22" style="width:100%"></div>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var cv = $("x2BC"), wrap = $("x2BW"), V = viewer(cv, wrap, function(){ return base; }), trail = null;
  function marks(){
    Array.prototype.forEach.call($("x2BK").children, function(b){ var on = b.dataset.k === kind; b.style.background = on ? "#1E88E5" : ""; });
    Array.prototype.forEach.call($("x2BV").children, function(b){ var on = +b.dataset.v === val; b.style.background = on ? (val > 0 ? "#43A047" : val < 0 ? "#C62828" : "#6D4C41") : ""; });
    $("x2BMk").style.outline = showMask ? "3px solid #FFD600" : "";
  }
  function render(){ var c = cvs(base.width, base.height); c.getContext("2d").drawImage(base, 0, 0); applyBrushes(c, list); rendered = c; draw(); }
  function draw(){
    if(!document.body.contains(cv)) return; V.size();
    V.draw(showOrig ? base : (rendered || base));
    var x = cv.getContext("2d");
    if(showMask && list.length){ var M = brushMasks2(base.width, base.height, list), s = V.scale(); x.save(); x.setTransform(s, 0, 0, s, -V.ox * s, -V.oy * s); x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, 0, base.width, base.height);
      Object.keys(M).forEach(function(k){ var t = cvs(M[k].width, M[k].height), tx = t.getContext("2d"); tx.drawImage(M[k], 0, 0); tx.globalCompositeOperation = "source-in"; tx.fillStyle = k.slice(-1) === "+" ? "rgb(255,30,30)" : "rgb(40,130,255)"; tx.fillRect(0, 0, t.width, t.height); x.drawImage(t, 0, 0, base.width, base.height); }); x.restore(); }
    if(trail && trail.length){ var s2 = V.scale(); x.save(); x.setTransform(s2, 0, 0, s2, -V.ox * s2, -V.oy * s2); x.strokeStyle = x.fillStyle = val ? "rgba(255,60,60,.45)" : "rgba(255,255,255,.45)"; x.lineCap = x.lineJoin = "round"; x.lineWidth = 2 * trail.r;
      x.beginPath(); x.moveTo(trail[0][0], trail[0][1]); for(var i = 1; i < trail.length; i++) x.lineTo(trail[i][0], trail[i][1]); if(trail.length === 1){ x.arc(trail[0][0], trail[0][1], trail.r, 0, 7); x.fill(); } else x.stroke(); x.restore(); }
  }
  var ptrs = {}, mode = null;
  cv.onpointerdown = function(e){ cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = {x:e.clientX, y:e.clientY}; var k = Object.keys(ptrs);
    if(k.length === 1){ mode = "paint"; trail = [V.toImg(e)]; trail.r = size * V.dpr / V.scale(); draw(); }
    else if(k.length === 2){ mode = "pinch"; trail = null; V.pinchStart(ptrs[k[0]], ptrs[k[1]]); draw(); } };
  cv.onpointermove = function(e){ if(!ptrs[e.pointerId]) return; ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(mode === "paint" && trail){ var p = V.toImg(e), l = trail[trail.length - 1]; if(Math.hypot(p[0] - l[0], p[1] - l[1]) > trail.r * 0.25){ trail.push(p); draw(); } }
    else if(mode === "pinch"){ var k = Object.keys(ptrs); if(k.length === 2){ V.pinchMove(ptrs[k[0]], ptrs[k[1]]); draw(); } } };
  function up(e){ if(!ptrs[e.pointerId]) return; delete ptrs[e.pointerId];
    if(mode === "paint" && trail && !Object.keys(ptrs).length){ list.push({k:kind, v:val, r:trail.r / Math.min(base.width, base.height), pts:trail.map(function(p){ return [p[0] / base.width, p[1] / base.height]; })}); redo = []; trail = null; render(); }
    if(!Object.keys(ptrs).length) mode = null; }
  cv.onpointerup = up; cv.onpointercancel = up;
  $("x2BS").oninput = function(){ size = +this.value; $("x2BSv").textContent = this.value; };
  var eye = $("x2BEye"); eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.kind = function(b){ kind = b.dataset.k; if(!val) val = 30; marks(); };
  HH.val = function(b){ val = +b.dataset.v; marks(); };
  HH.mask = function(){ showMask = !showMask; marks(); draw(); };
  HH.undo = function(){ if(list.length){ redo.push(list.pop()); render(); } };
  HH.redo = function(){ var r = redo.pop(); if(r){ list.push(r); render(); } };
  HH.help = function(){ var h = $("x2BH"); h.style.color = "#FFD600"; h.textContent = T("Choisis l'effet puis la force (+ / −), peins au doigt. 🧽 Gomme efface. ▦ montre les zones peintes (rouge = plus, bleu = moins). 👁 maintenu = sans pinceau.", "Pick the effect then the strength (+ / −), paint with your finger. 🧽 Eraser removes. ▦ shows painted areas (red = more, blue = less). Hold 👁 = without brush."); };
  HH.cancel = hide;
  HH.ok = function(){ brushes = list.slice(); hide(); if(localOn()) note("🖌️ " + T("Pinceau appliqué à l'enregistrement de cette photo", "Brush applied when this photo is saved")); };
  marks(); window.addEventListener("resize", draw); requestAnimationFrame(render);
}

/* ================= ECRAN SELECTION (points) ================= */
var SP = [["lum", T("Luminosité", "Brightness"), -100, 100], ["con", T("Contraste", "Contrast"), -100, 100], ["sat", T("Saturation", "Saturation"), -100, 100], ["str", T("Structure", "Structure"), -100, 100], ["r", T("Taille", "Size"), 3, 60]];
function selTool(){
  var base = localBase(); if(!base) return;
  var list = sels.map(function(p){ return Object.assign({}, p); }), cur = list.length ? list.length - 1 : -1, idx = 0, adding = !list.length, showOrig = false, showMask = false, rendered = null;
  show('<div class="x2Top"><div class="jmsTitle">🎯 ' + T("SÉLECTION", "SELECTIVE") + '</div>' +
     '<button id="x2SEye" style="background:#3a3a3a">👁</button><button data-a="mask" id="x2SMk" style="background:#3a3a3a">▦</button><button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2SW" style="position:relative;touch-action:none"><canvas id="x2SC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>' +
     '<div id="x2SL" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);background:#000b;color:#fff;font-weight:900;font-size:17px;padding:8px 16px;border-radius:20px;white-space:nowrap;pointer-events:none"></div>' +
     '<div id="x2SM" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000d;border-radius:14px;padding:6px 0;display:none;min-width:200px;pointer-events:none"></div></div>' +
   '<div class="x2Hint" id="x2SH" style="flex:none;margin:2px 0"></div>' +
   '<div style="flex:none;display:flex;gap:6px;margin:2px 0"><button data-a="add" id="x2SAdd" ' + BTN + '>＋ ' + T("Point", "Point") + '</button><button data-a="del" ' + BTN + '>🗑 ' + T("Supprimer", "Delete") + '</button><button data-a="pick" ' + BTN + '>☰</button>' +
     '<div style="flex:1;font-weight:800;color:#ddd;align-self:center;text-align:right" id="x2SN"></div><div id="x2SV" style="font-weight:900;color:#FFD600;font-family:monospace;font-size:16px;align-self:center;min-width:40px;text-align:right"></div></div>' +
   '<canvas id="x2SR" style="display:block;flex:none;width:100%;height:46px;touch-action:none"></canvas>' +
   '<div style="display:flex;align-items:center;justify-content:space-between;flex:none;padding:6px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var cv = $("x2SC"), wrap = $("x2SW"), V = viewer(cv, wrap, function(){ return base; }), rul = $("x2SR"), rx = rul.getContext("2d"), menu = $("x2SM");
  function pv(p, k){ return k === "r" ? Math.round(p.r * 100) : (p[k] || 0); }
  function fmt(k, v){ return k === "r" ? v + " %" : (v > 0 ? "+" : "") + v; }
  function labels(){
    var p = list[cur], s = SP[idx];
    $("x2SAdd").style.outline = adding ? "3px solid #FFD600" : ""; $("x2SMk").style.outline = showMask ? "3px solid #FFD600" : "";
    $("x2SH").style.color = adding ? "#FFD600" : "";
    $("x2SH").textContent = adding ? T("Touche la photo à l'endroit à modifier.", "Tap the photo where you want to adjust.") : T("Glisse ↕ : réglage • ↔ : valeur • fais glisser un point pour le déplacer.", "Swipe ↕: setting • ↔: value • drag a point to move it.");
    $("x2SL").textContent = p ? s[1] + "  " + fmt(s[0], pv(p, s[0])) : T("Ajoute un point", "Add a point"); $("x2SN").textContent = s[1]; $("x2SV").textContent = p ? fmt(s[0], pv(p, s[0])) : "";
    var dpr = V.dpr, W = rul.clientWidth * dpr, H = 46 * dpr; if(rul.width !== W) rul.width = W; rul.height = H; rx.clearRect(0, 0, W, H);
    for(var i = 0; i <= 60; i++){ var xx = 8 * dpr + (W - 16 * dpr) * i / 60; rx.fillStyle = "#bbb"; rx.fillRect(xx - dpr, H * 0.35, 2 * dpr, H * 0.45); }
    if(p){ var f = (pv(p, s[0]) - s[2]) / (s[3] - s[2]), z = Math.max(0, (0 - s[2]) / (s[3] - s[2])), zx = 8 * dpr + (W - 16 * dpr) * z, vx = 8 * dpr + (W - 16 * dpr) * f;
      rx.fillStyle = "rgba(255,214,0,.35)"; rx.fillRect(Math.min(zx, vx), H * 0.35, Math.abs(vx - zx), H * 0.45); rx.fillStyle = "#FFD600"; rx.fillRect(vx - 2 * dpr, H * 0.2, 4 * dpr, H * 0.65); rx.beginPath(); rx.moveTo(vx - 8 * dpr, 0); rx.lineTo(vx + 8 * dpr, 0); rx.lineTo(vx, H * 0.2); rx.fill(); }
  }
  var pend = 0;
  function render(){ var c = cvs(base.width, base.height); c.getContext("2d").drawImage(base, 0, 0); applySels(c, list); rendered = c; draw(); }
  function later(){ if(!pend) pend = requestAnimationFrame(function(){ pend = 0; render(); }); }
  function draw(){
    if(!document.body.contains(cv)) return; V.size(); V.draw(showOrig ? base : (rendered || base));
    var x = cv.getContext("2d"), mn = Math.min(base.width, base.height), s = V.scale();
    if(showMask && list[cur]){ var m = pointMask(smallCopy(base, 900), list[cur]), t = cvs(m.width, m.height), tx = t.getContext("2d"); tx.drawImage(m, 0, 0); tx.globalCompositeOperation = "source-in"; tx.fillStyle = "rgb(255,30,30)"; tx.fillRect(0, 0, t.width, t.height);
      x.save(); x.setTransform(s, 0, 0, s, -V.ox * s, -V.oy * s); x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, 0, base.width, base.height); x.globalAlpha = 0.9; x.drawImage(t, 0, 0, base.width, base.height); x.restore(); }
    list.forEach(function(p, i){ var q = V.toScr(p.x * base.width, p.y * base.height), on = i === cur;
      if(on){ x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 2 * V.dpr; x.setLineDash([6 * V.dpr, 6 * V.dpr]); x.beginPath(); x.arc(q[0], q[1], p.r * mn * s, 0, 7); x.stroke(); x.setLineDash([]); }
      x.fillStyle = on ? "#1E88E5" : "rgba(255,255,255,.85)"; x.strokeStyle = "#000"; x.lineWidth = 2 * V.dpr; x.beginPath(); x.arc(q[0], q[1], 13 * V.dpr, 0, 7); x.fill(); x.stroke();
      x.fillStyle = on ? "#fff" : "#000"; x.font = "bold " + (12 * V.dpr) + "px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(SP[idx][0] === "r" ? "○" : SP[idx][1][0], q[0], q[1] + V.dpr); });
  }
  function hit(e){ var r = cv.getBoundingClientRect(), mxp = (e.clientX - r.left) * V.dpr, myp = (e.clientY - r.top) * V.dpr, best = -1, bd = 26 * V.dpr;
    list.forEach(function(p, i){ var q = V.toScr(p.x * base.width, p.y * base.height), d = Math.hypot(q[0] - mxp, q[1] - myp); if(d < bd){ bd = d; best = i; } }); return best; }
  var g = null;
  cv.onpointerdown = function(e){ cv.setPointerCapture(e.pointerId);
    if(adding){ var ip = V.toImg(e); if(ip[0] >= 0 && ip[1] >= 0 && ip[0] <= base.width && ip[1] <= base.height){ list.push({x:ip[0] / base.width, y:ip[1] / base.height, r:0.12, lum:0, con:0, sat:0, str:0}); cur = list.length - 1; idx = 0; adding = false; labels(); render(); } return; }
    var h = hit(e); g = {x:e.clientX, y:e.clientY, mode:h >= 0 ? "pt" : null, h:h, i0:idx, v0:list[cur] ? pv(list[cur], SP[idx][0]) : 0};
    if(h >= 0){ cur = h; g.v0 = pv(list[cur], SP[idx][0]); labels(); draw(); } };
  cv.onpointermove = function(e){
    if(!g) return; var dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(g.mode === "pt"){ if(Math.hypot(dx, dy) > 6){ var ip = V.toImg(e), p = list[cur]; p.x = Math.max(0, Math.min(1, ip[0] / base.width)); p.y = Math.max(0, Math.min(1, ip[1] / base.height)); later(); } return; }
    if(!list[cur]) return;
    if(!g.mode && Math.hypot(dx, dy) > 10) g.mode = Math.abs(dy) > Math.abs(dx) ? "menu" : "value";
    if(g.mode === "value"){ var s = SP[idx], v = Math.max(s[2], Math.min(s[3], Math.round(g.v0 + dx * (s[3] - s[2]) / (wrap.clientWidth * 2)))); if(s[0] === "r") list[cur].r = v / 100; else list[cur][s[0]] = v; labels(); later(); }
    else if(g.mode === "menu"){ var i = Math.max(0, Math.min(SP.length - 1, g.i0 + Math.round(dy / 30))); if(i !== g.sel){ g.sel = i;
      menu.innerHTML = SP.map(function(t, j){ return '<div style="padding:9px 18px;font-weight:900;font-size:15px;' + (j === i ? 'background:#1E88E5;color:#fff' : 'color:#ccc') + '">' + t[1] + '<span style="float:right;margin-left:14px;color:' + (j === i ? '#fff' : '#FFD600') + '">' + fmt(t[0], pv(list[cur], t[0])) + '</span></div>'; }).join(""); menu.style.display = "block"; } } };
  function up(){ if(g && g.mode === "menu" && g.sel !== undefined){ idx = g.sel; labels(); draw(); } menu.style.display = "none"; g = null; }
  cv.onpointerup = up; cv.onpointercancel = up;
  function rulerSet(e){ var p = list[cur]; if(!p) return; var s = SP[idx], b = rul.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - b.left - 8) / (b.width - 16))), v = Math.round(s[2] + f * (s[3] - s[2])); if(s[0] === "r") p.r = v / 100; else p[s[0]] = v; labels(); later(); }
  rul.onpointerdown = function(e){ rul.setPointerCapture(e.pointerId); rulerSet(e); rul.onpointermove = rulerSet; };
  rul.onpointerup = rul.onpointercancel = function(){ rul.onpointermove = null; };
  var eye = $("x2SEye"); eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.add = function(){ adding = !adding; labels(); };
  HH.del = function(){ if(cur >= 0){ list.splice(cur, 1); cur = list.length - 1; labels(); render(); } };
  HH.pick = function(){ idx = (idx + 1) % SP.length; labels(); draw(); };
  HH.mask = function(){ showMask = !showMask; labels(); draw(); };
  HH.help = function(){ var h = $("x2SH"); h.style.color = "#FFD600"; h.textContent = T("＋ Point puis touche la photo. Glisse ↕ pour choisir (Luminosité, Contraste, Saturation, Structure, Taille), ↔ pour régler. ▦ montre la zone touchée. Plusieurs points possibles.", "＋ Point then tap the photo. Swipe ↕ to pick (Brightness, Contrast, Saturation, Structure, Size), ↔ to adjust. ▦ shows the affected area. Several points allowed."); };
  HH.cancel = hide;
  HH.ok = function(){ sels = list.filter(function(p){ return p.lum || p.con || p.sat || p.str; }); hide(); if(sels.length) note("🎯 " + T("Sélection appliquée à l'enregistrement de cette photo", "Selective edit applied when this photo is saved")); };
  labels(); window.addEventListener("resize", draw); requestAnimationFrame(render);
}

/* ================= DOUBLE EXPOSITION (photo ouverte seulement) =================
   La 2e photo est gardee en memoire (fichier) : apercu reduit pendant le reglage, pleine taille a l'enregistrement.
   Placement en fractions de la photo principale : centre (x, y), echelle s (1 = couvre la photo), rotation rot (radians). */
var dbl = null;   /* {blob, prev (canvas reduit), w, h, x, y, s, rot, op, mode} */
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple){ dbl = null; } }, true);
var DBLM = [["source-over", T("Normal", "Normal")], ["screen", T("Éclaircir", "Lighten")], ["multiply", T("Assombrir", "Darken")], ["overlay", T("Superposition", "Overlay")], ["lighter", T("Ajouter", "Add")]];
function dblOn(){ return !!(dbl && dbl.op > 0); }
function dblDraw(c, img, d){
  var W = c.width, H = c.height, iw = img.width, ih = img.height, cover = Math.max(W / iw, H / ih), x = c.getContext("2d");
  x.save(); x.globalAlpha = Math.max(0, Math.min(1, d.op / 100)); x.globalCompositeOperation = d.mode; x.imageSmoothingQuality = "high";
  x.translate(d.x * W, d.y * H); x.rotate(d.rot || 0); x.scale(cover * d.s, cover * d.s); x.drawImage(img, -iw / 2, -ih / 2); x.restore();
}
async function applyDbl(c, d){ var bmp = await createImageBitmap(d.blob); try{ dblDraw(c, bmp, d); } finally { if(bmp.close) bmp.close(); } }
function pickImage(){ return new Promise(function(res){ var i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = function(){ res(i.files && i.files[0] || null); }; i.click(); }); }
async function loadLayer(f){ var bmp = await createImageBitmap(f), k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height)), p = cvs(bmp.width * k, bmp.height * k); p.getContext("2d").drawImage(bmp, 0, 0, p.width, p.height); if(bmp.close) bmp.close(); return p; }
function dblTool(){
  var base = localBase(); if(!base) return;
  var d = dbl ? Object.assign({}, dbl) : null, showOrig = false;
  show('<div class="x2Top"><div class="jmsTitle">🖼️ ' + T("DOUBLE EXPOSITION", "DOUBLE EXPOSURE") + '</div>' +
     '<button id="x2DEye" style="background:#3a3a3a">👁</button><button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2DW" style="position:relative;touch-action:none"><canvas id="x2DC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>' +
     '<div id="x2DMsg" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000c;color:#fff;font-weight:900;padding:12px 18px;border-radius:14px;text-align:center;display:none"></div></div>' +
   '<div class="x2Hint" id="x2DH" style="flex:none;margin:2px 0">' + T("Un doigt : déplacer la 2ᵉ photo • deux doigts : agrandir et tourner.", "One finger: move the 2nd photo • two fingers: resize and rotate.") + '</div>' +
   '<div class="x2Chips" id="x2DM">' + DBLM.map(function(m){ return '<button data-a="mode" data-m="' + m[0] + '">' + m[1] + '</button>'; }).join("") + '</div>' +
   '<div style="flex:none;display:flex;align-items:center;gap:10px;padding:2px 0"><button data-a="photo" ' + BTN + '>📷 ' + T("Photo", "Photo") + '</button>' +
     '<div style="flex:1"><div class="x2Lb" style="margin:0;text-align:center">' + T("Opacité", "Opacity") + ' : <b id="x2DOv">50</b> %</div><input type="range" id="x2DO" min="0" max="100" value="50" style="width:100%"></div>' +
     '<button data-a="center" ' + BTN + '>⌖</button></div>' +
   '<div style="display:flex;align-items:center;justify-content:space-between;flex:none;padding:4px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     '<button data-a="remove" style="border:0;background:#3a3a3a;color:#fff;border-radius:22px;padding:10px 18px;font-weight:900">' + T("Retirer", "Remove") + '</button>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var cv = $("x2DC"), wrap = $("x2DW"), V = viewer(cv, wrap, function(){ return base; }), pend = 0;
  function marks(){
    Array.prototype.forEach.call($("x2DM").children, function(b){ b.style.background = d && b.dataset.m === d.mode ? "#1E88E5" : ""; });
    if(d){ $("x2DO").value = d.op; $("x2DOv").textContent = d.op; }
    var m = $("x2DMsg"); m.style.display = d ? "none" : "block"; m.textContent = T("Touchez 📷 Photo pour choisir la 2ᵉ photo", "Tap 📷 Photo to choose the 2nd photo");
  }
  function draw(){
    if(!document.body.contains(cv)) return; V.size();
    var c = cvs(base.width, base.height); c.getContext("2d").drawImage(base, 0, 0);
    if(d && !showOrig) dblDraw(c, d.prev, d);
    V.draw(c);
  }
  function later(){ if(!pend) pend = requestAnimationFrame(function(){ pend = 0; draw(); }); }
  async function choose(){
    var f = await pickImage(); if(!f) return;
    try{ var prev = await loadLayer(f); }catch(e){ alert(T("Photo illisible (format non pris en charge).", "Unreadable photo (unsupported format).")); return; }
    d = Object.assign({x:0.5, y:0.5, s:1, rot:0, op:50, mode:"screen"}, d || {}, {blob:f, prev:prev}); marks(); draw();
  }
  /* gestes : un doigt deplace, deux doigts agrandissent et tournent */
  var ptrs = {}, g = null;
  function two(){ var k = Object.keys(ptrs); return [ptrs[k[0]], ptrs[k[1]]]; }
  cv.onpointerdown = function(e){
    if(!d) return; cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = {x:e.clientX, y:e.clientY}; var n = Object.keys(ptrs).length;
    if(n === 1) g = {m:"move", x:e.clientX, y:e.clientY, dx:d.x, dy:d.y};
    else if(n === 2){ var p = two(); g = {m:"pinch", dist:Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), ang:Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), s:d.s, rot:d.rot}; }
  };
  cv.onpointermove = function(e){
    if(!d || !ptrs[e.pointerId] || !g) return; ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(g.m === "move" && Object.keys(ptrs).length === 1){ var sc = V.scale() / V.dpr; d.x = g.dx + (e.clientX - g.x) / sc / base.width; d.y = g.dy + (e.clientY - g.y) / sc / base.height; later(); }
    else if(g.m === "pinch" && Object.keys(ptrs).length === 2){ var p = two(); d.s = Math.max(0.1, Math.min(6, g.s * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / Math.max(10, g.dist))); d.rot = g.rot + Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) - g.ang; later(); }
  };
  function up(e){ delete ptrs[e.pointerId]; var k = Object.keys(ptrs); if(k.length === 1 && d){ var q = ptrs[k[0]]; g = {m:"move", x:q.x, y:q.y, dx:d.x, dy:d.y}; } else if(!k.length) g = null; }
  cv.onpointerup = up; cv.onpointercancel = up;
  $("x2DO").oninput = function(){ if(d){ d.op = +this.value; $("x2DOv").textContent = this.value; later(); } };
  var eye = $("x2DEye"); eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.photo = function(){ choose(); };
  HH.mode = function(b){ if(d){ d.mode = b.dataset.m; marks(); later(); } };
  HH.center = function(){ if(d){ d.x = 0.5; d.y = 0.5; d.s = 1; d.rot = 0; later(); } };
  HH.remove = function(){ d = null; marks(); draw(); };
  HH.help = function(){ var h = $("x2DH"); h.style.color = "#FFD600"; h.textContent = T("📷 choisir la 2ᵉ photo • un doigt : déplacer • deux doigts : agrandir / tourner • mode de mélange et opacité en bas • ⌖ recentrer • 👁 maintenu : sans la 2ᵉ photo.", "📷 choose the 2nd photo • one finger: move • two fingers: resize / rotate • blend mode and opacity below • ⌖ recenter • hold 👁: without the 2nd photo."); };
  HH.cancel = hide;
  HH.ok = function(){ dbl = d; hide(); if(dblOn()) note("🖼️ " + T("Double exposition appliquée à l'enregistrement de cette photo", "Double exposure applied when this photo is saved")); };
  marks(); window.addEventListener("resize", draw); requestAnimationFrame(draw);
  if(!d) setTimeout(choose, 80);
}

/* ================= GRILLE OUTILS ================= */
function tuneOn(){ var sl = tuneSliders(); return sl.slice(1).some(function(r){ return +r.value !== 0; }); }
var GRID = [
  [T("Réglages", "Adjust"), [["tune", "🎛️", T("Retouches", "Tune"), function(){ return tuneOn(); }], ["details", "🔎", T("Détails", "Details"), function(s){ return detailsOn(s); }], ["curves", "📈", T("Courbes", "Curves"), function(s){ return curveOn(s); }], ["wb", "💧", T("Balance des blancs", "White balance"), function(s){ return wbOn(s); }], ["tone", "🌗", T("Contraste des tons", "Tonal contrast"), function(s){ return toneOn(s); }]]],
  [T("Retouche locale", "Local"), [["sel", "🎯", T("Sélection", "Selective"), function(){ return sels.some(function(p){ return p.lum || p.con || p.sat || p.str; }); }], ["brush", "🖌️", T("Pinceau", "Brush"), function(){ return brushes.some(function(b){ return b.v; }); }], ["heal", "🩹", T("Correcteur", "Healing"), function(){ return heals.length > 0; }]]],
  [T("Cadrage", "Framing"), [["crop", "✂️", T("Recadrer", "Crop"), function(){ return geoOn(); }]]],
  [T("Créatif", "Creative"), [["drama", "🎭", T("Théâtral", "Drama"), function(s){ return dramaOn(s); }], ["hdr", "🌄", "HDR", function(s){ return hdrOn(s); }], ["dbl", "🖼️", T("Double exposition", "Double exposure"), function(){ return dblOn(); }], ["glow", "✨", T("Éclat glamour", "Glamour glow"), function(s){ return glowOn(s); }], ["fx", "🌤️", T("Effets (ciel, visage, peau, grain, N&B…)", "Effects (sky, face, skin, grain, B&W…)"), function(){ return !!(window.__jmsFX && window.__jmsFX.get && (function(f){ return f.sky || f.face || f.grad || f.grain || f.bw || f.smooth || f.denoise || f.crop || f.wm; })(window.__jmsFX.get())); }]]]
];
function openTool(k){
  if(k === "tune") return tune(); if(k === "crop") return crop(); if(k === "curves") return curves(); if(k === "heal") return healer(); if(k === "sel") return selTool(); if(k === "dbl") return dblTool(); if(k === "brush") return brushTool();
  if(k === "fx"){ if(window.__jmsX && window.__jmsX.x_fx) window.__jmsX.x_fx(); return; }
  paramTool(k);
}
function toolsGrid(){
  var s = get();
  show('<div class="x2Top"><div class="jmsTitle">🧰 ' + T("OUTILS", "TOOLS") + '</div><button data-a="close" style="background:#3a3a3a">✕</button></div>' +
   '<div style="overflow-y:auto;flex:1">' + GRID.map(function(sec){
     return '<div class="x2Sec">' + sec[0] + '</div><div class="x2Grid">' + sec[1].map(function(t){
       return '<button class="x2Tool" data-a="tool" data-k="' + t[0] + '"><span class="i">' + t[1] + '</span>' + t[2] + (t[3](s) ? '<i class="dot"></i>' : '') + '</button>'; }).join("") + '</div>'; }).join("") +
   '<div class="x2Hint" style="margin-top:10px">' + T("Un point jaune = outil actif sur cette photo.", "A yellow dot = tool in use on this photo.") + '</div></div>', true);
  HH.tool = function(b){ var k = b.dataset.k; hide(); setTimeout(function(){ openTool(k); }, 30); };
  HH.close = hide;
}
window.__jmsTools = toolsGrid;
window.__jmsOpenTool = openTool;

/* ---------- branchement dans le rendu des effets ---------- */
async function pre(bmp, Q){
  var s = get(), single = Q && Q.single, c = null;
  function base(){ if(!c){ c = cvs(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0); } return c; }
  if(single && heals.length) healAll(base(), heals);
  if(single && sels.length) applySels(base(), sels);
  if(single && brushes.length) applyBrushes(base(), brushes);
  if(single && dblOn()) await applyDbl(base(), dbl);
  if(curveOn(s)){ var b = base(); applyCurves(b.getContext("2d"), b.width, b.height, s); }
  if(single && geoOn()) c = geometry(c || bmp, geo);
  if(lookOn(s)) c = looks(c || bmp, s);
  return c || bmp;
}
function post(c, Q){ return c; }
function exifDate(){ return Promise.resolve(null); }
window.__jmsFX2 = {pre:pre, post:post, active:active, summary:summary, exifDate:exifDate, get:get};

/* ---------- image de travail pour les editeurs (apercu corrige, sans bandes sombres) ---------- */
/* dimensions reelles de la photo ouverte : pour retrouver exactement la photo dans l'apercu (meme si ses bords sont sombres) */
var nat = null, natImg = null;
document.addEventListener("change", function(e){
  var t = e.target; if(!t || t.type !== "file" || t.multiple || !t.files || !t.files[0]) return;
  nat = null; natImg = null; var u = URL.createObjectURL(t.files[0]), im = new Image();
  im.onload = function(){ nat = {w:im.naturalWidth, h:im.naturalHeight}; natImg = im; URL.revokeObjectURL(u); };
  im.onerror = function(){ URL.revokeObjectURL(u); };
  im.src = u;
}, true);
function photo(){
  var c = document.getElementById("filteredCanvas"); if(!c || c.style.display === "none" || c.width < 10) return null;
  if(nat && nat.w && nat.h){
    var k = Math.min(c.width / nat.w, c.height / nat.h), w = Math.round(nat.w * k), h = Math.round(nat.h * k);
    var o = cvs(w, h); o.getContext("2d").drawImage(c, Math.round((c.width - w) / 2), Math.round((c.height - h) / 2), w, h, 0, 0, w, h); return o;
  }
  return window.__jmsCrop ? window.__jmsCrop(c) : c;
}
window.__jmsPhoto = photo;
function needPhoto(){ var p = photo(); if(!p) alert(T("Ouvre d'abord une image (bouton OUVRIR IMAGE en haut).", "First open an image (OPEN IMAGE button at the top).")); return p; }

/* ---------- fenetre commune ---------- */
var css = document.createElement("style");
css.textContent =
"#jx2Bar #x2TB{width:100%;display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;border:0;border-radius:16px;padding:12px 14px;background:linear-gradient(90deg,#1565C0,#6A1B9A);color:#fff;font-weight:900;font-size:17px;text-align:left;box-shadow:0 3px 8px #0007}" +
"#jx2Bar #x2TB .i{font-size:26px}#jx2Bar #x2TB .t{flex:1}#jx2Bar #x2TB small{display:block;font-weight:600;font-size:11px;opacity:.9;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw}" +
".x2Sec{font-weight:900;font-size:13px;letter-spacing:.08em;color:#C9A24A;margin:14px 2px 6px;text-transform:uppercase}" +
".x2Grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}" +
".x2Tool{position:relative;border:0;border-radius:14px;background:#2a2a2a;color:#fff;font-weight:800;font-size:12px;padding:12px 4px;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:78px}" +
".x2Tool .i{font-size:26px}.x2Tool .dot{position:absolute;top:7px;right:7px;width:10px;height:10px;border-radius:50%;background:#FFD600;box-shadow:0 0 6px #FFD600}" +
"#jx2Bar{display:block;margin:0 0 10px}" +
"#jx2Bar button{border:0;border-radius:14px;padding:10px 2px;font-weight:900;font-size:11px;color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:0 3px 8px #0007}" +
"#jx2Bar button .i{font-size:22px;line-height:1}#jx2Bar button.on{outline:3px solid #FFB300;outline-offset:1px}" +
"#jx2Bar .b0{background:#1565C0}#jx2Bar .b1{background:#6D4C41}#jx2Bar .b2{background:#00897B}#jx2Bar .b3{background:#C62828}#jx2Bar .b4{background:#5E35B1}" +
"body:not([data-tab=reg]) #jx2Bar{display:none!important}" +
"body[data-tab=reg] .scroll-content>.space-y-3{display:none!important}" +
"body:not([data-tab=reg]) #jx2Pro{display:none!important}" +
"#jx2Pro{background:#1d1d1d;border:2px solid #C9A24A;border-radius:16px;padding:12px 14px;margin:0 0 10px;color:#fff}" +
"#jx2Pro .pChk{display:flex;align-items:center;gap:10px;font-weight:900;font-size:15px}#jx2Pro .pChk input{width:26px;height:26px;accent-color:#C9A24A;flex:none}" +
"#jx2Pro .pRow{display:flex;align-items:center;gap:10px;margin-top:10px}#jx2Pro .pRow input{flex:1;accent-color:#C9A24A}#jx2Pro .pRow b{min-width:52px;text-align:right;color:#FFD600;font-size:16px}" +
"#jx2Pro.off .pRow{opacity:.35}#jx2Pro small{display:block;color:#aaa;font-weight:600;font-size:11px;margin-top:2px}" +
"#jx2O{z-index:3370}#jx2O .jmsBoxG{max-width:440px}" +
"#jx2O.full{padding:0}#jx2O.full .jmsBoxG{max-width:none;width:100%;height:100%;max-height:none;border-radius:0;padding:8px 10px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}" +
".x2Top{display:flex;align-items:center;gap:8px;flex:none}.x2Top .jmsTitle{flex:1;margin:0;text-align:left}.x2Top button{border:0;border-radius:12px;padding:10px 16px;font-weight:900;font-size:15px;color:#fff;background:#2E9E3F}" +
".x2PvW{flex:1 1 0;min-height:50px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:6px 0}" +
".x2Chips{display:flex;gap:6px;overflow-x:auto;flex:none;padding:6px 0 2px}.x2Chips button{flex:none;border:0;border-radius:18px;padding:9px 12px;font-weight:900;font-size:12px;background:#3a3a3a;color:#fff;white-space:nowrap}" +
".x2C{width:100%;display:block;border-radius:10px;touch-action:none;background:#000}" +
".x2Row{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.x2Row button{flex:1;min-width:60px;border:0;border-radius:10px;padding:10px 4px;font-weight:900;font-size:12px;background:#3a3a3a;color:#fff}.x2Row button.on{background:#1E88E5;outline:3px solid #FFB300}" +
"#x2Lp button{min-width:0;font-size:16px;padding:8px 0}" +
".x2Lb{display:block;font-size:12px;font-weight:800;color:#bbb;margin:10px 0 2px}.x2Lb b{color:#FFD600}" +
".x2Hint{font-size:12px;color:#aaa;text-align:center;margin:6px 0;line-height:1.4}";
document.head.appendChild(css);
var ov = document.createElement("div"); ov.id = "jx2O"; ov.className = "jmsOvl";
ov.innerHTML = '<div class="jmsBoxG" id="jx2B"></div>'; document.body.appendChild(ov);
var box = $("jx2B"), HH = {};
function show(h, full){ box.innerHTML = h; ov.classList.toggle("full", !!full); ov.classList.add("show"); box.scrollTop = 0; }
function hide(){ ov.classList.remove("show"); ov.classList.remove("full"); bar(); }
ov.addEventListener("click", function(e){ var b = e.target.closest("[data-a]"); if(b && HH[b.dataset.a]) HH[b.dataset.a](b); });
var oldBack = window.__jmsBack2; window.__jmsBack2 = function(){ if(ov.classList.contains("show")){ hide(); return true; } return oldBack ? oldBack() : false; };
function slider(id, label, v, mn, mx, st, unit){ return '<label class="x2Lb">' + label + ' : <b id="' + id + 'v">' + v + '</b>' + (unit || "") + '</label><input type="range" id="' + id + '" min="' + mn + '" max="' + mx + '" step="' + (st || 1) + '" value="' + v + '" style="width:100%">'; }
function fitCanvas(c, iw, ih, maxW){ var W = Math.min(maxW || 900, iw), H = Math.round(W * ih / iw); if(H > 1100){ H = 1100; W = Math.round(H * iw / ih); } c.width = W; c.height = H; return [W, H]; }
function pos(c, e){ var r = c.getBoundingClientRect(); return {x:(e.clientX - r.left) / r.width, y:(e.clientY - r.top) / r.height}; }

/* ================= RETOUCHES (comme Snapseed) =================
   Glisser verticalement sur la photo : choisir le reglage. Glisser horizontalement : changer la valeur.
   Les reglages pilotent les curseurs de l'appli (meme resultat, aussi pour le lot). */
function tuneSliders(){ var c = document.querySelector(".space-y-3.mb-4"); return c ? Array.prototype.slice.call(c.querySelectorAll('input[type="range"]')) : []; }
function tuneSet(input, v){ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(v)); input.dispatchEvent(new Event("input", {bubbles:true})); input.dispatchEvent(new Event("change", {bubbles:true})); }
var TUNE = [
  [1, T("Luminosité", "Brightness")], [2, T("Contraste", "Contrast")], [8, T("Saturation", "Saturation")], [7, T("Ambiance", "Ambiance")],
  [5, T("Hautes lumières", "Highlights")], [6, T("Ombres", "Shadows")], [3, T("Chaleur", "Warmth")], [4, T("Teinte", "Tint")],
  [9, T("Structure", "Structure")], [10, T("Noirs", "Blacks")], [11, T("Blancs", "Whites")], [12, T("Anti-voile", "Dehaze")],
  [13, T("Vignette", "Vignette")]
];
var tuneIdx = 0;
function tune(){
  var ph = needPhoto(); if(!ph) return;
  var sl = tuneSliders(); if(sl.length < 14){ alert(T("Réglages introuvables.", "Settings not found.")); return; }
  var start = sl.map(function(r){ return r.value; }), showOrig = false;
  show('<div class="x2Top"><div class="jmsTitle">🎛️ ' + T("RETOUCHES", "TUNE IMAGE") + '</div>' +
     '<button id="x2TEye" style="background:#3a3a3a">👁</button>' +
     '<button data-a="undo" style="background:#3a3a3a">↶</button><button data-a="redo" style="background:#3a3a3a">↷</button>' +
     '<button data-a="help" style="background:#3a3a3a">?</button></div>' +
   '<div class="x2PvW" id="x2TW" style="position:relative;touch-action:none">' +
     '<canvas id="x2TC" style="display:block;position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>' +
     '<div id="x2TL" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);background:#000b;color:#fff;font-weight:900;font-size:17px;padding:8px 16px;border-radius:20px;white-space:nowrap;pointer-events:none"></div>' +
     '<div id="x2TM" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000d;border-radius:14px;padding:6px 0;display:none;min-width:220px;pointer-events:none"></div></div>' +
   '<div class="x2Hint" id="x2THelp" style="flex:none;margin:2px 0">' + T("Glisse ↕ sur la photo pour choisir le réglage, ↔ pour le modifier.", "Swipe ↕ on the photo to pick a setting, ↔ to change it.") + '</div>' +
   '<div style="flex:none;display:flex;align-items:center;gap:8px;margin:2px 0"><button data-a="pick" id="x2TP" style="border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-weight:900;padding:8px 10px;font-size:13px">☰</button>' +
     '<div style="flex:1;font-weight:800;color:#ddd" id="x2TN"></div><div id="x2TV" style="font-weight:900;color:#FFD600;font-family:monospace;font-size:16px"></div></div>' +
   '<canvas id="x2TR" style="display:block;flex:none;width:100%;height:46px;touch-action:none"></canvas>' +
   '<div style="display:flex;align-items:center;justify-content:space-between;flex:none;padding:6px 0">' +
     '<button data-a="cancel" style="border:0;background:none;color:#fff;font-size:30px;width:52px">✕</button>' +
     '<button data-a="auto" style="border:0;background:#3a3a3a;color:#fff;border-radius:22px;padding:10px 18px;font-weight:900">✨ Auto</button>' +
     '<button data-a="ok" style="border:0;background:none;color:#4CAF50;font-size:34px;width:52px">✓</button></div>', true);
  var wrap = $("x2TW"), cv = $("x2TC"), ctx = cv.getContext("2d"), rul = $("x2TR"), rx = rul.getContext("2d"), dpr = window.devicePixelRatio || 1;
  function inp(){ return tuneSliders()[TUNE[tuneIdx][0]]; }
  function fmt(r){ var v = +r.value, st = +r.step || 1, d = st < 1 ? (String(st).split(".")[1] || "").length : 0; return (v > 0 ? "+" : "") + v.toFixed(d); }
  function labels(){
    var r = inp(); if(!r) return;
    $("x2TL").textContent = TUNE[tuneIdx][1] + "  " + fmt(r); $("x2TN").textContent = TUNE[tuneIdx][1]; $("x2TV").textContent = fmt(r); ruler();
  }
  function ruler(){
    var r = inp(); if(!r) return; var W = rul.clientWidth * dpr, H = 46 * dpr; if(rul.width !== W) rul.width = W; rul.height = H;
    var mn = +r.min, mx = +r.max, v = +r.value, f = (v - mn) / (mx - mn), z = (0 - mn) / (mx - mn);
    rx.clearRect(0, 0, W, H); var n = 60;
    for(var i = 0; i <= n; i++){ var x = 8 * dpr + (W - 16 * dpr) * i / n; rx.fillStyle = "#bbb"; rx.fillRect(x - dpr, H * 0.35, 2 * dpr, H * 0.45); }
    var zx = 8 * dpr + (W - 16 * dpr) * z, vx = 8 * dpr + (W - 16 * dpr) * f;
    rx.fillStyle = "rgba(255,214,0,.35)"; rx.fillRect(Math.min(zx, vx), H * 0.35, Math.abs(vx - zx), H * 0.45);
    rx.fillStyle = "#FFD600"; rx.fillRect(vx - 2 * dpr, H * 0.2, 4 * dpr, H * 0.65);
    rx.beginPath(); rx.moveTo(vx - 8 * dpr, 0); rx.lineTo(vx + 8 * dpr, 0); rx.lineTo(vx, H * 0.2); rx.fill();
  }
  var img = null;
  function draw(){
    if(!document.body.contains(cv)) return false;
    var CW = Math.max(10, wrap.clientWidth), CH = Math.max(10, wrap.clientHeight);
    if(cv.width !== Math.round(CW * dpr) || cv.height !== Math.round(CH * dpr)){ cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); }
    var src = showOrig && natImg ? natImg : (img = photo() || img); if(!src) return true;
    var sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, k = Math.min(cv.width / sw, cv.height / sh), w = sw * k, h = sh * k;
    ctx.fillStyle = "#111"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    return true;
  }
  var loop = setInterval(function(){ if(!draw()) clearInterval(loop); }, 120);
  /* gestes */
  var g = null, menu = $("x2TM");
  function drawMenu(sel){
    menu.innerHTML = TUNE.map(function(t, i){ return '<div style="padding:8px 18px;font-weight:900;font-size:15px;' + (i === sel ? 'background:#1E88E5;color:#fff' : 'color:#ccc') + '">' + t[1] + '  <span style="float:right;color:' + (i === sel ? '#fff' : '#FFD600') + ';margin-left:14px">' + fmt(tuneSliders()[t[0]]) + '</span></div>'; }).join("");
    menu.style.display = "block";
  }
  cv.onpointerdown = function(e){ cv.setPointerCapture(e.pointerId); g = {x:e.clientX, y:e.clientY, mode:null, v0:+inp().value, i0:tuneIdx}; };
  cv.onpointermove = function(e){
    if(!g) return; var dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(!g.mode && Math.hypot(dx, dy) > 10) g.mode = Math.abs(dy) > Math.abs(dx) ? "menu" : "value";
    if(g.mode === "value"){
      var r = inp(), mn = +r.min, mx = +r.max, st = +r.step || 1, v = g.v0 + dx * (mx - mn) / (wrap.clientWidth * 3);
      v = Math.max(mn, Math.min(mx, Math.round(v / st) * st)); if(String(v) !== r.value){ tuneSet(r, v); labels(); }
    } else if(g.mode === "menu"){
      var i = Math.max(0, Math.min(TUNE.length - 1, g.i0 + Math.round(dy / 28))); if(i !== g.sel){ g.sel = i; drawMenu(i); }
    }
  };
  function up(){ if(g && g.mode === "menu" && g.sel !== undefined){ tuneIdx = g.sel; labels(); } menu.style.display = "none"; g = null; }
  cv.onpointerup = up; cv.onpointercancel = up;
  /* reglette : toucher / glisser directement */
  function rulerSet(e){ var r = inp(), b = rul.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - b.left - 8) / (b.width - 16))), mn = +r.min, mx = +r.max, st = +r.step || 1;
    var v = Math.max(mn, Math.min(mx, Math.round((mn + f * (mx - mn)) / st) * st)); tuneSet(r, v); labels(); }
  rul.onpointerdown = function(e){ rul.setPointerCapture(e.pointerId); rulerSet(e); rul.onpointermove = rulerSet; };
  rul.onpointerup = rul.onpointercancel = function(){ rul.onpointermove = null; };
  var eye = $("x2TEye");
  eye.onpointerdown = function(){ showOrig = true; draw(); }; eye.onpointerup = eye.onpointerleave = eye.onpointercancel = function(){ showOrig = false; draw(); };
  HH.pick = function(){ var i = (tuneIdx + 1) % TUNE.length; if(menu.style.display === "block"){ menu.style.display = "none"; return; }
    drawMenu(tuneIdx); menu.style.pointerEvents = "auto";
    menu.onclick = function(e){ var d = e.target.closest("div[style]"); if(!d || d === menu) return; var k = Array.prototype.indexOf.call(menu.children, d); if(k >= 0){ tuneIdx = k; labels(); } menu.style.display = "none"; menu.style.pointerEvents = "none"; }; };
  HH.undo = function(){ var b = $("jxU"); if(b) b.click(); setTimeout(labels, 700); };
  HH.redo = function(){ var b = $("jxR2"); if(b) b.click(); setTimeout(labels, 700); };
  HH.auto = function(){ if(window.__jmsX && window.__jmsX.x_auto){ var A = window.alert; window.alert = function(){}; try{ window.__jmsX.x_auto(); }finally{ window.alert = A; } setTimeout(labels, 300); } };
  HH.help = function(){ var h = $("x2THelp"); h.style.color = "#FFD600"; h.textContent = T("↕ glisser vers le haut / bas : liste des réglages • ↔ glisser à gauche / droite : moins / plus • 👁 maintenu : photo d'origine • ✓ garder, ✕ annuler.", "↕ swipe up / down: settings list • ↔ swipe left / right: less / more • hold 👁: original photo • ✓ keep, ✕ cancel."); };
  HH.cancel = function(){ var s2 = tuneSliders(); start.forEach(function(v, i){ if(s2[i] && s2[i].value !== v) tuneSet(s2[i], v); }); clearInterval(loop); hide(); };
  HH.ok = function(){ clearInterval(loop); hide(); };
  labels(); draw();
}

/* ================= COURBES ================= */
function curves(){
  var ph = needPhoto(); if(!ph) return;
  var s = get(), ch = "m", sel = -1;
  var PRE = {
    lin:[[0,0],[255,255]], s1:[[0,0],[64,52],[192,206],[255,255]], s2:[[0,0],[64,40],[192,220],[255,255]],
    mat:[[0,34],[70,72],[190,200],[255,238]], ombres:[[0,0],[60,88],[160,182],[255,255]], dense:[[0,0],[100,80],[200,190],[255,255]]
  };
  show('<div class="x2Top"><div class="jmsTitle">📈 ' + T("COURBES", "CURVES") + '</div><button data-a="ok">✔ OK</button></div>' +
   '<div class="x2PvW" id="x2PvW"><canvas id="x2Pv" style="display:block;border-radius:8px"></canvas></div>' +
   '<div class="x2Row" id="x2Ch" style="margin:0 0 6px;flex:none"><button data-a="ch" data-c="m" class="on">RVB</button><button data-a="ch" data-c="r" style="color:#ff8a80">R</button><button data-a="ch" data-c="g" style="color:#9be79b">V</button><button data-a="ch" data-c="b" style="color:#90b4ff">B</button></div>' +
   '<canvas id="x2Cu" style="display:block;flex:none;margin:0 auto;background:#111;border-radius:10px;touch-action:none"></canvas>' +
   '<div class="x2Chips"><button data-a="pre" data-p="s1">' + T("S douce", "Soft S") + '</button><button data-a="pre" data-p="s2">' + T("S forte", "Strong S") + '</button><button data-a="pre" data-p="mat">' + T("Mat (film)", "Matte (film)") + '</button><button data-a="pre" data-p="ombres">' + T("Ombres +", "Shadows +") + '</button><button data-a="pre" data-p="dense">' + T("Dense", "Dense") + '</button><button data-a="pre" data-p="lin">' + T("Neutre", "Neutral") + '</button><button data-a="reset" style="background:#6b2b2b">' + T("Tout à zéro", "Reset all") + '</button></div>' +
   '<div class="x2Hint" style="flex:none;margin:4px 0 0">' + T("Touche la courbe pour ajouter un point. Glisse un point hors du carré pour l'enlever.", "Tap the curve to add a point. Drag a point out of the square to remove it.") + '</div>', true);
  var pv = $("x2Pv"), cu = $("x2Cu"), sz = fitCanvas(pv, ph.width, ph.height, 700), base = cvs(sz[0], sz[1]);
  base.getContext("2d").drawImage(ph, 0, 0, sz[0], sz[1]);
  var hist = new Uint32Array(256), bd = base.getContext("2d").getImageData(0, 0, sz[0], sz[1]).data;
  for(var i = 0; i < bd.length; i += 4) hist[(0.2126*bd[i] + 0.7152*bd[i+1] + 0.0722*bd[i+2]) | 0]++;
  var hm = 1; for(var i = 2; i < 254; i++) hm = Math.max(hm, hist[i]);
  /* marge autour de la courbe pour que les points du bout soient entiers et faciles a attraper */
  cu.width = cu.height = 600; var P = 40, A = 600 - 2 * P, K = A / 255;
  function layout(){
    if(!document.body.contains(cu)) { window.removeEventListener("resize", layout); return; }
    var cs = Math.floor(Math.min(box.clientWidth - 20, window.innerHeight * 0.46));
    cu.style.width = cu.style.height = cs + "px";
    var w = $("x2PvW"), k = Math.min(w.clientWidth / pv.width, w.clientHeight / pv.height);
    pv.style.width = Math.floor(pv.width * k) + "px"; pv.style.height = Math.floor(pv.height * k) + "px";
  }
  window.addEventListener("resize", layout); setTimeout(layout, 0); requestAnimationFrame(layout);
  function X(v){ return P + v * K; } function Y(v){ return P + A - v * K; }
  var COL = {m:"#fff", r:"#ff5252", g:"#4CAF50", b:"#448AFF"};
  function drawPrev(){ var x = pv.getContext("2d"); x.drawImage(base, 0, 0); applyCurves(x, pv.width, pv.height, s); }
  function line(x, L){ x.beginPath(); for(var i = 0; i < 256; i++){ if(i) x.lineTo(X(i), Y(L[i])); else x.moveTo(X(0), Y(L[0])); } x.stroke(); }
  function drawCurve(){
    var x = cu.getContext("2d"); x.clearRect(0, 0, 600, 600);
    x.fillStyle = "rgba(255,255,255,.12)"; for(var i = 0; i < 256; i++){ var hh = Math.min(1, hist[i] / hm) * A; x.fillRect(X(i), P + A - hh, K + 0.5, hh); }
    x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 2; x.strokeRect(P, P, A, A);
    x.strokeStyle = "rgba(255,255,255,.15)"; x.lineWidth = 1; for(var g = 1; g < 4; g++){ x.beginPath(); x.moveTo(P + g * A / 4, P); x.lineTo(P + g * A / 4, P + A); x.moveTo(P, P + g * A / 4); x.lineTo(P + A, P + g * A / 4); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,.25)"; x.beginPath(); x.moveTo(X(0), Y(0)); x.lineTo(X(255), Y(255)); x.stroke();
    ["m","r","g","b"].forEach(function(k){ if(k === ch || isLin(s.curve[k])) return; x.strokeStyle = COL[k] + "66"; x.lineWidth = 2; line(x, lut(s.curve[k])); });
    x.strokeStyle = COL[ch]; x.lineWidth = 4; line(x, lut(s.curve[ch]));
    s.curve[ch].forEach(function(p, i){ x.fillStyle = i === sel ? "#FFD600" : COL[ch]; x.beginPath(); x.arc(X(p[0]), Y(p[1]), 16, 0, 7); x.fill(); x.strokeStyle = "#000"; x.lineWidth = 2; x.stroke(); });
  }
  function redraw(){ drawCurve(); drawPrev(); }
  var drag = -1, pend = 0;
  function cp(e){ var p = pos(cu, e), fx = (p.x * 600 - P) / A, fy = (p.y * 600 - P) / A; return [fx * 255, (1 - fy) * 255, {x:fx, y:fy}]; }
  cu.onpointerdown = function(e){
    cu.setPointerCapture(e.pointerId); var q = cp(e), pts = s.curve[ch], best = -1, bd2 = 1e9;
    pts.forEach(function(p, i){ var d = Math.hypot(p[0] - q[0], p[1] - q[1]); if(d < bd2){ bd2 = d; best = i; } });
    if(bd2 < 24) drag = best;
    else { pts.push([Math.round(Math.max(1, Math.min(254, q[0]))), Math.round(Math.max(0, Math.min(255, q[1])))]); pts.sort(function(a, b){ return a[0] - b[0]; }); drag = pts.findIndex(function(p){ return Math.abs(p[0] - q[0]) < 1.5; }); }
    sel = drag; redraw();
  };
  cu.onpointermove = function(e){
    if(drag < 0) return; var q = cp(e), pts = s.curve[ch], last = pts.length - 1;
    var out = q[2].x < -0.12 || q[2].x > 1.12 || q[2].y < -0.12 || q[2].y > 1.12;
    if(out && drag > 0 && drag < last){ pts.splice(drag, 1); drag = -1; sel = -1; redraw(); return; }
    var minX = drag === 0 ? 0 : pts[drag-1][0] + 2, maxX = drag === last ? 255 : pts[drag+1][0] - 2;
    if(drag === 0) minX = maxX = 0; if(drag === last) minX = maxX = 255;
    pts[drag] = [Math.round(Math.max(minX, Math.min(maxX, q[0]))), Math.round(Math.max(0, Math.min(255, q[1])))];
    drawCurve(); if(!pend){ pend = requestAnimationFrame(function(){ pend = 0; drawPrev(); }); }
  };
  cu.onpointerup = function(){ drag = -1; put(s); redraw(); };
  HH.ch = function(b){ ch = b.dataset.c; sel = -1; Array.prototype.forEach.call($("x2Ch").children, function(x){ x.classList.toggle("on", x === b); }); drawCurve(); };
  HH.pre = function(b){ s.curve[ch] = PRE[b.dataset.p].map(function(p){ return p.slice(); }); sel = -1; put(s); redraw(); };
  HH.reset = function(){ s.curve = JSON.parse(JSON.stringify(D.curve)); sel = -1; put(s); redraw(); };
  HH.ok = function(){ put(s); hide(); };
  redraw();
}

/* ================= RECADRAGE LIBRE ================= */
function crop(){
  var ph = needPhoto(); if(!ph) return;
  var g = JSON.parse(JSON.stringify(geo)), ratio = 0;
  show('<div class="jmsTitle">✂️ ' + T("RECADRER / REDRESSER", "CROP / STRAIGHTEN") + '</div>' +
   '<canvas id="x2Cr" class="x2C"></canvas>' +
   '<div class="x2Hint">' + T("Fais glisser les coins ou le cadre.", "Drag the corners or the frame.") + '</div>' +
   '<div class="x2Row" id="x2Ra"><button data-a="ra" data-r="0" class="on">' + T("Libre", "Free") + '</button><button data-a="ra" data-r="1">1:1</button><button data-a="ra" data-r="0.8">4:5</button><button data-a="ra" data-r="1.5">3:2</button><button data-a="ra" data-r="1.7778">16:9</button><button data-a="ra" data-r="-1">' + T("Origine", "Original") + '</button></div>' +
   slider("x2Rot", T("Redresser", "Straighten"), g.rot || 0, -20, 20, 0.1, "°") +
   '<div class="x2Row"><button data-a="r90">↻ 90°</button><button data-a="flip">⇋ ' + T("Miroir", "Mirror") + '</button><button data-a="rz">' + T("Réinitialiser", "Reset") + '</button></div>' +
   '<button class="jmsBtn go" data-a="ok">✔ ' + T("VALIDER LE RECADRAGE", "APPLY THE CROP") + '</button>' +
   '<button class="jmsBtn close" data-a="cancel">' + T("ANNULER", "CANCEL") + '</button>');
  var c = $("x2Cr"), full = null, W = 0, H = 0, rc = g.crop ? Object.assign({}, g.crop) : {x:0, y:0, w:1, h:1};
  function rebuild(){ full = geometry(ph, {r90:g.r90, flip:g.flip, rot:g.rot, crop:null}); var sz = fitCanvas(c, full.width, full.height, 800); W = sz[0]; H = sz[1]; draw(); }
  function draw(){
    var x = c.getContext("2d"); x.drawImage(full, 0, 0, W, H);
    var X = rc.x * W, Y = rc.y * H, CW = rc.w * W, CH = rc.h * H;
    x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, 0, W, Y); x.fillRect(0, Y + CH, W, H - Y - CH); x.fillRect(0, Y, X, CH); x.fillRect(X + CW, Y, W - X - CW, CH);
    x.strokeStyle = "#fff"; x.lineWidth = 2; x.strokeRect(X, Y, CW, CH);
    x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = 1; x.beginPath(); for(var i = 1; i < 3; i++){ x.moveTo(X + CW * i / 3, Y); x.lineTo(X + CW * i / 3, Y + CH); x.moveTo(X, Y + CH * i / 3); x.lineTo(X + CW, Y + CH * i / 3); } x.stroke();
    x.fillStyle = "#FFD600"; var hs = Math.max(10, W / 40); [[X, Y], [X + CW, Y], [X, Y + CH], [X + CW, Y + CH]].forEach(function(p){ x.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs); });
  }
  function applyRatio(){
    if(!ratio) return; var r = ratio < 0 ? (full.width / full.height) : ratio, iw = full.width, ih = full.height;
    var cw = rc.w * iw, chh = cw / r; if(chh > rc.h * ih || rc.y * ih + chh > ih){ chh = Math.min(rc.h * ih, ih); cw = chh * r; }
    if(cw > iw){ cw = iw; chh = cw / r; }
    var cx = (rc.x + rc.w / 2) * iw, cy = (rc.y + rc.h / 2) * ih;
    rc = {w:cw / iw, h:chh / ih}; rc.x = Math.max(0, Math.min(1 - rc.w, cx / iw - rc.w / 2)); rc.y = Math.max(0, Math.min(1 - rc.h, cy / ih - rc.h / 2));
  }
  var mode = null, st = null;
  c.onpointerdown = function(e){
    c.setPointerCapture(e.pointerId); var p = pos(c, e), tol = 0.07;
    var cs = [["tl", rc.x, rc.y], ["tr", rc.x + rc.w, rc.y], ["bl", rc.x, rc.y + rc.h], ["br", rc.x + rc.w, rc.y + rc.h]];
    mode = null; cs.forEach(function(k){ if(!mode && Math.abs(p.x - k[1]) < tol && Math.abs(p.y - k[2]) < tol) mode = k[0]; });
    if(!mode && p.x > rc.x && p.x < rc.x + rc.w && p.y > rc.y && p.y < rc.y + rc.h) mode = "move";
    st = {p:p, rc:Object.assign({}, rc)};
  };
  c.onpointermove = function(e){
    if(!mode) return; var p = pos(c, e), dx = p.x - st.p.x, dy = p.y - st.p.y, o = st.rc, m = 0.05, n = Object.assign({}, o);
    if(mode === "move"){ n.x = Math.max(0, Math.min(1 - o.w, o.x + dx)); n.y = Math.max(0, Math.min(1 - o.h, o.y + dy)); }
    else {
      var x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if(mode[1] === "l") x0 = Math.max(0, Math.min(x1 - m, x0 + dx)); else x1 = Math.min(1, Math.max(x0 + m, x1 + dx));
      if(mode[0] === "t") y0 = Math.max(0, Math.min(y1 - m, y0 + dy)); else y1 = Math.min(1, Math.max(y0 + m, y1 + dy));
      n = {x:x0, y:y0, w:x1 - x0, h:y1 - y0};
      if(ratio){
        var r = (ratio < 0 ? full.width / full.height : ratio) * full.height / full.width, nh = n.w / r;
        if(mode[0] === "t") n.y = Math.max(0, y1 - nh); n.h = Math.min(nh, mode[0] === "t" ? y1 : 1 - n.y); n.w = n.h * r;
        if(mode[1] === "l") n.x = x1 - n.w;
      }
    }
    rc = n; draw();
  };
  c.onpointerup = function(){ mode = null; };
  HH.ra = function(b){ ratio = +b.dataset.r; Array.prototype.forEach.call($("x2Ra").children, function(x){ x.classList.toggle("on", x === b); }); applyRatio(); draw(); };
  $("x2Rot").oninput = function(){ g.rot = +this.value; $("x2Rotv").textContent = g.rot.toFixed(1); rebuild(); };
  HH.r90 = function(){ g.r90 = (g.r90 + 1) % 4; rc = {x:0, y:0, w:1, h:1}; applyRatio(); rebuild(); };
  HH.flip = function(){ g.flip = !g.flip; rebuild(); };
  HH.rz = function(){ g = {r90:0, flip:false, rot:0, crop:null}; rc = {x:0, y:0, w:1, h:1}; $("x2Rot").value = 0; $("x2Rotv").textContent = "0"; rebuild(); };
  HH.ok = function(){ var whole = rc.x < 0.002 && rc.y < 0.002 && rc.w > 0.996 && rc.h > 0.996; g.crop = whole ? null : Object.assign({}, rc, {ratio:ratio}); geo = g; hide(); if(geoOn()) note(T("✂️ Recadrage appliqué à l'enregistrement de cette photo", "✂️ Crop applied when this photo is saved")); };
  HH.cancel = hide;
  rebuild();
}

/* ---------- message ---------- */
function note(t){ if(window.__jmsNote) window.__jmsNote(t, "ok", 3500); }

/* ---------- carte ProLab : case activee / desactivee + pourcentage (curseur Dosage de l'appli) ---------- */
function dosage(){ return tuneSliders()[0]; }
function rerender(){ var d = dosage(); if(!d) return; var v = +d.value; tuneSet(d, v >= +d.max ? v - 1 : v + 1); tuneSet(d, v); }
function proLab(bar){
  var c = $("jx2Pro");
  if(!c){
    c = document.createElement("div"); c.id = "jx2Pro";
    c.innerHTML = '<label class="pChk"><input type="checkbox" id="x2PL"><span>✨ ' + T("Correction automatique ProLab", "ProLab auto correction") + '<small>' + T("Exposition automatique + rendu LABO PRO", "Automatic exposure + LABO PRO look") + '</small></span></label>' +
      '<div class="pRow"><span style="font-weight:800;font-size:13px;color:#ccc">' + T("Intensité", "Strength") + '</span><input type="range" id="x2PD" min="0" max="100" step="1"><b id="x2PDv"></b></div>';
    c.querySelector("#x2PL").onchange = function(){
      window.__jmsProLabOff = !this.checked; try{ localStorage.setItem("jms_prolab", this.checked ? "on" : "off"); }catch(e){}
      c.classList.toggle("off", !this.checked); rerender();
    };
    c.querySelector("#x2PD").oninput = function(){ var d = dosage(); if(d){ tuneSet(d, this.value); } c.querySelector("#x2PDv").textContent = this.value + " %"; };
  }
  if(c.previousSibling !== bar) bar.parentNode.insertBefore(c, bar.nextSibling);
  var d = dosage(), r = c.querySelector("#x2PD"), ck = c.querySelector("#x2PL");
  if(d){ r.min = d.min; r.max = d.max; r.step = d.step || 1; if(document.activeElement !== r && r.value !== d.value){ r.value = d.value; } c.querySelector("#x2PDv").textContent = d.value + " %"; }
  ck.checked = !window.__jmsProLabOff; c.classList.toggle("off", !!window.__jmsProLabOff);
}

/* ================= VUE EN GRAND (rendu final, zoom, appui long = original) ================= */
var full = document.createElement("div"); full.id = "jxFull";
full.style.cssText = "position:fixed;inset:0;z-index:3700;background:#000;display:none;flex-direction:column;touch-action:none";
full.innerHTML = '<div style="flex:none;display:flex;align-items:center;gap:8px;padding:max(8px,env(safe-area-inset-top)) 10px 8px;background:#000c;color:#fff;position:absolute;left:0;right:0;top:0;z-index:2">' +
  '<b style="flex:1;font-size:14px;letter-spacing:.06em">⛶ ' + T("APERÇU FINAL", "FINAL PREVIEW") + '</b>' +
  '<span id="jxFullZ" style="font-size:12px;color:#bbb"></span><button id="jxFullX" style="border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-weight:900;font-size:18px;width:44px;height:40px">✕</button></div>' +
  '<div id="jxFullW" style="position:absolute;inset:0;touch-action:none"><canvas id="jxFullC" style="display:block;width:100%;height:100%;touch-action:none"></canvas></div>' +
  '<div id="jxFullL" style="position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#000c;color:#fff;font-weight:900;font-size:14px;padding:6px 14px;border-radius:16px;display:none;pointer-events:none">' + T("AVANT", "BEFORE") + '</div>' +
  '<div id="jxFullB" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#000c;color:#fff;font-weight:900;padding:10px 16px;border-radius:12px;display:none;pointer-events:none">⏳</div>' +
  '<div style="position:absolute;left:0;right:0;bottom:max(10px,env(safe-area-inset-bottom));text-align:center;color:#ccc;font-size:12px;pointer-events:none">' + T("Deux doigts : zoomer • doigt maintenu : avant • ✕ : fermer", "Two fingers: zoom • hold: before • ✕: close") + '</div>';
document.body.appendChild(full);
var fcv = full.querySelector("#jxFullC"), fwr = full.querySelector("#jxFullW"), fImg = null, fBefore = null, fShowB = false;
var FV = viewer(fcv, fwr, function(){ return fImg || {width:1, height:1}; });
function fullDraw(){ if(full.style.display === "none" || !fImg) return; FV.size(); FV.draw(fShowB && fBefore ? fBefore : fImg); full.querySelector("#jxFullZ").textContent = FV.zoom > 1.01 ? "×" + (Math.round(FV.zoom * 10) / 10) : ""; }
async function openFull(){
  var ph = photo(); if(!ph) return;
  fImg = ph; fBefore = null; FV.zoom = 1; FV.ox = 0; FV.oy = 0;
  full.style.display = "flex"; full.querySelector("#jxFullB").style.display = "block"; fullDraw();
  /* version avant correction a la meme taille */
  if(natImg){ fBefore = cvs(ph.width, ph.height); fBefore.getContext("2d").drawImage(natImg, 0, 0, ph.width, ph.height); }
  /* rendu final : tous les outils (courbes, selection, pinceau, recadrage, effets...) */
  try{ if(window.__jmsFX && window.__jmsFX.active({single:true})){ var bmp = await createImageBitmap(ph); fImg = await window.__jmsFX.render(bmp, {single:true}); if(bmp.close) bmp.close(); } }catch(e){}
  full.querySelector("#jxFullB").style.display = "none"; fullDraw();
}
function closeFull(){ full.style.display = "none"; fImg = fBefore = null; }
full.querySelector("#jxFullX").onclick = closeFull;
(function(){
  var ptrs = {}, mode = null, hold = null, start = null;
  fcv.onpointerdown = function(e){ fcv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = {x:e.clientX, y:e.clientY}; var k = Object.keys(ptrs);
    if(k.length === 1){ mode = "pan"; start = {x:e.clientX, y:e.clientY, ox:FV.ox, oy:FV.oy}; hold = setTimeout(function(){ if(mode === "pan" && start && !start.moved){ fShowB = true; full.querySelector("#jxFullL").style.display = "block"; fullDraw(); } }, 260); }
    else if(k.length === 2){ clearTimeout(hold); mode = "pinch"; FV.pinchStart(ptrs[k[0]], ptrs[k[1]]); } };
  fcv.onpointermove = function(e){ if(!ptrs[e.pointerId]) return; ptrs[e.pointerId] = {x:e.clientX, y:e.clientY}; var k = Object.keys(ptrs);
    if(mode === "pinch" && k.length === 2){ FV.pinchMove(ptrs[k[0]], ptrs[k[1]]); fullDraw(); }
    else if(mode === "pan" && start){ var dx = e.clientX - start.x, dy = e.clientY - start.y; if(Math.hypot(dx, dy) > 8){ start.moved = true; clearTimeout(hold); } if(start.moved && !fShowB){ var s = FV.scale() / FV.dpr; FV.ox = start.ox - dx / s; FV.oy = start.oy - dy / s; FV.clamp(); fullDraw(); } } };
  function up(e){ delete ptrs[e.pointerId]; clearTimeout(hold); if(fShowB){ fShowB = false; full.querySelector("#jxFullL").style.display = "none"; fullDraw(); }
    var k = Object.keys(ptrs); if(k.length === 1){ var q = ptrs[k[0]]; mode = "pan"; start = {x:q.x, y:q.y, ox:FV.ox, oy:FV.oy, moved:true}; } else if(!k.length){ mode = null; start = null; } }
  fcv.onpointerup = up; fcv.onpointercancel = up;
  window.addEventListener("resize", fullDraw);
})();
/* ouverture : bouton ⛶ a cote de 👁 ↶ ↷, ou deux tapotements rapides sur la photo */
function fullBtn(){
  var ur = document.getElementById("jxUR"); if(!ur || document.getElementById("jxFullBtn")) return;
  var b = document.createElement("button"); b.id = "jxFullBtn"; b.textContent = "⛶"; b.title = T("Voir en grand", "View large"); b.onclick = openFull;
  var eye = document.getElementById("jxEye"); ur.insertBefore(b, eye ? eye : ur.firstChild);
}
setInterval(fullBtn, 1000); setTimeout(fullBtn, 500);
var lastTap = 0, tapPos = null;
document.addEventListener("pointerup", function(e){
  var f = document.querySelector(".fixed-top"); if(!f || !f.contains(e.target)) return;
  var c = document.getElementById("filteredCanvas"); if(!c || c.style.display === "none") return;
  var now = Date.now();
  if(now - lastTap < 320 && tapPos && Math.hypot(e.clientX - tapPos.x, e.clientY - tapPos.y) < 30){ lastTap = 0; openFull(); }
  else { lastTap = now; tapPos = {x:e.clientX, y:e.clientY}; }
}, true);
var oldBackF = window.__jmsBack2;
window.__jmsBack2 = function(){ if(full.style.display !== "none"){ closeFull(); return true; } return oldBackF ? oldBackF() : false; };
window.__jmsFull = openFull;

/* ---------- AVANT / APRES : doigt maintenu sur la photo, ou bouton 👁 maintenu ---------- */
var befC = document.createElement("canvas"); befC.id = "jxBefore2";
befC.style.cssText = "position:fixed;z-index:1200;display:none;pointer-events:none;background:#222";
var befL = document.createElement("div");
befL.style.cssText = "position:fixed;z-index:1201;display:none;pointer-events:none;background:#000c;color:#fff;font-weight:900;font-size:14px;padding:6px 14px;border-radius:16px;letter-spacing:.08em";
befL.textContent = T("AVANT", "BEFORE");
document.body.appendChild(befC); document.body.appendChild(befL);
function showBefore(on){
  var f = document.querySelector(".fixed-top"), c = document.getElementById("filteredCanvas");
  if(!on || !natImg || !f || !c || c.style.display === "none"){ befC.style.display = befL.style.display = "none"; return; }
  var r = f.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  befC.style.left = r.left + "px"; befC.style.top = r.top + "px"; befC.style.width = r.width + "px"; befC.style.height = r.height + "px";
  befC.width = Math.round(r.width * dpr); befC.height = Math.round(r.height * dpr);
  var x = befC.getContext("2d"), k = Math.min(befC.width / natImg.naturalWidth, befC.height / natImg.naturalHeight), w = natImg.naturalWidth * k, h = natImg.naturalHeight * k;
  x.fillStyle = "#222"; x.fillRect(0, 0, befC.width, befC.height); x.imageSmoothingQuality = "high";
  x.drawImage(natImg, (befC.width - w) / 2, (befC.height - h) / 2, w, h);
  befL.style.left = (r.left + r.width / 2) + "px"; befL.style.top = (r.top + 46) + "px"; befL.style.transform = "translateX(-50%)";
  befC.style.display = befL.style.display = "block";
}
/* doigt maintenu sur la photo (pas sur le curseur avant / apres) */
var hold = null;
document.addEventListener("pointerdown", function(e){
  var f = document.querySelector(".fixed-top"); if(!f || !f.contains(e.target) || (e.target.closest && e.target.closest("#divider"))) return;
  var c = document.getElementById("filteredCanvas"); if(!c || c.style.display === "none") return;
  hold = {x:e.clientX, y:e.clientY, on:false, t:setTimeout(function(){ if(hold){ hold.on = true; showBefore(true); } }, 220)};
}, true);
document.addEventListener("pointermove", function(e){ if(hold && !hold.on && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 12){ clearTimeout(hold.t); hold = null; } }, true);
function endHold(){ if(hold){ clearTimeout(hold.t); hold = null; } showBefore(false); }
document.addEventListener("pointerup", endHold, true); document.addEventListener("pointercancel", endHold, true);
/* bouton 👁 a cote de ↶ ↷ */
function eyeBtn(){
  var ur = document.getElementById("jxUR"); if(!ur || document.getElementById("jxEye")) return;
  var b = document.createElement("button"); b.id = "jxEye"; b.textContent = "👁"; b.title = T("Maintenir pour voir avant la correction", "Hold to see before the correction");
  b.onpointerdown = function(e){ e.preventDefault(); showBefore(true); };
  b.onpointerup = b.onpointerleave = b.onpointercancel = function(){ showBefore(false); };
  b.oncontextmenu = function(e){ e.preventDefault(); };
  ur.insertBefore(b, ur.firstChild);
}
setInterval(eyeBtn, 1000); setTimeout(eyeBtn, 400);

/* ---------- barre d'outils dans RÉGLAGES ---------- */
function bar(){
  var c = document.querySelector(".space-y-3.mb-4"); if(!c) return;
  var b = $("jx2Bar");
  if(!b){
    b = document.createElement("div"); b.id = "jx2Bar";
    b.innerHTML = '<button id="x2TB"><span class="i">🧰</span><span class="t">' + T("OUTILS", "TOOLS") + '<small id="x2TBs"></small></span><span style="font-size:22px">›</span></button>';
    b.onclick = function(){ toolsGrid(); };
  }
  var anchor = $("jxFav") && $("jxFav").parentNode === c.parentNode ? $("jxFav") : c;
  if(b.nextSibling !== anchor || b.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
  proLab(b);
  var s = get(), on = [];
  GRID.forEach(function(sec){ sec[1].forEach(function(t){ try{ if(t[3](s)) on.push(t[2]); }catch(e){} }); });
  var sm = $("x2TBs"); if(sm){ var txt = on.length ? T("Actifs : ", "In use: ") + on.join(", ") : T("Retouches, Détails, Courbes, Correcteur, Recadrer, Théâtral, Éclat…", "Tune, Details, Curves, Healing, Crop, Drama, Glow…"); if(sm.textContent !== txt) sm.textContent = txt; }
}
setInterval(bar, 700); setTimeout(bar, 300);
})();
