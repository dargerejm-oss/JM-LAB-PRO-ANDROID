/* JM LAB PRO - hub STYLES : import / export de styles (fichier, code texte, QR) + lecture QR Snapseed */
(function(){
"use strict";
var NAT = window.JMNative || null, KEY = "jmlab_custom_presets_v1";
var LABELS = ["Dosage","Exposition","Contraste","Temperature","Teinte","Hautes SANS GRIS","Ombres","Vibrance","Saturation","Clarte","Noir","Blanc","Dehaze","Vignette"];
var MAP = {Expo:"Exposition",Contrast:"Contraste",Temp:"Temperature",Tint:"Teinte",High:"Hautes SANS GRIS",Shadow:"Ombres",Vibr:"Vibrance",Sat:"Saturation",Clarity:"Clarte",Black:"Noir",White:"Blanc",Dehaze:"Dehaze",Vign:"Vignette",Dose:"Dosage"};
var RMAP = {}; Object.keys(MAP).forEach(function(k){ RMAP[MAP[k]] = k; });
var RANGE = {"Exposition":[-5,5],"Hautes SANS GRIS":[-100,0],"Ombres":[0,100],"Dosage":[0,100]};

function load(){ try{ return JSON.parse(localStorage.getItem(KEY)||"[]"); }catch(e){ return []; } }
function store(l){ localStorage.setItem(KEY, JSON.stringify(l)); }
function esc(s){ return String(s).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]}); }
function stamp(){ var d=new Date(); return d.getFullYear()+("0"+(d.getMonth()+1)).slice(-2)+("0"+d.getDate()).slice(-2)+"_"+("0"+d.getHours()).slice(-2)+("0"+d.getMinutes()).slice(-2); }

function toCode(p){
  var s = "JMLAB_PRESET:" + String(p.name||"style").replace(/\s+/g,"_");
  LABELS.forEach(function(l){ if(p.values && p.values[l] !== undefined && RMAP[l]) s += " "+RMAP[l]+":"+p.values[l]; });
  return s;
}
function parseText(text){
  var out = [], un = [];
  text.split(/(?=JMLAB_PRESET:)/).forEach(function(chunk){
    var nm = chunk.match(/JMLAB_PRESET:(\S+)/); if(!nm) return;
    var vals = {}, re = /([A-Za-z]+):([+-]?\d+(?:\.\d+)?)/g, m;
    while((m = re.exec(chunk))){
      var lab = MAP[m[1]];
      if(!lab){ if(m[1] !== "JMLAB_PRESET" && un.indexOf(m[1])<0) un.push(m[1]); continue; }
      var n = parseFloat(m[2]), r = RANGE[lab] || [-100,100]; vals[lab] = Math.max(r[0], Math.min(r[1], n));
    }
    if(Object.keys(vals).length) out.push({name:nm[1].replace(/_/g," "), values:vals, date:new Date().toISOString()});
  });
  return {presets:out, unmapped:un};
}
function parseAny(text){
  text = String(text||"").trim();
  try{
    var j = JSON.parse(text);
    if(j && j.jmlabPreset && Array.isArray(j.presets)) return {presets:j.presets, unmapped:[]};
    if(Array.isArray(j) && j.length && j[0].values) return {presets:j, unmapped:[]};
  }catch(e){}
  return parseText(text);
}
function addPresets(arr){
  var l = load(); arr.forEach(function(p){ l.push(p); }); store(l);
}

/* ---------- interface ---------- */
var hub = document.createElement("div"); hub.id = "jmsHub";
hub.innerHTML = '<div id="jmsHubBox"></div>';
document.body.appendChild(hub);
var box = hub.firstChild;
var fileIn = document.createElement("input"); fileIn.type = "file"; fileIn.style.display = "none"; document.body.appendChild(fileIn);
hub.addEventListener("click", function(e){ if(e.target === hub) hub.classList.remove("show"); });

