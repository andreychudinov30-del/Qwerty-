// Level: builds geometry + decor + lamps + water from a MapGrid, sets environment lighting,
// handles PVS/distance culling each frame and exposes spatial queries.
import * as THREE from 'three';
import { LevelBuilder } from './builder.js';
import { decorate } from './decor.js';
import { LampSystem } from './lamps.js';
import { Water, waterLevelAt } from './water.js';
import { CELL, ZONES } from './mapgen.js';
import { RNG } from '../core/util.js';
import { sharedUniforms } from '../core/materials.js';

let envCache = null;
export function makeEnvironment(renderer) {
  if (envCache) return envCache;
  // a dim underground "room" with a few warm and cold emissive panels -> PMREM for glossy reflections
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  const box = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 30), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, side: THREE.BackSide }));
  scene.add(box);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.2, 1.4) });
  const cold = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.5, 1.8) });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), i % 3 ? warm : cold);
    m.position.set(Math.cos(i) * 9, 3.5, Math.sin(i * 1.7) * 9);
    scene.add(m);
  }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(20, 0.1, 0.4), warm);
  strip.position.set(0, 3.9, -6); scene.add(strip);
  const pmrem = new THREE.PMREMGenerator(renderer);
  envCache = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return envCache;
}

export class Level {
  constructor(engine, grid, env = {}) {
    this.engine = engine;
    this.grid = grid;
    this.env = env;
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.time = 0;
  }

  async build(onProgress = () => {}) {
    const env = this.env;
    const q = this.engine.quality;
    onProgress(0.1, 'Геометрия станции');
    const builder = new LevelBuilder(this.grid, env);
    builder.build();
    this.builder = builder;
    this.root.add(builder.group);
    onProgress(0.3, 'Окружение и детали');
    this.lamps = new LampSystem(this.scene, q);
    const rng = new RNG(env.seed || 'metro');
    const deco = await decorate(builder, this.grid, rng, { lampBroken: env.lampBroken, lampFlicker: env.lampFlicker, chapter: env.chapter, lampSystem: this.lamps });
    this.decor = deco;
    this.lamps.finalize();
    this.water = new Water(builder);
    onProgress(0.6, 'Освещение');
    // environment
    const scene = this.scene;
    scene.background = new THREE.Color(env.fogColor ?? 0x020304);
    scene.fog = new THREE.FogExp2(env.fogColor ?? 0x020304, env.fog ?? 0.045);
    scene.environment = makeEnvironment(this.engine.renderer);
    scene.environmentIntensity = env.envIntensity ?? 0.36;
    this.hemi = new THREE.HemisphereLight(env.skyColor ?? 0x6b7d90, env.groundColor ?? 0x2a221b, 0.8 + (env.ambient ?? 0.32) * 1.5);
    scene.add(this.hemi);
    sharedUniforms.uWet.value = env.wet ?? 0.55;
    this.lamps.setPower(env.power || 'on');
    if (env.power === 'off') this.lamps.setCircuit('emergency', env.emergency !== false);
    this.visibleChunks = new Set();
    onProgress(0.8, 'Подготовка');
    return this;
  }

  chunkKeyAt(x, z) { return this.builder.chunkOf(Math.floor(x / CELL), Math.floor(z / CELL)); }
  chunkOf = (cx, cy) => this.builder.chunkOf(cx, cy);

  update(dt, camera) {
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    const q = this.engine.quality;
    const key = this.chunkKeyAt(camera.position.x, camera.position.z);
    const pvs = this.builder.pvs.get(key);
    const dd = q.drawDistance;
    const dd2 = (dd + 14) * (dd + 14);
    this.visibleChunks.clear();
    for (const [k, ch] of this.builder.chunks) {
      const dx = ch.center.x - camera.position.x, dz = ch.center.z - camera.position.z;
      const vis = (!pvs || pvs.has(k)) && dx * dx + dz * dz < dd2;
      ch.group.visible = vis;
      if (vis) this.visibleChunks.add(k);
    }
    if (!pvs) for (const k of this.builder.chunks.keys()) this.visibleChunks.add(k);
    this.lamps.update(dt, camera, this.visibleChunks, this.chunkOf);
    this.water.update(dt);
  }

  // ---- queries ----
  cellAt(x, z) { return { x: Math.floor(x / CELL), y: Math.floor(z / CELL) }; }
  zoneAt(x, z) { const c = this.cellAt(x, z); if (!this.grid.in(c.x, c.y)) return null; const zc = this.builder.zone[this.builder.idx(c.x, c.y)]; return zc ? ZONES[zc] : null; }
  floorAt(x, z) { const c = this.cellAt(x, z); if (!this.grid.in(c.x, c.y)) return 0; const f = this.builder.floorAt(c.x, c.y, x / CELL - c.x, z / CELL - c.y); return isNaN(f) ? 0 : f; }
  waterAt(x, z) { return waterLevelAt(this.builder, x, z); }
  walkableCell(cx, cy) { return this.grid.in(cx, cy) && this.builder.walkable[this.builder.idx(cx, cy)] === 1; }
  losWorld(a, b) { return this.builder.los(a.x / CELL, a.z / CELL, b.x / CELL, b.z / CELL); }
  spotPos(name, yOff = 0) {
    const s = this.grid.spots[name];
    if (!s) return null;
    const x = (s.x + 0.5) * CELL + (s.ox || 0), z = (s.y + 0.5) * CELL + (s.oz || 0);
    return new THREE.Vector3(x, this.floorAt(x, z) + yOff, z);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.();
        if (o.isInstancedMesh) o.dispose?.();
      }
    });
    this.lamps?.dispose();
    this.scene.clear();
  }
}
