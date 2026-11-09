const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage();
p.on('console', (m) => console.log('[c]', m.text().slice(0, 300))); p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('requestfailed', r => console.log('[fail]', r.url()));
p.on('response', r => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });
await p.goto(process.argv[2]); await p.waitForTimeout(+process.argv[3] || 8000);
console.log('ready', await p.evaluate('window.__ready')); await b.close(); })();
