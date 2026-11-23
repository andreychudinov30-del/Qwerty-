// Mission runner: objective steps, scripted actions, triggers, timers, checkpoints, choices.
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { getProfile, saveProfile } from '../core/save.js';
import { sleep } from '../core/util.js';
import { ITEMS } from './entities.js';

const FOLLOWER_SKIP = new Set(['spawn', 'wake', 'despawn', 'despawnAll', 'monsterPath', 'aggro', 'calm', 'complete', 'checkpoint', 'fail', 'next', 'choice', 'teleport']);

export class MissionRunner {
  constructor(game, def) {
    this.game = game; this.def = def;
    this.env = def.env || {};
    this.stepIdx = 0; this.step = null; this.stepT = 0;
    this.flags = {}; this.used = new Set(); this.events = new Set(); this.read = new Set();
    this.triggers = (def.triggers || []).map((t, i) => ({ ...t, i, fired: false }));
    this.timer = null;
    this.done = false;
    this.elapsed = 0;
    this.hintShown = false;
    this.follower = !!(game.net && !game.net.isHost); // co-op guest mirrors the host's progress
  }

  get game_() { return this.game; }

  async start(cp) {
    const g = this.game;
    if (cp) {
      this.stepIdx = cp.step;
      this.flags = { ...cp.flags };
      cp.used.forEach((u) => this.used.add(u));
      (cp.events || []).forEach((u) => this.events.add(u));
      (cp.triggers || []).forEach((i) => { if (this.triggers[i]) this.triggers[i].fired = true; });
      this.elapsed = cp.elapsed || 0;
    }
    await this.enterStep(this.stepIdx, !cp);
  }

  async enterStep(i, runOn = true) {
    const g = this.game;
    if (i >= this.def.steps.length) { this.finish(); return; }
    this.stepIdx = i;
    this.step = this.def.steps[i];
    this.stepT = 0; this.hintShown = false;
    this.stepUsed = new Set();
    g.hud.setObjective(this.def, this.step);
    if (this.step.checkpoint !== false && i > 0 && runOn) g.saveCheckpoint();
    if (this.step.type === 'survive' || this.step.type === 'defend') { this.timer = { t: this.step.time, label: this.step.timerLabel || 'Продержитесь' }; }
    else if (this.step.limit) this.timer = { t: this.step.limit, label: this.step.timerLabel || 'Осталось', fail: true };
    else this.timer = null;
    if (runOn && this.step.on) await this.exec(this.step.on);
    if (this.step.type === 'choice') { if (this.follower) g.hud.toast('Напарник-хост принимает решение...'); else this.showChoice(this.step); }
  }

  async completeStep() {
    if (this.completing) return;
    this.completing = true;
    const s = this.step;
    audio.play('objective', { bus: 'ui', volume: 0.6 });
    this.timer = null;
    if (s.done) await this.exec(s.done);
    this.completing = false;
    if (this.done) return;
    await this.enterStep(this.stepIdx + 1);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.game.missionComplete();
  }

  event(name, data) {
    this.events.add(name);
    if (name.startsWith('use:')) { const id = name.slice(4); this.used.add(id); this.stepUsed?.add(id); }
    if (name.startsWith('read:')) this.read.add(name.slice(5));
    // event-driven triggers
    for (const t of this.triggers) if (!t.fired && t.on === name) { t.fired = !t.repeat ? true : false; this.exec(t.actions); }
    void data;
  }

  checkStep() {
    const g = this.game, s = this.step, p = g.player;
    if (!s || !p) return false;
    switch (s.type) {
      case 'reach': {
        const pos = s.spot ? g.level.spotPos(s.spot) : null;
        if (pos) return p.position.distanceTo(pos.clone().setY(p.position.y)) < (s.r ?? 2.5) && Math.abs(p.feet.y - pos.y) < 2.5;
        if (s.area) return this.inArea(p.position, s.area);
        return false;
      }
      case 'collect': return (p.inventory[s.item] || 0) + this.delivered(s.item) >= (s.count || 1);
      case 'use': return (s.ids || [s.id]).every((id) => this.used.has(id));
      case 'event': return (s.events || [s.event]).every((e) => this.events.has(e));
      case 'anyEvent': return (s.events || []).some((e) => this.events.has(e));
      case 'read': return this.read.has(s.note);
      case 'survive': case 'defend': return this.timer && this.timer.t <= 0;
      case 'flag': return !!this.flags[s.flag];
      case 'custom': return s.check(g, this);
      case 'choice': return this.flags['choice_' + s.id] !== undefined;
      case 'wait': return this.stepT >= (s.time || 1);
      default: return false;
    }
  }
  delivered(item) { let n = 0; for (const e of this.game.entities.list) if (e.def?.needs === item) n += e.delivered || 0; return n; }
  inArea(p, a) { const C = 2.5; return p.x >= a[0] * C && p.x <= (a[0] + a[2]) * C && p.z >= a[1] * C && p.z <= (a[1] + a[3]) * C; }

