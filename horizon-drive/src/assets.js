import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const A = () => window.__ASSETS || {};
const mime = n => n.endsWith('.png') ? 'image/png' : n.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
export function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
export function assetURL(name) { return `data:${mime(name)};base64,${A()[name]}`; }

const texLoader = new THREE.TextureLoader();
const cache = {};
export function tex(name, { repeat = 1, srgb = false, aniso = 8 } = {}) {
  const key = name + repeat + srgb;
  if (cache[key]) return cache[key];
  const t = texLoader.load(assetURL(name));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache[key] = t; return t;
}
// PBR material set from Poly Haven maps (diffuse, normal GL, ARM)
export function pbr(name, repeat = 1, opts = {}) {
  const arm = tex(name + '_arm.jpg', { repeat });
  const m = new THREE.MeshStandardMaterial({
    map: tex(name + '_diff.jpg', { repeat, srgb: true }), normalMap: tex(name + '_nor.jpg', { repeat }),
    roughnessMap: arm, aoMap: arm, metalness: 0, roughness: 1, ...opts,
  });
  m.normalScale.set(opts.ns || 1, opts.ns || 1);
  return m;
}

let gltfPromise = null;
export function loadCarGLTF() {
  if (gltfPromise) return gltfPromise;
  const draco = new DRACOLoader();
  draco.setDecoderConfig({ type: 'wasm' });
  draco._loadLibrary = (url) => {
    if (url === 'draco_wasm_wrapper.js') return Promise.resolve(atob(A()['draco_wasm_wrapper.js']));
    if (url === 'draco_decoder.wasm') return Promise.resolve(b64ToBuf(A()['draco_decoder.wasm']));
    return Promise.reject(new Error('no ' + url));
  };
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  gltfPromise = new Promise((res, rej) => loader.parse(b64ToBuf(A()['ferrari.glb']), '', res, rej));
  return gltfPromise;
}

export function loadStudioHDR() {
  return new Promise((res) => {
    const l = new RGBELoader();
    const data = l.parse(b64ToBuf(A()['studio.hdr']));
    const t = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
    t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    t.mapping = THREE.EquirectangularReflectionMapping; t.needsUpdate = true; t.flipY = true;
    res(t);
  });
}

// Procedural canvas texture helper
export function canvasTex(w, h, draw, { srgb = true, repeat = [1, 1], mip = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = mip; return t;
}
