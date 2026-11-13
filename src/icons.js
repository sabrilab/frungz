// Pictogrammes de l'interface : un seul jeu d'icônes au trait (24 × 24, couleur du texte),
// à la place des emojis, dont le rendu change d'un système à l'autre et qui donnaient un ton de dessin animé.
const P = {
  // armes
  pistol: '<path d="M3 8h16l1 3h-7l-1 2h-3l-1 5H5l1.4-5H3z"/>',
  smg: '<path d="M2 9h17v3h-6v5h-3l-.6-3H7l-.8 3H4l1-5H2zM19 10.5h3M10 12v2"/>',
  shotgun: '<path d="M2 10h20M2 12.5h12M7 12.5v2h5v-2M14 12.5l-2.2 5.5H8.6l1.4-5.5"/>',
  rifle: '<path d="M1 10h14l2-1.5h5V11h-4l-1 2h-4l-1.4 5H8.8l1-5H7l-2 3H3l1.4-4H1zM11 8V6.5"/>',
  sniper: '<path d="M1 12h21M8 8.5h7V12M10 8.5V7.5M15 12l-2 6h-3l1.2-6M2 12l-1 3.5"/>',
  lmg: '<path d="M1 10h15l1.5-1.5H23V11h-5l-1 2h-3.5l-1.4 5H9.3l1-5H7.5l-2 3H3.4l1.4-4H1zM12 8V6.5M14 13v3.5l-2 2M14 16.5l2 2"/><circle cx="10" cy="14.2" r="1.6"/>',
  revolver: '<path d="M2 9h11M2 9v2.4h6M13 7.5h3a2 2 0 0 1 0 4h-3zM15 11.5l-1.6 7H10l1.4-7"/><circle cx="14.6" cy="9.5" r="1"/>',
  // lancers et atouts
  gas: '<rect x="8" y="9" width="8" height="12" rx="1.5"/><path d="M10 9V7h4v2M9 5c1-1.5 2-1.5 3 0s2 1.5 3 0M7 2.5c1.2-1 2.3-1 3.4 0"/>',
  smoke: '<path d="M6 21l7-7M5.5 17.5l3 3"/><circle cx="14.5" cy="9.5" r="3"/><circle cx="18.5" cy="6.5" r="2.5"/><circle cx="12" cy="5" r="2"/>',
  frag: '<circle cx="11" cy="14" r="6"/><path d="M9 8.5V6h4v2.5M13 6l4-2M8 14h6M11 11v6"/>',
  drone: '<rect x="9" y="10" width="6" height="4" rx="1"/><path d="M9 11L5 7M15 11l4-4M9 13l-4 4M15 13l4 4M2.5 7h5M16.5 7h5M2.5 17h5M16.5 17h5"/>',
  parachute: '<path d="M3 10a9 7 0 0 1 18 0zM3 10l9 9 9-9M8 10l4 9 4-9"/><rect x="10.5" y="18" width="3" height="4" rx="1"/>',
  missile: '<path d="M15 3l6 0 0 6-9 9-6-6zM6 12l-3 3 3 3M12 18l-3 3-3-3M9 15l-6 6"/>',
  petards: '<path d="M7 21V11M12 21V9M17 21V11M5.5 11h3M10.5 9h3M15.5 11h3M12 9c0-2 1-3 2.5-3.5M16 3l.8 1.6L18.5 5l-1.6.8L16 7.5l-.8-1.6L13.5 5l1.6-.8z"/>',
  artifice: '<path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5"/><circle cx="12" cy="12" r="1.6"/>',
  heli: '<path d="M3 5h18M12 5v3M5 12c0-2.5 2-4 5-4h4l2 4H5zM5 12c0 2 1.5 3 4 3h7l1-3M17 12h5l1-2M22 10v4M8 15l-1 3M14 15l1 3M5 18h12"/>',
  jet: '<path d="M12 2l1.6 6L21 13v2l-7.4-2.4L13 18l2.5 2v1.5L12 20.5 8.5 21.5V20l2.5-2-.6-5.4L3 15v-2l7.4-5z"/>',
  swarm: '<rect x="3" y="4" width="5" height="3" rx="1"/><rect x="15" y="3" width="5" height="3" rx="1"/><rect x="9" y="14" width="6" height="4" rx="1"/><path d="M1.5 4h8M13.5 3h8M7 14h10M12 18l-2 4M12 18l2 4M5 7l3 5M18 6l-3 6"/>',
  gunship: '<path d="M2 11h20v2H2zM9 8h6l1 3H8zM6 13l-2 5h3l3-5M18 13l2 5h-3l-3-5M11 4h2v4h-2zM7.5 11V9M16.5 11V9"/><circle cx="12" cy="16" r="1.6"/>',
  nuke: '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8L9 4.5a8 8 0 0 1 6 0zM14 13.2l6 .1a8 8 0 0 1-3 5.2zM10 13.2l-3 5.3a8 8 0 0 1-3-5.2z"/>',
  truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 4v3h-8zM15 9v4h5"/><circle cx="6" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  water: '<path d="M2 12h8v6H2zM10 13h2.5l1.5 2v3h-4zM6 12V9h3l4-3"/><path d="M14 5c2 0 3 1 5 1M15 3c2 0 3.5 1 6 1M14.5 8c2 0 3 .8 5 .8"/><circle cx="4.5" cy="19.2" r="1.3"/><circle cx="11.5" cy="19.2" r="1.3"/>',
  ram: '<path d="M4 7h10v9H4zM14 10h4l3 3v3h-7zM2 6v11M2 6h2M2 17h2"/><circle cx="8" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  // statut
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.8 1.4 4.6 3 5.6V21h10v-4.4c1.6-1 3-2.8 3-5.6a8 8 0 0 0-8-8zM10 21v-2.5M14 21v-2.5"/><circle cx="9" cy="11.5" r="1.7"/><circle cx="15" cy="11.5" r="1.7"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  turret: '<path d="M5 21l4-7M19 21l-4-7M12 14v7M8 14h8M7 8h9a2 2 0 0 1 2 2v2H7zM18 10h4M9 8V6h4v2"/><circle cx="10" cy="10.5" r="0.8"/>',
  barricade: '<path d="M5 6v15M19 6v15M2 9h20v4H2zM2 15h20v3H2zM6 9l4 4M12 9l4 4M18 9l2 2"/>',
  vest: '<path d="M8 3l4 3 4-3 4 3-1 5v9H5v-9L4 6zM12 6v14M8 13h2M14 13h2"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18v.01"/>',
  siren: '<path d="M6 19v-6a6 6 0 0 1 12 0v6M4 19h16v3H4zM12 2v2M4 5l1.5 1.5M20 5l-1.5 1.5M10 13a2 2 0 0 1 2-2"/>',
  glass: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 12l-5-6M12 12l7-3M12 12l-2 9M12 12l9 4M12 12L3 14"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="1.5"/><circle cx="12" cy="12" r="3"/><path d="M5.5 9v.01M18.5 15v.01"/>',
  car: '<path d="M3 16v-3l2-5h14l2 5v3zM3 16v3h3v-3M18 16v3h3v-3M5 13h14"/><circle cx="7" cy="13" r=".6"/><circle cx="17" cy="13" r=".6"/>',
  base: '<path d="M3 9l9-5 9 5zM5 9v9M9.6 9v9M14.4 9v9M19 9v9M2 21h20M3 18h18"/>',
  bag: '<path d="M5 8h14l-1.4 13H6.4zM9 8V6a3 3 0 0 1 6 0v2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  nitro: '<path d="M10 2.5h4M12 2.5v3M8.5 9a3.5 3.5 0 0 1 7 0v12.5h-7zM8.5 13h7"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.7-8.7a4 4 0 0 1-2-2z"/>',
};
export const ICON_NAMES = Object.keys(P);
// <svg> en ligne, aux dimensions du texte ; inconnu → chaîne vide
export function svg(name, cls = '') {
  const p = P[name]; if (!p) return '';
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}
// anciens emojis encore présents dans du texte (toasts, annonces) → pictogrammes
const EMO = { '🛸': 'drone', '🪂': 'parachute', '🚀': 'missile', '🧨': 'petards', '🎆': 'artifice', '☂️': 'parachute', '💨': 'gas', '🌫️': 'smoke', '💣': 'frag', '💀': 'skull', '☠': 'skull', '🎯': 'target', '🧱': 'barricade', '🦺': 'vest', '⚠': 'alert', '🚨': 'siren', '💥': 'glass', '💰': 'cash', '🚗': 'car', '🏛️': 'base', '✓': 'check', '⛽': 'nitro', '🔧': 'wrench' };
const EMO_RE = new RegExp(Object.keys(EMO).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
export function iconize(html) { return String(html).replace(EMO_RE, (m) => svg(EMO[m])); }
