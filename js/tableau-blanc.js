/* tableau-blanc.js — tableau blanc Excalidraw (excalidraw.com, salle de collaboration en direct).
   Excalidraw désactive la collaboration quand il tourne dans un cadre (iframe) : dans excalidraw-app/App.tsx,
   isCollabDisabled = isRunningInIframe(). La salle s'ouvre donc dans une fenêtre à part, posée sur la zone
   du tableau blanc (colonnes 3 à 9 de la rangée du bas). « Réduire le tableau blanc » ferme cette fenêtre;
   le contenu reste dans la salle.
   Le lien de la salle contient sa clé de chiffrement : il n'est jamais écrit dans le dépôt.
   Il se donne dans l'adresse de la page, après le # (partie jamais transmise au serveur) :
     index.html#salle=<identifiant>,<clé>
   ou par le champ des consignes; il est alors gardé dans ce navigateur (localStorage). */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const CLE = 'mur-visualisation.salle';
  const NOM_FENETRE = 'mur-tableau-blanc';
  const T = { el: {}, salle: null, fenetre: null, veille: null, rappels: {} };

  function lienValide(texte) {
    let u;
    try { u = new URL(String(texte).trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.hostname !== 'excalidraw.com' || !/^#room=[\w-]+,[\w-]+$/.test(u.hash)) return null;
    return 'https://excalidraw.com/' + u.hash;
  }

  function lireStockage() { try { return localStorage.getItem(CLE); } catch (e) { return null; } }
  function ecrireStockage(v) { try { if (v) localStorage.setItem(CLE, v); else localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ } }

  function salleDepuisAdresse() {
    const p = new URLSearchParams(location.hash.slice(1));
    const v = p.get('salle');
    if (!v) return null;
    return lienValide(/^https?:/.test(v) ? v : 'https://excalidraw.com/#room=' + v);
  }

  function init(o) {
    T.el = o.elements;
    T.rappels = o.rappels || {};
    T.onglet = !!o.onglet;   // écran 16:9 (présentation sur un ordinateur) : la salle s'ouvre dans un nouvel onglet
    T.el.formulaire.addEventListener('submit', e => {
      e.preventDefault();
      const lien = lienValide(T.el.champ.value);
      if (!lien) { T.el.erreur.textContent = 'Lien non reconnu : il doit commencer par https://excalidraw.com/#room='; return; }
      T.el.erreur.textContent = '';
      ecrireStockage(lien);
      utiliser(lien);
      ouvrir();   // le geste qui valide le lien ouvre aussi la fenêtre
    });
    T.el.oublier.addEventListener('click', () => { fermer(); ecrireStockage(null); utiliser(null); });
    T.el.ramener.addEventListener('click', () => ouvrir());
    window.addEventListener('hashchange', () => { const s = salleDepuisAdresse(); if (s) utiliser(s); });
    window.addEventListener('pagehide', fermer);
    utiliser(salleDepuisAdresse() || lienValide(lireStockage() || ''));
  }

  function utiliser(lien) {
    if (lien !== T.salle) fermer();
    T.salle = lien;
    T.el.lien.textContent = lien || '';
    T.el.lien.hidden = !lien;
    T.el.formulaire.hidden = !!lien;
    T.el.oublier.hidden = !lien;
    message();
  }

  function message(texte) {
    const ouverte = T.fenetre && !T.fenetre.closed;
    T.el.message.textContent = texte || (!T.salle
      ? 'Aucune salle Excalidraw : coller le lien de la salle dans le champ, à gauche.'
      : T.onglet
        ? (ouverte
          ? 'Le tableau blanc est ouvert dans un nouvel onglet. Pour revenir ici, fermer cet onglet (Cmd + W sur un Mac, Ctrl + W sous Windows) ou toucher « Réduire le tableau blanc ».'
          : 'Le tableau blanc s\'ouvre dans un nouvel onglet.')
        : ouverte
          ? 'Le tableau blanc est ouvert dans une fenêtre à part, posée sur cette zone.'
          : 'Le tableau blanc s\'ouvre dans une fenêtre à part.');
    T.el.ramener.hidden = !T.salle;
    T.el.ramener.textContent = T.onglet ? (ouverte ? 'Afficher l\'onglet' : 'Ouvrir l\'onglet') : (ouverte ? 'Ramener la fenêtre' : 'Ouvrir la fenêtre');
  }

  // Position de la zone du tableau blanc à l'écran (coordonnées de l'écran, en pixels CSS)
  function zone() {
    const r = T.el.cadre.getBoundingClientRect();
    const bord = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const barre = Math.max(0, window.outerHeight - window.innerHeight - bord);
    return {
      left: Math.round(window.screenX + bord + r.left),
      top: Math.round(window.screenY + barre + r.top),
      width: Math.max(320, Math.round(r.width)),
      height: Math.max(240, Math.round(r.height))
    };
  }

  /* Ouvre la salle (ou ramène sa fenêtre) sur la zone du tableau blanc. À appeler pendant un geste
     (toucher un bouton) : sinon, le navigateur bloque l'ouverture de la fenêtre. */
  function ouvrir() {
    if (!T.salle) { message(); return false; }
    const z = zone();
    if (T.fenetre && !T.fenetre.closed) {
      if (!T.onglet) try { T.fenetre.moveTo(z.left, z.top); T.fenetre.resizeTo(z.width, z.height); } catch (e) { /* refusé par le navigateur */ }
      T.fenetre.focus();
      message();
      return true;
    }
    // au mur : fenêtre posée sur la zone du tableau blanc; en 16:9 : nouvel onglet (fermer l'onglet ramène à la page)
    const f = T.onglet ? window.open(T.salle, NOM_FENETRE)
      : window.open(T.salle, NOM_FENETRE, 'popup=yes,left=' + z.left + ',top=' + z.top + ',width=' + z.width + ',height=' + z.height);
    if (!f) {
      message('Le navigateur a empêché l\'ouverture de la fenêtre du tableau blanc. L\'autoriser pour cette page, puis toucher « Ouvrir la fenêtre ».');
      return false;
    }
    T.fenetre = f;
    f.focus();
    clearInterval(T.veille);
    // Fenêtre fermée à la main : la page revient à la vidéo
    T.veille = setInterval(() => {
      if (T.fenetre && T.fenetre.closed) {
        clearInterval(T.veille);
        T.fenetre = null;
        message();
        if (T.rappels.fermee) T.rappels.fermee();
      }
    }, 1000);
    message();
    return true;
  }

  // Ramène la fenêtre au premier plan, sans la déplacer (après un toucher dans la page)
  function premierPlan() {
    if (T.onglet) return;   // en 16:9, toucher la page ne doit pas ramener l'onglet du tableau blanc
    if (T.fenetre && !T.fenetre.closed) T.fenetre.focus();
  }

  function fermer() {
    clearInterval(T.veille);
    if (T.fenetre && !T.fenetre.closed) T.fenetre.close();
    T.fenetre = null;
    if (T.el.message) message();
  }

  Mur.tableauBlanc = { init, ouvrir, fermer, premierPlan, lienValide, get salle() { return T.salle; }, get ouverte() { return !!(T.fenetre && !T.fenetre.closed); } };
})();
