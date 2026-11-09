// Point d'entrée : chargement, menu (camp, skin), armurerie, réglages, partie, écran de fin.
import * as THREE from 'three';
import { setupScene, loadMap, World, loader } from './world.js';
import { loadChars, loadGuns, makeCharacter, attachGun } from './assets.js';
import { createAudio } from './audio.js';
import { createFX } from './fx.js';
import { createInput } from './input.js';
import { Game } from './game.js';
import { TEAMS, WEAPONS, UPGRADES, SKIN_NAMES } from './data.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const Q = new URLSearchParams(location.search);

// ---------- sauvegarde ----------
const DEFAULT = { bank: 0, unlocked: ['pistol'], primary: null, upgrades: {}, xp: 0, lvl: 1, team: 'civils', skin: 'Punk', settings: { sens: 1, padSens: 1, assist: true, fps: false, teamSize: 50, invertY: false, shadows: true, post: true } };
let save; try { save = { ...DEFAULT, ...JSON.parse(localStorage.getItem('frungz-save') || '{}') }; save.settings = { ...DEFAULT.settings, ...save.settings }; save.upgrades ||= {}; } catch { save = structuredClone(DEFAULT); }
const persist = () => { try { localStorage.setItem('frungz-save', JSON.stringify(save)); } catch {} };
if ((save.sv || 1) < 2) { save.sv = 2; save.settings.teamSize = 50; } // passage au 50 contre 50 par défaut

