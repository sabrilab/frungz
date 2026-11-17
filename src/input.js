import { haptic } from './natif.js';
// Entrées : clavier + souris, manette, et tactile (boutons et joystick de src/tactile.js) (API Gamepad, disposition standard : DualShock 4 / Xbox).
// Les actions sont lues par le jeu sous forme d'états (down) et de fronts (pressed).
// Actions du jeu, dans l'ordre de la fenêtre des réglages (rubrique, nom affiché). « up/down/left/right » : déplacement au clavier (la manette utilise le stick gauche).
export const ACTIONS = [
  ['Déplacement', 'up', 'Avancer'], ['Déplacement', 'down', 'Reculer'], ['Déplacement', 'left', 'Gauche'], ['Déplacement', 'right', 'Droite'],
  ['Déplacement', 'jump', 'Sauter / escalader'], ['Déplacement', 'sprint', 'Sprinter (lunette : retenir son souffle)'], ['Déplacement', 'crouch', 'Roulade / glissade'], ['Déplacement', 'duck', 'S\'accroupir'],
  ['Combat', 'fire', 'Tirer'], ['Combat', 'aim', 'Viser'], ['Combat', 'reload', 'Recharger'], ['Combat', 'next', 'Arme suivante'],
  ['Combat', 'w1', 'Arme 1'], ['Combat', 'w2', 'Arme 2'], ['Combat', 'w3', 'Arme 3'], ['Combat', 'w4', 'Arme 4'],
  ['Combat', 'grenade', 'Lancer (maintenir pour viser)'], ['Combat', 'streak', 'Série d\'élimination'], ['Combat', 'build', 'Barricade (maintenir pour viser)'],
  ['Actions', 'interact', 'Agir, ramasser'], ['Actions', 'car', 'Monter / descendre d\'un véhicule'], ['Actions', 'horn', 'Klaxon'], ['Actions', 'view', 'Vue 1re / 3e personne'],
  ['Interface', 'shop', 'Armurerie (à la base)'], ['Interface', 'inv', 'Sac'], ['Interface', 'map', 'Carte'], ['Interface', 'pause', 'Pause'],
];
export const ACTION_NAME = Object.fromEntries(ACTIONS.map(([, id, n]) => [id, n]));
// actions qui peuvent partager une touche sans gêne (elles ne servent pas au même moment)
const SHARE = [['interact', 'car'], ['build', 'horn'], ['shop', 'interact'], ['shop', 'car']];
export const canShare = (a, b) => SHARE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
// préréglages clavier (codes physiques : la touche reste au même endroit en AZERTY comme en QWERTY)
const KB_STD = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  fire: ['Mouse0'], aim: ['Mouse2'], jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft'], duck: ['KeyC'],
  interact: ['KeyE'], car: ['KeyF'], reload: ['KeyR'], build: ['KeyQ'], grenade: ['KeyG'], view: ['KeyV'], shop: ['KeyB'], inv: ['Tab'],
  w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'], w4: ['Digit4'], next: [], horn: ['KeyH'], streak: ['KeyX'], pause: ['Escape', 'KeyP'], map: ['KeyM'] };
