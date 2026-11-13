/* JM LAB PRO - intensite/melange, avant-apres, QR multi-styles, style par dossier, sauvegarde auto */
(function(){
"use strict";
var NAT = window.JMNative || null, KEY = "jmlab_custom_presets_v1", FM = "jms_foldermap";
var LABELS = ["Dosage","Exposition","Contraste","Temperature","Teinte","Hautes SANS GRIS","Ombres","Vibrance","Saturation","Clarte","Noir","Blanc","Dehaze","Vignette"];
var RMAP = {"Exposition":"Expo","Contraste":"Contrast","Temperature":"Temp","Teinte":"Tint","Hautes SANS GRIS":"High","Ombres":"Shadow","Vibrance":"Vibr","Saturation":"Sat","Clarte":"Clarity","Noir":"Black","Blanc":"White","Dehaze":"Dehaze","Vignette":"Vign","Dosage":"Dose"};
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||"[]"); }catch(e){ return []; } }
function store(l){ localStorage.setItem(KEY, JSON.stringify(l)); }
function sliders(){ var c = document.querySelector(".space-y-3.mb-4"); return c ? Array.prototype.slice.call(c.querySelectorAll('input[type="range"]')) : []; }
function setVal(input, v){ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, String(v)); input.dispatchEvent(new Event("input", {bubbles:true})); }
function def(i){ return i === 0 ? 50 : 0; }
function toCode(p){ var s = "JMLAB_PRESET:" + String(p.name||"style").replace(/\s+/g,"_"); LABELS.forEach(function(l){ if(p.values && p.values[l] !== undefined) s += " "+RMAP[l]+":"+p.values[l]; }); return s; }
function mixValues(A, B, r, k){
  var out = {};
  LABELS.forEach(function(l,i){
    var d = def(i), va = A && A[l] !== undefined ? A[l] : d, vb = B && B[l] !== undefined ? B[l] : d;
    var m = B ? va*r + vb*(1-r) : va, v = d + (m - d)*k;
    v = Math.round(v*10)/10; if(Math.abs(v - d) > 0.05 || i === 0 && v !== 50) out[l] = v;
  });
  return out;
}
function applyValues(vals){
  var sl = sliders();
  sl.forEach(function(r,i){
    var v = vals[LABELS[i]] !== undefined ? vals[LABELS[i]] : def(i), mn = +r.min, mx = +r.max, st = +r.step || 1;
    v = Math.max(mn, Math.min(mx, Math.round(v/st)*st)); setVal(r, v);
  });
}
function goTab(k){ var b = document.querySelector("#jmsTabs .t-"+k); if(b) b.click(); }

/* ---------- ecran generique ---------- */
var ov = document.createElement("div"); ov.id = "jmsX"; ov.className = "jmsOvl"; ov.style.zIndex = 3350;
ov.innerHTML = '<div class="jmsBoxG" id="jxBox"></div>'; document.body.appendChild(ov);
var bx = $("jxBox"), H = {};
function show(h){ bx.innerHTML = h; ov.classList.add("show"); }
function hide(){ ov.classList.remove("show"); }
ov.addEventListener("click", function(e){ var b = e.target.closest("[data-x]"); if(b && H[b.dataset.x]) H[b.dataset.x](b, e); });
window.__jmsBack2 = function(){ if(ov.classList.contains("show")){ hide(); return true; } return false; };
H.close = hide;
function opts(l, none){ return (none ? '<option value="">'+none+'</option>' : '') + l.map(function(p,i){ return '<option value="'+i+'">'+esc(p.name)+'</option>'; }).join(""); }

window.__jmsX = window.__jmsX || {};

