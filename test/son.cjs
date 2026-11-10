// son : partie simulée avec écoute de la sortie audio (silence, NaN, état du contexte)
// usage : node test/son.cjs URL [secondes]
const { chromium } = require('playwright');
(async () => { const [,, url, secs = 60] = process.argv;
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.addInitScript(() => {
  const taps = window.__taps = {}; const C = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (t, ...r) {
    const ctx = this.context;
    if (t instanceof DynamicsCompressorNode && !taps.pre) { taps.pre = ctx.createAnalyser(); taps.pre.fftSize = 2048; C.call(this, taps.pre); }
    if (t instanceof AudioDestinationNode && !taps.post) { taps.post = ctx.createAnalyser(); taps.post.fftSize = 2048; C.call(this, taps.post); window.__ctx = ctx; }
    return C.call(this, t, ...r);
  };
  window.__probe = () => { const o = { state: window.__ctx?.state, t: window.__ctx?.currentTime?.toFixed(1) }; for (const k of ['pre', 'post']) { const a = taps[k]; if (!a) continue; const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s = 0, nan = 0; for (const v of d) { if (!isFinite(v)) nan++; else s += v * v; } o[k] = nan ? 'NaN×' + nan : Math.sqrt(s / d.length).toFixed(4); } return o; };
});
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const t0 = Date.now(); const log = []; let i = 0;
while (Date.now() - t0 < secs * 1000) {
  await p.evaluate((i) => { const g = window.__game, I = g.input; for (let k = 0; k < 4; k++, i++) { if (Math.sin(i * 0.01) > -0.3) I.keys.add('KeyW'); else I.keys.delete('KeyW'); if (i % 60 < 25) I.keys.add('Mouse0'); else I.keys.delete('Mouse0'); I.st.locked = true; g.cam.yaw += 0.02 * Math.sin(i * 0.005); if (!g.player.alive && g.respawn) {} g.update(0.05); } }, i); i += 4;
  if (i % 40 === 0) { const r = await p.evaluate(() => Object.assign(window.__probe(), { voices: window.__game.audio.debug?.() })); log.push(((Date.now() - t0) / 1000).toFixed(0) + 's ' + JSON.stringify(r)); console.log(log.at(-1)); }
}
if (process.env.CLOSE) { await p.evaluate(() => window.__ctx.close()); await new Promise((r) => setTimeout(r, 4000)); console.log("après fermeture", JSON.stringify(await p.evaluate(() => window.__game.audio.debug()))); }
console.log('ERREURS', errs.length, [...new Set(errs)].slice(0, 10).join('\n')); await b.close(); })();
