/* JM LAB PRO - CADRE + SIGNATURE integre (meme moteur que l'appli CADRE + SIGNATURE) */
(function(){
"use strict";
var KEY = "jms_cs";
var DEF = {on:false, frame_on:true, frame_style:"classic", frame_outer:"#000000", frame_line:"#ffffff", frame_inner:"#000000", frame_thick:100,
  sig_on:true, sig_kind:"initials", sig_text:"JM.Dargère", sig_font:"cursive", sig_color_auto:false, sig_color:"#a0a0a0", sig_opacity:100, sig_shadow:false,
  sig_pos:"auto", size_initials:28, size_full:25, size_text:22, sig_margin:0.3};
var PRESETS = {
  classic:{label:"CLASSIQUE",ico:"🖤",v:{frame_on:true,frame_style:"classic",frame_thick:100,sig_on:true,sig_kind:"initials",sig_color_auto:false,sig_color:"#a0a0a0",sig_opacity:100,sig_shadow:false}},
  gallery:{label:"GALERIE",ico:"🤍",v:{frame_on:true,frame_style:"white",frame_thick:120,sig_on:true,sig_kind:"full",sig_color_auto:true,sig_opacity:100,sig_shadow:false}},
  gold:{label:"OR",ico:"🥇",v:{frame_on:true,frame_style:"custom",frame_outer:"#16130c",frame_line:"#d4af37",frame_inner:"#16130c",frame_thick:110,sig_on:true,sig_kind:"full",sig_color_auto:false,sig_color:"#d4af37",sig_opacity:100,sig_shadow:true}},
  discret:{label:"DISCRET",ico:"👻",v:{frame_on:true,frame_style:"classic",frame_thick:60,sig_on:true,sig_kind:"initials",sig_color_auto:false,sig_color:"#ffffff",sig_opacity:70,sig_shadow:false}}
};
var FONTS = [["cursive","✒️ Manuscrite"],["italic serif","🎩 Élégante (italique)"],["serif","📖 Classique (serif)"],["sans-serif","🔤 Moderne"],["bold sans-serif","💪 Gras"],["300 sans-serif","🪶 Fin"],["monospace","⌨️ Machine"],["casual","😊 Décontractée"],["sans-serif-condensed","📏 Condensée"]];
var SW = ["#ffffff","#e0e0e0","#a0a0a0","#000000","#d4af37","#e53935","#fb8c00","#fdd835","#43a047","#1e88e5","#8e24aa","#ec407a"];
var S = load();
function load(){ var o = {}; try{ o = JSON.parse(localStorage.getItem(KEY)||"{}"); }catch(e){} var r = {}; for(var k in DEF) r[k] = (o[k] !== undefined) ? o[k] : DEF[k]; return r; }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

/* ---------- moteur ---------- */
var REF = 1245, B_OUT = 32/REF, B_LINE = 4/REF, B_IN = 12/REF;
var _shapes = {};
function shapes(kind){
  if(_shapes[kind]) return _shapes[kind];
  var d = JSON.parse(kind === "full" ? JMSIG.full : JMSIG.initials), out = [];
  d.s.forEach(function(s){
    var hole = !!s[0], f = s.slice(1), x = f[0], y = f[1], path = [[x/10000, y/10000]];
    for(var i = 2; i < f.length; i += 2){ x += f[i]; y += f[i+1]; path.push([x/10000, y/10000]); }
    out.push({path:path, hole:hole});
  });
  return (_shapes[kind] = {aspect:d.a, shapes:out});
}
function vectorMask(kind, wpx){
  var sd = shapes(kind), hpx = Math.max(1, Math.round(wpx/sd.aspect)), ss = 2, W = wpx*ss, H = hpx*ss;
  var c = document.createElement("canvas"); c.width = W; c.height = H; var x = c.getContext("2d");
  function poly(sh){ x.beginPath(); sh.path.forEach(function(p,i){ if(i) x.lineTo(p[0]*W,p[1]*H); else x.moveTo(p[0]*W,p[1]*H); }); x.closePath(); x.fill(); }
  x.fillStyle = "#fff"; sd.shapes.forEach(function(s){ if(!s.hole) poly(s); });
  x.globalCompositeOperation = "destination-out"; sd.shapes.forEach(function(s){ if(s.hole) poly(s); });
  return {c:c, w:wpx, h:hpx};
}
function textMask(text, font, wpx){
  text = (text||"").trim() || "JM.Dargere";
  var big = 300, c = document.createElement("canvas"), x = c.getContext("2d"), f = font || "cursive";
  var m = /^(italic|bold|\d+)\s+(.*)$/.exec(f), style = "", fam = f;
  if(m){ style = m[1] + " "; fam = m[2]; }
  var spec = style + big + "px " + (/^[a-z-]+$/.test(fam) ? fam : '"'+fam+'"');
  x.font = spec; var w = Math.ceil(x.measureText(text).width) + 80, h = big*2;
  c.width = w; c.height = h; x.font = spec; x.fillStyle = "#fff"; x.textBaseline = "middle"; x.fillText(text, 40, h/2);
  var d = x.getImageData(0,0,w,h).data, x0 = w, x1 = 0, y0 = h, y1 = 0;
  for(var j = 0; j < h; j++) for(var i = 0; i < w; i++){ if(d[(j*w+i)*4+3] > 20){ if(i<x0)x0=i; if(i>x1)x1=i; if(j<y0)y0=j; if(j>y1)y1=j; } }
  if(x1 <= x0){ x0 = 0; x1 = w-1; y0 = 0; y1 = h-1; }
  var cw = x1-x0+1, ch = y1-y0+1, hp = Math.max(1, Math.round(ch*wpx/cw));
  var o = document.createElement("canvas"); o.width = wpx; o.height = hp;
  var ox = o.getContext("2d"); ox.imageSmoothingQuality = "high"; ox.drawImage(c, x0, y0, cw, ch, 0, 0, wpx, hp);
  return {c:o, w:wpx, h:hp};
}
function buildMask(P, wpx){ return P.sig_kind === "text" ? textMask(P.sig_text, P.sig_font, wpx) : vectorMask(P.sig_kind === "full" ? "full" : "initials", wpx); }
function hexRgb(h, d){ try{ h = h.replace("#",""); return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)]; }catch(e){ return d; } }
function rgbStr(a){ return "rgb("+a[0]+","+a[1]+","+a[2]+")"; }
function sigBox(fw, fh, total, sw, sh, pos, m){
  var y0 = pos[0] === "t" ? total + m : fh - total - m - sh, x0;
  if(pos[1] === "l") x0 = total + m; else if(pos[1] === "c") x0 = Math.floor((fw - sw)/2); else x0 = fw - total - m - sw;
  return [x0, y0, sw, sh];
}
function regionLum(ctx, b){
  var x = Math.max(0,b[0]), y = Math.max(0,b[1]), w = Math.min(ctx.canvas.width - x, b[2]), h = Math.min(ctx.canvas.height - y, b[3]);
  if(w <= 0 || h <= 0) return 128;
  var d = ctx.getImageData(x,y,w,h).data, s = 0, n = 0, step = Math.max(1, Math.floor(Math.sqrt(w*h/4000)));
  for(var j = 0; j < h; j += step) for(var i = 0; i < w; i += step){ var k = (j*w+i)*4; s += 0.299*d[k] + 0.587*d[k+1] + 0.114*d[k+2]; n++; }
  return n ? s/n : 128;
}
var AUTO = [[255,255,255],[160,160,160],[0,0,0]];
function lumOf(c){ return 0.299*c[0] + 0.587*c[1] + 0.114*c[2]; }

