const { chromium } = require('playwright');
(async () => { const [,, url, out, steps = 600, extra = ''] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 400)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,4).join(' | ')));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 });
await p.evaluate(() => window.__start());
const r = await p.evaluate(async ([steps, extra]) => { const g = window.__game; const t0 = performance.now(); let maxMs = 0;
  for (let i = 0; i < steps; i++) { const s = performance.now(); g.update(0.05); maxMs = Math.max(maxMs, performance.now() - s); if (extra && i === 5) eval(extra); }
  const ms = (performance.now() - t0) / steps;
  return JSON.stringify({ msPerUpdate: ms.toFixed(2), maxMs: maxMs.toFixed(1), t: g.time.toFixed(1), score: g.score, zones: g.zoneState.map(z => z.id + ':' + z.owner + ':' + z.p.toFixed(2)), kills: g.actors.map(a => a.stats.k).reduce((x, y) => x + y), deaths: g.actors.map(a => a.stats.d).reduce((x, y) => x + y), broken: g.shops.filter(s => s.broken).length, bags: g.actors.filter(a => a.bag.length).length, socles: ['ordre','civils'].map(t => g.socles[t].filter(s => s.item).length), drops: g.drops.length, clouds: g.fx.clouds.length, tasks: g.actors.filter(a=>a.bot).map(a => a.ai.task?.kind || '-').join(','), stuck: g.actors.filter(a => a.bot && a.alive && !a.ai.path && !a.ai.target).length, cash: g.actors.map(a => a.cash|0).join(',') }); }, [+steps, extra]);
console.log(r); if (out !== '-') await p.screenshot({ path: out, timeout: 150000 }); await b.close(); })();
