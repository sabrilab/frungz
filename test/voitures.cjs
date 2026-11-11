// Voitures : captures en 3/4 de plusieurs modèles garés, dans la vraie map (q=haut). node test/voitures.cjs URL dossier prefixe [map]
// PICK=nombre de voitures, DIST=distance caméra, SIDE=angle (radians, autour de la voiture)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, url, dir, pre = 'car', map = 'paris'] = process.argv; fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('[' + m.type() + ']', m.text().slice(0, 300)); });
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'q=haut&n=4&map=' + map + (process.env.QS || '')); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  const n = +(process.env.PICK || 6), D = +(process.env.DIST || 6.5), SIDES = JSON.parse(process.env.SIDES || '[0.75, 2.6]');
  const list = await p.evaluate(() => { const g = window.__game; const seen = new Set(), out = []; g.cars.forEach((c, i) => { if (c.kind || c.flipped || seen.has(c.def.nom)) return; seen.add(c.def.nom); out.push(i); }); return out; });
  console.log('modèles', list.length);
  for (let k = 0; k < Math.min(n, list.length); k++) for (let s = 0; s < SIDES.length; s++) {
    const img = await p.evaluate(([i, D, a]) => { const g = window.__game; const c = g.cars[i]; for (const o of g.actors) o.ch.root.visible = false;
      if (!g.__w) { for (let k = 0; k < 20; k++) g.update(0.033); g.__w = 1; } g.paused = true;
      // angle dégagé : caméra et ligne de vue hors des murs (grille de navigation), en partant de l'angle demandé
      const W = g.world, okAt = (x, z) => { try { return W.free(...W.cell(x, z)); } catch { return true; } };
      let ya = c.yaw + a; for (let k = 0; k < 16; k++) { const y2 = c.yaw + a + k * 0.39 * (k % 2 ? 1 : -1) * Math.ceil(k / 2) / Math.max(1, k); let ok = true; for (let f = 0.45; f <= 1.0001; f += 0.11) if (!okAt(c.pos.x + Math.sin(y2) * D * f, c.pos.z + Math.cos(y2) * D * f)) ok = false; if (ok) { ya = y2; break; } }
      g.camera.position.set(c.pos.x + Math.sin(ya) * D, c.pos.y + 1.55, c.pos.z + Math.cos(ya) * D); g.camera.lookAt(c.pos.x, c.pos.y + 0.6, c.pos.z);
      for (const o of g.cars) { const d2 = o.obj.position.distanceToSquared(g.camera.position); o.obj.visible = !o.dead && !o.kind && d2 < 130 * 130; if (o.stat && !o.mv) { const far = !!o.statFar && d2 > 38 * 38; o.far = far; o.stat.visible = !far; if (o.statFar) o.statFar.visible = far; } }
      g.camera.updateMatrixWorld(); g.followShadow?.(c.pos); if (window.__cine) { window.__cine.enabled2 = false; window.__cine.k = 0; }
      (window.__post ? window.__post.render() : g.renderer.render(g.scene, g.camera)); (window.__post ? window.__post.render() : g.renderer.render(g.scene, g.camera));
      return g.renderer.domElement.toDataURL('image/jpeg', 0.9); }, [list[k], D, SIDES[s]]);
    fs.writeFileSync(`${dir}/${pre}-${k}-${s}.jpg`, Buffer.from(img.split(',')[1], 'base64'));
  }
  await b.close(); })();
