-- Boutique Frungz : comptes joueurs, jetons, articles, achats Stripe.
-- À exécuter une fois dans Supabase (SQL Editor). Seul le serveur (clé service_role, variables Vercel) y touche :
-- la sécurité par lignes (RLS) est activée sans aucune règle, donc la clé publique « anon » du jeu ne peut ni lire ni écrire ces tables.

create extension if not exists pgcrypto;

create table if not exists joueurs (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,                      -- sha256 du secret gardé dans le navigateur du joueur
  jetons integer not null default 0 check (jetons >= 0),
  owned text[] not null default '{}',             -- articles « type:id » (src/boutique-data.mjs)
  passes text[] not null default '{}',            -- saisons dont le passe premium est acheté
  pris jsonb not null default '{}',               -- récompenses de passe prises : { "s1": { "g": [1,2], "p": [1] } }
  starter boolean not null default false,         -- pack de démarrage déjà acheté
  created_at timestamptz not null default now()
);
create table if not exists achats (
  session text primary key,                       -- identifiant Stripe Checkout (idempotence : un webhook rejoué ne crédite pas deux fois)
  joueur uuid not null references joueurs(id),
  pack text not null, jetons integer not null, cents integer not null, articles text[] not null default '{}',
  payment_intent text, rembourse boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists journal (               -- tout mouvement de jetons, pour le support et la comptabilité
  id bigserial primary key, joueur uuid not null, quoi text not null, delta integer not null default 0, article text, at timestamptz not null default now()
);
create index if not exists achats_pi on achats (payment_intent);
alter table joueurs enable row level security;
alter table achats enable row level security;
alter table journal enable row level security;

-- achat d'un article (ou d'un lot) en jetons : atomique, refusé si le solde ne suffit pas ou si tout est déjà possédé
create or replace function acheter(p_id uuid, p_article text, p_prix integer, p_items text[])
returns joueurs language plpgsql security definer as $$
declare j joueurs;
begin
  update joueurs set jetons = jetons - p_prix, owned = array(select distinct unnest(owned || p_items))
    where id = p_id and jetons >= p_prix and not (p_items <@ owned)
    returning * into j;
  if not found then raise exception 'solde insuffisant ou déjà possédé'; end if;
  insert into journal (joueur, quoi, delta, article) values (p_id, 'achat', -p_prix, p_article);
  return j;
end $$;

-- passe premium d'une saison
create or replace function acheter_passe(p_id uuid, p_saison text, p_prix integer)
returns joueurs language plpgsql security definer as $$
declare j joueurs;
begin
  update joueurs set jetons = jetons - p_prix, passes = array_append(passes, p_saison)
    where id = p_id and jetons >= p_prix and not (p_saison = any(passes))
    returning * into j;
  if not found then raise exception 'solde insuffisant ou passe déjà acheté'; end if;
  insert into journal (joueur, quoi, delta, article) values (p_id, 'passe', -p_prix, p_saison);
  return j;
end $$;

-- récompense de palier (une seule fois par palier et par piste)
create or replace function recompense(p_id uuid, p_saison text, p_piste text, p_palier integer, p_jetons integer, p_item text)
returns joueurs language plpgsql security definer as $$
declare j joueurs; deja jsonb;
begin
  select coalesce(pris -> p_saison -> p_piste, '[]'::jsonb) into deja from joueurs where id = p_id for update;
  if deja is null then raise exception 'joueur inconnu'; end if;
  if deja @> to_jsonb(p_palier) then raise exception 'récompense déjà prise'; end if;
  update joueurs set
    jetons = jetons + p_jetons,
    owned = case when p_item is null then owned else array(select distinct unnest(owned || array[p_item])) end,
    pris = jsonb_set(jsonb_set(pris, array[p_saison], coalesce(pris -> p_saison, '{}'::jsonb)), array[p_saison, p_piste], deja || to_jsonb(p_palier))
    where id = p_id returning * into j;
  insert into journal (joueur, quoi, delta, article) values (p_id, 'palier ' || p_saison || '/' || p_piste || '/' || p_palier, p_jetons, p_item);
  return j;
end $$;

-- paiement Stripe confirmé (appelé par le webhook) : idempotent grâce à la clé primaire « session »
create or replace function crediter(p_session text, p_id uuid, p_pack text, p_jetons integer, p_cents integer, p_items text[], p_unique boolean, p_pi text)
returns boolean language plpgsql security definer as $$
begin
  insert into achats (session, joueur, pack, jetons, cents, articles, payment_intent) values (p_session, p_id, p_pack, p_jetons, p_cents, p_items, p_pi)
    on conflict (session) do nothing;
  if not found then return false; end if;
  update joueurs set jetons = jetons + p_jetons, owned = array(select distinct unnest(owned || p_items)), starter = starter or p_unique where id = p_id;
  insert into journal (joueur, quoi, delta, article) values (p_id, 'paiement ' || p_pack, p_jetons, p_session);
  return true;
end $$;

-- remboursement ou litige : on reprend les jetons (sans descendre sous zéro)
create or replace function rembourser(p_pi text)
returns boolean language plpgsql security definer as $$
declare a achats;
begin
  update achats set rembourse = true where payment_intent = p_pi and not rembourse returning * into a;
  if not found then return false; end if;
  update joueurs set jetons = greatest(0, jetons - a.jetons) where id = a.joueur;
  insert into journal (joueur, quoi, delta, article) values (a.joueur, 'remboursement ' || a.pack, -a.jetons, a.session);
  return true;
end $$;

revoke all on function acheter, acheter_passe, recompense, crediter, rembourser from public, anon, authenticated;
