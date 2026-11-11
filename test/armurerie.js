// Planche des armes modélisées en code : ?v=side|q34|left|lo&ids=a,b&cols=4
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadGuns, gunInstance } from '../src/assets.js';
import { WEAPONS } from '../src/data.js';
const q = new URLSearchParams(location.search), view = q.get('v') || 'side', cols = +(q.get('cols') || 4);
const W = 1920, H = 1200, r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); r.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(r.domElement);
const sc = new THREE.Scene(); sc.background = new THREE.Color('#c9cfd6'); sc.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const d = new THREE.DirectionalLight('#fff', 2.2); d.position.set(1, 3, 2); sc.add(d);
await loadGuns();
const ids = (q.get('ids') ? q.get('ids').split(',') : Object.keys(WEAPONS).filter((i) => !WEAPONS[i].build)), rows = Math.ceil(ids.length / cols);
const cw = 1.5, chh = cw * (H / W) * cols / rows; const cam = new THREE.OrthographicCamera(0, cols * cw, 0, -rows * chh, -50, 50);
let tris = 0;
ids.forEach((id, i) => { const g = gunInstance(id, view === 'lo'); const c = i % cols, row = Math.floor(i / cols); const D = g.userData.dim, piv = new THREE.Group(); g.position.set(-(D.rear + D.front) / 2, -(D.top + D.bot) / 2, 0); piv.add(g);
  if (view === 'q34') piv.rotation.set(0.35, -0.7, 0); else if (view === 'left') piv.rotation.set(0.25, Math.PI + 0.6, 0); else if (view === 'fps') piv.rotation.set(0.12, Math.PI / 2 + 0.25, 0);
  const s = q.get("fit") ? 1.3 / (D.front - D.rear) : Math.min(1, 1.25 / (D.front - D.rear)); piv.scale.setScalar(s); piv.position.set((c + 0.5) * cw, -(row + 0.5) * chh, 0); sc.add(piv);
  g.traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const x = cv.getContext('2d'); x.font = '34px sans-serif'; x.fillStyle = '#111'; x.fillText(WEAPONS[id].name, 4, 44); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv) })); sp.scale.set(0.8, 0.1, 1); sp.position.set((c + 0.3) * cw, -(row + 0.93) * chh, 10); sc.add(sp); });
r.render(sc, cam); window.tris = tris; window.done = true;
