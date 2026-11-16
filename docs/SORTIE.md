# Frungz : ce qu'il reste avant la sortie commerciale

État au 16 novembre 2026. Le jeu est riche et stable en solo : 3 cartes, modes Domination et Zombies, véhicules, jeu en ligne entre amis, tests automatisés de partie complète. La boutique de cosmétiques est en place (voir plus bas). Ce document liste ce qu'il faut régler pour **vendre** en ligne, par ordre d'urgence.

## 1. Bloquant avant d'encaisser le premier euro

| # | Sujet | Pourquoi | Que faire |
|---|---|---|---|
| 1 | **Entreprise et pages légales** | Vendre exige un vendeur identifié, des CGV, des mentions légales et une politique de confidentialité. | Créer la structure (micro-entreprise ou SAS), puis compléter les passages surlignés de `public/legal/*.html`. Choisir un médiateur de la consommation (obligatoire). Faire relire par un juriste. |
| 2 | **Compte joueur récupérable** | Aujourd'hui, l'identité boutique est un secret gardé dans le navigateur. Si le joueur vide son navigateur ou change d'appareil, **il perd ses achats**. C'est la première source de litiges et de remboursements. | Ajouter une connexion par e-mail (lien magique Supabase Auth, ou Google/Apple) et rattacher le compte boutique existant à cet e-mail. |
| 3 | **Fraude au remboursement** | Si un joueur paie, dépense ses jetons puis fait un remboursement ou un litige bancaire, ses jetons repassent à 0 mais **il garde les objets achetés**. | Dans `rembourser()` (`supabase/boutique.sql`) : marquer le compte (`bloque = true`) et retirer les articles achetés après le paiement. Dans `api/boutique.mjs` : refuser les achats d'un compte bloqué. |
| 4 | **Classification d'âge** | Fusillades réalistes, thème police contre émeutiers, casse de vitrines : on vise probablement **PEGI 16 ou 18**. La plupart des portails et des stores l'exigent. | Faire une demande IARC (gratuite, via les stores ou les portails web). Afficher la classification sur l'accueil, avec une vérification d'âge simple. |
| 5 | **Sujet sensible** | Le thème « Brigade contre émeutiers » avec marquage POLICE peut faire refuser le jeu par des portails ou des régies publicitaires, et faire réagir les médias. | Décider en connaissance de cause. Options : garder « Brigade » fictive sans « POLICE » réel, éviter les uniformes trop proches des CRS ou de la BAC, ou assumer le thème et préparer une communication. |

## 2. Important dans le premier mois

