// Frungz : la partie. Acteurs (joueur et bots), parkour, tir, Domination, casse et butin, planques, receleur, voitures,
// lacrymogènes et fumigènes, barricades, interface.
import * as THREE from 'three';
import { makeCharacter, attachGun, gunInstance, chars } from './assets.js';
import { TEAMS, WEAPONS, RARITY, RARITY_ORDER, rollRarity, LOOT, LUXE_TYPES, COMMERCE_TYPES, SHOP_NAMES, SKIN_NAMES } from './data.js';
import { shopCase, lootMesh, beam, socle, baseSign, receleur, barricade, grenadeMesh, policeBadge, brassard, headMarker, textTex } from './props.js';
import { pointInPoly } from './world.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const ENEMY = { ordre: 'civils', civils: 'ordre' };
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const $ = (id) => document.getElementById(id);

const GRAV = 19, EYE = 1.62;
const BOT_NAMES = {
  ordre: ['Brigadier Lemoine', 'Gardien Diallo', 'Major Fontaine', 'Cdt Mercier', 'Agent Benali', 'Lt Garnier', 'Brigadier Roux', 'Agent Petit', 'Cpt Morel', 'Agent Nguyen', 'Agent Faure', 'Brigadier Haddad', 'Agent Lambert', 'Major Caron', 'Agent Leroy', 'Gardien Rey', 'Agent Blanc', 'Lt Masson', 'Agent Perrin', 'Agent Colin'],
  civils: ['Kéké Turbo', 'Tonton Flingue', 'La Fouine', 'Mamie Nitro', 'P\'tit Loup', 'Le Baron', 'Zizou Cash', 'Gégé Paillettes', 'Miss Pavé', 'Jojo Banane', 'Le Comte de Barbès', 'Rico Tongs', 'Nana Bling', 'Fifi Brindacier', 'Momo Croissant', 'Dédé Disco', 'La Mouette', 'Bébert Laser', 'Coco Rillette', 'Toto Platine'],
};

// ===================================================================================================================
export class Game {
  constructor(env) {
    Object.assign(this, env); // renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts, onEnd
    this.actors = []; this.shops = []; this.drops = []; this.socles = { ordre: [], civils: [] }; this.cars = []; this.walls = []; this.grenades = [];
    this.score = { ordre: 0, civils: 0 }; this.time = 0; this.matchLen = 600; this.over = false;
    this.zoneState = this.world.zones.filter((z) => !z.optionnelle || this.opts.teamSize >= 30).map((z) => ({ ...z, owner: null, cap: null, p: 0, contested: false }));
    this.scoreLimit = 100 * this.zoneState.length;
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.cam = { yaw: 0, pitch: 0, dist: 3, fps: !!this.save.settings?.fps, trauma: 0, bob: 0, dip: 0, roll: 0, kickP: 0, kickY: 0, fov: 70, shake: V() };
    this.ui = {}; this.nextUi = 0; this.feed = []; this.specialT = 75; this.stats = { kills: 0, deaths: 0, earned: 0, captures: 0, broken: 0, stolen: 0 };
    this.losQueue = 0;
  }

  // ---------------------------------------------------------------- mise en place
  build() {
    this.fx.setGround((x, z) => this.world.groundY(x, z), (p, big) => this.audio.tink(p, big)); this.buildBases(); this.buildShops(); this.buildReceleur(); this.buildCars(); this.buildZones();
    const T = this.save.team; const N = this.opts.teamSize;
    this.player = this.spawnActor(T, this.save.skin, false, 'Toi');
    for (const t of ['ordre', 'civils']) { const n = t === T ? N - 1 : N; for (let i = 0; i < n; i++) this.spawnActor(t, pick(TEAMS[t].skins), true, BOT_NAMES[t][i % 20] + (i >= 20 ? ' ' + (i / 20 | 0) : '')); }
    for (const a of this.actors) this.respawn(a, true);
    this.cam.yaw = this.player.yaw;
    this.minimapInit(); this.hudInit();
    this.announce('DOMINATION', 'Tiens A · B · C — casse, vole, revends', '#fff');
  }

