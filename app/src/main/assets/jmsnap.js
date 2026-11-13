/* JM LAB PRO - lecture / creation de QR Snapseed (https://snapseed.com/qr?l=<gzip+protobuf>&m=<nom>) */
(function(){
"use strict";
function b64u(s){ s = s.replace(/\.+$/,"").replace(/-/g,"+").replace(/_/g,"/"); while(s.length % 4) s += "="; var bin = atob(s), u = new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u; }
function toB64u(u){ var s = ""; for(var i=0;i<u.length;i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function pipe(bytes, S){ var w = S.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(S.readable).arrayBuffer()); }
function rv(b,i){ var r = 0, m = 1, c; do{ c = b[i++]; r += (c & 127) * m; m *= 128; }while(c & 128); return [r, i]; }
function parse(b){
  var out = [], i = 0;
  while(i < b.length){
    var t = rv(b,i); i = t[1]; var f = Math.floor(t[0]/8), w = t[0] & 7, v;
    if(w === 0){ var x = rv(b,i); i = x[1]; v = x[0]; }
    else if(w === 5){ v = new DataView(b.buffer, b.byteOffset + i, 4).getFloat32(0, true); i += 4; }
    else if(w === 1){ i += 8; continue; }
    else if(w === 2){ var n = rv(b,i); i = n[1]; v = b.subarray(i, i + n[0]); i += n[0]; }
    else break;
    out.push({f:f, w:w, v:v});
  }
  return out;
}
function floats(msg){ var o = {}; parse(msg).forEach(function(e){ if(e.w === 5) o[e.f] = e.v; }); return o; }
function walk(b, filters){
  parse(b).forEach(function(e){
    if(e.f === 4 && e.w === 2){
      parse(e.v).forEach(function(s){ if(s.f === 2 && s.w === 2) parse(s.v).forEach(function(k){ if(k.w === 2) filters.push({id:k.f, p:floats(k.v), raw:k.v}); }); });
    }
  });
}
var N = function(x){ return x === undefined ? 0 : x; };
function clamp(v, a, c){ return Math.max(a, Math.min(c, v)); }
function r1(v){ return Math.round(v*10)/10; }
/* filtre 34 = "Reglages de l'image" ; filtre 5 = vignettage ; autres = ignores */
function toValues(filters){
  var v = {}, ign = [], seen = {};
  filters.forEach(function(f){
    var key = f.id + ":" + Array.prototype.join.call(f.raw, ",");
    if(seen[key]) return; seen[key] = 1;
    var p = f.p;
    if(f.id === 34){
      v.Exposition = r1((v.Exposition||0) + N(p[1])*2);
      v.Contraste = Math.round((v.Contraste||0) + N(p[2])*100);
      v.Saturation = Math.round((v.Saturation||0) + N(p[3])*100);
      v.Clarte = Math.round((v.Clarte||0) + N(p[4])*60);
      v.Vibrance = Math.round((v.Vibrance||0) + N(p[4])*40);
      v["Hautes SANS GRIS"] = Math.round((v["Hautes SANS GRIS"]||0) + Math.min(0, N(p[5])*100));
      v.Ombres = Math.round((v.Ombres||0) + N(p[6])*100);
      v.Temperature = Math.round((v.Temperature||0) + N(p[7])*100);
    } else if(f.id === 5){
      v.Vignette = Math.round(N(p[4])*100);
    } else ign.push(f.id);
  });
  var out = {};
  Object.keys(v).forEach(function(k){ var r = k === "Exposition" ? [-5,5] : k === "Hautes SANS GRIS" ? [-100,0] : k === "Ombres" ? [0,100] : [-100,100]; var x = clamp(v[k], r[0], r[1]); if(x !== 0) out[k] = x; });
  return {values:out, ignored:ign};
}
async function decode(url){
  var l = (url.match(/[?&]l=([^&]+)/) || [])[1], m = (url.match(/[?&]m=([^&]+)/) || [])[1], name = "Snapseed";
  if(!l) throw new Error("pas de style dans ce lien");
  var raw = await pipe(b64u(l), new DecompressionStream("gzip")), filters = []; walk(raw, filters);
  if(m){ try{ var mm = await pipe(b64u(m), new DecompressionStream("gzip")), q = parse(mm).filter(function(e){ return e.f === 2 && e.w === 2; })[0]; if(q) name = new TextDecoder().decode(q.v); }catch(e){} }
  var r = toValues(filters); r.name = name; r.nFilters = filters.length; return r;
}
function wvar(n){ var o = []; while(n > 127){ o.push((n % 128) | 128); n = Math.floor(n/128); } o.push(n); return o; }
function wfloat(f, x){ var b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, true); return [(f<<3)|5].concat(Array.prototype.slice.call(b)); }
function wmsg(f, body){ return wvar((f<<3)|2).concat(wvar(body.length), body); }
async function encode(values, name){
  var V = values || {}, inv = function(k, d){ return V[k] !== undefined ? V[k]/d : 0; };
  var tune = [].concat(
    wfloat(1, clamp(inv("Exposition", 2), -1, 1)), wfloat(2, clamp(inv("Contraste", 100), -1, 1)), wfloat(3, clamp(inv("Saturation", 100), -1, 1)),
    wfloat(4, clamp(inv("Clarte", 60), -1, 1)), wfloat(5, clamp(inv("Hautes SANS GRIS", 100), -1, 0)), wfloat(6, clamp(inv("Ombres", 100), 0, 1)), wfloat(7, clamp(inv("Temperature", 100), -1, 1)));
  var body = [8, 0].concat(wmsg(4, wmsg(2, wmsg(34, tune))));
  var l = await pipe(new Uint8Array(body), new CompressionStream("gzip")), nm = new TextEncoder().encode(name || "JM LAB");
  var m = await pipe(new Uint8Array(wmsg(2, Array.prototype.slice.call(nm))), new CompressionStream("gzip"));
  return "https://snapseed.com/qr?l=" + toB64u(l) + "." + "&m=" + toB64u(m);
}
window.__jmsSnap = {decode:decode, encode:encode};
})();
