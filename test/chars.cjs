// Capture rapprochée des personnages (vérifier couleurs et squelette après fusion) : node test/chars.cjs URL out.png
const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  if (process.env.TEAM) await p.addInitScript((t) => { try { const s = JSON.parse(localStorage.getItem('frungz-save') || '{}'); s.team = t; s.skin = t === 'ordre' ? 'Swat' : 'Punk'; localStorage.setItem('frungz-save', JSON.stringify(s)); } catch {} }, process.env.TEAM);
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.evaluate((process_yaw) => { const g = window.__game, T = window.__THREE; for (let i = 0; i < 30; i++) g.update(0.033);
    const pl = g.player; const others = g.actors.filter((a) => a !== pl).slice(0, 12); const sk = new Set();
    let i = 0; for (const a of g.actors) { if (a === pl || sk.has(a.skin) || i > 9) continue; sk.add(a.skin); a.ai && (a.ai.think = 999); a.bot = false;
      a.pos.set(pl.pos.x - 6 + (i % 5) * 3, pl.pos.y, pl.pos.z + 6 + Math.floor(i / 5) * 3.5); a.vel.set(0, 0, 0); a.yaw = process_yaw; i++; }
    pl.yaw = process_yaw; g.cam.yaw = process_yaw; g.paused = false; for (let k = 0; k < 6; k++) g.update(0.016); g.paused = true; pl.ch.root.rotation.y = process_yaw; pl.ch.root.visible = true;
    g.camera.position.set(pl.pos.x, pl.pos.y + 1.6, pl.pos.z - 1.6); g.camera.lookAt(pl.pos.x, pl.pos.y + 1, pl.pos.z + 7); (window.__post || g.renderer).render(g.scene, g.camera); }, +(process.env.YAW || Math.PI));
  await p.screenshot({ path: out }); await b.close(); })();
