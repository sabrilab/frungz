// Mode Zombies (« Frungz Zombie ») : survie par vagues contre des morts-vivants, sur n'importe quelle carte.
//
// Le mode ne connaît aucune carte : tout vient de ce que chaque carte décrit déjà (gameplay.json + World).
//  - grille de navigation (world.nav) et ses composantes connexes (world.comp) : où un zombie peut marcher et s'il peut
//    rejoindre les survivants ;
//  - zones de Domination : la plus centrale sert de refuge de départ aux survivants ;
//  - points d'apparition des deux camps, parkings, portes des boutiques et cases libres tirées au hasard : où naissent
//    les zombies (loin des survivants, de préférence hors de leur vue).
// Une nouvelle carte au même format a donc son mode Zombies sans rien faire. Réglages facultatifs dans son gameplay.json :
//   "zombie": { "refuge": [x, z], "spawns": [[x, z], …], "eviter": [[x0, z0, x1, z1], …], "max": 24 }
//
// Les survivants : toi et trois équipiers IA de ton camp (Brigade ou Frungz, ton équipe du salon si tu en as une).
// Mort pendant une vague : tu reviens au début de la suivante si un équipier tient encore. Tout le monde à terre : fin.
// Zombies : modèles et animations Mixamo (public/assets/zombies, voir tools/zombies). Ce sont des acteurs comme les autres
// (même liste, mêmes tirs, dégâts, séries, tourelles, voitures), avec leur propre corps, leur IA et leur animation.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGLB } from './world.js';
import { WEAPONS, TEAMS, CLASSES } from './data.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const ENEMY = { ordre: 'civils', civils: 'ordre' };
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const _hp = new THREE.Vector3();
const BONE = '#e9e2cf', BLOOD = '#d2301f', TOXIC = '#9bd13a';

// ------------------------------------------------------------------------------------------------ types de zombies
// walk / run : vitesses (m/s) tirées au hasard ; dmg : coup de base (monte avec les vagues) ; reach : allonge ; cd : délai entre deux coups
export const ZTYPES = {
  rodeur: { nom: 'Rôdeur', models: ['rodeur', 'femme', 'decharne', 'policier', 'soldat'], hp: 110, armor: 0, walk: [0.55, 0.95], dmg: 17, reach: 1.45, cd: [1.0, 1.5], attacks: ['z_attack', 'z_punch', 'z_headbutt', 'z_kick', 'z_bite'] },
  coureur: { nom: 'Coureur', models: ['soldat', 'femme', 'rodeur', 'decharne'], hp: 85, armor: 0, walk: [0.8, 1], run: [4.3, 5.4], dmg: 13, reach: 1.35, cd: [0.8, 1.2], attacks: ['z_punch', 'z_attack', 'z_headbutt'] },
  blinde: { nom: 'Blindé', models: ['policier', 'soldat'], hp: 170, armor: 90, walk: [0.75, 1.05], dmg: 24, reach: 1.5, cd: [1.1, 1.5], attacks: ['z_attack', 'z_punch', 'z_kick'] },
  contamine: { nom: 'Contaminé', models: ['contamine'], hp: 150, armor: 0, walk: [0.95, 1.3], dmg: 15, reach: 1.4, cd: [1.1, 1.4], attacks: ['z_attack', 'z_punch'], burst: { r: 4.4, dmg: 75 } },
  mastodonte: { nom: 'Mastodonte', models: ['mastodonte'], hp: 2600, armor: 0, walk: [1.5, 1.7], run: [5.6, 5.6], dmg: 42, reach: 2.6, cd: [1.6, 2.2], attacks: ['z_attack', 'z_punch'], boss: true, hitR: 0.8, hitTop: 2.55 },
};
const MODEL_IDS = ['rodeur', 'policier', 'femme', 'soldat', 'contamine', 'decharne', 'mastodonte'];
const ONESHOT = new Set(['z_attack', 'z_punch', 'z_bite', 'z_headbutt', 'z_kick', 'z_hit', 'z_death', 'z_scream', 'z_standup', 'z_jump']);
const HUMANOID_H = 1.8;

// ------------------------------------------------------------------------------------------------ chargement (à la demande)
const LIB = {}; let loading = null;
export const zombiesReady = () => !!(LIB.rodeur || Object.keys(LIB).some((k) => k !== 'mastodonte'));
export function loadZombies(onProgress) {
  if (loading) return loading;
  let done = 0;
  loading = Promise.all(MODEL_IDS.map(async (id) => {
    try { LIB[id] = prepModel(id, await loadGLB(`assets/zombies/${id}.glb`)); } catch (e) { console.warn('[zombies] modèle indisponible :', id, e?.message || e); }
    onProgress?.(++done / MODEL_IDS.length);
  })).then(() => { if (!zombiesReady()) { loading = null; throw new Error('modèles de zombies introuvables'); } return LIB; });
  return loading;
}
function prepModel(id, g) {
  const scene = g.scene; const ud = { ...(scene.userData || {}) }; scene.traverse((o) => { if (o !== scene && o.userData && (o.userData.kind || o.userData.stride)) Object.assign(ud, o.userData); });
  const box = new THREE.Box3().setFromObject(scene); const height = ud.height || Math.max(1, box.max.y - box.min.y);
  scene.traverse((o) => {
    if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
    // une animation peut sortir le corps de sa boîte de repos (chute, ramper) : on agrandit la sphère de découpage
    const geo = o.geometry; if (!geo.boundingSphere) geo.computeBoundingSphere(); geo.boundingSphere.radius = Math.max(geo.boundingSphere.radius * 1.4, height * 0.9);
    for (const m of [].concat(o.material)) { m.envMapIntensity = 0.6; if (m.map) m.map.anisotropy = 4; }
  });
  const clips = {}; for (const c of g.animations || []) clips[c.name] = c;
  return { id, scene, clips, height, stride: ud.stride || {}, hit: ud.hit || {} };
}
function modelFor(type) {
  const T = ZTYPES[type]; const ok = T.models.filter((m) => LIB[m]); if (ok.length) return pick(ok);
  const any = MODEL_IDS.filter((m) => LIB[m] && m !== 'mastodonte'); return pick(any.length ? any : Object.keys(LIB));
}
// corps : un clone du modèle (squelette à lui), matières copiées (teinte propre, éclair blanc de touche sans toucher les autres)
function makeBody(mid, type) {
  const L = LIB[mid]; const model = cloneSkinned(L.scene); const bones = {}, meshes = [];
  const shade = rnd(0.82, 1.04), green = type === 'contamine';
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return; meshes.push(o);
    const mats = [].concat(o.material).map((m) => { const n = m.clone(); n.color?.multiplyScalar(shade); if (green && n.emissive) { n.emissive.set('#3f6f12'); n.emissiveIntensity = 0.25; } return n; });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  // flashBody (game.js) cherche un SkinnedMesh « corps » à matière unique
  if (!meshes.some((m) => m.name === 'corps' && !Array.isArray(m.material))) { const s = meshes.find((m) => m.isSkinnedMesh && !Array.isArray(m.material)); if (s) s.name = 'corps'; else meshes.forEach((m) => { if (m.name === 'corps') m.name = 'corps_'; }); }
  const root = new THREE.Group(); root.add(model);
  const mixer = new THREE.AnimationMixer(model); const actions = {};
  for (const [name, clip] of Object.entries(L.clips)) { const act = mixer.clipAction(clip); if (ONESHOT.has(name)) { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = name === 'z_death' || name === 'z_standup'; } actions[name] = act; }
  if (actions.z_death) actions.Death = actions.z_death; // game.kill → deathAnim → 'Death'
  for (const n of ['z_idle', 'z_walk', 'z_run']) if (actions[n]) { actions[n].play(); actions[n].setEffectiveWeight(0); }
  return { root, model, mixer, actions, bones, meshes, mid, L };
}

