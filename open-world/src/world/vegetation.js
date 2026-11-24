// Vegetation: procedural trees (instanced per chunk, 2 LODs, wind sway, volumetric crown normals) + camera-following grass
import * as THREE from 'three';
import { G, canvasTex, mulberry32, hash2 } from '../core/util.js';
import { tex } from '../core/assets.js';
import { quality } from '../core/save.js';
import { timeU } from './ground.js';
import { isRoad, terrainH, CELL, RW, SW } from './citygen.js';

function leafTexture(kind) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const R = mulberry32(kind === 'pine' ? 7 : kind === 'palm' ? 3 : kind === 'birch' ? 5 : 11);
    if (kind === 'palm') {
      g.strokeStyle = '#5a6a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(8, h / 2); g.quadraticCurveTo(w / 2, h / 2 - 10, w - 6, h / 2 + 6); g.stroke();
      for (let i = 0; i < 46; i++) {
        const t = i / 46, x = 10 + t * (w - 20), y = h / 2 - 10 * Math.sin(t * Math.PI);
        const len = (1 - Math.abs(t - 0.35)) * 70;
        for (const s of [-1, 1]) { g.strokeStyle = `hsl(${78 + R() * 20},${45 + R() * 20}%,${22 + R() * 14}%)`; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + s * len); g.stroke(); }
      }
      return;
    }
    if (kind === 'pine') {
      for (let i = 0; i < 900; i++) {
        const x = R() * w, y = R() * h * 0.95; const a = Math.PI / 2 + (R() - 0.5) * 1.2;
        if (Math.abs(x - w / 2) > (y / h) * w * 0.5 + 6) continue;
        g.strokeStyle = `hsl(${105 + R() * 25},${30 + R() * 25}%,${12 + R() * 16}%)`; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
      }
      return;
    }
    const hue = kind === 'birch' ? 80 : 95;
    for (let i = 0; i < 520; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * w * 0.46;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      g.save(); g.translate(x, y); g.rotate(R() * Math.PI * 2);
      const l = 20 + R() * 12;
      g.fillStyle = `hsl(${hue + R() * 30},${40 + R() * 30}%,${18 + R() * 22 + (1 - r / (w * 0.46)) * 8}%)`;
      g.beginPath(); g.ellipse(0, 0, l * 0.5, l * 0.24, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,30,10,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-l * 0.5, 0); g.lineTo(l * 0.5, 0); g.stroke();
      g.restore();
    }
  });
}

