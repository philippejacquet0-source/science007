# Eau potable en clair — propositions pour science007

Recherche du 13 octobre 2026. Le dépôt `science007` reste une possibilité à créer ultérieurement ; aucun dépôt distant n'est configuré ici.

## Proposition privilégiée

Une page statique qui permet de chercher sa commune, de sélectionner son réseau d'eau, puis de comprendre les analyses officielles. Une carte de France sert de porte d'entrée et permet d'explorer un paramètre précis. Prévoir aussi un accès aux territoires d'outre-mer et une navigation par liste.

Le cœur du produit serait une fiche locale : conclusion sanitaire officielle datée, dernières mesures disponibles, explications courtes, historique et lien vers le bulletin officiel. Il s'agit d'une proposition de conception, pas encore d'une application réalisée.

## Sources repérées

| Source | Contenu et intérêt pour le projet |
| --- | --- |
| [Ministère de la Santé : qualité de l'eau potable](https://sante.gouv.fr/sante-et-environnement/eaux/article/qualite-de-l-eau-potable) | Accès aux résultats du contrôle sanitaire effectué par les ARS, aux synthèses annuelles et aux explications institutionnelles. |
| [SISE-Eaux : eau distribuée commune par commune, jeu DIS](https://www.data.gouv.fr/datasets/resultats-du-controle-sanitaire-de-leau-distribuee-commune-par-commune) | Source nationale prioritaire, sous Licence Ouverte 2.0. Historique annoncé depuis 2016, actualisation mensuelle à m+1. Tables de prélèvements, d'analyses et de correspondance communes/réseaux. La couverture effective doit être vérifiée par territoire et période. |
| [Hub'Eau : API qualité de l'eau potable](https://www.data.gouv.fr/dataservices/hubeau-qualite-de-leau-potable) | Accès au jeu DIS par requêtes ciblées. Deux opérations utiles : `communes_udi` et `resultats_dis`. Évite de télécharger les archives nationales dans le navigateur. |
| [SISE-Eaux : toutes les installations](https://www.data.gouv.fr/datasets/resultats-du-controle-sanitaire-de-leau-du-robinet) | Captages, traitement et distribution. Utile pour étudier la chaîne de production ; demande de distinguer l'eau brute de l'eau distribuée et la représentativité des prélèvements. |
| [Agrégation proposée par data.gouv.fr](https://www.data.gouv.fr/datasets/agregation-des-resultats-du-controle-sanitaire-de-leau-distribuee) | Fichiers regroupés à partir du jeu source. Option pour préparer des synthèses nationales hors du navigateur. Le regroupement ne constitue pas à lui seul un indicateur de qualité. |
| [API géographique : communes](https://geo.api.gouv.fr/decoupage-administratif/communes) et [contours Etalab 2026](https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2026/geojson/) | Recherche par nom ou code postal, codes INSEE et géométries. Contours simplifiés pour limiter le poids de la carte. |

## Vérification concrète de Hub'Eau

Deux petites requêtes publiques ont été exécutées et leurs réponses conservées dans `echantillons-hubeau.json`.

- Résultats des nitrates à Rennes en 2026 : réponse HTTP 206, trois lignes renvoyées sur 31 annoncées, avec pagination. Le statut 206 correspond ici à une réponse partielle ; il ne faut pas le traiter comme une erreur.
- Correspondance Rennes/réseau pour 2026 : réponse HTTP 200, un réseau dans cette réponse.
- Les deux réponses portent `Access-Control-Allow-Origin: *`, compatible avec une consultation depuis une page statique. Le fonctionnement complet sera à vérifier lors du prototype.
- Champs observés : date du prélèvement, valeur numérique, résultat textuel, unité, limite de qualité, références de qualité, réseau, distributeur, conformité et conclusion sanitaire.

Exemple observé : **24,8 mg/L de nitrates, prélevés le 27 juillet 2026**, pour le réseau `035004230` associé à Rennes ; limite indiquée : **50 mg/L**. L'affichage pourrait expliquer : « Cette mesure de nitrates est sous la limite réglementaire. » Cette phrase porte uniquement sur ce paramètre et ce prélèvement. La conclusion de l'ARS de ce même prélèvement mentionne également une observation microbiologique : elle doit rester visible.

[Requête publique de l'exemple](https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis?code_commune=35238&code_parametre=1340&date_min_prelevement=2026-01-01&size=3).

## Trois directions possibles

| Concept | Parcours | Place dans le projet |
| --- | --- | --- |
| **Mon eau en clair** | Commune → réseau → conclusion datée → cartes des paramètres → historique. | Meilleur point de départ pour rendre les analyses compréhensibles. |
| **L'atlas de l'eau potable** | Carte → choix d'un paramètre et d'une période → mesure locale ou synthèse → fiche du réseau. | Complément visuel, avec des données nationales préparées à l'avance. |
| **Lire une analyse d'eau** | Un résultat officiel → explication de l'unité, de la limite et de la signification du paramètre. | Module pédagogique intégré à la fiche. |

Pour la première version, combiner la fiche locale et le module pédagogique, puis proposer une carte nationale des nitrates. Ajouter les autres couches après avoir examiné leur couverture.

## Rendre les données compréhensibles

Proposer deux niveaux : une phrase et une jauge lisibles immédiatement, puis les détails au clic. Pour chaque paramètre : valeur, unité, date, explication, limite applicable lorsqu'elle existe et source. Les thèmes possibles sont les bactéries, les nitrates, les pesticides, les PFAS, puis les caractéristiques comme le pH et la dureté. Chaque thème ne s'affiche que selon les données disponibles.

Règles de conception proposées :

1. Choisir le réseau lorsque plusieurs réseaux alimentent une commune ; ne pas attribuer une mesure à toutes les adresses sans justification.
2. Distinguer « mesuré », « sous la limite de quantification », « aucune mesure disponible » et « donnée ancienne ». Une absence de donnée ne vaut pas une concentration nulle.
3. Conserver les résultats textuels comme `< 0,005`, les unités et les différences entre limites réglementaires et références de qualité.
4. Dater chaque mesure et la conclusion officielle séparément. Les dernières valeurs de plusieurs paramètres peuvent provenir de prélèvements différents.
5. Présenter les observations et consignes de l'ARS avec leur contexte ; ne pas déduire une autorisation actuelle de boire l'eau à partir d'un historique mensuel.
6. Utiliser des couleurs par paramètre, avec une légende et un état sans donnée. Éviter une note globale sur 100 qui masquerait les différences entre mesures.
7. Définir clairement toute statistique : période, réseau, nombre de prélèvements et dénominateur. Dédupliquer les analyses associées à plusieurs communes avant les agrégations nationales.

Pour les PFAS, le suivi obligatoire de la somme de 20 substances commence en janvier 2026 : les comparaisons historiques devront tenir compte de ce changement de couverture. [Source : ministère de la Santé](https://sante.gouv.fr/sante-et-environnement/eaux/les-pfas/article/les-pfas-et-l-eau-destinee-a-la-consommation-humaine).

## Outils et architecture proposés

- **HTML, CSS, JavaScript** : une page statique, sans compte utilisateur ni serveur applicatif.
- **[Leaflet](https://leafletjs.com/examples/geojson/)** : carte, zoom, sélection des communes et couches GeoJSON.
- **[Chart.js](https://www.chartjs.org/docs/latest/)** : courbes d'évolution, avec une alternative textuelle ou tabulaire.
- **Hub'Eau et API géographique** : charger les détails de la commune choisie, avec pagination et gestion des indisponibilités.
- **JSON préparés à l'avance** : fournir une couche nationale légère ; ne pas appeler Hub'Eau séparément pour chaque commune au chargement de la carte.
- **[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)** : hébergement statique possible pour `science007`.
- **Script Python facultatif** : préparer les synthèses cartographiques. Une mise à jour via GitHub Actions pourrait ensuite être ajoutée, sans transformer la page en application avec serveur.

Deux modes sont possibles : consultation des détails à la demande par API, ou publication d'un instantané entièrement local. Je privilégie une combinaison : carte sur un instantané daté et détail local via l'API. Montrer les dates des deux sources.

## Extension européenne

La Commission européenne publie des rapports de synthèse sur l'eau potable, notamment pour 2020–2022, et décrit le cadre de rapportage des États. [Source : mise en œuvre de la directive eau potable](https://green-forum.ec.europa.eu/implementation-drinking-water-directive_en).

Ces pistes conviennent à un futur module de comparaison entre pays. Je n'ai pas identifié, dans cette recherche, une API européenne offrant le même accès local que Hub'Eau. Les bases Waterbase courantes concernent notamment les rivières, lacs et nappes : elles ne permettent pas de qualifier directement l'eau du robinet. [Description officielle de Waterbase](https://www.eea.europa.eu/en/datahub/datahubitem-view/208518d1-ffe3-4981-9cae-13264cd9c32c).

## Prochaine étape proposée

Une maquette avec carte de France, recherche de commune, choix du réseau et fiche pédagogique, puis une première intégration Hub'Eau. Tester plusieurs situations réelles : plusieurs réseaux, absence de mesure d'un paramètre, résultat sous la limite de quantification, conclusion avec observation et données anciennes. Créer et publier `science007` après le choix du périmètre.
