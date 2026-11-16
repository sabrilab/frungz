// Profil d'une partie qui tourne normalement (mise à jour + affichage) : part de chaque fonction dans le temps de script.
// Sans carte graphique, le dessin lui-même n'est pas mesurable ici : on mesure le travail de préparation côté script.
// node test/profil-rendu.cjs URL [joueurs par camp] [secondes]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8126/', n = '50', sec = '25'] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${url}?map=paris&q=bas&noreal&n=${n}&profil=pr${Date.now() % 1e8}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 300; i++) g.update(0.05); g.player.pos.set(30, g.world.groundY(30, -5), -5); g.player.spawnProt = 1e9; g.player.hp = 1e9; });
  const cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start');
  const f0 = await p.evaluate(() => window.__frames || 0); await p.waitForTimeout(+sec * 1000); const f1 = await p.evaluate(() => window.__frames || 0);
  const { profile } = await cdp.send('Profiler.stop');
  const dt = profile.timeDeltas, byId = new Map(profile.nodes.map((x) => [x.id, x])), parent = new Map(); for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id);
  const self = new Map(), incl = new Map(); let js = 0, all = 0;
  profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame; all += dt[i]; if (!f.url && /^\((program|idle|root)\)$/.test(f.functionName)) return; js += dt[i];
    const k = f.functionName || '(anonyme)'; self.set(k, (self.get(k) || 0) + dt[i]); const seen = new Set(); for (let c = id; c; c = parent.get(c)) { const nm = byId.get(c).callFrame.functionName; if (nm && !seen.has(nm)) { seen.add(nm); incl.set(nm, (incl.get(nm) || 0) + dt[i]); } } });
  console.log(`${n} contre ${n} · ${f1 - f0} images en ${sec} s · script : ${(js / 1000 / (f1 - f0)).toFixed(1)} ms par image (${Math.round(js / all * 100)} % du temps total, le reste est le dessin logiciel)`);
  console.log('— temps cumulé, en % du temps de script :'); for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 34)) console.log(`  ${(v / js * 100).toFixed(1).padStart(5)} %  ${k}`);
  // qui appelle une fonction donnée (4e argument), ex. computeBoundingSphere
  const cible = process.argv[5]; if (cible) { const ch = new Map(); profile.samples.forEach((id, i) => { const names = []; for (let c = id; c; c = parent.get(c)) names.push(byId.get(c).callFrame.functionName || '?'); const k = names.indexOf(cible); if (k < 0) return; const key = names.slice(k, k + 7).join(' ← '); ch.set(key, (ch.get(key) || 0) + dt[i]); });
    console.log('— appelants de ' + cible + ' :'); for (const [k, v] of [...ch.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${(v / js * 100).toFixed(1).padStart(5)} %  ${k}`); }
  console.log('— temps propre :'); for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ${(v / js * 100).toFixed(1).padStart(5)} %  ${k}`);
  await b.close();
})();
