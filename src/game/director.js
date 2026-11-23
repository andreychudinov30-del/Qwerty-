// Horror director: builds dread through ambience and pacing rather than constant jump scares.
// Distant screams, knocks, footsteps behind you, whispers, lamp bursts, silhouettes at corridor ends,
// silence moments, rats, falling objects. Major scares are budgeted (cooldowns) and never repeat back-to-back.
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { Human } from './human.js';
import { loadModel } from '../core/assets.js';

export class Director {
  constructor(game, cfg = {}) {
    this.game = game;
    this.cfg = { intensity: 1, silhouettes: true, ...cfg };
    this.minorT = 12 + Math.random() * 10;
    this.majorT = 60 + Math.random() * 40;
    this.silenceT = 90 + Math.random() * 60;
    this.dripT = 2;
    this.last = null;
    this.silhouette = null;
    this.enabled = true;
  }

  async init() {
    const g = this.game;
    // ambience beds
    audio.loop('amb_drone', 'drone', { bus: 'amb', volume: 0.55 });
    audio.loop('amb_wind', 'wind', { bus: 'amb', volume: 0.35 });
    if (this.cfg.silhouettes) {
      const h = await Human.create({ mode: 'shadow', height: 1.85 });
      if (h) { this.silhouette = h; h.root.visible = false; g.scene.add(h.root); }
    }
    const rat = await loadModel('street_rat');
    if (rat) { this.rat = rat.scene.clone(true); this.rat.visible = false; g.scene.add(this.rat); }
  }

  pointBehind(dist = 6) {
    const p = this.game.player;
    const back = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    return p.position.clone().addScaledVector(back, dist).setY(p.position.y);
  }
  randomAround(min = 10, max = 25) {
    const p = this.game.player.position;
    const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
    return new THREE.Vector3(p.x + Math.cos(a) * d, p.y + 1, p.z + Math.sin(a) * d);
  }

  minorEvent() {
    const g = this.game;
    const roll = Math.random();
    const occl = 0.6;
    if (roll < 0.18) audio.play('knock', { pos: this.randomAround(8, 18), volume: 0.7, reverb: 0.7, occlusion: occl, variant: Math.floor(Math.random() * 3) });
    else if (roll < 0.32) audio.play('scream', { pos: this.randomAround(25, 45), volume: 0.45, reverb: 0.9, occlusion: 0.8, variant: Math.floor(Math.random() * 2), rate: 0.85 + Math.random() * 0.3 });
    else if (roll < 0.45) audio.play('metal_screech', { pos: this.randomAround(15, 35), volume: 0.5, reverb: 0.8, occlusion: occl });
    else if (roll < 0.58) { // footsteps behind
      const p0 = this.pointBehind(7);
      for (let i = 0; i < 4; i++) audio.play('step_concrete', { pos: p0, volume: 0.45, delay: i * 0.55, variant: i % 3, reverb: 0.6 });
    } else if (roll < 0.68) audio.play('whisper', { pos: this.pointBehind(1.5).setY(g.player.camera.position.y), volume: 0.35, reverb: 0.2, variant: Math.floor(Math.random() * 3) });
    else if (roll < 0.8) this.lampEvent(false);
    else if (roll < 0.9) this.ratEvent();
    else audio.play('radio_static', { pos: this.randomAround(6, 12), volume: 0.3 });
  }

  lampEvent(burst) {
    const g = this.game;
    const lamp = g.level.lamps.nearest(g.player.position, 14, (l) => l.level > 0.5 && l.state !== 'broken');
    if (!lamp) return false;
    if (burst) {
      g.level.lamps.burst(lamp);
      audio.play('spark', { pos: lamp.pos, volume: 1 });
      g.fx?.emit(lamp.lightPos, 40, { color: [4, 2.6, 1], speed: 3, up: 1, life: 0.7 });
      g.emitNoise(lamp.pos, 6, 'spark');
    } else {
      const prev = lamp.state; lamp.state = 'flicker';
      audio.play('buzz', { pos: lamp.pos, volume: 0.4 });
      setTimeout(() => { if (lamp.state === 'flicker') lamp.state = prev; }, 3000 + Math.random() * 3000);
    }
    return true;
  }

