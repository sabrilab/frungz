// Données de jeu : camps, armes, raretés, butin, améliorations.
export const TEAMS = {
  ordre: { name: 'LA BRIGADE', short: 'Brigade', color: '#3d8bff', base: 'Commissariat', skins: ['Swat', 'Suit', 'Adventurer', 'Worker'] },
  civils: { name: 'LES FRUNGZ', short: 'Frungz', color: '#34c759', base: 'Planque', skins: ['Beach', 'King', 'Punk', 'Farmer', 'Casual_Hoodie', 'Casual_2', 'Spacesuit'] },
};
export const SKIN_NAMES = { Swat: 'CRS', Suit: 'BAC en civil', Adventurer: 'Gendarme rando', Worker: 'Agent de voirie', Beach: 'Touriste en tongs', King: 'Roi du quartier', Punk: 'Punk à chien', Farmer: 'Fermier égaré', Casual_Hoodie: 'Le Sweat', Casual_2: 'Le Voisin', Spacesuit: 'Cosmonaute' };

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

// armes : dégâts, cadence (coups/s), dispersion (rad), chargeur, rechargement (s), portée, plombs, recul, son, modèle OBJ
export const WEAPONS = {
  pistol: { name: 'Pistolet', icon: '🔫', model: 'Pistol_1', dmg: 22, rps: 4.5, spread: 0.012, mag: 12, reload: 1.1, range: 70, pellets: 1, kick: 0.012, sound: 'pistol', auto: false, price: 0, hand: 'pistol' },
  smg: { name: 'Mitraillette', icon: '💨', model: 'SubmachineGun_1', dmg: 15, rps: 12, spread: 0.03, mag: 32, reload: 1.6, range: 55, pellets: 1, kick: 0.009, sound: 'smg', auto: true, price: 1500 },
  shotgun: { name: 'Fusil à pompe', icon: '💥', model: 'Shotgun_1', dmg: 13, rps: 1.2, spread: 0.075, mag: 6, reload: 2.2, range: 30, pellets: 9, kick: 0.05, sound: 'shotgun', auto: false, price: 2500 },
  rifle: { name: "Fusil d'assaut", icon: '🎯', model: 'AssaultRifle_1', dmg: 24, rps: 8.5, spread: 0.016, mag: 30, reload: 1.9, range: 110, pellets: 1, kick: 0.013, sound: 'rifle', auto: true, price: 4000 },
  sniper: { name: 'Fusil de précision', icon: '🔭', model: 'SniperRifle_1', dmg: 95, rps: 0.9, spread: 0.002, mag: 5, reload: 2.6, range: 220, pellets: 1, kick: 0.07, sound: 'sniper', auto: false, price: 6500, scope: true },
  revolver: { name: 'Le Frungz', icon: '👑', model: 'Revolver_1', dmg: 58, rps: 2, spread: 0.006, mag: 6, reload: 1.8, range: 90, pellets: 1, kick: 0.04, sound: 'revolver', auto: false, price: 9000, hand: 'pistol' },
};

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
  sac: { name: 'Bras solides', desc: 'Moins ralenti quand tu portes un objet', icon: '🎒', max: 4, price: (l) => 800 * (l + 1) },
  gilet: { name: 'Gilet renforcé', desc: '+25 armure au départ par niveau', icon: '🦺', max: 4, price: (l) => 1000 * (l + 1) },
  socles: { name: 'Socles de planque', desc: '+2 emplacements d\'exposition', icon: '🏛️', max: 3, price: (l) => 1500 * (l + 1) },
  mats: { name: 'Caisse à outils', desc: 'Barricades : −3 s de recharge par niveau', icon: '🧰', max: 3, price: (l) => 600 * (l + 1) },
};
