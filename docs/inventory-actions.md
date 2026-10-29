# Correction manuelle et suppression d'une ligne

Appliquer 007_inventory_actions.sql puis 008_manage_stock.sql dans SQL Editor,
chacun dans une nouvelle requête. Les deux fichiers font moins de 4 000 caractères
et sont réexécutables. L'installation seule ne corrige ou ne supprime aucun bien.
La publication du code reste limitée à develop ; le propriétaire applique les
migrations sur le projet Supabase de test.

## Corriger le stock

Le bouton Corriger le stock ouvre une saisie de quantité réelle (entier de 0 à
1 000 000) avec motif obligatoire. Le serveur verrouille la fiche et compare
la quantité attendue à sa quantité actuelle. Si le stock a changé depuis son
chargement, la correction est refusée ; fermer le dialogue, actualiser et
recommencer avec les nouvelles données.

L'écart est enregistré comme entrée ou sortie dans stock_movements et la
correction complète, avec quantité avant/après, motif et compte utilisateur,
est enregistrée dans stock_asset_events. L'ensemble est transactionnel.
Une vérification sans changement de quantité est également tracée dans les
événements, sans inventer un mouvement de quantité zéro. La marque de quantité
initiale par défaut est retirée après cette vérification/correction manuelle.

Un identifiant unique rend un double envoi sans effet supplémentaire. Rejouer
le même identifiant avec d'autres paramètres est refusé. Les boutons sont aussi
désactivés pendant les enregistrements.

## Supprimer une ligne

Le bouton Supprimer affiche la désignation et le stock concernés et demande
une confirmation avec motif. La fiche reçoit archived_at, archived_by et
archive_reason ; elle disparaît de l'inventaire actif et des indicateurs. Ses
quantités enregistrées, photo, données d'origine et mouvements sont conservés.
Il s'agit donc d'une suppression de l'inventaire par archivage, pas d'un effacement
physique. Aucune fusion ou suppression des anciens groupes du rapport de
rapprochement n'est exécutée automatiquement.

Les nouvelles entrées, sorties et modifications d'une fiche supprimée sont
refusées en base, même via les anciennes fonctions d'écriture. L'historique
des mouvements continue d'afficher sa désignation. Le panneau Corrections et
suppressions affiche les 20 derniers événements et leur motif. Les membres
peuvent lire les fiches archivées pour conserver le lien avec l'historique,
mais l'interface les exclut de l'inventaire actif. La restauration n'est pas
exposée dans cette version ; elle doit être traitée séparément si nécessaire.

## Droits et vérifications

Depuis la migration 019, manage_stock_asset exige le rôle administrateur dans stock_members ; les écritures directes
et l'accès anonyme à stock_asset_events restent interdits. La suppression est
ciblée sur un seul identifiant. Les modifications et l'événement sont atomiques.
Les tests PostgreSQL couvrent les droits, les quantités négatives ou périmées,
les doubles envois, les corrections vers zéro, la vérification sans écart et
l'interdiction d'écrire sur une fiche supprimée. Le parcours DOM/SDK avec API
simulée couvre la correction, l'annulation et la confirmation d'une suppression,
les indicateurs et la conservation de l'historique. La vérification réelle dans
Supabase reste à effectuer après application des deux scripts.

Depuis les migrations 018 à 021, la consultation est réservée aux comptes approuvés et les écritures aux administrateurs. Voir [Comptes et rôles](accounts-access.md) pour la procédure actuelle de validation des demandes.
