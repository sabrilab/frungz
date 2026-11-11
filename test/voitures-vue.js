// Banc photo des voitures générées (src/voitures.js) : node test/voitures-vue.cjs construit et capture
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCar, CAR_LIST } from '../src/voitures.js';
const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb8d2');
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.7;
scene.add(new THREE.HemisphereLight('#cfe0ff', '#4a4640', 0.6));
const sun = new THREE.DirectionalLight('#fff3e0', 2.6); sun.position.set(8, 12, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 }); sun.shadow.bias = -0.0004; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#4a4a4c', roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 300);
let cur = null;
window.show = (i, yaw = 0.7, dist = 7.5, h = 1.5, lod = 1, hq = true) => {
  if (cur) scene.remove(cur); cur = buildCar(CAR_LIST[i], { lod, hq }); cur.traverse((o) => { if (o.isMesh) { o.castShadow = o.material.name !== 'car_ombre_contact'; o.receiveShadow = true; } }); scene.add(cur);
  cam.position.set(Math.sin(yaw) * dist, h, Math.cos(yaw) * dist); cam.lookAt(0, 0.6, 0); renderer.render(scene, cam);
  let tri = 0; cur.traverse((o) => { if (o.isMesh) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return { id: CAR_LIST[i][0], tri: Math.round(tri) };
};
window.N = CAR_LIST.length; window.ready = true;
window.stats = (i, lod = 1) => { const c = buildCar(CAR_LIST[i], { lod, hq: lod >= 1 }); const o = {}; c.traverse((m) => { if (m.isMesh) { const n = (m.parent.name === 'body' ? m.name : 'roue_' + m.material.name); o[n] = (o[n] || 0) + Math.round(m.geometry.attributes.position.count / 3); } }); return o; };
