/* JM LAB PRO - photos HEIC et photos tres grandes : converties / reduites avant d'arriver dans l'appli */
(function(){
"use strict";
var NAT = window.JMNative || null;
var EN = window.__jmsLang === "en";
function T(fr, en){ return EN ? en : fr; }
function note(t, k, ms){ if(window.__jmsNote) window.__jmsNote(t, k || "info", ms || 4000); }

/* taille maximale selon la memoire du telephone */
var mem = navigator.deviceMemory || 4;
var LIMIT = mem >= 8 ? 50e6 : mem >= 4 ? 32e6 : 18e6;

function head(f, n){ return f.slice(0, n).arrayBuffer().then(function(b){ return new Uint8Array(b); }); }
function isHeic(f, b){
  if(/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)) return true;
  if(b.length < 12) return false;
  var ftyp = String.fromCharCode(b[4], b[5], b[6], b[7]), brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
  return ftyp === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand) && !/avif/.test(String.fromCharCode.apply(null, b.subarray(8, 40)));
}
/* dimensions sans decoder l'image (JPEG / PNG) */
function dims(b){
  if(b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return [(b[16]<<24|b[17]<<16|b[18]<<8|b[19]) >>> 0, (b[20]<<24|b[21]<<16|b[22]<<8|b[23]) >>> 0];
  if(b[0] !== 0xFF || b[1] !== 0xD8) return null;
  var i = 2;
  while(i + 9 < b.length){
    if(b[i] !== 0xFF){ i++; continue; }
    var m = b[i+1];
    if(m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)){ i += 2; continue; }
    var len = b[i+2] << 8 | b[i+3];
    if((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) || (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF)) return [b[i+7] << 8 | b[i+8], b[i+5] << 8 | b[i+6]];
    i += 2 + len;
  }
  return null;
}
function b64(f){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result).split(",")[1] || ""); }; r.onerror = rej; r.readAsDataURL(f); }); }
function fromB64(s, name){
  var bin = atob(s), u = new Uint8Array(bin.length); for(var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], name.replace(/\.[^.]*$/, "") + ".jpg", {type:"image/jpeg", lastModified:Date.now()});
}
/* secours sans Android (navigateur) : reduction par la page, sans EXIF */
async function shrinkWeb(f, w, h){
  var k = Math.sqrt(LIMIT / (w * h)), bmp = await createImageBitmap(f, {resizeWidth:Math.round(w * k), resizeHeight:Math.round(h * k), resizeQuality:"high"});
  var c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0);
  var bl = await new Promise(function(r){ c.toBlob(r, "image/jpeg", 0.95); });
  return new File([bl], f.name.replace(/\.[^.]*$/, "") + ".jpg", {type:"image/jpeg", lastModified:Date.now()});
}

async function fix(files){
  var out = [], heic = 0, big = 0, bad = 0;
  for(var i = 0; i < files.length; i++){
    var f = files[i], b = await head(f, 262144), h = isHeic(f, b), d = h ? null : dims(b);
    var tooBig = d && d[0] * d[1] > LIMIT;
    if(!h && !tooBig){ out.push(f); continue; }
    if(files.length > 1) note("⏳ " + T("Préparation des photos ", "Preparing photos ") + (i + 1) + " / " + files.length, "info", 2500);
    else note("⏳ " + (h ? T("Conversion de la photo HEIC…", "Converting the HEIC photo…") : T("Réduction de la très grande photo…", "Shrinking the very large photo…")), "info", 2500);
    await new Promise(function(r){ setTimeout(r, 30); });
    var nf = null;
    try{
      if(NAT && NAT.convertImage){ var r = NAT.convertImage(await b64(f), Math.round(LIMIT)); if(r) nf = fromB64(r, f.name); }
      else if(tooBig) nf = await shrinkWeb(f, d[0], d[1]);
    }catch(e){ nf = null; }
    if(nf){ out.push(nf); if(h) heic++; else big++; }
    else if(h){ bad++; }          /* HEIC illisible : on l'ecarte */
    else out.push(f);             /* trop grande mais pas reductible : on tente quand meme */
  }
  var msg = [];
  if(heic) msg.push("✔ " + heic + T(" photo(s) HEIC convertie(s) en JPEG", " HEIC photo(s) converted to JPEG"));
  if(big) msg.push("📐 " + big + T(" très grande(s) photo(s) réduite(s) à ", " very large photo(s) reduced to ") + Math.round(LIMIT / 1e6) + T(" Mpx pour éviter un plantage", " MP to avoid a crash"));
  if(bad) msg.push("✖ " + bad + T(" photo(s) HEIC illisible(s) sur ce téléphone (Android 9 ou plus requis)", " HEIC photo(s) unreadable on this phone (Android 9 or later needed)"));
  if(msg.length) note(msg.join("\n"), bad ? "err" : "ok", 6000);
  return out;
}

var pass = false;
window.addEventListener("change", function(e){
  var t = e.target;
  if(pass || !t || t.type !== "file" || !t.files || !t.files.length) return;
  if(!/image/.test(t.accept || "image") ) return;
  e.stopImmediatePropagation();
  var files = Array.prototype.slice.call(t.files);
  fix(files).then(function(list){
    if(!list.length){ t.value = ""; return; }
    if(list.some(function(f, i){ return f !== files[i]; }) || list.length !== files.length){
      var dt = new DataTransfer(); list.forEach(function(f){ dt.items.add(f); }); t.files = dt.files;
    }
    pass = true;
    try{ t.dispatchEvent(new Event("change", {bubbles:true})); } finally { pass = false; }
  });
}, true);
})();
