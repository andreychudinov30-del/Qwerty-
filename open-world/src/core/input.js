// Unified input: keyboard + mouse (pointer lock) + touch (virtual stick, look-drag, editable buttons)
import { G, clamp } from './util.js';
import { settings, saveSettings, IS_MOBILE } from './save.js';

export const I = {
  mx: 0, my: 0, lx: 0, ly: 0, // move / look deltas
  down: new Set(), pressed: new Set(), // action names
  touch: IS_MOBILE || ('ontouchstart' in window && navigator.maxTouchPoints > 0),
  locked: false, wheel: 0, mouseDown: false, rmb: false,
};
const KEY = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyF: 'enter', KeyE: 'interact', KeyQ: 'prevWeapon', KeyR: 'reload',
  KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyH: 'horn', KeyV: 'camera', KeyN: 'radio', KeyG: 'siren', KeyC: 'crouch', Tab: 'nextWeapon', KeyX: 'phone', Enter: 'confirm',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5', Digit6: 'w6', KeyB: 'cineSkip',
};
function press(a) { if (!I.down.has(a)) I.pressed.add(a); I.down.add(a); }
function release(a) { I.down.delete(a); }

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    const a = KEY[e.code]; if (!a) return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) press(a);
  });
  addEventListener('keyup', (e) => { const a = KEY[e.code]; if (a) release(a); });
  addEventListener('blur', () => { I.down.clear(); });
  canvas.addEventListener('mousedown', (e) => {
    if (I.touch && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (!G.playing) return;
    if (!I.locked && !G.uiOpen) { canvas.requestPointerLock && canvas.requestPointerLock(); }
    if (e.button === 0) press('attack');
    if (e.button === 2) press('aim');
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) release('attack'); if (e.button === 2) release('aim'); });
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === canvas; });
  addEventListener('mousemove', (e) => {
    if (!I.locked) return;
    I.lx += e.movementX * 0.0022 * settings.sens; I.ly += e.movementY * 0.0022 * settings.sens * (settings.invertY ? -1 : 1);
  });
  addEventListener('wheel', (e) => { if (G.playing && !G.uiOpen) { I.wheel += Math.sign(e.deltaY); } }, { passive: true });
  if (I.touch) initTouch();
}

export function pollInput() {
  let x = 0, y = 0;
  if (I.down.has('left')) x -= 1; if (I.down.has('right')) x += 1;
  if (I.down.has('up')) y += 1; if (I.down.has('down')) y -= 1;
  if (T.stickActive) { x = T.sx; y = T.sy; }
  I.mx = clamp(x, -1, 1); I.my = clamp(y, -1, 1);
  if (I.wheel) { I.pressed.add(I.wheel > 0 ? 'nextWeapon' : 'prevWeapon'); I.wheel = 0; }
}
export function endFrame() { I.pressed.clear(); I.lx = 0; I.ly = 0; }
export const has = (a) => I.down.has(a);
export const hit = (a) => I.pressed.has(a);

