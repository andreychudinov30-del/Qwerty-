// Procedural city layout: road graph, districts, blocks, building lots, landmarks, nav data
import { mulberry32, hash2, clamp, fbm, smooth } from '../core/util.js';

export const CELL = 100, HALF = 10, RW = 7, SW = 4.2, CURB = 0.16;
export const SEA_X = 1135, SEA_Z = 1460, WEST_WALL = -1190, NORTH_WALL = -1150;
export const WATER_Y = -0.45;

const inCity = (i, j) => i >= -8 && i <= 7 && j >= -8 && j <= 7;
export function cellUrban(i, j) {
  if (i < -10 || i > 9 || j < -10 || j > 9) return false;
  if (i <= -9) return false; // western forest band
  if (j >= 8 && i < -7) return false;
  return true;
}

export function district(i, j) {
  if (!cellUrban(i, j)) {
    if (i <= -9 || (j >= 8 && i < -7)) return 'forest';
    return 'none';
  }
  const PARKS = ['-1,-6', '0,-5', '5,-3', '-6,1', '3,5', '-4,-2', '6,6', '-7,-7'];
  if (PARKS.includes(i + ',' + j)) return 'park';
  if (j <= -9) return 'suburb';
  if (i >= 8 && j >= 4) return 'port';
  if (j >= 8 && i >= 4) return 'port';
  if (j >= 8) return 'industrial';
  if (i >= 8) return 'beach';
  if (i <= -4 && j >= 3) return 'industrial';
  const r = Math.max(Math.abs(i + 0.5), Math.abs(j + 0.5));
  if (r <= 2.5) return 'downtown';
  if (r <= 5.5) return 'midtown';
  return 'residential';
}

// road edge type: 0 none, 1 street, 2 highway ring, 3 arterial
export function vEdge(k, m) { // along z at x=k*100, z in [m*100,(m+1)*100]
  if (Math.abs(k) === 10 && m >= -10 && m <= 9) return 2;
  if (k === 0 && m === 10) return 3; // airport access
  if (k < -10 || k > 10 || m < -10 || m > 9) return 0;
  if (cellUrban(k - 1, m) || cellUrban(k, m)) return 1;
  return 0;
}
export function hEdge(k, m) { // along x at z=m*100, x in [k*100,(k+1)*100]
  if (Math.abs(m) === 10 && k >= -10 && k <= 9) return 2;
  if (k < -10 || k > 9 || m < -10 || m > 10) return 0;
  if ((m === 0 || m === -4 || m === 4) && k >= -10) return cellUrban(k, m - 1) || cellUrban(k, m) ? 1 : 3;
  if (cellUrban(k, m - 1) || cellUrban(k, m)) return 1;
  return 0;
}

export function nodeDeg(k, m) {
  return (vEdge(k, m) ? 1 : 0) + (vEdge(k, m - 1) ? 1 : 0) + (hEdge(k, m) ? 1 : 0) + (hEdge(k - 1, m) ? 1 : 0);
}
export function hasLight(k, m) { return nodeDeg(k, m) >= 3 && Math.abs(k) < 10 && Math.abs(m) < 10; }

// distance to nearest road centerline + road type, analytic (used by AI, spawns, shaders mirror it)
export function roadAt(x, z) {
  const k = Math.round(x / CELL), m = Math.round(z / CELL);
  const dx = Math.abs(x - k * CELL), dz = Math.abs(z - m * CELL);
  let best = 1e9, type = 0;
  const mz = Math.floor(z / CELL), mx = Math.floor(x / CELL);
  const tv = vEdge(k, mz); if (tv && dx < best) { best = dx; type = tv; }
  const th = hEdge(mx, m); if (th && dz < best) { best = dz; type = th; }
  return { d: best, type };
}
export const isRoad = (x, z, pad = 0) => roadAt(x, z).d < RW + pad;

// terrain height (visual; playable area is flat y=0)
export function terrainH(x, z) {
  let h = 0;
  if (x < -1150) { const t = smooth(-1150, -1450, x); h = Math.max(h, t * (60 + 260 * fbm(x * 0.003, z * 0.003, 5))); }
  if (z < -1110) { const t = smooth(-1110, -1400, z); h = Math.max(h, t * (40 + 180 * fbm(x * 0.004 + 9, z * 0.004, 5))); }
  if (x > 1100) h = Math.min(h, -smooth(1100, 1220, x) * 9);
  if (z > 1430) h = Math.min(h, -smooth(1430, 1520, z) * 9);
  if (x > 1005 && z > 400 && z < 1000) h = Math.min(h, -smooth(1005, 1012, x) * 9); // quay wall
  return h;
}

