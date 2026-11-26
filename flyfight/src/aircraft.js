import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smooth } from './util.js';
import { panelTextures, liveryTexture, insignia, numberTex } from './textures.js';

const DEG = Math.PI / 180;
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => -smax(-a, -b, k);

// ---------- generic loft ----------
// rings: array of arrays of [x,y,z]; all same length; closed rings. opts.uv(i,j,p,arc) -> [u,v]; opts.color(i,j,p) -> [r,g,b]
function loft(rings, opts = {}) {
  const R = rings.length, M = rings[0].length;
  const pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i < R; i++) {
    const ring = rings[i]; let arc = 0;
    for (let j = 0; j <= M; j++) {
      const p = ring[j % M];
      if (j > 0) { const q = ring[j - 1]; arc += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); }
      pos.push(p[0], p[1], p[2]);
      const u = opts.uv ? opts.uv(i, j % M, p, arc) : [p[2], arc]; uv.push(u[0], u[1]);
      const c = opts.color ? opts.color(i, j % M, p) : [1, 1, 1]; col.push(c[0], c[1], c[2]);
    }
  }
  const W = M + 1;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    if (opts.flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const cap = (ri, rev, color) => {
    const ring = rings[ri]; let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= M; cy /= M; cz /= M; const base = pos.length / 3;
    pos.push(cx, cy, cz); uv.push(cz, 0); const cc = color || [1, 1, 1]; col.push(...cc);
    for (let j = 0; j < M; j++) { const p = ring[j]; pos.push(p[0], p[1], p[2]); uv.push(p[2], p[0]); col.push(...cc); }
    for (let j = 0; j < M; j++) { const a = base + 1 + j, b = base + 1 + ((j + 1) % M); if (rev !== !!opts.flip) idx.push(base, a, b); else idx.push(base, b, a); }
  };
  if (opts.capStart) cap(0, false, opts.capStartColor);
  if (opts.capEnd) cap(R - 1, true, opts.capEndColor);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function std(g) { // ensure attributes for merging
  g = g.index ? g : g; if (!g.getAttribute('color')) { const n = g.getAttribute('position').count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.index) { const n = g.getAttribute('position').count; const a = []; for (let i = 0; i < n; i++) a.push(i); g.setIndex(a); }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}
function mirrored(g) {
  const m = g.clone(); m.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const ix = m.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  m.index.needsUpdate = true; return m;
}
function tint(g, c) { const a = g.getAttribute('color'); for (let i = 0; i < a.count; i++) a.setXYZ(i, c[0], c[1], c[2]); return g; }

// ---------- airfoil surface (canonical: span +X, chord -Z, thickness Y) ----------
// stations: [{x, z(LE), c(chord), y}] ; fr: [f0,f1] chord fraction range
function surface(stations, f0, f1, tc, K, opts = {}) {
  const rings = [];
  const fs = []; for (let k = 0; k <= K; k++) { const a = k / K; fs.push(f0 + (f1 - f0) * (0.5 - 0.5 * Math.cos(a * Math.PI))); }
  const th = (f) => 5 * tc * (0.2969 * Math.sqrt(Math.max(f, 0)) - 0.126 * f - 0.3516 * f * f + 0.2843 * f ** 3 - 0.1036 * f ** 4);
  for (const s of stations) {
    const ring = [];
    // upper: f1 -> f0, lower: f0 -> f1 (exclude duplicate ends)
    for (let k = K; k >= 0; k--) { const f = fs[k]; ring.push([s.x, s.y + Math.max(th(f), 0.0015) * s.c, s.z - f * s.c]); }
    for (let k = 1; k < K; k++) { const f = fs[k]; ring.push([s.x, s.y - Math.max(th(f), 0.0015) * s.c, s.z - f * s.c]); }
    if (f0 > 0.01) { /* flat closing face is implicit */ }
    rings.push(ring);
  }
  return loft(rings, { uv: (i, j, p) => [p[0], p[2]], capStart: opts.capStart !== false, capEnd: true, flip: true });
}
function planform(P, n) { // P: {x, z, root, tip, span, sweep, dihedral}
  const st = []; const tanS = Math.tan(P.sweep * DEG), tanD = Math.tan((P.dihedral || 0) * DEG);
  for (let i = 0; i <= n; i++) {
    const s = i / n; const sp = s * P.span;
    st.push({ x: P.x0 + sp, z: P.z - sp * tanS, c: lerp(P.root, P.tip, s), y: sp * tanD, s });
  }
  return st;
}
function subStations(P, s0, s1, n) { const all = []; for (let i = 0; i <= n; i++) { const s = lerp(s0, s1, i / n); all.push(...planform(P, 1).slice(0, 0)); const sp = s * P.span; all.push({ x: P.x0 + sp, z: P.z - sp * Math.tan(P.sweep * DEG), c: lerp(P.root, P.tip, s), y: sp * Math.tan((P.dihedral || 0) * DEG), s }); } return all; }

// ---------- materials (shared per livery) ----------
const matCache = {};
export function skinMaterial(liv, country) {
  const key = JSON.stringify(liv);
  if (matCache[key]) return matCache[key];
  const pt = panelTextures();
  const map = liveryTexture(liv).clone(); map.repeat.set(0.085, 0.085); map.needsUpdate = true;
  const bump = pt.bump.clone(); bump.repeat.set(0.33, 0.33); bump.needsUpdate = true;
  const ao = pt.ao.clone(); ao.repeat.set(0.33, 0.33); ao.needsUpdate = true;
  const rough = pt.rough.clone(); rough.repeat.set(0.2, 0.2); rough.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.2, aoMap: ao, aoMapIntensity: 1, roughnessMap: rough, roughness: liv.type === 'display' ? 0.38 : 0.62, metalness: 0.18, vertexColors: true, envMapIntensity: 0.9 });
  return (matCache[key] = m);
}
const M = {};
function mats() {
  if (M.metal) return M;
  M.metal = new THREE.MeshStandardMaterial({ color: 0x8a847c, metalness: 0.9, roughness: 0.38, vertexColors: true });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, metalness: 0.2, roughness: 0.75, vertexColors: true });
  M.interior = new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.1, roughness: 0.8 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x5d6f80, metalness: 0.35, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 2.2, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02 });
  M.goldGlass = M.glass.clone(); M.goldGlass.color.set(0xc9a44f); M.goldGlass.opacity = 0.62; M.goldGlass.metalness = 0.5;
  M.missile = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, metalness: 0.15, roughness: 0.45, vertexColors: true });
  M.helmet = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.4 });
  M.visor = new THREE.MeshStandardMaterial({ color: 0x302010, metalness: 0.9, roughness: 0.05 });
  M.suit = new THREE.MeshStandardMaterial({ color: 0x4d5440, roughness: 0.9 });
  M.seat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });
  M.tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  M.strut = new THREE.MeshStandardMaterial({ color: 0xcfd2d4, metalness: 0.7, roughness: 0.3 });
  M.navR = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  M.navG = new THREE.MeshBasicMaterial({ color: 0x20ff40 });
  M.navW = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return M;
}