| # | Sujet | Détail |
|---|---|---|
| 6 | **Progression côté serveur** | XP, banque € et armes sont calculées dans le navigateur, donc modifiables par n'importe qui. Pour le moment, cela touche surtout les **récompenses en jetons du passe de saison**, que le serveur accorde sans pouvoir vérifier l'XP. C'est limité à 450 jetons gratuits et 1 600 premium par saison, mais à corriger : le serveur doit compter l'XP lui-même (fin de partie signée par le chef de salon, plafond d'XP par heure). |
| 7 | **Jeu en ligne** | Il tourne sur le quota gratuit de Supabase Realtime : 2 millions de messages par mois, soit environ 10 h de jeu à trois. Au lancement, ça casse en quelques jours. Il faut passer à l'offre payante de Supabase (25 $/mois) ou à Cloudflare Durable Objects (déjà prévu dans `src/net.js`). Voitures, vitrines et butin ne sont pas encore synchronisés en ligne. |
| 8 | **App iPhone** | Apple impose ses propres achats intégrés (StoreKit) pour les biens numériques. Dans l'app, la boutique masque déjà l'achat de jetons par Stripe. Pour vendre dans l'app, il faut brancher StoreKit, par exemple avec RevenueCat (qui a un plugin Capacitor), avec une commission Apple de 15 à 30 %. Sinon, sortir d'abord en web uniquement. |
| 9 | **Mesure et suivi des erreurs** | Il n'y a ni analytics ni remontée d'erreurs. Sans ça, impossible de savoir où les joueurs décrochent ou ce qui plante chez eux. Ajouter Sentry (erreurs) et Plausible ou PostHog (audience, sans cookie publicitaire, donc sans bandeau RGPD lourd). |
| 10 | **Premier chargement** | Les assets pèsent 66 Mo (carte, personnages, animations) et le code 1,8 Mo. Sur un réseau mobile, le premier chargement est long : afficher le salon avant la carte, charger les tenues premium à la demande. |
| 11 | **Licences des assets** | Quaternius (CC0) et sons CC0 : OK. Mixamo : utilisation commerciale autorisée dans un jeu, mais pas de redistribution des fichiers bruts. La voix Azure est payante au-delà du palier gratuit. Garder la liste des licences à jour dans les mentions légales. |

## 3. Monétisation en place (cette version)

- **Deux monnaies.** La banque € est gagnée en jouant et achète armes, améliorations et cosmétiques communs. Les jetons s'achètent en vrai argent ou se gagnent dans le passe de saison, et n'achètent que des cosmétiques.
- **Catalogue** (`src/boutique-data.mjs`) :
  - 17 camouflages d'arme, dont 4 animés.
  - 7 tenues premium.
  - 7 traçantes.
  - 6 effets d'élimination.
  - 2 lots.
  - Une vitrine du jour qui change à minuit.
- **Passe de saison** : 25 paliers avec une piste gratuite et une piste premium à 950 jetons. La piste premium rend 1 600 jetons au total, ce qui pousse à racheter le passe suivant.
- **Packs** : 4,99 € (500 jetons), 9,99 € (1 100), 19,99 € (2 400), 49,99 € (6 500), plus un pack de démarrage unique à 4,99 € (300 jetons, une tenue et un camouflage).
- **Garde-fous** :
  - Rien de payant ne donne d'avantage en partie.
  - Aucune boîte au hasard payante, à cause du risque réglementaire (Belgique, et France avec l'ANJ).
  - Case de renonciation au délai de rétractation obligatoire avant paiement (art. L221-28).
  - Prix toujours relus côté serveur.
  - Webhook Stripe signé et idempotent.
  - Remboursements pris en compte.
- **Visible par les autres** : les amis en ligne voient ton camouflage, ta traçante, ton effet et ta tenue. C'est ce qui fait vendre.
- **Mode démo** : sans configuration serveur (en local, par exemple), la boutique marche entièrement mais n'encaisse rien. Elle affiche alors une étiquette « DÉMO ».

### Activer les vrais paiements

1. **Supabase** : créer un projet (région UE), ouvrir le SQL Editor et exécuter `supabase/boutique.sql`.
2. **Stripe** : créer et activer le compte (pièce d'identité, IBAN), puis créer un webhook vers `https://frungz.vercel.app/api/stripe-webhook` avec les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded` et `charge.dispute.created`.
3. **Vercel**, dans Settings → Environment Variables :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (la clé service_role, jamais dans le jeu)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - et, au besoin, `BOUTIQUE_ORIGINS` (les adresses autorisées pour le retour après paiement).
4. Faire un essai en mode test Stripe (carte 4242 4242 4242 4242), vérifier que les jetons arrivent, puis passer les clés en mode live.

### Tests

- `node test/boutique.cjs http://localhost:8124/ [dossier]` : boutique, achat en démo, camouflage, traçante et effet en partie, aucune erreur JS ni de shader.

## 4. Idées de revenus pour la suite

- **Camouflages par arme**, au lieu d'un camouflage pour toutes les armes, et **maîtrise d'arme** : des camouflages gagnés en jouant avec une arme donnée. Ça fait jouer longtemps.
- **Porte-clés d'arme, graffitis à poser sur les murs, emotes** : le personnage a déjà des gestes (poing levé…).
- **Créateurs** : le studio de skins (`/studio`) pourrait devenir une vitrine de tenues créées par les joueurs, avec un partage des revenus.
- **Saison 2 avec une carte gratuite** : la carte attire les joueurs, le passe rapporte.
- **Pas de publicité dans les parties** : elle casse l'immersion d'un jeu de tir. À la rigueur, une vidéo récompensée facultative (+ jetons) sur l'écran de fin.