  update(dt) {
    if (this.done) return;
    const g = this.game;
    this.elapsed += dt;
    this.stepT += dt;
    if (this.timer) {
      this.timer.t -= dt;
      g.hud.setTimer(Math.max(0, this.timer.t), this.timer.label);
      if (this.timer.t <= 0 && this.timer.fail && !this.follower) { this.timer = null; g.hud.setTimer(null); g.failMission(this.step.failText || 'Время вышло'); return; }
    } else g.hud.setTimer(null);
    if (this.follower) return;
    if (this.step?.waves) this.updateWaves(dt);
    if (!this.completing && this.checkStep()) { g.hud.setTimer(null); this.completeStep(); }
    if (!this.hintShown && this.step?.hint && this.stepT > (this.step.hintAfter ?? 50)) { this.hintShown = true; g.hud.hint(this.step.hint); }
    // spatial triggers
    const p = g.player;
    for (const t of this.triggers) {
      if (t.fired || t.on) continue;
      if (t.step !== undefined && t.step !== this.stepIdx) continue;
      if (t.afterStep !== undefined && this.stepIdx < t.afterStep) continue;
      let hit = false;
      if (t.spot) { const sp = g.level.spotPos(t.spot); hit = sp && p.position.distanceTo(sp.clone().setY(p.position.y)) < (t.r ?? 3); }
      else if (t.area) hit = this.inArea(p.position, t.area);
      if (hit && (!t.when || t.when(g, this))) { t.fired = !t.repeat; this.exec(t.actions); }
    }
  }

  updateWaves(dt) {
    const s = this.step;
    this.waveT = (this.waveT || 0) + dt;
    s._spawned ||= new Set();
    s.waves.forEach((w, i) => {
      if (!s._spawned.has(i) && this.waveT >= w.t) { s._spawned.add(i); this.exec([['spawn', w.kind, w.spot, { aggressive: true, ...(w.opts || {}) }], ...(w.actions || [])]); }
    });
  }

  showChoice(step) {
    this.game.hud.choice(step.title, step.options.map((o) => ({ text: o.text, cb: () => { this.flags['choice_' + step.id] = o.value; if (o.flag) this.setFlag(o.flag, o.value ?? true); if (o.actions) this.exec(o.actions); } })));
  }
  setFlag(k, v) { this.flags[k] = v; const pf = getProfile().progress.flags; pf[k] = v; saveProfile(); }

  // ---------------- scripted actions ----------------
  async exec(actions) {
    if (!actions) return;
    for (const a of actions) {
      if (this.game.disposed) return;
      try { await this.act(a); } catch (e) { console.error('action failed', a, e); }
    }
  }

