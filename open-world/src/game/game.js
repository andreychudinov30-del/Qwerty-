// Game orchestrator: modes (menu / play / pause), update order, physics hooks, death/arrest, save/load, endings
import * as THREE from 'three';
import { G, bus, clamp, rand, fmtMoney } from '../core/util.js';
import { quality, settings, loadGame, writeGame, wipeGame, NEW_GAME, IS_MOBILE } from '../core/save.js';
import { initInput, pollInput, endFrame, hit, has, I, setTouchMode } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { HUD } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Weapons, WEAPONS } from './weapons.js';
import { Missions } from './missions.js';
import { Economy, PROPERTIES } from './economy.js';
import { ENDINGS, STORY } from './story.js';
import { PedSystem } from '../ai/peds.js';
import { Traffic } from '../ai/traffic.js';
import { Police } from '../ai/police.js';
import { CURB } from '../world/citygen.js';

export class Game {
  constructor(engine, scene, camera, physics, W) {
    this.engine = engine; this.scene = scene; this.camera = camera; this.physics = physics; this.W = W;
    this.q = quality(); this.mode = 'menu';
    G.vehicles = new Set(); G.debris = []; G.frame = 0; G.dayCount = 0;
  }
  async init() {
    initInput(this.engine.renderer.domElement);
    G.inputHit = hit;
    G.audio = this.audio = new Audio();
    this.hud = G.hud = new HUD(this);
    this.menu = new Menu(this);
    this.cam = new CameraRig(this.camera);
    this.weapons = new Weapons(this);
    this.peds = new PedSystem(this);
    this.traffic = new Traffic(this);
    this.player = G.player = new Player(this);
    this.police = G.police = new Police(this);
    this.missions = new Missions(this);
    this.economy = new Economy(this);
    G.state = NEW_GAME();
    this.movingVehicles = [];
    // physics: contact between a moving physical vehicle and kinematic traffic/parked cars
    this.physics.onContact = (a, b) => {
      for (const [x, y] of [[a, b], [b, a]]) {
        if (x && x.type === 'vehicle' && x.v.mode === 'kinematic') {
          const other = y && y.type === 'vehicle' ? y.v : null;
          if (other && other.mode === 'dynamic') this.traffic.bump(x.v, other);
          if (!other && y && (y.type === 'ragdoll' || y.type === 'prop')) {} // ignore
        }
        if (x && x.type === 'vehicle' && y && y.type === 'vehicle') { const m = Math.abs((x.v.speed || 0) - (y.v.speed || 0)); if (m > 3) G.audio.crash(x.v.pos.x, x.v.pos.y, x.v.pos.z, m); }
      }
    };
    bus.on('crash', (v, mag, p) => { G.audio.crash(p.x, p.y, p.z, mag); if (v === this.player.car) this.cam.shake = Math.min(0.6, mag * 0.03); });
    bus.on('thunder', (d) => G.audio.thunder(d));
    bus.on('playerDied', () => this.onDeath('ВЫ ПОГИБЛИ', 'hospital'));
    bus.on('busted', () => this.onDeath('ЗАДЕРЖАН', 'police'));
    bus.on('pedKilled', (p, src) => { if (src && src.isPlayer && !p.mission && p.team === 'civ' && Math.random() < 0.3) this.spawnPickup(p.h.hipsPos(), 'cash', 20 + Math.floor(Math.random() * 80)); if (p.team.startsWith('gang') || p.team === 'enemy') if (Math.random() < 0.5) this.spawnPickup(p.h.hipsPos(), 'ammo', p.weapon || 'pistol'); });
    this.pickups = [];
    // player at menu focus (hidden)
    this.player.teleport(-40, CURB + 0.05, 30, 0); this.player.h.setVisible(false); this.player.frozen = true; this.player.state = 'menu';
    this.economy.setup();
    // world map image
    this.hud.buildMapImage(this.engine.renderer, this.scene, this.W.chunks);
    this.W.chunks.view = this.q.view;
    window.__game = this; window.__I = I;
  }
  // ------------------------------------------------ modes
  showMenu() {
    this.mode = 'menu'; G.playing = false;
    this.menu.showMain(true); this.hud.show(false);
    G.hour = 17.55; this.W.atmo.setWeather('clear', true);
    document.getElementById('touch').classList.add('hidden');
    const unlock = () => { this.audio.init(); this.audio.menuMusic(true); removeEventListener('pointerdown', unlock); };
    addEventListener('pointerdown', unlock);
  }
  start(fresh) {
    this.audio.init(); this.audio.menuMusic(false);
    if (fresh) { wipeGame(); G.state = NEW_GAME(); }
    else G.state = loadGame() || NEW_GAME();
    const st = G.state;
    this.menu.showMain(false);
    for (const p of ['settings', 'controls', 'about']) document.getElementById(p).classList.add('hidden');
    G.uiOpen = false;
    this.mode = 'play'; G.playing = true; G.paused = false;
    this.hud.show(true);
    if (I.touch) { document.getElementById('touch').classList.remove('hidden'); setTouchMode('foot'); }
    // restore player
    const pl = this.player;
    pl.frozen = false; pl.h.setVisible(true); pl.state = 'foot';
    pl.setOutfit(st.outfit || 0);
    pl.armor = st.armor || 0;
    for (const [w, on] of Object.entries(st.weapons)) if (on && WEAPONS[w] && WEAPONS[w].mag) { pl.mag[w] = 0; pl.reloadIfNeeded(w, true); }
    G.hour = st.hour ?? 9.5; G.dayCount = st.day || 0; this.economy.lastDay = G.dayCount;
    const L = G.city.landmarks;
    const sp = st.pos || { x: L.safehouse.x, z: L.safehouse.z + 1.5, h: Math.PI };
    pl.teleport(sp.x, CURB + 0.05, sp.z, sp.h || 0); this.cam.yaw = (sp.h || 0); this.cam.pitch = 0.2;
    // clear world entities near old focus
    this.W.atmo.setWeather('clear', true);
    this.economy.refreshProps();
    this.missions.refreshGiver();
    this.hud.notify('💾 Автосохранение включено');
    if (!IS_MOBILE) this.hud.hint('WASD — движение, мышь — камера, F — сесть в машину, M — карта, Esc — пауза', 8);
    else this.hud.hint('Джойстик слева, обзор — правая часть экрана', 6);
    this.missions.needLeave = !fresh;
    this._saveT = 60;
  }
  pause() { if (this.mode !== 'play' || G.cutscene) return; G.paused = true; this.menu.pause(); }
  resume() { G.paused = false; G.uiOpen = false; for (const p of ['settings', 'controls', 'about', 'pause', 'shop']) document.getElementById(p).classList.add('hidden'); }
  applyQuality() {
    this.q = quality(); this.engine.applyQuality(); this.W.atmo.applyQuality(); this.W.chunks.view = this.q.view;
    this.hud.notify('Качество: ' + this.q.name + ' (деревья/трава применятся после перезапуска)');
  }
  save() {
    const st = G.state, pl = this.player; if (!st || this.mode !== 'play') return;
    st.hour = G.hour; st.day = G.dayCount; st.armor = pl.armor;
    for (const [w, m] of Object.entries(pl.mag)) if (m) { st.ammo[w] = (st.ammo[w] || 0); }
    if (!G.interior && !G.missionActive && pl.state !== 'ragdoll') { const p = pl.wpos(); st.pos = { x: p.x, z: p.z, h: pl.heading }; }
    writeGame(st);
  }
  async onDeath(title, where) {
    if (this._dying) return; this._dying = true;
    this.hud.banner(title, '', 4, true);
    G.audio.jingle(false);
    await new Promise((r) => setTimeout(r, 3500));
    await this.hud.fade(true, 0.8);
    const st = G.state, loss = Math.min(Math.round(st.money * (where === 'police' ? 0.05 : 0.1)), 2500);
    st.money -= loss;
    this.police.reset();
    if (this.player.state === 'car') this.player.exitCar();
    const L = G.city.landmarks[where];
    this.player.respawnAt(L.x, L.z + 1.5, 0);
    this.player.h.setVisible(true);
    G.engine.u.uGray.value = 0;
    G.hour = (G.hour + 6) % 24;
    if (where === 'police') { for (const w of Object.keys(st.weapons)) if (w !== 'fists' && w !== 'camera') { delete st.weapons[w]; } this.player.weapon = 'fists'; this.player.h.hold(null); }
    await this.hud.fade(false, 0.8);
    this.hud.notify(where === 'police' ? `Штраф и конфискация оружия: -${fmtMoney(loss)}` : `Счёт за лечение: -${fmtMoney(loss)}`);
    this._dying = false;
    this.save();
  }
  showEnding() {
    const e = ENDINGS[G.state.ending ?? 0];
    this.hud.banner(e.title, e.text + '<br><br><small>Спасибо за игру! Город открыт для свободного исследования.</small>', 16);
    this.hud.letterbox(true); setTimeout(() => this.hud.letterbox(false), 15000);
  }
  spawnPickup(p, kind, val) {
    const m = new THREE.Mesh(kind === 'cash' ? new THREE.BoxGeometry(0.3, 0.12, 0.18) : new THREE.BoxGeometry(0.25, 0.18, 0.25), new THREE.MeshStandardMaterial({ color: kind === 'cash' ? 0x3a9a4a : 0x8a7a3a, emissive: kind === 'cash' ? 0x1a5a1a : 0x4a3a0a, emissiveIntensity: 1.5 }));
    m.position.set(p.x, Math.max(0.2, p.y) + 0.3, p.z); this.scene.add(m);
    this.pickups.push({ m, kind, val, t: 60 });
  }
  // ------------------------------------------------ frame
  frame(dt) {
    G.dt = dt; G.t += dt; G.frame++;
    pollInput();
    const pl = this.player;
    if (this.mode === 'menu') { this.menuFrame(dt); endFrame(); return; }
    if (hit('pause') && !G.cutscene) { if (this.hud.mapOpen) this.hud.toggleMap(false); else if (G.paused) this.menu.close('pause'); else if (G.uiOpen) { for (const p of ['settings', 'controls', 'about', 'shop']) this.menu.close(p); } else this.pause(); }
    if (hit('map') && !G.cutscene && !G.paused) this.hud.toggleMap();
    if (G.paused || this.hud.mapOpen || (G.uiOpen && !G.cutscene)) {
      if (this.hud.mapOpen) this.hud.drawMap();
      this.engine.render(dt); endFrame(); return;
    }
    // time of day
    G.hour += dt * 24 / G.dayLen;
    if (G.hour >= 24) { G.hour -= 24; G.dayCount++; }
    G.state.stats.time += dt;
    this.hud.prompt(null);
    if (pl.state === 'foot' && !G.cutscene && !G.interior) { const v = pl.nearestCar(3.8); if (v) this.hud.prompt(`<kbd>F</kbd> ${v.driver && v.driver !== pl ? 'Угнать' : 'Сесть'}: ${v.T.name}`); }
    if (I.touch) setTouchMode(pl.state === 'car' ? 'car' : 'foot');
    // gameplay updates
    pl.update(dt);
    this.missions.update(dt);
    this.economy.update(dt);
    this.traffic.update(dt);
    this.police.update(dt);
    this.movingVehicles.length = 0;
    for (const v of G.vehicles) if (Math.abs(v.speed) > 2.5 && v.mode !== 'none') this.movingVehicles.push(v);
    this.peds.update(dt);
    this.missions.updateDrivers(dt);
    // player on foot hit by vehicles
    if (pl.state === 'foot' && !G.cutscene) for (const v of this.movingVehicles) {
      if (v === pl.car || Math.abs(v.speed) < 4) continue;
      const dx = pl.pos.x - v.pos.x, dz = pl.pos.z - v.pos.z; if (dx * dx + dz * dz > 30) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading), lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < v.T.W / 2 + 0.25 && Math.abs(lz) < v.T.L / 2 + 0.25) { pl.damage(Math.abs(v.speed) * 2.2); pl.knockdown(v.vel.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 2.5, 0))); G.audio.punch(pl.pos.x, 1, pl.pos.z); break; }
    }
    // physics
    const dyn = [];
    for (const v of G.vehicles) if (v.mode === 'dynamic') dyn.push(v);
    this.physics.step(dt, (h) => { for (const v of dyn) v.prePhysics(h); });
    for (const v of G.vehicles) v.sync(dt);
    pl.post(dt);
    if (pl.state === 'car' && pl.car) G.state.stats.distance += Math.abs(pl.car.speed) * dt;
    // world systems
    const focus = pl.wpos();
    this.W.props.update(dt, focus, this.activators());
    G.fx.update(dt);
    this.updateLoose(dt);
    this.updatePickups(dt);
    this.cam.update(dt, pl);
    if (G.interior) this.scene.fog.density = 0;
    this.player.h.animate(dt);
    this.finishWorld(dt, focus);
    this.hud.updateRoute(dt);
    this.hud.update(dt);
    this.audio.update(dt, { car: pl.state === 'car' ? pl.car : null, speed: pl.state === 'car' && pl.car ? Math.abs(pl.car.speed) : 0, siren: this.police.sirenLevel, heli: this.police.heliLevel });
    // autosave
    this._saveT -= dt; if (this._saveT < 0) { this._saveT = 60; this.save(); }
    this.engine.adapt(dt);
    this.engine.render(dt);
    endFrame();
    if (this._fpsEl === undefined) this._fpsEl = location.search.includes('fps') ? document.getElementById('fps') : null;
    if (this._fpsEl && G.frame % 20 === 0) { const i = this.engine.renderer.info; this._fpsEl.textContent = `${this.engine.fps.toFixed(0)} fps · ${i.render.calls} dc · ${(i.render.triangles / 1000).toFixed(0)}k tri · peds ${this.peds.list.length} · cars ${G.vehicles.size}`; }
  }
  finishWorld(dt, focus) {
    const atmo = this.W.atmo;
    const env = atmo.update(dt, this.camera, focus);
    if (G.interior) { atmo.sun.intensity = 0; atmo.hemi.intensity = 0.25; this.scene.environmentIntensity = 0.25; }
    atmo.sky.position.copy(this.camera.position); atmo.stars.position.copy(this.camera.position);
    this.engine.setNight(env.night);
    this.engine.u.uExposure.value = G.interior ? 1.1 : 0.82 + env.night * 0.55;
    this.engine.u.uWet.value = atmo.wet;
    G.windU.value = atmo.w.wind;
    if (G.frame % 8 === 0) this.W.chunks.update(this.camera);
    this.W.veg.update(this.camera);
  }
  activators() {
    const out = [];
    for (const v of this.movingVehicles) if (v.mode === 'dynamic') out.push({ x: v.pos.x, z: v.pos.z, speed: Math.abs(v.speed) });
        return out;
  }
  updateLoose(dt) {
    const p = this.player.wpos();
    if (G.frame % 30 === 0) for (const v of [...G.vehicles]) {
      if (v.trafficC || v.policeUnit || v.mission || v === this.player.car || v === this.economy.ownedSpawn) continue;
      if (this.traffic.parked.includes(v)) continue;
      if (Math.hypot(v.pos.x - p.x, v.pos.z - p.z) > 260 || v.sunk && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) > 60) { G.vehicles.delete(v); v.dispose(); }
    }
    for (let i = G.debris.length - 1; i >= 0; i--) {
      const d = G.debris[i]; d.t -= dt;
      const t = d.rb.translation(), r = d.rb.rotation(); d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (d.t < 0) { this.scene.remove(d.mesh); this.physics.world.removeRigidBody(d.rb); G.debris.splice(i, 1); }
    }
    // dynamic vehicles without driver: gentle brake so they don't roll forever
    for (const v of G.vehicles) if (v.mode === 'dynamic' && !v.driver && !v.ai) { v.throttle = 0; v.brake = 0.4; v.steer = 0; }
  }
  updatePickups(dt) {
    const pl = this.player, p = pl.wpos();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i]; k.t -= dt; k.m.rotation.y += dt * 2;
      if (pl.state === 'foot' && k.m.position.distanceTo(p) < 1.4) {
        if (k.kind === 'cash') { G.state.money += k.val; this.hud.notify(`+${fmtMoney(k.val)}`); G.audio.money(); }
        else { const w = k.val in WEAPONS ? k.val : 'pistol'; if (!G.state.weapons[w]) pl.giveWeapon(w, 12); else G.state.ammo[w] = (G.state.ammo[w] || 0) + 12; this.hud.notify('Патроны: ' + WEAPONS[w].name); G.audio.beep(1000, 0.05, 0.1); }
        k.t = -1;
      }
      if (k.t < 0) { this.scene.remove(k.m); this.pickups.splice(i, 1); }
    }
  }
  menuFrame(dt) {
    // cinematic orbit around downtown at sunset, with live traffic & pedestrians
    const t = G.t * 0.03;
    const c = new THREE.Vector3(-50, 0, -50);
    const r = 430, h = 120 + Math.sin(t * 1.7) * 40;
    this.camera.position.set(c.x + Math.sin(t) * r, h, c.z + Math.cos(t) * r);
    this.camera.lookAt(c.x, 70, c.z);
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    G.camYaw = Math.atan2(c.x - this.camera.position.x, c.z - this.camera.position.z);
    
    const focus = { x: c.x + Math.sin(t) * 120, y: 0, z: c.z + Math.cos(t) * 120 };
    this.player.pos.set(focus.x, 0, focus.z);
    this.traffic.update(dt);
    this.movingVehicles.length = 0;
    this.peds.update(dt);
    this.physics.step(dt, () => {});
    for (const v of G.vehicles) v.sync(dt);
    this.W.props.update(dt, focus, []);
    G.fx.update(dt);
    this.finishWorld(dt, focus);
    this.engine.render(dt);
  }
}
