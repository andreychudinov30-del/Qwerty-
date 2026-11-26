// Seeded RNG + 2D gradient noise + fbm
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }

export function makeNoise(seed) {
  const r = rng(seed * 9973 + 7); const p = new Uint8Array(512); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const X = xi & 255, Y = yi & 255;
    const a = p[p[X] + Y], b = p[p[X + 1] + Y], c = p[p[X] + Y + 1], d = p[p[X + 1] + Y + 1];
    const u = fade(xf), v = fade(yf);
    const va = gx[a] * xf + gy[a] * yf, vb = gx[b] * (xf - 1) + gy[b] * yf, vc = gx[c] * xf + gy[c] * (yf - 1), vd = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    return (va + u * (vb - va) + v * (vc - va) + u * v * (va - vb - vc + vd)) * 1.41;
  }
  function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); n += a; a *= gain; f *= lac; } return s / n; }
  function ridge(x, y, oct = 5) { let s = 0, a = 1, f = 1, n = 0, w = 1; for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(n2(x * f, y * f)); v *= v; v *= w; w = Math.min(1, v * 2); s += a * v; n += a; a *= 0.5; f *= 2.05; } return s / n; }
  return { n2, fbm, ridge };
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
