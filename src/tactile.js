// Commandes tactiles (téléphone, tablette, app iPhone) : disposition à la Call of Duty Mobile / Fortnite mobile.
// - pouce gauche : joystick flottant (il apparaît là où on pose le pouce) ; poussé à fond vers l'avant, on sprinte
// - pouce droit : glisser n'importe où pour regarder ; le bouton de tir se fait aussi glisser pour viser en tirant
// - boutons autour du tir : viser (bascule), saut, accroupi, glissade, recharger, lancer (maintenir), barricade
// - boutons du contexte : agir (n'apparaît qu'avec une action possible), atout de série prêt, sortir du véhicule, klaxon…
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
};

// boutons : id, actions envoyées, picto, libellé, comportement (hold = maintenu tant que le doigt est posé ; toggle = bascule)
const BTNS = [
  { id: 'fire', act: ['fire'], ico: 'fire', drag: true },
  { id: 'fire2', act: ['fire'], ico: 'fire' }, // tir gauche (au-dessus du joystick), comme sur CoD Mobile
  { id: 'aim', act: ['aim'], ico: 'aim', toggle: true, lbl: 'Viser' },
  { id: 'jump', act: ['jump'], ico: 'jump', lbl: 'Saut' },
  { id: 'duck', act: ['duck'], ico: 'duck', lbl: 'Accroupi' },
  { id: 'slide', act: ['crouch'], ico: 'slide', lbl: 'Glissade' },
  { id: 'reload', act: ['reload'], ico: 'reload', lbl: 'Recharger' },
  { id: 'grenade', act: ['grenade'], ico: 'grenade', lbl: 'Lancer' },
  { id: 'build', act: ['build'], ico: 'build', lbl: 'Barricade' },
  { id: 'interact', act: ['interact', 'car'], ico: 'interact', lbl: 'Agir' },
  { id: 'streak', act: ['streak'], ico: 'streak', lbl: 'Série' },
  { id: 'view', act: ['view'], ico: 'view', lbl: 'Vue' },
  { id: 'breath', act: ['sprint'], ico: 'breath', lbl: 'Souffle' },
  { id: 'bag', act: ['inv'], ico: 'bag', small: true },
  { id: 'pause', act: ['pause'], ico: 'pause', small: true },
  // véhicule
  { id: 'brake', act: ['jump'], ico: 'brake', lbl: 'Frein' },
  { id: 'horn', act: ['horn'], ico: 'horn', lbl: 'Klaxon' },
  { id: 'exit', act: ['car'], ico: 'exit', lbl: 'Sortir' },
  // hélico
  { id: 'up', act: ['jump'], ico: 'up', lbl: 'Monter' },
  { id: 'down', act: ['duck'], ico: 'down', lbl: 'Descendre' },
  { id: 'hfire', act: ['fire'], ico: 'fire', lbl: 'Tir' },
  { id: 'arsenal', act: ['grenade'], ico: 'grenade', lbl: 'Arsenal' },
];

