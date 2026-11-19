/* visionneuse.js — images en tuiles (OpenSeadragon 4.1.1, lib/openseadragon.min.js),
   dans la zone « Visualisation et description de l'objet » et en affichage plein écran. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  let scene = null;
  let k = 1;

  /* Aperçu réduit sur un ordinateur : la page de 11 520 × 2 160 px est réduite par une transformation CSS.
     OpenSeadragon mesure le pointeur et la position de son conteneur en pixels d'écran (getBoundingClientRect),
     mais la taille du conteneur en pixels de la page (clientWidth). Ce correctif ramène les deux mesures
     dans les pixels de la page. Au mur (échelle 1), il ne change rien. */
  function corriger() {
    const O = window.OpenSeadragon;
    if (!O || O.__murCorrige) return;
    const offsetOriginal = O.getElementOffset;
    function ramener(p) {
      if (k === 1 || !scene) return p;
      const r = scene.getBoundingClientRect();
      const ox = r.left + window.pageXOffset, oy = r.top + window.pageYOffset;
      return new O.Point(ox + (p.x - ox) / k, oy + (p.y - oy) / k);
    }
    O.getElementOffset = function (element) { return ramener(offsetOriginal.call(O, element)); };
    O.getMousePosition = function (e) {
      const x = typeof e.pageX === 'number' ? e.pageX : e.clientX + window.pageXOffset;
      const y = typeof e.pageY === 'number' ? e.pageY : e.clientY + window.pageYOffset;
      return ramener(new O.Point(x, y));
    };
    O.setString('Errors.OpenFailed', 'Image non ouverte.');   // message d'OpenSeadragon, en français
    O.__murCorrige = true;
  }

  function echelle(elementScene, valeur) { scene = elementScene; k = valeur || 1; }

  // Image ordinaire (fichier du dépôt), sans service d'image IIIF
  function ouvrirImage(element, url, options) {
    return ouvrir(element, null, Object.assign({ tileSources: { type: 'image', url: url } }, options || {}));
  }

  function ouvrir(element, svc, options) {
    corriger();
    return window.OpenSeadragon(Object.assign({
      element: element,
      tileSources: svc ? svc + '/info.json' : undefined,
      showNavigationControl: false,
      crossOriginPolicy: 'Anonymous',
      visibilityRatio: 0.6,
      constrainDuringPan: true,
      animationTime: 0.8,
      maxZoomPixelRatio: 2,
      gestureSettingsMouse: { clickToZoom: false },
      gestureSettingsTouch: { pinchRotate: false, flickEnabled: true }
    }, options || {}));
  }

  Mur.visionneuse = { ouvrir, ouvrirImage, echelle };
})();