export const KB_PRESETS = {
  standard: { nom: 'Standard', desc: 'ZQSD / WASD, Ctrl roulade, C accroupi', map: KB_STD },
  classique: { nom: 'Classique FPS', desc: 'C roulade, Ctrl accroupi, F agir, E véhicule, boutons latéraux de la souris : lancer et série',
    map: { ...KB_STD, crouch: ['KeyC'], duck: ['ControlLeft'], interact: ['KeyF'], car: ['KeyE'], grenade: ['KeyG', 'Mouse3'], streak: ['KeyX', 'Mouse4'], next: ['KeyT'] } },
  gaucher: { nom: 'Gaucher', desc: 'flèches pour bouger, pavé numérique et touches de droite pour le reste',
    map: { ...KB_STD, up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['Numpad0', 'Space'], sprint: ['ShiftRight'], crouch: ['ControlRight'], duck: ['Numpad1'],
      interact: ['Enter'], car: ['NumpadEnter'], reload: ['Numpad2'], build: ['Numpad3'], grenade: ['Numpad4'], view: ['Numpad5'], shop: ['Numpad6'], inv: ['Numpad7'], horn: ['Numpad9'], streak: ['Numpad8'], map: ['NumpadAdd'], w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'], w4: ['Digit4'], next: ['NumpadDecimal'], pause: ['Escape', 'Backspace'] } },
};
// DualShock 4 (mapping « standard ») : 0 ✕, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, 8 Share, 9 Options, 10 L3, 11 R3, 12-15 croix, 16 PS, 17 pavé
const PAD_STD = { jump: [0], crouch: [1], interact: [2], next: [3], duck: [4], grenade: [5], build: [13], aim: [6], fire: [7], inv: [8], pause: [9],
  sprint: [10], view: [11], shop: [12], horn: [13], w1: [], w2: [], w3: [], w4: [], map: [17], streak: [15], car: [2], reload: [14] };
export const PAD_PRESETS = {
  standard: { nom: 'Standard', desc: '✕ saut, ○ roulade, L1 accroupi, R1 lancer', map: PAD_STD },
  tactique: { nom: 'Tactique', desc: 'R3 roulade et glissade (sans lâcher le stick de visée), ○ accroupi, ↓ vue', map: { ...PAD_STD, crouch: [11], duck: [1], view: [13], build: [4], horn: [] } },
  pare_chocs: { nom: 'Gâchettes hautes', desc: 'L1 saut, R1 roulade : on saute et on glisse sans quitter le stick droit ; ✕ lancer, ○ accroupi', map: { ...PAD_STD, jump: [4], crouch: [5], grenade: [0], duck: [1] } },
};
const PADNAMES = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'PAVÉ'];
export const padName = (i) => PADNAMES[i] ?? 'B' + i;
// nom d'une touche : la vraie lettre du clavier quand le navigateur la donne (AZERTY : KeyW s'affiche Z)
const KEYNAMES = { Mouse0: 'Clic', Mouse1: 'Clic molette', Mouse2: 'Clic droit', Mouse3: 'Souris 4', Mouse4: 'Souris 5', Space: 'Espace', ShiftLeft: 'Maj', ShiftRight: 'Maj droite', ControlLeft: 'Ctrl', ControlRight: 'Ctrl droit',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', Escape: 'Échap', Enter: 'Entrée', NumpadEnter: 'Entrée (pavé)', Backspace: 'Retour', CapsLock: 'Verr. maj', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumpadAdd: '+ (pavé)', NumpadDecimal: '. (pavé)', Backquote: '²', MetaLeft: 'Cmd', MetaRight: 'Cmd droite' };
let layout = null; try { navigator.keyboard?.getLayoutMap?.().then((m) => { layout = m; }).catch(() => {}); } catch {}
export function keyName(code) {
  if (!code) return '—'; if (KEYNAMES[code]) return KEYNAMES[code];
  const l = layout?.get?.(code); if (l && l.trim()) return l.toUpperCase();
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad(\d)$/, '$1 (pavé)').replace(/^F(\d+)$/, 'F$1');
}
const clone = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v]]));
// configuration enregistrée { kbPreset, padPreset, kb: { action: [codes] }, pad: { action: [boutons] } } → tables utilisées par le jeu
export function resolveBinds(b = {}) {
  const kb = clone((KB_PRESETS[b.kbPreset] || KB_PRESETS.standard).map), pad = clone((PAD_PRESETS[b.padPreset] || PAD_PRESETS.standard).map);
  for (const [a, v] of Object.entries(b.kb || {})) if (Array.isArray(v)) kb[a] = [...v];
  for (const [a, v] of Object.entries(b.pad || {})) if (Array.isArray(v)) pad[a] = [...v];
  return { kb, pad };
}
let KEYMAP = clone(KB_STD), PADMAP = clone(PAD_STD);
// libellés courts pour l'écran (première touche affectée)
export const PS = {}, KB = {};
export const TOUCH = { jump: 'SAUT', crouch: 'GLISSADE', duck: 'ACCROUPI', interact: 'AGIR', next: 'ARME', grenade: 'LANCER', build: 'BARRICADE', aim: 'VISER', fire: 'TIR', sprint: 'SOUFFLE', view: 'VUE', shop: 'AGIR', reload: 'RECHARGER', car: 'AGIR', inv: 'SAC', pause: '☰', map: 'CARTE', horn: 'KLAXON', streak: 'SÉRIE' };
function relabel() {
  for (const k of Object.keys(KB)) delete KB[k]; for (const k of Object.keys(PS)) delete PS[k];
  for (const [, a] of ACTIONS) { KB[a] = KEYMAP[a]?.length ? keyName(KEYMAP[a][0]) : '—'; PS[a] = PADMAP[a]?.length ? padName(PADMAP[a][0]) : '—'; }
  KB.next = KEYMAP.next?.length ? keyName(KEYMAP.next[0]) : '1-4';
}
relabel();

