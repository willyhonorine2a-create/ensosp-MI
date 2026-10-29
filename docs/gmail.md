# Notifications avec votre compte Gmail

Réception : **magasin-central@ensosp.fr** (déjà fixée dans le code).
Expédition : le compte Google qui déploie le relais ci-dessous.
Supabase enregistre les signalements et déclenche le relais ; les mails sont envoyés
par Google Apps Script avec MailApp. Aucun compte Resend, mot de passe Gmail,
clé SMTP ou accès à la lecture de la boîte Gmail n'est nécessaire.

## 1. Créer votre relais Google

1. Connectez-vous au compte Google qui doit expédier les messages.
2. Ouvrez https://script.google.com/ et créez un **Nouveau projet**.
3. Dans `Code.gs`, remplacez tout le code par le fichier
   [`integrations/gmail-notifications.gs`](../integrations/gmail-notifications.gs)
   du dépôt (GitHub → Copy raw file).
4. Dans **Paramètres du projet → Propriétés du script**, ajoutez
   `REPORT_GMAIL_SECRET` avec un nouveau secret aléatoire de 64 caractères.
   Utilisez le gestionnaire de mots de passe ou la génération locale déjà utilisée
   pour REPORT_RATE_SECRET. Ne réutilisez pas ce dernier et ne partagez pas la valeur.
5. **Déployer → Nouveau déploiement → Application Web** : exécuter en tant que
   **vous-même**, accès **Tout le monde** (la fonction contrôle un secret dédié).
6. Autorisez votre propre script à envoyer des mails avec votre compte Google.
   Aucune lecture des messages n'est utilisée. Une politique Google Workspace peut
   nécessiter l'intervention de votre service informatique pour autoriser ce déploiement.
7. Copiez l'URL d'application Web, de la forme
   `https://script.google.com/macros/s/IDENTIFIANT/exec`.

Ne testez pas le relais en divulguant son secret dans une URL : il n'accepte que
les requêtes POST et le secret reste dans le corps serveur de la requête.

## 2. Mettre à jour la fonction Supabase

Dans **Edge Functions → report-notifications → Code**, remplacer `index.ts` par
le fichier autonome actuel `docs/deploiement/report-notifications.ts`, puis déployer.
La vérification JWT de la passerelle reste désactivée pour cette fonction ;
le secret REPORT_WORKER_SECRET reste obligatoire.

Dans **Edge Functions → Secrets**, renseigner :

| Nom | Valeur |
| --- | --- |
| `REPORT_MAIL_PROVIDER` | `gmail` |
| `GMAIL_WEBAPP_URL` | URL `/exec` obtenue ci-dessus |
| `GMAIL_WEBAPP_SECRET` | Même secret que REPORT_GMAIL_SECRET dans Google |
| `REPORT_WORKER_SECRET` | Autre secret aléatoire, distinct des deux précédents |
| `PUBLIC_APP_URL` | Origine HTTPS de l'application pour les liens administrateur |
| `REPORT_EMAIL_ENABLED` | `false` jusqu'à ce que les réglages soient terminés, puis `true` pour le test réel |

RESEND_API_KEY et REPORT_EMAIL_FROM ne sont pas nécessaires avec ce mode.
Ne pas supprimer REPORT_ALLOWED_ORIGINS ou REPORT_RATE_SECRET : ils protègent
le dépôt public du formulaire et sont indépendants de l'envoi des mails.

## 3. Planification et recette réelle

Le relais ne lit jamais Supabase directement. Les notifications proviennent de
la file existante, alimentée lors de chaque signalement.

Créer dans Supabase Vault les secrets `inventory_report_worker_url` (URL de
report-notifications dans Supabase) et `inventory_report_worker_secret` (même valeur
que REPORT_WORKER_SECRET), puis appliquer le script optionnel
`027_schedule_report_notifications.sql`. La planification appelle le worker chaque
minute. Elle peut traiter les signalements de test déjà en attente ; les reconnaître
à leur description de test. Ne pas marquer les mails comme envoyés manuellement.

Faire un signalement de test, vérifier l'état de la notification dans le suivi
administrateur, la réception dans magasin-central@ensosp.fr et le lien de suivi.
Aucun mail réel n'a été envoyé pendant les tests automatisés de cette intégration.

## Limites

Les quotas Google Apps Script dépendent du compte et peuvent changer (quota de
destinataires par jour, différent entre compte personnel et Google Workspace).
Le relais vérifie le quota avant chaque envoi. En cas d'échec, Supabase conserve
la notification et réessaie selon les mêmes règles que les autres fournisseurs,
jusqu'à huit tentatives. L'administrateur peut la reprogrammer après résolution.

Le relais conserve les identifiants envoyés pendant sept jours sous verrou pour
éviter les doublons lors des reprises. Une panne entre l'envoi du mail et l'écriture
de sa confirmation peut néanmoins entraîner un doublon ; la garantie n'est pas
exactement une fois. Après sept jours, une reprogrammation manuelle peut renvoyer
le même signalement. La génération d'un QR ou l'enregistrement d'un signalement
ne prouve pas qu'un mail a été livré.
