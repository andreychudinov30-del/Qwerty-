// Monster AI: perception (sight cone + darkness + flashlight, hearing with occlusion, proximity), state machine
// (patrol / investigate / chase / search / attack / flee / stunned / scripted), pathfinding, door handling,
// vocalizations, and network-friendly state snapshots.
import * as THREE from 'three';
import { Human } from './human.js';
import { Creature } from './creatures.js';
import { audio } from '../core/audio.js';
import { angleDiff } from '../core/util.js';

export const MONSTER_TYPES = {
  turned: { name: 'Обращённый', walk: 1.25, run: 4.0, sight: 17, fov: 115, hearing: 1.0, attack: { range: 1.55, dmg: 28, windup: 0.45, cd: 1.3 }, climb: 0.5, openDoors: true, model: 'turned', voice: 'growl', radius: 0.35, height: 1.8, loseTime: 5 },
  crawler: { name: 'Ползун', walk: 1.7, run: 5.3, sight: 14, fov: 150, hearing: 1.25, attack: { range: 1.6, dmg: 20, windup: 0.28, cd: 0.9 }, climb: 1.4, photophobic: true, model: 'crawler', voice: 'clicks', radius: 0.4, height: 0.9, loseTime: 4 },
  blind: { name: 'Слепой', walk: 1.05, run: 4.9, sight: 0, fov: 0, hearing: 2.3, attack: { range: 1.9, dmg: 100, windup: 0.35, cd: 1.5 }, climb: 0.5, openDoors: true, model: 'blind', voice: 'whisper', radius: 0.4, height: 2.6, loseTime: 3 },
  hunter: { name: 'Охотник', walk: 1.6, run: 4.35, sight: 9, fov: 90, hearing: 2.6, attack: { range: 2.2, dmg: 55, windup: 0.5, cd: 1.6 }, climb: 0.6, breakDoors: true, model: 'hunter', voice: 'growl', radius: 0.6, height: 1.8, loseTime: 9 },
  queen: { name: 'Королева тоннелей', walk: 2.2, run: 3.7, sight: 26, fov: 160, hearing: 1.8, attack: { range: 4.2, dmg: 100, windup: 0.8, cd: 2.2 }, climb: 1.5, breakDoors: true, model: 'queen', voice: 'growl', radius: 1.8, height: 5, loseTime: 12, boss: true },
  conductor: { name: 'Машинист', walk: 2.0, run: 4.55, sight: 30, fov: 180, hearing: 2, attack: { range: 2.0, dmg: 100, windup: 0.35, cd: 1.2 }, climb: 1.4, breakDoors: true, model: 'conductor', voice: 'growl', radius: 0.6, height: 2.7, loseTime: 30, boss: true },
  shadow: { name: 'Тень', walk: 0.8, run: 3.2, sight: 22, fov: 360, hearing: 0.6, attack: { range: 1.3, dmg: 34, windup: 0.6, cd: 2.0 }, climb: 0.5, model: 'shadow', voice: 'whisper', radius: 0.3, height: 1.8, loseTime: 3, ghost: true },
};

let MID = 0;
export class Monster {
  static async create(game, kind, pos, opts = {}) {
    const m = new Monster(game, kind, pos, opts);
    await m.buildModel();
    return m;
  }

  constructor(game, kind, pos, opts) {
    this.game = game;
    this.id = opts.id || `m${++MID}`;
    this.kind = kind;
    this.T = { ...MONSTER_TYPES[kind], ...(opts.override || {}) };
    this.pos = pos.clone();
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.state = opts.state || 'patrol';
    this.patrol = opts.patrol || null; // array of Vector3
    this.patrolIdx = 0;
    this.home = pos.clone();
    this.wanderRadius = opts.wander ?? 6;
    this.path = null; this.pathT = 0; this.goal = null;
    this.target = null; this.lastKnown = null; this.lostT = 0;
    this.stateT = 0; this.attackT = 0; this.cooldown = 0;
    this.lightT = 0; this.voiceT = 2 + Math.random() * 5;
    this.speed = 0; this.alert = 0;
    this.remote = !!opts.remote; // network-driven (guest)
    this.dormant = !!opts.dormant; // waits for activation
    this.aggressive = !!opts.aggressive; // always knows where player is
    this.rubber = !!opts.rubber;
    this.opacity = 1;
    this.noFlee = !!opts.noFlee;
    this.caps = { openDoors: !!this.T.openDoors, breakDoors: !!this.T.breakDoors, climb: this.T.climb };
    this.netTarget = null;
  }

