// Barricades à trois niveaux de matériau : léger (palettes / boucliers), acier, béton.
// - on pose toujours une barricade légère (rapide) ; □ / E devant une barricade de son camp la renforce d'un cran,
//   jusqu'au matériau que ses succès de la partie ont débloqué (sinon : réparer)
// - succès = « galons » : élimination, tir à la tête, assistance, capture de zone, barricade ennemie abattue
// - les bots en posent aussi, avec des règles pour que la ville reste jouable (plafond par camp, pas sur les drapeaux,
//   jamais en travers d'une ruelle, durée de vie limitée, seulement face à une menace réelle)
// Rendu : un maillage fusionné par matière et par (camp, niveau), géométries et matières partagées entre toutes les barricades.
import * as THREE from 'three';
import { BARRICADE } from './props.js';
import { wallMesh, prewarmWallMeshes } from './barricades-mesh.js';
export { prewarmWallMeshes };
export { wallMesh };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// hp : points de structure ; bul / exp : part des dégâts encaissés par balle / par explosion ; d : épaisseur ; chan : durée du renforcement
export const TIERS = [
  { id: 'leger', mat: { ordre: 'Polycarbonate', civils: 'Bois' }, nom: { ordre: 'Boucliers', civils: 'Palettes' }, hp: 260, bul: 1, exp: 1.5, d: 0.24, need: 0, chan: 0, col: '#e7b77a', imp: { ordre: 'metal', civils: 'world' } },
  { id: 'acier', mat: { ordre: 'Acier', civils: 'Acier' }, nom: { ordre: 'Grille anti-émeute', civils: 'Tôle de chantier' }, hp: 650, bul: 0.5, exp: 1, d: 0.24, need: 6, chan: 1.0, col: '#a9bccf', imp: { ordre: 'metal', civils: 'metal' } },
  { id: 'beton', mat: { ordre: 'Béton', civils: 'Béton' }, nom: { ordre: 'Muret béton', civils: 'Parpaings' }, hp: 1500, bul: 0.22, exp: 0.6, d: 0.56, need: 18, chan: 1.6, col: '#d6d0c4', imp: { ordre: 'world', civils: 'world' } },
];
// galons gagnés par succès
export const GALONS = { kill: 1, head: 1, assist: 0.5, capture: 3, wall: 1 };
const BOT_LIFE = 90;
// aperçu de pose : vert (libre), doré (raccord bout à bout), rouge (impossible) ; vu à travers les murs
const ghostMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false });
const GHOST = { ok: ghostMat('#7dffa8'), snap: ghostMat('#ffd76a'), bad: ghostMat('#ff4a4a') }; // s : une barricade de bot finit par céder (la ville ne se fige pas)

