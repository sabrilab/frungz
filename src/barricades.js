// Barricades à trois niveaux de matériau : léger (palettes / boucliers), acier, béton.
// - on pose toujours une barricade légère (rapide) ; □ / E devant une barricade de son camp la renforce d'un cran,
//   jusqu'au matériau que ses succès de la partie ont débloqué (sinon : réparer)
// - succès = « galons » : élimination, tir à la tête, assistance, capture de zone, barricade ennemie abattue
// - les bots en posent aussi, avec des règles pour que la ville reste jouable (plafond par camp, pas sur les drapeaux,
//   jamais en travers d'une ruelle, durée de vie limitée, seulement face à une menace réelle)
// Rendu : un maillage fusionné par matière et par (camp, niveau), géométries et matières partagées entre toutes les barricades.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BARRICADE, textTex } from './props.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

// hp : points de structure ; bul / exp : part des dégâts encaissés par balle / par explosion ; d : épaisseur ; chan : durée du renforcement
export const TIERS = [
  { id: 'leger', mat: { ordre: 'Polycarbonate', civils: 'Bois' }, nom: { ordre: 'Boucliers', civils: 'Palettes' }, hp: 260, bul: 1, exp: 1.5, d: 0.24, need: 0, chan: 0, col: '#e7b77a', imp: { ordre: 'metal', civils: 'world' } },
  { id: 'acier', mat: { ordre: 'Acier', civils: 'Acier' }, nom: { ordre: 'Grille anti-émeute', civils: 'Tôle de chantier' }, hp: 650, bul: 0.5, exp: 1, d: 0.24, need: 6, chan: 1.0, col: '#a9bccf', imp: { ordre: 'metal', civils: 'metal' } },
  { id: 'beton', mat: { ordre: 'Béton', civils: 'Béton' }, nom: { ordre: 'Muret béton', civils: 'Parpaings' }, hp: 1500, bul: 0.22, exp: 0.6, d: 0.56, need: 18, chan: 1.6, col: '#d6d0c4', imp: { ordre: 'world', civils: 'world' } },
];
// galons gagnés par succès
export const GALONS = { kill: 1, head: 1, assist: 0.5, capture: 3, wall: 1 };
const BOT_LIFE = 90; // s : une barricade de bot finit par céder (la ville ne se fige pas)

