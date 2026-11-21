/* JM LAB PRO - COURBES, RECADRAGE LIBRE, EFFETS FILM
   Branche dans le rendu des effets (jmfx.js) :
   - avant les effets : courbes, rotation / recadrage (photo seule)
   - apres les effets : effets film (halo, fuite de lumiere, poussiere, bords, date)
   Les courbes et les effets film s'appliquent aussi au lot ; recadrage seulement a la photo ouverte. */
(function(){
"use strict";
var EN = window.__jmsLang === "en";
function T(fr, en){ return EN ? en : fr; }
function $(id){ return document.getElementById(id); }
function cvs(w, h){ var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/* ---------- etat ---------- */
var KEY = "jms_fx2";
var D = {curve:{m:[[0,0],[255,255]], r:[[0,0],[255,255]], g:[[0,0],[255,255]], b:[[0,0],[255,255]]}, halo:0, leak:0, leakPos:"tl", dust:0, border:"", date:false};
function get(){ try{ var o = JSON.parse(localStorage.getItem(KEY) || "{}"); var r = Object.assign({}, D, o); r.curve = Object.assign({}, D.curve, o.curve || {}); return r; }catch(e){ return JSON.parse(JSON.stringify(D)); } }
function put(o){ try{ localStorage.setItem(KEY, JSON.stringify(o)); }catch(e){} }
/* propres a la photo ouverte (remis a zero a chaque nouvelle photo) */
var geo = {r90:0, flip:false, rot:0, crop:null};   /* crop = {x,y,w,h} en fractions */
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple){ geo = {r90:0, flip:false, rot:0, crop:null}; bar(); } }, true);

