// Mieux voir la cible : resserrement de la vue à la touche et à l'élimination, bulle d'élimination rapprochée. Captures.
// node test/vuecible.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, pl = g.player, out = {};
  pl.alive = true; pl.hp = 1e6; pl.spawnProt = 0; g.input.st.locked = true;
  const foe = g.actors.find((x) => x.bot && x.team !== pl.team); foe.alive = true; foe.hp = 100; foe.armor = 0; foe.spawnProt = 0; foe.ai.think = 99;
  pl.pos.set(-30, g.world.groundY(-30, -5), -5); g.cam.yaw = Math.PI / 2; g.cam.pitch = -0.05; const fx = -12; foe.pos.set(fx, g.world.groundY(fx, -5), -5); foe.yaw = -Math.PI / 2;
  for (let i = 0; i < 10; i++) { foe.pos.set(fx, g.world.groundY(fx, -5), -5); g.update(1 / 30); }
  out.fov0 = g.camera.fov.toFixed(1);
  g.damage(foe, 30, pl, {}); for (let i = 0; i < 3; i++) g.update(1 / 30); out.fovHit = g.camera.fov.toFixed(1);
  for (let i = 0; i < 30; i++) g.update(1 / 30); out.fovBack = g.camera.fov.toFixed(1);
  g.damage(foe, 200, pl, { head: true }); for (let i = 0; i < 6; i++) g.update(1 / 30); out.fovKill = g.camera.fov.toFixed(1); out.pip = g.killcam?.mode;
  out.eyeDist = g.killcam ? g.killcam.eye.distanceTo(foe.pos).toFixed(1) : null;
  for (let i = 0; i < 20; i++) g.update(1 / 30);
  out.victim = { anim: foe.anim, alive: foe.alive, pos: foe.pos.toArray().map((v) => v.toFixed(1)).join(','), vis: foe.ch.model.visible, root: foe.ch.root.visible };
  return JSON.stringify(out); });
console.log(r);
await p.evaluate(() => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = 500; } });
await p.screenshot({ path: out + '/vue-elimination.png' });
console.log('erreurs :', errs.length); await b.close(); })();
