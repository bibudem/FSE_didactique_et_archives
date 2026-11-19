/* ouverture.js — à l'ouverture de la page, avant l'accueil : une vidéo en plein écran (« ouverture », scenarios.json),
   une seule fois; « Accueil », depuis un scénario, ne la relance pas (12 novembre 2026, au soir).
   - la vidéo démarre aussitôt, avec le son si le navigateur le permet, sinon sans le son (lecture automatique :
     https://developer.chrome.com/blog/autoplay);
   - après 20 secondes de vidéo (titre_apres), le titre du thème s'affiche au-dessus de la vidéo, sur le fond noir,
     centré, en capitales grasses, sans guillemets, mot par mot : chaque mot tombe, plus gros et flou, puis se fixe; un
     trait blanc le souligne; il reste 15 secondes (titre_duree; 0 : jusqu'à la fin de la vidéo), en grossissant très
     lentement, puis s'efface (14 novembre 2026). Son nom en inuktitut, en syllabaire, qui suivait, est retiré depuis le
     14 novembre 2026;
   - toucher la vidéo, ou le bouton de pause, la met en pause ou la relance; le X (ou Échap) la quitte pour l'accueil;
     à la fin de la vidéo, l'accueil s'affiche;
   - la vidéo est un peu plus petite que l'écran (78 % de la hauteur; soir du 12 novembre 2026), en bas depuis le
     14 novembre 2026 : le titre, d'abord dessous, s'affiche au-dessus, sur le fond noir;
   - la source de la vidéo s'affiche en filigrane, en bas à gauche, comme sur les autres vidéos (js/filigrane.js);
   - sans vidéo (version publiée : vidéo à venir), un écran sombre l'annonce; le titre suit le même horaire.
   Ni en mode édition, ni avec ?ouverture=0 (js/etat.js). */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const O = { el: null, video: null, minuteries: [], fini: null, def: null, etat: 0, debut: 0, filigrane: null };

  const $ = id => document.getElementById(id);

  /* def : { video (adresse déjà résolue), titre (thème), credit, creditCourt, titreApres, titreDuree (secondes; 0 : jusqu'à la fin) }
     fini : appelée une fois, à la fermeture (X, Échap, fin de la vidéo) */
  function demarrer(def, fini) {
    const el = O.el = { racine: $('ouverture'), hote: $('ouverture-video'), absente: $('ouverture-absente'), titre: $('ouverture-titre'),
                        fr: $('ouverture-fr'), pause: $('btn-ouverture-pause'), fermer: $('btn-ouverture-fermer'),
                        lecture: $('btn-ouverture-lecture') };
    if (!el.racine) { if (fini) fini(); return; }
    O.fini = fini;
    O.def = def;
    O.etat = 0;
    poserTitre(def.titre || '', def.titreDuree);
    el.titre.className = '';
    el.racine.hidden = false;
    el.racine.classList.remove('ferme');
    document.getElementById('scene').classList.add('ouverture-active');
    if (Mur.filigrane && !O.filigrane) O.filigrane = Mur.filigrane.creer(el.racine);
    if (O.filigrane) O.filigrane.poser(def.video ? { court: def.creditCourt, complet: def.credit } : null);

    el.fermer.onclick = e => { e.stopPropagation(); fermer(); };
    el.pause.onclick = e => { e.stopPropagation(); basculer(); };
    el.lecture.onclick = e => { e.stopPropagation(); basculer(); };

    if (def.video) {
      el.absente.hidden = true;
      const v = O.video = document.createElement('video');
      v.preload = 'auto';
      v.playsInline = true;
      v.setAttribute('aria-label', def.libelle || 'Vidéo d\'ouverture');
      v.src = def.video;   // version autonome : adresse blob: (js/etat.js, adresse())
      el.hote.appendChild(v);
      if (Mur.video && Mur.video.surveiller) Mur.video.surveiller(v);   // image figée pendant la lecture : affichage relancé (js/video.js)
      v.addEventListener('click', basculer);   // toucher la vidéo : pause, ou lecture
      v.addEventListener('timeupdate', () => horaire(v.currentTime));
      v.addEventListener('play', majBoutons);
      v.addEventListener('pause', majBoutons);
      v.addEventListener('ended', fermer);
      // vidéo illisible : le message, et le titre suit l'horloge
      // adresse blob: refusée (version autonome) : une seule reprise avec l'adresse data: (js/etat.js)
      v.addEventListener('error', () => {
        if (def.secours && !v.dataset.secours) {   // une seule reprise
          v.dataset.secours = '1';
          v.src = def.secours;
          v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
          return;
        }
        el.absente.hidden = false;
        el.absente.textContent = 'Vidéo d\'ouverture illisible';
        majBoutons();
        horloge();
      });
      // avec le son d'abord; si le navigateur le refuse sans geste de la personne, sans le son
      v.muted = false;
      v.play().catch(() => { v.muted = true; return v.play(); }).catch(e => console.warn('Ouverture : lecture refusée :', e.message));
    } else {
      // vidéo à venir : l'horaire du titre suit l'horloge
      el.absente.hidden = false;
      el.absente.textContent = 'Vidéo d\'ouverture : à venir';
      horloge();
    }
    majBoutons();
  }

  // Titre mot par mot : un élément par mot (--i : son rang), pour l'effet; --n : nombre de mots, --duree : temps à l'écran
  function poserTitre(titre, duree) {
    const el = O.el, mots = titre.split(/\s+/).filter(Boolean);
    el.fr.textContent = '';
    mots.forEach((m, i) => {
      if (i) el.fr.appendChild(document.createTextNode(' '));
      const s = document.createElement('span');
      s.className = 'mot';
      s.style.setProperty('--i', i);
      s.textContent = m;
      el.fr.appendChild(s);
    });
    el.titre.style.setProperty('--n', mots.length);
    el.titre.style.setProperty('--duree', (duree > 0 ? duree + 2 : 120) + 's');
  }

  function horloge() {
    if (O.minuteries.length) return;
    O.debut = performance.now();
    O.minuteries.push(setInterval(() => horaire((performance.now() - O.debut) / 1000), 250));
  }

  // Titre : rien, puis le thème (après titreApres secondes), pendant titreDuree secondes, puis il s'efface
  function horaire(t) {
    const d = O.def;
    if (!d || !O.el) return;
    const etat = d.titreDuree > 0 && t >= d.titreApres + d.titreDuree ? 2 : t >= d.titreApres ? 1 : 0;
    if (etat === O.etat) return;
    O.etat = etat;
    O.el.titre.className = etat === 2 ? 'visible sortie' : etat === 1 ? 'visible' : '';   // « sortie » garde les mots posés
  }

  function basculer() {
    const v = O.video;
    if (!v) return;
    // relance : le toucher permet le son (la vidéo partie sans le son le retrouve)
    if (v.paused || v.ended) { v.muted = false; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    else v.pause();
  }

  function majBoutons() {
    const v = O.video, el = O.el;
    if (!el) return;
    const lisible = !!v && !v.error;   // vidéo absente ou illisible : ni pause ni pastille, seulement le X
    const enPause = lisible && (v.paused || v.ended);
    el.pause.hidden = !lisible;
    el.pause.setAttribute('aria-label', enPause ? 'Lecture' : 'Pause');
    el.pause.title = enPause ? 'Lecture' : 'Pause';
    el.pause.classList.toggle('en-pause', enPause);
    el.lecture.hidden = !enPause;   // pastille de lecture au centre, comme sur les autres vidéos
  }

  // Quitter l'ouverture (X, Échap, fin de la vidéo) : la vidéo s'arrête et se retire; l'accueil apparaît en fondu
  function fermer() {
    const el = O.el;
    if (!el || el.racine.hidden) return;
    O.minuteries.forEach(clearInterval);
    O.minuteries = [];
    if (O.video) { O.video.pause(); O.video.removeAttribute('src'); O.video.load(); O.video.remove(); O.video = null; }
    el.racine.classList.add('ferme');
    document.getElementById('scene').classList.remove('ouverture-active');
    setTimeout(() => { el.racine.hidden = true; el.racine.classList.remove('ferme'); }, 700);
    const f = O.fini;
    O.fini = null;
    O.def = null;
    if (f) f();
  }

  Mur.ouverture = { demarrer, fermer, get active() { return !!(O.el && !O.el.racine.hidden && !O.el.racine.classList.contains('ferme')); },
                    get video() { return O.video; } };
})();