export function createInput(dom) {
  const keys = new Set(); const pressedQ = new Set();
  const st = { mx: 0, my: 0, lookX: 0, lookY: 0, moveX: 0, moveY: 0, pad: null, usingPad: false, locked: false, triggerR: 0, triggerL: 0, wheel: 0, tx: 0, ty: 0, usingTouch: false };
  // actions tenues par les boutons tactiles (src/tactile.js), et leurs fronts
  const virt = new Set(), virtQ = new Set();
  function touchKey(a, on) { if (on) { if (!virt.has(a)) virtQ.add(a); virt.add(a); } else virt.delete(a); st.usingTouch = true; st.usingPad = false; }
  const touchClear = () => { virt.clear(); st.tx = st.ty = 0; };
  const settings = { sens: 1, padSens: 1, touchSens: 1, invertY: false, assist: true };
  addEventListener('keydown', (e) => { if (e.repeat) return; keys.add(e.code); pressedQ.add(e.code); st.usingPad = false; st.usingTouch = false; if (e.code === 'Tab') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  // capture d'une touche pour la réaffecter (fenêtre des réglages) : la prochaine touche, clic ou bouton de manette part au rappel
  let capture = null; const captured = (kind, code) => { const f = capture; capture = null; f?.(kind, code); };
  addEventListener('keydown', (e) => { if (!capture) return; e.preventDefault(); e.stopImmediatePropagation(); captured('kb', e.code); }, true);
  addEventListener('mousedown', (e) => { if (!capture || !e.target.closest?.('.kb-capture')) return; e.preventDefault(); e.stopImmediatePropagation(); captured('kb', 'Mouse' + e.button); }, true);
  addEventListener('contextmenu', (e) => { if (e.target.closest?.('.kb-capture')) e.preventDefault(); }, true);
  dom.addEventListener('mousedown', (e) => { keys.add('Mouse' + e.button); pressedQ.add('Mouse' + e.button); st.usingPad = false; st.usingTouch = false; });
  addEventListener('mouseup', (e) => keys.delete('Mouse' + e.button));
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { if (st.locked) st.wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('mousemove', (e) => { if (!st.locked) return; st.mx += e.movementX; st.my += e.movementY; });
  document.addEventListener('pointerlockchange', () => { st.locked = document.pointerLockElement === dom; });
  const padPrev = []; const padPressed = new Set();
  const dz = (v, d = 0.14) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
  function poll() {
    padPressed.clear();
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const p = pads[0] || null; st.pad = p;
    if (p) {
      const b = p.buttons.map((x) => x.value > 0.4 || x.pressed);
      b.forEach((v, i) => { if (v && !padPrev[i]) { if (capture) { padPrev[i] = v; captured('pad', i); return; } padPressed.add(i); st.usingPad = true; st.usingTouch = false; } padPrev[i] = v; });
      const ax = p.axes;
      st.moveX = dz(ax[0] || 0); st.moveY = dz(ax[1] || 0);
      // courbe de réponse pour la visée (précise au centre, rapide au bord)
      const rx = dz(ax[2] || 0, 0.1), ry = dz(ax[3] || 0, 0.1);
      st.lookX = Math.sign(rx) * Math.pow(Math.abs(rx), 1.8); st.lookY = Math.sign(ry) * Math.pow(Math.abs(ry), 1.8);
      // gâchettes analogiques : celles qui sont affectées au tir et à la visée (R2 et L2 par défaut)
      const tv = (a) => Math.max(0, ...(PADMAP[a] || []).map((i) => p.buttons[i]?.value || 0)); st.triggerR = tv('fire'); st.triggerL = tv('aim');
      if (Math.abs(st.moveX) + Math.abs(st.moveY) + Math.abs(rx) + Math.abs(ry) > 0.2) st.usingPad = true;
    } else { st.moveX = st.moveY = st.lookX = st.lookY = 0; st.triggerR = st.triggerL = 0; }
  }
  function down(a) {
    if (virt.has(a)) return true;
    if (KEYMAP[a]?.some((k) => keys.has(k))) return true;
    if (st.pad && PADMAP[a]?.some((i) => st.pad.buttons[i] && (st.pad.buttons[i].pressed || st.pad.buttons[i].value > 0.4))) return true;
    return false;
  }
  function pressed(a) { return virtQ.has(a) || KEYMAP[a]?.some((k) => pressedQ.has(k)) || PADMAP[a]?.some((i) => padPressed.has(i)) || false; }
  // boutons bruts de la manette (navigation dans les menus)
  const padHit = (i) => padPressed.has(i);
  function endFrame() { pressedQ.clear(); virtQ.clear(); st.mx = 0; st.my = 0; st.wheel = 0; }
  // déplacement clavier (ZQSD et WASD : codes physiques)
  function move() {
    let x = 0, y = 0;
    const k = (a) => KEYMAP[a]?.some((c) => keys.has(c));
    if (k('up')) y -= 1; if (k('down')) y += 1; if (k('left')) x -= 1; if (k('right')) x += 1;
    x += st.moveX + st.tx; y += st.moveY + st.ty; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  // vibration : manette, ou moteur haptique de l'iPhone dans l'app (Capacitor Haptics), espacée pour ne pas bourdonner
  let hapT = 0;
  function rumble(strong = 0.5, weak = 0.5, ms = 80) {
    try { st.pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch {}
    if (st.usingTouch && strong >= 0.25) { const now = performance.now(); if (now - hapT > 90) { hapT = now; haptic(strong > 0.7 ? 'HEAVY' : strong > 0.45 ? 'MEDIUM' : 'LIGHT'); } }
  }
  const label = (a) => (st.usingTouch ? TOUCH[a] : st.usingPad ? PS[a] : KB[a]);
  // configuration des touches : appliquée tout de suite, libellés de l'écran compris
  function setBinds(b) { const r = resolveBinds(b); KEYMAP = r.kb; PADMAP = r.pad; relabel(); }
  const binds = () => ({ kb: KEYMAP, pad: PADMAP });
  // attente d'une touche : ne passe pas aussi au jeu ; Échap annule (rappel avec code null)
  function captureNext(f) { capture = (kind, code) => f(kind, kind === 'kb' && code === 'Escape' ? null : code); }
  const cancelCapture = () => { capture = null; };
  return { st, settings, poll, down, pressed, endFrame, move, rumble, label, keys, padHit, touchKey, touchClear, setBinds, binds, captureNext, cancelCapture };
}
