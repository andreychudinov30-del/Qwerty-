import { clamp } from './util.js';
import { save } from './save.js';

export class Input {
  constructor(root) {
    this.keys = new Set(); this.root = root;
    this.stick = { x: 0, y: 0 }; this.touchStick = null; this.btn = { gun: false, missile: false, flare: false, ab: false, brake: false };
    this.throttle = 0.8; this.events = []; this.mouse = { x: 0, y: 0, active: false }; this.gyro = { x: 0, y: 0, ok: false, base: null };
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.lookX = 0; this.lookY = 0;
    addEventListener('keydown', e => { if (e.repeat) { return; } this.keys.add(e.code); this.onKey(e.code); if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && this.enabled) e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => { if (document.pointerLockElement) { this.mouse.x = clamp(this.mouse.x + e.movementX * 0.004 * save.settings.sens, -1, 1); this.mouse.y = clamp(this.mouse.y + e.movementY * 0.004 * save.settings.sens, -1, 1); this.mouse.active = true; } });
    addEventListener('mousedown', e => { if (!this.enabled || this.isTouch) return; if (e.button === 0) this.btn.mgun = true; if (e.button === 2) this.events.push('missile'); });
    addEventListener('mouseup', e => { if (e.button === 0) this.btn.mgun = false; });
    addEventListener('contextmenu', e => { if (this.enabled) e.preventDefault(); });
    addEventListener('wheel', e => { if (this.enabled) this.throttle = clamp(this.throttle - Math.sign(e.deltaY) * 0.05, 0, 1); });
    this.enabled = false;
  }
  onKey(code) {
    if (!this.enabled) return;
    const map = { KeyF: 'missile', Enter: 'missile', KeyX: 'flare', KeyC: 'camera', KeyT: 'target', Tab: 'target', Escape: 'pause', KeyP: 'pause', KeyV: 'look', KeyM: 'mouse' };
    if (map[code]) this.events.push(map[code]);
  }
  bindTouch(el) {
    const S = this; this.touchEl = el;
    const stickBase = el.querySelector('.stick-base'), stickKnob = el.querySelector('.stick-knob');
    const thrBar = el.querySelector('.thr'), thrFill = el.querySelector('.thr-fill');
    const touches = new Map();
    const setThr = (y) => { const r = thrBar.getBoundingClientRect(); S.throttle = clamp(1 - (y - r.top) / r.height, 0, 1); };
    const start = (e) => {
      for (const t of e.changedTouches) {
        const tgt = document.elementFromPoint(t.clientX, t.clientY);
        const b = tgt && tgt.closest('[data-b]');
        if (b) { const k = b.dataset.b; touches.set(t.identifier, { kind: 'btn', k, el: b }); b.classList.add('on'); if (k === 'gun' || k === 'ab' || k === 'brake') S.btn[k] = true; else S.events.push(k); e.preventDefault(); continue; }
        if (tgt && tgt.closest('.thr')) { touches.set(t.identifier, { kind: 'thr' }); setThr(t.clientY); e.preventDefault(); continue; }
        if (t.clientX < innerWidth * 0.5 && !S.touchStick) {
          S.touchStick = { id: t.identifier, x0: t.clientX, y0: t.clientY }; touches.set(t.identifier, { kind: 'stick' });
          stickBase.style.display = 'block'; stickBase.style.left = t.clientX + 'px'; stickBase.style.top = t.clientY + 'px'; stickKnob.style.transform = 'translate(-50%,-50%)';
          e.preventDefault(); continue;
        }
        touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
      }
    };
    const move = (e) => {
      for (const t of e.changedTouches) {
        const o = touches.get(t.identifier); if (!o) continue;
        if (o.kind === 'stick') { const R = Math.min(innerWidth, innerHeight) * 0.16; let dx = (t.clientX - S.touchStick.x0) / R, dy = (t.clientY - S.touchStick.y0) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } S.stick.x = dx; S.stick.y = dy; stickKnob.style.transform = `translate(calc(-50% + ${dx * R}px), calc(-50% + ${dy * R}px))`; }
        else if (o.kind === 'thr') setThr(t.clientY);
        else if (o.kind === 'look') { S.lookX += (t.clientX - o.x) * 0.006; S.lookY += (t.clientY - o.y) * 0.006; o.x = t.clientX; o.y = t.clientY; }
      }
      e.preventDefault();
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        const o = touches.get(t.identifier); if (!o) continue; touches.delete(t.identifier);
        if (o.kind === 'stick') { S.touchStick = null; S.stick.x = 0; S.stick.y = 0; stickBase.style.display = 'none'; }
        if (o.kind === 'btn') { o.el.classList.remove('on'); if (o.k === 'gun' || o.k === 'ab' || o.k === 'brake') S.btn[o.k] = false; }
      }
    };
    el.addEventListener('touchstart', start, { passive: false }); el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    this.updateThrUI = () => { thrFill.style.height = (S.throttle * 100) + '%'; };
  }
  enableGyro() {
    const go = () => addEventListener('deviceorientation', (e) => {
      if (e.beta == null) return; const land = Math.abs(window.orientation || (screen.orientation && screen.orientation.angle) || 0) === 90;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let pitch = land ? e.gamma : e.beta, roll = land ? e.beta : e.gamma; if (ang === -90 || ang === 270) { pitch = -pitch; roll = -roll; }
      if (!this.gyro.base) this.gyro.base = { p: pitch, r: roll };
      this.gyro.x = clamp((roll - this.gyro.base.r) / 30, -1, 1); this.gyro.y = clamp((pitch - this.gyro.base.p) / 25, -1, 1); this.gyro.ok = true;
    });
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') go(); }).catch(() => { });
    else go();
  }
  read(dt) {
    const k = this.keys, s = save.settings;
    let pitch = 0, roll = 0, yaw = 0;
    if (k.has('KeyS') || k.has('ArrowDown')) pitch += 1; if (k.has('KeyW') || k.has('ArrowUp')) pitch -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) roll -= 1; if (k.has('KeyD') || k.has('ArrowRight')) roll += 1;
    if (k.has('KeyQ')) yaw -= 1; if (k.has('KeyE')) yaw += 1;
    if (k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyR')) this.throttle = clamp(this.throttle + dt * 0.6, 0, 1);
    if (k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyZ')) this.throttle = clamp(this.throttle - dt * 0.6, 0, 1);
    if (this.mouse.active && document.pointerLockElement) { pitch += this.mouse.y * 1.3; roll += this.mouse.x * 1.3; this.mouse.x *= Math.exp(-dt * 1.5); this.mouse.y *= Math.exp(-dt * 1.5); }
    // touch stick
    if (this.touchStick || this.stick.x || this.stick.y) { pitch += this.stick.y * s.sens; roll += this.stick.x * s.sens; }
    if (s.gyro && this.gyro.ok) { pitch += this.gyro.y * s.sens; roll += this.gyro.x * s.sens; }
    // gamepad
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null;
    let gGun = false;
    if (gp) {
      const dz = (v) => Math.abs(v) < 0.12 ? 0 : v;
      roll += dz(gp.axes[0]); pitch += dz(gp.axes[1]); yaw += dz(gp.axes[2] || 0);
      const ry = dz(gp.axes[3] || 0); if (ry) this.throttle = clamp(this.throttle - ry * dt * 0.8, 0, 1);
      const B = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      gGun = B(7) || B(5) && false; if (B(7)) gGun = true;
      this.pad = this.pad || {};
      const edge = (i, ev) => { const p = B(i); if (p && !this.pad[i]) this.events.push(ev); this.pad[i] = p; };
      edge(0, 'missile'); edge(1, 'flare'); edge(3, 'camera'); edge(5, 'target'); edge(9, 'pause'); edge(2, 'look');
      if (B(6)) this.throttle = clamp(this.throttle - dt * 0.7, 0, 1); if (B(4)) this.throttle = clamp(this.throttle + dt * 0.7, 0, 1);
    }
    if (s.invert) pitch = -pitch;
    this.updateThrUI && this.updateThrUI();
    const ab = this.throttle > 0.97 || this.btn.ab || k.has('KeyB');
    return { pitch: clamp(pitch, -1, 1), roll: clamp(roll, -1, 1), yaw: clamp(yaw, -1, 1), throttle: this.throttle, ab,
      gun: k.has('Space') || this.btn.gun || this.btn.mgun || gGun, brake: this.btn.brake || k.has('KeyG') };
  }
  poll() { const e = this.events; this.events = []; return e; }
}
