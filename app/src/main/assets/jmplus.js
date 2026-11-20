/* JM LAB PRO - histogramme sur l'apercu (toucher pour reduire / agrandir) */
(function(){
"use strict";
var W = 132, H = 54;
var css = document.createElement("style");
css.textContent =
"#jxHist{position:fixed;z-index:1400;width:" + W + "px;height:" + H + "px;border-radius:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.35);display:none;box-shadow:0 2px 6px #0008}" +
"#jxHist.min{width:36px;height:36px;border-radius:50%}" +
"#jxHistB{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:18px}#jxHist.min #jxHistB{display:flex}#jxHist.min canvas{display:none}";
document.head.appendChild(css);
var box = document.createElement("div"); box.id = "jxHist";
box.innerHTML = '<canvas width="' + W * 2 + '" height="' + H * 2 + '" style="width:100%;height:100%;display:block"></canvas><div id="jxHistB">📊</div>';
document.body.appendChild(box);
var cv = box.querySelector("canvas"), cx = cv.getContext("2d");
try{ if(localStorage.getItem("jms_hist") === "min") box.classList.add("min"); }catch(e){}
box.onclick = function(){ box.classList.toggle("min"); try{ localStorage.setItem("jms_hist", box.classList.contains("min") ? "min" : "on"); }catch(e){} last = ""; };

var small = document.createElement("canvas"), sx = small.getContext("2d", {willReadFrequently:true}), last = "";
function draw(src){
  var r = Math.min(1, 220 / Math.max(src.width, src.height));
  small.width = Math.max(1, Math.round(src.width * r)); small.height = Math.max(1, Math.round(src.height * r));
  sx.drawImage(src, 0, 0, small.width, small.height);
  var img = window.__jmsCrop ? window.__jmsCrop(small) : small;
  var d = (img === small ? sx : img.getContext("2d")).getImageData(0, 0, img.width, img.height).data;
  var L = new Uint32Array(64), R = new Uint32Array(64), G = new Uint32Array(64), B = new Uint32Array(64);
  for(var i = 0; i < d.length; i += 4){
    R[d[i] >> 2]++; G[d[i+1] >> 2]++; B[d[i+2] >> 2]++;
    L[Math.min(63, (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]) / 4 | 0)]++;
  }
  var mx = 1; for(var k = 1; k < 63; k++) mx = Math.max(mx, L[k], R[k], G[k], B[k]);
  var w = cv.width, h = cv.height, bw = w / 64;
  cx.clearRect(0, 0, w, h);
  cx.fillStyle = "rgba(255,255,255,.55)";
  for(var j = 0; j < 64; j++){ var y = Math.min(h, L[j] / mx * h); cx.fillRect(j * bw, h - y, bw + 0.5, y); }
  [[R, "rgba(255,70,70,.9)"], [G, "rgba(80,220,80,.9)"], [B, "rgba(80,140,255,.9)"]].forEach(function(c){
    cx.strokeStyle = c[1]; cx.lineWidth = 2; cx.beginPath();
    for(var j = 0; j < 64; j++){ var y = h - Math.min(h, c[0][j] / mx * h); if(j) cx.lineTo(j * bw + bw / 2, y); else cx.moveTo(bw / 2, y); }
    cx.stroke();
  });
  /* zones bouchees / brulees */
  cx.fillStyle = L[0] / (d.length / 4) > 0.02 ? "#2196F3" : "transparent"; cx.fillRect(0, 0, 6, 6);
  cx.fillStyle = L[63] / (d.length / 4) > 0.02 ? "#F44336" : "transparent"; cx.fillRect(w - 6, 0, 6, 6);
}
function sig(c){ try{ var t = document.createElement("canvas"); t.width = t.height = 8; t.getContext("2d").drawImage(c, 0, 0, 8, 8); return c.width + "x" + c.height + ":" + Array.prototype.join.call(t.getContext("2d").getImageData(0, 0, 8, 8).data, ","); }catch(e){ return ""; } }
setInterval(function(){
  var f = document.querySelector(".fixed-top"), r = f && f.getBoundingClientRect(), c = document.getElementById("filteredCanvas");
  var tab = document.body.dataset.tab, has = c && c.style.display !== "none" && c.width > 0;
  var on = has && r && r.height > 60 && (tab === "reg" || tab === "fuji") && !document.querySelector(".jmsOvl.show, #jmsOv.show, #jmsHub.show, #jmAb.show, #jmIn.show, #jmv.show");
  box.style.display = on ? "block" : "none";
  if(!on) return;
  box.style.left = (r.left + 10) + "px"; box.style.top = (r.bottom - (box.classList.contains("min") ? 46 : H + 10)) + "px";
  if(box.classList.contains("min")) return;
  var s = sig(c); if(s && s !== last){ last = s; try{ draw(c); }catch(e){} }
}, 500);
})();
