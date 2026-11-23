// Game session: builds a mission (level, physics, entities, monsters, director), runs the frame loop,
// noise propagation, interactions, throwables, gas zones, checkpoints, death/respawn, cutscenes, results.
import * as THREE from 'three';
import { initPhysics, Physics } from '../core/physics.js';
import { MapGrid, CELL } from '../world/mapgen.js';
import { Level } from '../world/level.js';
import { Player } from './player.js';
import { EntityManager } from './entities.js';
import { NavGrid } from './nav.js';
import { Monster } from './monsters.js';
import { Director } from './director.js';
import { MissionRunner } from './mission.js';
import { HUD } from '../ui/hud.js';
import { Particles } from './fx.js';
import { input, endFrame, requestLock, exitLock, resetInput } from '../core/input.js';
import { audio } from '../core/audio.js';
import { getProfile, saveProfile, addCoins, unlockAchievement, setCheckpoint, clearCheckpoint } from '../core/save.js';
import { RNG, h, bus, sleep, formatTime, damp, isMobile } from '../core/util.js';
import { loadModel } from '../core/assets.js';
import { skinById } from '../data/skins.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { MISSIONS, missionIndex } from '../data/missions.js';
import { Human } from './human.js';
import { bottleGeometry } from '../world/procgeo.js';
import { plainMat } from '../core/materials.js';

export class Game {
  constructor(app, def, opts = {}) {
    this.app = app; this.engine = app.engine; this.def = def;
    this.opts = opts;
    this.noises = []; this.monsters = []; this.taken = new Set();
    this.deaths = opts.deaths || 0;
    this.disposed = false; this.paused = false; this.modalOpen = false;
    this.cutscene = null; this.flashFlicker = 0; this.musicOverride = null;
    this.net = opts.net || null;
    this.remotes = new Map();
    this.time = 0;
    this.gasMask = false; this.toxic = 0;
  }

  async load(progress = () => {}) {
    const def = this.def;
    progress(0.02, 'Физика');
    await initPhysics();
    this.physics = new Physics();
    progress(0.05, 'Карта');
    const [w, hgt] = def.size || [64, 48];
    const grid = new MapGrid(w, hgt);
    const rng = new RNG(def.id);
    def.map(grid, rng);
    this.grid = grid;
    const env = { seed: def.id, chapter: def.chapter, ...def.env };
    this.level = new Level(this.engine, grid, env);
    await this.level.build((k, t) => progress(0.05 + k * 0.55, t));
    this.scene = this.level.scene;
    // physics colliders
    progress(0.62, 'Физика мира');
    const b = this.level.builder;
    for (const box of b.boxes) this.physics.addBox(box);
    for (const r of b.ramps) this.physics.addHull(r);
    for (const c of b.cylinders) this.physics.addCylinder(c);
    for (const c of this.level.decor.colliders) this.physics.addBox(c);
    // dynamic props (knockable -> noise)
    await this.spawnDynamics();
    // particles
    this.fx = new Particles(400);
    this.scene.add(this.fx.points);
    // entities
    progress(0.7, 'Объекты');
    this.entities = new EntityManager(this);
    this.entities.buildDoors(grid, this.level);
    const cp = this.opts.checkpoint && this.opts.checkpoint.mission === def.id ? this.opts.checkpoint : null;
    for (const e of grid.entities) {
      if (cp && e.id && cp.taken?.includes(e.id)) continue;
      await this.entities.spawn(e, this.level);
    }
    this.nav = new NavGrid(this.level, this);
    // player
    progress(0.8, 'Игрок');
    this.hud = new HUD(this.app.uiRoot, this);
    this.player = new Player(this);
    this.scene.add(this.player.camera);
    this.scene.add(this.player.dust.points);
    const start = this.level.spotPos(def.start || 'start') || new THREE.Vector3(5, 0, 5);
    this.player.spawn(start, def.startYaw ?? 0);
    this.player.hasFlashlight = def.env?.flashlight !== false;
    this.player.battery = def.env?.battery ?? 100;
    this.player.drainRate = def.env?.drain ?? 0.42;
    for (const [k, v] of Object.entries(def.env?.inventory || {})) this.player.addItem(k, v);
    if (def.env?.gasMask) this.gasMask = true;
    this.skinStealth = getProfile().skin === 'hunter';
    // monsters
    progress(0.86, 'Существа');
    if (cp) {
      for (const m of cp.monsters || []) await this.spawnMonster(m.kind, new THREE.Vector3(m.x, m.y, m.z), { id: m.id, ...(m.opts || {}) });
    } else {
      for (const m of def.monsters || []) {
        const p = this.level.spotPos(m.spot);
        if (!p) continue;
        await this.spawnMonster(m.kind, p, { ...m, patrol: m.patrol?.map((s) => this.level.spotPos(s)).filter(Boolean) });
      }
    }
    // director
    this.director = new Director(this, def.env?.director || {});
    await this.director.init();
    // mission
    this.mission = new MissionRunner(this, def);
    this.mission.env = def.env || {};
    if (cp) this.applyCheckpoint(cp);
    // co-op partner avatars
    if (this.net) await this.net.attachGame(this);
    this.engine.setView(this.scene, this.player.camera);
    progress(0.93, 'Шейдеры');
    try { await this.engine.renderer.compileAsync(this.scene, this.player.camera); } catch (e) { /* older browsers */ }
    progress(1, 'Готово');
    this.touch = this.app.touch;
    return this;
  }

