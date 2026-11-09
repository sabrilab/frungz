// Statistiques de la map : triangles par groupe/nom de maillage. node test/mapstat.cjs URL
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto(process.argv[2]); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  console.log(await p.evaluate(() => { const root = window.__ground[0].parent; let top = root; while (top.parent && top.parent.type !== 'Scene') top = top.parent;
    const by = {}; let tot = 0, n = 0, inst = 0; top.traverse((o) => { if (!o.isMesh) return; n++; const g = o.geometry; let t = (g.index ? g.index.count : g.attributes.position.count) / 3; if (o.isInstancedMesh) { t *= o.count; inst++; } tot += t; const k = (o.name || '?').replace(/[_\d.-]+$/, '').slice(0, 24); (by[k] ||= [0, 0, o.castShadow ? 1 : 0]); by[k][0] += t; by[k][1]++; });
    return 'meshes ' + n + ' instanced ' + inst + ' tris ' + (tot / 1e6).toFixed(2) + 'M\n' + Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 30).map(([k, v]) => k + ' ' + (v[0] / 1000 | 0) + 'k x' + v[1] + (v[2] ? ' ombre' : '')).join('\n'); })); await b.close(); })();
