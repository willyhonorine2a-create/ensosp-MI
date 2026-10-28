# Références de matériel et appareils — modèle actuel

Une référence décrit un type de matériel (catégorie, nom, référence, photo,
seuil minimum). L'accueil regroupe les lignes gérées en quantité qui partagent
la catégorie, la désignation et la référence (casse et espaces normalisés).
Il affiche la somme de leurs quantités, sans modifier la base à ce stade.
Des références différentes, ou des modes de suivi différents, ne sont pas fusionnés.

## Deux modes

- Gestion en quantité : tuyaux, raccords, consommables. Pas de création d'une
  fiche par unité. Les mouvements et corrections de quantité restent disponibles.
- Suivi individuel : le stock est le nombre d'appareils actifs de stock_devices.
  Chaque appareil dispose d'un identifiant interne stable APP-xxxxxx. Son numéro
  de série, ses dates d'achat et de fin de garantie et ses observations sont
  facultatifs. La disponibilité peut être Disponible, En maintenance ou Indisponible.

Le chiffre du stock est cliquable. En mode individuel, il ouvre le listing des
appareils avec leurs informations, les boutons Ajouter et Compléter / modifier.
Le nombre disponible est distinct du total ; la maintenance ne retire pas un
appareil du total. Les alertes de seuil utilisent le nombre disponible.
Un tuyau peut rester sans numéro de série et sans date.

La création d'une référence permet de choisir son mode. En suivi individuel,
le nombre initial crée des appareils vides, sans inventer de numéro de série
ou de date. Le nombre initial est limité à 500 pour éviter les créations massives
accidentelles ; les appareils suivants s'ajoutent individuellement.

## Données et droits

Appliquer les migrations 009 à 013 après les migrations de catégories, photos et
actions de stock déjà utilisées par le projet. Chacune contient une transaction
complète, fait moins de 4 000 caractères et peut être réexécutée. Les cinq étapes
sont à terminer avant d'utiliser la nouvelle preview.

stock_assets reste la table des références, avec tracking_mode et merged_into.
stock_devices contient les appareils, avec RLS réservé aux membres. Le stock
individuel est tenu à jour par trigger après ajout/retrait et protégé contre
les anciennes fonctions de correction de quantité. L'ajout et le retrait sont
transactionnels et verrouillent la référence, pour sérialiser les changements.
Une fiche modifiée depuis son chargement est refusée grâce à updated_at.
Les numéros de série sont facultatifs ; lorsqu'ils sont renseignés, ils doivent
être uniques parmi les appareils actifs d'une même référence.

Les RPC utilisent les droits d'appartenance stock_members ; les tables ne sont
pas ouvertes en écriture au navigateur. Les créations de références, conversions
et opérations d'appareils ont des identifiants de requête protégeant des doubles
envois. Les traces sont conservées dans stock_tracking_events et
stock_device_events, consultables par les membres en base. Les anciens mouvements
et événements de stock restent attachés aux fiches d'origine.

## Regrouper les anciennes lignes

Cliquer sur le chiffre du stock d'un groupe en quantité présente les lignes
sources et leurs stocks. Elles restent modifiables individuellement. La conversion
nécessite un nombre réel, un motif et une confirmation explicite ; la somme
courante est proposée mais jamais convertie automatiquement.

convert_stock_reference vérifie les identités, stocks attendus et modes de toutes
les lignes sélectionnées, avec verrouillage. Une fiche conservée devient la
référence ; les autres sont archivées avec un lien merged_into. Les quantités
historiques, photos, métadonnées et mouvements des sources sont conservés. Le
nouveau stock correspond exactement au nombre confirmé, sans inventer une
entrée physique équivalente aux quantités transférées depuis les anciennes lignes.
Le total avant/après et le motif du comptage sont enregistrés dans l'audit.

Les fiches d'appareils issues d'un groupe sont initialement vides : aucune
identité, série ou date n'est déduite arbitrairement des lignes importées. Dans
le cas non ambigu d'une seule ancienne unité, ses série et dates connues sont
reprises sur le premier appareil. Une photo disponible est privilégiée pour la
fiche conservée. Les autres données source restent sur les fiches archivées.

Le script privé ANTARI FOG fourni dans la conversation initialise les 7 appareils
explicitement indiqués par le propriétaire. Il cherche uniquement les lignes
actives en quantité de cette désignation dans MAC. Il ne touche pas la référence
MACHINE A FUMÉE PORTATIVE ANTARI, distincte d'ANTARI FOG. Le rejouer après conversion
ne crée aucun appareil supplémentaire. Les autres références restent à convertir
par choix explicite dans l'interface.

## Retrait et suppression

Retirer un appareil demande confirmation, le marque retired_at et diminue le
stock automatiquement ; sa fiche et son audit restent en base. Modifier sa
maintenance ou ses données ne change pas le total. Supprimer la référence
l'archive avec tous ses liens conservés et bloque les nouveaux changements sur
ses appareils. Les fonctions précédentes d'entrées/sorties/correction de quantité
restent utilisables seulement pour les références en quantité.

## Vérifications

npm test vérifie le regroupement, la conversion, les droits RLS, les champs
facultatifs, les séries uniques, les corrections bloquées, les doubles envois,
les dates concurrentes et la conservation des historiques. Le parcours Chromium
avec API simulée vérifie un groupe de 7 appareils, l'édition série/dates, la
maintenance, l'ajout vide et le retrait, la création en quantité sans appareils,
et les tailles d'écran 320, 390, 768, 1024, 1280 et 1440 pixels.
L'installation distante et le comptage physique restent à vérifier par le
propriétaire ; l'agent ne dispose pas d'accès administrateur Supabase.
