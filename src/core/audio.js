// Procedural audio engine (Web Audio): every sound is synthesized at runtime (no licensing issues),
// 3D spatialized with HRTF panners, distance-dependent reverb sends, occlusion low-pass, zone reverb crossfade,
// dynamic ambience and tension music layers.
import { getProfile } from './save.js';

let SR = 44100; // replaced by the real AudioContext rate in init() (iOS runs at 48000 and rejects mismatched buffers)
let ctx = null;

// ---------------- DSP helpers ----------------
const rnd = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const white = () => rnd() * 2 - 1;
function buf(len, ch = 1) { return Array.from({ length: ch }, () => new Float32Array(Math.floor(len * SR))); }
function env(t, a, d, total) { if (t < a) return t / a; return Math.max(0, Math.exp(-(t - a) / d)) * (t < total ? 1 : 0); }
class Reson { // 2-pole band-pass resonator
  constructor(f, q) { this.set(f, q); this.y1 = 0; this.y2 = 0; this.x1 = 0; this.x2 = 0; }
  set(f, q) { const w = (2 * Math.PI * f) / SR; const al = Math.sin(w) / (2 * q); const a0 = 1 + al; this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0; }
  p(x) { const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
class LP { constructor(f) { this.set(f); this.y = 0; } set(f) { this.a = 1 - Math.exp((-2 * Math.PI * f) / SR); } p(x) { this.y += this.a * (x - this.y); return this.y; } }
class HP { constructor(f) { this.lp = new LP(f); } p(x) { return x - this.lp.p(x); } }
function normalize(arrs, peak = 0.9) { let m = 0; for (const a of arrs) for (const v of a) m = Math.max(m, Math.abs(v)); if (m > 0) for (const a of arrs) for (let i = 0; i < a.length; i++) a[i] *= peak / m; return arrs; }
function fadeEdges(a, ms = 20) { const n = Math.min(a.length / 2, (ms / 1000) * SR); for (let i = 0; i < n; i++) { const k = i / n; a[i] *= k; a[a.length - 1 - i] *= k; } }
function loopify(a, ms = 120) { // crossfade end into start for seamless loops
  const n = Math.floor((ms / 1000) * SR);
  for (let i = 0; i < n; i++) { const k = i / n; a[i] = a[i] * k + a[a.length - n + i] * (1 - k); }
  return a.subarray ? a.slice(0, a.length - n) : a;
}
const FORMANTS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1600, 2700], i: [300, 2300, 3000] };

