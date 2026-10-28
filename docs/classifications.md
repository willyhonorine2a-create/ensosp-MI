> Configuration actuelle : [catégories simples et photos](categories-photos.md). Les genres et sous-catégories décrits ci-dessous sont historiques. Ne pas réappliquer les migrations 003/004 après 005.

# Référentiel du magasin

Source : document fourni « Classifications magasin.docx ». Les libellés ont été
repris et la typographie normalisée. Le document décrit cinq genres, neuf
catégories et quatorze sous-catégories. Il ne fournit pas de catégories pour
Nettoyage (NET) ou Pièces détachées (PID), ni de sous-catégories pour INC : aucune
n'a été inventée.

Les codes explicités dans Word sont conservés. Pour les désignations sans code
explicite (Clés, Matériels et sous-catégories notamment), on reprend les codes
correspondants déjà utilisés dans la trame Excel : CLE, MAT, COU, LEV, ECA, POL,
CAL, ECL, BAT, DET, COM, RAL, MAC, VEN et CAM. Le code ECA peut être une catégorie
sous EEE et une sous-catégorie sous SR/OUT ; les clés composites distinguent les
niveaux. Les codes et libellés retenus figurent dans reference/classifications.json.

## Application dans Supabase

Après les migrations 001 et 002, exécuter
supabase/migrations/003_classifications.sql dans SQL Editor, en entier.
La création des tables, les libellés et les règles sont transactionnels et le
script est réexécutable. Il ne modifie pas les codes, les quantités ni l'historique.
Il remplit category_name et subcategory_name seulement quand la combinaison des
codes est reconnue. Les autres lignes ne sont pas reclassées.

Les trois tables stock_genres, stock_categories et stock_subcategories sont
reliées par des clés étrangères. Les membres du magasin peuvent lire ces tables ;
les utilisateurs anonymes n'y ont pas accès et les membres ne peuvent pas les
modifier directement. Les nouvelles combinaisons dans stock_assets sont vérifiées
par un trigger, y compris via save_stock_asset. Les libellés sont déterminés par
le référentiel plutôt que par le client. Un classement incomplet est autorisé,
mais une catégorie sans genre ou une sous-catégorie sans catégorie est refusée.

## Anciennes classifications

Le classeur initial contient 25 biens hors de la hiérarchie Word : ENC/CON (3),
ENC/NET (9), EQT/ECA/CAM (6), EQT/ECA/MAC (6) et SR/OUT/POLY (1).
Ces codes restent inchangés. Aucune équivalence ENC→NET, EQT→EEE ou POLY→POL
n'est imposée. Le contrôle final du script liste les combinaisons à rapprocher
avec leurs effectifs réels au moment de l'exécution.

Les anciennes fiches restent modifiables sans reclassement forcé ; changer leur
classement exige une combinaison du nouveau référentiel. Leurs mouvements de
stock restent possibles. Rejouer un import identique avec la même import_key et
ON CONFLICT DO NOTHING reste sans effet sur les données existantes.

## Interface

Les filtres et la fiche chargent les référentiels depuis Supabase. Les filtres
Genre → Catégorie → Sous-catégorie sont liés et affichent codes et libellés.
Changer de parent réinitialise les sélections enfants. Les catégories de tous les
genres sont consultables quand aucun genre n'est filtré.

Dans les fiches, les listes proposent uniquement les enfants du parent choisi ;
la valeur historique hors référentiel est conservée pour sa fiche existante.
Les champs de désignation de catégorie et sous-catégorie sont en lecture seule.
L'inventaire signale les classifications à vérifier. La recherche porte également
sur les libellés du référentiel. Une migration 003 absente produit un message
explicite et ne provoque aucun retour silencieux au stockage local.

Les contrôles PostgreSQL et les parcours DOM avec API simulée valident la
hiérarchie, les droits, le maintien des stocks et les listes dépendantes.
L'application distante du script doit être effectuée par le propriétaire dans
SQL Editor, l'environnement ne disposant pas d'accès administrateur Supabase.

## Reclassement validé MAC et CAM

À la demande explicite du propriétaire, la migration 004_reclassify_mac_cam.sql
reclasse uniquement EQT/ECA/MAC et EQT/ECA/CAM en EEE/ECA, sans modifier leurs
sous-catégories. Le trigger renseigne les libellés reconnus. Les quantités,
identifiants, références, historique et source_data sont conservés. Les autres
classements restent inchangés. Le script peut être rejoué : seuls les biens
encore classés dans les deux anciennes combinaisons sont traités.

Sur l'import initial, cela représente 6 biens MAC et 6 biens CAM. Le total de
classements hors référentiel passe de 25 à 13 si aucune autre modification n'a
été effectuée. Les valeurs réellement reclassées sont retournées par le script.
Ce reclassement est une correction métier après import ; les codes d'origine
restent dans source_data. Ne pas réimporter un classeur modifié pour mettre à
jour les fiches : utiliser les fiches ou des corrections ciblées.
