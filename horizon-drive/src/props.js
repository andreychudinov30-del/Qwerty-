import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTex, pbr } from './assets.js';
import { rng, clamp, smooth, makeNoise } from './noise.js';
import { SURF, timeUniform } from './world.js';

export const nightUniform = { value: 0 };
export const windUniform = { value: 0.3 };

// ---------- procedural textures ----------
function branchTex(hue = [0.27, 0.42]) {
  return canvasTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); const r = rng(5);
    g.strokeStyle = '#3b2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h / 2); g.quadraticCurveTo(w / 2, h / 2 + 6, w, h / 2 + 14); g.stroke();
    for (let i = 0; i < 900; i++) {
      const t = r(); const x = t * w * 0.97, y = h / 2 + 14 * t * t; const len = (1 - t * 0.6) * (22 + r() * 22); const side = r() < 0.5 ? -1 : 1; const a = side * (0.6 + r() * 0.7) + 0.25;
      const l = 18 + r() * 26; g.strokeStyle = `hsl(${(hue[0] + r() * (hue[1] - hue[0])) * 360},${35 + r() * 25}%,${l}%)`; g.lineWidth = 1.2 + r();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len); g.stroke();
    }
  }, { mip: true });
}
function leafTex(colA = 95, colB = 125) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(9); g.clearRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.45; const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
      g.fillStyle = `hsl(${colA + r() * (colB - colA)},${40 + r() * 30}%,${18 + r() * 28}%)`; g.save(); g.translate(x, y); g.rotate(r() * 6.28); g.beginPath(); g.ellipse(0, 0, 9 + r() * 6, 4 + r() * 3, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  });
}
function frondTex() {
  return canvasTex(512, 128, (g, w, h) => {
    const r = rng(3); g.clearRect(0, 0, w, h); g.strokeStyle = '#6a5a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (let i = 0; i < 90; i++) { const t = i / 90; const x = t * w; const L = Math.sin(Math.min(1, t * 1.3) * Math.PI) * 58 + 6; for (const s of [-1, 1]) { g.strokeStyle = `hsl(${80 + r() * 30},${45 + r() * 20}%,${22 + r() * 18}%)`; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 10, h / 2 + s * L * 0.6, x + 22, h / 2 + s * L); g.stroke(); } }
  });
}
function grassTex(cols) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rng(17); g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = 40 + r() * (w - 80), bh = h * (0.25 + r() ** 2 * 0.75), bend = (r() - 0.5) * 50, bw = 2 + r() * 2.5; const c = cols[Math.floor(r() * cols.length)];
      const gr = g.createLinearGradient(0, h, 0, h - bh); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]); g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - bw, h); g.quadraticCurveTo(x + bend * 0.3, h - bh * 0.5, x + bend, h - bh); g.quadraticCurveTo(x + bend * 0.3 + 1, h - bh * 0.5, x + bw, h); g.fill();
    }
  });
}
function facadeTex(kind, seed) {
  const r = rng(seed); const W = 256, H = 512;
  const draw = (lit) => (g) => {
    if (kind === 'glass') { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, lit ? '#000' : '#5f7d96'); gr.addColorStop(1, lit ? '#000' : '#2b3d4f'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    else { g.fillStyle = lit ? '#000' : (kind === 'office' ? '#b9b4aa' : '#c9a98a'); g.fillRect(0, 0, W, H); }
    const cols = kind === 'glass' ? 6 : 4, rows = kind === 'glass' ? 12 : 8; const cw = W / cols, rh = H / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const on = r() < 0.38; const warm = r() < 0.7;
      if (lit) { if (on) { g.fillStyle = warm ? `rgba(255,${200 + r() * 40},${120 + r() * 60},${0.5 + r() * 0.5})` : `rgba(180,220,255,${0.5 + r() * 0.5})`; g.fillRect(i * cw + 3, j * rh + 3, cw - 6, rh - 6); } continue; }
      if (kind === 'glass') { g.fillStyle = `rgba(${20 + r() * 30},${40 + r() * 40},${60 + r() * 40},${0.35 + r() * 0.3})`; g.fillRect(i * cw + 2, j * rh + 2, cw - 4, rh - 4); g.fillStyle = '#9aa7b2'; g.fillRect(i * cw, j * rh, cw, 2); g.fillRect(i * cw, j * rh, 2, rh); }
      else { g.fillStyle = '#20272e'; g.fillRect(i * cw + cw * 0.15, j * rh + rh * 0.2, cw * 0.7, rh * 0.6); g.fillStyle = 'rgba(160,190,210,0.25)'; g.fillRect(i * cw + cw * 0.15, j * rh + rh * 0.2, cw * 0.35, rh * 0.6); if (kind === 'resid' && j % 2 === 0) { g.fillStyle = '#8d7a68'; g.fillRect(i * cw + cw * 0.08, j * rh + rh * 0.78, cw * 0.84, rh * 0.08); } }
    }
    if (kind !== 'glass' && !lit) { const n = 4000; for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * W, r() * H, 2, 2); } }
  };
  return { map: canvasTex(W, H, draw(false)), emi: canvasTex(W, H, draw(true)) };
}

