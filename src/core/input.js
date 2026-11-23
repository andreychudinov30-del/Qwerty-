// Unified input: keyboard + mouse (pointer lock) and multi-touch controls (see touch.js) feed one action state.
import { getProfile } from './save.js';
import { bus } from './util.js';

export const input = {
  move: { x: 0, y: 0 }, // x: strafe (+right), y: forward (+fwd)
  look: { x: 0, y: 0 }, // accumulated look delta (pixels-ish), consumed each frame
  run: false,
  crouch: false,
  pressed: new Set(), // one-shot actions this frame: interact, flashlight, jump, throw, item, pause, reload, inventory
  held: new Set(),
  locked: false,
  enabled: false,
  touchActive: false,
  interactHeld: false,
};

const keys = new Set();
const KEYMAP = {
  KeyE: 'interact', KeyF: 'flashlight', Space: 'jump', KeyQ: 'throw', KeyH: 'item', KeyR: 'reload', Escape: 'pause', KeyP: 'pause', Tab: 'inventory', KeyG: 'flare', KeyT: 'chat', Digit1: 'item', KeyM: 'map',
};

function updateMove() {
  if (input.touchActive) return;
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  const l = Math.hypot(x, y) || 1;
  input.move.x = x / l; input.move.y = y / l;
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const s = getProfile().settings;
  if (!s.crouchToggle) input.crouch = keys.has('ControlLeft') || keys.has('KeyC');
}

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Tab') e.preventDefault();
    if (keys.has(e.code)) return;
    keys.add(e.code);
    input.touchActive = false;
    const a = KEYMAP[e.code];
    if (a) { input.pressed.add(a); input.held.add(a); bus.emit('action', a); }
    if ((e.code === 'ControlLeft' || e.code === 'KeyC') && getProfile().settings.crouchToggle) input.crouch = !input.crouch;
    if (e.code === 'KeyE') input.interactHeld = true;
    updateMove();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) input.held.delete(a);
    if (e.code === 'KeyE') input.interactHeld = false;
    updateMove();
  });
  window.addEventListener('blur', () => { keys.clear(); input.held.clear(); updateMove(); input.interactHeld = false; });
  canvas.addEventListener('mousedown', (e) => {
    if (!input.enabled || input.touchActive) return;
    if (!input.locked) { requestLock(canvas); return; }
    if (e.button === 0) { input.pressed.add('interact'); input.interactHeld = true; }
    if (e.button === 2) input.pressed.add('flashlight');
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.interactHeld = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvas;
    if (was && !input.locked && input.enabled && !input.touchActive) bus.emit('action', 'pauseFromUnlock');
  });
  window.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    const s = getProfile().settings.sensitivity;
    input.look.x += e.movementX * s;
    input.look.y += e.movementY * s * (getProfile().settings.invertY ? -1 : 1);
  });
}

export function requestLock(canvas) {
  if (input.touchActive) return;
  try { const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()); } catch (e) { try { canvas.requestPointerLock(); } catch (e2) { /* ignore */ } }
}
export function exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

export function consumeLook() { const l = { x: input.look.x, y: input.look.y }; input.look.x = 0; input.look.y = 0; return l; }
export function endFrame() { input.pressed.clear(); }
export function resetInput() { keys.clear(); input.held.clear(); input.pressed.clear(); input.move.x = input.move.y = 0; input.run = false; input.crouch = false; input.look.x = input.look.y = 0; }
