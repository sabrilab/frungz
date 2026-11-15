// window.__main({files:[url...], clips:[[name, frac]...], cell:[w,h]}) -> {report, png}
window.__main = async ({ files, cols, cell }) => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [W, H] = cell; const sheet = document.createElement('canvas'); sheet.width = W * cols.length + 110; sheet.height = H * files.length + 30;
  const g = sheet.getContext('2d'); g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, sheet.width, sheet.height); g.fillStyle = '#fff'; g.font = '16px sans-serif';
  cols.forEach(([c, f], j) => g.fillText(c + ' @' + f, 110 + j * W + 8, 20));
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const report = {};
  for (let r = 0; r < files.length; r++) {
    const gltf = await loader.loadAsync(files[r]);
    const root = gltf.scene; const ud = root.userData; const top = root.children[0];
    const rep = { sceneUserData: ud, rootUserData: top.userData, clips: gltf.animations.map(a => a.name + ':' + a.duration.toFixed(2) + ':' + a.tracks.length), bones: [], meshes: [], issues: [] };
    root.traverse(o => { if (o.isBone) rep.bones.push(o.name); if (o.isMesh) rep.meshes.push(o.name + ' ' + o.type + ' tris=' + o.geometry.index.count / 3 + ' mat=' + o.material.type + ' map=' + (o.material.map ? o.material.map.image.width : 0) + ' alphaTest=' + o.material.alphaTest + ' transp=' + o.material.transparent + ' rough=' + o.material.roughness); });
    if (rep.bones.some(b => /[:]|mixamo/i.test(b))) rep.issues.push('bad bone names');
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true); rep.restBox = [box.min.toArray(), box.max.toArray()].map(a => a.map(v => +v.toFixed(3)));
    const mixer = new THREE.AnimationMixer(root);
    rep.clipChecks = {};
    for (const c of gltf.animations) {
      mixer.stopAllAction(); const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.reset().play(); let minY = 1e9, maxDim = 0, minYs = [];
      for (let i = 0; i <= 8; i++) { mixer.setTime(c.duration * i / 8 * 0.999); root.updateMatrixWorld(true); root.traverse(o => o.isSkinnedMesh && o.skeleton.update()); const b = new THREE.Box3().setFromObject(root, true); minY = Math.min(minY, b.min.y); minYs.push(+b.min.y.toFixed(2)); const s = b.getSize(new THREE.Vector3()); maxDim = Math.max(maxDim, s.x, s.y, s.z); }
      rep.clipChecks[c.name] = { minY: +minY.toFixed(3), maxDim: +maxDim.toFixed(2), minYs: minYs.join(' ') };
      if (maxDim > (ud.height || 1.8) * 1.9) rep.issues.push(c.name + ' maxDim ' + maxDim.toFixed(2));
    }
    // render cells
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a8a8a);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(3, 6, 5); scene.add(dl);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 1 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    scene.add(root);
    const h = ud.height || 1.8; const cam = new THREE.PerspectiveCamera(35, W / H, 0.05, 50);
    cam.position.set(1.5 * h, 0.95 * h, 2.3 * h); cam.lookAt(0.1 * h, 0.45 * h, -0.2 * h);
    g.fillStyle = '#fff'; g.fillText(files[r].split('/').pop().replace('.glb', ''), 6, 30 + r * H + H / 2);
    for (let j = 0; j < cols.length; j++) {
      const [cn, f] = cols[j]; const c = gltf.animations.find(a => a.name === cn); mixer.stopAllAction();
      if (c) { const a = mixer.clipAction(c); a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; a.reset().play(); mixer.setTime(c.duration * f); }
      root.updateMatrixWorld(true); renderer.render(scene, cam); g.drawImage(renderer.domElement, 110 + j * W, 30 + r * H);
    }
    report[files[r].split('/').pop()] = rep;
  }
  return { report, png: sheet.toDataURL('image/png') };
};
