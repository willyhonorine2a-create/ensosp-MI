> Configuration actuelle : [catégories simples et photos](categories-photos.md). Les genres et sous-catégories décrits ci-dessous sont historiques. Ne pas réappliquer les migrations 003/004 après 005.

# Installation Supabase pour la preview

Projet de test indiqué par l'utilisateur : `jdxfwetfdekwxposowys`.
L'URL du projet n'est pas un identifiant d'administration. Sans connexion
administrative disponible, l'installation distante doit être lancée dans le SQL
Editor du tableau de bord Supabase. Aucun mot de passe ni clé secrète n'est
nécessaire dans GitHub ou dans la conversation.

## Schéma et import

1. Dans le projet de test, ouvrir SQL Editor, puis New query.
2. Exécuter `supabase/migrations/001_stock.sql`.
3. Exécuter l'import privé généré avec le convertisseur ci-dessous. Un fichier
   privé combinant ces deux étapes est fourni dans la conversation ; il suffit
   de l'exécuter seul si vous l'utilisez.
4. Exécuter ensuite `supabase/migrations/002_preview.sql` pour les écritures de fiches et les mouvements protégés contre les doubles envois.
5. Le résultat du contrôle initial doit afficher 187 biens, 1239 unités et
   87 quantités initiales par défaut. La quantité ligne 115 a été corrigée à 7
   sur instruction du propriétaire.

La migration crée stock_assets, stock_movements, stock_members et la fonction
record_stock_movement. Toutes les tables ont RLS activé ; les utilisateurs anonymes
n'ont aucun accès. Un utilisateur connecté doit être présent dans stock_members.
Ne pas désactiver RLS pour afficher les données dans l'application.

Les quantités initiales proviennent du fichier : ce ne sont pas des entrées
utilisateur inventées dans l'historique. QTE vide vaut 1 conformément à la trame,
et quantity_defaulted le signale. Aucun seuil minimum n'étant fourni, il vaut 0.
Toutes les colonnes non vides d'origine sont conservées dans source_data, y compris
celles non encore affichées dans le prototype. Les codes restent inchangés ; les
références et lieux manquants restent NULL. Aucun code de bien n'est inventé.
Les dates Excel sont converties en dates ISO.

## Reproduire l'import (Python 3, bibliothèque standard)

Utiliser un dossier privé ignoré par Git, jamais src/ ou dist/ :

```sh
mkdir -p private-imports
python3 scripts/prepare_import.py '/chemin/Trame import patrimoine.xlsx' \
  --quantity-override 115=7 \
  --output private-imports/import.sql
python3 -m unittest discover -s test -p 'test_*.py' -v
```

Le convertisseur n'évalue pas de formules Excel : seules les références directes
à une cellule non calculée sont prises en charge. Les autres formules provoquent
une erreur. Il refuse d'écraser un fichier de sortie existant.
L'import entier est transactionnel. Sa clé stable combine SHA-256 du classeur
et numéro de ligne : relancer le même fichier ne duplique pas les biens et ne
réinitialise pas leurs stocks. Un classeur modifié est un nouvel import : ne pas
l'importer à nouveau sans rapprochement préalable, car beaucoup de biens du
fichier source n'ont pas de code unique.

## Autorisation d'un utilisateur (étape suivante)

Dans Authentication > Users > Add user > Create new user, créer un compte avec une adresse e-mail et un mot de passe personnel. Confirmer le compte si nécessaire. Ne pas partager ce mot de passe. Ce compte est indépendant de la connexion GitHub au tableau de bord Supabase. Copier ensuite son UUID.
Dans le SQL Editor, exécuter en remplaçant la valeur :

```sql
insert into public.stock_members(user_id)
values ('UUID_UTILISATEUR_ICI'::uuid)
on conflict do nothing;
```

Les mouvements passent exclusivement par record_stock_movement, qui verrouille
le bien, vérifie le stock et écrit stock et historique dans une seule transaction.
La migration 002 ajoute save_stock_asset et record_stock_movement_once.
Les fiches sont écrites via une fonction vérifiant l'appartenance au magasin,
les longueurs et les quantités. Modifier une fiche ne modifie jamais son stock.
La création fixe un stock initial ; les changements suivants sont des mouvements.
L'historique enregistre le compte connecté, la date et le motif facultatif.
Un identifiant de requête rend la répétition d'un même mouvement sans effet,
y compris après une réponse réseau perdue. Les réexécutions avec paramètres
différents sous le même identifiant sont refusées.

## État de l'intégration

L'interface est raccordée à Supabase avec le client officiel. La configuration
publique figure dans src/config.js. Un utilisateur non autorisé ne voit pas
l'inventaire ; après autorisation il peut lire, créer/modifier des fiches et
réaliser des mouvements. Pas d'inscription libre ni d'accès anonyme au stock.
Les sessions sont stockées dans sessionStorage. Les données locales du prototype
ne sont pas migrées automatiquement. Le bouton Actualiser permet une relecture
explicite du stock ; aucune synchronisation temps réel n'est revendiquée.

Les migrations et l'import ont été testés avec PostgreSQL local (PGlite) ;
les parcours interface/SDK ont été vérifiés avec une API simulée. La vérification
authentifiée sur le projet distant nécessite la création du premier compte
applicatif et son autorisation par le propriétaire. L'environnement cloud doit
aussi autoriser le domaine jdxfwetfdekwxposowys.supabase.co pour ses propres
vérifications réseau ; cela est indépendant du navigateur qui utilise la preview.

Ne jamais utiliser une clé service_role ou secrète dans le navigateur. Garder
la production séparée ; develop reste en preview.

Pour les listes de genres/catégories/sous-catégories, appliquer également la
migration 003. Voir [le référentiel du magasin](classifications.md). Les codes
ne sont plus libres pour les nouveaux classements ; les codes historiques hors
référentiel restent conservés tant qu'ils ne sont pas reclassés explicitement.
