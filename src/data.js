// Données de jeu : camps, armes, raretés, butin, améliorations.
import { BUILTIN_SKINS } from './skins-data.js';
export const TEAMS = {
  ordre: { name: 'LA BRIGADE', short: 'Brigade', color: '#3d8bff', base: 'Commissariat', skins: BUILTIN_SKINS.filter((s) => s.team === 'ordre').map((s) => s.id) },
  civils: { name: 'LES FRUNGZ', short: 'Frungz', color: '#34c759', base: 'Planque', skins: BUILTIN_SKINS.filter((s) => s.team === 'civils').map((s) => s.id) },
};
// skins : fabriqués en code (src/skins.js) ; ceux du studio (/studio) s'ajoutent au menu au chargement
export const SKIN_NAMES = Object.fromEntries(BUILTIN_SKINS.map((s) => [s.id, s.name]));

export const RARITY = {
  commun: { name: 'Commun', color: '#b9c0c9', mult: 1, w: 60 },
  rare: { name: 'Rare', color: '#3da5ff', mult: 1.12, w: 27 },
  epique: { name: 'Épique', color: '#b45cff', mult: 1.25, w: 10 },
  legendaire: { name: 'Légendaire', color: '#ffb321', mult: 1.4, w: 3 },
};
export const RARITY_ORDER = ['commun', 'rare', 'epique', 'legendaire'];
export function rollRarity(boost = 0) {
  const w = RARITY_ORDER.map((r, i) => RARITY[r].w * (1 + boost * i)); const s = w.reduce((a, b) => a + b); let x = Math.random() * s;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return RARITY_ORDER[i]; } return 'commun';
}