// ---------- rendu ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.has('lowres') ? 1 : 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = save.settings.shadows && !Q.has('noshadow'); renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
const { scene, sun, followShadow } = setupScene(renderer);
const pm = new THREE.PMREMGenerator(renderer);
import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35; });
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1700); scene.add(camera);
// post-traitement : bloom léger (éclairs de bouche, néons, soleil), étalonnage et vignette dans un seul passage final
let composer = null;
async function setupPost() {
  if (Q.has('nopost') || save.settings.post === false) return;
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
let world, mapRoot, carDefs = [];
let progress = { map: 0, chars: 0, guns: 0, cars: 0 };
const showProgress = () => { const p = progress.map * 0.6 + progress.chars / ALL_SKINS.length * 0.25 + progress.guns / 6 * 0.05 + progress.cars / CARS.length * 0.1; $('loadbar').style.width = (p * 100).toFixed(0) + '%'; };
async function loadAll() {
  const gp = await fetch('assets/gameplay.json').then((r) => r.json());
  const [{ root, ground }] = await Promise.all([
    loadMap('assets/map.glb', (p) => { progress.map = p; showProgress(); }),
    loadChars(ALL_SKINS, () => { progress.chars++; showProgress(); }),
    loadGuns(() => { progress.guns++; showProgress(); }),
    Promise.all(CARS.map(async ([f, classe, nom]) => { try { const g = await loader.loadAsync(`assets/cars/${f}.glb`); const s = g.scene; const box = new THREE.Box3().setFromObject(s); const sz = s.userData.size || [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]; carDefs.push({ scene: s, classe, nom, size: sz }); } catch (e) { console.warn('voiture', f, e); } progress.cars++; showProgress(); })),
  ]);
  $('loadtxt').textContent = 'Préparation du quartier…'; await new Promise((r) => setTimeout(r, 30));
  mapRoot = root; scene.add(root);
  world = new World(gp, ground);
  $('loading').classList.add('hidden'); $('play').disabled = false;
  window.__loaded = true;
}

// ---------- menu ----------
let preview = null;
function renderMenu() {
  document.querySelectorAll('.side').forEach((b) => b.classList.toggle('on', b.dataset.team === save.team));
  const skins = TEAMS[save.team].skins; if (!skins.includes(save.skin)) save.skin = skins[0];
  $('skins').innerHTML = skins.map((s) => `<button data-skin="${s}" class="${s === save.skin ? 'on' : ''}">${SKIN_NAMES[s] || s}</button>`).join('');
  $('bank').textContent = fmt(save.bank); $('lvl').textContent = save.lvl || 1;
}
document.querySelectorAll('.side').forEach((b) => b.addEventListener('click', () => { save.team = b.dataset.team; persist(); renderMenu(); audio.init(); audio.play('uiSelect'); }));
$('skins').addEventListener('click', (e) => { const s = e.target.dataset?.skin; if (!s) return; save.skin = s; persist(); renderMenu(); audio.init(); audio.play('uiTick'); });
$('play').disabled = true;
$('play').addEventListener('click', () => start());
$('openShop').addEventListener('click', () => openShop());
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

// ---------- pause et réglages ----------
const pause = document.createElement('div'); pause.id = 'pause'; pause.className = 'screen panel hidden';
pause.innerHTML = `<h2>PAUSE</h2>
<div class="settings">
<label>Sensibilité souris <input type="range" min="0.3" max="3" step="0.05" id="s-sens"></label>
<label>Sensibilité manette <input type="range" min="0.3" max="3" step="0.05" id="s-pad"></label>
<label><input type="checkbox" id="s-assist"> Visée assistée (manette)</label>
<label><input type="checkbox" id="s-inv"> Inverser l'axe vertical</label>
<label><input type="checkbox" id="s-fps"> Vue première personne (V / R3)</label>
<label><input type="checkbox" id="s-shadows"> Ombres (recharger)</label>
<label><input type="checkbox" id="s-post"> Effets visuels : bloom, étalonnage (recharger)</label>
<label>Joueurs par camp (prochaine partie) <select id="s-team"><option value="5">5 contre 5</option><option value="10">10 contre 10</option><option value="15">15 contre 15</option><option value="20">20 contre 20</option><option value="35">35 contre 35</option><option value="50">50 contre 50</option></select></label>
</div>
<div class="row-btns"><button class="big" id="resume">REPRENDRE</button><button class="ghost" id="quit">Quitter la partie</button></div>
<p class="small">Manette PS4 : branche-la et appuie sur un bouton. Options = pause.</p>`;
document.body.appendChild(pause);
const st = document.createElement('style'); st.textContent = `.settings{display:grid;gap:10px;text-align:left;background:rgba(255,255,255,.06);padding:16px;border-radius:12px;min-width:min(420px,100%)}.settings label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-weight:700}#minimap.big{width:min(700px,90vw);height:min(350px,45vw);left:50%;top:50%;transform:translate(-50%,-50%)}body.scoped #app canvas{}body.scoped::after{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at center,transparent 0 30vh,#000 30.5vh);z-index:1}body.scoped::before{content:'';position:fixed;left:50%;top:0;bottom:0;width:1px;background:#000;z-index:2;box-shadow:0 0 0 0 #000}`;
document.head.appendChild(st);
const bindSet = (id, key, prop = 'value', conv = Number) => { const el = $(id); el[prop] = save.settings[key]; el.addEventListener('input', () => { save.settings[key] = conv(el[prop]); input.settings[key] = save.settings[key]; persist(); if (key === 'fps' && game) { game.cam.fps = save.settings.fps; game.viewGun(); } }); };
bindSet('s-sens', 'sens'); bindSet('s-pad', 'padSens'); bindSet('s-assist', 'assist', 'checked', Boolean); bindSet('s-inv', 'invertY', 'checked', Boolean); bindSet('s-fps', 'fps', 'checked', Boolean); bindSet('s-shadows', 'shadows', 'checked', Boolean); bindSet('s-post', 'post', 'checked', Boolean); bindSet('s-team', 'teamSize');
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
  game = new Game({ mapRoot, renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts: { teamSize: +(Q.get('n') || save.settings.teamSize), botSkill: 1, cars: carDefs } });
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
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (game) {
    if (!game.paused) { game.update(dt); }
    else { input.poll(); if (input.pressed('pause') && !pause.classList.contains('hidden')) closePause(); else if (input.pressed('shop') && !$('shop').classList.contains('hidden')) closeShop(); input.endFrame(); }
  } else if (world) {
    // menu : survol lent de la place
    menuT += dt * 0.05; camera.position.set(Math.cos(menuT) * 38, 16, Math.sin(menuT) * 22); camera.lookAt(0, 3, 0); followShadow(camera.position);
    input.poll(); if (input.st.usingPad && input.pressed('jump') && !$('menu').classList.contains('hidden') && !$('play').disabled) start(); input.endFrame();
  }
  if (composer) composer.render(); else renderer.render(scene, camera); window.__frames = (window.__frames || 0) + 1;
}
renderMenu(); frame();
loadAll().catch((e) => { $('loadtxt').textContent = 'Erreur de chargement : ' + e.message; console.error(e); });
