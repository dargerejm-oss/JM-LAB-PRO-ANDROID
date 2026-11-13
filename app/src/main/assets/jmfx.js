/* JM LAB PRO - EFFETS : ciel auto, visage/peau auto, degrade, grain, noir & blanc, redressement, pinceau */
(function(){
"use strict";
var KEY = "jms_fx";
var D = {sky:0, face:0, grad:0, grain:0, bw:"", angle:0, smooth:0, sharp:0, denoise:0, crop:"", wm:"", wmop:30};
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function get(){ try{ var o = JSON.parse(localStorage.getItem(KEY)||"{}"); return Object.assign({}, D, o); }catch(e){ return Object.assign({}, D); } }
function put(o){ localStorage.setItem(KEY, JSON.stringify(o)); }
var strokes = [];
function active(Q){ var s = get(); return !!(s.smooth || s.sharp || s.denoise || s.crop || s.wm || s.sky || s.face || s.grad || s.grain || s.bw || (Q && Q.single && (s.angle || strokes.length))); }
function summary(){
  var s = get(), a = [];
  if(s.smooth) a.push("peau lissée "+s.smooth+"%"); if(s.sharp) a.push("netteté "+s.sharp+"%"); if(s.denoise) a.push("bruit "+s.denoise+"%"); if(s.crop) a.push("format "+s.crop); if(s.wm) a.push("filigrane"); if(s.sky) a.push("ciel "+s.sky+"%"); if(s.face) a.push("visage "+s.face+"%"); if(s.grad) a.push("dégradé "+s.grad+"%"); if(s.grain) a.push("grain "+s.grain+"%"); if(s.bw) a.push("N&B "+s.bw); if(s.angle) a.push("redressement "+s.angle+"°");
  return a.join(" • ");
}
function cvs(w,h){ var c = document.createElement("canvas"); c.width = Math.max(1,Math.round(w)); c.height = Math.max(1,Math.round(h)); return c; }

/* ---------- masques (basse resolution) ---------- */
function smallData(src, w, h){ var c = cvs(w,h), x = c.getContext("2d"); x.drawImage(src,0,0,c.width,c.height); return x.getImageData(0,0,c.width,c.height); }
function maskToCanvas(m, w, h, blur){
  var c = cvs(w,h), x = c.getContext("2d"), id = x.createImageData(w,h);
  for(var i = 0; i < w*h; i++){ id.data[i*4+3] = m[i]; id.data[i*4] = id.data[i*4+1] = id.data[i*4+2] = 255; }
  x.putImageData(id,0,0);
  if(!blur) return c;
  var c2 = cvs(w,h), x2 = c2.getContext("2d"); x2.filter = "blur("+blur+"px)"; x2.drawImage(c,0,0); return c2;
}
function skyMask(src, w, h){
  var d = smallData(src, w, h), W = d.width, Hh = d.height, m = new Uint8Array(W*Hh), cnt = 0, lim = Math.floor(Hh*0.7);
  for(var x = 0; x < W; x++){
    var miss = 0, last = -1;
    for(var y = 0; y < lim; y++){
      var i = (y*W+x)*4, r = d.data[i], g = d.data[i+1], b = d.data[i+2], mx = Math.max(r,g,b), mn = Math.min(r,g,b), l = 0.299*r+0.587*g+0.114*b, sat = mx ? (mx-mn)/mx : 0;
      var sky = (b > r+10 && b >= g-4) || (l > 175 && sat < 0.2) || (l > 120 && b > r+25);
      if(sky){ miss = 0; last = y; } else { miss++; if(miss > 2) break; }
    }
    for(var y2 = 0; y2 <= last; y2++){ m[y2*W+x] = 255; cnt++; }
  }
  return {m:m, w:W, h:Hh, area:cnt/(W*Hh)};
}
async function faceMask(src, w, h){
  var small = smallData(src, w, h), W = small.width, Hh = small.height, m = new Uint8Array(W*Hh);
  if(window.FaceDetector){
    try{ var fd = new window.FaceDetector({fastMode:true, maxDetectedFaces:6}), cv = cvs(W*4, Hh*4); cv.getContext("2d").drawImage(src,0,0,cv.width,cv.height);
      var fs = await fd.detect(cv);
      if(fs.length){ fs.forEach(function(f){ var b = f.boundingBox, cx = (b.x+b.width/2)/4, cy = (b.y+b.height/2)/4, rx = b.width/8*1.05, ry = b.height/8*1.15;
        for(var y = Math.max(0,Math.floor(cy-ry)); y < Math.min(Hh,Math.ceil(cy+ry)); y++) for(var x = Math.max(0,Math.floor(cx-rx)); x < Math.min(W,Math.ceil(cx+rx)); x++){ var dx = (x-cx)/rx, dy = (y-cy)/ry; if(dx*dx+dy*dy <= 1) m[y*W+x] = 255; } });
        return {m:m, w:W, h:Hh, area:1, how:"visage"}; }
    }catch(e){}
  }
  var skin = new Uint8Array(W*Hh);
  for(var i = 0; i < W*Hh; i++){ var r = small.data[i*4], g = small.data[i*4+1], b = small.data[i*4+2], cb = 128-0.168736*r-0.331264*g+0.5*b, cr = 128+0.5*r-0.418688*g-0.081312*b, l = 0.299*r+0.587*g+0.114*b;
    if(cb > 77 && cb < 127 && cr > 133 && cr < 173 && l > 45 && r > g && g > b*0.8) skin[i] = 1; }
  var seen = new Uint8Array(W*Hh), comps = [];
  for(var s = 0; s < W*Hh; s++){ if(!skin[s] || seen[s]) continue; var q = [s], pts = []; seen[s] = 1;
    while(q.length){ var p = q.pop(); pts.push(p); var px = p % W, py = (p/W)|0; [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(dd){ var nx = px+dd[0], ny = py+dd[1]; if(nx < 0 || ny < 0 || nx >= W || ny >= Hh) return; var ni = ny*W+nx; if(skin[ni] && !seen[ni]){ seen[ni] = 1; q.push(ni); } }); }
    if(pts.length > W*Hh*0.004) comps.push(pts); }
  comps.sort(function(a,b){ return b.length - a.length; });
  var tot = 0; comps.slice(0,3).forEach(function(pts){ pts.forEach(function(p){ m[p] = 255; tot++; }); });
  return {m:m, w:W, h:Hh, area:tot/(W*Hh), how:"peau"};
}
function layer(ctx, w, h, maskCanvas, mode, v){
  var L = cvs(w,h), lx = L.getContext("2d"); lx.fillStyle = "rgb("+v+","+v+","+v+")"; lx.fillRect(0,0,L.width,L.height);
  lx.globalCompositeOperation = "destination-in"; lx.imageSmoothingQuality = "high"; lx.drawImage(maskCanvas,0,0,L.width,L.height);
  ctx.globalCompositeOperation = mode; ctx.drawImage(L,0,0); ctx.globalCompositeOperation = "source-over";
}
function brushMasks(w,h){
  var SW = 256, SH = Math.max(8, Math.round(256*h/w)), light = cvs(SW,SH), dark = cvs(SW,SH);
  var lx = light.getContext("2d"), dx = dark.getContext("2d"); 
  strokes.forEach(function(s){ var x = s.m > 0 ? lx : dx, cx = s.x*SW, cy = s.y*SH, r = Math.max(2, s.r*SW), g = x.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0, "rgba(255,255,255,"+(0.25*s.s)+")"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(cx-r,cy-r,2*r,2*r); });
  return {light:light, dark:dark};
}
/* ---------- rendu ---------- */
async function render(bmp, Q){
  Q = Q || {}; var s = get(), w = bmp.width, h = bmp.height, c = cvs(w,h), x = c.getContext("2d");
  if(Q.single && s.angle){ var a = s.angle*Math.PI/180, k = Math.cos(Math.abs(a)) + Math.sin(Math.abs(a))*Math.max(w/h, h/w); x.save(); x.translate(w/2,h/2); x.rotate(a); x.scale(k,k); x.drawImage(bmp,-w/2,-h/2); x.restore(); }
  else x.drawImage(bmp,0,0);
  if(s.bw){
    var tint = {red:"rgb(255,130,130)", yellow:"rgb(255,230,120)", green:"rgb(140,255,150)", blue:"rgb(140,170,255)"}[s.bw];
    if(tint){ x.globalCompositeOperation = "multiply"; x.fillStyle = tint; x.fillRect(0,0,w,h); x.globalCompositeOperation = "source-over"; }
    var t = cvs(w,h); t.getContext("2d").filter = "grayscale(1) contrast(1.08)"; t.getContext("2d").drawImage(c,0,0); x.drawImage(t,0,0);
  }
  var SW = 160, SH = Math.max(8, Math.round(SW*h/w));
  if(s.sky){ var sm = skyMask(c, SW, SH); if(sm.area > 0.03) layer(x, w, h, maskToCanvas(sm.m, sm.w, sm.h, 2), "multiply", Math.round(255*(1-0.55*s.sky/100))); }
  if(s.face){ var fm = await faceMask(c, SW, SH); if(fm.area > 0) layer(x, w, h, maskToCanvas(fm.m, fm.w, fm.h, 3), "screen", Math.round(255*0.35*s.face/100)); }
  if(s.grad){ var gr = cvs(16,64), gx = gr.getContext("2d"), gg = gx.createLinearGradient(0,0,0,64); gg.addColorStop(0,"rgba(255,255,255,1)"); gg.addColorStop(0.6,"rgba(255,255,255,0)"); gx.fillStyle = gg; gx.fillRect(0,0,16,64); layer(x, w, h, gr, "multiply", Math.round(255*(1-0.6*s.grad/100))); }
  if(Q.single && strokes.length){ var bm = brushMasks(w,h); layer(x, w, h, bm.light, "screen", 120); layer(x, w, h, bm.dark, "multiply", 120); }
  if(s.denoise){ var dn = cvs(w,h), dx2 = dn.getContext("2d"); dx2.filter = "blur("+Math.max(1,Math.min(w,h)/1400*1.3).toFixed(1)+"px)"; dx2.drawImage(c,0,0); x.globalAlpha = 0.6*s.denoise/100; x.drawImage(dn,0,0); x.globalAlpha = 1; }
  if(s.smooth){
    var sm2 = await faceMask(c, SW, SH);
    if(sm2.area > 0){ var bl = cvs(w,h), bx2 = bl.getContext("2d"); bx2.filter = "blur("+Math.max(2,Math.min(w,h)/260).toFixed(1)+"px)"; bx2.drawImage(c,0,0); bx2.filter = "none"; bx2.globalCompositeOperation = "destination-in"; bx2.drawImage(maskToCanvas(sm2.m, sm2.w, sm2.h, 3),0,0,w,h);
      x.globalAlpha = 0.65*s.smooth/100; x.drawImage(bl,0,0); x.globalAlpha = 1; }
  }
  if(s.sharp){
    var hp = cvs(w,h), hx = hp.getContext("2d"); hx.drawImage(c,0,0);
    var inv = cvs(w,h), ix = inv.getContext("2d"); ix.filter = "blur("+Math.max(1,Math.min(w,h)/900).toFixed(1)+"px) invert(1)"; ix.drawImage(c,0,0);
    hx.globalAlpha = 0.5; hx.drawImage(inv,0,0); x.globalCompositeOperation = "overlay"; x.globalAlpha = Math.min(1, s.sharp/100*1.2); x.drawImage(hp,0,0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  }
  if(s.grain){
    var tile = cvs(256,256), tx = tile.getContext("2d"), id = tx.createImageData(256,256);
    for(var i = 0; i < id.data.length; i += 4){ var v = 128 + (Math.random()+Math.random()+Math.random()-1.5)*70; id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255; }
    tx.putImageData(id,0,0);
    var sc = Math.max(1, Math.min(w,h)/1100), pat = x.createPattern(tile,"repeat"); x.save(); x.scale(sc,sc); x.globalAlpha = 0.55*s.grain/100; x.globalCompositeOperation = "overlay"; x.fillStyle = pat; x.fillRect(0,0,w/sc,h/sc); x.restore();
  }
  if(s.wm){
    var fs = Math.max(14, Math.min(w,h)/16); x.save(); x.globalAlpha = Math.max(0.05, Math.min(0.9, (s.wmop||30)/100)); x.fillStyle = "#fff"; x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = fs/8; x.font = "bold "+fs+"px sans-serif"; x.textAlign = "center"; x.translate(w/2,h/2); x.rotate(-0.5);
    var step = fs*3.2, tw = x.measureText(s.wm).width + fs*2, R = Math.hypot(w,h);
    for(var yy = -R; yy < R; yy += step) for(var xx = -R + ((Math.round(yy/step)%2)*tw/2); xx < R; xx += tw) x.fillText(s.wm, xx, yy);
    x.restore();
  }
  if(s.crop){
    var rr = {"1:1":1, "4:5":0.8, "9:16":0.5625, "16:9":1.7778, "3:2":1.5, "2:3":0.6667}[s.crop];
    if(rr){ var cw = w, ch = Math.round(w/rr); if(ch > h){ ch = h; cw = Math.round(h*rr); } var ox = Math.round((w-cw)/2), oy = Math.round((h-ch)*0.35), o = cvs(cw,ch); o.getContext("2d").drawImage(c, ox, oy, cw, ch, 0, 0, cw, ch); return o; }
  }
  return c;
}
function run(blob, Q){ return createImageBitmap(blob).then(function(bmp){ return render(bmp, Q).then(function(c){ if(bmp.close) bmp.close(); return new Promise(function(res){ c.toBlob(function(b){ res(b); }, "image/jpeg", 0.95); }); }); }); }

/* ---------- branchement sur le moteur CADRE + SIGNATURE ---------- */
if(window.__jmsCS){
  var orig = window.__jmsCS.process;
  window.__jmsCS.process = function(blob, Q){ Q = Q || {}; var p = active(Q) ? run(blob, Q) : Promise.resolve(blob); return p.then(function(b){ return orig(b, Q); }); };
}
window.__jmsFX = {active:active, summary:summary, run:run, render:render, get:get};
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple){ strokes = []; try{ var o = get(); if(o.angle){ o.angle = 0; put(o); var sl = document.getElementById("fxAng"); if(sl){ sl.value = 0; var v = document.getElementById("fxAngv"); if(v) v.textContent = 0; } } }catch(e){} } }, true);