// armes : dégâts, cadence (coups/s), dispersion (rad), chargeur, rechargement (s), portée, plombs, recul, son, modèle OBJ (pack Quaternius Ultimate Gun, CC0)
// cat : famille (pistolet, pm, fusil, pompe, precision, lourde) · mob : mobilité (vitesse de course) · burst : rafale de n coups par pression
// grip : position de la poignée le long de l'arme (0 crosse, 1 bouche) · support : point de la main gauche [x le long du canon depuis la poignée, y], en mètres
// veh : multiplicateur contre les véhicules et le mobilier · len : longueur réelle en mètres (taille à l'écran et dans la main)
export const WEAPONS = {
  // pistolets (arme secondaire)
  pistol: { name: 'Pistolet', ico: 'pistol', cat: 'pistolet', model: 'Pistol_1', len: 0.28, dmg: 22, rps: 4.5, spread: 0.012, mag: 12, reload: 1.1, range: 70, pellets: 1, kick: 0.012, sound: 'pistol', auto: false, price: 0, hand: 'pistol' },
  pistolet_lourd: { name: 'Pistolet lourd', ico: 'pistol', cat: 'pistolet', model: 'Pistol_3', grip: 0.25, len: 0.32, dmg: 36, rps: 2.8, spread: 0.01, mag: 8, reload: 1.4, range: 80, pellets: 1, kick: 0.03, sound: 'revolver', auto: false, price: 1200, hand: 'pistol' },
  pistolet_auto: { name: 'Pistolet automatique', ico: 'pistol', cat: 'pistolet', model: 'Pistol_5', grip: 0.25, len: 0.31, dmg: 11, rps: 14, spread: 0.04, mag: 20, reload: 1.3, range: 40, pellets: 1, kick: 0.008, sound: 'smg', auto: true, price: 1800, hand: 'pistol' },
  revolver: { name: 'Le Frungz', ico: 'revolver', cat: 'pistolet', model: 'Revolver_1', len: 0.38, dmg: 58, rps: 2, spread: 0.006, mag: 6, reload: 1.8, range: 90, pellets: 1, kick: 0.04, sound: 'revolver', auto: false, price: 9000, hand: 'pistol', casings: false },
  // pistolets-mitrailleurs
  smg: { name: 'Mitraillette', ico: 'smg', cat: 'pm', model: 'SubmachineGun_1', len: 0.59, dmg: 15, rps: 12, spread: 0.03, mag: 32, reload: 1.6, range: 55, pellets: 1, kick: 0.009, sound: 'smg', auto: true, price: 1500, mob: 1.04 },
  pm: { name: 'PM de patrouille', ico: 'smg', cat: 'pm', model: 'SubmachineGun_2', grip: 0.63, len: 0.65, dmg: 16, rps: 11, spread: 0.022, mag: 30, reload: 1.7, range: 65, pellets: 1, kick: 0.008, sound: 'smg', auto: true, price: 2200, mob: 1.03 },
  compact: { name: 'PM compact', ico: 'smg', cat: 'pm', model: 'SubmachineGun_3', grip: 0.64, len: 0.5, dmg: 12, rps: 15, spread: 0.042, mag: 25, reload: 1.4, range: 40, pellets: 1, kick: 0.007, sound: 'smg', auto: true, price: 1800, mob: 1.08 },
  // fusils d'assaut
  rifle: { name: "Fusil d'assaut", ico: 'rifle', cat: 'fusil', model: 'AssaultRifle_1', len: 1.04, dmg: 24, rps: 8.5, spread: 0.016, mag: 30, reload: 1.9, range: 110, pellets: 1, kick: 0.013, sound: 'rifle', auto: true, price: 4000 },
  carabine: { name: 'Carabine tactique', ico: 'rifle', cat: 'fusil', model: 'AssaultRifle2_1', grip: 0.28, len: 0.99, dmg: 22, rps: 9.5, spread: 0.013, mag: 30, reload: 1.8, range: 120, pellets: 1, kick: 0.011, sound: 'rifle', auto: true, price: 4500 },
  rafale: { name: 'Fusil à rafales', ico: 'rifle', cat: 'fusil', model: 'AssaultRifle_5', grip: 0.29, len: 1.01, dmg: 27, rps: 14, spread: 0.011, mag: 30, reload: 2.1, range: 115, pellets: 1, kick: 0.01, sound: 'rifle', auto: false, burst: 3, burstPause: 0.28, price: 5000 },
  fusil_lourd: { name: 'Fusil d\'assaut 7,62', ico: 'rifle', cat: 'fusil', model: 'AssaultRifle_2', grip: 0.29, len: 1.06, dmg: 33, rps: 6.5, spread: 0.02, mag: 25, reload: 2.2, range: 105, pellets: 1, kick: 0.021, sound: 'heavy', auto: true, price: 5500, mob: 0.97 },
  // fusils à pompe
  shotgun: { name: 'Fusil à pompe', ico: 'shotgun', cat: 'pompe', model: 'Shotgun_1', len: 1.12, dmg: 13, rps: 1.2, spread: 0.075, mag: 6, reload: 2.2, range: 30, pellets: 9, kick: 0.05, sound: 'shotgun', auto: false, price: 2500, hs: 1.5 },
  pompe_court: { name: 'Pompe de brèche', ico: 'shotgun', cat: 'pompe', model: 'Shotgun_ShortStock', grip: 0.07, len: 0.85, dmg: 12, rps: 1.4, spread: 0.085, mag: 5, reload: 2, range: 22, pellets: 9, kick: 0.055, sound: 'shotgun', auto: false, price: 3000, hs: 1.5, veh: 2.5, mob: 1.03 },
  semi_auto: { name: 'Fusil semi-automatique', ico: 'shotgun', cat: 'pompe', model: 'Shotgun_3', grip: 0.32, len: 1.16, dmg: 10, rps: 3, spread: 0.07, mag: 8, reload: 2.6, range: 28, pellets: 8, kick: 0.04, sound: 'shotgun', auto: false, price: 4200, hs: 1.5 },
  canon_scie: { name: 'Canon scié', ico: 'shotgun', cat: 'pompe', model: 'Shotgun_SawedOff', len: 0.65, dmg: 15, rps: 3.5, spread: 0.11, mag: 2, reload: 1.5, range: 15, pellets: 10, kick: 0.07, sound: 'shotgun', auto: false, price: 2000, hs: 1.5, veh: 2, mob: 1.05, casings: false },
  // précision (lunette)
  dmr: { name: "Fusil de tireur d'élite", ico: 'sniper', cat: 'precision', model: 'SniperRifle_2', grip: 0.31, len: 1.24, dmg: 52, rps: 2.4, spread: 0.004, mag: 10, reload: 2.3, range: 190, pellets: 1, kick: 0.04, sound: 'dmr', auto: false, price: 5800, scope: true, zoom: 4, mob: 0.97 },
  sniper: { name: 'Fusil de précision', ico: 'sniper', cat: 'precision', model: 'SniperRifle_1', len: 1.36, dmg: 95, rps: 0.9, spread: 0.002, mag: 5, reload: 2.6, range: 220, pellets: 1, kick: 0.07, sound: 'sniper', auto: false, price: 6500, scope: true, mob: 0.95 },
  calibre50: { name: 'Fusil antimatériel', ico: 'sniper', cat: 'precision', model: 'SniperRifle_5', grip: 0.23, len: 1.65, dmg: 150, rps: 0.6, spread: 0.002, mag: 5, reload: 3.4, range: 260, pellets: 1, kick: 0.11, sound: 'heavy50', auto: false, price: 9500, scope: true, veh: 3, mob: 0.88 },
  // lourdes
  mitrailleuse: { name: 'Fusil-mitrailleur', ico: 'lmg', cat: 'lourde', model: 'Bullpup_1', grip: 0.48, support: [0.34, 0.024], len: 1.12, dmg: 25, rps: 10, spread: 0.028, mag: 75, reload: 3.6, range: 120, pellets: 1, kick: 0.012, sound: 'lmg', auto: true, price: 7000, mob: 0.88, veh: 1.3 },
};
for (const [id, W] of Object.entries(WEAPONS)) { W.id = id; W.mob ??= 1; W.veh ??= 1; W.hs ??= 2; W.casings ??= true; }
export const WEAPON_CATS = { pistolet: 'Pistolets', pm: 'Pistolets-mitrailleurs', fusil: "Fusils d'assaut", pompe: 'Fusils à pompe', precision: 'Précision', lourde: 'Armes lourdes' };

