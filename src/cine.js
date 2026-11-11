// Rendu « cinéma » : flou de mouvement de caméra et profondeur de champ en visée, faits maison (un seul passage plein écran).
// - Flou de mouvement : chaque pixel est reprojeté dans l'image précédente grâce à la profondeur, ce qui donne sa vraie
//   vitesse à l'écran (tourner la caméra, sprinter, rouler vite). Obturateur à 180° calé sur 60 images/s, donc la même
//   longueur de traîne quel que soit le nombre d'images/s. Une zone morte garde l'image nette quand on bouge peu.
// - Profondeur de champ : en visée, l'arrière-plan derrière la cible et le bord de l'écran se fondent doucement.
// - Le joueur, son arme et ses bras (tout ce qui est tout près de la caméra) ne sont jamais floutés ni étalés sur le décor.
// Garde-fous (cause connue des rectangles noirs) : chaque échantillon est nettoyé des NaN/infinis et borné, les matrices
// sont vérifiées côté JS, la traîne est bornée, et une coupure de caméra (téléportation, réapparition) remet à zéro.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const N = 10; // échantillons quand l'effet est visible ; 1 seul quand l'image est immobile (cas courant)

const frag = `
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform mat4 uReproj; uniform float uNear, uFar, uMB, uMaxV, uDead, uDof, uFocus, uAspect, uOn;
uniform vec2 uMask;
varying vec2 vUv;
vec3 safe(vec3 c){
  if (!(c.r >= 0.0 && c.r < 1e4)) c.r = c.r > 0.0 ? 16.0 : 0.0;
  if (!(c.g >= 0.0 && c.g < 1e4)) c.g = c.g > 0.0 ? 16.0 : 0.0;
  if (!(c.b >= 0.0 && c.b < 1e4)) c.b = c.b > 0.0 ? 16.0 : 0.0;
  return min(c, vec3(16.0));
}
float lin(float d){ return (uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-4); }
void main(){
  vec3 c0 = safe(texture2D(tDiffuse, vUv).rgb);
  if (uOn < 0.5) { gl_FragColor = vec4(c0, 1.0); return; }
  float d = texture2D(tDepth, vUv).x; float z = lin(d);
  float m = smoothstep(uMask.x, uMask.y, z); // 0 sur le joueur, son arme, l'habitacle
  // vitesse à l'écran : position actuelle reprojetée dans la caméra de l'image précédente
  vec4 p = uReproj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec2 vel = vec2(0.0);
  if (p.w > 1e-3) { vel = (vUv - (p.xy / p.w * 0.5 + 0.5)) * uMB; }
  float L = length(vel); if (!(L < 1.0)) { vel = vec2(0.0); L = 0.0; }
  vel *= (L > uDead ? min(L - uDead, uMaxV) / L : 0.0) * m;
  // profondeur de champ en visée : l'arrière-plan derrière la mise au point, et un peu la périphérie
  vec2 e = (vUv - 0.5) * vec2(uAspect, 1.0);
  float coc = uDof * m * max(smoothstep(uFocus * 1.3 + 1.5, uFocus * 3.0 + 6.0, z), 0.55 * smoothstep(0.32, 0.75, length(e)));
  if (dot(vel, vel) < 1e-8 && coc < 0.03) { gl_FragColor = vec4(c0, 1.0); return; }
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 R = vec2(0.0065 / uAspect, 0.0065) * coc;
  vec3 acc = c0; float W = 1.0;
  for (int i = 0; i < ${N}; i++) {
    float f = (float(i) + jit) / float(${N});
    float a = float(i) * 2.39996 + jit * 6.2832; float r = sqrt(f);
    vec2 uv = vUv + vel * (f - 0.5) + vec2(cos(a), sin(a)) * r * R;
    uv = clamp(uv, vec2(0.001), vec2(0.999));
    float zs = lin(texture2D(tDepth, uv).x);
    // le premier plan (joueur, arme) ne bave pas sur le décor ; en mise au point, un objet net devant ne déborde pas
    float w = smoothstep(uMask.x, uMask.y, zs) * (coc > 0.03 ? smoothstep(z * 0.45, z * 0.8, zs) : 1.0);
    acc += safe(texture2D(tDiffuse, uv).rgb) * w; W += w;
  }
  gl_FragColor = vec4(acc / W, 1.0);
}`;

