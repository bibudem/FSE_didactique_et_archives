/* carte.js — entrée d'un scénario par une carte comparative (scénario 2), dans la zone du bas.
   - En dessous, la carte récente (tuiles en ligne, Leaflet), en gris. Par-dessus, la carte ancienne de l'EDSR, géoréférencée :
     ses tuiles IIIF sont posées dans le navigateur, sur un canevas 2D, selon ses points de calage (annotation de
     géoréférencement, dans scenario-N.json : transformation affine, ou spline de plaque mince). Sans WebGL ni travailleurs :
     la carte s'affiche aussi dans Safari et dans une page ouverte comme fichier (12 novembre 2026).
   - Un rideau (poignée à glisser, sans étiquettes) dévoile la carte ancienne à gauche et la carte récente à droite, comme
     « Au fil du temps » du CIEQ; à gauche du rideau, la carte récente prend la teinte du papier de la carte ancienne; le
     rideau ne dépasse pas le bord droit de la carte ancienne. Une bulle l'annonce pendant 5 secondes.
   - Chaque carte a ses propres points, nommés, sans trait entre eux : on ne voit que ceux de la carte dévoilée. Les points
     n'apparaissent qu'au toucher de la carte (une main l'indique), pendant 7 secondes; toucher un point pose ses images sur
     la pile, en haut à droite de la carte (js/pile.js, sans fil).
   - À l'ouverture du scénario : la carte ancienne en plein écran pendant 5 secondes, puis elle glisse jusqu'à sa place.
   - La carte est fixe (ni zoom, ni déplacement, ni plein écran) : le cadre de départ, au zoom exact, montre le territoire
     qui compte. Une icône de carte, en bas à droite, ouvre la carte ancienne elle-même en plein écran (12 novembre 2026).
   - Si la pile chevauche la carte (--carte-libre, css/mur.css), la vue de départ et le rideau restent dans la partie libre.
   Bibliothèque : Leaflet 1.9.4 (window.L, lib/). */
