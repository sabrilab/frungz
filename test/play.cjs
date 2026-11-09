const { chromium } = require('playwright');
(async () => { const [,, url, out, waitMs = 6000, script = ''] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 400)); }); p.on('pageerror', (e) => console.log('[err]', e.message, e.stack?.split('\n').slice(0,3).join(' | ')));
const t0 = Date.now(); await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 170000 }); console.log('loaded in', Date.now() - t0, 'ms');
await p.evaluate(() => window.__start()); console.log('started');
if (script) await p.evaluate(script);
await p.waitForTimeout(+waitMs);
console.log(await p.evaluate(() => { const g = window.__game; if (!g) return 'nogame'; const pl = g.player; return JSON.stringify({ frames: window.__frames, t: g.time.toFixed(1), pos: pl.pos.toArray().map(v => v.toFixed(1)), hp: pl.hp, score: g.score, shops: g.shops.length, cars: g.cars.length, actors: g.actors.length, alive: g.actors.filter(a => a.alive).length, botsMoving: g.actors.filter(a => a.bot && a.ai.path).length }); }));
await p.screenshot({ path: out, timeout: 150000 }); await b.close(); })();