// ------------------------------------------------------------------------------------------------ installation dans Game
export function installZombie(Game) {
  const P = Game.prototype; const wrap = (name, fn) => { const orig = P[name]; P[name] = function (...args) { return fn.call(this, orig, ...args); }; };
  const on = (g) => g.opts?.mode === 'zombie' && !g.opts?.training;

  wrap('build', function (orig, ...args) {
    if (!on(this)) return orig.apply(this, args);
    // la partie normale sans adversaires ni zones : le joueur seul, puis ses équipiers et la horde
    this.opts.teamSize = 0; this.opts.friends = []; this.zoneState = []; this.scoreLimit = Infinity;
    const squad = this.opts.squad || []; this.opts.squad = [];
    const r = orig.apply(this, args);
    this.matchLen = Infinity; this.specialT = Infinity; this.zm = new Horde(this, squad); return r;
  });
  for (const n of ['buildBases', 'buildZones']) wrap(n, function (orig, ...a) { if (!on(this)) return orig.apply(this, a); });
  wrap('buildReceleur', function (orig, ...a) { if (!on(this)) return orig.apply(this, a); this.recel = { pos: V(0, -999, 0), r: 0, prix: {}, bonus: {}, nom: '' }; });
  wrap('announce', function (orig, big, ...a) { if (this.zm && big === 'DOMINATION') return; return orig.call(this, big, ...a); });
  wrap('update', function (orig, dt, bg) { orig.call(this, dt, bg); if (this.zm && !(this.paused && !bg)) this.zm.update(dt); });
  wrap('updateHud', function (orig, ...a) { orig.apply(this, a); this.zm?.hud(); });
  wrap('interactions', function (orig, a, dt) { orig.call(this, a, dt); if (this.zm && a === this.player) this.zm.interact(a); });
  wrap('endMatch', function (orig, ...a) { if (!this.zm) return orig.apply(this, a); this.zm.gameOver(); });
  // zombies : leur propre corps (pas de parkour, pas d'armes) et leur propre IA
  wrap('updateActor', function (orig, a, dt) { if (a.zed) return this.zm?.move(a, dt); return orig.call(this, a, dt); });
  wrap('updateBot', function (orig, b, dt) { if (b.zed) return this.zm?.think(b, dt); return orig.call(this, b, dt); });
  wrap('respawn', function (orig, a, first) { if (a.zed) return; orig.call(this, a, first); this.zm?.placed(a, first); });
  wrap('botDecide', function (orig, b) { if (!on(this)) return orig.call(this, b); if (this.zm && !b.zed) this.zm.escort(b); });
  wrap('damage', function (orig, t, amount, by, opts = {}) {
    const Z = this.zm; if (!Z) return orig.call(this, t, amount, by, opts);
    if (by?.zed && t.zed) return; // les zombies ne se battent pas entre eux
    const hp0 = t.hp; orig.call(this, t, amount, by, opts);
    if (t.zed) Z.hurt(t, hp0 - Math.max(0, t.hp), by, opts); else if (by?.zed && t.alive) Z.hitHuman(t, by);
  });
  wrap('kill', function (orig, t, by, opts) {
    const Z = this.zm; if (!Z) return orig.call(this, t, by, opts);
    if (t.zed) { // râle de zombie au lieu du cri humain
      const au = this.audio, play = au.play; au.play = (n, p, v, r, gap) => (n === 'voxDie' ? play('voxDie', p, 0.85, [0.5, 0.62], gap) : play(n, p, v, r, gap));
      try { orig.call(this, t, by, opts); } finally { au.play = play; }
    } else orig.call(this, t, by, opts);
    Z.died(t, by, opts);
  });
  // seuls les zombies tués par toi (ou ceux qui te tuent) passent dans le fil, sinon il défile sans fin
  wrap('killFeed', function (orig, by, t, opts) { if (this.zm && t.zed && by !== this.player) return; return orig.call(this, by, t, opts); });
  // flash info : seulement les sujets du mode Zombies (pas d'arrestations ni de prises de zones)
  wrap('newsPush', function (orig, st) { if (this.zm !== undefined && this.opts?.mode === 'zombie' && !st.zm) return; return orig.call(this, st); });
  wrap('newsInit', function (orig, ...a) { orig.apply(this, a); if (on(this) && this.news) { this.news.queue = this.news.queue.filter((q) => q.zm); this.zm?.newsOpen(); } });
  wrap('notoAdd', function (orig, a, n) { if (a?.zed) return; return orig.call(this, a, n); });
}

// ------------------------------------------------------------------------------------------------ la horde
const SQUAD_NAMES = { ordre: ['Brigadier Lenoir', 'Gardienne Diallo', 'Major Kessler'], civils: ['Nadia', 'Yanis', 'Sacha'] };
const WAVE_PAUSE = 20, FIRST_PAUSE = 9;

class Horde {
  constructor(g, squad) {
    this.g = g; this.team = g.player.team; this.zteam = ENEMY[this.team]; this.cfg = g.world.gp.zombie || {};
    this.wave = 0; this.state = 'pause'; this.t = FIRST_PAUSE; this.toSpawn = 0; this.spawnT = 0; this.bossLeft = 0;
    this.kills = 0; this.heads = 0; this.points = 0; this.zeds = []; this.bigs = []; this.corpses = []; this.toxic = [];
    this.max = Math.min(this.cfg.max || 99, g.opts.zmax || 22); this.pathBudget = 0; this.hpMul = this.dmgMul = this.spdMul = 1; this.over = false; this.nextHud = 0; this.groanT = 0;
    this.best = g.save.zBest?.[window.__map || 'carte'] || 0; this.waveKills = 0; this.waveStartT = 0;
    this.setupNav();
    // survivants : toi + 3 équipiers (ton équipe du salon, sinon des équipiers par défaut)
    const T = this.team, skins = TEAMS[T].skins;
    for (let k = 0; k < 3; k++) { const m = squad[k]; const b = g.spawnActor(T, m?.skin && skins.includes(m.skin) ? m.skin : skins[(k + 1) % skins.length], true, m?.name || SQUAD_NAMES[T][k]); b.squad = true; b.marker && (b.marker.visible = true); g.respawn(b, true); this.placed(b, true); }
    this.placed(g.player, true);
    // ambiance : brume, son de ville coupé, nappe sourde
    const S = g.scene, f = S.fog; this.fog0 = { c: f.color.clone(), near: f.near, far: f.far, exp: g.renderer.toneMappingExposure };
    this.applyAtmo(); g.audio.zAmbience?.(true);
    document.body.classList.add('zombie'); this.hudInit(); this.drawHud();
    g.announce('FRUNGZ ZOMBIE', `${this.where()} · tenez le plus de vagues possible`, BONE, 3.5);
    g.toast('Le quartier est en quarantaine : restez groupés', BONE);
  }
  where() { return { paris: 'Place Frungz', banlieue: 'Les Hauts de Frungz' }[window.__map] || 'Le quartier'; }
  lieu() { return { paris: 'place Frungz', banlieue: 'aux Hauts de Frungz' }[window.__map] || 'dans le quartier'; }
  humans() { return this.g.actors.filter((a) => !a.zed && !a.gone && a.team === this.team); }
  aliveHumans() { const g = this.g; if (this._hsT === g.time && this._hsN === g.actors.length) return this._hs; this._hsT = g.time; this._hsN = g.actors.length; return (this._hs = g.actors.filter((a) => !a.zed && !a.gone && a.alive && a.team === this.team)); }

  // ---------------------------------------------------------------- carte : refuge et points d'apparition (génériques)
  setupNav() {
    const W = this.g.world, N = W.nav, comp = W.comp, B = W.bounds; const idx = (x, z) => { const [i, j] = W.cell(x, z); return j * N.nx + i; };
    // la plus grande composante de la grille : là où tout le monde peut se rejoindre
    const count = new Map(); for (let k = 0; k < comp.length; k++) if (comp[k]) count.set(comp[k], (count.get(comp[k]) || 0) + 1);
    let main = 0, mc = 0; for (const [id, n] of count) if (n > mc) { mc = n; main = id; } this.comp = main;
    const okAt = (x, z) => { const [i, j] = W.cell(x, z); if (!W.free(i, j) || comp[j * N.nx + i] !== main) return false; const y = W.groundY(x, z); if (y < -2 || y > 12) return false; for (const r of this.cfg.eviter || []) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return false; return true; };
    this.okAt = okAt;
    // refuge : réglage de la carte, sinon la zone de Domination la plus proche du centre des zones, sinon le centre de la carte
    let rf = this.cfg.refuge;
    if (!rf) { const zs = (W.zones || []).filter((z) => !z.souterraine && !z.optionnelle); const L = zs.length ? zs : W.zones || []; if (L.length) { const cx = L.reduce((s, z) => s + z.center[0], 0) / L.length, cz = L.reduce((s, z) => s + z.center[1], 0) / L.length; rf = L.slice().sort((p, q) => Math.hypot(p.center[0] - cx, p.center[1] - cz) - Math.hypot(q.center[0] - cx, q.center[1] - cz))[0].center; } else rf = [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2]; }
    let r = [rf[0], rf[1]]; if (!okAt(r[0], r[1])) { let best = null, bd = 1e9; for (let k = 0; k < 3000; k++) { const x = rf[0] + rnd(-40, 40), z = rf[1] + rnd(-40, 40); if (okAt(x, z)) { const d = Math.hypot(x - rf[0], z - rf[1]); if (d < bd) { bd = d; best = [x, z]; } } } if (best) r = best; }
    this.refuge = r;
    // points d'apparition des zombies
    const pts = []; const add = (x, z) => { if (Number.isFinite(x) && Number.isFinite(z) && okAt(x, z)) pts.push([x, z]); };
    if (this.cfg.spawns?.length) for (const [x, z] of this.cfg.spawns) add(x, z);
    else {
      for (const t of ['ordre', 'civils']) for (const s of W.spawns?.[t] || []) add(s.x, s.z);
      const gp = W.gp; for (const p of gp.parkings || []) add(p.x + rnd(-2, 2), p.z + rnd(-2, 2));
      for (const b of gp.boutiques || []) if (b.porte?.pos) add(b.porte.pos[0] + Math.sin(b.porte.yaw || 0) * 2, b.porte.pos[2] + Math.cos(b.porte.yaw || 0) * 2);
      for (const z of W.zones || []) add(z.center[0] + rnd(-4, 4), z.center[1] + rnd(-4, 4));
      for (let k = 0; k < 1400 && pts.length < 700; k++) add(rnd(B.x0 + 2, B.x1 - 2), rnd(B.z0 + 2, B.z1 - 2));
    }
    // dédoublonnage sur une grille de 3 m
    const seen = new Set(); this.spawnPts = pts.filter(([x, z]) => { const k = `${Math.round(x / 3)},${Math.round(z / 3)}`; if (seen.has(k)) return false; seen.add(k); return true; });
    if (!this.spawnPts.length) this.spawnPts = [[r[0] + 30, r[1]], [r[0] - 30, r[1]]];
  }
  // survivants : au refuge au départ, sinon près d'un équipier encore debout
  placed(a, first) {
    if (a.zed || a.team !== this.team || !this.refuge) return; const g = this.g, W = g.world;
    const mate = !first && this.aliveHumans().find((h) => h !== a); const c = mate ? [mate.pos.x, mate.pos.z] : this.refuge;
    let x = c[0], z = c[1]; for (let k = 0; k < 30; k++) { const tx = c[0] + rnd(-3.5, 3.5), tz = c[1] + rnd(-3.5, 3.5); if (this.okAt(tx, tz)) { x = tx; z = tz; break; } }
    a.pos.set(x, W.groundY(x, z, (mate ? mate.pos.y : 2) + 1.5), z); a.vel.set(0, 0, 0); a.yaw = Math.atan2(x - c[0], z - c[1]) || rnd(0, 6.28); a.spawnProt = 3;
    if (a === g.player) { g.cam.yaw = a.yaw; g.cam.snap = true; }
  }

