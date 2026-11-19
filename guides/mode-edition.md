# Mode édition

Le mode édition sert à bâtir les parcours des scénarios de la maquette sans modifier les fichiers de données à la main.

## Démarrage

Un paramètre ajouté à l'adresse de la page ouvre le mode édition. La disposition dépend de l'écran :

- Sur un ordinateur, ajouter `?edition=1` à la fin de l'adresse de `maquette-16x9.html`, dans la barre d'adresse du navigateur. Le panneau d'édition apparaît à droite de la page, à sa taille réelle. La maquette occupe le reste de la fenêtre.
- Sur un ordinateur, avec une page servie par un serveur web, ouvrir `index.html?ecran=16x9&edition=1`.
- Au mur, ajouter `?edition=1` à la fin de l'adresse de `maquette-16x3.html` ou de `index.html`. Le panneau d'édition occupe la zone des notices, sur trois colonnes.

## Panneau d'édition

Le haut du panneau d'édition a deux commandes : **Annuler** et **Tester le parcours**. Le panneau a ensuite six sections :

- « Carte du dessus » : titre court et crédits de la carte du dessus de la pile;
- « Éléments » : points de la carte du dessus, chacun lié à une autre image;
- « Points du modèle 3D » : points du modèle, chacun lié à une image, pour un scénario qui commence par un modèle 3D (les points de la carte comparative du scénario 2 se modifient dans `donnees/scenario-2.json`, sous `points_carte`);
- « Images du scénario » : images du parcours, image de départ et ajout d'images;
- « Vérification » : problèmes du parcours et longueur du fil le plus court;
- « Exporter » : téléchargement des fichiers de données.

## Fonctionnement

### Scénario

À l'accueil, cliquer sur la carte d'un scénario pour afficher son parcours dans le panneau d'édition. En mode édition, la page s'ouvre sur l'accueil, sans la vidéo d'ouverture, et la vidéo conserve sa taille à l'ouverture du scénario. La pile reste visible.

### Images du scénario

La section « Images du scénario » présente les images du parcours avec leur vignette.

- Cliquer sur **Poser** pour mettre une image sur la pile et placer ses éléments.
- Cliquer sur **Retirer** pour retirer une image du scénario. Les éléments qui mènent à cette image sont aussi retirés.
- Choisir la première carte du parcours dans la liste **Départ**. Pour un scénario qui commence par un modèle 3D, choisir **— aucun : les points du modèle —**.
- Choisir une image dans la liste **Maquette** pour l'ajouter au scénario. Cette liste présente les images de la maquette absentes du scénario.

### Ajout d'une image des Collections spéciales

Une image des Collections spéciales est ajoutée par l'adresse de sa page.

1. Ouvrir l'objet dans le site des Collections spéciales, ou ouvrir son permalien dans le navigateur.
2. Copier l'adresse de la page affichée dans la barre d'adresse. Cette adresse a la forme `https://collections-speciales.bib.umontreal.ca/items/<uuid>`.
3. Coller l'adresse dans le champ **Collections spéciales**, sous la liste des images.
4. Cliquer sur **Ajouter**, ou appuyer sur <kbd>Entrée</kbd>, pour lire la notice de l'objet. L'image apparaît dans la liste des images, avec son titre, son titre court, ses thèmes, ses mots-clés et ses crédits.
5. Cliquer sur **Poser**, puis vérifier le titre court et les crédits dans la section « Carte du dessus ». Le titre court proposé est le titre complet, coupé à 60 caractères.

### Carte du dessus

La section « Carte du dessus » présente le titre complet de la carte du dessus de la pile, puis trois champs :

- **Titre court** : titre de la carte et de son intitulé dans la ligne du temps;
- **Crédit court** : citation courte, en filigrane sur l'image;
- **Crédit** : référence complète, affichée au toucher du filigrane.

### Éléments

Un élément est un point de l'image qui mène à une autre image du parcours. Une image a trois éléments au plus. En mode édition, les éléments de la carte du dessus restent affichés. Un point orange indique un élément sans image liée.

1. Cliquer sur l'image de la carte du dessus, à l'endroit voulu, pour ajouter un élément.
2. Inscrire le libellé de l'élément dans son champ, dans la section « Éléments ».
3. Choisir l'image où mène l'élément dans la liste **— image liée —**.
4. Glisser le point sur l'image pour déplacer l'élément.
5. Cliquer sur **Suivre** pour poser la carte liée sur la pile et continuer le parcours.
6. Cliquer sur **Retirer** pour retirer l'élément.

### Points du modèle 3D

Un scénario qui commence par un modèle 3D a des points sur le modèle. Chaque point mène à une image du parcours.

1. Cliquer sur **Ajouter un point**, dans la section « Points du modèle 3D ».
2. Cliquer sur le modèle, à l'endroit voulu. Un glissement fait tourner le modèle sans ajouter de point.
3. Inscrire le libellé du point dans son champ.
4. Choisir l'image du point dans la liste **— image liée —**.

### Vérification

La section « Vérification » signale :

- l'absence d'image de départ;
- les images qu'aucun chemin n'atteint;
- les éléments et les points sans image liée;
- les images sans élément vers une autre image, qui terminent le chemin;
- la longueur du fil le plus court, en nombre d'images, avec une alerte sous 6 images.

### Test du parcours

Le test du parcours présente la maquette telle qu'elle fonctionne au mur, à partir de l'image de départ. Les modifications restent conservées pendant le test.

1. Cliquer sur **Tester le parcours**, en haut du panneau d'édition.
2. Cliquer sur **Retour à l'édition** pour revenir au panneau d'édition.

