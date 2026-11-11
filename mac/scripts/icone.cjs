// Fabrique l'icône de l'app Mac (mac/build/icon.png, 1024×1024, carré arrondi façon macOS) à partir du logo Frungz.
// node mac/scripts/icone.cjs   (Playwright requis)
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..'), logo = fs.readFileSync(path.join(root, 'public/assets/logo.svg'), 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.setContent(`<html><body style="margin:0;width:1024px;height:1024px;display:grid;place-items:center;background:transparent">
    <div style="width:824px;height:824px;border-radius:185px;display:grid;place-items:center;box-shadow:0 18px 40px rgba(0,0,0,.35);
      background:radial-gradient(circle at 50% 38%, #3a2a5c 0%, #1a1530 45%, #0b0a14 100%)">
      <div style="width:720px">${logo.replace(/width="\d+" height="\d+"/, 'width="100%"')}</div></div></body></html>`);
  await p.screenshot({ path: path.join(root, 'mac/build/icon.png'), omitBackground: true });
  await b.close(); console.log('icône Mac faite');
})();
