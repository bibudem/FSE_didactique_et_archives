# Mur de visualisation : Didactique et archives patrimoniales

Page web statique qui présente des objets des collections patrimoniales de l'Université de Montréal sur le mur de visualisation du laboratoire : 27 écrans de 1 280 × 720 px, en 9 colonnes et 3 rangées, soit 11 520 × 2 160 px. La page s'affiche aussi sur un écran 16:9.

Projet de la Faculté des sciences de l'éducation, en collaboration avec les Bibliothèques de l'Université de Montréal. Maquette fonctionnelle : les scénarios et leurs contenus sont donnés à titre indicatif.

## Fonctionnement

Une personne choisit un scénario, puis construit un parcours en touchant des images. Chaque image porte de un à trois éléments; chaque élément mène à une autre image liée par le geste, l'objet, le lieu ou l'usage.

| Zone | Écrans | Contenu |
| --- | --- | --- |
| Parcours | Colonnes 1 à 6, rangées 1 et 2 | Pile de cartes du parcours; titre et question du scénario |
| Notice | Colonnes 7 à 9, rangées 1 et 2 | Image et description de l'objet, lues dans son manifeste IIIF |
| Bas | Colonnes 1 à 9, rangée 3 | Vidéo ou entrée du scénario, ligne du temps des choix, tableau blanc |

| État | Déclencheur | Effet |
| --- | --- | --- |
| Ouverture | Ouverture de la page | Vidéo d'ouverture, puis le thème |
| Accueil | Fin de la vidéo, ou « Accueil » | Les trois scénarios |
| Scénario | Toucher un scénario | Vidéo ou entrée du scénario, puis la pile de cartes |
| Tableau blanc | « Tableau blanc » | Salle Excalidraw, dans une fenêtre à part |
| Plein écran | Icône de plein écran | Image, modèle 3D ou vidéo au premier plan, avec zoom |

Principes du parcours :

- toucher une image ouvre sa notice et affiche ses éléments; toucher un élément pose l'image liée sur la pile;
- une image ne revient jamais deux fois dans le même fil;
- les flèches de la pile ramènent aux cartes précédentes; un nouveau choix remplace les cartes qui suivaient;
- la ligne du temps montre le fil des choix et les chemins possibles.

## Utilisation

| Contexte | Ouverture |
| --- | --- |
| Mur | Page hébergée, dans le navigateur du poste maître, en plein écran |
| Écran 16:9 | Même adresse, avec `?ecran=16x9` |
| Sans hébergement | `python3 -m http.server` à la racine, puis `http://localhost:8000` |
| Sans serveur | `maquette-16x3.html` (mur) ou `maquette-16x9.html` (16:9), ouverts d'un double-clic |

Paramètres d'adresse :

| Paramètre | Effet |
| --- | --- |
| `?ecran=16x9` | Disposition pour un écran 16:9 (1 920 × 1 080 px) |
| `?texte=44` | Taille de base du texte, en pixels (44 au mur, 16 en 16:9 par défaut) |
| `?echelle=0.5` | Échelle fixe, avec défilement |
| `?grille=1` | Jonctions des écrans du mur |
| `?eviter=3-4` | Aucun contenu important sur les colonnes 3 et 4, rangées 1 et 2 |
| `?scenario=2` | Ouverture directe du scénario 1, 2 ou 3 |
| `?ouverture=0` | Ouverture sans la vidéo d'ouverture |
| `?parcours=1` | Enregistrement du parcours de l'appareil |
| `?equipe=2` | Nom de l'équipe ou de l'appareil, inscrit dans le parcours |
| `?notices=1` | Vérification de toutes les notices |
| `?edition=1` | Mode édition des parcours |
| `#salle=<identifiant>,<clé>` | Salle Excalidraw de la classe |

### Trois appareils

Chaque équipe ouvre son scénario sur son propre appareil, par exemple `maquette-16x9.html?scenario=1&parcours=1&equipe=1`; les trois écrans s'affichent côte à côte au mur. `trois-ecrans.html` et `simulation-trois-ecrans.html` simulent cette disposition dans un seul navigateur.

