import * as THREE from 'three';
import { PERF, TIRES } from './data.js';
import { SURF } from './world.js';
import { clamp, lerp } from './noise.js';

const G = 9.81, RHO = 1.225;
const SURF_KEYS = ['asphalt', 'dirt', 'grass', 'sand', 'dirt'];
const ROLL_RES = [0.013, 0.03, 0.045, 0.09, 0.03];

// Derive full physical parameter set from car + tuning
export function carParams(car, t) {
  const e = k => PERF[k].eff[t[k] || 0];
  const mass = car.mass * (1 - e('weight'));
  const turboMax = car.turbo * 0.25 + e('turbo');
  const power = car.hp * 745.7 * (1 + e('engine')) * (1 + e('turbo') * 0.7);
  const nm = car.nm * (1 + e('engine') * 0.9);
  const redline = car.redline, ws = car.body.wheel, R = 0.36 * ws;
  const n = car.gears; const gears = [];
  if (car.ev) gears.push(1); else { const g1 = n >= 9 ? 4.7 : n >= 8 ? 4.2 : 3.4, gn = n >= 8 ? 0.64 : 0.78; for (let i = 0; i < n; i++) gears.push(g1 * Math.pow(gn / g1, i / (n - 1))); }
  const vmax = car.vmax / 3.6 * (1 + e('engine') * 0.12 + e('turbo') * 0.08);
  const fd = (redline * 2 * Math.PI / 60 * R) / (gears[n - 1 > 0 ? n - 1 : 0] * vmax * 1.03) * (t.finalDrive || 1);
  const CdA = 2 * 0.9 * (car.hp * 745.7) / (RHO * Math.pow(car.vmax / 3.6, 3));
  const k = (t.spoiler === 'gt' ? 0.35 : t.spoiler === 'swan' ? 0.45 : t.spoiler === 'ducktail' ? 0.12 : t.spoiler === 'lip' ? 0.06 : 0) + (t.front === 'canards' ? 0.15 : t.front === 'splitter' ? 0.08 : 0) + (car.cls === 'hyper' ? 0.5 : car.cls === 'super' ? 0.3 : 0.1);
  const susp = e('suspension'); const fz = 1.45 + susp * 1.6; const stiff = (t.stiffness || 1);
  const kSpring = mass * Math.pow(2 * Math.PI * fz * stiff, 2) / 4;
  const wide = t.widebody === 'flares' ? 1.05 : 1;
  const a = 1.16 * car.body.L, b = 1.49 * car.body.L; const cogShift = car.drive === 'FWD' ? 0.12 : car.cls === 'super' || car.cls === 'hyper' ? -0.22 : -0.05;
  return {
    mass, power, nm, redline, idle: car.ev ? 0 : 900, gears, fd, R, Iw: 1.1 * ws * ws, CdA: CdA * (1 + k * 0.08), ClA: k, turboMax, spool: car.turbo > 0.8 ? 1.4 : 2.4, ev: !!car.ev,
    drive: car.drive, awdFront: car.drive === 'AWD' ? (car.cls === 'offroad' ? 0.5 : 0.38) : 0,
    brakeT: mass * G * R * 1.05 * car.brake * (1 + e('brakes')), bias: t.brakeBias || 0.62,
    k: kSpring, c: 2 * 0.42 * Math.sqrt(kSpring * mass / 4), maxLen: 0.28 + car.body.ride * 0.4, armR: (0.5 + susp * 0.7) * mass * 9,
    grip: car.grip * (1 + susp * 0.06), tires: TIRES[t.tires] || TIRES.street,
    wheels: [[0.84 * car.body.W * wide, a - cogShift], [-0.84 * car.body.W * wide, a - cogShift], [0.82 * car.body.W * wide, -b - cogShift], [-0.82 * car.body.W * wide, -b - cogShift]],
    h: (0.45 * car.body.H + car.body.ride + (t.ride || 0) * 0.1) * 1.0, shiftTime: 0.32 * (1 - e('transmission') * 0.75), halfL: 2.25 * car.body.L, halfW: 0.98 * car.body.W * wide,
    maxSteer: car.cls === 'offroad' ? 0.6 : 0.56,
  };
}

