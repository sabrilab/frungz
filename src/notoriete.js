// Notoriété : plus on réussit dans la partie, plus on parle de toi.
// - Frungz : niveau de recherche en étoiles (1 à 5, puis « ennemi public n°1 »)
// - Brigade : grades de la police nationale, de gardien de la paix à commissaire divisionnaire (puis préfet de police)
// La notoriété suit les galons de la partie (élimination, tir à la tête, assistance, capture, barricade abattue) plus une
// petite part des points rapportés à l'équipe (vols, saccage, interpellations). Elle ne donne aucun avantage : c'est de la mise
// en scène (étoiles et grade au-dessus de la tête, dans le classement et le fil des éliminations).
//
// FRUNGZ INFO : de petites cinématiques en incrustation façon journal télévisé. Un présentateur en plateau annonce
// l'événement (voix de synthèse du navigateur si elle existe, sous-titres sinon), puis l'image passe à l'hélicoptère de
// la chaîne qui filme la scène en direct. La température de la partie (calme → tensions → affrontements → émeute → chaos)
// se lit sous le score et règle la fréquence et le ton des flashs : la partie démarre doucement et finit en foire d'empoigne.
import * as THREE from 'three';
import { chars, makeCharacter } from './assets.js';
import { registerSkin } from './skins.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (l) => l[(Math.random() * l.length) | 0];
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[<&>]/g, '');

// ---------------------------------------------------------------- paliers
export const STARS = [3, 8, 15, 25, 40]; // notoriété pour 1★ … 5★
export const GRADES = [
  { n: 0, nom: 'Gardien de la paix', ab: 'GPX' }, { n: 3, nom: 'Brigadier', ab: 'BG' }, { n: 7, nom: 'Brigadier-chef', ab: 'BC' },
  { n: 12, nom: 'Major', ab: 'MAJ' }, { n: 18, nom: 'Lieutenant', ab: 'LTN' }, { n: 26, nom: 'Capitaine', ab: 'CNE' },
  { n: 36, nom: 'Commandant', ab: 'CDT' }, { n: 48, nom: 'Commissaire', ab: 'COM' }, { n: 62, nom: 'Commissaire divisionnaire', ab: 'CD' },
  { n: 80, nom: 'Préfet de police', ab: 'PP' },
];
const starsOf = (n) => STARS.filter((s) => n >= s).length;
const gradeOf = (n) => { let g = 0; for (let i = 0; i < GRADES.length; i++) if (n >= GRADES[i].n) g = i; return g; };
// nom à l'antenne : le pseudo du joueur, ou un surnom si on n'en a pas choisi
const onAir = (a) => (a && a.bot === false && (!a.name || a.name === 'Toi') ? (a.team === 'civils' ? 'Le Masqué' : 'Agent Duval') : a?.name);
const level = (a) => (a.team === 'civils' ? a.stars || 0 : a.grade || 0);
// température de la partie
const CHAOS = [
  { nom: 'CALME', col: '#9aa3ad', tag: 'FLASH INFO', gap: 46 },
  { nom: 'TENSIONS', col: '#ffd23d', tag: 'FLASH INFO', gap: 36 },
  { nom: 'AFFRONTEMENTS', col: '#ff9a2f', tag: 'ALERTE INFO', gap: 28 },
  { nom: 'ÉMEUTE', col: '#ff4a3d', tag: 'URGENT', gap: 22 },
  { nom: 'CHAOS', col: '#ff2f6d', tag: 'ÉDITION SPÉCIALE', gap: 16 },
];
const STARS_TXT = (n) => '★'.repeat(n);
const LIEU = () => (window.__map === 'banlieue' ? { a: 'aux Hauts de Frungz', nom: 'LES HAUTS DE FRUNGZ' } : { a: 'place Frungz', nom: 'PLACE FRUNGZ' });

// présentateurs du journal (persos de base habillés sobrement)
const PRES = {
  F: { id: '__pres_F', name: 'Présentatrice', team: 'civils', body: 'F', peau: '#e2b597', hair: 'Hair_Long', hairColor: '#3b2416',
    bas: { id: 'jean_noir', c: '#1d2028' }, pieds: { id: 'baskets', c: '#151618', c2: '#151618' }, haut: { id: 'polo', c: '#7a1f2b', c2: '#7a1f2b' }, gilet: { id: 'aucun' }, mains: { id: 'aucun' }, tete: { id: 'aucun' }, visage: { id: 'aucun' }, extras: [] },
  M: { id: '__pres_M', name: 'Présentateur', team: 'civils', body: 'M', peau: '#c99474', hair: 'Hair_SimpleParted', hairColor: '#1a120c', barbe: false,
    bas: { id: 'jean_noir', c: '#1d2028' }, pieds: { id: 'baskets', c: '#151618', c2: '#151618' }, haut: { id: 'polo', c: '#1d2a4a', c2: '#1d2a4a' }, gilet: { id: 'aucun' }, mains: { id: 'aucun' }, tete: { id: 'aucun' }, visage: { id: 'aucun' }, extras: [] },
};
const MALE_VOICES = /thomas|henri|paul|daniel|claude|nicolas|jacques|s[ée]bastien|gr[ée]goire|r[ée]mi|jean|antoine|mathieu|guillaume|yves|fabrice|olivier/i;
const NOVELTY = /eddy|flo|grand|reed|rocko|sandy|shelley|bad|bells|boing|bubbles|cellos|good|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|fred|junior|kathy|ralph/i;

