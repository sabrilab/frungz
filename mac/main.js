// Frungz pour Mac : une fenêtre Electron (Chromium + Metal) qui ouvre le jeu publié sur frungz.vercel.app.
// - toujours la dernière version : chaque mise en ligne du jeu arrive dans l'app sans la refaire ;
// - sans internet : la copie du jeu embarquée dans l'app (resources/jeu) prend le relais ;
// - plein écran, carte graphique dédiée forcée, pas de ralentissement en arrière-plan, souris capturée, manette (API Gamepad).
const { app, BrowserWindow, Menu, shell, protocol, net, powerSaveBlocker, dialog } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');

const ONLINE = 'https://frungz.vercel.app/';
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const BENCH = arg('bench'); // --bench=40 : banc d'essai (voir scripts/bench.sh)
const START_URL = arg('url'); // --url=http://localhost:8124/ : ouvrir une autre adresse (tests)

// réglages gardés entre deux lancements
const prefsFile = () => path.join(app.getPath('userData'), 'reglages-mac.json');
let prefs = { uncapped: false, fullscreen: true };
try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; } catch {}
const savePrefs = () => { try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs, null, 2)); } catch {} };
if (process.argv.includes('--sans-limite')) prefs.uncapped = true;

// ---- moteur de rendu : tout pour le GPU ----
const sw = (k, v) => app.commandLine.appendSwitch(k, v);
sw('ignore-gpu-blocklist'); // jamais de repli logiciel
sw('enable-gpu-rasterization'); sw('enable-zero-copy');
sw('force_high_performance_gpu'); // Mac à deux cartes graphiques : la puissante
sw('disable-renderer-backgrounding'); sw('disable-background-timer-throttling'); sw('disable-backgrounding-occluded-windows');
sw('autoplay-policy', 'no-user-gesture-required'); // le son démarre sans clic
if (prefs.uncapped) { sw('disable-frame-rate-limit'); sw('disable-gpu-vsync'); } // images/s sans plafond (plus réactif, plus chaud, risque de déchirure)

// copie embarquée servie comme un vrai site (frungz://jeu/...), pour que fetch, modules et sauvegarde marchent
protocol.registerSchemesAsPrivileged([{ scheme: 'frungz', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const localRoot = () => app.isPackaged ? path.join(process.resourcesPath, 'jeu') : path.join(__dirname, 'jeu');
const LOCAL = 'frungz://jeu/index.html';

let win, blocker = null, usingLocal = false;
function createWindow() {
  win = new BrowserWindow({
    width: BENCH ? 1440 : 1600, height: BENCH ? 900 : 1000, minWidth: 960, minHeight: 600,
    fullscreen: BENCH ? process.argv.includes('--plein-ecran') : prefs.fullscreen, backgroundColor: '#000000', title: 'Frungz', show: false,
    titleBarStyle: 'hiddenInset', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // pas de rideau blanc ni d'onglets : les liens externes s'ouvrent dans le navigateur
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!/^(https:\/\/frungz\.vercel\.app|frungz:|http:\/\/localhost)/.test(url)) { e.preventDefault(); shell.openExternal(url); } });
  // hors ligne (ou Vercel injoignable) : la copie embarquée
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || usingLocal || code === -3 /* annulé */) return;
    if (fs.existsSync(path.join(localRoot(), 'index.html'))) { usingLocal = true; win.loadURL(LOCAL); }
    else dialog.showErrorBox('Frungz', `Impossible d'ouvrir le jeu (${desc}). Vérifie la connexion internet.`);
  });
  // l'écran ne s'éteint pas pendant une partie
  win.on('focus', () => { if (blocker === null) blocker = powerSaveBlocker.start('prevent-display-sleep'); });
  win.on('blur', () => { if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; } });
  win.on('enter-full-screen', () => { if (!BENCH) { prefs.fullscreen = true; savePrefs(); } });
  win.on('leave-full-screen', () => { if (!BENCH) { prefs.fullscreen = false; savePrefs(); } });

  if (BENCH) {
    // le jeu écrit son résultat dans le titre de la page : on l'enregistre et on quitte
    const out = arg('out') || path.join(app.getPath('home'), 'frungz-bench-app.json');
    win.webContents.on('page-title-updated', (e, t) => { if (t.startsWith('BENCH ')) { fs.writeFileSync(out, t.slice(6)); setTimeout(() => app.quit(), 3000); } });
    const u = new URL(START_URL || ONLINE); u.searchParams.set('bench', BENCH); for (const [k, v] of [['q', arg('q')], ['n', arg('n')]]) if (v) u.searchParams.set(k, v);
    win.loadURL(u.toString());
  } else win.loadURL(START_URL || ONLINE);
}

function buildMenu() {
  const relaunch = () => { app.relaunch(); app.exit(0); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Frungz', submenu: [{ role: 'about', label: 'À propos de Frungz' }, { type: 'separator' }, { role: 'hide', label: 'Masquer Frungz' }, { role: 'hideOthers', label: 'Masquer les autres' }, { type: 'separator' }, { role: 'quit', label: 'Quitter Frungz' }] },
    { label: 'Jeu', submenu: [
      { label: 'Recharger (dernière version)', accelerator: 'CmdOrCtrl+R', click: () => { usingLocal = false; win.webContents.reloadIgnoringCache(); } },
      { label: 'Revenir à la version en ligne', click: () => { usingLocal = false; win.loadURL(ONLINE); } },
      { label: 'Jouer hors ligne (copie de l\'app)', click: () => { usingLocal = true; win.loadURL(LOCAL); } },
      { type: 'separator' },
      { label: 'Images/s sans plafond (redémarre)', type: 'checkbox', checked: prefs.uncapped, click: (m) => { prefs.uncapped = m.checked; savePrefs(); relaunch(); } },
      { type: 'separator' },
      { label: 'Outils de développement', accelerator: 'Alt+CmdOrCtrl+I', role: 'toggleDevTools' },
    ] },
    { label: 'Fenêtre', submenu: [{ role: 'togglefullscreen', label: 'Plein écran', accelerator: 'Ctrl+Cmd+F' }, { role: 'minimize', label: 'Réduire' }, { role: 'close', label: 'Fermer' }] },
    // copier/coller pour le pseudo et le code d'équipe
    { label: 'Édition', submenu: [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' }, { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }] },
  ]));
}

app.whenReady().then(() => {
  protocol.handle('frungz', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname); const f = path.normalize(path.join(localRoot(), p));
    if (!f.startsWith(localRoot())) return new Response('interdit', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  buildMenu(); createWindow();
});
app.on('window-all-closed', () => app.quit());
