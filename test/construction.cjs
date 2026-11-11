// Construction : aperçu de pose (tenir Q / ↓ / Barricade), raccord bout à bout, refus motivés, pose au relâché.
// node test/construction.cjs URL dossier_captures
const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { if (m.text().startsWith('dbg')) console.log(m.text()); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
const step = (n = 3) => p.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) { g.update(1 / 30); g.input.endFrame?.(); } }, n);
// place le joueur face à l'espace le plus dégagé, ennemis loin
await p.evaluate(() => { const g = window.__game, a = g.player, T = window.__THREE; a.hp = 1e6; for (const x of g.walls.slice()) g.destroyWall(x);
  for (const o of g.actors) if (o !== a) { o.alive = false; o.respawnT = 1e9; o.ch.root.visible = false; }
  // cherche un endroit où trois barricades tiennent côte à côte (au centre, et raccordées de chaque côté)
  let ok = null; const V = (x, y, z) => new T.Vector3(x, y, z);
  for (const z of g.zoneState) { for (let k = 0; k < 16 && !ok; k++) { const y = k / 16 * Math.PI * 2; for (const r of [6, 9, 12]) {
    const pp = V(z.center[0] + Math.sin(y) * r, 0, z.center[1] + Math.cos(y) * r); pp.y = g.world.groundY(pp.x, pp.z, (z.y ?? 0.17) + 1); a.pos.copy(pp);
    const f = V(Math.sin(y), 0, Math.cos(y)), c = pp.clone().addScaledVector(f, 3), ax = V(Math.cos(y), 0, -Math.sin(y));
    if ([0, 1, -1].every((s) => !g.wallSpot(a, y, c.clone().addScaledVector(ax, s * 4)).why)) { ok = { y }; break; } } } if (ok) break; }
  g.cam.yaw = ok ? ok.y : 0; g.cam.pitch = -0.32; a.walls = 3; g.__p0 = a.pos.clone(); });
const state = () => p.evaluate(() => { const g = window.__game, gh = g.wallGhost; return JSON.stringify({ building: !!g.building, ghost: !!gh?.visible, col: gh?.userData.mat?.color.getHexString(), walls: g.walls.length, prompt: (g.ui.prompt || '').replace(/<[^>]+>/g, '') }); });
// 1) tenir : aperçu vert
await p.evaluate(() => window.__game.input.touchKey('build', true)); await step(4); console.log('tenir', await state());
await p.waitForTimeout(600); await p.screenshot({ path: `${out}/construction-apercu.png` });
// 2) relâcher : pose
await p.evaluate(() => window.__game.input.touchKey('build', false)); await step(2); console.log('relâché', await state());
const w0 = await p.evaluate(() => { const g = window.__game, w = g.walls[0]; return w ? [w.pos.distanceTo(g.player.pos).toFixed(2), w.yaw.toFixed(2)] : null; }); console.log('posée à', w0);
// 3) viser à côté de la première : raccord doré
const side = await p.evaluate(() => { const g = window.__game, a = g.player, w = g.walls[0], y0 = g.cam.yaw; g.__y0 = y0; for (const s of [1, -1]) { const ex = w.pos.x + Math.cos(w.yaw) * s * 4, ez = w.pos.z - Math.sin(w.yaw) * s * 4; g.cam.yaw = Math.atan2(ex - a.pos.x, ez - a.pos.z); g.cam.pitch = -0.2; g.update(1 / 30); const A = g.buildAim(a); if (A.snap && !g.wallSpot(a, A.yaw, A.at).why) return s; } g.cam.yaw = y0; return 0; }); console.log('côté', side); await step(30);
await p.evaluate(() => window.__game.input.touchKey('build', true)); await step(4); console.log('raccord', await state());
await p.waitForTimeout(600); await p.screenshot({ path: `${out}/construction-raccord.png` });
await p.evaluate(() => window.__game.input.touchKey('build', false)); await step(2);
console.log('après raccord', await p.evaluate(() => { const g = window.__game; return JSON.stringify(g.walls.map((w) => [w.pos.x.toFixed(2), w.pos.z.toFixed(2), w.yaw.toFixed(2)])); }));
// 4) viser droit dans la barricade existante : refus rouge
await p.evaluate(() => { const g = window.__game; g.cam.yaw = g.__y0; g.cam.pitch = -0.32; }); await step(30);
await p.evaluate(() => window.__game.input.touchKey('build', true)); await step(4); console.log('refus', await state());
await p.waitForTimeout(600); await p.screenshot({ path: `${out}/construction-refus.png` });
await p.evaluate(() => window.__game.input.touchKey('build', false)); await step(2); console.log('après refus', await state());
// 5) un appui bref pose aussi ; contre un mur : refus
await p.evaluate(() => { const g = window.__game; for (const x of g.walls.slice()) g.destroyWall(x); g.player.walls = 3; g.cam.yaw += Math.PI; });
await step(30); await p.evaluate(() => { const g = window.__game; g.input.touchKey('build', true); g.update(1 / 30); g.input.touchKey('build', false); g.update(1 / 30); }); console.log('appui bref', await state());
// 6) règles : bots inchangés (wallSpot sans point visé)
console.log('bot', await p.evaluate(() => { const g = window.__game, a = g.player; const r = []; for (let k = 0; k < 8; k++) r.push(g.wallSpot(a, k * 0.8).why || 'ok'); return r.join(','); }));
await b.close(); })();
