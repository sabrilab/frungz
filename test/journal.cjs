// FRUNGZ INFO : chaque montage (solo, duo, duplex, terrain, hélico d'abord), une capture au milieu de chaque plan
// node test/journal.cjs URL dossier [variantes]
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.', only] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForFunction('window.__game?.news?.pres?.ready', null, { timeout: 120000 });
for (const v of (only || 'solo,duo,duplex,terrain,helifirst').split(',')) {
  await p.evaluate((v) => { const g = window.__game; g.news.K = null; g.news.queue.length = 0; g.news.lastEnd = -999; for (let i = 0; i < 6; i++) g.update(0.033);
    g.newsPush({ pri: 3, variant: v, subject: g.player, head: 'Le Masqué : 4 policiers à terre', say: 'On nous signale une scène impressionnante près de la Fontaine : le Masqué a neutralisé quatre policiers coup sur coup.', gfx: { kind: 'multi', name: 'Le Masqué', n: 4 } }); }, v);
  const n = await p.evaluate(() => { const g = window.__game; g.update(0.033); return g.news.K.shots.length; });
  for (let s = 0; s < n; s++) {
    const info = await p.evaluate((s) => { const g = window.__game, K = g.news.K; while (K && (K.i < s || K.t - K.t0 < Math.min(1.2, K.shots[K.i].dur * 0.5))) { g.update(0.05); if (!g.news.K) break; } const sh = g.news.K?.shots[g.news.K.i]; return sh && { kind: sh.kind, who: sh.who }; }, s);
    await p.waitForTimeout(200); await p.screenshot({ path: `${out}/journal-${v}-${s}.png`, clip: { x: 0, y: 80, width: 380, height: 240 } }); console.log(v, s, JSON.stringify(info));
  }
}
await b.close(); })();
