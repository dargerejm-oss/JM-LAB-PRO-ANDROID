/* JM LAB PRO - noms des profils (sans marques) + version anglaise automatique.
   Rien n'est change dans le fonctionnement : seul le texte affiche est remplace. */
(function(){
"use strict";

/* ---------- langue : francais si le telephone est en francais, sinon anglais ---------- */
var lang = /^fr/i.test(navigator.language || "fr") ? "fr" : "en";
try{ var forced = localStorage.getItem("jms_lang"); if(forced === "fr" || forced === "en") lang = forced; }catch(e){}
var EN = lang === "en";
document.documentElement.lang = lang;

/* ---------- profils : nom d'origine -> nom affiche ---------- */
var PROF = [
  ["Classic Chrome+", "Chrome Doux+", "Soft Chrome+"],
  ["Classic Chrome", "Chrome Doux", "Soft Chrome"],
  ["Eterna Bleach", "Cinéma Délavé", "Bleached Cinema"],
  ["Eterna", "Cinéma", "Cinema"],
  ["Velvia+", "Éclat Intense+", "Vivid Boost+"],
  ["Velvia", "Éclat Intense", "Vivid Boost"],
  ["Provia", "Naturel", "Natural"],
  ["Astia", "Doux Portrait", "Soft Portrait"],
  ["Acros+R", "Noir & Blanc Rouge", "B&W Red Filter"],
  ["Acros", "Noir & Blanc", "Black & White"],
  ["Superia", "Pellicule Couleur", "Color Film"],
  ["Natura", "Lumière Naturelle", "Natural Light"]
];
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
var L = "A-Za-zÀ-ÿ_";
function word(k){ return new RegExp("(^|[^"+L+"])"+esc(k)+"(?![+"+L+"])", "g"); }
var RULES = [];
PROF.forEach(function(p){ RULES.push([word(p[0]), p[EN ? 2 : 1]]); });
/* marques dans les textes */
RULES.push([/PROFILS FUJI/g, EN ? "FILM PROFILES" : "PROFILS FILM"]);
RULES.push([/[Pp]rofils? Fuji/g, function(m){ return EN ? (/s /.test(m) ? "film profiles" : "film profile") : m.replace(/Fuji/, "film"); }]);
RULES.push([word("Fuji"), "film"]);
RULES.push([/APPRENDRE UN STYLE SNAPSEED/g, EN ? "LEARN A RETOUCH STYLE" : "APPRENDRE LA RETOUCHE"]);
RULES.push([/APPRENTISSAGE DU STYLE/g, EN ? "LEARNING THE STYLE" : "APPRENTISSAGE DU STYLE"]);

/* nom canonique d'un profil (pour les presets enregistres dans une autre langue) */
window.__jmsProfCanon = function(n){
  var t = String(n || "").trim().toLowerCase();
  for(var i = 0; i < PROF.length; i++) for(var j = 0; j < 3; j++) if(PROF[i][j].toLowerCase() === t) return PROF[i][0].toLowerCase();
  return t;
};
window.__jmsLang = lang;
try{ if(window.JMNative && window.JMNative.setLang) window.JMNative.setLang(lang); }catch(e){}
window.__jmsSetLang = function(l){ try{ localStorage.setItem("jms_lang", l); }catch(e){} location.reload(); };

/* ---------- dictionnaire anglais (morceaux de phrases francaises -> anglais) ---------- */
var D = EN ? {
"(17×17×17, format .cube).":"(17×17×17, .cube format).",
"(appliquée à l'enregistrement)":"(applied when saving)",
"(bouton bleu « Choisir… » en haut)":"(blue “Choose…” button at the top)",
"(dossier _SUPPRIMES)":"(_SUPPRIMES folder)",
"(lumière, couleurs). L'appli cherche les réglages qui s'en approchent.":"(light, colours). The app looks for the closest settings.",
"(même cadrage, sans recadrage). L'appli calcule les réglages équivalents.":"(same framing, no crop). The app works out the matching settings.",
"suppression à la fin, bouton rouge en haut":"deleted at the end, red button at the top",
"contraste +15":"contrast +15","ombres +25":"shadows +25","vibrance +15":"vibrance +15",
"--- contenu ---":"--- content ---",
"ANNULER":"CANCEL","APRÈS":"AFTER","ARRÊT EN COURS…":"STOPPING…","ARRÊTÉ":"STOPPED",
"AUTO : CORRIGER LA LUMIÈRE":"AUTO: FIX THE LIGHT","AVANT / APRÈS":"BEFORE / AFTER","AVANT":"BEFORE",
"Acces camera refuse.":"Camera access denied.",
"Activé :":"On:","Actuel :":"Current:",
"Affiche en grand le réglage que tu bouges":"Shows the setting you move in large text",
"Agrandit toute l'interface":"Enlarges the whole interface",
"Annulation impossible (le fichier a changé ou a disparu)":"Cannot undo (the file changed or disappeared)",
"Aperçu impossible pour cette image.":"No preview for this image.",
"Aperçu indisponible":"Preview unavailable",
"Aperçu — pense à ACTIVER pour l'appliquer au lot.":"Preview — remember to turn it ON to apply it to the batch.",
"Aperçu de la 1re photo…":"Preview of the 1st photo…",
"Appliquer ou supprimer tes réglages enregistrés":"Apply or delete your saved settings",
"Appliqués aux photos du lot et à l'export HD. Mets à 0 pour désactiver.":"Applied to batch photos and HD export. Set to 0 to turn off.",
"Associer un style à plusieurs noms de dossier d'un coup":"Link one style to several folder names at once",
"Aucun QR trouvé dans cette image. Recadre la capture sur le QR (fond bien visible) et réessaie.":"No QR found in this image. Crop the screenshot around the QR and try again.",
"Aucun lot pour l'instant.":"No batch yet.",
"Aucun preset a exporter.":"No preset to export.",
"Aucun preset. Fais tes réglages puis « ENREGISTRER MON RÉGLAGE ».":"No preset yet. Make your adjustments, then “SAVE MY SETTINGS”.",
"Aucun réglage modifié (image d'origine)":"No setting changed (original image)",
"Aucun réglage modifié":"No setting changed",
"Aucun style enregistré. Crée d'abord un preset (RÉGLAGES → MES PRESETS) ou apprends-en un.":"No saved style. First create a preset (SETTINGS → MY PRESETS) or learn one.",
"Aucun style enregistré. Crée d'abord un preset (onglet RÉGLAGES, puis MES PRESETS).":"No saved style. First create a preset (SETTINGS tab, then MY PRESETS).",
"Aucun style enregistré.":"No saved style.",
"Aucun style reconnu dans ce texte.":"No style found in this text.",
"Aucun style à exporter pour l'instant.":"No style to export yet.",
"Aucun style à sauvegarder.":"No style to back up.",
"Aucune camera detectee sur cet appareil.":"No camera found on this device.",
"Aucune image dans ce dossier":"No image in this folder",
"Aucune image prête à exporter.":"No image ready to export.",
"Aucune image à enregistrer":"No image to save",
"Aucune image":"No image",
"Aucune photo pour l'aperçu : choisis une image.":"No photo to preview: choose an image.",
"Aucun":"None",
"Blanc (filet noir)":"White (black line)",
"CADRE + SIGNATURE ACTIVÉ":"FRAME + SIGNATURE ON","CADRE + SIGNATURE":"FRAME + SIGNATURE",
"CLASSIQUE":"CLASSIC","CODE TEXTE":"TEXT CODE","COMPARAISON DES PROFILS":"PROFILE COMPARISON","COMPARER LES PROFILS":"COMPARE PROFILES",
"COPIER CE CONTENU":"COPY THIS CONTENT","COPIER":"COPY",
"Cadre, initiales / signature, texte, couleurs":"Frame, initials / signature, text, colours",
"Carré 1:1":"Square 1:1",
"Ce fichier ne contient aucun style reconnu.":"This file contains no recognised style.",
"Chargement de la mire":"Loading the test chart","Chargement…":"Loading…",
"Choisir une image ci-dessous":"Choose an image below",
"Choisir une image d'abord":"Choose an image first",
"Choisir…":"Choose…",
"Choisis d'abord un dossier (bouton « CHOISIR UN DOSSIER »).":"First choose a folder (“CHOOSE A FOLDER” button).",
"Choisis d'abord une image (bouton OUVRIR IMAGE en haut).":"First choose an image (OPEN IMAGE button at the top).",
"Choisis d'abord une image (onglet RÉGLAGES).":"First choose an image (SETTINGS tab).",
"Choisis d'abord une image et fais tes réglages.":"First choose an image and make your adjustments.",
"Choisis d'abord une image.":"First choose an image.",
"Choisis le style à mettre en QR.":"Choose the style to turn into a QR.",
"Choisis les deux photos.":"Choose both photos.",
"Choisissez d'abord le dossier d'enregistrement (bouton vert « Choisir… »)":"First choose the save folder (green “Choose…” button)",
"Choisissez d'abord le dossier d'enregistrement":"First choose the save folder",
"Choisissez le dossier d'images à regarder":"Choose the image folder to view",
"Choisissez le dossier où enregistrer (bouton vert « Choisir… »)":"Choose where to save (green “Choose…” button)",
"Choisissez un dossier d'images":"Choose an image folder",
"Ciel, visage, dégradé, grain, N&B, pinceau":"Sky, face, gradient, grain, B&W, brush",
"Clarté":"Clarity","Clarte":"Clarity",
"Classique (noir / filet blanc)":"Classic (black / white line)",
"Coche les styles. S'il y en a beaucoup, l'appli fait plusieurs QR (à lire un par un avec LIRE UN QR).":"Tick the styles. If there are many, the app makes several QRs (read them one by one with READ A QR).",
"Coche tes styles préférés : ils apparaissent en boutons dans RÉGLAGES.":"Tick your favourite styles: they appear as buttons in SETTINGS.",
"Code copié.":"Code copied.",
"Colle ici un code pour l'importer, ou copie / partage celui-ci.":"Paste a code here to import it, or copy / share this one.",
"Contenu copié.":"Content copied.",
"Contraste":"Contrast",
"Conversion approchée : compare avec ta photo et ajuste si besoin.":"Approximate conversion: compare with your photo and adjust if needed.",
"Copie en cours : la rotation sera sur l'image affichée, refaites-la après":"Copy in progress: the rotation applies to the displayed image, redo it afterwards",
"Copier, partager (WhatsApp…) ou coller un code":"Copy, share (WhatsApp…) or paste a code",
"Correction douce appliquée : exposition":"Gentle correction applied: exposure",
"Corrigé":"Edited",
"Couleur (désactivé)":"Colour (off)",
"Couleurs : extérieur • filet • intérieur":"Colours: outer • line • inner",
"Couleur":"Colour",
"Créer aussi un ZIP (Téléchargements/JM LAB PRO)":"Also create a ZIP (Downloads/JM LAB PRO)",
"Créer le code que Snapseed sait lire":"Create the code Snapseed can read",
"Curseur glissant sur ta photo":"Slider across your photo",
"Curseurs :":"Sliders:",
"DISCRET":"SUBTLE",
"Depuis une capture d'écran du QR":"From a screenshot of the QR",
"Distance au bord":"Distance from edge",
"Donne un nom au preset.":"Give the preset a name.",
"Dosage":"Strength",
"Dossier : Images / JM LAB PRO / LUT":"Folder: Pictures / JM LAB PRO / LUT",
"DÉFI DU JOUR":"DAILY CHALLENGE",
"Début (hex) :":"Start (hex):",
"Décompressé (":"Unpacked (",
"Déjà enregistrée ✔  (":"Already saved ✔  (",
"Désactivé":"Off",
"EFFETS & RETOUCHE LOCALE":"EFFECTS & LOCAL RETOUCH",
"EFFETS (ciel, visage, grain, N&B…)":"EFFECTS (sky, face, grain, B&W…)",
"EN COURS…":"RUNNING…","ENREGISTREMENT…":"SAVING…",
"ENREGISTRER DANS LA GALERIE":"SAVE TO GALLERY",
"ENREGISTRER + CRÉER UN LUT (.cube)":"SAVE + CREATE A LUT (.cube)",
"ENREGISTRER COMME NOUVEAU STYLE":"SAVE AS A NEW STYLE",
"ENREGISTRER LE PRESET":"SAVE THE PRESET",
"ENREGISTRER MON RÉGLAGE":"SAVE MY SETTINGS",
"ENREGISTRER QR":"SAVE QR",
"ENREGISTRÉ dans Images / JM LAB PRO":"SAVED in Pictures / JM LAB PRO",
"ENREGISTRÉE":"SAVED",
"ENREGISTRER":"SAVE",
"ERREUR :":"ERROR:",
"EXPORTER UN FICHIER":"EXPORT A FILE",
"Effets :":"Effects:",
"Elles sont déplacées dans le dossier « _SUPPRIMES » (récupérable).":"They are moved to the “_SUPPRIMES” folder (recoverable).",
"Enregistre d'abord quelques styles.":"Save a few styles first.",
"Enregistrement annulé :":"Save cancelled:",
"Enregistrement…":"Saving…",
"Enregistrer :":"Save to:",
"Enregistrées :":"Saved:",
"Erreur de lecture du dossier :":"Error reading the folder:",
"Erreur de lecture du dossier":"Error reading the folder",
"Erreur generation QR (trop de presets ?).":"QR generation error (too many presets?).",
"Erreur lors de la création du ZIP.":"Error while creating the ZIP.",
"Exposition / contraste adaptés à ta photo":"Exposure / contrast matched to your photo",
"Exposition":"Exposure",
"FERMER (garder mes réglages)":"CLOSE (keep my settings)",
"FERMER":"CLOSE",
"FICHE DE COURS":"LESSON SHEET","FICHE DE RÉGLAGES":"SETTINGS SHEET",
"Fichier .json / .txt de styles":".json / .txt styles file",
"Filtres Snapseed sans équivalent ici (ignorés) :":"Snapseed filters with no equivalent here (ignored):",
"Force":"Strength",
"GALERIE":"GALLERY",
"GRAND TEXTE (on / off)":"LARGE TEXT (on / off)",
"HISTORIQUE DES LOTS":"BATCH HISTORY",
"Hautes SANS GRIS":"Highlights NO GREY",
"Hautes":"Highlights",
"IMPORTER CE TEXTE":"IMPORT THIS TEXT","IMPORTER UN FICHIER":"IMPORT A FILE",
"INTENSITÉ & MÉLANGE":"INTENSITY & BLEND",
"Ignorés (pas de réglage équivalent) :":"Ignored (no equivalent setting):",
"Il reprend les réglages de couleur (profil, exposition manuelle, contraste, saturation…).":"It uses the colour settings (profile, manual exposure, contrast, saturation…).",
"Image avant / après + réglages, à donner aux élèves":"Before / after image + settings, to give to students",
"Image d'origine illisible.":"Original image unreadable.",
"Image illisible.":"Image unreadable.","Image illisible":"Image unreadable",
"Images / JM LAB PRO /":"Pictures / JM LAB PRO /",
"Impossible d'acceder a la camera depuis cette adresse (":"Cannot access the camera from this address (",
"Impossible d'acceder a la camera : ":"Cannot access the camera: ",
"Impossible d'activer le scan : le petit composant necessaire n'a pas pu se charger.":"Cannot start scanning: the required component could not load.",
"Impossible de generer le QR : le petit composant necessaire n'a pas pu se charger.":"Cannot create the QR: the required component could not load.",
"Intensité :":"Intensity:",
"La camera n'est pas accessible depuis cette page.":"The camera is not available from this page.",
"La visionneuse fonctionne dans l'appli Android JM LAB PRO.":"The viewer works in the JM LAB PRO Android app.",
"Le QR est bien lu, mais ce n'est pas un code JM LAB : le format Snapseed n'est pas public. Contenu brut ci-dessous, gardé dans l'appli.":"The QR was read, but it is not a JM LAB code: the Snapseed format is not public. Raw content below, kept in the app.",
"Le composant QR n'est pas chargé.":"The QR component is not loaded.",
"Le module ZIP interne n'a pas pu se charger. Recharge la page et réessaie.":"The internal ZIP module could not load. Reload and try again.",
"Lecture des couleurs":"Reading colours","Lecture du dossier…":"Reading folder…",
"Les réglages sont appliqués à l'image affichée.":"The settings are applied to the displayed image.",
"Longueur :":"Length:",
"MES FAVORIS":"MY FAVOURITES","MES PRESETS & QR":"MY PRESETS & QR","MES PRESETS (LISTE)":"MY PRESETS (LIST)","MES PRESETS":"MY PRESETS",
"MES STYLES":"MY STYLES",
"MODE COURS (on / off)":"LESSON MODE (on / off)",
"Mail : 1200 px, qualité 75":"Email: 1200 px, quality 75",
"Marque retirée :":"Mark removed:",
"Maximum : taille d'origine, qualité 92":"Maximum: original size, quality 92",
"Mes réglages actuels":"My current settings",
"Mode : ASSOMBRIR (bleu)":"Mode: DARKEN (blue)","Mode : ÉCLAIRCIR (jaune)":"Mode: LIGHTEN (yellow)",
"Mode cours activé : le nom et la valeur du réglage s'affichent en grand quand tu le bouges.":"Lesson mode on: the setting name and value show in large text when you move it.",
"Mode cours désactivé.":"Lesson mode off.",
"Mémoriser ce style pour ce nom de dossier":"Remember this style for this folder name",
"N&B filtre bleu":"B&W blue filter","N&B filtre jaune":"B&W yellow filter","N&B filtre rouge (ciel sombre)":"B&W red filter (dark sky)","N&B filtre vert":"B&W green filter",
"Noir & blanc neutre":"Neutral black & white","Noir & blanc":"Black & white",
"Nom du dossier":"Folder name","Nom du preset":"Preset name","Nom du style":"Style name",
"Noms de dossiers (séparés par une virgule)":"Folder names (separated by commas)",
"Ombres":"Shadows",
"Opacité du filigrane":"Watermark opacity",
"Originaux :":"Originals:",
"Ouvre d'abord une image":"Open an image first",
"PARTAGER":"SHARE",
"PRÊT À LANCER":"READY TO START","PRÊT":"READY",
"Part du style A :":"Share of style A:",
"Paysage 16:9":"Landscape 16:9",
"Personnalisé (3 couleurs)":"Custom (3 colours)",
"Photo avant + photo retouchée → réglages":"Before photo + edited photo → settings",
"Photos corrigées enregistrées directement":"Edited photos saved directly",
"Police":"Font",
"Pour le changer : annule, change de profil ou de réglage, puis relance.":"To change it: cancel, change the profile or settings, then start again.",
"Le lot reprend vos réglages actuels : profil, ProLab, curseurs, outils (Courbes, Détails, HDR…) et effets. Le correcteur, le recadrage, la sélection, le pinceau et la double exposition ne servent qu'à la photo ouverte. Pour partir d'une base propre : ":"The batch uses your current settings: profile, ProLab, sliders, tools (Curves, Details, HDR…) and effects. Healing, crop, selection, brush and double exposure only apply to the open photo. To start from a clean base: ",
"(ProLab gardé). Pour changer de style : annule, règle, puis relance.":"(ProLab kept). To change the style: cancel, adjust, then start again.",
"REPARTIR DE ZÉRO":"START FROM SCRATCH",
"Profil, curseurs, outils et effets remis à zéro — ProLab gardé":"Profile, sliders, tools and effects reset — ProLab kept",
"Remettre à zéro le profil, les curseurs, les outils (Retouches, Courbes, Détails, HDR…) et les effets ?":"Reset the profile, sliders, tools (Tune image, Curves, Details, HDR…) and effects?",
"ProLab, le cadre / signature et le filigrane sont gardés.":"ProLab, frame / signature and watermark are kept.",
"Outils / effets : ":"Tools / effects: ",
"Profil : ":"Profile: ",
"Profils introuvables.":"Profiles not found.",
"Profil :":"Profile:",
"Préparation de la mire":"Preparing the test chart",
"QR DE PLUSIEURS STYLES":"QR OF SEVERAL STYLES","QR EN IMAGE":"QR AS IMAGE","QR POUR SNAPSEED":"QR FOR SNAPSEED",
"QR Snapseed reconnu mais illisible :":"Snapseed QR recognised but unreadable:",
"QR SNAPSEED lu":"SNAPSEED QR read",
"LIRE UN QR SNAPSEED":"READ A SNAPSEED QR",
"RAW : copié tel quel (la rotation ne s'applique pas aux fichiers RAW)":"RAW: copied as is (rotation does not apply to RAW files)",
"Regarder :":"View:",
"Regarder un dossier, enregistrer une photo d'un geste":"Browse a folder, save a photo with one tap",
"Reglage actuel":"Current setting","Reglages de l'image":"Image settings",
"Remise en place de ta photo":"Restoring your photo",
"Ressemblance gagnée :":"Similarity gained:",
"Rien à annuler (seules les copies faites pendant cette session peuvent l'être)":"Nothing to undo (only copies made during this session can be undone)",
"Rotation de la copie impossible :":"Cannot rotate the copy:",
"RÉGLAGES":"SETTINGS",
"Référence":"Reference",
"Réglages de base (exposition, contraste, saturation, ambiance, ombres, hautes lumières, chaleur). Le vignettage n'est pas inclus.":"Basic settings (exposure, contrast, saturation, ambience, shadows, highlights, warmth). Vignette is not included.",
"Réglage":"Setting",
"SAUVEGARDE AUTO DES STYLES":"AUTO BACKUP OF STYLES","SAUVEGARDER MAINTENANT":"BACK UP NOW",
"STYLE DEPUIS UNE PHOTO DE RÉFÉRENCE":"STYLE FROM A REFERENCE PHOTO",
"STYLE DEPUIS UNE RÉFÉRENCE":"STYLE FROM A REFERENCE","STYLE DE RÉFÉRENCE":"REFERENCE STYLE",
"STYLE → PLUSIEURS DOSSIERS":"STYLE → SEVERAL FOLDERS",
"STYLE SNAPSEED IMPORTÉ ✔":"SNAPSEED STYLE IMPORTED ✔",
"STYLES PRÊTS":"READY-MADE STYLES",
"SUPPRIMER ?":"DELETE?",
"Sauvegardes":"Backups",
"Signature complète JM.Dargere":"Full signature JM.Dargere",
"Style + curseurs + effets → un preset à réutiliser":"Style + sliders + effects → a reusable preset",
"Style B (pour mélanger — facultatif)":"Style B (to blend — optional)",
"Style appliqué :":"Style applied:",
"Style du dossier":"Folder style",
"Suppression…":"Deleting…",
"Supprimer les":"Delete the",
"TERMINÉ (appliqué à l'export de cette photo)":"DONE (applied when this photo is exported)",
"TERMINÉ":"DONE",
"TOUT EFFACER":"CLEAR ALL",
"Taille (% du petit côté de la photo)":"Size (% of the photo's short side)",
"Taille":"Size",
"Teinte":"Tint","Temperature":"Temperature",
"Temps :":"Time:",
"Tes derniers lots, dossiers et styles":"Your latest batches, folders and styles",
"Tes styles préférés en boutons dans RÉGLAGES":"Your favourite styles as buttons in SETTINGS",
"Texte libre":"Free text","Texte":"Text",
"Textes dans les données :":"Text in the data:","Textes lisibles :":"Readable text:",
"Touche un profil pour l'appliquer.":"Tap a profile to apply it.",
"Tous mes styles → dossier Téléchargements/JM LAB PRO":"All my styles → Downloads/JM LAB PRO folder",
"Toutes les images sont enregistrées ✔":"All images are saved ✔",
"Transparence (opacité)":"Transparency (opacity)",
"Très léger : 1600 px, qualité 80":"Very light: 1600 px, quality 80",
"Type : lien web":"Type: web link",
"Un ou plusieurs QR pour tout transférer":"One or more QRs to transfer everything",
"Un style au hasard pour s'entraîner":"A random style to practise",
"Un style à 60 %, ou 2 styles mélangés":"A style at 60 %, or 2 styles blended",
"Un style → QR enregistré dans la galerie":"One style → QR saved in the gallery",
"Une copie de tous tes styles est enregistrée (Images/JM LAB PRO/Sauvegardes) au plus une fois par jour, seulement s'ils ont changé.":"A copy of all your styles is saved (Pictures/JM LAB PRO/Sauvegardes) at most once a day, only if they changed.",
"Une photo dont tu aimes le rendu":"A photo whose look you like",
"Ta photo à modifier":"Your photo to edit",
"une photo dont tu aimes le":"a photo whose look you like",
"VISIONNEUSE":"VIEWER",
"Voir, appliquer, scanner ou créer un QR":"View, apply, scan or create a QR",
"Web léger : 2480 px, qualité 85":"Light web: 2480 px, quality 85",
"aucun changement détecté":"no change detected","aucun changement":"no change",
"aucun curseur modifié":"no slider changed","aucun effet actif":"no effect on",
"curseur(s)":"slider(s)",
"dans MES PRESETS":"in MY PRESETS",
"dossier choisi":"chosen folder","dossier :":"folder:",
"dossier(s) associé(s) au style «":"folder(s) linked to style «",
"enregistrement…":"saving…",
"enregistrée(s)":"saved","erreur(s)":"error(s)",
"est dans MES PRESETS.":"is in MY PRESETS.",
"image suivante après enregistrement":"next image after saving",
"image(s) corrigée(s)":"image(s) edited",
"images traitées":"images processed",
"impossible(s)":"failed",
"non enregistrée (":"not saved (",
"octets décodés, début":"bytes decoded, start","octets, début":"bytes, start",
"pas de style dans ce lien":"no style in this link",
"peau lissée":"smoothed skin",
"pour me l'envoyer":"to send it to me",
"retouchée dans Snapseed":"edited in Snapseed",
"réglages actuels":"current settings",
"réponse illisible":"unreadable answer",
"(traitement de la photo en pleine taille)":"(processing the full-size photo)",
"écriture":"writing",
"signature complète":"full signature",
"style(s) JM LAB importé(s) ✔":"JM LAB style(s) imported ✔",
"style(s) enregistré(s) • import / export de toutes les façons":"saved style(s) • import / export every way",
"style(s) importé(s) ✔":"style(s) imported ✔",
"style(s) lu(s) dans le QR et importé(s) ✔":"style(s) read from the QR and imported ✔",
"texte «":"text «",
"» créé":"» created","» enregistré ✔":"» saved ✔","» enregistré":"» saved",
"Tu le retrouves dans MES PRESETS.":"You will find it in MY PRESETS.",
"» à une photo, puis améliore-le avec un seul curseur.":"» to a photo, then improve it with a single slider.",
"Épaisseur":"Thickness",
"à choisir":"to choose",
"échec(s)":"failure(s)",
"— aucun —":"— none —",
"— copie enregistrée mise à jour…":"— saved copy being updated…",
"la même photo":"the same photo",
"effets":"effects",
"RETOUR":"BACK","RÉGLER":"ADJUST",
"RESTE":"LEFT","ÉCOULÉ":"ELAPSED",
"Non enreg.":"Not saved",
"Annuler":"Undo","Rotation":"Rotate",
"CALCULER LE STYLE":"WORK OUT THE STYLE","CRÉER LES QR":"CREATE THE QRS",
"LANCER LA CORRECTION":"START EDITING",
"ÉCLAIRCIR":"LIGHTEN","ASSOMBRIR":"DARKEN",
"Qualité / taille":"Quality / size",
"DÉSACTIVÉ — touche pour activer":"OFF — tap to turn on",
"SIGNATURE":"SIGNATURE","Manuscrite":"Handwritten",
"Copie tournée :":"Rotated copy:",
"ACTIVÉE (toucher pour désactiver)":"ON (tap to turn off)",
"DÉSACTIVÉE (toucher pour activer)":"OFF (tap to turn on)",
"ASSOCIER":"LINK","VALIDER":"CONFIRM",
"Import du lot introuvable":"Batch import not found",
"Échec de l'enregistrement":"Save failed",
"FAVORIS":"FAVOURITES",
"Dégradé sombre en haut":"Dark gradient at the top",
"Assombrir le ciel (auto)":"Darken the sky (auto)",
"Réduction du bruit":"Noise reduction",
"Grain argentique":"Film grain",
"CRÉATION DU LUT":"CREATING THE LUT",
"Élégante (italique)":"Elegant (italic)",
"PHOTO DE RÉFÉRENCE":"REFERENCE PHOTO",
"Défi du jour : applique le style «":"Daily challenge: apply the style «",
"RÉSULTAT":"RESULT","VOIR LE RÉSULTAT SUR MA PHOTO":"SEE THE RESULT ON MY PHOTO",
"Peau lissée (visage)":"Smooth skin (face)",
"Gras":"Bold",
"CHOISIR UN DOSSIER (carte SD, clé USB…)":"CHOOSE A FOLDER (SD card, USB key…)",
"Dossier choisi":"Chosen folder",
"OUVRIR IMAGE":"OPEN IMAGE","OUVRIR UN LOT":"OPEN A BATCH",
"Condensée":"Condensed","Classique (serif)":"Classic (serif)",
"TÉLÉCHARGER LE ZIP":"DOWNLOAD THE ZIP",
"Recadrage prêt à publier":"Ready-to-post crop",
"MA PHOTO":"MY PHOTO","PHOTO D'ORIGINE":"ORIGINAL PHOTO",
"Netteté":"Sharpness",
"Moderne":"Modern",
"PINCEAU : ÉCLAIRCIR / ASSOMBRIR AU DOIGT":"BRUSH: LIGHTEN / DARKEN WITH YOUR FINGER","PINCEAU":"BRUSH",
"CADRE":"FRAME","Galerie":"Gallery",
"MARQUÉE à supprimer (":"MARKED for deletion (",
"À SUPPRIMER":"TO DELETE","OUI, SUPPRIMER":"YES, DELETE","Suppr":"Del",
"Décontractée":"Casual",
"Éclaircir visage / peau (auto)":"Brighten face / skin (auto)",
"PHOTO RETOUCHÉE SNAPSEED":"PHOTO EDITED IN SNAPSEED",
"Fin":"Thin",
"Initiales JM":"JM initials",
"Mon réglage":"My setting",
"Ombre portée":"Drop shadow",
"Ajouter un cadre":"Add a frame","Ajouter une signature":"Add a signature",
"Automatique (blanc / gris / noir selon la photo)":"Automatic (white / grey / black depending on the photo)",
"Photos corrigées":"Edited photos",
"Reset":"Reset",
"Corrigé ":"Edited ",
"Lot":"Batch",
"Profil":"Profile",
"Couleurs":"Colours",
"Blanc":"White","Noir":"Black",
"Temp":"Temp","Expo":"Expo",
"Choisir":"Choose",
"Ouvrir":"Open",
"Style":"Style",
"Original":"Original",
"Tu peux l'ajuster ou l'enregistrer comme style.":"You can adjust it or save it as a style.",
"Ta photo avec chaque profil, côte à côte":"Your photo with each profile, side by side",
"1) La photo":"1) The photo",
"Filigrane de protection (texte, vide = aucun)":"Protection watermark (text, empty = none)",
"aucun":"none",
"Aucun preset pour le moment.":"No preset yet.",
"Compression en cours...":"Compressing...",
"Contenu brut du QR (non reconnu) :":"Raw QR content (not recognised):",
"Depuis Snapseed":"From Snapseed",
"Enregistrer ce preset":"Save this preset",
"Ex: Snapseed Vintage":"E.g. Snapseed Vintage",
"Exporte tes presets en QR pour les transferer sur un autre appareil, ou scanne un QR genere par cette appli.":"Export your presets as QR to move them to another device, or scan a QR made by this app.",
"Le format des QR Snapseed est proprietaire et fermé : cette appli peut scanner le QR et t'afficher son contenu brut, mais ne peut pas l'interpreter automatiquement. Utilise la saisie manuelle pour recopier les valeurs.":"The Snapseed QR format is proprietary and closed: this app can scan the QR and show its raw content, but cannot read it automatically. Use manual entry to copy the values.",
"Mes presets":"My presets",
"Nom du preset :":"Preset name:",
"Parametres ignores (pas de reglage equivalent dans cette appli) :":"Ignored parameters (no equivalent setting in this app):",
"Partage QR (format maison)":"QR sharing (own format)",
"Presets enregistres":"Saved presets",
"preset(s) importe(s) !":"preset(s) imported!",
"\" importe !":"\" imported!",
"✓ prêt":"✓ ready","✕ erreur":"✕ error","en attente":"waiting",
"Télécharger le ZIP":"Download the ZIP",
"Saisie manuelle d'un preset":"Manual preset entry",
"Enregistrer les reglages actuels":"Save the current settings",
"Exporter mes presets en QR":"Export my presets as QR",
"Scanner un QR":"Scan a QR",
"Toutes les autres fonctions (retouche, presets film, export HD, lot ZIP) marchent":"All other features (editing, film presets, HD export, ZIP batch) work",
"normalement sans connexion.":"normally offline.",
"PROFILS FILM":"FILM PROFILES","GAMME ETENDUE":"EXTENDED RANGE","SANS GRIS":"NO GREY",
"Touchez OUVRIR IMAGE en haut":"Tap OPEN IMAGE at the top",
"MODE D'EMPLOI":"USER GUIDE","Le guide illustré de l'appli, et son PDF":"The illustrated app guide, and its PDF",
"EFFETS":"EFFECTS",
"Protection hautes lumières":"Highlight protection",
"PARTAGE":"SHARE"
} : {};

/* boutons caches que le code retrouve par leur texte : on n'y touche pas */
var KEEP = /^\s*(Telecharger HD|Lot \(file d'attente\)|Mon Instagram|Choisir Image|Installer App)\s*$/i;

var KEYS = Object.keys(D).sort(function(a,b){ return b.length - a.length; });
var DRX = KEYS.map(function(k){
  var a = /^[A-Za-zÀ-ÿ]/.test(k) ? "(^|[^"+L+"])" : "()", z = /[A-Za-zÀ-ÿ]$/.test(k) ? "(?!["+L+"])" : "";
  return [new RegExp(a + esc(k) + z, "g"), D[k]];
});
/* phrases construites avec des nombres */
var DYN = EN ? [
  [/(\d+) images? choisies?/g, function(m,n){ return n + (n === "1" ? " image selected" : " images selected"); }],
  [/(\d+) photos? choisies?/g, function(m,n){ return n + (n === "1" ? " photo selected" : " photos selected"); }]
] : [];

function rep(r){
  if(typeof r[1] === "function") return r[1];
  var t = r[1].replace(/\$/g, "$$$$");
  return /^\((\^\||\))/.test(r[0].source) ? "$1" + t : t;
}
function tr(s){
  if(!s || !/[A-Za-zÀ-ÿ]/.test(s) || KEEP.test(s)) return s;
  var o = s;
  for(var i = 0; i < RULES.length; i++) o = o.replace(RULES[i][0], rep(RULES[i]));
  if(EN){
    for(var j = 0; j < DYN.length; j++) o = o.replace(DYN[j][0], DYN[j][1]);
    for(var k = 0; k < DRX.length; k++){ if(o.indexOf(KEYS[k]) < 0) continue; o = o.replace(DRX[k][0], rep(DRX[k])); }
  }
  return o;
}
window.__jmsTr = tr;

/* ---------- application au texte affiche ---------- */
var SKIP = {SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1};
var done = new WeakMap();
function doText(n){
  var p = n.parentNode; if(!p || SKIP[p.nodeName] || (p.closest && p.closest(".hubOut, [contenteditable]"))) return;
  var v = n.nodeValue; if(done.get(n) === v) return;
  if(p.nodeName === "BUTTON" && KEEP.test(p.textContent)) return;
  var t = tr(v); done.set(n, t); if(t !== v) n.nodeValue = t;
}
function doAttr(el){
  ["placeholder","title","aria-label"].forEach(function(a){ var v = el.getAttribute && el.getAttribute(a); if(v){ var t = tr(v); if(t !== v) el.setAttribute(a, t); } });
}
function walk(root){
  if(root.nodeType === 3){ doText(root); return; }
  if(root.nodeType !== 1 || SKIP[root.nodeName] && root.nodeName !== "INPUT") { if(root.nodeName === "INPUT") doAttr(root); return; }
  doAttr(root);
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
  while((n = w.nextNode())){ if(n.nodeType === 3) doText(n); else doAttr(n); }
}
new MutationObserver(function(ms){
  ms.forEach(function(m){
    if(m.type === "characterData") doText(m.target);
    else if(m.type === "attributes") doAttr(m.target);
    else Array.prototype.forEach.call(m.addedNodes, walk);
  });
}).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["placeholder","title","aria-label"]});
walk(document.body);

/* fenetres d'alerte */
var A = window.alert, C = window.confirm, P = window.prompt;
window.alert = function(m){ return A.call(window, tr(String(m))); };
window.confirm = function(m){ return C.call(window, tr(String(m))); };
window.prompt = function(m, d){ return P.call(window, tr(String(m)), d); };
})();
