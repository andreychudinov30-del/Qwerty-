// Two-player co-op over Supabase Realtime (broadcast + presence).
// Host is authoritative for monsters and mission progress; both clients send their own player state.
// Guests interpolate the partner, mirror monsters, and replay world events (doors, pickups, devices, throws, noise).
import * as THREE from 'three';
import { supabase, backend } from './backend.js';
import { getProfile, saveProfile } from '../core/save.js';
import { bus } from '../core/util.js';
import { RemotePlayer } from '../game/game.js';

const SEND_HZ = 12, MON_HZ = 7, SYNC_EVERY = 1.0;

export class Coop {
  constructor(app) {
    this.app = app;
    this.room = null; this.isHost = false; this.channel = null;
    this.presence = {}; this.ready = false; this.status = '';
    this.onChange = null; this.game = null;
    this.sendT = 0; this.monT = 0; this.syncT = 0; this.noiseT = 0;
  }
  get myId() { return getProfile().online.id; }

  async host(missionId) {
    await backend.ensurePlayer();
    if (this.room) await this.leave();
    const r = await backend.createRoom(missionId);
    this.room = { code: r.code, mission: missionId, host: this.myId };
    this.isHost = true;
    await this.subscribe();
    this.setStatus('Комната создана. Сообщите код другу или пригласите его.');
    return r.code;
  }

  async join(code) {
    if (!/^\d{6}$/.test(code)) throw new Error('Код должен состоять из 6 цифр');
    await backend.ensurePlayer();
    if (this.room) await this.leave();
    const r = await backend.joinRoom(code);
    this.room = { code: r.code, mission: r.mission, host: r.host };
    this.isHost = r.host === this.myId;
    await this.subscribe();
    try { sessionStorage.setItem('mh_room', code); } catch (e) { /* ignore */ }
    this.setStatus(`Подключено к комнате ${code}. Ожидание хоста.`);
    return r;
  }

  setStatus(s) { this.status = s; this.onChange && this.onChange(); }

