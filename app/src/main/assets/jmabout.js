/* JM LAB PRO - ecran A PROPOS (version, Instagram, confidentialite, langue) + accueil au premier lancement */
(function(){
"use strict";
var EN = window.__jmsLang === "en";
function T(fr, en){ return EN ? en : fr; }
var NAT = window.JMNative || null;
var VER = ""; try{ VER = NAT && NAT.appVersion ? NAT.appVersion() : ""; }catch(e){}
var INSTA = "https://instagram.com/jean_michel_dargere";

var css = document.createElement("style");
css.textContent =
"#jmAb,#jmIn{position:fixed;inset:0;z-index:3600;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;padding:14px}" +
"#jmAb.show,#jmIn.show{display:flex}" +
".abBox{width:100%;max-width:400px;max-height:94vh;overflow-y:auto;background:#1b1b1b;border-radius:24px;padding:18px;color:#fff;font-family:system-ui,sans-serif}" +
".abName{font-size:24px;font-weight:900;text-align:center;color:#FFD600;letter-spacing:.04em}" +
".abVer{text-align:center;color:#aaa;font-size:13px;margin:2px 0 12px}" +
".abSec{background:#0f0f0f;border-radius:14px;padding:12px;margin:10px 0;font-size:13px;line-height:1.5;color:#ddd}" +
".abSec b{color:#fff}" +
".abLang{display:flex;gap:8px;margin-top:8px}.abLang button{flex:1;border:0;border-radius:12px;padding:12px;font-weight:900;font-size:15px;background:#3a3a3a;color:#fff}.abLang button.on{background:#1E88E5;outline:3px solid #FFB300}" +
".abChk{display:flex;gap:10px;align-items:center;font-weight:700;color:#fff}.abChk input{width:24px;height:24px;flex:none;accent-color:#43A047}" +
".abBtn{width:100%;border:0;border-radius:16px;padding:15px;font-weight:900;font-size:16px;color:#fff;margin-top:8px}" +
".abI{background:#e91e63}.abG{background:#43A047}.abC{background:#3a3a3a}" +
".inStep{text-align:center}.inStep .e{font-size:64px;line-height:1.2}.inStep h3{font-size:22px;margin:8px 0;color:#FFD600}.inStep p{font-size:16px;line-height:1.5;color:#ddd;margin:0 0 6px}" +
".inDots{display:flex;justify-content:center;gap:8px;margin:14px 0 4px}.inDots span{width:10px;height:10px;border-radius:50%;background:#555}.inDots span.on{background:#FFD600}" +
".scroll-content>div:first-child>div:first-child>div{cursor:pointer}";
document.head.appendChild(css);

/* ---------- A PROPOS ---------- */
var ab = document.createElement("div"); ab.id = "jmAb";
ab.innerHTML = '<div class="abBox">' +
 '<div class="abName">JM LAB PRO</div>' +
 '<div class="abVer">' + T("Version ", "Version ") + (VER || "3") + ' • JM.Dargère</div>' +
 '<div class="abSec">' + T(
   "Retouche photo hors ligne : profils film, réglages, effets, cadre et signature, traitement par lot.",
   "Offline photo editing: film profiles, adjustments, effects, frame and signature, batch processing.") + '</div>' +
 '<button class="abBtn" style="background:#C9A24A;color:#111" data-a="manuel">📖 ' + T("MODE D'EMPLOI", "USER GUIDE") + '</button>' +
 '<button class="abBtn abI" data-a="insta">📷 ' + T("MON INSTAGRAM", "MY INSTAGRAM") + '</button>' +
 '<div class="abSec"><b>🔒 ' + T("Confidentialité", "Privacy") + '</b><br>' + T(
   "JM LAB PRO ne collecte aucune donnée personnelle. Vos photos sont traitées uniquement sur votre téléphone et ne sont jamais envoyées sur Internet. Pas de compte, pas de publicité, pas de statistiques. La caméra sert seulement à scanner des QR codes de styles, et l'image n'est pas conservée. Les réglages et styles restent dans l'appli ; les photos sont enregistrées dans le dossier que vous choisissez.",
   "JM LAB PRO collects no personal data. Your photos are processed only on your phone and are never sent over the Internet. No account, no ads, no analytics. The camera is only used to scan style QR codes, and the image is not kept. Settings and styles stay in the app; photos are saved in the folder you choose.") + '</div>' +
 '<div class="abSec"><label class="abChk"><input type="checkbox" id="abKeep"> ' + T("Reprendre mes derniers réglages à l'ouverture de l'appli", "Restore my last settings when the app opens") + '</label></div>' +
 '<div class="abSec"><b>🌐 ' + T("Langue", "Language") + '</b>' +
 '<div class="abLang"><button data-a="fr" class="' + (EN ? "" : "on") + '">Français</button><button data-a="en" class="' + (EN ? "on" : "") + '">English</button></div></div>' +
 '<div class="abSec" style="font-size:11px;color:#999">' + T(
   "Les noms des profils décrivent un rendu ; ils ne sont pas des produits d'une marque. Snapseed est une marque de Google LLC. JM LAB PRO n'est ni affilié à Google ni à un fabricant d'appareils photo.",
   "Profile names describe a look; they are not branded products. Snapseed is a trademark of Google LLC. JM LAB PRO is not affiliated with Google or any camera maker.") + '</div>' +
 '<button class="abBtn abG" data-a="intro">👋 ' + T("REVOIR LE GUIDE DE DÉPART", "SHOW THE QUICK GUIDE AGAIN") + '</button>' +
 '<button class="abBtn abC" data-a="close">' + T("FERMER", "CLOSE") + '</button></div>';
document.body.appendChild(ab);
ab.addEventListener("click", function(e){
  var b = e.target.closest("button"); if(!b){ if(e.target === ab) ab.classList.remove("show"); return; }
  var a = b.dataset.a;
  if(a === "close") ab.classList.remove("show");
  else if(a === "insta") location.href = INSTA;
  else if(a === "manuel"){ ab.classList.remove("show"); openManual(); }
  else if(a === "fr" || a === "en"){ if((a === "en") !== EN && window.__jmsSetLang) window.__jmsSetLang(a); }
  else if(a === "intro"){ ab.classList.remove("show"); intro(); }
});
var kp = ab.querySelector("#abKeep");
kp.onchange = function(){ try{ localStorage.setItem("jms_keep", kp.checked ? "1" : "0"); if(!kp.checked) localStorage.removeItem("jms_last"); }catch(e){} };
window.__jmsAbout = function(){ var on = true; try{ on = localStorage.getItem("jms_keep") !== "0"; }catch(e){} kp.checked = on; ab.classList.add("show"); };
/* le nom de l'appli dans le bandeau vert ouvre A PROPOS */
document.addEventListener("click", function(e){
  var t = e.target.closest && e.target.closest(".scroll-content>div:first-child>div:first-child>div");
  if(t) window.__jmsAbout();
}, true);

/* ---------- MODE D'EMPLOI : pages du PDF affichees dans l'appli + enregistrement du PDF ---------- */
/* francais ou anglais selon la langue de l'appli */
var MDIR = EN ? "manuel/en/" : "manuel/", PAGES = 12, PDF = MDIR + (EN ? "JM_LAB_PRO_user_guide.pdf" : "JM_LAB_PRO_mode_emploi.pdf");
var mc = document.createElement("style");
mc.textContent = "#jmMan{position:fixed;inset:0;z-index:3650;background:#2b2b2b;display:none;flex-direction:column;font-family:system-ui,sans-serif}#jmMan.show{display:flex}" +
 "#jmMan .mTop{flex:none;display:flex;align-items:center;gap:6px;padding:max(8px,env(safe-area-inset-top)) 8px 8px;background:#141414;color:#fff}" +
 "#jmMan .mTop b{flex:1;font-size:15px;letter-spacing:.04em}#jmMan .mTop button{border:0;border-radius:10px;background:#3a3a3a;color:#fff;font-weight:900;font-size:17px;min-width:42px;height:40px}" +
 "#jmMan .mPg{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}#jmMan .mIn{padding:10px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}" +
 "#jmMan .mIn img{display:block;width:100%;max-width:none;box-shadow:0 2px 10px #000a;background:#fff}" +
 "#jmMan .mBot{flex:none;display:flex;gap:8px;padding:8px 8px max(8px,env(safe-area-inset-bottom));background:#141414}#jmMan .mBot button{flex:1;border:0;border-radius:14px;padding:13px;font-weight:900;font-size:15px;color:#fff}" +
 "#jmMan #mCnt{color:#bbb;font-size:12px;min-width:46px;text-align:center}";
document.head.appendChild(mc);
var man = document.createElement("div"); man.id = "jmMan";
man.innerHTML = '<div class="mTop"><b>📖 ' + T("MODE D'EMPLOI", "USER GUIDE") + '</b><span id="mCnt">1 / ' + PAGES + '</span><button data-m="out">−</button><button data-m="in">+</button><button data-m="close">✕</button></div>' +
  '<div class="mPg" id="mPg"><div class="mIn" id="mIn"></div></div>' +
  '<div class="mBot"><button data-m="pdf" style="background:#43A047">💾 ' + T("ENREGISTRER LE PDF", "SAVE THE PDF") + '</button><button data-m="close" style="background:#3a3a3a;flex:0 0 30%">' + T("FERMER", "CLOSE") + '</button></div>';
document.body.appendChild(man);
var zoomM = 1, mIn = man.querySelector("#mIn"), mPg = man.querySelector("#mPg"), built = false;
function setZoom(z, cx, cy){
  var old = zoomM; zoomM = Math.max(1, Math.min(3.5, z)); if(zoomM === old) return;
  var r = mPg.getBoundingClientRect(), ox = cx === undefined ? r.width / 2 : cx - r.left, oy = cy === undefined ? r.height / 2 : cy - r.top;
  var fx = (mPg.scrollLeft + ox) / old, fy = (mPg.scrollTop + oy) / old;
  mIn.style.width = (zoomM * 100) + "%";
  mPg.scrollLeft = fx * zoomM - ox; mPg.scrollTop = fy * zoomM - oy;
}
function openManual(){
  if(!built){ built = true; var h = ""; for(var i = 1; i <= PAGES; i++) h += '<img loading="lazy" alt="page ' + i + '" src="' + MDIR + 'p' + (i < 10 ? "0" : "") + i + '.jpg">'; mIn.innerHTML = h; }
  man.classList.add("show");
}
window.__jmsManual = openManual;
window.__jmsX = window.__jmsX || {}; window.__jmsX.x_manuel = openManual;
mPg.addEventListener("scroll", function(){ var imgs = mIn.children, mid = mPg.scrollTop + mPg.clientHeight / 2, n = 1; for(var i = 0; i < imgs.length; i++) if(imgs[i].offsetTop <= mid) n = i + 1; man.querySelector("#mCnt").textContent = n + " / " + PAGES; });
/* zoom a deux doigts */
var mpin = null;
mPg.addEventListener("touchstart", function(e){ if(e.touches.length === 2){ var a = e.touches[0], b = e.touches[1]; mpin = {d:Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z:zoomM}; } }, {passive:true});
mPg.addEventListener("touchmove", function(e){ if(mpin && e.touches.length === 2){ e.preventDefault(); var a = e.touches[0], b = e.touches[1]; setZoom(mpin.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(10, mpin.d), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2); } }, {passive:false});
mPg.addEventListener("touchend", function(e){ if(e.touches.length < 2) mpin = null; });
man.addEventListener("click", function(e){
  var b = e.target.closest("[data-m]"); if(!b) return; var m = b.dataset.m;
  if(m === "close") man.classList.remove("show");
  else if(m === "in") setZoom(zoomM * 1.5); else if(m === "out") setZoom(zoomM / 1.5);
  else if(m === "pdf") savePdf();
});
function savePdf(){
  var name = EN ? "JM_LAB_PRO_user_guide.pdf" : "JM_LAB_PRO_mode_emploi.pdf";
  fetch(PDF).then(function(r){ if(!r.ok) throw 0; return r.blob(); }).then(function(b){
    b = new Blob([b], {type:"application/pdf"});
    if(window.JMNative && window.__jmsSave){
      return window.__jmsSave(name, b).then(function(ok){ if(window.__jmsNote) window.__jmsNote(ok ? "✔ " + T("PDF enregistré dans Téléchargements / JM LAB PRO", "PDF saved in Downloads / JM LAB PRO") : "✖ " + T("Échec de l'enregistrement", "Save failed"), ok ? "ok" : "err", 6000); });
    }
    var u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }).catch(function(){ if(window.__jmsNote) window.__jmsNote("✖ " + T("PDF introuvable", "PDF not found"), "err", 5000); });
}

/* ---------- ACCUEIL (premier lancement) ---------- */
var STEPS = [
  ["📂", T("Ouvrez une photo", "Open a photo"), T("Touchez <b>OUVRIR IMAGE</b> en haut de l'écran. La photo s'affiche avec un curseur avant / après.", "Tap <b>OPEN IMAGE</b> at the top of the screen. The photo appears with a before / after slider.")],
  ["🎞️", T("Choisissez un rendu", "Choose a look"), T("Dans <b>PROFILS FILM</b>, touchez un profil. Affinez ensuite dans <b>RÉGLAGES</b> avec les curseurs. ↶ ↷ pour annuler / rétablir.", "In <b>FILM PROFILES</b>, tap a profile. Then fine-tune in <b>SETTINGS</b> with the sliders. ↶ ↷ to undo / redo.")],
  ["💾", T("Enregistrez", "Save"), T("<b>ENREGISTRER</b> pour une photo. Pour plusieurs photos d'un coup : <b>OUVRIR UN LOT</b>, puis <b>LANCER LA CORRECTION</b>.", "<b>SAVE</b> for one photo. For many photos at once: <b>OPEN A BATCH</b>, then <b>START EDITING</b>.") + "<br><br>" + T("📖 Le <b>mode d'emploi</b> complet est dans À propos (touchez le nom de l'appli dans le bandeau vert).", "📖 The full <b>user guide</b> is in About (tap the app name in the green banner).")]
];
var inv = document.createElement("div"); inv.id = "jmIn"; document.body.appendChild(inv);
var step = 0;
function draw(){
  var s = STEPS[step], last = step === STEPS.length - 1;
  inv.innerHTML = '<div class="abBox"><div class="inStep"><div class="e">' + s[0] + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></div>' +
    '<div class="inDots">' + STEPS.map(function(x, i){ return '<span class="' + (i === step ? "on" : "") + '"></span>'; }).join("") + '</div>' +
    '<button class="abBtn abG" data-a="next">' + (last ? T("C'EST PARTI !", "LET'S GO!") : T("SUIVANT ▶", "NEXT ▶")) + '</button>' +
    (last ? "" : '<button class="abBtn abC" data-a="skip">' + T("PASSER", "SKIP") + '</button>') + '</div>';
}
function finish(){ inv.classList.remove("show"); try{ localStorage.setItem("jms_intro", "1"); }catch(e){} }
inv.addEventListener("click", function(e){
  var b = e.target.closest("button"); if(!b) return;
  if(b.dataset.a === "skip") finish();
  else if(step < STEPS.length - 1){ step++; draw(); } else finish();
});
function intro(){ step = 0; draw(); inv.classList.add("show"); }
var seen = "1"; try{ seen = localStorage.getItem("jms_intro"); }catch(e){}
if(!seen) setTimeout(intro, 600);

/* bouton retour : ferme d'abord ces fenetres */
var oldBack = window.__jmsBack2;
window.__jmsBack2 = function(){
  if(man.classList.contains("show")){ man.classList.remove("show"); return true; }
  if(inv.classList.contains("show")){ finish(); return true; }
  if(ab.classList.contains("show")){ ab.classList.remove("show"); return true; }
  return oldBack ? oldBack() : false;
};
})();