  async act(a) {
    const g = this.game;
    const [name, ...args] = a;
    if (this.follower && FOLLOWER_SKIP.has(name)) return;
    const spot = (s) => (typeof s === 'string' ? g.level.spotPos(s) : s);
    switch (name) {
      case 'say': g.hud.subtitle(args[0], args[1] ?? 4, args[2]); break;
      case 'radio': {
        audio.play('radio_static', { bus: 'voice', volume: 0.3 });
        const v = audio.play('radio_voice', { bus: 'voice', volume: 0.5, variant: Math.floor(Math.random() * 4) });
        g.hud.subtitle(args[0], args[1] ?? 5, args[2] || 'Радио');
        audio.speak(args[0]);
        void v;
        break;
      }
      case 'think': g.hud.subtitle(args[0], args[1] ?? 3.5, 'Вы'); break;
      case 'sound': { const p = args[1] ? spot(args[1]) : null; audio.play(args[0], { pos: p ? p.clone().setY(p.y + 1.5) : undefined, bus: p ? 'sfx' : 'ui', ...(args[2] || {}) }); break; }
      case 'wait': await sleep((args[0] || 1) * 1000); break;
      case 'power': {
        const mode = args[0];
        g.level.lamps.setPower(mode);
        if (mode === 'off') g.level.lamps.setCircuit('emergency', args[1] !== false);
        audio.play(mode === 'on' ? 'power_on' : 'power_off', { bus: 'sfx', volume: 0.8 });
        if (mode === 'on') g.level.lamps.lamps.forEach((l) => { if (l.state === 'off') l.state = 'on'; });
        break;
      }
      case 'circuit': g.level.lamps.setCircuit(args[0], args[1]); break;
      case 'lamp': g.level.lamps.setLampState(args[0], args[1]); break;
      case 'spawn': {
        const p = spot(args[1]);
        if (!p) { console.warn('spawn spot missing', args[1]); break; }
        const opts = { ...(args[2] || {}) };
        if (opts.patrol) opts.patrol = opts.patrol.map((s) => spot(s)).filter(Boolean);
        await g.spawnMonster(args[0], p, opts);
        break;
      }
      case 'wake': { const m = g.monsters.find((x) => x.id === args[0]); if (m) m.wake(args[1]); break; }
      case 'despawn': { const m = g.monsters.find((x) => x.id === args[0]); if (m) g.removeMonster(m); break; }
      case 'despawnAll': for (const m of [...g.monsters]) g.removeMonster(m); break;
      case 'monsterPath': {
        const m = g.monsters.find((x) => x.id === args[0]);
        if (m) m.runScript(args[1].map(spot).filter(Boolean), args[2] || 2, args[3] ? () => this.exec(args[3]) : null);
        break;
      }
      case 'aggro': for (const m of g.monsters) if (!args[0] || m.id === args[0] || m.kind === args[0]) { m.dormant = false; m.aggressive = true; } break;
      case 'calm': for (const m of g.monsters) if (!args[0] || m.id === args[0]) { m.aggressive = false; m.setState('patrol'); } break;
      case 'door': {
        const d = g.entities.doorsById.get(args[0]);
        if (!d) break;
        if (args[1] === 'open') { d.locked = false; d.sealed = false; g.entities.setDoor(d, true); }
        else if (args[1] === 'close') g.entities.setDoor(d, false);
        else if (args[1] === 'lock') { g.entities.setDoor(d, false); d.locked = true; }
        else if (args[1] === 'unlock') { d.locked = false; d.sealed = false; }
        else if (args[1] === 'seal') { g.entities.setDoor(d, false); d.sealed = true; }
        break;
      }
      case 'enable': { const e = g.entities.byId.get(args[0]); if (e) { e.enabled = args[1] !== false; if (e.enabled) e.object.visible = true; } break; }
      case 'show': { const e = g.entities.byId.get(args[0]); if (e) { e.object.visible = args[1] !== false; if (e.def?.type !== 'train' && e.def?.type !== 'lamp' && e.def?.type !== 'prop' && e.def?.type !== 'gas') e.enabled = args[1] !== false; } break; }
      case 'flag': this.setFlag(args[0], args[1] ?? true); break;
      case 'give': g.player.addItem(args[0], args[1] || 1); g.hud.toast(`Получено: ${ITEMS[args[0]]?.name || args[0]}`); break;
      case 'take': g.player.useItem(args[0], args[1] || 1); break;
      case 'checkpoint': g.saveCheckpoint(); break;
      case 'scare': await this.scare(args[0], args[1]); break;
      case 'shake': g.player.shake = Math.min(1.5, g.player.shake + (args[0] || 0.5)); break;
      case 'fear': g.player.fear = Math.min(1, g.player.fear + (args[0] || 0.3)); break;
      case 'flashFlicker': g.flashFlicker = args[0] || 1; break;
      case 'flashlight': g.player.setFlashlight(args[0], true); if (args[1] === 'remove') { g.player.hasFlashlight = false; } if (args[1] === 'give') g.player.hasFlashlight = true; break;
      case 'battery': g.player.battery = args[0]; break;
      case 'fade': await g.hud.fade(args[0] === 'out', args[1] ?? 1); break;
      case 'cutscene': await g.playCutscene(args[0]); break;
      case 'train': {
        const t = g.entities.byId.get(args[0]);
        if (!t) break;
        if (args[1] === 'lit') t.setLit(args[2] !== false);
        else if (args[1] === 'move') {
          const to = spot(args[2]);
          const target = new THREE.Vector3(to.x, t.object.position.y, to.z);
          if (t.def.axis === 'y') target.x = t.object.position.x; else target.z = t.object.position.z;
          audio.play('train_rumble', { pos: t.object.position, volume: 1, loop: false });
          if (args[4]) audio.play('train_horn', { pos: t.object.position, volume: 0.9 });
          t.moveTo(target, args[3] || 6);
          if (args[5]) await sleep((args[3] || 6) * 1000);
        } else if (args[1] === 'teleport') { const to = spot(args[2]); t.object.position.set(to.x, t.object.position.y, to.z); }
        break;
      }
      case 'timer': this.timer = { t: args[0], label: args[1] || 'Осталось', fail: !!args[2] }; break;
      case 'music': g.musicOverride = args[0]; break;
      case 'hint': g.hud.hint(args[0]); break;
      case 'toast': g.hud.toast(args[0], args[1]); break;
      case 'fail': g.failMission(args[0]); break;
      case 'complete': this.finish(); break;
      case 'next': await this.completeStep(); break;
      case 'steam': { const e = g.entities.byId.get(args[0]); if (e) e.active = args[1] !== false; break; }
      case 'call': await args[0](g, this); break;
      case 'choice': this.game.hud.choice(args[0], args[1].map((o) => ({ text: o.text, cb: () => { if (o.flag) this.setFlag(o.flag, o.value ?? true); if (o.actions) this.exec(o.actions); } }))); break;
      case 'tension': g.musicOverride = args[0]; break;
      case 'teleport': { const p = spot(args[0]); if (p) g.player.char.body.setTranslation({ x: p.x, y: p.y + 1.0, z: p.z }, true); if (args[1] !== undefined) g.player.yaw = args[1]; break; }
      case 'freeze': g.player.frozen = args[0] !== false; break;
      case 'slow': g.player.slowMul = args[0]; break;
      case 'noise': { const p = spot(args[0]); if (p) g.emitNoise(p, args[1] || 20, 'script'); break; }
      case 'director': g.director.enabled = args[0] !== false; break;
      case 'ending': await g.showEnding(); break;
      case 'drain': g.player.drainRate = args[0]; break;
      default: console.warn('unknown action', name);
    }
  }

