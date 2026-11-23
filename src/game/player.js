// First-person survivor: Rapier character controller with inertia, crouch, sprint/stamina, vaulting, footsteps,
// noise emission, flashlight (cookie + shadows + volumetric beam), viewmodel hands, health/fear, hiding.
import * as THREE from 'three';
import { input, consumeLook } from '../core/input.js';
import { audio } from '../core/audio.js';
import { getProfile } from '../core/save.js';
import { clamp, damp, lerp } from '../core/util.js';
import { flashlightCookie, makeBeam, Dust } from './fx.js';
import { loadModel } from '../core/assets.js';

const STAND_H = 0.55, CROUCH_H = 0.25, RADIUS = 0.3;
const SURFACE = { station_floor: 'tile', lab_floor: 'tile', gravel: 'gravel', concrete_floor: 'concrete', depot_floor: 'concrete', cave_floor: 'gravel', rock: 'gravel', edge: 'concrete' };

export class Player {
  constructor(game) {
    this.game = game;
    const s = getProfile().settings;
    this.camera = new THREE.PerspectiveCamera(s.fov || 72, innerWidth / innerHeight, 0.05, 140);
    this.camera.rotation.order = 'YXZ';
    this.yaw = 0; this.pitch = 0; this.lookVel = new THREE.Vector2();
    this.vel = new THREE.Vector3(); this.vy = 0;
    this.health = 100; this.stamina = 100; this.battery = 100; this.fear = 0; this.noise = 0;
    this.crouching = false; this.crouchT = 0; this.running = false;
    this.inventory = {}; // id -> count
    this.hasFlashlight = true; this.flashOn = false;
    this.alive = true; this.hidden = null; this.vaulting = null; this.frozen = false;
    this.stepDist = 0; this.bobT = 0; this.shake = 0; this.damageFx = 0;
    this.lastSafe = new THREE.Vector3();
    this.inWater = false;
    this.drainRate = 0.42; // % per second
    this._buildFlashlight();
  }

  _buildFlashlight() {
    const q = this.game.engine.quality;
    const L = new THREE.SpotLight(0xfff1dc, 0, 34, 0.44, 0.55, 1.6);
    L.map = flashlightCookie();
    L.castShadow = q.shadows > 0;
    L.shadow.mapSize.set(q.shadowSize || 512, q.shadowSize || 512);
    L.shadow.camera.near = 0.15; L.shadow.camera.far = 34;
    L.shadow.bias = -0.0006; L.shadow.normalBias = 0.02;
    this.flash = L;
    this.flashTarget = new THREE.Object3D();
    this.camera.add(L); this.camera.add(this.flashTarget);
    L.position.set(0.18, -0.16, 0.05);
    this.flashTarget.position.set(0, 0, -6);
    L.target = this.flashTarget;
    this.beam = makeBeam(9, 3.4, 0xfff0dc, q.volumetric ? 0.085 : 0);
    this.beam.visible = q.volumetric;
    this.camera.add(this.beam);
    this.beam.position.copy(L.position);
    this.dust = new Dust(Math.floor(700 * (q.particles || 1)));
    // weak fill light so the immediate surroundings are never pitch black around the player
    this.fill = new THREE.PointLight(0xa8b8c8, 2.6, 10, 2);
    this.camera.add(this.fill);
    this.fill.position.set(0, 0.3, 0.2);
    this._buildViewmodel();
  }

