// AI driver for physics vehicles: road-graph routing, pure pursuit, obstacle avoidance, stuck recovery, ramming
import * as THREE from 'three';
import { G, clamp, rand, angDiff, _v1, _v2 } from '../core/util.js';
import { GR } from '../core/physics.js';

export class AIDriver {
  constructor(v, opts = {}) {
    this.v = v; this.max = opts.max || 30; this.aggr = opts.aggr || 0.5;
    this.path = []; this.pathT = 0; this.stuckT = 0; this.revT = 0; this.target = null;
    this.mode = opts.mode || 'pursue'; // pursue | route | flee | checkpoints
    this.cps = opts.checkpoints || null; this.cpi = 0;
    this.fleeFrom = null; this.arrive = opts.arrive || 6;
  }
  setTarget(p) { this.target = p; }
  update(dt) {
    const v = this.v;
    if (v.dead || v.mode !== 'dynamic') { v.throttle = 0; return; }
    let tgt = this.target;
    if (this.mode === 'checkpoints' && this.cps) {
      tgt = this.cps[this.cpi];
      if (tgt && Math.hypot(tgt.x - v.pos.x, tgt.z - v.pos.z) < 14) { this.cpi++; tgt = this.cps[this.cpi]; }
      if (!tgt) { v.throttle = 0; v.brake = 1; return; }
    }
    if (this.mode === 'flee') {
      // drive along a long route away from the threat; re-route when reached
      if (!this.target || Math.hypot(this.target.x - v.pos.x, this.target.z - v.pos.z) < 30) {
        const from = this.fleeFrom ? this.fleeFrom() : G.player.wpos();
        const a = Math.atan2(v.pos.x - from.x, v.pos.z - from.z) + rand(-0.9, 0.9);
        const d = rand(300, 600);
        this.target = { x: clamp(v.pos.x + Math.sin(a) * d, -950, 950), z: clamp(v.pos.z + Math.cos(a) * d, -950, 950) };
        this.path = [];
      }
      tgt = this.target;
    }
    if (!tgt) { v.throttle = 0; v.brake = 0.5; return; }
    const tp = typeof tgt === 'function' ? tgt() : tgt;
    const dist = Math.hypot(tp.x - v.pos.x, tp.z - v.pos.z);
    const direct = dist < 45 && G.city.los(v.pos.x, v.pos.z, tp.x, tp.z, 1);
    let aim = tp;
    if (!direct && this.mode !== 'checkpoints') {
      this.pathT -= dt;
      if (this.pathT < 0 || !this.path.length) { this.pathT = 2.5; this.path = G.city.path(v.pos.x, v.pos.z, tp.x, tp.z); }
      while (this.path.length > 1 && Math.hypot(this.path[0].x - v.pos.x, this.path[0].z - v.pos.z) < 12) this.path.shift();
      if (this.path.length) aim = this.path[0];
    }
    const f = _v1.set(Math.sin(v.heading), 0, Math.cos(v.heading));
    const dx = aim.x - v.pos.x, dz = aim.z - v.pos.z, dl = Math.hypot(dx, dz) || 1;
    const right = _v2.set(-f.z, 0, f.x);
    const lat = (dx * right.x + dz * right.z) / dl, lon = (dx * f.x + dz * f.z) / dl;
    let steer = clamp(lat * 2.4 + (lon < 0 ? Math.sign(lat || 1) : 0), -1, 1);
    // obstacle avoidance (static only)
    const o = { x: v.pos.x, y: v.pos.y + 0.2, z: v.pos.z };
    const sp = Math.abs(v.speed);
    for (const side of [-0.35, 0.35]) {
      const d = new THREE.Vector3(f.x + right.x * side, 0, f.z + right.z * side).normalize();
      const h = G.physics.ray(o, d, 6 + sp * 0.6, GR.STATIC);
      if (h) steer -= Math.sign(side) * (1 - h.t / (6 + sp * 0.6)) * 1.2;
    }
    steer = clamp(steer, -1, 1);
    let want = this.max * (1 - Math.min(0.75, Math.abs(lat) * (lon > 0 ? 0.9 : 1.5)));
    if (!direct && this.path.length > 1 && dl < 30) want = Math.min(want, 14);
    if (this.mode === 'pursue' && dist < 25) want = Math.min(want, this.aggr > 0.7 ? this.max : 8 + dist * 0.5);
    if (this.mode === 'route' && dist < this.arrive) want = 0;
    let thr = clamp((want - v.speed) * 0.35, -1, 1), brk = v.speed > want + 4 ? 0.7 : 0;
    // stuck recovery
    if (sp < 1.2 && thr > 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.4) { this.revT = 1.3; this.stuckT = 0; }
    if (this.revT > 0) { this.revT -= dt; thr = -1; steer = -steer; brk = 0; }
    v.throttle = thr; v.steer = steer; v.brake = brk; v.handbrake = Math.abs(lat) > 0.8 && sp > 14 && this.aggr > 0.6 ? 1 : 0;
  }
}