  ratEvent() {
    if (!this.rat) return;
    const g = this.game, p = g.player.position;
    const fwd = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
    const right = new THREE.Vector3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw));
    const start = p.clone().addScaledVector(fwd, 3.5).addScaledVector(right, -2.5);
    const end = p.clone().addScaledVector(fwd, 3.5).addScaledVector(right, 2.5);
    start.y = g.level.floorAt(start.x, start.z); end.y = g.level.floorAt(end.x, end.z);
    if (!g.level.losWorld(start, end) || !g.level.losWorld(p, start)) return;
    this.ratAnim = { t: 0, start, end };
    this.rat.visible = true;
    audio.play('rat', { pos: start, volume: 0.6 });
  }

  majorEvent() {
    const g = this.game;
    const roll = Math.random();
    if (roll < 0.35 && this.silhouette && this.showSilhouette()) return;
    if (roll < 0.6 && this.lampEvent(true)) { setTimeout(() => audio.play('growl', { pos: this.randomAround(10, 16), volume: 0.6, reverb: 0.8, occlusion: 0.5 }), 900); return; }
    if (roll < 0.8) { // loud slam somewhere close
      audio.play('slam', { pos: this.randomAround(6, 12), volume: 1, reverb: 0.8 });
      g.player.fear = Math.min(1, g.player.fear + 0.3);
      return;
    }
    // power flicker for the whole area
    g.flashFlicker = 1.2;
    audio.play('power_off', { volume: 0.5, bus: 'sfx' });
    const lamps = g.level.lamps;
    const prev = { ...lamps.circuits };
    lamps.circuits.main = false;
    setTimeout(() => { if (!g.disposed) { lamps.circuits.main = prev.main; audio.play('power_on', { volume: 0.4 }); } }, 2500 + Math.random() * 2000);
  }

  showSilhouette() {
    const g = this.game, p = g.player;
    // find a dark spot in view 12-22m away
    const dir = new THREE.Vector3(); p.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    for (let i = 0; i < 12; i++) {
      const d = 12 + Math.random() * 10;
      const spread = (Math.random() - 0.5) * 0.6;
      const v = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
      const pt = p.position.clone().addScaledVector(v, d);
      const c = g.nav.cellOf(pt);
      if (!g.nav.walk(c.x, c.y)) continue;
      pt.y = g.level.floorAt(pt.x, pt.z);
      if (!g.level.losWorld(p.position, pt)) continue;
      if (g.level.lamps.lightAt(pt) > 0.4) continue;
      const s = this.silhouette;
      s.root.position.copy(pt);
      s.root.rotation.y = Math.atan2(p.position.x - pt.x, p.position.z - pt.z);
      s.root.visible = true;
      s.play('Idle', 0);
      this.silT = 0; this.silMax = 1.6 + Math.random() * 2;
      return true;
    }
    return false;
  }

  update(dt) {
    if (!this.enabled) return;
    const g = this.game, p = g.player;
    if (!p) return;
    const I = this.cfg.intensity;
    this.minorT -= dt * I; this.majorT -= dt * I; this.silenceT -= dt; this.dripT -= dt;
    if (this.dripT <= 0) { this.dripT = 1.5 + Math.random() * 5; audio.play('drip', { pos: this.randomAround(3, 12), volume: 0.35 + Math.random() * 0.3, rate: 0.8 + Math.random() * 0.5, reverb: 0.8 }); }
    const busy = g.monsters.some((m) => m.state === 'chase');
    if (!busy && !g.cutscene) {
      if (this.minorT <= 0) { this.minorT = 14 + Math.random() * 22; this.minorEvent(); }
      if (this.majorT <= 0) { this.majorT = 70 + Math.random() * 60; this.majorEvent(); }
      if (this.silenceT <= 0) { this.silenceT = 120 + Math.random() * 90; audio.duck(0.95, 12 + Math.random() * 8); }
    }
    // silhouette behaviour: vanish when lit, approached or after a short time
    const s = this.silhouette;
    if (s && s.root.visible) {
      this.silT += dt;
      s.update(dt);
      const lit = p.lights(s.root.position.clone().setY(s.root.position.y + 1.2));
      const close = s.root.position.distanceTo(p.position) < 7;
      if (lit > 0.2 || close || this.silT > this.silMax) {
        s.root.visible = false;
        audio.play('whisper', { pos: s.root.position, volume: 0.5 });
        if (lit > 0.2) { audio.play('stinger', { bus: 'music', volume: 0.5 }); p.fear = Math.min(1, p.fear + 0.4); g.stats('scares'); }
      }
    }
    if (this.ratAnim) {
      const r = this.ratAnim; r.t += dt * 1.6;
      const k = Math.min(1, r.t);
      this.rat.position.lerpVectors(r.start, r.end, k);
      this.rat.rotation.y = Math.atan2(r.end.x - r.start.x, r.end.z - r.start.z);
      if (k >= 1) { this.rat.visible = false; this.ratAnim = null; }
    }
  }

  dispose() { this.silhouette?.dispose(); this.rat?.removeFromParent(); }
}