// ---------- geometries ----------
function pineGeo(detail) {
  const parts = []; const r = rng(77);
  const trunk = new THREE.CylinderGeometry(0.12, 0.32, 11, detail ? 7 : 5, 1); trunk.translate(0, 5.5, 0); paint(trunk, 0x4a3726); parts.push(trunk);
  if (!detail) { for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry(2.6 - k * 0.7, 5 - k * 0.8, 8, 1); c.translate(0, 3.2 + k * 2.7 + 2, 0); paint(c, 0x1f3a1c); parts.push(c); } return mergeGeometries(parts.map(p => p.toNonIndexed())); }
  const card = new THREE.PlaneGeometry(1, 0.55, 2, 1); card.translate(0.5, 0, 0);
  const tiers = 11;
  for (let t = 0; t < tiers; t++) {
    const y = 2.2 + t * 0.82, len = 3.0 * (1 - t / tiers) + 0.5, n = 6 + Math.floor((1 - t / tiers) * 4);
    for (let b = 0; b < n; b++) {
      const g = card.clone(); g.scale(len, len * 0.9, 1); g.rotateX(r() * 0.8); g.rotateZ(-0.25 - r() * 0.25); g.rotateY(b / n * Math.PI * 2 + t * 0.7 + r() * 0.4); g.translate(0, y, 0);
      const c = new THREE.Color().setHSL(0.3 + r() * 0.05, 0.35 + r() * 0.15, 0.32 + t / tiers * 0.12); paint(g, c.getHex(), true); parts.push(g);
    }
  }
  const top = card.clone(); top.scale(1.4, 1.4, 1); top.rotateZ(Math.PI / 2); top.translate(0, 11.4, 0); paint(top, 0x335c2e, true); parts.push(top);
  return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}
function paint(g, hex, upNormals = false) {
  const c = new THREE.Color(hex); const n = g.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (upNormals) { const p = g.attributes.position, nn = g.attributes.normal; for (let i = 0; i < n; i++) { const x = p.getX(i), z = p.getZ(i); const l = Math.hypot(x, z) || 1; nn.setXYZ(i, x / l * 0.6, 0.8, z / l * 0.6); } }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
}
function roundTreeGeo(detail) {
  const parts = []; const r = rng(31);
  const trunk = new THREE.CylinderGeometry(0.18, 0.34, 5, 6); trunk.translate(0, 2.5, 0); paint(trunk, 0x5a4634); parts.push(trunk);
  if (!detail) { const s = new THREE.IcosahedronGeometry(3, 1); s.scale(1, 0.85, 1); s.translate(0, 6, 0); paint(s, 0x3e5a24); parts.push(s); return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); }
  const card = new THREE.PlaneGeometry(2.6, 2.6);
  for (let i = 0; i < 26; i++) { const g = card.clone(); g.rotateY(r() * 6.28); g.rotateX((r() - 0.5) * 1.2); const a = r() * 6.28, d = Math.sqrt(r()) * 2.2; g.translate(Math.cos(a) * d, 5.2 + (r() - 0.3) * 3, Math.sin(a) * d); paint(g, new THREE.Color().setHSL(0.25 + r() * 0.06, 0.4, 0.42 + r() * 0.15).getHex(), true); parts.push(g); }
  return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}
