# Consignes pour Claude — JM LAB PRO

> **RÈGLE N° 1 : ÉCRIRE UNIQUEMENT EN FRANÇAIS.** Toutes les réponses ET tous les messages pendant le travail
> (« je vérifie… », « je teste… », « je publie… ») doivent être en français, sans exception. Ne jamais passer à l'anglais.

## Langue
- **Toujours répondre en français**, dans tous les messages, y compris les messages intermédiaires pendant le travail (« je vérifie… », « je publie… »).
- Les textes de l'appli restent en français ; la version anglaise est automatique (fichier `app/src/main/assets/jmlang.js`).

## Publication
- Travailler sur la branche de travail, vérifier que la construction GitHub réussit, puis publier sur `main` quand l'utilisateur le demande.
- Lien de mise à jour pour le téléphone (toujours la dernière version publiée) :
  https://github.com/dargerejm-oss/JM-LAB-PRO-ANDROID/releases/latest/download/JM_LAB_PRO.apk
- Augmenter `versionCode` et `versionName` dans `app/build.gradle` à chaque nouvelle version.

## Style des réponses
- Expliquer simplement, sans jargon technique ; l'utilisateur teste sur son téléphone Android.
- Dire clairement ce qui est publié et ce qui ne l'est pas encore.

## État actuel
Version 4.13 (bouton « REPARTIR DE ZÉRO » sur l'écran du lot, ProLab gardé) ; tous les outils demandés sont faits (grille OUTILS : Retouches, Détails, Courbes, Balance des blancs,
Contraste des tons, Sélection, Pinceau, Correcteur, Recadrer, Théâtral, HDR, Double exposition, Éclat glamour, Effets),
vue en grand, mode d'emploi FR + EN à jour (16 pages, sources dans `store/manuel`, `PAGES` dans `jmabout.js`).
Ne PAS ajouter : Perspective, Noir et blanc complet.

## Configuration (déjà en place, rien à refaire)
- Dépôt GitHub : `dargerejm-oss/JM-LAB-PRO-ANDROID`. Branche de travail des sessions Claude, puis publication sur `main`.
- GitHub construit l'APK et l'AAB à chaque envoi (`.github/workflows/build.yml`) ; la clé de signature est dans les secrets GitHub.
- Tests dans le navigateur (Playwright) : ouvrir `app/src/main/assets/index.html` ; pour le lot et l'enregistrement,
  simuler `window.JMNative` (la partie Android) et servir le dossier assets en local (`python3 -m http.server`).

## Mode d'emploi et PDF
- Pour TOUTES les captures du mode d'emploi et des PDF (français et anglais), utiliser **l'image du singe**
  fournie par l'utilisateur (à demander si elle n'est pas dans la conversation), pas les photos personnelles.

## Projet « Regard Pur » (tri de photos, mieux qu'AfterShoot) — COMMENCÉ (V2.0)
Code dans `projets/RegardPur/app` (Electron ; interface HTML/JS dans `renderer/`, réutilisable pour Android). Détails et liens
dans `projets/RegardPur/LISEZMOI.md`. Le .exe est fabriqué par `.github/workflows/regardpur.yml` (tags `regardpur-test` /
`regardpur`, jamais « latest » pour ne pas casser le lien de JM LAB PRO). Tests : servir `renderer/` (python3 -m http.server)
et Playwright, ou le vrai programme avec `xvfb-run` + `_electron` (dialogue de dossier remplacé dans le test).
Suite : Android, lien vers JM LAB PRO, HEIC.
