// Point d'entrée : chargement, menu (camp, skin), armurerie, réglages, partie, écran de fin.
import * as THREE from 'three';
import { setupScene, loadMap, loadGLB, World, loader } from './world.js';
import { loadGuns, makeCharacter, attachGun, chars, loadMx } from './assets.js';
import { loadSkinBases, registerSkin, BUILTIN_SKINS, userSkins } from './skins.js';
import { createAudio } from './audio.js';
import { createFX } from './fx.js';
import { createInput } from './input.js';
import { createNight } from './night.js';
import { createCassables } from './cassables.js';
import { createMetro } from './metro.js';
import { Game } from './game.js';
import { createPreview } from './preview.js';
import { createLobby } from './lobby.js';
import { applyRealism, skyEnvironment, realismUniforms } from './realisme.js';
import { skyReflections, enhanceMap, enhanceCar } from './photo.js';
import { TEAMS, WEAPONS, WEAPON_CATS, CLASSES, classOf, classWeapons, kitOf, UPGRADES, SKIN_NAMES } from './data.js';
import { svg } from './icons.js';
import { createNet, ONLINE_MAX_TEAM } from './net.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const Q = new URLSearchParams(location.search);

// ---------- sauvegarde ----------
const DEFAULT = { bank: 0, unlocked: ['pistol'], primary: null, cls: { ordre: 'intervention', civils: 'casseur' }, upgrades: {}, xp: 0, lvl: 1, team: 'civils', skin: 'Bloc_Cagoule', settings: { sens: 1, padSens: 1, assist: true, fps: false, teamSize: 50, invertY: false, dynres: true } };
const SAVE_KEY = 'frungz-save' + (Q.get('profil') ? '-' + Q.get('profil').replace(/\W/g, '').slice(0, 12) : ''); // ?profil=x : une autre sauvegarde (tester à plusieurs dans le même navigateur)
let save; try { save = { ...DEFAULT, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; save.settings = { ...DEFAULT.settings, ...save.settings }; save.upgrades ||= {}; save.cls = { ...DEFAULT.cls, ...save.cls }; save.kit ||= {}; } catch { save = structuredClone(DEFAULT); }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {} };
if ((save.sv || 1) < 2) { save.sv = 2; save.settings.teamSize = 50; } // passage au 50 contre 50 par défaut

// ---------- cartes ----------
// deux maps au même format (glb + gameplay.json) : on en charge une seule ; en changer recharge la page
const MAPS = {
  paris: { nom: 'Place Frungz', court: 'Paris', desc: 'cœur de Paris', glb: 'assets/map.glb', gp: 'assets/gameplay.json' },
  banlieue: { nom: 'Les Hauts de Frungz', court: 'Banlieue', desc: 'banlieue parisienne', glb: 'assets/banlieue/map.glb', gp: 'assets/banlieue/gameplay.json' },
};
const MAP_ID = MAPS[Q.get('map')] ? Q.get('map') : MAPS[save.settings.map] ? save.settings.map : 'paris';
const MAP = MAPS[MAP_ID]; window.__map = MAP_ID;
// change de carte : mémorisée, puis rechargement (en ligne, l'invité garde son salon : ?equipe=)
function switchMap(id, room) {
  if (!MAPS[id] || id === MAP_ID) return; save.settings.map = id; persist();
  const q = new URLSearchParams(location.search); q.delete('map'); if (room) q.set('equipe', room);
  $('menu')?.classList.remove('ready'); const lt = $('loadtxt'); if (lt) lt.textContent = 'Changement de carte…'; $('loading')?.classList.remove('hidden');
  location.href = location.pathname + (q.toString() ? '?' + q.toString() : '');
}

