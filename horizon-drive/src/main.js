import * as THREE from 'three';
import { CARS, CLASSES, TRACKS, MODES, DIFFICULTY, PERF, TIRES, FINISHES, RIMS, SPOILERS, FRONTS, SKIRTS, WIDEBODY, LIVERIES, DECALS, PAINTS, NEONS, HEADLIGHTS, QUALITY } from './data.js';
import { load, save, S, defaultTune, resetSave } from './save.js';
import { loadStudioHDR } from './assets.js';
import { initCarBase, CarVisual } from './carModel.js';
import { Showroom } from './showroom.js';
import { World, timeUniform } from './world.js';
import { buildProps, nightUniform } from './props.js';
import { Atmosphere, WEATHERS } from './sky.js';
import { Vehicle, carParams, collideCars, SpatialGrid } from './physics.js';
import { BotDriver } from './ai.js';
import { Particles, Skids } from './effects.js';
import { Post } from './post.js';
import { initAudio, EngineSound, crash, clickSfx, beep, shiftSfx, setVolume } from './audio.js';
import { clamp, lerp } from './noise.js';

const $ = id => document.getElementById(id);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(innerWidth, innerHeight) < 900);
const fmtT = ms => { if (ms == null || !isFinite(ms)) return '--'; const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
const fmtC = n => Math.round(n).toLocaleString('ru-RU');
const TIPS = ['Отключите ESP и TCS в настройках, чтобы управлять заносом вручную.', 'Гоночный слик даёт максимальное сцепление на асфальте, но плохо работает на грунте и в дождь.', 'Внедорожные шины незаменимы на грунтовых участках Desert Valley.', 'Снижение массы улучшает разгон, торможение и управляемость одновременно.', 'Нажмите C, чтобы переключить камеру: третье лицо, капот, бампер, салон.', 'Дрифт приносит дополнительные очки и монеты в свободном заезде.', 'GT-крыло добавляет прижимную силу на высокой скорости, но увеличивает сопротивление.'];

let renderer, post, showroom, race = null, Q, qIdx, clock = new THREE.Clock(), screen = 'loading', fpsCap = 60, lastFrame = 0, dynPR = 1, ftAvg = 16;
const state = { previewTune: null };

// ---------------- rating helpers ----------------
export function rating(car, t) {
  const p = carParams(car, t); const pw = p.power / p.mass; const tireK = { street: 0, sport: 0.06, race: 0.14, offroad: -0.04 }[t.tires] || 0;
  let pi = 380 + pw * 0.9 + (p.grip + tireK - 0.9) * 600 + (p.brakeT / (p.mass * 9.81 * p.R) - 0.85) * 150 + p.ClA * 40;
  pi = Math.round(clamp(pi, 100, 999)); const cls = pi >= 999 ? 'X' : pi > 900 ? 'S2' : pi > 800 ? 'S1' : pi > 700 ? 'A' : pi > 600 ? 'B' : pi > 500 ? 'C' : 'D';
  const acc = Math.max(car.drive === 'AWD' ? 2.0 : car.drive === 'RWD' ? 2.7 : 3.4, 0.9 + 700 / pw + (car.drive === 'FWD' ? 0.4 : 0));
  const vmax = car.vmax * (1 + PERF.engine.eff[t.engine] * 0.12 + PERF.turbo.eff[t.turbo] * 0.08);
  return { pi, cls, acc, vmax, hp: Math.round(p.power / 745.7), mass: Math.round(p.mass), bars: { speed: clamp((vmax - 150) / 280, 0.05, 1), accel: clamp((9 - acc) / 7.2, 0.05, 1), handling: clamp((p.grip + tireK - 0.8) / 0.6 + (p.k / p.mass - 40) / 400, 0.05, 1), braking: clamp((p.brakeT / (p.mass * 9.81 * p.R) - 0.7) / 0.9, 0.05, 1), launch: clamp((9 - acc) / 7 * (car.drive === 'AWD' ? 1 : 0.85), 0.05, 1), offroad: clamp((car.offroad ? 0.7 : 0.2) + (t.tires === 'offroad' ? 0.3 : 0), 0, 1) } };
}
const classColor = c => ({ D: '#3ab0ff', C: '#ffd000', B: '#ff7b00', A: '#ff2a6d', S1: '#b14cff', S2: '#2b5cff', X: '#22e08a' }[c]);

// ---------------- boot ----------------
async function boot() {
  load(); const set = S().settings;
  qIdx = set.quality >= 0 ? set.quality : (isMobile ? 1 : 3); Q = { ...QUALITY[qIdx] };
  applyQualityOverrides();
  $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  dynPR = Math.min(window.devicePixelRatio, Q.pr * set.resScale); renderer.setPixelRatio(dynPR); renderer.setSize(innerWidth, innerHeight);
  progress(0.1, 'Распаковка 3D-модели автомобиля (Draco)…');
  await initCarBase(); progress(0.5, 'HDR-освещение студии…');
  const hdr = await loadStudioHDR(); progress(0.7, 'Сборка шоурума…');
  showroom = new Showroom(renderer, hdr, Q);
  post = new Post(renderer, showroom.scene, showroom.camera, Q);
  progress(0.9, 'Подготовка автомобиля…'); setCarPreview();
  await new Promise(r => setTimeout(r, 50));
  progress(1, 'Готово');
  window.addEventListener('resize', onResize); onResize();
  setupInput(); setVolume(set.volume, set.sfx);
  $('loading').classList.add('hidden'); showMenu();
  requestAnimationFrame(loop);
  document.addEventListener('pointerdown', () => initAudio(), { once: false });
  document.addEventListener('keydown', () => initAudio());
  document.addEventListener('visibilitychange', () => { if (document.hidden && race && race.state === 'race') pauseRace(true); });
}
function applyQualityOverrides() { const s = S().settings; Q.draw *= s.drawDist; Q.trees *= s.effects >= 0.5 ? 1 : 0.7; if (!s.shadows) Q.shadow = 0; Q.mblur = Q.mblur && s.mblur; fpsCap = s.fpsCap; }
function progress(f, txt) { $('loadBar').style.width = (f * 100) + '%'; if (txt) $('loadTxt').textContent = txt; }
function onResize() {
  renderer.setSize(innerWidth, innerHeight); const a = innerWidth / innerHeight;
  showroom.camera.aspect = a; showroom.camera.updateProjectionMatrix(); if (race) { race.camera.aspect = a; race.camera.updateProjectionMatrix(); }
  post.resize(); $('rotate').classList.toggle('need', isMobile);
  showroom.target.x = innerWidth > 700 && !['menu'].includes(screen) && screen !== 'race' ? -1.1 : 0;
}
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toast.t); toast.t = setTimeout(() => el.style.opacity = 0, 2200); }
function coinsUI() { $('coins').querySelector('b').textContent = fmtC(S().coins); }

// ---------------- showroom preview ----------------
function setCarPreview(carId = S().selected, tune = null) {
  const car = CARS.find(c => c.id === carId); const t = tune || S().owned[carId] || defaultTune(car);
  const v = showroom.setCar(car, t); const r = rating(car, t);
  const tag = $('carTag'); tag.querySelector('.cl').textContent = CLASSES[car.cls].toUpperCase() + ' • ' + car.drive + ' • ' + r.hp + ' Л.С.';
  tag.querySelector('.nm').innerHTML = `${car.name}<span class="pi" style="background:${classColor(r.cls)}">${r.cls} ${r.pi}</span>`;
  return v;
}

