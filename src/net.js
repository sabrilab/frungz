// Jeu en ligne entre amis : un salon par code d'équipe (FRZ-XXXX), le chef d'équipe fait tourner la partie.
//
// Qui décide de quoi :
// - le chef (celui dont c'est le code) simule les bots, les zones, le score et le temps, et les envoie à tous ~10 fois par seconde ;
// - chaque joueur décide de son propre perso (déplacement, tir) et envoie son état ~10 fois par seconde ;
// - un tir est calculé chez le tireur ; les dégâts sont envoyés au « propriétaire » de la cible (le chef pour un bot, l'ami pour son perso),
//   qui les applique et annonce la mort à tout le monde.
//
// Transport : Supabase Realtime (canal « broadcast » + présence), sans base de données ni compte joueur.
// ?net=local : transport de test entre onglets du même navigateur (BroadcastChannel), sans réseau.
// Pour passer plus tard à Cloudflare (Durable Objects), il suffit d'écrire un autre transport avec join/send/track/leave.
import { RealtimeClient } from '@supabase/realtime-js';
import { WEAPONS } from './data.js';

// projet Supabase de Sabri (clé publique « anon » : faite pour être dans le navigateur, elle ne donne accès qu'au Realtime public)
const SUPA_URL = 'https://tpfusliksgxcvfrodchk.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZnVzbGlrc2d4Y3Zmcm9kY2hrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxODc4NTUsImV4cCI6MjEwMDc2Mzg1NX0.QvhQH_QcfFpGaNr3FR1ACdcYQciprcVZiKSoxC6p0OI';
export const RATE = 10; // envois d'état par seconde (quota gratuit Supabase : 100 messages/s au total pour le projet)
export const ONLINE_MAX_TEAM = 20; // en ligne, on limite les bots pour garder des messages légers
const GUNS = Object.keys(WEAPONS);

// ---------------------------------------------------------------- transports
function supabaseTransport() {
  let client = null, ch = null;
  return {
    name: 'supabase',
    join(room, me, { onMsg, onPresence, onStatus }) {
      client = new RealtimeClient(SUPA_URL + '/realtime/v1', { params: { apikey: SUPA_KEY, eventsPerSecond: 60 } });
      ch = client.channel('frungz-' + room, { config: { broadcast: { self: false, ack: false }, presence: { key: me.id } } });
      ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
      ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(); onPresence(Object.values(st).map((l) => l[l.length - 1]).filter(Boolean)); });
      return new Promise((res, rej) => {
        let done = false;
        ch.subscribe(async (status, err) => {
          onStatus?.(status);
          if (status === 'SUBSCRIBED') { await ch.track(me); if (!done) { done = true; res(); } }
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !done) { done = true; rej(err || new Error(status)); }
        });
      });
    },
    send(msg) { ch?.send({ type: 'broadcast', event: 'm', payload: msg }); },
    track(me) { ch?.track(me); },
    leave() { try { ch && client.removeChannel(ch); client?.disconnect(); } catch {} ch = null; client = null; },
  };
}

// tests : présence émulée par des « coucou » sur un bus simple
// - ?net=local : onglets du même navigateur (BroadcastChannel)
// - ?net=ws://hôte:port : petit relais WebSocket (test/relay.cjs), pour tester avec plusieurs navigateurs séparés
function busTransport(url) {
  let bus = null, me = null, seen = new Map(), timer = 0, cb = null;
  const emit = () => cb?.onPresence([me, ...[...seen.values()].map((s) => s.m)]);
  const post = (d) => { try { bus?.post(d); } catch {} };
  return {
    name: url ? 'ws' : 'local',
    async join(room, m, handlers) {
      me = m; cb = handlers;
      const onData = (data) => {
        if (data.hello) { const prev = seen.get(data.hello.id); seen.set(data.hello.id, { m: data.hello, t: performance.now() }); const had = !!prev; if (!had || JSON.stringify(prev.m) !== JSON.stringify(data.hello)) emit(); if (!had) post({ hello: me }); return; }
        if (data.bye) { seen.delete(data.bye); emit(); return; }
        handlers.onMsg(data);
      };
      if (url) {
        const ws = new WebSocket(url + '/' + room); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (e) => onData(JSON.parse(e.data)); bus = { post: (d) => ws.readyState === 1 && ws.send(JSON.stringify(d)), close: () => ws.close() };
      } else { const bc = new BroadcastChannel('frungz-net-' + room); bc.onmessage = ({ data }) => onData(data); bus = { post: (d) => bc.postMessage(d), close: () => bc.close() }; }
      post({ hello: me });
      timer = setInterval(() => { post({ hello: me }); let ch = false; for (const [k, s] of seen) if (performance.now() - s.t > 30000) { seen.delete(k); ch = true; } if (ch) emit(); }, 1000);
      setTimeout(emit, 50); handlers.onStatus?.('SUBSCRIBED');
    },
    send(msg) { post(msg); },
    track(m) { me = m; post({ hello: me, changed: true }); emit(); },
    leave() { clearInterval(timer); post({ bye: me?.id }); try { bus?.close(); } catch {} bus = null; },
  };
}

