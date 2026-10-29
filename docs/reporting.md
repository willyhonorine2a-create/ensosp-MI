# Remontées d’inventaire — projet de test uniquement

## Parcours livré

- `/signalement/` : formulaire public sans authentification, centre puis engin,
  liste unique des matériels de l’engin, manque/casse/dysfonctionnement/autre,
  quantité et description. Un matériel par signalement, sans choix de compartiment,
  sans ajout/retrait de ligne et sans téléversement de photo. Coordonnées facultatives.
  Le ZIP fourni apporte 38 illustrations de familles, conservées à l’affichage.
  Un matériel présent à plusieurs endroits ne reçoit pas arbitrairement un compartiment.
- Chaque engin et sa fiche possèdent un lien qui préremplit l’engin. L’affectation
  est relue et la révision vérifiée au moment de l’envoi ; une fiche ayant changé
  est refusée avec invitation à recharger.
- `/signalements/` : connexion des administrateurs existants, filtres, pagination,
  détail, photos privées, commentaires, statuts Nouveau/En cours/Résolu,
  historique et état des notifications. Les lecteurs ne peuvent pas consulter ces données.
- Le signalement conserve le nom, l’immatriculation et le centre au jour de l’envoi.
  Il ne modifie jamais le stock ni la dotation de référence.
- Envoi confirmé par une référence SIG-numéro, après écriture en base. La même
  tentative réémise sans changement ne crée pas de doublon ; garder la page ouverte
  après une coupure. Le mail est distinct de l’accusé d’enregistrement.

## Activation dans Supabase de TEST

Le code du formulaire seul ne suffit pas : les fonctions serveur et
la base doivent être configurés. Aucun déploiement distant ni envoi de mail n’a
été exécuté par la livraison du code. Ne pas utiliser le projet de production.

1. Après les migrations existantes 001 à 024, exécuter **025_inventory_reports.sql**
   puis **026_inventory_report_photos.sql** dans SQL Editor. Elles créent les tables
   privées, la file de notifications et le bucket privé. Aucune table temporaire.
2. Le formulaire est public et ne nécessite aucun CAPTCHA ou compte Cloudflare.
   Les limites d’envoi, le champ invisible, les contrôles de taille et la protection
   contre les doublons restent appliqués côté serveur. Sans CAPTCHA, les protections
   sont moins résistantes aux robots ; surveiller les remontées après ouverture.
3. Dans les secrets des Edge Functions du projet de test, renseigner :

| Nom | Usage |
| --- | --- |
| `REPORT_ALLOWED_ORIGINS` | Origines HTTPS exactes, séparées par des virgules, sans chemin ni slash final ; pas de `*`. |
| `REPORT_RATE_SECRET` | Secret aléatoire d’au moins 32 caractères pour anonymiser les limites d’envoi. |
| `REPORT_WORKER_SECRET` | Autre secret aléatoire d’au moins 32 caractères, utilisé uniquement par le planificateur. |
| `REPORT_EMAIL_ENABLED` | `false` tant que la recette et le choix de l’expéditeur ne sont pas terminés ; `true` pour activer les mails. |
| `RESEND_API_KEY` | Clé API Resend pour le domaine d’expédition vérifié. |
| `REPORT_EMAIL_FROM` | Adresse d’expédition autorisée par Resend. Le destinataire n’est pas l’expéditeur. |
| `PUBLIC_APP_URL` | Origine HTTPS durable ou preview de test pour les liens vers le suivi administrateur. |

Ne pas créer manuellement `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_URL` : Supabase
les fournit aux Edge Functions. Ne placer aucune clé secrète dans Vercel côté client,
dans `src/config.js`, dans SQL, dans un QR ou dans le chat. L’adresse destinataire
est fixée côté serveur : **magasin-central@ensosp.fr**. Aucun champ public ne peut
la modifier ni choisir un autre destinataire.

4. Depuis un poste disposant de Supabase CLI et d’un accès au projet de test :

