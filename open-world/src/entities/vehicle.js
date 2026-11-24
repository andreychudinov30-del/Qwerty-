// Vehicles: procedural car bodies (lofted shell with wheel arches), Rapier raycast-vehicle physics, deformation, glass, fire
import * as THREE from 'three';
import { G, clamp, lerp, rand, pick, _v1, _v2, _q1 } from '../core/util.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { vcMat } from '../world/geo.js';
import { nightU } from '../world/buildings.js';

export const VT = {
  rust: { name: 'Волна 2104 (старый седан)', style: 'sedan', L: 4.5, W: 1.74, belt: 0.92, roof: 1.42, wb: 2.6, R: 0.32, clear: 0.2, mass: 1150, power: 5200, top: 40, grip: 1.6, price: 0, colors: ['#7a6a52'] },
  compact: { name: 'Искра Мини', style: 'hatch', L: 3.9, W: 1.7, belt: 0.95, roof: 1.48, wb: 2.45, R: 0.31, clear: 0.18, mass: 1000, power: 5600, top: 43, grip: 1.8, price: 9000, colors: ['#c8302a', '#2a62c8', '#e8e8e8', '#e8c22a', '#3a3a3a', '#5aa04a'] },
  sedan: { name: 'Аврора Седан', style: 'sedan', L: 4.75, W: 1.82, belt: 0.95, roof: 1.45, wb: 2.8, R: 0.33, clear: 0.19, mass: 1400, power: 7600, top: 50, grip: 1.9, price: 18000, colors: ['#1a1a1a', '#e8e8e8', '#8a8e92', '#2a3a5a', '#6a1a1a', '#c8c0b0'] },
  taxi: { name: 'Аврора Такси', style: 'sedan', L: 4.75, W: 1.82, belt: 0.95, roof: 1.45, wb: 2.8, R: 0.33, clear: 0.19, mass: 1400, power: 7400, top: 49, grip: 1.9, price: 15000, colors: ['#f0c018'], taxi: true },
  police: { name: 'Патруль Интерсептор', style: 'sedan', L: 4.95, W: 1.88, belt: 0.97, roof: 1.47, wb: 2.9, R: 0.34, clear: 0.2, mass: 1600, power: 11500, top: 60, grip: 2.2, price: 0, colors: ['#f4f4f4'], police: true },
  suv: { name: 'Титан SUV', style: 'suv', L: 4.9, W: 1.95, belt: 1.12, roof: 1.82, wb: 2.9, R: 0.38, clear: 0.26, mass: 2100, power: 10500, top: 50, grip: 2.0, price: 32000, colors: ['#1a1a1a', '#e8e8e8', '#3a4a3a', '#5a5a62', '#2a2a4a'] },
  sport: { name: 'Вектор GT', style: 'sport', L: 4.5, W: 1.92, belt: 0.82, roof: 1.22, wb: 2.65, R: 0.34, clear: 0.13, mass: 1350, power: 14500, top: 68, grip: 2.7, price: 85000, colors: ['#d8201a', '#f0d020', '#1a1a1a', '#e8e8e8', '#1a5ad8', '#e86a1a'] },
  super: { name: 'Феникс R', style: 'super', L: 4.6, W: 2.0, belt: 0.78, roof: 1.12, wb: 2.7, R: 0.35, clear: 0.11, mass: 1400, power: 19000, top: 82, grip: 3.1, price: 240000, colors: ['#2adf6a', '#d8d8d8', '#e83a1a', '#1a1a1a', '#7a2adf'] },
  muscle: { name: 'Буйвол 70', style: 'muscle', L: 5.0, W: 1.92, belt: 0.92, roof: 1.32, wb: 2.9, R: 0.35, clear: 0.17, mass: 1650, power: 12500, top: 60, grip: 2.0, price: 46000, colors: ['#1a1a1a', '#c81a1a', '#1a3ac8', '#e8a81a'] },
  pickup: { name: 'Бизон Пикап', style: 'pickup', L: 5.3, W: 1.98, belt: 1.12, roof: 1.85, wb: 3.2, R: 0.4, clear: 0.3, mass: 2200, power: 10000, top: 46, grip: 1.9, price: 27000, colors: ['#8a1a1a', '#e8e8e8', '#2a2a2a', '#4a5a6a', '#8a7a5a'] },
  van: { name: 'Курьер Фургон', style: 'van', L: 5.2, W: 2.0, belt: 1.05, roof: 2.25, wb: 3.2, R: 0.36, clear: 0.22, mass: 2300, power: 8500, top: 40, grip: 1.7, price: 21000, colors: ['#e8e8e8', '#2a4a8a', '#c8c8c0'] },
  bus: { name: 'Городской автобус', style: 'bus', L: 11, W: 2.5, belt: 1.15, roof: 3.0, wb: 6.4, R: 0.5, clear: 0.32, mass: 9000, power: 30000, top: 30, grip: 1.6, price: 0, colors: ['#2a8a4a', '#d8a81a'] },
};
export const TRAFFIC_TYPES = ['sedan', 'sedan', 'compact', 'compact', 'suv', 'taxi', 'pickup', 'van', 'sport', 'muscle', 'sedan', 'suv', 'bus'];

