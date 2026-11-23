// In-game HUD and overlays (objective, bars, prompts, subtitles, toasts, inventory, notes, keypad, radio, choices).
import { h, formatTime } from '../core/util.js';
import { ITEMS } from '../game/entities.js';
import { audio } from '../core/audio.js';
import { getProfile } from '../core/save.js';

const SHORT = { battery: 'БАТ', medkit: 'АПТ', fuse: 'ПРЕД', fuel: 'ТОПЛ', filter: 'ФИЛЬТР', gasmask: 'ПРОТИВОГАЗ', radio_part: 'ДЕТАЛЬ', keycard: 'КАРТА', flare: 'ФАЛЬШ', bottle: 'БУТ', crowbar: 'ЛОМ', tape: 'КАССЕТА', sample: 'ОБРАЗЕЦ', detonator: 'ДЕТОН', wire: 'КАБЕЛЬ', wheel: 'ШТУРВАЛ', flashlight: 'ФОНАРЬ' };

export class HUD {
  constructor(root, game) {
    this.root = root; this.game = game;
    this.el = h('div', { class: 'hud' });
    this.obj = h('div', { class: 'obj' }, this.objCh = h('div', { class: 'ch' }), this.objTx = h('div', { class: 'tx' }), this.objSub = h('div', { class: 'sub' }));
    this.cross = h('div', { class: 'cross' });
    this.prompt = h('div', { class: 'prompt hidden' });
    this.subs = h('div', { class: 'subs' });
    this.toasts = h('div', { class: 'toasts' });
    this.inv = h('div', { class: 'inv' });
    this.timer = h('div', { class: 'timer hidden' });
    this.coop = h('div', { class: 'coop-tag hidden' });
    this.fps = h('div', { class: 'fps hidden' });
    const bar = (cls, label) => { const i = h('i'); const el = h('div', {}, h('div', { class: 'bar-l' }, h('span', {}, label), h('span', { class: 'v' })), h('div', { class: 'bar ' + cls }, i)); el.fill = i; el.val = el.querySelector('.v'); return el; };
    this.hp = bar('hp', 'ЗДОРОВЬЕ'); this.st = bar('st', 'ВЫНОСЛИВОСТЬ'); this.bat = bar('bat', 'ФОНАРЬ');
    this.bars = h('div', { class: 'bars' }, this.hp, this.st, this.bat);
    this.noise = h('div', { class: 'noise hidden' }, 'ШУМ', h('div', { class: 'bar' }, this.noiseFill = h('i')));
    this.fadeEl = h('div', { class: 'fade' });
    this.el.append(this.obj, this.cross, this.prompt, this.subs, this.toasts, this.inv, this.bars, this.noise, this.timer, this.coop, this.fps);
    root.append(this.el, this.fadeEl);
    this.subQueue = []; this.subT = 0;
    this.modal = null;
  }

  show(v) { this.el.classList.toggle('hidden', !v); }

  setObjective(def, step) {
    this.objCh.textContent = `Глава ${def.chapter} · ${def.num}. ${def.title}`;
    this.objTx.style.opacity = 0;
    setTimeout(() => { this.objTx.textContent = step?.text || ''; this.objSub.textContent = step?.sub || ''; this.objTx.style.opacity = 1; }, 250);
  }
  hint(text) { this.objSub.textContent = 'Подсказка: ' + text; this.toast('Подсказка: ' + text); }

  setPrompt(e, holdK = 0) {
    if (!e) { this.prompt.classList.add('hidden'); this.cross.classList.remove('act'); return; }
    const text = typeof e.prompt === 'function' ? e.prompt() : e.prompt;
    this.prompt.classList.remove('hidden');
    this.cross.classList.add('act');
    const key = this.game.touch?.visible ? '' : 'E';
    this.prompt.innerHTML = '';
    this.prompt.append(key ? h('kbd', {}, key) : '', text);
    if (e.hold) this.prompt.append(h('div', { class: 'prog' }, h('i', { style: { width: Math.round(holdK * 100) + '%' } })));
  }

