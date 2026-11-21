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
// reconnaissance des personnes (face-api, modele inclus dans le paquet)
const FA = path.join(R, 'node_modules', '@vladmandic', 'face-api');
fs.mkdirSync(path.join(V, 'faceapi'), {recursive: true});
fs.copyFileSync(path.join(FA, 'dist', 'face-api.js'), path.join(V, 'faceapi', 'face-api.js'));
for (const f of ['face_recognition_model-weights_manifest.json', 'face_recognition_model.bin']) fs.copyFileSync(path.join(FA, 'model', f), path.join(V, 'faceapi', f));
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
// separation personne / fond (peau du visage, peau du corps, cheveux, vetements, fond) pour la retouche portrait
const SEG = path.join(V, 'selfie_multiclass.tflite');
if (fs.existsSync(SEG) && fs.statSync(SEG).size > 1e6) console.log('modele separation deja present');
else get('https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite', SEG, 0);
require('./jmlab_core.js');