// ---------------------------------------------------------------- salon
export function createNet({ local = false } = {}) { // local : false (Supabase), true (onglets) ou une adresse ws:// (relais de test)
  const A = 'abcdefghijkmnpqrstuvwxyz23456789';
  const id = 'p' + Array.from({ length: 7 }, () => A[Math.random() * A.length | 0]).join('');
  const N = {
    id, room: null, host: false, status: 'off', members: [], game: null, acc: 0, stats: { sent: 0, recv: 0 },
    me: { id, host: false, pseudo: '', skin: '', team: '', cls: '', gun: '', at: Date.now(), ingame: false },
    on: {}, // rappels du menu : presence(list), start(msg), status(s), hostLeft(), notice(txt)
    get online() { return this.status === 'on'; },
    get guest() { return this.online && !this.host; },
    hostMember() { return this.members.find((m) => m.host && m.id !== id && m.room === this.room) || null; },
    friends() { return this.members.filter((m) => m.id !== id).sort((a, b) => (b.host - a.host) || (a.at - b.at)); },

    async join(room, { host, meta }) {
      if (this.room === room && this.status !== 'off') { this.update(meta); return; }
      this.leave();
      this.room = room; this.host = !!host; this.status = 'joining'; Object.assign(this.me, meta, { host: !!host, room, at: Date.now() });
      this.t = local ? busTransport(typeof local === 'string' ? local : null) : supabaseTransport();
      this.on.status?.('joining');
      try {
        await this.t.join(room, { ...this.me }, {
          onMsg: (m) => this.recv(m),
          onPresence: (list) => {
            const hadHost = !!this.hostMember();
            this.members = list.filter((m) => m && m.id && m.room === room);
            if (this.guest && hadHost && !this.hostMember()) this.on.hostLeft?.();
            // un ami parti en pleine partie : son perso disparaît
            if (this.game) for (const a of this.game.actors) if (a.owner && a.owner !== id && !a.gone && a.puppet && (this.host || a.owner !== this.hostId)) { const m = this.members.find((x) => x.id === a.owner); if (!m || (!m.ingame && this.game.time > 15)) this.game.netGone(a); }
            this.on.presence?.(this.members);
          },
          onStatus: (s) => { if (s === 'CLOSED' && this.status === 'on') { this.status = 'off'; this.on.status?.('off'); } },
        });
        this.status = 'on'; this.on.status?.('on');
      } catch (e) {
        console.warn('salon en ligne', e); this.status = 'off'; this.on.status?.('error', e);
      }
    },
    update(meta) { Object.assign(this.me, meta); if (this.t && this.status === 'on') { clearTimeout(this._tt); this._tt = setTimeout(() => this.t?.track({ ...this.me }), 150); } },
    leave() { this.t?.leave(); this.t = null; this.status = 'off'; this.room = null; this.members = []; this.game = null; this.on.status?.('off'); },
    send(k, d = {}) { if (!this.t || this.status !== 'on') return; d.k = k; d.f = id; this.t.send(d); this.stats.sent++; },

    // ---------- début de partie
    // le chef envoie la distribution : chaque perso (dans l'ordre de création) avec son camp, sa tenue, son nom et à qui il appartient
    startMsg(game) {
      return { roster: game.actors.map((a) => [a.team, a.skin, a.name, a.cls, a === game.player ? id : (a.owner || ''), a.squad ? 1 : 0]), team: game.player.team, n: game.opts.teamSize, night: !!game.save.settings.night, host: id, map: window.__map || 'paris' };
    },
    attach(game) {
      this.game = game; this.acc = 0; this.hostId = this.host ? id : (this.hostMember()?.id || this.startHost);
      this.update({ ingame: true });
      if (this.host) this.send('start', this.startMsg(game));
    },
    detach() { this.game = null; this.update({ ingame: false }); },

    // ---------- chaque image
    tick(dt) {
      const g = this.game; if (!g || this.status !== 'on') return;
      this.acc += dt; if (this.acc < 1 / RATE) return; this.acc = 0;
      const rows = []; for (const a of g.actors) if (g.netOwns(a) && !a.gone) rows.push(row(g, a));
      const msg = { r: rows };
      if (this.host) { msg.tm = Math.round(g.time * 10) / 10; msg.sc = [g.score.ordre, g.score.civils]; msg.z = g.zoneState.map((z) => [z.owner === 'ordre' ? 1 : z.owner === 'civils' ? 2 : 0, z.cap === 'ordre' ? 1 : z.cap === 'civils' ? 2 : 0, Math.round(z.p * 100), z.contested ? 1 : 0]); if (g.over) msg.ov = 1; }
      this.send('st', msg);
    },

    // ---------- réception
    recv(m) {
      this.stats.recv++;
      if (m.k === 'start') { const hm = this.hostMember(); if (!this.host && m.host === m.f && (!hm || m.host === hm.id)) { this.startHost = m.host; this.on.start?.(m); } return; }
      if (m.k === 'back') { if (!this.host) this.on.back?.(); return; }
      const g = this.game; if (!g) return;
      if (m.k === 'st') {
        const now = performance.now() / 1000;
        for (const r of m.r) {
          const a = g.actors[r[0]]; if (!a || g.netOwns(a) || a.gone) continue;
          const n = a.net || (a.net = { shots: r[10] });
          n.x = r[1] / 100; n.y = r[2] / 100; n.z = r[3] / 100; n.yaw = r[4] / 1000; n.pitch = r[5] / 1000; n.vx = r[6] / 100; n.vy = r[7] / 100; n.vz = r[8] / 100; n.fl = r[9]; n.at = now;
          if (r[10] !== n.shots) { const k = Math.max(0, r[10] - n.shots); n.shots = r[10]; if (k && a.alive) g.netShot(a, Math.min(k, 3)); }
          n.gun = GUNS[r[11]] || null; n.hp = r[12];
        }
        if (m.f === this.hostId && !this.host) {
          if (m.tm != null) { if (Math.abs(g.time - m.tm) > 0.5) g.time = m.tm; }
          if (m.sc) { g.score.ordre = m.sc[0]; g.score.civils = m.sc[1]; }
          if (m.z) m.z.forEach((s, i) => { const z = g.zoneState[i]; if (!z) return; const own = s[0] === 1 ? 'ordre' : s[0] === 2 ? 'civils' : null; z.cap = s[1] === 1 ? 'ordre' : s[1] === 2 ? 'civils' : null; z.p = s[2] / 100; z.contested = !!s[3]; if (own !== z.owner) { if (own) g.captureZone(z, own); else z.owner = null; } });
          if (m.ov && !g.over) g.endMatch();
        }
        return;
      }
      if (m.k === 'hit') { if (m.to !== id) return; const t = g.actors[m.t]; if (t && g.netOwns(t)) g.damage(t, m.amt, g.actors[m.by] || null, { ...m.o }); return; }
      if (m.k === 'kill') { const t = g.actors[m.t]; if (t?.net) t.net.fl &= ~1; if (t && !g.netOwns(t) && t.alive) g.kill(t, g.actors[m.by] || null, { ...m.o, fromNet: true }); return; }
      if (m.k === 'score') { if (this.host) g.scoreEvent(m.team, m.pts, m.why, g.actors[m.by] || null); return; }
    },

    // ---------- envois d'événements (appelés par le jeu)
    hit(t, amt, by, o) { this.send('hit', { to: t.owner || this.hostId, t: t.id, amt: Math.round(amt * 10) / 10, by: by ? by.id : -1, o: slim(o) }); },
    kill(t, by, o) { this.send('kill', { t: t.id, by: by ? by.id : -1, o: slim(o) }); },
    score(team, pts, why, by) { this.send('score', { team, pts, why, by: by ? by.id : -1 }); },
  };
  window.__net = N;
  return N;
}

