// Réglages : onglets, préréglages clavier et manette, réaffectation d'une touche, effet en partie, sauvegarde.
// node test/touches.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const prof = 'tc' + (Date.now() % 1e9);
  await p.goto(`${url}?map=salle&q=bas&noreal&profil=${prof}`); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const save = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings.binds, 'frungz-save-' + prof);
  await p.click('#openSettings'); await p.waitForTimeout(300);
  ok(await p.locator('#kbBinds .st-row').count() >= 25, 'onglet Clavier : toutes les actions listées');
  if (dir) await p.screenshot({ path: dir + '/reglages-clavier.png' });
  await p.click('[data-preset="kb:classique"]'); await p.waitForTimeout(200);
  ok((await save()).kbPreset === 'classique' && /Ctrl/.test(await p.textContent('[data-cap="kb:duck:0"]')), 'préréglage « Classique FPS » : accroupi sur Ctrl');
  await p.click('[data-cap="kb:jump:0"]'); await p.waitForTimeout(150);
  ok(/Appuie/.test(await p.textContent('[data-cap="kb:jump:0"]')), 'attente d\'une touche affichée');
  await p.keyboard.press('KeyK'); await p.waitForTimeout(200);
  const B = await save(); ok(JSON.stringify(B.kb.jump) === '["KeyK"]', 'saut réaffecté sur K et enregistré');
  ok(/1 touche/.test(await p.textContent('#kbPresets')), 'carte « Personnalisé » active');
  await p.click('[data-cap="kb:map:0"]'); await p.waitForTimeout(120); await p.keyboard.press('KeyR'); await p.waitForTimeout(200);
  ok(await p.locator('.st-row.clash').count() >= 2, 'conflit signalé (carte et recharger sur la même touche)');
  await p.click('[data-cap="kb:map:0"]'); await p.waitForTimeout(120); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(!(await p.isVisible('.kb-capture.wait')), 'Échap annule l\'attente');
  await p.click('[data-cap="kb:map:0"]', { button: 'right' }); await p.waitForTimeout(150);
  ok(!(await save()).kb.map.includes('KeyR'), 'clic droit efface la touche');
  await p.click('#stTabs [data-st="pad"]'); await p.click('[data-preset="pad:pare_chocs"]'); await p.waitForTimeout(150);
  ok((await save()).padPreset === 'pare_chocs' && /L1/.test(await p.textContent('[data-cap="pad:jump:0"]')), 'manette : préréglage « Gâchettes hautes », saut sur L1');
  if (dir) await p.screenshot({ path: dir + '/reglages-manette.png' });
  for (const t of ['visee', 'image', 'jeu']) { await p.click(`#stTabs [data-st="${t}"]`); ok(await p.isVisible(`.st-pane[data-st="${t}"]`), 'onglet ' + t); }
  // en partie : K fait sauter, Espace non ; le libellé affiché suit
  await p.reload(); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(2000);
  const r = await p.evaluate(() => { const I = window.__game.input; const tap = (code) => { dispatchEvent(new KeyboardEvent('keydown', { code })); I.poll(); const d = I.down('jump'); dispatchEvent(new KeyboardEvent('keyup', { code })); return d; };
    return { k: tap('KeyK'), space: tap('Space'), label: I.label('jump'), duck: I.label('duck') }; });
  ok(r.k && !r.space, 'en partie : K saute, Espace ne saute plus');
  ok(r.label === 'K' && r.duck === 'Ctrl', `libellés à l'écran suivent la configuration (saut : ${r.label}, accroupi : ${r.duck})`);
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
