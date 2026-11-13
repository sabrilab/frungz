// Mode entraînement (carte « La Salle », src/salle.js) : pas de Domination, réapparition immédiate, armes à prendre sur le mur,
// bots appelés à la demande (bornes d'arcade ou raccourcis clavier) avec trois comportements, cibles fixes au stand de tir,
// munitions infinies, invincibilité, toutes les grenades et séries, chrono du parcours et mesures (dégâts, précision,
// temps pour éliminer, vitesse, hauteur de saut) pour régler le gameplay et les déplacements.
import * as THREE from 'three';
import { WEAPONS, WEAPON_CATS, TEAMS, RARITY } from './data.js';
import { svg } from './icons.js';
import { STREAKS } from './game.js';
import { RANGE, TARGETS, ARENA, COURSE, SPAWN, WALL_Z, CABINETS, NEON } from './salle.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const ENEMY = { ordre: 'civils', civils: 'ordre' };
const MODES = { cible: 'Cible', mobile: 'Mobile', riposte: 'Riposte' };
const MODE_DESC = { cible: 'immobiles, ne tirent pas', mobile: 'bougent, ne tirent pas', riposte: 'se battent pour de vrai' };
const KEYS = { KeyT: 'bot', KeyY: 'vague', KeyU: 'mode', KeyK: 'effacer', KeyJ: 'atouts', KeyI: 'infini', KeyO: 'dieu' };
const f1 = (n) => n.toFixed(1).replace('.', ','), f2 = (n) => n.toFixed(2).replace('.', ',');
const store = { get(k, d) { try { const v = localStorage.getItem('frungz-salle-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('frungz-salle-' + k, JSON.stringify(v)); } catch {} } };

export function installEntrainement(Game) {
  const P = Game.prototype; const wrap = (name, fn) => { const orig = P[name]; P[name] = function (...args) { return fn.call(this, orig, ...args); }; };
  const on = (g) => !!g.opts?.training;

  // mise en place : la partie normale sans adversaires, puis la salle
  wrap('build', function (orig, ...args) {
    if (!on(this)) return orig.apply(this, args);
    this.opts.teamSize = 0; this.opts.friends = []; this.opts.squad = [];
    const r = orig.apply(this, args);
    this.matchLen = Infinity; this.scoreLimit = Infinity; this.specialT = Infinity;
    this.tr = new Trainer(this); return r;
  });
  for (const n of ['buildBases', 'buildShops', 'buildCars', 'buildRides', 'buildHelis']) wrap(n, function (orig, ...a) { if (!on(this)) return orig.apply(this, a); });
  wrap('buildReceleur', function (orig, ...a) { if (!on(this)) return orig.apply(this, a); this.recel = { pos: V(0, -999, 0), r: 0, prix: {}, bonus: {}, nom: '' }; });
  wrap('endMatch', function (orig, ...a) { if (!on(this)) return orig.apply(this, a); });
  wrap('announce', function (orig, big, ...a) { if (on(this) && big === 'DOMINATION') return orig.call(this, 'LA SALLE', "Prends une arme au mur · appelle des bots aux bornes", NEON.cyan, 3); return orig.call(this, big, ...a); });
  wrap('update', function (orig, dt, bg) { orig.call(this, dt, bg); if (this.tr && !(this.paused && !bg)) this.tr.update(dt); });
  wrap('updateHud', function (orig, ...a) { orig.apply(this, a); this.tr?.hud(); });
  wrap('interactions', function (orig, a, dt) { orig.call(this, a, dt); if (this.tr && a === this.player) this.tr.interact(a); });
  wrap('respawn', function (orig, a, first) { orig.call(this, a, first); this.tr?.placed(a, first); });
  wrap('kill', function (orig, t, by, opts) { const T = this.tr; if (T && by === this.player && t !== by) T.killed(t, opts); orig.call(this, t, by, opts); if (T) T.died(t); });
  wrap('damage', function (orig, t, amount, by, opts = {}) {
    const T = this.tr; if (!T) return orig.call(this, t, amount, by, opts);
    if (t === this.player && T.god) return;
    const hp0 = t.hp + (t.armor || 0); orig.call(this, t, amount, by, opts);
    if (by === this.player && t !== by) T.hit(t, Math.max(0, hp0 - Math.max(0, t.hp) - (t.armor || 0)), amount, opts);
  });
  wrap('fire', function (orig, a, o, d) {
    const T = this.tr; if (!T) return orig.call(this, a, o, d);
    if (a.bot && a.tmode && a.tmode !== 'riposte') return false; // cibles et bots mobiles ne tirent pas
    const ok = orig.call(this, a, o, d);
    if (a === this.player && ok) { T.shots++; if (T.infinite) { const W = this.weapon(a); if (W) W.mag = Math.max(W.mag, WEAPONS[W.id].mag - 1); } }
    return ok;
  });
  wrap('throwNade', function (orig, a, ...r) { if (this.tr && a.bot && a.tmode !== 'riposte') return; return orig.call(this, a, ...r); });
  wrap('botWalls', function (orig, b, dt) { if (this.tr && b.tmode !== 'riposte') return; return orig.call(this, b, dt); });
  wrap('updateBot', function (orig, b, dt) {
    const T = this.tr; if (!T || !b.tmode) return orig.call(this, b, dt);
    if (!b.alive || this.over) return;
    if (b.tmode === 'cible') { b.wish = V(); b.wantSprint = false; b.ai.path = null; b.yaw = b.tYaw ?? b.yaw; b.pitch = 0; if (b.marker) b.marker.visible = true; return; }
    orig.call(this, b, dt); if (b.marker) b.marker.visible = true;
  });
  // les bots de la salle tournent dans l'arène (ou foncent sur toi en riposte), au lieu de chercher des zones
  wrap('botDecide', function (orig, b) {
    if (!this.tr || !b.tmode) return orig.call(this, b);
    const p = this.player; const S = ARENA.spawn;
    if (b.tmode === 'riposte' && p.alive && Math.random() < 0.55) { const [x, z] = this.world.randomFree(p.pos.x, p.pos.z, 6); return this.botGo(b, { kind: 'zone', zone: { center: [x, z], radius: 3 } }, V(x, 0, z)); }
    const [x, z] = this.world.randomFree(rnd(S.x0, S.x1), rnd(S.z0, S.z1), 2); this.botGo(b, { kind: 'zone', zone: { center: [x, z], radius: 3 } }, V(x, 0, z));
  });
}

class Trainer {
  constructor(game) {
    this.g = game; game.tr = this; this.mode = store.get('mode', 'riposte'); if (!MODES[this.mode]) this.mode = 'riposte';
    this.infinite = store.get('infini', true); this.god = store.get('dieu', false);
    this.shots = 0; this.hits = 0; this.lastHitT = -1; this.last = null; this.ttk = null; this.spd = 0; this.spdMax = 0; this.spdMaxT = 0; this.jump = null; this.air = null;
    this.course = { run: false, t0: 0, last: null, best: store.get('record', null) }; this.prevX = null; this.kit = null; this.t = 0;
    const mr = game.mapRoot; this.slots = mr?.userData?.slots || []; this.cabs = []; mr?.traverse((o) => { if (o.userData?.cab) this.cabs.push(o); });
    // repère de l'arme visée sur le mur : un cadre qui s'allume
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, toneMapped: false, depthWrite: false })); hl.visible = false; hl.renderOrder = 3; game.root.add(hl); this.hl = hl;
    // cibles fixes du stand de tir (mannequins qui ne tirent pas et reviennent tout de suite)
    const team = ENEMY[game.player.team]; this.targets = [];
    for (const T of TARGETS) { const b = game.spawnActor(team, pick(TEAMS[team].skins), true, `Cible ${T.d} m`); b.tmode = 'cible'; b.tSpot = [RANGE.line + T.d, RANGE.lanes[T.lane] + T.dz]; b.tYaw = -Math.PI / 2; b.isTarget = true; game.respawn(b, true); this.targets.push(b); }
    game.player.slots.forEach((s) => s && (s.rarity = 'rare'));
    this.placed(game.player, true); this.refreshCabs();
    // raccourcis clavier (en plus des bornes, qui marchent à la manette)
    this.onKey = (e) => { if (window.__game !== game || game.paused || game.over || e.repeat || e.metaKey || e.ctrlKey) return; const id = KEYS[e.code]; if (id) { e.preventDefault(); this.action(id); } };
    addEventListener('keydown', this.onKey);
    // panneau à l'écran
    document.getElementById('trHud')?.remove(); const el = document.createElement('div'); el.id = 'trHud'; (document.getElementById('hud') || document.body).appendChild(el); this.el = el;
    document.body.classList.add('salle');
    this.nextHud = 0;
  }
  // ------------------------------------------------------------ actions
  action(id) {
    const g = this.g, a = g.player;
    if (id === 'bot') this.spawnBots(1);
    else if (id === 'vague') this.spawnBots(5);
    else if (id === 'mode') { const k = Object.keys(MODES); this.mode = k[(k.indexOf(this.mode) + 1) % k.length]; store.set('mode', this.mode); for (const b of this.bots()) { b.tmode = this.mode; b.ai.path = null; b.ai.think = 0; b.ai.target = null; } g.toast(`Bots : ${MODES[this.mode]} — ${MODE_DESC[this.mode]}`, NEON.jaune); }
    else if (id === 'effacer') { let n = 0; for (const b of this.bots()) { b.alive = false; b.gone = true; b.ch.root.visible = false; b.ai.path = null; n++; } g.toast(n ? `${n} bot${n > 1 ? 's' : ''} retiré${n > 1 ? 's' : ''}` : 'Aucun bot dans la salle', NEON.orange); }
    else if (id === 'atouts') { a.nades = Math.max(a.nades || 0, 9); a.frags = Math.max(a.frags || 0, 9); a.rewards = STREAKS[a.team].map((r) => r.id).reverse(); g.streakDirty = 1; g.drawStreakbar?.(); g.toast(`Grenades pleines · ${a.rewards.length} séries prêtes (${g.input.label('streak')} pour lancer)`, NEON.vert); }
    else if (id === 'infini') { this.infinite = !this.infinite; store.set('infini', this.infinite); g.toast(`Munitions infinies : ${this.infinite ? 'oui' : 'non'}`, NEON.violet); }
    else if (id === 'dieu') { this.god = !this.god; store.set('dieu', this.god); if (this.god) a.hp = 100; g.toast(`Invincible : ${this.god ? 'oui' : 'non'}`, NEON.cyan); }
    g.audio.play('uiSelect'); this.refreshCabs(); this.nextHud = 0;
  }
  bots() { return this.g.actors.filter((b) => b.bot && b.tmode && !b.isTarget && !b.gone); }
  spawnBots(n) {
    const g = this.g, team = ENEMY[g.player.team], S = ARENA.spawn; let made = 0;
    for (let i = 0; i < n; i++) {
      if (this.bots().length >= 24) { g.toast('24 bots au maximum dans la salle', NEON.orange); break; }
      let b = g.actors.find((x) => x.temp && x.gone && x.team === team && !x.isTarget);
      if (!b) { const k = g.actors.filter((x) => x.temp && x.team === team).length + 1; b = g.spawnActor(team, pick(TEAMS[team].skins), true, `Bot ${k}`); b.temp = true; }
      b.gone = false; b.tmode = this.mode; b.arena = true; g.respawn(b);
      const [x, z] = g.world.randomFree(rnd(S.x0, S.x1), rnd(S.z0, S.z1), 2); b.pos.set(x, g.world.groundY(x, z, 1), z); b.yaw = -Math.PI / 2; b.expire = Infinity; b.ai.think = rnd(0, 0.6);
      g.fx.ring(b.pos, TEAMS[team].color); made++;
    }
    if (made) g.toast(`${made > 1 ? made + ' bots' : 'Un bot'} dans l'arène · ${MODES[this.mode].toLowerCase()}`, NEON.cyan);
  }
  take(id) {
    const g = this.g, a = g.player, W = WEAPONS[id]; const i = W.cat === 'pistolet' ? 0 : 1;
    while (a.slots.length <= i) a.slots.push({ id: 'pistol', rarity: 'rare', mag: WEAPONS.pistol.mag });
    a.slots[i] = { id, rarity: 'rare', mag: W.mag }; g.equip(a, i);
    this.kit = { slots: a.slots.map((s) => ({ ...s })), cur: i };
    g.toast(`${W.name} en main`, NEON.jaune); g.audio.play('cloth', null, 0.6);
  }
  refreshCabs() { for (const o of this.cabs) { const c = o.userData.cab; o.userData.draw(this.cabState(c.id)); } }
  cabState(id) { return id === 'mode' ? MODES[this.mode].toUpperCase() : id === 'infini' ? (this.infinite ? 'OUI' : 'NON') : id === 'dieu' ? (this.god ? 'OUI' : 'NON') : id === 'effacer' || id === 'bot' || id === 'vague' ? (this.bots().length ? `${this.bots().length} EN JEU` : '') : ''; }
  // ------------------------------------------------------------ interactions (touche d'action, aussi à la manette)
  interact(a) {
    const g = this.g, I = g.input; this.hl.visible = false;
    if (g.ui.prompt || a.channel || !a.alive || a.inCar) return;
    // borne d'arcade devant soi
    let cab = null, bd = 1.5; for (const o of this.cabs) { const c = o.userData.cab; const fx = c.x + Math.sin(c.yaw) * 0.85, fz = c.z + Math.cos(c.yaw) * 0.85; const d = Math.hypot(a.pos.x - fx, a.pos.z - fz); if (d < bd) { bd = d; cab = c; } }
    if (cab) { const st = this.cabState(cab.id); g.ui.prompt = `<b>${I.label('interact')}</b> ${cab.titre.replace(/[<>]/g, '')} <span class="r">${st || cab.sous}</span>`; if (I.pressed('interact')) this.action(cab.id); return; }
    // arme visée sur le mur
    if (a.pos.z > WALL_Z + 3.4 || a.pos.x > -3) return;
    const o = g.camera.position, d = V(); g.camera.getWorldDirection(d); let hx, hy;
    if (d.z < -0.08) { const t = (WALL_Z - 0.1 - o.z) / d.z; hx = o.x + d.x * t; hy = o.y + d.y * t; } else { hx = a.pos.x; hy = 2; }
    let best = null, bs = 1.1; for (const s of this.slots) { const dd = Math.hypot((hx - s.x) / (s.w / 2), (hy - s.y) / (s.h / 2)); if (dd < bs) { bs = dd; best = s; } }
    if (!best) return;
    const W = WEAPONS[best.id]; this.hl.visible = true; this.hl.position.set(best.x, best.y, WALL_Z - 0.16); this.hl.scale.set(best.w, best.h, 1); this.hl.material.opacity = 0.1 + 0.06 * Math.sin(g.time * 6);
    const held = a.slots.some((s) => s?.id === best.id);
    g.ui.prompt = `<b>${I.label('interact')}</b> ${held ? 'Recharger' : 'Prendre'} <span class="r">${svg(W.ico)} ${W.name} · ${WEAPON_CATS[W.cat]}</span>`;
    if (I.pressed('interact')) { if (held) { const s = a.slots.find((s) => s?.id === best.id); s.mag = W.mag; g.equip(a, a.slots.indexOf(s)); } else this.take(best.id); }
  }
  // ------------------------------------------------------------ événements de la partie
  placed(a, first) {
    const g = this.g;
    if (a === g.player) {
      if (this.kit) { a.slots = this.kit.slots.map((s) => ({ ...s, mag: WEAPONS[s.id].mag })); g.equip(a, Math.min(this.kit.cur, a.slots.length - 1), true); }
      const [x, z] = g.world.randomFree(SPAWN.x, SPAWN.z, 1.5); a.pos.set(x, g.world.groundY(x, z, 1), z); a.yaw = SPAWN.yaw; g.cam.yaw = SPAWN.yaw; g.cam.pitch = -0.05; g.cam.snap = true;
    } else if (a.tSpot) { const [x, z] = a.tSpot; a.pos.set(x, g.world.groundY(x, z, 1), z); a.yaw = a.tYaw; a.armor = 0; a.spawnProt = 0; a.vel.set(0, 0, 0); }
    else if (a.arena) a.spawnProt = 0;
  }
  died(t) {
    const g = this.g;
    if (t === g.player) t.respawnT = 1.4;
    else if (t.isTarget) t.respawnT = 1.6;
    else if (t.arena) t.respawnT = 2.4; // corps visible un instant, puis il disparaît (temp)
    this.refreshCabs();
  }
  hit(t, dealt, raw, opts) {
    const g = this.g, now = g.time; if (now - this.lastHitT > 0.03) this.hits++; this.lastHitT = now;
    if (!t.trT0 || now - t.trLast > 4) { t.trT0 = now; t.trShots0 = this.shots - 1; t.trDmg = 0; } t.trLast = now; t.trDmg += raw;
    const dist = g.player.pos.distanceTo(t.pos);
    if (this.last && now - this.last.t < 0.03 && this.last.who === t) { this.last.dmg += raw; this.last.n++; this.last.head ||= !!opts.head; }
    else this.last = { t: now, who: t, dmg: raw, n: 1, head: !!opts.head, dist };
    this.nextHud = 0;
  }
  killed(t, opts) {
    const g = this.g; if (!t.trT0) return;
    const W = WEAPONS[g.weapon(g.player)?.id]; this.ttk = { t: Math.max(0, g.time - t.trT0), shots: Math.max(1, this.shots - (t.trShots0 ?? this.shots - 1)), head: !!opts?.head, w: W?.name || '', who: t.name };
    t.trT0 = 0; this.nextHud = 0;
  }
  // ------------------------------------------------------------ suivi : chrono du parcours, vitesse, saut
  update(dt) {
    const g = this.g, a = g.player; this.t += dt;
    if (this.god && a.alive) a.hp = Math.max(a.hp, 100);
    if (this.infinite && a.alive) { a.nades = Math.max(a.nades || 0, 3); a.frags = Math.max(a.frags || 0, 3); }
    // vitesse au sol (m/s) et pointe sur 2 s
    const sp = Math.hypot(a.vel.x, a.vel.z); this.spd += (sp - this.spd) * Math.min(1, dt * 10);
    if (sp > this.spdMax || this.t - this.spdMaxT > 2) { this.spdMax = sp; this.spdMaxT = this.t; }
    // saut : hauteur atteinte au-dessus du point d'appel, et distance
    if (!a.onGround && a.alive && !a.climb) { if (!this.air) this.air = { y0: a.pos.y, x0: a.pos.x, z0: a.pos.z, top: a.pos.y }; else this.air.top = Math.max(this.air.top, a.pos.y); }
    else if (this.air) { const up = this.air.top - this.air.y0, far = Math.hypot(a.pos.x - this.air.x0, a.pos.z - this.air.z0); if (up > 0.15 || far > 1.2) this.jump = { up, far }; this.air = null; }
    // parcours : on part en franchissant le portique vert (couloir aller), on s'arrête au portique rose (couloir retour)
    const gx = COURSE.start + 0.5, C = this.course;
    if (this.prevX != null && a.alive) {
      if (this.prevX < gx && a.pos.x >= gx && a.pos.z > COURSE.laneA[0] && a.pos.z < COURSE.laneA[1]) { C.run = true; C.t0 = g.time; g.toast('Parcours : chrono lancé', NEON.vert); g.audio.play('uiTick'); }
      if (C.run && this.prevX > gx && a.pos.x <= gx && a.pos.z > COURSE.laneB[0] && a.pos.z < COURSE.laneB[1]) {
        const t = g.time - C.t0; C.run = false; C.last = t; const rec = C.best == null || t < C.best; if (rec) { C.best = t; store.set('record', t); }
        g.announce(rec ? 'RECORD !' : f2(t) + ' s', rec ? `Parcours en ${f2(t)} s` : `Record : ${f2(C.best)} s`, rec ? NEON.jaune : '#fff', 2.2); g.audio.play('uiSelect');
      }
    }
    if (!a.alive) C.run = false;
    this.prevX = a.alive ? a.pos.x : null;
    if (this.t > this.nextHud) { this.nextHud = this.t + 0.12; this.draw(); }
  }
  hud() { const tm = document.getElementById('timer'); if (tm) { const s = this.g.time | 0; tm.textContent = `LA SALLE · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }
  draw() {
    const g = this.g, a = g.player, I = g.input, W = WEAPONS[g.weapon(a)?.id];
    const k = (code) => `<kbd>${code}</kbd>`; const pad = I.st?.usingPad || I.st?.usingTouch;
    const L = this.last, T = this.ttk, C = this.course;
    const acc = this.shots ? Math.round(Math.min(1, this.hits / this.shots) * 100) : null;
    const row = (lbl, val, cls = '') => `<div class="tr-row ${cls}"><span>${lbl}</span><b>${val}</b></div>`;
    const html = `<h4>LA SALLE <em>entraînement</em></h4>`
      + `<div class="tr-sec">`
      + row('Arme', W ? `${svg(W.ico)} ${W.name}` : '—')
      + row('Dernier impact', L ? `${Math.round(L.dmg)}${L.n > 1 ? ` <i>(${L.n} plombs)</i>` : ''}${L.head ? ' <i class="hd">TÊTE</i>' : ''} · ${f1(L.dist)} m` : '—')
      + row('Élimination', T ? `${f2(T.t)} s · ${T.shots} tir${T.shots > 1 ? 's' : ''}${T.head ? ' <i class="hd">TÊTE</i>' : ''}` : '—')
      + row('Précision', acc == null ? '—' : `${acc} % <i>(${this.hits}/${this.shots})</i>`)
      + `</div><div class="tr-sec">`
      + row('Vitesse', `${f1(this.spd)} m/s <i>pointe ${f1(this.spdMax)}</i>`)
      + row('Dernier saut', this.jump ? `${f2(this.jump.up)} m haut · ${f1(this.jump.far)} m` : '—')
      + row('Parcours', C.run ? `<span class="run">${f2(g.time - C.t0)} s</span>` : C.last != null ? `${f2(C.last)} s` : 'franchis le portique vert', C.run ? 'live' : '')
      + row('Record', C.best != null ? `${f2(C.best)} s` : '—')
      + `</div><div class="tr-sec tr-opts">`
      + `<span class="${'on'}">${pad ? '' : k('T')}${pad ? '' : k('Y')} Bots ${this.bots().length} · ${MODES[this.mode]}</span>`
      + `<span>${pad ? '' : k('U')} Comportement</span><span>${pad ? '' : k('K')} Effacer</span>`
      + `<span class="${this.infinite ? 'on' : ''}">${pad ? '' : k('I')} Munitions ∞</span><span class="${this.god ? 'on' : ''}">${pad ? '' : k('O')} Invincible</span><span>${pad ? '' : k('J')} Atouts</span>`
      + `</div>` + (pad ? '<p class="tr-hint">Bornes d\'arcade contre le mur ouest : approche-toi et appuie sur action</p>' : '');
    if (html !== this._html) { this._html = html; this.el.innerHTML = html; }
  }
  dispose() { removeEventListener('keydown', this.onKey); this.el?.remove(); document.body.classList.remove('salle'); }
}
