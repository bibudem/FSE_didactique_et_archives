/* video.js — lecture de la vidéo, sous-titres et progression (mince barre au bas de la vidéo).
   La piste de sous-titres WebVTT est lue comme texte, puis ajoutée à l'élément <video> par addTextTrack :
   la page fonctionne ainsi sur le site comme en fichier local. La ligne du temps de la zone du bas suit
   le fil des choix du parcours (js/pile.js), et non la vidéo.
   Une adresse YouTube dans « video » est lue par le lecteur YouTube (voir LecteurYouTube, plus bas). */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const V = { el: {}, video: null, source: null };

  function init(o) {
    V.el = o.elements;
    V.el.bouton.addEventListener('click', () => (V.video && !V.video.paused ? pause() : lecture()));
  }


  function secondes(t) {
    const p = t.trim().split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }

  // Lecteur WebVTT minimal : identifiant facultatif, ligne « début --> fin », texte jusqu'à la ligne vide
  function lireVTT(texte) {
    const reperes = [];
    for (const bloc of String(texte || '').replace(/\r/g, '').split(/\n{2,}/)) {
      const lignes = bloc.split('\n').filter(l => l.trim() !== '');
      const i = lignes.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [debut, fin] = lignes[i].split('-->').map(s => secondes(s.trim().split(/\s+/)[0]));
      reperes.push({ id: i > 0 ? lignes[0].trim() : '', debut, fin, texte: lignes.slice(i + 1).join('\n') });
    }
    return reperes;
  }

  /* Vidéo YouTube : lue par l'API IFrame de YouTube (https://developers.google.com/youtube/iframe_api_reference),
     derrière la même interface qu'un élément <video> pour ce module : paused, ended, duration, currentTime,
     play(), pause() et les événements play, pause, ended, timeupdate, loadedmetadata, seeked, error, click.
     Les repères sont suivis par la position de lecture, lue 4 fois par seconde.
     - Son : la lecture démarre avec le son. Chrome le permet après un toucher sur la page (la carte du scénario),
       si l'iframe reçoit allow="autoplay" (https://developer.chrome.com/blog/autoplay).
     - Toucher : un voile couvre l'iframe; les commandes et les liens de YouTube restent inaccessibles au mur.
     - Connexion requise, et page servie par un serveur web : ouverte en fichier local (file://), la page n'envoie
       pas d'en-tête Referer, et YouTube refuse la lecture (erreur 153). */
  const MOTIF_YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/;
  function idYouTube(src) { const m = MOTIF_YOUTUBE.exec(String(src || '')); return m ? m[1] : null; }

  let apiYouTube = null;
  function chargerApiYouTube() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (!apiYouTube) apiYouTube = new Promise((ok, echec) => {
      const precedent = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof precedent === 'function') precedent(); ok(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { apiYouTube = null; echec(new Error('API YouTube non chargée')); };
      document.head.appendChild(s);
    });
    return apiYouTube;
  }

  class LecteurYouTube extends EventTarget {
    constructor(id, source) {
      super();
      this.paused = true; this.ended = false; this.duration = NaN; this.codeErreur = null;
      this.t = 0; this.joueur = null; this.pret = false; this.detruit = false; this.minuterie = null;
      this.boucle = !!source.boucle;
      this.lireDesQuePret = this.boucle;
      this.racine = document.createElement('div');
      this.racine.className = 'youtube';
      const f = document.createElement('iframe');
      f.title = source.libelle;
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      const p = new URLSearchParams({ enablejsapi: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, cc_load_policy: 0 });
      if (source.boucle) { p.set('mute', 1); p.set('loop', 1); p.set('playlist', id); }   // boucle : sans son, en boucle (vidéo d'introduction de l'accueil, retirée le 12 novembre 2026)
      else if (source.repeter) { p.set('loop', 1); p.set('playlist', id); }   // vidéo du scénario : en boucle, avec le son
      if (location.origin && location.origin !== 'null') p.set('origin', location.origin);
      f.src = 'https://www.youtube.com/embed/' + id + '?' + p;
      const voile = document.createElement('div');
      voile.className = 'voile';
      voile.addEventListener('click', () => this.dispatchEvent(new Event('click')));
      this.racine.append(f, voile);
      chargerApiYouTube().then(YT => {
        if (this.detruit) return;
        this.joueur = new YT.Player(f, { events: {
          onReady: () => this.surPret(),
          onStateChange: e => this.surEtat(e.data),
          onError: e => this.surErreur(e.data)
        } });
      }).catch(() => this.surErreur('API'));
    }
    get currentTime() { return this.t; }
    set currentTime(t) {
      this.t = t;
      if (this.pret) this.joueur.seekTo(t, true);
      this.envoyer('timeupdate');
      setTimeout(() => this.envoyer('seeked'), 0);
    }
    play() {
      this.lireDesQuePret = true;
      if (this.pret) this.joueur.playVideo();
      return Promise.resolve();
    }
    pause() {
      this.lireDesQuePret = false;
      if (this.pret) this.joueur.pauseVideo();
    }
    detruire() {
      this.detruit = true;
      this.arreter();
      try { if (this.joueur && this.joueur.destroy) this.joueur.destroy(); } catch (e) { /* lecteur déjà retiré */ }
      this.racine.remove();
    }
    envoyer(nom) { this.dispatchEvent(new Event(nom)); }
    surPret() {
      if (this.detruit) return;
      this.pret = true;
      if (!this.boucle && this.joueur.unMute) this.joueur.unMute();   // vidéo du scénario : avec le son
      this.majDuree();
      if (this.lireDesQuePret) this.joueur.playVideo();
    }
    majDuree() {
      const d = this.joueur && this.joueur.getDuration ? this.joueur.getDuration() : 0;
      if (d > 0 && !(this.duration > 0)) { this.duration = d; this.envoyer('loadedmetadata'); }
    }
    lire() {
      if (!this.joueur || !this.joueur.getCurrentTime) return;
      this.t = this.joueur.getCurrentTime() || 0;
      this.majDuree();
      this.envoyer('timeupdate');
    }
    arreter() { if (this.minuterie) { clearInterval(this.minuterie); this.minuterie = null; } }
    surEtat(etat) {   // -1 non démarrée, 0 terminée, 1 en lecture, 2 en pause, 3 en mémoire tampon, 5 prête
      if (etat === 1) {
        this.paused = false; this.ended = false;
        if (!this.minuterie) this.minuterie = setInterval(() => this.lire(), 250);
        this.lire();
        this.envoyer('play');
      } else if (etat === 2 || etat === 0) {
        this.arreter();
        this.lire();
        this.paused = true;
        this.ended = etat === 0;
        this.envoyer(etat === 0 ? 'ended' : 'pause');
      } else if (etat === 5) this.majDuree();
    }
    surErreur(code) { this.codeErreur = code; this.envoyer('error'); }
  }

  /* source : { libelle, src, sousTitres (texte WebVTT), credit, creditCourt, boucle, repeter, absente } ou null.
     repeter : en boucle, avec le son (vidéos des scénarios, depuis le soir du 12 novembre 2026).
     L'élément <video> est recréé à chaque chargement : les pistes ajoutées par addTextTrack ne se retirent pas. */
  function charger(source) {
    if (V.video) {
      V.video.pause();
      if (V.video.detruire) V.video.detruire();   // lecteur YouTube
      else { V.video.removeAttribute('src'); V.video.load(); V.video.remove(); }
    }
    V.video = null;
    V.source = source;
    V.el.progression.style.width = '0';
    V.el.libelle.textContent = source ? source.libelle : '';
    // source de la vidéo : en filigrane sur la vidéo (js/filigrane.js)
    if (Mur.filigrane) Mur.filigrane.bas.poser(source && source.src ? { court: source.creditCourt, complet: source.credit } : null);
    V.el.absente.hidden = !!(source && source.src);
    V.el.absente.textContent = source && source.absente ? source.absente : 'Vidéo : à venir';
    if (!source || !source.src) { majBouton(); return; }

    const yt = idYouTube(source.src);
    if (yt && location.protocol === 'file:') {   // YouTube refuse la lecture sans en-tête Referer (voir plus haut)
      V.el.absente.hidden = false;
      V.el.absente.textContent = 'Vidéo YouTube : ouvrir la page par un serveur web. En fichier local, YouTube refuse la lecture.';
      majBouton();
      return;
    }
    if (yt) chargerYouTube(yt, source);
    else chargerFichier(source);
    const v = V.video;

    v.addEventListener('timeupdate', majProgression);
    v.addEventListener('click', () => (v.paused ? lecture() : pause()));   // toucher la vidéo : pause, ou lecture
    v.addEventListener('play', majBouton);
    v.addEventListener('pause', majBouton);
    v.addEventListener('ended', majBouton);
    v.addEventListener('error', () => {
      // adresse blob: refusée (version autonome) : une seule reprise avec l'adresse data: (js/etat.js)
      if (source.secours && !v.dataset.secours) { v.dataset.secours = '1'; v.src = source.secours; return; }
      V.el.absente.hidden = false;
      V.el.absente.textContent = 'Vidéo illisible' + (/^(data|blob):/.test(source.src) ? '' : ' : ' + source.src) + (yt && v.codeErreur != null ? ' (YouTube, erreur ' + v.codeErreur + ')' : '');   // version autonome : pas d'adresse data: à l'écran
    });
    majBouton();
  }

  function chargerYouTube(id, source) {
    const v = new LecteurYouTube(id, source);
    V.el.hote.appendChild(v.racine);
    V.video = v;
  }

  function chargerFichier(source) {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.playsInline = true;
    v.setAttribute('aria-label', source.libelle);
    if (source.boucle) {   // boucle : lecture automatique, en boucle et sans son (permis par les navigateurs); servait à la vidéo d'introduction de l'accueil, retirée le 12 novembre 2026
      v.loop = true;
      v.muted = true;
      v.autoplay = true;
    }
    if (source.repeter) v.loop = true;   // vidéo du scénario : en boucle, avec le son; elle continue de jouer une fois réduite (soir du 12 novembre 2026)
    v.src = source.src;
    V.el.hote.appendChild(v);
    V.video = v;
    surveillerImage(v);

    if (source.sousTitres) {
      const st = v.addTextTrack('captions', 'Français', 'fr');
      for (const r of lireVTT(source.sousTitres)) st.addCue(new VTTCue(r.debut, r.fin, r.texte));
      st.mode = 'showing';
    }
  }

  /* Image figée alors que le son joue (Mac, 10 novembre 2026 : au début d'un scénario, la vidéo reste sur sa première
     image; un toucher la remet au bon endroit). Si la vidéo joue, mais qu'aucune nouvelle image n'est présentée pendant
     1,5 seconde (requestVideoFrameCallback), la lecture est replacée au même instant, ce qui force l'affichage.
     Au plus 5 fois par vidéo; rien si le navigateur ne connaît pas requestVideoFrameCallback. */
  function surveillerImage(v) {
    if (typeof v.requestVideoFrameCallback !== 'function') return;
    let derniere = performance.now(), relances = 0, tAvant = 0;
    const image = () => { derniere = performance.now(); if (v.isConnected) v.requestVideoFrameCallback(image); };
    v.requestVideoFrameCallback(image);
    const minuterie = setInterval(() => {
      if (!v.isConnected || relances >= 5) { clearInterval(minuterie); return; }
      const avance = v.currentTime - tAvant;
      tAvant = v.currentTime;
      const visible = v.offsetParent !== null && getComputedStyle(v).visibility !== 'hidden';
      if (v.paused || v.ended || v.readyState < 3 || document.hidden || !visible || avance <= 0) { derniere = performance.now(); return; }
      if (performance.now() - derniere > 1500) {
        relances++;
        derniere = performance.now();
        console.warn('Vidéo : image figée pendant la lecture; affichage relancé (' + relances + ').');
        v.currentTime = v.currentTime;
      }
    }, 1000);
  }

  function majProgression() {
    const v = V.video;
    if (v && v.duration) V.el.progression.style.width = (100 * v.currentTime / v.duration) + '%';
  }

  function majBouton() {
    const v = V.video;
    // pastille de lecture : visible seulement quand une vidéo est chargée et en pause
    V.el.bouton.hidden = !v || (!v.paused && !v.ended);
  }

  function aller(t) { if (V.video) V.video.currentTime = t; }
  /* Lecture refusée par le navigateur sans geste de l'utilisateur (?scenario=N : le scénario s'ouvre sans toucher) :
     la vidéo repart sans le son (13 novembre 2026) */
  function lecture() {
    const v = V.video;
    if (!v) return;
    v.play().catch(e => {
      if (e && e.name === 'NotAllowedError' && v instanceof HTMLMediaElement && !v.muted) { v.muted = true; v.play().catch(f => console.warn('Lecture refusée :', f.message)); }
      else console.warn('Lecture refusée :', e.message);
    });
  }
  function pause() { if (V.video) V.video.pause(); }

  Mur.video = { init, charger, lecture, pause, aller, lireVTT, surveiller: surveillerImage, get element() { return V.video; } };
})();
