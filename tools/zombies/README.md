# Zombies : conversion des persos Mixamo

Produit `public/assets/zombies/<id>.glb` (rodeur, policier, femme, soldat, contamine, decharne, mastodonte) à partir de la bibliothèque privée `mixamo-library` (modèles `Mixamo Models/`, clips `Mixamo Animations/Liam@zombie_*` et `CreaturePackBeta/Beta@mutant_*`).

## Régénérer

1. `frungz` et `mixamo-library` côte à côte (ici dans `/home/user`), `npm ci` dans `frungz`.
2. Servir leur dossier parent : `cd frungz && npx http-server /home/user -p 8150` (les pages chargent `/frungz/node_modules/three/...` et `/mixamo-library/...`).
3. `node tools/zombies/build.cjs` (ou `node tools/zombies/build.cjs rodeur femme` pour quelques-uns). GLB bruts dans `$TMPDIR/zombies-raw`, fichiers finaux dans `public/assets/zombies/`.
4. Contrôle : `node tools/zombies/verify.cjs planche.png /frungz/public/assets/zombies '[["z_idle",0.3],["z_walk",0.25],["z_run",0.5],["z_attack",0.2],["z_death",1]]' rodeur policier femme soldat contamine decharne mastodonte` : recharge chaque GLB (GLTFLoader + MeshoptDecoder), vérifie os, clips, hauteur, pieds au sol, pas d'explosion, et dessine une planche.

## Fichiers

- `build.cjs` : liste des modèles (id, FBX, taille cible) et des clips ; lance la page puis `optimize.mjs`.
- `build.js` (dans la page) : charge le FBX, garde les 52 os Mixamo standard (os du visage, `_End`, `4` : poids reportés sur l'ancêtre gardé), noms sans préfixe (`Hips`, `LeftArm`…), fusionne les sous-maillages par texture en un seul `SkinnedMesh` `corps`, met à l'échelle (pieds à y=0, face à +Z), texture 1024 px (JPEG, ou PNG puis WebP si la découpe alpha sert vraiment → `alphaTest` 0,5).
  Clips **reciblés** (rotations monde, membres réalignés sur la direction des os de Liam ; indispensable pour `Zombie.fbx` dont les axes d'os diffèrent), `Hips.position` mis à l'échelle (rapport des hauteurs de bassin), sur place (dérive X/Z linéaire retirée ; `z_death` garde sa chute), boucles raccordées (idle, idle2, walk, run, crawl). Calcule `userData` : `stride` (avancée d'origine par cycle, en m), `hit` (instant du coup : pic de vitesse main/tête/pied puis allonge max), `hits` (tous les coups du clip).
- `optimize.mjs` : gltf-transform (dedup, resample, prune, meshopt + quantification) et remplacement des PNG par les WebP.
- `verify.js` / `verify.cjs` : contrôle et planche ; `drv.cjs` + `lab.html` : pilote Playwright commun.