### Parcours enregistré

Avec `?parcours=1`, la page note chaque geste et son heure dans le navigateur de l'appareil (`localStorage`). « Parcours », dans le menu du coin, le télécharge en CSV, pour l'enseignant, ou en JSON, pour l'analyse. Aucune donnée ne quitte l'appareil, et `?equipe=` ne prend qu'un nom d'équipe, jamais un nom de personne.

### Mode édition

`?edition=1` permet de bâtir les parcours sans modifier les fichiers à la main : ajout d'images des Collections spéciales, placement des éléments, vérification des chemins et exportation des fichiers de `donnees/`. Mode d'emploi : [`guides/mode-edition.md`](guides/mode-edition.md).

## Versions autonomes

`outils/assembler.py` produit des fichiers HTML uniques, qui s'ouvrent sans serveur. Les styles, les scripts, les données et les médias y sont intégrés; les images des Collections spéciales restent lues en ligne.

```bash
python3 outils/assembler.py                # maquette-16x3.html (mur)
python3 outils/assembler.py --ecran 16x9   # maquette-16x9.html
python3 outils/assembler.py --trois        # simulation-trois-ecrans.html
```

Produire de nouveau ces fichiers après tout changement du code ou des données.

## Données

| Fichier | Contenu |
| --- | --- |
| `donnees/objets.json` | Objets : identifiant (lien permanent), manifeste IIIF, titre court, thèmes, mots-clés, crédits |
| `donnees/scenarios.json` | Thème, vidéo d'ouverture et liste des trois scénarios |
| `donnees/scenario-N.json` | Parcours d'un scénario : image de départ, éléments de chaque image (`x`, `y`, `libelle`, `vers`), entrée, question |

Les notices sont lues dans les manifestes IIIF (API Présentation 2.x) des Collections spéciales. Les médias des scénarios ne font pas partie du répertoire GitHub.

## Structure

```
index.html                    page du mur
maquette-16x3.html            version autonome pour le mur
maquette-16x9.html            version autonome pour un écran 16:9
trois-ecrans.html             trois pages 16:9 côte à côte
simulation-trois-ecrans.html  la même simulation, autonome
css/mur.css                   grille des écrans, zones et états
js/                           états, pile de cartes, notices IIIF, vidéo, carte comparative, tableau blanc, édition, parcours
lib/                          OpenSeadragon, model-viewer, Leaflet et leurs licences
donnees/                      objets et scénarios
medias/                       pistes WebVTT de test
guides/                       guides d'utilisation
outils/                       assemblage des versions autonomes, gabarit du tableau blanc, conversion WebVTT
```

## Hébergement

Site statique, sans traitement côté serveur, hébergé par les Bibliothèques de l'Université de Montréal à partir de ce répertoire GitHub. La page lit aussi :

- les manifestes et les images IIIF des Collections spéciales (`collections-speciales.bib.umontreal.ca`, `cantaloupe.bib.umontreal.ca`);
- la salle Excalidraw (`excalidraw.com`);
- les tuiles d'OpenStreetMap, pour la carte comparative du scénario 2.

## Licence

Le code est sous licence MIT ([`LICENSE`](LICENSE)).

La licence ne s'applique pas aux contenus des collections (images, notices, manifestes), lus en ligne et soumis aux droits de leurs détenteurs, ni aux bibliothèques de `lib/`, qui conservent leur propre licence.

## Crédits

- OpenSeadragon 4.1.1, licence BSD à 3 clauses.
- model-viewer 4.4.0, licence Apache 2.0.
- Leaflet 1.9.4, licence BSD à 2 clauses.
- Tuiles de la carte comparative : © les contributeurs d'OpenStreetMap, données sous licence ODbL.
- Coordonnées des lieux : Base de données toponymiques du Canada, Ressources naturelles Canada.
- Thème et scénarios : proposition d'Alice Billoux (2026).