function windify(m, amp = 1) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = timeU; sh.uniforms.uWind = G.windU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        #else
        vec3 ip = vec3(0.);
        #endif
        float hf = max(position.y-1.5,0.)*0.06*${amp.toFixed(2)};
        float ph = uT*(1.3+uWind) + ip.x*0.13 + ip.z*0.11;
        transformed.x += sin(ph + position.y*0.4)*hf*(0.4+uWind) + sin(ph*3.7+position.x*2.)*0.04*hf*8.;
        transformed.z += cos(ph*0.8 + position.y*0.3)*hf*(0.3+uWind*0.7);`);
  };
}

// --- tree geometry builders (return {trunk, leaves} BufferGeometries in local space) ---
function merge(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + o; } else for (let i = 0; i < c; i++) idx[oi++] = o + i;
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  return g;
}
function trunkSeg(x0, y0, z0, x1, y1, z1, r0, r1, seg = 7) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, seg, 1, true);
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), L = d.length();
  g.scale(1, L, 1); g.translate(0, L / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L / 2);
  return g;
}
function card(cx, cy, cz, size, R, center, droop = 0, stretch = 1) {
  const g = new THREE.PlaneGeometry(size, size * stretch);
  g.rotateX(-Math.PI / 2 + (R() - 0.5) * 2.2 + droop); g.rotateY(R() * Math.PI * 2); g.rotateZ((R() - 0.5) * 1.2);
  g.translate(cx, cy, cz);
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { // spherical normals => soft volumetric shading
    const v = new THREE.Vector3(p.getX(i) - center.x, (p.getY(i) - center.y) * 1.3, p.getZ(i) - center.z).normalize();
    n.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z);
  }
  return g;
}
function makeTree(type, lod) {
  const R = mulberry32(type.length * 31 + lod);
  const tr = [], lv = [];
  if (type === 'pine') {
    const H = 11;
    tr.push(trunkSeg(0, 0, 0, 0, H, 0, 0.32, 0.06, lod ? 5 : 8));
    const tiers = lod ? 4 : 8;
    for (let t = 0; t < tiers; t++) {
      const y = 2.6 + t * (H - 2.6) / tiers, r = 3.2 * (1 - t / tiers) + 0.5;
      const n = lod ? 3 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t;
        const g = new THREE.PlaneGeometry(r * 1.6, r * 1.3);
        g.rotateX(-Math.PI / 2 + 0.55); g.translate(0, 0.1, r * 0.55); g.rotateY(a); g.translate(0, y, 0);
        const p = g.attributes.position, nn = g.attributes.normal;
        for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3(p.getX(k), 0.6, p.getZ(k)).normalize(); nn.setXYZ(k, v.x, v.y, v.z); }
        lv.push(g);
      }
    }
  } else if (type === 'palm') {
    const H = 10; let px = 0, pz = 0;
    for (let s = 0; s < (lod ? 2 : 6); s++) {
      const n = lod ? 2 : 6; const y0 = (s / n) * H, y1 = ((s + 1) / n) * H; const bend = 0.12;
      const nx = px + bend * (s + 1) * 0.7;
      tr.push(trunkSeg(px, y0, pz, nx, y1, pz, 0.3 - s * 0.02, 0.28 - s * 0.02, lod ? 5 : 8)); px = nx;
    }
    const fr = lod ? 6 : 11;
    for (let i = 0; i < fr; i++) {
      const a = (i / fr) * Math.PI * 2;
      const g = new THREE.PlaneGeometry(5.2, 1.8, lod ? 1 : 4, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 2.6; p.setX(k, x); p.setZ(k, -0.06 * x * x); }
      g.rotateX(-Math.PI / 2); g.rotateY(a); g.translate(px, H, pz);
      g.computeVertexNormals();
      lv.push(g);
    }
  } else {
    const birch = type === 'birch', street = type === 'street';
    const H = birch ? 6 : street ? 3.6 : 4.2;
    tr.push(trunkSeg(0, 0, 0, 0.1, H, 0, birch ? 0.18 : 0.3, birch ? 0.12 : 0.2, lod ? 5 : 8));
    const center = new THREE.Vector3(0, H + (birch ? 2.6 : 2.4), 0);
    if (!lod) for (let b = 0; b < 4; b++) {
      const a = b * 1.7 + R(); const ex = Math.cos(a) * 2.2, ez = Math.sin(a) * 2.2;
      tr.push(trunkSeg(0.05, H * 0.85, 0, ex, H + 1.8 + R(), ez, 0.13, 0.05, 5));
    }
    const rx = birch ? 2.2 : street ? 2.6 : 3.4, ry = birch ? 3.4 : street ? 2.4 : 2.8;
    const n = lod ? 10 : birch ? 36 : 48;
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.cbrt(R()) * 0.85 + 0.15, s = Math.sqrt(1 - u * u);
      const cx = Math.cos(a) * s * rx * rr, cy = center.y + u * ry * rr, cz = Math.sin(a) * s * rx * rr;
      lv.push(card(cx, cy, cz, (lod ? 3.4 : 2.3) * (birch ? 0.8 : 1), R, center));
    }
  }
  return { trunk: merge(tr), leaves: merge(lv) };
}

export class Vegetation {
  constructor(scene, city, chunks) {
    this.scene = scene; this.city = city; this.chunks = chunks;
    this.blockSet = new Set(city.blocks.map((b) => b.i * 100 + b.j));
    this.grassRects = city.grassAreas;
    G.windU = G.windU || { value: 0.3 };
    const q = quality();
    const bark = new THREE.MeshStandardMaterial({ map: tex.bark_brown_02_diff, normalMap: tex.bark_brown_02_nor, roughness: 0.95, color: 0x9a8a7a });
    const birchBark = new THREE.MeshStandardMaterial({ map: tex.bark_brown_02_diff, roughness: 0.9, color: 0xe8e4dc });
    const palmBark = new THREE.MeshStandardMaterial({ map: tex.bark_brown_02_diff, normalMap: tex.bark_brown_02_nor, roughness: 0.95, color: 0xc0a080 });
    const leaf = (k, c) => { const m = new THREE.MeshStandardMaterial({ map: leafTexture(k), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: c, transparent: false }); windify(m, k === 'palm' ? 0.7 : 1); m.shadowSide = THREE.DoubleSide; return m; };
    this.types = {
      oak: { bark, leaf: leaf('oak', 0xd8e8c0) }, street: { bark, leaf: leaf('oak', 0xe0f0c0) }, birch: { bark: birchBark, leaf: leaf('birch', 0xe8ffc0) },
      pine: { bark, leaf: leaf('pine', 0xc8d8c0) }, palm: { bark: palmBark, leaf: leaf('palm', 0xe0e8b0) },
    };
    for (const [k, t] of Object.entries(this.types)) { t.g0 = makeTree(k, 0); t.g1 = makeTree(k, 1); }
    // group trees by chunk and type
    const groups = new Map();
    const R = mulberry32(5);
    for (const t of city.trees) {
      if (t.forest && R() > q.trees) continue;
      const key = chunks.key(t.x, t.z) + '|' + t.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [key, list] of groups) {
      const [ck, type] = key.split('|'); const T = this.types[type];
      for (const lod of [0, 1]) {
        const gT = lod ? T.g1.trunk : T.g0.trunk, gL = lod ? T.g1.leaves : T.g0.leaves;
        const it = new THREE.InstancedMesh(gT, T.bark, list.length), il = new THREE.InstancedMesh(gL, T.leaf, list.length);
        list.forEach((t, i) => {
          qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash2(t.x * 7 | 0, t.z * 7 | 0) * 6.28);
          s.setScalar(t.s); p.set(t.x, terrainH(t.x, t.z) + (t.forest ? 0 : 0.16), t.z);
          m4.compose(p, qq, s); it.setMatrixAt(i, m4); il.setMatrixAt(i, m4);
          const c = new THREE.Color().setHSL(0.22 + hash2(i, 3) * 0.08, 0.35, 0.45 + hash2(i, 9) * 0.25);
          il.setColorAt(i, c.multiplyScalar(2));
        });
        it.computeBoundingSphere(); il.computeBoundingSphere();
        it.castShadow = il.castShadow = lod === 0 && q.shadows > 0;
        it.receiveShadow = il.receiveShadow = true;
        chunks.add(ck, it, lod ? 'far' : 'near'); chunks.add(ck, il, lod ? 'far' : 'near');
      }
    }
    // tree colliders (trunks) for physics
    this.trunks = city.trees.filter((t) => !t.forest || hash2(t.x | 0, t.z | 0) < q.trees);
    this._grass(q);
  }
  _grass(q) {
    this.grassOn = q.grass;
    if (!q.grass) return;
    const bladeTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const R = mulberry32(17);
      for (let i = 0; i < 40; i++) {
        const x = 8 + R() * (w - 16), bend = (R() - 0.5) * 30, hh = h * (0.5 + R() * 0.5);
        const grd = g.createLinearGradient(0, h, 0, h - hh); grd.addColorStop(0, '#2c3a14'); grd.addColorStop(1, `hsl(${80 + R() * 25},45%,${38 + R() * 15}%)`);
        g.fillStyle = grd; g.beginPath(); g.moveTo(x - 2.5, h); g.quadraticCurveTo(x + bend * 0.5, h - hh * 0.6, x + bend, h - hh); g.quadraticCurveTo(x + bend * 0.5 + 1, h - hh * 0.6, x + 2.5, h); g.fill();
      }
    }, { repeat: false });
    const geo = new THREE.BufferGeometry();
    const parts = [];
    for (let i = 0; i < 3; i++) { const pg = new THREE.PlaneGeometry(1.1, 0.55); pg.translate(0, 0.27, 0); pg.rotateY((i / 3) * Math.PI); const n = pg.attributes.normal; for (let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0); parts.push(pg); }
    const mg = merge(parts);
    const mat = new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: 0xc0d0a0 });
    windify(mat, 6);
    this.grassN = q.peds > 60 ? 16000 : 11000;
    this.grass = new THREE.InstancedMesh(mg, mat, this.grassN);
    this.grass.frustumCulled = false; this.grass.receiveShadow = true;
    this.grass.count = 0;
    this.scene.add(this.grass);
    this._gc = null;
  }
  grassAt(x, z) {
    if (isRoad(x, z, 0.5)) return false;
    if (x > 1003 || z > 1000 || terrainH(x, z) < -0.2) return false;
    for (const a of this.city.grassAreas) if (x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1) return true;
    // inside a city slab (sidewalk/plaza) => no grass
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    const lx = x - i * CELL, lz = z - j * CELL;
    const inBlock = lx > RW && lx < CELL - RW && lz > RW && lz < CELL - RW;
    if (inBlock && this.blockSet.has(i * 100 + j)) return false;
    return true;
  }
  update(cam) {
    if (!this.grassOn || !this.grass) return;
    const cx = Math.round(cam.position.x / 6), cz = Math.round(cam.position.z / 6);
    if (this._gc === cx + ',' + cz) return;
    this._gc = cx + ',' + cz;
    const R = 46, st = 0.85, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    const x0 = Math.floor((cam.position.x - R) / st), x1 = Math.floor((cam.position.x + R) / st), z0 = Math.floor((cam.position.z - R) / st), z1 = Math.floor((cam.position.z + R) / st);
    for (let a = x0; a <= x1 && n < this.grassN; a++) for (let b = z0; b <= z1 && n < this.grassN; b++) {
      const h = hash2(a, b);
      const x = (a + h) * st, z = (b + hash2(b, a)) * st;
      const dx = x - cam.position.x, dz = z - cam.position.z;
      if (dx * dx + dz * dz > R * R) continue;
      if (!this.grassAt(x, z)) continue;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h * 6.28);
      const sc = 0.7 + hash2(a * 3, b) * 0.8;
      s.set(sc, sc * (0.8 + h * 0.6), sc);
      p.set(x, Math.max(0, terrainH(x, z)) + (this.inSlab(x, z) ? 0.17 : 0), z);
      m4.compose(p, q, s); this.grass.setMatrixAt(n++, m4);
    }
    this.grass.count = n;
    this.grass.instanceMatrix.needsUpdate = true;
  }
  inSlab(x, z) {
    const lx = x - Math.floor(x / CELL) * CELL, lz = z - Math.floor(z / CELL) * CELL;
    return lx > RW && lx < CELL - RW && lz > RW && lz < CELL - RW && Math.abs(x) < 1000 && Math.abs(z) < 1000;
  }
}
