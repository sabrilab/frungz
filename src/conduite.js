// Conduite : tout ce qu'on fait en voiture, en plus de rouler (src/game.js garde la physique de base)
// - barrages de chantier là où les rues sortent de la carte (blocs béton, barrière rouge et blanche, panneau « ROUTE BARRÉE ») ;
// - nitro (Maj, L3 ou R1, bouton Nitro au tactile) : se recharge en dérapant et en frôlant voitures et passants ;
// - bonus posés sur la chaussée, ramassés en roulant dessus : bouteille de nitro, caisse à outils, sac de billets, plaques de blindage ;
// - saut d'une voiture en marche (sortir au-delà de 20 km/h) : plongeon et roulade, ou chute à plat et roulé-boulé à grande vitesse ;
//   la voiture lâchée garde l'accélérateur bloqué et fonce sur la cible visée (« lance-voiture »), et explose au choc.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as Anim from './anim.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const GRAV = 19;
const wrap = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const fwdOf = (yaw) => V(Math.sin(yaw), 0, Math.cos(yaw));
const sideOf = (yaw) => V(Math.cos(yaw), 0, -Math.sin(yaw)); // côté gauche de la voiture (porte du conducteur)

export const BAIL_MIN = 5.5; // m/s : en dessous, on descend normalement
export const NITRO_DUR = 3.2; // secondes de poussée avec un plein
const BOOST_MAX = 1.38, BOOST_ACC = 1.6;

// ---------------------------------------------------------------- textures et matières
function tex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
function stripes(g, w, h, a, b, step) { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let x = -h; x < w + h; x += step * 2) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.lineTo(x + h + step, 0); g.lineTo(x + step, h); g.fill(); } }
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const concrete = tex(256, 256, (g, w, h) => { g.fillStyle = '#c4c1b8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 150 + Math.random() * 70 | 0; g.fillStyle = `rgba(${v},${v - 3},${v - 10},0.35)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } g.fillStyle = 'rgba(70,60,50,0.18)'; for (let i = 0; i < 14; i++) g.fillRect(Math.random() * w, h * 0.82 + Math.random() * h * 0.18, 2 + Math.random() * 30, 1 + Math.random() * 6); }, true);
  const band = tex(256, 32, (g, w, h) => stripes(g, w, h, '#f4f4f0', '#c8102e', 22));
  const k2 = tex(512, 64, (g, w, h) => { stripes(g, w, h, '#f6f6f2', '#d0102a', 34); g.strokeStyle = '#d0102a'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); });
  const sign = tex(512, 144, (g, w, h) => { g.fillStyle = '#f3c300'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); g.fillStyle = '#111'; g.font = 'bold 70px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ROUTE BARRÉE', w / 2, h / 2 + 3); });
  const n2o = tex(128, 128, (g, w, h) => { g.fillStyle = '#1f4fa8'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2f2'; g.fillRect(0, h * 0.34, w, h * 0.32); g.fillStyle = '#1f4fa8'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N₂O', w / 2, h / 2 + 1); });
  const euro = tex(128, 128, (g, w, h) => { g.fillStyle = '#5d5a52'; g.fillRect(0, 0, w, h); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } g.fillStyle = '#e8e2cf'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('€', w / 2, h / 2 + 4); });
  const S = (o) => new THREE.MeshStandardMaterial(o);
  return (MAT = {
    concrete: S({ map: concrete, roughness: 0.93, metalness: 0 }),
    band: S({ map: band, roughness: 0.4, metalness: 0.1 }),
    k2: S({ map: k2, roughness: 0.45, metalness: 0.05 }),
    sign: S({ map: sign, roughness: 0.5 }),
    signBack: S({ color: '#9aa0a3', roughness: 0.4, metalness: 0.7 }),
    metal: S({ color: '#8b9094', roughness: 0.35, metalness: 0.85 }),
    foot: S({ color: '#2b2b2b', roughness: 0.9 }),
    lamp: S({ color: '#ffb52e', emissive: '#ff9a00', emissiveIntensity: 0.2, roughness: 0.3, transparent: true, opacity: 0.92 }),
    n2o: S({ map: n2o, roughness: 0.28, metalness: 0.35 }),
    chrome: S({ color: '#d9dde0', roughness: 0.12, metalness: 1 }),
    red: S({ color: '#b3161b', roughness: 0.45, metalness: 0.3 }),
    dark: S({ color: '#26282a', roughness: 0.6, metalness: 0.5 }),
    bag: S({ map: euro, roughness: 0.95 }),
    steel: S({ color: '#4a4f52', roughness: 0.42, metalness: 0.9 }),
    strap: S({ color: '#1b1b1b', roughness: 0.8 }),
  });
}

