/* toucher.js — toucher tolérant, pour le cadre tactile du mur.
   Chrome n'envoie pas de clic quand le doigt glisse de plus d'une quinzaine de pixels entre l'appui et le relâchement :
   il y voit le début d'un défilement (essai au laboratoire, 10 novembre 2026 : objets associés insensibles au toucher).
   Les éléments à toucher ont « touch-action: none » (css/mur.css) : le navigateur n'annule plus le toucher.
   Si le doigt se relève à moins de 40 px de son point d'appui, en moins de 0,8 s, et qu'aucun clic n'a suivi,
   la page fait le clic elle-même. La souris n'est pas touchée. */
(function () {
  'use strict';
  const TOLERANCE = 40, DELAI = 800;
  const CIBLES = 'button, [role="button"], a[href], .carte-image';
  let appui = null;

  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !e.isPrimary) { appui = null; return; }
    const cible = e.target.closest(CIBLES);
    appui = cible ? { x: e.clientX, y: e.clientY, cible, t: performance.now() } : null;
  }, true);

  document.addEventListener('pointercancel', () => { appui = null; }, true);

  document.addEventListener('pointerup', e => {
    if (!appui || e.pointerType !== 'touch') return;
    const a = appui;
    appui = null;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > TOLERANCE || performance.now() - a.t > DELAI) return;
    if (!a.cible.isConnected || a.cible.disabled) return;
    let clic = false;
    const noter = () => { clic = true; };
    document.addEventListener('click', noter, true);
    setTimeout(() => {
      document.removeEventListener('click', noter, true);
      if (!clic && a.cible.isConnected) a.cible.click();
    }, 80);
  }, true);
})();
