// Entry point
import * as THREE from 'three';
import { G, bus } from './core/util.js';
import { Engine } from './core/engine.js';
import { loadAll } from './core/assets.js';
import { initPhysics, Physics } from './core/physics.js';
import { buildWorld } from './world/world.js';
import { FX } from './game/fx.js';
import { Game } from './game/game.js';

const $ = (id) => document.getElementById(id);
const lbar = $('lbar'), ltxt = $('ltxt');
const prog = (p, t) => { if (p != null) lbar.style.width = (p * 100).toFixed(0) + '%'; if (t) ltxt.textContent = t; };

async function boot() {
  G.bus = bus; window.__G = G;
  const engine = new Engine($('c'));
  G.engine = engine;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 5200);
  camera.position.set(0, 60, 120);
  G.scene = scene; G.camera = camera;
  engine.setView(scene, camera);
  prog(0.02, 'Загрузка текстур и моделей…');
  await loadAll((p) => prog(p * 0.45));
  prog(0.47, 'Инициализация физики…');
  await initPhysics();
  const physics = new Physics();
  G.physics = physics;
  let i = 0; const steps = 7;
  const W = await buildWorld(scene, engine.renderer, physics, (t) => prog(0.5 + (i++ / steps) * 0.4, t));
  G.fx = new FX(scene);
  prog(0.93, 'Город просыпается…');
  const game = new Game(engine, scene, camera, physics, W);
  G.game = game;
  await game.init();
  // warm up shaders
  prog(0.98, 'Компиляция шейдеров…');
  try { await engine.renderer.compileAsync(scene, camera); } catch (e) { engine.renderer.compile(scene, camera); }
  prog(1, 'Готово');
  $('loading').classList.add('hidden');
  game.showMenu();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { game.frame(dt); } catch (e) { if ((G._ec = (G._ec || 0) + 1) < 5) console.error('FRAME', e && e.stack); if (!G._errShown) { G._errShown = 1; } }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
boot().catch((e) => { console.error('BOOT', e && e.stack); ltxt.textContent = 'Ошибка запуска: ' + (e && e.message ? e.message : e); });
