// Grid map DSL. Missions describe their maps with drawing commands that fill a char grid.
// Each cell is CELL meters. x -> east (+X), y -> south (+Z).
export const CELL = 2.5;

// zone definitions (heights in meters, absolute)
export const ZONES = {
  '.': { id: 'station', floor: 0, ceil: 6.4, profile: 'station', floorMat: 'station_floor', ceilMat: 'ceiling', reverb: 'hall', wet: 0.6 },
  '_': { id: 'pit', floor: -1.1, ceil: 6.4, profile: 'station', floorMat: 'gravel', ceilMat: 'ceiling', rails: true, reverb: 'hall', wet: 0.8 },
  '=': { id: 'tunnel', floor: -1.1, ceil: 3.5, profile: 'tunnel', floorMat: 'gravel', ceilMat: 'tunnel', rails: true, reverb: 'tunnel', wet: 1 },
  '~': { id: 'flooded', floor: -1.1, ceil: 3.5, profile: 'tunnel', floorMat: 'gravel', ceilMat: 'tunnel', rails: true, water: -0.45, reverb: 'tunnel', wet: 1 },
  '-': { id: 'service', floor: 0, ceil: 3.0, profile: 'service', floorMat: 'concrete_floor', ceilMat: 'concrete', reverb: 'room', wet: 0.6 },
  'w': { id: 'flooded_service', floor: 0, ceil: 3.0, profile: 'service', floorMat: 'concrete_floor', ceilMat: 'concrete', water: 0.42, reverb: 'room', wet: 1 },
  'l': { id: 'lab', floor: 0, ceil: 3.4, profile: 'lab', floorMat: 'lab_floor', ceilMat: 'ceiling', reverb: 'room', wet: 0.3 },
  'k': { id: 'bunker', floor: 0, ceil: 3.0, profile: 'bunker', floorMat: 'concrete_floor', ceilMat: 'bunker_upper', reverb: 'room', wet: 0.4 },
  'd': { id: 'depot', floor: 0, ceil: 9.0, profile: 'depot', floorMat: 'depot_floor', ceilMat: 'concrete', reverb: 'hall', wet: 0.8 },
  'r': { id: 'depot_track', floor: 0, ceil: 9.0, profile: 'depot', floorMat: 'gravel', ceilMat: 'concrete', rails: true, reverb: 'hall', wet: 0.7 },
  'h': { id: 'hall', floor: 0, ceil: 13.0, profile: 'hall', floorMat: 'concrete_floor', ceilMat: 'concrete', reverb: 'hall', wet: 0.7 },
  'c': { id: 'cave', floor: 0, ceil: 6.0, profile: 'cave', floorMat: 'cave_floor', ceilMat: 'rock', reverb: 'tunnel', wet: 0.9 },
  'q': { id: 'nest', floor: 0, ceil: 11.0, profile: 'cave', floorMat: 'cave_floor', ceilMat: 'rock', reverb: 'hall', wet: 1, organic: true },
};
export const SOLID = '#';
export const SPECIAL = { 'o': 'column', 'x': 'rubble', 's': 'stairs', 'D': 'door', 'L': 'door', 'G': 'gate', 'H': 'door', 'V': 'vent' };

export function isSolidChar(ch) { return ch === '#' || ch === undefined; }
export function isFloorChar(ch) { return ch !== undefined && ch !== '#'; }

