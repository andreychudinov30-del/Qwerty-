import { AIRCRAFT, PAINTS, MISSIONS, MAPS, TIMES, WEATHER, CONTRACTS, QUALITY, byId } from './data.js';
import { save, persist, resetSave } from './save.js';
import { fmt, clamp } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const CN = { ru: 'РОССИЯ', us: 'США', cn: 'КИТАЙ' };
const TIPS = ['Держите скорость 700–900 км/ч — это лучшая скорость виража.', 'Ловушки (ЛТЦ) уводят ракеты, но их запас ограничен.', 'Низкий полёт помогает уйти от ЗРК, но опасен рельефом.', 'Малозаметные самолёты дольше берутся на захват.', 'Форсаж быстро разгоняет, но в вираже скорость всё равно падает.', 'Используйте упреждение: стреляйте в кружок перед целью.', 'Камера из кабины: клавиша C или кнопка КАМ.'];
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const liveryCss = (l) => { if (!l) return '#888'; const c = l.colors; if (l.type === 'display') return `linear-gradient(120deg, ${c[0]} 0 40%, ${c[1]} 40% 60%, ${c[2]} 60%)`; if (l.type === 'digital') return `repeating-linear-gradient(90deg, ${c[0]} 0 6px, ${c[1]} 6px 10px, ${c[2]} 10px 14px, ${c[3] || c[0]} 14px 18px)`; if (l.type === 'tiger') return `repeating-linear-gradient(115deg, ${c[0]} 0 8px, ${c[1]} 8px 12px)`; return `linear-gradient(120deg, ${c[0]} 0 35%, ${c[1]} 35% 65%, ${c[2]} 65%)`; };

