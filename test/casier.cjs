// Casier (sous-onglets) et navigation du salon : onglets toujours cliquables au-dessus de l'armurerie, de la boutique et des réglages.
// node test/casier.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(url + '?test=max&map=paris&q=bas&noreal'); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const shot = async (n) => { if (dir) { await p.waitForTimeout(400); await p.screenshot({ path: `${dir}/${n}.png` }); } };
  const saveOf = () => p.evaluate(() => JSON.parse(localStorage.getItem('frungz-save-test')));
  // navigation : armurerie → boutique → réglages → casier sans « Fermer »
  await p.click('#openShop'); await p.waitForTimeout(300); ok(await p.isVisible('#shop'), 'armurerie ouverte');
  ok(await p.isVisible('#openBoutique'), 'barre d\'onglets visible au-dessus de l\'armurerie'); await shot('nav-armurerie');
  await p.click('#openBoutique'); await p.waitForTimeout(300); ok(await p.isVisible('#boutique') && !(await p.isVisible('#shop')), 'armurerie → boutique en un clic');
  await p.click('#openSettings'); await p.waitForTimeout(300); ok(await p.isVisible('#pause') && !(await p.isVisible('#boutique')), 'boutique → réglages en un clic');
  ok(await p.evaluate(() => document.getElementById('openSettings').classList.contains('on')), 'onglet Réglages surligné');
  await p.click('#tabCasier'); await p.waitForTimeout(400); ok(!(await p.isVisible('#pause')) && await p.isVisible('#csTabs'), 'réglages → casier en un clic');
  // casier : sous-onglets
  for (const t of ['classe', 'armes', 'camo', 'tenue', 'effets', 'series']) { await p.click(`#csTabs [data-cs="${t}"]`); await shot('casier-' + t); ok(await p.isVisible(`.cs-p[data-cs="${t}"]`), 'sous-onglet ' + t); }
  await p.click('#csTabs [data-cs="armes"]'); await p.click('.cs-more summary'); await p.click('[data-cw="calibre50"]'); await p.waitForTimeout(200);
  let s = await saveOf(); ok(Object.values(s.kit).some((k) => k.p === 'calibre50'), 'arme principale changée depuis le casier');
  await p.click('#csTabs [data-cs="camo"]'); await p.click('[data-ceq="camo:lave"]'); await p.waitForTimeout(600);
  s = await saveOf(); ok(s.cosm.eq.camo === 'lave', 'camouflage équipé depuis le casier'); await shot('casier-camo-lave');
  await p.click('#csTabs [data-cs="effets"]'); await p.click('[data-ceq="trace:or"]'); s = await saveOf(); ok(s.cosm.eq.trace === 'or', 'traçante équipée depuis le casier');
  ok(/Pétards|Drone/.test(await p.textContent('#csSeries')), 'séries listées');
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
