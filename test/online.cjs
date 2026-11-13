// Test du jeu en ligne à 3, trois navigateurs séparés reliés par le relais de test :
//   node test/relay.cjs 8125 & node test/online.cjs http://localhost:8124/
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', out = '/tmp'] = process.argv;
  const b = await chromium.launch({ args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  // MOBILE=1 : ami1 en iPhone, ami2 en Android (émulation : écran paysage, tactile, user-agent), le chef reste sur ordinateur
  const { devices } = require('playwright');
  const DEV = process.env.MOBILE === 'android' ? { ami1: 'Pixel 7 landscape' } : { ami1: 'iPhone 15 Pro Max landscape', ami2: 'Pixel 7 landscape' }; // MOBILE=android : ami1 en Android
  const page = async (q, tag) => { const br = await chromium.launch(); const d = process.env.MOBILE && DEV[tag] ? { ...devices[DEV[tag]], defaultBrowserType: undefined } : { viewport: { width: 960, height: 540 } }; delete d.defaultBrowserType; const p = await (await br.newContext(d)).newPage(); p.br = br; p.on('pageerror', (e) => console.log(`[${tag} err]`, e.message, e.stack?.split('\n').slice(0, 3).join(' | '))); p.on('console', (m) => { const t = m.text(); if (/salon|erreur|Error|net/i.test(t) && !/GPU|WebGL/.test(t)) console.log(`[${tag}]`, t.slice(0, 300)); }); await p.goto(url + q); return p; };
  const base = '?net=ws://localhost:8125&q=bas&noreal&norender&n=6';
  const H = await page(base + '&profil=h', 'chef');
  await H.waitForFunction('window.__loaded', null, { timeout: 240000 });
  await H.evaluate(() => { document.getElementById('pseudo').value = 'Sabri'; document.getElementById('openInvite').click(); });
  await H.evaluate(() => { const i = document.getElementById('pseudo'); i.value = 'Sabri'; i.dispatchEvent(new Event('input')); });
  const code = await H.evaluate(() => document.getElementById('teamCode').textContent); console.log('code', code);
  const NA = +(process.env.AMIS || 2); // AMIS=1 : chef + un ami (si la mémoire manque)
  const G = [await page(base + '&profil=g1&equipe=' + code, 'ami1')]; if (NA > 1) G.push(await page(base + '&profil=g2&equipe=' + code, 'ami2'));
  for (const [i, p] of G.entries()) { await p.waitForFunction('window.__loaded', null, { timeout: 240000 }); await p.evaluate((n) => { const el = document.getElementById('pseudo'); el.value = n; el.dispatchEvent(new Event('input')); }, ['Momo', 'Lina'][i]); }
  await H.waitForFunction((n) => window.__net.friends().length === n, NA, { timeout: 30000 });
  console.log('salon chef :', await H.evaluate(() => [document.getElementById('inviteNote').textContent, document.getElementById('squadN').textContent, [...document.querySelectorAll('#plates .nm')].map((e) => e.textContent).join(',')]));
  console.log('salon ami1 :', await G[0].evaluate(() => [document.getElementById('inviteNote').textContent, document.querySelector('#play span').textContent, document.getElementById('play').disabled]));
  // un ami change de tenue et de pseudo plusieurs fois : le chef doit le voir, sans que la présence soit renvoyée (limite Supabase)
  await G[G.length - 1].evaluate(() => { const el = document.getElementById('pseudo'); for (const n of ['L', 'Li', 'Lin', 'Lina']) { el.value = n; el.dispatchEvent(new Event('input')); } for (const b of [...document.querySelectorAll('#skins button')].slice(0, 3)) b.click(); });
  const want = await G[G.length - 1].evaluate((k) => JSON.parse(localStorage.getItem('frungz-save-g' + k)).skin, G.length);
  await H.waitForFunction((sk) => window.__net.friends().some((m) => m.pseudo === 'Lina' && m.skin === sk), want, { timeout: 30000 }).then(() => console.log('tenue et pseudo de ami2 vus par le chef : oui')).catch(() => console.log('tenue et pseudo de ami2 vus par le chef : NON'));
  await H.evaluate(() => { document.getElementById('invite').classList.add('hidden'); window.__start(); });
  await H.waitForTimeout(5000);
  for (const p of G) console.log('état ami', await p.evaluate(() => ({ game: !!window.__game, st: window.__net.status, guest: window.__net.guest, room: window.__net.room, host: window.__net.hostMember()?.id, recv: window.__net.stats.recv, members: window.__net.members.map((m) => m.pseudo + (m.host ? '(chef)' : '')), me: window.__net.id, own: window.__game ? window.__game.actors.filter((a) => !a.puppet).map((a) => a.id + ':' + a.owner + ':' + a.bot) : null, pl: !!window.__game?.player })));
  console.log('chef id', await H.evaluate(() => window.__net.id), 'sent', await H.evaluate(() => window.__net.stats.sent));
  for (const p of G) await p.waitForFunction('window.__game && window.__game.player', null, { timeout: 120000 });
  console.log('partie lancée chez les 3');
  const info = (p) => p.evaluate(() => { const g = window.__game; return { n: g.actors.length, me: g.player.id, names: g.actors.filter((a) => a.squad || !a.bot || a.owner).slice(0, 5).map((a) => a.name + (a.puppet ? '*' : '')), t: +g.time.toFixed(1), frames: window.__frames, score: g.score, sent: window.__net.stats.sent, recv: window.__net.stats.recv }; });
  await H.waitForTimeout(12000);
  console.log('chef', await info(H)); for (const p of G) console.log('ami', await info(p));
  // le chef déplace ses persos ; les amis doivent les voir au même endroit (à la latence près)
  const posOn = (p, ids) => p.evaluate((ids) => ids.map((i) => window.__game.actors[i].pos.toArray().map((v) => +v.toFixed(2))), ids);
  // coupure réseau chez ami1 : il se reconnecte tout seul et la partie continue
  await G[0].evaluate(() => window.__net.retry());
  await G[0].waitForFunction(() => window.__net.status === 'on', null, { timeout: 30000 });
  console.log('ami1 reconnecté :', await G[0].evaluate(() => ({ st: window.__net.status, guest: window.__net.guest, game: !!window.__game?.net })));
  // ami1 bouge son perso : téléporté à côté du chef
  await G[0].evaluate(() => { const g = window.__game; const hp = g.actors[0]; g.player.pos.set(hp.pos.x + 2, hp.pos.y, hp.pos.z + 1); });
  await H.waitForTimeout(3000);
  const ids = [0, 1, 2, 5, 9];
  const ph = await posOn(H, ids), pg = await posOn(G[0], ids), pg2 = await posOn(G[G.length - 1], ids);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]).toFixed(2);
  console.log('écarts chef/ami1 (m)', ids.map((i, k) => `#${i}:${d(ph[k], pg[k])}`).join(' '), '| chef/ami2', ids.map((i, k) => `#${i}:${d(ph[k], pg2[k])}`).join(' '));
  // ami1 tire sur un bot ennemi (dégâts envoyés au chef, mort annoncée à tous)
  const foe = await H.evaluate(() => window.__game.actors.find((a) => a.team !== window.__game.player.team && a.alive).id);
  await G[0].evaluate((id) => { const g = window.__game; g.damage(g.actors[id], 400, g.player, { head: true, weapon: 'rifle' }); }, foe);
  await H.waitForTimeout(2500);
  console.log('bot', foe, 'mort ? chef', await H.evaluate((id) => !window.__game.actors[id].alive, foe), 'ami1', await G[0].evaluate((id) => !window.__game.actors[id].alive, foe), 'ami2', await G[G.length - 1].evaluate((id) => !window.__game.actors[id].alive, foe), '| kills ami1', await G[0].evaluate(() => window.__game.stats.kills));
  // un bot du chef touche ami2 : c'est le navigateur d'ami2 qui encaisse
  const g2id = await G[G.length - 1].evaluate(() => window.__game.player.id);
  const hp0 = await G[G.length - 1].evaluate(() => window.__game.player.hp);
  await H.evaluate((id) => { const g = window.__game, t = g.actors[id]; const f = g.actors.find((a) => a.team !== t.team && a.alive && !a.puppet); g.damage(t, 35, f); }, g2id);
  await H.waitForTimeout(2500);
  console.log('ami2 vie', hp0, '→', await G[G.length - 1].evaluate(() => Math.round(window.__game.player.hp)), '(vue chez le chef :', await H.evaluate((id) => Math.round(window.__game.actors[id].hp), g2id), ')');
  // tir distant visible : ami1 tire, le compteur arrive chez le chef
  await G[0].evaluate(() => { const g = window.__game; g.player.netShots = (g.player.netShots || 0) + 1; });
  await H.waitForTimeout(1500);
  console.log('tir de ami1 vu par le chef :', await H.evaluate((id) => window.__game.time - (window.__game.actors[id].lastShot ?? -99) < 3, await G[0].evaluate(() => window.__game.player.id)));
  console.log('score chef', await H.evaluate(() => window.__game.score), 'ami1', await G[0].evaluate(() => window.__game.score));
  
  // départ d'un ami : son perso disparaît chez le chef
  const g1id = await G[0].evaluate(() => window.__game.player.id);
  await G[0].br.close(); await H.waitForTimeout(+(process.env.ATTENTE_DEPART || 50000)); // le relais de test oublie un joueur après 30 s sans nouvelles, puis 12 s de grâce
  console.log('ami1 parti, perso retiré chez le chef :', await H.evaluate((id) => window.__game.actors[id].gone, g1id));
  await b.close(); await H.br.close(); if (G.length > 1) await G[G.length - 1].br.close();
})();
