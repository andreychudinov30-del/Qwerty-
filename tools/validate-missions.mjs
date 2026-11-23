// Validates mission maps: spots/entities on floor cells, connectivity from start (doors passable,
// height steps <= 1.3m vaultable or stairs), and prints ASCII maps with --print.
import { MapGrid, ZONES } from '../src/world/mapgen.js';
import { RNG } from '../src/core/util.js';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const print = process.argv.includes('--print');
let errors = 0;
for (const f of files) {
  const mod = await import('../src/data/' + f);
  const list = Object.values(mod)[0];
  for (const def of list) {
    const [w, h] = def.size;
    const g = new MapGrid(w, h);
    def.map(g, new RNG(def.id));
    const zoneOf = (x, y) => {
      const ch = g.get(x, y);
      if (ch === undefined || ch === '#') return null;
      if (ZONES[ch]) return ZONES[ch];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const z = ZONES[g.get(x + dx, y + dy)]; if (z) return z; }
      return ZONES['-'];
    };
    const floor = (x, y) => zoneOf(x, y)?.floor ?? null;
    const isFloor = (x, y) => floor(x, y) !== null && g.get(x, y) !== 'o';
    const start = g.spots[def.start || 'start'];
    const problems = [];
    if (!start) problems.push('no start spot');
    else {
      const seen = new Set([`${start.x},${start.y}`]);
      const q = [[start.x, start.y]];
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
          if (seen.has(k) || !isFloor(nx, ny)) continue;
          const stairs = g.get(x, y) === 's' || g.get(nx, ny) === 's';
          if (!stairs && Math.abs(floor(x, y) - floor(nx, ny)) > 1.3) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      const chk = (label, x, y) => { if (!isFloor(x, y)) problems.push(`${label} @${x},${y} not on floor (${g.get(x, y)})`); else if (!seen.has(`${x},${y}`)) problems.push(`${label} @${x},${y} unreachable`); };
      for (const s of Object.values(g.spots)) chk('spot ' + s.name, s.x, s.y);
      for (const e of g.entities) if (!['lamp', 'gas', 'ambient', 'train'].includes(e.type)) chk(`${e.type} ${e.id || ''}`, e.x, e.y);
      for (const d of Object.values(g.doors)) chk('door ' + d.id, d.x, d.y);
      // spots referenced by steps/monsters exist
      for (const st of def.steps) if (st.spot && !g.spots[st.spot]) problems.push('step spot missing ' + st.spot);
      for (const m of def.monsters || []) { if (!g.spots[m.spot]) problems.push('monster spot missing ' + m.spot); for (const p of m.patrol || []) if (!g.spots[p]) problems.push('patrol spot missing ' + p); }
      const allActs = JSON.stringify([def.steps, def.triggers || []]);
      for (const mm of allActs.matchAll(/\["spawn","[a-z]+","([A-Za-z0-9_]+)"/g)) if (!g.spots[mm[1]]) problems.push('spawn spot missing ' + mm[1]);
      for (const st of def.steps) for (const w of st.waves || []) if (!g.spots[w.spot]) problems.push('wave spot missing ' + w.spot);
      const ids = new Set([...g.entities.map((e) => e.id), ...Object.values(g.doors).map((d) => d.id)]);
      for (const st of def.steps) { if (st.type === 'use') for (const id of st.ids || (st.id ? [st.id] : [])) if (!ids.has(id)) problems.push('step use id missing ' + id); if (st.type === 'read' && !ids.has(st.note)) problems.push('note missing ' + st.note); }
      for (const mm of allActs.matchAll(/\["door","([A-Za-z0-9_]+)"/g)) if (!ids.has(mm[1])) problems.push('door id missing ' + mm[1]);
    }
    console.log(`${def.id} ${def.title.padEnd(26)} ${w}x${h}  ${problems.length ? 'PROBLEMS: ' + problems.join('; ') : 'ok'}`);
    errors += problems.length;
    if (print) console.log(g.toString().split('\n').map((r, i) => String(i).padStart(2) + ' ' + r).join('\n'));
  }
}
process.exit(errors ? 1 : 0);
