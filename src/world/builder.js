// Converts a MapGrid into merged, chunked, PBR geometry + physics collider descriptions + nav/PVS data.
// Walls follow per-zone profiles (vaulted station walls, arched tunnels with tubbing, straight service walls).
import * as THREE from 'three';
import { CELL, ZONES, isSolidChar } from './mapgen.js';
import { getMat } from '../core/materials.js';

export const CHUNK = 8;
const DIRS = [
  { dx: 0, dy: -1, name: 'N' },
  { dx: 1, dy: 0, name: 'E' },
  { dx: 0, dy: 1, name: 'S' },
  { dx: -1, dy: 0, name: 'W' },
];

// deterministic 2D value noise for cave walls (continuous across cells)
function hn(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hn(xi, yi), b = hn(xi + 1, yi), c = hn(xi, yi + 1), d = hn(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

class GeoBuf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c, c, c);
    return this.n++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // quad oriented so its geometric normal agrees with the stored normal of vertex a
  quadF(a, b, c, d) {
    const P = this.pos, N = this.nor;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const dot = cx * N[a * 3] + cy * N[a * 3 + 1] + cz * N[a * 3 + 2];
    if (dot >= 0) this.quad(a, b, c, d); else this.quad(a, d, c, b);
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class LevelBuilder {
  constructor(grid, opts = {}) {
    this.g = grid;
    this.opts = opts;
    const n = grid.w * grid.h;
    this.zone = new Array(n).fill(null); // resolved zone char per floor cell
    this.floorH = new Float32Array(n).fill(NaN);
    this.ceilH = new Float32Array(n).fill(NaN);
    this.stairAxis = new Array(n).fill(null); // {axis:'x'|'y', lowSide:-1|1, lo, hi}
    this.walkable = new Uint8Array(n);
    this.buffers = new Map(); // chunkKey -> Map(mat -> GeoBuf)
    this.boxes = []; // collider boxes
    this.ramps = []; // convex point sets
    this.cylinders = [];
    this.chunks = new Map();
  }

  idx(x, y) { return y * this.g.w + x; }
  solid(x, y) { return isSolidChar(this.g.get(x, y)); }
  zoneDef(x, y) { const z = this.zone[this.idx(x, y)]; return z ? ZONES[z] : null; }

  resolveZones() {
    const g = this.g;
    // pass 1: plain zone chars
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const ch = g.get(x, y);
      if (ZONES[ch]) this.zone[this.idx(x, y)] = ch;
    }
    // pass 2: special chars inherit from neighbours (repeat to propagate through chains)
    for (let pass = 0; pass < 4; pass++) {
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const i = this.idx(x, y);
        const ch = g.get(x, y);
        if (ch === '#' || this.zone[i]) continue;
        const nbs = [];
        for (const d of DIRS) { const z = this.zone[this.idx(x + d.dx, y + d.dy)]; if (g.in(x + d.dx, y + d.dy) && z) nbs.push(z); }
        if (!nbs.length) continue;
        let pick = nbs[0];
        if (ch === 's') pick = nbs.reduce((a, b) => (ZONES[b].floor < ZONES[a].floor ? b : a));
        else if ('DLGHV'.includes(ch)) pick = nbs.reduce((a, b) => (ZONES[b].ceil < ZONES[a].ceil ? b : a));
        else { const cnt = {}; for (const z of nbs) cnt[z] = (cnt[z] || 0) + 1; pick = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; }
        this.zone[i] = pick;
      }
    }
    // heights
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const i = this.idx(x, y);
      const z = this.zone[i];
      if (!z) continue;
      this.floorH[i] = ZONES[z].floor;
      this.ceilH[i] = ZONES[z].ceil;
    }
    // stairs: slope between neighbours with different floors
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== 's') continue;
      const i = this.idx(x, y);
      const fh = (xx, yy) => { const z = this.zone[this.idx(xx, yy)]; return g.in(xx, yy) && z && g.get(xx, yy) !== 's' ? ZONES[z].floor : null; };
      const w = fh(x - 1, y), e = fh(x + 1, y), n = fh(x, y - 1), s = fh(x, y + 1);
      let st = null;
      if (w !== null && e !== null && w !== e) st = { axis: 'x', a: w, b: e };
      else if (n !== null && s !== null && n !== s) st = { axis: 'y', a: n, b: s };
      else if (w !== null && e === null && n === null && s === null) st = { axis: 'x', a: w, b: w };
      if (st) {
        this.stairAxis[i] = st;
        this.floorH[i] = Math.min(st.a, st.b);
        this.ceilH[i] = Math.max(...[[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].map(([xx, yy]) => this.ceilH[this.idx(xx, yy)]).filter((v) => !isNaN(v)));
      }
    }
    for (let i = 0; i < this.zone.length; i++) {
      const ch = this.g.cells[i];
      this.walkable[i] = this.zone[i] && ch !== 'o' && ch !== 'x' ? 1 : 0;
    }
  }

  // floor height at a point on edge of the cell (t along edge 0..1)
  floorAt(x, y, fx, fy) {
    const i = this.idx(x, y);
    const st = this.stairAxis[i];
    if (!st) return this.floorH[i];
    const t = st.axis === 'x' ? fx : fy;
    return st.a + (st.b - st.a) * t;
  }

  buf(cx, cy, mat) {
    const key = `${cx},${cy}`;
    let m = this.buffers.get(key);
    if (!m) { m = new Map(); this.buffers.set(key, m); }
    let b = m.get(mat);
    if (!b) { b = new GeoBuf(); m.set(mat, b); }
    return b;
  }
  bufFor(x, y, mat) { return this.buf(Math.floor(x / CHUNK), Math.floor(y / CHUNK), mat); }

  // free distance in front of a wall (in meters) for inset clamping
  freeWidth(x, y, dx, dy) {
    let n = 0;
    let cx = x, cy = y;
    while (n < 8 && !this.solid(cx, cy)) { n++; cx += dx; cy += dy; }
    return n * CELL;
  }

  // wall profile: list of {i (inset), y (abs), mat}
  profile(zoneChar, floorY, ceilY, maxInset, wx, wz) {
    const z = ZONES[zoneChar];
    const pts = [];
    const add = (i, y, mat) => pts.push({ i, y, mat });
    const arch = (R, mat, steps = 6) => {
      const yc = ceilY - R;
      for (let k = 1; k <= steps; k++) {
        const a = (k / steps) * Math.PI / 2;
        add(R - Math.cos(a) * R, yc + Math.sin(a) * R, mat);
      }
    };
    switch (z.profile) {
      case 'station': {
        const R = Math.min(1.7, maxInset);
        add(0, floorY, 'skirting');
        add(0, Math.max(floorY + 0.3, 0.3), floorY < -0.5 ? 'concrete' : 'station_tiles');
        if (floorY < -0.5) add(0, 0.35, 'station_tiles');
        add(0, 3.1, 'plaster');
        add(0, ceilY - R, 'plaster');
        arch(R, 'plaster');
        break;
      }
      case 'tunnel': {
        const R = Math.min(1.7, maxInset);
        add(0, floorY, 'concrete');
        add(0, floorY + 0.35, 'tunnel');
        add(0, ceilY - R, 'tunnel');
        arch(R, 'tunnel', 7);
        break;
      }
      case 'service':
        add(0, floorY, 'service_lower'); add(0, floorY + 1.3, 'service_wall'); add(0, ceilY, 'service_wall');
        break;
      case 'lab':
        add(0, floorY, 'skirting'); add(0, floorY + 0.12, 'lab_wall'); add(0, floorY + 2.3, 'plaster'); add(0, ceilY, 'plaster');
        break;
      case 'bunker': {
        const R = Math.min(0.5, maxInset);
        add(0, floorY, 'bunker_wall'); add(0, floorY + 1.5, 'bunker_upper'); add(0, ceilY - R, 'bunker_upper'); arch(R, 'bunker_upper', 3);
        break;
      }
      case 'depot':
        add(0, floorY, 'concrete'); add(0, floorY + 2.4, 'depot_wall'); add(0, ceilY, 'depot_wall');
        break;
      case 'hall': {
        const R = Math.min(4.5, maxInset);
        add(0, floorY, 'concrete'); add(0, floorY + 0.5, 'hall_wall'); add(0, ceilY - R, 'hall_wall'); arch(R, 'concrete', 8);
        break;
      }
      case 'cave': {
        const R = Math.min(2.2, maxInset);
        const steps = 7;
        for (let k = 0; k <= steps; k++) {
          const yy = floorY + (ceilY - R - floorY) * (k / steps);
          const nz = vnoise(wx * 0.55 + wz * 0.55, yy * 0.7) * 0.75 + vnoise(wx * 1.7 + wz * 1.7, yy * 2.1) * 0.25;
          add(Math.min(maxInset * 0.5, nz * 0.7) * (k === 0 ? 0.3 : 1), yy, 'rock');
        }
        arch(R, 'rock', 5);
        break;
      }
      default:
        add(0, floorY, 'concrete'); add(0, ceilY, 'concrete');
    }
    return pts;
  }

  insetAt(pts, y) {
    if (y <= pts[0].y) return pts[0].i;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (y >= a.y && y <= b.y) { const t = b.y - a.y < 1e-5 ? 1 : (y - a.y) / (b.y - a.y); return a.i + (b.i - a.i) * t; }
    }
    return pts[pts.length - 1].i;
  }

  // emit a wall strip along an edge (p0 -> p1, inward normal n), with given profile points
  emitWall(x, y, p0, p1, n, pts, floorY, alongIsX) {
    const segN = (a, b) => { // 2D normal in (i,y) plane for segment a->b
      const di = b.i - a.i, dyy = b.y - a.y; const l = Math.hypot(di, dyy) || 1;
      return [dyy / l, -di / l];
    };
    // per-point smoothed normals within same material run
    const pn = pts.map((p, k) => {
      const s0 = k > 0 ? segN(pts[k - 1], p) : null, s1 = k < pts.length - 1 ? segN(p, pts[k + 1]) : null;
      const v = s0 && s1 ? [s0[0] + s1[0], s0[1] + s1[1]] : (s0 || s1);
      const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l];
    });
    let vacc = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const segLen = Math.hypot(b.i - a.i, b.y - a.y);
      if (segLen < 1e-4) continue;
      const mat = a.mat;
      const B = this.bufFor(x, y, mat);
      const sc = getMat(mat).userData.texScale || 2;
      const na = pn[k], nb = pn[k + 1];
      const ao = (yy) => 0.5 + 0.5 * smoothstep(floorY, floorY + 1.6, yy) - 0.12 * smoothstep(floorY + 3.5, floorY + 7, yy);
      const u0 = (alongIsX ? p0.x : p0.z) / sc, u1 = (alongIsX ? p1.x : p1.z) / sc;
      const v0 = (a.y + vacc * 0) / sc, v1 = b.y / sc + (b.i - a.i) / sc;
      const V = (p, i, yy, nn, u, v) => B.vert(p.x + n.x * i, yy, p.z + n.z * i, n.x * nn[0], nn[1], n.z * nn[0], u, v, ao(yy));
      const i0 = V(p0, a.i, a.y, na, u0, v0), i1 = V(p1, a.i, a.y, na, u1, v0), i2 = V(p1, b.i, b.y, nb, u1, v1), i3 = V(p0, b.i, b.y, nb, u0, v1);
      // winding: face toward n
      const cross = (p1.x - p0.x) * n.z - (p1.z - p0.z) * n.x;
      if (cross > 0) B.quad(i0, i1, i2, i3); else B.quad(i0, i3, i2, i1);
    }
  }

  // cast-iron tubbing ribs following the tunnel profile (2 per cell edge)
  emitRibs(x, y, p0, p1, n, pts) {
    const B = this.bufFor(x, y, 'tubbing');
    const ex = p1.x - p0.x, ez = p1.z - p0.z; const L = Math.hypot(ex, ez); const ux = ex / L, uz = ez / L;
    const depth = 0.09, half = 0.07;
    for (const t of [0.25, 0.75]) {
      const cx = p0.x + ex * t, cz = p0.z + ez * t;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        if (Math.hypot(b.i - a.i, b.y - a.y) < 1e-3) continue;
        const di = b.i - a.i, dy = b.y - a.y; const l = Math.hypot(di, dy);
        const nn = [dy / l, -di / l];
        const P = (s, i, yy) => ({ x: cx + ux * s + n.x * i, y: yy, z: cz + uz * s + n.z * i });
        const ia = a.i + depth * nn[0], ya = a.y + depth * nn[1], ib = b.i + depth * nn[0], yb = b.y + depth * nn[1];
        const nx = n.x * nn[0], ny = nn[1], nz = n.z * nn[0];
        const sc = 1.5;
        // front face
        const f = [P(-half, ia, ya), P(half, ia, ya), P(half, ib, yb), P(-half, ib, yb)];
        const v = f.map((q, j) => B.vert(q.x, q.y, q.z, nx, ny, nz, (j === 1 || j === 2 ? 0.1 : 0), q.y / sc, 0.8));
        B.quadF(v[0], v[1], v[2], v[3]);
        // side faces
        for (const s2 of [-half, half]) {
          const q = [P(s2, a.i, a.y), P(s2, ia, ya), P(s2, ib, yb), P(s2, b.i, b.y)];
          const sv = q.map((qq, j) => B.vert(qq.x, qq.y, qq.z, ux * Math.sign(s2), 0, uz * Math.sign(s2), j < 2 ? j * 0.05 : (3 - j) * 0.05, qq.y / sc, 0.7));
          B.quadF(sv[0], sv[1], sv[2], sv[3]);
        }
      }
    }
  }

  // revolve profile around a vertical corner axis from angle a0 to a1 (convex corners)
  emitCorner(x, y, P, a0, a1, pts, floorY) {
    const steps = 4;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (a.i < 0.01 && b.i < 0.01) continue;
      const B = this.bufFor(x, y, a.mat);
      const sc = getMat(a.mat).userData.texScale || 2;
      const di = b.i - a.i, dyy = b.y - a.y; const l = Math.hypot(di, dyy) || 1;
      const nn = [dyy / l, -di / l];
      const ring = [];
      for (let s = 0; s <= steps; s++) {
        const ang = a0 + (a1 - a0) * (s / steps);
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const ao = (yy) => 0.5 + 0.5 * smoothstep(floorY, floorY + 1.6, yy);
        const va = B.vert(P.x + ux * a.i, a.y, P.z + uz * a.i, ux * nn[0], nn[1], uz * nn[0], (s / steps) * a.i / sc, a.y / sc, ao(a.y));
        const vb = B.vert(P.x + ux * b.i, b.y, P.z + uz * b.i, ux * nn[0], nn[1], uz * nn[0], (s / steps) * b.i / sc, b.y / sc + (b.i - a.i) / sc, ao(b.y));
        ring.push([va, vb]);
      }
      for (let s = 0; s < steps; s++) {
        const [va, vb] = ring[s], [wa, wb] = ring[s + 1];
        // emit both windings (tiny patches; avoids orientation bookkeeping)
        B.quadF(va, wa, wb, vb);
      }
    }
  }

  build() {
    const g = this.g;
    this.resolveZones();
    const C = CELL;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const i = this.idx(x, y);
      const zc = this.zone[i];
      if (!zc) continue;
      const Z = ZONES[zc];
      const x0 = x * C, x1 = (x + 1) * C, z0 = y * C, z1 = (y + 1) * C;
      const fy = this.floorH[i], cy = this.ceilH[i];
      const ch = g.get(x, y);
      // ---- floor ----
      const st = this.stairAxis[i];
      const solidAround = (vx, vy) => { let c = 0; for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (this.solid(vx + ox, vy + oy)) c++; return c; };
      const aoF = (c) => [1, 0.78, 0.62, 0.55, 0.55][c];
      if (!st) {
        const mat = Z.floorMat;
        const B = this.bufFor(x, y, mat);
        const sc = getMat(mat).userData.texScale || 2;
        const v0 = B.vert(x0, fy, z0, 0, 1, 0, x0 / sc, z0 / sc, aoF(solidAround(x, y)));
        const v1 = B.vert(x1, fy, z0, 0, 1, 0, x1 / sc, z0 / sc, aoF(solidAround(x + 1, y)));
        const v2 = B.vert(x1, fy, z1, 0, 1, 0, x1 / sc, z1 / sc, aoF(solidAround(x + 1, y + 1)));
        const v3 = B.vert(x0, fy, z1, 0, 1, 0, x0 / sc, z1 / sc, aoF(solidAround(x, y + 1)));
        B.quad(v0, v3, v2, v1);
        this.addFloorCollider(x, y, fy);
      } else {
        this.emitStairs(x, y, st);
      }
      // ---- ceiling ----
      {
        const mat = Z.ceilMat;
        const B = this.bufFor(x, y, mat);
        const sc = getMat(mat).userData.texScale || 2;
        const c = 0.75;
        const v0 = B.vert(x0, cy, z0, 0, -1, 0, x0 / sc, z0 / sc, c);
        const v1 = B.vert(x1, cy, z0, 0, -1, 0, x1 / sc, z0 / sc, c);
        const v2 = B.vert(x1, cy, z1, 0, -1, 0, x1 / sc, z1 / sc, c);
        const v3 = B.vert(x0, cy, z1, 0, -1, 0, x0 / sc, z1 / sc, c);
        B.quad(v0, v1, v2, v3);
      }
      // ---- walls & steps ----
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        // edge endpoints, inward normal
        let p0, p1, n, alongIsX;
        if (d.name === 'N') { p0 = { x: x0, z: z0 }; p1 = { x: x1, z: z0 }; n = { x: 0, z: 1 }; alongIsX = true; }
        if (d.name === 'S') { p0 = { x: x0, z: z1 }; p1 = { x: x1, z: z1 }; n = { x: 0, z: -1 }; alongIsX = true; }
        if (d.name === 'W') { p0 = { x: x0, z: z0 }; p1 = { x: x0, z: z1 }; n = { x: 1, z: 0 }; alongIsX = false; }
        if (d.name === 'E') { p0 = { x: x1, z: z0 }; p1 = { x: x1, z: z1 }; n = { x: -1, z: 0 }; alongIsX = false; }
        if (this.solid(nx, ny)) {
          const free = this.freeWidth(x, y, -d.dx, -d.dy);
          const maxInset = Math.max(0, free / 2 - 0.15);
          const pts = this.profile(zc, fy, cy, maxInset, (p0.x + p1.x) / 2, (p0.z + p1.z) / 2);
          this.emitWall(x, y, p0, p1, n, pts, fy, alongIsX);
          if (ZONES[zc].profile === 'tunnel') this.emitRibs(x, y, p0, p1, n, pts);
        } else {
          const j = this.idx(nx, ny);
          if (!this.zone[j]) continue;
          // floor step faces (emit from the higher cell, facing the lower cell)
          const eh = this.edgeHeights(x, y, d.name);
          const oppName = { N: 'S', S: 'N', E: 'W', W: 'E' }[d.name];
          const nh = this.edgeHeights(nx, ny, oppName);
          if (eh[0] > nh[0] + 0.02 || eh[1] > nh[1] + 0.02) {
            this.emitVertical(x, y, p0, p1, { x: -n.x, z: -n.z }, nh, eh, 'edge');
          }
          // ceiling header faces (emit from the lower-ceiling cell, facing the higher one)
          const ncy = this.ceilH[j];
          if (ncy > cy + 0.02) {
            this.emitVertical(x, y, p0, p1, { x: -n.x, z: -n.z }, [cy, cy], [ncy, ncy], ZONES[this.zone[j]].ceilMat, true);
          }
          // profile-difference caps where walls continue on both sides of a zone boundary
          this.emitCaps(x, y, d, nx, ny, p0, p1);
        }
      }
      // ---- convex corner revolves ----
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ax = x + dx, ay = y, bx = x, by = y + dy, cx = x + dx, cy2 = y + dy;
        if (this.solid(ax, ay) || this.solid(bx, by) || !this.solid(cx, cy2)) continue;
        const P = { x: dx > 0 ? x1 : x0, z: dy > 0 ? z1 : z0 };
        // directions: A's wall faces -dy (in z), B's wall faces -dx (in x)
        const angA = Math.atan2(-dy, 0), angB = Math.atan2(0, -dx);
        let a0 = angA, a1 = angB;
        let diff = a1 - a0; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
        a1 = a0 + diff;
        const free = Math.min(this.freeWidth(x, y, -dx, 0), this.freeWidth(x, y, 0, -dy));
        const pts = this.profile(zc, fy, cy, Math.max(0, free / 2 - 0.15), P.x, P.z);
        this.emitCorner(x, y, P, a0, a1, pts, fy);
      }
      // walls collider for solid neighbours handled globally below
      if (ch === 'o') this.cylinders.push({ x: (x + 0.5) * C, z: (y + 0.5) * C, r: 0.45, y0: fy, y1: cy });
      if (ch === 'x') this.boxes.push({ x: (x + 0.5) * C, y: fy + 0.45, z: (y + 0.5) * C, hx: C * 0.38, hy: 0.45, hz: C * 0.38, tag: 'rubble' });
    }
    this.addWallColliders();
    return this.finish();
  }

  edgeHeights(x, y, side) {
    // returns [h at edge start, h at edge end] matching p0/p1 order used in build()
    switch (side) {
      case 'N': return [this.floorAt(x, y, 0, 0), this.floorAt(x, y, 1, 0)];
      case 'S': return [this.floorAt(x, y, 0, 1), this.floorAt(x, y, 1, 1)];
      case 'W': return [this.floorAt(x, y, 0, 0), this.floorAt(x, y, 0, 1)];
      case 'E': return [this.floorAt(x, y, 1, 0), this.floorAt(x, y, 1, 1)];
    }
  }

  emitVertical(x, y, p0, p1, facing, lo, hi, mat, isHeader = false) {
    const B = this.bufFor(x, y, mat);
    const sc = getMat(mat).userData.texScale || 2;
    const alongX = Math.abs(p1.x - p0.x) > 0.01;
    const u0 = (alongX ? p0.x : p0.z) / sc, u1 = (alongX ? p1.x : p1.z) / sc;
    const c = isHeader ? 0.7 : 0.6;
    const i0 = B.vert(p0.x, lo[0], p0.z, facing.x, 0, facing.z, u0, lo[0] / sc, c * 0.8);
    const i1 = B.vert(p1.x, lo[1], p1.z, facing.x, 0, facing.z, u1, lo[1] / sc, c * 0.8);
    const i2 = B.vert(p1.x, hi[1], p1.z, facing.x, 0, facing.z, u1, hi[1] / sc, c);
    const i3 = B.vert(p0.x, hi[0], p0.z, facing.x, 0, facing.z, u0, hi[0] / sc, c);
    const cross = (p1.x - p0.x) * facing.z - (p1.z - p0.z) * facing.x;
    if (cross > 0) B.quad(i0, i1, i2, i3); else B.quad(i0, i3, i2, i1);
  }

  // Cap gaps between differing wall profiles where two floor cells meet next to a wall line.
  emitCaps(x, y, d, nx, ny, p0, p1) {
    // only handle each boundary once (from the cell with smaller index)
    if (this.idx(nx, ny) < this.idx(x, y)) return;
    const za = this.zone[this.idx(x, y)], zb = this.zone[this.idx(nx, ny)];
    // the boundary edge is shared; walls run perpendicular to it along both ends of the edge.
    // perpendicular directions to d:
    const perps = d.dx !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [px, py] of perps) {
      const wallA = this.solid(x + px, y + py), wallB = this.solid(nx + px, ny + py);
      if (!wallA || !wallB) continue;
      const fa = this.floorH[this.idx(x, y)], fb = this.floorH[this.idx(nx, ny)];
      const ca = this.ceilH[this.idx(x, y)], cb = this.ceilH[this.idx(nx, ny)];
      if (za === zb && Math.abs(fa - fb) < 0.01) continue;
      const freeA = this.freeWidth(x, y, -px, -py), freeB = this.freeWidth(nx, ny, -px, -py);
      const pa = this.profile(za, fa, ca, Math.max(0, freeA / 2 - 0.15), 0, 0);
      const pb = this.profile(zb, fb, cb, Math.max(0, freeB / 2 - 0.15), 0, 0);
      // wall line point on the boundary edge
      const P = px < 0 || py < 0 ? p0 : p1;
      const inw = { x: -px, z: -py };
      const top = Math.min(ca, cb), bot = Math.max(fa, fb);
      if (top <= bot) continue;
      const steps = 10;
      const B = this.bufFor(x, y, ZONES[za].ceil <= ZONES[zb].ceil ? pa[pa.length - 1].mat : pb[pb.length - 1].mat);
      const fx = d.dx, fz = d.dy;
      let prev = null;
      for (let s = 0; s <= steps; s++) {
        const yy = bot + (top - bot) * (s / steps);
        const ia = this.insetAt(pa, yy), ib = this.insetAt(pb, yy);
        const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
        const v0 = B.vert(P.x + inw.x * lo, yy, P.z + inw.z * lo, fx, 0, fz, lo / 2, yy / 2, 0.7);
        const v1 = B.vert(P.x + inw.x * hi, yy, P.z + inw.z * hi, fx, 0, fz, hi / 2, yy / 2, 0.7);
        if (prev) { B.quad(prev[0], prev[1], v1, v0); B.quad(prev[0], v0, v1, prev[1]); }
        prev = [v0, v1];
      }
    }
  }

  emitStairs(x, y, st) {
    const C = CELL;
    const x0 = x * C, z0 = y * C;
    const steps = Math.max(2, Math.round(Math.abs(st.b - st.a) / 0.2));
    const B = this.bufFor(x, y, 'edge');
    const sc = 2;
    const lo = Math.min(st.a, st.b), hi = Math.max(st.a, st.b);
    const dirUp = st.b > st.a ? 1 : -1; // along +axis goes up?
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const h = st.a + (st.b - st.a) * ((dirUp > 0 ? t1 : t0));
      const hPrev = st.a + (st.b - st.a) * (dirUp > 0 ? t0 : t1);
      // tread
      const corners = st.axis === 'x'
        ? [[x0 + t0 * C, z0], [x0 + t1 * C, z0], [x0 + t1 * C, z0 + C], [x0 + t0 * C, z0 + C]]
        : [[x0, z0 + t0 * C], [x0 + C, z0 + t0 * C], [x0 + C, z0 + t1 * C], [x0, z0 + t1 * C]];
      const ids = corners.map(([cx, cz]) => B.vert(cx, h, cz, 0, 1, 0, cx / sc, cz / sc, 0.8));
      B.quad(ids[0], ids[3], ids[2], ids[1]);
      // riser
      const edge = dirUp > 0 ? t0 : t1;
      const ex = st.axis === 'x' ? x0 + edge * C : null, ez = st.axis === 'y' ? z0 + edge * C : null;
      const facing = st.axis === 'x' ? { x: -dirUp, z: 0 } : { x: 0, z: -dirUp };
      const pA = st.axis === 'x' ? { x: ex, z: z0 } : { x: x0, z: ez };
      const pB = st.axis === 'x' ? { x: ex, z: z0 + C } : { x: x0 + C, z: ez };
      if (Math.abs(h - hPrev) > 0.01) this.emitVertical(x, y, pA, pB, facing, [Math.min(h, hPrev), Math.min(h, hPrev)], [Math.max(h, hPrev), Math.max(h, hPrev)], 'edge');
    }
    // ramp collider (convex hull)
    const pts = [];
    const H = (t) => st.a + (st.b - st.a) * t;
    if (st.axis === 'x') {
      for (const [t, zz] of [[0, z0], [0, z0 + C], [1, z0], [1, z0 + C]]) { pts.push(x0 + t * C, H(t), zz); pts.push(x0 + t * C, lo - 1, zz); }
    } else {
      for (const [t, xx] of [[0, x0], [0, x0 + C], [1, x0], [1, x0 + C]]) { pts.push(xx, H(t), z0 + t * C); pts.push(xx, lo - 1, z0 + t * C); }
    }
    this.ramps.push(new Float32Array(pts));
  }

  addFloorCollider(x, y, fy) {
    // merged later by row runs
    (this._floorCells ||= []).push([x, y, fy]);
  }

  addWallColliders() {
    const g = this.g, C = CELL;
    // floors: merge horizontal runs with equal height
    const rows = new Map();
    for (const [x, y, fy] of this._floorCells || []) {
      const k = `${y}|${fy}`;
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push(x);
    }
    for (const [k, xs] of rows) {
      const [ys, fys] = k.split('|'); const y = +ys, fy = +fys;
      xs.sort((a, b) => a - b);
      let s = xs[0], p = xs[0];
      const flush = () => this.boxes.push({ x: ((s + p + 1) / 2) * C, y: fy - 1, z: (y + 0.5) * C, hx: ((p - s + 1) / 2) * C, hy: 1, hz: C / 2, tag: 'floor' });
      for (let i = 1; i < xs.length; i++) { if (xs[i] === p + 1) p = xs[i]; else { flush(); s = p = xs[i]; } }
      flush();
    }
    // walls: solid cells adjacent (8-neigh) to floor; merge runs per row
    for (let y = -1; y <= g.h; y++) {
      let run = null;
      const flush = () => { if (run) { this.boxes.push({ x: ((run.s + run.e + 1) / 2) * C, y: (run.lo + run.hi) / 2, z: (y + 0.5) * C, hx: ((run.e - run.s + 1) / 2) * C, hy: (run.hi - run.lo) / 2, z2: 0, hz: C / 2, tag: 'wall' }); run = null; } };
      for (let x = -1; x <= g.w; x++) {
        let near = false, lo = 99, hi = -99;
        if (this.solid(x, y)) {
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox, yy = y + oy;
            if (!this.solid(xx, yy) && g.in(xx, yy) && this.zone[this.idx(xx, yy)]) { near = true; lo = Math.min(lo, this.floorH[this.idx(xx, yy)] - 2); hi = Math.max(hi, this.ceilH[this.idx(xx, yy)] + 1); }
          }
        }
        if (near) { if (run && run.e === x - 1) { run.e = x; run.lo = Math.min(run.lo, lo); run.hi = Math.max(run.hi, hi); } else { flush(); run = { s: x, e: x, lo, hi }; } }
        else flush();
      }
      flush();
    }
  }

  finish() {
    const group = new THREE.Group();
    group.name = 'level';
    for (const [key, mats] of this.buffers) {
      const [cx, cy] = key.split(',').map(Number);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        const cg = new THREE.Group();
        cg.name = 'chunk_' + key;
        chunk = { key, cx, cy, group: cg, center: new THREE.Vector3((cx + 0.5) * CHUNK * CELL, 0, (cy + 0.5) * CHUNK * CELL) };
        this.chunks.set(key, chunk);
        group.add(cg);
      }
      for (const [matKey, b] of mats) {
        if (!b.idx.length) continue;
        const mesh = new THREE.Mesh(b.toGeometry(), getMat(matKey));
        mesh.receiveShadow = true;
        // the flashlight sits at the viewer, so wall-on-wall shadows are never visible: skip them (big draw-call saving)
        mesh.castShadow = false;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.name = matKey;
        chunk.group.add(mesh);
      }
    }
    this.group = group;
    this.computePVS();
    return this;
  }

  chunkOf(x, y) { return `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`; }
  ensureChunk(x, y) {
    const key = this.chunkOf(x, y);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const [cx, cy] = key.split(',').map(Number);
      const cg = new THREE.Group(); cg.name = 'chunk_' + key;
      chunk = { key, cx, cy, group: cg, center: new THREE.Vector3((cx + 0.5) * CHUNK * CELL, 0, (cy + 0.5) * CHUNK * CELL) };
      this.chunks.set(key, chunk);
      this.group.add(cg);
    }
    return chunk;
  }

  // grid line of sight (DDA through cells); blocks on solid cells
  los(ax, ay, bx, by) {
    let x = Math.floor(ax), y = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    const dx = bx - ax, dy = by - ay;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDx = Math.abs(1 / (dx || 1e-9)), tDy = Math.abs(1 / (dy || 1e-9));
    let tMx = dx > 0 ? (x + 1 - ax) * tDx : (ax - x) * tDx;
    let tMy = dy > 0 ? (y + 1 - ay) * tDy : (ay - y) * tDy;
    for (let n = 0; n < 400; n++) {
      if (this.solid(x, y)) return false;
      if (x === tx && y === ty) return true;
      if (tMx < tMy) { tMx += tDx; x += stepX; } else { tMy += tDy; y += stepY; }
    }
    return true;
  }

  // Potentially-visible-set between chunks, sampled with grid rays (occlusion culling)
  computePVS() {
    const g = this.g;
    const floorCellsByChunk = new Map();
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!this.zone[this.idx(x, y)]) continue;
      const k = this.chunkOf(x, y);
      if (!floorCellsByChunk.has(k)) floorCellsByChunk.set(k, []);
      floorCellsByChunk.get(k).push([x, y]);
    }
    const keys = [...floorCellsByChunk.keys()];
    const pvs = new Map();
    for (const k of keys) pvs.set(k, new Set([k]));
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const samples = 14;
    for (let a = 0; a < keys.length; a++) {
      for (let b = a + 1; b < keys.length; b++) {
        const ka = keys[a], kb = keys[b];
        const [ax, ay] = ka.split(',').map(Number), [bx, by] = kb.split(',').map(Number);
        let vis = Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1;
        if (!vis) {
          const ca = floorCellsByChunk.get(ka), cb = floorCellsByChunk.get(kb);
          for (let s = 0; s < samples && !vis; s++) {
            const [x1, y1] = ca[Math.floor(rnd() * ca.length)];
            const [x2, y2] = cb[Math.floor(rnd() * cb.length)];
            if (this.los(x1 + 0.2 + rnd() * 0.6, y1 + 0.2 + rnd() * 0.6, x2 + 0.2 + rnd() * 0.6, y2 + 0.2 + rnd() * 0.6)) vis = true;
          }
        }
        if (vis) { pvs.get(ka).add(kb); pvs.get(kb).add(ka); }
      }
    }
    // make PVS conservative: include neighbours of visible chunks (camera can be anywhere in chunk)
    const expanded = new Map();
    for (const [k, set] of pvs) {
      const ex = new Set(set);
      for (const v of set) { const [vx, vy] = v.split(',').map(Number); for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) ex.add(`${vx + ox},${vy + oy}`); }
      expanded.set(k, ex);
    }
    this.pvs = expanded;
  }
}