  async spawnDynamics() {
    const list = this.level.decor.dynamics.slice(0, 40);
    for (const d of list) {
      const gltf = await loadModel(d.model);
      if (!gltf) continue;
      const mesh = gltf.scene.clone(true);
      mesh.position.set(d.x, d.y - 0.3, d.z);
      mesh.rotation.y = d.ry;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      this.scene.add(mesh);
      mesh.updateMatrixWorld(true);
      const isBarrel = /arrel/.test(d.model);
      this.physics.addDynamic(mesh, {
        shape: isBarrel ? 'cyl' : 'box', mass: isBarrel ? 25 : d.model.includes('cardboard') ? 3 : 15,
        onImpact: (p, sp) => {
          const pos = mesh.position.clone();
          audio.play(isBarrel ? 'impact_metal' : 'impact_wood', { pos, volume: Math.min(1, sp / 5), rate: 0.9 + Math.random() * 0.2 });
          this.emitNoise(pos, Math.min(18, sp * 3), 'impact');
        },
      });
    }
  }

  // ---------------- core API used by systems ----------------
  emitNoise(pos, radius, type) {
    this.noises.push({ pos: pos.clone(), radius, type, t: 0.6 });
    if (this.net && type !== 'remote') this.net.queueNoise?.(pos, radius);
  }
  doorAt(x, y) { return this.entities?.doorAt(x, y); }
  openDoor(door, by) { if (!door.open) { door.dir = 1; this.entities.setDoor(door, true, true); this.net?.sendEvent({ t: 'door', id: door.id, open: true, dir: 1 }); } void by; }
  bashDoor(door, by) { this.entities.bashDoor(door, by); }
  remotePlayers() { return [...this.remotes.values()]; }
  stats(k, n = 1) { const s = getProfile().stats; s[k] = (s[k] || 0) + n; if (k === 'scares' && s.scares >= 25) unlockAchievement('scared'); }
  markTaken(id) { if (id) this.taken.add(id); }
  collectNote(id) { const pr = getProfile().progress; if (id && !pr.notes.includes(id)) { pr.notes.push(id); saveProfile(); addCoins(15); if (pr.notes.length >= 20) unlockAchievement('collector'); } }

  async spawnMonster(kind, pos, opts = {}) {
    const m = await Monster.create(this, kind, pos, { ...opts, remote: this.net && !this.net.isHost });
    this.monsters.push(m);
    return m;
  }
  removeMonster(m) { m.dispose(); this.monsters.splice(this.monsters.indexOf(m), 1); }

  setModal(open) {
    this.modalOpen = open;
    if (open) { exitLock(); resetInput(); }
    else if (!this.paused && !this.touch?.visible && !this.dead) requestLock(this.engine.canvas);
  }

