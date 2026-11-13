/* JM LAB PRO - VISIONNEUSE + ENREGISTREMENT RAPIDE (meme fonctionnement que VISIONNEUSE_ENREGISTRE.py sur PC) */
(function(){
"use strict";
var NAT = window.JMNative || null;
var CK = "jms_vis";
var C_GRIS="#333333", C_VERT="#27ae60", C_VERTF="#1e8449", C_ROUGE="#c0392b", C_ORANGE="#e67e22", C_BLEU="#2980b9";
var FEN = 41;                                   /* vignettes dessinees autour de l'image courante */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

var cfg = (function(){ try{ return Object.assign({rec:true,next:true}, JSON.parse(localStorage.getItem(CK)||"{}")); }catch(e){ return {rec:true,next:true}; } })();
function saveCfg(){ try{ localStorage.setItem(CK, JSON.stringify(cfg)); }catch(e){} }

var S = { gen:0, items:[], i:0, saved:{}, pending:{}, rot:{}, undo:[], dims:{}, names:{src:"",dst:""}, openOK:false, flashT:0, lastTap:0 };

/* ---------- page ---------- */
var ov = document.createElement("div"); ov.id = "jmv";
ov.innerHTML =
'<div class="vTop">'+
 '<div class="vRow"><span class="vLb">Regarder :</span><span class="vPath" id="vSrcN">—</span><button class="vB blue" data-v="pickS">Choisir…</button></div>'+
 '<div class="vRow"><span class="vLb g">Enregistrer :</span><span class="vPath g" id="vDstN">—</span><button class="vB green" data-v="pickD">Choisir…</button><button class="vB gray" data-v="openD">Ouvrir</button></div>'+
 '<div class="vRow vRow2"><label class="vChk"><input type="checkbox" id="vRec"> sous-dossiers</label><span class="vSp"></span><button class="vB close" data-v="close">✕ FERMER</button></div>'+
'</div>'+
'<div id="vBan" class="vBan"></div>'+
'<div id="vMain"><div id="vBox"><img id="vImg" alt=""></div><div id="vPast"></div><div id="vMsg"></div></div>'+
'<div id="vStrip"></div>'+
'<div class="vInfoW"><div id="vInfo"></div><div id="vCnt"></div></div>'+
'<div class="vBot">'+
 '<div class="vRowB">'+
  '<button class="vN" data-v="prev">◀</button>'+
  '<button class="vSave" data-v="save">✔ ENREGISTRER</button>'+
  '<button class="vN" data-v="next">▶</button>'+
 '</div>'+
 '<div class="vRowB vRowC">'+
  '<button class="vR" data-v="rotL">⟲ G</button><button class="vR" data-v="rot180">180°</button><button class="vR" data-v="rotR">D ⟳</button>'+
  '<button class="vDel" data-v="del">🗑 Suppr</button>'+
  '<button class="vU" data-v="undo">↶ Annuler</button>'+
  '<button class="vU" data-v="nextun">⏭ Non enreg.</button>'+
 '</div>'+
 '<label class="vChk vNx"><input type="checkbox" id="vNext"> image suivante après enregistrement</label>'+
'</div>'+
'<div id="vConf"><div class="vConfB"><div class="vConfT" id="vConfT"></div>'+
 '<button class="vConfY" data-v="delyes">🗑 SUPPRIMER</button><button class="vConfN" data-v="delno">ANNULER</button></div></div>';
document.body.appendChild(ov);

/* ---------- sons ---------- */
var AC = null;
function bip(ok){
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    var o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = ok ? 1200 : 300; g.gain.value = .15; o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + (ok ? .07 : .22));
  }catch(e){}
}

/* ---------- bandeau ---------- */
function ban(text, bg, fg){ var b = $("vBan"); b.textContent = text; b.style.background = bg; b.style.color = fg || "#fff"; }
function rest(){
  S.flashT = 0;
  if(!S.items.length) ban("Choisissez le dossier d'images à regarder", C_GRIS);
  else if(!S.names.dst) ban("Choisissez le dossier où enregistrer (bouton vert « Choisir… »)", C_ORANGE);
  else ban("← → naviguer  ·  double-tap = ENREGISTRER  ·  🗑 = SUPPRIMER (récupérable)", C_GRIS, "#ccc");
}
function flash(text, color, ms){
  ban(text, color); if(S.flashT) clearTimeout(S.flashT);
  S.flashT = setTimeout(rest, ms || 1800);
}

