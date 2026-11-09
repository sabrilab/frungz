const { chromium } = require('playwright');
(async () => { const [,, url, out, w = 900, h = 600] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver/.test(t)) console.log('[c]', t.slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__ready', null, { timeout: 90000 }); await p.screenshot({ path: out }); await b.close(); })();
