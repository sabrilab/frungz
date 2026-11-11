// Régie de l'écran : quand la partie s'emballe (séries, multi-éliminations, étoiles, zones, flashs info),
// tout ce qui s'annonce passe par ici pour rester lisible. Mêmes annonces, même ton, même rythme ; seule la mise
// en page change :
//  - scène (#multik) : UNE grande annonce à la fois, celles du joueur (doublé… frungztastique, bonus prêt, titres
//    de légende, atout lancé). File d'attente par priorité ; un multi-kill qui continue se met à jour sur place
//    au lieu de recouvrir le bonus qu'on vient de débloquer.
//  - bandeau (#center, #notopop) : sous la boussole, une plaque à la fois pour ce qui se passe autour (zone prise,
//    alerte ennemie, montée d'étoiles ou de grade, butin légendaire).
//  - gains : tous les « +50 € · Élimination » d'une rafale regroupés en un seul compteur sous l'argent.
//  - fil des éliminations : les éliminations du joueur en rafale sur une seule ligne (×N), 4 lignes au plus.
//  - toasts identiques regroupés (×N), 3 à la fois.
//  - flashs d'écran espacés, l'interface ne tremble plus (la caméra garde ses secousses).
//  - barre des séries : une seule touche « activer » (celle du bonus qui partira), cachée en véhicule
//    (le cadre du mini-hélico ne la chevauche plus).
// Habillage : plaques émaillées façon plaques de rue parisiennes (bleu, double filet blanc), cf. CSS ci-dessous.
import { iconize } from './icons.js';

const $ = (id) => document.getElementById(id);
const now = () => performance.now() / 1000;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const DANGER = /^#ff4a4a$|^#ff5a4a$/i;

// durée d'affichage d'un grand titre selon sa taille (mêmes durées que les animations CSS d'origine)
const heroDur = (cls) => /t5|t6|m5|m6/.test(cls) ? 2.8 : /t3|t4|m4/.test(cls) ? 2.2 : 1.7;

