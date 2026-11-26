import { createRequire } from 'module'; const require = createRequire(import.meta.url); const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [query = '', out = '/tmp/claude-0/s/g', waits = '3000', q = '2'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('GL Driver')) console.log('console:', t.slice(0, 300)); });
p.on('pageerror', e => { console.log('ERR', e.message); errs.push(e); });
await p.addInitScript((q) => { localStorage.setItem('flyfight_save_v1', JSON.stringify({ settings: { quality: +q, fpsShow: true } , credits: 999999 })); }, q);
await p.goto('file:///home/user/Qwerty-/flyfight/dist/FlyFight.html' + query);
let i = 0;
for (const w of waits.split(',')) { await p.waitForTimeout(+w); await p.screenshot({ path: `${out}${i++}.png` }); console.log('shot', i, await p.evaluate(() => { const a = window.__app; return a ? a.state + ' ' + (a.match ? JSON.stringify({ alive: a.match.player.alive, pos: a.match.player.pos.toArray().map(Math.round), spd: Math.round(a.match.player.flight.speed), t: a.match.time.toFixed(1) }) : '') : 'noapp'; })); }
await b.close();
