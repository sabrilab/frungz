// Point d'entrée : chargement, menu (camp, skin), armurerie, réglages, partie, écran de fin.
import * as THREE from 'three';
import { setupScene, loadMap, loadGLB, World, loader } from './world.js';
import { loadChars, loadGuns, makeCharacter, attachGun } from './assets.js';
import { createAudio } from './audio.js';
import { createFX } from './fx.js';
import { createInput } from './input.js';
import { createNight } from './night.js';
import { Game } from './game.js';
import { TEAMS, WEAPONS, UPGRADES, SKIN_NAMES } from './data.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const Q = new URLSearchParams(location.search);

// ---------- sauvegarde ----------
const DEFAULT = { bank: 0, unlocked: ['pistol'], primary: null, upgrades: {}, xp: 0, lvl: 1, team: 'civils', skin: 'Punk', settings: { sens: 1, padSens: 1, assist: true, fps: false, teamSize: 50, invertY: false, dynres: true } };
let save; try { save = { ...DEFAULT, ...JSON.parse(localStorage.getItem('frungz-save') || '{}') }; save.settings = { ...DEFAULT.settings, ...save.settings }; save.upgrades ||= {}; } catch { save = structuredClone(DEFAULT); }
const persist = () => { try { localStorage.setItem('frungz-save', JSON.stringify(save)); } catch {} };
if ((save.sv || 1) < 2) { save.sv = 2; save.settings.teamSize = 50; } // passage au 50 contre 50 par défaut

// ---------- qualité graphique ----------
// préréglages : bas (PC modestes), moyen, haut ; « auto » choisit selon la carte graphique, puis la résolution s'adapte aux images/s
const QUALITY = {
  bas: { pr: 0.75, prMin: 0.5, aa: false, shadows: false, shadowSize: 1024, soft: false, post: false, far: 480, fog: [90, 380], lod: 90, lodShadow: 0 },
  moyen: { pr: 1, prMin: 0.6, aa: true, shadows: true, shadowSize: 1024, soft: false, post: false, far: 900, fog: [130, 520], lod: 150, lodShadow: 30 },
  haut: { pr: 1.5, prMin: 0.7, aa: true, shadows: true, shadowSize: 2048, soft: true, post: true, far: 1700, fog: [150, 620], lod: 200, lodShadow: 45 },
};
function detectTier() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); if (!gl) return 'bas';
    const ext = gl.getExtension('WEBGL_debug_renderer_info'); const r = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8, mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (/SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR|GMA|HD Graphics [2-6]\d{2}\b|HD Graphics$/i.test(r) || cores <= 2 || mem <= 2 || mobile) return 'bas';
    if (/RTX|GTX 1[06-9]\d0|GTX [2-9]\d{3}|RX [5-9]\d{2,3}|Radeon Pro|Apple (M\d|GPU)|Arc/i.test(r) && cores >= 6) return 'haut';
    return 'moyen';
  } catch { return 'moyen'; }
}
if (!save.settings.quality || save.settings.quality === 'auto') { const t = detectTier(); save.settings.qualityAuto = t; if (!save.settings.quality) { save.settings.quality = 'auto'; if (t === 'bas' && save.settings.teamSize > 25) save.settings.teamSize = 25; } }
const QN = Q.get('q') || (save.settings.quality === 'auto' ? save.settings.qualityAuto : save.settings.quality) || 'moyen';
const QS = { ...(QUALITY[QN] || QUALITY.moyen) }; if (Q.has('noshadow')) QS.shadows = false; if (Q.has('nopost')) QS.post = false; if (Q.has('lowres')) QS.pr = Math.min(QS.pr, 1);
window.__quality = QN;