function isLin(p){ return p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255; }
function curveOn(s){ return !(isLin(s.curve.m) && isLin(s.curve.r) && isLin(s.curve.g) && isLin(s.curve.b)); }
function geoOn(){ return !!(geo.r90 || geo.flip || geo.rot || geo.crop); }
function filmOn(s){ return !!(s.halo || s.leak || s.dust || s.border || s.date); }
function active(Q){ var s = get(); return curveOn(s) || filmOn(s) || !!(Q && Q.single && geoOn()); }
function summary(){
  var s = get(), a = [];
  if(curveOn(s)) a.push(T("courbes", "curves"));
  if(s.halo) a.push(T("halo ", "halation ") + s.halo + "%");
  if(s.leak) a.push(T("fuite de lumière ", "light leak ") + s.leak + "%");
  if(s.dust) a.push(T("poussière ", "dust ") + s.dust + "%");
  if(s.border) a.push(s.border === "polaroid" ? "Polaroid" : T("bords de pellicule", "film borders"));
  if(s.date) a.push(T("date", "date stamp"));
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

/* ---------- correcteur : chaque point est remplace par la zone voisine la plus ressemblante ---------- */
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

/* ---------- effets film ---------- */
function rnd(seed){ return function(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function film(c, s, Q){
  var x = c.getContext("2d"), w = c.width, h = c.height, mn = Math.min(w, h);
  if(s.halo){
    var sw = Math.max(16, Math.round(w / 4)), sh = Math.max(16, Math.round(h / 4)), m = cvs(sw, sh), mx = m.getContext("2d");
    mx.drawImage(c, 0, 0, sw, sh); var id = mx.getImageData(0, 0, sw, sh), d = id.data;
    for(var i = 0; i < d.length; i += 4){ var l = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2], a = Math.max(0, Math.min(1, (l - 205) / 45)); d[i] = 255; d[i+1] = 70; d[i+2] = 30; d[i+3] = a * 255; }
    mx.putImageData(id, 0, 0);
    var b = cvs(w, h), bx = b.getContext("2d"); bx.filter = "blur(" + Math.max(3, mn / 70).toFixed(1) + "px)"; bx.drawImage(m, 0, 0, w, h);
    x.save(); x.globalCompositeOperation = "screen"; x.globalAlpha = Math.min(1, s.halo / 100 * 0.9); x.drawImage(b, 0, 0); x.restore();
  }
  if(s.leak){
    var pos = {tl:[0,0], tr:[w,0], l:[0,h*0.5], r:[w,h*0.5], bl:[0,h], br:[w,h]}[s.leakPos] || [0,0];
    var g1 = x.createRadialGradient(pos[0], pos[1], 0, pos[0], pos[1], Math.max(w, h) * 0.75);
    g1.addColorStop(0, "rgba(255,200,90,0.95)"); g1.addColorStop(0.25, "rgba(255,110,40,0.7)"); g1.addColorStop(0.55, "rgba(230,40,60,0.25)"); g1.addColorStop(1, "rgba(230,40,60,0)");
    x.save(); x.globalCompositeOperation = "screen"; x.globalAlpha = s.leak / 100; x.fillStyle = g1; x.fillRect(0, 0, w, h); x.restore();
  }
  if(s.dust){
    var R = rnd(Math.round(w * 7 + h * 13)), n = Math.round(s.dust * 1.6), sc = mn / 1000;
    x.save();
    for(var i = 0; i < n; i++){
      var px = R() * w, py = R() * h, rr = (0.6 + R() * 2.2) * sc, white = R() < 0.6;
      x.globalAlpha = 0.25 + R() * 0.5; x.fillStyle = white ? "#fff" : "#000";
      x.beginPath(); x.ellipse(px, py, rr, rr * (0.5 + R()), R() * 3, 0, 7); x.fill();
      if(R() < 0.12){ x.strokeStyle = x.fillStyle; x.lineWidth = Math.max(0.6, sc * 0.7); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + (R() - 0.5) * 40 * sc, py + 20 * sc, px + (R() - 0.5) * 60 * sc, py + (20 + R() * 60) * sc); x.stroke(); }
    }
    var ns = Math.round(s.dust / 35);
    for(var j = 0; j < ns; j++){ var sx = R() * w; x.globalAlpha = 0.12 + R() * 0.15; x.strokeStyle = "#fff"; x.lineWidth = Math.max(0.7, sc); x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + (R() - 0.5) * 12 * sc, h); x.stroke(); }
    x.restore();
  }
  if(s.date){
    var dt = (Q && Q.date) || new Date(), yy = String(dt.getFullYear()).slice(2), txt = "'" + yy + " " + ("0" + (dt.getMonth() + 1)).slice(-2) + " " + ("0" + dt.getDate()).slice(-2);
    var fs = Math.max(12, mn / 22);
    x.save(); x.font = "bold " + fs + "px 'Courier New', monospace"; x.textAlign = "right"; x.textBaseline = "bottom";
    x.shadowColor = "rgba(255,120,30,0.9)"; x.shadowBlur = fs / 3; x.fillStyle = "rgba(255,150,40,0.95)";
    x.fillText(txt, w - fs * 1.2, h - fs * 0.9); x.restore();
  }
  if(s.border === "film" || s.border === "polaroid"){
    var pol = s.border === "polaroid", side = Math.round(mn * (pol ? 0.06 : 0.045)), bottom = pol ? Math.round(mn * 0.2) : side;
    var o = cvs(w + side * 2, h + side + bottom), ox = o.getContext("2d");
    ox.fillStyle = pol ? "#f4f1ea" : "#0b0b0b"; ox.fillRect(0, 0, o.width, o.height);
    ox.drawImage(c, side, side);
    if(!pol){
      ox.fillStyle = "rgba(255,150,40,0.9)"; ox.font = "bold " + Math.round(side * 0.42) + "px sans-serif"; ox.textBaseline = "middle";
      ox.fillText("JM LAB PRO 400", side * 1.2, side / 2);
      ox.textAlign = "right"; ox.fillText("▶ 24", o.width - side * 1.2, side / 2);
      ox.textAlign = "left"; ox.fillText("24A", side * 1.2, o.height - side / 2);
    }
    return o;
  }
  return c;
}

