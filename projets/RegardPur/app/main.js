// Regard Pur - partie PC (fenetre, acces aux dossiers et aux fichiers)
const {app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol} = require('electron');
const fs = require('fs'), fsp = fs.promises, path = require('path'), AI = require('./ai');

const HEIC = new Set(['.heic', '.heif', '.hif']);
const IMG = new Set(['.heic', '.heif', '.hif', '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const RAW = new Set(['.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.rw2', '.pef', '.dng', '.srw', '.x3f', '.3fr', '.iiq', '.rwl', '.mrw', '.kdc', '.erf']);
let win;
// les pages de l'appli sont servies par une adresse interne (app://rp/...) : le module visages peut ainsi charger ses fichiers
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.json': 'application/json'};
protocol.registerSchemesAsPrivileged([{scheme: 'app', privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true}}]);

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 950, minWidth: 1000, minHeight: 640, backgroundColor: '#0d0f12', title: 'Regard Pur',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false}
  });
  Menu.setApplicationMenu(null);
  win.maximize();
  win.loadURL('app://rp/index.html');
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F12') win.webContents.toggleDevTools(); });
}
app.whenReady().then(() => {
  AI.init(app);
  const ROOT = path.join(__dirname, 'renderer');
  protocol.handle('app', async (req) => {
    const u = new URL(req.url), f = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    if (!f.startsWith(ROOT)) return new Response('interdit', {status: 403});
    try { const b = await fsp.readFile(f); return new Response(b, {headers: {'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'}}); }
    catch (e) { return new Response('introuvable', {status: 404}); }
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());

async function walk(dir, out, depth) {
  let ents; try { ents = await fsp.readdir(dir, {withFileTypes: true}); } catch (e) { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === '_REGARD_PUR_EXPORT') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 6 && !fs.existsSync(path.join(p, '.regardpur-export'))) await walk(p, out, depth + 1); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (!IMG.has(ext) && !RAW.has(ext)) continue;
    let st; try { st = await fsp.stat(p); } catch (x) { continue; }
    out.push({path: p, name: e.name, rel: path.relative(out.root, p), size: st.size, mtime: st.mtimeMs, raw: RAW.has(ext), heic: HEIC.has(ext)});
  }
}
// plus grande image JPEG cachee dans un fichier RAW (apercu de l'appareil)
function rawPreview(buf) {
  let best = null;
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0xFF || buf[i + 1] !== 0xD8 || buf[i + 2] !== 0xFF) continue;
    // parcourt les segments jusqu'au debut des donnees, puis cherche la fin
    let j = i + 2, ok = false;
    while (j < buf.length - 4) {
      if (buf[j] !== 0xFF) break;
      const m = buf[j + 1];
      if (m === 0xDA) { ok = true; break; }
      const len = buf.readUInt16BE(j + 2); j += 2 + len;
    }
    if (!ok) continue;
    let k = j; while (k < buf.length - 1 && !(buf[k] === 0xFF && buf[k + 1] === 0xD9)) k++;
    const len = k + 2 - i;
    if (!best || len > best.len) best = {start: i, len};
    i = k;
  }
  return best && best.len > 20000 ? buf.subarray(best.start, best.start + best.len) : null;
}

