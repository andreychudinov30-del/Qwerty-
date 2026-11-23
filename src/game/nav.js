// Grid navigation: A* with octile moves, door/height constraints per agent, line-of-sight path smoothing.
import * as THREE from 'three';
import { CELL } from '../world/mapgen.js';

class Heap {
  constructor() { this.a = []; }
  push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; }
  get size() { return this.a.length; }
}

export class NavGrid {
  constructor(level, game) {
    this.level = level; this.game = game;
    this.b = level.builder; this.g = level.grid;
    this.w = this.g.w; this.h = this.g.h;
  }
  idx(x, y) { return y * this.w + x; }
  walk(x, y) { return this.g.in(x, y) && this.b.walkable[this.idx(x, y)] === 1; }
  doorBlocks(x, y, caps) {
    const d = this.game.doorAt?.(x, y);
    if (!d || d.open) return false;
    if (d.locked || d.sealed) return !caps.breakDoors || d.type === 'hermetic' || d.type === 'gate';
    return !(caps.openDoors || caps.breakDoors);
  }
  passable(ax, ay, bx, by, caps) {
    if (!this.walk(bx, by)) return false;
    if (this.doorBlocks(bx, by, caps)) return false;
    const fa = this.b.floorH[this.idx(ax, ay)], fb = this.b.floorH[this.idx(bx, by)];
    const sa = this.g.get(ax, ay) === 's', sb = this.g.get(bx, by) === 's';
    if (!sa && !sb && Math.abs(fa - fb) > (caps.climb ?? 0.5)) return false;
    return true;
  }
  cellOf(p) { return { x: Math.floor(p.x / CELL), y: Math.floor(p.z / CELL) }; }
  center(x, y) { const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL; return new THREE.Vector3(cx, this.level.floorAt(cx, cz), cz); }

  nearestWalkable(c) {
    if (this.walk(c.x, c.y)) return c;
    for (let r = 1; r < 4; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (this.walk(c.x + ox, c.y + oy)) return { x: c.x + ox, y: c.y + oy };
    return null;
  }

  findPath(from, to, caps = {}, maxNodes = 4000) {
    let s = this.nearestWalkable(this.cellOf(from)), t = this.nearestWalkable(this.cellOf(to));
    if (!s || !t) return null;
    if (s.x === t.x && s.y === t.y) return [to.clone()];
    const W = this.w;
    const g = new Map(), came = new Map();
    const open = new Heap();
    const si = this.idx(s.x, s.y), ti = this.idx(t.x, t.y);
    g.set(si, 0); open.push(si, 0);
    const hfn = (i) => { const x = i % W, y = (i / W) | 0; const dx = Math.abs(x - t.x), dy = Math.abs(y - t.y); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const closed = new Set();
    let n = 0, found = false;
    while (open.size && n++ < maxNodes) {
      const cur = open.pop();
      if (cur === ti) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % W, cy = (cur / W) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox, ny = cy + oy;
        if (!this.passable(cx, cy, nx, ny, caps)) continue;
        if (ox && oy && (!this.passable(cx, cy, nx, cy, caps) || !this.passable(cx, cy, cx, ny, caps))) continue;
        const ni = this.idx(nx, ny);
        const cost = (g.get(cur) || 0) + (ox && oy ? 1.414 : 1);
        if (cost < (g.get(ni) ?? Infinity)) { g.set(ni, cost); came.set(ni, cur); open.push(ni, cost + hfn(ni)); }
      }
    }
    if (!found) return null;
    const cells = [];
    let c = ti;
    while (c !== undefined && c !== si) { cells.push(c); c = came.get(c); }
    cells.reverse();
    // string pulling with grid LOS (and no height jumps)
    const pts = cells.map((i) => this.center(i % W, (i / W) | 0));
    pts[pts.length - 1] = to.clone();
    const out = [];
    let anchor = from.clone();
    let k = 0;
    while (k < pts.length) {
      let far = k;
      for (let j = pts.length - 1; j > k; j--) {
        if (Math.abs(pts[j].y - anchor.y) < 0.4 && this.b.los(anchor.x / CELL, anchor.z / CELL, pts[j].x / CELL, pts[j].z / CELL) && this.clearDoors(anchor, pts[j], caps)) { far = j; break; }
      }
      out.push(pts[far]);
      anchor = pts[far];
      k = far + 1;
    }
    return out;
  }
  clearDoors(a, b, caps) {
    const steps = Math.ceil(a.distanceTo(b) / (CELL * 0.5));
    for (let i = 1; i < steps; i++) { const p = a.clone().lerp(b, i / steps); const c = this.cellOf(p); if (this.doorBlocks(c.x, c.y, caps)) return false; }
    return true;
  }

  randomNear(p, radiusCells = 6, caps = {}, rnd = Math.random) {
    const c = this.cellOf(p);
    for (let i = 0; i < 30; i++) {
      const x = c.x + Math.round((rnd() - 0.5) * 2 * radiusCells), y = c.y + Math.round((rnd() - 0.5) * 2 * radiusCells);
      if (this.walk(x, y) && !this.doorBlocks(x, y, caps)) return this.center(x, y);
    }
    return null;
  }
}
