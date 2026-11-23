// Procedural geometry kit for metro set dressing (rails, columns, lamps, cables, train car, tents, rocks...).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getMat, plainMat } from '../core/materials.js';

const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx, sy, sz } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx ?? s, sy ?? s, sz ?? s));
  geo.applyMatrix4(m);
  return geo;
}
function clean(g) { // strip to position/normal/uv for merging
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ng.attributes.position.count) * 2), 2));
  return ng;
}
export function merge(list) { return mergeGeometries(list.map(clean), false); }

// ---- rails: profile along +X, length L ----
export function railGeometry(L = 2.5) {
  return memo('rail' + L, () => {
    const s = new THREE.Shape();
    s.moveTo(-0.075, 0); s.lineTo(0.075, 0); s.lineTo(0.075, 0.012); s.lineTo(0.01, 0.03); s.lineTo(0.01, 0.13);
    s.lineTo(0.036, 0.138); s.lineTo(0.036, 0.18); s.quadraticCurveTo(0, 0.186, -0.036, 0.18); s.lineTo(-0.036, 0.138); s.lineTo(-0.01, 0.13);
    s.lineTo(-0.01, 0.03); s.lineTo(-0.075, 0.012); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, steps: 1 });
    g.rotateY(Math.PI / 2); // extrude along +X
    g.translate(-L / 2, 0, 0);
    return g;
  });
}
export function sleeperGeometry() {
  return memo('sleeper', () => {
    const g = new THREE.BoxGeometry(0.24, 0.16, 2.5, 1, 1, 1);
    return g;
  });
}
export function thirdRailGeometry(L = 2.5) {
  return memo('third' + L, () => merge([
    xform(new THREE.BoxGeometry(L, 0.1, 0.08), { y: 0.25 }),
    xform(new THREE.BoxGeometry(L, 0.03, 0.22), { y: 0.36, z: -0.05 }),
    xform(new THREE.BoxGeometry(0.06, 0.25, 0.06), { x: 0, y: 0.12 }),
  ]));
}

// ---- station column (marble) ----
export function columnGeometry(h) {
  return memo('column' + h.toFixed(2), () => {
    const parts = [];
    parts.push(xform(new THREE.BoxGeometry(1.05, 0.35, 1.05), { y: 0.175 }));
    parts.push(xform(new THREE.BoxGeometry(0.95, 0.12, 0.95), { y: 0.41 }));
    const shaftH = h - 1.35;
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.4 - 0.03 * t + 0.012 * Math.sin(t * Math.PI), 0.47 + t * shaftH)); }
    parts.push(new THREE.LatheGeometry(pts, 20));
    const cap = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; cap.push(new THREE.Vector2(0.37 + 0.45 * t * t, 0.47 + shaftH + t * 0.75)); }
    parts.push(new THREE.LatheGeometry(cap, 20));
    parts.push(xform(new THREE.BoxGeometry(1.7, 0.15, 1.7), { y: h - 0.07 }));
    return merge(parts);
  });
}
export function columnTrimGeometry(h) { // bronze ring details
  return memo('coltrim' + h.toFixed(2), () => merge([
    xform(new THREE.TorusGeometry(0.405, 0.025, 6, 24), { y: 0.5, rx: Math.PI / 2 }),
    xform(new THREE.TorusGeometry(0.385, 0.03, 6, 24), { y: h - 0.9, rx: Math.PI / 2 }),
  ]));
}