  // ---------------------------------------------------------------- vagues
  composition(w) {
    const n = Math.round(7 + w * 3.6 + w * w * 0.32);
    const share = { coureur: w >= 2 ? Math.min(0.34, 0.06 + (w - 2) * 0.05) : 0, blinde: w >= 4 ? Math.min(0.2, (w - 3) * 0.035) : 0, contamine: w >= 3 ? Math.min(0.14, 0.05 + (w - 3) * 0.015) : 0 };
    return { n, share, boss: w % 5 === 0 ? Math.max(1, Math.floor(w / 5)) : w > 12 && w % 5 === 3 ? 1 : 0 };
  }
  startWave() {
    const g = this.g; this.wave++; const C = this.composition(this.wave);
    this.toSpawn = C.n; this.share = C.share; this.bossLeft = C.boss; this.bossAt = C.boss ? Math.floor(C.n * 0.35) : -1; this.spawned = 0; this.waveKills = 0; this.waveTotal = C.n + C.boss;
    this.hpMul = 1 + (this.wave - 1) * 0.13 + Math.max(0, this.wave - 10) * 0.08; this.dmgMul = 1 + (this.wave - 1) * 0.045; this.spdMul = 1 + Math.min(0.5, (this.wave - 1) * 0.035);
    this.state = 'wave'; this.spawnT = 0.5; this.waveStartT = g.time; this.crate?.remove?.();
    g.announce(`VAGUE ${this.wave}`, this.wave === 1 ? 'Ils arrivent…' : C.boss ? 'Quelque chose d\'énorme approche' : pick(['Ils arrivent…', 'Tenez la position', 'Restez groupés', 'Ça grouille dans les rues']), BLOOD, 3);
    g.audio.zWave?.(this.wave, true); g.cam.trauma = Math.min(1, g.cam.trauma + 0.15);
    if (this.wave > 1 && this.wave % 3 === 1) this.news('wave');
    this.drawHud();
  }
  endWave() {
    const g = this.g; this.state = 'pause'; this.t = WAVE_PAUSE; const bonus = 150 + this.wave * 90;
    g.earn(bonus, `Vague ${this.wave} repoussée`, true); this.points += bonus;
    g.announce(`VAGUE ${this.wave} REPOUSSÉE`, `Ravitaillement largué · prochaine vague dans ${WAVE_PAUSE} s`, BONE, 3);
    g.audio.zWave?.(this.wave, false);
    // les survivants tombés reviennent, ceux debout soufflent un peu
    for (const h of this.humans()) { if (!h.alive) { h.respawnT = 0; this.g.respawn(h); h.ai && (h.ai.think = 0); } else { h.hp = Math.min(100, h.hp + 35); } if (h.bot) { h.armor = Math.max(h.armor, 60); h.nades = Math.max(h.nades || 0, 2); h.frags = Math.max(h.frags || 0, 1); } }
    this.dropCrate();
    if (this.wave >= this.best) { if (this.wave > this.best && this.best > 0) g.toast(`Record battu : ${this.wave} vagues ${this.lieu()}`, '#ffcc3d'); this.best = this.wave; this.saveBest(); }
    if (this.wave === 2 || this.wave % 4 === 0) this.news('hold');
    this.drawHud();
  }
  saveBest() { const s = this.g.save; s.zBest = s.zBest || {}; const k = window.__map || 'carte'; if (this.wave > (s.zBest[k] || 0)) { s.zBest[k] = this.wave; this.g.persist(); } }
  gameOver() {
    const g = this.g; if (this.over) return; this.over = true; g.over = true; this.saveBest();
    const reached = Math.max(0, this.state === 'wave' ? this.wave - 1 : this.wave);
    g.save.xp = (g.save.xp || 0) + this.kills * 8 + reached * 60; g.save.lvl = 1 + Math.floor(Math.sqrt(g.save.xp / 100)); g.persist();
    g.audio.engine(false); g.audio.zWave?.(this.wave, false, true);
    g.announce('SUBMERGÉS', `${reached} vague${reached > 1 ? 's' : ''} tenue${reached > 1 ? 's' : ''} · ${this.kills} zombies abattus`, BLOOD, 4);
    this.news('end');
    const r = { zombie: { wave: this.wave, reached, kills: this.kills, heads: this.heads, best: this.best, where: this.where() }, win: false, draw: false, score: { ...g.score }, stats: { ...g.stats } };
    setTimeout(() => g.onEnd?.(r), 3200);
  }

  // ---------------------------------------------------------------- chaque image
  update(dt) {
    const g = this.g; if (this.over) return; this.pathBudget = 3;
    if (this.state === 'pause') { this.t -= dt; if (this.t <= 0) this.startWave(); else if (this.t < 3.2 && Math.ceil(this.t) !== Math.ceil(this.t + dt)) g.audio.play('uiTick', null, 0.7); }
    else {
      this.spawnT -= dt; let alive = 0; for (const z of this.zeds) if (z.alive) alive++;
      if (this.spawnT <= 0 && (this.toSpawn > 0 || this.bossLeft > 0) && alive < this.max + (this.bossLeft ? 1 : 0)) {
        const boss = this.bossLeft > 0 && (this.spawned >= this.bossAt || this.toSpawn <= 0);
        if (this.spawnZed(boss ? 'mastodonte' : this.rollType())) { if (boss) this.bossLeft--; else this.toSpawn--; this.spawned++; }
        this.spawnT = Math.max(0.12, (this.wave < 3 ? 1.4 : 0.9) - this.wave * 0.04) * rnd(0.6, 1.4);
      }
      if (this.toSpawn <= 0 && this.bossLeft <= 0 && alive === 0) this.endWave();
      // derniers zombies : repérés sur la mini-carte (sinon on cherche le dernier dans tout le quartier)
      if (this.toSpawn <= 0 && !this.bossLeft && alive <= 3 && g.time - this.waveStartT > 25) for (const z of this.zeds) if (z.alive) z.spotMark = g.time + 2;
    }
    // tout le monde à terre : fin de partie
    if (!this.aliveHumans().length && !this.over) { this.gameOver(); return; }
    this.updateToxic(dt); this.updateCorpses(dt); this.ambience(dt);
    if (this.crate) this.crate.update(dt);
    if (g.time > this.nextHud) { this.nextHud = g.time + 0.2; this.drawHud(); }
  }
  rollType() { const r = Math.random(), S = this.share; let a = 0; for (const k of ['coureur', 'blinde', 'contamine']) { a += S[k] || 0; if (r < a) return k; } return 'rodeur'; }