export class Vehicle {
  constructor(car, tune, world) {
    this.car = car; this.world = world; this.setTune(tune);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.yawRate = 0; this.pitch = 0; this.roll = 0; this.pr = 0; this.rr = 0; this.vy = 0;
    this.wheels = [0, 1, 2, 3].map(i => ({ w: 0, c: 0, cPrev: 0, Fz: 0, slip: 0, slipL: 0, steer: 0, dSpin: 0, vis: 0, surf: 0, contact: false, lock: false, wx: 0, wz: 0, gy: 0, road: true }));
    this.gear = 1; this.rpm = 900; this.boost = 0; this.shiftT = 0; this.steer = 0; this.thr = 0; this.brk = 0; this.revT = 0; this.damage = 0; this.speed = 0; this.trackS = -1;
    this.abs = true; this.tcs = true; this.esp = true; this.auto = true; this.flags = { abs: false, tcs: false, esp: false }; this.events = []; this.airT = 0; this.g = {}; this.blowoff = 0; this.backfire = 0; this.upTimer = 0;
  }
  setTune(t) { this.tune = t; this.p = carParams(this.car, t); }
  place(x, y, z, yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.vel.set(0, 0, 0); this.yawRate = 0; this.pitch = this.roll = this.pr = this.rr = this.vy = 0; this.gear = 1; for (const w of this.wheels) { w.w = 0; w.c = w.cPrev = this.p.mass * G / 4 / this.p.k; } this.pos.y = y; this.settle(); }
  settle() { const g = this.world.ground(this.pos.x, this.pos.z, this.g); this.pos.y = g.h; }
  torqueAt(rpm) {
    const p = this.p; if (p.ev) { const w = Math.max(1, rpm * Math.PI / 30); return Math.min(p.nm, p.power / w); }
    const rT = p.redline * 0.55, rP = p.redline * 0.88; const TP = p.power / (rP * Math.PI / 30); const peak = Math.max(p.nm, TP * 1.08);
    if (rpm < rT) return lerp(peak * 0.62, peak, clamp((rpm - p.idle) / (rT - p.idle), 0, 1));
    if (rpm < rP) return lerp(peak, TP, (rpm - rT) / (rP - rT));
    return lerp(TP, TP * 0.88, clamp((rpm - rP) / (p.redline - rP), 0, 1));
  }
  step(dt, inp) {
    const p = this.p, W = this.wheels; this.events.length = 0;
    // inputs smoothing
    const vF0 = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    const spd = Math.abs(vF0); const steerLim = p.maxSteer * (1 / (1 + spd * 0.035));
    const target = clamp(inp.steer, -1, 1) * steerLim; const rate = inp.digital ? 2.2 : 6;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
    let thr = inp.throttle, brk = inp.brake;
    // auto reverse logic
    if (this.auto || true) {
      if (inp.hold) { this.revT = 0; if (this.gear < 1) this.gear = 1; brk = 1; thr = 0; } else if (this.gear > 0 && spd < 1.0 && brk > 0.3 && thr < 0.1) { this.revT += dt; if (this.revT > 0.35) { this.gear = -1; this.revT = 0; } } else if (this.gear === -1 && spd < 1.0 && thr > 0.3 && brk < 0.1) { this.gear = 1; } else this.revT = 0;
      if (this.gear === -1) { const t = thr; thr = brk; brk = t; }
    }
    if (!this.auto && inp.shiftUp && this.shiftT <= 0) { if (this.gear === -1) this.gear = 1; else if (this.gear < p.gears.length) { this.gear++; this.shiftT = p.shiftTime; this.events.push('shift'); } }
    if (!this.auto && inp.shiftDown && this.shiftT <= 0) { if (this.gear > 1) { this.gear--; this.shiftT = p.shiftTime * 0.7; this.events.push('shift'); this.backfire = 0.3; } }
    this.thr = thr; this.brk = brk; this.shiftT -= dt;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let vF = this.vel.x * sy + this.vel.z * cy, vL = this.vel.x * cy - this.vel.z * sy; this.speed = vF;
    // drivetrain
    const ratio = (this.gear === -1 ? -3.3 : p.gears[this.gear - 1]) * p.fd;
    const driven = p.drive === 'FWD' ? [0, 1] : p.drive === 'RWD' ? [2, 3] : [0, 1, 2, 3];
    let wAvg = 0; for (const i of driven) wAvg += W[i].w; wAvg /= driven.length;
    let wheelRpm = Math.abs(wAvg * ratio) * 30 / Math.PI;
    const launch = p.idle + thr * (p.ev ? 0 : Math.min(3500, p.redline * 0.45));
    let rpm = Math.max(wheelRpm, launch); if (rpm < p.idle) rpm = p.idle; rpm = Math.min(rpm, p.redline * 1.02);
    this.rpm = lerp(this.rpm, rpm, Math.min(1, dt * 18));
    // turbo
    const tgtB = p.turboMax > 0 ? thr * clamp(this.rpm / (p.redline * 0.42), 0, 1) : 0;
    if (this.boost > 0.55 && thr < 0.2 && tgtB < 0.2) this.blowoff = 1;
    this.boost += (tgtB - this.boost) * Math.min(1, dt * p.spool * (tgtB > this.boost ? 1 : 3));
    let Te = this.torqueAt(this.rpm) * thr * (1 + p.turboMax * this.boost) * (1 - this.damage * 0.12);
    if (this.rpm >= p.redline * 0.995) Te = 0;
    if (thr < 0.05 && !p.ev) Te = -0.12 * p.nm * (this.rpm / p.redline);
    if (this.shiftT > 0) Te *= 0.1;
    // TCS
    let tcsF = 1; this.flags.tcs = false;
    if (this.tcs) { let maxS = 0; for (const i of driven) maxS = Math.max(maxS, W[i].slip); if (maxS > 0.14 && thr > 0.1) { tcsF = clamp(1 - (maxS - 0.14) * 4, 0.2, 1); this.flags.tcs = true; } }
    const Tdrive = Te * ratio * 0.88 * tcsF;
    // ESP
    this.flags.esp = false; let espBrake = [0, 0, 0, 0];
    if (this.esp && Math.abs(vF) > 8) { const L = p.wheels[0][1] - p.wheels[2][1]; const rExp = vF * Math.tan(this.steer) / L; const err = this.yawRate - rExp; if (Math.abs(err) > 0.22 && Math.abs(this.yawRate) > Math.abs(rExp)) { const outerFront = this.yawRate > 0 ? 1 : 0; espBrake[outerFront] = Math.min(1, (Math.abs(err) - 0.22) * 2.5) * 0.5; Te *= 0.6; this.flags.esp = true; } }
    // ground & suspension
    let Fx = 0, Fz = 0, tq = 0, sumFz = 0, sumFF = 0, sumFL = 0, pitchM = 0, rollM = 0, contacts = 0;
    const L = p.wheels[0][1] - p.wheels[2][1], T = p.wheels[0][0] - p.wheels[1][0];
    const down = 0.5 * RHO * p.ClA * vF * vF;
    const gnd = this.g; let nx = 0, nz = 0, ny = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i], [xi, zi] = p.wheels[i];
      const wx = this.pos.x + xi * cy + zi * sy, wz = this.pos.z - xi * sy + zi * cy;
      this.world.ground(wx, wz, gnd); w.wx = wx; w.wz = wz; w.gy = gnd.h; w.surf = gnd.surf; w.road = gnd.road; if (i === 0) this.trackS = gnd.s;
      const hp = this.pos.y + p.R + p.maxLen - (p.mass * G / 4 / p.k) + zi * this.pitch + xi * this.roll;
      const len = hp - (gnd.h + p.R);
      let c = p.maxLen - len; w.contact = c > 0;
      if (c < 0) c = 0; let F = 0;
      if (w.contact) { F = p.k * c + p.c * (c - w.cPrev) / dt; if (c > p.maxLen * 0.85) F += (c - p.maxLen * 0.85) * p.k * 8; if (F < 0) F = 0; contacts++; }
      w.cPrev = c; w.c = c; w.Fz = F; sumFz += F; pitchM += zi * F; rollM += xi * F;
      w.vis = w.contact ? gnd.h + p.R - this.pos.y - p.R : (hp - p.maxLen) - this.pos.y - p.R;
    }
    // anti-roll bars
    const arF = (W[0].c - W[1].c) * p.armR, arR = (W[2].c - W[3].c) * p.armR;
    rollM -= (arF * T / 2 + arR * T / 2) * 0.5;
    // tires
    const fzStatic = p.mass * G / 4;
    for (let i = 0; i < 4; i++) {
      const w = W[i], [xi, zi] = p.wheels[i]; w.dSpin = 0;
      if (!w.contact) { w.slip = 0; w.slipL = 0; let td = 0; if (driven.includes(i)) td = Tdrive / driven.length; w.w += (td / p.Iw) * dt; w.w *= 0.995; w.dSpin = w.w * dt; continue; }
      const front = i < 2; const fzT = w.Fz + down * (front ? 0.45 : 0.55) / 2;
      const delta = front ? this.steer * (1 + (xi * this.steer > 0 ? 0.08 : -0.06)) : 0; w.steer = delta;
      const sd = Math.sin(delta), cd = Math.cos(delta);
      const vFi = vF - this.yawRate * xi, vLi = vL + this.yawRate * zi;
      const vLong = vLi * sd + vFi * cd, vLat = vLi * cd - vFi * sd;
      const surfMu = p.tires.mu[this.world.wet > 0.3 && w.surf === SURF.ASPHALT ? 'wet' : SURF_KEYS[w.surf]] ?? 0.9;
      const wetK = w.surf === SURF.ASPHALT ? lerp(1, p.tires.mu.wet / p.tires.mu.asphalt, this.world.wet || 0) : 1;
      const mu = p.grip * surfMu * (w.surf === SURF.ASPHALT ? wetK : 1) * (1 - 0.12 * (fzT / fzStatic - 1));
      const muFz = Math.max(0, mu * fzT);
      const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.5));
      let Fy = -muFz * Math.sin(1.45 * Math.atan(9 * alpha));
      // drive / brake torque on this wheel
      let td = 0; if (driven.includes(i)) { let share = p.drive === 'AWD' ? (front ? p.awdFront : 1 - p.awdFront) / 2 : 0.5; td = Tdrive * share; const axleAvg = (W[front ? 0 : 2].w + W[front ? 1 : 3].w) / 2; td -= (w.w - axleAvg) * 60; }
      let tb = brk * p.brakeT * (front ? p.bias : 1 - p.bias) / 2 + espBrake[i] * p.brakeT * 0.3;
      if (!front && inp.handbrake) tb += p.brakeT * 0.9;
      if (this.abs && brk > 0.1 && w.slip < -0.12 && !(inp.handbrake && !front)) { tb *= 0.35; this.flags.abs = true; }
      const den = Math.max(Math.abs(vLong), 2.5);
      const fx = om => muFz * Math.sin(1.65 * Math.atan(11 * clamp((om * p.R - vLong) / den, -3, 3)));
      const F0 = fx(w.w), kk = Math.max(0, (fx(w.w + 0.05) - F0) / 0.05);
      let wn = (w.w + dt / p.Iw * (td - p.R * F0 + p.R * kk * w.w)) / (1 + dt * p.R * kk / p.Iw);
      const dB = dt * tb / p.Iw; if (Math.abs(wn) <= dB) wn = 0; else wn -= Math.sign(wn) * dB;
      w.lock = wn === 0 && Math.abs(vLong) > 2;
      w.w = wn; w.dSpin = wn * dt;
      let Fl = fx(wn);
      const tot = Math.hypot(Fl, Fy); if (tot > muFz && tot > 0) { const s = muFz / tot; Fl *= s; Fy *= s; }
      // rolling resistance
      Fl -= Math.sign(vLong) * Math.min(Math.abs(vLong) * 400, ROLL_RES[w.surf] * fzT);
      w.slip = (wn * p.R - vLong) / den; w.slipL = Math.abs(alpha); w.slipV = Math.hypot(wn * p.R - vLong, vLat);
      const FL = Fl * sd + Fy * cd, FF = Fl * cd - Fy * sd;
      sumFL += FL; sumFF += FF; tq += zi * FL - xi * FF;
    }
    if (brk < 0.1) this.flags.abs = false;
    // aero drag
    const drag = 0.5 * RHO * p.CdA * vF * Math.abs(vF); sumFF -= drag; const dragL = 0.5 * RHO * p.CdA * 2 * vL * Math.abs(vL); sumFL -= dragL;
    // slope gravity (use average ground normal approx)
    if (contacts > 0) { const d = 1.0; const hF = (W[0].gy + W[1].gy) / 2, hR = (W[2].gy + W[3].gy) / 2, hLf = (W[0].gy + W[2].gy) / 2, hRt = (W[1].gy + W[3].gy) / 2; const gx = (hF - hR) / L, gl = (hLf - hRt) / T; sumFF -= p.mass * G * gx * 0.98 * Math.min(1, contacts / 2); sumFL -= p.mass * G * gl * 0.98 * Math.min(1, contacts / 2); }
    // integrate planar
    const aF = sumFF / p.mass, aL = sumFL / p.mass;
    this.vel.x += (aF * sy + aL * cy) * dt; this.vel.z += (aF * cy - aL * sy) * dt;
    const Iz = p.mass * 1.15; this.yawRate += tq / Iz * dt; if (contacts === 0) this.yawRate *= 0.995;
    // low speed hold
    if (brk > 0.5 && Math.hypot(this.vel.x, this.vel.z) < 0.6 && contacts > 2) { this.vel.x *= 0.8; this.vel.z *= 0.8; this.yawRate *= 0.8; }
    this.yaw += this.yawRate * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    // vertical / pitch / roll
    const ay = (sumFz - down) / p.mass - G; this.vy += ay * dt; this.pos.y += this.vy * dt;
    const Ip = p.mass * 1.3, Ir = p.mass * 0.42;
    this.pr += ((pitchM + p.h * sumFF * 0.85) / Ip) * dt; this.rr += ((rollM + p.h * sumFL * 0.85) / Ir) * dt;
    if (contacts === 0) { this.pr *= 0.99; this.rr *= 0.99; this.airT += dt; } else this.airT = 0;
    this.pitch += this.pr * dt; this.roll += this.rr * dt; this.pitch = clamp(this.pitch, -0.5, 0.5); this.roll = clamp(this.roll, -0.5, 0.5);
    // safety: never sink below ground
    const gc = this.world.ground(this.pos.x, this.pos.z, gnd).h; if (this.pos.y < gc - 0.3) { this.pos.y = gc - 0.3; if (this.vy < 0) this.vy = 0; }
    // auto gearbox
    if (this.auto && this.gear > 0 && this.shiftT <= 0 && !p.ev) {
      const n = p.gears.length; const curR = this.rpm; this.upTimer -= dt;
      if (curR > p.redline * 0.93 && this.gear < n && thr > 0.2 && W.some(w => w.contact)) { this.gear++; this.shiftT = p.shiftTime; this.events.push('shift'); this.upTimer = 0.8; }
      else if (this.gear > 1 && this.upTimer <= 0) { const lower = Math.abs(wAvg * p.gears[this.gear - 2] * p.fd) * 30 / Math.PI; if (lower < p.redline * (thr > 0.6 ? 0.82 : 0.62)) { this.gear--; this.shiftT = p.shiftTime * 0.6; this.events.push('shift'); if (thr < 0.2) this.backfire = 0.25; } }
    }
    this.backfire = Math.max(0, this.backfire - dt);
  }
  // collisions against track barriers
  collideTrack() {
    const w = this.world, p = this.p; if (this.trackS < 0) return 0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); let hit = 0;
    const L = w.locate(this.pos.x, this.pos.z, this.trackS); const lim = w.barrier(L.s); if (lim === Infinity) return 0;
    const lx = w.TZ[L.s], lz = -w.TX[L.s];
    let maxPen = 0, side = 0, cpx = 0, cpz = 0;
    for (const [cx, cz] of [[p.halfW, p.halfL], [-p.halfW, p.halfL], [p.halfW, -p.halfL], [-p.halfW, -p.halfL]]) {
      const x = this.pos.x + cx * cy + cz * sy, z = this.pos.z - cx * sy + cz * cy; const lat = (x - w.X[L.s]) * lx + (z - w.Z[L.s]) * lz;
      const pen = Math.abs(lat) - lim; if (pen > maxPen && Math.sign(lat) === Math.sign(L.lat || lat)) { maxPen = pen; side = Math.sign(lat); cpx = cx; cpz = cz; }
    }
    if (maxPen > 0 && maxPen < 6) {
      const nxw = lx * side, nzw = lz * side; this.pos.x -= nxw * maxPen; this.pos.z -= nzw * maxPen;
      const vn = this.vel.x * nxw + this.vel.z * nzw;
      if (vn > 0) { const e = 0.25; this.vel.x -= (1 + e) * vn * nxw; this.vel.z -= (1 + e) * vn * nzw; const tx = -nzw, tz = nxw; const vt = this.vel.x * tx + this.vel.z * tz; const fr = Math.min(Math.abs(vt), vn * 0.4) * Math.sign(vt); this.vel.x -= tx * fr; this.vel.z -= tz * fr;
        this.yawRate += (cpz > 0 ? -1 : 1) * side * vn * 0.04 * (cpx === 0 ? 0 : 1); hit = vn; this.lastHit = { local: new THREE.Vector3(cpx, 0.5, cpz), dir: new THREE.Vector3(-side, 0, 0), v: vn }; }
    }
    return hit;
  }
  collideProps(grid) {
    const p = this.p; const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw); let hit = 0; const list = grid.query(this.pos.x, this.pos.z); if (!list) return 0;
    for (const k of [-1, 0, 1]) {
      const cz = k * p.halfL * 0.62, cr = p.halfW * 0.98; const x = this.pos.x + cz * sy, z = this.pos.z + cz * cy;
      for (const c of list) {
        let dx, dz, d, pen;
        if (c.box) { const ca = Math.cos(c.rot), sa = Math.sin(c.rot); const lx = (x - c.x) * ca - (z - c.z) * sa, lz = (x - c.x) * sa + (z - c.z) * ca; const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd); let ddx = lx - qx, ddz = lz - qz; d = Math.hypot(ddx, ddz); if (d >= cr) continue; if (d < 1e-4) { ddx = 1; ddz = 0; d = 1e-4; } const wx = ddx * ca + ddz * sa, wz = -ddx * sa + ddz * ca; dx = wx; dz = wz; pen = cr - d; }
        else { dx = x - c.x; dz = z - c.z; d = Math.hypot(dx, dz); pen = cr + c.r - d; if (pen <= 0) continue; }
        const nl = Math.hypot(dx, dz) || 1; const nx = dx / nl, nz = dz / nl; this.pos.x += nx * pen; this.pos.z += nz * pen;
        const vn = this.vel.x * nx + this.vel.z * nz; if (vn < 0) { this.vel.x -= 1.3 * vn * nx; this.vel.z -= 1.3 * vn * nz; this.vel.multiplyScalar(0.85); this.yawRate += k * -vn * 0.05; hit = Math.max(hit, -vn); this.lastHit = { local: new THREE.Vector3(0, 0.5, cz + Math.sign(cz || 1) * 0.6 * Math.abs(k)), dir: new THREE.Vector3(-(nx * cy - nz * sy), 0, -(nx * sy + nz * cy)), v: -vn }; }
      }
    }
    return hit;
  }
}

