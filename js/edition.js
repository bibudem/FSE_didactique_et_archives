/* edition.js — mode édition de la maquette : bâtir les parcours sans toucher aux fichiers de données à la main.
   Ouvrir la page avec ?edition=1 (sur un ordinateur : ?ecran=16x9&edition=1). Le panneau d'édition prend la place des
   notices au mur; en 16:9, il s'ajoute à droite de la page, à sa taille réelle (la maquette se réduit à côté).
   - Images du scénario : ajouter une image des Collections spéciales (adresse de la page de l'objet, …/items/<uuid>)
     ou une image déjà dans la maquette; la poser sur la pile; la retirer; choisir le départ; modifier son titre court.
   - Éléments de la carte du dessus : cliquer sur l'image en ajoute un (3 au plus); glisser un point le déplace;
     le panneau donne son libellé et l'image où il mène.
   - Scénario qui entre par un modèle 3D : un point s'ajoute en cliquant sur le modèle; le panneau donne son image.
   - Vérification : départ, images qu'aucun chemin n'atteint, éléments sans lien, fil le plus court.
   - « Tester le parcours » : la maquette se comporte comme au mur, depuis le départ.
   Les modifications sont conservées dans ce navigateur (localStorage); « Exporter » télécharge les fichiers de données
   (scenario-N.json, objets.json), à déposer dans donnees/. Rien n'est publié ni envoyé. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  if (new URLSearchParams(window.MUR_PARAMS != null ? window.MUR_PARAMS : location.search).get('edition') !== '1') { Mur.edition = { actif: false }; return; }

  const $ = id => document.getElementById(id);
  const scene = $('scene');
  const panneau = $('edition');
  const CLE = 'mur-edition';   // clé du localStorage
  const MAX = 3;               // éléments par carte (js/pile.js en affiche 3 au plus)
  const MANIFESTE = 'https://collections-speciales.bib.umontreal.ca/server/iiif/{uuid}/manifest';
  const ED = { selection: null, carte: null, ajoutPoint: false, annuler: [], message: '', empreinte: '', silence: false,
               reprise: null, effacer: false, test: false, vignettes: new Map(), colonnes: null };

  function el(balise, classe, texte) {
    const e = document.createElement(balise);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }
  function bouton(texte, action, cle) {
    const b = el('button', 'bouton', texte);
    b.type = 'button';
    if (cle) b.dataset.cle = cle;
    b.addEventListener('click', action);
    return b;
  }
  const arrondi = v => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;

  // ---------- Données ----------
  const objets = () => Mur.etat.objets;
  const donnees = () => Mur.etat.donneesScenario;
  const libelle = id => (objets().has(id) ? Mur.pile.libelle(id) : id);
  function parcoursDe(s) {
    if (!s.parcours) s.parcours = { depart: null, cartes: {} };
    if (!s.parcours.cartes) s.parcours.cartes = {};
    return s.parcours;
  }
  const parcours = () => parcoursDe(donnees());
  const estModele = () => { const s = donnees(); return !!(s && s.entree && s.entree.type === 'modele3d' && s.entree.objet); };
  // objets d'entrée (modèle 3D, photographie) : ils ne sont pas des cartes
  const entrees = () => new Set(Mur.etat.scenarios.scenarios.map(x => x.donnees && x.donnees.entree && x.donnees.entree.objet).filter(Boolean));
  // Images d'un scénario : la liste « objets » du fichier, plus toutes celles que le parcours et les points nomment
  function imagesDe(s) {
    const p = parcoursDe(s), ens = new Set(s.objets || []);
    if (p.depart) ens.add(p.depart);
    for (const [k, v] of Object.entries(p.cartes)) { ens.add(k); v.forEach(z => { if (z.vers) ens.add(z.vers); }); }
    (s.points || []).forEach(q => { if (q.objet) ens.add(q.objet); });
    const ent = entrees();
    s.objets = [...ens].filter(id => objets().has(id) && !ent.has(id));
    return s.objets;
  }
  const images = () => imagesDe(donnees());

  // ---------- Sauvegarde dans ce navigateur, et « Annuler » ----------
  function etat() {
    const sc = {};
    Mur.etat.scenarios.scenarios.forEach(x => {
      if (x.donnees) sc[x.numero] = { parcours: x.donnees.parcours || null, points: x.donnees.points || null, objets: x.donnees.objets || [] };
    });
    return { objets: [...objets().values()], scenarios: sc };
  }
  function appliquerEtat(e) {
    const m = objets();   // même Map que js/etat.js et js/pile.js : on la vide et on la remplit
    m.clear();
    e.objets.forEach(o => m.set(o.id, o));
    Mur.etat.scenarios.scenarios.forEach(x => {
      const v = e.scenarios[x.numero];
      if (!v || !x.donnees) return;
      x.donnees.parcours = v.parcours; x.donnees.points = v.points; x.donnees.objets = v.objets;
    });
  }
  function empreinte(texte) {   // reconnaît la version des fichiers de données sur laquelle les modifications ont été faites
    let h = 5381;
    for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '-' + texte.length;
  }
  function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify({ empreinte: ED.empreinte, date: new Date().toISOString(), etat: etat() })); }
    catch (e) { ED.message = 'Ce navigateur ne conserve pas les modifications : exporter avant de fermer la page.'; }
  }
  function avant() {   // avant chaque modification : l'état est conservé pour « Annuler »
    ED.annuler.push(JSON.stringify(etat()));
    if (ED.annuler.length > 50) ED.annuler.shift();
  }
  function apres(message) {
    if (message != null) ED.message = message;
    sauver();
    actualiser();
  }
  /* Texte modifié (libellé, titre, crédit) : le panneau n'est pas redessiné, pour que le clic qui a fait quitter le champ
     (sur une liste, sur l'image) ne se perde pas; seuls la pile, la vérification et « Annuler » suivent. */
  function apresTexte(maj) {
    sauver();
    if (maj) maj();
    const ann = panneau.querySelector('[data-cle="annuler"]');
    if (ann) ann.disabled = !ED.annuler.length;
    const v = panneau.querySelector('.edition-verification');
    if (v && Mur.etat.numero != null) { v.textContent = ''; verifier().forEach(([g, x]) => v.appendChild(el('li', g, x))); }
  }
  const dessus = selecteur => document.querySelector('#pile .carte-pile[data-rang="0"] ' + selecteur);
  function annuler() {
    const e = ED.annuler.pop();
    if (!e) return;
    appliquerEtat(JSON.parse(e));
    ED.selection = null;
    apres('Dernière modification annulée.');
  }

  // Pile (et points du modèle) redessinés avec les données modifiées, sans perdre le fil des choix
  function pile(selection) {
    ED.silence = true;
    try { Mur.pile.rafraichir(parcours().cartes, selection); } finally { ED.silence = false; }
  }
  function actualiser() {
    if (Mur.etat.numero != null) {
      pile(ED.selection);
      if (estModele()) Mur.entree.points(donnees().points || []);
    }
    rendre();
  }

  // ---------- Éléments des cartes ----------
  function elementsDe(id) {
    const c = parcours().cartes;
    if (!c[id]) c[id] = [];
    return c[id];
  }
  function nettoyer(id) { const c = parcours().cartes; if (c[id] && !c[id].length) delete c[id]; }
  function ajouterElement(id, x, y) {
    const zs = elementsDe(id);
    if (zs.length >= MAX) { ED.message = 'Trois éléments au plus par image : en retirer un d\'abord.'; rendre(); return; }
    avant();
    zs.push({ x: arrondi(x), y: arrondi(y), libelle: 'élément ' + (zs.length + 1), vers: null });
    ED.selection = zs.length - 1;
    apres('Élément ajouté : écrire son libellé et choisir l\'image où il mène.');
    const champ = panneau.querySelector('[data-cle="libelle-' + ED.selection + '"]');
    if (champ) { champ.focus({ preventScroll: true }); champ.select(); }
  }
  function retirerElement(id, j) {
    avant();
    elementsDe(id).splice(j, 1);
    nettoyer(id);
    ED.selection = null;
    apres('Élément retiré.');
  }
  function choisirElement(j) {   // élément choisi dans la pile ou dans le panneau : mis en évidence des deux côtés
    ED.selection = j;
    pile(j);
    panneau.querySelectorAll('.rang-element.selection').forEach(r => r.classList.remove('selection'));
    const r = panneau.querySelector('.rang-element[data-index="' + j + '"]');
    if (r) r.classList.add('selection');
  }

  // Glisser un point de la carte du dessus pour le déplacer
  let glisse = null, vientDeGlisser = false;
  function brancherGlisser() {
    const zonePile = $('pile');
    zonePile.addEventListener('pointerdown', e => {
      const z = e.target.closest('.carte-pile[data-rang="0"] .zone');
      if (!z || !scene.classList.contains('edition')) return;
      glisse = { z, cadre: z.closest('.carte-image'), j: Number(z.dataset.index), x0: e.clientX, y0: e.clientY, bouge: false };
      z.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    zonePile.addEventListener('pointermove', e => {
      if (!glisse) return;
      if (Math.hypot(e.clientX - glisse.x0, e.clientY - glisse.y0) > 4) glisse.bouge = true;
      if (!glisse.bouge) return;
      const r = glisse.cadre.getBoundingClientRect();
      glisse.z.style.left = 100 * arrondi((e.clientX - r.left) / r.width) + '%';
      glisse.z.style.top = 100 * arrondi((e.clientY - r.top) / r.height) + '%';
    });
    const fin = e => {
      if (!glisse) return;
      const g = glisse; glisse = null;
      if (!g.bouge || e.type === 'pointercancel') return;   // simple clic : l'élément est choisi (js/pile.js)
      vientDeGlisser = true;
      setTimeout(() => { vientDeGlisser = false; }, 0);
      const r = g.cadre.getBoundingClientRect();
      const z = elementsDe(Mur.pile.courante)[g.j];
      if (!z) return;
      avant();
      z.x = arrondi((e.clientX - r.left) / r.width);
      z.y = arrondi((e.clientY - r.top) / r.height);
      ED.selection = g.j;
      apres('Élément déplacé.');
    };
    zonePile.addEventListener('pointerup', fin);
    zonePile.addEventListener('pointercancel', fin);
    // le clic qui suit un glissement n'ajoute pas d'élément
    zonePile.addEventListener('click', e => { if (vientDeGlisser) { vientDeGlisser = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ---------- Points du modèle 3D ----------
  function brancherModele() {
    const hote = $('entree-hote');
    let depart = null;
    hote.addEventListener('pointerdown', e => { depart = ED.ajoutPoint ? { x: e.clientX, y: e.clientY } : null; }, true);
    hote.addEventListener('pointerup', e => {
      if (!ED.ajoutPoint || !depart || Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 5) return;   // un glissement tourne le modèle
      const mv = Mur.entree.modele;
      if (!mv || !mv.positionAndNormalFromPoint) return;
      // model-viewer mesure le pointeur en pixels non réduits : on retire l'échelle de la page (aperçu sur un ordinateur)
      const r = mv.getBoundingClientRect(), k = r.width / mv.clientWidth || 1;
      const touche = mv.positionAndNormalFromPoint(r.left + (e.clientX - r.left) / k, r.top + (e.clientY - r.top) / k);
      if (!touche) { ED.message = 'Aucune surface du modèle à cet endroit : cliquer sur le modèle lui-même.'; rendre(); return; }
      const f = v => v.x.toFixed(3) + 'm ' + v.y.toFixed(3) + 'm ' + v.z.toFixed(3) + 'm';
      avant();
      const s = donnees();
      s.points = s.points || [];
      s.points.push({ libelle: 'point ' + (s.points.length + 1), objet: null, position: f(touche.position), normale: f(touche.normal) });
      modeAjoutPoint(false);
      apres('Point ajouté : écrire son libellé et choisir son image.');
    }, true);
  }
  function modeAjoutPoint(oui) {
    ED.ajoutPoint = oui;
    scene.classList.toggle('edition-ajout-point', oui);
  }

  // ---------- Images ----------
  /* Une image des Collections spéciales s'ajoute par l'adresse de la page de l'objet (…/items/<uuid>) : le manifeste
     IIIF se lit d'une autre adresse, mais pas l'API du dépôt (CORS), qui seule donne l'uuid d'un permalien. */
  async function ajouterImage(adresse) {
    adresse = (adresse || '').trim();
    if (!adresse) return;
    const handle = (adresse.match(/\d+(?:\.\d+)+\/\d+/) || [])[0];
    if (handle && objets().has(handle)) { ajouterAuScenario(handle); return; }
    const uuid = ((adresse.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i) || [])[0] || '').toLowerCase();
    if (!uuid) {
      ED.message = handle
        ? 'Un permalien ne se lit pas d\'ici : l\'ouvrir dans le navigateur, puis copier l\'adresse de la page de l\'objet (…/items/…).'
        : 'Adresse non reconnue : coller l\'adresse de la page de l\'objet dans les Collections spéciales (…/items/…).';
      rendre();
      return;
    }
    const manifeste = MANIFESTE.replace('{uuid}', uuid);
    const connu = [...objets().values()].find(o => o.manifeste === manifeste);
    if (connu) { ajouterAuScenario(connu.id); return; }
    ED.message = 'Lecture du manifeste…'; rendre();
    let m;
    try { m = await Mur.iiif.lire(manifeste); }
    catch (e) { ED.message = 'Manifeste illisible (' + e.message + ') : vérifier l\'adresse et la connexion.'; rendre(); return; }
    if (!Mur.iiif.service(m)) { ED.message = 'Cet objet n\'a pas d\'image IIIF : il ne peut pas servir de carte.'; rendre(); return; }
    const ch = Mur.iiif.champs(m);
    const lien = (ch.lien[0] || '').replace(/^https?:\/\/hdl\.handle\.net\//, '');
    const id = /^\d+(\.\d+)+\/\d+$/.test(lien) ? lien : uuid;
    avant();
    if (!objets().has(id)) objets().set(id, nouvelObjet(id, manifeste, ch));
    ajouterAuScenario(id, true);
  }
  function nouvelObjet(id, manifeste, ch) {
    const titre = ch.titre || id;
    const createur = ch.createur[0] || '';
    const annee = ((ch.date[0] || '').match(/\d{4}/) || [''])[0];
    const nom = createur.split(',')[0].trim();
    const lien = /\//.test(id) ? ' [hdl.handle.net/' + id + '](https://hdl.handle.net/' + id + ').' : '';
    return {
      id, manifeste, depot: 'edsr', titre, titre_court: titre.length > 60 ? titre.slice(0, 57).trim() + '…' : titre,
      themes: ch.themes, mots_cles: ch.mots_cles,
      credit: (createur ? createur + ' (' + (annee || 's. d.') + '). ' : '') + '*' + titre + '*. Collections spéciales, Bibliothèques de l\'Université de Montréal.' + lien,
      credit_court: [nom ? nom + ', ' + (annee || 's. d.') : annee, 'Collections spéciales UdeM'].filter(Boolean).join(' · ')
    };
  }
  function ajouterAuScenario(id, dejaConserve) {
    const imgs = images();
    if (imgs.includes(id)) {
      if (dejaConserve) ED.annuler.pop();
      ED.message = '« ' + libelle(id) + ' » est déjà dans ce scénario.';
      rendre();
      return;
    }
    if (!dejaConserve) avant();
    imgs.push(id);
    apres('Image ajoutée au scénario : « ' + libelle(id) + ' ». « Poser » la met sur la pile pour placer ses éléments.');
  }
  function retirerImage(id) {
    avant();
    const s = donnees(), p = parcours();
    delete p.cartes[id];
    Object.keys(p.cartes).forEach(k => { p.cartes[k] = p.cartes[k].filter(z => z.vers !== id); nettoyer(k); });
    (s.points || []).forEach(q => { if (q.objet === id) q.objet = null; });
    if (p.depart === id) p.depart = null;
    s.objets = (s.objets || []).filter(x => x !== id);
    apres('Image retirée du scénario, avec les éléments qui y menaient.');
  }
  // vignette d'une image (fichier du dépôt ou image IIIF), conservée pour les prochains affichages du panneau
  function vignette(id) {
    if (ED.vignettes.has(id)) return ED.vignettes.get(id);
    const o = objets().get(id) || {};
    const p = o.image ? Promise.resolve(Mur.etat.adresse(o.image))
      : o.manifeste ? Mur.iiif.lire(o.manifeste).then(m => { const svc = Mur.iiif.service(m); return svc ? Mur.iiif.vignette(svc, 96) : null; })
      : Promise.resolve(null);
    const q = p.catch(() => null);
    ED.vignettes.set(id, q);
    return q;
  }

  // ---------- Vérification ----------
  function verifier() {
    const s = donnees(), p = parcours(), imgs = images();
    const departs = p.depart ? [p.depart] : (s.points || []).map(q => q.objet).filter(Boolean);
    const vus = new Set(), file = [...departs];
    while (file.length) { const i = file.pop(); if (vus.has(i)) continue; vus.add(i); (p.cartes[i] || []).forEach(z => { if (z.vers) file.push(z.vers); }); }
    const notes = [];
    if (!departs.length) notes.push(['alerte', 'Aucun départ : choisir l\'image de départ' + (estModele() ? ', ou lier des points du modèle 3D.' : '.')]);
    const isolees = imgs.filter(i => !vus.has(i));
    if (isolees.length) notes.push(['alerte', 'Aucun chemin n\'atteint : ' + isolees.map(libelle).join(' · ')]);
    const sansLien = [];
    Object.entries(p.cartes).forEach(([i, zs]) => zs.forEach(z => { if (!z.vers) sansLien.push(libelle(i) + ' (« ' + z.libelle + ' »)'); }));
    if (sansLien.length) notes.push(['alerte', 'Éléments sans image liée : ' + sansLien.join(' · ')]);
    (s.points || []).forEach((q, n) => { if (!q.objet) notes.push(['alerte', 'Point ' + (n + 1) + ' du modèle sans image liée.']); });
    if (estModele() && (s.points || []).length !== imgs.length) notes.push(['info', (s.points || []).length + ' points sur le modèle pour ' + imgs.length + ' images.']);
    const fins = imgs.filter(i => !(p.cartes[i] || []).some(z => z.vers));
    if (fins.length) notes.push(['info', 'Sans élément vers une autre image (fin du chemin) : ' + fins.map(libelle).join(' · ')]);
    // fil le plus court : images vues avant qu'une carte n'offre plus d'image nouvelle (une image ne revient jamais dans le fil)
    let court = Infinity, essais = 0;
    const suivre = fil => {
      if (++essais > 20000 || fil.length >= court) return;
      const suite = (p.cartes[fil[fil.length - 1]] || []).map(z => z.vers).filter(v => v && !fil.includes(v));
      if (!suite.length) { court = fil.length; return; }
      suite.forEach(v => suivre(fil.concat(v)));
    };
    departs.forEach(d => suivre([d]));
    if (court < Infinity) {
      const parPoints = !p.depart && estModele();   // entrée par le modèle : les autres points restent à portée
      notes.push([court >= 6 ? 'ok' : parPoints ? 'info' : 'alerte', 'Fil le plus court' + (parPoints ? ' depuis un point du modèle' : '') + ' : ' + court + ' image' + (court > 1 ? 's' : '') + (court >= 6 ? '.' : ' (moins de 6).')]);
    }
    notes.push(['info', imgs.length + ' images dans le scénario, dont ' + imgs.filter(i => vus.has(i)).length + ' atteintes depuis le départ.']);
    return notes;
  }

  // ---------- Export ----------
  function telecharger(nom, contenu) {
    const blob = new Blob([JSON.stringify(contenu, null, 2) + '\n'], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function exporterScenario(n) {
    const x = Mur.etat.scenarios.scenarios.find(y => y.numero === n);
    if (!x || !x.donnees) return;
    imagesDe(x.donnees);
    const d = Object.assign({}, x.donnees);
    delete d.textes;   // ajouté au chargement : sous-titres lus
    telecharger((x.fichier || 'scenario-' + n + '.json').split('/').pop(), d);
  }
  function exporterObjets() { telecharger('objets.json', [...objets().values()]); }
  function exporterTout() {
    exporterObjets();
    Mur.etat.scenarios.scenarios.filter(x => x.donnees).forEach((x, i) => setTimeout(() => exporterScenario(x.numero), 500 * (i + 1)));
  }

  // ---------- Tester le parcours ----------
  function tester() {
    const n = Mur.etat.numero;
    modeAjoutPoint(false);
    ED.test = true;
    Mur.pile.edition(false);
    scene.classList.remove('edition');
    scene.classList.add('edition-test');
    rendre();
    if (n != null) Mur.etat.ouvrirScenario(n);   // depuis le départ, comme au mur
  }
  function revenir() {
    ED.test = false;
    scene.classList.remove('edition-test');
    scene.classList.add('edition');
    Mur.pile.edition(RAPPELS);
    ED.selection = null;
    ED.message = '';
    actualiser();
  }

  // ---------- Panneau ----------
  // au mur, le panneau a trois colonnes (1 : carte et éléments; 2 : images; 3 : vérification et export); en 16:9, une seule
  function section(titre, aide, colonne) {
    const s = el('section', 'edition-section');
    s.appendChild(el('h3', null, titre));
    if (aide) s.appendChild(el('p', 'edition-aide', aide));
    ED.colonnes[(colonne || 1) - 1].appendChild(s);
    return s;
  }
  function choixImage(valeur, exclure, vide, action, cle) {
    const sel = el('select');
    sel.dataset.cle = cle;
    sel.appendChild(new Option(vide, ''));
    images().filter(i => i !== exclure).forEach(i => sel.appendChild(new Option(libelle(i), i)));
    if (valeur && ![...sel.options].some(o => o.value === valeur)) sel.appendChild(new Option(libelle(valeur), valeur));
    sel.value = valeur || '';
    sel.addEventListener('change', () => action(sel.value || null));
    return sel;
  }
  function champ(valeur, action, etiquette, cle) {
    const i = el('input');
    i.type = 'text';
    i.value = valeur || '';
    i.dataset.cle = cle;
    i.setAttribute('aria-label', etiquette);
    i.addEventListener('change', () => action(i.value.trim()));
    i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
    return i;
  }
  function ligne(nom, controle) {
    const l = el('label', 'edition-ligne');
    l.appendChild(el('span', null, nom));
    l.appendChild(controle);
    return l;
  }

  function rendre() {
    if (!Mur.etat.objets || !Mur.etat.scenarios) return;
    const focus = document.activeElement && panneau.contains(document.activeElement) ? document.activeElement.dataset.cle : null;
    const defile = panneau.scrollTop;
    panneau.textContent = '';
    const tete = el('div', 'edition-tete');
    tete.appendChild(el('h2', null, ED.test ? 'Test du parcours' : 'Mode édition'));
    const actions = el('div', 'edition-actions');
    if (ED.test) {   // la maquette se comporte comme au mur : seul le retour reste
      actions.appendChild(bouton('Retour à l\'édition', revenir, 'revenir'));
      tete.appendChild(actions);
      panneau.appendChild(tete);
      panneau.appendChild(el('p', 'edition-aide edition-test-texte', 'La maquette se comporte comme au mur, depuis le départ du scénario. Les modifications restent conservées.'));
      restaurer(focus, 0);
      return;
    }
    const ann = bouton('Annuler', annuler, 'annuler');
    ann.disabled = !ED.annuler.length;
    ann.title = 'Annuler la dernière modification';
    actions.appendChild(ann);
    if (Mur.etat.numero != null) actions.appendChild(bouton('Tester le parcours', tester, 'tester'));
    tete.appendChild(actions);
    panneau.appendChild(tete);
    if (ED.message) panneau.appendChild(el('p', 'edition-message', ED.message));
    const n = Mur.etat.numero;
    if (n != null) panneau.appendChild(el('p', 'edition-scenario', 'Scénario ' + n + ' : ' + donnees().titre));
    const cols = el('div', 'edition-colonnes');
    ED.colonnes = [el('div', 'edition-colonne'), el('div', 'edition-colonne'), el('div', 'edition-colonne')];
    ED.colonnes.forEach(c => cols.appendChild(c));
    panneau.appendChild(cols);

    if (n == null) {
      section('Choisir un scénario', 'Toucher la carte d\'un scénario pour bâtir son parcours. Les modifications sont conservées dans ce navigateur. « Exporter » télécharge les fichiers de données, à déposer dans donnees/.');
      exporter();
      restaurer(focus, defile);
      return;
    }
    const s = donnees(), p = parcours(), id = Mur.pile.courante;

    // Carte du dessus : titre court, crédit, éléments
    if (id) {
      const o = objets().get(id) || {};
      const sc = section('Carte du dessus');
      sc.appendChild(el('p', 'edition-aide', o.titre || id));
      sc.appendChild(ligne('Titre court', champ(o.titre_court || o.titre, v => { avant(); o.titre_court = v || o.titre; apresTexte(() => { const e = dessus('.carte-titre'); if (e) e.textContent = o.titre_court; }); }, 'Titre court de la carte', 'titre-court')));
      sc.appendChild(ligne('Crédit court', champ(o.credit_court, v => { avant(); o.credit_court = v || null; apresTexte(); }, 'Crédit court (filigrane)', 'credit-court')));
      sc.appendChild(ligne('Crédit', champ(o.credit, v => { avant(); o.credit = v || null; apresTexte(); }, 'Crédit complet (Markdown)', 'credit')));
      const zs = parcours().cartes[id] || [];
      const se = section('Éléments (' + zs.length + ' sur ' + MAX + ')', 'Cliquer sur l\'image pour ajouter un élément; glisser un point pour le déplacer.');
      zs.forEach((z, j) => {
        const r = el('div', 'rang-element' + (ED.selection === j ? ' selection' : ''));
        r.dataset.index = j;
        r.appendChild(el('span', 'rang-numero', String(j + 1)));
        r.appendChild(champ(z.libelle, v => { avant(); z.libelle = v || 'élément'; apresTexte(() => { const e = dessus('.zone[data-index="' + j + '"] .zone-etiquette'); if (e) e.textContent = z.libelle; }); }, 'Libellé de l\'élément ' + (j + 1), 'libelle-' + j));
        r.appendChild(choixImage(z.vers, id, '— image liée —', v => { avant(); z.vers = v; apres(v ? '« ' + z.libelle + ' » mène à « ' + libelle(v) + ' ».' : null); }, 'vers-' + j));
        const suivre = bouton('Suivre', () => { if (z.vers) Mur.pile.choisir(z.vers, z.libelle); }, 'suivre-' + j);
        suivre.disabled = !z.vers;
        suivre.title = 'Poser la carte liée sur la pile';
        r.appendChild(suivre);
        r.appendChild(bouton('Retirer', () => retirerElement(id, j), 'retirer-' + j));
        r.addEventListener('focusin', () => { if (ED.selection !== j) choisirElement(j); });
        se.appendChild(r);
      });
      if (!zs.length) se.appendChild(el('p', 'edition-aide', 'Aucun élément : cette image termine le chemin.'));
    } else {
      section('Carte du dessus', 'Aucune carte sur la pile : « Poser » une image de la liste des images du scénario' + (estModele() ? ', ou toucher un point du modèle.' : '.'));
    }

    // Points du modèle 3D
    if (estModele()) {
      const pts = s.points || (s.points = []);
      const sp = section('Points du modèle 3D (' + pts.length + ')', '« Ajouter un point », puis cliquer sur le modèle à l\'endroit voulu (un glissement tourne le modèle).');
      pts.forEach((q, j) => {
        const r = el('div', 'rang-element');
        r.appendChild(el('span', 'rang-numero', String(j + 1)));
        r.appendChild(champ(q.libelle, v => { avant(); q.libelle = v || 'point'; apresTexte(() => Mur.entree.points(pts)); }, 'Libellé du point ' + (j + 1), 'point-' + j));
        r.appendChild(choixImage(q.objet, null, '— image liée —', v => { avant(); q.objet = v; apres(null); }, 'point-vers-' + j));
        r.appendChild(bouton('Retirer', () => { avant(); pts.splice(j, 1); apres('Point retiré.'); }, 'point-retirer-' + j));
        sp.appendChild(r);
      });
      sp.appendChild(bouton(ED.ajoutPoint ? 'Cliquer sur le modèle… (annuler)' : 'Ajouter un point', () => {
        modeAjoutPoint(!ED.ajoutPoint);
        ED.message = ED.ajoutPoint ? 'Cliquer sur le modèle 3D à l\'endroit du nouveau point.' : '';
        rendre();
      }, 'ajout-point'));
    }

    // Images du scénario
    const imgs = images();
    const si = section('Images du scénario (' + imgs.length + ')', null, 2);
    si.appendChild(ligne('Départ', choixImage(p.depart, null, estModele() ? '— aucun : les points du modèle —' : '— choisir —', v => {
      avant(); p.depart = v; apres('Départ : ' + (v ? '« ' + libelle(v) + ' »' : 'les points du modèle') + ' (« Tester le parcours » part de là).');
    }, 'depart')));
    const liste = el('ul', 'edition-images');
    imgs.forEach(i => {
      const li = el('li', i === id ? 'courante' : null);
      const v = el('span', 'vignette');
      vignette(i).then(src => { if (src) { const im = new Image(); im.alt = ''; im.src = src; v.appendChild(im); } });
      li.appendChild(v);
      li.appendChild(el('span', 'nom', libelle(i) + (i === p.depart ? ' (départ)' : '')));
      const poser = bouton('Poser', () => Mur.pile.choisir(i), 'poser-' + i);
      poser.title = 'Poser cette image sur la pile';
      li.appendChild(poser);
      li.appendChild(bouton('Retirer', () => retirerImage(i), 'retirer-image-' + i));
      liste.appendChild(li);
    });
    si.appendChild(liste);
    // ajout : une image déjà dans la maquette, ou une image des Collections spéciales
    const ent = entrees();
    const autres = [...objets().values()].filter(o => !imgs.includes(o.id) && !ent.has(o.id) && (o.manifeste || o.image) && !o.modele3d);
    if (autres.length) {
      const sel = el('select');
      sel.dataset.cle = 'ajout-connue';
      sel.appendChild(new Option('— une image déjà dans la maquette —', ''));
      autres.sort((a, b) => libelle(a.id).localeCompare(libelle(b.id), 'fr')).forEach(o => sel.appendChild(new Option(libelle(o.id), o.id)));
      sel.addEventListener('change', () => { if (sel.value) ajouterAuScenario(sel.value); });
      si.appendChild(ligne('Maquette', sel));
    }
    const aj = el('div', 'edition-ajout');
    const entree = el('input');
    entree.type = 'url';
    entree.dataset.cle = 'ajout-adresse';
    entree.placeholder = 'Adresse de la page de l\'objet (…/items/…)';
    entree.setAttribute('aria-label', 'Adresse de l\'image des Collections spéciales à ajouter');
    entree.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') ajouterImage(entree.value); });
    aj.appendChild(entree);
    aj.appendChild(bouton('Ajouter', () => ajouterImage(entree.value), 'ajout-bouton'));
    const lc = el('div', 'edition-ligne');   // div, et non label : la ligne contient aussi un bouton
    lc.appendChild(el('span', null, 'Collections spéciales'));
    lc.appendChild(aj);
    si.appendChild(lc);
    si.appendChild(el('p', 'edition-aide', 'Ouvrir l\'objet (ou son permalien) dans le navigateur, puis copier l\'adresse de sa page et la coller dans le champ « Collections spéciales ».'));

    // Vérification
    const sv = section('Vérification', null, 3);
    const ul = el('ul', 'edition-verification');
    verifier().forEach(([genre, texte]) => ul.appendChild(el('li', genre, texte)));
    sv.appendChild(ul);

    exporter();
    restaurer(focus, defile);
  }
  function restaurer(focus, defile) {
    panneau.scrollTop = defile;
    if (focus) { const f = panneau.querySelector('[data-cle="' + CSS.escape(focus) + '"]'); if (f) f.focus({ preventScroll: true }); }
  }

  function exporter() {
    const se = section('Exporter', 'Télécharge les fichiers de données, à déposer dans donnees/ (ou à transmettre). Rien n\'est publié ni envoyé.', 3);
    const n = Mur.etat.numero;
    const l1 = el('div', 'edition-actions');
    if (n != null) l1.appendChild(bouton('scenario-' + n + '.json', () => exporterScenario(n), 'export-scenario'));
    l1.appendChild(bouton('objets.json', exporterObjets, 'export-objets'));
    l1.appendChild(bouton('Tous les fichiers', exporterTout, 'export-tout'));
    se.appendChild(l1);
    const l2 = el('div', 'edition-actions');
    if (ED.reprise) l2.appendChild(bouton('Reprendre les modifications conservées', () => {
      avant();
      appliquerEtat(ED.reprise.etat);
      ED.reprise = null;
      ED.selection = null;
      apres('Modifications conservées reprises.');
    }, 'reprendre'));
    l2.appendChild(bouton(ED.effacer ? 'Confirmer : effacer les modifications conservées' : 'Revenir aux fichiers de données', () => {
      if (!ED.effacer) { ED.effacer = true; rendre(); return; }
      try { localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ }
      location.reload();
    }, 'effacer'));
    se.appendChild(l2);
  }

  // ---------- Démarrage ----------
  const RAPPELS = {
    editionImage: (id, x, y) => ajouterElement(id, x, y),
    editionElement: (id, j) => { choisirElement(j); const f = panneau.querySelector('[data-cle="libelle-' + j + '"]'); if (f) f.focus({ preventScroll: true }); }
  };
  scene.classList.add('edition');
  if (scene.classList.contains('e169')) document.body.appendChild(panneau);   // 16:9 : à droite de la page (js/etat.js réserve sa place)
  panneau.hidden = false;
  Mur.etat.pret.then(() => {
    if (!Mur.etat.scenarios) return;   // données illisibles : js/etat.js affiche le message
    ED.empreinte = empreinte(JSON.stringify(etat()));
    try {
      const g = JSON.parse(localStorage.getItem(CLE) || 'null');
      if (g && g.etat) {
        const date = new Date(g.date).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' });
        if (g.empreinte === ED.empreinte) {
          appliquerEtat(g.etat);
          ED.message = 'Modifications reprises (conservées dans ce navigateur le ' + date + ').';
        } else {
          // fichiers de données changés depuis : la reprise se fait seulement si on la demande
          ED.reprise = g;
          ED.message = 'Des modifications faites le ' + date + ' sur d\'autres fichiers de données sont conservées dans ce navigateur. « Reprendre les modifications conservées » les applique à ces fichiers-ci.';
        }
      }
    } catch (e) { /* stockage indisponible : on part des fichiers */ }
    Mur.pile.edition(RAPPELS);
    brancherGlisser();
    brancherModele();
    document.addEventListener('mur:scenario', () => { ED.selection = null; ED.carte = null; modeAjoutPoint(false); rendre(); });
    document.addEventListener('mur:carte', () => {
      if (ED.silence) return;
      const c = Mur.pile.courante;
      if (c !== ED.carte) { ED.carte = c; if (ED.selection != null) { ED.selection = null; pile(null); } }
      rendre();
    });
    rendre();
  });

  Mur.edition = { actif: true, exporterTout, exporterScenario, exporterObjets, ajouterImage, verifier };
})();
