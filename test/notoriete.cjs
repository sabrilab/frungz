// Notoriété et FRUNGZ INFO : étoiles / grades, température, cinématique plateau puis hélico
// node test/notoriete.cjs URL dossier [civils|ordre]
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.', team = 'civils'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 });
await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, pl = g.player; for (let i = 0; i < 10; i++) g.update(0.033);
  const foes = g.actors.filter((a) => a.team !== pl.team && !a.temp); const out = { team: pl.team };
  // 6 éliminations rapides (dont tirs à la tête) près du joueur
  for (let i = 0; i < 6; i++) { const t = foes[i]; t.alive = true; t.hp = 100; t.pos.copy(pl.pos).add(new window.__THREE.Vector3(4 + i, 0, 3)); g.damage(t, 999, pl, { head: i % 2 === 0, dist: 8 }); g.update(0.033); }
  out.noto = pl.noto; out.stars = pl.stars; out.grade = pl.grade; out.queue = g.news.queue.map((q) => q.head);
  out.rank = document.querySelector('#rank .noto')?.textContent; out.feed = document.querySelector('#feed')?.firstChild?.innerHTML?.slice(0, 200);
  // bots : un Frungz très recherché, un gradé
  const civ = g.actors.find((a) => a.team === 'civils' && a.bot), cop = g.actors.find((a) => a.team === 'ordre' && a.bot); g.notoAdd(civ, 30); g.notoAdd(cop, 40); out.bot = [civ.stars, cop.grade, !!civ.notoSpr, !!cop.notoSpr];
  return out; });
console.log(JSON.stringify(r));
// on avance jusqu'au lancement d'un flash (plateau), capture, puis la phase en direct
const shot = async (name, cond, max = 400) => { for (let i = 0; i < max; i++) { const ok = await p.evaluate((c) => { const g = window.__game; g.update(0.05); return eval(c); }, cond); if (ok) break; } await p.waitForTimeout(250); await p.screenshot({ path: `${out}/${name}.png` }); };
await shot('news-plateau-' + team, 'g.news.K && g.news.K.phase === "studio" && g.news.K.t > 1.2');
console.log(await p.evaluate(() => { const g = window.__game, K = g.news.K; return JSON.stringify({ head: K?.st.head, say: K?.st.say, chaos: g.news.chaos, pres: !!g.news.pres?.ch }); }));
await shot('news-direct-' + team, 'g.news.K && g.news.K.phase === "live" && g.news.K.t > g.news.K.studioT + 1.5');
// température : beaucoup d'éliminations d'un coup
const c = await p.evaluate(() => { const g = window.__game; const n = (g.opts.teamSize || 10) * 1.3; for (let i = 0; i < n; i++) g.news.log.push({ t: g.time, x: 0, z: 0 }); g.update(0.033); return { chaos: g.news.chaos, hud: document.querySelector('#chaos')?.textContent, q: g.news.queue.map((q) => q.head) }; });
console.log(JSON.stringify(c));
await p.screenshot({ path: `${out}/chaos-${team}.png` });
// badges au-dessus des têtes : un Frungz 4★ et un commandant devant la caméra
await p.evaluate(() => { const g = window.__game, pl = g.player, T = window.__THREE; g.news.K = null; document.getElementById('news').className = ''; document.body.classList.remove('newson');
  const civ = g.actors.find((a) => a.team === 'civils' && a.bot), cop = g.actors.find((a) => a.team === 'ordre' && a.bot); const f = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize(), s = new T.Vector3(f.z, 0, -f.x); for (const a of g.actors) if (a !== pl && a.bot) a.frozen = true;
  for (const [a, k] of [[civ, -1.6], [cop, 1.6]]) { a.alive = true; a.hp = 100; a.ai.target = null; a.pos.copy(pl.pos).addScaledVector(f, 7).addScaledVector(s, k); a.pos.y = g.world.groundY(a.pos.x, a.pos.z, pl.pos.y + 1); }
  g.news.lastEnd = g.time + 999; for (let i = 0; i < 6; i++) { g.update(0.033); civ.pos.copy(pl.pos).addScaledVector(f, 7).addScaledVector(s, -1.6); cop.pos.copy(pl.pos).addScaledVector(f, 7).addScaledVector(s, 1.6); } });
await p.waitForTimeout(300); await p.screenshot({ path: `${out}/badges.png` });
// petit écran (téléphone en paysage)
await p.setViewportSize({ width: 844, height: 390 }); await p.evaluate(() => { const g = window.__game; g.news.lastEnd = -999; g.newsPush({ pri: 3, subject: g.player, head: 'Test petit écran', say: 'Images exclusives : le Masqué vient de neutraliser quatre policiers coup sur coup.', gfx: { kind: 'multi', name: 'Le Masqué', n: 4 } }); });
await shot('mobile-direct', 'g.news.K && g.news.K.phase === "live" && g.news.K.t > g.news.K.studioT + 1');
console.log('erreurs', errs.length); await b.close(); })();
