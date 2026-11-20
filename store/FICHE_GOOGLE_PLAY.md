# JM LAB PRO — Fiche Google Play (à recopier dans la Play Console)

## 1. Textes de la fiche

### Français (langue par défaut)

**Nom de l'application** (30 caractères max) :
`JM LAB PRO – Retouche photo`

**Description courte** (80 caractères max) :
`Rendus film, réglages fins et traitement par lot. Hors ligne, sans pub.`

**Description complète** :

> JM LAB PRO est un laboratoire photo de poche, pensé par un photographe pour les photographes.
>
> 🎞️ **Profils film** : Éclat Intense, Naturel, Doux Portrait, Chrome Doux, Cinéma, Noir & Blanc, Pellicule Couleur… et le profil LABO PRO avec exposition automatique.
>
> 🎛️ **Réglages précis** : exposition, contraste, température, teinte, ombres, hautes lumières, vibrance, saturation, clarté, noirs, blancs, dehaze, vignette. Annuler / rétablir à tout moment, avant / après avec curseur.
>
> ✨ **Effets** : ciel assombri, visage éclairci, peau lissée, dégradé, grain argentique, noir & blanc avec filtres, netteté, réduction du bruit, pinceau éclaircir / assombrir.
>
> 🗂️ **Traitement par lot** : choisissez des dizaines de photos, vérifiez l'aperçu, lancez : tout est corrigé et enregistré automatiquement, avec sablier et chronomètre.
>
> 🖼️ **Cadre + signature** : ajoutez votre cadre, vos initiales ou votre signature, un filigrane, et un recadrage prêt à publier (1:1, 4:5, 9:16, 16:9).
>
> 🎨 **Styles** : enregistrez vos réglages, partagez-les en QR code ou en texte, apprenez un style à partir d'une photo avant / après ou d'une photo de référence, créez un LUT .cube.
>
> 👁️ **Visionneuse** : parcourez un dossier et enregistrez une photo d'un geste.
>
> 🔒 **Respect de la vie privée** : tout se passe sur votre téléphone. Aucun compte, aucune publicité, aucune donnée collectée. Fonctionne sans Internet.
>
> 🎓 **Mode cours** : grand texte, fiches de réglages pour les élèves, défi du jour.

### English

**App name**: `JM LAB PRO – Photo Editor`

**Short description**: `Film looks, fine adjustments and batch editing. Offline, no ads.`

**Full description**:

> JM LAB PRO is a pocket photo lab, designed by a photographer for photographers.
>
> 🎞️ **Film profiles**: Vivid Boost, Natural, Soft Portrait, Soft Chrome, Cinema, Black & White, Color Film… plus the LABO PRO profile with automatic exposure.
>
> 🎛️ **Precise adjustments**: exposure, contrast, temperature, tint, shadows, highlights, vibrance, saturation, clarity, blacks, whites, dehaze, vignette. Undo / redo anytime, before / after slider.
>
> ✨ **Effects**: darker sky, brighter face, smooth skin, gradient, film grain, black & white with filters, sharpness, noise reduction, lighten / darken brush.
>
> 🗂️ **Batch editing**: pick dozens of photos, check the preview, start: everything is edited and saved automatically, with an hourglass and timer.
>
> 🖼️ **Frame + signature**: add your frame, initials or signature, a watermark, and a ready-to-post crop (1:1, 4:5, 9:16, 16:9).
>
> 🎨 **Styles**: save your settings, share them as QR code or text, learn a style from a before / after photo or a reference photo, create a .cube LUT.
>
> 👁️ **Viewer**: browse a folder and save a photo with one tap.
>
> 🔒 **Privacy first**: everything happens on your phone. No account, no ads, no data collected. Works without Internet.
>
> 🎓 **Lesson mode**: large text, settings sheets for students, daily challenge.

**Catégorie / Category** : Photographie / Photography
**Coordonnées / Contact** : une adresse e-mail est obligatoire dans la Play Console (elle est affichée publiquement : utilisez une adresse dédiée si vous préférez).

## 2. Politique de confidentialité

Le texte est dans `PRIVACY.md` à la racine du dépôt. Google demande une **adresse web publique** :
- si le dépôt GitHub est public : utilisez le lien de `PRIVACY.md` sur GitHub ;
- sinon : publiez ce texte sur une page web gratuite (Google Sites, GitHub Pages…) et collez son adresse.

## 3. Formulaire « Sécurité des données » (Data safety)

| Question | Réponse |
|---|---|
| L'appli collecte-t-elle ou partage-t-elle des types de données utilisateur requis ? | **Non** |
| Toutes les données sont-elles chiffrées en transit ? | Sans objet (aucune donnée transmise) |
| Les utilisateurs peuvent-ils demander la suppression des données ? | Sans objet (aucune donnée collectée) |

Les photos sont traitées localement et ne quittent pas le téléphone : selon les règles de Google, un traitement uniquement sur l'appareil n'est pas une « collecte ».

## 4. Autres questions de la Play Console

- **Publicités** : Non.
- **Accès à l'application** : toutes les fonctions sont accessibles sans identifiant.
- **Public cible** : 13 ans et plus (ou 18+ : le plus simple).
- **Classification du contenu** : remplir le questionnaire IARC → aucune violence, aucun contenu sensible → classement « Tout public / PEGI 3 ».
- **Application d'actualités / gouvernementale / santé / financière** : Non.
- **Autorisation caméra** : utilisée seulement pour scanner les QR codes de styles.

## 5. Visuels à fournir

| Visuel | Format | Fichier |
|---|---|---|
| Icône | 512 × 512 PNG | `store/icone_512.png` (icône LAB PRO redessinée en haute définition) |
| Bannière | 1024 × 500 PNG/JPG | à créer |
| Captures d'écran | au moins 2 (idéal 4 à 8), format portrait | à faire sur le téléphone avec de vraies photos : écran RÉGLAGES avec avant/après, PROFILS FILM, PRÊT À LANCER avec aperçu, CADRE + SIGNATURE |

## 6. Envoi

1. Créer un compte développeur Google Play (25 $, une seule fois).
2. Créer l'application « JM LAB PRO », langue par défaut Français.
3. Activer la **signature d'application par Google Play** et utiliser la clé actuelle (celle des secrets GitHub) comme **clé d'importation**. Garder une copie de la clé et du mot de passe en lieu sûr, hors de GitHub.
4. Envoyer le fichier **JM_LAB_PRO.aab** (publié automatiquement avec chaque version sur GitHub, à côté de l'APK) dans « Tests internes » d'abord, puis « Production ».
5. Pour un nouveau compte personnel, Google exige un **test fermé avec au moins 12 testeurs pendant 14 jours** avant la mise en production.