// ---------------------------------------------------------------- barrages de bord de carte
// séparateur béton (GBA) : profil évasé, 2 m de long (axe Z)
function gbaGeo() {
  const s = new THREE.Shape([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.11, 0.27], [0.08, 0.8], [-0.08, 0.8], [-0.11, 0.27], [-0.3, 0.08]].map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.96, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 1 }); g.translate(0, 0, -0.98); return g;
}
// rues ouvertes sur le bord de la carte : segments [t0, t1] le long de chaque bord, là où une voiture passerait
export function findExits(W) {
  const B = W.bounds, out = [], q = V();
  const edges = [{ ax: 'x', v: B.x0, n: 1, a0: B.z0, a1: B.z1 }, { ax: 'x', v: B.x1, n: -1, a0: B.z0, a1: B.z1 }, { ax: 'z', v: B.z0, n: 1, a0: B.x0, a1: B.x1 }, { ax: 'z', v: B.z1, n: -1, a0: B.x0, a1: B.x1 }];
  const at = (e, t, d) => e.ax === 'x' ? [e.v + e.n * d, t] : [t, e.v + e.n * d];
  const free = (x, z, R) => { if (W.inWater(x, z)) return false; const y = W.groundY(x, z, 2); if (y < -1 || y > 2.5) return false; q.set(x, y, z); W.pushOut(q, R, y + 0.2); return Math.hypot(q.x - x, q.z - z) < 0.01; };
  for (const e of edges) {
    let s = null; const segs = [];
    for (let t = e.a0 + 1; t <= e.a1 - 1; t += 0.5) {
      // libre jusqu'au bord (pas de mur d'enceinte) et sur 8 m vers l'intérieur
      const ok = free(...at(e, t, 0.35), 0.25) && free(...at(e, t, 1.6), 0.6) && free(...at(e, t, 5), 0.6) && free(...at(e, t, 9), 0.6);
      if (ok && s == null) s = t; if (!ok && s != null) { segs.push([s, t - 0.5]); s = null; }
    }
    if (s != null) segs.push([s, e.a1 - 1]);
    for (const [t0, t1] of segs) if (t1 - t0 >= 3) out.push({ e, t0: t0 - 0.4, t1: t1 + 0.4 });
  }
  return out;
}
function buildBarrages(game) {
  const W = game.world, M = mats(), sp = Object.values(W.spawns || {}).flat();
  // pas de barrage dans une base (les points d'apparition sont souvent au bord de la carte)
  const exits = findExits(W).filter(({ e, t0, t1 }) => !sp.some((s) => { const along = e.ax === 'x' ? s.z : s.x, off = Math.abs((e.ax === 'x' ? s.x : s.z) - e.v); return off < 16 && along > t0 - 10 && along < t1 + 10; }));
  if (!exits.length) return null;
  const geo = { gba: [], band: [], k2: [], sign: [], back: [], metal: [], foot: [], lamp: [] };
  const gba = gbaGeo(), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = V(1, 1, 1);
  const put = (list, g, x, y, z, yaw, s) => { const c = g.clone(); qt.setFromAxisAngle(V(0, 1, 0), yaw); m4.compose(V(x, y, z), qt, s || sc); c.applyMatrix4(m4); list.push(c); };
  const lamps = [];
  for (const { e, t0, t1 } of exits) {
    const w = t1 - t0, mid = (t0 + t1) / 2;
    // repère : u le long du bord, n vers l'intérieur de la carte
    const u = e.ax === 'x' ? V(0, 0, 1) : V(1, 0, 0), n = e.ax === 'x' ? V(e.n, 0, 0) : V(0, 0, e.n);
    const P = (along, d) => { const p = e.ax === 'x' ? V(e.v + e.n * d, 0, along) : V(along, 0, e.v + e.n * d); p.y = W.groundY(p.x, p.z, 1); return p; };
    const yawU = Math.atan2(u.x, u.z); // un bloc (long sur Z) aligné sur u
    const nb = Math.ceil(w / 2); const start = mid - nb; // blocs jointifs, 2 m chacun, centrés sur l'ouverture
    for (let i = 0; i < nb; i++) { const p = P(start + 1 + i * 2, 0.95); const jit = (Math.random() - 0.5) * 0.05;
      put(geo.gba, gba, p.x, p.y, p.z, yawU + jit);
      // bandes rétroréfléchissantes rouges et blanches sur les deux faces
      for (const sd of [-1, 1]) { const b = new THREE.PlaneGeometry(1.8, 0.11); b.rotateY(sd > 0 ? Math.PI / 2 : -Math.PI / 2); b.translate(sd * 0.0965, 0.53, 0); put(geo.band, b, p.x, p.y, p.z, yawU + jit); }
    }
    // barrières K2 sur pieds, côté ville, et le panneau jaune au milieu
    const nk = Math.max(1, Math.floor(w / 5.5)), yawN = Math.atan2(n.x, n.z);
    for (let i = 0; i < nk; i++) {
      const along = mid + (i - (nk - 1) / 2) * Math.min(2.6, w / nk); const p = P(along, 2.7);
      const board = new THREE.BoxGeometry(2.0, 0.26, 0.035); board.translate(0, 0.98, 0); put(geo.k2, board, p.x, p.y, p.z, yawN + Math.PI);
      for (const sx of [-0.85, 0.85]) {
        const leg = new THREE.BoxGeometry(0.04, 1.0, 0.04); leg.translate(sx, 0.5, -0.03); put(geo.metal, leg, p.x, p.y, p.z, yawN + Math.PI);
        const ft = new THREE.BoxGeometry(0.14, 0.09, 0.62); ft.translate(sx, 0.045, -0.03); put(geo.foot, ft, p.x, p.y, p.z, yawN + Math.PI);
      }
      // feu de chantier orange sur le coin de la barrière
      const lp = new THREE.CylinderGeometry(0.075, 0.075, 0.1, 14); lp.rotateX(Math.PI / 2); lp.translate(-0.8, 1.2, -0.02); put(geo.lamp, lp, p.x, p.y, p.z, yawN + Math.PI);
      const lh = new THREE.BoxGeometry(0.08, 0.1, 0.06); lh.translate(-0.8, 1.13, -0.04); put(geo.foot, lh, p.x, p.y, p.z, yawN + Math.PI);
      lamps.push(p);
      if (i === Math.floor((nk - 1) / 2)) {
        const sg = new THREE.PlaneGeometry(1.5, 0.42); sg.rotateY(Math.PI); sg.translate(0, 1.42, -0.025); put(geo.sign, sg, p.x, p.y, p.z, yawN + Math.PI);
        const bk = new THREE.BoxGeometry(1.52, 0.44, 0.02); bk.translate(0, 1.42, -0.0); put(geo.back, bk, p.x, p.y, p.z, yawN + Math.PI);
      }
    }
    // obstacle physique : la rangée de blocs (on l'enjambe à pied, une voiture s'y arrête)
    const c = P(mid, 0.95), yaw = Math.atan2(-u.z, u.x);
    W.colliders.push({ type: 'box', id: 'barrage', tag: 'barrage', x: c.x, z: c.z, hx: nb, hz: 0.33, h: 0.8, y0: c.y, yaw, cs: Math.cos(yaw), sn: Math.sin(yaw) });
    const lo = P(t0, 0), hi = P(t1, 4); W.refreshNav?.(Math.min(lo.x, hi.x) - 1, Math.min(lo.z, hi.z) - 1, Math.max(lo.x, hi.x) + 1, Math.max(lo.z, hi.z) + 1);
  }
  W.buildHash();
  const grp = new THREE.Group(); grp.name = 'barrages';
  for (const [k, list] of Object.entries(geo)) { if (!list.length) continue; const mat = { gba: M.concrete, band: M.band, k2: M.k2, sign: M.sign, back: M.signBack, metal: M.metal, foot: M.foot, lamp: M.lamp }[k];
    const g = mergeGeometries(list.map((x) => x.index ? x.toNonIndexed() : x), false); if (!g) continue;
    const m = new THREE.Mesh(g, mat); m.castShadow = k !== 'lamp' && k !== 'band'; m.receiveShadow = true; grp.add(m); }
  game.root.add(grp);
  return { grp, exits, lamps };
}

