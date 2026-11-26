import { CARS } from './data.js';
const KEY = 'horizon_drive_save_v1';

export function defaultTune(car) {
  return {
    paint: car.color, finish: car.cls === 'hyper' ? 'metallic' : 'gloss', paint2: '#111111',
    rim: 'oem', rimColor: '#c9ccd1', rimSize: 1.0, spoiler: 'none', front: 'stock', skirts: 'stock', widebody: 'stock',
    tint: 0.35, ride: 0, livery: 'none', liveryColor: '#ffffff', decal: 'none', number: Math.floor(Math.random() * 98) + 1,
    headlight: '#ffffff', neon: null, tires: car.offroad ? 'offroad' : 'street',
    engine: 0, turbo: 0, brakes: 0, suspension: 0, transmission: 0, weight: 0,
    finalDrive: 1.0, stiffness: 1.0, brakeBias: 0.62, owned: { tires: { street: true, [car.offroad ? 'offroad' : 'street']: true } , items: {} },
  };
}

export function defaultSave() {
  return {
    coins: 30000, owned: { vega: defaultTune(CARS[0]) }, selected: 'vega',
    records: {}, stats: { races: 0, wins: 0, podiums: 0, distance: 0, topSpeed: 0, earned: 0, drift: 0, time: 0 },
    settings: { quality: -1, resScale: 1, shadows: true, fpsCap: 60, showFps: false, volume: 0.8, music: 0.4, sfx: 0.9, sens: 1.0,
      difficulty: 1, camera: 0, btnSize: 1.0, btnLayout: 'classic', gearbox: 'auto', abs: true, tcs: true, esp: true, units: 'kmh', drawDist: 1.0, effects: 1.0, timeOfDay: 'dynamic', weather: 'random', mblur: true, invertSteer: false, tilt: false },
  };
}

let state = null;
export function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); state = Object.assign(defaultSave(), d); state.settings = Object.assign(defaultSave().settings, d.settings || {}); state.stats = Object.assign(defaultSave().stats, d.stats || {}); } } catch (e) { /* ignore */ }
  if (!state) state = defaultSave();
  for (const id in state.owned) { const car = CARS.find(c => c.id === id); if (car) state.owned[id] = Object.assign(defaultTune(car), state.owned[id]); else delete state.owned[id]; }
  if (!state.owned[state.selected]) state.selected = Object.keys(state.owned)[0];
  return state;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
export function S() { return state; }
export function resetSave() { state = defaultSave(); save(); }
