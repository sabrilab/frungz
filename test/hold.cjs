// Tenue des armes : node hold.cjs prefixe skin camp ids  → 4 vues autour du joueur (épaule) + vue subjective, par arme
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, out, skin, team, ids = 'rifle,pistol', nohold = '0'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 720 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.addInitScript(([k, skin, team]) => { try { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.skin = skin; s.team = team; localStorage.setItem(k, JSON.stringify(s)); } catch {} }, ['frungz-save', skin, team]);
  await p.goto('http://localhost:8124/'); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.addStyleTag({ content: '#hud{display:none!important}' });
  const info = await p.evaluate(() => { window.__start(); const g = window.__game; return 'skin ' + g.player.skin + ' · objets vue subjective sur la caméra après 2 parties : ' + g.camera.children.filter((c) => c.userData.viewModel).length; }); console.log(info);
  for (const id of ids.split(',')) {
    const res = await p.evaluate(([id, nohold]) => { globalThis.__nohold = nohold === '1'; const g = window.__game, a = g.player; g.paused = false; a.slots[1] = { id, rarity: 'commun', mag: 30 }; g.equip(a, 1, true); g.cam.fps = false; g.viewGun(); g.cam.pitch = -0.03; a.hp = 100;
      for (let i = 0; i < 40; i++) { a.hp = 100; g.update(0.033); } g.paused = true; const out = [];
      const c2 = g.camera.clone(false); for (const c of [...c2.children]) c2.remove(c); c2.fov = 32; c2.near = 0.05; c2.updateProjectionMatrix(); g.scene.add(c2);
      const yaw = a.ch.root.rotation.y, f = [Math.sin(yaw), Math.cos(yaw)], tgt = a.pos.clone(); tgt.y += 1.3;
      for (const [df, ds] of [[2.2, 1.0], [0.3, 2.4], [0.3, -2.4], [-2.3, 0.6]]) { c2.position.set(tgt.x + f[0] * df + f[1] * ds, tgt.y + 0.15, tgt.z + f[1] * df - f[0] * ds); c2.up.set(0, 1, 0); c2.lookAt(tgt); c2.updateMatrixWorld(true); g.renderer.setRenderTarget(null); g.renderer.render(g.scene, c2); out.push(g.renderer.domElement.toDataURL('image/jpeg', 0.9)); }
      g.scene.remove(c2); g.paused = false; g.cam.fps = true; g.viewGun(); for (let i = 0; i < 25; i++) { a.hp = 100; g.update(0.033); } g.paused = true; g.renderer.setRenderTarget(null); g.renderer.render(g.scene, g.camera); out.push(g.renderer.domElement.toDataURL('image/jpeg', 0.9)); return out; }, [id, nohold]);
    res.forEach((u, i) => fs.writeFileSync(out + '-' + id + '-' + i + '.jpg', Buffer.from(u.split(',')[1], 'base64')));
  }
  await b.close(); })();