const CSS = `
/* ---------- habillage Frungz : plaques émaillées (bleu de Paris, double filet blanc) ---------- */
#hud { --plaque: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,0) 46%), linear-gradient(180deg, rgba(27,44,86,.90), rgba(14,24,52,.90));
  --filet: inset 0 0 0 1.5px rgba(10,16,36,.95), inset 0 0 0 2.6px rgba(240,244,255,.78), 0 3px 10px rgba(0,0,0,.38); --plaque-r: 7px; }
#hud.shake { animation: none; }
#money, #mats, #toasts div, #feed div, #prompt, #weapons div, #car, #bag, #cashpop { background: var(--plaque) !important; box-shadow: var(--filet); border-radius: var(--plaque-r); }
#money { padding: 4px 13px 3px; letter-spacing: .02em; text-shadow: 0 2px 0 rgba(0,0,0,.45); }
#mats { padding: 3px 11px; }
#prompt { padding: 8px 15px; letter-spacing: .01em; }
#prompt b { display: inline-block; background: #f0f4ff; color: #14204a; border-radius: 4px; padding: 0 6px; margin-right: 4px; text-shadow: none; font-weight: 900; }
#weapons div { border: 0; border-bottom: 0; box-shadow: var(--filet), inset 0 -3px 0 var(--c, #777); }
#weapons div.on { box-shadow: var(--filet), inset 0 -3px 0 var(--c, #777), 0 0 0 2px #fff; }
#bag { border-left: 0; }
/* fil des éliminations : plaques fines, filet de couleur de camp */
#feed { gap: 5px; }
#feed div { padding: 4px 11px 4px 10px; font-size: 12.5px; animation: plaquein .22s cubic-bezier(.3,1.5,.5,1); }
#feed div.me { outline: 0; box-shadow: var(--filet), 0 0 0 2px var(--gold); }
#feed div .x { display: inline-block; margin-left: 6px; font: 13px Bungee, Inter; color: var(--gold); text-shadow: 0 1px 0 #000; }
#feed div.bump .x { animation: xbump .35s cubic-bezier(.3,2,.5,1); }
/* toasts : petites plaques à liseré de couleur */
#toasts { gap: 5px; }
#toasts div { border-left: 0; padding: 5px 12px 5px 14px; position: relative; font-size: 13px; animation: plaquein .22s cubic-bezier(.3,1.5,.5,1); }
#toasts div::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: var(--c, #fff); }
#toasts div .n { margin-left: 6px; font: 12px Bungee, Inter; color: var(--c, #fff); }
/* gains regroupés sous l'argent */
#cashpop { position: absolute; left: calc(100% + 8px); top: 0; max-width: 180px; padding: 3px 11px 4px; opacity: 0; transform: translateX(-8px); transition: opacity .25s, transform .25s; pointer-events: none; white-space: nowrap; }
#cashpop.on { opacity: 1; transform: none; }
#cashpop b { font: 16px/1.1 Bungee, Inter; display: block; color: var(--gold); text-shadow: 0 2px 0 rgba(0,0,0,.5); }
#cashpop small { display: block; overflow: hidden; text-overflow: ellipsis; font: 800 10.5px Inter; letter-spacing: .06em; color: #dfe6ff; text-transform: uppercase; }
#cashpop.bump b { animation: xbump .3s cubic-bezier(.3,2,.5,1); }
/* bandeau d'informations : une plaque à la fois sous la boussole */
#center { top: 152px; left: 50%; right: auto; transform: translateX(-50%); white-space: nowrap; font: 24px Bungee, Inter; padding: 7px 22px 8px; border-radius: 8px;
  background: var(--plaque); box-shadow: var(--filet); text-shadow: 0 2px 0 rgba(0,0,0,.45); }
#center small { font: 800 11.5px Inter; letter-spacing: .14em; text-transform: uppercase; color: #e8edff; opacity: 1; margin-top: 1px; }
#center.on { animation: plaquepop .3s cubic-bezier(.3,1.6,.5,1); }
#center.danger { background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,0) 46%), linear-gradient(180deg, rgba(150,18,22,.94), rgba(96,8,12,.94)); color: #fff !important; }
#center.danger::before { content: 'ALERTE'; position: absolute; left: 50%; top: -9px; transform: translateX(-50%); font: 900 9px Inter; letter-spacing: .2em; background: #fff; color: #9a1218; padding: 1px 7px; border-radius: 3px; }
#notopop { top: 152px !important; white-space: nowrap; padding: 6px 20px 7px; border-radius: 8px; background: var(--plaque); box-shadow: var(--filet); }
#notopop b { display: inline-block !important; font-size: 22px !important; vertical-align: middle; }
#notopop .st { display: inline-block !important; font-size: 22px !important; margin-left: 10px; vertical-align: middle; }
#notopop small { margin-top: 0; font-size: 10.5px; color: #e8edff; }
body.touch #notopop { top: calc(var(--st, 8px) + 64px) !important; padding: 4px 12px 5px; } body.touch #notopop b, body.touch #notopop .st { font-size: 15px !important; }
#hud:has(#capbox.on) #center, #hud:has(#capbox.on) #notopop { top: 214px !important; }
#hud:has(#capbox.on) #multik { top: 38%; }
/* scène : le grand titre ne reçoit plus de voile ; il reste au-dessus du réticule */
#multik.upd small { animation: xbump .35s cubic-bezier(.3,2,.5,1); }
/* barre des séries : une seule touche « activer », les autres bonus prêts sont simplement marqués */
#streakbar .sk { background: var(--plaque) !important; border: 0 !important; box-shadow: var(--filet); }
#streakbar .sk.next { box-shadow: var(--filet), 0 0 0 2px rgba(159,245,159,.55); }
#streakbar .sk.ready { background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0) 46%), linear-gradient(180deg, rgba(120,92,18,.94), rgba(52,40,10,.94)) !important; box-shadow: inset 0 0 0 1.5px rgba(20,14,0,.95), inset 0 0 0 2.6px rgba(255,214,90,.95), 0 3px 12px rgba(0,0,0,.4); }
#streakbar .sk .key.alt { background: rgba(14,24,52,.92); color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); font-size: 10px; letter-spacing: .1em; }
#hud.incar #streakbar { display: none; }
#hud.incar #prompt { bottom: 196px; }
#hud:has(#streakbar .sk.ready) #prompt { bottom: 182px; }
#car { padding: 7px 16px; }
#car.heli { bottom: 70px; }
@keyframes plaquein { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
@keyframes plaquepop { 0% { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(.92); } 100% { opacity: 1; transform: translateX(-50%); } }
@keyframes xbump { 0% { transform: scale(1.5); } 100% { transform: none; } }
/* tactile */
body.touch #center { top: calc(var(--st, 8px) + 64px); font-size: 17px; padding: 5px 14px 6px; }
body.touch #center small { font-size: 9.5px; }
body.touch #cashpop { position: fixed; left: calc(var(--sl, 10px) + 112px); top: calc(var(--st, 8px) + 84px); padding: 2px 8px 3px; }
body.touch #cashpop small { display: none; }
body.touch #toasts { top: calc(var(--st, 8px) + 112px) !important; max-width: 200px !important; }
body.touch #killcam { right: var(--sr, 10px); top: calc(var(--st, 8px) + 2px); transform: scale(.44); transform-origin: top right; }
body.touch #killcam.on { transform: scale(.44); }
body.touch.newson #killcam { display: none; }
body.touch #cashpop b { font-size: 13px; } body.touch #cashpop small { font-size: 8.5px; }
@media (max-width: 760px), (max-height: 520px) { #center { top: 108px; font-size: 18px; } }
`;