// ---------- rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: QS.aa, powerPreference: 'high-performance' });
const prMax = Math.min(devicePixelRatio, QS.pr); let prCur = prMax;
renderer.setPixelRatio(prCur); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = QS.shadows; renderer.shadowMap.type = QS.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
const { scene, sun, hemi, followShadow } = setupScene(renderer);
sun.shadow.mapSize.set(QS.shadowSize, QS.shadowSize); sun.castShadow = QS.shadows; scene.fog.near = QS.fog[0]; scene.fog.far = QS.fog[1];
const pm = new THREE.PMREMGenerator(renderer);
import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; });
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, QS.far); scene.add(camera);
// post-traitement : bloom léger (éclairs de bouche, néons, soleil), étalonnage et vignette dans un seul passage final
let composer = null;
async function setupPost() {
  if (!QS.post) return;
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'), import('three/examples/jsm/postprocessing/RenderPass.js'), import('three/examples/jsm/postprocessing/UnrealBloomPass.js'), import('three/examples/jsm/postprocessing/OutputPass.js'), import('three/examples/jsm/postprocessing/ShaderPass.js')]);
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // étalonnage : légère courbe en S, ombres un peu froides, hautes lumières chaudes, vignette douce
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.22); c += vec3(-0.012, 0.0, 0.018) * (1.0 - l) + vec3(0.02, 0.008, -0.012) * l;
        c = mix(vec3(l), c, 1.08); vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.55; gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }` }));
  window.__post = composer;
}
setupPost();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); });
const audio = createAudio(); const input = createInput(renderer.domElement); Object.assign(input.settings, save.settings);
const fx = createFX(scene, camera);

// ---------- chargement ----------
const ALL_SKINS = [...TEAMS.ordre.skins, ...TEAMS.civils.skins];
const CARS = [['sportscar', 'sport', 'Coupé sport orange'], ['sportscar2', 'sport', 'Coupé sport blanc'], ['sports', 'sport', 'Coupé sport rouge'], ['roadster', 'sport', 'Cabriolet bleu'], ['muscle', 'sport', 'Muscle car jaune'], ['sports-armored', 'blinde', 'Sportive blindée'], ['cop', 'police', 'Voiture de police'], ['police-sedan', 'police', 'Berline de police'], ['suv-luxury', 'civil', 'SUV de luxe']];
let world, mapRoot, carDefs = [], night = null;
let progress = { map: 0, chars: 0, guns: 0, cars: 0 };
const showProgress = () => { const p = progress.map * 0.6 + progress.chars / ALL_SKINS.length * 0.25 + progress.guns / 6 * 0.05 + progress.cars / CARS.length * 0.1; $('loadbar').style.width = (p * 100).toFixed(0) + '%'; };
async function loadAll() {
  const gp = await fetch('assets/gameplay.json').then((r) => r.json());
  const [{ root, ground }] = await Promise.all([
    loadMap('assets/map.glb', (p) => { progress.map = p; showProgress(); }),
    loadChars(ALL_SKINS, () => { progress.chars++; showProgress(); }),
    loadGuns(() => { progress.guns++; showProgress(); }),
    Promise.all(CARS.map(async ([f, classe, nom]) => { try { const g = await loadGLB(`assets/cars/${f}.glb`); const s = g.scene; const box = new THREE.Box3().setFromObject(s); const sz = s.userData.size || [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]; carDefs.push({ scene: s, classe, nom, size: sz }); } catch (e) { console.warn('voiture', f, e); } progress.cars++; showProgress(); })),
  ]);
  $('loadtxt').textContent = 'Préparation du quartier…'; await new Promise((r) => setTimeout(r, 30));
  mapRoot = root; scene.add(root);
  // allègements selon la qualité : pas d'ombre des feuillages en moyenne, pas de décor lointain en basse (caché par le brouillard)
  root.traverse((o) => { if (!o.isMesh) return; const n = o.name || ''; if (QN !== 'haut' && /leaf/.test(n)) o.castShadow = false; if (QN === 'bas' && /decor_lointain/.test(n)) o.visible = false; });
  const tw = performance.now(); world = new World(gp, ground); console.log('monde prêt en', (performance.now() - tw).toFixed(0), 'ms'); window.__world = world; window.__ground = ground;
  night = createNight({ scene, sun, hemi, renderer, world, mapRoot: root, fx, quality: QN }); night.set(!!save.settings.night); renderMenu();
  $('loading').classList.add('hidden'); $('play').disabled = false;
  window.__loaded = true;
}

// ---------- menu ----------
let preview = null;
function renderMenu() {
  document.querySelectorAll('.side').forEach((b) => b.classList.toggle('on', b.dataset.team === save.team));
  const skins = TEAMS[save.team].skins; if (!skins.includes(save.skin)) save.skin = skins[0];
  $('skins').innerHTML = skins.map((s) => `<button data-skin="${s}" class="${s === save.skin ? 'on' : ''}">${SKIN_NAMES[s] || s}</button>`).join('');
  $('nightBtn').textContent = save.settings.night ? '☀️ Jour' : '🌙 Nuit (émeute)';
  $('bank').textContent = fmt(save.bank); $('lvl').textContent = save.lvl || 1;
}
document.querySelectorAll('.side').forEach((b) => b.addEventListener('click', () => { save.team = b.dataset.team; persist(); renderMenu(); audio.init(); audio.play('uiSelect'); }));
$('skins').addEventListener('click', (e) => { const s = e.target.dataset?.skin; if (!s) return; save.skin = s; persist(); renderMenu(); audio.init(); audio.play('uiTick'); });
$('play').disabled = true;
$('play').addEventListener('click', () => start());
$('openShop').addEventListener('click', () => openShop());
$('nightBtn').addEventListener('click', () => { save.settings.night = !save.settings.night; persist(); night?.set(save.settings.night); renderMenu(); audio.init(); audio.play('uiTick'); });
$('closeShop').addEventListener('click', () => closeShop());
$('again').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); renderMenu(); });

// ---------- armurerie ----------
function openShop() {
  audio.init(); $('shop').classList.remove('hidden'); document.exitPointerLock?.(); if (game) game.paused = true; renderShop();
}
function closeShop() { $('shop').classList.add('hidden'); if (game && !game.over) { game.paused = false; renderer.domElement.requestPointerLock?.(); } }
function renderShop() {
  document.querySelectorAll('.bankN').forEach((e) => (e.textContent = fmt(save.bank)));
  const w = Object.entries(WEAPONS).filter(([id]) => id !== 'pistol').map(([id, W]) => {
    const owned = save.unlocked.includes(id), eq = save.primary === id;
    return `<div class="card ${owned ? 'owned' : ''}" style="--c:${owned ? '#2f6' : '#777'}"><b>${W.icon} ${W.name}</b><small>Dégâts ${W.dmg}${W.pellets > 1 ? '×' + W.pellets : ''} · ${W.rps} coups/s · chargeur ${W.mag}</small><button data-w="${id}" ${!owned && save.bank < W.price ? 'disabled' : ''}>${owned ? (eq ? 'Équipée ✓' : 'Équiper') : fmt(W.price) + ' €'}</button></div>`;
  });
  const u = Object.entries(UPGRADES).map(([id, U]) => { const l = save.upgrades[id] || 0; const max = l >= U.max; const p = U.price(l); return `<div class="card" style="--c:#57b6ff"><b>${U.icon} ${U.name} · niv. ${l}/${U.max}</b><small>${U.desc}</small><button data-u="${id}" ${max || save.bank < p ? 'disabled' : ''}>${max ? 'Maximum' : fmt(p) + ' €'}</button></div>`; });
  $('shopList').innerHTML = w.join('') + u.join('');
}
$('shopList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.w) { const id = b.dataset.w; if (!save.unlocked.includes(id)) { save.bank -= WEAPONS[id].price; save.unlocked.push(id); audio.cash(true); } save.primary = id; if (game?.player?.alive) { const a = game.player; const W = { id, rarity: 'rare', mag: WEAPONS[id].mag }; if (a.slots.length > 1) a.slots[1] = W; else a.slots.push(W); game.equip(a, 1); } }
  if (b.dataset.u) { const id = b.dataset.u; const l = save.upgrades[id] || 0; save.bank -= UPGRADES[id].price(l); save.upgrades[id] = l + 1; audio.cash(true); if (game) { game.player.cap = 20 + (save.upgrades.sac || 0) * 8; } }
  persist(); renderShop(); renderMenu();
});


// ---------- navigation manette dans les menus ----------
// croix / stick : déplacer le focus vers le contrôle le plus proche dans la direction ; ✕ valider ; ○ retour ; ⬅ ➡ régler curseurs et listes
let padFocus = null, navRep = 0;
function activeScreen() { for (const id of ['pause', 'shop', 'end', 'menu']) { const el = $(id); if (el && !el.classList.contains('hidden')) return el; } return null; }
function focusables(scr) { return [...scr.querySelectorAll('button, input, select')].filter((e) => !e.disabled && e.offsetParent !== null); }
function setPadFocus(el) { padFocus?.classList.remove('padfocus'); padFocus = el; if (el) { el.classList.add('padfocus'); el.scrollIntoView?.({ block: 'nearest' }); } }
function padMenu(dt) {
  if (!input.st.pad) { setPadFocus(null); return; }
  const scr = activeScreen(); if (!scr) { setPadFocus(null); return; }
  const list = focusables(scr); if (!list.length) return;
  if (!padFocus || !list.includes(padFocus)) { if (!input.st.usingPad) return; setPadFocus(list.find((e) => e.id === 'play' || e.id === 'resume' || e.id === 'again') || list[0]); }
  const H = input.padHit, ax = input.st.moveX, ay = input.st.moveY;
  let dx = H(15) ? 1 : H(14) ? -1 : 0, dy = H(13) ? 1 : H(12) ? -1 : 0;
  navRep -= dt;
  if (!dx && !dy && Math.hypot(ax, ay) > 0.6) { if (navRep <= 0) { navRep = 0.22; if (Math.abs(ax) > Math.abs(ay)) dx = Math.sign(ax); else dy = Math.sign(ay); } } else if (Math.hypot(ax, ay) < 0.3) navRep = 0;
  const f = padFocus;
  if (dx && (f.type === 'range' || f.tagName === 'SELECT')) {
    if (f.type === 'range') { const st = +f.step || 0.1; f.value = Math.min(+f.max, Math.max(+f.min, +f.value + dx * st * 4)); f.dispatchEvent(new Event('input')); }
    else { f.selectedIndex = (f.selectedIndex + dx + f.options.length) % f.options.length; f.dataset.dirty = '1'; f.dispatchEvent(new Event('input')); }
    audio.play('uiTick'); return;
  }
  if (dx || dy) {
    const r = f.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bs = 1e9;
    for (const e of list) { if (e === f) continue; const q = e.getBoundingClientRect(); const ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy; const along = dx ? ex * dx : ey * dy, across = dx ? Math.abs(ey) : Math.abs(ex); if (along <= 4) continue; const sc = along + across * 2.5; if (sc < bs) { bs = sc; best = e; } }
    if (best) { setPadFocus(best); audio.play('uiTick'); } return;
  }
  if (H(0)) { if (f.tagName === 'SELECT') { if (f.dataset.dirty) { delete f.dataset.dirty; f.dispatchEvent(new Event('change')); } } else if (f.type !== 'range') { f.click(); audio.play('uiSelect'); } return; }
  if (H(1)) { if (scr.id === 'pause') closePause(); else if (scr.id === 'shop') closeShop(); }
}

// ---------- pause et réglages ----------
const pause = document.createElement('div'); pause.id = 'pause'; pause.className = 'screen panel hidden';
pause.innerHTML = `<h2>PAUSE</h2>
<div class="settings">
<label>Sensibilité souris <input type="range" min="0.3" max="5" step="0.05" id="s-sens"></label>
<label>Sensibilité manette <input type="range" min="0.3" max="5" step="0.05" id="s-pad"></label>
<label><input type="checkbox" id="s-assist"> Visée assistée (manette)</label>
<label><input type="checkbox" id="s-inv"> Inverser l'axe vertical</label>
<label><input type="checkbox" id="s-fps"> Vue première personne (V / R3)</label>
<label><input type="checkbox" id="s-killcam"> Kill-cam sur les beaux tirs</label>
<label>Qualité graphique <select id="s-quality"><option value="auto">Auto</option><option value="bas">Basse (PC modestes)</option><option value="moyen">Moyenne</option><option value="haut">Haute</option></select></label>
<label><input type="checkbox" id="s-dynres"> Résolution adaptée aux images/s</label>
<label>Images/s <b id="s-fpsn">–</b></label>
<label>Joueurs par camp (prochaine partie) <select id="s-team"><option value="5">5 contre 5</option><option value="10">10 contre 10</option><option value="15">15 contre 15</option><option value="20">20 contre 20</option><option value="35">35 contre 35</option><option value="50">50 contre 50</option></select></label>
</div>
<div class="row-btns"><button class="big" id="resume">REPRENDRE</button><button class="ghost" id="quit">Quitter la partie</button></div>
<div class="controls"><div><h3>🎮 Manette</h3>
<p><kbd>L</kbd> se déplacer · <kbd>R</kbd> regarder</p><p><kbd>R2</kbd> tirer · <kbd>L2</kbd> viser</p><p><kbd>✕</kbd> sauter / escalader · <kbd>○</kbd> roulade / glissade</p>
<p><kbd>L1</kbd> s'accroupir · <kbd>R1</kbd> grenade</p><p><kbd>□</kbd> agir, ramasser, voler une voiture · <kbd>△</kbd> changer d'arme</p>
<p><kbd>L3</kbd> sprint · <kbd>R3</kbd> vue FPS / TPS</p><p><kbd>⬅</kbd> recharger · <kbd>⬆</kbd> armurerie · <kbd>⬇</kbd> barricade · <kbd>➡</kbd> série</p><p><kbd>PAVÉ</kbd> carte · <kbd>SHARE</kbd> sac · <kbd>OPTIONS</kbd> pause</p><p>Menus : croix ou stick pour choisir, <kbd>✕</kbd> valider, <kbd>○</kbd> retour, <kbd>⬅</kbd><kbd>➡</kbd> régler</p></div>
<div><h3>⌨️ Clavier</h3><p><kbd>ZQSD</kbd>/<kbd>WASD</kbd> · souris pour regarder</p><p><kbd>Clic</kbd> tirer · <kbd>Clic droit</kbd> viser</p><p><kbd>Espace</kbd> saut · <kbd>Ctrl</kbd> roulade / glissade</p><p><kbd>C</kbd> accroupi · <kbd>G</kbd> grenade · <kbd>Maj</kbd> sprint</p><p><kbd>E</kbd> agir · <kbd>F</kbd> voiture · <kbd>R</kbd> recharger</p><p><kbd>1-4</kbd> armes · <kbd>Q</kbd> barricade · <kbd>B</kbd> armurerie · <kbd>X</kbd> série</p><p><kbd>M</kbd> carte · <kbd>Tab</kbd> sac · <kbd>V</kbd> vue · <kbd>Échap</kbd> pause</p></div></div>`;
document.body.appendChild(pause);
const st = document.createElement('style'); st.textContent = `.padfocus{outline:3px solid #ffcc3d!important;outline-offset:3px;box-shadow:0 0 0 7px rgba(255,204,61,.22)!important}.settings{display:grid;gap:10px;text-align:left;background:rgba(255,255,255,.06);padding:16px;border-radius:12px;min-width:min(420px,100%)}.controls{display:grid;grid-template-columns:1fr 1fr;gap:14px;text-align:left;margin-top:10px;font-size:13px}.controls h3{margin:0 0 6px;font:800 14px Inter}.controls p{margin:3px 0}@media(max-width:760px){.controls{grid-template-columns:1fr}}.settings label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-weight:700}#minimap.big{width:min(700px,90vw);height:min(350px,45vw);left:50%;top:50%;transform:translate(-50%,-50%)}body.scoped #app canvas{}body.scoped::after{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at center,transparent 0 30vh,#000 30.5vh);z-index:1}body.scoped::before{content:'';position:fixed;left:50%;top:0;bottom:0;width:1px;background:#000;z-index:2;box-shadow:0 0 0 0 #000}`;
document.head.appendChild(st);
const bindSet = (id, key, prop = 'value', conv = Number) => { const el = $(id); el[prop] = save.settings[key]; el.addEventListener('input', () => { save.settings[key] = conv(el[prop]); input.settings[key] = save.settings[key]; persist(); if (key === 'fps' && game) { game.cam.fps = save.settings.fps; game.viewGun(); } }); };
if (save.settings.killcam === undefined) save.settings.killcam = true; bindSet('s-killcam', 'killcam', 'checked', Boolean); bindSet('s-sens', 'sens'); bindSet('s-pad', 'padSens'); bindSet('s-assist', 'assist', 'checked', Boolean); bindSet('s-inv', 'invertY', 'checked', Boolean); bindSet('s-fps', 'fps', 'checked', Boolean); bindSet('s-dynres', 'dynres', 'checked', Boolean); bindSet('s-team', 'teamSize');
{ const el = $('s-quality'); el.value = save.settings.quality || 'auto'; el.addEventListener('change', () => { save.settings.quality = el.value; persist(); location.reload(); }); }
function openPause() { if (!game || game.over) return; game.paused = true; pause.classList.remove('hidden'); document.exitPointerLock?.(); $('s-fps').checked = game.cam.fps; }
function closePause() { pause.classList.add('hidden'); if (game) game.paused = false; renderer.domElement.requestPointerLock?.(); }
$('resume').addEventListener('click', closePause);
$('quit').addEventListener('click', () => { pause.classList.add('hidden'); endGame(null); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && game && !game.paused && !game.over && !input.st.usingPad && $('shop').classList.contains('hidden') && $('inv').classList.contains('hidden')) openPause(); });
renderer.domElement.addEventListener('click', () => { if (game && !game.paused) renderer.domElement.requestPointerLock?.(); });

