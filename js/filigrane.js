/* filigrane.js — source d'un média en filigrane, en bas à gauche, par-dessus la vidéo, le modèle 3D ou l'image.
   - au repos : la citation courte (credit_court), sur une mince bande sombre et translucide, pour la lisibilité
     sur n'importe quelle image (contraste minimum, WCAG 2.2, critère 1.4.3);
   - au toucher : la référence complète (credit) se déplie au même endroit, avec ses liens; elle se replie au toucher
     suivant, ou seule après 7 secondes;
   - le filigrane est posé à côté du média, et non dedans : son toucher ne met pas la vidéo en pause, ne fait pas
     tourner le modèle 3D et ne déplace pas l'image.
   Deux filigranes : Mur.filigrane.bas (zone du bas : vidéo ou entrée du scénario) et Mur.filigrane.objet (image de
   l'objet choisi, quand objets.json lui donne un crédit). */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const DELAI = 7000;

  function creer(hote) {
    const f = document.createElement('div');
    f.className = 'filigrane';
    f.hidden = true;
    const court = document.createElement('button');
    court.type = 'button';
    court.className = 'filigrane-court';
    court.setAttribute('aria-expanded', 'false');
    const complet = document.createElement('div');
    complet.className = 'filigrane-complet';
    complet.setAttribute('role', 'note');
    complet.hidden = true;
    f.append(court, complet);
    hote.appendChild(f);
    let minuterie = null;

    function replier() {
      clearTimeout(minuterie);
      minuterie = null;
      complet.hidden = true;
      court.hidden = false;
      court.setAttribute('aria-expanded', 'false');
    }
    function deplier() {
      if (!complet.innerHTML) return;
      court.hidden = true;
      complet.hidden = false;
      court.setAttribute('aria-expanded', 'true');
      clearTimeout(minuterie);
      minuterie = setTimeout(replier, DELAI);
    }
    for (const nom of ['pointerdown', 'click']) f.addEventListener(nom, e => e.stopPropagation());
    court.addEventListener('click', deplier);
    complet.addEventListener('click', e => { if (!e.target.closest('a')) replier(); });   // un lien s'ouvre sans replier

    /* credit : { court, complet } (texte au format des crédits : *italique*, [texte](lien)) ou null */
    function poser(credit) {
      replier();
      const c = credit && (credit.court || credit.complet) ? credit : null;
      f.hidden = !c;
      if (!c) { court.textContent = ''; complet.innerHTML = ''; return; }
      const ref = Mur.reference || (t => t);
      court.innerHTML = ref(c.court || 'Source');
      complet.innerHTML = ref(c.complet || c.court);
      court.setAttribute('aria-label', 'Source : ' + court.textContent + (c.complet ? '. Afficher la référence complète.' : ''));
    }
    return { poser, replier };
  }

  let bas = null, objet = null;
  Mur.filigrane = {
    creer,   // filigrane posé sur un autre média (cartes du parcours : js/pile.js)
    get bas() { return bas || (bas = creer(document.getElementById('video-bloc'))); },
    get objet() { return objet || (objet = creer(document.getElementById('objet-image'))); }
  };
})();
