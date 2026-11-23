// Rigged human characters built on the Mixamo-rigged soldier (three.js example asset):
// player avatar with skins + gear, co-op partner, corpses, and mutated variants (Turned, Shadow, Conductor).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel } from '../core/assets.js';
import { skinById } from '../data/skins.js';
import { canvasTexture } from '../core/assets.js';

let base = null;
export async function loadHumanBase() {
  if (base) return base;
  const gltf = await loadModel('Soldier');
  if (!gltf) return null;
  const box = new THREE.Box3().setFromObject(gltf.scene);
  base = { gltf, height: box.max.y - box.min.y, clips: Object.fromEntries(gltf.animations.map((a) => [a.name, a])) };
  return base;
}

function findBone(root, part) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name.replace(/mixamorig:?/i, '') === part) found = o; });
  return found;
}

// skin recolouring shader patch: keeps texture detail (luminance) and applies suit/accent colours
function recolor(mat, skin) {
  const m = mat.clone();
  const tint = new THREE.Vector3(...skin.tint), accent = new THREE.Vector3(...skin.accent);
  const glow = new THREE.Vector3(...(skin.glow || [0, 0, 0]));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = { value: tint }; sh.uniforms.uAccent = { value: accent }; sh.uniforms.uAmt = { value: skin.amt }; sh.uniforms.uGlow = { value: glow }; sh.uniforms.uCamo = { value: skin.camo ? 1 : 0 };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform vec3 uAccent; uniform float uAmt; uniform vec3 uGlow; uniform float uCamo;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
        float camo = uCamo > 0.5 ? (0.7 + 0.6*step(0.5, fract(sin(dot(floor(vMapUv*24.0), vec2(12.9898,78.233)))*43758.5453))) : 1.0;
        vec3 suit = uTint * (0.35 + lum * 1.6) * camo;
        float acc = smoothstep(0.42, 0.62, lum);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(suit, uAccent * (0.4 + lum), acc * 0.7), uAmt);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlow * smoothstep(0.5, 0.7, lum);`);
  };
  m.customProgramCacheKey = () => 'skin_' + skin.id;
  return m;
}

const gearMats = {
  dark: new THREE.MeshStandardMaterial({ color: 0x1e201c, roughness: 0.8 }),
  green: new THREE.MeshStandardMaterial({ color: 0x3a4430, roughness: 0.7, metalness: 0.2 }),
  strap: new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.9 }),
  vest: new THREE.MeshStandardMaterial({ color: 0xd8d020, roughness: 0.5, emissive: 0x2a2800 }),
  reflect: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.25, metalness: 0.6 }),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.4) }),
};

async function addGear(root, skin, scaleFix) {
  const head = findBone(root, 'Head'), spine = findBone(root, 'Spine2') || findBone(root, 'Spine1');
  const att = skin.att || [];
  const mount = (bone, obj, pos, rot = [0, 0, 0]) => {
    if (!bone) return;
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);
    obj.scale.multiplyScalar(1 / ws.x);
    obj.position.set(pos[0] / ws.x, pos[1] / ws.x, pos[2] / ws.x);
    obj.rotation.set(...rot);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    bone.add(obj);
  };
  root.updateMatrixWorld(true);
  if (att.includes('helmet')) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), skin.id === 'lineman' || skin.id === 'rescuer' ? new THREE.MeshStandardMaterial({ color: skin.id === 'lineman' ? 0xe0e0d8 : 0xd25a12, roughness: 0.4 }) : gearMats.green);
    dome.scale.set(1, 0.85, 1.12); g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 6, 24), gearMats.dark); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.12, 1); g.add(rim);
    mount(head, g, [0, 0.11 * scaleFix, 0.0]);
  }
  if (att.includes('cap')) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.07, 18), new THREE.MeshStandardMaterial({ color: 0x14204a, roughness: 0.7 })); g.add(top);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.09), gearMats.dark); visor.position.set(0, -0.03, 0.12); g.add(visor);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.01), gearMats.reflect); badge.position.set(0, 0, 0.125); g.add(badge);
    mount(head, g, [0, 0.17 * scaleFix, 0.01]);
  }
  if (att.includes('hood')) {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7), new THREE.MeshStandardMaterial({ color: new THREE.Color(...skin.tint).multiplyScalar(0.8), roughness: 0.95, side: THREE.DoubleSide }));
    hood.scale.set(1, 1.05, 1.15);
    mount(head, hood, [0, 0.08 * scaleFix, -0.02], [-0.25, 0, 0]);
  }
  if (att.includes('gasmask')) {
    const gltf = await loadModel('old_gas_mask');
    if (gltf) {
      const mask = gltf.scene.clone(true);
      const b = new THREE.Box3().setFromObject(mask); const s = b.getSize(new THREE.Vector3());
      const k = 0.26 / Math.max(s.x, s.y, s.z);
      const holder = new THREE.Group(); mask.scale.setScalar(k);
      const c = new THREE.Box3().setFromObject(mask).getCenter(new THREE.Vector3()); mask.position.sub(c);
      holder.add(mask);
      mount(head, holder, [0, 0.06 * scaleFix, 0.1 * scaleFix], [0, 0, 0]);
    }
  }
  if (att.includes('headlamp')) {
    const g = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.01, 4, 20), gearMats.strap); band.rotation.x = Math.PI / 2 + 0.2; g.add(band);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), gearMats.dark); body.position.set(0, 0.0, 0.115); g.add(body);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.013, 10), gearMats.lamp); lens.position.set(0, 0, 0.131); g.add(lens);
    mount(head, g, [0, 0.12 * scaleFix, 0.0]);
  }
  if (att.includes('backpack')) {
    const g = new THREE.Group();
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.16, 2, 2, 2), gearMats.green); g.add(pack);
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.06), gearMats.dark); pocket.position.set(0, -0.1, -0.1); g.add(pocket);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 12), new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 })); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.25, 0); g.add(roll);
    for (const x of [-0.1, 0.1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.02), gearMats.strap); st.position.set(x, 0.0, 0.1); g.add(st); }
    mount(spine, g, [0, 0.05 * scaleFix, -0.17 * scaleFix]);
  }
  if (att.includes('vest')) {
    const g = new THREE.Group();
    for (const y of [-0.05, 0.08]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.04, 20, 1, true), skin.id === 'rescuer' ? gearMats.reflect : gearMats.vest); band.position.y = y; band.scale.set(1, 1, 0.75); g.add(band); }
    mount(spine, g, [0, 0, 0.0]);
  }
  if (att.includes('glow')) {
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...(skin.glow || [1, 1, 1])) });
    const g = new THREE.Group();
    for (const y of [-0.12, 0.0, 0.12]) { const line = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.005, 4, 28), glowMat); line.rotation.x = Math.PI / 2; line.position.y = y; line.scale.set(1, 0.78, 1); g.add(line); }
    mount(spine, g, [0, 0, 0]);
  }
}

// ---------- flesh material for mutants ----------
let fleshTex = null;
export function fleshMaterial(color = 0x8a7a70, opts = {}) {
  if (!fleshTex) {
    fleshTex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#9b8a7e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = Math.random() < 0.5 ? '70,40,40' : Math.random() < 0.5 ? '120,110,95' : '50,55,45'; gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
      g.strokeStyle = 'rgba(60,20,30,0.55)';
      for (let i = 0; i < 60; i++) { g.lineWidth = 0.5 + Math.random() * 2; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    }, { repeat: true });
  }
  const m = new THREE.MeshStandardMaterial({ map: fleshTex, color, roughness: opts.rough ?? 0.42, metalness: 0, emissive: new THREE.Color(0, 0, 0) });
  const rim = new THREE.Color(opts.rim ?? 0x3a0a08);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: rim };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
        totalEmissiveRadiance += uRim * fres * 0.6;`);
  };
  m.customProgramCacheKey = () => 'flesh' + (opts.rim ?? '');
  return m;
}

