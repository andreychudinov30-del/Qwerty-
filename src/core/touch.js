// Mobile touch controls: floating joystick, look area, action buttons (true multi-touch via pointer IDs),
// plus a layout editor (drag / resize / opacity, saved to profile).
import { input } from './input.js';
import { getProfile, saveProfile, DEFAULT_TOUCH_LAYOUT } from './save.js';
import { h, bus } from './util.js';

const BUTTONS = [
  { id: 'run', label: 'БЕГ', mode: 'run' },
  { id: 'crouch', label: 'ПРИСЕД', mode: 'crouch' },
  { id: 'interact', label: 'ДЕЙСТВ.', mode: 'interact' },
  { id: 'flashlight', label: 'ФОНАРЬ', mode: 'tap' },
  { id: 'jump', label: 'ЛАЗ', mode: 'tap' },
  { id: 'throw', label: 'БРОСОК', mode: 'tap' },
  { id: 'item', label: 'АПТЕЧКА', mode: 'tap' },
  { id: 'reload', label: 'БАТАРЕЯ', mode: 'tap' },
];

export class TouchControls {
  constructor(root) {
    this.root = root;
    this.el = h('div', { class: 'touch hidden' });
    root.appendChild(this.el);
    this.buttons = {};
    this.joy = null;
    this.lookId = null;
    this.visible = false;
    this.build();
  }

  layout() { return getProfile().settings.touchLayout || DEFAULT_TOUCH_LAYOUT; }

  build() {
    this.el.innerHTML = '';
    const L = this.layout();
    this.joyZone = h('div', { class: 'joy-zone' });
    this.lookZone = h('div', { class: 'look-zone' });
    this.joyEl = h('div', { class: 'joy' }, h('i'));
    this.el.append(this.lookZone, this.joyZone, this.joyEl);
    this.pauseBtn = h('button', { class: 'tpause', onpointerdown: (e) => { e.preventDefault(); input.pressed.add('pause'); bus.emit('action', 'pause'); } }, 'II');
    this.el.append(this.pauseBtn);
    for (const b of BUTTONS) {
      const conf = L[b.id] || DEFAULT_TOUCH_LAYOUT[b.id];
      const el = h('div', { class: 'tbtn', 'data-id': b.id }, b.label);
      this.place(el, conf, L);
      this.el.append(el);
      this.buttons[b.id] = el;
      this.bindButton(el, b);
    }
    this.bindJoystick();
    this.bindLook();
    this.applyOpacity();
  }

  place(el, conf, L) {
    const s = (conf.size || 60) * (L.scale || 1);
    el.style.left = conf.x + '%';
    el.style.top = conf.y + '%';
    el.style.width = s + 'px';
    el.style.height = s + 'px';
    el.style.fontSize = Math.max(9, s * 0.17) + 'px';
  }
  applyOpacity() { this.el.style.opacity = this.layout().opacity ?? 0.85; }

