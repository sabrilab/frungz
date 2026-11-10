// Captures du jeu en ligne à 2 (rendu actif) : node test/relay.cjs 8125 & node test/online-shots.cjs http://localhost:8124/ dossier
const { chromium } = require('playwright');
(async () => {
  const [,, url = 'http://localhost:8124/', out = '/tmp'] = process.argv;
  const open = async (q) => { const br = await chromium.launch(); const p = await (await br.newContext({ viewport: { width: 960, height: 540 } })).newPage(); p.br = br; p.on('pageerror', (e) => { if (!/Pointer Lock/.test(e.message)) console.log('[err]', e.message); }); await p.goto(url + q); await p.waitForFunction('window.__loaded', null, { timeout: 240000 }); return p; };
  const base = '?net=ws://localhost:8125&q=bas&noreal&n=4';
  const H = await open(base + '&profil=h'); await H.evaluate(() => { const i = document.getElementById('pseudo'); i.value = 'Sabri'; i.dispatchEvent(new Event('input')); document.getElementById('openInvite').click(); });
  const code = await H.evaluate(() => document.getElementById('teamCode').textContent);
  const G = await open(base + '&profil=g1&equipe=' + code); await G.evaluate(() => { const i = document.getElementById('pseudo'); i.value = 'Momo'; i.dispatchEvent(new Event('input')); });
  await H.waitForFunction(() => window.__net.friends().length === 1 && window.__net.friends()[0].pseudo === 'Momo', null, { timeout: 60000 });
  await H.waitForTimeout(1500); await H.screenshot({ path: out + '/salon-chef.png' }); await G.screenshot({ path: out + '/salon-ami.png' });
  await H.evaluate(() => { document.getElementById('invite').classList.add('hidden'); window.__start(); });
  await G.waitForFunction('window.__game && window.__game.player', null, { timeout: 120000 });
  // l'ami se place devant le chef et le regarde ; le chef court en tirant
  await H.waitForTimeout(4000);
  const hp = await H.evaluate(() => { const p = window.__game.player; return [p.pos.x, p.pos.y, p.pos.z, p.yaw]; });
  await G.evaluate((hp) => { const g = window.__game, p = g.player; p.pos.set(hp[0] + Math.sin(hp[3]) * 5, hp[1], hp[2] + Math.cos(hp[3]) * 5); p.yaw = hp[3] + Math.PI; g.cam.yaw = p.yaw; g.cam.pitch = -0.05; g.cam.snap = true; }, hp);
  await H.evaluate(() => { const g = window.__game; g.player.wish = new window.__THREE.Vector3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw)); g._shoot = setInterval(() => { g.player.netShots = (g.player.netShots || 0) + 1; g.player.lastShot = g.time; }, 400); });
  await G.waitForTimeout(6000);
  await G.screenshot({ path: out + '/en-jeu-vu-par-ami.png' });
  await H.evaluate(() => { const g = window.__game; g.cam.yaw = g.player.yaw + Math.PI; g.player.wish = null; });
  await H.waitForTimeout(4000); await H.screenshot({ path: out + '/en-jeu-vu-par-chef.png' });
  console.log(await G.evaluate(() => { const g = window.__game, h = g.actors[0]; return { chef: h.name, anim: h.anim, vit: Math.hypot(h.vel.x, h.vel.z).toFixed(1), dist: h.pos.distanceTo(g.player.pos).toFixed(1), frames: window.__frames }; }));
  await H.br.close(); await G.br.close();
})();
