const { chromium } = require('playwright');
(async () => { const [,, url, out] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('frungz-save') || '{}'); s.settings = { ...(s.settings || {}), night: true }; localStorage.setItem('frungz-save', JSON.stringify(s)); } catch {} });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.screenshot({ path: out.replace('.png', '-menu.png') }); await p.evaluate(() => window.__start());
await p.waitForTimeout(3000); await p.screenshot({ path: out }); await b.close(); })();