  async scare(type, where) {
    const g = this.game;
    const d = g.director;
    switch (type) {
      case 'silhouette': d.showSilhouette(); break;
      case 'burst': d.lampEvent(true); break;
      case 'slam': audio.play('slam', { pos: where ? g.level.spotPos(where) : d.randomAround(5, 9), volume: 1, reverb: 0.8 }); g.player.fear += 0.3; break;
      case 'stinger': audio.play('stinger', { bus: 'music', volume: 0.9 }); g.player.fear = Math.min(1, g.player.fear + 0.5); g.engine.uniforms.uFlash.value = 0.12; g.stats('scares'); break;
      case 'scream': audio.play('scream', { pos: where ? g.level.spotPos(where) : d.randomAround(12, 20), volume: 0.9, reverb: 0.9 }); break;
      case 'whisper': audio.play('whisper', { pos: d.pointBehind(1.2).setY(g.player.camera.position.y), volume: 0.6 }); break;
      case 'blackout': g.level.lamps.setPower('off'); g.level.lamps.setCircuit('emergency', false); g.flashFlicker = 2; audio.play('power_off', { volume: 1 }); break;
      case 'knock': audio.play('knock', { pos: where ? g.level.spotPos(where) : d.randomAround(4, 8), volume: 1, reverb: 0.5 }); break;
      default: break;
    }
  }

  // state for checkpoint saving
  snapshot() {
    return { step: this.stepIdx, flags: { ...this.flags }, used: [...this.used], events: [...this.events], triggers: this.triggers.filter((t) => t.fired).map((t) => t.i), elapsed: this.elapsed };
  }
}
