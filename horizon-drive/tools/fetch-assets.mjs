// Downloads CC0 assets (Poly Haven) + Ferrari 458 model (three.js examples, CC-BY) into assets/
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const out = 'assets';
fs.mkdirSync(out, { recursive: true });
const get = (url, file) => {
  if (fs.existsSync(file)) return;
  console.log('GET', url);
  execSync(`curl -sfL "${url}" -o "${file}"`);
};
const mats = {
  asphalt: 'asphalt_02', forest: 'forest_ground_04', grass: 'aerial_grass_rock', rock: 'rocky_terrain_02',
  sand: 'aerial_beach_01', desert: 'coast_sand_rocks_02', concrete: 'concrete_floor_02', dirt: 'brown_mud_leaves_01',
};
for (const [k, id] of Object.entries(mats)) {
  const m = JSON.parse(execSync(`curl -sfL https://api.polyhaven.com/files/${id}`).toString());
  get(m.Diffuse['1k'].jpg.url, `${out}/${k}_diff_raw.jpg`);
  get(m.nor_gl['1k'].jpg.url, `${out}/${k}_nor_raw.jpg`);
  get(m.arm['1k'].jpg.url, `${out}/${k}_arm_raw.jpg`);
  const big = k === 'asphalt' ? '1024' : '1024';
  execSync(`convert ${out}/${k}_diff_raw.jpg -resize ${big}x${big} -quality 80 ${out}/${k}_diff.jpg`);
  execSync(`convert ${out}/${k}_nor_raw.jpg -resize 512x512 -quality 85 ${out}/${k}_nor.jpg`);
  execSync(`convert ${out}/${k}_arm_raw.jpg -resize 512x512 -quality 80 ${out}/${k}_arm.jpg`);
}
const h = JSON.parse(execSync('curl -sfL https://api.polyhaven.com/files/studio_small_09').toString());
get(h.hdri['1k'].hdr.url, `${out}/studio.hdr`);
get('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/ferrari.glb', `${out}/ferrari.glb`);
get('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/ferrari_ao.png', `${out}/ferrari_ao.png`);
get('https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/waternormals.jpg', `${out}/waternormals_raw.jpg`);
execSync(`convert ${out}/waternormals_raw.jpg -resize 512x512 -quality 85 ${out}/waternormals.jpg`);
console.log('done');