function note(t){ alert(t); }
function menu(){
  var n = load().length;
  box.innerHTML = '<h2>🎨 MES STYLES</h2><div class="sub">'+n+' style(s) enregistré(s) • import / export de toutes les façons</div>'+
  '<button class="hubB b1" data-a="presets"><span class="i">🎛️</span><span>MES PRESETS & QR<small>Voir, appliquer, scanner ou créer un QR</small></span></button>'+
  '<button class="hubB b2" data-a="exportf"><span class="i">📤</span><span>EXPORTER UN FICHIER<small>Tous mes styles → dossier Téléchargements/JM LAB PRO</small></span></button>'+
  '<button class="hubB b3" data-a="importf"><span class="i">📥</span><span>IMPORTER UN FICHIER<small>Fichier .json / .txt de styles</small></span></button>'+
  '<button class="hubB b4" data-a="code"><span class="i">🔗</span><span>CODE TEXTE<small>Copier, partager (WhatsApp…) ou coller un code</small></span></button>'+
  '<button class="hubB b5" data-a="qrimg"><span class="i">🖼️</span><span>QR EN IMAGE<small>Un style → QR enregistré dans la galerie</small></span></button>'+
  '<button class="hubB b1" data-a="cs"><span class="i">🖼️</span><span>CADRE + SIGNATURE<small>Cadre, initiales / signature, texte, couleurs</small></span></button>'+
  '<button class="hubB b4" data-a="compare"><span class="i">🎞️</span><span>COMPARER LES PROFILS<small>Ta photo avec chaque profil Fuji, côte à côte</small></span></button>'+
  '<button class="hubB b6" data-a="learn"><span class="i">🟡</span><span>APPRENDRE UN STYLE SNAPSEED<small>Photo avant + photo retouchée → réglages</small></span></button>'+
  '<button class="hubB b1" data-a="x_fx"><span class="i">✨</span><span>EFFETS & RETOUCHE LOCALE<small>Ciel, visage, dégradé, grain, N&B, redressement, pinceau</small></span></button>'+
  '<button class="hubB b2" data-a="x_dup"><span class="i">📂</span><span>STYLE → PLUSIEURS DOSSIERS<small>Associer un style à plusieurs noms de dossier d\'un coup</small></span></button>'+
  '<button class="hubB b2" data-a="x_int"><span class="i">🎚️</span><span>INTENSITÉ & MÉLANGE<small>Un style à 60 %, ou 2 styles mélangés</small></span></button>'+
  '<button class="hubB b3" data-a="x_ba"><span class="i">↔️</span><span>AVANT / APRÈS<small>Curseur glissant sur ta photo</small></span></button>'+
  '<button class="hubB b5" data-a="x_ref"><span class="i">🎯</span><span>STYLE DEPUIS UNE RÉFÉRENCE<small>Une photo dont tu aimes le rendu</small></span></button>'+
  '<button class="hubB b1" data-a="x_qrm"><span class="i">🔳</span><span>QR DE PLUSIEURS STYLES<small>Un ou plusieurs QR pour tout transférer</small></span></button>'+
  '<button class="hubB b4" data-a="x_bak"><span class="i">💾</span><span>SAUVEGARDE AUTO DES STYLES<small id="bakSt"></small></span></button>'+
  '<button class="hubB b2" data-a="x_fav"><span class="i">⭐</span><span>MES FAVORIS<small>Tes styles préférés en boutons dans RÉGLAGES</small></span></button>'+
  '<button class="hubB b3" data-a="x_hist"><span class="i">🕘</span><span>HISTORIQUE DES LOTS<small>Tes derniers lots, dossiers et styles</small></span></button>'+
  '<button class="hubB b5" data-a="x_auto"><span class="i">✨</span><span>AUTO : CORRIGER LA LUMIÈRE<small>Exposition / contraste adaptés à ta photo</small></span></button>'+
  '<button class="hubB b4" data-a="x_course"><span class="i">🎓</span><span>MODE COURS (on / off)<small>Affiche en grand le réglage que tu bouges</small></span></button>'+
  '<button class="hubB b6" data-a="snap"><span class="i">🔳</span><span>LIRE UN QR SNAPSEED<small>Depuis une capture d\'écran du QR</small></span></button>'+
  '<button class="hubClose" data-a="close">FERMER</button>';
}
function sub(title, html){
  box.innerHTML = '<h2>'+title+'</h2>'+html+'<button class="hubClose" data-a="menu">← RETOUR</button>';
}
function open(){ menu(); hub.classList.add("show"); }
window.__jmsHub = open;

