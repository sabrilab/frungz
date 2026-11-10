// node test/studio.cjs [ids séparés par des virgules] [dossier] : planche de chaque skin du studio (face, dos, tête), serveur sur 8124 (npx http-server dist -p 8124)
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => (m.type() === 'error') && console.log('[c]', m.text().slice(0, 200)));
  await p.goto('http://localhost:8124/studio'); await p.waitForFunction('window.__ready', null, { timeout: 120000 }); await p.waitForTimeout(1500);
  const out = process.argv[3] || '/tmp/claude-0/shots';
  const ids = process.argv[2] ? process.argv[2].split(',') : await p.evaluate(() => [...document.querySelectorAll('#builtin button')].map((b) => b.dataset.id));
  for (const id of ids) { await p.evaluate((id) => { window.__studio.select(id); window.__studio.setWeapon(''); window.__studio.play('MX_Idle'); }, id); await p.waitForTimeout(600);
    const shots = [];
    for (const [pos, tgt, nm] of [[[0, 1.0, 4.6], [0, 0.92, 0], 'face'], [[0, 1.0, -4.6], [0, 0.92, 0], 'dos'], [[0.45, 1.62, 1.0], [0, 1.6, 0], 'tete'], [[-0.7, 1.62, -0.9], [0, 1.58, 0], 'nuque']]) {
      await p.evaluate(([pos, tgt, nm]) => { const S = window.__studio; if (nm === 'tete' || nm === 'nuque') { const h = S.ch.bones.Head.getWorldPosition(S.camera.position.clone()); tgt = [h.x, h.y + 0.05, h.z]; pos = [h.x + pos[0], h.y + 0.08, h.z + pos[2]]; } S.controls.target.set(...tgt); S.camera.position.set(...pos); S.controls.update(); }, [pos, tgt, nm]); await p.waitForTimeout(250);
      shots.push(await p.locator('#view canvas').screenshot({ type: 'png' })); }
    require('fs').writeFileSync(`${out}/${id}.json`, JSON.stringify(shots.map((s) => s.toString('base64'))));
  }
  await b.close(); })();
