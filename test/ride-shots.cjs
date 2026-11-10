// Planche des deux-roues avec pilote : chaque modèle vu de côté et de 3/4, à l'arrêt et en virage
// node test/ride-shots.cjs http://localhost:8124/ sortie.png
const { chromium } = require('playwright');
(async () => { const [,, url = 'http://localhost:8124/', out = 'ride-shots.png'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url + '?n=1'); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.evaluate(() => { document.getElementById('hud').style.display = 'none'; const g = window.__game; for (const a of g.actors) if (a.bot) { a.alive = false; a.respawnT = 1e9; a.ch.root.visible = false; } });
const shots = [];
for (const [type, st, view, push] of [['sportive', 0, 'side'], ['sportive', 0.8, 'front'], ['roadster', 0, 'side'], ['scooter', 0, 'side'], ['police', 0.6, 'q'], ['police', 0, 'side'], ['skate', 0, 'side'], ['skate', 0, 'q', 1], ['skate', 0.8, 'front']]) {
  await p.evaluate(({ type, st, view, push }) => { const g = window.__game, pl = g.player; g.paused = false; pl.alive = true; pl.hp = 100; if (pl.inCar) { const o = pl.inCar; g.exitCar(pl); [o.pos.x, o.pos.z, o.yaw] = o.spawn; o.pos.y = g.world.groundY(o.pos.x, o.pos.z); o.vel = null; o.speed = 0; o.down = false; g.syncCar(o); }
    const X = -70, Z = -43;
    const c = g.cars.filter((c) => c.kind && c.def.type === type && !c.dead)[0]; c.pos.set(X, g.world.groundY(X, Z), Z); c.yaw = Math.PI / 2; c.vel = null; c.speed = 0; c.down = false; pl.pos.copy(c.pos); g.enterCar(pl, c);
    const I = g.input; I.move = () => ({ x: -st, y: -1 }); for (let i = 0; i < 25; i++) { g.update(1 / 30); }
    c.pos.set(X, g.world.groundY(X, Z), Z); c.yaw = Math.PI / 2; c.vel = null; c.speed = 6; if (push) { c.push = 0.62 * 0.55; c.pushW = 1; } else { c.push = 0; c.pushW = 0; } g.syncCar(c); g.update(1 / 60); g.paused = true;
    const cam = g.camera, k = type === 'skate' ? 0.75 : 1; const tgt = c.pos.clone(); tgt.y += 0.9 * k;
    if (view === 'side') cam.position.set(tgt.x, tgt.y + 0.1, tgt.z + 3.2 * k); else if (view === 'front') cam.position.set(tgt.x + 3.3 * k, tgt.y + 0.4, tgt.z + 1.2 * k); else cam.position.set(tgt.x - 2.3 * k, tgt.y + 0.8, tgt.z + 2.3 * k);
    cam.fov = 40; cam.updateProjectionMatrix(); cam.lookAt(tgt); }, { type, st, view, push });
  await p.waitForTimeout(250); shots.push(await p.screenshot());
}
// assemble en planche 3 × 3
const html = `<body style="margin:0;display:grid;grid-template-columns:repeat(3,640px);background:#000">${shots.map((s) => `<img src="data:image/png;base64,${s.toString('base64')}">`).join('')}</body>`;
const q = await b.newPage({ viewport: { width: 1920, height: 1200 } }); await q.setContent(html); await q.screenshot({ path: out }); await b.close(); })();
