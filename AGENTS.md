# Workflow de livraison

- Développer sur `develop` ou une branche de fonctionnalité et publier ces branches pour les previews Vercel.
- L'utilisateur effectue lui-même les mises en production manuellement.
- Ne pas pousser vers `main`, fusionner dans `main`, promouvoir une preview ni lancer de déploiement de production sans demande explicite de l'utilisateur.
- Ne pas modifier la configuration de production Vercel sans demande explicite.
- Vérifier `npm test` et `npm run build` avant de livrer une modification de l'application.
