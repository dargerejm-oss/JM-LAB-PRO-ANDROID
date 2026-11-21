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
Version 4.11 : tous les outils demandés sont faits (grille OUTILS : Retouches, Détails, Courbes, Balance des blancs,
Contraste des tons, Sélection, Pinceau, Correcteur, Recadrer, Théâtral, HDR, Double exposition, Éclat glamour, Effets),
vue en grand, mode d'emploi FR + EN à jour (16 pages, sources dans `store/manuel`, `PAGES` dans `jmabout.js`).
Ne PAS ajouter : Perspective, Noir et blanc complet.

## Configuration (déjà en place, rien à refaire)
- Dépôt GitHub : `dargerejm-oss/JM-LAB-PRO-ANDROID`. Branche de travail des sessions Claude, puis publication sur `main`.
- GitHub construit l'APK et l'AAB à chaque envoi (`.github/workflows/build.yml`) ; la clé de signature est dans les secrets GitHub.
- Tests dans le navigateur (Playwright) : ouvrir `app/src/main/assets/index.html` ; pour le lot et l'enregistrement,
  simuler `window.JMNative` (la partie Android) et servir le dossier assets en local (`python3 -m http.server`).
