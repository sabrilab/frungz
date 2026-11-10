# Mannequins des skins

Le jeu n'utilise plus de persos tout faits : les skins sont fabriqués en code (`src/skins.js`) sur deux mannequins, `public/assets/chars/Base_M.glb` et `Base_F.glb`,
tirés du pack Quaternius « Universal Base Characters » (CC0) : corps complet, yeux, sourcils et 6 coiffures, au squelette du jeu.

1. Décompresser le pack dans `../pack/src/` (à côté du dépôt) : `base/` (dossier « Godot - UE » : glTF + .bin), `tex/` (`T_Superhero_Male_Ligh.png`, `T_Superhero_Female_Light_BaseColor.png`), `hair/` (glTF « Rigged to Head Bone » + `T_Hair_1/2_BaseColor.png`).
2. Servir le dossier parent : `npx http-server .. -p 8140`.
3. `node tools/build-chars/run-base.cjs public/assets/chars`

`base.html` remet le corps dans la pose de repos des anciens persos (`ref/Paysan.glb`, `ref/Paysanne.glb`) : les animations (`mx.json`) et la prise des armes (`GRIP`) restent justes sans rien recuire.
Les couleurs de la peau sont cuites par sommet ; coiffures et sourcils en niveaux de gris (teintés par le skin).

Contrôle visuel des skins : `npm run build`, `npx http-server dist -p 8124`, puis `node test/studio.cjs [ids] [dossier]`.

---

Ancien assemblage (tenues médiévales, n'est plus utilisé par le jeu) :

# Assemblage des personnages

Construit les persos du jeu (`public/assets/chars/*.glb`) à partir de deux packs Quaternius (CC0) :
« Modular Character Outfits – Fantasy » (tenues, sans tête) et « Universal Base Characters » (tête, yeux, cheveux, barbe).

1. Décompresser dans `../pack/src/` (à côté du dépôt) : `outfits/` (glTF du dossier Outfits et textures BaseColor, dont `T_Peasant_2` et `T_Ranger_3`), `base/` (glTF « Godot - UE » et BaseColor), `hair/` (glTF « Rigged to Head Bone »).
2. Servir le dossier parent : `npx http-server .. -p 8140`.
3. `node tools/build-chars/run.cjs public/assets/chars [dossier de captures]` (liste dans `chars.json` : tenue, texture, base, cheveux, couleur des cheveux).

Ce que fait `index.html` : garde la tête et le cou du corps de base, recale les cheveux sur l'os de la tête, cuit les textures en couleurs par sommet (le jeu fusionne chaque perso en un seul maillage sans texture), renomme les os comme dans le jeu (Hips, Torso, UpperArmL…) et exporte un GLB.

Après un changement de squelette : recuire les anims (`tools/bake-anims`, `node run.cjs Paysan …`) et recalibrer la prise de l'arme (`node calib.cjs Paysan /frungz/public/assets/anims/mx.json`, valeur `GRIP` dans `src/assets.js`).
