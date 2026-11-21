// Copie les briques externes dans renderer/vendor (fait automatiquement avant la construction).
const fs = require('fs'), path = require('path'), https = require('https');
const R = path.join(__dirname, '..'), V = path.join(R, 'renderer', 'vendor');
const MP = path.join(R, 'node_modules', '@mediapipe', 'tasks-vision');
fs.mkdirSync(path.join(V, 'wasm'), {recursive: true});
fs.copyFileSync(path.join(MP, 'vision_bundle.cjs'), path.join(V, 'vision_bundle.js'));
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'])
  fs.copyFileSync(path.join(MP, 'wasm', f), path.join(V, 'wasm', f));
fs.copyFileSync(path.join(R, 'node_modules', 'libheif-js', 'libheif-wasm', 'libheif-bundle.js'), path.join(V, 'libheif-bundle.js'));
fs.copyFileSync(path.join(R, 'node_modules', 'exifr', 'dist', 'full.umd.js'), path.join(V, 'exifr.js'));
const MODEL = path.join(V, 'face_landmarker.task');
const URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
function get(u, out, n) {
  https.get(u, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && n < 5) return get(res.headers.location, out, n + 1);
    if (res.statusCode !== 200) { console.error('modele visages : erreur', res.statusCode); process.exit(1); }
    const f = fs.createWriteStream(out); res.pipe(f); f.on('finish', () => { f.close(); console.log('modele visages :', fs.statSync(out).size, 'octets'); });
  }).on('error', e => { console.error('modele visages :', e.message); process.exit(1); });
}
if (fs.existsSync(MODEL) && fs.statSync(MODEL).size > 1e6) console.log('modele visages deja present');
else get(URL, MODEL, 0);
