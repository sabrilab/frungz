# Véhicules de Frungz

40 véhicules low-poly, tous **CC0** (aucune attribution obligatoire), prêts pour Three.js.

| Dossier | Pack | Véhicules |
|---|---|---|
| `quaternius-cars/` | Quaternius Cars Pack | 2 coupés sport, police, taxi, 2 berlines, SUV |
| `quaternius-post-apocalypse/` | Quaternius Zombie Apocalypse Kit | sportive, **sportive blindée**, pick-up (+ blindé), camion (+ blindé) |
| `rgsdev-low-poly-vehicles/` | rgsdev Free Low Poly Vehicles | coupé sport, cabriolet, 2 muscle cars, compacte, berline, police, taxi, SUV, pick-up, fourgon, ambulance |
| `kenney-car-kit/` | Kenney Car Kit 3.1 | style plus « jouet » : sportives, 2 monoplaces, police, utilitaires, pompiers… |

Le style Quaternius est le même que les personnages (Modular Men). Kenney est plus cartoon : à garder pour du fun (monoplaces) ou le décor.

Aucune réplique de voiture de marque : ce sont des sportives génériques, sans logo ni nom de constructeur.

## Fichiers

- `<pack>/game/*.glb` : **à utiliser dans le jeu.** Normalisés (voir convention), texture embarquée, un seul fichier par véhicule.
- `<pack>/_source/` : fichiers d'origine, non modifiés. `_source.sha256` : empreintes.
- `catalogue.json` : liste des véhicules (id, nom, classe, taille, triangles, position et rayon des roues).
- `apercus/` : images de contrôle (avec un perso de 1,81 m pour l'échelle).
- `tools/gameready.mjs` : le script qui fabrique `game/` à partir de `_source/` (gltf-transform 4.1).

Classes du catalogue : `sport` (les belles à voler), `civil` (trafic), `police` (camp des forces de l'ordre), `blinde`, `utilitaire`, `fun`.

## Convention des `game/*.glb`

- Unités : mètres (perso ≈ 1,81 m). Sol à `y = 0`, voiture centrée en x/z.
- Avant = **+Z**, gauche = **+X**, haut = +Y.
- Un nœud racine (nom du véhicule) avec les enfants :
  - `body` (+ parfois `spoiler`, etc.)
  - `wheel-front-left`, `wheel-front-right`, `wheel-back-left`, `wheel-back-right` : **pivot au centre de la roue**.
    `rotation.x` fait rouler, `rotation.y` fait braquer (roues avant).
  - `seat-driver` : où placer le conducteur. `door-driver` : point au sol à côté de la portière conducteur (pour le vol de voiture : marcher jusque-là, appuyer sur E).
- `extras` du nœud racine (= `userData` dans Three.js) : `size`, `wheels` (centre, rayon, largeur de chaque roue).

```js
const car = (await loader.loadAsync('vehicles/quaternius-cars/game/sportscar.glb')).scene.children[0];
const { wheels, size } = car.userData;
const fl = car.getObjectByName('wheel-front-left');
fl.rotation.y = steer;            // braquage
fl.rotation.x += speed * dt / wheels['wheel-front-left'].radius; // roulement
```

Recolorer : les Quaternius « Cars » (`Orange`, `White`…) et les rgsdev (`body red`, `body black`…) ont des matériaux de carrosserie
en couleur unie : cloner le matériau et changer sa `color` donne une nouvelle peinture. Kenney et Quaternius post-apo utilisent
une texture atlas : il faut éditer la texture ou teinter.
