// Profil du calcul : où part le temps de game.update (IA, animation, physique…), fonction par fonction.
// À lancer sur un build non minifié (noms de fonctions lisibles). node test/profil.cjs URL [joueurs par camp] [carte]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8126/', n = '50', map = 'paris'] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${url}?map=${map}&q=bas&noreal&n=${n}&profil=pf${Date.now() % 1e8}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 300; i++) g.update(0.05); }); // les camps se rejoignent : la mesure porte sur le combat
  const cdp = await p.context().newCDPSession(p); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  const ms = await p.evaluate(() => { const g = window.__game; const t = performance.now(); for (let i = 0; i < 400; i++) g.update(1 / 60); return (performance.now() - t) / 400; });
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map((x) => [x.id, x])); let total = 0;
  profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame; const k = (f.functionName || '(anonyme)') + (f.url ? '' : ' [moteur]'); self.set(k, (self.get(k) || 0) + dt[i]); total += dt[i]; });
  // temps cumulé (fonction + ce qu'elle appelle) pour les grandes étapes
  const parent = new Map(); for (const x of profile.nodes) for (const c of x.children || []) parent.set(c, x.id);
  const incl = new Map(); profile.samples.forEach((id, i) => { const seen = new Set(); for (let c = id; c; c = parent.get(c)) { const nm = byId.get(c).callFrame.functionName; if (nm && !seen.has(nm)) { seen.add(nm); incl.set(nm, (incl.get(nm) || 0) + dt[i]); } } });
  console.log(`${n} contre ${n} · ${ms.toFixed(2)} ms par mise à jour (machine de test, plus lente qu'un Mac)`);
  console.log('— temps propre, par fonction :'); for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`  ${(v / total * 100).toFixed(1).padStart(5)} %  ${k}`);
  console.log('— temps cumulé (avec les appels) :'); for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26)) console.log(`  ${(v / total * 100).toFixed(1).padStart(5)} %  ${k}`);
  await b.close();
})();
