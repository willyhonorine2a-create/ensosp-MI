# ENSOSP — Magasin incendie

Application en français : connexion Supabase, inventaire partagé, fiches
patrimoniales, recherche, filtres, seuils et historique des entrées/sorties.
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
migrations 001 puis 002 dans le SQL Editor du projet de test. L'interface exige
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
