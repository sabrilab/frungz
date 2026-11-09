const { chromium } = require('playwright'); const fs = require('fs');
const PLAN = [
  { name: 'MX_Idle', src: 'rifle_aiming_idle' },
  { name: 'MX_IdleLow', src: 'rifle_idle' },
  { name: 'MX_Run', src: 'rifle_run' },
  { name: 'MX_RunAim', src: 'rifle_run', upper: 'rifle_aiming_idle' },
  { name: 'MX_RunBack', src: 'backwards_rifle_run', upper: 'rifle_aiming_idle' },
  { name: 'MX_RunLeft', src: 'jog_strafe_left', upper: 'rifle_aiming_idle' },
  { name: 'MX_RunRight', src: 'jog_strafe_right', upper: 'rifle_aiming_idle' },
  { name: 'MX_WalkF', src: 'standing_aim_walk_forward' },
  { name: 'MX_WalkB', src: 'standing_aim_walk_back' },
  { name: 'MX_WalkL', src: 'standing_aim_walk_left' },
  { name: 'MX_WalkR', src: 'standing_aim_walk_right' },
  { name: 'MX_Jump', src: 'rifle_jump' },
  { name: 'MX_Fall', src: 'fall_a_loop', upper: 'rifle_aiming_idle' },
  { name: 'MX_Land', src: 'fall_a_land_to_run_forward', upper: 'rifle_aiming_idle' },
  { name: 'MX_CrouchWalk', src: 'rifle_crouch_walk' },
  { name: 'MX_CrouchIdle', src: 'rifle_kneel_idle' },
  { name: 'MX_Death', src: 'rifle_death', inPlace: false },
  { name: 'MX_Vault', src: 'vault_over_box' },
];
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  p.on('console', (m) => console.log('[c]', m.text().slice(0, 300))); p.on('pageerror', (e) => console.log('[err]', e.message));
  await p.goto(`http://localhost:8140/bake/index.html?char=${process.argv[2] || 'Punk'}&plan=` + encodeURIComponent(JSON.stringify(PLAN)));
  await p.waitForFunction('window.__done', null, { timeout: 300000 });
  const s = await p.evaluate(() => window.__out); fs.writeFileSync(process.argv[3] || 'mx.json', s); console.log('bytes', s.length); await b.close(); })();
