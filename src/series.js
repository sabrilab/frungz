// Gros paliers de série (10, 14, 18, 25 éliminations) : tout ce qui vient du ciel et reste un moment.
// - hélicoptère armé (les deux camps) : tourne au-dessus de la zone visée et mitraille ce qu'il voit
// - frappe aérienne (Brigade) : un chasseur passe et tapisse de bombes une ligne vers la zone visée
// - essaim de drones (Frungz) : 6 drones kamikazes qui traquent chacun une cible
// - canonnière (les deux camps) : le joueur pilote la visée d'un avion-canon (25 mm / 105 mm) ; un bot la laisse tirer seule
// - assaut final (25) : bombardement de toutes les zones adverses, adversaires repérés, renforts largués
// Tout est léger : maillages en boîtes partagées, aucune lumière, particules du pool des traînées, un seul tableau `air`.
import * as THREE from 'three';
import { TEAMS } from './data.js';
import { THROWS } from './throws.js';
import { svg } from './icons.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];

Object.assign(THROWS, {
  heli: { spell: 1, nom: 'Hélico de la Gendarmerie', icon: '', ico: 'heli', r: 16, ringR: 6, col: '#3d8bff' },
  hdetourne: { spell: 1, nom: 'Hélico détourné', icon: '', ico: 'heli', r: 16, ringR: 6, col: '#34c759' },
  frappe: { spell: 1, nom: 'Frappe aérienne', icon: '', ico: 'jet', r: 7, col: '#ff3d3d' },
  essaim: { spell: 1, nom: 'Essaim de drones', icon: '', ico: 'swarm', r: 10, col: '#ff7a2f' },
  canon: { spell: 1, instant: 1, nom: 'Canonnière', icon: '', ico: 'gunship', r: 0, col: '#9ff59f' },
  ultime: { spell: 1, instant: 1, nom: 'Assaut général', icon: '', ico: 'nuke', r: 0, col: '#c27bff' },
});

// ------------------------------------------------------------------ maillages (matières partagées)
const MAT = {}; const mat = (c, e = 0) => MAT[c + e] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.25, flatShading: true, emissive: e ? c : '#000', emissiveIntensity: e });
const GEO = {}; const box = (w, h, d) => GEO[`b${w}|${h}|${d}`] ||= new THREE.BoxGeometry(w, h, d);
const part = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
const cone = () => GEO.cone ||= new THREE.ConeGeometry(5, 22, 20, 1, true).translate(0, -11, 0);
const BEAM = new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

