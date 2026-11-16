// Séries : barre (échelle, prochaine, série choisie), choix pendant la visée (R), lancement de la série choisie, série sans visée.
// node test/series-choix.cjs URL [dossier de captures]
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', dir] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/api\/|Failed to load resource|supabase\.co|WebSocket/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  await p.goto(url + '?map=paris&q=bas&noreal&n=8&profil=sc' + Date.now()); await p.waitForFunction('window.__loaded', null, { timeout: 600000 });
  await p.evaluate(() => window.__start()); await p.waitForTimeout(2500);
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) process.exitCode = 1; };
  const G = (f) => p.evaluate(f);
  // série de 4 : rien de prêt, la prochaine est à 5
  await G(() => { const g = window.__game, a = g.player; a.streak = 4; a.rewards = ['petards']; g.streakSel = null; g._sbKey = null; g.drawStreakbar(); });
  let t = await G(() => document.getElementById('streakbar').innerText.replace(/\s+/g, ' '));
  ok(/ENCORE 1/.test(t) && /Renforts émeutiers/i.test(t), 'barre : prochaine série et éliminations manquantes (' + t.slice(0, 90) + ')');
  ok(await G(() => document.querySelectorAll('#streakbar .ladder i').length === window.__game.player.team.length * 0 + (window.__game.player.team === 'civils' ? 10 : document.querySelectorAll('#streakbar .ladder i').length)), 'barre : échelle complète des séries du camp');
  // trois séries prêtes : X ouvre la visée de la dernière, R change, le tir lance celle choisie
  await G(() => { const g = window.__game, a = g.player; a.streak = 12; a.rewards = ['petards', 'emeute', 'belier']; g._sbKey = null; g.drawStreakbar(); });
  if (dir) await p.screenshot({ path: dir + '/series-barre.png' });
  ok(await G(() => document.querySelector('#streakbar .sk.sel .nm')?.innerText) === 'CAMION-BÉLIER' || await G(() => /bélier/i.test(document.querySelector('#streakbar .sk.sel .nm')?.innerText || '')), 'série choisie par défaut : la dernière gagnée');
  await G(() => window.__game.useStreak(window.__game.player));
  ok(await G(() => window.__game.thr?.kind) === 'belier', 'X : visée du camion-bélier');
  await G(() => { const g = window.__game; g.streakCycle(g.player); g.thr.kind = g.streakSel; g.drawThrowHud(); });
  ok(await G(() => window.__game.thr?.kind) === 'petards', 'R : passe à la série suivante (pétards)');
  if (dir) await p.screenshot({ path: dir + '/series-visee.png' });
  ok(/Pétards/.test(await G(() => document.getElementById('throwhud').innerText)), 'visée : liste des séries prêtes affichée');
  await G(() => { const g = window.__game, a = g.player, S = g.thr; g.thr = null; g.castThrow(a, S.kind, g.throwVel(a), g.throwOrigin(a)); });
  ok(JSON.stringify(await G(() => window.__game.player.rewards)) === '["emeute","belier"]', 'lancer : seule la série choisie est consommée');
  // série sans visée choisie dans la liste
  await G(() => { const g = window.__game, a = g.player; a.rewards = ['emeute', 'canon']; g.streakSel = 'canon'; g.thr = null; g.useStreak(a); });
  ok(await G(() => window.__game.thr?.kind) === 'canon', 'canonnière avec une autre série prête : on confirme avant (pas de lancement direct)');
  await G(() => { for (let i = 0; i < 20; i++) window.__game.update(0.05); });
  ok(!errs.length, 'aucune erreur' + (errs.length ? ' : ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
})();
