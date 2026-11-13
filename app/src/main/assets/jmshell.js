/* JM LAB PRO - habillage APK : onglets, sablier 3D, TERMINE, enregistrement galerie */
(function(){
"use strict";
var NAT = window.JMNative || null;
var $ = function(id){return document.getElementById(id)};

/* ---------- 1. onglets ---------- */
var tabs = document.createElement("div"); tabs.id = "jmsTabs";
[["reg","🎛️","RÉGLAGES"],["fuji","🎞️","PROFILS FUJI"],["exp","📤","EXPORT / LOT"],["qr","🎨","STYLES / QR"],["vis","👁️","VISIONNEUSE"]].forEach(function(t){
  var b = document.createElement("button"); b.className = "t-"+t[0]; b.dataset.k = t[0];
  b.innerHTML = '<span class="i">'+t[1]+'</span>'+t[2];
  b.onclick = function(){ go(t[0]); };
  tabs.appendChild(b);
});
document.body.appendChild(tabs);
function go(k){
  if(k === "qr"){ if(window.__jmsHub) window.__jmsHub(); return; }
  if(k === "vis"){ if(window.__jmsVis) window.__jmsVis.open(); return; }
  document.body.dataset.tab = k;
  Array.prototype.forEach.call(tabs.children, function(b){ b.classList.toggle("on", b.dataset.k === k); });
  window.scrollTo(0,0);
  var sc = document.querySelector(".scroll-content"); if(sc) sc.scrollTop = 0;
}
go("reg");

/* masque le bouton INSTALLER APP (inutile dans une vraie appli) */
function tidy(){
  document.querySelectorAll("button").forEach(function(b){
    if(/INSTALLER APP/i.test(b.textContent)) b.style.display = "none";
  });
}
new MutationObserver(tidy).observe(document.body,{childList:true,subtree:true}); tidy();

/* ---------- 2. sablier 3D (meme sablier que NETTOYAGE PRO) ---------- */
function hgSVG(){return '<svg viewBox="0 0 150 220" id="hg"><defs>'+
'<linearGradient id="hgGl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".25" stop-color="#cfe9f5" stop-opacity=".25"/><stop offset=".75" stop-color="#9fd0e8" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>'+
'<linearGradient id="hgWd" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a1672f"/><stop offset=".5" stop-color="#7b4a1d"/><stop offset="1" stop-color="#4e2c0e"/></linearGradient>'+
'<radialGradient id="hgSh" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient>'+
'<clipPath id="hgcT"><path d="M30 28 H120 C120 70 88 92 80 110 H70 C62 92 30 70 30 28Z"/></clipPath>'+
'<clipPath id="hgcB"><path d="M70 110 H80 C88 128 120 150 120 192 H30 C30 150 62 128 70 110Z"/></clipPath></defs>'+
'<ellipse cx="75" cy="212" rx="62" ry="7" fill="#000" opacity=".22"/>'+
'<rect x="16" y="196" width="118" height="16" rx="6" fill="url(#hgWd)"/><rect x="16" y="196" width="118" height="4" rx="2" fill="#fff" opacity=".25"/>'+
'<g clip-path="url(#hgcT)"><rect id="hgT" x="20" y="28" width="110" height="82" fill="#E53935"/><rect id="hgTh" x="20" y="28" width="110" height="82" fill="url(#hgSh)"/></g>'+
'<g clip-path="url(#hgcB)"><path id="hgB" d="" fill="#E53935"/><path id="hgBh" d="" fill="url(#hgSh)"/></g>'+
'<line id="hgS" class="hgs" x1="75" x2="75" y1="108" y2="108" stroke="#E53935" stroke-width="2.6"/>'+
'<path d="M30 28 H120 C120 70 88 92 80 110 H70 C62 92 30 70 30 28Z M70 110 H80 C88 128 120 150 120 192 H30 C30 150 62 128 70 110Z" fill="url(#hgGl)" stroke="#8fb9cc" stroke-width="2.5"/>'+
'<path d="M40 36 C42 66 60 84 66 104" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75"/>'+
'<path d="M40 184 C42 160 52 148 58 138" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".45"/>'+
'<rect x="18" y="14" width="114" height="16" rx="6" fill="url(#hgWd)"/><rect x="18" y="14" width="114" height="4" rx="2" fill="#fff" opacity=".25"/></svg>';}
function hgCol(p){var a=[[0,[229,57,53]],[.45,[251,140,0]],[.75,[253,216,53]],[1,[67,160,71]]];
  for(var i=1;i<a.length;i++) if(p<=a[i][0]){var x=a[i-1],y=a[i],k=(p-x[0])/(y[0]-x[0]);
    return "rgb("+x[1].map(function(v,j){return Math.round(v+(y[1][j]-v)*k)}).join(",")+")";}
  return "rgb(67,160,71)";}
function hgSet(pct,run){
  var p=Math.max(0,Math.min(1,pct/100)),c=hgCol(p),h=82*(1-p);
  var T=$("hgT"),Th=$("hgTh"); T.setAttribute("y",110-h);T.setAttribute("height",h);T.setAttribute("fill",c);
  Th.setAttribute("y",110-h);Th.setAttribute("height",h);
  var d="M20 192 H130 V"+(192-58*p)+" Q100 "+(192-58*p)+" 75 "+(192-70*p-6)+" Q50 "+(192-58*p)+" 20 "+(192-58*p)+"Z";
  $("hgB").setAttribute("d",d);$("hgB").setAttribute("fill",c);$("hgBh").setAttribute("d",d);
  var S=$("hgS");S.setAttribute("y2",run&&p<1&&p>0?(192-70*p-6):108);S.setAttribute("stroke",c);
  $("ptxt").textContent=Math.round(pct)+" %";$("ptxt").style.color=c;
  $("jmsFill").style.width=pct+"%";$("jmsFill").style.background=c;}

var ov = document.createElement("div"); ov.id = "jmsOv";
ov.innerHTML = '<div id="jmsBox"><div class="jmsTitle">🎞️ JM LAB PRO • LOT</div>'+
 '<div id="jmsBan" class="jmsBan">PRÊT</div>'+
 '<div class="hgw"><div class="hgflip" id="hgflip">'+hgSVG()+'</div><div class="hgr"><div class="hgp" id="ptxt">0 %</div>'+
 '<div class="clocks"><span>⏱ ÉCOULÉ <span id="cEl">00:00</span></span><span>⌛ RESTE <span id="cLeft">--:--</span></span></div></div></div>'+
 '<div class="jmsBar"><div id="jmsFill"></div></div><div class="jmsCnt" id="jmsCnt"></div>'+
 '<div class="jmsSum" id="jmsSum" style="display:none"></div>'+
 '<button class="jmsBtn stop" id="jmsStop">⛔ STOP</button>'+
 '<button class="jmsBtn zip" id="jmsZip" style="display:none">📦 TÉLÉCHARGER LE ZIP</button>'+
 '<button class="jmsBtn close" id="jmsClose" style="display:none">FERMER</button></div>';
document.body.appendChild(ov);


/* ---------- 2b. ecran PRET A LANCER (choix du dossier, galerie / ZIP) ---------- */
var gate = document.createElement("div"); gate.id = "jmsGate"; gate.className = "jmsOvl";
gate.innerHTML = '<div class="jmsBoxG"><div class="jmsTitle">🚀 PRÊT À LANCER</div>'+
 '<div class="gN" id="gN"></div>'+
 '<div class="gSt" id="gSt"></div>'+
 '<button class="gBtn csb" id="gCS">🖼️ CADRE + SIGNATURE<small id="gCSs"></small></button>'+
 '<label class="gL">⚙️ Qualité / taille</label><select id="gQ" class="gIn sel"><option value="orig">Maximum : taille d\'origine, qualité 92</option><option value="web">Web léger : 2480 px, qualité 85</option><option value="mini">Très léger : 1600 px, qualité 80</option><option value="mail">Mail : 1200 px, qualité 75</option></select><div class="gOrig" id="gOrig"></div>'+
 '<label class="gL">📁 Nom du dossier</label><input id="gName" class="gIn" type="text">'+
 '<label class="gC"><input type="checkbox" id="gDirect" checked> Photos corrigées enregistrées directement<small id="gPath"></small></label>'+
 '<div class="gDest"><label><input type="radio" name="gDest" value="gal" checked> 🖼️ Galerie</label><label><input type="radio" name="gDest" value="dir"> 📂 Dossier choisi</label></div>'+
 '<button class="gBtn" id="gPick">📂 CHOISIR UN DOSSIER (carte SD, clé USB…)<small id="gDirN"></small></button>'+
 '<label class="gC"><input type="checkbox" id="gZip"> Créer aussi un ZIP (Téléchargements/JM LAB PRO)</label>'+
 '<button class="jmsBtn go" id="gGo">▶ LANCER LA CORRECTION</button>'+
 '<button class="jmsBtn close" id="gNo">ANNULER</button></div>';
document.body.appendChild(gate);
function pad(n){ return ("0"+n).slice(-2); }
function styleSummary(){
  var L = ["Dosage","Exposition","Contraste","Temperature","Teinte","Hautes","Ombres","Vibrance","Saturation","Clarté","Noir","Blanc","Dehaze","Vignette"];
  var c = document.querySelector(".space-y-3.mb-4"), out = [];
  if(c) Array.prototype.forEach.call(c.querySelectorAll('input[type="range"]'), function(r,i){
    var v = Number(r.value), d = (i===0) ? 50 : 0;
    if(v !== d) out.push(L[i]+" "+(v>0&&i>0?"+":"")+v);
  });
  return out.length ? out.join(" • ") : "Aucun réglage modifié (image d'origine)";
}
function updPath(){
  var n = ($("gName").value||"").trim() || "Lot";
  var dir = document.querySelector('input[name=gDest]:checked'); dir = dir && dir.value === "dir";
  $("gPath").textContent = (dir ? ($("gDirN").textContent || "dossier choisi") + " / " : "Images / JM LAB PRO / ") + n;
}
window.__jmsLotGate = function(files){
  return new Promise(function(resolve){
    var d = new Date();
    $("gN").textContent = files.length + " image" + (files.length>1?"s":"") + " choisie" + (files.length>1?"s":"");
    $("gSt").innerHTML = "<b>Style appliqué :</b><br>" + styleSummary() + "<br><small>Pour le changer : annule, change de profil ou de réglage, puis relance.</small>";
    $("gName").value = "Lot_"+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+"_"+pad(d.getHours())+pad(d.getMinutes());
    var o; try{ o = JSON.parse(localStorage.getItem("jms_opts")||"{}"); }catch(e){ o = {}; }
    $("gDirect").checked = o.direct !== false; $("gZip").checked = !!o.zip;
    var tot = 0; files.forEach(function(f){ tot += f.size; });
    $("gOrig").textContent = "Originaux : " + (tot/1048576).toFixed(1) + " Mo";
    $("gQ").value = o.q || "orig";
    var fn = (NAT && NAT.folderName) ? NAT.folderName() : ""; $("gDirN").textContent = fn ? "Actuel : " + fn : "";
    var rd = document.querySelectorAll("input[name=gDest]"); rd[0].checked = !(o.dest === "dir" && fn); rd[1].checked = (o.dest === "dir" && !!fn);
    var csUpd = function(){ $("gCSs").textContent = window.__jmsCS ? window.__jmsCS.summary() : ""; $("gCS").className = "gBtn csb" + (window.__jmsCS && window.__jmsCS.get().on ? " on" : ""); };
    csUpd();
    $("gCS").onclick = function(){ window.__jmsCS.open(files[0], csUpd); };
    $("gPick").onclick = function(){ if(NAT) NAT.pickFolder(); };
    window.__jmsFolder = function(n){ $("gDirN").textContent = "Actuel : " + n; document.querySelectorAll("input[name=gDest]")[1].checked = true; updPath(); };
    Array.prototype.forEach.call(rd, function(r){ r.onchange = updPath; });
    updPath(); gate.classList.add("show");
    $("gName").oninput = updPath;
    $("gGo").onclick = function(){
      var direct = $("gDirect").checked, zip = $("gZip").checked;
      if(!direct && !zip) direct = true;
      var dest = document.querySelector("input[name=gDest]:checked").value;
      if(dest === "dir" && NAT && !NAT.folderName()){ alert("Choisis d'abord un dossier (bouton « CHOISIR UN DOSSIER »)."); return; }
      var qk = $("gQ").value, QS = {orig:{}, web:{max:2480,q:0.85}, mini:{max:1600,q:0.8}, mail:{max:1200,q:0.75}};
      localStorage.setItem("jms_opts", JSON.stringify({direct:direct, zip:zip, q:qk, dest:dest}));
      if(NAT) NAT.setTarget(dest === "dir");
      lot = {Q:QS[qk], direct:direct, zip:zip, sub:($("gName").value||"").trim() || "Lot", chain:Promise.resolve(), saved:0, failed:0};
      gate.classList.remove("show"); resolve(files);
    };
    $("gNo").onclick = function(){ gate.classList.remove("show"); resolve(null); };
  });
};
var lot = {Q:{}, direct:true, zip:false, sub:"Lot", chain:Promise.resolve(), saved:0, failed:0};

var st = {total:0, done:0, err:0, t0:0, timer:null, running:false, stopped:false};
function mmss(s){s=Math.max(0,Math.round(s));return ("0"+Math.floor(s/60)).slice(-2)+":"+("0"+(s%60)).slice(-2)}
function tick(){
  var el = (Date.now()-st.t0)/1000; $("cEl").textContent = mmss(el);
  $("cLeft").textContent = st.done>0 ? mmss(el/st.done*(st.total-st.done)) : "--:--";
}
function refresh(){
  var pct = st.total ? st.done/st.total*100 : 0;
  hgSet(pct, st.running);
  $("jmsCnt").textContent = st.done+" / "+st.total+" images traitées";
}
function beep(){
  try{
    var A = window.AudioContext||window.webkitAudioContext, c = new A();
    [660,880,1100].forEach(function(f,i){
      var o=c.createOscillator(),g=c.createGain(); o.frequency.value=f; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(.25,c.currentTime+i*.22); g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.22+.2);
      o.start(c.currentTime+i*.22); o.stop(c.currentTime+i*.22+.21);
    });
  }catch(e){}
}

var ps = window.__jmpQueueStart, pi = window.__jmpQueueItem, pf = window.__jmpQueueFinish;
window.__jmpQueueStart = function(names){
  window.__jmsStop = false;
  st = {total:names.length, done:0, err:0, t0:Date.now(), timer:setInterval(tick,500), running:true, stopped:false};
  $("jmsBan").className = "jmsBan run"; $("jmsBan").textContent = "EN COURS…";
  $("jmsSum").style.display="none"; $("jmsZip").style.display="none"; $("jmsClose").style.display="none";
  $("jmsStop").style.display=""; $("jmsStop").disabled=false; $("hgflip").className="hgflip";
  ov.classList.add("show"); refresh(); tick();
  if(ps) ps(names);
};
window.__jmpQueueItem = function(i,name,blob){
  st.done++; if(!blob) st.err++; refresh();
  var L = lot;
  L.chain = L.chain.then(function(){
    if(!blob) return null;
    return window.__jmsCS ? window.__jmsCS.process(blob, L.Q) : blob;
  }).catch(function(){ return blob; }).then(function(b2){
    if(pi) pi(i, name, b2 || blob);
    if(b2 && L.direct) return save(name, b2, L.sub, true).then(function(ok){ if(ok) L.saved++; else L.failed++; });
  });
};
window.__jmpQueueFinish = function(){
  $("jmsBan").textContent = "ENREGISTREMENT…";
  lot.chain.then(function(){ if(pf) pf(); finishLot(); });
};
function finishLot(){
  clearInterval(st.timer); st.running = false; tick();
  var ok = st.done - st.err, stopped = !!window.__jmsStop;
  hgSet(stopped ? (st.done/st.total*100) : 100, false);
  $("hgflip").className = "hgflip fin";
  $("jmsBan").className = "jmsBan " + (stopped ? "stop" : "done");
  $("jmsBan").textContent = stopped ? "ARRÊTÉ" : "✔ TERMINÉ";
  $("jmsSum").style.display = "";
  $("jmsSum").innerHTML = "<b>"+ok+"</b> image(s) corrigée(s)"+(st.err?" • <b style='color:#ff8a80'>"+st.err+" erreur(s)</b>":"")+
    (lot.direct ? "<br>📁 <b>Images / JM LAB PRO / "+lot.sub+"</b><br>"+lot.saved+" enregistrée(s)"+(lot.failed?" • <b style='color:#ff8a80'>"+lot.failed+" échec(s)</b>":"") : "")+
    "<br>Temps : "+$("cEl").textContent;
  $("jmsStop").style.display = "none"; $("jmsClose").style.display = "";
  $("jmsZip").style.display = (ok>0 && lot.zip) ? "" : "none";
  beep(); if(NAT){ try{ NAT.vibrate(); NAT.toFront(); }catch(e){} }
}
/* progression generique (sablier) pour les autres modules */
window.__jmsProgress = {
  start:function(title){
    window.__jmsStop = false; st = {total:100, done:0, err:0, t0:Date.now(), timer:setInterval(tick,500), running:true, stopped:false};
    document.querySelector("#jmsBox .jmsTitle").textContent = title;
    $("jmsBan").className = "jmsBan run"; $("jmsBan").textContent = "EN COURS…";
    $("jmsSum").style.display = "none"; $("jmsZip").style.display = "none"; $("jmsClose").style.display = "none";
    $("jmsStop").style.display = ""; $("jmsStop").disabled = false; $("hgflip").className = "hgflip";
    ov.classList.add("show"); hgSet(0,true); $("jmsCnt").textContent = ""; tick();
  },
  set:function(pct,label){ hgSet(pct,true); $("jmsCnt").textContent = label || ""; },
  end:function(html,stopped){
    clearInterval(st.timer); st.running = false; tick(); hgSet(stopped ? st.done : 100, false);
    $("hgflip").className = "hgflip fin"; $("jmsBan").className = "jmsBan " + (stopped ? "stop" : "done");
    $("jmsBan").textContent = stopped ? "ARRÊTÉ" : "✔ TERMINÉ"; $("jmsSum").style.display = ""; $("jmsSum").innerHTML = html || "";
    $("jmsStop").style.display = "none"; $("jmsClose").style.display = ""; beep(); if(NAT){ try{ NAT.vibrate(); NAT.toFront(); }catch(e){} }
  },
  hide:function(){ clearInterval(st.timer); ov.classList.remove("show"); }
};
$("jmsStop").onclick = function(){ window.__jmsStop = true; this.disabled = true; $("jmsBan").textContent = "ARRÊT EN COURS…"; };
$("jmsZip").onclick = function(){ var z = document.querySelector(".jmq-full.jmq-yellow"); if(z) z.click(); };
$("jmsClose").onclick = function(){ ov.classList.remove("show"); };

/* ---------- 3. telechargements -> galerie / dossier JM LAB PRO ---------- */
var keep = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = function(u){ setTimeout(function(){ keep(u); }, 120000); };
/* bandeau de retour visible (le toast Android peut passer inapercu) */
var noteEl = null, noteT = 0;
window.__jmsNote = function(text, kind, ms){
  if(!noteEl){ noteEl = document.createElement("div"); noteEl.id = "jmsNote"; document.body.appendChild(noteEl); }
  noteEl.textContent = text; noteEl.className = "n-" + (kind || "info"); noteEl.style.display = "block"; clearTimeout(noteT);
  if(ms !== 0) noteT = setTimeout(function(){ noteEl.style.display = "none"; }, ms || 4000);
};
var sTick = 0, sT0 = 0;
function startSaveTimer(){
  sT0 = Date.now(); clearInterval(sTick); window.__jmsNote("⏳ Enregistrement… 0 s", "info", 0);
  sTick = setInterval(function(){ window.__jmsNote("⏳ Enregistrement… " + Math.round((Date.now()-sT0)/1000) + " s\n(traitement de la photo en pleine taille)", "info", 0); }, 1000);
}
document.addEventListener("click", function(e){ var b = e.target.closest && e.target.closest("button"); if(b && (b.id === "jxSave" || /T[ée]l[ée]charger HD/i.test(b.textContent))) startSaveTimer(); }, true);
function save(name, blob, sub, quiet){
  return new Promise(function(done){
    if(!NAT){ return done(false); }
    if(!quiet && NAT.setTarget){ try{ NAT.setTarget(false); }catch(e){} }
    NAT.saveBeginIn(name, blob.type || "application/octet-stream", sub || "");
    var CH = 768*1024, pos = 0;
    (function next(){
      if(pos >= blob.size){ done(quiet ? NAT.saveEndQuiet() : NAT.saveEnd()); return; }
      var r = new FileReader();
      r.onload = function(){ NAT.saveChunk(String(r.result).split(",")[1]||""); pos += CH; next(); };
      r.readAsDataURL(blob.slice(pos, pos+CH));
    })();
  });
}
var origClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function(){
  if(NAT && this.download && /^blob:/.test(this.href)){
    var name = this.download;
    var tPrep = Date.now(); if(/\.jpe?g$|\.png$/i.test(name) && !sT0) startSaveTimer();
    fetch(this.href).then(function(r){return r.blob()}).then(function(b){
      if(window.__jmsCS && (window.__jmsCS.get().on || (window.__jmsFX && window.__jmsFX.active({single:true}))) && /\.jpe?g$/i.test(name) && /JMD_LAB_PRO/.test(name)) return window.__jmsCS.process(b, {single:true}).then(function(b2){ return save(name,b2,"",false).then(fin); });
      return save(name,b,"",false).then(fin);
    }).catch(function(e){ clearInterval(sTick); sT0 = 0; window.__jmsNote("✖ Échec de l'enregistrement : " + (e && e.message || e), "err", 9000); });
    function fin(ok){ clearInterval(sTick); var tw = Math.round((Date.now()-tPrep)/1000), tp = sT0 ? Math.round((tPrep-sT0)/1000) : 0; sT0 = 0; if(/\.jpe?g$|\.png$/i.test(name)) window.__jmsNote(ok ? "✔ ENREGISTRÉ dans Images / JM LAB PRO\n" + name + "\n(traitement " + tp + " s • écriture " + tw + " s)" : "✖ Échec de l'enregistrement", ok ? "ok" : "err", ok ? 8000 : 9000); return ok; }
    return;
  }
  return origClick.apply(this, arguments);
};

/* ---------- 4. bouton retour ---------- */
window.__jmsSave = function(n,b){ return save(n,b,"",false); };
window.__jmsSaveQ = function(n,b,sub){ return save(n,b,sub||"",true); };
window.__jmsBack = function(){
  if(window.__jmsBack2 && window.__jmsBack2()) return 1;
  var tl = document.getElementById("jmsTools"); if(tl && tl.classList.contains("show")){ tl.classList.remove("show"); return 1; }
  if($("jmsGate").classList.contains("show")){ $("gNo").click(); return 1; }
  if($("jmsCS") && $("jmsCS").classList.contains("show")){ $("jmsCS").classList.remove("show"); return 1; }
  var h = document.getElementById("jmsHub"); if(h && h.classList.contains("show")){ h.classList.remove("show"); return 1; }
  var c = document.querySelector(".jmp-overlay .jmp-close"); if(c){ c.click(); return 1; }
  var q = document.querySelector(".jmq-overlay .jmq-gray"); if(q){ q.click(); return 1; }
  if(ov.classList.contains("show")){ if(!st.running) ov.classList.remove("show"); return 1; }
  if(document.body.dataset.tab !== "reg"){ go("reg"); return 1; }
  return 0;
};
})();
