// Catalogue de la boutique (données pures, sans three.js) : lu par le jeu (src/boutique.js) ET par le serveur (api/boutique.mjs),
// qui y vérifie les prix. Ne jamais faire confiance à un prix envoyé par le navigateur : le serveur relit ce fichier.
//
// Deux monnaies :
//  - « € » (la banque du jeu) : gagnée en jouant (casse, revente, victoires). Achète les armes, les améliorations et les cosmétiques communs.
//  - « jetons » : monnaie premium, achetée en vrai argent (packs plus bas) ou gagnée dans le passe de saison. Uniquement des cosmétiques.
// Règle d'or : rien de ce qui s'achète en jetons ne donne d'avantage en partie (pas de « pay to win »), et aucune boîte au hasard payante.

export const RARETES = {
  commun: { nom: 'Commun', couleur: '#b9c0c9' },
  rare: { nom: 'Rare', couleur: '#3da5ff' },
  epique: { nom: 'Épique', couleur: '#b45cff' },
  legendaire: { nom: 'Légendaire', couleur: '#ffb321' },
  mythique: { nom: 'Mythique', couleur: '#ff4f7b' },
};

// ---------------------------------------------------------------- camouflages d'arme
// type : motif calculé dans le shader (src/cosmetiques.js) · c : 4 couleurs · metal / rough : finition · emi : intensité lumineuse · anim : motif animé
// echelle : taille du motif (motifs par mètre d'arme)
export const CAMOS = {
  aucun: { nom: 'Usine', rarete: 'commun', type: 'aucun', desc: 'La finition d\'origine.' },
  noir_mat: { nom: 'Noir mat', rarete: 'commun', type: 'uni', c: ['#121316', '#1b1d21', '#0b0c0e', '#26282d'], metal: 0.15, rough: 0.85, prix: { eur: 4000 } },
  sable: { nom: 'Sable', rarete: 'commun', type: 'uni', c: ['#b49a6c', '#a38a5e', '#c4ab7c', '#8e7650'], metal: 0.1, rough: 0.7, prix: { eur: 4000 } },
  foret: { nom: 'Forêt', rarete: 'rare', type: 'taches', echelle: 9, c: ['#3c4a2c', '#5b6a3a', '#2a2a1f', '#7a6a45'], metal: 0.1, rough: 0.72, prix: { eur: 9000 } },
  urbain: { nom: 'Béton', rarete: 'rare', type: 'taches', echelle: 11, c: ['#5d6166', '#8a8f95', '#2d3035', '#b7bbbf'], metal: 0.15, rough: 0.7, prix: { eur: 9000 } },
  numerique: { nom: 'Numérique', rarete: 'rare', type: 'pixels', echelle: 60, c: ['#3d4651', '#5f6b78', '#22282f', '#8995a3'], metal: 0.15, rough: 0.65, prix: { eur: 12000 } },
  tigre: { nom: 'Tigre', rarete: 'epique', type: 'rayures', echelle: 14, c: ['#d9861f', '#151210', '#e9a64a', '#0a0908'], metal: 0.2, rough: 0.55, prix: { jetons: 600 } },
  carbone: { nom: 'Carbone', rarete: 'epique', type: 'carbone', echelle: 260, c: ['#16181b', '#2c3036', '#0c0d0f', '#3a3f46'], metal: 0.55, rough: 0.35, prix: { jetons: 600 } },
  tricolore: { nom: 'Tricolore', rarete: 'epique', type: 'bandes', echelle: 1, c: ['#1f3f9e', '#f2f2f2', '#d8232a', '#f2f2f2'], metal: 0.25, rough: 0.45, prix: { jetons: 800 } },
  graffiti: { nom: 'Graffiti de Belleville', rarete: 'epique', type: 'taches', echelle: 7, c: ['#ff3d7f', '#2fd3ff', '#ffe23d', '#7a3dff'], metal: 0.15, rough: 0.5, prix: { jetons: 800 } },
  damas: { nom: 'Acier de Damas', rarete: 'legendaire', type: 'damas', echelle: 40, c: ['#8f969f', '#454b53', '#c8ced6', '#2c3036'], metal: 0.95, rough: 0.25, prix: { jetons: 1200 } },
  or: { nom: 'Or 24 carats', rarete: 'legendaire', type: 'uni', c: ['#e3b23c', '#c99a2b', '#f6d27a', '#a87b1c'], metal: 1, rough: 0.18, prix: { jetons: 1500 } },
  neon: { nom: 'Néon de Pigalle', rarete: 'legendaire', type: 'neon', echelle: 18, c: ['#0b0b12', '#ff2bd6', '#00f0ff', '#14141f'], metal: 0.3, rough: 0.35, emi: 2.2, anim: true, prix: { jetons: 1500 } },
  lave: { nom: 'Coulée de lave', rarete: 'mythique', type: 'lave', echelle: 10, c: ['#15100e', '#ff5a1a', '#ffd04a', '#2a1a14'], metal: 0.2, rough: 0.6, emi: 2.6, anim: true, prix: { jetons: 2000 } },
  matiere_noire: { nom: 'Matière noire', rarete: 'mythique', type: 'cosmos', echelle: 6, c: ['#07040f', '#6b2bff', '#ff4fd8', '#ffffff'], metal: 0.4, rough: 0.3, emi: 2.4, anim: true, prix: { jetons: 2400 } },
  // récompenses du passe de saison (pas en vente directe)
  emeute: { nom: 'Nuit d\'émeute', rarete: 'epique', type: 'taches', echelle: 8, c: ['#1a1a1f', '#ff6a00', '#2c2c33', '#ffb000'], metal: 0.2, rough: 0.55, passe: true },
  diamant: { nom: 'Diamant', rarete: 'mythique', type: 'diamant', echelle: 30, c: ['#bfe9ff', '#7fc8ff', '#ffffff', '#4aa0e0'], metal: 0.9, rough: 0.06, emi: 0.5, anim: true, passe: true },
};

