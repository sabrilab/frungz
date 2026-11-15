// Runs in lab.html. window.__main(cfg) -> [{id, glb(base64), meta}]
const A = '/mixamo-library/Mixamo Animations/';
const KEEP = /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase)|(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[1-3])$/;
const LOOPS = new Set(['z_idle', 'z_idle2', 'z_walk', 'z_run', 'z_crawl']);
const HIT_FX = { z_attack: ['LeftHand', 'RightHand'], z_punch: ['LeftHand', 'RightHand'], z_bite: ['Head'], z_headbutt: ['Head'], z_kick: ['LeftFoot', 'RightFoot'], z_jump: ['LeftHand', 'RightHand'] };
const FPS = 30;
const b64 = (u8) => { let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(bin); };

const animCache = {};
async function loadAnim(file) {
  if (!animCache[file]) animCache[file] = (async () => {
    const o = await new FBXLoader().loadAsync(A + file);
    let hips; o.traverse(c => { if (!hips && c.isBone && /Hips$/.test(c.name)) hips = c; });
    const prefix = hips.name.slice(0, -4);
    const nn = n => (n.startsWith(prefix) ? n.slice(prefix.length) : n).replace(/^mixamorig\d*[:_]?/, '');
    o.updateMatrixWorld(true);
    const bones = {}, RQ = {}, RP = {};
    o.traverse(c => { if (c.isBone) { const n = nn(c.name); if (!bones[n]) { bones[n] = c; RQ[n] = c.getWorldQuaternion(new THREE.Quaternion()); RP[n] = c.getWorldPosition(new THREE.Vector3()); } } });
    return { obj: o, clip: o.animations[0], prefix, nn, bones, RQ, RP, restHipsY: hips.position.y };
  })();
  return animCache[file];
}
async function loadFBX(url) {
  const mgr = new THREE.LoadingManager(); let done; const pr = new Promise(r => done = r); mgr.onLoad = done;
  const o = await new FBXLoader(mgr).loadAsync(url);
  await Promise.race([pr, new Promise(r => setTimeout(r, 8000))]);
  return o;
}