// ---------------- sound recipes ----------------
const R = {
  step_concrete(v) { const [a] = buf(0.22); const bp = new Reson(900 + v * 150, 1.2), lp = new LP(2500); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = lp.p(bp.p(white())) * env(t, 0.002, 0.035, 0.2) * 3 + Math.sin(2 * Math.PI * 80 * t) * env(t, 0.001, 0.02, 0.1) * 0.5; } return normalize([a], 0.7); },
  step_tile(v) { const [a] = buf(0.25); const bp = new Reson(2600 + v * 300, 3), bp2 = new Reson(1200, 2); for (let i = 0; i < a.length; i++) { const t = i / SR; const n = white(); a[i] = bp.p(n) * env(t, 0.001, 0.03, 0.22) * 3 + bp2.p(n) * env(t, 0.001, 0.05, 0.2) + Math.sin(2 * Math.PI * 95 * t) * env(t, 0.001, 0.02, 0.1) * 0.4; } return normalize([a], 0.7); },
  step_gravel(v) { const [a] = buf(0.3); const hp = new HP(800), lp = new LP(5000); for (let i = 0; i < a.length; i++) { const t = i / SR; const grains = rnd() < 0.02 ? white() * 3 : white() * 0.3; a[i] = lp.p(hp.p(grains)) * env(t, 0.004, 0.07, 0.28) + Math.sin(2 * Math.PI * (70 + v * 5) * t) * env(t, 0.002, 0.03, 0.1) * 0.4; } return normalize([a], 0.65); },
  step_metal(v) { const [a] = buf(0.5); const fs = [420 + v * 30, 980, 1730, 2950]; for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; fs.forEach((f, k) => (s += Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * (9 + k * 4)) / (k + 1))); a[i] = s * env(t, 0.001, 0.25, 0.5) + white() * env(t, 0.001, 0.01, 0.05) * 0.5; } return normalize([a], 0.6); },
  step_water(v) { const [a] = buf(0.45); const lp = new LP(1800), bp = new Reson(500, 1); for (let i = 0; i < a.length; i++) { const t = i / SR; const bub = Math.sin(2 * Math.PI * (300 + 600 * Math.exp(-t * 20) + v * 40) * t) * env(t, 0.01, 0.04, 0.15) * 0.4; a[i] = lp.p(white()) * env(t, 0.01, 0.12, 0.42) + bp.p(white()) * 0.5 * env(t, 0.03, 0.08, 0.3) + bub; } return normalize([a], 0.6); },
  drip() { const [a] = buf(0.4); for (let i = 0; i < a.length; i++) { const t = i / SR; const f = 1600 * Math.exp(-t * 18) + 500; a[i] = Math.sin(2 * Math.PI * f * t) * env(t, 0.001, 0.025, 0.3); } return normalize([a], 0.5); },
  creak() { const [a] = buf(1.6); const r1 = new Reson(650, 8), r2 = new Reson(1400, 10), r3 = new Reson(2600, 12); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const rate = 35 + 30 * Math.sin(t * 3.1) + 15 * Math.sin(t * 11); ph += rate / SR; const pulse = ph % 1 < 0.04 ? 1 : 0; const x = pulse + white() * 0.05; a[i] = (r1.p(x) + r2.p(x) * 0.7 + r3.p(x) * 0.3) * env(t, 0.08, 0.8, 1.55); } return normalize([a], 0.7); },
  slam() { const [a] = buf(1.2); const lp = new LP(400); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = lp.p(white()) * env(t, 0.001, 0.08, 1) * 3 + Math.sin(2 * Math.PI * 55 * t) * env(t, 0.001, 0.12, 1) + (Math.sin(2 * Math.PI * 310 * t) + Math.sin(2 * Math.PI * 737 * t) * 0.5) * env(t, 0.001, 0.35, 1.1) * 0.25; } return normalize([a], 0.95); },
  metal_screech() { const [a] = buf(2.4); const bp = new Reson(2200, 6); for (let i = 0; i < a.length; i++) { const t = i / SR; const f = 900 + 500 * Math.sin(t * 1.7) + 200 * Math.sin(t * 13); const m = Math.sin(2 * Math.PI * f * 1.41 * t) * 3; a[i] = (Math.sin(2 * Math.PI * f * t + m) * 0.6 + bp.p(white()) * 0.8) * env(t, 0.3, 1.2, 2.35); } return normalize([a], 0.7); },
  scream(v = 0) { const [a] = buf(2.2); const fm = FORMANTS[v % 2 ? 'a' : 'e']; const rs = fm.map((f, k) => new Reson(f, 6 + k * 2)); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const f0 = 380 + 160 * Math.sin(Math.min(1, t / 1.2) * Math.PI) - 80 * Math.max(0, t - 1.4) + Math.sin(t * 38) * 12; ph += f0 / SR; const src = (ph % 1) * 2 - 1 + white() * 0.25; let s = 0; rs.forEach((r, k) => (s += r.p(src) / (k + 1))); a[i] = Math.tanh(s * 3) * env(t, 0.06, 0.8, 2.15); } return normalize([a], 0.7); },
  whisper(v = 0) { const [a] = buf(2.6); const rs = [new Reson(600, 5), new Reson(1700, 6), new Reson(2800, 7)]; const hp = new HP(400); let syl = 0, target = FORMANTS.a; for (let i = 0; i < a.length; i++) { const t = i / SR; if (i % Math.floor(SR * (0.12 + ((v * 7 + Math.floor(t * 8)) % 5) * 0.03)) === 0) { target = Object.values(FORMANTS)[Math.floor(rnd() * 5)]; rs.forEach((r, k) => r.set(target[k], 5 + k)); syl = 1; } syl *= 0.99985; const n = hp.p(white()); let s = 0; rs.forEach((r) => (s += r.p(n))); a[i] = s * (0.3 + 0.7 * Math.abs(Math.sin(t * 14 + v))) * env(t, 0.2, 1.5, 2.55); } return normalize([a], 0.55); },
  growl(v = 0) { const [a] = buf(2.2); const rs = [new Reson(300, 4), new Reson(750, 5), new Reson(1900, 6)]; let ph = 0; const lp = new LP(2500); for (let i = 0; i < a.length; i++) { const t = i / SR; const f0 = 62 + v * 9 + 14 * Math.sin(t * 5.3) + white() * 6; ph += f0 / SR; const saw = (ph % 1) * 2 - 1; const src = saw + Math.sin(ph * Math.PI) * 0.6 + white() * 0.4; let s = 0; rs.forEach((r, k) => (s += r.p(src) / (1 + k * 0.5))); a[i] = lp.p(Math.tanh(s * 2.5)) * (0.6 + 0.4 * Math.sin(t * 23)) * env(t, 0.25, 0.9, 2.15); } return normalize([a], 0.85); },
  screech(v = 0) { const [a] = buf(1.4); const rs = [new Reson(1400, 3), new Reson(3100, 4)]; let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const f0 = 700 + 700 * Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.8) + v * 80 + Math.sin(t * 70) * 40; ph += f0 / SR; const src = ((ph % 1) * 2 - 1) + white() * 0.6; a[i] = Math.tanh((rs[0].p(src) + rs[1].p(src)) * 4) * env(t, 0.02, 0.5, 1.35); } return normalize([a], 0.75); },
  clicks() { const [a] = buf(1.6); const bp = new Reson(3200, 5); let next = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; let x = 0; if (i >= next) { x = 1; next = i + Math.floor(SR * (0.03 + rnd() * 0.12)); } a[i] = bp.p(x * 8 + white() * 0.02) * env(t, 0.05, 1.2, 1.55); } return normalize([a], 0.6); },
  heartbeat() { const [a] = buf(1.0); for (let i = 0; i < a.length; i++) { const t = i / SR; const b = (t0) => { const tt = t - t0; return tt > 0 ? Math.sin(2 * Math.PI * (55 - tt * 40) * tt) * Math.exp(-tt * 22) : 0; }; a[i] = b(0) + b(0.22) * 0.7; } return normalize([a], 0.9); },
  breath() { const [a] = buf(3.0); const bp = new Reson(1200, 1.2); for (let i = 0; i < a.length; i++) { const t = i / SR; const ph = (t % 3) / 3; const amp = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) * 0.6 : Math.sin(((ph - 0.4) / 0.6) * Math.PI) * 0.9; a[i] = bp.p(white()) * amp; } return normalize([a], 0.4); },
  gasmask() { const [a] = buf(3.2); const bp = new Reson(700, 2.5), bp2 = new Reson(2400, 3); for (let i = 0; i < a.length; i++) { const t = i / SR; const ph = (t % 3.2) / 3.2; const amp = ph < 0.45 ? Math.sin((ph / 0.45) * Math.PI) : Math.sin(((ph - 0.45) / 0.55) * Math.PI) * 0.8; const valve = Math.abs(ph - 0.45) < 0.005 ? white() * 2 : 0; const n = white(); a[i] = (bp.p(n) * 1.2 + bp2.p(n) * 0.4) * amp + valve; } return normalize([a], 0.45); },
  knock(v = 0) { const [a] = buf(1.4); const lp = new LP(900); for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; for (const k of [0, 0.32, 0.6]) { const tt = t - k - v * 0.05; if (tt > 0) s += (Math.sin(2 * Math.PI * 120 * tt) * 0.8 + lp.p(white()) * 0.8) * Math.exp(-tt * 30); } a[i] = s; } return normalize([a], 0.8); },
  hum() { const [a] = buf(2); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * 50 * t) * 0.5 + Math.sin(2 * Math.PI * 100 * t) * 0.3 + Math.sin(2 * Math.PI * 150 * t) * 0.15 + white() * 0.02; } return normalize([a], 0.4); },
  buzz() { const [a] = buf(2); const hp = new HP(2000); for (let i = 0; i < a.length; i++) { const t = i / SR; const saw = ((t * 100) % 1) * 2 - 1; a[i] = saw * 0.15 + Math.sin(2 * Math.PI * 200 * t) * 0.2 + hp.p(white()) * (rnd() < 0.002 ? 3 : 0.05); } return normalize([a], 0.35); },
  spark() { const [a] = buf(0.9); const hp = new HP(1500); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = hp.p(white()) * (rnd() < 0.08 ? 1.5 : 0.1) * env(t, 0.001, 0.25, 0.85) + Math.sin(2 * Math.PI * 60 * t) * env(t, 0.001, 0.1, 0.4) * 0.3; } return normalize([a], 0.8); },
  generator() { const [a] = buf(2); const lp = new LP(300); for (let i = 0; i < a.length; i++) { const t = i / SR; const pulse = Math.pow(Math.max(0, Math.sin(2 * Math.PI * 24 * t)), 6); a[i] = lp.p(white()) * (0.4 + pulse) + Math.sin(2 * Math.PI * 48 * t) * 0.3 + Math.sin(2 * Math.PI * 97 * t) * 0.15 * pulse; } return normalize([a], 0.5); },
  train_rumble() { const [a] = buf(4); const lp = new LP(220), lp2 = new LP(1200); for (let i = 0; i < a.length; i++) { const t = i / SR; let clack = 0; for (const k of [0, 0.18, 2.0, 2.18]) { const tt = t - k; if (tt > 0 && tt < 0.2) clack += Math.sin(2 * Math.PI * 140 * tt) * Math.exp(-tt * 40) + lp2.p(white()) * Math.exp(-tt * 60); } a[i] = lp.p(white()) * 1.6 + clack * 0.5 + Math.sin(2 * Math.PI * 38 * t) * 0.2; } return normalize([a], 0.7); },
  train_horn() { const [a] = buf(2.2); let p1 = 0, p2 = 0; const lp = new LP(2400); for (let i = 0; i < a.length; i++) { const t = i / SR; p1 += 330 / SR; p2 += 415 / SR; a[i] = lp.p(((p1 % 1) * 2 - 1) + ((p2 % 1) * 2 - 1)) * env(t, 0.06, 2, 2.1) * (t > 2.0 ? Math.max(0, 1 - (t - 2) * 10) : 1); } return normalize([a], 0.8); },
  brakes() { const [a] = buf(2.5); const bp = new Reson(3300, 20), bp2 = new Reson(4400, 25); for (let i = 0; i < a.length; i++) { const t = i / SR; const n = white(); a[i] = (bp.p(n) + bp2.p(n) * 0.6) * env(t, 0.2, 1.5, 2.45) * (0.7 + 0.3 * Math.sin(t * 40)); } return normalize([a], 0.6); },
  radio_static() { const [a] = buf(2); const bp = new Reson(1800, 0.8); for (let i = 0; i < a.length; i++) a[i] = bp.p(white()) * (0.6 + (rnd() < 0.01 ? 2 : 0)); return normalize([a], 0.4); },
  radio_voice(v = 0) { const [a] = buf(3.2); const rs = [new Reson(700, 6), new Reson(1200, 7), new Reson(2500, 8)]; const hp = new HP(350), lp = new LP(3200); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const sylT = Math.floor(t * 6.5 + v); if (i % 4000 === 0) { const f = Object.values(FORMANTS)[(sylT * 7 + v) % 5]; rs.forEach((r, k) => r.set(f[k], 6 + k)); } const f0 = 115 + 25 * Math.sin(t * 2.2 + v) + 10 * Math.sin(t * 9); ph += f0 / SR; const src = ((ph % 1) * 2 - 1) * (Math.sin(t * 6.5 * Math.PI + v) > -0.2 ? 1 : 0.05); let s = 0; rs.forEach((r, k) => (s += r.p(src) / (k + 1))); a[i] = lp.p(hp.p(Math.tanh(s * 2) + white() * 0.15)); } fadeEdges(a, 80); return normalize([a], 0.6); },
  drone() { const [a, b] = buf(10, 2); const lpa = new LP(180), lpb = new LP(170); const fs = [41.2, 55, 61.7, 82.4]; for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; fs.forEach((f, k) => (s += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.3 + k) * 2) * (0.6 + 0.4 * Math.sin(t * (0.2 + k * 0.07))))); a[i] = lpa.p(s + white() * 0.6); b[i] = lpb.p(s * 0.9 + white() * 0.6); } return normalize([loopify(a, 400), loopify(b, 400)], 0.6); },
  wind() { const [a, b] = buf(10, 2); const ra = new Reson(300, 0.7), rb = new Reson(340, 0.7); for (let i = 0; i < a.length; i++) { const t = i / SR; if (i % 512 === 0) { ra.set(250 + 180 * Math.sin(t * 0.5) + 90 * Math.sin(t * 1.7), 0.8); rb.set(260 + 170 * Math.sin(t * 0.43 + 1), 0.8); } const amp = 0.5 + 0.5 * Math.sin(t * 0.6); a[i] = ra.p(white()) * amp; b[i] = rb.p(white()) * amp; } return normalize([loopify(a, 500), loopify(b, 500)], 0.5); },
  water_flow() { const [a] = buf(4); const lp = new LP(1400), bp = new Reson(600, 1); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = lp.p(white()) * (0.6 + 0.2 * Math.sin(t * 7)) + bp.p(white()) * 0.3 + (rnd() < 0.0008 ? Math.sin(2 * Math.PI * 900 * t) : 0); } return normalize([loopify(a, 300)], 0.5); },
  steam() { const [a] = buf(2); const hp = new HP(1800); for (let i = 0; i < a.length; i++) a[i] = hp.p(white()); return normalize([loopify(a, 200)], 0.5); },
  stinger() { const [a, b] = buf(3, 2); const fs = [110, 116.5, 155.6, 164.8, 233, 246.9]; const ph = fs.map(() => rnd()); for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; fs.forEach((f, k) => { ph[k] += (f * (1 + 0.003 * Math.sin(t * 5 + k))) / SR; s += ((ph[k] % 1) * 2 - 1) / fs.length; }); const e = Math.min(1, t / 0.08) * Math.exp(-Math.max(0, t - 0.2) * 1.4); const hit = white() * Math.exp(-t * 18) + Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 4); a[i] = (s * 1.4 + hit) * e; b[i] = (s * 1.3 + hit) * e; } return normalize([a, b], 0.95); },
  hit() { const [a] = buf(2); const lp = new LP(300); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * (40 + 60 * Math.exp(-t * 8)) * t) * Math.exp(-t * 2.5) + lp.p(white()) * Math.exp(-t * 6); } return normalize([a], 0.95); },
  pickup() { const [a] = buf(0.6); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = (Math.sin(2 * Math.PI * 880 * t) * env(t, 0.005, 0.15, 0.3) + Math.sin(2 * Math.PI * 1320 * t) * env(t - 0.08, 0.005, 0.2, 0.5) * (t > 0.08 ? 1 : 0)) * 0.5; } return normalize([a], 0.4); },
  objective() { const [a] = buf(2.5); for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; [196, 293.7, 392, 587].forEach((f, k) => (s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (1.2 + k * 0.4)) / (k + 1))); a[i] = s; } return normalize([a], 0.5); },
  ui() { const [a] = buf(0.08); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = Math.sin(2 * Math.PI * 1900 * t) * env(t, 0.001, 0.012, 0.07); } return normalize([a], 0.3); },
  click() { const [a] = buf(0.08); const hp = new HP(2000); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = hp.p(white()) * env(t, 0.0005, 0.006, 0.07) + Math.sin(2 * Math.PI * 3000 * t) * env(t, 0.0005, 0.004, 0.03); } return normalize([a], 0.5); },
  bottle_break() { const [a] = buf(1.2); const rs = Array.from({ length: 8 }, () => new Reson(2500 + rnd() * 5000, 25)); const hp = new HP(1000); for (let i = 0; i < a.length; i++) { const t = i / SR; const ex = (rnd() < 0.02 * Math.exp(-t * 6) ? 1 : 0) + white() * 0.05 * Math.exp(-t * 10); let s = 0; rs.forEach((r) => (s += r.p(ex))); a[i] = s * 3 + hp.p(white()) * Math.exp(-t * 25); } return normalize([a], 0.8); },
  impact_wood() { const [a] = buf(0.5); const r = new Reson(240, 6), r2 = new Reson(610, 8); for (let i = 0; i < a.length; i++) { const t = i / SR; const x = white() * Math.exp(-t * 80); a[i] = (r.p(x) + r2.p(x) * 0.6) * 3; } return normalize([a], 0.8); },
  impact_metal() { const [a] = buf(1.0); for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; [180, 437, 811, 1307].forEach((f, k) => (s += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (3 + k * 2)) / (k + 1))); a[i] = s + white() * Math.exp(-t * 60) * 0.6; } return normalize([a], 0.8); },
  rat() { const [a] = buf(1.0); for (let i = 0; i < a.length; i++) { const t = i / SR; const ch = (tt) => (tt > 0 && tt < 0.09 ? Math.sin(2 * Math.PI * (3500 + 2000 * Math.sin(tt * 60)) * tt) * Math.sin((tt / 0.09) * Math.PI) : 0); a[i] = ch(t) + ch(t - 0.15) * 0.7 + white() * 0.15 * (Math.sin(t * 80) > 0.6 ? 1 : 0) * Math.exp(-t * 2); } return normalize([a], 0.5); },
  door_heavy() { const [a] = buf(2.5); const lp = new LP(500); const r = new Reson(180, 8); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = lp.p(white()) * (t < 2 ? 0.5 + 0.3 * Math.sin(t * 30) : 0) + r.p(white()) * env(t, 0.2, 1.4, 2.4) + (t > 2.0 ? Math.sin(2 * Math.PI * 50 * (t - 2)) * Math.exp(-(t - 2) * 8) * 2 : 0); } return normalize([a], 0.8); },
  switch_lever() { const [a] = buf(0.4); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = white() * env(t, 0.001, 0.01, 0.05) + Math.sin(2 * Math.PI * 160 * t) * env(t - 0.05, 0.001, 0.05, 0.3) * (t > 0.05 ? 1 : 0) + Math.sin(2 * Math.PI * 1200 * t) * env(t - 0.05, 0.001, 0.02, 0.2) * 0.4 * (t > 0.05 ? 1 : 0); } return normalize([a], 0.7); },
  power_on() { const [a] = buf(3); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const f = 30 + 70 * Math.min(1, t / 1.5); ph += f / SR; a[i] = (Math.sin(2 * Math.PI * ph) * 0.6 + Math.sin(4 * Math.PI * ph) * 0.3 + white() * 0.1 * Math.min(1, t)) * env(t, 0.1, 2, 2.9) + (t < 0.15 ? white() * (1 - t / 0.15) : 0); } return normalize([a], 0.8); },
  power_off() { const [a] = buf(2.2); let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / SR; const f = 100 * Math.exp(-t * 2); ph += f / SR; a[i] = (Math.sin(2 * Math.PI * ph) * 0.6 + Math.sin(4 * Math.PI * ph) * 0.3) * Math.exp(-t * 1.2) + (t < 0.08 ? white() : 0); } return normalize([a], 0.8); },
  heal() { const [a] = buf(0.8); const hp = new HP(1200); for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = hp.p(white()) * (Math.sin(t * 60) > 0 ? 1 : 0.3) * env(t, 0.02, 0.3, 0.75); } return normalize([a], 0.5); },
  chase_loop() { // 140 bpm percussion + pulse bass, 4 bars-ish
    const len = (60 / 140) * 8; const [a, b] = buf(len, 2); const beat = 60 / 140; const lp = new LP(140);
    for (let i = 0; i < a.length; i++) {
      const t = i / SR; const bt = t % beat; const n = Math.floor(t / beat);
      const kick = Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-bt * 30)) * bt) * Math.exp(-bt * 9);
      const tomT = (t + beat / 2) % (beat * 2); const tom = n % 2 ? Math.sin(2 * Math.PI * (110 - tomT * 40) * tomT) * Math.exp(-tomT * 12) * 0.5 : 0;
      const metT = (t + beat * 0.75) % beat; const met = white() * Math.exp(-metT * 40) * 0.25;
      const bass = lp.p(((t * 55) % 1) * 2 - 1) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / beat * 2)) * 0.8;
      a[i] = kick + tom + met + bass; b[i] = kick + tom * 0.8 + met * 1.2 + bass;
    }
    return normalize([a, b], 0.85);
  },
  tension_loop() { const [a, b] = buf(8, 2); const fs = [65.4, 69.3, 98, 103.8]; const ph = fs.map(() => 0); const lp = new LP(600), lp2 = new LP(620); for (let i = 0; i < a.length; i++) { const t = i / SR; let s = 0; fs.forEach((f, k) => { ph[k] += f / SR; s += ((ph[k] % 1) * 2 - 1) * (0.5 + 0.5 * Math.sin(t * Math.PI / 4 + k)); }); const pulse = 0.6 + 0.4 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.5)), 4); a[i] = lp.p(s) * pulse; b[i] = lp2.p(s) * pulse; } return normalize([loopify(a, 300), loopify(b, 300)], 0.6); },
};

