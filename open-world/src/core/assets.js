// Embedded asset loading (textures: Poly Haven CC0; models: Poly Haven CC0 + three.js example Soldier)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { G } from './util.js';

const texUrls = import.meta.glob('../../assets/tex/*.webp', { eager: true, query: '?url', import: 'default' });
const modelUrls = import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' });

const byName = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.split('/').pop().replace(/\.(webp|glb)$/, ''), v]));
const TEX = byName(texUrls), MOD = byName(modelUrls);

export const tex = {};
export const models = {};

export async function loadAll(onProgress) {
  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  let done = 0;
  const total = Object.keys(TEX).length + Object.keys(MOD).length;
  const tick = () => { done++; onProgress && onProgress(done / total); };
  for (const [name, url] of Object.entries(TEX)) {
    jobs.push(new Promise((res) => {
      tl.load(url, (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = G.maxAniso || 4;
        if (name.endsWith('_diff')) t.colorSpace = THREE.SRGBColorSpace;
        tex[name] = t; tick(); res();
      }, undefined, () => { tick(); res(); });
    }));
  }
  for (const [name, url] of Object.entries(MOD)) {
    jobs.push(new Promise((res) => {
      gl.load(url, (g) => { models[name] = g; tick(); res(); }, undefined, (e) => { console.warn('model', name, e); tick(); res(); });
    }));
  }
  await Promise.all(jobs);
}

export function pbr(name, { repeat = 1, color = 0xffffff, rough = 1, normalScale = 1, side } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const d = tex[name + '_diff'], n = tex[name + '_nor'], a = tex[name + '_arm'];
  if (d) m.map = d;
  if (n) { m.normalMap = n; m.normalScale.set(normalScale, normalScale); }
  if (a) { m.roughnessMap = a; m.aoMap = null; m.metalnessMap = a; m.metalness = 1; }
  if (side) m.side = side;
  m.userData.repeat = repeat;
  return m;
}
