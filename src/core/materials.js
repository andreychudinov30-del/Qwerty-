// PBR material library. Every surface material gets a shader patch that adds:
//  - world-space macro variation (breaks texture tiling)
//  - puddles / wet floor reflections (low roughness, flattened normals, darker albedo)
//  - water streaks on walls
//  - vertex-color baked ambient occlusion
import * as THREE from 'three';
import { tex, noiseTexture } from './assets.js';

export const sharedUniforms = {
  uNoise: { value: null },
  uTime: { value: 0 },
  uWet: { value: 0.5 },
};

// tex: Poly Haven id; scale: meters per texture repeat; tint: albedo multiplier
const DEFS = {
  station_floor: { tex: 'granite_tile', scale: 2.4, tint: 0xa8a59e, wet: 1, var: 0.35 },
  station_tiles: { tex: 'square_tiled_wall', scale: 1.6, tint: 0xd2cabd, streak: 0.4, var: 0.3, rough: 0.9 },
  plaster: { tex: 'worn_plaster_wall', scale: 3.2, tint: 0x9d978c, streak: 0.6, var: 0.4 },
  ceiling: { tex: 'worn_cracked_plaster', scale: 3.5, tint: 0x77736b, var: 0.4 },
  skirting: { tex: 'granite_tile', scale: 1.2, tint: 0x4a4642, var: 0.2 },
  marble: { tex: 'granite_tile', scale: 1.5, tint: 0x8c867c, var: 0.2, rough: 0.55 },
  tunnel: { tex: 'concrete_wall_008', scale: 3.2, tint: 0x7e8078, streak: 1, var: 0.45 },
  tubbing: { tex: 'rusty_painted_metal', scale: 2.5, tint: 0x5f5650, streak: 0.8, var: 0.4 },
  gravel: { tex: 'gravel_floor', scale: 1.4, tint: 0x6d6862, wet: 0.7, var: 0.5 },
  concrete: { tex: 'dirty_concrete', scale: 3.0, tint: 0x8d8981, streak: 0.7, var: 0.4 },
  concrete_floor: { tex: 'concrete_floor_worn_001', scale: 3.0, tint: 0x8a8781, wet: 1, var: 0.4 },
  service_wall: { tex: 'peeling_painted_wall', scale: 2.6, tint: 0x6f8584, streak: 0.6, var: 0.35, hue: true },
  service_lower: { tex: 'painted_concrete', scale: 2.6, tint: 0x56707a, streak: 0.5, var: 0.3 },
  lab_wall: { tex: 'long_white_tiles', scale: 1.8, tint: 0xc9cdc6, streak: 0.4, var: 0.25, rough: 0.8 },
  lab_floor: { tex: 'worn_tile_floor', scale: 2.2, tint: 0x9a9a94, wet: 0.8, var: 0.3 },
  bunker_wall: { tex: 'painted_concrete', scale: 3.0, tint: 0x8fa190, streak: 0.5, var: 0.35 },
  bunker_upper: { tex: 'worn_plaster_wall', scale: 3.0, tint: 0xb2ae9f, var: 0.3 },
  depot_floor: { tex: 'damaged_concrete_floor', scale: 4.0, tint: 0x8d877c, wet: 1, var: 0.4 },
  depot_wall: { tex: 'concrete_panels', scale: 4.0, tint: 0x8a8a84, streak: 0.8, var: 0.4 },
  hall_wall: { tex: 'rebar_reinforced_concrete', scale: 4.0, tint: 0x9b8a84, streak: 0.6, var: 0.4 },
  rock: { tex: 'rubble', scale: 3.2, tint: 0x5e5850, wet: 0.5, var: 0.6, streak: 0.5 },
  metal: { tex: 'metal_plate', scale: 1.8, tint: 0x8a8a86, var: 0.3 },
  rust: { tex: 'dirty_tiles', scale: 2.0, tint: 0x8a7064, var: 0.3 },
  rust_light: { tex: 'rusty_metal_02', scale: 2.0, tint: 0xa09890, var: 0.3 },
  rusty_paint: { tex: 'rusty_painted_metal', scale: 2.0, tint: 0x9a8a80, var: 0.3 },
  train_paint: { tex: 'green_metal_rust', scale: 3.0, tint: 0x6e8a86, var: 0.3, hue: true },
  grate: { tex: 'metal_grate_rusty', scale: 1.5, tint: 0x8a7a70, var: 0.2 },
  corrugated: { tex: 'corrugated_iron', scale: 2.0, tint: 0x7d756a, var: 0.6 },
  wood: { tex: 'old_planks_02', scale: 2.0, tint: 0x8a7a68, var: 0.3 },
  edge: { tex: 'concrete_floor_worn_001', scale: 2.0, tint: 0x75716a, var: 0.3 },
  cave_floor: { tex: 'rubble', scale: 2.5, tint: 0x4e4943, wet: 0.9, var: 0.6 },
};

