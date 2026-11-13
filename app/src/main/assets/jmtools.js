/* JM LAB PRO - comparer les profils, apprendre un style Snapseed, recevoir une image partagee */
(function(){
"use strict";
var NAT = window.JMNative || null, KEY = "jmlab_custom_presets_v1";
var LABELS = ["Dosage","Exposition","Contraste","Temperature","Teinte","Hautes SANS GRIS","Ombres","Vibrance","Saturation","Clarte","Noir","Blanc","Dehaze","Vignette"];
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function sliders(){ var c = document.querySelector(".space-y-3.mb-4"); return c ? Array.prototype.slice.call(c.querySelectorAll('input[type="range"]')) : []; }
function setVal(input, v){
  var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, String(v)); input.dispatchEvent(new Event("input", {bubbles:true}));
}
function appCanvas(){ var c = document.querySelector(".fixed-top canvas"); return (c && c.width > 10) ? c : null; }
function profileButtons(){ return Array.prototype.slice.call(document.querySelectorAll(".scroll-content > .mt-5 button")); }
function setFile(input, files){
  var dt = new DataTransfer(); files.forEach(function(f){ dt.items.add(f); });
  input.files = dt.files; input.dispatchEvent(new Event("change", {bubbles:true}));
}
function mainInput(){ return document.querySelector('input[type=file]:not([multiple])'); }
function lotInput(){ return document.querySelector('input[type=file][multiple]'); }
function goTab(k){ var b = document.querySelector("#jmsTabs .t-"+k); if(b) b.click(); }

/* ---------- ecran generique ---------- */
var box = document.createElement("div"); box.id = "jmsTools"; box.className = "jmsOvl";
box.innerHTML = '<div class="jmsBoxG" id="jtBox"></div>'; document.body.appendChild(box);
var jt = $("jtBox");
function show(html){ jt.innerHTML = html; box.classList.add("show"); }
function hideT(){ box.classList.remove("show"); }
box.addEventListener("click", function(e){ var b = e.target.closest("[data-t]"); if(b && handlers[b.dataset.t]) handlers[b.dataset.t](b); });
var handlers = {};

/* ---------- 1. comparer les profils ---------- */
window.__jmsCompare = async function(){
  var cv = appCanvas(), btns = profileButtons();
  if(!cv){ alert("Choisis d'abord une image (onglet RÉGLAGES ou EXPORT, bouton CHOISIR IMAGE)."); return; }
  if(!btns.length){ alert("Profils introuvables."); return; }
  var sl = sliders(), keep = sl.map(function(r){ return r.value; });
  window.__jmsProgress.start("🎞️ COMPARAISON DES PROFILS");
  var thumbs = [], W = 220, H = Math.max(40, Math.round(W * cv.height / cv.width));
  for(var i = 0; i < btns.length; i++){
    if(window.__jmsStop) break;
    btns[i].click(); await wait(320);
    var t = document.createElement("canvas"); t.width = W; t.height = H; t.getContext("2d").drawImage(appCanvas(), 0, 0, W, H);
    thumbs.push({n:(btns[i].innerText||"").split("\n")[0].trim(), u:t.toDataURL("image/jpeg", 0.8), i:i});
    window.__jmsProgress.set((i+1)/btns.length*100, (i+1)+" / "+btns.length+" profils");
  }
  sl.forEach(function(r,k){ setVal(r, keep[k]); });
  window.__jmsProgress.hide();
  var h = '<div class="jmsTitle">🎞️ COMPARER LES PROFILS</div><div class="jtSub">Touche un profil pour l\'appliquer.</div><div class="jtGrid">'+
    thumbs.map(function(t){ return '<button class="jtTh" data-t="pick" data-i="'+t.i+'"><img src="'+t.u+'"><span>'+esc(t.n)+'</span></button>'; }).join("")+'</div>'+
    '<button class="jmsBtn close" data-t="close">FERMER (garder mes réglages)</button>';
  show(h);
  handlers.pick = function(b){ var i = +b.dataset.i; hideT(); btns[i].click(); goTab("reg"); };
  handlers.close = hideT;
};

/* ---------- 2. apprendre un style Snapseed ---------- */
var L = {before:null, after:null, mode:"snap"};
window.__jmsLearn = function(mode){
  mode = mode === "ref" ? "ref" : "snap";
  L = {before:null, after:null, mode:mode};
  var ref = mode === "ref";
  show((ref?'<div class="jmsTitle">🎯 STYLE DEPUIS UNE PHOTO DE RÉFÉRENCE</div>'+
   '<div class="jtSub">1) Ta photo à modifier • 2) une photo dont tu aimes le <b>rendu</b> (lumière, couleurs). L\'appli cherche les réglages qui s\'en approchent.</div>'+
   '<button class="gBtn csb" data-t="pickA" id="jtA">📷 1 • MA PHOTO<small id="jtAs">à choisir</small></button>'+
   '<button class="gBtn csb" data-t="pickB" id="jtB">🎯 2 • PHOTO DE RÉFÉRENCE<small id="jtBs">à choisir</small></button>'
   :'<div class="jmsTitle">🟡 APPRENDRE UN STYLE SNAPSEED</div>'+
   '<div class="jtSub">1) La photo <b>d\'origine</b> • 2) la même photo <b>retouchée dans Snapseed</b> (même cadrage, sans recadrage). L\'appli calcule les réglages équivalents.</div>'+
   '<button class="gBtn csb" data-t="pickA" id="jtA">📷 1 • PHOTO D\'ORIGINE<small id="jtAs">à choisir</small></button>'+
   '<button class="gBtn csb" data-t="pickB" id="jtB">🟡 2 • PHOTO RETOUCHÉE SNAPSEED<small id="jtBs">à choisir</small></button>')+
   '<label class="gL">Nom du style</label><input class="gIn" id="jtName" type="text" value="'+(ref?"Référence ":"Snapseed ")+new Date().toLocaleDateString("fr-FR")+'">'+
   '<button class="jmsBtn go" data-t="learn">▶ CALCULER LE STYLE</button><button class="jmsBtn close" data-t="close">ANNULER</button>');
  var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*";
  var which = "before";
  handlers.pickA = function(){ which = "before"; fi.value = ""; fi.click(); };
  handlers.pickB = function(){ which = "after"; fi.value = ""; fi.click(); };
  fi.onchange = function(){ var f = fi.files[0]; if(!f) return; L[which] = f; $(which === "before" ? "jtAs" : "jtBs").textContent = "✔ " + f.name; $(which === "before" ? "jtA" : "jtB").classList.add("on"); };
  handlers.close = hideT; handlers.learn = learn;
};
var RECT = null;
function findRect(cv){
  var x = cv.getContext("2d"), W = cv.width, Hh = cv.height, d = x.getImageData(0, 0, W, Hh).data, bg = [d[0], d[1], d[2]];
  function diff(i){ return Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 18; }
  var x0 = W, x1 = -1, y0 = Hh, y1 = -1;
  for(var yy = 0; yy < Hh; yy += 2) for(var xx = 0; xx < W; xx += 2){ if(diff((yy*W+xx)*4)){ if(xx < x0) x0 = xx; if(xx > x1) x1 = xx; if(yy < y0) y0 = yy; if(yy > y1) y1 = yy; } }
  if(x1 < 0 || x1 - x0 < 20 || y1 - y0 < 20) return {x:0, y:0, w:W, h:Hh};
  return {x:x0+1, y:y0+1, w:x1-x0-2, h:y1-y0-2};
}
function bitmapSmall(src, w, h){ var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext("2d");
  if(src === appCanvas() && RECT) x.drawImage(src, RECT.x, RECT.y, RECT.w, RECT.h, 0, 0, w, h); else x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data; }
function dist(a, b){ var s = 0, n = a.length; for(var i = 0; i < n; i += 4){ var d0 = a[i]-b[i], d1 = a[i+1]-b[i+1], d2 = a[i+2]-b[i+2]; s += d0*d0 + d1*d1 + d2*d2; } return s / (n/4*3); }
function stats(d){
  var n = d.length/4, sr=0, sg=0, sb=0, sy=0, sy2=0, ss=0, hist = new Array(32).fill(0);
  for(var i=0;i<d.length;i+=4){ var r=d[i], g=d[i+1], b=d[i+2], y=0.299*r+0.587*g+0.114*b; sr+=r; sg+=g; sb+=b; sy+=y; sy2+=y*y; var mx=Math.max(r,g,b), mn=Math.min(r,g,b); ss+= mx ? (mx-mn)/mx*255 : 0; hist[Math.min(31,y>>3)]++; }
  var my = sy/n, acc=0, p5=0, p95=0; for(var k=0;k<32;k++){ acc+=hist[k]; if(!p5 && acc>=n*0.05) p5=k*8; if(!p95 && acc>=n*0.95) p95=k*8; }
  return [sr/n, sg/n, sb/n, my, Math.sqrt(Math.max(0,sy2/n-my*my)), ss/n, p5, p95];
}
function sdist(a,b){ var w=[1,1,1,1.5,1.5,1.5,1,1], s=0; for(var i=0;i<a.length;i++){ var d=a[i]-b[i]; s+=w[i]*d*d; } return s; }
async function learn(){
  if(!L.before || !L.after){ alert("Choisis les deux photos."); return; }
  var name = ($("jtName").value || "Style").trim(); hideT();
  window.__jmsProgress.start(L.mode === "ref" ? "🎯 STYLE DE RÉFÉRENCE" : "🟡 APPRENTISSAGE DU STYLE");
  var sl = sliders(); var def = sl.map(function(r,i){ return i === 0 ? 50 : 0; });
  sl.forEach(function(r,i){ setVal(r, def[i]); });
  setFile(mainInput(), [L.before]);
  for(var t = 0; t < 40 && !(appCanvas() && window.__jmsBeforeOk); t++){ await wait(100); if(appCanvas() && t > 6) break; }
  await wait(500);
  var cv = appCanvas(); if(!cv){ window.__jmsProgress.end("Image d'origine illisible.", true); return; }
  RECT = findRect(cv); var GW = 48, GH = Math.max(8, Math.round(48 * RECT.h / RECT.w));
  var aBmp = await createImageBitmap(L.after), ref = L.mode === "ref", target, tstat;
  if(ref){ var rw = 64, rh = Math.max(8, Math.round(64*aBmp.height/aBmp.width)); tstat = stats(bitmapSmall(aBmp, rw, rh)); }
  else target = bitmapSmall(aBmp, GW, GH);
  async function evalNow(){ await wait(90); return ref ? sdist(stats(bitmapSmall(appCanvas(), 64, Math.max(8, Math.round(64*RECT.h/RECT.w)))), tstat) : dist(bitmapSmall(appCanvas(), GW, GH), target); }
  var cur = def.slice(), best = await evalNow(), start = best;
  var order = [1,2,8,3,4,7,6,5,10,11,9,12,13], rounds = 6, total = rounds * order.length, n = 0;
  for(var rd = 0; rd < rounds && !window.__jmsStop; rd++){
    for(var oi = 0; oi < order.length && !window.__jmsStop; oi++){
      var i = order[oi], r = sl[i], mn = +r.min, mx = +r.max, stp = +r.step || 1, delta = (mx - mn) * 0.3 / Math.pow(1.7, rd);
      delta = Math.max(stp, delta);
      var improved = false, bestV = cur[i], bestE = best;
      for(var dir = -1; dir <= 1; dir += 2){
        var v = Math.max(mn, Math.min(mx, Math.round((cur[i] + dir*delta)/stp)*stp));
        if(v === cur[i]) continue;
        setVal(r, v); var e = await evalNow();
        if(e < bestE - 0.01){ bestE = e; bestV = v; improved = true; }
      }
      cur[i] = bestV; best = bestE; setVal(r, bestV);
      n++; window.__jmsProgress.set(n/total*100, "Réglage " + LABELS[i] + " • " + n + " / " + total);
      if(!improved) await wait(0);
    }
  }
  sl.forEach(function(r,i){ setVal(r, cur[i]); });
  var vals = {}; LABELS.forEach(function(l,i){ if(i > 0 && cur[i] !== 0) vals[l] = cur[i]; });
  var stopped = !!window.__jmsStop, gain = start > 0 ? Math.max(0, Math.round((1 - best/start) * 100)) : 100;
  var list = []; try{ list = JSON.parse(localStorage.getItem(KEY) || "[]"); }catch(e){}
  if(Object.keys(vals).length) list.push({name:name, values:vals, date:new Date().toISOString()});
  localStorage.setItem(KEY, JSON.stringify(list));
  var txt = Object.keys(vals).map(function(k){ return k + " " + (vals[k] > 0 ? "+" : "") + vals[k]; }).join(" • ") || "aucun changement détecté";
  window.__jmsProgress.end("<b>Style « " + esc(name) + " » enregistré</b> dans MES PRESETS<br>" + esc(txt) + "<br>Ressemblance gagnée : <b>" + gain + " %</b><br><small>Les réglages sont appliqués à l'image affichée.</small>", stopped);
  goTab("reg");
}

/* ---------- 3. image partagee depuis Snapseed / la galerie ---------- */
window.__jmsShared = async function(json){
  var list; try{ list = JSON.parse(json); }catch(e){ return; } if(!list || !list.length) return;
  var files = [];
  for(var i = 0; i < list.length; i++){
    try{ var r = await fetch(list[i].url), b = await r.blob(); files.push(new File([b], list[i].name || ("image"+i+".jpg"), {type:b.type || "image/jpeg"})); }catch(e){}
  }
  if(!files.length) return;
  if(files.length === 1){ setFile(mainInput(), files); goTab("fuji"); }
  else { goTab("exp"); setFile(lotInput(), files); }
};
window.__jmsX = window.__jmsX || {}; window.__jmsX.x_ref = function(){ window.__jmsLearn("ref"); };
if(NAT && NAT.takeShared){ setTimeout(function(){ var j = NAT.takeShared(); if(j) window.__jmsShared(j); }, 900); }
})();
