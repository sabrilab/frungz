// Catalogue des skins (données pures, sans three.js) : emplacements, pièces, skins de base, skins de l'utilisateur.
// La fabrication des vêtements est dans skins.js ; le studio (/studio) et le menu du jeu lisent ce fichier.
// ---------------------------------------------------------------- catalogue
// emplacements, dans l'ordre d'habillage (de la peau vers l'extérieur)
export const SLOTS = [
  { id: 'bas', label: 'Bas' }, { id: 'pieds', label: 'Chaussures' }, { id: 'haut', label: 'Haut' }, { id: 'gilet', label: 'Gilet' },
  { id: 'mains', label: 'Mains' }, { id: 'tete', label: 'Tête' }, { id: 'visage', label: 'Visage' },
];
// pièces : couleurs par défaut (c = principale, c2 = secondaire) ; c2 n'est proposée que si la pièce en a une
export const PIECES = {
  bas: [
    { id: 'aucun', label: 'Aucun' },
    { id: 'jean', label: 'Jean', c: '#3d5a80', c2: null },
    { id: 'jean_noir', label: 'Jean noir', c: '#26272b' },
    { id: 'jogging', label: 'Jogging', c: '#2a2c31', c2: '#2a2c31', c2label: 'Bande' },
    { id: 'cargo', label: 'Pantalon cargo', c: '#3b3f35' },
    { id: 'uniforme', label: 'Pantalon d\'uniforme', c: '#1c2741' },
  ],
  pieds: [
    { id: 'aucun', label: 'Pieds nus' },
    { id: 'baskets', label: 'Baskets', c: '#1d1e21', c2: '#e9e9e6', c2label: 'Semelle' },
    { id: 'montantes', label: 'Baskets montantes', c: '#efefec', c2: '#d8d8d4', c2label: 'Semelle' },
    { id: 'rangers', label: 'Rangers', c: '#151618', c2: '#0c0c0d', c2label: 'Semelle' },
  ],
  haut: [
    { id: 'aucun', label: 'Aucun' },
    { id: 'tshirt', label: 'T-shirt', c: '#1b1b1e' },
    { id: 'sweat', label: 'Sweat à capuche', c: '#18181b', c2: null, c3: '#3a3b40', c3label: 'T-shirt dessous', hood: true },
    { id: 'sweat_zip', label: 'Sweat zippé', c: '#2b2d33', c2: '#bfc3c9', c2label: 'Zip', c3: '#d9d7d0', c3label: 'T-shirt dessous', hood: true },
    { id: 'doudoune', label: 'Doudoune', c: '#151517', c3: '#2c2e33', c3label: 'Sweat à capuche dessous' },
    { id: 'kway', label: 'Coupe-vent', c: '#20242c', c2: '#0f1115', c2label: 'Zip', c3: '#2a2b30', c3label: 'Sweat dessous', hood: true },
    { id: 'polo', label: 'Polo d\'uniforme', c: '#1e2b4a', c2: '#2b3c63', c2label: 'Épaules' },
    { id: 'veste_mo', label: 'Veste de maintien de l\'ordre', c: '#1a2338', c2: '#121828', c2label: 'Renforts', c3: '#0f1422', c3label: 'Sous-pull' },
  ],
  gilet: [
    { id: 'aucun', label: 'Aucun' },
    { id: 'pareballes', label: 'Gilet pare-balles', c: '#14171d', c2: '#0e1014', c2label: 'Poches' },
    { id: 'tactique', label: 'Gilet tactique + épaulières', c: '#141b2b', c2: '#0d121d', c2label: 'Protections' },
    { id: 'fluo', label: 'Gilet fluo', c: '#d6df1f', c2: '#c4c8cc', c2label: 'Bandes' },
  ],
  mains: [
    { id: 'aucun', label: 'Mains nues' },
    { id: 'gants', label: 'Gants', c: '#141414' },
    { id: 'gants_coques', label: 'Gants coqués', c: '#111214', c2: '#2a2d33', c2label: 'Coques' },
  ],
  tete: [
    { id: 'aucun', label: 'Rien' },
    { id: 'casquette', label: 'Casquette', c: '#141416', c2: null },
    { id: 'bonnet', label: 'Bonnet', c: '#1a1a1d' },
    { id: 'capuche', label: 'Capuche relevée', c: null, cHint: 'couleur du haut si vide' },
    { id: 'casque', label: 'Casque de maintien de l\'ordre', c: '#1e2a42', c2: '#8a9bb0', c2label: 'Visière' },
  ],
  visage: [
    { id: 'aucun', label: 'Rien' },
    { id: 'cagoule', label: 'Cagoule', c: '#121214' },
    { id: 'foulard', label: 'Foulard', c: '#1b1b1d' },
    { id: 'cache_cou', label: 'Cache-cou remonté', c: '#232428' },
    { id: 'masque', label: 'Masque chirurgical', c: '#b9d3e6' },
    { id: 'lunettes', label: 'Lunettes de protection', c: '#1a1a1a', c2: '#8fa6b8', c2label: 'Verres' },
    { id: 'masque_gaz', label: 'Masque à gaz', c: '#1d1f22', c2: '#3a3d42', c2label: 'Filtres' },
  ],
};
export const EXTRAS = [
  { id: 'genouilleres', label: 'Genouillères', c: '#16181c' },
  { id: 'jambieres', label: 'Protège-tibias', c: '#151a26' },
  { id: 'coudieres', label: 'Coudières', c: '#16181c' },
  { id: 'sac', label: 'Sac à dos', c: '#17181b' },
  { id: 'banane', label: 'Sacoche banane', c: '#1c1d20' },
  { id: 'brassard', label: 'Brassard POLICE', c: null },
  { id: 'dos', label: 'POLICE dans le dos', c: null },
];
export const HAIRS = [
  { id: '', label: 'Rasé' }, { id: 'Hair_Buzzed', label: 'Très court' }, { id: 'Hair_SimpleParted', label: 'Court' },
  { id: 'Hair_BuzzedFemale', label: 'Court (femme)' }, { id: 'Hair_Long', label: 'Long' }, { id: 'Hair_Buns', label: 'Chignons' },
];
export const SKIN_TONES = ['#f1d2bd', '#e2b597', '#c99474', '#a8714f', '#7d4f35', '#55352a'];

