// Regard Pur - partie PC (fenetre, acces aux dossiers et aux fichiers)
const {app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol} = require('electron');
const fs = require('fs'), fsp = fs.promises, path = require('path');

const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
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
    out.push({path: p, name: e.name, rel: path.relative(out.root, p), size: st.size, mtime: st.mtimeMs, raw: RAW.has(ext)});
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
ipcMain.handle('join', (e, ...a) => path.join(...a));
ipcMain.handle('openPath', (e, p) => shell.openPath(p));
ipcMain.handle('showItem', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('trash', async (e, p) => { await shell.trashItem(p); return true; });
