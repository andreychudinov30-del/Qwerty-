import * as THREE from 'three';
import { Noise, rng, canvas, clamp } from './util.js';

const cache = {};
function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true; return t;
}
const hex = (h) => { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; };

// Panel lines / rivets: bump (R), AO-grime (G)
export function panelTextures() {
  if (cache.panel) return cache.panel;
  const S = 1024, c = canvas(S), g = c.getContext('2d');
  const r = rng(7);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const n = new Noise(3);
  // base subtle noise
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 128 + (n.fbm(x / 64, y / 64, 4, 16) - 0.5) * 18; const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(id, 0, 0);
  // panels: recursive subdivision (tileable by wrapping draw)
  const lines = [];
  function split(x, y, w, h, depth) {
    if (depth > 4 || (w < 120 && h < 120) || (depth > 2 && r() < 0.25)) { lines.push([x, y, w, h]); return; }
    if (w > h * (0.7 + r() * 0.6)) { const s = Math.round(w * (0.3 + r() * 0.4)); split(x, y, s, h, depth + 1); split(x + s, y, w - s, h, depth + 1); }
    else { const s = Math.round(h * (0.3 + r() * 0.4)); split(x, y, w, s, depth + 1); split(x, y + s, w, h - s, depth + 1); }
  }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) split(i * S / 2, j * S / 2, S / 2, S / 2, 0);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  wrap(() => {
    for (const [x, y, w, h] of lines) {
      g.strokeStyle = 'rgba(20,20,20,0.95)'; g.lineWidth = 2.2; g.strokeRect(x + 0.5, y + 0.5, w, h);
      g.strokeStyle = 'rgba(200,200,200,0.35)'; g.lineWidth = 1; g.strokeRect(x + 2.5, y + 2.5, w - 4, h - 4);
      // rivets
      g.fillStyle = 'rgba(60,60,60,0.9)';
      const sp = 11;
      for (let k = sp; k < w - 4; k += sp) { g.fillRect(x + k, y + 6, 2, 2); g.fillRect(x + k, y + h - 7, 2, 2); }
      for (let k = sp; k < h - 4; k += sp) { g.fillRect(x + 6, y + k, 2, 2); g.fillRect(x + w - 7, y + k, 2, 2); }
      if (r() < 0.12 && w > 80 && h > 80) { // access hatch
        const hw = 30 + r() * 40, hh = 24 + r() * 30, hx = x + 15 + r() * (w - hw - 30), hy = y + 15 + r() * (h - hh - 30);
        g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.roundRect(hx, hy, hw, hh, 4); g.stroke();
        g.fillStyle = 'rgba(40,40,40,1)'; for (const [a, b] of [[hx + 4, hy + 4], [hx + hw - 6, hy + 4], [hx + 4, hy + hh - 6], [hx + hw - 6, hy + hh - 6]]) g.fillRect(a, b, 2, 2);
      }
    }
  });
  const bump = tex(c, false);
  // grime / AO map
  const c2 = canvas(S), g2 = c2.getContext('2d');
  g2.drawImage(c, 0, 0);
  const id2 = g2.getImageData(0, 0, S, S), d2 = id2.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4; const b = d2[i] / 255;
    const streak = n.fbm(x / 6, y / 140, 3, 0) ; const grime = 0.86 + 0.14 * n.fbm(x / 90 + 7, y / 90, 4, 0);
    const v = clamp((0.55 + b * 0.5) * grime * (0.93 + streak * 0.1), 0, 1) * 255;
    d2[i] = v; d2[i + 1] = v; d2[i + 2] = v;
  }
  g2.putImageData(id2, 0, 0);
  const ao = tex(c2, false);
  // roughness
  const c3 = canvas(512), g3 = c3.getContext('2d'); const id3 = g3.createImageData(512, 512); const d3 = id3.data;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const i = (y * 512 + x) * 4; const v = 150 + (n.fbm(x / 30, y / 30, 5, 17) - 0.5) * 90 + (n.v(x / 3, y / 40) - 0.5) * 20; d3[i] = d3[i + 1] = d3[i + 2] = v; d3[i + 3] = 255; }
  g3.putImageData(id3, 0, 0);
  const rough = tex(c3, false);
  return (cache.panel = { bump, ao, rough });
}