// ---------------------------------------------------------------- bonus de route
export const BONUS = {
  nitro: { nom: 'Bouteille de nitro', ico: 'nitro', w: 0.4 },
  repare: { nom: 'Caisse à outils', ico: 'wrench', w: 0.25 },
  billets: { nom: 'Sac de billets', ico: 'cash', w: 0.2 },
  blindage: { nom: 'Plaques de blindage', ico: 'vest', w: 0.15 },
};
function bonusMesh(kind) {
  const M = mats(), g = new THREE.Group(); const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  if (kind === 'nitro') { // deux bouteilles couchées, sanglées sur un berceau
    for (const sx of [-0.16, 0.16]) { add(new THREE.CapsuleGeometry(0.14, 0.62, 6, 20), M.n2o, sx, 0.16, 0, Math.PI / 2, 0, 0); add(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 12), M.chrome, sx, 0.16, 0.5, Math.PI / 2); add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), M.dark, sx, 0.16, 0.58, Math.PI / 2); }
    for (const z of [-0.2, 0.2]) add(new THREE.BoxGeometry(0.66, 0.05, 0.05), M.strap, 0, 0.3, z);
    add(new THREE.BoxGeometry(0.62, 0.04, 0.7), M.dark, 0, 0.02, 0);
  } else if (kind === 'repare') { // caisse à outils rouge, poignée, clés posées à côté
    add(new THREE.BoxGeometry(0.58, 0.28, 0.3), M.red, 0, 0.14, 0); add(new THREE.BoxGeometry(0.6, 0.06, 0.32), M.red, 0, 0.31, 0);
    add(new THREE.TorusGeometry(0.1, 0.014, 6, 16, Math.PI), M.dark, 0, 0.34, 0); for (const sx of [-0.22, 0.22]) add(new THREE.BoxGeometry(0.05, 0.05, 0.02), M.chrome, sx, 0.26, 0.16);
    add(new THREE.BoxGeometry(0.3, 0.012, 0.03), M.chrome, 0.12, 0.006, 0.32, 0, 0.4); add(new THREE.BoxGeometry(0.24, 0.012, 0.03), M.chrome, -0.2, 0.006, 0.3, 0, -0.7);
  } else if (kind === 'billets') { // sac de toile bourré, liasses qui dépassent
    const s = add(new THREE.SphereGeometry(0.26, 18, 12), M.bag, 0, 0.22, 0); s.scale.set(1.25, 0.85, 0.9);
    add(new THREE.CylinderGeometry(0.07, 0.11, 0.12, 12), M.bag, 0, 0.44, 0); add(new THREE.TorusGeometry(0.075, 0.015, 6, 14), M.strap, 0, 0.48, 0, Math.PI / 2);
    const note = new THREE.MeshStandardMaterial({ color: '#c9b98a', roughness: 0.8 }); for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.15, 0.03, 0.07), note, 0.3 + i * 0.03, 0.02 + i * 0.03, 0.12 - i * 0.08, 0, 0.3 * i);
  } else { // plaques d'acier empilées, sangle
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.62, 0.035, 0.44), M.steel, (i - 1) * 0.02, 0.02 + i * 0.04, (i - 1) * 0.015, 0, (i - 1) * 0.05);
    add(new THREE.BoxGeometry(0.05, 0.14, 0.46), M.strap, 0.12, 0.07, 0);
  }
  return g;
}

