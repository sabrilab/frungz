// Plan vu de dessus d'une carte (style plan technique) à partir de son fichier de plan : node cartes/plan.mjs centre → cartes/centre/plan.svg
// Le même fichier servira à construire le 3D et le gameplay.json : une seule source, rien à recopier.
import fs from 'fs';
const id = process.argv[2] || 'centre', P = JSON.parse(fs.readFileSync(new URL(`./${id}/plan.json`, import.meta.url))), L = P.limites, B = P.batiment, K = 8, M = 30;
const X = (x) => (x - L.x0) * K + M, Z = (z) => (z - L.z0) * K + M + 60, W = (L.x1 - L.x0) * K + 2 * M + 330, H = (L.z1 - L.z0) * K + 2 * M + 60;
const rect = ([x0, z0, x1, z1], a) => `<rect x="${X(x0)}" y="${Z(z0)}" width="${(x1 - x0) * K}" height="${(z1 - z0) * K}" ${a}/>`;
const txt = (x, z, t, a = '') => `<text x="${X(x)}" y="${Z(z)}" ${a}>${t}</text>`, mid = ([x0, z0, x1, z1]) => [(x0 + x1) / 2, (z0 + z1) / 2];
const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]));
let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Menlo,Consolas,monospace" font-size="11" fill="#d6e8ff">
<defs><pattern id="g" width="${10 * K}" height="${10 * K}" patternUnits="userSpaceOnUse" x="${M}" y="${M + 60}"><path d="M0 0H${10 * K}V${10 * K}" fill="none" stroke="rgba(255,255,255,.09)"/></pattern>
<pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V8" stroke="rgba(190,220,255,.35)"/></pattern></defs>
<rect width="100%" height="100%" fill="#0a2a4f"/><rect x="${M}" y="${M + 60}" width="${(L.x1 - L.x0) * K}" height="${(L.z1 - L.z0) * K}" fill="url(#g)" stroke="#d6e8ff" stroke-width="2"/>
<text x="${M}" y="34" font-size="26" font-weight="bold" fill="#fff">${P.nom.toUpperCase()}</text><text x="${M}" y="56" fill="#9fc3ee">PLAN N° FRZ-${P.id.toUpperCase()} · ${P.desc} · ${L.x1 - L.x0} × ${L.z1 - L.z0} m · carreau = 10 m · nord en haut</text>`;
for (let x = L.x0 + P.secteur; x < L.x1; x += P.secteur) s += `<line x1="${X(x)}" y1="${Z(L.z0)}" x2="${X(x)}" y2="${Z(L.z1)}" stroke="#ffcc3d" stroke-dasharray="3 9" opacity=".5"/>`;
for (let z = L.z0 + P.secteur; z < L.z1; z += P.secteur) s += `<line x1="${X(L.x0)}" y1="${Z(z)}" x2="${X(L.x1)}" y2="${Z(z)}" stroke="#ffcc3d" stroke-dasharray="3 9" opacity=".5"/>`;
for (const r of P.rues) { s += rect(r.rect, 'fill="rgba(0,0,0,.25)" stroke="rgba(190,220,255,.4)"'); const [x, z] = mid(r.rect); s += txt(x, z, r.nom.toUpperCase(), `text-anchor="middle" fill="#9fc3ee" ${r.rect[2] - r.rect[0] < 20 ? `transform="rotate(-90 ${X(x)} ${Z(z)})"` : ''}`); }
s += rect(P.parking.rect, 'fill="rgba(255,255,255,.03)" stroke="rgba(190,220,255,.5)" stroke-dasharray="6 4"') + txt(P.parking.rect[0] + 2, P.parking.rect[1] + 4, 'PARKING', 'fill="#9fc3ee"');
for (const [x0, z, x1] of P.parking.rangees) for (let x = x0; x < x1; x += 2.8) s += `<rect x="${X(x)}" y="${Z(z - 2.4)}" width="${2.4 * K}" height="${4.8 * K}" fill="none" stroke="rgba(190,220,255,.35)"/>`;
for (const t of P.parking.terre_plein) s += rect(t, 'fill="rgba(90,200,120,.25)" stroke="#7fd69a"');
for (const a of P.parking.abris) { s += rect(a.rect, 'fill="url(#h)" stroke="#d6e8ff" stroke-width="1.5"'); const [x, z] = mid(a.rect); if (a.type === 'conteneur') s += rect(a.rect, 'fill="rgba(255,157,61,.35)" stroke="#ff9d3d" stroke-width="1.5"'); else if (a.type !== 'muret') s += txt(x, a.rect[3] + 2.2, a.nom, 'text-anchor="middle" font-size="9.5"'); }
s += `<polygon points="${B.arcade.poly.map(([x, z]) => X(x) + ',' + Z(z)).join(' ')}" fill="rgba(255,204,61,.12)" stroke="#ffcc3d" stroke-dasharray="5 3"/>` + txt(-66, -16.5, 'ARCADE COUVERTE · TERRASSE À L\'ÉTAGE', 'fill="#ffcc3d" font-size="9.5"');
for (const a of [...B.ailes, B.atrium]) s += rect(a.rect, 'fill="rgba(120,180,255,.10)" stroke="#fff" stroke-width="2.5"');
for (const a of B.ailes) s += rect(a.galerie, 'fill="rgba(255,255,255,.07)" stroke="rgba(190,220,255,.5)"') + txt(...mid(a.galerie), 'GALERIE · PASSERELLES À L\'ÉTAGE', `text-anchor="middle" fill="#9fc3ee" font-size="9.5" ${a.id === 'est' ? `transform="rotate(-90 ${X(mid(a.galerie)[0])} ${Z(mid(a.galerie)[1])})"` : ''}`);
for (const [x0, z0, x1, z1, n] of B.boutiques) { s += rect([x0, z0, x1, z1], 'fill="none" stroke="rgba(190,220,255,.6)"'); const [x, z] = mid([x0, z0, x1, z1]); s += txt(x, z + 0.5, n, `text-anchor="middle" ${x1 - x0 < 20 ? `transform="rotate(-90 ${X(x)} ${Z(z)})"` : ''}`); }
const F = B.atrium.fontaine; s += `<circle cx="${X(F[0])}" cy="${Z(F[1])}" r="${F[2] * K}" fill="rgba(90,170,255,.3)" stroke="#8fc4ff"/>` + txt(50, -57, 'ATRIUM · VERRIÈRE', 'text-anchor="middle" fill="#fff"');
for (const m of B.montees.filter((m) => m.type === 'toit')) s += `<rect x="${X(m.pos[0]) - 11}" y="${Z(m.pos[1]) - 11}" width="22" height="22" fill="#0a2a4f" stroke="#ff9d3d" stroke-width="2"/><path d="M${X(m.pos[0]) - 6} ${Z(m.pos[1]) + 6}v-4h4v-4h4v-4h4" fill="none" stroke="#ff9d3d" stroke-width="2"/>`;
for (const m of B.montees.filter((m) => m.type !== 'toit')) s += `<rect x="${X(m.pos[0]) - 16}" y="${Z(m.pos[1]) - 9}" width="32" height="18" fill="#0a2a4f" stroke="#7fd69a" stroke-width="1.5"/><path d="M${X(m.pos[0]) - 10} ${Z(m.pos[1])}h20m-6 -5l6 5l-6 5" fill="none" stroke="#7fd69a" stroke-width="1.5"/>`;
for (const [x, z] of B.entrees) s += `<circle cx="${X(x)}" cy="${Z(z)}" r="6" fill="#0a2a4f" stroke="#fff" stroke-width="2"/><circle cx="${X(x)}" cy="${Z(z)}" r="2" fill="#fff"/>`;
for (const [a, b] of P.vues) s += `<line x1="${X(a[0])}" y1="${Z(a[1])}" x2="${X(b[0])}" y2="${Z(b[1])}" stroke="#ff7a7a" stroke-width="1" stroke-dasharray="2 5"/>`;
const C = { ordre: '#3d8bff', civils: '#34c759' };
for (const [k, sp] of Object.entries(P.spawns)) { s += rect(sp.rect, `fill="${C[k]}" fill-opacity=".35" stroke="${C[k]}" stroke-width="2"`); const [x, z] = mid(sp.rect); s += txt(x, z + 0.6, 'DÉPART ' + sp.nom.toUpperCase(), `text-anchor="middle" fill="#fff" font-weight="bold" ${sp.rect[2] - sp.rect[0] < 10 ? `transform="rotate(-90 ${X(x)} ${Z(z)})"` : ''}`); }
for (const z of P.zones) s += `<circle cx="${X(z.pos[0])}" cy="${Z(z.pos[1])}" r="${3.8 * K}" fill="rgba(255,204,61,.18)" stroke="#ffcc3d" stroke-width="2"/><circle cx="${X(z.pos[0])}" cy="${Z(z.pos[1])}" r="13" fill="#ffcc3d"/><text x="${X(z.pos[0])}" y="${Z(z.pos[1]) + 5}" text-anchor="middle" font-size="15" font-weight="bold" fill="#1a1300">${z.id}</text>`;
// cartouche
const lx = (L.x1 - L.x0) * K + M + 24; let y = 96; const line = (t, c = '#d6e8ff', b = false) => { s += `<text x="${lx}" y="${y}" fill="${c}" ${b ? 'font-weight="bold" font-size="13"' : ''}>${t}</text>`; y += b ? 22 : 17; };
line('ZONES', '#ffcc3d', true); const sb = mid(P.spawns.ordre.rect), sf = mid(P.spawns.civils.rect);
for (const z of P.zones) line(`${z.id} ${z.nom} (${z.niveau ? 'étage' : 'rez-de-ch.'})  B ${dist(sb, z.pos)} m · F ${dist(sf, z.pos)} m`);
y += 8; line('LÉGENDE', '#ffcc3d', true); line('▭ trait blanc épais : murs du bâtiment'); line('◉ entrées', '#fff'); line('→ escalators et escaliers', '#7fd69a'); line('▨ abris : kiosque, chariots, camion, murets'); line('▬ conteneurs (un ouvert, deux empilés)', '#ff9d3d'); line('◰ escaliers vers le toit (accessible)', '#ff9d3d'); line('┄ jaune : secteurs de ' + P.secteur + ' m', '#ffcc3d'); line('┄ rouge : plus longues lignes de vue', '#ff7a7a');
y += 8; line('TROIS COULOIRS', '#ffcc3d', true); line('1. galeries du rez-de-chaussée'); line('2. passerelles et terrasse de l\'étage'); line('3. parking à découvert'); line('+ le toit : vue sur le parking, peu d\'abris');
y += 8; line('BUDGET', '#ffcc3d', true); line(`${P.budget.triangles / 1000} 000 triangles (Paris : 1 800 000)`); line(`${P.budget.objets} objets à dessiner au plus`); line(P.joueurs);
const vmax = Math.max(...P.vues.map(([a, b]) => dist(a, b))); line(`ligne de vue la plus longue : ${vmax} m`);
fs.writeFileSync(new URL(`./${id}/plan.svg`, import.meta.url), s + '</svg>'); console.log('plan écrit', W, H, 'vue max', vmax, P.zones.map((z) => `${z.id} B${dist(sb, z.pos)} F${dist(sf, z.pos)}`).join(' '));