// ---------------- screens ----------------
function hideAll() { for (const id of ['menu', 'panel', 'hud', 'touch', 'back']) $(id).classList.add('hidden'); $('ov').classList.add('hidden'); }
function showMenu() {
  screen = 'menu'; hideAll(); $('menu').classList.remove('hidden'); $('coins').classList.remove('hidden'); coinsUI(); showroom.auto = true; showroom.target.x = 0; showroom.dist = 8.5; setCarPreview();
  post.setScene(showroom.scene, showroom.camera); if (post.ao) post.ao.enabled = true;
  const items = [['Играть', () => trackScreen()], ['Гараж', () => garageScreen()], ['Магазин', () => shopScreen()], ['Тюнинг', () => tuneScreen()], ['Выбор трассы', () => trackScreen()], ['Настройки', () => settingsScreen()], ['Статистика', () => statsScreen()]];
  const mb = $('mbtns'); mb.innerHTML = '';
  items.forEach(([t, f], i) => { const b = document.createElement('button'); b.className = 'mbtn it'; b.style.animationDelay = (i * 0.05) + 's'; b.innerHTML = `<span>${t}</span>`; b.onclick = () => { clickSfx(); f(); }; mb.appendChild(b); });
}
function openPanel(title, html, opts = {}) {
  screen = opts.screen || 'panel'; hideAll(); $('coins').classList.remove('hidden'); $('back').classList.remove('hidden'); $('back').onclick = () => { clickSfx(); state.previewTune = null; (opts.onBack || showMenu)(); };
  const p = $('panel'); p.classList.remove('hidden'); p.innerHTML = `<h2 class="it">${title}</h2>` + html; p.scrollTop = 0;
  showroom.auto = !!opts.auto; showroom.target.x = innerWidth > 700 ? -1.1 : 0; return p;
}
function statBars(car, t, base) {
  const r = rating(car, t), b0 = base ? rating(car, base).bars : null; const names = { speed: 'Скорость', accel: 'Разгон', handling: 'Управляемость', braking: 'Торможение', launch: 'Старт', offroad: 'Бездорожье' };
  return `<div class="stats">${Object.entries(r.bars).map(([k, v]) => `<div class="st"><span>${names[k]}</span><div class="b"><i class="${b0 && v > b0[k] + 0.005 ? 'up' : ''}" style="width:${v * 100}%"></i></div><span>${(v * 10).toFixed(1)}</span></div>`).join('')}</div>
    <div class="row"><label>Мощность</label><b>${r.hp} л.с.</b></div><div class="row"><label>Масса</label><b>${r.mass} кг</b></div><div class="row"><label>0–100 км/ч</label><b>${r.acc.toFixed(1)} с</b></div><div class="row"><label>Макс. скорость</label><b>${Math.round(r.vmax)} км/ч</b></div><div class="row"><label>Привод / КПП</label><b>${car.drive} / ${car.ev ? '1 ст.' : car.gears + ' ст.'}</b></div><div class="row"><label>Класс</label><b style="color:${classColor(r.cls)}">${r.cls} ${r.pi}</b></div>`;
}
function garageScreen() {
  const owned = Object.keys(S().owned);
  const p = openPanel('Гараж', `<div class="list" id="gl"></div><div id="gs"></div><div id="buyBar"><button class="btn" id="gsel">Выбрать</button> <button class="btn g" id="gtune">Тюнинг</button></div>`, { auto: false });
  let cur = S().selected; const draw = () => {
    $('gl').innerHTML = owned.map(id => { const c = CARS.find(x => x.id === id), r = rating(c, S().owned[id]); return `<div class="item ${id === cur ? 'on' : ''}" data-id="${id}"><span>${c.name}</span><span style="color:${classColor(r.cls)};font-weight:800">${r.cls} ${r.pi}</span></div>`; }).join('');
    $('gl').querySelectorAll('.item').forEach(el => el.onclick = () => { cur = el.dataset.id; setCarPreview(cur); draw(); clickSfx(); });
    const c = CARS.find(x => x.id === cur); $('gs').innerHTML = `<div class="sec">${CLASSES[c.cls]}</div>` + statBars(c, S().owned[cur]);
    $('gsel').textContent = cur === S().selected ? 'Выбрано ✓' : 'Выбрать';
  };
  $('gsel').onclick = () => { S().selected = cur; save(); draw(); toast('Автомобиль выбран: ' + CARS.find(x => x.id === cur).name); };
  $('gtune').onclick = () => { S().selected = cur; save(); tuneScreen(); };
  setCarPreview(cur); draw();
}
function shopScreen() {
  let cur = CARS.find(c => !S().owned[c.id])?.id || CARS[0].id; let filter = 'all';
  const p = openPanel('Магазин', `<div class="tabs" id="sf"></div><div class="list" id="sl"></div><div id="ss"></div><div id="buyBar"><button class="btn" id="sbuy"></button></div>`, { auto: true });
  const draw = () => {
    $('sf').innerHTML = [['all', 'Все'], ...Object.entries(CLASSES)].map(([k, n]) => `<button class="tab ${k === filter ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
    $('sf').querySelectorAll('.tab').forEach(el => el.onclick = () => { filter = el.dataset.k; draw(); });
    $('sl').innerHTML = CARS.filter(c => filter === 'all' || c.cls === filter).map(c => { const r = rating(c, defaultTune(c)); return `<div class="item ${c.id === cur ? 'on' : ''}" data-id="${c.id}"><span>${c.name} <small style="color:${classColor(r.cls)}">${r.cls} ${r.pi}</small></span>${S().owned[c.id] ? '<span class="own">В гараже</span>' : `<span class="pr">₵ ${fmtC(c.price)}</span>`}</div>`; }).join('');
    $('sl').querySelectorAll('.item').forEach(el => el.onclick = () => { cur = el.dataset.id; setCarPreview(cur, S().owned[cur] || defaultTune(CARS.find(x => x.id === cur))); draw(); clickSfx(); });
    const c = CARS.find(x => x.id === cur); $('ss').innerHTML = `<div class="sec">${CLASSES[c.cls]} • ${c.cyl ? c.cyl + ' цил.' : 'электро'} ${c.turbo > 0 ? '• турбо' : ''}</div>` + statBars(c, S().owned[cur] || defaultTune(c));
    const b = $('sbuy'); if (S().owned[cur]) { b.textContent = 'Уже в гараже'; b.disabled = true; } else { b.textContent = `Купить за ₵ ${fmtC(c.price)}`; b.disabled = S().coins < c.price; }
  };
  $('sbuy').onclick = () => { const c = CARS.find(x => x.id === cur); if (S().owned[c.id] || S().coins < c.price) return; S().coins -= c.price; S().owned[c.id] = defaultTune(c); S().selected = c.id; save(); coinsUI(); beep(990, 0.25); toast('Куплено: ' + c.name); draw(); };
  setCarPreview(cur, S().owned[cur] || defaultTune(CARS.find(x => x.id === cur))); draw();
}

// tuning
function tuneScreen(tab = 'paint') {
  const id = S().selected, car = CARS.find(c => c.id === id), T = S().owned[id];
  const p = openPanel('Тюнинг: ' + car.name, `<div class="tabs" id="tt"></div><div id="tc"></div><div class="sec">Характеристики</div><div id="tst"></div><div id="buyBar"></div>`, { auto: false, onBack: () => { setCarPreview(); showMenu(); } });
  showroom.dist = 7.5;
  const tabs = { paint: 'Покраска', wheels: 'Диски', body: 'Обвес', livery: 'Винилы', lights: 'Стекло и свет', perf: 'Двигатель', chassis: 'Шасси', tune: 'Настройка' };
  const ownedItem = (k, v, price) => price === 0 || T.owned.items[k + ':' + v] || T[k] === v;
  let preview = null; // {k, v, price}
  const vis = setCarPreview(id, T);
  const applyPreview = () => { const t = JSON.parse(JSON.stringify(T)); if (preview) t[preview.k] = preview.v; vis.applyTune(t); $('tst').innerHTML = statBars(car, t, T); buyBar(); };
  const buyBar = () => {
    const bb = $('buyBar'); if (!preview) { bb.innerHTML = ''; return; }
    bb.innerHTML = `<button class="btn" id="tbuy" ${S().coins < preview.price ? 'disabled' : ''}>Купить за ₵ ${fmtC(preview.price)}</button> <button class="btn g" id="tcancel">Отмена</button>`;
    $('tbuy').onclick = () => { if (S().coins < preview.price) return; S().coins -= preview.price; T.owned.items[preview.k + ':' + preview.v] = true; if (preview.k === 'tires') T.owned.tires[preview.v] = true; T[preview.k] = preview.v; preview = null; save(); coinsUI(); beep(990, 0.2); toast('Установлено'); draw(); applyPreview(); };
    $('tcancel').onclick = () => { preview = null; draw(); applyPreview(); };
  };
  const pick = (k, v, price) => { clickSfx(); if (ownedItem(k, v, price)) { T[k] = v; preview = null; save(); } else preview = { k, v, price }; draw(); applyPreview(); };
  const listOf = (k, dict) => `<div class="list">${Object.entries(dict).map(([v, [n, price]]) => { const cur = (preview && preview.k === k ? preview.v : T[k]) === v; const own = ownedItem(k, v, price); return `<div class="item ${cur ? 'on' : ''}" data-k="${k}" data-v="${v}" data-p="${price}"><span>${n}</span>${own ? (T[k] === v ? '<span class="own">Установлено</span>' : '<span class="own">Куплено</span>') : `<span class="pr">₵ ${fmtC(price)}</span>`}</div>`; }).join('')}</div>`;
  const swatch = (k, cols, price = 0) => `<div class="sw">${cols.map(c => `<i class="${T[k] === c ? 'on' : ''}" data-k="${k}" data-c="${c}" style="background:${c}"></i>`).join('')}<input type="color" data-k="${k}" value="${T[k] || '#ffffff'}" style="height:34px;width:100%;border:none;background:none"></div>`;
  const slider = (k, label, min, max, step, fmt = v => v) => `<div class="row"><label>${label}</label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${T[k]}"><b data-out="${k}">${fmt(T[k])}</b></div>`;
  const perfRow = k => { const P = PERF[k]; return `<div class="sec">${P.name} — ${P.desc}</div><div class="list">${P.levels.map((n, i) => { const own = i <= T[k] || T.owned.items[k + ':' + i]; return `<div class="item ${T[k] === i ? 'on' : ''}" data-perf="${k}" data-v="${i}" data-p="${P.price[i]}"><span>${n}</span>${own ? (T[k] === i ? '<span class="own">Установлено</span>' : '<span class="own">Куплено</span>') : `<span class="pr">₵ ${fmtC(P.price[i])}</span>`}</div>`; }).join('')}</div>`; };
  function draw() {
    $('tt').innerHTML = Object.entries(tabs).map(([k, n]) => `<button class="tab ${k === tab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('');
    $('tt').querySelectorAll('.tab').forEach(el => el.onclick = () => { tab = el.dataset.t; preview = null; applyPreview(); draw(); camFor(tab); });
    let h = '';
    if (tab === 'paint') h = `<div class="sec">Цвет кузова (₵ 500 за смену)</div>${swatch('paint', PAINTS)}<div class="sec">Тип покрытия</div>${listOf('finish', FINISHES)}<div class="sec">Второй цвет (двухцветная окраска)</div>${swatch('paint2', PAINTS)}`;
    if (tab === 'wheels') h = `<div class="sec">Диски</div>${listOf('rim', RIMS)}<div class="sec">Цвет дисков</div>${swatch('rimColor', ['#c9ccd1', '#2a2d31', '#0b0d10', '#b58b2a', '#d4d6d8', '#7a1a1a', '#1e5fbf', '#f4c20d'])}${slider('rimSize', 'Размер дисков', 0.9, 1.1, 0.01, v => Math.round(18 + (v - 1) * 40) + '″')}`;
    if (tab === 'body') h = `<div class="sec">Спойлер</div>${listOf('spoiler', SPOILERS)}<div class="sec">Передний бампер</div>${listOf('front', FRONTS)}<div class="sec">Пороги</div>${listOf('skirts', SKIRTS)}<div class="sec">Арки</div>${listOf('widebody', WIDEBODY)}${slider('ride', 'Клиренс', -1, 1.5, 0.05, v => (v > 0 ? '+' : '') + Math.round(v * 100) + ' мм')}`;
    if (tab === 'livery') h = `<div class="sec">Ливрея / винил</div>${listOf('livery', LIVERIES)}<div class="sec">Цвет винила</div>${swatch('liveryColor', PAINTS)}<div class="sec">Наклейки</div>${listOf('decal', DECALS)}${slider('number', 'Гоночный номер', 1, 99, 1)}`;
    if (tab === 'lights') h = `${slider('tint', 'Тонировка', 0, 1, 0.05, v => Math.round(v * 100) + '%')}<div class="sec">Цвет фар</div>${swatch('headlight', HEADLIGHTS)}<div class="sec">Подсветка днища (₵ 2500)</div><div class="sw"><i data-k="neon" data-c="" class="${!T.neon ? 'on' : ''}" style="background:repeating-linear-gradient(45deg,#333 0 4px,#111 4px 8px)"></i>${NEONS.map(c => `<i class="${T.neon === c ? 'on' : ''}" data-k="neon" data-c="${c}" style="background:${c}"></i>`).join('')}</div>`;
    if (tab === 'perf') h = ['engine', 'turbo', 'transmission', 'weight'].map(perfRow).join('');
    if (tab === 'chassis') h = ['brakes', 'suspension'].map(perfRow).join('') + `<div class="sec">Шины</div><div class="list">${Object.entries(TIRES).map(([k, t]) => { const own = T.owned.tires[k] || t.price === 0; return `<div class="item ${T.tires === k ? 'on' : ''}" data-tire="${k}" data-p="${t.price}"><span>${t.name}</span>${own ? (T.tires === k ? '<span class="own">Установлено</span>' : '<span class="own">Куплено</span>') : `<span class="pr">₵ ${fmtC(t.price)}</span>`}</div>`; }).join('')}</div>`;
    if (tab === 'tune') h = (T.transmission > 0 ? slider('finalDrive', 'Главная пара', 0.8, 1.25, 0.01, v => v.toFixed(2)) : '<div class="row"><label>Главная пара</label><span class="lock">нужна КПП Street+</span></div>') + (T.suspension > 0 ? slider('stiffness', 'Жёсткость подвески', 0.7, 1.4, 0.01, v => v.toFixed(2)) : '<div class="row"><label>Жёсткость</label><span class="lock">нужна подвеска Street+</span></div>') + (T.brakes > 0 ? slider('brakeBias', 'Баланс тормозов (перед)', 0.45, 0.75, 0.01, v => Math.round(v * 100) + '%') : '<div class="row"><label>Баланс тормозов</label><span class="lock">нужны тормоза Street+</span></div>') + slider('ride', 'Клиренс', -1, 1.5, 0.05, v => (v > 0 ? '+' : '') + Math.round(v * 100) + ' мм');
    const tc = $('tc'); tc.innerHTML = h;
    tc.querySelectorAll('.item[data-k]').forEach(el => el.onclick = () => pick(el.dataset.k, el.dataset.v, +el.dataset.p));
    tc.querySelectorAll('.item[data-perf]').forEach(el => el.onclick = () => { const k = el.dataset.perf, v = +el.dataset.v; const own = v <= T[k] || T.owned.items[k + ':' + v]; if (own) { T[k] = v; save(); preview = null; } else preview = { k, v, price: +el.dataset.p }; draw(); applyPreview(); });
    tc.querySelectorAll('.item[data-tire]').forEach(el => el.onclick = () => { const k = el.dataset.tire; if (T.owned.tires[k] || TIRES[k].price === 0) { T.tires = k; save(); preview = null; } else preview = { k: 'tires', v: k, price: TIRES[k].price }; draw(); applyPreview(); });
    tc.querySelectorAll('.sw i').forEach(el => el.onclick = () => { const k = el.dataset.k, c = el.dataset.c || null; const price = k === 'paint' ? 500 : k === 'neon' ? (c ? 2500 : 0) : k === 'paint2' || k === 'liveryColor' ? 300 : 200; if (T[k] === c) return; if (S().coins < price) { toast('Недостаточно монет'); return; } S().coins -= price; T[k] = c; save(); coinsUI(); clickSfx(); draw(); applyPreview(); });
    tc.querySelectorAll('input[type=color]').forEach(el => el.onchange = () => { const k = el.dataset.k; const price = k === 'paint' ? 500 : 300; if (S().coins < price) { toast('Недостаточно монет'); return; } S().coins -= price; T[k] = el.value; save(); coinsUI(); draw(); applyPreview(); });
    tc.querySelectorAll('input[type=range]').forEach(el => { el.oninput = () => { const k = el.dataset.k; T[k] = parseFloat(el.value); const o = tc.querySelector(`[data-out="${k}"]`); if (o) o.textContent = el.parentElement.querySelector('b').textContent; applyPreview(); }; el.onchange = () => { save(); draw(); }; });
    buyBar();
  }
  const camFor = t => { const m = { paint: [0.7, 0.2, 7.5], wheels: [1.45, 0.05, 4.2], body: [2.6, 0.22, 6.5], livery: [0.9, 0.5, 7], lights: [0.15, 0.12, 6], perf: [2.8, 0.3, 6.5], chassis: [1.5, 0.02, 5], tune: [1.2, 0.15, 7] }[t]; showroom.yaw = m[0]; showroom.pitch = m[1]; showroom.dist = m[2]; };
  draw(); applyPreview(); camFor(tab);
}
function trackScreen() {
  let tr = S().lastTrack || 'mountain', mode = S().lastMode || 'race';
  const set = S().settings;
  const p = openPanel('Выбор трассы', `<div id="trl"></div><div class="sec">Режим</div><div class="list" id="mdl"></div><div class="sec">Условия</div>
    <div class="row"><label>Сложность ботов</label><select id="sdiff">${DIFFICULTY.map((d, i) => `<option value="${i}" ${set.difficulty === i ? 'selected' : ''}>${d.name}</option>`).join('')}</select></div>
    <div class="row"><label>Время суток</label><select id="stod">${[['dynamic', 'Динамическое'], ['morning', 'Утро'], ['noon', 'День'], ['sunset', 'Закат'], ['night', 'Ночь']].map(([k, n]) => `<option value="${k}" ${set.timeOfDay === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="row"><label>Погода</label><select id="swth"><option value="random">Случайная</option>${Object.entries(WEATHERS).map(([k, n]) => `<option value="${k}" ${set.weather === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div id="rec"></div><div id="buyBar"><button class="btn" id="go">Старт ▶</button></div>`, { auto: true });
  const draw = () => {
    $('trl').innerHTML = TRACKS.map(t => `<div class="card ${t.id === tr ? 'on' : ''}" data-id="${t.id}"><b>${t.name}</b><p>${t.desc} • ${t.laps} круга</p></div>`).join('');
    $('trl').querySelectorAll('.card').forEach(el => el.onclick = () => { tr = el.dataset.id; draw(); clickSfx(); });
    $('mdl').innerHTML = Object.entries(MODES).map(([k, n]) => `<div class="item ${k === mode ? 'on' : ''}" data-m="${k}"><span>${n}</span></div>`).join('');
    $('mdl').querySelectorAll('.item').forEach(el => el.onclick = () => { mode = el.dataset.m; draw(); clickSfx(); });
    const r = S().records[tr] || {}; $('rec').innerHTML = `<div class="sec">Рекорды</div><div class="row"><label>Лучший круг</label><b>${fmtT(r.lap)} ${r.lapCar ? '· ' + r.lapCar : ''}</b></div><div class="row"><label>Лучшая гонка</label><b>${fmtT(r.race)} ${r.raceCar ? '· ' + r.raceCar : ''}</b></div>`;
  };
  $('go').onclick = () => { set.difficulty = +$('sdiff').value; set.timeOfDay = $('stod').value; set.weather = $('swth').value; S().lastTrack = tr; S().lastMode = mode; save(); startRace(tr, mode); };
  draw();
}
function settingsScreen(fromPause = false) {
  const s = S().settings;
  const sel = (k, label, opts) => `<div class="row"><label>${label}</label><select data-k="${k}">${opts.map(([v, n]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
  const rng = (k, label, min, max, step) => `<div class="row"><label>${label}</label><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"></div>`;
  const chk = (k, label) => sel(k, label, [[true, 'Вкл'], [false, 'Выкл']]);
  const html = `<div class="sec">Графика</div>${sel('quality', 'Качество графики', [[-1, 'Авто (' + QUALITY[isMobile ? 1 : 3].name + ')'], ...QUALITY.map((q, i) => [i, q.name])])}${rng('resScale', 'Разрешение рендера', 0.5, 1.25, 0.05)}${chk('shadows', 'Тени')}${rng('drawDist', 'Дальность прорисовки', 0.5, 1.5, 0.05)}${rng('effects', 'Эффекты (частицы, растительность)', 0.3, 1, 0.05)}${chk('mblur', 'Размытие в движении')}${sel('fpsCap', 'Ограничение FPS', [[30, '30'], [60, '60'], [120, '120'], [0, 'Без ограничения']])}${chk('showFps', 'Показывать FPS')}
    <div class="sec">Звук</div>${rng('volume', 'Общая громкость', 0, 1, 0.05)}${rng('sfx', 'Эффекты и двигатель', 0, 1, 0.05)}
    <div class="sec">Управление</div>${rng('sens', 'Чувствительность руля', 0.5, 1.6, 0.05)}${sel('gearbox', 'Коробка передач', [['auto', 'Автоматическая'], ['manual', 'Механическая']])}${chk('abs', 'ABS')}${chk('tcs', 'Антипробуксовка (TCS)')}${chk('esp', 'Стабилизация (ESP)')}${sel('camera', 'Камера по умолчанию', [[0, 'Третье лицо'], [1, 'Третье лицо (дальняя)'], [2, 'Капот'], [3, 'Бампер'], [4, 'Салон']])}${sel('units', 'Единицы', [['kmh', 'км/ч'], ['mph', 'mph']])}
    <div class="sec">Сенсорное управление</div>${rng('btnSize', 'Размер кнопок', 0.7, 1.5, 0.05)}${sel('btnLayout', 'Расположение кнопок', [['classic', 'Классика: руль слева, педали справа'], ['swap', 'Зеркально: педали слева'], ['split', 'Раздельно: газ/тормоз по краям']])}${chk('tilt', 'Руление наклоном')}
    <div class="sec">Игра</div>${sel('difficulty', 'Сложность ботов', DIFFICULTY.map((d, i) => [i, d.name]))}<br><button class="btn g" id="reset">Сбросить прогресс</button>`;
  const p = openPanel('Настройки', html, { auto: true, onBack: fromPause ? () => { hideAll(); $('hud').classList.remove('hidden'); if (isMobile) $('touch').classList.remove('hidden'); screen = 'race'; pauseRace(true); } : showMenu });
  p.querySelectorAll('select,input').forEach(el => el.onchange = el.oninput = () => {
    const k = el.dataset.k; if (!k) return; let v = el.value; if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(parseFloat(v)) && k !== 'units' && k !== 'gearbox' && k !== 'btnLayout') v = parseFloat(v);
    const old = s[k]; s[k] = v; save();
    if (k === 'volume' || k === 'sfx') setVolume(s.volume, s.sfx);
    if (k === 'showFps') $('fps').classList.toggle('hidden', !v);
    if (k === 'fpsCap') fpsCap = v;
    if (['quality', 'resScale', 'shadows', 'drawDist', 'effects', 'mblur'].includes(k) && old !== v) { qIdx = s.quality >= 0 ? s.quality : (isMobile ? 1 : 3); Q = { ...QUALITY[qIdx] }; applyQualityOverrides(); dynPR = Math.min(window.devicePixelRatio, Q.pr * s.resScale); renderer.setPixelRatio(dynPR); rebuildPost(); toast('Применится полностью при следующем заезде'); }
    if (race) race.applySettings();
  });
  $('reset').onclick = () => { if (confirm('Сбросить весь прогресс?')) { resetSave(); load(); coinsUI(); setCarPreview(); toast('Прогресс сброшен'); } };
}
function rebuildPost() { const sc = race ? race.scene : showroom.scene, cam = race ? race.camera : showroom.camera; post = new Post(renderer, sc, cam, Q); if (race && post.ao) post.ao.enabled = false; onResize(); }
function statsScreen() {
  const st = S().stats; const rows = [['Гонок', st.races], ['Побед', st.wins], ['Подиумов', st.podiums], ['Пройдено', (st.distance / 1000).toFixed(1) + ' км'], ['Макс. скорость', Math.round(st.topSpeed * 3.6) + ' км/ч'], ['Заработано', '₵ ' + fmtC(st.earned)], ['Очки дрифта', fmtC(st.drift)], ['Время в игре', Math.round(st.time / 60) + ' мин'], ['Автомобилей', Object.keys(S().owned).length + ' / ' + CARS.length]];
  const recs = TRACKS.map(t => { const r = S().records[t.id] || {}; return `<div class="card"><b>${t.name}</b><p>Круг: ${fmtT(r.lap)} ${r.lapCar || ''}<br>Гонка: ${fmtT(r.race)} ${r.raceCar || ''}</p></div>`; }).join('');
  openPanel('Статистика', rows.map(([a, b]) => `<div class="row"><label>${a}</label><b>${b}</b></div>`).join('') + '<div class="sec">Рекорды трасс</div>' + recs, { auto: true });
}

// ---------------- input ----------------
const keys = {}; const touch = { left: 0, right: 0, gas: 0, brake: 0, hb: 0 }; let tilt = 0; const edge = { up: false, down: false, cam: false, reset: false };
function setupInput() {
  addEventListener('keydown', e => {
    if (e.repeat) return; keys[e.code] = true;
    if (race && screen === 'race') { if (e.code === 'KeyC') race.cycleCam(); if (e.code === 'KeyR') race.resetPlayer(); if (e.code === 'Escape' || e.code === 'KeyP') pauseRace(race.state !== 'paused'); if (['ShiftLeft', 'ShiftRight', 'KeyE'].includes(e.code)) edge.up = true; if (['ControlLeft', 'ControlRight', 'KeyQ'].includes(e.code)) edge.down = true; }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  addEventListener('deviceorientation', e => { if (e.gamma == null) return; const land = (window.screen.orientation ? window.screen.orientation.angle : window.orientation) || 0; const v = land === 90 ? e.beta : land === -90 || land === 270 ? -e.beta : e.gamma; tilt = clamp(v / 25, -1, 1); });
  // orbit controls in showroom
  let drag = null, pinch = 0;
  const cv = $('gl');
  cv.addEventListener('pointerdown', e => { if (screen === 'race') return; drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; showroom.auto = false; });
  addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; showroom.yaw -= (e.clientX - drag.x) * 0.006; showroom.pitch = clamp(showroom.pitch + (e.clientY - drag.y) * 0.004, 0.0, 1.2); drag.x = e.clientX; drag.y = e.clientY; });
  addEventListener('pointerup', () => drag = null);
  cv.addEventListener('wheel', e => { if (screen === 'race') return; showroom.dist = clamp(showroom.dist + e.deltaY * 0.005, 3.2, 14); }, { passive: true });
  cv.addEventListener('touchmove', e => { if (screen === 'race' || e.touches.length !== 2) return; const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pinch) showroom.dist = clamp(showroom.dist - (d - pinch) * 0.02, 3.2, 14); pinch = d; drag = null; }, { passive: true });
  cv.addEventListener('touchend', () => pinch = 0);
}
function buildTouch() {
  const s = S().settings, el = $('touch'); el.innerHTML = ''; document.documentElement.style.setProperty('--btn', s.btnSize);
  const z = s.btnSize, B = (id, txt, css, cls = '') => { const b = document.createElement('div'); b.className = 'tb ' + cls; b.id = id; b.innerHTML = txt; Object.assign(b.style, css); el.appendChild(b); return b; };
  const u = v => (v * z) + 'px'; const L = s.btnLayout;
  const steerSide = L === 'swap' ? 'right' : 'left', pedalSide = L === 'swap' ? 'left' : 'right';
  if (!s.tilt) { B('tL', '◀', { [steerSide]: u(24), bottom: u(28), width: u(92), height: u(92) }); B('tR', '▶', { [steerSide]: u(132), bottom: u(28), width: u(92), height: u(92) }); }
  if (L === 'split') { B('tG', 'ГАЗ', { right: u(20), bottom: u(28), width: u(86), height: u(130) }, 'pedal'); B('tB', 'ТОРМ', { left: u(s.tilt ? 20 : 236), bottom: u(28), width: u(86), height: u(110) }, 'pedal'); B('tH', 'РУЧН', { right: u(116), bottom: u(28), width: u(70), height: u(70) }); }
  else { B('tG', 'ГАЗ', { [pedalSide]: u(20), bottom: u(28), width: u(86), height: u(130) }, 'pedal'); B('tB', 'ТОРМ', { [pedalSide]: u(116), bottom: u(28), width: u(86), height: u(100) }, 'pedal'); B('tH', 'РУЧН', { [pedalSide]: u(116), bottom: u(140), width: u(70), height: u(64) }); }
  B('tC', '🎥', { [pedalSide]: u(212), bottom: u(28), width: u(54), height: u(54) }); B('tRs', '↺', { [pedalSide]: u(212), bottom: u(90), width: u(54), height: u(54) });
  if (s.gearbox === 'manual') { B('tUp', '+', { [pedalSide]: u(20), bottom: u(170), width: u(58), height: u(58) }); B('tDn', '−', { [pedalSide]: u(86), bottom: u(214), width: u(58), height: u(58) }); }
  B('tPause', 'Ⅱ', {});
  const map = { tL: 'left', tR: 'right', tG: 'gas', tB: 'brake', tH: 'hb' };
  for (const b of el.querySelectorAll('.tb')) {
    const set = on => { b.classList.toggle('on', on); if (map[b.id]) touch[map[b.id]] = on ? 1 : 0; };
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); initAudio(); set(true); if (b.id === 'tC') race && race.cycleCam(); if (b.id === 'tRs') race && race.resetPlayer(); if (b.id === 'tUp') edge.up = true; if (b.id === 'tDn') edge.down = true; if (b.id === 'tPause') pauseRace(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  }
}
function readInput() {
  const s = S().settings; const k = keys; let steer = 0, thr = 0, brk = 0, hb = false, digital = true;
  if (k.ArrowLeft || k.KeyA || touch.left) steer += 1; if (k.ArrowRight || k.KeyD || touch.right) steer -= 1;
  if (k.ArrowUp || k.KeyW || touch.gas) thr = 1; if (k.ArrowDown || k.KeyS || touch.brake) brk = 1; if (k.Space || touch.hb) hb = true;
  if (s.tilt && isMobile) { steer = -tilt; digital = false; }
  const gps = navigator.getGamepads ? navigator.getGamepads() : []; for (const gp of gps) { if (!gp) continue; const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.08) { steer = -ax; digital = false; } const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0; if (rt > 0.05) thr = rt; if (lt > 0.05) brk = lt; if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) hb = true; if (gp.buttons[5]?.pressed && !gp._u) edge.up = true; gp._u = gp.buttons[5]?.pressed; if (gp.buttons[4]?.pressed && !gp._d) edge.down = true; gp._d = gp.buttons[4]?.pressed; if (gp.buttons[3]?.pressed && !gp._c) race && race.cycleCam(); gp._c = gp.buttons[3]?.pressed; }
  steer = clamp(steer * s.sens, -1, 1);
  const r = { steer, throttle: thr, brake: brk, handbrake: hb, digital, shiftUp: edge.up, shiftDown: edge.down }; edge.up = edge.down = false; return r;
}

// ---------------- race ----------------
const BOT_NAMES = ['Alex Viper', 'Mila Storm', 'Ken Drift', 'Sofia Blaze', 'Ivan Nitro', 'Lena Apex', 'Marco Turbo', 'Yuki Shift', 'Omar Redline', 'Nina Volt', 'Jack Torque', 'Eva Slip'];
class Race {
  constructor(def, mode) { this.def = def; this.mode = mode; this.state = 'loading'; this.t = 0; this.camMode = S().settings.camera; this.cars = []; this.raceTime = 0; this.drift = { score: 0, combo: 0, t: 0, total: 0 }; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.shake = 0; this.flash = 0; this.tun = 0; }
  async build() {
    const step = async (f, t) => { progress(f, t); await new Promise(r => setTimeout(r, 16)); };
    await step(0.05, 'Генерация трассы ' + this.def.name + '…');
    const scene = this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 12000);
    const w = this.world = new World(this.def, Q); w.genTrack(); await step(0.2, 'Рельеф и ландшафт…'); w.genGrid(); await step(0.35, 'Меш рельефа и PBR-материалы…'); w.buildTerrain(); await step(0.5, 'Дорога, разметка, ограждения, мосты и тоннели…'); w.buildRoad(); w.buildStructures(); scene.add(w.group);
    await step(0.62, 'Растительность, здания, объекты…'); this.props = buildProps(w, Q); scene.add(this.props.group);
    await step(0.75, 'Небо, облака, погода, вода…'); this.atm = new Atmosphere(renderer, scene, w, Q);
    const set = S().settings; const tod = { dynamic: 8 + Math.random() * 10, morning: 7.5, noon: 13, sunset: 18.6, night: 22.5 }[set.timeOfDay]; this.dynamicTime = set.timeOfDay === 'dynamic'; this.atm.setTime(tod);
    const wt = set.weather === 'random' ? (['clear', 'clear', 'cloudy', 'rain', 'clear', 'fog'][Math.floor(Math.random() * 6)]) : set.weather; this.atm.setWeather(wt); this.atm.cover = this.atm.targetCover; if (wt === 'rain') this.atm.wet = 0.8; this.atm.updateEnv(true);
    this.grid = new SpatialGrid(w.colliders);
    await step(0.85, 'Автомобили и соперники…');
    const pid = S().selected; const pcar = CARS.find(c => c.id === pid); const ptune = S().owned[pid];
    const total = this.mode === 'race' ? 8 : 1; const pr = rating(pcar, ptune).pi; const diff = DIFFICULTY[set.difficulty];
    const pool = CARS.filter(c => c.id !== pid).map(c => ({ c, d: Math.abs(rating(c, defaultTune(c)).pi - pr) })).sort((a, b) => a.d - b.d).slice(0, 9);
    const gridSlot = this.mode === 'race' ? 5 : 0; const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < total; i++) {
      const isP = i === gridSlot; let car = pcar, tune = ptune;
      if (!isP) { car = pool[Math.floor(Math.random() * pool.length)].c; tune = defaultTune(car); tune.paint = PAINTS[Math.floor(Math.random() * PAINTS.length)]; tune.finish = ['gloss', 'metallic', 'pearl', 'matte'][Math.floor(Math.random() * 4)]; tune.rim = Object.keys(RIMS)[Math.floor(Math.random() * 6)]; tune.spoiler = ['none', 'lip', 'ducktail', 'gt'][Math.floor(Math.random() * 4)]; tune.livery = Object.keys(LIVERIES)[Math.floor(Math.random() * 6)]; tune.liveryColor = Math.random() < 0.5 ? '#ffffff' : '#111111'; tune.decal = Math.random() < 0.5 ? 'both' : 'number'; const lvl = Math.round((ptune.engine + ptune.turbo + ptune.suspension) / 3); for (const k of Object.keys(PERF)) tune[k] = clamp(lvl + (Math.random() < 0.3 ? 1 : 0), 0, 3); tune.tires = car.offroad ? 'offroad' : ['street', 'sport', 'sport'][Math.floor(Math.random() * 3)]; }
      const vis = new CarVisual(car, tune, { lights: isP }); const veh = new Vehicle(car, tune, w);
      veh.abs = isP ? set.abs : true; veh.tcs = isP ? set.tcs : true; veh.esp = isP ? set.esp : true; veh.auto = isP ? set.gearbox === 'auto' : true;
      const row = Math.floor(i / 2), lat = (i % 2 ? -1 : 1) * w.hw * 0.4; const tt = w.length - 14 - row * 10 - (i % 2) * 4;
      const p0 = w.pointAt(tt, lat), p1 = w.pointAt(tt + 2, lat); veh.place(p0.x, p0.y, p0.z, Math.atan2(p1.x - p0.x, p1.z - p0.z));
      veh.lap = 0; veh.lastT = tt; veh.prog = tt - w.length; veh.raceDist = veh.prog; veh.name = isP ? 'Вы' : names[i % names.length]; veh.vis = vis; veh.isPlayer = isP; veh.finished = false; veh.lapTimes = []; veh.lapStart = 0;
      if (!isP) { veh.bot = new BotDriver(veh, w, diff, i); vis.setInteriorVisible(false); }
      else { this.player = veh; vis.addHeadlights(); }
      scene.add(vis.root); this.cars.push(veh);
    }
    this.smoke = new Particles(scene, Math.floor(1500 * Math.max(0.4, Q.trees))); this.sparks = new Particles(scene, 400, true); this.skids = new Skids(scene, isMobile ? 1500 : 4000);
    this.engine = new EngineSound(this.player.car, true); this.botSound = this.mode === 'race' ? new EngineSound(this.cars.find(c => !c.isPlayer).car, false) : null;
    this.buildMinimap();
    this.props.update(this.player.pos, true);
    await step(0.95, 'Компиляция шейдеров…'); renderer.compile(scene, this.camera);
    this.camPos.copy(this.player.pos).add(new THREE.Vector3(30, 12, 30)); this.camLook.copy(this.player.pos);
    this.applySettings(); this.state = 'intro'; this.t = 0;
  }
  applySettings() { const s = S().settings; if (!this.player) return; this.player.abs = s.abs; this.player.tcs = s.tcs; this.player.esp = s.esp; this.player.auto = s.gearbox === 'auto'; $('fps').classList.toggle('hidden', !s.showFps); }
  buildMinimap() { const w = this.world; const p = new Path2D(); for (let i = 0; i <= w.N; i += 4) { const k = i % w.N; i ? p.lineTo(w.X[k], w.Z[k]) : p.moveTo(w.X[k], w.Z[k]); } p.closePath(); this.mmPath = p; }
  cycleCam() { this.camMode = (this.camMode + 1) % 5; this.player.vis.setInteriorVisible(true); toast(['Камера: третье лицо', 'Камера: дальняя', 'Камера: капот', 'Камера: бампер', 'Камера: салон'][this.camMode]); }
  resetPlayer() { const v = this.player, w = this.world; if (this.state !== 'race' && this.state !== 'free') return; const L = w.locate(v.pos.x, v.pos.z, v.trackS); const t = L.s * w.ds; const p0 = w.pointAt(t, w.RL[L.s]), p1 = w.pointAt(t + 2, w.RL[L.s]); v.place(p0.x, p0.y + 0.4, p0.z, Math.atan2(p1.x - p0.x, p1.z - p0.z)); v.lastT = t; this.drift.combo = 0; }
  resetBot(v) { const w = this.world; const L = w.locate(v.pos.x, v.pos.z, v.trackS); const t = L.s * w.ds + 6; const p0 = w.pointAt(t, w.RL[(L.s + 3) % w.N]), p1 = w.pointAt(t + 2, w.RL[(L.s + 3) % w.N]); v.place(p0.x, p0.y + 0.4, p0.z, Math.atan2(p1.x - p0.x, p1.z - p0.z)); v.lastT = t; }
  update(dt) {
    const w = this.world; this.t += dt; timeUniform.value += dt;
    if (this.state === 'paused') return;
    if (this.state === 'intro') { $('msg').textContent = ''; $('sub').textContent = this.def.name.toUpperCase() + ' • ' + MODES[this.mode]; if (this.t > 2.4) { this.state = 'count'; this.t = 0; } }
    if (this.state === 'count') { const n = 3 - Math.floor(this.t); if (n !== this.lastN) { this.lastN = n; if (n > 0) beep(520, 0.2); } $('msg').textContent = n > 0 ? n : 'GO!'; $('sub').textContent = ''; if (this.t >= 3) { beep(1040, 0.4); this.state = this.mode === 'free' ? 'free' : 'race'; this.t = 0; for (const c of this.cars) { c.raceActive = true; c.lapStart = 0; } setTimeout(() => { if ($('msg').textContent === 'GO!') $('msg').textContent = ''; }, 900); } }
    const racing = this.state === 'race' || this.state === 'free' || this.state === 'done';
    if (this.state === 'race' || this.state === 'free') this.raceTime += dt;
    // inputs
    const pin = readInput(); const playerInp = racing && !this.player.finished ? pin : (this.player.finished && this.player.bot ? this.player.bot.update(dt, this.cars, null, true) : { steer: 0, throttle: 0, brake: 1, handbrake: false, digital: true, hold: true });
    if (this.player.finished && !this.player.bot) { this.player.bot = new BotDriver(this.player, w, DIFFICULTY[1], 99); }
    for (const c of this.cars) c.inp = c.isPlayer ? playerInp : c.bot.update(dt, this.cars, this.player, racing);
    // physics substeps
    const H = 1 / 240; const n = Math.min(12, Math.ceil(dt / H)); const h = dt / n; w.wet = this.atm.wet;
    for (let k = 0; k < n; k++) { for (const c of this.cars) { c.step(h, c.inp); c.inp.shiftUp = c.inp.shiftDown = false; } }
    // collisions
    for (const c of this.cars) {
      const h1 = c.collideTrack(), h2 = c.collideProps(this.grid); const hit = Math.max(h1, h2); if (hit > 2.5) this.impact(c, hit);
    }
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) { const hh = collideCars(this.cars[i], this.cars[j]); if (hh > 1.5) { this.impact(this.cars[i], hh * 0.7); this.impact(this.cars[j], hh * 0.7); } }
    // progress
    for (const c of this.cars) {
      const L = w.locate(c.pos.x, c.pos.z, c.trackS); const t = L.t; let d = t - c.lastT; c.lastT = t;
      if (d < -w.length / 2) d += w.length; else if (d > w.length / 2) d -= w.length;
      if (Math.abs(d) < 80) c.prog += d;
      const lapNow = Math.floor(c.prog / w.length) + 1;
      if (lapNow > c.lap) { if (c.lap >= 1) { const lt = this.raceTime - c.lapStart; c.lapTimes.push(lt); if (c.isPlayer) this.onLap(lt); } c.lap = lapNow; c.lapStart = this.raceTime; if (this.mode !== 'free' && c.lap > this.def.laps && !c.finished) this.finish(c); }
      c.raceDist = c.prog;
      if (c.finished) c.raceDist = 1e9 - c.finishPos;
      if (c.bot && c.bot.needsReset) { c.bot.needsReset = false; this.resetBot(c); }
      if (c.isPlayer && racing) { if (Math.abs(c.roll) > 0.48 || (c.speed < 1 && c.airT > 3)) { c._flip = (c._flip || 0) + dt; if (c._flip > 2) { this.resetPlayer(); c._flip = 0; } } else c._flip = 0; }
      if (c.pos.y < w.waterY - 1.5) { c.isPlayer ? this.resetPlayer() : this.resetBot(c); }
    }
    // events
    for (const ev of this.player.events) if (ev === 'shift') shiftSfx();
    this.updateDrift(dt);
    const st = S().stats; st.time += dt; const spd = Math.abs(this.player.speed); st.distance += spd * dt; if (spd > st.topSpeed) st.topSpeed = spd;
    // visuals
    const night = nightUniform.value; this.tun = lerp(this.tun, w.inTunnel(Math.max(0, this.player.trackS)) ? 1 : 0, Math.min(1, dt * 3));
    for (const c of this.cars) { c.vis.pose(c); c.vis.setLights(c.brk > 0.1 && c.speed > 0.5, Math.max(night, this.tun), false); }
    if (w.nightMats) for (const m of w.nightMats) m.emissiveIntensity = night * 6;
    this.effects(dt);
    this.updateCamera(dt);
    this.atm.update(dt, this.camera.position, this.player.pos, this.dynamicTime);
    if (this.tun > 0.01) { this.scene.environmentIntensity *= 1 - this.tun * 0.8; this.atm.hemi.intensity *= 1 - this.tun * 0.85; }
    this.props.update(this.camera.position);
    // particles fog
    for (const p of [this.smoke, this.sparks]) { p.mat.uniforms.fogColor.value.copy(this.scene.fog.color); p.mat.uniforms.fogDensity.value = this.scene.fog.density; p.mat.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.9; }
    this.smoke.mat.uniforms.uLight.value.setScalar(0.25 + 0.85 * this.atm.day * (1 - this.tun * 0.6));
    // audio
    const interior = this.camMode === 4; this.engine.update(this.player, { interior, rain: this.atm.weather === 'rain' });
    if (this.botSound) { let best = null, bd = 1e9; for (const c of this.cars) if (!c.isPlayer) { const d = c.pos.distanceTo(this.player.pos); if (d < bd) { bd = d; best = c; } } if (best) { const rel = new THREE.Vector3().subVectors(best.pos, this.camera.position).applyQuaternion(this.camera.quaternion.clone().invert()); this.botSound.update(best, { dist: bd, pan: clamp(rel.x / 20, -1, 1) }); } }
    this.hud(dt);
  }
  impact(c, v) {
    const lh = c.lastHit; if (!lh) return; c.lastHit = null; const amount = Math.max(0, v - 2) * 0.012; c.damage = Math.min(1, c.damage + amount * 0.6);
    if (S().settings.effects > 0.2) c.vis.damage(lh.local, lh.dir, amount);
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw); const wx = c.pos.x + lh.local.x * cy + lh.local.z * sy, wz = c.pos.z - lh.local.x * sy + lh.local.z * cy;
    for (let i = 0; i < Math.min(40, v * 3); i++) this.sparks.emit(wx, c.pos.y + 0.4, wz, (Math.random() - 0.5) * 8 + c.vel.x * 0.5, Math.random() * 5, (Math.random() - 0.5) * 8 + c.vel.z * 0.5, 0.06 + Math.random() * 0.08, -0.05, 0.3 + Math.random() * 0.4, 1, 0.55, 0.2, 1, 12);
    if (c.isPlayer) { crash(v); this.shake = Math.min(1, v * 0.05); this.drift.combo = 0; this.drift.score = 0; } else if (c.pos.distanceTo(this.player.pos) < 40) crash(v * 0.5);
  }
  effects(dt) {
    const qf = S().settings.effects * Math.max(0.4, Q.trees);
    for (const c of this.cars) {
      const distCam = c.pos.distanceTo(this.camera.position); if (distCam > 220) continue;
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      for (let i = 0; i < 4; i++) {
        const wh = c.wheels[i]; const key = c.name + i; const [xi, zi] = c.p.wheels[i];
        const wx = c.pos.x + xi * cy + zi * sy, wz = c.pos.z - xi * sy + zi * cy;
        const sl = Math.max(Math.abs(wh.slip) - 0.18, wh.slipL - 0.16, wh.lock ? 0.5 : 0);
        const fast = Math.abs(c.speed) > 3;
        if (wh.contact && wh.road && sl > 0 && fast) {
          const a = clamp(sl * 1.6, 0.1, 1); this.skids.add(key, wx, wh.gy, wz, cy * 0.13, -sy * 0.13, 1, a);
          if (Math.random() < qf * clamp(sl * 3, 0, 1) * (this.atm.wet > 0.4 ? 0.3 : 1)) this.smoke.emit(wx + (Math.random() - 0.5) * 0.4, wh.gy + 0.25, wz + (Math.random() - 0.5) * 0.4, c.vel.x * 0.25 + (Math.random() - 0.5), 0.5 + Math.random(), c.vel.z * 0.25 + (Math.random() - 0.5), 0.7 + Math.random() * 0.5, 1.4 + sl * 1.2, 1.2 + Math.random() * 1.3, 0.85, 0.85, 0.87, 0.22 * clamp(sl * 2, 0.3, 1));
        } else this.skids.cut(key);
        const dirt = wh.contact && (!wh.road || wh.surf === 1) && Math.abs(c.speed) > 6;
        if (dirt && Math.random() < qf * 0.45 && i >= 2) { const col = this.world.biome === 'desert' ? [0.78, 0.62, 0.45] : wh.surf === 3 ? [0.8, 0.72, 0.58] : [0.5, 0.42, 0.32]; this.smoke.emit(wx, wh.gy + 0.3, wz, c.vel.x * 0.3 + (Math.random() - 0.5) * 2, 0.8 + Math.random(), c.vel.z * 0.3 + (Math.random() - 0.5) * 2, 1.0 + Math.random(), 3.0, 1.8 + Math.random() * 1.5, col[0], col[1], col[2], 0.38); }
        if (this.atm.wet > 0.35 && wh.road && Math.abs(c.speed) > 14 && i >= 2 && Math.random() < qf * 0.6) this.smoke.emit(wx, wh.gy + 0.25, wz, c.vel.x * 0.5 + (Math.random() - 0.5) * 2, 0.6, c.vel.z * 0.5 + (Math.random() - 0.5) * 2, 0.7, 2.6, 0.7, 0.8, 0.82, 0.86, 0.25);
      }
      if (c.backfire > 0.15 && Math.random() < 0.3) { const ex = c.pos.x - sy * c.p.halfL * 0.98, ez = c.pos.z - cy * c.p.halfL * 0.98; for (let k = 0; k < 4; k++) this.sparks.emit(ex + (Math.random() - 0.5) * 0.3, c.pos.y + 0.35, ez, -sy * 4 + c.vel.x, 0.3, -cy * 4 + c.vel.z, 0.25, 0.5, 0.12, 1, 0.45, 0.1, 1); }
    }
    this.smoke.update(dt); this.sparks.update(dt);
  }
  updateDrift(dt) {
    const v = this.player, d = this.drift; const sp = Math.abs(v.speed); const vel = Math.hypot(v.vel.x, v.vel.z);
    const ang = vel > 3 ? Math.abs(Math.atan2(v.vel.x * Math.cos(v.yaw) - v.vel.z * Math.sin(v.yaw), v.vel.x * Math.sin(v.yaw) + v.vel.z * Math.cos(v.yaw))) : 0;
    const el = $('drift');
    if (ang > 0.22 && ang < 1.6 && sp > 12 && v.wheels.some(w => w.contact)) { d.t = 0.8; d.score += ang * sp * dt * 12; d.combo = Math.min(5, 1 + d.score / 3000); el.classList.remove('hidden'); el.querySelector('.p').textContent = fmtC(d.score * d.combo); el.querySelector('.t').textContent = `ДРИФТ x${d.combo.toFixed(1)}`; }
    else if (d.t > 0) { d.t -= dt; if (d.t <= 0) { if (d.score > 300) { const pts = d.score * d.combo; d.total += pts; S().stats.drift += Math.round(pts); toast('Дрифт: +' + fmtC(pts) + ' очков'); } d.score = 0; d.combo = 0; el.classList.add('hidden'); } }
  }
  updateCamera(dt) {
    const v = this.player, cam = this.camera, vis = v.vis; const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
    const spd = Math.abs(v.speed); const fwd = new THREE.Vector3(sy, 0, cy);
    let fov = 60 + Math.min(22, spd * 0.28);
    if (this.state === 'intro') { const a = this.t * 0.6; const p = v.pos.clone().add(new THREE.Vector3(Math.sin(v.yaw + 2.2 - a) * 8, 2.0 + this.t * 0.3, Math.cos(v.yaw + 2.2 - a) * 8)); cam.position.copy(p); cam.lookAt(v.pos.x, v.pos.y + 0.8, v.pos.z); this.camPos.copy(p); this.camLook.copy(v.pos); cam.fov = 50; cam.updateProjectionMatrix(); return; }
    const m = this.camMode; const lift = vis.model.position.y; const Hs = v.car.body.H;
    if (m <= 1) {
      const dist = m === 0 ? 5.6 + spd * 0.025 : 8.5 + spd * 0.03, ht = m === 0 ? 1.75 : 2.6;
      const velDir = Math.hypot(v.vel.x, v.vel.z) > 4 ? new THREE.Vector3(v.vel.x, 0, v.vel.z).normalize() : fwd; const dir = fwd.clone().lerp(velDir, 0.35).normalize();
      const want = v.pos.clone().addScaledVector(dir, -dist); want.y = v.pos.y + ht * (0.85 + Hs * 0.15) + lift;
      const g = this.world.heightAt(want.x, want.z); if (want.y < g + 0.6) want.y = g + 0.6;
      this.camPos.lerp(want, 1 - Math.exp(-dt * 9)); const look = v.pos.clone().addScaledVector(fwd, 2.5); look.y += 0.9 + lift; this.camLook.lerp(look, 1 - Math.exp(-dt * 14));
      cam.position.copy(this.camPos); cam.lookAt(this.camLook); vis.setInteriorVisible(true);
    } else {
      vis.root.updateMatrixWorld(true); const local = m === 2 ? new THREE.Vector3(0, 1.22 * Hs + lift, 0.6) : m === 3 ? new THREE.Vector3(0, 0.42 + lift, 2.35 * v.car.body.L) : new THREE.Vector3(0.36 * v.car.body.W, 1.02 * Hs + lift, -0.15 * v.car.body.L);
      const p = local.clone().applyMatrix4(vis.body.matrixWorld); const t = local.clone().add(new THREE.Vector3(0, m === 4 ? -0.05 : -0.1, 10)).applyMatrix4(vis.body.matrixWorld);
      cam.position.copy(p); cam.lookAt(t); this.camPos.copy(p); fov = m === 4 ? 68 + spd * 0.12 : fov + 4;
    }
    if (this.shake > 0 || spd > 40) { const s = this.shake * 0.25 + Math.max(0, spd - 40) * 0.0006; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; this.shake = Math.max(0, this.shake - dt * 2); }
    cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix();
    post.final.uniforms.uBlur.value = Q.mblur ? clamp((spd - 22) / 50, 0, 1) * (m === 4 ? 0.6 : 1) : 0;
  }
  onLap(lt) {
    const r = S().records[this.def.id] || (S().records[this.def.id] = {}); const best = this.player.lapTimes.length ? Math.min(...this.player.lapTimes) : lt;
    if (!r.lap || lt * 1000 < r.lap) { r.lap = lt * 1000; r.lapCar = this.player.car.name; $('sub').textContent = 'НОВЫЙ РЕКОРД КРУГА! ' + fmtT(lt * 1000); setTimeout(() => $('sub').textContent = '', 2500); }
    else { $('sub').textContent = 'Круг: ' + fmtT(lt * 1000); setTimeout(() => $('sub').textContent = '', 2000); }
    if (this.mode === 'time') { S().coins += 800; S().stats.earned += 800; }
    save();
  }
  finish(c) {
    this.finishCount = (this.finishCount || 0) + 1; c.finished = true; c.finishPos = this.finishCount; c.finishTime = this.raceTime;
    if (c.isPlayer) { this.state = 'done'; this.doneT = 0; setTimeout(() => this.results(), 2600); $('msg').textContent = this.mode === 'race' ? (c.finishPos === 1 ? 'ПОБЕДА!' : c.finishPos + '-Е МЕСТО') : 'ФИНИШ'; beep(880, 0.5); }
  }
  standings() { return this.cars.slice().sort((a, b) => b.raceDist - a.raceDist); }
  results() {
    if (this.resultsShown) return; this.resultsShown = true;
    const st = S().stats, set = S().settings, diff = DIFFICULTY[set.difficulty]; const p = this.player; let coins = 0;
    const order = this.standings();
    const pos = p.finishPos || order.indexOf(p) + 1;
    if (this.mode === 'race') { coins = Math.round([9000, 6500, 4800, 3500, 2500, 1800, 1200, 800][pos - 1] * diff.reward); st.races++; if (pos === 1) st.wins++; if (pos <= 3) st.podiums++; }
    else if (this.mode === 'time') { coins = 1500; st.races++; }
    coins += Math.round(this.drift.total / 40); coins = Math.round(coins * (1 - p.damage * 0.2));
    const r = S().records[this.def.id] || (S().records[this.def.id] = {}); const tt = (p.finishTime || this.raceTime) * 1000;
    if (this.mode !== 'free' && p.finished && (!r.race || tt < r.race)) { r.race = tt; r.raceCar = p.car.name; }
    S().coins += coins; st.earned += coins; save();
    const rows = order.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${c.name}</td><td>${c.car.name}</td><td>${c.finished ? fmtT(c.finishTime * 1000) : '—'}</td><td>${c.lapTimes.length ? fmtT(Math.min(...c.lapTimes) * 1000) : '—'}</td></tr>`).join('');
    $('ovb').innerHTML = `<h2>${this.mode === 'race' ? (pos === 1 ? '🏆 Победа!' : 'Финиш: ' + pos + '-е место') : this.mode === 'time' ? 'Заезд на время' : 'Свободный заезд'}</h2>
      ${this.mode === 'race' ? `<table class="res"><tr style="color:#9aa3b5"><td>#</td><td>Пилот</td><td>Авто</td><td>Время</td><td>Лучший круг</td></tr>${rows}</table>` : `<div class="row"><label>Время</label><b>${fmtT(tt)}</b></div><div class="row"><label>Лучший круг</label><b>${p.lapTimes.length ? fmtT(Math.min(...p.lapTimes) * 1000) : '—'}</b></div>`}
      <div class="row"><label>Очки дрифта</label><b>${fmtC(this.drift.total)}</b></div><div class="row"><label>Повреждения</label><b>${Math.round(p.damage * 100)}%</b></div><div class="row"><label>Награда</label><b style="color:#ffc400;font-size:22px">+ ₵ ${fmtC(coins)}</b></div>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn" id="rRetry">Ещё раз</button><button class="btn g" id="rMenu">В меню</button></div>`;
    $('ov').classList.remove('hidden'); $('rRetry').onclick = () => { const d = this.def.id, m = this.mode; endRace(); startRace(d, m); }; $('rMenu').onclick = () => { endRace(); showMenu(); };
  }
  hud(dt) {
    const p = this.player, set = S().settings; const mph = set.units === 'mph'; const spd = Math.abs(p.speed) * (mph ? 2.237 : 3.6);
    const order = this.mode === 'race' ? this.standings() : [p]; const pos = order.indexOf(p) + 1;
    $('pos').classList.toggle('hidden', this.mode !== 'race'); $('pos').querySelector('.v').innerHTML = `${pos}<small>/${order.length}</small>`;
    $('lap').classList.toggle('hidden', this.mode === 'free'); $('lap').querySelector('.v').textContent = `${clamp(p.lap, 1, this.def.laps)}/${this.def.laps}`;
    $('time').querySelector('.v').textContent = fmtT((this.state === 'race' || this.state === 'free' ? this.raceTime - (this.mode === 'free' ? 0 : p.lapStart) : 0) * 1000);
    $('time').querySelector('.l').textContent = this.mode === 'free' ? 'ВРЕМЯ' : 'КРУГ';
    const rec = S().records[this.def.id]; $('best').querySelector('.v').textContent = p.lapTimes.length ? fmtT(Math.min(...p.lapTimes) * 1000) : rec && rec.lap ? fmtT(rec.lap) : '--';
    $('dmg').querySelector('b').style.width = (p.damage * 100) + '%';
    $('aABS').className = p.abs ? (p.flags.abs ? 'on' : '') : 'off'; $('aTCS').className = p.tcs ? (p.flags.tcs ? 'on' : '') : ''; $('aESP').className = p.esp ? (p.flags.esp ? 'on' : '') : '';
    for (const [id, on] of [['aABS', p.abs], ['aTCS', p.tcs], ['aESP', p.esp]]) $(id).style.opacity = on ? 1 : 0.25;
    // speedometer
    const c = $('speedo'), g = c.getContext('2d'), W = c.width, cx = W / 2, cyy = W / 2, R = W * 0.44; g.clearRect(0, 0, W, W);
    const red = p.p.redline, maxR = Math.ceil(red / 1000) * 1000; const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25; const ang = r => a0 + (a1 - a0) * r / maxR;
    const bg = g.createRadialGradient(cx, cyy, R * 0.2, cx, cyy, R * 1.1); bg.addColorStop(0, 'rgba(10,12,18,.85)'); bg.addColorStop(1, 'rgba(10,12,18,.35)'); g.fillStyle = bg; g.beginPath(); g.arc(cx, cyy, R * 1.08, 0, 7); g.fill();
    g.lineWidth = W * 0.022; g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(cx, cyy, R, a0, a1); g.stroke();
    g.strokeStyle = '#ff2a2a'; g.beginPath(); g.arc(cx, cyy, R, ang(red * 0.9), a1); g.stroke();
    const grad = g.createLinearGradient(0, W, W, 0); grad.addColorStop(0, '#2ad4ff'); grad.addColorStop(0.7, '#ff2a6d'); grad.addColorStop(1, '#ffc400'); g.strokeStyle = grad; g.lineWidth = W * 0.035; g.beginPath(); g.arc(cx, cyy, R, a0, ang(p.rpm)); g.stroke();
    g.fillStyle = '#cfd5e2'; g.font = `700 ${W * 0.045}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r <= maxR; r += p.p.ev ? 2000 : 1000) { const a = ang(r); g.fillText(r / 1000, cx + Math.cos(a) * R * 0.82, cyy + Math.sin(a) * R * 0.82); }
    g.fillStyle = '#fff'; g.font = `italic 900 ${W * 0.2}px Arial`; g.fillText(Math.round(spd), cx, cyy - W * 0.01); g.font = `700 ${W * 0.045}px Arial`; g.fillStyle = '#9aa3b5'; g.fillText(mph ? 'MPH' : 'КМ/Ч', cx, cyy + W * 0.12);
    const gear = p.gear === -1 ? 'R' : p.speed < 0.3 && p.thr < 0.05 && this.state !== 'race' ? 'N' : String(p.gear);
    g.fillStyle = p.rpm > red * 0.92 ? '#ff2a2a' : '#ffc400'; g.font = `italic 900 ${W * 0.11}px Arial`; g.fillText(gear, cx, cyy + W * 0.27);
    if (p.p.turboMax > 0) { g.lineWidth = W * 0.015; g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(cx, cyy, R * 0.66, Math.PI * 0.85, Math.PI * 1.15); g.stroke(); g.strokeStyle = '#2ad4ff'; g.beginPath(); g.arc(cx, cyy, R * 0.66, Math.PI * 0.85, Math.PI * (0.85 + 0.3 * p.boost)); g.stroke(); }
    // minimap
    const m = $('mini'), mg = m.getContext('2d'), MW = m.width; mg.clearRect(0, 0, MW, MW); mg.save(); mg.beginPath(); mg.arc(MW / 2, MW / 2, MW / 2 - 2, 0, 7); mg.clip();
    const sc = MW / 2 / 380; mg.translate(MW / 2, MW / 2); mg.rotate(Math.PI + p.yaw); mg.scale(-sc, sc); mg.translate(-p.pos.x, -p.pos.z);
    mg.lineJoin = 'round'; mg.strokeStyle = 'rgba(0,0,0,.6)'; mg.lineWidth = 26 / sc * 0.5; mg.stroke(this.mmPath); mg.strokeStyle = 'rgba(235,240,250,.9)'; mg.lineWidth = 14 / sc * 0.5; mg.stroke(this.mmPath);
    mg.fillStyle = '#fff'; const w = this.world; mg.fillRect(w.X[0] - 10, w.Z[0] - 10, 20, 20);
    for (const cc of this.cars) { if (cc === p) continue; mg.fillStyle = '#ff3d5a'; mg.beginPath(); mg.arc(cc.pos.x, cc.pos.z, 9 / sc * 0.5, 0, 7); mg.fill(); }
    mg.restore(); mg.fillStyle = '#ffc400'; mg.beginPath(); mg.moveTo(MW / 2, MW / 2 - 16); mg.lineTo(MW / 2 + 11, MW / 2 + 12); mg.lineTo(MW / 2, MW / 2 + 6); mg.lineTo(MW / 2 - 11, MW / 2 + 12); mg.closePath(); mg.fill();
  }
  dispose() { this.engine && this.engine.stop(); this.botSound && this.botSound.stop(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (this.atm.envRT) this.atm.envRT.dispose(); }
}

async function startRace(trackId, mode) {
  initAudio(); hideAll(); $('coins').classList.add('hidden'); $('loading').classList.remove('hidden'); $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  screen = 'loadingRace'; if (race) endRace();
  const def = TRACKS.find(t => t.id === trackId);
  try { race = new Race(def, mode); await race.build(); }
  catch (e) { console.error(e); $('loading').classList.add('hidden'); race = null; toast('Ошибка загрузки трассы: ' + e.message); showMenu(); return; }
  window.__race = race; post.setScene(race.scene, race.camera); if (post.ao) post.ao.enabled = false;
  $('loading').classList.add('hidden'); screen = 'race'; $('hud').classList.remove('hidden'); if (isMobile || navigator.maxTouchPoints > 0) { buildTouch(); $('touch').classList.remove('hidden'); }
  $('fps').classList.toggle('hidden', !S().settings.showFps); onResize();
}
function endRace() { if (!race) return; race.dispose(); race = null; post.setScene(showroom.scene, showroom.camera); if (post.ao) post.ao.enabled = true; post.final.uniforms.uBlur.value = 0; $('msg').textContent = ''; $('sub').textContent = ''; $('drift').classList.add('hidden'); renderer.toneMappingExposure = 1; }
function pauseRace(on) {
  if (!race || race.resultsShown) return; if (on) { if (race.state === 'paused') return; race.prevState = race.state; race.state = 'paused'; }
  else { race.state = race.prevState || 'race'; $('ov').classList.add('hidden'); return; }
  $('ovb').innerHTML = `<h2>Пауза</h2><div style="display:flex;flex-direction:column;gap:10px;max-width:320px"><button class="btn" id="pRes">Продолжить</button><button class="btn g" id="pRst">Рестарт</button><button class="btn g" id="pCam">Сменить камеру</button><button class="btn g" id="pSet">Настройки</button><button class="btn g" id="pExit">Выйти в меню</button></div>`;
  $('ov').classList.remove('hidden');
  $('pRes').onclick = () => pauseRace(false); $('pRst').onclick = () => { const d = race.def.id, m = race.mode; endRace(); startRace(d, m); };
  $('pCam').onclick = () => { race.cycleCam(); }; $('pSet').onclick = () => { $('ov').classList.add('hidden'); settingsScreen(true); }; $('pExit').onclick = () => { if (race.mode !== 'free' || true) { race.results ? 0 : 0; } endRace(); showMenu(); };
}

// ---------------- main loop ----------------
let fpsAcc = 0, fpsN = 0, prTimer = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (fpsCap > 0 && now - lastFrame < 1000 / fpsCap - 1.5) return;
  const rdt = clock.getDelta(); const dt = Math.min(window.__dtMax || 0.05, rdt); lastFrame = now;
  if (screen === 'race' && race) race.update(dt);
  else if (!race) showroom.update(dt);
  if (race && screen !== 'race' && race.state === 'paused') { /* keep last frame */ }
  post.final.uniforms.uTime.value = now / 1000;
  if (!window.__noRender || (window.__snap > 0 && window.__snap--)) post.draw(dt);
  // fps + dynamic resolution
  fpsAcc += rdt; fpsN++; ftAvg = lerp(ftAvg, rdt * 1000, 0.05);
  if (fpsAcc > 0.5) { if (S().settings.showFps) $('fps').textContent = Math.round(fpsN / fpsAcc) + ' FPS • ' + renderer.getPixelRatio().toFixed(2) + 'x • ' + Q.name; fpsAcc = 0; fpsN = 0; }
  prTimer += dt;
  if (race && prTimer > 1.5) { prTimer = 0; const target = 1000 / (fpsCap > 0 ? Math.min(fpsCap, 60) : 60); const base = Math.min(window.devicePixelRatio, Q.pr * S().settings.resScale); let pr = renderer.getPixelRatio();
    if (ftAvg > target * 1.25 && pr > base * 0.55) pr = Math.max(base * 0.55, pr - 0.1); else if (ftAvg < target * 1.05 && pr < base) pr = Math.min(base, pr + 0.05);
    if (Math.abs(pr - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(pr); post.resize(); } }
}

boot().catch(e => { console.error(e); $('loadTxt').textContent = 'Ошибка: ' + e.message; });
