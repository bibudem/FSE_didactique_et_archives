/* entree.js — entrée d'un scénario par un modèle 3D, une image (le territoire) ou une carte comparative, dans la zone du bas.
   Logique commune aux trois scénarios :
   - en bas, l'entrée guide le parcours : la vidéo (scénarios 1 et 3), la carte comparative (scénario 2, js/carte.js);
   - toucher un point de l'entrée pose sur la pile du parcours la carte de l'objet qui y est lié (js/pile.js);
   - la ligne du temps du bas suit le fil des choix (js/pile.js).
   La vidéo reste gérée par js/video.js. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const ORBITE_DEPART = '-45deg 80deg 85%';   // vue de face, un peu rapprochée : le modèle remplit mieux sa zone
  const N = { el: {}, rappels: {}, def: null, modele: null, osd: null, atteints: new Set() };

  function init(o) { N.el = o.elements; N.rappels = o.rappels; }   // elements : { hote }

  /* def : { type: 'modele3d' | 'image' | 'carte', src, titre, points: [{ objet, libelle, position, normale } | { objet, libelle, x, y }],
           carte (type 'carte' : voir js/carte.js) } */
  function charger(def) {
    vider();
    if (!def) return;
    N.def = def;
    N.el.hote.hidden = false;
    if (def.type === 'modele3d') chargerModele(def);
    else if (def.type === 'carte') Mur.carte.charger(N.el.hote, def.carte, {
      poser: (ids, libelle) => { if (N.rappels.poser) N.rappels.poser(ids, libelle); },   // images d'un point : sur la pile
      agrandir: id => { if (N.rappels.agrandir) N.rappels.agrandir(id); }                  // icône de carte : la carte ancienne en plein écran
    });
    else chargerImage(def);
  }

  function vider() {
    if (N.modele) { N.modele.remove(); N.modele = null; }
    if (N.osd) { N.osd.destroy(); N.osd = null; }
    if (Mur.carte) Mur.carte.vider();
    N.el.hote.textContent = '';
    N.el.hote.hidden = true;
    N.def = null;
    N.atteints = new Set();
  }

  function pastille(i, classe) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = String(i + 1);
    b.dataset.indice = i;
    const p = N.def.points[i];
    b.setAttribute('aria-label', 'Repère ' + (i + 1) + (p.libelle ? ' : ' + p.libelle : ''));
    return b;
  }

  // Points du modèle (hotspots de model-viewer), refaits sans recharger le modèle (mode édition : ajout, retrait, déplacement)
  function poserPoints(mv, points) {
    mv.querySelectorAll('.point-entree').forEach(b => b.remove());
    (points || []).forEach((p, i) => {
      const b = pastille(i, 'point-entree');
      b.slot = 'hotspot-' + (i + 1);
      b.dataset.position = p.position;
      b.dataset.normal = p.normale;
      b.addEventListener('click', () => activer(i));
      mv.appendChild(b);
    });
  }
  function points(liste) {
    if (!N.def) return;
    N.def.points = liste;
    if (N.modele) poserPoints(N.modele, liste);
  }

  function chargerModele(def) {
    const mv = document.createElement('model-viewer');
    mv.setAttribute('src', def.src);
    mv.setAttribute('alt', 'Modèle 3D : ' + (def.titre || ''));
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('touch-action', 'none');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('camera-orbit', ORBITE_DEPART);
    mv.setAttribute('shadow-intensity', '1');
    poserPoints(mv, def.points);   // points du modèle (hotspots de model-viewer)
    N.el.hote.appendChild(mv);
    N.modele = mv;
  }

  function chargerImage(def) {
    const div = document.createElement('div');
    div.className = 'entree-image';
    N.el.hote.appendChild(div);
    const v = Mur.visionneuse.ouvrirImage(div, def.src, { visibilityRatio: 0.9 });
    v.addOnceHandler('open', () => {
      const item = v.world.getItemAt(0);
      const t = item.getContentSize();
      (def.points || []).forEach((p, i) => {   // lieux de la photographie (superpositions d'OpenSeadragon)
        const b = pastille(i, 'point-entree');
        v.addOverlay({ element: b, location: item.imageToViewportCoordinates(p.x * t.x, p.y * t.y), placement: window.OpenSeadragon.Placement.CENTER, checkResize: false });
        new window.OpenSeadragon.MouseTracker({ element: b, clickHandler: () => activer(i) });
      });
    });
    N.osd = v;
  }

  // Point touché : l'entrée se centre sur le point, et la carte de l'objet lié se pose sur la pile du parcours
  function activer(i) {
    const p = N.def && N.def.points[i];
    if (!p) return;
    N.atteints.add(i);
    document.querySelectorAll('#bas .point-entree').forEach(b => {
      if (N.atteints.has(Number(b.dataset.indice))) b.classList.add('atteinte');
    });
    if (N.modele && p.position) {
      N.modele.cameraTarget = p.position;
      N.modele.cameraOrbit = '-45deg 75deg 40%';
    }
    if (N.osd && p.x != null) {
      const item = N.osd.world.getItemAt(0);
      if (item) {
        const t = item.getContentSize();
        N.osd.viewport.panTo(item.imageToViewportCoordinates(p.x * t.x, p.y * t.y));
        N.osd.viewport.zoomTo(2.2);
      }
    }
    if (N.rappels.repere) N.rappels.repere(p.objet, p.libelle);
  }

  // Zoom avant et arrière de l'entrée (barre sous l'entrée, comme en plein écran) : modèle 3D (méthode zoom de
  // model-viewer 4.4.0, un cran de molette par pas) ou image (OpenSeadragon)
  function zoomer(facteur) {
    if (N.modele && N.modele.zoom) N.modele.zoom(facteur > 1 ? 12 : -12);
    if (N.osd) { N.osd.viewport.zoomBy(facteur); N.osd.viewport.applyConstraints(); }
  }

  // « Réinitialiser » l'entrée : vue de départ
  function reinitialiser() {
    if (N.modele) { N.modele.cameraTarget = 'auto auto auto'; N.modele.cameraOrbit = ORBITE_DEPART; }
    if (N.osd) N.osd.viewport.goHome();
    if (Mur.carte && Mur.carte.active) Mur.carte.reinitialiser();
  }

  Mur.entree = { init, charger, vider, activer, reinitialiser, zoomer, points, get modele() { return N.modele; }, get active() { return !!N.def; }, get def() { return N.def; } };
})();