export function installRegie(Game) {
  const P = Game.prototype;
  const bigText = P.bigText, announce = P.announce, medal = P.medal, toast = P.toast, flash = P.flash, killFeed = P.killFeed,
    multiKill = P.multiKill, addStreak = P.addStreak, streakLegend = P.streakLegend, notoUp = P.notoUp, drawStreakbar = P.drawStreakbar, updateHud = P.updateHud;

  P.regie = function () {
    if (this._regie) return this._regie;
    if (!$('regieCss')) { const s = document.createElement('style'); s.id = 'regieCss'; s.textContent = CSS; document.head.appendChild(s); }
    if (!$('cashpop') && $('mats')) { const el = document.createElement('div'); el.id = 'cashpop'; $('mats').appendChild(el); }
    return (this._regie = { hero: { cur: null, q: [] }, info: { cur: null, q: [] }, ctx: null, cash: null, flashT: -9, me: null });
  };

  // ------------------------------------------------------------------ scène (grand titre du joueur)
  // pri : 1 multi-kill, 2 bonus prêt / atout lancé, 3 titre de légende / assaut final
  P.bigText = function (big, small, color = '#fff', cls = '') {
    const R = this.regie(), ctx = R.ctx || {};
    if (DANGER.test(color) && !ctx.hero) { this.infoPush({ key: 'danger:' + big, big, small, color: '#fff', cls: 'danger', pri: 3, dur: 2.4 }); return; }
    const pri = ctx.pri ?? (/t6|m6/.test(cls) ? 3 : 2);
    const it = { key: ctx.key || big, big, small, color, cls, pri, dur: heroDur(cls) };
    if (ctx.reward) { it.reward = 1; it.names = [String(big).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/!+/g, '').trim()]; }
    this.heroPush(it);
  };
  P.heroPush = function (it) {
    const H = this.regie().hero, t = now(); it.born = t;
    const cur = H.cur, shown = cur ? t - cur.t0 : 99;
    // le carnage continue : on met à jour le titre affiché (sans tout relancer si le nom ne change pas)
    if (cur && it.key === 'multi' && cur.key === 'multi' && shown < cur.dur && !H.q.length) {
      const el = $('multik');
      if (cur.big === it.big && el) { const s = el.querySelector('small'); if (s) s.innerHTML = iconize(it.small || ''); el.classList.remove('upd'); void el.offsetWidth; el.classList.add('upd'); cur.dur = Math.max(cur.dur, shown + 1.2); return; }
      return this.heroShow(it);
    }
    // plusieurs bonus débloqués d'affilée et pas encore annoncés : un seul titre qui les liste
    const rw = it.reward && H.q.find((q) => q.reward);
    if (rw) { rw.names.push(...it.names); rw.big = `${rw.names.length} BONUS PRÊTS !!`; rw.small = `${rw.names.join(' · ')} · ${this.input.label('streak')} pour activer`; rw.cls = 't4'; rw.dur = heroDur('t4'); rw.color = it.color; return; }
    // une seule entrée par sujet (la plus récente) ; un multi-kill qui continue garde sa place dans la file
    const same = H.q.find((q) => q.key === it.key); if (same) { Object.assign(same, { ...it, born: same.born, last: t }); return; }
    if (!cur || shown >= cur.dur) return this.heroShow(it);
    H.q.push(it); H.q.sort((a, b) => (b.pri >= 3) - (a.pri >= 3) || a.born - b.born); if (H.q.length > 4) H.q.length = 4;
  };
  // temps de lecture minimal avant de passer au titre suivant quand la file attend : rafale = 1 s par titre
  const heroMin = (cur) => (cur.pri >= 3 ? 1.8 : 1.0);
  P.heroShow = function (it) { const H = this.regie().hero; it.t0 = now(); H.cur = it; $('multik')?.classList.remove('upd'); bigText.call(this, it.big, it.small, it.color, it.cls); };

  // ------------------------------------------------------------------ bandeau (ce qui se passe autour)
  P.announce = function (big, small, color = '#fff', dur = 2) {
    if (this.regie().direct) return announce.call(this, big, small, color, dur);
    this.infoPush({ key: 'ann:' + big, big, small, color, dur: Math.max(1.4, dur), pri: /VICTOIRE|DÉFAITE|ÉGALITÉ|ÉLIMINÉ/.test(big) ? 4 : 2 });
  };
  P.infoPush = function (it) {
    const I = this.regie().info, t = now(); it.born = t; const cur = I.cur, shown = cur ? t - cur.t0 : 99;
    if (cur && cur.key === it.key && shown < cur.dur) return this.infoShow(it); // même sujet : on remplace sur place
    I.q = I.q.filter((q) => q.key !== it.key);
    if (!cur || shown >= cur.dur || it.pri >= 4 || (it.pri > cur.pri && shown >= 0.6)) return this.infoShow(it);
    I.q.push(it); I.q.sort((a, b) => b.pri - a.pri || a.born - b.born); if (I.q.length > 4) I.q.length = 4;
  };
  P.infoShow = function (it) {
    const I = this.regie().info; it.t0 = now(); I.cur = it; const c = $('center'), n = $('notopop');
    if (it.noto) { c?.classList.remove('on', 'danger'); if (n) { n.innerHTML = it.noto; n.classList.remove('on'); void n.offsetWidth; n.classList.add('on'); } return; }
    n?.classList.remove('on'); clearTimeout(this._annT);
    this._regie.direct = true; announce.call(this, it.big, it.small, it.color, it.dur); this._regie.direct = false;
    c?.classList.toggle('danger', it.cls === 'danger');
  };
  // montée d'étoiles / de grade : le texte est préparé par notoriete.js, on le passe au bandeau
  P.notoUp = function (a, from, to) {
    notoUp.call(this, a, from, to); if (a !== this.player) return;
    const n = $('notopop'); if (!n || !n.classList.contains('on')) return; const html = n.innerHTML; n.classList.remove('on');
    this.infoPush({ key: 'noto', noto: html, pri: 1, dur: 2.5 });
  };

  // ------------------------------------------------------------------ branchements : qui parle sur la scène
  const withCtx = function (ctx, f) { const R = this.regie(), o = R.ctx; R.ctx = ctx; try { return f(); } finally { R.ctx = o; } };
  P.multiKill = function (opts) { return withCtx.call(this, { key: 'multi', pri: 1, hero: 1 }, () => multiKill.call(this, opts)); };
  P.addStreak = function (a) { return withCtx.call(this, { pri: 2, hero: 1, reward: 1 }, () => addStreak.call(this, a)); };
  P.streakLegend = function (a, w) { return withCtx.call(this, { pri: 3, hero: 1 }, () => streakLegend.call(this, a, w)); };

  // médaille sous le réticule : inutile pendant un multi-kill (le titre compte déjà les éliminations)
  P.medal = function (big, small, gold) { const M = this.mk; if (M && M.n >= 2 && this.time - M.t < 0.05) return; return medal.call(this, big, small, gold); };

  // flashs d'écran : au plus un toutes les 0,45 s, et plus doux quand une annonce occupe déjà la scène
  P.flash = function (bg) { const R = this.regie(), t = now(); if (t - R.flashT < 0.45) return; R.flashT = t; return flash.call(this, bg); };

  // ------------------------------------------------------------------ gains regroupés
  P.earn = function (n, why, big) {
    n = Math.round(n); if (!n) return; this.save.bank += n; this.stats.earned += n; this.persist(); this.audio.cash(big || n >= 500);
    const R = this.regie(), t = now(), el = $('cashpop'); if (!el) return toast.call(this, `+${fmt(n)} € · ${why}`, '#ffcc3d');
    if (!R.cash || t - R.cash.t > 2.4) R.cash = { n: 0, why: new Map() }; const C = R.cash; C.n += n; C.t = t; C.why.set(why, (C.why.get(why) || 0) + 1);
    const parts = [...C.why].slice(-2).map(([w, k]) => k > 1 ? `${w} ×${k}` : w);
    el.innerHTML = `<b>+${fmt(C.n)} €</b><small>${parts.join(' · ')}</small>`; el.classList.add('on'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    clearTimeout(this._cashT); this._cashT = setTimeout(() => el.classList.remove('on'), 2400);
  };

  // ------------------------------------------------------------------ toasts : identiques regroupés, 3 au plus
  P.toast = function (txt, color = '#fff') {
    const box = $('toasts'); if (!box) return; const key = String(txt);
    let n = 1; for (const d of [...box.children]) if (d._k === key) { n = (d._n || 1) + 1; d.remove(); }
    toast.call(this, txt, color); const el = box.lastChild; if (el) { el._k = key; el._n = n; if (n > 1) el.insertAdjacentHTML('beforeend', `<span class="n">×${n}</span>`); }
    while (box.children.length > 3) box.firstChild.remove();
  };

  // ------------------------------------------------------------------ fil : rafales du joueur sur une ligne
  P.killFeed = function (by, t, opts) {
    killFeed.call(this, by, t, opts); const feed = $('feed'); if (!feed) return; const el = feed.firstChild; const R = this.regie(), tt = now();
    if (by && by === this.player && el) {
      const M = R.me; if (M && M.el.isConnected && tt - M.t < 3) { const k = M.k + 1; M.el.remove(); el.insertAdjacentHTML('beforeend', `<span class="x">×${k}</span>`); el.classList.add('bump'); R.me = { el, k, t: tt }; }
      else R.me = { el, k: 1, t: tt };
    }
    while (feed.children.length > 4) feed.lastChild.remove();
  };

  // ------------------------------------------------------------------ barre des séries, véhicules
  P.drawStreakbar = function () {
    const k0 = this._sbKey; drawStreakbar.call(this); if (this._sbKey === k0) return;
    const a = this.player, el = $('streakbar'); if (!el || !a?.rewards.length) return;
    const nom = this.streakDef(a, a.rewards[a.rewards.length - 1])?.nom; const cards = [...el.querySelectorAll('.sk.ready')]; if (cards.length < 2) return;
    const mine = [...cards].reverse().find((c) => c.querySelector('.nm')?.textContent.startsWith(nom)) || cards[cards.length - 1];
    for (const c of cards) if (c !== mine) { const k = c.querySelector('.key'); if (k) { k.className = 'key alt'; k.textContent = 'PRÊT'; } }
  };
  P.updateHud = function (...args) {
    const r = updateHud.apply(this, args); const a = this.player, hud = $('hud');
    if (hud && a) { const v = !!a.inCar; if (v !== this._incar) { this._incar = v; hud.classList.toggle('incar', v); } }
    this.regieTick(); return r;
  };
  // fin d'une annonce : on passe à la suivante de la file (les trop vieilles sont abandonnées)
  P.regieTick = function () {
    const R = this._regie; if (!R) return; const t = now();
    const H = R.hero; if (H.q.length && (!H.cur || t - H.cur.t0 >= Math.min(H.cur.dur, heroMin(H.cur)))) { H.q = H.q.filter((q) => t - (q.last || q.born) < (q.pri >= 3 ? 8 : q.pri >= 2 ? 5 : 3)); const it = H.q.shift(); if (it) this.heroShow(it); }
    const I = R.info; if (I.q.length && (!I.cur || t - I.cur.t0 >= I.cur.dur || (I.q[0].pri > I.cur.pri && t - I.cur.t0 >= 0.6))) { I.q = I.q.filter((q) => t - q.born < (q.pri >= 3 ? 6 : 5)); const it = I.q.shift(); if (it) this.infoShow(it); }
  };
  // nouvelle partie : files vidées
  for (const k of ['build', 'buildFromRoster']) { const f = P[k]; if (!f) continue; P[k] = function (...args) { const r = f.apply(this, args); const R = this.regie(); R.hero = { cur: null, q: [] }; R.info = { cur: null, q: [] }; R.cash = null; R.me = null; return r; }; }
}
