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
4. Le résultat du contrôle initial doit afficher 187 biens, 1239 unités et
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

Créer ou inviter le compte dans Authentication > Users, puis copier son UUID.
Dans le SQL Editor, exécuter en remplaçant la valeur :

```sql
insert into public.stock_members(user_id)
values ('UUID_UTILISATEUR_ICI'::uuid)
on conflict do nothing;
```

Les mouvements passent exclusivement par record_stock_movement, qui verrouille
le bien, vérifie le stock et écrit stock et historique dans une seule transaction.
Les membres peuvent actuellement lire et enregistrer des mouvements ; la création
et la modification de fiches distantes ne sont pas encore exposées au client.

## État de l'intégration

Ces fichiers préparent la base. Le prototype web reste sur localStorage tant que
l'authentification Supabase et l'adaptateur de données ne sont pas raccordés.
Ne pas considérer un import SQL réussi comme une synchronisation du navigateur.
Les données locales du navigateur ne sont pas envoyées par cet import.
Ne pas utiliser une clé service_role ou secrète dans le navigateur ou dans les
variables publiques Vercel. Garder la production séparée ; develop reste en preview.
