const { chromium } = require('playwright');
(async () => { const [,, url, dir] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 900000 }); await p.evaluate(() => window.__start());
await p.evaluate(() => { const g = window.__game; g.player.hp = 1e9; g.player.armor = 1e9; });
for (const kind of (process.env.KINDS || 'eau,armee,belier,bande,crs,emeute').split(',')) {
  const r = await p.evaluate((kind) => { const g = window.__game, a = g.player; const V = a.pos.constructor; const v = new V(); g.camera.getWorldDirection(v); v.y = 0; v.normalize(); const t = a.pos.clone().addScaledVector(v, 16); t.y = g.world.groundY(t.x, t.z, a.pos.y + 2);
    (g.convoys || []).forEach((c) => { c.m.visible = false; }); const n0 = (g.convoys || []).length;
    g.landSpell(kind, t, a); for (let i = 0; i < (kind === 'belier' ? 45 : 110); i++) { a.hp = 1e9; g.update(1 / 30); }
    const T = (g.convoys || []).slice(n0).find((c) => c.m.visible) || (g.convoys || []).slice(n0)[0]; if (!T) return 'aucun';
    const m = T.m; const c = m.position.clone(); const f = new V(0, 0, 1).applyQuaternion(m.quaternion); const s = new V(1, 0, 0).applyQuaternion(m.quaternion);
    g.camera.position.copy(c).addScaledVector(f, 7).addScaledVector(s, 6).add(new V(0, 2.6, 0)); g.camera.lookAt(c.x, c.y + 1.3, c.z); g.renderer.render(g.scene, g.camera);
    return T.kind + ' ' + T.state + ' ' + c.toArray().map((x) => x.toFixed(1)).join(','); }, kind);
  console.log(kind, r); await p.screenshot({ path: `${dir}/camion-${kind}.png` });
}
console.log('erreurs', errs); await b.close(); })();
