/* pile.js — zone « Parcours thématique » d'un scénario : une pile de cartes, et le fil des choix dans la zone du bas.
   - Chaque carte montre une image, la plus grande possible dans la zone, avec 1 à 3 éléments à toucher (« zones »).
   - Toucher un élément pose par-dessus une autre carte, liée à cet élément : la personne suit ainsi le scénario.
   - Les flèches, à gauche et à droite de la carte, reviennent aux cartes précédentes et repartent vers les suivantes.
   - Jusqu'à cinq cartes précédentes s'étalent en désordre autour de la carte du dessus; en toucher une la ramène dessus.
   - Toucher l'image ouvre sa notice dans la zone de droite et affiche ses éléments (points et étiquettes) pendant
     7 secondes; avant ce toucher, rien n'est affiché sur l'image. L'icône des quatre coins affiche l'image en plein écran.
   - Une image ne revient jamais dans le fil des choix : un élément qui mène à une image déjà dans le fil n'est pas
     affiché (ni dans les « Objets associés »); un point du modèle 3D qui y mène ramène à sa carte.
   - Ligne du temps (zone du bas) : le fil des choix. Une pastille par carte, espacées également; la ligne ne se
     développe qu'au premier choix; toucher une pastille ramène à sa carte.
   Données : « parcours » de donnees/scenario-N.json :
     { "depart": <id d'objet> | null, "cartes": { <id>: [ { "x": 0–1, "y": 0–1, "libelle": "…", "vers": <id> } ] } }
   x et y : position de l'élément, en fraction de la largeur et de la hauteur de l'image. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const P = { el: {}, rappels: {}, objets: new Map(), cartes: {}, hist: [], i: -1, titre: '', jeton: 0, cache: new Map(), graine: 0, places: [] };
  const CRANS = 8;   // la ligne du temps compte au moins 8 places : les pastilles ne s'entassent pas au début
  const ETIQUETTES = 7000;   // durée d'affichage des étiquettes, après un toucher sur l'image
  // main qui touche (index tendu, deux arcs), sur l'image de la carte du dessus : invite à la toucher (la même que sur la
  // carte comparative, js/carte.js); cachée pendant que les éléments sont affichés
  const MAIN = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path class="arcs" d="M6.3 6.6a5 5 0 0 1 8.4-3.1M8.6 7.6a2.6 2.6 0 0 1 4-2.2"/>'
    + '<path d="M10.6 13.4V7.7a1.3 1.3 0 0 1 2.6 0v5.1l3.6.5a2 2 0 0 1 1.7 2.2l-.6 4.2a2 2 0 0 1-2 1.7h-4.6a2 2 0 0 1-1.6-.8l-3.1-4.1a1.3 1.3 0 0 1 2-1.6Z"/></svg>';
  const SVG = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">';

  // Parcours (?parcours=1, js/parcours.js) : cartes posées et reprises dans le fil; rien en mode édition
  function noter(evenement, d) { if (Mur.parcours && !P.edition) Mur.parcours.noter(evenement, d); }

  function init(o) {
    P.el = o.elements;
    P.rappels = o.rappels;
    P.adresse = o.adresse;
    P.el.precedente.addEventListener('click', () => aller(P.i - 1));
    P.el.suivante.addEventListener('click', () => aller(P.i + 1));
    if (window.ResizeObserver) {
      new ResizeObserver(() => { disposer(); }).observe(P.el.pile);
      new ResizeObserver(() => disposerIntitules(P.el.pastilles)).observe(P.el.ligne);
    }
  }

  function libelle(id) {
    const o = P.objets.get(id);
    return o ? (o.titre_court || o.titre || id) : id;
  }

  /* o : { objets (Map), titre (du scénario), parcours, vide (texte quand la pile est vide) } */
  function charger(o) {
    P.objets = o.objets;
    P.titre = o.titre || '';
    P.cartes = (o.parcours && o.parcours.cartes) || {};
    P.vide = o.vide || '';
    P.main = o.main !== false;   // main sur l'image du dessus (pas au scénario 2 : la main est sur la carte comparative)
    P.hist = [];
    P.i = -1;
    tirerDisposition();   // nouveau parcours : nouvelle disposition de la pile en désordre
    const depart = o.parcours && o.parcours.depart;
    if (depart && P.objets.has(depart)) { P.hist.push({ id: depart, libelle: null }); P.i = 0; }
    rendre(true);
  }

  function vider() {
    P.hist = []; P.i = -1; P.titre = ''; P.jeton++;
    P.el.pile.textContent = '';
    P.el.pastilles.textContent = '';
    P.el.progression.style.width = '0';
    P.el.precedente.hidden = P.el.suivante.hidden = true;
    P.el.vide.hidden = true;
  }

  // Élément touché (sur une carte, sur le modèle 3D de l'entrée ou dans la notice) : sa carte se pose sur la pile
  function choisir(vers, texte) {
    if (!P.objets.has(vers)) { console.warn('Carte inconnue :', vers); return; }
    const deja = P.hist.slice(0, P.i + 1).findIndex(h => h.id === vers);
    if (deja >= 0) { aller(deja); return; }   // image déjà dans le fil : on y revient, sans la reposer une deuxième fois
    P.hist = P.hist.slice(0, P.i + 1);   // comme dans un navigateur : un nouveau choix remplace les cartes suivantes
    P.hist.push({ id: vers, libelle: texte || null });
    P.i = P.hist.length - 1;
    noter('carte posée', { objet: vers, titre: libelle(vers), detail: texte || '' });
    rendre(true);
  }

  // Images posées d'un coup, sans fil (points de la carte comparative du scénario 2, js/carte.js) : chacune va sur le
  // dessus de la pile, dans l'ordre donné (la dernière sur le dessus); une image déjà posée remonte sur le dessus, et
  // aucune carte n'est retirée (12 novembre 2026)
  function poser(ids, texte) {
    const liste = (Array.isArray(ids) ? ids : [ids]).filter(id => P.objets.has(id));
    if (!liste.length) return;
    liste.forEach(id => {
      P.hist = P.hist.filter(h => h.id !== id);
      P.hist.push({ id, libelle: texte || null });
    });
    P.i = P.hist.length - 1;
    noter('images posées', { objet: liste.join(' '), titre: liste.map(libelle).join(' · '), detail: texte || '' });
    rendre(true);
  }

  // Éléments d'une carte, sans ceux qui mènent à une image déjà dans le fil (jusqu'à la carte k)
  function elements(id, k) {
    if (P.edition) return (P.cartes[id] || []).slice(0, 3);   // mode édition (js/edition.js) : tous les éléments, même sans lien
    const vus = new Set(P.hist.slice(0, k + 1).map(h => h.id));
    // sans les éléments qui mènent à un objet de l'EDSR dont l'image n'est pas encore traitée ("image_edsr" dans objets.json)
    return (P.cartes[id] || []).filter(z => z.vers && !vus.has(z.vers) && !(P.objets.get(z.vers) || {}).image_edsr).slice(0, 3);
  }

  function aller(k) {
    if (k < 0 || k >= P.hist.length || k === P.i) return;
    P.i = k;
    noter('carte reprise', { objet: P.hist[k].id, titre: libelle(P.hist[k].id) });
    rendre(false);
  }

  // ---------- Cartes ----------
  function element(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  /* Image d'un objet : fichier du dépôt (objets conservés dans le dépôt du site), ou image IIIF de la première toile */
  function sourceImage(o) {
    if (o.image) return Promise.resolve(P.adresse(o.image));
    if (!o.manifeste) return Promise.resolve(null);
    if (P.cache.has(o.id)) return P.cache.get(o.id);
    const hauteur = P.el.pile.closest('.e169') ? 900 : 1600;
    const p = Mur.iiif.lire(o.manifeste).then(m => { const svc = Mur.iiif.service(m); return svc ? Mur.iiif.vignette(svc, hauteur) : null; });
    P.cache.set(o.id, p);
    return p;
  }

  function creerCarte(k, nouvelle) {
    const h = P.hist[k];
    const o = P.objets.get(h.id) || { id: h.id, titre: h.id };
    const carte = element('figure', 'carte-pile' + (nouvelle ? ' arrive' : ''));
    carte.dataset.indice = k;
    const cadre = element('div', 'carte-image');
    const img = new Image();
    img.alt = o.titre || '';
    img.decoding = 'async';
    const attente = element('p', 'carte-attente', 'Chargement de l\'image…');
    cadre.append(attente);
    const legende = element('figcaption', 'carte-legende');
    legende.appendChild(element('span', 'carte-titre', libelle(h.id)));
    const actions = element('span', 'carte-actions');
    const agrandir = element('button', 'icone seule carte-agrandir');
    agrandir.type = 'button';
    agrandir.innerHTML = SVG + '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
    agrandir.setAttribute('aria-label', 'Affichage plein écran');
    agrandir.title = 'Affichage plein écran';
    agrandir.addEventListener('click', () => P.rappels.agrandir(h.id));
    actions.append(agrandir);
    legende.appendChild(actions);
    carte.append(cadre, legende);
    // éléments à toucher (zones), sans ceux qui mènent à une image déjà dans le fil
    const zones = elements(h.id, k);
    const suivante = P.hist[k + 1];
    zones.forEach((z, j) => {
      const b = element('button', 'zone');
      b.type = 'button';
      b.style.left = (100 * z.x) + '%';
      b.style.top = (100 * z.y) + '%';
      if (z.x > 0.7) b.classList.add('a-gauche');   // étiquette à gauche du point, près du bord droit
      b.appendChild(element('span', 'zone-point'));
      b.appendChild(element('span', 'zone-etiquette', z.libelle));
      b.setAttribute('aria-label', z.libelle + ' : ' + (z.vers ? libelle(z.vers) : 'sans lien'));
      if (suivante && suivante.id === z.vers) b.classList.add('choisie');   // élément qui a mené à la carte suivante
      b.dataset.index = j;
      if (P.edition) { b.classList.toggle('sans-lien', !z.vers); b.classList.toggle('selection', P.selection === j && P.i === k); }
      b.addEventListener('click', e => {
        e.stopPropagation();
        if (P.i !== k) return;
        if (P.edition) { if (P.rappels.editionElement) P.rappels.editionElement(h.id, j); return; }   // mode édition : choisir l'élément
        choisir(z.vers, z.libelle);
      });
      cadre.appendChild(b);
    });
    // toucher l'image (ou Entrée, au clavier) : sa notice s'ouvre dans la zone de droite; ses éléments (points et
    // étiquettes) s'affichent, puis s'effacent après 7 secondes
    cadre.tabIndex = 0;
    cadre.setAttribute('role', 'button');
    const fin = P.main && !P.edition && k === P.i && !zones.length;   // bout du chemin (scénarios 1 et 3)
    cadre.setAttribute('aria-label', (zones.length ? 'Afficher la notice et les éléments de l\'image : ' : 'Afficher la notice de l\'image : ') + libelle(h.id) + (fin ? ' (fin du chemin)' : ''));
    cadre.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === cadre) { e.preventDefault(); cadre.click(); } });
    let minuterie = null;
    cadre.addEventListener('click', e => {
      if (P.i !== k) return;
      if (P.edition) {   // mode édition : un clic sur l'image ajoute un élément à cet endroit (position en fraction de l'image)
        const r = cadre.getBoundingClientRect();
        if (P.rappels.editionImage && e.clientX) P.rappels.editionImage(h.id, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        return;
      }
      P.rappels.notice(h.id);
      if (!zones.length) return;
      const visibles = cadre.classList.toggle('etiquettes');
      clearTimeout(minuterie);
      if (visibles) minuterie = setTimeout(() => cadre.classList.remove('etiquettes'), ETIQUETTES);
    });
    /* la main seulement s'il y a des éléments à montrer : au bout d'un chemin (éléments qui mènent tous à des images déjà
       dans le fil, ou aucun élément), plus de main (13 novembre 2026; auparavant, elle restait et le toucher ne montrait rien) */
    if (P.main && !P.edition && k === P.i && zones.length) {
      const main = element('span', 'main-toucher');
      main.innerHTML = MAIN;
      cadre.appendChild(main);
    }
    // au bout du chemin, à la place de la main : « Fin », au même endroit (13 novembre 2026, à la demande de l'équipe)
    if (fin) cadre.appendChild(element('span', 'fin-chemin', 'Fin'));
    // source en filigrane (js/filigrane.js), si objets.json donne un crédit
    if ((o.credit || o.credit_court) && Mur.filigrane) Mur.filigrane.creer(cadre).poser({ court: o.credit_court, complet: o.credit });
    const jeton = P.jeton;
    sourceImage(o).then(src => {
      if (jeton !== P.jeton) return;
      if (!src) { attente.textContent = 'Image à venir'; return; }
      img.onload = () => { attente.remove(); cadre.prepend(img); carte.dataset.l = img.naturalWidth; carte.dataset.h = img.naturalHeight; disposer(); };
      img.onerror = () => { attente.textContent = 'Image non ouverte'; };
      img.src = src;
    }).catch(() => { attente.textContent = 'Image non ouverte'; });
    return carte;
  }

  const ETALEES = 5, ECHELLE_DESSOUS = 0.75, ANGLE = 12, PLACES = [-1, 1, -0.6, 0.6, -0.8];   // cartes précédentes visibles; leur taille et leur angle maximal (degrés); places de base
  // pseudo-hasard stable pendant un parcours (une carte garde sa place), tiré de nouveau à chaque parcours (P.graine)
  function hasard(n) { const x = Math.sin((n + P.graine) * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  /* Disposition d'un parcours : les cinq places de base, dans un ordre tiré au hasard, du côté gauche ou droit (au hasard),
     à une distance du bord qui varie un peu; cinq cartes qui se suivent dans le fil occupent toujours cinq places différentes */
  function tirerDisposition() {
    P.graine = Math.floor(Math.random() * 100000);
    const signe = hasard(0.5) < 0.5 ? -1 : 1;
    const places = PLACES.map((p, j) => signe * Math.sign(p) * Math.min(1, Math.abs(p) * (0.85 + 0.3 * hasard(10 + j))));
    for (let j = places.length - 1; j > 0; j--) { const r = Math.floor(hasard(20 + j) * (j + 1)); [places[j], places[r]] = [places[r], places[j]]; }
    P.places = places;
  }

  function rendre(nouvelle) {
    P.jeton++;
    const pile = P.el.pile;
    pile.textContent = '';
    P.el.vide.hidden = P.hist.length > 0 || !P.vide;   // texte seulement s'il y en a un (« Parcours à venir. »)
    P.el.vide.textContent = P.vide;
    if (P.i >= 0) {
      // jusqu'à cinq cartes précédentes s'étalent en désordre autour de la carte du dessus; en toucher une la ramène dessus
      for (let k = Math.max(0, P.i - ETALEES); k <= P.i; k++) {
        const c = creerCarte(k, nouvelle && k === P.i && P.i > 0);
        c.dataset.rang = P.i - k;   // 0 : dessus; 1 à 5 : dessous
        if (k !== P.i) {
          [...c.children].forEach(e => { e.inert = true; });   // ni notice ni éléments : seule la carte entière se touche
          c.setAttribute('role', 'button');
          c.tabIndex = 0;
          c.setAttribute('aria-label', 'Revenir à la carte : ' + libelle(P.hist[k].id));
          c.addEventListener('click', () => aller(k));
          c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aller(k); } });
        }
        pile.appendChild(c);
      }
    }
    P.el.precedente.hidden = P.el.suivante.hidden = P.hist.length < 2;
    P.el.precedente.disabled = P.i <= 0;
    P.el.suivante.disabled = P.i >= P.hist.length - 1;
    disposer();
    rendreFil();
    if (P.rappels.carte && P.i >= 0) P.rappels.carte(P.hist[P.i].id);
    document.dispatchEvent(new CustomEvent('mur:carte'));   // mode édition : le panneau suit la carte du dessus
  }

  /* Taille des cartes : l'image la plus grande possible dans la zone, sous la place de la légende et des flèches */
  function disposer() {
    const pile = P.el.pile;
    const W = pile.clientWidth, H = pile.clientHeight;
    if (!W || !H) return;
    const cs = getComputedStyle(pile);
    const fleche = P.el.precedente.offsetWidth || P.el.suivante.offsetWidth || 42;   // taille des boutons (css/mur.css, --bouton)
    const decalage = parseFloat(cs.getPropertyValue('--decalage')) || 40;
    const reduction = parseFloat(cs.getPropertyValue('--pile-echelle')) || 1;   // carte du dessus plus petite que la zone (css/mur.css)
    let dessus = null;
    pile.querySelectorAll('.carte-pile').forEach(c => {
      const legende = c.querySelector('.carte-legende');
      const lh = legende ? legende.offsetHeight : 0;
      const l = Number(c.dataset.l) || 3, h = Number(c.dataset.h) || 2;
      const maxL = W - 2 * (fleche + decalage), maxH = H - lh - 2 * decalage;
      const s = Math.min(maxL / l, maxH / h) * reduction;
      const cadre = c.querySelector('.carte-image');
      cadre.style.width = c.style.width = Math.max(0, l * s) + 'px';   // la carte a la largeur de son image : un long titre se raccourcit (…)
      cadre.style.height = Math.max(0, h * s) + 'px';
      if (c.dataset.rang === '0') dessus = c;
    });
    // cartes précédentes : en désordre, de part et d'autre de la carte du dessus; chacune garde sa place (selon son rang
    // dans le fil) et chevauche plus ou moins la carte du dessus, sans sortir de la zone
    pile.querySelectorAll('.carte-pile:not([data-rang="0"])').forEach(c => {
      const k = Number(c.dataset.indice), e = ECHELLE_DESSOUS;
      const lc = c.offsetWidth * e, hc = c.offsetHeight * e;
      // cinq places, de part et d'autre : au bord de la zone, à mi-chemin, puis entre les deux (fraction de la distance au bord);
      // cinq cartes qui se suivent dans le fil prennent toujours cinq places différentes
      const place = (P.places.length ? P.places : PLACES)[k % PLACES.length];
      const loin = Math.max(0, W / 2 - lc / 2 - decalage - hc * 0.1);   // marge pour les coins de la carte inclinée
      const dx = Math.max(-loin, Math.min(loin, (place + (hasard(3 * k + 1) - 0.5) * 0.24) * loin));
      const dy = (hasard(3 * k + 2) - 0.5) * Math.max(decalage * 2, H - hc);
      const angle = (hasard(3 * k + 3) - 0.5) * 2 * ANGLE;
      c.style.transform = 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px)) rotate(' + angle.toFixed(1) + 'deg) scale(' + e + ')';
    });
    // flèches : de part et d'autre de la carte du dessus, à mi-hauteur de l'image
    if (dessus) {
      const cadre = dessus.querySelector('.carte-image');
      const legende = dessus.querySelector('.carte-legende');
      const lc = cadre.offsetWidth, hc = cadre.offsetHeight + (legende ? legende.offsetHeight : 0);
      const x0 = pile.offsetLeft + (W - lc) / 2, y = pile.offsetTop + (H - hc) / 2 + cadre.offsetHeight / 2;
      P.el.precedente.style.left = (x0 - fleche - decalage / 2) + 'px';
      P.el.suivante.style.left = (x0 + lc + decalage / 2) + 'px';
      P.el.precedente.style.top = P.el.suivante.style.top = (y - fleche / 2) + 'px';
    }
  }

  // ---------- Fil des choix (ligne du temps), en constellation ----------
  /* Le fil des choix se dessine comme une constellation (11 novembre 2026) : une étoile (pastille) par carte, de gauche à droite
     dans l'ordre des choix, à une hauteur tirée au hasard (stable pendant le parcours : P.graine), reliées par un trait.
     Autour de chaque étoile, semées dans l'espace libre de sa colonne, ses possibilités en gris : les chemins non choisis et,
     pour la dernière carte, les choix à venir. La constellation se complète à chaque choix. Mesures en pixels de la page. */
  function position(k) { return 100 * (k + 0.5) / Math.max(CRANS, P.hist.length); }

  function rendreFil() {
    const c = P.el.pastilles;
    c.textContent = '';
    const n = P.hist.length;
    const developpe = n > 1 || (n === 1 && P.hist[0].libelle);   // rien ne se développe avant le premier choix
    P.el.progression.style.width = developpe ? position(P.i) + '%' : '0';
    P.hist.forEach((h, k) => {
      const b = element('button', 'pastille atteinte' + (k === P.i ? ' courante' : ''), String(k + 1));
      b.type = 'button';
      b.dataset.indice = k;
      b.setAttribute('aria-label', 'Carte ' + (k + 1) + ' : ' + libelle(h.id) + (h.libelle ? ' (élément : ' + h.libelle + ')' : ''));
      if (k === P.i) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => aller(k));
      c.appendChild(b);
      const t = intitule(c, k, libelle(h.id), () => aller(k));
      t.classList.add('atteinte');
      if (k === P.i) t.classList.add('courante');
    });
    disposerIntitules(c);
  }

  // Intitulé d'une étoile : le titre de sa carte, collé à l'étoile, du côté où il y a le plus de place
  function intitule(conteneur, i, texte, action) {
    const t = element('button', 'intitule');
    t.type = 'button';
    t.dataset.indice = i;
    t.appendChild(element('span', 'texte', texte));
    t.setAttribute('aria-hidden', 'true');   // la pastille porte déjà l'information
    t.tabIndex = -1;
    t.addEventListener('click', action);
    conteneur.appendChild(t);
    return t;
  }

  const NS = 'http://www.w3.org/2000/svg';
  function borner(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function chevauche(a, b, m) { return a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m; }
  // un segment [(x1, y1), (x2, y2)] traverse-t-il le rectangle? (découpage de Liang-Barsky)
  function traverse(g, o) {
    let t0 = 0, t1 = 1;
    const dx = g.x2 - g.x1, dy = g.y2 - g.y1;
    for (const [p, q] of [[-dx, g.x1 - o.x0], [dx, o.x1 - g.x1], [-dy, g.y1 - o.y0], [dy, o.y1 - g.y1]]) {
      if (p === 0) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function trait(svg, classe, x1, y1, x2, y2) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('class', classe);
    svg.appendChild(l);
    return l;
  }

  /* Disposition de la constellation. Chaque carte a sa colonne (au moins 8 colonnes : CRANS); son étoile y prend une hauteur
     tirée au hasard, en alternance plutôt haut et plutôt bas; son intitulé se colle à l'étoile, vers le centre; ses
     possibilités se placent au hasard dans le reste de la colonne, sans chevaucher ce qui est déjà placé. La dernière carte
     sème ses choix à venir aussi dans l'espace libre à sa droite. */
  function disposerIntitules(conteneur) {
    const ligne = conteneur.parentElement;
    const W = ligne.clientWidth, H = ligne.clientHeight;
    conteneur.querySelectorAll('.branche').forEach(b => b.remove());
    let svg = conteneur.querySelector('svg.traits-intitules');
    const n = P.hist.length;
    if (!W || !H || !n) { if (svg) svg.remove(); return; }
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'traits-intitules');
      svg.setAttribute('aria-hidden', 'true');
      conteneur.prepend(svg);
    }
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.textContent = '';
    const corps = parseFloat(getComputedStyle(conteneur).fontSize) || 16;
    const pastilles = Array.from(conteneur.querySelectorAll('.pastille'));
    const intitules = Array.from(conteneur.querySelectorAll('.intitule'));
    const d = pastilles[0] ? pastilles[0].offsetWidth : 2 * corps, r = d / 2;
    const s = W / Math.max(CRANS, n);   // largeur d'une colonne
    const m = Math.max(4, corps * 0.35);   // marge entre deux éléments
    // Obstacle : la pile de cartes, qui descend dans la rangée du bas au mur et chevauche le modèle 3D en 16:9
    // (boîte de la pile, prolongée de 6 % de sa hauteur pour les cartes inclinées qui en dépassent)
    const obstacles = [];
    const pile = P.el.pile, lr = ligne.getBoundingClientRect(), ech = lr.width / W || 1;
    if (pile && pile.querySelector('.carte-pile')) {
      const pr = pile.getBoundingClientRect();
      const o = { x0: (pr.left - lr.left) / ech, x1: (pr.right - lr.left) / ech, y0: -1e6, y1: (pr.bottom - lr.top) / ech + pile.clientHeight * 0.06 };
      if (pr.width && o.y1 > 0 && o.x1 > 0 && o.x0 < W) obstacles.push(o);
    }
    const occupe = obstacles.slice();

    // 1. Étoiles : une par colonne, en alternance plutôt haut et plutôt bas, au hasard, sous la pile s'il y a lieu
    const etoiles = P.hist.map((h, k) => {
      const x = borner(s * (k + 0.5) + (hasard(340 + k) - 0.5) * 0.16 * s, r + m, W - r - m);
      let yMin = r + m;
      const yMax = H - r - m;
      obstacles.forEach(o => { if (x + r > o.x0 && x - r < o.x1) yMin = Math.max(yMin, o.y1 + r + m); });
      const sens = (k % 2 ? -1 : 1) * (hasard(300 + k) < 0.2 ? -1 : 1);
      const milieu = (yMin + yMax) / 2, demi = Math.max(0, (yMax - yMin) / 2);
      const y = yMin >= yMax ? yMax : borner(milieu + sens * (0.3 + 0.6 * hasard(320 + k)) * demi, yMin, yMax);
      return { x, y, milieu };
    });
    etoiles.forEach((e, k) => {
      pastilles[k].style.left = e.x + 'px';
      pastilles[k].style.top = e.y + 'px';
      e.rect = { x0: e.x - r, x1: e.x + r, y0: e.y - r, y1: e.y + r };
      occupe.push(e.rect);
    });

    // 2. Le fil : un trait d'une étoile à la suivante, clair jusqu'à la carte du dessus
    const segments = [];
    for (let k = 1; k < n; k++) {
      const a = etoiles[k - 1], b = etoiles[k];
      trait(svg, 'trait-fil' + (k <= P.i ? ' atteint' : ''), a.x, a.y, b.x, b.y);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    // place libre : dans la zone, sans chevaucher ce qui est placé; « strict » : aucun trait ne la traverse non plus
    const dedans = (rect) => rect.y0 >= 0 && rect.y1 <= H && rect.x0 >= 0 && rect.x1 <= W && !occupe.some(o => chevauche(o, rect, m / 2));
    const libre = (rect, strict) => dedans(rect) && (!strict || !segments.some(g => traverse(g, rect)));

    // 3. Intitulés : collés à leur étoile, de préférence du côté opposé à ses voisines (le fil ne les traverse pas)
    const largeurIntitule = Math.min(s * 0.84, 22 * corps);
    intitules.forEach((t, k) => {
      const e = etoiles[k];
      t.style.width = largeurIntitule + 'px';
      t.style.bottom = '';
      const h = t.offsetHeight;
      const voisines = [etoiles[k - 1], etoiles[k + 1]].filter(Boolean);
      const versLeHaut = voisines.length ? voisines.reduce((a, v) => a + v.y, 0) / voisines.length < e.y : e.y > e.milieu;
      const cotes = versLeHaut ? ['bas', 'haut'] : ['haut', 'bas'];   // les voisines sont plus haut : l'intitulé va dessous
      let rect = null;
      for (const strict of [true, false]) for (const cote of cotes) for (const dy of [0, 0.6]) for (const dx of [0, -0.22, 0.22, -0.4, 0.4, -0.6, 0.6]) {
        if (rect && rect.ok) break;
        const x = borner(e.x + dx * s, largeurIntitule / 2, W - largeurIntitule / 2);
        const y0 = cote === 'haut' ? e.y - r - m - h - dy * h : e.y + r + m + dy * h;
        const essai = { x0: x - largeurIntitule / 2, x1: x + largeurIntitule / 2, y0, y1: y0 + h, x };
        if (!rect) rect = essai;
        if (libre(essai, strict)) rect = Object.assign(essai, { ok: true });
      }
      t.style.left = rect.x + 'px';
      t.style.top = rect.y0 + 'px';
      occupe.push(rect);
    });

    // 4. Possibilités de chaque étoile : semées au hasard dans sa colonne (et, pour la dernière, dans l'espace à sa droite)
    const dansLeFil = new Set(P.hist.map(h => h.id));   // une image ne revient jamais dans le fil : elle n'est pas proposée
    const point = (b) => { const p = b.querySelector('.point'); return p ? p.offsetHeight : corps; };
    for (let k = 0; k < n; k++) {
      const suite = k === n - 1;   // dernière carte du fil : ses possibilités sont les choix à venir
      const autres = elements(P.hist[k].id, k).filter(z => z.vers && !dansLeFil.has(z.vers));
      if (!autres.length) continue;
      const e = etoiles[k];
      // zone de recherche : sa colonne d'abord, puis de plus en plus large (l'espace libre des colonnes voisines)
      const zones = [[0.5, suite ? 1.6 : 0.5], [0.9, suite ? 2 : 0.9], [1.4, suite ? 2.4 : 1.4]].map(([g, dr]) => [Math.max(0, e.x - g * s), Math.min(W, e.x + dr * s)]);
      const largeur = Math.min(s * 0.92, 15 * corps);
      autres.forEach((z, j) => {
        const b = element('button', 'branche' + (suite ? ' suite' : ''));
        b.type = 'button';
        b.style.width = largeur + 'px';
        b.append(element('span', 'point'), element('span', 'texte', libelle(z.vers)));
        b.setAttribute('aria-label', (suite ? 'Choix possible depuis la carte ' : 'Autre chemin depuis la carte ') + (k + 1) + ' : ' + libelle(z.vers) + ' (élément : ' + z.libelle + ')');
        b.addEventListener('click', () => { P.i = k; choisir(z.vers, z.libelle); });
        conteneur.appendChild(b);
        let choisi = null;
        for (const strict of [true, false]) for (const [z0, [cx0, cx1]] of zones.entries()) for (const uneLigne of [false, true]) {
          if (choisi) break;
          b.classList.toggle('une-ligne', uneLigne);
          const hb = b.offsetHeight, p = point(b);
          for (let t = 0; t < 48 && !choisi; t++) {
            const u = hasard(500 + k * 97 + j * 31 + t * 7.3 + z0 * 13.7 + (uneLigne ? 3.1 : 0)), v = hasard(700 + k * 89 + j * 37 + t * 5.9 + z0 * 11.3 + (uneLigne ? 1.7 : 0));
            const cx = cx0 + largeur / 2 + u * Math.max(0, cx1 - cx0 - largeur);
            const cy = p / 2 + m + v * (H - p - 2 * m);
            const haut = cy < e.y;   // l'intitulé vers l'extérieur : au-dessus d'un point plus haut que son étoile, dessous sinon
            const y0 = haut ? cy + p / 2 - hb : cy - p / 2;
            const rect = { x0: cx - largeur / 2, x1: cx + largeur / 2, y0, y1: y0 + hb };
            if (Math.hypot(cx - e.x, cy - e.y) < r + p) continue;
            if (!libre(rect, strict)) continue;
            // le trait pointillé de l'étoile au point ne traverse ni un intitulé ni une autre possibilité
            const dx = cx - e.x, dy = cy - e.y, l = Math.hypot(dx, dy) || 1;
            const lien = { x1: e.x + dx / l * (r + 2), y1: e.y + dy / l * (r + 2), x2: cx - dx / l * (p / 2 + 2), y2: cy - dy / l * (p / 2 + 2) };
            if (strict && occupe.some(o => o !== e.rect && o.y0 > -1e5 && traverse(lien, o))) continue;
            choisi = { cx, cy, haut, rect, p, lien };
          }
        }
        if (!choisi) {   // aucune place libre : sous l'étoile, quitte à chevaucher
          b.classList.add('une-ligne');
          const hb = b.offsetHeight, p = point(b), cx = e.x, cy = borner(e.y + r + m + p / 2 + j * (hb + m), p / 2, H - p / 2);
          choisi = { cx, cy, haut: false, rect: { x0: cx - largeur / 2, x1: cx + largeur / 2, y0: cy - p / 2, y1: cy - p / 2 + hb }, p };
        }
        b.classList.toggle('haut', choisi.haut);
        b.style.left = choisi.cx + 'px';
        b.style.top = choisi.rect.y0 + 'px';
        occupe.push(choisi.rect);
        if (choisi.lien) segments.push(choisi.lien);   // les possibilités suivantes évitent aussi ce trait
        // trait pointillé de l'étoile au point de la possibilité
        const dx = choisi.cx - e.x, dy = choisi.cy - e.y, l = Math.hypot(dx, dy) || 1;
        trait(svg, 'trait-branche' + (suite ? ' suite' : ''), e.x + dx / l * r, e.y + dy / l * r, choisi.cx - dx / l * choisi.p / 2, choisi.cy - dy / l * choisi.p / 2);
      });
    }
  }

  /* Mode édition (js/edition.js) : tous les éléments visibles, même ceux qui mènent à une image déjà dans le fil;
     un clic sur l'image ou sur un point est rapporté au panneau d'édition au lieu d'ouvrir la notice ou de suivre le lien. */
  function edition(o) {
    P.edition = !!o;
    if (o) Object.assign(P.rappels, o);
  }
  // nouvelles données du parcours (cartes, image du dessus) sans repartir à zéro : le fil des choix est conservé
  function rafraichir(cartes, selection) {
    if (cartes) P.cartes = cartes;
    P.selection = selection == null ? null : selection;
    rendre(false);
  }

  Mur.pile = {
    init, charger, vider, choisir, poser, aller, libelle, edition, rafraichir,
    get fil() { return P.hist.map(h => h.id); },
    get indice() { return P.i; },
    liens: id => { const k = P.hist.findIndex((h, j) => j <= P.i && h.id === id); return elements(id, k >= 0 ? k : P.i); },
    get courante() { return P.i >= 0 ? P.hist[P.i].id : null; }
  };
})();