// ---------- flame shader ----------
export function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uThr: { value: 0.5 }, uAB: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uT; uniform float uThr; uniform float uAB; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float v = vUv.y; // 0 at nozzle .. 1 at tail
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float diamonds = 0.55 + 0.45*sin(v*38.0 - uT*6.0) * (1.0 - v);
        float flick = 0.85 + 0.15*sin(uT*57.0 + v*13.0);
        float core = pow(1.0 - v, 2.2);
        vec3 abCol = mix(vec3(1.0,0.55,0.18), vec3(0.45,0.55,1.0), core*core) ;
        vec3 dryCol = vec3(1.0,0.45,0.15);
        vec3 col = mix(dryCol*0.6, abCol*1.6, uAB) * (0.6 + diamonds*uAB*0.8);
        float a = core * edge * flick * (0.25 + 0.75*uAB) * (0.2 + 0.8*uThr);
        gl_FragColor = vec4(col*a*2.2, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ---------- missile geometry ----------
let _missileGeo = null;
export function missileGeometry() {
  if (_missileGeo) return _missileGeo;
  const parts = [];
  const L = 3.65, r = 0.085;
  const body = new THREE.CylinderGeometry(r, r, L * 0.82, 14, 1); body.rotateX(Math.PI / 2); body.translate(0, 0, -L * 0.05);
  parts.push(tint(std(body), [1, 1, 1]));
  const nose = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); nose.scale(1, 2.6, 1); nose.rotateX(Math.PI / 2); nose.translate(0, 0, L * 0.36);
  parts.push(tint(std(nose), [0.35, 0.35, 0.33]));
  const band = new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.12, 14); band.rotateX(Math.PI / 2); band.translate(0, 0, L * 0.25); parts.push(tint(std(band), [0.9, 0.75, 0.2]));
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.BoxGeometry(0.012, 0.2, 0.32); fin.translate(0, r + 0.1, -L * 0.42); fin.rotateZ(k * Math.PI / 2 + Math.PI / 4); parts.push(tint(std(fin), [0.85, 0.85, 0.85]));
    const can = new THREE.BoxGeometry(0.01, 0.12, 0.2); can.translate(0, r + 0.06, L * 0.2); can.rotateZ(k * Math.PI / 2 + Math.PI / 4); parts.push(tint(std(can), [0.85, 0.85, 0.85]));
  }
  _missileGeo = mergeGeometries(parts); return _missileGeo;
}

// ---------- fuselage profiles ----------
function profiles(g) {
  const L = g.L, twin = g.engines === 2;
  const tOfZ = (z) => (L / 2 - z) / L;
  const stingerT = 1 - (g.stinger || 0) / L;
  const tc = g.cockpitT, tcEnd = tc + g.canopyLen / L * 0.6;
  const wing = g.wing, wT0 = tOfZ(wing.z), wT1 = tOfZ(wing.z - wing.root);
  const ht_ = g.htail; const hT0 = ht_ ? tOfZ(ht_.z) : 0, hT1 = ht_ ? tOfZ(ht_.z - ht_.root) : 0;
  const cn = g.canard; const cT0 = cn ? tOfZ(cn.z) : 0, cT1 = cn ? tOfZ(cn.z - cn.root) : 0;
  const bumpT = (t, a, b, e = 0.03) => smooth(a - e, a + e * 0.5, t) * (1 - smooth(b - e * 0.5, b + e, t));
  function body(t) {
    const nl = g.noseLen, s = clamp(t / nl, 0, 1);
    const og = Math.pow(1 - Math.pow(1 - s, 2.4), 0.52);
    let w, ht, hb, yc = -g.bodyH * 0.28 * (1 - og);
    w = g.bodyW * Math.max(og, 0.015);
    ht = g.bodyH * (0.78 + 0.22 * smooth(nl, tc, t)) * Math.max(og, 0.015);
    hb = g.bodyHb * Math.max(og, 0.015);
    if (twin) {
      const k = smooth(0.6, stingerT, t); w = lerp(w, g.stinger ? 0.32 : 0.36, k);
      ht = lerp(ht, 0.3, smooth(tcEnd, 0.9, t)); hb = lerp(hb, 0.22, smooth(0.45, 0.8, t));
      if (t > stingerT) { const q = smooth(stingerT, 1, t); w = lerp(w, 0.04, q); ht = lerp(ht, 0.04, q); hb = lerp(hb, 0.04, q); }
    } else {
      const k = smooth(g.engStart, 1.0, t); const er = g.engR * 1.06;
      w = lerp(w, er, k); ht = lerp(ht, er * 1.05, smooth(tcEnd, 1, t)); hb = lerp(hb, er, k); yc = lerp(yc, 0.05, k);
    }
    let n = 2.0 + 0.7 * smooth(nl, 0.45, t);
    if (g.chine) n = 1.65 + 0.3 * smooth(0.5, 1, t);
    // deck
    w = Math.max(w, 0.012); ht = Math.max(ht, 0.012); hb = Math.max(hb, 0.012);
    let W = w * 1.002, dTop = 0, dBot = 0, yd = yc;
    const deckOn = (tw) => { W = Math.max(W, tw); };
    if (g.lerx) { const lx = g.lerx; if (t > lx.t0) deckOn(w + (lx.w - w) * Math.pow(smooth(lx.t0, lx.t1, t), 0.85) * (1 - smooth(wT1 - 0.02, wT1 + 0.08, t))); }
    deckOn((wing.x + 0.25) * bumpT(t, wT0, wT1, 0.04));
    if (ht_) deckOn((ht_.x + 0.15) * bumpT(t, hT0, hT1, 0.03));
    if (cn) deckOn((cn.x + 0.1) * bumpT(t, cT0, cT1, 0.02));
    if (twin) deckOn((g.engSep + g.engR * 1.02) * smooth(g.engStart - 0.08, g.engStart + 0.04, t) * (1 - smooth(0.9, stingerT + 0.01, t) * 0.25));
    if (g.chine && t > g.noseLen * 0.25) deckOn(w * (1.06 + 0.04 * smooth(0.1, 0.3, t)));
    if (W > w * 1.01) { dTop = 0.2 + (twin ? 0.06 : 0); dBot = 0.13; yd = yc * 0.3 + (twin ? 0.02 : -0.04); }
    return { w: Math.max(w, 0.01), ht: Math.max(ht, 0.01), hb: Math.max(hb, 0.01), yc, n, W, dTop, dBot, yd };
  }
  return { body, tOfZ, stingerT, tcEnd };
}
function section(p, K1, K2, z) {
  const { w, ht, hb, yc, n, W, dTop, dBot, yd } = p;
  const xs = [];
  for (let k = 0; k < K2; k++) xs.push(W - (W - w) * (k / K2));
  for (let k = 0; k <= K1; k++) xs.push(w * Math.cos(Math.PI * k / K1));
  for (let k = K2 - 1; k >= 0; k--) xs.push(-W + (W - w) * (k / K2));
  const sk = Math.min(0.06, ht * 0.3);
  const top = (x) => {
    const ax = Math.abs(x); let b = -1e9, d = -1e9;
    if (ax < w) b = yc + ht * Math.pow(Math.max(1 - Math.pow(ax / w, n), 0), 1 / n);
    if (ax <= W) d = yd + dTop * Math.pow(Math.max(1 - (ax / W) ** 2, 0), 0.5);
    if (b < -1e8) return d; if (d < -1e8) return b; return smax(b, d, sk);
  };
  const bot = (x) => {
    const ax = Math.abs(x); let b = 1e9, d = 1e9;
    if (ax < w) b = yc - hb * Math.pow(Math.max(1 - Math.pow(ax / w, n), 0), 1 / n);
    if (ax <= W) d = yd - dBot * Math.pow(Math.max(1 - (ax / W) ** 2, 0), 0.5);
    if (b > 1e8) return d; if (d > 1e8) return b; return smin(b, d, sk);
  };
  const ring = [];
  for (const x of xs) ring.push([x, top(x), z]);
  for (let i = xs.length - 2; i >= 1; i--) ring.push([xs[i], bot(xs[i]), z]);
  return ring;
}
function superRing(cx, cy, a, b, n, z, N, shear = 0) {
  const r = [];
  for (let j = 0; j < N; j++) {
    const th = (j / N) * Math.PI * 2; const c = Math.cos(th), s = Math.sin(th);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    r.push([cx + x + shear * y, cy + y, z]);
  }
  return r;
}

