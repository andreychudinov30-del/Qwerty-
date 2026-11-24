// Shared helpers + global game context
import * as THREE from 'three';

export const G = {
  t: 0, dt: 0, paused: true, started: false,
  hour: 9.5, dayLen: 48 * 60, // seconds per in-game day
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const wrapAng = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// value noise / fbm (CPU, for terrain)
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

export class Bus {
  constructor() { this.m = new Map(); }
  on(e, f) { if (!this.m.has(e)) this.m.set(e, []); this.m.get(e).push(f); return () => this.off(e, f); }
  off(e, f) { const l = this.m.get(e); if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  emit(e, a, b, c) { const l = this.m.get(e); if (l) for (const f of l.slice()) f(a, b, c); }
}
export const bus = new Bus();

export const V = () => new THREE.Vector3();
export const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
export const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
export const UP = new THREE.Vector3(0, 1, 0);

export function fmtMoney(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

// simple spatial hash for dynamic entities (x,z)
export class SpatialHash {
  constructor(cell = 20) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return ((Math.floor(x / this.cell) + 512) << 10) | (Math.floor(z / this.cell) + 512); }
  clear() { this.map.clear(); }
  insert(o, x, z) { const k = this.key(x, z); let l = this.map.get(k); if (!l) { l = []; this.map.set(k, l); } l.push(o); }
  query(x, z, r, out = []) {
    out.length = 0;
    const c = this.cell, x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const l = this.map.get(((i + 512) << 10) | (j + 512));
      if (l) for (const o of l) out.push(o);
    }
    return out;
  }
}

export function canvasTex(w, h, draw, { repeat = true, srgb = true, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = mips;
  t.anisotropy = G.maxAniso || 4;
  t.needsUpdate = true;
  return t;
}