function heliMesh(team) {
  const g = new THREE.Group(); const civ = team === 'civils';
  const body = mat(civ ? '#d9d4c7' : '#1c2a44'), stripe = mat(civ ? '#e0592a' : '#e9eef5'), dark = mat('#20242b'), glass = mat('#7fb6d9', 0.15);
  g.add(part(box(1.7, 1.6, 3.4), body, 0, 0, 0.2), part(box(1.72, 0.25, 3.42), stripe, 0, -0.2, 0.2), part(box(1.5, 1.1, 1.1), glass, 0, 0.15, 2.1));
  g.add(part(box(0.45, 0.45, 4.6), body, 0, 0.25, -3.6), part(box(0.1, 1.3, 0.8), body, 0, 0.8, -5.8));
  g.add(part(box(0.15, 0.15, 2.8), dark, -0.7, -1.05, 0.2), part(box(0.15, 0.15, 2.8), dark, 0.7, -1.05, 0.2)); // patins
  g.add(part(box(0.3, 0.3, 0.9), dark, 0, -0.75, 2.4)); // tourelle
  const rotor = new THREE.Group(); rotor.position.y = 1.05; rotor.add(part(box(10, 0.06, 0.32), dark), part(box(0.32, 0.06, 10), dark), part(box(0.3, 0.3, 0.3), dark)); g.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.12, 0.8, -5.8); tail.add(part(box(0.04, 1.8, 0.16), dark)); g.add(tail);
  const beam = new THREE.Mesh(cone(), BEAM); beam.position.set(0, -0.8, 2.4); beam.rotation.x = 0.5; g.add(beam);
  const l1 = part(box(0.14, 0.14, 0.14), mat('#ff2a2a', 3), -0.9, -0.5, 0.2), l2 = part(box(0.14, 0.14, 0.14), mat(civ ? '#ffd23d' : '#2a6bff', 3), 0.9, -0.5, 0.2); g.add(l1, l2);
  g.userData = { rotor, tail, l1, l2, beam }; g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; }); return g;
}
function jetMesh() {
  const g = new THREE.Group(); const grey = mat('#6b7480'), dark = mat('#2b3038');
  g.add(part(box(1.3, 1.1, 11), grey), part(box(0.9, 0.7, 2), mat('#9fc3db', 0.1), 0, 0.6, 2.6));
  const wing = part(box(10, 0.18, 3.2), grey, 0, -0.1, -1.2); g.add(wing); g.add(part(box(4, 0.15, 1.4), grey, 0, 0, -4.8), part(box(0.15, 2, 1.6), grey, 0, 1.1, -4.8));
  const nose = new THREE.Mesh(GEO.jnose ||= new THREE.ConeGeometry(0.65, 2.2, 8).rotateX(Math.PI / 2), dark); nose.position.z = 6.6; g.add(nose);
  g.add(part(box(0.9, 0.9, 0.5), mat('#ff9a3d', 4), 0, 0, -5.7)); // post-combustion
  return g;
}
function gunshipMesh(team) {
  const g = new THREE.Group(); const c = mat(team === 'civils' ? '#5e5a4c' : '#59626b'), dark = mat('#262a30');
  g.add(part(box(3, 3, 22), c), part(box(36, 0.5, 4), c, 0, 1.2, 1), part(box(11, 0.4, 2.6), c, 0, 1, -10), part(box(0.4, 5, 3.2), c, 0, 3.5, -10));
  for (const x of [-13, -7, 7, 13]) { g.add(part(box(1.2, 1.2, 4), dark, x, 0.8, 2.6)); g.add(part(box(0.15, 4.2, 0.25), dark, x, 0.8, 4.7)); }
  g.add(part(box(0.5, 0.5, 2), dark, -1.7, -0.6, 2), part(box(0.7, 0.7, 2.8), dark, -1.7, -0.4, -3)); // canons côté gauche
  g.add(part(box(0.3, 0.3, 0.3), mat('#ff2a2a', 3), -18, 1.2, 1), part(box(0.3, 0.3, 0.3), mat('#2aff6b', 3), 18, 1.2, 1));
  return g;
}
function kamikazeMesh() {
  const g = new THREE.Group(); const dark = mat('#1d2026');
  g.add(part(box(0.32, 0.12, 0.32), dark), part(box(0.7, 0.03, 0.06), dark, 0, 0.02, 0), part(box(0.06, 0.03, 0.7), dark, 0, 0.02, 0), part(box(0.12, 0.12, 0.2), mat('#c2361f'), 0, -0.1, 0.05));
  const led = part(box(0.06, 0.06, 0.06), mat('#ff2a2a', 4), 0, 0.08, 0.16); g.add(led); g.userData.led = led; return g;
}

