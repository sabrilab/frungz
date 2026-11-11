# Atelier d'animations Mixamo

Recible des clips de la bibliothèque privée `sabrilab/mixamo-library` (1 808 anims) sur le squelette des Modular Men (Quaternius), les compose, et écrit `public/assets/anims/mx.json`.

1. Cloner `frungz` et `mixamo-library` côte à côte, puis servir leur dossier parent : `npx http-server .. -p 8140`.
2. Copier ce dossier en `../bake/` (les chemins des pages sont relatifs à la racine servie).
3. `node run.cjs /frungz/public/assets/chars/Base_M.glb ../frungz/public/assets/anims/mx.json` (nom d'un perso de `public/assets/chars` ou chemin servi d'un GLB au même squelette) (lit `plan.json`, ou un plan passé en 4e argument).
4. Contrôle visuel : `node planche.cjs out.png /frungz/public/assets/anims/mx.json "MX_Run,MX_Roll" 6 0` (une ligne par clip, 6 instants ; dernier argument 1 = vue de côté).
5. En situation dans le jeu : `node test/moves.cjs http://localhost:8124/ out.png 0.5 1` (planche 1 : pistolet, couches haut du corps ; planche 2 : morts, roulade, glissade, casse, danse).

## Le plan (`plan.json`)

Une entrée par clip du jeu : `name` (nom dans le jeu) et `src` (nom Mixamo, voir `viewer/index.json` ou `catalogue/PACKS.md` de la bibliothèque). Options de composition :

| option | effet |
| --- | --- |
| `inPlace: false` | garde l'avancée horizontale (morts) ; sinon le jeu déplace lui-même le perso |
| `mirror: true` | miroir gauche ↔ droite (crée le côté manquant d'une anim) |
| `upper: "clip"` | haut du corps pris dans un autre clip (ex. jambes de pas chassés + bras « en joue ») ; `upperMirror` pour le refléter |
| `seq: [{src, trim, mirror, speed, reverse}, …]` + `blend` | enchaîne plusieurs clips avec fondu (ex. sprint → glissade → relevé) |
| `trim: [début, fin]` | coupe (secondes) |
| `speed`, `reverse` | vitesse figée dans le clip, lecture à l'envers |
| `exag: 1.2` | amplification : amplifie l'écart de chaque os à sa pose moyenne (jambes, bassin, buste, tête ; `exagAll` pour tout, `exagHips` pour le rebond du bassin) |
| `loop: true` | raccorde la fin au début pour une boucle sans à-coup |
| `upperOnly: true` | ne garde que le haut du corps : couche « U_ » posée par le jeu par-dessus la course (recharger, lancer, dégainer, célébrer) |
| `spineOnly`, `additive: true` | couche additive « A_ » (écart à la 1re image) ajoutée à la pose courante : coups reçus, recul |

## Ce que le jeu en fait (`src/game.js`)

- `locomotion()` : mélange marche/course 4 directions calé sur la vitesse réelle (table `STRIDE`), allure pistolet (`MXP_*`) quand l'arme en main est un pistolet ou un revolver, accroupi 4 directions.
- `animate()` : dérapage en fin de sprint (`MX_Stop`), roulade de réception après une grosse chute (`MX_HardLand`), glissade (`MX_Slide`), roulade (`MX_Roll`), sauts, danses de fin de partie pour l'équipe gagnante.
- `overlay()` / `applyOverlays()` : couches U_ et A_ (rechargement calé sur la durée de l'arme, lancer de grenade, dégainer, coups reçus selon le côté de l'impact, recul plus fort au fusil à pompe et au sniper, poing levé après une élimination ou une série).
- `deathAnim()` : chute selon le côté de l'impact, projeté en arrière (fusil à pompe de près, explosion, métro, parfois à la tête), emporté par l'élan en pleine course.
- `startChannel()` : coup de crosse pour casser une vitrine (`MX_Smash`), fouille pour ramasser ou voler (`MX_Loot`).

## Couches écrites à la main (`src/anim.js`)

Posées après le mixer, par-dessus les clips : pieds attachés aux chevilles (les pieds du rig sont des os libres), IK des jambes, adaptation au sol, pieds plantés à l'arrêt avec petits pas quand on pivote, corps qui penche dans l'accélération et les virages, bassin qui s'écrase à la réception, buste et tête qui mènent le virage, souffle selon l'effort, recul et impacts en ressorts. Complètes à moins de 40 m de la caméra, pieds seuls au-delà. Contrôle image par image : `node test/strip.cjs URL out.png run|walk|idle|startstop|turn|strafe|jump|fire|hit|aimup|spin [n] [pas s] [side|front|back|34]`.

## Colonne et cou

Les membres sont recalés sur la direction des os Mixamo (poses de repos différentes : T contre A). La colonne et le cou (`Hips`, `Abdomen`, `Torso`, `Chest`, `Neck`, liste `KEEP_CURVE`) ne le sont pas : ils reçoivent l'écart à la pose de repos Mixamo et gardent la courbure naturelle du perso. Sinon la cambrure du squelette Mixamo s'impose au corps (bassin basculé en arrière, haut du dos enroulé) et les persos paraissent bossus.