  buildZones() {
    for (const z of this.zoneState) {
      const g = new THREE.Group(); g.position.set(z.center[0], this.world.groundY(z.center[0], z.center[1]) + 0.05, z.center[1]);
      const ring = new THREE.Mesh(new THREE.RingGeometry(z.radius - 0.25, z.radius, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8, depthWrite: false }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(z.radius, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.08, depthWrite: false }));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: textTex(z.id, { w: 128, h: 128, bg: null, fg: '#fff', size: 110 }), transparent: true, depthTest: false, side: THREE.DoubleSide }));
      flag.position.y = 6; flag.renderOrder = 9;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(z.radius, z.radius, 2.2, 48, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { c: { value: new THREE.Color('#fff') } }, vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 c; varying float vY; void main(){ gl_FragColor = vec4(c, 0.28*(1.0-vY)); }' }));
      wall.position.y = 1.1;
      g.add(ring, disc, flag, wall); this.root.add(g); z.g = g; z.mats = [ring.material, disc.material, wall.material]; z.flag = flag;
    }
  }

  buildBases() {
    const lvl = this.save.upgrades.socles || 0; const n = Math.min(9, 6 + lvl);
    for (const team of ['ordre', 'civils']) {
      const base = this.world.colliders.find((c) => c.type === 'poly' && c.id === 'base_' + team);
      const sgn = team === 'ordre' ? -1 : 1;
      const sx = base ? (sgn < 0 ? base.bb[2] - 1.6 : base.bb[0] + 1.6) : sgn * 97.3; const list = this.socles[team];
      const z0 = base ? base.bb[1] + 1.5 : -14, z1 = base ? base.bb[3] - 1.5 : 14; const step = (z1 - z0) / Math.max(1, n - 1);
      for (let i = 0; i < n; i++) {
        const z = z0 + i * step; const m = socle(team); const y = this.world.groundY(sx, z); m.position.set(sx, y, z); this.root.add(m);
        list.push({ team, pos: V(sx, y, z), item: null, mesh: m, itemMesh: null }); this.world.dynamic.push({ type: 'circle', x: sx, z, r: 0.55, h: 0.55, y0: y });
      }
      const sg = baseSign(team === 'ordre' ? 'COMMISSARIAT' : 'LA PLANQUE', team); const bx = base ? (sgn < 0 ? base.bb[2] - 0.3 : base.bb[0] + 0.3) : sgn * 98.8;
      sg.position.set(bx, this.world.groundY(bx, z0 - 1.2), z0 - 1.2); sg.rotation.y = sgn < 0 ? Math.PI / 2 : -Math.PI / 2; this.root.add(sg);
    }
  }

  // ---------- boutiques (gameplay.json v2 : vitrines cassables, intérieurs, butin placé dans la map) ----------
  buildShops() {
    const W = this.world, map = this.mapRoot;
    for (const b of this.world.gp.boutiques || []) {
      if (b.gamme === 'receleur') continue;
      const s = { id: b.id, enseigne: b.enseigne, gamme: b.gamme, vits: [], items: [], broken: false, respawnT: 0, alarmT: 0, interior: b.interieur?.poly };
      for (const v of b.vitrines) {
        const col = W.colliders.find((c) => c.vitrine === v.id); const n = V(v.normale[0], 0, v.normale[2]).normalize();
        const vit = { id: v.id, col, hp: v.pv || 120, max: v.pv || 120, broken: false, node: map.getObjectByName('VITRINE_' + v.id), nodeB: map.getObjectByName('VITRINE_' + v.id + '_CASSEE'), centre: V(...v.centre), n, w: v.largeur, h: v.hauteur, shop: s };
        vit.front = vit.centre.clone().addScaledVector(n, 1.3); vit.front.y = W.groundY(vit.front.x, vit.front.z);
        if (col) col.vit = vit; if (vit.nodeB) vit.nodeB.visible = false; s.vits.push(vit);
      }
      for (const it of b.butin) {
        const L = LOOT[it.type] || LOOT.default; const node = map.getObjectByName('BUTIN_' + it.id);
        s.items.push({ id: it.id, type: it.type, rarity: it.rarete || 'rare', nom: it.nom, valeur: it.valeur, poids: it.poids ?? L.kg, icon: L.icon, pos: V(...it.pos), node, taken: false });
      }
      s.front = s.vits[0]?.front || V(b.porte.pos[0], b.porte.pos[1], b.porte.pos[2]);
      this.shops.push(s);
    }
  }
  restock(s) {
    s.broken = false; s.alarmT = 0;
    for (const v of s.vits) { v.broken = false; v.hp = v.max; if (v.col) v.col.off = false; if (v.node) v.node.visible = true; if (v.nodeB) v.nodeB.visible = false; this.navAround(v); }
    for (const it of s.items) { it.taken = false; if (it.node) it.node.visible = true; }
  }
  navAround(v) { const c = v.centre; this.world.refreshNav(c.x - v.w, c.z - v.w, c.x + v.w, c.z + v.w); }
  shopItems(s) { return s.items.filter((i) => !i.taken); }
  makeItem(type, rarity) {
    const L = LOOT[type] || LOOT.default; const m = RARITY[rarity];
    const v = Math.round(L.v * rnd(0.8, 1.2) * ({ commun: 0.6, rare: 1.2, epique: 2.4, legendaire: 4.5 }[rarity]) / 10) * 10;
    return { type, rarity, nom: pick(L.names), valeur: v, poids: L.kg, icon: L.icon };
  }

  buildReceleur() {
    const r = this.world.gp.revente?.[0];
    const p = r ? [r.pos[0], r.pos[2]] : [3, 45.5];
    this.recel = { pos: V(p[0], r?.pos[1] || 0, p[1]), r: Math.max(4, (r?.rayon || 0) + 2), prix: r?.prix || { commun: 1, rare: 1, epique: 1, legendaire: 1 }, bonus: r?.bonus || {}, nom: r?.nom || 'Receleur' };
    if (!this.mapRoot.getObjectByName('RECELEUR')) { const m = receleur(); m.position.set(p[0], this.world.groundY(p[0], p[1]), p[1]); m.rotation.y = Math.PI / 2; this.root.add(m); this.world.dynamic.push({ type: 'box', x: p[0], z: p[1], hx: 1.0, hz: 2.3, h: 2.2, yaw: Math.PI / 2, cs: 0, sn: 1 }); }
    // marqueur flottant 💰
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex('€ RECELEUR', { w: 512, h: 128, bg: '#111', fg: '#ffcc3d', size: 64, border: '#ffcc3d' }), depthTest: false, transparent: true })); sp.scale.set(3.2, 0.8, 1); sp.position.set(p[0], (r?.pos[1] || 0) + 4.2, p[1]); sp.renderOrder = 9; this.root.add(sp);
  }
  recelPrice(it) { const k = this.recel.prix[it.rarity] ?? 0.4; return it.valeur * k * (1 + (this.recel.bonus[it.type] || 0)); }

  // ---------------------------------------------------------------- acteurs
  spawnActor(team, skin, bot, name) {
    const ch = makeCharacter(skin); this.root.add(ch.root);
    const a = { team, skin, bot, name, ch, pos: V(), vel: V(), yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false, onGround: true, slots: [], cur: 0, fireT: 0, reloadT: 0, bag: [], bagKg: 0, mats: 30, nades: 2, momentum: 0, slideT: 0, rollT: 0, climb: null, respawnT: 0, lastHit: 0, anim: null, inCar: null, stats: { k: 0, d: 0 }, spotted: 0, gasT: 0, channel: null, cash: 0, regenT: 0, id: this.actors.length };
    a.cap = 20 + (bot ? 8 : (this.save.upgrades.sac || 0) * 8);
    // tenue : police nationale (bleu marine, brassard orange, POLICE dans le dos) ou civils loufoques
    if (team === 'ordre') {
      ch.model.traverse((o) => { if (o.isMesh && o.material) { const n = o.material.name || ''; if (/^Swat$|Grey|Suit$|Adventurer|Worker/.test(n) && !/Skin|Hair|Eye|Black|Visor/.test(n)) o.material.color.lerp(new THREE.Color('#1c2a4a'), 0.75); } });
      const back = policeBadge(); const chest = ch.bones.Chest || ch.bones.Torso; if (chest) { const ws = V(); ch.model.updateMatrixWorld(true); chest.getWorldScale(ws); back.scale.setScalar(1 / ws.x); back.position.set(0, 0.25 / ws.x, -0.17 / ws.x); back.rotation.y = Math.PI; chest.add(back); }
      const arm = ch.bones.UpperArmL; if (arm) { const b = brassard(); const ws = V(); arm.getWorldScale(ws); b.scale.setScalar(1 / ws.x); b.position.set(0, 0.12 / ws.x, 0); arm.add(b); }
    }
    if (bot) { const mk = headMarker(team === this.save.team ? (team === 'ordre' ? '#3d8bff' : '#ff7a2f') : '#ff3030'); mk.position.y = 2.25; mk.visible = team === this.save.team; ch.root.add(mk); a.marker = mk; }
    for (const k of Object.keys(ch.actions)) { const act = ch.actions[k]; if (/Death/.test(k)) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; } if (/Roll|Gun_Shoot|HitRecieve|Interact|Punch/.test(k)) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = false; } }
    a.ai = { path: null, pi: 0, goal: null, task: null, think: Math.random() * 2, target: null, seeT: 0, react: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: V(), nadeT: rnd(8, 20), los: false, losT: 0 };
    this.actors.push(a); return a;
  }
  loadout(a) {
    a.slots = [{ id: 'pistol', rarity: 'commun', mag: WEAPONS.pistol.mag }];
    if (a.bot) { const pool = a.team === 'ordre' ? ['smg', 'rifle', 'shotgun', 'rifle'] : ['smg', 'shotgun', 'rifle', 'smg']; const id = pick(pool); a.slots.push({ id, rarity: rollRarity(), mag: WEAPONS[id].mag }); a.cur = 1; }
    else { const prim = this.save.primary && this.save.unlocked.includes(this.save.primary) ? this.save.primary : null; if (prim && prim !== 'pistol') { a.slots.push({ id: prim, rarity: 'rare', mag: WEAPONS[prim].mag }); a.cur = 1; } else a.cur = 0; }
    this.equip(a, a.cur, true);
  }
  equip(a, i, silent) {
    if (!a.slots[i]) return; a.cur = i; a.reloadT = 0; a.fireT = Math.max(a.fireT, 0.25);
    attachGun(a.ch, a.slots[i].id); a.ch.meshes = null; a.lodShadow = undefined; const rc = RARITY[a.slots[i].rarity].color;
    a.ch.gun.traverse((o) => { if (o.isMesh && a.slots[i].rarity !== 'commun') { o.material = o.material.map ? o.material : (Array.isArray(o.material) ? o.material.map((m) => tint(m, rc)) : tint(o.material, rc)); } });
    if (!a.bot) { this.viewGun(); if (!silent) this.audio.play('cloth', null, 0.5); }
    function tint(m, c) { const n = m.clone(); if (/Main|Body|Wood|Metal/i.test(m.name)) { n.emissive = new THREE.Color(c); n.emissiveIntensity = 0.12; } return n; }
  }
  respawn(a, first) {
    const sp = pick(this.world.spawns[a.team].slice(0, Math.max(20, this.opts.teamSize))); const [x, z] = this.world.randomFree(sp.x, sp.z, this.actors.length > 50 ? 4 : 2.5);
    a.pos.set(x, this.world.groundY(x, z), z); a.vel.set(0, 0, 0); a.yaw = a.team === 'ordre' ? Math.PI / 2 : -Math.PI / 2; a.pitch = 0;
    a.hp = 100; a.armor = a.bot ? (a.team === 'ordre' ? 50 : 25) : 25 * (this.save.upgrades.gilet || 0); a.alive = true; a.bag = []; a.bagKg = 0; a.nades = 2; a.momentum = 0; a.slideT = a.rollT = 0; a.climb = null; a.gasT = 0; a.channel = null;
    if (!a.bot) a.mats = Math.max(a.mats, 30 + 20 * (this.save.upgrades.mats || 0)); else a.mats = 40;
    a.ch.root.visible = true; a.ch.model.rotation.x = 0; this.loadout(a); this.setAnim(a, 'Idle_Gun', 0);
    a.ai.path = null; a.ai.task = null; a.ai.think = 0; a.spawnProt = 2.5;
    if (a === this.player) { this.cam.yaw = a.yaw; this.cam.pitch = 0; this.cam.snap = true; if (!first) this.announce('', 'De retour dans la rue', '#fff', 1.2); }
  }
  setAnim(a, name, fade = 0.18, speed = 1) {
    const act = a.ch.actions[name]; if (!act) return; act.timeScale = speed;
    if (a.anim === name) return; const prev = a.ch.actions[a.anim];
    act.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (prev) prev.fadeOut(fade);
    a.anim = name;
  }
  weapon(a) { return a.slots[a.cur]; }
  feetSpeed(a) { return Math.hypot(a.vel.x, a.vel.z); }
  isCivil(a) { return a.team === 'civils'; }

  // ---------------------------------------------------------------- dégâts
  damage(t, amount, by, opts = {}) {
    if (!t.alive || this.over) return;
    if (t.spawnProt > 0) amount *= 0.2;
    if (t.rollT > 0) amount *= 0.5; // roulade : on esquive à moitié
    if (by && by.team === t.team && by !== t) return;
    let dmg = amount; if (t.armor > 0) { const ab = Math.min(t.armor, dmg * 0.6); t.armor -= ab; dmg -= ab; }
    t.hp -= dmg; t.lastHit = this.time; t.regenT = 5;
    if (by) { t.ai.target = by; t.ai.seeT = 1; if (!t.bot) this.hurtDir(by.pos); if (by.bot === false || t.bot === false) by.spotted = this.time; }
    if (!t.bot) { this.cam.trauma = Math.min(1, this.cam.trauma + 0.25 + amount / 120); this.input.rumble(0.6, 0.3, 120); }
    if (by === this.player && t !== this.player) {
      this.fx.number(V(t.pos.x, t.pos.y + 2 + Math.random() * 0.3, t.pos.z), Math.round(amount), opts.head ? '#ffcf3d' : '#fff', opts.head);
      this.hitmark(t.hp <= 0, opts.head); this.audio.hitmark(opts.head); t.spotted = this.time;
    }
    if (t.hp > 0) { if (Math.random() < 0.3) this.audio.play('voxPain', t.pos, 0.7, [0.95, 1.1], 0.2); if (!t.channel && Math.random() < 0.25 && t.ch.actions.HitRecieve) { const h = t.ch.actions.HitRecieve; h.reset().setEffectiveWeight(0.6).fadeIn(0.05).play(); setTimeout(() => h.fadeOut(0.15), 250); } if (t.channel) t.channel = null; return; }
    this.kill(t, by, opts);
  }
  kill(t, by, opts) {
    t.alive = false; t.hp = 0; t.respawnT = t.bot ? 6 : 5; t.stats.d++; t.channel = null;
    if (t.inCar) this.exitCar(t, true);
    this.setAnim(t, 'Death', 0.1); this.audio.play('voxDie', t.pos, 0.9);
    // le sac tombe au sol (et l'arme principale, parfois)
    if (t.bag.length) { this.dropPile(t.pos, t.bag.splice(0)); t.bagKg = 0; }
    const w = t.slots[t.cur]; if (w && w.id !== 'pistol' && (Math.random() < 0.6 || !t.bot)) this.dropPile(t.pos.clone().add(V(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6))), [], { id: w.id, rarity: w.rarity });
    if (by && by !== t) {
      by.stats.k++;
      if (by === this.player) { this.stats.kills++; this.earn(50 + (opts.head ? 25 : 0), opts.head ? 'Tir à la tête' : 'Élimination'); by.mats += 10; this.audio.kill(); this.input.rumble(0.9, 0.6, 160); }
    }
    if (t === this.player) { this.stats.deaths++; this.announce('ÉLIMINÉ', by ? `par ${by.name}` : '', '#ff4a4a', 2.5); }
    this.killFeed(by, t, opts);
  }
  earn(n, why, big) {
    n = Math.round(n); if (!n) return; this.save.bank += n; this.stats.earned += n; this.persist();
    this.toast(`+${fmt(n)} € · ${why}`, '#ffcc3d'); this.audio.cash(big || n >= 500);
  }

  // ---------------------------------------------------------------- tir
  // rayon contre les acteurs (cylindres), renvoie { a, t, head }
  rayActors(o, d, far, skip) {
    let best = far, hit = null;
    for (const a of this.actors) {
      if (!a.alive || a === skip || a.inCar) continue;
      const fx = o.x - a.pos.x, fz = o.z - a.pos.z, A = d.x * d.x + d.z * d.z; if (A < 1e-8) continue;
      const B = 2 * (fx * d.x + fz * d.z), R = 0.42, C = fx * fx + fz * fz - R * R, D = B * B - 4 * A * C; if (D < 0) continue;
      const sq = Math.sqrt(D); for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
        if (t <= 0 || t >= best) continue; const y = o.y + d.y * t - a.pos.y; const top = a.slideT > 0 ? 1.1 : 1.85 - (a.crouchK || 0) * 0.55;
        if (y >= 0 && y <= top) { best = t; hit = { a, t, head: y > top - 0.32 }; break; }
      }
    }
    // voitures (boîte de collision)
    return hit;
  }
  fire(a, origin, dir) {
    const W = this.weapon(a); const D = WEAPONS[W.id]; const mult = RARITY[W.rarity].mult;
    if (a.reloadT > 0 || a.fireT > 0) return false;
    if (W.mag <= 0) { this.startReload(a); if (!a.bot) this.audio.click(); return false; }
    W.mag--; a.fireT = 1 / D.rps; a.lastShot = this.time;
    const muzzle = V(); (a.ch.gun?.userData.muzzle || a.ch.root).getWorldPosition(muzzle);
    if (!a.bot && this.cam.fps && this.vgun) this.vgun.userData.muzzle.getWorldPosition(muzzle);
    const moving = this.feetSpeed(a) > 2 ? 1.6 : 1; const aiming = !a.bot && this.aiming ? 0.45 : 1; const air = a.onGround ? 1 : 1.8;
    const spread = D.spread * moving * aiming * air * (a.crouch ? 0.7 : 1);
    this.audio.gun(D.sound, a === this.player ? null : a.pos, a === this.player ? 0.9 : 1);
    this.fx.muzzle(muzzle, D.pellets > 1 ? 1.4 : 1);
    // douille éjectée à droite de l'arme (pas pour le revolver, qui garde ses douilles)
    if (D.id !== 'revolver' && (a === this.player || a.pos.distanceToSquared(this.player.pos) < 625)) { const yw = a === this.player ? this.cam.yaw : a.yaw; const ep = V(); (a === this.player && this.cam.fps && this.vgun ? this.vgun : a.ch.gun || a.ch.root).getWorldPosition(ep); this.fx.casing(ep, V(-Math.cos(yw), 0, Math.sin(yw)), D.pellets > 1); }
    if (a === this.player) {
      const k = D.kick * (this.aiming ? 0.7 : 1); this.cam.kickP += k * rnd(0.8, 1.2); this.cam.kickY += k * rnd(-0.4, 0.4); this.cam.trauma = Math.min(1, this.cam.trauma + k * 2.2);
      this.input.rumble(D.pellets > 1 || D.dmg > 50 ? 0.8 : 0.25, 0.5, 60); this.ui.crossKick = 1;
    }
    if (a.bot) { a.ch.actions.Gun_Shoot && this.setUpper(a); }
    for (let p = 0; p < D.pellets; p++) {
      const d = dir.clone(); d.x += rnd(-1, 1) * spread; d.y += rnd(-1, 1) * spread; d.z += rnd(-1, 1) * spread; d.normalize();
      const hw = this.world.ray(origin, d, D.range); const ha = this.rayActors(origin, d, hw ? hw.t : D.range, a);
      let end;
      if (ha) {
        end = origin.clone().addScaledVector(d, ha.t);
        const falloff = ha.t > D.range * 0.5 ? lerp(1, 0.6, (ha.t - D.range * 0.5) / (D.range * 0.5)) : 1;
        this.damage(ha.a, D.dmg * mult * falloff * (ha.head ? (D.id === 'shotgun' ? 1.5 : 2) : 1), a, { head: ha.head, weapon: W.id });
        this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh');
      } else if (hw) {
        end = origin.clone().addScaledVector(d, hw.t);
        const c = hw.c; let kind = 'world';
        if (c?.vit) { kind = this.hitVitrine(c.vit, D.dmg * mult, a) ? 'glass' : 'metal'; }
        else if (c?.wall) { this.hitWall(c.wall, D.dmg * mult, a); kind = c.wall.team === 'ordre' ? 'metal' : 'world'; }
        else if (c?.car) { this.hitCar(c.car, D.dmg * mult * 0.6, a); kind = 'metal'; }
        else if (c && (c.tag === 'voiture' || c.tag === 'lampadaire' || c.tag === 'fourgon')) kind = 'metal';
        if (a === this.player || end.distanceTo(this.player.pos) < 40) this.fx.impact(end, hw.n, kind);
      } else end = origin.clone().addScaledVector(d, D.range);
      if (p < 3 || a === this.player) this.fx.tracer(muzzle, end);
    }
    // les bots entendent les coups de feu
    for (const b of this.actors) if (b.bot && b.alive && b.team !== a.team && !b.ai.target && b.pos.distanceToSquared(a.pos) < 900) { b.ai.target = a; b.ai.seeT = 0.5; }
    return true;
  }
  setUpper(a) { const s = a.ch.actions.Idle_Gun_Shoot; }
  startReload(a) { const W = this.weapon(a); if (a.reloadT > 0 || W.mag >= WEAPONS[W.id].mag) return; a.reloadT = WEAPONS[W.id].reload; if (!a.bot) this.audio.reload(); }

  // ---------------------------------------------------------------- vitrines
  hitVitrine(v, dmg, by) {
    if (v.broken) return false; v.hp -= dmg;
    if (v.hp > 0) { if (Math.random() < 0.3) this.audio.play('debris', v.centre, 0.25, [1.4, 1.8], 0.05); return true; }
    this.breakVitrine(v, by); return true;
  }
  breakVitrine(v, by) {
    const s = v.shop; v.broken = true; if (v.col) v.col.off = true; if (v.node) v.node.visible = false; if (v.nodeB) v.nodeB.visible = true;
    this.navAround(v);
    this.fx.shatter(v.centre, v.w, v.h * 0.8, [v.n.x, 0, v.n.z]); this.audio.glass(v.centre);
    if (!s.broken) { s.broken = true; s.respawnT = 150; s.alarmT = 25; this.audio.siren(v.centre); }
    if (by === this.player) { this.stats.broken++; by.mats += 15; this.toast(`🧱 +15 matériaux · ${s.enseigne}`, '#fff'); this.cam.trauma = Math.min(1, this.cam.trauma + 0.3); this.input.rumble(0.8, 0.8, 200); }
    // alerte : la Brigade est prévenue
    for (const b of this.actors) if (b.bot && b.alive && b.team === 'ordre' && b.pos.distanceTo(v.front) < 80 && Math.random() < 0.45) { b.ai.task = { kind: 'alarm', shop: s }; b.ai.path = null; b.ai.think = 0; }
    if (this.save.team === 'ordre' && by !== this.player) this.toast(`🚨 Casse en cours : ${s.enseigne}`, '#ff4a4a');
  }
  nearestVitrine(a, r) { let best = null, bd = r; for (const s of this.shops) for (const v of s.vits) { if (v.broken) continue; const d = Math.hypot(v.front.x - a.pos.x, v.front.z - a.pos.z); if (d < bd) { bd = d; best = v; } } return best; }
  nearestShopItem(a, r) { let best = null, bd = r; for (const s of this.shops) { if (!s.broken && s.vits.length) continue; for (const it of s.items) { if (it.taken) continue; const d = Math.hypot(it.pos.x - a.pos.x, it.pos.z - a.pos.z) + Math.abs(it.pos.y - a.pos.y - 1) * 0.3; if (d < bd) { bd = d; best = { s, it }; } } } return best; }
  takeShopItem(a, s, it) { if (it.taken) return; const item = { type: it.type, rarity: it.rarity, nom: it.nom, valeur: it.valeur, poids: it.poids, icon: it.icon, node: it.node }; if (this.bagAdd(a, item)) { it.taken = true; if (it.node) it.node.visible = false; } }

  // ---------------------------------------------------------------- butin
  bagAdd(a, item) {
    if (a.bagKg + item.poids > a.cap + 0.01) return false;
    a.bag.push(item); a.bagKg += item.poids;
    if (a === this.player) { this.toast(`${item.icon} ${item.nom} · ${fmt(item.valeur)} €`, RARITY[item.rarity].color); this.audio.rarity(item.rarity); if (item.rarity === 'legendaire') this.announce('LÉGENDAIRE !', item.nom, RARITY.legendaire.color, 2); }
    return true;
  }
  bagValue(a) { return a.bag.reduce((s, i) => s + i.valeur, 0); }
  dropPile(pos, items, weapon = null) {
    if (!items.length && !weapon) return;
    const g = new THREE.Group(); const p = pos.clone(); p.y = this.world.groundY(p.x, p.z); g.position.copy(p);
    let best = 'commun'; for (const it of items) if (RARITY_ORDER.indexOf(it.rarity) > RARITY_ORDER.indexOf(best)) best = it.rarity;
    if (weapon) { const gm = gunInstance(weapon.id); gm.rotation.set(0, Math.random() * 6, Math.PI / 2 * 0); gm.position.y = 0.4; g.add(gm); best = RARITY_ORDER.indexOf(weapon.rarity) > RARITY_ORDER.indexOf(best) ? weapon.rarity : best; }
    else { const top = items.reduce((m, i) => (i.valeur > m.valeur ? i : m), items[0]); const m = lootMesh(top.type, top.rarity); m.position.y = 0.15; g.add(m); if (items.length > 1) { const sac = lootMesh('sac', 'commun'); sac.position.set(0.3, 0, 0.2); g.add(sac); } }
    const b = beam(best); g.add(b); this.root.add(g);
    this.drops.push({ pos: p, items, weapon, g, t: 0, life: 90 });
  }
  socleIncome(dt) {
    for (const team of ['ordre', 'civils']) for (const s of this.socles[team]) {
      if (!s.item) continue; s.acc = (s.acc || 0) + s.item.valeur * 0.006 * dt;
      if (s.acc >= 1) { const n = Math.floor(s.acc); s.acc -= n; if (s.owner === this.player) { this.save.bank += n; this.stats.earned += n; this.incomeAcc = (this.incomeAcc || 0) + n; } else if (s.owner) s.owner.cash += n; }
      if (s.itemMesh) s.itemMesh.rotation.y += dt * 0.8;
    }
  }
  placeOnSocle(s, item, owner) {
    s.item = item; s.owner = owner; s.acc = 0; let m;
    if (item.node) { m = new THREE.Group(); const c = item.node.clone(true); c.visible = true; const box = new THREE.Box3().setFromObject(c); const ctr = box.getCenter(V()); c.position.sub(V(ctr.x, box.min.y, ctr.z)); const sz = box.getSize(V()); const k = Math.min(1.8, 0.7 / Math.max(sz.x, sz.y, sz.z, 0.05)); c.scale.multiplyScalar(k); c.position.multiplyScalar(k); m.add(c); }
    else { m = lootMesh(item.type, item.rarity); m.scale.setScalar(item.type === 'tv' || item.type === 'art' ? 0.7 : 1.6); }
    m.position.set(0, 0.55, 0); s.mesh.add(m); s.itemMesh = m;
    const b = beam(item.rarity); b.scale.set(0.6, 0.5, 0.6); b.position.y = 1.5; m.add(b);
  }
  takeFromSocle(s) { const it = s.item; s.item = null; s.owner = null; if (s.itemMesh) s.mesh.remove(s.itemMesh); s.itemMesh = null; return it; }
  deposit(a) {
    let n = 0; const free = this.socles[a.team].filter((s) => !s.item);
    // on expose d'abord les objets les plus chers
    a.bag.sort((x, y) => y.valeur - x.valeur);
    while (a.bag.length && free.length) { const it = a.bag.shift(); a.bagKg -= it.poids; it.stolen = false; this.placeOnSocle(free.shift(), it, a); n++; }
    if (a === this.player && n) { this.toast(`🏛️ ${n} objet${n > 1 ? 's' : ''} exposé${n > 1 ? 's' : ''} : ils rapportent chaque seconde`, '#9ff59f'); this.audio.cash(true); this.fx.ring(a.pos, '#9ff59f'); }
    if (a === this.player && a.bag.length && !free.length) this.toast('Planque pleine : revends le reste au receleur 💰', '#ffcc3d');
    // si la planque est pleine, on remplace le moins cher par plus cher
    return n;
  }
  sell(a) {
    if (!a.bag.length) return;
    const k = a.team === 'ordre' ? 0.6 : 1; const total = a.bag.reduce((t, i) => t + this.recelPrice(i), 0) * k; const n = a.bag.length;
    a.bag = []; a.bagKg = 0;
    if (a === this.player) { this.earn(total, `${n} objet${n > 1 ? 's' : ''} revendu${n > 1 ? 's' : ''} au receleur`, true); this.fx.ring(a.pos, '#ffcc3d'); } else a.cash += total;
  }

  // ---------------------------------------------------------------- barricades
  placeWall(a) {
    if (a.mats < 10 || !a.alive || a.inCar) { if (a === this.player) this.toast('Pas assez de matériaux (10)', '#ff8080'); return; }
    const yaw = a === this.player ? this.cam.yaw : a.yaw; const f = V(Math.sin(yaw), 0, Math.cos(yaw));
    const p = a.pos.clone().addScaledVector(f, 2.4); p.y = this.world.groundY(p.x, p.z);
    if (!this.world.free(...this.world.cell(p.x, p.z))) { if (a === this.player) this.toast('Pas de place ici', '#ff8080'); return; }
    a.mats -= 10;
    const m = barricade(a.team); m.position.copy(p); m.rotation.y = yaw; m.scale.set(1, 0.05, 1); this.root.add(m);
    const w = { team: a.team, hp: 220, mesh: m, t: 0, pos: p };
    w.col = { type: 'box', x: p.x, z: p.z, hx: 1.5, hz: 0.12, h: 2.3, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: p.y, wall: w };
    this.world.dynamic.push(w.col); this.walls.push(w); this.audio.build(p);
    if (this.walls.length > 40) this.destroyWall(this.walls[0]);
  }
  hitWall(w, dmg) { w.hp -= dmg; w.mesh.position.x += rnd(-0.02, 0.02); if (w.hp <= 0) this.destroyWall(w); }
  destroyWall(w) {
    const i = this.walls.indexOf(w); if (i < 0) return; this.walls.splice(i, 1); this.root.remove(w.mesh);
    const j = this.world.dynamic.indexOf(w.col); if (j >= 0) this.world.dynamic.splice(j, 1);
    this.fx.burst(w.pos.clone().add(V(0, 1, 0)), 14, { color: w.team === 'ordre' ? '#1c2a4a' : '#b48a5a', speed: 4, size: 0.2, life: 1 }); this.audio.play('debris', w.pos, 0.8);
  }

  // ---------------------------------------------------------------- grenades (lacrymo / fumigène)
  throwNade(a, dir) {
    if (a.nades <= 0 || !a.alive || a.inCar) return; a.nades--;
    const kind = a.team === 'ordre' ? 'gas' : 'smoke';
    const p = a.pos.clone().add(V(0, 1.7, 0)); const v = dir.clone().multiplyScalar(15); v.y += 4;
    const m = grenadeMesh(kind); m.position.copy(p); this.root.add(m);
    this.grenades.push({ kind, pos: p, vel: v, m, t: 0, owner: a });
    this.audio.play('cloth', p, 0.8);
    if (a === this.player) this.toast(kind === 'gas' ? '💨 Lacrymogène lancée' : '🎆 Fumigène lancé', '#ddd');
  }
  updateNades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt; g.vel.y -= GRAV * dt;
      const np = g.pos.clone().addScaledVector(g.vel, dt);
      const d = np.clone().sub(g.pos); const L = d.length(); if (L > 0) { const h = this.world.ray(g.pos, d.clone().divideScalar(L), L); if (h) { const n = V(...h.n); g.vel.reflect(n).multiplyScalar(0.4); np.copy(g.pos).addScaledVector(d.divideScalar(L), h.t * 0.9); } }
      g.pos.copy(np); g.m.position.copy(np); g.m.rotation.x += dt * 10;
      if (g.t > 1.6) { this.root.remove(g.m); this.grenades.splice(i, 1); const p = g.pos.clone(); p.y = this.world.groundY(p.x, p.z); this.fx.cloud(p, g.kind, g.owner); this.audio.play('thud', p, 0.8); this.fx.burst(p.clone().add(V(0, 0.3, 0)), 8, { color: g.kind === 'gas' ? '#e8e6cf' : '#ff4fa0', speed: 3, size: 0.1, life: 0.6 }); }
    }
  }
  // effets des nuages : la lacrymo pique et ralentit l'autre camp (et un peu les siens), la fumée cache
  // lacrymo : gêne progressive selon la densité réelle du nuage (yeux qui piquent, toux, un peu plus lent)
  cloudEffects(dt) {
    this.gasTick = (this.gasTick || 0) - dt; const tick = this.gasTick <= 0; if (tick) this.gasTick = 0.2;
    for (const a of this.actors) {
      if (!tick) continue; a.inGasT = 0;
      if (!a.alive || a.inCar || !this.fx.clouds.length) continue;
      const head = a.pos.clone(); head.y += 1.5; const d = this.fx.density(head, ['gas']); if (d < 0.05) continue;
      const own = a.team === 'ordre'; a.inGasT = Math.min(1, own ? d * 0.15 : d);
      if (!own) { a.gasDmg = (a.gasDmg || 0) + 3.5 * Math.min(1, d) * 0.2; if (a.gasDmg > 3) { const c = this.fx.clouds.find((c) => c.kind === 'gas'); this.damage(a, a.gasDmg, c?.owner?.alive ? c.owner : null, { gas: true }); a.gasDmg = 0; } }
      if (a.bot && !own && d > 0.25 && !a.ai.flee) { const c = this.fx.clouds.filter((c) => c.kind === 'gas').sort((p, q) => p.pos.distanceToSquared(a.pos) - q.pos.distanceToSquared(a.pos))[0]; if (c) { a.ai.flee = c; a.ai.path = null; } }
    }
    for (const a of this.actors) { a.inGas = lerp(a.inGas || 0, a.inGasT || 0, 1 - Math.exp(-dt * (a.inGasT > (a.inGas || 0) ? 1.5 : 0.6))); if (a === this.player && a.inGas > 0.35 && Math.random() < dt * 0.4) this.audio.play('cloth', null, 0.3); }
  }
  // la fumée bloque la vue des bots quand elle est assez dense le long de la ligne de visée
  smokeBlocks(a, b) {
    if (!this.fx.clouds.some((c) => c.kind !== 'gas')) return false;
    let acc = 0; const n = 8;
    for (let i = 1; i < n; i++) { const p = a.clone().lerp(b, i / n); acc += this.fx.density(p, ['smoke', 'smoke-dark']); if (acc > 1.4) return true; }
    return false;
  }

  // ---------------------------------------------------------------- voitures
  buildCars() {
    const defs = this.opts.cars || []; if (!defs.length) return;
    const spots = [
      [-45, -39.5, Math.PI / 2, 'sport'], [8, -38, -Math.PI / 2, 'sport'], [48, -40, Math.PI / 2, 'sport'], [-12, -41, Math.PI / 2, 'blinde'],
      [-30, 44.5, Math.PI / 2, 'sport'], [32, 44, -Math.PI / 2, 'sport'], [-61, 26, Math.PI, 'sport'], [61, -18, 0, 'sport'], [74, 44, Math.PI / 2, 'civil'],
      [-106, -18, Math.PI / 2, 'police'], [-106, 18, Math.PI / 2, 'police'], [100, 20, -Math.PI / 2, 'blinde'],
    ];
    let k = 0;
    for (const [x, z, yaw, cls] of spots) {
      const pool = defs.filter((d) => d.classe === cls); const def = pool.length ? pool[k++ % pool.length] : defs[k++ % defs.length];
      const spot = this.clearSpot(x, z, 2.6); if (!spot) continue;
      this.addCar(def, spot[0], spot[1], yaw);
    }
  }
  clearSpot(x, z, r) {
    const W = this.world; const ok = (px, pz) => { for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (!W.free(...W.cell(px + dx, pz + dz))) return false; return !this.cars.some((c) => Math.hypot(c.pos.x - px, c.pos.z - pz) < 6); };
    for (let rad = 0; rad < 10; rad += 1) for (let k = 0; k < Math.max(1, rad * 6); k++) { const a = k / Math.max(1, rad * 6) * Math.PI * 2; const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad; if (ok(px, pz)) return [px, pz]; }
    return null;
  }
  addCar(def, x, z, yaw) {
    const obj = def.scene.clone(true); obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(obj);
    const size = def.size; const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map((n) => obj.getObjectByName(n) || obj.getObjectByName(n.replace(/-/g, '_')));
    const car = { def, obj, wheels, pos: V(x, this.world.groundY(x, z), z), yaw, speed: 0, steer: 0, hp: def.classe === 'blinde' ? 600 : 320, maxHp: def.classe === 'blinde' ? 600 : 320, driver: null, spawn: [x, z, yaw], dead: 0, W: size[0], L: size[2], H: size[1], max: { sport: 34, blinde: 26, police: 30, civil: 24 }[def.classe] || 26, accel: { sport: 15, blinde: 10, police: 13, civil: 9 }[def.classe] || 11, police: def.classe === 'police' };
    car.col = { type: 'box', x, z, hx: car.W / 2, hz: car.L / 2, h: car.H, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: car.pos.y, car };
    this.world.dynamic.push(car.col); this.cars.push(car); this.syncCar(car);
  }
  syncCar(c) {
    c.obj.position.copy(c.pos); c.obj.rotation.set(c.pitchV || 0, c.yaw, c.rollV || 0, 'YXZ');
    Object.assign(c.col, { x: c.pos.x, z: c.pos.z, yaw: c.yaw, cs: Math.cos(c.yaw), sn: Math.sin(c.yaw), y0: c.pos.y });
  }
  nearestCar(a, r = 3.2) { let best = null, bd = r; for (const c of this.cars) { if (c.dead || c.driver) continue; const d = c.pos.distanceTo(a.pos); if (d < bd) { bd = d; best = c; } } return best; }
  enterCar(a, c) {
    c.driver = a; a.inCar = c; a.ch.root.visible = false; a.vel.set(0, 0, 0);
    if (a === this.player) { this.announce('', c.def.nom || 'Voiture volée', '#fff', 1.5); this.audio.play('slam', c.pos, 0.6); this.cam.carYaw = c.yaw; }
  }
  exitCar(a, dead) {
    const c = a.inCar; if (!c) return; c.driver = null; a.inCar = null; a.ch.root.visible = true;
    const side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); const p = c.pos.clone().addScaledVector(side, c.W / 2 + 0.7);
    a.pos.copy(p); this.world.pushOut(a.pos, 0.35, a.pos.y); a.pos.y = this.world.groundY(a.pos.x, a.pos.z); a.yaw = c.yaw;
    if (a === this.player) { this.audio.engine(false); this.audio.play('slam', c.pos, 0.6); this.cam.yaw = c.yaw; }
  }
  hitCar(c, dmg, by) {
    if (c.dead) return; c.hp -= dmg; if (c.driver && Math.random() < 0.25) this.damage(c.driver, dmg * 0.4, by);
    if (c.hp <= 0) this.explodeCar(c, by);
  }
  explodeCar(c, by) {
    c.dead = 40; const p = c.pos.clone().add(V(0, 0.8, 0)); this.fx.explosion(p); this.audio.explode(p);
    if (c.driver) { const d = c.driver; this.exitCar(d, true); this.damage(d, 200, by); }
    for (const a of this.actors) { if (!a.alive) continue; const d = a.pos.distanceTo(c.pos); if (d < 7) this.damage(a, 110 * (1 - d / 7), by); }
    if (this.player.pos.distanceTo(c.pos) < 30) this.cam.trauma = 1;
    c.obj.visible = false; const j = this.world.dynamic.indexOf(c.col); if (j >= 0) this.world.dynamic.splice(j, 1);
  }
  updateCar(c, dt) {
    if (c.dead) { c.dead -= dt; if (c.dead <= 0) { c.dead = 0; [c.pos.x, c.pos.z, c.yaw] = c.spawn; c.pos.y = this.world.groundY(c.pos.x, c.pos.z); c.hp = c.maxHp; c.speed = 0; c.obj.visible = true; this.world.dynamic.push(c.col); this.syncCar(c); } return; }
    const drv = c.driver;
    let thr = 0, brk = 0, st = 0, hand = false;
    if (drv === this.player && !this.paused) {
      const I = this.input; const m = I.move();
      thr = Math.max(-m.y, I.st.triggerR); brk = Math.max(m.y > 0 ? m.y : 0, I.st.triggerL); st = -m.x; hand = I.down('jump');
      if (I.pressed('horn')) this.audio.horn();
    }
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    if (thr > 0) c.speed += thr * c.accel * dt * (c.speed < 0 ? 2.5 : 1);
    if (brk > 0) c.speed -= brk * (c.speed > 0.5 ? 26 : 9) * dt;
    c.speed -= c.speed * (hand ? 1.2 : 0.35) * dt; if (!thr && !brk) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 3 * dt);
    c.speed = clamp(c.speed, -10, c.max);
    const maxSt = 0.6 - 0.32 * Math.min(1, Math.abs(c.speed) / c.max);
    c.steer = lerp(c.steer, st * maxSt, 1 - Math.exp(-dt * 8));
    const wb = c.L * 0.62; const yawRate = c.speed / wb * Math.tan(c.steer) * (hand ? 1.6 : 1);
    c.yaw += yawRate * dt;
    // dérive au frein à main : la voiture glisse un peu de côté
    c.slip = lerp(c.slip || 0, hand ? yawRate * Math.abs(c.speed) * 0.08 : 0, 1 - Math.exp(-dt * 4));
    const side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const before = c.pos.clone();
    c.pos.addScaledVector(V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), c.speed * dt).addScaledVector(side, c.slip * dt);
    // collisions : trois cercles sur la longueur
    const fwd = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)); let bump = 0;
    for (const k of [-0.32, 0, 0.32]) {
      const q = c.pos.clone().addScaledVector(fwd, k * c.L); const q0 = q.clone();
      this.world.pushOut(q, c.W * 0.5, c.pos.y + 0.2, c.col); const dx = q.x - q0.x, dz = q.z - q0.z;
      if (dx || dz) { c.pos.x += dx; c.pos.z += dz; bump = Math.max(bump, Math.hypot(dx, dz)); }
    }
    if (bump > 0.02 && Math.abs(c.speed) > 3) {
      const imp = Math.abs(c.speed); if (imp > 9) { this.hitCar(c, imp * 2.2, null); this.audio.play('slam', c.pos, Math.min(1.2, imp / 20)); this.fx.burst(c.pos.clone().addScaledVector(fwd, c.L / 2 * Math.sign(c.speed)).add(V(0, 0.6, 0)), 8, { color: '#ffd27a', speed: 5, size: 0.03, emissive: true, life: 0.3 }); if (drv === this.player) { this.cam.trauma = Math.min(1, this.cam.trauma + imp / 30); this.input.rumble(1, 1, 200); } }
      c.speed *= -0.25;
    }
    // écrasement des piétons
    if (Math.abs(c.speed) > 4) for (const a of this.actors) {
      if (!a.alive || a.inCar || (drv && a.team === drv.team)) continue;
      const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      if (Math.abs(lx) < c.W / 2 + 0.35 && Math.abs(lz) < c.L / 2 + 0.35) { this.damage(a, Math.abs(c.speed) * 5, drv); a.vel.addScaledVector(fwd, c.speed * 0.8); a.vel.y = 4; a.onGround = false; c.speed *= 0.8; this.audio.play('thud', a.pos, 1); }
    }
    c.pos.y = lerp(c.pos.y, this.world.groundY(c.pos.x, c.pos.z), 1 - Math.exp(-dt * 12));
    c.rollV = lerp(c.rollV || 0, -yawRate * c.speed * 0.006, 1 - Math.exp(-dt * 6)); c.pitchV = lerp(c.pitchV || 0, (thr - brk) * -0.02, 1 - Math.exp(-dt * 5));
    for (let i = 0; i < 4; i++) { const w = c.wheels[i]; if (!w) continue; w.rotation.x += c.speed * dt / 0.3; if (i < 2) w.rotation.y = c.steer; }
    this.syncCar(c);
    if (drv) { drv.pos.copy(c.pos); drv.yaw = c.yaw; }
    // fumée quand la voiture est abîmée
    if (c.hp < c.maxHp * 0.3 && Math.random() < dt * 8) this.fx.burst(c.pos.clone().addScaledVector(fwd, c.L * 0.4).add(V(0, c.H, 0)), 1, { color: '#333', speed: 1, size: 0.3, life: 1.2, grav: -2 });
    if (drv === this.player) { this.audio.engine(true, Math.abs(c.speed) / c.max, c.pos); }
  }

  // ---------------------------------------------------------------- boucle
  update(dt) {
    if (this.paused) return;
    this.time += dt; this.input.poll(); this.pathBudget = 4;
    this.lodT = (this.lodT || 0) - dt; if (this.lodT <= 0) { this.lodT = 0.4; this.updateLod(); }
    if (!this.over) { this.updatePlayer(dt); }
    for (const a of this.actors) if (a.bot) this.updateBot(a, dt);
    for (const a of this.actors) this.updateActor(a, dt);
    for (const c of this.cars) this.updateCar(c, dt);
    this.updateNades(dt); this.cloudEffects(dt); this.updateZones(dt); this.updateShops(dt); this.updateDrops(dt); this.socleIncome(dt);
    for (const w of this.walls) { w.t += dt; w.mesh.scale.y = Math.min(1, 0.05 + w.t * 6); }
    this.specialT -= dt; if (this.specialT <= 0) { this.specialT = 120; this.specialDelivery(); }
    if (!this.over && (this.time >= this.matchLen || this.score.ordre >= this.scoreLimit || this.score.civils >= this.scoreLimit)) this.endMatch();
    this.updateCamera(dt);
    this.fx.update(dt);
    if (this.time > this.nextUi) { this.nextUi = this.time + 0.1; this.updateHud(); }
    this.mmT = (this.mmT || 0) - dt; if (this.mmT <= 0) { this.mmT = 1 / 20; this.drawMinimap(); } // minimap à 20 i/s
    this.input.endFrame();
  }

  // ---------------------------------------------------------------- joueur
  updatePlayer(dt) {
    const a = this.player, I = this.input, C = this.cam;
    // regard
    const sensM = 0.0022 * I.settings.sens * (this.aiming ? (WEAPONS[this.weapon(a)?.id]?.scope ? 0.35 : 0.6) : 1);
    let padK = 2.6 * I.settings.padSens * (this.aiming ? 0.55 : 1) * dt;
    // visée assistée manette : ralentit près d'une cible et la suit légèrement
    if (I.st.usingPad && I.settings.assist && a.alive && !a.inCar) {
      const t = this.assistTarget(); if (t) { padK *= 0.55; if (this.aiming || I.st.triggerR > 0.3) { C.yaw += t.dy * Math.min(1, dt * (this.aiming ? 5 : 2.5)); C.pitch += t.dp * Math.min(1, dt * (this.aiming ? 4 : 2)); } }
    }
    C.yaw -= I.st.mx * sensM + I.st.lookX * padK; C.pitch -= (I.st.my * sensM + I.st.lookY * padK) * (I.settings.invertY ? -1 : 1);
    C.pitch = clamp(C.pitch, -1.3, 1.25);
    if (I.pressed('view')) { C.fps = !C.fps; this.save.settings.fps = C.fps; this.persist(); this.viewGun(); }
    if (I.pressed('map')) $('minimap').classList.toggle('big');
    if (I.pressed('inv')) this.toggleInv();
    if (I.pressed('pause')) { this.onPause?.(); return; }
    if (!a.alive) { a.respawnT -= dt; this.aiming = false; if (a.respawnT <= 0) this.respawn(a); return; }
    a.spawnProt = Math.max(0, (a.spawnProt || 0) - dt);
    if (a.inCar) {
      if (I.pressed('car') || I.pressed('interact')) this.exitCar(a);
      this.aiming = false; return;
    }
    // armes
    if (I.pressed('w1')) this.equip(a, 0); if (I.pressed('w2')) this.equip(a, 1); if (I.pressed('w3')) this.equip(a, 2); if (I.pressed('w4')) this.equip(a, 3);
    if (I.pressed('next') && a.slots.length > 1) this.equip(a, (a.cur + 1) % a.slots.length);
    if (I.keys.has('WheelUp') || I.keys.has('WheelDown')) {}
    if (I.pressed('reload')) this.startReload(a);
    this.aiming = (I.down('aim') || I.st.triggerL > 0.3) && !a.climb && a.rollT <= 0;
    const W = this.weapon(a), D = WEAPONS[W.id];
    const wantFire = D.auto ? (I.down('fire') || I.st.triggerR > 0.4) : (I.pressed('fire') || (I.st.triggerR > 0.4 && !this._trigWas));
    this._trigWas = I.st.triggerR > 0.4;
    if (wantFire && a.slideT <= 0.5 && !a.climb && a.rollT <= 0 && !a.channel) {
      if (!I.st.locked && !I.st.usingPad) { this.renderer.domElement.requestPointerLock?.(); }
      else {
        const o = this.camera.position.clone(); const d = V(); this.camera.getWorldDirection(d);
        // on part de devant le joueur pour ne pas toucher ce qui est entre la caméra et lui
        const skip = C.fps ? 0 : Math.max(0, o.distanceTo(a.pos.clone().add(V(0, 1.5, 0))) - 0.3); o.addScaledVector(d, skip);
        if (this.fire(a, o, d)) { a.momentum *= 0.92; }
      }
    }
    if (I.pressed('build')) this.placeWall(a);
    if (I.pressed('grenade')) { const d = V(); this.camera.getWorldDirection(d); this.throwNade(a, d); }
    if (I.pressed('shop') && this.atBase(a)) this.onShop?.();
    // interactions : voiture, vitrine, butin, planque, receleur, vol
    this.interactions(a, dt);
    // déplacement
    const m = I.move();
    const yaw = C.yaw; const f = V(Math.sin(yaw), 0, Math.cos(yaw)), r = V(-Math.cos(yaw), 0, Math.sin(yaw));
    a.wish = V().addScaledVector(f, -m.y).addScaledVector(r, m.x);
    a.wantSprint = (I.down('sprint') || this.sprintLatch) && m.y < -0.3 && !this.aiming;
    if (I.st.usingPad && I.pressed('sprint')) this.sprintLatch = !this.sprintLatch; if (Math.hypot(m.x, m.y) < 0.2) this.sprintLatch = false;
    if (I.pressed('jump')) { if (a.crouch) a.crouch = false; else a.wantJump = 0.15; }
    if (I.pressed('crouch')) a.wantCrouch = 0.15;
    if (I.pressed('duck')) a.crouch = !a.crouch;
    if (a.wantSprint || a.inCar || !a.alive) a.crouch = false;
    // le corps suit la caméra (style TPS moderne)
    a.yaw = yaw; a.pitch = C.pitch;
  }
  atBase(a) { const s = this.socles[a.team]; return !!s.length && Math.hypot(a.pos.x - s[0].pos.x, a.pos.z - (s[0].pos.z + s[s.length - 1].pos.z) / 2) < 16; }
  assistTarget() {
    const d = V(); this.camera.getWorldDirection(d); const o = this.camera.position; let best = null, bestA = 0.09;
    for (const t of this.actors) {
      if (!t.alive || t.team === this.player.team || t.inCar) continue; const p = t.pos.clone().add(V(0, 1.25, 0)); const v = p.clone().sub(o); const L = v.length(); if (L > 60) continue; v.divideScalar(L);
      const ang = Math.acos(clamp(v.dot(d), -1, 1)); const lim = Math.max(0.035, 0.09 * (12 / Math.max(12, L)) * 2); if (ang > lim || ang > bestA) continue;
      if (!this.world.los(o, p)) continue;
      const ty = Math.atan2(v.x, v.z), tp = Math.asin(v.y);
      let dy = ty - this.cam.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      best = { dy, dp: tp - this.cam.pitch }; bestA = ang;
    }
    return best;
  }
  interactions(a, dt) {
    const I = this.input; let prompt = null;
    const hold = I.down('interact') || I.down('car');
    // canal en cours (casser, voler, crocheter)
    if (a.channel) {
      const ch = a.channel; if (!hold || !ch.valid()) { a.channel = null; } else { ch.t += dt; if (ch.t >= ch.dur) { a.channel = null; ch.done(); } }
    }
    const car = this.nearestCar(a, 3.4);
    if (car) {
      const quick = car.police ? a.team === 'ordre' : false;
      prompt = `<b>${I.label('car')}</b> ${quick ? 'Prendre la voiture de service' : 'Voler'} <span class="r">${car.def.nom || ''}</span>`;
      if ((I.pressed('car')) && !a.channel) { if (quick) this.enterCar(a, car); else this.startChannel(a, 'Crochetage…', 0.9, () => car.pos.distanceTo(a.pos) < 4 && !car.driver, () => this.enterCar(a, car)); }
    }
    if (!prompt) {
      // objet de boutique à portée (vitrine cassée) ; sinon vitrine intacte à casser à la main
      const si = this.nearestShopItem(a, 1.7); const v = !si && this.nearestVitrine(a, 2.2);
      if (si) {
        const it = si.it; const full = a.bagKg + it.poids > a.cap;
        prompt = full ? `Sac plein (${Math.round(a.bagKg)}/${a.cap} kg)` : `<b>${I.label('interact')}</b> Prendre <span class="r" style="color:${RARITY[it.rarity].color}">${it.icon} ${it.nom}</span> · ${fmt(it.valeur)} € · ${it.poids} kg`;
        if (I.pressed('interact') && !full && !a.channel) this.startChannel(a, 'Ramassage…', 0.4, () => !it.taken, () => this.takeShopItem(a, si.s, it), 'Interact');
      } else if (v) { prompt = `<b>${I.label('interact')}</b> (maintenir) Casser la vitrine · ${v.shop.enseigne} <span class="r">— ou tire dedans</span>`; if (I.pressed('interact') && !a.channel) this.startChannel(a, 'Casse…', 1.1, () => !v.broken, () => this.breakVitrine(v, a), 'Punch_Right'); }
    }
    if (!prompt) {
      const d = this.drops.find((d) => d.pos.distanceTo(a.pos) < 2);
      if (d) {
        if (d.weapon) { const W = WEAPONS[d.weapon.id]; prompt = `<b>${I.label('interact')}</b> Prendre <span class="r" style="color:${RARITY[d.weapon.rarity].color}">${W.icon} ${W.name} ${RARITY[d.weapon.rarity].name.toLowerCase()}</span>`; if (I.pressed('interact')) this.pickWeapon(a, d); }
        else { prompt = `<b>${I.label('interact')}</b> Ramasser le butin (${d.items.length})`; if (I.pressed('interact')) this.pickDrop(a, d); }
      }
    }
    if (!prompt) {
      // planque : déposer / voler
      const own = this.socles[a.team].find((s) => s.pos.distanceTo(a.pos) < 4);
      if (own && a.bag.length) { prompt = `<b>${I.label('interact')}</b> Exposer le butin à ${a.team === 'ordre' ? 'au commissariat (prime chaque seconde)' : 'la planque (rapporte chaque seconde)'}`; if (I.pressed('interact')) this.deposit(a); }
      const foe = this.socles[ENEMY[a.team]].find((s) => s.item && s.pos.distanceTo(a.pos) < 2);
      if (!own && foe) { const it = foe.item; prompt = `<b>${I.label('interact')}</b> (maintenir) Voler <span class="r" style="color:${RARITY[it.rarity].color}">${it.icon} ${it.nom}</span> · ${fmt(it.valeur)} €`; if (I.pressed('interact') && !a.channel) this.startChannel(a, 'Vol…', 1.4, () => foe.item === it, () => { const x = this.takeFromSocle(foe); x.stolen = true; if (!this.bagAdd(a, x)) this.dropPile(a.pos, [x]); else { this.stats.stolen++; this.announce('BUTIN VOLÉ !', 'Ramène-le à ta base', '#ffcc3d', 1.6); this.alertTeam(ENEMY[a.team], `🚨 ${a.name} vole ${x.nom} !`); } }, 'Interact'); }
    }
    if (!prompt && a.bag.length && a.pos.distanceTo(this.recel.pos) < this.recel.r) {
      const k = a.team === 'ordre' ? 0.6 : 1; prompt = `<b>${I.label('interact')}</b> Revendre à ${this.recel.nom} : <span class="r" style="color:#ffcc3d">${fmt(a.bag.reduce((t, i) => t + this.recelPrice(i), 0) * k)} €</span>${k < 1 ? ' (−40 % : on est flic)' : ''}`;
      if (I.pressed('interact')) this.sell(a);
    }
    if (!prompt && this.atBase(a)) prompt = `<b>${I.label('shop')}</b> Armurerie`;
    this.ui.prompt = a.channel ? null : prompt;
  }
  startChannel(a, label, dur, valid, done, anim) { a.channel = { label, dur, t: 0, valid, done, anim }; if (anim && a.ch.actions[anim]) { const act = a.ch.actions[anim]; act.reset().setEffectiveWeight(1).fadeIn(0.1).play(); a.channelAnim = act; } }
  pickWeapon(a, d) {
    const w = { id: d.weapon.id, rarity: d.weapon.rarity, mag: WEAPONS[d.weapon.id].mag };
    const same = a.slots.findIndex((s) => s.id === w.id);
    if (same >= 0) { const old = a.slots[same]; if (RARITY_ORDER.indexOf(w.rarity) <= RARITY_ORDER.indexOf(old.rarity)) { old.mag = WEAPONS[old.id].mag; if (a === this.player) this.toast('Munitions récupérées', '#ccc'); this.removeDrop(d); return; } a.slots[same] = w; this.equip(a, same); }
    else if (a.slots.length < 4) { a.slots.push(w); this.equip(a, a.slots.length - 1); }
    else { const old = a.slots[a.cur]; a.slots[a.cur] = w; this.equip(a, a.cur); this.removeDrop(d); this.dropPile(a.pos.clone().add(V(0.5, 0, 0)), [], { id: old.id, rarity: old.rarity }); return; }
    if (a === this.player) { this.toast(`${WEAPONS[w.id].icon} ${WEAPONS[w.id].name} ${RARITY[w.rarity].name}`, RARITY[w.rarity].color); this.audio.rarity(w.rarity); }
    this.removeDrop(d);
  }
  pickDrop(a, d) {
    d.items.sort((x, y) => y.valeur - x.valeur); const left = [];
    for (const it of d.items) if (!this.bagAdd(a, it)) left.push(it);
    if (left.length && a === this.player) this.toast('Sac plein : une partie reste au sol', '#ff8080');
    d.items = left; if (!left.length) this.removeDrop(d);
  }
  removeDrop(d) { const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1); this.root.remove(d.g); }
  updateDrops(dt) { for (const d of [...this.drops]) { d.t += dt; d.g.children[0] && (d.g.children[0].rotation.y += dt * 1.5); if (d.t > d.life) this.removeDrop(d); } }
  updateShops(dt) {
    for (const s of this.shops) {
      if (s.broken) { s.respawnT -= dt; if (s.respawnT <= 0) { this.restock(s); } }
      if (s.alarmT > 0) s.alarmT -= dt;
      for (const it of s.items) if (it.node && !it.taken && s.broken) it.node.rotation.y += dt * 0.8;
    }
  }
  specialDelivery() {
    const z = this.zoneState[1]; const items = [this.makeItem('frungz', 'legendaire')]; items[0].valeur = 9000;
    this.dropPile(V(z.center[0] + rnd(-2, 2), 0, z.center[1] + rnd(-2, 2)), items);
    this.announce("LE FRUNGZ D'OR", 'vient d\'apparaître à la Fontaine (B)', RARITY.legendaire.color, 3); this.audio.capture(true);
    for (const b of this.actors) if (b.bot && b.alive && Math.random() < 0.5) { b.ai.task = { kind: 'drop' }; b.ai.path = null; }
  }
  alertTeam(team, msg) { if (team === this.save.team) this.toast(msg, '#ff4a4a'); for (const b of this.actors) if (b.bot && b.alive && b.team === team && Math.random() < 0.6) { b.ai.task = { kind: 'defend' }; b.ai.path = null; } }

  // ---------------------------------------------------------------- physique commune (joueur et bots)
  updateActor(a, dt) {
    const ch = a.ch;
    if (!a.alive) { ch.mixer.update(dt); if (a.bot) { a.respawnT -= dt; if (a.respawnT <= 0) this.respawn(a); } if (a.respawnT < 1.5) ch.root.visible = (a.respawnT * 10 | 0) % 2 === 0; return; }
    if (a.inCar) return;
    a.fireT -= dt; a.wantJump = Math.max(0, (a.wantJump || 0) - dt); a.wantCrouch = Math.max(0, (a.wantCrouch || 0) - dt);
    if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) { const W = this.weapon(a); W.mag = WEAPONS[W.id].mag; } }
    // régénération après 5 s sans dégâts
    a.regenT -= dt; if (a.regenT <= 0 && a.hp < 100) a.hp = Math.min(100, a.hp + 12 * dt);
    const civ = this.isCivil(a);
    // ---- parkour : élan, glissade, roulade, escalade
    const wish = a.wish || V(); const wl = wish.length();
    if (a.climb) {
      const c = a.climb; c.t += dt / c.dur; const k = Math.min(1, c.t); const e = k < 0.6 ? k / 0.6 : 1;
      a.pos.x = lerp(c.from.x, c.to.x, k); a.pos.z = lerp(c.from.z, c.to.z, k); a.pos.y = lerp(c.from.y, c.to.y, Math.sin(e * Math.PI / 2));
      if (k >= 1) { a.climb = null; a.vel.set(0, 0, 0); a.onGround = true; a.momentum = Math.max(a.momentum, 0.5); }
      this.animate(a, dt); return;
    }
    if (a.wantSprint && wl > 0.5 && a.onGround && a.slideT <= 0) a.momentum = Math.min(1, a.momentum + dt / (civ ? 1.1 : 1.6));
    else if (a.onGround && a.slideT <= 0) a.momentum = Math.max(0, a.momentum - dt * 1.8);
    const load = 1 - 0.3 * Math.min(1, a.bagKg / a.cap);
    const slow = 1 - (a.inGas || 0) * 0.2;
    let top = (a.wantSprint ? 6.6 + a.momentum * (civ ? 3.2 : 1.8) : 4.4) * load * slow; if (this.aiming && !a.bot) top *= 0.6; a.crouchK = lerp(a.crouchK || 0, a.crouch ? 1 : 0, 1 - Math.exp(-dt * 12)); if (a.crouch) top *= 0.5;
    // glissade (accroupi en sprint) / roulade (accroupi sinon)
    if (a.wantCrouch && a.onGround && a.slideT <= 0 && a.rollT <= 0) {
      const sp = this.feetSpeed(a);
      if (sp > 6) { this.fx.dust(a.pos, 6, 1); a.slideT = civ ? 1.0 : 0.75; a.slideDir = V(a.vel.x, 0, a.vel.z).normalize(); a.vel.addScaledVector(a.slideDir, 1.5); this.audio.play('cloth', a.pos, 0.7); if (!a.bot) this.cam.trauma += 0.1; }
      else { a.rollT = 0.55; const d = wl > 0.1 ? wish.clone().normalize() : V(Math.sin(a.yaw), 0, Math.cos(a.yaw)); a.vel.x = d.x * (civ ? 8.5 : 7); a.vel.z = d.z * (civ ? 8.5 : 7); a.rollDir = d; this.setAnim(a, 'Roll', 0.08, 1.6); this.audio.play('cloth', a.pos, 0.7); }
      a.wantCrouch = 0;
    }
    const target = wish.clone().multiplyScalar(top);
    if (a.slideT > 0) { a.slideT -= dt; const sp = Math.hypot(a.vel.x, a.vel.z); const ns = Math.max(0, sp - dt * (civ ? 3.5 : 5)); a.vel.x = a.slideDir.x * ns; a.vel.z = a.slideDir.z * ns; if (ns < 2.5) a.slideT = 0; }
    else if (a.rollT > 0) { a.rollT -= dt; }
    else {
      const acc = a.onGround ? (wl > 0.1 ? 34 : 22) : 7;
      const dvx = target.x - a.vel.x, dvz = target.z - a.vel.z, dl = Math.hypot(dvx, dvz), mx = acc * dt;
      if (dl > mx) { a.vel.x += dvx / dl * mx; a.vel.z += dvz / dl * mx; } else { a.vel.x = target.x; a.vel.z = target.z; }
    }
    // saut / escalade
    if (a.wantJump && a.onGround) {
      const cl = this.findClimb(a);
      if (cl) { a.climb = cl; a.wantJump = 0; this.audio.play('cloth', a.pos, 0.8); if (!a.bot) { this.cam.dip -= 0.08; this.input.rumble(0.2, 0.4, 80); } }
      else { a.vel.y = civ ? 6.6 : 6.0; a.onGround = false; a.wantJump = 0; a.slideT = 0; if (a.momentum > 0.6) { a.vel.x *= 1.08; a.vel.z *= 1.08; } }
    }
    a.vel.y -= GRAV * dt;
    const prevY = a.pos.y;
    a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt; a.pos.y += a.vel.y * dt;
    const hit = this.world.pushOut(a.pos, 0.35, a.pos.y);
    if (hit && a.momentum > 0.3 && !a.climb) a.momentum *= 0.7;
    const gy = this.world.standY(a.pos.x, a.pos.z, prevY);
    if (a.pos.y <= gy + 0.02) {
      if (!a.onGround && a.vel.y < -6 && (a === this.player || a.pos.distanceToSquared(this.player.pos) < 900)) this.fx.dust(a.pos, a.vel.y < -10 ? 10 : 5, a.vel.y < -10 ? 1.4 : 0.9);
      if (!a.onGround && a.vel.y < -7 && a === this.player) { this.cam.dip -= Math.min(0.3, -a.vel.y * 0.025); this.audio.play('land', null, 0.6); this.input.rumble(0.3, 0.2, 80); if (a.vel.y < -13) this.damage(a, (-a.vel.y - 13) * 6, null); }
      a.pos.y = gy; a.vel.y = 0; a.onGround = true;
    } else if (a.pos.y > gy + 0.25) a.onGround = false;
    else if (a.vel.y <= 0) { a.pos.y = lerp(a.pos.y, gy, 1 - Math.exp(-dt * 20)); a.onGround = true; a.vel.y = 0; }
    // pas
    const sp = this.feetSpeed(a); a.stepPh = (a.stepPh || 0) + sp * dt * 0.55;
    if (a.onGround && sp > 1.5 && Math.floor(a.stepPh) !== Math.floor(a.stepPh - sp * dt * 0.55)) { if (a === this.player || a.pos.distanceToSquared(this.player.pos) < 400) this.audio.play('stepStone', a === this.player ? null : a.pos, a === this.player ? 0.35 : 0.5, [0.9, 1.1], 0.05); }
    this.animate(a, dt);
  }
  // escalade : un obstacle bas devant soi (mobilier, voiture, kiosque…) dont le dessus est atteignable
  findClimb(a) {
    const f = a.wish && a.wish.lengthSq() > 0.05 ? a.wish.clone().normalize() : V(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    const maxH = this.isCivil(a) ? 2.9 : 1.9; const feet = a.pos.y;
    for (const dist of [0.55, 0.85]) {
      const q = a.pos.clone().addScaledVector(f, dist);
      for (const c of [...this.world.near(a.pos.x, a.pos.z, 4)]) {
        if (c.off || c.type === 'poly' || c.wall || c.shop) continue;
        const top = (c.y0 ?? this.world.groundY(c.x, c.z)) + c.h; if (top < feet + 0.5 || top > feet + maxH) continue;
        let inside = false;
        if (c.type === 'circle') inside = Math.hypot(q.x - c.x, q.z - c.z) < c.r + 0.1;
        else { const dx = q.x - c.x, dz = q.z - c.z, lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs; inside = Math.abs(lx) < c.hx + 0.1 && Math.abs(lz) < c.hz + 0.1; }
        if (!inside) continue;
        if (c.type === 'circle' && c.r < 0.4) continue; // lampadaires, potelets
        const to = a.pos.clone().addScaledVector(f, dist + 0.35); to.y = top;
        return { from: a.pos.clone(), to, t: 0, dur: (top - feet) * (this.isCivil(a) ? 0.16 : 0.24) + 0.15 };
      }
      for (const c of this.world.plats) {
        if (!c.climb || c.y < feet + 0.5 || c.y > feet + maxH) continue;
        if (q.x < c.bb[0] || q.x > c.bb[2] || q.z < c.bb[1] || q.z > c.bb[3] || !pointInPoly(q.x, q.z, c.poly)) continue;
        const to = a.pos.clone().addScaledVector(f, dist + 0.35); to.y = c.y;
        return { from: a.pos.clone(), to, t: 0, dur: (c.y - feet) * (this.isCivil(a) ? 0.16 : 0.24) + 0.15 };
      }
    }
    return null;
  }
  animate(a, dt) {
    const ch = a.ch; const sp = this.feetSpeed(a);
    a.ch.root.position.copy(a.pos); a.ch.root.rotation.y = lerp_angle(a.ch.root.rotation.y, a.slideT > 0 ? Math.atan2(a.slideDir.x, a.slideDir.z) : a.rollT > 0 ? Math.atan2(a.rollDir.x, a.rollDir.z) : a.yaw, 1 - Math.exp(-dt * 18));
    let name = 'Idle_Gun', speed = 1;
    const shooting = this.time - (a.lastShot || -9) < 0.35;
    if (a.climb) { name = 'Interact'; speed = 2; }
    else if (a.rollT > 0) { name = 'Roll'; speed = 1.6; }
    else if (a.channel) { name = a.channel.anim || 'Interact'; }
    else if (!a.onGround) { name = 'Idle_Gun_Pointing'; }
    else if (sp > 0.8) {
      const lv = V(a.vel.x, 0, a.vel.z); const f = V(Math.sin(a.yaw), 0, Math.cos(a.yaw)); const fd = lv.dot(f) / sp; const sd = lv.dot(V(Math.cos(a.yaw), 0, -Math.sin(a.yaw))) / sp;
      if (fd > 0.5) { name = shooting || (a === this.player && this.aiming) ? 'Run_Shoot' : 'Run'; speed = clamp(sp / 6, 0.7, 1.6); }
      else if (fd < -0.5) { name = 'Run_Back'; speed = clamp(sp / 5, 0.7, 1.3); }
      else { name = sd > 0 ? 'Run_Left' : 'Run_Right'; speed = clamp(sp / 5, 0.7, 1.3); }
      if (sp < 3 && fd > 0.5 && !shooting) { name = 'Walk'; speed = sp / 2.2; }
    } else if (shooting || (a === this.player && this.aiming)) name = 'Idle_Gun_Pointing';
    this.setAnim(a, name, 0.15, speed);
    // animation simplifiée pour les bots lointains
    const far = a !== this.player && a.pos.distanceToSquared(this.player.pos) > 3600;
    // on remet le buste dans sa pose d'animation avant le mixer (sinon la correction de visée s'accumule et le buste tourne sur lui-même)
    const spine = ch.bones.Chest || ch.bones.Torso;
    const pb = ch.procBones || (ch.procBones = [spine, ch.bones.Torso, ch.bones.UpperLegL, ch.bones.UpperLegR, ch.bones.LowerLegL, ch.bones.LowerLegR, ch.bones.FootL, ch.bones.FootR].filter((b, i, arr) => b && arr.indexOf(b) === i));
    for (const b of pb) if (b.userData.base) b.quaternion.copy(b.userData.base);
    a.animAcc = (a.animAcc || 0) + dt; if (!a.lodHidden && (!far || a.animAcc > 0.1)) { ch.mixer.update(a.animAcc); a.animAcc = 0; }
    for (const b of pb) (b.userData.base ||= new THREE.Quaternion()).copy(b.quaternion);
    // glissade : le corps bascule en arrière
    ch.model.rotation.x = lerp(ch.model.rotation.x, a.slideT > 0 ? -0.9 : 0, 1 - Math.exp(-dt * 14));
    const ck = a.slideT > 0 || a.rollT > 0 || a.climb ? 0 : (a.crouchK || 0);
    ch.model.position.y = lerp(ch.model.position.y, (a.slideT > 0 ? 0.35 : 0) - ck * 0.42 + (-chars[a.skin].minY * chars[a.skin].k), 1 - Math.exp(-dt * 14));
    if (ck > 0.02 && !far) this.crouchPose(a, ck);
    // le buste suit la visée verticale
    // le buste oriente l'arme vers le point visé (réticule pour le joueur, cible pour les bots)
    const busy = a.climb || a.rollT > 0 || a.slideT > 0 || a.channel || a.inCar || !a.alive;
    const pointing = name === 'Idle_Gun_Pointing' || name === 'Run_Shoot';
    // correction seulement quand l'animation tient l'arme pointée (sinon le buste se cambrerait pour relever une arme baissée)
    const wantW = busy || !pointing ? 0 : 1;
    a.aimW = lerp(a.aimW ?? 0, wantW, 1 - Math.exp(-dt * 14));
    if (spine && ch.gun && a.aimW > 0.02 && !far) this.aimSpine(a, spine);
  }

  // accroupi : pose procédurale des jambes (cuisses vers l'avant, tibias repliés), autour de l'axe droit du perso
  crouchPose(a, k) {
    const ch = a.ch, b = ch.bones; ch.root.updateMatrixWorld(true);
    const right = V(-Math.cos(ch.root.rotation.y), 0, Math.sin(ch.root.rotation.y));
    const rot = (bone, ang) => { if (!bone) return; const pq = new THREE.Quaternion(), bq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq); bone.getWorldQuaternion(bq); const r = new THREE.Quaternion().setFromAxisAngle(right, ang); bone.quaternion.copy(pq.invert().multiply(r).multiply(bq)); bone.updateMatrixWorld(true); };
    const T = this.crouchAng || [1.25, -2.1, 0.5];
    for (const s of ['L', 'R']) { rot(b['UpperLeg' + s], T[0] * k); rot(b['LowerLeg' + s], T[1] * k); rot(b['Foot' + s], T[2] * k); }
    rot(b.Torso, -0.35 * k);
  }
  // LOD des personnages : invisibles très loin (brouillard), sans ombre portée au-delà de 45 m
  updateLod() {
    const cp = this.camera.position;
    for (const a of this.actors) {
      if (a === this.player) continue; const d2 = a.pos.distanceToSquared(cp);
      a.lodHidden = d2 > 200 * 200; a.ch.model.visible = !a.lodHidden; const sh = d2 < 45 * 45;
      if (!a.ch.meshes) { a.ch.meshes = []; a.ch.root.traverse((o) => { if (o.isMesh) a.ch.meshes.push(o); }); }
      if (a.lodShadow !== sh) { a.lodShadow = sh; for (const m of a.ch.meshes) m.castShadow = sh; }
    }
  }
  // point visé : celui du réticule pour le joueur, sinon devant soi selon yaw/pitch
  aimPoint(a) {
    if (a === this.player && this.aimPt) return this.aimPt;
    if (a.bot && a.ai?.target && a.ai.los) return a.ai.target.pos.clone().add(V(0, 1.2, 0));
    const c = Math.cos(a.pitch || 0); return a.pos.clone().add(V(Math.sin(a.yaw) * c * 30, 1.4 + Math.sin(a.pitch || 0) * 30, Math.cos(a.yaw) * c * 30));
  }
  // tourne l'os du buste pour que le canon (axe +x de l'arme) pointe vers le point visé
  aimSpine(a, spine) {
    const ch = a.ch, g = ch.gun, T = this.aimPoint(a);
    const _q = new THREE.Quaternion(), pq = new THREE.Quaternion(), bq = new THREE.Quaternion(), gp = V(), fw = V(), want = V();
    for (let it = 0; it < 2; it++) {
      ch.root.updateMatrixWorld(true);
      g.getWorldPosition(gp); g.getWorldQuaternion(_q); fw.set(1, 0, 0).applyQuaternion(_q);
      want.copy(T).sub(gp); if (want.lengthSq() < 1) return; want.normalize();
      // on ne corrige pas plus de ~75° (évite les contorsions quand la cible est derrière)
      const ang = fw.angleTo(want); if (ang < 0.002) break;
      const lim = Math.min(1, 0.9 / ang) * a.aimW;
      const dq = new THREE.Quaternion().setFromUnitVectors(fw, want); dq.slerp(new THREE.Quaternion(), 1 - lim);
      spine.parent.getWorldQuaternion(pq); spine.getWorldQuaternion(bq);
      spine.quaternion.copy(pq.clone().invert().multiply(dq).multiply(bq));
    }
  }

  // ---------------------------------------------------------------- bots
  updateBot(b, dt) {
    if (!b.alive || this.over) return;
    b.spawnProt = Math.max(0, (b.spawnProt || 0) - dt);
    const ai = b.ai; ai.think -= dt; ai.losT -= dt; ai.strafeT -= dt; ai.nadeT -= dt;
    b.wantSprint = false; b.wish = V();
    // cible : l'ennemi visible le plus proche (contrôles de visibilité étalés dans le temps)
    if (ai.losT <= 0) {
      ai.losT = rnd(0.25, 0.45);
      let best = null, bd = 55;
      for (const t of this.actors) { if (!t.alive || t.team === b.team) continue; const d = t.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = t; } }
      if (best) { const e = b.pos.clone().add(V(0, 1.6, 0)), tp = best.pos.clone().add(V(0, 1.3, 0)); const vis = this.world.los(e, tp) && !this.smokeBlocks(e, tp) && !(best.inCar && bd > 25); if (vis) { if (ai.target !== best) ai.react = rnd(0.25, 0.55) + (best.slideT > 0 || best.rollT > 0 ? 0.3 : 0); ai.target = best; ai.seeT = 2.5; ai.los = true; ai.lastSeen = best.pos.clone(); } else ai.los = ai.target === best ? false : ai.los; }
      if (ai.target && (!ai.target.alive || ai.target.pos.distanceTo(b.pos) > 70)) { ai.target = null; ai.los = false; }
    }
    ai.seeT -= dt; if (ai.seeT <= 0 && !ai.los) ai.target = null;
    // décider
    if (ai.think <= 0 || (!ai.task && !ai.path)) { ai.think = rnd(2, 4); this.botDecide(b); }
    // fuite de la lacrymo
    if (ai.flee) { const c = ai.flee; if (!this.fx.clouds.includes(c) || Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z) > c.r + 2) ai.flee = null; else { const away = V(b.pos.x - c.pos.x, 0, b.pos.z - c.pos.z).normalize(); b.wish.copy(away); b.wantSprint = true; } }
    // combat
    const W = this.weapon(b); const D = WEAPONS[W.id];
    let lookAt = null;
    if (ai.target && ai.los) {
      const t = ai.target; lookAt = t.pos.clone().add(V(0, 1.2, 0)); ai.react -= dt;
      const dist = t.pos.distanceTo(b.pos);
      if (ai.react <= 0 && dist < D.range * 0.9 && b.reloadT <= 0) {
        if (W.mag <= 0) this.startReload(b);
        else {
          const o = b.pos.clone().add(V(0, 1.45, 0)); const aimP = t.pos.clone().add(V(0, rnd(0.9, 1.6), 0));
          // erreur de visée : distance, mouvement de la cible, difficulté
          const err = (0.025 + dist * 0.0012 + this.feetSpeed(t) * 0.006) * this.opts.botSkill;
          aimP.x += rnd(-1, 1) * err * dist; aimP.y += rnd(-1, 1) * err * dist * 0.6; aimP.z += rnd(-1, 1) * err * dist;
          const d = aimP.sub(o).normalize();
          if (D.auto || Math.random() < dt * D.rps * 1.6) this.fire(b, o, d);
        }
      }
      // grenade
      if (ai.nadeT <= 0 && b.nades > 0 && dist > 8 && dist < 26 && this.fx.clouds.length < 10) {
        if (b.team === 'ordre' || b.hp < 50) { ai.nadeT = rnd(14, 26); const tgt = b.team === 'ordre' ? t.pos : b.pos.clone().addScaledVector(V(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z).normalize(), 4); const d = V(tgt.x - b.pos.x, 0, tgt.z - b.pos.z); const L = d.length(); d.normalize(); d.y = 0.25; this.throwNade(b, d.multiplyScalar(Math.min(1, L / 20 + 0.2))); }
      }
      // déplacement de combat : pas chassés, s'arrête parfois
      if (ai.strafeT <= 0) { ai.strafeT = rnd(0.6, 1.6); ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.hold = Math.random() < 0.35; }
      if (!ai.flee && !b.bag.length && (ai.task?.kind !== 'zone' || dist < 18)) {
        const to = V(t.pos.x - b.pos.x, 0, t.pos.z - b.pos.z).normalize(); const side = V(to.z, 0, -to.x).multiplyScalar(ai.strafe);
        const want = dist > 22 ? to : dist < 8 ? to.clone().negate() : V();
        b.wish.copy(want).add(side.multiplyScalar(ai.hold ? 0 : 0.8)); if (b.wish.lengthSq() > 1) b.wish.normalize();
        if (Math.random() < dt * 0.3 && b.team === 'civils') b.wantCrouch = 0.1; // roulade d'esquive
        ai.combatMove = true;
      } else ai.combatMove = false;
    } else ai.combatMove = false;
    // suivre le chemin
    if (!ai.combatMove && !ai.flee) this.followPath(b, dt);
    // regard
    if (!lookAt && b.wish.lengthSq() > 0.01) lookAt = b.pos.clone().addScaledVector(b.wish, 5).add(V(0, 1.4, 0));
    if (lookAt) { const d = V(lookAt.x - b.pos.x, 0, lookAt.z - b.pos.z); if (d.lengthSq() > 0.01) b.yaw = lerp_angle(b.yaw, Math.atan2(d.x, d.z), 1 - Math.exp(-dt * 10)); b.pitch = Math.atan2(lookAt.y - b.pos.y - 1.5, Math.hypot(d.x, d.z)); }
    // tâches à l'arrivée
    this.botTaskTick(b, dt);
    // coincé ?
    // sortie de secours : aucun progrès pendant 6 s sans combat ni action → nouvelle décision, puis recalage sur une case libre
    ai.progT = (ai.progT || 0) + dt; if (!ai.progP) ai.progP = b.pos.clone();
    if (ai.progT > 6) { const moved = b.pos.distanceTo(ai.progP) > 1.5; if (!moved && !b.channel && !(ai.target && ai.los) && !b.inCar) { ai.fails = (ai.fails || 0) + 1; ai.task = null; ai.path = null; ai.think = 0; if (ai.fails >= 2) { const [i, j] = this.world.nearestFree(...this.world.cell(b.pos.x, b.pos.z)); const B = this.world.bounds, S = this.world.nav.S; b.pos.x = B.x0 + (i + 0.5) * S; b.pos.z = B.z0 + (j + 0.5) * S; b.pos.y = this.world.groundY(b.pos.x, b.pos.z); ai.fails = 0; } } else ai.fails = 0; ai.progT = 0; ai.progP.copy(b.pos); }
    if (b.wish.lengthSq() > 0.1) { if (b.pos.distanceTo(ai.lastPos) < 0.05 * 60 * dt) { ai.stuck += dt; if (ai.stuck > 1.2) { ai.path = null; ai.stuck = 0; b.wantJump = 0.1; } } else ai.stuck = 0; }
    ai.lastPos.copy(b.pos);
    if (b.marker) b.marker.visible = b.team === this.save.team || this.time - (b.spotted || -99) < 3;
  }
  botDecide(b) {
    const ai = b.ai; const civ = b.team === 'civils';
    const cap = b.bagKg >= b.cap * 0.5 || b.bag.some((i) => i.stolen || i.rarity === 'legendaire') || b.bagKg > 0 && Math.random() < 0.3;
    if (cap) return this.botGo(b, { kind: 'home' }, this.socles[b.team][(Math.random() * 4) | 0]?.pos || b.pos);
    if (ai.task?.kind === 'alarm' && ai.task.shop.broken) return this.botGo(b, ai.task, ai.task.shop.front);
    if (ai.task?.kind === 'defend') { const s = this.socles[b.team].find((s) => s.item) || this.socles[b.team][0]; return this.botGo(b, { kind: 'defend' }, s.pos); }
    if (ai.task?.kind === 'drop') { const d = this.drops.find((d) => d.items.some((i) => i.type === 'frungz')); if (d) return this.botGo(b, { kind: 'pickup', drop: d }, d.pos); }
    // un butin au sol tout près ?
    const near = this.drops.find((d) => d.pos.distanceTo(b.pos) < 25 && (d.items.length || (d.weapon && Math.random() < 0.3)));
    if (near && Math.random() < 0.6) return this.botGo(b, { kind: 'pickup', drop: near }, near.pos);
    const r = Math.random();
    const enemySocle = this.socles[ENEMY[b.team]].filter((s) => s.item);
    const wLoot = civ ? 0.42 : 0.12, wRaid = enemySocle.length ? (civ ? 0.12 : 0.18) : 0;
    if (r < wLoot) {
      const shops = this.shops.filter((s) => this.shopItems(s).length).sort((x, y) => x.front.distanceTo(b.pos) - y.front.distanceTo(b.pos));
      const s = shops[Math.min(shops.length - 1, (Math.random() * 3) | 0)];
      if (s) { const v = s.vits.find((v) => v.broken) || pick(s.vits); return this.botGo(b, { kind: 'loot', shop: s, vit: v }, v ? v.front : s.front); }
    }
    if (r < wLoot + wRaid) { const s = pick(enemySocle); return this.botGo(b, { kind: 'raid', socle: s }, s.pos); }
    // zones : priorité aux zones non tenues, proches
    const zs = this.zoneState.map((z) => ({ z, w: (z.owner === b.team ? 0.25 : 1) * (1 / (1 + Math.hypot(z.center[0] - b.pos.x, z.center[1] - b.pos.z) / 40)) * (z.id === 'B' ? 1.3 : 1) }));
    let s = zs.reduce((a, x) => a + x.w, 0) * Math.random(); let z = zs[0].z; for (const x of zs) { s -= x.w; if (s <= 0) { z = x.z; break; } }
    const [px, pz] = this.world.randomFree(z.center[0], z.center[1], z.radius * 0.7);
    this.botGo(b, { kind: 'zone', zone: z }, V(px, 0, pz));
  }
  botGo(b, task, p) {
    b.ai.task = task; b.ai.goal = p.clone();
    // budget de calculs A* par image (indispensable à 50 contre 50) : sinon on réessaie un peu plus tard
    if (this.pathBudget <= 0) { b.ai.path = null; b.ai.think = rnd(0.05, 0.3); return; }
    this.pathBudget--; const path = this.world.path(b.pos.x, b.pos.z, p.x, p.z); b.ai.path = path; b.ai.pi = 1;
    // on laisse le temps d'aller au bout des tâches longues (pillage, retour à la base, revente, vol)
    b.ai.think = task.kind === 'zone' ? rnd(3, 6) : rnd(18, 28);
  }
  followPath(b, dt) {
    const ai = b.ai; if (!ai.path) return; const P = ai.path;
    while (ai.pi < P.length && Math.hypot(P[ai.pi][0] - b.pos.x, P[ai.pi][1] - b.pos.z) < 0.9) ai.pi++;
    if (ai.pi >= P.length) { ai.path = null; return; }
    const tx = P[ai.pi][0], tz = P[ai.pi][1]; const d = V(tx - b.pos.x, 0, tz - b.pos.z); const L = d.length();
    b.wish.copy(d.divideScalar(L));
    // évitement entre bots
    for (const o of this.actors) { if (o === b || !o.alive) continue; const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z, dd = dx * dx + dz * dz; if (dd < 1.2 && dd > 1e-4) { b.wish.x += dx / dd * 0.25; b.wish.z += dz / dd * 0.25; } }
    b.wish.normalize();
    const remain = Math.hypot((ai.goal?.x ?? tx) - b.pos.x, (ai.goal?.z ?? tz) - b.pos.z);
    b.wantSprint = remain > 10 && !ai.target;
  }
  botTaskTick(b, dt) {
    const ai = b.ai, t = ai.task; if (!t) return;
    if (t.kind === 'loot') {
      const s = t.shop, v = t.vit;
      if (b.channel) {}
      else if (v && !v.broken) { if (Math.hypot(v.front.x - b.pos.x, v.front.z - b.pos.z) < 2) { b.wish.set(0, 0, 0); b.yaw = Math.atan2(-v.n.x, -v.n.z); this.startChannel(b, 'casse', 1.4, () => !v.broken, () => { this.breakVitrine(v, b); ai.path = null; }, 'Punch_Right'); } }
      else {
        const items = this.shopItems(s);
        if (!items.length || b.bagKg > b.cap * 0.6) { ai.task = null; ai.think = 0; }
        else { const it = items.reduce((m, i) => (i.pos.distanceTo(b.pos) < m.pos.distanceTo(b.pos) ? i : m), items[0]);
          if (Math.hypot(it.pos.x - b.pos.x, it.pos.z - b.pos.z) < 1.6) { b.wish.set(0, 0, 0); this.startChannel(b, 'prise', 0.6, () => !it.taken, () => this.takeShopItem(b, s, it), 'Interact'); }
          else if ((!ai.path || ai.itemGoal !== it) && this.pathBudget-- > 0) { ai.itemGoal = it; const path = this.world.path(b.pos.x, b.pos.z, it.pos.x, it.pos.z); ai.path = path; ai.pi = 1; if (!path) { ai.task = null; ai.think = 0; } } }
      }
    } else if (t.kind === 'home') {
      const s = this.socles[b.team].find((s) => s.pos.distanceTo(b.pos) < 3.5);
      if (s) { if (this.deposit(b) === 0 || b.bag.length) { this.botGo(b, { kind: 'sell' }, this.recel.pos.clone().add(V(-2.5, 0, -2))); } else { ai.task = null; ai.think = 0; } }
    } else if (t.kind === 'sell') { if (b.pos.distanceTo(this.recel.pos) < this.recel.r) { this.sell(b); ai.task = null; ai.think = 0; } }
    else if (t.kind === 'pickup') { const d = t.drop; if (!this.drops.includes(d)) { ai.task = null; ai.think = 0; } else if (d.pos.distanceTo(b.pos) < 1.8) { if (d.weapon) this.pickWeapon(b, d); else this.pickDrop(b, d); ai.task = null; ai.think = 0; } }
    else if (t.kind === 'raid') { const s = t.socle; if (!s.item) { ai.task = null; ai.think = 0; } else if (s.pos.distanceTo(b.pos) < 1.8 && !b.channel) { const it = s.item; this.startChannel(b, 'vol', 1.6, () => s.item === it, () => { const x = this.takeFromSocle(s); x.stolen = true; this.bagAdd(b, x); this.alertTeam(ENEMY[b.team], `🚨 ${b.name} vole ${x.nom} à ta base !`); ai.think = 0; ai.task = null; }, 'Interact'); } }
    else if (t.kind === 'zone') { if (!ai.path) { ai.idle = (ai.idle || 0) + dt; if (ai.idle > rnd(3, 6)) { ai.idle = 0; ai.think = 0; } } }
    else if (t.kind === 'alarm' || t.kind === 'defend') { if (!ai.path) { ai.task = null; ai.think = rnd(1, 3); } }
    // les canaux des bots avancent tout seuls
    if (b.channel) { const c = b.channel; if (!c.valid() || ai.target && ai.los && Math.random() < dt) b.channel = null; else { c.t += dt; if (c.t >= c.dur) { b.channel = null; c.done(); } } }
  }

  // ---------------------------------------------------------------- Domination
  updateZones(dt) {
    this.zoneTick = (this.zoneTick || 0) + dt;
    for (const z of this.zoneState) {
      const n = { ordre: 0, civils: 0 };
      for (const a of this.actors) if (a.alive && !a.inCar && Math.hypot(a.pos.x - z.center[0], a.pos.z - z.center[1]) < z.radius) n[a.team]++;
      z.contested = n.ordre > 0 && n.civils > 0; z.n = n;
      const only = !z.contested ? (n.ordre ? 'ordre' : n.civils ? 'civils' : null) : null;
      if (only && z.owner !== only) {
        const rate = dt / 7 * Math.min(3, n[only]) ** 0.6;
        if (z.cap && z.cap !== only) { z.p -= rate; if (z.p <= 0) { z.p = 0; z.cap = only; } } else { z.cap = only; z.p += rate; if (z.p >= 1) this.captureZone(z, only); }
      } else if (!only && !z.contested && z.cap && z.owner !== z.cap) { z.p = Math.max(0, z.p - dt / 20); if (z.p <= 0) z.cap = null; }
      const col = z.owner ? TEAMS[z.owner].color : '#ffffff';
      for (const m of z.mats) m.color?.set(col); if (z.mats[2].uniforms) z.mats[2].uniforms.c.value.set(z.contested ? (this.time * 3 | 0) % 2 ? '#fff' : col : col);
      z.flag.position.y = 6 + Math.sin(this.time * 2 + z.center[0]) * 0.2; z.flag.material.color.set(col);
    }
    if (this.zoneTick >= 1) { this.zoneTick -= 1; for (const z of this.zoneState) if (z.owner) this.score[z.owner] += 1; }
  }
  captureZone(z, team) {
    const prev = z.owner; z.owner = team; z.p = 1; this.fx.ring(V(z.center[0], this.world.groundY(z.center[0], z.center[1]), z.center[1]), TEAMS[team].color);
    const mine = team === this.save.team; this.audio.capture(mine);
    this.announce(`ZONE ${z.id} ${mine ? 'CAPTURÉE' : 'PERDUE'}`, `${z.name} · ${TEAMS[team].name}`, TEAMS[team].color, 1.8);
    const p = this.player; if (p.alive && p.team === team && Math.hypot(p.pos.x - z.center[0], p.pos.z - z.center[1]) < z.radius) { this.stats.captures++; this.earn(150, `Capture de ${z.id}`); }
  }
  endMatch() {
    this.over = true; const w = this.score.ordre > this.score.civils ? 'ordre' : this.score.civils > this.score.ordre ? 'civils' : null;
    const win = w === this.save.team; if (win) this.earn(1000, 'Victoire', true);
    this.audio.engine(false);
    this.save.xp = (this.save.xp || 0) + this.stats.kills * 10 + this.stats.captures * 30 + (win ? 200 : 50); this.save.lvl = 1 + Math.floor(Math.sqrt(this.save.xp / 100)); this.persist();
    setTimeout(() => this.onEnd?.({ win, draw: !w, score: { ...this.score }, stats: { ...this.stats } }), 1500);
    this.announce(w ? (win ? 'VICTOIRE' : 'DÉFAITE') : 'ÉGALITÉ', `${this.score.ordre} — ${this.score.civils}`, win ? '#ffcc3d' : '#ff4a4a', 3);
  }

  // ---------------------------------------------------------------- caméra : TPS / FPS, balancement, tremblement, recul
  updateCamera(dt) {
    const a = this.player, C = this.cam, cam = this.camera;
    C.trauma = Math.max(0, C.trauma - dt * 1.4);
    C.kickP *= Math.exp(-dt * 9); C.kickY *= Math.exp(-dt * 9); C.dip *= Math.exp(-dt * 7);
    const sp = a.alive && !a.inCar ? this.feetSpeed(a) : 0; const fps = C.fps && !a.inCar && a.alive;
    const k = fps ? 1 : 0.35; // balancement plus fort en vue subjective
    if (a.onGround && sp > 0.5) C.bob += dt * sp * 1.25;
    const bobA = Math.min(1, sp / 7) * (a.slideT > 0 || a.rollT > 0 ? 0 : 1);
    const bobY = Math.abs(Math.sin(C.bob)) * 0.055 * bobA * k * (1 + a.momentum * 0.6), bobX = Math.cos(C.bob) * 0.035 * bobA * k;
    // inclinaison : glissade, roulade, vitesse latérale
    const lateral = a.alive ? V(a.vel.x, 0, a.vel.z).dot(V(-Math.cos(C.yaw), 0, Math.sin(C.yaw))) : 0;
    const targetRoll = (a.slideT > 0 ? 0.1 : 0) + clamp(-lateral * 0.006, -0.05, 0.05) * k * 2 + (a.rollT > 0 ? Math.sin((0.55 - a.rollT) / 0.55 * Math.PI) * 0.25 * k : 0);
    C.roll = lerp(C.roll, targetRoll, 1 - Math.exp(-dt * 8));
    // tremblement (trauma²) + vibration de vitesse (sprint à fond, voiture rapide)
    const speedShake = (a.momentum > 0.8 && sp > 8 ? 0.15 : 0) + (a.inCar ? Math.abs(a.inCar.speed) / a.inCar.max * 0.25 : 0) + (a.inGas || 0) * 0.3;
    const tr = C.trauma * C.trauma + speedShake * 0.1; const t = this.time * 30;
    const shY = (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.035 * tr * (fps ? 1 : 0.6), shP = (Math.sin(t * 1.7 + 1) + Math.sin(t * 2.9) * 0.5) * 0.035 * tr * (fps ? 1 : 0.6), shR = Math.sin(t * 1.3 + 2) * 0.05 * tr * (fps ? 1 : 0.5);
    // champ de vision : élan → plus large, visée → zoom
    const W = this.weapon(a); const scope = this.aiming && W && WEAPONS[W.id].scope;
    const fovT = (scope ? 26 : this.aiming ? 55 : 72) + (a.momentum * (fps ? 10 : 7)) + (a.inCar ? Math.abs(a.inCar.speed) / a.inCar.max * 14 : 0);
    C.fov = lerp(C.fov, fovT, 1 - Math.exp(-dt * 10)); if (Math.abs(cam.fov - C.fov) > 0.05) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
    const yaw = C.yaw + C.kickY + shY, pitch = C.pitch + C.kickP + shP;
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (a.inCar) {
      const c = a.inCar; C.carYaw = lerp_angle(C.carYaw ?? c.yaw, c.yaw, 1 - Math.exp(-dt * 3));
      // la caméra regarde où on pointe à la souris, puis revient derrière la voiture
      const look = this.input.st.mx || this.input.st.lookX ? 1 : 0; C.freeT = look ? 1.2 : Math.max(0, (C.freeT || 0) - dt); if (!C.freeT) C.yaw = lerp_angle(C.yaw, C.carYaw, 1 - Math.exp(-dt * 2.5)), C.pitch = lerp(C.pitch, -0.2, 1 - Math.exp(-dt * 2));
      const piv = c.pos.clone().add(V(0, c.H + 0.6, 0)); const back = 5.5 + Math.abs(c.speed) * 0.06;
      const want = piv.clone().addScaledVector(dir, -back); const hit = this.world.ray(piv, want.clone().sub(piv).normalize(), back); if (hit) want.copy(piv).addScaledVector(want.sub(piv).normalize(), Math.max(1, hit.t - 0.3));
      cam.position.copy(want); cam.position.y += bobY; cam.lookAt(piv.clone().addScaledVector(dir, 6)); cam.rotateZ(shR);
    } else if (fps) {
      const eye = a.pos.clone().add(V(0, (a.slideT > 0 ? 0.95 : a.rollT > 0 ? 0.9 : EYE - (a.crouchK || 0) * 0.55) + bobY + C.dip, 0));
      eye.addScaledVector(V(-Math.cos(C.yaw), 0, Math.sin(C.yaw)), bobX);
      cam.position.copy(eye); cam.lookAt(eye.clone().add(dir)); cam.rotateZ(C.roll + shR);
    } else {
      const shoulder = this.aiming ? 0.62 : 0.55, back = this.aiming ? 1.5 : 3.1 - a.momentum * 0.2 + (a.slideT > 0 ? -0.6 : 0);
      const piv = a.pos.clone().add(V(0, (a.slideT > 0 ? 1.0 : 1.55 - (a.crouchK || 0) * 0.5) + C.dip * 0.6, 0));
      const right = V(-Math.cos(C.yaw), 0, Math.sin(C.yaw));
      const sh = piv.clone().addScaledVector(right, shoulder); const hs = this.world.ray(piv, right, shoulder + 0.2); if (hs) sh.copy(piv).addScaledVector(right, Math.max(0, hs.t - 0.25));
      const want = sh.clone().addScaledVector(dir, -back).add(V(0, 0.15, 0));
      const d = want.clone().sub(sh); const L = d.length(); const h = this.world.ray(sh, d.clone().divideScalar(L), L + 0.2);
      if (h) want.copy(sh).addScaledVector(d.divideScalar(L), Math.max(0.3, h.t - 0.25));
      want.y += bobY; want.addScaledVector(right, bobX);
      if (C.snap) { cam.position.copy(want); C.snap = false; } else cam.position.lerp(want, 1 - Math.exp(-dt * 25)); cam.lookAt(cam.position.clone().add(dir)); cam.rotateZ(C.roll * 0.6 + shR);
    }
    { const o = cam.position, d = V(); cam.getWorldDirection(d); const h = this.world.ray(o, d, 120); const t = h ? Math.max(h.t, 4) : 120; this.aimPt = o.clone().addScaledVector(d, t); }
    a.ch.root.visible = a.alive || a.respawnT > 0 ? (fps ? false : !a.inCar) : false;
    if (this.vgun) { this.vgun.visible = fps && a.alive && !scope; this.updateViewGun(dt, sp, bobA); }
    this.audio.listener.x = cam.position.x; this.audio.listener.y = cam.position.y; this.audio.listener.z = cam.position.z; this.audio.listener.yaw = -C.yaw + Math.PI;
    this.followShadow(a.pos);
    // effets d'écran
    const gas = a.inGas || 0; const pd = this.fx.density(cam.position, ['smoke', 'smoke-dark']);
    // dans la fumée : voile laiteux qui monte avec la densité ; lacrymo : yeux qui piquent (léger flou, larmes) sans masquer l'écran
    this.renderer.domElement.style.filter = gas > 0.08 ? `blur(${(Math.max(0, gas - 0.3) * 1.6).toFixed(2)}px) saturate(${(1 - gas * 0.3).toFixed(2)}) brightness(${(1 + gas * 0.08).toFixed(2)})` : '';
    $('vignette').style.opacity = a.alive ? Math.max(clamp((60 - a.hp) / 60, 0, 1) * 0.9, gas * 0.45, Math.min(0.7, pd * 0.5)) : 0.8;
    $('vignette').style.background = pd > 0.15 && a.hp > 50 ? 'radial-gradient(ellipse at center, rgba(220,222,225,.55) 0%, rgba(215,217,220,.9))' : gas > 0.15 && a.hp > 50 ? 'radial-gradient(ellipse at center, rgba(255,255,255,0) 45%, rgba(235,232,200,.75))' : '';
    document.body.classList.toggle('scoped', !!scope);
  }
  // arme en vue subjective, accrochée à la caméra
  viewGun() {
    if (this.vgun) this.camera.remove(this.vgun);
    const W = this.weapon(this.player); if (!W) return; const g = gunInstance(W.id); g.rotation.y = -Math.PI / 2; g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 5; } });
    this.vgun = new THREE.Group(); this.vgun.add(g); this.vgun.userData.muzzle = g.userData.muzzle; this.camera.add(this.vgun); this.vgunBase = V(0.2, -0.2, -0.38);
    if (!this.scene.children.includes(this.camera)) this.scene.add(this.camera);
  }
  updateViewGun(dt, sp, bobA) {
    const a = this.player, C = this.cam; const g = this.vgun; const ad = this.aiming ? V(0, -0.135, -0.3) : this.vgunBase;
    const t = C.bob; const sway = V(Math.cos(t) * 0.012 * bobA, -Math.abs(Math.sin(t)) * 0.015 * bobA, 0);
    const rel = a.reloadT > 0 ? Math.sin(Math.min(1, a.reloadT / WEAPONS[this.weapon(a).id].reload) * Math.PI) : 0;
    const target = ad.clone().add(sway).add(V(0, -rel * 0.15 - (a.momentum > 0.7 && !this.aiming ? 0.03 : 0), C.kickP * 1.5));
    g.position.lerp(target, 1 - Math.exp(-dt * 18)); g.rotation.set(C.kickP * 2 + rel * 0.6, (this.input.st.mx || 0) * -0.0006, a.momentum > 0.7 && !this.aiming ? 0.25 : 0);
  }

  // ---------------------------------------------------------------- interface
  hudInit() {
    $('zones').innerHTML = this.zoneState.map((z) => `<div class="zone" id="z${z.id}"><div class="fill"></div><span>${z.id}</span></div>`).join('');
  }
  toast(txt, color = '#fff') { const el = document.createElement('div'); el.textContent = txt; el.style.setProperty('--c', color); $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200); while ($('toasts').children.length > 5) $('toasts').firstChild.remove(); }
  announce(big, small, color = '#fff', dur = 2) { const el = $('center'); el.innerHTML = `${big}<small>${small || ''}</small>`; el.style.color = color; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(this._annT); this._annT = setTimeout(() => el.classList.remove('on'), dur * 1000); }
  killFeed(by, t, opts) {
    const el = document.createElement('div'); const c = (x) => (x?.team === 'ordre' ? 'o' : 'c');
    const how = opts.gas ? '💨' : opts.weapon ? WEAPONS[opts.weapon]?.icon || '✖' : by ? '🚗' : '☠';
    el.innerHTML = by ? `<span class="${c(by)}">${by.name}</span> ${how}${opts.head ? '🎯' : ''} <span class="${c(t)}">${t.name}</span>` : `☠ <span class="${c(t)}">${t.name}</span>`;
    if (by === this.player || t === this.player) el.className = 'me'; $('feed').prepend(el); setTimeout(() => el.remove(), 5000); while ($('feed').children.length > 6) $('feed').lastChild.remove();
  }
  hitmark(kill, head) { const h = $('hitmark'); h.className = ''; void h.offsetWidth; h.className = 'on' + (kill ? ' kill' : '') + (head ? ' head' : ''); }
  hurtDir(from) {
    const a = this.player; const ang = Math.atan2(from.x - a.pos.x, from.z - a.pos.z) - this.cam.yaw; const i = document.createElement('i'); i.style.transform = `rotate(${-ang * 180 / Math.PI + 180}deg)`;
    $('dmgdir').appendChild(i); setTimeout(() => i.remove(), 1100);
  }
  toggleInv() {
    const el = $('inv'); const show = el.classList.contains('hidden'); el.classList.toggle('hidden', !show); if (!show) return;
    const a = this.player; $('invList').innerHTML = a.bag.length ? a.bag.map((i) => `<div class="card" style="--c:${RARITY[i.rarity].color}"><b>${i.icon} ${i.nom}</b><small style="color:${RARITY[i.rarity].color}">${RARITY[i.rarity].name}${i.stolen ? ' · volé' : ''}</small><small>${fmt(i.valeur)} € · ${i.poids} kg</small></div>`).join('') : '<p class="small">Sac vide. Casse une vitrine de luxe pour le remplir.</p>';
  }
  updateHud() {
    const a = this.player, I = this.input;
    $('sc-ordre').textContent = this.score.ordre; $('sc-civils').textContent = this.score.civils;
    const left = Math.max(0, this.matchLen - this.time); $('timer').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · premier à ${this.scoreLimit}`;
    for (const z of this.zoneState) { const el = $('z' + z.id); el.className = 'zone' + (z.owner ? ' ' + z.owner : '') + (z.contested ? ' contested' : ''); const f = el.firstChild; f.style.height = (z.owner && z.cap === z.owner ? 100 : z.p * 100) + '%'; f.style.background = z.cap ? TEAMS[z.cap].color : 'transparent'; }
    $('cash').textContent = fmt(this.save.bank);
    this.incomeSmooth = lerp(this.incomeSmooth || 0, (this.incomeAcc || 0) * 10, 0.1); this.incomeAcc = 0;
    const inc = this.socles[a.team].reduce((s, x) => s + (x.owner === a && x.item ? x.item.valeur * 0.006 : 0), 0); $('income').textContent = inc ? `+${inc.toFixed(1)} €/s` : '';
    $('matsN').textContent = a.mats;
    $('bagkg').textContent = `${Math.round(a.bagKg * 10) / 10}/${a.cap} kg · ${fmt(this.bagValue(a))} €`;
    $('bagitems').innerHTML = a.bag.map((i) => `<span style="--c:${RARITY[i.rarity].color}" title="${i.nom}">${i.icon}</span>`).join('');
    $('hpbar').style.width = Math.max(0, a.hp) + '%'; $('hpn').textContent = Math.max(0, Math.ceil(a.hp)); $('armorbar').style.width = Math.min(100, a.armor) + '%';
    $('weapons').innerHTML = a.slots.map((s, i) => `<div class="${i === a.cur ? 'on' : ''}" style="--c:${RARITY[s.rarity].color}"><em>${WEAPONS[s.id].icon}</em>${WEAPONS[s.id].name}</div>`).join('') + `<div style="--c:#888"><em>${a.team === 'ordre' ? '💨' : '🎆'}</em>${a.nades} · ${I.label('grenade')}</div>`;
    const W = this.weapon(a); if (W) { $('mag').textContent = a.reloadT > 0 ? '…' : W.mag; $('reserve').textContent = `/ ${WEAPONS[W.id].mag}`; $('wname').textContent = `${WEAPONS[W.id].name.toUpperCase()} · ${RARITY[W.rarity].name.toUpperCase()}`; $('wname').style.color = RARITY[W.rarity].color; }
    const pr = $('prompt'); if (this.ui.prompt && a.alive) { pr.innerHTML = this.ui.prompt; pr.classList.add('on'); } else pr.classList.remove('on');
    const ch = $('channel'); if (a.channel) { ch.classList.add('on'); ch.querySelector('i').style.width = (a.channel.t / a.channel.dur * 100) + '%'; ch.querySelector('span').textContent = a.channel.label; } else ch.classList.remove('on');
    const car = $('car'); if (a.inCar) { car.classList.add('on'); $('kmh').textContent = Math.round(Math.abs(a.inCar.speed) * 3.6); $('carhp').style.width = (a.inCar.hp / a.inCar.maxHp * 100) + '%'; } else car.classList.remove('on');
    // réticule : s'ouvre avec la dispersion
    const D = W ? WEAPONS[W.id] : null; const sp = this.feetSpeed(a);
    const gap = D ? 4 + D.spread * 260 * (sp > 2 ? 1.6 : 1) * (this.aiming ? 0.45 : 1) * (a.onGround ? 1 : 1.8) + (this.ui.crossKick || 0) * 8 : 6; this.ui.crossKick = 0;
    $('cross').style.setProperty('--g', gap.toFixed(1) + 'px'); $('cross').style.display = (this.cam.fps && this.aiming && D?.scope) || a.inCar ? 'none' : '';
    $('keys').innerHTML = I.st.usingPad
      ? `<kbd>R2</kbd> tir · <kbd>L2</kbd> viser · <kbd>✕</kbd> saut/escalade · <kbd>○</kbd> roulade/glissade · <kbd>□</kbd> agir/voler · <kbd>△</kbd> arme · <kbd>L1</kbd> accroupi · <kbd>R1</kbd> ${a.team === 'ordre' ? 'lacrymo' : 'fumigène'} · <kbd>⬇</kbd> barricade · <kbd>L3</kbd> sprint · <kbd>R3</kbd> vue`
      : `<kbd>E</kbd> agir · <kbd>F</kbd> voler une voiture · <kbd>Q</kbd> barricade · <kbd>G</kbd> ${a.team === 'ordre' ? 'lacrymo' : 'fumigène'} · <kbd>C</kbd> accroupi · <kbd>Ctrl</kbd> roulade/glissade · <kbd>V</kbd> vue FPS/TPS · <kbd>Tab</kbd> sac`;
  }
  minimapInit() {
    const W = this.world, B = W.bounds; const c = document.createElement('canvas'); const S = 4; c.width = (B.x1 - B.x0) * S; c.height = (B.z1 - B.z0) * S;
    const g = c.getContext('2d'); g.scale(S, S); g.translate(-B.x0, -B.z0); g.fillStyle = '#4a4d53'; g.fillRect(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    for (const col of W.colliders) if (col.type === 'poly') { g.fillStyle = '#cfc3a8'; g.beginPath(); col.poly.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.fill(); }
    for (const col of W.colliders) if (col.type !== 'poly') { g.fillStyle = col.tag === 'arbre' ? '#6f9a3e' : '#2b2e33'; if (col.type === 'circle') { g.beginPath(); g.arc(col.x, col.z, Math.max(col.r, 0.4), 0, 7); g.fill(); } else { g.save(); g.translate(col.x, col.z); g.rotate(-col.yaw); g.fillRect(-col.hx, -col.hz, col.hx * 2, col.hz * 2); g.restore(); } }
    this.mmBase = c; this.mm = $('minimap').querySelector('canvas'); this.mmS = S;
  }
  drawMinimap() {
    const cv = this.mm; if (!cv) return; const W = this.world, B = W.bounds; const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
    const g = cv.getContext('2d'); const k = cv.width / (B.x1 - B.x0); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.mmBase, 0, 0, cv.width, cv.height); g.setTransform(k, 0, 0, k, -B.x0 * k, -B.z0 * k);
    for (const z of this.zoneState) { g.globalAlpha = 0.5; g.fillStyle = z.owner ? TEAMS[z.owner].color : '#fff'; g.beginPath(); g.arc(z.center[0], z.center[1], z.radius, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = '#000'; g.font = 'bold 6px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(z.id, z.center[0], z.center[1]); }
    g.font = '6px sans-serif'; for (const s of this.shops) { g.globalAlpha = this.shopItems(s).length ? 1 : 0.35; g.fillText(s.gamme === 'luxe' ? '💎' : '🛍️', s.front.x, s.front.z); } g.globalAlpha = 1;
    g.font = '7px sans-serif'; g.fillText('💰', this.recel.pos.x, this.recel.pos.z);
    for (const t of ['ordre', 'civils']) for (const s of this.socles[t]) if (s.item) { g.fillStyle = RARITY[s.item.rarity].color; g.fillRect(s.pos.x - 0.8, s.pos.z - 0.8, 1.6, 1.6); }
    for (const d of this.drops) { g.fillStyle = '#ffcc3d'; g.beginPath(); g.arc(d.pos.x, d.pos.z, 0.9, 0, 7); g.fill(); }
    for (const c of this.cars) if (!c.dead) { g.save(); g.translate(c.pos.x, c.pos.z); g.rotate(-c.yaw); g.fillStyle = c.driver ? (c.driver.team === 'ordre' ? '#3d8bff' : '#ff7a2f') : '#ddd'; g.fillRect(-c.W / 2, -c.L / 2, c.W, c.L); g.restore(); }
    for (const c of this.fx.clouds) { g.globalAlpha = 0.4; g.fillStyle = c.kind === 'gas' ? '#e8e6cf' : '#ff4fa0'; g.beginPath(); g.arc(c.pos.x, c.pos.z, c.r, 0, 7); g.fill(); g.globalAlpha = 1; }
    const me = this.player;
    for (const a of this.actors) { if (!a.alive || a === me) continue; const ally = a.team === me.team; if (!ally && this.time - (a.spotted || -99) > 3 && a.pos.distanceTo(me.pos) > 12) continue; g.fillStyle = ally ? TEAMS[a.team].color : '#ff2b2b'; g.beginPath(); g.arc(a.pos.x, a.pos.z, a.bag.some((i) => i.stolen) ? 1.6 : 1.1, 0, 7); g.fill(); }
    g.save(); g.translate(me.pos.x, me.pos.z); g.rotate(-this.cam.yaw); g.fillStyle = '#ffe04a'; g.strokeStyle = '#000'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(0, 2.6); g.lineTo(1.6, -1.6); g.lineTo(-1.6, -1.6); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
function lerp_angle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