// measured mean linear albedo of each diffuse texture (tools: sharp); used to normalise brightness
const MEAN_ALBEDO = {"concrete_floor_worn_001":0.092,"concrete_panels":0.235,"concrete_wall_008":0.222,"corrugated_iron":0.426,"damaged_concrete_floor":0.046,"dirty_concrete":0.224,"dirty_tiles":0.027,"granite_tile":0.077,"gravel_floor":0.244,"green_metal_rust":0.053,"long_white_tiles":0.553,"metal_grate_rusty":0.115,"metal_plate":0.031,"old_planks_02":0.092,"painted_concrete":0.102,"peeling_painted_wall":0.189,"rebar_reinforced_concrete":0.197,"rubble":0.297,"rusty_metal_02":0.275,"rusty_painted_metal":0.078,"square_tiled_wall":0.17,"worn_cracked_plaster":0.158,"worn_plaster_wall":0.149,"worn_tile_floor":0.059};
// target albedo per material (linear). Tint hex only shifts hue.
const TARGET = { station_floor: 0.16, station_tiles: 0.3, plaster: 0.22, ceiling: 0.14, skirting: 0.08, marble: 0.2, tunnel: 0.15, tubbing: 0.09, gravel: 0.13, concrete: 0.17, concrete_floor: 0.14, service_wall: 0.2, service_lower: 0.13, lab_wall: 0.42, lab_floor: 0.16, bunker_wall: 0.13, bunker_upper: 0.3, depot_floor: 0.12, depot_wall: 0.17, hall_wall: 0.17, rock: 0.11, metal: 0.12, rust: 0.09, rust_light: 0.2, rusty_paint: 0.12, train_paint: 0.1, grate: 0.12, corrugated: 0.16, wood: 0.12, edge: 0.13, cave_floor: 0.09 };

const cache = new Map();