/* ---------- utilitaires ---------- */
function taille(n){ var u = ["o","Ko","Mo","Go"], k = 0; n = +n || 0; while(n >= 1024 && k < 3){ n /= 1024; k++; } return (k === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[k]; }
function p2(n){ return (n < 10 ? "0" : "") + n; }
function dateTxt(ms){ if(!ms) return ""; var d = new Date(+ms); return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+" "+p2(d.getHours())+":"+p2(d.getMinutes()); }
function cur(){ return S.items[S.i] || null; }
function nSaved(){ var n = 0; S.items.forEach(function(it){ if(S.saved[it.k]) n++; }); return n; }
function rotOf(it){ return ((S.rot[it.k] || 0) % 360 + 360) % 360; }

/* ---------- dossiers ---------- */
function state(){
  try{ var s = JSON.parse(NAT.vState()); S.names.src = s.src || ""; S.names.dst = s.dst || ""; }catch(e){}
  $("vSrcN").textContent = S.names.src || "— aucun —";
  $("vDstN").textContent = S.names.dst || "— aucun —";
}
window.__jmvFolder = function(which){
  state();
  if(which === 0) refresh(false); else { if(S.items.length) refresh(true); else rest(); }
};
function refresh(keep){
  if(!NAT) return;
  var c = keep && cur() ? cur() : null;
  S.keepKey = c ? (c.r + "|" + c.n) : null;
  ban("Lecture du dossier…", C_BLEU);
  NAT.vList(!!cfg.rec);
}
window.__jmvList = function(gen){
  var j; try{ j = JSON.parse(NAT.vListGet()); }catch(e){ flash("Erreur de lecture du dossier", C_ROUGE, 4000); return; }
  if(j.gen !== gen) return;
  if(j.err){ flash("Erreur de lecture du dossier : " + j.err, C_ROUGE, 5000); S.items = []; draw(); strip(); return; }
  S.gen = j.gen; S.saved = {}; S.pending = {}; S.rot = {}; S.undo = []; S.dims = {};
  S.items = j.items.map(function(o, k){ if(o.s) S.saved[k] = { uri:"", size:o.z }; return { k:k, n:o.n, r:o.r, z:o.z, m:o.m, w:o.w }; });
  S.i = 0;
  if(S.keepKey){ for(var q = 0; q < S.items.length; q++){ if(S.items[q].r + "|" + S.items[q].n === S.keepKey){ S.i = q; break; } } }
  rest();
  if(!S.items.length) flash("Aucune image dans ce dossier", C_ORANGE, 4000);
  draw(); strip(); texts(); preload();
};

/* ---------- navigation ---------- */
function go(n){
  if(!S.items.length) return;
  n = Math.max(0, Math.min(S.items.length - 1, n));
  if(n === S.i && $("vImg").getAttribute("src")) return;
  S.i = n; texts(); draw(); strip(); preload();
}
function nextUnsaved(){
  var n = S.items.length; if(!n) return;
  for(var k = 1; k <= n; k++){ var j = (S.i + k) % n; if(!S.saved[S.items[j].k]){ go(j); return; } }
  flash("Toutes les images sont enregistrées ✔", C_VERT, 2500);
}
function url(it, kind){ return "https://appassets.androidplatform.net/vimg/" + S.gen + "/" + it.k + "/" + kind; }
function preload(){
  [1,-1,2].forEach(function(d){ var j = S.i + d; if(j >= 0 && j < S.items.length){ var im = new Image(); im.src = url(S.items[j], "p"); } });
}

/* ---------- affichage ---------- */
function texts(){
  var it = cur(), n = S.items.length;
  if(!it){ $("vInfo").textContent = ""; $("vCnt").textContent = ""; return; }
  var parts = [(S.i + 1) + " / " + n, it.n];
  var d = S.dims[it.k]; if(d) parts.push(d);
  parts.push(taille(it.z)); var dt = dateTxt(it.m); if(dt) parts.push(dt);
  if(it.r) parts.push("dossier : " + it.r);
  $("vInfo").textContent = parts.join("  ·  ");
  $("vCnt").textContent = "Enregistrées : " + nSaved() + " sur " + n;
}
function fit(){
  var im = $("vImg"), m = $("vMain"), it = cur();
  if(!it || !im.naturalWidth) return;
  var W = m.clientWidth, H = m.clientHeight, r = rotOf(it), sw = (r % 180 !== 0);
  var iw = sw ? im.naturalHeight : im.naturalWidth, ih = sw ? im.naturalWidth : im.naturalHeight;
  var sc = Math.min(W / iw, H / ih, 1);
  im.style.width = Math.max(1, Math.round(im.naturalWidth * sc)) + "px";
  im.style.height = Math.max(1, Math.round(im.naturalHeight * sc)) + "px";
  im.style.transform = "translate(-50%,-50%) rotate(" + r + "deg)";
}
function pastille(){
  var it = cur(), p = $("vPast");
  if(it && S.saved[it.k]){ p.textContent = "✔  ENREGISTRÉE"; p.style.background = C_VERT; p.style.display = "block"; }
  else if(it && S.pending[it.k]){ p.textContent = "enregistrement…"; p.style.background = C_ORANGE; p.style.display = "block"; }
  else p.style.display = "none";
}
function draw(){
  var it = cur(), im = $("vImg"), msg = $("vMsg");
  if(!it){
    im.removeAttribute("src"); im.style.display = "none"; pastille();
    msg.style.display = "block"; msg.style.color = "#777";
    msg.innerHTML = "Choisissez un dossier d'images<br>(bouton bleu « Choisir… » en haut)"; return;
  }
  var u = url(it, "p");
  if(im.getAttribute("data-u") !== u){
    im.style.display = "none"; msg.style.display = "block"; msg.style.color = "#888"; msg.textContent = "Chargement…";
    im.setAttribute("data-u", u);
    im.onload = function(){
      if(im.getAttribute("data-u") !== u) return;
      msg.style.display = "none"; im.style.display = "block"; fit();
      if(!S.dims[it.k]){ setTimeout(function(){ try{ var d = NAT && NAT.vDimsOf(S.gen, it.k); if(d){ S.dims[it.k] = d; if(cur() === it) texts(); } }catch(e){} }, 60); }
    };
    im.onerror = function(){ if(im.getAttribute("data-u") !== u) return; msg.style.display = "block"; msg.style.color = "#e74c3c"; msg.textContent = "Image illisible"; };
    im.src = u;
  } else fit();
  pastille();
}
function strip(){
  var st = $("vStrip"), n = S.items.length; st.innerHTML = "";
  if(!n) return;
  var a = Math.max(0, S.i - (FEN >> 1)), b = Math.min(n, a + FEN); a = Math.max(0, b - FEN);
  var html = "";
  for(var j = a; j < b; j++){
    var it = S.items[j], cls = "vTh" + (j === S.i ? " cur" : ""), badge = "";
    if(S.saved[it.k]) badge = '<i class="vBd">✔</i>'; else if(S.pending[it.k]) badge = '<i class="vBd o"></i>';
    var nm = it.n.length > 18 ? it.n.slice(0, 8) + "…" + it.n.slice(-8) : it.n;
    html += '<div class="' + cls + '" data-j="' + j + '"><div class="vThI"><img src="' + url(it, "t") + '" style="transform:rotate(' + rotOf(it) + 'deg)" alt="">' + badge + '</div><span>' + esc(nm) + '</span></div>';
  }
  st.innerHTML = html;
  var c = st.querySelector(".vTh.cur");
  if(c) st.scrollLeft = c.offsetLeft - (st.clientWidth - c.offsetWidth) / 2;
}

/* ---------- actions ---------- */
function save(){
  var it = cur();
  if(!it){ flash("Aucune image à enregistrer", C_ORANGE, 2000); return; }
  if(!S.names.dst){ flash("Choisissez d'abord le dossier d'enregistrement (bouton vert « Choisir… »)", C_ORANGE, 3500); bip(false); return; }
  if(S.saved[it.k]){ flash("Déjà enregistrée ✔  (" + it.n + ")", C_VERTF, 1500); if(cfg.next) go(S.i + 1); return; }
  if(S.pending[it.k]) return;
  var deg = rotOf(it);
  if(deg && it.w) flash("RAW : copié tel quel (la rotation ne s'applique pas aux fichiers RAW)", C_ORANGE, 3500);
  else flash("Enregistrement…  " + it.n, C_ORANGE, 4000);
  S.pending[it.k] = 1;
  NAT.vCopy(S.gen, it.k, it.w ? 0 : deg);
  draw(); strip();
  if(cfg.next) go(S.i + 1);
}
window.__jmvCopy = function(gen, k, js){
  if(gen !== S.gen) return;
  var r; try{ r = JSON.parse(js); }catch(e){ r = { ok:false, err:"réponse illisible" }; }
  delete S.pending[k];
  var it = null; for(var q = 0; q < S.items.length; q++){ if(S.items[q].k === k){ it = S.items[q]; break; } }
  if(!r.ok){ bip(false); flash("ERREUR : " + (it ? it.n : "image") + " non enregistrée (" + r.err + ")", C_ROUGE, 6000); }
  else {
    S.saved[k] = { uri:r.uri || "", size:r.size };
    if(!r.already) S.undo.push({ k:k, uri:r.uri, size:r.size });
    bip(true);
    flash("✔  ENREGISTRÉE   " + r.name + "  →  " + S.names.dst + (r.note ? "   (" + r.note + ")" : ""), r.note ? C_ORANGE : C_VERT, r.note ? 4500 : 2200);
  }
  texts(); draw(); strip();
};
function turn(delta){
  var it = cur(); if(!it) return;
  S.rot[it.k] = (rotOf(it) + delta + 360) % 360;
  var nom = delta === -90 ? "gauche" : delta === 90 ? "droite" : "180°", sv = S.saved[it.k];
  if(S.pending[it.k]) flash("Copie en cours : la rotation sera sur l'image affichée, refaites-la après", C_ORANGE, 3000);
  else if(sv && sv.uri && !it.w){
    NAT.vRotSaved(String(it.k), sv.uri, delta);
    flash("↻ Rotation " + nom + " — copie enregistrée mise à jour…", C_BLEU, 2000);
  } else flash("↻ Rotation " + nom + "  (appliquée à l'enregistrement)", C_BLEU, 1500);
  draw(); strip();
}
window.__jmvRot = function(tag, js){
  var r; try{ r = JSON.parse(js); }catch(e){ r = { ok:false, err:"réponse illisible" }; }
  if(!r.ok){ bip(false); flash("Rotation de la copie impossible : " + r.err, C_ROUGE, 4000); return; }
  var k = +tag, sv = S.saved[k];
  if(sv){ sv.size = r.size; S.undo.forEach(function(u){ if(u.k === k) u.size = r.size; }); }
  flash("✔  Copie tournée : " + r.name, C_VERT, 1800);
};
function askDelete(){
  var it = cur(); if(!it) return;
  if(S.pending[it.k]){ flash("Copie en cours pour cette image : réessayez dans un instant", C_ORANGE, 2500); return; }
  $("vConfT").innerHTML = "Supprimer cette photo ?<br><b>" + esc(it.n) + "</b><br><small>Elle est déplacée dans le dossier « _SUPPRIMES » (récupérable).</small>";
  $("vConf").classList.add("show");
}
function doDelete(){
  var it = cur(); $("vConf").classList.remove("show"); if(!it) return;
  flash("Suppression…  " + it.n, C_ORANGE, 4000);
  NAT.vDelete(S.gen, it.k);
}
window.__jmvDel = function(gen, k, js){
  if(gen !== S.gen) return;
  var r; try{ r = JSON.parse(js); }catch(e){ r = { ok:false, err:"réponse illisible" }; }
  var idx = -1; for(var q = 0; q < S.items.length; q++){ if(S.items[q].k === k){ idx = q; break; } }
  if(!r.ok){ bip(false); flash("Suppression impossible : " + r.err, C_ROUGE, 4000); return; }
  var nom = idx >= 0 ? S.items[idx].n : "image";
  if(idx >= 0) S.items.splice(idx, 1);
  delete S.saved[k]; delete S.rot[k]; delete S.dims[k];
  S.undo = S.undo.filter(function(u){ return u.k !== k; });
  if(S.i >= S.items.length) S.i = Math.max(0, S.items.length - 1);
  $("vImg").removeAttribute("data-u");
  flash("🗑  SUPPRIMÉE (" + r.where + ") : " + nom, C_ROUGE, 2500);
  texts(); draw(); strip(); preload();
};
function undo(){
  while(S.undo.length){
    var u = S.undo.pop();
    if(!S.saved[u.k]) continue;
    var ok = false; try{ ok = NAT.vUndo(u.uri, u.size); }catch(e){}
    if(ok){
      delete S.saved[u.k];
      var j = -1; for(var q = 0; q < S.items.length; q++){ if(S.items[q].k === u.k){ j = q; break; } }
      if(j >= 0){ S.i = j; $("vImg").removeAttribute("data-u"); }
      flash("Enregistrement annulé : " + (j >= 0 ? S.items[j].n : ""), C_ORANGE, 2500);
      texts(); draw(); strip();
    } else flash("Annulation impossible (le fichier a changé ou a disparu)", C_ROUGE, 3500);
    return;
  }
  flash("Rien à annuler (seules les copies faites pendant cette session peuvent l'être)", C_GRIS, 2500);
}

/* ---------- ouverture / fermeture ---------- */
function open(){
  if(!NAT || !NAT.vState){ alert("La visionneuse fonctionne dans l'appli Android JM LAB PRO."); return; }
  ov.classList.add("show"); S.openOK = true;
  $("vRec").checked = !!cfg.rec; $("vNext").checked = !!cfg.next;
  state();
  if(S.items.length){ rest(); draw(); strip(); texts(); }
  else if(S.names.src) refresh(false);
  else { rest(); draw(); }
}
function close(){ ov.classList.remove("show"); $("vConf").classList.remove("show"); S.openOK = false; }
window.__jmsVis = { open:open, close:close };
window.__jmsX = window.__jmsX || {}; window.__jmsX.x_vis = open;
var oldBack = window.__jmsBack2;
window.__jmsBack2 = function(){
  if(ov.classList.contains("show")){ if($("vConf").classList.contains("show")) $("vConf").classList.remove("show"); else close(); return true; }
  return oldBack ? oldBack() : false;
};

/* ---------- evenements ---------- */
var H = {
  pickS:function(){ NAT.vPick(0); }, pickD:function(){ NAT.vPick(1); },
  openD:function(){ if(!S.names.dst) flash("Choisissez d'abord le dossier d'enregistrement", C_ORANGE, 2500); else NAT.vOpenDst(); },
  close:close, prev:function(){ go(S.i - 1); }, next:function(){ go(S.i + 1); }, save:save,
  rotL:function(){ turn(-90); }, rotR:function(){ turn(90); }, rot180:function(){ turn(180); },
  del:askDelete, delyes:doDelete, delno:function(){ $("vConf").classList.remove("show"); },
  undo:undo, nextun:nextUnsaved
};
ov.addEventListener("click", function(e){
  var t = e.target.closest("[data-v]"); if(t && H[t.dataset.v]){ H[t.dataset.v](); return; }
  var th = e.target.closest(".vTh"); if(th) go(+th.dataset.j);
});
$("vRec").addEventListener("change", function(){ cfg.rec = this.checked; saveCfg(); if(S.names.src) refresh(true); });
$("vNext").addEventListener("change", function(){ cfg.next = this.checked; saveCfg(); });
window.addEventListener("resize", function(){ if(S.openOK){ fit(); strip(); } });

/* glisser pour naviguer ; double-tap = enregistrer ; glisser sur la bande de vignettes */
(function(){
  var main = $("vMain"), x0 = 0, y0 = 0, t0 = 0, mv = false;
  main.addEventListener("touchstart", function(e){ var t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); mv = false; }, {passive:true});
  main.addEventListener("touchend", function(e){
    var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if(Math.abs(dx) > 60 && Math.abs(dy) < 90){ go(S.i + (dx < 0 ? 1 : -1)); S.lastTap = 0; return; }
    if(Math.abs(dx) < 15 && Math.abs(dy) < 15 && Date.now() - t0 < 350){
      var now = Date.now();
      if(now - S.lastTap < 320){ S.lastTap = 0; save(); } else S.lastTap = now;
    }
  }, {passive:true});
  main.addEventListener("dblclick", function(){ save(); });
  var st = $("vStrip"), sx = 0, acc = 0, drag = false;
  st.addEventListener("touchstart", function(e){ sx = e.changedTouches[0].clientX; acc = 0; drag = false; }, {passive:true});
  st.addEventListener("touchmove", function(e){
    var x = e.changedTouches[0].clientX, dx = x - sx; acc += dx; sx = x;
    if(Math.abs(acc) > 110){ drag = true; go(S.i + (acc < 0 ? 1 : -1)); acc = 0; }
  }, {passive:true});
  st.addEventListener("click", function(e){ if(drag){ e.stopPropagation(); e.preventDefault(); drag = false; } }, true);
})();

/* clavier (si un clavier est branche) */
document.addEventListener("keydown", function(e){
  if(!S.openOK || e.target.tagName === "INPUT") return;
  var k = e.key, h = null;
  if(k === "ArrowRight" || k === "ArrowDown") go(S.i + 1);
  else if(k === "ArrowLeft" || k === "ArrowUp") go(S.i - 1);
  else if(k === "PageDown") go(S.i + 10); else if(k === "PageUp") go(S.i - 10);
  else if(k === "Home") go(0); else if(k === "End") go(S.items.length - 1);
  else if(k === " " || k === "Enter" || k === "s" || k === "S") save();
  else if(k === "Delete") askDelete();
  else if(k === "g" || k === "G") turn(-90); else if(k === "d" || k === "D") turn(90); else if(k === "x" || k === "X") turn(180);
  else if(k === "Backspace" || (e.ctrlKey && k === "z")) undo();
  else if(k === "n" || k === "N") nextUnsaved();
  else if(k === "o" || k === "O") H.openD();
  else if(k === "Escape") close();
  else return;
  e.preventDefault();
});
})();
