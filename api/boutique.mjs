// Boutique côté serveur : comptes, portefeuille, achats en jetons, passe de saison, création du paiement Stripe.
// Les prix viennent TOUJOURS du catalogue (src/boutique-data.mjs), jamais du navigateur.
//   GET  /api/boutique?a=status                       → { ok, paiement }  (ok : Supabase configuré ; paiement : Stripe configuré)
//   POST /api/boutique { a: 'register' }               → { id, secret }    (le navigateur garde le secret ; on ne stocke que son empreinte)
//   POST /api/boutique { a: 'wallet', id, secret }     → portefeuille
//   POST /api/boutique { a: 'buy', article }           → portefeuille       (article payé en jetons)
//   POST /api/boutique { a: 'passe' }                  → portefeuille       (passe premium de la saison en cours)
//   POST /api/boutique { a: 'claim', palier, piste }   → portefeuille       (récompense en jetons ou article ; les € restent dans le jeu)
//   POST /api/boutique { a: 'checkout', pack, consent, retour } → { url } (page de paiement Stripe)
import crypto from 'node:crypto';
import { ARTICLES, PACKS, SAISON } from '../src/boutique-data.mjs';
import { env, sha, same, sb, rpc, stripe, wallet } from './_boutique-lib.mjs';

const ORIGINS = () => (process.env.BOUTIQUE_ORIGINS || 'https://frungz.vercel.app').split(',').map((s) => s.trim()).filter(Boolean);
const flat = (aid) => (ARTICLES[aid]?.type === 'lot' ? ARTICLES[aid].articles : [aid]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const E = env(); const ok = !!(E.sb && E.sk);
  if (req.method === 'GET') return res.status(200).json({ ok, paiement: ok && !!E.stripe && !!E.whsec });
  if (!ok) return res.status(503).json({ error: 'boutique non configurée' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'méthode' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  try {
    if (b.a === 'register') {
      const secret = crypto.randomBytes(24).toString('base64url');
      const [j] = await sb('joueurs?select=id', { method: 'POST', body: { secret_hash: sha(secret) }, prefer: 'return=representation' });
      return res.status(200).json({ id: j.id, secret });
    }
    // les autres actions demandent un joueur identifié
    if (!/^[0-9a-f-]{36}$/.test(String(b.id || '')) || !b.secret) return res.status(401).json({ error: 'compte inconnu' });
    const [me] = await sb(`joueurs?id=eq.${b.id}&select=*`);
    if (!me || !same(me.secret_hash, sha(b.secret))) return res.status(401).json({ error: 'compte inconnu' });

    if (b.a === 'wallet') return res.status(200).json(wallet(me));
    if (b.a === 'buy') {
      const A = ARTICLES[b.article]; if (!A || !A.prix?.jetons) return res.status(400).json({ error: 'article introuvable ou pas en jetons' });
      return res.status(200).json(wallet(await rpc('acheter', { p_id: me.id, p_article: b.article, p_prix: A.prix.jetons, p_items: flat(b.article) })));
    }
    if (b.a === 'passe') return res.status(200).json(wallet(await rpc('acheter_passe', { p_id: me.id, p_saison: SAISON.id, p_prix: SAISON.prix.jetons })));
    if (b.a === 'claim') {
      const n = b.palier | 0, piste = b.piste === 'p' ? 'p' : 'g'; const row = SAISON.paliers.find((r) => r[0] === n); if (!row) return res.status(400).json({ error: 'palier inconnu' });
      if (piste === 'p' && !(me.passes || []).includes(SAISON.id)) return res.status(403).json({ error: 'passe premium requis' });
      // ⚠ la progression (XP) est calculée dans le navigateur : on ne peut pas la vérifier ici (voir docs/SORTIE.md, « progression côté serveur »)
      const rec = piste === 'g' ? row[1] : row[2]; if (/^eur:/.test(rec)) return res.status(400).json({ error: 'récompense en € : gérée par le jeu' });
      const jet = /^jetons:/.test(rec) ? +rec.slice(7) : 0, item = jet ? null : rec; if (item && !ARTICLES[item]) return res.status(500).json({ error: 'catalogue' });
      return res.status(200).json(wallet(await rpc('recompense', { p_id: me.id, p_saison: SAISON.id, p_piste: piste, p_palier: n, p_jetons: jet, p_item: item })));
    }
    if (b.a === 'checkout') {
      if (!E.stripe || !E.whsec) return res.status(503).json({ error: 'paiement non configuré' });
      const P = PACKS[b.pack]; if (!P) return res.status(400).json({ error: 'pack inconnu' });
      if (!b.consent) return res.status(400).json({ error: 'renonciation au délai de rétractation requise' });
      if (P.unique && me.starter) return res.status(400).json({ error: 'pack déjà acheté' });
      const back = ORIGINS().find((o) => String(b.retour || '').startsWith(o)) ? String(b.retour).split('?')[0] : ORIGINS()[0] + '/';
      const s = await stripe('checkout/sessions', {
        mode: 'payment', locale: 'fr', client_reference_id: me.id,
        success_url: back + '?achat=ok', cancel_url: back + '?achat=annule',
        line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: P.cents, product_data: { name: `${P.jetons} jetons Frungz${P.articles ? ' + objets' : ''}`, description: P.nom } } } },
        metadata: { joueur: me.id, pack: b.pack, consent: '1' }, payment_intent_data: { metadata: { joueur: me.id, pack: b.pack } },
        custom_text: { submit: { message: 'Contenu numérique livré immédiatement : vous avez renoncé au délai de rétractation de 14 jours.' } },
      });
      return res.status(200).json({ url: s.url });
    }
    return res.status(400).json({ error: 'action inconnue' });
  } catch (e) {
    const m = String(e.message || e); return res.status(/solde|déjà|inconnu/.test(m) ? 400 : 500).json({ error: m.slice(0, 200) });
  }
}
