// Boutique : ouverture, onglets, achat de jetons en démo, achat et équipement d'un camouflage, d'une traçante, d'un effet et d'une tenue,
// puis une partie : camouflage sur l'arme (vue extérieure et 1re personne), traçante colorée, aucune erreur de shader.
// node test/boutique.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text()) /* salon en ligne injoignable en test : hors sujet */) errs.push('console ' + m.text().slice(0, 300)); });
  await p.goto(url + '?map=salle&q=bas&noreal&profil=bq' + Date.now()); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  await p.click('#openBoutique'); await p.waitForTimeout(600);
  ok(await p.isVisible('#boutique'), 'boutique ouverte');
  ok(await p.isVisible('.bq-tagdemo'), 'mode démo affiché (pas de serveur en local)');
  if (dir) await p.screenshot({ path: `${dir}/boutique-une.png` });
  await p.click('[data-tab="jetons"]'); await p.click('[data-pack="p2400"]'); await p.waitForTimeout(200);
  ok(/rétractation/.test(await p.textContent('.bq-msg')), 'paiement bloqué sans la case de renonciation');
  await p.check('#bqConsent'); await p.click('[data-pack="p2400"]'); await p.waitForTimeout(300);
  ok((await p.textContent('#jetons')).replace(/\s/g, '') === '2400', 'jetons crédités en démo (2400)');
  if (dir) await p.screenshot({ path: `${dir}/boutique-jetons.png` });
  await p.click('[data-tab="camo"]'); await p.waitForTimeout(300); await p.click('[data-buy="camo:neon"]'); await p.waitForTimeout(400);
  const eq = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('frungz-save-bq')))).cosm);
  ok(eq.eq.camo === 'neon' && eq.jetons === 900, 'camo néon acheté et équipé (2400 → 900)');
  await p.hover('[data-aid="camo:lave"]'); await p.waitForTimeout(900);
  if (dir) await p.screenshot({ path: `${dir}/boutique-camo.png` });
  await p.click('[data-tab="fx"]'); await p.click('[data-buy="trace:violette"]'); await p.click('[data-buy="effet:confettis"]'); await p.waitForTimeout(300);
  await p.click('[data-tab="tenue"]'); await p.waitForTimeout(300); await p.hover('[data-aid="tenue:p_neon"]'); await p.waitForTimeout(900);
  if (dir) await p.screenshot({ path: `${dir}/boutique-tenue.png` });
  await p.click('[data-tab="passe"]'); await p.waitForTimeout(300);
  if (dir) await p.screenshot({ path: `${dir}/boutique-passe.png` });
  const st = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('frungz-save-bq')))); return s.cosm; });
  ok(st.eq.trace === 'violette' && st.eq.effet === 'confettis' && st.jetons === 0, 'traçante et effet équipés (900 → 0)');
  await p.click('#boutique [data-close]'); await p.waitForTimeout(300);
  // partie : arme du joueur camouflée
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2500);
  const g = await p.evaluate(() => { const g = window.__game; const mats = []; g.player.ch.gun.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) mats.push(m.customProgramCacheKey?.() || ''); });
    const v = []; g.vgun?.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) v.push(m.customProgramCacheKey?.() || ''); });
    return { camo: mats.filter((k) => k.startsWith('camo|neon')).length, total: mats.length, vue: v.filter((k) => k.startsWith('camo|neon')).length, tr: g.tracerOf(g.player) }; });
  ok(g.camo > 0, `arme en main camouflée (${g.camo}/${g.total} pièces)`); ok(g.vue > 0, 'arme en vue subjective camouflée'); ok(g.tr === '#b45cff', 'traçante violette');
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60; i++) g.update(0.05); }); await p.waitForTimeout(1500);
  if (dir) await p.screenshot({ path: `${dir}/partie-camo.png` });
  ok(!errs.length, 'aucune erreur JS ni de shader' + (errs.length ? ' : ' + errs.slice(0, 4).join(' | ') : ''));
  await b.close();
})();
