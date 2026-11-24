// Traffic: lane-following kinematic cars with traffic lights, car-following, turning curves, obstacle braking, honking
import * as THREE from 'three';
import { G, clamp, lerp, rand, pick, chance, SpatialHash, bus, _v1, _v2 } from '../core/util.js';
import { Vehicle, VT, TRAFFIC_TYPES } from '../entities/vehicle.js';
import { randomLook } from '../entities/human.js';
import { CELL, vEdge, hEdge, hasLight, nodeDeg, isRoad, CURB } from '../world/citygen.js';

const bustCache = new Map();
function driverBust(look) {
  const key = look.shirt + look.skin + look.hair;
  if (!bustCache.has(key)) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.36, 4, 8), new THREE.MeshStandardMaterial({ color: look.jacket || look.shirt, roughness: 0.8 }));
    torso.position.y = 0.32; torso.scale.set(1.15, 1, 0.75); g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6 })); head.position.y = 0.78; head.scale.set(0.9, 1.1, 1); g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, 1.4), new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.8 })); hair.position.y = 0.8; g.add(hair);
    bustCache.set(key, g);
  }
  return bustCache.get(key).clone();
}
export function addBust(v, look) {
  const b = driverBust(look);
  b.position.set(0.38, v.T.belt - 0.55 - 0.05, -v.T.L * 0.04);
  v.inner.add(b); v.bust = b; v.driverLook = look;
  return b;
}

const LANE_O = [1.75, 5.25];
function neigh(k, m) {
  const r = [];
  if (vEdge(k, m)) r.push([k, m + 1]); if (vEdge(k, m - 1)) r.push([k, m - 1]);
  if (hEdge(k, m)) r.push([k + 1, m]); if (hEdge(k - 1, m)) r.push([k - 1, m]);
  return r;
}
function edgeType(a, b) { return a[0] === b[0] ? vEdge(a[0], Math.min(a[1], b[1])) : hEdge(Math.min(a[0], b[0]), a[1]); }