export class CinePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera; this.needsSwap = true;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uReproj: { value: new THREE.Matrix4() }, uNear: { value: 0.05 }, uFar: { value: 1000 }, uMB: { value: 0 }, uMaxV: { value: 0.035 }, uDead: { value: 0.0012 },
        uDof: { value: 0 }, uFocus: { value: 20 }, uAspect: { value: 1 }, uOn: { value: 1 }, uMask: { value: new THREE.Vector2(2.6, 5) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: frag, depthTest: false, depthWrite: false,
    });
    this.fsq = new FullScreenQuad(this.mat);
    // réglages pilotés par le jeu à chaque image
    this.enabled2 = true; // choix du joueur (réglages)
    this.auto = 1; // coupé automatiquement quand ça rame
    this.dt = 1 / 60; this.mb = 0.5; this.dofT = 0; this.focusT = 20; this.mask = [2.6, 5];
    this.k = 0; this.dof = 0; this.focus = 20;
    this.prevView = new THREE.Matrix4(); this.prevPos = new THREE.Vector3(); this.prevDir = new THREE.Vector3(); this.has = false;
    this._vp = new THREE.Matrix4(); this._pvp = new THREE.Matrix4(); this._d = new THREE.Vector3(); this.cost = 0;
  }
  // appelé chaque image depuis la boucle : état de la caméra du jeu
  set({ dt, mb, dof, focus, mask }) {
    if (Number.isFinite(dt) && dt > 0) this.dt = dt;
    if (Number.isFinite(mb)) this.mb = mb; if (Number.isFinite(dof)) this.dofT = dof; if (Number.isFinite(focus) && focus > 0) this.focusT = focus;
    if (mask) this.mask = mask;
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.mat.uniforms, cam = this.camera, dt = Math.min(Math.max(this.dt, 1 / 240), 0.1);
    const on = this.enabled2 && this.auto > 0;
    this.k += ((on ? 1 : 0) - this.k) * (1 - Math.exp(-dt * 4)); // fondu doux à l'allumage / à la coupure
    this.dof += (this.dofT - this.dof) * (1 - Math.exp(-dt * 7)); this.focus += (this.focusT - this.focus) * (1 - Math.exp(-dt * 6));
    // image : celle recomposée par le passage photoréaliste s'il a tourné (src/photo.js), sinon celle de la scène
    const depth = readBuffer.depthTexture;
    u.tDiffuse.value = this.photo?.colorOut || readBuffer.texture; u.tDepth.value = depth;
    u.uNear.value = cam.near; u.uFar.value = cam.far; u.uAspect.value = cam.aspect;
    // reprojection : projection actuelle × vue précédente × inverse(projection × vue actuelles). Même projection des deux
    // côtés : un changement de champ de vision (zoom de visée) ne fait pas de flou radial parasite.
    cam.getWorldDirection(this._d);
    const cut = !this.has || cam.position.distanceToSquared(this.prevPos) > 16 || this._d.dot(this.prevDir) < 0.82;
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    this._pvp.multiplyMatrices(cam.projectionMatrix, this.prevView).multiply(this._vp);
    let ok = !!depth && !cut; for (const v of this._pvp.elements) if (!Number.isFinite(v)) { ok = false; break; }
    if (ok) u.uReproj.value.copy(this._pvp);
    // obturateur à 180° ramené à 60 images/s : même traîne à 30 ou 144 images/s
    u.uMB.value = ok ? this.mb * this.k * Math.min(2, (1 / 60) / dt) : 0;
    u.uDof.value = this.dof * this.k; u.uFocus.value = this.focus; u.uMask.value.set(this.mask[0], this.mask[1]);
    u.uOn.value = depth && (u.uMB.value > 0.001 || u.uDof.value > 0.01) ? 1 : 0;
    this.prevView.copy(cam.matrixWorldInverse); this.prevPos.copy(cam.position); this.prevDir.copy(this._d); this.has = Number.isFinite(this._d.x + cam.position.x);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.fsq.render(renderer);
  }
  setSize() {}
  dispose() { this.mat.dispose(); this.fsq.dispose(); }
}
