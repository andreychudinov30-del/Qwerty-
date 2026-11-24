// Street furniture (instanced per chunk, breakable with Rapier), traffic lights, night light pools/cones, special structures
import * as THREE from 'three';
import { G, canvasTex, mulberry32, hash2, clamp } from '../core/util.js';
import { tex, models } from '../core/assets.js';
import { quality } from '../core/save.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { CELL, RW, CURB, hasLight, nodeDeg, vEdge, hEdge, WATER_Y } from './citygen.js';
import { GeoBuilder, vcMat } from './geo.js';
import { nightU } from './buildings.js';
import { timeU } from './ground.js';

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// ---------- prop templates ----------
function geoGroup(build) {
  const gb = new GeoBuilder(); build(gb);
  const grp = new THREE.Group();
  for (const k of gb.keys()) {
    const g = gb.build(k);
    const mat = k === 'metal' ? vcMat(0.35, 0.8) : k === 'glass' ? GLASS : k === 'lampglow' ? LAMPGLOW : k === 'paint' ? vcMat(0.45, 0.2) : vcMat(0.75, 0.0);
    const m = new THREE.Mesh(g, mat); m.castShadow = k !== 'lampglow'; grp.add(m);
  }
  return grp;
}
const GLASS = new THREE.MeshStandardMaterial({ color: 0x88a0a8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
const LAMPGLOW = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(1, 0.78, 0.5), emissiveIntensity: 0.1, roughness: 0.3 });

function fromGLB(name, scale = 1) {
  const g = models[name]; if (!g) return null;
  const grp = new THREE.Group();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => { if (o.isMesh) { const m = new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material); m.castShadow = true; grp.add(m); } });
  grp.scale.setScalar(scale);
  // bake scale
  for (const m of grp.children) m.geometry.scale(scale, scale, scale);
  grp.scale.setScalar(1);
  return grp;
}

export const PROP_DEF = {
  lamp: { mass: 140, shape: [0.12, 3.6, 0.12], off: 3.6, build: () => geoGroup((b) => {
    const dark = C('#3a3d40');
    b.cyl('metal', 0, 0, 0, 0.16, 0.1, 7.2, 10, { color: dark });
    b.cyl('metal', 0, 0, 0, 0.26, 0.24, 0.5, 10, { color: dark });
    b.box('metal', 0, 7.0, 0.9, 0.1, 0.1, 1.8, { color: dark });
    b.box('metal', 0, 6.86, 1.75, 0.45, 0.14, 0.9, { color: dark });
    b.box('lampglow', 0, 6.8, 1.75, 0.38, 0.05, 0.78);
  }) },
  hlamp: { mass: 220, shape: [0.15, 5, 0.15], off: 5, build: () => geoGroup((b) => {
    const g = C('#8a8e92');
    b.cyl('metal', 0, 0, 0, 0.2, 0.12, 10, 10, { color: g });
    for (const s of [-1, 1]) { b.box('metal', 0, 9.8, s * 1.2, 0.12, 0.12, 2.4, { color: g }); b.box('metal', 0, 9.65, s * 2.3, 0.5, 0.18, 1.0, { color: g }); b.box('lampglow', 0, 9.6, s * 2.3, 0.42, 0.05, 0.9); }
  }) },
  hydrant: { mass: 70, shape: [0.22, 0.45, 0.22], off: 0.45, spray: true, build: () => geoGroup((b) => {
    const r = C('#b8241c');
    b.cyl('paint', 0, 0, 0, 0.2, 0.18, 0.7, 12, { color: r }); b.cyl('paint', 0, 0.7, 0, 0.21, 0.05, 0.22, 12, { color: r });
    b.box('paint', 0, 0.42, 0, 0.55, 0.12, 0.12, { color: C('#d8d0c0') }); b.cyl('paint', 0, 0, 0, 0.27, 0.27, 0.08, 12, { color: r });
  }) },
  bin: { mass: 22, shape: [0.3, 0.45, 0.3], off: 0.45, glb: 'metal_trash_can', scale: 1 },
  bench: { mass: 45, shape: [0.9, 0.42, 0.35], off: 0.42, glb: 'painted_wooden_bench', scale: 1 },
  barrel: { mass: 35, shape: [0.3, 0.45, 0.3], off: 0.45, glb: 'Barrel_01', scale: 1 },
  box: { mass: 6, shape: [0.3, 0.25, 0.25], off: 0.25, glb: 'cardboard_box_01', scale: 1.4 },
  crate: { mass: 30, shape: [0.5, 0.5, 0.5], off: 0.5, build: () => geoGroup((b) => {
    const w = C('#8a6a42'), d = C('#5a4024');
    b.box('', 0, 0, 0, 1, 1, 1, { color: w });
    for (const s of [-1, 1]) { b.box('', 0, 0.02, s * 0.5, 1.04, 0.12, 0.04, { color: d }); b.box('', 0, 0.86, s * 0.5, 1.04, 0.12, 0.04, { color: d }); }
  }) },
  sign: { mass: 25, shape: [0.06, 1.4, 0.06], off: 1.4, build: () => geoGroup((b) => {
    b.cyl('metal', 0, 0, 0, 0.04, 0.04, 2.8, 6, { color: C('#9a9ea2') });
    b.cyl('paint', 0, 2.3, 0.05, 0.35, 0.35, 0.03, 16, { color: C('#c41c1c') });
    b.cyl('paint', 0, 2.3, 0.07, 0.27, 0.27, 0.03, 16, { color: C('#f2f2f2') });
  }) },
  meter: { mass: 20, shape: [0.1, 0.65, 0.1], off: 0.65, build: () => geoGroup((b) => {
    b.cyl('metal', 0, 0, 0, 0.04, 0.04, 1.1, 6, { color: C('#4a4e52') }); b.box('metal', 0, 1.05, 0, 0.22, 0.3, 0.16, { color: C('#7a7e82') }); b.box('glass', 0, 1.18, 0.085, 0.14, 0.1, 0.01);
  }) },
  busstop: { mass: 0, build: () => geoGroup((b) => {
    const m = C('#4a5258');
    for (const x of [-1.8, 1.8]) b.box('metal', x, 0, -0.6, 0.08, 2.5, 0.08, { color: m });
    b.box('metal', 0, 2.5, 0, 3.9, 0.1, 1.6, { color: m });
    b.box('glass', 0, 0.2, -0.65, 3.6, 2.2, 0.03);
    b.box('', 0, 0.45, -0.3, 3.2, 0.06, 0.45, { color: C('#7a5a3a') });
    b.box('lampglow', 1.7, 0.3, -0.62, 0.05, 1.9, 1.0);
  }) },
  fence: { mass: 0, build: () => geoGroup((b) => {
    const w = C('#e8e4dc');
    for (let i = 0; i < 12; i++) b.box('', -5.5 + i, 0, 0, 0.09, 1.0, 0.03, { color: w });
    b.box('', 0, 0.3, 0, 12, 0.08, 0.04, { color: w }); b.box('', 0, 0.75, 0, 12, 0.08, 0.04, { color: w });
  }) },
};