/* dessine photo (+cadre) (+signature) sur un canvas ; src = ImageBitmap ou canvas */
function render(src, P, Q){
  var w = src.width, h = src.height;
  if(Q && Q.max && Math.max(w,h) > Q.max){ var k = Q.max/Math.max(w,h); w = Math.max(1,Math.round(w*k)); h = Math.max(1,Math.round(h*k)); }
  var useCS = P && P.on, frame = useCS && P.frame_on, total = 0;
  var c = document.createElement("canvas"), ctx;
  if(frame){
    var ss = Math.min(w,h), kk = Math.max(0.2, P.frame_thick/100);
    var bo = Math.max(1,Math.round(ss*B_OUT*kk)), bl = Math.max(1,Math.round(ss*B_LINE*kk)), bi = Math.max(1,Math.round(ss*B_IN*kk));
    total = bo+bl+bi; c.width = w+2*total; c.height = h+2*total; ctx = c.getContext("2d");
    var co, cl, ci;
    if(P.frame_style === "classic"){ co = [0,0,0]; cl = [255,255,255]; ci = [0,0,0]; }
    else if(P.frame_style === "white"){ co = [255,255,255]; cl = [0,0,0]; ci = [255,255,255]; }
    else { co = hexRgb(P.frame_outer,[0,0,0]); cl = hexRgb(P.frame_line,[255,255,255]); ci = hexRgb(P.frame_inner,[0,0,0]); }
    ctx.fillStyle = rgbStr(co); ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = rgbStr(cl); ctx.fillRect(bo,bo,c.width-2*bo,c.height-2*bo);
    ctx.fillStyle = rgbStr(ci); ctx.fillRect(bo+bl,bo+bl,c.width-2*(bo+bl),c.height-2*(bo+bl));
  } else { c.width = w; c.height = h; ctx = c.getContext("2d"); }
  ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, total, total, w, h);
  if(useCS && P.sig_on){
    var short = Math.min(w,h), m = Math.round(short*P.sig_margin/100);
    var sizePct = P.sig_kind === "full" ? P.size_full : P.sig_kind === "text" ? P.size_text : P.size_initials;
    var sw = Math.max(2, Math.round(short*sizePct/100)), mk = buildMask(P, sw), sh = mk.h;
    var pos = P.sig_pos, cands = pos === "auto" ? ["bl","br"] : [pos], res = [];
    var fixed = hexRgb(P.sig_color,[160,160,160]);
    cands.forEach(function(cd){
      var b = sigBox(c.width, c.height, total, sw, sh, cd, m), bg = regionLum(ctx, b), rgb = fixed;
      if(P.sig_color_auto){ rgb = AUTO.reduce(function(a,o){ return Math.abs(lumOf(o)-bg) > Math.abs(lumOf(a)-bg) ? o : a; }); }
      res.push({pos:cd, rgb:rgb, bg:bg, ct:Math.abs(lumOf(rgb)-bg), box:b});
    });
    var ch = res[0]; if(res.length > 1 && !(res[0].ct >= 100 || res[1].ct <= res[0].ct)) ch = res[1];
    var tint = document.createElement("canvas"); tint.width = sw; tint.height = sh; var tx = tint.getContext("2d");
    tx.fillStyle = rgbStr(ch.rgb); tx.fillRect(0,0,sw,sh); tx.globalCompositeOperation = "destination-in"; tx.imageSmoothingQuality = "high"; tx.drawImage(mk.c,0,0,sw,sh);
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, P.sig_opacity/100));
    if(P.sig_shadow){ var off = Math.max(1, Math.round(sw*0.012)); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = off*2; ctx.shadowOffsetX = off; ctx.shadowOffsetY = off; }
    ctx.drawImage(tint, ch.box[0], ch.box[1]); ctx.restore();
  }
  return c;
}
function toBlob(c, q){ return new Promise(function(res){ c.toBlob(function(b){ res(b); }, "image/jpeg", q); }); }
function process(blob, Q){
  Q = Q || {};
  var need = S.on || Q.max || (Q.q && Q.q < 0.92);
  if(!need) return Promise.resolve(blob);
  return createImageBitmap(blob).then(function(bmp){
    var c = render(bmp, S, Q); if(bmp.close) bmp.close();
    return toBlob(c, Q.q || 0.92);
  });
}
window.__jmsCS = {get:function(){ return S; }, process:process, render:render, open:open, summary:summary};

