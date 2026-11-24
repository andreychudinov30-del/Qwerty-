// Humans: rigged skinned character (Mixamo rig) with zone-based clothing recolor, hair/hats, procedural poses, Rapier ragdoll
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { G, clamp, lerp, rand, pick, _v1, _v2, _v3, _q1, _q2, _m1 } from '../core/util.js';
import { models } from '../core/assets.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { vcMat } from '../world/geo.js';

const SKIN = ['#f1c8a8', '#e0ac88', '#c68e68', '#a06a48', '#7a4a30', '#5a3422', '#f4d4bc'];
const HAIR = ['#1a1410', '#3a2618', '#5a3a20', '#8a6a3a', '#c8a060', '#a0a0a0', '#e8e0d0', '#6a2010'];
const SHIRT = ['#e8e8e8', '#1a1a1a', '#2a4a8a', '#8a1a1a', '#3a6a3a', '#c8a020', '#6a4a8a', '#d86a2a', '#4a8ac8', '#a8a8a8', '#c84a6a', '#2a8a8a', '#e8d8b8'];
const PANTS = ['#1a2a4a', '#2a2a2a', '#4a4a4a', '#6a5a3a', '#1a1a1a', '#3a4a6a', '#8a7a5a', '#c8c0b0'];
const SHOES = ['#1a1a1a', '#e8e8e8', '#5a3a20', '#2a2a3a', '#8a2a1a'];
export function randomLook(R = Math.random) {
  const p = (a) => a[(R() * a.length) | 0];
  return { skin: p(SKIN), hair: p(HAIR), shirt: p(SHIRT), pants: p(PANTS), shoes: p(SHOES), jacket: R() < 0.35 ? p(['#1a1a1a', '#3a2a1a', '#2a3a4a', '#5a5a5a', '#6a2a1a', '#2a4a2a']) : null, sleeves: R() < 0.5 ? 1 : 0, hairStyle: p(['short', 'short', 'long', 'bald', 'cap', 'beanie', 'hat', 'bun']), scale: 0.93 + R() * 0.12, female: R() < 0.45 };
}

let BASE = null;
function base() {
  if (BASE) return BASE;
  const g = models.Soldier;
  if (!g) return null;
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  let body = null, visor = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && /visor/i.test(o.name)) visor = o; else if (o.isSkinnedMesh) body = o; });
  const pos = body.geometry.attributes.position;
  const bb = new THREE.Box3().setFromBufferAttribute(pos);
  // determine facing from visor vs head bone
  let face = -1;
  const head = findBone(scene, 'Head');
  if (visor && head) {
    const hb = new THREE.Vector3(); head.getWorldPosition(hb);
    const vb = new THREE.Box3().setFromBufferAttribute(visor.geometry.attributes.position);
    const vc = vb.getCenter(new THREE.Vector3()).applyMatrix4(visor.matrixWorld);
    face = vc.z > hb.z ? 1 : -1;
  }
  // front direction in mesh-local space (mesh is Z-up, Y forward/back)
  let frontSign = 1;
  if (visor) { const vb = new THREE.Box3().setFromBufferAttribute(visor.geometry.attributes.position); const c = vb.getCenter(new THREE.Vector3()); frontSign = c.y > (bb.min.y + bb.max.y) / 2 ? 1 : -1; }
  const height = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
  BASE = { scene, clips: Object.fromEntries(g.animations.map((a) => [a.name, a])), bb, face, frontSign, height };
  return BASE;
}
export function findBone(root, name) {
  let f = null;
  root.traverse((o) => { if (!f && !o.isMesh && o.name.replace(/mixamorig:?/i, '') === name) f = o; });
  return f;
}