export class MapGrid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.cells = new Array(w * h).fill('#');
    this.spots = {}; // name -> {x,y,...data}
    this.entities = []; // {type, x, y, ...}
    this.doors = {}; // "x,y" -> door data
    this.tracks = []; // explicit straight tracks [{x1,y1,x2,y2}]
    this.areas = {}; // named rect areas
    this.decorHints = []; // {type, x, y, ...}
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.cells[y * this.w + x] : undefined; }
  set(x, y, ch) { if (this.in(x, y)) this.cells[y * this.w + x] = ch; return this; }
  rect(x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch); return this; }
  hline(x1, x2, y, ch, width = 1) { const a = Math.min(x1, x2), b = Math.max(x1, x2); return this.rect(a, y, b - a + 1, width, ch); }
  vline(x, y1, y2, ch, width = 1) { const a = Math.min(y1, y2), b = Math.max(y1, y2); return this.rect(x, a, width, b - a + 1, ch); }
  // orthogonal polyline with width (width extends to +x / +y)
  path(points, ch, width = 1) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[i + 1];
      if (y1 === y2) this.hline(x1, x2 + (x2 >= x1 ? width - 1 : 0), y1, ch, width);
      else this.vline(x1, y1, y2 + (y2 >= y1 ? width - 1 : 0), ch, width);
    }
    return this;
  }
  // a tunnel of width 2 along orthogonal points with rails track
  tunnel(points, ch = '=') { return this.path(points, ch, 2); }
  room(x, y, w, h, ch = '-') { return this.rect(x, y, w, h, ch); }
  // classic metro station: island platform between two tracks
  // x,y: top-left; len: length in cells (east-west). Layout (rows): track(2) platform(pw) track(2)
  station(x, y, len, { pw = 6, columns = true, colStep = 3, name = 'ЗАРЯ', sides = 2 } = {}) {
    this.rect(x, y, len, 2, '_');
    this.rect(x, y + 2, len, pw, '.');
    if (sides === 2) this.rect(x, y + 2 + pw, len, 2, '_');
    if (columns && pw >= 6) {
      for (let i = x + 2; i < x + len - 2; i += colStep) {
        this.set(i, y + 3, 'o');
        this.set(i, y + 2 + pw - 2, 'o');
      }
    }
    this.areas.station = { x, y, w: len, h: 2 + pw + (sides === 2 ? 2 : 0) };
    this.decorHints.push({ type: 'stationName', name, x, y, len, pw, sides });
    this.tracks.push({ x1: x, y1: y, x2: x + len - 1, y2: y, axis: 'x' });
    if (sides === 2) this.tracks.push({ x1: x, y1: y + 2 + pw, x2: x + len - 1, y2: y + 2 + pw, axis: 'x' });
    return this;
  }
  door(x, y, data = {}) {
    const ch = data.type === 'gate' ? 'G' : data.type === 'hermetic' ? 'H' : data.locked ? 'L' : 'D';
    this.set(x, y, ch);
    this.doors[`${x},${y}`] = { x, y, id: data.id || `door_${x}_${y}`, ...data };
    return this;
  }
  stairs(x, y) { return this.set(x, y, 's'); }
  rubble(x, y) { return this.set(x, y, 'x'); }
  spot(name, x, y, data = {}) { this.spots[name] = { name, x, y, ...data }; return this; }
  ent(type, x, y, data = {}) { const e = { type, x, y, ...data }; this.entities.push(e); return e; }
  hint(type, x, y, data = {}) { this.decorHints.push({ type, x, y, ...data }); return this; }
  area(name, x, y, w, h) { this.areas[name] = { x, y, w, h }; return this; }
  // simple maze carving (recursive backtracker) inside rect, corridors of given char
  maze(x, y, w, h, ch, rng, cellStep = 2) {
    const cw = Math.floor((w - 1) / cellStep), chh = Math.floor((h - 1) / cellStep);
    const vis = new Uint8Array(cw * chh);
    const stack = [[0, 0]];
    vis[0] = 1;
    const carve = (cx, cy) => this.set(x + 1 + cx * cellStep, y + 1 + cy * cellStep, ch);
    carve(0, 0);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cw && ny < chh && !vis[ny * cw + nx]);
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = nb[Math.floor(rng.next() * nb.length)];
      vis[ny * cw + nx] = 1;
      for (let s = 1; s <= cellStep; s++) this.set(x + 1 + cx * cellStep + dx * s, y + 1 + cy * cellStep + dy * s, ch);
      carve(nx, ny);
      stack.push([nx, ny]);
    }
    // extra loops so it is not a perfect maze
    for (let i = 0; i < cw * chh * 0.12; i++) {
      const cx = Math.floor(rng.next() * (cw - 1)), cy = Math.floor(rng.next() * chh);
      for (let s = 1; s < cellStep; s++) this.set(x + 1 + cx * cellStep + s, y + 1 + cy * cellStep, ch);
    }
    return this;
  }
  toString() {
    const rows = [];
    for (let y = 0; y < this.h; y++) rows.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
    return rows.join('\n');
  }
}

export const cellCenter = (x, y) => ({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL });
export const worldToCell = (wx, wz) => ({ x: Math.floor(wx / CELL), y: Math.floor(wz / CELL) });