```sh
supabase functions deploy inventory-report --project-ref jdxfwetfdekwxposowys
supabase functions deploy report-notifications --project-ref jdxfwetfdekwxposowys
```

`supabase/config.toml` désactive la vérification JWT de la passerelle pour ces deux
fonctions. La première vérifie elle-même l’origine, le champ invisible, les tailles et les
limites d’envoi. La seconde exige `x-report-worker-secret`. Aucune RPC de dépôt ou
de file mail n’est exécutable avec les clés anon/authenticated.

5. Les notifications automatiques nécessitent un planificateur. Dans **Supabase
Vault** du projet de test, créer `inventory_report_worker_url` (URL de la fonction
report-notifications) et `inventory_report_worker_secret` (même secret que
REPORT_WORKER_SECRET). Ne pas afficher leurs valeurs en chat. Exécuter ensuite
**027_schedule_report_notifications.sql**. Le job appelle la fonction chaque minute.
Ce script optionnel dépend des extensions pg_cron, pg_net et Vault ; il n’est pas
exécutable dans le PostgreSQL embarqué des tests. Si ces extensions ne sont pas
disponibles, configurer un planificateur de confiance qui fait le même POST HTTPS.

## Notifications et protection des données

L’enregistrement et la création du travail mail sont atomiques. Le worker réserve
cinq travaux maximum par passage, utilise une location de cinq minutes, et ne
confond pas la réussite de l’enregistrement avec celle de l’envoi. Les échecs sont
retentés avec un délai croissant, jusqu’à huit essais. Les travaux expirés au
dernier essai sont signalés comme échoués. Un administrateur peut les reprogrammer.
Les envois utilisent une clé d’idempotence Resend stable ; la garantie fournisseur
est limitée dans le temps (24 h). Reprogrammer manuellement une notification après
ce délai peut renvoyer un mail si le fournisseur l’avait accepté sans confirmation.

Les mails sont en texte simple, avec le centre, l’engin, les lignes signalées,
les coordonnées facultatives et un lien vers le suivi authentifié. Les photos ne
sont pas jointes au mail et n’ont pas d’URL publique. L’interface administrateur
crée des liens signés d’une minute, uniquement après contrôle RLS.

Les photos sont vérifiées par type, taille et signature de fichier. Le navigateur
ne téléverse rien directement dans Storage. Les signalements et leurs photos
ne sont pas listables publiquement. Le service limite les tentatives à dix par
heure et par clé réseau anonymisée, et cent par heure globalement. Il suppose que
la passerelle Supabase fixe le dernier saut de `x-forwarded-for` ; vérifier ce
comportement avant activation. Aucun service CAPTCHA n’est appelé. Les adresses IP brutes ne sont pas enregistrées.

La politique de conservation doit être fixée par le gestionnaire avant ouverture
au public. Aucune suppression automatique de l’historique n’est activée. Après une
panne réseau lors d’une écriture, des photos peuvent rester sans signalement :
leur suppression doit se faire par l’API Storage, après vérification de l’absence
de référence dans inventory_reports.photos (pas par suppression SQL des métadonnées).

## QR et transition Microsoft Forms

Dans `/signalements/`, un administrateur peut générer et télécharger un QR PNG
pour tout le parc, un centre ou un engin donné. La valeur proposée est la variable publique
`PUBLIC_REPORT_FORM_URL` du build ; à défaut, l’adresse de la preview courante.
**Un QR de preview sert uniquement aux essais.** Les codes sont générés localement,
sans envoyer l’adresse à un service QR externe.

Pour des affiches durables, décider d’une adresse HTTPS contrôlée par l’ENSOSP,
par exemple une route de redirection institutionnelle vers `/signalement/`.
Renseigner alors cette adresse dans PUBLIC_REPORT_FORM_URL avant génération.
Le QR Microsoft Forms existant ne peut pas être réencodé à distance : remplacer
les affiches, et ajouter dans l’ancien Forms un lien de transition si son édition
est possible. Aucune modification du formulaire Microsoft n’a été effectuée.

