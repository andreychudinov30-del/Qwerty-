import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { loadCarGLTF, tex, canvasTex } from './assets.js';
import { nightUniform } from './props.js';

let BASE = null;
export async function initCarBase() {
  if (BASE) return BASE;
  const gltf = await loadCarGLTF(); const scene = gltf.scene; scene.updateMatrixWorld(true);
  const shadowTex = tex('ferrari_ao.png'); shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping; shadowTex.colorSpace = THREE.SRGBColorSpace;
  // upgrade shared materials
  scene.traverse(o => {
    if (!o.isMesh) return; const m = o.material;
    if (m.name === 'metal_chrome') { m.metalness = 1; m.roughness = 0.06; }
    if (m.name === 'Carbon_Fiber') { m.roughness = 0.25; }
    if (m.name === 'Tires') { m.roughness = 0.82; m.color.setHex(0x1b1b1b); }
    o.castShadow = true; o.receiveShadow = true;
  });
  BASE = { scene, shadowTex, rims: {} };
  return BASE;
}

// ---------- procedural rims (axle = X, outward = +X) ----------
function spoke(w0, w1, r0, r1, thick, twist = 0, bow = 0) {
  const s = new THREE.Shape(); s.moveTo(-w0 / 2, r0); s.lineTo(w0 / 2, r0); s.quadraticCurveTo(w1 / 2 + twist * 0.5, (r0 + r1) / 2, w1 / 2 + twist, r1); s.lineTo(-w1 / 2 + twist, r1); s.quadraticCurveTo(-w1 / 2 + twist * 0.5, (r0 + r1) / 2, -w0 / 2, r0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(Math.PI / 2); // extrude along +X
  if (bow) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getY(i), p.getZ(i)); p.setX(i, p.getX(i) - Math.sin(Math.min(1, (r - r0) / (r1 - r0)) * Math.PI) * bow + (r / r1) * bow * 0.6); } g.computeVertexNormals(); }
  return g.index ? g.toNonIndexed() : g;
}
export function rimGeometry(style) {
  if (BASE && BASE.rims[style]) return BASE.rims[style];
  const parts = []; const R = 0.245, hub = 0.058; const x0 = 0.035;
  const around = (g, n, off = 0) => { for (let i = 0; i < n; i++) { const c = g.clone(); c.rotateX(i / n * Math.PI * 2 + off); parts.push(c); } };
  const ring = (r, tube, x, seg = 48) => { const t = new THREE.TorusGeometry(r, tube, 8, seg); t.rotateY(Math.PI / 2); t.translate(x, 0, 0); parts.push(t.toNonIndexed()); };
  const hubG = new THREE.CylinderGeometry(hub, hub * 1.15, 0.05, 24); hubG.rotateZ(Math.PI / 2); hubG.translate(x0 + 0.01, 0, 0); parts.push(hubG.toNonIndexed());
  const cap = new THREE.SphereGeometry(0.035, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); cap.rotateZ(-Math.PI / 2); cap.translate(x0 + 0.035, 0, 0); parts.push(cap.toNonIndexed());
  const nut = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6); nut.rotateZ(Math.PI / 2); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const c = nut.clone(); c.translate(x0 + 0.04, Math.cos(a) * 0.04, Math.sin(a) * 0.04); parts.push(c.toNonIndexed()); }
  if (style === 'fivespoke') { const sp = spoke(0.07, 0.095, hub * 0.8, R, 0.03, 0, 0.012); sp.translate(x0 - 0.01, 0, 0); around(sp, 5); const sp2 = spoke(0.03, 0.03, hub, R * 0.95, 0.018); sp2.translate(x0 - 0.04, 0, 0); around(sp2, 5, Math.PI / 5); }
  else if (style === 'mesh') { for (const tw of [0.05, -0.05]) { const sp = spoke(0.02, 0.016, hub * 0.9, R, 0.022, tw, 0.01); sp.translate(x0 - 0.012, 0, 0); around(sp, 10); } ring(R * 0.62, 0.006, x0 - 0.01); }
  else if (style === 'multi') { const sp = spoke(0.022, 0.03, hub * 0.9, R, 0.024, 0.01, 0.016); sp.translate(x0 - 0.012, 0, 0); around(sp, 20); }
  else if (style === 'dish') { const sp = spoke(0.05, 0.06, hub * 0.9, R * 0.78, 0.03); sp.translate(x0 - 0.07, 0, 0); around(sp, 6); const lip = new THREE.CylinderGeometry(R, R * 0.8, 0.08, 48, 1, true); lip.rotateZ(Math.PI / 2); lip.translate(x0 - 0.02, 0, 0); parts.push(lip.toNonIndexed()); ring(R, 0.01, x0 + 0.018); }
  else if (style === 'beadlock') { const sp = spoke(0.055, 0.07, hub * 0.9, R * 0.9, 0.035); sp.translate(x0 - 0.03, 0, 0); around(sp, 8); ring(R * 0.96, 0.018, x0 + 0.0); const b = new THREE.CylinderGeometry(0.007, 0.007, 0.02, 6); b.rotateZ(Math.PI / 2); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const c = b.clone(); c.translate(x0 + 0.02, Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96); parts.push(c.toNonIndexed()); } }
  else if (style === 'turbine') { const sp = spoke(0.03, 0.05, hub * 0.9, R, 0.02, 0.07, 0.02); sp.translate(x0 - 0.01, 0, 0); around(sp, 14); ring(R * 0.98, 0.012, x0); }
  const g = mergeGeometries(parts.map(p => { if (!p.attributes.uv) p.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2)); return p; }));
  g.computeVertexNormals(); if (BASE) BASE.rims[style] = g; return g;
}

