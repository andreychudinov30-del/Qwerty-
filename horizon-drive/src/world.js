import * as THREE from 'three';
import { makeNoise, rng, clamp, lerp, smooth } from './noise.js';
import { pbr, canvasTex, tex } from './assets.js';

export const SURF = { ASPHALT: 0, DIRT: 1, GRASS: 2, SAND: 3, ROCK: 4 };
const DS = 2.0; // track sample spacing (m)

// Shared wetness injection for road/terrain materials
export const wetUniform = { value: 0 };
export const timeUniform = { value: 0 };
export function addWetness(mat, strength = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uWet = wetUniform;
    sh.fragmentShader = 'uniform float uWet;\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.08 + roughnessFactor * 0.25, uWet * ${strength.toFixed(2)});
      diffuseColor.rgb *= 1.0 - 0.35 * uWet * ${strength.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'wet' + strength + (mat.userData.key || '');
}

export class World {
  constructor(def, q) {
    this.def = def; this.q = q; this.biome = def.biome; this.noise = makeNoise(def.seed); this.rand = rng(def.seed * 31 + 5);
    this.group = new THREE.Group(); this.colliders = []; this.lights = []; this.waterY = -1e9; this.tunnelRuns = []; this.update = [];
  }

  // ---------------- natural terrain height ----------------
  hn(x, z) {
    const n = this.noise, R = this.def.R, r = Math.hypot(x, z); let h;
    if (this.biome === 'mountain') {
      h = 30 + 150 * n.ridge(x / 800 + 3.1, z / 800 - 1.7, 5) + 22 * n.fbm(x / 160, z / 160, 4);
      h += smooth(R * 1.25, R * 2.4, r) * 520 * (0.45 + n.ridge(x / 1300, z / 1300, 4));
      const L = this.lake; if (L) { const d = Math.hypot(x - L.x, z - L.z); h -= 95 * Math.exp(-(d * d) / (L.r * L.r)); }
    } else if (this.biome === 'city') {
      h = 4 + 3 * n.fbm(x / 500, z / 500, 3);
      h += smooth(R * 1.45, R * 2.6, r) * 280 * (0.3 + n.ridge(x / 1100, z / 1100, 4)) * smooth(0, 1, (this.coastX - 300 - x) / 600);
      const cx = this.coastX + 25 * n.n2(z / 300, 3.3);
      h = lerp(h, -14, smooth(cx - 10, cx + 90, x));
    } else {
      h = 12 + 6 * n.fbm(x / 400, z / 400, 4) + 3.5 * n.ridge(x / 90 + 9, z / 140, 3);
      const m = n.fbm(x / 650 + 5.2, z / 650 - 2.1, 4);
      let mesa = smooth(0.12, 0.17, m); mesa = Math.floor(mesa * 4 + 0.5 * n.fbm(x / 60, z / 60, 2)) / 4 * 0.35 + mesa * 0.65;
      h += mesa * (70 + 40 * n.fbm(x / 300, z / 300, 2));
      h += smooth(R * 1.4, R * 2.6, r) * 340 * (0.35 + n.ridge(x / 1500, z / 1500, 4));
    }
    return h;
  }

  build(progress = () => {}) {
    this.genTrack(); progress(0.15);
    this.genGrid(); progress(0.4);
    this.buildTerrain(); progress(0.6);
    this.buildRoad(); progress(0.75);
    this.buildStructures(); progress(0.85);
    if (this.waterY > -1e8) this.buildWater();
    return this.group;
  }

  genTrack() {
    const d = this.def, R = d.R, M = 4000, raw = [];
    for (let i = 0; i < M; i++) {
      const t = i / M * Math.PI * 2; let r = 1; for (const [k, a, p] of d.harm) r += a * Math.sin(k * t + p);
      raw.push([Math.cos(t) * R * r, Math.sin(t) * R * r]);
    }
    // arc-length resample
    const cum = [0]; for (let i = 1; i <= M; i++) { const a = raw[i - 1], b = raw[i % M]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const len = cum[M], N = Math.floor(len / DS); this.N = N; this.length = N * DS;
    const X = new Float32Array(N), Z = new Float32Array(N); let j = 0;
    for (let i = 0; i < N; i++) { const s = i * len / N; while (cum[j + 1] < s) j++; const t = (s - cum[j]) / (cum[j + 1] - cum[j]); const a = raw[j], b = raw[(j + 1) % M]; X[i] = lerp(a[0], b[0], t); Z[i] = lerp(a[1], b[1], t); }
    this.X = X; this.Z = Z; this.ds = len / N;
    let maxX = -1e9; for (let i = 0; i < N; i++) maxX = Math.max(maxX, X[i]); this.coastX = maxX + 40;
    // lake for mountain: centered on a track point, slightly inside
    if (this.biome === 'mountain') { const i = Math.floor(N * 0.3); this.lake = { x: X[i] * 0.97, z: Z[i] * 0.97, r: 170 }; }
    // tangents/normals/curvature
    this.TX = new Float32Array(N); this.TZ = new Float32Array(N); this.K = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; let tx = X[b] - X[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, tz); this.TX[i] = tx / l; this.TZ[i] = tz / l; }
    for (let i = 0; i < N; i++) { const b = (i + 1) % N; const h0 = Math.atan2(this.TX[i], this.TZ[i]), h1 = Math.atan2(this.TX[b], this.TZ[b]); let dh = h1 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.K[i] = dh / this.ds; }
    // smooth curvature
    const Ks = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -6; k <= 6; k++) s += this.K[(i + k + N) % N]; Ks[i] = s / 13; } this.K = Ks;
    this.W = new Float32Array(N).fill(d.width); this.hw = d.width / 2;
    // elevation: smoothed natural terrain with grade clamp
    let Y = new Float32Array(N); for (let i = 0; i < N; i++) Y[i] = this.hn(X[i], Z[i]);
    if (this.biome === 'city') for (let i = 0; i < N; i++) Y[i] = Math.max(Y[i], 3.0);
    const win = this.biome === 'mountain' ? 40 : 60;
    for (let pass = 0; pass < 3; pass++) { const Y2 = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -win; k <= win; k++) s += Y[(i + k + N) % N]; Y2[i] = s / (2 * win + 1); } Y = Y2; }
    // city elevated freeway section
    this.viaduct = null;
    if (this.biome === 'city') { const a = Math.floor(N * 0.55), b = Math.floor(N * 0.72); this.viaduct = [a, b]; for (let i = a; i < b; i++) { const t = (i - a) / (b - a); Y[i] += 11 * smooth(0, 0.18, t) * (1 - smooth(0.82, 1, t)); } }
    // mountain: enforce bridge over lake (keep road above water)
    this.Y = Y;
    if (this.biome === 'mountain' && this.lake) {
      let minH = 1e9; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; minH = Math.min(minH, this.hn(this.lake.x + Math.cos(a) * 20, this.lake.z + Math.sin(a) * 20)); }
      this.waterY = this.hn(this.lake.x, this.lake.z) + 32;
      for (let i = 0; i < N; i++) Y[i] = Math.max(Y[i], this.waterY + 6);
      for (let pass = 0; pass < 2; pass++) { const Y2 = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -25; k <= 25; k++) s += Y[(i + k + N) % N]; Y2[i] = Math.max(s / 51, this.waterY + 5); } Y.set(Y2); }
    }
    if (this.biome === 'city') this.waterY = 0;
    // flags: bridge (road well above terrain), tunnel (well below)
    this.F = new Uint8Array(N); // bit0 bridge, bit1 tunnel, bit2 dirt, bit3 barrier
    for (let i = 0; i < N; i++) {
      const h = this.hn(X[i], Z[i]); let f = 0;
      if (Y[i] - h > 4.5 || (this.waterY > -1e8 && h < this.waterY + 0.5)) f |= 1;
      if (this.biome === 'mountain' && h - Y[i] > 22) f |= 2;
      this.F[i] = f;
    }
    // clean short runs, extend bridges
    this.cleanFlag(1, 12); this.cleanFlag(2, 25);
    if (this.viaduct) for (let i = this.viaduct[0] + 25; i < this.viaduct[1] - 25; i++) this.F[i] |= 1;
    if (this.biome === 'desert') { const runs = [[0.18, 0.31], [0.62, 0.7]]; for (const [a, b] of runs) for (let i = Math.floor(a * N); i < b * N; i++) this.F[i] |= 4; }
    for (let i = 0; i < N; i++) if (this.biome !== 'desert' || (this.F[i] & 1)) this.F[i] |= 8;
    if (this.biome === 'desert') { // barriers on fast curves
      for (let i = 0; i < N; i++) if (Math.abs(this.K[i]) > 0.008 && !(this.F[i] & 4)) this.F[i] |= 8;
      this.cleanFlag(8, 20);
    }
    this.runs = f => { const out = []; let s = -1; for (let i = 0; i <= N; i++) { const on = i < N && (this.F[i] & f); if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i]); s = -1; } } if (out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === N) { const l = out.pop(); out[0][0] = l[0] - N; } return out; };
    this.tunnelRuns = this.runs(2);
    this.raceLine();
  }
  cleanFlag(bit, minLen) {
    const N = this.N; let s = -1;
    for (let i = 0; i <= N; i++) { const on = i < N && (this.F[i] & bit); if (on && s < 0) s = i; if (!on && s >= 0) { if (i - s < minLen) for (let k = s; k < i; k++) this.F[k] &= ~bit; else { for (let k = 1; k <= 6; k++) { this.F[(s - k + N) % N] |= bit; this.F[(i - 1 + k) % N] |= bit; } } s = -1; } }
  }
  raceLine() {
    const N = this.N, st = 4, M = Math.floor(N / st), lim = this.hw - 1.6; const o = new Float32Array(M);
    const px = i => this.X[i * st], pz = i => this.Z[i * st], lx = i => this.TZ[i * st], lz = i => -this.TX[i * st];
    for (let it = 0; it < 400; it++) for (let i = 0; i < M; i++) {
      const a = (i - 1 + M) % M, b = (i + 1) % M;
      const qax = px(a) + lx(a) * o[a], qaz = pz(a) + lz(a) * o[a], qbx = px(b) + lx(b) * o[b], qbz = pz(b) + lz(b) * o[b];
      const tx = (qax + qbx) / 2 - px(i), tz = (qaz + qbz) / 2 - pz(i);
      o[i] = clamp(lerp(o[i], tx * lx(i) + tz * lz(i), 0.6), -lim, lim);
    }
    this.RL = new Float32Array(N); for (let i = 0; i < N; i++) { const a = Math.floor(i / st) % M, b = (a + 1) % M, t = (i % st) / st; this.RL[i] = lerp(o[a], o[b], t); }
    // racing line curvature
    this.RK = new Float32Array(N); const rx = i => this.X[i] + this.TZ[i] * this.RL[i], rz = i => this.Z[i] - this.TX[i] * this.RL[i];
    for (let i = 0; i < N; i++) { const a = (i - 4 + N) % N, b = (i + 4) % N; const h0 = Math.atan2(rx(i) - rx(a), rz(i) - rz(a)), h1 = Math.atan2(rx(b) - rx(i), rz(b) - rz(i)); let dh = h1 - h0; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.RK[i] = dh / (8 * this.ds); }
    const t = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let k = -5; k <= 5; k++) s += Math.abs(this.RK[(i + k + N) % N]); t[i] = s / 11; } this.RK = t;
  }

  // ---------------- physics grid ----------------
  genGrid() {
    let E = 0; for (let i = 0; i < this.N; i++) E = Math.max(E, Math.abs(this.X[i]), Math.abs(this.Z[i]));
    E += 320; this.E = E; const cs = 3; this.cs = cs; const G = Math.ceil(2 * E / cs) + 1; this.G = G;
    const H = new Float32Array(G * G), RD = new Float32Array(G * G).fill(1e9), RI = new Int32Array(G * G).fill(-1);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = this.hn(-E + i * cs, -E + j * cs);
    const rad = this.hw + 70;
    for (let s = 0; s < this.N; s++) {
      const x = this.X[s], z = this.Z[s]; const i0 = Math.max(0, Math.floor((x - rad + E) / cs)), i1 = Math.min(G - 1, Math.ceil((x + rad + E) / cs));
      const j0 = Math.max(0, Math.floor((z - rad + E) / cs)), j1 = Math.min(G - 1, Math.ceil((z + rad + E) / cs));
      for (let j = j0; j <= j1; j++) { const dz = -E + j * cs - z; for (let i = i0; i <= i1; i++) { const dx = -E + i * cs - x; const d = dx * dx + dz * dz; const k = j * G + i; if (d < RD[k]) { RD[k] = d; RI[k] = s; } } }
    }
    for (let k = 0; k < G * G; k++) RD[k] = Math.sqrt(RD[k]);
    this.RD = RD; this.RI = RI;
    // final heights: flatten corridor around road
    const flat = this.hw + 3.5, blend = this.biome === 'mountain' ? 34 : this.biome === 'desert' ? 30 : 22;
    this.Hn = H.slice();
    for (let k = 0; k < G * G; k++) {
      const s = RI[k]; if (s < 0) continue; const d = RD[k]; const ry = this.Y[s] - 0.25; const f = this.F[s];
      if (f & 2) { const t = smooth(flat - 1, flat + 9, d); H[k] = lerp(ry, Math.max(H[k], ry), t); continue; }
      const t = smooth(flat, flat + blend, d);
      if (f & 1) { const lim = lerp(ry - 2.5, H[k], t); H[k] = Math.min(H[k], lim); if (d < flat + 6 && H[k] > ry - 3) H[k] = ry - 3 - (flat + 6 - d) * 0.0; continue; }
      H[k] = lerp(ry, H[k], t);
    }
    this.H = H;
    // surface grid
    const S = new Uint8Array(G * G);
    for (let j = 1; j < G - 1; j++) for (let i = 1; i < G - 1; i++) {
      const k = j * G + i; const sl = Math.hypot(H[k + 1] - H[k - 1], H[k + G] - H[k - G]) / (2 * cs);
      let s = this.biome === 'desert' ? SURF.SAND : SURF.GRASS;
      if (sl > 0.6) s = SURF.ROCK;
      if (this.biome === 'city') { const x = -E + i * cs; if (x > this.coastX - 60) s = SURF.SAND; else if (RD[k] < 260 && RD[k] > this.hw + 8) s = SURF.ASPHALT; }
      if (RD[k] < this.hw + 3.5) s = SURF.DIRT;
      S[k] = s;
    }
    this.S = S;
  }
  gridH(x, z) {
    const E = this.E, cs = this.cs, G = this.G; let fx = (x + E) / cs, fz = (z + E) / cs;
    if (fx < 0 || fz < 0 || fx >= G - 1 || fz >= G - 1) return this.hn(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * G + i, H = this.H;
    // triangle-consistent interpolation (matches mesh split)
    if (tx + tz < 1) return H[k] + (H[k + 1] - H[k]) * tx + (H[k + G] - H[k]) * tz;
    return H[k + G + 1] + (H[k + G] - H[k + G + 1]) * (1 - tx) + (H[k + 1] - H[k + G + 1]) * (1 - tz);
  }
  cellIdx(x, z) { const i = Math.round((x + this.E) / this.cs), j = Math.round((z + this.E) / this.cs); if (i < 0 || j < 0 || i >= this.G || j >= this.G) return -1; return j * this.G + i; }
  // nearest track sample + lateral offset, refined around hint
  locate(x, z, hint = -1) {
    let s = hint;
    if (s < 0) { const k = this.cellIdx(x, z); s = k >= 0 ? this.RI[k] : -1; if (s < 0) { let best = 1e18; for (let i = 0; i < this.N; i += 8) { const d = (this.X[i] - x) ** 2 + (this.Z[i] - z) ** 2; if (d < best) { best = d; s = i; } } } }
    const N = this.N;
    for (let it = 0; it < 40; it++) { const a = (s + 1) % N, b = (s - 1 + N) % N; const d0 = (this.X[s] - x) ** 2 + (this.Z[s] - z) ** 2, d1 = (this.X[a] - x) ** 2 + (this.Z[a] - z) ** 2, d2 = (this.X[b] - x) ** 2 + (this.Z[b] - z) ** 2; if (d1 < d0) s = a; else if (d2 < d0) s = b; else break; }
    const dx = x - this.X[s], dz = z - this.Z[s]; const along = dx * this.TX[s] + dz * this.TZ[s]; const lat = dx * this.TZ[s] - dz * this.TX[s];
    return { s, along, lat, t: (s * this.ds + along + this.length) % this.length };
  }
  // ground query for physics: returns height, surface
  ground(x, z, out, hint = -1) {
    const k = this.cellIdx(x, z); const s0 = k >= 0 ? this.RI[k] : -1;
    if (s0 >= 0 && this.RD[k] < this.hw + 10) {
      const L = this.locate(x, z, s0);
      if (Math.abs(L.lat) < this.hw + 1.0 || ((this.F[L.s] & 1) && Math.abs(L.lat) < this.hw + 2.5)) {
        const b = (L.s + 1) % this.N; const t = clamp(L.along / this.ds, -1, 1);
        out.h = t >= 0 ? lerp(this.Y[L.s], this.Y[b], t) : lerp(this.Y[L.s], this.Y[(L.s - 1 + this.N) % this.N], -t);
        out.surf = (this.F[L.s] & 4) ? SURF.DIRT : SURF.ASPHALT; out.road = true; out.s = L.s; out.lat = L.lat; return out;
      }
    }
    out.h = this.gridH(x, z); out.surf = k >= 0 ? this.S[k] : SURF.GRASS; out.road = false; out.s = s0; return out;
  }
  heightAt(x, z) { return this.ground(x, z, this._g || (this._g = {})).h; }

  // ---------------- terrain mesh ----------------
  buildTerrain() {
    let seg = Math.round(170 + 230 * Math.min(1, this.q.trees)); if (this.q.mobile) seg = Math.min(seg, 300); const ext = 7000, inner = this.E;
    const warp = u => { const a = Math.abs(u); const c = 0.62; const r = a < c ? a / c * inner : inner + Math.pow((a - c) / (1 - c), 1.8) * (ext - inner); return Math.sign(u) * r; };
    const V = seg + 1; const pos = new Float32Array(V * V * 3), uv = new Float32Array(V * V * 2), col = new Float32Array(V * V * 3), spl = new Float32Array(V * V * 3);
    const hs = new Float32Array(V * V);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const x = warp(i / seg * 2 - 1), z = warp(j / seg * 2 - 1); const k = j * V + i;
      const h = (Math.abs(x) < inner - 4 && Math.abs(z) < inner - 4) ? this.gridH(x, z) : this.hn(x, z);
      hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
    }
    const n = this.noise;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i; const x = pos[k * 3], z = pos[k * 3 + 2], h = hs[k];
      const i0 = Math.max(0, i - 1), i1 = Math.min(seg, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(seg, j + 1);
      const dx = pos[(j * V + i1) * 3] - pos[(j * V + i0) * 3] || 1, dz = pos[(j1 * V + i) * 3 + 2] - pos[(j0 * V + i) * 3 + 2] || 1;
      const slope = Math.hypot((hs[j * V + i1] - hs[j * V + i0]) / dx, (hs[j1 * V + i] - hs[j0 * V + i]) / dz);
      const ck = this.cellIdx(x, z); const rd = ck >= 0 ? this.RD[ck] : 1e9;
      if (ck >= 0 && rd < this.hw + 30) pos[k * 3 + 1] = h - 9;
      this.vattr(x, z, h, slope, rd, spl, col, k);
    }
    const idx = new Uint32Array(seg * seg * 6); let p = 0;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * V + i, b = a + 1, c = a + V, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const set = { mountain: ['forest', 'grass', 'rock'], city: ['grass', 'sand', 'concrete'], desert: ['desert', 'sand', 'rock'] }[this.biome];
    const T = (nm, sfx, srgb) => tex(`${nm}_${sfx}.jpg`, { srgb });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: T(set[0], 'diff', true), normalMap: T(set[0], 'nor'), roughnessMap: T(set[0], 'arm'), roughness: 1, metalness: 0 });
    mat.normalScale.set(1.2, 1.2);
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { tB: { value: T(set[1], 'diff', true) }, tR: { value: T(set[2], 'diff', true) }, nB: { value: T(set[1], 'nor') }, nR: { value: T(set[2], 'nor') }, aB: { value: T(set[1], 'arm') }, aR: { value: T(set[2], 'arm') }, uWet: wetUniform });
      sh.vertexShader = 'attribute vec3 splat; varying vec3 vSplat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat;');
      sh.fragmentShader = 'uniform sampler2D tB,tR,nB,nR,aB,aR; uniform float uWet; varying vec3 vSplat;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 u1 = vMapUv, u2 = vMapUv * 0.21 + vec2(0.37, 0.71), uR = vMapUv * 0.5;
          vec3 sw = vSplat;
          vec3 cA = mix(texture2D(map, u1).rgb, texture2D(map, u2).rgb, 0.45);
          vec3 cB = mix(texture2D(tB, u1).rgb, texture2D(tB, u2).rgb, 0.45);
          vec3 cR = mix(texture2D(tR, uR).rgb, texture2D(tR, u2 * 0.7).rgb, 0.4);
          diffuseColor.rgb *= cA * sw.x + cB * sw.y + cR * sw.z;
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;`)
        .replace('vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );', `vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv ) * vSplat.x + texture2D(aB, vRoughnessMapUv) * vSplat.y + texture2D(aR, vRoughnessMapUv * 0.5) * vSplat.z;`)
        .replace('roughnessFactor *= texelRoughness.g;', 'roughnessFactor *= texelRoughness.g; roughnessFactor = mix(roughnessFactor, 0.25, uWet*0.5);')
        .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = (texture2D( normalMap, vNormalMapUv ).xyz * vSplat.x + texture2D(nB, vNormalMapUv).xyz * vSplat.y + texture2D(nR, vNormalMapUv*0.5).xyz * vSplat.z) * 2.0 - 1.0;');
    };
    mat.customProgramCacheKey = () => 'terrain';
    const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; mesh.name = 'terrain'; this.group.add(mesh); this.terrain = mesh; this.buildCorridor(mat);
  }

  vattr(x, z, h, slope, rd, spl, col, k) {
    const n = this.noise; const v = n.fbm(x / 140, z / 140, 3), v2 = n.fbm(x / 35 + 7, z / 35, 2);
    let a = 1, b = 0, r = 0; let cr = 1, cg = 1, cb = 1;
    if (this.biome === 'mountain') { b = smooth(-0.1, 0.35, v); a = 1 - b; r = smooth(0.42, 0.75, slope) + smooth(260, 420, h) * 0.6; const snow = smooth(330, 430, h + v * 60); cr = cg = cb = 1 + snow * 2.4; cr *= 0.92 + v2 * 0.12; }
    else if (this.biome === 'city') { const sand = smooth(this.coastX - 70, this.coastX - 30, x); b = sand; a = 1 - sand; r = (rd < 260 && rd > this.hw + 6 && x < this.coastX - 60) ? 0.9 : 0; r = Math.max(r, smooth(0.5, 0.8, slope)); if (x > this.coastX) { b = 1; a = 0; r = 0; cr = 0.75; cg = 0.72; cb = 0.65; } }
    else { a = smooth(-0.2, 0.3, v); b = 1 - a; r = smooth(0.38, 0.7, slope); cr = 1.08 + v2 * 0.08; cg = 0.92; cb = 0.78; }
    if (rd < this.hw + 5) { r = 0; a = this.biome === 'desert' ? 0.2 : 0.3; b = 0.7; }
    const s = a + b + r || 1; spl[k * 3] = a / s; spl[k * 3 + 1] = b / s; spl[k * 3 + 2] = r / s;
    const mac = 0.86 + 0.18 * v2; col[k * 3] = cr * mac; col[k * 3 + 1] = cg * mac; col[k * 3 + 2] = cb * mac;
  }
  // dense terrain strip following the track (exact physics heights)
  buildCorridor(mat) {
    const N = this.N, hw = this.hw; const offs = [0.3, 1.5, 3, 4.5, 6.5, 9, 12, 16, 21, 27, 34, 42, 50]; const lat = [...offs.map(o => -(hw + o)).reverse(), ...offs.map(o => hw + o)];
    const P = lat.length, rows = N + 1; const pos = new Float32Array(rows * P * 3), uv = new Float32Array(rows * P * 2), col = new Float32Array(rows * P * 3), spl = new Float32Array(rows * P * 3); const idx = [];
    for (let r = 0; r < rows; r++) { const i = r % N; const lx = this.TZ[i], lz = -this.TX[i];
      for (let p = 0; p < P; p++) { const k = r * P + p; const x = this.X[i] + lx * lat[p], z = this.Z[i] + lz * lat[p]; const h = this.gridH(x, z); pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z; uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
        const sl = Math.hypot(this.gridH(x + 2, z) - h, this.gridH(x, z + 2) - h) / 2; this.vattr(x, z, h, sl, Math.abs(lat[p]), spl, col, k); } }
    for (let r = 0; r < rows - 1; r++) for (let p = 0; p < P - 1; p++) { if (p === P / 2 - 1) continue; const a = r * P + p, b = a + 1, c = a + P, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('splat', new THREE.BufferAttribute(spl, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.group.add(m);
  }
  // sweep a cross-section profile along the track; profile: [[lat, up], ...]
  sweep(runs, profile, mat, { vScale = 6, uScale = 6, yAt = null, close = false, shadow = true, cast = false } = {}) {
    const N = this.N, P = profile.length; const pos = [], uv = [], idx = [];
    const ul = [0]; for (let i = 1; i < P; i++) ul.push(ul[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
    for (const [a0, b0] of runs) {
      const base = pos.length / 3; let rows = 0;
      for (let ii = a0; ii <= b0; ii++) {
        const i = ((ii % N) + N) % N; const lx = this.TZ[i], lz = -this.TX[i]; const y = yAt ? yAt(i) : this.Y[i];
        for (let p = 0; p < P; p++) { const [lat, up] = profile[p]; pos.push(this.X[i] + lx * lat, y + up, this.Z[i] + lz * lat); uv.push(ul[p] / uScale, ii * this.ds / vScale); }
        rows++;
      }
      for (let r = 0; r < rows - 1; r++) for (let p = 0; p < P - 1; p++) { const a = base + r * P + p, b = a + 1, c = a + P, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = shadow; m.castShadow = cast; this.group.add(m); return m;
  }

  buildRoad() {
    const N = this.N, hw = this.hw;
    const asphalt = pbr('asphalt', 1, { ns: 0.8 }); asphalt.color.setHex(this.biome === 'desert' ? 0xb8b0a8 : 0xa0a0a0); addWetness(asphalt, 1); asphalt.userData.key = 'road';
    const dirt = pbr('dirt', 1); dirt.color.setHex(this.biome === 'desert' ? 0xd8b48a : 0xffffff); addWetness(dirt, 0.6); dirt.userData.key = 'dirtroad';
    const dirtRuns = this.runs(4); const asRuns = this.runsInv(4);
    const prof = []; for (let k = 0; k <= 8; k++) prof.push([-hw - 0.9 + (2 * hw + 1.8) * k / 8, 0]);
    this.sweep(asRuns, prof, asphalt, { uScale: 7, vScale: 7 });
    if (dirtRuns.length) this.sweep(dirtRuns, prof, dirt, { uScale: 6, vScale: 6 });
    // verges (gravel shoulders sloping into terrain)
    const verge = pbr(this.biome === 'desert' ? 'desert' : 'dirt', 1); verge.color.setHex(0xcfc6b8);
    const nonBridge = this.runsInv(1 | 2);
    this.sweep(nonBridge, [[-hw - 4.5, -0.55], [-hw - 0.85, -0.02]], verge, { uScale: 4, vScale: 4 });
    this.sweep(nonBridge, [[hw + 0.85, -0.02], [hw + 4.5, -0.55]], verge, { uScale: 4, vScale: 4 });
    // markings
    const paint = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const yellow = paint.clone(); yellow.color.setHex(0xf2b705);
    const dash = canvasTex(32, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h * 0.45); });
    const dashMat = paint.clone(); dashMat.alphaMap = dash; dashMat.alphaTest = 0.5; dashMat.transparent = false;
    const asM = asRuns;
    const line = (lat, w, m, runs = asM, v = 1e6) => this.sweep(runs, [[lat - w / 2, 0.015], [lat + w / 2, 0.015]], m, { uScale: 1, vScale: v, shadow: true });
    line(-hw + 0.35, 0.18, paint); line(hw - 0.35, 0.18, paint);
    if (this.biome === 'city') { line(-0.15, 0.12, yellow); line(0.15, 0.12, yellow); line(-hw / 2, 0.14, dashMat, asM, 12); line(hw / 2, 0.14, dashMat, asM, 12); }
    else line(0, 0.15, dashMat, asM, 12);
    // curbs on tight corners
    const curbTex = canvasTex(16, 128, (g, w, h) => { for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#c41a1a'; g.fillRect(0, i * h / 4, w, h / 4); } });
    const curb = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
    const cr = []; let s = -1; for (let i = 0; i <= N; i++) { const on = i < N && Math.abs(this.K[i]) > 0.012 && !(this.F[i] & 7); if (on && s < 0) s = i; if (!on && s >= 0) { if (i - s > 6) cr.push([s, i, Math.sign(this.K[s + 2 >= N ? s : s + 2])]); s = -1; } }
    for (const [a, b, sg] of cr) { const lat = sg * (hw + 0.3); this.sweep([[a, b]], [[lat - 0.6, 0.02], [lat, 0.09], [lat + 0.6, 0.02]].map(p => [p[0], p[1]]), curb, { uScale: 1, vScale: 8 }); }
    // start line
    const chk = canvasTex(256, 32, (g, w, h) => { const c = 32; for (let i = 0; i < w / c * 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; g.fillRect(i * c / 2, j * h / 2, c / 2, h / 2); } });
    const sl = new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 });
    this.sweep([[0, 1]], [[-hw, 0.02], [hw, 0.02]], sl, { uScale: 2 * hw, vScale: 2 });
  }
  runsInv(mask) { const N = this.N, out = []; let s = -1; for (let i = 0; i <= N; i++) { const on = i < N && !(this.F[i] & mask); if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i]); s = -1; } } return out; }

  buildStructures() {
    const N = this.N, hw = this.hw, B = this.runs(1), T = this.tunnelRuns;
    const metal = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.85, roughness: 0.38, side: THREE.DoubleSide });
    const concrete = pbr('concrete', 1); concrete.side = THREE.DoubleSide;
    const barrierRuns = this.runs(8).map(([a, b]) => [a, b]);
    const tunnelMask = r => r; // guardrails also in tunnels (walls)
    if (this.biome === 'city') {
      const prof = [[0.32, 0], [0.26, 0.08], [0.13, 0.32], [0.1, 0.82], [-0.1, 0.82], [-0.13, 0.32], [-0.26, 0.08], [-0.32, 0]];
      for (const side of [-1, 1]) this.sweep(barrierRuns, prof.map(([l, u]) => [side * (hw + 1.25) + l * side, u]), concrete, { uScale: 2, vScale: 4, cast: true });
      this.barrierOff = hw + 0.95;
    } else {
      const wb = [[0, 0.45], [0.06, 0.5], [0.0, 0.57], [0.06, 0.64], [0.0, 0.72]];
      for (const side of [-1, 1]) this.sweep(barrierRuns, wb.map(([l, u]) => [side * (hw + 1.35 - l), u]), metal, { uScale: 1, vScale: 4, cast: true });
      // posts
      const post = new THREE.BoxGeometry(0.1, 0.8, 0.14); post.translate(0, 0.4, 0); const cnt = []; for (const [a, b] of barrierRuns) for (let i = a; i < b; i += 2) cnt.push(((i % N) + N) % N);
      const im = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.7, roughness: 0.5 }), cnt.length * 2); let c = 0; const m4 = new THREE.Matrix4();
      for (const i of cnt) for (const side of [-1, 1]) { const lat = side * (hw + 1.45); m4.makeRotationY(Math.atan2(this.TX[i], this.TZ[i])); m4.setPosition(this.X[i] + this.TZ[i] * lat, this.Y[i], this.Z[i] - this.TX[i] * lat); im.setMatrixAt(c++, m4); }
      im.castShadow = true; this.group.add(im); this.barrierOff = hw + 1.05;
    }
    // bridges: deck slab, parapets, pillars
    if (B.length) {
      this.sweep(B, [[-hw - 1.6, -0.05], [-hw - 1.6, -1.8], [-hw + 1, -2.4], [hw - 1, -2.4], [hw + 1.6, -1.8], [hw + 1.6, -0.05]], concrete, { uScale: 4, vScale: 4, cast: true });
      for (const side of [-1, 1]) this.sweep(B, [[side * (hw + 1.6), -0.05], [side * (hw + 1.6), 0.55], [side * (hw + 1.9), 0.55], [side * (hw + 1.9), -1.8]], concrete, { uScale: 2, vScale: 4, cast: true });
      const pg = new THREE.CylinderGeometry(1, 1.15, 1, 16, 1); pg.translate(0, -0.5, 0); const pts = [];
      for (const [a, b] of B) for (let i = a + 6; i < b - 4; i += 16) { const k = ((i % N) + N) % N; const gh = this.hn(this.X[k], this.Z[k]); const top = this.Y[k] - 2.3; if (top - gh > 2) for (const side of [-1, 1]) pts.push([this.X[k] + this.TZ[k] * side * hw * 0.55, top, this.Z[k] - this.TX[k] * side * hw * 0.55, top - Math.min(gh, this.waterY > -1e8 ? Math.min(gh, this.waterY - 30) : gh) + 2]); }
      if (pts.length) { const im = new THREE.InstancedMesh(pg, concrete, pts.length); const m4 = new THREE.Matrix4(); pts.forEach((p, i) => { m4.makeScale(1, p[3], 1); m4.setPosition(p[0], p[1], p[2]); im.setMatrixAt(i, m4); }); im.castShadow = true; im.receiveShadow = true; this.group.add(im); }
    }
    // tunnels
    if (T.length) {
      const r = hw + 2.2; const inner = [], outer = [];
      for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI; inner.push([Math.cos(a) * r, Math.max(0, Math.sin(a) * (r * 0.62) + 3.6 * Math.sin(a) ** 0.3) - 0.3]); }
      for (let k = 0; k <= 14; k++) { const a = Math.PI - k / 14 * Math.PI; outer.push([Math.cos(a) * (r + 4), Math.sin(a) * (r * 0.62 + 6) - 0.6]); }
      const tunMat = pbr('concrete', 1); tunMat.side = THREE.DoubleSide; tunMat.color.setHex(0x9a9690);
      this.sweep(T, inner, tunMat, { uScale: 4, vScale: 4, cast: true });
      const rock = pbr('rock', 1); rock.side = THREE.DoubleSide;
      this.sweep(T, outer, rock, { uScale: 8, vScale: 8, cast: true });
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 3.0 });
      const top = inner[7][1];
      for (const s of [-1, 1]) this.sweep(T, [[s * 3.2 - 0.25, top - 0.45], [s * 3.2 + 0.25, top - 0.45]], lampMat, { uScale: 1, vScale: 1e6, shadow: false });
      // portals
      for (const [a, b] of T) for (const e of [a, b]) { const i = ((e % N) + N) % N; const g = new THREE.TorusGeometry(r + 1.4, 1.4, 6, 18, Math.PI); const m = new THREE.Mesh(g, concrete); m.position.set(this.X[i], this.Y[i] - 0.3, this.Z[i]); m.rotation.y = Math.atan2(this.TX[i], this.TZ[i]); m.scale.y = 0.95; m.castShadow = true; this.group.add(m); }
    }
    // start/finish gantry
    const i0 = 0; const lx = this.TZ[i0], lz = -this.TX[i0];
    const gantry = new THREE.Group(); gantry.position.set(this.X[i0], this.Y[i0], this.Z[i0]); gantry.rotation.y = Math.atan2(this.TX[i0], this.TZ[i0]);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.8, roughness: 0.35 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), steel); p.position.set(s * (hw + 2.4), 4, 0); p.castShadow = true; gantry.add(p); }
    const banner = canvasTex(1024, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff2a6d'); gr.addColorStop(0.5, '#ff7b00'); gr.addColorStop(1, '#ffd000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'italic 900 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HORIZON DRIVE  •  ' + this.def.name.toUpperCase(), w / 2, h / 2 + 4); });
    const bm = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 5.6, 1.6, 0.6), [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: banner, emissive: 0xffffff, emissiveMap: banner, emissiveIntensity: 0.6 }), new THREE.MeshStandardMaterial({ map: banner, emissive: 0xffffff, emissiveMap: banner, emissiveIntensity: 0.6 })]);
    bm.position.set(0, 7.6, 0); bm.castShadow = true; gantry.add(bm); this.group.add(gantry);
    this.colliders.push({ x: this.X[i0] + lx * (hw + 2.4), z: this.Z[i0] + lz * (hw + 2.4), r: 0.6 }, { x: this.X[i0] - lx * (hw + 2.4), z: this.Z[i0] - lz * (hw + 2.4), r: 0.6 });
  }

  buildWater() {
    // water handled by sky/effects module (needs sun); store params
    this.hasWater = true;
  }

  // lateral barrier limit at sample i (Infinity = no barrier)
  barrier(i) { return (this.F[i] & 8) || (this.F[i] & 2) ? this.barrierOff : Infinity; }
  inTunnel(i) { return (this.F[i] & 2) !== 0; }
  pointAt(t, lat = 0, out = new THREE.Vector3()) { const N = this.N; t = ((t % this.length) + this.length) % this.length; const f = t / this.ds; const i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f); out.set(lerp(this.X[i], this.X[j], u) + this.TZ[i] * lat, lerp(this.Y[i], this.Y[j], u), lerp(this.Z[i], this.Z[j], u) - this.TX[i] * lat); return out; }
}