function clothMat(src, look, bb, frontSign) {
  const m = src.clone();
  const u = {
    uSkin: { value: new THREE.Color(look.skin) }, uHair: { value: new THREE.Color(look.hair) }, uShirt: { value: new THREE.Color(look.shirt) },
    uPants: { value: new THREE.Color(look.pants) }, uShoes: { value: new THREE.Color(look.shoes) }, uJacket: { value: new THREE.Color(look.jacket || look.shirt) },
    uHasJ: { value: look.jacket ? 1 : 0 }, uSleeve: { value: look.sleeves }, uMin: { value: bb.min.clone() }, uMax: { value: bb.max.clone() }, uFront: { value: frontSign },
    uVest: { value: look.vest ? new THREE.Color(look.vest) : new THREE.Color(0, 0, 0) }, uHasV: { value: look.vest ? 1 : 0 },
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBP; uniform vec3 uSkin,uHair,uShirt,uPants,uShoes,uJacket,uVest,uMin,uMax; uniform float uHasJ,uSleeve,uFront,uHasV;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
        float h = (vBP.z-uMin.z)/(uMax.z-uMin.z);
        float ax = abs(vBP.x)/max(abs(uMax.x),abs(uMin.x));
        float fr = (vBP.y-(uMin.y+uMax.y)*0.5)*uFront;
        vec3 c;
        float det = 0.6 + lum*0.9;
        if(h<0.055) c=uShoes*(0.7+lum*0.6);
        else if(h<0.47 && ax<0.3) c=uPants*det;
        else if(h<0.5 && ax<0.3) c=vec3(0.06)*det;
        else if(h>0.865 && ax<0.2){
          float hairZone = step(0.94,h) + step(0.885,h)*step(fr,-0.01);
          c = mix(uSkin*(0.85+lum*0.3), uHair*(0.7+lum*0.5), clamp(hairZone,0.,1.));
        }
        else if(ax>0.8) c=uSkin*(0.85+lum*0.3);
        else if(ax>0.5) c=mix(uSkin*(0.85+lum*0.3), (uHasJ>0.5?uJacket:uShirt)*det, max(uSleeve,uHasJ));
        else if(h>0.82 && ax<0.12 && fr>0.0) c=uSkin*(0.85+lum*0.3);
        else {
          c = uShirt*det;
          if(uHasJ>0.5){ float open = step(ax,0.07)*step(0.0,fr); c = mix(uJacket*det, uShirt*det, open); }
          if(uHasV>0.5 && h>0.55 && h<0.82 && ax<0.32) c = uVest*det;
        }
        diffuseColor.rgb = c;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor+0.25,0.,1.);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 0.15;');
  };
  m.customProgramCacheKey = () => 'cloth';
  return m;
}

const hairMatCache = new Map();
const hairMat = (c) => { if (!hairMatCache.has(c)) hairMatCache.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })); return hairMatCache.get(c); };
const DARK = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });

export const WEAPON_MESH = {};
function weaponMesh(kind) {
  if (WEAPON_MESH[kind]) return WEAPON_MESH[kind].clone();
  const g = new THREE.Group(); const m = vcMat(0.4, 0.7, {});
  const add = (w, h, d, x, y, z, c = [0.08, 0.08, 0.09]) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); const n = b.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); b.setAttribute('color', new THREE.BufferAttribute(a, 3)); const mm = new THREE.Mesh(b, m); mm.castShadow = true; g.add(mm); };
  if (kind === 'pistol') { add(0.03, 0.03, 0.18, 0, 0.02, 0.06); add(0.028, 0.1, 0.04, 0, -0.03, 0); }
  else if (kind === 'smg') { add(0.04, 0.05, 0.32, 0, 0.02, 0.1); add(0.03, 0.12, 0.04, 0, -0.05, 0.05); add(0.03, 0.08, 0.04, 0, -0.03, -0.03); }
  else if (kind === 'shotgun') { add(0.04, 0.05, 0.7, 0, 0.02, 0.22); add(0.035, 0.08, 0.2, 0, -0.02, -0.12, [0.35, 0.22, 0.12]); }
  else if (kind === 'rifle') { add(0.04, 0.06, 0.75, 0, 0.02, 0.22); add(0.03, 0.12, 0.05, 0, -0.06, 0.12); add(0.035, 0.08, 0.2, 0, -0.01, -0.14); add(0.02, 0.04, 0.12, 0, 0.07, 0.15); }
  else if (kind === 'camera') { add(0.12, 0.08, 0.06, 0, 0, 0.03, [0.15, 0.15, 0.16]); add(0.05, 0.05, 0.06, 0, 0, 0.08, [0.05, 0.05, 0.05]); }
  else if (kind === 'phone') { add(0.06, 0.12, 0.01, 0, 0, 0, [0.05, 0.05, 0.06]); }
  else if (kind === 'umbrella') {
    const can = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 10, 1, true), new THREE.MeshStandardMaterial({ color: pick([0x1a1a1a, 0x8a1a1a, 0x1a2a6a, 0x2a5a2a]), side: THREE.DoubleSide, roughness: 0.6 })); can.position.y = 0.85; g.add(can);
    add(0.015, 0.9, 0.015, 0, 0.42, 0);
  }
  WEAPON_MESH[kind] = g;
  return g.clone();
}

