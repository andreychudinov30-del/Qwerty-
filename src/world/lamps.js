// Lamp system: fixtures (instanced), per-lamp emissive glow, flicker patterns, power circuits,
// and a small pool of real lights assigned each frame to the most relevant lamps (keeps shader cost fixed).
import * as THREE from 'three';
import { glowMaterial, plainMat } from '../core/materials.js';
import * as PG from './procgeo.js';
import { geoProto, makeMatrix } from './props.js';
import { CELL } from './mapgen.js';

export const LAMP_TYPES = {
  chandelier: { color: 0xffd2a0, intensity: 55, range: 16, glow: 'chandelier', lightOffsetY: -1.35 },
  cage: { color: 0xffc58a, intensity: 18, range: 9, glow: 'bulb', lightOffsetY: 0 },
  tube: { color: 0xd6ecff, intensity: 26, range: 11, glow: 'tube', lightOffsetY: -0.15 },
  hanging: { color: 0xffcf8f, intensity: 45, range: 15, glow: 'bulbBig', lightOffsetY: -0.4 },
  beacon: { color: 0xff1a0a, intensity: 22, range: 11, glow: 'beacon', lightOffsetY: 0.05 },
  signal: { color: 0xff2212, intensity: 4, range: 4, glow: 'bulbSmall', lightOffsetY: 0 },
  fire: { color: 0xff7a2a, intensity: 30, range: 9, glow: null, lightOffsetY: 0.4 },
  fungus: { color: 0x40ffb0, intensity: 3, range: 4, glow: null, lightOffsetY: 0.2 },
  work: { color: 0xfff0d8, intensity: 70, range: 18, glow: 'bulbBig', lightOffsetY: 0 },
};

const GLOW_GEOS = {
  chandelier: () => PG.chandelierGlowGeometry(),
  bulb: () => PG.bulbGeometry(0.05),
  bulbBig: () => PG.bulbGeometry(0.09),
  bulbSmall: () => PG.bulbGeometry(0.04),
  tube: () => PG.tubeGlowGeometry(1.2),
  beacon: () => PG.beaconGlowGeometry(),
};

let lampSeq = 0;
export class LampSystem {
  constructor(scene, quality) {
    this.scene = scene;
    this.lamps = [];
    this.power = 'on'; // on | off | emergency
    this.circuits = { main: true, emergency: false, always: true };
    this.time = 0;
    this.quality = quality;
    this.pool = [];
    this.shadowPool = [];
    this.glowMeshes = new Map();
    this.group = new THREE.Group();
    this.group.name = 'lamps';
    scene.add(this.group);
    this.buildPool(quality);
  }

  buildPool(q) {
    for (const l of this.pool) this.group.remove(l.light);
    for (const l of this.shadowPool) { this.group.remove(l.light); this.group.remove(l.light.target); l.light.dispose?.(); }
    this.pool = []; this.shadowPool = [];
    for (let i = 0; i < q.lights; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      this.group.add(light);
      this.pool.push({ light, lamp: null, fade: 0 });
    }
    const nShadow = Math.max(0, (q.shadows || 0) - 1);
    for (let i = 0; i < nShadow; i++) {
      const light = new THREE.SpotLight(0xffffff, 0, 14, 1.05, 0.7, 2);
      light.castShadow = true;
      light.shadow.mapSize.set(q.shadowSize >> 1, q.shadowSize >> 1);
      light.shadow.bias = -0.0008;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.near = 0.2;
      this.group.add(light); this.group.add(light.target);
      this.shadowPool.push({ light, lamp: null, fade: 0 });
    }
  }

