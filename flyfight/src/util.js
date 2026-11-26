export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Value noise with optional period (tileable)
export class Noise {
  constructor(seed = 1, size = 256) {
    const r = rng(seed); this.size = size; this.p = new Float32Array(size * size);
    for (let i = 0; i < this.p.length; i++) this.p[i] = r();
  }
  v(x, y, period = 0) {
    const s = this.size; let xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi;
    let x1 = xi + 1, y1 = yi + 1;
    if (period) { xi = ((xi % period) + period) % period; yi = ((yi % period) + period) % period; x1 = (xi + 1) % period; y1 = (yi + 1) % period; }
    const m = s - 1, p = this.p;
    const a = p[(yi & m) * s + (xi & m)], b = p[(yi & m) * s + (x1 & m)], c = p[(y1 & m) * s + (xi & m)], d = p[(y1 & m) * s + (x1 & m)];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  fbm(x, y, oct = 5, period = 0, lac = 2, gain = 0.5) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * this.v(x * f, y * f, period ? period * f : 0); norm += amp; amp *= gain; f *= lac; }
    return sum / norm;
  }
  ridge(x, y, oct = 5) {
    let sum = 0, amp = 0.5, f = 1, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(this.v(x * f, y * f) * 2 - 1); n *= n; n *= w; w = clamp(n * 1.6, 0, 1); sum += amp * n; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
}
export function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
