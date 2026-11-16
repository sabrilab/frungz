// Boutique : portefeuille (jetons), articles possédés, équipement des cosmétiques, passe de saison, achat de jetons.
//
// Deux fonctionnements :
//  - serveur (production) : /api/boutique répond « ok » → les jetons, les articles payés en jetons et le passe premium sont gardés côté serveur
//    (Supabase), les packs de jetons se paient par Stripe Checkout (api/boutique.mjs + api/stripe-webhook.mjs).
//  - démo (local, ou serveur pas encore configuré) : tout reste dans la sauvegarde du navigateur, l'achat de jetons est simulé (bandeau « DÉMO »).
// Les articles payés en € (banque du jeu) restent toujours locaux, comme le reste de la progression.
import { ARTICLES, CAMOS, TRACANTES, EFFETS, TENUES, LOTS, PACKS, SAISON, RARETES } from './boutique-data.mjs';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const euros = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const JETON = '<span class="bq-jt" aria-label="jetons"></span>';

export function initCosm(save) {
  const c = (save.cosm ||= {}); c.jetons ??= 0; c.owned ||= []; c.eq = { camo: 'aucun', trace: 'aucune', effet: 'aucun', ...(c.eq || {}) };
  c.passe ||= {}; if (c.passe.saison !== SAISON.id) c.passe = { saison: SAISON.id, xp0: save.xp || 0, premium: false, pris: { g: [], p: [] } };
  c.passe.pris ||= { g: [], p: [] }; return c;
}
// le joueur possède-t-il cet article ? (les articles « par défaut » sont à tout le monde)
export function owns(save, aid) { if (/^(camo:aucun|trace:aucune|effet:aucun)$/.test(aid)) return true; return (save.cosm?.owned || []).includes(aid); }
export const premiumSkinIds = (team) => TENUES.filter((t) => !team || t.team === team).map((t) => t.id);