export const LANDMARKS = {};
export const SHOPS = [];

export function generateCity(seed = 1337) {
  const R = mulberry32(seed);
  const buildings = []; // {x,z,w,d,h,style,seed,kind,roof}
  const blocks = [];
  const trees = []; // {x,z,type,s}
  const props = []; // {type,x,z,rot}
  const parked = []; // {x,z,rot}
  const colliders = []; // {x,y,z,hx,hy,hz}
  const special = []; // special structures {kind,...}
  const slabs = []; // sidewalk slabs {x0,x1,z0,z1,kind}
  const grassAreas = [];

  const addB = (b) => { b.seed = b.seed ?? R(); buildings.push(b); colliders.push({ x: b.x, y: (b.y0 || 0) + b.h / 2, z: b.z, hx: b.w / 2, hy: b.h / 2, hz: b.d / 2, b }); return b; };

  // ---- landmarks (fixed cells) ----
  const LM = {
    vertex: [-1, -1], police: [2, 3], hospital: [-3, -4], safehouse: [-6, -2], garage: [-6, 4], factory: [-7, 6],
    weapons: [1, -4], clothes: [-2, 2], dealer: [4, -1], realty: [-1, 3], gas1: [3, -5], gas2: [-5, 5], gas3: [7, 0],
    parking1: [1, 1], parking2: [-3, -1], club: [8, -2], docks: [9, 6], stadium: [5, 2], church: [-5, -6], mall: [2, -2],
  };
  const lmAt = {};
  for (const [k, v] of Object.entries(LM)) lmAt[v[0] + ',' + v[1]] = k;

  for (let i = -10; i <= 9; i++) for (let j = -10; j <= 9; j++) {
    const dist = district(i, j);
    const x0 = i * CELL, z0 = j * CELL;
    if (dist === 'forest' || dist === 'none') continue;
    const bx0 = x0 + RW + SW, bx1 = x0 + CELL - RW - SW, bz0 = z0 + RW + SW, bz1 = z0 + CELL - RW - SW;
    const blk = { i, j, x0: bx0, x1: bx1, z0: bz0, z1: bz1, dist, lm: lmAt[i + ',' + j] || null };
    blocks.push(blk);
    slabs.push({ x0: x0 + RW, x1: x0 + CELL - RW, z0: z0 + RW, z1: z0 + CELL - RW, kind: dist === 'park' || dist === 'suburb' ? 'grass' : dist === 'port' || dist === 'industrial' ? 'concrete' : 'plaza' });
    // street furniture along sidewalks
    const sideProps = (x, z, rot) => { props.push({ type: 'lamp', x, z, rot }); };
    for (let t = 0; t < 3; t++) {
      const f = 14 + t * 36;
      sideProps(x0 + RW + 0.9, z0 + f, Math.PI / 2); sideProps(x0 + CELL - RW - 0.9, z0 + f + 18, -Math.PI / 2);
      sideProps(x0 + f + 18, z0 + RW + 0.9, 0); sideProps(x0 + f, z0 + CELL - RW - 0.9, Math.PI);
    }
    if (dist !== 'port' && dist !== 'industrial') {
      for (let t = 0; t < 4; t++) {
        const f = 22 + t * 19 + R() * 4;
        if (R() < 0.75) trees.push({ x: x0 + RW + 1.5, z: z0 + f, type: dist === 'beach' ? 'palm' : 'street', s: 0.8 + R() * 0.4 });
        if (R() < 0.75) trees.push({ x: x0 + CELL - RW - 1.5, z: z0 + f, type: dist === 'beach' ? 'palm' : 'street', s: 0.8 + R() * 0.4 });
      }
    }
    const furn = ['hydrant', 'bin', 'bench', 'sign', 'bin', 'meter', 'busstop', 'box'];
    for (let t = 0; t < 5; t++) {
      const side = (R() * 4) | 0, f = 18 + R() * 64;
      const p = side === 0 ? [x0 + RW + 0.8, z0 + f, Math.PI / 2] : side === 1 ? [x0 + CELL - RW - 0.8, z0 + f, -Math.PI / 2] : side === 2 ? [x0 + f, z0 + RW + 0.8, 0] : [x0 + f, z0 + CELL - RW - 0.8, Math.PI];
      props.push({ type: furn[(R() * furn.length) | 0], x: p[0], z: p[1], rot: p[2] });
    }
    if (blk.lm) { buildLandmark(blk, blk.lm); continue; }
    genBlock(blk);
  }

  function buildLandmark(b, name) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, W = b.x1 - b.x0;
    const door = (x, z, nx, nz) => ({ x, z, nx, nz });
    const front = (h) => door(cx, b.z1 + 2.5, 0, 1);
    switch (name) {
      case 'vertex': {
        addB({ x: cx, z: cz, w: 46, d: 46, h: 210, style: 'glass2', kind: 'tower', crown: 'spire', tint: [0.75, 0.85, 1] });
        addB({ x: cx, z: cz, w: 34, d: 34, h: 60, y0: 210, style: 'glass2', kind: 'tower', crown: 'heli' });
        LANDMARKS.vertex = { ...front(), name: 'Башня «Вертекс»', top: 270 };
        break;
      }
      case 'police': {
        addB({ x: cx, z: cz - 8, w: 60, d: 36, h: 24, style: 'office', kind: 'police', sign: 'ПОЛИЦИЯ' });
        LANDMARKS.police = { ...front(), name: 'Полицейское управление' };
        for (let n = 0; n < 6; n++) parked.push({ x: b.x0 + 8 + n * 11, z: b.z1 - 8, rot: 0, police: true });
        break;
      }
      case 'hospital': {
        addB({ x: cx, z: cz - 6, w: 64, d: 40, h: 34, style: 'white', kind: 'hospital', sign: 'БОЛЬНИЦА' });
        LANDMARKS.hospital = { ...front(), name: 'Городская больница' };
        break;
      }
      case 'safehouse': {
        addB({ x: cx, z: b.z0 + 10, w: W, d: 18, h: 21, style: 'brick', kind: 'res' });
        addB({ x: b.x0 + 9, z: cz + 9, w: 18, d: W - 20, h: 21, style: 'brick', kind: 'res' });
        addB({ x: b.x1 - 12, z: cz + 14, w: 22, d: 30, h: 14, style: 'panel', kind: 'res' });
        LANDMARKS.safehouse = { x: cx - 10, z: b.z1 + 2.5, nx: 0, nz: 1, name: 'Квартира Алекса' };
        LANDMARKS.safehouseCar = { x: cx + 8, z: b.z1 - 5, rot: Math.PI / 2 };
        trees.push({ x: cx + 4, z: cz + 12, type: 'oak', s: 1.1 }); trees.push({ x: cx + 12, z: cz + 4, type: 'oak', s: 1 });
        props.push({ type: 'bench', x: cx + 6, z: cz + 16, rot: 0 });
        break;
      }
      case 'garage': {
        addB({ x: cx, z: cz - 10, w: 50, d: 30, h: 10, style: 'industrial', kind: 'garage', sign: 'АВТОСЕРВИС ДЕНИСА' });
        LANDMARKS.garage = { ...front(), name: 'Гараж Дениса' };
        parked.push({ x: cx - 15, z: b.z1 - 6, rot: 0.2 }); parked.push({ x: cx + 15, z: b.z1 - 7, rot: -0.3 });
        break;
      }
      case 'factory': {
        addB({ x: cx - 8, z: cz, w: 52, d: 60, h: 18, style: 'ruin', kind: 'factory', sign: 'ЗАВОД «ПРОГРЕСС»' });
        special.push({ kind: 'chimney', x: b.x1 - 10, z: b.z0 + 10, h: 55, r: 3 });
        special.push({ kind: 'chimney', x: b.x1 - 10, z: b.z0 + 24, h: 45, r: 2.5 });
        LANDMARKS.factory = { x: cx + 26, z: cz, nx: 1, nz: 0, name: 'Заброшенный завод' };
        for (let n = 0; n < 8; n++) props.push({ type: 'barrel', x: b.x1 - 6 - R() * 10, z: cz + R() * 30 - 5, rot: R() * 6 });
        break;
      }
      case 'weapons': case 'clothes': case 'dealer': case 'realty': case 'mall': {
        const info = {
          weapons: ['АРСЕНАЛ', 'Оружейный магазин «Арсенал»', 'concrete', 12],
          clothes: ['СТИЛЬ', 'Магазин одежды «Стиль»', 'glass', 28],
          dealer: ['ПРЕМЬЕР АВТО', 'Автосалон «Премьер»', 'glass', 14],
          realty: ['НЕДВИЖИМОСТЬ', 'Агентство «Квадрат»', 'office', 40],
          mall: ['ТЦ ГАЛАКТИКА', 'ТЦ «Галактика»', 'glass', 24],
        }[name];
        addB({ x: cx, z: cz - 6, w: W, d: W - 12, h: info[3], style: info[2], kind: 'shop', sign: info[0], show: name === 'dealer' });
        LANDMARKS[name] = { ...front(), name: info[1] };
        if (name !== 'mall') SHOPS.push({ id: name, ...LANDMARKS[name] });
        if (name === 'dealer') for (let n = 0; n < 4; n++) parked.push({ x: b.x0 + 12 + n * 18, z: b.z1 - 3, rot: 0.3, show: true });
        break;
      }
      case 'gas1': case 'gas2': case 'gas3': {
        special.push({ kind: 'gas', x: cx, z: cz + 8 });
        addB({ x: cx, z: b.z0 + 9, w: 24, d: 14, h: 5, style: 'shop', kind: 'shop', sign: 'АЗС 24' });
        LANDMARKS[name] = { x: cx, z: cz + 8, name: 'Автозаправка' };
        break;
      }
      case 'parking1': case 'parking2': {
        special.push({ kind: 'parking', x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 });
        for (let r = 0; r < 3; r++) for (let n = 0; n < 12; n++) if (R() < 0.55) parked.push({ x: b.x0 + 4 + n * 6.2, z: b.z0 + 10 + r * 26, rot: r % 2 ? Math.PI / 2 : -Math.PI / 2 });
        break;
      }
      case 'club': {
        addB({ x: cx, z: cz, w: 40, d: 40, h: 12, style: 'glass', kind: 'club', sign: 'КЛУБ «ВОЛНА»' });
        LANDMARKS.club = { x: b.x1 + 2.5, z: cz, nx: 1, nz: 0, name: 'Пляжный клуб «Волна»' };
        for (let n = 0; n < 6; n++) trees.push({ x: b.x0 + 4 + n * 13, z: b.z0 + 3, type: 'palm', s: 1.1 });
        break;
      }
      case 'docks': {
        genBlock({ ...b, dist: 'port' });
        LANDMARKS.docks = { x: cx, z: cz, name: 'Порт' };
        break;
      }
      case 'stadium': {
        special.push({ kind: 'stadium', x: cx, z: cz, r: 36 });
        colliders.push({ x: cx, y: 9, z: cz, hx: 36, hy: 9, hz: 36 });
        LANDMARKS.stadium = { x: cx, z: b.z1 + 2.5, name: 'Стадион' };
        break;
      }
      case 'church': {
        addB({ x: cx, z: cz, w: 22, d: 40, h: 16, style: 'white', kind: 'church', roof: 'gable' });
        special.push({ kind: 'spire', x: cx, z: cz - 24, h: 42 });
        colliders.push({ x: cx, y: 12, z: cz - 24, hx: 4, hy: 12, hz: 4 });
        LANDMARKS.church = { x: cx, z: b.z1 + 2.5, name: 'Старая церковь' };
        for (let n = 0; n < 10; n++) trees.push({ x: b.x0 + R() * W, z: b.z0 + R() * 14 + 60, type: 'oak', s: 0.9 + R() * 0.4 });
        break;
      }
    }
  }

  function genBlock(b) {
    const W = b.x1 - b.x0, D = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const dc = Math.hypot(cx, cz);
    switch (b.dist) {
      case 'downtown': {
        const hmax = 120 + 160 * clamp(1 - dc / 330, 0, 1);
        const r = R();
        if (r < 0.45) {
          const s = 36 + R() * 18;
          const h = (hmax * (0.6 + R() * 0.4)) | 0;
          addB({ x: cx, z: cz, w: s, d: s, h, style: R() < 0.6 ? 'glass' : 'glass2', kind: 'tower', crown: pickCrown() });
          if (R() < 0.6) addB({ x: cx, z: cz, w: s * 0.7, d: s * 0.7, h: h * 0.25, y0: h, style: 'glass', kind: 'tower', crown: pickCrown() });
          plaza(b, s);
        } else if (r < 0.8) {
          const h1 = (hmax * (0.4 + R() * 0.5)) | 0, h2 = (hmax * (0.3 + R() * 0.5)) | 0;
          addB({ x: b.x0 + 18, z: cz, w: 34, d: D - 6, h: h1, style: pickStyle(['glass', 'office', 'glass2']), kind: 'tower', crown: pickCrown() });
          addB({ x: b.x1 - 18, z: cz - 10, w: 32, d: 44, h: h2, style: pickStyle(['glass', 'office']), kind: 'tower', crown: pickCrown() });
          addB({ x: b.x1 - 18, z: b.z1 - 9, w: 32, d: 16, h: 14, style: 'shop', kind: 'shop' });
        } else {
          addB({ x: cx, z: cz, w: W - 4, d: D - 4, h: 26, style: 'office', kind: 'podium' });
          const s = 30;
          addB({ x: cx + 6, z: cz - 4, w: s, d: s + 6, h: (hmax * 0.8) | 0, y0: 26, style: 'glass2', kind: 'tower', crown: pickCrown() });
        }
        break;
      }
      case 'midtown': {
        perimeter(b, 12 + R() * 10, () => 14 + ((R() * 14) | 0) * 3.5, ['office', 'glass', 'brick', 'panel', 'shop'], true);
        break;
      }
      case 'residential': {
        if (R() < 0.6) {
          perimeter(b, 13, () => 12 + ((R() * 5) | 0) * 3.2, ['brick', 'panel', 'plaster'], false);
          courtyard(b);
        } else {
          const h = 15 + ((R() * 6) | 0) * 3.2;
          addB({ x: cx, z: b.z0 + 9, w: W - 8, d: 14, h, style: pickStyle(['panel', 'plaster']), kind: 'res' });
          addB({ x: cx, z: b.z1 - 9, w: W - 8, d: 14, h: h - 3.2, style: pickStyle(['panel', 'brick']), kind: 'res' });
          courtyard({ ...b, z0: b.z0 + 18, z1: b.z1 - 18 });
        }
        break;
      }
      case 'suburb': {
        const n = 3;
        for (let a = 0; a < n; a++) for (let c = 0; c < 2; c++) {
          const hx = b.x0 + (a + 0.5) * (W / n), hz = c === 0 ? b.z0 + 14 : b.z1 - 14;
          const w = 11 + R() * 4, d = 9 + R() * 3;
          addB({ x: hx, z: hz, w, d, h: 3.4 * (R() < 0.5 ? 1 : 2), style: 'house', kind: 'house', roof: 'gable', tint: houseTint() });
          trees.push({ x: hx + (R() - 0.5) * 16, z: c === 0 ? hz + 14 : hz - 14, type: R() < 0.3 ? 'pine' : 'oak', s: 0.8 + R() * 0.5 });
          if (R() < 0.5) parked.push({ x: hx + w / 2 + 3, z: c === 0 ? hz + 4 : hz - 4, rot: 0 });
          props.push({ type: 'fence', x: hx, z: c === 0 ? b.z0 + 1 : b.z1 - 1, rot: 0, len: W / n - 2 });
        }
        grassAreas.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, d: 0.6 });
        break;
      }
      case 'industrial': {
        const n = R() < 0.5 ? 1 : 2;
        if (n === 1) addB({ x: cx, z: cz - 6, w: W - 14, d: D - 30, h: 10 + R() * 6, style: 'industrial', kind: 'warehouse', roof: 'arch' });
        else {
          addB({ x: b.x0 + 18, z: cz, w: 32, d: D - 10, h: 9 + R() * 5, style: 'industrial', kind: 'warehouse' });
          addB({ x: b.x1 - 16, z: b.z0 + 16, w: 28, d: 28, h: 12 + R() * 6, style: pickStyle(['industrial', 'concrete']), kind: 'warehouse' });
          special.push({ kind: 'tank', x: b.x1 - 14, z: b.z1 - 14, r: 6, h: 12 });
          colliders.push({ x: b.x1 - 14, y: 6, z: b.z1 - 14, hx: 6, hy: 6, hz: 6 });
        }
        for (let t = 0; t < 6; t++) props.push({ type: R() < 0.5 ? 'barrel' : 'crate', x: b.x0 + R() * W, z: b.z1 - 3 - R() * 6, rot: R() * 6 });
        if (R() < 0.6) special.push({ kind: 'chimney', x: b.x0 + 5, z: b.z0 + 5, h: 25 + R() * 25, r: 1.6 });
        break;
      }
      case 'port': {
        const cols = ['#b5382a', '#2a6bb5', '#3a8a3a', '#c9a227', '#8a8a8a', '#d46a1e', '#5a3a7a'];
        for (let a = 0; a < 5; a++) for (let c = 0; c < 3; c++) {
          if (R() < 0.25) continue;
          const st = 1 + ((R() * 3) | 0);
          for (let s = 0; s < st; s++) special.push({ kind: 'container', x: b.x0 + 8 + a * 15, z: b.z0 + 12 + c * 24, y: s * 2.6, rot: 0, color: cols[(R() * cols.length) | 0] });
          colliders.push({ x: b.x0 + 8 + a * 15, y: st * 1.3, z: b.z0 + 12 + c * 24, hx: 6.1, hy: st * 1.3, hz: 1.25 });
        }
        if (b.i === 9) special.push({ kind: 'crane', x: b.x1 + 2, z: cz });
        break;
      }
      case 'beach': {
        addB({ x: cx - 6, z: cz, w: 26, d: D - 16, h: 30 + R() * 40, style: pickStyle(['white', 'glass']), kind: 'hotel', crown: 'flat' });
        for (let n = 0; n < 5; n++) trees.push({ x: b.x1 - 6, z: b.z0 + 6 + n * 16, type: 'palm', s: 0.9 + R() * 0.4 });
        break;
      }
      case 'park': {
        special.push({ kind: 'park', x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 });
        if (R() < 0.6) special.push({ kind: 'fountain', x: cx, z: cz });
        else special.push({ kind: 'pond', x: cx + 10, z: cz - 8, r: 14 });
        for (let n = 0; n < 34; n++) {
          const tx = b.x0 + 3 + R() * (W - 6), tz = b.z0 + 3 + R() * (D - 6);
          if (Math.abs(tx - cx) < 6 || Math.abs(tz - cz) < 6 || Math.hypot(tx - cx, tz - cz) < 18) continue;
          trees.push({ x: tx, z: tz, type: R() < 0.25 ? 'pine' : R() < 0.5 ? 'birch' : 'oak', s: 0.8 + R() * 0.6 });
        }
        for (let n = 0; n < 8; n++) props.push({ type: 'bench', x: cx + (n < 4 ? (n - 1.5) * 9 : 4), z: n < 4 ? cz + 5 : cz + (n - 5.5) * 9, rot: n < 4 ? 0 : Math.PI / 2 });
        for (let n = 0; n < 4; n++) props.push({ type: 'lamp', x: cx + (n % 2 ? 8 : -8), z: cz + (n < 2 ? 8 : -8), rot: 0, park: true });
        grassAreas.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, d: 1 });
        break;
      }
    }
  }
  function pickCrown() { return ['flat', 'spire', 'step', 'heli', 'flat', 'antenna'][(R() * 6) | 0]; }
  function pickStyle(a) { return a[(R() * a.length) | 0]; }
  function houseTint() { const t = [[1, 0.95, 0.85], [0.9, 0.93, 1], [1, 0.88, 0.8], [0.92, 1, 0.9], [1, 1, 1], [0.85, 0.8, 0.75]]; return t[(R() * t.length) | 0]; }
  function plaza(b, s) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    for (let n = 0; n < 4; n++) {
      const a = n * Math.PI / 2 + Math.PI / 4, r = s * 0.5 + 9;
      trees.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, type: 'street', s: 0.9 });
    }
  }
  function perimeter(b, depth, hf, styles, shops) {
    const W = b.x1 - b.x0, D = b.z1 - b.z0;
    // north & south rows
    for (const side of [0, 1]) {
      let x = b.x0;
      while (x < b.x1 - 8) {
        const w = Math.min(b.x1 - x, 18 + R() * 16);
        const st = pickStyle(styles);
        addB({ x: x + w / 2, z: side ? b.z1 - depth / 2 : b.z0 + depth / 2, w: w - 0.6, d: depth, h: hf(), style: st, kind: 'mid', shop: shops && R() < 0.75 });
        x += w;
      }
    }
    // east & west columns between rows
    for (const side of [0, 1]) {
      let z = b.z0 + depth;
      while (z < b.z1 - depth - 6) {
        const d = Math.min(b.z1 - depth - z, 16 + R() * 14);
        addB({ x: side ? b.x1 - depth / 2 : b.x0 + depth / 2, z: z + d / 2, w: depth, d: d - 0.6, h: hf(), style: pickStyle(styles), kind: 'mid', shop: shops && R() < 0.6 });
        z += d;
      }
    }
  }
  function courtyard(b) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    special.push({ kind: 'playground', x: cx, z: cz });
    for (let n = 0; n < 6; n++) trees.push({ x: cx + (R() - 0.5) * 40, z: cz + (R() - 0.5) * 34, type: R() < 0.5 ? 'oak' : 'birch', s: 0.8 + R() * 0.4 });
    for (let n = 0; n < 5; n++) if (R() < 0.7) parked.push({ x: cx - 20 + n * 6, z: cz + 13, rot: Math.PI / 2 });
    props.push({ type: 'bench', x: cx - 8, z: cz - 6, rot: 0 }); props.push({ type: 'bin', x: cx + 12, z: cz - 10, rot: 0 });
    grassAreas.push({ x0: cx - 22, x1: cx + 22, z0: cz - 16, z1: cz + 10, d: 0.5 });
  }

  // forest band + outskirts trees
  for (let n = 0; n < 4200; n++) {
    const x = -1180 + R() * 220, z = -1120 + R() * 2540;
    if (isRoad(x, z, 6)) continue;
    trees.push({ x, z, type: R() < 0.55 ? 'pine' : R() < 0.7 ? 'birch' : 'oak', s: 0.8 + R() * 0.7, forest: true });
  }
  for (let n = 0; n < 1600; n++) {
    const x = -1000 + R() * 2100, z = -1140 + R() * 130;
    if (isRoad(x, z, 6)) continue;
    trees.push({ x, z, type: R() < 0.6 ? 'pine' : 'oak', s: 0.8 + R() * 0.6, forest: true });
  }
  for (let n = 0; n < 700; n++) { // southwest woods
    const x = -1000 + R() * 220, z = 800 + R() * 200;
    if (isRoad(x, z, 6)) continue;
    trees.push({ x, z, type: R() < 0.5 ? 'pine' : 'oak', s: 0.8 + R() * 0.6, forest: true });
  }
  for (let n = 0; n < 120; n++) { // beach palms
    const x = 1012 + R() * 80, z = -1000 + R() * 1380;
    if (isRoad(x, z, 4)) continue;
    trees.push({ x, z, type: 'palm', s: 0.9 + R() * 0.5 });
  }
  grassAreas.push({ x0: -1180, x1: -1008, z0: -1120, z1: 1420, d: 1, forest: true });
  grassAreas.push({ x0: -1000, x1: 1000, z0: -1140, z1: -1008, d: 0.8, forest: true });

  // highway / outer road lamps
  for (let t = -1000; t < 1000; t += 40) {
    for (const s of [-1, 1]) {
      props.push({ type: 'hlamp', x: s * 1000 + 9, z: t + 20, rot: -Math.PI / 2 });
      props.push({ type: 'hlamp', x: t + 20, z: s * 1000 + 9, rot: Math.PI });
    }
  }
  // airport
  LANDMARKS.airport = { x: 0, z: 1108, name: 'Аэропорт «Северный»' };
  special.push({ kind: 'airport' });
  colliders.push({ x: 0, y: 9, z: 1140, hx: 90, hy: 9, hz: 20 }); // terminal
  for (let h = 0; h < 3; h++) colliders.push({ x: -420 + h * 70, y: 9, z: 1150, hx: 28, hy: 9, hz: 22 });
  // forest cabin + beach + lookout
  LANDMARKS.cabin = { x: -1110, z: -330, name: 'Лесной домик' };
  addB({ x: -1110, z: -345, w: 10, d: 8, h: 3.6, style: 'wood', kind: 'house', roof: 'gable' });
  LANDMARKS.beach = { x: 1060, z: 100, name: 'Пляж' };
  LANDMARKS.pier = { x: 1150, z: 0, name: 'Пирс' };
  special.push({ kind: 'pier', x: 1100, z: 0, len: 130 });
  colliders.push({ x: 1165, y: 0.3, z: 0, hx: 65, hy: 0.3, hz: 4 });
  LANDMARKS.ring = { x: 1000, z: 0, name: 'Кольцевая трасса' };

  // invisible world walls
  colliders.push({ x: WEST_WALL - 5, y: 50, z: 150, hx: 5, hy: 100, hz: 1400 });
  colliders.push({ x: 0, y: 50, z: NORTH_WALL - 5, hx: 1400, hy: 100, hz: 5 });

  // ---- spatial grid of building AABBs for fast 2D collision / LOS ----
  const grid = new Map();
  const gk = (a, b) => a * 4096 + b;
  for (const c of colliders) {
    if (c.hy * 2 < 1.5) continue;
    const a0 = Math.floor((c.x - c.hx) / 25), a1 = Math.floor((c.x + c.hx) / 25), b0 = Math.floor((c.z - c.hz) / 25), b1 = Math.floor((c.z + c.hz) / 25);
    for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const k = gk(a, b); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
  }
  const near = (x, z) => grid.get(gk(Math.floor(x / 25), Math.floor(z / 25)));

  // pushes circle out of building boxes; returns true if collided
  function collideCircle(p, r, y = 0) {
    let hit = false;
    const l = near(p.x, p.z); if (!l) return false;
    for (const c of l) {
      if (y > c.y + c.hy || y + 1.8 < c.y - c.hy) continue;
      const qx = clamp(p.x, c.x - c.hx, c.x + c.hx), qz = clamp(p.z, c.z - c.hz, c.z + c.hz);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
        else { // inside: push to nearest face
          const ex = c.hx - Math.abs(p.x - c.x), ez = c.hz - Math.abs(p.z - c.z);
          if (ex < ez) p.x = c.x + Math.sign(p.x - c.x || 1) * (c.hx + r); else p.z = c.z + Math.sign(p.z - c.z || 1) * (c.hz + r);
        }
        hit = true;
      }
    }
    return hit;
  }
  function insideBuilding(x, z, y = 1) {
    const l = near(x, z); if (!l) return false;
    for (const c of l) if (Math.abs(x - c.x) < c.hx && Math.abs(z - c.z) < c.hz && y < c.y + c.hy && y > c.y - c.hy) return true;
    return false;
  }
  // 2D line of sight vs buildings (sampled)
  function los(ax, az, bx, bz, y = 1.5) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 4);
    for (let s = 1; s < n; s++) { const t = s / n; if (insideBuilding(ax + (bx - ax) * t, az + (bz - az) * t, y)) return false; }
    return true;
  }

  // ---- A* over road nodes ----
  function neighbors(k, m) {
    const r = [];
    if (vEdge(k, m)) r.push([k, m + 1]); if (vEdge(k, m - 1)) r.push([k, m - 1]);
    if (hEdge(k, m)) r.push([k + 1, m]); if (hEdge(k - 1, m)) r.push([k - 1, m]);
    return r;
  }
  function nearestNode(x, z) {
    let best = null, bd = 1e9;
    const k0 = Math.round(x / CELL), m0 = Math.round(z / CELL);
    for (let k = k0 - 2; k <= k0 + 2; k++) for (let m = m0 - 2; m <= m0 + 2; m++) {
      if (nodeDeg(k, m) === 0) continue;
      const d = Math.hypot(x - k * CELL, z - m * CELL);
      if (d < bd) { bd = d; best = [k, m]; }
    }
    return best;
  }
  function path(ax, az, bx, bz) {
    const s = nearestNode(ax, az), g = nearestNode(bx, bz);
    if (!s || !g) return [];
    const key = (n) => n[0] * 1000 + n[1];
    const open = [[s, 0, Math.hypot(s[0] - g[0], s[1] - g[1])]], came = new Map(), cost = new Map([[key(s), 0]]);
    let guard = 0;
    while (open.length && guard++ < 4000) {
      open.sort((a, b) => a[2] - b[2]);
      const [cur] = open.shift();
      if (cur[0] === g[0] && cur[1] === g[1]) {
        const out = [cur]; let k = key(cur);
        while (came.has(k)) { const p = came.get(k); out.unshift(p); k = key(p); }
        return out.map((n) => ({ x: n[0] * CELL, z: n[1] * CELL }));
      }
      for (const nb of neighbors(cur[0], cur[1])) {
        const typ = nb[0] === cur[0] ? vEdge(cur[0], Math.min(cur[1], nb[1])) : hEdge(Math.min(cur[0], nb[0]), cur[1]);
        const c = cost.get(key(cur)) + (typ === 2 ? 0.7 : 1);
        if (c < (cost.get(key(nb)) ?? 1e9)) {
          cost.set(key(nb), c); came.set(key(nb), cur);
          open.push([nb, c, c + Math.hypot(nb[0] - g[0], nb[1] - g[1])]);
        }
      }
    }
    return [];
  }

  // ped sidewalk points (block corners) for spawning
  const walkPts = [];
  for (const b of blocks) {
    const e = 1.2;
    walkPts.push({ x: b.x0 - e, z: b.z0 - e, b }, { x: b.x1 + e, z: b.z0 - e, b }, { x: b.x1 + e, z: b.z1 + e, b }, { x: b.x0 - e, z: b.z1 + e, b });
  }

  return { buildings, blocks, trees, props, parked, colliders, special, slabs, grassAreas, collideCircle, insideBuilding, los, path, nearestNode, neighbors, walkPts, landmarks: LANDMARKS, shops: SHOPS };
}