// ---------- partie ----------
let game = null;
function start() {
  audio.init(); persist();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (game) { scene.remove(game.root); world.dynamic.length = 0; }
  game = new Game({ mapRoot, renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts: { teamSize: +(Q.get('n') || save.settings.teamSize), botSkill: 1, cars: carDefs, lod: QS.lod, lodShadow: QS.lodShadow } });
  game.onShop = openShop; game.onPause = openPause; game.onEnd = (r) => endGame(r);
  game.build(); window.__game = game;
  renderer.domElement.requestPointerLock?.();
}
function endGame(r) {
  document.exitPointerLock?.(); $('hud').classList.add('hidden'); audio.engine(false); renderer.domElement.style.filter = '';
  if (!r) { if (game) { scene.remove(game.root); world.dynamic.length = 0; game = null; } $('menu').classList.remove('hidden'); renderMenu(); return; }
  $('endTitle').textContent = r.draw ? 'ÉGALITÉ' : r.win ? 'VICTOIRE' : 'DÉFAITE';
  const s = r.stats; $('endStats').innerHTML = `<div>${r.score.ordre}<br><span>Brigade</span></div><div>—</div><div>${r.score.civils}<br><span>Frungz</span></div><div>${s.kills}<br><span>éliminations</span></div><div>${s.captures}<br><span>captures</span></div><div>${fmt(s.earned)} €<br><span>gagnés</span></div><div>${s.broken}<br><span>vitrines</span></div><div>${s.stolen}<br><span>vols</span></div><div>${s.deaths}<br><span>morts</span></div>`;
  $('end').classList.remove('hidden');
  if (game) { scene.remove(game.root); world.dynamic.length = 0; game = null; }
}
window.__start = start; window.__THREE = THREE;

