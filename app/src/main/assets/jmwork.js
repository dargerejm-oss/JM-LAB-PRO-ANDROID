/* JM LAB PRO - calcul des photos du lot en arriere-plan, en parallele (Web Workers).
   La boucle ci-dessous est la copie exacte de celle du lot (index.html), avec le decalage de bande Y0 pour la vignette.
   Si les workers ne marchent pas, le calcul se fait comme avant, directement dans la page. */
(function(){
"use strict";
var LOOP = "let z=ke[U],g=ke[U+1],k=ke[U+2];z*=fe,g*=fe,k*=fe,z=(z-128)*le+128,g=(g-128)*le+128,k=(k-128)*le+128;let M=0.2126*z+0.7152*g+0.0722*k;if(M>185&&I<0){let b=(M-185)/70,ae=Math.max(0.35,1+I*b*1.2),kn=0.299*z+0.587*g+0.114*k,en=235;if(z=z*ae+235*(1-ae)*0.15+kn*(1-ae)*0.1,g=g*ae+235*(1-ae)*0.15+kn*(1-ae)*0.1,k=k*ae+235*(1-ae)*0.15+kn*(1-ae)*0.1,z>235)z=235+(z-235)*0.25;if(g>235)g=235+(g-235)*0.25;if(k>235)k=235+(k-235)*0.25}if(M<85&&O>0){let b=1-M/85,ae=O*65*b;z+=ae,g+=ae,k+=ae}if(z+=Qe,k-=Qe,c>=0)g+=se,z-=se*0.45,k-=se*0.45;else{let b=-se;z+=b*0.45,k+=b*0.45,g-=b}if(R!==0){let b=Math.max(z,g,k),ae=Math.min(z,g,k),kn=b===0?0:(b-ae)/b,en=0.299*z+0.587*g+0.114*k,j=1+R*(1-kn)*1.4;if(R<0)j=1+R*0.8;z=en+(z-en)*j,g=en+(g-en)*j,k=en+(k-en)*j}if(On!==1){let b=0.299*z+0.587*g+0.114*k;z=b+(z-b)*On,g=b+(g-b)*On,k=b+(k-b)*On}if(He!==0){let b=0.299*z+0.587*g+0.114*k;z=z+(z-b)*He*0.7,g=g+(g-b)*He*0.7,k=k+(k-b)*He*0.7}if(Zb!==0){let bp3=Zb*50;z=(z-bp3)*255/(255-bp3),g=(g-bp3)*255/(255-bp3),k=(k-bp3)*255/(255-bp3)}if(Zw!==0){let wp3=255-Zw*50;z=z*255/wp3,g=g*255/wp3,k=k*255/wp3}if(Zd!==0){let dc3=1+Zd*0.6;z=(z-128)*dc3+128,g=(g-128)*dc3+128,k=(k-128)*dc3+128;let lmD3=0.299*z+0.587*g+0.114*k,dsD3=1+Math.abs(Zd)*0.3;z=lmD3+(z-lmD3)*dsD3,g=lmD3+(g-lmD3)*dsD3,k=lmD3+(k-lmD3)*dsD3}if(Zv!==0){let pxV3=(U/4)%cw3,pyV3=Math.floor((U/4)/cw3)+Y0,dV3=Math.sqrt((pxV3-cx3)*(pxV3-cx3)+(pyV3-cy3)*(pyV3-cy3))/maxD3,vigF3=1-Zv*0.6*dV3*dV3;z*=vigF3,g*=vigF3,k*=vigF3}let qt=Xi(z,g,k,In),Jr=(In===\"Acros\"||In===\"Acros+R\")?(()=>{let lm=0.299*z+0.587*g+0.114*k;return{r:lm,g:lm,b:lm}})():{r:z,g,b:k};z=Jr.r*(1-Z*0.95)+qt.r*Z*0.95,g=Jr.g*(1-Z*0.95)+qt.g*Z*0.95,k=Jr.b*(1-Z*0.95)+qt.b*Z*0.95,ke[U]=fn(z,0,255),ke[U+1]=fn(g,0,255),ke[U+2]=fn(k,0,255)";
var HEAD = "function run(P){var ke=P.px,fe=P.fe,le=P.le,Qe=P.Qe,se=P.se,c=P.c,I=P.I,O=P.O,R=P.R,On=P.On,He=P.He,Zb=P.Zb,Zw=P.Zw,Zd=P.Zd,Zv=P.Zv,In=P.In,Z=P.Z,cw3=P.w,ch3=P.h,cx3=cw3/2,cy3=ch3/2,maxD3=Math.sqrt(cx3*cx3+cy3*cy3),Y0=P.y0;for(let U=0;U<ke.length;U+=4){";
function code(){ return (window.__jmsXiSrc || "") + "\n" + HEAD + LOOP + "}}\n"; }
var inline = null, pool = null, mode = "";
function getInline(){ if(!inline) inline = new Function(code() + "return run;")(); return inline; }
var N = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
function makePool(){
  if(pool) return pool;
  var url = URL.createObjectURL(new Blob([code() + "onmessage=function(e){var P=e.data;run(P);postMessage({px:P.px,y0:P.y0,id:P.id},[P.px.buffer]);};"], {type:"text/javascript"}));
  pool = []; for(var i = 0; i < N; i++) pool.push(new Worker(url));
  return pool;
}
function job(wk, P){
  return new Promise(function(res, rej){
    var t = setTimeout(function(){ rej(new Error("timeout")); }, 120000);
    wk.onmessage = function(e){ clearTimeout(t); res(e.data); };
    wk.onerror = function(e){ clearTimeout(t); rej(e); };
    wk.postMessage(P, [P.px.buffer]);
  });
}
/* test une fois : les workers donnent-ils exactement le meme resultat que la page ? */
async function check(base){
  if(mode) return mode;
  try{
    var px = new Uint8ClampedArray(64 * 4); for(var i = 0; i < px.length; i++) px[i] = (i * 37) % 256;
    var a = Object.assign({}, base, {px:new Uint8ClampedArray(px), w:8, h:8, y0:0}), b = Object.assign({}, base, {px:new Uint8ClampedArray(px), w:8, h:8, y0:0, id:-1});
    getInline()(a);
    var r = await job(makePool()[0], b);
    mode = r.px.every(function(v, i){ return v === a.px[i]; }) ? "worker" : "inline";
  }catch(e){ mode = "inline"; }
  return mode;
}
window.__jmsPixMode = function(){ return mode || "?"; };
window.__jmsPix = async function(img, P){
  var w = img.width, h = img.height, base = {fe:P.fe, le:P.le, Qe:P.Qe, se:P.se, c:P.c, I:P.I, O:P.O, R:P.R, On:P.On, He:P.He, Zb:P.Zb, Zw:P.Zw, Zd:P.Zd, Zv:P.Zv, In:P.In, Z:P.Z, w:w, h:h};
  var m = (window.Worker && window.__jmsXiSrc) ? await check(base) : "inline";
  if(m !== "worker"){ var o = Object.assign({}, base, {px:img.data, y0:0}); getInline()(o); return [{d:img, y:0}]; }
  var n = Math.min(N, h), rows = Math.ceil(h / n), jobs = [], ws = makePool(), src = img.data;
  for(var k = 0; k < n; k++){
    var y0 = k * rows, y1 = Math.min(h, y0 + rows); if(y1 <= y0) break;
    jobs.push(Object.assign({}, base, {px:src.slice(y0 * w * 4, y1 * w * 4), y0:y0, id:k}));
  }
  img = null; src = null;
  var out = await Promise.all(jobs.map(function(P, k){ return job(ws[k], P); }));
  return out.map(function(r){ return {d:new ImageData(r.px, w, r.px.length / 4 / w), y:r.y0}; });
};
})();
