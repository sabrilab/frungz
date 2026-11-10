// Studio de skins (frungz.vercel.app/studio) : créer, retoucher et garder ses propres skins.
// Les skins sont des fiches (src/skins-data.js) enregistrées dans ce navigateur ; le jeu les ajoute au menu de son camp.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { chars, makeCharacter, loadMx, loadGuns, attachGun, teamMarkings } from './assets.js';
import { loadSkinBases, registerSkin, SLOTS, PIECES, EXTRAS, HAIRS, SKIN_TONES, BUILTIN_SKINS, userSkins, saveUserSkins, piece } from './skins.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TEAM = { ordre: { name: 'BRIGADE', color: '#3d8bff' }, civils: { name: 'FRUNGZ', color: '#34c759' } };

// ---------------------------------------------------------------- rendu
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60); camera.position.set(2.3, 1.5, 5.6);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 9; controls.maxPolarAngle = Math.PI * 0.53; controls.enablePan = false;
scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a4540', 2.1));
const key = new THREE.DirectionalLight('#fff4e6', 2.6); key.position.set(2.5, 4.5, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 }); key.shadow.bias = -0.0004; scene.add(key);
const rim = new THREE.DirectionalLight('#9cc4ff', 1.6); rim.position.set(-3, 2.5, -3.5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: '#2b313d', roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.6, 64), new THREE.MeshBasicMaterial({ color: '#3d8bff' })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; scene.add(ring);
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- état
let mine = userSkins(); let cur = null; let ch = null, clips = [], guns = false; let anim = 'MX_Idle', weapon = 'rifle';
const ANIMS = [['MX_Idle', 'Repos'], ['MX_WalkF', 'Marche'], ['MX_Run', 'Course'], ['MX_CrouchIdle', 'Accroupi'], ['MX_Cheer', 'Victoire'], ['MX_Dance', 'Danse']];
const WEAPONS = [['', 'Mains libres'], ['pistol', 'Pistolet'], ['rifle', 'Fusil']];
const uid = () => 'u_' + Math.random().toString(36).slice(2, 9);
const isMine = (s) => s && mine.some((m) => m.id === s.id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const store = () => { if (!saveUserSkins(mine)) toast('Impossible d\'enregistrer (stockage du navigateur bloqué)'); };
let toastT = 0; function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 1800); }
function newSkin(team = 'civils') { return { id: uid(), name: team === 'ordre' ? 'Mon policier' : 'Mon Frungz', team, body: 'M', peau: '#e2b597', hair: 'Hair_Buzzed', hairColor: '#2b1d14', barbe: false,
  bas: { id: 'jean' }, pieds: { id: 'baskets' }, haut: { id: 'sweat' }, gilet: { id: 'aucun' }, mains: { id: 'aucun' }, tete: { id: 'aucun' }, visage: { id: 'aucun' }, extras: [] }; }

// ---------------------------------------------------------------- personnage
function show(def) {
  if (ch) { scene.remove(ch.root); ch.model.traverse((o) => { if (o.isSkinnedMesh) o.geometry.dispose(); }); }
  registerSkin(chars, def, clips);
  ch = makeCharacter(def.id); ch.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } }); scene.add(ch.root);
  ch.model.position.y = -chars[def.id].minY * chars[def.id].k;
  if (def.team === 'ordre') teamMarkings(ch, def.id);
  if (guns && weapon) attachGun(ch, weapon);
  play(anim, true);
  ring.material.color.set(TEAM[def.team].color); $('tName').textContent = def.name; $('tTeam').textContent = TEAM[def.team].name; $('tTeam').style.color = TEAM[def.team].color;
}
function play(name, now) {
  anim = name; if (!ch) return; const want = weapon === 'pistol' && ch.actions[name.replace('MX_', 'MXP_')] ? name.replace('MX_', 'MXP_') : name;
  const a = ch.actions[want] || ch.actions.MX_Idle; ch.mixer.stopAllAction(); a.reset().play(); if (now) ch.mixer.update(0.01);
  renderBar();
}
function renderBar() {
  $('bar').innerHTML = ANIMS.map(([k, l]) => `<button class="btn ${k === anim ? 'on' : ''}" data-a="${k}">${l}</button>`).join('') + '<span style="width:10px"></span>' +
    WEAPONS.map(([k, l]) => `<button class="btn ${k === weapon ? 'on' : ''}" data-w="${k}">${l}</button>`).join('');
}
$('bar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a) play(b.dataset.a); if (b.dataset.w !== undefined) { weapon = b.dataset.w; if (cur) show(cur); } });

// ---------------------------------------------------------------- listes
function renderLists() {
  const item = (s) => `<button data-id="${esc(s.id)}" class="${cur && cur.id === s.id ? 'on' : ''}"><i style="background:${TEAM[s.team]?.color || '#888'}"></i>${esc(s.name)}</button>`;
  $('mine').innerHTML = mine.length ? mine.map(item).join('') : '<div class="empty">Aucun pour l\'instant : crée-en un, ou retouche un skin du jeu.</div>';
  $('builtin').innerHTML = BUILTIN_SKINS.map(item).join('');
}
for (const id of ['mine', 'builtin']) $(id).addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; select(b.dataset.id); });
function select(id) { const s = mine.find((m) => m.id === id) || BUILTIN_SKINS.find((m) => m.id === id); if (!s) return; cur = clone(s); try { localStorage.setItem('frungz.studio.last', id); } catch {} renderLists(); renderEditor(); show(cur); }
$('new').addEventListener('click', () => { const s = newSkin(cur?.team || 'civils'); mine.push(s); store(); select(s.id); toast('Nouveau skin créé'); });

