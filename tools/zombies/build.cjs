// node build.cjs [ids...]  (serveur http-server sur /home/user au port 8150, voir README)
// -> GLB bruts dans $TMPDIR/zombies-raw, puis optimize.mjs -> public/assets/zombies/<id>.glb
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process'); const run = require('./drv.cjs');
const RAW = path.join(os.tmpdir(), 'zombies-raw'), OUT = path.join(__dirname, '../../public/assets/zombies');
const Z = (n) => `Liam@zombie_${n}.fbx`, M = (n) => `CreaturePackBeta/Beta@mutant_${n}.fbx`;
const HUMAN = [['z_idle', Z('idle (1)')], ['z_idle2', Z('scratch_idle')], ['z_walk', Z('walk')], ['z_run', Z('run')], ['z_attack', Z('attack')], ['z_punch', Z('punching (1)')], ['z_bite', Z('neck_bite')], ['z_headbutt', Z('headbutt (1)')], ['z_kick', Z('kicking')], ['z_hit', Z('reaction_hit')], ['z_death', Z('death')], ['z_scream', Z('scream')], ['z_crawl', Z('crawl')], ['z_standup', Z('stand_up (1)')]];
const MUT = [['z_idle', M('breathing_idle')], ['z_walk', M('walking')], ['z_run', M('run')], ['z_attack', M('swiping')], ['z_punch', M('punch')], ['z_scream', M('roaring')], ['z_jump', M('jump_attack')], ['z_death', M('dying')], ['z_hit', Z('reaction_hit')]];
const MODELS = [
  { id: 'rodeur', src: 'Zombie.fbx', height: 1.80, clips: HUMAN },
  { id: 'policier', src: 'Copzombie_L_Actisdato.fbx', height: 1.84, clips: HUMAN },
  { id: 'femme', src: 'Zombiegirl_W_Kurniawan.fbx', height: 1.72, clips: HUMAN },
  { id: 'soldat', src: 'Warzombie_F_Pedroso.fbx', height: 1.82, clips: HUMAN },
  { id: 'contamine', src: 'Parasite_L_Starkie.fbx', height: 1.78, clips: HUMAN },
  { id: 'decharne', src: 'Skeletonzombie_T_Avelange.fbx', height: 1.80, clips: HUMAN },
  { id: 'mastodonte', src: 'Mutant.fbx', height: 2.5, clips: MUT },
];
module.exports = { MODELS };
if (require.main === module) (async () => {
  const ids = process.argv.slice(2); const sel = MODELS.filter(m => !ids.length || ids.includes(m.id));
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const res = await run('build.js', sel);
  for (const r of res) {
    const raw = path.join(RAW, r.id + '.glb'); fs.writeFileSync(raw, Buffer.from(r.glb, 'base64')); fs.writeFileSync(path.join(RAW, r.id + '.json'), JSON.stringify(r.meta, null, 1));
    const webps = (r.webps || []).map((w, i) => { const f = path.join(RAW, `${r.id}_${i}.webp`); fs.writeFileSync(f, Buffer.from(w, 'base64')); return f; });
    execFileSync('node', [path.join(__dirname, 'optimize.mjs'), raw, path.join(OUT, r.id + '.glb'), ...webps], { stdio: 'inherit' });
    console.log(r.id, 'tris', r.meta.tris, 'octets', fs.statSync(path.join(OUT, r.id + '.glb')).size, JSON.stringify(r.meta.userData));
  }
})();
