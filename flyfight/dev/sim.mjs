import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [query = '', secs = '120', out = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', e => console.log('ERR', e.message, e.stack.split('\n').slice(0, 3).join(' | ')));
p.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('GL Driver')) console.log('console:', t.slice(0, 200)); });
await p.addInitScript(() => { localStorage.setItem('flyfight_save_v1', JSON.stringify({ settings: { quality: 0 }, credits: 1000 })); });
await p.goto('file:///home/user/Qwerty-/flyfight/dist/FlyFight.html' + query);
await p.waitForFunction(() => window.__app && window.__app.state === 'game', null, { timeout: 120000 });
for (let t = 0; t < +secs; t += 10) {
  const r = await p.evaluate(() => { const a = window.__app, m = a.match; a.paused = true; for (let i = 0; i < 300; i++) { if (!m.over) m.update(1 / 30); } a.paused = false;
    return { t: m.time.toFixed(0), over: m.over, win: m.win, score: m.score, kills: m.kills, lives: m.lives, planes: m.planes.map(p => (p.team ? 'E' : 'A') + (p.alive ? Math.round(p.hp) : 'x') + '@' + Math.round(p.pos.y) + '/' + Math.round(p.flight.speed)).join(' '), mis: m.weapons.missiles.length, bul: m.weapons.bullets.length, gr: m.ground.map(g => g.alive ? g.hp : 'x').join(',') , obj: m.objectiveText() }; });
  console.log(JSON.stringify(r));
  if (r.over) break;
}
if (out) await p.screenshot({ path: out });
await b.close();