// ---------------- materials ----------------
const paintCache = new Map();
export function paintMat(hex) {
  if (paintCache.has(hex)) return paintCache.get(hex);
  const m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 });
  paintCache.set(hex, m); return m;
}
const GLASS = new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.03, metalness: 0.92, transparent: true, opacity: 0.78 });
const TRIM = vcMat(0.45, 0.55);
const WHEEL = vcMat(0.55, 0.35);
const BURNT = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95, metalness: 0.2 });
const POOLTEX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,245,220,0.8)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const POOLMAT = new THREE.MeshBasicMaterial({ map: POOLTEX, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -4 });

// ---------------- geometry ----------------
const geoCache = new Map();
function profile(T, t) {
  // returns {w, yb, ys, yr|null, glassTop:boolean} along body (t=0 rear .. 1 front)
  const s = T.style;
  const L = T.L, W = T.W / 2;
  const z = (t - 0.5) * L;
  const endF = Math.pow(Math.abs(2 * t - 1), s === 'bus' || s === 'van' ? 12 : 5);
  const w = W * Math.pow(Math.max(0, 1 - endF), 0.22) * (s === 'bus' ? 1 : 0.94 + 0.06 * Math.cos((t - 0.55) * 3));
  // body bottom with wheel arches
  let yb = T.clear;
  for (const wz of [-T.wb / 2, T.wb / 2]) {
    const d = z - wz, ar = T.R + 0.1;
    if (Math.abs(d) < ar) yb = Math.max(yb, T.R + Math.sqrt(ar * ar - d * d) * 0.95);
  }
  // shoulder (hood/deck/belt)
  const hood = { sedan: 0.88, hatch: 0.9, suv: 1.08, sport: 0.72, super: 0.66, muscle: 0.9, pickup: 1.08, van: 1.0, bus: 1.1 }[s];
  const deck = { sedan: 0.98, hatch: 0.98, suv: 1.12, sport: 0.84, super: 0.8, muscle: 0.95, pickup: 1.1, van: 1.05, bus: 1.15 }[s];
  const nose = { sedan: 0.62, hatch: 0.66, suv: 0.82, sport: 0.45, super: 0.4, muscle: 0.68, pickup: 0.85, van: 0.8, bus: 1.1 }[s];
  let ys = lerp(deck, hood, clamp((t - 0.3) / 0.4, 0, 1));
  if (t > 0.85) ys = lerp(ys, nose, Math.pow((t - 0.85) / 0.15, 1.6));
  if (t < 0.06) ys = lerp(ys, deck - 0.22, Math.pow((0.06 - t) / 0.06, 1.5));
  // greenhouse
  const G_ = { sedan: [0.2, 0.33, 0.58, 0.7], hatch: [0.04, 0.1, 0.55, 0.7], suv: [0.03, 0.07, 0.62, 0.73], sport: [0.18, 0.32, 0.52, 0.68], super: [0.22, 0.36, 0.48, 0.66], muscle: [0.18, 0.3, 0.55, 0.66], pickup: [0.4, 0.42, 0.6, 0.7], van: [0.02, 0.04, 0.78, 0.86], bus: [0.01, 0.02, 0.97, 0.99] }[s];
  const [rw, re, rs, ws] = G_; // rear window base, roof end, roof start, windshield base
  let yr = null, gt = false;
  if (t >= rw && t <= ws) {
    const roof = T.roof;
    if (t < re) { yr = lerp(ys, roof, (t - rw) / (re - rw)); gt = true; }
    else if (t > rs) { yr = lerp(roof, ys, (t - rs) / (ws - rs)); gt = true; }
    else { yr = roof + Math.sin(((t - re) / (rs - re)) * Math.PI) * 0.025; }
  }
  return { z, w, yb, ys, yr, gt, rw, re, rs, ws };
}

