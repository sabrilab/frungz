// Rendu cinéma (src/cine.js) : captures avant/après et coût du passage. node test/cine.cjs URL [dossier]
// Scènes : immobile, rotation rapide de la caméra, sprint, visée (mise au point), vue subjective qui tourne.
// Une image par appel (rendre des dizaines d'images d'affilée sans rendre la main au navigateur fait exploser la mémoire en headless).
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, url, out = 'captures-cine', only] = process.argv; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle'] }); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'q=haut&n=10&forcephoto'); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForFunction('window.__cine', null, { timeout: 60000 }); await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; g.save.settings.dynres = false; g.player.hp = g.player.maxHp = 1e9; window.requestAnimationFrame = () => 0; // boucle du jeu arrêtée
    // la boucle du jeu ne fait plus rien : c'est le test qui avance et rend chaque image
    g.paused = true; window.__tst = { y0: g.cam.yaw, p0: g.player.pos.clone() }; });
  const step = (setup, on, last) => p.evaluate(([setup, on, last]) => {
    const g = window.__game, c = window.__cine, r = g.renderer, I = g.input, pl = g.player;
    const S = { still: () => {}, turn: () => { g.cam.yaw += 0.05; }, sprint: () => { pl.momentum = 1; pl.wantSprint = true; const s = 9; pl.vel.x = Math.sin(g.cam.yaw) * s; pl.vel.z = Math.cos(g.cam.yaw) * s; g.cam.yaw += 0.01; },
      aim: () => { g.aiming = true; }, fpsturn: () => { g.cam.yaw += 0.04; } };
    S[setup](); g.paused = false; g.update(1 / 60); if (setup === 'aim') g.aiming = true; g.paused = true;
    c.enabled2 = on; c.auto = 1; window.__cineState(1 / 60); c.k = on ? 1 : 0;
    // en test, la visée n'est pas tenue par une touche : on force la mise au point sur la cible du réticule
    if (setup === 'aim') { c.dof = 1; c.focus = c.focusT = g.aimPt ? g.aimPt.distanceTo(g.camera.position) : 12; }
    const t0 = performance.now(); window.__post.render(); r.getContext().finish(); const ms = performance.now() - t0;
    return last ? { ms, img: r.domElement.toDataURL('image/png') } : { ms };
  }, [setup, on, last]);
  const reset = (fps) => p.evaluate((fps) => { const g = window.__game, T = window.__tst; g.cam.yaw = T.y0; g.player.pos.copy(T.p0); g.player.vel.set(0, 0, 0); g.cam.snap = true; g.aiming = false; if (!!g.cam.fps !== fps) { g.cam.fps = fps; g.viewGun(); } }, fps);
  const report = {};
  for (const [name, setup] of [['immobile', 'still'], ['rotation', 'turn'], ['sprint', 'sprint'], ['visee', 'aim'], ['subjective-rotation', 'fpsturn']]) {
    if (only && !only.split(',').includes(name)) continue; console.log('scène', name); report[name] = {};
    for (const on of [false, true]) {
      await reset(setup === 'fpsturn'); let r, t = 0; for (let i = 0; i < 14; i++) { r = await step(setup, on, i === 13); if (i >= 8) t += r.ms; }
      report[name][on ? 'avecMs' : 'sansMs'] = +(t / 6).toFixed(1);
      fs.writeFileSync(`${out}/${name}-${on ? 'apres' : 'avant'}.png`, Buffer.from(r.img.split(',')[1], 'base64'));
    }
  }
  await reset(false);
  console.log(JSON.stringify(report, null, 1)); await b.close(); })();