export class Props {
  constructor(scene, city, chunks, physics) {
    this.scene = scene; this.city = city; this.chunks = chunks; this.physics = physics;
    this.list = []; this.active = []; this.broken = [];
    this.grid = new Map();
    this.templates = {};
    for (const [k, d] of Object.entries(PROP_DEF)) {
      let t = d.glb ? fromGLB(d.glb, d.scale) : null;
      if (!t && d.build) t = d.build();
      if (!t) t = PROP_DEF.crate.build();
      this.templates[k] = t;
    }
    this._place();
    this._lightPools();
    this._trafficLights();
    this._special();
    this._t = 0;
  }
  _place() {
    const byChunkType = new Map();
    for (const p of this.city.props) {
      if (!this.templates[p.type]) continue;
      const k = this.chunks.key(p.x, p.z) + '|' + p.type;
      if (!byChunkType.has(k)) byChunkType.set(k, []);
      byChunkType.get(k).push(p);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (const [k, arr] of byChunkType) {
      const [ck, type] = k.split('|');
      const tpl = this.templates[type], def = PROP_DEF[type];
      const ims = tpl.children.map((c) => {
        const im = new THREE.InstancedMesh(c.geometry, c.material, arr.length);
        im.castShadow = c.castShadow && quality().shadows >= 2048; im.receiveShadow = true;
        this.chunks.add(ck, im, type === 'hlamp' || type === 'lamp' ? 'main' : 'near');
        return im;
      });
      arr.forEach((p, i) => {
        const y = (Math.abs(p.x) < 1000 && Math.abs(p.z) < 1000 && !p.hw) ? CURB : 0;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot || 0);
        if (type === 'fence') s.set((p.len || 12) / 12, 1, 1); else s.set(1, 1, 1);
        v.set(p.x, type === 'hlamp' ? 0 : y, p.z);
        m4.compose(v, q, s);
        for (const im of ims) im.setMatrixAt(i, m4);
        const rec = { type, def, x: p.x, y: v.y, z: p.z, rot: p.rot || 0, ims, i, body: null, mesh: null, broken: false, m: m4.clone() };
        this.list.push(rec);
        if (def.mass > 0) {
          const gk = Math.floor(p.x / 20) * 1000 + Math.floor(p.z / 20);
          if (!this.grid.has(gk)) this.grid.set(gk, []);
          this.grid.get(gk).push(rec);
        } else if (type === 'busstop') this.physics.staticBox(p.x, 1.25, p.z, 1.9, 1.25, 0.7, null, p.rot);
      });
      for (const im of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    }
  }
  _lightPools() {
    // additive ground light pools + volumetric cones under street lamps (visible at night / fog)
    const lamps = this.list.filter((p) => p.type === 'lamp' || p.type === 'hlamp');
    this.lamps = lamps;
    const poolTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,200,140,0.9)'); gr.addColorStop(0.5, 'rgba(255,170,100,0.3)'); gr.addColorStop(1, 'rgba(255,150,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { repeat: false });
    const poolG = new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2);
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
    const coneG = new THREE.ConeGeometry(4.2, 7, 18, 1, true).translate(0, -3.5, 0);
    this.coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY=position.y; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vN=normalize(normalMatrix*mat3(instanceMatrix)*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'uniform float uA; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(abs(dot(vN,vV)),1.5); float a=smoothstep(-7.,0.,vY)*0.9*f*uA; gl_FragColor=vec4(vec3(1.,0.75,0.45)*a,a); }',
    });
    const byChunk = new Map();
    for (const l of lamps) { const k = this.chunks.key(l.x, l.z); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(l); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (const [k, arr] of byChunk) {
      const pool = new THREE.InstancedMesh(poolG, this.poolMat, arr.length), cone = new THREE.InstancedMesh(coneG, this.coneMat, arr.length);
      arr.forEach((l, i) => {
        const hw = l.type === 'hlamp';
        const off = hw ? 0 : 1.75; const c = Math.cos(l.rot), sn = Math.sin(l.rot);
        const lx = l.x + sn * off, lz = l.z + c * off;
        l.lx = lx; l.lz = lz; l.ly = hw ? 9.6 : 6.8;
        v.set(lx, (hw ? 0.03 : CURB) + 0.02, lz); q.identity(); s.set(hw ? 1.4 : 1, 1, hw ? 1.4 : 1); m4.compose(v, q, s); pool.setMatrixAt(i, m4);
        v.set(lx, l.ly, lz); s.set(1, hw ? 1.35 : 0.97, 1); m4.compose(v, q, s); cone.setMatrixAt(i, m4);
        l.pool = pool; l.poolI = i; l.cone = cone;
      });
      pool.computeBoundingSphere(); cone.computeBoundingSphere();
      pool.renderOrder = 2; cone.renderOrder = 3;
      this.chunks.add(k, pool, 'main'); this.chunks.add(k, cone, 'near');
    }
    // real point lights pool (high+)
    this.plights = [];
    const n = quality().shadows >= 2048 ? 6 : quality().shadows ? 3 : 0;
    for (let i = 0; i < n; i++) { const L = new THREE.PointLight(0xffc890, 0, 22, 1.6); this.scene.add(L); this.plights.push(L); }
  }
  _trafficLights() {
    // 6 instanced lamp sets: [NS red, NS yel, NS green, EW red, EW yel, EW green]
    const housing = new GeoBuilder();
    const poleG = new THREE.CylinderGeometry(0.09, 0.11, 5.2, 8).translate(0, 2.6, 0);
    const armG = new THREE.BoxGeometry(0.08, 0.08, 3.4).translate(0, 5.0, 1.7);
    const boxG = new THREE.BoxGeometry(0.36, 1.05, 0.28).translate(0, 4.55, 3.3);
    const lampG = new THREE.SphereGeometry(0.115, 10, 8);
    const nodes = [];
    for (let k = -9; k <= 9; k++) for (let m = -9; m <= 9; m++) if (hasLight(k, m)) nodes.push([k, m]);
    this.tlNodes = nodes;
    const poles = [];
    for (const [k, m] of nodes) {
      const x = k * CELL, z = m * CELL;
      // approach +z (from smaller z) : pole at near-right corner facing -z ; arm extends over lanes (-x side)
      if (vEdge(k, m - 1)) poles.push({ x: x - 8.6, z: z - 8.8, rot: Math.PI / 2, axis: 'NS' });
      if (vEdge(k, m)) poles.push({ x: x + 8.6, z: z + 8.8, rot: -Math.PI / 2, axis: 'NS' });
      if (hEdge(k - 1, m)) poles.push({ x: x - 8.8, z: z + 8.6, rot: Math.PI, axis: 'EW' });
      if (hEdge(k, m)) poles.push({ x: x + 8.8, z: z - 8.6, rot: 0, axis: 'EW' });
    }
    const dark = vcMat(0.5, 0.6), body = new THREE.MeshStandardMaterial({ color: 0x1c1e20, roughness: 0.6, metalness: 0.5 });
    const ip = new THREE.InstancedMesh(poleG, body, poles.length), ia = new THREE.InstancedMesh(armG, body, poles.length), ib = new THREE.InstancedMesh(boxG, body, poles.length);
    const cols = [new THREE.Color(1, 0.08, 0.05), new THREE.Color(1, 0.6, 0.05), new THREE.Color(0.1, 1, 0.35)];
    this.tlMats = [];
    const lampMeshes = [];
    for (let a = 0; a < 2; a++) for (let c = 0; c < 3; c++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: cols[c], emissiveIntensity: 0.05, roughness: 0.2 });
      this.tlMats.push(mat);
      const list = poles.filter((p) => p.axis === (a ? 'EW' : 'NS'));
      const im = new THREE.InstancedMesh(lampG, mat, list.length);
      lampMeshes.push({ im, list, c });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), off = new THREE.Matrix4();
    poles.forEach((p, i) => {
      // pole local: arm along +z; rotate so arm points across the road
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot); v.set(p.x, CURB, p.z); m4.compose(v, q, s);
      ip.setMatrixAt(i, m4); ia.setMatrixAt(i, m4); ib.setMatrixAt(i, m4);
      p.m = m4.clone();
      this.physics.staticBox(p.x, 2.6, p.z, 0.12, 2.6, 0.12);
    });
    for (const { im, list, c } of lampMeshes) {
      list.forEach((p, i) => {
        off.makeTranslation(0.16, 4.9 - c * 0.33, 3.3);
        m4.copy(p.m).multiply(off);
        im.setMatrixAt(i, m4);
      });
      im.computeBoundingSphere(); this.scene.add(im);
    }
    for (const im of [ip, ia, ib]) { im.castShadow = true; im.computeBoundingSphere(); this.scene.add(im); }
  }
  // global signal phase: returns state for axis 'NS'|'EW' : 0 red 1 yellow 2 green
  signal(axis, t = G.t) {
    const T = 34, ph = t % T;
    const ns = ph < 14 ? 2 : ph < 17 ? 1 : 0;
    const ew = ph >= 17 && ph < 31 ? 2 : ph >= 31 && ph < 34 ? 1 : 0;
    return axis === 'NS' ? ns : ew;
  }
  _special() {
    const gb = new Map();
    const B = (x, z, layer = 'main') => { const k = this.chunks.key(x, z) + '|' + layer; if (!gb.has(k)) gb.set(k, new GeoBuilder()); return gb.get(k); };
    const R = mulberry32(3);
    this.fountains = []; this.planes = [];
    for (const s of this.city.special) {
      const b = B(s.x ?? (s.x0 + s.x1) / 2, s.z ?? (s.z0 + s.z1) / 2);
      switch (s.kind) {
        case 'container': {
          const c = C(s.color);
          b.box('corr', s.x, s.y + 0.0, s.z, 12.1, 2.55, 2.45, { color: c, tileU: 3, tileV: 2.6, top: 'corr' });
          break;
        }
        case 'chimney': b.cyl('brick', s.x, 0, s.z, s.r, s.r * 0.7, s.h, 14, { tileU: 3, tileV: 3 }); b.cyl('paint', s.x, s.h - 4, s.z, s.r * 0.74, s.r * 0.72, 1.2, 14, { color: C('#b02020'), cap: false }); this.physics.staticCyl(s.x, 0, s.z, s.r, s.h / 2); break;
        case 'tank': b.cyl('metal', s.x, 0, s.z, s.r, s.r, s.h, 20, { color: C('#c8ccd0') }); break;
        case 'gas': {
          const ox = s.x, oz = s.z;
          b.box('paint', ox, 5.2, oz, 26, 0.8, 14, { color: C('#e8e8e8') });
          b.box('paint', ox, 5.0, oz, 26.2, 0.25, 14.2, { color: C('#c81e1e') });
          b.box('lampglow', ox, 5.18, oz, 22, 0.02, 10);
          for (const px of [-9, 9]) for (const pz of [-4, 4]) { b.box('metal', ox + px, 0, oz + pz, 0.4, 5.2, 0.4, { color: C('#d0d0d0') }); this.physics.staticBox(ox + px, 2.6, oz + pz, 0.25, 2.6, 0.25); }
          for (const px of [-6, 0, 6]) { b.box('paint', ox + px, CURB, oz, 0.9, 1.7, 0.6, { color: C('#e4e4e4') }); b.box('paint', ox + px, CURB + 1.3, oz + 0.31, 0.7, 0.3, 0.02, { color: C('#c81e1e') }); this.physics.staticBox(ox + px, 1, oz, 0.5, 1, 0.35); }
          b.box('paint', ox + 16, 0, oz - 8, 0.6, 9, 0.6, { color: C('#c81e1e') }); b.box('lampglow', ox + 16, 7, oz - 8, 2.4, 2, 0.7);
          break;
        }
        case 'parking': {
          for (let r = 0; r < 3; r++) for (let n = 0; n <= 12; n++) b.box('white', s.x0 + 1 + n * 6.2, CURB + 0.005, s.z0 + 10 + r * 26, 0.12, 0.01, 5.2, {});
          break;
        }
        case 'fountain': {
          b.cyl('stone', s.x, CURB, s.z, 7, 7, 0.7, 28, { tileU: 2, tileV: 2 });
          b.cyl('stone', s.x, CURB, s.z, 1, 0.7, 2.4, 12, {});
          b.cyl('stone', s.x, CURB + 2.4, s.z, 2.2, 2.2, 0.25, 18, {});
          this.fountains.push({ x: s.x, z: s.z, y: CURB + 2.7 });
          this.physics.staticCyl(s.x, 0, s.z, 7, 0.5);
          const w = new THREE.Mesh(new THREE.CircleGeometry(6.6, 28).rotateX(-Math.PI / 2), this.waterMat());
          w.position.set(s.x, CURB + 0.6, s.z); this.chunks.add(this.chunks.key(s.x, s.z), w);
          for (let p = 0; p < 4; p++) { const a = p * Math.PI / 2; b.box('pave', s.x + Math.cos(a) * 20, CURB + 0.01, s.z + Math.sin(a) * 20, Math.abs(Math.cos(a)) * 26 + 3, 0.02, Math.abs(Math.sin(a)) * 26 + 3, {}); }
          break;
        }
        case 'pond': {
          const w = new THREE.Mesh(new THREE.CircleGeometry(s.r, 32).rotateX(-Math.PI / 2), this.waterMat());
          w.position.set(s.x, CURB + 0.03, s.z); this.chunks.add(this.chunks.key(s.x, s.z), w);
          for (let p = 0; p < 22; p++) { const a = p / 22 * Math.PI * 2; b.box('stone', s.x + Math.cos(a) * s.r, CURB - 0.1, s.z + Math.sin(a) * s.r, 1.6, 0.45, 1.3, {}); }
          break;
        }
        case 'park': {
          const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
          b.box('pave', cx, CURB + 0.015, cz, 4, 0.02, s.z1 - s.z0, {}); b.box('pave', cx, CURB + 0.015, cz, s.x1 - s.x0, 0.02, 4, {});
          break;
        }
        case 'playground': {
          const o = C('#d84a1a'), bl = C('#2a6ad8'), y = CURB;
          b.box('pave', s.x, y + 0.01, s.z, 12, 0.04, 9, { color: C('#c8b088') });
          for (const dx of [-2, 2]) { b.box('metal', s.x + dx, y, s.z - 2.5, 0.1, 2.4, 0.1, { color: bl }); }
          b.box('metal', s.x, y + 2.35, s.z - 2.5, 4.2, 0.1, 0.1, { color: bl });
          b.box('paint', s.x - 0.8, y + 0.6, s.z - 2.5, 0.5, 0.05, 0.25, { color: o }); b.box('paint', s.x + 0.8, y + 0.6, s.z - 2.5, 0.5, 0.05, 0.25, { color: o });
          b.box('paint', s.x + 3, y, s.z + 2, 1.2, 1.6, 1.2, { color: o });
          b.quad('paint', [s.x + 3.6, y + 1.6, s.z + 1.4], [s.x + 3.6, y + 1.6, s.z + 2.6], [s.x + 6.5, y + 0.1, s.z + 2.6], [s.x + 6.5, y + 0.1, s.z + 1.4], [0, 0], [1, 1], C('#e8c81a'));
          break;
        }
        case 'crane': {
          const yel = C('#d8a81a');
          for (const dz of [-8, 8]) for (const dx of [-5, 5]) b.box('paint', s.x + dx, 0, s.z + dz, 0.8, 34, 0.8, { color: yel });
          b.box('paint', s.x + 12, 33, s.z, 50, 2, 3, { color: yel }); b.box('paint', s.x, 30, s.z, 12, 1.2, 17, { color: yel });
          b.box('paint', s.x - 4, 34, s.z, 6, 3, 4, { color: C('#e8e0d0') });
          for (const dz of [-8, 8]) for (const dx of [-5, 5]) this.physics.staticBox(s.x + dx, 17, s.z + dz, 0.4, 17, 0.4);
          break;
        }
        case 'stadium': {
          b.cyl('stone', s.x, 0, s.z, s.r, s.r, 18, 40, { tileU: 4, tileV: 4 });
          b.cyl('paint', s.x, 18, s.z, s.r + 1, s.r + 1, 1.2, 40, { color: C('#2a4a8a') });
          for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; b.box('metal', s.x + Math.cos(a) * (s.r + 2), 0, s.z + Math.sin(a) * (s.r + 2), 0.6, 30, 0.6, { color: C('#8a8a8a') }); b.box('lampglow', s.x + Math.cos(a) * (s.r + 2), 29, s.z + Math.sin(a) * (s.r + 2), 3, 2, 3); }
          break;
        }
        case 'spire': b.box('wall', s.x, 0, s.z, 8, 24, 8, { color: C('#e8e4dc'), tileU: 3, tileV: 3 }); b.cyl('slate', s.x, 24, s.z, 5.6, 0.05, s.h - 24, 4, { color: C('#3a3e4a') }); break;
        case 'pier': {
          const L = s.len;
          b.box('wood', s.x + L / 2, 0.0, s.z, L, 0.6, 8, { tileU: 2, tileV: 2 });
          for (let i = 0; i < L; i += 8) for (const dz of [-3.6, 3.6]) b.cyl('wood', s.x + i, -4, s.z + dz, 0.25, 0.25, 4.6, 8, {});
          for (const dz of [-3.9, 3.9]) b.box('wood', s.x + L / 2, 0.6, s.z + dz, L, 0.9, 0.12, {});
          break;
        }
        case 'airport': this._airport(B); break;
      }
    }
    const mats = {
      corr: new THREE.MeshStandardMaterial({ map: tex.corrugated_iron_diff, normalMap: tex.corrugated_iron_nor, roughness: 0.6, metalness: 0.4, vertexColors: true }),
      brick: new THREE.MeshStandardMaterial({ map: tex.brick_wall_02_diff, normalMap: tex.brick_wall_02_nor, roughness: 0.9, vertexColors: true }),
      stone: new THREE.MeshStandardMaterial({ map: tex.concrete_wall_008_diff, roughness: 0.85, color: 0xd0ccc4, vertexColors: true }),
      pave: new THREE.MeshStandardMaterial({ map: tex.concrete_pavement_diff, roughness: 0.9, color: 0xd8d0c4, vertexColors: true }),
      wood: new THREE.MeshStandardMaterial({ map: tex.old_planks_02_diff || null, roughness: 0.85, color: 0x9a7a5a, vertexColors: true }),
      wall: new THREE.MeshStandardMaterial({ map: tex.grey_plaster_diff, roughness: 0.9, vertexColors: true }),
      white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.7 }),
      slate: vcMat(0.5, 0.3), metal: vcMat(0.35, 0.8), paint: vcMat(0.45, 0.15), lampglow: LAMPGLOW, glass: GLASS,
      tglass: new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.05, metalness: 0.9, vertexColors: true }),
    };
    for (const [k, g] of gb) {
      const [ck, layer] = k.split('|');
      for (const key of g.keys()) {
        const geo = g.build(key); if (!geo) continue;
        const m = new THREE.Mesh(geo, mats[key] || vcMat(0.7, 0));
        m.castShadow = key !== 'white' && key !== 'pave' && key !== 'lampglow'; m.receiveShadow = true;
        this.chunks.add(ck, m, layer);
      }
    }
  }
  waterMat() {
    if (this._wm) return this._wm;
    this._wm = new THREE.MeshStandardMaterial({ color: 0x1a4a56, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.85 });
    return this._wm;
  }
  _airport(B) {
    const b = B(0, 1140), y = 0;
    // terminal
    b.box('tglass', 0, 0, 1140, 180, 18, 40, { color: [0.8, 0.9, 1] });
    b.box('paint', 0, 18, 1140, 186, 1.5, 46, { color: C('#e0e0e0') });
    b.box('paint', 0, 0, 1118, 182, 6, 2, { color: C('#c8c8c8') });
    // control tower
    b.cyl('stone', 160, 0, 1150, 4, 3.5, 46, 16, {});
    b.cyl('tglass', 160, 46, 1150, 7, 8, 6, 16, { color: [0.7, 0.85, 1] });
    b.cyl('paint', 160, 52, 1150, 8.5, 2, 2, 16, { color: C('#d8d8d8') });
    this.physics.staticCyl(160, 0, 1150, 4, 26);
    // hangars
    for (let h = 0; h < 3; h++) {
      const hx = -420 + h * 70, hz = 1150, hb = B(hx, hz);
      for (let s = 0; s < 8; s++) {
        const a0 = s / 8 * Math.PI, a1 = (s + 1) / 8 * Math.PI, r = 28;
        hb.quad('corr', [hx + Math.cos(a0) * r, Math.sin(a0) * 18, hz + 22], [hx + Math.cos(a1) * r, Math.sin(a1) * 18, hz + 22], [hx + Math.cos(a1) * r, Math.sin(a1) * 18, hz - 22], [hx + Math.cos(a0) * r, Math.sin(a0) * 18, hz - 22], [0, 0], [6, 12], [0.85, 0.87, 0.9]);
      }
      hb.box('corr', hx, 0, hz - 22, 56, 9, 0.5, { color: [0.8, 0.8, 0.82], tileU: 3, tileV: 3 });
    }
    // runway edge lights
    for (let x = -740; x <= 740; x += 40) for (const dz of [-34, 34]) b.box('lampglow', x, 0, 1260 + dz, 0.4, 0.3, 0.4);
    // parked planes
    for (let p = 0; p < 4; p++) {
      const pl = makePlane(); pl.position.set(-250 + p * 120, 0, 1078); pl.rotation.y = Math.PI / 2 * (p % 2 ? 1 : -1) * 0 + Math.PI;
      this.scene.add(pl);
      this.physics.staticBox(pl.position.x, 3, pl.position.z, 2.5, 3, 18);
    }
    const flying = makePlane(); this.scene.add(flying); this.planes.push({ mesh: flying, t: 0 });
  }
  update(dt, player, activators) {
    const night = nightU.value, fog = this.scene.fog ? this.scene.fog.density : 0;
    LAMPGLOW.emissiveIntensity = 0.1 + night * 9;
    this.poolMat.opacity = night * 0.55;
    this.coneMat.uniforms.uA.value = night * (0.18 + Math.min(fog * 300, 0.5));
    // traffic signals
    for (let a = 0; a < 2; a++) {
      const st = this.signal(a ? 'EW' : 'NS');
      for (let c = 0; c < 3; c++) this.tlMats[a * 3 + c].emissiveIntensity = (c === 0 && st === 0) || (c === 1 && st === 1) || (c === 2 && st === 2) ? 9 : 0.04;
    }
    // nearest lamps get real point lights
    if (this.plights.length && player) {
      const px = player.x, pz = player.z;
      if (!this._lt || G.t - this._lt > 0.5) {
        this._lt = G.t;
        this._near = this.lamps.filter((l) => !l.broken && Math.abs(l.lx - px) < 60 && Math.abs(l.lz - pz) < 60).sort((a, b) => ((a.lx - px) ** 2 + (a.lz - pz) ** 2) - ((b.lx - px) ** 2 + (b.lz - pz) ** 2)).slice(0, this.plights.length);
      }
      this.plights.forEach((L, i) => { const l = this._near[i]; if (l && night > 0.2) { L.position.set(l.lx, l.ly - 0.5, l.lz); L.intensity = night * 60; } else L.intensity = 0; });
    }
    // planes
    for (const p of this.planes) {
      p.t = (p.t + dt) % 120;
      const t = p.t;
      const x = -800 + t * 22, alt = t < 40 ? 0 : Math.pow((t - 40) / 10, 1.8) * 6;
      p.mesh.position.set(x, alt, 1260); p.mesh.rotation.set(0, Math.PI / 2, 0); p.mesh.rotateX(-Math.min(0.2, alt * 0.004));
      p.mesh.visible = t < 110;
    }
    // breakable activation
    this._t += dt;
    if (this._t > 0.15) {
      this._t = 0;
      for (const a of activators) {
        const r = 6 + (a.speed || 0) * 0.6;
        const x0 = Math.floor((a.x - r) / 20), x1 = Math.floor((a.x + r) / 20), z0 = Math.floor((a.z - r) / 20), z1 = Math.floor((a.z + r) / 20);
        for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
          const l = this.grid.get(i * 1000 + j); if (!l) continue;
          for (const p of l) if (!p.body && !p.broken) this._activate(p);
        }
      }
      for (let i = this.active.length - 1; i >= 0; i--) {
        const p = this.active[i];
        let near = false;
        for (const a of activators) if (Math.abs(a.x - p.x) < 30 && Math.abs(a.z - p.z) < 30) { near = true; break; }
        if (!near && !p.broken) { this.physics.world.removeRigidBody(p.body); p.body = null; this.active.splice(i, 1); }
      }
    }
    for (const p of this.active) {
      if (!p.body) continue;
      const t = p.body.translation();
      if (!p.broken) {
        const moved = Math.abs(t.x - p.x) + Math.abs(t.z - p.z) + Math.abs(t.y - (p.y + p.def.off)) > 0.06 || !p.body.isSleeping() && p.body.linvel().y < -0.5;
        if (moved) this._break(p);
      }
      if (p.mesh) {
        const r = p.body.rotation();
        p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        const o = new THREE.Vector3(0, -p.def.off, 0).applyQuaternion(p.mesh.quaternion);
        p.mesh.position.set(t.x + o.x, t.y + o.y, t.z + o.z);
      }
    }
    // restore far broken props
    if (player) for (let i = this.broken.length - 1; i >= 0; i--) {
      const p = this.broken[i];
      if (Math.abs(p.x - player.x) > 220 || Math.abs(p.z - player.z) > 220) this._restore(p, i);
    }
  }
  _activate(p) {
    const s = p.def.shape;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y + p.def.off, p.z).setRotation(q).setLinearDamping(0.3).setAngularDamping(0.5).setCanSleep(true).setSleeping(true);
    p.body = this.physics.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(s[0], s[1], s[2]).setMass(p.def.mass).setFriction(0.6).setRestitution(0.15).setCollisionGroups(groups(GR.PROP, GR.STATIC | GR.VEHICLE | GR.PROP | GR.RAGDOLL));
    // lower center of mass for poles so they pivot on the base
    const col = this.physics.world.createCollider(cd, p.body);
    this.physics.handles.set(col.handle, { type: 'prop', p });
    this.active.push(p);
  }
  _break(p) {
    p.broken = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of p.ims) { im.setMatrixAt(p.i, zero); im.instanceMatrix.needsUpdate = true; }
    p.mesh = this.templates[p.type].clone();
    p.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(p.mesh);
    if (p.type === 'lamp' || p.type === 'hlamp') { const m = new THREE.Matrix4().makeScale(0, 0, 0); p.pool && (p.pool.setMatrixAt(p.poolI, m), p.pool.instanceMatrix.needsUpdate = true); p.cone && (p.cone.setMatrixAt(p.poolI, m), p.cone.instanceMatrix.needsUpdate = true); }
    if (p.def.spray && G.fx) G.fx.spray(p.x, p.y + 0.4, p.z, 25);
    if (G.audio) G.audio.hit(p.x, p.y, p.z, p.def.mass > 60 ? 'metal' : 'light');
    G.bus && G.bus.emit('propBroken', p);
    this.broken.push(p);
  }
  _restore(p, i) {
    if (p.body) { this.physics.world.removeRigidBody(p.body); p.body = null; }
    const ai = this.active.indexOf(p); if (ai >= 0) this.active.splice(ai, 1);
    if (p.mesh) { this.scene.remove(p.mesh); p.mesh = null; }
    for (const im of p.ims) { im.setMatrixAt(p.i, p.m); im.instanceMatrix.needsUpdate = true; }
    if (p.pool) {
      const m = new THREE.Matrix4(), v = new THREE.Vector3(p.lx, (p.type === 'hlamp' ? 0.03 : CURB) + 0.02, p.lz), s = p.type === 'hlamp' ? 1.4 : 1;
      m.compose(v, new THREE.Quaternion(), new THREE.Vector3(s, 1, s)); p.pool.setMatrixAt(p.poolI, m); p.pool.instanceMatrix.needsUpdate = true;
      m.compose(new THREE.Vector3(p.lx, p.ly, p.lz), new THREE.Quaternion(), new THREE.Vector3(1, p.type === 'hlamp' ? 1.35 : 0.97, 1)); p.cone.setMatrixAt(p.poolI, m); p.cone.instanceMatrix.needsUpdate = true;
    }
    p.broken = false;
    this.broken.splice(i, 1);
  }
}