function palmGeo() {
  const r = rng(13); const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * 1.6, t * 11, 0)); }
  const trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.22, 7); paint(trunk, 0x8a7458);
  // ring bumps via vertex colors
  const p = trunk.attributes.position, c = trunk.attributes.color; for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.25 * Math.sin(p.getY(i) * 9); c.setXYZ(i, 0.54 * k, 0.45 * k, 0.34 * k); }
  const parts = [trunk.toNonIndexed()]; const top = pts[8];
  const fr = new THREE.PlaneGeometry(4.2, 1.1, 6, 1); fr.translate(2.1, 0, 0); const fp = fr.attributes.position; for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setY(i, fp.getY(i) - (x / 4.2) ** 2 * 1.6); }
  for (let i = 0; i < 11; i++) { const g = fr.clone(); g.rotateX(Math.PI / 2 + (r() - 0.5) * 0.6); g.rotateZ(0.35 + r() * 0.3); g.rotateY(i / 11 * Math.PI * 2 + r() * 0.3); g.translate(top.x, top.y, top.z); paint(g, new THREE.Color().setHSL(0.24, 0.45, 0.4 + r() * 0.1).getHex(), true); parts.push(g.toNonIndexed()); }
  return mergeGeometries(parts);
}
function cactusGeo() {
  const mk = (r0, h) => { const g = new THREE.CylinderGeometry(r0 * 0.85, r0, h, 16, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.12 * Math.cos(a * 8); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } const tp = new THREE.SphereGeometry(r0 * 0.85, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2); tp.translate(0, h / 2, 0); const m = mergeGeometries([g.toNonIndexed(), tp.toNonIndexed()]); m.translate(0, h / 2, 0); return m; };
  const body = mk(0.32, 6.5); paint(body, 0x4f6b3a);
  const arm = (y, s, h) => { const a = mk(0.22, h); a.translate(s * 0.75, y, 0); const e = new THREE.TorusGeometry(0.37, 0.2, 8, 10, Math.PI / 2); e.rotateZ(s > 0 ? -Math.PI / 2 : Math.PI); e.translate(s * 0.37, y, 0); const m = mergeGeometries([a, e.toNonIndexed()]); paint(m, 0x4d6838); return m; };
  return mergeGeometries([body, arm(2.4, 1, 2.4), arm(3.2, -1, 1.8)]);
}
function rockGeo(seed, detail = 4) { const n = makeNoise(seed); const g = new THREE.IcosahedronGeometry(1, detail); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const k = 1 + 0.35 * n.fbm(v.x * 1.3 + seed, v.z * 1.3 + v.y, 4); v.multiplyScalar(k); v.y *= 0.65; p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; }

