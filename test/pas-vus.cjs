// Personnages que personne ne voit : coût de calcul avec et sans l'allègement (même partie, même instant), et absence de « fantômes ».
// node test/pas-vus.cjs URL [joueurs par camp]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', n = '50'] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${url}?map=paris&q=bas&noreal&n=${n}&profil=pv${Date.now() % 1e8}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const r = await p.evaluate(() => { const g = window.__game, sc = g.scene; for (let i = 0; i < 300; i++) g.update(0.05);
    g.player.pos.set(30, g.world.groundY(30, -5), -5); g.player.hp = 1e9; g.player.spawnProt = 1e9;
    const run = (off) => { g.noUnseen = off; for (let i = 0; i < 30; i++) g.update(1 / 60); let t = performance.now(); for (let i = 0; i < 300; i++) g.update(1 / 60); const up = (performance.now() - t) / 300;
      g.inRender = true; t = performance.now(); for (let i = 0; i < 300; i++) sc.updateMatrixWorld(); const mw = (performance.now() - t) / 300; g.inRender = false;
      return { up: +up.toFixed(2), mw: +mw.toFixed(2), pasVus: g.actors.filter((a) => a.unseen).length, total: g.actors.length }; };
    const sans = run(true), avec = run(false), sans2 = run(true), avec2 = run(false); // deux passes alternées : la partie évolue entre les mesures
    // aucun perso « pas vu » ne doit rester affichable ; tout perso vu doit l'être
    const fantomes = g.actors.filter((a) => a.unseen && a.ch.model.visible).length, caches = g.actors.filter((a) => !a.unseen && !a.lodHidden && !a.gone && a !== g.player && !a.ch.model.visible).length;
    // un perso pas vu garde une position de monde à jour quand le jeu la demande (départ de tir)
    const u = g.actors.find((a) => a.unseen && a.alive && a.ch.gun); let ecart = -1; if (u) { const v = new (g.player.pos.constructor)(); (u.ch.gun.userData.muzzle || u.ch.root).getWorldPosition(v); ecart = Math.hypot(v.x - u.pos.x, v.z - u.pos.z); }
    return { sans, avec, sans2, avec2, fantomes, caches, ecart: +ecart.toFixed(2) }; });
  const moy = (k) => [(r.sans[k] + r.sans2[k]) / 2, (r.avec[k] + r.avec2[k]) / 2];
  const [u0, u1] = moy('up'), [m0, m1] = moy('mw');
  console.log(`${r.avec.total} persos, dont ${r.avec.pasVus} à ${r.avec2.pasVus} pas vus`);
  console.log(`mise à jour du jeu      : ${u0.toFixed(2)} ms → ${u1.toFixed(2)} ms (écart dans le bruit de mesure)`);
  console.log(`squelettes (par image)  : ${m0.toFixed(2)} ms → ${m1.toFixed(2)} ms (${Math.round((1 - m1 / m0) * 100)} % de moins)`);
  ok(m1 < m0 * 0.9, 'le calcul des squelettes baisse quand des persos ne sont pas vus'); // la mise à jour du jeu varie de ±6 % d'une passe à l'autre : donnée pour information
  ok(r.fantomes === 0 && r.caches === 0, `aucun fantôme (${r.fantomes}) ni perso vu resté caché (${r.caches})`);
  ok(r.ecart >= 0 && r.ecart < 3, `position d'un perso pas vu à jour à la demande (écart ${r.ecart} m)`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