  // add a lamp; fixture geometry is pushed into the instancer
  add(def, instancer) {
    const T = LAMP_TYPES[def.type] || LAMP_TYPES.cage;
    const lamp = {
      id: def.id || 'lamp' + (lampSeq++),
      type: def.type,
      pos: new THREE.Vector3(def.x, def.y, def.z),
      lightPos: new THREE.Vector3(def.x, def.y + (T.lightOffsetY || 0), def.z),
      color: new THREE.Color(def.color ?? T.color),
      intensity: def.intensity ?? T.intensity,
      range: def.range ?? T.range,
      circuit: def.circuit || 'main',
      state: def.state || 'on', // on | off | broken | flicker | dying | pulse
      seed: Math.random() * 1000,
      rotY: def.rotY || 0,
      level: 0, // current brightness 0..1
      glowIndex: -1,
      cell: { x: Math.floor(def.x / CELL), y: Math.floor(def.z / CELL) },
      down: def.down !== false && (def.type === 'chandelier' || def.type === 'tube' || def.type === 'hanging' || def.type === 'work'),
    };
    if (def.type === 'beacon' && !def.circuit) lamp.circuit = 'emergency';
    if (lamp.state === 'pulse' || lamp.circuit === 'emergency') lamp.pulse = true;
    // fixtures (instanced when an instancer is given, otherwise a plain mesh)
    const m = makeMatrix(def.x, def.y, def.z, lamp.rotY);
    let proto = null;
    switch (def.type) {
      case 'chandelier': proto = this._proto('chand', () => geoProto(PG.chandelierGeometry(), plainMat('dark_metal'))); break;
      case 'cage': proto = this._proto('cage', () => geoProto(PG.cageLampGeometry(), plainMat('dark_metal'))); break;
      case 'tube': proto = this._proto('tube', () => geoProto(PG.tubeLightGeometry(1.2), plainMat('white_paint'))); break;
      case 'beacon': proto = this._proto('beacon', () => geoProto(PG.beaconGeometry(), plainMat('dark_metal'))); break;
      case 'hanging': case 'work': proto = this._proto('hang', () => geoProto(PG.cageLampGeometry(), plainMat('dark_metal'))); break;
      default: break;
    }
    if (proto) {
      if (instancer) instancer.add(proto, m);
      else { const mesh = new THREE.Mesh(proto.parts[0].geometry, proto.parts[0].material); mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); this.group.add(mesh); }
    }
    this.lamps.push(lamp);
    return lamp;
  }
  _proto(k, f) { this._protos ||= {}; return (this._protos[k] ||= f()); }

  // build instanced glow meshes once all lamps are added
  finalize() {
    const byGlow = new Map();
    for (const l of this.lamps) {
      const T = LAMP_TYPES[l.type];
      if (!T || !T.glow) continue;
      if (l.glowMesh) continue;
      if (!byGlow.has(T.glow)) byGlow.set(T.glow, []);
      byGlow.get(T.glow).push(l);
    }
    for (const [g, list] of byGlow) {
      const mesh = new THREE.InstancedMesh(GLOW_GEOS[g](), glowMaterial(), list.length);
      mesh.castShadow = false; mesh.receiveShadow = false;
      list.forEach((l, i) => {
        l.glowMesh = mesh; l.glowIndex = i;
        const off = g === 'bulb' ? new THREE.Vector3(0, 0, 0.09).applyAxisAngle(new THREE.Vector3(0, 1, 0), l.rotY) : new THREE.Vector3();
        mesh.setMatrixAt(i, makeMatrix(l.pos.x + off.x, l.pos.y + off.y, l.pos.z + off.z, l.rotY));
        mesh.setColorAt(i, new THREE.Color(0, 0, 0));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.glowMeshes.set(g, mesh);
    }
  }

  setPower(p) { this.power = p; this.circuits.main = p === 'on'; this.circuits.emergency = p !== 'on'; }
  setCircuit(name, on) { this.circuits[name] = on; }
  setLampState(id, state) { for (const l of this.lamps) if (l.id === id || l.group === id) l.state = state; }
  // force a burst (scare): lamp flickers hard then dies
  burst(lamp) { lamp.state = 'burst'; lamp.burstT = 0; }
  nearest(pos, maxD = 12, filter = null) {
    let best = null, bd = maxD;
    for (const l of this.lamps) { if (filter && !filter(l)) continue; const d = l.pos.distanceTo(pos); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  lampTarget(l, t) {
    const circuitOn = this.circuits[l.circuit] !== false && (l.circuit !== 'main' || this.circuits.main) && (l.circuit !== 'emergency' || this.circuits.emergency);
    if (!circuitOn || l.state === 'off' || l.state === 'broken') return 0;
    const s = l.seed;
    switch (l.state) {
      case 'flicker': {
        const n = Math.sin(t * 13.1 + s) * Math.sin(t * 7.3 + s * 2.1) + Math.sin(t * 31 + s * 0.3) * 0.3;
        const drop = Math.sin(t * 0.7 + s) > 0.55 && Math.sin(t * 23 + s) > 0 ? 0.05 : 1;
        return Math.max(0.05, Math.min(1, 0.75 + n * 0.35)) * drop;
      }
      case 'dying': {
        const ph = (t * 0.35 + s) % 6;
        if (ph < 0.6) return Math.random() > 0.4 ? 0.8 : 0.1;
        return Math.sin(t * 50 + s) > 0.97 ? 0.5 : 0.04;
      }
      case 'burst': return 1;
      default:
        if (l.pulse) return 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 2.4 + s)), 2);
        return 1 + Math.sin(t * 90 + s) * 0.01;
    }
  }

  update(dt, camera, visibleChunks, chunkOf) {
    this.time += dt;
    const t = this.time;
    const tmpC = new THREE.Color();
    for (const l of this.lamps) {
      let target = this.lampTarget(l, t);
      if (l.state === 'burst') {
        l.burstT += dt;
        target = l.burstT < 0.5 ? (Math.random() > 0.5 ? 2.2 : 0.1) : 0;
        if (l.burstT > 0.5) l.state = 'broken';
      }
      const k = target > l.level ? 30 : 18;
      l.level += (target - l.level) * Math.min(1, dt * k);
      if (l.glowMesh) {
        const lv = Math.max(0, l.level);
        tmpC.copy(l.color).multiplyScalar(lv * (l.type === 'beacon' ? 6 : l.type === 'tube' ? 4 : 5));
        l.glowMesh.setColorAt(l.glowIndex, tmpC);
        l.glowMesh.instanceColor.needsUpdate = true;
      }
    }
    // assign pooled lights
    const camPos = camera.position;
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const cand = [];
    for (const l of this.lamps) {
      if (l.level < 0.02) continue;
      const d = l.lightPos.distanceTo(camPos);
      if (d > this.quality.drawDistance) continue;
      if (visibleChunks && chunkOf && !visibleChunks.has(chunkOf(l.cell.x, l.cell.y))) continue;
      const toL = l.lightPos.clone().sub(camPos);
      const front = toL.dot(fwd) > -l.range * 0.5 ? 1 : 2.2;
      cand.push({ l, score: (d - l.range * 0.35 * l.level) * front });
    }
    cand.sort((a, b) => a.score - b.score);
    const assign = (pool, list) => {
      const chosen = new Set(list.map((c) => c.l));
      for (const p of pool) if (p.lamp && !chosen.has(p.lamp)) { p.lamp = null; }
      for (const c of list) {
        if (pool.some((p) => p.lamp === c.l)) continue;
        const free = pool.find((p) => !p.lamp);
        if (free) { free.lamp = c.l; free.fade = 0; }
      }
      for (const p of pool) {
        const L = p.light;
        if (!p.lamp) { L.intensity = 0; L.visible = false; continue; }
        L.visible = true;
        p.fade = Math.min(1, p.fade + dt * 5);
        L.position.copy(p.lamp.lightPos);
        L.color.copy(p.lamp.color);
        L.distance = p.lamp.range;
        L.intensity = p.lamp.intensity * p.lamp.level * p.fade;
        if (L.isSpotLight) { L.target.position.set(p.lamp.lightPos.x, p.lamp.lightPos.y - 5, p.lamp.lightPos.z); L.intensity *= 1.4; }
      }
    };
    const shadowCands = this.shadowPool.length ? cand.filter((c) => c.l.down).slice(0, this.shadowPool.length) : [];
    const shadowSet = new Set(shadowCands.map((c) => c.l));
    assign(this.shadowPool, shadowCands);
    assign(this.pool, cand.filter((c) => !shadowSet.has(c.l)).slice(0, this.pool.length));
  }

  // brightness of lamp light at a position (for monster sight / player visibility)
  lightAt(pos) {
    let s = 0;
    for (const l of this.lamps) {
      if (l.level < 0.05) continue;
      const d = l.lightPos.distanceTo(pos);
      if (d < l.range) s += l.level * (1 - d / l.range) * (l.intensity / 30);
    }
    return Math.min(1.5, s);
  }

  dispose() {
    for (const m of this.glowMeshes.values()) { m.geometry !== undefined && m.dispose?.(); }
    this.scene.remove(this.group);
  }
}