// ---------- qualité graphique ----------
// préréglages : bas (PC modestes), moyen, haut ; « auto » choisit selon la carte graphique, puis la résolution s'adapte aux images/s
const QUALITY = {
  bas: { pr: 0.75, prMin: 0.5, aa: false, shadows: false, shadowSize: 1024, shadowHalf: 45, soft: false, post: false, far: 480, fog: [90, 380], lod: 90, lodShadow: 0 },
  moyen: { pr: 1, prMin: 0.6, aa: true, shadows: true, shadowSize: 1024, shadowHalf: 45, soft: false, post: false, far: 900, fog: [130, 520], lod: 150, lodShadow: 30 },
  haut: { pr: 1.5, prMin: 0.7, aa: true, shadows: true, shadowSize: 3072, shadowHalf: 60, soft: true, post: true, far: 1700, fog: [150, 620], lod: 200, lodShadow: 45 },
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
// tonalité : ACES (contraste de pellicule) ; ?tm=agx ou ?tm=neutral pour comparer
const TM = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping };
renderer.toneMapping = TM[Q.get('tm')] ?? THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = renderer.toneMapping === THREE.AgXToneMapping ? 1.25 : 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
$('app').appendChild(renderer.domElement);
const { scene, sun, hemi, sky, followShadow: followShadow0, setShadowFrame } = setupScene(renderer);
setShadowFrame(QS.shadowHalf, QS.shadowSize); sun.castShadow = QS.shadows; scene.fog.near = QS.fog[0]; scene.fog.far = QS.fog[1];
const pm = new THREE.PMREMGenerator(renderer);
// reflets : le ciel affiché lui-même (dégradé, soleil, nuages), fabriqué une fois
try { scene.environment = skyReflections(renderer, sky); scene.environmentIntensity = 0.7; } catch (e) { console.warn('ciel de reflets indisponible', e); try { scene.environment = skyEnvironment(renderer, {}); scene.environmentIntensity = 0.6; } catch {} }
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, QS.far); scene.add(camera);
// le cadre d'ombre est avancé vers ce que regarde la caméra : les ombres couvrent la rue devant soi, pas derrière
const _fw = new THREE.Vector3();
const followShadow = (p) => { camera.getWorldDirection(_fw); _fw.y = 0; const L = _fw.length(); if (L > 1e-3 && Number.isFinite(L)) _fw.multiplyScalar(QS.shadowHalf * 0.3 / L); else _fw.set(0, 0, 0); followShadow0(p, _fw); };
// post-traitement : bloom léger (éclairs de bouche, néons, soleil), étalonnage et vignette dans un seul passage final
let composer = null, cine = null, grade = null, photo = null;
async function setupPost() {
  if (!QS.post) return;
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { ShaderPass }] = await Promise.all([
    import('three/examples/jsm/postprocessing/EffectComposer.js'), import('three/examples/jsm/postprocessing/RenderPass.js'), import('three/examples/jsm/postprocessing/UnrealBloomPass.js'), import('three/examples/jsm/postprocessing/OutputPass.js'), import('three/examples/jsm/postprocessing/ShaderPass.js')]);
  const { CinePass } = await import('./cine.js');
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  // garde-fou : un seul pixel invalide (NaN ou infini, par exemple un éclat trop fort près d'une explosion) est étalé par le flou du bloom
  // et noircit un grand rectangle de l'écran pendant quelques images ; le passage cinéma les neutralise et borne la luminosité avant le bloom.
  // Il ajoute le flou de mouvement de caméra et la profondeur de champ en visée (src/cine.js), grâce à la profondeur de la scène.
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height); rt.depthTexture.type = THREE.UnsignedIntType; }
  // passe photoréaliste (src/photo.js) : occlusion ambiante et perspective atmosphérique, juste après le rendu de la scène
  const { PhotoPass } = await import('./photo.js');
  photo = new PhotoPass(camera, { sky, sun, scene }); photo.enabled2 = save.settings.photo !== false && !Q.has('nophoto'); composer.addPass(photo); window.__photo = photo;
  cine = new CinePass(camera); cine.photo = photo; cine.enabled2 = save.settings.cine !== false && !Q.has('nocine'); composer.addPass(cine); window.__cine = cine;
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.92); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // étalonnage : légère courbe en S, ombres un peu froides, hautes lumières chaudes, vignette douce
  // étalonnage : légère courbe en S, ombres un peu froides, hautes lumières chaudes, vignette douce ; touche « pellicule » :
  // grain fin animé et légère aberration chromatique sur les bords de l'objectif (coupés avec le reste du rendu cinéma)
  grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uFilm: { value: 1 }, uNight: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uFilm, uNight; varying vec2 vUv;
      void main(){ vec2 d = vUv - 0.5; vec3 c = texture2D(tDiffuse, vUv).rgb;
        if (uFilm > 0.01) { vec2 o = d * dot(d, d) * 0.012 * uFilm; c.r = texture2D(tDiffuse, vUv + o).r; c.b = texture2D(tDiffuse, vUv - o).b; }
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.22); c += vec3(-0.012, 0.0, 0.018) * (1.0 - l) + vec3(0.02, 0.008, -0.012) * l;
        c = mix(vec3(l), c, 1.08);
        // nuit lisible : les ombres profondes sont relevées vers un bleu nuit (on voit les silhouettes), vignette plus légère
        if (uNight > 0.01) { vec3 lift = pow(max(c, vec3(0.0)), vec3(0.8)) + vec3(0.006, 0.012, 0.03) * (1.0 - l); c = mix(c, lift, uNight); }
        c *= 1.0 - dot(d, d) * mix(0.55, 0.35, uNight);
        float g = fract(sin(dot(floor(gl_FragCoord.xy) + fract(uT) * 97.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        c += g * 0.028 * uFilm * (1.0 - 0.6 * l);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }` });
  composer.addPass(grade);
  // anticrénelage (les cibles du post-traitement n'ont pas de multi-échantillonnage) : FXAA sur l'image finale
  const { FXAAPass } = await import('three/examples/jsm/postprocessing/FXAAPass.js');
  const fxaa = new FXAAPass(); composer.addPass(fxaa); window.__fxaa = fxaa;
  window.__post = composer;
}
setupPost();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); });
const audio = createAudio(); const input = createInput(renderer.domElement); Object.assign(input.settings, save.settings);
const fx = createFX(scene, camera);

// ---------- chargement ----------
// skins : ceux du jeu + ceux créés dans le studio (/studio), fabriqués au chargement sur les deux mannequins
const MY_SKINS = userSkins().filter((s) => TEAMS[s.team]); for (const s of MY_SKINS) SKIN_NAMES[s.id] = s.name;
const ALL_SKINS = [...BUILTIN_SKINS, ...MY_SKINS];
const CARS = [['sportscar', 'sport', 'Coupé sport orange'], ['sportscar2', 'sport', 'Coupé sport blanc'], ['sports', 'sport', 'Coupé sport rouge'], ['roadster', 'sport', 'Cabriolet bleu'], ['muscle', 'sport', 'Muscle car jaune'], ['sports-armored', 'blinde', 'Sportive blindée'], ['cop', 'police', 'Voiture de police'], ['police-sedan', 'police', 'Berline de police'], ['suv-luxury', 'civil', 'SUV de luxe']];
let world, mapRoot, carDefs = [], night = null, lobby = null;
let progress = { map: 0, chars: 0, guns: 0, cars: 0 };
const showProgress = () => { const p = progress.map * 0.6 + progress.chars / ALL_SKINS.length * 0.25 + progress.guns / Object.keys(WEAPONS).length * 0.05 + progress.cars / CARS.length * 0.1; $('loadbar').style.width = (p * 100).toFixed(0) + '%'; };
async function loadAll() {
  const gp = await fetch(MAP.gp).then((r) => r.json());
  const [{ root, ground, cassables, rame }] = await Promise.all([
    loadMap(MAP.glb, (p) => { progress.map = p; showProgress(); }),
    Promise.all([loadSkinBases(), loadMx()]).then(([, mx]) => { for (const d of ALL_SKINS) { try { registerSkin(chars, d, mx, 1.8, { tex: 512 }); } catch (e) { console.warn('skin', d.id, e); } progress.chars++; showProgress(); } }),
    loadGuns(() => { progress.guns++; showProgress(); }),
    Promise.all(CARS.map(async ([f, classe, nom]) => { try { const g = await loadGLB(`assets/cars/${f}.glb`); const s = g.scene; if (QN !== 'bas') enhanceCar(s); const box = new THREE.Box3().setFromObject(s); const sz = s.userData.size || [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]; carDefs.push({ scene: s, classe, nom, size: sz }); } catch (e) { console.warn('voiture', f, e); } progress.cars++; showProgress(); })),
  ]);
  $('loadtxt').textContent = 'Préparation du quartier…'; await new Promise((r) => setTimeout(r, 30));
  mapRoot = root; scene.add(root);
  // matières réalistes (grain, salissures, coulures, chaussée mouillée par plaques) : sauf en qualité basse
  if (QN !== 'bas' && !Q.has('noreal')) { try { applyRealism(root, { wet: 0.4, presets: gp.realisme }); window.__real = realismUniforms; } catch (e) { console.warn('réalisme indisponible', e); } }
  // reflets réalistes des vitres, du zinc et de la ferronnerie ; textures nettes en vue rasante (filtrage anisotrope)
  if (QN !== 'bas') enhanceMap(root, renderer.capabilities.getMaxAnisotropy());
  // allègements selon la qualité : pas d'ombre des feuillages en moyenne, pas de décor lointain en basse (caché par le brouillard)
  root.traverse((o) => { if (!o.isMesh) return; const n = o.name || ''; if (QN !== 'haut' && /leaf/.test(n)) o.castShadow = false; if (QN === 'bas' && /decor_lointain/.test(n)) o.visible = false; });
  const tw = performance.now(); world = new World(gp, ground); console.log('monde prêt en', (performance.now() - tw).toFixed(0), 'ms'); window.__world = world; window.__ground = ground;
  const tc = performance.now(); world.cass = createCassables({ nodes: cassables, scene, world, fx, audio }); world.metro = createMetro({ rame, gp, audio }); world.cass.onBreak((e, by, d) => game?.onCassable(e, by, d)); console.log('cassables', world.cass.list.length, 'fusionnés en', world.cass.merged.length, 'maillages,', (performance.now() - tc).toFixed(0), 'ms');
  night = createNight({ scene, sun, hemi, renderer, world, mapRoot: root, fx, quality: QN, getPost: () => composer }); night.set(!!save.settings.night); window.__night = night;
  try { lobby = createLobby({ scene, camera, world, Q }); lobby.show(!game); window.__lobby = lobby; $('menu').classList.add('ready'); } catch (e) { console.warn('salon 3D indisponible', e); }
  renderMenu();
  $('loading').classList.add('hidden'); $('play').disabled = false; renderNet(); if (pendingStart) startGuest();
  window.__loaded = true;
}

// ---------- menu ----------
let preview = null;
function renderMenu() {
  document.querySelectorAll('.side').forEach((b) => b.classList.toggle('on', b.dataset.team === save.team));
  const skins = [...TEAMS[save.team].skins, ...MY_SKINS.filter((s) => s.team === save.team && (!window.__loaded || chars[s.id])).map((s) => s.id)]; if (!skins.includes(save.skin)) save.skin = skins[0];
  $('skins').innerHTML = skins.map((s) => `<button data-skin="${s}" class="${s === save.skin ? 'on' : ''}${s.startsWith('u_') ? ' mine' : ''}">${(SKIN_NAMES[s] || s).replace(/[<>&]/g, '')}</button>`).join('') + '<a class="studio-link" href="/studio/">Studio de skins</a>';
  const cur = classOf(save.team, save.cls[save.team]).id;
  $('classes').innerHTML = Object.values(CLASSES[save.team]).map((K) => `<button data-cls="${K.id}" class="${K.id === cur ? 'on' : ''}"><em>${svg(K.ico)}</em><b>${K.name}</b><small>${K.role}</small></button>`).join('');
  const K = classOf(save.team, cur), kit = kitOf(save, save.team, K), { prim, sec } = classWeapons(K, save.unlocked);
  const chip = (slot, id) => { const W = WEAPONS[id]; return `<button data-slot="${slot}" data-wid="${id}" class="${kit[slot] === id ? 'on' : ''}" title="${W.name}">${svg(W.ico)}<span>${W.name}</span>${K.primaries.includes(id) || slot === 's' && id !== 'revolver' ? '' : '<i>planque</i>'}</button>`; };
  $('clsInfo').innerHTML = `<div class="kitrow"><label>Arme principale</label>${prim.map((id) => chip('p', id)).join('')}</div><div class="kitrow"><label>Arme de poing</label>${sec.map((id) => chip('s', id)).join('')}</div>`
    + `<p><span>${svg('vest')} ${K.armor ? 'Gilet ' + K.armor : 'Sans gilet'}</span><span>${svg('target')} <b>${K.perkName}</b> : ${K.perkDesc}</span></p>`;
  $('nightBtn').classList.toggle('night', !!save.settings.night);
  { const W = WEAPONS[kit.p] || WEAPONS[K.primary]; $('ldIco').innerHTML = svg(K.ico); $('ldTeam').textContent = TEAMS[save.team].short + ' · ' + String(SKIN_NAMES[save.skin] || 'Tenue perso').split(' · ')[0]; $('ldClass').textContent = K.name; $('ldGun').textContent = `${W.name}${kit.s && WEAPONS[kit.s] ? ' + ' + WEAPONS[kit.s].name : ''}`; }
  $('mapName').textContent = MAP.nom.toUpperCase(); document.querySelectorAll('#mapBtn [data-map]').forEach((b) => b.classList.toggle('on', b.dataset.map === MAP_ID));
  $('bank').textContent = fmt(save.bank); $('lvl').textContent = save.lvl || 1;
  { const l = save.lvl || 1, a = 100 * (l - 1) ** 2, b = 100 * l ** 2; $('xpbar').style.width = Math.max(4, Math.min(100, ((save.xp || 0) - a) / (b - a) * 100)).toFixed(0) + '%'; }
  $('menu').classList.toggle('t-ordre', save.team === 'ordre'); $('invite').classList.toggle('t-ordre', save.team === 'ordre');
  $('modeLine').textContent = `Domination · ${save.settings.teamSize} contre ${save.settings.teamSize}${save.settings.night ? ' · de nuit' : ''}`;
  net.update(netMeta()); renderParty();
}
document.querySelectorAll('.side').forEach((b) => b.addEventListener('click', () => { if (net.guest) { $('inviteNote').textContent = 'En ligne, c\'est le chef qui choisit le camp de l\'équipe.'; return; } save.team = b.dataset.team; persist(); renderMenu(); audio.init(); audio.play('uiSelect'); }));
$('classes').addEventListener('click', (e) => { const b = e.target.closest('button[data-cls]'); if (!b) return; pickClass(b.dataset.cls); audio.init(); audio.play('uiTick'); });
// choisir une classe reprend ses armes (l'arme achetée reste dans la planque, à rééquiper à l'armurerie) ; en partie, elle s'applique au prochain retour
function pickClass(id) { save.cls[save.team] = id; persist(); renderMenu(); if (game?.player) game.toast(`Classe ${classOf(save.team, id).name} : au prochain retour dans la rue`, '#ccc'); }
$('clsInfo').addEventListener('click', (e) => { const b = e.target.closest('button[data-wid]'); if (!b) return; setKit(b.dataset.slot, b.dataset.wid); audio.init(); audio.play('uiTick'); });
// arme choisie pour la classe en cours ; en partie, elle passe tout de suite dans les mains si on joue cette classe
function setKit(slot, id) {
  const K = classOf(save.team, save.cls[save.team]), key = save.team + ':' + K.id; save.kit[key] = { ...kitOf(save, save.team, K), [slot]: id }; persist(); renderMenu();
  const a = game?.player; if (a?.alive && a.team === save.team && a.cls === K.id) { const i = slot === 's' ? 0 : 1; a.slots[i] = { id, rarity: 'rare', mag: WEAPONS[id].mag }; game.equip(a, i); }
}
$('skins').addEventListener('click', (e) => { const s = e.target.dataset?.skin; if (!s) return; save.skin = s; persist(); renderMenu(); audio.init(); audio.play('uiTick'); });
$('play').disabled = true;
$('play').addEventListener('click', () => start());
$('openShop').addEventListener('click', () => openShop());
// deux vues : Salon (l'équipe) et Casier (camp, classe, armes, tenue)
function setView(v) { const m = $('menu'); m.classList.toggle('v-salon', v === 'salon'); m.classList.toggle('v-casier', v === 'casier'); $('tabSalon').classList.toggle('on', v === 'salon'); $('tabCasier').classList.toggle('on', v === 'casier'); lobby?.setView(v); audio.init(); audio.play('uiTick'); }
window.__view = setView;
$('tabSalon').addEventListener('click', () => setView('salon')); $('tabCasier').addEventListener('click', () => setView('casier'));
$('loadoutBtn').addEventListener('click', () => setView('casier')); $('backSalon').addEventListener('click', () => setView('salon'));
$('mapBtn').addEventListener('click', (e) => { const b = e.target.closest('[data-map]'); if (!b || b.dataset.map === MAP_ID) return; if (net.guest) { $('inviteNote').textContent = 'En ligne, c\'est le chef qui choisit la carte.'; return; } audio.init(); audio.play('uiSelect'); switchMap(b.dataset.map, net.online ? net.room : null); });
$('nightBtn').addEventListener('click', () => { save.settings.night = !save.settings.night; persist(); night?.set(save.settings.night); renderMenu(); audio.init(); audio.play('uiTick'); });
$('closeShop').addEventListener('click', () => closeShop());
$('again').addEventListener('click', () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); lobby?.show(true); renderMenu(); });

// ---------- équipe du salon : toi + 3 places ----------
// En ligne : ouvrir « Inviter » ouvre ton salon (code FRZ-XXXX) ; tes amis qui ouvrent ton lien y entrent et prennent les places libres.
// Le chef (toi, si c'est ton code) lance la partie pour tout le monde. Les places qui restent libres peuvent prendre des équipiers IA.
const SQUAD_NAMES = { ordre: ['Brigadier Lenoir', 'Gardienne Diallo', 'Major Kessler'], civils: ['Nadia', 'Yanis', 'Sacha'] };
save.squad = Array.isArray(save.squad) ? save.squad.slice(0, 3) : [null, null, null]; while (save.squad.length < 3) save.squad.push(null);
if (!/^FRZ-[A-Z0-9]{4}$/.test(save.teamCode || '')) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; save.teamCode = 'FRZ-' + Array.from({ length: 4 }, () => A[Math.random() * A.length | 0]).join(''); }
persist();
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const net = createNet({ local: Q.get('net') === 'local' ? true : /^wss?:\/\//.test(Q.get('net') || '') ? Q.get('net') : false });
const myGun = () => { const T = save.team, K = classOf(T, save.cls[T]); return kitOf(save, T, K).p; };
const netMeta = () => ({ map: MAP_ID, pseudo: save.pseudo || 'Joueur', skin: save.skin, team: save.team, cls: classOf(save.team, save.cls[save.team]).id, gun: myGun() });
// amis connectés, sous la forme attendue par le salon 3D (tenue ramenée au camp de l'équipe)
function onlineFriends() {
  if (!net.online) return []; const T = save.team, skins = TEAMS[T].skins;
  return net.friends().slice(0, 3).map((m) => { const K = classOf(T, m.cls); return { skin: skins.includes(m.skin) ? m.skin : skins[0], team: T, gun: WEAPONS[m.gun] ? m.gun : K.primary, name: m.pseudo || 'Ami', cls: K.name, online: true, host: m.host, ingame: m.ingame }; });
}
// équipiers IA : seulement sur les places que les amis n'occupent pas (et jamais chez un invité, c'est le chef qui complète)
function squadMember(k) {
  if (net.guest) return null; const nf = onlineFriends().length; if (k < nf) return null;
  if (!save.squad[k]) return null; const T = save.team, skins = TEAMS[T].skins; const cl = Object.values(CLASSES[T]); const K = cl[(k * 3 + 1) % cl.length];
  const skin = skins.filter((s) => s !== save.skin)[k % (skins.length - 1)] || skins[0];
  return { skin, team: T, gun: K.primary, name: SQUAD_NAMES[T][k], cls: K.name };
}
window.__squad = () => [0, 1, 2].map(squadMember).filter(Boolean);
function partyList() { const fr = onlineFriends(); return [0, 1, 2].map((k) => fr[k] || squadMember(k)); }
function renderParty() {
  const T = save.team, K = classOf(T, save.cls[T]);
  const list = [{ skin: save.skin, team: T, gun: myGun() }, ...partyList()];
  lobby?.setParty(list, T);
  const n = list.filter(Boolean).length; $('squadN').textContent = n + '/4';
  const meSub = net.guest ? 'Prêt · ' + K.name : (net.online ? 'Chef · ' : 'Prêt · ') + K.name;
  const sub = (m) => m.online ? (m.host ? 'Chef · ' : 'En ligne · ') + m.cls : 'Équipier IA · ' + m.cls;
  $('plates').innerHTML = list.map((m, i) => i === 0
    ? `<div class="plate me" data-i="0"><span class="nm">${esc(save.pseudo || 'Toi')}</span><span class="sub ready">${meSub}</span></div>`
    : m ? `<div class="plate${m.online ? ' online' : ''}" data-i="${i}"><span class="nm">${esc(m.name)}</span><span class="sub${m.online ? ' ready' : ''}">${sub(m)}</span>${m.online ? '' : `<button class="x" data-rm="${i - 1}" title="Libérer la place">×</button>`}</div>`
      : `<div class="plate empty" data-i="${i}"><button class="addslot" data-add="${i - 1}" title="Inviter un ami">+</button><small>Inviter</small></div>`).join('');
  $('slotList').innerHTML = `<div class="slotrow me"><span class="n">1</span><div><b>${esc(save.pseudo || 'Toi')}</b><small>${net.guest ? 'toi · invité' : 'chef d\'équipe'} · ${K.name}</small></div></div>` + list.slice(1).map((m, k) =>
    `<div class="slotrow"><span class="n">${k + 2}</span><div><b>${m ? esc(m.name) : 'Place libre'}</b><small>${m ? sub(m) : 'en attente d\'un ami'}</small></div>${m?.online || net.guest ? '' : `<button data-${m ? 'rm' : 'bot'}="${k}">${m ? 'Retirer' : 'Équipier IA'}</button>`}</div>`).join('');
  renderNet();
}
// état du salon en ligne : texte d'aide, bouton JOUER (un invité attend que son chef lance)
function renderNet() {
  const note = $('inviteNote'), play = $('play'); if (!note || !play) return;
  const host = net.hostMember(), nf = net.online ? net.friends().length : 0;
  if (net.status === 'joining') note.textContent = 'Connexion au salon…';
  else if (net.status === 'error') note.textContent = 'Impossible de joindre le salon en ligne. Vérifie ta connexion puis réessaie.';
  else if (net.guest) note.textContent = host ? `Tu es dans l'équipe ${net.room} de ${host.pseudo}. ${host.ingame ? 'Une partie est en cours : tu entreras à la suivante.' : 'Le chef lance la partie quand tout le monde est là.'}` : `Salon ${net.room} : en attente du chef d'équipe (il doit ouvrir son salon)…`;
  else if (net.online) note.textContent = nf ? `Salon ouvert · ${nf} ami${nf > 1 ? 's' : ''} connecté${nf > 1 ? 's' : ''}. Lance la partie quand vous êtes prêts.` : 'Salon ouvert : envoie le lien à tes amis. Ils apparaîtront ici dès qu\'ils l\'ouvrent.';
  else note.textContent = 'Ouvre ton salon pour inviter des amis, ou complète ton équipe avec des équipiers IA.';
  const sp = play.querySelector('span');
  if (net.guest) { play.disabled = true; sp.textContent = host?.ingame ? 'PARTIE EN COURS' : 'EN ATTENTE DU CHEF'; play.classList.add('wait'); }
  else { play.disabled = !world; sp.textContent = 'JOUER'; play.classList.remove('wait'); }
  $('netLeave')?.classList.toggle('hidden', !net.guest); $('fillBots')?.classList.toggle('hidden', net.guest);
  const soon = document.querySelector('#invite .soon'); if (soon) soon.textContent = net.online ? 'en ligne' : 'hors ligne';
  const sq = document.querySelector('.squadline span'); if (sq) sq.textContent = net.online ? (net.guest ? 'équipe en ligne' : 'dans ton salon') : 'dans ton équipe';
}
net.on.presence = () => {
  // un invité suit le camp de son chef
  const h = net.hostMember(); if (net.guest && h && h.team && h.team !== save.team && TEAMS[h.team]) { save.team = h.team; persist(); renderMenu(); }
  if (net.guest && h && MAPS[h.map] && h.map !== MAP_ID) switchMap(h.map, net.room); // l'invité passe sur la carte de son chef
  renderParty();
};
net.on.status = () => renderNet();
// le chef a disparu du salon : on attend un peu (une coupure réseau d'une seconde ne doit pas arrêter la partie)
net.on.hostLeft = () => { clearTimeout(net._hl); net._hl = setTimeout(() => { if (!net.guest || net.hostMember()) return; if (game) endGame(null); renderParty(); $('inviteNote').textContent = 'Le chef d\'équipe a quitté le salon.'; }, 8000); renderParty(); };
net.on.back = () => { if (game) { endGame(null); openInvite(); $('inviteNote').textContent = 'Le chef d\'équipe a quitté la partie : retour au salon.'; } };
net.on.start = (m) => { pendingStart = m; if (world) startGuest(); };
let pendingStart = null;
function goOnline(code, host) { audio.init(); net.join(code, { host, meta: netMeta() }); renderNet(); }
function placePlates() {
  if (!lobby?.visible || $('menu').classList.contains('hidden')) return;
  const A = lobby.anchors(innerWidth, innerHeight);
  for (const el of $('plates').children) { const a = A[+el.dataset.i]; if (!a) continue; const y = el.classList.contains('empty') ? (a.y + a.fy) / 2 : a.y; el.style.left = a.x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px'; el.style.opacity = a.vis ? 1 : 0; }
}
// ouvrir l'équipe ouvre aussi ton salon en ligne (sauf si tu es déjà dans celui d'un ami)
function openInvite() { $('pseudo').value = save.pseudo || ''; $('teamCode').textContent = net.room && !net.host ? net.room : save.teamCode; if (!net.online && net.status !== 'joining') goOnline(save.teamCode, true); renderParty(); $('invite').classList.remove('hidden'); audio.init(); audio.play('uiSelect'); }
function closeInvite() { $('invite').classList.add('hidden'); renderParty(); }
const inviteLink = () => `${location.origin}${location.pathname}?equipe=${net.guest ? net.room : save.teamCode}`;
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
const flashBtn = (b, txt) => { const o = b.dataset.o || (b.dataset.o = b.textContent); b.textContent = txt; clearTimeout(b._t); b._t = setTimeout(() => (b.textContent = o), 1600); };
const partyClick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.add != null) return openInvite();
  if (b.dataset.rm != null) save.squad[+b.dataset.rm] = null; else if (b.dataset.bot != null) save.squad[+b.dataset.bot] = { bot: true }; else return;
  persist(); renderParty(); audio.init(); audio.play('uiTick');
};
$('plates').addEventListener('click', partyClick); $('slotList').addEventListener('click', partyClick);
$('openInvite').addEventListener('click', openInvite); $('closeInvite').addEventListener('click', closeInvite);
$('invite').addEventListener('click', (e) => { if (e.target.id === 'invite') closeInvite(); });
$('fillBots').addEventListener('click', () => { if (net.guest) return; save.squad = save.squad.map((m) => m || { bot: true }); persist(); renderParty(); audio.play('uiSelect'); });
$('pseudo').addEventListener('input', () => { save.pseudo = $('pseudo').value.replace(/[<>&"]/g, '').trim().slice(0, 16); persist(); net.update(netMeta()); renderParty(); });
$('copyLink').addEventListener('click', async () => flashBtn($('copyLink'), (await copyText(inviteLink())) ? 'Lien copié !' : (net.room || save.teamCode)));
$('shareLink').addEventListener('click', async () => { const url = inviteLink(), code = net.room || save.teamCode; if (navigator.share) { try { await navigator.share({ title: 'Frungz', text: `Rejoins mon équipe sur Frungz : ${code}`, url }); } catch {} } else flashBtn($('shareLink'), (await copyText(url)) ? 'Lien copié !' : code); });
function joinCode(c) {
  c = (c || '').trim().toUpperCase(); $('joinCode').value = c;
  if (!/^FRZ-[A-Z0-9]{4}$/.test(c)) { $('inviteNote').textContent = 'Un code d\'équipe ressemble à FRZ-7K2Q.'; return; }
  goOnline(c, c === save.teamCode); $('teamCode').textContent = c;
}
$('joinBtn').addEventListener('click', () => joinCode($('joinCode').value));
$('netLeave')?.addEventListener('click', () => { net.leave(); $('teamCode').textContent = save.teamCode; goOnline(save.teamCode, true); renderParty(); });
if (Q.get('equipe')) { const c = Q.get('equipe').toUpperCase().slice(0, 8); $('joinCode').value = c; setTimeout(() => { joinCode(c); openInvite(); }, 50); }
$('openSettings').addEventListener('click', () => openSettings());
// glisser sur le décor pour faire tourner ton perso
{ let px = null; const m = $('menu');
  m.addEventListener('pointerdown', (e) => { if (e.target === m) { px = e.clientX; m.setPointerCapture?.(e.pointerId); } });
  m.addEventListener('pointermove', (e) => { if (px == null) return; lobby?.drag(e.clientX - px); px = e.clientX; });
  const up = () => (px = null); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up); }

// ---------- armurerie ----------
function openShop() {
  audio.init(); $('shop').classList.remove('hidden'); document.exitPointerLock?.(); if (game) game.paused = true; renderShop();
}
function closeShop() { $('shop').classList.add('hidden'); pv?.stop(); if (game && !game.over) { game.paused = false; renderer.domElement.requestPointerLock?.(); } }
let pv = null, pvSel = null;
function stat(label, v, txt) { return `<div class="st"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i><em>${txt}</em></div>`; }
// fiche de l'objet affiché en grand (modèle 3D qui tourne + caractéristiques)
function showPv(k, id) {
  if (!pv) return; pvSel = [k, id];
  if (k === 'w') {
    const W = WEAPONS[id], K = classOf(save.team, save.cls[save.team]), kit = kitOf(save, save.team, K), free = K.primaries.includes(id) || (W.cat === 'pistolet' && id !== 'revolver'), owned = free || save.unlocked.includes(id);
    pv.show('w', id);
    $('pvinfo').innerHTML = `<h3>${svg(W.ico)} ${W.name}</h3><p class="pvtag">${kit.p === id || kit.s === id ? 'Équipée' : free ? 'Arme de la classe ' + K.name : owned ? 'Dans ta planque' : fmt(W.price) + ' €'}${W.scope ? ' · lunette ×4 / ×8' : ''}${W.auto ? ' · automatique' : W.burst ? ' · rafale de ' + W.burst : ''}${W.proj ? ' · explosif, rayon ' + W.proj.R + ' m, casse le décor' : W.veh > 1 ? ' · perce-blindage' : ''}</p>`
      + stat('Dégâts', (W.dmg * W.pellets) / 120, W.dmg + (W.pellets > 1 ? '×' + W.pellets : ''))
      + stat('Cadence', (W.burst ? W.burst / (W.burst / W.rps + (W.burstPause || 0.25)) : W.rps) / 12, (W.burst ? (W.burst / (W.burst / W.rps + (W.burstPause || 0.25))).toFixed(1) : W.rps) + ' coups/s')
      + stat('Précision', 1 - Math.sqrt(W.spread / 0.08), '')
      + stat('Portée', W.range / 220, W.range + ' m')
      + stat('Chargeur', W.mag / 32, W.ammo ? W.mag + ' × ' + W.ammo : W.mag + ' balles')
      + stat('Rechargement', 1 - (W.reload - 1) / 2, W.reload + ' s')
      + stat('Mobilité', (W.mob - 0.8) / 0.3, Math.round(W.mob * 100) + ' %');
  } else if (k === 'c') {
    const K = classOf(save.team, id), kit = kitOf(save, save.team, K), P = WEAPONS[kit.p], S = WEAPONS[kit.s];
    pv.show('w', kit.p);
    $('pvinfo').innerHTML = `<h3>${svg(K.ico)} ${K.name}</h3><p class="pvtag">${K.role}${save.cls[save.team] === id ? ' · ta classe' : ''}</p><p class="pvdesc">${svg(P.ico)} ${P.name} · ${svg(S.ico)} ${S.name}</p><p class="pvdesc"><b>${K.perkName}</b> : ${K.perkDesc}</p><p class="pvdesc">Au choix : ${K.primaries.map((x) => WEAPONS[x].name).join(', ')}</p>`
      + stat('Protection', K.armor / 100, K.armor ? K.armor + ' / 100' : 'aucune') + stat('Vitesse', (K.speed - 0.8) / 0.35, Math.round(K.speed * 100) + ' %') + stat('Grenades', (K.nades + K.frags) / 4, `${K.nades} ${save.team === 'ordre' ? 'lacrymo' : 'fumigène'}${K.nades > 1 ? 's' : ''} · ${K.frags} grenade${K.frags > 1 ? 's' : ''}`);
  } else {
    const U = UPGRADES[id], l = save.upgrades[id] || 0;
    pv.show('u', id, id === 'gilet' ? Math.max(1, Math.min(U.max, l + 1)) : 0);
    const pips = Array.from({ length: U.max }, (_, i) => `<b class="${i < l ? 'on' : ''}"></b>`).join('');
    const next = id === 'gilet' ? `Armure au départ : ${25 * l} → ${25 * Math.min(U.max, l + 1)}` : U.desc;
    $('pvinfo').innerHTML = `<h3>${svg(U.ico)} ${U.name}</h3><p class="pvtag">${l >= U.max ? 'Niveau maximum' : 'Niveau ' + (l + 1) + ' : ' + fmt(U.price(l)) + ' €'}</p><div class="pips">${pips}</div><p class="pvdesc">${next}</p>${id === 'gilet' ? stat('Protection', (25 * l) / 100, 25 * l + ' / 100') : ''}`;
  }
}
function renderShop() {
  document.querySelectorAll('.bankN').forEach((e) => (e.textContent = fmt(save.bank)));
  if (!pv) { try { pv = createPreview(); $('pvbox').prepend(pv.canvas); } catch (e) { console.warn('aperçu 3D indisponible', e); $('shopPv').style.display = 'none'; } }
  const th = (k, id, l) => { const u = pv?.thumb(k, id, l); return u ? `<img class="th" src="${u}" alt="">` : ''; };
  const head = (t) => `<h4 class="shead">${t}</h4>`;
  const curCls = classOf(save.team, save.cls[save.team]).id;
  const c = [head('Classes ' + TEAMS[save.team].short)].concat(Object.values(CLASSES[save.team]).map((K) => `<div class="card cls ${K.id === curCls ? 'owned' : ''}" data-k="c" data-id="${K.id}" style="--c:${K.id === curCls ? '#2f6' : TEAMS[save.team].color}">${th('w', kitOf(save, save.team, K).p, 0)}<b>${svg(K.ico)} ${K.name}</b><small>${K.role} · ${WEAPONS[kitOf(save, save.team, K).p].name} · ${K.perkName}</small><button data-c="${K.id}">${K.id === curCls ? 'Ta classe ' + svg('check') : 'Choisir'}</button></div>`));
  const w = [], CK = classOf(save.team, curCls), ckit = kitOf(save, save.team, CK);
  for (const [cat, label] of Object.entries(WEAPON_CATS)) {
    const list = Object.entries(WEAPONS).filter(([id, W]) => W.cat === cat); if (!list.length) continue;
    w.push(head(label));
    for (const [id, W] of list) {
      const free = CK.primaries.includes(id) || (cat === 'pistolet' && id !== 'revolver'), owned = free || save.unlocked.includes(id), eq = ckit.p === id || ckit.s === id;
      w.push(`<div class="card ${owned ? 'owned' : ''}" data-k="w" data-id="${id}" style="--c:${owned ? '#2f6' : '#777'}">${th('w', id, 0)}<b>${svg(W.ico)} ${W.name}</b><small>Dégâts ${W.dmg}${W.pellets > 1 ? '×' + W.pellets : ''} · ${W.burst ? 'rafale ×' + W.burst : W.rps + ' coups/s'} · ${W.proj ? 'zone ' + W.proj.R + ' m · ' + W.mag + ' × ' + W.ammo : 'chargeur ' + W.mag}</small><button data-w="${id}" ${!owned && save.bank < W.price ? 'disabled' : ''}>${owned ? (eq ? 'Équipée ' + svg('check') : 'Équiper') : fmt(W.price) + ' €'}</button>${free && cat !== 'pistolet' ? '<em class="free">' + CK.name + '</em>' : ''}</div>`);
    }
  }
  w.push(head('Planque'));
  const u = Object.entries(UPGRADES).map(([id, U]) => { const l = save.upgrades[id] || 0; const max = l >= U.max; const p = U.price(l); return `<div class="card" data-k="u" data-id="${id}" style="--c:#57b6ff">${th('u', id, id === 'gilet' ? Math.max(1, l) : 0)}<b>${svg(U.ico)} ${U.name} · niv. ${l}/${U.max}</b><small>${U.desc}</small><button data-u="${id}" ${max || save.bank < p ? 'disabled' : ''}>${max ? 'Maximum' : fmt(p) + ' €'}</button></div>`; });
  $('shopList').innerHTML = c.join('') + w.join('') + u.join('');
  const sel = pvSel || ['w', ckit.p];
  showPv(sel[0], sel[1]); markSel();
  pv?.start();
}
function markSel() { document.querySelectorAll('#shopList .card').forEach((c) => c.classList.toggle('sel', !!pvSel && c.dataset.k === pvSel[0] && c.dataset.id === pvSel[1])); }
// survol à la souris ou focus à la manette : l'aperçu suit
function pvFrom(el) { const c = el?.closest?.('#shopList .card'); if (c && (!pvSel || pvSel[0] !== c.dataset.k || pvSel[1] !== c.dataset.id)) { showPv(c.dataset.k, c.dataset.id); markSel(); } }
$('shopList').addEventListener('pointerover', (e) => pvFrom(e.target));
$('shopList').addEventListener('focusin', (e) => pvFrom(e.target));
$('shopList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.c) { pickClass(b.dataset.c); }
  if (b.dataset.w) { const id = b.dataset.w; const K = classOf(save.team, save.cls[save.team]), free = K.primaries.includes(id) || (WEAPONS[id].cat === 'pistolet' && id !== 'revolver'); if (!free && !save.unlocked.includes(id)) { save.bank -= WEAPONS[id].price; save.unlocked.push(id); audio.cash(true); } setKit(WEAPONS[id].cat === 'pistolet' ? 's' : 'p', id); }
  if (b.dataset.u) { const id = b.dataset.u; const l = save.upgrades[id] || 0; save.bank -= UPGRADES[id].price(l); save.upgrades[id] = l + 1; audio.cash(true); if (game) { game.player.cap = 20 + (save.upgrades.sac || 0) * 8; } }
  persist(); renderShop(); renderMenu();
});


// ---------- navigation manette dans les menus ----------
// croix / stick : déplacer le focus vers le contrôle le plus proche dans la direction ; ✕ valider ; ○ retour ; ← → régler curseurs et listes
let padFocus = null, navRep = 0;
function activeScreen() { for (const id of ['pause', 'shop', 'invite', 'end', 'menu']) { const el = $(id); if (el && !el.classList.contains('hidden')) return el; } return null; }
const offView = (e) => { const m = e.closest('.lobby'); if (!m) return false; return m.classList.contains('v-salon') ? !!e.closest('.lb-left') : !!e.closest('.lb-right, .lb-dock, #plates'); }; // vue cachée du salon
function focusables(scr) { return [...scr.querySelectorAll('button, input, select')].filter((e) => !e.disabled && e.offsetParent !== null && !offView(e)); }
function setPadFocus(el) { padFocus?.classList.remove('padfocus'); padFocus = el; if (el) { el.classList.add('padfocus'); el.scrollIntoView?.({ block: 'nearest' }); if (el.closest?.('#shopList')) pvFrom(el); } }
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
  if (H(1)) { if (scr.id === 'pause') closePause(); else if (scr.id === 'shop') closeShop(); else if (scr.id === 'invite') closeInvite(); else if (scr.id === 'menu' && scr.classList.contains('v-casier')) setView('salon'); }
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
<label><input type="checkbox" id="s-killcam"> Kill-cam en incrustation (bulle)</label>
<label>Qualité graphique <select id="s-quality"><option value="auto">Auto</option><option value="bas">Basse (PC modestes)</option><option value="moyen">Moyenne</option><option value="haut">Haute</option></select></label>
<label><input type="checkbox" id="s-dynres"> Résolution adaptée aux images/s</label>
<label><input type="checkbox" id="s-photo"> Rendu photoréaliste : occlusion ambiante, brume lointaine (qualité haute)</label>
<label><input type="checkbox" id="s-cine"> Rendu cinéma : flou de mouvement, mise au point en visée, grain (qualité haute)</label>
<label>Images/s <b id="s-fpsn">–</b></label>
<label>Joueurs par camp (prochaine partie) <select id="s-team"><option value="5">5 contre 5</option><option value="10">10 contre 10</option><option value="15">15 contre 15</option><option value="20">20 contre 20</option><option value="25">25 contre 25</option><option value="35">35 contre 35</option><option value="50">50 contre 50</option></select></label>
</div>
<div class="row-btns"><button class="big" id="resume">REPRENDRE</button><button class="ghost" id="quit">Quitter la partie</button><button class="ghost" id="s-fullscreen">Plein écran (⌘L)</button></div>
<div class="controls"><div><h3>Manette</h3>
<p><kbd>L</kbd> se déplacer · <kbd>R</kbd> regarder</p><p><kbd>R2</kbd> tirer · <kbd>L2</kbd> viser</p><p><kbd>✕</kbd> sauter / escalader · <kbd>○</kbd> roulade / glissade</p>
<p><kbd>L1</kbd> s'accroupir · <kbd>L3</kbd> sprint · <kbd>R3</kbd> vue FPS / TPS</p><p><kbd>□</kbd> agir, ramasser, monter dans un véhicule · <kbd>△</kbd> changer d'arme</p>
<p><kbd>R1</kbd> maintenir pour viser un lancer, lâcher pour lancer · <kbd>↑</kbd><kbd>↓</kbd> force · <kbd>←</kbd> changer · <kbd>L2</kbd> annuler</p>
<p><kbd>→</kbd> préparer l'atout de série, <kbd>R2</kbd> pour le lancer</p>
<p>Lunette : <kbd>R3</kbd> zoom ×4 / ×8 · <kbd>L3</kbd> retenir son souffle</p>
<p>Véhicule : <kbd>R2</kbd> gaz · <kbd>L2</kbd> frein · <kbd>✕</kbd> frein à main / ollie · <kbd>↓</kbd> klaxon</p>
<p><kbd>←</kbd> recharger · <kbd>↑</kbd> armurerie (à la base) · <kbd>↓</kbd> barricade</p><p><kbd>PAVÉ</kbd> carte · <kbd>SHARE</kbd> sac · <kbd>OPTIONS</kbd> pause</p><p>Menus : croix ou stick pour choisir, <kbd>✕</kbd> valider, <kbd>○</kbd> retour, <kbd>←</kbd><kbd>→</kbd> régler</p></div>
<div><h3>Clavier et souris</h3><p><kbd>ZQSD</kbd>/<kbd>WASD</kbd> · souris pour regarder</p><p><kbd>Clic</kbd> tirer · <kbd>Clic droit</kbd> viser</p><p><kbd>Espace</kbd> saut · <kbd>Ctrl</kbd> roulade / glissade</p><p><kbd>C</kbd> accroupi · <kbd>Maj</kbd> sprint · <kbd>V</kbd> vue FPS / TPS</p><p><kbd>E</kbd> agir · <kbd>F</kbd> monter / descendre d'un véhicule · <kbd>R</kbd> recharger</p>
<p><kbd>G</kbd> maintenir pour viser un lancer, lâcher pour lancer · <kbd>Molette</kbd> force · <kbd>R</kbd> changer · <kbd>Clic droit</kbd> annuler</p>
<p><kbd>X</kbd> préparer l'atout de série, <kbd>Clic</kbd> pour le lancer</p>
<p>Lunette : <kbd>Molette</kbd> zoom ×4 / ×8 · <kbd>Maj</kbd> retenir son souffle</p>
<p>Véhicule : <kbd>Espace</kbd> frein à main / ollie · <kbd>H</kbd> klaxon</p>
<p><kbd>1-4</kbd> armes · <kbd>Q</kbd> barricade · <kbd>B</kbd> armurerie (à la base)</p><p><kbd>M</kbd> carte · <kbd>Tab</kbd> sac · <kbd>Échap</kbd> pause · <kbd>⌘L</kbd> / <kbd>Ctrl+L</kbd> plein écran</p></div></div>`;
document.body.appendChild(pause);
const st = document.createElement('style'); st.textContent = `.padfocus{outline:3px solid #ffcc3d!important;outline-offset:3px;box-shadow:0 0 0 7px rgba(255,204,61,.22)!important}.settings{display:grid;gap:10px;text-align:left;background:rgba(255,255,255,.06);padding:16px;border-radius:12px;min-width:min(420px,100%)}.controls{display:grid;grid-template-columns:1fr 1fr;gap:14px;text-align:left;margin-top:10px;font-size:13px}.controls h3{margin:0 0 6px;font:800 14px Inter}.controls p{margin:3px 0}@media(max-width:760px){.controls{grid-template-columns:1fr}}.settings label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-weight:700}#minimap.big{width:min(700px,90vw);height:min(350px,45vw);left:50%;top:50%;transform:translate(-50%,-50%)}body.scoped #app canvas{}body.scoped::after{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at center,transparent 0 30vh,#000 30.5vh);z-index:1}body.scoped::before{content:'';position:fixed;left:50%;top:0;bottom:0;width:1px;background:#000;z-index:2;box-shadow:0 0 0 0 #000}`;
document.head.appendChild(st);
const bindSet = (id, key, prop = 'value', conv = Number) => { const el = $(id); el[prop] = save.settings[key]; el.addEventListener('input', () => { save.settings[key] = conv(el[prop]); input.settings[key] = save.settings[key]; persist(); if (key === 'fps' && game) { game.cam.fps = save.settings.fps; game.viewGun(); } }); };
if (save.settings.killcam === undefined) save.settings.killcam = true; bindSet('s-killcam', 'killcam', 'checked', Boolean); bindSet('s-sens', 'sens'); bindSet('s-pad', 'padSens'); bindSet('s-assist', 'assist', 'checked', Boolean); bindSet('s-inv', 'invertY', 'checked', Boolean); bindSet('s-fps', 'fps', 'checked', Boolean); bindSet('s-dynres', 'dynres', 'checked', Boolean); if (save.settings.cine === undefined) save.settings.cine = true; bindSet('s-cine', 'cine', 'checked', Boolean); $('s-cine').addEventListener('input', () => { if (cine) cine.enabled2 = save.settings.cine; }); if (save.settings.photo === undefined) save.settings.photo = true; bindSet('s-photo', 'photo', 'checked', Boolean); $('s-photo').addEventListener('input', () => { if (photo) photo.enabled2 = save.settings.photo; }); bindSet('s-team', 'teamSize');
{ const el = $('s-quality'); el.value = save.settings.quality || 'auto'; el.addEventListener('change', () => { save.settings.quality = el.value; persist(); location.reload(); }); }
function openSettings() { pause.querySelector('h2').textContent = 'RÉGLAGES'; $('resume').style.display = 'none'; $('quit').textContent = 'Retour au salon'; pause.classList.remove('hidden'); audio.init(); audio.play('uiSelect'); }
function openPause() { if (!game || game.over) return; pause.querySelector('h2').textContent = 'PAUSE'; $('resume').style.display = ''; $('quit').textContent = 'Quitter la partie'; game.paused = true; pause.classList.remove('hidden'); document.exitPointerLock?.(); $('s-fps').checked = game.cam.fps; }
function closePause() { pause.classList.add('hidden'); if (game) { game.paused = false; renderer.domElement.requestPointerLock?.(); } else renderMenu(); }
$('resume').addEventListener('click', closePause);
$('s-fullscreen').addEventListener('click', () => toggleFullscreen());
$('quit').addEventListener('click', () => { pause.classList.add('hidden'); endGame(null); });
// ---------- plein écran : Cmd+L (Mac) ou Ctrl+L, bouton dans la pause ----------
let fsSwitch = 0;
function toggleFullscreen() {
  fsSwitch = performance.now() + 1500;
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)?.catch?.(() => {});
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' })?.catch?.(() => {});
}
window.__toggleFullscreen = toggleFullscreen;
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === 'KeyL') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) toggleFullscreen(); } }, true);
document.addEventListener('fullscreenchange', () => { $('s-fullscreen') && ($('s-fullscreen').textContent = document.fullscreenElement ? 'Quitter le plein écran (⌘L)' : 'Plein écran (⌘L)'); if (game && !game.paused && !game.over && !input.st.usingPad && !document.pointerLockElement) renderer.domElement.requestPointerLock?.(); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && performance.now() < fsSwitch && game && !game.paused && !game.over) { renderer.domElement.requestPointerLock?.(); return; } if (!document.pointerLockElement && game && !game.paused && !game.over && !input.st.usingPad && $('shop').classList.contains('hidden') && $('inv').classList.contains('hidden')) openPause(); });
renderer.domElement.addEventListener('click', () => { if (game && !game.paused) renderer.domElement.requestPointerLock?.(); });

