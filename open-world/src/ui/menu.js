// Main menu, settings (graphics/audio/controls/touch layout), controls help, about, pause
import { G } from '../core/util.js';
import { settings, saveSettings, PRESETS, hasSave, IS_MOBILE } from '../core/save.js';
import { layoutTouch, touchEditing, resetTouchLayout, I } from '../core/input.js';

const $ = (id) => document.getElementById(id);

export class Menu {
  constructor(game) {
    this.game = game;
    $('bCont').onclick = () => { this.click(); game.start(false); };
    $('bNew').onclick = () => { this.click(); if (!hasSave() || confirm('Начать новую игру? Текущий прогресс будет удалён.')) game.start(true); };
    $('bSet').onclick = () => { this.click(); this.settings(); };
    $('bCtl').onclick = () => { this.click(); this.controls(); };
    $('bAbout').onclick = () => { this.click(); this.about(); };
  }
  click() { G.audio.init(); G.audio.beep(700, 0.05, 0.08); if (!G.playing) G.audio.menuMusic(true); }
  showMain(on) {
    $('menu').classList.toggle('hidden', !on);
    $('bCont').disabled = !hasSave();
    $('bCont').textContent = hasSave() ? 'Продолжить' : 'Продолжить (нет сохранения)';
  }
  panel(id, html) {
    for (const p of ['settings', 'controls', 'about', 'pause', 'shop']) if (p !== id) $(p).classList.add('hidden');
    const el = $(id); el.innerHTML = `<button class="close" data-close>✕</button>` + html; el.classList.remove('hidden');
    el.querySelector('[data-close]').onclick = () => this.close(id);
    G.uiOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    return el;
  }
  close(id) { $(id).classList.add('hidden'); G.uiOpen = !!document.querySelector('.panel:not(.hidden)') || (this.game.hud && this.game.hud.mapOpen); if (id === 'pause' && G.paused) this.game.resume(); }
  settings() {
    const s = settings;
    const seg = (name, opts, cur) => `<div class="seg" data-k="${name}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const rng = (name, min, max, step, val) => `<input type="range" data-k="${name}" min="${min}" max="${max}" step="${step}" value="${val}">`;
    const el = this.panel('settings', `<h2>Настройки</h2>
      <div class="row"><label>Качество графики</label>${seg('quality', Object.entries(PRESETS).map(([k, p]) => [k, p.name]), s.quality)}</div>
      <div class="row"><label>Адаптивное разрешение</label>${seg('adaptive', [[true, 'Вкл'], [false, 'Выкл']], s.adaptive)}</div>
      <div class="row"><label>Поле зрения (FOV)</label>${rng('fov', 50, 85, 1, s.fov)}</div>
      <div class="row"><label>Чувствительность камеры</label>${rng('sens', 0.3, 2.5, 0.05, s.sens)}</div>
      <div class="row"><label>Инверсия оси Y</label>${seg('invertY', [[false, 'Нет'], [true, 'Да']], s.invertY)}</div>
      <div class="row"><label>Общая громкость</label>${rng('master', 0, 1, 0.05, s.master)}</div>
      <div class="row"><label>Музыка / радио</label>${rng('music', 0, 1, 0.05, s.music)}</div>
      <div class="row"><label>Эффекты</label>${rng('sfx', 0, 1, 0.05, s.sfx)}</div>
      <div class="row"><label>Субтитры</label>${seg('subtitles', [[true, 'Вкл'], [false, 'Выкл']], s.subtitles)}</div>
      <h2 style="margin-top:18px">Сенсорное управление</h2>
      <div class="row"><label>Размер кнопок</label>${rng('t_scale', 0.6, 1.6, 0.05, s.touch.scale)}</div>
      <div class="row"><label>Прозрачность</label>${rng('t_opacity', 0.1, 0.7, 0.05, s.touch.opacity)}</div>
      <div class="row"><label>Схема</label>${seg('t_left', [[false, 'Джойстик слева'], [true, 'Джойстик справа']], s.touch.left)}</div>
      <div class="row"><label>Расположение кнопок</label><div class="seg"><button data-act="edit">Перетащить кнопки</button><button data-act="reset">Сбросить</button></div></div>
      <p style="opacity:.6;font-size:13px">Качество «Низкое» рекомендуется для старых телефонов, «Ультра» — для мощных ПК (GTAO, тени 4K, MSAA).</p>`);
    el.querySelectorAll('.seg[data-k] button').forEach((b) => b.onclick = () => {
      const k = b.parentElement.dataset.k; let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false;
      b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (k.startsWith('t_')) settings.touch[k.slice(2)] = v; else settings[k] = v;
      saveSettings();
      if (k === 'quality') this.game.applyQuality();
      if (k.startsWith('t_')) layoutTouch();
    });
    el.querySelectorAll('input[type=range]').forEach((r) => r.oninput = () => {
      const k = r.dataset.k, v = parseFloat(r.value);
      if (k.startsWith('t_')) settings.touch[k.slice(2)] = v; else settings[k] = v;
      saveSettings(); G.audio.applyVolume(); if (k.startsWith('t_')) layoutTouch();
    });
    el.querySelector('[data-act=edit]').onclick = () => {
      this.close('settings'); touchEditing(true);
      this.game.hud.hint('Перетащите кнопки. Нажмите «Готово» вверху, чтобы сохранить.', 30);
      const done = document.createElement('button'); done.className = 'btn small'; done.textContent = '✓ Готово'; done.style.cssText = 'position:fixed;top:50px;left:50%;transform:translateX(-50%);z-index:90';
      document.body.appendChild(done);
      document.getElementById('touch').classList.remove('hidden');
      done.onclick = () => { touchEditing(false); done.remove(); if (!I.touch) document.getElementById('touch').classList.add('hidden'); };
    };
    el.querySelector('[data-act=reset]').onclick = () => resetTouchLayout();
  }
  controls() {
    this.panel('controls', `<h2>Управление</h2>
      <h3>ПК — пешком</h3><p>WASD — движение · Shift — бег · Пробел — прыжок · ЛКМ — удар/огонь · ПКМ — прицел · Колесо/Q/Tab/1-6 — оружие · R — перезарядка · F — сесть/угнать авто · E — действие (магазины, двери) · M — карта · Esc — пауза</p>
      <h3>ПК — за рулём</h3><p>W — газ · S — тормоз/задний ход · A/D — руль · Пробел — ручник (занос) · H — сигнал · N — радио · V — камера · G — сирена (полиция) · F — выйти (на скорости — выпрыгнуть)</p>
      <h3>Смартфон</h3><p>Левая часть экрана — плавающий джойстик, правая — обзор. Кнопки справа: огонь, прицел (переключатель), прыжок, бег, сесть, оружие. В машине: газ, тормоз, ручник, выйти, сигнал, камера, радио. Расположение и размер настраиваются в «Настройках».</p>
      <h3>Советы</h3><p>Жёлтые круги на карте — сюжетные миссии. Зелёные «$» — магазины, автосалон, недвижимость. Покупайте недвижимость — она приносит доход каждый игровой день. Игра сохраняется автоматически.</p>`);
  }
  about() {
    this.panel('about', `<h2>Обратная сторона города</h2>
      <p>Браузерная игра с открытым миром: процедурный мегаполис с районами (деловой центр, спальные кварталы, промзона, порт, пляж, лес, пригород, аэропорт), живыми NPC, трафиком, полицией, физикой Rapier и сюжетом из 25 миссий с тремя концовками.</p>
      <p><b>Технологии:</b> Three.js (WebGL2, PBR, GTAO, Bloom, ACES), Rapier 3D (физика автомобилей, рэгдоллы, разрушения), WebAudio (процедурный звук и радио).</p>
      <p><b>Ассеты:</b> PBR-текстуры и модели пропсов — Poly Haven (CC0). Модель персонажа — пример из three.js (Mixamo-риг). Всё остальное — процедурная генерация.</p>
      <p style="opacity:.6">Все персонажи, организации и события вымышлены.</p>`);
  }
  pause() {
    const el = this.panel('pause', `<h2>Пауза</h2>
      <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn" data-a="resume">▶ Продолжить</button>
      <button class="btn" data-a="map">🗺 Карта</button>
      <button class="btn" data-a="stats">📊 Статистика</button>
      <button class="btn" data-a="settings">⚙ Настройки</button>
      <button class="btn" data-a="save">💾 Сохранить</button>
      ${G.missionActive ? '<button class="btn" data-a="abort">✕ Прервать миссию</button>' : ''}
      <button class="btn" data-a="menu">⏏ Главное меню</button></div>`);
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') this.close('pause');
      if (a === 'map') { this.close('pause'); this.game.hud.toggleMap(true); }
      if (a === 'settings') this.settings();
      if (a === 'save') { this.game.save(); this.game.hud.notify('💾 Игра сохранена'); }
      if (a === 'abort') { this.game.missions.fail('Миссия прервана'); this.close('pause'); }
      if (a === 'menu') { this.game.save(); location.reload(); }
      if (a === 'stats') {
        const s = G.state.stats;
        this.panel('pause', `<h2>Статистика</h2><div class="row"><label>Пройдено миссий</label><b>${G.state.completed.length} / 25</b></div><div class="row"><label>Время в игре</label><b>${Math.round(s.time / 60)} мин</b></div><div class="row"><label>Пройдено (км)</label><b>${(s.distance / 1000).toFixed(1)}</b></div><div class="row"><label>Аварий</label><b>${s.crashes}</b></div><div class="row"><label>Нейтрализовано</label><b>${s.kills}</b></div><div class="row"><label>Недвижимость</label><b>${G.state.props.length}</b></div><div class="row"><label>Автомобили</label><b>${G.state.cars.length}</b></div>`);
      }
    });
  }
}