// ------------------------------------------------------------------ règles et méthodes du jeu
export function installBarricades(Game) {
  const P = Game.prototype;
  const tierOf = (a) => a.wallTier || 0;
  const sound = (w) => (w.tier === 1 ? 'metal' : w.tier === 2 ? 'beton' : 'bois');
  // couleur des éclats : celle de la matière touchée
  const CHIP = { ordre: ['#1a2440', '#3a4450', '#a9a59c'], civils: ['#a88762', '#9aa1a8', '#a29e95'] };
  const chip = (w) => CHIP[w.team][w.tier];
  // point de la face de la barricade (repère local x le long, y hauteur) → monde
  const onWall = (w, lx, ly, side = 0) => V(w.pos.x + lx * w.col.cs + side * w.col.sn, w.pos.y + ly, w.pos.z - lx * w.col.sn + side * w.col.cs);
  // nuage de poussière le long du pied (pose, renforcement, effondrement)
  P.wallDust = function (w, n = 5, power = 1) { if (w.pos.distanceToSquared(this.player.pos) > 3600) return; for (let k = 0; k < n; k++) this.fx.dust(onWall(w, -1.8 + 3.6 * k / Math.max(1, n - 1), 0, rnd(-0.4, 0.4)), 2, power); };

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
    const T = TIERS[w.tier]; w.hp -= dmg * (blast ? T.exp : T.bul); w.shake = blast ? 0.3 : 0.1;
    if (by === this.player || w.pos.distanceToSquared(this.player.pos) < 900) {
      const side = by ? Math.sign((by.pos.x - w.pos.x) * w.col.sn + (by.pos.z - w.pos.z) * w.col.cs) || 1 : 1, p = onWall(w, rnd(-1.8, 1.8), rnd(0.3, 2.1), side * 0.2);
      this.fx.burst(p, blast ? 10 : 3, { color: chip(w), speed: blast ? 5 : 2.5, size: w.tier === 2 ? 0.05 : 0.035, life: 0.7, normal: V(w.col.sn * side, 0.3, w.col.cs * side) });
      if (w.tier !== 1 && (blast || Math.random() < 0.3)) this.fx.dust(p, blast ? 4 : 1, 0.5);
      if (blast) this.audio.material(sound(w), w.pos, 0.7);
    }
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
    const T = TIERS[w.tier]; this.fx.clearDecals?.(w.pos, 2.8);
    for (let k = 0; k < 5; k++) this.fx.burst(onWall(w, -1.6 + k * 0.8, rnd(0.4, 1.8)), 3 + w.tier * 2, { color: chip(w), speed: 4.5, size: 0.08 + w.tier * 0.05, life: 1.3 });
    this.wallDust(w, 7, 1.4 + w.tier * 0.4); this.audio.material(sound(w), w.pos, 1); this.audio.play('debris', w.pos, 0.8 + w.tier * 0.1);
    if (by && by.team !== w.team) { this.addGalons(by, GALONS.wall); if (by === this.player) this.toast(`🧱 ${T.nom[w.team]} ennemie abattue · +${GALONS.wall} galon`, '#9ff59f'); }
  };

  // ---- pose : toujours en matériau léger ; règles communes + plafond par camp
  // at : point visé (aperçu du joueur) ; sans at : 2,4 m devant (bots, pose rapide)
  P.wallSpot = function (a, yaw, at) {
    const f = V(Math.sin(yaw), 0, Math.cos(yaw)); const p = at ? at.clone() : a.pos.clone().addScaledVector(f, 2.4); p.y = this.world.groundY(p.x, p.z, (at ? at.y : p.y) + 0.3);
    const ax = Math.cos(yaw), az = -Math.sin(yaw), W2 = BARRICADE.w / 2, W = this.world;
    // ni chevauchement ni croisement avec une autre barricade (sauf la voisine raccordée bout à bout)
    const segPt = (w, x, z) => { x -= w.pos.x; z -= w.pos.z; const l = Math.max(-W2, Math.min(W2, x * w.col.cs - z * w.col.sn)); return Math.hypot(x - l * w.col.cs, z + l * w.col.sn); };
    const near = this.walls.filter((w) => w.pos.distanceToSquared(p) < 81);
    for (const w of near) { if (w === at?.snap) continue; let m = 1e9; for (const k of [-1, -0.5, 0, 0.5, 1]) m = Math.min(m, segPt(w, p.x + ax * W2 * k, p.z + az * W2 * k)); if (w.pos.distanceTo(p) < 2.5 || m < 0.9) return { p, why: 'Trop près d\'une autre barricade' }; }
    // toute la longueur doit tenir : pas dans un mur, pas dans l'eau, sol à peu près plat (les cases d'une barricade voisine ne comptent pas)
    for (const k of [-0.9, -0.45, 0, 0.45, 0.9]) {
      const x = p.x + ax * W2 * k, z = p.z + az * W2 * k;
      if (!W.free(...W.cell(x, z)) && !near.some((w) => segPt(w, x, z) < 1.3)) return { p, why: 'Pas de place ici' };
      if (W.inWater?.(x, z)) return { p, why: 'Pas dans l\'eau' };
      if (Math.abs(k) > 0.8 && Math.abs(W.groundY(x, z, p.y + 0.6) - p.y) > 0.45) return { p, why: 'Sol trop en pente' };
    }
    for (const z of this.zoneState) if (Math.hypot(p.x - z.center[0], p.z - z.center[1]) < 3.5) return { p, why: 'Pas sur le drapeau' };
    // personne coincé dedans (ni soi, ni un coéquipier, ni un ennemi)
    for (const o of this.actors) {
      if (!o.alive || o.inCar) continue; const dx = o.pos.x - p.x, dz = o.pos.z - p.z;
      if (Math.abs(dx * ax + dz * az) < W2 + 0.25 && Math.abs(dx * az - dz * ax) < 0.6 && Math.abs(o.pos.y - p.y) < 2) return { p, why: o === a ? 'Recule un peu' : 'Quelqu\'un est dans le passage' };
    }
    return { p };
  };
  // aperçu du joueur : point visé au réticule (1,8 à 5 m), raccord bout à bout avec une barricade de son camp
  P.buildAim = function (a, noSnap) {
    const yaw = this.cam.yaw, f = V(Math.sin(yaw), 0, Math.cos(yaw)); const d = V(); this.camera.getWorldDirection(d);
    let dist = 2.6;
    if (d.y < -0.06) { const h = this.world.ray(this.camera.position, d, 40); const e = h ? this.camera.position.clone().addScaledVector(d, h.t) : null; if (e) dist = Math.hypot(e.x - a.pos.x, e.z - a.pos.z); else dist = 5; }
    dist = Math.max(1.8, Math.min(5, dist));
    const at = a.pos.clone().addScaledVector(f, dist); let wy = yaw, snap = null, bd = 2.4;
    for (const w of this.walls) {
      if (noSnap || w.team !== a.team || w.pos.distanceToSquared(at) > 49) continue;
      let dy = Math.abs(((yaw - w.yaw) % Math.PI + Math.PI) % Math.PI); dy = Math.min(dy, Math.PI - dy); if (dy > 1.1) continue;
      for (const s of [-1, 1]) { const e = V(w.pos.x + Math.cos(w.yaw) * s * BARRICADE.w, w.pos.y, w.pos.z - Math.sin(w.yaw) * s * BARRICADE.w); const dd = Math.hypot(e.x - at.x, e.z - at.z); if (dd < bd) { bd = dd; snap = w; at.set(e.x, e.y, e.z); } }
    }
    if (snap) { wy = snap.yaw; if (Math.cos(wy - yaw) < 0) wy += Math.PI; }
    at.snap = snap; return { at, yaw: wy, snap };
  };
  // appui sur Q / ↓ / bouton Barricade : on tient pour viser, on relâche pour poser (un appui bref pose aussi)
  P.buildPress = function (a) {
    if (a.walls == null) a.walls = 3;
    if (a.carryTurret || this.nearTurret?.(a, true) || a.walls < 1 || !a.alive || a.inCar || a.channel) { this.placeWall(a); return; }
    this.building = { t: 0 };
  };
  P.buildEnd = function () { this.building = null; if (this.wallGhost) this.wallGhost.visible = false; };
  P.updateBuild = function (a, dt) {
    const B = this.building; if (!B) return;
    if (!a.alive || a.inCar || a.carryTurret || a.channel || a.walls < 1) { this.buildEnd(); return; }
    B.t += dt; const I = this.input, T = TIERS[0]; let A = this.buildAim(a), s = this.wallSpot(a, A.yaw, A.at);
    if (s.why && A.snap) { A = this.buildAim(a, true); s = this.wallSpot(a, A.yaw, A.at); } // raccord impossible : pose libre
    // place prise (potelet, arbre, autre barricade) : on cherche tout seul un peu plus près ou plus loin dans l'axe
    if (s.why && !A.snap && /place|Trop près|Recule/.test(s.why)) {
      const f = V(Math.sin(A.yaw), 0, Math.cos(A.yaw)), d0 = Math.hypot(A.at.x - a.pos.x, A.at.z - a.pos.z);
      for (const o of [0.5, -0.5, 1, -1, 1.5, -1.5]) { const d = d0 + o; if (d < 1.8 || d > 5.5) continue; const at = a.pos.clone().addScaledVector(f, d); at.y = A.at.y; const t = this.wallSpot(a, A.yaw, at); if (!t.why) { s = t; A.at = at; break; } }
    }
    let g = this.wallGhost;
    if (!g || g.userData.team !== a.team) { if (g) this.root.remove(g); g = this.wallGhost = wallMesh(a.team, 0); g.userData.team = a.team; g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.renderOrder = 10; } }); g.children.slice(-2).forEach((o) => { o.visible = false; o.userData.ghostSkip = true; }); this.root.add(g); }
    g.visible = true; g.position.copy(s.p); g.rotation.y = A.yaw;
    const m = s.why ? GHOST.bad : A.snap ? GHOST.snap : GHOST.ok;
    if (g.userData.mat !== m) { g.userData.mat = m; g.traverse((o) => { if (o.isMesh && !o.userData.ghostSkip) o.material = m; }); }
    if (A.snap !== B.snap) { B.snap = A.snap; if (A.snap) this.audio.click?.(); }
    // pulsation légère : on voit que c'est un aperçu
    m.opacity = 0.46 + 0.1 * Math.sin(this.time * 7);
    if (!I.down('build')) { // relâché : on pose (ou on dit pourquoi pas)
      this.buildEnd();
      if (s.why) { this.toast(s.why, '#ff8080'); return; }
      const w = this.placeWall(a, A.yaw, A.at); if (w && A.snap) this.toast(`🧱 ${T.nom[a.team]} raccordées`, '#9ff59f');
      return;
    }
    const key = I.label('build');
    this.ui.prompt = s.why ? `🧱 <span class="r" style="color:#ff8080">${s.why}</span>`
      : `Relâche <b>${key}</b> : poser ${T.nom[a.team].toLowerCase()}${A.snap ? ' <span class="r" style="color:#ffd76a">— raccord à la barricade voisine</span>' : ''} <span class="r">(${a.walls} en réserve)</span>`;
  };
  // la barricade ferme-t-elle une ruelle ? (les deux bouts collés à un mur) : interdit aux bots
  P.wallClosesLane = function (p, yaw) {
    const ax = Math.cos(yaw), az = -Math.sin(yaw); let blocked = 0;
    for (const s of [-1, 1]) { let shut = false; for (const k of [0.6, 1.6, 2.8]) { const x = p.x + ax * s * (BARRICADE.w / 2 + k), z = p.z + az * s * (BARRICADE.w / 2 + k); if (!this.world.free(...this.world.cell(x, z))) { shut = true; break; } } if (shut) blocked++; }
    return blocked === 2;
  };
  P.placeWall = function (a, yawIn, at) {
    if (a.walls == null) a.walls = 3;
    if (a.walls < 1 || !a.alive || a.inCar) { if (a === this.player && a.alive) this.toast(`Barricade dans ${Math.ceil(a.wallT || 15)} s`, '#ff8080'); return null; }
    const yaw = yawIn ?? (a === this.player ? this.cam.yaw : a.yaw);
    const s = this.wallSpot(a, yaw, at); if (s.why) { if (a === this.player) this.toast(s.why, '#ff8080'); return null; }
    const p = s.p; const team = this.walls.filter((w) => w.team === a.team);
    if (a.bot) { if (team.length >= this.wallCap() - 3 || this.wallClosesLane(p, yaw)) return null; }
    else if (team.length >= this.wallCap()) { const old = team.find((w) => w.owner?.bot); if (old) this.destroyWall(old); }
    a.walls--; if (!a.wallT) a.wallT = this.wallDelay(a);
    const mine = this.walls.filter((w) => w.owner === a); if (mine.length >= (a.bot ? 2 : 3)) this.destroyWall(mine[0]);
    const w = { team: a.team, owner: a, tier: 0, hp: TIERS[0].hp, t: 0, pos: p, yaw, born: this.time, life: a.bot ? BOT_LIFE : Infinity };
    this.setWallMesh(w); w.anim = { k: 'drop', t: 0, vy: 0, y: 0.9 };
    this.world.dynamic.push(w.col); this.walls.push(w); this.audio.play('cloth', p, 0.6); this.wallNav(p);
    if (this.walls.length > 40) this.destroyWall(this.walls[0]);
    return w;
  };
  P.setWallMesh = function (w) {
    if (w.mesh) this.root.remove(w.mesh);
    const m = wallMesh(w.team, w.tier); m.position.copy(w.pos); m.rotation.y = w.yaw; this.root.add(m); w.mesh = m; w.lean = 0;
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
      const k = w.hp / TIERS[w.tier].hp, old = w.mesh; w.mesh = null; w.tier = act.to; w.hp = TIERS[w.tier].hp * Math.max(0.6, k); this.setWallMesh(w);
      if (old) { this.root.add(old); (this.wallOld ||= []).push({ m: old, t: 0, y: w.pos.y }); }
      w.anim = { k: 'rise', t: 0 }; w.mesh.position.y = w.pos.y - BARRICADE.h; this.fx.clearDecals?.(w.pos, 2.8);
      if (w.owner?.bot && a !== w.owner) w.life = Math.max(w.life, this.time - w.born + BOT_LIFE * 0.6);
      this.wallDust(w, 6, 1.1); this.audio.material(sound(w), w.pos, 0.8);
      if (a === this.player) this.toast(`🧱 Barricade renforcée : ${TIERS[w.tier].nom[w.team]}`, TIERS[w.tier].col);
    } else { w.hp = TIERS[w.tier].hp; this.fx.clearDecals?.(w.pos, 2.8); this.wallDust(w, 3, 0.6); this.audio.material(sound(w), w.pos, 0.6); if (a === this.player) this.toast('🧱 Barricade réparée', '#9ff59f'); }
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
  // l'aperçu de pose passe après les autres invites (il les remplace tant qu'on tient la touche)
  const interactions = P.interactions;
  P.interactions = function (a, dt) { interactions.call(this, a, dt); if (a === this.player) this.updateBuild(a, dt); };
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
    if (!this._wallsWarm) { this._wallsWarm = 1; try { const g = new THREE.Group(); for (const t of ['ordre', 'civils']) for (const k of [0, 1, 2]) { const m = wallMesh(t, k); m.position.set(0, -400, 0); g.add(m); } this.root.add(g); this.renderer?.compile?.(this.scene, this.camera); this.root.remove(g); } catch (e) { console.warn('barricades : préchauffage', e); } }
    if (this.wallOld?.length) for (let i = this.wallOld.length - 1; i >= 0; i--) { const o = this.wallOld[i]; o.t += dt; o.m.position.y = o.y - BARRICADE.h * Math.min(1, (o.t / 0.45) ** 2); if (o.t > 0.45) { this.root.remove(o.m); this.wallOld.splice(i, 1); } }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i]; w.t += dt; const m = w.mesh, A = w.anim;
      if (A) { A.t += dt;
        if (A.k === 'drop') { // la barricade est lâchée d'un peu haut, tombe, rebondit à peine, soulève la poussière
          A.vy -= 22 * dt; A.y += A.vy * dt; if (A.y <= 0) { A.y = 0; if (A.vy < -2) { this.wallDust(w, 6, 0.9); this.audio.material(sound(w), w.pos, 0.9); A.vy = -A.vy * 0.18; } else { A.vy = 0; w.anim = null; } }
          m.position.y = w.pos.y + A.y; m.rotation.z = A.y * 0.06; }
        else if (A.k === 'rise') { // le nouveau matériau monte du sol (on le dresse), l'ancien s'enfonce
          const k = Math.min(1, A.t / 0.5), e = 1 - Math.pow(1 - k, 3); m.position.y = w.pos.y - BARRICADE.h * (1 - e); if (k >= 1) { w.anim = null; this.wallDust(w, 4, 0.7); this.audio.play('thud', w.pos, 0.5); } } }
      if (w.shake > 0) { w.shake -= dt; const a = w.shake > 0 ? 0.025 : 0; m.position.x = w.pos.x + rnd(-a, a); m.position.z = w.pos.z + rnd(-a, a); }
      // dégâts visibles : fissures qui s'étendent, la barricade finit par pencher
      const dmgK = 1 - Math.max(0, w.hp) / TIERS[w.tier].hp, cm = m.userData.crack;
      if (cm) { const o = sstep(0.25, 0.85, dmgK); cm.opacity = o * 0.8; for (const c of m.children) if (c.material === cm) c.visible = o > 0.02; }
      if (!A) { w.lean += ((dmgK > 0.55 ? (dmgK - 0.55) * 0.12 : 0) - w.lean) * Math.min(1, dt * 3); m.rotation.x = w.lean; }
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