export function liveryTexture(liv) {
  const key = JSON.stringify(liv);
  if (cache[key]) return cache[key];
  const S = 1024, c = canvas(S), g = c.getContext('2d');
  const n = new Noise(liv.colors.join('').length * 7 + 3);
  const col = liv.colors.map(hex);
  const id = g.createImageData(S, S), d = id.data;
  const r = rng(91);
  // voronoi points for splinter
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push([r() * S, r() * S, (r() * col.length) | 0]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let k = 0, t = 0;
    const u = x / S, v = y / S;
    if (liv.type === 'two' || liv.type === 'blotch') {
      const f = n.fbm(u * 4, v * 4, 5, 4);
      const f2 = n.fbm(u * 4 + 10, v * 4 + 3, 5, 4);
      if (liv.type === 'two') { k = f > 0.52 ? 1 : 0; t = Math.abs(f - 0.52) < 0.012 ? 0.5 : 0; }
      else k = f > 0.55 ? 1 : (f2 > 0.6 ? 2 : 0);
    } else if (liv.type === 'splinter') {
      let best = 1e9, bk = 0;
      for (const p of pts) { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const dx = x - p[0] - ox, dy = (y - p[1] - oy) * 1.2 + dx * 0.4; const dd = dx * dx + dy * dy; if (dd < best) { best = dd; bk = p[2]; } } }
      k = bk;
    } else if (liv.type === 'digital') {
      const px = Math.floor(x / 12), py = Math.floor(y / 12);
      const f = n.fbm(px / 85 * 4 * 12 / 12, py / 85 * 4, 4, 0) * 0.5 + n.fbm((px * 12) / S * 5, (py * 12) / S * 5, 4, 5) * 0.8;
      k = f > 0.78 ? 3 : f > 0.66 ? 1 : f > 0.56 ? 2 : 0;
    } else if (liv.type === 'display') {
      const w = (u + v * 0.6) * 3 % 1;
      k = w < 0.28 ? 0 : w < 0.38 ? 2 : 1;
    } else if (liv.type === 'tiger') {
      const w = Math.sin((u * 6 + n.fbm(u * 3, v * 3, 4, 3) * 2.5) * Math.PI * 2);
      k = w > 0.55 ? 1 : (v < 0.35 ? 2 : 0);
    }
    k = Math.min(k, col.length - 1);
    const cc = col[k];
    const grime = 1 - 0.07 * n.fbm(u * 40, v * 3, 3, 0) - 0.05 * n.fbm(u * 8 + 3, v * 8, 4, 8);
    const i = (y * S + x) * 4;
    d[i] = cc[0] * grime; d[i + 1] = cc[1] * grime; d[i + 2] = cc[2] * grime; d[i + 3] = 255;
    if (t) { d[i] *= 0.9; d[i + 1] *= 0.9; d[i + 2] *= 0.9; }
  }
  g.putImageData(id, 0, 0);
  return (cache[key] = tex(c));
}

