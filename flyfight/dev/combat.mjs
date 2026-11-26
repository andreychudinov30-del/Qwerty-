import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.addInitScript(() => { localStorage.setItem('flyfight_save_v1', JSON.stringify({ settings: { quality: 2 }, credits: 1000 })); });
await p.goto('file:///home/user/Qwerty-/flyfight/dist/FlyFight.html?battle=1&auto=1&map=alps&time=dawn&weather=scattered');
await p.waitForFunction(() => window.__app && window.__app.state === 'game', null, { timeout: 120000 });
// fast-forward until something explodes near the player
const r = await p.evaluate(() => { const a = window.__app, m = a.match; a.paused = true; let k0 = m.planes.filter(p => !p.alive).length;
  for (let i = 0; i < 6000; i++) { m.update(1 / 30); const k = m.planes.filter(p => !p.alive && p.dying > 10.5 && p.pos.distanceTo(m.player.pos) < 2500).length; if (k > 0 && m.player.alive) { for (let j = 0; j < 12; j++) m.update(1 / 30); return 'boom at ' + m.time.toFixed(1); } }
  return 'none ' + m.time.toFixed(1); });
console.log(r);
await p.evaluate(() => { const m = window.__app.match; const d = m.planes.find(p => !p.alive && p.dying > 9); if (d) { m.camera.position.copy(d.pos).add({ x: 120, y: 40, z: 120 }); m.camera.lookAt(d.pos); m.camera.updateMatrixWorld(); } });
await p.evaluate(() => { const a = window.__app; const m = a.match; const d = m.planes.find(p => !p.alive && p.dying > 9); if (d) { const save = m.updateCamera; m.updateCamera = () => { m.camera.position.copy(d.pos).add({ x: 150, y: 50, z: 150 }); m.camera.up.set(0,1,0); m.camera.lookAt(d.pos); }; } a.paused = false; });
await p.waitForTimeout(2500); await p.screenshot({ path: '/tmp/claude-0/s/c0.png' });
await p.evaluate(() => { const a = window.__app, m = a.match; delete m.updateCamera; m.camMode = 'cockpit'; });
await p.waitForTimeout(3000); await p.screenshot({ path: '/tmp/claude-0/s/c1.png' });
await p.evaluate(() => { const a = window.__app, m = a.match; m.camMode = 'chase'; });
await p.waitForTimeout(3000); await p.screenshot({ path: '/tmp/claude-0/s/c2.png' });
await b.close();
