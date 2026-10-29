# ENSOSP — Magasin incendie

Application en français : connexion Supabase, inventaire partagé, fiches
patrimoniales avec photo, catégories simples, recherche, filtres, seuils et historique des entrées/sorties.
Les données importées sans référence ou lieu restent affichables et modifiables
sans inventer de valeurs. Les quantités initiales par défaut sont signalées.

## Développement

Node.js 22 ou supérieur et Python 3 pour le convertisseur Excel.

```sh
npm ci
npm run dev
```

Le serveur utilise le port 3000 (modifiable via PORT). La commande dev reconstruit
le site au démarrage ; la relancer après modification. `npm test` exécute les tests
métier et PostgreSQL local via PGlite. `npm run build` utilise esbuild pour produire
le site statique et embarquer le client officiel Supabase dans `dist/`.

```sh
python3 -m unittest discover -s test -p 'test_*.py' -v
```

## Supabase

Voir [l'installation et la création des accès](docs/supabase.md). Exécuter les
migrations 001, 002, 005 et 006 dans le SQL Editor du projet de test. L'interface exige
un compte Supabase Auth autorisé dans stock_members. Il n'y a pas d'inscription
libre dans l'application. Le compte du tableau de bord Supabase est indépendant.

La configuration PUBLIQUE du projet de test se trouve dans src/config.js :
URL et clé Publishable uniquement. Aucune variable Vercel supplémentaire n'est
nécessaire pour cette preview. Ne jamais utiliser une clé secrète/service_role
côté navigateur. RLS reste activé ; toute autorisation dépend du compte connecté.

Les données ne sont plus lues ou enregistrées dans localStorage. Les anciennes
données de démonstration y sont laissées intactes, sans import automatique.
La session d'authentification est conservée dans sessionStorage et supprimée à la
déconnexion locale. Un clic Actualiser recharge le stock ; pas de temps réel à ce
stade. En cas d'échec Supabase, aucun mode local n'est activé silencieusement.

## Vercel : previews uniquement

Importer ce dépôt : preset Other, commande `npm run build`, sortie `dist`.
Les paramètres figurent dans vercel.json. Les développements sont publiés sur
`develop` ou une branche de fonctionnalité. Avec l'intégration Git Vercel active
et `main` comme branche de production, ils produisent des previews.

L'utilisateur effectue les promotions manuelles vers la production. Ne pas
pousser ou fusionner dans main sans demande explicite. Le projet Supabase câblé
ici est celui de test : prévoir une configuration distincte avant une éventuelle
promotion pour ne pas connecter la production à la base de test.

## Import patrimonial

Le convertisseur scripts/prepare_import.py reprend la trame ASTECH_Import.
Les fichiers de données restent privés hors du dépôt et du site compilé.
Il ne s'agit pas d'une connexion au logiciel ASTECH. Les codes sont libres ; les
référentiels externes, champs de carte grise et compteurs ne sont pas gérés par
les formulaires. Les colonnes d'origine restent conservées dans source_data.

## Catégories simples et photos

Le classement actif utilise les 12 catégories fournies, sans genre ni sous-catégorie.
Le bouton Gérer les catégories permet de créer un code pour les nouveaux matériels.
Chaque fiche permet d'ajouter, remplacer ou retirer une photo (JPEG/PNG/WebP, 5 Mo).
Voir [la configuration des catégories et photos](docs/categories-photos.md) pour
les migrations 005/006, les scripts courts à exécuter dans Supabase et le
rapprochement privé avec le nouveau classeur. Les stocks et historiques existants
sont préservés ; le regroupement des anciennes lignes reste à valider.

## Correction du stock et suppression

Les boutons Corriger le stock et Supprimer permettent respectivement de saisir
une quantité réelle et de retirer une ligne de l'inventaire, avec motif et trace
historique. Appliquer les migrations 007 et 008. Voir [les actions de stock](docs/inventory-actions.md).

## Références et appareils

Le modèle actuel distingue la gestion en quantité et le suivi individuel.
Le stock cliquable ouvre les lignes ou appareils correspondants ; séries et
dates individuelles restent facultatives. Appliquer les migrations 009 à 013.
Voir [le fonctionnement des références et appareils](docs/references-devices.md).

## Tableau de bord

Les six KPI, la répartition par catégorie et les points d'attention reflètent
les filtres actifs et la recherche. Les garanties manquantes restent facultatives.
Voir [les règles de calcul et le périmètre](docs/dashboard.md). Aucune migration
SQL supplémentaire n'est nécessaire pour cette présentation.

Emplacements physiques : [MI / CS, installation et utilisation](docs/physical-locations.md).

Comptes et rôles : [installation et gestion des accès](docs/accounts-access.md).