// ---------------------------------------------------------------- traçantes (couleur des balles)
export const TRACANTES = {
  aucune: { nom: 'Standard', rarete: 'commun', c: '#ffe9a8', desc: 'La traçante d\'origine.' },
  rouge: { nom: 'Rouge', rarete: 'rare', c: '#ff3b3b', prix: { eur: 8000 } },
  verte: { nom: 'Verte', rarete: 'rare', c: '#3dff6e', prix: { eur: 8000 } },
  bleue: { nom: 'Bleu électrique', rarete: 'epique', c: '#3db8ff', prix: { jetons: 400 } },
  violette: { nom: 'Plasma', rarete: 'epique', c: '#b45cff', prix: { jetons: 400 } },
  or: { nom: 'Or', rarete: 'legendaire', c: '#ffc83d', prix: { jetons: 600 } },
  arcenciel: { nom: 'Arc-en-ciel', rarete: 'mythique', c: 'arcenciel', prix: { jetons: 900 } },
  tricolore: { nom: 'Bleu-blanc-rouge', rarete: 'legendaire', c: 'tricolore', passe: true },
};

// ---------------------------------------------------------------- effets d'élimination (sur la cible que tu élimines)
export const EFFETS = {
  aucun: { nom: 'Aucun', rarete: 'commun', desc: 'Pas d\'effet.' },
  billets: { nom: 'Pluie de billets', rarete: 'rare', fx: 'billets', prix: { eur: 15000 } },
  confettis: { nom: 'Confettis', rarete: 'epique', fx: 'confettis', prix: { jetons: 500 } },
  eclair: { nom: 'Décharge', rarete: 'epique', fx: 'eclair', prix: { jetons: 600 } },
  flammes: { nom: 'Embrasement', rarete: 'legendaire', fx: 'flammes', prix: { jetons: 900 } },
  glitch: { nom: 'Glitch', rarete: 'legendaire', fx: 'glitch', prix: { jetons: 900 } },
  paillettes: { nom: 'Pluie d\'or', rarete: 'mythique', fx: 'paillettes', passe: true },
};

