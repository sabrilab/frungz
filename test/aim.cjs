// vérifie que le canon pointe vers le réticule sous plusieurs angles, debout / accroupi / en course / en saut
const { chromium } = require('playwright');
(async () => { const [,, url, outDir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,3).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
const cases = [['debout', 0, 0, {}], ['haut', 0.5, 0, {}], ['bas', -0.45, 0, {}], ['cote', 0.1, 1.2, {}], ['accroupi', 0, 0, { crouch: true }], ['accroupi_haut', 0.4, 0.6, { crouch: true }], ['course', 0.1, 0, { run: true }], ['lateral', 0.1, 0, { key: 'KeyA' }], ['recul', 0, 0, { key: 'KeyS' }], ['saut', 0.2, 0, { jump: true }]];
for (const [name, pitch, yawOff, o] of cases) {
  const r = await p.evaluate(([pitch, yawOff, o]) => {
    const THREE = window.__THREE; const g = window.__game, a = g.player, I = g.input; for (const x of g.actors) if (x.bot) { x.pos.set(9999, 0, 9999); x.alive = false; x.respawnT = 999; }
    g.cam.yaw = a.yaw + yawOff; g.cam.pitch = pitch; a.crouch = !!o.crouch; g.cam.fps = false;
    I.keys.add('Mouse2'); g.cam.yaw0 = g.cam.yaw; g.cam.pitch0 = pitch; if (o.run) I.keys.add('KeyW'); if (o.key) I.keys.add(o.key);
    let maxA = 0, stepA = 0; const errs = [];
    for (let i = 0; i < 36; i++) {
      if (o.jump && i % 18 === 3) a.wantJump = 0.15; g.cam.yaw = g.cam.yaw0; g.cam.pitch = g.cam.pitch0;
      g.update(1 / 60);
      const gun = a.ch.gun, gp = new THREE.Vector3(), q = new THREE.Quaternion(); gun.getWorldPosition(gp); gun.getWorldQuaternion(q);
      const fw = new THREE.Vector3(1, 0, 0).applyQuaternion(q); const want = g.aimPt.clone().sub(gp).normalize();
      const ang = fw.angleTo(want) * 57.3; if (i > 14) { errs.push(ang); maxA = Math.max(maxA, ang); }
      const sp = a.ch.bones.Chest; const e = new THREE.Euler().setFromQuaternion(sp.quaternion); stepA = Math.max(stepA, Math.abs(e.y));
    }
    
    return { moy: (errs.reduce((s, x) => s + x, 0) / errs.length).toFixed(1), max: maxA.toFixed(1), chestYaw: stepA.toFixed(2) };
  }, [pitch, yawOff, o]);
  await p.evaluate(() => { const I = window.__game.input; I.keys.delete('Mouse2'); I.keys.delete('KeyW'); I.keys.delete('KeyA'); I.keys.delete('KeyS'); });
  console.log(name, JSON.stringify(r)); if (process.env.SHOTS) await p.screenshot({ path: `${outDir}/aim_${name}.png`, timeout: 120000 });
}
await b.close(); })();