/* ---------- intensite & melange ---------- */
window.__jmsX.x_int = function(){
  var l = load(); if(!l.length){ alert("Aucun style enregistré. Crée d'abord un preset (RÉGLAGES → MES PRESETS) ou apprends-en un."); return; }
  show('<div class="jmsTitle">🎚️ INTENSITÉ & MÉLANGE</div>'+
   '<label class="gL">Style A</label><select class="gIn" id="jxA">'+opts(l)+'</select>'+
   '<label class="gL">Style B (pour mélanger — facultatif)</label><select class="gIn" id="jxB">'+opts(l,"— aucun —")+'</select>'+
   '<label class="gL">Part du style A : <b id="jxRv">100</b> %</label><input type="range" id="jxR" min="0" max="100" value="100" style="width:100%">'+
   '<label class="gL">Intensité : <b id="jxKv">100</b> %</label><input type="range" id="jxK" min="0" max="150" value="100" style="width:100%">'+
   '<div class="jtSub" id="jxTxt"></div>'+
   '<button class="jmsBtn go" data-x="xsave">💾 ENREGISTRER COMME NOUVEAU STYLE</button>'+
   '<button class="jmsBtn close" data-x="close">FERMER</button>');
  function cur(){
    var a = l[+$("jxA").value], bi = $("jxB").value, b = bi === "" ? null : l[+bi], r = $("jxR").value/100, k = $("jxK").value/100;
    $("jxRv").textContent = Math.round(r*100); $("jxKv").textContent = Math.round(k*100);
    return {vals:mixValues(a.values, b && b.values, r, k), a:a, b:b, r:r, k:k};
  }
  function upd(){ var c = cur(); applyValues(c.vals); $("jxTxt").textContent = Object.keys(c.vals).map(function(x){ return x+" "+c.vals[x]; }).join(" • ") || "aucun changement"; }
  ["jxA","jxB","jxR","jxK"].forEach(function(id){ $(id).oninput = upd; $(id).onchange = upd; });
  H.xsave = function(){
    var c = cur(), nm = c.a.name + (c.b ? " + " + c.b.name + " " + Math.round(c.r*100) + "/" + Math.round((1-c.r)*100) : "") + (c.k !== 1 ? " " + Math.round(c.k*100) + "%" : "");
    var ll = load(); ll.push({name:nm, values:c.vals, date:new Date().toISOString()}); store(ll); alert("Style « "+nm+" » enregistré ✔"); hide(); goTab("reg");
  };
  upd();
};

/* ---------- recadrage de l'apercu (sans les bandes sombres) ---------- */
window.__jmsCrop = function(cv){
  var W = cv.width, Hh = cv.height, d = cv.getContext("2d").getImageData(0,0,W,Hh).data, bg = [d[0],d[1],d[2]], x0 = W, x1 = -1, y0 = Hh, y1 = -1;
  for(var yy = 0; yy < Hh; yy += 2) for(var xx = 0; xx < W; xx += 2){ var i = (yy*W+xx)*4; if(Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]) > 18){ if(xx < x0) x0 = xx; if(xx > x1) x1 = xx; if(yy < y0) y0 = yy; if(yy > y1) y1 = yy; } }
  if(x1 - x0 < 20 || y1 - y0 < 20) return cv;
  var o = document.createElement("canvas"); o.width = x1-x0-1; o.height = y1-y0-1; o.getContext("2d").drawImage(cv, x0+1, y0+1, o.width, o.height, 0, 0, o.width, o.height); return o;
};

/* ---------- avant / apres ---------- */
var lastFile = null;
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple && t.files && t.files[0] && /^image/.test(t.files[0].type)) lastFile = t.files[0]; }, true);
window.__jmsX.x_ba = function(){
  var cv = document.querySelector(".fixed-top canvas");
  if(!lastFile || !cv || cv.width < 10){ alert("Choisis d'abord une image (onglet RÉGLAGES)."); return; }
  var url = URL.createObjectURL(lastFile), after = window.__jmsCrop(cv).toDataURL("image/jpeg", 0.92);
  show('<div class="jmsTitle">↔️ AVANT / APRÈS</div>'+
   '<div id="jxBA" style="position:relative;border-radius:12px;overflow:hidden;background:#000;touch-action:none"><img id="jxBefore" src="'+url+'" style="width:100%;display:block"><img src="'+after+'" id="jxAfter" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;clip-path:inset(0 0 0 50%)">'+
   '<div id="jxLine" style="position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;box-shadow:0 0 6px #000"></div>'+
   '<span style="position:absolute;left:8px;top:8px;background:#000a;color:#fff;font-weight:800;font-size:12px;padding:3px 8px;border-radius:8px">AVANT</span><span style="position:absolute;right:8px;top:8px;background:#000a;color:#fff;font-weight:800;font-size:12px;padding:3px 8px;border-radius:8px">APRÈS</span></div>'+
   '<input type="range" id="jxS" min="0" max="100" value="50" style="width:100%;margin:12px 0">'+
   '<button class="jmsBtn close" data-x="xcl">FERMER</button>');
  $("jxS").oninput = function(){ var v = $("jxS").value; $("jxAfter").style.clipPath = "inset(0 0 0 "+v+"%)"; $("jxLine").style.left = v+"%"; };
  H.xcl = function(){ hide(); URL.revokeObjectURL(url); };
};

