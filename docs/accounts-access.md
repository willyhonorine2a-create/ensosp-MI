# Authentification et accès au magasin

## Deux rôles

- **Lecteur** : consulte le tableau de bord, les stocks MI / CS, les historiques, les photos et les fiches des appareils. Les formulaires de consultation sont en lecture seule.
- **Administrateur** : dispose de la consultation, des modifications de stock et de matériel, des photos, des catégories et de la gestion des demandes et rôles.

Un compte authentifié en attente ou refusé n'a aucun accès aux données du magasin. L'appartenance à `stock_members` indique un accès approuvé et sa colonne `role` définit les droits. Les rôles proviennent exclusivement de cette table ; aucune métadonnée envoyée lors de l'inscription n'accorde de privilège.

## Installation sur le projet Supabase de test

Les migrations 001 à 017 doivent déjà être installées. Exécuter les fichiers complets dans cet ordre :

1. `018_access_requests.sql` crée les rôles, les demandes, le déclencheur d'inscription et l'audit des décisions.
2. Amorcer le premier administrateur depuis le SQL Editor avec le propriétaire de la base. Le fichier personnalisé fourni à Willy inclut cette opération dans l'étape 1, en utilisant son UUID Auth existant. Ne pas promouvoir tous les membres ni choisir automatiquement le premier inscrit.
3. `019_admin_writes.sql` impose le rôle administrateur sur les neuf RPC d'écriture existantes, leurs tables et les téléversements de photos. Leurs signatures et leurs transactions sont conservées. L'injection du contrôle vérifie la présence du corps attendu et échoue intégralement si une fonction ne correspond plus ; elle ne s'applique qu'aux neuf signatures explicitement listées.
4. `020_list_accounts.sql` ajoute la liste paginée réservée aux administrateurs.
5. `021_decide_accounts.sql` ajoute les décisions et recharge le cache API.

Les quatre pièces jointes `comptes-acces-etape-1.sql` à `-4.sql` regroupent ces opérations avec l'amorçage du compte existant de Willy. Chaque fichier tient sous 4 Ko. Exécuter les quatre dans l'ordre, puis actualiser la preview. Aucun matériel ou historique n'est supprimé. Les membres existants deviennent lecteurs, sauf le compte explicitement amorcé administrateur. Rejouer les migrations conserve les décisions et les rôles existants.

Pour un autre environnement, exemple d'amorçage réservé au SQL Editor après 018 :

```sql
begin;
-- Remplacer par l'UUID Auth vérifié du gestionnaire de cet environnement.
insert into public.stock_members(user_id,role)
values ('UUID_DU_GESTIONNAIRE','admin')
on conflict(user_id) do update set role='admin';
update public.stock_access_requests set status='approved',decided_at=now()
where user_id='UUID_DU_GESTIONNAIRE';
commit;
```

Ne pas rejouer les anciennes migrations de définition des fonctions et des photos après 019 ; respecter l'ordre des migrations.

## Configuration Supabase Auth

Dans Authentication → Sign In / Providers, activer Email et l'inscription des nouveaux utilisateurs. Conserver **Confirm email** activé pour vérifier la maîtrise de l'adresse.

Dans Authentication → URL Configuration, ajouter l'origine de la preview suivie de `/` aux URL de redirection autorisées. L'application transmet cette adresse dans `emailRedirectTo`. Configurer aussi Site URL avec l'adresse de l'application choisie pour les confirmations. Lors de la future promotion manuelle, ajouter l'adresse de production. Aucune clé secrète ni mot de passe Supabase n'est nécessaire dans le navigateur.

La confirmation des adresses et les e-mails sont gérés par Supabase Auth, avec les limites de son fournisseur d'envoi. L'application ne décide pas qu'une adresse est confirmée. Un administrateur peut refuser une demande non confirmée ; il ne peut l'approuver qu'après confirmation de l'adresse. Actualiser la liste après confirmation.

## Parcours

1. La personne choisit « Demander un compte » et saisit nom, adresse et mot de passe (12 caractères minimum dans l'interface).
2. La création du compte Auth crée automatiquement une demande `pending`, y compris lorsque la confirmation e-mail est encore attendue.
3. Après confirmation de l'adresse, la personne peut se connecter pour consulter l'état de sa demande. Elle ne voit pas le stock tant que sa demande n'est pas approuvée.
4. Dans « Comptes et accès », l'administrateur filtre les demandes, choisit lecteur ou administrateur, puis accepte ou refuse. Les comptes autorisés permettent aussi de modifier le rôle ou retirer l'accès. L'interface demande confirmation avant d'accorder des droits administrateur ou de retirer/refuser un accès.
5. La personne actualise son accès. Un utilisateur autorisé peut ensuite utiliser le magasin selon son rôle.

L'administrateur ne peut pas modifier son propre accès depuis l'interface ou la RPC. Les décisions sont sérialisées, vérifient l'état attendu et conservent un audit avant/après. Les requêtes répétées avec le même identifiant sont sans double effet. Le compte SQL propriétaire reste le recours pour amorcer/restaurer un administrateur.

Le retrait supprime l'autorisation dans `stock_members`, pas le compte Auth ni les historiques. Les lectures et écritures suivantes sont immédiatement contrôlées en base ; l'actualisation efface l'écran privé pour un compte retiré. Les données déjà consultées, et les liens de photos déjà signés pour une heure, ne peuvent pas être retirés rétroactivement du navigateur.

## Inventaire public

`/inventaire/` est une page statique sans formulaire, sans SDK Supabase et sans données. L'entrée « Inventaire » du menu ouvre cette page, accessible sans connexion. Le tableau de stock actuel est conservé dans la vue d'ensemble sous « Stock du magasin » ; aucune donnée n'est rendue publique. La future fonction d'inventaire pourra être développée dans cet espace indépendamment de la gestion privée.

## Validation

Les tests SQL vérifient l'inscription sans privilège, la lecture seule, les neuf RPC d'écriture, l'accès anonyme et en attente/refusé, l'interdiction de s'auto-promouvoir, les décisions rejouées et obsolètes, les photos et la conservation des rôles après réinstallation. Les essais navigateur couvrent inscription, lecture seule des sous-fiches, approbation/refus/changement de rôle, retrait et effacement de session privée, et la page publique sans appel Supabase. Ils utilisent des données de test ; aucun compte réel n'est créé par ces essais.