// ---------------------------------------------------------------- tenues premium
// Même format que les skins de base (src/skins-data.js) : faites avec les pièces existantes, recolorées.
const P = (id, c, c2, c3) => ({ id, ...(c ? { c } : {}), ...(c2 ? { c2 } : {}), ...(c3 ? { c3 } : {}) });
export const TENUES = [
  { id: 'p_survet_or', name: 'Survêt\' en or', rarete: 'legendaire', prix: { jetons: 1400 }, team: 'civils', body: 'M', peau: '#c99474', hair: 'Hair_Buzzed', hairColor: '#120d0a', barbe: true,
    bas: P('jogging', '#c9a227', '#111111'), pieds: P('baskets', '#f4f4f1', '#ffffff'), haut: P('sweat_zip', '#d4ab2a', '#f6e7a8', '#111111'), gilet: P('aucun'), mains: P('aucun'), tete: P('casquette', '#111111'), visage: P('aucun'), extras: ['banane'] },
  { id: 'p_neon', name: 'Néon de Pigalle', rarete: 'legendaire', prix: { jetons: 1400 }, team: 'civils', body: 'F', peau: '#e2b597', hair: 'Hair_Long', hairColor: '#1b120d',
    bas: P('jogging', '#141418', '#00f0ff'), pieds: P('montantes', '#00f0ff', '#ffffff'), haut: P('kway', '#ff2bd6', '#111111', '#141418'), gilet: P('aucun'), mains: P('gants', '#141418'), tete: P('bonnet', '#ff2bd6'), visage: P('cache_cou', '#00d5e6'), extras: ['sac'] },
  { id: 'p_fantome', name: 'Fantôme', rarete: 'epique', prix: { jetons: 1000 }, team: 'civils', body: 'M', peau: '#f1d2bd', hair: 'Hair_Buzzed', hairColor: '#2b1d14',
    bas: P('cargo', '#e9e9e4'), pieds: P('montantes', '#f4f4f1', '#dcdcd8'), haut: P('doudoune', '#efefea', null, '#d6d6d0'), gilet: P('aucun'), mains: P('gants', '#e6e6e1'), tete: P('capuche'), visage: P('masque_gaz', '#e9e9e4', '#bfc3c9'), extras: ['genouilleres'] },
  { id: 'p_supporter', name: 'Supporter', rarete: 'rare', prix: { eur: 25000 }, team: 'civils', body: 'M', peau: '#a8714f', hair: 'Hair_SimpleParted', hairColor: '#17110d', barbe: false,
    bas: P('jogging', '#1f3f9e', '#f2f2f2'), pieds: P('baskets', '#f2f2ef', '#d8232a'), haut: P('sweat', '#1f3f9e', null, '#f2f2f2'), gilet: P('aucun'), mains: P('aucun'), tete: P('bonnet', '#d8232a'), visage: P('foulard', '#f2f2f2'), extras: [] },
  { id: 'p_elite', name: 'Brigade d\'élite', rarete: 'legendaire', prix: { jetons: 1400 }, team: 'ordre', body: 'M', peau: '#c99474', hair: 'Hair_Buzzed', hairColor: '#1a1410', barbe: true,
    bas: P('cargo', '#111214'), pieds: P('rangers', '#0b0b0c', '#050505'), haut: P('veste_mo', '#121316', '#0a0a0b', '#0b0b0c'), gilet: P('tactique', '#16171a', '#c9a227'), mains: P('gants_coques', '#0c0c0d', '#c9a227'), tete: P('casque', '#111214', '#c9a227'), visage: P('aucun'), extras: ['jambieres', 'dos'] },
  { id: 'p_hiver', name: 'Unité Hiver', rarete: 'epique', prix: { jetons: 1000 }, team: 'ordre', body: 'F', peau: '#f1d2bd', hair: 'Hair_Buns', hairColor: '#6b4428',
    bas: P('cargo', '#d9dde2'), pieds: P('rangers', '#e6e8eb', '#9aa0a8'), haut: P('veste_mo', '#e4e7eb', '#aab1ba', '#c7ccd2'), gilet: P('tactique', '#cfd4da', '#9aa3ad'), mains: P('gants_coques', '#e6e8eb', '#aab1ba'), tete: P('casque', '#e4e7eb', '#7fa6c8'), visage: P('aucun'), extras: ['jambieres', 'dos'] },
  { id: 'p_commandant', name: 'Commandant', rarete: 'rare', prix: { eur: 25000 }, team: 'ordre', body: 'M', peau: '#7d4f35', hair: 'Hair_SimpleParted', hairColor: '#0e0a08', barbe: false,
    bas: P('uniforme', '#141c33'), pieds: P('rangers'), haut: P('polo', '#141c33', '#c9a227'), gilet: P('pareballes', '#141c33', '#c9a227'), mains: P('gants'), tete: P('casquette', '#141c33'), visage: P('aucun'), extras: ['dos', 'brassard'] },
];
for (const t of TENUES) t.premium = true;

