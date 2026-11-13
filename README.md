# Frungz

Jeu de tir à la troisième personne dans un quartier de Paris (Three.js) : mode Domination, Brigade contre Frungz, casse de vitrines, butin, receleur, voitures, motos et skates, parkour, manette PS4.

- `npm install` puis `npm run build` : construit `dist/` (le site statique).
- `npm run dev` : build puis serveur local sur http://localhost:8124
- Mise en ligne : chaque push sur `main` est déployé par Vercel sur https://frungz.vercel.app

Assets : personnages et armes Quaternius (CC0), sons CC0 (voir `public/assets/sfx/LICENCES.md`), voitures (voir `public/assets/cars/VEHICULES-LICENCES.md`). Motos et skateboards : modélisés dans le code (`src/deuxroues.js`), formes génériques sans marque.

## Voitures : nitro, bonus, saut en marche

- Nitro : `Maj` (R1 / L3 à la manette, bouton Nitro au tactile). La jauge bleue sous la vitesse se remplit en dérapant et en frôlant voitures et passants.
- Bonus posés sur la chaussée, ramassés en roulant dessus : bouteille de nitro (jauge pleine), caisse à outils (réparation), sac de billets, plaques de blindage (30 s, dégâts réduits).
- Sauter d'une voiture en marche : `F` au-delà de 20 km/h. Plongeon et roulade, ou à grande vitesse chute à plat, roulé-boulé et relevé (`MX_BailRoll`, `MX_BailFlat`). La voiture garde l'accélérateur bloqué et fonce sur l'adversaire visé (repère rouge « Sauter : voiture sur … »), puis explose au choc.
- Bord de carte : barrages de chantier (blocs béton, barrières, « ROUTE BARRÉE ») posés automatiquement là où les rues sortent de la carte. Frotter un mur ne stoppe plus la voiture : seul un choc de face l'abîme.
- Code : `src/conduite.js`. Test : `node test/conduite.cjs "http://localhost:8124/?map=paris" dossier` (`ZONE=x0,x1,z0,z1` pour choisir la ligne droite).

## Motos et skates

`F` (□ à la manette) près d'une moto ou d'un skate pour monter, encore `F` pour descendre.

- Motos : sportive, roadster, scooter (Frungz et rues), motos de service à la base de la Brigade (prises sans crochetage par la Brigade). Elles s'inclinent dans les virages ; `Espace` (✕) bloque la roue arrière pour faire dériver. Un choc fort éjecte le pilote, la moto se couche.
- Skates : côté Frungz et autour des places. Avancer pour pousser, reculer pour freiner, `Espace` (✕) pour un ollie (monter sur un trottoir ou un banc). Une bordure prise de face ou un mur font tomber.
- Tests : `node test/ride.cjs http://localhost:8124/ prefixe` (conduite) et `node test/ride-shots.cjs http://localhost:8124/ planche.png` (pilotes vus de côté).

## Jouer en ligne entre amis

`Inviter` dans le salon ouvre ton salon en ligne (code `FRZ-XXXX`). Tes amis ouvrent ton lien (`?equipe=FRZ-XXXX`) ou tapent le code : ils prennent les places libres de ton équipe et suivent ton camp. Tu lances la partie avec `JOUER`, elle démarre chez tout le monde.

- Le chef (celui dont c'est le code) fait tourner les bots, les zones, le score et le temps ; chaque joueur décide de son propre perso. Un tir est calculé chez le tireur, les dégâts sont appliqués par le « propriétaire » de la cible (le chef pour un bot, l'ami pour son perso), qui annonce la mort à tous. Code : `src/net.js` (+ `netOwns`, `updatePuppet`, `netShot` dans `src/game.js`).
- Transport : Supabase Realtime (broadcast + présence), projet Supabase de Sabri, clé publique anon. Quota gratuit : 100 messages/s et 2 millions de messages par mois (environ 10 h de jeu à trois). Pour plus de joueurs, prévoir un transport Cloudflare Durable Objects (même interface join/send/track/leave).
- En ligne, l'équipe est limitée à 20 contre 20 (messages plus légers). Pas encore synchronisés : voitures, vitrines, butin, barricades, lancers et atouts de série (chacun les voit chez soi ; leurs dégâts, eux, passent bien).
- Tests sans Supabase : `node test/relay.cjs 8125 &` puis `node test/online.cjs http://localhost:8124/` (3 navigateurs : salon, lancement, positions, tirs, morts, départ) et `node test/online-shots.cjs http://localhost:8124/ dossier` (captures). Dans le navigateur : `?net=ws://localhost:8125&profil=a` (relais) ou `?net=local&profil=a` (onglets), `profil` sépare les sauvegardes.

## App Mac (`mac/`)

Frungz en application Mac (Electron : Chromium + Metal). L'app ouvre le jeu publié sur frungz.vercel.app, donc chaque mise en ligne du jeu y arrive toute seule ; sans internet, elle joue la copie embarquée au moment de la construction. Plein écran, carte graphique dédiée forcée, pas de ralentissement en arrière-plan, souris capturée, manette.

- Construire, installer dans `~/Applications` et lancer : `cd mac && npm run app`
- Menu Jeu : recharger la dernière version, jouer hors ligne, images/s sans plafond.
- Banc d'essai app contre navigateurs (même build, même partie) : `cd mac && npm run bench` → `mac/bench/*.json`. Dans le jeu : `?bench=40` lance une partie seule et mesure les images/s.
