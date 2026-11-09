// Sons : bruitages CC0 repris d'Aéria (assets/sfx) + synthèse Web Audio pour les armes, le verre, les moteurs.
const SAMPLES = { coins: 2, hitBody: 4, voxPain: 5, voxDie: 3, voxGrunt: 3, voxHey: 2, voxWar: 2, stepStone: 6, punch: 4, debris: 2, slam: 4, uiSelect: 2, uiTick: 1, crowdFar: 1, town: 1, thud: 3, land: 3, cloth: 6 };

export function createAudio() {
  let ctx = null, master, sfx, amb, comp, noiseBuf, verb;
  const bufs = {}; const last = {};
  const listener = { x: 0, y: 0, z: 0, yaw: 0 };
  function init() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // le navigateur suspend parfois le son (onglet caché, veille, casque débranché, Safari « interrupted ») : on le relance dès que possible
    const wake = () => { if (ctx.state !== 'running' && document.visibilityState === 'visible') ctx.resume().catch(() => {}); };
    ctx.onstatechange = () => setTimeout(wake, 300); document.addEventListener('visibilitychange', wake);
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, wake, true);
    setInterval(wake, 2000);
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(comp);
    sfx = ctx.createGain(); sfx.connect(master);
    // réverbération de rue (réponse impulsionnelle générée : réflexions des façades)
    const len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (t < 0.012 ? 0 : 1) * (1 + (Math.abs(Math.sin(t * 37)) > 0.985 ? 2.5 : 0)); } }
    verb = ctx.createConvolver(); verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.22; const vlp = ctx.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 4500;
    sfx.connect(vlp); vlp.connect(verb); verb.connect(vg); vg.connect(master); amb = ctx.createGain(); amb.gain.value = 0.35; amb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [n, k] of Object.entries(SAMPLES)) for (let i = 1; i <= k; i++) fetch(`assets/sfx/${n}-${i}.mp3`).then((r) => r.ok ? r.arrayBuffer() : null).then((a) => a && ctx.decodeAudioData(a)).then((b) => { if (b) (bufs[n] ||= []).push(b); }).catch(() => {});
    setTimeout(() => { loop('town', 0.5); loop('crowdFar', 0.35); }, 1500);
  }
  // panoramique + atténuation
  let voices = 0;
  function spatial(pos, vol = 1, ref = 6) {
    if (voices > 56 && pos) return null; voices++; setTimeout(() => voices--, 1500);
    const g = ctx.createGain(); let out = g;
    if (pos) {
      const dx = pos.x - listener.x, dz = pos.z - listener.z, d = Math.hypot(dx, dz, (pos.y || 0) - listener.y);
      const att = ref / (ref + Math.max(0, d - 1)); g.gain.value = vol * att;
      if (att < 0.02) return null;
      const p = ctx.createStereoPanner(); const ang = Math.atan2(dx, -dz) + listener.yaw; p.pan.value = Math.max(-1, Math.min(1, Math.sin(ang) * Math.min(1, d / 3)));
      g.connect(p); p.connect(sfx); out = g;
      if (d > 25) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 9000 - d * 90); lp.connect(g); return lp; }
    } else { g.gain.value = vol; g.connect(sfx); }
    return out;
  }
  function play(name, pos = null, vol = 1, rate = [0.94, 1.06], gap = 0.03) {
    if (!ctx) return; const list = bufs[name]; if (!list?.length) return;
    const now = ctx.currentTime; if (last[name] && now - last[name] < gap) return; last[name] = now;
    const out = spatial(pos, vol); if (!out) return;
    const s = ctx.createBufferSource(); s.buffer = list[(Math.random() * list.length) | 0]; s.playbackRate.value = rate[0] + Math.random() * (rate[1] - rate[0]);
    s.connect(out); s.start();
  }
  const loops = {};
  function loop(name, vol) { if (!ctx || loops[name] || !bufs[name]?.length) return; const s = ctx.createBufferSource(); s.buffer = bufs[name][0]; s.loop = true; const g = ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(amb); s.start(); loops[name] = { s, g }; }
  function noise(out, t0, dur, type, f0, f1, q, v0) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur); f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(v0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    n.connect(f); f.connect(g); g.connect(out); n.start(t0, Math.random()); n.stop(t0 + dur + 0.05);
  }
  function tone(out, t0, dur, f0, f1, v0, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(v0, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // détonation : claquement (bruit filtré) + coup de basse + queue réverbérée dans la rue
  function gun(kind, pos = null, vol = 1) {
    if (!ctx) return; const out = spatial(pos, vol, 14); if (!out) return; const t = ctx.currentTime;
    const P = { pistol: [2600, 0.12, 150, 0.9], smg: [3200, 0.09, 170, 0.7], rifle: [2200, 0.16, 120, 1.0], shotgun: [1500, 0.3, 80, 1.3], sniper: [1800, 0.45, 70, 1.4], revolver: [1900, 0.22, 100, 1.2] }[kind] || [2400, 0.14, 130, 1];
    noise(out, t, 0.035, 'highpass', 5000, 3000, 0.7, 0.9 * P[3]);
    noise(out, t, P[1], 'lowpass', P[0], 300, 0.8, 0.9 * P[3]);
    tone(out, t, P[1] * 0.9, P[2], 40, 0.9 * P[3]);
    noise(out, t + 0.03, P[1] * 3.5, 'bandpass', 900, 250, 0.6, 0.12 * P[3]);
    // tir lointain : écho grave qui revient des immeubles
    if (pos) { const d = Math.hypot(pos.x - listener.x, pos.z - listener.z); if (d > 35) { const e = spatial(pos, vol * 0.5, 30); if (e) { const dl = 0.18 + Math.min(0.5, d / 300); noise(e, t + dl, P[1] * 4, 'lowpass', 700, 200, 0.5, 0.5 * P[3]); noise(e, t + dl * 1.9, P[1] * 5, 'lowpass', 500, 150, 0.5, 0.25 * P[3]); } } }
  }
  function tink(pos, big) { if (!ctx) return; const out = spatial(pos, big ? 0.25 : 0.35, 4); if (!out) return; const t = ctx.currentTime, f = big ? 900 : 3800 + Math.random() * 1500; tone(out, t, 0.08, f, f * 0.97, 0.5, 'triangle'); tone(out, t + 0.07 + Math.random() * 0.04, 0.05, f * 1.1, f, 0.25, 'triangle'); }
  function click() { if (!ctx) return; const out = spatial(null, 0.4); tone(out, ctx.currentTime, 0.03, 2400, 1800, 0.4, 'square'); }
  function reload() { if (!ctx) return; const out = spatial(null, 0.5), t = ctx.currentTime; noise(out, t, 0.05, 'bandpass', 3000, 2500, 3, 0.6); noise(out, t + 0.35, 0.06, 'bandpass', 2200, 1800, 3, 0.7); tone(out, t + 0.36, 0.05, 900, 700, 0.3, 'square'); }
  function glass(pos) {
    if (!ctx) return; const out = spatial(pos, 1.2, 12); if (!out) return; const t = ctx.currentTime;
    noise(out, t, 0.25, 'highpass', 6000, 3000, 0.5, 0.9);
    for (let i = 0; i < 14; i++) tone(out, t + Math.random() * 0.6, 0.08 + Math.random() * 0.15, 2500 + Math.random() * 5000, 2000 + Math.random() * 3000, 0.08 + Math.random() * 0.1, 'triangle');
    play('debris', pos, 0.6);
  }
  function hitmark(head) { if (!ctx) return; const out = spatial(null, 0.35), t = ctx.currentTime; tone(out, t, 0.06, head ? 2600 : 1700, head ? 2400 : 1500, 0.5, 'triangle'); if (head) tone(out, t + 0.05, 0.12, 3400, 3200, 0.35, 'triangle'); }
  function kill() { if (!ctx) return; const out = spatial(null, 0.5), t = ctx.currentTime; tone(out, t, 0.08, 880, 880, 0.4, 'square'); tone(out, t + 0.08, 0.18, 1320, 1320, 0.35, 'square'); }
  function cash(big) { play('coins', null, big ? 1 : 0.6, [1, 1.1], 0.02); if (big && ctx) { const out = spatial(null, 0.4), t = ctx.currentTime; [0, 0.07, 0.14].forEach((d, i) => tone(out, t + d, 0.15, 1046 * [1, 1.26, 1.5][i], 1046 * [1, 1.26, 1.5][i], 0.3, 'triangle')); } }
  function rarity(r) { if (!ctx) return; const out = spatial(null, 0.5), t = ctx.currentTime; const n = { commun: 1, rare: 2, epique: 3, legendaire: 5 }[r] || 1; for (let i = 0; i < n; i++) tone(out, t + i * 0.07, 0.25, 660 * Math.pow(1.19, i), 660 * Math.pow(1.19, i), 0.25, 'triangle'); }
  function capture(good) { if (!ctx) return; const out = spatial(null, 0.6), t = ctx.currentTime; const s = good ? [523, 659, 784, 1046] : [392, 330, 262]; s.forEach((f, i) => tone(out, t + i * 0.11, 0.3, f, f, 0.3, 'sawtooth')); }
  function build(pos) { play('slam', pos, 0.8); play('thud', pos, 0.5); }
  function explode(pos) { if (!ctx) return; const out = spatial(pos, 2, 20); if (!out) return; const t = ctx.currentTime; noise(out, t, 1.4, 'lowpass', 1800, 60, 0.7, 1.2); tone(out, t, 0.8, 90, 25, 1.2); play('debris', pos, 1); }
  // moteur de voiture (une voix continue réglée chaque image)
  let eng = null;
  function engine(on, rpm = 0, pos = null) {
    if (!ctx) return;
    if (on && !eng) { const o = ctx.createOscillator(); o.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square'; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; const g = ctx.createGain(); g.gain.value = 0; o.connect(f); o2.connect(f); f.connect(g); g.connect(sfx); o.start(); o2.start(); eng = { o, o2, f, g }; }
    if (!eng) return;
    const t = ctx.currentTime;
    if (!on) { eng.g.gain.setTargetAtTime(0, t, 0.1); return; }
    eng.o.frequency.setTargetAtTime(38 + rpm * 120, t, 0.05); eng.o2.frequency.setTargetAtTime(19 + rpm * 60, t, 0.05); eng.f.frequency.setTargetAtTime(500 + rpm * 1600, t, 0.05); eng.g.gain.setTargetAtTime(0.09 + rpm * 0.08, t, 0.05);
  }
  function horn() { if (!ctx) return; const out = spatial(null, 0.5), t = ctx.currentTime; tone(out, t, 0.45, 392, 392, 0.3, 'square'); tone(out, t, 0.45, 494, 494, 0.25, 'square'); }
  function siren(pos) { if (!ctx) return; const out = spatial(pos, 0.5, 16); if (!out) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) { tone(out, t + i * 0.7, 0.35, 660, 660, 0.25, 'triangle'); tone(out, t + i * 0.7 + 0.35, 0.35, 880, 880, 0.25, 'triangle'); } }
  return { init, play, gun, tink, click, reload, glass, hitmark, kill, cash, rarity, capture, build, explode, engine, horn, siren, listener, get ready() { return !!ctx; } };
}