/* ---------- QR de plusieurs styles ---------- */
window.__jmsX.x_qrm = function(){
  var l = load(); if(!l.length){ alert("Aucun style enregistré."); return; }
  show('<div class="jmsTitle">🔳 QR DE PLUSIEURS STYLES</div><div class="jtSub">Coche les styles. S\'il y en a beaucoup, l\'appli fait plusieurs QR (à lire un par un avec LIRE UN QR).</div>'+
   l.map(function(p,i){ return '<label class="jxCk"><input type="checkbox" class="jxC" value="'+i+'" checked> '+esc(p.name)+'</label>'; }).join("")+
   '<button class="jmsBtn go" data-x="xgen">▶ CRÉER LES QR</button><div id="jxQ"></div><button class="jmsBtn close" data-x="close">FERMER</button>');
  H.xgen = function(){
    var sel = Array.prototype.slice.call(document.querySelectorAll(".jxC:checked")).map(function(c){ return l[+c.value]; });
    if(!sel.length) return;
    var groups = [], cur = "";
    sel.forEach(function(p){ var c = toCode(p); if(cur && (cur.length + c.length + 1) > 1000){ groups.push(cur); cur = ""; } cur += (cur ? "\n" : "") + c; });
    if(cur) groups.push(cur);
    var out = $("jxQ"); out.innerHTML = "";
    if(!window.QRCode || !window.QRCode.toCanvas){ alert("Le composant QR n'est pas chargé."); return; }
    groups.forEach(function(g, gi){
      var c = document.createElement("canvas"); c.style.cssText = "display:block;margin:10px auto;background:#fff;border-radius:12px;padding:10px;max-width:92%";
      window.QRCode.toCanvas(c, g, {width:300, margin:2, errorCorrectionLevel:"M"});
      var b = document.createElement("button"); b.className = "jmsBtn go"; b.textContent = "💾 ENREGISTRER QR " + (gi+1) + " / " + groups.length;
      b.onclick = function(){ c.toBlob(function(bl){ window.__jmsSave("JMLAB_QR_styles_" + (gi+1) + "sur" + groups.length + ".png", bl); }, "image/png"); };
      out.appendChild(c); out.appendChild(b);
    });
  };
};

/* ---------- sauvegarde auto des styles ---------- */
function bakOn(){ return localStorage.getItem("jms_autobak") !== "off"; }
function doBackup(force){
  var l = load(); if(!l.length || !window.__jmsSaveQ) return false;
  var txt = JSON.stringify({jmlabPreset:true, presets:l}, null, 1), h = txt.length + ":" + l.length;
  var d = new Date(), day = d.getFullYear()+("0"+(d.getMonth()+1)).slice(-2)+("0"+d.getDate()).slice(-2);
  if(!force && (localStorage.getItem("jms_bakhash") === h || localStorage.getItem("jms_bakday") === day)) return false;
  window.__jmsSaveQ("JMLAB_styles_AUTO_"+day+".json", new Blob([txt], {type:"application/json"}), "Sauvegardes");
  localStorage.setItem("jms_bakhash", h); localStorage.setItem("jms_bakday", day); return true;
}
window.__jmsX.x_bak = function(){
  show('<div class="jmsTitle">💾 SAUVEGARDE AUTO DES STYLES</div><div class="jtSub">Une copie de tous tes styles est enregistrée (Images/JM LAB PRO/Sauvegardes) au plus une fois par jour, seulement s\'ils ont changé.</div>'+
   '<button class="jmsBtn go" data-x="xtog">'+(bakOn() ? "✔ ACTIVÉE (toucher pour désactiver)" : "✖ DÉSACTIVÉE (toucher pour activer)")+'</button>'+
   '<button class="jmsBtn go" data-x="xnow">SAUVEGARDER MAINTENANT</button><button class="jmsBtn close" data-x="close">FERMER</button>');
  H.xtog = function(){ localStorage.setItem("jms_autobak", bakOn() ? "off" : "on"); window.__jmsX.x_bak(); };
  H.xnow = function(){ if(!doBackup(true)) alert("Aucun style à sauvegarder."); else hide(); };
};
setTimeout(function(){ if(bakOn()) try{ doBackup(false); }catch(e){} }, 5000);


/* ---------- un style -> plusieurs dossiers ---------- */
window.__jmsX.x_dup = function(){
  var l = load(); if(!l.length){ alert("Aucun style enregistré."); return; }
  show('<div class="jmsTitle">📂 STYLE → PLUSIEURS DOSSIERS</div><label class="gL">Style</label><select class="gIn" id="jxDS" style="width:100%">'+opts(l)+'</select>'+
   '<label class="gL">Noms de dossiers (séparés par une virgule)</label><textarea class="gIn" id="jxDN" rows="3" style="width:100%" placeholder="Portraits Pattaya, Mariage Anne, Voyage Laos"></textarea>'+
   '<button class="jmsBtn go" data-x="xdup">✔ ASSOCIER</button><button class="jmsBtn close" data-x="close">FERMER</button>');
  H.xdup = function(){ var p = l[+$("jxDS").value], names = $("jxDN").value.split(",").map(function(s){ return s.trim(); }).filter(Boolean); if(!names.length) return; var m = fmap(); names.forEach(function(n){ m[n] = p.name; }); localStorage.setItem(FM, JSON.stringify(m)); alert(names.length+" dossier(s) associé(s) au style « "+p.name+" »."); hide(); };
};

