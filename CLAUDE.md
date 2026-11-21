# Consignes pour Claude — JM LAB PRO

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

## Travail en cours (à reprendre)
Version 4.8 publiée (grille OUTILS, Détails, Théâtral, Éclat glamour, Balance des blancs pipette, HDR,
Contraste des tons, Sélection, Pinceau). Reste à faire, dans cet ordre :
1. Vérifier l'affichage de la zone (photo assombrie, zone en rouge) dans Sélection et Pinceau.
2. Outil **Double exposition** (2ᵉ photo placée avec les doigts, mélange, opacité ; photo ouverte seulement).
3. **Rangement** de l'ancien écran « Effets » dans la grille OUTILS (vieux pinceau remplacé par le nouveau,
   netteté dans Détails).
4. **Mode d'emploi** FR + EN mis à jour à la toute fin (sources dans `store/manuel`, `PAGES` dans `jmabout.js`).
5. Publier sur `main` quand l'utilisateur le demande.
Ne PAS ajouter : Perspective, Noir et blanc complet.