// ---------------------------------------------------------------- articles : identifiant unique « type:id »
export const ARTICLES = {};
for (const [id, c] of Object.entries(CAMOS)) if (id !== 'aucun') ARTICLES['camo:' + id] = { ...c, motif: c.type, type: 'camo', id };
for (const [id, c] of Object.entries(TRACANTES)) if (id !== 'aucune') ARTICLES['trace:' + id] = { ...c, type: 'trace', id };
for (const [id, c] of Object.entries(EFFETS)) if (id !== 'aucun') ARTICLES['effet:' + id] = { ...c, type: 'effet', id };
for (const t of TENUES) ARTICLES['tenue:' + t.id] = { type: 'tenue', id: t.id, nom: t.name, rarete: t.rarete, prix: t.prix, team: t.team };
// lots : plusieurs articles moins chers ensemble
export const LOTS = {
  lot_pigalle: { nom: 'Lot Pigalle', rarete: 'legendaire', articles: ['tenue:p_neon', 'camo:neon', 'trace:violette'], prix: { jetons: 2600 } },
  lot_elite: { nom: 'Lot Brigade d\'élite', rarete: 'legendaire', articles: ['tenue:p_elite', 'camo:carbone', 'trace:or'], prix: { jetons: 2200 } },
};
for (const [id, l] of Object.entries(LOTS)) ARTICLES['lot:' + id] = { ...l, type: 'lot', id };
export const prixArticle = (aid) => ARTICLES[aid]?.prix || null;

// ---------------------------------------------------------------- packs de jetons (vrai argent, Stripe)
// prix en centimes d'euro TTC. bonus affiché = jetons en plus par rapport au premier pack.
export const PACKS = {
  p500: { nom: 'Poignée de jetons', jetons: 500, cents: 499 },
  p1100: { nom: 'Sacoche de jetons', jetons: 1100, cents: 999, bonus: '+10 %' },
  p2400: { nom: 'Sac de jetons', jetons: 2400, cents: 1999, bonus: '+20 %', top: true },
  p6500: { nom: 'Coffre de jetons', jetons: 6500, cents: 4999, bonus: '+30 %' },
  // pack de démarrage : une seule fois par compte (le serveur le vérifie)
  starter: { nom: 'Pack de démarrage', jetons: 300, cents: 499, articles: ['tenue:p_fantome', 'camo:tigre'], unique: true, bonus: 'valeur ×4' },
};

// ---------------------------------------------------------------- passe de saison
// La progression vient de l'XP gagnée en partie (tous modes). Piste gratuite pour tout le monde, piste premium débloquée par le passe.
export const SAISON = {
  id: 's1', nom: 'Saison 1 · Nuit d\'émeute', debut: '2026-12-01', fin: '2027-03-01', prix: { jetons: 950 }, xpPalier: 600,
  // [palier, piste gratuite, piste premium] ; une récompense : 'eur:n', 'jetons:n' ou un article
  paliers: [
    [1, 'eur:2000', 'camo:emeute'], [2, 'eur:2000', 'jetons:100'], [3, 'trace:rouge', 'trace:bleue'], [4, 'eur:3000', 'camo:tigre'],
    [5, 'jetons:50', 'effet:confettis'], [6, 'eur:3000', 'jetons:100'], [7, 'camo:foret', 'tenue:p_fantome'], [8, 'eur:4000', 'camo:carbone'],
    [9, 'eur:4000', 'jetons:150'], [10, 'jetons:50', 'trace:tricolore'], [11, 'eur:5000', 'camo:graffiti'], [12, 'eur:5000', 'jetons:150'],
    [13, 'camo:urbain', 'effet:eclair'], [14, 'eur:6000', 'camo:tricolore'], [15, 'jetons:100', 'tenue:p_hiver'], [16, 'eur:6000', 'jetons:200'],
    [17, 'eur:7000', 'camo:damas'], [18, 'effet:billets', 'effet:flammes'], [19, 'eur:8000', 'jetons:200'], [20, 'jetons:100', 'camo:diamant'],
    [21, 'eur:9000', 'effet:paillettes'], [22, 'eur:10000', 'jetons:300'], [23, 'camo:numerique', 'tenue:p_elite'], [24, 'eur:12000', 'camo:matiere_noire'],
    [25, 'jetons:150', 'jetons:400'],
  ],
};