ipcMain.handle('pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, {title: 'Choisir le dossier de photos (ou la carte SD)', properties: ['openDirectory']});
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('list', async (e, dir) => { const out = []; out.root = dir; await walk(dir, out, 0); return out.map(o => ({...o})); });
ipcMain.handle('read', async (e, p, raw) => {
  const b = await fsp.readFile(p);
  if (raw) { const j = rawPreview(b); if (j) return new Uint8Array(j); return null; }
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
});
ipcMain.handle('readHead', async (e, p, n) => {
  const fh = await fsp.open(p, 'r'); try { const b = Buffer.alloc(n); const r = await fh.read(b, 0, n, 0); return new Uint8Array(b.buffer, 0, r.bytesRead); } finally { await fh.close(); }
});
ipcMain.handle('readText', async (e, p) => { try { return await fsp.readFile(p, 'utf8'); } catch (x) { return null; } });
ipcMain.handle('writeText', async (e, p, s) => { await fsp.mkdir(path.dirname(p), {recursive: true}); await fsp.writeFile(p, s, 'utf8'); return true; });
ipcMain.handle('writeBin', async (e, p, data) => { await fsp.mkdir(path.dirname(p), {recursive: true}); await fsp.writeFile(p, Buffer.from(data)); return true; });
ipcMain.handle('exists', (e, p) => fs.existsSync(p));
ipcMain.handle('copy', async (e, src, dstDir, move) => {
  await fsp.mkdir(dstDir, {recursive: true});
  // marque : ce dossier est un export, il n'est pas relu quand on rouvre le dossier principal
  const mk = path.join(dstDir, '.regardpur-export'); if (!fs.existsSync(mk)) await fsp.writeFile(mk, 'Dossier cree par Regard Pur').catch(() => {});
  let d = path.join(dstDir, path.basename(src)), n = 1;
  while (fs.existsSync(d)) { const x = path.parse(src); d = path.join(dstDir, x.name + '_' + (n++) + x.ext); }
  if (move) { try { await fsp.rename(src, d); } catch (x) { await fsp.copyFile(src, d); await fsp.unlink(src); } }
  else await fsp.copyFile(src, d);
  // le fichier XMP qui accompagne la photo suit aussi
  const sx = src.replace(/\.[^.]+$/, '.xmp');
  if (fs.existsSync(sx)) { const dx = d.replace(/\.[^.]+$/, '.xmp'); if (move) await fsp.rename(sx, dx).catch(() => {}); else await fsp.copyFile(sx, dx).catch(() => {}); }
  return d;
});
ipcMain.handle('pickDir', async (e, title, def) => {
  const r = await dialog.showOpenDialog(win, {title: title || 'Choisir un dossier', defaultPath: def || undefined, properties: ['openDirectory', 'createDirectory']});
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('picturesDir', () => app.getPath('pictures'));
// copie sous un nouveau nom ; si un fichier identique (meme taille) existe deja, on ne recopie pas
ipcMain.handle('copyAs', async (e, src, dst) => {
  await fsp.mkdir(path.dirname(dst), {recursive: true});
  const ss = await fsp.stat(src); let d = dst, n = 1;
  while (fs.existsSync(d)) {
    const st = await fsp.stat(d); if (st.size === ss.size) return {path: d, skipped: true};
    const x = path.parse(dst); d = path.join(x.dir, x.name + '_' + (n++) + x.ext);
  }
  await fsp.copyFile(src, d); await fsp.utimes(d, ss.atime, ss.mtime).catch(() => {});
  return {path: d, skipped: false};
});
ipcMain.handle('join', (e, ...a) => path.join(...a));
ipcMain.handle('openPath', (e, p) => shell.openPath(p));
ipcMain.handle('showItem', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('aiOk', () => AI.available());
// style appris : reglages Lightroom (.xmp a cote des photos, ou XMP dans les JPEG exportes) et DxO (.dop)
ipcMain.handle('styleFiles', async (e, dir) => {
  const out = [];
  async function w(d, depth) {
    let ents; try { ents = await fsp.readdir(d, {withFileTypes: true}); } catch (x) { return; }
    for (const en of ents) {
      if (out.length >= 3000) return; if (en.name.startsWith('.')) continue; const p = path.join(d, en.name);
      if (en.isDirectory()) { if (depth < 6) await w(p, depth + 1); continue; }
      const ext = path.extname(en.name).toLowerCase();
      if (ext === '.xmp' || ext === '.dop') out.push({path: p, kind: ext.slice(1)});
      else if (ext === '.jpg' || ext === '.jpeg') out.push({path: p, kind: 'jpg'});
    }
  }
  await w(dir, 0); return out;
});
// carte SD / telephone : premier lecteur qui contient un dossier DCIM (repris d'ARCHIVAGE_TRI_PRO)
ipcMain.handle('sdCard', () => { if (process.platform !== 'win32') return null; for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') { const r = l + ':\\'; try { if (fs.existsSync(r + 'DCIM')) return r; } catch (e) {} } return null; });
// lieux : GPS -> « Ville-Pays » avec OpenStreetMap (Nominatim), seulement si l'utilisateur l'active ; 1 demande par seconde, reponses memorisees
let placeCache = null, placeLast = 0, placeFail = 0;
ipcMain.handle('placeName', async (e, lat, lon) => {
  const f = path.join(app.getPath('userData'), 'lieux.json');
  if (!placeCache) { try { placeCache = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) { placeCache = {}; } }
  const k = lat.toFixed(2) + ',' + lon.toFixed(2); if (k in placeCache) return placeCache[k];
  if (placeFail >= 3) return null;
  const wait = 1100 - (Date.now() - placeLast); if (wait > 0) await new Promise(r => setTimeout(r, wait)); placeLast = Date.now();
  try {
    const {net} = require('electron');
    const u = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=fr&lat=' + lat.toFixed(2) + '&lon=' + lon.toFixed(2);
    const r = await net.fetch(u, {headers: {'User-Agent': 'RegardPur/3.9 (tri de photos, usage personnel)'}}); const j = await r.json(), a = j.address || {};
    const v = ['city', 'town', 'village', 'municipality', 'city_district', 'suburb', 'county', 'state_district', 'state'].map(c => a[c]).find(Boolean) || '';
    const res = [v, a.country || ''].filter(Boolean).join('-'); placeCache[k] = res; placeFail = 0;
    try { fs.writeFileSync(f, JSON.stringify(placeCache)); } catch (x) {}
    return res;
  } catch (x) { placeFail++; return null; }
});
// l'IA tourne dans un processus a part (Node), relance automatiquement s'il s'arrete
let aiProc = null, aiSeq = 0; const aiWait = {};
function aiChild() {
  if (aiProc && aiProc.connected) return aiProc;
  const {fork} = require('child_process');
  aiProc = fork(path.join(__dirname, 'ai_child.js'), [], {env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
  aiProc.send({init: true, dir: AI.dir()});
  aiProc.on('message', (r) => { const w = aiWait[r.id]; if (!w) return; if (r.prog != null) { w.prog(r.prog, r.ep); return; } delete aiWait[r.id]; if (r.err) w.rej(new Error(r.err)); else w.res(r.res); });
  aiProc.on('exit', (c) => { aiProc = null; Object.keys(aiWait).forEach(k => { aiWait[k].rej(new Error("le calcul IA s'est arrêté (mémoire insuffisante ?)")); delete aiWait[k]; }); });
  return aiProc;
}
ipcMain.handle('aiRun', (e, m, rgba, w, h, tw, th) => new Promise((res, rej) => {
  let last = 0; const id = ++aiSeq;
  aiWait[id] = {res, rej, prog: (f, ep) => { const t = Date.now(); if (t - last > 300 || f >= 1) { last = t; e.sender.send('aiProg', f, ep); } }};
  aiChild().send({id, m, rgba, w, h, tw, th});
}));
app.on('before-quit', () => { if (aiProc) aiProc.kill(); });
ipcMain.handle('trash', async (e, p) => { await shell.trashItem(p); return true; });
