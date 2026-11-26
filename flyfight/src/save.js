const KEY = 'flyfight_save_v1';
const def = () => ({
  credits: 5000, owned: ['mig29'], selected: 'mig29', paints: {}, ownedPaints: {},
  mission: 1, done: [], claimed: [],
  stats: { kills: 0, deaths: 0, wins: 0, losses: 0, ground: 0, gunKills: 0, missileKills: 0, shots: 0, hits: 0, missiles: 0, missions: 0, flightTime: 0, battles: 0, earned: 0, best: 0 },
  settings: { quality: -1, sens: 1, invert: false, assist: true, gyro: false, camera: 'chase', volume: 0.8, music: 0.5, hud: 1, adaptive: true, fpsShow: false, lang: 'ru' },
});
export const save = (() => {
  let d = def();
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) { const b = def(); const st = Object.assign({}, b.stats, s.stats || {}), se = Object.assign({}, b.settings, s.settings || {}); d = Object.assign(b, s); d.stats = st; d.settings = se; } } catch (e) {}
  return d;
})();
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
export function resetSave() { const d = def(); for (const k in save) delete save[k]; Object.assign(save, d); persist(); }
