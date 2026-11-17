# Cartes générées depuis un plan

Une carte = un fichier de plan (`cartes/<id>/plan.json`). Tout le reste en sort, sans recopie à la main :

```
node cartes/plan.mjs centre        # plan vu de dessus : cartes/centre/plan.svg
node cartes/construire.mjs centre  # modèle 3D, gameplay, scripts Blender
```

`construire.mjs` écrit :

- `public/assets/centre/map.glb` : le modèle chargé par le jeu, fusionné par matière et par case de 40 m (le jeu écarte les cases hors champ) ;
- `public/assets/centre/gameplay.json` : collisions, étages et toit (plateformes), escaliers (rampes), zones, départs, bases, boutiques et butin, places de voiture ;
- `cartes/centre/scene-compact.py` : la même carte pour Blender ou Higgsfield 3D Jutsu (12 Ko) ; `scene.py` en est la version développée.

Noms qui comptent pour le jeu : `sol_*` (on marche dessus), `VITRINE_<id>` (verre cassable), `BUTIN_<id>` (objet à voler), `decor_lointain*`.

## Frungz Plaza (`centre`)

Centre commercial en L sur deux niveaux, parking avec conteneurs, toit accessible par trois escaliers. 20 contre 20, trois zones (A galerie nord, B passerelle est à l'étage, C kiosque du parking). 8 000 triangles.

Projet Higgsfield : « Frungz Plaza (carte du jeu) ». Le script `scene-compact.py` s'y colle tel quel dans une opération Python ; le fichier `.blend` s'y télécharge pour retoucher à la main.

Test : `node test/centre.cjs http://localhost:8124/ [dossier de captures]`.