export class Traffic {
  constructor(game) {
    this.game = game; this.cars = []; this.hash = new SpatialHash(20); this._q = [];
    this.parked = []; this.spawnT = 0;
    this.world = { scene: G.scene, physics: G.physics };
  }
  segPoint(c, s, out) {
    const A = c.a, B = c.b, dx = B[0] - A[0], dz = B[1] - A[1], o = LANE_O[c.lane];
    out.set(A[0] * CELL + dx * (12 + s) - dz * o, 0, A[1] * CELL + dz * (12 + s) + dx * o);
    return out;
  }
  spawnCar(px, pz, minD = 70, maxD = 240) {
    const k0 = Math.round(px / CELL), m0 = Math.round(pz / CELL);
    for (let tries = 0; tries < 10; tries++) {
      const k = k0 + Math.floor(rand(-3, 3.99)), m = m0 + Math.floor(rand(-3, 3.99));
      const nb = neigh(k, m); if (!nb.length) continue;
      const b = pick(nb);
      const c = { a: [k, m], b, lane: chance(0.5) ? 0 : 1, s: rand(0, 70), speed: 0, turn: null };
      const p = this.segPoint(c, c.s, new THREE.Vector3());
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < minD || d > maxD) continue;
      if (this.game.peds.inView(p.x, p.z) && d < 120) continue;
      if (this.hash.query(p.x, p.z, 12, this._q).length) continue;
      const typ = edgeType(c.a, c.b);
      let type = pick(TRAFFIC_TYPES);
      if (type === 'bus' && typ !== 1) type = 'sedan';
      if (G.wanted === 0 && chance(0.03)) type = 'police';
      const v = new Vehicle(this.world, type);
      v.trafficC = c; c.v = v;
      c.limit = typ === 2 ? rand(24, 30) : typ === 3 ? rand(17, 21) : rand(11, 14.5);
      if (type === 'bus') c.limit = 10;
      c.speed = c.limit * 0.8;
      const look = randomLook(); addBust(v, look); v.driver = { npc: true, look };
      const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1];
      v.place(p.x, p.z, Math.atan2(dx, dz), 0);
      v.makeKinematic();
      this.cars.push(c); G.vehicles.add(v);
      return c;
    }
    return null;
  }
  release(v) {
    const c = v.trafficC; if (!c) return;
    v.trafficC = null;
    const i = this.cars.indexOf(c); if (i >= 0) this.cars.splice(i, 1);
    const pi = this.parked.indexOf(v); if (pi >= 0) this.parked.splice(pi, 1);
  }
  // collision from physics: wake traffic car into full dynamics
  bump(v, other) {
    if (!v.trafficC && v.mode !== 'kinematic') return;
    const vel = v.vel.clone();
    this.release(v);
    v.makeDynamic(vel);
    v.brake = 1; v.throttle = 0;
    G.state.stats.crashes++;
    // driver reaction
    if (v.driver && v.driver.npc) {
      const look = v.driver.look;
      setTimeout(() => {
        if (v.driver && v.driver.npc && !v.dead && G.player.car !== v) {
          const ped = this.game.peds.ejectDriver(v, other && other.driver);
          ped.h.endRagdoll(true); ped.state = chance(0.5) ? 'fight' : 'look'; ped.threat = other && other.driver && other.driver.isPlayer ? G.player : null; ped.lookAt = v.pos.clone(); ped.t = 5;
          ped.say(pick(['Ты что творишь?!', 'Моя машина!!!', 'Ну всё, вызываю полицию!', 'Куда ты смотрел?!']), 3, true);
        }
      }, 1500 + Math.random() * 1500);
    }
  }
  spawnParked(px, pz) {
    for (const s of G.city.parked) {
      if (s.taken) continue;
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d > 150 || d < 30) continue;
      if (this.game.peds.inView(s.x, s.z) && d < 90) continue;
      const type = s.police ? 'police' : s.show ? pick(['sport', 'super', 'muscle', 'suv']) : pick(['sedan', 'compact', 'suv', 'pickup', 'van', 'sedan', 'muscle']);
      const v = new Vehicle(this.world, type);
      v.place(s.x, s.z, s.rot, CURB);
      v.makeKinematic(); v.parked = s; s.taken = v; v.trafficC = null;
      if (s.show) v.locked = true;
      this.parked.push(v); G.vehicles.add(v);
      if (this.parked.length > 40) break;
    }
  }
  update(dt) {
    const pl = G.player, px = pl.x, pz = pl.z;
    this.hash.clear();
    for (const v of G.vehicles) this.hash.insert(v, v.pos.x, v.pos.z);
    this.spawnT -= dt;
    if (this.spawnT < 0 && !G.interior) {
      this.spawnT = 0.35;
      if (this.cars.length < this.game.q.cars) this.spawnCar(px, pz);
      if (Math.random() < 0.2) this.spawnParked(px, pz);
    }
    // despawn
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i], v = c.v;
      if (Math.hypot(v.pos.x - px, v.pos.z - pz) > 290) { this.cars.splice(i, 1); G.vehicles.delete(v); v.dispose(); }
    }
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const v = this.parked[i];
      if (Math.hypot(v.pos.x - px, v.pos.z - pz) > 220) { this.parked.splice(i, 1); if (v.parked) v.parked.taken = null; G.vehicles.delete(v); v.dispose(); }
    }
    for (const c of this.cars) this.drive(c, dt);
  }
  drive(c, dt) {
    const v = c.v;
    if (v.mode !== 'kinematic') return;
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1];
    const segLen = CELL - 24;
    let limit = c.limit;
    // traffic light / stop line
    let stopD = 1e9;
    if (!c.turn && hasLight(c.b[0], c.b[1])) {
      const sig = G.props.signal(dx === 0 ? 'NS' : 'EW');
      const toLine = segLen - c.s;
      if (sig === 0 || (sig === 1 && toLine > 9)) stopD = toLine;
    }
    // obstacles ahead (any vehicle, player, peds on road)
    const f = _v1.set(Math.sin(v.heading), 0, Math.cos(v.heading)), r = _v2.set(-f.z, 0, f.x);
    const look = 8 + c.speed * 1.6;
    let gap = 1e9, aheadSp = 0;
    for (const o of this.hash.query(v.pos.x + f.x * look * 0.5, v.pos.z + f.z * look * 0.5, look * 0.6 + 4, this._q)) {
      if (o === v || o.sunk) continue;
      const rx = o.pos.x - v.pos.x, rz = o.pos.z - v.pos.z, al = rx * f.x + rz * f.z, lat = Math.abs(rx * r.x + rz * r.z);
      if (al > 0 && al < look && lat < (o.T.W + v.T.W) / 2 + 0.25) { const g = al - (o.T.L + v.T.L) / 2; if (g < gap) { gap = g; aheadSp = Math.abs(o.speed || 0); } }
    }
    const pp = G.player.state === 'foot' ? G.player.pos : null;
    if (pp) { const rx = pp.x - v.pos.x, rz = pp.z - v.pos.z, al = rx * f.x + rz * f.z, lat = Math.abs(rx * r.x + rz * r.z); if (al > 0 && al < look && lat < 1.6) { const g = al - v.T.L / 2 - 0.6; if (g < gap) { gap = g; aheadSp = 0; c.blockT = (c.blockT || 0) + dt; } } }
    for (const p of this.game.peds.query(v.pos.x + f.x * 8, v.pos.z + f.z * 8, 10)) {
      if (p.dead && !p.h.ragdoll && !p.h.frozen) continue;
      const hp = p.h.ragdoll ? p.h.hipsPos() : p.h.pos;
      const rx = hp.x - v.pos.x, rz = hp.z - v.pos.z, al = rx * f.x + rz * f.z, lat = Math.abs(rx * r.x + rz * r.z);
      if (al > 0 && al < look && lat < 1.7) { const g = al - v.T.L / 2 - 0.8; if (g < gap) { gap = g; aheadSp = 0; } }
    }
    let vmax = limit;
    if (stopD < 1e8) vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 5 * (stopD - 0.5))));
    if (gap < 1e8) vmax = Math.min(vmax, Math.max(0, Math.min(aheadSp + (gap - 3) * 0.8, Math.sqrt(Math.max(0, 2 * 6 * (gap - 2.5))))));
    if (c.turn) vmax = Math.min(vmax, c.turn.straight ? limit : 7.5);
    const acc = vmax > c.speed ? 2.6 : 7;
    c.speed = Math.max(0, c.speed + clamp(vmax - c.speed, -acc * dt, acc * dt));
    v.braking = vmax < c.speed - 0.5 || (c.speed < 0.5 && vmax < 1);
    v.speed = c.speed;
    // honk when blocked by player
    if (c.blockT > 3) { c.blockT = 0; if (G.audio) G.audio._distHorn(v.pos.x, v.pos.z); if (chance(0.3)) this.game.peds.bubble({ h: { pos: v.pos, visible: true }, bubbleEl: null }, 'Уйди с дороги!', 2, true); }
    if (gap > 6) c.blockT = 0;
    // advance
    const step = c.speed * dt;
    const P = _v1;
    if (!c.turn) {
      c.s += step;
      if (c.s >= segLen) {
        // choose next edge
        const opts = neigh(c.b[0], c.b[1]).filter((n) => !(n[0] === c.a[0] && n[1] === c.a[1]));
        const nb = opts.length ? (Math.random() < 0.5 && opts.find((n) => n[0] - c.b[0] === dx && n[1] - c.b[1] === dz)) || pick(opts) : c.a;
        const dx2 = nb[0] - c.b[0], dz2 = nb[1] - c.b[1];
        const rightTurn = dx2 === -dz && dz2 === dx, straight = dx2 === dx && dz2 === dz;
        const lane2 = straight ? c.lane : rightTurn ? 1 : 0;
        const nc = { a: c.b, b: nb, lane: lane2 };
        const p0 = this.segPoint(c, segLen, new THREE.Vector3()), p2 = this.segPoint(nc, 0, new THREE.Vector3());
        const p1 = straight ? p0.clone().lerp(p2, 0.5) : p0.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), (p2.x - p0.x) * dx + (p2.z - p0.z) * dz);
        const len = straight ? p0.distanceTo(p2) : (p0.distanceTo(p1) + p1.distanceTo(p2)) * 0.82;
        c.turn = { p0, p1, p2, len, u: 0, nc, straight };
        c.lane = lane2;
      }
    }
    if (c.turn) {
      const T = c.turn; T.u += step / T.len;
      if (T.u >= 1) { c.a = T.nc.a; c.b = T.nc.b; c.lane = T.nc.lane; c.s = (T.u - 1) * T.len; c.turn = null; const t2 = edgeType(c.a, c.b); c.limit = t2 === 2 ? rand(24, 30) : t2 === 3 ? rand(17, 21) : v.typeId === 'bus' ? 10 : rand(11, 14.5); }
    }
    let hx, hz;
    if (c.turn) {
      const T = c.turn, u = T.u, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u;
      P.set(a * T.p0.x + b * T.p1.x + cc * T.p2.x, 0, a * T.p0.z + b * T.p1.z + cc * T.p2.z);
      hx = 2 * (1 - u) * (T.p1.x - T.p0.x) + 2 * u * (T.p2.x - T.p1.x); hz = 2 * (1 - u) * (T.p1.z - T.p0.z) + 2 * u * (T.p2.z - T.p1.z);
      v.steerAng = -clamp((Math.atan2(hx, hz) - v.heading), -0.5, 0.5);
    } else { this.segPoint(c, c.s, P); hx = c.b[0] - c.a[0]; hz = c.b[1] - c.a[1]; v.steerAng *= 0.9; }
    const hd = Math.atan2(hx, hz);
    let dh = hd - v.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    v.heading += dh * Math.min(1, dt * 10);
    v.pos.set(P.x, v.originH, P.z);
    v.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.heading);
    v.vel.set(Math.sin(v.heading) * c.speed, 0, Math.cos(v.heading) * c.speed);
    if (v.kb) { v.kb.setNextKinematicTranslation(v.pos); v.kb.setNextKinematicRotation(v.quat); }
  }
}