export function installSeries(Game) {
  const P = Game.prototype;
  const foeOf = (team) => (t) => t.alive && !t.gone && !t.inCar && t.team !== team;
  const credit = (o) => (o?.alive ? o : null);

  // ----- activation sans visée (canonnière, assaut final)
  P.activateStreak = function (a, id) {
    const T = THROWS[id]; const busy = id === 'canon' && (this.air || []).some((x) => x.type === 'gunship' && x.team === a.team);
    if (busy) { if (a === this.player) this.toast('Une canonnière de ton camp est déjà en l\'air', '#ccc'); else a.ai.streakT = 6; return; }
    const i = a.rewards.lastIndexOf(id); if (i < 0) return; a.rewards.splice(i, 1); this.streakCd[a.team] = this.time + 20; this.streakDirty = 1;
    const def = this.streakDef(a, id), me = a === this.player;
    if (me) { this.flash(`radial-gradient(ellipse at center, rgba(255,255,255,.35), ${T.col})`); this.audio.streakGo(); this.cam.trauma = Math.min(1, this.cam.trauma + 0.5); this.input.rumble(1, 1, 400); this.streakUsed = id; }
    else if (a.team === this.player.team) this.toast(`${a.name} lance : ${def.nom}`, TEAMS[a.team].color);
    if (id === 'canon') this.startGunship(a, def);
    else this.ultimate(a, def);
  };

  // ----- point d'entrée des sorts lancés (marqueur posé au sol)
  const landSpell = P.landSpell;
  P.landSpell = function (kind, p, owner) {
    if (kind === 'heli' || kind === 'hdetourne') return this.startHeli(owner, p, kind);
    if (kind === 'frappe') return this.startJet(owner, p);
    if (kind === 'essaim') return this.startSwarm(owner, p);
    return landSpell.call(this, kind, p, owner);
  };
  const updateThrown = P.updateThrown;
  P.updateThrown = function (dt) { updateThrown.call(this, dt); this.updateAir(dt); };

  // ================================================================ hélicoptère armé
  P.startHeli = function (owner, p, kind) {
    const T = THROWS[kind], team = owner.team; this.mark(p, T.ringR, T.col, 3);
    const m = heliMesh(team); const from = V(rnd(-1, 1), 0, rnd(-1, 1)).normalize();
    const H = { type: 'heli', team, owner, c: p.clone(), t: 0, life: 35, m, ang: Math.atan2(from.z, from.x), from, ft: 0, look: 0, tgt: null, shots: 0 };
    m.position.copy(p).addScaledVector(from, 140).add(V(0, 50, 0)); this.root.add(m); (this.air ||= []).push(H);
    if (this.player.team !== team && this.player.pos.distanceTo(p) < 80) this.bigText(`${svg('heli')} HÉLICO EN APPROCHE`, 'mets-toi à couvert !', '#ff4a4a', 't3');
  };
  P.heliTick = function (H, dt) {
    const m = H.m, u = m.userData; H.ang += dt * 0.3;
    const orbit = V(H.c.x + Math.cos(H.ang) * 15, H.c.y + 21, H.c.z + Math.sin(H.ang) * 15);
    let want = orbit; if (H.t < 4) want = orbit.clone().lerp(H.c.clone().addScaledVector(H.from, 140).add(V(0, 50, 0)), 1 - H.t / 4);
    if (H.t > H.life) want = m.position.clone().add(V(H.from.x * 40, 12, H.from.z * 40));
    const prev = m.position.clone(); m.position.lerp(want, 1 - Math.exp(-dt * (H.t > H.life ? 0.6 : 2.2)));
    const vel = m.position.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    const face = H.tgt ? H.tgt.pos.clone().sub(m.position) : vel; const yaw = Math.atan2(face.x, face.z);
    let dy = yaw - m.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.rotation.y += dy * Math.min(1, dt * 3);
    m.rotation.x = Math.min(0.25, vel.length() * 0.012); m.rotation.z = Math.sin(H.t * 0.9) * 0.05;
    u.rotor.rotation.y += dt * 38; u.tail.rotation.x += dt * 50; const bl = Math.sin(H.t * 9) > 0; u.l1.visible = bl; u.l2.visible = !bl;
    if ((H.snd = (H.snd || 0) - dt) <= 0) { H.snd = 0.5; this.audio.rotor(m.position, 1); }
    if (H.t > H.life + 7) return false;
    if (H.t < 3 || H.t > H.life) return true;
    // cible : l'adversaire le plus proche que l'hélico voit
    if ((H.look -= dt) <= 0) { H.look = 0.4; H.tgt = null; let best = 60 * 60; const o = m.position;
      for (const t of this.actors) { if (!t.alive || t.gone || t.team === H.team || (t.inCar && !t.inCar.kind)) continue; const d2 = (t.pos.x - H.c.x) ** 2 + (t.pos.z - H.c.z) ** 2; if (d2 > best) continue;
        const aim = t.pos.clone().add(V(0, 1.1, 0)), dir = aim.clone().sub(o), L = dir.length(); dir.divideScalar(L); const h = this.world.ray(o, dir, L); if (h && h.t < L - 0.8) continue; best = d2; H.tgt = t; } }
    if (H.tgt && H.tgt.alive) {
      H.ft -= dt; while (H.ft <= 0) { H.ft += 0.09; H.shots++;
        const o = m.position.clone().add(V(0, -1, 0)); const aim = H.tgt.pos.clone().add(V(0, 1.1, 0)); const d = aim.sub(o).normalize(); d.x += rnd(-1, 1) * 0.03; d.y += rnd(-1, 1) * 0.03; d.z += rnd(-1, 1) * 0.03; d.normalize();
        const hw = this.world.ray(o, d, 90); const ha = this.rayActors(o, d, hw ? hw.t : 90, null); let end;
        if (ha) { end = o.clone().addScaledVector(d, ha.t); if (ha.a.team !== H.team) this.damage(ha.a, 13, credit(H.owner), { ico: 'heli', head: false }); this.fx.impact(end, [-d.x, -d.y, -d.z], 'flesh'); }
        else if (hw) { end = o.clone().addScaledVector(d, hw.t); if (H.shots % 2) this.fx.impact(end, hw.n, 'world'); }
        else end = o.clone().addScaledVector(d, 90);
        if (H.shots % 2) this.fx.tracer(o, end); if (H.shots % 3 === 0) this.audio.gun('lmg', o, 1.1);
      }
    }
    return true;
  };

  // ================================================================ frappe aérienne
  P.startJet = function (owner, p) {
    const dir = V(p.x - owner.pos.x, 0, p.z - owner.pos.z); if (dir.lengthSq() < 4) dir.set(Math.sin(owner.yaw), 0, Math.cos(owner.yaw)); dir.normalize();
    const T = THROWS.frappe, team = owner.team, len = 26, speed = 120, run = 260, wait = 2.2;
    // marquage de la ligne : trois cercles le long de la trajectoire des bombes
    for (const s of [-len * 0.66, 0, len * 0.66]) { const q = p.clone().addScaledVector(dir, s); q.y = this.world.groundY(q.x, q.z, p.y + 3); this.mark(q, T.r, T.col, wait + 2.5, s === 0 ? { team, big: `${svg('jet')} FRAPPE AÉRIENNE`, small: 'sors de la ligne !' } : null); }
    const m = jetMesh(); const start = p.clone().addScaledVector(dir, -run / 2).add(V(0, 48, 0)); m.position.copy(start); m.lookAt(start.clone().add(dir)); m.visible = false; this.root.add(m);
    (this.air ||= []).push({ type: 'jet', team, owner, m, start, dir, speed, t: -wait, life: run / speed });
    this.audio.whistle(p, 0.6); setTimeout(() => this.audio.jet(p), wait * 700);
    for (let i = 0; i < 10; i++) { const s = -len + (2 * len * i) / 9 + rnd(-1.5, 1.5); const q = p.clone().addScaledVector(dir, s).add(V(rnd(-2.5, 2.5), 0, rnd(-2.5, 2.5)));
      const pass = wait + (run / 2 + s) / speed; (this.airHits ||= []).push({ at: this.time + pass + 0.8, kind: 'bomb', pos: q, owner, drop: this.time + pass }); }
  };
  P.jetTick = function (J, dt) {
    if (J.t < 0) return true; J.m.visible = true; J.m.position.copy(J.start).addScaledVector(J.dir, J.t * J.speed);
    if ((J.tp = (J.tp || 0) - dt) <= 0) { J.tp = 0.03; this.trailPuff(J.m.position.clone().addScaledVector(J.dir, -6), '#ffb070', 0.3, 0, 0.2); this.trailPuff(J.m.position.clone().addScaledVector(J.dir, -7), '#9a9a9a', 1.2, 0.2, 0.4); }
    return J.t < J.life + 0.5;
  };

  // ================================================================ essaim de drones kamikazes
  P.startSwarm = function (owner, p) {
    const T = THROWS.essaim, team = owner.team; this.mark(p, 3, T.col, 2.5);
    if (this.player.team !== team && this.player.pos.distanceTo(p) < 70) this.bigText(`${svg('swarm')} ESSAIM DE DRONES`, 'ils te cherchent : tire-les ou cours !', '#ff4a4a', 't3');
    for (let i = 0; i < 6; i++) { const m = kamikazeMesh(); m.position.copy(p).add(V(rnd(-1, 1), 0.5, rnd(-1, 1))); this.root.add(m);
      (this.air ||= []).push({ type: 'kami', team, owner, m, vel: V(rnd(-2, 2), 7, rnd(-2, 2)), t: -i * 0.18, life: 14, tgt: null, look: 0 }); }
  };
  P.kamiTick = function (K, dt) {
    if (K.t < 0) { K.m.visible = false; return true; } K.m.visible = true; const m = K.m;
    if ((K.look -= dt) <= 0) { K.look = 0.5; if (!K.tgt?.alive) { let best = 70 * 70; K.tgt = null; const taken = new Set(this.air.filter((x) => x.type === 'kami' && x !== K && x.tgt).map((x) => x.tgt));
      for (const t of this.actors) { if (!t.alive || t.gone || t.team === K.team || (t.inCar && !t.inCar.kind)) continue; const d2 = t.pos.distanceToSquared(m.position) * (taken.has(t) ? 3 : 1); if (d2 < best) { best = d2; K.tgt = t; } } } }
    const want = K.t < 0.8 ? V(0, 8, 0) : K.tgt ? K.tgt.pos.clone().add(V(0, 1, 0)).sub(m.position).normalize().multiplyScalar(17) : V(0, -4, 0);
    K.vel.lerp(want, 1 - Math.exp(-dt * 3)); m.position.addScaledVector(K.vel, dt); m.lookAt(m.position.clone().add(K.vel)); m.userData.led.visible = Math.sin(K.t * 20) > 0;
    if ((K.snd = (K.snd || 0) - dt) <= 0) { K.snd = 0.7; this.audio.buzz(m.position, 0.4); }
    const gy = this.world.groundY(m.position.x, m.position.z, m.position.y + 0.5);
    const hitT = K.tgt && K.tgt.alive && K.tgt.pos.clone().add(V(0, 1, 0)).distanceTo(m.position) < 1.4;
    if (hitT || (K.t > 1 && m.position.y < gy + 0.3) || K.t > K.life) { const p = m.position.clone(); p.y = Math.max(p.y - 0.5, gy); this.boom(p, 4, 115, K.owner, '#ff7a2f', { foesOnly: true }); return false; }
    return true;
  };

  // ================================================================ canonnière
  P.startGunship = function (a, def) {
    const team = a.team; let c = a.pos.clone();
    if (a.bot) { // un bot la place sur la zone où il y a le plus d'adversaires
      let best = -1; for (const z of this.zoneState) { if (z.souterraine) continue; const zc = V(z.center[0], 0, z.center[1]); const n = this.actors.filter((t) => foeOf(team)(t) && Math.hypot(t.pos.x - zc.x, t.pos.z - zc.z) < 30).length; if (n > best) { best = n; c = zc; } }
      c.y = this.world.groundY(c.x, c.z, 0.7); }
    const m = gunshipMesh(team); this.root.add(m);
    const G = { type: 'gunship', team, owner: a, def, c: c.clone(), aim: c.clone(), t: 0, life: 25, ang: rnd(0, 6.28), m, cd25: 0, cd105: 1, ai: 0, me: a === this.player };
    (this.air ||= []).push(G); this.gsPlace(G, 0);
    if (G.me) {
      this.gs = G; this.thr = null; this.arcHide?.(); this.aiming = false; $('hud')?.classList.add('gs'); $('gunship')?.classList.add('on'); m.visible = false;
      this.bigText(`${svg('gunship')} ${def.nom.toUpperCase()} !!`, 'visée : souris / stick · ' + this.input.label('fire') + ' 25 mm · ' + this.input.label('aim') + ' 105 mm', '#9ff59f', 't5');
    } else if (this.player.team !== team) this.bigText(`${svg('gunship')} CANONNIÈRE ENNEMIE`, 'reste sous les toits !', '#ff4a4a', 't4');
  };
  P.gsPlace = function (G, dt) { G.ang += dt * 0.16; const R = 70; G.m.position.set(G.c.x + Math.cos(G.ang) * R, G.c.y + 95, G.c.z + Math.sin(G.ang) * R);
    const tan = V(-Math.sin(G.ang), 0, Math.cos(G.ang)); G.m.lookAt(G.m.position.clone().add(tan)); G.m.rotateZ(-0.3); };
  P.gsShoot = function (G, big) {
    const o = G.m.position.clone(); const tgt = G.aim.clone(); if (!G.me) tgt.add(V(rnd(-2, 2), 0, rnd(-2, 2)));
    const d = tgt.sub(o).normalize(); if (G.me) { d.x += rnd(-1, 1) * 0.002; d.z += rnd(-1, 1) * 0.002; d.normalize(); }
    const h = this.world.ray(o, d, 260); const end = h ? o.clone().addScaledVector(d, h.t) : o.clone().addScaledVector(d, 160);
    this.fx.tracer(o.clone().addScaledVector(d, 6), end, big ? '#ffffff' : undefined);
    (this.airHits ||= []).push({ at: this.time + (big ? 0.45 : 0.2), kind: big ? 'g105' : 'g25', pos: end, owner: G.owner });
    if (G.me) { this.cam.trauma = Math.min(1, this.cam.trauma + (big ? 0.45 : 0.06)); this.input.rumble(big ? 1 : 0.3, big ? 1 : 0.4, big ? 260 : 50); this.audio.cannon(null, big); }
  };
  P.gunshipTick = function (G, dt) {
    this.gsPlace(G, dt); G.cd25 -= dt; G.cd105 -= dt;
    if (G.me && (!G.owner.alive || G.t > G.life)) { this.endGunship(); return false; }
    if (!G.me) {
      if (G.t > G.life) return false; if (G.t < 2) return true;
      if ((G.ai -= dt) <= 0) { G.ai = 0.25; const foes = this.actors.filter((t) => foeOf(G.team)(t) && Math.hypot(t.pos.x - G.c.x, t.pos.z - G.c.z) < 55);
        if (foes.length) { const t = pick(foes); G.aim.copy(t.pos); if (G.cd105 <= 0) { G.cd105 = 3; this.gsShoot(G, true); } else if (Math.random() < 0.7) this.gsShoot(G, false); } }
      if ((G.snd = (G.snd || 0) - dt) <= 0) { G.snd = 1; this.audio.rotor(G.m.position, 1.6); }
      return true;
    }
    // vue du joueur : adversaires marqués autour de la zone
    if ((G.spot = (G.spot || 0) - dt) <= 0) { G.spot = 0.4; for (const t of this.actors) if (foeOf(G.team)(t) && t.pos.distanceTo(G.aim) < 70) t.spotMark = Math.max(t.spotMark || 0, this.time + 0.6); }
    if ((G.hud = (G.hud || 0) - dt) <= 0) { G.hud = 0.1; this.drawGunshipHud(G); }
    return true;
  };
  P.endGunship = function () {
    const G = this.gs; if (!G) return; this.gs = null; this.root.remove(G.m); G.done = true;
    $('hud')?.classList.remove('gs'); $('gunship')?.classList.remove('on'); this.cam.snap = true; this.cam.trauma = 0;
  };
  P.drawGunshipHud = function (G) {
    const el = $('gunship'); if (!el) return; const I = this.input; const left = Math.max(0, G.life - G.t);
    el.innerHTML = `<div class="rt${G.cd105 <= 0 ? ' wide' : ''}"></div><div class="tl"><b>${svg('gunship')} ${G.def.nom}</b><br>${left.toFixed(0)} s · ${I.label('streak')} pour quitter</div><div class="bar"><i style="width:${(left / G.life) * 100}%"></i></div>`
      + `<div class="wp"><span><kbd>${I.label('fire')}</kbd>25 mm</span><span class="${G.cd105 > 0 ? 'off' : ''}"><kbd>${I.label('aim')}</kbd>105 mm${G.cd105 > 0 ? ' · ' + G.cd105.toFixed(1) + ' s' : ''}</span></div>`;
  };
  // commandes pendant la canonnière : le perso reste planté là où il est (et reste vulnérable)
  const updatePlayer = P.updatePlayer;
  P.updatePlayer = function (dt) {
    const G = this.gs; if (!G) return updatePlayer.call(this, dt);
    const a = this.player, I = this.input; if (I.pressed('pause')) { this.onPause?.(); return; }
    if (!a.alive) { this.endGunship(); return updatePlayer.call(this, dt); }
    const f = V(); this.camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-6) f.set(0, 0, 1); f.normalize(); const r = V(-f.z, 0, f.x);
    const ms = 0.09 * I.settings.sens, ps = 40 * I.settings.padSens * dt, inv = I.settings.invertY ? -1 : 1;
    G.aim.addScaledVector(r, I.st.mx * ms + I.st.lookX * ps).addScaledVector(f, -(I.st.my * ms + I.st.lookY * ps) * inv);
    const off = V(G.aim.x - G.c.x, 0, G.aim.z - G.c.z); if (off.length() > 75) { off.setLength(75); G.aim.set(G.c.x + off.x, G.aim.y, G.c.z + off.z); }
    G.aim.y = G.c.y;
    if ((I.down('fire') || I.st.triggerR > 0.4) && G.cd25 <= 0) { G.cd25 = 0.17; this.gsShoot(G, false); }
    const l2 = I.st.triggerL > 0.5; if ((I.pressed('aim') || (l2 && !G._l2)) && G.cd105 <= 0) { G.cd105 = 2.4; this.gsShoot(G, true); } G._l2 = l2;
    if (I.pressed('streak') && G.t > 0.6) G.t = G.life + 1;
    if (!I.st.locked && !I.st.usingPad && I.pressed('fire')) this.renderer.domElement.requestPointerLock?.();
    a.wish = V(); a.wantSprint = false; a.wantJump = 0; this.aiming = false; a.spawnProt = Math.max(0, (a.spawnProt || 0) - dt);
  };
  const updateCamera = P.updateCamera;
  P.updateCamera = function (dt) {
    const G = this.gs; if (!G) return updateCamera.call(this, dt);
    const C = this.cam, cam = this.camera, a = this.player; C.trauma = Math.max(0, C.trauma - dt * 2);
    const tr = C.trauma * C.trauma; cam.position.copy(G.m.position).add(V(rnd(-1, 1) * tr * 1.5, rnd(-1, 1) * tr * 1.5, rnd(-1, 1) * tr * 1.5)); cam.up.set(0, 1, 0); cam.lookAt(G.aim);
    const fov = G.cd105 <= 0 ? 34 : 40; C.fov = fov; if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (this.vgun) this.vgun.visible = false; if (this.varms) this.varms.grp.visible = false; a.ch.root.visible = true;
    const L = this.audio.listener; L.x = G.aim.x; L.y = G.aim.y + 20; L.z = G.aim.z; const d = V(); cam.getWorldDirection(d); L.yaw = -Math.atan2(d.x, d.z) + Math.PI;
    this.followShadow(G.aim); document.body.classList.remove('scoped');
    const vg = $('vignette'); if (vg) vg.style.opacity = 0;
  };

  // ================================================================ assaut final (25)
  P.ultimate = function (a, def) {
    const team = a.team, me = a === this.player, foe = foeOf(team), civ = team === 'civils';
    const big = `${svg('nuke')} ${def.nom.toUpperCase()} !!!`;
    if (me) this.bigText(big, 'toutes les zones adverses sous le feu', '#c27bff', 't6');
    else if (this.player.team === team) this.bigText(big, `${a.name} a tout déclenché`, '#c27bff', 't6');
    else this.bigText(big, `${a.name} lance l'assaut : planque-toi !`, '#ff4a4a', 't6');
    this.flash(`radial-gradient(ellipse at center, rgba(255,255,255,.4), ${me || this.player.team === team ? '#c27bffcc' : '#ff2a2acc'})`); this.cam.trauma = 1; this.input.rumble(1, 1, 900);
    $('hud')?.classList.remove('shake'); void $('hud')?.offsetWidth; $('hud')?.classList.add('shake'); this.audio.streakReady(6);
    // pluie de projectiles sur chaque zone qui n'est pas au camp (étalée dans le temps : jamais plus d'une dizaine en vol)
    const zones = this.zoneState.filter((z) => z.owner !== team); let k = 0;
    for (const z of zones) { const zc = V(z.center[0], 0, z.center[1]); zc.y = this.world.groundY(zc.x, zc.z, (z.y ?? 0.17) + 0.5); const from = V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(40);
      this.mark(zc, 12, civ ? '#ff4fa0' : '#ff3d3d', 6);
      for (let i = 0; i < 9; i++) { const tgt = zc.clone().add(V(rnd(-11, 11), 0, rnd(-11, 11))); tgt.y = this.world.groundY(tgt.x, tgt.z, zc.y + 3);
        const start = tgt.clone().add(from).add(V(rnd(-6, 6), rnd(70, 90), rnd(-6, 6))); (this.pendingRockets ||= []).push({ at: this.time + 1.5 + k * 0.22, kind: civ ? 'fw' : 'missile', start, tgt, owner: a }); k++; } }
    for (const t of this.actors) if (foe(t)) { t.spotMark = this.time + 30; if (t.ai) { t.stunT = Math.max(t.stunT || 0, 1.5); } }
    this.reinforce(a, 6, a.pos, true);
  };

  // ================================================================ boucle commune
  P.updateAir = function (dt) {
    const H = this.airHits; if (H) for (let i = H.length - 1; i >= 0; i--) { const h = H[i];
      if (h.drop && this.time >= h.drop) { h.drop = 0; this.audio.whistle(h.pos, 0.8); }
      if (this.time < h.at) continue; H.splice(i, 1); const p = h.pos.clone(); p.y = this.world.groundY(p.x, p.z, p.y + 0.5);
      if (h.kind === 'bomb') this.boom(p, 7.5, 150, h.owner, '#ffb347', { foesOnly: true });
      else if (h.kind === 'g105') { this.boom(p, 8, 170, h.owner, '#ffb347', { foesOnly: true }); this.audio.cannon(p, true); }
      else { // 25 mm : éclats sans lumière ni fumée (6 coups par seconde)
        this.fx.burst(p.clone().add(V(0, 0.3, 0)), 10, { color: '#ffd27a', speed: 7, size: 0.05, life: 0.3, emissive: true }); this.fx.burst(p.clone().add(V(0, 0.4, 0)), 4, { color: '#5a5550', speed: 2, size: 0.3, life: 0.9 });
        this.audio.cannon(p, false); this.world.cass?.blast(p, 1.5, 100, h.owner);
        for (const t of this.actors) { if (!t.alive || t.team === h.owner.team || (t.inCar && !t.inCar.kind)) continue; const d = t.pos.distanceTo(p); if (d < 3) this.damage(t, 70 * (1 - d / 5), credit(h.owner), { blast: true, ico: 'gunship' }); }
        for (const car of this.cars) if (!car.dead && car.pos.distanceTo(p) < 3) this.hitCar(car, 40, h.owner);
      } }
    const L = this.air; if (!L) return;
    for (let i = L.length - 1; i >= 0; i--) { const x = L[i]; x.t += dt;
      const keep = x.type === 'heli' ? this.heliTick(x, dt) : x.type === 'jet' ? this.jetTick(x, dt) : x.type === 'kami' ? this.kamiTick(x, dt) : this.gunshipTick(x, dt);
      if (!keep) { if (x.m.parent) this.root.remove(x.m); L.splice(i, 1); } }
  };
}
const $ = (id) => document.getElementById(id);
