# Inventaires publics des engins

La rubrique `/inventaire/` est consultable sans connexion. Elle affiche les affectations du fichier `parc engins 2026_valide.xlsx` (46 engins, neuf affectations) et les fiches effectivement fournies. La première fiche intégrée est **FPT 18 — ES-676-MV — CS ALPHA**, conformément à la dernière instruction du gestionnaire. Le premier exemple FPT 6 a été remplacé ; il n'est pas publié.

## Données et photos

Le fichier FPT 18 contient 16 compartiments, 50 lignes et 92 unités dans la dotation de référence. La notation « 1+1 » de la ligne GHV est conservée à l'affichage et comptée comme deux unités pour le total. Les quantités proviennent du document ; aucun comptage physique ou rapprochement avec le stock du magasin n'est effectué. Les métadonnées affichées sont la mise à jour du 29/04/2026 et la version 01.

Les deux photos de véhicule sont extraites sans modification de `xl/media/image2.jpeg` et `image4.jpeg`, identifiées visuellement dans le classeur fourni. L'image décorative d'immatriculation et le logo intégré ne sont pas importés. L'immatriculation provient du texte de l'en-tête et est comparée à celle du parc. Les fichiers Excel originaux, leurs chemins personnels et leurs métadonnées complètes ne sont pas servis publiquement.

Les autres engins portent la mention « Fiche à ajouter ». La fiche d'un FPT ne sert jamais à remplir celle d'un autre véhicule. Les sections suivent l'ordre cabines, coffres 1 à 6, arrière et toit. Les coffres du bas restent rattachés à leur coffre principal.

## Consultation

- Choisir une affectation (ALPHA, BRAVO, CHARLIE, ECHO, GOLF, HOTEL, INDIA, MUTUALISE, OPE), ou rechercher un nom/une immatriculation.
- Le filtre « Fiches disponibles uniquement » limite la liste aux fiches publiées. Les engins sont affichés par groupes de 12 si aucune affectation n'est sélectionnée.
- Ouvrir « Consulter l'inventaire » sur le FPT 18. Les photos s'agrandissent dans une fenêtre refermable au clavier.
- Rechercher un matériel ou un compartiment ; les accents sont ignorés.
- « Imprimer la fiche complète » retire la recherche puis imprime toute la fiche. Les styles d'impression prévoient le format A4 ; l'utilisateur peut aussi enregistrer un PDF depuis son navigateur.
- Un lien direct est conservé dans l'adresse : `/inventaire/#centre=ALPHA&engin=fpt-18`.

## Import et maintenance

Le contenu publié réside dans `public/inventaire/data.json` et `public/inventaire/photos/`. Il est copié dans `dist/` au build. Le JavaScript public est un bundle séparé, sans Supabase ni authentification. Il n'effectue aucune lecture/écriture dans la base privée ; aucune migration SQL n'est nécessaire. Cette version propose la consultation de fiches, pas encore un formulaire de contrôle ou de validation d'inventaire.

Le script `scripts/prepare_public_inventory.py` extrait les colonnes A/D, F/I, K/N et les en-têtes du modèle FPT 18 relu. Il rejette les quantités non reconnues, les incohérences d'immatriculation ou d'affectation et les engins dupliqués. Les expressions de quantité acceptées sont exclusivement des sommes d'entiers ; aucune formule ou instruction du classeur n'est exécutée. L'import des photos est volontairement limité au modèle FPT 18 fourni : une nouvelle trame devra être examinée avant extension.

```sh
python scripts/prepare_public_inventory.py --fleet '/chemin/parc engins 2026_valide.xlsx' --sheet '/chemin/FPT 18.xlsx' --output public/inventaire --center ALPHA
```

Les tests vérifient les 46 engins, l'unique fiche réellement disponible, son rattachement, les filtres combinés, les quantités particulières et les métadonnées. Des essais navigateur couvrent les tailles 320 à 1440 px, les photos, les liens directs, le chargement en échec, l'impression et l'absence de requêtes vers Supabase.

## Gestion Supabase (développement, sans mise en production)

La consultation utilise désormais `inventory_vehicles` dans le projet de test de
`src/config.js`. Appliquer **022_public_inventory.sql**, puis
**023_seed_public_inventory.sql** après les migrations existantes 001 à 021.
Le second script conserve les engins déjà présents et importe les 46 affectations
et la seule fiche fournie. Aucun classeur supplémentaire n'est importé automatiquement.
Les photos publiques existantes restent dans le site. En cas d'erreur réseau ou de
migration absente, la page affiche une erreur, sans revenir au fichier statique.

La connexion facultative de la page Inventaires utilise les comptes existants.
Seuls les membres `stock_members` avec rôle `admin` peuvent créer ou modifier un
engin. Chaque compartiment comporte un nom et une liste `quantité ; matériel`.
Les quantités non modifiées conservent leur notation d'origine, notamment `1+1`.
Retirer tous les compartiments retire la fiche de consultation de cet engin.
Un motif est obligatoire pour chaque enregistrement, y compris un changement de
centre. L'historique administratif conserve les valeurs avant/après, la date et
l'auteur ; ses 50 dernières entrées sont affichées dans le formulaire de l'engin.
Les identités et cet historique ne sont pas accessibles au public.

Les écritures directes sont interdites par les droits et RLS. La RPC vérifie le
rôle côté serveur, valide la fiche et écrit l'historique dans la même transaction.
Une révision évite l'écrasement d'une modification concurrente : fermer puis
recharger la page avant de reprendre la saisie. Ne pas appliquer ces migrations
à une base de production dans le cadre de cette livraison.