export function makePlane() {
  const g = new GeoBuilder(), w = [0.95, 0.95, 0.96], blu = C('#1c3c8c');
  g.cyl('p', 0, -18, 0, 2.4, 2.4, 36, 16, { color: w });
  g.cyl('p', 0, 18, 0, 2.4, 0.6, 5, 16, { color: w });
  g.cyl('p', 0, -18, 0, 2.4, 0.3, -4, 16, { color: w });
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g.build('p'), vcMat(0.3, 0.3)); body.rotation.x = Math.PI / 2; body.position.y = 4; grp.add(body);
  const w2 = new GeoBuilder();
  w2.quad('w', [-2, 3.2, 2], [-22, 3.6, -6], [-22, 3.6, -9], [-2, 3.2, -6], [0, 0], [1, 1], w);
  w2.quad('w', [2, 3.2, -6], [22, 3.6, -9], [22, 3.6, -6], [2, 3.2, 2], [0, 0], [1, 1], w);
  w2.quad('w', [-2, 3.2, -6], [-22, 3.6, -9], [-22, 3.6, -6], [-2, 3.2, 2], [0, 0], [1, 1], w);
  w2.quad('w', [2, 3.2, 2], [22, 3.6, -6], [22, 3.6, -9], [2, 3.2, -6], [0, 0], [1, 1], w);
  w2.quad('w', [0, 5, -16], [0, 13, -21], [0, 13, -18], [0, 5, -11], [0, 0], [1, 1], blu);
  w2.quad('w', [0, 5, -11], [0, 13, -18], [0, 13, -21], [0, 5, -16], [0, 0], [1, 1], blu);
  w2.quad('w', [-8, 5, -18], [8, 5, -18], [8, 5, -21], [-8, 5, -21], [0, 0], [1, 1], w);
  w2.quad('w', [-8, 5, -21], [8, 5, -21], [8, 5, -18], [-8, 5, -18], [0, 0], [1, 1], w);
  for (const k of w2.keys()) { const m = new THREE.Mesh(w2.build(k), vcMat(0.35, 0.3, { side: THREE.DoubleSide })); grp.add(m); }
  // engines rotate to lie along z
  grp.children.forEach((c) => { c.castShadow = true; });
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3, 6), vcMat(0.5, 0.5)); gear.position.set(0, 1.5, 8); grp.add(gear);
  return grp;
}