export function patchMaterial(mat, opts = {}) {
  const { wet = 0, streak = 0, variation = 0.3, vc = false } = opts;
  mat.userData.patch = { wet, streak, variation };
  if (!sharedUniforms.uNoise.value) sharedUniforms.uNoise.value = noiseTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = sharedUniforms.uNoise;
    shader.uniforms.uWet = sharedUniforms.uWet;
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vWNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWNorm = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNorm;
        uniform sampler2D uNoise; uniform float uWet; uniform float uTime;
        float mhWet = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 an = abs(vWNorm);
          vec2 wuv = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy);
          vec4 nz = texture2D(uNoise, wuv * 0.043);
          vec4 nz2 = texture2D(uNoise, wuv * 0.17 + 0.37);
          float v = mix(1.0, (0.72 + nz.r * 0.55) * (0.85 + nz2.g * 0.3), ${variation.toFixed(3)});
          diffuseColor.rgb *= v;
          ${wet > 0 ? `
          float floorMask = smoothstep(0.75, 0.95, vWNorm.y);
          float pn = texture2D(uNoise, vWPos.xz * 0.045 + vec2(0.13, 0.71)).a * 0.75 + texture2D(uNoise, vWPos.xz * 0.21).b * 0.25;
          float puddle = smoothstep(0.6, 0.66, pn);
          float damp = smoothstep(0.5, 0.62, pn) * 0.35;
          mhWet = floorMask * max(puddle, damp) * uWet * ${wet.toFixed(3)};
          diffuseColor.rgb *= mix(1.0, 0.62, mhWet);` : ''}
          ${streak > 0 ? `
          float wallMask = 1.0 - smoothstep(0.3, 0.6, abs(vWNorm.y));
          float sx = (an.x > an.z ? vWPos.z : vWPos.x);
          float st = texture2D(uNoise, vec2(sx * 0.35, vWPos.y * 0.025 + 0.5)).b;
          float streakM = wallMask * smoothstep(0.55, 0.75, st) * ${streak.toFixed(3)} * uWet;
          mhWet = max(mhWet, streakM * 0.7);
          diffuseColor.rgb *= mix(1.0, 0.6, streakM);` : ''}
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, mhWet);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, mhWet * 0.85));`);
  };
  mat.customProgramCacheKey = () => `mh|${wet}|${streak}|${variation}|${vc}`;
  return mat;
}

function tintColor(d, key) {
  const c = new THREE.Color().setHex(d.tint ?? 0xffffff, THREE.LinearSRGBColorSpace);
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 || 1;
  c.multiplyScalar(1 / lum); // hue only
  const mean = MEAN_ALBEDO[d.tex] || 0.15;
  const k = Math.min(6, Math.max(0.35, (TARGET[key] ?? 0.15) / mean));
  return c.multiplyScalar(k);
}

export function getMat(key, { vc = true } = {}) {
  const ck = key + (vc ? '|vc' : '');
  if (cache.has(ck)) return cache.get(ck);
  const d = DEFS[key];
  let mat;
  if (!d) {
    mat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
  } else {
    const rep = 1;
    mat = new THREE.MeshStandardMaterial({
      map: tex(d.tex, 'diff'),
      normalMap: tex(d.tex, 'nor'),
      roughnessMap: tex(d.tex, 'arm'),
      metalnessMap: tex(d.tex, 'arm'),
      aoMap: tex(d.tex, 'arm'),
      aoMapIntensity: 0.8,
      color: tintColor(d, key),
      roughness: d.rough ?? 1,
      metalness: 1,
      vertexColors: vc,
      envMapIntensity: 1,
    });
    mat.normalScale.set(1, 1).multiplyScalar(d.nscale ?? 1);
    mat.userData.texScale = d.scale * rep;
    patchMaterial(mat, { wet: d.wet || 0, streak: d.streak || 0, variation: d.var ?? 0.3, vc });
  }
  mat.name = key;
  mat.userData.texScale ??= 2;
  cache.set(ck, mat);
  return mat;
}
export function texScale(key) { return DEFS[key]?.scale ?? 2; }

// Simple (non textured) materials
const simple = new Map();
export function plainMat(key) {
  if (simple.has(key)) return simple.get(key);
  let m;
  switch (key) {
    case 'rail': m = new THREE.MeshStandardMaterial({ color: 0x9a9690, metalness: 1, roughness: 0.32 }); break;
    case 'rail_rust': m = new THREE.MeshStandardMaterial({ color: 0x4a3a30, metalness: 0.7, roughness: 0.8 }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0x3c3f42, metalness: 0.9, roughness: 0.55 }); break;
    case 'dark_metal': m = new THREE.MeshStandardMaterial({ color: 0x1d1f21, metalness: 0.8, roughness: 0.6 }); break;
    case 'cable': m = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0, roughness: 0.55 }); break;
    case 'cable_red': m = new THREE.MeshStandardMaterial({ color: 0x3a0e0a, metalness: 0, roughness: 0.6 }); break;
    case 'pipe': m = new THREE.MeshStandardMaterial({ color: 0x47504c, metalness: 0.6, roughness: 0.6 }); break;
    case 'pipe_red': m = new THREE.MeshStandardMaterial({ color: 0x5a1c14, metalness: 0.5, roughness: 0.55 }); break;
    case 'pipe_yellow': m = new THREE.MeshStandardMaterial({ color: 0x8a6a18, metalness: 0.5, roughness: 0.6 }); break;
    case 'yellow_paint': m = new THREE.MeshStandardMaterial({ color: 0xa8820f, roughness: 0.75 }); break;
    case 'white_paint': m = new THREE.MeshStandardMaterial({ color: 0xbab6aa, roughness: 0.7 }); break;
    case 'rubber': m = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }); break;
    case 'glass': m = new THREE.MeshPhysicalMaterial({ color: 0x223028, metalness: 0, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.5, depthWrite: false }); break;
    case 'glass_dirty': m = new THREE.MeshStandardMaterial({ color: 0x2a332e, metalness: 0.2, roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false }); break;
    case 'liquid': m = new THREE.MeshStandardMaterial({ color: 0x1d4a26, emissive: 0x0a3311, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.78 }); break;
    case 'seat': m = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.7 }); break;
    case 'seat_blue': m = new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.75 }); break;
    case 'cloth': m = new THREE.MeshStandardMaterial({ color: 0x4a4236, roughness: 0.95, side: THREE.DoubleSide }); break;
    case 'cloth_dark': m = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.95, side: THREE.DoubleSide }); break;
    case 'paper': m = new THREE.MeshStandardMaterial({ color: 0xb8ae98, roughness: 0.9, side: THREE.DoubleSide }); break;
    case 'bone': m = new THREE.MeshStandardMaterial({ color: 0xb5a98e, roughness: 0.7 }); break;
    case 'blood': m = new THREE.MeshStandardMaterial({ color: 0x2a0503, roughness: 0.25, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); break;
    case 'black': m = new THREE.MeshBasicMaterial({ color: 0x000000 }); break;
    case 'sandbag': m = new THREE.MeshStandardMaterial({ color: 0x5c5444, roughness: 1 }); break;
    case 'fungus': m = new THREE.MeshStandardMaterial({ color: 0x163024, emissive: 0x2aff9a, emissiveIntensity: 0.9, roughness: 0.5 }); break;
    case 'flesh_wall': m = new THREE.MeshStandardMaterial({ color: 0x3a1614, roughness: 0.35, metalness: 0 }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
  }
  m.name = key;
  simple.set(key, m);
  return m;
}

// emissive lamp material (instanced glow, colour controlled per-instance)
let glowMat = null;
export function glowMaterial() {
  if (glowMat) return glowMat;
  glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
  return glowMat;
}
