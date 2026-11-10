// Construit dist/ : index.html, style.css, app.js (esbuild), assets/
import { build } from 'esbuild'; import fs from 'fs';
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist');
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/app.js', logLevel: 'warning', target: 'es2022', sourcemap: false });
// studio de skins : frungz.vercel.app/studio
await build({ entryPoints: ['src/studio.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/studio/app.js', logLevel: 'warning', target: 'es2022', sourcemap: false });
fs.copyFileSync('studio.html', 'dist/studio/index.html');
fs.copyFileSync('index.html', 'dist/index.html'); fs.copyFileSync('style.css', 'dist/style.css');
fs.cpSync('public/assets', 'dist/assets', { recursive: true });
// carte pré-compressée (le CDN ne compresse pas les .glb)
const zlib = await import('zlib');
for (const d of ['dist/assets', 'dist/assets/chars', 'dist/assets/cars']) for (const f of fs.readdirSync(d)) if (f.endsWith('.glb')) fs.writeFileSync(`${d}/${f}.gz`, zlib.gzipSync(fs.readFileSync(`${d}/${f}`), { level: 9 }));
console.log('dist ok', (fs.statSync('dist/app.js').size / 1e6).toFixed(2), 'Mo');
// en-têtes Vercel : cache long pour les assets
fs.writeFileSync('dist/vercel.json', JSON.stringify({ headers: [{ source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }] }, null, 2));
