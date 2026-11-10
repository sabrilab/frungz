// Entrées : clavier + souris, et manette (API Gamepad, disposition standard : DualShock 4 / Xbox).
// Les actions sont lues par le jeu sous forme d'états (down) et de fronts (pressed).
const KEYMAP = {
  fire: ['Mouse0'], aim: ['Mouse2'], jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft'], duck: ['KeyC'],
  interact: ['KeyE'], car: ['KeyF'], reload: ['KeyR'], build: ['KeyQ'], grenade: ['KeyG'], view: ['KeyV'], shop: ['KeyB'], inv: ['Tab'],
  w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'], w4: ['Digit4'], next: [], horn: ['KeyH'], streak: ['KeyX'], pause: ['Escape', 'KeyP'], map: ['KeyM'],
};
// DualShock 4 (mapping « standard ») : 0 ✕, 1 ○, 2 □, 3 △, 4 L1, 5 R1, 6 L2, 7 R2, 8 Share, 9 Options, 10 L3, 11 R3, 12-15 croix, 16 PS, 17 pavé
const PADMAP = {
  jump: [0], crouch: [1], interact: [2], next: [3], duck: [4], grenade: [5], build: [13], aim: [6], fire: [7], inv: [8], pause: [9],
  sprint: [10], view: [11], shop: [12], horn: [13], w1: [], map: [17], streak: [15], car: [2], reload: [14],
};
export const PS = { jump: '✕', crouch: '○', duck: 'L1', interact: '□', next: '△', grenade: 'R1', build: '↓', aim: 'L2', fire: 'R2', sprint: 'L3', view: 'R3', shop: '↑', reload: '←', car: '□', inv: 'SHARE', pause: 'OPTIONS', map: 'PAVÉ', horn: '↓', streak: '→' };
export const KB = { jump: 'Espace', crouch: 'Ctrl', duck: 'C', interact: 'E', next: '1-4', grenade: 'G', build: 'Q', aim: 'Clic droit', fire: 'Clic', sprint: 'Maj', view: 'V', shop: 'B', reload: 'R', car: 'F', inv: 'Tab', pause: 'Échap', map: 'M', horn: 'H', streak: 'X' };

export function createInput(dom) {
  const keys = new Set(); const pressedQ = new Set();
  const st = { mx: 0, my: 0, lookX: 0, lookY: 0, moveX: 0, moveY: 0, pad: null, usingPad: false, locked: false, triggerR: 0, triggerL: 0, wheel: 0 };
  const settings = { sens: 1, padSens: 1, invertY: false, assist: true };
  addEventListener('keydown', (e) => { if (e.repeat) return; keys.add(e.code); pressedQ.add(e.code); st.usingPad = false; if (e.code === 'Tab') e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  dom.addEventListener('mousedown', (e) => { keys.add('Mouse' + e.button); pressedQ.add('Mouse' + e.button); st.usingPad = false; });
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
      b.forEach((v, i) => { if (v && !padPrev[i]) { padPressed.add(i); st.usingPad = true; } padPrev[i] = v; });
      const ax = p.axes;
      st.moveX = dz(ax[0] || 0); st.moveY = dz(ax[1] || 0);
      // courbe de réponse pour la visée (précise au centre, rapide au bord)
      const rx = dz(ax[2] || 0, 0.1), ry = dz(ax[3] || 0, 0.1);
      st.lookX = Math.sign(rx) * Math.pow(Math.abs(rx), 1.8); st.lookY = Math.sign(ry) * Math.pow(Math.abs(ry), 1.8);
      st.triggerR = p.buttons[7]?.value || 0; st.triggerL = p.buttons[6]?.value || 0;
      if (Math.abs(st.moveX) + Math.abs(st.moveY) + Math.abs(rx) + Math.abs(ry) > 0.2) st.usingPad = true;
    } else { st.moveX = st.moveY = st.lookX = st.lookY = 0; st.triggerR = st.triggerL = 0; }
  }
  function down(a) {
    if (KEYMAP[a]?.some((k) => keys.has(k))) return true;
    if (st.pad && PADMAP[a]?.some((i) => st.pad.buttons[i] && (st.pad.buttons[i].pressed || st.pad.buttons[i].value > 0.4))) return true;
    return false;
  }
  function pressed(a) { return KEYMAP[a]?.some((k) => pressedQ.has(k)) || PADMAP[a]?.some((i) => padPressed.has(i)) || false; }
  // boutons bruts de la manette (navigation dans les menus)
  const padHit = (i) => padPressed.has(i);
  function endFrame() { pressedQ.clear(); st.mx = 0; st.my = 0; st.wheel = 0; }
  // déplacement clavier (ZQSD et WASD : codes physiques)
  function move() {
    let x = 0, y = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    x += st.moveX; y += st.moveY; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  function rumble(strong = 0.5, weak = 0.5, ms = 80) { try { st.pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch {} }
  const label = (a) => (st.usingPad ? PS[a] : KB[a]);
  return { st, settings, poll, down, pressed, endFrame, move, rumble, label, keys, padHit };
}