// ---------------------------------------------------------------- textures (étoiles et grades au-dessus de la tête)
const badgeTex = {};
function badgeTexture(team, lv) {
  const key = team + lv; if (badgeTex[key]) return badgeTex[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.lineJoin = 'round';
  if (team === 'civils') {
    const star = (cx, cy, r, fill) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.85)'; g.stroke(); g.fillStyle = fill; g.fill(); };
    for (let i = 0; i < 5; i++) star(32 + i * 48, 32, 22, i < lv ? '#ffcc3d' : 'rgba(40,40,40,.65)');
  } else {
    const G = GRADES[lv]; g.font = '900 34px Inter, Arial, sans-serif'; const w = Math.min(244, g.measureText(G.ab).width + 70);
    g.fillStyle = 'rgba(10,18,40,.88)'; g.strokeStyle = '#d8e3ff'; g.lineWidth = 4; const x0 = 128 - w / 2;
    g.beginPath(); g.roundRect(x0, 8, w, 48, 12); g.fill(); g.stroke();
    // barrettes de grade
    const bars = Math.min(5, Math.max(1, lv - 2)); for (let i = 0; i < bars; i++) { g.fillStyle = lv >= 7 ? '#ffcc3d' : '#d8e3ff'; g.fillRect(x0 + 12 + i * 8, 18, 5, 28); }
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(G.ab, x0 + 18 + bars * 8, 33);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; badgeTex[key] = t; return t;
}

// ---------------------------------------------------------------- styles (injectés : le module reste autonome)
const CSS = `
#chaos{position:absolute;top:124px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:7px;background:rgba(8,10,16,.55);padding:3px 9px;border-radius:9px;font:900 10px Inter;letter-spacing:.12em;color:var(--c,#9aa3ad);pointer-events:none;text-shadow:0 1px 2px #000;white-space:nowrap}
#chaos .seg{display:flex;gap:3px}#chaos .seg i{width:14px;height:5px;border-radius:2px;background:rgba(255,255,255,.18)}#chaos .seg i.f{background:var(--c);box-shadow:0 0 6px var(--c)}
#chaos.up{animation:chaosup .9s cubic-bezier(.3,1.8,.5,1)}#chaos.l4 .seg i.f{animation:chaosblink .5s steps(1) infinite}
@keyframes chaosup{0%{transform:translateX(-50%) scale(1.8)}100%{transform:translateX(-50%) scale(1)}}@keyframes chaosblink{50%{opacity:.35}}
#notopop{position:absolute;top:156px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;opacity:0}
#notopop b{display:block;font:30px Bungee,Inter;letter-spacing:.06em;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.6)}
#notopop small{display:block;font:800 12px Inter;letter-spacing:.14em;color:#fff;text-shadow:0 1px 3px #000;margin-top:2px}
#notopop .st{font-size:34px;letter-spacing:.08em;color:#ffcc3d}#notopop .st i{font-style:normal;color:rgba(30,30,30,.7);-webkit-text-stroke:1px rgba(255,255,255,.35)}#notopop .st em{font-style:normal;display:inline-block;animation:starin .6s cubic-bezier(.3,2,.5,1) both .15s}
#notopop.on{animation:notopop 2.6s ease-out forwards}
@keyframes notopop{0%{opacity:0;transform:translateX(-50%) scale(.6)}8%{opacity:1;transform:translateX(-50%) scale(1.08)}14%{transform:translateX(-50%) scale(1)}85%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}
@keyframes starin{0%{transform:scale(3) rotate(-40deg);opacity:0}100%{transform:none;opacity:1}}
.nb{display:inline-block;margin-left:4px;font:900 9px Inter;letter-spacing:.02em;vertical-align:1px}.nb.s{color:#ffcc3d}.nb.g{color:#d8e3ff;background:rgba(30,50,110,.8);border-radius:4px;padding:0 4px}.nb.g.top{color:#111;background:#ffcc3d}
#rank .noto{margin:6px 0 2px;font:800 11px Inter;color:#cfd6e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#rank .noto>*{margin-right:6px;vertical-align:middle}#rank .noto .st{color:#ffcc3d;font-size:15px;letter-spacing:.06em}#rank .noto .st i{font-style:normal;color:rgba(255,255,255,.18)}#rank .noto .gr{background:rgba(30,50,110,.85);color:#fff;border-radius:5px;padding:1px 6px;font-weight:900}#rank .noto small{color:var(--dim);font-weight:700}
#news{position:absolute;left:16px;top:96px;width:340px;height:212px;border-radius:6px;overflow:hidden;pointer-events:none;opacity:0;transform:translateX(-30px);transition:opacity .2s,transform .35s cubic-bezier(.3,1.5,.5,1);box-shadow:0 0 0 2px rgba(255,255,255,.85),0 8px 26px rgba(0,0,0,.55);font-family:Inter,Arial,sans-serif;z-index:3}
#news.on{opacity:1;transform:none}body.newson #rank{opacity:0;transition:opacity .2s}
#news .wipe{position:absolute;inset:0;background:linear-gradient(100deg,#c8102e 0 46%,#fff 46% 50%,#0b1e4d 50%);transform:translateX(-102%);z-index:4}
#news.sting .wipe{animation:nwipe .75s cubic-bezier(.7,0,.3,1)}#news.cut .wipe{animation:nwipe .45s cubic-bezier(.7,0,.3,1);background:linear-gradient(100deg,#fff 0 4%,#0b1e4d 4%)}
@keyframes nwipe{0%{transform:translateX(-102%)}45%,55%{transform:none}100%{transform:translateX(102%)}}
#news .bug{position:absolute;top:7px;left:8px;font:900 11px Inter;letter-spacing:.04em;color:#fff;background:#0b1e4d;padding:2px 6px;border-radius:3px;z-index:2;box-shadow:0 1px 4px rgba(0,0,0,.4)}#news .bug b{color:#ff3b4a;margin-left:3px}
#news .live{position:absolute;top:7px;right:8px;font:900 9.5px Inter;letter-spacing:.1em;color:#fff;background:#c8102e;padding:2px 6px;border-radius:3px;z-index:2;display:none}#news.l .live{display:block}
#news .loc{position:absolute;top:27px;left:8px;font:800 9px Inter;letter-spacing:.1em;color:#fff;text-shadow:0 1px 2px #000;z-index:2;display:none}#news.l .loc{display:block}#news.v .say{display:none}#news.v.l .say{display:block}
#news .low{position:absolute;left:0;right:0;bottom:16px;z-index:2;display:flex;flex-direction:column;align-items:flex-start}
#news .who{background:rgba(11,30,77,.92);color:#fff;font:800 9.5px Inter;letter-spacing:.04em;padding:2px 7px}#news .who:empty{display:none}#news.dx::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:2px;background:#fff;z-index:2}#news .tag{background:#c8102e;color:#fff;font:900 9.5px Inter;letter-spacing:.1em;padding:2px 7px}
#news .head{background:rgba(255,255,255,.96);color:#0b1e4d;font:900 13px/1.15 Inter;padding:4px 8px;max-width:100%;box-sizing:border-box;text-transform:uppercase;letter-spacing:.01em}
#news .say{position:absolute;left:8px;right:8px;top:44px;z-index:2;font:700 11.5px/1.3 Inter;color:#fff;text-align:center;text-shadow:0 1px 2px #000,0 0 6px #000}
#news .tick{position:absolute;left:0;right:0;bottom:0;height:16px;background:#0b1e4d;color:#fff;font:700 10px/16px Inter;white-space:nowrap;overflow:hidden;z-index:2}#news .tick span{display:inline-block;padding-left:100%;animation:ntick 22s linear infinite}
body.touch #news{left:auto;right:var(--sr,10px);top:calc(var(--st,8px) + 2px);width:168px;height:96px}body.touch #news .loc,body.touch #news .bug{font-size:8px}body.touch #news .live{font-size:7.5px}body.touch #news .say{display:none!important}body.touch #news .tick{display:none}body.touch #news .low{bottom:4px}body.touch #news .head{font-size:10px;padding:3px 6px}body.touch.newson #feed{opacity:0}body.touch #chaos{top:calc(var(--st,8px) + 44px);font-size:8.5px;padding:2px 7px}body.touch #chaos .seg i{width:9px}body.touch #notopop{top:calc(var(--st,8px) + 66px)}body.touch #notopop b{font-size:20px}body.touch #notopop .st{font-size:24px}
@keyframes ntick{to{transform:translateX(-100%)}}
#news.u .tag{background:#ff2f6d;animation:chaosblink .6s steps(1) infinite}
#news .rec{position:absolute;inset:0;z-index:1;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.35))}
@media (max-width:760px),(max-height:520px){#news{width:204px;height:122px;top:90px;left:10px}#news .say,#news.v.l .say{display:none}#news .head{font-size:10.5px;padding:3px 6px}#news .tick{display:none}#news .low{bottom:4px}#chaos{top:112px}#notopop{top:140px}#notopop b{font-size:22px}#notopop .st{font-size:26px}}
`;

export function installNotoriete(Game) {
  const P = Game.prototype;

  // ---------------------------------------------------------------- notoriété
  P.notoAdd = function (a, n) {
    if (!a || a.gone || a.temp || !(n > 0)) return;
    a.noto = (a.noto || 0) + n;
    if (a.team === 'civils') { const s = starsOf(a.noto); if (s > (a.stars || 0)) { const o = a.stars || 0; a.stars = s; this.notoUp(a, o, s); } }
    else { const g = gradeOf(a.noto); if (g > (a.grade || 0)) { const o = a.grade || 0; a.grade = g; this.notoUp(a, o, g); } }
  };
  P.notoUp = function (a, from, to) {
    this.notoBadge3d(a);
    const N = this.news; if (!N) return;
    const me = a === this.player, civ = a.team === 'civils', zone = this.newsZone(a.pos);
    if (me) {
      const el = $('notopop');
      if (el) {
        el.innerHTML = civ ? `<b style="color:#ffcc3d">${to >= 5 ? 'ENNEMI PUBLIC' : 'RECHERCHÉ'}</b><div class="st">${'★'.repeat(to - 1)}<em>★</em><i>${'★'.repeat(5 - to)}</i></div><small>${to >= 5 ? 'tout le quartier parle de toi' : `niveau de recherche ${to} / 5`}</small>`
          : `<b style="color:#d8e3ff">PROMOTION</b><div class="st" style="color:#fff;font:26px Bungee,Inter">${GRADES[to].nom.toUpperCase()}</div><small>${GRADES[to + 1] ? `prochain grade : ${GRADES[to + 1].nom}` : 'sommet de la hiérarchie'}</small>`;
        el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
      }
      this.audio.streakReady?.(civ ? Math.min(6, 1 + to) : Math.min(6, to >> 1));
    }
    // le journal en parle : toujours pour le joueur, pour les autres seulement les gros paliers
    const big = civ ? to >= 3 : to >= 5; if (!me && !big) return;
    const L = LIEU(), k = a.stats.k, nm = onAir(a);
    let say, head, gfx;
    if (civ) {
      head = to >= 5 ? `${nm} : ennemi public n°1` : `${nm} recherché ${STARS_TXT(to)}`;
      say = [null,
        `Un individu surnommé « ${nm} » est signalé ${zone}. La police lance un avis de recherche.`,
        `« ${nm} » passe à deux étoiles : les contrôles se multiplient ${zone}.`,
        `Le suspect « ${nm} » est désormais activement recherché. On lui attribue déjà ${k} policiers mis hors de combat.`,
        `Avis de recherche maximal pour « ${nm} ». Les autorités appellent les habitants à rester chez eux.`,
        `C'est officiel : « ${nm} » devient l'ennemi public numéro un. Du jamais vu ${L.a}.`][to];
      gfx = { kind: 'wanted', name: nm, n: to };
    } else {
      const G = GRADES[to];
      head = `${nm} promu ${G.nom.toLowerCase()}`;
      say = to >= 8 ? `Ascension fulgurante : ${nm} est nommé ${G.nom.toLowerCase()} en pleine opération ${L.a}. ${k} Frungz neutralisés.`
        : pick([`Promotion express pour ${nm}, désormais ${G.nom.toLowerCase()} après ${k} interpellations.`, `${nm} monte en grade : ${G.nom.toLowerCase()}. Sa hiérarchie salue son sang-froid ${zone}.`, `La préfecture confirme : ${nm} devient ${G.nom.toLowerCase()}.`]);
      gfx = { kind: 'grade', name: nm, n: to };
    }
    this.newsPush({ pri: me ? 3 : 1, say, head, subject: a, gfx, key: 'noto' + a.id });
  };
  // badge au-dessus de la tête (étoiles dès 2★, grade dès major) ; jamais pour soi
  P.notoBadge3d = function (a) {
    if (a === this.player) return; const lv = level(a), show = a.team === 'civils' ? lv >= 2 : lv >= 3; if (!show) return;
    const tex = badgeTexture(a.team, lv);
    if (!a.notoSpr) { a.notoSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); a.notoSpr.scale.set(1.0, 0.25, 1); a.notoSpr.position.y = a.marker ? 2.55 : 2.3; a.notoSpr.renderOrder = 5; a.ch.root.add(a.notoSpr); }
    else a.notoSpr.material.map = tex;
  };
  // badge en HTML (classement, fil des éliminations)
  P.notoTag = function (a) {
    if (!a) return ''; const lv = level(a);
    if (a.team === 'civils') return lv ? `<span class="nb s">${'★'.repeat(lv)}</span>` : '';
    return lv ? `<span class="nb g${lv >= 7 ? ' top' : ''}">${GRADES[lv].ab}</span>` : '';
  };

  // ---------------------------------------------------------------- branchements sur le jeu
  const addGalons = P.addGalons; P.addGalons = function (a, n) { addGalons.call(this, a, n); this.notoAdd(a, n); };
  const scoreEvent = P.scoreEvent; P.scoreEvent = function (team, pts, why, by) { scoreEvent.call(this, team, pts, why, by); if (by && pts > 0) this.notoAdd(by, pts * 0.12); };
  const kill = P.kill; P.kill = function (t, by, opts = {}) {
    const lvT = level(t), wasMost = this.news && t === this.mostWanted();
    kill.call(this, t, by, opts);
    const N = this.news; if (!N) return;
    N.log.push({ t: this.time, x: t.pos.x, z: t.pos.z }); N.total++;
    if (!by || by === t) return;
    const me = by === this.player || t === this.player;
    if (t.team === 'civils' && lvT >= 4) {
      this.newsPush({ pri: me ? 3 : 2, subject: by, gfx: { kind: 'arrest', name: onAir(t), n: lvT },
        head: `${onAir(t)} neutralisé`, say: wasMost ? `Coup de filet ${LIEU().a} : ${onAir(by)} vient de neutraliser l'ennemi public numéro un, « ${onAir(t)} ».` : `Fin de cavale pour « ${onAir(t)} », recherché ${lvT} étoiles : ${onAir(by)} l'a arrêté ${this.newsZone(t.pos)}.` });
    } else if (t.team === 'ordre' && lvT >= 6) {
      this.newsPush({ pri: me ? 3 : 1, subject: by, gfx: { kind: 'wanted', name: onAir(by), n: by.stars || 0 },
        head: `Un ${GRADES[lvT].nom.toLowerCase()} à terre`, say: `Coup dur pour la Brigade : le ${GRADES[lvT].nom.toLowerCase()} ${onAir(t)} a été mis hors de combat par « ${onAir(by)} ».` });
    }
  };
  const multiKill = P.multiKill; P.multiKill = function (opts) {
    multiKill.call(this, opts); const M = this.mk, N = this.news; if (!N || !M || M.n < 3) return;
    const a = this.player, foes = a.team === 'civils' ? 'policiers' : 'Frungz', nm = onAir(a);
    // une seule story par carnage : on la met à jour tant que le carnage continue
    const st = { pri: 3, subject: a, key: 'multi', gfx: { kind: 'multi', name: nm, n: M.n },
      head: M.n >= 5 ? `Carnage ${LIEU().a}` : `${nm} : ${M.n} ${foes} à terre`,
      say: M.n >= 6 ? `Images hallucinantes ${LIEU().a} : « ${nm} » vient de mettre ${M.n} ${foes} hors de combat en quelques secondes. Personne ne semble pouvoir l'arrêter.`
        : M.n >= 4 ? `On nous signale une scène impressionnante ${this.newsZone(a.pos)} : ${nm} a neutralisé ${M.n} ${foes} coup sur coup.`
          : `Échange de tirs ${this.newsZone(a.pos)} : ${nm} vient de mettre trois ${foes} hors de combat.` };
    this.newsPush(st);
  };
  const addStreak = P.addStreak; P.addStreak = function (a) {
    addStreak.call(this, a); const N = this.news; if (!N) return; const s = a.streak, me = a === this.player, nm = onAir(a);
    if (s < 10 || s % 5) return; if (!me && s < 15) return;
    const foes = a.team === 'civils' ? 'policiers' : 'Frungz';
    this.newsPush({ pri: me ? 2 : 1, subject: a, key: 'streak' + a.id, gfx: { kind: 'streak', name: nm, n: s },
      head: `${nm} : ${s} sans tomber`, say: s >= 25 ? `C'est historique : « ${nm} » aligne ${s} ${foes} sans jamais tomber. Les experts n'ont jamais vu ça.`
        : pick([`${nm} enchaîne : ${s} ${foes} neutralisés sans la moindre égratignure.`, `Toujours debout : « ${nm} » en est à ${s} éliminations consécutives ${this.newsZone(a.pos)}.`]) });
  };
  const captureZone = P.captureZone; P.captureZone = function (z, team) {
    captureZone.call(this, z, team); const N = this.news; if (!N || N.chaos < 2) return;
    const T = team === 'ordre' ? 'la Brigade' : 'les Frungz';
    this.newsPush({ pri: 0, at: V(z.center[0], (z.y ?? 0.17), z.center[1]), key: 'zone', gfx: { kind: 'zone', name: z.id, team },
      head: `${T} prennent ${z.id} · ${z.name || ''}`, say: `La zone ${z.id}, ${z.name || ''}, tombe aux mains ${team === 'ordre' ? 'de la Brigade' : 'des Frungz'}. La bataille ${LIEU().a} continue.` });
  };
  const killFeed = P.killFeed; P.killFeed = function (by, t, opts) {
    killFeed.call(this, by, t, opts); const el = $('feed')?.firstChild; if (!el) return;
    const sp = el.querySelectorAll('span.o, span.c'); const who = by ? [by, t] : [t];
    sp.forEach((s, i) => { const tag = this.notoTag(who[i]); if (tag) s.insertAdjacentHTML('afterend', tag); });
  };
  const drawRank = P.drawRank; P.drawRank = function () {
    drawRank.call(this); const a = this.player, el = $('rank'); if (!el || !a) return; const top = el.querySelector('.top'); if (!top) return;
    let h;
    if (a.team === 'civils') { const s = a.stars || 0, nx = STARS[s]; h = `<span class="st">${'★'.repeat(s)}<i>${'★'.repeat(5 - s)}</i></span>${s >= 5 && a === this.mostWanted() ? 'ENNEMI PUBLIC N°1' : s ? 'RECHERCHÉ' : '<small>inconnu des services</small>'}${nx ? ` <small>· ${Math.max(1, Math.ceil(nx - (a.noto || 0)))} pour ★${s + 1}</small>` : ''}`; }
    else { const g = a.grade || 0, nx = GRADES[g + 1]; h = `<span class="gr">${GRADES[g].ab}</span>${GRADES[g].nom}${nx ? ` <small>· ${nx.nom} dans ${Math.max(1, Math.ceil(nx.n - (a.noto || 0)))}</small>` : ''}`; }
    top.insertAdjacentHTML('afterend', `<div class="noto">${h}</div>`);
  };
  const update = P.update; P.update = function (dt, bg = false) { update.call(this, dt, bg); if (!bg && this.news && !this.paused) this.updateNews(dt); };
  for (const k of ['build', 'buildFromRoster']) { const f = P[k]; P[k] = function (...args) { const r = f.apply(this, args); try { this.newsInit(); } catch (e) { console.warn('news', e); } return r; }; }

  // ---------------------------------------------------------------- outils
  P.mostWanted = function () { let best = null; for (const a of this.actors) if (a.team === 'civils' && !a.gone && !a.temp && (a.noto || 0) > (best?.noto || 0)) best = a; return best && (best.stars || 0) >= 1 ? best : null; };
  P.topCop = function () { let best = null; for (const a of this.actors) if (a.team === 'ordre' && !a.gone && !a.temp && (a.noto || 0) > (best?.noto || 0)) best = a; return best && (best.grade || 0) >= 1 ? best : null; };
  P.newsZone = function (p) {
    let best = null, bd = 1e9; for (const z of this.zoneState || []) { const d = Math.hypot(z.center[0] - p.x, z.center[1] - p.z); if (d < bd) { bd = d; best = z; } }
    if (!best) return LIEU().a; const nm = best.name || best.id; return bd < 25 ? `à ${nm}` : `près de ${nm}`;
  };
  // point chaud : là où l'on s'est le plus battu ces 20 dernières secondes
  P.newsHot = function () {
    const L = this.news.log.filter((e) => this.time - e.t < 20); if (!L.length) return null;
    let best = L[L.length - 1], bn = 0; for (const e of L) { let n = 0; for (const f of L) if (Math.hypot(e.x - f.x, e.z - f.z) < 25) n++; if (n > bn) { bn = n; best = e; } }
    return V(best.x, this.world.groundY(best.x, best.z, 2), best.z);
  };

  // ---------------------------------------------------------------- journal
  P.newsInit = function () {
    if (!document.getElementById('notoCss')) { const s = document.createElement('style'); s.id = 'notoCss'; s.textContent = CSS; document.head.appendChild(s); }
    const hud = $('hud'); if (!hud) return;
    for (const [id, html] of [['chaos', ''], ['notopop', ''], ['news', '<div class="rec"></div><div class="bug">FRUNGZ<b>INFO</b></div><div class="live">● EN DIRECT</div><div class="loc"></div><div class="say"></div><div class="low"><span class="who"></span><span class="tag"></span><span class="head"></span></div><div class="tick"><span></span></div><div class="wipe"></div>']]) {
      let el = $(id); if (!el) { el = document.createElement('div'); el.id = id; hud.appendChild(el); } el.innerHTML = html; el.className = '';
    }
    document.body.classList.remove('newson');
    this.news = { queue: [], log: [], total: 0, chaos: 0, chaosShown: -1, downT: 0, next: 18, K: null, opened: false };
    for (const a of this.actors) { a.noto = a.noto || 0; }
    this.newsChaosHud();
    // ouverture du journal une fois la partie lancée
    const L = LIEU();
    this.newsPush({ pri: 1, at: V(0, 0, 0), key: 'open', delay: 14, gfx: { kind: 'open' }, head: `Domination ${L.a}`,
      say: pick([`Bonsoir. Situation tendue ce soir ${L.a} : la Brigade et les Frungz se disputent le quartier, zone par zone.`, `Bonsoir à tous. ${L.a.charAt(0).toUpperCase() + L.a.slice(1)}, les premiers attroupements sont signalés. Nous suivons la situation en direct.`]) });
    voiceInit();
    this.newsStudioInit();
  };
  P.newsPush = function (st) {
    const N = this.news; if (!N || this.save.settings?.news === false) return;
    st.born = this.time + (st.delay || 0); st.pri = st.pri || 0;
    if (st.key) { const i = N.queue.findIndex((q) => q.key === st.key); if (i >= 0) N.queue.splice(i, 1); if (N.K && N.K.st.key === st.key && N.K.t < 1.2) { N.K.st = st; this.newsText(); return; } }
    N.queue.push(st); if (N.queue.length > 8) { N.queue.sort((p, q) => q.pri - p.pri); N.queue.length = 8; }
  };
  P.newsChaosHud = function () {
    const N = this.news, el = $('chaos'); if (!el) return; const C = CHAOS[N.chaos];
    el.style.setProperty('--c', C.col); el.className = `l${N.chaos}`; if (N.chaosShown >= 0 && N.chaos > N.chaosShown) { void el.offsetWidth; el.classList.add('up'); }
    el.innerHTML = `<span>${LIEU().nom}</span><span class="seg">${[0, 1, 2, 3, 4].map((i) => `<i class="${i <= N.chaos ? 'f' : ''}"></i>`).join('')}</span><span>${C.nom}</span>`;
    N.chaosShown = N.chaos;
  };
  P.updateNews = function (dt) {
    const N = this.news; const now = this.time;
    // température : éliminations de la dernière minute rapportées à la taille des équipes, plus un plancher qui monte avec le temps
    if (N.log.length && now - N.log[0].t > 60) N.log = N.log.filter((e) => now - e.t <= 60);
    const per = N.log.length / Math.max(4, this.opts.teamSize || 10);
    let want = per >= 1.1 ? 4 : per >= 0.7 ? 3 : per >= 0.4 ? 2 : per >= 0.15 ? 1 : 0; want = Math.max(want, now > 300 ? 1 : 0);
    if (want > N.chaos) { const from = N.chaos; N.chaos = want; N.downT = 0; this.newsChaosHud(); if (want >= 2 && want > from) this.newsChaosStory(want); }
    else if (want < N.chaos) { N.downT += dt; if (N.downT > 25) { N.chaos--; N.downT = 0; this.newsChaosHud(); } } else N.downT = 0;
    // badges 3D : cachés quand on est mort
    if ((N.bT = (N.bT || 0) - dt) <= 0) { N.bT = 0.25; for (const a of this.actors) if (a.notoSpr) a.notoSpr.visible = a.alive && !a.inCar && a.pos.distanceToSquared(this.camera.position) < 90 * 90; }
    // lecture
    if (N.K) { this.newsStep(dt); return; }
    if (this.save.settings?.news === false || this.over) return;
    N.queue = N.queue.filter((q) => now - q.born < (q.pri >= 3 ? 9 : 14) || q.key === 'open');
    const ready = N.queue.filter((q) => now >= q.born); if (!ready.length) return;
    ready.sort((p, q) => q.pri - p.pri || p.born - q.born); const st = ready[0];
    const gap = CHAOS[N.chaos].gap * (st.pri >= 3 ? 0.4 : st.pri >= 2 ? 0.65 : 1);
    if (now - (N.lastEnd ?? -999) < gap) return;
    N.queue.splice(N.queue.indexOf(st), 1); this.newsStart(st);
  };
  P.newsChaosStory = function (lv) {
    const L = LIEU(), N = this.news, mw = this.mostWanted();
    const say = [null, null,
      `Les affrontements s'intensifient ${L.a}. ${N.log.length} blessés graves en une minute selon nos informations.`,
      `Émeute en cours ${L.a} : la situation échappe à tout contrôle. ${mw ? `Le nom de « ${onAir(mw)} » revient dans tous les témoignages.` : 'Les renforts affluent de toute la ville.'}`,
      `Édition spéciale : ${L.a} est plongée dans le chaos. Déjà ${N.total} personnes mises hors de combat depuis le début des affrontements.`][lv];
    this.newsPush({ pri: lv >= 4 ? 2 : 1, key: 'chaos', gfx: { kind: 'chaos', n: lv }, head: [null, null, 'Les affrontements s\'intensifient', 'Émeute en cours', 'Le quartier plongé dans le chaos'][lv], say, hot: true });
  };

  // ---------------------------------------------------------------- une cinématique : un montage de plans
  // Plans possibles : plateau (gros plan sur la personne qui parle), plateau large à deux, duplex (écran partagé
  // plateau / envoyé spécial), envoyé spécial seul sur place, hélico de la chaîne. Chaque sujet tire un montage au sort.
  P.newsStart = function (st) {
    const N = this.news, el = $('news'); if (!el) return;
    const S = N.pres, ready = !!S?.ready, L = LIEU();
    if (S && !S.voices?.A && voices.length) S.voices = pickVoices(S.sex).voices; // voix chargées après coup (Chrome)
    const len = (t) => Math.max(2.3, Math.min(7.5, t.length * 0.066 + 0.7));
    const line = (who, text) => ({ who, text, dur: len(text) });
    const A = S?.lead || 'A', B = A === 'A' ? 'B' : 'A';
    const intro = pick([`Tout de suite, direction ${L.a} : notre envoyé spécial est sur place.`, `On rejoint notre équipe sur le terrain, ${L.a}.`, `Retrouvons notre reporter, au cœur des affrontements.`]);
    const outro = pick([`On reste évidemment sur cette affaire.`, `Nous suivons la situation minute par minute.`, `Restez avec nous, on y revient très vite.`]);
    let shots;
    if (!ready) shots = [{ kind: 'heli', ...line(null, st.say), dur: Math.max(4.5, len(st.say)) }];
    else {
      const v = st.variant || pick(st.pri >= 3 ? ['solo', 'duo', 'duplex', 'terrain', 'terrain', 'helifirst'] : ['solo', 'duo', 'duo', 'duplex', 'terrain', 'helifirst']);
      if (v === 'solo') shots = [{ kind: 'studio', ...line(A, st.say) }, { kind: 'heli', dur: 3.6 }];
      else if (v === 'duo') shots = Math.random() < 0.5
        ? [{ kind: 'wide', dur: 1.4 }, { kind: 'studio', ...line(pick([A, B]), st.say) }, { kind: 'heli', dur: 3.4 }]
        : [{ kind: 'wide', ...line(A, pick(['Une information qui vient de tomber.', 'On apprend à l\'instant de nouveaux éléments.', 'La situation évolue très vite.'])) }, { kind: 'studio', ...line(B, st.say) }, { kind: 'heli', dur: 3.2 }];
      else if (v === 'duplex') shots = [{ kind: 'studio', ...line(A, intro) }, { kind: 'duplex', ...line('R', st.say) }, { kind: 'heli', dur: 3 }];
      else if (v === 'terrain') shots = [{ kind: 'studio', ...line(A, intro) }, { kind: 'reporter', ...line('R', st.say) }, { kind: 'heli', dur: 3 }];
      else shots = [{ kind: 'heli', ...line(A, st.say), dur: Math.max(4, len(st.say)) }, { kind: 'studio', ...line(A, outro) }];
    }
    N.K = { st, t: 0, i: -1, t0: 0, shots, dur: shots.reduce((a, x) => a + x.dur, 0), seed: Math.random() * 6.28 };
    if (this.save.settings?.newsVoice !== false) cloudPrepare(N.K, S?.sex);
    this.newsText(); this.newsGfx(st.gfx); this.newsAim();
    el.className = 'on sting' + (N.chaos >= 3 ? ' u' : ''); document.body.classList.add('newson');
    this.audio.newsSting?.(N.chaos);
    this.newsShot(0, 0.45);
  };
  // passe au plan i (voix, cadrage, animations des présentateurs)
  P.newsShot = function (i, delay = 0) {
    const N = this.news, K = N.K, el = $('news'), sh = K.shots[i]; K.i = i; K.t0 = K.t; const S = N.pres;
    if (i > 0) { el.classList.remove('sting', 'cut'); void el.offsetWidth; el.classList.add('cut'); }
    el.classList.toggle('l', sh.kind === 'heli' || sh.kind === 'reporter' || sh.kind === 'duplex'); el.classList.toggle('dx', sh.kind === 'duplex');
    if ((sh.kind === 'reporter' || sh.kind === 'duplex') && !this.newsRepSetup()) sh.kind = sh.kind === 'duplex' ? 'studio' : 'heli';
    if (sh.kind === 'heli') this.newsLiveSetup();
    if (S?.ready) { // la personne qui parle parle, les autres écoutent
      for (const [id, P2] of Object.entries(S.people)) talk(P2, sh.who === id);
      if (S.rep) S.rep.root.visible = sh.kind === 'reporter' || sh.kind === 'duplex';
    }
    const who = sh.who && S?.names ? S.names[sh.who] : null;
    el.querySelector('.say').textContent = sh.text || ''; el.querySelector('.who').textContent = who ? (sh.who === 'R' ? `${who} · envoyé${S.sex.R === 'F' ? 'e' : ''} spécial${S.sex.R === 'F' ? 'e' : ''}` : who) : '';
    cloudStop();
    if (sh.text && this.save.settings?.newsVoice !== false) { const v = S?.voices?.[sh.who] || S?.voices?.A; const go = () => { if (this.news?.K === K && K.i === i && !cloudPlay(sh)) speak(sh.text, v, sh.who === 'R' ? 1.08 : 1.12); }; if (delay) setTimeout(go, delay * 1000); else go(); }
    el.classList.toggle('v', !!(sh.text && this.save.settings?.newsVoice !== false && (voices.length || CLOUD.ok)));
  };
  P.newsText = function () {
    const N = this.news, K = N.K, el = $('news'); if (!K || !el) return; const C = CHAOS[N.chaos];
    el.querySelector('.tag').textContent = C.tag; el.querySelector('.head').textContent = K.st.head;
    const mw = this.mostWanted(), tc = this.topCop(), zs = (this.zoneState || []).map((z) => `${z.id} ${z.owner ? (z.owner === 'ordre' ? 'Brigade' : 'Frungz') : 'libre'}`).join(' · ');
    el.querySelector('.tick span').textContent = [`BRIGADE ${this.score.ordre} — FRUNGZ ${this.score.civils}`, `ZONES : ${zs}`, mw ? `ENNEMI PUBLIC N°1 : ${onAir(mw)} ${'★'.repeat(mw.stars)}` : '', tc ? `PLUS HAUT GRADÉ : ${GRADES[tc.grade].nom} ${onAir(tc)}` : '', `${N.total} éliminations depuis le début des affrontements`, `TEMPÉRATURE : ${C.nom}`].filter(Boolean).join('     ▪     ');
    el.querySelector('.loc').textContent = `${LIEU().nom} · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  P.newsStep = function (dt) {
    const N = this.news, K = N.K, el = $('news');
    K.t += dt;
    // un plan dure sa durée prévue, ou jusqu'à la fin de la réplique si la voix du serveur est plus longue (4 s de plus au maximum)
    const cur = K.shots[K.i], a = cur.audio, talking = a && cur.asked && !a.ended && !a.error && (!cur.started || !a.paused) && K.t - K.t0 < cur.dur + 4;
    const done = K.t - K.t0 >= cur.dur && !talking;
    if ((done && K.i === K.shots.length - 1) || this.over) {
      cloudStop(); N.K = null; N.lastEnd = this.time; el.className = ''; document.body.classList.remove('newson'); if (N.pres?.rep) N.pres.rep.root.visible = false; return;
    }
    if (done) this.newsShot(K.i + 1);
    const sh = K.shots[K.i], S = N.pres;
    if (S?.ready) { for (const p of Object.values(S.people)) p.ch.mixer.update(dt); if (S.rep?.root.visible) S.rep.ch.mixer.update(dt); }
    if (sh.kind === 'heli' || sh.kind === 'reporter' || sh.kind === 'duplex') this.newsLiveTrack(dt);
  };
  // cible des images de terrain : le sujet, sinon le point chaud
  P.newsAim = function () {
    const K = this.news.K, st = K.st; const subj = st.subject && !st.subject.gone ? st.subject : null;
    let tgt = subj ? subj.pos.clone() : st.hot ? this.newsHot() : st.at ? st.at.clone() : null; if (!tgt) tgt = this.newsHot() || this.player.pos.clone();
    if (st.at && !subj) tgt.y = this.world.groundY(tgt.x, tgt.z, (tgt.y || 0) + 2);
    K.subj = subj; K.tgt = tgt.clone().add(V(0, 1, 0)); K.look = K.tgt.clone();
  };
  // hélico de la chaîne : un angle qui voit la scène, puis orbite lente au téléobjectif
  P.newsLiveSetup = function () {
    const K = this.news.K; let best = null; const R = rnd(17, 22), H = rnd(9, 13);
    for (let i = 0; i < 10; i++) { const ang = K.seed + i * 0.63; const e = V(K.tgt.x + Math.sin(ang) * R, K.tgt.y + H + (i > 5 ? 10 : 0), K.tgt.z + Math.cos(ang) * R); if (this.world.groundY(e.x, e.z, e.y + 60) < e.y - 2 && this.world.los(e, K.tgt)) { best = ang; K.H = e.y - K.tgt.y; break; } }
    K.ang = best ?? K.seed; K.R = best == null ? 10 : R; K.H = best == null ? 42 : K.H; K.fov = best == null ? 30 : 21;
  };
  // envoyé spécial : posé à 9-13 m de la scène, face caméra, l'action derrière lui
  P.newsRepSetup = function () {
    const N = this.news, K = N.K, S = N.pres; if (!S?.rep) return false; if (K.rp) return true;
    const W = this.world, T = K.tgt;
    for (let i = 0; i < 14; i++) {
      const ang = K.seed + 1.1 + i * 0.45, d = V(Math.sin(ang), 0, Math.cos(ang)), side = V(d.z, 0, -d.x);
      const [x, z] = W.randomFree(T.x + d.x * rnd(9, 13), T.z + d.z * rnd(9, 13), 1.5); const pos = V(x, 0, z); pos.y = W.groundY(x, z, T.y + 1);
      if (Math.abs(pos.y - (T.y - 1)) > 3) continue;
      const head = pos.clone().add(V(0, 1.55, 0)), cam = pos.clone().addScaledVector(d, 1.9).addScaledVector(side, 0.55).add(V(0, 1.6, 0));
      if (!W.los(cam, head) || !W.los(head, T)) continue;
      K.rp = { pos, cam, look: head.clone().addScaledVector(side, 0.45).add(V(0, -0.22, 0)), look2: head.clone().addScaledVector(side, 0.06).add(V(0, -0.25, 0)), yaw: Math.atan2(d.x, d.z) };
      const R = S.rep.root; R.position.copy(pos); R.rotation.y = K.rp.yaw; R.updateMatrixWorld(true); return true;
    }
    return false;
  };
  P.newsLiveTrack = function (dt) {
    const K = this.news.K; if (K.subj && !K.subj.gone) K.tgt.lerp(K.subj.pos.clone().add(V(0, 1, 0)), 1 - Math.exp(-dt * 2.2));
    K.look.lerp(K.tgt, 1 - Math.exp(-dt * 3)); K.ang += dt * 0.07;
  };

  // ---------------------------------------------------------------- plateau du journal (petite scène à part) et envoyé spécial
  P.newsStudioInit = function () {
    const N = this.news;
    if (this._presKeep) { N.pres = this._presKeep; if (N.pres.rep && !N.pres.rep.root.parent) this.root.add(N.pres.rep.root); else if (N.pres.rep && N.pres.rep.root.parent !== this.root) this.root.add(N.pres.rep.root); return; }
    const S = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 1.6, 0.05, 50), people: {}, ready: false };
    N.pres = this._presKeep = S;
    S.scene.background = new THREE.Color('#0a1430');
    S.scene.add(new THREE.HemisphereLight('#cfe0ff', '#1a1420', 1.3));
    const key = new THREE.DirectionalLight('#fff4e6', 2.6); key.position.set(1.5, 2.5, 3); S.scene.add(key);
    const fill = new THREE.DirectionalLight('#ffe9d6', 1.2); fill.position.set(-2.5, 1.8, 2.5); S.scene.add(fill);
    const rim = new THREE.DirectionalLight('#6aa0ff', 2.2); rim.position.set(-2, 2.2, -2); S.scene.add(rim);
    // fond : skyline de nuit, écrans, logo
    const bg = document.createElement('canvas'); bg.width = 1024; bg.height = 512; const g = bg.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#0b1e4d'); gr.addColorStop(1, '#050b1f'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${pick(['255,200,120', '160,200,255', '255,255,255'])},${rnd(0.05, 0.22)})`; g.beginPath(); g.arc(rnd(0, 1024), rnd(250, 420), rnd(4, 18), 0, 7); g.fill(); }
    g.fillStyle = 'rgba(8,14,34,.9)'; for (let x = 0; x < 1024; x += rnd(30, 70)) { const h = rnd(60, 170); g.fillRect(x, 420 - h, rnd(26, 60), h + 100); }
    g.strokeStyle = 'rgba(120,170,255,.18)'; g.lineWidth = 2; for (let x = 0; x <= 1024; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke(); }
    g.fillStyle = '#c8102e'; g.fillRect(0, 446, 1024, 10); g.font = '900 64px Inter, Arial'; g.fillStyle = 'rgba(255,255,255,.9)'; g.fillText('FRUNGZ', 60, 120); g.fillStyle = '#ff3b4a'; g.fillText('INFO', 330, 120);
    const bgt = new THREE.CanvasTexture(bg); bgt.colorSpace = THREE.SRGBColorSpace;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: bgt })); back.position.set(0, 1.8, -2.8); S.scene.add(back);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: '#10182e', roughness: 0.35, metalness: 0.4 })); floor.rotation.x = -Math.PI / 2; S.scene.add(floor);
    // grand écran au mur, entre les deux présentateurs (mis à jour à chaque sujet)
    S.gfx = document.createElement('canvas'); S.gfx.width = 512; S.gfx.height = 300; S.gfxT = new THREE.CanvasTexture(S.gfx); S.gfxT.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.73), new THREE.MeshBasicMaterial({ map: S.gfxT })); scr.position.set(0, 1.95, -1.5); S.scene.add(scr);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.78), new THREE.MeshBasicMaterial({ color: '#d8e3ff' })); frame.position.set(0, 1.95, -1.51); S.scene.add(frame);
    // bureau
    const deskM = new THREE.MeshStandardMaterial({ color: '#e9edf5', roughness: 0.25, metalness: 0.1 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.08, 0.8), deskM); desk.position.set(0, 1.02, 0.4); S.scene.add(desk);
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.0, 0.06), new THREE.MeshStandardMaterial({ color: '#0b1e4d', roughness: 0.4, metalness: 0.3, emissive: '#0b1e4d', emissiveIntensity: 0.3 })); front.position.set(0, 0.5, 0.79); S.scene.add(front);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 0.065), new THREE.MeshBasicMaterial({ color: '#c8102e' })); strip.position.set(0, 0.93, 0.795); S.scene.add(strip);
    for (const x of [-0.62, 0.62]) { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), new THREE.MeshStandardMaterial({ color: '#2a2f38', metalness: 0.6, roughness: 0.3 })); lap.position.set(x * 0.9, 1.07, 0.48); S.scene.add(lap); }
    // voix et personnes : présentatrice / présentateur selon les voix du navigateur, envoyé(e) spécial(e) avec une autre voix
    const vs = pickVoices(); S.voices = vs.voices; S.sex = vs.sex; S.lead = 'A';
    S.names = { A: S.sex.A === 'F' ? 'Claire Morand' : 'Julien Vasseur', B: S.sex.B === 'F' ? 'Inès Lacroix' : 'Marc Delorme', R: S.sex.R === 'F' ? 'Sofia Benali' : 'Hugo Ferrand' };
    loadNewsClips().then((clips) => {
      if (!clips.length) return;
      const mk = (def, h) => { if (!chars[def.id]) registerSkin(chars, def, clips, h, { tex: 256 }); const ch = makeCharacter(def.id); ch.model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } }); return { ch, cur: null }; };
      for (const [id, x, ry] of [['A', -0.62, 0.16], ['B', 0.62, -0.16]]) {
        const sex = S.sex[id], P2 = mk(sex === 'F' ? PRES.F : PRES.M, sex === 'F' ? 1.7 : 1.78); P2.ch.root.position.set(x, 0, 0); P2.ch.root.rotation.y = ry; S.scene.add(P2.ch.root);
        P2.head = P2.ch.bones.Head || Object.values(P2.ch.bones).find((b) => /head/i.test(b.name)); P2.x = x; S.people[id] = P2; talk(P2, false);
      }
      // envoyé spécial : dans la ville, caché hors des reportages ; micro en main
      const R = mk(S.sex.R === 'F' ? REP.F : REP.M, S.sex.R === 'F' ? 1.68 : 1.78); R.root = R.ch.root; R.root.visible = false; this.root.add(R.root); talk(R, true);
      const hand = R.ch.bones.WristR || Object.values(R.ch.bones).find((b) => /^(wrist|hand)[._]?r$/i.test(b.name));
      if (hand) { const k = 1 / (R.ch.model.scale.x || 1), mic = new THREE.Group(); const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * k, 0.012 * k, 0.2 * k, 8), new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.5 })); const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.026 * k, 10, 8), new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.8 })); m2.position.y = 0.11 * k; const m3 = new THREE.Mesh(new THREE.BoxGeometry(0.05 * k, 0.04 * k, 0.05 * k), new THREE.MeshStandardMaterial({ color: '#c8102e' })); m3.position.y = 0.06 * k; mic.add(m1, m2, m3); mic.position.y = 0.06 * k; hand.add(mic); }
      S.rep = R; S.ready = true;
    }).catch((e) => console.warn('journal', e));
  };
  P.newsGfx = function (G = {}) {
    const S = this.news.pres; if (!S?.gfx) return; const g = S.gfx.getContext('2d'), W = 512, H = 300;
    const red = '#c8102e', navy = '#0b1e4d';
    g.fillStyle = navy; g.fillRect(0, 0, W, H); g.textAlign = 'center'; g.textBaseline = 'middle';
    const title = (t, c = red) => { g.fillStyle = c; g.fillRect(0, 0, W, 64); g.fillStyle = '#fff'; g.font = '900 40px Inter, Arial'; g.fillText(t, W / 2, 34); };
    const name = (t) => { g.fillStyle = '#fff'; g.font = '900 38px Inter, Arial'; g.fillText(String(t || '').toUpperCase().slice(0, 18), W / 2, 238); };
    if (G.kind === 'wanted' || G.kind === 'arrest') {
      title(G.kind === 'arrest' ? 'ARRÊTÉ' : 'RECHERCHÉ'); g.font = '64px Arial'; for (let i = 0; i < 5; i++) { g.fillStyle = i < G.n ? '#ffcc3d' : 'rgba(255,255,255,.16)'; g.fillText('★', W / 2 + (i - 2) * 66, 140); } name(G.name);
      if (G.kind === 'arrest') { g.save(); g.translate(W / 2, 150); g.rotate(-0.2); g.strokeStyle = red; g.lineWidth = 8; g.strokeRect(-150, -40, 300, 80); g.fillStyle = red; g.font = '900 52px Inter, Arial'; g.fillText('NEUTRALISÉ', 0, 4); g.restore(); }
    } else if (G.kind === 'grade') { title('PROMOTION', '#1f4fb8'); g.fillStyle = '#d8e3ff'; for (let i = 0; i < Math.min(5, Math.max(1, G.n - 2)); i++) g.fillRect(W / 2 - 70 + i * 30, 96, 18, 90); g.font = '900 30px Inter, Arial'; g.fillText(GRADES[G.n].nom.toUpperCase(), W / 2, 200); g.font = '800 28px Inter, Arial'; g.fillStyle = '#9fb6e8'; g.fillText(String(G.name).toUpperCase(), W / 2, 262); }
    else if (G.kind === 'multi' || G.kind === 'streak') { title(G.kind === 'multi' ? 'CARNAGE' : 'SÉRIE'); g.fillStyle = '#ffcc3d'; g.font = '900 120px Inter, Arial'; g.fillText((G.kind === 'multi' ? '×' : '') + G.n, W / 2, 148); name(G.name); }
    else if (G.kind === 'chaos') { const C = CHAOS[G.n]; title(C.tag.length > 12 ? 'SPÉCIAL' : 'URGENT'); g.fillStyle = C.col; g.font = '900 54px Inter, Arial'; g.fillText(C.nom, W / 2, 150); g.fillStyle = '#fff'; g.font = '800 28px Inter, Arial'; g.fillText(`${this.news.total} hors de combat`, W / 2, 230); }
    else if (G.kind === 'zone') { title('ZONE ' + G.name, G.team === 'ordre' ? '#1f4fb8' : '#2b9348'); g.fillStyle = '#fff'; g.font = '900 150px Inter, Arial'; g.fillText(G.name, W / 2, 175); }
    else { title('EN DIRECT'); g.fillStyle = '#fff'; g.font = '900 64px Inter, Arial'; g.fillText('FRUNGZ', W / 2, 140); g.fillStyle = '#ff3b4a'; g.fillText('INFO', W / 2, 210); }
    S.gfxT.needsUpdate = true;
  };
  // rendu de l'incrustation (après l'image principale, comme la kill-cam)
  P.renderNews = function (renderer, scene) {
    const N = this.news, K = N?.K; if (!K || K.i < 0) return; const el = $('news'); if (!el) return;
    const r = el.getBoundingClientRect(), cr = renderer.domElement.getBoundingClientRect(); if (r.width < 10) return;
    const sh = K.shots[K.i], S = N.pres, t = this.time, kt = K.t - K.t0;
    const x0 = r.left - cr.left, y0 = cr.bottom - r.bottom;
    const studioCam = (who, w, h) => {
      const cam = S.cam; cam.aspect = w / h; const P2 = who && S.people[who];
      if (P2) { const side = Math.sign(P2.x), hp = P2.head ? P2.head.getWorldPosition(new THREE.Vector3()) : V(P2.x, 1.6, 0); hp.y += 0.08; cam.fov = 27 - Math.min(1, kt / sh.dur) * 2.5; cam.position.set(hp.x - side * 0.3, hp.y + 0.02, hp.z + 1.9); cam.lookAt(hp.x + side * 0.1, hp.y - 0.2, hp.z); }
      else { cam.fov = 34; cam.position.set(Math.sin(kt * 0.25) * 0.3, 1.6, 4.1 - kt * 0.08); cam.lookAt(0, 1.35, 0); }
      cam.updateProjectionMatrix(); return cam;
    };
    const worldCam = () => { const cam = this.newsCam || (this.newsCam = new THREE.PerspectiveCamera(24, 1.6, 0.3, 900)); return cam; };
    const repCam = (w, h) => { const cam = worldCam(), R = K.rp; cam.aspect = w / h; cam.fov = 40; cam.position.copy(R.cam); cam.position.x += Math.sin(t * 1.9) * 0.03; cam.position.y += Math.sin(t * 2.3) * 0.025; cam.lookAt(w < h * 1.1 ? R.look2 : R.look); cam.updateProjectionMatrix(); return cam; }; // en duplex (demi-écran), le reporter est recentré
    const heliCam = (w, h) => {
      const cam = worldCam(); cam.aspect = w / h; cam.fov = K.fov + Math.sin(t * 0.6) * 0.6;
      cam.position.set(K.tgt.x + Math.sin(K.ang) * K.R, K.tgt.y + K.H, K.tgt.z + Math.cos(K.ang) * K.R);
      cam.position.x += Math.sin(t * 1.7) * 0.25; cam.position.y += Math.sin(t * 1.3) * 0.2; // caméra portée par l'hélico
      cam.lookAt(K.look); if (K.subj) K.subj.ch.model.visible = true; cam.updateProjectionMatrix(); return cam;
    };
    const sz = renderer.getSize(new THREE.Vector2()), au = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    const vg = this.vgun?.visible; if (this.vgun) this.vgun.visible = false;
    const view = (sc, cam, x, y, w, h) => { renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h); renderer.render(sc, cam); };
    if (sh.kind === 'heli' || !S?.ready) view(scene, heliCam(r.width, r.height), x0, y0, r.width, r.height);
    else if (sh.kind === 'reporter') view(scene, repCam(r.width, r.height), x0, y0, r.width, r.height);
    else if (sh.kind === 'duplex') { const w = Math.floor(r.width / 2); view(S.scene, studioCam(S.lead, w, r.height), x0, y0, w, r.height); view(scene, repCam(r.width - w, r.height), x0 + w, y0, r.width - w, r.height); }
    else view(S.scene, studioCam(sh.kind === 'wide' ? null : sh.who, r.width, r.height), x0, y0, r.width, r.height);
    if (this.vgun) this.vgun.visible = vg;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, sz.x, sz.y); renderer.shadowMap.autoUpdate = au;
  };
}

