# Regard Pur — tri de photos (PC Windows, puis Android)

Version 3.8 : nouvelle base qui remplace `RegardPur_V1.4.py` (gardé pour mémoire).

## Interface (3.0)
- **3 étapes en haut : ① Trier · ② Retoucher · ③ Exporter**, avec les outils de l'étape juste en dessous.
- Vraies icônes (SVG), bulles d'aide « ? » au survol, colonne de gauche en sections repliables.
- **Mode Simple / Expert** (en haut à droite) : le mode Simple cache les réglages fins.
- Retoucher : photo en grand + panneau unique (retouche rapide, correcteur, portrait).
- Exporter : page en 3 cartes (quelles photos, où, retouche) + réglages avancés repliés.
- Grille allégée pour les gros dossiers (vignettes hors écran non dessinées) et temps restant pendant l'analyse.

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
- **📊 Bilan de la séance** (gardées / rejetées / à voir, raisons, 5 meilleures, temps gagné) et **guide du premier lancement** (5 écrans, à revoir depuis ❔).
- **Catégories de séance** (2.9, idées reprises de « Vrai Regard » sans doublon) : Auto (devinée photo par photo, la nuit confirmée par l'heure / ISO / pose) ou mariage, portrait, famille, contre-jour, plage, paysage, nuit. Le tri en tient compte (nuit sombre, contre-jour et plage clairs, robe blanche) ; à l'export : correction des tons vers les cibles de la catégorie (remplace l'exposition auto ProLab pour ne pas corriger deux fois), profil JM LAB PRO conseillé, **peau protégée**, **horizon redressé**, nommage `categorie_client_001.jpg`, **mémoire des réglages par client**.
- **Retouche rapide** dans la vue en grand (☀ exposition, 🌡 chaleur) et **apprentissage de vos retouches** par catégorie et par client (idée « leçons » de Vrai Regard) : appliquées à l'export aux photos non retouchées.
- **💄 Retouche portrait** (2.11, vue en grand) : préréglages Naturel, Éclat, Glamour, Mariage, Homme, Enfant + intensité ; peau (lissage qui garde le grain et les contours), acné, taches, rousseur, cernes, rides du sourire et du front, blanc des yeux, iris, dents, lèvres, éclat du visage, fond (flou, assombri, désaturé) ; aperçu avant / après ; appliquer à la photo, la personne, la série ou toutes ; mémorisé par catégorie et client ; faite à l'export en pleine résolution. Points du visage MediaPipe + séparation « selfie multiclass » (sans internet).
- **🩹 Correcteur** (2.12, vue en grand) : on peint sur une tache ou un objet, la zone est reconstruite avec la matière voisine (même moteur que JM LAB PRO, extrait de `jmfx2.js`) ; annuler, tout effacer, taille ; fait à l'export en pleine résolution.
- **Session** enregistrée dans le dossier (`.regardpur/`) : en rouvrant le dossier, tout est repris tout de suite.

## Mesure de la netteté (3.0.1)
- Deux mesures, on garde la plus sévère : largeur des bords (100 % / 50 %) et « re-floutage » (Crété-Roffet 2007) sur une zone ramenée à une taille fixe (œil à 160 px, visage à 300 px, zone nette à 360 px) : ne dépend plus de la taille de la photo, ne se laisse plus tromper par une photo très floue.
- Version d'analyse `AVER = 2` : une session plus ancienne est réanalysée automatiquement (choix P / X / étoiles gardés).

## « Pas d'accord » (3.1)
- Sous Garder / Rejeter : « Elle est floue », « Elle est nette », « Yeux fermés », « Yeux ouverts ». L'avis s'applique à la photo et règle les seuils (netteté des yeux, netteté générale, yeux fermés) : on cherche le seuil qui colle le mieux à vos verdicts sans trop s'éloigner de l'origine (`calFit`). Tout le dossier est revu aussitôt. Compteur et « Remettre à zéro » dans la colonne de gauche. Stocké dans `rp_cal` (navigateur de l'appli).

## Qualité d'image (3.2)
- Bruit (méthode d'Immerkær, zone la plus calme, ramené à une vue écran 2400 px), qualité JPEG lue dans la table de quantification du fichier, pixelisation (escalier régulier tous les k pixels), photo agrandie (très floue à 100 % mais nette à 50 %), définition (Mpx + taille de tirage à 200 dpi), photos sans EXIF. Raisons, score, filtres « Qualité d'image » et « Sans EXIF ». Version d'analyse `AVER = 3`.

## Réglages complets (3.3, étape Retoucher)
- Profil (selon le type de photo ou au choix), ProLab auto, intensité, 13 curseurs (moteur JM LAB PRO), courbe à points (mode Expert), ✨ Auto (ProLab + catégorie + peau + habitudes apprises), copier / coller, appliquer à la sélection / série / personne / gardées. Aperçu = même calcul que l'export (`renderStyle`). Stocké par photo dans `p.dev`.

## Outils de JM LAB PRO + glisser (3.4)
- Balance des blancs (pipette), Détails, Contraste des tons, HDR, Théâtral, Éclat glamour : extraits de `jmfx2.js` (`JMLOOKS` dans `jmlab_core.js`), mêmes résultats que l'appli.
- Régler en glissant sur la photo (comme Snapseed) : ↕ choisir le réglage, ↔ le doser, valeur affichée en grand.

## 🩺 Corriger les problèmes (3.5)
- Sur la sélection (ou la photo choisie) : chaque photo reçoit les outils dont elle a besoin selon les défauts trouvés (exposition vers un sujet à ~120, hautes lumières, ombres, léger flou → netteté / structure, bruit → lissage, dominante orangée / bleutée → balance des blancs, horizon → redressé), affichés dans le panneau, puis ouverture de Retoucher pour la finition (`fixPhoto`).

## Fabrication
- Code : `app/` (Electron). La fenêtre est dans `app/renderer/` (HTML / JavaScript), la même base servira pour Android.
- GitHub fabrique `RegardPur.exe` (sans installation) et `RegardPur_Installation.exe`
  (`.github/workflows/regardpur.yml`) :
  - essai (branche de travail) : https://github.com/dargerejm-oss/JM-LAB-PRO-ANDROID/releases/download/regardpur-test/RegardPur.zip
  - version publiée (main) : https://github.com/dargerejm-oss/JM-LAB-PRO-ANDROID/releases/download/regardpur/RegardPur.zip
- Sur PC pour développer : `cd app && npm install && npm run vendor && npm start`.

## À faire ensuite
- Android (réutiliser `renderer/`, accès aux photos par la partie Android comme JM LAB PRO).
- Lien « Retoucher dans JM LAB PRO ».
- Netteté des yeux réglée sur de vraies photos (2.4). Reste à vérifier : HEIC, yeux fermés, photos 24 Mpx d'appareil.
- Mode d'emploi.

### 3.6
- Retoucher : **Niveaux** (point noir, tons moyens, point blanc) et **courbes par couleur** (Toutes, Rouge, Vert, Bleu).
- **Déflouter** (repris de CORRECTION FLOU PRO) : mesure du flou, déconvolution de Wiener (mise au point ou bougé),
  débruitage doux, renforcement sans halo, et filet de sécurité qui annule une correction qui abîmerait la photo.
  Utilisé aussi par « Corriger les problèmes ». Disponible dans la liste « glisser gauche-droite ».

### 3.7
- **Amélioration IA** (Retoucher, sous Déflouter), calculée sur le PC sans connexion, carte graphique utilisée si possible :
  - « Déflouter (IA) » : NAFNet (licence MIT) — très efficace sur le bougé, utile sur le flou de mise au point ;
  - « Restaurer (IA) » : Real-ESRGAN (licence BSD-3) — photos pixelisées, très compressées ou abîmées, même taille ;
  - « Agrandir ×2 (IA) » : Real-ESRGAN, détails reconstruits ; rendu Net ou Doux en mode Expert.
  - Le résultat est enregistré à part (dossier caché .regardpur/ia), l'original n'est jamais modifié ; les réglages
    s'appliquent par-dessus ; « Revenir à l'original » annule. À l'export sans autre réglage : fichier « _IA.jpg ».
- Déflouter (classique) deux fois plus rapide ; le bougé est repéré par l'analyse (l'horizon ne le trompe plus).
- Modèles préparés par `.github/workflows/rp-modeles.yml` (publication « regardpur-modeles »).

### 3.8
- IA : « Débruiter (IA) » (SCUNet, Apache-2.0) et « Visages (IA) » (GFPGAN v1.4, Apache-2.0 ; force Naturel / Marqué / Complet
  en Expert ; l'IA redessine le visage, à comparer avec l'original). L'IA tourne dans un processus à part (ai_child.js) :
  la fenêtre reste fluide et SCUNet fonctionne (il plantait dans le processus principal d'Electron).
- AUDIT PHOTOS PRO : cadre ajouté de n'importe quelle couleur, doublons (même photo dans un autre fichier : réexport,
  retouche, recadrage, redressée, encadrée, plus petite) avec choix de l'original (sans cadre, la plus grande, la plus
  ancienne), filtres « Doublons », « Doublons de taille différente », « Cadre ajouté », bouton « Rejeter les doublons ».
  Analyse version 4 (les photos sont réanalysées une fois ; les choix sont gardés).
- Signature / filigrane : « Ma signature… » (Options expert) puis recherche dans les coins et en bas ; filtres « Avec / Sans ma signature ».
- « Corriger les problèmes » utilise l'IA si utile, dans l'ordre bruit → flou → pixels/compression → visages (option),
  mesure avant / après (annule une correction qui n'améliore pas), et ne propose plus d'office ce que vous annulez souvent.

### Après 3.8 (pas encore publié : la prochaine version regroupera tout)
- Correction : la vérification avant / après ne rejette plus le débruitage par IA à tort.
- Avant / Après : ligne à glisser sur la photo (touche B). Déflouter (IA) seulement les personnes (fond flou gardé).
- TRI_YEUX_LUNETTES_PRO : lunettes repérées (« vérifiez les reflets ») ; verres teintés = yeux non lisibles (pas de rejet).
- TRI_SHOOTING_PRO : rubrique « Séances » (découpage par pauses réglable, séance de pose / portraits / paysages).
- VISIONNEUSE_ENREGISTRE : rotation [ et ] (appliquée à l'export), Suppr = corbeille, S = copie rapide (Maj+S : autre dossier).
- ARCHIVAGE_TRI_PRO : carte SD proposée à l'import, lieux GPS en option (OpenStreetMap, internet), contrôle avant tirage
  (dpi effectifs de 10×15 à 50×75, visage coupé par le recadrage). Analyse version 5.
- Outils adaptés au type de photo : bloc « Pour ce type de photo » (portrait, mariage, famille, contre-jour, plage, paysage,
  nuit) avec recettes en un clic ; « Mon style » en tête si un style a été appris.
- « Garder les N meilleures » (vue affichée ou chaque séance, une par série, doublons comptés une fois, le reste « À voir » ou rejeté).
- Ciel (assombrir, bleu, relief, ciel repéré tout seul) et recadrage auto (tiers, visages entiers, d'origine / 3:2 / 4:5 / carré / 16:9).
- Style appris : Lightroom (.xmp et JPEG exportés, réglages crs:) ; DxO (.dop) préparé, à confirmer avec des fichiers d'exemple.
- Vrais RAW : développement LibRaw (libraw-wasm, données du capteur, balance des blancs de l'appareil, hautes lumières
  récupérées) dans Retoucher et à l'export, gardé dans .regardpur/raw ; RAW sans aperçu intégré analysés quand même.
  Les pages sont « isolées » (en-têtes COOP/COEP) pour que LibRaw puisse utiliser plusieurs cœurs.
