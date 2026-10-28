# ENSOSP — Magasin incendie

Prototype de gestion de stock en français : catalogue, recherche, seuils minimums,
création de matériel et historique des entrées/sorties. Trois articles de démonstration
sont proposés au premier lancement.

## Développement

Node.js 22 ou supérieur. Aucune dépendance externe ni clé de service nécessaire.

```sh
npm ci
npm run dev
```

Le serveur utilise le port 3000 (modifiable via PORT). `npm test` vérifie les règles
de mouvement de stock. `npm run build` produit le site statique dans `dist/`.

## Vercel

Importer ce dépôt, choisir le preset Other, la commande `npm run build` et le
dossier de sortie `dist`. Ces deux derniers paramètres figurent dans vercel.json.
Aucune variable d'environnement n'est nécessaire pour cette version.

## Limites de cette version

Les données sont stockées dans localStorage sur le navigateur utilisé. Elles ne
sont pas partagées entre postes et peuvent être perdues si le stockage est effacé.
Pas de connexion utilisateur, de sauvegarde serveur ni de connexion Supabase à ce
stade. Réserver cette version à la démonstration ; la gestion réelle nécessitera
Supabase, des droits d'accès et des mouvements transactionnels côté base de données.
Ne jamais placer de mot de passe ou de clé Supabase secrète dans le code client.
