// pont entre la fenetre et le PC
const {contextBridge, ipcRenderer} = require('electron');
const call = (n) => (...a) => ipcRenderer.invoke(n, ...a);
contextBridge.exposeInMainWorld('RPNative', {
  pickFolder: call('pickFolder'), list: call('list'), read: call('read'), readHead: call('readHead'), readText: call('readText'), writeText: call('writeText'), writeBin: call('writeBin'), exists: call('exists'),
  copy: call('copy'), join: call('join'), openPath: call('openPath'), showItem: call('showItem'), trash: call('trash'), sep: process.platform === 'win32' ? '\\' : '/'
});
