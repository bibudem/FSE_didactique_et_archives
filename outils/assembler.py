#!/usr/bin/env python3
"""Produit une version autonome de la maquette : un seul fichier HTML, à ouvrir sans serveur web.

Usage (depuis la racine du dépôt) :
    python3 outils/assembler.py [--ecran 16x9] [sortie.html]
    python3 outils/assembler.py --trois [sortie.html]

--ecran 16x9 : disposition pour un écran 16:9 (ordinateur, projecteur), comme ?ecran=16x9.
--trois : simulation à trois écrans autonome (simulation-trois-ecrans.html, 14 novembre 2026) : trois-ecrans.html, avec la
version autonome 16:9 intégrée; un seul fichier, qui fonctionne seul, peu importe son nom (et celui des autres fichiers).
Sortie par défaut : maquette-16x3.html (mur de 11 520 × 2 160 px, format 16:3) ou maquette-16x9.html, à la racine du dépôt
(fichiers inclus dans le répertoire GitHub).
Le fichier intègre la feuille de style, les scripts, OpenSeadragon, les fichiers de donnees/,
les pistes WebVTT et les vidéos (en data: URI); un média absent de medias/ est signalé et laissé de côté. Les manifestes et les images restent lus
dans l'EDSR par IIIF : une connexion Internet est nécessaire.
Il ne sert qu'à l'aperçu : la source reste index.html et les fichiers du dépôt.
Python 3 seulement, sans module externe.
"""
import base64
import json
import mimetypes
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent


def lire(chemin):
    return (RACINE / chemin).read_text(encoding="utf-8")


def sur(texte):
    """Rend des données JSON sûres dans un élément <script>."""
    return texte.replace("</", "<\\/")


def sur_script(texte):
    """Rend un script sûr dans un élément <script> : seule la séquence </script est neutralisée."""
    return re.sub(r"</(script)", r"<\\/\1", texte, flags=re.I)


def data_uri(chemin, type_defaut):
    type_ = mimetypes.guess_type(chemin)[0] or type_defaut
    return f"data:{type_};base64," + base64.b64encode((RACINE / chemin).read_bytes()).decode("ascii")


def main():
    args = sys.argv[1:]
    if "--trois" in args:
        args.remove("--trois")
        sortie = Path(args[0]) if args else RACINE / "simulation-trois-ecrans.html"
        maquette = assembler("16x9")
        # la page 16:9 en chaîne JavaScript : « < » échappé, pour qu'aucune balise ne ferme l'élément <script>
        chaine = json.dumps(maquette, ensure_ascii=False).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        page = lire("trois-ecrans.html")
        i = page.index("<script>")
        page = page[:i] + "<script>window.MUR_MAQUETTE = " + chaine + ";</script>\n" + page[i:]
        page = page.replace("<title>", "<title>[autonome] ", 1)
        sortie.write_text(page, encoding="utf-8")
        print(f"{sortie} : {sortie.stat().st_size / 1e6:.1f} Mo")
        return
    ecran = None
    if "--ecran" in args:
        i = args.index("--ecran")
        ecran = args[i + 1] if i + 1 < len(args) else None
        if ecran != "16x9":
            sys.exit("--ecran : seule la valeur 16x9 est prévue")
        del args[i:i + 2]
    sortie = Path(args[0]) if args else RACINE / ("maquette-16x9.html" if ecran else "maquette-16x3.html")
    page = assembler(ecran)
    sortie.write_text(page, encoding="utf-8")
    print(f"{sortie} : {sortie.stat().st_size / 1e6:.1f} Mo")


def assembler(ecran):
    """Page autonome (texte HTML) : 16:3, ou 16:9 avec ecran="16x9"."""
    page = lire("index.html")

    integre = {}
    scenarios = json.loads(lire("donnees/scenarios.json"))
    integre["donnees/scenarios.json"] = scenarios
    objets = json.loads(lire("donnees/objets.json"))
    integre["donnees/objets.json"] = objets
    # objets conservés dans le dépôt du site : modèle 3D et vignette
    for o in objets:
        for cle, defaut in (("modele3d", "model/gltf-binary"), ("vignette", "image/jpeg"), ("image", "image/jpeg")):
            if o.get(cle) and (RACINE / o[cle]).is_file():
                integre[o[cle]] = data_uri(o[cle], defaut)
    medias = []
    # vidéo d'ouverture, avant l'accueil (« ouverture », depuis le soir du 12 novembre 2026; auparavant, la vidéo
    # d'introduction de l'accueil, « video_introduction »)
    intro = scenarios.get("ouverture") or scenarios.get("video_introduction") or {}
    medias += [intro.get("video")]
    textes = [intro.get("sous_titres")]
    for sc in scenarios.get("scenarios", []):
        if sc.get("fichier"):
            s = json.loads(lire(sc["fichier"]))
            integre[sc["fichier"]] = s
            medias.append(s.get("video"))
            textes += [s.get("sous_titres"), s.get("horodatage")]
    # images des cartes de scénario, quand ce sont des fichiers du dépôt (et non des liens permanents)
    for sc in scenarios.get("scenarios", []):
        img = sc.get("image")
        if img and (RACINE / img).is_file():
            type_ = mimetypes.guess_type(img)[0] or "image/jpeg"
            integre[img] = f"data:{type_};base64," + base64.b64encode((RACINE / img).read_bytes()).decode("ascii")
    for t in filter(None, textes):
        integre[t] = lire(t)
    for m in filter(None, medias):
        if m.startswith(("http://", "https://")):   # vidéo en ligne (YouTube) : lue par le réseau, non intégrée
            continue
        if not (RACINE / m).is_file():
            print(f"avertissement : {m} absent, non intégré", file=sys.stderr)
            continue
        type_ = mimetypes.guess_type(m)[0] or "video/mp4"
        integre[m] = f"data:{type_};base64," + base64.b64encode((RACINE / m).read_bytes()).decode("ascii")

    # feuilles de style (Leaflet, puis celle du mur)
    page, n = re.subn(r'<link rel="stylesheet" href="([^"]+)">',
                      lambda m: "<style>\n" + lire(m.group(1)) + "\n</style>", page)
    assert n >= 1, "feuille de style introuvable dans index.html"

    # scripts, précédés des fichiers intégrés
    scripts = re.findall(r'<script src="([^"]+)"></script>', page)
    assert scripts, "scripts introuvables dans index.html"
    bloc = "<script>window.MUR_INTEGRE = " + sur(json.dumps(integre, ensure_ascii=False)) + ";"
    if ecran:
        bloc += " window.MUR_ECRAN = " + json.dumps(ecran) + ";"
    bloc += "</script>\n"
    for s in scripts:
        bloc += "<script>/* " + s + " */\n" + sur_script(lire(s)) + "\n</script>\n"
    debut = page.index('<script src="' + scripts[0] + '">')
    fin = page.index("</script>", page.index('<script src="' + scripts[-1] + '">')) + len("</script>")
    page = page[:debut] + bloc + page[fin:]
    page = page.replace("<title>", "<title>[autonome" + (", 16:9" if ecran else "") + "] ", 1)
    return page


if __name__ == "__main__":
    main()
