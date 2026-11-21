// Recupere le moteur de rendu de JM LAB PRO (profils, ProLab, curseurs) directement dans le code de l'appli Android,
// pour que Regard Pur donne exactement le meme rendu. Ecrit renderer/vendor/jmlab_core.js.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'main', 'assets');
const html = fs.readFileSync(path.join(A, 'index.html'), 'utf8');
const start = html.indexOf('function fn(e,n,t)');
const xi = html.indexOf('function Xi(', start);
if (start < 0 || xi < 0) throw new Error('moteur JM LAB PRO introuvable');
// fin de la fonction Xi : accolades equilibrees
let i = html.indexOf('{', xi), d = 0;
for (; i < html.length; i++) { const c = html[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { i++; break; } } }
const core = html.slice(start, i);
const work = fs.readFileSync(path.join(A, 'jmwork.js'), 'utf8');
const lit = (name) => { const m = work.match(new RegExp('var ' + name + ' = ("(?:[^"\\\\]|\\\\.)*");')); if (!m) throw new Error(name + ' introuvable'); return JSON.parse(m[1]); };
const out = '/* genere par tools/jmlab_core.js depuis JM LAB PRO (index.html + jmwork.js) : ne pas modifier a la main */\n' +
  'var JMRUN = (function () {\n' + core + '\n' + lit('HEAD') + lit('LOOP') + '}}\nreturn run;\n})();\n';
fs.mkdirSync(path.join(__dirname, '..', 'renderer', 'vendor'), {recursive: true});
fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'vendor', 'jmlab_core.js'), out);
console.log('moteur JM LAB PRO :', out.length, 'caracteres');
