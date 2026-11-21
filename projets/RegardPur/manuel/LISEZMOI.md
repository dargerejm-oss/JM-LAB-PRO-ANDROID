# Mode d'emploi Regard Pur

- `manuel.html` (français) et `en/manuel.html` (anglais), format A5, 15 pages.
- `c01.jpg` … `c12.jpg` : captures faites automatiquement sur le dossier de démonstration tiré de l'image du temple
  (`store/manuel/photo_notice.jpg`, variantes floue, bougée, sombre, brûlée, cadre, bruit, penchée, rafale…).
- Fabrication : `node build.js <dossier de manuel.html> <dossier de sortie> [nom.pdf]`
  (français : RegardPur_mode_emploi.pdf, anglais : RegardPur_user_guide.pdf), puis copier les PDF dans
  `app/renderer/manuel/` : le bouton « Mode d'emploi (PDF) » de l'aide les ouvre.
