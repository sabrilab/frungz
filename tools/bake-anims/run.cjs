// Recible les clips de plan.json (ou du plan passé en 4e argument) : node run.cjs Punk ../frungz/public/assets/anims/mx.json [plan.json]
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PLAN = JSON.parse(fs.readFileSync(process.argv[4] || path.join(__dirname, 'plan.json'), 'utf8')).filter((p) => !p.off);
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', (m) => console.log('[c]', m.text().slice(0, 300))); p.on('pageerror', (e) => console.log('[err]', e.message));
  // le plan passe par la page (trop long pour l'URL)
  await p.addInitScript((plan) => { window.__PLAN = plan; }, PLAN);
  await p.goto(`http://localhost:8140/bake/index.html?char=${process.argv[2] || 'Punk'}`);
  await p.waitForFunction('window.__done', null, { timeout: 600000 });
  const s = await p.evaluate(() => window.__out); fs.writeFileSync(process.argv[3] || 'mx.json', s); console.log('clips', PLAN.length, 'octets', s.length); await b.close(); })();
