# Emplacements physiques MI / CS

Le filtre « Service d’affectation » devient « Emplacement physique ». Il distingue le magasin incendie (MI), les centres de secours regroupés (CS), et les matériels « À localiser ». Les anciens codes de service et les précisions de rangement sont conservés mais ne déterminent jamais l’emplacement physique.

## Installer dans Supabase de test

Exécuter dans cet ordre, chaque fichier complet dans une nouvelle requête du SQL Editor :

1. `supabase/migrations/014_physical_locations.sql` : colonnes et historique protégé.
2. `supabase/migrations/015_location_counts.sql` : comptage depuis les appareils.
3. `supabase/migrations/016_device_locations.sql` : affectation des appareils.
4. `supabase/migrations/017_located_stock.sql` : transferts et mouvements des quantités.

Les migrations 001 à 013 doivent déjà être installées. Les quatre nouveaux scripts peuvent être rejoués. Aucun stock n’est supprimé ou réinitialisé. Les quantités existantes restent inchangées et sont initialement « À localiser ». Les appareils existants sont également « À localiser ». Ne pas déduire MI / CS des anciens codes de service.

## Utilisation

- **Appareils individuels** : cliquer sur le stock, modifier un appareil et choisir son emplacement. Le numéro de série et les dates restent facultatifs. Le total MI / CS est calculé depuis les appareils actifs, quel que soit leur état de disponibilité. La liste des appareils possède son propre filtre d’emplacement ; un ajout reprend ce filtre, ou « À localiser » si aucun filtre n’est choisi.
- **Quantités** : bouton « MI / CS », ou clic sur le stock puis « Répartir / transférer MI / CS » pour une référence regroupant plusieurs lignes. Choisir une origine, une destination, une quantité et un motif. Exemple : 30 tuyaux MI, 20 CS, total 50 ; transfert de 5 MI vers CS → 25 MI, 25 CS, total 50.
- **Répartition initiale** : transférer les unités « À localiser » vers MI ou CS, sans créer d’entrée supplémentaire.
- **Entrée/sortie** : choisir l’emplacement de réception ou de retrait. Le total change ; une affectation au CS d’un matériel existant doit être un transfert.
- **Correction** : saisir le nombre réellement constaté pour l’emplacement choisi. Les autres emplacements ne changent pas.
- **Création de matériel** : les unités initiales sont « À localiser », puis réparties depuis le stock ou les fiches des appareils.

Une quantité négative, un dépassement du stock d’origine et une répartition obsolète sont refusés. Les opérations utilisent un verrou de référence, une comparaison de l’état attendu et un identifiant de requête pour éviter les doubles enregistrements. Les écritures directes par les utilisateurs restent interdites.

Les anciennes opérations d’entrée ajoutent des unités à localiser. Une ancienne sortie/correction ne peut pas réduire le total en dessous des unités déjà réparties ; l’interface actuelle demande toujours l’emplacement. Pour convertir des quantités déjà réparties en suivi individuel, remettre d’abord leur répartition en « À localiser », puis affecter les appareils : la conversion refuse de perdre une répartition connue.

## Indicateurs et historique

Le filtre d’emplacement porte sur le nombre d’unités réellement présentes. Il recalcule le stock, la disponibilité, les alertes et les garanties des seuls appareils de cet emplacement. Les références sans unité à cet emplacement sont masquées. Le seuil d’alerte de la référence reste celui utilisé sur le périmètre sélectionné.

Les trois compteurs MI / CS / À localiser suivent tous les filtres actifs. Sous le chiffre du stock, « Total » donne la répartition complète de la référence ; le chiffre cliquable correspond au périmètre filtré. Les fiches et actions de gestion ouvrent toujours les données complètes, sans enregistrer par erreur un stock partiel filtré.

Les transferts de quantités sont conservés dans `stock_location_events`, les entrées et sorties dans `stock_movements` également. Les affectations des appareils figurent dans les instantanés avant/après de `stock_device_events`. Tous ces historiques sont soumis aux droits membres. L’historique des répartitions affiché concerne les quantités et reste indépendant des filtres.
