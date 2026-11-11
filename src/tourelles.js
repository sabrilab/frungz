// Tourelles automatiques (atout de série, 6 éliminations) : on la pose, elle se monte, elle balaie la rue et tire seule.
// - trois niveaux : 1 mitrailleuse ; 2 double canon rotatif, plus solide ; 3 double canon + nacelle de roquettes, blindée
// - □ / E (maintenir) devant une tourelle de son camp : l'améliorer (niveau débloqué par les galons de la partie, comme les
//   barricades) ou la réparer ; ↓ / Q devant la sienne : la démonter et la porter, puis R2 / clic pour la reposer ailleurs
// - les bots en posent (près de la zone qu'ils tiennent), les améliorent, et s'en prennent aux tourelles ennemies
//   (balles, grenades ; les explosions de tous les lanceurs les abîment)
// Modèle construit en code, design propre à Frungz : trépied qui se déplie, mât qui monte, tête qui pivote, œil qui
// passe du vert (veille) à l'orange (acquisition, bip) puis au rouge (tir), canons qui reculent et tournent.
// Coût : recherche de cible 4 fois par seconde, une poignée de tourelles par camp, animation coupée loin de la caméra.
import * as THREE from 'three';
import { THROWS, solveThrow } from './throws.js';
import { textTex } from './props.js';
import { fmtG } from './barricades.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const pop = (k) => { k = clamp(k, 0, 1); return 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k) - (1 - ease(k)); };

THROWS.tourelle = { spell: 1, instant: 1, nom: 'Tourelle', icon: '', ico: 'turret', r: 0, col: '#7fe0ff' };

// niveaux : need = galons pour l'améliorer jusque-là ; chan = durée du montage ; armor = part des dégâts de balle encaissés
// (blindée : il faut s'y mettre à plusieurs ou sortir les explosifs, qui font ×2,6 par rapport aux balles)
export const TLV = [
  { hp: 320, range: 28, dmg: 10, rps: 6, turn: 3.2, spread: 0.026, need: 0, chan: 0, armor: 0.5 },
  { hp: 460, range: 32, dmg: 9, rps: 11, turn: 4.8, spread: 0.024, need: 8, chan: 1.6, armor: 0.42 },
  { hp: 620, range: 36, dmg: 10, rps: 12, turn: 6, spread: 0.022, need: 15, chan: 2.2, armor: 0.35, rockets: 1 },
];
export const TNOM = {
  ordre: ['Tourelle de garde', 'Tourelle de garde Mk II', 'Tourelle de garde Mk III'],
  civils: ['Tourelle bricolée', 'Tourelle bricolée ++', 'La Frungzinette'],
};
const TSUB = ['mitrailleuse', 'double canon rotatif', 'double canon + roquettes'];
const BUILD = 1.9, REPOSE = 1.1, BOT_LIFE = 75, R_COL = 0.45, H_COL = 1.3, HEAD_Y = 0.98;
const EYE = { idle: new THREE.Color('#3dff8a'), lock: new THREE.Color('#ffb02e'), fire: new THREE.Color('#ff2a2a'), off: new THREE.Color('#222') };

// ------------------------------------------------------------------ maillages (géométries et matières partagées)
const MAT = {};
const mat = (c, o = {}) => MAT[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.6, metalness: o.m ?? 0.2, flatShading: true, emissive: o.e ? c : '#000', emissiveIntensity: o.e || 0 });
const TXT = {};
const txtMat = (t, fg) => TXT[t + fg] ||= new THREE.MeshStandardMaterial({ map: textTex(t, { bg: null, fg, size: 64 }), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const GEO = {};
const box = (w, h, d) => GEO[`b${w}|${h}|${d}`] ||= new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 10) => GEO[`c${r0}|${r1}|${h}|${n}`] ||= new THREE.CylinderGeometry(r0, r1, h, n);
const tube = (r, h, n = 8) => GEO[`t${r}|${h}|${n}`] ||= new THREE.CylinderGeometry(r, r, h, n).rotateX(Math.PI / 2); // couché le long de z
const plane = (w, h) => GEO[`p${w}|${h}`] ||= new THREE.PlaneGeometry(w, h);
const GHOST = { ok: new THREE.MeshBasicMaterial({ color: '#5fd7ff', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }), bad: new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }) };
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };

// style : Brigade = bleu nuit, bandeau blanc, optique à bulle ; Frungz = jaune de chantier, scotch gris, webcam scotchée, tag rose
function palette(team) {
  return team === 'ordre'
    ? { body: mat('#1c2a4a', { m: 0.45, r: 0.4 }), trim: mat('#e9eef5', { r: 0.35 }), dark: mat('#23272d', { m: 0.6, r: 0.45 }), steel: mat('#8d969f', { m: 0.7, r: 0.35 }), legs: mat('#2f343b', { m: 0.6, r: 0.5 }), accent: mat('#c8102e', { r: 0.4 }), tag: ['POLICE', '#ffffff'] }
    : { body: mat('#d8a531', { m: 0.15, r: 0.7 }), trim: mat('#9a9a96', { r: 0.9 }), dark: mat('#26221e', { m: 0.4, r: 0.6 }), steel: mat('#8a8f93', { m: 0.6, r: 0.5 }), legs: mat('#7a5a3a', { r: 0.85 }), accent: mat('#ff4fa0', { r: 0.5 }), tag: ['FRUNGZ', '#ff4fa0'] };
}