box.addEventListener("click", function(e){
  var b = e.target.closest("[data-a]"); if(!b) return;
  var a = b.dataset.a;
  if(a === "close") hub.classList.remove("show");
  else if(a === "menu") menu();
  else if(a === "cs"){ hub.classList.remove("show"); window.__jmsCS.open(null); }
  else if(a.indexOf("x_") === 0 && window.__jmsX && window.__jmsX[a]){ hub.classList.remove("show"); window.__jmsX[a](); }
  else if(a === "compare"){ hub.classList.remove("show"); window.__jmsCompare(); }
  else if(a === "learn"){ hub.classList.remove("show"); window.__jmsLearn(); }
  else if(a === "presets"){ hub.classList.remove("show"); var f = document.querySelector(".jmp-fab"); if(f) f.click(); }
  else if(a === "exportf") doExport();
  else if(a === "importf"){ fileIn.accept = "*/*"; fileIn.onchange = readFile; fileIn.value = ""; fileIn.click(); }
  else if(a === "code") codeScreen();
  else if(a === "qrimg") qrScreen();
  else if(a === "snap"){ fileIn.accept = "image/*"; fileIn.onchange = readSnap; fileIn.value = ""; fileIn.click(); }
  else if(a === "copy"){ var t = document.getElementById("hubTa"); try{ navigator.clipboard.writeText(t.value); }catch(x){ t.select(); document.execCommand("copy"); } note("Code copié."); }
  else if(a === "share"){ var t2 = document.getElementById("hubTa").value; if(NAT) NAT.shareText(t2); else note(t2); }
  else if(a === "doimport"){ var r = parseAny(document.getElementById("hubTa").value); if(!r.presets.length) return note("Aucun style reconnu dans ce texte."); addPresets(r.presets); note(r.presets.length+" style(s) importé(s) ✔"+(r.unmapped.length?"\nIgnorés (pas de réglage équivalent) : "+r.unmapped.join(", "):"")); menu(); }
  else if(a === "qr"){ drawQR(+b.dataset.i); }
  else if(a === "qrsnap"){ var pp = load()[+b.dataset.i]; window.__jmsSnap.encode(pp.values, pp.name).then(function(u){
      sub("🟡 QR POUR SNAPSEED", '<canvas id="hubQR" style="display:block;margin:10px auto;background:#fff;border-radius:12px;padding:10px"></canvas><div class="sub">Réglages de base (exposition, contraste, saturation, ambiance, ombres, hautes lumières, chaleur). Le vignettage n\'est pas inclus.</div><button class="hubB b3" data-a="qrsave"><span class="i">💾</span><span>ENREGISTRER DANS LA GALERIE</span></button>');
      if(window.QRCode && window.QRCode.toCanvas) window.QRCode.toCanvas(document.getElementById("hubQR"), u, {width:320, margin:2, errorCorrectionLevel:"L"}); }); }
  else if(a === "qrsave"){ var c = document.getElementById("hubQR"); c.toBlob(function(bl){ window.__jmsSave("JMLAB_QR_"+stamp()+".png", bl); }, "image/png"); }
  else if(a === "snapcopy"){ try{ navigator.clipboard.writeText(document.getElementById("hubRaw").textContent); }catch(x){} note("Contenu copié."); }
});