// ---------- partie ----------
let game = null;
function start() {
  audio.init(); persist();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); lobby?.show(false);
  if (game) { scene.remove(game.root); world.dynamic.length = 0; }
  if (net.guest) return; // un invité attend que son chef lance
  const online = net.online && net.friends().length > 0, friends = online ? net.friends().slice(0, 3) : [];
  let teamSize = +(Q.get('n') || save.settings.teamSize); if (online) teamSize = Math.max(friends.length + 1, Math.min(teamSize, ONLINE_MAX_TEAM));
  game = new Game({ mapRoot, renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts: { squad: window.__squad(), friends, net: online ? net : null, pseudo: save.pseudo, teamSize, botSkill: 1, cars: carDefs, lod: QS.lod, lodShadow: QS.lodShadow } });
  game.onShop = openShop; game.onPause = openPause; game.onEnd = (r) => endGame(r);
  game.build(); window.__game = game; if (online) net.attach(game);
  renderer.domElement.requestPointerLock?.();
}
// invité : la partie lancée par le chef, avec exactement ses persos
function startGuest() {
  const m = pendingStart; pendingStart = null; if (!m || !world || !net.guest) return;
  if (m.map && MAPS[m.map] && m.map !== MAP_ID) { switchMap(m.map, net.room); return; }
  if (!m.roster?.some((r) => r[4] === net.id)) { $('inviteNote').textContent = 'Une partie a commencé sans toi : tu entreras à la prochaine.'; return; }
  if (game) { scene.remove(game.root); world.dynamic.length = 0; game = null; }
  for (const id of ['invite', 'shop', 'end']) $(id).classList.add('hidden'); pause.classList.add('hidden');
  if (TEAMS[m.team]) save.team = m.team; if (!TEAMS[save.team].skins.includes(save.skin)) save.skin = TEAMS[save.team].skins[0];
  if (!!save.settings.night !== !!m.night) { save.settings.night = !!m.night; night?.set(save.settings.night); }
  audio.init(); persist(); net.startHost = m.host; net.hostId = m.host;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); lobby?.show(false);
  game = new Game({ mapRoot, renderer, scene, camera, world, fx, audio, input, sun, followShadow, save, persist, opts: { roster: m.roster, net, pseudo: save.pseudo, teamSize: m.n, botSkill: 1, cars: carDefs, lod: QS.lod, lodShadow: QS.lodShadow } });
  game.onShop = openShop; game.onPause = openPause; game.onEnd = (r) => endGame(r);
  net.attach(game); game.build(); window.__game = game;
  renderer.domElement.requestPointerLock?.();
}
function endGame(r) {
  if (game?.net) { if (!r && net.host && !game.over) net.send('back'); net.detach(); }
  document.exitPointerLock?.(); $('hud').classList.add('hidden'); audio.engine(false); renderer.domElement.style.filter = '';
  if (!r) { if (game) { scene.remove(game.root); world.dynamic.length = 0; game = null; } $('menu').classList.remove('hidden'); lobby?.show(true); renderMenu(); return; }
  $('endTitle').textContent = r.draw ? 'ÉGALITÉ' : r.win ? 'VICTOIRE' : 'DÉFAITE';
  const s = r.stats; $('endStats').innerHTML = `<div>${r.score.ordre}<br><span>Brigade</span></div><div>—</div><div>${r.score.civils}<br><span>Frungz</span></div><div>${s.kills}<br><span>éliminations</span></div><div>${s.captures}<br><span>captures</span></div><div>${fmt(s.earned)} €<br><span>gagnés</span></div><div>${s.broken}<br><span>vitrines</span></div><div>${s.stolen}<br><span>vols</span></div><div>${s.deaths}<br><span>morts</span></div>`;
  $('end').classList.remove('hidden');
  if (game) { scene.remove(game.root); world.dynamic.length = 0; game = null; }
}
window.__start = start; window.__THREE = THREE; window.__CLASSES = CLASSES; window.__WEAPONS = WEAPONS;

