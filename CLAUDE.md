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
Version 4.10 (vue en grand + bouton retour corrigé) : grille OUTILS complète (Retouches, Détails, Courbes, Balance des blancs,
Contraste des tons, Sélection, Pinceau, Correcteur, Recadrer, Théâtral, HDR, Double exposition, Éclat glamour, Effets).
Reste à faire :
1. **Mode d'emploi** FR + EN mis à jour (sources dans `store/manuel`, `PAGES` dans `jmabout.js`).
2. Publier sur `main` quand l'utilisateur le demande.
Ne PAS ajouter : Perspective, Noir et blanc complet.
