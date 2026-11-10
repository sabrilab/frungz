# Assemblage des personnages

Construit les persos du jeu (`public/assets/chars/*.glb`) à partir de deux packs Quaternius (CC0) :
« Modular Character Outfits – Fantasy » (tenues, sans tête) et « Universal Base Characters » (tête, yeux, cheveux, barbe).

1. Décompresser dans `../pack/src/` (à côté du dépôt) : `outfits/` (glTF du dossier Outfits et textures BaseColor, dont `T_Peasant_2` et `T_Ranger_3`), `base/` (glTF « Godot - UE » et BaseColor), `hair/` (glTF « Rigged to Head Bone »).
2. Servir le dossier parent : `npx http-server .. -p 8140`.
3. `node tools/build-chars/run.cjs public/assets/chars [dossier de captures]` (liste dans `chars.json` : tenue, texture, base, cheveux, couleur des cheveux).

Ce que fait `index.html` : garde la tête et le cou du corps de base, recale les cheveux sur l'os de la tête, cuit les textures en couleurs par sommet (le jeu fusionne chaque perso en un seul maillage sans texture), renomme les os comme dans le jeu (Hips, Torso, UpperArmL…) et exporte un GLB.

Après un changement de squelette : recuire les anims (`tools/bake-anims`, `node run.cjs Paysan …`) et recalibrer la prise de l'arme (`node calib.cjs Paysan /frungz/public/assets/anims/mx.json`, valeur `GRIP` dans `src/assets.js`).
