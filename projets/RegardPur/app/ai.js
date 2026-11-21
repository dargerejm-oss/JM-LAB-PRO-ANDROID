// Regard Pur - IA locale (aucune connexion) : NAFNet (deflouter, MIT) et Real-ESRGAN (restaurer / agrandir, BSD-3)
// L'image est traitee par morceaux qui se chevauchent, puis recollee. Carte graphique (DirectML) si possible, sinon processeur.
const path = require('path'), fs = require('fs');
let ort = null, DIR = null;
const S = {}, FILES = {naf: 'deblurring_nafnet.onnx', esr: 'realesr-general-x4v3.onnx', esrd: 'realesr-general-wdn-x4v3.onnx'};
// NAFNet : morceaux de 512 (384 minimum), multiples de 16 (4 reductions) ; ordre des couleurs BGR (modele OpenCV)
// Real-ESRGAN : morceaux de 192, sortie x4
const CFG = {naf: {tile: 512, ov: 32, scale: 1, mult: 16, min: 384, bgr: true}, esr: {tile: 192, ov: 12, scale: 4, mult: 1, min: 0, bgr: false}, esrd: {tile: 192, ov: 12, scale: 4, mult: 1, min: 0, bgr: false}};

function init(app) {
  DIR = app.isPackaged ? path.join(process.resourcesPath, 'modeles') : path.join(__dirname, 'modeles');
}
function available() { return !!DIR && Object.values(FILES).every(f => fs.existsSync(path.join(DIR, f))); }
async function session(m) {
  if (S[m]) return S[m];
  if (!ort) ort = require('onnxruntime-node');
  const file = path.join(DIR, FILES[m]), base = {graphOptimizationLevel: 'all', logSeverityLevel: 3};
  let s = null, ep = 'processeur';
  if (process.platform === 'win32') { try { s = await ort.InferenceSession.create(file, {...base, executionProviders: ['dml', 'cpu']}); ep = 'carte graphique'; } catch (e) { s = null; } }
  if (!s) s = await ort.InferenceSession.create(file, {...base, executionProviders: ['cpu']});
  return (S[m] = {s, ep});
}
function refl(i, n) { if (n === 1) return 0; const p = 2 * (n - 1); i = ((i % p) + p) % p; return i < n ? i : p - i; }

// rgba : Uint8Array (w*h*4). Resultat : Uint8Array (tw*th*4), la sortie du modele est moyennee par cases vers la taille voulue.
async function run(m, rgba, w, h, tw, th, prog) {
  const C = CFG[m], {s, ep} = await session(m), sc = C.scale, T = C.tile, O = C.ov;
  const acc = new Float32Array(tw * th * 3), cnt = new Float32Array(tw * th), fx = tw / (w * sc), fy = th / (h * sc);
  const nx = Math.max(1, Math.ceil(w / T)), ny = Math.max(1, Math.ceil(h / T)), tot = nx * ny; let done = 0;
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
    const x0 = tx * T, y0 = ty * T, x1 = Math.min(w, x0 + T), y1 = Math.min(h, y0 + T);
    // morceau avec marge (reflet aux bords), arrondi au multiple demande par le modele
    let ix0 = x0 - O, iy0 = y0 - O, iw = (x1 - x0) + 2 * O, ih = (y1 - y0) + 2 * O;
    iw = Math.ceil(Math.max(iw, C.min) / C.mult) * C.mult; ih = Math.ceil(Math.max(ih, C.min) / C.mult) * C.mult; // NAFNet (OpenCV) : 384 px minimum
    const n = iw * ih, inp = new Float32Array(3 * n);
    for (let y = 0; y < ih; y++) { const sy = refl(iy0 + y, h); for (let x = 0; x < iw; x++) {
      const k = (sy * w + refl(ix0 + x, w)) * 4, o = y * iw + x;
      if (C.bgr) { inp[o] = rgba[k + 2] / 255; inp[n + o] = rgba[k + 1] / 255; inp[2 * n + o] = rgba[k] / 255; }
      else { inp[o] = rgba[k] / 255; inp[n + o] = rgba[k + 1] / 255; inp[2 * n + o] = rgba[k + 2] / 255; }
    } }
    const r = await s.run({[s.inputNames[0]]: new ort.Tensor('float32', inp, [1, 3, ih, iw])}), out = r[s.outputNames[0]].data;
    const ow = iw * sc, on = ow * ih * sc, cR = C.bgr ? 2 : 0, cB = C.bgr ? 0 : 2;
    // on ne garde que le coeur du morceau (sans la marge) et on le range dans l'image finale
    for (let y = y0 * sc; y < y1 * sc; y++) { const ly = y - iy0 * sc, dy = Math.min(th - 1, Math.floor(y * fy)); for (let x = x0 * sc; x < x1 * sc; x++) {
      const lx = x - ix0 * sc, q = ly * ow + lx, d = dy * tw + Math.min(tw - 1, Math.floor(x * fx));
      acc[d * 3] += out[cR * on + q]; acc[d * 3 + 1] += out[on + q]; acc[d * 3 + 2] += out[cB * on + q]; cnt[d]++;
    } }
    done++; if (prog) prog(done / tot, ep);
  }
  const res = new Uint8Array(tw * th * 4);
  for (let i = 0; i < tw * th; i++) { const c = cnt[i] || 1; res[i * 4] = Math.max(0, Math.min(255, Math.round(acc[i * 3] / c * 255))); res[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(acc[i * 3 + 1] / c * 255))); res[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(acc[i * 3 + 2] / c * 255))); res[i * 4 + 3] = 255; }
  return res;
}
module.exports = {init, available, run};
