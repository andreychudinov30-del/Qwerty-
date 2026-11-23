// METRO HORROR: Последний поезд — application shell (boot, preloading, menu, mission flow, render loop).
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { loadProfile, getProfile, saveProfile } from './core/save.js';
import { initInput, input, exitLock, resetInput } from './core/input.js';
import { TouchControls } from './core/touch.js';
import { audio } from './core/audio.js';
import { manager, tex, loadModel, setAnisotropy } from './core/assets.js';
import { h, bus, isTouch, isMobile, sleep } from './core/util.js';
import { Menu } from './ui/menu.js';
import { MenuScene } from './ui/menuScene.js';
import { Game } from './game/game.js';
import { missionById } from './data/missions.js';
import { PROP_MODELS } from './world/decor.js';
import { backend } from './net/backend.js';
import { Coop } from './net/coop.js';
import { initPhysics } from './core/physics.js';

const TEXTURES = ['dirty_tiles', 'worn_tile_floor', 'granite_tile', 'square_tiled_wall', 'worn_plaster_wall', 'peeling_painted_wall', 'concrete_wall_008', 'rebar_reinforced_concrete', 'dirty_concrete', 'gravel_floor', 'concrete_floor_worn_001', 'rusty_metal_02', 'metal_plate', 'rusty_painted_metal', 'green_metal_rust', 'metal_grate_rusty', 'corrugated_iron', 'long_white_tiles', 'painted_concrete', 'old_planks_02', 'damaged_concrete_floor', 'rubble', 'concrete_panels', 'worn_cracked_plaster'];

class App {
  constructor() {
    this.canvas = document.getElementById('game');
    this.uiRoot = document.getElementById('ui-root');
    this.bootEl = document.getElementById('boot');
    this.game = null; this.menuScene = null;
    this.clock = new THREE.Clock();
  }

  bootProgress(k, text) {
    const f = document.getElementById('boot-fill'); if (f) f.style.width = Math.round(k * 100) + '%';
    const t = document.getElementById('boot-text'); if (t && text) t.textContent = text;
  }

