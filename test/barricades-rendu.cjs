// Coût de rendu des barricades : 12 barricades (tous niveaux) en vue contre aucune. node test/barricades-rendu.cjs URL
const { chromium } = require('playwright');
(async () => { const [,, url] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
const frames = () => p.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 40) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res(t[20].toFixed(1)); } }; requestAnimationFrame(f); }));
await p.evaluate(() => { const g = window.__game; for (const o of g.actors) if (o !== g.player) { o.alive = false; o.respawnT = 1e9; o.ch.root.visible = false; } });
const before = await frames();
await p.evaluate(() => { const g = window.__game, a = g.player, T = window.__THREE; const f = new T.Vector3(Math.sin(g.cam.yaw), 0, Math.cos(g.cam.yaw)), s = new T.Vector3(-f.z, 0, f.x);
  for (let k = 0; k < 12; k++) { const pos = a.pos.clone().addScaledVector(f, 6 + (k >> 2) * 5).addScaledVector(s, ((k & 3) - 1.5) * 4.4); pos.y = g.world.groundY(pos.x, pos.z, a.pos.y + 1);
    const w = { team: k % 2 ? 'ordre' : 'civils', owner: null, tier: k % 3, hp: 1e9, t: 1, pos, yaw: g.cam.yaw + Math.PI, born: g.time, life: Infinity }; g.setWallMesh(w); g.world.dynamic.push(w.col); g.walls.push(w); } });
await p.waitForTimeout(1500);
const after = await frames();
console.log(JSON.stringify({ medianFrameMs_sans: before, medianFrameMs_12barricades: after, calls: await p.evaluate(() => window.__game.renderer.info.render.calls) }));
await b.close(); })();
