// Séries sans fin : bonus tous les 5 après 25, titres tous les 10, vitalité. node test/infini.cjs URL dossier
const { chromium } = require('playwright');
(async () => { const [,, url, dir = '.'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
let errs = 0; p.on('pageerror', (e) => { errs++; console.log('[err]', e.message); });
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start()); await p.waitForTimeout(1500);
const shot = async (n) => { await p.evaluate(() => document.querySelectorAll('#multik, #multik *').forEach((e) => e.getAnimations().forEach((a) => { a.pause(); a.currentTime = 500; }))); await p.screenshot({ path: `${dir}/infini-${n}.png` }); };
const log = [];
for (let n = 1; n <= 52; n++) {
  const r = await p.evaluate(() => { const g = window.__game, a = g.player; a.hp = 40; const before = a.rewards.length, cash = g.save.bank; g.addStreak(a); g.drawStreakbar();
    return { n: a.streak, got: a.rewards.length > before ? a.rewards[a.rewards.length - 1] : '', hp: Math.round(a.hp), armor: Math.round(a.armor), cash: g.save.bank - cash, big: document.getElementById('multik').textContent.slice(0, 40), cards: [...document.querySelectorAll('#streakbar .sk')].map((c) => (c.classList.contains('ready') ? '*' : '') + c.querySelector('.nm').textContent).join(' | ') }; });
  if (r.got || n % 10 === 0) log.push(JSON.stringify(r));
  if (n === 30 || n === 35 || n === 50) { await p.waitForTimeout(50); await shot(n); }
}
console.log(log.join('\n')); console.log('rewards', await p.evaluate(() => window.__game.player.rewards.join(',')), 'erreurs', errs);
await b.close(); })();