(function () {
  'use strict';
  const Mur = window.Mur = window.Mur || {};
  const K = { el: {}, def: null, carte: null, couche: null, rideau: 0.5, marqueurs: [], rappels: {},
              observateur: null, versGeo: null, glisse: false, rideauTouche: false };
  const R = 6378137, PIR = Math.PI * R;   // Web Mercator (EPSG:3857), en mètres
  // main qui touche (index tendu, deux arcs) : invite à toucher la carte (aussi sur les images de la pile, js/pile.js)
  const MAIN = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path class="arcs" d="M6.3 6.6a5 5 0 0 1 8.4-3.1M8.6 7.6a2.6 2.6 0 0 1 4-2.2"/>'
    + '<path d="M10.6 13.4V7.7a1.3 1.3 0 0 1 2.6 0v5.1l3.6.5a2 2 0 0 1 1.7 2.2l-.6 4.2a2 2 0 0 1-2 1.7h-4.6a2 2 0 0 1-1.6-.8l-3.1-4.1a1.3 1.3 0 0 1 2-1.6Z"/></svg>';

  function element(tag, classe, texte) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte != null) e.textContent = texte;
    return e;
  }

  // ---------- Spline de plaque mince : pixels de l'image → coordonnées Web Mercator (mètres) ----------
  /* f(p) = a0 + a1·x + a2·y + Σ wᵢ·U(|p − pᵢ|), U(r) = r²·ln r; les points de calage sont respectés exactement.
     Les pixels sont centrés et réduits : la stabilité du calcul y gagne, l'interpolation reste la même. */
  function splinePlaqueMince(sources, cibles) {
    const n = sources.length;
    let mx = 0, my = 0;
    sources.forEach(([x, y]) => { mx += x / n; my += y / n; });
    let e = 1;
    sources.forEach(([x, y]) => { e = Math.max(e, Math.abs(x - mx), Math.abs(y - my)); });
    const p = sources.map(([x, y]) => [(x - mx) / e, (y - my) / e]);
    const U = d2 => (d2 > 0 ? d2 * Math.log(d2) / 2 : 0);   // r²·ln r = r²·ln(r²)/2
    const m = n + 3;
    const A = [];
    for (let i = 0; i < m; i++) A.push(new Array(m + 2).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) { const dx = p[i][0] - p[j][0], dy = p[i][1] - p[j][1]; A[i][j] = U(dx * dx + dy * dy); }
      A[i][n] = A[n][i] = 1;
      A[i][n + 1] = A[n + 1][i] = p[i][0];
      A[i][n + 2] = A[n + 2][i] = p[i][1];
      A[i][m] = cibles[i][0];
      A[i][m + 1] = cibles[i][1];
    }
    // élimination de Gauss, pivot partiel, deux seconds membres (x et y)
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c];
      if (!d) throw new Error('Points de calage dégénérés');
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const f = A[r][c] / d;
        if (f) for (let k = c; k < m + 2; k++) A[r][k] -= f * A[c][k];
      }
    }
    const wx = A.map((l, i) => l[m] / A[i][i]), wy = A.map((l, i) => l[m + 1] / A[i][i]);
    return (x, y) => {
      const qx = (x - mx) / e, qy = (y - my) / e;
      let X = wx[n] + wx[n + 1] * qx + wx[n + 2] * qy, Y = wy[n] + wy[n + 1] * qx + wy[n + 2] * qy;
      for (let i = 0; i < n; i++) {
        const dx = qx - p[i][0], dy = qy - p[i][1], u = U(dx * dx + dy * dy);
        X += wx[i] * u; Y += wy[i] * u;
      }
      return [X, Y];
    };
  }

  function mercator(lat, lon) {
    const l = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    return [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + l / 2))];
  }
  function latLon([mx, my]) {
    return [(2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI, mx / R * 180 / Math.PI];
  }

  // ---------- Transformation polynomiale (ordre 1 : affine; 2 : quadratique; 3 : cubique), par les moindres carrés ----------
  /* Moins déformante que la spline : la carte garde des côtés droits (ordre 1) ou doucement courbés (ordre 2), mais les
     points de calage ne coïncident plus exactement. Pixels centrés et réduits, comme pour la spline. */
  function polynomiale(sources, cibles, ordre) {
    const n = sources.length;
    let mx = 0, my = 0;
    sources.forEach(([x, y]) => { mx += x / n; my += y / n; });
    let e = 1;
    sources.forEach(([x, y]) => { e = Math.max(e, Math.abs(x - mx), Math.abs(y - my)); });
    const termes = (x, y) => {
      const u = (x - mx) / e, v = (y - my) / e, t = [];
      for (let d = 0; d <= ordre; d++) for (let j = 0; j <= d; j++) t.push(Math.pow(u, d - j) * Math.pow(v, j));
      return t;
    };
    const m = termes(mx, my).length;
    if (n < m) throw new Error('Trop peu de points de calage pour l\'ordre ' + ordre);
    // équations normales (m × m), deux seconds membres (x et y), élimination de Gauss avec pivot partiel
    const A = [];
    for (let i = 0; i < m; i++) A.push(new Array(m + 2).fill(0));
    sources.forEach(([x, y], i) => {
      const t = termes(x, y);
      for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) A[r][c] += t[r] * t[c];
        A[r][m] += t[r] * cibles[i][0];
        A[r][m + 1] += t[r] * cibles[i][1];
      }
    });
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c];
      if (!d) throw new Error('Points de calage dégénérés');
      for (let r = 0; r < m; r++) {
        if (r === c) continue;
        const k = A[r][c] / d;
        if (k) for (let j = c; j < m + 2; j++) A[r][j] -= k * A[c][j];
      }
    }
    const cx = A.map((l, i) => l[m] / A[i][i]), cy = A.map((l, i) => l[m + 1] / A[i][i]);
    return (x, y) => {
      const t = termes(x, y);
      let X = 0, Y = 0;
      for (let k = 0; k < m; k++) { X += cx[k] * t[k]; Y += cy[k] * t[k]; }
      return [X, Y];
    };
  }

  // Transformation de l'annotation (extension Georeference de IIIF, body.transformation) : « polynomial » (options.order :
  // 1 à 3) ou, par défaut, « thinPlateSpline »
  function transformation(annotation) {
    const f = (annotation.body && annotation.body.features) || [];
    const sources = f.map(x => x.properties.resourceCoords);
    const cibles = f.map(x => mercator(x.geometry.coordinates[1], x.geometry.coordinates[0]));
    const t = (annotation.body && annotation.body.transformation) || {};
    if (t.type === 'polynomial') return polynomiale(sources, cibles, Math.max(1, Math.min(3, (t.options && t.options.order) || 1)));
    return splinePlaqueMince(sources, cibles);
  }

  // ---------- Carte ancienne : tuiles IIIF déformées sur un canevas 2D ----------
  /* Une couche Leaflet : un canevas dans le plan « ancienne », redessiné à chaque fin de déplacement ou de zoom.
     Le contour de la carte (masque de l'annotation) découpe le dessin. Chaque tuile IIIF est découpée en petits
     triangles; chaque triangle de l'image est posé sur son triangle déformé par une transformation affine (drawImage).
     Niveau de détail : le facteur d'échelle IIIF dont les pixels sont aussi fins que ceux de l'écran; dessous, toujours,
     l'image entière à faible résolution, pendant que les tuiles arrivent. Les images sont lues par la balise <img> :
     ni requête « fetch », ni CORS (le canevas n'est jamais relu). */
  function coucheAncienne(annotation, versGeo, options) {
    const L = window.L;
    const source = annotation.target.source;
    const service = String(source.id || source['@id']).replace(/\/$/, '');
    const W = source.width, H = source.height;
    const TUILE = (options && options.tuile) || 512;
    const BASE = 64;   // image entière, à faible résolution (facteur 64 : environ 375 px de largeur)
    const sel = (annotation.target.selector && annotation.target.selector.value) || '';
    const nums = ((sel.match(/points="([^"]+)"/) || [])[1] || '').trim().split(/[\s,]+/).map(Number);
    let masque = [];
    for (let i = 0; i + 1 < nums.length; i += 2) masque.push([nums[i], nums[i + 1]]);
    if (masque.length < 3) masque = [[0, 0], [W, 0], [W, H], [0, H]];
    // contour déformé, densifié (les côtés du cadre se courbent)
    const contour = [];
    masque.forEach((a, i) => {
      const b = masque[(i + 1) % masque.length];
      for (let t = 0; t < 32; t++) contour.push(versGeo(a[0] + (b[0] - a[0]) * t / 32, a[1] + (b[1] - a[1]) * t / 32));
    });
    const mxs = masque.map(q => q[0]), mys = masque.map(q => q[1]);
    const cadreImage = [Math.min(...mxs), Math.min(...mys), Math.max(...mxs), Math.max(...mys)];
    const images = new Map(), maillages = new Map();
    let carte = null, canevas = null, ctx = null, attente = 0;

    function image(url) {
      let e = images.get(url);
      if (!e) {
        e = { img: new Image(), ok: false };
        e.img.decoding = 'async';
        e.img.onload = () => { e.ok = true; planifier(); };
        e.img.onerror = () => { e.erreur = true; };
        e.img.src = url;
        images.set(url, e);
      }
      return e;
    }
    // région de l'image (pixels) → maillage (n × n cellules), en mètres Web Mercator, mis en cache
    function maillage(cle, x0, y0, x1, y1, n) {
      let m = maillages.get(cle);
      if (!m) {
        m = { n, geo: new Float64Array((n + 1) * (n + 1) * 2) };
        for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
          const g = versGeo(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * j / n), k = 2 * (j * (n + 1) + i);
          m.geo[k] = g[0]; m.geo[k + 1] = g[1];
        }
        maillages.set(cle, m);
      }
      return m;
    }
    function triangle(img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
      const den = u0 * (v2 - v1) - u1 * v2 + u2 * v1 + (u1 - u2) * v0;
      if (!den) return;
      // triangle agrandi d'un demi-pixel autour de son centre : pas de fines lignes entre les triangles
      const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
      const g = (x, y) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * 0.6, y + dy / l * 0.6]; };
      const a = g(x0, y0), b = g(x1, y1), c = g(x2, y2);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
      ctx.clip();
      ctx.transform(
        -(v0 * (x2 - x1) - v1 * x2 + v2 * x1 + (v1 - v2) * x0) / den,
        -(v0 * (y2 - y1) - v1 * y2 + v2 * y1 + (v1 - v2) * y0) / den,
        (u0 * (x2 - x1) - u1 * x2 + u2 * x1 + (u1 - u2) * x0) / den,
        (u0 * (y2 - y1) - u1 * y2 + u2 * y1 + (u1 - u2) * y0) / den,
        (u0 * (v2 * x1 - v1 * x2) + v0 * (u1 * x2 - u2 * x1) + (u2 * v1 - u1 * v2) * x0) / den,
        (u0 * (v2 * y1 - v1 * y2) + v0 * (u1 * y2 - u2 * y1) + (u2 * v1 - u1 * v2) * y0) / den);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    // une région de l'image (x0, y0, x1, y1), lue au facteur s, posée sur l'écran; faux si elle n'est pas encore chargée
    function region(x0, y0, x1, y1, s, n, ecran, boite) {
      const w = x1 - x0, h = y1 - y0;
      const url = service + '/' + x0 + ',' + y0 + ',' + w + ',' + h + '/' + Math.max(1, Math.ceil(w / s)) + ',/0/default.jpg';
      const m = maillage(s + ':' + x0 + ':' + y0, x0, y0, x1, y1, n);
      const pts = new Float64Array(m.geo.length);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let k = 0; k < m.geo.length; k += 2) {
        const q = ecran(m.geo[k], m.geo[k + 1]); pts[k] = q[0]; pts[k + 1] = q[1];
        bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]);
      }
      if (bx1 < 0 || by1 < 0 || bx0 > boite[0] || by0 > boite[1]) return true;   // hors du canevas : rien à charger
      const e = image(url);
      if (!e.ok) return false;
      const iw = e.img.naturalWidth, ih = e.img.naturalHeight, N = m.n + 1;
      for (let j = 0; j < m.n; j++) for (let i = 0; i < m.n; i++) {
        const a = 2 * (j * N + i), b = a + 2, c = a + 2 * N, d = c + 2;
        const ua = iw * i / m.n, ub = iw * (i + 1) / m.n, va = ih * j / m.n, vb = ih * (j + 1) / m.n;
        triangle(e.img, ua, va, ub, va, ua, vb, pts[a], pts[a + 1], pts[b], pts[b + 1], pts[c], pts[c + 1]);
        triangle(e.img, ub, va, ub, vb, ua, vb, pts[b], pts[b + 1], pts[d], pts[d + 1], pts[c], pts[c + 1]);
      }
      return true;
    }
    function planifier() {
      if (attente || !carte) return;
      attente = requestAnimationFrame(() => { attente = 0; dessiner(); });
    }
    function dessiner() {
      if (!carte || !canevas) return;
      const taille = carte.getSize();
      if (!taille.x || !taille.y) return;
      const marge = taille.x > 3000 ? 0.05 : 0.3;   // le canevas déborde un peu : un glissement ne laisse pas de vide
      const px = Math.round(taille.x * marge), py = Math.round(taille.y * marge);
      const w = taille.x + 2 * px, h = taille.y + 2 * py;
      const r = Math.min(window.devicePixelRatio || 1, Math.sqrt(25e6 / (w * h)));   // 25 millions de pixels au plus
      const cw = Math.round(w * r), ch = Math.round(h * r);
      if (canevas.width !== cw || canevas.height !== ch) { canevas.width = cw; canevas.height = ch; }
      canevas.style.width = w + 'px';
      canevas.style.height = h + 'px';
      const coin = carte.containerPointToLayerPoint([-px, -py]);   // coin du canevas, en coordonnées du plan
      L.DomUtil.setPosition(canevas, coin);
      const echelle = 256 * Math.pow(2, carte.getZoom()) / (2 * PIR);
      const o = carte.getPixelOrigin();
      const ecran = (gx, gy) => [((gx + PIR) * echelle - o.x - coin.x) * r, ((PIR - gy) * echelle - o.y - coin.y) * r];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.save();
      ctx.beginPath();
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
      contour.forEach((g, i) => {
        const q = ecran(g[0], g[1]);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        sx0 = Math.min(sx0, q[0]); sx1 = Math.max(sx1, q[0]); sy0 = Math.min(sy0, q[1]); sy1 = Math.max(sy1, q[1]);
      });
      ctx.closePath();
      ctx.clip();
      const boite = [cw, ch];
      // niveau de détail : pixels d'écran par pixel d'image, mesurés sur le cadre de la carte
      const parPixel = Math.sqrt(((sx1 - sx0) * (sy1 - sy0)) / ((cadreImage[2] - cadreImage[0]) * (cadreImage[3] - cadreImage[1])));
      let s = 1;
      while (s < BASE && parPixel * s * 2 <= 1) s *= 2;
      region(0, 0, W, H, BASE, 24, ecran, boite);   // fond : l'image entière, à faible résolution
      if (s < BASE) {
        const pas = TUILE * s;
        for (let y = Math.floor(cadreImage[1] / pas) * pas; y < cadreImage[3]; y += pas) {
          for (let x = Math.floor(cadreImage[0] / pas) * pas; x < cadreImage[2]; x += pas) {
            region(x, y, Math.min(x + pas, W), Math.min(y + pas, H), s, 4, ecran, boite);
          }
        }
      }
      ctx.restore();
      if (K.carte === carte) decouper();
    }
    const Couche = L.Layer.extend({
      options: { pane: 'ancienne' },
      onAdd(m) {
        carte = m;
        canevas = L.DomUtil.create('canvas', 'carte-ancienne leaflet-zoom-hide');
        ctx = canevas.getContext('2d');
        this.getPane().appendChild(canevas);
        m.on('moveend zoomend resize viewreset', dessiner);
        dessiner();
      },
      onRemove(m) {
        m.off('moveend zoomend resize viewreset', dessiner);
        if (canevas) canevas.remove();
        canevas = ctx = carte = null;
        if (attente) cancelAnimationFrame(attente);
        attente = 0;
      },
      redessiner() { dessiner(); },
      canevas() { return canevas; },
      contour() { return contour; },
      cadreImage() { return cadreImage; }
    });
    return new Couche(options);
  }

  // ---------- Carte comparative ----------
  /* def : { ancienne: { objet, libelle, georeference, tuile }, recente: { libelle, tuiles, attribution, zoom_max },
             vue: { cadre: [[lat, lon], [lat, lon]] } ou { centre: [lat, lon], zoom }, rideau,
             points: { ancienne: [{ libelle, nom, sous_titre, x, y, objets }], recente: [{ libelle, nom, sous_titre, lat, lon, source, objets }] },
             objets: Map } */
  function charger(hote, def, rappels) {
    vider();
    if (!def || !window.L) {
      if (hote) hote.appendChild(element('p', 'carte-absente', 'Carte comparative : bibliothèque absente (lib/leaflet.js).'));
      return;
    }
    const L = window.L;
    K.def = def;
    K.rappels = rappels || {};
    K.rideauTouche = false;

    const racine = element('div', 'carte-comparee');
    const fond = element('div', 'carte-fond');
    racine.appendChild(fond);
    // rideau : trait vertical et poignée (sans étiquettes depuis le 12 novembre 2026, au soir), et sa bulle d'invitation
    const rideau = element('div', 'carte-rideau');
    const poignee = element('button', 'carte-poignee');
    poignee.type = 'button';
    poignee.setAttribute('aria-label', 'Rideau : glisser pour dévoiler la carte ancienne ou la carte récente');
    poignee.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6 3 12l6 6zM15 6l6 6-6 6z"/></svg>';
    rideau.appendChild(poignee);
    const bulle = element('div', 'carte-invite', 'Glisser la barre pour comparer les deux cartes');
    bulle.setAttribute('aria-hidden', 'true');
    rideau.appendChild(bulle);
    racine.appendChild(rideau);
    // main : toucher la carte fait apparaître les points
    const main = element('span', 'main-toucher carte-main');
    main.setAttribute('aria-hidden', 'true');
    main.innerHTML = MAIN;
    racine.appendChild(main);
    racine.classList.add('points-caches');
    // icône de carte, en bas à droite : la carte ancienne elle-même, en plein écran (js/etat.js)
    const ouvrir = element('button', 'icone seule carte-ouvrir');
    ouvrir.type = 'button';
    const nomAncienne = (def.ancienne && def.ancienne.libelle) || 'Carte ancienne';
    ouvrir.setAttribute('aria-label', 'Affichage plein écran : ' + nomAncienne);
    ouvrir.title = 'Affichage plein écran : ' + nomAncienne;
    ouvrir.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M3 6.2 8.6 4l6.8 2.4L21 4.2v13.6L15.4 20l-6.8-2.4L3 19.8Z" opacity=".55"/><path d="M8.6 4v13.6l6.8 2.4V6.4Z"/></svg>';
    ouvrir.addEventListener('click', e => { e.stopPropagation(); if (K.rappels.agrandir && def.ancienne && def.ancienne.objet) K.rappels.agrandir(def.ancienne.objet); });
    if (!(def.ancienne && def.ancienne.objet)) ouvrir.hidden = true;
    racine.appendChild(ouvrir);
    hote.appendChild(racine);
    K.el = { hote, racine, fond, rideau, poignee, ouvrir, bulle };

    // carte fixe : ni zoom ni déplacement; zoom exact (fractionnaire) pour cadrer le territoire (css/mur.css : tuiles
    // agrandies d'un pixel, sans quoi de fines lignes les séparent)
    const carte = L.map(fond, { zoomControl: false, zoomSnap: 0, zoomAnimation: false, attributionControl: true, worldCopyJump: false,
                                dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false });
    carte.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    const r = def.recente || {};
    if (r.tuiles) {
      L.tileLayer(r.tuiles, { attribution: r.attribution || '', maxZoom: r.zoom_max || 18 }).addTo(carte);
      // les mêmes tuiles, teintes comme le papier de la carte ancienne (css/mur.css), visibles à gauche du rideau seulement
      carte.createPane('teinte').style.zIndex = 300;
      L.tileLayer(r.tuiles, { pane: 'teinte', maxZoom: r.zoom_max || 18 }).addTo(carte);
    }
    carte.createPane('ancienne').style.zIndex = 350;   // au-dessus des tuiles (200 et 300), sous les points (600)
    K.carte = carte;
    cadrer();

    const annotation = def.ancienne && def.ancienne.georeference;
    if (annotation) {
      try {
        K.versGeo = transformation(annotation);
        K.couche = coucheAncienne(annotation, K.versGeo, { tuile: def.ancienne.tuile }).addTo(carte);
      } catch (err) { console.error('Carte ancienne non géoréférencée :', err); }
    }
    poserPoints();

    carte.on('move zoom resize viewreset zoomend moveend', decouper);
    carte.on('click', montrerPoints);   // toucher la carte : les points apparaissent
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick'].forEach(t => ouvrir.addEventListener(t, e => e.stopPropagation()));
    glisserRideau(poignee);
    // la vue de départ suit la taille de la zone (elle s'agrandit à l'ouverture du scénario)
    K.observateur = new ResizeObserver(() => {
      carte.invalidateSize({ animate: false });
      cadrer();
      if (!K.rideauTouche) K.rideau = rideauDepart();
      placerRideau();
    });
    K.observateur.observe(racine);
    K.rideau = rideauDepart();
    placerRideau();
  }

  // Largeur de la carte que la pile ne chevauche pas (css/mur.css, --carte-libre), en px CSS
  function libre() {
    const w = K.el.fond ? K.el.fond.offsetWidth : 0;
    const v = K.el.racine ? parseFloat(getComputedStyle(K.el.racine).getPropertyValue('--carte-libre')) : NaN;
    return w ? Math.min(w, v > 0 ? v : w) : 0;
  }
  // Position de départ du rideau (scenario-N.json, carte.rideau, de 0 à 1, en fraction de la partie libre); 1 : aussi loin
  // que le permet placerRideau(), soit au bord droit de la carte ancienne, entière à gauche (scénario 2, 12 novembre 2026, soir)
  function rideauDepart() {
    const w = K.el.fond ? K.el.fond.offsetWidth : 0;
    const f = K.def && K.def.rideau != null ? K.def.rideau : 0.5;
    return w ? f * libre() / w : f;
  }

  function poserPoints() {
    const L = window.L;
    const pts = (K.def && K.def.points) || {};
    const taille = parseFloat(getComputedStyle(K.el.racine).getPropertyValue('--point-carte')) || 88;
    K.marqueurs.forEach(m => m.marqueur.remove());
    K.marqueurs = [];
    ['ancienne', 'recente'].forEach(cote => {
      (pts[cote] || []).forEach((p, i) => {
        let pos = null;
        if (cote === 'ancienne' && K.versGeo && p.x != null) pos = latLon(K.versGeo(p.x, p.y));
        if (cote === 'recente' && p.lat != null) pos = [p.lat, p.lon];
        if (!pos) return;
        const nom = document.createElement('span');
        nom.textContent = p.libelle || p.nom || '';
        const icone = L.divIcon({ className: 'point-carte ' + cote + (p.nom_a_gauche ? ' nom-a-gauche' : ''),
                                  html: '<span class="numero">' + (i + 1) + '</span><span class="nom">' + nom.innerHTML + '</span>',
                                  iconSize: [taille, taille], iconAnchor: [taille / 2, taille / 2] });
        const m = L.marker(pos, { icon: icone, keyboard: true, title: p.nom || p.libelle || '', riseOnHover: true }).addTo(K.carte);
        m.on('click', () => poserImages(cote, i));
        K.marqueurs.push({ cote, indice: i, marqueur: m });
      });
    });
    decouper();
  }

  // Rideau : la carte ancienne n'est visible qu'à gauche du rideau; chaque point n'est visible que du côté de sa carte
  function decouper() {
    if (!K.carte || !K.el.fond) return;
    const boite = K.el.fond.getBoundingClientRect();
    const echelle = boite.width / (K.el.fond.offsetWidth || 1);   // page réduite (?echelle=) : rapport écran / CSS
    const xRideau = K.rideau * K.el.fond.offsetWidth;            // en px CSS, dans le cadre de la carte
    const teinte = K.carte.getPane('teinte');
    if (teinte) {   // plan de la teinte : polygone en coordonnées du plan (origine : coin du plan de la carte)
      const a = K.carte.containerPointToLayerPoint([-50, -50]), b = K.carte.containerPointToLayerPoint([xRideau, K.el.fond.offsetHeight + 50]);
      teinte.style.clipPath = 'polygon(' + a.x + 'px ' + a.y + 'px, ' + b.x + 'px ' + a.y + 'px, ' + b.x + 'px ' + b.y + 'px, ' + a.x + 'px ' + b.y + 'px)';
    }
    const canevas = K.couche && K.couche.canevas();
    if (canevas) {
      const c = canevas.getBoundingClientRect();
      const droite = Math.max(0, (c.right - (boite.left + xRideau * echelle)) / echelle);
      canevas.style.clipPath = 'inset(0 ' + droite + 'px 0 0)';
    }
    K.marqueurs.forEach(({ cote, marqueur }) => {
      const e = marqueur.getElement();
      if (!e) return;
      const aGauche = K.carte.latLngToContainerPoint(marqueur.getLatLng()).x < xRideau;
      const visible = cote === 'ancienne' ? aGauche : !aGauche;
      e.style.opacity = visible ? '1' : '0';
      e.style.pointerEvents = visible ? '' : 'none';
      e.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function placerRideau() {
    if (!K.el.rideau) return;
    const w = K.el.fond.offsetWidth;
    let max = w ? libre() / w : 1;
    const bord = bordDroit();
    if (w && bord != null) max = Math.min(max, bord / w);   // pas plus loin que le bord droit de la carte ancienne
    const demi = K.el.poignee ? K.el.poignee.offsetWidth / 2 : 0;
    if (w && demi) max = Math.min(max, 1 - demi / w);        // ni la poignée hors de la carte
    K.rideau = Math.min(max, Math.max(0, K.rideau));
    K.el.rideau.style.left = (K.rideau * 100) + '%';
    K.el.rideau.classList.toggle('a-droite', K.rideau > 0.5);   // bulle d'invitation à gauche de la poignée (css/mur.css)
    decouper();
  }

  // Bord droit de la carte ancienne (contour du masque), en px CSS dans le cadre de la carte
  function bordDroit() {
    if (!K.carte || !K.couche || !K.couche.contour) return null;
    let x = -Infinity;
    K.couche.contour().forEach(g => { x = Math.max(x, K.carte.latLngToContainerPoint(latLon(g)).x); });
    return isFinite(x) ? x : null;
  }

  function glisserRideau(poignee) {
    const deplacer = e => {
      const b = K.el.fond.getBoundingClientRect();
      K.rideau = (e.clientX - b.left) / b.width;
      placerRideau();
    };
    poignee.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      K.glisse = K.rideauTouche = true;
      finInvitation();
      poignee.setPointerCapture(e.pointerId);
      poignee.classList.add('active');
    });
    poignee.addEventListener('pointermove', e => { if (K.glisse) { e.stopPropagation(); deplacer(e); } });
    const fin = e => { if (!K.glisse) return; K.glisse = false; poignee.classList.remove('active'); try { poignee.releasePointerCapture(e.pointerId); } catch (_) { /* déjà relâché */ } };
    poignee.addEventListener('pointerup', fin);
    poignee.addEventListener('pointercancel', fin);
    poignee.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { K.rideauTouche = true; K.rideau -= 0.05; placerRideau(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { K.rideauTouche = true; K.rideau += 0.05; placerRideau(); e.preventDefault(); }
    });
    ['mousedown', 'touchstart', 'click', 'dblclick'].forEach(t => poignee.addEventListener(t, e => e.stopPropagation()));
  }

  // Points : cachés au départ; un toucher sur la carte les montre pendant 7 secondes (même durée que les éléments d'une
  // image de la pile); chaque toucher, sur la carte ou sur un point, relance le compte
  const DUREE_POINTS = 7000;
  function montrerPoints() {
    if (!K.el.racine) return;
    K.el.racine.classList.remove('points-caches');
    clearTimeout(K.minuteriePoints);
    K.minuteriePoints = setTimeout(() => { if (K.el.racine) K.el.racine.classList.add('points-caches'); }, DUREE_POINTS);
  }

  // Bulle « Glisser la barre… », près de la poignée : 5 secondes, en bougeant un peu; elle part dès qu'on touche le rideau
  const DUREE_BULLE = 5000;
  function inviter() {
    document.dispatchEvent(new CustomEvent('mur:entree-prete'));   // carte à sa place : le titre et la question passent à gauche (js/etat.js)
    if (!K.el.rideau || K.rideauTouche) return;
    K.el.rideau.classList.add('invite');
    clearTimeout(K.minuterieBulle);
    K.minuterieBulle = setTimeout(finInvitation, DUREE_BULLE);
  }
  function finInvitation() {
    clearTimeout(K.minuterieBulle);
    if (K.el.rideau) K.el.rideau.classList.remove('invite');
  }

  /* Ouverture du scénario : la carte ancienne (son cadre) en plein écran, sur la page floue et pâlie, pendant 5 secondes
     (un toucher abrège), puis elle glisse jusqu'à sa place sur la carte comparative, en 2,4 secondes, et s'efface; la
     bulle du rideau suit. La place d'arrivée est celle des trois coins du cadre (exacte pour une transformation affine). */
  const INTRO = 5000, GLISSEMENT = 2400;
  function introduire() {
    const scene = document.getElementById('scene');
    const a = K.def && K.def.ancienne, annotation = a && a.georeference;
    if (!scene || !K.carte || !K.versGeo || !K.couche || !annotation) { inviter(); return; }
    finIntro();
    const source = annotation.target.source;
    const service = String(source.id || source['@id']).replace(/\/$/, '');
    const [x0, y0, x1, y1] = K.couche.cadreImage();
    const W = scene.offsetWidth, H = scene.offsetHeight;
    // au mur avec ?eviter=3-4 : sur les colonnes 5 à 9 (écrans hors service sur les colonnes 3 et 4)
    const zx0 = scene.classList.contains('eviter-3-4') ? 4 * 1280 : 0, zw = W - zx0;
    const marge = H * 0.04, ratio = (x1 - x0) / (y1 - y0);
    let iw = zw - 2 * marge, ih = iw / ratio;
    if (ih > H - 2 * marge) { ih = H - 2 * marge; iw = ih * ratio; }
    const voile = element('div', 'carte-intro');
    const img = new Image();
    img.className = 'carte-intro-image';
    img.alt = a.libelle || '';
    img.style.width = iw + 'px';
    img.style.height = ih + 'px';
    img.style.transform = 'translate(' + (zx0 + (zw - iw) / 2) + 'px, ' + ((H - ih) / 2) + 'px)';
    voile.appendChild(img);
    const intro = K.intro = { voile, minuteries: [] };
    const plus = (fn, t) => intro.minuteries.push(setTimeout(fn, t));
    const glisser = () => {
      if (K.intro !== intro || intro.glisse) return;
      intro.glisse = true;
      intro.minuteries.forEach(clearTimeout);
      const boite = scene.getBoundingClientRect(), k = boite.width / (W || 1);
      const fond = K.el.fond.getBoundingClientRect();
      const ox = (fond.left - boite.left) / k, oy = (fond.top - boite.top) / k;
      const coin = (x, y) => { const c = K.carte.latLngToContainerPoint(latLon(K.versGeo(x, y))); return [ox + c.x, oy + c.y]; };
      const p0 = coin(x0, y0), p1 = coin(x1, y0), p2 = coin(x0, y1);
      img.style.transform = 'matrix(' + [(p1[0] - p0[0]) / iw, (p1[1] - p0[1]) / iw, (p2[0] - p0[0]) / ih, (p2[1] - p0[1]) / ih, p0[0], p0[1]].join(',') + ')';
      voile.classList.add('glisse');
      scene.classList.remove('carte-intro-active');
      plus(() => { voile.classList.add('efface'); }, GLISSEMENT);
      plus(() => { finIntro(); inviter(); }, GLISSEMENT + 800);
    };
    voile.addEventListener('pointerdown', e => { e.stopPropagation(); glisser(); });
    img.onerror = () => { if (K.intro === intro) { finIntro(); inviter(); } };
    img.onload = () => {
      if (K.intro !== intro) return;
      voile.classList.add('pret');
      plus(glisser, INTRO);
    };
    img.src = service + '/' + x0 + ',' + y0 + ',' + (x1 - x0) + ',' + (y1 - y0) + '/' + Math.min(3000, Math.ceil(iw * Math.min(2, window.devicePixelRatio || 1))) + ',/0/default.jpg';
    scene.appendChild(voile);
    scene.classList.add('carte-intro-active');
    plus(() => { if (!voile.classList.contains('pret')) { finIntro(); inviter(); } }, 8000);   // image trop lente : on passe
  }
  function finIntro() {
    const intro = K.intro;
    K.intro = null;
    const scene = document.getElementById('scene');
    if (scene) scene.classList.remove('carte-intro-active');
    if (!intro) return;
    intro.minuteries.forEach(clearTimeout);
    intro.voile.remove();
  }

  // Toucher un point : ses images se posent sur la pile (la première sur le dessus); le point devient un repère atteint
  function poserImages(cote, i) {
    montrerPoints();
    const p = K.def.points[cote][i];
    const ids = (p.objets || (p.objet ? [p.objet] : [])).filter(id => !K.def.objets || K.def.objets.has(id));
    const m = K.marqueurs.find(x => x.cote === cote && x.indice === i);
    if (m && m.marqueur.getElement()) m.marqueur.getElement().classList.add('atteinte');
    if (K.rappels.poser && ids.length) K.rappels.poser(ids.slice().reverse(), p.libelle || p.nom);
  }

  function vider() {
    finIntro();
    clearTimeout(K.minuteriePoints);
    clearTimeout(K.minuterieBulle);
    if (K.observateur) { K.observateur.disconnect(); K.observateur = null; }
    if (K.carte) { K.carte.remove(); K.carte = null; }
    K.couche = null; K.marqueurs = []; K.def = null; K.versGeo = null;
    if (K.el.racine) K.el.racine.remove();
    K.el = {};
  }

  // Vue de départ : le cadre (sud-ouest, nord-est) remplit la partie libre de la zone, au zoom exact (carte fixe)
  function cadrer() {
    if (!K.carte || !K.def) return;
    const v = K.def.vue || {};
    if (!v.cadre) { K.carte.setView(v.centre || [56, -70], v.zoom || 4, { animate: false }); return; }
    const t = K.carte.getSize();
    const lib = libre() || t.x;
    if (!t.x || !t.y) return;
    const a = mercator(v.cadre[0][0], v.cadre[0][1]), b = mercator(v.cadre[1][0], v.cadre[1][1]);
    const largeur = Math.abs(b[0] - a[0]), hauteur = Math.abs(b[1] - a[1]);
    const z0 = 256 / (2 * PIR);   // pixels par mètre au zoom 0
    const exact = Math.log2(Math.min(lib / (largeur * z0), t.y / (hauteur * z0)));
    const z = Math.max(0, Math.min(K.def.recente && K.def.recente.zoom_max || 18, exact));
    // centre du cadre placé au centre de la partie libre
    const centre = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const echelle = z0 * Math.pow(2, z);
    const decalage = (t.x - lib) / 2 / echelle;   // en mètres, vers l'est
    K.carte.setView(latLon([centre[0] + decalage, centre[1]]), z, { animate: false });
  }

  function reinitialiser() {
    if (!K.carte || !K.def) return;
    K.rideauTouche = false;
    cadrer();
    K.rideau = rideauDepart();
    placerRideau();
    K.marqueurs.forEach(m => { const e = m.marqueur.getElement(); if (e) e.classList.remove('atteinte'); });
    if (K.el.racine) K.el.racine.classList.add('points-caches');
  }

  Mur.carte = { charger, vider, reinitialiser, introduire, inviter, montrerPoints,
                get active() { return !!K.carte; }, get rideau() { return K.rideau; },
                set rideau(v) { K.rideau = v; K.rideauTouche = true; placerRideau(); },
                get leaflet() { return K.carte; }, get couche() { return K.couche; }, get marqueurs() { return K.marqueurs; },
                versGeo: (x, y) => (K.versGeo ? latLon(K.versGeo(x, y)) : null) };
})();