// ---------------------------------------------------------------- éditeur
function colorInput(path, value, title) { return `<input type="color" data-path="${path}" value="${value || '#000000'}" title="${esc(title || '')}">`; }
function renderEditor() {
  const d = cur, own = isMine(d), e = $('edit');
  const seg = (path, opts, val) => `<div class="seg">${opts.map(([v, l, cls]) => `<button data-path="${path}" data-v="${v}" class="${cls || ''} ${v === val ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let h = '';
  if (!own) h += `<div id="banner">Skin du jeu. Toute retouche en fait une copie dans « Mes skins ».</div>`;
  h += `<div class="row"><label>Nom</label><input type="text" data-path="name" value="${esc(d.name)}" maxlength="32"></div>`;
  h += `<div class="row"><label>Camp</label>${seg('team', [['ordre', 'Brigade', 'ordre'], ['civils', 'Frungz', 'civils']], d.team)}</div>`;
  h += `<div class="row"><label>Corps</label>${seg('body', [['M', 'Homme'], ['F', 'Femme']], d.body)}</div>`;
  h += `<div class="row"><label>Peau</label><div class="tones">${SKIN_TONES.map((t) => `<button data-path="peau" data-v="${t}" style="background:${t}" class="${t === d.peau ? 'on' : ''}"></button>`).join('')}${colorInput('peau', d.peau, 'Autre carnation')}</div></div>`;
  h += `<div class="row"><label>Cheveux</label><div class="piece"><select data-path="hair">${HAIRS.map((x) => `<option value="${x.id}" ${x.id === (d.hair || '') ? 'selected' : ''}>${x.label}</option>`).join('')}</select>${colorInput('hairColor', d.hairColor, 'Couleur des cheveux')}<span></span></div></div>`;
  if (d.body === 'M') h += `<div class="row"><label>Barbe</label><div class="extras"><label><input type="checkbox" data-path="barbe" ${d.barbe ? 'checked' : ''}><span>Barbe courte</span></label></div></div>`;
  h += '<h2>Tenue</h2>';
  for (const S of SLOTS) {
    const p = piece(d, S.id), cat = PIECES[S.id].find((x) => x.id === p.id) || PIECES[S.id][0];
    const c1 = cat.c !== undefined && p.id !== 'aucun' ? colorInput(`${S.id}.c`, p.c || (S.id === 'tete' && p.id === 'capuche' ? piece(d, 'haut').c : '#222222'), 'Couleur') : '<span></span>';
    const c2 = cat.c2 ? colorInput(`${S.id}.c2`, p.c2, cat.c2label || 'Seconde couleur') : '<span></span>';
    h += `<div class="row"><label>${S.label}</label><div class="piece"><select data-path="${S.id}.id">${PIECES[S.id].map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select>${c1}${c2}</div></div>`;
  }
  h += '<h2>Accessoires</h2><div class="extras">';
  for (const X of EXTRAS) { if ((X.id === 'dos' || X.id === 'brassard') && d.team !== 'ordre') continue; const on = (d.extras || []).includes(X.id);
    h += `<label><input type="checkbox" data-extra="${X.id}" ${on ? 'checked' : ''}><span>${X.label}</span>${X.c ? colorInput(`extraColors.${X.id}`, (d.extraColors || {})[X.id] || X.c) : ''}</label>`; }
  h += '</div><h2>Actions</h2><div class="btns">';
  h += `<button class="btn main" id="playIt">Jouer avec ce skin</button><button class="btn" id="dup">Dupliquer</button>`;
  if (own) h += `<button class="btn danger" id="del">Supprimer</button>`;
  h += '</div><p class="cl">Les marquages restent génériques : « POLICE », bandes et brassard, sans logo ni insigne réel.</p>';
  e.innerHTML = h;
  $('playIt').onclick = () => { ensureMine(); try { const s = JSON.parse(localStorage.getItem('frungz-save') || '{}'); s.team = cur.team; s.skin = cur.id; localStorage.setItem('frungz-save', JSON.stringify(s)); } catch {} location.href = '/'; };
  $('dup').onclick = () => { const s = { ...clone(cur), id: uid(), name: cur.name + ' (copie)' }; mine.push(s); store(); select(s.id); toast('Copie créée'); };
  if ($('del')) $('del').onclick = () => { if (!confirm(`Supprimer « ${cur.name} » ?`)) return; mine = mine.filter((m) => m.id !== cur.id); store(); select(mine[0]?.id || BUILTIN_SKINS[0].id); toast('Skin supprimé'); };
}
// une retouche sur un skin du jeu crée une copie à soi
function ensureMine() { if (isMine(cur)) return; const base = cur; cur = { ...clone(base), id: uid(), name: base.name + ' (à moi)' }; mine.push(cur); toast('Copie créée dans « Mes skins »'); }
function setPath(path, v) { const ks = path.split('.'); let o = cur; for (let i = 0; i < ks.length - 1; i++) o = (o[ks[i]] ||= {}); o[ks[ks.length - 1]] = v; }
let rebuildT = 0;
function changed(full) { const i = mine.findIndex((m) => m.id === cur.id); if (i >= 0) mine[i] = clone(cur); store(); renderLists(); if (full) renderEditor(); cancelAnimationFrame(rebuildT); rebuildT = requestAnimationFrame(() => show(cur)); }
$('edit').addEventListener('input', (e) => { const t = e.target; if (t.dataset.path && t.type === 'color') { ensureMine(); setPath(t.dataset.path, t.value); changed(false); } else if (t.dataset.path === 'name') { ensureMine(); cur.name = t.value.slice(0, 32) || 'Sans nom'; changed(false); } });
$('edit').addEventListener('change', (e) => { const t = e.target;
  if (t.tagName === 'SELECT') { ensureMine(); const [slot, k] = t.dataset.path.split('.'); if (k === 'id') { cur[slot] = { id: t.value }; } else setPath(t.dataset.path, t.value); changed(true); }
  else if (t.type === 'checkbox' && t.dataset.path === 'barbe') { ensureMine(); cur.barbe = t.checked; changed(false); }
  else if (t.type === 'checkbox' && t.dataset.extra) { ensureMine(); const s = new Set(cur.extras || []); t.checked ? s.add(t.dataset.extra) : s.delete(t.dataset.extra); cur.extras = [...s]; changed(false); } });
