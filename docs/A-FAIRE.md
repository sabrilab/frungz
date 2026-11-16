# À faire (demandes notées, pas encore commencées)

## 1. Réglages et pause (Échap / Start en jeu)

- Une fenêtre claire, rangée par rubriques : commandes, visée, image, son, jeu.
- Configuration des touches au clavier/souris et à la manette : plusieurs configurations prédéfinies, plus une configuration personnalisée où chaque action se réassigne.
- Point de départ : `src/input.js` (tables `KEYS`, `PAD`, libellés `KB`, `PS`, `TOUCH`) et le panneau `#pause` créé dans `src/main.js`.

## 2. Commander les troupes (50 contre 50)

- Le joueur dirige son camp : ordre d'attaquer une zone, de défendre une zone, de se regrouper ; des bots plus dangereux quand ils suivent un ordre.
- Point de départ : l'IA des bots dans `src/game.js` (`ai.task`, `ai.target`, choix de zone), la carte (`M`) et les marqueurs de zone du HUD.
- À cadrer avant de coder : qui obéit (escouade proche ou tout le camp), comment on vise la zone (roue d'ordres, carte), ce que voient les amis en ligne.

## 3. Alléger le jeu

Mesures sur la carte de Paris (`public/assets/map.glb`), novembre 2026 :

- 1,8 million de triangles, 2 119 objets à dessiner, zone jouable de 248 × 460 m.
- La moitié sud (tour, bassin, parvis : z de −100 à −342) ne contient que 2 zones sur 10 (I et J) et aucun point d'apparition. Mais elle ne pèse que 322 000 triangles (18 %). La couper divise la surface par deux sans diviser la charge par deux.
- Le centre (z de −100 à +100) pèse 1,18 million de triangles (66 %) : îlots B et N (630 000), feuillages du mobilier (162 000).
- Décor lointain et horizon, hors limites jouables : 194 000 triangles (11 %).
- Les 633 objets cassables (lampadaires, terrasses…) sont déjà fusionnés par matière au chargement (`src/cassables.js`) : une vingtaine d'objets à dessiner. Revers : chaque maillage fusionné couvre toute la carte, donc il est dessiné en entier à chaque image, même ce qui est derrière le joueur. Même défaut pour le mobilier (`mobilier_leaf` : 162 000 triangles en un seul bloc).

### Fait

- **Niveaux de détail des personnages** (`src/lod.js`). Le corps d'un perso fait 45 000 triangles ; trois versions allégées (≈ 11 000, 3 500 et 1 500) sont calculées une fois par tenue et choisies selon la distance (7 m, 19 m, 44 m, zoom de la lunette compris). Mesure à 50 contre 50, qualité basse (`test/charge.cjs`) : 1,79 million de triangles par image → 1,26 million (−29 %, −34 % au centre). Les persos ajoutaient 570 000 triangles, ils en ajoutent 40 000.
- **Personnages que personne ne voit** (hors champ ou cachés par la distance) : squelette non recalculé à chaque image, pose rafraîchie 6 fois par seconde. Calcul des squelettes : −35 à −39 % (`test/pas-vus.cjs`). Effet sur la mise à jour du jeu : dans le bruit de mesure.
- La scène 3D n'est plus dessinée quand l'armurerie ou la boutique couvre l'écran.

Essayé puis retiré : figer les matrices des objets fixes de la carte (aucun gain mesurable).

Banc d'essai sur le Mac de test (Brave, 1702×989 à 75 %, qualité basse), avant ces changements : 20,9 images/s à 50 contre 50, 35,8 à 5 contre 5. À refaire après (`?bench=40`, puis `?bench=40&n=5`).

### Reste à faire, du plus rentable au moins rentable

1. Décor : 1,2 million de triangles par image même sans personnage. Découpage en secteurs des gros blocs (mobilier, feuillages, décor lointain : 690 000 triangles jamais écartés), puis version simplifiée des îlots vus de loin.
2. Carte : couper le sud (zones I et J) ou en faire une variante « Paris centre ».
3. Nombre de joueurs par défaut : 30 contre 30 quand la machine ne suit pas.
4. Mode Zombies : mêmes niveaux de détail pour les zombies.

Outils : `test/charge.cjs` (objets et triangles par image), `test/profil.cjs` et `test/profil-rendu.cjs` (temps par fonction, sur un build non minifié).