  async buildModel() {
    const g = this.game;
    const T = this.T;
    if (['turned', 'shadow', 'conductor'].includes(T.model)) {
      this.human = await Human.create({ mode: T.model, height: T.height });
      this.object = this.human.root;
      g.scene.add(this.object);
    } else {
      this.creature = new Creature(T.model);
      this.object = this.creature.root;
      this.creature.attach(g.scene);
      this.object.position.copy(this.pos);
      this.object.rotation.y = this.yaw;
      this.creature.init((x, z) => g.level.floorAt(x, z));
      this.creature.onStep = () => { if (this.kind === 'hunter' || this.kind === 'queen') { audio.play('step_concrete', { pos: this.pos, volume: this.kind === 'queen' ? 1.4 : 0.9, rate: 0.5, reverb: 0.5 }); g.player && (g.player.shake = Math.min(1, g.player.shake + (this.kind === 'queen' ? 0.15 : 0.04) / Math.max(1, this.pos.distanceTo(g.player.position) / 6))); } };
    }
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    this.body = g.physics.addKinematicCapsule(Math.max(0.1, T.height / 2 - T.radius), T.radius, { x: this.pos.x, y: this.pos.y + T.height / 2, z: this.pos.z });
    if (T.ghost) this.body.col.setEnabled(false);
  }

