import * as THREE from 'three';
import { Noise, rng, clamp, lerp, smooth } from './util.js';
import { atmo, ATMO } from './sky.js';
import { terrainDetail, waterNormal, facadeTextures, runwayTexture } from './textures.js';

const PALETTES = {
  temperate: { grass: ['#4f6b2e', '#6f8443'], forest: '#263f1f', fields: ['#728a3e', '#968f56', '#5e7533', '#7e7050', '#a89e66', '#68843c'], rock: '#77716a', snow: '#eef2f6', sand: '#c4b48c', urban: '#8b8783', dry: '#8a8a58' },
  tropical: { grass: ['#4b7e30', '#6c9440'], forest: '#1d4f24', fields: ['#5f8a34', '#8a9a48', '#4a7a30', '#9a8a50', '#6a9a40', '#7a8a3a'], rock: '#665e54', snow: '#eef2f6', sand: '#e6d8ac', urban: '#9a948c', dry: '#8a8a50' },
  desert: { grass: ['#b88f5c', '#c9a46e'], forest: '#6f6a3e', fields: ['#7a8a3a', '#9a9a50', '#b89a60', '#a07a4a', '#6a7a34', '#c0a066'], rock: '#9a6444', snow: '#eef2f6', sand: '#d6b47c', urban: '#b0a08a', dry: '#a88860' },
  arctic: { grass: ['#6a6a58', '#7c7a66'], forest: '#24342a', fields: ['#7a7a62', '#8a8670', '#6a6a58', '#8a8a74', '#77745e', '#6a6e5a'], rock: '#56575c', snow: '#f2f5f8', sand: '#8a8678', urban: '#7f7d7b', dry: '#7a7866' },
  alpine: { grass: ['#557a36', '#729048'], forest: '#243e22', fields: ['#6f8a3a', '#97a050', '#5a7a32', '#88844e', '#a8a060', '#6a8a40'], rock: '#7d7872', snow: '#f3f6f9', sand: '#a8a088', urban: '#8b8783', dry: '#8a8a5a' },
  volcanic: { grass: ['#45602e', '#5a7238'], forest: '#22381e', fields: ['#5a7234', '#7a8044', '#4a6230', '#6a6040', '#7a7448', '#56703a'], rock: '#3c3836', snow: '#eef2f6', sand: '#4a4644', urban: '#6b6764', dry: '#5a5448' },
};