function doExport(){
  var l = load(); if(!l.length) return note("Aucun style à exporter pour l'instant.");
  var bl = new Blob([JSON.stringify({jmlabPreset:true, presets:l}, null, 1)], {type:"application/json"});
  window.__jmsSave("JMLAB_styles_"+stamp()+".json", bl);
}
function readFile(){
  var f = fileIn.files[0]; if(!f) return;
  var r = new FileReader(); r.onload = function(){
    var p = parseAny(r.result);
    if(!p.presets.length) return note("Ce fichier ne contient aucun style reconnu.");
    addPresets(p.presets); note(p.presets.length+" style(s) importé(s) ✔"); menu();
  }; r.readAsText(f);
}
function codeScreen(){
  var txt = load().map(toCode).join("\n");
  sub("🔗 CODE TEXTE",
   '<div class="sub">Colle ici un code pour l\'importer, ou copie / partage celui-ci.</div>'+
   '<textarea id="hubTa" class="hubTa">'+esc(txt)+'</textarea>'+
   '<button class="hubB b2" data-a="copy"><span class="i">📋</span><span>COPIER</span></button>'+
   '<button class="hubB b4" data-a="share"><span class="i">📨</span><span>PARTAGER</span></button>'+
   '<button class="hubB b3" data-a="doimport"><span class="i">📥</span><span>IMPORTER CE TEXTE</span></button>');
}
function qrScreen(){
  var l = load();
  if(!l.length) return note("Aucun style enregistré. Crée d'abord un preset (onglet RÉGLAGES, puis MES PRESETS).");
  sub("🖼️ QR EN IMAGE", '<div class="sub">Choisis le style à mettre en QR.</div>'+
    l.map(function(p,i){ return '<button class="hubB b5" data-a="qr" data-i="'+i+'"><span class="i">🎞️</span><span>'+esc(p.name)+'</span></button>'; }).join(""));
}
function drawQR(i){
  var p = load()[i]; if(!p) return;
  var code = toCode(p);
  sub("🖼️ "+esc(p.name), '<canvas id="hubQR" style="display:block;margin:10px auto;background:#fff;border-radius:12px;padding:10px"></canvas>'+
    '<div class="hubOut">'+esc(code)+'</div>'+
    '<button class="hubB b6" data-a="qrsnap" data-i="'+i+'"><span class="i">🟡</span><span>QR POUR SNAPSEED<small>Créer le code que Snapseed sait lire</small></span></button>'+
    '<button class="hubB b3" data-a="qrsave"><span class="i">💾</span><span>ENREGISTRER DANS LA GALERIE</span></button>');
  if(window.QRCode && window.QRCode.toCanvas) window.QRCode.toCanvas(document.getElementById("hubQR"), code, {width:300, margin:2});
  else note("Le composant QR n'est pas chargé.");
}

