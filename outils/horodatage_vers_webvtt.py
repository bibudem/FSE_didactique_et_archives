#!/usr/bin/env python3
"""Convertit le gabarit Excel d'horodatage en fichiers WebVTT (un par vidéo).

Projet : Mur de visualisation — Didactique et archives patrimoniales (FSÉ).

Usage :
    python3 horodatage_vers_webvtt.py "Mur de visualisation — fichier d'horodatage.xlsx" [dossier_de_sortie]

Entrée : la feuille « Horodatage » du gabarit. Seules les colonnes A à D sont lues :
    A  Vidéo                     nom du fichier vidéo, sans extension (ex. : scenario-1)
    B  Début                     hh:mm:ss, mm:ss ou hh:mm:ss.mmm
    C  Fin                       même format; facultative (voir plus bas)
    D  Identifiant de l'objet    identifiant (handle) de l'objet dans l'EDSR
Les autres colonnes (titre, passage entendu, remarque) servent de repères et ne sont pas exportées.
Les lignes dont la colonne H (« Exemple ») contient « oui » sont ignorées.

Sortie : un fichier <vidéo>.horodatage.vtt par vidéo, à charger dans la page avec
    <track kind="metadata" src="scenario-1.horodatage.vtt" srclang="fr">
Chaque repère contient une ligne JSON : {"objet": "<identifiant>"}.

Fin facultative : si la cellule est vide, la fin est le début du repère suivant de la même vidéo;
pour le dernier repère, la fin est le début plus 10 secondes.

Le script s'arrête sans rien écrire s'il trouve une erreur, et indique la ligne en cause.
Il n'utilise que Python 3 et openpyxl (pip install openpyxl).
"""
import datetime
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook

DUREE_PAR_DEFAUT = 10.0  # secondes, pour un dernier repère sans fin
FEUILLE = "Horodatage"
PREMIERE_LIGNE = 2       # la ligne 1 contient les en-têtes


def en_secondes(valeur, ligne, colonne):
    """Accepte une heure Excel, une fraction de jour ou un texte hh:mm:ss(.mmm) ou mm:ss(.mmm)."""
    if valeur is None or (isinstance(valeur, str) and not valeur.strip()):
        return None
    if isinstance(valeur, datetime.time):
        return valeur.hour * 3600 + valeur.minute * 60 + valeur.second + valeur.microsecond / 1e6
    if isinstance(valeur, datetime.timedelta):
        return valeur.total_seconds()
    if isinstance(valeur, (int, float)):          # fraction de jour (format heure d'Excel)
        return round(float(valeur) * 86400, 3)
    texte = str(valeur).strip().replace(",", ".")
    m = re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?", texte)
    if not m:
        raise ValueError(f"ligne {ligne}, colonne {colonne} : « {texte} » n'est pas un horodatage valide (hh:mm:ss ou mm:ss)")
    h, mi, s, ms = m.groups()
    if int(s) > 59 or (h is not None and int(mi) > 59):
        raise ValueError(f"ligne {ligne}, colonne {colonne} : « {texte} » contient plus de 59 minutes ou secondes")
    return int(h or 0) * 3600 + int(mi) * 60 + int(s) + int((ms or "0").ljust(3, "0")) / 1000


def horodatage(sec):
    """Format WebVTT : hh:mm:ss.ttt"""
    ms = round(sec * 1000)
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def lire(chemin):
    ws = load_workbook(chemin, data_only=True)[FEUILLE]
    reperes, erreurs = defaultdict(list), []
    for n, row in enumerate(ws.iter_rows(min_row=PREMIERE_LIGNE, max_col=8, values_only=True), start=PREMIERE_LIGNE):
        video, debut, fin, objet = row[0], row[1], row[2], row[3]
        exemple = str(row[7] or "").strip().lower() == "oui"
        if exemple or all(v in (None, "") for v in (video, debut, fin, objet)):
            continue
        try:
            video = str(video or "").strip()
            objet = str(objet or "").strip()
            if not video:
                raise ValueError(f"ligne {n} : la vidéo est vide")
            if not re.fullmatch(r"[A-Za-z0-9._-]+", video):
                raise ValueError(f"ligne {n} : « {video} » : nom de vidéo à écrire sans espace ni accent (lettres, chiffres, - _ .)")
            if not objet:
                raise ValueError(f"ligne {n} : l'identifiant de l'objet est vide")
            d = en_secondes(debut, n, "B")
            if d is None:
                raise ValueError(f"ligne {n} : le début est vide")
            f = en_secondes(fin, n, "C")
            if f is not None and f <= d:
                raise ValueError(f"ligne {n} : la fin ({horodatage(f)}) doit suivre le début ({horodatage(d)})")
            reperes[video].append({"ligne": n, "debut": d, "fin": f, "objet": objet})
        except ValueError as e:
            erreurs.append(str(e))
    return reperes, erreurs


def ecrire(reperes, dossier):
    dossier.mkdir(parents=True, exist_ok=True)
    fichiers = []
    for video, liste in sorted(reperes.items()):
        liste.sort(key=lambda r: r["debut"])     # WebVTT : repères en ordre de début
        lignes = ["WEBVTT", "", f"NOTE Fichier d'horodatage de la vidéo « {video} ». Produit par horodatage_vers_webvtt.py; ne pas modifier à la main.", ""]
        for i, r in enumerate(liste):
            fin = r["fin"]
            if fin is None:
                fin = liste[i + 1]["debut"] if i + 1 < len(liste) else r["debut"] + DUREE_PAR_DEFAUT
                if fin <= r["debut"]:
                    fin = r["debut"] + DUREE_PAR_DEFAUT
            lignes += [f"objet-{i + 1}",
                       f"{horodatage(r['debut'])} --> {horodatage(fin)}",
                       json.dumps({"objet": r["objet"]}, ensure_ascii=False),
                       ""]
        chemin = dossier / f"{video}.horodatage.vtt"
        chemin.write_text("\n".join(lignes), encoding="utf-8")
        fichiers.append((chemin, len(liste)))
    return fichiers


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    source = Path(sys.argv[1])
    dossier = Path(sys.argv[2]) if len(sys.argv) > 2 else source.parent
    reperes, erreurs = lire(source)
    if erreurs:
        print("Aucun fichier écrit. À corriger dans la feuille « Horodatage » :")
        for e in erreurs:
            print("  -", e)
        sys.exit(2)
    if not reperes:
        print("Aucun repère à exporter (les lignes d'exemple sont ignorées).")
        sys.exit(0)
    for chemin, n in ecrire(reperes, dossier):
        print(f"{chemin} : {n} repère(s)")


if __name__ == "__main__":
    main()