  subscribe() {
    return new Promise((resolve, reject) => {
      const p = getProfile();
      const ch = supabase().channel('mh-room-' + this.room.code, { config: { broadcast: { self: false, ack: false }, presence: { key: this.myId } } });
      this.channel = ch;
      ch.on('presence', { event: 'sync' }, () => { this.presence = ch.presenceState(); this.onPresence(); });
      ch.on('broadcast', { event: 'st' }, ({ payload }) => this.onState(payload));
      ch.on('broadcast', { event: 'mon' }, ({ payload }) => this.onMonsters(payload));
      ch.on('broadcast', { event: 'ev' }, ({ payload }) => this.onEvent(payload));
      ch.on('broadcast', { event: 'sync' }, ({ payload }) => this.onSync(payload));
      ch.on('broadcast', { event: 'start' }, ({ payload }) => this.onStart(payload));
      ch.on('broadcast', { event: 'req' }, ({ payload }) => this.onRequest(payload));
      ch.on('broadcast', { event: 'lobby' }, ({ payload }) => { if (!this.isHost) { this.room.mission = payload.mission; this.onChange && this.onChange(); } });
      let first = true;
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ id: this.myId, name: p.name, skin: p.skin, host: this.isHost, ready: this.ready, t: Date.now() });
          backend.status = this.app.game ? 'game' : 'lobby'; backend.room = this.room.code;
          if (!first || this.app.game) this.send('req', { from: this.myId, ingame: !!this.app.game }); // reconnect: ask host for state
          if (!this.isHost) this.send('req', { from: this.myId, ingame: !!this.app.game });
          if (first) { first = false; resolve(); }
          this.setStatus(this.isHost ? 'Комната активна.' : 'Подключено.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.setStatus('Проблема с соединением... переподключение');
          if (first) { first = false; reject(new Error('Не удалось подключиться к серверу реального времени')); }
        } else if (status === 'CLOSED') {
          this.setStatus('Соединение закрыто');
        }
      });
    });
  }

  send(event, payload) { if (this.channel) this.channel.send({ type: 'broadcast', event, payload }).catch?.(() => {}); }

  players() {
    const list = [];
    for (const [id, metas] of Object.entries(this.presence)) { const m = metas[metas.length - 1]; list.push({ id, name: m.name, skin: m.skin, host: m.host, ready: m.ready }); }
    list.sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0));
    return list;
  }
  partner() { return this.players().find((p) => p.id !== this.myId); }

  onPresence() {
    const partner = this.partner();
    if (this.game) {
      // partner left / joined during game
      for (const [id, r] of this.game.remotes) if (!partner || partner.id !== id) { r.dispose(); this.game.remotes.delete(id); this.game.hud.toast('Напарник отключился', 'warn'); }
      if (partner && !this.game.remotes.has(partner.id)) this.addRemote(partner);
      this.updateCoopTag();
    }
    this.onChange && this.onChange();
  }

  async setReady(v) { this.ready = v; const p = getProfile(); await this.channel?.track({ id: this.myId, name: p.name, skin: p.skin, host: this.isHost, ready: v, t: Date.now() }); }
  async updateSkin() { if (this.channel) await this.setReady(this.ready); }
  setMission(id) { if (!this.isHost || !this.room) return; this.room.mission = id; backend.updateRoom(this.room.code, id, '').catch(() => {}); this.send('lobby', { mission: id }); }

  async startGame(missionId) {
    if (!this.isHost) return;
    const id = missionId || this.room.mission;
    this.room.mission = id;
    backend.updateRoom(this.room.code, id, 'playing').catch(() => {});
    this.send('start', { mission: id });
    this.app.startMission(id, { net: this });
  }
  onStart(p) {
    if (this.isHost) return;
    this.room.mission = p.mission;
    this.app.startMission(p.mission, { net: this, checkpoint: p.cp || null });
  }
  onRequest(p) {
    if (!this.isHost) return;
    const g = this.app.game;
    if (g && !g.disposed && g.player) {
      // guest (re)joined while we're playing: send them into the current mission state
      if (!p.ingame) this.send('start', { mission: g.def.id, cp: g.makeCheckpoint(true) });
      else this.sendSync(true);
    }
  }

  async leave() {
    try { if (this.room) await backend.leaveRoom(this.room.code); } catch (e) { /* ignore */ }
    try { await this.channel?.untrack(); await supabase().removeChannel(this.channel); } catch (e) { /* ignore */ }
    this.channel = null; this.room = null; this.presence = {}; this.ready = false;
    backend.status = 'menu'; backend.room = '';
    try { sessionStorage.removeItem('mh_room'); } catch (e) { /* ignore */ }
    this.onChange && this.onChange();
  }

  // ---------------- in-game ----------------
  async attachGame(game) {
    this.game = game;
    backend.status = 'game';
    const partner = this.partner();
    if (partner) await this.addRemote(partner);
    this.updateCoopTag();
    if (!this.isHost) this.send('req', { from: this.myId, ingame: true });
  }
  async addRemote(info) {
    const g = this.game;
    if (!g || g.remotes.has(info.id)) return;
    const r = new RemotePlayer(g, info.id, info);
    g.remotes.set(info.id, r);
    await r.init();
  }
  updateCoopTag() {
    const g = this.game; if (!g) return;
    const partner = this.partner();
    g.hud.setCoop(partner ? `КООП · ${this.isHost ? 'хост' : 'гость'}<br><span class="muted">${partner.name}</span>` : 'КООП · ожидание напарника');
  }
  leaveGame() {
    this.game = null;
    backend.status = 'lobby';
    if (this.isHost) backend.updateRoom(this.room?.code, '', 'lobby').catch(() => {});
  }

  update(dt) {
    const g = this.game;
    if (!g || !this.channel) return;
    const p = g.player;
    this.sendT += dt;
    if (this.sendT >= 1 / SEND_HZ) {
      this.sendT = 0;
      const f = p.feet;
      this.send('st', { id: this.myId, x: +f.x.toFixed(2), y: +f.y.toFixed(2), z: +f.z.toFixed(2), r: +p.yaw.toFixed(3), p: +p.pitch.toFixed(2), f: p.flashOn ? 1 : 0, c: p.crouching ? 1 : 0, v: +(p.speed || 0).toFixed(2), h: p.hidden ? 1 : 0, d: p.alive ? 0 : 1 });
    }
    if (this.isHost) {
      this.monT += dt;
      if (this.monT >= 1 / MON_HZ) { this.monT = 0; this.send('mon', { list: g.monsters.map((m) => m.snapshot()) }); }
      this.syncT += dt;
      if (this.syncT >= SYNC_EVERY) { this.syncT = 0; this.sendSync(false); }
    }
    // co-op revive: dead player is revived near partner after a while
    if (!p.alive && this.reviveT !== undefined) {
      this.reviveT -= dt;
      const partner = [...g.remotes.values()][0];
      if (this.reviveT <= 0 && partner && partner.alive) {
        p.alive = true; p.health = 50; g.dead = false;
        p.char.body.setTranslation({ x: partner.position.x + 0.8, y: partner.position.y + 1.2, z: partner.position.z + 0.8 }, true);
        g.hud.setFade(0); g.hud.toast('Напарник вытащил вас! (+50 HP)');
        this.reviveEl?.remove(); this.reviveT = undefined;
      }
    }
  }

  sendSync(full) {
    const g = this.game; if (!g) return;
    const doors = {};
    for (const d of g.entities.doors.values()) doors[d.id] = (d.open ? 1 : 0) | (d.locked ? 2 : 0) | (d.sealed ? 4 : 0);
    this.send('sync', { step: g.mission.stepIdx, flags: g.mission.flags, power: g.level.lamps.power, circ: g.level.lamps.circuits, doors, taken: [...g.taken], used: [...g.mission.used], timer: g.mission.timer ? g.mission.timer.t : null, full });
  }

  onState(s) {
    const g = this.game;
    if (!g) return;
    const r = g.remotes.get(s.id);
    if (r) r.push(s);
    else { const info = this.players().find((x) => x.id === s.id); if (info) this.addRemote(info); }
  }

  async onMonsters({ list }) {
    const g = this.game;
    if (!g || this.isHost) return;
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let m = g.monsters.find((x) => x.id === s.id);
      if (!m && !this._spawning?.has(s.id)) {
        (this._spawning ||= new Set()).add(s.id);
        m = await g.spawnMonster(s.k, new THREE.Vector3(s.x, s.y, s.z), { id: s.id, remote: true });
        m.remote = true;
        this._spawning.delete(s.id);
      }
      if (m) m.applySnapshot(s);
    }
    for (const m of [...g.monsters]) if (!seen.has(m.id) && !this._spawning?.has(m.id)) g.removeMonster(m);
  }

  async onSync(s) {
    const g = this.game;
    if (!g || this.isHost || !g.mission) return;
    const M = g.mission;
    Object.assign(M.flags, s.flags || {});
    for (const id of s.used || []) { if (!M.used.has(id)) { M.used.add(id); const e = g.entities.byId.get(id); if (e && e.def && !e.used && !e.def.toggle && e.def.type !== 'item') g.entities.activate(e, true); } }
    for (const id of s.taken || []) { if (!g.taken.has(id)) { g.taken.add(id); const e = g.entities.byId.get(id); if (e) g.entities.remove(e); } }
    for (const [id, bits] of Object.entries(s.doors || {})) {
      const d = g.entities.doorsById.get(id); if (!d) continue;
      d.locked = !!(bits & 2); d.sealed = !!(bits & 4);
      if (!!(bits & 1) !== d.open) g.entities.setDoor(d, !!(bits & 1));
    }
    if (s.power && s.power !== g.level.lamps.power) g.level.lamps.setPower(s.power);
    if (s.circ) Object.assign(g.level.lamps.circuits, s.circ);
    if (s.step > M.stepIdx && !M.completing) await M.enterStep(s.step, true);
    if (s.timer !== null && s.timer !== undefined) M.timer = { t: s.timer, label: M.step?.timerLabel || 'Осталось' }; else if (M.step?.type !== 'survive') M.timer = null;
  }

  onEvent(e) {
    const g = this.game;
    if (!g) return;
    const E = g.entities;
    switch (e.t) {
      case 'door': { const d = E.doorsById.get(e.id); if (d) { if (e.unlock) d.locked = false; d.dir = e.dir || 1; E.setDoor(d, e.open); } break; }
      case 'pickup': {
        const it = E.byId.get(e.id);
        if (it) E.remove(it);
        g.taken.add(e.id);
        g.player.addItem(e.item, e.count || 1); // shared mission inventory
        g.hud.toast(`Напарник подобрал: ${e.item ? (it?.def ? (it.prompt?.() || e.item) : e.item) : ''}`.replace('Подобрать: ', ''));
        g.mission?.event('pickup:' + e.item);
        g.mission?.event('use:' + e.id);
        break;
      }
      case 'use': {
        const it = E.byId.get(e.id);
        if (!it) break;
        if (it.def?.type === 'fire' && !it.used) { const save = g.player.hasItem; it.use({ hasItem: () => true, useItem: () => true }); void save; }
        else if (it.def?.type === 'npc' || it.def?.type === 'body' || it.def?.type === 'note') g.mission?.event('use:' + e.id);
        else E.activate(it, true);
        break;
      }
      case 'deliver': { const it = E.byId.get(e.id); if (it) { const diff = e.n - (it.delivered || 0); it.delivered = e.n; if (it.def?.needs && diff > 0) g.player.useItem(it.def.needs, diff); } break; }
      case 'throw': g.throwObject(e.kind, e); break;
      case 'noise': if (this.isHost) g.noises.push({ pos: new THREE.Vector3(e.x, e.y, e.z), radius: e.r, type: 'remote', t: 0.6 }); break;
      case 'damage': if (e.to === this.myId) g.player.damage(e.dmg, new THREE.Vector3(e.fx, e.fy, e.fz)); break;
      case 'dead': g.hud.toast('Напарник погиб! Держитесь — он вернётся рядом с вами.', 'warn'); break;
      case 'complete': if (!this.isHost) g.mission.finish(); break;
      case 'restart': if (!this.isHost) this.app.startMission(e.mission, { net: this, checkpoint: e.cp }); break;
      default: break;
    }
  }

  sendEvent(ev) { this.send('ev', ev); }
  queueNoise(pos, r) {
    if (this.isHost || r < 3) return;
    const now = performance.now();
    if (now - this.noiseT < 250) return;
    this.noiseT = now;
    this.sendEvent({ t: 'noise', x: +pos.x.toFixed(1), y: +pos.y.toFixed(1), z: +pos.z.toFixed(1), r: +r.toFixed(1) });
  }
  sendDamage(to, dmg, from) { this.sendEvent({ t: 'damage', to, dmg, fx: from.x, fy: from.y, fz: from.z }); }

  // called by Game on local death while in co-op
  onLocalDeath() {
    const g = this.game;
    const partner = [...g.remotes.values()][0];
    if (partner && partner.alive) { this.reviveT = 12; return true; }
    // both down: host restarts from checkpoint for everyone
    if (this.isHost) {
      const cp = getProfile().progress.checkpoint;
      setTimeout(() => { this.sendEvent({ t: 'restart', mission: g.def.id, cp }); this.app.startMission(g.def.id, { net: this, checkpoint: cp }); }, 3500);
    }
    return true;
  }
}
void saveProfile; void bus;