  async boot() {
    loadProfile();
    try { this.engine = new Engine(this.canvas); }
    catch (e) { this.fatal('Ваше устройство не поддерживает WebGL2. Попробуйте обновить браузер.'); return; }
    window.__app = this;
    setAnisotropy(Math.min(this.engine.maxAniso, this.engine.quality.aniso));
    initInput(this.canvas);
    this.touch = new TouchControls(this.uiRoot);
    this.menu = new Menu(this);
    this.coop = new Coop(this);
    // unlock audio on first gesture (required by iOS/Chrome)
    const unlock = () => { audio.init(); audio.applyVolumes(); audio.lowQuality = this.engine.quality.lights <= 3; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    bus.on('engine:contextlost', () => this.fatal('Видеокарта сбросила контекст WebGL. Игра будет перезапущена...', true));
    bus.on('action', (a) => { if (a === 'pauseFromUnlock' && this.game && !this.game.paused && !this.game.modalOpen && !this.game.cutscene && !this.game.dead && !this.game.completed) this.game.pause(); });
    // preload assets with progress
    this.bootProgress(0.02, 'Физический движок');
    await initPhysics();
    const total = TEXTURES.length * 3 + PROP_MODELS.length + 1;
    let done = 0;
    const step = (label) => { done++; this.bootProgress(0.05 + (done / total) * 0.75, label); };
    for (const t of TEXTURES) for (const k of ['diff', 'nor', 'arm']) tex(t, k);
    manager.onProgress = (url, loaded, all) => this.bootProgress(0.05 + (loaded / Math.max(all, total)) * 0.75, 'Загрузка ресурсов ' + loaded + '/' + all);
    await Promise.all([...PROP_MODELS.map((m) => loadModel(m).then(() => step('Модели'))), loadModel('Soldier').then(() => step('Персонаж'))]);
    await new Promise((r) => { if (manager.itemsLoaded >= manager.itemsTotal) r(); else { const prev = manager.onLoad; manager.onLoad = () => { prev && prev(); r(); }; setTimeout(r, 15000); } });
    this.bootProgress(0.85, 'Станция «Заря»');
    await this.showMenu();
    this.bootProgress(1, 'Готово');
    this.bootEl.classList.add('hide');
    setTimeout(() => this.bootEl.remove(), 900);
    this.loop();
    if (backend.configured) { backend.ensurePlayer().then(() => this.menu.refreshTop()).catch(() => {}); backend.startLoop(); }
    // rejoin room after page reload
    try { const code = sessionStorage.getItem('mh_room'); if (code) this.coop.join(code).then(() => this.menu.openOnline()).catch(() => sessionStorage.removeItem('mh_room')); } catch (e) { /* ignore */ }
    // URL helpers: ?mission=c1m3 (direct start), ?join=123456
    const qs = new URLSearchParams(location.search);
    if (qs.get('join')) this.coop.join(qs.get('join')).then(() => this.menu.openOnline()).catch((e) => this.toast(e.message, 'warn'));
    if (qs.get('mission') && missionById(qs.get('mission'))) { if (qs.get('unlock')) getProfile().devUnlock = true; this.startMission(qs.get('mission')); }
  }

  fatal(msg, reload = false) {
    const el = h('div', { class: 'overlay', style: { zIndex: 100 } }, h('div', { class: 'dialog' }, h('h3', {}, 'Ошибка'), h('p', {}, msg), h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Перезапустить')));
    this.uiRoot.append(el);
    if (reload) setTimeout(() => location.reload(), 4000);
  }

  toast(text, kind = '') {
    let box = document.querySelector('.app-toasts');
    if (!box) { box = h('div', { class: 'toasts app-toasts', style: { zIndex: 60 } }); this.uiRoot.append(box); }
    const t = h('div', { class: 'toast ' + kind }, text);
    box.append(t);
    setTimeout(() => { t.style.opacity = 0; t.style.transition = 'opacity .5s'; setTimeout(() => t.remove(), 600); }, 3500);
  }

  async showMenu() {
    this.touch.show(false);
    input.enabled = false;
    if (!this.menuScene) {
      this.menuScene = new MenuScene(this.engine);
      await this.menuScene.build();
    } else this.engine.setView(this.menuScene.scene, this.menuScene.camera);
    this.menu.show();
    audio.stopAllLoops(0.5);
    if (audio.ready) audio.loop('menu_drone', 'drone', { bus: 'amb', volume: 0.5 });
  }

  async startMission(id, opts = {}) {
    const def = missionById(id);
    if (!def) return;
    this.menu.hide();
    exitLock(); resetInput();
    audio.init();
    // loading screen
    const fill = h('div', { id: 'load-fill', style: { height: '100%', width: '0%', background: 'linear-gradient(90deg,#7a1b10,#c8321f)', transition: 'width .2s' } });
    const txt = h('div', { class: 'boot-text' }, 'Загрузка...');
    const loading = h('div', { class: 'boot', style: { zIndex: 45 } },
      h('div', { class: 'boot-sub', style: { letterSpacing: '.4em' } }, `ГЛАВА ${def.chapter} · МИССИЯ ${def.num}`),
      h('div', { class: 'boot-title', style: { fontSize: 'clamp(30px,6vw,64px)' } }, def.title.toUpperCase()),
      h('div', { class: 'muted', style: { maxWidth: '520px', textAlign: 'center', padding: '0 20px', marginTop: '8px' } }, def.desc),
      h('div', { class: 'boot-bar' }, fill), txt,
      h('div', { class: 'boot-warn' }, isTouch() ? 'Левая часть экрана — движение, правая — обзор. Кнопки можно переставить в настройках.' : 'WASD — движение · Shift — бег · Ctrl — присесть · E — действие · F — фонарь'));
    this.uiRoot.append(loading);
    await sleep(30);
    if (this.game) { this.game.dispose(); this.game = null; }
    if (this.menuScene) { this.menuScene.dispose(); this.menuScene = null; }
    audio.stopAll();
    const game = new Game(this, def, opts);
    try {
      await game.load((k, t) => { fill.style.width = Math.round(k * 100) + '%'; if (t) txt.textContent = t; });
    } catch (e) {
      console.error(e);
      loading.remove();
      game.dispose();
      this.toast('Ошибка загрузки миссии: ' + e.message, 'warn');
      await this.showMenu();
      return;
    }
    this.game = game;
    loading.style.transition = 'opacity .6s'; loading.style.opacity = 0;
    setTimeout(() => loading.remove(), 700);
    input.enabled = true;
    const touch = isTouch() || isMobile();
    this.touch.show(touch);
    input.touchActive = touch;
    if (opts.net) backend.status = 'game';
    game.begin();
  }

  async toMenu() {
    if (this.game) { this.game.dispose(); this.game = null; }
    exitLock();
    this.touch.show(false);
    input.enabled = false;
    await this.showMenu();
    if (this.coop.room) this.menu.openOnline();
  }

  openTouchEditor() {
    const wasVisible = this.touch.visible;
    this.touch.show(true);
    this.touch.openEditor(() => { if (!wasVisible) this.touch.show(false); });
  }

  openSettingsOverlay() {
    const body = this.menu.settingsBody(true);
    const el = h('div', { class: 'overlay', style: { zIndex: 30 } }, h('div', { class: 'dialog', style: { width: 'min(96vw, 820px)' } }, h('div', { class: 'row', style: { marginBottom: '10px' } }, h('h3', { style: { margin: 0 } }, 'Настройки'), h('div', { class: 'grow' }), h('button', { class: 'btn small', onclick: () => el.remove() }, 'Закрыть')), body));
    this.uiRoot.append(el);
  }

  loop() {
    const frame = () => {
      requestAnimationFrame(frame);
      let dt = this.clock.getDelta();
      if (dt > 0.1) dt = 0.1;
      try {
        if (this.game && !this.game.disposed) {
          this.game.update(dt);
          this.game.applyCutCam();
        } else if (this.menuScene) {
          this.menuScene.update(dt);
        }
        this.engine.render(dt);
        this.engine.adapt(dt);
      } catch (e) {
        console.error(e);
        if (!this._errShown) { this._errShown = true; this.toast('Ошибка: ' + e.message, 'warn'); window.__err = String(e.stack || e); }
      }
    };
    requestAnimationFrame(frame);
  }
}

const app = new App();
app.boot().catch((e) => { console.error(e); window.__err = String(e.stack || e); app.fatal('Не удалось запустить игру: ' + e.message); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
void saveProfile;