// ---------------- touch ----------------
const T = { stickActive: false, sx: 0, sy: 0, stickId: null, lookId: null, ox: 0, oy: 0, lpx: 0, lpy: 0 };
const BTN_DEF = {
  foot: [
    ['attack', 'Огонь', 0, 0], ['aim', 'Прицел', 80, 0], ['enter', 'Сесть', 160, 0],
    ['jump', 'Прыжок', 0, 80], ['sprint', 'Бег', 80, 80], ['interact', 'Действие', 160, 80],
    ['nextWeapon', 'Оружие', 0, 160], ['map', 'Карта', 0, 0, false, 'tl2'], ['pause', '❚❚', 0, 0, false, 'tl'],
  ],
  car: [
    ['up', 'Газ', 0, 0], ['down', 'Тормоз', 80, 0], ['enter', 'Выйти', 160, 0],
    ['jump', 'Ручник', 0, 80], ['horn', 'Сигнал', 80, 80], ['camera', 'Камера', 160, 80],
    ['radio', 'Радио', 0, 160], ['siren', 'Сирена', 80, 160], ['map', 'Карта', 0, 0, false, 'tl2'], ['pause', '❚❚', 0, 0, false, 'tl'],
  ],
};
let editing = false;
const btnEls = {};
function initTouch() {
  const root = document.getElementById('touch');
  root.classList.remove('hidden');
  for (const mode of ['foot', 'car']) for (const [a, label, rx, by, hold, corner] of BTN_DEF[mode]) {
    const id = mode + ':' + a;
    const el = document.createElement('div'); el.className = 'tbtn'; el.textContent = label; el.dataset.a = a; el.dataset.mode = mode;
    el.dataset.def = JSON.stringify([rx, by, corner || '']);
    root.appendChild(el); btnEls[id] = el;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (editing) { startDrag(el, e.changedTouches[0]); return; }
      el.classList.add('on'); press(a);
      if (a === 'aim') { I._aimToggle = !I._aimToggle; }
    }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); el.classList.remove('on'); if (!editing) release(a); }, { passive: false });
    el.addEventListener('touchcancel', () => { el.classList.remove('on'); release(a); });
  }
  layoutTouch();
  addEventListener('resize', layoutTouch);
  const stick = document.getElementById('stick'), knob = stick.firstElementChild;
  const left = () => settings.touch.left;
  addEventListener('touchstart', (e) => {
    if (!G.playing || G.uiOpen || editing) return;
    for (const t of e.changedTouches) {
      const leftSide = t.clientX < innerWidth * 0.42;
      const isStick = left() ? !leftSide : leftSide;
      if (isStick && T.stickId === null) {
        T.stickId = t.identifier; T.ox = t.clientX; T.oy = t.clientY; T.stickActive = true; T.sx = T.sy = 0;
        stick.style.display = 'block'; stick.style.left = (t.clientX - 65) + 'px'; stick.style.top = (t.clientY - 65) + 'px'; knob.style.transform = '';
      } else if (!isStick && T.lookId === null) { T.lookId = t.identifier; T.lpx = t.clientX; T.lpy = t.clientY; }
    }
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === T.stickId) {
        let dx = t.clientX - T.ox, dy = t.clientY - T.oy; const d = Math.hypot(dx, dy), m = 55;
        if (d > m) { dx *= m / d; dy *= m / d; }
        T.sx = dx / m; T.sy = -dy / m;
        knob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === T.lookId) {
        I.lx += (t.clientX - T.lpx) * 0.0055 * settings.sens; I.ly += (t.clientY - T.lpy) * 0.0055 * settings.sens * (settings.invertY ? -1 : 1);
        T.lpx = t.clientX; T.lpy = t.clientY;
      }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === T.stickId) { T.stickId = null; T.stickActive = false; T.sx = T.sy = 0; stick.style.display = 'none'; }
      if (t.identifier === T.lookId) T.lookId = null;
    }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
}
export function layoutTouch() {
  const s = settings.touch.scale * Math.min(1, innerHeight / 560), op = settings.touch.opacity, flip = settings.touch.left;
  for (const [id, el] of Object.entries(btnEls)) {
    const [rx, by, corner] = JSON.parse(el.dataset.def);
    const custom = settings.touch.layout[id];
    const size = 64 * s;
    el.style.width = el.style.height = size + 'px'; el.style.opacity = op + 0.3; el.style.fontSize = 12 * s + 'px';
    el.style.left = el.style.right = el.style.top = el.style.bottom = '';
    if (custom) { el.style.left = custom[0] * innerWidth + 'px'; el.style.top = custom[1] * innerHeight + 'px'; continue; }
    if (corner === 'tr') { el.style.right = (230 * Math.min(1, innerWidth / 1100) + 20) + 'px'; el.style.top = '14px'; el.style.width = el.style.height = size * 0.8 + 'px'; continue; }
    if (corner === 'tl') { el.style.left = '50%'; el.style.marginLeft = '-90px'; el.style.top = '10px'; el.style.width = el.style.height = size * 0.7 + 'px'; continue; }
    if (corner === 'tl2') { el.style.left = '50%'; el.style.marginLeft = '40px'; el.style.top = '10px'; el.style.width = el.style.height = size * 0.7 + 'px'; continue; }
    if (flip) el.style.left = (rx * s + 20) + 'px'; else el.style.right = (rx * s + 20) + 'px';
    el.style.bottom = (by * s + 24) + 'px';
  }
}
export function setTouchMode(mode) {
  for (const el of Object.values(btnEls)) el.style.display = el.dataset.mode === mode ? 'flex' : 'none';
}
export function touchEditing(on) {
  editing = on;
  document.getElementById('touch').classList.toggle('editing', on);
  document.getElementById('touch').style.pointerEvents = on ? 'auto' : 'none';
}
function startDrag(el, t0) {
  const id = el.dataset.mode + ':' + el.dataset.a;
  const r = el.getBoundingClientRect(); const ox = t0.clientX - r.left, oy = t0.clientY - r.top;
  const mv = (e) => { const t = e.changedTouches[0]; el.style.right = el.style.bottom = ''; el.style.left = (t.clientX - ox) + 'px'; el.style.top = (t.clientY - oy) + 'px'; };
  const up = () => {
    removeEventListener('touchmove', mv); removeEventListener('touchend', up);
    const rr = el.getBoundingClientRect(); settings.touch.layout[id] = [rr.left / innerWidth, rr.top / innerHeight]; saveSettings();
  };
  addEventListener('touchmove', mv); addEventListener('touchend', up);
}
export function resetTouchLayout() { settings.touch.layout = {}; saveSettings(); layoutTouch(); }
