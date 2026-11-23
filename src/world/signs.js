// Canvas-generated signage, posters, graffiti and decals (Cyrillic text, aged look).
import * as THREE from 'three';
import { canvasTexture } from '../core/assets.js';
import { mulberry32 } from '../core/util.js';

const cache = new Map();
function grime(g, w, h, rnd, amount = 1) {
  for (let i = 0; i < 40 * amount; i++) {
    const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * w * 0.15;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(30,22,12,${0.08 + rnd() * 0.18})`); gr.addColorStop(1, 'rgba(30,22,12,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 18 * amount; i++) { // drips
    const x = rnd() * w, y = rnd() * h * 0.6, l = 20 + rnd() * h * 0.5;
    g.fillStyle = `rgba(40,30,18,${0.05 + rnd() * 0.12})`; g.fillRect(x, y, 1 + rnd() * 3, l);
  }
}
function scratches(g, w, h, rnd) {
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 30; i++) { g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 20); g.stroke(); }
}

export function stationNameTexture(name) {
  const k = 'st_' + name;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(name.length * 77);
  const t = canvasTexture(1024, 192, (g, w, h) => {
    g.fillStyle = '#d9d2c2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1a17'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#d6cfbd';
    g.font = 'bold 120px Oswald, "Arial Narrow", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name.toUpperCase(), w / 2, h / 2 + 6);
    grime(g, w, h, rnd, 1.4); scratches(g, w, h, rnd);
  });
  cache.set(k, t);
  return t;
}

const POSTERS = [
  { title: 'ОСТОРОЖНО!', body: ['НЕ ЗАХОДИТЕ', 'ЗА ОГРАНИЧИТЕЛЬНУЮ', 'ЛИНИЮ'], color: '#b8261a', bg: '#e5dcc3' },
  { title: 'ГРАЖДАНСКАЯ', body: ['ОБОРОНА', 'Укрытие №17', 'вход через вестибюль'], color: '#1f3d6b', bg: '#ddd5bd' },
  { title: 'ПРОПАЛ ЧЕЛОВЕК', body: ['Смирнов А.В.', 'был одет в рабочую', 'куртку МЕТРОСТРОЙ'], color: '#111', bg: '#efe8d6', photo: true },
  { title: 'ВНИМАНИЕ', body: ['Движение поездов', 'прекращено', 'до особого распоряжения'], color: '#a8231a', bg: '#e9e3cf' },
  { title: 'НЕ ШУМИТЕ', body: ['ОНИ СЛЫШАТ', '', ''], color: '#6b0f0a', bg: '#cfc6ad' },
  { title: 'МЕТРОПОЛИТЕН', body: ['схема линий', '', ''], color: '#222', bg: '#ece6d4', map: true },
  { title: 'ПРОПАЛА ГРУППА', body: ['5 человек', 'ушли в тоннель 14.09', 'не вернулись'], color: '#111', bg: '#f0e9d8', photo: true },
  { title: 'ЭВАКУАЦИЯ', body: ['Сбор у гермоворот', 'в 06:00', 'Не опаздывать!'], color: '#1d4a1a', bg: '#e3dcc6' },
];
export function posterTexture(i) {
  const k = 'poster_' + i;
  if (cache.has(k)) return cache.get(k);
  const p = POSTERS[i % POSTERS.length];
  const rnd = mulberry32(i * 911 + 3);
  const t = canvasTexture(256, 360, (g, w, h) => {
    g.fillStyle = p.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = p.color; g.fillRect(10, 10, w - 20, 64);
    g.fillStyle = p.bg; g.font = 'bold 30px Oswald, "Arial Narrow", sans-serif'; g.textAlign = 'center';
    g.fillText(p.title, w / 2, 54);
    if (p.photo) { g.fillStyle = '#555'; g.fillRect(64, 90, 128, 150); g.fillStyle = '#333'; g.beginPath(); g.arc(128, 150, 34, 0, 7); g.fill(); g.fillRect(84, 190, 88, 50); }
    if (p.map) {
      const cols = ['#c22', '#2a2', '#22c', '#c80', '#828'];
      cols.forEach((c, j) => { g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.moveTo(30, 100 + j * 30); g.bezierCurveTo(90, 60 + j * 40, 160, 300 - j * 40, 226, 120 + j * 35); g.stroke(); });
      g.fillStyle = '#fff'; for (let j = 0; j < 14; j++) { g.beginPath(); g.arc(30 + rnd() * 196, 100 + rnd() * 180, 4, 0, 7); g.fill(); }
    }
    g.fillStyle = '#1b1814'; g.font = '22px Rubik, sans-serif';
    p.body.forEach((line, j) => g.fillText(line, w / 2, (p.photo ? 270 : p.map ? 320 : 130) + j * 30));
    grime(g, w, h, rnd, 1.2);
    // torn corner
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(w, h); g.lineTo(w - 30 - rnd() * 60, h); g.lineTo(w, h - 30 - rnd() * 80); g.fill();
    g.globalCompositeOperation = 'source-over';
  });
  cache.set(k, t);
  return t;
}

const GRAFFITI = ['ОНИ СЛЫШАТ', 'НЕ ХОДИ В ТОННЕЛЬ', 'ВЫХОДА НЕТ', 'ТИХО!', 'СВЕТ СПАСЁТ', 'Я ЖДУ ПОЕЗД', 'НЕ СМОТРИ НАЗАД', '→ К ДЕПО', 'МЫ ЗДЕСЬ', 'КОРОЛЕВА ВНИЗУ', '14.09 — КОНЕЦ', 'ПОМОГИТЕ', 'ЛОЖЬ', '217'];
export function graffitiTexture(i) {
  const k = 'graf_' + i;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(i * 1231 + 17);
  const text = GRAFFITI[i % GRAFFITI.length];
  const colors = ['#8b1a12', '#d8d2c0', '#1a1a1a', '#b4451b', '#5c6b2e'];
  const col = colors[i % colors.length];
  const t = canvasTexture(512, 192, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate((rnd() - 0.5) * 0.15);
    g.font = `bold ${text.length > 12 ? 52 : 74}px "Arial Black", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 6;
    g.fillStyle = col; g.globalAlpha = 0.86;
    g.fillText(text, 0, 0);
    g.restore();
    // drips of paint
    g.fillStyle = col; g.globalAlpha = 0.7;
    for (let j = 0; j < 14; j++) { const x = 60 + rnd() * (w - 120), y = h / 2 + 10 + rnd() * 20; g.fillRect(x, y, 2 + rnd() * 2, 10 + rnd() * 50); }
  }, { srgb: true });
  cache.set(k, t);
  return t;
}
export function bloodTexture(i) {
  const k = 'blood_' + i;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(i * 3331 + 5);
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let j = 0; j < 26; j++) {
      const r = 6 + rnd() * 40, x = w / 2 + (rnd() - 0.5) * 120, y = h / 2 + (rnd() - 0.5) * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(60,4,2,0.95)'); gr.addColorStop(0.7, 'rgba(45,3,2,0.8)'); gr.addColorStop(1, 'rgba(40,2,1,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    for (let j = 0; j < 40; j++) { g.fillStyle = 'rgba(55,3,2,0.9)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, rnd() * 3, 0, 7); g.fill(); }
  });
  cache.set(k, t);
  return t;
}
export function crackTexture(i) {
  const k = 'crack_' + i;
  if (cache.has(k)) return cache.get(k);
  const rnd = mulberry32(i * 77 + 9);
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(15,12,10,0.85)';
    const branch = (x, y, a, len, wd) => {
      if (len < 6 || wd < 0.4) return;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y);
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len; g.lineTo(nx, ny); g.stroke();
      branch(nx, ny, a + (rnd() - 0.5) * 0.9, len * 0.8, wd * 0.8);
      if (rnd() < 0.4) branch(nx, ny, a + (rnd() - 0.5) * 2, len * 0.6, wd * 0.6);
    };
    for (let j = 0; j < 4; j++) branch(w / 2, h / 2, rnd() * 6.28, 30, 3);
  });
  cache.set(k, t);
  return t;
}
export function signTexture(text, { bg = '#1d3d1a', fg = '#e7e0cb', w = 512, h = 128, arrow = 0 } = {}) {
  const k = `sign_${text}_${bg}_${arrow}`;
  if (cache.has(k)) return cache.get(k);
  const t = canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = `bold ${Math.floor(h * 0.42)}px Oswald, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2 + (arrow ? 30 * arrow : 0), h / 2 + 3);
    if (arrow) { g.save(); g.translate(arrow > 0 ? w - 50 : 50, h / 2); g.scale(arrow, 1); g.beginPath(); g.moveTo(25, 0); g.lineTo(-10, -22); g.lineTo(-10, 22); g.fill(); g.restore(); }
    grime(g, w, h, mulberry32(text.length * 13), 0.6);
  });
  cache.set(k, t);
  return t;
}

const matCache = new Map();
export function decalMaterial(tex, { emissive = false, rough = 0.85, opacity = 1 } = {}) {
  const k = tex.uuid + emissive + rough + opacity;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, roughness: rough, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity });
  if (emissive) { m.emissive = new THREE.Color(1, 1, 1); m.emissiveMap = tex; m.emissiveIntensity = 0.6; }
  matCache.set(k, m);
  return m;
}
