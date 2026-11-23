import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { loadProfile, getProfile } from '../core/save.js';
import { MapGrid } from '../world/mapgen.js';
import { Level } from '../world/level.js';
import { manager } from '../core/assets.js';

loadProfile();
const params = new URLSearchParams(location.search);
getProfile().settings.quality = params.get('q') || 'high';
const engine = new Engine(document.getElementById('game'));
engine.applyQuality();
const g = new MapGrid(60, 40);
g.station(4, 4, 30, { pw: 4, name: 'ЗАРЯ' });
g.tunnel([[34, 4], [50, 4], [50, 20]]);
g.tunnel([[34, 10], [44, 10]]);
g.rect(14, 12, 2, 6, '-'); g.room(10, 18, 10, 6, '-');
g.door(14, 12, { id: 'd1' });
g.stairs(33, 6); g.set(33,7,'s');
g.room(40, 24, 12, 8, 'l');
g.path([[50, 21], [50, 24]], '=', 2);
const level = new Level(engine, g, { seed: 'dev', fog: 0.035, chapter: 1 });
window.__ready = false;
level.build().then(() => { window.__level = level; window.__engine = engine;
  const cam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
  const view = params.get('v') || 'platform';
  const views = {
    platform: [[14, 1.7, 20], [60, 1.2, 20]],
    pit: [[30, 0.6, 12.5], [70, 0.6, 11]],
    tunnel: [[95, 0.6, 12.5], [124, 0.5, 12.5]],
    tunnel2: [[126.5, 0.6, 20], [126.5, 0.5, 50]],
    lab: [[103, 1.7, 63], [125, 1.2, 75]],
    service: [[30, 1.7, 50], [42, 1.2, 54]],
  };
  const [p, t] = views[view];
  cam.position.set(...p); cam.lookAt(...t);
  const flash = new THREE.SpotLight(0xfff1dc, 90, 32, 0.45, 0.6, 2);
  flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.camera.near = 0.1;
  cam.add(flash); flash.position.set(0.2, -0.2, 0); flash.target.position.set(0, 0, -5); cam.add(flash.target);
  level.scene.add(cam);
  if (params.get('dbg')) { const mode = params.get('dbg'); level.scene.traverse(o => { if (o.isMesh && o.material && o.material.name === 'station_floor') { if (mode === 'basic') o.material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); else if (mode === 'std') o.material = new THREE.MeshStandardMaterial({ color: 0xffffff }); else if (mode === 'nopatch') { const m = o.material.clone(); m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => 'np'; o.material = m; } else if (mode === 'novc') { const m = o.material.clone(); m.vertexColors = false; o.material = m; } } }); }
  if (params.get('amb')) level.scene.add(new THREE.AmbientLight(0xffffff, +params.get('amb')));
  if (params.get('nomap')) level.scene.traverse(o => { if (o.isMesh && o.material && o.material.map) { o.material.normalMap = null; o.material.needsUpdate = true; } });
  engine.setView(level.scene, cam);
  let last = performance.now(); let frames = 0;
  const loop = () => {
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    level.update(dt, cam); engine.render(dt); frames++;
    if (frames > 30 && manager.itemsLoaded >= manager.itemsTotal) window.__ready = true;
    window.__info = { calls: engine.renderer.info.render.calls, tris: engine.renderer.info.render.triangles, loaded: manager.itemsLoaded, total: manager.itemsTotal };
    requestAnimationFrame(loop);
  };
  loop();
}).catch(e => { console.error(e); window.__err = String(e.stack || e); });
