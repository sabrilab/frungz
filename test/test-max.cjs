// Mode test (?test=max) : tout est débloqué, sauvegarde séparée, partie sans erreur.
// node test/test-max.cjs URL [capture.png]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', shot] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(url + '?test=max&map=salle&q=bas&noreal'); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const s = await p.evaluate(() => ({ test: JSON.parse(localStorage.getItem('frungz-save-test')), vraie: localStorage.getItem('frungz-save') }));
  ok(s.test.lvl === 50 && s.test.bank >= 9999999, 'niveau 50 et banque pleine');
  ok(s.test.unlocked.length >= 25 && Object.values(s.test.upgrades).every((l) => l >= 3), `armes (${s.test.unlocked.length}) et améliorations au max`);
  ok(s.test.cosm.owned.length >= 35 && s.test.cosm.passe.premium, `cosmétiques (${s.test.cosm.owned.length}) et passe premium`);
  ok(!s.vraie || !JSON.parse(s.vraie).test, 'vraie sauvegarde intacte');
  ok((await p.textContent('#lvl')).trim() === '50', 'niveau affiché : 50');
  await p.click('#openBoutique'); await p.click('[data-tab="passe"]'); await p.waitForTimeout(300);
  ok(await p.locator('[data-claim]').count() === 50, 'passe : 50 récompenses à récupérer');
  await p.click('[data-tab="camo"]'); await p.click('[data-eq="camo:matiere_noire"]'); await p.click('#boutique [data-close]');
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2500); await p.evaluate(() => { for (let i = 0; i < 40; i++) window.__game.update(0.05); }); await p.waitForTimeout(800);
  if (shot) await p.screenshot({ path: shot });
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