  // ---------------------------------------------------------------- apparition
  spawnZed(type) {
    const g = this.g, W = g.world, hs = this.aliveHumans(); if (!hs.length) return false;
    const me = g.player.alive ? g.player : hs[0], eye = me.pos.clone(); eye.y += 1.6;
    const rise = type !== 'mastodonte' && Math.random() < (this.wave < 2 ? 0.15 : 0.3);
    const best = this.pickSpawn(rise); if (!best) return false;
    const [x0, z0] = best; let x = x0 + rnd(-1.5, 1.5), z = z0 + rnd(-1.5, 1.5); if (!this.okAt(x, z)) { x = x0; z = z0; }
    const mid = modelFor(type); if (!mid) return false;
    let a = this.zeds.find((q) => q.gone && q.zModel === mid);
    if (!a) a = this.newZed(mid);
    this.resetZed(a, type, x, z, rise); return true;
  }
  // un point d'apparition à bonne distance des survivants, de préférence hors de vue
  pickSpawn(rise, lo = rise ? 13 : 24, hi = rise ? 30 : 60) {
    const g = this.g, W = g.world, hs = this.aliveHumans(); if (!hs.length) return null;
    const me = g.player.alive ? g.player : hs[0], eye = me.pos.clone(); eye.y += 1.6;
    let best = null, bs = -1e9;
    for (let k = 0; k < 26; k++) {
      const p = pick(this.spawnPts); let dmin = 1e9; for (const h of hs) dmin = Math.min(dmin, Math.hypot(p[0] - h.pos.x, p[1] - h.pos.z));
      if (dmin < lo) continue; let s = -Math.abs(dmin - (lo + hi) / 2) * 0.4 + rnd(0, 6); if (dmin > hi) s -= (dmin - hi) * 0.6;
      if (!rise) { const tp = V(p[0], W.groundY(p[0], p[1]) + 1.5, p[1]); if (W.los(eye, tp)) s -= 18; } // de préférence hors de vue
      for (const z of this.zeds) if (z.alive && Math.abs(z.pos.x - p[0]) < 1.2 && Math.abs(z.pos.z - p[1]) < 1.2) s -= 30;
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }
  // un zombie qui n'avance plus vers sa cible (escalier, recoin, mobilier) : hors de vue, il réapparaît ailleurs
  progress(z, d, dt) {
    if (z.st !== 'chase' || d < 6) { z.progT = 0; z.progD = d; z.fails = 0; return; }
    z.progT = (z.progT || 0) + dt; if (z.progT < 5) return;
    z.progT = 0; const gain = (z.progD ?? d + 9) - d; z.progD = d;
    if (gain > 1.2) { z.fails = 0; return; }
    z.fails = (z.fails || 0) + 1; z.zp = null; z.pathT = 0; z.carAv = null;
    const g = this.g; if (z.fails < 2 || !(z.offscreen || z.pos.distanceTo(g.camera.position) > 35)) return;
    const p = this.pickSpawn(false, 20, 45); if (!p) return;
    z.pos.set(p[0], g.world.groundY(p[0], p[1], 3), p[1]); z.vel.set(0, 0, 0); z.fails = 0; z.progD = undefined; z.blocked = 0;
    z.ch.root.position.copy(z.pos);
  }
  newZed(mid) {
    const g = this.g, ch = makeBody(mid); g.root.add(ch.root);
    const team = this.zteam;
    const a = { team, skin: 'zombie', bot: true, name: '', ch, pos: V(), vel: V(), yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false, gone: true, onGround: true, slots: [], cur: 0, fireT: 0, reloadT: 0, bag: [], bagKg: 0, mats: 0, nades: 0, frags: 0, momentum: 0, slideT: 0, rollT: 0, climb: null, respawnT: 0, lastHit: 0, anim: null, inCar: null, stats: { k: 0, d: 0, a: 0, cap: 0, sac: 0 }, streak: 0, rewards: [], spotted: 0, gasT: 0, channel: null, cash: 0, regenT: 0, id: g.actors.length, zed: true, zModel: mid, perk: {}, cap: 0 };
    a.cls = Object.keys(CLASSES[team])[0];
    a.ai = { path: null, pi: 0, goal: null, task: null, think: 0, target: null, seeT: 0, react: 0, strafe: 1, strafeT: 0, stuck: 0, lastPos: V(), nadeT: 1e9, los: false, losT: 0 };
    ch.root.visible = false; g.actors.push(a); this.zeds.push(a); return a;
  }
  resetZed(a, type, x, z, rise) {
    const g = this.g, T = ZTYPES[type], L = a.ch.L, ch = a.ch;
    a.ztype = type; a.name = T.nom; a.boss = !!T.boss; a.alive = true; a.gone = false; a.dead = false; a.deadT = 0; a.kb = null;
    a.maxHp = T.hp * this.hpMul * (T.boss ? 1 + Math.max(0, this.aliveHumans().length - 1) * 0.15 : 1); a.hp = a.maxHp; a.armor = T.armor ? T.armor * Math.min(2, this.hpMul) : 0;
    a.dmg = T.dmg * this.dmgMul; a.reach = T.reach; a.cdR = T.cd;
    a.walkSp = rnd(...T.walk) * this.spdMul; a.runSp = T.run ? rnd(...T.run) * Math.min(1.25, this.spdMul) : 0;
    // à partir de la vague 4, des rôdeurs se mettent à trottiner (de plus en plus nombreux)
    if (type === 'rodeur' && this.wave >= 4 && Math.random() < Math.min(0.5, (this.wave - 3) * 0.07)) a.walkSp = rnd(1.5, 2.4);
    a.hitR = T.hitR || 0.42; a.hitTop = T.hitTop || 1.75; a.headY = a.hitTop - (T.boss ? 0.5 : 0.32); if (T.boss) this.bigs.push(a);
    a.pos.set(x, g.world.groundY(x, z, 3), z); a.vel.set(0, 0, 0); a.yaw = rnd(0, Math.PI * 2);
    const hs = this.aliveHumans(); if (hs.length) { const h = hs[0]; a.yaw = Math.atan2(h.pos.x - x, h.pos.z - z); }
    a.spawnProt = 0; a.spotMark = 0; a.stats = { k: 0, d: 0, a: 0, cap: 0, sac: 0 }; a.hitBy?.clear?.(); a.inGas = 0; a.flashT = 0;
    a.st = rise && ch.actions.z_standup ? 'rise' : 'chase'; a.stT = 0; a.cd = rnd(0.3, 1); a.target = null; a.tgtT = 0; a.pathT = 0; a.zp = null; a.zpi = 0; a.screamed = false; a.stagT = 0; a.enrageT = 0; a.blocked = 0; a.blockT = 0; a.carAv = null; a.progT = 0; a.progD = undefined; a.fails = 0; a.groanT = rnd(1, 6); a.jumpCd = rnd(4, 7); a.enraged = false;
    a.ai.target = null;
    // corps : pose de départ propre
    ch.mixer.stopAllAction(); for (const n of ['z_idle', 'z_walk', 'z_run']) if (ch.actions[n]) { ch.actions[n].reset().play(); ch.actions[n].setEffectiveWeight(0); ch.actions[n].time = Math.random() * ch.actions[n].getClip().duration; }
    a.one = null; a.anim = null; ch.model.rotation.set(0, 0, 0); ch.model.position.set(0, 0, 0);
    if (a.st === 'rise') { this.oneShot(a, 'z_standup', { fadeIn: 0, speed: rnd(1.5, 1.9), hold: true }); g.fx.dust(a.pos, 8, 1.1); g.audio.play('debris', a.pos, 0.5, [0.6, 0.8]); }
    else if (type === 'mastodonte') { a.st = 'roar'; this.oneShot(a, 'z_scream', { speed: 1.1 }); }
    ch.root.visible = true; ch.root.position.copy(a.pos); ch.root.rotation.y = a.yaw; ch.mixer.update(0.001);
    for (const m of ch.meshes) m.castShadow = true;
    if (type === 'mastodonte') { g.announce('MASTODONTE', 'Visez la tête · gardez vos distances', BLOOD, 3); g.audio.zRoar?.(a.pos); g.cam.trauma = Math.min(1, g.cam.trauma + 0.35); this.news('boss'); }
  }

  // ---------------------------------------------------------------- animation : allures mélangées + un geste à la fois
  oneShot(a, name, { fadeIn = 0.12, speed = 1, hold = false, until = 0 } = {}) {
    const act = a.ch.actions[name]; if (!act) return false;
    if (a.one && a.one.act !== act) a.one.act.fadeOut(0.12);
    act.reset(); act.timeScale = speed; act.setEffectiveWeight(1); act.fadeIn(fadeIn).play();
    const dur = act.getClip().duration / speed; a.one = { name, act, t: 0, dur: until ? Math.min(until, dur) : dur, hold, fade: fadeIn }; return true;
  }
  loco(a, dt) {
    const A = a.ch.actions, L = a.ch.L, sp = Math.hypot(a.vel.x, a.vel.z);
    const ws = L.stride.z_walk && A.z_walk ? L.stride.z_walk / A.z_walk.getClip().duration : 0.32, rs = L.stride.z_run && A.z_run ? L.stride.z_run / A.z_run.getClip().duration : 2.8;
    // marche lente jusqu'à ~1,1 m/s, puis la course de zombie (ralentie pour un trot, accélérée pour un sprint)
    const k = A.z_run ? clamp((sp - (a.boss ? 2.4 : 1.0)) / 0.45, 0, 1) : 0, m = clamp(sp / 0.25, 0, 1);
    let one = 0; const O = a.one;
    if (O) { O.t += dt; const fin = O.dur - O.t; one = O.hold ? 1 : clamp(Math.min(O.t / Math.max(0.01, O.fade), fin / 0.15), 0, 1); if (fin <= 0 && !O.hold) { O.act.fadeOut(0.1); a.one = null; } }
    const w = 1 - one;
    if (A.z_idle) A.z_idle.setEffectiveWeight((1 - m) * w);
    if (A.z_walk) { A.z_walk.setEffectiveWeight(m * (1 - k) * w); A.z_walk.timeScale = clamp(sp / ws, 0.7, a.boss ? 1.6 : 3.4); }
    if (A.z_run) { A.z_run.setEffectiveWeight(m * k * w); A.z_run.timeScale = clamp(sp / rs, 0.55, 2.1); }
    if (O && !O.hold) O.act.setEffectiveWeight(one);
  }

  // ---------------------------------------------------------------- IA (une fois par image et par zombie)
  think(z, dt) {
    const g = this.g; if (!z.alive || this.over) return;
    z.wish = z.wish || V(); z.wish.set(0, 0, 0); z.cd -= dt; z.tgtT -= dt; z.pathT -= dt; z.stagT -= dt; z.enrageT -= dt; z.jumpCd -= dt;
    if (z.st === 'rise') { if (!z.one || z.one.t > z.one.dur - 0.05) { z.st = 'chase'; if (z.one) { z.one.act.fadeOut(0.3); z.one = null; } } return; }
    if (z.st === 'roar' || z.st === 'scream') { if (!z.one) z.st = 'chase'; return; }
    // cible : le survivant debout le plus proche (un peu de préférence pour toi)
    if (z.tgtT <= 0 || !z.target?.alive) { z.tgtT = rnd(0.5, 1); let best = null, bd = 1e9; for (const h of this.aliveHumans()) { const d = h.pos.distanceTo(z.pos) * (h === g.player ? 0.85 : 1) * (h.inCar ? 1.3 : 1); if (d < bd) { bd = d; best = h; } } if (best !== z.target) { z.target = best; z.zp = null; } }
    const t = z.target; if (!t) return;
    const dx = t.pos.x - z.pos.x, dz = t.pos.z - z.pos.z, d = Math.hypot(dx, dz), dy = t.pos.y - z.pos.y;
    // cri : un zombie sur six hurle en voyant un survivant ; ceux qui l'entendent s'emballent quelques secondes
    if (!z.screamed && d < 22 && z.ztype !== 'mastodonte' && Math.random() < dt * 2) { z.screamed = true; if (Math.random() < 0.17 && z.ch.actions.z_scream && g.world.los(V(z.pos.x, z.pos.y + 1.6, z.pos.z), V(t.pos.x, t.pos.y + 1.5, t.pos.z))) { z.st = 'scream'; this.oneShot(z, 'z_scream', { speed: 1.35 }); g.audio.zScream?.(z.pos); for (const o of this.zeds) if (o !== z && o.alive && o.pos.distanceTo(z.pos) < 20) { o.enrageT = 7; o.enraged = true; } return; } }
    // attaque en cours : on se tourne vers la cible, le coup part au bon moment de l'animation
    if (z.st === 'attack') {
      const A = z.atk; A.t += dt; this.face(z, Math.atan2(dx, dz), dt, 7);
      if (z.boss && A.leap && A.t < A.hit) { const sp = 7.5; z.wish.set(dx / (d || 1), 0, dz / (d || 1)); z.leapSp = sp; }
      if (!A.done && A.t >= A.hit) { A.done = true; this.strike(z, A); }
      if (A.t >= A.end) { z.st = 'chase'; z.atk = null; z.leapSp = 0; }
      return;
    }
    this.progress(z, d, dt);
    if (z.stagT > 0) return; // titube après un gros coup
    // à portée : on frappe (un mastodonte peut aussi bondir de loin)
    const reach = z.reach + (t.inCar ? 1.2 : 0);
    if (z.cd <= 0 && d < reach && Math.abs(dy) < 1.7) { this.attack(z, t); return; }
    if (z.boss && z.jumpCd <= 0 && d > 5 && d < 10 && Math.abs(dy) < 1 && z.ch.actions.z_jump && g.world.los(V(z.pos.x, z.pos.y + 1.4, z.pos.z), V(t.pos.x, t.pos.y + 1.2, t.pos.z))) { z.jumpCd = rnd(7, 11); this.attack(z, t, 'z_jump'); return; }
    // déplacement : tout droit si la voie est libre, sinon le chemin A* (recalculé de temps en temps, budget par image)
    let dir = null;
    if (d < 16 && Math.abs(dy) < 1.5 && g.world.gridLos([z.pos.x, z.pos.z], [t.pos.x, t.pos.z])) { dir = V(dx / d, 0, dz / d); z.zp = null; }
    else {
      const moved = z.zpGoal ? Math.hypot(z.zpGoal[0] - t.pos.x, z.zpGoal[1] - t.pos.z) : 99;
      if ((!z.zp || z.pathT <= 0 || moved > Math.max(4, d * 0.25)) && this.pathBudget > 0) { this.pathBudget--; z.pathT = rnd(1.4, 2.6); z.zp = g.world.path(z.pos.x, z.pos.z, t.pos.x, t.pos.z); z.zpi = 1; z.zpGoal = [t.pos.x, t.pos.z]; }
      z.chkT = (z.chkT || 0) - dt; if (z.zp && z.chkT <= 0 && z.zpi < z.zp.length) { z.chkT = 0.6; if (!g.world.gridLos([z.pos.x, z.pos.z], z.zp[z.zpi])) { z.zp = null; z.pathT = 0; } }
      const P = z.zp; if (P) { while (z.zpi < P.length && Math.hypot(P[z.zpi][0] - z.pos.x, P[z.zpi][1] - z.pos.z) < 0.8) z.zpi++; if (z.zpi < P.length) { const px = P[z.zpi][0] - z.pos.x, pz = P[z.zpi][1] - z.pos.z, L = Math.hypot(px, pz) || 1; dir = V(px / L, 0, pz / L); } else z.zp = null; }
      if (!dir && d > 0.5) dir = V(dx / d, 0, dz / d); // pas de chemin (cible sur un toit, dans une voiture…) : on se rapproche quand même
    }
    // contre une voiture garée (absente de la grille de trajets, elles bougent) : on la contourne par le côté le plus court
    const CA = z.carAv; if (dir && CA && CA.t > 0) { CA.t -= dt; const c = CA.c; const nx = z.pos.x - c.x, nz = z.pos.z - c.z, nl = Math.hypot(nx, nz) || 1; if (CA.side === 0) CA.side = (dir.x * nz - dir.z * nx) / nl > 0 ? 1 : -1; const tx = nz / nl * CA.side, tz = -nx / nl * CA.side; dir.set(tx * 0.85 + nx / nl * 0.35 + dir.x * 0.15, 0, tz * 0.85 + nz / nl * 0.35 + dir.z * 0.15); }
    if (dir) {
      // écart entre zombies : ils se bousculent au lieu de se superposer
      for (const o of this.zeds) { if (o === z || !o.alive) continue; const ox = z.pos.x - o.pos.x, oz = z.pos.z - o.pos.z, dd = ox * ox + oz * oz; if (dd < 1.1 && dd > 1e-4) { dir.x += ox / dd * 0.22; dir.z += oz / dd * 0.22; } }
      dir.y = 0; dir.normalize(); z.wish.copy(dir);
    }
    // bloqué contre une barricade : on la défonce
    if (z.blocked > 1.2) { const w = g.walls?.find((w) => w.team !== z.team && w.pos.distanceTo(z.pos) < 2.6); if (w && z.cd <= 0) { z.cd = rnd(...z.cdR); this.oneShot(z, pick(['z_punch', 'z_attack']), { speed: 1.6, until: 0.9 }); setTimeout(() => { if (z.alive && g.walls.includes(w)) g.hitWall(w, 22 + this.wave * 2, z); }, 420); } }
    this.face(z, Math.atan2(z.wish.x || dx, z.wish.z || dz), dt, z.boss ? 2.6 : 4.2);
    z.wantRun = !!z.runSp && (d > 3 || z.boss) || z.enrageT > 0;
    // râles
    z.groanT -= dt; if (z.groanT <= 0) { z.groanT = rnd(3.5, 9); if (z.pos.distanceToSquared(g.camera.position) < 40 * 40) this.groan(z); }
  }
  face(z, yaw, dt, rate) { const df = angDiff(z.yaw, yaw); z.yaw += clamp(df, -rate * dt, rate * dt); }
  attack(z, t, forced) {
    const g = this.g, L = z.ch.L, A = z.ch.actions; const T = ZTYPES[z.ztype];
    const name = forced || pick(T.attacks.filter((n) => A[n])) || null; if (!name) { z.cd = 1; return; }
    const clipDur = A[name].getClip().duration, hitRaw = L.hit[name] || clipDur * 0.42;
    // le coup tombe ~0,5 s après le début (0,9 s pour la morsure et le bond), on coupe l'animation peu après
    const want = name === 'z_bite' ? 0.85 : name === 'z_jump' ? 0.95 : z.boss ? 0.75 : 0.5; const speed = clamp(hitRaw / want, 0.8, 3.2);
    const hit = hitRaw / speed, end = Math.min(clipDur / speed, hit + (z.boss ? 0.7 : 0.45));
    this.oneShot(z, name, { speed, until: end + 0.1 });
    z.st = 'attack'; z.atk = { t: 0, hit, end, name, target: t, done: false, leap: name === 'z_jump' }; z.cd = rnd(...z.cdR) + end;
    if (Math.random() < 0.6) g.audio.play('voxWar', z.pos, 0.55, [0.5, 0.62], 0.15);
  }
  strike(z, A) {
    const g = this.g, t = A.target; const mult = A.name === 'z_bite' ? 1.5 : A.name === 'z_jump' ? 1.3 : A.name === 'z_headbutt' ? 1.15 : 1;
    const dmg = z.dmg * mult * (z.enrageT > 0 ? 1.15 : 1);
    if (z.boss) { // coup de balayage ou réception du bond : touche tous les survivants devant lui
      const R = A.leap ? 3.4 : z.reach + 0.6; let any = false;
      for (const h of this.aliveHumans()) { const hx = h.pos.x - z.pos.x, hz = h.pos.z - z.pos.z, hd = Math.hypot(hx, hz); if (hd > R || Math.abs(h.pos.y - z.pos.y) > 2) continue; if (!A.leap && (hx * Math.sin(z.yaw) + hz * Math.cos(z.yaw)) / (hd || 1) < 0.2) continue; any = true; g.damage(h, dmg, z, { melee: true, dir: V(hx, 0, hz).normalize() }); if (h.alive) { h.vel.x += hx / (hd || 1) * 9; h.vel.z += hz / (hd || 1) * 9; h.vel.y = Math.max(h.vel.y, 3.5); h.onGround = false; } }
      if (A.leap) { g.fx.dust(z.pos, 16, 2); g.audio.play('slam', z.pos, 1, [0.7, 0.8]); g.audio.play('debris', z.pos, 0.8); }
      if (g.player.pos.distanceTo(z.pos) < 18) g.cam.trauma = Math.min(1, g.cam.trauma + (A.leap ? 0.55 : 0.3));
      if (any) g.audio.play('punch', z.pos, 1, [0.6, 0.75]);
      return;
    }
    const d = Math.hypot(t.pos.x - z.pos.x, t.pos.z - z.pos.z);
    if (!t.alive || d > z.reach + 0.55 + (t.inCar ? 1.2 : 0) || Math.abs(t.pos.y - z.pos.y) > 1.8) { g.audio.play('cloth', z.pos, 0.4, [0.7, 0.9]); return; } // dans le vide
    if (t.inCar && !t.inCar.kind) { g.hitCar?.(t.inCar, dmg * 0.6, z); g.audio.play('slam', t.pos, 0.5, [1.1, 1.3]); return; }
    g.damage(t, dmg, z, { melee: true, dir: V(t.pos.x - z.pos.x, 0, t.pos.z - z.pos.z).normalize() });
    g.audio.play('punch', t.pos, 0.9, [0.75, 0.9]);
  }
  // un survivant encaisse un coup de zombie : secousse, sang, il recule un peu
  hitHuman(h, z) {
    const g = this.g; const dx = h.pos.x - z.pos.x, dz = h.pos.z - z.pos.z, L = Math.hypot(dx, dz) || 1;
    h.vel.x += dx / L * (z.boss ? 0 : 2.2); h.vel.z += dz / L * (z.boss ? 0 : 2.2);
    g.fx.burst(V(h.pos.x, h.pos.y + 1.3, h.pos.z), 6, { color: '#6d0a12', speed: 2.5, size: 0.04, life: 0.45, grav: 10 });
    if (h === g.player) { g.cam.trauma = Math.min(1, g.cam.trauma + 0.28); g.input.rumble?.(0.8, 0.5, 140); }
  }

  // ---------------------------------------------------------------- corps (déplacement, sol, collisions)
  move(z, dt) {
    const g = this.g, W = g.world, ch = z.ch; if (z.gone) return;
    if (!z.alive) { this.deadMove(z, dt); return; }
    const sp = z.leapSp || (z.st === 'attack' || z.st === 'rise' || z.st === 'roar' || z.st === 'scream' || z.stagT > 0 ? 0 : z.wantRun && z.runSp ? z.runSp : z.walkSp * (z.enrageT > 0 ? 1.7 : 1)) * (1 - (z.inGas || 0) * 0.35);
    // loin et hors de vue, un zombie rattrape son retard (personne ne voit ses pieds glisser) : les vagues ne traînent pas
    let far = 1; if (sp > 0 && !z.leapSp && z.target && (z.offscreen || z.pos.distanceToSquared(g.camera.position) > 45 * 45)) { const dd = Math.hypot(z.target.pos.x - z.pos.x, z.target.pos.z - z.pos.z); far = 1 + clamp((dd - 24) / 20, 0, 1.6); }
    const wx = (z.wish?.x || 0) * sp * far, wz = (z.wish?.z || 0) * sp * far, acc = (z.leapSp ? 30 : z.runSp ? 9 : 5) * dt;
    z.vel.x += clamp(wx - z.vel.x, -acc, acc); z.vel.z += clamp(wz - z.vel.z, -acc, acc);
    const px = z.pos.x, pz = z.pos.z, py = z.pos.y;
    z.pos.x += z.vel.x * dt; z.pos.z += z.vel.z * dt;
    const hitWall = W.pushOut(z.pos, z.boss ? 0.6 : 0.36, z.pos.y);
    const gy = W.standY(z.pos.x, z.pos.z, py + 0.5);
    if (hitWall && hitWall.car) { if (!z.carAv || z.carAv.c !== hitWall) z.carAv = { c: hitWall, side: 0, t: 0 }; z.carAv.t = 1.1; }
    if (gy > py + 0.6) { z.pos.x = px; z.pos.z = pz; z.vel.x *= 0.3; z.vel.z *= 0.3; } // marche trop haute
    // progrès : bloqué (barricade, voiture, autre zombie) ?
    const moved = Math.hypot(z.pos.x - px, z.pos.z - pz); if (sp > 0.3 && moved < sp * dt * 0.25) z.blocked += dt; else z.blocked = Math.max(0, z.blocked - dt * 2);
    if (z.blocked > 2.5 && (!hitWall || z.blocked > 4)) { z.zp = null; z.pathT = 0; }
    // vraiment coincé (coin de mur, mobilier) : hors de vue, on le recale au centre de la case libre la plus proche
    if (z.blocked > 6 && (z.offscreen || z.pos.distanceTo(g.camera.position) > 30)) { const [i, j] = W.nearestFree(...W.cell(z.pos.x, z.pos.z)); const B = W.bounds, S = W.nav.S; const nx = B.x0 + (i + 0.5) * S + rnd(-0.2, 0.2), nz = B.z0 + (j + 0.5) * S + rnd(-0.2, 0.2); if (Math.hypot(nx - z.pos.x, nz - z.pos.z) > 0.05) { z.pos.x = nx; z.pos.z = nz; } else if (z.target) { const p = g.world.path(z.pos.x, z.pos.z, z.target.pos.x, z.target.pos.z); if (p && p[1]) { z.pos.x += clamp(p[1][0] - z.pos.x, -S, S); z.pos.z += clamp(p[1][1] - z.pos.z, -S, S); } } z.blocked = 0; z.zp = null; z.pathT = 0; }
    // gravité (chute d'une marche, d'un pont…)
    const gy2 = W.standY(z.pos.x, z.pos.z, z.pos.y + 0.5);
    if (z.pos.y > gy2 + 0.05) { z.vel.y = (z.vel.y || 0) - 19 * dt; z.pos.y = Math.max(gy2, z.pos.y + z.vel.y * dt); } else { z.pos.y = lerp(z.pos.y, gy2, 1 - Math.exp(-dt * 18)); z.vel.y = 0; }
    // on ne traverse pas les survivants : on se bouscule
    for (const h of this.aliveHumans()) { if (h.inCar) continue; const hx = h.pos.x - z.pos.x, hz = h.pos.z - z.pos.z, dd = Math.hypot(hx, hz), m = (z.boss ? 0.95 : 0.62); if (dd < m && dd > 1e-3 && Math.abs(h.pos.y - z.pos.y) < 1.5) { const o = (m - dd) / dd; z.pos.x -= hx * o * 0.5; z.pos.z -= hz * o * 0.5; h.pos.x += hx * o * 0.5; h.pos.z += hz * o * 0.5; W.pushOut(h.pos, 0.35, h.pos.y); } }
    // l'eau : un zombie qui tombe dans la Seine est perdu
    if (W.water && z.pos.y < W.water.y - 0.4 && W.inWater(z.pos.x, z.pos.z)) { g.kill(z, null, { gas: true }); return; }
    ch.root.position.copy(z.pos); ch.root.rotation.y = z.yaw;
    // animation : à mi-distance une image sur deux, hors champ et loin une sur quatre
    this.loco(z, dt); z.mixAcc = (z.mixAcc || 0) + dt; const d2 = z.pos.distanceToSquared(g.camera.position);
    const every = z.offscreen ? (d2 > 30 * 30 ? 4 : 2) : d2 > 45 * 45 ? 2 : 1; z.mixN = ((z.mixN || 0) + 1) % every;
    if (z.mixN === 0) { ch.mixer.update(z.mixAcc); z.mixAcc = 0; }
    // hauteur de la tête (un zombie marche voûté) : sert aux tirs à la tête (game.rayActors : hitTop, headY)
    const hb = ch.bones.Head; if (hb && z.mixN === 0 && !z.offscreen) { ch.model.updateMatrixWorld(true); hb.getWorldPosition(_hp); const hy = clamp(_hp.y - z.pos.y, 0.5, z.boss ? 3 : 2.1); z.headY = hy - (z.boss ? 0.3 : 0.15); z.hitTop = hy + (z.boss ? 0.35 : 0.2); }
  }
  deadMove(z, dt) {
    const g = this.g, W = g.world, ch = z.ch; z.deadT = (z.deadT || 0) + dt;
    if (z.kb) { const sp = z.kb.length(); if (sp > 0.05) { z.pos.addScaledVector(z.kb, dt); W.pushOut(z.pos, 0.3, z.pos.y + 0.3); z.kb.multiplyScalar(Math.exp(-dt * (z.deadT < 0.25 ? 2.2 : 5.5))); } else z.kb = null; }
    const gy = W.standY(z.pos.x, z.pos.z, z.pos.y + 0.4); if (z.pos.y > gy + 0.01) { z.vel.y = Math.min(z.vel.y || 0, 2) - 19 * dt; z.pos.y = Math.max(gy, z.pos.y + z.vel.y * dt); } else z.vel.y = 0;
    // la mort se joue seule : les allures s'éteignent
    const A = ch.actions; for (const n of ['z_idle', 'z_walk', 'z_run']) if (A[n]) A[n].setEffectiveWeight(Math.max(0, A[n].getEffectiveWeight() - dt * 8));
    if (z.one && z.one.act !== A.z_death) { z.one.act.setEffectiveWeight(Math.max(0, z.one.act.getEffectiveWeight() - dt * 8)); }
    if (!A.z_death && z.deadT < 1) ch.model.rotation.x = lerp(ch.model.rotation.x, -Math.PI / 2, 1 - Math.exp(-dt * 6)); // secours sans animation de mort
    ch.root.position.copy(z.pos); if (z.deadT < 4 || !z.offscreen) ch.mixer.update(dt);
    // le corps reste un moment, puis s'enfonce et disparaît (on recycle l'acteur)
    const stay = this.corpses.length > 12 && this.corpses[0] === z ? 1.5 : z.boss ? 14 : 9;
    if (z.deadT > stay) { const k = Math.min(1, (z.deadT - stay) / 1.6); ch.root.position.y -= k * k * 0.9; if (k >= 1) this.retire(z); }
  }
  retire(z) { z.gone = true; z.alive = false; z.ch.root.visible = false; z.ch.mixer.stopAllAction(); z.one = null; const i = this.corpses.indexOf(z); if (i >= 0) this.corpses.splice(i, 1); const j = this.bigs.indexOf(z); if (j >= 0) this.bigs.splice(j, 1); }
  updateCorpses() { while (this.corpses.length > 16) { const z = this.corpses[0]; this.retire(z); } }

  // ---------------------------------------------------------------- touches, morts
  hurt(z, dealt, by, opts) {
    const g = this.g; if (!z.alive || dealt <= 0) return;
    // titube après un gros coup (pas le mastodonte, ni en pleine attaque)
    const big = dealt >= 34 || opts.head; if (big && !z.boss && z.st === 'chase' && z.stagT <= 0 && Math.random() < 0.55 && z.ch.actions.z_hit) { this.oneShot(z, 'z_hit', { speed: 1.6, until: 0.55 }); z.stagT = 0.45; z.vel.multiplyScalar(0.2); }
    if (opts.head && z.ztype !== 'mastodonte') g.fx.burst(V(z.pos.x, z.pos.y + 1.65, z.pos.z), 5, { color: '#4a0a0c', speed: 2.2, size: 0.04, life: 0.4, grav: 9 });
    // le mastodonte enragé à mi-vie
    if (z.boss && !z.enraged && z.hp < z.maxHp * 0.5) { z.enraged = true; z.walkSp *= 1.35; z.dmg *= 1.2; z.st = 'roar'; this.oneShot(z, 'z_scream', { speed: 1.25 }); g.audio.zRoar?.(z.pos); if (g.player.pos.distanceTo(z.pos) < 35) { g.cam.trauma = Math.min(1, g.cam.trauma + 0.4); g.toast('Le Mastodonte enrage !', BLOOD); } }
    if (by && !by.zed) { z.target = by.alive ? by : z.target; }
  }
  died(t, by, opts = {}) {
    const g = this.g;
    if (t.zed) {
      t.respawnT = 1e9; t.deadT = 0; this.corpses.push(t); if (t.one && t.one.act !== t.ch.actions.z_death) t.one.act.fadeOut(0.15); t.one = null; t.st = 'dead';
      if (by && !by.zed && t.team !== by.team) { this.waveKills++; if (by === g.player) { this.kills++; if (opts.head) this.heads++; this.points += t.boss ? 1500 : 60; if (t.boss) { g.earn(1500, 'Mastodonte abattu', true); g.announce('MASTODONTE ABATTU', '', '#ffcc3d', 2.5); } } }
      if (t.ztype === 'contamine') this.burst(t, by && !by.zed ? by : null);
      // de temps en temps, un policier ou un soldat laisse tomber son arme
      if ((t.zModel === 'policier' || t.zModel === 'soldat') && Math.random() < 0.18) g.dropPile(t.pos.clone().add(V(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5))), [], { id: pick((t.zModel === 'policier' ? ['pistolet_lourd', 'shotgun', 'smg'] : ['rifle', 'carabine', 'pompe_tac']).filter((w) => WEAPONS[w])) || 'pistol', rarity: pick(['rare', 'rare', 'epique']) });
      return;
    }
    if (t.team !== this.team) return;
    // survivant à terre : il attend la prochaine vague
    t.respawnT = 1e9;
    const up = this.aliveHumans();
    if (t === g.player && up.length) { g.announce('À TERRE', `Tes équipiers tiennent · retour à la prochaine vague`, BLOOD, 3); }
    else if (t !== g.player && t.alive === false) g.toast(`${t.name} est à terre`, '#ff8a80');
  }
  // contaminé : il éclate en nuage toxique (blesse aussi les zombies autour : à tirer quand ils sont groupés)
  burst(z, killer) {
    const g = this.g, B = ZTYPES.contamine.burst, p = z.pos.clone(); p.y += 1;
    setTimeout(() => {
      if (this.over) return;
      g.fx.burst(p, 26, { color: '#7fa83a', speed: 6, size: 0.08, life: 0.8, grav: 8 }); g.fx.burst(p, 8, { color: '#5d7a26', opacity: 0.45, size: 0.6, life: 1.4, speed: 1.5 });
      g.fx.cloud?.(p, 'signal', null, '#7c9a35'); g.audio.explode(p); g.audio.play('slam', p, 0.7, [0.6, 0.75]);
      for (const a of g.actors) { if (!a.alive || a.gone || a === z) continue; const d = a.pos.distanceTo(z.pos); if (d > B.r) continue; const k = 1 - d / B.r; g.damage(a, B.dmg * (0.35 + 0.65 * k) * (a.zed ? 3 : 1) * (a === g.player ? 1 : 0.8), a.zed && killer?.alive !== undefined ? killer : null, { blast: true, gas: true }); }
      if (g.player.pos.distanceTo(z.pos) < 12) g.cam.trauma = Math.min(1, g.cam.trauma + 0.3);
      this.toxic.push({ p: z.pos.clone(), t: 0, life: 6 });
    }, 550);
  }
  updateToxic(dt) {
    const g = this.g;
    for (let i = this.toxic.length - 1; i >= 0; i--) { const T = this.toxic[i]; T.t += dt; if (T.t > T.life) { this.toxic.splice(i, 1); continue; } T.tick = (T.tick || 0) - dt; if (T.tick > 0) continue; T.tick = 0.5; for (const h of this.aliveHumans()) if (h.pos.distanceTo(T.p) < 3.2) g.damage(h, 4, null, { gas: true }); }
  }