// ------------------------------------------------------------------ maillages
const MATS = {};
const mat = (c, o = {}) => MATS[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.75, metalness: o.m ?? 0, flatShading: true });
const TEX = {};
const texMat = (text, fg, size) => TEX[text + fg] ||= new THREE.MeshStandardMaterial({ map: textTex(text, { bg: null, fg, size }), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const CACHE = {};

// construit les géométries d'un (camp, niveau), fusionnées par matière
function build(team, tier) {
  const parts = new Map(); // matière → géométries
  const add = (m, g) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push(g); };
  const B = (m, w, h, d, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y, z); add(m, g); };
  const plane = (m, w, h, x, y, z, back = false, rz = 0) => { const g = new THREE.PlaneGeometry(w, h); if (rz) g.rotateZ(rz); if (back) g.rotateY(Math.PI); g.translate(x, y, z); add(m, g); };
  const W = BARRICADE.w, H = BARRICADE.h, [h0, h1] = [BARRICADE.holes[0][2], BARRICADE.holes[0][3]];
  const segs = [[-W / 2, -1.1], [-0.7, 0.7], [1.1, W / 2]];
  const inHole = (x, y) => y > h0 - 0.02 && y < h1 + 0.02 && ((x > -1.12 && x < -0.68) || (x > 0.68 && x < 1.12));
  // panneau plein percé de deux meurtrières
  const panel = (m, d, z = 0) => { B(m, W, h0, d, 0, h0 / 2, z); B(m, W, H - h1, d, 0, h1 + (H - h1) / 2, z); for (const [x0, x1] of segs) B(m, x1 - x0, h1 - h0, d, (x0 + x1) / 2, (h0 + h1) / 2, z); };
  const frameSlots = (m, d) => { for (const x of [-1.1, -0.7, 0.7, 1.1]) B(m, 0.05, h1 - h0 + 0.08, d, x, (h0 + h1) / 2, 0); for (const xc of [-0.9, 0.9]) { B(m, 0.45, 0.05, d, xc, h0, 0); B(m, 0.45, 0.05, d, xc, h1, 0); } };
  const ordre = team === 'ordre';
  if (tier === 0) {
    if (ordre) { // boucliers anti-émeute bleu nuit
      panel(mat('#1c2a4a', { m: 0.4, r: 0.4 }), 0.12);
      const t = texMat('POLICE', '#ffffff', 70); plane(t, 1.6, 0.4, 0, 0.7, 0.07); plane(t, 1.6, 0.4, 0, 0.7, -0.07, true);
      const chrome = mat('#d8d8d8', { m: 0.6, r: 0.4 }); B(chrome, W, 0.08, 0.14, 0, H, 0); B(mat('#c8102e'), W, 0.1, 0.14, 0, 1.0, 0);
      frameSlots(chrome, 0.15); for (const sx of [-1, 1]) B(mat('#555'), 0.1, 0.1, 0.8, sx * 1.8, 0.05, -0.2);
    } else { // palissade de palettes
      const wood = mat('#b48a5a'), dark = mat('#7a5a3a'); panel(wood, 0.1);
      for (let i = 1; i < 6; i++) { const y = i * 0.4; if (y > h0 && y < h1) { for (const [x0, x1] of segs) B(dark, x1 - x0, 0.03, 0.11, (x0 + x1) / 2, y, 0.005); } else B(dark, W, 0.03, 0.11, 0, y, 0.005); }
      for (const x of [-1.9, -0.9, 0, 0.9, 1.9]) B(dark, 0.12, H, 0.14, x, H / 2, -0.06);
      plane(texMat('FRUNGZ', '#ff4fa0', 72), 1.8, 0.5, 0, 0.7, 0.06, false, 0.06);
    }
  } else if (tier === 1) {
    if (ordre) { // grille anti-émeute : tôle d'acier sombre nervurée, bandeau POLICE, chevrons rouge et blanc, béquilles
      const steel = mat('#7d868f', { m: 0.45, r: 0.5 }), rib = mat('#a3abb3', { m: 0.5, r: 0.4 });
      panel(steel, 0.1);
      for (const y of [0.35, 0.8, 1.9]) B(rib, W, 0.07, 0.14, 0, y, 0);
      for (const x of [-1.95, -1.5, 1.5, 1.95]) B(rib, 0.08, H, 0.16, x, H / 2, 0);
      frameSlots(rib, 0.16);
      B(mat('#1c2a4a', { m: 0.4 }), W, 0.3, 0.12, 0, H - 0.15, 0.01);
      const t = texMat('POLICE', '#ffffff', 70); plane(t, 1.5, 0.3, 0, H - 0.15, 0.072); plane(t, 1.5, 0.3, 0, H - 0.15, -0.062, true);
      const red = mat('#c8102e', { r: 0.4 }), white = mat('#f2f2f2', { r: 0.3 });
      for (let i = 0; i < 6; i++) B(i % 2 ? white : red, 0.28, 0.16, 0.13, -1.75 + i * 0.7, 0.12, 0.01, 0, 0.5);
      for (const sx of [-1, 1]) B(mat('#2a2e33', { m: 0.6 }), 0.08, 0.08, 1.5, sx * 1.6, 0.75, -0.6, 0.85);
    } else { // tôle ondulée de chantier galvanisée, cadre en tubes, rouille et tag
      const galva = mat('#8f979e', { m: 0.7, r: 0.5 }), wave = mat('#a5adb4', { m: 0.7, r: 0.45 }), tube = mat('#4a4f55', { m: 0.6 }), rust = mat('#8a4b2a', { r: 0.9 });
      panel(galva, 0.08);
      for (let x = -W / 2 + 0.1; x < W / 2; x += 0.2) for (const [y0, y1] of [[0, h0], [h1, H]]) B(wave, 0.08, y1 - y0, 0.05, x, (y0 + y1) / 2, 0.055);
      for (let x = -W / 2 + 0.1; x < W / 2; x += 0.2) if (!inHole(x, (h0 + h1) / 2)) B(wave, 0.08, h1 - h0, 0.05, x, (h0 + h1) / 2, 0.055);
      for (const y of [0.05, H - 0.04]) B(tube, W + 0.1, 0.08, 0.1, 0, y, -0.06);
      for (const x of [-2, -0.9, 0.9, 2]) B(tube, 0.08, H, 0.1, x, H / 2, -0.06);
      frameSlots(tube, 0.14);
      B(rust, 0.6, 0.35, 0.09, -1.5, 0.4, 0.02); B(rust, 0.4, 0.5, 0.09, 1.6, 1.9, 0.02); B(rust, 0.3, 0.2, 0.09, 0.3, 2.1, 0.02);
      for (const sx of [-1, 1]) { B(mat('#c9b48a'), 0.5, 0.18, 0.6, sx * 1.6, 0.09, -0.35); }
      plane(texMat('FRUNGZ', '#ff4fa0', 72), 2.0, 0.55, 0, 0.75, 0.085, false, -0.05);
    }
  } else {
    if (ordre) { // muret béton (type GBA) : socle évasé, panneau épais, bandes rétro-réfléchissantes
      const beton = mat('#b9b4aa', { r: 0.95 }), beton2 = mat('#a49f95', { r: 0.95 });
      B(beton2, W, 0.35, 0.62, 0, 0.175, 0); B(beton, W, 0.3, 0.5, 0, 0.5, 0);
      panel(beton, 0.36);
      frameSlots(mat('#6e6a63', { m: 0.3 }), 0.4);
      const red = mat('#c8102e', { r: 0.4 }), white = mat('#f2f2f2', { r: 0.3 });
      for (let i = 0; i < 8; i++) B(i % 2 ? white : red, 0.5, 0.12, 0.38, -1.75 + i * 0.5, H - 0.25, 0);
      B(mat('#8c877e', { r: 0.95 }), W + 0.04, 0.06, 0.4, 0, H - 0.03, 0);
      const t = texMat('POLICE', '#1c2a4a', 70); plane(t, 1.6, 0.36, 0, 0.88, 0.185); plane(t, 1.6, 0.36, 0, 0.88, -0.185, true);
      for (const sx of [-1, 1]) B(mat('#3a3a3a', { m: 0.6 }), 0.12, 0.12, 0.66, sx * 1.95, 0.32, 0);
    } else { // mur de parpaings maçonné à la va-vite, sacs de sable au pied, tag
      const parp = mat('#a7a39b', { r: 1 }), joint = mat('#7d7a73', { r: 1 }), sac = mat('#bfa77a', { r: 1 });
      panel(parp, 0.4);
      for (let r = 1; r * 0.2 < H; r++) { const y = r * 0.2; if (y > h0 - 0.02 && y < h1 + 0.02) { for (const [x0, x1] of segs) B(joint, x1 - x0, 0.02, 0.42, (x0 + x1) / 2, y, 0); } else B(joint, W, 0.02, 0.42, 0, y, 0); }
      for (let r = 0; r * 0.2 < H - 0.05; r++) for (let x = -W / 2 + (r % 2 ? 0.2 : 0.4); x < W / 2; x += 0.4) { const y = r * 0.2 + 0.1; if (!inHole(x, y)) B(joint, 0.02, 0.18, 0.42, x, y, 0); }
      for (let i = 0; i < 6; i++) { const x = -1.9 + i * 0.76; for (const z of [0.45, -0.45]) B(sac, 0.7, 0.22, 0.4, x, 0.11, z, 0, (i % 2 ? 0.05 : -0.05)); }
      for (let i = 0; i < 5; i++) B(sac, 0.7, 0.2, 0.38, -1.5 + i * 0.75, 0.32, 0.45);
      plane(texMat('FRUNGZ', '#ff4fa0', 72), 2.2, 0.6, 0, 1.0, 0.205, false, 0.04);
      plane(texMat('TIENT BON', '#ffd23d', 64), 1.2, 0.3, -0.3, 1.95, 0.205, false, -0.03);
    }
  }
  const out = []; for (const [m, gs] of parts) { const g = mergeGeometries(gs, false); g.computeBoundingSphere(); out.push([g, m]); for (const x of gs) x.dispose(); }
  return out;
}
export function wallMesh(team, tier) {
  const parts = CACHE[team + tier] ||= build(team, tier);
  const g = new THREE.Group();
  for (const [geo, m] of parts) { const o = new THREE.Mesh(geo, m); const flat = m.transparent; o.castShadow = !flat; o.receiveShadow = !flat; g.add(o); }
  return g;
}

