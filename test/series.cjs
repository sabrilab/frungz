// Gros paliers de série : hélico, frappe aérienne, essaim, canonnière, assaut final + annonces multi-éliminations.
// node test/series.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForTimeout(1500);
const wait = async (s) => { const t0 = await p.evaluate(() => window.__game.time); await p.waitForFunction((x) => window.__game.time >= x, t0 + s, { timeout: 400000, polling: 200 }); };
const shot = async (name) => { await p.evaluate(() => document.querySelectorAll('#multik, #multik *').forEach((e) => e.getAnimations().forEach((a) => { a.pause(); a.currentTime = 500; }))); await p.screenshot({ path: `${dir}/${name}.png` }); };
const kills = () => p.evaluate(() => window.__game.player.stats.k);
await p.evaluate(() => { const g = window.__game; g.player.hp = 1e9; g.player.armor = 1e9; g.damage = ((d) => function (t, ...r) { if (t === g.player) return; return d.call(this, t, ...r); })(g.damage); });
// annonces : 5 éliminations d'affilée
await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 6; i++) g.multiKill({}); }); await shot('multi-frungztastique');
await p.evaluate(() => { const g = window.__game; g.player.streak = 9; g.addStreak(g.player); }); await shot('palier-10');
// cible devant le joueur
const at = (d) => p.evaluate((d) => { const g = window.__game, a = g.player; const v = new a.pos.constructor(); g.camera.getWorldDirection(v); v.y = 0; v.normalize(); const t = a.pos.clone().addScaledVector(v, d); t.y = g.world.groundY(t.x, t.z, a.pos.y + 2); window.__tgt = t; return [t.x, t.y, t.z].map((x) => x.toFixed(1)).join(' '); }, d);
for (const kind of (process.env.KINDS || 'heli,essaim,frappe').split(',')) {
  console.log(kind, 'à', await at(kind === 'frappe' ? 30 : 20)); const k0 = await kills();
  await p.evaluate((kind) => { const g = window.__game; const k = kind === 'heli' && g.player.team === 'civils' ? 'hdetourne' : kind; g.landSpell(k, window.__tgt.clone(), g.player); }, kind);
  await wait(kind === 'heli' ? 6 : 3.2); await shot(kind);
  await wait(kind === 'heli' ? 10 : 4); console.log(kind, JSON.stringify(await p.evaluate(() => ({ air: (window.__game.air || []).map((x) => x.type).join(','), hits: (window.__game.airHits || []).length }))), 'éliminations +', (await kills()) - k0);
}
// canonnière pilotée
let k0 = await kills(); await p.evaluate(() => { const g = window.__game; g.player.rewards.push('canon'); g.useStreak(g.player); });
console.log('canonnière', JSON.stringify(await p.evaluate(() => ({ gs: !!window.__game.gs, hud: document.getElementById('hud').className }))));
await wait(1.5); await p.evaluate(() => { const g = window.__game; g.gs.life = 6; g.gsShoot(g.gs, true); for (let i = 0; i < 6; i++) g.gsShoot(g.gs, false); }); await wait(1); await shot('canonniere');
await wait(6); console.log('canonnière finie', JSON.stringify(await p.evaluate(() => ({ gs: !!window.__game.gs, fov: window.__game.camera.fov.toFixed(0), hud: document.getElementById('hud').className }))), 'éliminations +', (await kills()) - k0);
// assaut final
k0 = await kills(); await p.evaluate(() => { const g = window.__game; g.player.rewards.push('ultime'); g.useStreak(g.player); }); await wait(0.3); await shot('ultime-annonce');
console.log('ultime', JSON.stringify(await p.evaluate(() => ({ pend: (window.__game.pendingRockets || []).length }))));
await wait(8); await shot('ultime'); console.log('ultime : éliminations +', (await kills()) - k0, '· erreurs', errs.length);
await b.close(); })();
