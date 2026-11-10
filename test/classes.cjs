// Classes et armes : node test/classes.cjs URL
// vérifie l'équipement de chaque classe, la rafale, l'atout de rechargement, la répartition des classes chez les bots
const { chromium } = require('playwright');
(async () => { const [,, url] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); await p.evaluate(() => window.__start());
  const r = await p.evaluate(async () => {
    const g = window.__game, a = g.player, out = {};
    const { CLASSES, WEAPONS } = window.__data || {};
    // équipement par classe (on force la classe puis un retour)
    out.classes = {};
    for (const id of Object.keys(g.save.cls ? (window.__CLASSES || {})[a.team] || {} : {})) { g.save.cls[a.team] = id; g.respawn(a); out.classes[id] = { slots: a.slots.map((s) => s.id), armor: a.armor, nades: a.nades, frags: a.frags, perk: a.perk }; }
    // bots : répartition des classes et des armes
    const bots = g.actors.filter((x) => x.bot); out.botCls = {}; out.botW = {};
    for (const x of bots) { out.botCls[x.cls] = (out.botCls[x.cls] || 0) + 1; const w = x.slots[1]?.id; out.botW[w] = (out.botW[w] || 0) + 1; }
    // rafale : 3 coups, puis pause
    a.slots[1] = { id: 'rafale', rarity: 'commun', mag: 30 }; g.equip(a, 1, true); a.fireT = 0; const o = a.pos.clone(); o.y += 1.5; const d = o.clone().set(0, 0, 1);
    let shots = 0; for (let i = 0; i < 40; i++) { a.fireT -= 0.02; if ((a.burstLeft > 0 || i === 0) && g.fire(a, o, d)) shots++; }
    out.burst = { shots, mag: a.slots[1].mag, fireT: +a.fireT.toFixed(2) };
    return out;
  });
  console.log(JSON.stringify(r, null, 1)); console.log('erreurs', errs);
  await b.close(); })();