  // ---------------------------------------------------------------- équipiers IA : ils restent groupés autour de toi
  escort(b) {
    const g = this.g; const lead = g.player.alive ? g.player : this.aliveHumans().find((h) => h !== b) || b;
    const W = g.world; let x = lead.pos.x, z = lead.pos.z;
    for (let k = 0; k < 12; k++) { const a = rnd(0, Math.PI * 2), r = rnd(2.5, 6.5), tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (this.okAt(tx, tz)) { x = tx; z = tz; break; } }
    g.botGo(b, { kind: 'zone', zone: { center: [x, z], radius: 2.5 } }, V(x, 0, z)); b.ai.think = rnd(1.5, 3);
  }

  // ---------------------------------------------------------------- ravitaillement entre deux vagues
  dropCrate() {
    const g = this.g, W = g.world; this.crate?.remove();
    const lead = g.player.alive ? g.player : this.aliveHumans()[0]; if (!lead) return;
    let x = lead.pos.x + 3, z = lead.pos.z; for (let k = 0; k < 20; k++) { const a = rnd(0, Math.PI * 2), r = rnd(3, 6), tx = lead.pos.x + Math.cos(a) * r, tz = lead.pos.z + Math.sin(a) * r; if (this.okAt(tx, tz)) { x = tx; z = tz; break; } }
    this.crate = new Crate(g, V(x, W.groundY(x, z, lead.pos.y + 1.5), z), this);
  }
  interact(a) {
    const C = this.crate; if (!C || C.used || !a.alive) return; const g = this.g;
    if (a.pos.distanceTo(C.pos) > 2.2) return;
    g.ui.prompt = `<b>${g.input.label('interact')}</b> Ravitaillement <span class="r">soins · gilet · grenades · chargeurs</span>`;
    if (g.input.pressed('interact')) C.take(a);
  }