  // ---------- perception ----------
  canSee(tp) {
    const T = this.T;
    if (!T.sight) return 0;
    const eye = this.pos.clone(); eye.y += T.height * 0.85;
    const to = tp.position.clone().sub(eye);
    const d = to.length();
    let range = T.sight;
    const lit = this.game.level.lamps.lightAt(tp.position);
    range *= tp.flashOn ? 1.7 : 1;
    range *= tp.crouching ? 0.62 : 1;
    range *= 0.7 + Math.min(0.6, lit * 0.6);
    if (tp.skinStealth) range *= 0.85;
    if (d > range) return 0;
    if (tp.hidden) return 0;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const flat = to.clone().setY(0).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, flat.dot(fwd)))) * 180 / Math.PI;
    if (ang > T.fov / 2 && d > 2.2) {
      // flashlight shining toward monster is noticeable from the side
      if (!(tp.flashOn && d < range * 0.6)) return 0;
    }
    if (!this.game.level.losWorld(eye, tp.position)) return 0;
    // physics ray for props/doors
    const dir = to.clone().normalize();
    const hit = this.game.physics.raycast({ x: eye.x, y: eye.y, z: eye.z }, dir, d - 0.5);
    if (hit && hit.toi < d - 0.6) return 0;
    return 1 - d / (range + 0.01) * 0.5;
  }

  targets() {
    const list = [];
    const p = this.game.player;
    if (p && p.alive) list.push({ id: 'local', position: p.position, flashOn: p.flashOn, crouching: p.crouching, hidden: p.hidden, ref: p, skinStealth: this.game.skinStealth });
    for (const r of this.game.remotePlayers?.() || []) if (r.alive) list.push({ id: r.id, position: r.position.clone(), flashOn: r.flashOn, crouching: r.crouching, hidden: r.hidden, ref: r });
    return list;
  }

  hear() {
    let best = null, bestScore = 0;
    for (const n of this.game.noises) {
      const d = n.pos.distanceTo(this.pos);
      let r = n.radius * this.T.hearing;
      if (!this.game.level.losWorld(n.pos, this.pos)) r *= 0.55;
      if (d < r) { const s = (1 - d / r) * n.radius; if (s > bestScore) { bestScore = s; best = n; } }
    }
    return best;
  }

  // ---------- main update ----------
  update(dt) {
    if (this.remote) return this.updateRemote(dt);
    const g = this.game;
    const T = this.T;
    this.stateT += dt; this.cooldown -= dt; this.voiceT -= dt;
    if (this.dormant) { this.animate(dt, 0); return; }
    this.perceiveT = (this.perceiveT || 0) - dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.12; this.perceive(); }
    // photophobic reaction
    if (T.photophobic && !this.noFlee) {
      let lit = 0;
      for (const t of this.targets()) if (t.ref.lights) lit = Math.max(lit, t.ref.lights(this.pos.clone().setY(this.pos.y + 0.5)));
      this.lightT = lit > 0.25 ? this.lightT + dt : Math.max(0, this.lightT - dt * 2);
      if (this.lightT > 0.45 && this.state !== 'flee') { this.setState('flee'); audio.play('screech', { pos: this.pos, volume: 0.9, rate: 1.2 }); }
    }
    if (T.ghost) this.updateGhost(dt);
    let moveSpeed = 0;
    switch (this.state) {
      case 'patrol': moveSpeed = this.doPatrol(dt); break;
      case 'investigate': moveSpeed = this.doInvestigate(dt); break;
      case 'chase': moveSpeed = this.doChase(dt); break;
      case 'search': moveSpeed = this.doSearch(dt); break;
      case 'attack': this.doAttack(dt); break;
      case 'flee': moveSpeed = this.doFlee(dt); break;
      case 'stunned': if (this.stateT > 3) this.setState(this.target ? 'chase' : 'patrol'); break;
      case 'scripted': moveSpeed = this.doScripted(dt); break;
      case 'idle': break;
    }
    this.speed += (moveSpeed - this.speed) * Math.min(1, dt * 6);
    this.alert += ((this.state === 'chase' || this.state === 'attack' ? 1 : this.state === 'investigate' || this.state === 'search' ? 0.5 : 0) - this.alert) * Math.min(1, dt * 2);
    // vocalize
    if (this.voiceT <= 0) {
      this.voiceT = (this.state === 'chase' ? 2.5 : 6) + Math.random() * 6;
      const d = this.pos.distanceTo(g.player?.position || this.pos);
      if (d < 40) audio.play(T.voice, { pos: this.pos.clone().setY(this.pos.y + T.height * 0.8), volume: this.state === 'chase' ? 1 : 0.6, variant: Math.floor(Math.random() * 3), rate: this.kind === 'queen' || this.kind === 'conductor' ? 0.6 : this.kind === 'crawler' ? 1.3 : 1, reverb: 0.6, occlusion: g.level.losWorld(this.pos, g.player.position) ? 0 : 0.7 });
    }
    this.animate(dt, this.speed);
  }

  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s; this.stateT = 0; this.path = null;
    if (s === 'chase' && prev !== 'attack' && prev !== 'chase') this.game.onMonsterSpotted?.(this);
  }

  perceive() {
    const T = this.T;
    let seen = null, seenScore = 0;
    for (const t of this.targets()) {
      const sc = this.canSee(t);
      if (sc > seenScore) { seenScore = sc; seen = t; }
      // proximity sense (touch / smell) — even blind ones notice someone bumping into them
      const d = t.position.distanceTo(this.pos);
      if (!t.hidden && d < (T.sight ? 2.6 : 1.6) && (!seen || d < 2)) { seen = t; seenScore = 1; }
      if (this.aggressive && !t.hidden) { seen = t; seenScore = 1; }
    }
    if (seen && this.state !== 'flee' && this.state !== 'stunned' && this.state !== 'scripted') {
      this.target = seen; this.lastKnown = seen.position.clone(); this.lostT = 0;
      if (this.state !== 'attack') this.setState('chase');
      return;
    }
    if (this.state === 'chase') {
      this.lostT += 0.12;
      if (this.lostT > T.loseTime) { this.setState('search'); }
    }
    const n = this.hear();
    if (n && this.state !== 'attack' && this.state !== 'flee' && this.state !== 'stunned' && this.state !== 'scripted') {
      if (this.state === 'chase' && !T.sight) { this.lastKnown = n.pos.clone(); this.lostT = 0; return; }
      if (this.state !== 'chase') {
        if (!T.sight && n.radius > 6) { this.lastKnown = n.pos.clone(); this.target = null; this.setState('chase'); this.lostT = 0; }
        else { this.goal = n.pos.clone(); if (this.state !== 'investigate') this.setState('investigate'); else this.path = null; }
      }
    }
  }

  // move toward a point using a path; returns actual speed
  moveTo(dest, speed, dt) {
    const g = this.game;
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0 || (this.pathGoal && this.pathGoal.distanceTo(dest) > 1.5)) {
      this.path = g.nav.findPath(this.pos, dest, this.caps) || null;
      this.pathGoal = dest.clone();
      this.pathT = this.state === 'chase' ? 0.35 : 1.5;
      if (!this.path) { this.blockedT = (this.blockedT || 0) + 1; return 0; }
    }
    if (!this.path.length) return 0;
    const next = this.path[0];
    const to = next.clone().sub(this.pos); to.y = 0;
    const d = to.length();
    if (d < 0.35) { this.path.shift(); return speed * 0.5; }
    // door interaction
    const c = g.nav.cellOf(this.pos.clone().addScaledVector(to.normalize(), 1.2));
    const door = g.doorAt?.(c.x, c.y);
    if (door && !door.open) {
      if (this.caps.openDoors && !door.locked) { g.openDoor(door, this); return 0; }
      if (this.caps.breakDoors) { this.bashT = (this.bashT || 0) + dt; if (this.bashT > 0.9) { this.bashT = 0; g.bashDoor(door, this); } return 0; }
      this.path = null; return 0;
    }
    const step = Math.min(d, speed * dt);
    // separation from other monsters
    const sep = new THREE.Vector3();
    for (const o of g.monsters) { if (o === this) continue; const dd = o.pos.distanceTo(this.pos); if (dd < (this.T.radius + o.T.radius) * 1.4 && dd > 0.01) sep.add(this.pos.clone().sub(o.pos).setY(0).multiplyScalar(0.5 / dd)); }
    this.pos.addScaledVector(to, step).addScaledVector(sep, dt);
    this.pos.y = g.level.floorAt(this.pos.x, this.pos.z);
    const wantYaw = Math.atan2(to.x, to.z);
    this.yaw += angleDiff(this.yaw, wantYaw) * Math.min(1, dt * 8);
    return speed;
  }

  doPatrol(dt) {
    if (this.patrol && this.patrol.length) {
      const p = this.patrol[this.patrolIdx % this.patrol.length];
      if (p.distanceTo(this.pos) < 1.2) { if (this.stateT > 2) { this.patrolIdx++; this.stateT = 0; } return 0; }
      return this.moveTo(p, this.T.walk, dt);
    }
    if (!this.goal || this.goal.distanceTo(this.pos) < 1 || this.stateT > 14) {
      if (this.stateT > 1.5 + Math.random() * 3) { this.goal = this.game.nav.randomNear(this.home, this.wanderRadius, this.caps); this.stateT = 0; }
      return 0;
    }
    return this.moveTo(this.goal, this.T.walk, dt);
  }
  doInvestigate(dt) {
    if (!this.goal) { this.setState('patrol'); return 0; }
    if (this.goal.distanceTo(this.pos) < 1.4) {
      this.yaw += Math.sin(this.stateT * 1.3) * dt * 1.2;
      if (this.stateT > 4 + Math.random() * 3) { this.goal = null; this.setState('search'); }
      return 0;
    }
    this.stateT = 0;
    return this.moveTo(this.goal, this.T.walk * 1.5, dt);
  }
  doChase(dt) {
    const T = this.T;
    const tgt = this.target;
    const dest = tgt && this.lostT < 0.5 ? tgt.ref.position || tgt.position : this.lastKnown;
    if (!dest) { this.setState('search'); return 0; }
    const d = dest.distanceTo(this.pos);
    if (tgt && this.lostT < 0.3 && d < T.attack.range && this.cooldown <= 0) { this.setState('attack'); this.attackT = 0; return 0; }
    if (!tgt || this.lostT > 0.5) { if (this.lastKnown && this.lastKnown.distanceTo(this.pos) < 1.2) { this.setState('search'); return 0; } }
    let run = T.run;
    if (this.rubber && tgt) { // chase pacing: never hopeless, never safe
      const dd = (tgt.ref.position || tgt.position).distanceTo(this.pos);
      run *= dd > 16 ? 1.25 : dd < 5 ? 0.82 : 1;
    }
    const s = this.moveTo(dest, run, dt);
    if (s === 0 && d < 3 && tgt && !this.path) { // direct approach when path fails close by
      const to = dest.clone().sub(this.pos).setY(0); const l = to.length();
      if (l > 0.1) { this.pos.addScaledVector(to.normalize(), Math.min(l, T.run * dt)); this.yaw = Math.atan2(to.x, to.z); return T.run; }
    }
    return s;
  }
  doSearch(dt) {
    if (!this.goal || this.goal.distanceTo(this.pos) < 1.2) {
      if (this.stateT > 10) { this.target = null; this.setState('patrol'); this.home = this.pos.clone(); return 0; }
      this.goal = this.game.nav.randomNear(this.lastKnown || this.pos, 4, this.caps);
    }
    return this.goal ? this.moveTo(this.goal, this.T.walk * 1.3, dt) : 0;
  }
  doAttack(dt) {
    const T = this.T;
    this.attackT += dt;
    const tgt = this.target;
    if (tgt) { const to = (tgt.ref.position || tgt.position).clone().sub(this.pos); this.yaw += angleDiff(this.yaw, Math.atan2(to.x, to.z)) * Math.min(1, dt * 10); }
    if (this.attackT === dt || this.attackT < dt * 1.5) audio.play(this.kind === 'crawler' ? 'screech' : T.voice === 'whisper' ? 'screech' : 'growl', { pos: this.pos, volume: 1, rate: this.kind === 'queen' ? 0.55 : 1.1 });
    if (this.attackT >= T.attack.windup && !this.struck) {
      this.struck = true;
      if (tgt) {
        const tp = tgt.ref.position || tgt.position;
        const d = tp.distanceTo(this.pos);
        if (d < T.attack.range + 0.6 && !tgt.hidden) {
          if (tgt.id === 'local') this.game.player.damage(T.attack.dmg, this.pos);
          else this.game.net?.sendDamage?.(tgt.id, T.attack.dmg, this.pos);
        }
      }
    }
    if (this.attackT > T.attack.windup + 0.35) { this.struck = false; this.cooldown = T.attack.cd; this.setState('chase'); }
  }
  doFlee(dt) {
    if (!this.fleeGoal || this.stateT < 0.05) {
      // run to a point away from the players, preferably dark
      const p = this.game.player.position;
      const away = this.pos.clone().sub(p).setY(0).normalize().multiplyScalar(10).add(this.pos);
      this.fleeGoal = this.game.nav.randomNear(away, 4, this.caps) || this.game.nav.randomNear(this.pos, 8, this.caps);
    }
    if (this.stateT > 4 + Math.random() * 2 || !this.fleeGoal) { this.lightT = 0; this.fleeGoal = null; this.setState(this.target ? 'search' : 'patrol'); return 0; }
    return this.moveTo(this.fleeGoal, this.T.run * 1.1, dt);
  }
  doScripted(dt) {
    if (!this.scriptPath || !this.scriptPath.length) { if (this.onScriptDone) { const f = this.onScriptDone; this.onScriptDone = null; f(this); } return 0; }
    const p = this.scriptPath[0];
    const to = p.clone().sub(this.pos).setY(0); const d = to.length();
    if (d < 0.4) { this.scriptPath.shift(); return this.scriptSpeed; }
    this.pos.addScaledVector(to.normalize(), Math.min(d, this.scriptSpeed * dt));
    this.pos.y = this.game.level.floorAt(this.pos.x, this.pos.z);
    this.yaw += angleDiff(this.yaw, Math.atan2(to.x, to.z)) * Math.min(1, dt * 6);
    return this.scriptSpeed;
  }
  runScript(points, speed, done) { this.dormant = false; this.scriptPath = points.map((p) => p.clone()); this.scriptSpeed = speed; this.onScriptDone = done; this.setState('scripted'); }
  stun() { if (this.T.boss) return; this.setState('stunned'); audio.play('screech', { pos: this.pos, rate: 1.4, volume: 0.8 }); }
  wake(aggressive = false) { this.dormant = false; if (aggressive) { this.aggressive = true; } }

  updateGhost(dt) {
    // shadows fade when lit, are bolder in darkness
    const p = this.game.player;
    const lit = p.lights(this.pos.clone().setY(this.pos.y + 1)) + this.game.level.lamps.lightAt(this.pos) * 0.5;
    const target = lit > 0.15 ? 0 : 1;
    this.opacity += (target - this.opacity) * Math.min(1, dt * (target ? 0.8 : 6));
    if (this.human) this.human.model.traverse((o) => { if (o.isMesh && o.material.transparent) o.material.opacity = 0.94 * this.opacity; });
    if (this.opacity < 0.05 && lit > 0.15) {
      // relocate into darkness elsewhere
      this.vanishT = (this.vanishT || 0) + dt;
      if (this.vanishT > 1.5) { const np = this.game.nav.randomNear(p.position, 7, this.caps); if (np && np.distanceTo(p.position) > 6) { this.pos.copy(np); audio.play('whisper', { pos: np, volume: 0.6 }); } this.vanishT = 0; this.setState('patrol'); }
    }
  }

  animate(dt, speed) {
    const g = this.game;
    const o = this.object;
    if (!o) return;
    o.position.copy(this.pos);
    o.rotation.y = this.yaw;
    if (this.human) {
      this.human.locomote(speed);
      this.human.update(dt, { twitch: this.alert * 0.05 });
      if (this.state === 'attack' && this.human.bones.RightArm) { const k = Math.min(1, this.attackT / this.T.attack.windup); this.human.bones.RightArm.rotation.x -= Math.sin(k * Math.PI) * 1.5; this.human.bones.LeftArm.rotation.x -= Math.sin(k * Math.PI) * 1.2; }
    } else if (this.creature) {
      const c = this.creature;
      c.vel.set(Math.sin(this.yaw) * speed, 0, Math.cos(this.yaw) * speed);
      c.lookTarget = (this.state === 'chase' || this.state === 'attack') && g.player ? g.player.camera.position : null;
      c.jawTarget = this.state === 'chase' ? 0.3 : 0;
      c.update(dt, (x, z) => g.level.floorAt(x, z), { speed, alert: this.alert, attack: this.state === 'attack' ? Math.sin(Math.min(1, this.attackT / this.T.attack.windup) * Math.PI) : 0 });
    }
    if (this.body) this.body.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + this.T.height / 2, z: this.pos.z });
  }

  // ---------- networking ----------
  snapshot() { return { id: this.id, k: this.kind, x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), r: +this.yaw.toFixed(2), s: this.state, v: +this.speed.toFixed(2), a: this.state === 'attack' ? +this.attackT.toFixed(2) : 0 }; }
  applySnapshot(s) { this.netTarget = s; }
  updateRemote(dt) {
    const s = this.netTarget;
    if (s) {
      const tp = new THREE.Vector3(s.x, s.y, s.z);
      const d = tp.distanceTo(this.pos);
      if (d > 6) this.pos.copy(tp); else this.pos.lerp(tp, Math.min(1, dt * 10));
      this.yaw += angleDiff(this.yaw, s.r) * Math.min(1, dt * 10);
      this.state = s.s; this.attackT = s.a || 0;
      this.speed += ((s.v || 0) - this.speed) * Math.min(1, dt * 8);
    }
    this.alert += ((this.state === 'chase' || this.state === 'attack' ? 1 : 0) - this.alert) * Math.min(1, dt * 2);
    if (this.T.ghost) this.updateGhost(dt);
    this.animate(dt, this.speed);
  }

  dispose() {
    if (this.human) this.human.dispose();
    if (this.creature) this.creature.dispose();
    if (this.body) { try { this.game.physics.world.removeRigidBody(this.body.body); } catch (e) { /* ignore */ } }
  }
}
