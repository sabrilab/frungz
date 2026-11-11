// FRUNGZ INFO, voix neuronales : simule /api/tts (sonde + réplique de 4 s) et vérifie que le flash joue l'audio
// du serveur au lieu de la voix du navigateur, et que le plan s'allonge à la durée de la réplique.
// node test/journal-voix.cjs URL
const { chromium } = require('playwright');
const wav = (sec) => { const n = 8000 * sec, b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 8) * 3000), 44 + i * 2); return b; };
(async () => { const [,, url] = process.argv; const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const asked = [];
await p.route('**/api/tts?**', (r) => { const u = new URL(r.request().url()); if (u.searchParams.get('probe')) return r.fulfill({ json: { ok: true } }); asked.push(u.searchParams.get('v')); r.fulfill({ body: wav(10), contentType: 'audio/wav' }); });
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto(url); await p.waitForFunction('window.__loaded', null, { timeout: 480000 }); await p.evaluate(() => window.__start());
await p.waitForFunction('window.__game?.news?.pres?.ready', null, { timeout: 120000 });
await p.evaluate(() => { const g = window.__game; g.news.K = null; g.news.queue.length = 0; g.news.lastEnd = -999; g.update(0.033);
  g.newsPush({ pri: 3, variant: 'terrain', subject: g.player, head: 'Test', say: 'Phrase courte.', gfx: { kind: 'multi', name: 'Le Masqué', n: 4 } }); g.update(0.033); });
// la réplique (10 s) part ; tant qu'elle dure, le plan ne coupe pas (4 s de rab au plus), puis on passe au plan suivant
await p.waitForFunction(() => { const a = window.__game.news.K?.shots[0].audio; return a && !a.paused && a.currentTime > 0; }, null, { timeout: 60000 });
const r = await p.evaluate(() => { const g = window.__game, K = g.news.K, sh = K.shots[0], step = (until) => { while (K.t - K.t0 < until && K.i === 0) g.update(0.05); };
  step(sh.dur + 1); const mid = { i: K.i, playing: !sh.audio.paused };
  step(sh.dur + 4.3); return { dur: sh.dur, mid, after: K.i, next: !!K.shots[1].asked, synth: speechSynthesis.speaking }; });
console.log(JSON.stringify(r), 'voix demandées :', [...new Set(asked)].join(', '));
const ok = r.mid.i === 0 && r.mid.playing && r.after === 1 && r.next && !r.synth && new Set(asked).size === 2;
console.log(ok ? 'OK' : 'ÉCHEC'); await b.close(); process.exit(ok ? 0 : 1); })();