  // ---------------------------------------------------------------- ambiance
  applyAtmo() {
    const g = this.g, f = g.scene.fog, F = this.fog0, night = !!g.save.settings?.night;
    f.color.copy(F.c).lerp(new THREE.Color(night ? '#141a1c' : '#7d8784'), night ? 0.55 : 0.6);
    f.near = Math.min(F.near, night ? 8 : 14); f.far = Math.min(F.far, night ? 150 : 190);
    g.renderer.toneMappingExposure = F.exp * (night ? 0.95 : 0.84);
  }
  ambience(dt) {
    const g = this.g, a = g.player; this.groanT -= dt;
    // rumeur lointaine de la horde pendant les vagues
    if (this.state === 'wave' && this.groanT <= 0) { this.groanT = rnd(2.5, 6); const far = this.zeds.filter((z) => z.alive && z.pos.distanceTo(a.pos) > 25); if (far.length) { const z = pick(far); g.audio.play(pick(['voxPain', 'voxGrunt']), z.pos, 1.4, [0.42, 0.52], 0.3); } }
  }
  groan(z) { const g = this.g; g.audio.play(pick(['voxGrunt', 'voxPain', 'voxGrunt']), z.pos, z.boss ? 1.3 : 0.75, z.boss ? [0.38, 0.45] : [0.5, 0.66], 0.12); }
  dispose() {
    const g = this.g, f = g.scene.fog, F = this.fog0; if (F) { f.color.copy(F.c); f.near = F.near; f.far = F.far; g.renderer.toneMappingExposure = F.exp; }
    g.audio.zAmbience?.(false); document.body.classList.remove('zombie'); $('zHud')?.remove(); this.crate?.remove(); this.over = true;
  }

