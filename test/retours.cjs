// Retours de combat (feedback.js) : marqueur de touche, nombres groupés, arcs de direction, flash, sons étouffés. Captures.
// node test/retours.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const freeze = (ms) => p.evaluate((ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }, ms);
const r = await p.evaluate(() => { const g = window.__game, pl = g.player, T = window.__THREE, out = {};
  pl.alive = true; g.input.st.locked = true; pl.hp = 100; pl.armor = 50; pl.spawnProt = 0;
  const foe = g.actors.find((x) => x.bot && x.team !== pl.team); foe.alive = true; foe.hp = 100; foe.armor = 30; foe.ai.think = 99; foe.spawnProt = 0;
  pl.pos.set(-30, g.world.groundY(-30, -5), -5); g.cam.yaw = -Math.PI / 2; g.cam.pitch = 0; foe.pos.set(-38, g.world.groundY(-38, -5), -5);
  for (let i = 0; i < 5; i++) g.update(1 / 30);
  // fusil à pompe : 8 plombs dans la même image → un seul nombre
  const n0 = document.querySelectorAll('body > div > div').length;
  for (let i = 0; i < 8; i++) g.damage(foe, 9, pl, { weapon: 'shotgun' });
  out.armorAfter = foe.armor; out.hm = document.getElementById('hitmark').className; out.s = document.getElementById('hitmark').style.getPropertyValue('--s');
  out.numbers = [...document.querySelectorAll('div')].filter((d) => /^\d+$/.test(d.textContent) && d.style.font?.includes('Bungee')).map((d) => d.textContent);
  g.update(1 / 30); out.crossHit = document.getElementById('cross').className;
  // la cible tire sur le joueur depuis la droite
  foe.pos.set(-30, g.world.groundY(-30, 3), 3); g.damage(pl, 30, foe, {}); g.update(1 / 30);
  const arcs = [...document.querySelectorAll('#dmgdir i')].filter((i) => +i.style.opacity > 0); out.arcs = arcs.map((i) => i.style.transform + ' ' + i.style.opacity);
  out.hurt = document.getElementById('hurt').style.opacity; out.kick = [g.cam.kickY.toFixed(3), g.cam.kickP.toFixed(3)]; out.plArmor = pl.armor;
  return JSON.stringify(out); });
console.log(r);
await freeze(90); await p.screenshot({ path: out + '/retour-touche-recu.png' });
// le tireur passe derrière : l'arc doit suivre
const r2 = await p.evaluate(() => { const g = window.__game, pl = g.player, foe = g.actors.find((x) => x.bot && x.team !== pl.team);
  foe.pos.set(-22, g.world.groundY(-22, -5), -5); for (let i = 0; i < 4; i++) g.update(1 / 30);
  return [...document.querySelectorAll('#dmgdir i')].filter((i) => +i.style.opacity > 0).map((i) => i.style.transform).join(' / '); });
console.log('arc après déplacement :', r2);
// élimination à la tête
const r3 = await p.evaluate(() => { const g = window.__game, pl = g.player, foe = g.actors.find((x) => x.bot && x.team !== pl.team);
  foe.pos.set(-22, g.world.groundY(-22, -5), -5); foe.spawnProt = 0; g.damage(foe, 200, pl, { head: true }); g.update(1 / 30); return document.getElementById('hitmark').className + ' alive=' + foe.alive; });
console.log('élimination :', r3);
await freeze(120); await p.screenshot({ path: out + '/retour-elimination.png' });
// explosion proche + santé critique : sons étouffés
const r4 = await p.evaluate(() => { const g = window.__game, pl = g.player; const foe2 = g.actors.find((x) => x.bot && x.team !== pl.team && x.alive) || g.actors.find((x) => x.bot && x.team !== pl.team); foe2.alive = true;
  pl.spawnProt = 0; pl.alive = true; pl.hp = 60; g.damage(pl, 50, foe2, { blast: true }); for (let i = 0; i < 3; i++) g.update(1 / 30);
  return JSON.stringify({ hp: pl.hp, crit: document.getElementById('hurt').className, muf: g.fb && g.audio.debug().journal.slice(-3) }); });
console.log('explosion :', r4);
await freeze(150); await p.screenshot({ path: out + '/retour-critique.png' });
// coût : 300 images avec des touches dans tous les sens
const r5 = await p.evaluate(() => { const g = window.__game, pl = g.player; pl.hp = 1e9; const foes = g.actors.filter((x) => x.bot && x.team !== pl.team).slice(0, 8); for (const f of foes) f.alive = true;
  let fbT = 0; const fu = g.fb.update; g.fb.update = (dt) => { const t = performance.now(); fu(dt); fbT += performance.now() - t; };
  const t0 = performance.now(); for (let i = 0; i < 300; i++) { const f = foes[i % 8]; g.damage(pl, 5, f, {}); g.damage(f, 3, pl, {}); f.hp = 100; g.update(1 / 60); }
  g.fb.update = fu; return `fb.update ${(fbT / 300).toFixed(3)} ms/image, total ${((performance.now() - t0) / 300).toFixed(1)} ms/image, arcs DOM ${document.querySelectorAll('#dmgdir i').length}`; });
console.log('coût :', r5);
console.log('erreurs :', errs.length);
await b.close(); })();
