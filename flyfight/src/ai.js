import * as THREE from 'three';
import { clamp, rand } from './util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tq = new THREE.Quaternion();
// Steering: compute stick inputs to point the nose along world direction d
export function steer(pl, d, out, aggr = 1) {
  const f = pl.flight; tq.copy(f.q).invert();
  const l = tv.copy(d).normalize().applyQuaternion(tq); // local: x left, y up, z fwd
  const lateral = Math.hypot(l.x, l.y);
  let roll = 0, pitch = 0, yaw = 0;
  if (l.z > 0.985 && lateral < 0.17) {
    // fine aiming: little roll toward level, pitch & yaw corrections
    pitch = clamp(l.y * 9, -1, 1); yaw = clamp(-l.x * 7, -1, 1);
    roll = clamp(f.bank() * -0.8 - l.x * 2.5, -1, 1);
  } else {
    const bankErr = Math.atan2(-l.x, l.y); // angle to roll so target is overhead
    roll = clamp(bankErr * 2.2, -1, 1);
    const ahead = Math.abs(bankErr) < 1.0 || l.z < 0;
    pitch = ahead ? clamp((Math.atan2(lateral, l.z)) * 2.6 * aggr, -1, 1) : clamp(l.y * 2, -0.3, 1);
    if (l.y < 0 && Math.abs(bankErr) > 2.4 && l.z > 0.5) pitch = clamp(l.y * 3, -0.7, 0); // small push
    yaw = clamp(-l.x * 2, -1, 1) * 0.5;
  }
  out.pitch = pitch; out.roll = roll; out.yaw = yaw;
  return l;
}

