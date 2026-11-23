// Procedural creatures with real-time two-bone IK legs and procedural gait (feet plant on the ground,
// step when stretched), breathing, twitching, jaw animation. Crawler, Blind, Hunter, Queen.
import * as THREE from 'three';
import { fleshMaterial } from './human.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();

function limbGeo(len, r0, r1, knobs = true) {
  const pts = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = r0 + (r1 - r0) * t;
    if (knobs) r *= 1 + 0.25 * Math.exp(-Math.pow((t - 0.0) * 8, 2)) + 0.15 * Math.exp(-Math.pow((t - 1) * 8, 2)) - 0.12 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(Math.max(0.004, r), t * len));
  }
  const g = new THREE.LatheGeometry(pts, 8);
  return g;
}
function bodyGeo(len, r, ribs = true, belly = 1) {
  const pts = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let rr = r * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7;
    if (ribs && t > 0.3 && t < 0.75) rr *= 1 + 0.06 * Math.sin(t * 60);
    if (t > 0.55) rr *= belly;
    pts.push(new THREE.Vector2(Math.max(0.01, rr), t * len - len / 2));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  g.rotateX(Math.PI / 2); // along Z
  // organic noise
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.06 * Math.sin(x * 13 + z * 7) * Math.cos(y * 11); p.setXYZ(i, x * k, y * k, z); }
  g.computeVertexNormals();
  return g;
}
function headGeo(scale = 1, jawless = false) {
  const g = new THREE.SphereGeometry(0.14 * scale, 16, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    z *= 1.5; if (z > 0) { y *= 0.85; x *= 0.85; } // elongated skull
    if (jawless && z > 0.05 * scale && y > -0.02) { y *= 0.6; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

class Leg {
  constructor(parent, hipLocal, len1, len2, r, mat, { pole = new THREE.Vector3(0, 1, 0), group = 0, rest } = {}) {
    this.parent = parent; this.hipLocal = hipLocal; this.l1 = len1; this.l2 = len2; this.pole = pole; this.group = group;
    this.restLocal = rest || new THREE.Vector3(hipLocal.x * 1.6, 0, hipLocal.z);
    this.upper = new THREE.Mesh(limbGeo(len1, r, r * 0.7), mat);
    this.lower = new THREE.Mesh(limbGeo(len2, r * 0.7, r * 0.25), mat);
    for (const m of [this.upper, this.lower]) { m.castShadow = true; m.frustumCulled = false; }
    this.foot = new THREE.Vector3(); this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    this.stepT = 1; this.planted = false;
  }
  addTo(scene) { scene.add(this.upper, this.lower); }
  hipWorld(out) { return out.copy(this.hipLocal).applyMatrix4(this.parent.matrixWorld); }
  restWorld(out, vel, lead) {
    out.copy(this.restLocal).applyMatrix4(this.parent.matrixWorld);
    out.addScaledVector(vel, lead);
    return out;
  }
  solve(groundAt) {
    const hip = this.hipWorld(new THREE.Vector3());
    const target = this.foot;
    const d = target.clone().sub(hip);
    let dist = d.length();
    const maxR = this.l1 + this.l2 - 0.001;
    if (dist > maxR) { d.multiplyScalar(maxR / dist); dist = maxR; }
    const dir = d.clone().normalize();
    // knee via law of cosines
    const a = (this.l1 * this.l1 - this.l2 * this.l2 + dist * dist) / (2 * dist);
    const hgt = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    const poleW = this.pole.clone().applyQuaternion(this.parent.getWorldQuaternion(tmpQ));
    const side = poleW.sub(dir.clone().multiplyScalar(poleW.dot(dir))).normalize();
    const knee = hip.clone().addScaledVector(dir, a).addScaledVector(side, hgt);
    const end = hip.clone().add(d);
    place(this.upper, hip, knee);
    place(this.lower, knee, end);
    void groundAt;
  }
}
function place(mesh, a, b) {
  mesh.position.copy(a);
  const dir = b.clone().sub(a).normalize();
  mesh.quaternion.setFromUnitVectors(UP, dir);
}

export class Creature {
  constructor(kind) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.legs = [];
    this.limbGroup = new THREE.Group(); // legs in world space
    this.vel = new THREE.Vector3();
    this.t = Math.random() * 10;
    this.jaw = 0; this.jawTarget = 0;
    this.lookTarget = null;
    this.bodyHeight = 0.6;
    this.build(kind);
  }

  build(kind) {
    const flesh = fleshMaterial(kind === 'queen' ? 0x6a4a44 : kind === 'hunter' ? 0x5a504a : kind === 'blind' ? 0xb0a496 : 0x8c8076, { rim: kind === 'queen' ? 0x501010 : 0x300808, rough: 0.38 });
    this.mat = flesh;
    const eyeMat = new THREE.MeshBasicMaterial({ color: kind === 'crawler' ? new THREE.Color(3, 2.6, 1.2) : new THREE.Color(4, 0.6, 0.2) });
    const teethMat = new THREE.MeshStandardMaterial({ color: 0xcbbfa5, roughness: 0.4 });
    const addMesh = (geo, parent = this.body, mat = flesh) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const head = new THREE.Group();
    this.head = head;
    const jaw = new THREE.Group();
    this.jawObj = jaw;
    if (kind === 'crawler') {
      this.bodyHeight = 0.55; this.speedScale = 1;
      const torso = addMesh(bodyGeo(1.05, 0.2, true, 0.8));
      torso.position.z = 0;
      const pelvis = addMesh(new THREE.SphereGeometry(0.16, 12, 8)); pelvis.position.set(0, 0.02, -0.5); pelvis.scale.set(1.2, 0.8, 1);
      head.position.set(0, 0.08, 0.62); this.body.add(head);
      addMesh(headGeo(1.1), head);
      jaw.position.set(0, -0.06, 0.05); head.add(jaw);
      addMesh(new THREE.BoxGeometry(0.16, 0.03, 0.22), jaw).position.z = 0.08;
      this.addTeeth(head, jaw, teethMat, 0.16);
      for (const x of [-0.05, 0.05]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eyeMat); e.position.set(x, 0.05, 0.17); head.add(e); }
      // spine ridge
      for (let i = 0; i < 9; i++) { const s = addMesh(new THREE.ConeGeometry(0.025, 0.08, 5)); s.position.set(0, 0.2 - Math.abs(i - 4) * 0.01, -0.45 + i * 0.11); }
      const mk = (x, z, l1, l2, grp, fr) => new Leg(this.body, new THREE.Vector3(x, 0.02, z), l1, l2, 0.05, flesh, { pole: new THREE.Vector3(Math.sign(x) * 0.6, 1, fr ? -0.4 : 0.4).normalize(), group: grp, rest: new THREE.Vector3(x * 3.6, -this.bodyHeight, z + (fr ? 0.25 : -0.1)) });
      this.legs.push(mk(-0.17, 0.38, 0.55, 0.65, 0, true), mk(0.17, 0.38, 0.55, 0.65, 1, true), mk(-0.15, -0.48, 0.45, 0.55, 1, false), mk(0.15, -0.48, 0.45, 0.55, 0, false));
      this.stepDist = 0.55; this.stepTime = 0.16;
    } else if (kind === 'blind') {
      this.bodyHeight = 1.7; this.upright = true;
      const torso = addMesh(bodyGeo(0.95, 0.19, true, 0.75)); torso.rotation.x = Math.PI / 2 - 0.25; torso.position.set(0, 0.45, 0.05);
      const pelvis = addMesh(new THREE.SphereGeometry(0.15, 12, 8)); pelvis.position.set(0, 0, 0); pelvis.scale.set(1.3, 0.8, 0.9);
      head.position.set(0, 1.05, 0.28); this.body.add(head);
      const hm = addMesh(headGeo(1.25, true), head); hm.rotation.x = 0.4;
      jaw.position.set(0, -0.07, 0.06); head.add(jaw);
      addMesh(new THREE.BoxGeometry(0.2, 0.035, 0.26), jaw).position.z = 0.1;
      this.addTeeth(head, jaw, teethMat, 0.2);
      // long arms (dangling, IK to swinging targets)
      this.arms = [];
      for (const x of [-0.25, 0.25]) {
        const arm = new Leg(this.body, new THREE.Vector3(x, 0.85, 0.15), 0.75, 0.85, 0.045, flesh, { pole: new THREE.Vector3(Math.sign(x) * 0.3, 0, -1).normalize() });
        this.arms.push(arm);
      }
      const mk = (x, grp) => new Leg(this.body, new THREE.Vector3(x, -0.05, 0), 0.9, 0.95, 0.065, flesh, { pole: new THREE.Vector3(0, 0, 1), group: grp, rest: new THREE.Vector3(x * 1.3, -this.bodyHeight, 0.05) });
      this.legs.push(mk(-0.14, 0), mk(0.14, 1));
      this.stepDist = 0.65; this.stepTime = 0.42;
    } else if (kind === 'hunter') {
      this.bodyHeight = 1.0;
      const torso = addMesh(bodyGeo(1.3, 0.38, true, 0.7)); torso.position.set(0, 0.25, 0.1); torso.rotation.x = -0.35;
      const hump = addMesh(new THREE.SphereGeometry(0.35, 14, 10)); hump.position.set(0, 0.55, 0.25); hump.scale.set(1.2, 0.9, 1);
      head.position.set(0, 0.45, 0.85); this.body.add(head);
      addMesh(headGeo(1.5), head);
      jaw.position.set(0, -0.09, 0.08); head.add(jaw);
      addMesh(new THREE.BoxGeometry(0.26, 0.05, 0.3), jaw).position.z = 0.12;
      this.addTeeth(head, jaw, teethMat, 0.26);
      for (const x of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat); e.position.set(x, 0.06, 0.2); head.add(e); }
      const mk = (x, z, l1, l2, r, grp, fr) => new Leg(this.body, new THREE.Vector3(x, 0.2, z), l1, l2, r, flesh, { pole: new THREE.Vector3(Math.sign(x) * 0.5, 1, fr ? -0.5 : 0.5).normalize(), group: grp, rest: new THREE.Vector3(x * 1.8, -this.bodyHeight, z + (fr ? 0.2 : -0.1)) });
      this.legs.push(mk(-0.42, 0.5, 0.8, 0.9, 0.11, 0, true), mk(0.42, 0.5, 0.8, 0.9, 0.11, 1, true), mk(-0.3, -0.45, 0.6, 0.65, 0.09, 1, false), mk(0.3, -0.45, 0.6, 0.65, 0.09, 0, false));
      this.stepDist = 0.8; this.stepTime = 0.22;
    } else if (kind === 'queen') {
      this.bodyHeight = 2.6;
      const abdomen = addMesh(bodyGeo(3.4, 1.3, true, 1.25)); abdomen.position.set(0, 0.4, -1.6);
      const sacMat = new THREE.MeshStandardMaterial({ color: 0x3a6a20, emissive: new THREE.Color(0.3, 1.2, 0.2), emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.85 });
      this.sacs = [];
      for (let i = 0; i < 7; i++) { const s = addMesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.12, 12, 10), this.body, sacMat); s.position.set((Math.random() - 0.5) * 1.6, 0.9 + Math.random() * 0.8, -1.2 - Math.random() * 2); this.sacs.push(s); }
      const thorax = addMesh(bodyGeo(1.6, 0.7, true, 0.9)); thorax.position.set(0, 1.0, 0.8); thorax.rotation.x = -0.9;
      head.position.set(0, 2.1, 1.6); this.body.add(head);
      addMesh(headGeo(3.2), head);
      jaw.position.set(0, -0.2, 0.15); head.add(jaw);
      addMesh(new THREE.BoxGeometry(0.55, 0.1, 0.7), jaw).position.z = 0.3;
      this.addTeeth(head, jaw, teethMat, 0.55, 14);
      for (let i = 0; i < 6; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat); e.position.set((i % 3 - 1) * 0.12, 0.12 + Math.floor(i / 3) * 0.08, 0.42); head.add(e); }
      this.arms = [];
      for (const x of [-0.6, 0.6]) this.arms.push(new Leg(this.body, new THREE.Vector3(x, 1.6, 1.2), 1.6, 1.9, 0.14, flesh, { pole: new THREE.Vector3(Math.sign(x), 0.4, -0.6).normalize() }));
      let grp = 0;
      for (const z of [0.8, 0.0, -0.9, -1.9]) for (const x of [-1, 1]) {
        this.legs.push(new Leg(this.body, new THREE.Vector3(x * 0.8, 0.6, z), 2.3, 2.6, 0.16, flesh, { pole: new THREE.Vector3(x, 1.2, 0).normalize(), group: grp++ % 2, rest: new THREE.Vector3(x * 3.1, -this.bodyHeight, z * 1.3) }));
      }
      this.stepDist = 1.4; this.stepTime = 0.35;
    }
    for (const l of this.legs) l.addTo(this.limbGroup);
    if (this.arms) for (const a of this.arms) a.addTo(this.limbGroup);
  }
  // limbs are solved in world space, so they live directly in the scene
  attach(scene) { scene.add(this.root); scene.add(this.limbGroup); }

  addTeeth(head, jaw, mat, w, n = 8) {
    const geo = new THREE.ConeGeometry(0.008 * (w / 0.16), 0.04 * (w / 0.16), 4);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      const up = new THREE.Mesh(geo, mat); up.rotation.x = Math.PI; up.position.set(x, -0.03 * (w / 0.16), 0.1 * (w / 0.16) + Math.cos(x * 10) * 0.01); head.add(up);
      const dn = new THREE.Mesh(geo, mat); dn.position.set(x, 0.02 * (w / 0.16), 0.14 * (w / 0.16)); jaw.add(dn);
    }
  }

  // place feet on ground initially
  init(groundAt) {
    this.root.updateMatrixWorld(true);
    for (const l of this.legs) { l.restWorld(l.foot, this.vel, 0); l.foot.y = groundAt(l.foot.x, l.foot.z); l.from.copy(l.foot); l.to.copy(l.foot); l.stepT = 1; }
  }

  // world-space update; pos/yaw are set by AI on this.root
  update(dt, groundAt, { speed = 0, alert = 0, attack = 0 } = {}) {
    this.t += dt;
    const t = this.t;
    // body bob/breath and lean
    const gy = groundAt(this.root.position.x, this.root.position.z);
    const breath = Math.sin(t * (2 + alert * 3)) * 0.02;
    const gait = Math.sin(t * (6 + speed * 2)) * Math.min(1, speed) * 0.04;
    this.body.position.y = this.bodyHeight + breath + gait + (this.kind === 'crawler' ? -alert * 0.1 : 0);
    this.body.rotation.x = (this.upright ? 0.15 : 0) + attack * 0.25 - Math.min(0.2, speed * 0.03);
    this.body.rotation.z = Math.sin(t * 3.1) * 0.03 * Math.min(1, speed);
    this.body.scale.setScalar(1 + breath * 0.5);
    // twitches
    if (Math.random() < dt * (1.5 + alert * 4)) { this.twitch = { x: (Math.random() - 0.5) * 0.9, z: (Math.random() - 0.5) * 0.7, t: 0.08 + Math.random() * 0.1 }; }
    if (this.twitch) { this.twitch.t -= dt; if (this.twitch.t <= 0) this.twitch = null; }
    // head look
    if (this.head) {
      const baseX = this.kind === 'blind' ? 0.2 : 0;
      let hx = baseX + Math.sin(t * 0.9) * 0.15, hy = Math.sin(t * 0.6) * 0.3;
      if (this.lookTarget) {
        const local = this.head.parent.worldToLocal(this.lookTarget.clone());
        local.sub(this.head.position);
        hy = Math.atan2(local.x, local.z); hx = -Math.atan2(local.y, Math.hypot(local.x, local.z));
        hy = Math.max(-1.2, Math.min(1.2, hy)); hx = Math.max(-0.8, Math.min(0.8, hx));
      }
      if (this.twitch) { hx += this.twitch.x; hy += this.twitch.z; }
      this.head.rotation.x += (hx - this.head.rotation.x) * Math.min(1, dt * 10);
      this.head.rotation.y += (hy - this.head.rotation.y) * Math.min(1, dt * 10);
      this.head.rotation.z = this.kind === 'blind' ? Math.sin(t * 0.7) * 0.4 : 0;
    }
    this.jaw += (Math.max(this.jawTarget, attack) - this.jaw) * Math.min(1, dt * 12);
    this.jawObj.rotation.x = this.jaw * 0.8 + Math.max(0, Math.sin(t * 9)) * 0.05 * alert;
    if (this.sacs) this.sacs.forEach((s, i) => s.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.08));
    this.root.updateMatrixWorld(true);
    // gait: legs step when stretched
    const lead = this.stepTime * 1.2;
    const anyStepping = [false, false];
    for (const l of this.legs) if (l.stepT < 1) anyStepping[l.group] = true;
    const rest = new THREE.Vector3();
    for (const l of this.legs) {
      l.restWorld(rest, this.vel, lead);
      rest.y = groundAt(rest.x, rest.z);
      if (l.stepT >= 1) {
        const stretch = Math.hypot(rest.x - l.foot.x, rest.z - l.foot.z);
        if (stretch > this.stepDist && !anyStepping[1 - l.group]) { l.from.copy(l.foot); l.to.copy(rest); l.stepT = 0; anyStepping[l.group] = true; this.onStep && this.onStep(l); }
      } else {
        l.stepT = Math.min(1, l.stepT + dt / (this.stepTime / Math.max(0.6, Math.min(2.2, speed / 2 + 0.6))));
        const k = l.stepT;
        l.to.lerp(rest, 0.2);
        l.foot.lerpVectors(l.from, l.to, k);
        l.foot.y += Math.sin(k * Math.PI) * this.stepDist * 0.45;
      }
      l.solve();
    }
    if (this.arms) {
      this.arms.forEach((a, i) => {
        const swing = Math.sin(t * (2 + speed) + i * Math.PI) * (0.3 + speed * 0.15);
        const target = a.hipWorld(new THREE.Vector3());
        const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
        const reach = attack > 0.2 ? 1.1 : 0.25;
        target.addScaledVector(fw, swing * 0.5 + reach * (this.kind === 'queen' ? 2.5 : 1));
        target.y -= (a.l1 + a.l2) * (attack > 0.2 ? 0.2 : 0.85);
        target.x += (i ? 1 : -1) * 0.1;
        a.foot.lerp(target, Math.min(1, dt * 8));
        a.solve();
      });
    }
  }

  setOpacity(o) { this.mat.transparent = o < 1; this.mat.opacity = o; }
  setVisible(v) { this.root.visible = v; this.limbGroup.visible = v; }
  dispose() { this.root.removeFromParent(); this.limbGroup.removeFromParent(); }
}
