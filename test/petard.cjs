// « Pétard » : le joueur enchaîne les éliminations (multi-kills, paliers de série, étoiles, flash info, atouts lancés)
// et l'on photographie l'écran pour juger la lisibilité. Temps virtuel : horloge simulée (timers, rAF) et animations
// CSS recalées sur ce temps, donc les captures montrent ce qu'on verrait à 60 images/s, même sur une machine lente.
// node test/petard.cjs URL dossier [prefixe] [largeur hauteur] [touch]
const { chromium } = require('playwright');
(async () => { const [,, url, out = '.', pre = 'p', W = 1280, H = 720, touch] = process.argv; const b = await chromium.launch({ args: ['--use-gl=angle'] });
  const p = await b.newPage({ viewport: { width: +W, height: +H }, hasTouch: !!touch, isMobile: !!touch, deviceScaleFactor: touch ? 2 : 1 }); const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); console.log('[err]', e.message); });
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  await p.waitForTimeout(1500);
  // horloge virtuelle maison : rAF, performance.now et setTimeout passent par __vt ; le jeu avance par pas de 50 ms
  await p.evaluate(() => { const g = window.__game, pl = g.player; pl.hp = pl.maxHp = 1e9; g.news.lastEnd = -999; for (const a of g.actors) if (a.bot) a.frozen = true;
    const V = window.__vt = { now: 0, base: performance.now(), born: new WeakMap(), timers: [], raf: [], id: 1 }; const pn = performance.now.bind(performance);
    performance.now = () => V.base + V.now; window.requestAnimationFrame = (cb) => { V.raf.push(cb); return 0; };
    window.setTimeout = (f, ms = 0, ...a) => { const id = V.id++; V.timers.push({ id, at: V.now + ms, f, a }); return id; }; window.clearTimeout = (id) => { V.timers = V.timers.filter((t) => t.id !== id); };
    window.__vsync = () => { for (const an of document.getAnimations()) { if (!V.born.has(an)) { V.born.set(an, V.now - (an.currentTime || 0)); an.pause(); } an.currentTime = V.now - V.born.get(an); } };
    window.__vstep = (ms) => { for (let t = 0; t < ms; t += 50) { V.now += 50; const due = V.timers.filter((x) => x.at <= V.now); V.timers = V.timers.filter((x) => x.at > V.now); for (const x of due) try { x.f(...x.a); } catch (e) { console.warn(e); } g.update(0.05); window.__vsync(); } };
    window.__vframe = () => { const q = V.raf.splice(0); for (const cb of q) cb(V.base + V.now); window.__vsync(); }; });
  await p.waitForTimeout(3000); await p.evaluate(() => { window.__vt.raf.length = Math.min(1, window.__vt.raf.length); });
  let vnow = 0;
  const step = async (ms) => { vnow += ms; await p.evaluate((ms) => window.__vstep(ms), ms); };
  const kill = (n = 1, head = false) => p.evaluate(([n, head]) => { const g = window.__game, pl = g.player, T = window.__THREE;
    for (let i = 0; i < n; i++) { const t = g.actors.find((a) => a.team !== pl.team && a.alive && !a.temp); if (!t) return; const f = g.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
      t.pos.copy(pl.pos).addScaledVector(f, 9 + Math.random() * 6); t.pos.x += Math.random() * 4 - 2; g.damage(t, 999, pl, { head, dist: 12 }); }
    window.__vsync(); }, [n, head]);
  const log = [];
  const snap = async (name) => { await p.evaluate(() => window.__vframe()); await p.screenshot({ path: `${out}/${pre}-${name}.png` }); log.push(`${name} t=${(vnow / 1000).toFixed(1)}s ` + await p.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); if (!e) return 0; const s = getComputedStyle(e); return +(s.opacity > 0.05 && s.display !== 'none' && s.visibility !== 'hidden'); };
    const g = window.__game; return JSON.stringify({ multik: vis('multik') && document.getElementById('multik').textContent.slice(0, 40), center: vis('center') && document.getElementById('center').textContent.slice(0, 30), notopop: vis('notopop') && document.getElementById('notopop').textContent.slice(0, 30), medal: vis('medal'), news: document.getElementById('news')?.className, toasts: document.getElementById('toasts').children.length, feed: document.getElementById('feed').children.length, stage: g.stage?.q?.length, streak: g.player.streak }); })); };
  // série éclair : 12 éliminations en ~4 s (doublé → carnage, tourelle à 6, étoiles, hélico à 10)
  for (let i = 0; i < 12; i++) { await kill(1, i % 3 === 0); await step(350); if (i % 2 === 1) await snap(`k${String(i + 1).padStart(2, '0')}`); }
  for (let i = 0; i < 5; i++) { await step(600); await snap(`apres${i}`); }
  // pendant ce temps l'ennemi lance un gros atout et le joueur repart en carnage
  await p.evaluate(() => { const g = window.__game, pl = g.player; const foe = g.actors.find((a) => a.team !== pl.team && a.bot && a.alive);
    try { foe.rewards.push(foe.team === 'ordre' ? 'heli' : 'hdetourne'); g.landStreak ? 0 : 0; const q = pl.pos.clone(); q.x += 6; g.streakCall?.(foe, foe.rewards.at(-1), q); } catch (e) { console.log('foe', e.message); } });
  await kill(3); await step(300); await snap('triple2');
  await kill(4); for (let i = 0; i < 5; i++) { await step(500); await snap(`fin${i}`); }
  // mini-hélico avec des bonus prêts : le cadre de l'hélico ne doit pas chevaucher la barre des séries
  await p.evaluate(() => { const g = window.__game, pl = g.player; const c = g.cars.find((x) => x.kind === 'heli' && !x.driver); if (c) { c.pos.copy(pl.pos).add(new window.__THREE.Vector3(2, 0, 0)); g.enterCar(pl, c); } });
  await step(1500); await snap('helico');
  console.log(log.join('\n')); console.log('erreurs', errs.length); await b.close(); })();
