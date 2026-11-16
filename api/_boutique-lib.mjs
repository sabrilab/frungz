// Outils partagés par api/boutique.mjs et api/stripe-webhook.mjs (pas une route : le « _ » le cache de Vercel).
// Variables Vercel : SUPABASE_URL, SUPABASE_SERVICE_KEY (clé service_role, jamais dans le jeu), STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// BOUTIQUE_ORIGINS (facultatif : adresses autorisées pour le retour de paiement, séparées par des virgules).
import crypto from 'node:crypto';

export const env = () => ({ sb: process.env.SUPABASE_URL, sk: process.env.SUPABASE_SERVICE_KEY, stripe: process.env.STRIPE_SECRET_KEY, whsec: process.env.STRIPE_WEBHOOK_SECRET });
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// appels PostgREST de Supabase avec la clé service_role
export async function sb(path, { method = 'GET', body, prefer } = {}) {
  const { sb: url, sk } = env();
  const r = await fetch(`${url}/rest/v1/${path}`, { method, headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  if (!r.ok) { const e = new Error(j?.message || `supabase ${r.status}`); e.status = r.status; throw e; }
  return j;
}
export const rpc = (fn, args) => sb(`rpc/${fn}`, { method: 'POST', body: args });

// appels Stripe (formulaire encodé, sans dépendance)
export async function stripe(path, params) {
  const body = new URLSearchParams(); const add = (k, v) => { if (v == null) return; if (typeof v === 'object') for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv); else body.append(k, String(v)); };
  for (const [k, v] of Object.entries(params || {})) add(k, v);
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${env().stripe}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `stripe ${r.status}`); return j;
}
// signature d'un webhook Stripe (en-tête Stripe-Signature : t=…,v1=…), tolérance 5 minutes
export function stripeSigOk(raw, header, secret) {
  if (!header || !secret) return false; const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')));
  const t = +parts.t; if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return String(header).split(',').filter((p) => p.startsWith('v1=')).some((p) => same(p.slice(3), want));
}
// portefeuille renvoyé au jeu
export const wallet = (j) => ({ jetons: j.jetons, owned: j.owned || [], passes: j.passes || [], pris: j.pris || {}, starter: !!j.starter });
