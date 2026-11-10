// Frungz : la partie. Acteurs (joueur et bots), parkour, tir, Domination, casse et butin, planques, receleur, voitures,
// lacrymogènes et fumigènes, barricades, interface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeCharacter, attachGun, gunInstance, chars, tintTeam, teamMarkings } from './assets.js';
import { TEAMS, WEAPONS, CLASSES, classOf, kitOf, SECONDARIES, RARITY, RARITY_ORDER, rollRarity, LOOT, LUXE_TYPES, COMMERCE_TYPES, SHOP_NAMES, SKIN_NAMES } from './data.js';
import { shopCase, lootMesh, beam, socle, baseSign, receleur, grenadeMesh, headMarker, textTex } from './props.js';
import { pointInPoly } from './world.js';
import * as Anim from './anim.js';
import { rideMethods } from './deuxroues.js';
import { heliMethods } from './helico.js';
import { installThrows, THROWS, solveThrow } from './throws.js';
import { svg, iconize } from './icons.js';
import { installSeries } from './series.js';
import { installBarricades, TIERS, tierInfo, fmtG } from './barricades.js';
import { installLanceurs } from './lanceurs.js';
import { createFeedback } from './feedback.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const _oq = new THREE.Quaternion(), _oi = new THREE.Quaternion();
// pas (m) parcourus pendant un cycle de chaque allure Mixamo, pour caler la cadence des pieds sur la vitesse réelle
const FINGER_SIGN = 1; // sens de fermeture des doigts sur ce squelette
const STRIDE = { MX_WalkF: 1.28, MX_WalkB: 1.31, MX_WalkL: 1.67, MX_WalkR: 1.81, MX_Run: 2.75, MX_RunAim: 2.75, MX_RunBack: 1.38, MX_RunLeft: 1.91, MX_RunRight: 1.65,
  MXP_WalkF: 1.28, MXP_WalkB: 1.31, MXP_WalkL: 1.67, MXP_WalkR: 1.81, MXP_Run: 2.13, MXP_RunBack: 1.65, MXP_RunLeft: 1.16, MXP_RunRight: 1.41,
  MX_CrouchWalk: 0.88, MXP_CrouchWalk: 0.88, MX_CrouchB: 1.02, MX_CrouchL: 1.28, MX_CrouchR: 1.13 };
// clips joués une seule fois (le reste boucle)
const ONCE = /Death|MX_Jump|MX_Land|MX_Vault|MX_Roll|MX_Slide|MX_HardLand|MX_Stop|MX_Smash|MX_Cheer|MX_FistPump|MX_Taunt|MXP_Jump/;
const ENEMY = { ordre: 'civils', civils: 'ordre' };
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const $ = (id) => document.getElementById(id);

const GRAV = 19, EYE = 1.62;
// séries d'éliminations (sans mourir) : 3, 5, 7, puis des paliers de plus en plus lourds jusqu'à 25 (voir src/series.js)
const STREAKS = {
  ordre: [{ n: 3, id: 'drone', nom: 'Drone', icon: '🛸', ico: 'drone', desc: 'lance-le : il survole la zone et repère les Frungz' }, { n: 5, id: 'crs', nom: 'Renforts CRS', icon: '🪂', ico: 'parachute', desc: '4 CRS blindés largués là où tu vises' }, { n: 7, id: 'lacry', nom: 'Salve lacrymogène', icon: '🚀', ico: 'missile', desc: 'salve de grenades lacrymogènes sur la zone visée' },
    { n: 10, id: 'heli', nom: 'Hélico de la Gendarmerie', ico: 'heli', desc: 'un hélicoptère armé tourne 35 s au-dessus de la zone visée et mitraille les Frungz' },
    { n: 14, id: 'frappe', nom: 'Frappe aérienne', ico: 'jet', desc: 'un chasseur passe en rase-mottes et tapisse de bombes une ligne vers la zone visée' },
    { n: 18, id: 'canon', nom: 'Canonnière', ico: 'gunship', desc: 'tu prends les commandes d\'un avion-canon : 25 mm et 105 mm vus du ciel pendant 25 s' },
    { n: 25, id: 'ultime', nom: 'Assaut général', ico: 'nuke', desc: 'bombardement de toutes les zones ennemies, Frungz repérés 30 s et renforts largués' }],
  civils: [{ n: 3, id: 'petards', nom: 'Pétards', icon: '🧨', ico: 'petards', desc: 'lance-le : il sonne les flics de la zone' }, { n: 5, id: 'emeute', nom: 'Renforts émeutiers', icon: '🪂', ico: 'parachute', desc: '4 émeutiers largués là où tu vises' }, { n: 7, id: 'artifice', nom: "Mortiers d'artifice", icon: '🎆', ico: 'artifice', desc: 'tir de mortiers sur la zone visée' },
    { n: 10, id: 'essaim', nom: 'Essaim de drones', ico: 'swarm', desc: '6 drones kamikazes qui traquent chacun un flic et explosent au contact' },
    { n: 14, id: 'hdetourne', nom: 'Hélico détourné', ico: 'heli', desc: 'un hélicoptère volé tourne 35 s au-dessus de la zone visée et arrose la Brigade' },
    { n: 18, id: 'canon', nom: 'Canonnière détournée', ico: 'gunship', desc: 'tu prends les commandes d\'un avion-canon : 25 mm et 105 mm vus du ciel pendant 25 s' },
    { n: 25, id: 'ultime', nom: 'Frungzpocalypse', ico: 'nuke', desc: 'pluie de feu sur toutes les zones de la Brigade, flics repérés 30 s et renforts largués' }],
};
const STREAK_BY_ID = Object.fromEntries(Object.values(STREAKS).flat().map((r) => [r.id, r]));
export { STREAKS };
const TIER_COLS = ['#ffcc3d', '#ffcc3d', '#ff9d3d', '#57b6ff', '#ff7ad9', '#ff4a3d', '#c27bff'];
// séries sans fin : après le dernier palier, un bonus tous les 5 éliminations en reprenant les gros atouts (10, 14, 18, 25) en boucle
function streakTiers(team, upto) {
  const L = STREAKS[team]; const last = L[L.length - 1].n; if (upto < last) return L;
  const big = L.slice(3), out = L.slice(); for (let n = last + 5, j = 0; n <= upto + 15; n += 5, j++) { const b = big[j % big.length]; out.push({ ...b, n, loop: true, tier: L.indexOf(b) }); }
  return out;
}
const LEGENDS = ['FRUNGZ IMMORTEL', 'FRUNGZ TITANESQUE', 'FRUNGZ COSMIQUE', 'FRUNGZ ABSOLU', 'FRUNGZ INFINI', 'FRUNGZ MYTHIQUE', 'FRUNGZ DE LÉGENDE'];
const LEGEND_COLS = ['#ffcc3d', '#57b6ff', '#ff7ad9', '#ff4a3d', '#c27bff', '#9ff59f'];
const LOOT_PTS = { commun: 2, rare: 4, epique: 6, legendaire: 10 };
// contribution à la partie (classement)
const V2 = new THREE.Vector2(); const BULLET_V = 380; const BULLET_GEO = new THREE.CylinderGeometry(0.012, 0.02, 0.09, 6).rotateX(Math.PI / 2); const BULLET_MAT = new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: 0.9, roughness: 0.25, emissive: '#5a3a00' });
const contrib = (a) => a.stats.k * 100 + a.stats.a * 50 + a.stats.cap * 150 + a.stats.sac * 10;
const BOT_NAMES = {
  ordre: ['Brigadier Lemoine', 'Gardien Diallo', 'Major Fontaine', 'Cdt Mercier', 'Agent Benali', 'Lt Garnier', 'Brigadier Roux', 'Agent Petit', 'Cpt Morel', 'Agent Nguyen', 'Agent Faure', 'Brigadier Haddad', 'Agent Lambert', 'Major Caron', 'Agent Leroy', 'Gardien Rey', 'Agent Blanc', 'Lt Masson', 'Agent Perrin', 'Agent Colin'],
  civils: ['Kéké', 'Le Baron', 'La Fouine', 'Rico', 'P\'tit Loup', 'Sacha', 'Zizou', 'Nassim', 'Miss Pavé', 'Yanis', 'Le Comte', 'Malik', 'Nana', 'Kenza', 'Momo', 'Dédé', 'La Mouette', 'Bébert', 'Teddy', 'Le Gitan'],
};

// ===================================================================================================================
// classe d'un bot : tirage pondéré (peu de tireurs embusqués, sinon la rue devient un stand de tir)
function pickClass(team) { const L = Object.values(CLASSES[team]); let x = Math.random() * L.reduce((t, K) => t + (K.bots ?? 1), 0); for (const K of L) { x -= K.bots ?? 1; if (x <= 0) return K.id; } return L[0].id; }
export class Game {
  constructor(env) {
    Object.assign(this, env); // renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts, onEnd
    this.actors = []; this.shops = []; this.drops = []; this.socles = { ordre: [], civils: [] }; this.cars = []; this.walls = []; this.grenades = [];
    this.score = { ordre: 0, civils: 0 }; this.time = 0; this.matchLen = 600; this.over = false;
    this.zoneState = this.world.zones.filter((z) => !z.optionnelle || z.id === 'I' || this.opts.teamSize >= 30).map((z) => ({ ...z, owner: null, cap: null, p: 0, contested: false }));
    this.scoreLimit = 100 * this.zoneState.length;
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.cam = { yaw: 0, pitch: 0, dist: 3, fps: !!this.save.settings?.fps, trauma: 0, bob: 0, dip: 0, roll: 0, kickP: 0, kickY: 0, fov: 70, shake: V() };
    this.ui = {}; this.nextUi = 0; this.feed = []; this.specialT = 75; this.stats = { kills: 0, deaths: 0, earned: 0, captures: 0, broken: 0, stolen: 0 };
    this.net = this.opts.net || null; this.fb = createFeedback(this); this.losQueue = 0; this.drone = { ordre: 0, civils: 0 }; this.strikes = []; this.streakCd = { ordre: 0, civils: 0 };
  }

  // ---------------------------------------------------------------- mise en place
  build() {
    this.fx.setGround((x, z, y) => this.world.groundY(x, z, y), (p, big) => this.audio.tink(p, big)); this.buildBases(); this.buildShops(); this.buildReceleur(); this.buildCars(); this.buildRides(); this.buildHelis(); this.buildZones();
    // nouvelle manche : mobilier réparé, rame sur la voie
    const W = this.world; if (W.cass) for (const e of W.cass.list) if (e.broken) W.cass.repair(e);
    if (W.metro) W.dynamic.push(...W.metro.cols);
    const T = this.save.team; const N = this.opts.teamSize;
    if (this.opts.roster) return this.buildFromRoster(this.opts.roster);
    this.player = this.spawnActor(T, this.save.skin, false, this.opts.pseudo || 'Toi');
    // en ligne (chef d'équipe) : les amis connectés prennent les premières places de l'équipe ; leur perso est piloté par leur navigateur
    for (const f of (this.opts.friends || []).slice(0, Math.max(0, N - 1))) { const sk = TEAMS[T].skins.includes(f.skin) ? f.skin : TEAMS[T].skins[0]; const b = this.spawnActor(T, sk, true, f.pseudo || 'Ami'); b.squad = true; b.puppet = true; b.owner = f.id; if (f.cls && CLASSES[T][f.cls]) { b.cls = f.cls; b.perk = classOf(T, f.cls).perk; } }
    // équipe du salon : les premiers alliés prennent le nom et la tenue des équipiers choisis
    const nf = this.actors.length - 1; const squad = (this.opts.squad || []).slice(0, Math.max(0, Math.min(3 - nf, N - 1 - nf))); for (const m of squad) { const b = this.spawnActor(T, m.skin, true, m.name); b.squad = true; }
    for (const t of ['ordre', 'civils']) { const n = t === T ? N - 1 - nf - squad.length : N; for (let i = 0; i < n; i++) this.spawnActor(t, pick(TEAMS[t].skins), true, BOT_NAMES[t][i % 20] + (i >= 20 ? ' ' + (i / 20 | 0) : '')); }
    for (const a of this.actors) this.respawn(a, true);
    this.cam.yaw = this.player.yaw;
    this.minimapInit(); this.hudInit();
    this.announce('DOMINATION', 'Tiens A · B · C — casse, vole, revends', '#fff');
  }

  // invité en ligne : on recrée exactement la distribution du chef (mêmes persos, même ordre, donc mêmes numéros)
  buildFromRoster(roster) {
    const me = this.net.id, host = this.net.hostId;
    for (const [team, skin, name, cls, owner, squad] of roster) {
      const mine = owner === me; const a = this.spawnActor(team, skin, !mine, mine ? (this.opts.pseudo || name) : name);
      if (cls && CLASSES[team][cls]) { a.cls = cls; a.perk = classOf(team, cls).perk; }
      if (mine) this.player = a; else { a.puppet = true; a.owner = owner || host; }
      if (squad) a.squad = true;
    }
    for (const a of this.actors) this.respawn(a, true);
    for (const a of this.actors) if (a.marker) a.marker.visible = a.team === this.player.team;
    this.cam.yaw = this.player.yaw;
    this.minimapInit(); this.hudInit();
    this.announce('DOMINATION', 'En ligne avec ton équipe · tiens A · B · C', '#fff');
  }
  // ---------------------------------------------------------------- en ligne
  // ce navigateur décide-t-il pour ce perso ? (son propre joueur ; et tous les bots chez le chef)
  netOwns(a) { return !this.net || a === this.player || !a.puppet; }
  // un perso piloté à distance : on rejoint en douceur la dernière position reçue (prolongée par la vitesse), puis on l'anime comme les autres
  updatePuppet(a, dt) {
    if (a.gone) return; const n = a.net;
    if (n && (n.fl & 1) && !a.alive && performance.now() / 1000 - n.at < 1) { this.respawn(a); a.pos.set(n.x, n.y, n.z); a.ch.root.visible = true; }
    if (!a.alive) { a.respawnT = 99; this.updateActor(a, dt); return; }
    a.spawnProt = Math.max(0, (a.spawnProt || 0) - dt); a.fireT -= dt;
    if (n) {
      const age = Math.min(0.3, performance.now() / 1000 - n.at);
      const tx = n.x + n.vx * age, tz = n.z + n.vz * age, ty = n.y + ((n.fl & 2) ? 0 : n.vy * age);
      const d2 = (a.pos.x - tx) ** 2 + (a.pos.z - tz) ** 2 + (a.pos.y - ty) ** 2;
      if (d2 > 25) a.pos.set(tx, ty, tz); else { const k = 1 - Math.exp(-dt * 14); a.pos.x += (tx - a.pos.x) * k; a.pos.y += (ty - a.pos.y) * k; a.pos.z += (tz - a.pos.z) * k; }
      a.vel.set(n.vx, n.vy, n.vz); a.onGround = !!(n.fl & 2); a.crouch = !!(n.fl & 4);
      a.yaw = lerp_angle(a.yaw, n.yaw, 1 - Math.exp(-dt * 16)); a.pitch = n.pitch;
      const hd = V(n.vx, 0, n.vz); if (hd.lengthSq() > 0.01) hd.normalize(); else hd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
      if (n.fl & 8) { if (!(a.slideT > 0)) a.slideDir = hd.clone(); a.slideT = 0.3; } else a.slideT = 0;
      if (n.fl & 16) { if (!(a.rollT > 0)) a.rollDir = hd.clone(); a.rollT = 0.3; } else a.rollT = 0;
      if (n.gun && a.slots[a.cur]?.id !== n.gun && WEAPONS[n.gun]) { a.slots = [{ id: n.gun, rarity: 'commun', mag: WEAPONS[n.gun].mag }]; this.equip(a, 0, true); }
      if (n.hp != null) a.hp = n.hp;
    }
    a.crouchK = lerp(a.crouchK || 0, a.crouch ? 1 : 0, 1 - Math.exp(-dt * 12));
    this.animate(a, dt);
  }
  // tir d'un perso distant : éclair, son, traceur dans la direction de son regard (les dégâts, eux, sont décidés chez le tireur)
  netShot(a, k) {
    a.lastShot = this.time; const W = WEAPONS[a.slots[a.cur]?.id]; if (!W) return;
    const muzzle = V(); (a.ch.gun?.userData.muzzle || a.ch.root).getWorldPosition(muzzle);
    this.audio.gun(W.sound, a.pos, 1); this.fx.muzzle(muzzle, W.pellets > 1 ? 1.4 : 1);
    const c = Math.cos(a.pitch || 0), d = V(Math.sin(a.yaw) * c, Math.sin(a.pitch || 0), Math.cos(a.yaw) * c);
    const o = a.pos.clone().add(V(0, 1.45, 0)); if (W.proj) { this.launchProj(a, W, 1, muzzle, o, d); return; }
    const hw = this.world.ray(o, d, W.range || 120); const end = o.clone().addScaledVector(d, hw ? hw.t : (W.range || 120));
    if (a.pos.distanceToSquared(this.player.pos) < 90 * 90) { for (let i = 0; i < Math.min(k, 2); i++) this.fx.tracer(muzzle, end); if (hw) this.fx.impact(end, hw.n, 'world'); }
    if (a !== this.player) this.notePing(a, muzzle);
  }
  // un ami a quitté le salon : son perso disparaît
  netGone(a) { a.alive = false; a.gone = true; a.ch.root.visible = false; if (a.bag.length) { this.dropPile(a.pos, a.bag.splice(0)); this.carryMesh(a); } this.toast(`${a.name} a quitté la partie`, '#ccc'); }