export class UI {
  constructor(app) {
    this.app = app; const root = this.root = $('#ui');
    root.innerHTML = `
    <div id="loading" class="screen on"><div class="center"><div class="logo">FLY FIGHT<small>ВОЗДУШНЫЙ БОЙ</small></div><div class="bar"><i></i></div><div class="st">Загрузка...</div><div class="tip"></div></div></div>
    <div id="menu" class="screen"></div>
    <div id="panel" class="screen"></div>
    <div id="game" class="screen"><canvas id="hud"></canvas><div id="blackout"></div><div id="dmg"></div>
      <div id="touch"><div class="stick-base"><div class="stick-knob"></div></div><div class="stick-hint">← Джойстик: коснитесь левой половины экрана</div>
        <div class="thr"><div class="thr-fill"></div><span>ТЯГА</span></div>
        <div class="tb gun" data-b="gun">ПУШКА</div><div class="tb mis" data-b="missile">РАКЕТА</div><div class="tb flr" data-b="flare">ЛТЦ</div>
        <div class="tb tgt" data-b="target">ЦЕЛЬ</div><div class="tb cam" data-b="camera">КАМ</div><div class="tb ab" data-b="ab">ФОРС</div><div class="tb brake" data-b="brake">ТОРМ</div>
      </div><button id="pausebtn">II</button><div id="fps"></div></div>
    <div id="overlay" class="screen"></div>
    <div id="rotate"><div class="ph"></div><div style="font-weight:800;font-size:20px">Поверните устройство горизонтально</div><div style="color:#8e9aa6">FLY FIGHT работает в альбомной ориентации</div></div>`;
    $('#rotate').classList.toggle('need', app.input.isTouch);
    $('#pausebtn').onclick = () => app.pause();
    root.addEventListener('click', (e) => { if (e.target.closest('button,.card,.sw,.opt,.mbtn')) app.audio.click(); });
    $('#loading .tip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
    app.input.bindTouch($('#touch'));
  }
  screen(id) { for (const s of this.root.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); this.cur = id; }
  progress(p, text) { $('#loading .bar i').style.width = (p * 100) + '%'; $('#loading .st').textContent = text || ''; }
  loading() { $('#loading .tip').textContent = TIPS[(Math.random() * TIPS.length) | 0]; this.progress(0, 'Загрузка...'); this.screen('loading'); }
  statBars(a) {
    const s = a.stats; const bar = (n, v) => `<div class="stat"><span>${n}</span><div class="b"><i style="width:${clamp(v, 0.05, 1) * 100}%"></i></div></div>`;
    return bar('Скорость', (s.speed - 560) / 220) + bar('Манёвр', (s.pitch - 1.3) / 0.8) + bar('Крен', (s.roll - 3.2) / 1.8) + bar('Прочность', (s.hp * s.armor - 80) / 100) + bar('Вооружение', s.missiles / 12) + bar('Скрытность', s.stealth + 0.03);
  }
  // ---------------- main menu ----------------
  menu() {
    const a = byId(save.selected);
    this.app.hangar.show(save.selected);
    $('#menu').innerHTML = `
      <div class="left">
        <div class="logo">FLY FIGHT<small>ВОЗДУШНЫЙ БОЙ 5 НА 5</small></div>
        <button class="mbtn primary" data-a="play"><span class="ic">▶</span>Играть</button>
        <button class="mbtn" data-a="missions"><span class="ic">◎</span>Миссии <span style="margin-left:auto;color:var(--acc);font-size:.8em">${save.done.length}/10</span></button>
        <button class="mbtn" data-a="aircraft"><span class="ic">✈</span>Выбор самолёта</button>
        <button class="mbtn" data-a="shop"><span class="ic">⛁</span>Магазин</button>
        <button class="mbtn" data-a="free"><span class="ic">☁</span>Свободный полёт</button>
        <button class="mbtn" data-a="settings"><span class="ic">⚙</span>Настройки</button>
        <button class="mbtn" data-a="stats"><span class="ic">▤</span>Статистика</button>
      </div>
      <div class="topbar"><div class="chip">⛁ <span class="c">${fmt(save.credits)}</span> кр.</div><div class="chip">${QUALITY[this.app.engine.qi].name}</div></div>
      <div class="acinfo"><span class="flag ${a.country}" style="position:static;float:right">${CN[a.country]}</span><h2>${a.name}</h2><div class="role">${a.role}</div>${this.statBars(a)}</div>
      <div class="hint">Вращайте самолёт пальцем или мышью • колесо — приближение</div>`;
    $('#menu').onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; this.act(b.dataset.a); };
    this.screen('menu'); this.app.toMenuScene();
  }
  act(a) {
    const app = this.app;
    if (a === 'play') { app.ensureFullscreen(); app.startMatch({ mode: 'battle', map: pickKey(MAPS), time: pickKey(TIMES, ['night']), weather: pickKey(WEATHER, ['storm', 'snow']) }); }
    if (a === 'missions') this.missions();
    if (a === 'aircraft') this.aircraft('own');
    if (a === 'shop') this.aircraft('shop');
    if (a === 'free') this.free();
    if (a === 'settings') this.settings();
    if (a === 'stats') this.stats();
  }
  panel(title, html, full) {
    const p = $('#panel'); p.innerHTML = `<div class="panel ${full ? 'full' : ''}"><div class="phead"><button class="back" data-a="back">← Назад</button><h1>${title}</h1><div style="margin-left:auto" class="chip">⛁ <span class="c">${fmt(save.credits)}</span> кр.</div></div>${html}</div>`;
    p.querySelector('[data-a=back]').onclick = () => this.menu();
    this.screen('panel'); return p;
  }
  // ---------------- aircraft / shop ----------------
  aircraft(mode, selId) {
    let sel = selId || save.selected; let tab = this.acTab || 'planes';
    const render = () => {
      const a = byId(sel); const owned = save.owned.includes(sel);
      const list = AIRCRAFT.map(x => { const o = save.owned.includes(x.id); return `<button class="card ${x.id === sel ? 'sel' : ''} ${o ? '' : 'locked'}" data-id="${x.id}"><span class="flag ${x.country}">${CN[x.country]}</span><h3>${x.name}</h3><div class="sub">${x.role}</div>${o ? (x.id === save.selected ? '<div class="own">✔ Выбран</div>' : '<div class="own">В ангаре</div>') : `<div class="price">⛁ ${fmt(x.price)}</div>`}</button>`; }).join('');
      const ownedPaints = save.ownedPaints[sel] || ['std']; const curPaint = save.paints[sel] || 'std';
      const paints = PAINTS.map(p => { const own = ownedPaints.includes(p.id) || p.price === 0; const liv = p.livery || a.livery; return `<button class="sw ${p.id === (this.previewPaint || curPaint) ? 'sel' : ''}" data-p="${p.id}"><div class="s" style="background:${liveryCss(liv)}"></div>${p.name}<div class="p">${own ? (p.id === curPaint ? '✔ Нанесена' : 'Куплена') : '⛁ ' + fmt(p.price)}</div></button>`; }).join('');
      const pp = this.previewPaint && PAINTS.find(p => p.id === this.previewPaint);
      const ppOwned = !pp || pp.price === 0 || ownedPaints.includes(pp.id);
      const html = `<div class="tabs"><button class="tab ${tab === 'planes' ? 'on' : ''}" data-t="planes">Самолёты</button><button class="tab ${tab === 'paint' ? 'on' : ''}" data-t="paint">Окраска</button></div>
        <div class="split"><div class="l"><div class="scroll">${tab === 'planes' ? `<div class="grid">${list}</div>` : `<div class="sub" style="color:var(--dim);margin-bottom:8px">Окраска для ${a.name}${owned ? '' : ' (сначала купите самолёт)'}</div><div class="swatches">${paints}</div>`}</div></div>
        <div class="r"><div class="acinfo" style="position:static"><span class="flag ${a.country}" style="position:static;float:right">${CN[a.country]}</span><h2>${a.name}</h2><div class="role">${a.role}</div><div style="font-size:13px;color:#c9d3dc;margin-bottom:8px">${a.desc}</div>${this.statBars(a)}
          <div class="btns">${tab === 'paint' ? (pp && !ppOwned ? `<button class="btn" data-a="buypaint" ${owned && save.credits >= pp.price ? '' : 'disabled'}>Купить окраску ⛁ ${fmt(pp.price)}</button>` : `<button class="btn" data-a="applypaint" ${owned ? '' : 'disabled'}>Нанести</button>`) :
            owned ? (sel === save.selected ? `<button class="btn alt" disabled>Выбран</button>` : `<button class="btn" data-a="select">Выбрать</button>`) : `<button class="btn" data-a="buy" ${save.credits >= a.price ? '' : 'disabled'}>Купить ⛁ ${fmt(a.price)}</button>`}
            <button class="btn alt" data-a="test">Тест-полёт</button></div></div></div></div>`;
      const p = this.panel(mode === 'shop' ? 'Магазин' : 'Выбор самолёта', html);
      p.querySelector('.panel').onclick = (e) => {
        const c = e.target.closest('[data-id]'); if (c) { sel = c.dataset.id; this.previewPaint = null; this.app.hangar.show(sel); render(); return; }
        const t = e.target.closest('[data-t]'); if (t) { tab = this.acTab = t.dataset.t; this.previewPaint = null; render(); return; }
        const sw = e.target.closest('[data-p]'); if (sw) { this.previewPaint = sw.dataset.p; this.app.hangar.show(sel, sw.dataset.p); render(); return; }
        const b = e.target.closest('[data-a]'); if (!b) return; const act = b.dataset.a;
        if (act === 'buy' && save.credits >= a.price) { save.credits -= a.price; save.owned.push(sel); save.selected = sel; persist(); this.toast(`${a.name} куплен!`); render(); }
        if (act === 'select') { save.selected = sel; persist(); render(); }
        if (act === 'buypaint' && pp && save.credits >= pp.price) { save.credits -= pp.price; (save.ownedPaints[sel] = save.ownedPaints[sel] || ['std']).push(pp.id); save.paints[sel] = pp.id; persist(); this.toast('Окраска нанесена'); render(); }
        if (act === 'applypaint') { save.paints[sel] = this.previewPaint || 'std'; persist(); this.toast('Окраска нанесена'); render(); }
        if (act === 'test') { this.app.ensureFullscreen(); this.app.startMatch({ mode: 'free', aircraft: sel, map: 'valley', time: 'afternoon', weather: 'scattered', enemies: 0 }); }
      };
      p.querySelector('[data-a=back]').onclick = () => { this.previewPaint = null; this.menu(); };
    };
    this.app.hangar.show(sel); render();
  }
  toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);background:rgba(20,30,20,.92);border:1px solid #6dff8a;color:#d8ffe0;padding:10px 18px;border-radius:8px;font-weight:800;z-index:99;pointer-events:none'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
  // ---------------- missions ----------------
  missions() {
    const list = MISSIONS.map(m => { const open = m.id <= save.mission; const done = save.done.includes(m.id); return `<button class="card mission ${open ? '' : 'locked'}" data-m="${m.id}" ${open ? '' : 'disabled'}><div class="n">${m.id}</div><div><h3>${m.name} ${done ? '<span style="color:var(--green);font-size:13px">✔ пройдена</span>' : ''}</h3><div class="sub">${MAPS[m.map].name} • ${TIMES[m.time].name} • ${WEATHER[m.weather].name}</div><span class="tag">Сложность ${stars(Math.ceil(m.skill * 5))}</span></div><div class="price">${open ? '⛁ ' + fmt(m.reward) : '🔒'}</div></button>`; }).join('');
    const p = this.panel('Миссии', `<div class="split"><div class="l"><div class="scroll"><div style="display:flex;flex-direction:column;gap:8px">${list}</div></div></div><div class="r"></div></div>`);
    p.querySelector('.panel').addEventListener('click', (e) => { const c = e.target.closest('[data-m]'); if (c && !c.disabled) this.briefing(+c.dataset.m); });
  }
  briefing(id) {
    const m = MISSIONS.find(x => x.id === id); const a = byId(save.selected);
    const types = { dogfight: 'Воздушный бой', naval: 'Удар по кораблям', strike: 'Подавление ПВО', intercept: 'Перехват', defend: 'Оборона базы', ace: 'Охота на аса', final: 'Решающее сражение' };
    const p = this.panel(`Миссия ${m.id}: ${m.name}`, `<div class="brief scroll"><span class="tag">${types[m.type]}</span><span class="tag">${MAPS[m.map].name}</span><span class="tag">${TIMES[m.time].name}</span><span class="tag">${WEATHER[m.weather].name}</span><span class="tag">Сложность ${stars(Math.ceil(m.skill * 5))}</span>
      <p>${m.brief}</p><p><b>Противник:</b> ${m.enemies.map(e => byId(e).name).join(', ')}${m.bombers ? ` + ${m.bombers} бомбардировщика` : ''}</p>
      <p><b>Ваше звено:</b> вы на ${a.name} и 4 ведомых. <b>Награда:</b> <span style="color:var(--acc)">⛁ ${fmt(m.reward)}</span>${save.done.includes(m.id) ? ' (повтор — 30%)' : ''}</p>
      <div class="btns"><button class="btn" data-a="go">В бой</button><button class="btn alt" data-a="plane">Сменить самолёт</button></div></div>`);
    p.querySelector('[data-a=go]').onclick = () => { this.app.ensureFullscreen(); this.app.startMatch({ mode: 'mission', mission: m.id }); };
    p.querySelector('[data-a=plane]').onclick = () => this.aircraft('own');
    p.querySelector('[data-a=back]').onclick = () => this.missions();
  }
  // ---------------- free flight ----------------
  free() {
    const st = this.freeCfg = this.freeCfg || { map: 'valley', time: 'sunset', weather: 'scattered', enemies: 0 };
    const opts = (key, obj) => Object.entries(obj).map(([k, v]) => `<button class="opt ${st[key] === k ? 'on' : ''}" data-k="${key}" data-v="${k}">${v.name}</button>`).join('');
    const p = this.panel('Свободный полёт', `<div class="scroll" style="max-width:820px">
      <div class="row"><label>Карта</label>${opts('map', MAPS)}</div>
      <div class="row"><label>Время суток</label>${opts('time', TIMES)}</div>
      <div class="row"><label>Погода</label>${opts('weather', WEATHER)}</div>
      <div class="row"><label>Противники</label><button class="opt ${!st.enemies ? 'on' : ''}" data-k="enemies" data-v="0">Нет</button><button class="opt ${st.enemies ? 'on' : ''}" data-k="enemies" data-v="1">Тренировочные цели</button></div>
      <div class="btns"><button class="btn" data-a="go">Взлёт</button></div></div>`);
    p.querySelector('.panel').addEventListener('click', (e) => {
      const o = e.target.closest('[data-k]'); if (o) { st[o.dataset.k] = o.dataset.k === 'enemies' ? +o.dataset.v : o.dataset.v; this.free(); return; }
      if (e.target.closest('[data-a=go]')) { this.app.ensureFullscreen(); this.app.startMatch({ mode: 'free', ...st }); }
    });
  }
  // ---------------- settings ----------------
  settings() {
    const s = save.settings; const qi = this.app.engine.qi;
    const tog = (k, a, b) => `<button class="opt ${s[k] ? 'on' : ''}" data-tog="${k}">${s[k] ? a : b}</button>`;
    const p = this.panel('Настройки', `<div class="scroll" style="max-width:860px">
      <div class="row"><label>Качество графики</label>${QUALITY.map((q, i) => `<button class="opt ${i === qi ? 'on' : ''}" data-q="${i}">${q.name}</button>`).join('')}</div>
      <div class="row"><label>Адаптивное разрешение</label>${tog('adaptive', 'Вкл', 'Выкл')}<span class="sub" style="color:var(--dim);font-size:12px">держит 40–60 FPS</span></div>
      <div class="row"><label>Показывать FPS</label>${tog('fpsShow', 'Вкл', 'Выкл')}</div>
      <div class="row"><label>Чувствительность</label><input type="range" min="0.4" max="2" step="0.05" value="${s.sens}" data-r="sens"><span>${s.sens.toFixed(2)}</span></div>
      <div class="row"><label>Инверсия тангажа</label>${tog('invert', 'Вкл', 'Выкл')}</div>
      <div class="row"><label>Помощь пилотированию</label>${tog('assist', 'Вкл (автовыравнивание)', 'Выкл')}</div>
      <div class="row"><label>Управление наклоном (гироскоп)</label>${tog('gyro', 'Вкл', 'Выкл')}</div>
      <div class="row"><label>Камера по умолчанию</label><button class="opt ${s.camera === 'chase' ? 'on' : ''}" data-cam="chase">От 3-го лица</button><button class="opt ${s.camera === 'cockpit' ? 'on' : ''}" data-cam="cockpit">Из кабины</button></div>
      <div class="row"><label>Размер HUD</label><input type="range" min="0.8" max="1.4" step="0.05" value="${s.hud}" data-r="hud"><span>${s.hud.toFixed(2)}</span></div>
      <div class="row"><label>Громкость</label><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-r="volume"></div>
      <div class="row"><label>Музыка</label><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-r="music"></div>
      <div class="sbox" style="margin:14px 0;font-size:13px;line-height:1.7;color:#c9d3dc"><b style="font-size:15px">Управление</b>
        ПК: W/S — тангаж (S — на себя), A/D — крен, Q/E — рысканье, Shift/Ctrl — тяга (100% = форсаж, B — форсаж), Пробел/ЛКМ — пушка, F/ПКМ — ракета, X — ловушки, T/Tab — смена цели, C — камера, V — взгляд назад, G — тормоз, M — мышь-джойстик, Esc — пауза.<br>
        Геймпад: левый стик — тангаж/крен, правый — рысканье/тяга, RT — пушка, A — ракета, B — ловушки, Y — камера, RB — цель.<br>
        Смартфон: джойстик слева (появляется под пальцем), кнопки справа, ползунок тяги у правого края, свайп по экрану — обзор.</div>
      <div class="btns"><button class="btn alt" data-a="reset">Сбросить прогресс</button></div></div>`);
    const panel = p.querySelector('.panel');
    panel.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]'); if (q) { s.quality = +q.dataset.q; persist(); this.app.setQuality(+q.dataset.q); this.settings(); return; }
      const t = e.target.closest('[data-tog]'); if (t) { s[t.dataset.tog] = !s[t.dataset.tog]; persist(); if (t.dataset.tog === 'gyro' && s.gyro) this.app.input.enableGyro(); this.settings(); return; }
      const c = e.target.closest('[data-cam]'); if (c) { s.camera = c.dataset.cam; persist(); this.settings(); return; }
      if (e.target.closest('[data-a=reset]') && confirm('Сбросить весь прогресс, кредиты и самолёты?')) { resetSave(); this.app.engine.setQuality(this.app.engine.qi); this.menu(); }
    });
    panel.addEventListener('input', (e) => { const r = e.target.dataset.r; if (!r) return; s[r] = +e.target.value; if (e.target.nextElementSibling) e.target.nextElementSibling.textContent = (+e.target.value).toFixed(2); this.app.audio.setVolume(); persist(); });
  }
  // ---------------- stats ----------------
  stats() {
    const s = save.stats;
    const box = (v, n) => `<div class="sbox"><b>${v}</b><span>${n}</span></div>`;
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '—';
    const contracts = CONTRACTS.map(c => { const v = Math.min(s[c.stat] || 0, c.goal); const done = v >= c.goal; const claimed = save.claimed.includes(c.id); return `<div class="contract"><div><b>${c.text}</b><div class="sub" style="color:var(--dim);font-size:12px">${c.stat === 'flightTime' ? Math.floor(v / 60) + ' / ' + c.goal / 60 + ' мин' : fmt(v) + ' / ' + fmt(c.goal)} • награда ⛁ ${fmt(c.reward)}</div></div><div class="b"><i style="width:${v / c.goal * 100}%"></i></div><button class="btn ${claimed ? 'alt' : ''}" data-c="${c.id}" ${done && !claimed ? '' : 'disabled'}>${claimed ? 'Получено' : 'Забрать'}</button></div>`; }).join('');
    const p = this.panel('Статистика', `<div class="scroll"><div class="statgrid">${box(fmt(s.kills), 'Сбито самолётов')}${box(fmt(s.ground), 'Наземных целей')}${box(s.wins + ' / ' + s.battles, 'Победы / бои')}${box(s.deaths, 'Потери')}${box(s.kills && s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills, 'K/D')}${box(acc, 'Точность пушки')}${box(fmt(s.gunKills), 'Побед пушкой')}${box(fmt(s.missileKills), 'Побед ракетой')}${box(fmt(s.missiles), 'Ракет выпущено')}${box(s.missions + ' / 10', 'Миссий пройдено')}${box(Math.floor(s.flightTime / 60) + ' мин', 'Налёт')}${box(fmt(s.earned), 'Заработано кредитов')}${box(fmt(s.best), 'Рекорд очков')}${box(save.owned.length + ' / 12', 'Самолётов в ангаре')}</div>
      <h2 style="margin:18px 0 6px;font-style:italic">Задания и контракты</h2>${contracts}</div>`, true);
    p.querySelector('.panel').addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b || b.disabled) return; const c = CONTRACTS.find(x => x.id === b.dataset.c); save.claimed.push(c.id); save.credits += c.reward; persist(); this.toast(`+${fmt(c.reward)} кредитов`); this.stats(); });
  }
  // ---------------- in-game ----------------
  game() { this.screen('game'); $('#touch').classList.toggle('on', this.app.input.isTouch); $('#fps').style.display = save.settings.fpsShow ? 'block' : 'none'; }
  blackout(G) { const el = $('#blackout'); const b = clamp((G - 8.2) / 3, 0, 0.85) + clamp((-G - 2.5) / 2, 0, 0.7); el.style.opacity = b; el.style.background = G < 0 ? 'radial-gradient(ellipse at center, rgba(120,0,0,0.2) 20%, rgba(120,0,0,0.9) 75%)' : 'radial-gradient(ellipse at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.95) 75%)'; }
  damageFlash(a) { const el = $('#dmg'); el.style.opacity = a; clearTimeout(this.dmgT); this.dmgT = setTimeout(() => el.style.opacity = 0, 160); }
  fps(v) { if (save.settings.fpsShow) $('#fps').textContent = Math.round(v) + ' FPS • ' + Math.round(this.app.engine.scale * 100) + '%'; }
  overlay(html) { const o = $('#overlay'); o.innerHTML = `<div class="overlay">${html}</div>`; o.classList.add('on'); return o; }
  hideOverlay() { $('#overlay').classList.remove('on'); $('#overlay').innerHTML = ''; }
  pause() {
    const o = this.overlay(`<div class="box"><h1>Пауза</h1><div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn" data-a="resume">Продолжить</button><button class="btn alt" data-a="cam">Камера: ${this.app.match.camMode === 'chase' ? '3-е лицо' : 'кабина'}</button><button class="btn alt" data-a="settings">Качество: ${QUALITY[this.app.engine.qi].name}</button><button class="btn alt" data-a="quit">Выйти в меню</button></div></div>`);
    o.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      if (a === 'resume') this.app.resume();
      if (a === 'cam') { const m = this.app.match; m.camMode = m.camMode === 'chase' ? 'cockpit' : 'chase'; save.settings.camera = m.camMode; persist(); this.pause(); }
      if (a === 'settings') { const q = (this.app.engine.qi + 1) % 5; save.settings.quality = q; persist(); this.app.engine.setQuality(q); this.app.engine.setScene(this.app.match.scene, this.app.match.camera); this.pause(); }
      if (a === 'quit') this.app.quit(); };
  }
  result(m) {
    const r = m.result;
    const o = this.overlay(`<div class="box"><h1 style="color:${r.win ? 'var(--green)' : 'var(--red)'}">${r.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h1><div style="color:var(--dim)">${m.mission ? `Миссия ${m.mission.id}: ${m.mission.name}` : m.mode === 'free' ? 'Свободный полёт' : 'Воздушный бой 5×5'}${r.reason ? ' — ' + r.reason : ''}</div>
      <div class="res"><div class="sbox"><b>${r.kills}</b><span>Сбито</span></div><div class="sbox"><b>${r.ground}</b><span>Наземных целей</span></div><div class="sbox"><b>${r.acc}%</b><span>Точность</span></div><div class="sbox"><b>${r.score}</b><span>Очки</span></div><div class="sbox"><b style="color:var(--acc)">+${fmt(r.credits)}</b><span>Кредиты</span></div><div class="sbox"><b>${fmt(save.credits)}</b><span>Баланс</span></div></div>
      ${r.first ? '<div style="color:var(--acc);font-weight:800;margin-bottom:8px">Миссия пройдена впервые! Открыта следующая.</div>' : ''}
      <div class="btns"><button class="btn" data-a="menu">В ангар</button><button class="btn alt" data-a="again">Ещё раз</button>${r.win && m.mission && m.mission.id < 10 ? '<button class="btn alt" data-a="next">Следующая миссия</button>' : ''}</div></div>`);
    o.onclick = (e) => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; const cfg = m.cfg;
      if (a === 'menu') this.app.quit();
      if (a === 'again') this.app.startMatch(cfg);
      if (a === 'next') this.app.startMatch({ mode: 'mission', mission: m.mission.id + 1 }); };
  }
}
function pickKey(obj, exclude = []) { const k = Object.keys(obj).filter(x => !exclude.includes(x)); return k[(Math.random() * k.length) | 0]; }
