// Planche de contrôle des clips : node planche.cjs out.png [fichier mx.json servi] [clips séparés par des virgules] [colonnes] [côté 0|1|-1]
const { chromium } = require('playwright');
(async () => { const [,, out, file = '/frungz/public/assets/anims/mx.json', only = '', cols = '6', side = '0'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(`http://localhost:8140/bake/planche.html?file=${encodeURIComponent(file)}&only=${encodeURIComponent(only)}&cols=${cols}&side=${side}`);
  await p.waitForFunction('window.__done', null, { timeout: 120000 }); await p.screenshot({ path: out, fullPage: true }); await b.close(); })();