export class Pilot {
  constructor(pl, game, skill, role) {
    this.pl = pl; this.g = game; this.skill = skill; this.role = role || 'fighter';
    this.state = 'engage'; this.retarget = 0; this.react = 0; this.evadeDir = new THREE.Vector3(); this.evadeT = 0; this.err = new THREE.Vector3();
    this.errT = 0; this.jink = 0; this.persona = ['aggressive', 'sniper', 'balanced', 'cautious'][(Math.random() * 4) | 0];
    if (pl.ace) this.persona = 'aggressive';
    this.desired = new THREE.Vector3(0, 0, 1); this.groundTarget = null; this.goal = null;
  }
  pickTarget() {
    const pl = this.pl, g = this.g; let best = null, bs = 1e18;
    for (const o of g.planes) {
      if (!o.alive || o.team === pl.team) continue;
      let d = o.pos.distanceToSquared(pl.pos);
      if (o.isPlayer) d *= g.playerThreat; // bias toward player
      if (o.bomber) d *= 1.6;
      tv.subVectors(o.pos, pl.pos).normalize(); const ang = tv.dot(pl.fwd); d *= 1.4 - ang * 0.4;
      if (d < bs) { bs = d; best = o; }
    }
    pl.target = best;
  }
  update(dt) {
    const pl = this.pl, g = this.g, f = pl.flight, c = pl.ctrl;
    if (!pl.alive) return;
    this.retarget -= dt; this.react -= dt; this.errT -= dt;
    if (this.retarget <= 0 || !pl.target || !pl.target.alive) { this.retarget = 3 + Math.random() * 3; if (this.role !== 'bomber') this.pickTarget(); }
    if (this.errT <= 0) { this.errT = 0.6 + Math.random(); const e = (1 - this.skill) * 0.12; this.err.set(rand(-e, e), rand(-e, e), rand(-e, e)); }
    const d = this.desired; let aggr = 0.85 + this.skill * 0.35; c.gun = false; c.missile = false; c.ab = false; c.throttle = 0.85; c.flare = false;
    // --- bombers & strikers: fly to goal
    if (this.role === 'bomber' && this.goal) {
      d.subVectors(this.goal, pl.pos); d.y = (this.goal.y + 2500 - pl.pos.y) * 0.3; c.throttle = 0.9; aggr = 0.5;
    } else {
      // threats
      const threat = pl.incoming.find(m => m.p.distanceTo(pl.pos) < 3200 && (m.target === pl));
      if (threat && this.state !== 'evade' && Math.random() < 0.5 + this.skill * 0.5) { this.state = 'evade'; this.evadeT = 3 + Math.random() * 2; tv.subVectors(threat.p, pl.pos).normalize(); this.evadeDir.crossVectors(tv, new THREE.Vector3(0, 1, 0)).normalize(); if (Math.random() < 0.5) this.evadeDir.negate(); this.evadeDir.y = rand(-0.4, 0.2); }
      if (this.state === 'evade') {
        this.evadeT -= dt; d.copy(this.evadeDir); c.ab = true; c.throttle = 1; aggr = 1.2;
        if (threat && threat.p.distanceTo(pl.pos) < 1400 + this.skill * 600 && Math.random() < dt * (1 + this.skill * 4)) c.flare = true;
        if (this.evadeT <= 0) this.state = 'engage';
      } else if (this.groundTarget && this.groundTarget.alive && (!pl.target || pl.target.pos.distanceTo(pl.pos) > 3000)) {
        // attack run on ground target
        const gt = this.groundTarget; d.subVectors(gt.pos, pl.pos); const dist = d.length();
        if (dist > 2500) d.y += 600; c.throttle = 0.9;
        tv.copy(d).normalize(); if (tv.dot(pl.fwd) > 0.98 && dist < 1600) c.gun = true;
        if (dist < 900) { d.y = Math.abs(d.y) + 400; }
      } else if (pl.target) {
        const t = pl.target; const tp = t.pos; const dist = tp.distanceTo(pl.pos);
        const tof = dist / 1050;
        const lead = tv2.copy(tp).addScaledVector(t.vel, tof * (0.6 + this.skill * 0.4)).sub(pl.pos);
        if (this.role === 'escort' && dist > 6000 && this.escortOf) { d.subVectors(this.escortOf.pos, pl.pos).addScaledVector(this.escortOf.vel, 2); }
        else d.copy(lead).normalize().add(this.err);
        const ang = Math.acos(clamp(tv.copy(tp).sub(pl.pos).normalize().dot(pl.fwd), -1, 1));
        // energy: throttle management
        c.throttle = dist > 2500 ? 1 : 0.85 + (ang > 0.8 ? 0.15 : 0);
        c.ab = (dist > 3000 && ang < 0.5) || (f.speed < 170 && f.pos.y < 3500) || (ang > 1.2 && f.speed < 210);
        if (dist < 350 && ang < 0.4) { c.throttle = 0.6; c.brake = f.speed > t.flight.speed + 30; } else c.brake = false;
        // guns
        const leadAng = Math.acos(clamp(tv.copy(lead).normalize().dot(pl.fwd), -1, 1));
        if (dist < 1100 && leadAng < 0.035 + (1 - this.skill) * 0.02) c.gun = true;
        // missiles
        if (pl.locked && dist < 3300 && dist > 450 && pl.missiles > 0 && Math.random() < dt * (0.25 + this.skill * 0.55) * (this.persona === 'sniper' ? 2 : 1)) c.missile = true;
        // overshoot: if too close behind pull vertical
        if (dist < 160 && ang < 0.5) { d.copy(f.up).addScaledVector(pl.fwd, 0.5); }
        // jink when target on our tail
        tv.subVectors(pl.pos, tp).normalize(); const behind = tv.dot(t.fwd) > 0.85 && dist < 1500;
        if (behind && this.persona !== 'aggressive') { this.jink += dt; d.addScaledVector(f.up, Math.sin(this.jink * 1.7) * 0.8).addScaledVector(f.left, Math.cos(this.jink * 1.3) * 0.8); c.ab = true; if (Math.random() < dt * 0.3 * this.skill) c.flare = true; }
      } else {
        d.copy(pl.fwd); d.y = 0;
      }
    }
    // --- arena bounds
    const R = g.arenaR; const hd = Math.hypot(pl.pos.x - g.center.x, pl.pos.z - g.center.z);
    if (hd > R * 0.95 && this.role !== 'bomber') { tv.set(g.center.x - pl.pos.x, 0, g.center.z - pl.pos.z).normalize(); d.normalize().lerp(tv, clamp((hd - R * 0.95) / (R * 0.15), 0, 1)); }
    // --- altitude / terrain avoidance (look ahead)
    const look = clamp(f.speed * 4, 600, 2000);
    tv.copy(f.vel).normalize();
    let danger = 0;
    for (const k of [0.25, 0.5, 1]) {
      const px = pl.pos.x + tv.x * look * k, pz = pl.pos.z + tv.z * look * k, py = pl.pos.y + tv.y * look * k;
      const gh = g.terrain.groundAt(px, pz); const margin = 220 + f.speed * 0.6;
      danger = Math.max(danger, clamp((gh + margin - py) / margin, 0, 1.5));
    }
    const gnow = g.terrain.groundAt(pl.pos.x, pl.pos.z);
    if (pl.pos.y - gnow < 350) danger = Math.max(danger, clamp((350 - (pl.pos.y - gnow)) / 250, 0, 1.5));
    if (pl.pos.y > 9000) d.y = Math.min(d.y, -0.3);
    d.normalize();
    if (danger > 0) { d.y = Math.max(d.y, 0.25 + danger * 0.8); d.normalize(); if (danger > 0.6) { c.gun = false; c.ab = true; } }
    steer(pl, d, c, aggr);
    // slight reaction lag for low skill
    if (danger > 0.8 && f.up.y < 0) { c.roll = clamp(-f.bank() * 2, -1, 1); }
  }
}