// ------------------------------------------------------------------ règles et méthodes du jeu
export function installBarricades(Game) {
  const P = Game.prototype;
  const tierOf = (a) => a.wallTier || 0;

  // plafond de barricades par camp (le joueur a toujours ses 3 : il pousse la plus vieille barricade de bot)
  P.wallCap = function () { return Math.max(6, Math.min(16, Math.round(4 + this.opts.teamSize * 0.25))); };

  // ---- galons : les succès de la partie débloquent l'acier puis le béton
  P.addGalons = function (a, n) {
    if (!a || a.gone) return; a.galons = (a.galons || 0) + n;
    let t = 0; for (let i = 0; i < TIERS.length; i++) if (a.galons >= TIERS[i].need) t = i;
    if (t <= tierOf(a)) { if (a === this.player) this.wallsDirty = 1; return; }
    a.wallTier = t; a.walls = Math.min(3, (a.walls ?? 3) + 1); // une charge offerte au passage de niveau
    if (a === this.player) {
      const T = TIERS[t]; this.wallsDirty = 1;
      this.bigText(`🧱 ${T.mat[a.team].toUpperCase()} DÉBLOQUÉ !`, `${T.nom[a.team]} · ${this.input.label('interact')} devant une barricade de ton camp pour la renforcer`, T.col, 't3');
      this.audio.play?.('uiSelect', null, 0.8);
    }
  };

  // ---- dégâts
  P.hitWall = function (w, dmg, by, blast = false) {
    const T = TIERS[w.tier]; w.hp -= dmg * (blast ? T.exp : T.bul); w.shake = 0.12;
    if (by === this.player || w.pos.distanceToSquared(this.player.pos) < 900) this.fx.burst(w.pos.clone().add(V(rnd(-1.5, 1.5), rnd(0.4, 2), 0)), blast ? 6 : 2, { color: T.id === 'leger' ? (w.team === 'ordre' ? '#1c2a4a' : '#b48a5a') : T.col, speed: 3, size: 0.06, life: 0.5 });
    if (w.hp <= 0) this.destroyWall(w, by);
    else if (by === this.player && w.team !== by.team) this.wallsHint = { w, t: this.time };
  };
  P.blastWalls = function (p, r, dmg, by) {
    for (const w of this.walls.slice()) { const d = w.pos.distanceTo(p); if (d < r + 1.5) this.hitWall(w, dmg * (1 - Math.max(0, d - 1.5) / r), by, true); }
  };
  P.blast = function (p, r, dmg, by) { this.world.cass?.blast(p, r, dmg, by); this.blastWalls(p, r, dmg, by); };
  P.destroyWall = function (w, by) {
    const i = this.walls.indexOf(w); if (i < 0) return; this.walls.splice(i, 1); this.root.remove(w.mesh);
    const j = this.world.dynamic.indexOf(w.col); if (j >= 0) this.world.dynamic.splice(j, 1); this.wallNav(w.pos);
    const T = TIERS[w.tier];
    this.fx.burst(w.pos.clone().add(V(0, 1, 0)), 10 + w.tier * 6, { color: T.id === 'leger' ? (w.team === 'ordre' ? '#1c2a4a' : '#b48a5a') : T.col, speed: 4, size: 0.2 + w.tier * 0.06, life: 1 });
    this.audio.play('debris', w.pos, 0.8 + w.tier * 0.1); if (w.tier === 2) this.audio.play('slam', w.pos, 0.7);
    if (by && by.team !== w.team) { this.addGalons(by, GALONS.wall); if (by === this.player) this.toast(`🧱 ${T.nom[w.team]} ennemie abattue · +${GALONS.wall} galon`, '#9ff59f'); }
  };

  // ---- pose : toujours en matériau léger ; règles communes + plafond par camp
  P.wallSpot = function (a, yaw) {
    const f = V(Math.sin(yaw), 0, Math.cos(yaw)); const p = a.pos.clone().addScaledVector(f, 2.4); p.y = this.world.groundY(p.x, p.z, p.y + 0.3);
    if (!this.world.free(...this.world.cell(p.x, p.z))) return { why: 'Pas de place ici' };
    if (this.walls.some((w) => w.pos.distanceTo(p) < 2.5)) return { why: 'Trop près d\'une autre barricade' };
    for (const z of this.zoneState) if (Math.hypot(p.x - z.center[0], p.z - z.center[1]) < 3.5) return { why: 'Pas sur le drapeau' };
    return { p };
  };
  // la barricade ferme-t-elle une ruelle ? (les deux bouts collés à un mur) : interdit aux bots
  P.wallClosesLane = function (p, yaw) {
    const ax = Math.cos(yaw), az = -Math.sin(yaw); let blocked = 0;
    for (const s of [-1, 1]) { let shut = false; for (const k of [0.6, 1.6, 2.8]) { const x = p.x + ax * s * (BARRICADE.w / 2 + k), z = p.z + az * s * (BARRICADE.w / 2 + k); if (!this.world.free(...this.world.cell(x, z))) { shut = true; break; } } if (shut) blocked++; }
    return blocked === 2;
  };
  P.placeWall = function (a, yawIn) {
    if (a.walls == null) a.walls = 3;
    if (a.walls < 1 || !a.alive || a.inCar) { if (a === this.player && a.alive) this.toast(`Barricade dans ${Math.ceil(a.wallT || 15)} s`, '#ff8080'); return null; }
    const yaw = yawIn ?? (a === this.player ? this.cam.yaw : a.yaw);
    const s = this.wallSpot(a, yaw); if (!s.p) { if (a === this.player) this.toast(s.why, '#ff8080'); return null; }
    const p = s.p; const team = this.walls.filter((w) => w.team === a.team);
    if (a.bot) { if (team.length >= this.wallCap() - 3 || this.wallClosesLane(p, yaw)) return null; }
    else if (team.length >= this.wallCap()) { const old = team.find((w) => w.owner?.bot); if (old) this.destroyWall(old); }
    a.walls--; if (!a.wallT) a.wallT = this.wallDelay(a);
    const mine = this.walls.filter((w) => w.owner === a); if (mine.length >= (a.bot ? 2 : 3)) this.destroyWall(mine[0]);
    const w = { team: a.team, owner: a, tier: 0, hp: TIERS[0].hp, t: 0, pos: p, yaw, born: this.time, life: a.bot ? BOT_LIFE : Infinity };
    this.setWallMesh(w);
    this.world.dynamic.push(w.col); this.walls.push(w); this.audio.build(p); this.wallNav(p);
    if (this.walls.length > 40) this.destroyWall(this.walls[0]);
    return w;
  };
  P.setWallMesh = function (w) {
    if (w.mesh) this.root.remove(w.mesh);
    const m = wallMesh(w.team, w.tier); m.position.copy(w.pos); m.rotation.y = w.yaw; m.scale.set(1, w.t > 0.2 ? 1 : 0.05, 1); this.root.add(m); w.mesh = m;
    const hz = Math.max(0.12, TIERS[w.tier].d / 2);
    if (!w.col) w.col = { type: 'box', x: w.pos.x, z: w.pos.z, hx: BARRICADE.w / 2, hz, h: BARRICADE.h, yaw: w.yaw, cs: Math.cos(w.yaw), sn: Math.sin(w.yaw), y0: w.pos.y, wall: w, holes: BARRICADE.holes };
    else w.col.hz = hz;
  };
  // renforcer d'un cran (jusqu'au niveau débloqué par celui qui renforce) ; au maximum : réparer
  P.wallAction = function (a, w) {
    const top = tierOf(a);
    if (w.tier < top) return { kind: 'up', to: w.tier + 1, dur: TIERS[w.tier + 1].chan };
    if (w.hp < TIERS[w.tier].hp * 0.98) return { kind: 'fix', dur: 0.9 };
    return null;
  };
  P.doWallAction = function (a, w, act) {
    if (!this.walls.includes(w)) return;
    if (act.kind === 'up') {
      const k = w.hp / TIERS[w.tier].hp; w.tier = act.to; w.hp = TIERS[w.tier].hp * Math.max(0.6, k); this.setWallMesh(w);
      if (w.owner?.bot && a !== w.owner) w.life = Math.max(w.life, this.time - w.born + BOT_LIFE * 0.6);
      this.fx.burst(w.pos.clone().add(V(0, 1.2, 0)), 12, { color: TIERS[w.tier].col, speed: 2.5, size: 0.1, life: 0.6 });
      this.audio.build(w.pos); this.audio.play(w.tier === 2 ? 'slam' : 'debris', w.pos, 0.5);
      if (a === this.player) this.toast(`🧱 Barricade renforcée : ${TIERS[w.tier].nom[w.team]}`, TIERS[w.tier].col);
    } else { w.hp = TIERS[w.tier].hp; this.audio.build(w.pos); if (a === this.player) this.toast('🧱 Barricade réparée', '#9ff59f'); }
  };
  // barricade de son camp devant soi (portée 2,8 m, dans un cône de ~70°)
  P.nearFriendlyWall = function (a, R = 2.8) {
    const f = V(Math.sin(a === this.player ? this.cam.yaw : a.yaw), 0, Math.cos(a === this.player ? this.cam.yaw : a.yaw)); let best = null, bd = R;
    for (const w of this.walls) {
      if (w.team !== a.team) continue;
      const dx = a.pos.x - w.pos.x, dz = a.pos.z - w.pos.z; const lx = dx * w.col.cs - dz * w.col.sn, lz = dx * w.col.sn + dz * w.col.cs;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - BARRICADE.w / 2), Math.max(0, Math.abs(lz) - w.col.hz)); if (d > bd) continue;
      const cx = w.pos.x + (lx > 0 ? 1 : -1) * Math.min(Math.abs(lx), BARRICADE.w / 2) * w.col.cs, cz = w.pos.z - (lx > 0 ? 1 : -1) * Math.min(Math.abs(lx), BARRICADE.w / 2) * w.col.sn;
      const to = V(cx - a.pos.x, 0, cz - a.pos.z); if (to.lengthSq() > 0.01 && to.normalize().dot(f) < 0.35 && d > 0.6) continue;
      bd = d; best = w;
    }
    return best;
  };
  // invite à l'écran du joueur (appelée par interactions)
  P.wallPrompt = function (a) {
    if (a.inCar) return null; const w = this.nearFriendlyWall(a); if (!w) return null;
    const I = this.input, act = this.wallAction(a, w), T = TIERS[w.tier];
    const hp = Math.round(Math.max(0, w.hp) / T.hp * 100);
    if (!act) {
      const next = TIERS[tierOf(a) + 1];
      return `🧱 ${T.nom[w.team]} · ${hp} %` + (next ? ` <span class="r">— ${next.mat[a.team]} à ${next.need} galons (tu en as ${fmtG(a.galons)})</span>` : ' <span class="r">— matériau maximal</span>');
    }
    if (I.pressed('interact') && !a.channel) this.startChannel(a, act.kind === 'up' ? `Renforcement : ${TIERS[act.to].mat[a.team].toLowerCase()}…` : 'Réparation…', act.dur, () => this.walls.includes(w) && !!this.wallAction(a, w), () => this.doWallAction(a, w, act), 'Interact');
    return act.kind === 'up'
      ? `<b>${I.label('interact')}</b> (maintenir) Renforcer en <span class="r" style="color:${TIERS[act.to].col}">${TIERS[act.to].mat[a.team]} · ${TIERS[act.to].nom[a.team]}</span> · ${hp} %`
      : `<b>${I.label('interact')}</b> (maintenir) Réparer <span class="r">${T.nom[w.team]} · ${hp} %</span>`;
  };

  // ---- à chaque image : pousse des barricades, tremblement aux impacts, fin de vie des barricades de bots
  P.updateWalls = function (dt) {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i]; w.t += dt; const m = w.mesh;
      m.scale.y = Math.min(1, 0.05 + w.t * 6);
      if (w.shake > 0) { w.shake -= dt; m.position.x = w.pos.x + rnd(-0.03, 0.03) * (w.shake > 0); m.position.z = w.pos.z + rnd(-0.03, 0.03) * (w.shake > 0); }
      const age = this.time - w.born;
      if (age > w.life - 1.2) { m.position.y = w.pos.y - Math.max(0, age - (w.life - 1.2)) * 1.6; if (age > w.life) this.destroyWall(w); }
    }
  };

  // ---- bots : quand et où poser, renforcer
  // un bot « bâtisseur » sur deux ; il pose seulement s'il tient (ou prend) une zone et voit un adversaire arriver, ou s'il est à découvert et blessé
  P.botWalls = function (b, dt) {
    const ai = b.ai; if (ai.builder == null) ai.builder = Math.random() < 0.5;
    if ((ai.wallThink = (ai.wallThink ?? rnd(1, 3)) - dt) > 0) return; ai.wallThink = rnd(1.5, 3);
    if (!b.alive || b.inCar || b.channel || b.bag.length) return;
    // renforcer une barricade de son camp toute proche
    if (ai.task?.kind !== 'wall' && (!ai.target || !ai.los) && (ai.builder || Math.random() < 0.3)) {
      const w = this.walls.find((w) => w.team === b.team && w.pos.distanceTo(b.pos) < 12 && this.wallAction(b, w) && !w.busy);
      if (w) { const s = w.pos.clone().addScaledVector(V(w.col.sn, 0, w.col.cs), ((b.pos.x - w.pos.x) * w.col.sn + (b.pos.z - w.pos.z) * w.col.cs) > 0 ? 1.3 : -1.3); return this.botGo(b, { kind: 'wall', wall: w, back: ai.task }, s); }
    }
    if (!ai.builder || (b.walls ?? 3) < 1 || this.time - (ai.lastWall || -99) < 20) return;
    const t = ai.target; if (!t || !ai.los) return; const dist = t.pos.distanceTo(b.pos); if (dist < 10 || dist > 50) return;
    const z = this.zoneState.find((z) => this.inZone(b, z));
    const holding = z && (z.owner === b.team || z.cap === b.team);
    const exposed = !z && b.hp < 60 && Math.random() < 0.5;
    if (!holding && !exposed) return;
    // pas plus de deux barricades par camp autour d'une même zone
    if (z && this.walls.filter((w) => w.team === b.team && Math.hypot(w.pos.x - z.center[0], w.pos.z - z.center[1]) < z.radius + 6).length >= 2) return;
    const yaw = Math.atan2(t.pos.x - b.pos.x, t.pos.z - b.pos.z);
    // déjà une barricade amie entre lui et la menace ?
    if (this.walls.some((w) => w.team === b.team && w.pos.distanceTo(b.pos) < 6)) return;
    if (this.placeWall(b, yaw)) { ai.lastWall = this.time; b.yaw = yaw; if (ai.task?.kind === 'zone') ai.hold = true; }
  };
  P.botWallTask = function (b, dt) {
    const ai = b.ai, t = ai.task, w = t.wall;
    if (!this.walls.includes(w) || !this.wallAction(b, w)) { w.busy = null; ai.task = t.back || null; ai.think = 0; return; }
    if (b.channel) return;
    if (w.pos.distanceTo(b.pos) < 2.6 || (!ai.path && w.pos.distanceTo(b.pos) < 3.4)) {
      b.wish.set(0, 0, 0); b.yaw = Math.atan2(w.pos.x - b.pos.x, w.pos.z - b.pos.z); w.busy = b; const act = this.wallAction(b, w);
      this.startChannel(b, 'barricade', act.dur, () => this.walls.includes(w), () => { w.busy = null; this.doWallAction(b, w, act); ai.task = t.back || null; ai.think = 0; }, 'Interact');
    } else if (!ai.path) { ai.task = t.back || null; ai.think = 0; }
  };
  // un bot sans arme lourde ne s'acharne pas sur du béton : il contourne
  P.botCanBreak = function (b, w) { return w.tier < 2 || (b.perk?.casse || 1) > 1 || b.frags > 0; };
}
const fmtG = (n) => (Math.round((n || 0) * 10) / 10).toString().replace('.', ',');
export { fmtG };
export const tierInfo = (a) => { const t = a.wallTier || 0, n = TIERS[t + 1]; return { t, T: TIERS[t], next: n, g: a.galons || 0 }; };
