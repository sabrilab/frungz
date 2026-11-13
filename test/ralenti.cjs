// Kill-cam ralenti (src/replay.js) : pas de bulle sur un kill banal ; un triplé déclenche un ralenti en plusieurs plans
// qui rejoue les poses enregistrées. Captures de la bulle (canevas lu dans la même tâche que le rendu).
// node test/ralenti.cjs URL dossier
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [,, url, out = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
await p.goto(url + (url.includes('?') ? '&' : '?') + 'n=4'); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
const r = await p.evaluate(() => { const g = window.__game, pl = g.player, T = window.__THREE, out = {}; g.paused = true;
  pl.alive = true; pl.hp = 100; pl.spawnProt = 99; g.save.settings.killcam = true;
  let X = -30, Z = -5, best = -1; for (const zc of g.zoneState) { const [x, z] = zc.center; const o = new T.Vector3(x + 6, g.world.groundY(x + 6, z) + 1.2, z); const h = g.world.ray(o, new T.Vector3(-1, 0, 0), 40); const m = h ? h.t : 40; if (m > best) { best = m; X = x + 6; Z = z; } }
  pl.pos.set(X, g.world.groundY(X, Z), Z); g.cam.yaw = -Math.PI / 2;
  const foes = g.actors.filter((x) => x.bot && x.team !== pl.team).slice(0, 3);
  for (const a of g.actors) if (a !== pl && !foes.includes(a)) { a.pos.set(300, -50, 300); a.alive = false; a.respawnT = 999; a.ch.root.visible = false; }
  foes.forEach((f, i) => { f.alive = true; f.hp = 100; f.armor = 0; f.spawnProt = 0; f.ai.think = 999; f.respawnT = 999; const x = X - 9 - i * 2, z = Z + (i - 1) * 3; f.pos.set(x, g.world.groundY(x, z), z); f.ch.root.visible = true; f.wish = new T.Vector3(0, 0, 1); });
  const step = (s) => { for (let k = 0; k < Math.round(s * 30); k++) g.update(1 / 30, true); };
  step(1.5);
  // kill banal : pas de bulle
  const lone = g.actors.find((x) => x.bot && x.team !== pl.team && !foes.includes(x)); lone.alive = true; lone.hp = 100; lone.spawnProt = 0; lone.pos.set(X - 6, g.world.groundY(X - 6, Z + 6), Z + 6); lone.ch.root.visible = true;
  g._rec.lastReplay = g.time - 30; g.damage(lone, 500, pl, { weapon: 'rifle', dir: new T.Vector3(-1, 0, 0) }); step(2.5); out.loneKillcam = !!g.killcam;
  g._rec.lastReplay = g.time - 10; // triplé : toujours autorisé au-delà de 8 s
  foes.forEach((f, i) => { const o = pl.pos.clone().add(new T.Vector3(0, 1.5, 0)); g.fx.tracer(o, f.pos.clone().add(new T.Vector3(0, 1.2, 0))); g.damage(f, 500, pl, { weapon: 'rifle', head: i === 2, dir: new T.Vector3(-1, 0, 0) }); step(0.7); });
  step(1.6); out.replay = g.killcam?.mode; out.shots = g.killcam?.shots?.map((s) => s.angle + ' ' + s.len.toFixed(2)).join(', '); out.dur = g.killcam?.dur?.toFixed(2); out.tracks = g._rec.tracks.size;
  const R = g._rec; out.track = g.killcam.shots.map((sh) => { const T = R.tracks.get(sh.k.victim); const L = []; for (let n = 0; n < R.count; n++) { const i = (R.head - n + 135) % 135; if (T.has[i]) L.push((R.times[i] - sh.k.t).toFixed(1) + (T.buf[i * T.stride + 11] ? 'A' : 'D')); } return sh.k.victim.name + ': ' + L.reverse().filter((x, j) => j % 4 === 0).join(' '); });
  out.parts = foes[0].ch.model.children.length; let sk = new Set(); foes[0].ch.model.traverse((o) => { if (o.isSkinnedMesh) sk.add(o.skeleton.bones[0].uuid); }); out.skels = sk.size;
  window.__step = step; return out; });
console.log(JSON.stringify(r));
const grab = async (name, adv) => { const d = await p.evaluate((adv) => { const g = window.__game; window.__step(adv); const kc = document.getElementById('killcam'); const cv = g.renderer.domElement; kc.getBoundingClientRect = () => cv.getBoundingClientRect(); g.renderer.render(g.scene, g.camera); g.renderPip(g.renderer, g.scene); const K = g.killcam; const S = K?.shots?.[K.cur]; return { dbg: S && S.eye ? [S.eye.toArray().map(v=>v.toFixed(1)).join(','), S.k.victim.pos.toArray().map(v=>v.toFixed(1)).join(','), S.k.victim.name, g._rec.tracks.has(S.k.victim), g.player.pos.toArray().map(v=>v.toFixed(1)).join(',')].join(' | ') : '', url: g.renderer.domElement.toDataURL('image/png'), cur: K?.cur, t: K?.t?.toFixed(2), label: document.querySelector('#killcam .kc-bot')?.textContent }; }, adv);
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(d.url.split(',')[1], 'base64')); console.log(name, d.cur, d.t, d.label, d.dbg); };
let tot = 0; const dur = +r.dur; for (let i = 0; i < 8; i++) { const adv = i === 0 ? 0.1 : (dur - 0.3) / 7; tot += adv; await grab('ralenti-' + i, adv); }
await p.evaluate(() => window.__step(3)); console.log('fini :', await p.evaluate(() => !window.__game.killcam));
console.log('erreurs', errs.length); await b.close(); })();