$('edit').addEventListener('click', (e) => { const b = e.target.closest('button[data-path]'); if (!b) return; ensureMine(); setPath(b.dataset.path, b.dataset.v);
  if (b.dataset.path === 'body' && b.dataset.v === 'F') cur.barbe = false; if (b.dataset.path === 'team' && b.dataset.v === 'civils') cur.extras = (cur.extras || []).filter((x) => x !== 'dos' && x !== 'brassard'); changed(true); });

// ---------------------------------------------------------------- partage
$('export').addEventListener('click', () => { if (!mine.length) return toast('Pas encore de skin à toi'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ frungz: 'skins', v: 1, skins: mine }, null, 1)], { type: 'application/json' })); a.download = 'mes-skins-frungz.json'; a.click(); });
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); const list = (Array.isArray(j) ? j : j.skins || [j]).filter((s) => s && s.body && s.team); let n = 0; for (const s of list) { const t = { ...s, id: mine.some((m) => m.id === s.id) || BUILTIN_SKINS.some((m) => m.id === s.id) ? uid() : s.id || uid() }; mine.push(t); n++; } store(); renderLists(); if (n) select(mine[mine.length - 1].id); toast(`${n} skin${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`); } catch { toast('Fichier illisible'); } e.target.value = ''; });
$('copy').addEventListener('click', async () => { if (!cur) return; try { await navigator.clipboard.writeText(JSON.stringify(cur)); toast('Fiche copiée : tu peux me l\'envoyer pour l\'ajouter au jeu'); } catch { toast('Copie refusée par le navigateur'); } });

// ---------------------------------------------------------------- démarrage
const clock = new THREE.Clock();
function frame() { requestAnimationFrame(frame); const dt = Math.min(0.05, clock.getDelta()); controls.update(); if (ch) ch.mixer.update(dt); renderer.render(scene, camera); }
(async () => {
  try {
    const [, mx] = await Promise.all([loadSkinBases(), loadMx()]); clips = mx;
    loadGuns().then(() => { guns = true; if (cur) show(cur); }).catch(() => {});
    $('loading').remove();
    let last = null; try { last = localStorage.getItem('frungz.studio.last'); } catch {}
    renderLists(); select(mine.find((m) => m.id === last) ? last : BUILTIN_SKINS.find((m) => m.id === last) ? last : mine[0]?.id || BUILTIN_SKINS[0].id);
    window.__ready = true;
  } catch (err) { console.error(err); $('loading').textContent = 'Le studio n\'a pas pu charger les mannequins.'; }
  frame();
})();
window.__studio = { select, get cur() { return cur; }, get ch() { return ch; }, camera, controls, play, setWeapon: (w) => { weapon = w; if (cur) show(cur); } };