export function createBoutique({ save, persist, audio, root, base = '', native = false, preview, onChange }) {
  const C = initCosm(save); persist();
  let mode = 'demo', paiement = false, tab = 'une', busy = false, msg = '', sel = null, consent = false;
  const api = async (body) => {
    const r = await fetch(base + '/api/boutique', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: C.compte?.id, secret: C.compte?.secret }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'erreur ' + r.status); return j;
  };
  // portefeuille du serveur : il fait foi pour les jetons et les articles payés en jetons
  function applyWallet(w) { if (!w) return; C.jetons = w.jetons | 0; C.owned = [...new Set([...(C.owned || []).filter((a) => ARTICLES[a]?.prix?.eur), ...(w.owned || [])])]; C.passe.premium = !!(w.passes || []).includes(SAISON.id); C.starter = !!w.starter; const pr = w.pris?.[SAISON.id] || {}; C.passe.pris.g = [...new Set([...(C.passe.pris.g || []).filter((n) => /^eur:/.test(SAISON.paliers.find((r) => r[0] === n)?.[1] || '')), ...(pr.g || [])])]; C.passe.pris.p = pr.p || []; persist(); }
  async function connect() {
    try {
      if (save.test) throw 0; // mode test (?test=max) : toujours en démo, rien ne part au serveur
      const r = await fetch(base + '/api/boutique?a=status', { cache: 'no-store' }); const j = await r.json(); if (!j.ok) throw 0;
      mode = 'serveur'; paiement = !!j.paiement && !native; // dans l'app iPhone, Apple impose ses propres achats intégrés : pas de Stripe
      if (!C.compte?.id) { C.compte = await api({ a: 'register' }); persist(); }
      applyWallet(await api({ a: 'wallet' }));
    } catch { mode = 'demo'; paiement = false; }
    // retour de Stripe Checkout
    const q = new URLSearchParams(location.search);
    if (q.get('achat')) { msg = q.get('achat') === 'ok' ? 'Paiement reçu : tes jetons arrivent dans quelques secondes.' : 'Paiement annulé.'; history.replaceState(null, '', location.pathname + location.search.replace(/[?&]achat=[^&]*/, '').replace(/^&/, '?')); if (q.get('achat') === 'ok') { open('jetons'); setTimeout(refresh, 2500); setTimeout(refresh, 8000); } }
    render(); onChange?.();
  }
  async function refresh() { if (mode !== 'serveur') return; try { applyWallet(await api({ a: 'wallet' })); render(); onChange?.(); } catch {} }

  // ---------------------------------------------------------------- achats
  const can = (prix) => (prix?.jetons ? C.jetons >= prix.jetons : prix?.eur ? save.bank >= prix.eur : false);
  function grant(aid) { const A = ARTICLES[aid]; if (!A) return; if (A.type === 'lot') { for (const x of A.articles) grant(x); return; } if (!C.owned.includes(aid)) C.owned.push(aid); }
  async function buy(aid) {
    const A = ARTICLES[aid]; if (!A || busy) return; const prix = A.prix; if (!prix || owns(save, aid) || !can(prix)) return;
    busy = true; render();
    try {
      if (prix.eur) { save.bank -= prix.eur; grant(aid); }
      else if (mode === 'serveur') applyWallet(await api({ a: 'buy', article: aid }));
      else { C.jetons -= prix.jetons; grant(aid); }
      audio?.cash?.(true); msg = `${A.nom} débloqué !`;
      if (A.type === 'camo' || A.type === 'trace' || A.type === 'effet') equip(aid, true);
      if (A.type === 'lot') for (const x of A.articles) if (!/^tenue:/.test(x)) equip(x, true);
    } catch (e) { msg = 'Achat impossible : ' + e.message; }
    busy = false; persist(); render(); onChange?.();
  }
  function equip(aid, quiet) {
    const A = ARTICLES[aid] || { type: aid.split(':')[0], id: aid.split(':')[1] }; if (!owns(save, aid)) return;
    if (A.type === 'tenue') { const t = TENUES.find((x) => x.id === A.id); if (t) { save.team = t.team; save.skin = t.id; } }
    else C.eq[A.type] = A.id;
    if (!quiet) audio?.play?.('uiSelect'); persist(); render(); onChange?.();
  }
  async function buyPack(pid) {
    const P = PACKS[pid]; if (!P || busy) return;
    if (!consent) { msg = 'Coche la case de renonciation au délai de rétractation pour continuer.'; render(); return; }
    if (P.unique && C.starter) { msg = 'Le pack de démarrage ne s\'achète qu\'une fois.'; render(); return; }
    busy = true; render();
    try {
      if (mode === 'serveur' && paiement) { const j = await api({ a: 'checkout', pack: pid, consent: true, retour: location.origin + location.pathname }); location.href = j.url; return; }
      // démo : aucun paiement, les jetons sont crédités tout de suite
      C.jetons += P.jetons; for (const a of P.articles || []) grant(a); if (P.unique) C.starter = true; audio?.cash?.(true); msg = `DÉMO : +${fmt(P.jetons)} jetons (aucun paiement réel).`;
    } catch (e) { msg = 'Paiement indisponible : ' + e.message; }
    busy = false; persist(); render(); onChange?.();
  }
  // ---------------------------------------------------------------- passe de saison
  const passeXp = () => Math.max(0, (save.xp || 0) - (C.passe.xp0 || 0));
  const palier = () => Math.min(SAISON.paliers.length, Math.floor(passeXp() / SAISON.xpPalier));
  async function buyPasse() {
    if (C.passe.premium || busy || C.jetons < SAISON.prix.jetons) return; busy = true; render();
    try { if (mode === 'serveur') applyWallet(await api({ a: 'passe' })); else { C.jetons -= SAISON.prix.jetons; C.passe.premium = true; } audio?.cash?.(true); msg = 'Passe premium activé : récupère tes récompenses !'; }
    catch (e) { msg = 'Achat impossible : ' + e.message; }
    busy = false; persist(); render(); onChange?.();
  }
  async function claim(n, piste) {
    const row = SAISON.paliers.find((r) => r[0] === n); if (!row || busy) return; const list = C.passe.pris[piste];
    if (list.includes(n) || n > palier() || (piste === 'p' && !C.passe.premium)) return;
    const rec = piste === 'g' ? row[1] : row[2]; busy = true;
    try {
      if (/^eur:/.test(rec)) { save.bank += +rec.slice(4); list.push(n); }
      else if (mode === 'serveur') applyWallet(await api({ a: 'claim', palier: n, piste, xp: passeXp() }));
      else { if (/^jetons:/.test(rec)) C.jetons += +rec.slice(7); else grant(rec); list.push(n); }
      audio?.cash?.(true); msg = 'Récompense récupérée : ' + recName(rec);
    } catch (e) { msg = 'Récompense indisponible : ' + e.message; }
    busy = false; persist(); render(); onChange?.();
  }
  const recName = (r) => /^eur:/.test(r) ? fmt(+r.slice(4)) + ' €' : /^jetons:/.test(r) ? fmt(+r.slice(7)) + ' jetons' : ARTICLES[r]?.nom || r;

  // ---------------------------------------------------------------- affichage
  const rar = (r) => RARETES[r] || RARETES.commun;
  const priceTag = (A) => !A.prix ? '<em>Passe de saison</em>' : A.prix.jetons ? `${JETON}<b>${fmt(A.prix.jetons)}</b>` : `<span class="eur">€</span><b>${fmt(A.prix.eur)}</b>`;
  function swatch(A) {
    if (A.type === 'camo') { const c = CAMOS[A.id].c || ['#444', '#555', '#333', '#666']; return `<i class="bq-sw camo t-${CAMOS[A.id].type}" style="--a:${c[0]};--b:${c[1]};--c:${c[2]};--d:${c[3]}"></i>`; }
    if (A.type === 'trace') { const c = TRACANTES[A.id].c; return `<i class="bq-sw trace ${c === 'arcenciel' ? 'rb' : c === 'tricolore' ? 'tri' : ''}" style="--a:${/^#/.test(c) ? c : '#fff'}"></i>`; }
    if (A.type === 'effet') return `<i class="bq-sw effet fx-${EFFETS[A.id].fx}"></i>`;
    if (A.type === 'tenue') { const t = TENUES.find((x) => x.id === A.id); return `<i class="bq-sw tenue" style="--a:${t.haut.c || '#333'};--b:${t.bas.c || '#222'};--c:${t.pieds.c || '#eee'}"><s></s></i>`; }
    if (A.type === 'lot') return `<i class="bq-sw lot">${A.articles.length}</i>`;
    return '';
  }
  function card(aid, extra = '') {
    const A = ARTICLES[aid]; if (!A) return ''; const R = rar(A.rarete), own = owns(save, aid), eq = isEquipped(aid);
    const btn = own ? (A.type === 'lot' ? '<button disabled>Possédé</button>' : `<button data-eq="${aid}" ${eq ? 'disabled' : ''}>${eq ? 'Équipé' : 'Équiper'}</button>`)
      : !A.prix ? '<button disabled>Passe de saison</button>' : `<button data-buy="${aid}" ${can(A.prix) && !busy ? '' : 'disabled'}>${priceTag(A)}</button>`;
    const sub = A.type === 'tenue' ? (A.team === 'ordre' ? 'Tenue · Brigade' : 'Tenue · Frungz') : A.type === 'camo' ? 'Camouflage d\'arme' : A.type === 'trace' ? 'Traçante' : A.type === 'effet' ? 'Effet d\'élimination' : 'Lot · ' + A.articles.map((x) => ARTICLES[x]?.nom).join(' + ');
    return `<div class="bq-card${own ? ' own' : ''}${sel === aid ? ' sel' : ''}" data-aid="${aid}" style="--r:${R.couleur}" tabindex="-1">${extra}${swatch(A)}<div class="bq-txt"><small style="color:${R.couleur}">${R.nom}</small><b>${esc(A.nom)}</b><span>${esc(sub)}</span></div>${btn}</div>`;
  }
  function isEquipped(aid) { const [t, id] = aid.split(':'); if (t === 'tenue') return save.skin === id; return C.eq[t] === id; }
  // vitrine du jour : la même pour tout le monde, change à minuit
  function vitrine() {
    const d = new Date(); let s = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate(); const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pool = Object.keys(ARTICLES).filter((a) => ARTICLES[a].prix?.jetons && ARTICLES[a].type !== 'lot'); const out = [];
    while (out.length < 6 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]); return out;
  }
  const TABS = { une: 'À la une', camo: 'Camouflages', tenue: 'Tenues', fx: 'Traçantes & effets', passe: 'Passe de saison', jetons: 'Jetons' };
  function body() {
    if (tab === 'une') {
      const fin = new Date(); fin.setHours(24, 0, 0, 0); const h = Math.max(1, Math.round((fin - Date.now()) / 3600e3));
      return `<h4 class="bq-h">Lots <small>moins chers qu'à l'unité</small></h4><div class="bq-grid">${Object.keys(LOTS).map((l) => card('lot:' + l, '<span class="bq-flag">LOT</span>')).join('')}</div>
        <h4 class="bq-h">Vitrine du jour <small>change dans ${h} h</small></h4><div class="bq-grid">${vitrine().map((a) => card(a)).join('')}</div>`;
    }
    if (tab === 'camo') return `<p class="bq-note">Le camouflage équipé s'applique à toutes tes armes, en vue extérieure comme à la première personne. Tes amis le voient en ligne.</p><div class="bq-grid">${['camo:aucun', ...Object.keys(ARTICLES).filter((a) => /^camo:/.test(a))].map((a) => a === 'camo:aucun' ? defCard('camo', 'aucun', CAMOS.aucun) : card(a)).join('')}</div>`;
    if (tab === 'tenue') return `<p class="bq-note">Tenues exclusives, faites pour un camp. « Équiper » te fait passer dans ce camp avec la tenue ; tu la retrouves aussi dans ton casier.</p>${['civils', 'ordre'].map((tm) => `<h4 class="bq-h">${tm === 'civils' ? 'Les Frungz' : 'La Brigade'}</h4><div class="bq-grid">${TENUES.filter((t) => t.team === tm).map((t) => card('tenue:' + t.id)).join('')}</div>`).join('')}`;
    if (tab === 'fx') return `<h4 class="bq-h">Traçantes <small>la couleur de tes balles</small></h4><div class="bq-grid">${['trace:aucune', ...Object.keys(ARTICLES).filter((a) => /^trace:/.test(a))].map((a) => a === 'trace:aucune' ? defCard('trace', 'aucune', TRACANTES.aucune) : card(a)).join('')}</div>
      <h4 class="bq-h">Effets d'élimination <small>sur chaque adversaire que tu élimines</small></h4><div class="bq-grid">${['effet:aucun', ...Object.keys(ARTICLES).filter((a) => /^effet:/.test(a))].map((a) => a === 'effet:aucun' ? defCard('effet', 'aucun', EFFETS.aucun) : card(a)).join('')}</div>`;
    if (tab === 'passe') {
      const p = palier(), xp = passeXp(), into = xp - p * SAISON.xpPalier, maxed = p >= SAISON.paliers.length;
      const cell = (n, rec, piste) => { const got = C.passe.pris[piste].includes(n), ready = n <= p && !got && (piste === 'g' || C.passe.premium), lock = piste === 'p' && !C.passe.premium; const A = ARTICLES[rec];
        return `<div class="bq-rw ${piste}${got ? ' got' : ''}${ready ? ' ready' : ''}${lock ? ' lock' : ''}" style="--r:${A ? rar(A.rarete).couleur : '#7f8a99'}">${A ? swatch(A) : /^jetons:/.test(rec) ? `<i class="bq-sw jt">${JETON}</i>` : '<i class="bq-sw eur">€</i>'}<span>${esc(recName(rec))}</span>${ready ? `<button data-claim="${n}" data-piste="${piste}">Récupérer</button>` : got ? '<em>✓</em>' : ''}</div>`; };
      return `<div class="bq-passhead"><div><b>${esc(SAISON.nom)}</b><span>jusqu'au ${new Date(SAISON.fin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${SAISON.paliers.length} paliers · ${SAISON.xpPalier} XP par palier, gagnée dans tous les modes</span>
        <div class="bq-xp"><i style="width:${maxed ? 100 : Math.round(into / SAISON.xpPalier * 100)}%"></i></div><small>Palier ${p}/${SAISON.paliers.length}${maxed ? '' : ` · ${fmt(into)}/${SAISON.xpPalier} XP`}</small></div>
        ${C.passe.premium ? '<div class="bq-prem on">Passe premium actif</div>' : `<button class="bq-prem" data-passe="1" ${C.jetons >= SAISON.prix.jetons && !busy ? '' : 'disabled'}>Passe premium<br>${JETON}<b>${fmt(SAISON.prix.jetons)}</b></button>`}</div>
        <div class="bq-track"><div class="bq-lbl"><span>Gratuit</span><span>Premium</span></div>${SAISON.paliers.map(([n, g, pr]) => `<div class="bq-col${n <= p ? ' done' : ''}"><b>${n}</b>${cell(n, g, 'g')}${cell(n, pr, 'p')}</div>`).join('')}</div>`;
    }
    if (tab === 'jetons') {
      const packs = Object.entries(PACKS).filter(([id]) => !(id === 'starter' && C.starter));
      const off = mode === 'serveur' && !paiement;
      return `${mode === 'demo' ? '<p class="bq-demo">MODE DÉMO · aucun paiement n\'est demandé, les jetons sont crédités directement. En ligne, le paiement passe par Stripe dès que la boutique est configurée.</p>' : ''}
        ${off ? `<p class="bq-note">${native ? 'Les jetons s\'achètent sur le site frungz.vercel.app ; ils arrivent ensuite dans l\'app avec ton compte.' : 'Le paiement n\'est pas encore ouvert.'}</p>` : ''}
        <div class="bq-grid packs">${packs.map(([id, P]) => `<div class="bq-pack${P.top ? ' top' : ''}${P.unique ? ' starter' : ''}">${P.top ? '<span class="bq-flag">LE PLUS PRIS</span>' : P.unique ? '<span class="bq-flag">UNE SEULE FOIS</span>' : ''}<i class="bq-coins n${Math.min(4, Math.ceil(P.jetons / 1600))}"></i><b>${fmt(P.jetons)} jetons</b><small>${esc(P.nom)}${P.bonus ? ' · ' + P.bonus : ''}</small>${P.articles ? `<small class="inc">+ ${P.articles.map((a) => esc(ARTICLES[a]?.nom)).join(' + ')}</small>` : ''}<button data-pack="${id}" ${off || busy ? 'disabled' : ''}>${euros(P.cents)}</button></div>`).join('')}</div>
        <label class="bq-consent"><input type="checkbox" id="bqConsent" ${consent ? 'checked' : ''}> Je demande à recevoir les jetons tout de suite et je renonce à mon droit de rétractation de 14 jours pour ce contenu numérique (art. L221-28 du Code de la consommation).</label>
        <p class="bq-legal">Les jetons n'achètent que des objets d'apparence : ils ne donnent aucun avantage en partie. Pas de boîte au hasard : tu vois toujours ce que tu achètes. Mineurs : demande l'accord d'un parent. <a href="/legal/cgv.html" target="_blank" rel="noopener">CGV</a> · <a href="/legal/confidentialite.html" target="_blank" rel="noopener">Confidentialité</a> · <a href="/legal/mentions.html" target="_blank" rel="noopener">Mentions légales</a></p>`;
    }
    return '';
  }
  function defCard(type, id, D) { const aid = type + ':' + id, eq = isEquipped(aid); return `<div class="bq-card own" data-aid="${aid}" style="--r:#7f8a99"><i class="bq-sw def"></i><div class="bq-txt"><small>Par défaut</small><b>${esc(D.nom)}</b><span>${esc(D.desc || '')}</span></div><button data-eq="${aid}" ${eq ? 'disabled' : ''}>${eq ? 'Équipé' : 'Équiper'}</button></div>`; }
  function render() {
    if (!root) return;
    root.querySelector('.bq-wallet').innerHTML = `<div class="chip jt" title="Jetons">${JETON}<b>${fmt(C.jetons)}</b></div><div class="chip cash" title="Banque"><span class="eur">€</span><b>${fmt(save.bank)}</b></div>${mode === 'demo' ? '<span class="bq-tagdemo">DÉMO</span>' : ''}`;
    root.querySelector('.bq-tabs').innerHTML = Object.entries(TABS).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('');
    root.querySelector('.bq-msg').textContent = msg; root.querySelector('.bq-msg').classList.toggle('on', !!msg);
    root.querySelector('.bq-body').innerHTML = body();
    root.querySelector('.bq-pv').classList.toggle('hidden', !['une', 'camo', 'tenue'].includes(tab) || !preview);
  }
  function showSel(aid) {
    if (!preview || !aid || sel === aid) return; const A = ARTICLES[aid] || {}; const t = aid.split(':')[0];
    if (t !== 'camo' && t !== 'tenue' && t !== 'lot') return; sel = aid; root.querySelectorAll('.bq-card').forEach((c) => c.classList.toggle('sel', c.dataset.aid === aid));
    try { preview.show(aid); } catch (e) { console.warn('aperçu boutique', e); }
    const info = root.querySelector('.bq-pvinfo'); if (info) info.innerHTML = A.nom ? `<b style="color:${rar(A.rarete).couleur}">${esc(A.nom)}</b><small>${rar(A.rarete).nom}</small>` : '';
  }
  root?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b && !b.disabled) {
      if (b.dataset.tab) { tab = b.dataset.tab; msg = ''; sel = null; render(); audio?.play?.('uiTick'); const first = root.querySelector('.bq-card[data-aid^="camo:"]:not([data-aid="camo:aucun"]), .bq-card[data-aid^="tenue:"], .bq-card[data-aid^="lot:"]'); if (first) showSel(first.dataset.aid); return; }
      if (b.dataset.buy) return buy(b.dataset.buy);
      if (b.dataset.eq) return equip(b.dataset.eq);
      if (b.dataset.pack) return buyPack(b.dataset.pack);
      if (b.dataset.passe) return buyPasse();
      if (b.dataset.claim) return claim(+b.dataset.claim, b.dataset.piste);
      if (b.dataset.close) return close();
    }
    const c = e.target.closest('.bq-card'); if (c) showSel(c.dataset.aid);
  });
  root?.addEventListener('change', (e) => { if (e.target.id === 'bqConsent') consent = e.target.checked; });
  root?.addEventListener('pointerover', (e) => { const c = e.target.closest('.bq-card'); if (c) showSel(c.dataset.aid); });
  root?.addEventListener('focusin', (e) => { const c = e.target.closest('.bq-card'); if (c) showSel(c.dataset.aid); });
  function open(t) { if (t && TABS[t]) tab = t; msg = msg || ''; root?.classList.remove('hidden'); render(); preview?.start?.(); const first = root.querySelector('.bq-card[data-aid^="lot:"], .bq-card[data-aid^="camo:"]:not([data-aid="camo:aucun"]), .bq-card[data-aid^="tenue:"]'); sel = null; if (first) showSel(first.dataset.aid); refresh(); }
  function close() { root?.classList.add('hidden'); preview?.stop?.(); msg = ''; onChange?.(); }
  connect();
  return { open, close, render, get eq() { return C.eq; }, get jetons() { return C.jetons; }, get mode() { return mode; }, owns: (aid) => owns(save, aid), isOpen: () => !root?.classList.contains('hidden') };
}
