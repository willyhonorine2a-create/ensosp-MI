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

## Previews et production

Les développements sont publiés sur `develop` ou une branche de fonctionnalité.
Avec l'intégration Git Vercel activée et `main` comme branche de production,
ces branches produisent des déploiements Preview. La mise en production est
réservée à l'utilisateur, par promotion manuelle d'une preview validée dans Vercel.
Ne pas pousser ou fusionner dans `main` pendant cette phase : cela déclencherait
normalement une production automatique. La production existante reste en place.

## Fiches patrimoniales

La structure des fiches reprend les champs utiles au magasin de la trame
`ASTECH_Import` : code du bien, désignation, nom court, genre, catégorie et
sous-catégorie (codes et désignations), série, code-barres, affectation, état du
bien, fournisseur, service gestionnaire, bien supérieur, dates et observations.
Le bouton Fiche permet de consulter et modifier ces informations. Les quantités
existantes se modifient exclusivement par mouvement pour conserver leur historique.
Les données locales de la première version sont conservées ; les champs nouveaux
restent vides tant qu'ils ne sont pas renseignés. Les filtres se peuplent à partir
des codes saisis dans les fiches.

Cette adaptation n'est pas un importateur Excel ni une intégration ASTECH. Les
lignes du fichier fourni ne sont pas incorporées au dépôt. Les champs de carte
grise, les compteurs et les coordonnées personnelles des correspondants ne sont
pas repris à ce stade. Les codes restent libres, sans contrôle contre les tables
ASTECH. Les champs patrimoniaux sont optionnels dans ce prototype, même si la
trame impose certains champs lors d'un import ASTECH. Les limites de longueur
des nouveaux champs reprennent celles de la trame. Le statut de disponibilité
est distinct du champ État du bien.
