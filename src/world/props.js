// GPU instancing for repeated props, per chunk (so PVS/distance culling still applies).
import * as THREE from 'three';
import { loadModel } from '../core/assets.js';
import { CHUNK } from './builder.js';
import { CELL } from './mapgen.js';

// Flatten a GLB scene into instancing parts: [{geometry, material, matrix}]
const protoCache = new Map();
export async function modelProto(name) {
  if (protoCache.has(name)) return protoCache.get(name);
  const p = (async () => {
    const gltf = await loadModel(name);
    if (!gltf) return null;
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const parts = [];
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) {
        parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
        o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    const size = box.getSize(new THREE.Vector3());
    if (Math.max(size.x, size.y, size.z) < 0.55) for (const pt of parts) pt.castShadow = false; // tiny props: no shadow pass
    return { name, parts, box, size };
  })();
  protoCache.set(name, p);
  return p;
}
export function geoProto(geometry, material, { castShadow = true } = {}) {
  geometry.computeBoundingBox();
  return { parts: [{ geometry, material, matrix: new THREE.Matrix4(), castShadow }], box: geometry.boundingBox.clone(), size: geometry.boundingBox.getSize(new THREE.Vector3()) };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function makeMatrix(x, y, z, ry = 0, s = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(s, s, s);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

export class Instancer {
  constructor(builder) {
    this.builder = builder;
    this.entries = new Map(); // key -> {proto, chunkKey, mats:[]}
    this.colliders = [];
  }
  add(proto, matrix, { collider = false, colliderScale = 1, tag = null } = {}) {
    if (!proto) return;
    const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
    const cx = Math.floor(pos.x / CELL), cy = Math.floor(pos.z / CELL);
    const chunkKey = `${Math.floor(cx / CHUNK)},${Math.floor(cy / CHUNK)}`;
    const key = (proto.name || proto.parts[0].geometry.uuid) + '|' + chunkKey;
    let e = this.entries.get(key);
    if (!e) { e = { proto, chunkKey, cx, cy, mats: [] }; this.entries.set(key, e); }
    e.mats.push(matrix);
    if (collider && proto.box) {
      const b = proto.box.clone().applyMatrix4(matrix);
      const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * colliderScale);
      this.colliders.push({ x: c.x, y: c.y, z: c.z, hx: Math.max(0.05, s.x), hy: Math.max(0.05, s.y), hz: Math.max(0.05, s.z), tag });
    }
  }
  build() {
    for (const e of this.entries.values()) {
      const chunk = this.builder.ensureChunk(e.cx, e.cy);
      for (const part of e.proto.parts) {
        let obj;
        if (e.mats.length === 1) {
          obj = new THREE.Mesh(part.geometry, part.material);
          obj.matrixAutoUpdate = false;
          obj.matrix.multiplyMatrices(e.mats[0], part.matrix);
        } else {
          obj = new THREE.InstancedMesh(part.geometry, part.material, e.mats.length);
          for (let i = 0; i < e.mats.length; i++) { _m.multiplyMatrices(e.mats[i], part.matrix); obj.setMatrixAt(i, _m); }
          obj.instanceMatrix.needsUpdate = true;
          obj.computeBoundingSphere();
          obj.matrixAutoUpdate = false;
        }
        obj.castShadow = part.castShadow !== false;
        obj.receiveShadow = true;
        chunk.group.add(obj);
      }
    }
  }
}
