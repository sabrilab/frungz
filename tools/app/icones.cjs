// Fabrique l'icône de l'app iPhone (1024×1024) et l'écran de lancement (2732×2732) à partir du logo Frungz.
// node tools/app/icones.cjs   (Playwright requis)
const { chromium } = require(process.env.PW || 'playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..'), logo = fs.readFileSync(path.join(root, 'public/assets/logo.svg'), 'utf8');
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const page = (size, bg, w) => `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">
    <div style="width:${w}px">${logo.replace(/width="\d+" height="\d+"/, 'width="100%"')}</div></body></html>`;
  // icône : logo sur fond nuit parisienne (pas de transparence pour iOS)
  await p.setViewportSize({ width: 1024, height: 1024 });
  await p.setContent(page(1024, 'radial-gradient(circle at 50% 38%, #3a2a5c 0%, #1a1530 45%, #0b0a14 100%)', 900));
  await p.screenshot({ path: path.join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), omitBackground: false });
  // écran de lancement : noir, logo au centre (iOS recadre le carré selon l'écran)
  await p.setViewportSize({ width: 2732, height: 2732 });
  await p.setContent(page(2732, '#000', 1100));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await p.screenshot({ path: path.join(ios, 'Splash.imageset', f) });
  await b.close(); console.log('icône et écran de lancement faits');
})();
