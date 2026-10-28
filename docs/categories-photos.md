# Catégories simples et photos — configuration actuelle

Le classement actif utilise une seule catégorie. Les genres et sous-catégories
n'apparaissent plus dans les formulaires, filtres, recherche ou tableau, et ne
sont plus chargés par l'application. Leurs anciennes tables/colonnes sont gardées
comme historique, sans intervenir dans les nouvelles saisies. La migration
archive les anciens classements dans legacy_classification avant modification.

## Table des catégories

stock_category_catalog contient un code unique (1 à 10 caractères A-Z, chiffres
ou underscore) et un libellé (1 à 50 caractères). Les 12 codes initiaux et libellés
fournis par le propriétaire figurent dans reference/categories.json. Une clé
étrangère relie stock_assets.category à cette table. Les anciens codes qui ne
figurent pas dans la nouvelle table deviennent « À classer » ; leur valeur
historique est conservée dans legacy_classification et source_data.

Les membres lisent le catalogue et ajoutent une catégorie via
create_stock_category. Aucun accès anonyme et aucune écriture directe sur le
catalogue ne sont accordés. Le bouton Gérer les catégories affiche la table et
permet d'ajouter un code ; le nouveau code est immédiatement disponible lors
de la création d'un matériel. La suppression/renommage de codes n'est pas exposée.
Les fiches modifiées dans l'interface doivent choisir une catégorie du catalogue.

## Mise à jour de la base existante

Après les migrations 001 et 002, appliquer 005_simple_categories.sql puis
006_photos_storage.sql. Les migrations 003 et 004 sont historiques : ne pas les
rejouer après 005, car elles rétabliraient l'ancienne logique hiérarchique.
Aucun stock ni mouvement n'est modifié par 005/006.

Pour éviter les copies tronquées dans SQL Editor :

```sh
python3 scripts/export_category_setup.py private-imports/setup
```

Exécuter les trois requêtes exportées dans l'ordre, chacune dans une nouvelle
requête SQL Editor. Chaque fichier contient moins de 4 000 caractères et une
transaction complète. Exécuter ensuite le rapprochement privé des catégories.
Les scripts sont réexécutables.

## Rapprochement du nouveau fichier

```sh
python3 scripts/reconcile_categories.py '/chemin/ancien.xlsx' '/chemin/nouveau.xlsx' \
  --output private-imports/categories.sql --report private-imports/rapprochement.json
```

Le rapprochement utilise désignation/référence normalisées pour relier les deux
fichiers, puis les import_key exactes de l'ancien fichier pour cibler les lignes
en base. Il ne remplace ni les quantités, ni l'historique, ni les photos, ni
source_data. Les fiches créées dans l'application ne sont pas ciblées. Les
identités ambiguës dans le nouveau fichier et catégories inconnues sont refusées.

Dans les fichiers fournis : 167 nouvelles lignes correspondent à 179 anciennes
fiches ; 8 anciennes fiches sont absentes et 3 groupes comportent plusieurs
anciennes lignes. Le propriétaire a demandé un rapprochement à valider : aucune
suppression ou fusion n'est exécutée. Le rapport privé est fourni dans la
conversation, sans les données de stock dans GitHub.

Les totaux initiaux de la base (187 biens / 1239 unités) sont conservés, hors
mouvements effectués depuis par les utilisateurs. Sur la copie locale de cet
import, le script change effectivement 131 catégories au premier passage et 0
au second. Ce nombre peut varier selon les classements déjà corrigés en base.
La quantité ANTARI de 45 432, toujours présente dans le nouveau classeur, n'est
pas réimportée : la correction validée à 7 reste intacte.

Les fichiers actuels ne contiennent pas de nouvelles identités. Pour un futur
classeur modifié, examiner le rapport et traiter les nouveaux biens à part : ne
pas relancer l'ancien import à l'aveugle ni utiliser un nouveau hash de classeur
pour mettre à jour l'existant.

## Photos

Le bucket Supabase stock-photos est privé. JPEG, PNG et WebP, 5 Mo maximum.
L'application contrôle le type MIME, la signature du fichier et sa taille avant
l'envoi. Le bucket limite aussi MIME et taille. Les chemins sont aléatoires et
immuables ; l'upload ne remplace jamais un objet existant. L'accès en lecture et
en ajout est réservé aux membres du magasin via storage.objects RLS.

stock_assets.photo_path contient le chemin de l'objet ; la fiche refuse un
chemin invalide ou une nouvelle référence à une photo non téléversée. Les images
s'affichent dans l'inventaire et dans la fiche via des URL signées d'une heure.
Actualiser renouvelle ces URL. Une photo inaccessible est signalée sans empêcher
l'affichage des stocks. Les images ne sont pas intégrées au dépôt ou au site
compilé. Aucune variable ou clé secrète Vercel supplémentaire n'est nécessaire.

Ajouter/remplacer une photo téléverse un nouvel objet avant l'enregistrement de
la fiche. En cas d'échec, aucun ancien objet n'est supprimé automatiquement :
une erreur réseau peut avoir masqué la réussite de l'enregistrement. Des objets
non référencés peuvent donc rester dans le bucket pour examen administratif.
Retirer une photo détache sa référence de la fiche ; le fichier privé est conservé.
Un nettoyage destructif n'est pas lancé automatiquement. L'utilisateur peut
annuler la fiche sans modifier ses métadonnées ou sa quantité.

## Vérifications

npm test couvre les règles métier, les catégories et droits PostgreSQL locaux,
l'ajout/retrait de photos, le refus d'une photo non téléversée, la conservation
des stocks et les mouvements. Les tests Python couvrent l'extraction du classeur
et le rapprochement. Le parcours DOM/SDK a été exercé avec une API simulée ; le
classeur réel et les trois scripts séparés ont été validés localement via PGlite.
L'application distante des scripts et l'accès au stockage doivent être vérifiés
par le propriétaire dans Supabase ; aucun accès administrateur n'est disponible
à l'agent dans cette session. Les publications Git restent limitées à develop.