// ---------------------------------------------------------------- animations du journal (Mixamo recuites sur les persos de base)
let newsClips = null;
function loadNewsClips() { return (newsClips ||= fetch('assets/anims/news.json').then((r) => r.json()).then((j) => j.map((c) => THREE.AnimationClip.parse(c))).catch((e) => { console.warn('anims journal', e); newsClips = null; return []; })); }
const TALKS = ['N_Talk1', 'N_Talk2', 'N_Talk3', 'N_Talk5'];
// parle (gestes de parole tirés au sort) ou écoute (repos, hochement de tête de temps en temps)
function talk(P2, on) {
  const A = P2.ch.actions; const name = on ? pick(TALKS.filter((n) => A[n] && n !== P2.cur)) || TALKS.find((n) => A[n]) : A.N_Idle ? 'N_Idle' : null; if (!name) return;
  const next = A[name]; if (P2.cur === name) return; const prev = P2.cur && A[P2.cur];
  next.reset().setLoop(THREE.LoopRepeat).play(); next.time = Math.random() * next.getClip().duration; if (prev) { next.crossFadeFrom(prev, 0.35, false); } P2.cur = name;
  if (!on && A.N_Nod && Math.random() < 0.6) { const nod = A.N_Nod; nod.reset().setLoop(THREE.LoopOnce).setEffectiveWeight(0.7); nod.clampWhenFinished = false; setTimeout(() => { if (P2.cur === 'N_Idle') nod.play(); }, 600 + Math.random() * 900); }
}
const REP = {
  F: { id: '__rep_F', name: 'Envoyée spéciale', team: 'civils', body: 'F', peau: '#c99474', hair: 'Hair_Buns', hairColor: '#1d1410',
    bas: { id: 'jean', c: '#2f3f58' }, pieds: { id: 'montantes', c: '#2a2a2c', c2: '#d8d8d4' }, haut: { id: 'doudoune', c: '#2b3a4f', c3: '#3a3d44' }, gilet: { id: 'aucun' }, mains: { id: 'aucun' }, tete: { id: 'aucun' }, visage: { id: 'aucun' }, extras: [] },
  M: { id: '__rep_M', name: 'Envoyé spécial', team: 'civils', body: 'M', peau: '#e2b597', hair: 'Hair_SimpleParted', hairColor: '#4a3020', barbe: true,
    bas: { id: 'cargo', c: '#3b3f35' }, pieds: { id: 'montantes', c: '#2a2a2c', c2: '#d8d8d4' }, haut: { id: 'kway', c: '#34465e', c2: '#1a2230', c3: '#2a2b30' }, gilet: { id: 'aucun' }, mains: { id: 'aucun' }, tete: { id: 'aucun' }, visage: { id: 'aucun' }, extras: ['sac'] },
};