  // ---------------- frame ----------------
  update(dt) {
    if (this.disposed) return;
    this.time += dt;
    const p = this.player;
    const frozen = this.paused || this.modalOpen;
    if (!frozen) {
      if (input.pressed.has('pause')) { this.pause(); endFrame(); return; }
      p.update(dt);
      this.updateInteraction(dt);
      this.updateThrow();
      for (const m of this.monsters) m.update(dt);
      for (const n of this.noises) n.t -= dt;
      this.noises = this.noises.filter((n) => n.t > 0);
      this.entities.update(dt);
      this.physics.step(dt);
      this.director.update(dt);
      this.mission.update(dt);
      this.updateGas(dt);
      this.updateFear(dt);
      this.fx.update(dt);
      this.updateFlares(dt);
      if (this.net) this.net.update(dt);
      for (const r of this.remotes.values()) r.update(dt);
      const prev = getProfile().stats.distance;
      getProfile().stats.distance = prev + (p.speed || 0) * dt;
      getProfile().stats.playTime += dt;
      if (getProfile().stats.distance > 10000) unlockAchievement('runner');
    } else {
      // keep camera matrices fresh while paused
      p.camera.updateMatrixWorld();
    }
    this.level.update(dt, p.camera);
    // audio listener + reverb zone
    const cam = p.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    audio.listener(cam.position, fwd, new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion));
    const z = this.level.zoneAt(cam.position.x, cam.position.z);
    if (z) audio.setZone(z.reverb);
    const chase = this.monsters.some((m) => m.state === 'chase' || m.state === 'attack');
    const near = this.monsters.some((m) => m.pos.distanceTo(p.position) < 14 && m.state !== 'idle');
    audio.setTension(this.musicOverride ?? (chase ? 1 : near ? 0.45 : 0.08), dt);
    // post fx
    const U = this.engine.uniforms;
    U.uFear.value = damp(U.uFear.value, p.fear, 3, dt);
    U.uDamage.value = Math.max(p.damageFx, p.health < 30 ? 0.25 + Math.sin(this.time * 3) * 0.1 : 0);
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 0.6);
    U.uToxic.value = damp(U.uToxic.value, this.toxic, 2, dt);
    U.uDistort.value = p.fear * 0.4;
    this.hud.update(dt);
    endFrame();
  }

  updateInteraction(dt) {
    const p = this.player;
    if (p.hidden || this.cutscene) { this.hud.setPrompt(null); return; }
    const e = this.entities.pick(p);
    if (e !== this.holdTarget) { this.holdT = 0; this.holdTarget = null; }
    if (e) {
      if (e.hold) {
        if (input.interactHeld) {
          this.holdTarget = e; this.holdT = (this.holdT || 0) + dt;
          if (this.holdT >= e.hold) { this.holdT = 0; this.holdTarget = null; input.interactHeld = false; e.use(p); }
        } else this.holdT = 0;
        this.hud.setPrompt(e, (this.holdT || 0) / e.hold);
      } else {
        this.hud.setPrompt(e);
        if (input.pressed.has('interact')) e.use(p);
      }
    } else this.hud.setPrompt(null);
    this.touch?.setPrompt(!!e);
  }

  // throw bottle (distraction) or flare (repels)
  updateThrow() {
    const p = this.player;
    const wantFlare = input.pressed.has('flare') || (input.pressed.has('throw') && !p.hasItem('bottle') && p.hasItem('flare'));
    if (wantFlare && p.useItem('flare')) { this.throwObject('flare'); return; }
    if (input.pressed.has('throw')) {
      if (p.useItem('bottle')) this.throwObject('bottle');
      else this.hud.toast('Нечего бросить', 'warn');
    }
  }
  throwObject(kind, remote = null) {
    const p = this.player;
    const o = remote ? new THREE.Vector3(remote.x, remote.y, remote.z) : p.camera.position.clone();
    const d = remote ? new THREE.Vector3(remote.dx, remote.dy, remote.dz) : (() => { const v = new THREE.Vector3(); p.camera.getWorldDirection(v); return v; })();
    const mesh = kind === 'bottle' ? new THREE.Mesh(bottleGeometry(), plainMat('glass_dirty')) : new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.6, 0.3) }));
    mesh.position.copy(o).addScaledVector(d, 0.5);
    this.scene.add(mesh);
    const prop = this.physics.addDynamic(mesh, { shape: 'box', mass: 0.6, restitution: 0.3, size: new THREE.Vector3(0.08, 0.25, 0.08) });
    prop.body.setLinvel({ x: d.x * 11, y: d.y * 11 + 3, z: d.z * 11 }, true);
    prop.body.setAngvel({ x: 6, y: 2, z: 4 }, true);
    if (!remote) { this.net?.sendEvent({ t: 'throw', kind, x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z }); audio.play('click', { bus: 'ui', volume: 0.3 }); }
    if (kind === 'bottle') {
      prop.onImpact = () => {
        const pos = mesh.position.clone();
        audio.play('bottle_break', { pos, volume: 1 });
        this.emitNoise(pos, 22, 'bottle');
        this.fx.emit(pos, 18, { color: [0.6, 0.7, 0.6], speed: 2.5, up: 1.5, life: 0.6 });
        this.physics.removeDynamic(prop); mesh.removeFromParent();
      };
    } else {
      this.stats('flaresUsed');
      const flare = { mesh, prop, t: 22, lamp: this.level.lamps.add({ type: 'fire', x: o.x, y: o.y, z: o.z, color: 0xff2a10, intensity: 45, range: 12, circuit: 'always', state: 'flicker' }) };
      flare.snd = audio.play('steam', { pos: o, loop: true, volume: 0.25, rate: 2 });
      (this.flares ||= []).push(flare);
    }
  }
  updateFlares(dt) {
    if (!this.flares) return;
    for (const f of this.flares) {
      f.t -= dt;
      f.lamp.lightPos.copy(f.mesh.position).y += 0.2;
      f.lamp.pos.copy(f.mesh.position);
      f.snd?.setPos(f.mesh.position);
      if (Math.random() < 0.6) this.fx.emit(f.mesh.position, 1, { color: [5, 0.8, 0.3], speed: 0.5, up: 1.5, life: 0.5, gravity: 2 });
      for (const m of this.monsters) {
        if (m.pos.distanceTo(f.mesh.position) < 6 && !m.T.boss && m.state !== 'flee' && m.state !== 'stunned') {
          if (m.T.photophobic || m.T.ghost) { m.setState('flee'); } else if (!m._flareStun) { m._flareStun = true; m.stun(); }
        }
      }
      if (f.t <= 0) { f.lamp.state = 'off'; f.lamp.intensity = 0; f.snd?.stop(); this.physics.removeDynamic(f.prop); f.mesh.removeFromParent(); f.dead = true; }
    }
    this.flares = this.flares.filter((f) => !f.dead);
  }

  updateGas(dt) {
    let inGas = false;
    for (const e of this.entities.list) if (e.def?.type === 'gas' && e.inside && e.inside(this.player.position) && !e.cleared) inGas = true;
    if (inGas) {
      if (this.gasMask && (this.player.inventory.filter || 0) + (this.filterTime || 0) > 0) {
        this.filterTime = (this.filterTime ?? 60) - dt;
        if (this.filterTime <= 0) { if (this.player.useItem('filter')) { this.filterTime = 60; this.hud.toast('Фильтр заменён'); } }
        if (!this.maskLoop) this.maskLoop = audio.play('gasmask', { bus: 'sfx', loop: true, volume: 0.5 });
        this.toxic = 0.2;
        if (this.filterTime <= 0 && !this.player.hasItem('filter')) { this.player.damage(dt * 8); this.toxic = 0.8; }
      } else { this.player.damage(dt * (this.gasMask ? 8 : 12)); this.toxic = 1; this.coughT = (this.coughT || 0) - dt; if (this.coughT <= 0) { this.coughT = 2; this.hud.toast(this.gasMask ? 'Фильтр пуст!' : 'Токсичный газ! Нужен противогаз', 'warn'); } }
    } else { this.toxic = 0; if (this.maskLoop) { this.maskLoop.stop(); this.maskLoop = null; } }
  }

  updateFear(dt) {
    const p = this.player;
    let f = 0;
    for (const m of this.monsters) {
      const d = m.pos.distanceTo(p.position);
      if (d < 16) f = Math.max(f, (1 - d / 16) * (m.state === 'chase' ? 1 : 0.6));
    }
    const lit = this.level.lamps.lightAt(p.position) + (p.flashOn ? 0.5 : 0);
    if (lit < 0.1) f = Math.max(f, 0.15);
    p.fear = damp(p.fear, f, f > p.fear ? 2 : 0.4, dt);
    // heartbeat when afraid
    this.hbT = (this.hbT || 0) - dt;
    if (p.fear > 0.45 && this.hbT <= 0) { this.hbT = 1.15 - p.fear * 0.55; audio.play('heartbeat', { bus: 'sfx', volume: (p.fear - 0.35) * 0.9 }); }
    if (p.stamina < 30 || p.health < 40) { if (!this.breathLoop) this.breathLoop = audio.play('breath', { bus: 'sfx', loop: true, volume: 0.35 }); }
    else if (this.breathLoop) { this.breathLoop.stop(1); this.breathLoop = null; }
  }

  onMonsterSpotted(m) {
    const now = this.time;
    if (now - (this.lastSting || -99) > 25) {
      this.lastSting = now;
      audio.play('stinger', { bus: 'music', volume: 0.6 });
      this.player.fear = Math.min(1, this.player.fear + 0.35);
      this.stats('scares');
    }
    void m;
  }

  // ---------------- checkpoints ----------------
  saveCheckpoint() {
    if (this.net && !this.net.isHost) return;
    const cp = this.makeCheckpoint();
    setCheckpoint(cp);
    this.lastCheckpoint = cp;
    this.hud.toast('Контрольная точка');
  }

  makeCheckpoint(live = false) {
    const p = this.player;
    const doors = {};
    for (const d of this.entities.doors.values()) doors[d.id] = { open: d.open, locked: d.locked, sealed: d.sealed };
    const feet = p.feet;
    const cp = {
      mission: this.def.id, ...this.mission.snapshot(),
      player: { x: feet.x, y: feet.y, z: feet.z, yaw: p.yaw, inv: { ...p.inventory }, battery: p.battery, health: Math.max(60, p.health), hasFlashlight: p.hasFlashlight, gasMask: this.gasMask },
      taken: [...this.taken], doors,
      power: this.level.lamps.power, circuits: { ...this.level.lamps.circuits },
      monsters: this.monsters.filter((m) => !m.T.ghost || true).map((m) => ({ kind: m.kind, id: m.id, x: m.home.x, y: m.home.y, z: m.home.z, opts: { dormant: m.dormant, wander: m.wanderRadius, aggressive: m.aggressive } })),
      delivered: Object.fromEntries(this.entities.list.filter((e) => e.delivered).map((e) => [e.id, e.delivered])),
      deaths: this.deaths,
    };
    if (live) cp.monsters = this.monsters.map((m) => ({ kind: m.kind, id: m.id, x: m.pos.x, y: m.pos.y, z: m.pos.z, opts: { dormant: m.dormant, aggressive: m.aggressive } }));
    return cp;
  }

  applyCheckpoint(cp) {
    const p = this.player;
    const pp = cp.player;
    p.spawn(new THREE.Vector3(pp.x, pp.y, pp.z), pp.yaw);
    p.inventory = { ...pp.inv }; p.battery = pp.battery; p.health = pp.health; p.hasFlashlight = pp.hasFlashlight; this.gasMask = pp.gasMask;
    for (const id of cp.taken || []) this.taken.add(id);
    for (const [id, st] of Object.entries(cp.doors || {})) { const d = this.entities.doorsById.get(id); if (d) { d.locked = st.locked; d.sealed = st.sealed; if (st.open) { d.open = true; d.targetAngle = d.angle = 1; this.entities.updateDoorTransform(d); } } }
    this.level.lamps.setPower(cp.power || 'on');
    Object.assign(this.level.lamps.circuits, cp.circuits || {});
    for (const id of cp.used || []) { const e = this.entities.byId.get(id); if (e && e.def && ['switch', 'lever', 'panel', 'terminal', 'valve', 'generator', 'radio', 'keypad', 'barricade', 'device'].includes(e.def.type)) { this.entities.activate(e, true); } }
    for (const [id, n] of Object.entries(cp.delivered || {})) { const e = this.entities.byId.get(id); if (e) e.delivered = n; }
    this.deaths = cp.deaths || this.deaths;
  }

  // ---------------- flow ----------------
  async begin() {
    const def = this.def;
    const cp = this.opts.checkpoint && this.opts.checkpoint.mission === def.id ? this.opts.checkpoint : null;
    this.hud.setFade(1);
    this.hud.fade(false, 1.6);
    if (!cp) {
      this.hud.cineTitle(`Глава ${def.chapter} · Миссия ${def.num}`, def.title);
      if (def.intro) { this.cutscene = true; await this.playCutscene(def.intro); this.cutscene = null; }
    }
    if (!this.touch?.visible) requestLock(this.engine.canvas);
    await this.mission.start(cp);
    if (!cp) this.saveCheckpoint();
  }

  async playCutscene(cs) {
    const p = this.player;
    this.cutscene = true;
    this.hud.letterbox(true);
    p.frozen = true;
    const cam = p.camera;
    const savedPos = cam.position.clone(), savedRot = cam.rotation.clone();
    const pts = (cs.path || []).map((s) => (Array.isArray(s) ? new THREE.Vector3(...s) : (() => { const v = this.level.spotPos(typeof s === 'string' ? s : s.spot); return v ? v.setY(v.y + (s.h ?? 1.7)) : null; })())).filter(Boolean);
    const look = cs.look ? (Array.isArray(cs.look) ? new THREE.Vector3(...cs.look) : this.level.spotPos(cs.look)?.setY(this.level.spotPos(cs.look).y + (cs.lookH ?? 1.2))) : null;
    for (const [text, dur, who] of cs.lines || []) this.hud.subtitle(text, dur, who);
    if (cs.sound) audio.play(cs.sound, { bus: 'sfx' });
    const dur = cs.dur || 5;
    if (pts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts);
      let t = 0;
      this.skipCut = false;
      while (t < dur && !this.disposed && !this.skipCut) {
        const dt = await new Promise((r) => { const t0 = performance.now(); requestAnimationFrame(() => r((performance.now() - t0) / 1000)); });
        t += Math.min(0.05, dt);
        const k = t / dur;
        const pos = curve.getPoint(Math.min(1, k * k * (3 - 2 * k)));
        this.cutCam = { pos, look: look || curve.getPoint(Math.min(1, k + 0.05)) };
      }
      this.cutCam = null;
    } else {
      await sleep(dur * 1000);
    }
    cam.position.copy(savedPos); cam.rotation.copy(savedRot);
    this.hud.letterbox(false);
    p.frozen = false;
    this.cutscene = null;
  }
  // called by app loop after update to override camera during cutscenes
  applyCutCam() {
    if (!this.cutCam) return;
    const cam = this.player.camera;
    cam.position.copy(this.cutCam.pos);
    cam.lookAt(this.cutCam.look);
  }

  pause() {
    if (this.paused || this.dead) return;
    this.paused = true;
    exitLock();
    resetInput();
    audio.ctx?.suspend?.();
    const dlg = h('div', { class: 'dialog' },
      h('h3', {}, 'Пауза'),
      h('div', { class: 'muted', style: { marginBottom: '12px', fontSize: '13px' } }, `${this.def.title} · ${this.mission.step?.text || ''}`),
      h('div', { class: 'col' },
        h('button', { class: 'btn primary', onclick: () => this.resume() }, 'Продолжить'),
        h('button', { class: 'btn', onclick: () => { this.resume(); this.reloadCheckpoint(); } }, 'Загрузить контрольную точку'),
        h('button', { class: 'btn', onclick: () => this.app.openSettingsOverlay(() => {}) }, 'Настройки'),
        h('button', { class: 'btn', onclick: () => { this.resume(); this.quit(); } }, 'Выйти в меню')));
    this.pauseEl = h('div', { class: 'overlay' }, dlg);
    this.app.uiRoot.append(this.pauseEl);
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pauseEl?.remove();
    audio.ctx?.resume?.();
    if (!this.touch?.visible) requestLock(this.engine.canvas);
  }

  onPlayerDeath() {
    if (this.dead) return;
    this.dead = true;
    this.deaths++;
    getProfile().stats.deaths++;
    saveProfile();
    audio.play('stinger', { bus: 'music', volume: 0.8 });
    audio.play('hit', { volume: 1 });
    this.net?.sendEvent({ t: 'dead' });
    if (this.net && this.remotes.size) {
      this.hud.fade(true, 1.2);
      this.net.onLocalDeath();
      this.net.reviveEl = h('div', { class: 'overlay', style: { background: 'transparent', pointerEvents: 'none' } }, h('div', { class: 'dialog death', style: { background: 'rgba(0,0,0,.6)' } }, h('h3', {}, 'ВЫ ПОГИБЛИ'), h('p', { class: 'muted', style: { textAlign: 'center' } }, 'Напарник ещё жив. Вы очнётесь рядом с ним...')));
      this.app.uiRoot.append(this.net.reviveEl);
      setTimeout(() => this.net?.reviveEl?.remove(), 13000);
      return;
    }
    exitLock();
    const el = h('div', { class: 'overlay' }, h('div', { class: 'dialog death' },
      h('h3', {}, 'ВЫ ПОГИБЛИ'),
      h('p', { class: 'muted', style: { textAlign: 'center' } }, this.deathReason || 'Тьма забрала вас.'),
      h('div', { class: 'col' },
        h('button', { class: 'btn primary', onclick: () => { el.remove(); this.reloadCheckpoint(); } }, 'С контрольной точки'),
        h('button', { class: 'btn', onclick: () => { el.remove(); this.quit(); } }, 'В меню'))));
    setTimeout(() => this.app.uiRoot.append(el), 1200);
    this.hud.fade(true, 1.2);
  }
  failMission(reason) { this.deathReason = reason; this.player.health = 0; this.player.alive = false; this.onPlayerDeath(); }

  reloadCheckpoint() {
    const cp = getProfile().progress.checkpoint;
    this.app.startMission(this.def.id, { checkpoint: cp && cp.mission === this.def.id ? cp : null, deaths: this.deaths, net: this.net });
  }

  async missionComplete() {
    if (this.completed) return;
    this.completed = true;
    const def = this.def;
    const prof = getProfile();
    const idx = missionIndex(def.id);
    const prevDone = !!prof.progress.done[def.id];
    const reward = (def.reward ?? 100 + def.chapter * 40) * (prevDone ? 0.4 : 1);
    const bonus = this.deaths === 0 ? 60 : 0;
    const total = Math.round(reward + bonus);
    addCoins(total);
    prof.progress.done[def.id] = { time: Math.min(prof.progress.done[def.id]?.time ?? Infinity, this.mission.elapsed), deaths: this.deaths, at: Date.now() };
    prof.progress.unlocked = Math.max(prof.progress.unlocked, idx + 2);
    prof.stats.missions++;
    if (this.net) prof.stats.coopMissions++;
    clearCheckpoint();
    saveProfile(true);
    // achievements
    if (def.id === 'c1m1') unlockAchievement('first_steps');
    if (def.id === 'c1m3') unlockAchievement('electrician');
    if (def.num === 8) unlockAchievement('chapter' + def.chapter);
    if (this.deaths === 0) unlockAchievement('flawless');
    if (this.net) unlockAchievement('teamwork');
    if (def.id === 'c3m3' && this.deaths === 0) unlockAchievement('silent');
    if (def.id === 'c3m8') unlockAchievement('queen');
    if (def.id === 'c4m5') unlockAchievement('truth');
    this.net?.sendEvent({ t: 'complete' });
    await this.hud.fade(true, 1.5);
    exitLock();
    const next = MISSIONS[idx + 1];
    const el = h('div', { class: 'overlay' }, h('div', { class: 'dialog result' },
      h('h3', {}, 'Миссия выполнена'),
      h('div', { class: 'muted', style: { textAlign: 'center', marginBottom: '10px' } }, `Глава ${def.chapter} · ${def.num}. ${def.title}`),
      h('div', { class: 'stat' }, 'Время', h('b', {}, formatTime(this.mission.elapsed))),
      h('div', { class: 'stat' }, 'Смертей', h('b', {}, this.deaths)),
      h('div', { class: 'stat' }, 'Награда', h('b', {}, `+${total} ◉`)),
      def.outro ? h('p', { style: { fontSize: '14px', lineHeight: 1.5 } }, def.outro) : '',
      h('div', { class: 'col', style: { marginTop: '12px' } },
        next && (!this.net || this.net.isHost) ? h('button', { class: 'btn primary', onclick: () => { el.remove(); this.app.startMission(next.id, { net: this.net }); } }, `Далее: ${next.title}`) : '',
        h('button', { class: 'btn', onclick: () => { el.remove(); this.quit(); } }, 'В меню'))));
    this.app.uiRoot.append(el);
    this.resultEl = el;
  }

  async showEnding() {
    const pf = getProfile().progress.flags;
    const notes = getProfile().progress.notes.length;
    let id, title, text;
    const good = pf.savedSurvivors && pf.destroyedLab;
    if (good && notes >= 12) { id = 'dawn'; title = 'РАССВЕТ'; text = 'Вы вывели выживших на поверхность. Лаборатория «Глубина» погребена под тоннами бетона. Солнце впервые за много месяцев касается вашего лица. Город мёртв, но тьма больше не поднимется наверх.'; }
    else if (pf.destroyedLab || pf.savedSurvivors) { id = 'passenger'; title = 'ПОСЛЕДНИЙ ПАССАЖИР'; text = pf.destroyedLab ? 'Источник заражения уничтожен, но вы поднимаетесь наверх один. Вагон за спиной пуст. Иногда по ночам вам кажется, что из вентиляционных решёток кто-то шепчет ваше имя.' : 'Вы спасли людей, но лаборатория продолжает работать. Внизу, в темноте, Королева уже откладывает новые коконы. Это ещё не конец.'; }
    else { id = 'darkness'; title = 'ВЕЧНАЯ ТЬМА'; text = 'Вы выбрались. Но вместе с вами наверх поднялось то, что жило в тоннелях. Через неделю в городе погас последний фонарь.'; }
    const endings = getProfile().progress.endings;
    if (!endings.includes(id)) endings.push(id);
    if (id === 'dawn') { unlockAchievement('dawn'); if (!getProfile().skins.includes('legend')) getProfile().skins.push('legend'); }
    if (endings.length >= 3) unlockAchievement('all_endings');
    unlockAchievement('chapter4');
    saveProfile(true);
    this.engine.uniforms.uFlash.value = 0.9;
    await this.hud.fade(true, 3);
    const el = h('div', { class: 'overlay', style: { background: '#000' } }, h('div', { class: 'dialog', style: { background: 'transparent', border: 'none', textAlign: 'center' } },
      h('div', { class: 'muted', style: { letterSpacing: '.4em' } }, 'КОНЦОВКА'),
      h('h3', { style: { fontSize: '44px', margin: '10px 0 18px' } }, title),
      h('p', { style: { lineHeight: 1.6 } }, text),
      h('p', { class: 'muted', style: { fontSize: '12px', marginTop: '18px' } }, `Открыто концовок: ${endings.length}/3`)));
    this.app.uiRoot.append(el);
    await sleep(9000);
    el.remove();
    this.hud.setFade(0);
  }

  quit() {
    this.net?.leaveGame?.();
    this.app.toMenu();
  }

  dispose() {
    this.disposed = true;
    audio.stopAll();
    this.hud?.dispose();
    this.director?.dispose();
    for (const m of this.monsters) m.dispose();
    this.monsters = [];
    for (const r of this.remotes.values()) r.dispose?.();
    this.entities?.dispose();
    this.player?.dispose();
    this.physics?.dispose();
    this.level?.dispose();
    this.pauseEl?.remove();
    this.resultEl?.remove();
  }
}