  buildZones() {
    for (const z of this.zoneState) {
      const g = new THREE.Group(); g.position.set(z.center[0], this.world.groundY(z.center[0], z.center[1], (z.y ?? 0.17) + 0.5) + 0.05, z.center[1]);
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
      // objets exposés (bijoux, sacs, montres…) : petits, un à trois maillages chacun, 15 boutiques → ~300 dessins.
      // Sans ombre portée (ils sont sous l'éclairage de la boutique) et masqués au-delà de 55 m (on ne les distingue plus).
      s.itemMeshes = []; for (const it of s.items) it.node?.traverse((o) => { if (o.isMesh) { o.castShadow = false; s.itemMeshes.push(o); } }); s.near = true;
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
    const a = { team, skin, bot, name, ch, pos: V(), vel: V(), yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false, onGround: true, slots: [], cur: 0, fireT: 0, reloadT: 0, bag: [], bagKg: 0, mats: 30, nades: 2, momentum: 0, slideT: 0, rollT: 0, climb: null, respawnT: 0, lastHit: 0, anim: null, inCar: null, stats: { k: 0, d: 0, a: 0, cap: 0, sac: 0 }, streak: 0, rewards: [], spotted: 0, gasT: 0, channel: null, cash: 0, regenT: 0, id: this.actors.length };
    a.cls = bot ? pickClass(team) : (this.save.cls?.[team] || Object.keys(CLASSES[team])[0]); a.perk = classOf(team, a.cls).perk;
    a.cap = 20 + (bot ? 8 : (this.save.upgrades.sac || 0) * 8) + (a.perk.kg || 0);
    // tenue : police nationale (bleu marine, brassard orange, POLICE dans le dos) ou civils loufoques
    tintTeam(ch.model, skin, team);
    if (team === 'ordre') {
      // « POLICE » dans le dos et sur la poitrine, brassard orange : peints sur le tissu de la tenue (ils suivent le vêtement)
      teamMarkings(ch, skin);
    }
    if (bot) { const mk = headMarker(team === this.save.team ? (team === 'ordre' ? '#3d8bff' : '#34c759') : '#ff3030'); mk.position.y = 2.25; mk.visible = team === this.save.team; ch.root.add(mk); a.marker = mk; }
    for (const k of Object.keys(ch.actions)) { const act = ch.actions[k]; if (ONCE.test(k)) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; } if (/Roll|Gun_Shoot|HitRecieve|Interact|Punch/.test(k)) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = false; } }
    a.ai = { path: null, pi: 0, goal: null, task: null, think: Math.random() * 2, target: null, seeT: 0, react: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: V(), nadeT: rnd(8, 20), los: false, losT: 0 };
    this.actors.push(a); return a;
  }
  // équipement de la classe : arme secondaire + arme principale (celle choisie à l'armurerie remplace celle de la classe)
  // équipement de la classe : l'arme principale et le pistolet choisis pour cette classe (menu ou armurerie) ; les bots tirent au sort parmi les armes de leur classe
  loadout(a) {
    const K = classOf(a.team, a.cls); a.perk = K.perk;
    let prim = K.primary, sec = K.secondary;
    if (a.bot) { if (Math.random() < 0.45) prim = pick(K.primaries); if (Math.random() < 0.3) sec = pick(SECONDARIES); }
    else ({ p: prim, s: sec } = kitOf(this.save, a.team, K));
    a.slots = [{ id: sec, rarity: a.bot ? 'commun' : 'rare', mag: WEAPONS[sec].mag }, { id: prim, rarity: a.bot ? rollRarity() : 'rare', mag: WEAPONS[prim].mag }]; a.cur = 1;
    this.equip(a, a.cur, true);
  }
  equip(a, i, silent) {
    if (!a.slots[i]) return; a.cur = i; a.reloadT = 0; a.burstLeft = 0; a.fireT = Math.max(a.fireT, 0.25);
    attachGun(a.ch, a.slots[i].id); if (!silent) Anim.swap(a); a.ch.meshes = null; a.lodShadow = undefined; const rc = RARITY[a.slots[i].rarity].color;
    a.ch.gun.traverse((o) => { if (o.isMesh && a.slots[i].rarity !== 'commun') { o.material = o.material.map ? o.material : (Array.isArray(o.material) ? o.material.map((m) => tint(m, rc)) : tint(o.material, rc)); } });
    if (a.overs) a.overs = a.overs.filter((o) => o.name !== 'U_Reload'); if (!silent) this.overlay(a, 'U_Draw', 0.45, { busy: true });
    if (!a.bot) { this.viewGun(); if (!silent) this.audio.play('cloth', null, 0.5); }
    function tint(m, c) { const n = m.clone(); if (/Main|Body|Wood|Metal/i.test(m.name)) { n.emissive = new THREE.Color(c); n.emissiveIntensity = 0.12; } return n; }
  }
  respawn(a, first) {
    const sp = pick(this.world.spawns[a.team].slice(0, Math.max(20, this.opts.teamSize))); const [x, z] = this.world.randomFree(sp.x, sp.z, this.actors.length > 50 ? 4 : 2.5);
    a.pos.set(x, this.world.groundY(x, z), z); a.vel.set(0, 0, 0); a.yaw = a.team === 'ordre' ? Math.PI / 2 : -Math.PI / 2; a.pitch = 0;
    if (!a.bot && this.save.cls?.[a.team] && this.save.cls[a.team] !== a.cls) { a.cls = this.save.cls[a.team]; a.cap = 20 + (this.save.upgrades.sac || 0) * 8 + (classOf(a.team, a.cls).perk.kg || 0); } const K = classOf(a.team, a.cls);
    if (a === this.player) this.fb?.reset();
    a.hp = 100; a.armor = Math.min(150, K.armor + (a.bot ? 0 : 25 * (this.save.upgrades.gilet || 0))); a.alive = true; a.bag = []; a.bagKg = 0; a.nades = K.nades; a.frags = K.frags; a.momentum = 0; a.slideT = a.rollT = 0; a.climb = null; a.gasT = 0; a.channel = null;
    if (!a.bot) a.mats = Math.max(a.mats, 30 + 20 * (this.save.upgrades.mats || 0)); else a.mats = 40;
    a.ch.root.visible = true; a.ch.model.rotation.x = 0; a.overs = null; a.landT = a.stopT = 0; this.loadout(a); this.setAnim(a, a.ch.actions.MX_Idle ? 'LOCO' : 'Idle_Gun', 0);
    a.ai.path = null; a.ai.task = null; a.ai.think = 0; a.spawnProt = 2.5;
    if (a === this.player) { this.cam.yaw = a.yaw; this.cam.pitch = 0; this.cam.snap = true; if (!first) this.announce('', 'De retour dans la rue', '#fff', 1.2); }
  }
  setAnim(a, name, fade = 0.18, speed = 1) {
    if (name === 'LOCO') { if (a.anim !== 'LOCO') { a.ch.actions[a.anim]?.fadeOut(fade); a.anim = 'LOCO'; a.locoFade = fade; } return; }
    const act = a.ch.actions[name]; if (!act) return; act.timeScale = speed;
    if (a.anim === name) return; const prev = a.ch.actions[a.anim]; if (a.anim === 'LOCO') a.locoFade = fade;
    act.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (prev) prev.fadeOut(fade);
    a.anim = name;
  }
  weapon(a) { return a.slots[a.cur]; }
  feetSpeed(a) { return Math.hypot(a.vel.x, a.vel.z); }
  isCivil(a) { return a.team === 'civils'; }

  // ---------------------------------------------------------------- dégâts
  damage(t, amount, by, opts = {}) {
    if (!t.alive || this.over) return;
    // en ligne : la cible appartient à un autre navigateur, on lui envoie le coup (et on affiche le retour de touche tout de suite)
    if (this.net && !this.netOwns(t)) { if (by && by.team === t.team && by !== t) return; if (by && !this.netOwns(by)) return; this.net.hit(t, amount, by, opts); if (by === this.player) { this.flashBody(t); this.fb.dealt(t, amount, opts, 0, false, false); t.spotted = this.time; } return; }
    if (t.spawnProt > 0) amount *= 0.2;
    if (t.rollT > 0) amount *= 0.5; // roulade : on esquive à moitié
    if (by && by.team === t.team && by !== t) return;
    let dmg = amount, ab = 0, brk = false; if (t.armor > 0) { ab = Math.min(t.armor, dmg * 0.6); t.armor -= ab; dmg -= ab; brk = t.armor <= 0.5; if (brk) t.armor = 0; }
    t.hp -= dmg; t.lastHit = this.time; t.regenT = 5;
    if (by && by !== t) (t.hitBy ||= new Map()).set(by, this.time);
    if (by?.perk?.spot && by !== t) t.spotMark = this.time + by.perk.spot; // atout repérage : la cible reste marquée pour tout le camp
    if (by) { t.ai.target = by; t.ai.seeT = 1; if (by.bot === false || t.bot === false) by.spotted = this.time; }
    if (t === this.player) this.fb.taken(by, amount, opts, ab, brk);
    if (by === this.player && t !== this.player) { this.flashBody(t); this.fb.dealt(t, amount, opts, ab, brk, t.hp <= 0); t.spotted = this.time; }
    if (t.hp > 0) { if (Math.random() < 0.3) this.audio.play('voxPain', t.pos, 0.7, [0.95, 1.1], 0.2); if (by && by !== t && t.ch.actions.A_HitF) { const dx = by.pos.x - t.pos.x, dz = by.pos.z - t.pos.z, f = Math.sin(t.yaw) * dx + Math.cos(t.yaw) * dz, sd = Math.cos(t.yaw) * dx - Math.sin(t.yaw) * dz; Anim.flinch(t, f, sd, amount); this.overlay(t, Math.abs(f) > Math.abs(sd) ? (f > 0 ? 'A_HitF' : 'A_HitB') : (sd > 0 ? 'A_HitL' : 'A_HitR'), 0.6, { add: true, w: Math.min(1.7, 0.8 + amount / 30) }); }
      else if (!t.channel && Math.random() < 0.25 && t.ch.actions.HitRecieve) { const h = t.ch.actions.HitRecieve; h.reset().setEffectiveWeight(0.6).fadeIn(0.05).play(); setTimeout(() => h.fadeOut(0.15), 250); } if (t.channel) t.channel = null; return; }
    this.kill(t, by, opts);
  }
  kill(t, by, opts) {
    t.alive = false; t.hp = 0; t.respawnT = t.bot ? 6 : 5; t.stats.d++; t.channel = null;
    if (t.inCar) { t.lastBy = by; this.exitCar(t, true); }
    t.overs = null; { const dn = this.deathAnim(t, by, opts); this.setAnim(t, dn, 0.1, /^MX_Death[FBLR]$/.test(dn) ? 1.2 : 1); } this.audio.play('voxDie', t.pos, 0.9);
    // le sac tombe au sol (et l'arme principale, parfois)
    if (by && by !== t && by.team === 'ordre' && t.bag.length) this.scoreEvent('ordre', 4, 'Interpellation', by);
    if (t.bag.length) { this.dropPile(t.pos, t.bag.splice(0)); t.bagKg = 0; this.carryMesh(t); }
    t.streak = 0;
    if (t.hitBy) { for (const [h, at] of t.hitBy) if (h !== by && h !== t && h.team !== t.team && this.time - at < 8) { h.stats.a++; this.addGalons(h, 0.5); if (h === this.player) this.toast('+ Assistance', '#cfe3ff'); } t.hitBy.clear(); }
    const w = t.slots[t.cur]; if (w && WEAPONS[w.id].cat !== 'pistolet' && (Math.random() < 0.6 || !t.bot)) this.dropPile(t.pos.clone().add(V(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6))), [], { id: w.id, rarity: w.rarity });
    if (by && by !== t) {
      by.stats.k++; this.addGalons(by, opts.head ? 2 : 1); this.addStreak(by); if (by.inCar?.kind === 'heli') this.heliKill(by); if (by.bot && by.alive && Math.random() < 0.12) this.overlay(by, 'U_FistPump', 1.2, { busy: true });
      if (by === this.player) this.maybeKillcam(t, opts);
      if (by === this.player) { this.multiKill(opts); this.streakDirty = 1; }
      if (by === this.player) { this.medal(opts.head ? (opts.dist > 80 ? "TIR D'ÉLITE" : 'TIR À LA TÊTE') : 'ÉLIMINÉ', t.name + (by.streak >= 2 ? ` · série ${by.streak}` : ''), opts.head); this.stats.kills++; this.earn(50 + (opts.head ? 25 : 0), opts.head ? 'Tir à la tête' : 'Élimination'); this.audio.kill(); this.input.rumble(0.9, 0.6, 160); }
    }
    if (t === this.player) { this.stats.deaths++; this.announce('ÉLIMINÉ', by ? `par ${by.name}` : '', '#ff4a4a', 2.5); }
    this.killFeed(by, t, opts);
    if (this.net && this.netOwns(t) && !opts?.fromNet) this.net.kill(t, by, opts);
  }
  // mort : projeté en arrière (explosion, métro, fusil à pompe à bout portant), emporté par l'élan en pleine course, ou chute selon le côté de l'impact
  deathAnim(t, by, opts = {}) {
    const A = t.ch.actions; if (!A.MX_DeathF) return A.MX_Death ? 'MX_Death' : 'Death';
    const W = by && by !== t ? WEAPONS[this.weapon(by)?.id] : null, near = by && by.pos.distanceTo(t.pos) < 4;
    if (opts.blast || opts.weapon === 'metro' || (W && W.pellets > 1 && near)) return 'MX_DeathFly';
    if (this.feetSpeed(t) > 4.5) return 'MX_DeathRun';
    if (!by || by === t) return pick(['MX_Death', 'MX_DeathF']);
    const dx = by.pos.x - t.pos.x, dz = by.pos.z - t.pos.z, f = Math.sin(t.yaw) * dx + Math.cos(t.yaw) * dz, sd = Math.cos(t.yaw) * dx - Math.sin(t.yaw) * dz;
    return Math.abs(f) > Math.abs(sd) ? (f > 0 ? 'MX_DeathB' : 'MX_DeathF') : (sd > 0 ? 'MX_DeathL' : 'MX_DeathR');
  }
  // couches d'animation par-dessus la locomotion : « set » remplace le haut du corps (recharger, lancer, dégainer, célébrer),
  // « add » s'ajoute à la pose courante (coups reçus, recul). busy : le buste ne corrige plus la visée pendant ce temps
  overlay(a, name, dur, { add = false, w = 1, busy = false } = {}) {
    const act = a.ch.actions[name]; if (!act || !a.alive) return false; const clip = act.getClip();
    for (const t of clip.tracks) { t.bone ??= t.name.split('.')[0]; t.ip ??= t.createInterpolant(); }
    const o = { name, clip, t: 0, dur, add, w, busy }; a.overs ||= []; const i = a.overs.findIndex((x) => x.name === name); if (i >= 0) a.overs[i] = o; else a.overs.push(o); return true;
  }
  applyOverlays(a, dt, draw) {
    if (!a.overs?.length) return; a.overs = a.overs.filter((o) => (o.t += dt) < o.dur); if (!draw) return; const B = a.ch.bones;
    for (const o of a.overs) {
      const k = o.w * Math.min(1, o.t / 0.08, (o.dur - o.t) / 0.15); if (k <= 0) continue; const tt = Math.min(o.clip.duration, o.t / o.dur * o.clip.duration);
      for (const tr of o.clip.tracks) { const b = B[tr.bone]; if (!b) continue; _oq.fromArray(tr.ip.evaluate(tt)); if (o.add) b.quaternion.multiply(_oi.identity().slerp(_oq, k)); else b.quaternion.slerp(_oq, k); }
    }
  }
  pistolStance(a) { const id = this.weapon(a)?.id; return WEAPONS[id]?.hand === 'pistol' && !!a.ch.actions.MXP_Idle; }
  scoreEvent(team, pts, why, by) {
    if (this.over || !pts) return;
    if (this.net?.guest && !this._netScore) { this.net.score(team, pts, why, by); if (by === this.player) this.toast(`+${pts} pts équipe · ${why}`, TEAMS[team].color); return; } // le chef tient le score
    this.score[team] += pts; if (by) by.stats.sac += pts;
    if (by === this.player) this.toast(`+${pts} pts équipe · ${why}`, TEAMS[team].color);
  }
  // ---------------------------------------------------------------- séries
  addStreak(a) {
    a.streak++; this.streakVitality(a);
    const L = streakTiers(a.team, a.streak), r = L.find((x) => x.n === a.streak); if (a.streak >= 30 && a.streak % 10 === 0) this.streakLegend(a, !!r); if (!r) return;
    a.rewards.push(r.id); const tier = r.loop ? r.tier : STREAKS[a.team].indexOf(r); const col = TIER_COLS[tier] || '#ffcc3d';
    if (a === this.player && r.loop && a.streak % 10 === 0) { this.streakDirty = 1; this.audio.streakReady(tier); return; } // le titre légendaire annonce déjà ce bonus
    if (a === this.player) { this.bigText(`${svg(r.ico)} ${r.nom.toUpperCase()} !${tier >= 3 ? '!' : ''}${tier >= 5 ? '!' : ''}`, `série de ${a.streak} · ${this.input.label('streak')} pour l'activer`, col, `t${tier}`); this.flash(`radial-gradient(ellipse at center, rgba(255,255,255,0) ${40 - tier * 4}%, ${col}${tier >= 3 ? 'cc' : '99'})`); this.audio.streakReady(tier); this.input.rumble(1, 0.8, 300 + tier * 80); this.cam.trauma = Math.min(1, this.cam.trauma + 0.35 + tier * 0.08); this.streakDirty = 1; if (tier >= 3) { $('hud').classList.remove('shake'); void $('hud').offsetWidth; $('hud').classList.add('shake'); } }
    else if (r.n >= 14) this.toast(`${a.name} : série de ${a.streak} · ${r.nom} !`, a.team === this.player.team ? TEAMS[a.team].color : '#ff4a4a');
    else if (a.bot) a.ai.streakT = rnd(1.5, 5);
  }
  // vitalité : chaque élimination de la série soigne, puis renforce le gilet ; plus la série est longue, plus ça remonte
  streakVitality(a) {
    if (!a.alive || a.streak < 2) return; const k = Math.min(3, 1 + a.streak / 15);
    const heal = 12 * k; const over = Math.max(0, a.hp + heal - 100); a.hp = Math.min(100, a.hp + heal); a.regenT = 0;
    if (over > 0 || a.streak % 5 === 0) a.armor = Math.min(150, (a.armor || 0) + over + (a.streak % 5 === 0 ? 40 : 0));
    if (a === this.player && a.streak % 5 === 0) this.toast(`Série ${a.streak} : vitalité au max, gilet +40`, '#9ff59f');
  }
  // tous les 10 au-delà de 25 : un titre Frungz qui monte, une prime qui grossit, et tout le quartier l'apprend
  streakLegend(a, withReward) {
    const i = a.streak / 10 - 3; const name = LEGENDS[i] || `FRUNGZ ×${a.streak / 10}`; const col = LEGEND_COLS[i % LEGEND_COLS.length];
    if (a === this.player) {
      const r = withReward ? streakTiers(a.team, a.streak).find((x) => x.n === a.streak) : null;
      this.bigText(`${name} !!!`, `série de ${a.streak} sans mourir${r ? ` · ${r.nom} prêt (${this.input.label('streak')})` : ''}`, col, 't6');
      this.flash(`radial-gradient(ellipse at center, rgba(255,255,255,.25), ${col}cc)`); this.cam.trauma = 1; this.input.rumble(1, 1, 700);
      $('hud').classList.remove('shake'); void $('hud').offsetWidth; $('hud').classList.add('shake');
      this.earn(250 * a.streak / 10 * (i + 1), name.charAt(0) + name.slice(1).toLowerCase(), true);
    } else this.toast(`${a.name} : ${name} (série de ${a.streak})`, a.team === this.player.team ? TEAMS[a.team].color : '#ff4a4a');
  }
  streakDef(a, id) { return STREAKS[a.team].find((r) => r.id === id) || STREAK_BY_ID[id]; }
  useStreak(a) {
    if (!a.alive || !a.rewards.length || this.over || a.inCar) return;
    const id = a.rewards[a.rewards.length - 1];
    if (THROWS[id]?.instant) { this.activateStreak(a, id); return; } // canonnière, assaut final : pas de visée
    if (a === this.player) { this.startThrow(a, id, true); return; }
    // bot : vise le groupe d'ennemis le plus proche (ou devant lui pour les renforts)
    const foes = this.actors.filter((t) => t.alive && !t.gone && t.team !== a.team && !t.inCar && t.pos.distanceTo(a.pos) < 45).sort((p, q) => p.pos.distanceToSquared(a.pos) - q.pos.distanceToSquared(a.pos));
    let tgt; if (id === 'crs' || id === 'emeute' || ((id === 'heli' || id === 'hdetourne' || id === 'essaim') && !foes.length)) tgt = a.pos.clone().add(V(Math.sin(a.yaw) * 6, 0, Math.cos(a.yaw) * 6));
    else if (foes.length) tgt = foes[0].pos.clone(); else tgt = a.pos.clone().add(V(Math.sin(a.yaw) * 18, 0, Math.cos(a.yaw) * 18));
    tgt.y = this.world.groundY(tgt.x, tgt.z, a.pos.y + 3);
    const o = this.throwOrigin(a); this.castThrow(a, id, solveThrow(o, tgt, id === 'drone' ? 1.2 : 1), o);
  }
  // renforts temporaires (40 s) : on recycle les acteurs partis
  reinforce(a, n, at = null, drop = false) {
    const team = a.team; const c = at || a.pos;
    for (let i = 0; i < n; i++) {
      let t = this.actors.find((x) => x.temp && x.gone && x.team === team);
      if (!t) { const k = this.actors.filter((x) => x.temp && x.team === team).length + 1; t = this.spawnActor(team, pick(TEAMS[team].skins), true, team === 'ordre' ? `CRS ${k}` : `Émeutier ${k}`); t.temp = true; }
      t.gone = false; this.respawn(t);
      const [x, z] = this.world.randomFree(c.x + rnd(-4, 4), c.z + rnd(-4, 4), 3); t.pos.set(x, this.world.groundY(x, z, c.y + 2), z); t.yaw = a.yaw; if (drop) this.startChute(t, t.pos);
      t.expire = this.time + 40; t.streak = 0; t.rewards = [];
      if (team === 'ordre') { t.armor = 100; t.slots[1] = { id: pick(['rifle', 'shotgun']), rarity: 'epique', mag: 30 }; t.slots[1].mag = WEAPONS[t.slots[1].id].mag; this.equip(t, 1, true); }
      else { t.slots[1] = { id: pick(['smg', 'shotgun']), rarity: 'rare', mag: 30 }; t.slots[1].mag = WEAPONS[t.slots[1].id].mag; this.equip(t, 1, true); }
      t.ai.think = 0; t.ai.target = a.ai?.target || null; this.fx.ring(t.pos, TEAMS[team].color);
    }
  }
  updateStreaks(dt) {
    for (const team of ['ordre', 'civils']) if (this.drone[team] > this.time && ((this._droneTick = (this._droneTick || 0) + dt) > 0.5)) { this._droneTick = 0; for (const t of this.actors) if (t.alive && t.team !== team) t.spotted = this.time; }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const k = this.strikes[i]; if (this.time < k.t) continue; this.strikes.splice(i, 1);
      if (k.kind === 'mortier' && k.target?.alive) k.pos.copy(k.target.pos);
      const p = k.pos.clone(); p.y = this.world.groundY(p.x, p.z, p.y + 0.3);
      if (k.kind === 'gas') { this.fx.cloud(p, 'gas', k.owner); this.audio.play('thud', p, 0.8); this.fx.burst(p.clone().add(V(0, 0.3, 0)), 8, { color: '#e8e6cf', speed: 3, size: 0.1, life: 0.6 }); }
      else if (k.kind === 'petard2') { for (let q = 0; q < 6; q++) this.trailPuff(p.clone().add(V(0, 0.3, 0)), pick(['#ffd23d', '#ff4fa0', '#5ad1ff', '#ffffff']), 0.35, rnd(1, 4), 3); this.audio.crack(p); }
      else if (k.kind === 'petard') { this.fx.burst(p.clone().add(V(0, 0.4, 0)), 14, { color: pick(['#ffd23d', '#ff4fa0', '#5ad1ff', '#ffffff']), speed: 6, size: 0.08, life: 0.4 }); this.audio.play('thud', p, 0.7, [1.8, 2.4], 0.01); }
      else if (k.kind === 'mortier') {
        this.fx.burst(p.clone().add(V(0, 9, 0)), 40, { color: pick(['#ff4fa0', '#ffd23d', '#5ad1ff', '#9ff59f']), speed: 9, size: 0.14, life: 1.2 });
        this.fx.burst(p.clone().add(V(0, 0.5, 0)), 20, { color: '#ffb321', speed: 7, size: 0.12, life: 0.5 }); this.audio.explode(p);
        for (const t of this.actors) { if (!t.alive || t.team === k.owner.team) continue; const d = t.pos.distanceTo(p); if (d < 5) this.damage(t, 25 + 70 * (1 - d / 5), k.owner.alive ? k.owner : null, { blast: true }); }
        if (this.player.pos.distanceTo(p) < 25) this.cam.trauma = Math.min(1, this.cam.trauma + 0.5);
      }
    }
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
      if (!a.alive || a === skip || (a.inCar && !a.inCar.kind)) continue;
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
    W.mag--; a.netShots = (a.netShots || 0) + 1; a.fireT = 1 / D.rps; if (D.burst) { a.burstLeft = a.burstLeft > 0 ? a.burstLeft - 1 : D.burst - 1; if (a.burstLeft <= 0 || W.mag <= 0) { a.burstLeft = 0; a.fireT += D.burstPause || 0.25; } } a.lastShot = this.time; Anim.kick(a, W.id); { const heavy = D.pellets > 1 || D.dmg > 50; this.overlay(a, 'A_Recoil', heavy ? 0.32 : 0.14, { add: true, w: heavy ? 0.8 : 0.3 }); }
    const muzzle = V(); (a.ch.gun?.userData.muzzle || a.ch.root).getWorldPosition(muzzle);
    if (!a.bot && this.cam.fps && this.vgun) this.vgun.userData.muzzle.getWorldPosition(muzzle);
    const moving = this.feetSpeed(a) > 2 ? 1.6 : 1; const aiming = !a.bot && this.aiming ? (this.cam.fps ? 0.1 : 0.18) : 1; const air = a.onGround ? 1 : 1.8;
    const scopedShot = a === this.player && D.scope && this.aiming;
    const hip = D.scope && !a.bot && !scopedShot ? 22 : 1, settle = scopedShot ? 1 + (1 - (this.sc?.settle ?? 1)) * 14 : 1;
    const spread = D.spread * moving * aiming * air * (a.crouch ? 0.7 : 1) * hip * settle;
    this.audio.gun(D.sound, a === this.player ? null : a.pos, a === this.player ? 0.9 : 1);
    this.fx.muzzle(muzzle, D.pellets > 1 ? 1.4 : 1);
    if (a !== this.player) this.notePing(a, muzzle);
    // douille éjectée à droite de l'arme (pas pour le revolver, qui garde ses douilles)
    if (D.casings && (a === this.player || a.pos.distanceToSquared(this.player.pos) < 625)) { const yw = a === this.player ? this.cam.yaw : a.yaw; const ep = V(); const vg = a === this.player && this.cam.fps && this.vgun; if (vg) { const B = this.vgunBB; ep.set(B ? (B.min.x + B.max.x) / 2 + 0.03 : 0.03, B ? B.max.y - 0.02 : 0.05, B ? B.min.z * 0.3 : -0.1); this.vgun.localToWorld(ep); } else (a.ch.gun || a.ch.root).getWorldPosition(ep); /* en vue subjective : fenêtre d’éjection, sur le dessus de l’arme */ this.fx.casing(ep, V(-Math.cos(yw), 0, Math.sin(yw)), D.pellets > 1); }
    if (a === this.player) {
      const k = D.kick * (this.aiming ? 0.7 : 1); this.cam.kickP += k * rnd(0.8, 1.2); this.cam.kickY += k * rnd(-0.4, 0.4); this.cam.trauma = Math.min(1, this.cam.trauma + k * 2.2);
      this.input.rumble(D.pellets > 1 || D.dmg > 50 ? 0.8 : 0.25, 0.5, 60); this.ui.crossKick = 1;
    }
    if (a.bot) { a.ch.actions.Gun_Shoot && this.setUpper(a); }
    if (scopedShot) { $('scope')?.classList.remove('kick'); void $('scope')?.offsetWidth; $('scope')?.classList.add('kick'); this.audio.bolt(); this.cam.trauma = Math.min(1, this.cam.trauma + 0.25); }
    if (D.proj) { this.launchProj(a, D, mult, muzzle, origin, dir.clone().add(V(rnd(-1, 1) * spread, rnd(-1, 1) * spread, rnd(-1, 1) * spread)).normalize()); for (const b of this.actors) if (b.bot && b.alive && b.team !== a.team && !b.ai.target && b.pos.distanceToSquared(a.pos) < 900) { b.ai.target = a; b.ai.seeT = 0.5; } return true; }
    for (let p = 0; p < D.pellets; p++) {
      const d = dir.clone(); d.x += rnd(-1, 1) * spread; d.y += rnd(-1, 1) * spread; d.z += rnd(-1, 1) * spread; d.normalize();
      if (a === this.player && D.scope) { this.launchBullet(a, origin, d, D, mult, W, muzzle, scopedShot); continue; }
      const hw = this.world.ray(origin, d, D.range); const ha = this.rayActors(origin, d, hw ? hw.t : D.range, a);
      let end;
      if (ha) {
        end = origin.clone().addScaledVector(d, ha.t);
        const falloff = ha.t > D.range * 0.5 ? lerp(1, 0.6, (ha.t - D.range * 0.5) / (D.range * 0.5)) : 1;
        this.damage(ha.a, D.dmg * mult * falloff * (ha.head ? D.hs : 1), a, { head: ha.head, weapon: W.id });
        this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh');
      } else if (hw) {
        end = origin.clone().addScaledVector(d, hw.t);
        this.hitWorld(a, hw, d, end, D, mult);
      } else end = origin.clone().addScaledVector(d, D.range);
      if (a !== this.player && ha?.a !== this.player) this.fb.bullet(origin, d, ha ? ha.t : hw ? hw.t : D.range, a);
      if (p < 3 || a === this.player) this.fx.tracer(muzzle, end);
    }
    // les bots entendent les coups de feu
    for (const b of this.actors) if (b.bot && b.alive && b.team !== a.team && !b.ai.target && b.pos.distanceToSquared(a.pos) < 900) { b.ai.target = a; b.ai.seeT = 0.5; }
    return true;
  }
  hitWorld(a, hw, d, end, D, mult) {
        const brk = D.dmg * mult * D.veh * (a.perk?.casse || 1); // armes lourdes et atout « casse » : vitrines, barricades, voitures, mobilier
        const c = hw.c; let kind = 'world';
        if (c?.vit) { kind = this.hitVitrine(c.vit, brk, a) ? 'glass' : 'metal'; }
        else if (c?.wall) { kind = TIERS[c.wall.tier].imp[c.wall.team]; this.hitWall(c.wall, brk, a); }
        else if (c?.car) { this.hitCar(c.car, brk * 0.6, a); kind = 'metal'; }
        else if (c?.cassable && this.world.cass) { const e = this.world.cass.byId.get(c.cassable); if (e) this.world.cass.damage(e, brk, d, a); kind = /lampadaire|feu|dab|parcmetre|vauban|potelet|panneau|distributeur|scooter/.test(c.tag || '') ? 'metal' : /abribus|kiosque|colonne_verre/.test(c.tag || '') ? 'glass' : 'world'; }
        else if (c && (c.tag === 'voiture' || c.tag === 'lampadaire' || c.tag === 'fourgon')) kind = 'metal';
    if (a === this.player || end.distanceTo(this.player.pos) < 40) this.fx.impact(end, hw.n, kind);
  }
  setUpper(a) { const s = a.ch.actions.Idle_Gun_Shoot; }
  startReload(a) { const W = this.weapon(a); if (a.reloadT > 0 || W.mag >= WEAPONS[W.id].mag) return; a.burstLeft = 0; a.reloadT = WEAPONS[W.id].reload * (a.perk?.reload || 1); a.relAuth = Anim.reload(this, a, a.reloadT); if (!a.relAuth) this.overlay(a, 'U_Reload', a.reloadT, { busy: true }); if (!a.bot) this.audio.reload(); }

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
    if (by?.team === 'civils') this.scoreEvent('civils', 4, 'Saccage', by);
    if (by === this.player) { this.stats.broken++; this.toast(`💥 Vitrine cassée · ${s.enseigne}`, '#fff'); this.cam.trauma = Math.min(1, this.cam.trauma + 0.3); this.input.rumble(0.8, 0.8, 200); }
    // alerte : la Brigade est prévenue
    for (const b of this.actors) if (b.bot && b.alive && b.team === 'ordre' && b.pos.distanceTo(v.front) < 80 && Math.random() < 0.45) { b.ai.task = { kind: 'alarm', shop: s }; b.ai.path = null; b.ai.think = 0; }
    if (this.save.team === 'ordre' && by !== this.player) this.toast(`🚨 Casse en cours : ${s.enseigne}`, '#ff4a4a');
  }
  nearestVitrine(a, r) { let best = null, bd = r; for (const s of this.shops) for (const v of s.vits) { if (v.broken) continue; const d = Math.hypot(v.front.x - a.pos.x, v.front.z - a.pos.z); if (d < bd) { bd = d; best = v; } } return best; }
  nearestShopItem(a, r) { let best = null, bd = r; for (const s of this.shops) { if (!s.broken && s.vits.length) continue; for (const it of s.items) { if (it.taken) continue; const d = Math.hypot(it.pos.x - a.pos.x, it.pos.z - a.pos.z) + Math.abs(it.pos.y - a.pos.y - 1) * 0.3; if (d < bd) { bd = d; best = { s, it }; } } } return best; }
  takeShopItem(a, s, it) { if (it.taken) return; const item = { type: it.type, rarity: it.rarity, nom: it.nom, valeur: it.valeur, poids: it.poids, icon: it.icon, node: it.node }; if (this.bagAdd(a, item)) { it.taken = true; if (it.node) it.node.visible = false; } }

  // ---------------------------------------------------------------- butin
  bagAdd(a, item) {
    if (a.bag.length >= 1) { if (a === this.player && this.time - (this._fullT || -9) > 1.5) { this._fullT = this.time; this.toast('Tu portes déjà un objet : dépose-le à ta base ou revends-le', '#ff8080'); } return false; }
    a.bag.push(item); a.bagKg += item.poids; this.carryMesh(a);
    if (a === this.player) { this.toast(`${item.icon} ${item.nom} · ${fmt(item.valeur)} €`, RARITY[item.rarity].color); this.audio.rarity(item.rarity); if (item.rarity === 'legendaire') this.announce('LÉGENDAIRE !', item.nom, RARITY.legendaire.color, 2); }
    return true;
  }
  // un seul objet porté à la fois, bien visible au-dessus de la tête (on sait qui transporte du butin)
  carryMesh(a) {
    if (a.carry) { a.ch.root.remove(a.carry); a.carry = null; } const it = a.bag[0]; if (!it) return;
    const g = new THREE.Group(); const m = lootMesh(it.type, it.rarity); m.scale.setScalar(it.type === 'tv' || it.type === 'art' ? 0.55 : 1.2); g.add(m); const b = beam(it.rarity); b.scale.setScalar(0.7); g.add(b);
    g.position.y = 2.15; a.ch.root.add(g); a.carry = g;
  }
  bagValue(a) { return a.bag.reduce((s, i) => s + i.valeur, 0); }
  dropPile(pos, items, weapon = null) {
    if (!items.length && !weapon) return;
    const g = new THREE.Group(); const p = pos.clone(); p.y = this.world.groundY(p.x, p.z, p.y + 0.3); g.position.copy(p);
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
    if (item.node) { m = new THREE.Group(); const c = item.node.clone(true); c.traverse((o) => { o.visible = true; }); /* (au loin, les objets des vitrines sont masqués) */ const box = new THREE.Box3().setFromObject(c); const ctr = box.getCenter(V()); c.position.sub(V(ctr.x, box.min.y, ctr.z)); const sz = box.getSize(V()); const k = Math.min(1.8, 0.7 / Math.max(sz.x, sz.y, sz.z, 0.05)); c.scale.multiplyScalar(k); c.position.multiplyScalar(k); m.add(c); }
    else { m = lootMesh(item.type, item.rarity); m.scale.setScalar(item.type === 'tv' || item.type === 'art' ? 0.7 : 1.6); }
    m.position.set(0, 0.55, 0); s.mesh.add(m); s.itemMesh = m;
    const b = beam(item.rarity); b.scale.setScalar(0.6); b.position.y = 1.1; m.add(b);
  }
  takeFromSocle(s) { const it = s.item; s.item = null; s.owner = null; if (s.itemMesh) s.mesh.remove(s.itemMesh); s.itemMesh = null; return it; }
  deposit(a) {
    let n = 0; const free = this.socles[a.team].filter((s) => !s.item);
    // on expose d'abord les objets les plus chers
    a.bag.sort((x, y) => y.valeur - x.valeur);
    while (a.bag.length && free.length) { const it = a.bag.shift(); a.bagKg -= it.poids; const pts = LOOT_PTS[it.rarity] || 2; this.scoreEvent(a.team, pts, a.team === 'ordre' ? 'Butin saisi' : 'Butin planqué', a); it.stolen = false; this.placeOnSocle(free.shift(), it, a); n++; } this.carryMesh(a);
    if (a === this.player && n) { this.toast(`🏛️ ${n} objet${n > 1 ? 's' : ''} exposé${n > 1 ? 's' : ''} : ils rapportent chaque seconde`, '#9ff59f'); this.audio.cash(true); this.fx.ring(a.pos, '#9ff59f'); }
    if (a === this.player && a.bag.length && !free.length) this.toast('Planque pleine : revends le reste au receleur 💰', '#ffcc3d');
    // si la planque est pleine, on remplace le moins cher par plus cher
    return n;
  }
  sell(a) {
    if (!a.bag.length) return;
    const k = a.team === 'ordre' ? 0.6 : 1; const total = a.bag.reduce((t, i) => t + this.recelPrice(i), 0) * k; const n = a.bag.length;
    a.bag = []; a.bagKg = 0; this.carryMesh(a);
    if (a === this.player) { this.earn(total, `${n} objet${n > 1 ? 's' : ''} revendu${n > 1 ? 's' : ''} au receleur`, true); this.fx.ring(a.pos, '#ffcc3d'); } else a.cash += total;
  }

  // ---------------------------------------------------------------- barricades
  // barricades : 3 charges, une revient toutes les 15 s ; au plus 3 posées par joueur (la plus ancienne disparaît)
  wallDelay(a) { return a.bot ? 15 : 15 - 3 * (this.save.upgrades.mats || 0); }
  wallRecharge(a, dt) { if (a.walls == null) a.walls = 3; if (a.walls >= 3) { a.wallT = 0; return; } a.wallT = (a.wallT || this.wallDelay(a)) - dt; if (a.wallT <= 0) { a.walls++; a.wallT = a.walls < 3 ? this.wallDelay(a) : 0; if (a === this.player) this.toast('🧱 Barricade prête', '#9ff59f'); } }
  // la grille de déplacement des bots suit les barricades ; ceux dont le trajet passe par là recalculent
  wallNav(p) { this.world.refreshNav(p.x - 3.5, p.z - 3.5, p.x + 3.5, p.z + 3.5); for (const b of this.actors) if (b.bot && b.ai.path && b.pos.distanceTo(p) < 60) b.ai.checkT = 0; }

  // ---------------------------------------------------------------- grenades (lacrymo / fumigène)
  throwNade(a, dir) {
    if (!a.alive || a.inCar) return; const kind = a.frags > 0 && (a.nades <= 0 || Math.random() < 0.35) ? 'frag' : 'team'; if (kind === 'team' && a.nades <= 0) return;
    const v = dir.clone().multiplyScalar(15); v.y += 4; this.castThrow(a, kind === 'frag' ? 'frag' : a.team === 'ordre' ? 'gas' : 'smoke', v);
  }
  launchBullet(a, origin, d, D, mult, W, muzzle, scoped) {
    const b = { p: origin.clone(), v: d.clone().multiplyScalar(BULLET_V), a, D, mult, W, t: 0, dist: 0, from: a.pos.clone() };
    const m = new THREE.Mesh(BULLET_GEO, BULLET_MAT); m.position.copy(b.p); m.lookAt(b.p.clone().add(d)); this.root.add(m); b.m = m;
    (this.bullets ||= []).push(b); this.fx.tracer(muzzle, origin.clone().addScaledVector(d, 6));
    // caméra balle dans la bulle : seulement pour un tir lointain à la lunette
    const far = this.aimPt ? this.aimPt.distanceTo(origin) : 0;
    if (scoped && far > 45 && this.save.settings?.killcam !== false) this.startPip({ mode: 'bullet', bullet: b, dur: Math.min(2.6, far / BULLET_V + 1.1), label: 'CAM BALLE', title: `TIR À ${Math.round(far)} m`, sub: 'calibre .338 · ' + Math.round(BULLET_V) + ' m/s' });
  }
  updateBullets(dt) {
    const L = this.bullets; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i]; b.t += dt; const p0 = b.p.clone(); b.v.y -= 9.8 * dt; const np = b.p.clone().addScaledVector(b.v, dt);
      const seg = np.clone().sub(p0); const len = seg.length(); const d = seg.divideScalar(len);
      const hw = this.world.ray(p0, d, len); const ha = this.rayActors(p0, d, hw ? hw.t : len, b.a); let end = null;
      if (ha) { end = p0.clone().addScaledVector(d, ha.t); const dist = end.distanceTo(b.from);
        this.damage(ha.a, b.D.dmg * b.mult * (ha.head ? 2.2 : 1) * (dist > 120 ? 1.1 : 1), b.a, { head: ha.head, weapon: b.W.id, dist, sniper: true });
        this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh'); this.fx.burst(end, 10, { color: '#b3122a', speed: 4, size: 0.05, life: 0.5 }); }
      else if (hw) { end = p0.clone().addScaledVector(d, hw.t); this.hitWorld(b.a, hw, d, end, b.D, b.mult); }
      this.fx.tracer(p0, end || np); b.p.copy(end || np); b.dist += len; b.m.position.copy(b.p); b.m.lookAt(b.p.clone().add(d));
      // balle qui frôle un ennemi : sifflement
      if (end || b.dist > 340 || b.t > 2) { this.root.remove(b.m); L.splice(i, 1); b.done = true; const K = this.killcam; if (K?.bullet === b) { K.hitPt = (end || np).clone(); if (!K.keep) K.dur = Math.min(K.dur, K.t + 0.55); } }
    }
  }
  updateNades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt; g.vel.y -= GRAV * dt;
      const np = g.pos.clone().addScaledVector(g.vel, dt);
      const d = np.clone().sub(g.pos); const L = d.length(); if (L > 0) { const h = this.world.ray(g.pos, d.clone().divideScalar(L), L); if (h) { const n = V(...h.n); g.vel.reflect(n).multiplyScalar(0.4); np.copy(g.pos).addScaledVector(d.divideScalar(L), h.t * 0.9); } }
      g.pos.copy(np); g.m.position.copy(np); g.m.rotation.x += dt * 10;
      if (g.t > 1.6) { this.root.remove(g.m); this.grenades.splice(i, 1); const p = g.pos.clone(); p.y = this.world.groundY(p.x, p.z, p.y + 0.3); this.fx.cloud(p, g.kind, g.owner); this.audio.play('thud', p, 0.8); this.fx.burst(p.clone().add(V(0, 0.3, 0)), 8, { color: g.kind === 'gas' ? '#e8e6cf' : '#ff4fa0', speed: 3, size: 0.1, life: 0.6 }); }
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
  // voitures du pack garées sur les places de la map (gameplay.json : parkings) ; fourgons de la base = police, voitures renversées des barricades = décor
  buildCars() {
    const defs = this.opts.cars || []; if (!defs.length) return;
    const by = (cls) => defs.filter((d) => d.classe === cls); const pools = { sport: by('sport'), civil: by('civil'), police: by('police'), blinde: by('blinde') };
    const take = (cls, k) => { const p = pools[cls].length ? pools[cls] : defs; return p[k % p.length]; };
    const spots = this.world.gp.parkings || []; let k = 0;
    for (const s of spots) {
      let cls;
      if (s.role === 'base' || (s.camp === 'ordre' && !s.renversee)) cls = 'police';
      else if (s.renversee) cls = 'civil';
      else if (s.gabarit === 'utilitaire' || s.gabarit === 'fourgon') cls = k % 5 === 0 ? 'blinde' : 'civil';
      else cls = Math.abs(s.x) > 95 && k % 2 ? (s.x < 0 ? 'police' : 'sport') : k % 6 === 5 ? 'civil' : 'sport';
      const c = this.addCar(take(cls, k++), s.x, s.z, s.yaw);
      if (s.renversee) { c.flipped = true; c.pos.y = (s.y ?? c.pos.y) + c.H; c.rollV = Math.PI; this.syncCar(c); c.col.y0 = s.y ?? 0; }
    }
  }
  clearSpot(x, z, r) {
    const W = this.world; const ok = (px, pz) => { for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) if (!W.free(...W.cell(px + dx, pz + dz))) return false; return !this.cars.some((c) => Math.hypot(c.pos.x - px, c.pos.z - pz) < 6); };
    for (let rad = 0; rad < 10; rad += 1) for (let k = 0; k < Math.max(1, rad * 6); k++) { const a = k / Math.max(1, rad * 6) * Math.PI * 2; const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad; if (ok(px, pz)) return [px, pz]; }
    return null;
  }
  bodySize(def) {
    const xs = [], zs = [], v = V(); let ymax = 0; def.scene.updateMatrixWorld(true);
    def.scene.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); xs.push(v.x); zs.push(v.z); ymax = Math.max(ymax, v.y); } });
    if (xs.length < 20) return def.size; xs.sort((a, b) => a - b); zs.sort((a, b) => a - b); const q = (a, t) => a[Math.floor(t * (a.length - 1))];
    return [Math.min(def.size[0], q(xs, 0.985) - q(xs, 0.015)), def.size[1], Math.min(def.size[2], q(zs, 0.995) - q(zs, 0.005))];
  }
  // modèle de voiture fusionné une fois par modèle : toutes les pièces (caisse et roues) regroupées par matière
  staticCar(def) {
    if (def.stat !== undefined) return def.stat; def.stat = null;
    try {
      const root = def.scene; root.updateMatrixWorld(true); const inv = root.matrixWorld.clone().invert(); const by = new Map();
      root.traverse((o) => { if (!o.isMesh || Array.isArray(o.material) || o.isSkinnedMesh) return; const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(g); });
      const grp = new THREE.Group(); grp.name = 'voiture_fusionnee';
      for (const [mat, list] of by) {
        const keys = Object.keys(list[0].attributes).filter((k) => list.every((g) => g.attributes[k] && g.attributes[k].itemSize === list[0].attributes[k].itemSize));
        for (const g of list) {
          for (const k of Object.keys(g.attributes)) if (!keys.includes(k)) g.deleteAttribute(k); for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
          // attributs quantifiés ou entrelacés (compression du glb) : remis en flottants simples, sinon la fusion échoue
          for (const k of keys) { const A = g.attributes[k]; if (A.isInterleavedBufferAttribute || A.normalized || !(A.array instanceof Float32Array)) { const n = A.count, z = A.itemSize, f = new Float32Array(n * z), get = ['getX', 'getY', 'getZ', 'getW']; for (let i = 0; i < n; i++) for (let j = 0; j < z; j++) f[i * z + j] = A[get[j]](i); g.setAttribute(k, new THREE.BufferAttribute(f, z)); } }
        }
        const idx = list.some((g) => g.index); const L = idx ? list.map((g) => g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()])) : list;
        const m = mergeGeometries(L, false); if (!m) return null; grp.add(new THREE.Mesh(m, mat));
      }
      def.stat = grp;
    } catch (e) { console.warn('fusion voiture', e); }
    return def.stat;
  }
  // version garée (fusionnée) accrochée au véhicule ; la version détaillée reste là, cachée, pour rouler
  attachStatic(c) {
    const st = this.staticCar(c.def); c.detail = [...c.obj.children]; c.mv = false; if (!st) return;
    c.stat = st.clone(); c.stat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); c.obj.add(c.stat); for (const o of c.detail) o.visible = false;
  }
  addCar(def, x, z, yaw) {
    const obj = def.scene.clone(true); obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(obj);
    const size = def.body || (def.body = this.bodySize(def)); const wheels = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].map((n) => obj.getObjectByName(n) || obj.getObjectByName(n.replace(/-/g, '_')));
    const car = { def, obj, wheels, pos: V(x, this.world.groundY(x, z), z), yaw, speed: 0, steer: 0, hp: def.classe === 'blinde' ? 600 : 320, maxHp: def.classe === 'blinde' ? 600 : 320, driver: null, spawn: [x, z, yaw], dead: 0, W: size[0], L: size[2], H: size[1], max: { sport: 34, blinde: 26, police: 30, civil: 24 }[def.classe] || 26, accel: { sport: 15, blinde: 10, police: 13, civil: 9 }[def.classe] || 11, police: def.classe === 'police' };
    car.col = { type: 'box', x, z, hx: car.W / 2, hz: car.L / 2, h: car.H, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw), y0: car.pos.y, car };
    this.world.dynamic.push(car.col); this.attachStatic(car); this.cars.push(car); this.syncCar(car); return car;
  }
  // ---------------------------------------------------------------- mobilier cassable et métro
  onCassable(e, by) {
    if (!by) return; const civ = by.team === 'civils';
    by.stats.sac++;
    // vandalisme : rapporte aux Frungz (points d'équipe et argent), rien à la Brigade
    if (civ) { const pts = Math.max(1, Math.round(e.points / 40)); this.scoreEvent('civils', pts, 'Vandalisme', by); }
    if (by === this.player) { this.stats.broken++; if (civ) this.earn(e.points, `${e.type.replace('_', ' ')} cassé`); this.cam.trauma = Math.min(1, this.cam.trauma + 0.15); this.input.rumble(0.4, 0.5, 90); }
    // DAB, parcmètres, bouquinistes, distributeurs : le butin tombe par terre
    if (e.butin) { const b = e.butin, L = LOOT[b.type]; const it = { type: b.type, rarity: b.valeur >= 2000 ? 'epique' : b.valeur >= 600 ? 'rare' : 'commun', nom: L?.names?.[0] || ({ billets: 'Liasse de billets', monnaie: 'Monnaie du distributeur', pieces: 'Caisse du parcmètre', livre_ancien: 'Livre ancien' }[b.type] || 'Butin'), valeur: b.valeur, poids: L?.kg ?? 0.5, icon: L?.icon || ({ billets: '💶', monnaie: '🪙', pieces: '🪙', livre_ancien: '📚' }[b.type] || '📦') };
      this.dropPile(e.pos.clone().add(V(0, 0.1, 0)), [it]); if (by === this.player) this.toast(`${it.icon} ${it.nom} · ${fmt(it.valeur)} € par terre`, '#ffcc3d'); }
  }
  updateMetro(dt) {
    const M = this.world.metro; if (!M) return; this.world.dynFloors = M.floors;
    // passagers : repérés dans le repère de leur voiture avant le déplacement
    const riders = [];
    for (const a of this.actors) { if (!a.alive || a.inCar || a.pos.y > -6) continue;
      for (const c of M.cars) { if (c.x == null) continue; const dx = a.pos.x - c.x, dz = a.pos.z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) < M.halfIn + 0.15 && Math.abs(lz) < c.L / 2 + 0.6 && Math.abs(a.pos.y - (c.y + M.floor)) < 0.7) { riders.push({ a, c, lx, lz, ly: a.pos.y - c.y, yaw: c.yaw }); break; } } }
    M.update(this.time, dt, this.camera.position);
    for (const r of riders) { const c = r.c, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), dyaw = c.yaw - r.yaw;
      r.a.pos.set(c.x + r.lx * cs + r.lz * sn, c.y + r.ly, c.z - r.lx * sn + r.lz * cs); if (dyaw) { r.a.yaw += dyaw; if (r.a === this.player) this.cam.yaw += dyaw; } r.a.onMetro = true; }
    if (Math.abs(M.v) < 2) return;
    // une rame lancée tue ce qu'elle percute sur la voie (pas les passagers)
    for (const a of this.actors) { if (!a.alive || a.inCar || a.pos.y > -6.5 || riders.some((r) => r.a === a)) continue;
      for (const c of M.cars) { const dx = a.pos.x - c.x, dz = a.pos.z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) < c.W / 2 + 0.45 && Math.abs(lz) < c.L / 2 + 0.6 && a.pos.y < c.y + M.floor - 0.4) { this.damage(a, 999, null, { weapon: 'metro' }); if (a === this.player) this.announce('', 'Percuté par le métro', '#ff4a4a', 2); break; } } }
  }
  syncCar(c) {
    c.obj.position.copy(c.pos); c.obj.rotation.set(c.pitchV || 0, c.yaw, c.rollV || 0, 'YXZ');
    Object.assign(c.col, { x: c.pos.x, z: c.pos.z, yaw: c.yaw, cs: Math.cos(c.yaw), sn: Math.sin(c.yaw), y0: c.pos.y });
  }
  nearestCar(a, r = 3.2) { let best = null, bd = r; for (const c of this.cars) { if (c.dead || c.driver || c.flipped) continue; const d = c.pos.distanceTo(a.pos); if (d < bd) { bd = d; best = c; } } return best; }
  enterCar(a, c) {
    if (c.kind === 'heli') return this.heliEnter(a, c); // mini-hélico (helico.js)
    if (c.kind) return this.rideEnter(a, c); // moto, skate (deuxroues.js)
    c.driver = a; a.inCar = c; a.ch.root.visible = false; a.vel.set(0, 0, 0);
    if (a === this.player) { this.announce('', c.def.nom || 'Voiture volée', '#fff', 1.5); this.audio.play('slam', c.pos, 0.6); this.cam.carYaw = c.yaw; }
  }
  exitCar(a, dead) {
    const c = a.inCar; if (!c) return; if (c.kind === 'heli') return this.heliExit(a, c, dead); if (c.kind) return this.rideExit(a, c, dead); c.driver = null; a.inCar = null; a.ch.root.visible = true;
    const side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)); const p = c.pos.clone().addScaledVector(side, c.W / 2 + 0.7);
    a.pos.copy(p); this.world.pushOut(a.pos, 0.35, a.pos.y); a.pos.y = this.world.groundY(a.pos.x, a.pos.z, c.pos.y + 0.5); a.yaw = c.yaw;
    if (a === this.player) { this.audio.engine(false); this.audio.play('slam', c.pos, 0.6); this.cam.yaw = c.yaw; }
  }
  hitCar(c, dmg, by) {
    if (c.dead) return; c.hp -= dmg; if (c.driver && Math.random() < 0.25) this.damage(c.driver, dmg * 0.4, by);
    if (c.hp <= 0) this.explodeCar(c, by);
  }
  explodeCar(c, by) {
    c.dead = 40; const p = c.pos.clone().add(V(0, 0.8, 0)); this.fx.explosion(p); this.audio.explode(p); this.blast(p, 7, 500, by);
    if (c.driver) { const d = c.driver; this.exitCar(d, true); this.damage(d, 200, by); }
    for (const a of this.actors) { if (!a.alive) continue; const d = a.pos.distanceTo(c.pos); if (d < 7) this.damage(a, 110 * (1 - d / 7), by, { blast: true }); }
    if (this.player.pos.distanceTo(c.pos) < 30) this.cam.trauma = 1;
    c.obj.visible = false; const j = this.world.dynamic.indexOf(c.col); if (j >= 0) this.world.dynamic.splice(j, 1);
  }
  updateCar(c, dt) {
    if (c.kind === 'heli') return this.updateHeli(c, dt);
    if (c.kind) return this.updateRide(c, dt);
    if (c.dead) { c.dead -= dt; if (c.dead <= 0) { c.dead = 0; c.sunk = false; c.fallV = 0; [c.pos.x, c.pos.z, c.yaw] = c.spawn; c.pos.y = this.world.groundY(c.pos.x, c.pos.z); c.hp = c.maxHp; c.speed = 0; c.vel = null; c.obj.visible = true; this.world.dynamic.push(c.col); this.syncCar(c); } return; }
    const drv = c.driver;
    if (c.flipped || (!drv && !c.fallV && Math.abs(c.speed) < 0.05 && !(c.vel && c.vel.lengthSq() > 0.01))) { c.speed = 0; return; }
    let thr = 0, brk = 0, st = 0, hand = false;
    if (drv === this.player && !this.paused) {
      const I = this.input; const m = I.move();
      thr = Math.max(-m.y, I.st.triggerR); brk = Math.max(m.y > 0 ? m.y : 0, I.st.triggerL); st = -m.x; hand = I.down('jump');
      if (I.pressed('horn')) this.audio.horn();
    }
    // modèle arcade : vitesse dans le monde, décomposée en avant / côté ; l'adhérence latérale ramène la voiture dans l'axe
    // (forte sur route, faible au frein à main : dérive contrôlable), direction plus douce et moins braquée à haute vitesse
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    if (!c.vel) c.vel = f.clone().multiplyScalar(c.speed);
    let vf = c.vel.dot(f), vs = c.vel.dot(side);
    if (thr > 0) vf += thr * c.accel * dt * (vf < 0 ? 2.5 : 1) * (1 - 0.35 * Math.max(0, vf / c.max));
    if (brk > 0) vf -= brk * (vf > 0.5 ? 24 : 9) * dt;
    vf -= vf * (hand ? 0.9 : 0.25) * dt; if (!thr && !brk) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.5 * dt);
    vf = clamp(vf, -10, c.max);
    const maxSt = 0.58 - 0.36 * Math.min(1, Math.abs(vf) / c.max);
    c.steer = lerp(c.steer, st * maxSt, 1 - Math.exp(-dt * (Math.abs(st) > Math.abs(c.steer / maxSt) ? 5 : 7)));
    const wb = c.L * 0.62; const yawRate = vf / wb * Math.tan(c.steer) * (hand ? 1.55 : 1);
    const grip = hand ? 1.6 : Math.abs(vs) > 5 ? 4.5 : 9; vs *= Math.exp(-grip * dt);
    c.slipV = vs; c.vel.copy(f).multiplyScalar(vf).addScaledVector(side, vs);
    c.yaw += yawRate * dt; c.speed = vf;
    c.pos.addScaledVector(c.vel, dt);
    // la voiture fauche le mobilier cassable (le plus solide l'arrête si elle va trop lentement)
    const fwd = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)); let bump = 0; const n = V();
    if (this.world.cass && Math.abs(c.speed) > 3) for (const col of this.world.near(c.pos.x, c.pos.z, c.L / 2 + 1.5)) {
      if (!col.cassable || col.off) continue; const dx = col.x - c.pos.x, dz = col.z - c.pos.z; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      const rr = col.type === 'box' ? Math.min(col.hx, col.hz) : col.r || 0.3; if (Math.abs(lx) > c.W / 2 + rr + 0.2 || Math.abs(lz) > c.L / 2 + rr + 0.3) continue;
      const e = this.world.cass.byId.get(col.cassable); if (!e) continue; const imp = Math.abs(c.speed) * 28;
      if (imp >= e.pv) { this.world.cass.breakIt(e, c.vel || fwd, drv); c.vel?.multiplyScalar(e.max > 150 ? 0.8 : 0.94); c.speed *= e.max > 150 ? 0.8 : 0.94; if (drv === this.player) { this.cam.trauma = Math.min(1, this.cam.trauma + (e.max > 150 ? 0.35 : 0.12)); this.input.rumble(0.5, 0.6, 120); } }
      else this.world.cass.damage(e, imp * 0.5, c.vel || fwd, drv);
    }
    const r = c.W * 0.46, reach = Math.max(0, c.L / 2 - r);
    for (const k of [-1, -0.5, 0, 0.5, 1]) {
      const q = c.pos.clone().addScaledVector(fwd, k * reach); const q0 = q.clone();
      this.world.pushOut(q, r, c.pos.y + 0.2, c.col); const dx = q.x - q0.x, dz = q.z - q0.z;
      if (dx || dz) { c.pos.x += dx; c.pos.z += dz; const L = Math.hypot(dx, dz); n.x += dx; n.z += dz; bump = Math.max(bump, L); }
    }
    if (bump > 0.01) { n.normalize(); const into = c.vel.dot(n); if (into < 0) { c.vel.addScaledVector(n, -into * 1.35); c.speed = c.vel.dot(fwd); } }
    if (bump > 0.02 && Math.abs(c.speed) > 3) {
      const imp = Math.abs(c.speed); if (imp > 9) { this.hitCar(c, imp * 2.2, null); this.audio.play('slam', c.pos, Math.min(1.2, imp / 20)); this.fx.burst(c.pos.clone().addScaledVector(fwd, c.L / 2 * Math.sign(c.speed)).add(V(0, 0.6, 0)), 8, { color: '#ffd27a', speed: 5, size: 0.03, emissive: true, life: 0.3 }); if (drv === this.player) { this.cam.trauma = Math.min(1, this.cam.trauma + imp / 30); this.input.rumble(1, 1, 200); } }
      c.vel.multiplyScalar(0.7); c.speed = c.vel.dot(fwd);
    }
    // écrasement des piétons
    if (Math.abs(c.speed) > 4) for (const a of this.actors) {
      if (!a.alive || a.inCar || (drv && a.team === drv.team)) continue;
      const dx = a.pos.x - c.pos.x, dz = a.pos.z - c.pos.z; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw);
      if (Math.abs(lx) < c.W / 2 + 0.35 && Math.abs(lz) < c.L / 2 + 0.35) { this.damage(a, Math.abs(c.speed) * 5, drv, { blast: true }); a.vel.addScaledVector(fwd, c.speed * 0.8); a.vel.y = 4; a.onGround = false; c.vel.multiplyScalar(0.85); this.audio.play('thud', a.pos, 1); }
    }
    const cgy = this.world.groundY(c.pos.x, c.pos.z, c.pos.y + 0.6);
    // chute (quai, trémie) : gravité au lieu de coller au sol
    if (cgy < c.pos.y - 0.8) { c.fallV = (c.fallV || 0) + GRAV * dt; c.pos.y = Math.max(cgy, c.pos.y - c.fallV * dt); } else { c.fallV = 0; c.pos.y = lerp(c.pos.y, cgy, 1 - Math.exp(-dt * 12)); }
    // dans la Seine : la voiture coule
    const Wt = this.world.water; if (Wt && c.pos.y < Wt.y && this.world.inWater(c.pos.x, c.pos.z) && !c.sunk) { c.sunk = true; this.fx.burst(V(c.pos.x, Wt.y + 0.2, c.pos.z), 30, { color: '#cfe3ef', speed: 6, size: 0.12, life: 1 }); if (drv) this.exitCar(drv); c.dead = 40; c.obj.visible = false; const j = this.world.dynamic.indexOf(c.col); if (j >= 0) this.world.dynamic.splice(j, 1); this.audio.play('thud', c.pos, 1); return; }
    c.rollV = lerp(c.rollV || 0, -yawRate * c.speed * 0.006, 1 - Math.exp(-dt * 6)); c.pitchV = lerp(c.pitchV || 0, (thr - brk) * -0.02, 1 - Math.exp(-dt * 5));
    for (let i = 0; i < 4; i++) { const w = c.wheels[i]; if (!w) continue; w.rotation.x += c.speed * dt / 0.3; if (i < 2) w.rotation.y = c.steer; }
    this.syncCar(c);
    if (drv) { drv.pos.copy(c.pos); drv.yaw = c.yaw; }
    this.carFx(c, dt, thr, brk, hand);
    // fumée quand la voiture est abîmée
    if (c.hp < c.maxHp * 0.3 && Math.random() < dt * 8) this.fx.burst(c.pos.clone().addScaledVector(fwd, c.L * 0.4).add(V(0, c.H, 0)), 1, { color: '#333', speed: 1, size: 0.3, life: 1.2, grav: -2 });
    if (drv === this.player) { this.audio.engine(true, Math.abs(c.speed) / c.max, c.pos); }
  }

  // effets de conduite : pot d'échappement, traces de pneus et fumée quand ça glisse, traînées rouges des feux à pleine vitesse
  carFx(c, dt, thr, brk, hand) {
    const f = V(Math.sin(c.yaw), 0, Math.cos(c.yaw)), side = V(Math.cos(c.yaw), 0, -Math.sin(c.yaw)), sp = Math.abs(c.speed);
    const near = c.pos.distanceToSquared(this.camera.position) < 90 * 90; if (!near) return;
    const back = c.pos.clone().addScaledVector(f, -c.L / 2 + 0.05); back.y += 0.32;
    if (c.driver && Math.random() < dt * (6 + thr * 22)) this.fx.burst(back.clone().addScaledVector(side, -c.W * 0.25).addScaledVector(f, -0.1), 1, { color: thr > 0.5 ? '#6d6d6d' : '#9a9a9a', speed: 0.6 + thr * 0.8, size: 0.12 + thr * 0.1, life: 0.7, grav: -1.2, opacity: 0.5, normal: f.clone().negate(), spread: 0.8 });
    const skid = Math.abs(c.slipV || 0) > 2.2 || (brk > 0.6 && sp > 8) || (hand && sp > 5) || (thr > 0.8 && sp < 4 && sp > 0.5);
    if (skid) {
      for (const sx of [-1, 1]) { const w = c.pos.clone().addScaledVector(f, -c.L * 0.32).addScaledVector(side, sx * c.W * 0.4); w.y = this.world.groundY(w.x, w.z, c.pos.y + 0.5) + 0.02; this.skidMark(c, sx, w); }
      if (Math.random() < dt * 14) this.fx.burst(back.clone().addScaledVector(side, (Math.random() - 0.5) * c.W), 1, { color: '#d8d8d8', speed: 1.2, size: 0.35, life: 0.9, grav: -0.8, opacity: 0.35 });
      if (c.driver === this.player && Math.random() < dt * 6) this.audio.play('cloth', c.pos, 0.25, [0.5, 0.6], 0.05);
    } else { c.skidPrev = null; }
    if (sp > 20) for (const sx of [-1, 1]) if (Math.random() < dt * 30) this.fx.burst(back.clone().addScaledVector(side, sx * c.W * 0.38).add(V(0, 0.25, 0)), 1, { color: '#ff2a2a', speed: 0.05, size: 0.06, life: 0.18, grav: 0, emissive: true, long: true });
  }
  // traces de pneus : segments posés au sol (anneau de 400 segments partagé par toutes les voitures)
  skidMark(c, sx, w) {
    if (!this.skids) { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const m = new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); this.skids = new THREE.InstancedMesh(g, m, 400); this.skids.count = 0; this.skids.frustumCulled = false; this.root.add(this.skids); this.skidI = 0; }
    c.skidPrev ||= {}; const prev = c.skidPrev[sx]; c.skidPrev[sx] = w.clone(); if (!prev) return;
    const d = w.distanceTo(prev); if (d < 0.05 || d > 3) return;
    const mid = prev.clone().add(w).multiplyScalar(0.5), M = new THREE.Matrix4();
    M.compose(mid, new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.atan2(w.x - prev.x, w.z - prev.z)), V(0.22, 1, d + 0.04));
    this.skids.setMatrixAt(this.skidI, M); this.skidI = (this.skidI + 1) % 400; this.skids.count = Math.max(this.skids.count, this.skidI || 400); this.skids.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- boucle
  // bg : en ligne, la partie continue derrière un menu (pause, armurerie) sans lire les commandes du joueur
  update(dt, bg = false) {
    if (this.paused && !bg) return;
    this.time += dt; if (!bg) this.input.poll(); this.pathBudget = 4;
    this.lodT = (this.lodT || 0) - dt; if (this.lodT <= 0) { this.lodT = 0.4; this.updateLod(); }
    if (!this.over && !bg) { this.updatePlayer(dt); }
    this.cullActors();
    for (const a of this.actors) if (a.bot && !a.puppet) this.updateBot(a, dt);
    for (const a of this.actors) if (a.puppet) this.updatePuppet(a, dt); else this.updateActor(a, dt);
    this.net?.tick(dt);
    for (const c of this.cars) this.updateCar(c, dt);
    this.updateHeliShots(dt);
    this.updateMetro(dt); this.world.cass?.update(dt); this.world.flushNav();
    // 51 voitures : on n'affiche que celles assez proches (et l'ombre seulement de près)
    if ((this.carCullT = (this.carCullT || 0) - dt) <= 0) { this.carCullT = 0.3; const cp = this.camera.position;
      for (const s of this.shops) { const near = s.front.distanceToSquared(cp) < 55 * 55; if (near !== s.near) { s.near = near; for (const m of s.itemMeshes) m.visible = near; } }
      for (const c of this.cars) { if (c.dead) continue; const d2 = c.obj.position.distanceToSquared(cp); c.obj.visible = d2 < 130 * 130 || !!c.driver;
        // voiture garée : un seul maillage par matière (≈ 6 dessins) ; détaillée (roues qui tournent) dès qu'elle roule
        if (c.stat) { const mv = !!c.driver || Math.abs(c.speed) > 0.05; if (c.mv !== mv) { c.mv = mv; c.stat.visible = !mv; for (const o of c.detail) o.visible = mv; } } const sh = d2 < 50 * 50; if (c.sh !== sh) { c.sh = sh; c.obj.traverse((o) => { if (o.isMesh) o.castShadow = sh; }); } } }
    this.updateBullets(dt); this.updateProjs(dt); this.updateScorch(dt); this.updatePip(dt); this.updateNades(dt); this.updateThrown(dt); this.updateStreaks(dt); this.cloudEffects(dt); this.updateZones(dt); this.updateShops(dt); this.updateDrops(dt); this.socleIncome(dt);
    this.updateWalls(dt);
    this.specialT -= dt; if (this.specialT <= 0) { this.specialT = 120; this.specialDelivery(); }
    if (!this.over && (this.time >= this.matchLen || this.score.ordre >= this.scoreLimit || this.score.civils >= this.scoreLimit)) this.endMatch();
    this.updateCamera(dt); this.fb.update(dt);
    for (const a of this.actors) if (a.flashT > 0) { a.flashT -= dt; if (a.flashT <= 0) a.ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') o.material.emissiveIntensity = 0; }); }
    this.drawCompass(dt); this.updateZoneHud();
    this.fx.update(dt);
    if (this.time > this.nextUi) { this.nextUi = this.time + 0.1; this.updateHud(); }
    this.mmT = (this.mmT || 0) - dt; if (this.mmT <= 0) { this.mmT = 1 / 20; this.drawMinimap(); } // minimap à 20 i/s
    if (!bg) this.input.endFrame();
  }

  // ---------------------------------------------------------------- joueur
  updatePlayer(dt) {
    const a = this.player, I = this.input, C = this.cam;
    // regard
    const sensM = 0.0032 * I.settings.sens * (this.aiming ? (WEAPONS[this.weapon(a)?.id]?.scope ? (this.sc?.zoom ? 0.15 : 0.3) : 0.6) : 1);
    let padK = 3.8 * I.settings.padSens * (this.aiming ? (WEAPONS[this.weapon(a)?.id]?.scope ? (this.sc?.zoom ? 0.2 : 0.35) : 0.55) : 1) * dt;
    // visée assistée manette : ralentit près d'une cible et la suit légèrement
    if (I.st.usingPad && I.settings.assist && a.alive && !a.inCar) {
      const t = this.assistTarget(); if (t) { padK *= 0.55; if (this.aiming || I.st.triggerR > 0.3) { C.yaw += t.dy * Math.min(1, dt * (this.aiming ? 5 : 2.5)); C.pitch += t.dp * Math.min(1, dt * (this.aiming ? 4 : 2)); } }
    }
    C.yaw -= I.st.mx * sensM + I.st.lookX * padK; C.pitch -= (I.st.my * sensM + I.st.lookY * padK) * (I.settings.invertY ? -1 : 1);
    C.pitch = clamp(C.pitch, -1.3, 1.25);
    const scopedNow = this.aiming && WEAPONS[this.weapon(a)?.id]?.scope;
    if (I.pressed('view') && !scopedNow) { C.fps = !C.fps; this.save.settings.fps = C.fps; this.persist(); this.viewGun(); }
    if (I.pressed('map')) $('minimap').classList.toggle('big');
    if (I.pressed('inv')) this.toggleInv();
    if (I.pressed('streak') && !this.thr?.spell && !a.inCar) { if (a.rewards.length) this.useStreak(a); else this.toast(`Série : ${a.streak} — prochain bonus à ${streakTiers(a.team, a.streak).find((r) => r.n > a.streak)?.n ?? '—'} éliminations`, '#ccc'); }
    if (I.pressed('pause')) { this.onPause?.(); return; }
    if (!a.alive) { a.respawnT -= dt; this.aiming = false; if (a.respawnT <= 0) this.respawn(a); return; }
    a.spawnProt = Math.max(0, (a.spawnProt || 0) - dt);
    if (a.inCar?.kind === 'heli') { this.heliPlayer(a, I, dt); return; }
    if (a.inCar) {
      if (I.pressed('car') || I.pressed('interact')) this.exitCar(a);
      this.aiming = false; return;
    }
    // armes
    if (I.pressed('w1')) this.equip(a, 0); if (I.pressed('w2')) this.equip(a, 1); if (I.pressed('w3')) this.equip(a, 2); if (I.pressed('w4')) this.equip(a, 3);
    if (I.pressed('next') && a.slots.length > 1) this.equip(a, (a.cur + 1) % a.slots.length);
    if (I.keys.has('WheelUp') || I.keys.has('WheelDown')) {}
    if (this.thr || I.pressed('grenade')) this.updateThrowAim(a, I, dt);
    if (I.pressed('reload') && !this.thr) this.startReload(a);
    this.aiming = !this.thr && (I.down('aim') || I.st.triggerL > 0.3) && !a.climb && a.rollT <= 0;
    this.updateScope(dt, I, a);
    const W = this.weapon(a), D = WEAPONS[W.id];
    const wantFire = (D.burst && a.burstLeft > 0) || (D.auto ? (I.down('fire') || I.st.triggerR > 0.4) : (I.pressed('fire') || (I.st.triggerR > 0.4 && !this._trigWas)));
    this._trigWas = I.st.triggerR > 0.4;
    if (wantFire && !this.thr && (this._thrJust = Math.max(0, (this._thrJust || 0) - dt)) <= 0 && a.slideT <= 0.5 && !a.climb && a.rollT <= 0 && !a.channel) {
      if (!I.st.locked && !I.st.usingPad) { this.renderer.domElement.requestPointerLock?.(); }
      else {
        const o = this.camera.position.clone(); const d = V(); this.camera.getWorldDirection(d);
        // on part de devant le joueur pour ne pas toucher ce qui est entre la caméra et lui
        const skip = C.fps ? 0 : Math.max(0, o.distanceTo(a.pos.clone().add(V(0, 1.5, 0))) - 0.3); o.addScaledVector(d, skip);
        if (this.fire(a, o, d)) { a.momentum *= 0.92; }
      }
    }
    if (I.pressed('build') && !this.thr) this.placeWall(a);
    if (I.pressed('shop') && !this.thr && this.atBase(a)) this.onShop?.();
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
      const R = car.kind === 'heli' ? this.heliPrompt(a, car) : car.kind ? this.ridePrompt(a, car) : null; const quick = R ? R.quick : car.police ? a.team === 'ordre' : false;
      prompt = `<b>${I.label('car')}</b> ${R ? R.text : quick ? 'Prendre la voiture de service' : 'Voler'} <span class="r">${car.kind === 'skate' || car.kind === 'heli' ? '' : car.def.nom || ''}</span>`;
      if ((I.pressed('car')) && !a.channel) { if (quick) this.enterCar(a, car); else this.startChannel(a, R?.label || 'Crochetage…', R?.dur || 0.9, () => car.pos.distanceTo(a.pos) < 4 && !car.driver, () => this.enterCar(a, car)); }
    }
    if (!prompt) {
      // objet de boutique à portée (vitrine cassée) ; sinon vitrine intacte à casser à la main
      const si = this.nearestShopItem(a, 1.7); const v = !si && this.nearestVitrine(a, 2.2);
      if (si) {
        const it = si.it; const full = a.bag.length >= 1;
        prompt = full ? `Tu portes déjà <span class="r">${a.bag[0].icon} ${a.bag[0].nom}</span> : ramène-le à ta base` : `<b>${I.label('interact')}</b> Prendre <span class="r" style="color:${RARITY[it.rarity].color}">${it.icon} ${it.nom}</span> · ${fmt(it.valeur)} € · ${it.poids} kg`;
        if (I.pressed('interact') && !full && !a.channel) this.startChannel(a, 'Ramassage…', 0.4, () => !it.taken, () => this.takeShopItem(a, si.s, it), 'Interact');
      } else if (v) { prompt = `<b>${I.label('interact')}</b> (maintenir) Casser la vitrine · ${v.shop.enseigne} <span class="r">— ou tire dedans</span>`; if (I.pressed('interact') && !a.channel) this.startChannel(a, 'Casse…', 1.1, () => !v.broken, () => this.breakVitrine(v, a), 'Punch_Right'); }
    }
    if (!prompt) {
      const d = this.drops.find((d) => d.pos.distanceTo(a.pos) < 2);
      if (d) {
        if (d.weapon) { const W = WEAPONS[d.weapon.id]; prompt = `<b>${I.label('interact')}</b> Prendre <span class="r" style="color:${RARITY[d.weapon.rarity].color}">${svg(W.ico)} ${W.name} ${RARITY[d.weapon.rarity].name.toLowerCase()}</span>`; if (I.pressed('interact')) this.pickWeapon(a, d); }
        else { prompt = `<b>${I.label('interact')}</b> Ramasser le butin (${d.items.length})`; if (I.pressed('interact')) this.pickDrop(a, d); }
      }
    }
    if (!prompt) {
      // planque : déposer / voler
      const own = this.socles[a.team].find((s) => s.pos.distanceTo(a.pos) < 4);
      if (own && a.bag.length) { prompt = `<b>${I.label('interact')}</b> Exposer le butin à ${a.team === 'ordre' ? 'au commissariat (prime chaque seconde)' : 'la planque (rapporte chaque seconde)'}`; if (I.pressed('interact')) this.deposit(a); }
      const foe = this.socles[ENEMY[a.team]].find((s) => s.item && s.pos.distanceTo(a.pos) < 2);
      if (!own && foe) { const it = foe.item; prompt = `<b>${I.label('interact')}</b> (maintenir) Voler <span class="r" style="color:${RARITY[it.rarity].color}">${it.icon} ${it.nom}</span> · ${fmt(it.valeur)} €`; if (I.pressed('interact') && !a.channel) this.startChannel(a, 'Vol…', 1.4, () => foe.item === it, () => { const x = this.takeFromSocle(foe); x.stolen = true; if (!this.bagAdd(a, x)) this.dropPile(a.pos, [x]); else { this.stats.stolen++; this.scoreEvent(a.team, 3, 'Vol à la base', a); this.announce('BUTIN VOLÉ !', 'Ramène-le à ta base', '#ffcc3d', 1.6); this.alertTeam(ENEMY[a.team], `🚨 ${a.name} vole ${x.nom} !`); } }, 'Interact'); }
    }
    if (!prompt) prompt = this.wallPrompt(a);
    if (!prompt && a.bag.length && a.pos.distanceTo(this.recel.pos) < this.recel.r) {
      const k = a.team === 'ordre' ? 0.6 : 1; prompt = `<b>${I.label('interact')}</b> Revendre à ${this.recel.nom} : <span class="r" style="color:#ffcc3d">${fmt(a.bag.reduce((t, i) => t + this.recelPrice(i), 0) * k)} €</span>${k < 1 ? ' (−40 % : on est flic)' : ''}`;
      if (I.pressed('interact')) this.sell(a);
    }
    if (!prompt && this.atBase(a)) prompt = `<b>${I.label('shop')}</b> Armurerie`;
    this.ui.prompt = a.channel ? null : prompt;
  }
  startChannel(a, label, dur, valid, done, anim) { const A = a.ch.actions; if ((anim === 'Interact' || !anim) && A.MX_Loot) anim = 'MX_Loot'; else if (anim === 'Punch_Right' && A.MX_Smash) anim = 'MX_Smash';
    a.channel = { label, dur, t: 0, valid, done, anim }; if (anim && a.ch.actions[anim]) { const act = a.ch.actions[anim]; act.reset().setEffectiveWeight(1).fadeIn(0.1).play(); a.channelAnim = act; } }
  pickWeapon(a, d) {
    const w = { id: d.weapon.id, rarity: d.weapon.rarity, mag: WEAPONS[d.weapon.id].mag };
    const same = a.slots.findIndex((s) => s.id === w.id);
    if (same >= 0) { const old = a.slots[same]; if (RARITY_ORDER.indexOf(w.rarity) <= RARITY_ORDER.indexOf(old.rarity)) { old.mag = WEAPONS[old.id].mag; if (a === this.player) this.toast('Munitions récupérées', '#ccc'); this.removeDrop(d); return; } a.slots[same] = w; this.equip(a, same); }
    else if (a.slots.length < 4) { a.slots.push(w); this.equip(a, a.slots.length - 1); }
    else { const old = a.slots[a.cur]; a.slots[a.cur] = w; this.equip(a, a.cur); this.removeDrop(d); this.dropPile(a.pos.clone().add(V(0.5, 0, 0)), [], { id: old.id, rarity: old.rarity }); return; }
    if (a === this.player) { this.toast(`${WEAPONS[w.id].name} ${RARITY[w.rarity].name.toLowerCase()}`, RARITY[w.rarity].color); this.audio.rarity(w.rarity); }
    this.removeDrop(d);
  }
  pickDrop(a, d) {
    d.items.sort((x, y) => y.valeur - x.valeur); const left = [];
    for (const it of d.items) if (!this.bagAdd(a, it)) left.push(it);
    d.items = left; if (!left.length) this.removeDrop(d);
  }
  removeDrop(d) { const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1); this.root.remove(d.g); }
  updateDrops(dt) { for (const d of [...this.drops]) { d.t += dt; d.g.children[0] && (d.g.children[0].rotation.y += dt * 1.5); if (d.t > d.life) this.removeDrop(d); } }
  updateShops(dt) {
    for (const s of this.shops) {
      if (s.broken) { s.respawnT -= dt; if (s.respawnT <= 0) { this.restock(s); } }
      if (s.alarmT > 0) s.alarmT -= dt;
      // (les objets du butin ne tournent plus : leur pivot est au centre de la carte, ils faisaient le tour de la map à travers les murs)
    }
  }
  specialDelivery() {
    const z = this.zoneState.find((q) => q.id === 'C') || this.zoneState[1]; const items = [this.makeItem('frungz', 'legendaire')]; items[0].valeur = 9000;
    this.dropPile(V(z.center[0] + rnd(-2, 2), 0, z.center[1] + rnd(-2, 2)), items);
    this.announce("LE FRUNGZ D'OR", `vient d'apparaître : ${z.name || 'zone'} (${z.id})`, RARITY.legendaire.color, 3); this.audio.capture(true);
    for (const b of this.actors) if (b.bot && b.alive && Math.random() < 0.5) { b.ai.task = { kind: 'drop' }; b.ai.path = null; }
  }
  alertTeam(team, msg) { if (team === this.save.team) this.toast(msg, '#ff4a4a'); for (const b of this.actors) if (b.bot && b.alive && b.team === team && Math.random() < 0.6) { b.ai.task = { kind: 'defend' }; b.ai.path = null; } }

  // ---------------------------------------------------------------- physique commune (joueur et bots)
  updateActor(a, dt) {
    const ch = a.ch;
    if (a.gone) return;
    if (a.temp && a.alive && this.time > a.expire) { a.alive = false; a.gone = true; if (a.bag.length) { this.dropPile(a.pos, a.bag.splice(0)); this.carryMesh(a); } ch.root.visible = false; this.fx.ring(a.pos, '#ffffff'); return; }
    a.stunT = Math.max(0, (a.stunT || 0) - dt);
    if (!a.alive) { if (ch.actions.MX_Idle) this.locomotion(a, dt, 0, false); /* les allures de marche s'effacent, sinon elles retiennent le corps debout pendant la chute */ Anim.dead(a, dt); { // tué en l'air ou sur une marche : le corps retombe au sol au lieu de rester suspendu, et l'inclinaison de glissade s'efface
      const gy = this.world.standY(a.pos.x, a.pos.z, a.pos.y); if (a.pos.y > gy + 0.01 && !a.swim) { a.vel.y = Math.min(a.vel.y, 2) - GRAV * dt; a.pos.y = Math.max(gy, a.pos.y + a.vel.y * dt); } else a.vel.y = 0;
      ch.root.position.copy(a.pos); ch.model.rotation.x = lerp(ch.model.rotation.x, 0, 1 - Math.exp(-dt * 10)); } if (a.bot) { a.respawnT -= dt; if (a.respawnT <= 0) { if (a.temp) { a.gone = true; ch.root.visible = false; return; } this.respawn(a); } } if (a.respawnT < 1.5) ch.root.visible = (a.respawnT * 10 | 0) % 2 === 0; return; }
    this.wallRecharge(a, dt);
    if (a.inCar) { if (a.inCar.kind) this.rideAnimate(a, dt); return; }
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
    // on ne sprinte que vers l'avant, et pas en tirant ; en reculant ou en pas chassés on va moins vite (comme un humain)
    const fwdK = wl > 0.1 ? (wish.x * Math.sin(a.yaw) + wish.z * Math.cos(a.yaw)) / wl : 1;
    const sprint = a.wantSprint && fwdK > 0.25 && this.time - (a.lastShot || -9) > 0.3;
    if (sprint && wl > 0.5 && a.onGround && a.slideT <= 0) a.momentum = Math.min(1, a.momentum + dt / (civ ? 1.1 : 1.6));
    else if (a.onGround && a.slideT <= 0) a.momentum = Math.max(0, a.momentum - dt * 1.8);
    const load = a.bag.length ? 1 - 0.18 * (1 - 0.2 * (a.bot ? 0 : this.save.upgrades.sac || 0)) : 1; // porter un objet ralentit
    const slow = 1 - (a.inGas || 0) * 0.2;
    const K = classOf(a.team, a.cls), mob = (K.speed || 1) * (WEAPONS[this.weapon(a)?.id]?.mob || 1);
    let top = (sprint ? 6.6 + a.momentum * (civ ? 3.2 : 1.8) * (a.perk?.sprint || 1) : 4.4) * load * slow * mob; if (this.aiming && !a.bot) top *= 0.6; a.crouchK = lerp(a.crouchK || 0, a.crouch ? 1 : 0, 1 - Math.exp(-dt * 12)); if (a.crouch) top *= 0.5;
    if (!sprint) top *= fwdK >= 0 ? lerp(0.88, 1, fwdK) : lerp(0.88, 0.74, -fwdK);
    a.landK = Math.max(0, (a.landK || 0) - dt); if (a.landK > 0) top *= 1 - 0.4 * Math.min(1, a.landK / 0.25); // réception : on encaisse avant de repartir
    a.jumpFat = Math.max(0, (a.jumpFat || 0) - dt * 0.7);
    // glissade (accroupi en sprint) / roulade (accroupi sinon)
    if (a.wantCrouch && a.onGround && a.slideT <= 0 && a.rollT <= 0) {
      const sp = this.feetSpeed(a);
      if (sp > 4.6) { this.fx.dust(a.pos, 6, 1); a.slideT = civ ? 1.0 : 0.75; a.slideDir = V(a.vel.x, 0, a.vel.z).normalize(); a.vel.addScaledVector(a.slideDir, 1.5); this.audio.play('cloth', a.pos, 0.7); if (!a.bot) this.cam.trauma += 0.1; }
      else { a.rollT = 0.55; const d = wl > 0.1 ? wish.clone().normalize() : V(Math.sin(a.yaw), 0, Math.cos(a.yaw)); a.vel.x = d.x * (civ ? 8.5 : 7); a.vel.z = d.z * (civ ? 8.5 : 7); a.rollDir = d; if (!a.ch.actions.MX_Run) this.setAnim(a, 'Roll', 0.08, 1.6); this.audio.play('cloth', a.pos, 0.7); }
      a.wantCrouch = 0;
    }
    const target = wish.clone().multiplyScalar(top);
    if (a.slideT > 0) { a.slideT -= dt; const sp = Math.hypot(a.vel.x, a.vel.z); const ns = Math.max(0, sp - dt * (civ ? 3.5 : 5)); a.vel.x = a.slideDir.x * ns; a.vel.z = a.slideDir.z * ns; if (ns < 2.5) a.slideT = 0; }
    else if (a.rollT > 0) { a.rollT -= dt; }
    else {
      // poids : départ franc puis l'accélération s'essouffle près de la vitesse de pointe ; freiner ou repartir à contresens prend un instant
      const spd = Math.hypot(a.vel.x, a.vel.z), along = wl > 0.1 && spd > 0.5 ? (a.vel.x * wish.x + a.vel.z * wish.z) / (spd * wl) : 1;
      const acc = !a.onGround ? 6 : wl > 0.1 ? (along < 0 ? 26 : lerp(30, 17, clamp(spd / 8, 0, 1))) : 17 + spd * 1.3;
      const dvx = target.x - a.vel.x, dvz = target.z - a.vel.z, dl = Math.hypot(dvx, dvz), mx = acc * dt;
      if (dl > mx) { a.vel.x += dvx / dl * mx; a.vel.z += dvz / dl * mx; } else { a.vel.x = target.x; a.vel.z = target.z; }
    }
    // saut / escalade
    if (a.wantJump && a.onGround) {
      const cl = this.findClimb(a);
      if (cl) { a.climb = cl; a.wantJump = 0; this.audio.play('cloth', a.pos, 0.8); if (!a.bot) { this.cam.dip -= 0.08; this.input.rumble(0.2, 0.4, 80); } }
      else { a.vel.y = (civ ? 6.6 : 6.0) * (1 - 0.16 * Math.min(1, a.jumpFat)); a.jumpFat += 0.7; a.onGround = false; a.wantJump = 0; a.slideT = 0; } // sauts enchaînés : de moins en moins hauts
    }
    a.vel.y -= GRAV * dt;
    const prevY = a.pos.y, sw = a.swim ? 0.45 : 1;
    a.pos.x += a.vel.x * dt * sw; a.pos.z += a.vel.z * dt * sw; a.pos.y += a.vel.y * dt;
    // à la nage, on peut se hisser sur le quai bas (le mur du quai ne bloque pas)
    const hit = this.world.pushOut(a.pos, 0.35, a.swim ? a.pos.y + 2.2 : a.pos.y);
    if (hit && a.momentum > 0.3 && !a.climb) a.momentum *= 0.7;
    let gy = this.world.standY(a.pos.x, a.pos.z, a.swim ? prevY + 2.2 : prevY);
    const W = this.world.water; a.swim = false;
    if (W && a.pos.y < W.y - 0.3 && this.world.inWater(a.pos.x, a.pos.z)) { const sy = W.y - 1.0; if (gy < sy) { gy = sy; a.swim = true; if (!a.wasSwim) { this.fx.burst(V(a.pos.x, W.y + 0.1, a.pos.z), 14, { color: '#cfe3ef', speed: 4, size: 0.08, life: 0.7 }); this.audio.play('thud', a.pos, 0.7); } } }
    a.wasSwim = a.swim;
    if (a.pos.y <= gy + 0.02) {
      if (!a.onGround && a.vel.y < -10.5 && a.ch.actions.MX_HardLand && !a.climb) a.landT = 0.62; // grosse chute : roulade de réception
      if (!a.onGround && a.vel.y < -6 && (a === this.player || a.pos.distanceToSquared(this.player.pos) < 900)) this.fx.dust(a.pos, a.vel.y < -10 ? 10 : 5, a.vel.y < -10 ? 1.4 : 0.9);
      if (!a.onGround && a.vel.y < -7 && a === this.player) { this.cam.dip -= Math.min(0.3, -a.vel.y * 0.025); this.audio.play('land', null, 0.6); this.input.rumble(0.3, 0.2, 80); if (a.vel.y < -13 && !a.swim) this.damage(a, (-a.vel.y - 13) * 6, null); }
      if (!a.onGround && a.vel.y < -5) a.landK = Math.min(0.4, -a.vel.y * 0.035);
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
    let name = 'Idle_Gun', speed = 1, fade = 0.15;
    const shooting = this.time - (a.lastShot || -9) < 0.35, aimingNow = shooting || (a === this.player && this.aiming);
    const MX = !!ch.actions.MX_Idle;
    a.airT = a.onGround ? 0 : (a.airT || 0) + dt;
    const P = MX && this.pistolStance(a);
    // élan : un sprint lâché d'un coup finit en dérapage (une fois), une grosse chute en roulade de réception
    if (a.landT > 0) a.landT -= dt; if (a.stopT > 0) a.stopT -= dt;
    if (MX && ch.actions.MX_Stop && a.onGround && !a.channel && !a.climb && a.rollT <= 0 && a.slideT <= 0 && (a.crouchK || 0) < 0.5 && (a.prevSp || 0) > 5.4 && sp < 2.2 && !(a.stopT > 0)) a.stopT = 0.6;
    a.prevSp = lerp(a.prevSp || 0, sp, 1 - Math.exp(-dt * 6));
    if (!this.over) a.celebrate = undefined; else if (a.alive && a.celebrate === undefined) a.celebrate = this.winner === a.team && MX ? pick(['MX_Dance', 'MX_Dance2', 'MX_Cheer', 'MX_Taunt', 'MX_FistPump']) : null;
    if (a.celebrate && ch.actions[a.celebrate]) { name = a.celebrate; fade = 0.3; }
    else if (a.climb) { name = MX ? 'MX_Vault' : 'Interact'; speed = MX ? 3.5 / Math.max(0.3, a.climb.dur) * 0.55 : 2; fade = 0.08; }
    else if (a.rollT > 0 && !ch.actions.MX_Run) { name = 'Roll'; speed = 1.6; fade = 0.08; }
    else if (a.channel) { name = a.channel.anim || 'Interact'; }
    else if (MX && a.slideT > 0) { name = P && ch.actions.MXP_CrouchIdle ? 'MXP_CrouchIdle' : 'MX_CrouchIdle'; fade = 0.1; } // la pose de glissade est écrite dans anim.js, par-dessus l'accroupi
    else if (MX && a.landT > 0 && a.onGround) { name = 'MX_HardLand'; speed = 1.5; fade = 0.05; }
    else if (!a.onGround && MX && a.airT > 0.06) { const J = P && ch.actions.MXP_Jump; name = a.vel.y > 0.5 && a.airT < 0.5 ? (J ? 'MXP_Jump' : 'MX_Jump') : (P && ch.actions.MXP_Fall ? 'MXP_Fall' : 'MX_Fall'); speed = name === 'MX_Jump' ? 1.2 : 1; fade = 0.12; }
    else if (MX && a.stopT > 0) { name = 'MX_Stop'; speed = 1.3; fade = 0.1; }
    else if (!a.onGround && !MX) { name = 'Idle_Gun_Pointing'; }
    else if (MX) { name = 'LOCO'; if (a.anim !== 'LOCO' && /CrouchIdle/.test(a.anim)) fade = 0.25; }
    else if (sp > 0.8) {
      const lv = V(a.vel.x, 0, a.vel.z); const f = V(Math.sin(a.yaw), 0, Math.cos(a.yaw)); const fd = lv.dot(f) / sp; const sd = lv.dot(V(Math.cos(a.yaw), 0, -Math.sin(a.yaw))) / sp;
      if (fd > 0.5) { name = aimingNow ? 'Run_Shoot' : 'Run'; speed = clamp(sp / 6, 0.7, 1.6); }
      else if (fd < -0.5) { name = 'Run_Back'; speed = clamp(sp / 5, 0.7, 1.3); }
      else { name = sd > 0 ? 'Run_Left' : 'Run_Right'; speed = clamp(sp / 5, 0.7, 1.3); }
      if (sp < 3 && fd > 0.5 && !aimingNow) { name = 'Walk'; speed = sp / 2.2; }
    } else if (aimingNow) name = 'Idle_Gun_Pointing';
    this.setAnim(a, name, fade, speed);
    if (MX) this.locomotion(a, dt, sp, aimingNow);
    // animation simplifiée pour les bots lointains
    // (hors du champ de la caméra aussi : on ne voit ni ses bras ni son buste, inutile de les calculer à chaque image)
    const far = a !== this.player && (a.offscreen || a.pos.distanceToSquared(this.player.pos) > 3600);
    // on remet le buste dans sa pose d'animation avant le mixer (sinon la correction de visée s'accumule et le buste tourne sur lui-même)
    const spine = ch.bones.Chest || ch.bones.Torso;
    const pb = ch.procBones || (ch.procBones = [spine, ch.bones.Head, ch.bones.Torso, ch.bones.UpperLegL, ch.bones.UpperLegR, ch.bones.LowerLegL, ch.bones.LowerLegR, ch.bones.FootL, ch.bones.FootR].filter((b, i, arr) => b && arr.indexOf(b) === i));
    for (const b of pb) if (b.userData.base) b.quaternion.copy(b.userData.base);
    Anim.restore(a);
    a.animAcc = (a.animAcc || 0) + dt; let mixed = false; const mid = !far && a !== this.player && a.pos.distanceToSquared(this.camera.position) > 900; // 30–60 m : une image sur deux suffit
    if (!a.lodHidden && (far ? a.animAcc > 0.1 : !mid || a.animAcc > 0.03)) { ch.mixer.update(a.animAcc); a.animAcc = 0; mixed = true; }
    for (const b of pb) (b.userData.base ||= new THREE.Quaternion()).copy(b.quaternion);
    Anim.capture(a);
    this.applyOverlays(a, dt, mixed && !far);
    // glissade : le corps bascule en arrière
    ch.model.rotation.x = lerp(ch.model.rotation.x, a.slideT > 0 ? (ch.actions.MX_Slide ? 0 : ch.actions.MX_Idle ? -0.45 : -0.9) : 0, 1 - Math.exp(-dt * 14));
    const ck = a.slideT > 0 || a.rollT > 0 || a.climb ? 0 : (a.crouchK || 0);
    ch.model.position.y = lerp(ch.model.position.y, (a.slideT > 0 ? (ch.actions.MX_Slide ? 0 : ch.actions.MX_Idle ? 0.05 : 0.35) : 0) - (ch.actions.MX_CrouchIdle ? 0 : ck * 0.42) + (-chars[a.skin].minY * chars[a.skin].k), 1 - Math.exp(-dt * 14));
    if (ck > 0.02 && !far && !ch.actions.MX_CrouchIdle) this.crouchPose(a, ck);
    // couches écrites à la main (src/anim.js) : pieds, poids, inertie, souffle ; complètes près de la caméra, pieds seuls au loin
    const rigPost = Anim.layers(this, a, dt, !far && !a.lodHidden && (a === this.player || a.pos.distanceToSquared(this.camera.position) < 1600));
    // le buste oriente l'arme vers le point visé (réticule pour le joueur, cible pour les bots)
    const busy = a.climb || (a.rollT > 0 && !MX) || a.slideT > 0 || a.landT > 0 || a.stopT > 0 || a.celebrate || a.channel || a.inCar || !a.alive || (a.reloadT > 0 && a.relAuth) || a.overs?.some((o) => o.busy && o.t < o.dur - 0.12);
    const pointing = MX ? (name === 'LOCO' && (aimingNow || sp < 2.8 || a.locoRunF < 0.5)) || name === 'MX_CrouchIdle' || (/MXP?_(Jump|Fall)/.test(name) && aimingNow) : name === 'Idle_Gun_Pointing' || name === 'Run_Shoot' || (/^Run_(Left|Right|Back)$/.test(name) && aimingNow);
    // correction seulement quand l'animation tient l'arme pointée (sinon le buste se cambrerait pour relever une arme baissée)
    const wantW = busy || !pointing ? 0 : 1;
    a.aimW = lerp(a.aimW ?? 0, wantW, 1 - Math.exp(-dt * 14));
    if (spine && ch.gun && a.aimW > 0.02 && !far) this.aimSpine(a, spine);
    if (rigPost) Anim.post(a);
    if (!Anim.sane(a)) (this.nanHeals = (this.nanHeals || 0) + 1);
  }

  // espace de mélange de la marche/course (animations Mixamo) : avant, arrière, gauche, droite pondérés par la direction réelle du déplacement
  // (les diagonales sont des mélanges), marche ↔ course selon la vitesse, repos ; toutes les allures partagent une même phase de pas
  locomotion(a, dt, sp, aiming) {
    const A = a.ch.actions, L = a.loco || (a.loco = { w: 0, phase: 0, acts: new Set() });
    L.w = a.anim === 'LOCO' ? Math.min(1, L.w + dt / (a.locoFade || 0.15)) : Math.max(0, L.w - dt / (a.locoFade || 0.15));
    const want = {}; const crouch = (a.crouchK || 0) > 0.5 && !(a.rollT > 0); // esquive : plus de saut périlleux (le perso passait tête en bas), une ruée basse sur les allures de course, bassin descendu et buste plongé (pose dans anim.js)
    let fd = 1, sd = 0; if (sp > 0.05) { const vx = a.vel.x / sp, vz = a.vel.z / sp; fd = vx * Math.sin(a.yaw) + vz * Math.cos(a.yaw); sd = vx * Math.cos(a.yaw) - vz * Math.sin(a.yaw); }
    const move = clamp((sp - 0.25) / 1.1, 0, 1), run = clamp((sp - 2.6) / 1.3, 0, 1);
    const dirs = [Math.max(0, fd), Math.max(0, -fd), Math.max(0, sd), Math.max(0, -sd)]; const tot = dirs[0] + dirs[1] + dirs[2] + dirs[3] || 1;
    let D = 0, Wsum = 0;
    const add = (n, w, dist) => { if (w <= 0.001 || !A[n]) return; want[n] = (want[n] || 0) + w; if (dist) { D += w * dist; Wsum += w; } };
    // allure du pistolet (tenu à deux mains) si l'arme en main est un pistolet ou un revolver, sinon fusil ; repli sur le fusil quand un clip manque
    const P = this.pistolStance(a), N = (n) => (P && A['MXP_' + n] ? 'MXP_' : 'MX_') + n;
    if (crouch) {
      add(N('CrouchIdle'), 1 - move);
      const C = [N('CrouchWalk'), A.MX_CrouchB ? 'MX_CrouchB' : N('CrouchWalk'), A.MX_CrouchL ? 'MX_CrouchL' : N('CrouchWalk'), A.MX_CrouchR ? 'MX_CrouchR' : N('CrouchWalk')];
      for (let i = 0; i < 4; i++) add(C[i], move * dirs[i] / tot, STRIDE[C[i]] || 0.88);
    }
    else {
      add(N('Idle'), 1 - move);
      const runF = P ? N('Run') : aiming ? 'MX_RunAim' : 'MX_Run';
      const W = [N('WalkF'), N('WalkB'), N('WalkL'), N('WalkR')], Rn = [runF, N('RunBack'), N('RunLeft'), N('RunRight')];
      for (let i = 0; i < 4; i++) { const k = move * dirs[i] / tot; add(W[i], k * (1 - run), STRIDE[W[i]] || 1.4); add(Rn[i], k * run, STRIDE[Rn[i]] || 2); }
      a.locoRunF = run * dirs[0] / tot * (aiming || P ? 0 : 1);
    }
    if (Wsum > 0) L.phase = (L.phase + dt * sp / (D / Wsum)) % 1;
    for (const n of Object.keys(want)) L.acts.add(n);
    for (const n of L.acts) {
      const act = A[n], w = (want[n] || 0) * L.w;
      if (w <= 0.001) { if (act.isScheduled()) act.stop(); if (!want[n]) L.acts.delete(n); continue; } // (isRunning() est toujours faux ici, la vitesse des clips est à 0 : sans isScheduled() les allures restaient mêlées à la mort, au saut, à la roulade)
      if (!act.isScheduled()) act.play(); act.enabled = true; act.timeScale = 0; act.setEffectiveWeight(w);
      act.time = /Idle/.test(n) ? (this.time % act.getClip().duration) : L.phase * act.getClip().duration;
    }
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
  // personnages hors du champ de la caméra (marge de 2 m) : animation allégée
  cullActors() {
    const cam = this.camera; cam.updateMatrixWorld(); const F = this._frustum || (this._frustum = new THREE.Frustum()), M = this._fm || (this._fm = new THREE.Matrix4()), S = this._fs || (this._fs = new THREE.Sphere());
    M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); F.setFromProjectionMatrix(M);
    for (const a of this.actors) { if (a === this.player) { a.offscreen = false; continue; } S.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z); S.radius = 2; a.offscreen = !F.intersectsSphere(S); }
    const K = this.killcam; if (K) { if (K.target) K.target.offscreen = false; if (K.by) K.by.offscreen = false; } // vus dans la bulle
  }
  updateLod() {
    const cp = this.camera.position;
    for (const a of this.actors) {
      if (a === this.player || a.gone) continue; const d2 = a.pos.distanceToSquared(cp);
      const L = this.opts.lod || 200, LS = this.opts.lodShadow ?? 45; a.lodHidden = d2 > L * L; a.ch.model.visible = !a.lodHidden; const sh = d2 < LS * LS;
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
    const ch = a.ch, g = ch.gun, T = this.aimPoint(a); const head = a.pos.distanceToSquared(this.camera.position) < 1600 ? ch.bones.Head : null; const h0 = new THREE.Quaternion();
    ch.root.updateMatrixWorld(true); if (head) head.getWorldQuaternion(h0);
    this._aimSpine(a, spine, ch, g, T);
    // la tête garde l'essentiel de son orientation d'animation (sinon elle part en arrière quand le buste se redresse pour viser haut)
    if (head) { spine.updateMatrixWorld(true); const h1 = new THREE.Quaternion(); head.getWorldQuaternion(h1); const want = h0.clone().slerp(h1, 0.35); const pq = new THREE.Quaternion(); head.parent.getWorldQuaternion(pq); head.quaternion.copy(pq.invert().multiply(want)); }
  }
  _aimSpine(a, spine, ch, g, T) {
    const _q = new THREE.Quaternion(), pq = new THREE.Quaternion(), bq = new THREE.Quaternion(), gp = V(), fw = V(), want = V();
    for (let it = 0; it < 2; it++) {
      if (it) spine.updateMatrixWorld(true);
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
    if (b.inCar) return; // pilote d'un mini-hélico : c'est l'engin qui décide (helico.js)
    b.spawnProt = Math.max(0, (b.spawnProt || 0) - dt);
    const ai = b.ai; ai.think -= dt; ai.losT -= dt; ai.strafeT -= dt; ai.nadeT -= dt;
    b.wantSprint = false; b.wish = V();
    if (b.stunT > 0) ai.react = Math.max(ai.react, 0.3);
    if (b.rewards.length && (ai.streakT = (ai.streakT || 0) - dt) <= 0 && this.time > this.streakCd[b.team]) this.useStreak(b);
    // cible : l'ennemi visible le plus proche (contrôles de visibilité étalés dans le temps)
    if (ai.losT <= 0) {
      ai.losT = rnd(0.25, 0.45);
      let best = null, bd = 55;
      for (const t of this.actors) { if (!t.alive || t.team === b.team) continue; const d = t.pos.distanceTo(b.pos); if (d < bd) { bd = d; best = t; } }
      if (best) { const e = b.pos.clone().add(V(0, 1.6, 0)), tp = best.pos.clone().add(V(0, 1.3, 0)); const vis = this.world.los(e, tp) && !this.smokeBlocks(e, tp) && !(best.inCar && best.inCar.kind !== 'heli' && bd > 25); if (vis) { if (ai.target !== best) ai.react = rnd(0.25, 0.55) + (best.slideT > 0 || best.rollT > 0 ? 0.3 : 0); ai.target = best; ai.seeT = 2.5; ai.los = true; ai.lastSeen = best.pos.clone(); } else ai.los = ai.target === best ? false : ai.los; }
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
      if (ai.react <= 0 && dist < D.range * 0.9 && b.reloadT <= 0 && (ai.facing ?? 0) < 0.6) { // il faut avoir tourné l'arme vers la cible
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
    if (lookAt) { const d = V(lookAt.x - b.pos.x, 0, lookAt.z - b.pos.z); if (d.lengthSq() > 0.01) { // la rotation prend de l'élan puis se pose, plafonnée (plus vive au combat) : plus de demi-tour instantané
        const diff = lerp_angle(0, Math.atan2(d.x, d.z) - b.yaw, 1), fight = !!(ai.target && ai.los), maxR = fight ? 7.5 : 4.6;
        ai.yawV = lerp(ai.yawV || 0, clamp(diff * (fight ? 9 : 6), -maxR, maxR), 1 - Math.exp(-dt * 14)); b.yaw += ai.yawV * dt; ai.facing = Math.abs(diff); } b.pitch = Math.atan2(lookAt.y - b.pos.y - 1.5, Math.hypot(d.x, d.z)); }
    // barricades : poser face à une menace, renforcer celles du camp
    this.botWalls(b, dt);
    // tâches à l'arrivée
    this.botTaskTick(b, dt);
    // coincé ?
    // sortie de secours : aucun progrès pendant 6 s sans combat ni action → nouvelle décision, puis recalage sur une case libre
    ai.progT = (ai.progT || 0) + dt; if (!ai.progP) ai.progP = b.pos.clone();
    if (ai.progT > 6) { const moved = b.pos.distanceTo(ai.progP) > 1.5; if (!moved && !b.channel && !(ai.target && ai.los) && !b.inCar) { ai.fails = (ai.fails || 0) + 1; ai.task = null; ai.path = null; ai.think = 0; if (ai.fails >= 2) { const [i, j] = this.world.nearestFree(...this.world.cell(b.pos.x, b.pos.z)); const B = this.world.bounds, S = this.world.nav.S; b.pos.x = B.x0 + (i + 0.5) * S; b.pos.z = B.z0 + (j + 0.5) * S; b.pos.y = this.world.groundY(b.pos.x, b.pos.z); ai.fails = 0; } } else ai.fails = 0; ai.progT = 0; ai.progP.copy(b.pos); }
    if (b.wish.lengthSq() > 0.1 && !(ai.backT > 0)) { if (b.pos.distanceTo(ai.lastPos) < 0.05 * 60 * dt) { ai.stuck += dt; if (ai.stuck > 0.8) { ai.stuck = 0; ai.stuckN = (ai.stuckN || 0) + 1;
      const wall = this.walls.find((w) => w.team !== b.team && w.pos.distanceTo(b.pos) < 4.5 && this.botCanBreak(b, w));
      if (wall && !ai.target) { ai.wallTarget = wall; ai.wallT = 2.5; }
      if (ai.stuckN % 2 === 1) b.wantJump = 0.1; // d'abord tenter de sauter / escalader
      else { const side = Math.random() < 0.5 ? 1 : -1; ai.backDir = V(-b.wish.x + b.wish.z * side * 0.8, 0, -b.wish.z - b.wish.x * side * 0.8).normalize(); ai.backT = rnd(0.5, 0.9); }
    } } else { ai.stuck = 0; if (b.pos.distanceTo(ai.lastPos) > 0.1) ai.stuckN = 0; } }
    // barricade ennemie qui bloque le passage : on la casse
    if (ai.wallTarget && ai.wallT > 0 && !ai.target) { ai.wallT -= dt; const w = ai.wallTarget; if (!this.walls.includes(w)) ai.wallTarget = null; else { const W2 = this.weapon(b); const o = b.pos.clone().add(V(0, 1.45, 0)); const d = w.pos.clone().add(V(0, 1, 0)).sub(o).normalize(); b.yaw = Math.atan2(d.x, d.z); if (W2.mag <= 0) this.startReload(b); else if (b.fireT <= 0 && b.reloadT <= 0) this.fire(b, o, d); } }
    ai.lastPos.copy(b.pos);
    if (b.marker) b.marker.visible = b.team === this.save.team || this.time - (b.spotted || -99) < 3 || (b.spotMark || 0) > this.time;
  }
  botDecide(b) {
    const ai = b.ai; const civ = b.team === 'civils';
    const cap = b.bag.length >= 1;
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
    const zs = this.zoneState.filter((z) => !z.souterraine).map((z) => ({ z, w: (z.owner === b.team ? 0.25 : 1) * (1 / (1 + Math.hypot(z.center[0] - b.pos.x, z.center[1] - b.pos.z) / 40)) * (z.id === 'B' ? 1.3 : 1) }));
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
    const ai = b.ai;
    // marche arrière de dégagement (bloqué contre une barricade, une voiture, un autre bot)
    if (ai.backT > 0) { ai.backT -= dt; b.wish.copy(ai.backDir); if (ai.backT <= 0) { ai.path = null; ai.think = 0; } return; }
    if (!ai.path) return; const P = ai.path;
    ai.checkT = (ai.checkT ?? 0.5) - dt;
    if (ai.checkT <= 0 && ai.pi < P.length) { ai.checkT = 0.6; if (!this.world.gridLos([b.pos.x, b.pos.z], P[ai.pi])) { ai.path = null; ai.think = 0; return; } }
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
    if (t.kind === 'wall') { this.botWallTask(b, dt); if (!b.channel) return; }
    if (t.kind === 'loot') {
      const s = t.shop, v = t.vit;
      if (b.channel) {}
      else if (v && !v.broken) { if (Math.hypot(v.front.x - b.pos.x, v.front.z - b.pos.z) < 2) { b.wish.set(0, 0, 0); b.yaw = Math.atan2(-v.n.x, -v.n.z); this.startChannel(b, 'casse', 1.4, () => !v.broken, () => { this.breakVitrine(v, b); ai.path = null; }, 'Punch_Right'); } }
      else {
        const items = this.shopItems(s);
        if (!items.length || b.bag.length) { ai.task = null; ai.think = 0; }
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
  // dans la zone : rayon au sol ET bon étage (la zone H est sous la C, la G sur le Tertre)
  inZone(a, z) { return Math.hypot(a.pos.x - z.center[0], a.pos.z - z.center[1]) < z.radius && Math.abs(a.pos.y - (z.y ?? 0.17)) < 3; }
  updateZones(dt) {
    this.zoneTick = (this.zoneTick || 0) + dt;
    for (const z of this.zoneState) {
      const n = { ordre: 0, civils: 0 };
      for (const a of this.actors) if (a.alive && !a.inCar && this.inZone(a, z)) n[a.team]++;
      z.contested = n.ordre > 0 && n.civils > 0; z.n = n;
      const only = !z.contested ? (n.ordre ? 'ordre' : n.civils ? 'civils' : null) : null;
      const was = z.threat; z.threat = !!(only && z.owner && only !== z.owner) || (z.contested && !!z.owner);
      if (z.threat && !was && z.owner === this.player.team && this.time - (z.warnT || -99) > 8) { z.warnT = this.time; this.toast(`⚠ ${z.id} est attaquée`, '#ff8080'); }
      if (this.net?.guest) {} // invité : captures et score viennent du chef
      else if (only && z.owner !== only) {
        let pk = 1; for (const a of this.actors) if (a.alive && a.team === only && a.perk?.cap > pk && !a.inCar && this.inZone(a, z)) pk = a.perk.cap;
        const rate = dt / 10 * (1 + 0.4 * (Math.min(3, n[only]) - 1)) * pk; // 10 s seul, plus vite à plusieurs ; une zone ennemie se neutralise d'abord
        if (z.cap && z.cap !== only) { z.p -= rate; if (z.p <= 0) { z.p = 0; z.cap = only; } } else { z.cap = only; z.p += rate; if (z.p >= 1) this.captureZone(z, only); }
      } else if (!only && !z.contested && z.cap && z.owner !== z.cap) { z.p = Math.max(0, z.p - dt / 20); if (z.p <= 0) z.cap = null; }
      const col = z.owner ? TEAMS[z.owner].color : '#ffffff';
      for (const m of z.mats) m.color?.set(col); if (z.mats[2].uniforms) z.mats[2].uniforms.c.value.set(z.contested ? (this.time * 3 | 0) % 2 ? '#fff' : col : col);
      z.flag.position.y = 6 + Math.sin(this.time * 2 + z.center[0]) * 0.2; z.flag.material.color.set(col);
    }
    if (this.zoneTick >= 1 && !this.net?.guest) { this.zoneTick -= 1; for (const z of this.zoneState) if (z.owner) this.score[z.owner] += 1; }
  }
  captureZone(z, team) {
    const prev = z.owner; z.owner = team; z.p = 1; this.fx.ring(V(z.center[0], this.world.groundY(z.center[0], z.center[1], (z.y ?? 0.17) + 0.5), z.center[1]), TEAMS[team].color);
    const mine = team === this.save.team; this.audio.capture(mine);
    this.announce(mine ? `${z.id} CAPTURÉE` : prev === this.save.team ? `${z.id} PERDUE` : `L'ENNEMI PREND ${z.id}`, mine ? 'Nous tenons la zone' : prev === this.save.team ? 'Reprenez-la !' : `${z.name || ''}`, mine ? '#5ad1ff' : '#ff5a4a', 1.8);
    for (const a of this.actors) if (a.alive && !a.gone && a.team === team && this.inZone(a, z)) { a.stats.cap++; this.addGalons(a, 3); }
    const p = this.player; if (p.alive && p.team === team && this.inZone(p, z)) { this.stats.captures++; this.earn(150, `Capture de ${z.id}`); }
  }
  endMatch() {
    this.over = true; const w = this.score.ordre > this.score.civils ? 'ordre' : this.score.civils > this.score.ordre ? 'civils' : null; this.winner = w;
    const win = w === this.save.team; if (win) this.earn(1000, 'Victoire', true);
    this.audio.engine(false);
    this.save.xp = (this.save.xp || 0) + this.stats.kills * 10 + this.stats.captures * 30 + (win ? 200 : 50); this.save.lvl = 1 + Math.floor(Math.sqrt(this.save.xp / 100)); this.persist();
    setTimeout(() => this.onEnd?.({ win, draw: !w, score: { ...this.score }, stats: { ...this.stats } }), 1500);
    this.announce(w ? (win ? 'VICTOIRE' : 'DÉFAITE') : 'ÉGALITÉ', `${this.score.ordre} — ${this.score.civils}`, win ? '#ffcc3d' : '#ff4a4a', 3);
  }

  // ---------------------------------------------------------------- caméra : TPS / FPS, balancement, tremblement, recul
  // kill-cam en bulle : petite caméra de surveillance incrustée sur le côté pendant que le jeu continue en plein écran
  // (aucune prise de contrôle de la caméra : on reste dans l'action, compatible multijoueur)
  maybeKillcam(t, opts) {
    const a = this.player; if (this.save.settings?.killcam === false || !a.alive) return;
    const dist = opts.dist ?? a.pos.distanceTo(t.pos);
    // la balle filmée vient de tuer : on reste sur la balle puis on suit la victime
    const B = this.killcam; if (B?.mode === 'bullet' && opts.sniper) { B.target = t; B.keep = true; B.dur = B.t + 1.9; const el = $('killcam'); el?.classList.add('gold'); const bt = el?.querySelector('.kc-bot'); if (bt) bt.innerHTML = `${opts.head ? 'TIR À LA TÊTE' : 'ÉLIMINÉ'} · ${Math.round(dist)} m<small>${t.name}</small>`; return; }
    const shot = V(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize(), side = V(shot.z, 0, -shot.x), head = t.pos.clone().add(V(0, 1.2, 0));
    let eye = null;
    for (const [s, back, up, w] of [[1, 1.2, 1.5, 3], [-1, 1.2, 1.5, 3], [1, -0.8, 1.9, 3.2], [-1, -0.8, 1.9, 3.2], [1, 2, 2.1, 4], [-1, 2, 2.1, 4], [1, 0, 1.3, 2.2]]) {
      const e = head.clone().addScaledVector(side, s * w).addScaledVector(shot, -back); e.y = this.world.groundY(e.x, e.z, head.y) + up;
      if (this.world.los(e, head)) { eye = e; break; }
    }
    if (!eye) eye = head.clone().addScaledVector(shot, -1.8).add(V(0, 0.7, 0));
    const style = opts.head && dist > 80 ? "TIR D'ÉLITE" : opts.head ? 'TIR À LA TÊTE' : a.slideT > 0 ? 'EN GLISSADE' : !a.onGround ? 'EN PLEIN VOL' : a.rollT > 0 ? 'EN ROULADE' : 'ÉLIMINÉ';
    this.startPip({ mode: 'victim', target: t, eye, dur: 2.4, gold: !!opts.head || dist > 60, title: `${style} · ${Math.round(dist)} m`, sub: t.name });
  }
  startPip(K) {
    K.t = 0; K.cam = 1 + ((this.time * 7) | 0) % 9; this.killcam = K;
    const el = $('killcam'); if (!el) return;
    el.innerHTML = `<div class="kc-top"><span><span class="rec">●</span> ${K.label || 'CAM 0' + K.cam} · PLACE FRUNGZ</span><span class="kc-time"></span></div><div class="kc-bot">${K.title}<small>${K.sub || ''}</small></div>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); el.classList.toggle('gold', !!K.gold);
    if (K.mode !== 'bullet') this.audio.play('click', null, 0.4);
  }
  updatePip(dt) {
    const K = this.killcam; if (!K) return; K.t += dt;
    const tt = $('killcam')?.querySelector('.kc-time'); if (tt) { const d = new Date(); tt.textContent = d.toLocaleTimeString('fr-FR') + '.' + String(((K.t * 100) | 0) % 100).padStart(2, '0'); }
    if (K.t > K.dur || (K.mode === 'victim' && !K.target)) { this.killcam = null; $('killcam')?.classList.remove('on'); }
  }
  // rendu de la bulle (appelé après l'image principale)
  renderPip(renderer, scene) {
    const K = this.killcam; if (!K) return; const el = $('killcam'); if (!el) return;
    const r = el.getBoundingClientRect(), cr = renderer.domElement.getBoundingClientRect(); if (r.width < 10) return;
    const cam = this.pipCam || (this.pipCam = new THREE.PerspectiveCamera(46, 1.6, 0.05, 600)); cam.aspect = r.width / r.height;
    if (K.mode === 'bullet') {
      const b = K.bullet; const d = b.v.clone().normalize(); const side = V(d.z, 0, -d.x).normalize();
      if (K.hitPt) { const look = K.target ? K.target.pos.clone().add(V(0, 0.8, 0)) : K.hitPt; if (!K.eye2) K.eye2 = K.hitPt.clone().addScaledVector(d, -3.2).addScaledVector(side, 1.4).add(V(0, 0.6, 0)); cam.fov = 42; cam.position.copy(K.eye2); cam.lookAt(look); if (K.target) K.target.ch.model.visible = true; }
      else { cam.fov = 34; cam.position.copy(b.p).addScaledVector(d, -1.1).addScaledVector(side, 0.22).add(V(0, 0.1, 0)); cam.lookAt(b.p.clone().addScaledVector(d, 4)); }
    } else {
      const t = K.target, head = t.pos.clone().add(V(0, t.alive ? 1.2 : Math.max(0.5, 1.1 - K.t * 0.6), 0)); const k = Math.min(1, K.t / K.dur); // vise le corps qui tombe
      cam.fov = 42 - k * 10; cam.position.copy(K.eye).lerp(head, k * 0.25); cam.lookAt(head); t.ch.model.visible = true;
    }
    cam.updateProjectionMatrix();
    const x = r.left - cr.left, y = cr.bottom - r.bottom, sz = renderer.getSize(V2);
    const au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true); renderer.setScissor(x, y, r.width, r.height); renderer.setViewport(x, y, r.width, r.height);
    const vg = this.vgun?.visible; if (this.vgun) this.vgun.visible = false;
    renderer.render(scene, cam);
    if (this.vgun) this.vgun.visible = vg;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, sz.x, sz.y); renderer.shadowMap.autoUpdate = au;
  }
  // ---------------------------------------------------------------- lunette de précision
  // deux grossissements (molette ou R3 / V), entrée de lunette qui se stabilise, balancement de la respiration,
  // souffle retenu (Maj / L3) limité, cœur qui bat, télémètre, réticule avec repères de chute de balle
  updateScope(dt, I, a) {
    const W = this.weapon(a); const scoped = !!(this.aiming && W && WEAPONS[W.id].scope && a.alive && !a.inCar);
    const S = this.sc || (this.sc = { zoom: 0, breath: 1, out: 0, settle: 1, hb: 0, was: false, held: false, T: 0, A: 0 });
    if (scoped !== S.was) { this.audio.scope(scoped); if (scoped) S.settle = 0; S.was = scoped; S.retFov = 0; }
    if (!scoped) { S.held = false; S.breath = Math.min(1, S.breath + dt / 3); S.out = Math.max(0, S.out - dt); return; }
    S.settle = Math.min(1, S.settle + dt / 0.38);
    if (I.pressed('view') || I.st.wheel) { S.zoom = I.st.wheel ? (I.st.wheel < 0 ? 1 : 0) : 1 - S.zoom; this.audio.click(); } if (WEAPONS[W.id]?.zoom === 4) S.zoom = 0; // lunette fixe ×4 (tireur d'élite)
    const hold = I.down('sprint') && S.out <= 0 && S.breath > 0;
    if (hold && !S.held) this.audio.breath(true);
    if (hold) { S.breath -= dt / (4.5 * (a.perk?.souffle || 1)); if (S.breath <= 0) { S.breath = 0; S.out = 2.6; this.audio.breath(false); } }
    else { S.breath = Math.min(1, S.breath + dt / (S.out > 0 ? 6 : 3)); if (S.held) this.audio.breath(false); }
    S.held = hold; S.out = Math.max(0, S.out - dt);
    S.hb -= dt; if ((hold || S.out > 0) && S.hb <= 0) { S.hb = S.out > 0 ? 0.42 : 0.85; this.audio.heart(S.out > 0 ? 1 : 0.6); }
  }
  scopeSway(dt) {
    const S = this.sc; if (!S?.was) { if (S) S.A = 0; return [0, 0]; }
    const a = this.player; S.T += dt;
    const want = 0.0042 * (this.feetSpeed(a) > 1 ? 2.6 : 1) * (a.crouch ? 0.55 : 1) * (S.held ? 0.06 : 1) * (S.out > 0 ? 2.6 : 1) * (1 + (1 - S.settle) * 3) * (a.onGround ? 1 : 3);
    S.A = lerp(S.A, want, 1 - Math.exp(-dt * 6)); const T = S.T;
    return [S.A * (Math.sin(T * 0.83) + 0.45 * Math.sin(T * 2.1 + 0.7)), S.A * 0.8 * (Math.sin(T * 1.21 + 1) + 0.35 * Math.sin(T * 2.7))];
  }
  drawScope(fov) {
    const S = this.sc, el = $('scope'); if (!S || !el) return;
    const sv = el.querySelector('.ret'); if (sv && Math.abs((S.retFov || 0) - fov) > 0.01) { S.retFov = fov;
      const k = 147 / Math.tan(fov * Math.PI / 360); // unités du réticule par radian
      let h = '<g stroke="#111" fill="none">';
      h += '<path d="M-100 0H-14M14 0H100M0 -100V-14M0 14V100" stroke-width="0.6"/><path d="M-100 0H-52M52 0H100M0 52V100" stroke-width="3.2"/>';
      for (let m = 2.5; m * 0.001 * k < 46; m += 2.5) { const u = m * 0.001 * k; h += `<circle cx="${u}" cy="0" r="0.9" fill="#111"/><circle cx="${-u}" cy="0" r="0.9" fill="#111"/><circle cx="0" cy="${-u}" r="0.9" fill="#111"/>`; }
      for (const d of [100, 150, 200, 250, 300]) { const u = 9.8 * d / (2 * BULLET_V * BULLET_V) * k; if (u > 92) break; const w = d % 100 ? 3 : 6; h += `<path d="M${-w} ${u.toFixed(1)}H${w}" stroke-width="0.8"/>`; if (!(d % 100)) h += `<text x="${w + 2}" y="${(u + 1.6).toFixed(1)}" font-size="5" fill="#111" stroke="none" font-family="Inter">${d / 100}</text>`; }
      h += '</g><circle cx="0" cy="0" r="0.9" fill="#ff3b2a"/>'; sv.innerHTML = h; }
    const [sy, sp] = S.sw || [0, 0]; el.style.setProperty('--sx', (-sy * 1400).toFixed(1) + 'px'); el.style.setProperty('--sy', (sp * 1400).toFixed(1) + 'px');
    const z = el.querySelector('.zoom'); if (z) z.textContent = S.zoom ? '×8' : '×4';
    const rg = el.querySelector('.rng'); if (rg && this.aimPt) rg.textContent = `${Math.round(this.aimPt.distanceTo(this.camera.position))} m${this.aimHit ? '' : '+'}`;
    const br = el.querySelector('.breath'); if (br) { br.classList.toggle('held', S.held); br.classList.toggle('out', S.out > 0); br.querySelector('i').style.width = (S.breath * 100).toFixed(0) + '%'; br.querySelector('span').textContent = S.out > 0 ? 'À BOUT DE SOUFFLE' : S.held ? 'SOUFFLE RETENU' : `${this.input.label('sprint')} RETENIR SON SOUFFLE · ${this.input.st.usingPad ? 'R3' : 'MOLETTE'} ZOOM`; }
  }
  updateCamera(dt) {
    const a = this.player, C = this.cam, cam = this.camera;
    C.trauma = Math.max(0, C.trauma - dt * 1.4);
    C.kickP *= Math.exp(-dt * 9); C.kickY *= Math.exp(-dt * 9); C.dip *= Math.exp(-dt * 7);
    const sp = a.alive && !a.inCar ? this.feetSpeed(a) : 0; const fps = (C.fps || !!this.sc?.was) && !a.inCar && a.alive;
    const k = fps ? 1 : 0.55; // balancement plus fort en vue subjective
    if (a.onGround && sp > 0.5) C.bob += dt * sp * 1.25;
    const bobA = Math.min(1, sp / 7) * (a.slideT > 0 || a.rollT > 0 ? 0 : 1);
    const bobY = Math.abs(Math.sin(C.bob)) * 0.055 * bobA * k * (1 + a.momentum * 0.6), bobX = Math.cos(C.bob) * 0.035 * bobA * k;
    // inclinaison : glissade, roulade, vitesse latérale
    const lateral = a.alive ? V(a.vel.x, 0, a.vel.z).dot(V(-Math.cos(C.yaw), 0, Math.sin(C.yaw))) : 0;
    const targetRoll = (a.slideT > 0 ? 0.1 : 0) + clamp(-lateral * 0.006, -0.05, 0.05) * k * 2 + (a.rollT > 0 ? Math.sin((0.55 - a.rollT) / 0.55 * Math.PI) * 0.07 * k : 0);
    C.roll = lerp(C.roll, targetRoll, 1 - Math.exp(-dt * 8));
    // tremblement (trauma²) + vibration de vitesse (sprint à fond, voiture rapide)
    const speedShake = (a.momentum > 0.8 && sp > 8 ? 0.15 : 0) + (a.inCar ? Math.abs(a.inCar.speed) / a.inCar.max * 0.25 : 0) + (a.inGas || 0) * 0.3;
    const tr = C.trauma * C.trauma + speedShake * 0.1; const t = this.time * 30;
    const shY = (Math.sin(t * 1.1) + Math.sin(t * 2.3) * 0.5) * 0.035 * tr * (fps ? 1 : 0.6), shP = (Math.sin(t * 1.7 + 1) + Math.sin(t * 2.9) * 0.5) * 0.035 * tr * (fps ? 1 : 0.6), shR = Math.sin(t * 1.3 + 2) * 0.05 * tr * (fps ? 1 : 0.5);
    // champ de vision : élan → plus large, visée → zoom
    const W = this.weapon(a); const scope = this.aiming && W && WEAPONS[W.id].scope;
    const fovT = -(scope ? 0 : C.zoomP || 0) + (scope ? (this.sc?.zoom ? 7.5 : 15) + (1 - (this.sc?.settle ?? 1)) * 8 : this.aiming ? (C.fps ? 50 : 52) : 72) + (a.momentum * (fps ? 10 : 7)) + (a.inCar ? Math.abs(a.inCar.speed) / a.inCar.max * 14 : 0);
    C.fov = lerp(C.fov, fovT, 1 - Math.exp(-dt * 10)); if (Math.abs(cam.fov - C.fov) > 0.05) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
    const sw = this.scopeSway(dt); if (this.sc) this.sc.sw = sw;
    const yaw = C.yaw + C.kickY + shY + sw[0], pitch = C.pitch + C.kickP + shP + sw[1];
    const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (a.inCar) {
      const c = a.inCar, heli = c.kind === 'heli'; C.carYaw = lerp_angle(C.carYaw ?? c.yaw, c.yaw, 1 - Math.exp(-dt * 3));
      // la caméra regarde où on pointe à la souris, puis revient derrière la voiture (en mini-hélico, c'est la caméra qui oriente l'engin)
      const look = this.input.st.mx || this.input.st.lookX ? 1 : 0; C.freeT = look ? 1.2 : Math.max(0, (C.freeT || 0) - dt); if (!C.freeT && !heli) C.yaw = lerp_angle(C.yaw, C.carYaw, 1 - Math.exp(-dt * 2.5)), C.pitch = lerp(C.pitch, -0.2, 1 - Math.exp(-dt * 2));
      const piv = c.pos.clone().add(V(0, c.camH ?? c.H + 0.6, 0)); const back = heli ? (this.aiming ? 3.8 : c.camBack) + c.speed * 0.05 : (c.camBack ?? 5.5) + Math.abs(c.speed) * (c.kind ? 0.03 : 0.06);
      if (heli) c.col.off = true; const want = piv.clone().addScaledVector(dir, -back); const hit = this.world.ray(piv, want.clone().sub(piv).normalize(), back); if (heli) c.col.off = false; if (hit) want.copy(piv).addScaledVector(want.sub(piv).normalize(), Math.max(1, hit.t - 0.3));
      cam.position.copy(want); cam.position.y += bobY; cam.lookAt(piv.clone().addScaledVector(dir, 6)); cam.rotateZ(shR);
    } else if (fps) {
      const eye = a.pos.clone().add(V(0, (a.slideT > 0 ? 0.95 : a.rollT > 0 ? 0.9 : EYE - (a.crouchK || 0) * 0.55) + bobY + C.dip, 0));
      eye.addScaledVector(V(-Math.cos(C.yaw), 0, Math.sin(C.yaw)), bobX);
      cam.position.copy(eye); cam.lookAt(eye.clone().add(dir)); cam.rotateZ(C.roll + shR);
    } else {
      const back = this.aiming ? 0.72 : 1.65 - a.momentum * 0.1 + (a.slideT > 0 ? -0.4 : 0);
      // composition au nombre d'or : hors visée, le perso se tient sur la verticale des 38,2 % de la largeur
      const shoulder = this.aiming ? 0.5 : clamp((1 - 2 * 0.382) * back * Math.tan(cam.fov * Math.PI / 360) * cam.aspect, 0.4, 0.85);
      const piv = a.pos.clone().add(V(0, (a.slideT > 0 ? 1.0 : (this.aiming ? 1.62 : 1.58) - (a.crouchK || 0) * 0.5) + C.dip * 0.6, 0));
      const right = V(-Math.cos(C.yaw), 0, Math.sin(C.yaw));
      const sh = piv.clone().addScaledVector(right, shoulder); const hs = this.world.ray(piv, right, shoulder + 0.2); if (hs) sh.copy(piv).addScaledVector(right, Math.max(0, hs.t - 0.25));
      const want = sh.clone().addScaledVector(dir, -back).add(V(0, this.aiming ? 0.04 : 0.12, 0));
      const d = want.clone().sub(sh); const L = d.length(); const h = this.world.ray(sh, d.clone().divideScalar(L), L + 0.2);
      if (h) want.copy(sh).addScaledVector(d.divideScalar(L), Math.max(0.3, h.t - 0.25));
      want.y += bobY; want.addScaledVector(right, bobX);
      if (C.snap) { cam.position.copy(want); C.snap = false; } else cam.position.lerp(want, 1 - Math.exp(-dt * 25)); cam.lookAt(cam.position.clone().add(dir));
      // caméra portée : elle encaisse chaque foulée (petit coup de tangage à l'appui, roulis d'un pied sur l'autre) et flotte à peine à la main ;
      // tout est une fonction directe de la phase des pas, sans état à intégrer : stable même quand le jeu ralentit. Presque coupé en visée.
      const run = bobA * (this.aiming ? 0.15 : 1) * (1 + a.momentum * 0.5) * (this.save.settings?.camShake ?? 1), ft = Math.abs(Math.sin(C.bob)), tt = this.time;
      cam.rotateX((0.5 - ft) * 0.0085 * run + Math.sin(tt * 1.9) * 0.0012 * run); cam.rotateY(Math.cos(C.bob) * 0.003 * run + Math.sin(tt * 1.3 + 2) * 0.0012 * run);
      cam.rotateZ(C.roll * 0.6 + shR + Math.cos(C.bob) * 0.0075 * run);
    }
    { const o = cam.position, d = V(); cam.getWorldDirection(d); const R = scope ? 400 : 120; const h = this.world.ray(o, d, R); const ha = scope ? this.rayActors(o, d, h ? h.t : R, a) : null; const t = ha ? ha.t : h ? Math.max(h.t, 4) : R; this.aimHit = !!(h || ha); this.aimPt = o.clone().addScaledVector(d, t); }
    a.ch.root.visible = a.alive || a.respawnT > 0 ? (fps ? false : !a.inCar || !!a.inCar.kind) : false;
    if (this.vgun) { this.vgun.visible = fps && a.alive && !scope; this.updateViewGun(dt, sp, bobA); }
    // garde-fou : une caméra invalide rendrait toute l'image noire et fausserait le son
    if (!Number.isFinite(cam.position.x + cam.position.y + cam.position.z + cam.quaternion.x + cam.quaternion.y + cam.quaternion.z + cam.quaternion.w)) { cam.position.set(a.pos.x, a.pos.y + 1.7, a.pos.z); cam.quaternion.identity(); cam.updateMatrixWorld(); this.nanHeals = (this.nanHeals || 0) + 1; }
    this.audio.listener.x = cam.position.x; this.audio.listener.y = cam.position.y; this.audio.listener.z = cam.position.z; this.audio.listener.yaw = -C.yaw + Math.PI;
    this.followShadow(a.pos);
    // effets d'écran
    const gas = a.inGas || 0; const pd = this.fx.density(cam.position, ['smoke', 'smoke-dark']);
    // dans la fumée : voile laiteux qui monte avec la densité ; lacrymo : yeux qui piquent (léger flou, larmes) sans masquer l'écran
    // (avant : flou CSS sur tout le canevas WebGL dans le lacrymo. Très coûteux pour le navigateur, qui recompose tout l'écran
    // à chaque image, et une cause connue de grands rectangles noirs sur Mac quand la carte graphique sature. Le voile suffit.)
    if (this.renderer.domElement.style.filter) this.renderer.domElement.style.filter = '';
    $('vignette').style.opacity = a.alive ? Math.max(clamp((60 - a.hp) / 60, 0, 1) * 0.9, gas * 0.45, Math.min(0.7, pd * 0.5)) : 0.8;
    $('vignette').style.background = pd > 0.15 && a.hp > 50 ? 'radial-gradient(ellipse at center, rgba(220,222,225,.55) 0%, rgba(215,217,220,.9))' : gas > 0.15 && a.hp > 50 ? 'radial-gradient(ellipse at center, rgba(255,255,255,0) 45%, rgba(235,232,200,.75))' : '';
    document.body.classList.toggle('scoped', !!scope); if (scope) this.drawScope(C.fov > 11 ? 15 : 7.5);
  }
  // arme en vue subjective, accrochée à la caméra
  viewGun() {
    if (this.vgun) this.camera.remove(this.vgun);
    const W = this.weapon(this.player); if (!W) return; const g = gunInstance(W.id); g.rotation.y = Math.PI / 2; g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 5; } });
    this.vgun = new THREE.Group(); this.vgun.add(g); this.vgun.userData.muzzle = g.userData.muzzle; this.camera.add(this.vgun);
    // encombrement de l'arme dans le repère de la vue (canon vers -z, poignée à l'origine)
    g.updateMatrixWorld(true); const bb = new THREE.Box3(); g.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(this.vgun.matrixWorld.clone().invert()))); } });
    this.vgunTop = bb.max.y; this.vgunLen = bb.max.z - bb.min.z; this.vgunBB = bb; this.vgunPistol = WEAPONS[W.id].hand === 'pistol';
    this.vgunBase = V(0.17, -0.17, -0.36); this.vgunLayout = null;
    this.viewArms(g);
    if (!this.scene.children.includes(this.camera)) this.scene.add(this.camera);
  }
  // vue subjective : les vrais bras et mains du perso joué (mêmes maillage, manches et doigts), posés sur l'arme.
  // On part de la pose « en joue » de l'animation (doigts refermés, poignets orientés), puis chaque image les bras sont
  // ramenés par cinématique inverse sur la poignée (main droite) et le garde-main (main gauche) de l'arme à l'écran.
  viewArms(g) {
    if (this.varms) { this.camera.remove(this.varms.grp); this.varms.geo.dispose(); this.varms = null; }
    const a = this.player, ch = makeCharacter(a.skin); tintTeam(ch.model, a.skin, a.team); const B = ch.bones; if (!B.WristR || !B.UpperArmR || !ch.actions.MX_Idle) return;
    let mesh = null; ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') mesh = o; }); if (!mesh) return;
    const Q = () => new THREE.Quaternion(), wpos = (o) => o.getWorldPosition(V()), wq = (o) => o.getWorldQuaternion(Q());
    // on ne garde que les triangles des bras (os dominants : bras, avant-bras, main, doigts)
    const ARM = /^(UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb|index_|middle_|ring_|pinky_|thumb_)/, src = mesh.geometry, si = src.attributes.skinIndex, sw = src.attributes.skinWeight, isArm = new Uint8Array(si.count);
    for (let v = 0; v < si.count; v++) { let bi = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = sw.getComponent(v, k); if (ww > w) { w = ww; bi = si.getComponent(v, k); } } isArm[v] = ARM.test(mesh.skeleton.bones[bi].name) ? 1 : 0; }
    const idx = []; const I = src.index; for (let i = 0; i < I.count; i += 3) { const x = I.getX(i), y = I.getX(i + 1), z = I.getX(i + 2); if (isArm[x] && isArm[y] && isArm[z]) idx.push(x, y, z); }
    const geo = new THREE.BufferGeometry(); for (const k in src.attributes) geo.setAttribute(k, src.attributes[k]); geo.setIndex(idx); mesh.geometry = geo; mesh.frustumCulled = false; mesh.castShadow = false; mesh.renderOrder = 5;
    // repère de chaque main relevé sur la pose de repos : f = sens des doigts, n = côté paume, k = ligne des jointures
    ch.mixer.stopAllAction(); mesh.skeleton.pose(); ch.root.updateMatrixWorld(true);
    const hands = {}, FING = ['Index', 'Middle', 'Ring', 'Pinky'];
    for (const S of ['R', 'L']) { const W = B['Wrist' + S], p = wpos(W), f = wpos(B['Middle1' + S]).sub(p), len = f.length(); f.normalize();
      const k = wpos(B['Pinky1' + S]).sub(wpos(B['Index1' + S])); let n = V().crossVectors(f, k).normalize();
      const inw = wpos(B.Hips).sub(p).setY(0).normalize().add(V(0, -1, 0)); if (n.dot(inw) < 0) n.negate(); // bras le long du corps ou en croix : la paume regarde le sol ou la cuisse
      const iq = wq(W).invert(), fing = []; for (const F of [...FING, 'Thumb']) for (let i = 1; i <= 3; i++) { const b = B[F + i + S]; if (b) fing.push({ b, F, i, q0: b.quaternion.clone() }); }
      hands[S] = { f: f.applyQuaternion(iq), n: n.applyQuaternion(iq), len, fing }; }
    // pose de départ des bras : en joue (fusil ou pistolet)
    const P = this.vgunPistol && ch.actions.MXP_Idle; const act = P ? ch.actions.MXP_Idle : ch.actions.MX_Idle; act.play(); ch.mixer.setTime(0.3); ch.mixer.update(0);
    const grp = new THREE.Group(); grp.add(ch.root); ch.root.rotation.y = Math.PI; this.camera.add(grp); grp.updateMatrixWorld(true);
    const cam = this.camera, toCam = (o) => cam.worldToLocal(wpos(o)); const sh = toCam(B.UpperArmR).add(toCam(B.UpperArmL)).multiplyScalar(0.5);
    // doigts refermés : on repart des doigts tendus, chaque phalange plie vers la paume (index droit plus ouvert, posé près de la détente) ; les pouces sont posés à chaque image
    for (const S of ['R', 'L']) { const H = hands[S], W = B['Wrist' + S]; for (const o of H.fing) o.b.quaternion.copy(o.q0); W.updateMatrixWorld(true);
      const q = wq(W), f = H.f.clone().applyQuaternion(q), n = H.n.clone().applyQuaternion(q), ax = V().crossVectors(f, n).normalize();
      const CURL = S === 'R' ? [0.9, 1.6, 1.1] : P ? [0.95, 1.4, 0.9] : [1.15, 1.5, 0.9];
      for (const o of H.fing) { if (o.F === 'Thumb') { if (o.i === 1) H.thumb = o; continue; } const amt = CURL[o.i - 1] * (S === 'R' && o.F === 'Index' ? 0.45 : 1) * (1 + 0.05 * FING.indexOf(o.F));
        const nq = wq(o.b).premultiply(Q().setFromAxisAngle(ax, amt * FINGER_SIGN)); o.b.quaternion.copy(wq(o.b.parent).invert().multiply(nq)); o.b.updateMatrixWorld(true); }
      H.arm = wpos(B['UpperArm' + S]).distanceTo(wpos(B['LowerArm' + S])) + wpos(B['LowerArm' + S]).distanceTo(wpos(W)); }
    // mesures de l'arme dans le repère de la vue : bas et face avant de la poignée (main droite), dessous du garde-main (main gauche)
    this.vgun.updateMatrixWorld(true); const inv = this.vgun.matrixWorld.clone().invert(), vs = [], tmp = V();
    g.traverse((o) => { if (!o.isMesh) return; const m = inv.clone().multiply(o.matrixWorld), p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(m); vs.push([tmp.x, tmp.y, tmp.z]); } });
    const bb = this.vgunBB, cx = (bb.min.x + bb.max.x) / 2; let gb = Infinity, front = Infinity;
    for (const v of vs) if (Math.abs(v[2]) < 0.035 && v[1] < gb) gb = v[1]; if (!isFinite(gb)) gb = bb.min.y;
    for (const v of vs) if (v[1] > gb + 0.005 && v[1] < gb + 0.04 && v[2] > -0.07 && v[2] < 0.03 && v[2] < front) front = v[2]; front = isFinite(front) ? clamp(front, -0.05, -0.015) : -0.03;
    const sup = WEAPONS[this.weapon(a).id].support; let support = sup ? V(cx, sup[1], -sup[0]) : V(cx, bb.max.y - 0.09, bb.min.z * 0.55);
    if (!sup && !P) { const up = V(0, 1, 0).transformDirection(this.vgun.matrixWorld), z0 = front - 0.13, z1 = z0 + (bb.min.z + 0.06 - z0) * 0.7, hits = [];
      for (let i = 0; i < 7; i++) { const z = z1 < z0 ? z0 + (z1 - z0) * i / 6 : bb.min.z * 0.6; const h = new THREE.Raycaster(this.vgun.localToWorld(V(cx, bb.min.y - 0.2, z)), up, 0, 1).intersectObject(g, true)[0]; if (h) hits.push([z, this.vgun.worldToLocal(h.point.clone()).y]); }
      if (hits.length) { const top = Math.max(...hits.map((h) => h[1])); const h = hits.find((h) => h[1] > top - 0.02); support = V(cx, h[1], h[0]); } } // le premier appui haut en partant de la poignée : le garde-main, pas le chargeur
    const chain = [B.ShoulderR, B.UpperArmR, B.LowerArmR, B.WristR, B.ShoulderL, B.UpperArmL, B.LowerArmL, B.WristL].filter(Boolean);
    this.varms = { sh0: sh, grp, ch, geo, gun: g, hands, support, fore: !!sup, gb, front, chain, base: chain.map((b) => b.quaternion.clone()), pistol: !!P };
  }
  poseViewArms() {
    const A = this.varms; if (!A) return; A.grp.visible = this.vgun.visible; if (!A.grp.visible) return;
    const B = A.ch.bones, Q = () => new THREE.Quaternion(), cam = this.camera; A.chain.forEach((b, i) => b.quaternion.copy(A.base[i]));
    // les épaules suivent l'arme, buste de trois quarts, et restent sous le bord de l'écran : on ne voit que les avant-bras et les mains, jamais la coupe de la manche
    const gp = this.vgun.position, yaw = A.pistol ? -0.15 : -0.6, back = A.pistol ? 0.42 : 0.4, depth = Math.max(0, -(gp.z + back)) + 0.12; A.grp.rotation.y = yaw;
    A.grp.position.set(gp.x - 0.1, Math.min(gp.y - 0.14, -depth * Math.tan(cam.fov * Math.PI / 360) - 0.24), gp.z + back).sub(A.sh0.clone().applyAxisAngle(V(0, 1, 0), yaw));
    for (const S of ['R', 'L']) { B['UpperArm' + S].scale.setScalar(1); B['Wrist' + S].scale.setScalar(1); }
    cam.updateMatrixWorld(true);
    const vq = this.vgun.getWorldQuaternion(Q()), dir = (x, y, z) => V(x, y, z).normalize().applyQuaternion(vq); // repère de l'arme à l'écran : x à droite, y en haut, -z vers le canon
    // chaque main est orientée par deux directions : F le sens des doigts (avant qu'ils se referment) et N le côté vers lequel regarde la paume ; « at » est le point de l'arme où se posent les jointures (ou le creux de la paume)
    const place = (H, F, N0, at, bk, lift) => { const N = N0.addScaledVector(F, -N0.dot(F)).normalize(), K = V().crossVectors(F, N);
      const hf = H.f.clone(), hn = H.n.clone().addScaledVector(hf, -H.n.dot(hf)).normalize(), hk = V().crossVectors(hf, hn);
      return [this.vgun.localToWorld(at).addScaledVector(F, -H.len * bk).addScaledVector(N, -lift), Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, N, K)).multiply(Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hf, hn, hk)).invert())]; };
    // main droite : paume contre le côté droit de la poignée, jointures au coin avant, les doigts se referment devant
    const [rp, rq] = place(A.hands.R, dir(-0.3, -0.12, -0.95), dir(-1, 0, 0.3), V(0.03, A.gb + 0.047, A.front - 0.008), 1, 0);
    // main gauche : paume sous le garde-main, doigts qui remontent de l'autre côté (fusils) ; plaquée à gauche de la poignée, doigts par-dessus ceux de la main droite (pistolets)
    const [lp, lq] = A.pistol ? place(A.hands.L, dir(0.15, -0.35, -0.9), dir(1, 0, 0.15), V(-0.032, A.gb + 0.025, A.front - 0.022), 1, 0) : A.fore ? place(A.hands.L, dir(0.2, -0.25, -0.95), dir(1, 0, 0.1), A.support.clone().add(V(-0.03, 0, -0.02)), 1, 0) /* poignée avant verticale : main refermée autour */
      : place(A.hands.L, dir(0.5, -0.5, -0.7), dir(0.72, 0.68, 0.1), A.support.clone().add(V(-0.012, 0.004, 0)), 0.62, 0.014); /* paume contre l'arête basse gauche du garde-main : on voit le dos de la main et le pouce, les doigts passent dessous */
    const down = V(0, -1, 0).applyQuaternion(vq), right = V(1, 0, 0).applyQuaternion(vq);
    for (const [S, tp, tq, pole, td] of [['R', rp, rq, down.clone().addScaledVector(right, 0.5), dir(-0.22, -0.05, -0.97)], ['L', lp, lq, down.clone().addScaledVector(right, -0.6), A.pistol ? dir(0.1, 0.15, -1) : dir(0.12, 0.12, -0.98)]]) {
      // bras allongé au besoin (la main garde sa taille) : l'arme est tenue loin devant, l'épaule reste hors champ
      const U = B['UpperArm' + S], W = B['Wrist' + S], H = A.hands[S], s = clamp(U.getWorldPosition(V()).distanceTo(tp) / (H.arm * 0.94), 1, 1.8); U.scale.setScalar(s); W.scale.setScalar(1 / s); U.updateMatrixWorld(true);
      this.armIK(U, B['LowerArm' + S], W, tp, tq, pole);
      // pouce couché le long de l'arme
      const t = H.thumb, tip = B['Thumb3' + S]; if (t && tip) { t.b.quaternion.copy(t.q0); t.b.updateMatrixWorld(true); const d = tip.getWorldPosition(V()).sub(t.b.getWorldPosition(V())).normalize();
        const nq = t.b.getWorldQuaternion(Q()).premultiply(Q().setFromUnitVectors(d, td)); t.b.quaternion.copy(t.b.parent.getWorldQuaternion(Q()).invert().multiply(nq)); t.b.updateMatrixWorld(true); } }
  }
  // cinématique inverse à deux os : l'épaule et le coude amènent la main sur la cible, le coude du côté « pole », puis le poignet prend l'orientation voulue
  armIK(A, Bn, C, target, quat, pole) {
    const wp = (o) => o.getWorldPosition(V()), wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
    const aim = (bone, from, to) => { const q = wq(bone).premultiply(new THREE.Quaternion().setFromUnitVectors(from, to)); bone.quaternion.copy(wq(bone.parent).invert().multiply(q)); bone.updateMatrixWorld(true); };
    const a = wp(A), b = wp(Bn), c = wp(C); const l1 = a.distanceTo(b), l2 = b.distanceTo(c); const d = target.clone().sub(a); const L = clamp(d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3); d.normalize();
    const p = pole.clone().addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, -1, 0); p.normalize();
    const cosA = clamp((l1 * l1 + L * L - l2 * l2) / (2 * l1 * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA); const e = a.clone().addScaledVector(d, l1 * cosA).addScaledVector(p, l1 * sinA);
    aim(A, b.sub(a).normalize(), e.clone().sub(a).normalize());
    const b2 = wp(Bn), c2 = wp(C); aim(Bn, c2.sub(b2).normalize(), a.clone().addScaledVector(d, L).sub(b2).normalize());
    C.quaternion.copy(wq(C.parent).invert().multiply(quat)); C.updateMatrixWorld(true);
  }
  // place l'arme selon le nombre d'or : le bout du canon sur le point d'or bas-droit (61,8 % de la largeur, 61,8 % de la hauteur),
  // la crosse qui file vers le coin ; l'arme couvre ~23 % de la largeur (fusils) ou ~9 % (pistolets), toujours sous la ligne des 62 %
  hipLayout() {
    const cam = this.camera, ty = Math.tan(cam.fov * Math.PI / 360), tx = ty * cam.aspect, PHI = 0.618;
    const key = cam.fov.toFixed(1) + cam.aspect.toFixed(3); if (this.vgunLayout?.key === key) return this.vgunLayout.v;
    const L = this.vgunLen || 0.6, fz = this.vgunBB ? -this.vgunBB.min.z : L * 0.7, rz = this.vgunBB ? this.vgunBB.max.z : L * 0.3;
    const fx = 2 * PHI - 1, fy = -(2 * PHI - 1); // point d'or en coordonnées écran (-1..1)
    const rear = this.vgunPistol ? fx + (1 - PHI) * 0.9 : fx + (1 - PHI) * clamp(1.5 + L * 0.9, 2.0, 2.5); /* arme proche : l'arrière sort de l'écran à droite, l'arme tient le tiers d'or bas-droit (38,2 % de la largeur) */ // les armes courtes restent plus loin, à proportion de leur longueur // abscisse visée pour l'arrière de l'arme
    // arme parallèle à l'axe de vue : x/(prof·tx) donne fx au bout et rear à l'arrière → profondeur de la poignée
    const k = rear / fx; const d = (fz + k * rz) / (k - 1); // profondeur de la poignée (origine)
    const X = fx * (d + fz) * tx, Y = fy * (d + fz) * ty - (this.vgunTop || 0.1); // le dessus de l'arme affleure la ligne des 61,8 %
    const v = V(X, Y, -d); this.vgunLayout = { key, v }; return v;
  }
  updateViewGun(dt, sp, bobA) {
    const a = this.player, C = this.cam; const g = this.vgun; const ad = this.aiming ? V(0, -(this.vgunTop || 0.12) - 0.012, -0.24 - Math.min(0.08, (this.vgunLen || 0.3) * 0.12)) : this.hipLayout();
    const t = C.bob; const sway = V(Math.cos(t) * 0.012 * bobA, -Math.abs(Math.sin(t)) * 0.015 * bobA, 0);
    const rel = a.reloadT > 0 ? Math.sin(Math.min(1, a.reloadT / (WEAPONS[this.weapon(a).id].reload * (a.perk?.reload || 1))) * Math.PI) : 0;
    const run = a.momentum > 0.7 && !this.aiming;
    const target = ad.clone().add(sway).add(V(run ? -0.02 : 0, -rel * 0.15 - (run ? 0.04 : 0), C.kickP * 1.5));
    g.position.lerp(target, 1 - Math.exp(-dt * 18)); g.rotation.set(C.kickP * 2 + rel * 0.6 + (run ? -0.12 : 0), (this.input.st.mx || 0) * -0.0006 + (run ? 0.35 : 0), run ? 0.2 : 0);
    this.poseViewArms();
  }

  // ---------------------------------------------------------------- interface
  hudInit() {
    const mi = document.querySelector('#mats .ico-b'); if (mi) mi.innerHTML = svg('barricade');
    $('zones').innerHTML = this.zoneState.map((z) => `<div class="zone" id="z${z.id}"><div class="fill"></div><span>${z.id}</span></div>`).join('');
    $('zmarks').innerHTML = this.zoneState.map((z) => `<div class="zm" id="zm${z.id}"><b>${z.id}</b><small></small></div>`).join('');
  }
  // façon Domination : lettres des zones à l'écran (à travers les murs), bloc de capture quand on est dedans
  updateZoneHud() {
    const me = this.player, cam = this.camera, v = V(), W = innerWidth, H = innerHeight; let inside = null;
    for (const z of this.zoneState) {
      const el = $('zm' + z.id); if (!el) continue; const zy = z.y ?? 0.17, gy = this.world.groundY(z.center[0], z.center[1], zy + 0.5);
      v.set(z.center[0], gy + (z.souterraine ? 2.2 : 3.2), z.center[1]); const dy = gy - me.pos.y, dist = Math.hypot(me.pos.x - z.center[0], me.pos.z - z.center[1], dy * 0.5);
      if (me.alive && this.inZone(me, z)) inside = z;
      v.project(cam); let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H; const behind = v.z > 1;
      if (behind) { x = W - x < W / 2 ? 30 : W - 30; y = H * 0.5; } x = Math.max(30, Math.min(W - 30, x)); y = Math.max(110, Math.min(H - 60, y));
      // zone à un autre étage, juste au-dessus ou en dessous d'une autre : on décale le repère pour qu'ils ne se chevauchent pas
      if (z.souterraine && dy < -3) y = Math.min(H - 60, y + 46);
      const rel = !z.owner ? 'neutre' : z.owner === me.team ? 'allie' : 'ennemi';
      el.className = `zm ${rel}${z.threat || (z.contested) ? ' alerte' : ''}${z.cap && z.cap !== z.owner && z.p > 0 ? ' prise' : ''}${inside === z || $('minimap').classList.contains('big') ? ' cache' : ''}`;
      el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`; el.style.setProperty('--p', ((z.owner && z.cap === z.owner ? 1 : z.p) * 360).toFixed(0) + 'deg'); el.style.setProperty('--pc', z.cap ? (z.cap === me.team ? 'var(--me)' : 'var(--foe)') : 'transparent');
      el.lastChild.textContent = (dist > 8 ? Math.round(dist) + ' m' : '') + (dy < -3 ? ' ▼' : dy > 3 ? ' ▲' : '');
    }
    const box = $('capbox');
    if (inside) { const z = inside, mine = z.owner === me.team, n = z.n || { ordre: 0, civils: 0 }, foe = me.team === 'ordre' ? 'civils' : 'ordre';
      const st = z.contested ? 'CONTESTÉE' : mine && !n[foe] ? 'ZONE SÉCURISÉE' : z.cap === me.team && z.owner && z.owner !== me.team ? 'NEUTRALISATION…' : z.cap === me.team ? 'CAPTURE EN COURS…' : z.owner && z.owner !== me.team ? 'NEUTRALISATION…' : 'CAPTURE EN COURS…';
      box.className = 'on ' + (z.contested ? 'conteste' : mine ? 'allie' : z.owner ? 'ennemi' : 'neutre');
      box.style.setProperty('--p', ((z.owner && z.cap === z.owner ? 1 : z.p) * 360).toFixed(0) + 'deg'); box.style.setProperty('--pc', z.cap === me.team ? 'var(--me)' : 'var(--foe)');
      box.innerHTML = `<div class="ring"><b>${z.id}</b></div><div class="txt"><strong>${st}</strong><small>${z.name || ''} · ${n[me.team]} allié${n[me.team] > 1 ? 's' : ''} · ${n[foe]} ennemi${n[foe] > 1 ? 's' : ''}</small></div>`;
    } else box.className = '';
  }
  toast(txt, color = '#fff') { const el = document.createElement('div'); el.innerHTML = iconize(String(txt).replace(/</g, '&lt;')); el.style.setProperty('--c', color); $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
  announce(big, small, color = '#fff', dur = 2) { const el = $('center'); el.innerHTML = `${iconize(big)}<small>${iconize(small || '')}</small>`; el.style.color = color; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(this._annT); this._annT = setTimeout(() => el.classList.remove('on'), dur * 1000); }
  killFeed(by, t, opts) {
    const el = document.createElement('div'); const c = (x) => (x?.team === 'ordre' ? 'o' : 'c');
    const how = svg(opts.ico || (opts.gas ? 'gas' : opts.weapon ? WEAPONS[opts.weapon]?.ico || 'skull' : by ? 'car' : 'skull'));
    el.innerHTML = by ? `<span class="${c(by)}">${by.name}</span> ${how}${opts.head ? svg('target', 'hs') : ''} <span class="${c(t)}">${t.name}</span>` : `${svg('skull')} <span class="${c(t)}">${t.name}</span>`;
    if (by === this.player || t === this.player) el.className = 'me'; $('feed').prepend(el); setTimeout(() => el.remove(), 5000); while ($('feed').children.length > 6) $('feed').lastChild.remove();
  }
  // ---------- boussole et repérage des tirs (façon Fortnite) ----------
  // cap : 0 = nord (haut de la carte, -z), sens horaire
  heading(dx, dz) { return Math.atan2(dx, -dz); }
  notePing(a, at) {
    const me = this.player; if (!me.alive) return; const d = at.distanceTo(me.pos); if (d > 130 || d < 2) return;
    if (this.time - (a.pingT || -9) < 0.3) return; a.pingT = this.time;
    (this.pings ||= []).push({ x: at.x, z: at.z, t: this.time, d, enemy: a.team !== me.team }); if (this.pings.length > 40) this.pings.shift();
  }
  drawCompass() {
    const cv = this._cmp || (this._cmp = $('compass')?.querySelector('canvas')); if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; } const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, w, h);
    const me = this.player, C = this.cam; const hd = this.heading(Math.sin(C.yaw), Math.cos(C.yaw)); const span = Math.PI * 0.75, px = w / span;
    const rel = (ang) => { let r = ang - hd; while (r > Math.PI) r -= 2 * Math.PI; while (r < -Math.PI) r += 2 * Math.PI; return r; };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) { const r = rel(deg * Math.PI / 180); if (Math.abs(r) > span / 2) continue; const x = w / 2 + r * px, fade = 1 - Math.abs(r) / (span / 2);
      const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[deg];
      g.globalAlpha = 0.25 + fade * 0.75; g.fillStyle = deg === 0 ? '#ff5a4a' : '#fff';
      if (lbl) { g.font = (lbl.length === 1 ? '900 15px' : '800 12px') + ' Inter, sans-serif'; g.fillText(lbl, x, 15); } else { g.fillRect(x - 0.75, 9, 1.5, 9); g.font = '600 9px Inter, sans-serif'; g.fillText(deg, x, 26); } }
    g.globalAlpha = 1;
    // zones à capturer sur la boussole
    for (const z of this.zoneState) { const r = rel(this.heading(z.center[0] - me.pos.x, z.center[1] - me.pos.z)); if (Math.abs(r) > span / 2) continue; const x = w / 2 + r * px; g.fillStyle = z.owner ? TEAMS[z.owner].color : 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x, 33, 6, 0, 7); g.fill(); g.fillStyle = '#000'; g.font = '900 8px Inter, sans-serif'; g.fillText(z.id, x, 33.5); }
    // tirs récents : flamme rouge (ennemi) ou blanche (allié) dans leur direction, s'estompe en 2 s
    const ring = $('shotring'); let html = '';
    for (const p of this.pings || []) { const age = this.time - p.t; if (age > 2) continue; const r = rel(this.heading(p.x - me.pos.x, p.z - me.pos.z)); const al = 1 - age / 2;
      const x = w / 2 + clamp(r, -span / 2, span / 2) * px; g.globalAlpha = al; g.fillStyle = p.enemy ? '#ff3b30' : '#ffffff'; g.beginPath(); g.moveTo(x, 40); g.lineTo(x - 5, 48); g.lineTo(x + 5, 48); g.closePath(); g.fill();
      if (age < 1.2) html += `<i class="${p.enemy ? 'e' : ''}" style="transform:rotate(${(r * 180 / Math.PI).toFixed(0)}deg);opacity:${(1 - age / 1.2).toFixed(2)}"><b style="transform:scale(${(1.2 - Math.min(1, p.d / 120) * 0.5).toFixed(2)})"></b></i>`; }
    g.globalAlpha = 1; g.fillStyle = '#ffe04a'; g.beginPath(); g.moveTo(w / 2, 1); g.lineTo(w / 2 - 5, -5); g.lineTo(w / 2 + 5, -5); g.fill(); g.fillRect(w / 2 - 1, 0, 2, 6);
    if (ring && ring._h !== html) { ring.innerHTML = html; ring._h = html; }
    if (this.pings && this.pings.length && this.time - this.pings[0].t > 2) this.pings = this.pings.filter((p) => this.time - p.t <= 2);
  }
  // grand titre au centre (multi-éliminations, série prête, atout lancé)
  bigText(big, small, color = '#fff', cls = '') {
    const el = $('multik'); if (!el) return; let i = 0;
    const letters = iconize(big).split(/(<svg[\s\S]*?<\/svg>)/).map((part) => part.startsWith('<svg') ? `<span style="animation-delay:${(i++ * 0.035).toFixed(3)}s">${part}</span>`
      : [...part].map((c) => `<span style="animation-delay:${(i++ * 0.035).toFixed(3)}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('')).join('');
    el.innerHTML = `${letters}<small>${iconize(small || '')}</small>`; el.style.color = color; el.className = cls; void el.offsetWidth; el.classList.add('on');
  }
  flash(bg) { const f = $('flash'); if (!f) return; f.style.background = bg; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
  multiKill(opts) {
    const M = this.mk || (this.mk = { n: 0, t: -9 }); M.n = this.time - M.t < 4.5 ? M.n + 1 : 1; if (M.n === 1) M.t0 = this.time; M.t = this.time;
    const sb = $('streakbar')?.querySelector('.count'); if (sb) { sb.classList.remove('bump'); void sb.offsetWidth; sb.classList.add('bump'); }
    if (M.n < 2) { this.flash('radial-gradient(ellipse at center, rgba(255,60,40,0) 55%, rgba(255,60,40,.35))'); return; }
    const names = ['DOUBLÉ !', 'TRIPLÉ !', 'QUADRUPLÉ !', 'CARNAGE !!', 'FRUNGZTASTIQUE !!!', 'FRUNGZPLOSION !!!', 'FRUNGZ SUPRÊME !!!!'];
    const cols = ['#fff', '#9ff59f', '#57b6ff', '#ff7ad9', '#ffcc3d', '#ff7a2f', '#c27bff']; const k = Math.min(M.n - 2, names.length - 1);
    this.bigText(names[k], `${M.n} éliminations d'affilée`, cols[k], `m${k}`);
    this.audio.multi(M.n);
    this.flash(`radial-gradient(ellipse at center, rgba(255,255,255,0) 35%, ${cols[k]}99)`);
    $('hud').classList.remove('shake'); void $('hud').offsetWidth; $('hud').classList.add('shake'); this.cam.trauma = Math.min(1, this.cam.trauma + 0.2 * M.n);
    this.earn(25 * M.n, names[k].replace(/ !+/, '').charAt(0) + names[k].replace(/ !+/, '').slice(1).toLowerCase());
  }
  // barre des séries : progression vers chaque bonus, bonus prêt mis en avant avec la touche à presser
  drawStreakbar() {
    const a = this.player, el = $('streakbar'); if (!el) return; const L = streakTiers(a.team, a.streak);
    const key = `${a.streak}|${a.rewards.join(',')}|${this.input.st.usingPad}|${this.streakUsed || ''}`; if (key === this._sbKey) return; this._sbKey = key;
    // 7 paliers : on montre les bonus prêts et les 3 prochains (le reste se devine dans le sac)
    let prev = 0;
    const shown = new Set(); for (const id of new Set(a.rewards)) { const c = L.filter((r) => r.id === id && r.n <= a.streak).pop() || L.find((r) => r.id === id); if (c) shown.add(c); }
    if (shown.size > 4) { const keep = [...shown].sort((p, q) => q.n - p.n).slice(0, 4); shown.clear(); keep.forEach((c) => shown.add(c)); } // les 4 plus gros bonus prêts ; les autres restent utilisables
    const locked = L.filter((r) => r.n > a.streak).slice(0, shown.size >= 4 ? 1 : 3); const cnt = (id) => a.rewards.filter((x) => x === id).length; const cards = L.map((r) => { const ready = shown.has(r); // un bonus prêt = une seule carte
      const seg = r.n - prev, got = Math.max(0, Math.min(seg, a.streak - prev)); prev = r.n;
      const next = !ready && a.streak < r.n && L.find((x) => x.n > a.streak) === r;
      return `<div class="sk${ready ? ' ready' : next ? ' next' : ''}${this.streakUsed === r.id ? ' used' : ''}">${ready ? `<span class="key">${this.input.label('streak')} ACTIVER</span>` : ''}<div class="ic">${svg(r.ico)}</div><div class="nm">${r.nom}${ready && cnt(r.id) > 1 ? ` ×${cnt(r.id)}` : ''}</div><div class="pips">${Array.from({ length: seg }, (_, i) => `<i class="${i < got || ready ? 'f' : ''}"></i>`).join('')}</div></div>`; }).filter((c, i) => { const r = L[i]; return shown.has(r) || locked.includes(r) || (this.streakUsed === r.id && r.n <= a.streak && !shown.size); });
    el.innerHTML = `<div class="count">${a.streak}<small>SÉRIE</small></div>` + cards.join(''); this.streakUsed = null;
  }
  medal(big, small, gold) { const el = $('medal'); if (!el) return; el.innerHTML = `<b>${svg(gold ? 'target' : 'skull')} ${big}</b><small>${small}</small>`; el.className = gold ? 'gold' : ''; void el.offsetWidth; el.classList.add('on'); clearTimeout(this._medT); this._medT = setTimeout(() => el.classList.remove('on'), 1600); }
  flashBody(t) { t.ch.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'corps') { o.material.emissive.set('#ffffff'); o.material.emissiveIntensity = 0.55; } }); t.flashT = 0.07; }
  hitmark(kill, head) { this.fb.marker(kill, head, false, false, 30); }
  toggleInv() {
    const el = $('inv'); const show = el.classList.contains('hidden'); el.classList.toggle('hidden', !show); if (!show) return;
    const a = this.player, card = (c, t, ...sm) => `<div class="card" style="--c:${c}"><b>${t}</b>${sm.map((x) => `<small>${x}</small>`).join('')}</div>`;
    const weapons = a.slots.map((w, i) => { const W = WEAPONS[w.id]; return card(RARITY[w.rarity].color, `${svg(W.ico)} ${W.name}${i === a.cur ? ' ' + svg('check') : ''}`, `<span style="color:${RARITY[w.rarity].color}">${RARITY[w.rarity].name}</span> · chargeur ${w.mag}/${W.mag}`, `Dégâts ${W.dmg}${W.pellets > 1 ? '×' + W.pellets : ''} · ${W.rps} coups/s`); });
    const K = classOf(a.team, a.cls);
    const gear = [card(TEAMS[a.team].color, `${svg(K.ico)} ${K.name} · ${K.role}`, `${K.perkName} : ${K.perkDesc}`), card('#888', `${svg(a.team === 'ordre' ? 'gas' : 'smoke')} ${a.team === 'ordre' ? 'Lacrymo' : 'Fumigène'} × ${a.nades} · ${svg('frag')} Grenade × ${a.frags ?? 0}`, `maintenir ${this.input.label('grenade')} pour viser`), (() => { const B = tierInfo(a); return card(B.T.col, `${svg('barricade')} Barricades ${a.walls ?? 3}/3 · ${B.T.mat[a.team]}`, a.walls < 3 ? `prochaine dans ${Math.ceil(a.wallT || 0)} s` : 'prêtes', B.next ? `${B.next.mat[a.team]} à ${B.next.need} galons (${fmtG(B.g)})` : 'béton débloqué', `${this.input.label('interact')} devant une barricade du camp : renforcer`); })(), card('#57b6ff', `${svg('vest')} Gilet ${Math.round(a.armor)}`, `santé ${Math.ceil(a.hp)}`)];
    const carried = a.bag.length ? a.bag.map((i) => card(RARITY[i.rarity].color, `${i.icon} ${i.nom}`, `<span style="color:${RARITY[i.rarity].color}">${RARITY[i.rarity].name}</span>${i.stolen ? ' · volé' : ''}`, `${fmt(i.valeur)} € · receleur ${fmt(this.recelPrice(i) * (a.team === 'ordre' ? 0.6 : 1))} €`)) : [card('#555', 'Les mains vides', 'Casse une vitrine de luxe et rapporte un objet')];
    const socs = this.socles[a.team], held = socs.filter((x) => x.item), inc = held.reduce((t, x) => t + x.item.valeur * 0.006, 0);
    const base = held.length ? held.map((x) => card(RARITY[x.item.rarity].color, `${x.item.icon} ${x.item.nom}`, `${fmt(x.item.valeur)} €${x.owner === a ? ' · à toi' : x.owner ? ' · ' + x.owner.name : ''}`)) : [card('#555', 'Rien d\'exposé', 'Dépose ton objet à la base : il rapporte chaque seconde')];
    const st = STREAKS[a.team].map((r) => card(a.rewards.includes(r.id) ? '#ffcc3d' : a.streak >= r.n ? '#9ff59f' : '#555', `${svg(r.ico)} ${r.nom} · ${r.n} élim.`, r.desc + (a.rewards.includes(r.id) ? ` · <b>prêt (${this.input.label('streak')})</b>` : '')));
    const sec = (t, arr) => `<h3 class="invh">${t}</h3><div class="invrow">${arr.join('')}</div>`;
    $('invList').innerHTML = sec('Armes', weapons) + sec('Équipement', gear) + sec('Objet porté', carried) + sec(`Planque · ${held.length}/${socs.length} · +${inc.toFixed(1)} €/s`, base) + sec(`Séries · actuelle ${a.streak}`, st);
  }
  updateHud() {
    const a = this.player, I = this.input;
    $('sc-ordre').textContent = this.score.ordre; $('sc-civils').textContent = this.score.civils;
    if (this.time > (this.rankT || 0)) { this.rankT = this.time + 0.5; this.drawRank(); }
    this.drawStreakbar();
    const left = Math.max(0, this.matchLen - this.time); $('timer').textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · premier à ${this.scoreLimit}`;
    for (const z of this.zoneState) { const el = $('z' + z.id); el.className = 'zone' + (z.owner ? ' ' + z.owner : '') + (z.contested || z.threat ? ' contested' : ''); const f = el.firstChild; f.style.height = (z.owner && z.cap === z.owner ? 100 : z.p * 100) + '%'; f.style.background = z.cap ? TEAMS[z.cap].color : 'transparent'; }
    $('cash').textContent = fmt(this.save.bank);
    this.incomeSmooth = lerp(this.incomeSmooth || 0, (this.incomeAcc || 0) * 10, 0.1); this.incomeAcc = 0;
    const inc = this.socles[a.team].reduce((s, x) => s + (x.owner === a && x.item ? x.item.valeur * 0.006 : 0), 0); $('income').textContent = inc ? `+${inc.toFixed(1)} €/s` : '';
    { const B = tierInfo(a); const k = `${a.walls ?? 3}|${a.walls < 3 && a.wallT > 0 ? Math.ceil(a.wallT) : ''}|${B.t}|${fmtG(B.g)}`; if (k !== this._matsK) { this._matsK = k; $('matsN').innerHTML = `${a.walls ?? 3}/3` + (a.walls < 3 && a.wallT > 0 ? ` · ${Math.ceil(a.wallT)} s` : '') + ` <span class="tier t${B.t}" style="color:${B.T.col}">${B.T.mat[a.team]}</span>` + (B.next ? `<small class="gal"><i style="width:${Math.min(100, (B.g - B.T.need) / (B.next.need - B.T.need) * 100).toFixed(0)}%;background:${B.next.col}"></i></small>` : ''); } }
    $('bagkg').textContent = a.bag.length ? `${a.bag[0].nom} · ${fmt(a.bag[0].valeur)} €` : 'les mains vides';
    $('bagitems').innerHTML = a.bag.map((i) => `<span style="--c:${RARITY[i.rarity].color}" title="${i.nom}">${i.icon}</span>`).join('');
    $('hpbar').style.width = Math.max(0, a.hp) + '%'; $('hpn').textContent = Math.max(0, Math.ceil(a.hp)); $('armorbar').style.width = Math.min(100, a.armor) + '%';
    $('weapons').innerHTML = a.slots.map((s, i) => `<div class="${i === a.cur ? 'on' : ''}" style="--c:${RARITY[s.rarity].color}"><em>${svg(WEAPONS[s.id].ico)}</em>${WEAPONS[s.id].name}</div>`).join('') + `<div class="thr" style="--c:#888"><em>${svg(a.team === 'ordre' ? 'gas' : 'smoke')}<small>${a.nades}</small>${svg('frag')}<small>${a.frags ?? 0}</small></em>${I.label('grenade')} lancer</div>`;
    const W = this.weapon(a); if (W) { $('mag').textContent = a.reloadT > 0 ? '…' : W.mag; $('reserve').textContent = `/ ${WEAPONS[W.id].mag}`; $('wname').textContent = `${WEAPONS[W.id].name.toUpperCase()} · ${RARITY[W.rarity].name.toUpperCase()}`; $('wname').style.color = RARITY[W.rarity].color; }
    const pr = $('prompt'); if (this.ui.prompt && a.alive) { pr.innerHTML = this.ui.prompt; pr.classList.add('on'); } else pr.classList.remove('on');
    const ch = $('channel'); if (a.channel) { ch.classList.add('on'); ch.querySelector('i').style.width = (a.channel.t / a.channel.dur * 100) + '%'; ch.querySelector('span').textContent = a.channel.label; } else ch.classList.remove('on');
    const car = $('car'); if (a.inCar) { car.classList.add('on'); $('kmh').textContent = Math.round(Math.abs(a.inCar.speed) * 3.6); $('carhp').style.width = (a.inCar.hp / a.inCar.maxHp * 100) + '%'; this.heliHud(a.inCar); } else car.classList.remove('on');
    // réticule : s'ouvre avec la dispersion
    const D = W ? WEAPONS[W.id] : null; const sp = this.feetSpeed(a);
    const gap = D ? 4 + D.spread * 260 * (sp > 2 ? 1.6 : 1) * (this.aiming ? (this.cam.fps ? 0.1 : 0.18) : 1) * (a.onGround ? 1 : 1.8) + (this.ui.crossKick || 0) * 8 : 6; this.ui.crossKick = 0;
    $('cross').style.setProperty('--g', gap.toFixed(1) + 'px'); $('cross').style.display = (this.cam.fps && this.aiming && D?.scope) || (a.inCar && a.inCar.kind !== 'heli') ? 'none' : '';
    // aide en bas de l'écran : selon le contexte (à pied, en véhicule, en visée) et le périphérique
    const kk = `${I.st.usingPad ? 1 : 0}|${a.inCar ? (a.inCar.kind || 'car') : ''}|${this.aiming && D?.scope ? 's' : ''}|${a.team}`;
    if (kk !== this._keysK) { this._keysK = kk; const P = I.st.usingPad, k = (x) => `<kbd>${x}</kbd>`;
      $('keys').innerHTML = a.inCar?.kind === 'heli'
        ? (P ? `${k('✕')} monter · ${k('○')} descendre · ${k('L3')} turbo · ${k('R2')} mitrailleuse · ${k('R1')} arsenal · ${k('→')} changer · ${k('□')} sortir`
          : `${k('Espace')} monter · ${k('Ctrl')}${k('C')} descendre · ${k('Maj')} turbo · ${k('Clic')} mitrailleuse · ${k('G')} arsenal · ${k('X')} changer · ${k('F')} sortir`)
        : a.inCar
        ? (P ? `${k('R2')} accélérer · ${k('L2')} freiner · ${k('✕')} ${a.inCar.kind === 'skate' ? 'ollie' : 'frein à main'} · ${k('□')} descendre${a.inCar.kind === 'skate' ? '' : ` · ${k('↓')} klaxon`}`
          : `${k('Z')}${k('S')} avancer / freiner · ${k('Espace')} ${a.inCar.kind === 'skate' ? 'ollie' : 'frein à main'} · ${k('F')} descendre${a.inCar.kind === 'skate' ? '' : ` · ${k('H')} klaxon`}`)
        : this.aiming && D?.scope
          ? (P ? `${k('R3')} zoom ×4 / ×8 · ${k('L3')} retenir son souffle · ${k('R2')} tirer` : `${k('Molette')} zoom ×4 / ×8 · ${k('Maj')} retenir son souffle · ${k('Clic')} tirer`)
          : (P ? `${k('□')} agir · ${k('R1')} maintenir : lancer · ${k('→')} série · ${k('↓')} barricade · ${k('L1')} accroupi · ${k('○')} roulade · ${k('R3')} vue · ${k('SHARE')} sac`
            : `${k('E')} agir · ${k('F')} véhicule · ${k('G')} maintenir : lancer · ${k('X')} série · ${k('Q')} barricade · ${k('C')} accroupi · ${k('Ctrl')} roulade · ${k('V')} vue · ${k('Tab')} sac`); }
  }
  // classement provisoire : gros compteur, rang, 3 au-dessus / 3 en dessous, contribution
  drawRank() {
    const a = this.player, el = $('rank'); if (!el) return;
    const all = this.actors.filter((x) => !x.temp || !x.gone).sort((p, q) => contrib(q) - contrib(p) || q.stats.k - p.stats.k || (p === a ? -1 : q === a ? 1 : 0));
    const i = all.indexOf(a), from = Math.max(0, Math.min(i - 3, all.length - 7)), rows = all.slice(from, from + 7);
    const esc = (t) => String(t).replace(/[<&]/g, '');
    const next = streakTiers(a.team, a.streak).find((r) => r.n > a.streak);
    const ready = a.rewards.length ? `<span class="rdy">${svg(this.streakDef(a, a.rewards[a.rewards.length - 1]).ico)} ${this.streakDef(a, a.rewards[a.rewards.length - 1]).nom} · ${this.input.label('streak')}</span>` : '';
    el.innerHTML = `<div class="top"><div class="kills">${svg('skull')} ${a.stats.k}<small>ÉLIM.</small></div><div class="pos">#${i + 1}<small>SUR ${all.length}</small></div></div>`
      + `<div class="sub"><span>Assist. <b>${a.stats.a}</b></span><span>Captures <b>${a.stats.cap}</b></span><span>Saccage <b>${a.stats.sac}</b></span></div>`
      + `<table>${rows.map((x, j) => `<tr class="${x.team === 'ordre' ? 'o' : 'c'}${x === a ? ' me' : ''}"><td class="n">${from + j + 1}</td><td class="nm">${esc(x.name)}</td><td class="k">${x.stats.k}</td><td class="p">${fmt(contrib(x))}</td></tr>`).join('')}</table>`
      + `<div class="streak">Série <b>${a.streak}</b>${next ? ` · ${svg(next.ico)} ${next.nom} à ${next.n}` : ''} ${ready}</div>`;
  }
  minimapInit() {
    const W = this.world, B = W.bounds; const c = document.createElement('canvas'); const S = 4; c.width = (B.x1 - B.x0) * S; c.height = (B.z1 - B.z0) * S;
    const g = c.getContext('2d'); g.scale(S, S); g.translate(-B.x0, -B.z0);
    g.fillStyle = '#5a5f6b'; g.fillRect(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0); // chaussée
    const poly = (p) => { g.beginPath(); p.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); };
    const sn = W.gp.seine; if (sn?.eau) { g.fillStyle = '#2f5d7c'; poly(sn.eau.poly); g.fill(); g.fillStyle = '#9c927c'; for (const pt of sn.ponts || []) { poly(pt.poly); g.fill(); } }
    // trottoirs et places (plateformes au sol), puis immeubles avec ombre portée et liseré
    for (const p of W.plats) { g.fillStyle = p.y > 1 ? '#b7ad97' : '#8d8a84'; poly(p.poly); g.fill(); }
    for (const col of W.colliders) if (col.type === 'poly' && col.tag === 'terrasse') { g.fillStyle = '#a99e86'; poly(col.poly); g.fill(); }
    g.save(); g.translate(0.8, 0.8); g.fillStyle = 'rgba(0,0,0,.35)'; for (const col of W.colliders) if (col.type === 'poly' && col.tag !== 'terrasse' && (col.y0 || 0) + col.h > -0.5) { poly(col.poly); g.fill(); } g.restore();
    for (const col of W.colliders) if (col.type === 'poly' && col.tag !== 'terrasse' && (col.y0 || 0) + col.h > -0.5) { g.fillStyle = '#e8dcc0'; g.strokeStyle = '#a4977a'; g.lineWidth = 0.5; poly(col.poly); g.fill(); g.stroke(); }
    for (const col of W.colliders) if (col.type !== 'poly' && (col.y0 || 0) + col.h > -0.5) {
      const t = col.tag || ''; if (/lampadaire|potelet|candelabre|feu|colonnette/.test(t)) continue;
      g.fillStyle = t === 'arbre' || t === 'haie' || t === 'jardiniere' ? '#5f9b3c' : t === 'voiture' || t === 'fourgon' ? '#3a3e48' : '#6c6a66';
      if (col.type === 'circle') { g.beginPath(); g.arc(col.x, col.z, Math.max(col.r, t === 'arbre' ? 1.6 : 0.4), 0, 7); g.fill(); } else { g.save(); g.translate(col.x, col.z); g.rotate(-col.yaw); g.fillRect(-col.hx, -col.hz, col.hx * 2, col.hz * 2); g.restore(); }
    }
    this.mmBase = c; this.mm = $('minimap').querySelector('canvas'); this.mmS = S;
  }
  drawMinimap() {
    const cv = this.mm; if (!cv) return; const W = this.world, B = W.bounds; const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
    const g = cv.getContext('2d'); const me = this.player; const big = $('minimap').classList.contains('big');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#3d4250'; g.fillRect(0, 0, cv.width, cv.height);
    let k, rot = 0, sc = 1; // pixels par mètre
    if (big) { k = Math.min(cv.width / (B.x1 - B.x0), cv.height / (B.z1 - B.z0)); g.setTransform(k, 0, 0, k, (cv.width - (B.x1 - B.x0) * k) / 2 - B.x0 * k, (cv.height - (B.z1 - B.z0) * k) / 2 - B.z0 * k); sc = 1.3; }
    else { k = cv.width / 70; rot = -Math.PI / 2 - Math.atan2(Math.cos(this.cam.yaw), Math.sin(this.cam.yaw)); g.translate(cv.width / 2, cv.height / 2); g.rotate(rot); g.scale(k, k); g.translate(-me.pos.x, -me.pos.z); sc = 0.9; }
    if (big) g.drawImage(this.mmBase, B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    else { // seulement le morceau autour du joueur (rayon 52 m)
      const R = 52, S = this.mmS, x0 = Math.max(B.x0, me.pos.x - R), z0 = Math.max(B.z0, me.pos.z - R), x1 = Math.min(B.x1, me.pos.x + R), z1 = Math.min(B.z1, me.pos.z + R);
      if (x1 > x0 && z1 > z0) g.drawImage(this.mmBase, (x0 - B.x0) * S, (z0 - B.z0) * S, (x1 - x0) * S, (z1 - z0) * S, x0, z0, x1 - x0, z1 - z0);
    }
    // icônes à l'endroit malgré la rotation de la carte
    const icon = (txt, x, z, size) => { g.save(); g.translate(x, z); g.rotate(-rot); g.font = `${size * sc}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore(); };
    for (const z of this.zoneState) {
      g.globalAlpha = z.contested ? 0.35 + Math.abs(Math.sin(this.time * 6)) * 0.4 : 0.45; g.fillStyle = z.owner ? TEAMS[z.owner].color : '#fff'; g.beginPath(); g.arc(z.center[0], z.center[1], z.radius, 0, 7); g.fill(); g.globalAlpha = 1;
      g.lineWidth = 0.8; g.strokeStyle = z.cap && z.cap !== z.owner ? TEAMS[z.cap].color : '#fff'; g.beginPath(); g.arc(z.center[0], z.center[1], z.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (z.owner && z.cap === z.owner ? 1 : z.p)); g.stroke();
      g.save(); g.translate(z.center[0], z.center[1]); g.rotate(-rot); g.fillStyle = '#111'; g.font = `900 ${7 * sc}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(z.id, 0, 0); g.restore();
    }
    for (const s of this.shops) { g.globalAlpha = this.shopItems(s).length ? 1 : 0.35; icon(s.gamme === 'luxe' ? '💎' : '🛍️', s.front.x, s.front.z, 6); } g.globalAlpha = 1;
    icon('💰', this.recel.pos.x, this.recel.pos.z, 7);
    for (const t of ['ordre', 'civils']) for (const s of this.socles[t]) if (s.item) { g.fillStyle = RARITY[s.item.rarity].color; g.fillRect(s.pos.x - 0.8, s.pos.z - 0.8, 1.6, 1.6); }
    for (const d of this.drops) { g.fillStyle = '#ffcc3d'; g.beginPath(); g.arc(d.pos.x, d.pos.z, 0.9, 0, 7); g.fill(); }
    for (const c of this.cars) if (!c.dead) { g.save(); g.translate(c.pos.x, c.pos.z); g.rotate(-c.yaw); g.fillStyle = c.driver ? (c.driver.team === 'ordre' ? '#3d8bff' : '#34c759') : '#ddd'; g.fillRect(-c.W / 2, -c.L / 2, c.W, c.L); g.restore(); }
    for (const c of this.fx.clouds) { g.globalAlpha = 0.4; g.fillStyle = c.kind === 'gas' ? '#e8e6cf' : '#ff4fa0'; g.beginPath(); g.arc(c.pos.x, c.pos.z, c.r, 0, 7); g.fill(); g.globalAlpha = 1; }
    // tirs ennemis récents
    for (const p of this.pings || []) { const age = this.time - p.t; if (age > 2 || !p.enemy) continue; g.globalAlpha = 1 - age / 2; g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(p.x, p.z, 1.6, 0, 7); g.fill(); } g.globalAlpha = 1;
    for (const a of this.actors) { if (!a.alive || a === me) continue; const ally = a.team === me.team; if (!ally && this.time - (a.spotted || -99) > 3 && !((a.spotMark || 0) > this.time) && a.pos.distanceTo(me.pos) > 12) continue; g.fillStyle = ally ? TEAMS[a.team].color : '#ff2b2b'; g.strokeStyle = '#000'; g.lineWidth = 0.3; g.beginPath(); g.arc(a.pos.x, a.pos.z, (a.bag.some((i) => i.stolen) ? 1.6 : 1.1) * sc, 0, 7); g.fill(); g.stroke(); }
    // joueur : flèche (toujours vers le haut en mode boussole)
    g.save(); g.translate(me.pos.x, me.pos.z); g.rotate(-this.cam.yaw); g.scale(sc, sc); g.fillStyle = '#ffe04a'; g.strokeStyle = '#000'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(0, 2.8); g.lineTo(1.8, -1.8); g.lineTo(0, -0.8); g.lineTo(-1.8, -1.8); g.closePath(); g.fill(); g.stroke(); g.restore();
    if (!big) { // nord sur le bord
      g.setTransform(1, 0, 0, 1, 0, 0); const r = cv.width / 2 - 14; const nx = cv.width / 2 + Math.sin(-rot + Math.PI) * 0, ang = rot - Math.PI / 2; const x = cv.width / 2 + Math.cos(ang) * r, y = cv.height / 2 + Math.sin(ang) * r;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); g.fillStyle = '#ff5a4a'; g.font = '900 16px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', x, y + 1);
    }
  }
}
Object.assign(Game.prototype, rideMethods);
Object.assign(Game.prototype, heliMethods);
function lerp_angle(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
installThrows(Game);
installSeries(Game);
installBarricades(Game);
installLanceurs(Game); // après les barricades : complète this.blast (vitrines)
