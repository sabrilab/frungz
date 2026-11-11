// Passe photoréaliste : captures de jour depuis plusieurs points de vue (q=haut). node test/photoreal.cjs URL dossier prefixe [map]
// TWEAK=js (exécuté avant les captures), VIEWS=json ([x,y,z, cibleX,cibleY,cibleZ] ou null = caméra du joueur)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, url, dir, pre = 'shot', map = 'paris'] = process.argv; fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'q=haut&n=10&map=' + map + (process.env.QS || '')); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2500);
  if (process.env.TWEAK) await p.evaluate(process.env.TWEAK);
  const def = map === 'paris' ? [null, [-105, 1.7, -95, -105, 2, 20], [0, 18, -40, 0, 2, 0], [-60, 1.7, 30, 60, 2, 30], [35, 1.7, -5, 90, 2, -5], [12, 2.2, 8, -10, 1.5, 30]] : [null, [0, 25, -60, 0, 2, 0], [-30, 1.7, 0, 30, 3, 10]];
  const views = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : def; const times = [];
  for (let i = 0; i < views.length; i++) {
    const d = {}; await p.evaluate((v) => { const g = window.__game; if (!g.__w) { for (let k = 0; k < 40; k++) g.update(0.033); g.__w = 1; } g.paused = true;
      if (v) { g.camera.position.set(v[0], v[1], v[2]); g.camera.lookAt(v[3], v[4], v[5]); } else { g.paused = false; g.update(0.016); g.paused = true; }
      g.camera.updateMatrixWorld(); g.followShadow?.(v ? g.camera.position : g.player.pos);
      if (window.__cine) { window.__cine.enabled2 = false; window.__cine.k = 0; }
      const r = () => (window.__post ? window.__post.render() : g.renderer.render(g.scene, g.camera));
      r(); return 0; }, views[i]);
    await p.waitForTimeout(300);
    const d2 = await p.evaluate(() => { const g = window.__game, gl = g.renderer.getContext(); const t0 = performance.now(); (window.__post ? window.__post.render() : g.renderer.render(g.scene, g.camera)); gl.finish(); const ms = performance.now() - t0;
      return { ms, img: g.renderer.domElement.toDataURL('image/jpeg', 0.9) }; });
    d.ms = d2.ms; d.img = d2.img;
    times.push(+d.ms.toFixed(1)); fs.writeFileSync(`${dir}/${pre}-${i}.jpg`, Buffer.from(d.img.split(',')[1], 'base64'));
  }
  console.log(pre, 'ms/image', JSON.stringify(times));
  await b.close(); })();
