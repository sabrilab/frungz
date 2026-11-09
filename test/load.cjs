// Mesure le temps de chargement avec un débit limité (Mbit/s) : node test/load.cjs URL [mbps]
const { chromium } = require('playwright');
(async () => { const [,, url, mbps = '20'] = process.argv; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const cdp = await p.context().newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: +mbps * 125000, uploadThroughput: 2e6 });
  let bytes = 0; const big = []; p.on('response', async (r) => { const l = +(r.headers()['content-length'] || 0); bytes += l; if (l > 300000) big.push(r.url().split('/').pop() + ' ' + (l / 1e6).toFixed(1) + 'Mo'); });
  p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|WebGL-/.test(t)) console.log('[c]', t.slice(0, 300)); }); p.on('pageerror', (e) => console.log('[err]', e.message));
  const t0 = Date.now(); await p.goto(url);
  const tick = setInterval(async () => { try { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', await p.evaluate(() => document.getElementById('loadbar')?.style.width)); } catch {} }, 5000);
  await p.waitForFunction('window.__loaded', null, { timeout: 600000 }); clearInterval(tick);
  const heap = await p.evaluate(() => performance.memory ? (performance.memory.usedJSHeapSize / 1e6).toFixed(0) + 'Mo' : '?');
  console.log(JSON.stringify({ loadedS: ((Date.now() - t0) / 1000).toFixed(1), Mo: (bytes / 1e6).toFixed(1), heap, big }));
  const t1 = Date.now(); await p.evaluate(() => window.__start()); console.log('start', ((Date.now() - t1) / 1000).toFixed(1) + 's'); await b.close(); })();
