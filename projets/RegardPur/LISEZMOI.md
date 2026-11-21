# Regard Pur — tri de photos (PC Windows, puis Android)

Version 2.7 : nouvelle base qui remplace `RegardPur_V1.4.py` (gardé pour mémoire).

## Ce que fait l'appli
- Ouvre un dossier ou une carte SD (sous-dossiers compris) : JPEG, HEIC (iPhone), PNG, TIFF et RAW (aperçu intégré au RAW).
- **📥 Importer une carte** (comme Photo Mechanic) : copie vers le PC, sous-dossier par date ou par séance, renommage (date-heure, date + numéro, séance + numéro ; RAW + JPEG gardent le même numéro), copie de sécurité simultanée vers un 2e disque, sans recopier ce qui est déjà importé, puis tri automatique.
- Vignettes immédiates (petite image intégrée à la photo), avant même l'analyse.
- **Gros plans des visages** (pleine résolution) à côté de la photo et dans la vue en grand ; un clic zoome sur le visage.
- Analyse chaque photo, sans internet :
  - **netteté réelle**, mesurée à 100 % sur les zones les plus détaillées, et sur les yeux s'il y a un visage ;
  - **flou de bougé** : la netteté diffère selon la direction ;
  - **visages, yeux fermés ou mi-clos, sourire** (modèle MediaPipe embarqué) ;
  - **exposition** : blancs brûlés, noirs bouchés, photo trop sombre ou trop claire ;
  - **rafales et doublons** regroupés en séries, avec la meilleure photo mise en avant.
- **Personnes** : reconnaissance des visages (face-api, sans internet), liste avec photo de chaque personne, filtre par personne, double-clic pour lui donner un nom (gardé dans la session).
- **Photos semblables** : bouton dans le panneau de droite, triées de la plus proche à la moins proche.
- **Œil artistique** (2.5) : note de beauté sur 10 (lumière, couleurs, composition) par le modèle NIMA MobileNet (idealo, licence Apache 2.0), calculée sur le PC sans internet ; elle entre dans le score et dans l'apprentissage de vos goûts. Poids préparés par `tools/nima_export.py` (lancé par GitHub).
- **Composition** (2.6) : visage coupé par le bord, personne qui tourne la tête dans un groupe, horizon penché (vraie longue ligne droite, mesurée au degré) ; filtre « Composition ».
- Score sur 100 qui **apprend de vos choix P / X**.
- **Tri automatique** avec trois niveaux d'exigence ; vos choix faits à la main ne sont jamais touchés.
- Grille de vignettes, **vue en grand** avec zoom à 100 % sur les yeux, **comparaison** de 2 à 6 photos avec zoom synchronisé.
- **Raccourcis** : P, X, U, 1 à 5, flèches, Entrée, Échap, Z, F, C, Espace, G, Ctrl+Z.
- **Export** : copier ou déplacer les photos retenues, ranger les rejetées (rien n'est effacé), fichiers **XMP** (étoiles, vert = gardée, rouge = rejetée) lus par Lightroom, Capture One, DxO et Bridge.
- **🎨 Rendu JM LAB PRO à l'export** (2.7) : profils, ProLab automatique, intensité, protection des hautes lumières et code de style `JMLAB_PRESET:…` de l'appli ; même moteur que JM LAB PRO (extrait de `app/src/main/assets` par `tools/jmlab_core.js` à chaque fabrication) ; fichiers `_JMD_LAB_PRO.jpg` avec EXIF conservé ; originaux jamais modifiés.
- **Session** enregistrée dans le dossier (`.regardpur/`) : en rouvrant le dossier, tout est repris tout de suite.

## Fabrication
- Code : `app/` (Electron). La fenêtre est dans `app/renderer/` (HTML / JavaScript), la même base servira pour Android.
- GitHub fabrique `RegardPur.exe` (sans installation) et `RegardPur_Installation.exe`
  (`.github/workflows/regardpur.yml`) :
  - essai (branche de travail) : https://github.com/dargerejm-oss/JM-LAB-PRO-ANDROID/releases/download/regardpur-test/RegardPur.exe
  - version publiée (main) : https://github.com/dargerejm-oss/JM-LAB-PRO-ANDROID/releases/download/regardpur/RegardPur.exe
- Sur PC pour développer : `cd app && npm install && npm run vendor && npm start`.

## À faire ensuite
- Android (réutiliser `renderer/`, accès aux photos par la partie Android comme JM LAB PRO).
- Lien « Retoucher dans JM LAB PRO ».
- Netteté des yeux réglée sur de vraies photos (2.4). Reste à vérifier : HEIC, yeux fermés, photos 24 Mpx d'appareil.
- Mode d'emploi.