// ---- lamp fixtures (body geometry; glow parts separate) ----
export function chandelierGeometry() {
  return memo('chand', () => merge([
    xform(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), { y: -0.6 }),
    xform(new THREE.CylinderGeometry(0.35, 0.12, 0.18, 16, 1, true), { y: -1.25 }),
    xform(new THREE.TorusGeometry(0.36, 0.025, 6, 20), { y: -1.17, rx: Math.PI / 2 }),
    xform(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), { y: -1.15 }),
  ]));
}
export function chandelierGlowGeometry() {
  return memo('chandGlow', () => xform(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { y: -1.22 }));
}
export function cageLampGeometry() {
  return memo('cage', () => {
    const parts = [xform(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), { y: 0, rx: Math.PI / 2, z: 0.025 })];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; parts.push(xform(new THREE.TorusGeometry(0.075, 0.006, 4, 10, Math.PI), { z: 0.05, rz: a, ry: Math.PI / 2, x: 0 })); }
    parts.push(xform(new THREE.TorusGeometry(0.08, 0.008, 4, 12), { z: 0.09 }));
    return merge(parts);
  });
}
export function bulbGeometry(r = 0.05) { return memo('bulb' + r, () => new THREE.SphereGeometry(r, 10, 8)); }
export function tubeLightGeometry(L = 1.2) {
  return memo('tube' + L, () => merge([
    xform(new THREE.BoxGeometry(L + 0.1, 0.06, 0.16), { y: 0.03 }),
    xform(new THREE.BoxGeometry(L + 0.1, 0.05, 0.02), { y: -0.01, z: 0.08 }),
    xform(new THREE.BoxGeometry(L + 0.1, 0.05, 0.02), { y: -0.01, z: -0.08 }),
  ]));
}
export function tubeGlowGeometry(L = 1.2) { return memo('tubeglow' + L, () => merge([xform(new THREE.CylinderGeometry(0.018, 0.018, L, 6), { rz: Math.PI / 2, y: -0.02, z: 0.04 }), xform(new THREE.CylinderGeometry(0.018, 0.018, L, 6), { rz: Math.PI / 2, y: -0.02, z: -0.04 })])); }
export function beaconGeometry() { return memo('beacon', () => merge([xform(new THREE.CylinderGeometry(0.08, 0.09, 0.05, 12), { y: 0.025 }), xform(new THREE.BoxGeometry(0.2, 0.02, 0.06), { y: 0, z: -0.02 })])); }
export function beaconGlowGeometry() { return memo('beaconGlow', () => xform(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), { y: 0.05 })); }

// ---- cables with sag along +X, centred ----
export function cableGeometry(L = 2.5, sag = 0.06, r = 0.018) {
  return memo(`cable${L}_${sag}_${r}`, () => {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(-L / 2 + t * L, -sag * 4 * t * (1 - t), 0)); }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 5, false);
  });
}
export function bracketGeometry() { return memo('bracket', () => merge([xform(new THREE.BoxGeometry(0.03, 0.5, 0.03), { y: 0 }), xform(new THREE.BoxGeometry(0.03, 0.03, 0.18), { y: 0.2, z: -0.09 }), xform(new THREE.BoxGeometry(0.03, 0.03, 0.18), { y: 0.0, z: -0.09 }), xform(new THREE.BoxGeometry(0.03, 0.03, 0.18), { y: -0.2, z: -0.09 })])); }
export function pipeGeometry(L = 2.5, r = 0.09) {
  return memo(`pipe${L}_${r}`, () => merge([
    xform(new THREE.CylinderGeometry(r, r, L, 10, 1, true), { rz: Math.PI / 2 }),
    xform(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 0.06, 10), { rz: Math.PI / 2, x: L / 2 - 0.05 }),
  ]));
}
export function pipeClampGeometry(r = 0.09) { return memo('clamp' + r, () => merge([xform(new THREE.TorusGeometry(r + 0.01, 0.012, 4, 10), { ry: Math.PI / 2 }), xform(new THREE.BoxGeometry(0.03, 0.3, 0.03), { y: 0.2 })])); }

// ---- platform edge strip ----
export function edgeStripGeometry() { return memo('edgestrip', () => xform(new THREE.BoxGeometry(2.5, 0.02, 0.28), { y: 0.01 })); }
export function edgeLipGeometry() { return memo('edgelip', () => xform(new THREE.BoxGeometry(2.5, 0.1, 0.12), { y: -0.05 })); }