/* ---------- lecture d'un QR Snapseed ---------- */
function readSnap(){
  var f = fileIn.files[0]; if(!f) return;
  var img = new Image(), url = URL.createObjectURL(f);
  img.onload = function(){
    var k = Math.min(1, 1600/Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    var x = c.getContext("2d"); x.drawImage(img,0,0,c.width,c.height);
    var d = x.getImageData(0,0,c.width,c.height), res = window.jsQR && window.jsQR(d.data,c.width,c.height,{inversionAttempts:"attemptBoth"});
    URL.revokeObjectURL(url);
    if(res && /JMLAB_PRESET:/.test(res.data||"")){
      var rr = parseAny(res.data); if(rr.presets.length){ addPresets(rr.presets); return note(rr.presets.length+" style(s) lu(s) dans le QR et importé(s) ✔"); }
    }
    if(!res) return sub("🟡 SNAPSEED", '<div class="hubOut">Aucun QR trouvé dans cette image. Recadre la capture sur le QR (fond bien visible) et réessaie.</div>');
    analyse(res);
  };
  img.src = url;
}
function hex(b,n){ return Array.prototype.slice.call(b,0,n).map(function(v){return ("0"+v.toString(16)).slice(-2)}).join(" "); }
function strings(b){ var s="", out=[]; for(var i=0;i<b.length;i++){ var c=b[i]; if(c>=32&&c<127) s+=String.fromCharCode(c); else { if(s.length>=4) out.push(s); s=""; } } if(s.length>=4) out.push(s); return out; }
async function inflate(bytes, fmt){
  try{ var ds = new DecompressionStream(fmt), w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }catch(e){ return null; }
}
async function analyse(res){
  var text = res.data, bytes = new Uint8Array(res.binaryData || []);
  if(/^https?:\/\/snapseed\.com\/qr\?/i.test(text) && window.__jmsSnap){
    try{
      var sr = await window.__jmsSnap.decode(text);
      if(Object.keys(sr.values).length){
        addPresets([{name:sr.name, values:sr.values, date:new Date().toISOString()}]);
        var lst = Object.keys(sr.values).map(function(k){ return k+" "+sr.values[k]; }).join(" • ");
        return sub("🟡 STYLE SNAPSEED IMPORTÉ ✔", '<div class="sub"><b>'+esc(sr.name)+'</b> est dans MES PRESETS.</div><div class="hubOut">'+esc(lst)+(sr.ignored.length?"\n\nFiltres Snapseed sans équivalent ici (ignorés) : "+sr.ignored.length+" (n° "+sr.ignored.join(", ")+")":"")+'</div><div class="sub">Conversion approchée : compare avec ta photo et ajuste si besoin.</div>');
      }
    }catch(e){ note("QR Snapseed reconnu mais illisible : "+e.message); }
  }
  var imp = parseAny(text);
  if(imp.presets.length){ addPresets(imp.presets); return note(imp.presets.length+" style(s) JM LAB importé(s) ✔"); }
  var rep = "Longueur : "+bytes.length+" octets\n";
  if(/^https?:\/\//i.test(text)) rep += "Type : lien web\n";
  rep += "Début (hex) : "+hex(bytes,24)+"\n";
  var st = strings(bytes); if(st.length) rep += "Textes lisibles : "+st.slice(0,12).join(" | ")+"\n";
  var b64 = null;
  if(/^[A-Za-z0-9+\/_=-]{16,}$/.test(text.trim())){ try{ var t=text.trim().replace(/-/g,"+").replace(/_/g,"/"); var bin=atob(t); b64=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) b64[i]=bin.charCodeAt(i); rep += "Base64 : "+b64.length+" octets décodés, début "+hex(b64,16)+"\n"; }catch(e){} }
  var base = b64 || bytes, fm = ["deflate","deflate-raw","gzip"];
  for(var q=0;q<fm.length;q++){ var u = await inflate(base, fm[q]); if(u && u.length){ rep += "Décompressé ("+fm[q]+") : "+u.length+" octets, début "+hex(u,24)+"\n"; var s2 = strings(u); if(s2.length) rep += "Textes dans les données : "+s2.slice(0,20).join(" | ")+"\n"; break; } }
  var raws; try{ raws = JSON.parse(localStorage.getItem("jms_snapseed_raw")||"[]"); }catch(e){ raws=[]; }
  raws.push({date:new Date().toISOString(), text:text}); localStorage.setItem("jms_snapseed_raw", JSON.stringify(raws.slice(-20)));
  sub("🟡 QR SNAPSEED lu", '<div class="sub">Le QR est bien lu, mais ce n\'est pas un code JM LAB : le format Snapseed n\'est pas public. Contenu brut ci-dessous, gardé dans l\'appli.</div>'+
    '<div class="hubOut" id="hubRaw">'+esc(rep+"\n--- contenu ---\n"+text)+'</div>'+
    '<button class="hubB b2" data-a="snapcopy"><span class="i">📋</span><span>COPIER CE CONTENU<small>pour me l\'envoyer</small></span></button>');
}
})();
