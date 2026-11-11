// node test/engins-vue.cjs dossier "camion:eau,heli:brigade" [yaws] : capture des autres engins (camions, hélicos, motos)
const { chromium } = require('playwright'); const fs = require('fs'); const esbuild = require('esbuild'); const path = require('path');
(async () => { const [,, dir, list, yaws = '0.7,2.6'] = process.argv; fs.mkdirSync(dir, { recursive: true });
  esbuild.buildSync({ entryPoints: [path.join(__dirname, 'voitures-vue.js')], bundle: true, format: 'esm', outfile: path.join(dir, 'vue.js'), logLevel: 'warning' });
  fs.writeFileSync(path.join(dir, 'vue.html'), '<!doctype html><body style="margin:0"><script type="module" src="vue.js"></script>');
  const b = await chromium.launch({ args: ['--use-gl=angle', '--allow-file-access-from-files'] }); const p = await b.newPage({ viewport: { width: 1100, height: 620 } });
  p.on('pageerror', (e) => console.log('[err]', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  await p.goto('file://' + path.resolve(dir, 'vue.html')); await p.waitForFunction('window.ready');
  const D = +(process.env.DIST || 11), H = +(process.env.H || 2.5), TY = +(process.env.TY || 1.2);
  for (const w of list.split(',')) { let k = 0; for (const y of yaws.split(',').map(Number)) { await p.evaluate(([w, y, D, H, TY]) => window.showObj(w, y, D, H, TY), [w, y, D, H, TY]); fs.writeFileSync(path.join(dir, `${w.replace(':', '-')}-${k++}.jpg`), await p.screenshot({ type: 'jpeg', quality: 88 })); } }
  await b.close(); })();