// ---- debris ----
export function rockGeometry(seed = 1, r = 0.2) {
  return memo('rock' + seed + '_' + r, () => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(r, 1).deleteAttribute('uv').deleteAttribute('normal'));
    const p = g.attributes.position;
    let s = seed * 9301;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < p.count; i++) { const k = 0.7 + rnd() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); }
    g.computeVertexNormals();
    const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 2; uv[i * 2 + 1] = p.getZ(i) * 2 + p.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
}
export function paperGeometry() { return memo('paper', () => { const g = new THREE.PlaneGeometry(0.21, 0.29, 2, 2); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, Math.abs(p.getX(i)) * 0.06 + 0.003); g.computeVertexNormals(); return g; }); }
export function canGeometry() { return memo('can', () => new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10)); }
export function bottleGeometry() {
  return memo('bottle', () => new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.037, 0.02], [0.037, 0.17], [0.03, 0.2], [0.013, 0.23], [0.013, 0.29], [0, 0.29]].map(([x, y]) => new THREE.Vector2(x, y)), 10));
}
export function tileShardGeometry() { return memo('shard', () => new THREE.BoxGeometry(0.2, 0.012, 0.1)); }

// ---- sandbags, boards, tents, shacks ----
export function sandbagWallGeometry() {
  return memo('sandbags', () => {
    const parts = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const g = new THREE.CapsuleGeometry(0.16, 0.42, 3, 8);
      g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1.1);
      g.translate(-0.85 + i * 0.58 + (row % 2) * 0.28, 0.1 + row * 0.18, 0);
      parts.push(g);
    }
    return merge(parts);
  });
}
export function tentGeometry() {
  return memo('tent', () => {
    const g = new THREE.BufferGeometry();
    const w = 1.1, l = 1.2, hgt = 1.4;
    const v = [-w, 0, -l, 0, hgt, -l, 0, hgt, l, -w, 0, -l, 0, hgt, l, -w, 0, l, w, 0, -l, w, 0, l, 0, hgt, l, w, 0, -l, 0, hgt, l, 0, hgt, -l, -w, 0, -l, w, 0, -l, 0, hgt, -l];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const uv = []; for (let i = 0; i < v.length / 3; i++) uv.push(v[i * 3] * 0.5 + 0.5, v[i * 3 + 1] * 0.5 + v[i * 3 + 2] * 0.3);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  });
}
export function shackGeometry() {
  return memo('shack', () => merge([
    xform(new THREE.BoxGeometry(2.0, 2.0, 0.04), { y: 1.0, z: -1.0 }),
    xform(new THREE.BoxGeometry(0.04, 2.0, 2.0), { x: -1.0, y: 1.0 }),
    xform(new THREE.BoxGeometry(0.04, 2.0, 2.0), { x: 1.0, y: 1.0 }),
    xform(new THREE.BoxGeometry(0.6, 2.0, 0.04), { x: -0.7, y: 1.0, z: 1.0 }),
    xform(new THREE.BoxGeometry(0.6, 2.0, 0.04), { x: 0.7, y: 1.0, z: 1.0 }),
    xform(new THREE.BoxGeometry(2.3, 0.04, 2.3), { y: 2.1, rx: 0.12 }),
  ]));
}
export function bunkGeometry() {
  return memo('bunk', () => {
    const parts = [];
    for (const [x, z] of [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]]) parts.push(xform(new THREE.BoxGeometry(0.05, 1.7, 0.05), { x, z, y: 0.85 }));
    for (const y of [0.4, 1.3]) { parts.push(xform(new THREE.BoxGeometry(1.95, 0.05, 0.85), { y })); }
    return merge(parts);
  });
}
export function mattressGeometry() { return memo('mattress', () => merge([xform(new THREE.BoxGeometry(1.8, 0.12, 0.75), { y: 0.48 }), xform(new THREE.BoxGeometry(1.8, 0.12, 0.75), { y: 1.38 })])); }
export function specimenTankGeometry() {
  return memo('tank', () => merge([
    xform(new THREE.CylinderGeometry(0.55, 0.6, 0.35, 20), { y: 0.175 }),
    xform(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 20), { y: 2.3 }),
    xform(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), { y: 2.7 }),
  ]));
}
export function specimenGlassGeometry() { return memo('tankglass', () => xform(new THREE.CylinderGeometry(0.5, 0.5, 1.85, 24, 1, true), { y: 1.27 })); }
export function specimenLiquidGeometry() { return memo('tankliq', () => xform(new THREE.CylinderGeometry(0.47, 0.47, 1.6, 20), { y: 1.15 })); }
export function stalactiteGeometry() { return memo('stal', () => { const g = new THREE.ConeGeometry(0.25, 1.4, 7, 3); g.rotateX(Math.PI); g.translate(0, -0.7, 0); return g; }); }
export function fungusGeometry() { return memo('fungus', () => merge([0, 1, 2, 3, 4].map((i) => xform(new THREE.SphereGeometry(0.06 + (i % 3) * 0.03, 8, 6), { x: Math.cos(i * 2.3) * 0.2, z: Math.sin(i * 2.3) * 0.2, y: 0.03, sy: 0.6 })))); }
export function eggSacGeometry() { return memo('egg', () => { const g = new THREE.SphereGeometry(0.4, 14, 10); g.scale(1, 1.4, 1); g.translate(0, 0.5, 0); return g; }); }
export function boneGeometry() { return memo('bones', () => merge([xform(new THREE.CylinderGeometry(0.025, 0.02, 0.42, 6), { rz: Math.PI / 2, y: 0.03 }), xform(new THREE.SphereGeometry(0.04, 6, 5), { x: 0.21, y: 0.03 }), xform(new THREE.SphereGeometry(0.04, 6, 5), { x: -0.21, y: 0.03 }), xform(new THREE.SphereGeometry(0.1, 10, 8), { x: 0.3, z: 0.25, y: 0.09, sy: 0.85 })])); }
export function steelColumnGeometry(h) { return memo('steelcol' + h, () => merge([xform(new THREE.BoxGeometry(0.4, h, 0.06), { y: h / 2, z: 0.17 }), xform(new THREE.BoxGeometry(0.4, h, 0.06), { y: h / 2, z: -0.17 }), xform(new THREE.BoxGeometry(0.05, h, 0.3), { y: h / 2 }), xform(new THREE.BoxGeometry(0.6, 0.3, 0.6), { y: 0.15 })])); }
export function trussGeometry(L) {
  return memo('truss' + L, () => {
    const parts = [xform(new THREE.BoxGeometry(L, 0.12, 0.12), { y: 0 }), xform(new THREE.BoxGeometry(L, 0.12, 0.12), { y: -0.9 })];
    const n = Math.floor(L / 1.2);
    for (let i = 0; i <= n; i++) { const x = -L / 2 + i * (L / n); parts.push(xform(new THREE.BoxGeometry(0.06, 0.9, 0.06), { x, y: -0.45 })); if (i < n) parts.push(xform(new THREE.BoxGeometry(0.05, 1.3, 0.05), { x: x + L / n / 2, y: -0.45, rz: Math.atan2(L / n, 0.9) * (i % 2 ? 1 : -1) })); }
    return merge(parts);
  });
}
export function barrierGeometry() { return memo('barrier', () => merge([xform(new THREE.BoxGeometry(1.8, 0.12, 0.08), { y: 0.95 }), xform(new THREE.BoxGeometry(0.08, 1.0, 0.08), { x: -0.8, y: 0.5 }), xform(new THREE.BoxGeometry(0.08, 1.0, 0.08), { x: 0.8, y: 0.5 }), xform(new THREE.BoxGeometry(1.8, 0.1, 0.06), { y: 0.5 })])); }
export function lockerGeometry() { return memo('locker', () => merge([xform(new THREE.BoxGeometry(0.62, 1.95, 0.05), { y: 0.975, z: -0.27 }), xform(new THREE.BoxGeometry(0.04, 1.95, 0.56), { x: -0.29, y: 0.975 }), xform(new THREE.BoxGeometry(0.04, 1.95, 0.56), { x: 0.29, y: 0.975 }), xform(new THREE.BoxGeometry(0.62, 0.04, 0.56), { y: 1.93 }), xform(new THREE.BoxGeometry(0.62, 0.04, 0.56), { y: 0.02 })])); }
export function lockerDoorGeometry() {
  return memo('lockerdoor', () => {
    const parts = [xform(new THREE.BoxGeometry(0.58, 1.9, 0.025), { x: 0.29, y: 0.975 })];
    for (let i = 0; i < 5; i++) parts.push(xform(new THREE.BoxGeometry(0.3, 0.02, 0.02), { x: 0.29, y: 1.6 + i * 0.05, z: 0.015 }));
    parts.push(xform(new THREE.BoxGeometry(0.03, 0.12, 0.03), { x: 0.52, y: 1.0, z: 0.025 }));
    return merge(parts);
  });
}