  // ---------------------------------------------------------------- flash info (mêmes présentateurs, sujets du mode)
  newsOpen() { const L = this.lieu(); this.g.newsPush?.({ zm: true, pri: 2, at: V(this.refuge[0], 0, this.refuge[1]), key: 'zopen', delay: 10, gfx: { kind: 'open' }, head: `Épidémie ${L}`, say: pick([`Édition spéciale. Une épidémie d'origine inconnue frappe ${L}. Les autorités demandent à chacun de rester enfermé chez soi.`, `Bonsoir. Le quartier est placé en quarantaine : des personnes contaminées, d'une violence inouïe, attaquent les passants ${L}.`]) }); }
  news(kind) {
    const g = this.g, L = this.lieu(), at = g.player.pos.clone(); let st = null;
    if (kind === 'wave') st = { head: `Nouvelle vague ${L}`, say: pick([`Les contaminés reviennent en nombre ${L}. Les derniers survivants se sont retranchés au cœur du quartier.`, `Vague numéro ${this.wave} ${L} : les secours ne peuvent toujours pas entrer dans la zone.`]) };
    else if (kind === 'hold') st = { head: `Ils tiennent ${L}`, say: `Incroyable résistance ${L} : un petit groupe de survivants repousse sa ${this.wave}e vague. ${this.kills} contaminés neutralisés selon nos informations.` };
    else if (kind === 'boss') st = { pri: 3, head: 'Une créature hors norme', say: `Des témoins décrivent une créature de plus de deux mètres ${L}. Nous déconseillons formellement de s'approcher.` };
    else if (kind === 'end') st = { pri: 3, head: `Le quartier est tombé`, say: `C'est fini ${L}. Les derniers survivants ont été submergés après ${Math.max(0, this.wave - 1)} vagues.` };
    if (st) g.newsPush?.({ zm: true, pri: 2, at, key: 'z' + kind, gfx: { kind: kind === 'boss' ? 'chaos' : 'open', n: 4 }, ...st });
  }