// ---------------------------------------------------------------- voix (synthèse vocale du navigateur)
let voices = [];
function voiceInit() {
  cloudProbe();
  const ss = window.speechSynthesis; if (!ss) return; const load = () => { voices = ss.getVoices().filter((v) => /^fr/i.test(v.lang)); }; load(); ss.onvoiceschanged = load;
  // iOS : la première phrase doit partir d'un geste de l'utilisateur
  if (!voiceInit.armed) { voiceInit.armed = true; const unlock = () => { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; ss.speak(u); } catch {} removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); }; addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); }
}
// trois rôles (présentateur A, co-présentateur B, envoyé spécial R) : une voix féminine et une masculine si possible
function pickVoices(fixed) {
  const ok = voices.filter((v) => !NOVELTY.test(v.name)); const fr = (l) => l.filter((x) => /fr[-_]FR/i.test(x.lang)).concat(l.filter((x) => !/fr[-_]FR/i.test(x.lang)));
  const pref = ['Amélie', 'Audrey', 'Aurélie', 'Marie', 'Thomas', 'Google', 'Denise', 'Julie', 'Henri', 'Daniel', 'Paul', 'Natural', 'Online'];
  const rank = (v) => { const i = pref.findIndex((p) => v.name.includes(p)); return (i < 0 ? 50 : i) - (/natural|online|premium|enhanced|neural/i.test(v.name) ? 40 : 0); };
  const F = fr(ok.filter((v) => !MALE_VOICES.test(v.name))).sort((p, q) => rank(p) - rank(q)), M = fr(ok.filter((v) => MALE_VOICES.test(v.name))).sort((p, q) => rank(p) - rank(q));
  const lead = Math.random() < 0.5 ? 'F' : 'M';
  const get = (sex, n = 0) => (sex === 'F' ? F[n] || F[0] : M[n] || M[0]) || null;
  const sexA = fixed?.A || ((lead === 'F' ? F : M).length ? lead : F.length ? 'F' : M.length ? 'M' : lead), sexB = fixed?.B || (sexA === 'F' ? 'M' : 'F'), sexR = fixed?.R || (Math.random() < 0.5 ? 'F' : 'M');
  return { sex: { A: sexA, B: sexB, R: sexR }, voices: { A: get(sexA), B: get(sexB) || get(sexA, 1), R: get(sexR, 1) || get(sexR) } };
}
// Voix neuronales (Azure, via la fonction /api/tts du site : la clé reste côté serveur). Si la fonction
// n'est pas configurée ou ne répond pas, on garde la synthèse du navigateur.
const CLOUD = { ok: null, cur: null, base: /^https?:$/.test(location.protocol) ? '' : 'https://frungz.vercel.app' };
const CLOUD_VOICES = { F: ['fr-FR-DeniseNeural', 'fr-FR-EloiseNeural', 'fr-FR-VivienneMultilingualNeural'], M: ['fr-FR-HenriNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-AlainNeural'] };
function cloudProbe() {
  if (CLOUD.ok !== null || CLOUD.probing) return; CLOUD.probing = true;
  fetch(`${CLOUD.base}/api/tts?probe=1`).then((r) => (r.ok ? r.json() : null)).then((j) => { CLOUD.ok = !!j?.ok; }).catch(() => { CLOUD.ok = false; });
}
// chaque rôle a sa voix : présentateur A, co-présentateur B (l'autre sexe), envoyé spécial R (une troisième voix)
function cloudVoice(who, sex) {
  const s = sex?.[who] || (who === 'B' ? 'M' : 'F'), L = CLOUD_VOICES[s];
  if (who === 'R') return L[2]; if (who === 'B' && sex?.A === s) return L[1]; return L[0];
}
// prépare les répliques dès le début du flash ; un plan s'allonge si la voix est plus longue que prévu
function cloudPrepare(K, sex) {
  if (!CLOUD.ok) return;
  for (const sh of K.shots) {
    if (!sh.text) continue;
    const q = new URLSearchParams({ v: cloudVoice(sh.who || 'A', sex), r: sh.who === 'R' ? '6' : '10', t: sh.text });
    const a = new Audio(`${CLOUD.base}/api/tts?${q}`); a.preload = 'auto'; a.volume = 0.9; sh.audio = a;
    a.addEventListener('playing', () => { sh.started = true; }, { once: true });
    a.addEventListener('error', () => { sh.audio = null; }, { once: true });
  }
}
function cloudPlay(sh) {
  const a = sh.audio; if (!a || document.visibilityState !== 'visible') return false;
  try { window.speechSynthesis?.cancel(); a.currentTime = 0; sh.asked = true; CLOUD.cur = a; const p = a.play(); p?.catch?.(() => { if (CLOUD.cur === a) speak(sh.text, null); }); return true; } catch { return false; }
}
function cloudStop() { const a = CLOUD.cur; CLOUD.cur = null; if (a) try { a.pause(); } catch {} }
function speak(text, voice, rate = 1.12) {
  const ss = window.speechSynthesis; if (!ss || !text || document.visibilityState !== 'visible') return;
  try { ss.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = voice?.lang || 'fr-FR'; if (voice) u.voice = voice; u.rate = rate; u.pitch = 1; u.volume = 0.85; ss.speak(u); } catch {}
}