// construit une tourelle animable ; ghost : silhouette translucide (pose en cours)
export function turretMesh(team, level, ghost = null) {
  const P = palette(team), civ = team === 'civils';
  const M = ghost ? () => ghost : (m) => m;
  const g = new THREE.Group(), u = { legs: [], spin: [], barrels: [], muzzles: [] };
  // trépied : trois pieds qui se déplient autour d'un moyeu (tubes de chantier chez les Frungz)
  const hub = new THREE.Group(); hub.position.y = 0.5; g.add(hub);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI * 2 / 3 + Math.PI / 6; hub.add(arm);
    const leg = new THREE.Group(); arm.add(leg);
    leg.add(mesh(box(0.07, 0.62, 0.07), M(P.legs), 0, -0.31, 0), mesh(box(0.16, 0.04, 0.2), M(P.dark), 0, -0.62, 0.02));
    if (civ) leg.add(mesh(box(0.09, 0.08, 0.09), M(P.trim), 0, -0.3, 0)); // tour de scotch
    u.legs.push(leg);
  }
  hub.add(mesh(cyl(0.13, 0.15, 0.12, 12), M(P.dark)));
  // mât qui monte au montage
  const post = new THREE.Group(); post.position.y = 0.5; g.add(post); u.post = post;
  post.add(mesh(cyl(0.06, 0.07, 0.42, 10), M(P.steel), 0, 0.21, 0));
  // caisse de munitions accrochée au mât
  post.add(mesh(box(0.2, 0.16, 0.13), M(civ ? P.accent : P.dark), 0.15, 0.12, -0.08));
  // tête qui pivote (lacet), puis berceau des canons (tangage)
  const yaw = new THREE.Group(); yaw.position.y = HEAD_Y; g.add(yaw); u.yaw = yaw;
  yaw.add(mesh(cyl(0.2, 0.22, 0.06, 14), M(P.dark), 0, -0.03, 0));
  const body = new THREE.Group(); yaw.add(body); u.body = body;
  const W = level >= 1 ? 0.5 : 0.4;
  body.add(mesh(box(W, 0.3, 0.5), M(P.body), 0, 0.15, 0));
  body.add(mesh(box(W + 0.02, 0.06, 0.52), M(P.trim), 0, 0.2, 0)); // bandeau (blanc / scotch)
  body.add(mesh(box(W - 0.06, 0.14, 0.16), M(P.body), 0, 0.33, -0.12)); // capot arrière
  if (level >= 2) { // blindage : plaques latérales inclinées
    for (const sx of [-1, 1]) { const pl = mesh(box(0.05, 0.36, 0.56), M(civ ? P.steel : P.body), sx * (W / 2 + 0.05), 0.16, 0.02); pl.rotation.z = sx * 0.18; body.add(pl); }
    body.add(mesh(box(W + 0.14, 0.05, 0.08), M(P.accent), 0, 0.02, 0.27));
  }
  if (!ghost) for (const sx of [-1, 1]) { const t = mesh(plane(0.36, 0.09), txtMat(...P.tag), sx * (W / 2 + 0.012 + (level >= 2 ? 0.1 : 0)), 0.1, 0); t.rotation.y = sx * Math.PI / 2; body.add(t); }
  // œil (capteur) : bulle optique pour la Brigade, webcam scotchée pour les Frungz ; matière propre à chaque tourelle
  const eyeM = ghost || new THREE.MeshStandardMaterial({ color: '#111', emissive: EYE.off.clone(), emissiveIntensity: 2.2, roughness: 0.2 }); if (!ghost) eyeM.userData.own = true;
  if (civ) { body.add(mesh(box(0.16, 0.1, 0.06), M(P.dark), 0, 0.37, 0.12)); const e = mesh(tube(0.035, 0.04, 10), eyeM, 0, 0.37, 0.16); body.add(e); u.eye = e; }
  else { body.add(mesh(cyl(0.075, 0.09, 0.05, 12), M(P.dark), 0, 0.33, 0.12)); const e = new THREE.Mesh(GEO.eye ||= new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), eyeM); e.position.set(0, 0.355, 0.12); body.add(e); u.eye = e; }
  // antenne (Brigade : gyrophare) ; Frungz : antenne pliée
  if (civ) { const an = mesh(box(0.015, 0.3, 0.015), M(P.dark), -0.16, 0.45, -0.18); an.rotation.z = 0.35; body.add(an); }
  else { body.add(mesh(box(0.02, 0.18, 0.02), M(P.dark), -0.15, 0.42, -0.16)); const gy = mesh(box(0.06, 0.05, 0.06), ghost || mat('#2a6bff', { e: 2 }), -0.15, 0.52, -0.16); body.add(gy); u.gyro = gy; }
  // berceau et canons
  const pitch = new THREE.Group(); pitch.position.set(0, 0.16, 0.1); yaw.add(pitch); u.pitch = pitch;
  if (level === 0) {
    const b = new THREE.Group(); pitch.add(b); u.barrels.push(b);
    b.add(mesh(box(0.14, 0.14, 0.34), M(P.dark), 0, 0, 0.3), mesh(tube(0.032, 0.46), M(P.steel), 0, 0, 0.68), mesh(tube(0.05, 0.07), M(P.dark), 0, 0, 0.9));
    for (let i = 0; i < 4; i++) b.add(mesh(box(0.012, 0.012, 0.2), M(P.dark), Math.cos(i * 1.57) * 0.045, Math.sin(i * 1.57) * 0.045, 0.5)); // ailettes
    u.muzzles.push(V(0, 0, 0.95));
  } else {
    for (const sx of [-1, 1]) {
      const b = new THREE.Group(); b.position.x = sx * (W / 2 + 0.06); pitch.add(b); u.barrels.push(b);
      b.add(mesh(box(0.13, 0.15, 0.26), M(P.dark), 0, 0, 0.18), mesh(tube(0.07, 0.05, 12), M(P.steel), 0, 0, 0.36));
      const sp = new THREE.Group(); sp.position.z = 0.6; b.add(sp); u.spin.push(sp);
      for (let i = 0; i < 4; i++) sp.add(mesh(tube(0.019, 0.52, 6), M(P.steel), Math.cos(i * 1.57) * 0.042, Math.sin(i * 1.57) * 0.042, 0));
      sp.add(mesh(tube(0.065, 0.04, 10), M(P.dark), 0, 0, 0.12), mesh(tube(0.065, 0.04, 10), M(P.dark), 0, 0, -0.2));
      u.muzzles.push(V(b.position.x, 0, 0.88));
    }
    pitch.add(mesh(box(W - 0.04, 0.06, 0.1), M(P.dark), 0, -0.07, 0.12)); // essieu
  }
  if (level >= 2) { // nacelle de roquettes sur le dessus (bloc 2 × 2 tubes), suit le tangage
    const pod = new THREE.Group(); pod.position.set(0, 0.36, 0.02); pitch.add(pod); u.pod = pod;
    pod.add(mesh(box(0.3, 0.2, 0.36), M(civ ? P.accent : P.body), 0, 0, 0));
    for (const x of [-0.07, 0.07]) for (const y of [-0.05, 0.05]) pod.add(mesh(tube(0.04, 0.03, 8), M(P.dark), x, y, 0.19));
    if (!ghost) { const s = mesh(plane(0.28, 0.07), txtMat(civ ? 'BOUM' : 'GIGN', civ ? '#ffffff' : '#ffd23d'), 0, 0.101, 0); s.rotation.x = -Math.PI / 2; pod.add(s); }
  }
  g.userData = u;
  if (!ghost) g.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ------------------------------------------------------------------ règles et méthodes du jeu