  // ---------------------------------------------------------------- interface
  hudInit() {
    $('zHud')?.remove(); const el = document.createElement('div'); el.id = 'zHud'; ($('hud') || document.body).appendChild(el); this.el = el; this._html = '';
  }
  hud() {
    const tm = $('timer'); if (tm) tm.textContent = '';
  }
  drawHud() {
    const g = this.g; if (!this.el) return;
    let alive = 0; for (const z of this.zeds) if (z.alive) alive++;
    const left = this.state === 'wave' ? alive + this.toSpawn + this.bossLeft : 0;
    const boss = this.zeds.find((z) => z.alive && z.boss);
    const mates = this.humans().filter((h) => h !== g.player).map((h) => `<i class="${h.alive ? '' : 'down'}" title="${h.name}">${svg('vest')}</i>`).join('');
    const st = this.state === 'pause' ? `<div class="st">${this.wave ? 'Prochaine vague' : 'Ils approchent'} <b>${Math.max(0, Math.ceil(this.t))} s</b>${this.crate && !this.crate.used ? ' · ravitaillement au sol' : ''}</div>`
      : `<div class="st"><b>${left}</b> zombie${left > 1 ? 's' : ''}</div>`;
    const html = `<div class="wv"><small>VAGUE</small><b>${Math.max(1, this.wave)}</b></div><div class="info">${st}<div class="sq">${mates}<span>${this.kills} abattus${this.best ? ` · record ${this.best}` : ''}</span></div></div>`
      + (boss ? `<div class="boss"><span>MASTODONTE</span><div class="bar"><i style="width:${Math.max(0, boss.hp / boss.maxHp * 100).toFixed(1)}%"></i></div></div>` : '');
    if (html !== this._html) { this._html = html; this.el.innerHTML = html; this.el.className = (this.state === 'pause' ? 'pause' : 'wave') + (boss ? ' hasboss' : ''); }
  }
}

// ------------------------------------------------------------------------------------------------ caisse de ravitaillement
let crateTex = null;
function crateTexture() {
  if (crateTex) return crateTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#4d5536'; x.fillRect(0, 0, 256, 128); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 3); }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 116);
  x.fillStyle = '#e8e2cf'; x.font = '900 28px Inter, Arial'; x.textAlign = 'center'; x.fillText('RAVITAILLEMENT', 128, 58); x.font = '700 16px Inter, Arial'; x.fillText('SÉCURITÉ CIVILE', 128, 86);
  x.fillStyle = '#c4161c'; x.fillRect(110, 96, 36, 10); x.fillRect(123, 90, 10, 22);
  crateTex = new THREE.CanvasTexture(c); crateTex.colorSpace = THREE.SRGBColorSpace; crateTex.anisotropy = 4; return crateTex;
}
class Crate {
  constructor(g, pos, horde) {
    this.g = g; this.pos = pos; this.used = false; this.t = 0; this.h = horde;
    const grp = new THREE.Group(); const side = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85, metalness: 0.05 }), plain = new THREE.MeshStandardMaterial({ color: '#434a2f', roughness: 0.9 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.62, 0.7), [plain, plain, plain, plain, side, side]); box.position.y = 0.31; box.castShadow = box.receiveShadow = true; grp.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.06, 0.74), plain); lid.position.y = 0.64; lid.castShadow = true; grp.add(lid); this.lid = lid;
    const strap = new THREE.MeshStandardMaterial({ color: '#1d1f19', roughness: 0.7 }); for (const sx of [-0.35, 0.35]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.72), strap); s.position.set(sx, 0.32, 0); grp.add(s); }
    grp.position.copy(pos); grp.position.y += 9; grp.rotation.y = Math.random() * 6.28; g.root.add(grp); this.obj = grp; this.vy = 0;
    g.fx.cloud?.(pos.clone().add(V(0, 0.2, 0)), 'signal', null, '#d84a2a'); g.audio.whistle?.(pos, 1);
  }
  update(dt) {
    const o = this.obj; if (!o) return; this.t += dt;
    if (o.position.y > this.pos.y) { this.vy -= 14 * dt; o.position.y = Math.max(this.pos.y, o.position.y + this.vy * dt); if (o.position.y <= this.pos.y) { this.g.fx.dust(this.pos, 10, 1.2); this.g.audio.play('slam', this.pos, 0.8, [0.9, 1]); } }
    if (this.used) { this.lid.position.y = lerp(this.lid.position.y, 0.9, 1 - Math.exp(-dt * 6)); this.lid.rotation.z = lerp(this.lid.rotation.z, 0.9, 1 - Math.exp(-dt * 6)); }
  }
  take(a) {
    const g = this.g; if (this.used) return; this.used = true;
    a.hp = 100; a.armor = Math.max(a.armor, 100); a.nades = Math.max(a.nades || 0, 3); a.frags = Math.max(a.frags || 0, 2);
    for (const s of a.slots) if (s) s.mag = WEAPONS[s.id].mag;
    g.toast('Ravitaillé : soins, gilet, grenades et chargeurs', '#9ff59f'); g.audio.play('cloth', null, 0.8); g.audio.cash?.(false); g.fb?.reset?.();
    this.h.drawHud();
  }
  remove() { if (this.obj) { this.g.root.remove(this.obj); this.obj = null; } if (this.h.crate === this) this.h.crate = null; }
}
