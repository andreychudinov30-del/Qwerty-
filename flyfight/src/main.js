import * as THREE from 'three';
import { Engine } from './engine.js';
import { Hangar } from './hangar.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { Match } from './match.js';
import { save, persist } from './save.js';
import { panelTextures, liveryTexture } from './textures.js';
import { AIRCRAFT } from './data.js';

class App {
  constructor() {
    this.engine = new Engine(document.getElementById('gl'));
    this.audio = new Audio(); this.input = new Input();
    this.ui = new UI(this);
    this.state = 'boot'; this.paused = false; this.last = performance.now(); this.fpsAcc = 0; this.fpsN = 0;
    const unlock = () => { this.audio.init(); if (this.state === 'menu') this.audio.music(true); };
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'game' && !this.paused) this.pause(); });
    if (save.settings.gyro) this.input.enableGyro();
    window.__app = this;
  }
  async boot() {
    this.ui.progress(0.1, 'Процедурные текстуры...'); await frame();
    panelTextures(); this.ui.progress(0.4, 'Ангар...'); await frame();
    liveryTexture(AIRCRAFT.find(a => a.id === save.selected).livery);
    this.hangar = new Hangar(this.engine); this.ui.progress(0.8, 'Самолёт...'); await frame();
    this.hangar.show(save.selected);
    this.ui.progress(1, 'Готово'); await frame();
    this.ui.menu();
    this.loop();
    const q = new URLSearchParams(location.search);
    if (q.get('mission')) this.startMatch({ auto: !!q.get('auto'), mode: 'mission', mission: +q.get('mission') });
    else if (q.get('battle')) this.startMatch({ auto: !!q.get('auto'), mode: 'battle', map: q.get('map') || 'valley', time: q.get('time') || 'noon', weather: q.get('weather') || 'scattered' });
    else if (q.get('free')) this.startMatch({ mode: 'free', map: q.get('map') || 'valley', time: q.get('time') || 'afternoon', weather: q.get('weather') || 'scattered', enemies: 0 });
  }
  toMenuScene() { this.state = 'menu'; this.hangar.active = true; this.engine.setScene(this.hangar.scene, this.hangar.camera); this.audio.music(true); }
  setQuality(i) { this.engine.setQuality(i); if (this.state === 'menu') this.engine.setScene(this.hangar.scene, this.hangar.camera); }
  ensureFullscreen() {
    if (!this.input.isTouch) return;
    const el = document.documentElement;
    try { if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); } catch (e) { }
  }
  async startMatch(cfg) {
    if (this.match) { this.match.dispose(); this.match = null; }
    this.ui.hideOverlay(); this.state = 'loading'; this.hangar.active = false; this.audio.music(false);
    this.ui.loading(); this.input.enabled = false;
    const m = new Match(this, cfg); m.hud = new HUD(document.getElementById('hud'));
    try { await m.load((p, t) => this.ui.progress(p, t)); }
    catch (e) { console.error(e); alert('Ошибка загрузки: ' + e.message); this.ui.menu(); return; }
    this.match = m; this.state = 'game'; this.paused = false; this.input.enabled = true; this.input.throttle = 0.8;
    this.ui.game();
    if (m.mission) m.hud.banner(`Миссия ${m.mission.id}: ${m.mission.name}`, '#ffd34d', 3.5);
    else m.hud.banner(m.type === 'free' ? 'Свободный полёт' : 'Воздушный бой 5 на 5', '#ffd34d', 3);
    this.last = performance.now();
  }
  pause() { if (this.state !== 'game' || this.paused) return; this.paused = true; this.input.enabled = false; this.audio.stopEngine(); if (document.pointerLockElement) document.exitPointerLock(); this.ui.pause(); }
  resume() { this.paused = false; this.input.enabled = true; this.ui.hideOverlay(); this.audio.startEngine(); this.last = performance.now(); }
  quit() { this.ui.hideOverlay(); if (this.match) { this.match.dispose(); this.match = null; } this.input.enabled = false; this.paused = false; this.ui.menu(); }
  showResult(m) { if (m !== this.match) return; this.input.enabled = false; this.audio.stopEngine(); this.ui.result(m); this.paused = true; }
  loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const now = performance.now(); let dt = (now - this.last) / 1000; this.last = now; dt = Math.min(dt, 0.1);
      if (this.state === 'menu') { this.hangar.update(dt); this.engine.render(dt); }
      else if (this.state === 'game' && this.match) {
        if (!this.paused) this.match.update(dt);
        this.engine.render(dt);
        this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 0.5) { this.ui.fps(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
      }
    };
    tick();
  }
}
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
new App().boot();
