// Assembles the whole static world
import * as THREE from 'three';
import { G } from '../core/util.js';
import { quality } from '../core/save.js';
import { generateCity } from './citygen.js';
import { Chunks } from './chunks.js';
import { makeTerrain, makeSlabs, makeWater } from './ground.js';
import { buildCity } from './buildings.js';
import { Vegetation } from './vegetation.js';
import { Props } from './props.js';
import { Atmosphere } from './sky.js';

export async function buildWorld(scene, renderer, physics, progress) {
  const step = async (t, f) => { progress && progress(t); await new Promise((r) => setTimeout(r, 0)); return f(); };
  const city = await step('Планировка города…', () => generateCity(1337));
  const chunks = new Chunks(scene, 200);
  chunks.view = quality().view;
  const atmo = await step('Атмосфера и небо…', () => new Atmosphere(scene, renderer));
  await step('Рельеф и дороги…', () => { makeTerrain(scene); makeWater(scene); makeSlabs(city, chunks); });
  await step('Здания…', () => buildCity(city, chunks));
  const veg = await step('Деревья и трава…', () => new Vegetation(scene, city, chunks));
  await step('Физика мира…', () => physics.buildWorld(city, veg.trunks.filter((t) => !t.forest || Math.abs(t.x) < 1100)));
  const props = await step('Улицы и освещение…', () => new Props(scene, city, chunks, physics));
  G.city = city; G.chunks = chunks; G.atmo = atmo; G.veg = veg; G.props = props;
  return { city, chunks, atmo, veg, props };
}
