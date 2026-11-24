// Buildings: procedural facade atlases, PBR wall detail, interior-mapped windows with night lights, roof details, signs
import * as THREE from 'three';
import { G, canvasTex, mulberry32 } from '../core/util.js';
import { tex } from '../core/assets.js';
import { quality } from '../core/save.js';
import { GeoBuilder, vcMat } from './geo.js';
import { wetU } from './ground.js';

export const nightU = { value: 0 };
const WIN = 8; // windows per texture tile (both axes)

// window rect inside cell [x0,y0,x1,y1] (0..1), wall color, glass color, frame color, winW meters, floorH meters, detail texture
const STYLES = {
  glass: { win: [0.03, 0.18, 0.97, 0.98], wall: '#30363c', glass: '#3c5464', frame: '#7d868c', w: 3, f: 3.8, detail: null, metal: 0.85, lit: 0.55, mull: 2 },
  glass2: { win: [0.04, 0.1, 0.96, 0.96], wall: '#6f7a80', glass: '#2c4a52', frame: '#b8c0c4', w: 3.2, f: 4, detail: null, metal: 0.9, lit: 0.6, fins: true },
  office: { win: [0.1, 0.28, 0.9, 0.86], wall: '#b8b2a6', glass: '#3a4a56', frame: '#5c6066', w: 3.2, f: 3.7, detail: 'concrete_wall_008', metal: 0.6, lit: 0.5 },
  brick: { win: [0.28, 0.24, 0.72, 0.84], wall: '#a3503a', glass: '#28343c', frame: '#e8e4dc', w: 3, f: 3.2, detail: 'brick_wall_02', metal: 0.3, lit: 0.45, sill: true },
  panel: { win: [0.24, 0.26, 0.76, 0.82], wall: '#c9c2b0', glass: '#2c3840', frame: '#efece4', w: 3, f: 3.0, detail: 'painted_concrete', metal: 0.3, lit: 0.5, seams: true },
  plaster: { win: [0.27, 0.22, 0.73, 0.84], wall: '#d8c8a8', glass: '#2a3440', frame: '#f4f0e8', w: 3.2, f: 3.2, detail: 'grey_plaster', metal: 0.3, lit: 0.45, sill: true },
  white: { win: [0.12, 0.22, 0.88, 0.9], wall: '#e8e6e0', glass: '#34505c', frame: '#c8ccd0', w: 3.4, f: 3.6, detail: 'grey_plaster', metal: 0.7, lit: 0.5 },
  industrial: { win: [0.1, 0.62, 0.9, 0.9], wall: '#8c8f88', glass: '#3c4448', frame: '#4c4e4c', w: 4, f: 5, detail: 'corrugated_iron', metal: 0.4, lit: 0.12 },
  concrete: { win: [0.15, 0.5, 0.85, 0.85], wall: '#a09c94', glass: '#3a4248', frame: '#606060', w: 4, f: 4.5, detail: 'concrete_wall_008', metal: 0.3, lit: 0.1 },
  shop: { win: [0.02, 0.0, 0.98, 0.72], wall: '#3a3633', glass: '#4a5a62', frame: '#202020', w: 4.5, f: 4.6, detail: null, metal: 0.55, lit: 0.9, shopfront: true },
  house: { win: [0.32, 0.25, 0.68, 0.8], wall: '#e4dccc', glass: '#28323a', frame: '#ffffff', w: 4.2, f: 3.4, detail: 'grey_plaster', metal: 0.3, lit: 0.55, sill: true },
  ruin: { win: [0.2, 0.3, 0.8, 0.85], wall: '#8a857a', glass: '#101214', frame: '#3a3a36', w: 4, f: 4.5, detail: 'concrete_wall_008', metal: 0.0, lit: 0.0, broken: true },
  wood: { win: [0.3, 0.3, 0.7, 0.75], wall: '#7a5a3a', glass: '#1c2228', frame: '#3a2a1a', w: 3.5, f: 3.6, detail: 'old_planks_02', metal: 0.2, lit: 0.6 },
};