// ---------- boucle ----------
const clock = new THREE.Clock(); let menuT = 0;
// résolution dynamique : baisse si on passe sous ~45 images/s, remonte quand il y a de la marge
let ftAvg = 1 / 60, ftT = 0, fpsShown = 0;
function dynRes(raw) {
  ftAvg += (Math.min(raw, 0.2) - ftAvg) * 0.05; ftT += raw; if (ftT < 1) return; ftT = 0;
  fpsShown = Math.round(1 / ftAvg); const el = $('s-fpsn'); if (el) el.textContent = fpsShown + ' (résolution ' + Math.round(prCur * 100) + ' %)';
  if (save.settings.dynres === false || !game || game.paused) return;
  let n = prCur; if (ftAvg > 1 / 45) n = Math.max(QS.prMin, prCur - 0.1); else if (ftAvg < 1 / 57) n = Math.min(prMax, prCur + 0.05);
  if (Math.abs(n - prCur) > 0.01) { prCur = n; renderer.setPixelRatio(prCur); composer?.setPixelRatio?.(prCur); }
}
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(); dynRes(raw); const dt = Math.min(raw, 0.05);
  if (game) {
    night?.update(dt, camera.position, game.cars);
    if (!game.paused) { game.update(dt); }
    else { input.poll(); if (input.pressed('pause') && !pause.classList.contains('hidden')) closePause(); else if (!input.st.usingPad && input.pressed('shop') && !$('shop').classList.contains('hidden')) closeShop(); else padMenu(dt); input.endFrame(); }
  } else if (world) {
    // menu : survol lent de la place
    menuT += dt * 0.04; camera.position.set(Math.cos(menuT) * 150, 55, Math.sin(menuT) * 150); camera.lookAt(0, 4, 0); // au-dessus des toits, jamais dans les bâtiments followShadow(camera.position);
    input.poll(); padMenu(dt); input.endFrame(); night?.update(dt, camera.position, null);
  }
  if (composer) composer.render(); else renderer.render(scene, camera); window.__frames = (window.__frames || 0) + 1;
}
renderMenu(); frame();
loadAll().catch((e) => { $('loadtxt').textContent = 'Erreur de chargement : ' + e.message; console.error(e); });
