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
- 370 lampadaires et 279 terrasses cassables sont des objets séparés : environ 650 objets à dessiner à eux seuls.

Pistes, de la plus rentable à la moins rentable (à confirmer par une mesure sur une vraie carte graphique, `?bench=40`) :

1. Personnages : 100 persos animés en 50 contre 50. Baisser le défaut (30 contre 30), animer moins souvent les persos lointains.
2. Objets à dessiner : regrouper lampadaires et terrasses par instances, ne les séparer qu'au moment où ils cassent.
3. Îlots B et N : version simplifiée vue de loin.
4. Carte : couper le sud (zones I et J), ou en faire une variante « Paris centre ». Gain modeste en triangles, net en téléchargement et en trajets à vide.
5. Feuillages : moins de triangles par arbre.

Déjà fait : la scène 3D n'est plus dessinée quand l'armurerie ou la boutique couvre l'écran.