// options d'un coup réduites à ce qui sert à l'affichage (tête, arme, explosion, distance)
function slim(o = {}) { const r = {}; for (const k of ['head', 'weapon', 'blast', 'dist', 'melee']) if (o[k] != null && typeof o[k] !== 'object') r[k] = o[k]; return r; }

// état compact d'un perso : id, position (cm), cap et regard (milliradians), vitesse (cm/s), drapeaux, compteur de tirs, arme, vie
function row(g, a) {
  let pitch = a.pitch || 0;
  if (a.bot && a.ai?.target && a.ai.los) { const t = a.ai.target.pos; pitch = Math.atan2(t.y + 1.2 - (a.pos.y + 1.4), Math.hypot(t.x - a.pos.x, t.z - a.pos.z)); }
  const fl = (a.alive ? 1 : 0) | (a.onGround ? 2 : 0) | (a.crouch ? 4 : 0) | (a.slideT > 0 ? 8 : 0) | (a.rollT > 0 ? 16 : 0) | (a.inCar ? 32 : 0) | (a.climb ? 64 : 0);
  return [a.id, Math.round(a.pos.x * 100), Math.round(a.pos.y * 100), Math.round(a.pos.z * 100), Math.round(a.yaw * 1000), Math.round(pitch * 1000), Math.round(a.vel.x * 100), Math.round(a.vel.y * 100), Math.round(a.vel.z * 100), fl, a.netShots || 0, Math.max(0, GUNS.indexOf(a.slots[a.cur]?.id)), Math.round(a.hp)];
}
