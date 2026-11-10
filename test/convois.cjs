// Convois de série : canon à eau, escouade militaire, camion-bélier, bande organisée. node test/convois.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
const wait = async (s) => { const t0 = await p.evaluate(() => window.__game.time); await p.waitForFunction((x) => window.__game.time >= x, t0 + s, { timeout: 400000, polling: 200 }); };
await p.evaluate(() => { const g = window.__game; g.player.hp = 1e9; g.player.armor = 1e9; });
for (const kind of (process.env.KINDS || 'eau,armee,belier,bande').split(',')) {
  const info = await p.evaluate((kind) => { const g = window.__game, a = g.player; const v = new a.pos.constructor(); g.camera.getWorldDirection(v); v.y = 0; v.normalize(); const t = a.pos.clone().addScaledVector(v, 16); t.y = g.world.groundY(t.x, t.z, a.pos.y + 2);
    // une cible ennemie sur place pour voir l'effet
    const foe = g.actors.find((x) => x.alive && x.team !== a.team && x.bot); if (foe) { foe.pos.copy(t).add(new a.pos.constructor(1, 0, 1)); foe.ai.think = 5; }
    g.landSpell(kind, t, a); return { n: (g.convoys || []).length, path: JSON.stringify(g.convoyPath(t)) }; }, kind);
  console.log(kind, JSON.stringify(info)); await wait(kind === 'belier' ? 2.6 : 4.5); await p.screenshot({ path: `${dir}/convoi-${kind}.png` });
  await wait(6); console.log(kind, JSON.stringify(await p.evaluate(() => { const g = window.__game; return { convoys: (g.convoys || []).map((c) => c.kind + ':' + c.state).join(','), squad: g.actors.filter((x) => x.temp && !x.gone && x.alive).map((x) => x.name).slice(0, 8).join(', '), k: g.player.stats.k }; })));
}
console.log('erreurs', errs); await b.close(); })();