export function createTouch({ input, onTap }) {
  const I = input, S = I.st;
  const root = document.createElement('div'); root.id = 'touch';
  root.innerHTML = `<div class="joy"><i class="knob"></i><b class="sprint">SPRINT</b></div>` +
    BTNS.map((b) => `<button class="tb tb-${b.id}${b.small ? ' sm' : ''}" data-id="${b.id}" aria-label="${b.lbl || b.id}"><span class="ic">${P[b.ico] || svg(b.ico === 'streak' ? 'target' : b.ico)}</span>${b.lbl ? `<small>${b.lbl}</small>` : ''}</button>`).join('');
  document.body.classList.add('touch');
  (document.getElementById('hud') || document.body).after(root);
  const btnEl = Object.fromEntries([...root.querySelectorAll('.tb')].map((e) => [e.dataset.id, e]));
  const joyEl = root.querySelector('.joy'), knob = root.querySelector('.knob');
  const fingers = new Map(); // identifiant du doigt → rôle
  const toggled = new Set();
  const R = 58; // rayon du joystick (px)
  let sprintLock = false;
  const sens = () => (I.settings.touchSens ?? 1) * 2.4 / (I.settings.sens || 1); // st.mx est multiplié par la sensibilité souris dans le jeu
  const hold = (b, on) => { for (const a of b.act) I.touchKey(a, on); };

  function start(t, target) {
    const el = target?.closest?.('.tb');
    if (el) {
      const b = BTNS.find((x) => x.id === el.dataset.id); el.classList.add('down'); haptic();
      if (b.id === 'interact' && /armurerie/i.test(document.getElementById('prompt')?.textContent || '') && !/(prendre|voler|casser|exposer|revendre|ramasser|renforcer|réparer)/i.test(document.getElementById('prompt').textContent)) { I.touchKey('shop', true); fingers.set(t.identifier, { kind: 'btn', b: { act: ['shop'] }, el }); return; }
      if (b.toggle) { const on = !toggled.has(b.id); on ? toggled.add(b.id) : toggled.delete(b.id); el.classList.toggle('on', on); hold(b, on); fingers.set(t.identifier, { kind: 'tap', el }); return; }
      hold(b, true); fingers.set(t.identifier, { kind: 'btn', b, el, x: t.clientX, y: t.clientY }); return;
    }
    // armes (barre du HUD) : toucher une arme la prend en main
    const inside = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom; };
    const w = [...(document.getElementById('weapons')?.children || [])].find((d) => !d.classList.contains('thr') && inside(d));
    if (w) { const i = [...w.parentNode.children].indexOf(w); if (i >= 0 && i < 4) { I.touchKey('w' + (i + 1), true); I.touchKey('w' + (i + 1), false); haptic(); } fingers.set(t.identifier, { kind: 'tap' }); return; }
    if (inside(document.getElementById('minimap'))) { I.touchKey('map', true); I.touchKey('map', false); fingers.set(t.identifier, { kind: 'tap' }); return; }
    const left = t.clientX < innerWidth * 0.42;
    if (left && ![...fingers.values()].some((f) => f.kind === 'joy')) {
      // joystick flottant : la base se pose sous le pouce (sans sortir de l'écran)
      const cx = Math.max(R + 12, Math.min(innerWidth * 0.42 - R, t.clientX)), cy = Math.max(R + 12, Math.min(innerHeight - R - 12, t.clientY));
      fingers.set(t.identifier, { kind: 'joy', cx, cy }); joyEl.style.left = cx + 'px'; joyEl.style.top = cy + 'px'; joyEl.classList.add('on'); move(t); return;
    }
    fingers.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
  }
  function move(t) {
    const f = fingers.get(t.identifier); if (!f) return;
    if (f.kind === 'joy') {
      let dx = t.clientX - f.cx, dy = t.clientY - f.cy; const d = Math.hypot(dx, dy), k = d > R ? R / d : 1; dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      // petite zone morte, puis réponse progressive ; au-delà du bord vers l'avant : sprint
      const n = Math.min(1, d / R), dz = 0.12, m = n < dz ? 0 : (n - dz) / (1 - dz);
      S.tx = d ? (dx / (d * k || 1)) * m : 0; S.ty = d ? (dy / (d * k || 1)) * m : 0;
      const sp = d > R * 1.15 && dy < -R * 0.7;
      if (sp !== sprintLock) { sprintLock = sp; I.touchKey('sprint', sp); joyEl.classList.toggle('sprinting', sp); if (sp) haptic(); }
    } else if (f.kind === 'look' || (f.kind === 'btn' && f.b.drag)) {
      const dx = t.clientX - f.x, dy = t.clientY - f.y; f.x = t.clientX; f.y = t.clientY;
      // légère accélération : précis en petits gestes, rapide en grands balayages
      const acc = (v) => v * (1 + Math.min(1.2, Math.abs(v) / 40));
      S.mx += acc(dx) * sens(); S.my += acc(dy) * sens();
    }
  }
  function end(t) {
    const f = fingers.get(t.identifier); if (!f) return; fingers.delete(t.identifier);
    if (f.el) f.el.classList.remove('down');
    if (f.kind === 'joy') { S.tx = S.ty = 0; knob.style.transform = ''; joyEl.classList.remove('on', 'sprinting'); if (sprintLock) { sprintLock = false; I.touchKey('sprint', false); } }
    else if (f.kind === 'btn') hold(f.b, false);
  }
  const opts = { passive: false };
  root.addEventListener('touchstart', (e) => { e.preventDefault(); S.usingTouch = true; onTap?.(); for (const t of e.changedTouches) start(t, t.target); }, opts);
  root.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) move(t); }, opts);
  const up = (e) => { e.preventDefault(); for (const t of e.changedTouches) end(t); };
  root.addEventListener('touchend', up, opts); root.addEventListener('touchcancel', up, opts);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  function releaseAll() { for (const t of [...fingers.keys()]) end({ identifier: t }); for (const id of toggled) { btnEl[id]?.classList.remove('on'); hold(BTNS.find((b) => b.id === id), false); } toggled.clear(); I.touchClear(); }

  // état du jeu → boutons montrés (à pied, voiture, hélico, lunette, action possible, série prête, mort)
  let lastK = '';
  function sync(game) {
    const g = game && !game.paused && !game.over ? game : null, a = g?.player;
    const on = !!(g && a);
    if (!on) { if (root.classList.contains('on')) { root.classList.remove('on'); releaseAll(); } return; }
    root.classList.add('on');
    const W = a.alive && g.weapon?.(a), scope = !!(g.aiming && W && WEAPONS[W.id]?.scope);
    const mode = !a.alive ? 'dead' : a.inCar?.kind === 'heli' ? 'heli' : a.inCar ? 'car' : 'foot';
    const prompt = !!document.getElementById('prompt')?.classList.contains('on');
    const k = `${mode}|${scope}|${prompt}|${a.rewards?.length || 0}|${!!g.thr}|${a.inCar?.kind || ''}`;
    if (k === lastK) return; lastK = k;
    root.dataset.mode = mode; root.classList.toggle('scope', scope); root.classList.toggle('prompt', prompt); root.classList.toggle('ready', !!a.rewards?.length); root.classList.toggle('thr', !!g.thr);
    root.classList.toggle('skate', a.inCar?.kind === 'skate');
    btnEl.view.querySelector('small').textContent = scope ? 'Zoom' : 'Vue'; btnEl.view.querySelector('.ic').innerHTML = scope ? P.zoom : P.view;
    // la visée basculée se relâche quand on change de mode (mort, véhicule)
    if (mode !== 'foot' && toggled.has('aim')) { toggled.delete('aim'); btnEl.aim.classList.remove('on'); I.touchKey('aim', false); }
  }
  return { root, sync, releaseAll };
}