/* ---------- branchement dans le rendu des effets ---------- */
async function pre(bmp, Q){
  var s = get(), single = Q && Q.single, c = null;
  function base(){ if(!c){ c = cvs(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0); } return c; }
  if(curveOn(s)){ var b = base(); applyCurves(b.getContext("2d"), b.width, b.height, s); }
  if(single && geoOn()) c = geometry(c || bmp, geo);
  return c || bmp;
}
function post(c, Q){ var s = get(); return filmOn(s) ? film(c, s, Q) : c; }
/* date de prise de vue lue dans l'EXIF du fichier (pour le tampon date) */
function exifDate(blob){
  return blob.slice(0, 131072).arrayBuffer().then(function(b){
    var u = new Uint8Array(b), str = ""; for(var i = 0; i < u.length; i++) str += String.fromCharCode(u[i]);
    var m = str.match(/(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }).catch(function(){ return null; });
}
window.__jmsFX2 = {pre:pre, post:post, active:active, summary:summary, exifDate:exifDate, get:get};

/* ---------- image de travail pour les editeurs (apercu corrige, sans bandes sombres) ---------- */
/* dimensions reelles de la photo ouverte : pour retrouver exactement la photo dans l'apercu (meme si ses bords sont sombres) */
var nat = null;
document.addEventListener("change", function(e){
  var t = e.target; if(!t || t.type !== "file" || t.multiple || !t.files || !t.files[0]) return;
  nat = null; var u = URL.createObjectURL(t.files[0]), im = new Image();
  im.onload = function(){ nat = {w:im.naturalWidth, h:im.naturalHeight}; URL.revokeObjectURL(u); };
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
"#jx2Bar{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px}" +
"#jx2Bar button{border:0;border-radius:14px;padding:10px 2px;font-weight:900;font-size:11px;color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:0 3px 8px #0007}" +
"#jx2Bar button .i{font-size:22px;line-height:1}#jx2Bar button.on{outline:3px solid #FFB300;outline-offset:1px}" +
"#jx2Bar .b1{background:#6D4C41}#jx2Bar .b2{background:#00897B}#jx2Bar .b3{background:#C62828}#jx2Bar .b4{background:#5E35B1}" +
"body:not([data-tab=reg]) #jx2Bar{display:none!important}" +
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

/* ================= EFFETS FILM ================= */
function filmScreen(){
  var s = get(), ph = photo();
  show('<div class="jmsTitle">🎞️ ' + T("EFFETS FILM", "FILM EFFECTS") + '</div>' +
   (ph ? '<canvas id="x2Fp" class="x2C"></canvas>' : '<div class="x2Hint">' + T("Ouvre une photo pour voir l'aperçu.", "Open a photo to see the preview.") + '</div>') +
   '<div class="x2Hint">' + T("Appliqués à l'enregistrement de la photo et au lot. Mets à 0 pour désactiver.", "Applied when saving the photo and to batches. Set to 0 to turn off.") + '</div>' +
   slider("x2Ha", T("🔴 Halo autour des lumières", "🔴 Halation around lights"), s.halo, 0, 100, 1, " %") +
   slider("x2Lk", T("🔥 Fuite de lumière", "🔥 Light leak"), s.leak, 0, 100, 1, " %") +
   '<div class="x2Row" id="x2Lp"><button data-a="lp" data-p="tl">↖</button><button data-a="lp" data-p="tr">↗</button><button data-a="lp" data-p="l">⬅</button><button data-a="lp" data-p="r">➡</button><button data-a="lp" data-p="bl">↙</button><button data-a="lp" data-p="br">↘</button></div>' +
   slider("x2Du", T("✨ Poussière et rayures", "✨ Dust and scratches"), s.dust, 0, 100, 1, " %") +
   '<label class="x2Lb">' + T("🖼️ Bords", "🖼️ Borders") + '</label><div class="x2Row" id="x2Bo"><button data-a="bo" data-b="">' + T("Aucun", "None") + '</button><button data-a="bo" data-b="film">' + T("Pellicule", "Film strip") + '</button><button data-a="bo" data-b="polaroid">Polaroid</button></div>' +
   '<div class="x2Row"><button data-a="dt" id="x2Dt">📅 ' + T("Date orange", "Orange date") + '</button></div>' +
   '<button class="jmsBtn go" data-a="ok">✔ ' + T("TERMINÉ", "DONE") + '</button>');
  var pc = $("x2Fp"), base = null;
  if(pc){ var sz = fitCanvas(pc, ph.width, ph.height, 700); base = cvs(sz[0], sz[1]); base.getContext("2d").drawImage(ph, 0, 0, sz[0], sz[1]); }
  function prev(){
    if(!pc) return; var c = cvs(base.width, base.height); c.getContext("2d").drawImage(base, 0, 0);
    if(curveOn(s)) applyCurves(c.getContext("2d"), c.width, c.height, s);
    if(geoOn()) c = geometry(c, geo);
    var o = film(c, s, {}); var sz2 = fitCanvas(pc, o.width, o.height, 700); pc.getContext("2d").drawImage(o, 0, 0, sz2[0], sz2[1]);
  }
  function marks(){
    Array.prototype.forEach.call($("x2Lp").children, function(b){ b.classList.toggle("on", b.dataset.p === s.leakPos); });
    Array.prototype.forEach.call($("x2Bo").children, function(b){ b.classList.toggle("on", b.dataset.b === s.border); });
    $("x2Dt").classList.toggle("on", !!s.date);
  }
  var t = 0; function later(){ clearTimeout(t); t = setTimeout(prev, 120); }
  [["x2Ha", "halo"], ["x2Lk", "leak"], ["x2Du", "dust"]].forEach(function(p){ $(p[0]).oninput = function(){ s[p[1]] = +this.value; $(p[0] + "v").textContent = this.value; put(s); later(); }; });
  HH.lp = function(b){ s.leakPos = b.dataset.p; if(!s.leak){ s.leak = 50; $("x2Lk").value = 50; $("x2Lkv").textContent = 50; } put(s); marks(); prev(); };
  HH.bo = function(b){ s.border = b.dataset.b; put(s); marks(); prev(); };
  HH.dt = function(){ s.date = !s.date; put(s); marks(); prev(); };
  HH.ok = function(){ put(s); hide(); };
  marks(); prev();
}

/* ---------- message ---------- */
function note(t){ if(window.__jmsNote) window.__jmsNote(t, "ok", 3500); }

/* ---------- barre d'outils dans RÉGLAGES ---------- */
function bar(){
  var c = document.querySelector(".space-y-3.mb-4"); if(!c) return;
  var b = $("jx2Bar");
  if(!b){
    b = document.createElement("div"); b.id = "jx2Bar";
    b.innerHTML = '<button class="b1" data-t="crop"><span class="i">✂️</span>' + T("RECADRER", "CROP") + '</button>' +
      '<button class="b2" data-t="curves"><span class="i">📈</span>' + T("COURBES", "CURVES") + '</button>' +
      '<button class="b4" data-t="film"><span class="i">🎞️</span>' + T("EFFETS FILM", "FILM FX") + '</button>';
    b.onclick = function(e){ var t = e.target.closest("button"); if(!t) return; ({crop:crop, curves:curves, film:filmScreen})[t.dataset.t](); };
  }
  var anchor = $("jxFav") && $("jxFav").parentNode === c.parentNode ? $("jxFav") : c;
  if(b.nextSibling !== anchor || b.parentNode !== anchor.parentNode) anchor.parentNode.insertBefore(b, anchor);
  var s = get();
  b.querySelector('[data-t="crop"]').classList.toggle("on", geoOn());
  b.querySelector('[data-t="curves"]').classList.toggle("on", curveOn(s));
  b.querySelector('[data-t="film"]').classList.toggle("on", filmOn(s));
}
setInterval(bar, 700); setTimeout(bar, 300);
})();
