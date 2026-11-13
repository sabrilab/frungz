// Stabilité : une partie complète sur chaque carte, temps accéléré jusqu'à la fin du match, avec le joueur qui bouge, tire et change d'arme.
// Relève les erreurs JS, les valeurs invalides (NaN), les persos tombés sous la carte et le coût d'une mise à jour.
// node test/partie-complete.cjs URL [paris,banlieue] [n par camp]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', maps = 'paris,banlieue', n = '20'] = process.argv;
  let ko = 0;
  for (const map of maps.split(',')) {
    const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
    const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('response', (r) => { if (r.status() >= 400 && !/\/api\//.test(r.url())) errs.push(r.status() + ' ' + r.url()); }); p.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|GL_|supabase\.co|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    const t0 = Date.now();
    await p.goto(`${url}?map=${map}&q=bas&noreal&n=${n}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
    const load = ((Date.now() - t0) / 1000).toFixed(1);
    await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
    const training = map === 'salle'; // salle d'entraînement : pas de fin de match, on joue 5 min sans erreur
    const r = await p.evaluate(async (training) => {
      const g = window.__game, I = g.input; const t = performance.now(); let steps = 0, worst = 0, nan = 0, low = 0, deaths = 0, lastAlive = true;
      const keys = ['KeyW', 'KeyA', 'KeyD', 'ShiftLeft'];
      while (!g.over && g.time < (training ? 300 : g.matchLen + 5)) {
        // le joueur : avance, tourne, tire, change d'arme de temps en temps
        if (I && I.keys) { for (const k of keys) I.keys[k] = Math.random() < 0.3; I.mouse = I.mouse || {}; I.mouse.left = Math.random() < 0.2; }
        if (g.player) g.player.yaw = (g.player.yaw || 0) + 0.02;
        const s = performance.now(); g.update(0.05); worst = Math.max(worst, performance.now() - s); steps++;
        if (g.player && lastAlive && !g.player.alive) deaths++; lastAlive = g.player?.alive;
        if (steps % 100 === 0) {
          for (const a of g.actors) { if (a.gone) continue; if (![a.pos.x, a.pos.y, a.pos.z].every(Number.isFinite)) nan++; else if (a.alive && a.pos.y < -10 /* le métro descend à -9 */) { low++; (window.__bas ||= []).push([a.name, a.pos.toArray().map((v) => +v.toFixed(1))]); } }
          if (![g.camera.position.x, g.camera.position.y, g.camera.position.z].every(Number.isFinite)) nan++;
          await new Promise((r) => setTimeout(r, 0));
        }
        if (steps > 30000) break;
      }
      return { over: g.over, winner: g.winner, time: +g.time.toFixed(0), score: g.score, steps, msMoy: +((performance.now() - t) / steps).toFixed(2), msPire: +worst.toFixed(0), nan, sousCarte: low, mortsJoueur: deaths, bas: (window.__bas || []).slice(0, 4), acteurs: g.actors.length };
    }, training);
    await p.waitForTimeout(4000); // l'écran de fin arrive 1,5 s après la fin du match
    const fin = await p.evaluate(() => !document.getElementById('end').classList.contains('hidden'));
    const bad = (!training && (!r.over || !fin)) || r.nan || errs.length;
    if (bad) ko++;
    console.log(`${bad ? 'KO' : 'OK'} ${map} : chargé en ${load} s,`, JSON.stringify(r), '| écran de fin', fin, '| erreurs', errs.length, errs.slice(0, 6));
    await b.close();
  }
  process.exit(ko ? 1 : 0);
})();
