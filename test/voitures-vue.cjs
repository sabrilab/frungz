// node test/voitures-vue.cjs dossier [indices] [yaws] : capture chaque voiture générée sous plusieurs angles
const { chromium } = require('playwright'); const fs = require('fs'); const esbuild = require('esbuild'); const path = require('path');
(async () => { const [,, dir, idx, yaws = '0.7,2.5'] = process.argv; fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'vue.js'); esbuild.buildSync({ entryPoints: [path.join(__dirname, 'voitures-vue.js')], bundle: true, format: 'esm', outfile: out, logLevel: 'warning' });
  fs.writeFileSync(path.join(dir, 'vue.html'), '<!doctype html><body style="margin:0"><script type="module" src="vue.js"></script>');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] }); const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await p.goto('file://' + path.resolve(dir, 'vue.html')); await p.waitForFunction('window.ready');
  const N = await p.evaluate('window.N'); const list = idx ? idx.split(',').map(Number) : [...Array(N).keys()];
  const Y = yaws.split(',').map(Number), D = +(process.env.DIST || 7.5), H = +(process.env.H || 1.5), LOD = +(process.env.LOD || 1);
  for (const i of list) for (let k = 0; k < Y.length; k++) { const r = await p.evaluate(([i, y, D, H, L]) => window.show(i, y, D, H, L), [i, Y[k], D, H, LOD]); if (k === 0) console.log(r.id, r.tri, 'tri');
    fs.writeFileSync(path.join(dir, `v${i}-${k}.jpg`), await p.screenshot({ type: 'jpeg', quality: 88 })); }
  await b.close(); })();
