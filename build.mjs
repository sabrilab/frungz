// Construit dist/ : index.html, style.css, app.js (esbuild), assets/
import { build } from 'esbuild'; import fs from 'fs';
fs.rmSync('dist', { recursive: true, force: true }); fs.mkdirSync('dist');
await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'esm', outfile: 'dist/app.js', logLevel: 'warning', target: 'es2022', sourcemap: false });
fs.copyFileSync('index.html', 'dist/index.html'); fs.copyFileSync('style.css', 'dist/style.css');
fs.cpSync('public/assets', 'dist/assets', { recursive: true });
// carte pré-compressée (le CDN ne compresse pas les .glb)
const zlib = await import('zlib'); fs.writeFileSync('dist/assets/map.glb.gz', zlib.gzipSync(fs.readFileSync('dist/assets/map.glb'), { level: 9 }));
console.log('dist ok', (fs.statSync('dist/app.js').size / 1e6).toFixed(2), 'Mo');
// en-têtes Vercel : cache long pour les assets
fs.writeFileSync('dist/vercel.json', JSON.stringify({ headers: [{ source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] }] }, null, 2));
