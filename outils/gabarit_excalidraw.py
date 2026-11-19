#!/usr/bin/env python3
"""Produit le gabarit du tableau blanc (fichier .excalidraw) à partir de objets.json.
Usage : python3 gabarit_excalidraw.py objets.json gabarit.excalidraw [nombre d'équipes] [cadres par rangée]
Par défaut, 10 équipes sur une seule rangée : la bande s'accorde avec la zone « Vidéo/Tableau blanc » du mur, 9 colonnes × 1 rangée."""
import json, random, sys, textwrap

# objets dont l'image est disponible : ceux qui portent "image_edsr": "à venir" (manifeste sans image) attendent leur image dans l'EDSR
objets = [o for o in json.load(open(sys.argv[1], encoding="utf-8")) if not o.get("image_edsr")]
sortie = sys.argv[2]
EQUIPES = int(sys.argv[3]) if len(sys.argv) > 3 else 10
THEMES = ["Vêtements et traitement des peaux", "Protection contre le climat arctique",
          "Spiritualité et cérémonies", "Transports (et habitations)", "Mode de vie"]

random.seed(20261104)
n = [0]
def ident(prefixe):
    n[0] += 1
    return f"{prefixe}-{n[0]:04d}"
def base(type_, x, y, w, h, **autres):
    e = {"id": ident(type_[:4]), "type": type_, "x": x, "y": y, "width": w, "height": h, "angle": 0,
         "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid",
         "strokeWidth": 1, "strokeStyle": "solid", "roughness": 0, "opacity": 100,
         "groupIds": [], "frameId": None, "roundness": None, "seed": random.randint(1, 2**31 - 1),
         "version": 1, "versionNonce": random.randint(1, 2**31 - 1), "isDeleted": False,
         "boundElements": None, "updated": 1793836800000, "link": None, "locked": False}
    e.update(autres)
    return e
def texte(x, y, contenu, taille=20, **autres):
    lignes = contenu.split("\n")
    w = max(len(l) for l in lignes) * taille * 0.55
    h = len(lignes) * taille * 1.25
    return base("text", x, y, w, h, text=contenu, originalText=contenu, fontSize=taille, fontFamily=2,
                textAlign="left", verticalAlign="top", containerId=None, autoResize=True, lineHeight=1.25, **autres)

MARGE, CARTE_L, CARTE_H, ECART, COLS = 40, 300, 130, 30, 4
RANGS = -(-len(objets) // COLS)
CADRE_L = 2 * MARGE + COLS * CARTE_L + (COLS - 1) * ECART
CONSIGNE_H, THEME_H = 90, 56
LIBRES = COLS - (len(objets) % COLS or COLS)
EXTRA = 0 if LIBRES * (CARTE_L + ECART) - ECART >= 600 else ECART + 2 * THEME_H
CADRE_H = MARGE + CONSIGNE_H + ECART + RANGS * CARTE_H + (RANGS - 1) * ECART + EXTRA + MARGE
ENTRE = 200
PAR_RANGEE = int(sys.argv[4]) if len(sys.argv) > 4 else EQUIPES

elements = []
for k in range(EQUIPES):
    cx = (k % PAR_RANGEE) * (CADRE_L + ENTRE)
    cy = (k // PAR_RANGEE) * (CADRE_H + ENTRE)
    cadre = base("frame", cx, cy, CADRE_L, CADRE_H, name=f"Équipe {k + 1}")
    fid = cadre["id"]
    enfants = []
    # consigne
    g = ident("grp")
    enfants.append(base("rectangle", cx + MARGE, cy + MARGE, CADRE_L - 2 * MARGE, CONSIGNE_H,
                        backgroundColor="#fff9db", strokeStyle="dashed", groupIds=[g], roundness={"type": 3}))
    enfants.append(texte(cx + MARGE + 16, cy + MARGE + 16, "Consigne : à rédiger par l'équipe du projet.", 22, groupIds=[g]))
    # cartes des objets
    y0 = cy + MARGE + CONSIGNE_H + ECART
    for i, o in enumerate(objets):
        x = cx + MARGE + (i % COLS) * (CARTE_L + ECART)
        y = y0 + (i // COLS) * (CARTE_H + ECART)
        g = ident("grp")
        titre = o.get("titre_court") or o["titre"]
        lignes = textwrap.wrap(titre, 30)[:3]
        if len(textwrap.wrap(titre, 30)) > 3:
            lignes[-1] = lignes[-1][:27] + "…"
        # lien vers l'original : lien permanent de l'EDSR, sinon le premier lien de la notice (objets d'ailleurs)
        lien = ("https://hdl.handle.net/" + o["id"]) if o.get("manifeste") else ((o.get("lien") or [None])[0] if isinstance(o.get("lien"), list) else o.get("lien"))
        enfants.append(base("rectangle", x, y, CARTE_L, CARTE_H, backgroundColor="#ffffff", strokeWidth=2,
                            groupIds=[g], roundness={"type": 3}, link=lien))
        enfants.append(texte(x + 14, y + 12, "\n".join(lignes), 18, groupIds=[g]))
        enfants.append(texte(x + 14, y + CARTE_H - 28, o["id"], 14, groupIds=[g], strokeColor="#59636e"))
    # étiquettes des thèmes : dans les cases libres de la dernière rangée, sinon sous les cartes
    libres = COLS - (len(objets) % COLS or COLS)
    if libres * (CARTE_L + ECART) - ECART >= 600:
        zx = cx + MARGE + (COLS - libres) * (CARTE_L + ECART)
        zy = y0 + (RANGS - 1) * (CARTE_H + ECART)
        zl = libres * (CARTE_L + ECART) - ECART
    else:
        zx, zy, zl = cx + MARGE, y0 + RANGS * (CARTE_H + ECART), CADRE_L - 2 * MARGE
    tx, ty = zx, zy
    for th in THEMES:
        w = len(th) * 16 * 0.52 + 28
        if tx + w > zx + zl:
            tx, ty = zx, ty + THEME_H - 4
        g = ident("grp")
        enfants.append(base("rectangle", tx, ty, w, THEME_H - 16, backgroundColor="#ddf4ff", strokeColor="#0969da",
                            groupIds=[g], roundness={"type": 3}))
        enfants.append(texte(tx + 14, ty + 10, th, 16, groupIds=[g], strokeColor="#0969da"))
        tx += w + 16
    for e in enfants:
        e["frameId"] = fid
    elements += enfants + [cadre]

scene = {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
         "elements": elements, "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None}, "files": {}}
json.dump(scene, open(sortie, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{EQUIPES} équipes, {len(objets)} objets par équipe, {len(elements)} éléments; cadre {CADRE_L:.0f} × {CADRE_H:.0f}")