  subtitle(text, dur = 4, who) {
    if (!getProfile().settings.subtitles) return;
    this.subQueue.push({ text, dur, who });
    if (this.subQueue.length === 1) this._showSub();
  }
  _showSub() {
    const s = this.subQueue[0];
    if (!s) { this.subs.innerHTML = ''; return; }
    this.subs.innerHTML = '';
    if (s.who) this.subs.append(h('span', { class: 'who' }, s.who + ':'));
    this.subs.append(s.text);
    this.subT = s.dur;
  }

  toast(text, kind = '') {
    const t = h('div', { class: 'toast ' + kind }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = 0; setTimeout(() => t.remove(), 500); }, 3200);
  }

  setTimer(t, label) {
    if (t === null || t === undefined) { this.timer.classList.add('hidden'); return; }
    this.timer.classList.remove('hidden');
    this.timer.textContent = `${label ? label + ' ' : ''}${formatTime(t)}`;
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (!p) return;
    this.hp.fill.style.width = p.health + '%'; this.hp.val.textContent = Math.round(p.health);
    this.st.fill.style.width = p.stamina + '%'; this.st.val.textContent = '';
    this.bat.fill.style.width = p.battery + '%'; this.bat.val.textContent = p.hasFlashlight ? Math.round(p.battery) + '%' : '—';
    this.st.style.opacity = p.stamina < 99 ? 1 : 0.35;
    // inventory
    const key = JSON.stringify(p.inventory);
    if (key !== this._invKey) {
      this._invKey = key;
      this.inv.innerHTML = '';
      for (const [id, n] of Object.entries(p.inventory)) {
        if (id === 'flashlight') continue;
        this.inv.append(h('div', { class: 'it', title: ITEMS[id]?.name || id }, SHORT[id] || (ITEMS[id]?.name || id).slice(0, 6).toUpperCase(), n > 1 ? h('b', {}, n) : ''));
      }
    }
    // noise meter in stealth missions
    if (g.mission?.env?.noiseMeter) { this.noise.classList.remove('hidden'); this.noiseFill.style.width = Math.min(100, p.noise * 100) + '%'; } else this.noise.classList.add('hidden');
    // subtitles
    if (this.subQueue.length) { this.subT -= dt; if (this.subT <= 0) { this.subQueue.shift(); this._showSub(); } }
    if (getProfile().settings.showFps) { this.fps.classList.remove('hidden'); const i = g.engine.renderer.info.render; this.fps.textContent = `${Math.round(g.engine.fps)} FPS · ${i.calls} dc · ${(i.triangles / 1000).toFixed(0)}k tri · ${(g.engine.pixelRatio()).toFixed(2)}x`; } else this.fps.classList.add('hidden');
  }

  setCoop(text) { this.coop.classList.toggle('hidden', !text); this.coop.innerHTML = text || ''; }

  fade(out, sec = 1) {
    return new Promise((r) => { this.fadeEl.style.transition = `opacity ${sec}s`; this.fadeEl.style.opacity = out ? 1 : 0; setTimeout(r, sec * 1000); });
  }
  setFade(v) { this.fadeEl.style.transition = 'none'; this.fadeEl.style.opacity = v; }

  cineTitle(a, b) {
    const el = h('div', { class: 'cine-title' }, h('div', { class: 'a' }, a), h('div', { class: 'b' }, b));
    this.root.append(el);
    setTimeout(() => el.remove(), 5200);
  }
  letterbox(on) { this.root.classList.toggle('letterbox', on); }

  // ---------------- modal overlays ----------------
  openModal(content, { closable = true, onClose } = {}) {
    this.closeModal();
    const ov = h('div', { class: 'overlay' }, content);
    if (closable) ov.addEventListener('pointerdown', (e) => { if (e.target === ov) this.closeModal(); });
    this.root.append(ov);
    this.modal = { el: ov, onClose };
    this.game.setModal(true);
    return ov;
  }
  closeModal() {
    if (!this.modal) return;
    const m = this.modal; this.modal = null;
    m.el.remove();
    this.game.setModal(false);
    m.onClose && m.onClose();
  }

  showNote(title, text, sign) {
    audio.play('ui', { bus: 'ui' });
    const note = h('div', { class: 'note' }, h('h4', {}, title || 'Записка'), ...String(text).split('\n').map((l) => h('p', { style: { margin: '0 0 8px' } }, l)), sign ? h('div', { class: 'sign' }, sign) : '', h('div', { style: { textAlign: 'center', marginTop: '16px' } }, h('button', { class: 'btn small', onclick: () => this.closeModal() }, 'Закрыть')));
    this.openModal(note);
  }

  keypad(code, cb) {
    let entry = '';
    const screen = h('div', { class: 'kp-screen' }, '----');
    const press = (k) => {
      audio.play('click', { bus: 'ui' });
      if (k === 'C') entry = '';
      else if (k === 'OK') {
        if (entry === String(code)) { screen.textContent = 'ОТКРЫТО'; screen.style.color = '#6f6'; setTimeout(() => { this.closeModal(); cb(true); }, 500); return; }
        screen.textContent = 'ОШИБКА'; screen.style.color = '#f55'; audio.play('buzz', { bus: 'ui', volume: 0.4 }); entry = ''; setTimeout(() => { screen.style.color = ''; screen.textContent = '----'; }, 700); return;
      } else if (entry.length < 6) entry += k;
      screen.textContent = entry.padEnd(4, '-');
    };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    const dlg = h('div', { class: 'dialog' }, h('h3', {}, 'Кодовый замок'), screen, h('div', { class: 'keypad' }, keys.map((k) => h('button', { onclick: () => press(k) }, k))), h('div', { style: { marginTop: '12px', textAlign: 'center' } }, h('button', { class: 'btn small', onclick: () => this.closeModal() }, 'Отмена')));
    this.openModal(dlg);
    const kh = (e) => { if (!this.modal) { window.removeEventListener('keydown', kh); return; } if (/^[0-9]$/.test(e.key)) press(e.key); if (e.key === 'Enter') press('OK'); if (e.key === 'Backspace') press('C'); };
    window.addEventListener('keydown', kh);
  }

  radio(target, cb) {
    let f = 88 + Math.random() * 6;
    const freq = h('div', { class: 'radio-freq' }, f.toFixed(1));
    const sig = h('i', { style: { width: '0%' } });
    const range = h('input', { type: 'range', class: 'radio-dial', min: 87.5, max: 108, step: 0.1, value: f });
    let st = audio.play('radio_static', { bus: 'ui', loop: true, volume: 0.35 });
    let lockT = 0, done = false;
    const upd = () => {
      f = +range.value; freq.textContent = f.toFixed(1) + ' МГц';
      const s = Math.max(0, 1 - Math.abs(f - target) / 1.2);
      sig.style.width = Math.round(s * 100) + '%';
      st && st.setVolume(0.35 * (1 - s * 0.85));
    };
    range.addEventListener('input', upd);
    const timer = setInterval(() => {
      if (done) return;
      const s = Math.max(0, 1 - Math.abs(f - target) / 1.2);
      lockT = s > 0.9 ? lockT + 0.1 : 0;
      if (lockT > 1.0) { done = true; clearInterval(timer); freq.style.color = '#6f6'; setTimeout(() => { this.closeModal(); cb(); }, 400); }
    }, 100);
    const dlg = h('div', { class: 'dialog' }, h('h3', {}, 'Радиостанция'), freq, h('div', { class: 'sig' }, sig), range, h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Поймайте сигнал и удерживайте частоту.'), h('button', { class: 'btn small', onclick: () => this.closeModal() }, 'Закрыть'));
    this.openModal(dlg, { onClose: () => { clearInterval(timer); st && st.stop(); st = null; } });
    upd();
  }

  choice(title, options) {
    const dlg = h('div', { class: 'dialog choice' }, h('h3', {}, title), ...options.map((o) => h('button', { class: 'btn', style: { width: '100%' }, onclick: () => { this.closeModal(); o.cb(); } }, o.text)));
    this.openModal(dlg, { closable: false });
  }

  dispose() { this.el.remove(); this.fadeEl.remove(); this.closeModal(); }
}
