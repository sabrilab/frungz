# Reciblage des animations Mixamo

Recible des clips de la bibliothèque privée `sabrilab/mixamo-library` sur le squelette des Modular Men (Quaternius) et écrit `public/assets/anims/mx.json`.

1. Cloner `frungz` et `mixamo-library` côte à côte, puis servir leur dossier parent : `npx http-server .. -p 8140`.
2. Copier ce dossier en `../bake/` (les chemins de la page sont relatifs à la racine servie).
3. `node run.cjs Punk ../frungz/public/assets/anims/mx.json`

La liste des clips (nom dans le jeu → animation Mixamo, haut du corps remplacé par la pose « en joue ») est dans `run.cjs`. L'avancée horizontale est retirée : le jeu déplace lui-même les personnages.
