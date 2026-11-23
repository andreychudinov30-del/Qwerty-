// Downloads CC0 assets from Poly Haven (https://polyhaven.com, CC0 license)
// and optimizes them for web/mobile (WebP textures, meshopt-compressed GLB).
// Usage: node tools/fetch-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_TEX = path.join(ROOT, 'public/assets/textures');
const OUT_MOD = path.join(ROOT, 'public/assets/models');
const TMP = path.join(ROOT, '.asset-cache');
fs.mkdirSync(OUT_TEX, { recursive: true });
fs.mkdirSync(OUT_MOD, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

export const TEXTURES = [
  'dirty_tiles', 'worn_tile_floor', 'granite_tile', 'square_tiled_wall', 'worn_plaster_wall',
  'peeling_painted_wall', 'concrete_wall_008', 'rebar_reinforced_concrete', 'dirty_concrete',
  'gravel_floor', 'concrete_floor_worn_001', 'rusty_metal_02', 'metal_plate', 'rusty_painted_metal',
  'green_metal_rust', 'metal_grate_rusty', 'corrugated_iron', 'long_white_tiles', 'painted_concrete',
  'old_planks_02', 'damaged_concrete_floor', 'rubble', 'concrete_panels', 'worn_cracked_plaster'
];

export const MODELS = [
  'Barrel_01', 'barrel_03', 'cardboard_box_01', 'old_military_crate', 'wooden_crate_01', 'metal_jerrycan',
  'portable_generator', 'power_box_01', 'utility_box_02', 'old_gas_mask', 'vintage_radio_transceiver',
  'vintage_flashlight', 'metal_trash_can', 'trashbag', 'WetFloorSign_01', 'wheelchair_01', 'metal_office_desk',
  'steel_frame_shelves_01', 'medical_box', 'propane_tank', 'korean_fire_extinguisher_01',
  'security_camera_01', 'metal_tool_chest', 'old_tyre', 'russian_food_cans_01', 'street_rat',
  'cement_bag', 'chemistry_set', 'industrial_microscope', 'vintage_suitcase', 'old_military_compressor',
  'drawer_cabinet', 'painted_wooden_bench', 'clipboard',
  'binder_notebook', 'ladder_sectioned_01'
];

async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return dest;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchTexture(id) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const maps = { diff: files.Diffuse, nor: files.nor_gl, arm: files.arm };
  const sharp = (await import('sharp')).default;
  for (const [k, m] of Object.entries(maps)) {
    if (!m) { console.warn('missing', id, k); continue; }
    const url = m['1k'].jpg.url;
    const tmp = await get(url, path.join(TMP, 'tex', `${id}_${k}.jpg`));
    const out = path.join(OUT_TEX, `${id}_${k}.webp`);
    if (!fs.existsSync(out)) {
      await sharp(tmp).resize(1024, 1024, { fit: 'inside' }).webp({ quality: k === 'nor' ? 90 : 82 }).toFile(out);
    }
  }
  console.log('tex', id);
}

async function fetchModel(id) {
  const out = path.join(OUT_MOD, `${id}.glb`);
  if (fs.existsSync(out)) { console.log('model (cached)', id); return; }
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf['1k'].gltf;
  const dir = path.join(TMP, 'models', id);
  await get(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include || {})) await get(f.url, path.join(dir, rel));
  const bin = path.join(ROOT, 'node_modules/.bin/gltf-transform');
  const mid = path.join(dir, `${id}_opt.glb`);
  execFileSync(bin, ['optimize', path.join(dir, `${id}.gltf`), mid,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '512',
    '--simplify', 'false', '--instance', 'false', '--flatten', 'false', '--join', 'false'], { stdio: 'pipe' });
  fs.copyFileSync(mid, out);
  console.log('model', id, (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (q.length) { const it = q.shift(); try { await fn(it); } catch (e) { console.error('FAIL', it, e.message); } }
  }));
}

await pool(TEXTURES, 6, fetchTexture);
await pool(MODELS, 4, fetchModel);
// Character (Mixamo-rigged soldier from the three.js examples)
await get('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb', path.join(OUT_MOD, 'Soldier.glb'));
await get('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb', path.join(TMP, 'Xbot.glb'));
console.log('done');