// classes : arme principale et secondaire par défaut, protection, vitesse, équipement et un atout propre
// atouts : cap (vitesse de capture des zones), casse (dégâts aux vitrines, barricades, mobilier), spot (ennemis touchés marqués), reload (vitesse de rechargement),
// kg (charge du sac), sprint (élan en course), souffle (lunette tenue plus longtemps)
export const CLASSES = {
  ordre: {
    intervention: { name: 'Intervention', role: 'Assaut', ico: 'rifle', primary: 'carabine', secondary: 'pistol', armor: 50, speed: 1, nades: 2, frags: 1, perk: { cap: 1.35 }, perkName: 'Prise de zone', perkDesc: 'capture les zones 35 % plus vite' },
    breche: { name: 'Brèche', role: 'Choc', ico: 'shotgun', primary: 'pompe_court', secondary: 'pistolet_lourd', armor: 100, speed: 0.93, nades: 1, frags: 2, perk: { casse: 2.5 }, perkName: 'Bélier', perkDesc: 'barricades, vitrines et véhicules cèdent bien plus vite' },
    precision: { name: "Tireur d'élite", role: 'Précision', ico: 'sniper', primary: 'dmr', secondary: 'pistol', bots: 0.4, armor: 25, speed: 1, nades: 1, frags: 1, perk: { spot: 8, souffle: 1.6 }, perkName: 'Repérage', perkDesc: 'tout ennemi touché reste marqué 8 s pour ton camp' },
    appui: { name: 'Appui', role: 'Soutien', ico: 'lmg', primary: 'mitrailleuse', secondary: 'pistol', armor: 75, speed: 0.92, nades: 3, frags: 1, perk: { reload: 0.75 }, perkName: 'Ravitaillement', perkDesc: 'recharge 25 % plus vite, une lacrymo de plus' },
  },
  civils: {
    casseur: { name: 'Casseur', role: 'Assaut', ico: 'rifle', primary: 'fusil_lourd', secondary: 'pistol', armor: 25, speed: 1, nades: 2, frags: 1, perk: { casse: 2 }, perkName: 'Masse', perkDesc: 'vitrines, mobilier et barricades cèdent deux fois plus vite' },
    voltigeur: { name: 'Voltigeur', role: 'Mobilité', ico: 'smg', primary: 'compact', secondary: 'pistolet_auto', armor: 0, speed: 1.1, nades: 2, frags: 0, perk: { sprint: 1.35, cap: 1.15 }, perkName: 'Parkour', perkDesc: 'court plus vite et garde son élan plus longtemps' },
    braqueur: { name: 'Braqueur', role: 'Choc', ico: 'shotgun', primary: 'canon_scie', secondary: 'pistolet_lourd', armor: 50, speed: 0.97, nades: 1, frags: 2, perk: { kg: 14 }, perkName: 'Gros bras', perkDesc: 'porte 14 kg de plus sans ralentir' },
    guetteur: { name: 'Guetteur', role: 'Précision', ico: 'sniper', primary: 'sniper', secondary: 'pistol', bots: 0.4, armor: 25, speed: 1, nades: 1, frags: 1, perk: { spot: 8, souffle: 1.6 }, perkName: 'Œil du toit', perkDesc: 'tout ennemi touché reste marqué 8 s pour ton camp' },
  },
};
for (const t of Object.values(CLASSES)) for (const [id, C] of Object.entries(t)) C.id = id;
export function classOf(team, id) { const T = CLASSES[team]; return T[id] || Object.values(T)[0]; }