export class Terrain {
  constructor(engine, mapDef, Q) {
    this.engine = engine; this.M = mapDef; this.Q = Q;
    this.size = mapDef.size; this.N = Q.hm;
    this.group = new THREE.Group();
    this.cities = []; this.airbase = null;
    this.water = mapDef.water > 0 || mapDef.sea > 0;
  }
  // ---------------- height generation ----------------
  generate() {
    const M = this.M, N = this.N, S = this.size;
    const n = new Noise(M.seed, 256), n2 = new Noise(M.seed + 7, 256), n3 = new Noise(M.seed + 13, 256);
    const H = new Float32Array(N * N);
    const vc = M.volcano ? [0.5 + 0.06, 0.5 - 0.04] : null;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / (N - 1), v = j / (N - 1); const x = u - 0.5, y = v - 0.5; const d = Math.sqrt(x * x + y * y) * 2;
      const c = n.fbm(u * 3 + 5, v * 3 + 2, 6);
      const mtn = smooth(0.38, 0.72, n3.fbm(u * 1.6 + 20, v * 1.6 + 3, 3));
      const r = n2.ridge(u * 5.5, v * 5.5, 6);
      let h = c * 0.6 + r * (0.12 + mtn * M.ridge * 0.85) + n.fbm(u * 24, v * 24, 3) * 0.03;
      if (M.sea > 0) h -= smooth(0.55, 1.0, d) * 0.35; else h += smooth(0.75, 1.05, d) * 0.25 * M.ridge;
      if (M.canyon) {
        const t = h * 7; const ft = Math.floor(t), fr = t - ft; h = (ft + smooth(0.35, 0.65, fr)) / 7 * 0.9 + h * 0.1;
        const cv = Math.abs(n3.fbm(u * 3.2 + 11, v * 3.2 + 7, 5) - 0.5); h -= smooth(0.05, 0.0, cv) * 0.22;
      }
      if (vc) { const dv = Math.hypot(u - vc[0], v - vc[1]); h += Math.pow(Math.max(0, 1 - dv / 0.16), 1.6) * 0.75 - smooth(0.022, 0.0, dv) * 0.18; }
      H[j * N + i] = h;
    }
    // level for sea percentage
    let level, maxH = -1e9, minH = 1e9;
    for (let k = 0; k < H.length; k++) { if (H[k] > maxH) maxH = H[k]; if (H[k] < minH) minH = H[k]; }
    if (M.sea > 0) { const smp = []; for (let k = 0; k < 40000; k++) smp.push(H[(Math.random() * H.length) | 0]); smp.sort((a, b) => a - b); level = smp[Math.floor(M.sea * smp.length)]; }
    else level = minH - 0.02;
    for (let k = 0; k < H.length; k++) {
      const t = H[k] - level;
      H[k] = t > 0 ? Math.pow(t / (maxH - level), 1.25) * M.hScale + 1.5 : t / (level - minH + 1e-6) * 260;
    }
    // rivers (lowland)
    if (M.water > 0 && M.water < 1) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const u = i / (N - 1), v = j / (N - 1); const rv = Math.abs(n3.fbm(u * 2.4 + 9, v * 2.4 + 1, 5) - 0.5);
        const k = j * N + i; const w = smooth(0.012, 0.0, rv) * smooth(M.hScale * 0.35, M.hScale * 0.05, H[k]);
        H[k] = lerp(H[k], -6, w);
      }
    }
    this.H = H;
    this.placeFeatures(n, n2);
    return this;
  }
  hRaw(i, j) { const N = this.N; i = clamp(i, 0, N - 1); j = clamp(j, 0, N - 1); return this.H[j * N + i]; }
  heightAt(x, z) {
    const N = this.N, S = this.size;
    const fx = (x / S + 0.5) * (N - 1), fz = (z / S + 0.5) * (N - 1);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = this.hRaw(i, j), b = this.hRaw(i + 1, j), c = this.hRaw(i, j + 1), d = this.hRaw(i + 1, j + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  groundAt(x, z) { const h = this.heightAt(x, z); return this.water ? Math.max(h, 0) : h; }
  slopeAt(x, z) { const e = this.size / this.N; const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z), dz = this.heightAt(x, z + e) - this.heightAt(x, z - e); return Math.hypot(dx, dz) / (2 * e); }
  flatten(cx, cz, hw, hl, ang, h, blend = 600) {
    const N = this.N, S = this.size; const ca = Math.cos(ang), sa = Math.sin(ang);
    const r = Math.max(hw, hl) + blend;
    const i0 = Math.floor(((cx - r) / S + 0.5) * (N - 1)), i1 = Math.ceil(((cx + r) / S + 0.5) * (N - 1));
    const j0 = Math.floor(((cz - r) / S + 0.5) * (N - 1)), j1 = Math.ceil(((cz + r) / S + 0.5) * (N - 1));
    for (let j = Math.max(j0, 0); j <= Math.min(j1, N - 1); j++) for (let i = Math.max(i0, 0); i <= Math.min(i1, N - 1); i++) {
      const x = (i / (N - 1) - 0.5) * S - cx, z = (j / (N - 1) - 0.5) * S - cz;
      const lx = Math.abs(x * ca - z * sa) - hw, lz = Math.abs(x * sa + z * ca) - hl;
      const d = Math.max(lx, lz, 0); const w = smooth(blend, 0, d);
      this.H[j * N + i] = lerp(this.H[j * N + i], h, w);
    }
  }
  placeFeatures(n, n2) {
    const M = this.M, S = this.size, R = rng(M.seed * 31);
    // airbase near south of arena centre
    if (M.airbase) {
      let best = null;
      for (let k = 0; k < 400; k++) {
        const x = (R() - 0.5) * 16000, z = 4000 + R() * 9000; const h = this.heightAt(x, z);
        if (h < 8 || h > M.hScale * 0.45) continue;
        const sc = this.slopeAt(x, z) + this.slopeAt(x + 1500, z) + this.slopeAt(x - 1500, z) + h / M.hScale * 0.3;
        if (!best || sc < best.sc) best = { x, z, h, sc };
      }
      if (!best) best = { x: 0, z: 8000, h: 30 };
      const ang = R() * Math.PI;
      const hgt = Math.max(best.h, 12);
      this.flatten(best.x, best.z, 260, 1900, ang, hgt, 900);
      this.airbase = { x: best.x, z: best.z, h: hgt, ang };
    }
    // cities
    const nC = M.cities;
    for (let c = 0; c < nC; c++) {
      let best = null;
      for (let k = 0; k < 300; k++) {
        let x = (R() - 0.5) * S * 0.7, z = (R() - 0.5) * S * 0.7;
        if (M.metro && c === 0) { x = (R() - 0.5) * 4000; z = -2000 - R() * 6000; }
        const h = this.heightAt(x, z); if (h < 6 || h > M.hScale * 0.4) continue;
        if (this.airbase && Math.hypot(x - this.airbase.x, z - this.airbase.z) < 5000) continue;
        if (this.cities.some(o => Math.hypot(o.x - x, o.z - z) < 9000)) continue;
        const sc = this.slopeAt(x, z) * 3 + (M.metro && c === 0 ? 0 : R() * 0.2);
        if (!best || sc < best.sc) best = { x, z, h, sc };
      }
      if (!best) continue;
      const rad = M.metro && c === 0 ? 5200 : 1400 + R() * 1400;
      this.flatten(best.x, best.z, rad * 0.55, rad * 0.55, 0, Math.max(best.h, 8), rad * 0.6);
      this.cities.push({ x: best.x, z: best.z, r: rad, h: Math.max(best.h, 8) });
    }
    // masks (CPU, 512)
    const Nm = 512; this.Nm = Nm; const mask = new Uint8Array(Nm * Nm * 4); this.mask = mask;
    const forestAmt = M.forest, fieldAmt = M.fields;
    for (let j = 0; j < Nm; j++) for (let i = 0; i < Nm; i++) {
      const u = i / (Nm - 1), v = j / (Nm - 1); const x = (u - 0.5) * S, z = (v - 0.5) * S;
      const h = this.heightAt(x, z); const sl = this.slopeAt(x, z);
      const fn = n2.fbm(u * 9 + 3, v * 9 + 1, 5);
      let forest = smooth(1 - forestAmt - 0.03, 1 - forestAmt + 0.12, fn) * smooth(2, 12, h) * smooth(M.snow * 0.95, M.snow * 0.7, h) * smooth(0.9, 0.45, sl);
      let urban = 0;
      for (const c of this.cities) { const d = Math.hypot(x - c.x, z - c.z) / c.r; urban = Math.max(urban, smooth(1.0, 0.35, d + (n.fbm(u * 40, v * 40, 3) - 0.5) * 0.5)); }
      if (this.airbase) { const d = Math.hypot(x - this.airbase.x, z - this.airbase.z); forest *= smooth(1500, 2600, d); }
      const fieldN = n.fbm(u * 5 + 40, v * 5 + 8, 4);
      let fields = fieldAmt > 0 ? smooth(1 - fieldAmt - 0.1, 1 - fieldAmt + 0.1, fieldN) * smooth(0.35, 0.12, sl) * smooth(2, 6, h) * smooth(M.hScale * 0.5, M.hScale * 0.25, h) : 0;
      forest *= 1 - urban; fields *= (1 - urban) * (1 - forest * 0.8);
      const k = (j * Nm + i) * 4; mask[k] = forest * 255; mask[k + 1] = fields * 255; mask[k + 2] = urban * 255; mask[k + 3] = 255;
    }
  }
  maskAt(x, z, ch) { const Nm = this.Nm; const i = clamp(Math.round((x / this.size + 0.5) * (Nm - 1)), 0, Nm - 1), j = clamp(Math.round((z / this.size + 0.5) * (Nm - 1)), 0, Nm - 1); return this.mask[(j * Nm + i) * 4 + ch] / 255; }

  // ---------------- GPU resources ----------------
  async build() {
    const r = this.engine.renderer, N = this.N, S = this.size, M = this.M, Q = this.Q;
    const hTex = new THREE.DataTexture(this.H, N, N, THREE.RedFormat, THREE.FloatType);
    hTex.minFilter = hTex.magFilter = THREE.NearestFilter; hTex.needsUpdate = true; this.hTex = hTex;
    // normals
    const nd = new Uint8Array(N * N * 4); const e = S / (N - 1);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = this.hRaw(i + 1, j) - this.hRaw(i - 1, j), dz = this.hRaw(i, j + 1) - this.hRaw(i, j - 1);
      let nx = -dx / (2 * e), ny = 1, nz = -dz / (2 * e); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const k = (j * N + i) * 4; nd[k] = (nx * 0.5 + 0.5) * 255; nd[k + 1] = (ny * 0.5 + 0.5) * 255; nd[k + 2] = (nz * 0.5 + 0.5) * 255; nd[k + 3] = 255;
    }
    const nTex = new THREE.DataTexture(nd, N, N, THREE.RGBAFormat); nTex.generateMipmaps = true; nTex.minFilter = THREE.LinearMipmapLinearFilter; nTex.magFilter = THREE.LinearFilter; nTex.needsUpdate = true; this.nTex = nTex;
    const mTex = new THREE.DataTexture(this.mask, this.Nm, this.Nm, THREE.RGBAFormat); mTex.minFilter = THREE.LinearFilter; mTex.magFilter = THREE.LinearFilter; mTex.needsUpdate = true;
    // bake colour
    const P = PALETTES[M.palette];
    const col = (h) => new THREE.Color(h);
    const CM = Q.cm;
    const rt = new THREE.WebGLRenderTarget(CM, CM, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    rt.texture.anisotropy = 8;
    const bake = new THREE.ShaderMaterial({
      uniforms: {
        tH: { value: hTex }, tN: { value: nTex }, tM: { value: mTex }, uSize: { value: S }, uRes: { value: N },
        cG0: { value: col(P.grass[0]) }, cG1: { value: col(P.grass[1]) }, cF: { value: col(P.forest) }, cR: { value: col(P.rock) }, cS: { value: col(P.snow) }, cSa: { value: col(P.sand) }, cU: { value: col(P.urban) }, cD: { value: col(P.dry) },
        cFl: { value: P.fields.map(col) }, uSnow: { value: M.snow }, uWater: { value: this.water ? 1 : 0 }, uSeed: { value: M.seed },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tH, tN, tM; uniform float uSize, uRes, uSnow, uWater, uSeed;
        uniform vec3 cG0, cG1, cF, cR, cS, cSa, cU, cD; uniform vec3 cFl[6];
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)) + uSeed)*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<6;i++){ s+=a*vn(p); p=p*2.02+vec2(3.1,1.7); a*=0.5;} return s; }
        float H(vec2 uv){ vec2 f = uv*(uRes-1.0); vec2 i = floor(f); vec2 t = f - i;
          float a = texelFetch(tH, ivec2(clamp(i, vec2(0), vec2(uRes-1.0))), 0).r, b = texelFetch(tH, ivec2(clamp(i+vec2(1,0), vec2(0), vec2(uRes-1.0))), 0).r;
          float c = texelFetch(tH, ivec2(clamp(i+vec2(0,1), vec2(0), vec2(uRes-1.0))), 0).r, d = texelFetch(tH, ivec2(clamp(i+vec2(1,1), vec2(0), vec2(uRes-1.0))), 0).r;
          return mix(mix(a,b,t.x), mix(c,d,t.x), t.y); }
        void main(){
          vec2 w = (vUv - 0.5) * uSize; // metres
          float h = H(vUv); vec3 n = texture2D(tN, vUv).xyz*2.0-1.0; float slope = 1.0 - n.y;
          vec4 m = texture2D(tM, vUv);
          float g1 = fbm(w/900.0), g2 = fbm(w/140.0), g3 = fbm(w/35.0);
          vec3 col = mix(cG0, cG1, smoothstep(0.3, 0.75, g1*0.7 + g2*0.3));
          col = mix(col, cD, smoothstep(0.55, 0.8, fbm(w/2500.0 + 7.0)) * 0.6);
          col *= 0.85 + g3*0.3;
          // fields patchwork
          float fm = m.g;
          if (fm > 0.01) {
            float ang = h2(floor(w/3000.0))*3.14; mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
            vec2 p = R * w; vec2 cs = vec2(260.0 + 180.0*h2(floor(w/3000.0)+3.0), 180.0 + 120.0*h2(floor(w/3000.0)+9.0));
            vec2 cell = floor(p / cs); vec2 fr = fract(p / cs);
            // irregular splits
            float sp = h2(cell + 17.0); if (sp > 0.5) { cell.x += step(0.5, fr.x)*0.37; fr.x = fract(fr.x*2.0); }
            float id = h2(cell);
            vec3 fc = cFl[int(id*5.99)];
            fc *= 0.85 + 0.3*h2(cell+5.0);
            float rows = 0.92 + 0.08*sin((p.x + p.y*0.02)*1.3);
            fc *= rows * (0.9 + g3*0.2);
            float edge = min(min(fr.x, 1.0-fr.x)*cs.x, min(fr.y, 1.0-fr.y)*cs.y);
            float hedge = smoothstep(6.0, 1.5, edge) * step(0.35, h2(cell+31.0));
            fc = mix(fc, cF*1.1, hedge*0.8);
            fc = mix(fc, col, 0.25); col = mix(col, fc, smoothstep(0.1, 0.5, fm) * 0.85);
          }
          // forest
          float fo = m.r; float fe = fo + (g3-0.5)*0.35 + (g2-0.5)*0.2;
          vec3 fcol = cF * (0.75 + 0.5*fbm(w/22.0)) * (0.9 + 0.2*g1);
          col = mix(col, fcol, smoothstep(0.35, 0.55, fe));
          // urban
          float ur = m.b;
          if (ur > 0.02) {
            vec2 b = fract(w/110.0); float street = step(0.86, max(b.x,b.y));
            vec2 bi = floor(w/110.0); float park = step(0.9, h2(bi+71.0));
            vec3 uc = cU * (0.75 + 0.5*h2(floor(w/22.0))) ;
            uc = mix(uc, cG0*0.9, park); uc = mix(uc, vec3(0.22,0.22,0.23), street);
            col = mix(col, uc, smoothstep(0.25, 0.6, ur + (g3-0.5)*0.3));
          }
          // roads (isolines)
          float rd = abs(fbm(w/6000.0 + 2.0) - 0.5);
          float road = smoothstep(0.0016, 0.0006, rd) * step(3.0, h) * step(slope, 0.25);
          col = mix(col, vec3(0.25,0.25,0.26), road*0.85);
          // rock on slopes
          float rk = smoothstep(0.22, 0.42, slope + (g2-0.5)*0.2);
          vec3 rcol = cR * (0.7 + 0.6*fbm(w/60.0 + vec2(0.0, w.y/25.0)));
          col = mix(col, rcol, rk);
          // snow
          float sn = smoothstep(uSnow - 150.0, uSnow + 200.0, h + (g1-0.5)*500.0) * smoothstep(0.75, 0.4, slope);
          col = mix(col, cS * (0.9 + 0.1*g3), sn);
          // beach / underwater
          if (uWater > 0.5) {
            float beach = smoothstep(7.0, 1.0, h) * smoothstep(-25.0, 0.0, h);
            col = mix(col, cSa*(0.9+0.2*g3), beach);
            if (h < 0.0) col = mix(cSa*0.8, vec3(0.12,0.16,0.15), smoothstep(0.0, -60.0, h));
          }
          float lights = 0.0;
          if (ur > 0.05) { vec2 b = fract(w/110.0); float st = smoothstep(0.80, 0.9, max(b.x,b.y)); lights = st * smoothstep(0.2, 0.6, ur) * (0.5 + 0.5*h2(floor(w/18.0))); lights += smoothstep(0.3,0.8,ur) * step(0.93, h2(floor(w/9.0))) * 0.6; }
          lights += road * 0.5;
          gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2)), clamp(lights, 0.0, 1.0));
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bake); const sc = new THREE.Scene(); sc.add(quad);
    const cam = new THREE.Camera();
    // bake in small tiles so a mobile GPU never hits the watchdog (context loss => black screen)
    { const T = 256, gl = r.getContext(); rt.scissorTest = true; r.setRenderTarget(rt);
      for (let y = 0; y < CM; y += T) for (let x = 0; x < CM; x += T) {
        rt.scissor.set(x, y, Math.min(T, CM - x), Math.min(T, CM - y)); r.render(sc, cam);
        gl.finish(); await new Promise(res => setTimeout(res, 0));
      }
      rt.scissorTest = false; r.setRenderTarget(null); }
    bake.dispose(); quad.geometry.dispose();
    this.colorRT = rt;
    this.buildClipmap();
    if (this.water) this.buildWater();
    this.buildScatter();
    return this;
  }
  terrainMaterial(level, spacing) {
    const S = this.size, N = this.N;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const det = terrainDetail();
    const uni = { tH: { value: this.hTex }, tN: { value: this.nTex }, tC: { value: this.colorRT.texture }, tD: { value: det }, uSize: { value: S }, uRes: { value: N },
      uFine: { value: new THREE.Vector3() }, uSpacing: { value: spacing }, uLevel: { value: level }, uExt: { value: spacing * this.Q.terrainN } };
    mat.userData.uni = uni;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni, { uNight: ATMO.uNight });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform sampler2D tH, tN; uniform float uSize, uRes, uSpacing, uLevel, uExt; uniform vec3 uFine; varying vec3 vTW;
        float Hs(vec2 wp){ vec2 uv = wp/uSize + 0.5; vec2 f = clamp(uv,0.0,1.0)*(uRes-1.0); vec2 i = floor(f); vec2 t = f - i; ivec2 ii = ivec2(i); int m = int(uRes)-1;
          float a = texelFetch(tH, ivec2(min(ii.x,m), min(ii.y,m)), 0).r, b = texelFetch(tH, ivec2(min(ii.x+1,m), min(ii.y,m)), 0).r;
          float c = texelFetch(tH, ivec2(min(ii.x,m), min(ii.y+1,m)), 0).r, d = texelFetch(tH, ivec2(min(ii.x+1,m), min(ii.y+1,m)), 0).r;
          return mix(mix(a,b,t.x), mix(c,d,t.x), t.y); }`)
        .replace('#include <beginnormal_vertex>', `vec3 wpos = vec3(position.x*uExt, 0.0, position.z*uExt) + modelMatrix[3].xyz;
          vec3 objectNormal = texture2D(tN, wpos.xz/uSize + 0.5).xyz*2.0-1.0;`)
        .replace('#include <begin_vertex>', `vec3 transformed = vec3(wpos.x, Hs(wpos.xz), wpos.z);
          if (uLevel > 0.5) { vec2 dd = abs(wpos.xz - uFine.xy); float inner = max(dd.x, dd.y);
            float dist = length(wpos - cameraPosition);
            if (inner < uFine.z - 2.0*uSpacing) transformed.y -= 3000.0; else if (inner < uFine.z + uSpacing) transformed.y -= 0.5 + dist*0.004; }
          vTW = transformed; transformed -= modelMatrix[3].xyz;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform sampler2D tN, tC, tD; uniform float uSize; uniform float uNight; varying vec3 vTW;`)
        .replace('#include <map_fragment>', `
          vec2 tuv = vTW.xz/uSize + 0.5;
          vec3 tcol = texture2D(tC, tuv).rgb; tcol = pow(tcol, vec3(2.2));
          float tdist = length(vTW - cameraPosition);
          vec4 d1 = texture2D(tD, vTW.xz/31.0); vec4 d2 = texture2D(tD, vTW.xz/230.0); vec4 d3 = texture2D(tD, vTW.xz/7.0);
          float nearF = 1.0 - smoothstep(1200.0, 7000.0, tdist);
          float near2 = 1.0 - smoothstep(150.0, 900.0, tdist);
          tcol *= mix(1.0, 0.72 + 0.56*d2.g, 0.85);
          vec4 d4 = texture2D(tD, vTW.xz/1300.0); tcol *= 0.86 + 0.28*d4.g;
          tcol *= mix(1.0, 0.72 + 0.56*d1.r, nearF);
          tcol *= mix(1.0, 0.8 + 0.4*d3.a, near2);
          diffuseColor.rgb *= tcol;
          float tLights = texture2D(tC, tuv).a;`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          { vec3 tn = texture2D(tN, vTW.xz/uSize + 0.5).xyz*2.0-1.0;
            vec4 dd = texture2D(tD, vTW.xz/40.0); float nf = 1.0 - smoothstep(300.0, 3000.0, length(vTW - cameraPosition));
            tn.xz += (vec2(dd.r, dd.g) - 0.5) * 0.35 * nf;
            normal = normalize((viewMatrix * vec4(normalize(tn), 0.0)).xyz); }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * tLights * uNight * 2.5;')
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness; { float br = dot(tcol, vec3(0.33)); roughnessFactor = mix(0.95, 0.55, smoothstep(0.45, 0.75, br)); }`);
    };
    mat.customProgramCacheKey = () => 'terrain';
    return atmo(mat);
  }
  buildClipmap() {
    const Q = this.Q; const n = Q.terrainN; const L = Q.levels;
    const target = 90000; let s0 = target / (n * Math.pow(2, L - 1)); s0 = Math.max(s0, 8);
    this.uCenter = { value: new THREE.Vector2() };
    this.levels = [];
    const geo = new THREE.PlaneGeometry(1, 1, n, n); geo.rotateX(-Math.PI / 2);
    for (let k = 0; k < L; k++) {
      const sp = s0 * Math.pow(2, k);
      const mat = this.terrainMaterial(k, sp);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.receiveShadow = k < 2; mesh.renderOrder = k;
      mesh.userData = { sp, k, ext: n * sp };
      this.group.add(mesh); this.levels.push(mesh);
    }
  }
  update(cam) {
    for (const m of this.levels) {
      const snap = m.userData.sp * 2;
      m.position.set(Math.round(cam.position.x / snap) * snap, 0, Math.round(cam.position.z / snap) * snap);
    }
    for (let k = 1; k < this.levels.length; k++) {
      const f = this.levels[k - 1]; this.levels[k].material.userData.uni.uFine.value.set(f.position.x, f.position.z, f.userData.ext / 2);
    }
    if (this.waterMesh) { const s = 400; this.waterMesh.position.set(Math.round(cam.position.x / s) * s, 0, Math.round(cam.position.z / s) * s); }
    for (const c of this.treeChunks || []) c.visible = Math.hypot(c.userData.cx - cam.position.x, c.userData.cz - cam.position.z) < this.treeR + Math.max(0, cam.position.y) * 0.5;
    for (const c of this.bChunks || []) c.visible = Math.hypot(c.userData.cx - cam.position.x, c.userData.cz - cam.position.z) < 26000;
  }
  buildWater() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b2a3a, roughness: 0.06, metalness: 0.0, normalMap: waterNormal(), normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.25 });
    const uni = { tH: { value: this.hTex }, uSize: { value: this.size }, uRes: { value: this.N } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni, { uTime: ATMO.uTime });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWW; uniform float uTime; uniform sampler2D tH; uniform float uSize, uRes;`)
        .replace('#include <normal_fragment_maps>', `
          { float wd = length(vWW - cameraPosition); float nf = 1.0 - smoothstep(2000.0, 25000.0, wd);
            vec3 n1 = texture2D(normalMap, vWW.xz/180.0 + vec2(uTime*0.006, uTime*0.004)).xyz*2.0-1.0;
            vec3 n2 = texture2D(normalMap, vWW.xz/47.0 + vec2(-uTime*0.011, uTime*0.009)).xyz*2.0-1.0;
            vec3 n3 = texture2D(normalMap, vWW.xz/900.0 + vec2(uTime*0.002, -uTime*0.003)).xyz*2.0-1.0;
            vec3 wn = normalize(vec3((n1.xy + n2.xy*0.6)*nf*0.55 + n3.xy*0.5, 1.0));
            wn = vec3(wn.x, wn.z, wn.y);
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          { vec2 f = clamp(vWW.xz/uSize + 0.5, 0.0, 1.0)*(uRes-1.0); float hh = texelFetch(tH, ivec2(f), 0).r;
            float depth = max(-hh, 0.0);
            vec3 shallow = vec3(0.10, 0.42, 0.42); vec3 deep = diffuseColor.rgb;
            diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 45.0, depth));
            float foam = smoothstep(3.0, 0.0, depth) * (0.6 + 0.4*sin(uTime*1.5 + vWW.x*0.05 + vWW.z*0.03));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), foam*0.6); }`);
    };
    mat.customProgramCacheKey = () => 'water';
    atmo(mat);
    const geo = new THREE.PlaneGeometry(200000, 200000, 1, 1); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 20; mesh.frustumCulled = false; mesh.receiveShadow = false;
    this.waterMesh = mesh; this.group.add(mesh);
  }
  buildScatter() {
    const Q = this.Q, S = this.size, R = rng(this.M.seed * 7 + 1);
    // ---- trees
    const pal = PALETTES[this.M.palette];
    const conifer = this.M.palette === 'arctic' || this.M.palette === 'alpine';
    const tg = [];
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 3, 5); trunk.translate(0, 1.5, 0);
    const setC = (g, c) => { const n = g.getAttribute('position').count; const a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
    const crownCol = new THREE.Color(pal.forest).multiplyScalar(1.25);
    let treeGeo;
    {
      const parts = [setC(trunk, '#4a3626')];
      if (conifer || this.M.palette === 'volcanic') { for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry(3.4 - k * 0.9, 5.5 - k * 0.8, 7); c.translate(0, 4.5 + k * 3.0, 0); parts.push(setC(c, crownCol)); } }
      else { const s = new THREE.IcosahedronGeometry(4.2, 1); s.scale(1, 1.15, 1); s.translate(0, 6.5, 0); parts.push(setC(s, crownCol)); const s2 = new THREE.IcosahedronGeometry(3, 0); s2.translate(1.8, 8.5, 0.6); parts.push(setC(s2, crownCol)); }
      for (const p of parts) { p.deleteAttribute('uv'); }
      treeGeo = mergeGeo(parts);
    }
    const tMat = atmo(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const CH = 12; const cs = S / CH; this.treeChunks = []; this.treeR = 3500 + Q.trees * 3000;
    const perChunk = Math.floor(1600 * Q.trees);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    if (perChunk > 0 && this.M.forest > 0.03) for (let cj = 0; cj < CH; cj++) for (let ci = 0; ci < CH; ci++) {
      const cx = (ci + 0.5) * cs - S / 2, cz = (cj + 0.5) * cs - S / 2;
      const mats = [];
      for (let k = 0; k < perChunk * 3 && mats.length < perChunk; k++) {
        const x = cx + (R() - 0.5) * cs, z = cz + (R() - 0.5) * cs;
        const f = this.maskAt(x, z, 0); if (R() > f * 1.3) continue;
        const h = this.heightAt(x, z); if (h < 2) continue;
        const s = 0.7 + R() * 0.8; p.set(x, h - 0.5, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28); sc.set(s, s * (0.85 + R() * 0.4), s);
        mats.push(m4.compose(p, q, sc).clone());
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(treeGeo, tMat, mats.length);
      for (let i = 0; i < mats.length; i++) { im.setMatrixAt(i, mats[i]); col.setHSL(0.25 + R() * 0.08, 0.3 + R() * 0.3, 0.35 + R() * 0.3); im.setColorAt(i, col); }
      im.computeBoundingSphere(); im.userData = { cx, cz }; this.group.add(im); this.treeChunks.push(im);
    }
    // ---- buildings
    const fac = facadeTextures();
    const bMat = new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.em, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.8, metalness: 0.1 });
    bMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = ATMO.uNight;
      sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        { vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          float style = floor(fract(instanceMatrix[3].x*0.0137 + instanceMatrix[3].z*0.0071)*4.0);
          vec2 fuv = uv; float wsz = abs(normal.x) > 0.5 ? isc.z : isc.x;
          fuv = vec2(fuv.x * wsz / 40.0, fuv.y * isc.y / 64.0);
          fuv.x = fract(fuv.x)*0.25 + style*0.25 ;
          if (normal.y > 0.5) fuv = vec2(0.01 + style*0.25, 0.995);
          vMapUv = fuv; vEmissiveMapUv = fuv; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNight * 4.0;');
    };
    bMat.customProgramCacheKey = () => 'bld';
    atmo(bMat);
    fac.map.wrapS = THREE.RepeatWrapping; fac.map.wrapT = THREE.RepeatWrapping;
    const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
    this.bChunks = [];
    for (const c of this.cities) {
      const mats = []; const n = Math.floor((this.M.metro ? 4200 : 900) * Q.buildings * (c.r / 2000));
      const block = 110;
      for (let k = 0; k < n * 3 && mats.length < n; k++) {
        const bx = Math.round((c.x + (R() - 0.5) * c.r * 2) / block) * block, bz = Math.round((c.z + (R() - 0.5) * c.r * 2) / block) * block;
        const u = this.maskAt(bx, bz, 2); if (u < 0.3 || R() > u) continue;
        const d = Math.hypot(bx - c.x, bz - c.z) / c.r;
        const ox = (R() - 0.5) * 60, oz = (R() - 0.5) * 60;
        const w = 18 + R() * 30, l = 18 + R() * 30;
        let hgt = 8 + R() * 25; if (d < 0.35) hgt += R() * R() * (this.M.metro ? 260 : 90);
        const x = bx + ox, z = bz + oz; const h = this.heightAt(x, z); if (h < 1) continue;
        p.set(x, h - 2, z); q.identity(); sc.set(w, hgt + 2, l); mats.push(m4.compose(p, q, sc).clone());
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(bGeo, bMat, mats.length);
      for (let i = 0; i < mats.length; i++) { im.setMatrixAt(i, mats[i]); col.setHSL(0.08, 0.05 + R() * 0.1, 0.55 + R() * 0.45); im.setColorAt(i, col); }
      im.computeBoundingSphere(); im.userData = { cx: c.x, cz: c.z }; this.group.add(im); this.bChunks.push(im);
    }
    // ---- airbase
    if (this.airbase) this.buildAirbase();
  }
  buildAirbase() {
    const A = this.airbase; const g = new THREE.Group(); g.position.set(A.x, A.h, A.z); g.rotation.y = A.ang;
    const rwT = runwayTexture(); rwT.repeat.set(1, 1);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(60, 3000), atmo(new THREE.MeshStandardMaterial({ map: rwT, roughness: 0.85 })));
    rw.rotation.x = -Math.PI / 2; rw.position.y = 0.35; rw.receiveShadow = true; g.add(rw);
    const apronM = atmo(new THREE.MeshStandardMaterial({ color: 0x6c6c68, roughness: 0.9 }));
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(25, 2600), apronM); tw.rotation.x = -Math.PI / 2; tw.position.set(140, 0.3, 0); g.add(tw);
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(220, 600), apronM); ap.rotation.x = -Math.PI / 2; ap.position.set(260, 0.32, 200); g.add(ap);
    for (const z of [-900, 900]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(130, 22), apronM); c.rotation.x = -Math.PI / 2; c.position.set(75, 0.31, z); g.add(c); }
    const hMat = atmo(new THREE.MeshStandardMaterial({ color: 0x8a8f86, roughness: 0.6, metalness: 0.4 }));
    const hGeo = new THREE.CylinderGeometry(22, 22, 50, 16, 1, false, 0, Math.PI); hGeo.rotateZ(Math.PI / 2); hGeo.rotateY(Math.PI / 2);
    this.hangars = [];
    for (let i = 0; i < 6; i++) { const h = new THREE.Mesh(hGeo, hMat); h.position.set(400, 0, -100 + i * 70); h.rotation.y = Math.PI / 2; h.castShadow = true; g.add(h); this.hangars.push(h); }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 30, 12), atmo(new THREE.MeshStandardMaterial({ color: 0xb8b4aa, roughness: 0.8 }))); tower.position.set(330, 15, -300); g.add(tower);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 6, 8), atmo(new THREE.MeshStandardMaterial({ color: 0x203040, metalness: 0.8, roughness: 0.15 }))); cab.position.set(330, 33, -300); g.add(cab);
    // runway lights
    const lg = new THREE.BufferGeometry(); const pts = [];
    for (let z = -1500; z <= 1500; z += 60) { pts.push(-32, 0.6, z, 32, 0.6, z); }
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lm = new THREE.PointsMaterial({ color: 0xffe0a0, size: 3, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    this.rwLights = new THREE.Points(lg, lm); g.add(this.rwLights);
    g.updateMatrixWorld(true);
    this.group.add(g); this.airbaseGroup = g;
  }
  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.dispose()); } });
    this.colorRT && this.colorRT.dispose(); this.hTex && this.hTex.dispose(); this.nTex && this.nTex.dispose();
  }
}
function mergeGeo(parts) {
  let n = 0, idxN = 0; for (const p of parts) { n += p.getAttribute('position').count; idxN += p.index ? p.index.count : p.getAttribute('position').count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); const idx = []; let o = 0;
  for (const p of parts) {
    const c = p.getAttribute('position').count;
    pos.set(p.getAttribute('position').array, o * 3); nor.set(p.getAttribute('normal').array, o * 3); col.set(p.getAttribute('color').array, o * 3);
    if (p.index) for (let i = 0; i < p.index.count; i++) idx.push(p.index.array[i] + o); else for (let i = 0; i < c; i++) idx.push(i + o);
    o += c;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); return g;
}