// ---------- main builder ----------
export function buildAircraft(spec, opts = {}) {
  const g = Object.assign({}, spec.geo); g.cockpitT = Math.max(g.cockpitT, g.noseLen + g.canopyLen / g.L * 0.42); const hi = opts.detail !== 'lo';
  const country = spec.country;
  const liv = opts.livery || spec.livery;
  const m = mats(); const skin = skinMaterial(liv, country);
  const L = g.L, twin = g.engines === 2;
  const P = profiles(g);
  const root = new THREE.Group(); root.name = spec.id;
  const skinGeos = [], skinGeosSym = [], metalGeos = [], darkGeos = [];
  const N = hi ? 72 : 22, K1 = hi ? 20 : 6, K2 = hi ? 5 : 2;
  const zOf = (t) => L / 2 - t * L;
  // ---- fuselage
  const rings = [];
  for (let i = 0; i <= N; i++) {
    let t = i / N; t = t < 0.25 ? t * t / 0.25 * 0.5 + t * 0.5 : t; // denser at nose
    rings.push(section(P.body(t), K1, K2, zOf(t)));
  }
  const nl = g.noseLen;
  const fus = loft(rings, {
    uv: (i, j, p, arc) => [p[2], arc],
    color: (i, j, p) => {
      const t = (L / 2 - p[2]) / L; const bp = P.body(t);
      if (t < nl * 0.8) return [0.86, 0.87, 0.88];
      if (t < g.cockpitT - g.canopyLen / L * 0.45 && p[1] > bp.yc + bp.ht * 0.55 && Math.abs(p[0]) < bp.w * 0.7) return [0.22, 0.22, 0.23];
      if (t > 0.94) return [0.72, 0.7, 0.68];
      return [1, 1, 1];
    }, capStart: true, capEnd: true,
  });
  skinGeosSym.push(fus);
  // ---- nacelles / intakes (left side, mirrored)
  const NR = hi ? 28 : 10;
  const intakeRings = [];
  const ia = g.intakeW * 0.85, ib = g.intakeH * 0.75;
  const tI = g.intakeT;
  let tEnd;
  if (twin) tEnd = P.stingerT; else if (g.intake === 'chin') tEnd = 0.64; else tEnd = g.engStart + 0.1;
  const nac = (t) => {
    const k = smooth(tI + 0.02, g.engStart + 0.06, t);
    let cx, cy, a, b, n, shear = 0;
    if (g.intake === 'under') {
      a = lerp(ia, g.engR, k); b = lerp(ib, g.engR * 1.0, k); n = lerp(5, 2.3, k);
      cx = g.engSep; cy = lerp(-0.08 - ib * 0.92, -0.06 - g.engR * 0.62, k);
    } else if (g.intake === 'side' || g.intake === 'caret') {
      a = lerp(ia, g.engR, k); b = lerp(ib, g.engR, k); n = g.intake === 'caret' ? lerp(3.2, 2.4, k) : lerp(4, 2.3, k);
      cx = lerp(g.bodyW + ia * 0.55, twin ? g.engSep : g.bodyW * 0.3, smooth(tI, g.engStart + 0.12, t));
      cy = lerp(g.intake === 'caret' ? 0.05 - ib * 0.35 : -0.22 - ib * 0.35, twin ? -0.02 : -0.1, k);
      shear = g.intake === 'caret' ? 0.35 * (1 - k) : 0;
    } else { // chin
      a = lerp(ia, ia * 0.65, smooth(tI, 0.6, t)); b = lerp(ib, ib * 0.45, smooth(tI, 0.62, t)); n = 3.2;
      cx = 0; cy = lerp(-g.bodyHb - ib * 0.45 + 0.12, -g.bodyHb * 0.45, smooth(tI, 0.62, t));
    }
    if (twin && t > P.stingerT - 0.06) { const q = smooth(P.stingerT - 0.06, P.stingerT, t); a = lerp(a, g.engR * 0.95, q); b = lerp(b, g.engR * 0.95, q); }
    return { cx, cy, a, b, n, shear };
  };
  const slantOf = (dx, dy) => {
    if (g.intake === 'under') return -0.4 * dy;
    if (g.intake === 'caret') return 0.55 * dy + 0.25 * dx;
    if (g.intake === 'side') return 0.25 * dy - 0.2 * dx;
    return 0.35 * dy;
  };
  const NNa = hi ? 30 : 8;
  const front = nac(tI);
  const mkRing = (q, z, scale = 1, slantW = 1) => superRing(q.cx, q.cy, q.a * scale, q.b * scale, q.n, z, NR, q.shear).map(p => { const dx = (p[0] - q.cx) / q.a, dy = (p[1] - q.cy) / q.b; return [p[0], p[1], p[2] + slantOf(dx, dy) * slantW]; });
  // inner lip rings (dark)
  const z0 = zOf(tI);
  intakeRings.push(mkRing(front, z0 - 0.9, 0.8, 1));
  intakeRings.push(mkRing(front, z0 - 0.06, 0.84, 1));
  for (let i = 0; i <= NNa; i++) { const t = lerp(tI, tEnd, i / NNa); intakeRings.push(mkRing(nac(t), zOf(t), 1, 1 - smooth(tI, tI + 0.05, t))); }
  const nacG = loft(intakeRings, {
    color: (i) => i < 2 ? [0.12, 0.12, 0.13] : [1, 1, 1],
    capStart: true, capStartColor: [0.05, 0.05, 0.05], capEnd: !twin, flip: false,
    uv: (i, j, p, arc) => [p[2], arc],
  });
  if (g.intake === 'chin') skinGeosSym.push(nacG); else skinGeos.push(nacG);
  // ---- wings
  const wingP = Object.assign({}, g.wing, { x0: g.wing.x - 0.45 });
  const nSpan = hi ? 6 : 2, KC = hi ? 14 : 4;
  const fSplit = 0.76;
  const surfaces = []; // moving parts definitions
  const addSurface = (P0, tc, kind) => {
    const st = planform(P0, nSpan);
    skinGeos.push(surface(st, 0, kind === 'wing' ? fSplit : 1, tc, KC));
  };
  // main wing box
  const wingSt = planform(wingP, nSpan);
  skinGeos.push(surface(wingSt, 0, fSplit, g.wing.tc, KC));
  // control surfaces (flap inner, aileron outer)
  const cs = [];
  const mkCtrl = (s0, s1, name) => {
    const st = []; for (let i = 0; i <= 3; i++) { const s = lerp(s0, s1, i / 3); const sp = s * wingP.span; st.push({ x: wingP.x0 + sp, z: wingP.z - sp * Math.tan(wingP.sweep * DEG), c: lerp(wingP.root, wingP.tip, s), y: sp * Math.tan((wingP.dihedral || 0) * DEG) }); }
    const geo = surface(st, fSplit, 1, g.wing.tc, hi ? 6 : 2);
    const h0 = new THREE.Vector3(st[0].x, st[0].y, st[0].z - fSplit * st[0].c), h1 = new THREE.Vector3(st[3].x, st[3].y, st[3].z - fSplit * st[3].c);
    cs.push({ geo, h0, h1, name });
  };
  const sInner = (0.45) / wingP.span; // skip body-buried part
  mkCtrl(Math.max(sInner, 0.1), 0.52, 'flap'); mkCtrl(0.52, 0.96, 'ail');
  // tip rail / pylons
  // ---- horizontal tails
  let htailGeo = null, htailPivot = null;
  if (g.htail) {
    const hp = Object.assign({}, g.htail, { x0: g.htail.x - 0.25 });
    const st = planform(hp, hi ? 3 : 1);
    htailGeo = surface(st, 0, 1, 0.04, hi ? 10 : 4);
    htailPivot = new THREE.Vector3(hp.x0, 0, hp.z - hp.root * 0.45);
  }
  let canGeo = null, canPivot = null;
  if (g.canard) {
    const cp = Object.assign({}, g.canard, { x0: g.canard.x - 0.15 });
    canGeo = surface(planform(cp, hi ? 3 : 1), 0, 1, 0.04, hi ? 10 : 4);
    canPivot = new THREE.Vector3(cp.x0, 0, cp.z - cp.root * 0.4);
  }
  // ---- vertical tails
  const vt = g.vtail;
  const vtP = { x0: 0, z: vt.z, root: vt.root, tip: vt.tip, span: vt.h, sweep: vt.sweep, dihedral: 0 };
  const vtSt = planform(vtP, hi ? 4 : 1);
  const vtFix = vt.allMoving ? 1 : 0.72;
  const vtGeo = surface(vtSt, 0, vtFix, 0.045, hi ? 10 : 4);
  let rudGeo = null, rudH0, rudH1;
  if (!vt.allMoving) {
    const st = [vtSt[0], vtSt[vtSt.length - 1]].map((s, i) => i === 0 ? Object.assign({}, s, { x: s.x + vt.h * 0.12, z: s.z - vt.h * 0.12 * Math.tan(vt.sweep * DEG), c: lerp(vt.root, vt.tip, 0.12) }) : Object.assign({}, s, { x: s.x - vt.h * 0.03 }));
    rudGeo = surface(st, vtFix, 1, 0.045, hi ? 5 : 2);
    rudH0 = new THREE.Vector3(st[0].x, 0, st[0].z - vtFix * st[0].c); rudH1 = new THREE.Vector3(st[1].x, 0, st[1].z - vtFix * st[1].c);
  }
  const vtailMatrix = (side) => { // canonical -> local; span axis X -> up (canted outward)
    const mtx = new THREE.Matrix4();
    const cant = (vt.cant || 0) * DEG;
    const rot = new THREE.Matrix4().makeRotationZ(Math.PI / 2 - cant * side);
    const pb = P.body(P.tOfZ(vt.z - vt.root * 0.4));
    const y = vt.n === 1 ? pb.yc + pb.ht * 0.85 : (vt.y || 0.3);
    mtx.makeTranslation(vt.n === 1 ? 0 : vt.x * side, y, 0).multiply(rot);
    return mtx;
  };
  // ventral fins (static)
  if (g.ventral) {
    const v = g.ventral; const st = planform({ x0: 0, z: v.z, root: v.root, tip: v.tip, span: v.h, sweep: v.sweep }, 1);
    const vg = surface(st, 0, 1, 0.04, hi ? 6 : 3);
    const mtx = new THREE.Matrix4().makeTranslation(v.x, -0.25, 0).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2 + v.cant * DEG));
    vg.applyMatrix4(mtx); skinGeos.push(vg);
  }
  // ---- nozzles
  const nozzles = [];
  const nozzleAt = (cx, cy, zz) => {
    const nl2 = g.nozLen; const r = g.engR * (twin ? 0.95 : 1.0);
    const rs = [];
    const prof = g.nozzle === '2d'
      ? null
      : [[r * 1.0, 0], [r * 0.98, -0.25 * nl2], [r * 0.9, -0.62 * nl2], [r * 0.86, -nl2], [r * 0.8, -nl2], [r * 0.72, -0.55 * nl2], [r * 0.64, -0.25 * nl2]];
    let geo;
    if (prof) {
      const NS = hi ? 32 : 10;
      for (const [rr, z] of prof) { const ring = []; for (let j = 0; j < NS; j++) { const th = j / NS * Math.PI * 2; const pet = z < -0.3 * nl2 ? 1 + 0.03 * Math.cos(th * 16) : 1; ring.push([Math.cos(th) * rr * pet, Math.sin(th) * rr * pet, z]); } rs.push(ring); }
      geo = loft(rs, { color: (i) => { const h = i / (rs.length - 1); return i >= 4 ? [0.35, 0.3, 0.28] : [1 - h * 0.35, 0.95 - h * 0.45, 0.9 - h * 0.4]; }, capEnd: true, capEndColor: [0.1, 0.08, 0.07] });
    } else {
      const sec = [[r * 1.05, r * 0.85, 0], [r * 1.0, r * 0.7, -0.5 * nl2], [r * 0.95, r * 0.42, -nl2], [r * 0.85, r * 0.32, -nl2], [r * 0.85, r * 0.55, -0.4 * nl2]];
      for (const [a, b, z] of sec) rs.push(superRing(0, 0, a, b, 7, z, hi ? 24 : 8));
      geo = loft(rs, { color: (i) => i >= 3 ? [0.3, 0.27, 0.25] : [0.95, 0.9, 0.85], capEnd: true, capEndColor: [0.1, 0.08, 0.07] });
    }
    const grp = new THREE.Group(); grp.position.set(cx, cy, zz);
    const mesh = new THREE.Mesh(geo, m.metal); grp.add(mesh);
    const glowM = new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r * 0.7, 16), glowM); glow.rotation.y = Math.PI; glow.position.z = -0.28 * nl2; grp.add(glow);
    const fm = flameMaterial();
    const fg = new THREE.CylinderGeometry(0.22, r * 0.72, 1, hi ? 20 : 8, 1, true); fg.rotateX(-Math.PI / 2); fg.translate(0, 0, -0.5);
    // remap uv.y so 0 at nozzle
    const uv = fg.getAttribute('uv'); const ps = fg.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setY(i, -ps.getZ(i));
    const flame = new THREE.Mesh(fg, fm); flame.position.z = -nl2 * 0.9; flame.frustumCulled = false; flame.renderOrder = 5; grp.add(flame);
    root.add(grp);
    nozzles.push({ grp, flame, fm, glowM, r });
  };
  const tailZ = zOf(twin ? P.stingerT : 1) + 0.05;
  if (twin) { const q = nac(P.stingerT); nozzleAt(q.cx, q.cy, tailZ); nozzleAt(-q.cx, q.cy, tailZ); }
  else nozzleAt(0, 0.05, tailZ);
  // ---- canopy
  const cz0 = zOf(g.cockpitT) + g.canopyLen * 0.5, cz1 = cz0 - g.canopyLen;
  const canRings = [], canFoot = []; const NCa = hi ? 22 : 6, NCr = hi ? 20 : 8;
  const canTop = (z) => { const t = P.tOfZ(z); const p = P.body(t); return p.yc + p.ht * 0.92; };
  for (let i = 0; i <= NCa; i++) {
    const s = i / NCa; const z = lerp(cz0, cz1, s);
    const fr = g.bubble ? 0.4 : 0.32;
    let h = s < fr ? Math.pow(smooth(0, fr, s), 0.7) : 1 - Math.pow(smooth(fr + 0.12, 1, s), 1.6) * 0.92;
    if (g.twoSeat) h = s < 0.25 ? Math.pow(smooth(0, 0.25, s), 0.7) : 1 - Math.pow(smooth(0.6, 1, s), 1.6) * 0.92;
    h = Math.max(h, 0.02);
    const bp = P.body(P.tOfZ(z)); const W = Math.min(g.canopyW, bp.w * 0.92) * (0.55 + 0.45 * Math.sqrt(h));
    const base = canTop(z) - 0.06; const H = g.canopyH * h;
    canFoot.push([W, base, z]);
    const ring = [];
    for (let j = 0; j <= NCr; j++) { const a = j / NCr * Math.PI; ring.push([Math.cos(a) * W, base + Math.sin(a) * H, z]); }
    for (let j = NCr - 1; j >= 1; j--) { const a = j / NCr * Math.PI; ring.push([Math.cos(a) * W * 0.98, base - 0.02, z]); }
    canRings.push(ring);
  }
  const canopy = new THREE.Mesh(loft(canRings, { capStart: false, capEnd: false }), g.chine || g.bubble && country === 'us' ? m.goldGlass : m.glass);
  canopy.renderOrder = 3; root.add(canopy);
  // frames
  const frameGeos = [];
  if (hi) {
    const fz = [cz0 - g.canopyLen * (g.bubble ? 0.36 : 0.3)];
    if (!g.bubble) fz.push(cz0 - g.canopyLen * 0.62);
    if (g.twoSeat) fz.push(cz0 - g.canopyLen * 0.5);
    for (const z of fz) {
      const s = (cz0 - z) / g.canopyLen; const i = Math.round(s * NCa); const ring = canRings[Math.min(i, NCa)];
      const curve = new THREE.CatmullRomCurve3(ring.slice(0, NCr + 1).map(p => new THREE.Vector3(p[0] * 1.02, p[1] + 0.01, p[2])));
      const tg = new THREE.TubeGeometry(curve, 24, 0.022, 6, false); frameGeos.push(std(tg));
    }
    const sill = new THREE.BoxGeometry(0.05, 0.05, g.canopyLen * 0.95); 
    for (const sx of [1, -1]) { const s2 = sill.clone(); s2.translate(sx * Math.min(g.canopyW, g.bodyW * 0.9) * 0.97, canTop((cz0 + cz1) / 2) - 0.04, (cz0 + cz1) / 2); frameGeos.push(std(s2)); }
  }
  // cockpit interior & pilot
  const eye = new THREE.Object3D();
  const seatZ = cz0 - g.canopyLen * (g.twoSeat ? 0.36 : 0.58);
  const baseY = canTop(seatZ);
  eye.position.set(0, baseY + 0.33, seatZ + 0.02); root.add(eye);
  let pilotGroup = null, panelMesh = null;
  if (hi) {
    pilotGroup = new THREE.Group();
    const addPilot = (z) => {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), m.helmet); helmet.position.set(0, baseY + 0.3, z); pilotGroup.add(helmet);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.138, 16, 8, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.3), m.visor); visor.position.copy(helmet.position); visor.rotation.y = 0; pilotGroup.add(visor);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.2, 4, 10), m.suit); torso.position.set(0, baseY - 0.02, z - 0.06); pilotGroup.add(torso);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 0.18), m.seat); seat.position.set(0, baseY + 0.02, z - 0.32); seat.rotation.x = -0.25; pilotGroup.add(seat);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe0b020 })); handle.position.set(0, baseY + 0.36, z - 0.3); handle.scale.setScalar(0.6); pilotGroup.add(handle);
    };
    addPilot(seatZ);
    if (g.twoSeat) addPilot(seatZ - 1.25);
    root.add(pilotGroup);
    // tub + panel
    { const fp = [], fi = []; canFoot.forEach(([W, b, z], i) => { fp.push(-W * 0.97, b - 0.03, z, W * 0.97, b - 0.03, z); if (i) { const a = (i - 1) * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(fi); fg.computeVertexNormals();
      const floorM = new THREE.Mesh(fg, m.interior); floorM.material = m.interior; root.add(floorM); m.interior.side = THREE.DoubleSide; }
    panelMesh = new THREE.Group();
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 192;
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(g.canopyW * 1.25, g.canopyW * 0.47), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false })); panel.position.set(0, baseY - 0.02, seatZ + 0.6); panel.rotation.x = -0.35; panel.rotation.y = Math.PI; panelMesh.add(panel);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(g.canopyW * 1.3, 0.05, 0.3), m.interior); shroud.position.set(0, baseY + 0.13, seatZ + 0.66); shroud.scale.z = 0.7; panelMesh.add(shroud);
    const hud = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.18), new THREE.MeshBasicMaterial({ color: 0x40ff90, transparent: true, opacity: 0.08, depthWrite: false })); hud.position.set(0, baseY + 0.25, seatZ + 0.6); hud.rotation.x = 0.25; hud.rotation.y = Math.PI; panelMesh.add(hud);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.35, 8), m.seat); stick.position.set(g.bubble && spec.id === 'f16' ? -0.28 : 0, baseY - 0.05, seatZ + 0.35); stick.rotation.x = 0.25; panelMesh.add(stick);
    root.add(panelMesh);
    panelMesh.userData.canvas = pc; panelMesh.userData.tex = ptex;
  }
  // IRST / pitot
  if (hi && g.irst) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m.goldGlass); s.position.set(-0.22, canTop(cz0 + 0.4) + 0.02, cz0 + 0.45); root.add(s); }
  if (spec.id === 'mig29' || spec.id === 'su27' || spec.id === 'j11' || spec.id === 'su35' || spec.id === 'j16') { const p = new THREE.CylinderGeometry(0.02, 0.035, 1.4, 6); p.rotateX(Math.PI / 2); p.translate(0, P.body(0.002).yc, L / 2 + 0.65); metalGeos.push(std(p)); }
  // ---- assemble static skin
  for (const geo of skinGeos) { skinGeosSym.push(geo); skinGeosSym.push(mirrored(geo)); }
  // vtails
  const moving = { ail: [], flap: [], htail: [], canard: [], rudder: [], vtail: [] };
  const sides = vt.n === 1 ? [1] : [1, -1];
  for (const side of sides) {
    const mtx = vtailMatrix(side);
    if (vt.allMoving) {
      const grp = new THREE.Group(); grp.applyMatrix4(mtx); if (side < 0) {/* matrix includes mirrored cant only */}
      const piv = new THREE.Group(); const pv = new THREE.Vector3(0, 0, vt.z - vt.root * 0.45); piv.position.copy(pv);
      const gg = vtGeo.clone(); gg.translate(-pv.x, -pv.y, -pv.z);
      const mesh = new THREE.Mesh(gg, skin); piv.add(mesh); grp.add(piv); root.add(grp); moving.vtail.push({ piv, side });
      if (hi) addDecal(grp, country, vt, side, true);
    } else {
      const gg = vtGeo.clone().applyMatrix4(mtx); skinGeosSym.push(gg);
      if (rudGeo) {
        const grp = new THREE.Group(); grp.applyMatrix4(mtx);
        const piv = new THREE.Group(); piv.position.copy(rudH0);
        const rg = rudGeo.clone(); rg.translate(-rudH0.x, -rudH0.y, -rudH0.z);
        piv.add(new THREE.Mesh(rg, skin)); grp.add(piv); root.add(grp);
        moving.rudder.push({ piv, axis: rudH1.clone().sub(rudH0).normalize(), side });
      }
      if (hi) { const grp = new THREE.Group(); grp.applyMatrix4(mtx); root.add(grp); addDecal(grp, country, vt, side, false); }
    }
  }
  const skinMesh = new THREE.Mesh(mergeGeometries(skinGeosSym.map(std)), skin); skinMesh.castShadow = true; skinMesh.receiveShadow = true;
  root.add(skinMesh);
  if (frameGeos.length) root.add(new THREE.Mesh(mergeGeometries(frameGeos), m.dark));
  if (metalGeos.length) root.add(new THREE.Mesh(mergeGeometries(metalGeos), m.metal));
  // moving control surfaces per side
  for (const side of [1, -1]) {
    const sg = new THREE.Group(); sg.scale.x = side; root.add(sg);
    for (const c of cs) {
      const piv = new THREE.Group(); piv.position.copy(c.h0);
      const gg = c.geo.clone(); gg.translate(-c.h0.x, -c.h0.y, -c.h0.z);
      const mesh = new THREE.Mesh(gg, skin); mesh.castShadow = true; piv.add(mesh); sg.add(piv);
      moving[c.name].push({ piv, axis: c.h1.clone().sub(c.h0).normalize(), side });
    }
    if (htailGeo) {
      const piv = new THREE.Group(); piv.position.copy(htailPivot);
      const gg = htailGeo.clone(); gg.translate(-htailPivot.x, -htailPivot.y, -htailPivot.z);
      const mesh = new THREE.Mesh(gg, skin); mesh.castShadow = true; piv.add(mesh); sg.add(piv); moving.htail.push({ piv, side });
      const hp = g.htail; piv.position.y = (twin ? 0.0 : 0.05);
    }
    if (canGeo) {
      const piv = new THREE.Group(); piv.position.copy(canPivot); piv.position.y = 0.1;
      const gg = canGeo.clone(); gg.translate(-canPivot.x, -canPivot.y, -canPivot.z);
      piv.add(new THREE.Mesh(gg, skin)); sg.add(piv); moving.canard.push({ piv, side });
    }
    // wing decal
    if (hi) {
      const s = 0.68; const sp = s * wingP.span; const c = lerp(wingP.root, wingP.tip, s);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.5, c * 0.55), Math.min(1.5, c * 0.55)), decalMat(insignia(country)));
      d.rotation.x = -Math.PI / 2; d.position.set(wingP.x0 + sp, sp * Math.tan((wingP.dihedral || 0) * DEG) + c * g.wing.tc * 0.62 + 0.01, wingP.z - sp * Math.tan(wingP.sweep * DEG) - c * 0.42);
      sg.add(d);
      // nav light
      const nl3 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), side > 0 ? m.navR : m.navG); nl3.position.set(wingP.x0 + wingP.span + 0.05, wingP.span * Math.tan((wingP.dihedral || 0) * DEG), wingP.z - wingP.span * Math.tan(wingP.sweep * DEG) - wingP.tip * 0.4); sg.add(nl3);
    }
  }
  // nose number
  if (hi && opts.number) {
    for (const side of [1, -1]) {
      const zN = zOf(nl * 1.15); const bp = P.body(nl * 1.15);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), decalMat(numberTex(opts.number, country === 'us' ? '#3b4045' : country === 'cn' ? '#c8102e' : '#c8102e', country === 'us' ? '#55595e' : '#ffffff')));
      d.position.set(side * (bp.w * 1.0 + 0.02), bp.yc + 0.05, zN); d.rotation.y = side * Math.PI / 2; root.add(d);
    }
  }
  // ---- missiles & pylons
  const missiles = [];
  const mg = missileGeometry();
  const nMis = Math.min(spec.stats.missiles, g.chine ? 0 : 6);
  const slots = [];
  const wingY = (s) => s * wingP.span * Math.tan((wingP.dihedral || 0) * DEG);
  const wingSlot = (s) => { const sp = s * wingP.span; const c = lerp(wingP.root, wingP.tip, s); return [wingP.x0 + sp, wingY(s) - c * g.wing.tc * 0.5 - 0.32, wingP.z - sp * Math.tan(wingP.sweep * DEG) - c * 0.48]; };
  const pylonG = [];
  for (const s of [0.42, 0.62, 0.86]) for (const side of [1, -1]) {
    if (slots.length >= nMis) break; const p = wingSlot(s); slots.push([p[0] * side, p[1], p[2]]);
    const py = new THREE.BoxGeometry(0.07, 0.24, 1.3); py.translate(p[0] * side, p[1] + 0.2, p[2] + 0.1); pylonG.push(std(py));
  }
  if (hi && pylonG.length) root.add(new THREE.Mesh(mergeGeometries(pylonG), skin));
  for (const s of slots) { const mm = new THREE.Mesh(mg, m.missile); mm.position.set(s[0], s[1], s[2]); mm.castShadow = true; root.add(mm); missiles.push(mm); }
  // ---- landing gear (hangar)
  const gear = new THREE.Group(); gear.visible = !!opts.gear;
  const gearDrop = g.bodyHb + 1.55 + (twin ? 0.3 : 0);
  if (hi) {
    const wheel = (r, w) => { const gg = new THREE.CylinderGeometry(r, r, w, 18); gg.rotateZ(Math.PI / 2); return gg; };
    const ny = P.body(0.24); const nz = zOf(0.24);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, gearDrop - 0.3, 8), m.strut); strut.position.set(0, ny.yc - (gearDrop - 0.3) / 2, nz); gear.add(strut);
    const nw = new THREE.Mesh(wheel(0.3, 0.2), m.tire); nw.position.set(0, ny.yc - gearDrop + 0.3, nz - 0.1); gear.add(nw);
    const mz = zOf(0.6); const mx = twin ? g.engSep + 0.2 : 1.05;
    for (const sd of [1, -1]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, gearDrop - 0.1, 8), m.strut); st.position.set(sd * mx, -(gearDrop - 0.1) / 2 - 0.1, mz); st.rotation.z = sd * 0.08; gear.add(st);
      const mw = new THREE.Mesh(wheel(0.42, 0.3), m.tire); mw.position.set(sd * (mx + 0.1), -gearDrop + 0.42 - 0.1, mz); gear.add(mw);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.8, 1.2), skin); door.position.set(sd * (mx - 0.35), -0.75, mz); gear.add(door);
    }
    root.add(gear);
  }
  const groundOffset = gearDrop;
  // ---- API
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0), ay = new THREE.Vector3(0, 1, 0);
  const api = {
    wingTip: new THREE.Vector3(wingP.x0 + wingP.span, wingP.span * Math.tan((wingP.dihedral || 0) * DEG), wingP.z - wingP.span * Math.tan(wingP.sweep * DEG) - wingP.tip * 0.6),
    gunPos: new THREE.Vector3(g.bodyW * 0.9, 0.2, zOf(g.cockpitT) - 0.5), tailZ,
    root, eye, missiles, nozzles, gear, pilot: pilotGroup, panel: panelMesh, groundOffset, radius: L * 0.5, length: L, canopy,
    setControls(pitch, roll, yaw, flaps, thr, ab, time, tvc) {
      for (const c of moving.ail) c.piv.quaternion.setFromAxisAngle(c.axis, (roll * c.side * -18 + flaps * 6) * DEG);
      for (const c of moving.flap) c.piv.quaternion.setFromAxisAngle(c.axis, (flaps * 22 + (g.htail ? 0 : (-pitch * 14 + roll * c.side * -10))) * DEG);
      for (const c of moving.htail) c.piv.quaternion.setFromAxisAngle(ax, (pitch * 18 + roll * c.side * 7) * DEG);
      for (const c of moving.canard) c.piv.quaternion.setFromAxisAngle(ax, (-pitch * 16) * DEG);
      for (const c of moving.rudder) c.piv.quaternion.setFromAxisAngle(c.axis, (yaw * 22 * c.side) * DEG);
      for (const c of moving.vtail) c.piv.quaternion.setFromAxisAngle(ay, (yaw * 15) * DEG);
      for (const n of nozzles) {
        const len = 1.5 + thr * 2.2 + ab * 6.5;
        n.flame.scale.set(1 + ab * 0.15, 1 + ab * 0.15, len);
        n.fm.uniforms.uT.value = time; n.fm.uniforms.uThr.value = thr; n.fm.uniforms.uAB.value = ab;
        n.flame.visible = thr > 0.05;
        n.glowM.opacity = 0.25 + thr * 0.4 + ab * 0.6;
        if (tvc) n.grp.rotation.set(-pitch * 0.12, yaw * 0.1, 0); else n.grp.rotation.set(0, 0, 0);
      }
    },
    dispose() { root.traverse(o => { if (o.geometry && o.geometry !== mg) o.geometry.dispose(); }); },
  };
  return api;
}
const decalCache = new Map();
function decalMat(t) { if (decalCache.has(t)) return decalCache.get(t); const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }); decalCache.set(t, m); return m; }
function addDecal(grp, country, vt, side, allMoving) {
  const s = 0.55; const c = lerp(vt.root, vt.tip, s); const sp = s * vt.h;
  const size = Math.min(1.0, c * 0.5);
  for (const yy of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(size, size), decalMat(insignia(country)));
    d.position.set(sp, yy * (c * 0.045 * 0.62 + 0.012), vt.z - sp * Math.tan(vt.sweep * DEG) - c * 0.5);
    d.rotation.x = -Math.PI / 2 * yy; d.rotation.z = yy > 0 ? -Math.PI / 2 : Math.PI / 2;
    grp.add(d);
  }
}

