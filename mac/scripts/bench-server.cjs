// Serveur local du banc d'essai : sert dist/ sur http://localhost:8124 et enregistre les résultats envoyés par les pages (?bench=…&fin=nom).
// node mac/scripts/bench-server.cjs DOSSIER_RESULTATS
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../../dist'), out = process.argv[2] || path.join(__dirname, '../bench'); fs.mkdirSync(out, { recursive: true });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.gz': 'application/octet-stream', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && u.pathname === '/bench-result') { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { const nav = (u.searchParams.get('nav') || 'inconnu').replace(/[^\w-]/g, ''); fs.writeFileSync(path.join(out, nav + '.json'), b); console.log('résultat', nav, b.slice(0, 120)); res.end('ok'); }); return; }
  if (u.pathname === '/bench-fini') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<body style="background:#000;color:#fff;font:20px system-ui;display:grid;place-items:center;height:100vh">Mesure enregistrée, tu peux fermer cet onglet.</body>'); return; }
  let f = path.normalize(path.join(root, decodeURIComponent(u.pathname))); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
}).listen(8124, () => console.log('banc d’essai sur http://localhost:8124 → résultats dans', out));