### Exportation

L'exportation produit les fichiers de données du parcours. Ces fichiers remplacent ceux du dossier `donnees/`.

1. Cliquer sur le nom du fichier du scénario affiché, par exemple **scenario-1.json**, pour le télécharger.
2. Cliquer sur **objets.json** pour télécharger la liste des objets, avec les images ajoutées et les titres modifiés.
3. Cliquer sur **Tous les fichiers** pour télécharger les quatre fichiers. Le navigateur peut demander l'autorisation de télécharger plusieurs fichiers.
4. Transmettre les fichiers téléchargés à l'administrateur de la maquette, ou les déposer dans le dossier `donnees/`, à la place des fichiers existants.
5. Pour mettre à jour `maquette-16x3.html` et `maquette-16x9.html`, lancer `python3 outils/assembler.py`, puis `python3 outils/assembler.py --ecran 16x9`.

### Conservation des modifications

Le navigateur conserve les modifications. La prochaine ouverture du mode édition les reprend automatiquement. Aucun fichier n'est publié ni envoyé.

- Exporter les fichiers avant de changer de navigateur ou d'ordinateur, car les modifications ne quittent pas le navigateur utilisé.
- Cliquer sur **Annuler** pour défaire la dernière modification.
- Cliquer sur **Reprendre les modifications conservées** pour appliquer des modifications faites sur d'autres fichiers de données. Cette commande apparaît quand les fichiers de données ont changé depuis les modifications.
- Cliquer sur **Revenir aux fichiers de données**, puis sur **Confirmer : effacer les modifications conservées**, pour effacer les modifications conservées.

## Limites

- Une image a trois éléments au plus.
- Le permalien seul n'est pas accepté. L'adresse de la page de l'objet est nécessaire.
- Un objet des Collections spéciales sans image IIIF ne peut pas servir de carte.
- Sur un ordinateur, la disposition 16:3 réduit tout le mur à la largeur de la fenêtre. Dans une fenêtre de 1 440 px, le texte du panneau d'édition mesure environ 5 px. Le paramètre `?echelle=0.5&edition=1` agrandit la page de moitié, avec défilement, et le texte mesure alors environ 19 px.

## Fonctionnement technique

Le mode édition a les composantes suivantes :

- Le fichier `js/edition.js` contient le mode édition. Sans `?edition=1`, ce fichier ne modifie rien.
- Après le chargement des données (`Mur.etat.pret`), le mode édition modifie en mémoire la liste des objets (`Mur.etat.objets`) et les données du scénario affiché (`Mur.etat.donneesScenario`).
- `Mur.pile.edition()` met la pile en mode édition (`js/pile.js`). Les trois éléments de la carte du dessus restent affichés, même sans image liée. Hors du mode édition, la pile n'affiche ni les éléments sans image liée ni ceux qui mènent à une image déjà vue.
- En mode édition, un clic sur l'image ou sur un élément appelle le panneau d'édition, au lieu d'ouvrir la notice ou de suivre le lien.
- `Mur.pile.rafraichir()` redessine la pile avec les données modifiées, sans changer le fil des choix.
- `Mur.entree.points()` redessine les points du modèle 3D (`js/entree.js`). La position d'un nouveau point vient de `positionAndNormalFromPoint()` de model-viewer, avec une correction de l'échelle de la page.
- Les événements `mur:scenario` et `mur:carte` actualisent le panneau d'édition. `js/etat.js` émet `mur:scenario` à l'ouverture d'un scénario et au retour à l'accueil. `js/pile.js` émet `mur:carte` à chaque affichage de la pile.
- `Mur.etat.ouvrirScenario()` relance le scénario à partir de l'image de départ, pour le test du parcours.
- En 16:9, `js/etat.js` réserve à droite de la page la largeur du panneau d'édition : 30 % de la fenêtre, entre 340 et 480 px. La maquette est réduite dans le reste de la fenêtre.
- Au mur, le panneau d'édition occupe les colonnes 7 à 9 des rangées 1 et 2.
- En mode édition, `js/etat.js` n'agrandit pas la vidéo à l'ouverture d'un scénario.
- Les styles du mode édition sont à la fin de `css/mur.css`.
- Le stockage local du navigateur (`localStorage`) conserve les modifications sous la clé `mur-edition` : la liste des objets, puis `parcours`, `points` et `objets` pour chaque scénario.
- Une empreinte des données d'origine accompagne les modifications conservées. Quand les fichiers de données changent, l'empreinte diffère, et les modifications ne sont pas reprises automatiquement.
- La page conserve en mémoire les 50 états précédents pour **Annuler**. Ces états sont perdus au rechargement de la page.
- L'ajout d'une image lit le manifeste IIIF à l'adresse `https://collections-speciales.bib.umontreal.ca/server/iiif/<uuid>/manifest`. Les champs viennent de `Mur.iiif.champs()` (`js/iiif.js`).
- Le permalien de l'objet, sans `https://hdl.handle.net/`, devient son identifiant dans `objets.json`. À défaut de permalien, l'uuid sert d'identifiant.
- L'API du dépôt est la seule à relier un permalien à son uuid. Cette API refuse les demandes venant d'une autre adresse (CORS). Le serveur IIIF accepte ces demandes.
- L'exportation télécharge des fichiers JSON produits dans la page (`Blob`). L'exportation retire du fichier du scénario les sous-titres lus au chargement (`textes`).
- `outils/assembler.py` intègre `js/edition.js`, comme les autres scripts de `index.html`. Le mode édition fonctionne donc aussi dans `maquette-16x9.html` et `maquette-16x3.html`.