## Recette requise avant ouverture

1. Tester un engin avec fiche et un engin sans fiche ; vérifier la liste des matériels, la saisie « Autre matériel » et l’absence de sélection de compartiment ou de pièce jointe.
2. Envoyer sans CAPTCHA sur la preview de test, vérifier le numéro et la ligne
   Supabase ; simuler une coupure et réessayer sans fermer la page.
3. Vérifier qu’un visiteur et un lecteur ne voient ni coordonnées ni photos.
4. Depuis un administrateur, traiter, commenter, résoudre et consulter l’historique.
5. Avec l’expéditeur validé et les mails activés, vérifier réception à l’adresse
   générique et lien administrateur, puis simuler un échec fournisseur et sa reprise.
6. Scanner le QR depuis un téléphone. Choisir l’URL durable avant impression.

Les tests automatisés utilisent PostgreSQL/PGlite et des réponses de service mail
simulées. Ils ne prouvent ni le déploiement des Edge Functions, ni les droits DNS,
ni la livraison réelle d’un mail. Aucun déploiement de production n’est autorisé
par cette livraison.

## Installation sans ZIP et sans terminal

Les fichiers `docs/deploiement/inventory-report.ts` et
`docs/deploiement/report-notifications.ts` sont des versions autonomes générées
à partir des sources ci-dessus. Ils ne contiennent aucune clé secrète. Sur GitHub,
utiliser **Copy raw file** pour copier chaque fichier complet.

Dans le projet Supabase de test, ouvrir **Edge Functions**, créer une fonction
avec l’éditeur, et nommer la première **inventory-report**. Remplacer tout le
contenu du fichier `index.ts` proposé par celui de la version autonome correspondante,
puis déployer. Faire de même pour **report-notifications**. Désactiver pour chacune
la vérification JWT de la passerelle dans les paramètres : le dépôt public vérifie
le champ invisible, les quotas et l’origine, et le worker exige son secret dédié. Le service reste
inactif tant que les secrets décrits plus haut ne sont pas configurés.

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà injectées
par Supabase : ne pas en saisir de nouvelles, ni les copier depuis le tableau de bord.
Les clés supplémentaires se renseignent uniquement dans **Edge Functions → Secrets**.
Ne pas les mettre dans le fichier de code ou dans le chat.

Pour maintenir ces versions autonomes après modification des fonctions serveur :

```sh
node scripts/prepare_edge_editor.mjs
```

Le déploiement par l’éditeur ne constitue pas une vérification du formulaire ni
de l’envoi mail : poursuivre la configuration et la recette de test ci-dessus.

## Passage de la version Turnstile à la version sans CAPTCHA

Remplacer le code de la fonction Supabase **inventory-report** avec la version
autonome actuelle de `docs/deploiement/inventory-report.ts`, puis déployer.
La fonction **report-notifications** ne change pas. Aucune migration SQL
supplémentaire n’est nécessaire. La preview doit également utiliser le dernier
commit de develop pour que le formulaire n’attende plus le widget.

`TURNSTILE_SECRET_KEY` et `PUBLIC_TURNSTILE_SITE_KEY`, si elles avaient été
créées, ne sont plus utilisées. Ne pas toucher aux secrets nécessaires aux
notifications. Les deux réglages encore nécessaires au dépôt sont
`REPORT_ALLOWED_ORIGINS` et `REPORT_RATE_SECRET` dans Supabase Edge Functions
Secrets. Le service refuse les envois tant qu’ils ne sont pas configurés.

## Formulaire simplifié

La simplification concerne le formulaire public. Aucune nouvelle migration SQL
ou mise à jour de fonction Supabase n’est nécessaire : il envoie une seule ligne
et une liste de photos vide. Les anciens signalements, leurs photos et leur suivi
administrateur sont conservés. Le serveur reste compatible avec les anciennes
versions du formulaire ; ses plafonds de taille restent en place.