/* ---------- interface ---------- */
var ov = document.createElement("div"); ov.id = "jmsFXo"; ov.className = "jmsOvl"; ov.style.zIndex = 3360;
ov.innerHTML = '<div class="jmsBoxG" id="fxBox"></div>'; document.body.appendChild(ov);
var bx = $("fxBox"), HH = {};
function show(h){ bx.innerHTML = h; ov.classList.add("show"); }
function hide(){ ov.classList.remove("show"); }
ov.addEventListener("click", function(e){ var b = e.target.closest("[data-f]"); if(b && HH[b.dataset.f]) HH[b.dataset.f](b); });
var oldBack = window.__jmsBack2; window.__jmsBack2 = function(){ if(ov.classList.contains("show")){ hide(); return true; } return oldBack ? oldBack() : false; };
function sl(id, label, val, min, max, unit){ return '<label class="gL">'+label+' : <b id="'+id+'v">'+val+'</b> '+(unit||"%")+'</label><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" value="'+val+'" style="width:100%">'; }
function previewCanvas(){
  var cv = document.querySelector(".fixed-top canvas"); if(!cv || cv.width < 10) return null;
  var x = cv.getContext("2d"), W = cv.width, Hh = cv.height, d = x.getImageData(0,0,W,Hh).data, bg = [d[0],d[1],d[2]], x0 = W, x1 = -1, y0 = Hh, y1 = -1;
  for(var yy = 0; yy < Hh; yy += 2) for(var xx = 0; xx < W; xx += 2){ var i = (yy*W+xx)*4; if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]) > 18){ if(xx < x0) x0 = xx; if(xx > x1) x1 = xx; if(yy < y0) y0 = yy; if(yy > y1) y1 = yy; } }
  if(x1 < 0) return null; var c = cvs(x1-x0-1, y1-y0-1); c.getContext("2d").drawImage(cv, x0+1, y0+1, c.width, c.height, 0, 0, c.width, c.height); return c;
}
function screen(){
  var s = get();
  show('<div class="jmsTitle">✨ EFFETS & RETOUCHE LOCALE</div><div class="jtSub">Appliqués aux photos du lot et à l\'export HD. Mets à 0 pour désactiver.</div>'+
   sl("fxSky","🌤️ Assombrir le ciel (auto)",s.sky,0,100)+sl("fxFace","🙂 Éclaircir visage / peau (auto)",s.face,0,100)+sl("fxGrad","🌓 Dégradé sombre en haut",s.grad,0,100)+sl("fxGrain","🎞️ Grain argentique",s.grain,0,100)+
   '<label class="gL">⚫ Noir & blanc</label><select class="gIn" id="fxBw" style="width:100%"><option value="">Couleur (désactivé)</option><option value="n">Noir & blanc neutre</option><option value="red">N&B filtre rouge (ciel sombre)</option><option value="yellow">N&B filtre jaune</option><option value="green">N&B filtre vert</option><option value="blue">N&B filtre bleu</option></select>'+
   sl("fxSm","💆 Peau lissée (visage)",s.smooth,0,100)+sl("fxSh","🔍 Netteté",s.sharp,0,100)+sl("fxDn","🌫️ Réduction du bruit",s.denoise,0,100)+
   '<label class="gL">📱 Recadrage prêt à publier</label><select class="gIn" id="fxCr" style="width:100%"><option value="">Aucun</option><option value="1:1">Carré 1:1</option><option value="4:5">Instagram 4:5</option><option value="9:16">Story 9:16</option><option value="16:9">Paysage 16:9</option><option value="3:2">3:2</option><option value="2:3">2:3</option></select>'+
   '<label class="gL">©️ Filigrane de protection (texte, vide = aucun)</label><input class="gIn" id="fxWm" type="text" style="width:100%" value="'+esc(s.wm)+'">'+sl("fxWo","Opacité du filigrane",s.wmop,5,80)+
   sl("fxAng","📐 Redressement (photo seule)",s.angle,-10,10,"°")+
   '<button class="jmsBtn go" data-f="prev">👁️ VOIR LE RÉSULTAT SUR MA PHOTO</button>'+
   '<button class="jmsBtn go" data-f="brush">🖌️ PINCEAU : ÉCLAIRCIR / ASSOMBRIR AU DOIGT</button>'+
   '<button class="jmsBtn close" data-f="close">TERMINÉ</button>');
  $("fxBw").value = s.bw === "" ? "" : (["red","yellow","green","blue"].indexOf(s.bw) >= 0 ? s.bw : "n");
  $("fxCr").value = s.crop;
  function save(){ var o = get(); o.smooth = +$("fxSm").value; o.sharp = +$("fxSh").value; o.denoise = +$("fxDn").value; o.crop = $("fxCr").value; o.wm = $("fxWm").value.trim(); o.wmop = +$("fxWo").value; $("fxSmv").textContent = o.smooth; $("fxShv").textContent = o.sharp; $("fxDnv").textContent = o.denoise; $("fxWov").textContent = o.wmop; o.sky = +$("fxSky").value; o.face = +$("fxFace").value; o.grad = +$("fxGrad").value; o.grain = +$("fxGrain").value; o.angle = +$("fxAng").value; var b = $("fxBw").value; o.bw = b === "n" ? "gray" : b; put(o);
    $("fxSkyv").textContent = o.sky; $("fxFacev").textContent = o.face; $("fxGradv").textContent = o.grad; $("fxGrainv").textContent = o.grain; $("fxAngv").textContent = o.angle; }
  ["fxSky","fxFace","fxGrad","fxGrain","fxAng","fxBw","fxSm","fxSh","fxDn","fxCr","fxWm","fxWo"].forEach(function(id){ $(id).oninput = save; $(id).onchange = save; });
  HH.close = function(){ save(); hide(); }; HH.prev = function(){ save(); preview(); }; HH.brush = function(){ save(); brush(); };
}
async function preview(){
  var pc = previewCanvas(); if(!pc){ alert("Choisis d'abord une image (onglet RÉGLAGES)."); return; }
  var bmp = await createImageBitmap(pc), c = await render(bmp, {single:true});
  show('<div class="jmsTitle">👁️ RÉSULTAT</div><img src="'+c.toDataURL("image/jpeg",0.85)+'" style="width:100%;border-radius:12px;display:block"><div class="jtSub">'+esc(summary() || "aucun effet actif")+'</div><button class="jmsBtn go" data-f="back">← RÉGLER</button><button class="jmsBtn close" data-f="close">TERMINÉ</button>');
  HH.back = screen; HH.close = hide;
}
async function brush(){
  var pc = previewCanvas(); if(!pc){ alert("Choisis d'abord une image (onglet RÉGLAGES)."); screen(); return; }
  var bmp = await createImageBitmap(pc), mode = 1, size = 0.08, str = 0.6;
  show('<div class="jmsTitle">🖌️ PINCEAU</div><canvas id="fxC" style="width:100%;border-radius:12px;touch-action:none;display:block"></canvas>'+
   '<div id="fxModeT" class="jtSub" style="font-weight:900;font-size:15px"></div><div class="fxRow"><button class="jmsBtn close" data-f="m1" id="fxM1">☀️ ÉCLAIRCIR</button><button class="jmsBtn close" data-f="m2" id="fxM2">🌑 ASSOMBRIR</button></div>'+
   sl("fxSz","Taille",8,2,30)+sl("fxSt","Force",60,10,100)+
   '<div class="fxRow"><button class="jmsBtn close" data-f="undo">↩️ ANNULER</button><button class="jmsBtn close" data-f="clr">TOUT EFFACER</button></div><button class="jmsBtn go" data-f="done">✔ TERMINÉ (appliqué à l\'export de cette photo)</button>');
  var c = $("fxC"), W = Math.min(900, pc.width), Hh = Math.round(W*pc.height/pc.width); c.width = W; c.height = Hh;
  var base = cvs(W, Hh); base.getContext("2d").drawImage(bmp,0,0,W,Hh); var busy = false, rb = null;
  async function redraw(){ if(busy) return; busy = true; var b2 = await createImageBitmap(base), r = await render(b2, {single:true}); c.getContext("2d").drawImage(r,0,0,W,Hh); busy = false; }
  var drawing = false;
  function pos(e){ var r = c.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width, y:(e.clientY-r.top)/r.height}; }
  function dot(e){ var p = pos(e); strokes.push({x:p.x, y:p.y, r:size, m:mode, s:str}); }
  c.onpointerdown = function(e){ drawing = true; c.setPointerCapture(e.pointerId); dot(e); mark(e); };
  c.onpointermove = function(e){ if(drawing){ dot(e); mark(e); } };
  c.onpointerup = function(){ drawing = false; redraw(); };
  function mark(e){ var p = pos(e), x = c.getContext("2d"); x.beginPath(); x.arc(p.x*W, p.y*Hh, size*W, 0, 7); x.fillStyle = mode > 0 ? "rgba(255,230,80,.25)" : "rgba(80,140,255,.25)"; x.fill(); }
  function setMode(m){
    mode = m; var a = $("fxM1"), d = $("fxM2");
    a.style.cssText = m > 0 ? "background:#43A047;color:#fff;outline:4px solid #FFB300" : "background:#3a3a3a;color:#aaa"; a.textContent = m > 0 ? "✔ ☀️ ÉCLAIRCIR" : "☀️ ÉCLAIRCIR";
    d.style.cssText = m < 0 ? "background:#1E88E5;color:#fff;outline:4px solid #FFB300" : "background:#3a3a3a;color:#aaa"; d.textContent = m < 0 ? "✔ 🌑 ASSOMBRIR" : "🌑 ASSOMBRIR";
    var t = $("fxModeT"); if(t){ t.textContent = m > 0 ? "Mode : ÉCLAIRCIR (jaune)" : "Mode : ASSOMBRIR (bleu)"; t.style.color = m > 0 ? "#66BB6A" : "#64B5F6"; }
  }
  HH.m1 = function(){ setMode(1); }; HH.m2 = function(){ setMode(-1); }; setMode(1);
  $("fxSz").oninput = function(){ size = $("fxSz").value/100; $("fxSzv").textContent = $("fxSz").value; };
  $("fxSt").oninput = function(){ str = $("fxSt").value/100; $("fxStv").textContent = $("fxSt").value; };
  HH.undo = function(){ var n = strokes.length; strokes.splice(Math.max(0, n-25), 25); redraw(); }; HH.clr = function(){ strokes = []; redraw(); };
  HH.done = function(){ screen(); };
  redraw();
}
window.__jmsX = window.__jmsX || {}; window.__jmsX.x_fx = screen;

/* ---------- rappel dans l'ecran PRET A LANCER ---------- */
new MutationObserver(function(){
  var n = $("gName"); if(!n || $("gFx")) return;
  var b = document.createElement("button"); b.id = "gFx"; b.className = "gBtn csb" + (active({}) ? " on" : ""); b.innerHTML = '✨ EFFETS (ciel, visage, grain, N&B…)<small>'+esc(summary() || "aucun")+'</small>';
  b.onclick = function(){ screen(); }; n.parentNode.insertBefore(b, n.previousElementSibling || n);
}).observe(document.body, {childList:true, subtree:true});
})();