  async _buildViewmodel() {
    const vm = new THREE.Group();
    this.viewmodel = vm;
    this.camera.add(vm);
    vm.position.set(0.2, -0.22, -0.38);
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b2e26, roughness: 0.95 });
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.035, 0.085), glove); palm.position.set(0, -0.03, 0.02); hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.035, 3, 6), glove);
      f.rotation.z = Math.PI / 2; f.position.set(-0.012, -0.004 - 0.0, 0.05 - i * 0.022); f.rotation.y = 0.2;
      f.position.x = 0.03; f.position.y = 0.0; hand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.03, 3, 6), glove); thumb.position.set(-0.03, 0.01, 0.04); thumb.rotation.x = 0.8; hand.add(thumb);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.32, 10), sleeve); arm.rotation.x = Math.PI / 2; arm.position.set(0.01, -0.035, 0.2); hand.add(arm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })); cuff.rotation.x = Math.PI / 2; cuff.position.set(0.01, -0.035, 0.06); hand.add(cuff);
    vm.add(hand);
    this.hand = hand;
    // flashlight model (Poly Haven vintage_flashlight, CC0)
    const gltf = await loadModel('vintage_flashlight');
    let torch;
    if (gltf) {
      torch = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(torch); const size = box.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z);
      torch.scale.setScalar(0.2 / longest);
      // align longest axis with -Z
      if (size.x === longest) torch.rotation.y = Math.PI / 2; else if (size.y === longest) torch.rotation.x = -Math.PI / 2;
      const b2 = new THREE.Box3().setFromObject(torch); const c = b2.getCenter(new THREE.Vector3());
      torch.position.sub(c);
    } else {
      torch = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.4 }));
      torch.rotation.x = Math.PI / 2;
    }
    const holder = new THREE.Group(); holder.add(torch); holder.position.set(0.0, -0.005, -0.03);
    torch.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    vm.add(holder);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    lens.position.set(0, -0.005, -0.135); lens.rotation.y = Math.PI;
    vm.add(lens);
    this.lens = lens;
    vm.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.flashlightModel = holder;
  }

  spawn(pos, yaw = 0) {
    const ph = this.game.physics;
    if (this.char) { ph.world.removeCharacterController(this.char.cc); ph.world.removeRigidBody(this.char.body); }
    this.char = ph.createCharacter({ x: pos.x, y: pos.y + STAND_H + RADIUS + 0.05, z: pos.z }, RADIUS, STAND_H);
    this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); this.vy = 0;
    this.crouching = false; this.crouchT = 0;
    this.lastSafe.copy(pos);
    this.updateCamera(0);
  }

  get position() { const t = this.char.body.translation(); return new THREE.Vector3(t.x, t.y, t.z); }
  get feet() { const t = this.char.body.translation(); return new THREE.Vector3(t.x, t.y - this.halfH() - RADIUS, t.z); }
  halfH() { return this.crouching ? CROUCH_H : STAND_H; }
  eyeHeight() { return lerp(1.62, 1.0, this.crouchT); }

  setFlashlight(on, silent = false) {
    if (!this.hasFlashlight) { if (on && !silent) this.game.hud?.toast('Фонарь разбит — его нет', 'warn'); on = false; }
    if (on && this.battery <= 0) { if (!silent) audio.play('click', { bus: 'ui', volume: 0.6 }); return; }
    if (on === this.flashOn) return;
    this.flashOn = on;
    if (!silent) audio.play('click', { bus: 'ui', volume: 0.7 });
    this.game.emitNoise(this.position, 1.5, 'click');
  }

  damage(amount, from) {
    if (!this.alive || this.game.godMode) return;
    this.health -= amount;
    this.damageFx = Math.min(1, this.damageFx + amount / 40);
    this.shake = Math.min(1.2, this.shake + amount / 30);
    audio.play('hit', { bus: 'sfx', volume: 0.8 });
    if (from) { const d = this.position.sub(from).setY(0).normalize(); this.vel.addScaledVector(d, 4); }
    if (getProfile().settings.vibration && navigator.vibrate) navigator.vibrate(80);
    if (this.health <= 0) { this.health = 0; this.alive = false; this.game.onPlayerDeath(); }
  }
  heal(n) { this.health = Math.min(100, this.health + n); }

  addItem(id, n = 1) { this.inventory[id] = (this.inventory[id] || 0) + n; }
  hasItem(id, n = 1) { return (this.inventory[id] || 0) >= n; }
  useItem(id, n = 1) { if (!this.hasItem(id, n)) return false; this.inventory[id] -= n; if (this.inventory[id] <= 0) delete this.inventory[id]; return true; }

  update(dt) {
    if (!this.char) return;
    const g = this.game;
    const s = getProfile().settings;
    // ---- look ----
    const look = consumeLook();
    if (!this.frozen && !g.cutscene) {
      this.yaw -= look.x * 0.0022;
      this.pitch = clamp(this.pitch - look.y * 0.0022, -1.45, 1.45);
    }
    // ---- hiding in locker ----
    if (this.hidden) { this.updateHidden(dt); return; }
    // ---- crouch ----
    const wantCrouch = input.crouch;
    if (wantCrouch !== this.crouching) {
      if (!wantCrouch) {
        // check headroom before standing
        const p = this.char.body.translation();
        const hit = g.physics.raycast({ x: p.x, y: p.y + CROUCH_H + RADIUS, z: p.z }, { x: 0, y: 1, z: 0 }, (STAND_H - CROUCH_H) * 2 + 0.1, this.char.col);
        if (!hit) { this.crouching = false; this.char.col.setHalfHeight(STAND_H); const t = this.char.body.translation(); this.char.body.setTranslation({ x: t.x, y: t.y + (STAND_H - CROUCH_H), z: t.z }, true); }
        else input.crouch = true;
      } else { this.crouching = true; this.char.col.setHalfHeight(CROUCH_H); const t = this.char.body.translation(); this.char.body.setTranslation({ x: t.x, y: t.y - (STAND_H - CROUCH_H), z: t.z }, true); }
    }
    this.crouchT = damp(this.crouchT, this.crouching ? 1 : 0, 10, dt);
    // ---- vault ----
    if (this.vaulting) { this.updateVault(dt); this.updateCamera(dt); return; }
    if (input.pressed.has('jump') && !this.frozen) this.tryVault();
    // ---- movement ----
    const pos = this.char.body.translation();
    const feetY = pos.y - this.halfH() - RADIUS;
    const wl = g.level.waterAt(pos.x, pos.z);
    this.inWater = wl !== null && wl > feetY + 0.12;
    const injured = this.health < 35;
    let mx = this.frozen || g.cutscene ? 0 : input.move.x, my = this.frozen || g.cutscene ? 0 : input.move.y;
    const moving = Math.hypot(mx, my) > 0.05;
    const canRun = this.stamina > (this.running ? 0 : 15) && !this.crouching && my > 0.2;
    this.running = input.run && moving && canRun;
    let speed = this.crouching ? 1.25 : this.running ? 4.7 : 2.35;
    if (this.inWater) speed *= 0.62;
    if (injured) speed *= 0.82;
    if (this.slowMul) speed *= this.slowMul;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const desired = fwd.multiplyScalar(my * speed).add(right.multiplyScalar(mx * speed));
    const accel = moving ? (this.running ? 7 : 10) : 12;
    this.vel.x = damp(this.vel.x, desired.x, accel, dt);
    this.vel.z = damp(this.vel.z, desired.z, accel, dt);
    // stamina
    if (this.running) { this.stamina = Math.max(0, this.stamina - 16 * dt); this.staminaCd = 1.2; }
    else { this.staminaCd = (this.staminaCd || 0) - dt; if (this.staminaCd <= 0) this.stamina = Math.min(100, this.stamina + (moving ? 9 : 16) * dt); }
    // gravity
    const grounded = this.char.cc.computedGrounded();
    if (grounded && this.vy < 0) this.vy = -1; else this.vy -= 18 * dt;
    if (this.vy < -30) this.vy = -30;
    const move = { x: this.vel.x * dt, y: this.vy * dt, z: this.vel.z * dt };
    this.char.cc.computeColliderMovement(this.char.col, move);
    const m = this.char.cc.computedMovement();
    const np = { x: pos.x + m.x, y: pos.y + m.y, z: pos.z + m.z };
    this.char.body.setNextKinematicTranslation(np);
    // landing
    if (!this._wasGrounded && grounded && this.fallSpeed > 6) {
      audio.play('step_' + this.surface(), { pos: this.feet, volume: 1, variant: 0 });
      g.emitNoise(this.feet, 8, 'land');
      if (this.fallSpeed > 11) this.damage((this.fallSpeed - 11) * 8);
    }
    this.fallSpeed = grounded ? 0 : Math.max(this.fallSpeed || 0, -this.vy);
    this._wasGrounded = grounded;
    if (np.y < -20) { this.char.body.setTranslation({ x: this.lastSafe.x, y: this.lastSafe.y + 1.2, z: this.lastSafe.z }, true); this.vy = 0; }
    if (grounded && !this.inWater) this.lastSafe.set(np.x, np.y - this.halfH() - RADIUS, np.z);
    // ---- footsteps & noise ----
    const hv = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.speed = hv;
    if (grounded && hv > 0.3) {
      this.stepDist += hv * dt;
      const stride = this.running ? 0.95 : this.crouching ? 0.55 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const surf = this.inWater ? 'water' : this.surface();
        const vol = this.crouching ? 0.25 : this.running ? 1.0 : 0.55;
        audio.play('step_' + surf, { pos: this.feet, volume: vol, variant: Math.floor(Math.random() * 3), jitter: 0.12, reverb: 0.3 });
        const radius = (this.crouching ? 2.2 : this.running ? 15 : 6.5) * (this.inWater ? 1.6 : 1) * (surf === 'metal' ? 1.5 : 1);
        g.emitNoise(this.feet, radius, 'step');
        this.noise = Math.max(this.noise, radius / 15);
      }
      this.bobT += hv * dt * (this.running ? 1.25 : 1.6);
    }
    this.noise = Math.max(0, this.noise - dt * 0.8);
    // ---- flashlight ----
    if (input.pressed.has('flashlight') && !this.frozen) this.setFlashlight(!this.flashOn);
    if (this.flashOn) { this.battery = Math.max(0, this.battery - this.drainRate * dt * (g.mission?.env?.batteryDrain ?? 1)); if (this.battery <= 0) { this.setFlashlight(false, true); g.hud?.toast('Фонарь разрядился', 'warn'); } }
    if (input.pressed.has('reload')) {
      if (!this.hasFlashlight) g.hud?.toast('Фонаря нет', 'warn');
      else if (this.battery >= 95) g.hud?.toast('Фонарь заряжен');
      else if (this.useItem('battery')) { this.battery = 100; audio.play('click', { bus: 'ui' }); g.hud?.toast('Батарейка заменена'); }
      else g.hud?.toast('Нет запасных батареек', 'warn');
    }
    // ---- medkit ----
    if (input.pressed.has('item') && this.health < 100) { if (this.useItem('medkit')) { this.heal(55); audio.play('heal', { bus: 'ui' }); g.hud?.toast('Аптечка использована (+55)'); } else g.hud?.toast('Нет аптечки', 'warn'); }
    this.updateCamera(dt);
    this.updateFlashlight(dt);
    // fear & effects decay
    this.damageFx = Math.max(0, this.damageFx - dt * 0.6);
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  surface() {
    const p = this.char.body.translation();
    const z = this.game.level.zoneAt(p.x, p.z);
    if (!z) return 'concrete';
    return SURFACE[z.floorMat] || 'concrete';
  }

  tryVault() {
    const g = this.game, ph = g.physics;
    const feet = this.feet;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const knee = ph.raycast({ x: feet.x, y: feet.y + 0.45, z: feet.z }, fwd, 1.0, this.char.col);
    if (!knee) return false;
    const top = new THREE.Vector3(feet.x + fwd.x * (knee.toi + 0.45), feet.y + 1.6, feet.z + fwd.z * (knee.toi + 0.45));
    const head = ph.raycast({ x: feet.x, y: feet.y + 1.5, z: feet.z }, fwd, knee.toi + 0.5, this.char.col);
    if (head) return false;
    const down = ph.raycast(top, { x: 0, y: -1, z: 0 }, 1.7, this.char.col);
    if (!down) return false;
    const h = top.y - down.toi - feet.y;
    if (h < 0.3 || h > 1.35) return false;
    const from = this.char.body.translation();
    this.vaulting = { t: 0, dur: 0.55 + h * 0.2, from: new THREE.Vector3(from.x, from.y, from.z), to: new THREE.Vector3(top.x, top.y - down.toi + this.halfH() + RADIUS + 0.06, top.z), h };
    audio.play('step_concrete', { pos: feet, volume: 0.6 });
    g.emitNoise(feet, 6, 'vault');
    return true;
  }
  updateVault(dt) {
    const v = this.vaulting;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    const up = Math.min(1, k / 0.55), fw = Math.max(0, (k - 0.35) / 0.65);
    const p = new THREE.Vector3(lerp(v.from.x, v.to.x, fw), lerp(v.from.y, v.to.y + 0.05, Math.sin(up * Math.PI / 2)), lerp(v.from.z, v.to.z, fw));
    this.char.body.setNextKinematicTranslation(p);
    this.pitchKick = Math.sin(k * Math.PI) * 0.12;
    if (k >= 1) { this.vaulting = null; this.vy = 0; this.pitchKick = 0; }
  }

  hideIn(locker) {
    this.hidden = locker;
    this.hiddenT = 0;
    this.setFlashlight(false, true);
    audio.play('creak', { pos: locker.pos, volume: 0.5, rate: 1.4 });
  }
  updateHidden(dt) {
    const L = this.hidden;
    this.hiddenT += dt;
    const p = L.eye;
    this.camera.position.lerp(p, Math.min(1, dt * 8));
    this.yaw = L.yaw + clamp(this.yaw - L.yaw, -0.5, 0.5);
    this.pitch = clamp(this.pitch, -0.3, 0.3);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.viewmodel) this.viewmodel.visible = false;
    this.flash.intensity = 0; this.beam.visible = false;
    if (input.pressed.has('interact') && this.hiddenT > 0.6) this.leaveHiding();
    this.noise = 0;
  }
  leaveHiding() {
    const L = this.hidden;
    this.hidden = null;
    if (this.viewmodel) this.viewmodel.visible = true;
    this.char.body.setTranslation({ x: L.exit.x, y: L.exit.y + STAND_H + RADIUS + 0.05, z: L.exit.z }, true);
    audio.play('creak', { pos: L.pos, volume: 0.6, rate: 1.2 });
    this.game.emitNoise(L.pos, 5, 'locker');
  }

  updateCamera(dt) {
    const t = this.char.body.translation();
    const s = getProfile().settings;
    const bobAmt = s.headBob ? (this.running ? 0.055 : 0.03) * Math.min(1, (this.speed || 0) / 2) : 0;
    const bobY = Math.sin(this.bobT * Math.PI) * bobAmt;
    const bobX = Math.cos(this.bobT * Math.PI * 0.5) * bobAmt * 0.6;
    const eye = t.y - this.halfH() - RADIUS + this.eyeHeight();
    const sh = this.shake * this.shake;
    this.camera.position.set(t.x + bobX * Math.cos(this.yaw) + (Math.random() - 0.5) * sh * 0.06, eye + bobY + (Math.random() - 0.5) * sh * 0.05, t.z - bobX * Math.sin(this.yaw));
    const roll = (this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)) * -0.006 + (Math.random() - 0.5) * sh * 0.03;
    this.camera.rotation.set(this.pitch + (this.pitchKick || 0) + (Math.random() - 0.5) * sh * 0.02, this.yaw, roll);
    const targetFov = (s.fov || 72) + (this.running ? 5 : 0) + this.fear * 3;
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt);
    this.camera.updateProjectionMatrix();
    // viewmodel sway
    if (this.viewmodel) {
      const vm = this.viewmodel;
      const sway = this.lookVel;
      vm.position.x = damp(vm.position.x, 0.2 + Math.cos(this.bobT * Math.PI * 0.5) * bobAmt * 0.4, 10, dt);
      vm.position.y = damp(vm.position.y, -0.22 + Math.sin(this.bobT * Math.PI) * bobAmt * 0.5 - this.crouchT * 0.02 - (this.running ? 0.03 : 0), 10, dt);
      vm.rotation.y = damp(vm.rotation.y, this.running ? 0.25 : 0.03, 6, dt);
      vm.rotation.x = damp(vm.rotation.x, this.running ? -0.15 : 0, 6, dt);
      void sway;
    }
  }

  updateFlashlight(dt) {
    const g = this.game;
    let target = 0;
    if (this.flashOn) {
      target = 140;
      if (this.battery < 15) { // dying battery flicker
        const f = Math.sin(performance.now() * 0.02) * Math.sin(performance.now() * 0.0073);
        target *= this.battery / 15 * (f > 0.6 ? 0.15 : 1);
      }
      if (g.flashFlicker > 0) { g.flashFlicker -= dt; if (Math.random() < 0.5) target *= 0.05; }
    }
    this.flash.intensity = damp(this.flash.intensity, target, 25, dt);
    const on = this.flash.intensity > 2;
    this.beam.visible = on && g.engine.quality.volumetric;
    if (this.beam.visible) { this.beam.material.uniforms.uStrength.value = 0.085 * (this.flash.intensity / 140); this.beam.material.uniforms.uTime.value += dt; }
    if (this.lens) this.lens.material.color.setScalar(on ? 4 * (this.flash.intensity / 140) : 0);
    // dust
    const lp = new THREE.Vector3(); this.flash.getWorldPosition(lp);
    const ld = new THREE.Vector3(); this.camera.getWorldDirection(ld);
    this.dust.update(dt, this.camera, lp, ld, on ? Math.min(1, this.flash.intensity / 100) : 0, this.flash.angle * 0.95, innerHeight * 0.6);
    // fill light is very weak; slightly stronger when flashlight is off so the player isn't blind
    this.fill.intensity = this.flashOn ? 1.4 : 2.6;
  }

  flashlightRay() {
    const o = new THREE.Vector3(); this.camera.getWorldPosition(o);
    const d = new THREE.Vector3(); this.camera.getWorldDirection(d);
    return { origin: o, dir: d, on: this.flash.intensity > 20, angle: this.flash.angle, range: 18 * (this.flash.intensity / 140) };
  }

  // is world point inside the flashlight cone (and in range)?
  lights(point) {
    if (!this.flashOn || this.flash.intensity < 20) return 0;
    const r = this.flashlightRay();
    const to = point.clone().sub(r.origin);
    const d = to.length();
    if (d > r.range) return 0;
    const c = to.normalize().dot(r.dir);
    if (c < Math.cos(r.angle * 1.05)) return 0;
    return (1 - d / r.range) * Math.min(1, (c - Math.cos(r.angle)) / 0.1 + 0.3);
  }

  dispose() {
    if (this.char) { try { this.game.physics.world.removeCharacterController(this.char.cc); } catch (e) { /* ignore */ } }
    this.flash.map?.dispose();
    this.flash.dispose?.();
  }
}
