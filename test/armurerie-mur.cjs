// Armurerie murale (plan technique) : planches par catégorie, plans dessinés, fiche, achat, équipement.
// node test/armurerie-mur.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const prof = 'am' + (Date.now() % 1e9); // 12 caractères au plus : le jeu tronque le nom du profil
  await p.addInitScript((k) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ bank: 6000 })); }, 'frungz-save-' + prof);
  await p.goto(url + '?map=salle&q=bas&noreal&profil=' + prof); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const t0 = Date.now(); await p.click('#openShop'); await p.waitForSelector('#shopList .bp-pl'); const open = Date.now() - t0;
  await p.waitForFunction(() => !document.querySelector('#shopList img[data-bp], #shopList img.wait'), null, { timeout: 120000 }); const drawn = Date.now() - t0;
  ok(await p.locator('#shopList .bp-pl').count() === 9, 'neuf planches (7 catégories, classes, planque)');
  ok(await p.locator('#shopList .bp-w[data-k="w"]').count() === 29, '29 armes au mur');
  ok(await p.evaluate(() => [...document.querySelectorAll('#shopList .bp-img')].every((i) => i.naturalWidth > 50)), `tous les plans sont dessinés (écran ouvert en ${open} ms, plans finis en ${drawn} ms)`);
  if (dir) await p.screenshot({ path: dir + '/mur-1.png' });
  await p.click('#shopRail [data-go="precision"]'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => document.querySelector('#shopRail .on')?.dataset.go) === 'precision', 'colonne des catégories : va à la planche Précision');
  await p.hover('[data-id="sniper"]'); await p.waitForTimeout(700); if (dir) await p.screenshot({ path: dir + '/mur-2.png' });
  ok(/Fusil de précision/i.test(await p.textContent('#pvinfo')), 'survol : fiche technique de l\'arme');
  ok(/Il te manque/.test(await p.textContent('#pvAct')) && await p.isDisabled('#pvAct button'), 'arme trop chère : achat bloqué, somme manquante affichée');
  await p.click('[data-id="dmr"]'); await p.click('#pvAct button'); await p.waitForTimeout(300);
  const s = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), 'frungz-save-' + prof);
  ok(s.bank === 200 && s.unlocked.includes('dmr') && Object.values(s.kit).some((k) => k.p === 'dmr'), 'achat sur la fiche : 6 000 → 200 €, arme équipée');
  ok(await p.evaluate(() => document.querySelector('[data-id="dmr"]').classList.contains('eq')), 'arme équipée marquée en or sur le mur');
  await p.click('#shopRail [data-go="planque"]'); await p.waitForTimeout(900); if (dir) await p.screenshot({ path: dir + '/mur-3.png' });
  await p.setViewportSize({ width: 820, height: 600 }); await p.waitForTimeout(400); if (dir) await p.screenshot({ path: dir + '/mur-etroit.png' });
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