/* ---------- ouvrir une image depuis l'apercu ---------- */
var ob = document.createElement("button"); ob.id = "jxOpen"; ob.textContent = "📂 OUVRIR IMAGE"; document.body.appendChild(ob);
function openImg(){ var i = document.querySelector("input[type=file]:not([multiple])"); if(i){ i.value = ""; i.click(); } }
ob.onclick = openImg;
var sv = document.createElement("button"); sv.id = "jxSave"; sv.textContent = "💾 ENREGISTRER"; document.body.appendChild(sv);
sv.onclick = function(){ var b = Array.prototype.slice.call(document.querySelectorAll("button")).filter(function(e){ return /T[ée]l[ée]charger HD/i.test(e.textContent); })[0]; if(b) b.click(); else { window.__jmsNote("✖ Bouton introuvable : va dans l'onglet EXPORT / LOT", "err", 6000); } };
document.addEventListener("click", function(e){
  var f = document.querySelector(".fixed-top"); if(!f || !f.contains(e.target)) return;
  var c = document.getElementById("filteredCanvas"); if(c && c.style.display !== "none") return;
  openImg();
}, true);
setInterval(function(){
  var f = document.querySelector(".fixed-top"), r = f && f.getBoundingClientRect(), c = document.getElementById("filteredCanvas"), has = c && c.style.display !== "none";
  ob.style.display = (r && r.height > 60 && !document.querySelector(".jmsOvl.show, #jmsOv.show, #jmsHub.show")) ? "block" : "none";
  if(r){ ob.style.top = sv.style.top = (r.top + 6) + "px"; } sv.style.display = (has && ob.style.display === "block") ? "block" : "none";
}, 400);