// ---------------------------------------------------------------- installation
export function installConduite(Game) {
  const P = Game.prototype;
  const BOOST = { thr: 1 };

  // ---- préparation (une fois par partie : build() est rappelé à chaque manche)
  const build = P.build;
  P.build = function () {
    build.call(this);
    if (this._conduite) return; this._conduite = true;
    try { this.barrages = buildBarrages(this); } catch (e) { console.warn('barrages', e); }
    try { this.initBonus(); } catch (e) { console.warn('bonus de route', e); }
    this.conduiteHud();
  };

  // points de pose des bonus : chaussée dégagée (un cercle de 2,2 m sans obstacle), hors des bases et des zones
  P.initBonus = function () {
    const W = this.world, B = W.bounds, q = V(), cand = [];
    const bases = Object.values(this.socles || {}).flat().map((s) => s.pos);
    for (let z = B.z0 + 8; z < B.z1 - 8; z += 3.5) for (let x = B.x0 + 8; x < B.x1 - 8; x += 3.5) {
      if (W.inWater(x, z)) continue; const y = W.groundY(x, z, 1); if (Math.abs(y) > 0.3) continue;
      q.set(x, y, z); W.pushOut(q, 2.2, y + 0.2); if (Math.hypot(q.x - x, q.z - z) > 0.01) continue;
      if (this.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 4)) continue;
      if (bases.some((p) => Math.hypot(p.x - x, p.z - z) < 22)) continue;
      if ((W.zones || []).some((zn) => Math.hypot(zn.center[0] - x, zn.center[1] - z) < (zn.radius || 5) + 4)) continue;
      cand.push([x, y, z]);
    }
    this.bonusSpots = cand; this.bonus = [];
    const n = Math.min(16, Math.floor(cand.length / 6)); for (let i = 0; i < n; i++) this.spawnBonus();
  };
  P.spawnBonus = function () {
    const S = this.bonusSpots; if (!S?.length) return;
    // le point le plus éloigné des bonus déjà posés (parmi quelques tirages) : ils restent répartis dans toute la ville
    let best = null, bd = -1; for (let k = 0; k < 24; k++) { const s = S[Math.random() * S.length | 0]; let d = 1e9; for (const b of this.bonus) d = Math.min(d, Math.hypot(b.pos.x - s[0], b.pos.z - s[2])); if (this.player) d = Math.min(d, Math.hypot(this.player.pos.x - s[0], this.player.pos.z - s[2]) + 12); if (d > bd) { bd = d; best = s; } }
    let r = Math.random(), kind = 'nitro'; for (const [k, b] of Object.entries(BONUS)) { r -= b.w; if (r <= 0) { kind = k; break; } }
    const m = bonusMesh(kind); m.position.set(best[0], best[1] + 0.01, best[2]); m.rotation.y = Math.random() * Math.PI * 2; this.root.add(m);
    this.bonus.push({ kind, pos: V(...best), m });
  };
  P.takeBonus = function (b, c) {
    const a = c.driver; this.root.remove(b.m); this.bonus.splice(this.bonus.indexOf(b), 1); setTimeout(() => { if (this.bonus) this.spawnBonus(); }, 25000);
    if (a !== this.player) return; const D = BONUS[b.kind];
    if (b.kind === 'nitro') { c.nitro = 1; this.toast(`⛽ Nitro plein`, '#6fb7ff'); }
    else if (b.kind === 'repare') { c.hp = c.maxHp; this.toast(`🔧 Voiture réparée`, '#9be37b'); }
    else if (b.kind === 'billets') { this.earn(150 + (Math.random() * 6 | 0) * 50, D.nom.toLowerCase() + ' ramassé', false); }
    else { c.armorT = 30; this.toast(`🦺 Blindage : 30 s`, '#d5dde2'); }
    this.audio.play('coins', null, 0.7); this.input.rumble(0.3, 0.5, 90);
  };

  // ---- voiture : nitro, frôlements, dérapages, bonus, voiture lancée
  const updateCar = P.updateCar;
  P.updateCar = function (c, dt) {
    if (c.dead && c.launch) { c.launch = null; c.auto = null; }
    if (c.kind || c.dead || c.flipped) return updateCar.call(this, c, dt);
    c.baseMax ??= c.max; c.baseAccel ??= c.accel; c.nitro ??= 0.35;
    const me = c.driver === this.player && !this.paused, I = this.input;
    const want = me && (I.down('sprint') || I.down('grenade')) && c.nitro > 0.01;
    if (want) c.nitro = Math.max(0, c.nitro - dt / NITRO_DUR);
    c.boostK = lerp(c.boostK || 0, want ? 1 : 0, 1 - Math.exp(-dt * (want ? 10 : 4)));
    // vitesse de pointe relevée pendant la poussée, puis on retombe en douceur (pas de mur de vitesse quand on relâche)
    c.max = want ? c.baseMax * BOOST_MAX : Math.max(c.baseMax, Math.min(c.baseMax * BOOST_MAX, Math.abs(c.speed) - 6 * dt));
    c.accel = c.baseAccel * (1 + BOOST_ACC * c.boostK);
    if (c.launch) this.steerLaunch(c, dt); else c.auto = want ? BOOST : (c.auto === BOOST ? null : c.auto);
    if (c.armorT > 0) c.armorT -= dt;
    const before = Math.abs(c.speed);
    updateCar.call(this, c, dt);
    if (c.dead) return;
    // voiture lancée : un choc franc la fait exploser (au crédit de celui qui a sauté)
    if (c.launch && before > 11 && before - Math.abs(c.speed) > 6.5) {
      const by = c.launch.by; for (const o of this.cars) if (o !== c && !o.dead && !o.kind && o.pos.distanceTo(c.pos) < (o.L + c.L) / 2 + 0.8) this.hitCar(o, 380, by);
      c.launch = null; c.auto = null; this.explodeCar(c, by); return;
    }
    const sp = Math.abs(c.speed), f = fwdOf(c.yaw);
    // bonus sur la chaussée
    if (this.bonus?.length && c.driver) for (const b of [...this.bonus]) { const dx = b.pos.x - c.pos.x, dz = b.pos.z - c.pos.z; if (dx * dx + dz * dz > 16) continue; const lx = dx * Math.cos(c.yaw) - dz * Math.sin(c.yaw), lz = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw); if (Math.abs(lx) < c.W / 2 + 0.4 && Math.abs(lz) < c.L / 2 + 0.4) this.takeBonus(b, c); }
    if (!me) return;
    // flammes d'échappement et vent de vitesse pendant la nitro
    if (c.boostK > 0.1) {
      const back = c.pos.clone().addScaledVector(f, -c.L / 2 - 0.05), sd = sideOf(c.yaw); back.y += 0.3;
      for (const sx of [-1, 1]) { const p = back.clone().addScaledVector(sd, sx * c.W * 0.22);
        if (Math.random() < dt * 60 * c.boostK) this.fx.burst(p, 1, { color: Math.random() < 0.4 ? '#7fb8ff' : '#ffb347', speed: 1.5, size: 0.07 + Math.random() * 0.05, life: 0.12, grav: 0, emissive: true, long: true, normal: f.clone().negate(), spread: 0.25 }); }
      this.cam.zoomP = Math.min(this.cam.zoomP || 0, -9 * c.boostK); this.cam.trauma = Math.max(this.cam.trauma, 0.12 * c.boostK);
      this.audio.engine(true, Math.min(1.25, sp / c.baseMax + 0.25 * c.boostK), c.pos);
      if (want && !c.wasBoost) { this.input.rumble(0.6, 0.3, 160); this.audio.play('cloth', null, 0.5, [0.45, 0.55]); }
    }
    c.wasBoost = want;
    // dérapage : la jauge se remplit tant que ça glisse
    if (Math.abs(c.slipV || 0) > 2.8 && sp > 8) { c.driftT = (c.driftT || 0) + dt; c.nitro = Math.min(1, c.nitro + dt * 0.12); }
    else if (c.driftT) { if (c.driftT > 1.4) this.carStunt(`Dérapage ${c.driftT.toFixed(1)} s`); c.driftT = 0; }
    // frôlement : passer à moins d'un mètre d'une voiture ou d'un passant sans le toucher
    if (sp > 13) {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), t = this.time;
      const near = (px, pz, halfW, key) => { const dx = px - c.pos.x, dz = pz - c.pos.z; if (dx * dx + dz * dz > 64) return; const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        const gap = Math.abs(lx) - c.W / 2 - halfW; if (Math.abs(lz) < c.L / 2 && gap > 0.05 && gap < 1.1 && !(key.nearT > t)) { key.nearT = t + 3; c.nitro = Math.min(1, c.nitro + 0.15); this.carStunt('Frôlé !'); } };
      for (const o of this.cars) if (o !== c && !o.dead) near(o.pos.x, o.pos.z, (o.W || 1.6) / 2, o);
      for (const a of this.actors) if (a.alive && !a.inCar && a !== this.player) near(a.pos.x, a.pos.z, 0.3, a);
    }
  };
  // petite annonce de figure (une à la fois), et un peu de nitro en plus
  P.carStunt = function (txt) { if (this.time < (this._stuntT || 0)) return; this._stuntT = this.time + 1.2; const el = this._stuntEl; if (!el) return; el.textContent = txt; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); this.audio.play('uiTick', null, 0.5); };

  // blindage ramassé : la voiture encaisse moins
  const hitCar = P.hitCar;
  P.hitCar = function (c, dmg, by) { if (c.armorT > 0) dmg *= 0.4; return hitCar.call(this, c, dmg, by); };

  // ---- lance-voiture : la cible est l'adversaire devant la voiture le plus proche de la ligne de visée
  P.launchTarget = function (c, by) {
    const f = fwdOf(c.yaw), cd = V(); this.camera.getWorldDirection(cd); cd.y = 0; cd.normalize();
    const eye = c.pos.clone().add(V(0, 1.2, 0)); let best = null, bs = -1e9;
    for (const t of this.actors) {
      if (!t.alive || t.gone || t.team === by.team) continue; const p = t.inCar ? t.inCar.pos : t.pos; const d = V(p.x - c.pos.x, 0, p.z - c.pos.z); const L = d.length(); if (L < 5 || L > 85) continue; d.divideScalar(L);
      const ahead = d.dot(f); if (ahead < 0.8) continue; const s = d.dot(cd) * 1.4 + ahead * 0.6 - L / 160; if (s <= bs) continue;
      if (!this.world.los(eye, V(p.x, p.y + 1.1, p.z))) continue; bs = s; best = t;
    }
    return best;
  };
  P.steerLaunch = function (c, dt) {
    const L = c.launch; L.t += dt; if (L.t > L.dur) { c.launch = null; c.auto = null; return; }
    let want = L.dir; const T = L.target;
    if (T && T.alive && !T.gone) { const tp = T.inCar ? T.inCar.pos : T.pos, tv = T.inCar ? T.inCar.vel || V() : T.vel; const d = tp.distanceTo(c.pos), lead = d / Math.max(12, Math.abs(c.speed));
      want = Math.atan2(tp.x + tv.x * lead - c.pos.x, tp.z + tv.z * lead - c.pos.z); }
    const diff = wrap(want - c.yaw); c.auto = { thr: 1, st: clamp(diff * 2.4, -1, 1) };
  };

  // ---- sauter d'une voiture en marche
  const enterCar = P.enterCar;
  P.enterCar = function (a, c) { if (!c.kind) { c.launch = null; c.auto = null; } return enterCar.call(this, a, c); };
  const exitCar = P.exitCar;
  P.exitCar = function (a, dead) {
    const c = a.inCar;
    const wet = c && this.world.water && this.world.inWater(c.pos.x, c.pos.z) && c.pos.y < this.world.water.y + 0.5; // voiture qui coule : on sort normalement
    if (c && !c.kind && !dead && !wet && a.alive && !this.over && Math.abs(c.speed) > BAIL_MIN) return this.bailOut(a, c);
    return exitCar.call(this, a, dead);
  };
  P.bailOut = function (a, c) {
    const sp = Math.abs(c.speed), side = sideOf(c.yaw), fast = sp > 15;
    // la cible et le cap sont pris au moment du saut (ce qu'on vise à ce moment-là)
    const target = this.launchTarget(c, a); const cd = V(); this.camera.getWorldDirection(cd); let dir = c.yaw;
    if (a === this.player) { const cy = Math.atan2(cd.x, cd.z); if (Math.abs(wrap(cy - c.yaw)) < 0.6) dir = cy; }
    c.driver = null; a.inCar = null; a.ch.root.visible = true;
    c.launch = { by: a, t: 0, dur: 4.5, target, dir }; c.auto = { thr: 1, st: 0 };
    a.pos.copy(c.pos).addScaledVector(side, c.W / 2 + 0.3); a.pos.y = c.pos.y + 0.45; this.world.pushOut(a.pos, 0.35, a.pos.y);
    a.vel.copy(c.vel || fwdOf(c.yaw).multiplyScalar(c.speed)).multiplyScalar(0.7).addScaledVector(side, 3.4); a.vel.y = 3.2; a.onGround = false;
    a.bail = { t: 0, fast, sp, clip: fast ? 'MX_BailFlat' : 'MX_BailRoll', dur: fast ? 4.15 : 1.72, dir: Math.atan2(a.vel.x, a.vel.z), hurt: false };
    if (!a.ch.actions[a.bail.clip]) a.bail.clip = 'MX_HardLand';
    a.overs = null; a.reloadT = 0; if (a.ch.gun) a.ch.gun.visible = false;
    this.setAnim(a, a.bail.clip, 0.05, 1);
    if (a === this.player) {
      this.audio.engine(false); this.audio.play('slam', c.pos, 0.7); this.audio.play('cloth', null, 0.9); this.cam.trauma = Math.min(1, this.cam.trauma + 0.35); this.input.rumble(0.8, 0.6, 220);
      this.toast(target ? `🎯 Voiture lancée sur ${target.name}` : `🚗 Voiture lancée`, '#ffcc3d');
    }
  };
  const updateActor = P.updateActor;
  P.updateActor = function (a, dt) {
    if (a.bail) { if (a.alive && !a.inCar && !a.gone) return this.updateBail(a, dt); a.bail = null; if (a.ch.gun) a.ch.gun.visible = true; }
    return updateActor.call(this, a, dt);
  };
  P.updateBail = function (a, dt) {
    const B = a.bail, W = this.world; B.t += dt; a.fireT -= dt; if (a === this.player) this.aiming = false;
    a.vel.y -= GRAV * dt; a.pos.addScaledVector(a.vel, dt);
    if (W.pushOut(a.pos, 0.35, a.pos.y)) { a.vel.x *= 0.35; a.vel.z *= 0.35; if (!B.wall && Math.hypot(a.vel.x, a.vel.z) > 3) { B.wall = true; this.audio.play('thud', a.pos, 0.8); } }
    const gy = W.standY(a.pos.x, a.pos.z, a.pos.y + 0.3);
    if (a.pos.y <= gy) {
      if (!a.onGround) { // premier contact avec le sol
        if (!B.hurt) { B.hurt = true; const dmg = clamp((B.sp - 8) * 2.4, 0, 40); if (dmg > 0) this.damage(a, Math.min(dmg, Math.max(0, a.hp - 6)), null, { src: null });
          this.fx.dust(a.pos, B.fast ? 12 : 7, B.fast ? 1.4 : 1); this.audio.play('land', a === this.player ? null : a.pos, 0.8); this.audio.play('thud', a.pos, 0.6);
          if (a === this.player) { this.cam.dip -= 0.25; this.cam.trauma = Math.min(1, this.cam.trauma + (B.fast ? 0.55 : 0.3)); this.input.rumble(1, 0.8, 260); } }
      }
      a.pos.y = gy; a.vel.y = 0; a.onGround = true;
      // ça glisse et ça roule sur le bitume avant de s'arrêter
      const h = Math.hypot(a.vel.x, a.vel.z), dec = (B.fast ? 6.5 : 8.5) * dt, k = h > dec ? (h - dec) / h : 0; a.vel.x *= k; a.vel.z *= k;
      if (h > 4 && Math.random() < dt * 12 && a.pos.distanceToSquared(this.camera.position) < 900) this.fx.dust(a.pos, 1, 0.6);
    } else a.onGround = false;
    if (Math.hypot(a.vel.x, a.vel.z) > 1.5) B.dir = Math.atan2(a.vel.x, a.vel.z);
    a.ch.root.position.copy(a.pos); a.ch.root.rotation.y = B.dir; a.ch.model.rotation.x = 0;
    this.setAnim(a, B.clip, 0.05, 1);
    if (a.ch.actions.MX_Idle) this.locomotion(a, dt, 0, false); // les allures s'effacent (sinon elles retiennent le corps debout)
    Anim.dead(a, dt); // le clip joue seul, pieds attachés (comme une chute)
    if (B.t >= B.dur) { a.bail = null; a.landK = 0.25; a.yaw = B.dir; if (a.ch.gun) a.ch.gun.visible = true; this.setAnim(a, 'LOCO', 0.3); }
  };
  // pendant la chute on ne tire pas, on ne ramasse rien, on ne remonte pas en voiture
  const interactions = P.interactions;
  P.interactions = function (a, dt) { if (a.bail) return; return interactions.call(this, a, dt); };

  // ---- interface : jauge de nitro, figures, repères des bonus et de la cible
  P.conduiteHud = function () {
    const car = document.getElementById('car'); if (!car || document.getElementById('nitro')) return;
    const nb = document.createElement('div'); nb.className = 'bar nitro'; nb.innerHTML = '<i id="nitro"></i>'; car.insertBefore(nb, document.getElementById('heliui'));
    const st = document.createElement('div'); st.id = 'stunt'; document.getElementById('hud')?.appendChild(st); this._stuntEl = st;
    const mk = document.createElement('div'); mk.id = 'roadmarks'; document.getElementById('hud')?.appendChild(mk); this._marks = mk;
  };
  const updateHud = P.updateHud;
  P.updateHud = function () {
    updateHud.call(this);
    const a = this.player, c = a?.inCar, el = document.getElementById('nitro'); if (!el) return;
    const on = !!c && !c.kind; el.parentNode.style.display = on ? '' : 'none'; if (on) { el.style.width = ((c.nitro ?? 0) * 100).toFixed(0) + '%'; el.parentNode.classList.toggle('full', (c.nitro ?? 0) > 0.98); el.parentNode.classList.toggle('armor', c.armorT > 0); }
  };
  const update = P.update;
  P.update = function (dt, bg = false) {
    update.call(this, dt, bg);
    if (this.barrages?.lamps?.length) { const on = (this.time * 1.6) % 1 < 0.35; if (on !== this._lampOn) { this._lampOn = on; mats().lamp.emissiveIntensity = on ? 2.2 : 0.15; } }
    if (!bg) this.roadMarks(dt);
  };
  // repères à l'écran : bonus proches (en voiture) et cible du lance-voiture
  const _p = V();
  P.roadMarks = function (dt) {
    const box = this._marks; if (!box) return; const a = this.player, c = a?.inCar && !a.inCar.kind ? a.inCar : null;
    this._markT = (this._markT || 0) - dt; if (this._markT > 0) return; this._markT = 1 / 30;
    const want = [];
    if (c && a.alive) {
      for (const b of this.bonus || []) { const d = b.pos.distanceTo(c.pos); if (d < 90) want.push({ key: b, p: b.pos, y: 0.9, html: svg(BONUS[b.kind].ico) + `<span>${Math.round(d)} m</span>`, cls: 'bonus ' + b.kind }); }
      if (Math.abs(c.speed) > BAIL_MIN) { this._tgtT = (this._tgtT || 0) - 1 / 30; if (this._tgtT <= 0) { this._tgtT = 0.2; this._tgt = this.launchTarget(c, a); } const t = this._tgt; if (t && t.alive) want.push({ key: 'cible', p: t.inCar ? t.inCar.pos : t.pos, y: 2.3, html: `${svg('target')}<span>Sauter : voiture sur ${t.name}</span>`, cls: 'cible' }); }
    }
    const W = innerWidth, H = innerHeight; const used = new Set();
    for (const m of want) {
      _p.copy(m.p); _p.y += m.y; _p.project(this.camera); if (_p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05) continue;
      const cib = m.key === 'cible'; let el = cib ? this._cibleEl : m.key.markEl;
      if (!el) { el = document.createElement('div'); box.appendChild(el); if (cib) this._cibleEl = el; else m.key.markEl = el; }
      if (el._h !== m.html) { el.innerHTML = m.html; el._h = m.html; } el.className = 'rm ' + m.cls;
      el.style.transform = `translate(${((_p.x + 1) / 2 * W).toFixed(0)}px, ${((1 - _p.y) / 2 * H).toFixed(0)}px)`; used.add(el);
    }
    for (const el of [...box.children]) if (!used.has(el)) el.style.transform = 'translate(-999px,-999px)';
    for (const b of this.bonus || []) if (b.markEl && !b.markEl.isConnected) b.markEl = null;
  };
  const takeBonus = P.takeBonus;
  P.takeBonus = function (b, c) { b.markEl?.remove(); b.markEl = null; return takeBonus.call(this, b, c); };
}