export class Human {
  // mode: 'player' | 'turned' | 'shadow' | 'conductor' | 'corpse'
  static async create({ skin = 'stalker', mode = 'player', height = 1.8 } = {}) {
    const b = await loadHumanBase();
    if (!b) return null;
    const h = new Human();
    const root = SkeletonUtils.clone(b.gltf.scene);
    const s = height / b.height;
    root.scale.multiplyScalar(s);
    const wrapper = new THREE.Group();
    wrapper.add(root);
    h.root = wrapper; h.model = root; h.mode = mode;
    h.skin = skinById(skin);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (mode === 'player') { if (o.material.name === 'VanguardBodyMat' || !o.material.transparent) o.material = recolor(o.material, h.skin); }
        else if (mode === 'turned') o.material = fleshMaterial(0x7d7468, { rim: 0x401010 });
        else if (mode === 'shadow') o.material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.94, fog: true });
        else if (mode === 'conductor') o.material = fleshMaterial(0x3a302c, { rim: 0x601808, rough: 0.3 });
        else if (mode === 'corpse') o.material = recolor(o.material, { ...h.skin, tint: [0.25, 0.24, 0.22], amt: 0.6 });
      }
    });
    h.mixer = new THREE.AnimationMixer(root);
    h.actions = {};
    for (const [name, clip] of Object.entries(b.clips)) { if (name === 'TPose') continue; h.actions[name] = h.mixer.clipAction(clip); }
    h.current = null;
    h.bones = {};
    for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']) h.bones[n] = findBone(root, n);
    // normalise height using the skeleton (bind-pose boxes of skinned meshes are unreliable)
    {
      root.updateMatrixWorld(true);
      let top = -1e9, bottom = 1e9;
      const v = new THREE.Vector3();
      root.traverse((o) => { if (o.isBone) { o.getWorldPosition(v); top = Math.max(top, v.y); bottom = Math.min(bottom, v.y); } });
      if (top > bottom) { const k = (height * 0.96) / (top - bottom); root.scale.multiplyScalar(k); root.updateMatrixWorld(true); }
    }
    if (mode === 'player' || mode === 'corpse') await addGear(root, h.skin, 1);
    if (mode === 'turned' || mode === 'conductor' || mode === 'shadow') h.addEyes(mode);
    if (mode === 'turned') { // elongated limbs
      for (const n of ['LeftForeArm', 'RightForeArm']) h.bones[n] && h.bones[n].scale.set(1, 1.3, 1);
      for (const n of ['LeftHand', 'RightHand']) h.bones[n] && h.bones[n].scale.set(1.3, 1.5, 1.3);
    }
    if (mode === 'corpse') h.layDead();
    else h.play('Idle', 0);
    return h;
  }

  addEyes(mode) {
    const head = this.bones.Head; if (!head) return;
    const col = mode === 'shadow' ? new THREE.Color(4, 4, 4) : mode === 'conductor' ? new THREE.Color(6, 1.2, 0.2) : new THREE.Color(3.5, 2.6, 0.6);
    const mat = new THREE.MeshBasicMaterial({ color: col });
    this.eyeMat = mat;
    const ws = new THREE.Vector3(); this.root.updateMatrixWorld(true); head.getWorldScale(ws);
    for (const x of [-0.035, 0.035]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat);
      e.position.set(x / ws.x, 0.09 / ws.x, 0.1 / ws.x); e.scale.setScalar(1 / ws.x);
      head.add(e);
    }
  }

  play(name, fade = 0.25, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }

  // locomotion helper: speed in m/s
  locomote(speed, crouch = false) {
    if (speed < 0.15) this.play('Idle', 0.3);
    else if (speed < 3.2) this.play('Walk', 0.25, Math.max(0.5, speed / 1.6) * (crouch ? 0.8 : 1));
    else this.play('Run', 0.25, Math.max(0.7, speed / 5));
    this.crouch = crouch;
  }

  update(dt, { lookPitch = 0, twitch = 0 } = {}) {
    this.mixer?.update(dt);
    const B = this.bones;
    // procedural crouch layer
    if (this.crouch && B.Hips) {
      B.Hips.position.y *= 0.72;
      if (B.LeftUpLeg) B.LeftUpLeg.rotation.x -= 0.9; if (B.RightUpLeg) B.RightUpLeg.rotation.x -= 0.9;
      if (B.LeftLeg) B.LeftLeg.rotation.x += 1.3; if (B.RightLeg) B.RightLeg.rotation.x += 1.3;
      if (B.Spine) B.Spine.rotation.x += 0.35;
    }
    if (B.Spine1 && lookPitch) B.Spine1.rotation.x += -lookPitch * 0.5;
    if (B.Head && lookPitch) B.Head.rotation.x += -lookPitch * 0.4;
    if (this.mode === 'turned' && B.Head) {
      this._tw = (this._tw || 0) + dt;
      B.Head.rotation.z += Math.sin(this._tw * 1.3) * 0.35 + (Math.random() < twitch ? (Math.random() - 0.5) * 1.2 : 0);
      B.Head.rotation.x += 0.3;
      if (B.Spine) B.Spine.rotation.x += 0.45;
      if (B.LeftArm) B.LeftArm.rotation.z += 0.25; if (B.RightArm) B.RightArm.rotation.z -= 0.25;
    }
    if (this.mode === 'shadow' && B.Head) { this._tw = (this._tw || 0) + dt; B.Head.rotation.z += Math.sin(this._tw * 0.7) * 0.5; }
  }

  layDead() {
    this.play('Idle', 0); this.mixer.update(0.5);
    const B = this.bones;
    this.model.rotation.x = -Math.PI / 2;
    this.model.position.y = 0.12;
    if (B.LeftArm) B.LeftArm.rotation.z += 0.9; if (B.RightArm) B.RightArm.rotation.z -= 0.5;
    if (B.Head) B.Head.rotation.y += 0.7;
    if (B.LeftUpLeg) B.LeftUpLeg.rotation.z -= 0.2;
    this.mixer = null;
  }

  setSkin(id) {
    this.skin = skinById(id);
    this.model.traverse((o) => { if (o.isMesh && o.material.customProgramCacheKey && String(o.material.customProgramCacheKey()).startsWith('skin_')) { /* replaced below */ } });
  }

  dispose() { this.mixer?.stopAllAction(); this.root.removeFromParent(); }
}