/* ---------- MES REGLAGES : enregistrer l'etat actuel, liste, appliquer, LUT ---------- */
function profBtns(){ return Array.prototype.slice.call(document.querySelectorAll(".scroll-content > .mt-5 button")); }
function curProfile(){ var b = profBtns().filter(function(e){ return /ffcc00/i.test(e.className) || /border-\[#ffcc00\]/.test(e.className); })[0]; return b ? (b.innerText||"").split("\n")[0].trim() : ""; }
function setProfile(n){ if(!n) return; var b = profBtns().filter(function(e){ return (e.innerText||"").split("\n")[0].trim() === n; })[0]; if(b) b.click(); }
function curValues(){ var v = {}; sliders().forEach(function(r,i){ if(+r.value !== def(i)) v[LABELS[i]] = +r.value; }); return v; }
function applyPreset(p){
  setProfile(p.profile || "");
  setTimeout(function(){ applyValues(p.values || {}); if(window.__jmsFX && p.fx){ localStorage.setItem("jms_fx", JSON.stringify(p.fx)); } }, p.profile ? 450 : 0);
}
window.__jmsX.x_mysave = function(){
  if(!document.querySelector(".fixed-top canvas") || !sliders().length){ alert("Choisis d'abord une image."); return; }
  var vals = curValues(), prof = curProfile(), fx = window.__jmsFX ? window.__jmsFX.get() : null, fxOn = window.__jmsFX && window.__jmsFX.active({single:false});
  var txt = Object.keys(vals).map(function(k){ return k+" "+vals[k]; }).join(" • ") || "aucun curseur modifié";
  show('<div class="jmsTitle">💾 ENREGISTRER MON RÉGLAGE</div><div class="jtSub"><b>Profil Fuji :</b> '+esc(prof || "aucun")+'<br><b>Curseurs :</b> '+esc(txt)+(fxOn ? '<br><b>Effets :</b> '+esc(window.__jmsFX.summary()) : "")+'</div>'+
   '<label class="gL">Nom du preset</label><input class="gIn" id="jxPN" type="text" style="width:100%" value="Mon réglage '+new Date().toLocaleDateString("fr-FR")+'">'+
   '<button class="jmsBtn go" data-x="xps">✔ ENREGISTRER LE PRESET</button>'+
   '<button class="jmsBtn go" data-x="xpl">⬇ ENREGISTRER + CRÉER UN LUT (.cube)</button>'+
   '<button class="jmsBtn close" data-x="close">ANNULER</button>');
  function doSave(){ var nm = ($("jxPN").value||"").trim() || "Mon réglage", l = load(); l.push({name:nm, values:vals, profile:prof, fx:fxOn ? fx : null, date:new Date().toISOString()}); store(l); return nm; }
  H.xps = function(){ var nm = doSave(); hide(); alert("Preset « "+nm+" » enregistré ✔\\nTu le retrouves dans MES PRESETS."); };
  H.xpl = function(){ var nm = doSave(); hide(); makeLUT(nm, true); };
};
window.__jmsX.x_mylist = function(){
  var l = load();
  show('<div class="jmsTitle">📚 MES PRESETS</div>'+(l.length ? l.map(function(p,i){
    var sub = (p.profile ? "Profil "+p.profile+" • " : "") + (Object.keys(p.values||{}).length + " curseur(s)") + (p.fx ? " • effets" : "");
    return '<div class="jxPr"><b>'+esc(p.name)+'</b><small>'+esc(sub)+'</small><div class="fxRow"><button class="jmsBtn go" data-x="pa" data-i="'+i+'">APPLIQUER</button><button class="jmsBtn close" data-x="pl" data-i="'+i+'">LUT</button><button class="jmsBtn close" data-x="pd" data-i="'+i+'">🗑</button></div></div>';
  }).join("") : '<div class="jtSub">Aucun preset. Fais tes réglages puis « ENREGISTRER MON RÉGLAGE ».</div>')+'<button class="jmsBtn close" data-x="close">FERMER</button>');
  H.pa = function(b){ var p = l[+b.dataset.i]; hide(); applyPreset(p); goTab("reg"); };
  H.pl = function(b){ var p = l[+b.dataset.i]; hide(); applyPreset(p); setTimeout(function(){ makeLUT(p.name, false); }, 900); };
  var armed = -1;
  H.pd = function(b){ var i = +b.dataset.i; if(armed !== i){ armed = i; b.textContent = "SUPPRIMER ?"; b.style.background = "#E53935"; b.style.color = "#fff"; return; } var ll = load(); ll.splice(i,1); store(ll); drawFav(); window.__jmsX.x_mylist(); };
};
/* LUT 3D (.cube) : on fait traiter une mire de couleurs par l'appli et on relit le resultat */
async function makeLUT(name, restoreImage){
  var N = 17, COLS = 70, B = 5, rows = Math.ceil(N*N*N/COLS), PR = window.__jmsProgress;
  var inp = document.querySelector("input[type=file]:not([multiple])");
  if(!inp || !window.__jmsU){ alert("Ouvre d'abord une image."); return; }
  var keepFile = lastFile, vals = sliders().map(function(r){ return r.value; }), prof = curProfile(), SPATIAL = [9,12,13];
  PR.start("🎨 CRÉATION DU LUT"); PR.set(5, "Préparation de la mire");
  var t = document.createElement("canvas"); t.width = COLS*B; t.height = rows*B; var tx = t.getContext("2d");
  tx.fillStyle = "#000"; tx.fillRect(0,0,t.width,t.height);
  for(var b = 0; b < N; b++) for(var g = 0; g < N; g++) for(var r = 0; r < N; r++){ var idx = r + N*(g + N*b); tx.fillStyle = "rgb("+Math.round(r*255/(N-1))+","+Math.round(g*255/(N-1))+","+Math.round(b*255/(N-1))+")"; tx.fillRect((idx%COLS)*B, Math.floor(idx/COLS)*B, B, B); }
  var blob = await new Promise(function(res){ t.toBlob(res, "image/png"); });
  var dt = new DataTransfer(); dt.items.add(new File([blob], "mire.png", {type:"image/png"}));
  inp.files = dt.files; inp.dispatchEvent(new Event("change", {bubbles:true}));
  PR.set(25, "Chargement de la mire"); await wait(1200);
  var sl0 = sliders(); SPATIAL.forEach(function(i){ if(sl0[i]) setVal(sl0[i], 0); });   // effets locaux : impossibles dans un LUT
  window.__jmsNoAuto = true;                                                           // exposition automatique : dépend de la photo, hors LUT
  await wait(400); window.__jmsU(); await wait(250);
  PR.set(55, "Lecture des couleurs");
  var cv = document.getElementById("filteredCanvas"), crop = window.__jmsCrop(cv), cx = crop.getContext("2d"), W = crop.width, Hh = crop.height, lines = [];
  var d = cx.getImageData(0,0,W,Hh).data;
  function px(u, v){ var X = Math.max(1, Math.min(W-2, Math.round(u*W))), Y = Math.max(1, Math.min(Hh-2, Math.round(v*Hh))), s = [0,0,0], n = 0; for(var dy = -1; dy <= 1; dy++) for(var dx = -1; dx <= 1; dx++){ var i = ((Y+dy)*W + X+dx)*4; s[0] += d[i]; s[1] += d[i+1]; s[2] += d[i+2]; n++; } return [s[0]/n/255, s[1]/n/255, s[2]/n/255]; }
  for(var b2 = 0; b2 < N; b2++) for(var g2 = 0; g2 < N; g2++) for(var r2 = 0; r2 < N; r2++){ var id2 = r2 + N*(g2 + N*b2), c = px(((id2%COLS)+0.5)/COLS, (Math.floor(id2/COLS)+0.5)/rows); lines.push(c.map(function(v){ return Math.max(0, Math.min(1, v)).toFixed(5); }).join(" ")); }
  var safe = String(name).replace(/[^A-Za-z0-9_-]+/g, "_");
  var cube = "TITLE \""+String(name).replace(/"/g,"")+"\"\n# JM LAB PRO - LUT 3D (sans exposition automatique, vignettage, clarte, dehaze)\nLUT_3D_SIZE "+N+"\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n"+lines.join("\n")+"\n";
  PR.set(85, "Remise en place de ta photo");
  window.__jmsNoAuto = false;
  if(keepFile){ var d2 = new DataTransfer(); d2.items.add(keepFile); inp.files = d2.files; inp.dispatchEvent(new Event("change", {bubbles:true})); lastFile = keepFile; await wait(900); }
  sliders().forEach(function(r,i){ setVal(r, vals[i]); }); setProfile(prof);
  window.__jmsLastCube = cube;
  await window.__jmsSaveQ("JMLAB_" + safe + ".cube", new Blob([cube], {type:"application/octet-stream"}), "LUT");
  PR.end("<b>LUT « "+esc(name)+" » créé</b> (17×17×17, format .cube).<br>Dossier : Images / JM LAB PRO / LUT<br><small>Il reprend les réglages de couleur (profil, exposition manuelle, contraste, saturation…). L'exposition automatique, le vignettage, la clarté et le dehaze ne peuvent pas être dans un LUT.</small>", false);
}
window.__jmsX.x_lut = function(){ makeLUT("Reglage actuel", true); };

/* ---------- grand texte ---------- */
function applyBig(){ document.body.style.zoom = localStorage.getItem("jms_big") === "on" ? "1.18" : ""; }
applyBig();
window.__jmsX.x_big = function(){ localStorage.setItem("jms_big", localStorage.getItem("jms_big") === "on" ? "off" : "on"); applyBig(); };

/* ---------- defi du jour ---------- */
window.__jmsX.x_defi = function(){
  var l = load(); if(!l.length){ alert("Enregistre d'abord quelques styles."); return; }
  var d = new Date(), seed = d.getFullYear()*372 + d.getMonth()*31 + d.getDate(), p = l[seed % l.length];
  applyValues(p.values); goTab("reg");
  alert("🎯 Défi du jour : applique le style « "+p.name+" » à une photo, puis améliore-le avec un seul curseur.");
};

/* ---------- fiche de cours (avant / apres + reglages) ---------- */
window.__jmsX.x_card = function(){
  var cv = document.querySelector(".fixed-top canvas");
  if(!lastFile || !cv || cv.width < 10){ alert("Choisis d'abord une image et fais tes réglages."); return; }
  var url = URL.createObjectURL(lastFile), img = new Image();
  img.onload = function(){
    var W = 1080, pad = 40, cw = (W - 3*pad)/2, ih = Math.round(cw*img.naturalHeight/img.naturalWidth), sl2 = sliders(), lines = [];
    sl2.forEach(function(r,i){ if(+r.value !== def(i)) lines.push(LABELS[i]+"  "+(+r.value > 0 && i > 0 ? "+" : "")+r.value); });
    var Hh = 170 + ih + 60 + Math.max(1, lines.length)*44 + 90, c = document.createElement("canvas"); c.width = W; c.height = Hh; var x2 = c.getContext("2d");
    x2.fillStyle = "#111"; x2.fillRect(0,0,W,Hh); x2.fillStyle = "#FFB300"; x2.font = "bold 54px sans-serif"; x2.fillText("FICHE DE RÉGLAGES", pad, 85);
    x2.fillStyle = "#bbb"; x2.font = "28px sans-serif"; x2.fillText("JM.DARGERE • JM LAB PRO", pad, 130);
    x2.drawImage(img, pad, 170, cw, ih);
    var rect = {x:0,y:0,w:cv.width,h:cv.height}, d2 = cv.getContext("2d").getImageData(0,0,cv.width,cv.height).data, bg = [d2[0],d2[1],d2[2]], x0 = cv.width, x1 = -1, y0 = cv.height, y1 = -1;
    for(var yy = 0; yy < cv.height; yy += 2) for(var xx = 0; xx < cv.width; xx += 2){ var i = (yy*cv.width+xx)*4; if(Math.abs(d2[i]-bg[0])+Math.abs(d2[i+1]-bg[1])+Math.abs(d2[i+2]-bg[2]) > 18){ if(xx < x0) x0 = xx; if(xx > x1) x1 = xx; if(yy < y0) y0 = yy; if(yy > y1) y1 = yy; } }
    if(x1 > x0) rect = {x:x0+1, y:y0+1, w:x1-x0-2, h:y1-y0-2};
    x2.drawImage(cv, rect.x, rect.y, rect.w, rect.h, 2*pad+cw, 170, cw, ih);
    x2.fillStyle = "#fff"; x2.font = "bold 30px sans-serif"; x2.fillText("AVANT", pad, 170+ih+42); x2.fillText("APRÈS", 2*pad+cw, 170+ih+42);
    x2.font = "34px sans-serif"; x2.fillStyle = "#FFB300"; var y = 170+ih+110; (lines.length ? lines : ["Aucun réglage modifié"]).forEach(function(t){ x2.fillText(t, pad, y); y += 44; });
    URL.revokeObjectURL(url);
    c.toBlob(function(b){ window.__jmsSave("JMLAB_fiche_"+Date.now()+".png", b); }, "image/png");
  };
  img.src = url;
};

/* ---------- annuler / retablir les reglages ---------- */
var hist2 = [], hpos = -1, hbusy = false, ht = 0;
function snap(){ return sliders().map(function(r){ return r.value; }); }
function rec(){ if(hbusy) return; var s = snap(); if(!s.length) return; if(hpos >= 0 && hist2[hpos].join() === s.join()) return; hist2 = hist2.slice(0, hpos+1); hist2.push(s); if(hist2.length > 60) hist2.shift(); hpos = hist2.length-1; }
document.addEventListener("input", function(e){ if(e.target && e.target.type === "range" && !hbusy){ clearTimeout(ht); ht = setTimeout(rec, 450); } }, true);
function jump(p){ if(p < 0 || p >= hist2.length) return; hpos = p; hbusy = true; var v = hist2[p]; sliders().forEach(function(r,i){ setVal(r, v[i]); }); setTimeout(function(){ hbusy = false; }, 600); }
setTimeout(function(){ rec(); }, 1500);
var ur = document.createElement("div"); ur.id = "jxUR"; ur.innerHTML = '<button id="jxU">↶</button><button id="jxR2">↷</button>'; document.body.appendChild(ur);
$("jxU").onclick = function(){ clearTimeout(ht); rec(); jump(hpos-1); }; $("jxR2").onclick = function(){ jump(hpos+1); };

/* ---------- favoris (acces direct dans RÉGLAGES) ---------- */
function favs(){ try{ return JSON.parse(localStorage.getItem("jms_fav")||"[]"); }catch(e){ return []; } }
function drawFav(){
  var c = document.querySelector(".space-y-3.mb-4"); if(!c) return;
  var w = $("jxFav"); if(!w){ w = document.createElement("div"); w.id = "jxFav"; c.parentNode.insertBefore(w, c); }
  var l = load(), f = favs().filter(function(n){ return l.some(function(p){ return p.name === n; }); });
  w.innerHTML = f.length ? '<div class="jxFavT">⭐ FAVORIS</div>' + f.map(function(n){ return '<button class="jxFavB" data-n="'+esc(n)+'">'+esc(n)+'</button>'; }).join("") : "";
}
document.addEventListener("click", function(e){ var b = e.target.closest && e.target.closest(".jxFavB"); if(!b) return; var p = load().filter(function(q){ return q.name === b.dataset.n; })[0]; if(p) applyValues(p.values); });
setTimeout(drawFav, 1200); setInterval(function(){ if(!$("jxFav")) drawFav(); }, 3000);
window.__jmsX.x_fav = function(){
  var l = load(); if(!l.length){ alert("Aucun style enregistré."); return; }
  var f = favs();
  show('<div class="jmsTitle">⭐ MES FAVORIS</div><div class="jtSub">Coche tes styles préférés : ils apparaissent en boutons dans RÉGLAGES.</div>'+
   l.map(function(p,i){ return '<label class="jxCk"><input type="checkbox" class="jxF" value="'+i+'"'+(f.indexOf(p.name) >= 0 ? " checked" : "")+'> '+esc(p.name)+'</label>'; }).join("")+
   '<button class="jmsBtn go" data-x="xfs">✔ ENREGISTRER</button><button class="jmsBtn close" data-x="close">FERMER</button>');
  H.xfs = function(){ localStorage.setItem("jms_fav", JSON.stringify(Array.prototype.slice.call(document.querySelectorAll(".jxF:checked")).map(function(c){ return l[+c.value].name; }))); drawFav(); hide(); goTab("reg"); };
};

/* ---------- historique des lots ---------- */
function hist(){ try{ return JSON.parse(localStorage.getItem("jms_hist")||"[]"); }catch(e){ return []; } }
function addHist(o){ var h = hist(); h.unshift(o); localStorage.setItem("jms_hist", JSON.stringify(h.slice(0, 30))); }
window.__jmsX.x_hist = function(){
  var h = hist();
  show('<div class="jmsTitle">🕘 HISTORIQUE DES LOTS</div>'+(h.length ? h.map(function(o){ return '<div class="jxHi"><b>'+esc(o.sub)+'</b><br><small>'+esc(o.date)+' • '+esc(o.style)+' • '+esc(o.q)+'</small></div>'; }).join("") : '<div class="jtSub">Aucun lot pour l\'instant.</div>')+
   '<button class="jmsBtn close" data-x="close">FERMER</button>');
};

/* ---------- auto : corriger la lumiere ---------- */
window.__jmsX.x_auto = function(){
  var cv = document.querySelector(".fixed-top canvas"); if(!cv || cv.width < 10){ alert("Choisis d'abord une image."); return; }
  var x = cv.getContext("2d"), W = cv.width, Hh = cv.height, d = x.getImageData(0,0,W,Hh).data, bg = [d[0],d[1],d[2]], sy = 0, sy2 = 0, n = 0, ss = 0;
  for(var i = 0; i < d.length; i += 16){ if(Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) <= 18) continue; var y = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; sy += y; sy2 += y*y; n++; var mx = Math.max(d[i],d[i+1],d[i+2]), mn = Math.min(d[i],d[i+1],d[i+2]); ss += mx ? (mx-mn)/mx : 0; }
  if(!n){ alert("Image illisible."); return; }
  var m = sy/n, sd = Math.sqrt(Math.max(0, sy2/n - m*m)), sat = ss/n, sl = sliders(), v = {};
  sl.forEach(function(r,i){ v[LABELS[i]] = +r.value; });
  v.Exposition = Math.max(-2, Math.min(2, Math.round((v.Exposition + (118 - m)/60)*10)/10));
  if(sd < 50) v.Contraste = Math.min(40, v.Contraste + 15);
  if(sat < 0.25) v.Vibrance = Math.min(40, v.Vibrance + 15);
  if(m < 80) v.Ombres = Math.min(60, v.Ombres + 25);
  applyValues(v); goTab("reg");
  alert("Correction douce appliquée : exposition "+v.Exposition+(sd < 50 ? ", contraste +15" : "")+(sat < 0.25 ? ", vibrance +15" : "")+(m < 80 ? ", ombres +25" : "")+".\nTu peux l'ajuster ou l'enregistrer comme style.");
};

/* ---------- mode cours : montre le reglage touche ---------- */
function courseOn(){ return localStorage.getItem("jms_course") === "on"; }
var cb = document.createElement("div"); cb.id = "jxCourse"; document.body.appendChild(cb); var ct = 0;
document.addEventListener("input", function(e){
  var r = e.target; if(!courseOn() || !r || r.type !== "range") return;
  var sl = sliders(), i = sl.indexOf(r); if(i < 0) return;
  cb.textContent = LABELS[i] + "  " + (+r.value > 0 && i > 0 ? "+" : "") + r.value; cb.style.display = "block"; clearTimeout(ct); ct = setTimeout(function(){ cb.style.display = "none"; }, 1800);
}, true);
window.__jmsX.x_course = function(){
  localStorage.setItem("jms_course", courseOn() ? "off" : "on");
  alert(courseOn() ? "Mode cours activé : le nom et la valeur du réglage s'affichent en grand quand tu le bouges." : "Mode cours désactivé.");
};

/* ---------- style par dossier (ecran PRET A LANCER) ---------- */
function fmap(){ try{ return JSON.parse(localStorage.getItem(FM)||"{}"); }catch(e){ return {}; } }
function inject(){
  var n = $("gName"); if(!n || $("gSty")) return;
  var l = load(); if(!l.length) return;
  var w = document.createElement("div");
  w.innerHTML = '<label class="gL">🎨 Style du dossier</label><select class="gIn" id="gSty">'+opts(l,"Mes réglages actuels")+'</select>'+
    '<label class="jxCk"><input type="checkbox" id="gMem" checked> Mémoriser ce style pour ce nom de dossier</label>';
  n.parentNode.insertBefore(w, n.nextSibling);
  function fromName(){ var m = fmap()[(n.value||"").trim()]; if(m){ for(var i = 0; i < l.length; i++) if(l[i].name === m){ $("gSty").value = String(i); return; } } }
  fromName(); n.addEventListener("input", fromName);
}
new MutationObserver(inject).observe(document.body, {childList:true, subtree:true});
var bypass = false;
document.addEventListener("click", function(e){
  var g = e.target.closest && e.target.closest("#gGo"); if(!g || bypass) return;
  var s = $("gSty");
  try{ var d0 = new Date(); addHist({sub:($("gName").value||"Lot").trim(), style:(s && s.value !== "" ? load()[+s.value].name : "réglages actuels"), q:($("gQ") ? $("gQ").options[$("gQ").selectedIndex].text.split(" ")[0] : ""), date:d0.toLocaleDateString("fr-FR")+" "+d0.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}); }catch(x){}
  if(!s || s.value === "") return;
  e.stopImmediatePropagation(); e.preventDefault();
  var p = load()[+s.value]; if(!p) return;
  applyValues(p.values);
  if($("gMem") && $("gMem").checked){ var m = fmap(); m[($("gName").value||"").trim()] = p.name; localStorage.setItem(FM, JSON.stringify(m)); }
  setTimeout(function(){ bypass = true; g.click(); bypass = false; }, 500);
}, true);
})();
