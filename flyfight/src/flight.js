import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const FWD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0), LEFT = new THREE.Vector3(1, 0, 0);
const tq = new THREE.Quaternion(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3();
export const G = 9.81;

export class Flight {
  constructor(stats) {
    this.st = stats;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(0, 0, 200); this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3(); this.thr = 0.7; this.ab = 0; this.G = 1; this.speed = 200; this.aoa = 0; this.stall = 0;
    this.engine = 1; this.ctrlEff = 1; this.vmax = stats.speed * 0.56; this.gMax = stats.tvc ? 11.5 : 10.5;
    this.f = new THREE.Vector3(); this.up = new THREE.Vector3(); this.left = new THREE.Vector3();
    this.prevVel = new THREE.Vector3(); this.assist = false;
  }
  axes() { this.f.copy(FWD).applyQuaternion(this.q); this.up.copy(UP).applyQuaternion(this.q); this.left.copy(LEFT).applyQuaternion(this.q); }
  place(p, dir, speed) { this.pos.copy(p); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), UP); this.q.setFromRotationMatrix(m); this.vel.copy(dir).normalize().multiplyScalar(speed); this.axes(); this.speed = speed; this.w.set(0, 0, 0); }
  bank() { this.axes(); return Math.atan2(-this.left.y, this.up.y); } // + = right wing down
  pitchAngle() { return Math.asin(clamp(this.f.y, -1, 1)); }
  heading() { return Math.atan2(this.f.x, this.f.z); }
  step(dt, c) {
    const st = this.st; this.axes();
    const alt = Math.max(this.pos.y, 0); const rho = Math.exp(-alt / 9500);
    let speed = this.vel.length(); if (speed < 1) { this.vel.copy(this.f); speed = 1; }
    const vDir = tv.copy(this.vel).divideScalar(speed);
    const qbar = (speed / 170) ** 2 * (0.25 + 0.75 * rho);
    const eff = clamp(qbar, 0.12, 1.25) * this.ctrlEff;
    // throttle / afterburner
    const tgtThr = clamp(c.throttle, 0, 1);
    this.thr = lerp(this.thr, tgtThr, 1 - Math.exp(-dt * 1.6));
    this.ab = lerp(this.ab, c.ab && this.thr > 0.9 ? 1 : 0, 1 - Math.exp(-dt * 3));
    // assist: auto-level
    let roll = c.roll, pitch = c.pitch;
    if (this.assist && Math.abs(roll) < 0.08) { const b = this.bank(); if (Math.abs(b) < 1.3 && Math.abs(this.f.y) < 0.8) roll += clamp(-b * 0.9, -0.5, 0.5); }
    // angular rate targets (local: x pitch(neg=up), y yaw(neg=right), z roll(pos=right))
    let pLim = Math.min(st.pitch * clamp(eff * 1.15, 0.28, 1), this.gMax * G / Math.max(speed, 50));
    if (st.tvc && speed < 200) pLim = Math.max(pLim, 0.95 * (this.ctrlEff));
    if (pitch < 0) pLim *= 0.7;
    const tx = -pitch * pLim, tz = roll * st.roll * clamp(eff, 0.3, 1), ty = -c.yaw * st.yaw * clamp(eff, 0.35, 1);
    const k = 1 - Math.exp(-dt * 6);
    this.w.x += (tx - this.w.x) * k; this.w.y += (ty - this.w.y) * k; this.w.z += (tz - this.w.z) * k;
    // integrate orientation (local)
    const ang = this.w.length() * dt;
    if (ang > 1e-7) { tq.setFromAxisAngle(tv2.copy(this.w).normalize(), ang); this.q.multiply(tq); }
    // weathervane / stall: nose follows velocity when slow
    this.aoa = Math.acos(clamp(vDir.dot(this.f), -1, 1));
    this.stall = clamp((95 - speed) / 40, 0, 1) * (st.tvc ? 0.5 : 1);
    const vane = (0.25 + this.stall * 2.2) * dt;
    if (this.aoa > 0.02) {
      tv3.crossVectors(this.f, vDir); const l = tv3.length();
      if (l > 1e-5) { tq.setFromAxisAngle(tv3.divideScalar(l), Math.min(this.aoa, this.aoa * vane)); this.q.premultiply(tq); }
    }
    const maxAoa = st.tvc ? 1.2 : 0.5;
    if (this.aoa > maxAoa) { tv3.crossVectors(this.f, vDir).normalize(); tq.setFromAxisAngle(tv3, (this.aoa - maxAoa) * Math.min(1, dt * 8)); this.q.premultiply(tq); }
    this.q.normalize(); this.axes();
    // lift: rotate velocity toward the nose
    this.prevVel.copy(this.vel);
    const a2 = Math.acos(clamp(vDir.dot(this.f), -1, 1));
    if (a2 > 1e-4) {
      const liftRate = 3.6 * clamp(qbar, 0.05, 1.4);
      const turn = Math.min(a2, a2 * (1 - Math.exp(-liftRate * dt)));
      tv3.crossVectors(vDir, this.f).normalize(); tq.setFromAxisAngle(tv3, turn); vDir.applyQuaternion(tq);
    }
    // forces along path
    const thrust = (this.thr * 10.5 + this.ab * 8.0) * st.thrust * (0.4 + 0.6 * rho) * this.engine;
    const cd = 18.5 * st.thrust / (this.vmax * this.vmax);
    const drag = cd * speed * speed * (0.35 + 0.65 * rho) + speed * speed * 0.00042 * Math.sin(this.aoa) * 3.2 + (c.brake ? speed * 0.25 : 0);
    let ns = speed + (thrust * vDir.dot(this.f) - drag) * dt;
    ns = Math.max(ns, 5);
    this.vel.copy(vDir).multiplyScalar(ns);
    this.vel.y -= G * dt * (1 - clamp(qbar, 0, 1) * 0.0);
    // small gravity compensation when level and fast (lift)
    const liftUp = clamp(qbar, 0, 1) * Math.max(0, this.up.y) * G * 0.92;
    this.vel.addScaledVector(this.up, liftUp * dt);
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    // G load
    const acc = tv2.subVectors(this.vel, this.prevVel).divideScalar(Math.max(dt, 1e-4)); acc.y += G;
    const g = acc.dot(this.up) / G; this.G = lerp(this.G, g, 1 - Math.exp(-dt * 8));
  }
}