// ---------------- engine ----------------
class AudioEngine {
  constructor() { this.ready = false; this.buffers = new Map(); this.loops = new Map(); this.voices = []; this.zone = 'hall'; this.tension = 0; this.lowQuality = false; }

  init() {
    if (this.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    SR = ctx.sampleRate || SR;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master.connect(this.comp).connect(ctx.destination);
    this.bus = {};
    for (const n of ['sfx', 'amb', 'music', 'ui', 'voice']) { const g = ctx.createGain(); g.connect(this.master); this.bus[n] = g; }
    // reverb: two convolvers (crossfade on zone change)
    this.revIn = ctx.createGain();
    this.revA = ctx.createConvolver(); this.revB = ctx.createConvolver();
    this.revGA = ctx.createGain(); this.revGB = ctx.createGain();
    this.revIn.connect(this.revA).connect(this.revGA).connect(this.bus.sfx);
    this.revIn.connect(this.revB).connect(this.revGB).connect(this.bus.sfx);
    this.irs = { hall: this.makeIR(3.2, 0.03, 5000), tunnel: this.makeIR(4.2, 0.05, 3000), room: this.makeIR(1.0, 0.01, 6000), open: this.makeIR(1.8, 0.02, 4000) };
    this.revA.buffer = this.irs.hall; this.revB.buffer = this.irs.tunnel;
    this.revGA.gain.value = 1; this.revGB.gain.value = 0; this.revActive = 'A';
    this.applyVolumes();
    this.ready = true;
    // unlock on iOS
    try { const b = ctx.createBuffer(1, 1, SR); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }

  applyVolumes() {
    if (!this.ready && !this.master) return;
    const v = getProfile().settings.volume;
    this.master.gain.value = v.master;
    this.bus.sfx.gain.value = v.sfx;
    this.bus.amb.gain.value = v.ambience;
    this.bus.music.gain.value = v.music;
    this.bus.ui.gain.value = Math.min(1, v.sfx);
    this.bus.voice.gain.value = v.voice ?? 1;
  }

  makeIR(seconds, predelay, damp) {
    const len = Math.floor(SR * seconds), pre = Math.floor(SR * predelay);
    const ir = ctx.createBuffer(2, len + pre, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); const lp = new LP(damp);
      for (let i = 0; i < len; i++) { const t = i / SR; lp.set(Math.max(400, damp * Math.exp(-t * 1.5))); d[i + pre] = lp.p(white()) * Math.pow(1 - i / len, 2.2) * (i < 200 ? i / 200 : 1); }
    }
    return ir;
  }

  setZone(z) {
    if (!this.ready || z === this.zone || !this.irs[z]) return;
    this.zone = z;
    const t = ctx.currentTime;
    if (this.revActive === 'A') { this.revB.buffer = this.irs[z]; this.revGA.gain.setTargetAtTime(0, t, 0.4); this.revGB.gain.setTargetAtTime(1, t, 0.4); this.revActive = 'B'; }
    else { this.revA.buffer = this.irs[z]; this.revGB.gain.setTargetAtTime(0, t, 0.4); this.revGA.gain.setTargetAtTime(1, t, 0.4); this.revActive = 'A'; }
  }

  get(name, variant = 0) {
    const key = name + '#' + variant;
    let b = this.buffers.get(key);
    if (b) return b;
    const recipe = R[name];
    if (!recipe) return null;
    const chans = recipe(variant);
    b = ctx.createBuffer(chans.length, chans[0].length, SR);
    chans.forEach((d, i) => b.copyToChannel(d, i));
    this.buffers.set(key, b);
    return b;
  }
  // pre-generate common buffers during loading
  warmup() { if (!this.ready) return; for (const n of ['step_concrete', 'step_tile', 'step_gravel', 'drip', 'click', 'pickup', 'ui', 'drone', 'wind', 'heartbeat', 'growl', 'creak']) for (let v = 0; v < (n.startsWith('step') ? 3 : 1); v++) this.get(n, v); }

  listener(pos, fwd, up) {
    if (!this.ready) return;
    const L = ctx.listener; const t = ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02); L.forwardY.setTargetAtTime(fwd.y, t, 0.02); L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
    this.listenerPos = pos;
  }

