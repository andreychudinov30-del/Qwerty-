// Settings + savegame (localStorage)
const SKEY = 'osg_settings_v1', GKEY = 'osg_save_v1';

export const PRESETS = {
  low: { name: 'Низкое', dprCap: 1, res: 0.7, shadows: 0, post: false, bloom: false, msaa: 0, ao: false, peds: 22, cars: 16, view: 520, trees: 0.45, grass: false, clouds: false, reflections: false },
  medium: { name: 'Среднее', dprCap: 1.25, res: 0.85, shadows: 1024, post: true, bloom: true, msaa: 0, ao: false, peds: 36, cars: 26, view: 800, trees: 0.7, grass: false, clouds: true, reflections: false },
  high: { name: 'Высокое', dprCap: 1.75, res: 1, shadows: 2048, post: true, bloom: true, msaa: 4, ao: false, peds: 55, cars: 38, view: 1150, trees: 1, grass: true, clouds: true, reflections: true },
  ultra: { name: 'Ультра', dprCap: 2, res: 1, shadows: 4096, post: true, bloom: true, msaa: 4, ao: true, peds: 75, cars: 50, view: 1600, trees: 1, grass: true, clouds: true, reflections: true },
};

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

const DEFAULT_SETTINGS = {
  quality: isMobile ? 'low' : 'high',
  fov: 62, sens: 1, invertY: false,
  master: 0.8, music: 0.5, sfx: 0.9, radio: true,
  adaptive: true, subtitles: true,
  touch: { scale: 1, opacity: 0.55, left: false, layout: {} },
};

function load(k, d) {
  try { const s = localStorage.getItem(k); if (s) return Object.assign(structuredClone(d), JSON.parse(s)); } catch (e) { /* storage blocked */ }
  return structuredClone(d);
}

export const settings = load(SKEY, DEFAULT_SETTINGS);
export const IS_MOBILE = isMobile;
export function saveSettings() { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* ignore */ } }
export function quality() { return PRESETS[settings.quality] || PRESETS.medium; }

export const NEW_GAME = () => ({
  v: 1, money: 500, mission: 0, flags: {}, karma: 0,
  cars: ['rust'], // owned vehicle ids
  props: [], outfit: 0, outfits: [0],
  weapons: { fists: 1 }, ammo: {}, armor: 0,
  pos: null, hour: 9.5, ending: null, stats: { kills: 0, crashes: 0, distance: 0, missions: 0, time: 0 },
  completed: [],
});

export function loadGame() {
  try { const s = localStorage.getItem(GKEY); if (s) return Object.assign(NEW_GAME(), JSON.parse(s)); } catch (e) { /* ignore */ }
  return null;
}
export function hasSave() { try { return !!localStorage.getItem(GKEY); } catch (e) { return false; } }
export function writeGame(state) { try { localStorage.setItem(GKEY, JSON.stringify(state)); return true; } catch (e) { return false; } }
export function wipeGame() { try { localStorage.removeItem(GKEY); } catch (e) { /* ignore */ } }
