/* parcours.js — enregistrement du parcours d'un appareil, sur demande (?parcours=1), depuis le 13 novembre 2026.
   Chaque geste est noté avec l'heure : page ouverte, scénario choisi, carte posée ou reprise dans le fil, notice ouverte,
   plein écran, tableau blanc, accueil… (appels de js/etat.js et js/pile.js). Le parcours est gardé dans ce navigateur
   (localStorage) : il survit à un rechargement de la page. « Parcours », dans le menu du coin, le télécharge en CSV ou en
   JSON, ou l'efface pour l'équipe suivante.
   Depuis le 14 novembre 2026, le CSV est fait pour l'enseignant : une ligne par étape qui compte (début du scénario, image
   ajoutée au fil, retour à une image précédente, image agrandie, tableau blanc ouvert, retour à l'accueil), en mots
   simples, sans identifiant; le JSON garde tous les gestes, pour l'analyse.
   Rien ne quitte l'appareil : le site est statique (hébergé par les Bibliothèques), sans serveur pour recevoir les données. Aucun nom
   d'étudiant : ?equipe=… donne seulement le nom de l'équipe ou de l'appareil (lettres, chiffres, espaces et tirets;
   30 caractères au plus), inscrit dans le fichier.
   Sans ?parcours=1, ou en mode édition, rien n'est noté et le bouton « Parcours » reste caché. */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const params = new URLSearchParams(window.MUR_PARAMS != null ? window.MUR_PARAMS : location.search);
  const ACTIF = params.get('parcours') === '1' && params.get('edition') !== '1';
  const EQUIPE = (params.get('equipe') || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 30);
  // une clé par équipe : trois appareils simulés dans un même navigateur (trois-ecrans.html) ne se mêlent pas
  const CLE = 'mur-parcours' + (EQUIPE ? '-' + EQUIPE : '');
  const $ = id => document.getElementById(id);
  let J = null;              // { session: { debut, equipe, adresse, format }, evenements: [...] }
  let minuterie = null;      // fermeture du panneau
  let confirmation = null;   // « Effacer » : second toucher pour confirmer

  // Date et heure locales, avec le décalage horaire (ex. 2026-11-13T18:20:05-05:00)
  function iso(d) {
    const z = n => String(n).padStart(2, '0');
    const dec = -d.getTimezoneOffset(), s = dec >= 0 ? '+' : '-', a = Math.abs(dec);
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds())
      + s + z(Math.floor(a / 60)) + ':' + z(a % 60);
  }
  function lire() { try { const t = localStorage.getItem(CLE); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function ecrire() { try { localStorage.setItem(CLE, JSON.stringify(J)); } catch (e) { /* stockage indisponible : le parcours reste en mémoire */ } }
  function nouveau() {
    J = { session: { debut: iso(new Date()), equipe: EQUIPE, adresse: location.protocol === 'blob:' ? 'simulation à trois écrans, #' + params.toString()
                       : (location.pathname.split('/').pop() || 'index.html') + location.search,
                     format: (params.get('ecran') || window.MUR_ECRAN || '') === '16x9' ? '16:9' : 'mur' }, evenements: [] };
    ecrire();
  }

  // Noter un geste : evenement (texte court), d : { scenario, objet, titre, detail }
  function noter(evenement, d) {
    if (!ACTIF) return;
    d = d || {};
    if (!J) J = lire() || null;
    if (!J || !Array.isArray(J.evenements)) nouveau();
    const t = new Date();
    const sc = d.scenario != null ? d.scenario : (Mur.etat && Mur.etat.numero) || '';
    J.evenements.push({ n: J.evenements.length + 1, date_heure: iso(t), secondes: Math.round((t - new Date(J.session.debut)) / 100) / 10,
                        equipe: EQUIPE, scenario: sc, evenement, objet: d.objet || '', titre: d.titre || '', detail: d.detail || '' });
    ecrire();
    resume();
  }

  // ---------- Fichiers ----------
  function horodatage() { return iso(new Date()).slice(0, 16).replace('T', '_').replace(':', 'h'); }
  // parcours_equipe-3_scenario-3_2026-11-14_13h28.csv (sans ?equipe= : « appareil »; sans scénario en cours : sans scénario)
  function nomFichier(ext) {
    const sc = (Mur.etat && Mur.etat.numero) || '';
    return 'parcours_' + (EQUIPE ? 'equipe-' + EQUIPE.replace(/\s+/g, '-') : 'appareil') + (sc ? '_scenario-' + sc : '') + '_' + horodatage() + '.' + ext;
  }
  function telecharger(nom, texte, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texte], { type }));
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  /* CSV pour l'enseignant (14 novembre 2026) : une ligne par étape qui compte, en mots simples; point-virgule entre les
     colonnes, comme dans les tableurs en français; chaque valeur entre guillemets; UTF-8 avec marque d'ordre (BOM), pour
     les accents. Les autres gestes (notice ouverte, vidéo réduite, page ouverte…) restent dans le JSON. */
  const ETAPES = {
    'scénario choisi': 'Début du scénario',
    'carte posée': 'Image ajoutée au fil',
    'images posées': 'Images ajoutées au fil',
    'carte reprise': 'Retour à une image précédente',
    'plein écran': 'Image agrandie',
    'tableau blanc ouvert': 'Tableau blanc ouvert',
    'accueil': 'Retour à l\u2019accueil'
  };
  const heure = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + ' h ' + m[2] : ''; };   // 13 h 28
  function csv() {
    const champ = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lignes = [['Étape', 'Heure', 'Scénario', 'Ce qui s\u2019est passé', 'Image', 'Élément touché'].map(champ).join(';')];
    let n = 0;
    for (const e of J.evenements) {
      const action = ETAPES[e.evenement];
      if (!action) continue;
      // au début du scénario, l'image de départ (detail); ailleurs, le titre de l'image et l'élément touché
      const image = e.evenement === 'scénario choisi' ? (e.detail || e.titre) : e.titre;
      const touche = e.evenement === 'carte posée' || e.evenement === 'images posées' ? e.detail : '';
      lignes.push([++n, heure(e.date_heure), e.scenario, action, image, touche].map(champ).join(';'));
    }
    return '\ufeff' + lignes.join('\r\n') + '\r\n';
  }
  function exporter(format) {
    if (!J) J = lire();
    if (!J || !J.evenements || !J.evenements.length) return;
    noter('parcours téléchargé', { detail: format.toUpperCase() });
    if (format === 'csv') telecharger(nomFichier('csv'), csv(), 'text/csv;charset=utf-8');
    else telecharger(nomFichier('json'), JSON.stringify(J, null, 2) + '\n', 'application/json');
    fermer();
  }
  function effacer() {
    try { localStorage.removeItem(CLE); } catch (e) { /* stockage indisponible */ }
    J = null;
    nouveau();
    noter('parcours effacé', { detail: 'nouveau parcours' });
  }

  // ---------- Panneau « Parcours » (menu du coin) ----------
  function resume() {
    const p = $('parcours-resume');
    if (!p) return;
    const n = J && J.evenements ? J.evenements.length : 0;
    const debut = J && J.session ? J.session.debut.slice(11, 16).replace(':', ' h ') : '';
    p.textContent = (EQUIPE ? 'Équipe ' + EQUIPE + ' · ' : '') + n + (n > 1 ? ' gestes notés' : ' geste noté') + (debut ? ' depuis ' + debut : '');
  }
  function ouvrir() {
    if (!J) J = lire();
    resume();
    $('parcours-panneau').hidden = false;
    retarder();
  }
  function fermer() {
    clearTimeout(minuterie);
    annulerConfirmation();
    $('parcours-panneau').hidden = true;
  }
  function retarder() { clearTimeout(minuterie); minuterie = setTimeout(fermer, 20000); }   // se ferme de lui-même après 20 secondes
  function annulerConfirmation() {
    clearTimeout(confirmation);
    confirmation = null;
    const b = $('btn-parcours-effacer');
    if (b) { b.textContent = 'Effacer'; b.classList.remove('confirmer'); }
  }

  function init() {
    const bouton = $('btn-parcours');
    if (!bouton) return;
    bouton.hidden = !ACTIF;
    if (!ACTIF) return;
    $('btn-coin').setAttribute('aria-label', 'Menu : Accueil, Tableau blanc et Parcours');
    $('btn-coin').title = 'Menu : Accueil, Tableau blanc et Parcours';
    J = lire() || J;   // sans stockage (page lue par une adresse blob:), garder les gestes déjà notés en mémoire
    bouton.addEventListener('click', ouvrir);   // js/etat.js replie le menu du coin
    $('btn-parcours-csv').addEventListener('click', () => exporter('csv'));
    $('btn-parcours-json').addEventListener('click', () => exporter('json'));
    $('btn-parcours-fermer').addEventListener('click', fermer);
    $('btn-parcours-effacer').addEventListener('click', e => {
      retarder();
      if (confirmation) { annulerConfirmation(); effacer(); return; }
      e.currentTarget.textContent = 'Confirmer l’effacement';   // pas de fenêtre du navigateur : un second toucher confirme
      e.currentTarget.classList.add('confirmer');
      confirmation = setTimeout(annulerConfirmation, 5000);
    });
    $('parcours-panneau').addEventListener('pointerdown', retarder);
  }

  Mur.parcours = { noter, get actif() { return ACTIF; }, get equipe() { return EQUIPE; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