  bindButton(el, b) {
    const ids = new Set();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      ids.add(e.pointerId);
      el.classList.add('press');
      input.touchActive = true;
      const s = getProfile().settings;
      if (b.mode === 'run') { if (s.runToggle) { this.runOn = !this.runOn; input.run = this.runOn; } else input.run = true; }
      else if (b.mode === 'crouch') { input.crouch = !input.crouch; }
      else if (b.mode === 'interact') { input.pressed.add('interact'); input.interactHeld = true; }
      else { input.pressed.add(b.id); bus.emit('action', b.id); }
      if (s.vibration && navigator.vibrate) navigator.vibrate(8);
      this.syncToggles();
    });
    const up = (e) => {
      if (!ids.has(e.pointerId)) return;
      ids.delete(e.pointerId);
      if (ids.size) return;
      el.classList.remove('press');
      if (b.mode === 'run' && !getProfile().settings.runToggle) input.run = false;
      if (b.mode === 'interact') input.interactHeld = false;
      this.syncToggles();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
  syncToggles() {
    this.buttons.run?.classList.toggle('on', !!input.run);
    this.buttons.crouch?.classList.toggle('on', !!input.crouch);
  }

  // static joystick: the base stays where the layout puts it; only touches near it steer
  placeJoystick() {
    const L = this.layout();
    const c = L.joystick || DEFAULT_TOUCH_LAYOUT.joystick;
    const size = (c.size || 130) * (L.scale || 1);
    const el = this.joyEl;
    el.style.display = 'block';
    el.style.left = c.x + '%'; el.style.top = c.y + '%';
    el.style.width = el.style.height = size + 'px';
    const k = el.firstChild; const ks = Math.round(size * 0.42);
    k.style.width = k.style.height = ks + 'px'; k.style.margin = -ks / 2 + 'px';
    this.moveKnob(0, 0);
    // the touch-capture area is just a square around the stick, so the rest of the screen stays free for looking
    const S = Math.round(size * 1.9), z = this.joyZone.style;
    z.left = `calc(${c.x}% - ${S / 2}px)`; z.top = `calc(${c.y}% - ${S / 2}px)`; z.width = z.height = S + 'px'; z.bottom = 'auto';
  }
  bindJoystick() {
    const zone = this.joyZone;
    this.placeJoystick();
    const geom = () => { const r = this.joyEl.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 }; };
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy) return;
      const g = geom();
      if (Math.hypot(e.clientX - g.cx, e.clientY - g.cy) > g.R * 1.9) return; // too far from the stick: ignore
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      input.touchActive = true;
      this.joy = { id: e.pointerId };
      this.steer(e, g);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      e.preventDefault();
      this.steer(e, geom());
    });
    const end = (e) => {
      if (!this.joy || e.pointerId !== this.joy.id) return;
      this.joy = null;
      input.move.x = 0; input.move.y = 0;
      this.moveKnob(0, 0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
  steer(e, g) {
    let dx = e.clientX - g.cx, dy = e.clientY - g.cy;
    const d = Math.hypot(dx, dy);
    if (d > g.R) { dx *= g.R / d; dy *= g.R / d; }
    this.moveKnob(dx, dy);
    let mx = dx / g.R, my = -dy / g.R;
    const m = Math.hypot(mx, my);
    if (m < 0.12) { mx = 0; my = 0; } else { const k = Math.min(1, (m - 0.12) / 0.88) / m; mx *= k; my *= k; }
    input.move.x = mx; input.move.y = my;
  }
  moveKnob(dx, dy) { const k = this.joyEl.firstChild; k.style.transform = `translate(${dx}px, ${dy}px)`; }

  bindLook() {
    const zone = this.lookZone;
    const touches = new Map();
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      input.touchActive = true;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), sx: e.clientX, sy: e.clientY });
    });
    zone.addEventListener('pointermove', (e) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      e.preventDefault();
      const s = getProfile().settings.sensitivity * 0.42;
      input.look.x += (e.clientX - t.x) * s;
      input.look.y += (e.clientY - t.y) * s * (getProfile().settings.invertY ? -1 : 1);
      t.x = e.clientX; t.y = e.clientY;
    });
    const end = (e) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      touches.delete(e.pointerId);
      // quick tap on look area = interact
      if (performance.now() - t.t < 180 && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10) input.pressed.add('interact');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  show(v) { this.visible = v; this.el.classList.toggle('hidden', !v); if (v) { this.build(); input.touchActive = true; } }
  setPrompt(active) { this.buttons.interact?.classList.toggle('on', !!active); }

  // ---------- layout editor ----------
  openEditor(onClose) {
    const L = JSON.parse(JSON.stringify(this.layout()));
    const ed = h('div', { class: 'editor' });
    let sel = null;
    const els = {};
    const sizeIn = h('input', { type: 'range', min: 36, max: 140, step: 1 });
    const opIn = h('input', { type: 'range', min: 0.2, max: 1, step: 0.05, value: L.opacity ?? 0.85 });
    const scaleIn = h('input', { type: 'range', min: 0.6, max: 1.5, step: 0.05, value: L.scale ?? 1 });
    const selLabel = h('span', { class: 'muted' }, 'Выберите кнопку');
    const refresh = () => { for (const [id, el] of Object.entries(els)) { const c = L[id]; const s = (c.size || 60) * (L.scale || 1); el.style.left = c.x + '%'; el.style.top = c.y + '%'; el.style.width = el.style.height = s + 'px'; el.style.fontSize = Math.max(9, s * 0.17) + 'px'; el.classList.toggle('sel', id === sel); } ed.style.setProperty('--op', L.opacity); for (const el of Object.values(els)) el.style.opacity = L.opacity; };
    const items = [...BUTTONS.map((b) => ({ id: b.id, label: b.label })), { id: 'joystick', label: 'ДЖОЙСТИК' }];
    for (const b of items) {
      if (!L[b.id]) L[b.id] = { ...DEFAULT_TOUCH_LAYOUT[b.id] };
      const el = h('div', { class: 'tbtn', 'data-id': b.id }, b.label);
      els[b.id] = el;
      ed.append(el);
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        sel = b.id; selLabel.textContent = b.label; sizeIn.value = L[b.id].size;
        drag = { id: e.pointerId };
        refresh();
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag || drag.id !== e.pointerId) return;
        L[b.id].x = Math.max(3, Math.min(97, (e.clientX / innerWidth) * 100));
        L[b.id].y = Math.max(5, Math.min(97, (e.clientY / innerHeight) * 100));
        refresh();
      });
      el.addEventListener('pointerup', () => { drag = null; });
    }
    sizeIn.addEventListener('input', () => { if (sel) { L[sel].size = +sizeIn.value; refresh(); } });
    opIn.addEventListener('input', () => { L.opacity = +opIn.value; refresh(); });
    scaleIn.addEventListener('input', () => { L.scale = +scaleIn.value; refresh(); });
    const bar = h('div', { class: 'editor-bar' },
      h('b', {}, 'РЕДАКТОР КНОПОК'), selLabel,
      h('label', {}, 'Размер ', sizeIn), h('label', {}, 'Прозрачность ', opIn), h('label', {}, 'Масштаб ', scaleIn),
      h('button', { class: 'btn small', onclick: () => { Object.assign(L, JSON.parse(JSON.stringify(DEFAULT_TOUCH_LAYOUT))); opIn.value = L.opacity; scaleIn.value = L.scale; refresh(); } }, 'Сброс'),
      h('button', { class: 'btn small primary', onclick: () => { getProfile().settings.touchLayout = L; saveProfile(true); ed.remove(); this.build(); onClose && onClose(); } }, 'Сохранить'),
      h('button', { class: 'btn small', onclick: () => { ed.remove(); onClose && onClose(); } }, 'Отмена'));
    ed.append(bar);
    this.root.append(ed);
    refresh();
  }
}