// ---- doors ----
export function doorFrameGeometry(width, height, depth = 0.25) {
  return memo(`dframe${width}_${height}`, () => merge([
    xform(new THREE.BoxGeometry(0.12, height, depth), { x: -width / 2 - 0.06, y: height / 2 }),
    xform(new THREE.BoxGeometry(0.12, height, depth), { x: width / 2 + 0.06, y: height / 2 }),
    xform(new THREE.BoxGeometry(width + 0.24, 0.12, depth), { y: height + 0.06 }),
  ]));
}
export function doorLeafGeometry(width, height) {
  return memo(`dleaf${width}_${height}`, () => {
    const parts = [xform(new THREE.BoxGeometry(width, height, 0.05), { x: width / 2, y: height / 2 })];
    parts.push(xform(new THREE.BoxGeometry(width * 0.8, height * 0.35, 0.02), { x: width / 2, y: height * 0.72, z: 0.03 }));
    parts.push(xform(new THREE.BoxGeometry(width * 0.8, height * 0.35, 0.02), { x: width / 2, y: height * 0.28, z: 0.03 }));
    parts.push(xform(new THREE.BoxGeometry(0.04, 0.16, 0.06), { x: width - 0.1, y: 1.0, z: 0.05 }));
    parts.push(xform(new THREE.BoxGeometry(0.04, 0.16, 0.06), { x: width - 0.1, y: 1.0, z: -0.05 }));
    return merge(parts);
  });
}
export function hermeticLeafGeometry(width, height) {
  return memo(`hleaf${width}_${height}`, () => {
    const parts = [xform(new THREE.BoxGeometry(width, height, 0.22), { x: width / 2, y: height / 2 })];
    for (let i = 0; i < 4; i++) parts.push(xform(new THREE.BoxGeometry(width * 0.9, 0.08, 0.06), { x: width / 2, y: 0.3 + i * (height - 0.6) / 3, z: 0.12 }));
    parts.push(xform(new THREE.TorusGeometry(0.28, 0.035, 6, 20), { x: width / 2, y: height / 2, z: 0.2 }));
    for (let i = 0; i < 3; i++) parts.push(xform(new THREE.BoxGeometry(0.56, 0.03, 0.03), { x: width / 2, y: height / 2, z: 0.2, rz: (i / 3) * Math.PI }));
    return merge(parts);
  });
}
export function gateGeometry(width, height) {
  return memo(`gate${width}_${height}`, () => {
    const parts = [];
    const n = Math.floor(width / 0.16);
    for (let i = 0; i <= n; i++) parts.push(xform(new THREE.BoxGeometry(0.035, height, 0.035), { x: -width / 2 + i * (width / n), y: height / 2 }));
    for (const y of [0.1, height * 0.5, height - 0.1]) parts.push(xform(new THREE.BoxGeometry(width, 0.07, 0.06), { y }));
    return merge(parts);
  });
}
export function shutterGeometry(width, height) {
  return memo(`shut${width}_${height}`, () => {
    const g = new THREE.BoxGeometry(width, height, 0.05, 1, Math.floor(height / 0.12), 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (Math.abs(p.getZ(i)) > 0.01) p.setZ(i, p.getZ(i) + Math.sin(yy * 52) * 0.012); }
    g.computeVertexNormals(); g.translate(0, height / 2, 0);
    return g;
  });
}

