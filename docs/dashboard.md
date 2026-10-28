# Tableau de bord et indicateurs filtrés

Le tableau de bord utilise les données du magasin déjà accessibles à ses membres.
Il ne nécessite aucune nouvelle table ni migration SQL. Le client charge les
faits utiles des appareils actifs (référence parente, disponibilité et garantie)
pour calculer les indicateurs ; les droits stock_devices existants restent actifs.
Un échec de lecture ne se transforme pas silencieusement en garanties à zéro.

## Périmètre

Catégorie, mode de suivi, service d'affectation, recherche et case Stocks à
surveiller s'appliquent ensemble à l'inventaire, aux six KPI, à la répartition
par catégorie et aux points d'attention. Les indicateurs ne décrivent donc pas
le stock global quand un filtre est actif. Le périmètre et les filtres actifs
sont affichés ; Réinitialiser les filtres rétablit la vue de tous les matériels.
La recherche ignore la casse et les accents.

Le service et la recherche sont appliqués aux lignes sources AVANT regroupement.
Exemple : deux lignes d'un même tuyau, 10 unités au service A et 5 au service B,
affichent 15 sans filtre mais seulement 10 avec le service A. Il ne suffit pas
de tester le service de la première ligne d'un groupe et de conserver 15.
La case Stocks à surveiller est ensuite appliquée aux références regroupées,
selon leur stock disponible et leur seuil.

Le nombre « sur N références » représente le total global après regroupement,
pour situer la sélection. Les panneaux de mouvements, corrections et suppressions
conservent leur périmètre global, indiqué explicitement dans l'interface.

## Définition des KPI

- Références affichées : types de matériel regroupés dans la sélection.
- Unités en stock : somme des quantités et du nombre d'appareils suivis, sans
  compter une seconde fois les fiches d'appareils. Le sous-titre précise le
  nombre d'appareils suivis individuellement inclus dans ce total.
- Disponibilité : unités disponibles / unités totales, arrondi à un pourcentage
  entier. En gestion en quantité, le stock est disponible. En suivi individuel,
  seuls les appareils au statut Disponible sont comptés au numérateur. Une
  sélection vide ou un stock total nul affiche un tiret, jamais un faux 100 %.
- Stocks à surveiller : références dont le nombre disponible est inférieur ou
  égal au seuil ; le sous-titre précise celles sans aucune unité disponible.
- Appareils suivis : nombre d'appareils actifs appartenant aux références
  individuelles sélectionnées ; maintenance et indisponibilité sont détaillées.
- Garanties à surveiller : appareils dont la garantie est expirée ou arrive à
  échéance d'ici 90 jours. Les deux cas sont distingués dans le sous-titre.

Les garanties concernent seulement les appareils suivis individuellement ; les
lots en quantité ne sont pas assimilés à un appareil. Une date absente reste
inconnue et facultative, sans être considérée comme expirée. Les appareils retirés
et ceux dont la référence est archivée ne participent pas aux KPI.

Le jour de référence est celui de Paris. Une garantie est expirée si sa date
est antérieure à aujourd'hui. Aujourd'hui et le 90e jour sont inclus dans les
garanties à échéance ; le calcul utilise des jours calendaires et non des durées
locales susceptibles de varier avec les changements d'heure.

## Synthèses complémentaires

La répartition montre les quatre catégories ayant le plus d'unités dans la
sélection, avec leurs nombres réels. Les barres sont proportionnelles au maximum
visible ; le panneau précise quand d'autres catégories ne sont pas affichées.
Aucune sélection n'affiche de fausses barres ou de valeurs d'exemple.

Les points d'attention distinguent garanties expirées, échéances, maintenance,
indisponibilité et dates de garantie manquantes. Les quantités initiales définies
par défaut restent signalées uniquement parmi les références sélectionnées.
Les dates facultatives manquantes sont présentées comme une information neutre.

## Présentation et validation

Navigation latérale sur PC, accès rapide aux sections sur petits écrans,
indicateurs en cartes, couleurs de statut et répartition du stock. L'inventaire
reste un tableau sur grand écran et des cartes sur tablette/mobile, avec les
mêmes commandes. Les formulaires et le suivi des appareils sont conservés.
Les icônes sont locales ; aucun service de polices ou d'images externe n'est
nécessaire. Les libellés issus de la base et les filtres sont insérés avec
textContent pour ne pas interpréter du HTML.

Les tests métier couvrent les filtres combinés, le service avant regroupement,
les sélections vides, les appareils retirés, les frontières des garanties et
le jour de Paris. Les tests Chromium avec API simulée vérifient les mêmes
résultats dans la page et les largeurs 320, 390, 768, 1024, 1280, 1366, 1440 et
1600 pixels, ainsi que le maintien du parcours des sept appareils.
La publication reste sur develop, pour les previews ; aucune production ni
modification des stocks n'est déclenchée par cette refonte.
