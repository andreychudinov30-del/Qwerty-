// Flooded areas: dark reflective water with animated ripples (normal map scroll) and flashlight specular.
import * as THREE from 'three';
import { canvasTexture } from '../core/assets.js';
import { CELL, ZONES } from './mapgen.js';
import { mulberry32 } from '../core/util.js';

let waterNormal = null;
function getWaterNormal() {
  if (waterNormal) return waterNormal;
  const S = 256;
  const rnd = mulberry32(42);
  const hgt = new Float32Array(S * S);
  const waves = Array.from({ length: 14 }, () => ({ fx: Math.round((rnd() - 0.5) * 12), fy: Math.round((rnd() - 0.5) * 12), a: 0.3 + rnd(), p: rnd() * 6.28 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const w of waves) h += Math.sin(((x * w.fx + y * w.fy) / S) * Math.PI * 2 + w.p) * w.a;
    hgt[y * S + x] = h;
  }
  waterNormal = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hl = hgt[y * S + ((x - 1 + S) % S)], hr = hgt[y * S + ((x + 1) % S)], hu = hgt[((y - 1 + S) % S) * S + x], hd = hgt[((y + 1) % S) * S + x];
      const nx = (hl - hr) * 0.35, ny = (hu - hd) * 0.35, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat: true });
  return waterNormal;
}

export class Water {
  constructor(builder) {
    this.meshes = [];
    const nrm = getWaterNormal();
    this.nrm = nrm;
    this.nrm2 = nrm.clone(); this.nrm2.needsUpdate = true;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x0b120e, roughness: 0.05, metalness: 0.1, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: 0.86, envMapIntensity: 1.6, depthWrite: true });
    const byKey = new Map();
    const g = builder.g;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const z = builder.zone[builder.idx(x, y)];
      if (!z || ZONES[z].water === undefined) continue;
      const lvl = ZONES[z].water;
      const k = builder.chunkOf(x, y) + '|' + lvl;
      if (!byKey.has(k)) byKey.set(k, { lvl, cells: [], x, y });
      byKey.get(k).cells.push([x, y]);
    }
    for (const [, v] of byKey) {
      const geos = [];
      const pos = [], uv = [], idx = [];
      let n = 0;
      for (const [x, y] of v.cells) {
        const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        pos.push(x0, v.lvl, z0, x1, v.lvl, z0, x1, v.lvl, z1, x0, v.lvl, z1);
        uv.push(x0 / 4, z0 / 4, x1 / 4, z0 / 4, x1 / 4, z1 / 4, x0 / 4, z1 / 4);
        idx.push(n, n + 3, n + 2, n, n + 2, n + 1); n += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, this.mat);
      m.receiveShadow = true; m.renderOrder = 1;
      m.name = 'water';
      builder.ensureChunk(v.x, v.y).group.add(m);
      this.meshes.push(m);
      geos.push(geo);
    }
  }
  update(dt) { this.nrm.offset.x += dt * 0.012; this.nrm.offset.y += dt * 0.007; }
}

// returns water surface height at world xz (or null)
export function waterLevelAt(builder, x, z) {
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  if (!builder.g.in(cx, cy)) return null;
  const zc = builder.zone[builder.idx(cx, cy)];
  if (!zc) return null;
  const w = ZONES[zc].water;
  return w === undefined ? null : w;
}
