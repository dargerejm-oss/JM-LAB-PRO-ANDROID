// Fabrique le PDF du mode d'emploi et une image JPEG par page (pour l'affichage dans l'appli).
const {chromium} = require('playwright');
const path = require('path');
const [, , DIR, OUT] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 560, height: 794}, deviceScaleFactor: 2});
  await p.goto('file://' + path.join(DIR, 'manuel.html'));
  await p.waitForTimeout(800);
  await p.pdf({path: path.join(OUT, 'JM_LAB_PRO_mode_emploi.pdf'), width: '148mm', height: '210mm', printBackground: true, margin: {top: 0, right: 0, bottom: 0, left: 0}});
  const pages = await p.$$('.page');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({path: path.join(OUT, 'p' + String(i + 1).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 82});
  }
  // controle : aucun contenu qui deborde de sa page
  const over = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg, i) => { const r = pg.getBoundingClientRect(); const f = pg.querySelector('.foot'); let max = 0; pg.querySelectorAll('*').forEach(e => { if (e.closest('.foot')) return; const q = e.getBoundingClientRect(); if (q.height) max = Math.max(max, q.bottom - r.top); }); return [i + 1, Math.round(max), Math.round((f ? f.getBoundingClientRect().top : r.bottom) - r.top)]; }).filter(x => x[1] > x[2]));
  console.log('pages', pages.length, 'debordements', JSON.stringify(over));
  await b.close();
})();