function summary(){
  if(!S.on) return "Désactivé";
  var a = []; if(S.frame_on) a.push("cadre"); if(S.sig_on) a.push(S.sig_kind === "text" ? "texte «"+S.sig_text+"»" : S.sig_kind === "full" ? "signature complète" : "initiales");
  return "Activé : " + (a.join(" + ") || "rien");
}

/* ---------- interface ---------- */
var ov = document.createElement("div"); ov.id = "jmsCS"; ov.className = "jmsOvl";
ov.innerHTML = '<div class="csBox"><div class="csHead"><div class="jmsTitle">🖼️ CADRE + SIGNATURE</div><canvas id="csPrev"></canvas><div id="csMsg" class="csMsg"></div></div><div id="csBody"></div></div>';
document.body.appendChild(ov);
var prevBmp = null, tmr = null, onClose = null;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function row(label, html){ return '<label class="csL">'+label+'</label>'+html; }
function rng(k, min, max, step, unit){ return '<input class="csR" type="range" data-k="'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+S[k]+'"><span class="csV" id="v_'+k+'">'+S[k]+(unit||"")+'</span>'; }
function sizeKey(){ return "size_" + (S.sig_kind === "full" ? "full" : S.sig_kind === "text" ? "text" : "initials"); }
function body(){
  var h = '';
  h += '<button class="csMaster '+(S.on?"on":"")+'" data-a="master">'+(S.on ? "✅ CADRE + SIGNATURE ACTIVÉ" : "⛔ DÉSACTIVÉ — touche pour activer")+'</button>';
  h += '<div class="csSec c1">🎨 STYLES PRÊTS</div><div class="csGrid4">'+Object.keys(PRESETS).map(function(k){ return '<button class="csP" data-a="preset" data-p="'+k+'"><span>'+PRESETS[k].ico+'</span>'+PRESETS[k].label+'</button>'; }).join("")+'</div>';
  h += '<div class="csSec c2">🖼️ CADRE</div>'+
    '<label class="csC"><input type="checkbox" data-k="frame_on" '+(S.frame_on?"checked":"")+'> Ajouter un cadre</label>'+
    row("Style", '<select class="csS" data-k="frame_style"><option value="classic">Classique (noir / filet blanc)</option><option value="white">Blanc (filet noir)</option><option value="custom">Personnalisé (3 couleurs)</option></select>')+
    (S.frame_style === "custom" ? row("Couleurs : extérieur • filet • intérieur", '<div class="csCols"><input type="color" data-k="frame_outer" value="'+S.frame_outer+'"><input type="color" data-k="frame_line" value="'+S.frame_line+'"><input type="color" data-k="frame_inner" value="'+S.frame_inner+'"></div>') : "")+
    row("Épaisseur", rng("frame_thick",30,300,5," %"));
  h += '<div class="csSec c3">✍️ SIGNATURE</div>'+
    '<label class="csC"><input type="checkbox" data-k="sig_on" '+(S.sig_on?"checked":"")+'> Ajouter une signature</label>'+
    row("Type", '<select class="csS" data-k="sig_kind"><option value="initials">Initiales JM</option><option value="full">Signature complète JM.Dargere</option><option value="text">Texte libre</option></select>')+
    (S.sig_kind === "text" ? row("Texte", '<input class="csT" type="text" data-k="sig_text" value="'+esc(S.sig_text)+'">')+row("Police", '<select class="csS" data-k="sig_font">'+FONTS.map(function(f){ return '<option value="'+f[0]+'"'+(S.sig_font===f[0]?" selected":"")+'>'+f[1]+'</option>'; }).join("")+'</select>') : "")+
    row("Couleur", '<label class="csC"><input type="checkbox" data-k="sig_color_auto" '+(S.sig_color_auto?"checked":"")+'> Automatique (blanc / gris / noir selon la photo)</label>'+
      '<div class="csSw">'+SW.map(function(c){ return '<span data-a="sw" data-c="'+c+'" style="background:'+c+'" class="'+(!S.sig_color_auto && S.sig_color.toLowerCase()===c?"on":"")+'"></span>'; }).join("")+'<input type="color" data-k="sig_color" value="'+S.sig_color+'"></div>')+
    row("Transparence (opacité)", rng("sig_opacity",10,100,5," %"))+
    '<label class="csC"><input type="checkbox" data-k="sig_shadow" '+(S.sig_shadow?"checked":"")+'> Ombre portée</label>'+
    row("Position", '<div class="csPos">'+[["auto","AUTO"],["tl","↖"],["tc","⬆"],["tr","↗"],["bl","↙"],["bc","⬇"],["br","↘"]].map(function(p){ return '<button data-a="pos" data-p="'+p[0]+'" class="'+(S.sig_pos===p[0]?"on":"")+'">'+p[1]+'</button>'; }).join("")+'</div>')+
    row("Taille (% du petit côté de la photo)", rng(sizeKey(),1,50,0.5," %"))+
    row("Distance au bord", rng("sig_margin",-1.5,4,0.05," %"));
  h += '<button class="jmsBtn go" data-a="ok">✔ VALIDER</button>';
  $("csBody").innerHTML = h;
  var sel = $("csBody").querySelectorAll("select[data-k]"); Array.prototype.forEach.call(sel, function(s){ s.value = S[s.dataset.k]; });
}
function msg(t){ $("csMsg").textContent = t || ""; }
function draw(){
  clearTimeout(tmr);
  tmr = setTimeout(function(){
    if(!prevBmp){ msg("Aucune photo pour l'aperçu : choisis une image."); return; }
    var P = Object.assign({}, S, {on:true}), c = render(prevBmp, P, null), cv = $("csPrev");
    var k = Math.min(1, 360/c.width, 260/c.height); cv.width = Math.round(c.width*k); cv.height = Math.round(c.height*k);
    var x = cv.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(c,0,0,cv.width,cv.height);
    msg(S.on ? "" : "Aperçu — pense à ACTIVER pour l'appliquer au lot.");
  }, 90);
}
ov.addEventListener("input", function(e){
  var t = e.target, k = t.dataset && t.dataset.k; if(!k) return;
  var v = t.type === "checkbox" ? t.checked : (t.type === "range" ? parseFloat(t.value) : t.value);
  S[k] = v; save(); var lab = $("v_"+k); if(lab) lab.textContent = v + (lab.textContent.indexOf("%") > -1 ? " %" : ""); draw();
});
ov.addEventListener("change", function(e){ var k = e.target.dataset && e.target.dataset.k; if(k === "frame_style" || k === "sig_kind" || k === "sig_color_auto") { body(); draw(); } });
ov.addEventListener("click", function(e){
  var b = e.target.closest("[data-a]"); if(!b) return; var a = b.dataset.a;
  if(a === "master"){ S.on = !S.on; save(); body(); draw(); }
  else if(a === "preset"){ var p = PRESETS[b.dataset.p].v; for(var k in p) S[k] = p[k]; S.on = true; save(); body(); draw(); }
  else if(a === "sw"){ S.sig_color = b.dataset.c; S.sig_color_auto = false; save(); body(); draw(); }
  else if(a === "pos"){ S.sig_pos = b.dataset.p; save(); body(); draw(); }
  else if(a === "ok"){ ov.classList.remove("show"); if(onClose) onClose(); }
});
function open(file, cb){
  onClose = cb || null; body(); ov.classList.add("show"); $("csBody").scrollTop = 0;
  if(file){ createImageBitmap(file).then(function(b){
    var k = Math.min(1, 900/Math.max(b.width,b.height)), c = document.createElement("canvas"); c.width = Math.round(b.width*k); c.height = Math.round(b.height*k);
    c.getContext("2d").drawImage(b,0,0,c.width,c.height); prevBmp = c; draw();
  }).catch(function(){ msg("Aperçu impossible pour cette image."); }); }
  else {
    var cv = document.querySelector(".fixed-top canvas");
    if(cv && cv.width > 10){ var src = window.__jmsCrop ? window.__jmsCrop(cv) : cv, c2 = document.createElement("canvas"); c2.width = src.width; c2.height = src.height; c2.getContext("2d").drawImage(src,0,0); prevBmp = c2; }
    draw();
  }
}
})();
