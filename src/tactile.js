// Commandes tactiles (téléphone, tablette, app iPhone), inspirées de Call of Duty Mobile.
// - pouce gauche : joystick flottant (il se pose là où on touche) ; poussé à fond vers l'avant, on sprinte
// - pouce droit : glisser n'importe où pour tourner la caméra (la zone au-dessus du tir reste libre exprès)
// - tir « viser en tirant » : maintenir Tirer met en joue puis tire ; au fusil de précision, on vise en maintenant
//   et le coup part quand on lâche. Le bouton de tir se fait aussi glisser pour suivre la cible.
// - peu de boutons par défaut ; les autres sont dans l'inventaire de touches de l'éditeur (Réglages > Personnaliser
//   les touches) : déplacer, agrandir, rétrécir, opacité, masquer, ajouter. La disposition est gardée dans la sauvegarde.
// Tout passe par l'entrée du jeu (input.touchKey / st.tx, st.ty, st.mx, st.my) : le jeu lit les mêmes actions qu'au clavier.
import { svg } from './icons.js';
import { WEAPONS } from './data.js';
import { NATIVE, haptic } from './natif.js';

export const isTouchDevice = () => {
  const q = new URLSearchParams(location.search);
  if (q.has('tactile')) return q.get('tactile') !== '0';
  return NATIVE || (matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);
};