let HID = 0;
export class Human {
  constructor(world, look = randomLook(), opts = {}) {
    this.id = ++HID;
    this.world = world; this.look = look;
    this.root = new THREE.Group();
    const B = base();
    this.B = B;
    this.model = SkeletonUtils.clone(B.scene);
    this.model.rotation.y = B.face < 0 ? Math.PI : 0;
    const sc = look.scale * (look.female ? 0.95 : 1);
    this.model.scale.setScalar(sc);
    this.root.add(this.model);
    this.meshes = [];
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) {
        if (/visor/i.test(o.name)) { o.visible = !!look.visor; o.castShadow = false; return; }
        o.material = clothMat(o.material, look, B.bb, B.frontSign);
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        this.meshes.push(o);
      }
    });
    const bn = (n) => findBone(this.model, n);
    this.bones = {
      hips: bn('Hips'), spine: bn('Spine'), spine1: bn('Spine1'), spine2: bn('Spine2'), neck: bn('Neck'), head: bn('Head'), headTop: bn('HeadTop_End'),
      lSh: bn('LeftShoulder'), lArm: bn('LeftArm'), lFore: bn('LeftForeArm'), lHand: bn('LeftHand'), rSh: bn('RightShoulder'), rArm: bn('RightArm'), rFore: bn('RightForeArm'), rHand: bn('RightHand'),
      lUpLeg: bn('LeftUpLeg'), lLeg: bn('LeftLeg'), lFoot: bn('LeftFoot'), lToe: bn('LeftToeBase'), rUpLeg: bn('RightUpLeg'), rLeg: bn('RightLeg'), rFoot: bn('RightFoot'), rToe: bn('RightToeBase'),
    };
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const n of ['Idle', 'Walk', 'Run']) { const a = this.mixer.clipAction(B.clips[n]); a.play(); a.weight = n === 'Idle' ? 1 : 0; this.act[n] = a; }
    this.mixer.update(Math.random() * 2);
    this._attach(look);
    this.world.scene.add(this.root);
    this.pos = this.root.position; this.heading = 0;
    this.speed = 0; this.pose = null; this.poseW = 0; this.aimDir = new THREE.Vector3(0, 0, 1);
    this.ragdoll = null; this.dead = false; this.visible = true;
    this.held = null; this.heldKind = null;
    this.crouch = 0; this.lean = 0; this.punchT = 0; this.talkT = 0; this.waveT = 0;
    this.jumpY = 0;
  }
  _attach(look) {
    const head = this.bones.head; if (!head) return;
    this.model.updateMatrixWorld(true);
    const ws = new THREE.Vector3(); head.getWorldScale(ws);
    const k = 1 / ws.x; // meters -> bone local units
    const hp = new THREE.Vector3(); head.getWorldPosition(hp);
    const top = new THREE.Vector3(); this.bones.headTop.getWorldPosition(top);
    const hh = top.distanceTo(hp); // head height approx
    const add = (geo, mat, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat); m.castShadow = true;
      m.position.set(pos[0] * k, pos[1] * k, pos[2] * k); m.scale.set(scale[0] * k, scale[1] * k, scale[2] * k); m.rotation.set(...rot);
      head.add(m); return m;
    };
    // head bone local: +Y up the neck->top; forward is +Z in mixamo bone space
    const fz = 1;
    const hc = hairMat(look.hair);
    const r = hh * 0.62;
    const st = look.hairStyle;
    if (st === 'short' || st === 'long' || st === 'bun') add(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hc, [0, hh * 0.52, -0.01 * fz], [1.06, 0.95, 1.12]);
    if (st === 'long') add(new THREE.BoxGeometry(r * 1.9, hh * 1.2, r * 0.5), hc, [0, hh * 0.05, -r * 0.75 * fz]);
    if (st === 'bun') add(new THREE.SphereGeometry(r * 0.35, 10, 8), hc, [0, hh * 0.85, -r * 0.7 * fz]);
    if (st === 'cap') { const cm = hairMat(pick(['#1a1a1a', '#c81a1a', '#1a3a8a', '#e8e8e8', '#2a5a2a'])); add(new THREE.SphereGeometry(r * 1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cm, [0, hh * 0.55, 0], [1.05, 0.85, 1.1]); add(new THREE.BoxGeometry(r * 1.4, r * 0.06, r * 1.0), cm, [0, hh * 0.6, r * 1.0 * fz]); }
    if (st === 'beanie') add(new THREE.SphereGeometry(r * 1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat(pick(['#2a2a2a', '#6a1a1a', '#1a4a6a', '#8a8a2a'])), [0, hh * 0.5, 0], [1.05, 1.1, 1.1]);
    if (st === 'hat') { const cm = hairMat(pick(['#2a2a2a', '#4a3a2a', '#1a1a2a'])); add(new THREE.CylinderGeometry(r * 0.85, r * 0.95, r * 0.9, 14), cm, [0, hh * 0.85, 0]); add(new THREE.CylinderGeometry(r * 1.6, r * 1.6, r * 0.06, 18), cm, [0, hh * 0.55, 0]); }
    // face: eyes + brows + nose
    const ey = hh * 0.12, ez = r * 0.92 * fz;
    for (const sx of [-1, 1]) { add(new THREE.SphereGeometry(r * 0.09, 8, 6), DARK, [sx * r * 0.33, ey, ez], [1, 1, 0.5]); add(new THREE.BoxGeometry(r * 0.3, r * 0.05, r * 0.06), hc, [sx * r * 0.33, ey + r * 0.2, ez + r * 0.02]); }
    if (look.glasses) add(new THREE.BoxGeometry(r * 1.1, r * 0.2, r * 0.05), DARK, [0, ey, ez + r * 0.05]);
    if (look.beard) add(new THREE.SphereGeometry(r * 0.75, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), hc, [0, -hh * 0.18, r * 0.15 * fz], [1, 0.9, 1]);
    this.headR = r; this.headK = k;
  }
  hold(kind) {
    if (this.heldKind === kind) return;
    if (this.held) { this.held.parent && this.held.parent.remove(this.held); this.held = null; }
    this.heldKind = kind;
    if (!kind || kind === 'fists') return;
    const hand = kind === 'umbrella' ? this.bones.lHand : this.bones.rHand; if (!hand) return;
    const m = weaponMesh(kind);
    const ws = new THREE.Vector3(); hand.getWorldScale(ws);
    m.scale.setScalar(1 / ws.x);
    m.position.set(0, 0.08 / ws.x, 0.02 / ws.x);
    m.rotation.set(-Math.PI / 2, 0, 0);
    if (kind === 'umbrella') { m.rotation.set(0, 0, 0); m.position.set(0, 0.05 / ws.x, 0); }
    hand.add(m); this.held = m;
  }
  setVisible(v) { this.visible = v; this.root.visible = v; }
  // --- per-frame animation ---
  animate(dt, lodSkip = false) {
    if (this.ragdoll) { this._ragdollSync(); return; }
    if (!this.visible || this.frozen) return;
    const sp = this.speed;
    const wI = sp < 0.15 ? 1 : 0, wW = sp >= 0.15 && sp < 3.2 ? 1 : 0, wR = sp >= 3.2 ? 1 : 0;
    const k = 1 - Math.exp(-dt * 10);
    this.act.Idle.weight = lerp(this.act.Idle.weight, wI, k);
    this.act.Walk.weight = lerp(this.act.Walk.weight, wW, k);
    this.act.Run.weight = lerp(this.act.Run.weight, wR, k);
    this.act.Walk.timeScale = clamp(sp / 1.35, 0.5, 2.2);
    this.act.Run.timeScale = clamp(sp / 5.2, 0.7, 1.6);
    if (lodSkip) { this._acc = (this._acc || 0) + dt; return; }
    this.mixer.update(dt + (this._acc || 0)); this._acc = 0;
    this._poses(dt);
  }
  _poses(dt) {
    const b = this.bones;
    this.root.updateMatrixWorld(true);
    const P = this.pose;
    const fwd = (this._fwd || (this._fwd = new THREE.Vector3())).set(Math.sin(this.heading), 0, Math.cos(this.heading));
    if (this.jumpY > 0.05) { // tuck legs while airborne
      this.aimBone(b.lUpLeg, b.lLeg, _v1.copy(fwd).multiplyScalar(0.6).add(_v2.set(0, -1, 0)).normalize(), 0.7);
      this.aimBone(b.rUpLeg, b.rLeg, _v1.copy(fwd).multiplyScalar(0.3).add(_v2.set(0, -1, 0)).normalize(), 0.5);
    }
    if (P === 'drive' || P === 'sit' || P === 'passenger') {
      const down = _v2.set(0, -1, 0);
      for (const [up, low, foot] of [[b.lUpLeg, b.lLeg, b.lFoot], [b.rUpLeg, b.rLeg, b.rFoot]]) {
        this.aimBone(up, low, _v1.copy(fwd).multiplyScalar(1).add(_v3.set(0, -0.15, 0)).normalize(), 1);
        up.updateMatrixWorld(true);
        this.aimBone(low, foot, _v1.set(fwd.x * 0.25, -1, fwd.z * 0.25).normalize(), 1);
      }
      if (P === 'drive') {
        const wheel = _v1.copy(fwd).multiplyScalar(0.9).add(_v3.set(0, -0.35, 0)).normalize();
        this.aimBone(b.lArm, b.lFore, wheel, 0.9); this.aimBone(b.rArm, b.rFore, wheel, 0.9);
        b.lArm.updateMatrixWorld(true); b.rArm.updateMatrixWorld(true);
        const st = this.steerVis || 0;
        this.aimBone(b.lFore, b.lHand, _v1.copy(fwd).add(_v3.set(-Math.cos(this.heading) * (0.3 - st * 0.2), 0.2 + st * 0.2, Math.sin(this.heading) * (0.3 - st * 0.2))).normalize(), 0.8);
        this.aimBone(b.rFore, b.rHand, _v1.copy(fwd).add(_v3.set(Math.cos(this.heading) * (0.3 + st * 0.2), 0.2 - st * 0.2, -Math.sin(this.heading) * (0.3 + st * 0.2))).normalize(), 0.8);
      } else {
        this.aimBone(b.lArm, b.lFore, _v1.copy(fwd).multiplyScalar(0.4).add(_v3.set(0, -1, 0)).normalize(), 0.8);
        this.aimBone(b.rArm, b.rFore, _v1.copy(fwd).multiplyScalar(0.4).add(_v3.set(0, -1, 0)).normalize(), 0.8);
      }
      return;
    }
    if (P === 'aim' || P === 'shoot') {
      const d = this.aimDir;
      this.aimBone(b.spine2, b.neck, _v1.set(d.x * 0.25, 1, d.z * 0.25).normalize(), 0.0);
      this.aimBone(b.rArm, b.rFore, d, 1); b.rArm.updateMatrixWorld(true);
      this.aimBone(b.rFore, b.rHand, d, 1);
      const two = this.heldKind === 'rifle' || this.heldKind === 'smg' || this.heldKind === 'shotgun';
      const side = _v2.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
      const ld = _v1.copy(d).multiplyScalar(two ? 0.9 : 0.5).add(side.multiplyScalar(two ? -0.25 : -0.7)).normalize();
      this.aimBone(b.lArm, b.lFore, ld, two ? 1 : 0.85); b.lArm.updateMatrixWorld(true);
      this.aimBone(b.lFore, b.lHand, _v1.copy(d), two ? 0.9 : 0.4);
      this.aimBone(b.neck, b.head, _v1.set(d.x * 0.3, 1, d.z * 0.3).normalize(), 0.3);
    }
    if (P === 'handsup' || P === 'cower') {
      const up = _v1.set(0, 1, 0);
      const side = _v2.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
      if (P === 'handsup') { this.aimBone(b.lArm, b.lFore, up.clone().addScaledVector(side, 0.5).normalize(), 1); this.aimBone(b.rArm, b.rFore, up.clone().addScaledVector(side, -0.5).normalize(), 1); }
      else {
        this.aimBone(b.lArm, b.lFore, _v1.set(0, 0.6, 0).addScaledVector(side, 0.6).addScaledVector(fwd, 0.4).normalize(), 1);
        this.aimBone(b.rArm, b.rFore, _v1.set(0, 0.6, 0).addScaledVector(side, -0.6).addScaledVector(fwd, 0.4).normalize(), 1);
        b.lArm.updateMatrixWorld(true); b.rArm.updateMatrixWorld(true);
        this.aimBone(b.lFore, b.lHand, _v1.set(0, 0.3, 0).addScaledVector(side, -1).normalize(), 1);
        this.aimBone(b.rFore, b.rHand, _v1.set(0, 0.3, 0).addScaledVector(side, 1).normalize(), 1);
        this.aimBone(b.spine1, b.spine2, _v1.set(0, 0.7, 0).addScaledVector(fwd, 0.7).normalize(), 0.8);
      }
    }
    if (P === 'phone' || this.heldKind === 'phone') {
      this.aimBone(b.rArm, b.rFore, _v1.set(0, -0.6, 0).addScaledVector(fwd, 0.3).add(_v2.set(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(-0.5)).normalize(), 1);
      b.rArm.updateMatrixWorld(true);
      this.aimBone(b.rFore, b.rHand, _v1.set(0, 1, 0).addScaledVector(fwd, 0.2).normalize(), 1);
    }
    if (this.heldKind === 'umbrella') {
      this.aimBone(b.lArm, b.lFore, _v1.set(0, -0.3, 0).addScaledVector(fwd, 0.6).normalize(), 1);
      b.lArm.updateMatrixWorld(true);
      this.aimBone(b.lFore, b.lHand, _v1.set(0, 1, 0).addScaledVector(fwd, 0.15).normalize(), 1);
    }
    if (this.talkT > 0) {
      this.talkT -= dt;
      const s = Math.sin(G.t * 3 + this.id) * 0.5 + 0.5;
      this.aimBone(b.rArm, b.rFore, _v1.set(0, -0.8, 0).addScaledVector(fwd, 0.5 + s * 0.3).normalize(), 0.6);
      b.rArm.updateMatrixWorld(true);
      this.aimBone(b.rFore, b.rHand, _v1.set(0, 0.2 + s * 0.4, 0).addScaledVector(fwd, 1).normalize(), 0.7);
    }
    if (this.waveT > 0) { this.waveT -= dt; this.aimBone(b.rArm, b.rFore, _v1.set(Math.cos(this.heading) * 0.4, 1, 0).normalize(), 1); b.rArm.updateMatrixWorld(true); this.aimBone(b.rFore, b.rHand, _v1.set(Math.sin(G.t * 10) * 0.4, 1, 0).normalize(), 1); }
    if (this.punchT > 0) {
      this.punchT -= dt;
      const ph = 1 - this.punchT / 0.35, ext = ph < 0.4 ? ph / 0.4 : 1 - (ph - 0.4) / 0.6;
      const d = _v1.copy(fwd).multiplyScalar(1).add(_v2.set(0, 0.15, 0)).normalize();
      this.aimBone(b.rArm, b.rFore, d, ext); b.rArm.updateMatrixWorld(true); this.aimBone(b.rFore, b.rHand, d, ext);
      this.aimBone(b.spine1, b.spine2, _v1.set(0, 1, 0).addScaledVector(fwd, 0.25 * ext).normalize(), 0.6);
    }
  }
  // rotate bone so that direction bone->child points along dirWorld (blended by w)
  aimBone(bone, child, dirWorld, w = 1) {
    if (!bone || !child || w <= 0.001) return;
    bone.updateMatrixWorld(true);
    const a = bone.getWorldPosition(_v1b), c = child.getWorldPosition(_v2b);
    const cur = c.sub(a).normalize();
    const q = _qa.setFromUnitVectors(cur, _v3b.copy(dirWorld).normalize());
    const bw = bone.getWorldQuaternion(_qb);
    const pw = bone.parent.getWorldQuaternion(_qc);
    const target = q.multiply(bw); // new world rotation
    const local = pw.invert().multiply(target);
    if (w >= 0.999) bone.quaternion.copy(local); else bone.quaternion.slerp(local, w);
  }
  // ----------------- RAGDOLL -----------------
  startRagdoll(vel, spin = 3) {
    if (this.ragdoll || !this.bones.hips) return;
    const P = this.world.physics;
    this.root.updateMatrixWorld(true);
    const b = this.bones;
    const defs = [
      ['hips', b.hips, b.spine1, 0.14, null], ['chest', b.spine2, b.neck, 0.15, 'hips'], ['head', b.head, b.headTop, 0.1, 'chest'],
      ['lArm', b.lArm, b.lFore, 0.055, 'chest'], ['lFore', b.lFore, b.lHand, 0.05, 'lArm'], ['rArm', b.rArm, b.rFore, 0.055, 'chest'], ['rFore', b.rFore, b.rHand, 0.05, 'rArm'],
      ['lUp', b.lUpLeg, b.lLeg, 0.075, 'hips'], ['lLow', b.lLeg, b.lFoot, 0.06, 'lUp'], ['rUp', b.rUpLeg, b.rLeg, 0.075, 'hips'], ['rLow', b.rLeg, b.rFoot, 0.06, 'rUp'],
    ];
    const parts = {};
    const list = [];
    for (const [name, bone, child, th, parent] of defs) {
      if (!bone || !child) continue;
      const a = bone.getWorldPosition(new THREE.Vector3()), c = child.getWorldPosition(new THREE.Vector3());
      let L = a.distanceTo(c); if (name === 'lFore' || name === 'rFore') L *= 1.25; if (name === 'lLow' || name === 'rLow') L *= 1.1;
      const q = bone.getWorldQuaternion(new THREE.Quaternion());
      const dir = c.clone().sub(a).normalize();
      const center = a.clone().addScaledVector(dir, L / 2);
      // body orientation: align local Y to bone direction
      const bq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const rb = P.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(center.x, center.y, center.z).setRotation(bq).setLinearDamping(0.25).setAngularDamping(2.2).setLinvel(vel.x, vel.y, vel.z).setAngvel({ x: rand(-spin, spin), y: rand(-spin, spin), z: rand(-spin, spin) }).setCcdEnabled(name === 'hips' || name === 'chest'));
      const col = P.world.createCollider(RAPIER.ColliderDesc.cuboid(th, Math.max(0.04, L / 2), th * (name === 'hips' || name === 'chest' ? 0.75 : 1)).setDensity(name === 'chest' || name === 'hips' ? 900 : 1000).setFriction(0.9).setRestitution(0.05).setCollisionGroups(groups(GR.RAGDOLL, GR.STATIC | GR.VEHICLE | GR.PROP)), rb);
      P.handles.set(col.handle, { type: 'ragdoll', h: this });
      const bodyM = new THREE.Matrix4().compose(center, bq, new THREE.Vector3(1, 1, 1));
      const offset = bodyM.clone().invert().multiply(bone.matrixWorld);
      const part = { name, bone, rb, offset };
      parts[name] = part; list.push(part);
      if (parent && parts[parent]) {
        const pr = parts[parent].rb;
        const pt = pr.translation(), pqr = pr.rotation();
        const pM = new THREE.Matrix4().compose(new THREE.Vector3(pt.x, pt.y, pt.z), new THREE.Quaternion(pqr.x, pqr.y, pqr.z, pqr.w), new THREE.Vector3(1, 1, 1));
        const a1 = a.clone().applyMatrix4(pM.clone().invert()), a2 = a.clone().applyMatrix4(bodyM.clone().invert());
        P.world.createImpulseJoint(RAPIER.JointData.spherical(a1, a2), pr, rb, true);
      }
    }
    this.ragdoll = { parts: list, t: 0, still: 0 };
    for (const a of Object.values(this.act)) a.weight = 0;
    this.hold(null);
  }
  _ragdollSync() {
    const R = this.ragdoll; if (!R) return;
    const m = _m1, q = _q1, p = _v1, s = _v2.set(1, 1, 1);
    for (const part of R.parts) {
      const t = part.rb.translation(), r = part.rb.rotation();
      m.compose(p.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s.set(1, 1, 1)).multiply(part.offset);
      const parent = part.bone.parent;
      parent.updateMatrixWorld(true);
      const local = _m2b.copy(parent.matrixWorld).invert().multiply(m);
      local.decompose(part.bone.position, part.bone.quaternion, part.bone.scale);
      part.bone.updateMatrixWorld(true);
    }
  }
  ragdollUpdate(dt) {
    const R = this.ragdoll; if (!R) return false;
    R.t += dt;
    const hv = R.parts[0].rb.linvel();
    const sp = Math.hypot(hv.x, hv.y, hv.z);
    R.still = sp < 0.35 ? R.still + dt : 0;
    const t = R.parts[0].rb.translation();
    if (t.y < -20) { R.still = 99; }
    return R.still > 1.4 && R.t > 2;
  }
  hipsPos() { const t = this.ragdoll ? this.ragdoll.parts[0].rb.translation() : null; return t ? new THREE.Vector3(t.x, t.y, t.z) : this.pos.clone(); }
  endRagdoll(standUp = true) {
    const R = this.ragdoll; if (!R) return;
    const hp = this.hipsPos();
    for (const part of R.parts) this.world.physics.world.removeRigidBody(part.rb);
    this.ragdoll = null;
    if (standUp) {
      this.pos.set(hp.x, Math.max(0, this.groundY ? this.groundY(hp.x, hp.z) : 0), hp.z);
      this.model.traverse((o) => { if (o.isBone) o.scale.set(1, 1, 1); });
      this.act.Idle.weight = 1;
      this.mixer.update(0.01);
    }
  }
  freezeRagdoll() { // keep pose, drop physics
    const R = this.ragdoll; if (!R) return;
    this._ragdollSync();
    for (const part of R.parts) this.world.physics.world.removeRigidBody(part.rb);
    this.ragdoll = null; this.frozen = true;
  }
  dispose() {
    if (this.ragdoll) for (const part of this.ragdoll.parts) this.world.physics.world.removeRigidBody(part.rb);
    this.ragdoll = null;
    this.world.scene.remove(this.root);
    for (const m of this.meshes) m.material.dispose();
    this.mixer.stopAllAction();
  }
}
const _v1b = new THREE.Vector3(), _v2b = new THREE.Vector3(), _v3b = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _m2b = new THREE.Matrix4();