// remote co-op player avatar (interpolated)
export class RemotePlayer {
  constructor(game, id, info) {
    this.game = game; this.id = id; this.info = info;
    this.position = new THREE.Vector3(); this.target = null; this.yaw = 0; this.alive = true;
    this.flashOn = false; this.crouching = false; this.hidden = null;
    this.buf = [];
  }
  async init() {
    this.human = await Human.create({ skin: this.info.skin || 'stalker', mode: 'player' });
    if (this.human) this.game.scene.add(this.human.root);
    const L = new THREE.SpotLight(0xfff1dc, 0, 26, 0.45, 0.6, 1.6);
    L.map = this.game.player.flash.map;
    this.flash = L; this.flashT = new THREE.Object3D();
    this.game.scene.add(L); this.game.scene.add(this.flashT); L.target = this.flashT;
    this.label = this.info.name;
    this.body = this.game.physics.addKinematicCapsule(0.55, 0.3, { x: 0, y: -50, z: 0 });
  }
  push(s) { s.rt = performance.now(); this.buf.push(s); if (this.buf.length > 20) this.buf.shift(); }
  lights(point) {
    if (!this.flashOn) return 0;
    const o = this.position.clone().setY(this.position.y + 1.5);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch || 0), Math.sin(this.pitch || 0), -Math.cos(this.yaw) * Math.cos(this.pitch || 0));
    const to = point.clone().sub(o); const d = to.length(); if (d > 16) return 0;
    return to.normalize().dot(dir) > Math.cos(0.45) ? 1 - d / 16 : 0;
  }
  update(dt) {
    // interpolate ~100ms in the past for smooth motion
    const now = performance.now() - 110;
    let a = null, b = null;
    for (let i = 0; i < this.buf.length - 1; i++) if (this.buf[i].rt <= now && this.buf[i + 1].rt >= now) { a = this.buf[i]; b = this.buf[i + 1]; break; }
    let s = null;
    if (a && b) { const k = (now - a.rt) / Math.max(1, b.rt - a.rt); s = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, r: a.r + (((b.r - a.r + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k, p: b.p, f: b.f, c: b.c, v: b.v, h: b.h, d: b.d }; }
    else if (this.buf.length) s = this.buf[this.buf.length - 1];
    if (!s) return;
    this.position.set(s.x, s.y, s.z); this.yaw = s.r; this.pitch = s.p; this.flashOn = !!s.f; this.crouching = !!s.c; this.hidden = s.h ? {} : null; this.alive = !s.d;
    if (this.human) {
      this.human.root.position.copy(this.position);
      this.human.root.rotation.y = this.yaw + Math.PI;
      this.human.root.visible = !s.h;
      this.human.locomote(s.v || 0, this.crouching);
      this.human.update(dt, { lookPitch: this.pitch });
    }
    const eye = this.position.clone().setY(this.position.y + (this.crouching ? 1.0 : 1.55));
    this.flash.position.copy(eye);
    this.flashT.position.copy(eye).add(new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch || 0), Math.sin(this.pitch || 0), -Math.cos(this.yaw) * Math.cos(this.pitch || 0)).multiplyScalar(5));
    this.flash.intensity = this.flashOn && !s.h ? 90 : 0;
    this.body.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + 0.9, z: this.position.z });
  }
  dispose() { this.human?.dispose(); this.flash.removeFromParent(); this.flashT.removeFromParent(); }
}
void CELL; void bus; void isMobile; void skinById; void ACHIEVEMENTS;
