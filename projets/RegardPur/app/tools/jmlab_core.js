// Recupere dans le code de l'appli JM LAB PRO (Android) :
//  - le moteur de rendu (profils, ProLab, curseurs) : index.html + jmwork.js
//  - le correcteur (remplissage selon le contenu, PatchMatch) : jmfx2.js
// pour que Regard Pur donne exactement le meme resultat. Ecrit renderer/vendor/jmlab_core.js.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'main', 'assets');
const html = fs.readFileSync(path.join(A, 'index.html'), 'utf8');
const start = html.indexOf('function fn(e,n,t)');
const xi = html.indexOf('function Xi(', start);
if (start < 0 || xi < 0) throw new Error('moteur JM LAB PRO introuvable');
let i = html.indexOf('{', xi), d = 0;
for (; i < html.length; i++) { const c = html[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { i++; break; } } }
const core = html.slice(start, i);
const work = fs.readFileSync(path.join(A, 'jmwork.js'), 'utf8');
const lit = (name) => { const m = work.match(new RegExp('var ' + name + ' = ("(?:[^"\\\\]|\\\\.)*");')); if (!m) throw new Error(name + ' introuvable'); return JSON.parse(m[1]); };
const fx2 = fs.readFileSync(path.join(A, 'jmfx2.js'), 'utf8');
const h0 = fx2.indexOf('function rng(seed)'), h1 = fx2.indexOf('function healAll(c, list)');
if (h0 < 0 || h1 < 0) throw new Error('correcteur JM LAB PRO introuvable');
const heal = 'var JMHEAL = (function () {\nfunction cvs(w, h) { return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }\n' +
  fx2.slice(h0, fx2.indexOf('\n', h1)) + '\nreturn healAll;\n})();\n';
// outils creatifs : details, theatral, eclat glamour, balance des blancs, contraste des tons, HDR (+ courbes RVB)
const l0 = fx2.indexOf('var LD = {'), hx = fx2.indexOf('function hdrApply(');
if (l0 < 0 || hx < 0) throw new Error('outils JM LAB PRO introuvables');
let k2 = fx2.indexOf('{', hx), d2 = 0; for (; k2 < fx2.length; k2++) { const ch = fx2[k2]; if (ch === '{') d2++; else if (ch === '}') { d2--; if (d2 === 0) { k2++; break; } } }
const c0 = fx2.indexOf('function lut(pts)'), c1 = fx2.indexOf('/* ---------- rotation / recadrage');
const looks = 'var JMLOOKS = (function () {\nfunction cvs(w, h) { return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }\n' +
  fx2.slice(c0, c1) + '\n' + fx2.slice(l0, k2) + '\nreturn {looks: looks, lookOn: lookOn, applyCurves: applyCurves, wbFromColor: wbFromColor};\n})();\n';
const out = '/* genere par tools/jmlab_core.js depuis JM LAB PRO (index.html, jmwork.js, jmfx2.js) : ne pas modifier a la main */\n' +
  'var JMRUN = (function () {\n' + core + '\n' + lit('HEAD') + lit('LOOP') + '}}\nreturn run;\n})();\n' + heal + looks;
fs.mkdirSync(path.join(__dirname, '..', 'renderer', 'vendor'), {recursive: true});
fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'vendor', 'jmlab_core.js'), out);
console.log('moteur JM LAB PRO :', out.length, 'caracteres (rendu + correcteur)');
