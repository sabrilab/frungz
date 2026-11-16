// Webhook Stripe : crédite les jetons quand un paiement est confirmé, les reprend en cas de remboursement ou de litige.
// Dans le tableau de bord Stripe : Développeurs → Webhooks → https://frungz.vercel.app/api/stripe-webhook, événements :
//   checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded, charge.dispute.created
// La signature est vérifiée (STRIPE_WEBHOOK_SECRET) : sans elle, n'importe qui pourrait se créditer des jetons.
import { PACKS } from '../src/boutique-data.mjs';
import { env, rpc, stripeSigOk } from './_boutique-lib.mjs';

export const config = { api: { bodyParser: false } };
const rawBody = (req) => new Promise((ok, ko) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c).toString('utf8'))); req.on('error', ko); });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const raw = await rawBody(req); // corps brut, lu avant tout accès à req.body (sinon Vercel le décode et la signature ne se vérifie plus)
  if (!stripeSigOk(raw, req.headers['stripe-signature'], env().whsec)) return res.status(400).json({ error: 'signature' });
  const ev = JSON.parse(raw); const o = ev.data?.object || {};
  try {
    if ((ev.type === 'checkout.session.completed' && o.payment_status === 'paid') || ev.type === 'checkout.session.async_payment_succeeded') {
      const P = PACKS[o.metadata?.pack]; const id = o.metadata?.joueur || o.client_reference_id;
      if (!P || !id) return res.status(200).json({ ignore: 'pack ou joueur manquant' });
      if (o.amount_total != null && o.amount_total < P.cents) return res.status(200).json({ ignore: 'montant' }); // prix modifié côté Stripe : on ne crédite pas
      await rpc('crediter', { p_session: o.id, p_id: id, p_pack: o.metadata.pack, p_jetons: P.jetons, p_cents: o.amount_total ?? P.cents, p_items: P.articles || [], p_unique: !!P.unique, p_pi: o.payment_intent || null });
    } else if (ev.type === 'charge.refunded' || ev.type === 'charge.dispute.created') {
      const pi = o.payment_intent; if (pi) await rpc('rembourser', { p_pi: pi });
    }
    return res.status(200).json({ ok: true });
  } catch (e) { console.error('webhook', e); return res.status(500).json({ error: 'traitement' }); } // Stripe réessaiera
}
