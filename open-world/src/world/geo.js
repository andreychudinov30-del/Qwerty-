// Low-level geometry builder: batches quads/boxes/cylinders per material key with world-space UVs + per-vertex color/seed
import * as THREE from 'three';

export class GeoBuilder {
  constructor() { this.parts = new Map(); }
  _p(key) {
    let p = this.parts.get(key);
    if (!p) { p = { pos: [], nor: [], uv: [], col: [], seed: [], idx: [] }; this.parts.set(key, p); }
    return p;
  }
  // quad p0..p3 counter-clockwise when viewed from the front
  quad(key, p0, p1, p2, p3, uv0, uv1, color = [1, 1, 1], seed = 0) {
    const p = this._p(key), b = p.pos.length / 3;
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [p0, p1, p2, p3]) { p.pos.push(q[0], q[1], q[2]); p.nor.push(nx, ny, nz); p.col.push(color[0], color[1], color[2]); p.seed.push(seed); }
    p.uv.push(uv0[0], uv0[1], uv1[0], uv0[1], uv1[0], uv1[1], uv0[0], uv1[1]);
    p.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // axis-aligned box; uvMode 'world' => u/v in meters / tile
  box(key, cx, y0, cz, w, h, d, { tileU = 1, tileV = 1, top = key, bottom = null, color, seed = 0, sides = true, vOff = 0, uOff = 0 } = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const v0 = (y0 + vOff) / tileV, v1 = (y1 + vOff) / tileV;
    if (sides) {
      this.quad(key, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [uOff + x0 / tileU, v0], [uOff + x1 / tileU, v1], color, seed); // +z
      this.quad(key, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [uOff - x1 / tileU, v0], [uOff - x0 / tileU, v1], color, seed); // -z
      this.quad(key, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [uOff - z1 / tileU, v0], [uOff - z0 / tileU, v1], color, seed); // +x
      this.quad(key, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [uOff + z0 / tileU, v0], [uOff + z1 / tileU, v1], color, seed); // -x
    }
    if (top) this.quad(top, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0 / 8, -z1 / 8], [x1 / 8, -z0 / 8], color, seed);
    if (bottom) this.quad(bottom, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0], [1, 1], color, seed);
  }
  cyl(key, cx, y0, cz, r0, r1, h, seg = 12, { color = [1, 1, 1], tileU = 1, tileV = 1, cap = true, seed = 0 } = {}) {
    const p = this._p(key);
    const b = p.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const sl = (r0 - r1) / h, nl = Math.hypot(1, sl);
      p.pos.push(cx + c * r0, y0, cz + s * r0, cx + c * r1, y0 + h, cz + s * r1);
      p.nor.push(c / nl, sl / nl, s / nl, c / nl, sl / nl, s / nl);
      const u = (i / seg) * Math.PI * 2 * Math.max(r0, r1) / tileU;
      p.uv.push(u, y0 / tileV, u, (y0 + h) / tileV);
      p.col.push(...color, ...color); p.seed.push(seed, seed);
    }
    for (let i = 0; i < seg; i++) { const a = b + i * 2; p.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    if (cap && r1 > 0.001) {
      const c0 = p.pos.length / 3;
      p.pos.push(cx, y0 + h, cz); p.nor.push(0, 1, 0); p.uv.push(0.5, 0.5); p.col.push(...color); p.seed.push(seed);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        p.pos.push(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1); p.nor.push(0, 1, 0); p.uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); p.col.push(...color); p.seed.push(seed);
      }
      for (let i = 0; i < seg; i++) p.idx.push(c0, c0 + 2 + i, c0 + 1 + i);
    }
  }
  // gable roof over box footprint (ridge along longer axis)
  gable(key, cx, y0, cz, w, d, rh, color, over = 0.5) {
    const alongX = w >= d;
    const hw = w / 2 + over, hd = d / 2 + over;
    if (alongX) {
      const r = [[cx - hw, y0 + rh, cz], [cx + hw, y0 + rh, cz]];
      this.quad(key, [cx - hw, y0, cz + hd], [cx + hw, y0, cz + hd], r[1], r[0], [0, 0], [w / 3, hd / 3], color);
      this.quad(key, [cx + hw, y0, cz - hd], [cx - hw, y0, cz - hd], r[0], r[1], [0, 0], [w / 3, hd / 3], color);
      this.tri('wallend', [cx - w / 2, y0, cz - d / 2], [cx - w / 2, y0, cz + d / 2], [cx - w / 2, y0 + rh, cz], color);
      this.tri('wallend', [cx + w / 2, y0, cz + d / 2], [cx + w / 2, y0, cz - d / 2], [cx + w / 2, y0 + rh, cz], color);
    } else {
      const r = [[cx, y0 + rh, cz - hd], [cx, y0 + rh, cz + hd]];
      this.quad(key, [cx + hw, y0, cz + hd], [cx + hw, y0, cz - hd], r[0], r[1], [0, 0], [d / 3, hw / 3], color);
      this.quad(key, [cx - hw, y0, cz - hd], [cx - hw, y0, cz + hd], r[1], r[0], [0, 0], [d / 3, hw / 3], color);
      this.tri('wallend', [cx - w / 2, y0, cz + d / 2], [cx + w / 2, y0, cz + d / 2], [cx, y0 + rh, cz + d / 2], color);
      this.tri('wallend', [cx + w / 2, y0, cz - d / 2], [cx - w / 2, y0, cz - d / 2], [cx, y0 + rh, cz - d / 2], color);
    }
  }
  tri(key, a, b, c, color = [1, 1, 1]) {
    const p = this._p(key), i = p.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) { p.pos.push(...q); p.nor.push(nx / l, ny / l, nz / l); p.col.push(...color); p.seed.push(0); }
    p.uv.push(a[0] / 3 + a[2] / 3, a[1] / 3, b[0] / 3 + b[2] / 3, b[1] / 3, c[0] / 3 + c[2] / 3, c[1] / 3);
    p.idx.push(i, i + 1, i + 2);
  }
  // add an existing BufferGeometry transformed by a matrix
  geom(key, g, m, color = [1, 1, 1]) {
    const p = this._p(key), b = p.pos.length / 3;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, col = g.attributes.color;
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m); p.pos.push(v.x, v.y, v.z);
      if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); p.nor.push(n.x, n.y, n.z); } else p.nor.push(0, 1, 0);
      if (uv) p.uv.push(uv.getX(i), uv.getY(i)); else p.uv.push(0, 0);
      if (col) p.col.push(col.getX(i) * color[0], col.getY(i) * color[1], col.getZ(i) * color[2]); else p.col.push(...color);
      p.seed.push(0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) p.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < pos.count; i++) p.idx.push(b + i);
  }
  build(key) {
    const p = this.parts.get(key); if (!p || !p.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(p.seed, 1));
    g.setIndex(p.idx.length > 65535 ? new THREE.Uint32BufferAttribute(p.idx, 1) : new THREE.Uint16BufferAttribute(p.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  keys() { return [...this.parts.keys()]; }
}

// shared "vertex-colored PBR" material: per-vertex color, roughness/metal by uniforms
const vcCache = new Map();
export function vcMat(rough = 0.7, metal = 0, opts = {}) {
  const k = rough + '|' + metal + '|' + JSON.stringify(opts);
  if (vcCache.has(k)) return vcCache.get(k);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, ...opts });
  vcCache.set(k, m);
  return m;
}
