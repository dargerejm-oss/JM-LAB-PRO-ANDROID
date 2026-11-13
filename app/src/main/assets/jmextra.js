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

/* ---------- avant / apres ---------- */
var lastFile = null;
document.addEventListener("change", function(e){ var t = e.target; if(t && t.type === "file" && !t.multiple && t.files && t.files[0] && /^image/.test(t.files[0].type)) lastFile = t.files[0]; }, true);
window.__jmsX.x_ba = function(){
  var cv = document.querySelector(".fixed-top canvas");
  if(!lastFile || !cv || cv.width < 10){ alert("Choisis d'abord une image (onglet RÉGLAGES)."); return; }
  var url = URL.createObjectURL(lastFile), after = cv.toDataURL("image/jpeg", 0.9);
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