  // play a sound. opts: pos (Vector3-like) for 3D, volume, rate, loop, bus, variant, reverb (0..1), occlusion (0..1)
  play(name, opts = {}) {
    if (!this.ready) return null;
    const b = this.get(name, opts.variant ?? Math.floor(Math.random() * (opts.variants || 1)));
    if (!b) return null;
    if (this.voices.length > 48) { const v = this.voices.shift(); try { v.src.stop(); } catch (e) { /* ignore */ } }
    const src = ctx.createBufferSource();
    try { src.buffer = b; } catch (e) { return null; }
    src.loop = !!opts.loop;
    src.playbackRate.value = (opts.rate ?? 1) * (opts.jitter ? 1 + (Math.random() - 0.5) * opts.jitter : 1);
    const g = ctx.createGain(); g.gain.value = opts.volume ?? 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
    src.connect(g).connect(lp);
    let out = lp, panner = null;
    if (opts.pos) {
      panner = ctx.createPanner();
      panner.panningModel = this.lowQuality ? 'equalpower' : 'HRTF';
      panner.distanceModel = 'inverse'; panner.refDistance = opts.ref ?? 1.6; panner.rolloffFactor = opts.rolloff ?? 1.1; panner.maxDistance = 80;
      this._setPannerPos(panner, opts.pos);
      out.connect(panner); out = panner;
    }
    out.connect(this.bus[opts.bus || 'sfx']);
    let send = null;
    const rv = opts.reverb ?? (opts.pos ? 0.35 : 0);
    if (rv > 0) { send = ctx.createGain(); send.gain.value = rv; out.connect(send).connect(this.revIn); }
    if (opts.occlusion) lp.frequency.value = 20000 * Math.pow(1 - opts.occlusion * 0.93, 2.5) + 300;
    if (opts.fadeIn) { g.gain.value = 0; g.gain.setTargetAtTime(opts.volume ?? 1, ctx.currentTime, opts.fadeIn / 3); }
    src.start(ctx.currentTime + (opts.delay || 0), opts.offset || 0);
    const voice = {
      src, gain: g, lp, panner, send, name,
      setPos: (p) => panner && this._setPannerPos(panner, p),
      setVolume: (v, tc = 0.1) => g.gain.setTargetAtTime(v, ctx.currentTime, tc),
      setOcclusion: (o) => lp.frequency.setTargetAtTime(20000 * Math.pow(1 - o * 0.93, 2.5) + 300, ctx.currentTime, 0.1),
      setRate: (r) => src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.1),
      stop: (fade = 0.15) => { try { g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); src.stop(ctx.currentTime + fade + 0.05); } catch (e) { /* ignore */ } },
    };
    src.onended = () => { const i = this.voices.indexOf(voice); if (i >= 0) this.voices.splice(i, 1); };
    if (!opts.loop) this.voices.push(voice);
    return voice;
  }
  _setPannerPos(p, pos) { if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); }

  // named persistent loops (ambience etc.)
  loop(key, name, opts = {}) {
    if (!this.ready) return null;
    if (this.loops.has(key)) return this.loops.get(key);
    const v = this.play(name, { ...opts, loop: true, fadeIn: opts.fadeIn ?? 1.5 });
    if (v) this.loops.set(key, v);
    return v;
  }
  stopLoop(key, fade = 1) { const v = this.loops.get(key); if (v) { v.stop(fade); this.loops.delete(key); } }
  stopAllLoops(fade = 0.5) { for (const k of [...this.loops.keys()]) this.stopLoop(k, fade); }
  stopAll() { this.stopAllLoops(0.2); for (const v of this.voices) v.stop(0.1); this.voices = []; }

  // dynamic music: tension 0..1 (0 calm, 0.5 tension, 1 chase)
  setTension(level, dt) {
    if (!this.ready) return;
    this.tension += (level - this.tension) * Math.min(1, dt * (level > this.tension ? 2 : 0.4));
    const tl = this.loop('m_tension', 'tension_loop', { bus: 'music', volume: 0 });
    const cl = this.loop('m_chase', 'chase_loop', { bus: 'music', volume: 0 });
    tl && tl.setVolume(Math.max(0, Math.min(1, this.tension * 2)) * 0.55 * (1 - Math.max(0, this.tension - 0.6) * 2), 0.3);
    cl && cl.setVolume(Math.max(0, (this.tension - 0.55) / 0.45) * 0.7, 0.3);
  }

  // music duck for silence moments
  duck(amount, seconds) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    this.bus.amb.gain.setTargetAtTime(getProfile().settings.volume.ambience * (1 - amount), t, 0.6);
    setTimeout(() => this.bus.amb.gain.setTargetAtTime(getProfile().settings.volume.ambience, ctx.currentTime, 1.5), seconds * 1000);
  }

  // synthesized speech for radio transmissions (optional)
  speak(text, { pitch = 0.7, rate = 0.95 } = {}) {
    try {
      if (!('speechSynthesis' in window) || !getProfile().settings.voice) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU'; u.pitch = pitch; u.rate = rate; u.volume = Math.min(1, (getProfile().settings.volume.voice ?? 1) * getProfile().settings.volume.master);
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith('ru'));
      if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
}

export const audio = new AudioEngine();