// butin des boutiques : type → icône, nom, valeur de base (€), poids (kg)
export const LOOT = {
  sac: { icon: '👜', names: ['Sac Maison Vernet', 'Cabas en croco', 'Pochette Lumière'], v: 900, kg: 1.5 },
  montre: { icon: '⌚', names: ['Montre Chronoflan', 'Tourbillon Doré', 'Montre de plongée'], v: 1400, kg: 0.3 },
  bijou: { icon: '💎', names: ['Collier Étoile', 'Bague Solitaire', 'Diadème Frungz'], v: 1800, kg: 0.2 },
  parfum: { icon: '🧴', names: ['Eau de Pavé', 'Nuit sur la Seine', 'Essence de Métro'], v: 260, kg: 0.5 },
  telephone: { icon: '📱', names: ['Frungphone 15', 'Pliable Pro', 'Téléphone en or'], v: 700, kg: 0.3 },
  tv: { icon: '📺', names: ['Télé OLED 77"', 'Projecteur 4K'], v: 1100, kg: 14 },
  vetement: { icon: '🧥', names: ['Manteau Haute Couture', 'Baskets Édition Limitée', 'Foulard de soie'], v: 450, kg: 1 },
  vin: { icon: '🍾', names: ['Grand Cru 1982', 'Champagne Millésimé', 'Cognac XO'], v: 380, kg: 1.4 },
  art: { icon: '🖼️', names: ['Tableau de maître', 'Sculpture moderne'], v: 2600, kg: 6 },
  baskets: { icon: '👟', names: ['Baskets Frungz x Lune', 'Sneakers Dorées'], v: 520, kg: 1 },
  sneakers: { icon: '👟', names: ['Sneakers édition limitée'], v: 600, kg: 1 },
  chaussures: { icon: '👠', names: ['Escarpins'], v: 900, kg: 1 },
  bague: { icon: '💍', names: ['Bague solitaire'], v: 2500, kg: 0.05 },
  foulard: { icon: '🧣', names: ['Carré de soie'], v: 450, kg: 0.1 },
  console: { icon: '🎮', names: ['Console de jeu'], v: 550, kg: 3 },
  casque: { icon: '🎧', names: ['Casque audio'], v: 350, kg: 0.4 },
  tableau: { icon: '🖼️', names: ['Tableau de maître'], v: 6000, kg: 5 },
  sculpture: { icon: '🗿', names: ['Sculpture moderne'], v: 5000, kg: 8 },
  valise: { icon: '🧳', names: ['Valise de luxe'], v: 2200, kg: 4 },
  tablette: { icon: '📲', names: ['Tablette'], v: 900, kg: 0.6 },
  lingot: { icon: '🪙', names: ["Lingot d'or"], v: 12000, kg: 1 },
  default: { icon: '📦', names: ['Objet de valeur'], v: 500, kg: 1 },
  frungz: { icon: '🐸', names: ["Le Frungz d'Or"], v: 9000, kg: 3 }, // l'objet légendaire de la livraison spéciale
};
export const LUXE_TYPES = ['sac', 'montre', 'bijou', 'parfum', 'vetement', 'art', 'baskets'];
export const COMMERCE_TYPES = ['telephone', 'tv', 'vin', 'parfum', 'baskets', 'vetement'];
export const SHOP_NAMES = {
  luxe: ['MAISON VERNET', 'LUMIÈRE JOAILLIER', 'CHRONOFLAN', 'ATELIER SAINT-HONORÉ', 'BIJOUX DE LA LUNE', 'GALERIE PAVÉ', 'HAUTE FRUNGZ'],
  commerce: ['FRUNGZ PHONE', 'CAVE DES MARTYRS', 'TÉLÉ-BARBÈS', 'BASKET PALACE', 'PARFUMERIE ROQUETTE'],
};

// améliorations permanentes (banque)
export const UPGRADES = {
  sac: { name: 'Bras solides', desc: 'Moins ralenti quand tu portes un objet', icon: '🎒', ico: 'bag', max: 4, price: (l) => 800 * (l + 1) },
  gilet: { name: 'Gilet renforcé', desc: '+25 armure au départ par niveau', icon: '🦺', ico: 'vest', max: 4, price: (l) => 1000 * (l + 1) },
  socles: { name: 'Socles de planque', desc: '+2 emplacements d\'exposition', icon: '🏛️', ico: 'base', max: 3, price: (l) => 1500 * (l + 1) },
  mats: { name: 'Caisse à outils', desc: 'Barricades : −3 s de recharge par niveau', icon: '🧰', ico: 'barricade', max: 3, price: (l) => 600 * (l + 1) },
};
