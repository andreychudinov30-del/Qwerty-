// Asset loading: PBR textures (WebP), meshopt-compressed GLB models, procedural noise textures.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mulberry32 } from './util.js';

const BASE = (import.meta.env && import.meta.env.BASE_URL) || './';
export const assetUrl = (p) => (typeof window !== 'undefined' && window.__MH_ASSETS && window.__MH_ASSETS[p]) || BASE + 'assets/' + p;

export const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

let anisotropy = 4;
export function setAnisotropy(a) {
  anisotropy = a;
  for (const t of texCache.values()) { t.anisotropy = a; t.needsUpdate = true; }
}

const texCache = new Map();
export function tex(name, kind = 'diff') {
  const key = name + '_' + kind;
  let t = texCache.get(key);
  if (t) return t;
  t = texLoader.load(assetUrl(`textures/${key}.webp`), undefined, undefined, () => console.warn('texture missing', key));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.channel = 0;
  texCache.set(key, t);
  return t;
}

const modelCache = new Map();
export function loadModel(name) {
  if (modelCache.has(name)) return modelCache.get(name);
  const p = new Promise((resolve) => {
    gltfLoader.load(assetUrl(`models/${name}.glb`), (gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m.map) m.map.anisotropy = anisotropy;
            m.envMapIntensity = 0.6;
          }
        }
      });
      resolve(gltf);
    }, undefined, (err) => { console.warn('model failed', name, err); resolve(null); });
  });
  modelCache.set(name, p);
  return p;
}
export function getLoadedModel(name) { return modelCache.get(name); }

// ---------- procedural noise texture (tileable value noise, 4 channels / octaves) ----------
let noiseTex = null;
export function noiseTexture() {
  if (noiseTex) return noiseTex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const rnd = mulberry32(1337);
  const layers = [];
  for (let c = 0; c < 4; c++) {
    const grids = [];
    for (const g of [4, 8, 16, 32, 64]) {
      const arr = new Float32Array(g * g);
      for (let i = 0; i < arr.length; i++) arr[i] = rnd();
      grids.push({ g, arr });
    }
    layers.push(grids);
  }
  const weights = [[0.5, 0.25, 0.15, 0.07, 0.03], [0.2, 0.4, 0.25, 0.1, 0.05], [0.05, 0.15, 0.3, 0.3, 0.2], [0.6, 0.3, 0.1, 0, 0]];
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      for (let c = 0; c < 4; c++) {
        let v = 0;
        layers[c].forEach(({ g, arr }, li) => {
          const fx = (x / S) * g, fy = (y / S) * g;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = sm(fx - x0), ty = sm(fy - y0);
          const x1 = (x0 + 1) % g, y1 = (y0 + 1) % g;
          const a = arr[y0 * g + x0], b = arr[y0 * g + x1], cc = arr[y1 * g + x0], d = arr[y1 * g + x1];
          v += ((a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty) * weights[c][li];
        });
        data[(y * S + x) * 4 + c] = Math.max(0, Math.min(255, v * 255));
      }
    }
  }
  noiseTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// canvas texture helper
export function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}