// ---------------------------------------------------------------- skins de base (camp Brigade = ordre, camp Frungz = civils)
const P = (id, c, c2) => ({ id, ...(c ? { c } : {}), ...(c2 ? { c2 } : {}) });
export const BUILTIN_SKINS = [
  // Brigade
  { id: 'MO_Homme', name: 'Maintien de l\'ordre', team: 'ordre', body: 'M', peau: '#e2b597', hair: 'Hair_Buzzed', hairColor: '#2b1d14', barbe: false,
    bas: P('uniforme'), pieds: P('rangers'), haut: P('veste_mo'), gilet: P('tactique'), mains: P('gants_coques'), tete: P('casque'), visage: P('aucun'), extras: ['jambieres', 'dos'] },
  { id: 'MO_Femme', name: 'Maintien de l\'ordre (F)', team: 'ordre', body: 'F', peau: '#c99474', hair: 'Hair_Buns', hairColor: '#1d1410',
    bas: P('uniforme'), pieds: P('rangers'), haut: P('veste_mo'), gilet: P('tactique'), mains: P('gants_coques'), tete: P('casque'), visage: P('aucun'), extras: ['jambieres', 'dos'] },
  { id: 'BAC_Homme', name: 'Brigade en civil', team: 'ordre', body: 'M', peau: '#c99474', hair: 'Hair_Buzzed', hairColor: '#1a1410', barbe: true,
    bas: P('jean', '#33465f'), pieds: P('baskets', '#202124', '#d9d9d6'), haut: P('sweat_zip', '#34373e', '#9aa0a8'), gilet: P('pareballes', '#16181d'), mains: P('gants'), tete: P('casquette', '#16181d'), visage: P('aucun'), extras: ['brassard', 'dos'] },
  { id: 'Patrouille_Femme', name: 'Patrouille (F)', team: 'ordre', body: 'F', peau: '#f1d2bd', hair: 'Hair_Buns', hairColor: '#6b4428',
    bas: P('uniforme'), pieds: P('rangers'), haut: P('polo'), gilet: P('pareballes', '#1a2236'), mains: P('aucun'), tete: P('casquette', '#1c2741'), visage: P('aucun'), extras: ['dos'] },
  { id: 'Patrouille_Homme', name: 'Patrouille', team: 'ordre', body: 'M', peau: '#a8714f', hair: 'Hair_SimpleParted', hairColor: '#17110d', barbe: false,
    bas: P('uniforme'), pieds: P('rangers'), haut: P('polo'), gilet: P('pareballes', '#1a2236'), mains: P('gants'), tete: P('aucun'), visage: P('aucun'), extras: ['dos'] },
  // Frungz
  { id: 'Bloc_Cagoule', name: 'Cagoulé', team: 'civils', body: 'M', peau: '#e2b597', hair: 'Hair_Buzzed', hairColor: '#2b1d14',
    bas: P('jean_noir'), pieds: P('baskets', '#141416', '#2a2a2c'), haut: P('sweat', '#141416'), gilet: P('aucun'), mains: P('gants'), tete: P('capuche'), visage: P('cagoule'), extras: [] },
  { id: 'Casquette_Foulard', name: 'Casquette et foulard', team: 'civils', body: 'M', peau: '#a8714f', hair: 'Hair_Buzzed', hairColor: '#120d0a', barbe: false,
    bas: P('jogging', '#1f2024', '#e6e6e6'), pieds: P('baskets', '#f2f2ef', '#ffffff'), haut: P('sweat', '#1a1a1d'), gilet: P('aucun'), mains: P('aucun'), tete: P('casquette', '#111113'), visage: P('foulard', '#141414'), extras: ['banane'] },
  { id: 'Doudoune_Lunettes', name: 'Doudoune et lunettes', team: 'civils', body: 'M', peau: '#f1d2bd', hair: 'Hair_SimpleParted', hairColor: '#4a3020', barbe: true,
    bas: P('jean', '#3a5476'), pieds: P('montantes', '#efefec'), haut: P('doudoune', '#121214'), gilet: P('aucun'), mains: P('gants'), tete: P('bonnet', '#1b1b1e'), visage: P('lunettes'), extras: ['sac'] },
  { id: 'Sweat_Jean_Femme', name: 'Sweat et jean (F)', team: 'civils', body: 'F', peau: '#c99474', hair: 'Hair_Long', hairColor: '#1b120d',
    bas: P('jean', '#41618a'), pieds: P('baskets', '#f4f4f1', '#ffffff'), haut: P('sweat', '#18181b'), gilet: P('aucun'), mains: P('aucun'), tete: P('casquette', '#151517'), visage: P('masque', '#1a1a1c'), extras: [] },
  { id: 'Capuche_Femme', name: 'Capuche et cache-cou (F)', team: 'civils', body: 'F', peau: '#7d4f35', hair: 'Hair_BuzzedFemale', hairColor: '#0e0a08',
    bas: P('jogging', '#2b2d32'), pieds: P('baskets', '#141416', '#dcdcd8'), haut: P('kway', '#121317'), gilet: P('aucun'), mains: P('gants'), tete: P('capuche'), visage: P('cache_cou', '#141416'), extras: ['sac'] },
  { id: 'Kway_Masque', name: 'Coupe-vent et masque à gaz', team: 'civils', body: 'M', peau: '#c99474', hair: 'Hair_Buzzed', hairColor: '#1a1410', barbe: true,
    bas: P('cargo', '#2b2d2a'), pieds: P('montantes', '#161618', '#2a2a2a'), haut: P('kway', '#18191d'), gilet: P('aucun'), mains: P('gants'), tete: P('capuche'), visage: P('masque_gaz'), extras: ['genouilleres'] },
];

// ---------------------------------------------------------------- skins de l'utilisateur (studio)
const STORE = 'frungz.skins.v1';
export function userSkins() { try { const j = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(j) ? j.filter((s) => s && s.id && s.body) : []; } catch { return []; } }
export function saveUserSkins(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { return false; } }
export function allSkins() { return BUILTIN_SKINS.concat(userSkins()); }
export function skinById(id) { return allSkins().find((s) => s.id === id) || null; }
// pièce effective d'un emplacement (défauts du catalogue complétés)
export function piece(def, slot) { const p = def[slot] || { id: 'aucun' }; const cat = PIECES[slot].find((x) => x.id === p.id) || PIECES[slot][0]; return { ...cat, ...p, c: p.c || cat.c, c2: p.c2 || cat.c2, c3: p.c3 || cat.c3 }; }

