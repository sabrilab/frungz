// Pilote Playwright : ouvre lab.html (servi via interception sur localhost:8150) et exécute window.__main(args) d’un script de la page.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
module.exports = async function run(scriptFile, args, opts = {}) {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: opts.viewport || { width: 800, height: 600 } });
  p.on('console', (m) => console.log('[c]', m.text().slice(0, 500))); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.route('http://localhost:8150/__lab/**', (r) => { const f = path.join(__dirname, r.request().url().split('/__lab/')[1].split('?')[0]); r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html' : 'application/javascript' }); });
  await p.route('http://localhost:8150/__file/**', (r) => { const f = decodeURIComponent(r.request().url().split('/__file')[1].split('?')[0]); r.fulfill({ body: fs.readFileSync(f), contentType: 'application/octet-stream' }); });
  await p.goto('http://localhost:8150/__lab/lab.html'); await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  await p.addScriptTag({ url: 'http://localhost:8150/__lab/' + scriptFile, type: 'module' });
  await p.waitForFunction('window.__main', null, { timeout: 60000 });
  const res = await p.evaluate(async (a) => await window.__main(a), args);
  await b.close(); return res;
};
if (require.main === module) (async () => { const r = await module.exports(process.argv[2], process.argv.slice(3)); console.log(JSON.stringify(r, null, 1)); })();