const cardMat = (map, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, ...opts });
  m.onBeforeCompile = sh => { sh.uniforms.uTime = timeUniform; sh.uniforms.uWind = windUniform; sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float sw = uWind * max(0.0, position.y - 1.0) * 0.02; vec4 wp = instanceMatrix * vec4(0.,0.,0.,1.);
    transformed.x += sin(uTime * 1.7 + wp.x * 0.13 + position.y * 0.4) * sw; transformed.z += cos(uTime * 1.3 + wp.z * 0.11) * sw * 0.7;`); };
  m.customProgramCacheKey = () => 'card'; return m;
};

// LOD-instanced set: near detailed + far simple, rebuilt around camera
class LODSet {
  constructor(group, nearGeo, farGeo, nearMat, farMat, items, nearR, farR, cast = true) {
    this.items = items; this.nearR = nearR; this.farR = farR;
    this.near = new THREE.InstancedMesh(nearGeo, nearMat, Math.max(1, items.length)); this.near.castShadow = cast; this.near.receiveShadow = true; this.near.frustumCulled = false;
    this.far = farGeo ? new THREE.InstancedMesh(farGeo, farMat, Math.max(1, items.length)) : null; if (this.far) { this.far.frustumCulled = false; this.far.receiveShadow = true; }
    group.add(this.near); if (this.far) group.add(this.far); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3(); this.last = new THREE.Vector3(1e9, 0, 0);
  }
  update(cam, force) {
    if (!force && cam.distanceToSquared(this.last) < 400) return; this.last.copy(cam);
    let a = 0, b = 0; const n2 = this.nearR ** 2, f2 = this.farR ** 2;
    for (const it of this.items) {
      const d = (it[0] - cam.x) ** 2 + (it[2] - cam.z) ** 2; if (d > f2) continue;
      this.e.set(0, it[4], it[5] || 0); this.q.setFromEuler(this.e); this.s.set(it[3] * (it[6] || 1), it[3], it[3] * (it[6] || 1)); this.p.set(it[0], it[1], it[2]); this.m.compose(this.p, this.q, this.s);
      if (d < n2 || !this.far) this.near.setMatrixAt(a++, this.m); else this.far.setMatrixAt(b++, this.m);
    }
    this.near.count = a; this.near.instanceMatrix.needsUpdate = true; if (this.far) { this.far.count = b; this.far.instanceMatrix.needsUpdate = true; }
  }
}

export function buildProps(world, q) {
  const g = new THREE.Group(); const sets = []; const r = rng(world.def.seed * 7 + 3); const E = world.E - 20; const N = world.N, hw = world.hw;
  const okAt = (x, z, minRoad, maxSlope = 0.55) => {
    const k = world.cellIdx(x, z); if (k < 0) return null; if (world.RD[k] < minRoad) return null; const h = world.H[k]; if (h < world.waterY + 1.2) return null;
    const h1 = world.gridH(x + 2, z), h2 = world.gridH(x, z + 2); if (Math.hypot(h1 - h, h2 - h) / 2 > maxSlope) return null; return { h: world.gridH(x, z), rd: world.RD[k], s: world.S[k] };
  };
  const addCol = (x, z, rr) => { world.colliders.push({ x, z, r: rr }); };
  const draw = q.draw;
  if (world.biome === 'mountain') {
    const items = []; const n = Math.floor(9000 * q.trees); const nz = world.noise;
    for (let i = 0; i < n * 3 && items.length < n; i++) {
      const x = (r() * 2 - 1) * E, z = (r() * 2 - 1) * E; if (nz.fbm(x / 260 + 11, z / 260, 3) < -0.12) continue; const o = okAt(x, z, hw + 7, 0.75); if (!o || o.h > 360) continue;
      const s = 0.7 + r() * 0.8; items.push([x, o.h - 0.3, z, s, r() * 6.28, (r() - 0.5) * 0.06, 0.9 + r() * 0.3]); if (o.rd < 90) addCol(x, z, 0.5 * s);
    }
    const nearMat = cardMat(branchTex()); const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    sets.push(new LODSet(g, pineGeo(true), pineGeo(false), nearMat, farMat, items, 160 * Math.min(1.4, q.trees + 0.3) * (q.mobile ? 0.75 : 1), draw * 0.9));
    rocks(['rock'], 900);
    grass([['#3d5a1f', '#86a04a'], ['#4a6b25', '#a4b860'], ['#56682e', '#b9b878']], SURF.GRASS);
  } else if (world.biome === 'city') {
    buildings(); streetlights();
    const palms = []; for (let i = 0; i < N; i += 9) { const x = world.X[i], z = world.Z[i]; if (x < world.coastX - 260) continue; for (const s of [-1, 1]) { const lat = s * (hw + 5 + r() * 4); const px = x + world.TZ[i] * lat, pz = z - world.TX[i] * lat; const o = okAt(px, pz, hw + 3.5); if (o) { palms.push([px, o.h - 0.2, pz, 0.85 + r() * 0.35, r() * 6.28]); addCol(px, pz, 0.35); } } }
    for (let i = 0; i < 500 * q.trees; i++) { const z = (r() * 2 - 1) * E; const x = world.coastX - 20 + r() * 50; const o = okAt(x, z, hw + 6); if (o) palms.push([x, o.h - 0.2, z, 0.9 + r() * 0.4, r() * 6.28]); }
    sets.push(new LODSet(g, palmGeo(), null, cardMat(frondTex()), null, palms, draw, draw));
    const trees = []; for (let i = 0; i < 2500 * q.trees; i++) { const x = (r() * 2 - 1) * E, z = (r() * 2 - 1) * E; const o = okAt(x, z, hw + 8); if (!o || o.s !== SURF.GRASS) continue; trees.push([x, o.h - 0.2, z, 0.8 + r() * 0.6, r() * 6.28]); if (o.rd < 60) addCol(x, z, 0.5); }
    sets.push(new LODSet(g, roundTreeGeo(true), roundTreeGeo(false), cardMat(leafTex()), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), trees, 180, draw * 0.8));
    grass([['#3f6420', '#8fb04a'], ['#4e7428', '#a7c060']], SURF.GRASS);
  } else {
    const cac = []; for (let i = 0; i < 2600 * q.trees; i++) { const x = (r() * 2 - 1) * E, z = (r() * 2 - 1) * E; const o = okAt(x, z, hw + 6, 0.3); if (!o) continue; cac.push([x, o.h - 0.3, z, 0.6 + r() * 0.7, r() * 6.28]); if (o.rd < 90) addCol(x, z, 0.45); }
    sets.push(new LODSet(g, cactusGeo(), null, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), null, cac, draw * 0.7, draw * 0.7));
    rocks(['rock'], 1400, 1.8);
    grass([['#7d6a3a', '#c9b47a'], ['#6f5f34', '#b5a26a']], SURF.SAND, 0.5);
    poles();
  }

  function rocks(set, count, big = 1) {
    const items = []; for (let i = 0; i < count * Math.min(1.2, q.trees + 0.2); i++) { const x = (r() * 2 - 1) * E, z = (r() * 2 - 1) * E; const o = okAt(x, z, hw + 5, 0.9); if (!o) continue; const s = (0.5 + r() ** 3 * 4) * big; items.push([x, o.h - s * 0.2, z, s, r() * 6.28, 0, 0.8 + r() * 0.6]); if (o.rd < 90 && s > 0.8) addCol(x, z, s * 0.9); }
    const m = pbr('rock', 1); if (world.biome === 'desert') m.color.setHex(0xe0b089);
    sets.push(new LODSet(g, rockGeo(3), rockGeo(3, 1), m, m, items, 130, draw));
  }
  function grass(cols, surf, dens = 1) {
    if (!q.grass) return; const items = []; const n = Math.floor(30000 * q.grass * dens);
    for (let i = 0; i < n * 2 && items.length < n; i++) { const si = Math.floor(r() * N); const lat = (r() < 0.5 ? -1 : 1) * (hw + 4.6 + r() ** 1.5 * 40); const x = world.X[si] + world.TZ[si] * lat + (r() - 0.5) * 6, z = world.Z[si] - world.TX[si] * lat + (r() - 0.5) * 6; const o = okAt(x, z, hw + 4.5, 0.7); if (!o || (o.s !== surf && o.s !== SURF.GRASS)) continue; items.push([x, o.h - 0.05, z, 0.6 + r() * 0.7, r() * 6.28, 0, 1.4]); }
    const geo = mergeGeometries([0, 1, 2].map(k => { const p = new THREE.PlaneGeometry(1.4, 0.9); p.translate(0, 0.45, 0); p.rotateY(k * Math.PI / 3); paint(p, 0xffffff, true); return p.toNonIndexed(); }));
    const m = cardMat(grassTex(cols)); sets.push(new LODSet(g, geo, null, m, null, items, 90, 90, false));
  }
  function buildings() {
    const kinds = ['glass', 'office', 'resid']; const lots = { glass: [], office: [], resid: [] }; const cx = world.coastX - 500, cz = 0; const step = 34;
    for (let x = -E; x < world.coastX - 90; x += step) for (let z = -E; z < E; z += step) {
      const px = x + (r() - 0.5) * 6, pz = z + (r() - 0.5) * 6; const k = world.cellIdx(px, pz); if (k < 0) continue; const rd = world.RD[k];
      const w = 14 + r() * 12, d = 14 + r() * 12; if (rd < hw + 10 + Math.max(w, d) * 0.75) continue; if (r() < 0.15) continue; const o = okAt(px, pz, 0, 0.4); if (!o) continue;
      const dc = Math.hypot(px - cx, pz - cz); const tall = Math.exp(-((dc / 520) ** 2)); let h = 10 + r() * 18 + tall * (60 + r() * 170);
      if (dc > 1400) { if (r() < 0.6) continue; h *= 0.6; }
      const kind = tall > 0.35 && r() < 0.7 ? 'glass' : (r() < 0.55 ? 'office' : 'resid'); const rot = (r() < 0.5 ? 0 : 0.1) * r();
      lots[kind].push([px, o.h - 0.5, pz, w, h, d, rot]); if (rd < 140) world.colliders.push({ x: px, z: pz, box: true, hw: w / 2, hd: d / 2, rot });
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    for (const kind of kinds) {
      const L = lots[kind]; if (!L.length) continue; const t = facadeTex(kind, kind.length * 7);
      const m = kind === 'glass' ? new THREE.MeshPhysicalMaterial({ map: t.map, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0.75, roughness: 0.07, clearcoat: 0.5 })
        : new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.78 });
      const tile = kind === 'glass' ? [22, 44] : [16, 30];
      m.onBeforeCompile = sh => {
        sh.uniforms.uNight = nightUniform;
        sh.vertexShader = 'varying float vTop;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 fs = abs(normal.x) > 0.5 ? sc.zy : abs(normal.z) > 0.5 ? sc.xy : sc.xz; vTop = step(0.5, normal.y);
          vec2 tu = uv * fs / vec2(${tile[0]}.0, ${tile[1]}.0); vMapUv = tu; vEmissiveMapUv = tu;`);
        sh.fragmentShader = 'uniform float uNight; varying float vTop;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22,0.22,0.23), vTop);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = texture2D(emissiveMap, vEmissiveMapUv).rgb * uNight * 2.2 * (1.0 - vTop);');
      };
      m.customProgramCacheKey = () => 'bld' + kind;
      const im = new THREE.InstancedMesh(box, m, L.length); const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3();
      L.forEach((b, i) => { qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b[6]); mm.compose(pp.set(b[0], b[1], b[2]), qq, ss.set(b[3], b[4], b[5])); im.setMatrixAt(i, mm); });
      im.castShadow = true; im.receiveShadow = true; g.add(im);
      // rooftop units
      const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8c9196, metalness: 0.5, roughness: 0.5 }), L.length * 3); let c = 0;
      L.forEach(b => { for (let k = 0; k < 3; k++) { mm.compose(pp.set(b[0] + (r() - 0.5) * b[3] * 0.6, b[1] + b[4], b[2] + (r() - 0.5) * b[5] * 0.6), qq.identity(), ss.set(2 + r() * 3, 1.2 + r() * 2, 2 + r() * 3)); ac.setMatrixAt(c++, mm); } });
      ac.castShadow = true; g.add(ac);
    }
  }
  function streetlights() {
    const pole = mergeGeometries([new THREE.CylinderGeometry(0.09, 0.14, 9, 8).translate(0, 4.5, 0).toNonIndexed(), new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6).rotateZ(Math.PI / 2).translate(1.2, 8.9, 0).toNonIndexed()]);
    const head = new THREE.BoxGeometry(0.9, 0.18, 0.4).translate(2.4, 8.85, 0);
    const pts = []; for (let i = 0; i < N; i += 22) { if (world.F[i] & 1) continue; const s = (i / 22) % 2 ? 1 : -1; const lat = s * (hw + 2.2); pts.push([world.X[i] + world.TZ[i] * lat, world.Y[i], world.Z[i] - world.TX[i] * lat, 1, Math.atan2(world.TX[i], world.TZ[i]) + (s > 0 ? -Math.PI / 2 : Math.PI / 2)]); addCol(pts[pts.length - 1][0], pts[pts.length - 1][2], 0.25); }
    sets.push(new LODSet(g, pole, null, new THREE.MeshStandardMaterial({ color: 0x5c6166, metalness: 0.7, roughness: 0.45 }), null, pts, draw, draw));
    const hm = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffd7a0, emissiveIntensity: 0 }); hm.userData.night = 6; world.nightMats = [hm];
    sets.push(new LODSet(g, head, null, hm, null, pts, draw, draw, false));
    world.streetLights = pts;
  }
  function poles() {
    const geo = mergeGeometries([new THREE.CylinderGeometry(0.14, 0.18, 11, 6).translate(-1.4, 5.5, 0).toNonIndexed(), new THREE.CylinderGeometry(0.14, 0.18, 11, 6).translate(1.4, 5.5, 0).toNonIndexed(), new THREE.BoxGeometry(4.6, 0.25, 0.25).translate(0, 10.2, 0).toNonIndexed()]);
    const pts = []; for (let i = 0; i < N; i += 30) { const lat = hw + 14; pts.push([world.X[i] + world.TZ[i] * lat, world.gridH(world.X[i] + world.TZ[i] * lat, world.Z[i] - world.TX[i] * lat), world.Z[i] - world.TX[i] * lat, 1, Math.atan2(world.TX[i], world.TZ[i]) + Math.PI / 2]); }
    sets.push(new LODSet(g, geo, null, new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 0.9 }), null, pts, draw, draw));
    // wires
    const wp = []; for (let w = -1; w <= 1; w++) for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8; const sag = t => -Math.sin(t * Math.PI) * 1.6; const P = t => { const ax = a[0], az = a[2]; return [ax + (b[0] - ax) * t + w * 1.8 * Math.cos(a[4]) * 0, a[1] + (b[1] - a[1]) * t + 10.3 + sag(t), az + (b[2] - az) * t]; }; const p0 = P(t0), p1 = P(t1); const ox = Math.sin(a[4] + Math.PI / 2) * w * 1.8, oz = Math.cos(a[4] + Math.PI / 2) * w * 1.8; wp.push(p0[0] + ox, p0[1], p0[2] + oz, p1[0] + ox, p1[1], p1[2] + oz); } }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
  }
  return { group: g, update(cam, force) { for (const s of sets) s.update(cam, force); } };
}