// NACA-like airfoil shape
function airfoil(chord, thick) {
  const s = new THREE.Shape(); const n = 16; const pt = [];
  for (let i = 0; i <= n; i++) { const x = 1 - Math.cos(i / n * Math.PI / 2) ** 1; const t = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4); pt.push([x, t]); }
  s.moveTo(0, 0); for (const [x, t] of pt) s.lineTo(x * chord, (t + 0.06 * Math.sin(x * Math.PI)) * chord); for (let i = n; i >= 0; i--) { const [x, t] = pt[i]; s.lineTo(x * chord, (-t * 0.4 + 0.06 * Math.sin(x * Math.PI)) * chord); }
  return s;
}
function tube(points, r, seg = 24) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), seg, r, 8); }

const liveryIds = { none: 0, stripes: 1, center: 2, side: 3, twotone: 4, fade: 5, carbonhood: 6 };

export class CarVisual {
  constructor(car, tune, opts = {}) {
    this.car = car; this.tune = tune; this.opts = opts; this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body); this.wheels = []; this.kit = new THREE.Group(); this.body.add(this.kit); this.decals = new THREE.Group(); this.body.add(this.decals);
    this.build();
  }
  build() {
    const car = this.car, b = car.body, src = BASE.scene.clone(true);
    this.model = new THREE.Group(); this.model.rotation.y = Math.PI; this.body.add(this.model);
    this.scaleG = new THREE.Group(); this.model.add(this.scaleG);
    const wheelNodes = {};
    for (const nm of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) wheelNodes[nm] = src.getObjectByName(nm);
    for (const ch of [...src.children]) if (!wheelNodes[ch.name]) this.scaleG.add(ch);
    // per-car materials
    this.mats = {}; this.meshes = [];
    this.scaleG.traverse(o => {
      if (!o.isMesh) return; this.meshes.push(o); const n = o.material.name;
      if (n === 'Body_Color') { if (!this.mats.paint) this.mats.paint = this.makePaint(); o.material = this.mats.paint; if (o.name === 'body') this.bodyMesh = o; }
      else if (n === 'Glass_Gray') { if (!this.mats.glass) this.mats.glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0c0e, metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.4, clearcoat: 1, envMapIntensity: 1.6 }); o.material = this.mats.glass; o.castShadow = false; }
      else if (n === 'Projector_Glass' || n === 'Turn_Signal_LED') { if (!this.mats.head) this.mats.head = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.2, transparent: true, opacity: 0.9 }); if (n === 'Projector_Glass') o.material = this.mats.head; }
      else if (n === 'Taillight_Glass') { if (!this.mats.tail) this.mats.tail = new THREE.MeshPhysicalMaterial({ color: 0x500000, emissive: 0xff1010, emissiveIntensity: 0.3, roughness: 0.1, transparent: true, opacity: 0.95 }); o.material = this.mats.tail; }
      if (/leather|carpet|interior|steering|^trim$/i.test(o.name) && !/body|glass/.test(o.name)) o.userData.interior = true;
    });
    this.steering = this.scaleG.getObjectByName('steering_wheel');
    // wheels
    const ws = b.wheel; this.R = 0.36 * ws; this.ride = b.ride + (this.tune.ride || 0);
    this.rimMat = new THREE.MeshPhysicalMaterial({ color: this.tune.rimColor, metalness: 1, roughness: 0.22, clearcoat: 0.6 });
    for (const [nm, node] of Object.entries(wheelNodes)) {
      const ox = node.position.x, oz = node.position.z; const front = nm[6] === 'f';
      const pivot = new THREE.Group(); const steer = new THREE.Group(); const spin = new THREE.Group(); const flip = new THREE.Group(); flip.rotation.y = Math.PI;
      pivot.add(steer); steer.add(spin); spin.add(flip); node.position.set(0, 0, 0); flip.add(node); flip.scale.setScalar(ws);
      // car space: x = -ox (flip), z = -oz
      const side = Math.sign(ox); const rimNode = node.children.find(c => /^rim_/.test(c.name)); const centre = node.children.filter(c => /centre|nuts/.test(c.name));
      const custom = new THREE.Mesh(rimGeometry('fivespoke'), this.rimMat); custom.scale.x = side; custom.castShadow = true; flip.add(custom);
      const rimGroup = node.children.filter(c => c.name === 'wheel' || /^rim_|brake/.test(c.name));
      this.wheels.push({ nm, front, left: -ox > 0, base: new THREE.Vector3(-ox, 0, -oz), pivot, steer, spin, flip, rim: rimNode, centre, custom, rimGroup, side, node });
      this.body.parent ? 0 : 0; this.root.add(pivot);
    }
    this.mats.paint.userData.uniforms && this.updateBodyMatrix();
    // contact shadow
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BASE.shadowTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false }));
    this.shadow.renderOrder = 2; this.shadow.position.y = 0.02; this.root.add(this.shadow);
    // brake glow & lights
    this.applyTune(this.tune);
  }
  makePaint() {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xff0000, metalness: 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 });
    const u = { uLiv: { value: 0 }, uLivCol: { value: new THREE.Color() }, uBodyMat: { value: new THREE.Matrix4() }, uDirt: { value: 0 } }; m.userData.uniforms = u;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform mat4 uBodyMat; varying vec3 vCP; varying vec3 vCN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCP = (uBodyMat * vec4(position,1.0)).xyz; vCN = normalize(mat3(uBodyMat) * normal);');
      sh.fragmentShader = 'uniform float uLiv, uDirt; uniform vec3 uLivCol; varying vec3 vCP; varying vec3 vCN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float L = 0.0; float carbon = 0.0; vec3 p = vCP;
        if (uLiv > 0.5 && uLiv < 1.5) L = (step(0.11, abs(p.x)) - step(0.27, abs(p.x))) * step(0.62, p.y);
        else if (uLiv < 2.5 && uLiv > 1.5) L = (1.0 - step(0.2, abs(p.x))) * step(0.6, p.y);
        else if (uLiv < 3.5 && uLiv > 2.5) L = step(0.36, p.y) * (1.0 - step(0.47, p.y + 0.06 * p.z)) * step(0.5, abs(vCN.x));
        else if (uLiv < 4.5 && uLiv > 3.5) L = 1.0 - smoothstep(0.5, 0.52, p.y);
        else if (uLiv < 5.5 && uLiv > 4.5) L = smoothstep(-0.6, 2.2, p.z);
        else if (uLiv > 5.5) { carbon = step(p.z, -0.9) * step(0.66, p.y); }
        diffuseColor.rgb = mix(diffuseColor.rgb, uLivCol, clamp(L, 0.0, 1.0));
        if (carbon > 0.5) { vec2 cw = floor(vec2(p.x + p.z, p.x - p.z) * 120.0); float ch = mod(cw.x + cw.y, 2.0); diffuseColor.rgb = vec3(0.025 + ch * 0.03); }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.36, 0.28), uDirt * smoothstep(0.55, 0.15, p.y) * 0.8);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.85, uDirt * smoothstep(0.55, 0.15, vCP.y));');
    };
    m.customProgramCacheKey = () => 'carpaint';
    return m;
  }
  updateBodyMatrix() {
    if (!this.bodyMesh) return; this.root.updateMatrixWorld(true);
    // body mesh -> model-root space (unscaled)
    const inv = new THREE.Matrix4().copy(this.scaleG.matrixWorld).invert(); this.mats.paint.userData.uniforms.uBodyMat.value.multiplyMatrices(inv, this.bodyMesh.matrixWorld);
  }
  applyTune(t) {
    this.tune = t; const car = this.car, b = car.body; const wide = t.widebody === 'flares' ? 1.05 : 1;
    // body proportions
    this.scaleG.scale.set(b.W * wide, b.H, b.L);
    this.ride = b.ride + (t.ride || 0) * 0.1; const lift = (this.R - 0.36) + this.ride;
    this.model.position.y = lift;
    // paint
    const p = this.mats.paint; p.color.set(t.paint); p.iridescence = 0; p.sheen = 0;
    const F = { gloss: [0.15, 0.32, 1, 0.02], metallic: [0.85, 0.3, 1, 0.03], matte: [0.25, 0.62, 0, 0.5], pearl: [0.55, 0.25, 1, 0.02], chrome: [1, 0.05, 0.4, 0.02] }[t.finish] || [0.5, 0.3, 1, 0.03];
    [p.metalness, p.roughness, p.clearcoat, p.clearcoatRoughness] = F;
    if (t.finish === 'pearl') { p.iridescence = 1; p.iridescenceIOR = 1.45; p.iridescenceThicknessRange = [250, 650]; }
    if (t.finish === 'chrome') p.color.lerp(new THREE.Color(0xffffff), 0.35);
    p.userData.uniforms.uLiv.value = liveryIds[t.livery] || 0; p.userData.uniforms.uLivCol.value.set(t.livery === 'twotone' || t.livery === 'fade' ? t.paint2 : t.liveryColor);
    p.needsUpdate = true;
    this.mats.glass.opacity = 0.18 + t.tint * 0.75; this.mats.glass.color.setHex(t.tint > 0.6 ? 0x020304 : 0x0a0c0e);
    this.mats.head.emissive.set(t.headlight); this.mats.head.color.set(t.headlight);
    // wheels
    this.R = 0.36 * b.wheel; this.track = 1.0 * b.W * wide;
    this.rimMat.color.set(t.rimColor); this.rimMat.roughness = 0.2;
    const rs = Math.min(1.1, Math.max(0.9, t.rimSize || 1));
    for (const w of this.wheels) {
      w.flip.scale.setScalar(b.wheel); const oem = t.rim === 'oem';
      if (w.rim) w.rim.visible = oem; for (const c of w.centre) c.visible = oem;
      w.custom.visible = !oem; if (!oem) w.custom.geometry = rimGeometry(t.rim);
      w.custom.scale.set(w.side * rs, rs, rs); for (const g of w.rimGroup) if (g !== w.rim && g.name === 'wheel') g.scale.setScalar(rs);
      w.pos = new THREE.Vector3(w.base.x * b.W * wide, 0, w.base.z * b.L);
      w.pivot.position.set(w.pos.x, this.R, w.pos.z);
    }
    this.wheelbase = this.wheels[0].pos.z - this.wheels[2].pos.z; this.trackW = Math.abs(this.wheels[0].pos.x - this.wheels[1].pos.x);
    this.shadow.scale.set(b.W * wide * (1 + this.ride), 1, b.L);
    this.updateBodyMatrix();
    this.buildKit(t); this.buildDecals(t); this.setNeon(t.neon);
  }
  bodyHeightAt(x, z) { // ray down on body mesh in car space
    if (!this.bodyMesh) return 0.9; this.root.updateMatrixWorld(true); const rc = new THREE.Raycaster(); const o = new THREE.Vector3(x, 4, z).applyMatrix4(this.root.matrixWorld);
    rc.set(o, new THREE.Vector3(0, -1, 0)); const h = rc.intersectObject(this.bodyMesh, false)[0]; if (!h) return null; return this.root.worldToLocal(h.point.clone()).y;
  }
  extents() { this.root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert(); const bb = new THREE.Box3(); if (this.bodyMesh) { this.bodyMesh.geometry.computeBoundingBox(); bb.copy(this.bodyMesh.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, this.bodyMesh.matrixWorld)); } return bb; }
  buildKit(t) {
    while (this.kit.children.length) { const c = this.kit.children.pop(); c.geometry && c.geometry.dispose(); }
    const bb = this.extents(); const len = bb.max.z - bb.min.z, wid = bb.max.x - bb.min.x; const rearZ = bb.min.z, frontZ = bb.max.z; const kitType = this.car.body.kit;
    const carbon = new THREE.MeshPhysicalMaterial({ color: 0x111214, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
    const bodyMat = this.mats.paint; const black = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.6, metalness: 0.2 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.9, roughness: 0.35 });
    const add = (g, m, cast = true) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = true; this.kit.add(mesh); return mesh; };
    const deckY = (this.bodyHeightAt(0, rearZ + 0.35) ?? bb.max.y * 0.8) ; const lift = this.model.position.y;
    // spoilers
    if (t.spoiler === 'lip') { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.12, 0.0); s.lineTo(0.0, 0.05); const g = new THREE.ExtrudeGeometry(s, { depth: wid * 0.82, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-wid * 0.41, deckY - 0.01, rearZ + 0.18); add(g, kitType === 'stock' ? carbon : bodyMat); }
    if (t.spoiler === 'ducktail') { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.18, 0.02, 0.3, 0.1); s.lineTo(0.28, 0.12); s.quadraticCurveTo(0.12, 0.05, 0, 0.03); const g = new THREE.ExtrudeGeometry(s, { depth: wid * 0.86, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 }); g.rotateY(-Math.PI / 2); g.translate(wid * 0.43, deckY - 0.02, rearZ + 0.42); add(g, bodyMat); }
    if (t.spoiler === 'gt' || t.spoiler === 'swan') {
      const chord = 0.3, span = wid * 0.98, h = t.spoiler === 'swan' ? 0.36 : 0.28; const wy = deckY + h;
      const wg = new THREE.ExtrudeGeometry(airfoil(chord, 0.12), { depth: span, bevelEnabled: false, curveSegments: 8 }); wg.rotateY(-Math.PI / 2); wg.rotateX(-0.12); wg.translate(span / 2, wy, rearZ + 0.08 + chord); add(wg, carbon);
      const ep = new THREE.Shape(); ep.moveTo(0, -0.08); ep.lineTo(chord + 0.06, -0.1); ep.lineTo(chord + 0.04, 0.1); ep.quadraticCurveTo(0.1, 0.12, 0, 0.05);
      for (const s of [-1, 1]) { const g = new THREE.ExtrudeGeometry(ep, { depth: 0.012, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(s * span / 2 - 0.006, wy, rearZ + 0.06 + chord); g.scale(1, 1, 1); add(g, carbon); }
      for (const s of [-1, 1]) { const x = s * span * 0.28; let g;
        if (t.spoiler === 'swan') g = tube([[x, wy + 0.04, rearZ + 0.2], [x, wy + 0.1, rearZ + 0.32], [x, deckY + 0.05, rearZ + 0.55]], 0.016, 20);
        else { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.16, 0); sh.lineTo(0.12, h); sh.lineTo(0.04, h); const g2 = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false }); g2.rotateY(-Math.PI / 2); g2.translate(x + 0.007, deckY - 0.02, rearZ + 0.22); g = g2; }
        add(g, metal); }
    }
    // front splitter / canards
    if (t.front !== 'stock') { const s = new THREE.Shape(); const hw = wid * 0.47; s.moveTo(-hw, 0); s.lineTo(hw, 0); s.quadraticCurveTo(hw + 0.02, 0.18, hw - 0.12, 0.22); s.lineTo(-hw + 0.12, 0.22); s.quadraticCurveTo(-hw - 0.02, 0.18, -hw, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, 0.16 + lift - 0.04, frontZ - 0.26); add(g, carbon);
      if (t.front === 'canards') for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) { const c = new THREE.Shape(); c.moveTo(0, 0); c.lineTo(0.16, 0.02); c.lineTo(0.02, 0.05); const cg = new THREE.ExtrudeGeometry(c, { depth: 0.01, bevelEnabled: false }); cg.rotateY(sx > 0 ? -Math.PI / 2 - 0.4 : Math.PI / 2 + 0.4); cg.translate(sx * (wid * 0.47), 0.3 + lift + k * 0.09, frontZ - 0.35); add(cg, carbon); } }
    if (t.skirts === 'sport' || kitType === 'super' || kitType === 'hyper') for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.06, 0.06, len * 0.42); g.translate(sx * wid * 0.475, 0.12 + lift, (frontZ + rearZ) / 2); add(g, t.skirts === 'sport' ? carbon : black); }
    // widebody flares
    if (t.widebody === 'flares') for (const w of this.wheels) { const g = new THREE.TorusGeometry(this.R + 0.06, 0.06, 8, 20, Math.PI); g.scale(1, 1, 1.8); g.rotateY(Math.PI / 2); g.translate(w.pos.x + Math.sign(w.pos.x) * 0.03, this.R, w.pos.z); add(g, black); }
    // class kits
    if (kitType === 'offroad') {
      const ry = (this.bodyHeightAt(0, 0) ?? 1.3) + 0.06; const rx = wid * 0.38;
      for (const sx of [-1, 1]) add(tube([[sx * rx, ry, -0.9], [sx * rx, ry + 0.08, -0.6], [sx * rx, ry + 0.08, 0.5], [sx * rx, ry, 0.75]], 0.02), metal);
      for (let k = 0; k < 4; k++) { const z = -0.6 + k * 0.36; const g = new THREE.CylinderGeometry(0.016, 0.016, rx * 2, 8); g.rotateZ(Math.PI / 2); g.translate(0, ry + 0.08, z); add(g, metal); }
      const lb = new THREE.BoxGeometry(rx * 1.7, 0.07, 0.08); lb.translate(0, ry + 0.13, 0.62); add(lb, black);
      const lens = new THREE.Mesh(new THREE.BoxGeometry(rx * 1.6, 0.05, 0.01).translate(0, ry + 0.13, 0.665), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dd, emissiveIntensity: 1.2 })); this.kit.add(lens); this.lightBar = lens;
      const fy = 0.35 + lift; add(tube([[-wid * 0.42, fy, frontZ - 0.12], [-wid * 0.3, fy + 0.3, frontZ + 0.02], [wid * 0.3, fy + 0.3, frontZ + 0.02], [wid * 0.42, fy, frontZ - 0.12]], 0.03, 30), metal);
      for (const sx of [-1, 1]) add(tube([[sx * 0.25, fy - 0.12, frontZ - 0.15], [sx * 0.25, fy + 0.3, frontZ + 0.02]], 0.026, 6), metal);
      // spare wheel
      const sp = new THREE.Mesh(new THREE.TorusGeometry(this.R * 0.78, this.R * 0.24, 12, 28), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.85 })); sp.position.set(0, 0.75 + lift * 0.6, rearZ - 0.12); sp.castShadow = true; this.kit.add(sp);
      for (const w of this.wheels) { if (w.front) continue; const f = new THREE.BoxGeometry(0.28, 0.25, 0.012); f.translate(w.pos.x, 0.2 + lift * 0.5, w.pos.z - this.R - 0.12); add(f, black); }
    }
    if (kitType === 'muscle') { const s = new THREE.Shape(); s.moveTo(-0.22, 0); s.lineTo(0.22, 0); s.lineTo(0.18, 0.09); s.lineTo(-0.18, 0.09); const g = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }); const hy = this.bodyHeightAt(0, frontZ - 0.95) ?? 0.8; g.translate(0, hy - 0.03, frontZ - 1.3); add(g, bodyMat); const mouth = new THREE.BoxGeometry(0.36, 0.06, 0.02).translate(0, hy + 0.05, frontZ - 0.74); add(mouth, black, false); }
    if (kitType === 'hyper') { const ry = this.bodyHeightAt(0, -0.2) ?? 1.05; const s = new THREE.Shape(); s.moveTo(-0.12, 0); s.lineTo(0.12, 0); s.lineTo(0.08, 0.16); s.lineTo(-0.08, 0.16); const g = new THREE.ExtrudeGeometry(s, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }); g.translate(0, ry - 0.04, -0.8); add(g, carbon);
      for (let k = -2; k <= 2; k++) { const f = new THREE.BoxGeometry(0.012, 0.16, 0.45).translate(k * wid * 0.16, 0.2 + lift, rearZ + 0.25); add(f, carbon); } }
    if (kitType === 'sedan' || kitType === 'hatch') { const g = new THREE.BoxGeometry(wid * 0.55, 0.015, 0.06).translate(0, (this.bodyHeightAt(0, 0.1) ?? 1.1) - 0.005, 0.1); add(g, metal); }
  }
  buildDecals(t) {
    while (this.decals.children.length) this.decals.children.pop().geometry.dispose();
    if (t.decal === 'none' || !this.bodyMesh) return; this.root.updateMatrixWorld(true);
    const bb = this.extents(); const mk = (draw, w, h) => { const tx = canvasTex(w, h, draw); return new THREE.MeshPhysicalMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.3, clearcoat: 1, alphaTest: 0.05 }); };
    const place = (mat, pos, rotY, size) => { const tmp = this.root.matrixWorld.clone(); const pw = pos.clone().applyMatrix4(tmp); const e = new THREE.Euler(0, rotY, 0); const g = new DecalGeometry(this.bodyMesh, pw, e, size); const inv = tmp.clone().invert(); g.applyMatrix4(inv); const m = new THREE.Mesh(g, mat); this.decals.add(m); };
    // decals are generated in root space; the body group may be transformed later, root must be identity-ish here
    const savedPos = this.root.position.clone(), savedQ = this.root.quaternion.clone(), bpos = this.body.position.clone(), bq = this.body.quaternion.clone();
    this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.body.position.set(0, 0, 0); this.body.quaternion.identity(); this.root.updateMatrixWorld(true);
    if (t.decal === 'number' || t.decal === 'both') {
      const mat = mk((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = '#111'; g.stroke(); g.fillStyle = '#111'; g.font = `900 ${w * 0.55}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(t.number), w / 2, h / 2 + 8); }, 256, 256);
      for (const s of [-1, 1]) place(mat, new THREE.Vector3(s * bb.max.x, 0.52 + this.model.position.y, 0.15), s > 0 ? Math.PI / 2 : -Math.PI / 2, new THREE.Vector3(0.52, 0.52, 0.8));
    }
    if (t.decal === 'sponsor' || t.decal === 'both') {
      const mat = mk((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 60px Arial'; g.fillText('HORIZON', 14, 62); g.fillStyle = '#ff7b00'; g.font = 'italic 800 40px Arial'; g.fillText('RACING TEAM', 18, 112); }, 512, 128);
      for (const s of [-1, 1]) place(mat, new THREE.Vector3(s * bb.max.x, 0.36 + this.model.position.y, -1.0), s > 0 ? Math.PI / 2 : -Math.PI / 2, new THREE.Vector3(0.9, 0.22, 0.8));
      const mat2 = mk((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = 'italic 900 72px Arial'; g.textAlign = 'center'; g.fillText('HD', w / 2, 86); g.strokeStyle = '#ff2a6d'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); }, 256, 128);
      const hy = this.bodyHeightAt(0, bb.max.z - 0.7) ?? 0.8; const g2 = new DecalGeometry(this.bodyMesh, new THREE.Vector3(0, hy, bb.max.z - 0.7), new THREE.Euler(-Math.PI / 2, 0, Math.PI), new THREE.Vector3(0.5, 0.25, 0.6)); this.decals.add(new THREE.Mesh(g2, mat2));
    }
    this.root.position.copy(savedPos); this.root.quaternion.copy(savedQ); this.body.position.copy(bpos); this.body.quaternion.copy(bq); this.root.updateMatrixWorld(true);
  }
  setNeon(col) {
    if (this.neon) { this.root.remove(this.neon); this.neon = null; } if (this.neonLight) { this.root.remove(this.neonLight); this.neonLight = null; }
    if (!col) return;
    const t = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    this.neon = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.85 }));
    this.neon.position.y = 0.03; this.neon.renderOrder = 3; this.root.add(this.neon);
    if (this.opts.lights) { this.neonLight = new THREE.PointLight(col, 4, 5, 1.5); this.neonLight.position.y = 0.15; this.root.add(this.neonLight); }
  }
  addHeadlights() {
    if (this.spots) return; this.spots = [];
    for (const s of [-1, 1]) { const l = new THREE.SpotLight(0xffffff, 0, 90, 0.5, 0.45, 1.4); l.position.set(s * 0.6, 0.7, 2.0); l.target.position.set(s * 0.8, 0, 22); this.body.add(l, l.target); this.spots.push(l); }
  }
  setLights(brake, night, rev) {
    this.mats.tail.emissiveIntensity = (brake ? 4 : 0.2) + night * 1.6;
    this.mats.head.emissiveIntensity = 0.3 + night * 6;
    if (this.spots) for (const s of this.spots) { s.intensity = night * 120; s.color.set(this.tune.headlight); }
    if (this.lightBar) this.lightBar.material.emissiveIntensity = 0.4 + night * 5;
  }
  setInteriorVisible(v) { for (const m of this.meshes) if (m.userData.interior) m.visible = v; }
  // deform body near local impact point
  damage(localPoint, dir, amount) {
    if (!this.bodyMesh || amount < 0.01) return;
    if (!this.bodyMesh.userData.own) { this.bodyMesh.geometry = this.bodyMesh.geometry.clone(); this.bodyMesh.userData.own = true; }
    this.root.updateMatrixWorld(true);
    const toMesh = new THREE.Matrix4().copy(this.bodyMesh.matrixWorld).invert().multiply(this.root.matrixWorld);
    const p = localPoint.clone().applyMatrix4(toMesh); const d = dir.clone().transformDirection(toMesh).normalize();
    const pos = this.bodyMesh.geometry.attributes.position; const rad = 0.55, amt = Math.min(0.09, amount);
    const v = new THREE.Vector3(); let changed = false;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const dd = v.distanceTo(p); if (dd < rad) { const f = (1 - dd / rad) ** 2 * amt; v.addScaledVector(d, f); v.x += (Math.random() - 0.5) * f * 0.25; pos.setXYZ(i, v.x, v.y, v.z); changed = true; } }
    if (changed) { pos.needsUpdate = true; clearTimeout(this._nt); this._nt = setTimeout(() => this.bodyMesh.geometry.computeVertexNormals(), 120); }
  }
  // per-frame pose from physics
  pose(st) {
    this.root.position.copy(st.pos); this.root.rotation.set(0, st.yaw, 0);
    this.body.rotation.set(-st.pitch, 0, st.roll, 'YXZ'); this.body.position.y = 0;
    for (let i = 0; i < 4; i++) { const w = this.wheels[i], ws = st.wheels[i]; w.pivot.position.y = this.R + ws.vis; w.steer.rotation.y = ws.steer; w.spin.rotation.x += ws.dSpin; }
    if (this.steering) this.steering.rotation.y = 0;
  }
  dispose() { this.root.traverse(o => { if (o.isMesh && o.userData.own) o.geometry.dispose(); }); }
}