// pictos (traits simples, couleur du texte)
const P = {
  fire: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 4v12M24 32v12M4 24h12M32 24h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="currentColor"/></svg>',
  aim: '<svg viewBox="0 0 48 48"><path d="M8 18V8h10M30 8h10v10M40 30v10H30M18 40H8V30" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="24" r="4" fill="currentColor"/></svg>',
  jump: '<svg viewBox="0 0 48 48"><path d="M24 38V12M13 22l11-11 11 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  duck: '<svg viewBox="0 0 48 48"><circle cx="22" cy="11" r="5" fill="currentColor"/><path d="M20 18l-4 12h12l2 10M16 30l-4 10M21 20l9 6" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  slide: '<svg viewBox="0 0 48 48"><circle cx="34" cy="16" r="5" fill="currentColor"/><path d="M30 23l-10 8H8M24 28l4 9h12M6 41h36" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reload: '<svg viewBox="0 0 48 48"><path d="M37 24a13 13 0 1 1-4-9.4M37 8v8h-8" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grenade: '<svg viewBox="0 0 48 48"><circle cx="22" cy="28" r="12" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M18 16v-4h8v4M26 12l8-4" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  build: '<svg viewBox="0 0 48 48"><path d="M6 38h36M8 38V22h32v16M8 30h32M18 22v8M30 30v8M14 14l20 0" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  interact: '<svg viewBox="0 0 48 48"><path d="M17 26V12a3 3 0 0 1 6 0v11-15a3 3 0 0 1 6 0v15-12a3 3 0 0 1 6 0v18c0 8-5 13-12 13-5 0-8-3-11-8l-5-8a3 3 0 0 1 5-3z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
  view: '<svg viewBox="0 0 48 48"><path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="24" cy="24" r="5.5" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 48 48"><path d="M10 14h28M10 24h28M10 34h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  bag: '<svg viewBox="0 0 48 48"><path d="M10 18h28l-3 22H13zM18 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/></svg>',
  horn: '<svg viewBox="0 0 48 48"><path d="M8 20v8h8l12 8V12l-12 8zM34 18a8 8 0 0 1 0 12M38 13a14 14 0 0 1 0 22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  brake: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M24 15v12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="33" r="2.4" fill="currentColor"/></svg>',
  up: '<svg viewBox="0 0 48 48"><path d="M12 30l12-12 12 12" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 48 48"><path d="M12 18l12 12 12-12" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  exit: '<svg viewBox="0 0 48 48"><path d="M20 8H9v32h11M30 15l9 9-9 9M38 24H18" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  breath: '<svg viewBox="0 0 48 48"><path d="M6 20h22a6 6 0 1 0-6-6M6 28h30a6 6 0 1 1-6 6M6 36h12" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  zoom: '<svg viewBox="0 0 48 48"><circle cx="21" cy="21" r="12" fill="none" stroke="currentColor" stroke-width="3.4"/><path d="M30 30l10 10M21 15v12M15 21h12" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  map: '<svg viewBox="0 0 48 48"><path d="M6 12l12-5 12 5 12-5v29l-12 5-12-5-12 5zM18 7v29M30 12v29" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 48 48"><path d="M8 18h28l-7-7M40 30H12l7 7" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sprint: '<svg viewBox="0 0 48 48"><circle cx="30" cy="9" r="4.5" fill="currentColor"/><path d="M14 22l8-6 8 3 4 8 6 2M22 16l-4 12 8 4-2 10M18 28l-8 6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// Touches : id, actions, picto, libellé, modes où elle sert (pied, voiture, hélico), taille de base (px),
// place par défaut (centre, en fraction de l'écran), affichée par défaut ou rangée dans l'inventaire,
// ctx : n'apparaît que quand elle sert (action possible, série prête, lunette).
const KEYS = [
  // à pied : l'essentiel, serré autour du tir en bas à droite
  { id: 'fire', act: ['fire'], ico: 'fire', lbl: 'Tirer', modes: ['foot'], size: 86, x: 0.873, y: 0.648, on: true, fire: true, drag: true },
  { id: 'fire2', act: ['fire'], ico: 'fire', lbl: 'Tir gauche', modes: ['foot'], size: 54, x: 0.17, y: 0.34, on: true, fire: true },
  { id: 'aim', act: ['aim'], ico: 'aim', lbl: 'Viser', modes: ['foot'], size: 54, x: 0.707, y: 0.858, on: true, toggle: true },
  { id: 'jump', act: ['jump'], ico: 'jump', lbl: 'Saut', modes: ['foot'], size: 60, x: 0.786, y: 0.587, on: true },
  { id: 'crouch', act: ['duck'], ico: 'duck', lbl: 'Accroupi', modes: ['foot'], size: 52, x: 0.862, y: 0.858, on: true, combo: true },
  { id: 'reload', act: ['reload'], ico: 'reload', lbl: 'Recharger', modes: ['foot'], size: 48, x: 0.778, y: 0.757, on: true },
  { id: 'grenade', act: ['grenade'], ico: 'grenade', lbl: 'Lancer', modes: ['foot'], size: 46, x: 0.956, y: 0.329, on: true },
  { id: 'interact', act: ['interact', 'car'], ico: 'interact', lbl: 'Agir', modes: ['foot'], size: 62, x: 0.665, y: 0.561, on: true, ctx: 'prompt' },
  { id: 'streak', act: ['streak'], ico: 'streak', lbl: 'Série', modes: ['foot'], size: 50, x: 0.957, y: 0.13, on: true, ctx: 'ready' },
  { id: 'breath', act: ['sprint'], ico: 'breath', lbl: 'Souffle', modes: ['foot'], size: 52, x: 0.699, y: 0.362, on: true, ctx: 'scope' },
  { id: 'pause', act: ['pause'], ico: 'pause', lbl: '', modes: ['foot', 'car', 'heli', 'dead'], size: 40, x: 0.0375, y: 0.078, on: true, sq: true },
  // disposition par défaut : celle réglée par Sabri sur son iPhone (11 nov. 2026)
  // inventaire (rangées par défaut, à ajouter dans l'éditeur)
  { id: 'build', act: ['build'], ico: 'build', lbl: 'Barricade', modes: ['foot'], size: 46, x: 0.864, y: 0.398, on: true },
  { id: 'slide', act: ['crouch'], ico: 'slide', lbl: 'Glissade', modes: ['foot'], size: 48, x: 0.62, y: 0.86, on: false },
  { id: 'sprint', act: ['sprint'], ico: 'sprint', lbl: 'Sprint', modes: ['foot'], size: 48, x: 0.17, y: 0.58, on: false, toggle: true },
  { id: 'view', act: ['view'], ico: 'view', lbl: 'Vue', modes: ['foot'], size: 42, x: 0.86, y: 0.13, on: true },
  { id: 'next', act: ['next'], ico: 'next', lbl: 'Arme', modes: ['foot'], size: 46, x: 0.62, y: 0.62, on: false },
  { id: 'bag', act: ['inv'], ico: 'bag', lbl: 'Sac', modes: ['foot', 'car', 'heli'], size: 40, x: 0.09, y: 0.08, on: false, sq: true },
  { id: 'map', act: ['map'], ico: 'map', lbl: 'Carte', modes: ['foot', 'car', 'heli'], size: 40, x: 0.145, y: 0.08, on: false, sq: true },
  { id: 'shop', act: ['shop'], ico: 'bag', lbl: 'Armurerie', modes: ['foot'], size: 44, x: 0.5, y: 0.3, on: false },
  // voiture
  { id: 'brake', act: ['jump'], ico: 'brake', lbl: 'Frein', modes: ['car'], size: 76, x: 0.92, y: 0.76, on: true },
  { id: 'horn', act: ['horn'], ico: 'horn', lbl: 'Klaxon', modes: ['car'], size: 54, x: 0.79, y: 0.86, on: true },
  { id: 'exit', act: ['car'], ico: 'exit', lbl: 'Sortir', modes: ['car', 'heli'], size: 54, x: 0.94, y: 0.42, on: true },
  // hélico
  { id: 'hfire', act: ['fire'], ico: 'fire', lbl: 'Tir', modes: ['heli'], size: 80, x: 0.8, y: 0.7, on: true },
  { id: 'up', act: ['jump'], ico: 'up', lbl: 'Monter', modes: ['heli'], size: 56, x: 0.95, y: 0.64, on: true },
  { id: 'down', act: ['duck'], ico: 'down', lbl: 'Descendre', modes: ['heli'], size: 50, x: 0.95, y: 0.88, on: true },
  { id: 'arsenal', act: ['grenade'], ico: 'grenade', lbl: 'Arsenal', modes: ['heli'], size: 54, x: 0.67, y: 0.82, on: true },
];
const K = Object.fromEntries(KEYS.map((k) => [k.id, k]));
const MODES = { foot: 'À pied', car: 'Véhicule', heli: 'Hélico' };
const defaults = () => ({ alpha: 0.8, keys: Object.fromEntries(KEYS.map((k) => [k.id, { x: k.x, y: k.y, s: 1, o: 1, on: k.on }])) });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createTouch({ input, onTap, layout, onSave }) {
  const I = input, S = I.st;
  // disposition : celle de la sauvegarde, complétée par les touches ajoutées depuis
  const L = defaults(); if (layout) { L.alpha = layout.alpha ?? L.alpha; for (const id in layout.keys || {}) if (L.keys[id]) Object.assign(L.keys[id], layout.keys[id]); }
  const root = document.createElement('div'); root.id = 'touch'; root.dataset.mode = 'foot';
  root.innerHTML = `<div class="joy"><i class="knob"></i><b class="sprint">SPRINT</b></div><div class="joyhint"></div>` +
    KEYS.map((k) => `<button class="tb tb-${k.id}${k.sq ? ' sq' : ''}${k.ctx ? ' ctx ctx-' + k.ctx : ''}${k.fire ? ' firebtn' : ''}" data-id="${k.id}" aria-label="${k.lbl || k.id}"><span class="ic">${P[k.ico] || svg(k.ico === 'streak' ? 'target' : k.ico)}</span>${k.lbl ? `<small>${k.lbl}</small>` : ''}</button>`).join('');
  document.body.classList.add('touch');
  (document.getElementById('hud') || document.body).after(root);
  const btnEl = Object.fromEntries([...root.querySelectorAll('.tb')].map((e) => [e.dataset.id, e]));
  const joyEl = root.querySelector('.joy'), knob = root.querySelector('.knob');
  function place(id) {
    const k = K[id], c = L.keys[id], el = btnEl[id], sz = Math.round(k.size * c.s);
    el.style.left = (c.x * 100).toFixed(2) + '%'; el.style.top = (c.y * 100).toFixed(2) + '%'; el.style.width = el.style.height = sz + 'px';
    el.style.setProperty('--o', (c.o * L.alpha).toFixed(2)); el.classList.toggle('off', !c.on);
  }
  const placeAll = () => { for (const k of KEYS) place(k.id); };
  placeAll();

  let game = null;
  const fingers = new Map(); // doigt → rôle
  const toggled = new Set();
  const R = 58; // rayon du joystick (px)
  let sprintLock = false, aimN = 0, fireN = 0, editing = false;
  const sens = () => (I.settings.touchSens ?? 1) * 2.4 / (I.settings.sens || 1); // st.mx est multiplié par la sensibilité souris dans le jeu
  const hold = (k, on) => { for (const a of k.act) I.touchKey(a, on); };
  const setAim = () => I.touchKey('aim', aimN > 0 || toggled.has('aim'));
  const setFire = () => I.touchKey('fire', fireN > 0);
  const player = () => game?.player;
  const curWeapon = () => { const a = player(); const W = a && game.weapon?.(a); return W ? WEAPONS[W.id] : null; };

  // ---- tir façon CoD : on met en joue, puis les coups partent ; fusil de précision : le coup part au lâcher
  function fireDown(f) {
    const ads = I.settings.fireAds !== false && root.dataset.mode === 'foot' && !game?.thr;
    if (!ads) { fireN++; setFire(); f.hip = true; return; }
    aimN++; setAim(); f.ads = true;
    if (curWeapon()?.scope) { f.snipe = true; return; }
    f.timer = setTimeout(() => { if (fingers.get(f.id) === f) { f.firing = true; fireN++; setFire(); } }, 120);
  }
  function fireUp(f) {
    clearTimeout(f.timer);
    if (f.hip || f.firing) { fireN = Math.max(0, fireN - 1); setFire(); }
    if (f.snipe) { I.touchKey('fire', true); I.touchKey('fire', fireN > 0); } // un front de tir, encore en visée
    if (f.ads) setTimeout(() => { aimN = Math.max(0, aimN - 1); setAim(); }, f.snipe ? 160 : 0);
  }

  function start(t, target) {
    const el = target?.closest?.('.tb');
    if (el && !el.classList.contains('off')) {
      const k = K[el.dataset.id], f = { id: t.identifier, el, k, x: t.clientX, y: t.clientY }; el.classList.add('down'); haptic();
      fingers.set(t.identifier, f);
      if (k.fire) { f.kind = 'fire'; fireDown(f); return; }
      if (k.id === 'interact' && /armurerie/i.test(document.getElementById('prompt')?.textContent || '') && !/(prendre|voler|casser|exposer|revendre|ramasser|renforcer|réparer)/i.test(document.getElementById('prompt').textContent)) { f.kind = 'btn'; f.k = K.shop; hold(K.shop, true); return; }
      if (k.toggle) {
        const on = !toggled.has(k.id); on ? toggled.add(k.id) : toggled.delete(k.id); el.classList.toggle('on', on); f.kind = 'tap';
        if (k.id === 'aim') setAim(); else hold(k, on); return;
      }
      // accroupi : en pleine course, on glisse (comme sur CoD Mobile)
      if (k.combo && (sprintLock || toggled.has('sprint') || game?.player?.momentum > 0.6)) { f.kind = 'btn'; f.k = K.slide; hold(K.slide, true); return; }
      f.kind = 'btn'; hold(k, true); return;
    }
    // armes (barre du HUD) : toucher une arme la prend en main ; minimap : grande carte
    const inside = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom; };
    const w = [...(document.getElementById('weapons')?.children || [])].find((d) => !d.classList.contains('thr') && inside(d));
    if (w) { const i = [...w.parentNode.children].indexOf(w); if (i >= 0 && i < 4) { I.touchKey('w' + (i + 1), true); I.touchKey('w' + (i + 1), false); haptic(); } fingers.set(t.identifier, { kind: 'tap' }); return; }
    if (inside(document.getElementById('minimap'))) { I.touchKey('map', true); I.touchKey('map', false); fingers.set(t.identifier, { kind: 'tap' }); return; }
    const left = t.clientX < innerWidth * 0.42;
    if (left && ![...fingers.values()].some((f) => f.kind === 'joy')) {
      const cx = clamp(t.clientX, R + 12, innerWidth * 0.42 - R), cy = clamp(t.clientY, R + 12, innerHeight - R - 12);
      fingers.set(t.identifier, { kind: 'joy', cx, cy }); joyEl.style.left = cx + 'px'; joyEl.style.top = cy + 'px'; joyEl.classList.add('on'); move(t); return;
    }
    fingers.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
  }
  function move(t) {
    const f = fingers.get(t.identifier); if (!f) return;
    if (f.kind === 'joy') {
      let dx = t.clientX - f.cx, dy = t.clientY - f.cy; const d = Math.hypot(dx, dy), k = d > R ? R / d : 1; dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const n = Math.min(1, d / R), dz = 0.12, m = n < dz ? 0 : (n - dz) / (1 - dz);
      S.tx = d ? (dx / (d * k || 1)) * m : 0; S.ty = d ? (dy / (d * k || 1)) * m : 0;
      // sprint auto : joystick poussé à fond vers l'avant (réglable : un peu au-delà du bord, ou dès le bord)
      const edge = I.settings.autoSprint === false ? 9 : 1.12;
      const sp = d > R * edge && dy < -R * 0.75;
      if (sp !== sprintLock) { sprintLock = sp; I.touchKey('sprint', sp || toggled.has('sprint')); joyEl.classList.toggle('sprinting', sp); if (sp) haptic(); }
    } else if (f.kind === 'look' || (f.kind === 'fire' && f.k.drag)) {
      const dx = t.clientX - f.x, dy = t.clientY - f.y; f.x = t.clientX; f.y = t.clientY;
      const acc = (v) => v * (1 + Math.min(1.2, Math.abs(v) / 40)); // précis en petits gestes, rapide en grands balayages
      S.mx += acc(dx) * sens(); S.my += acc(dy) * sens();
    }
  }
  function end(t) {
    const f = fingers.get(t.identifier); if (!f) return; fingers.delete(t.identifier);
    f.el?.classList.remove('down');
    if (f.kind === 'joy') { S.tx = S.ty = 0; knob.style.transform = ''; joyEl.classList.remove('on', 'sprinting'); if (sprintLock) { sprintLock = false; I.touchKey('sprint', toggled.has('sprint')); } }
    else if (f.kind === 'fire') fireUp(f);
    else if (f.kind === 'btn') hold(f.k, false);
  }
  const opts = { passive: false };
  root.addEventListener('touchstart', (e) => { if (editing) return; e.preventDefault(); S.usingTouch = true; onTap?.(); for (const t of e.changedTouches) start(t, t.target); }, opts);
  root.addEventListener('touchmove', (e) => { if (editing) return; e.preventDefault(); for (const t of e.changedTouches) move(t); }, opts);
  const up = (e) => { if (editing) return; e.preventDefault(); for (const t of e.changedTouches) end(t); };
  root.addEventListener('touchend', up, opts); root.addEventListener('touchcancel', up, opts);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  function releaseAll() {
    for (const t of [...fingers.keys()]) end({ identifier: t });
    for (const id of toggled) btnEl[id]?.classList.remove('on'); toggled.clear(); aimN = fireN = 0; sprintLock = false; I.touchClear();
  }

  // ---- état du jeu → touches montrées (à pied, voiture, hélico, mort ; action possible, série prête, lunette)
  let lastK = '';
  function sync(g) {
    if (editing) return;
    game = g && !g.paused && !g.over ? g : null; const a = game?.player;
    if (!a) { if (root.classList.contains('on')) { root.classList.remove('on'); releaseAll(); } return; }
    root.classList.add('on');
    const W = a.alive && game.weapon?.(a), scope = !!(game.aiming && W && WEAPONS[W.id]?.scope);
    const mode = !a.alive ? 'dead' : a.inCar?.kind === 'heli' ? 'heli' : a.inCar ? 'car' : 'foot';
    const prompt = !!document.getElementById('prompt')?.classList.contains('on');
    const k = `${mode}|${scope}|${prompt}|${a.rewards?.length || 0}|${!!game.thr}|${a.inCar?.kind || ''}`;
    if (k === lastK) return; lastK = k;
    if (mode !== root.dataset.mode) { releaseAll(); }
    root.dataset.mode = mode; root.classList.toggle('scope', scope); root.classList.toggle('prompt', prompt); root.classList.toggle('ready', !!a.rewards?.length); root.classList.toggle('thr', !!game.thr);
    root.classList.toggle('skate', a.inCar?.kind === 'skate');
    const v = btnEl.view; v.querySelector('small').textContent = scope ? 'Zoom' : 'Vue'; v.querySelector('.ic').innerHTML = scope ? P.zoom : P.view;
  }

  // ---- éditeur de touches : déplacer, taille, opacité, masquer, inventaire, opacité générale
  const ed = document.createElement('div'); ed.id = 'touchEd';
  ed.innerHTML = `<div class="te-bar">
      <div class="te-modes">${Object.entries(MODES).map(([m, n]) => `<button data-m="${m}">${n}</button>`).join('')}</div>
      <div class="te-sel"><b class="te-name">Touche une touche pour la régler</b>
        <label>Taille <input type="range" min="0.6" max="1.7" step="0.05" class="te-s"></label>
        <label>Opacité <input type="range" min="0.15" max="1" step="0.05" class="te-o"></label>
        <button class="te-hide">Masquer</button></div>
      <div class="te-row"><label>Opacité de toutes les touches <input type="range" min="0.2" max="1" step="0.05" class="te-alpha"></label>
        <button class="te-inv">+ Ajouter une touche</button><button class="te-reset">Par défaut</button><button class="te-done">Terminé</button></div>
    </div>
    <div class="te-drawer hidden"><b>Inventaire de touches</b><div class="te-list"></div><small>Touche une touche pour l'ajouter à l'écran, puis place-la.</small></div>
    <div class="te-help">Fais glisser une touche pour la déplacer · les touches à pointillés n'apparaissent en jeu que quand elles servent</div>`;
  document.body.appendChild(ed);
  const q = (s) => ed.querySelector(s);
  let sel = null, edMode = 'foot', onClose = null, drag = null;
  function edRefresh() {
    root.dataset.mode = edMode;
    for (const k of KEYS) btnEl[k.id].classList.toggle('te-other', !k.modes.includes(edMode));
    ed.querySelectorAll('.te-modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === edMode));
    for (const e of root.querySelectorAll('.tb.te-sel')) e.classList.remove('te-sel');
    const c = sel && L.keys[sel];
    q('.te-sel').classList.toggle('has', !!c);
    if (c) { btnEl[sel].classList.add('te-sel'); q('.te-name').textContent = K[sel].lbl || 'Pause'; q('.te-s').value = c.s; q('.te-o').value = c.o; q('.te-hide').textContent = c.on ? 'Masquer' : 'Afficher'; q('.te-hide').disabled = sel === 'pause'; }
    else q('.te-name').textContent = 'Touche une touche pour la régler';
    // la barre passe en bas quand la touche réglée est en haut de l'écran (pour la voir)
    q('.te-bar').classList.toggle('low', !!c && c.y < 0.45);
    q('.te-alpha').value = L.alpha;
    const inv = KEYS.filter((k) => k.modes.includes(edMode) && !L.keys[k.id].on);
    q('.te-list').innerHTML = inv.length ? inv.map((k) => `<button data-add="${k.id}"><span class="ic">${P[k.ico] || svg(k.ico)}</span>${k.lbl}</button>`).join('') : '<i>Toutes les touches sont déjà à l\'écran.</i>';
  }
  const save = () => onSave?.(JSON.parse(JSON.stringify(L)));
  root.addEventListener('pointerdown', (e) => {
    if (!editing) return; const el = e.target.closest('.tb'); if (!el || el.classList.contains('te-other')) return;
    e.preventDefault(); sel = el.dataset.id; const c = L.keys[sel]; drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: c.x, y: c.y }; root.setPointerCapture?.(e.pointerId); edRefresh();
  });
  root.addEventListener('pointermove', (e) => {
    if (!editing || !drag || drag.id !== e.pointerId) return; const c = L.keys[sel];
    c.x = clamp(drag.x + (e.clientX - drag.sx) / innerWidth, 0.03, 0.97); c.y = clamp(drag.y + (e.clientY - drag.sy) / innerHeight, 0.05, 0.95); place(sel);
  });
  const dragEnd = () => { if (drag) { drag = null; save(); } };
  root.addEventListener('pointerup', dragEnd); root.addEventListener('pointercancel', dragEnd);
  q('.te-s').addEventListener('input', (e) => { if (!sel) return; L.keys[sel].s = +e.target.value; place(sel); save(); });
  q('.te-o').addEventListener('input', (e) => { if (!sel) return; L.keys[sel].o = +e.target.value; place(sel); save(); });
  q('.te-alpha').addEventListener('input', (e) => { L.alpha = +e.target.value; placeAll(); save(); });
  q('.te-hide').addEventListener('click', () => { if (!sel || sel === 'pause') return; const c = L.keys[sel]; c.on = !c.on; place(sel); if (!c.on) sel = null; save(); edRefresh(); });
  q('.te-inv').addEventListener('click', () => q('.te-drawer').classList.toggle('hidden'));
  q('.te-list').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (!b) return; const id = b.dataset.add, c = L.keys[id]; c.on = true; place(id); sel = id; q('.te-drawer').classList.add('hidden'); save(); edRefresh(); haptic(); });
  q('.te-reset').addEventListener('click', () => { const d = defaults(); L.alpha = d.alpha; for (const id in d.keys) L.keys[id] = d.keys[id]; placeAll(); sel = null; save(); edRefresh(); });
  ed.querySelectorAll('.te-modes button').forEach((b) => b.addEventListener('click', () => { edMode = b.dataset.m; sel = null; edRefresh(); }));
  q('.te-done').addEventListener('click', () => closeEditor());
  function openEditor(cb) {
    releaseAll(); editing = true; onClose = cb; sel = null; edMode = 'foot';
    root.classList.add('on', 'editing'); ed.classList.add('on'); q('.te-drawer').classList.add('hidden'); edRefresh();
  }
  function closeEditor() {
    editing = false; drag = null; root.classList.remove('editing', 'on'); ed.classList.remove('on');
    for (const e of root.querySelectorAll('.te-sel, .te-other')) e.classList.remove('te-sel', 'te-other');
    lastK = ''; root.dataset.mode = 'foot'; save(); onClose?.();
  }
  return { root, sync, releaseAll, openEditor, closeEditor, layout: L };
}
