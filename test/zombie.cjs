// Mode Zombies : partie accélérée sur chaque carte. Le joueur tient (soins), « tire » sur le zombie le plus proche ;
// on relève vagues atteintes, erreurs JS, NaN, zombies coincés (qui n'approchent plus), coût d'une mise à jour.
// node test/zombie.cjs URL [paris,banlieue] [vague visée] [mort=1 : on laisse mourir à la fin pour voir l'écran de fin]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', maps = 'paris,banlieue', upto = '6', mort = '1'] = process.argv;
  let ko = 0;
  for (const map of maps.split(',')) {
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message + ' ' + (e.stack || '').split('\n')[1])); p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|status of 404|ERR_|supabase/i.test(m.text())) errs.push('console ' + m.text().slice(0, 200)); });
    await p.goto(`${url}?map=${map}&mode=zombie&q=bas&noreal&norender`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
    await p.evaluate(() => window.__start()); await p.waitForFunction('window.__game && window.__game.zm', null, { timeout: 120000 });
    const r = await p.evaluate(async ({ upto, mort }) => {
      const g = window.__game, Z = g.zm; const t0 = performance.now(); let steps = 0, worst = 0, nan = 0, maxAlive = 0, types = {}, stuck = 0, approach = [];
      const near = () => { let best = null, bd = 1e9; for (const z of Z.zeds) if (z.alive && z.st !== 'rise') { const d = z.pos.distanceTo(g.player.pos); if (d < bd) { bd = d; best = z; } } return [best, bd]; };
      const watch = new Map();
      while (!g.over && Z.wave <= upto && steps < 60000) {
        const dying = mort === '1' && Z.wave === upto && Z.state === 'wave';
        if (!dying) { g.player.hp = Math.max(g.player.hp, 60); }
        if (steps % 4 === 0) { const [z, d] = near(); if (z && d < 35) g.damage(z, dying ? 6 : 30, g.player, { head: Math.random() < 0.3, weapon: 'rifle', dist: d }); }
        const s = performance.now(); g.update(0.05); worst = Math.max(worst, performance.now() - s); steps++;
        if (steps % 40 === 0) {
          let al = 0; for (const z of Z.zeds) { if (!z.alive) continue; al++; types[z.ztype] = (types[z.ztype] || 0) + 1; if (![z.pos.x, z.pos.y, z.pos.z].every(Number.isFinite)) nan++;
            const d = z.target ? z.pos.distanceTo(z.target.pos) : 0; const w = watch.get(z); if (w && w.d - d < 0.5 && d > 3 && z.st === 'chase') { w.n++; if (w.n === 15) { stuck++; approach.push([z.name, z.pos.toArray().map((v) => +v.toFixed(1)), +d.toFixed(1)]); } } else watch.set(z, { d, n: 0 }); if (w) w.d = d; }
          maxAlive = Math.max(maxAlive, al);
          for (const a of g.actors) if (!a.gone && ![a.pos.x, a.pos.y, a.pos.z].every(Number.isFinite)) nan++;
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      return { vague: Z.wave, etat: Z.state, over: g.over, temps: +g.time.toFixed(0), abattus: Z.kills, tues: Z.zeds.length, maxEnVie: maxAlive, types, msMoy: +((performance.now() - t0) / steps).toFixed(2), msPire: +worst.toFixed(0), nan, coinces: stuck, exemples: approach.slice(0, 6), refuge: Z.refuge.map((v) => +v.toFixed(1)), pts: Z.spawnPts.length };
    }, { upto: +upto, mort });
    await p.waitForTimeout(4500);
    const fin = await p.evaluate(() => !document.getElementById('end').classList.contains('hidden') && document.getElementById('endTitle').textContent);
    const bad = r.nan || errs.length || r.vague < Math.min(+upto, 3);
    if (bad) ko++;
    console.log(`${bad ? 'KO' : 'OK'} ${map}`, JSON.stringify(r), '| fin', fin, '| erreurs', errs.length, errs.slice(0, 6));
    await b.close();
  }
  process.exit(ko ? 1 : 0);
})();