function facadeTex(st) {
  const S = 512, c = S / WIN;
  return canvasTex(S, S, (g) => {
    g.fillStyle = st.wall; g.fillRect(0, 0, S, S);
    const r = mulberry32(st.w * 100 | 0);
    if (st.seams) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let i = 0; i <= WIN; i++) { g.beginPath(); g.moveTo(0, i * c); g.lineTo(S, i * c); g.stroke(); g.beginPath(); g.moveTo(i * c * 2, 0); g.lineTo(i * c * 2, S); g.stroke(); } }
    for (let y = 0; y < WIN; y++) for (let x = 0; x < WIN; x++) {
      const [a, b, cc, d] = st.win; const x0 = x * c + a * c, x1 = x * c + cc * c, y1 = S - (y * c + b * c), y0 = S - (y * c + d * c);
      // glass with sky gradient
      const gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, shade(st.glass, 1.25 + r() * 0.2)); gr.addColorStop(1, shade(st.glass, 0.75));
      g.fillStyle = st.broken && r() < 0.6 ? '#0a0a0a' : gr;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = st.frame; g.lineWidth = st.mull || 3;
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      if (!st.shopfront) { g.beginPath(); g.moveTo((x0 + x1) / 2, y0); g.lineTo((x0 + x1) / 2, y1); g.stroke(); }
      if (st.sill) { g.fillStyle = 'rgba(240,235,225,0.9)'; g.fillRect(x0 - 3, y1, x1 - x0 + 6, 4); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 - 3, y1 + 4, x1 - x0 + 6, 3); }
      if (st.fins && x % 2 === 0) { g.fillStyle = '#c8d0d4'; g.fillRect(x * c, 0, 5, S); }
    }
    // grime streaks
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,25,20,${0.02 + r() * 0.05})`; const x = r() * S; g.fillRect(x, r() * S, 2 + r() * 6, 20 + r() * 120); }
  });
}
function maskTex(st) {
  const S = 512, c = S / WIN;
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < WIN; y++) for (let x = 0; x < WIN; x++) {
      const [a, b, cc, d] = st.win; const x0 = x * c + a * c, x1 = x * c + cc * c, y1 = S - (y * c + b * c), y0 = S - (y * c + d * c);
      g.fillStyle = '#ffffff'; g.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    }
  }, { srgb: false });
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k), gg = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

const matCache = {};
export function facadeMat(name) {
  if (matCache[name]) return matCache[name];
  const st = STYLES[name];
  const m = new THREE.MeshStandardMaterial({ map: facadeTex(st), roughness: 0.85, metalness: 0, vertexColors: true });
  const mask = maskTex(st);
  const det = st.detail && tex[st.detail + '_diff'];
  const detN = st.detail && tex[st.detail + '_nor'];
  const interior = quality().reflections;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tMask: { value: mask }, tDet: { value: det || mask }, uNight: nightU, uWet: wetU, uWin: { value: new THREE.Vector4(...st.win) }, uMetal: { value: st.metal }, uLit: { value: st.lit }, uHasDet: { value: det ? 1 : 0 }, uShop: { value: st.shopfront ? 1 : 0 } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSeed; varying float vSeed; varying vec2 vFUv; varying vec3 vW; varying vec3 vWN;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFUv=uv; vSeed=aSeed;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tMask, tDet; uniform float uNight, uWet, uMetal, uLit, uHasDet, uShop; uniform vec4 uWin;
      varying float vSeed; varying vec2 vFUv; varying vec3 vW; varying vec3 vWN;
      float hh(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float gMask; vec3 gEmit;`)
      .replace('#include <map_fragment>', `
        vec4 texelColor = texture2D(map, vFUv);
        gMask = texture2D(tMask, vFUv).r;
        vec2 cell = floor(vFUv*${WIN}.);
        float rnd = hh(cell + vSeed*913.);
        float rnd2 = hh(cell.yx*1.7 + vSeed*37.);
        vec3 wall = texelColor.rgb;
        if(uHasDet>0.5){ vec3 d=texture2D(tDet, vW.xy*0.0+vec2(dot(vW.xz,vec2(abs(vWN.z),abs(vWN.x))),vW.y)/4.).rgb; wall*=mix(vec3(1.),d*1.9,0.75); }
        diffuseColor.rgb = mix(wall, texelColor.rgb*0.35, gMask);
        // lit windows + interior mapping
        float lit = step(rnd, uLit*(0.25+0.75*uNight) + uShop*0.6);
        vec3 lc = mix(vec3(1.0,0.72,0.42), vec3(0.75,0.85,1.0), step(0.75,rnd2));
        lc = mix(lc, vec3(1.,0.9,0.75), uShop);
        gEmit = vec3(0.);
        if(gMask>0.5){
          vec2 q = (fract(vFUv*${WIN}.)-uWin.xy)/(uWin.zw-uWin.xy);
          vec3 V = normalize(vW - cameraPosition);
          vec3 N = normalize(vWN); vec3 T = normalize(cross(vec3(0.,1.,0.),N)); vec3 B = vec3(0.,1.,0.);
          vec3 rd = vec3(dot(V,T), dot(V,B), -dot(V,N));
          vec3 ro = vec3(q, 0.);
          ${interior ? `
          float dep = 1.2;
          float tx = rd.x>0. ? (1.-ro.x)/rd.x : -ro.x/rd.x;
          float ty = rd.y>0. ? (1.-ro.y)/rd.y : -ro.y/rd.y;
          float tz = dep/max(rd.z,0.001);
          float t = min(min(tx,ty),tz);
          vec3 hp = ro + rd*t;
          vec3 wallc = mix(vec3(0.85,0.8,0.7), vec3(0.6,0.7,0.75), rnd2);
          vec3 ic;
          if(t==tz) ic = wallc;
          else if(t==ty) ic = rd.y>0. ? vec3(0.95) : vec3(0.45,0.32,0.22);
          else ic = wallc*0.75;
          float depthFade = 1.-hp.z/dep*0.45;
          ic *= depthFade;
          if(hp.z>0.75 && abs(hp.x-0.5)<0.18 && hp.y<0.45) ic*=0.35; // furniture silhouette
          ic = mix(ic, wallc*0.8, clamp(length(vW-cameraPosition)/220.,0.,1.));
          ` : 'vec3 ic = vec3(0.7,0.65,0.6);'}
          float dayIn = 0.06*(1.-uNight);
          gEmit = ic * (lit*lc*(1.1+uShop*0.8)*smoothstep(0.,0.35,uNight+uShop*0.4) + dayIn);
          if(lit>0.5 && rnd2<0.06) gEmit *= vec3(0.5,0.7,1.3)*(0.7+0.3*sin(vSeed*40.+cell.x*3.+cameraPosition.x*0.0));
        }`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(mix(roughness, 0.35, uWet*0.6), 0.04, gMask);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = mix(0., uMetal, gMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += gEmit;`);
  };
  m.customProgramCacheKey = () => 'fac_' + name + (interior ? 'i' : '');
  matCache[name] = m;
  return m;
}

// ---------- sign atlas ----------
export const SIGN_TEXTS = ['КАФЕ', 'АПТЕКА', 'ПРОДУКТЫ', 'БАНК', 'ПИЦЦА', 'ЦВЕТЫ', 'ОПТИКА', 'СУШИ', 'БАР', 'КНИГИ', 'ОБУВЬ', 'ЭЛЕКТРОНИКА', 'ХЛЕБ', 'ФИТНЕС', 'ОТЕЛЬ', 'КОФЕ', 'БУРГЕРЫ', 'САЛОН', 'МОДА', 'ЛОМБАРД', 'ТАКСИ', 'ХОСТЕЛ', 'КИНО', 'ПАБ', 'ШАУРМА', 'ЮВЕЛИР', 'ТЕЛЕКОМ', 'ПОЧТА',
  'ПОЛИЦИЯ', 'БОЛЬНИЦА', 'АРСЕНАЛ', 'СТИЛЬ', 'ПРЕМЬЕР АВТО', 'НЕДВИЖИМОСТЬ', 'ТЦ ГАЛАКТИКА', 'АЗС 24', 'АВТОСЕРВИС ДЕНИСА', 'ЗАВОД «ПРОГРЕСС»', 'КЛУБ «ВОЛНА»', 'ВЕРТЕКС'];
const SIGN_COLS = ['#ff3a5c', '#3affc8', '#ffd23a', '#3a9cff', '#ff7a2a', '#c43aff', '#ffffff', '#7aff3a'];
let signMat = null;
export function signMaterial() {
  if (signMat) return signMat;
  const cw = 512, ch = 96, n = SIGN_TEXTS.length, rows = Math.ceil(n / 2);
  const t = canvasTex(1024, rows * ch, (g) => {
    for (let i = 0; i < n; i++) {
      const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
      const bg = i < 28 ? (i % 3 === 0 ? '#101418' : i % 3 === 1 ? '#f2efe8' : '#1c2a44') : '#0d1520';
      g.fillStyle = bg; g.fillRect(x, y, cw, ch);
      const col = bg === '#f2efe8' ? '#b01818' : SIGN_COLS[i % SIGN_COLS.length];
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 14;
      g.font = `900 ${SIGN_TEXTS[i].length > 12 ? 40 : 58}px "Arial Black", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(SIGN_TEXTS[i], x + cw / 2, y + ch / 2 + 2);
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 4; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    }
  }, { repeat: false });
  signMat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.4 });
  signMat.onBeforeCompile = (sh) => { sh.uniforms.uNight = nightU; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance*=0.25+uNight*2.2;'); };
  signMat.userData.rows = rows;
  return signMat;
}
export function signUV(text) {
  let i = SIGN_TEXTS.indexOf(text); if (i < 0) i = 0;
  const rows = Math.ceil(SIGN_TEXTS.length / 2);
  const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) / rows, v0 = v1 - 1 / rows;
  return [[u0, v0], [u0 + 0.5, v1]];
}

