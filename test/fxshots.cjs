// Captures de contrôle des effets et des voitures garées (même scène, même instant) : node test/fxshots.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir] = process.argv; const b = await chromium.launch({ args: ['--use-gl=angle'] }); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1000);
  await p.evaluate(() => { window.__game.paused = true; });
  const fs = require('fs'); const shot = async (name, fn, steps = 3) => { const d = await p.evaluate(({ fn, steps }) => { const g = window.__game; g.paused = false; Math.random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); new Function('g', fn)(g); for (let i = 0; i < steps; i++) g.update(1 / 30); g.paused = true; (window.__post || g.renderer).render(g.scene, g.camera); return g.renderer.domElement.toDataURL('image/png'); }, { fn, steps }); fs.writeFileSync(`${dir}/${name}.png`, Buffer.from(d.split(',')[1], 'base64')); };
  const place = `const c = g.cars.find((c) => !c.kind) ; const pl = g.player; pl.hp = pl.maxHp = 1e9; for (const a of g.actors) if (a !== pl) { a.alive = false; a.ch.root.visible = false; a.respawnT = 1e9; } pl.pos.set(c.pos.x + Math.sin(c.yaw + 1.2) * 7, c.pos.y, c.pos.z + Math.cos(c.yaw + 1.2) * 7); pl.vel.set(0,0,0); g.cam.yaw = Math.atan2(c.pos.x - pl.pos.x, c.pos.z - pl.pos.z) + Math.PI; g.cam.pitch = -0.1; window.__c = c;`;
  await shot('1-voiture', place, 20);
  const ahead = (d) => `const T = window.__THREE; const f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize(); const q = g.camera.position.clone().addScaledVector(f, ${d}); q.y = g.world.groundY(q.x, q.z, q.y);`;
  await shot('2-explosion', ahead(14) + ` g.boom(q, 4, 1, null, '#ffb347'); for (let i = 0; i < 6; i++) { g.fx.impact(q.clone().add(new T.Vector3(i * 0.3 - 1, 1, 0)), [0,1,0], i % 2 ? 'metal' : 'glass'); g.fx.tracer(g.camera.position.clone().add(new T.Vector3(0.5, -0.3, 0)), q.clone().add(new T.Vector3(i - 3, 1, 0))); }`, 4);
  await shot('3-fumee', ``, 40);
  await shot('4-lacrymo', ahead(12) + `g.fx.cloud(q, 'gas'); const q2 = q.clone().addScaledVector(f, 10); q2.x += 4; g.fx.cloud(q2, 'smoke'); g.fx.dust(q.clone().addScaledVector(f, -6), 10, 1.4);`, 90);
  await b.close(); })();
