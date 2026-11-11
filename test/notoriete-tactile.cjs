// FRUNGZ INFO sur téléphone (commandes tactiles) : node test/notoriete-tactile.cjs URL dossier
const { chromium, devices } = require('playwright');
(async () => { const [,, url, out = '.'] = process.argv; const b = await chromium.launch();
const d = devices['iPhone 14 Pro Max landscape'] || devices['iPhone 13 landscape']; const c = await b.newContext({ ...d }); const p = await c.newPage();
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
console.log(await p.evaluate(() => document.body.classList.contains('touch')));
await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 5; i++) g.update(0.033); g.news.queue.length = 0; g.news.lastEnd = -999; g.notoAdd(g.player, 9); });
for (const ph of ['studio', 'live']) { for (let i = 0; i < 400; i++) { const ok = await p.evaluate((ph) => { const g = window.__game; g.update(0.05); const K = g.news.K; return K && K.phase === ph && K.t > (ph === 'live' ? K.studioT + 1.2 : 1.2); }, ph); if (ok) break; }
  await p.waitForTimeout(250); await p.screenshot({ path: `${out}/tactile-${ph}.png` }); }
await b.close(); })();
