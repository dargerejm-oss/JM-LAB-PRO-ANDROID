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
const out = '/* genere par tools/jmlab_core.js depuis JM LAB PRO (index.html, jmwork.js, jmfx2.js) : ne pas modifier a la main */\n' +
  'var JMRUN = (function () {\n' + core + '\n' + lit('HEAD') + lit('LOOP') + '}}\nreturn run;\n})();\n' + heal;
fs.mkdirSync(path.join(__dirname, '..', 'renderer', 'vendor'), {recursive: true});
fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'vendor', 'jmlab_core.js'), out);
console.log('moteur JM LAB PRO :', out.length, 'caracteres (rendu + correcteur)');
