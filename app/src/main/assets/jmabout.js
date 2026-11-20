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
 '<button class="abBtn abI" data-a="insta">📷 ' + T("MON INSTAGRAM", "MY INSTAGRAM") + '</button>' +
 '<div class="abSec"><b>🔒 ' + T("Confidentialité", "Privacy") + '</b><br>' + T(
   "JM LAB PRO ne collecte aucune donnée personnelle. Vos photos sont traitées uniquement sur votre téléphone et ne sont jamais envoyées sur Internet. Pas de compte, pas de publicité, pas de statistiques. La caméra sert seulement à scanner des QR codes de styles, et l'image n'est pas conservée. Les réglages et styles restent dans l'appli ; les photos sont enregistrées dans le dossier que vous choisissez.",
   "JM LAB PRO collects no personal data. Your photos are processed only on your phone and are never sent over the Internet. No account, no ads, no analytics. The camera is only used to scan style QR codes, and the image is not kept. Settings and styles stay in the app; photos are saved in the folder you choose.") + '</div>' +
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
  else if(a === "fr" || a === "en"){ if((a === "en") !== EN && window.__jmsSetLang) window.__jmsSetLang(a); }
  else if(a === "intro"){ ab.classList.remove("show"); intro(); }
});
window.__jmsAbout = function(){ ab.classList.add("show"); };
/* le nom de l'appli dans le bandeau vert ouvre A PROPOS */
document.addEventListener("click", function(e){
  var t = e.target.closest && e.target.closest(".scroll-content>div:first-child>div:first-child>div");
  if(t) window.__jmsAbout();
}, true);

/* ---------- ACCUEIL (premier lancement) ---------- */
var STEPS = [
  ["📂", T("Ouvrez une photo", "Open a photo"), T("Touchez <b>OUVRIR IMAGE</b> en haut de l'écran. La photo s'affiche avec un curseur avant / après.", "Tap <b>OPEN IMAGE</b> at the top of the screen. The photo appears with a before / after slider.")],
  ["🎞️", T("Choisissez un rendu", "Choose a look"), T("Dans <b>PROFILS FILM</b>, touchez un profil. Affinez ensuite dans <b>RÉGLAGES</b> avec les curseurs. ↶ ↷ pour annuler / rétablir.", "In <b>FILM PROFILES</b>, tap a profile. Then fine-tune in <b>SETTINGS</b> with the sliders. ↶ ↷ to undo / redo.")],
  ["💾", T("Enregistrez", "Save"), T("<b>ENREGISTRER</b> pour une photo. Pour plusieurs photos d'un coup : <b>OUVRIR UN LOT</b>, puis <b>LANCER LA CORRECTION</b>.", "<b>SAVE</b> for one photo. For many photos at once: <b>OPEN A BATCH</b>, then <b>START EDITING</b>.")]
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
  if(inv.classList.contains("show")){ finish(); return true; }
  if(ab.classList.contains("show")){ ab.classList.remove("show"); return true; }
  return oldBack ? oldBack() : false;
};
})();
