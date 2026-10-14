# Qualité des cours d’eau — science007

Application statique pour explorer les analyses Naïades diffusées par Hub’Eau.

[Application en ligne](https://philippejacquet0-source.github.io/science007/) · [Dépôt GitHub](https://github.com/philippejacquet0-source/science007)

## Ouvrir la page

Ouvrir **dist/index.html** dans un navigateur, ou double-cliquer sur **start-local.cmd** pour utiliser le serveur local (habituellement http://127.0.0.1:4173/). Conserver tout le dossier dist : bibliothèques, styles et données sont fournis avec la page.

Le démarrage utilise des scripts classiques et un instantané de données JavaScript. Il ne nécessite ni modules ES chargés par le navigateur ni fetch de fichiers locaux, qui étaient bloqués avec file://. Les stations, contours départementaux, analyses de l’exemple et tracé de la Crusnes sont disponibles localement. Internet est nécessaire pour le fond IGN, les autres tracés et les nouvelles analyses Hub’Eau.

Le fond **IGN — Plan IGN** est utilisé par défaut, y compris en ouverture directe. OpenStreetMap exige un référent HTTP et peut bloquer les requêtes provenant de file:// ; il reste disponible depuis le menu sur les pages HTTP/HTTPS. Les contours locaux fonctionnent sans tuiles et prennent le relais si le fond ne répond pas. Aucun téléchargement préalable ni proxy de tuiles n’est utilisé.

## Utilisation

- Rechercher une station par cours d’eau, commune ou nom ; filtrer par bassin et territoire.
- La carte ne montre par défaut que les stations avec au moins une analyse pour les paramètres cochés. L’index récent couvre 2021–14 octobre 2026. Pour une période hors de cet intervalle, l’index historique est utilisé. L’option de vérification de la période exacte auprès de Hub’Eau affine ce filtre.
- La molette zoome ou dézoome sur la carte. Cliquer sur une station ; Maj + clic ajoute ou retire une station. **Maj + glisser** ajoute toutes les stations d’un rectangle. Le bouton **Rectangle** permet la même sélection sans clavier, notamment sur écran tactile.
- Un clic sur une station préidentifie son cours d’eau et active **Sélectionner ce cours d’eau**, sans filtrer immédiatement les autres points. Ce bouton sélectionne ensuite toutes ses stations ayant les analyses choisies et centre la carte. Une recherche dédiée reste disponible. Le regroupement repose sur l’identifiant officiel : les homonymes restent distincts.
- Les stations du même cours d’eau partagent une couleur. Les traits pleins sont des géométries officielles Sandre, BD CARTHAGE 2017. Lorsque le tracé est absent ou indisponible, des pointillés relient les stations de façon **schématique**, sans représenter le lit du cours d’eau ni le sens du courant.
- **Voir un paramètre à une date** colore les points selon la valeur du prélèvement le plus proche de la date, dans un écart choisi (date exacte, ±7/15/30/90 jours). Le tableau et les infobulles donnent la date réellement mesurée. Aucun résultat n’est interpolé. Les unités et fractions distinctes restent séparées.
- Les grandes sélections sont conservées entièrement sur la carte. Les courbes et leurs analyses se chargent par groupes de **12 stations**, avec boutons Précédentes/Suivantes, pour garder des graphiques lisibles. L’export CSV porte sur toutes les analyses chargées pour le groupe affiché.
- Les stations, paramètres, période, cours d’eau ciblé et vue par date sont conservés dans le lien de la page.

## Paramètres et interprétation

20 paramètres : température, pH, conductivité, matières en suspension, turbidité, oxygène dissous, saturation en oxygène, nitrates, nitrites, ammonium, orthophosphates, phosphore total, azote Kjeldahl, azote global, carbone total, carbone organique, DBO5, DCO, chlorures et sulfates.

Le **carbone total (1317)** inclut le carbone organique et minéral. Le **carbone organique (1841)** correspond au COT sur eau brute et au COD sur fraction filtrée ; ces fractions ne sont pas mélangées. Le carbone total est peu renseigné dans cette source : 54 stations historiques, dont 5 depuis 2021 ; le carbone organique est enregistré sur 12 414 stations depuis 2021. Les deux restent accessibles. Les présélections Usuels, Nutriments et Carbone/O₂ permettent de choisir rapidement un ensemble cohérent.

Les données demandées portent sur le support **Eau (3)** et la qualification déclarée **Correcte (1)**. Hub’Eau facilite l’accès aux données Naïades et ne produit pas des mesures de meilleure qualité.

Les courbes relient les résultats quantifiés. Les valeurs sous ou au-dessus d’un seuil analytique sont conservées comme limites et représentées par des triangles ; elles ne deviennent pas des concentrations exactes. Dans la vue par date, les valeurs sous/au-dessus d’un seuil restent grises. Une mesure manquante ne vaut pas zéro. La couleur représente le cours d’eau ou l’intensité d’une valeur mesurée ; elle ne constitue pas une note écologique ni un seuil de potabilité.

## Données statiques et performances

Le catalogue contient **25 613 stations géolocalisées**, y compris des stations anciennes et des plans d’eau. Les index complets de disponibilité couvrent **23 485 stations historiques** et **14 204 depuis 2021**, dont **13 048 de cours d’eau** sur les 20 paramètres. Le nombre effectivement visible dépend des paramètres et filtres choisis.

Les coordonnées, libellés et identifiants de cours d’eau sont conservés dans un catalogue compact et vérifiés contre la source. Les masques par paramètre sont compactés en bits dans le bootstrap. La page dessine les points dans un seul canvas avec index spatial : elle ne crée pas un objet Leaflet par station. Le serveur local fournit gzip et ETag. Les API d’analyses et de géométrie ne bloquent pas le démarrage de la carte.

L’exemple local comporte 867 analyses réelles pour deux stations de la Crusnes (Ville-au-Montois et Longuyon), avec prélèvements du 25 janvier 2021 au 19 novembre 2024 et onze paramètres. Les nouveaux paramètres restent interrogeables via l’API. Le tracé local officiel de la Crusnes conserve ses 640 sommets.

Les réponses sont contrôlées contre les comptes exacts Hub’Eau. Les parcours opposés ascendant/descendant collectent les catalogues de plus de 20 000 stations sans dépasser la profondeur autorisée. Les analyses sont découpées par période et par lots de stations, sans troncature silencieuse. Les appels de géométrie Sandre se limitent à deux en parallèle ; leur réponse GML est lue en ignorant les emprises géographiques du document.

## Actualiser et reconstruire

Node.js suffit ; aucune installation de dépendances n’est requise.

Le workflow `.github/workflows/pages.yml` vérifie les données et le code puis publie `dist/` sur GitHub Pages à chaque push sur `main`. Le build utilise les instantanés présents dans le dépôt, sans recopier les données depuis une API lors du déploiement.

```text
node scripts/sync-data.mjs --only=stations
node scripts/sync-data.mjs --only=examples
node scripts/collect-coverage.mjs --with-recent
node scripts/collect-coverage.mjs --recent-only
node scripts/collect-coverage.mjs --rivers-only
node scripts/prepare-data.mjs
```

prepare-data.mjs régénère le catalogue compact, app.bundle.js et data/bootstrap.js avec leurs versions gzip. Après une modification de app.js, core.mjs, river.mjs ou station-layer.mjs, exécuter cette préparation, puis recharger la page. Les fichiers .mjs servent au développement et aux tests ; ils ne sont plus chargés directement par index.html.

```text
node --test tests/*.test.mjs
node --check dist/app.bundle.js
node scripts/check-static.mjs
```

Les tests portent sur la conservation du catalogue, la recherche, la projection et les clics, les unités/fractions et seuils, le découpage des périodes, la déduplication, les homonymes, les liaisons schématiques et le choix d’un prélèvement réel autour d’une date.

La sélection par rectangle, la recherche et sélection d’un cours d’eau, la vue par date et les appels réels à Hub’Eau ont été vérifiés dans le navigateur intégré via HTTP. Le clic sur une station de l’Indre préidentifie son cours d’eau sans réduire la carte ; le bouton sélectionne ensuite ses dix stations. Le zoom à la molette et les tuiles IGN sont vérifiés. Les 15 tests passent. Cet outil interdit les URL file:// ; l’ouverture directe du fichier n’a donc pas pu être testée visuellement avec lui. La structure des ressources locales et la syntaxe du bundle sont vérifiées. Le téléchargement CSV doit encore être confirmé dans le navigateur habituel ; son déclenchement et les données préparées sont vérifiés.

## Sources

- [Hub’Eau — qualité des cours d’eau](https://hubeau.eaufrance.fr/page/api-qualite-cours-deau)
- [Swagger officiel v2](https://hubeau.eaufrance.fr/api/v2/qualite_rivieres/api-docs)
- [Naïades — organisation des données](https://naiades.eaufrance.fr/propos-des-donnees)
- [Référentiel Sandre — carbone total](https://api.sandre.eaufrance.fr/referentiels/v1/par/1317.json)
- [Référentiel Sandre — carbone organique](https://api.sandre.eaufrance.fr/referentiels/v1/par/1841.json)
- [Service géographique Sandre](https://services.sandre.eaufrance.fr/geo/eth?service=WFS&request=GetCapabilities)
- [Contours Etalab](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2026/geojson/)
- [IGN — service WMTS](https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/diffusion/wmts/)
- [Politique des tuiles OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)
- [Leaflet](https://leafletjs.com/), [Chart.js](https://www.chartjs.org/), [OpenStreetMap](https://www.openstreetmap.org/copyright)

Cadrage-eau-potable.md et echantillons-hubeau.json sont conservés comme archives de la recherche antérieure ; ils ne sont pas utilisés par l’application.
