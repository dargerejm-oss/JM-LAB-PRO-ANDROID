// Regard Pur - processus a part pour l'IA : les calculs longs ne bloquent pas la fenetre, et certains modeles
// (SCUNet) ne fonctionnent que hors du processus principal d'Electron
const AI = require('./ai');
process.on('message', async (q) => {
  if (q.init) { AI.setDir(q.dir); return; }
  try {
    const r = await AI.run(q.m, q.rgba, q.w, q.h, q.tw, q.th, (f, ep) => process.send({id: q.id, prog: f, ep}));
    process.send({id: q.id, res: r});
  } catch (e) { process.send({id: q.id, err: String(e && e.message || e)}); }
});