// ---------- geometry ----------
function facade(gb, key, b, x0, z0, x1, z1, y0, y1, st, color, seed, vBase = 0) {
  const faces = [
    [[x0, z1], [x1, z1]], [[x1, z0], [x0, z0]], [[x1, z1], [x1, z0]], [[x0, z0], [x0, z1]],
  ];
  for (const [a, c] of faces) {
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n = Math.max(1, Math.round(L / st.w));
    const v0 = (y0 - vBase) / st.f / WIN, v1 = (y1 - vBase) / st.f / WIN;
    gb.quad(key, [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], [0, v0], [n / WIN, v1], color, seed);
  }
}

export function buildCity(city, chunks) {
  const q = quality();
  const roofMat = new THREE.MeshStandardMaterial({ map: tex.concrete_wall_008_diff, normalMap: tex.concrete_wall_008_nor, roughness: 0.95, color: 0x8a8680, vertexColors: true });
  const tileMat = new THREE.MeshStandardMaterial({ map: tex.brick_wall_02_diff, roughness: 0.8, color: 0x9a4a3a, vertexColors: true });
  const metalMat = vcMat(0.45, 0.7);
  const trimMat = vcMat(0.7, 0.05);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.3) });
  const sm = signMaterial();
  const mats = { roof: roofMat, tiles: tileMat, metal: metalMat, trim: trimMat, sign: sm, glow: glowMat, wallend: facadeMat('house') };
  for (const k of Object.keys(STYLES)) mats['f_' + k] = facadeMat(k);
  const builders = new Map();
  const GB = (x, z, layer) => { const k = chunks.key(x, z) + '|' + layer; if (!builders.has(k)) builders.set(k, new GeoBuilder()); return builders.get(k); };
  const R = mulberry32(99);
  let shopIdx = 0;

  for (const b of city.buildings) {
    const st = STYLES[b.style] || STYLES.office;
    const main = GB(b.x, b.z, 'main'), det = GB(b.x, b.z, 'near');
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, y0 = b.y0 || 0, y1 = y0 + b.h;
    const tint = b.tint || [0.88 + R() * 0.24, 0.88 + R() * 0.2, 0.88 + R() * 0.2];
    const seed = b.seed;
    const hasShop = (b.shop || b.kind === 'shop' || b.kind === 'police' || b.kind === 'hospital') && y0 === 0 && b.style !== 'shop';
    const gH = hasShop ? 4.6 : 0;
    if (gH) facade(main, 'f_shop', b, x0, z0, x1, z1, 0, gH, STYLES.shop, [1, 1, 1], seed);
    facade(main, 'f_' + (STYLES[b.style] ? b.style : 'office'), b, x0, z0, x1, z1, y0 + gH, y1, st, tint, seed, y0 + gH);
    // roof
    const roofKey = 'roof';
    if (b.roof === 'gable') {
      main.quad(roofKey, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 0], [1, 1], [0.5, 0.5, 0.5]);
      main.gable('tiles', b.x, y1, b.z, b.w, b.d, Math.min(b.w, b.d) * 0.38, b.kind === 'church' ? [0.5, 0.52, 0.6] : [0.7 + R() * 0.3, 0.45 + R() * 0.2, 0.4]);
      if (b.kind === 'house' && R() < 0.7) det.box('f_brick', x0 + b.w * 0.25, y1, b.z, 0.9, Math.min(b.w, b.d) * 0.45, 0.9, { tileU: 4, tileV: 4, color: [1, 1, 1] });
      // door + porch
      det.box('trim', b.x, 0, z1 + 0.05, 1.1, 2.2, 0.12, { color: [0.35, 0.22, 0.12] });
      det.box('trim', b.x, 0, z1 + 0.9, 3, 0.25, 1.8, { color: [0.6, 0.58, 0.55] });
    } else {
      main.quad(roofKey, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0 / 8, -z1 / 8], [x1 / 8, -z0 / 8], [0.62, 0.6, 0.58]);
      if (b.roof === 'arch') {
        for (let s = 0; s < 6; s++) { const a0 = (s / 6) * Math.PI, a1 = ((s + 1) / 6) * Math.PI, r = b.d / 2; main.quad('metal', [x0, y1 + Math.sin(a0) * r * 0.35, b.z + Math.cos(a0) * r], [x1, y1 + Math.sin(a0) * r * 0.35, b.z + Math.cos(a0) * r], [x1, y1 + Math.sin(a1) * r * 0.35, b.z + Math.cos(a1) * r], [x0, y1 + Math.sin(a1) * r * 0.35, b.z + Math.cos(a1) * r], [0, 0], [1, 1], [0.55, 0.58, 0.6]); }
      }
      // parapet
      const pc = [0.6, 0.59, 0.57], ph = b.h > 40 ? 1.4 : 0.9, pt = 0.35;
      det.box('trim', b.x, y1, z0 + pt / 2, b.w, ph, pt, { color: pc }); det.box('trim', b.x, y1, z1 - pt / 2, b.w, ph, pt, { color: pc });
      det.box('trim', x0 + pt / 2, y1, b.z, pt, ph, b.d, { color: pc }); det.box('trim', x1 - pt / 2, y1, b.z, pt, ph, b.d, { color: pc });
      // rooftop units
      const nU = Math.min(6, Math.floor(b.w * b.d / 200));
      for (let u = 0; u < nU; u++) {
        const ux = x0 + 3 + R() * (b.w - 6), uz = z0 + 3 + R() * (b.d - 6);
        if (R() < 0.35) det.cyl('metal', ux, y1, uz, 1.3, 1.3, 2.6, 10, { color: [0.6, 0.62, 0.6] });
        else det.box('metal', ux, y1, uz, 2 + R() * 2, 1.2 + R() * 1.2, 1.5 + R() * 2, { color: [0.72, 0.73, 0.74] });
      }
      if (b.h > 25 && R() < 0.5) det.box('trim', x0 + 4, y1, z0 + 4, 4, 3, 4, { color: [0.6, 0.6, 0.58] }); // stair housing
      // crowns
      if (b.crown === 'spire') { main.cyl('metal', b.x, y1, b.z, Math.min(b.w, b.d) * 0.12, 0.2, b.h * 0.22, 8, { color: [0.8, 0.82, 0.85] }); det.box('glow', b.x, y1 + b.h * 0.22, b.z, 0.5, 0.5, 0.5, { color: [1, 1, 1] }); }
      if (b.crown === 'antenna') { for (let a = 0; a < 2; a++) { det.cyl('metal', b.x + (a - 0.5) * 6, y1, b.z, 0.3, 0.12, 18 + a * 6, 6, { color: [0.7, 0.7, 0.7] }); det.box('glow', b.x + (a - 0.5) * 6, y1 + 18 + a * 6, b.z, 0.6, 0.6, 0.6); } }
      if (b.crown === 'step') { main.box('f_' + b.style, b.x, y1, b.z, b.w * 0.75, 8, b.d * 0.75, { tileU: 24, tileV: 30, top: 'roof', color: tint }); main.box('f_' + b.style, b.x, y1 + 8, b.z, b.w * 0.5, 6, b.d * 0.5, { tileU: 24, tileV: 30, top: 'roof', color: tint }); }
      if (b.crown === 'heli') { det.cyl('trim', b.x, y1 + ph, b.z, Math.min(b.w, b.d) * 0.4, Math.min(b.w, b.d) * 0.4, 0.3, 24, { color: [0.3, 0.32, 0.34] }); const r = Math.min(b.w, b.d) * 0.18; det.box('trim', b.x - r * 0.5, y1 + ph + 0.31, b.z, r * 0.18, 0.02, r * 1.2, { color: [0.95, 0.85, 0.1] }); det.box('trim', b.x + r * 0.5, y1 + ph + 0.31, b.z, r * 0.18, 0.02, r * 1.2, { color: [0.95, 0.85, 0.1] }); det.box('trim', b.x, y1 + ph + 0.31, b.z, r, 0.02, r * 0.18, { color: [0.95, 0.85, 0.1] }); }
    }
    // horizontal ledges / cornices
    if (b.h > 10 && b.style !== 'glass' && b.style !== 'glass2' && b.kind !== 'house') {
      const lc = [0.85, 0.83, 0.8];
      det.box('trim', b.x, y1 - 0.6, b.z, b.w + 0.7, 0.6, b.d + 0.7, { color: lc });
      if (gH) det.box('trim', b.x, gH, b.z, b.w + 0.5, 0.45, b.d + 0.5, { color: lc });
    }
    if ((b.style === 'glass' || b.style === 'glass2') && b.h > 60) {
      for (let y = y0 + 24; y < y1 - 6; y += 32) det.box('metal', b.x, y, b.z, b.w + 0.4, 0.5, b.d + 0.4, { color: [0.75, 0.78, 0.8], top: 'metal' });
    }
    // balconies
    if ((b.style === 'panel' || b.style === 'brick' || b.style === 'plaster' || b.kind === 'hotel') && b.h > 8) {
      const fl = st.f, nF = Math.floor((b.h - gH) / fl);
      const longX = b.w >= b.d;
      const L = longX ? b.w : b.d, n = Math.max(1, Math.round(L / st.w));
      const ww = L / n;
      for (let f = 1; f < nF; f++) for (let w = 0; w < n; w++) {
        if ((w + (b.seed * 10 | 0)) % 3 !== 0) continue;
        const y = gH + f * fl - 0.1;
        for (const side of [-1, 1]) {
          const cx = longX ? x0 + (w + 0.5) * ww : b.x + side * (b.w / 2 + 0.6);
          const cz = longX ? b.z + side * (b.d / 2 + 0.6) : z0 + (w + 0.5) * ww;
          det.box('trim', cx, y, cz, longX ? ww * 0.8 : 1.2, 0.18, longX ? 1.2 : ww * 0.8, { color: [0.78, 0.76, 0.72] });
          det.box('trim', longX ? cx : cx + side * 0.55, y + 0.18, longX ? cz + side * 0.55 : cz, longX ? ww * 0.8 : 0.06, 1.0, longX ? 0.06 : ww * 0.8, { color: [0.16, 0.17, 0.18] });
        }
      }
    }
    // shop signs + awnings
    if (gH || b.sign) {
      const faces = [[b.x, z1 + 0.12, 0], [b.x, z0 - 0.12, Math.PI], [x1 + 0.12, b.z, Math.PI / 2], [x0 - 0.12, b.z, -Math.PI / 2]];
      for (let fi = 0; fi < 4; fi++) {
        const [fx, fz, rot] = faces[fi];
        const text = b.sign || SIGN_TEXTS[(shopIdx++) % 28];
        const L = fi < 2 ? b.w : b.d;
        const sw = Math.min(L * 0.8, b.sign ? 16 : 9), shh = sw / 5.3;
        const sy = b.sign ? (gH || Math.min(b.h - shh - 1, 6)) + 0.4 : gH - shh - 0.1;
        const [uv0, uv1] = signUV(text);
        const c = Math.cos(rot), s = Math.sin(rot);
        const p = (dx, dy) => [fx + c * dx, sy + dy, fz - s * dx];
        main.quad('sign', p(-sw / 2, 0), p(sw / 2, 0), p(sw / 2, shh), p(-sw / 2, shh), uv0, uv1);
        if (!b.sign && R() < 0.6) {
          const ac = [[0.7, 0.12, 0.1], [0.1, 0.35, 0.2], [0.15, 0.2, 0.45], [0.8, 0.75, 0.7]][(R() * 4) | 0];
          const ad = 1.6, ay = gH - shh - 0.5;
          const q0 = (dx, dz, dy) => [fx + c * dx + s * dz, ay + dy, fz - s * dx + c * dz];
          det.quad('trim', q0(-sw / 2, 0, 0), q0(sw / 2, 0, 0), q0(sw / 2, ad, -0.7), q0(-sw / 2, ad, -0.7), [0, 0], [1, 1], ac);
          det.quad('trim', q0(sw / 2, 0, 0), q0(-sw / 2, 0, 0), q0(-sw / 2, ad, -0.7), q0(sw / 2, ad, -0.7), [0, 0], [1, 1], ac);
        }
        if (b.sign && fi > 0) break;
      }
    }
  }
  for (const [k, gb] of builders) {
    const [ck, layer] = k.split('|');
    for (const key of gb.keys()) {
      const g = gb.build(key); if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[key] || trimMat);
      mesh.castShadow = key !== 'sign' && key !== 'glow';
      mesh.receiveShadow = true;
      chunks.add(ck, mesh, layer);
    }
  }
  return mats;
}