function buildCarGeo(key, T) {
  if (geoCache.has(key)) return geoCache.get(key);
  const NS = T.style === 'bus' ? 30 : 44;
  const body = { p: [], i: [] }, glass = { p: [], i: [] }, roofP = { p: [], i: [] };
  const ring = (P) => {
    // half-section points (x>=0), mirrored
    const pts = [[0, P.yb], [P.w * 0.86, P.yb], [P.w, P.yb + 0.12], [P.w, P.ys - 0.14], [P.w * 0.97, P.ys - 0.02], [P.w * 0.9, P.ys + 0.02], [0, P.ys + 0.04]];
    const full = [];
    for (let k = pts.length - 1; k >= 1; k--) full.push([-pts[k][0], pts[k][1]]);
    for (const q of pts) full.push(q);
    return full;
  };
  const secs = [];
  for (let s = 0; s <= NS; s++) secs.push(profile(T, s / NS));
  // lower shell
  const RL = ring(secs[0]).length;
  for (let s = 0; s <= NS; s++) { const P = secs[s]; for (const [x, y] of ring(P)) body.p.push(x, y, P.z); }
  for (let s = 0; s < NS; s++) for (let k = 0; k < RL - 1; k++) {
    const a = s * RL + k, b = a + RL; body.i.push(a, a + 1, b + 1, a, b + 1, b);
  }
  // end caps (rear/front) as fans
  for (const s of [0, NS]) {
    const base = s * RL, c = body.p.length / 3; const P = secs[s];
    body.p.push(0, (P.yb + P.ys) / 2, P.z);
    for (let k = 0; k < RL - 1; k++) s === 0 ? body.i.push(c, base + k + 1, base + k) : body.i.push(c, base + k, base + k + 1);
  }
  // greenhouse: side band (glass/paint) + top strip
  let prev = null;
  for (let s = 0; s <= NS; s++) {
    const P = secs[s]; if (P.yr === null) { prev = null; continue; }
    const wg = P.w * 0.93, wr = P.w * (T.style === 'bus' || T.style === 'van' ? 0.9 : 0.72);
    const cur = { P, pts: [[-wg, P.ys], [-wr, P.yr], [wr, P.yr], [wg, P.ys]] };
    if (prev) {
      const A = prev, B = cur;
      const tmid = (A.P.z + B.P.z) / 2 / T.L + 0.5;
      const bp = Math.abs(tmid - (A.P.re + A.P.rs) / 2) < 0.012 && T.style !== 'bus';
      const sideGlass = tmid > A.P.re && tmid < A.P.rs && !bp;
      const topGlass = A.P.gt || B.P.gt;
      const quad = (tgt, a0, a1, b0, b1) => { const o = tgt.p.length / 3; tgt.p.push(a0[0], a0[1], A.P.z, a1[0], a1[1], A.P.z, b1[0], b1[1], B.P.z, b0[0], b0[1], B.P.z); tgt.i.push(o, o + 1, o + 2, o, o + 2, o + 3); };
      // left side band, top, right side band (winding outward)
      quad(sideGlass ? glass : body, A.pts[1], A.pts[0], B.pts[1], B.pts[0]);
      quad(topGlass ? glass : roofP, A.pts[2], A.pts[1], B.pts[2], B.pts[1]);
      quad(sideGlass ? glass : body, A.pts[3], A.pts[2], B.pts[3], B.pts[2]);
    }
    prev = cur;
  }
  const mk = (o) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); g.setIndex(o.i); g.computeVertexNormals(); return g; };
  // merge roof into body (same paint)
  const bodyG = mk({ p: body.p.concat(roofP.p), i: body.i.concat(roofP.i.map((v) => v + body.p.length / 3)) });
  const glassG = mk(glass);
  // ---- trim (vertex colored) ----
  const parts = [];
  const box = (x, y, z, w, h, d, col, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); colorize(g, col); parts.push(g); };
  const f = secs[NS], r = secs[0];
  const black = [0.03, 0.03, 0.035], chrome = [0.85, 0.86, 0.88], dark = [0.08, 0.08, 0.09];
  // bumpers handled separately (detachable)
  box(0, f.ys - 0.17, f.z - 0.03, T.W * 0.5, 0.14, 0.06, black); // grille
  if (T.style === 'muscle' || T.style === 'pickup') box(0, f.ys - 0.17, f.z - 0.01, T.W * 0.52, 0.03, 0.04, chrome);
  for (const sx of [-1, 1]) {
    box(sx * (T.W / 2 + 0.05), T.belt + 0.05, (T.wb / 2) * 0.55, 0.12, 0.1, 0.18, black); // mirrors
    box(sx * (T.W / 2 - 0.02), (secs[NS / 2 | 0].yb + 0.18), 0, 0.04, 0.08, T.wb * 0.75, dark); // side skirt
    box(sx * (T.W / 2 * 0.98), T.belt - 0.12, 0.25, 0.02, 0.03, 0.18, chrome); // handle
  }
  box(0, r.yb + 0.42, r.z - 0.02, 0.52, 0.12, 0.02, [0.92, 0.92, 0.92]); // plate
  box(T.W * 0.3, r.yb + 0.06, r.z + 0.1, 0.08, 0.08, 0.2, chrome); // exhaust
  if (T.police) { box(0, T.roof + 0.06, -0.05, 1.2, 0.1, 0.32, black); }
  if (T.taxi) { box(0, T.roof + 0.1, -0.1, 0.6, 0.18, 0.22, [0.95, 0.85, 0.2]); }
  if (T.style === 'pickup') { box(0, T.belt + 0.03, -T.L * 0.27, T.W * 0.86, 0.05, T.L * 0.4, dark); }
  if (T.style === 'bus') { for (const sx of [-1, 1]) box(sx * T.W / 2, 1.9, -0.5, 0.02, 1.1, 8.2, [0.1, 0.12, 0.14]); }
  const trimG = mergeColored(parts);
  // lights (head = white, tail = red)
  const headP = [], tailP = [];
  for (const sx of [-1, 1]) {
    const hp = new THREE.BoxGeometry(T.W * 0.2, 0.11, 0.05); hp.translate(sx * T.W * 0.33, f.ys - 0.1, f.z - 0.06 - 0.02 * Math.abs(sx)); headP.push(hp);
    const tp = new THREE.BoxGeometry(T.W * 0.22, 0.1, 0.05); tp.translate(sx * T.W * 0.34, r.ys - 0.12, r.z + 0.05); tailP.push(tp);
  }
  if (T.police) { const a = new THREE.BoxGeometry(0.5, 0.08, 0.26); a.translate(-0.33, T.roof + 0.15, -0.05); headP.push(a); const b = new THREE.BoxGeometry(0.5, 0.08, 0.26); b.translate(0.33, T.roof + 0.15, -0.05); tailP.push(b); }
  const headG = mergeColored(headP), tailG = mergeColored(tailP);
  // bumpers
  const fb = new THREE.BoxGeometry(T.W * 0.98, 0.2, 0.18); fb.translate(0, Math.max(f.yb, T.clear) + 0.18, f.z - 0.02); colorize(fb, T.style === 'muscle' ? chrome : dark);
  const rb = new THREE.BoxGeometry(T.W * 0.98, 0.2, 0.18); rb.translate(0, Math.max(r.yb, T.clear) + 0.2, r.z + 0.02); colorize(rb, T.style === 'muscle' ? chrome : dark);
  const res = { bodyG, glassG, trimG, headG, tailG, fbG: fb, rbG: rb, wheelG: wheelGeo(T) };
  geoCache.set(key, res);
  return res;
}
function colorize(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
function mergeColored(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const p = new Float32Array(n * 3), no = new Float32Array(n * 3), c = new Float32Array(n * 3), ix = []; let o = 0;
  for (const g of list) {
    if (!g.attributes.color) colorize(g, [1, 1, 1]);
    p.set(g.attributes.position.array, o * 3); no.set(g.attributes.normal.array, o * 3); c.set(g.attributes.color.array, o * 3);
    for (let i = 0; i < g.index.count; i++) ix.push(g.index.getX(i) + o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.BufferAttribute(no, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setIndex(ix);
  return g;
}
const wheelCache = new Map();
function wheelGeo(T) {
  const k = T.R + '|' + T.style;
  if (wheelCache.has(k)) return wheelCache.get(k);
  const R = T.R, Wt = T.style === 'bus' ? 0.32 : T.style === 'super' || T.style === 'sport' ? 0.3 : 0.24;
  const prof = [];
  const rr = R * (T.style === 'sport' || T.style === 'super' ? 0.72 : 0.64);
  prof.push(new THREE.Vector2(rr * 0.98, -Wt / 2));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; prof.push(new THREE.Vector2(R - 0.04 + Math.cos(a) * 0.04, Math.sin(a) * (Wt / 2))); }
  prof.push(new THREE.Vector2(rr * 0.98, Wt / 2));
  const tire = new THREE.LatheGeometry(prof, 24); tire.rotateZ(Math.PI / 2); colorize(tire, [0.035, 0.035, 0.038]);
  const parts = [tire];
  const rimC = T.style === 'muscle' ? [0.9, 0.9, 0.92] : T.police ? [0.2, 0.2, 0.22] : [0.72, 0.73, 0.76];
  const disc = new THREE.CylinderGeometry(rr, rr, 0.04, 20); disc.rotateZ(Math.PI / 2); disc.translate(Wt * 0.3, 0, 0); colorize(disc, [0.12, 0.12, 0.13]); parts.push(disc);
  const lip = new THREE.TorusGeometry(rr * 0.96, 0.02, 6, 24); lip.rotateY(Math.PI / 2); lip.translate(Wt * 0.42, 0, 0); colorize(lip, rimC); parts.push(lip);
  const nS = T.style === 'sport' || T.style === 'super' ? 10 : 5;
  for (let i = 0; i < nS; i++) { const s = new THREE.BoxGeometry(0.04, rr * 0.9, 0.05); s.translate(Wt * 0.36, rr * 0.45, 0); s.rotateX((i / nS) * Math.PI * 2); colorize(s, rimC); parts.push(s); }
  const hub = new THREE.CylinderGeometry(0.06, 0.07, 0.06, 10); hub.rotateZ(Math.PI / 2); hub.translate(Wt * 0.4, 0, 0); colorize(hub, rimC); parts.push(hub);
  const g = mergeColored(parts);
  wheelCache.set(k, g); return g;
}

// ---------------- Vehicle ----------------
let VID = 0;
export class Vehicle {
  constructor(world, type, opts = {}) {
    this.id = ++VID;
    this.world = world; // {scene, physics}
    this.typeId = type; this.T = VT[type];
    const T = this.T;
    this.color = opts.color || pick(T.colors);
    this.group = new THREE.Group();
    const geos = buildCarGeo(type, T);
    this.originH = 0.34 + T.R; // body origin height above ground at rest
    const inner = new THREE.Group(); inner.position.y = -this.originH; this.inner = inner; this.group.add(inner);
    this.bodyGeo = geos.bodyG;
    this.paint = T.police ? paintMat('#f2f2f2') : paintMat(this.color);
    this.body = new THREE.Mesh(geos.bodyG, this.paint);
    if (T.police) this.body.material = policeMat();
    this.glass = new THREE.Mesh(geos.glassG, GLASS);
    this.trim = new THREE.Mesh(geos.trimG, TRIM);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.5, vertexColors: false });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1008, emissiveIntensity: 0.5, roughness: 0.2 });
    if (T.police) { this.headMat.emissive.set(0xfff4e0); this.sirenR = new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff0a0a, emissiveIntensity: 0 }); this.sirenB = new THREE.MeshStandardMaterial({ color: 0x000030, emissive: 0x1a40ff, emissiveIntensity: 0 }); }
    this.head = new THREE.Mesh(geos.headG, this.headMat); this.tail = new THREE.Mesh(geos.tailG, this.tailMat);
    this.fb = new THREE.Mesh(geos.fbG, TRIM); this.rb = new THREE.Mesh(geos.rbG, TRIM);
    for (const m of [this.body, this.glass, this.trim, this.head, this.tail, this.fb, this.rb]) { m.castShadow = m !== this.glass; m.receiveShadow = true; inner.add(m); }
    if (T.police) { // light bar lamps
      const lb = new THREE.BoxGeometry(0.42, 0.09, 0.22);
      this.lbR = new THREE.Mesh(lb, this.sirenR); this.lbR.position.set(-0.33, T.roof + 0.16, -0.05);
      this.lbB = new THREE.Mesh(lb, this.sirenB); this.lbB.position.set(0.33, T.roof + 0.16, -0.05);
      inner.add(this.lbR, this.lbB);
    }
    this.wheels = [];
    const wx = T.W / 2 - 0.16, wz = T.wb / 2;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const piv = new THREE.Group(); const w = new THREE.Mesh(geos.wheelG, WHEEL);
      w.castShadow = true; if (sx < 0) w.rotation.y = Math.PI;
      piv.add(w); piv.position.set(sx * wx, T.R, sz * wz); inner.add(piv);
      this.wheels.push({ piv, mesh: w, sx, sz, x: sx * wx, z: sz * wz, spin: 0, steer: sz > 0 });
    }
    // ground light pool (headlights at night)
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 9).rotateX(-Math.PI / 2), POOLMAT); this.pool.position.set(0, 0.05, T.L / 2 + 4.5); this.pool.renderOrder = 2; inner.add(this.pool);
    this.world.scene.add(this.group);
    this.health = 1000; this.maxHealth = 1000; this.burning = 0; this.dead = false;
    this.glassBroken = false; this.deform = 0;
    this.throttle = 0; this.steer = 0; this.brake = 0; this.handbrake = 0; this.steerAng = 0;
    this.speed = 0; this.rpm = 800; this.gear = 1; this.slip = 0;
    this.driver = null; this.passengers = [];
    this.siren = false; this.lightsOn = false; this.horn = 0;
    this.mode = 'none'; this.lastVel = new THREE.Vector3(); this.spinSign = 1;
    this.pos = this.group.position; this.quat = this.group.quaternion;
    this.heading = 0; this.vel = new THREE.Vector3();
    this.locked = false; this.owner = null; this.mission = null;
    this.mass = T.mass;
    this.half = new THREE.Vector3(T.W / 2, (T.roof) / 2, T.L / 2);
  }
  place(x, z, heading, y = null) {
    this.heading = heading;
    this.group.position.set(x, (y ?? 0.16) + this.originH, z);
    this.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    if (this.rb_) { this.rb_.setTranslation(this.group.position, true); this.rb_.setRotation(this.group.quaternion, true); }
    return this;
  }
  forward(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.group.quaternion); }
  // --- kinematic (traffic) mode ---
  makeKinematic() {
    this.removeBodies();
    const P = this.world.physics;
    const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation(this.quat);
    this.kb = P.world.createRigidBody(bd);
    const c = P.world.createCollider(RAPIER.ColliderDesc.cuboid(this.T.W / 2, 0.55, this.T.L / 2).setTranslation(0, 0.55 - this.originH + this.T.clear + 0.1, 0).setCollisionGroups(groups(GR.VEHICLE, GR.VEHICLE | GR.PLAYER | GR.RAGDOLL | GR.PROP)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), this.kb);
    P.handles.set(c.handle, { type: 'vehicle', v: this });
    this.kcol = c;
    this.mode = 'kinematic';
  }
  // --- full physics mode ---
  makeDynamic(vel = null) {
    const P = this.world.physics, T = this.T;
    const lv = vel || (this.mode === 'kinematic' ? this.vel.clone() : null);
    this.removeBodies();
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(this.pos.x, this.pos.y + 0.05, this.pos.z).setRotation(this.quat).setLinearDamping(0.06).setAngularDamping(0.9).setCcdEnabled(true).setCanSleep(true);
    const rb = P.world.createRigidBody(bd);
    const bodyH = T.belt - T.clear - 0.12;
    const lower = RAPIER.ColliderDesc.cuboid(T.W / 2 * 0.96, bodyH / 2, T.L / 2 * 0.97).setTranslation(0, T.clear + 0.14 + bodyH / 2 - this.originH, 0)
      .setMass(T.mass * 0.75).setFriction(0.35).setRestitution(0.05).setCollisionGroups(groups(GR.VEHICLE, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(T.mass * 25);
    const cab = RAPIER.ColliderDesc.cuboid(T.W / 2 * 0.8, (T.roof - T.belt) / 2, T.L * 0.22).setTranslation(0, T.belt + (T.roof - T.belt) / 2 - this.originH, -T.L * 0.02).setMass(T.mass * 0.1).setFriction(0.3).setCollisionGroups(groups(GR.VEHICLE, 0xffff));
    const ballast = RAPIER.ColliderDesc.cuboid(T.W / 2 * 0.5, 0.05, T.L / 2 * 0.5).setTranslation(0, T.clear + 0.1 - this.originH, 0).setMass(T.mass * 0.15).setCollisionGroups(groups(GR.VEHICLE, 0)).setSensor(false);
    const c1 = P.world.createCollider(lower, rb); P.world.createCollider(cab, rb); P.world.createCollider(ballast, rb);
    P.handles.set(c1.handle, { type: 'vehicle', v: this });
    this.col = c1;
    const ctrl = P.world.createVehicleController(rb);
    ctrl.setIndexForwardAxis = 2;
    for (const w of this.wheels) {
      ctrl.addWheel({ x: w.x, y: -0.06, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.36, T.R);
    }
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelSuspensionStiffness(i, 26 + T.grip * 4);
      ctrl.setWheelSuspensionCompression(i, 2.6);
      ctrl.setWheelSuspensionRelaxation(i, 3.2);
      ctrl.setWheelMaxSuspensionTravel(i, 0.28);
      ctrl.setWheelMaxSuspensionForce(i, T.mass * 60);
      ctrl.setWheelFrictionSlip(i, T.grip * 1.1);
      ctrl.setWheelSideFrictionStiffness(i, 1.0);
    }
    this.rb_ = rb; this.ctrl = ctrl;
    if (lv) rb.setLinvel(lv, true);
    this.mode = 'dynamic';
  }
  removeBodies() {
    const P = this.world.physics;
    if (this.ctrl) { P.world.removeVehicleController(this.ctrl); this.ctrl = null; }
    if (this.rb_) { P.world.removeRigidBody(this.rb_); this.rb_ = null; }
    if (this.kb) { P.world.removeRigidBody(this.kb); this.kb = null; }
    this.mode = 'none';
  }
  // called every physics substep for dynamic vehicles
  prePhysics(dt) {
    if (this.mode !== 'dynamic') return;
    const T = this.T, c = this.ctrl;
    const v = this.rb_.linvel();
    const fwd = this.forward(_v1);
    const vf = v.x * fwd.x + v.y * fwd.y + v.z * fwd.z;
    this.speed = vf;
    const absV = Math.abs(vf);
    // steering: reduce with speed
    const maxSteer = lerp(0.62, 0.16, clamp(absV / 45, 0, 1));
    this.steerAng = damp(this.steerAng, -this.steer * maxSteer, 9, dt);
    c.setWheelSteering(0, this.steerAng); c.setWheelSteering(1, this.steerAng);
    // engine
    const dead = this.dead || this.health <= 0;
    let thr = dead ? 0 : this.throttle;
    let brk = this.brake;
    if (thr < 0 && vf > 1.5) { brk = Math.max(brk, -thr); thr = 0; }
    if (thr > 0 && vf < -1.5) { brk = Math.max(brk, thr); thr = 0; }
    const top = T.top * (this.health < 300 ? 0.6 : 1);
    const pf = absV > top ? 0 : (1 - Math.pow(absV / top, 2) * 0.7);
    const F = thr * T.power * pf * (thr < 0 ? 0.45 : 1);
    const awd = T.style === 'super' || T.style === 'suv' || T.police;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      c.setWheelEngineForce(i, (awd ? F / 4 : front ? 0 : F / 2) * 1);
      c.setWheelBrake(i, brk * T.mass * 0.032 + (!front && this.handbrake ? T.mass * 0.02 : 0) + (Math.abs(thr) < 0.05 && absV < 1 ? T.mass * 0.004 : 0));
      if (!front) c.setWheelFrictionSlip(i, this.handbrake ? T.grip * 0.45 : T.grip * 1.1);
    }
    // downforce + anti-roll stabilization
    const fd = absV * absV * T.mass * 0.0016;
    this.rb_.resetForces(true);
    this.rb_.addForce({ x: 0, y: -fd, z: 0 }, true);
    c.updateVehicle(dt, undefined, groups(0xffff, GR.STATIC | GR.VEHICLE | GR.PROP));
  }
  ownCollider(col) { const p = col.parent(); return p && this.rb_ && p.handle === this.rb_.handle; }
  // after physics step: sync visuals
  sync(dt) {
    const T = this.T;
    if (this.mode === 'dynamic') {
      const t = this.rb_.translation(), r = this.rb_.rotation();
      this.group.position.set(t.x, t.y, t.z); this.group.quaternion.set(r.x, r.y, r.z, r.w);
      const lv = this.rb_.linvel(); this.vel.set(lv.x, lv.y, lv.z);
      const f = this.forward(_v1); this.heading = Math.atan2(f.x, f.z);
      for (let i = 0; i < 4; i++) {
        const w = this.wheels[i];
        const sl = this.ctrl.wheelSuspensionLength(i) ?? 0.3;
        w.piv.position.y = this.originH - 0.06 - sl;
        w.piv.rotation.y = this.ctrl.wheelSteering(i) || 0;
        w.mesh.rotation.x = (this.ctrl.wheelRotation(i) || 0) * this.spinSign;
      }
      // detect impacts by velocity delta
      const dv = _v2.copy(this.vel).sub(this.lastVel);
      const dvl = Math.hypot(dv.x, dv.z) + Math.max(0, -dv.y) * 0.3;
      if (dvl > 4.5 && this.lastVel.length() > 4) this.impact(dv, dvl);
      this.lastVel.copy(this.vel);
      // skid / slip
      let slip = 0;
      for (let i = 2; i < 4; i++) slip += Math.abs(this.ctrl.wheelSideImpulse(i) || 0);
      this.slip = clamp(slip / (T.mass * 0.03), 0, 1) * (Math.abs(this.speed) > 6 ? 1 : 0) + (this.handbrake && Math.abs(this.speed) > 5 ? 0.6 : 0);
      if (this.slip > 0.5 && G.fx && Math.random() < 0.5) for (const w of this.wheels.slice(2)) { const p = w.piv.getWorldPosition(_v2); G.fx.tire(p.x, 0.05, p.z, this.slip); }
      // water
      if (t.y < -0.3 && !this.sunk) { this.sunk = true; G.fx && G.fx.splash(t.x, -0.4, t.z, 40); this.health = 0; this.dead = true; G.bus.emit('vehicleSunk', this); }
    } else if (this.mode === 'kinematic') {
      for (const w of this.wheels) { w.spin += (this.speed * dt) / T.R; w.mesh.rotation.x = w.spin; w.piv.rotation.y = w.steer ? this.steerAng : 0; }
    }
    // engine rpm (simulated gearbox)
    const sp = Math.abs(this.speed);
    const ratios = [0, 9, 14.5, 21, 28, 36, 99];
    while (this.gear < 6 && sp > ratios[this.gear]) this.gear++;
    while (this.gear > 1 && sp < ratios[this.gear - 1] - 2) this.gear--;
    const lo = ratios[this.gear - 1], hi = ratios[this.gear];
    const target = 900 + clamp((sp - lo) / (hi - lo), 0, 1) * 5200 + Math.abs(this.throttle) * 600;
    this.rpm = damp(this.rpm, this.driver ? target : 0, 6, dt);
    // lights
    const night = nightU.value;
    this.lightsOn = (night > 0.35 || (G.atmo && G.atmo.w.rain > 0.4)) && !this.dead && !!this.driver;
    this.headMat.emissiveIntensity = this.lightsOn ? 6 : 0.15;
    this.tailMat.emissiveIntensity = this.dead ? 0 : (this.brake > 0.1 || (this.mode === 'kinematic' && this.braking)) ? 7 : this.lightsOn ? 2.2 : 0.3;
    this.pool.visible = this.lightsOn && this.mode !== 'none';
    if (this.T.police) {
      const on = this.siren && !this.dead; const ph = (G.t * 6) % 2 < 1;
      this.sirenR.emissiveIntensity = on && ph ? 14 : 0.1; this.sirenB.emissiveIntensity = on && !ph ? 14 : 0.1;
    }
    // damage effects
    if (this.health < 400 && !this.dead && G.fx && Math.random() < 0.3) { const p = this.localToWorld(0, T.belt, T.L / 2 - 0.6); G.fx.smoke(p.x, p.y, p.z, 1, this.health < 200 ? 0.1 : 0.5, 0.8, 1.5); }
    if (this.health <= 120 && this.health > 0 && !this.burning) this.burning = 6;
    if (this.burning > 0) {
      this.burning -= dt; const p = this.localToWorld(0, T.belt, T.L / 2 - 0.8);
      if (G.fx) G.fx.fire(p.x, p.y, p.z, 1);
      if (this.burning <= 0) this.explode();
    }
  }
  localToWorld(x, y, z) { return _v2.set(x, y - this.originH, z).applyQuaternion(this.quat).add(this.pos); }
  impact(dv, mag) {
    const T = this.T;
    const local = _v1.copy(dv).applyQuaternion(_q1.copy(this.quat).invert()); // in car space
    local.y = 0;
    const dir = local.clone().normalize();
    // impact point = opposite to deltaV on body surface
    const ip = new THREE.Vector3(-dir.x * T.W / 2, T.belt - 0.15, -dir.z * T.L / 2);
    const k = Math.abs(dir.z) > Math.abs(dir.x) * 1.2 ? 'z' : 'x';
    if (k === 'z') ip.x = clamp(ip.x, -T.W / 2, T.W / 2) * 0.5; else ip.z = clamp(-dir.z * T.L, -T.L / 2, T.L / 2) * 0.6;
    const strength = clamp((mag - 4) * 0.035, 0, 0.32);
    this.deformAt(ip, dir, strength, 0.9 + mag * 0.04);
    const dmg = (mag - 4) * (mag - 4) * 1.25;
    this.damage(dmg, null, ip);
    if (mag > 11 && !this.glassBroken) this.breakGlass();
    if (mag > 9) {
      if (k === 'z' && ip.z > 0 && this.fb.parent) this.detach(this.fb);
      if (k === 'z' && ip.z < 0 && this.rb.parent) this.detach(this.rb);
    }
    const wp = this.localToWorld(ip.x, ip.y + this.originH, ip.z);
    if (G.fx) { G.fx.sparks(wp.x, wp.y, wp.z, Math.min(30, mag * 2)); if (mag > 8) G.fx.dust(wp.x, wp.y, wp.z, 6, [0.4, 0.4, 0.42]); }
    G.bus.emit('crash', this, mag, wp.clone());
  }
  deformAt(p, dir, s, r) {
    if (s <= 0.002) return;
    if (!this._ownGeo) { this.body.geometry = this.body.geometry.clone(); this._ownGeo = true; this._orig = Float32Array.from(this.body.geometry.attributes.position.array); }
    const pos = this.body.geometry.attributes.position, a = pos.array, o = this._orig;
    const py = p.y + this.originH;
    for (let i = 0; i < pos.count; i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      const dx = x - p.x, dy = (y - py) * 0.7, dz = z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r) continue;
      const f = Math.pow(1 - d / r, 2) * s * (0.8 + Math.random() * 0.4);
      a[i * 3] += dir.x * f; a[i * 3 + 2] += dir.z * f; a[i * 3 + 1] -= f * 0.25;
      // clamp total displacement
      const ox = a[i * 3] - o[i * 3], oy = a[i * 3 + 1] - o[i * 3 + 1], oz = a[i * 3 + 2] - o[i * 3 + 2], ol = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (ol > 0.42) { const k = 0.42 / ol; a[i * 3] = o[i * 3] + ox * k; a[i * 3 + 1] = o[i * 3 + 1] + oy * k; a[i * 3 + 2] = o[i * 3 + 2] + oz * k; }
    }
    pos.needsUpdate = true; this.body.geometry.computeVertexNormals();
    this.deform += s;
  }
  breakGlass() {
    this.glassBroken = true; this.glass.visible = false;
    if (G.fx) { const p = this.localToWorld(0, this.T.belt + 0.3, 0); G.fx.glass(p.x, p.y, p.z, 40); }
    if (G.audio) G.audio.glass(this.pos.x, this.pos.y, this.pos.z);
  }
  detach(mesh) {
    const P = this.world.physics;
    mesh.updateMatrixWorld();
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq);
    mesh.parent.remove(mesh);
    const m = mesh.clone(); m.geometry = mesh.geometry.clone(); m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new THREE.Vector3()); m.geometry.translate(-c.x, -c.y, -c.z);
    const size = m.geometry.boundingBox.getSize(new THREE.Vector3());
    const cw = c.clone().applyQuaternion(wq).add(wp);
    const rb = P.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cw.x, cw.y, cw.z).setRotation(wq).setLinvel(this.vel.x * 0.6, 1.5, this.vel.z * 0.6).setAngvel({ x: rand(-3, 3), y: rand(-3, 3), z: rand(-3, 3) }));
    P.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.05, size.x / 2), Math.max(0.05, size.y / 2), Math.max(0.05, size.z / 2)).setMass(12).setCollisionGroups(groups(GR.DEBRIS, GR.STATIC | GR.VEHICLE)), rb);
    this.world.scene.add(m);
    G.debris && G.debris.push({ mesh: m, rb, t: 40 });
  }
  damage(n, source, at) {
    if (this.dead) return;
    this.health -= n;
    if (source && source.isPlayer) G.bus.emit('playerDamagedVehicle', this);
    if (this.health <= 0) { this.health = 0; if (!this.burning) this.burning = 4; }
  }
  explode() {
    if (this.dead && this.exploded) return;
    this.dead = true; this.exploded = true; this.health = 0;
    const p = this.pos.clone();
    if (G.fx) G.fx.explosion(p.x, p.y, p.z);
    if (G.audio) G.audio.explosion(p.x, p.y, p.z);
    this.body.material = BURNT; this.trim.material = BURNT; this.glass.visible = false;
    this.headMat.emissiveIntensity = 0; this.tailMat.emissiveIntensity = 0;
    if (this.rb_) this.rb_.applyImpulse({ x: rand(-1, 1) * this.T.mass, y: this.T.mass * 6, z: rand(-1, 1) * this.T.mass }, true), this.rb_.applyTorqueImpulse({ x: this.T.mass * rand(-2, 2), y: 0, z: this.T.mass * rand(-2, 2) }, true);
    G.bus.emit('explosion', p, 9, this);
  }
  dispose() {
    this.removeBodies();
    this.world.scene.remove(this.group);
    if (this._ownGeo) this.body.geometry.dispose();
  }
}

function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

let polMat = null;
function policeMat() {
  if (polMat) return polMat;
  polMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  polMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <color_fragment>', `#include <color_fragment>
      float doorBand = step(abs(vLP.z),1.3)*step(0.55,vLP.y)*step(vLP.y,0.95);
      float hoodTrunk = step(1.55,abs(vLP.z));
      vec3 navy=vec3(0.02,0.03,0.08);
      diffuseColor.rgb = mix(diffuseColor.rgb, navy, max(hoodTrunk, step(vLP.y,0.5)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05,0.12,0.5), doorBand*step(0.7,vLP.y)*step(vLP.y,0.78));`);
  };
  return polMat;
}