// Generic strategic bomber (procedural)
export function buildBomber(country) {
  const m = mats(); const skin = skinMaterial({ type: 'two', colors: ['#9aa0a4', '#868c90', '#b4b8bb'] });
  const root = new THREE.Group(); const L = 48; const geos = [];
  const rings = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40; const z = L / 2 - t * L;
    const r = 1.9 * Math.pow(Math.min(1, t / 0.12), 0.5) * (t > 0.75 ? 1 - (t - 0.75) / 0.25 * 0.75 : 1) + 0.02;
    rings.push(superRing(0, t < 0.12 ? -0.4 * (1 - t / 0.12) : 0, r, r * 1.05, 2.2, z, 22));
  }
  geos.push(loft(rings, { capStart: true, capEnd: true, color: (i) => i < 3 ? [0.4, 0.4, 0.42] : [1, 1, 1] }));
  const wing = surface(planform({ x0: 1.2, z: 6, root: 11, tip: 3, span: 24, sweep: 35, dihedral: -2 }, 3), 0, 1, 0.08, 10);
  geos.push(wing, mirrored(wing));
  const ht = surface(planform({ x0: 0.5, z: -17, root: 5, tip: 2, span: 8, sweep: 38 }, 1), 0, 1, 0.06, 6);
  geos.push(ht, mirrored(ht));
  const vt = surface(planform({ x0: 0, z: -14, root: 7, tip: 3, span: 9, sweep: 42 }, 1), 0, 1, 0.06, 6);
  vt.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 1.6, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))); geos.push(vt);
  const nozzles = [];
  for (const sx of [7, 13, -7, -13]) {
    const zz = 6 - Math.abs(sx) * Math.tan(35 * DEG) - 1;
    const pod = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pod.push(superRing(sx, -1.6, 0.85 * (t > 0.8 ? 1 - (t - 0.8) * 1.5 : 1), 0.85 * (t > 0.8 ? 1 - (t - 0.8) * 1.5 : 1), 2, zz - t * 6, 16)); }
    geos.push(loft(pod, { capStart: true, capStartColor: [0.05, 0.05, 0.05], capEnd: true, capEndColor: [0.2, 0.15, 0.1] }));
    const fm = flameMaterial(); const fg = new THREE.CylinderGeometry(0.15, 0.5, 1, 10, 1, true); fg.rotateX(-Math.PI / 2); fg.translate(0, 0, -0.5);
    const uv = fg.getAttribute('uv'); const ps = fg.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setY(i, -ps.getZ(i));
    const fl = new THREE.Mesh(fg, fm); fl.position.set(sx, -1.6, zz - 6); fl.scale.set(1, 1, 3); root.add(fl); nozzles.push({ fm, flame: fl });
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos.map(std)), skin); mesh.castShadow = true; root.add(mesh);
  const can = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.glass); can.scale.set(1, 0.6, 2); can.position.set(0, 1.4, L / 2 - 5); root.add(can);
  return { root, nozzles, radius: 26, length: L, missiles: [], wingTip: new THREE.Vector3(25, -0.8, -12), gunPos: new THREE.Vector3(0, 0, 20), eye: new THREE.Object3D(),
    setControls(p, r, y, f, thr, ab, time) { for (const n of nozzles) { n.fm.uniforms.uT.value = time; n.fm.uniforms.uThr.value = thr; n.fm.uniforms.uAB.value = 0; } } };
}
