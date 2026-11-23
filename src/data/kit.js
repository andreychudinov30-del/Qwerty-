// Helpers for authoring mission maps & entities compactly.
export const DIR = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 }; // player yaw facing direction
// device rotY so its front (+Z) faces a direction
export const FACE = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

export const note = (m, x, y, id, title, text, sign, extra = {}) => m.ent('note', x, y, { id, noteId: id, title, text, sign, ...extra });
export const item = (m, x, y, it, count = 1, id, extra = {}) => m.ent('item', x, y, { item: it, count, id: id || `${it}_${x}_${y}`, ox: extra.ox ?? (Math.random() - 0.5) * 0.8, oz: extra.oz ?? (Math.random() - 0.5) * 0.8, ...extra });
export const dev = (m, type, x, y, id, extra = {}) => m.ent(type, x, y, { id, ...extra });
export const lamp = (m, x, y, lampType = 'beacon', extra = {}) => m.ent('lamp', x, y, { lamp: lampType, ...extra });
export const locker = (m, x, y, rotY = 0, id) => m.ent('locker', x, y, { id: id || `locker_${x}_${y}`, rotY });
export const body = (m, x, y, id, extra = {}) => m.ent('body', x, y, { id, ...extra });
export const npc = (m, x, y, id, extra = {}) => m.ent('npc', x, y, { id, ...extra });

// 2-wide tunnel maze: nodes spaced 4 cells apart (2 tunnel + 2 rock)
export function tunnelMaze(m, x0, y0, cols, rows, rng, ch = '=') {
  const vis = new Uint8Array(cols * rows);
  const carveNode = (cx, cy) => m.rect(x0 + cx * 4, y0 + cy * 4, 2, 2, ch);
  const stack = [[0, 0]]; vis[0] = 1; carveNode(0, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !vis[ny * cols + nx]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[Math.floor(rng.next() * nb.length)];
    vis[ny * cols + nx] = 1;
    // corridor between nodes
    const ax = x0 + cx * 4, ay = y0 + cy * 4;
    if (dx) m.rect(dx > 0 ? ax + 2 : ax - 2, ay, 2, 2, ch); else m.rect(ax, dy > 0 ? ay + 2 : ay - 2, 2, 2, ch);
    carveNode(nx, ny);
    stack.push([nx, ny]);
  }
  // a few loops
  for (let i = 0; i < Math.floor(cols * rows * 0.15); i++) {
    const cx = Math.floor(rng.next() * (cols - 1)), cy = Math.floor(rng.next() * rows);
    m.rect(x0 + cx * 4 + 2, y0 + cy * 4, 2, 2, ch);
  }
  return (cx, cy) => ({ x: x0 + cx * 4, y: y0 + cy * 4 });
}

export const LIDA = 'Лида (радио)';
