import { clamp, lerp } from './noise.js';

export class BotDriver {
  constructor(veh, world, diff, idx) {
    this.v = veh; this.w = world; this.diff = diff; this.idx = idx; this.s = -1; this.offset = 0; this.offT = 0; this.mistake = 0; this.mType = 0; this.stuck = 0; this.rev = 0; this.aggr = 0.9 + Math.random() * 0.25; this.skill = diff.skill * (0.97 + Math.random() * 0.05); this.noise = 0;
    this.inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, digital: false };
  }
  update(dt, cars, player, active) {
    const v = this.v, w = this.w, inp = this.inp; const N = w.N;
    const L = w.locate(v.pos.x, v.pos.z, this.s >= 0 ? this.s : -1); this.s = L.s;
    inp.hold = !active; if (!active) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; return inp; }
    const spd = Math.max(0, v.speed);
    // mistakes
    if (this.mistake <= 0 && Math.random() < this.diff.mistakes * dt * 3) { this.mistake = 0.8 + Math.random() * 1.4; this.mType = Math.random() < 0.6 ? 1 : 2; }
    this.mistake -= dt;
    // traffic: find car ahead
    let wantOff = 0, slowFor = 1e9; const myT = v.raceDist || 0;
    for (const c of cars) {
      if (c === v) continue; const d = (c.raceDist || 0) - myT; if (d < -4 || d > 28) continue;
      const cl = w.locate(c.pos.x, c.pos.z, c.trackS >= 0 ? c.trackS : -1).lat; const myLat = L.lat; const dl = cl - myLat;
      if (Math.abs(dl) < 2.4 && d > 0) { // blocked
        const room = w.hw - 1.6; const left = cl + 3 < room ? 1 : 0, right = cl - 3 > -room ? 1 : 0;
        wantOff = (left && (!right || this.idx % 2)) ? cl + 3.2 - w.RL[L.s] : right ? cl - 3.2 - w.RL[L.s] : 0;
        if (d < 12 && c.speed < v.speed) slowFor = Math.min(slowFor, c.speed + d * 0.6);
      }
    }
    this.offset = lerp(this.offset, wantOff, Math.min(1, dt * (wantOff ? 1.2 : 0.5)));
    // steering: pure pursuit on racing line
    const la = 7 + spd * 0.5; const st = (L.s + Math.round(la / w.ds)) % N;
    let lat = clamp(w.RL[st] + this.offset, -w.hw + 1.4, w.hw - 1.4);
    const tx = w.X[st] + w.TZ[st] * lat, tz = w.Z[st] - w.TX[st] * lat;
    const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw); const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy; const wb = v.p.wheels[0][1] - v.p.wheels[2][1];
    let delta = Math.atan2(2 * wb * lx, lx * lx + lz * lz); delta -= v.yawRate * 0.02;
    if (this.mistake > 0 && this.mType === 2) delta += Math.sin(performance.now() * 0.004 + this.idx) * 0.05;
    inp.steer = clamp(delta / (v.p.maxSteer / (1 + spd * 0.035)), -1, 1);
    // speed planning
    const mu = v.p.grip * (v.p.tires.mu.asphalt) * (1 - (w.wet || 0) * 0.25) * this.skill;
    const dec = 7.5 * mu * v.p.brakeT / (v.p.mass * 9.81 * v.p.R * 1.05) ;
    let target = v.car.vmax / 3.6 * 1.1; const scan = Math.min(N, Math.round((spd * spd / (2 * dec) + 40) / w.ds));
    for (let k = 0; k < scan; k += 3) { const i = (L.s + k) % N; const kap = Math.max(w.RK[i], 1e-4); const vm = Math.sqrt(mu * 9.81 * 1.05 / kap) * (1 + v.p.ClA * 0.04); const allowed = Math.sqrt(vm * vm + 2 * dec * k * w.ds); if (allowed < target) target = allowed; }
    if (this.mistake > 0 && this.mType === 1) target *= 1.13;
    target = Math.min(target, slowFor);
    // rubber band vs player
    if (player && player.raceDist !== undefined) { const gap = (v.raceDist || 0) - player.raceDist; target *= clamp(1 - gap * 0.00012, 0.94, 1.05); }
    const err = target - spd;
    if (err > 0) { inp.throttle = clamp(err * 0.35 + 0.55, 0, 1) * (Math.abs(inp.steer) > 0.85 ? 0.7 : 1); inp.brake = 0; }
    else { inp.throttle = err > -1.5 ? 0.15 : 0; inp.brake = clamp(-err * 0.18, 0, 1); }
    // off-track recovery / stuck
    if (Math.abs(L.lat) > w.hw + 3) inp.throttle *= 0.7;
    if (spd < 2 && v.raceActive) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
    if (this.stuck > 2.5 && this.stuck < 4) { inp.throttle = 0; inp.brake = 1; inp.steer = -inp.steer; }
    if (this.stuck > 6) { this.stuck = 0; this.needsReset = true; }
    return inp;
  }
}
