# Couleurs des centres de secours

Palette reprise du document fourni par le gestionnaire :

| Centre | Fond | Texte |
| --- | --- | --- |
| ALPHA | Jaune `#ffff00` | Sombre |
| BRAVO | Cyan `#00b0f0` | Sombre |
| CHARLIE | Vert `#00b050` | Sombre |
| ECHO | Rouge `#ff0000` | Sombre |
| GOLF | Gris `#d0cece` | Sombre |
| HOTEL | Orange `#c55a11` | Noir |
| INDIA | Noir `#000000` | Blanc |

La palette commune est définie dans `src/centers.js`. Les noms des centres restent
lisibles et affichés ; la couleur ne remplace jamais le libellé. Le contraste
texte/fond de chaque combinaison est vérifié à au moins 4,5:1.

Les couleurs s'appliquent aux cartes de centres, badges des engins, fiches,
filtres et choix d'affectation, historiques de changement de centre, formulaire
public et confirmation de signalement, suivi administrateur et sélecteurs de QR.
Une précision de rangement correspondant exactement à un centre nommé (par exemple
`CS ALPHA`) est également colorée dans la fiche du matériel du magasin.

MUTUALISE, OPE, les noms inconnus et le regroupement générique « CS » conservent
une présentation neutre : aucune couleur spécifique n'a été fournie pour eux.
Les valeurs en base, les droits, les filtres et les quantités ne sont pas modifiés.
Aucune migration SQL ni mise à jour des fonctions Supabase n'est nécessaire.