export function installTurrets(Game) {
  const P = Game.prototype;
  const T0 = () => [];
  const lvlUnlocked = (a) => { const g = a.galons || 0; let l = 0; for (let i = 0; i < TLV.length; i++) if (g >= TLV[i].need) l = i; return l; };
  const nom = (T, l = T.level) => TNOM[T.team][l];
  P.turretCap = function () { return Math.max(4, Math.min(10, Math.round(3 + this.opts.teamSize / 8))); };

  // ---- activation de l'atout : le joueur porte la tourelle (silhouette devant lui) ; un bot la pose tout de suite
  const activate = P.activateStreak;
  P.activateStreak = function (a, id) {
    if (id !== 'tourelle') return activate.call(this, a, id);
    const me = a === this.player;
    if (me && a.carryTurret) { this.toast('Pose d\'abord la tourelle que tu portes', '#ccc'); return; }
    if (!me) { const yaw = this.botTurretYaw(a); if (!this.placeTurret(a, yaw, 0)) { a.ai.streakT = rnd(3, 6); return; } }
    const i = a.rewards.lastIndexOf(id); if (i >= 0) a.rewards.splice(i, 1); this.streakCd[a.team] = this.time + 6; this.streakDirty = 1;
    if (me) {
      const lv = Math.max(0, a.turretKeep || 0); a.turretKeep = 0; this.carryTurret(a, lv, 1);
      this.audio.streakGo(); this.input.rumble(0.6, 0.4, 200); this.streakUsed = id;
      this.bigText(`${svg('turret')} ${nom({ team: a.team }, lv).toUpperCase()} !`, `${this.input.label('fire')} pour la poser · ${this.input.label('interact')} devant elle pour l'améliorer`, '#7fe0ff', 't2');
    } else if (a.team === this.player.team) this.toast(`${a.name} pose une tourelle`, '#7fe0ff');
  };
  P.carryTurret = function (a, level, hpK) {
    a.carryTurret = { level, hpK };
    if (a === this.player) { const gh = turretMesh(a.team, level, GHOST.ok); gh.renderOrder = 10; gh.traverse((o) => { o.renderOrder = 10; }); this.root.add(gh); this.turretGhost = gh; }
  };
  P.dropCarry = function (a, keep) { // mort ou fin de partie pendant le transport : l'atout revient (le niveau est gardé)
    const c = a.carryTurret; if (!c) return; a.carryTurret = null;
    if (keep) { a.rewards.push('tourelle'); a.turretKeep = c.level; this.streakDirty = 1; }
    if (a === this.player && this.turretGhost) { this.root.remove(this.turretGhost); this.turretGhost = null; }
  };

  // ---- emplacement : devant soi, au sol, pas sur un drapeau, pas collé à une autre tourelle ou barricade
  P.turretSpot = function (a, yaw) {
    const f = V(Math.sin(yaw), 0, Math.cos(yaw)); const p = a.pos.clone().addScaledVector(f, 2.8); p.y = this.world.groundY(p.x, p.z, a.pos.y + 0.6);
    if (Math.abs(p.y - a.pos.y) > 1.1) return { p, why: 'Trop en pente ici' };
    if (!this.world.free(...this.world.cell(p.x, p.z))) return { p, why: 'Pas de place ici' };
    if (!this.world.los(a.pos.clone().add(V(0, 0.9, 0)), p.clone().add(V(0, 0.9, 0)))) return { p, why: 'Pas de place ici' };
    if ((this.turrets || T0()).some((T) => T.pos.distanceTo(p) < 2.2)) return { p, why: 'Trop près d\'une autre tourelle' };
    if (this.walls.some((w) => w.pos.distanceTo(p) < 1.6)) return { p, why: 'Trop près d\'une barricade' };
    for (const z of this.zoneState) if (Math.hypot(p.x - z.center[0], p.z - z.center[1]) < 3) return { p, why: 'Pas sur le drapeau' };
    for (const c of this.cars) if (!c.dead && c.pos.distanceTo(p) < 2.2) return { p, why: 'Une voiture gêne' };
    return { p };
  };
  P.placeTurret = function (a, yaw, level = 0, hpK = 1) {
    const s = this.turretSpot(a, yaw); if (s.why) { if (a === this.player) this.toast(s.why, '#ff8080'); return null; }
    const L = (this.turrets ||= []); const team = L.filter((T) => T.team === a.team);
    if (a.bot && (team.length >= this.turretCap() - 2 || L.some((T) => T.owner === a))) return null;
    if (!a.bot && team.length >= this.turretCap()) { const old = team.find((T) => T.owner?.bot); if (old) this.destroyTurret(old, null, true); }
    const mine = L.filter((T) => T.owner === a); if (mine.length >= (a.bot ? 1 : 2)) this.destroyTurret(mine[0], null, true);
    const p = s.p, Lv = TLV[level];
    const T = { team: a.team, owner: a, level, hp: Lv.hp * hpK, pos: p, base: yaw, aimY: yaw, aimP: 0, t: 0, bt: 0, build: level === 0 && hpK === 1 ? BUILD : REPOSE, born: this.time, life: a.bot ? BOT_LIFE : Infinity,
      tgt: null, look: 0, lock: 0, ft: 0, rk: rnd(1, 2), salvo: 0, shake: 0, kick: 0, alive: true, up: null, kills: 0, upAt: 0 };
    this.setTurretMesh(T);
    T.col = { type: 'circle', x: p.x, z: p.z, r: R_COL, h: H_COL, y0: p.y, turret: T };
    this.world.dynamic.push(T.col); L.push(T); this.wallNav(p);
    this.audio.build(p); this.audio.sentry?.(p, 'build');
    return T;
  };
  P.setTurretMesh = function (T) {
    const old = T.mesh; const m = turretMesh(T.team, T.level); m.position.copy(T.pos); m.rotation.y = 0; this.root.add(m); T.mesh = m; T.u = m.userData;
    if (old) { this.root.remove(old); old.traverse((o) => { if (o.material?.userData?.own) o.material.dispose(); }); }
    T.u.yaw.rotation.y = T.aimY; this.poseTurret(T, 1);
  };
  P.removeTurret = function (T) {
    const L = this.turrets || T0(); const i = L.indexOf(T); if (i < 0) return false; L.splice(i, 1); T.alive = false; this.root.remove(T.mesh);
    const j = this.world.dynamic.indexOf(T.col); if (j >= 0) this.world.dynamic.splice(j, 1); this.wallNav(T.pos);
    for (const b of this.actors) if (b.ai?.turret === T) b.ai.turret = null; return true;
  };
  P.destroyTurret = function (T, by, quiet = false) {
    if (!this.removeTurret(T)) return;
    const c = T.pos.clone().add(V(0, 0.9, 0));
    if (quiet) { this.fx.burst(c, 10, { color: '#9aa', speed: 2, size: 0.08, life: 0.5 }); this.audio.play('debris', T.pos, 0.4); return; }
    this.fx.explosion(c); this.audio.explode(c); this.fx.burst(c, 18, { color: T.team === 'ordre' ? '#1c2a4a' : '#d8a531', speed: 6, size: 0.12, life: 1.1 });
    this.fx.burst(c, 14, { color: '#ffd27a', speed: 8, size: 0.05, life: 0.4, emissive: true });
    this.blast(T.pos, 2.5, 60, by || null);
    if (by && by.team !== T.team) {
      this.addGalons(by, 1); by.stats.sac = (by.stats.sac || 0) + 5;
      if (by === this.player) { this.toast(`${svg('turret')} Tourelle ennemie détruite · +1 galon`, '#9ff59f'); this.medal('TOURELLE DÉTRUITE', nom(T), false); }
    }
    if (T.owner === this.player) this.toast(`${svg('turret')} Ta tourelle a été détruite${by ? ` par ${by.name}` : ''} !`, '#ff8080');
  };

  // ---- dégâts : balles, explosions ; jamais de tir ami
  P.hitTurret = function (T, dmg, by, blast = false) {
    if (!T.alive || (by && by.team === T.team)) return;
    T.hp -= dmg * (blast ? 0.65 : TLV[T.level].armor); T.shake = 0.15;
    if (by && !by.bot) by.spotted = this.time;
    if (T.owner === this.player && this.time - (T.warnT || -99) > 6) { T.warnT = this.time; this.toast(`${svg('turret')} Ta tourelle est attaquée !`, '#ffb02e'); }
    // la tourelle se tourne vers qui l'attaque (si elle n'a personne d'autre en vue)
    if (by && by.alive && !T.tgt && by.pos.distanceTo(T.pos) < TLV[T.level].range) { T.tgt = by; T.lock = 0.25; }
    if (T.hp <= 0) this.destroyTurret(T, by);
  };
  P.blastTurrets = function (p, r, dmg, by) {
    for (const T of (this.turrets || T0()).slice()) { if (by && T.team === by.team) continue; const d = T.pos.distanceTo(p); if (d < r + 1) this.hitTurret(T, dmg * 0.6 * (1 - Math.max(0, d - 1) / r), by, true); }
  };
  const blast = P.blast;
  P.blast = function (p, r, dmg, by) { blast.call(this, p, r, dmg, by); if (this.turrets?.length) this.blastTurrets(p, r, dmg, by); };
  const hitWorld = P.hitWorld;
  P.hitWorld = function (a, hw, d, end, D, mult) {
    const T = hw.c?.turret; if (!T) return hitWorld.call(this, a, hw, d, end, D, mult);
    this.hitTurret(T, D.dmg * mult * (a.perk?.casse || 1) * (D.pellets > 1 ? 0.8 : 1), a);
    if (a === this.player || end.distanceTo(this.player.pos) < 40) this.fx.impact(end, hw.n, 'metal');
  };

  // ---- invites et actions du joueur : améliorer / réparer (□), démonter et porter (↓)
  P.nearTurret = function (a, own = false, R = 2.4) {
    const yaw = a === this.player ? this.cam.yaw : a.yaw, f = V(Math.sin(yaw), 0, Math.cos(yaw)); let best = null, bd = R;
    for (const T of this.turrets || T0()) {
      if (T.team !== a.team || (own && T.owner !== a)) continue; const to = V(T.pos.x - a.pos.x, 0, T.pos.z - a.pos.z); const d = to.length() - R_COL; if (d > bd || Math.abs(T.pos.y - a.pos.y) > 1.5) continue;
      if (d > 0.5 && to.normalize().dot(f) < 0.3) continue; bd = d; best = T;
    }
    return best;
  };
  P.turretAction = function (a, T) {
    if (T.bt < T.build || T.up) return null;
    if (T.level < lvlUnlocked(a)) return { kind: 'up', to: T.level + 1, dur: TLV[T.level + 1].chan };
    if (T.hp < TLV[T.level].hp * 0.98) return { kind: 'fix', dur: 0.9 };
    return null;
  };
  P.doTurretAction = function (a, T, act) {
    if (!T.alive) return;
    if (act.kind === 'up') { T.up = { t: 0, to: act.to, by: a }; this.audio.build(T.pos); this.audio.sentry?.(T.pos, 'build'); }
    else { T.hp = TLV[T.level].hp; this.audio.build(T.pos); this.fx.burst(T.pos.clone().add(V(0, 1, 0)), 8, { color: '#9ff59f', speed: 2, size: 0.06, life: 0.5 }); if (a === this.player) this.toast(`${svg('turret')} Tourelle réparée`, '#9ff59f'); }
    if (T.owner?.bot && a !== T.owner) T.life = Math.max(T.life, this.time - T.born + BOT_LIFE * 0.6);
  };
  P.turretPrompt = function (a) {
    if (a.inCar || a.carryTurret) return null; const T = this.nearTurret(a); if (!T) return null;
    const I = this.input, act = this.turretAction(a, T), Lv = TLV[T.level], hp = Math.round(Math.max(0, T.hp) / Lv.hp * 100);
    const take = T.owner === a && T.bt >= T.build && !T.up ? ` · <b>${I.label('build')}</b> Démonter` : '';
    if (!act) {
      if (T.up) return `${svg('turret')} Montage en cours…`;
      if (T.bt < T.build) return `${svg('turret')} ${nom(T)} · montage…`;
      const next = TLV[T.level + 1];
      return `${svg('turret')} ${nom(T)} · ${hp} %` + (next ? ` <span class="r">— niveau ${T.level + 2} à ${next.need} galons (tu en as ${fmtG(a.galons)})</span>` : ' <span class="r">— niveau max</span>') + take;
    }
    if (I.pressed('interact') && !a.channel) this.startChannel(a, act.kind === 'up' ? `Amélioration : niveau ${act.to + 1}…` : 'Réparation…', act.dur, () => T.alive && !!this.turretAction(a, T), () => this.doTurretAction(a, T, act), 'Interact');
    return (act.kind === 'up'
      ? `<b>${I.label('interact')}</b> (maintenir) Améliorer en <span class="r" style="color:#7fe0ff">niveau ${act.to + 1} · ${TSUB[act.to]}</span> · ${hp} %`
      : `<b>${I.label('interact')}</b> (maintenir) Réparer <span class="r">${nom(T)} · ${hp} %</span>`) + take;
  };
  const wallPrompt = P.wallPrompt;
  P.wallPrompt = function (a) { return this.turretPrompt(a) || wallPrompt.call(this, a); };
  // ↓ / Q devant sa propre tourelle : on la démonte (au lieu de poser une barricade)
  const placeWall = P.placeWall;
  P.placeWall = function (a, yawIn, at) {
    if (a === this.player && !a.bot) {
      if (a.carryTurret) return null;
      const T = this.nearTurret(a, true);
      if (T) { if (T.bt >= T.build && !T.up && !a.channel) this.startChannel(a, 'Démontage…', 0.7, () => T.alive, () => { const k = T.hp / TLV[T.level].hp; this.removeTurret(T); this.carryTurret(a, T.level, k); this.audio.play('debris', T.pos, 0.4); this.toast(`${svg('turret')} Tourelle démontée : ${this.input.label('fire')} pour la reposer`, '#7fe0ff'); }, 'Interact'); return null; }
    }
    return placeWall.call(this, a, yawIn, at);
  };
  // pose pendant le transport : silhouette devant le joueur, verte ou rouge ; tir = poser
  const interactions = P.interactions;
  P.interactions = function (a, dt) {
    interactions.call(this, a, dt);
    const c = a.carryTurret, gh = this.turretGhost; if (!c || !gh) return;
    const s = this.turretSpot(a, this.cam.yaw); gh.position.copy(s.p); gh.rotation.y = this.cam.yaw;
    const m = s.why ? GHOST.bad : GHOST.ok; if (gh.userData.mat !== m) { gh.userData.mat = m; gh.traverse((o) => { if (o.isMesh) o.material = m; }); }
    const I = this.input;
    this.ui.prompt = s.why ? `${svg('turret')} <span class="r" style="color:#ff8080">${s.why}</span>` : `<b>${I.label('fire')}</b> Poser la tourelle <span class="r" style="color:#7fe0ff">${nom({ team: a.team }, c.level)}</span>`;
    if ((I.pressed('fire') || (I.st.triggerR > 0.4 && !this._trigWasT)) && !s.why && !a.channel) {
      const T = this.placeTurret(a, this.cam.yaw, c.level, c.hpK); if (T) { this.root.remove(gh); this.turretGhost = null; a.carryTurret = null; this._thrJust = 0.25; }
    }
    this._trigWasT = I.st.triggerR > 0.4;
  };
  const kill = P.kill;
  P.kill = function (t, by, opts) { if (t.carryTurret) this.dropCarry(t, true); return kill.call(this, t, by, opts); };

  // ---- à chaque image : montage, veille, acquisition, tir, roquettes, amélioration, fin de vie
  const updateWalls = P.updateWalls;
  P.updateWalls = function (dt) { updateWalls.call(this, dt); this.updateTurrets(dt); };
  P.updateTurrets = function (dt) {
    const L = this.turrets; this.updateTurretRockets(dt); if (!L?.length) return;
    const cam = this.camera.position;
    for (let i = L.length - 1; i >= 0; i--) {
      const T = L[i]; T.t += dt; T.bt += dt;
      const near = cam.distanceToSquared(T.pos) < 110 * 110;
      // amélioration : la tête tremble et crache des étincelles, puis le nouveau modèle sort avec un rebond
      if (T.up) {
        T.up.t += dt; if (near && Math.random() < dt * 14) this.fx.burst(T.pos.clone().add(V(rnd(-0.3, 0.3), 1.1, rnd(-0.3, 0.3))), 3, { color: '#ffd27a', speed: 3, size: 0.03, life: 0.3, emissive: true });
        if (T.up.t >= 0.5 && T.level !== T.up.to) {
          const k = T.hp / TLV[T.level].hp; T.level = T.up.to; T.hp = TLV[T.level].hp * Math.max(0.75, k); this.setTurretMesh(T); T.popT = 0;
          this.fx.burst(T.pos.clone().add(V(0, 1.1, 0)), 16, { color: '#7fe0ff', speed: 3, size: 0.08, life: 0.7 }); this.audio.play('slam', T.pos, 0.5); this.audio.sentry?.(T.pos, 'up');
          const by = T.up.by; if (by === this.player || T.owner === this.player) {
            const big = T.level === 2 ? (T.team === 'civils' ? 'FRUNGZTASTIQUE !' : 'PUISSANCE MAX !') : 'ÇA MONTE !';
            this.bigText(`${svg('turret')} TOURELLE NIVEAU ${T.level + 1} · ${big}`, `${nom(T)} · ${TSUB[T.level]}`, T.level === 2 ? '#ff7ad9' : '#7fe0ff', T.level === 2 ? 't4' : 't3');
            this.audio.streakReady(T.level + 1);
          }
        }
        if (T.up.t >= 1) T.up = null;
      }
      // fin de vie (tourelles de bots : la ville ne se fige pas)
      const age = this.time - T.born; if (age > T.life) { this.destroyTurret(T, null, true); continue; }
      const built = T.bt >= T.build && !T.up;
      if (built && !T.armed) { T.armed = true; this.audio.sentry?.(T.pos, 'on'); }
      this.turretBrain(T, dt, built);
      if (near) this.poseTurret(T, dt);
      // fumée noire quand elle est très abîmée
      if (near && T.hp < TLV[T.level].hp * 0.35 && (T.smk = (T.smk || 0) - dt) <= 0) { T.smk = 0.18; this.trailPuff?.(T.pos.clone().add(V(rnd(-0.1, 0.1), 1.25, rnd(-0.1, 0.1))), '#2b2b2b', 1.4, 1.6, 0.25); }
    }
  };
  // animation : trépied qui se déplie, mât qui monte, tête qui sort en tournant ; ensuite visée, recul, rotation des canons
  P.poseTurret = function (T, dt) {
    const u = T.u, m = T.mesh, b = clamp(T.bt / T.build, 0, 1), first = T.build === BUILD;
    const kl = ease(b / 0.3), kp = ease((b - 0.2) / 0.35), kh = (b - 0.5) / 0.4;
    for (const l of u.legs) l.rotation.x = -(0.08 + 0.95 * kl); // dépliage (vers l'extérieur)
    u.post.scale.y = 0.15 + 0.85 * kp; u.yaw.position.y = 0.5 + (HEAD_Y - 0.5) * kp;
    const hs = b < 1 ? Math.max(0.001, pop(kh)) : T.popT != null && T.popT < 0.5 ? pop(T.popT / 0.5 + 0.0001) : 1; if (T.popT != null) T.popT += dt;
    u.yaw.scale.setScalar(hs);
    if (b < 1) { u.yaw.rotation.y = T.base + (first ? (1 - ease(kh)) * 6.3 : 0); u.pitch.rotation.x = -0.5 * (1 - ease(kh)); }
    else { u.yaw.rotation.y = T.aimY; u.pitch.rotation.x = -T.aimP; }
    // œil et gyrophare
    const eye = u.eye.material; if (eye.emissive) { const c = !T.armed ? EYE.off : T.tgt && T.lock <= 0 ? EYE.fire : T.tgt ? EYE.lock : EYE.idle; eye.emissive.lerp(c, Math.min(1, dt * 12)); eye.emissiveIntensity = T.tgt && T.lock > 0 ? 1.4 + Math.sin(T.t * 40) * 1.2 : 2.2; }
    if (u.gyro) u.gyro.visible = !T.tgt || Math.sin(T.t * 18) > 0;
    // recul des canons, rotation des barillets
    T.kick = Math.max(0, T.kick - dt * 9); for (const br of u.barrels) br.position.z = -T.kick * 0.06;
    T.spinV = (T.spinV || 0) + ((T.tgt && T.lock <= 0 ? 40 : 0) - (T.spinV || 0)) * Math.min(1, dt * 4); for (const s of u.spin) s.rotation.z += T.spinV * dt;
    // à l'impact : la tourelle tremble
    if (T.shake > 0) { T.shake -= dt; m.position.set(T.pos.x + rnd(-0.03, 0.03), T.pos.y, T.pos.z + rnd(-0.03, 0.03)); } else m.position.copy(T.pos);
  };
  // cerveau : cible = adversaire visible le plus proche dans la portée ; bip d'acquisition avant de tirer (on a le temps de réagir)
  P.turretBrain = function (T, dt, built) {
    const Lv = TLV[T.level], head = T.pos.clone(); head.y += HEAD_Y + 0.16;
    if (!built) { T.tgt = null; return; }
    if ((T.look -= dt) <= 0) {
      T.look = rnd(0.22, 0.3); const prev = T.tgt; let best = null, bd = Lv.range * Lv.range;
      if (prev && !(prev.alive && !prev.gone && !prev.inCar && prev.pos.distanceToSquared(T.pos) < bd && this.turretSees(T, head, prev))) T.tgt = null;
      // une cible plus proche ? (deux contrôles de vue au plus par recherche)
      const cands = []; for (const t of this.actors) { if (!t.alive || t.gone || t.inCar || t.team === T.team) continue; const d2 = t.pos.distanceToSquared(T.pos); if (d2 < bd && Math.abs(t.pos.y - T.pos.y) < 9) cands.push([d2, t]); }
      cands.sort((x, y) => x[0] - y[0]);
      for (let k = 0; k < Math.min(2, cands.length); k++) { const t = cands[k][1]; if (t === T.tgt) { best = t; break; } if (this.turretSees(T, head, t)) { best = t; break; } }
      if (best && best !== T.tgt && (!T.tgt || best.pos.distanceToSquared(T.pos) < T.tgt.pos.distanceToSquared(T.pos) * 0.6)) { T.tgt = best; T.lock = 0.38; this.audio.sentry?.(T.pos, 'lock'); }
      else if (!T.tgt && best) { T.tgt = best; T.lock = 0.38; this.audio.sentry?.(T.pos, 'lock'); }
    }
    const t = T.tgt;
    if (!t) { // veille : balayage lent autour de l'axe de pose
      const want = T.base + Math.sin(T.t * 0.8) * 0.75; T.aimY += clamp(wrap(want - T.aimY), -dt * 1.2, dt * 1.2); T.aimP += (0 - T.aimP) * Math.min(1, dt * 3);
      if ((T.ping = (T.ping || 0) - dt) <= 0) { T.ping = 2.6; if (this.player.pos.distanceTo(T.pos) < 25) this.audio.sentry?.(T.pos, 'scan'); }
      return;
    }
    const aim = t.pos.clone(); aim.y += t.crouch ? 0.9 : 1.2; const to = aim.clone().sub(head);
    const wy = Math.atan2(to.x, to.z), wp = Math.atan2(to.y, Math.hypot(to.x, to.z));
    const dy = wrap(wy - T.aimY); T.aimY += clamp(dy, -Lv.turn * dt, Lv.turn * dt); T.aimP += clamp(wp - T.aimP, -Lv.turn * dt, Lv.turn * dt);
    T.lock -= dt; if (T.lock > 0 || Math.abs(dy) > 0.14) return;
    // rafales
    T.ft -= dt; let n = 0;
    while (T.ft <= 0 && n++ < 3) { T.ft += 1 / Lv.rps; this.turretShoot(T, head, aim, Lv); }
    // roquettes (niveau 3) : salve de quatre toutes les 4 s
    if (Lv.rockets) { T.rk -= dt; if (T.rk <= 0 && T.salvo <= 0 && to.length() > 6) { T.salvo = 4; T.rk = 4; T.sv = 0; }
      if (T.salvo > 0 && (T.sv -= dt) <= 0) { T.sv = 0.16; T.salvo--; this.turretRocket(T, head, t); } }
  };
  P.turretSees = function (T, head, t) {
    const aim = t.pos.clone(); aim.y += 1.2; const d = aim.clone().sub(head); const L = d.length(); if (L < 0.1) return true; d.divideScalar(L);
    const o = head.clone().addScaledVector(d, 0.6); const h = this.world.ray(o, d, L - 0.6);
    if (h && h.t < L - 1.1 && h.c?.turret !== T) return false; return !this.smokeBlocks(o, aim);
  };
  P.turretShoot = function (T, head, aim, Lv) {
    const u = T.u, mz = u.muzzles[(T.shot = (T.shot || 0) + 1) % u.muzzles.length];
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-T.aimP, T.aimY, 0, 'YXZ'));
    const o = V(mz.x, mz.y, mz.z).applyQuaternion(q).add(head);
    const d = aim.clone().sub(o).normalize(); d.x += rnd(-1, 1) * Lv.spread; d.y += rnd(-1, 1) * Lv.spread * 0.6; d.z += rnd(-1, 1) * Lv.spread; d.normalize();
    const far = Lv.range + 6; const hw = this.world.ray(o, d, far); const ha = this.rayActors(o, d, hw ? hw.t : far, null); let end;
    const by = T.owner?.alive && !T.owner.gone ? T.owner : null; const nearP = o.distanceToSquared(this.player.pos) < 80 * 80;
    if (ha) {
      end = o.clone().addScaledVector(d, ha.t);
      if (ha.a.team !== T.team) { this.damage(ha.a, Lv.dmg * (ha.head ? 1.5 : 1), by, { ico: 'turret', head: ha.head, src: T }); if (ha.a.ai && ha.a.alive) { ha.a.ai.turret = T; ha.a.ai.turretT = 4; } }
      if (nearP) this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh');
    } else if (hw) {
      end = o.clone().addScaledVector(d, hw.t); const c = hw.c;
      if (c?.wall && c.wall.team !== T.team) this.hitWall(c.wall, Lv.dmg * 0.6, by);
      else if (c?.turret && c.turret.team !== T.team) this.hitTurret(c.turret, Lv.dmg, by);
      if (nearP && T.shot % 2) this.fx.impact(end, hw.n, c?.wall || c?.turret ? 'metal' : 'world');
    } else end = o.clone().addScaledVector(d, far);
    T.kick = 1;
    if (nearP) { this.fx.tracer(o, end); this.fx.muzzle(o, 0.7); if (T.shot % (T.level ? 2 : 1) === 0) this.audio.gun(T.level ? 'smg' : 'rifle', o, T.level ? 0.75 : 0.85); }
    if (ha?.a !== this.player && this.fb.bullet && nearP) this.fb.bullet(o, d, ha ? ha.t : hw ? hw.t : far, T.owner || { team: T.team, pos: T.pos });
  };

  // ---- roquettes de la tourelle niveau 3 (petites, sans lumière ; traînée du pool commun)
  const RK_GEO = new THREE.CylinderGeometry(0.04, 0.05, 0.32, 6).rotateX(Math.PI / 2);
  P.turretRocket = function (T, head, t) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-T.aimP, T.aimY, 0, 'YXZ'));
    const o = V(rnd(-0.07, 0.07), 0.36, 0.25).applyQuaternion(q).add(head);
    const tgt = t.pos.clone().add(V(rnd(-1.2, 1.2), 0.5, rnd(-1.2, 1.2)));
    const m = new THREE.Mesh(RK_GEO, mat(T.team === 'civils' ? '#ff4fa0' : '#e9eef5')); m.position.copy(o); this.root.add(m);
    const v = tgt.clone().sub(o).normalize().multiplyScalar(26); v.y += 1.5;
    (this.turretRockets ||= []).push({ m, v, owner: T.owner, team: T.team, t: 0 });
    if (o.distanceToSquared(this.player.pos) < 6400) { this.audio.whistle(o, 0.4); this.fx.muzzle(o, 0.5); }
    T.kick = 1;
  };
  P.updateTurretRockets = function (dt) {
    const L = this.turretRockets; if (!L?.length) return;
    for (let i = L.length - 1; i >= 0; i--) {
      const R = L[i]; R.t += dt; R.v.y -= 3 * dt; const p = R.m.position, step = R.v.length() * dt, d = R.v.clone().normalize();
      const hw = this.world.ray(p, d, step + 0.1); const ha = this.rayActors(p, d, hw ? hw.t : step + 0.1, null);
      R.m.lookAt(p.clone().add(R.v));
      if (hw || (ha && ha.a.team !== R.team) || R.t > 3) {
        const at = ha ? p.clone().addScaledVector(d, ha.t) : hw ? p.clone().addScaledVector(d, hw.t) : p.clone();
        this.root.remove(R.m); L.splice(i, 1);
        this.boom(at, 3.2, 38, R.owner || { team: R.team, alive: false }, '#ffb347', { foesOnly: true }); continue;
      }
      p.addScaledVector(R.v, dt);
      if ((R.tp = (R.tp || 0) - dt) <= 0) { R.tp = 0.03; this.trailPuff?.(p.clone(), '#bbbbbb', 0.6, 0.2, 0.08); }
    }
  };

  // ---- bots : poser face à la menace / sur la zone tenue, améliorer la leur, détruire celles d'en face
  P.botTurretYaw = function (b) {
    if (b.ai?.target) return Math.atan2(b.ai.target.pos.x - b.pos.x, b.ai.target.pos.z - b.pos.z);
    const z = this.zoneState.find((z) => this.inZone(b, z)); if (z) return Math.atan2(b.pos.x - z.center[0], b.pos.z - z.center[1]) + Math.PI;
    return b.yaw;
  };
  const updateBot = P.updateBot;
  P.updateBot = function (b, dt) { updateBot.call(this, b, dt); if (b.alive && !b.inCar && this.turrets?.length) this.botTurrets(b, dt); };
  P.botTurrets = function (b, dt) {
    const ai = b.ai; ai.turretT = (ai.turretT || 0) - dt;
    // sa tourelle (ou une tourelle amie) tout près : l'améliorer ou la réparer quand il n'a personne en vue
    if (!b.channel && !(ai.target && ai.los) && (ai.tthink = (ai.tthink ?? rnd(0.5, 2)) - dt) <= 0) {
      ai.tthink = rnd(1.5, 3); const F = this.turrets.find((T) => T.team === b.team && T.pos.distanceTo(b.pos) < 3.2 && this.turretAction(b, T));
      if (F) { const act = this.turretAction(b, F); b.wish.set(0, 0, 0); b.yaw = Math.atan2(F.pos.x - b.pos.x, F.pos.z - b.pos.z); this.startChannel(b, 'tourelle', act.dur, () => F.alive, () => this.doTurretAction(b, F, act), 'Interact'); return; }
    }
    // tourelle ennemie : la repérer (vue), puis la viser si elle me tire dessus, si je n'ai pas mieux, ou si elle est plus près
    if ((ai.tlook = (ai.tlook ?? rnd(0, 0.5)) - dt) <= 0) {
      ai.tlook = rnd(0.4, 0.7); let best = null, bd = 40 * 40; const e = b.pos.clone(); e.y += 1.5;
      for (const T of this.turrets) { if (T.team === b.team) continue; const d2 = T.pos.distanceToSquared(b.pos); if (d2 < bd) { bd = d2; best = T; } }
      if (best) { const h = best.pos.clone(); h.y += 1; const d = h.clone().sub(e); const L = d.length(); d.divideScalar(L); const hit = this.world.ray(e, d, L); if (!hit || hit.c?.turret === best || hit.t > L - 0.7) { ai.turret = best; ai.turretT = Math.max(ai.turretT, 1.2); } }
    }
    const T = ai.turret; if (!T || !T.alive || ai.turretT <= 0) { if (T && !T.alive) ai.turret = null; return; }
    const dT = T.pos.distanceTo(b.pos), tgt = ai.target && ai.los ? ai.target : null;
    if (tgt && T.tgt !== b && tgt.pos.distanceTo(b.pos) < dT * 0.8) return; // un adversaire plus pressant
    const o = b.pos.clone().add(V(0, 1.45, 0)); const err = (0.4 + dT * 0.02) * this.opts.botSkill; const aimP = T.pos.clone().add(V(rnd(-err, err), rnd(0.5, 1.3), rnd(-err, err)));
    const d = aimP.sub(o).normalize(); b.yaw = Math.atan2(d.x, d.z); b.pitch = Math.asin(clamp(d.y, -1, 1));
    // grenade sur la tourelle (portée moyenne)
    if (b.frags > 0 && dT > 7 && dT < 24 && (ai.tnade = (ai.tnade ?? rnd(2, 5)) - dt) <= 0) { ai.tnade = rnd(8, 14); const og = this.throwOrigin(b); this.castThrow(b, 'frag', solveThrow(og, T.pos.clone(), 1), og); return; }
    const W = this.weapon(b);
    if (W.mag <= 0) { this.startReload(b); return; }
    if (b.fireT <= 0 && b.reloadT <= 0 && dT < 60) this.fire(b, o, d);
    // à découvert face à une tourelle qui le vise : il se décale
    if (T.tgt === b && !ai.combatMove) { const side = V(d.z, 0, -d.x).multiplyScalar(Math.sin(this.time * 1.3 + b.id) > 0 ? 1 : -1); b.wish.copy(side); }
  };
}
