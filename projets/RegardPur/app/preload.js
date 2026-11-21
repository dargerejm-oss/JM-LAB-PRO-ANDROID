// pont entre la fenetre et le PC
const {contextBridge, ipcRenderer} = require('electron');
const call = (n) => (...a) => ipcRenderer.invoke(n, ...a);
contextBridge.exposeInMainWorld('RPNative', {
  pickFolder: call('pickFolder'), list: call('list'), read: call('read'), readHead: call('readHead'), readText: call('readText'), writeText: call('writeText'), writeBin: call('writeBin'), exists: call('exists'),
  copy: call('copy'), copyAs: call('copyAs'), pickDir: call('pickDir'), picturesDir: call('picturesDir'), join: call('join'), openPath: call('openPath'), showItem: call('showItem'), trash: call('trash'), aiOk: call('aiOk'), sdCard: call('sdCard'), placeName: call('placeName'), aiRun: call('aiRun'), onAiProg: (f) => { ipcRenderer.removeAllListeners('aiProg'); ipcRenderer.on('aiProg', (e, a, b) => f(a, b)); }, sep: process.platform === 'win32' ? '\\' : '/'
});