// ---------- boucle ----------
const clock = new THREE.Clock(); let menuT = 0;
// résolution dynamique : baisse si on passe sous ~45 images/s, remonte quand il y a de la marge
let ftAvg = 1 / 60, ftT = 0, fpsShown = 0;
function dynRes(raw) {
  ftAvg += (Math.min(raw, 0.2) - ftAvg) * 0.05; ftT += raw; if (ftT < 1) return; ftT = 0;
  fpsShown = Math.round(1 / ftAvg); const el = $('s-fpsn'); if (el) el.textContent = fpsShown + ' (résolution ' + Math.round(prCur * 100) + ' %)';
  // rendu cinéma coupé quand on passe sous ~40 images/s, rallumé au-dessus de ~52
  if (cine) cine.auto = ftAvg > 1 / 40 ? 0 : ftAvg < 1 / 52 ? 1 : cine.auto;
  // passe photoréaliste : coupée sous ~36 images/s, rallumée au-dessus de ~50
  if (photo && !Q.has('forcephoto')) photo.auto = ftAvg > 1 / 36 ? 0 : ftAvg < 1 / 50 ? 1 : photo.auto;
  if (save.settings.dynres === false || !game || game.paused) return;
  // effets allégés quand ça rame (moins d'éclats, fumée moins dense), puis rétablis quand il y a de la marge
  const L = fx.stats().load; fx.setLoad(ftAvg > 1 / 40 ? L - 0.15 : ftAvg < 1 / 55 ? L + 0.1 : L);
  let n = prCur; if (ftAvg > 1 / 45) n = Math.max(QS.prMin, prCur - 0.1); else if (ftAvg < 1 / 57) n = Math.min(prMax, prCur + 0.05);
  if (Math.abs(n - prCur) > 0.01) { prCur = n; renderer.setPixelRatio(prCur); composer?.setPixelRatio?.(prCur); }
}
// état du rendu cinéma selon la caméra du jeu : quoi masquer près de l'objectif, mise au point, intensité
function cineState(raw) {
  const g = game && !game.paused ? game : null, a = g?.player;
  let mb = 0.5, dof = 0, focus = 20, mask = [2.6, 5];
  if (g && a) {
    const W = g.weapon(a), scope = g.aiming && W && WEAPONS[W.id]?.scope, fps = (g.cam.fps || !!g.sc?.was) && !a.inCar && a.alive;
    if (a.inCar) mask = a.inCar.kind ? [3.2, 5.5] : [6.5, 10]; // la voiture (ou la moto) suit la caméra : on ne la floute pas
    else if (fps) mask = [1.1, 2.0]; // bras et arme
    else if (g.aiming) mask = [1.5, 3.0];
    if (g.aiming && !scope && a.alive) { dof = 1; focus = g.aimPt ? g.aimPt.distanceTo(camera.position) : 20; }
    if (scope) mb = 0.2; // à la lunette, un flou fort gênerait la visée
    if (g.killcam) mb = 0.35;
  }
  cine.set({ dt: raw, mb, dof, focus, mask });
  if (grade) { grade.uniforms.uT.value = (grade.uniforms.uT.value + raw * 24) % 1000; grade.uniforms.uFilm.value = cine.enabled2 ? cine.k : 0; grade.uniforms.uNight.value = night?.on ? 1 : 0; }
}
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(); dynRes(raw); const dt = Math.min(raw, 0.05);
  if (game) {
    night?.update(dt, camera.position, game.cars);
    if (!game.paused) { game.update(dt); }
    else if (game.net) game.update(dt, true); // en ligne, la partie ne s'arrête pas pendant un menu
    else { input.poll(); if (input.pressed('pause') && !pause.classList.contains('hidden')) closePause(); else if (!input.st.usingPad && input.pressed('shop') && !$('shop').classList.contains('hidden')) closeShop(); else padMenu(dt); input.endFrame(); }
  } else if (world) {
    // menu : survol lent de la place
    // salon : l'équipe sur la place (sinon, survol lent au-dessus des toits)
    if (lobby?.visible) { lobby.update(dt); placePlates(); followShadow(lobby.focusPoint()); }
    else { menuT += dt * 0.04; camera.position.set(Math.cos(menuT) * 150, 55, Math.sin(menuT) * 150); camera.lookAt(0, 4, 0); followShadow(camera.position); } world.metro?.update(menuT * 25, dt, null);
    input.poll(); padMenu(dt); input.endFrame(); night?.update(dt, camera.position, null);
  }
  if (cine) cineState(raw);
  if (Q.has('norender')) { window.__frames = (window.__frames || 0) + 1; return; } // tests : simulation seule (plusieurs joueurs dans un même navigateur)
  if (composer) composer.render(); else renderer.render(scene, camera); if (game && !game.paused) game.renderPip(renderer, scene); window.__frames = (window.__frames || 0) + 1;
}
window.__cineState = (dt) => cine && cineState(dt);
renderMenu(); frame();
loadAll().catch((e) => { $('loadtxt').textContent = 'Erreur de chargement : ' + e.message; console.error(e); });

// ---------- mise à jour : recharger la dernière version publiée ----------
// Chaque build porte un numéro (__BUILD__) et publie version.json ; l'accueil le relit de temps en temps et allume le bouton quand une version plus récente est en ligne.
{
  const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'; window.__build = BUILD;
  const btn = $('updBtn'); if (btn) btn.title = `Recharger la dernière version du jeu (version ${BUILD})`;
  let latest = null;
  async function check() {
    if (BUILD === 'dev' || game) return;
    try { const j = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json(); latest = j.id; if (j.id && j.id !== BUILD && btn) { btn.classList.add('new'); btn.querySelector('.t').textContent = 'Nouvelle version !'; } } catch {}
  }
  btn?.addEventListener('click', async () => {
    btn.classList.add('busy'); btn.querySelector('.t').textContent = 'Mise à jour…'; audio.init(); audio.play('uiSelect'); persist();
    try { await fetch(location.pathname, { cache: 'reload' }); } catch {}
    const u = new URL(location.href); u.searchParams.set('v', latest || Date.now().toString(36)); location.replace(u.toString());
  });
  setTimeout(check, 4000); setInterval(check, 120000); addEventListener('focus', check);
}
