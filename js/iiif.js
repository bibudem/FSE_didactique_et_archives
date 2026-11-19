/* iiif.js — lecture des manifestes IIIF (API Présentation 2.x), tels que produits par DSpace 9.2
   pour les Collections spéciales et l'EDSR. Aucune bibliothèque : fetch seulement. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const cache = new Map();

  /* Repérage des entrées « metadata » par leur étiquette (convention du projet : l'API Présentation
     ne donne aucune sémantique à ces entrées). Étiquettes relevées sur les manifestes de l'EDSR le
     4 novembre 2026 (« Titre », « Permalien », « Notice », « Thème », « Mot-clé (s) »…), puis noms de
     champs possibles une fois le réglage iiif.metadata.item modifié (conception détaillée, section 5.6).
     « Notice » (recherche.note) contient aujourd'hui la référence de la source. */
  const CHAMPS = {
    createur: ['Créateur', 'Auteur(s)', 'dc.creator'],
    note_contextualisation: ['Note de contextualisation'],
    source: ['Notice', 'recherche.note', 'Source', 'dc.source'],
    date: ['Date', 'Date de création', 'dcterms.created', 'dcterms.issued', 'dc.date.issued'],
    description: ['Résumé', 'description', 'Description', 'dc.description.abstract'],
    autre_titre: ['Autre(s) Titre(s)', 'dc.title.alternative'],
    vue: ['Vue'],
    notes: ['Note(s)'],
    collection: ['Sous-collection', 'Collection'],
    fonds: ['Fonds'],
    note_pedagogique: ['Note pédagogique'],
    lien: ['Permalien', 'dc.identifier.uri'],
    themes: ['Thème', 'recherche.theme'],
    mots_cles: ['Mot-clé (s)', 'Mots-clés', 'recherche.keyword'],
    droits: ['Droits', 'dc.rights']
  };
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function dateLisible(t) {   // 1975.08.30 → 30 août 1975; 1953 → 1953
    const m = /^(\d{4})(?:\.(\d{2})\.(\d{2}))?\.?$/.exec(t.trim());
    if (!m) return t.trim();
    return m[2] ? (Number(m[3]) === 1 ? '1er' : Number(m[3])) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1] : m[1];
  }

  /* Champs complétés à partir du texte du manifeste, quand l'entrée attendue manque :
     - photographies (Note(s) « Photographie: Camille Laverdière, 1975.08.30 ») : créateur et date;
     - gravures (titre « … : W.E. Parry (1824), p. 290 ») : créateur et date, si une seule source est nommée;
     - description : le « Résumé », sinon la « Vue »;
     - source : la « Notice », sinon la sous-collection et le fonds (une « Source » qui n'est qu'un numéro d'image est écartée). */
  function completer(res) {
    res.source = res.source.filter(s => /\s/.test(s));
    const photo = res.notes.join(' ; ').match(/Photographie\s*:\s*([^,;]+?),\s*(\d{4}(?:\.\d{2}\.\d{2})?)/);
    const gravure = (res.titre.match(/:\s*([^():;]+?)\s*\((\d{4})\)/g) || []);
    if (photo) {
      if (!res.createur.length) res.createur = [photo[1].trim()];
      if (!res.date.length) res.date = [dateLisible(photo[2])];
    } else if (gravure.length === 1) {
      const g = /:\s*([^():;]+?)\s*\((\d{4})\)/.exec(gravure[0]);
      if (!res.createur.length) res.createur = [g[1].trim()];
      if (!res.date.length) res.date = [g[2]];
    }
    if (!res.description.length) res.description = res.vue;
    if (!res.source.length && (res.collection.length || res.fonds.length)) res.source = [res.collection.concat(res.fonds).join(' · ')];
    return res;
  }

  function lire(url) {
    if (!cache.has(url)) {
      const promesse = fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(e => { cache.delete(url); throw e; });
      cache.set(url, promesse);
    }
    return cache.get(url);
  }

  // Valeur IIIF 2.x : chaîne, liste, ou objet { "@value", "@language" }
  function valeurs(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v.flatMap(valeurs);
    if (typeof v === 'object') return v['@value'] != null ? [String(v['@value'])] : [];
    return [String(v)];
  }

  // Le texte des manifestes peut contenir un peu de HTML : on n'en garde que le texte.
  function texteSeul(t) {
    if (!/[<&]/.test(t)) return t.trim();
    const d = new DOMParser().parseFromString(t, 'text/html');
    return (d.body.textContent || '').trim();
  }

  // Valeur d'attente laissée dans l'EDSR (« [placeholder] ») : le champ existe, mais n'est pas encore rédigé
  const ATTENTE = /^\s*\[?\s*placeholder\s*\]?\s*$/i;
  function champs(manifeste) {
    const entrees = (manifeste.metadata || []).map(e => ({
      etiquette: texteSeul(valeurs(e.label)[0] || ''),
      valeurs: valeurs(e.value).map(texteSeul).filter(Boolean)
    }));
    const res = { titre: valeurs(manifeste.label).map(texteSeul).join(' ') };
    for (const [cle, etiquettes] of Object.entries(CHAMPS)) {
      const e = entrees.find(x => etiquettes.includes(x.etiquette));
      res[cle] = e ? e.valeurs.filter(v => !ATTENTE.test(v)) : [];
    }
    res.entrees = entrees;   // notice complète, dans l'ordre du manifeste (js/etat.js l'affiche en entier)
    res.toiles = ((manifeste.sequences && manifeste.sequences[0] && manifeste.sequences[0].canvases) || []).length;
    return completer(res);
  }

  // Service d'image de la première toile (sequences[0].canvases[0].images[0].resource.service)
  function service(manifeste) {
    const s = manifeste.sequences && manifeste.sequences[0];
    const toile = s && s.canvases && s.canvases[0];
    const image = toile && toile.images && toile.images[0];
    const svc = image && image.resource && image.resource.service;
    const un = Array.isArray(svc) ? svc[0] : svc;
    return un ? String(un['@id'] || un.id || '').replace(/\/$/, '') || null : null;
  }

  // Image réduite par le service d'image (taille « ,h » : niveau 1 de l'API Image 2)
  function vignette(svc, hauteur) {
    return svc + '/full/,' + Math.round(hauteur) + '/0/default.jpg';
  }

  Mur.iiif = { lire, champs, service, vignette, CHAMPS, ATTENTE };
})();