// ---- metro car (procedural, type 81-717 inspired) ----
export function buildTrainCar({ length = 19, cab = true, lit = false, damaged = 0 } = {}) {
  const grp = new THREE.Group();
  grp.name = 'train_car';
  const W = 2.7, H = 3.0, L = length;
  const body = getMat('train_paint', { vc: false });
  const dark = plainMat('dark_metal');
  const glass = plainMat('glass_dirty');
  const steel = plainMat('steel');
  // body shell: side panels with window holes approximated by panels
  const shell = [];
  const yB = 1.0; // floor height above rail top
  const winY0 = yB + 0.95, winY1 = yB + 1.85;
  const doorXs = [-6.6, -2.2, 2.2, 6.6];
  for (const side of [-1, 1]) {
    // lower and upper bands
    shell.push(xform(new THREE.BoxGeometry(L, winY0 - yB + 0.25, 0.06), { y: (yB - 0.25 + winY0) / 2, z: side * W / 2 }));
    shell.push(xform(new THREE.BoxGeometry(L, yB + H - winY1, 0.06), { y: (winY1 + yB + H) / 2, z: side * W / 2 }));
    // pillars between windows
    const pillars = [];
    for (let x = -L / 2; x <= L / 2; x += 1.1) pillars.push(x);
    for (const x of pillars) {
      if (doorXs.some((d) => Math.abs(d - x) < 0.9)) continue;
      shell.push(xform(new THREE.BoxGeometry(0.22, winY1 - winY0, 0.06), { x, y: (winY0 + winY1) / 2, z: side * W / 2 }));
    }
  }
  // roof (curved)
  const roof = new THREE.CylinderGeometry(W / 2 / Math.sin(0.62), W / 2 / Math.sin(0.62), L, 18, 1, true, -0.62, 1.24);
  roof.rotateZ(Math.PI / 2); roof.rotateX(-Math.PI / 2);
  const rr = W / 2 / Math.sin(0.62);
  roof.translate(0, yB + H - rr * Math.cos(0.62) + 0.0, 0);
  // fix orientation: cylinder axis along X
  shell.push(roof);
  // ends
  for (const e of [-1, 1]) shell.push(xform(new THREE.BoxGeometry(0.08, H, W), { x: e * L / 2, y: yB + H / 2 }));
  // underframe
  shell.push(xform(new THREE.BoxGeometry(L - 0.4, 0.35, W - 0.3), { y: yB - 0.1 }));
  const shellMesh = new THREE.Mesh(merge(shell), body);
  shellMesh.castShadow = true; shellMesh.receiveShadow = true;
  grp.add(shellMesh);
  // stripe
  const stripe = new THREE.Mesh(merge([xform(new THREE.BoxGeometry(L + 0.02, 0.12, W + 0.04), { y: yB + 0.55 })]), new THREE.MeshStandardMaterial({ color: 0x8a7a3a, roughness: 0.6, metalness: 0.3 }));
  grp.add(stripe);
  // windows
  const win = [];
  for (const side of [-1, 1]) win.push(xform(new THREE.BoxGeometry(L - 0.2, winY1 - winY0, 0.02), { y: (winY0 + winY1) / 2, z: side * (W / 2 - 0.02) }));
  const winMesh = new THREE.Mesh(merge(win), glass);
  grp.add(winMesh);
  // doors
  const doors = [];
  for (const side of [-1, 1]) for (const dx of doorXs) {
    doors.push(xform(new THREE.BoxGeometry(0.62, 1.9, 0.05), { x: dx - 0.32, y: yB + 0.95, z: side * (W / 2 + 0.01) }));
    doors.push(xform(new THREE.BoxGeometry(0.62, 1.9, 0.05), { x: dx + 0.32, y: yB + 0.95, z: side * (W / 2 + 0.01) }));
  }
  const doorMesh = new THREE.Mesh(merge(doors), getMat('rusty_paint', { vc: false }));
  doorMesh.castShadow = true;
  grp.add(doorMesh);
  // bogies & wheels
  const bog = [];
  for (const bx of [-L / 2 + 2.6, L / 2 - 2.6]) {
    bog.push(xform(new THREE.BoxGeometry(2.6, 0.35, 2.0), { x: bx, y: 0.5 }));
    for (const wx of [-0.95, 0.95]) for (const wz of [-0.76, 0.76]) bog.push(xform(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), { x: bx + wx, y: 0.42, z: wz, rx: Math.PI / 2 }));
  }
  const bogMesh = new THREE.Mesh(merge(bog), dark);
  grp.add(bogMesh);
  // interior: floor, seats, poles
  const inter = [xform(new THREE.BoxGeometry(L - 0.2, 0.05, W - 0.12), { y: yB + 0.03 })];
  const interMesh = new THREE.Mesh(merge(inter), getMat('rust', { vc: false }));
  grp.add(interMesh);
  const seats = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const cx = -4.4 + i * 4.4;
    seats.push(xform(new THREE.BoxGeometry(3.4, 0.12, 0.5), { x: cx, y: yB + 0.48, z: side * (W / 2 - 0.35) }));
    seats.push(xform(new THREE.BoxGeometry(3.4, 0.5, 0.1), { x: cx, y: yB + 0.8, z: side * (W / 2 - 0.1) }));
  }
  grp.add(new THREE.Mesh(merge(seats), plainMat('seat_blue')));
  const poles = [];
  for (let x = -L / 2 + 1.5; x < L / 2 - 1; x += 2.2) poles.push(xform(new THREE.CylinderGeometry(0.02, 0.02, H - 0.2, 6), { x, y: yB + H / 2 }));
  for (const side of [-1, 1]) poles.push(xform(new THREE.CylinderGeometry(0.018, 0.018, L - 1, 6), { y: yB + 2.2, z: side * 0.7, rz: Math.PI / 2 }));
  grp.add(new THREE.Mesh(merge(poles), steel));
  // cab front details
  if (cab) {
    const front = [];
    front.push(xform(new THREE.BoxGeometry(0.1, 0.8, 1.0), { x: L / 2 + 0.03, y: yB + 1.45 }));
    grp.add(new THREE.Mesh(merge(front), glass));
    const lights = [xform(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), { x: L / 2 + 0.06, y: yB + 0.35, z: -0.85, rz: Math.PI / 2 }), xform(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), { x: L / 2 + 0.06, y: yB + 0.35, z: 0.85, rz: Math.PI / 2 })];
    const headMat = new THREE.MeshBasicMaterial({ color: lit ? new THREE.Color(6, 5.2, 4) : new THREE.Color(0.08, 0.08, 0.07) });
    const head = new THREE.Mesh(merge(lights), headMat);
    head.name = 'headlights';
    grp.add(head);
    // control console inside cab
    const cons = [xform(new THREE.BoxGeometry(0.6, 0.9, 1.6), { x: L / 2 - 0.6, y: yB + 0.45 }), xform(new THREE.BoxGeometry(0.5, 0.05, 1.5), { x: L / 2 - 0.65, y: yB + 0.95, rz: -0.3 })];
    grp.add(new THREE.Mesh(merge(cons), dark));
    // cab partition
    grp.add(new THREE.Mesh(merge([xform(new THREE.BoxGeometry(0.06, H - 0.1, W - 0.2), { x: L / 2 - 1.6, y: yB + H / 2 })]), body));
  }
  // interior lights (strip)
  const strip = new THREE.Mesh(merge([xform(new THREE.BoxGeometry(L - 1.5, 0.04, 0.16), { y: yB + H - 0.15, z: -0.5 }), xform(new THREE.BoxGeometry(L - 1.5, 0.04, 0.16), { y: yB + H - 0.15, z: 0.5 })]), new THREE.MeshBasicMaterial({ color: lit ? new THREE.Color(2.6, 2.4, 2.0) : new THREE.Color(0.06, 0.06, 0.06) }));
  strip.name = 'interiorLights';
  grp.add(strip);
  grp.userData = { length: L, width: W, height: H + yB };
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}
