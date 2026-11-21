# Mode d'emploi JM LAB PRO

- `manuel.html` : le texte et la mise en page du mode d'emploi (format A5).
- `*.jpg` : captures d'écran de l'appli et logo utilisés dans le document.
- `build.js` : fabrique le PDF et une image par page (Playwright / Chromium) :

```
node build.js <dossier de manuel.html> <dossier de sortie>
```

Copier ensuite `JM_LAB_PRO_mode_emploi.pdf` et `p01.jpg`, `p02.jpg`… dans `app/src/main/assets/manuel/`
(et ajuster `PAGES` dans `app/src/main/assets/jmabout.js` si le nombre de pages change).