function canvasOf(img, size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, size, size); return c;
}
// part des texels transparents (alpha < 128) réellement couverts par les UV du maillage
function alphaStats(img, uvs) {
  const S = 512; const c = canvasOf(img, S); const d = c.getContext('2d').getImageData(0, 0, S, S).data;
  const m = document.createElement('canvas'); m.width = m.height = S; const g = m.getContext('2d'); g.fillStyle = '#fff';
  for (const { U, idx } of uvs) for (let i = 0; i < idx.length; i += 3) { g.beginPath(); for (let k = 0; k < 3; k++) { const j = idx[i + k]; const x = U[j * 2] * S, y = (1 - U[j * 2 + 1]) * S; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.fill(); }
  const md = g.getImageData(0, 0, S, S).data; let n = 0, cov = 0;
  for (let i = 3; i < d.length; i += 4) if (md[i] > 0) { cov++; if (d[i] < 128) n++; } return n / (cov || 1);
}

async function buildModel(cfg) {
  const fbx = await loadFBX('/mixamo-library/Mixamo Models/' + cfg.src);
  fbx.updateMatrixWorld(true);
  const meshes = []; fbx.traverse(c => { if (c.isSkinnedMesh) meshes.push(c); });
  // bone prefix
  let hipsB; for (const m of meshes) for (const b of m.skeleton.bones) if (!hipsB && /Hips$/.test(b.name)) hipsB = b;
  const prefix = hipsB.name.slice(0, -4);
  const norm = n => (n.startsWith(prefix) ? n.slice(prefix.length) : n).replace(/^mixamorig\d*[:_]?/, '');
  // bind-world matrices by normalized name
  const bindW = {}; const allBones = {};
  for (const m of meshes) m.skeleton.bones.forEach((b, i) => { const n = norm(b.name); allBones[n] = allBones[n] || b; if (!bindW[n]) bindW[n] = m.skeleton.boneInverses[i].clone().invert(); });
  fbx.traverse(c => { if (c.isBone) { const n = norm(c.name); if (!allBones[n]) allBones[n] = c; if (!bindW[n]) bindW[n] = c.matrixWorld.clone(); } });
  // kept ancestor for any bone
  const keptOf = (b) => { for (let p = b; p; p = p.parent) { const n = norm(p.name || ''); if (p.isBone && KEEP.test(n) && bindW[n]) return n; } return 'Hips'; };
  const keptNames = Object.keys(bindW).filter(n => KEEP.test(n));
  const parentOf = {}; for (const n of keptNames) { let p = allBones[n].parent; let pn = null; while (p && p.isBone) { const q = norm(p.name); if (q !== n && KEEP.test(q)) { pn = q; break; } p = p.parent; } parentOf[n] = pn; }
  // order parents first
  const order = []; const visit = n => { if (order.includes(n)) return; if (parentOf[n]) visit(parentOf[n]); order.push(n); }; keptNames.forEach(visit);
  // vertices in bind-world space
  const parts = [];
  const bb = new THREE.Box3();
  for (const m of meshes) {
    const g = m.geometry; const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const nm = new THREE.Matrix3().getNormalMatrix(m.bindMatrix);
    const N = pos.count; const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), U = new Float32Array(N * 2), SI = new Uint16Array(N * 4), SW = new Float32Array(N * 4);
    const v = new THREE.Vector3();
    const remap = m.skeleton.bones.map(b => keptOf(b));
    for (let i = 0; i < N; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix); P.set([v.x, v.y, v.z], i * 3); bb.expandByPoint(v);
      if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); Nn.set([v.x, v.y, v.z], i * 3); }
      if (uv) U.set([uv.getX(i), uv.getY(i)], i * 2);
      const acc = {}; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) { const n = remap[si.getComponent(i, k)]; acc[n] = (acc[n] || 0) + w; } }
      const ent = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4); const s = ent.reduce((a, e) => a + e[1], 0) || 1;
      ent.forEach(([n, w], k) => { SI[i * 4 + k] = order.indexOf(n); SW[i * 4 + k] = w / s; });
      if (!ent.length) { SI[i * 4] = order.indexOf('Hips'); SW[i * 4] = 1; }
    }
    const idx = g.index ? Array.from(g.index.array) : [...Array(N).keys()];
    const mat = [].concat(m.material)[0];
    parts.push({ name: m.name, P, Nn, U, SI, SW, idx, img: mat.map && mat.map.image, matName: mat.name, hasNormal: !!nor });
  }
  // global transform: feet on 0, hips centred, uniform scale to target height
  const H = bb.max.y - bb.min.y; const k = cfg.height / H;
  const hw = new THREE.Vector3().setFromMatrixPosition(bindW.Hips);
  const G = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-hw.x, -bb.min.y, -hw.z));
  // facing check: left leg on +X means facing +Z
  const lx = new THREE.Vector3().setFromMatrixPosition(bindW.LeftUpLeg).x, rx = new THREE.Vector3().setFromMatrixPosition(bindW.RightUpLeg).x;
  const facingOK = lx > rx;
  // new skeleton
  const W = {}; const bones = {};
  for (const n of order) { const M = G.clone().multiply(bindW[n]); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); M.decompose(p, q, s); W[n] = { p, q }; }
  for (const n of order) {
    const b = new THREE.Bone(); b.name = n; const pn = parentOf[n];
    if (pn) { const qi = W[pn].q.clone().invert(); b.quaternion.copy(qi.clone().multiply(W[n].q)); b.position.copy(W[n].p.clone().sub(W[pn].p).applyQuaternion(qi)); bones[pn].add(b); }
    else { b.quaternion.copy(W[n].q); b.position.copy(W[n].p); }
    bones[n] = b;
  }
  const root = new THREE.Group(); root.name = cfg.id; root.add(bones.Hips);
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(order.map(n => bones[n]));
  // group parts by texture image
  const groups = new Map(); for (const p of parts) { const key = p.img || 'none'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
  const gmeshes = []; const texInfo = []; const webps = [];
  for (const [img, ps] of groups) {
    let nV = 0; const idx = []; const P = [], Nn = [], U = [], SI = [], SW = [];
    for (const p of ps) { for (const i of p.idx) idx.push(i + nV); nV += p.P.length / 3; P.push(p.P); Nn.push(p.Nn); U.push(p.U); SI.push(p.SI); SW.push(p.SW); }
    const cat = (arrs, T) => { const o = new T(arrs.reduce((a, x) => a + x.length, 0)); let off = 0; for (const x of arrs) { o.set(x, off); off += x.length; } return o; };
    const geo = new THREE.BufferGeometry();
    const PP = cat(P, Float32Array); const v = new THREE.Vector3();
    for (let i = 0; i < PP.length; i += 3) { v.fromArray(PP, i).applyMatrix4(G); v.toArray(PP, i); }
    geo.setAttribute('position', new THREE.BufferAttribute(PP, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(cat(Nn, Float32Array), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(cat(U, Float32Array), 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(cat(SI, Uint16Array), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(cat(SW, Float32Array), 4));
    geo.setIndex(idx);
    if (ps.some(p => !p.hasNormal)) geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.85 });
    let alpha = 0;
    if (img !== 'none') {
      alpha = alphaStats(img, ps);
      const size = cfg.tex || 1024;
      const tex = new THREE.CanvasTexture(canvasOf(img, size)); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
      if (alpha > 0.003) { mat.alphaTest = 0.5; tex.userData.mimeType = 'image/png'; const fl = document.createElement('canvas'); fl.width = fl.height = size; const fg = fl.getContext('2d'); fg.translate(0, size); fg.scale(1, -1); fg.drawImage(tex.image, 0, 0); /* glTF : pas de flipY, comme le fait GLTFExporter */ webps.push(await new Promise(r => fl.toBlob(b => b.arrayBuffer().then(a => r(b64(new Uint8Array(a)))), 'image/webp', 0.85))); } else tex.userData.mimeType = 'image/jpeg';
      mat.map = tex;
    }
    const sm = new THREE.SkinnedMesh(geo, mat);
    sm.userData.tris = idx.length / 3;
    texInfo.push({ parts: ps.map(p => p.name), mat: ps[0].matName, alpha: +alpha.toFixed(4), tris: idx.length / 3 });
    gmeshes.push(sm);
  }
  gmeshes.sort((a, b) => b.userData.tris - a.userData.tris);
  gmeshes.forEach((m, i) => { m.name = i === 0 ? 'corps' : (texInfo.find(t => t.tris === m.userData.tris)?.parts.join('_').toLowerCase() || 'part' + i); delete m.userData.tris; m.bind(skel, new THREE.Matrix4()); m.frustumCulled = false; root.add(m); });
  for (const m of gmeshes) { const ti = texInfo.find(t => t.mat && m.material.alphaTest); if (m.material.alphaTest && m.name !== 'corps') m.material.side = THREE.DoubleSide; }

  // animations
  const hipsY = bones.Hips.position.y;
  const clips = []; const stride = {}; const meta = { hipsY };
  for (const [name, file] of cfg.clips) {
    const src = await loadAnim(file); const { clip, prefix: ap, restHipsY } = src;
    const r = hipsY / restHipsY;
    // per-bone offset: target world = source world * off ; limbs re-aimed onto the source bone direction
    const off = {};
    for (const n of order) {
      if (!src.bones[n]) continue;
      let RT = W[n].q.clone();
      const kids = order.filter(c => parentOf[c] === n && src.bones[c]);
      const lead = kids.find(c => /^(Spine|Neck|Head)|HandMiddle1$/.test(c)) || (/Hand$/.test(n) ? null : kids[0]) || null;
      if (lead && !/^(Hips|Spine|Spine1|Spine2|Neck)$/.test(n)) {
        const dT = W[lead].p.clone().sub(W[n].p).normalize(), dS = src.RP[lead].clone().sub(src.RP[n]).normalize();
        RT = new THREE.Quaternion().setFromUnitVectors(dT, dS).multiply(RT);
      }
      off[n] = src.RQ[n].clone().invert().multiply(RT);
    }
    const mx = new THREE.AnimationMixer(src.obj); const act = mx.clipAction(clip); act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.reset().play();
    const hp = clip.tracks.find(t => /Hips\.position$/.test(t.name));
    const times = Float32Array.from(hp.times); const n = times.length;
    const qv = {}; for (const b of order) qv[b] = new Float32Array(n * 4);
    const wq = {}; const tmp = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      mx.setTime(times[i]); src.obj.updateMatrixWorld(true);
      for (const b of order) {
        if (src.bones[b]) wq[b] = src.bones[b].getWorldQuaternion(new THREE.Quaternion()).multiply(off[b]);
        else wq[b] = (parentOf[b] ? wq[parentOf[b]].clone() : new THREE.Quaternion()).multiply(bones[b].quaternion);
        const loc = parentOf[b] ? wq[parentOf[b]].clone().invert().multiply(wq[b]) : wq[b].clone();
        if (i > 0) { tmp.fromArray(qv[b], (i - 1) * 4); if (tmp.dot(loc) < 0) loc.set(-loc.x, -loc.y, -loc.z, -loc.w); }
        loc.toArray(qv[b], i * 4);
      }
    }
    act.stop(); mx.uncacheRoot(src.obj);
    const tracks = order.map(b => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, qv[b]));
    let hipsInfo;
    {
      const vals = Float32Array.from(hp.values).map(x => x * r);
      const T = times[n - 1] - times[0];
      const x0 = vals[0], z0 = vals[2], x1 = vals[(n - 1) * 3], z1 = vals[(n - 1) * 3 + 2];
      hipsInfo = { travel: Math.hypot(x1 - x0, z1 - z0), dx: x1 - x0, dz: z1 - z0 };
      if (name !== 'z_death') {
        for (let i = 0; i < n; i++) { const f = (times[i] - times[0]) / (T || 1); vals[i * 3] -= x0 + (x1 - x0) * f; vals[i * 3 + 2] -= z0 + (z1 - z0) * f; }
      } else {
        for (let i = 0; i < n; i++) { vals[i * 3] -= x0; vals[i * 3 + 2] -= z0; }
      }
      tracks.unshift(new THREE.VectorKeyframeTrack('Hips.position', times, vals));
    }
    // seamless loop: spread end-start error over the clip
    if (LOOPS.has(name)) for (const t of tracks) {
      const s = t.getValueSize(), n = t.times.length, T = t.times[n - 1] - t.times[0]; const v = t.values;
      if (s === 4) {
        const q0 = new THREE.Quaternion().fromArray(v, 0), qN = new THREE.Quaternion().fromArray(v, (n - 1) * 4);
        const d = q0.clone().multiply(qN.clone().invert()); // qN -> q0 (pre-multiply)
        const I = new THREE.Quaternion(), tmp = new THREE.Quaternion(), q = new THREE.Quaternion();
        for (let i = 0; i < n; i++) { tmp.slerpQuaternions(I, d, (t.times[i] - t.times[0]) / T); q.fromArray(v, i * 4).premultiply(tmp).normalize().toArray(v, i * 4); }
      } else {
        for (let c = 0; c < s; c++) { const e = v[c] - v[(n - 1) * s + c]; for (let i = 0; i < n; i++) v[i * s + c] += e * (t.times[i] - t.times[0]) / T; }
      }
    }
    const ac = new THREE.AnimationClip(name, clip.duration, tracks);
    clips.push(ac);
    if (['z_walk', 'z_run', 'z_crawl'].includes(name)) stride[name] = +hipsInfo.travel.toFixed(3);
    meta[name] = { dur: +clip.duration.toFixed(3), travel: +hipsInfo.travel.toFixed(3), tracks: tracks.length };
  }
  // hit times: velocity peak of effectors (relative to hips-space root), then time of max reach after it
  const hit = {}; const hits = {};
  const mixer = new THREE.AnimationMixer(root);
  for (const c of clips) {
    const fx = HIT_FX[c.name]; if (!fx) continue;
    mixer.stopAllAction(); const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.reset().play();
    const N = Math.floor(c.duration * FPS); const P = fx.map(() => []);
    for (let i = 0; i <= N; i++) { mixer.setTime(i / FPS); root.updateMatrixWorld(true); fx.forEach((f, j) => P[j].push(bones[f].getWorldPosition(new THREE.Vector3()))); }
    // speed per frame (max over effectors), forward reach z
    const sp = [], reach = [];
    for (let i = 0; i <= N; i++) { let s = 0, rz = -1e9; fx.forEach((f, j) => { if (i > 0) s = Math.max(s, P[j][i].distanceTo(P[j][i - 1]) * FPS); const pp = P[j][i]; rz = Math.max(rz, pp.z); }); sp.push(s); reach.push(rz); }
    const mx = Math.max(...sp); const peaks = [];
    for (let i = 1; i < N; i++) if (sp[i] >= sp[i - 1] && sp[i] >= sp[i + 1] && sp[i] > 0.6 * mx && (!peaks.length || i - peaks[peaks.length - 1] > 8)) peaks.push(i);
    // blow lands when speed drops after the peak: first frame after peak where speed < 40% of peak, or max reach within 0.25 s
    const lands = peaks.map(i => { let best = i; for (let j = i; j <= Math.min(N, i + 8); j++) if (reach[j] > reach[best]) best = j; return +(best / FPS).toFixed(2); });
    hit[c.name] = lands[0]; hits[c.name] = lands; meta[c.name].peakSpeed = +mx.toFixed(2);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  // reset pose
  skel.pose();
  const tris = gmeshes.reduce((a, m) => a + m.geometry.index.count / 3, 0);
  root.userData = { kind: cfg.id, height: +cfg.height.toFixed(3), stride, hit, hits };
  const scene = new THREE.Scene(); scene.userData = root.userData; scene.add(root);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
  return { id: cfg.id, glb: b64(new Uint8Array(glb)), webps, meta: { ...meta, tris, bones: order.length, facingOK, srcHeight: +H.toFixed(1), scale: +k.toFixed(5), texInfo, userData: root.userData, missing: ['Neck','Head','LeftHand','RightHand','LeftFoot','RightFoot','LeftToeBase'].filter(n => !bones[n]) } };
}

window.__main = async (cfgs) => { const out = []; for (const c of cfgs) { console.log('build ' + c.id); out.push(await buildModel(c)); } return out; };
