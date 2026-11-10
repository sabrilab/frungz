// Retours de combat : ce que le joueur ressent quand il touche quelqu'un et quand il se fait toucher.
// Tout est léger : quelques éléments du HUD réutilisés (aucun créé pendant le combat), des animations CSS d'opacité
// et de transformation (composées par le navigateur, sans recalcul de mise en page), et une poignée de nœuds audio.
// Aucun post-traitement plein écran ni filtre CSS sur le canevas (cause connue des rectangles noirs quand ça sature).
import * as THREE from 'three';

const ARCS = 6; // indicateurs de direction des dégâts affichés en même temps
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createFeedback(g) {
  const $ = (id) => document.getElementById(id);
  const st = { agg: null, crossT: 0, hurtK: 0, critHb: 0, muffT: 0, muffK: 0, muf: -1, lastWhiz: -9, lastGrunt: -9, lastHit: -9, prevHp: 100 };

  // --- éléments du HUD (créés une fois)
  const dd = $('dmgdir'); dd.textContent = '';
  const arcs = []; for (let i = 0; i < ARCS; i++) { const el = document.createElement('i'); el.style.opacity = 0; dd.appendChild(el); arcs.push({ el, by: null, p: new THREE.Vector3(), t: 9, life: 0, k: 0 }); }
  let hurt = $('hurt'); if (!hurt) { hurt = document.createElement('div'); hurt.id = 'hurt'; $('vignette').after(hurt); }
  const hm = $('hitmark'); hm.textContent = ''; for (let i = 0; i < 4; i++) hm.appendChild(document.createElement('i'));
  const cross = $('cross');
  const restart = (el, cls) => { el.classList.remove(...cls); void el.offsetWidth; el.classList.add(...cls); };

  // ---------------------------------------------------------------- quand on touche
  // marqueur de touche : 4 traits en X autour du réticule, taille selon les dégâts ; or à la tête, bleu sur un gilet,
  // éclats bleus quand le gilet cède, rouge et plus gros pour une élimination
  function marker(kill, head, armor, brk, dmg) {
    hm.style.setProperty('--s', (0.85 + Math.min(0.55, dmg / 90)).toFixed(2));
    hm.className = ''; void hm.offsetWidth;
    if (brk) st.brkT = g.time + 0.35; // le gilet qui cède reste signalé même si d'autres plombs suivent
    hm.className = 'on' + (kill ? ' kill' : '') + (head ? ' head' : '') + (armor && !kill && !head ? ' armor' : '') + (brk || g.time < (st.brkT || 0) ? ' brk' : '');
    st.crossT = kill ? 0.22 : 0.1;
  }
  // appelé par game.damage quand le joueur touche une cible
  function dealt(t, amount, opts, absorbed, brk, killed) {
    const now = g.time; const A = st.agg;
    // plombs du fusil à pompe, rafale : un seul nombre qui monte au lieu d'une pluie de chiffres
    if (A && A.t === t && now - A.at < 0.12 && A.it && !A.it.done) { A.sum += amount; A.head ||= !!opts.head; A.at = now; A.it.el.textContent = Math.round(A.sum); A.it.el.style.color = A.head ? '#ffcf3d' : '#fff'; A.it.t = Math.min(A.it.t, 0.05); }
    else { const it = g.fx.number(new THREE.Vector3(t.pos.x, t.pos.y + 2 + Math.random() * 0.3, t.pos.z), Math.round(amount), opts.head ? '#ffcf3d' : '#fff', opts.head); st.agg = { t, at: now, sum: amount, head: !!opts.head, it }; }
    marker(killed, opts.head, absorbed > amount * 0.3, brk, amount);
    // son : regroupé par image (les plombs d'une même cartouche ne font qu'un seul impact)
    if (now - st.lastHit > 0.03) { st.lastHit = now; g.audio.hitmark(opts.head, absorbed > amount * 0.3 && !opts.head); }
    if (brk) g.audio.armorBreak(false);
    // réaction visible de la cible : brume de sang à la tête ou sur un gros coup, nuage sec du gilet qui encaisse
    const p = new THREE.Vector3(t.pos.x, t.pos.y + (opts.head ? 1.68 : 1.15), t.pos.z);
    // à distance, l'impact grossit avec l'éloignement pour rester lisible (sinon invisible au-delà de 20 m)
    const far = g.camera.position.distanceTo(p);
    g.fx.burst(p, opts.head || killed ? 3 : 2, { color: '#7a0e18', opacity: 0.45, size: (opts.head ? 0.14 : 0.1) + Math.min(0.35, far * 0.006), life: 0.55, speed: 0.9 + Math.min(1.5, far * 0.02) });
    if (absorbed > 4 && !opts.head) g.fx.burst(p, 1, { color: '#9aa3ad', opacity: 0.3, size: 0.08, life: 0.35, speed: 0.6 });
    g.input.rumble(killed ? 0.5 : 0.15, killed ? 0.3 : 0.1, killed ? 90 : 35);
    // la vue se resserre un instant sur l'action (plus franchement sur une élimination) ; la cible reste illuminée un peu plus longtemps
    const z = killed ? 6 : opts.head ? 3 : 1.6; if (z >= (g.cam.zoomP || 0)) { g.cam.zoomP = z; st.zoomHold = killed ? 0.28 : 0.08; }
    if (t.flashT > 0) t.flashT = killed ? 0.16 : 0.1;
  }

  // ---------------------------------------------------------------- quand on se fait toucher
  function taken(by, amount, opts, absorbed, brk) {
    const a = g.player, C = g.cam, k = clamp(amount / 40, 0.15, 1);
    // flash rouge sur les bords, proportionnel au coup
    st.hurtK = Math.min(1, st.hurtK + 0.35 + k * 0.5);
    // indicateur de direction : un arc par tireur, qui suit sa position tant qu'il est affiché
    if (by && by !== a) {
      let s = arcs.find((x) => x.by === by && x.t < x.life) || arcs.reduce((m, x) => (x.life - x.t < m.life - m.t ? x : m));
      const prev = s.by === by && s.t < s.life ? s.k : 0;
      s.by = by; s.p.copy(by.pos); s.t = 0; s.life = 1.6 + k * 1.2; s.k = Math.min(1, prev * 0.5 + 0.55 + k * 0.45);
      // à-coup de caméra : la visée est bousculée à l'opposé du tir (plus fort en visée, comme un vrai recul d'impact)
      const ang = Math.atan2(by.pos.x - a.pos.x, by.pos.z - a.pos.z) - C.yaw; const fps = C.fps || g.aiming ? 1 : 0.55;
      C.kickY += -Math.sin(ang) * 0.05 * k * fps; C.kickP += (0.028 + Math.random() * 0.02) * k * fps * (g.aiming ? 1.4 : 1); C.roll += -Math.sin(ang) * 0.05 * k * fps;
    }
    C.trauma = Math.min(1, C.trauma + 0.12 + k * 0.3);
    // son : impact sourd dans le corps (ou choc sur la plaque du gilet), souffle coupé, de temps en temps un râle
    g.audio.hurt(k, absorbed > amount * 0.3);
    if (brk) { g.audio.armorBreak(true); restart($('armorbar').parentElement, ['brk']); }
    if (g.time - st.lastGrunt > 0.9 && (amount > 18 || Math.random() < 0.35)) { st.lastGrunt = g.time; g.audio.play('voxPain', null, 0.45, [0.95, 1.05], 0.2); }
    // explosion proche : sifflement d'oreilles et sons étouffés une seconde ou deux
    if (opts.blast && amount > 20) { const r = clamp(amount / 70, 0.3, 1); g.audio.ring(r); st.muffT = Math.max(st.muffT, 1 + r * 1.6); st.muffK = Math.max(st.muffK, 0.55 + r * 0.35); }
    g.input.rumble(0.4 + k * 0.6, 0.3 + k * 0.5, 90 + k * 120);
  }
  // balle qui passe tout près de la tête sans toucher : sifflement placé et léger tremblement
  const _c = new THREE.Vector3(), _h = new THREE.Vector3();
  function bullet(o, d, len, shooter) {
    const a = g.player; if (!a.alive || shooter === a || shooter.team === a.team) return;
    _h.set(a.pos.x, a.pos.y + 1.55, a.pos.z); const t = _c.copy(_h).sub(o).dot(d); if (t < 3 || t > len + 1.5) return;
    _c.copy(o).addScaledVector(d, t); const r = _c.distanceTo(_h); if (r > 1.8 || r < 0.3) return;
    if (g.time - st.lastWhiz < 0.07) return; st.lastWhiz = g.time;
    g.audio.whiz(_c); g.cam.trauma = Math.min(1, g.cam.trauma + 0.06 * (1.8 - r)); g.input.rumble(0.08, 0.05, 30);
  }

  // ---------------------------------------------------------------- chaque image
  function update(dt) {
    const a = g.player, C = g.cam;
    // arcs de direction
    for (const s of arcs) {
      if (s.t >= s.life) { if (s.by) { s.by = null; s.el.style.opacity = 0; } continue; }
      s.t += dt; if (s.by?.alive) s.p.copy(s.by.pos);
      const ang = Math.atan2(s.p.x - a.pos.x, s.p.z - a.pos.z) - C.yaw; const f = s.t < 0.08 ? 1 + (0.08 - s.t) * 4 : 1;
      const op = s.k * Math.min(1, (s.life - s.t) / 0.6);
      s.el.style.opacity = op.toFixed(2); s.el.style.transform = `rotate(${(-ang).toFixed(3)}rad) scale(${f.toFixed(2)})`;
    }
    // flash rouge des coups reçus
    st.hurtK = Math.max(0, st.hurtK - dt * 2.4); hurt.style.opacity = (st.hurtK * 0.85).toFixed(2);
    // état critique : bords qui battent, cœur qui cogne, sons un peu étouffés
    const crit = a.alive && a.hp < 35 ? 1 - a.hp / 35 : 0;
    hurt.classList.toggle('crit', crit > 0);
    if (crit > 0) { st.critHb -= dt; if (st.critHb <= 0) { st.critHb = 0.95 - crit * 0.4; g.audio.heart(0.5 + crit * 0.7); } }
    // resserrement de la vue après une touche : tenu un instant puis relâché en douceur
    if (C.zoomP) { if (st.zoomHold > 0) st.zoomHold -= dt; else { C.zoomP *= Math.exp(-dt * 4.5); if (C.zoomP < 0.05) C.zoomP = 0; } }
    // réticule rouge un instant après une touche
    if (st.crossT > 0) { st.crossT -= dt; cross.classList.toggle('hit', st.crossT > 0); }
    // sons étouffés (explosion proche, puis santé critique)
    st.muffT = Math.max(0, st.muffT - dt); if (st.muffT <= 0) st.muffK = Math.max(0, st.muffK - dt * 0.8);
    const m = a.alive ? Math.max(st.muffK * Math.min(1, st.muffT + 0.3), crit * 0.35) : 0.25;
    if (Math.abs(m - st.muf) > 0.02) { st.muf = m; g.audio.muffle(m); }
  }
  // remise à zéro (mort, réapparition)
  function reset() { for (const s of arcs) { s.t = 9; s.by = null; s.el.style.opacity = 0; } st.hurtK = 0; st.muffT = 0; st.muffK = 0; }
  return { dealt, taken, bullet, marker, update, reset };
}
