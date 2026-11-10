# Frungz

Jeu de tir à la troisième personne dans un quartier de Paris (Three.js) : mode Domination, Brigade contre Frungz, casse de vitrines, butin, receleur, voitures, motos et skates, parkour, manette PS4.

- `npm install` puis `npm run build` : construit `dist/` (le site statique).
- `npm run dev` : build puis serveur local sur http://localhost:8124
- Mise en ligne : chaque push sur `main` est déployé par Vercel sur https://frungz.vercel.app

Assets : personnages et armes Quaternius (CC0), sons CC0 (voir `public/assets/sfx/LICENCES.md`), voitures (voir `public/assets/cars/VEHICULES-LICENCES.md`). Motos et skateboards : modélisés dans le code (`src/deuxroues.js`), formes génériques sans marque.

## Motos et skates

`F` (□ à la manette) près d'une moto ou d'un skate pour monter, encore `F` pour descendre.

- Motos : sportive, roadster, scooter (Frungz et rues), motos de service à la base de la Brigade (prises sans crochetage par la Brigade). Elles s'inclinent dans les virages ; `Espace` (✕) bloque la roue arrière pour faire dériver. Un choc fort éjecte le pilote, la moto se couche.
- Skates : côté Frungz et autour des places. Avancer pour pousser, reculer pour freiner, `Espace` (✕) pour un ollie (monter sur un trottoir ou un banc). Une bordure prise de face ou un mur font tomber.
- Tests : `node test/ride.cjs http://localhost:8124/ prefixe` (conduite) et `node test/ride-shots.cjs http://localhost:8124/ planche.png` (pilotes vus de côté).
