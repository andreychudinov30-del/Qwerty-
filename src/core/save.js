// Persistent profile: settings, progress, coins, skins, stats, achievements, checkpoints.
import { isMobile, bus } from './util.js';

const KEY = 'metroHorror.profile.v1';

export const QUALITY_PRESETS = {
  eco:    { label: 'Экономичная', resolution: 0.55, dprCap: 1.0, shadows: 0, shadowSize: 512, lights: 2, bloom: false, ao: false, volumetric: false, drawDistance: 34, particles: 0.25, aniso: 1, postfx: false },
  low:    { label: 'Низкая', resolution: 0.7, dprCap: 1.25, shadows: 1, shadowSize: 512, lights: 3, bloom: false, ao: false, volumetric: true, drawDistance: 44, particles: 0.5, aniso: 2, postfx: true },
  medium: { label: 'Средняя', resolution: 0.85, dprCap: 1.5, shadows: 1, shadowSize: 1024, lights: 5, bloom: true, ao: false, volumetric: true, drawDistance: 58, particles: 0.75, aniso: 4, postfx: true },
  high:   { label: 'Высокая', resolution: 1.0, dprCap: 1.75, shadows: 2, shadowSize: 1024, lights: 7, bloom: true, ao: true, volumetric: true, drawDistance: 75, particles: 1.0, aniso: 8, postfx: true },
  ultra:  { label: 'Ультра', resolution: 1.0, dprCap: 2.25, shadows: 3, shadowSize: 2048, lights: 10, bloom: true, ao: true, volumetric: true, drawDistance: 100, particles: 1.3, aniso: 16, postfx: true },
};

export const DEFAULT_TOUCH_LAYOUT = {
  // x,y in % of screen; size in px; opacity 0..1
  run: { x: 86, y: 52, size: 70 },
  crouch: { x: 72, y: 82, size: 62 },
  interact: { x: 88, y: 74, size: 80 },
  flashlight: { x: 74, y: 60, size: 58 },
  jump: { x: 94, y: 90, size: 56 },
  throw: { x: 62, y: 90, size: 50 },
  item: { x: 60, y: 74, size: 50 },
  reload: { x: 50, y: 88, size: 48 },
  joystick: { x: 16, y: 72, size: 130 },
  opacity: 0.85,
  scale: 1,
};

function defaults() {
  const mobile = isMobile();
  return {
    version: 1,
    name: 'Выживший',
    online: { id: null, secret: null },
    coins: 250,
    skins: ['stalker'],
    skin: 'stalker',
    progress: { unlocked: 1, done: {}, checkpoint: null, flags: {}, endings: [], notes: [] },
    stats: { playTime: 0, distance: 0, deaths: 0, missions: 0, coopMissions: 0, escapes: 0, scares: 0, flaresUsed: 0 },
    achievements: {},
    settings: {
      quality: mobile ? 'low' : 'high',
      custom: null, // overrides of preset fields
      adaptive: true,
      volume: { master: 0.9, music: 0.6, sfx: 1, ambience: 0.9, voice: 1 },
      sensitivity: mobile ? 1.0 : 1.0,
      invertY: false,
      fov: 72,
      headBob: true,
      subtitles: true,
      showFps: false,
      touchLayout: JSON.parse(JSON.stringify(DEFAULT_TOUCH_LAYOUT)),
      runToggle: mobile,
      crouchToggle: true,
      vibration: true,
    },
  };
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) deepMerge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}

let profile = null;
export function loadProfile() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  profile = deepMerge(defaults(), data || {});
  return profile;
}
export function getProfile() { return profile || loadProfile(); }
let saveTimer = 0;
export function saveProfile(immediate = false) {
  clearTimeout(saveTimer);
  const doSave = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { console.warn('save failed', e); } bus.emit('profile:saved', profile); };
  if (immediate) doSave(); else saveTimer = setTimeout(doSave, 300);
}
export function resetProfile() { const keepOnline = profile?.online; profile = defaults(); if (keepOnline) profile.online = keepOnline; saveProfile(true); }

export function getQuality() {
  const s = getProfile().settings;
  const base = { ...QUALITY_PRESETS[s.quality] || QUALITY_PRESETS.medium };
  if (s.custom) Object.assign(base, s.custom);
  return base;
}

export function addCoins(n) { const p = getProfile(); p.coins = Math.max(0, (p.coins | 0) + n); saveProfile(); bus.emit('coins', p.coins); }

export function unlockAchievement(id) {
  const p = getProfile();
  if (p.achievements[id]) return false;
  p.achievements[id] = Date.now();
  saveProfile();
  bus.emit('achievement', id);
  return true;
}

export function setCheckpoint(cp) { const p = getProfile(); p.progress.checkpoint = cp; saveProfile(); }
export function clearCheckpoint() { const p = getProfile(); p.progress.checkpoint = null; saveProfile(); }