export function insignia(country) {
  const k = 'ins_' + country; if (cache[k]) return cache[k];
  const c = canvas(256), g = c.getContext('2d');
  const star = (cx, cy, R, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); };
  if (country === 'ru') {
    star(128, 132, 120, 48); g.fillStyle = '#b8b8b8'; g.fill();
    star(128, 132, 108, 43); g.fillStyle = '#c8102e'; g.fill();
    star(128, 132, 88, 35); g.fillStyle = '#e8e8e8'; g.fill();
    star(128, 132, 80, 32); g.fillStyle = '#c8102e'; g.fill();
  } else if (country === 'us') {
    g.fillStyle = '#4a4f55'; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(128, 128, 60, 0, 7); g.lineWidth = 6; g.strokeStyle = '#4a4f55'; g.stroke();
    star(128, 130, 56, 22); g.fill();
    g.fillRect(14, 108, 60, 36); g.fillRect(182, 108, 60, 36);
    g.clearRect(20, 114, 48, 24); g.clearRect(188, 114, 48, 24);
    g.fillRect(26, 120, 36, 12); g.fillRect(194, 120, 36, 12);
  } else {
    g.fillStyle = '#c8102e'; star(128, 128, 82, 33); g.fill();
    g.fillRect(4, 108, 70, 40); g.fillRect(182, 108, 70, 40);
    g.fillStyle = '#f2c230'; g.font = 'bold 50px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('八一', 128, 132);
  }
  const t = tex(c, true, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return (cache[k] = t);
}
export function numberTex(text, color = '#c8102e', outline = '#ffffff') {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.font = 'bold 92px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = outline; g.strokeText(text, 128, 66); g.fillStyle = color; g.fillText(text, 128, 66);
  const t = tex(c, true, false); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// soft sprite atlas 2x2: smoke variants (alpha)
export function smokeAtlas() {
  if (cache.smoke) return cache.smoke;
  const S = 512, c = canvas(S), g = c.getContext('2d'); const id = g.createImageData(S, S), d = id.data;
  const n = new Noise(13);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * 256, oy = (q >> 1) * 256;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = x / 128 - 1, v = y / 128 - 1; const rr = Math.sqrt(u * u + v * v);
      const f = n.fbm(x / 40 + q * 17, y / 40 + q * 9, 5);
      const a = clamp((1 - rr) * 1.6 - (1 - f) * 0.9, 0, 1);
      const i = ((oy + y) * S + ox + x) * 4;
      const sh = clamp(0.75 + (f - 0.5) * 0.9 - v * 0.15, 0, 1);
      d[i] = d[i + 1] = d[i + 2] = sh * 255; d[i + 3] = a * a * 255;
    }
  }
  g.putImageData(id, 0, 0);
  const t = tex(c, false, false); return (cache.smoke = t);
}
// fire / flash atlas 2x2: [fireball, flash star, spark, soft glow]
export function fireAtlas() {
  if (cache.fire) return cache.fire;
  const S = 512, c = canvas(S), g = c.getContext('2d'); const id = g.createImageData(S, S), d = id.data;
  const n = new Noise(29);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * 256, oy = (q >> 1) * 256;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = x / 128 - 1, v = y / 128 - 1; const rr = Math.sqrt(u * u + v * v); let a = 0, R = 1, G = 1, B = 1;
      if (q === 0) { const f = n.fbm(x / 28, y / 28, 5); a = clamp((1 - rr) * 1.8 - (1 - f) * 1.1, 0, 1); const h = clamp(a * 1.3, 0, 1); R = 1; G = 0.35 + h * 0.6; B = 0.08 + h * h * 0.6; }
      else if (q === 1) { const ang = Math.atan2(v, u); const ray = Math.pow(Math.abs(Math.cos(ang * 3)), 40) * 0.5 + Math.pow(Math.abs(Math.cos(ang * 2 + 0.4)), 60) * 0.4; a = clamp(Math.exp(-rr * 5) * 1.4 + ray * Math.exp(-rr * 2.2), 0, 1); }
      else if (q === 2) { a = clamp(Math.exp(-(u * u * 60 + v * v * 2.2)), 0, 1); }
      else { a = clamp(Math.exp(-rr * rr * 4) - 0.02, 0, 1); }
      const i = ((oy + y) * S + ox + x) * 4; d[i] = R * 255; d[i + 1] = G * 255; d[i + 2] = B * 255; d[i + 3] = a * 255;
    }
  }
  g.putImageData(id, 0, 0);
  return (cache.fire = tex(c, true, false));
}
export function cloudAtlas() {
  if (cache.cloud) return cache.cloud;
  const S = 512, c = canvas(S), g = c.getContext('2d'); const id = g.createImageData(S, S), d = id.data;
  const n = new Noise(57);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * 256, oy = (q >> 1) * 256;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = x / 128 - 1, v = y / 128 - 1; const rr = Math.sqrt(u * u + v * v * 1.1);
      const f = n.fbm(x / 34 + q * 31, y / 34 + q * 5, 6, 0, 2.1, 0.55);
      const a = clamp((1 - rr) * 2.2 - (1 - f) * 1.5, 0, 1);
      const i = ((oy + y) * S + ox + x) * 4;
      d[i] = f * 255; d[i + 1] = (0.5 + 0.5 * -v) * 255; d[i + 2] = 255; d[i + 3] = Math.pow(a, 1.3) * 255;
    }
  }
  g.putImageData(id, 0, 0);
  return (cache.cloud = tex(c, false, false));
}
// tileable terrain detail: R fine, G medium, B rock streaks, A grass blades
export function terrainDetail() {
  if (cache.tdet) return cache.tdet;
  const S = 512, c = canvas(S), g = c.getContext('2d'); const id = g.createImageData(S, S), d = id.data;
  const n = new Noise(77);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    d[i] = n.fbm(x / 8, y / 8, 4, 64) * 255;
    d[i + 1] = n.fbm(x / 48, y / 48, 5, S / 48) * 255;
    d[i + 2] = n.ridge(x / 64, y / 26, 4) * 255;
    d[i + 3] = n.fbm(x / 3, y / 3, 3, 0) * 255;
  }
  g.putImageData(id, 0, 0);
  return (cache.tdet = tex(c, false));
}
export function waterNormal() {
  if (cache.wn) return cache.wn;
  const S = 512, n = new Noise(5); const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = n.fbm(x / 32, y / 32, 5, S / 32) + 0.5 * n.fbm(x / 9, y / 13, 3, 0);
  const c = canvas(S), g = c.getContext('2d'); const id = g.createImageData(S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)], hy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const nx = -hx * 6, ny = -hy * 6, l = Math.hypot(nx, ny, 1); const i = (y * S + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return (cache.wn = tex(c, false));
}
export function facadeTextures() {
  if (cache.fac) return cache.fac;
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), ce = canvas(W, H), ge = ce.getContext('2d');
  const r = rng(5);
  g.fillStyle = '#8d8a84'; g.fillRect(0, 0, W, H); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  // 4 columns of facade styles, 16 floors each tile
  for (let s = 0; s < 4; s++) {
    const x0 = s * 128; const base = [[150, 146, 138], [95, 105, 115], [170, 160, 140], [70, 80, 90]][s];
    g.fillStyle = `rgb(${base})`; g.fillRect(x0, 0, 128, H);
    const fl = 32;
    for (let f = 0; f < H / fl; f++) for (let w = 0; w < 6; w++) {
      const wx = x0 + 6 + w * 20, wy = f * fl + 7;
      const lit = r() < 0.35;
      g.fillStyle = s === 3 ? `rgb(${40 + r() * 30},${60 + r() * 30},${80 + r() * 40})` : `rgb(${30 + r() * 30},${40 + r() * 30},${55 + r() * 40})`;
      g.fillRect(wx, wy, s === 3 ? 18 : 13, s === 1 ? 20 : 17);
      if (lit) { ge.fillStyle = `rgb(${200 + r() * 55},${160 + r() * 60},${90 + r() * 60})`; ge.fillRect(wx, wy, s === 3 ? 18 : 13, s === 1 ? 20 : 17); }
    }
  }
  const map = tex(c), em = tex(ce);
  return (cache.fac = { map, em });
}
export function runwayTexture() {
  if (cache.rw) return cache.rw;
  const W = 128, H = 2048, c = canvas(W, H), g = c.getContext('2d');
  const n = new Noise(9); const id = g.createImageData(W, H), d = id.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = 52 + n.fbm(x / 6, y / 6, 4) * 30 + (Math.abs(x - 64) < 8 ? -8 * n.v(x / 2, y / 30) : 0); const i = (y * W + x) * 4; d[i] = v; d[i + 1] = v; d[i + 2] = v * 1.03; d[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  g.fillStyle = 'rgba(235,235,230,0.9)';
  for (let y = 120; y < H - 120; y += 60) g.fillRect(62, y, 4, 30);
  g.fillRect(4, 0, 3, H); g.fillRect(W - 7, 0, 3, H);
  for (const yy of [10, H - 70]) for (let k = 0; k < 8; k++) g.fillRect(12 + k * 13 + (k > 3 ? 8 : 0), yy, 7, 60);
  for (const yy of [260, H - 320]) { g.fillRect(30, yy, 14, 60); g.fillRect(84, yy, 14, 60); }
  return (cache.rw = tex(c));
}
