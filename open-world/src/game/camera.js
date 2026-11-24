// Third-person camera: orbit, over-the-shoulder aim, vehicle chase with speed FOV, collision, cinematic shots
import * as THREE from 'three';
import { G, clamp, lerp, damp, angDiff, wrapAng, _v1, _v2 } from '../core/util.js';
import { settings } from '../core/save.js';
import { I } from '../core/input.js';
import { GR } from '../core/physics.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera; this.yaw = Math.PI; this.pitch = 0.18; this.dist = 4; this.idle = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.kickV = 0; this.shake = 0;
    this.mode = 0; // vehicle cam distance mode
    this.cine = null; this.fov = settings.fov;
    this._ad = new THREE.Vector3();
  }
  aimDir() {
    return this._ad.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
  kick(k) { this.kickV += k; }
  setCinematic(shot) { this.cine = shot; if (shot && shot.cut) { this.camera.position.copy(shot.from); this.look.copy(shot.at); } }
  update(dt, player) {
    const cam = this.camera;
    if (this.cine) {
      const s = this.cine; s.t = (s.t || 0) + dt;
      const k = s.dur ? clamp(s.t / s.dur, 0, 1) : 1;
      const e = k * k * (3 - 2 * k);
      const p = _v1.copy(s.from).lerp(s.to || s.from, e);
      cam.position.lerp(p, s.cut ? 1 : 1 - Math.exp(-dt * 4));
      const at = _v2.copy(s.at).lerp(s.at2 || s.at, e);
      this.look.lerp(at, s.cut ? 1 : 1 - Math.exp(-dt * 4)); s.cut = false;
      cam.lookAt(this.look);
      cam.fov = damp(cam.fov, s.fov || 45, 3, dt); cam.updateProjectionMatrix();
      G.camYaw = Math.atan2(this.look.x - cam.position.x, this.look.z - cam.position.z);
      return;
    }
    const lookIn = Math.abs(I.lx) + Math.abs(I.ly) > 0.0001;
    this.yaw -= I.lx; this.pitch = clamp(this.pitch + I.ly, -0.9, 1.25);
    this.pitch -= this.kickV; this.kickV *= Math.exp(-dt * 20);
    this.idle = lookIn ? 0 : this.idle + dt;
    let target, dist, height, side = 0, fovT = settings.fov;
    const car = player.state === 'car' ? player.car : null;
    if (car) {
      const sp = Math.abs(car.speed);
      if (this.idle > 1.2 || (sp > 8 && this.idle > 0.4)) {
        const behind = car.speed < -2 ? car.heading : car.heading + Math.PI;
        this.yaw = wrapAng(this.yaw + angDiff(this.yaw, behind) * Math.min(1, dt * (1.5 + sp * 0.05)));
        this.pitch = damp(this.pitch, 0.16, 2, dt);
      }
      if (G.inputHit && G.inputHit('camera')) this.mode = (this.mode + 1) % 3;
      const L = car.T.L;
      dist = [L * 1.25 + 2.2, L * 1.7 + 3.5, L * 0.9 + 1][this.mode] + sp * 0.04;
      height = car.T.roof * 0.85;
      target = _v1.copy(car.pos); target.y += car.T.roof - car.originH + 0.2;
      fovT = settings.fov + clamp(sp - 15, 0, 40) * 0.35;
    } else {
      const p = player.state === 'ragdoll' ? player.h.hipsPos() : player.pos;
      target = _v1.copy(p); target.y += player.state === 'ragdoll' ? 0.4 : 1.55;
      if (player.aiming) { dist = 1.9; side = 0.62; fovT = settings.fov - 12; }
      else { dist = 3.9; side = 0.35; }
      height = 0;
    }
    this.dist = damp(this.dist, dist, 6, dt);
    const cp = Math.cos(this.pitch), sp_ = Math.sin(this.pitch);
    const off = _v2.set(Math.sin(this.yaw) * cp, sp_, Math.cos(this.yaw) * cp);
    // camera sits behind => position = target - forward*dist ; forward = (sin(yaw), -sin(pitch), cos(yaw))
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const tgt = target.clone().addScaledVector(right, side * (car ? 0 : 1));
    const want = tgt.clone().add(new THREE.Vector3(-off.x * this.dist, off.y * this.dist + height * 0.3, -off.z * this.dist));
    // collision
    const dir = want.clone().sub(tgt); const L = dir.length(); dir.normalize();
    const hitR = G.physics.ray(tgt, dir, L + 0.3, GR.STATIC);
    if (hitR && hitR.t < L + 0.3) want.copy(tgt).addScaledVector(dir, Math.max(0.6, hitR.t - 0.3));
    if (want.y < 0.35) want.y = 0.35;
    const k = car ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 22);
    cam.position.lerp(want, k);
    if (cam.position.distanceTo(want) > 20) cam.position.copy(want);
    this.look.copy(tgt).addScaledVector(new THREE.Vector3(off.x, -off.y * 0.0, off.z), 4);
    this.look.y = tgt.y - (car ? 0 : 0) + Math.sin(-this.pitch) * 0.5;
    cam.lookAt(tgt.clone().add(new THREE.Vector3(off.x, -off.y, off.z).multiplyScalar(10)));
    if (this.shake > 0) { this.shake *= Math.exp(-dt * 5); cam.position.x += (Math.random() - 0.5) * this.shake; cam.position.y += (Math.random() - 0.5) * this.shake; }
    cam.fov = damp(cam.fov, fovT, 5, dt); cam.updateProjectionMatrix();
    G.camYaw = this.yaw;
  }
}
