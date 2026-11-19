/* etat.js — états A à D de la page et transitions (conception détaillée, section 5.3).
   A · page d'accueil   B · scénario choisi   C · tableau blanc restauré   D · affichage plein écran
   Avant l'accueil, une seule fois, à l'ouverture de la page : la vidéo d'ouverture en plein écran (js/ouverture.js).
   Vidéo : pause à l'ouverture du tableau blanc et de l'affichage plein écran, sans reprise automatique.
   « Accueil » : nouveau départ (pile vidée); l'accueil n'a plus de vidéo, et la vidéo d'ouverture ne repart pas. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const $ = id => document.getElementById(id);
  const scene = $('scene');

  const E = { vue: 'A', base: 'A', avantPlein: null, scenarios: null, scenario: null, objets: new Map(),
              viewer: null, viewerPlein: null, courant: null, jeton: 0 };

  // ---------- Paramètres d'adresse (README.md) ----------
  const params = new URLSearchParams(window.MUR_PARAMS != null ? window.MUR_PARAMS : location.search);
  function nombre(nom, defaut, min, max) {
    const v = parseFloat(params.get(nom));
    return isFinite(v) ? Math.max(min, Math.min(max, v)) : defaut;
  }
  /* Écran : le mur (11 520 × 2 160 px, 27 écrans) ou un écran 16:9 (1 920 × 1 080 px), pour présenter
     la maquette sur un ordinateur ou un projecteur : ?ecran=16x9 (version autonome : outils/assembler.py --ecran 16x9). */
  const E169 = (params.get('ecran') || window.MUR_ECRAN || '') === '16x9';
  const LARGEUR = E169 ? 1920 : 11520, HAUTEUR = E169 ? 1080 : 2160;
  const TEXTE = E169 ? nombre('texte', 16, 10, 40) : nombre('texte', 44, 24, 72);   // taille de base du texte, en px
  const ECHELLE = nombre('echelle', 0, 0.05, 1);    // 0 : automatique (page entière dans la fenêtre)
  const GRILLE = params.get('grille') === '1';      // jonctions des écrans, pour l'aperçu
  const EVITER = params.get('eviter') === '3-4';    // écrans hors service : colonnes 3 et 4, rangées 1 et 2 (mur seulement)
  const COTE = E169 && params.get('edition') === '1';   // mode édition en 16:9 : panneau à droite de la page (js/edition.js)
  /* Trois appareils, trois scénarios (13 novembre 2026) : ?scenario=N ouvre aussitôt le scénario N, sans la vidéo d'ouverture;
     chaque appareil diffuse son écran sur un tiers du mur (3 840 × 2 160 px, soit le format 16:9 : ?ecran=16x9). */
  const SCENARIO = parseInt(params.get('scenario'), 10);
  // Parcours (?parcours=1, js/parcours.js) : chaque geste noté avec l'heure, dans ce navigateur
  const noter = (evenement, d) => { if (Mur.parcours) Mur.parcours.noter(evenement, d); };

  // ---------- Fichiers : lus sur le site, ou intégrés dans la version autonome ----------
  function integre(chemin) { return window.MUR_INTEGRE ? window.MUR_INTEGRE[chemin] : undefined; }
  async function lireJSON(chemin) {
    const i = integre(chemin);
    if (i !== undefined) return JSON.parse(JSON.stringify(i));
    const r = await fetch(chemin);
    if (!r.ok) throw new Error(chemin + ' : HTTP ' + r.status);
    return r.json();
  }
  async function lireTexte(chemin) {
    if (!chemin) return null;
    const i = integre(chemin);
    if (i !== undefined) return i;
    const r = await fetch(chemin);
    if (!r.ok) throw new Error(chemin + ' : HTTP ' + r.status);
    return r.text();
  }
  /* Vidéo intégrée (version autonome) : l'adresse data: (le fichier en base64) devient une adresse blob:, une seule fois.
     Sur le Mac, l'image de la vidéo d'ouverture (45,6 Mo, intégrée en data:) se figeait alors que la lecture continuait
     (signalé le soir du 12 novembre 2026; même symptôme au début d'un scénario le 10 novembre 2026, js/video.js).
     Cause non confirmée : la longue adresse data: est l'hypothèse retenue; l'adresse blob: évite au navigateur de relire
     le texte base64, et la surveillance de js/video.js relance l'affichage s'il se fige encore. */
  const blobs = {};
  function versBlob(uri) {
    try {
      const virgule = uri.indexOf(',');
      const type = uri.slice(5, uri.indexOf(';')) || 'video/mp4';
      const binaire = atob(uri.slice(virgule + 1));
      const octets = new Uint8Array(binaire.length);
      for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
      return URL.createObjectURL(new Blob([octets], { type }));
    } catch (e) { console.warn('Vidéo intégrée : adresse blob impossible :', e.message); return uri; }
  }
  function adresse(chemin) {
    if (!chemin) return null;
    if (blobs[chemin]) return blobs[chemin];
    const i = integre(chemin);
    if (typeof i === 'string' && /^data:video\//.test(i)) return (blobs[chemin] = versBlob(i));
    return i || chemin;
  }
  // adresse de secours d'une vidéo intégrée : l'adresse data: elle-même, si le navigateur refuse l'adresse blob:
  function secours(chemin) { const i = chemin ? integre(chemin) : null; return typeof i === 'string' && blobs[chemin] && blobs[chemin] !== i ? i : null; }
  Mur.adresse = adresse;

  // ---------- Échelle : 1 au mur (11 520 × 2 160 px); réduite pour l'aperçu sur un ordinateur ----------
  function ajusterEchelle() {
    const auto = !ECHELLE;
    const cote = COTE ? Math.round(Math.min(480, Math.max(340, window.innerWidth * 0.3))) : 0;   // largeur du panneau d'édition
    document.body.style.setProperty('--edition-largeur', cote + 'px');
    const largeur = window.innerWidth - cote;
    const k = auto ? Math.min(E169 ? 4 : 1, largeur / LARGEUR, window.innerHeight / HAUTEUR) : ECHELLE;   // 16:9 : peut aussi agrandir
    const l = LARGEUR * k, h = HAUTEUR * k;
    scene.style.transform = k === 1 ? '' : 'scale(' + k + ')';
    scene.style.left = auto ? Math.max(0, (largeur - l) / 2) + 'px' : '0';
    scene.style.top = auto ? Math.max(0, (window.innerHeight - h) / 2) + 'px' : '0';
    document.body.classList.toggle('defilement', !auto);
    $('cadre').style.width = auto ? '' : l + 'px';
    $('cadre').style.height = auto ? '' : h + 'px';
    Mur.visionneuse.echelle(scene, k);
  }

  // ---------- États ----------
  function appliquer() {
    scene.dataset.etat = E.vue;
    scene.dataset.base = E.base;
    majConsignes();
  }

  function choisirScenario(sc) {
    const s = sc && sc.donnees;
    if (!s) return;
    E.scenario = Object.assign({ numero: sc.numero }, s);
    // départ : l'image de départ du fil, ou la carte de l'entrée (scénario 2), pour le CSV du parcours (14 novembre 2026)
    const depart = (s.entree && s.entree.objet) || (s.parcours && s.parcours.depart) || '';
    const od = depart && E.objets.get(depart);
    noter('scénario choisi', { scenario: sc.numero, titre: s.titre, objet: depart, detail: od ? (od.titre_court || od.titre || '') : '' });
    reduireVideo();
    boiteAGauche(false);   // le titre seul, à droite, jusqu'à ce que l'entrée prenne sa taille
    fermerObjet();
    E.base = 'B';
    if (E.vue !== 'C') E.vue = 'B';
    appliquer();
    // zone de droite, dans un scénario : son titre seul (à l'accueil : le thème seul); question du thème et sous-question
    // retirées le 12 novembre 2026
    $('theme').textContent = insecables(s.titre);   // pas de « : » en début de ligne
    // la même boîte, à gauche, inversée, quand la notice prend la zone de droite (css/mur.css)
    $('carre-gauche').querySelector('.titre').textContent = insecables(s.titre);
    $('carre-gauche').querySelector('.question').textContent = s.question || '';
    $('question-scenario').textContent = s.question || '';   // dans le carré, sous le titre (soir du 12 novembre 2026); \n : saut de ligne (css/mur.css)
    ajusterCarre();
    /* Logique commune : en haut à gauche, le parcours est une pile de cartes (js/pile.js); toucher un élément d'une
       carte, ou un point du modèle 3D de l'entrée, pose une autre carte par-dessus. En bas : la vidéo ou l'entrée,
       et la ligne du temps, qui suit le fil des choix. */
    const ent = s.entree && E.objets.get(s.entree.objet);
    const parcours = s.parcours || null;
    let vide = parcours ? '' : 'Parcours à venir.';
    if (ent) {
      // nom de l'entrée : titre_entree (scenario-N.json), sinon le titre de l'objet
      Mur.video.charger({ libelle: s.titre_entree || ent.titre, src: null, absente: '' });
      Mur.filigrane.bas.poser({ court: s.credit_court, complet: s.credit });   // source en filigrane sur l'entrée
      $('bas').dataset.entree = scene.dataset.entree = s.entree.type;   // modèle 3D : plus de place (css/mur.css)
      if (s.entree.type === 'carte') {   // carte comparative (js/carte.js) : carte ancienne de l'EDSR sur une carte récente
        E.entree = { carte: true, champs: champsLocaux(ent) };
        Mur.entree.charger({ type: 'carte', titre: ent.titre, carte: Object.assign({}, s.carte, { points: s.points_carte || {}, objets: E.objets }) });
        // la carte ancienne en plein écran, puis à sa place (js/carte.js); pas en mode édition
        if (!scene.classList.contains('edition') && Mur.carte) Mur.carte.introduire(); else if (Mur.carte) Mur.carte.inviter();
      } else {
        E.entree = { modele: ent.modele3d ? adresse(ent.modele3d) : null, image: ent.modele3d ? null : adresse(ent.image), champs: champsLocaux(ent) };
        Mur.entree.charger({ type: s.entree.type, src: E.entree.modele || E.entree.image, titre: ent.titre, points: s.points || [] });
      }
      $('entree-commandes').hidden = s.entree.type === 'carte';   // carte comparative fixe : ni zoom ni plein écran
      if (parcours && !parcours.depart) vide = '';   // pile vide au départ, sans texte : chaque point de l'entrée pose sa carte
    } else {
      sansEntree();
      // entrée à venir : vidéo absente, ou modèle 3D ou photographie pas encore choisis (entree.objet = null)
      const nom = !s.entree ? 'Vidéo' : s.entree.type === 'modele3d' ? 'Modèle 3D' : s.entree.type === 'carte' ? 'Carte' : 'Photographie';
      // libellé : le nom de la vidéo (titre_video)
      // la vidéo du scénario joue en boucle : elle continue de jouer, réduite (soir du 12 novembre 2026)
      Mur.video.charger({ libelle: s.titre_video || nom, src: adresse(s.video), secours: secours(s.video), repeter: true, sousTitres: s.textes.sousTitres,
                          credit: s.credit, creditCourt: s.credit_court, absente: nom + ' du scénario : à venir' });
      if (E.vue === 'B' && s.video) {
        Mur.video.lecture();   // la vidéo du scénario démarre aussitôt
        agrandirVideo();       // en plus grand pendant 20 secondes
      }
    }
    // carte comparative (scénario 2) : pas de fil ni de carte de départ; la pile ne reçoit que les images des points de la
    // carte, sans éléments
    const pile = s.entree && s.entree.type === 'carte' && parcours ? { depart: null, cartes: {} } : parcours;
    Mur.pile.charger({ objets: E.objets, titre: s.titre, parcours: pile, vide, main: !(s.entree && s.entree.type === 'carte') });
    // sans vidéo agrandie (vidéo à venir, mode édition, tableau blanc ouvert) : la boîte passe aussitôt à gauche; carte
    // comparative : quand la carte de Jaillot est arrivée à sa place (événement mur:entree-prete de js/carte.js)
    if (!(E.entree && E.entree.carte) && !scene.classList.contains('video-grande')) boiteAGauche(true);
    document.dispatchEvent(new CustomEvent('mur:scenario'));   // mode édition (js/edition.js)
  }

  function sansEntree() {
    Mur.entree.vider();
    E.entree = null;
    $('bas').dataset.entree = scene.dataset.entree = 'video';
    $('entree-commandes').hidden = true;
  }

  /* Scénarios 1 et 3 (entrée par une vidéo) : à l'ouverture, la vidéo s'affiche deux fois plus grande (au mur, 2 × 2 écrans;
     en 16:9, 1 280 × 720 px), par-dessus le parcours et la ligne du temps, pendant 20 secondes, puis reprend sa taille.
     La première carte du parcours n'apparaît qu'ensuite (css/mur.css). Un toucher ailleurs dans la page ramène aussitôt
     la vidéo à sa taille. */
  const VIDEO_GRANDE = 20000;
  function agrandirVideo() {
    clearTimeout(E.minuterieVideo);
    if (scene.classList.contains('edition')) return;   // mode édition (js/edition.js) : la pile reste visible
    scene.classList.add('video-grande');
    E.minuterieVideo = setTimeout(reduireVideo, VIDEO_GRANDE);
  }
  function reduireVideo() {
    clearTimeout(E.minuterieVideo);
    E.minuterieVideo = null;
    const grande = scene.classList.contains('video-grande');
    scene.classList.remove('video-grande');
    if (grande && E.base === 'B') boiteAGauche(true);   // la vidéo, réduite, continue de jouer; le titre et la question passent à gauche
    if (grande) noter('vidéo réduite');
  }

  /* Titre et question du scénario (soir du 12 novembre 2026) : d'abord le titre seul, à droite, dans le carré; dès que l'entrée
     a pris sa taille (vidéo réduite après ses 20 secondes en grand, carte de Jaillot arrivée à sa place, ou aussitôt sans
     vidéo agrandie), la boîte passe à gauche, avec la question, et y reste (css/mur.css, data-gauche). */
  function boiteAGauche(oui) {
    scene.dataset.gauche = oui ? 'oui' : 'non';
    if (oui) ajuster($('carre-gauche'));
  }

  /* Vidéo en plein écran, en tout temps (icône en bas à droite de la vidéo) : la vidéo couvre tout le mur, ou tout
     l'écran 16:9, et continue de jouer; la même icône, ou Échap, la ramène à sa place. */
  function videoPleinEcran(oui) {
    if (oui) reduireVideo();
    if (scene.classList.contains('video-plein') !== !!oui) noter(oui ? 'vidéo en plein écran' : 'vidéo : plein écran quitté');
    scene.classList.toggle('video-plein', !!oui);
    const b = $('btn-plein-video');
    const nom = oui ? 'Quitter le plein écran' : 'Affichage plein écran';
    b.setAttribute('aria-label', nom);
    b.title = nom;
    b.setAttribute('aria-pressed', oui ? 'true' : 'false');
  }

  function champsLocaux(o) {
    return { titre: o.titre, createur: liste(o.createur), collectivite: liste(o.collectivite), date: liste(o.date), description: liste(o.description), dimensions: liste(o.dimensions),
             source: liste(o.source), note_pedagogique: liste(o.note_pedagogique), lien: liste(o.lien), licence: liste(o.licence) };
  }

  function allerAccueil() {
    if (E.base === 'B') noter('accueil');
    reduireVideo();
    videoPleinEcran(false);
    fermerObjet();
    sansEntree();
    Mur.pile.vider();
    E.scenario = null;
    $('theme').textContent = '«\u00a0' + E.scenarios.theme + '\u00a0»';
    E.base = 'A';
    if (E.vue !== 'C') E.vue = 'A';
    boiteAGauche(false);
    viderVideo();
    appliquer();
    document.dispatchEvent(new CustomEvent('mur:scenario'));
  }

  function revenirAuScenario() {
    fermerObjet();
    appliquer();
  }

  // Image d'une carte touchée : sa notice s'ouvre dans la zone de droite
  function ouvrirObjet(id) {
    if (E.base !== 'B') return;
    afficherObjet(id);
  }

  // Le tableau blanc s'ouvre dans une fenêtre à part, posée sur sa zone (js/tableau-blanc.js)
  function afficherTableau() { noter('tableau blanc ouvert'); reduireVideo(); videoPleinEcran(false); Mur.video.pause(); E.vue = 'C'; appliquer(); Mur.tableauBlanc.ouvrir(); }
  function reduireTableau() { if (E.vue === 'C') noter('tableau blanc réduit'); Mur.tableauBlanc.fermer(); E.vue = E.base; appliquer(); }   // la vidéo réapparaît, en pause

  // Affichage plein écran de l'objet choisi (zone des notices) ou de l'entrée du scénario (zone du bas)
  // source : 'entree', 'objet', ou { image | service | modele, champs } (carte du parcours)
  function ouvrirPlein(source) {
    const c = source === 'entree' ? E.entree : source === 'objet' ? E.courant : source;
    if (!c || !(c.service || c.modele || c.image)) return;   // la carte comparative (scénario 2) ne passe pas en plein écran
    noter('plein écran', { objet: source === 'objet' ? E.courant.id : source === 'entree' ? ((E.scenario && E.scenario.entree && E.scenario.entree.objet) || '') : (c.id || ''),
                           titre: c.champs && c.champs.titre });
    reduireVideo();
    videoPleinEcran(false);
    Mur.video.pause();
    Mur.tableauBlanc.fermer();   // la fenêtre du tableau blanc couvrirait l'affichage plein écran
    E.avantPlein = E.vue;
    E.vue = 'D';
    appliquer();
    remplirEncadre(c.champs);
    if (c.modele) E.modelePlein = creerModele($('visionneuse-plein'), c.modele, c.champs.titre);
    else if (c.image) E.viewerPlein = Mur.visionneuse.ouvrirImage($('visionneuse-plein'), c.image, { visibilityRatio: 0.8 });
    else E.viewerPlein = Mur.visionneuse.ouvrir($('visionneuse-plein'), c.service, { visibilityRatio: 0.8 });
  }

  function fermerPlein() {
    if (E.vue === 'D') noter('plein écran fermé');
    if (E.viewerPlein) { E.viewerPlein.destroy(); E.viewerPlein = null; }
    if (E.modelePlein) { E.modelePlein.remove(); E.modelePlein = null; }
    E.vue = E.avantPlein || E.base;
    E.avantPlein = null;
    appliquer();
    if (E.vue === 'C') Mur.tableauBlanc.ouvrir();   // retour à l'état C : la fenêtre revient
  }

  // Carte du parcours : son image en plein écran (fichier du dépôt, modèle 3D ou image IIIF de la première toile)
  async function agrandirCarte(id) {
    const o = E.objets.get(id);
    if (!o || E.base !== 'B') return;
    if (o.image) return ouvrirPlein({ id, image: adresse(o.image), champs: o.notice === false ? { titre: o.titre, sansNotice: true } : champsLocaux(o) });
    if (o.modele3d) return ouvrirPlein({ id, modele: adresse(o.modele3d), champs: champsLocaux(o) });
    if (!o.manifeste) return;
    try {
      const m = await Mur.iiif.lire(o.manifeste);
      const ch = Mur.iiif.champs(m);
      if (!ch.titre || ch.titre.includes('\uFFFD')) ch.titre = o.titre;   // « � » : accents perdus dans l'EDSR
      const svc = Mur.iiif.service(m);
      if (svc) ouvrirPlein({ id, service: svc, champs: ch });
    } catch (err) { console.error('Manifeste illisible (' + o.manifeste + ') :', err); }
  }

  /* Zoom avant et arrière (barre du plein écran) : image (OpenSeadragon) ou modèle 3D (méthode zoom de model-viewer 4.4.0,
     dans lib/model-viewer-umd.min.js : chaque pas équivaut à un cran de molette) */
  const PAS_MODELE = 12;
  function zoomer(facteur) {
    if (E.modelePlein) { if (E.modelePlein.zoom) E.modelePlein.zoom(facteur > 1 ? PAS_MODELE : -PAS_MODELE); return; }
    const viewer = E.viewerPlein;
    if (!viewer) return;
    viewer.viewport.zoomBy(facteur);
    viewer.viewport.applyConstraints();
  }

  function reinitialiserVue() {
    if (E.viewerPlein) E.viewerPlein.viewport.goHome();
    if (E.modelePlein) reinitialiserModele(E.modelePlein);
  }

  /* Modèle 3D (glTF binaire, .glb) dans une visionneuse 3D : model-viewer 4.4.0 (lib/model-viewer-umd.min.js).
     Faire défiler un doigt : tourner autour du modèle; agrandir/réduire : deux doigts. */
  const ORBITE = '-45deg 80deg 105%';   // vue de face, comme la vignette du scénario 2
  function creerModele(conteneur, src, titre) {
    if (!window.customElements || !customElements.get('model-viewer')) { messageImage('Visionneuse 3D non chargée (lib/model-viewer-umd.min.js).'); return null; }
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', src);
    mv.setAttribute('alt', 'Modèle 3D : ' + (titre || ''));
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('touch-action', 'none');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('camera-orbit', ORBITE);
    mv.setAttribute('shadow-intensity', '1');
    conteneur.appendChild(mv);
    return mv;
  }
  function reinitialiserModele(mv) {
    mv.cameraOrbit = ORBITE;
    mv.cameraTarget = 'auto auto auto';
    mv.fieldOfView = 'auto';
    if (mv.jumpCameraToGoal) mv.jumpCameraToGoal();
  }

  // ---------- Zone « Visualisation et description de l'objet » ----------
  /* Image de la notice : aperçu fixe, sans commandes (l'image s'explore en plein écran, depuis sa carte) */
  const APERCU = { mouseNavEnabled: false };
  function detruireViewer() {
    if (E.viewer) { E.viewer.destroy(); E.viewer = null; }
    if (E.modele) { E.modele.remove(); E.modele = null; }
  }

  function fermerObjet() {
    E.jeton++;
    detruireViewer();
    E.courant = null;
    scene.dataset.objet = 'non';
  }

  function messageImage(texte) {
    const m = $('message-image');
    m.hidden = !texte;
    m.textContent = texte || '';
  }

  async function afficherObjet(id) {
    const o = E.objets.get(id);
    if (!o) return;
    const jeton = ++E.jeton;
    if (!E.courant || E.courant.id !== id) noter('notice ouverte', { objet: id, titre: o.titre });   // pas deux fois la même notice de suite
    scene.dataset.objet = 'oui';
    ajuster($('carre-gauche'));   // titre et question du scénario, à gauche, dans la boîte inversée
    E.courant = { id, service: null, champs: { titre: o.titre } };
    remplirDescription(id, E.courant.champs, 'lecture');
    remplirMots(o);
    remplirAssocies();
    document.querySelectorAll('#visualisation .defile').forEach(d => { d.scrollTop = 0; });   // nouvelle notice : en haut
    detruireViewer();
    // source en filigrane sur l'image ou le modèle 3D, si objets.json donne un crédit (objet conservé dans le dépôt du site)
    Mur.filigrane.objet.poser(o.credit || o.credit_court ? { court: o.credit_court, complet: o.credit } : null);
    if (o.depot === 'site' && o.image) {   // image conservée dans le dépôt du site : métadonnées dans donnees/objets.json
      const ch = champsLocaux(o);
      const src = adresse(o.image);
      E.courant = { id, service: null, image: src, champs: o.notice === false ? { titre: ch.titre, sansNotice: true } : ch };
      remplirDescription(id, ch, o.notice === false ? 'sans-notice' : undefined);   // "notice": false (objets.json) : titre seul
      messageImage('Chargement de l\'image…');
      E.viewer = Mur.visionneuse.ouvrirImage($('visionneuse'), src, APERCU);
      E.viewer.addOnceHandler('open', () => { if (jeton === E.jeton) messageImage(null); });
      E.viewer.addOnceHandler('open-failed', () => { if (jeton === E.jeton) messageImage('Image non ouverte : ' + o.image); });
      return;
    }
    if (o.modele3d) {   // objet conservé dans le dépôt du site : métadonnées dans donnees/objets.json
      const ch = champsLocaux(o);
      const src = adresse(o.modele3d);
      E.courant = { id, service: null, modele: src, champs: ch };
      remplirDescription(id, ch);
      messageImage('Chargement du modèle 3D…');
      E.modele = creerModele($('visionneuse'), src, o.titre);
      if (E.modele) {
        E.modele.addEventListener('load', () => { if (jeton === E.jeton) messageImage(null); }, { once: true });
        E.modele.addEventListener('error', () => { if (jeton === E.jeton) messageImage('Modèle 3D non ouvert : ' + o.modele3d); }, { once: true });
      }
      return;
    }
    messageImage('Lecture du manifeste…');
    try {
      const m = await Mur.iiif.lire(o.manifeste);
      if (jeton !== E.jeton) return;
      const ch = Mur.iiif.champs(m);
      if (!ch.titre || ch.titre.includes('\uFFFD')) ch.titre = o.titre;   // « � » : accents perdus dans l'EDSR
      const svc = Mur.iiif.service(m);
      E.courant = { id, service: svc, champs: ch };
      remplirDescription(id, ch);
      remplirMots(o, ch);
      if (!svc) { messageImage('Aucune image dans le manifeste.'); return; }
      E.viewer = Mur.visionneuse.ouvrir($('visionneuse'), svc, APERCU);
      E.viewer.addOnceHandler('open', () => { if (jeton === E.jeton) messageImage(null); });
      E.viewer.addOnceHandler('open-failed', ev => { if (jeton === E.jeton) messageImage('Image non ouverte : ' + (ev.message || 'erreur du service d\'image')); });
    } catch (e) {
      if (jeton !== E.jeton) return;
      remplirDescription(id, { titre: o.titre }, 'erreur', e.message);
      messageImage('Lecture du manifeste impossible.');
      console.error('Manifeste illisible (' + o.manifeste + ') :', e);
    }
  }

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte != null) el.textContent = texte;
    return el;
  }

  function valeur(liste) { return liste && liste.length ? liste.join(' · ') : null; }
  // Référence bibliographique : texte échappé; *titre* en italique (style APA)
  /* Référence (style APA) : *titre* en italique; [texte](https://…) devient un hyperlien, pour ne pas afficher l'adresse complète */
  function reference(t) {
    return String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  Mur.reference = reference;
  function liste(v) { return v == null || v === '' ? [] : (Array.isArray(v) ? v : [v]); }

  function remplirDescription(id, ch, etat, erreur, cible) {
    const d = cible || $('objet-description');
    d.textContent = '';
    d.appendChild(element('h3', 'titre', ch.titre || id));
    if (etat === 'lecture') { d.appendChild(element('p', 'etat-lecture', 'Lecture du manifeste IIIF…')); return; }
    if (etat === 'sans-notice') return;
    if (etat === 'erreur') {
      d.appendChild(element('p', 'etat-lecture erreur', 'Manifeste illisible : ' + erreur + '. Voir la console du navigateur.'));
      d.appendChild(element('p', 'etat-lecture', 'Lien permanent : hdl.handle.net/' + id));
      return;
    }
    if (valeur(ch.note_contextualisation)) d.appendChild(element('p', 'contexte', valeur(ch.note_contextualisation)));
    const dl = element('dl');
    const ligne = (nom, v, facultatif) => {
      if (!v && facultatif) return;
      dl.appendChild(element('dt', null, nom));
      dl.appendChild(element('dd', v ? null : 'a-venir', v || 'à venir'));
    };
    if (ch.entrees && ch.entrees.length) {
      /* Notice de l'EDSR au complet : toutes les entrées du manifeste, dans leur ordre, avec leurs étiquettes.
         Seuls les mots-clés passent au bloc « Mots-clés » (remplirMots); « [placeholder] » s'affiche « à venir ». */
      const ATTENTE = Mur.iiif.ATTENTE;
      for (const e of ch.entrees) {
        if (e.etiquette === 'Mot-clé (s)' || e.etiquette === 'Mots-clés') continue;
        const vals = e.valeurs.filter(v => !ATTENTE.test(v)).map(v => v.replace(/^https?:\/\//, ''));
        if (e.etiquette === 'Titre' && vals.join(' ') === ch.titre) continue;   // déjà en tête de la notice
        const nom = /^[a-zà-ÿ]+$/.test(e.etiquette) ? e.etiquette.charAt(0).toUpperCase() + e.etiquette.slice(1) : e.etiquette;   // « description » → « Description »; les autres étiquettes telles quelles
        ligne(nom, vals.length ? vals.join(' · ') : null);
      }
      const a = x => ch.entrees.some(e => e.etiquette === x);
      if (!a('Note pédagogique')) ligne('Note pédagogique', valeur(ch.note_pedagogique));
      if (!a('Permalien') && /^\d+(\.\d+)*\/\d+$/.test(id)) ligne('Lien permanent', 'hdl.handle.net/' + id);
      d.appendChild(dl);
      return;
    }
    ligne('Créateur', valeur(ch.createur), true);
    ligne('Collectivité', valeur(ch.collectivite), true);
    ligne('Date', valeur(ch.date));
    ligne('Autre titre', valeur(ch.autre_titre), true);
    ligne('Description', valeur(ch.description), true);
    ligne('Dimensions', valeur(ch.dimensions), true);
    ligne('Source', valeur(ch.source));
    ligne('Droits', valeur(ch.droits), true);
    ligne('Note pédagogique', valeur(ch.note_pedagogique));
    ligne('Licence', valeur(ch.licence), true);
    const lien = (ch.lien && ch.lien[0]) || (/^\d+(\.\d+)*\/\d+$/.test(id) ? 'https://hdl.handle.net/' + id : null);
    ligne('Lien permanent', lien ? lien.replace(/^https?:\/\//, '') : null, !/^\d+(\.\d+)*\/\d+$/.test(id));   // omis si l'objet n'en a pas
    d.appendChild(dl);
  }

  // Mots-clés : ceux du fichier de données, puis ceux de la notice de l'EDSR (« Mot-clé (s) »), sans doublon
  function remplirMots(o, ch) {
    const ul = $('liste-mots');
    ul.textContent = '';
    const vus = new Set();
    const edsr = ((ch && ch.entrees) || []).filter(e => e.etiquette === 'Mot-clé (s)' || e.etiquette === 'Mots-clés').flatMap(e => e.valeurs);
    for (const m of (o.mots_cles || []).concat(edsr)) {
      const cle = m.trim().toLocaleLowerCase('fr').replace(/[’']/g, "'");
      if (!m.trim() || vus.has(cle) || Mur.iiif.ATTENTE.test(m)) continue;
      vus.add(cle);
      ul.appendChild(element('li', null, m.trim()));
    }
  }

  function vignette(id, conteneur, hauteur) {
    const o = E.objets.get(id);
    if (!o) return;
    if (o.vignette) {
      const img = new Image();
      img.alt = '';
      img.src = adresse(o.vignette);
      conteneur.textContent = '';
      conteneur.appendChild(img);
      return;
    }
    if (!o.manifeste) return;
    Mur.iiif.lire(o.manifeste).then(m => {
      const svc = Mur.iiif.service(m);
      if (!svc) return;
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.src = Mur.iiif.vignette(svc, hauteur);
      conteneur.textContent = '';
      conteneur.appendChild(img);
    }).catch(() => {});
  }

  /* Objets associés : les cartes liées aux éléments de la carte ouverte; toucher l'une d'elles la pose sur la pile */
  function remplirAssocies() {
    const div = $('liste-associes');
    div.textContent = '';
    const liens = E.courant ? Mur.pile.liens(E.courant.id) : [];
    if (!liens.length) { div.appendChild(element('p', 'aucun', 'Aucun objet associé.')); return; }
    for (const z of liens) {
      const b = element('button', 'associe');
      b.type = 'button';
      const v = element('span', 'vignette');
      const t = element('span', 'texte');
      t.appendChild(element('span', 'nom', Mur.pile.libelle(z.vers)));
      t.appendChild(element('span', 'commun', 'Élément de l\'image : ' + z.libelle));
      b.append(v, t);
      b.title = (E.objets.get(z.vers) || {}).titre || z.vers;
      b.addEventListener('click', () => Mur.pile.choisir(z.vers, z.libelle));
      div.appendChild(b);
      vignette(z.vers, v, 260);
    }
  }


  function remplirEncadre(ch) {
    const d = $('plein-encadre');
    d.textContent = '';
    d.appendChild(element('p', 'titre', ch.titre));
    if (ch.sansNotice) return;   // objet sans notice : titre seul
    const lignes = [['Source', valeur(ch.source)], ['Date', valeur(ch.date)]];
    if (valeur(ch.createur)) lignes.unshift(['Créateur', valeur(ch.createur)]);
    if (valeur(ch.licence)) lignes.push(['Licence', valeur(ch.licence)]);
    else if (valeur(ch.droits)) lignes.push(['Droits', valeur(ch.droits)]);
    for (const [nom, v] of lignes) {
      const p = element('p');
      p.appendChild(element('strong', null, nom + ' : '));
      p.appendChild(element('span', v ? null : 'a-venir', v || 'à venir'));
      d.appendChild(p);
    }
  }

  // ---------- Zones « Parcours thématique » (état A) et « Vidéo/Tableau blanc » ----------
  /* Cartes de scénario, comme des vignettes de vidéos : image, bouton de lecture et durée, puis titre et
     métadonnées. Toucher la vignette choisit le scénario et lance sa vidéo. */
  function construireAccueil() {
    const acc = $('accueil');
    acc.textContent = '';
    for (const sc of E.scenarios.scenarios) {
      const carte = element('article', 'carte');
      const titre = sc.titre || sc.entree || ('Scénario ' + sc.numero);
      const jouable = !!sc.donnees;
      const v = element(jouable ? 'button' : 'div', 'vignette-video' + (jouable ? '' : ' a-decrire'));
      const typeEntree = jouable && sc.donnees.entree ? sc.donnees.entree.type : null;
      const modele3d = typeEntree === 'modele3d';
      const imageSeule = typeEntree === 'image';   // entrée par une image : icône d'image
      const carteEntree = typeEntree === 'carte';   // entrée par une carte comparative : icône de carte pliée
      if (jouable) {
        v.type = 'button';
        v.setAttribute('aria-label', (modele3d || imageSeule || carteEntree ? 'Ouvrir le scénario ' : 'Lire le scénario ') + sc.numero + ' : ' + titre);
        v.addEventListener('click', () => choisirScenario(sc));
      }
      // image : lien permanent d'un objet (image IIIF de l'EDSR) ou fichier du dépôt (medias/…)
      const image = element('span', 'image' + (sc.image ? '' : ' sans-image'), sc.image ? '' : (jouable ? 'Image à venir' : 'Scénario à décrire'));
      if (sc.image && /^\d+(\.\d+)*\/\d+$/.test(sc.image)) vignette(sc.image, image, 900);
      else if (sc.image) {
        const img = new Image();
        img.alt = '';
        img.addEventListener('error', () => { img.remove(); image.classList.add('sans-image'); image.textContent = 'Image à venir'; }, { once: true });   // fichier absent
        img.src = adresse(sc.image);
        image.appendChild(img);
      }
      v.appendChild(image);
      if (jouable) {
        /* icône : lecture pour une vidéo; cube en perspective pour un modèle 3D; cadre avec montagnes et soleil pour une image
           (cube et image dessinés pour le projet) */
        const lecture = element('span', 'lecture');
        lecture.setAttribute('aria-hidden', 'true');
        lecture.innerHTML = carteEntree
          ? '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 6.2 8.6 4l6.8 2.4L21 4.2v13.6L15.4 20l-6.8-2.4L3 19.8Z" opacity=".55"/><path d="M8.6 4v13.6l6.8 2.4V6.4Z"/></svg>'
          : modele3d
          ? '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.2 19.6 7.6 12 12 4.4 7.6Z"/><path d="M4.4 8.7 11.4 12.8V20.9L4.4 16.8Z" opacity=".72"/><path d="M19.6 8.7 12.6 12.8V20.9L19.6 16.8Z" opacity=".46"/></svg>'
          : imageSeule
            ? '<svg viewBox="0 0 24 24" focusable="false"><path fill-rule="evenodd" d="M3 5h18v14H3ZM5 7v10h14V7Z"/><path d="M6.5 15.5 10 11l3 3.6 2-2.1 2.5 3Z"/><circle cx="15.3" cy="9.7" r="1.5"/></svg>'
            : '<svg viewBox="0 0 24 24" focusable="false"><path d="M8 5v14l11-7z"/></svg>';
        if (imageSeule) lecture.classList.add('modele');
        if (modele3d || carteEntree) lecture.classList.add('modele');
        v.append(lecture);   // l'icône dit le type d'entrée (lecture, cube, image) : pas de mention en bas à droite
      }
      carte.appendChild(v);
      const infos = element('div', 'infos');
      infos.appendChild(element('p', 'numero', 'Scénario ' + sc.numero));   // sous l'image, au-dessus du titre
      infos.appendChild(element('h2', null, insecables(titre)));
      if (!jouable) infos.appendChild(element('p', 'meta', 'À décrire'));
      if (sc.description) infos.appendChild(element('p', 'description', sc.description));
      // citation très courte sous l'image; la référence complète s'affiche au parcours (sous la vidéo ou l'entrée)
      const court = sc.credit_court || sc.credit;
      if (court) { const c = element('p', 'credit'); c.innerHTML = reference(court); infos.appendChild(c); }
      carte.appendChild(infos);
      acc.appendChild(carte);
    }
    $('theme').textContent = '«\u00a0' + E.scenarios.theme + '\u00a0»';
  }

  /* Carré du titre du scénario : si la question, sous la boîte du titre, déborde du carré (au mur, le texte reste dans la
     colonne 8 : une longue question y prend beaucoup de lignes), sa taille diminue par pas de 6 %, jusqu'à ce qu'elle tienne */
  function ajusterCarre() { ajuster($('question')); }
  /* Même règle pour la boîte de gauche, plus basse (au mur, la rangée 1; en 16:9, au scénario 2, au-dessus de la carte) :
     la question diminue d'abord (jusqu'à 60 % de sa taille), puis le titre */
  function ajuster(boite) {
    const textes = [boite.querySelector('#question-scenario, .question'), boite.querySelector('#theme, .titre')].filter(Boolean);
    textes.forEach(e => { e.style.fontSize = ''; });
    // déborde : un texte dépasse la boîte, ou empiète sur plus de la moitié de sa marge du bas
    const deborde = () => {
      if (!boite.offsetParent) return false;
      const r = boite.getBoundingClientRect(), k = r.height / (boite.offsetHeight || 1);
      const marge = parseFloat(getComputedStyle(boite).paddingBottom) * k / 2;
      return boite.scrollHeight > boite.clientHeight + 1 || textes.some(e => e.textContent && e.getBoundingClientRect().bottom > r.bottom - marge + 1);
    };
    for (const e of textes) {
      const depart = parseFloat(getComputedStyle(e).fontSize);
      for (let n = 0; n < 12 && e.textContent && deborde() && parseFloat(getComputedStyle(e).fontSize) > depart * 0.6; n++) {
        e.style.fontSize = (parseFloat(getComputedStyle(e).fontSize) * 0.94) + 'px';
      }
    }
  }

  // Typographie : espace insécable avant le deux-points (pas de « : » en début de ligne)
  function insecables(t) { return t == null ? t : String(t).replace(/ :/g, '\u00a0:'); }

  /* Accueil : plus de vidéo depuis le soir du 12 novembre 2026 (la vidéo d'introduction est devenue celle du scénario 3;
     la vidéo du scénario 3 est devenue la vidéo d'ouverture); la zone du bas n'a plus que le menu du coin */
  function viderVideo() { Mur.video.charger({ libelle: '', src: null, absente: '' }); }

  /* Ouverture (js/ouverture.js) : la vidéo d'ouverture en plein écran, une seule fois, à l'ouverture de la page; puis
     l'accueil. Ni en mode édition, ni avec ?notices=1, ni avec ?ouverture=0. */
  function ouvrir() {
    const o = E.scenarios && E.scenarios.ouverture;
    if (!o || !Mur.ouverture || params.get('ouverture') === '0' || params.get('edition') === '1' || params.get('notices') === '1') return;
    noter('vidéo d\'ouverture');
    Mur.ouverture.demarrer({ video: adresse(o.video), secours: secours(o.video), libelle: o.titre_video, titre: E.scenarios.theme,
                             credit: o.credit, creditCourt: o.credit_court,
                             titreApres: o.titre_apres != null ? o.titre_apres : 20, titreDuree: o.titre_duree != null ? o.titre_duree : 15 });
  }

  function majConsignes() {
    const c = (E.scenario && E.scenario.consignes) || (E.scenarios && E.scenarios.consignes);
    const p = $('texte-consignes');
    p.textContent = c || 'Consignes à rédiger.';
    p.classList.toggle('a-venir', !c);
  }

  function afficherMessage(texte) {
    const m = $('message');
    m.hidden = false;
    m.innerHTML = texte;
  }

  // ---------- Démarrage ----------
  async function demarrer() {
    scene.style.setProperty('--t', TEXTE + 'px');
    scene.classList.toggle('e169', E169);
    scene.classList.toggle('grille', GRILLE && !E169);
    scene.classList.toggle('eviter-3-4', EVITER && !E169);
    ajusterEchelle();
    window.addEventListener('resize', ajusterEchelle);

    Mur.pile.init({
      elements: { pile: $('pile'), vide: $('pile-vide'), precedente: $('btn-precedente'), suivante: $('btn-suivante'),
                  ligne: $('ligne-temps'), progression: $('ligne-progression'), pastilles: $('pastilles') },
      adresse,
      // carte du dessus changée : la notice ouverte suit la carte
      rappels: { notice: ouvrirObjet, agrandir: agrandirCarte, accueil: allerAccueil, scenario: revenirAuScenario,
                 carte: id => { if (E.courant && E.courant.id !== id && E.base === 'B') afficherObjet(id); } }
    });
    Mur.video.init({
      elements: { hote: $('video-hote'), absente: $('video-absente'), libelle: $('video-libelle'), bouton: $('btn-lecture'), progression: $('video-progression') }
    });
    Mur.tableauBlanc.init({
      onglet: E169,   // 16:9 : la salle s'ouvre dans un nouvel onglet; au mur : dans une fenêtre posée sur sa zone
      elements: { cadre: $('tableau-cadre'), message: $('tableau-message'), ramener: $('btn-ramener'), lien: $('salle-lien'),
                  formulaire: $('salle-formulaire'), champ: $('salle-champ'), erreur: $('salle-erreur'), oublier: $('btn-oublier') },
      rappels: { fermee: () => { if (E.vue === 'C') { noter('tableau blanc fermé'); E.vue = E.base; appliquer(); } } }   // fenêtre fermée à la main
    });
    // vidéo agrandie : un toucher ailleurs dans la page la ramène à sa taille (le toucher garde son effet)
    // carte comparative (scénario 2) : la carte de Jaillot est à sa place (js/carte.js) : la boîte passe à gauche
    document.addEventListener('mur:entree-prete', () => { if (E.base === 'B' && E.entree && E.entree.carte) boiteAGauche(true); });
    document.addEventListener('pointerdown', e => {
      if (scene.classList.contains('video-grande') && !e.target.closest('#video-bloc')) reduireVideo();
    }, true);
    // État C : après un toucher dans la page, la fenêtre du tableau blanc revient au premier plan (sauf dans les consignes)
    document.addEventListener('pointerup', e => {
      if (E.vue === 'C' && !e.target.closest('#consignes, #tableau')) setTimeout(Mur.tableauBlanc.premierPlan, 0);
    });
    /* Menu du coin (bas à gauche) : le bouton du coin déploie « Accueil » et « Tableau blanc »; le menu se replie après un
       choix, au toucher du bouton du coin, ou de lui-même après 8 secondes */
    const coin = { menu: $('coin-menu'), bouton: $('btn-coin'), minuterie: null };
    const replier = () => { clearTimeout(coin.minuterie); coin.menu.hidden = true; coin.bouton.setAttribute('aria-expanded', 'false'); scene.classList.remove('coin-ouvert'); };
    coin.bouton.addEventListener('click', () => {
      if (!coin.menu.hidden) { replier(); return; }
      coin.menu.hidden = false;
      coin.bouton.setAttribute('aria-expanded', 'true');
      scene.classList.add('coin-ouvert');
      coin.minuterie = setTimeout(replier, 8000);
    });
    $('btn-accueil').addEventListener('click', () => { replier(); allerAccueil(); });
    $('btn-tableau').addEventListener('click', () => { replier(); afficherTableau(); });
    $('btn-parcours').addEventListener('click', replier);   // le panneau « Parcours » s'ouvre (js/parcours.js)
    $('btn-reduire').addEventListener('click', reduireTableau);
    $('btn-centrer-entree').addEventListener('click', () => Mur.entree.reinitialiser());
    $('btn-zoom-plus-entree').addEventListener('click', () => Mur.entree.zoomer(1.5));
    $('btn-zoom-moins-entree').addEventListener('click', () => Mur.entree.zoomer(1 / 1.5));
    /* Notice, mots-clés, objets associés : aucun texte ni objet coupé par le bord du bloc. Les lignes de texte (et les
       mots-clés et objets associés, chacun d'un bloc) sont mesurées; une bande de la couleur du fond couvre, à partir de
       la première ligne coupée, ce qui ne tient pas en entier (en bas, et en haut après un défilement). Quand il reste de
       la suite, un chevron (« v ») apparaît au bas du bloc; le toucher amène la première ligne cachée en haut du bloc. */
    const ENTIERS = 'li, .associe';   // mots-clés et objets associés : jamais coupés entre deux lignes
    function lignes(d) {
      const res = [];
      d.querySelectorAll(ENTIERS).forEach(e => res.push(e.getBoundingClientRect()));
      const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() && !n.parentElement.closest(ENTIERS) ? 1 : 3 });
      const r = document.createRange();
      for (let n = w.nextNode(); n; n = w.nextNode()) { r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.height) res.push(q); }
      return res;
    }
    document.querySelectorAll('.defilant').forEach(bloc => {
      const d = bloc.querySelector('.defile');
      const basBande = bloc.querySelector('.cache-bas'), hautBande = bloc.querySelector('.cache-haut');
      let premiereCachee = null;
      const maj = () => {
        const suite = d.scrollTop + d.clientHeight < d.scrollHeight - 2;
        bloc.classList.toggle('suite', suite);
        const r = bloc.getBoundingClientRect(), k = r.height / bloc.offsetHeight || 1;   // k : échelle de la page
        let coupeBas = Infinity, coupeHaut = -Infinity;
        for (const q of lignes(d)) {
          if (q.top < r.bottom - 0.5 && q.bottom > r.bottom + 0.5) coupeBas = Math.min(coupeBas, q.top);
          if (q.top < r.top - 0.5 && q.bottom > r.top + 0.5) coupeHaut = Math.max(coupeHaut, q.bottom);
        }
        premiereCachee = coupeBas < Infinity ? coupeBas : null;
        basBande.style.top = coupeBas < Infinity ? (coupeBas - r.top) / k + 'px' : '100%';
        hautBande.style.height = coupeHaut > -Infinity ? (coupeHaut - r.top) / k + 'px' : '0';
        // fond en dégradé : un masque efface les lignes coupées (css/mur.css, .defile)
        d.style.setProperty('--bas', coupeBas < Infinity ? (coupeBas - r.top) / k + 'px' : '100%');
        d.style.setProperty('--haut', coupeHaut > -Infinity ? (coupeHaut - r.top) / k + 'px' : '0px');
      };
      d.addEventListener('scroll', maj, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(maj).observe(d);
      new MutationObserver(maj).observe(d, { childList: true, subtree: true, characterData: true });
      d.addEventListener('load', maj, true);   // vignettes des objets associés
      // « v » : la première ligne cachée passe en haut du bloc (rien ne revient deux fois)
      bloc.querySelector('.defiler').addEventListener('click', () => {
        const r = bloc.getBoundingClientRect(), k = r.height / bloc.offsetHeight || 1;
        const haut = parseFloat(getComputedStyle(d).paddingTop) || 0;
        const cible = premiereCachee != null ? d.scrollTop + (premiereCachee - r.top) / k - haut : d.scrollTop + d.clientHeight;
        d.scrollTo({ top: Math.max(d.scrollTop + 1, cible), behavior: 'smooth' });
      });
    });
    $('btn-reduire-consignes').addEventListener('click', reduireTableau);
    $('btn-plein-entree').addEventListener('click', () => ouvrirPlein('entree'));
    $('btn-plein-video').addEventListener('click', () => videoPleinEcran(!scene.classList.contains('video-plein')));
    Mur.entree.init({ elements: { hote: $('entree-hote') },
                      rappels: { repere: (id, libelle) => { if (E.base === 'B') Mur.pile.choisir(id, libelle); },
                                 poser: (ids, libelle) => { if (E.base === 'B') Mur.pile.poser(ids, libelle); },   // carte comparative
                                 agrandir: agrandirCarte } });
    $('btn-fermer').addEventListener('click', fermerPlein);
    $('btn-reinitialiser').addEventListener('click', reinitialiserVue);
    $('btn-zoom-plus-plein').addEventListener('click', () => zoomer(1.5));
    $('btn-zoom-moins-plein').addEventListener('click', () => zoomer(1 / 1.5));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (Mur.ouverture && Mur.ouverture.active) { Mur.ouverture.fermer(); return; }
      if (scene.classList.contains('video-plein')) videoPleinEcran(false);
      else if (E.vue === 'D') fermerPlein(); else if (E.vue === 'C') reduireTableau();
    });

    try {
      const [scenarios, objets] = await Promise.all([lireJSON('donnees/scenarios.json'), lireJSON('donnees/objets.json')]);
      E.scenarios = scenarios;
      E.objets = new Map(objets.map(o => [o.id, o]));
      for (const sc of scenarios.scenarios) {
        if (!sc.fichier) continue;
        const s = await lireJSON(sc.fichier);
        s.textes = { sousTitres: await lireTexte(s.sous_titres) };
        sc.donnees = s;
      }
      construireAccueil();
      viderVideo();
      appliquer();
      noter('page ouverte', { scenario: '', detail: (E169 ? '16:9' : 'mur') + (SCENARIO ? ', scénario ' + SCENARIO + ' demandé' : '') });
      const demande = SCENARIO ? scenarios.scenarios.find(x => x.numero === SCENARIO && x.donnees) : null;
      if (SCENARIO && !demande) console.warn('?scenario=' + SCENARIO + ' : scénario introuvable ou sans données; la page s\'ouvre normalement.');
      if (params.get('notices') === '1') afficherNotices();
      else if (demande && params.get('edition') !== '1') choisirScenario(demande);   // ?scenario=N : sans vidéo d'ouverture
      else ouvrir();
    } catch (e) {
      console.error(e);
      afficherMessage(location.protocol === 'file:'
        ? 'Ouverte comme fichier local, la page ne peut pas lire ses fichiers de données. Ouvrir plutôt <code>maquette-autonome.html</code>, ou servir le dossier avec <code>python3 -m http.server</code>, puis ouvrir <code>http://localhost:8000</code>.'
        : 'Lecture des données impossible : ' + e.message.replace(/[<>&]/g, '') + '.');
    }
  }

  /* ---------- Vérification des notices (?notices=1) ----------
     Toutes les notices, telles que la maquette les affiche (même fonction remplirDescription), avec les champs
     absents et le lien vers l'original. Les notices de l'EDSR sont lues en direct dans les manifestes IIIF. */
  async function champsNotice(o) {
    if (!o.manifeste) return o.notice === false ? { ch: { titre: o.titre }, etat: 'sans-notice' } : { ch: champsLocaux(o) };
    try {
      const m = await Mur.iiif.lire(o.manifeste);
      const ch = Mur.iiif.champs(m);
      ch.sansImage = !Mur.iiif.service(m);
      const remplace = (ch.titre || '').includes('\uFFFD');
      if (!ch.titre || remplace) ch.titre = o.titre;
      return { ch, remplace };
    } catch (e) { return { ch: { titre: o.titre }, etat: 'erreur', erreur: e.message }; }
  }

  async function afficherNotices() {
    const vue = element('section');
    vue.id = 'notices';
    vue.setAttribute('aria-label', 'Vérification des notices');
    const tete = element('header');
    tete.appendChild(element('h1', null, 'Vérification des notices'));
    const resume = element('p', 'resume', 'Lecture des notices…');
    tete.appendChild(resume);
    const fermer = element('button', 'bouton', 'Fermer');
    fermer.type = 'button';
    fermer.addEventListener('click', () => vue.remove());
    tete.appendChild(fermer);
    vue.appendChild(tete);
    const liste = element('ol');
    vue.appendChild(liste);
    document.body.appendChild(vue);
    const objets = [...E.objets.values()];
    const resultats = await Promise.all(objets.map(champsNotice));
    const compte = {};
    objets.forEach((o, i) => {
      const { ch, etat, erreur, remplace } = resultats[i];
      const handle = /^\d+(\.\d+)*\/\d+$/.test(o.id);
      const lien = (ch.lien && ch.lien[0]) || (handle ? 'https://hdl.handle.net/' + o.id : null);
      const manque = [];
      if (etat === 'erreur') manque.push('manifeste illisible');
      else if (etat === 'sans-notice') manque.push('notice (titre seulement)');
      else {
        if (!valeur(ch.createur) && !valeur(ch.collectivite)) manque.push('créateur');
        if (!valeur(ch.date)) manque.push('date');
        if (!valeur(ch.description)) manque.push('description');
        if (!valeur(ch.source)) manque.push('source');
        if (!valeur(ch.licence) && !valeur(ch.droits)) manque.push('licence ou droits');
        if (!lien) manque.push("lien vers l'original");
        if (!valeur(ch.note_pedagogique)) manque.push('note pédagogique');
        if (o.manifeste && !valeur(ch.note_contextualisation)) manque.push('note de contextualisation');
        if (ch.sansImage) manque.push('image (aucune toile dans le manifeste)');
      }
      if (remplace || JSON.stringify(ch).includes('\uFFFD')) manque.push('accents illisibles (« � ») dans la notice reçue');
      manque.forEach(m => { compte[m] = (compte[m] || 0) + 1; });
      const li = element('li', manque.length ? 'a-verifier' : 'complete');
      const entete = element('div', 'entete');
      entete.appendChild(element('span', 'provenance', o.manifeste ? 'EDSR, notice lue dans le manifeste IIIF' : 'Fichier du site, notice dans donnees/objets.json'));
      entete.appendChild(element('code', null, o.id));
      if (lien) { const a = element('a', null, "Voir l'original"); a.href = lien; a.target = '_blank'; a.rel = 'noopener'; entete.appendChild(a); }
      if (o.manifeste) { const a = element('a', null, 'Manifeste'); a.href = o.manifeste; a.target = '_blank'; a.rel = 'noopener'; entete.appendChild(a); }
      li.appendChild(entete);
      const notice = element('div', 'notice');
      remplirDescription(o.id, ch, etat, erreur, notice);
      li.appendChild(notice);
      if (o.credit || o.credit_court) {
        const p = element('p', 'credit');
        p.innerHTML = '<strong>Crédit sous l\'image</strong> : ' + reference(o.credit || o.credit_court);
        li.appendChild(p);
      }
      li.appendChild(element('p', 'manque', manque.length ? 'À vérifier : ' + manque.join(', ') : 'Rien d\'absent'));
      liste.appendChild(li);
    });
    const lignes = Object.entries(compte).sort((a, b) => b[1] - a[1]).map(([m, n]) => m + ' : ' + n);
    resume.textContent = objets.length + ' objets. ' + (lignes.length ? 'Champs absents ou à vérifier — ' + lignes.join('; ') + '.' : 'Aucun champ absent.');
  }

  Mur.etat = { get vue() { return E.vue; }, get base() { return E.base; }, get visionneuses() { return { objet: E.viewer, plein: E.viewerPlein }; }, ouvrirObjet, allerAccueil, afficherTableau, reduireTableau, ouvrirPlein, fermerPlein,
                // mode édition (js/edition.js) : données chargées (scenarios.json, scénarios, objets) et scénario ouvert
                get scenarios() { return E.scenarios; }, get objets() { return E.objets; },
                get numero() { return E.scenario ? E.scenario.numero : null; },
                get donneesScenario() { const sc = E.scenario && E.scenarios.scenarios.find(x => x.numero === E.scenario.numero); return sc ? sc.donnees : null; },
                get entree() { return E.entree; }, reference, adresse,
                ouvrirScenario: n => choisirScenario(E.scenarios.scenarios.find(x => x.numero === n)) };
  Mur.etat.pret = demarrer();
})();