export function collideCars(a, b) {
  const dx0 = b.pos.x - a.pos.x, dz0 = b.pos.z - a.pos.z; if (dx0 * dx0 + dz0 * dz0 > 49) return 0; let hit = 0;
  const pts = v => { const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw); return [-1, 0, 1].map(k => [v.pos.x + k * v.p.halfL * 0.62 * sy, v.pos.z + k * v.p.halfL * 0.62 * cy, k]); };
  const A = pts(a), B = pts(b);
  for (const pa of A) for (const pb of B) {
    const r = a.p.halfW + b.p.halfW; let dx = pb[0] - pa[0], dz = pb[1] - pa[1]; const d = Math.hypot(dx, dz); if (d >= r || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, pen = r - d; const ma = a.p.mass, mb = b.p.mass, tot = ma + mb;
    a.pos.x -= nx * pen * mb / tot; a.pos.z -= nz * pen * mb / tot; b.pos.x += nx * pen * ma / tot; b.pos.z += nz * pen * ma / tot;
    const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz; if (rv >= 0) continue;
    const j = -(1.3) * rv / (1 / ma + 1 / mb); a.vel.x -= j * nx / ma; a.vel.z -= j * nz / ma; b.vel.x += j * nx / mb; b.vel.z += j * nz / mb;
    a.yawRate += pa[2] * 0.15 * (-rv) * 0.1 * (Math.random() - 0.5) * 2; b.yawRate += pb[2] * 0.15 * (-rv) * 0.1 * (Math.random() - 0.5) * 2;
    hit = Math.max(hit, -rv);
    const lh = (v, sgn, k) => { const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw); const lx = sgn * (nx * cy - nz * sy), lz = sgn * (nx * sy + nz * cy); v.lastHit = { local: new THREE.Vector3(lx * v.p.halfW, 0.5, k * v.p.halfL * 0.62 + lz * 0.5), dir: new THREE.Vector3(-lx, 0, -lz), v: -rv }; v.hitCar = 1; };
    lh(a, 1, pa[2]); lh(b, -1, pb[2]);
  }
  return hit;
}

export class SpatialGrid {
  constructor(items, cell = 24) { this.cell = cell; this.map = new Map(); for (const it of items) { const r = it.box ? Math.max(it.hw, it.hd) * 1.42 : it.r; const x0 = Math.floor((it.x - r - 3) / cell), x1 = Math.floor((it.x + r + 3) / cell), z0 = Math.floor((it.z - r - 3) / cell), z1 = Math.floor((it.z + r + 3) / cell); for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = i * 73856 + j; let l = this.map.get(k); if (!l) this.map.set(k, l = []); l.push(it); } } }
  query(x, z) { return this.map.get(Math.floor(x / this.cell) * 73856 + Math.floor(z / this.cell)); }
}
