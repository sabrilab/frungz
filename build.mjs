// Construit dist/ : index.html, style.css, app.js (esbuild), assets/
import { build } from 'esbuild'; import fs from 'fs';
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist');
// numéro de version : commit (sur Vercel) + horodatage ; sert au bouton « Mettre à jour » de l'accueil et à contourner les vieux caches
const BUILD = [(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7), Date.now().toString(36)].filter(Boolean).join('-');
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/app.js', logLevel: 'warning', target: 'es2022', sourcemap: false, define: { __BUILD__: JSON.stringify(BUILD) } });
// studio de skins : frungz.vercel.app/studio
await build({ entryPoints: ['src/studio.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/studio/app.js', logLevel: 'warning', target: 'es2022', sourcemap: false });
fs.copyFileSync('studio.html', 'dist/studio/index.html');
fs.writeFileSync('dist/index.html', fs.readFileSync('index.html', 'utf8').replace('href="style.css"', `href="style.css?v=${BUILD}"`).replace('src="app.js"', `src="app.js?v=${BUILD}"`));
fs.writeFileSync('dist/version.json', JSON.stringify({ id: BUILD, date: new Date().toISOString() })); fs.copyFileSync('style.css', 'dist/style.css');
fs.cpSync('public/assets', 'dist/assets', { recursive: true });
fs.copyFileSync('public/manifest.webmanifest', 'dist/manifest.webmanifest');
// carte pré-compressée (le CDN ne compresse pas les .glb)
const zlib = await import('zlib');
for (const d of ['dist/assets', 'dist/assets/chars', 'dist/assets/banlieue']) for (const f of fs.readdirSync(d)) if (f.endsWith('.glb')) fs.writeFileSync(`${d}/${f}.gz`, zlib.gzipSync(fs.readFileSync(`${d}/${f}`), { level: 9 }));
console.log('dist ok', (fs.statSync('dist/app.js').size / 1e6).toFixed(2), 'Mo');
// en-têtes Vercel : cache long pour les assets
fs.writeFileSync('dist/vercel.json', JSON.stringify({ headers: [{ source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }] }, null, 2));
