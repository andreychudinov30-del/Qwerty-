// Player: Alex Morgan — on-foot KCC movement, sprint/jump/punch/aim/shoot, vehicle enter/exit/carjack, damage, death
import * as THREE from 'three';
import { G, clamp, lerp, damp, angDiff, wrapAng, rand, _v1, _v2, bus } from '../core/util.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { Human } from '../entities/human.js';
import { I, has, hit } from '../core/input.js';
import { WEAPONS, WEAPON_ORDER, fireWeapon } from './weapons.js';
import { CURB, WATER_Y } from '../world/citygen.js';

export const ALEX_LOOK = { skin: '#e8b898', hair: '#2a1c12', shirt: '#d8d4cc', pants: '#2a3448', shoes: '#3a2a1a', jacket: '#4a3022', sleeves: 1, hairStyle: 'short', scale: 1.0, beard: true };
export const OUTFITS = [
  { name: 'Кожаная куртка', price: 0, look: { jacket: '#4a3022', shirt: '#d8d4cc', pants: '#2a3448', shoes: '#3a2a1a' } },
  { name: 'Уличный стиль', price: 450, look: { jacket: null, shirt: '#1a1a1a', pants: '#3a3a3a', shoes: '#e8e8e8', sleeves: 0 } },
  { name: 'Деловой костюм', price: 2200, look: { jacket: '#1a1c22', shirt: '#f0f0f0', pants: '#1a1c22', shoes: '#111111' } },
  { name: 'Спортивный', price: 700, look: { jacket: '#1a3a8a', shirt: '#e8e8e8', pants: '#1a3a8a', shoes: '#e8e8e8' } },
  { name: 'Байкер', price: 1600, look: { jacket: '#111111', shirt: '#6a1a1a', pants: '#1a1a1a', shoes: '#1a1a1a' } },
  { name: 'Летний', price: 380, look: { jacket: null, shirt: '#e8a83a', pants: '#c8c0a8', shoes: '#8a5a3a', sleeves: 0 } },
  { name: 'Ночной охотник', price: 3500, look: { jacket: '#1a2a1a', shirt: '#2a2a2a', pants: '#1a1a1a', shoes: '#1a1a1a' } },
  { name: 'Белый смокинг', price: 9000, look: { jacket: '#f0eee8', shirt: '#1a1a1a', pants: '#f0eee8', shoes: '#f0eee8' } },
];

export class Player {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.makeBody(ALEX_LOOK);
    const P = G.physics;
    this.kb = P.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0));
    this.col = P.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(0, 0.85, 0).setCollisionGroups(groups(GR.PLAYER, GR.STATIC | GR.VEHICLE | GR.PROP)), this.kb);
    P.handles.set(this.col.handle, { type: 'player', p: this });
    this.cc = P.world.createCharacterController(0.04);
    this.cc.enableAutostep(0.45, 0.2, true); this.cc.enableSnapToGround(0.4); this.cc.setMaxSlopeClimbAngle(0.9);
    this.cc.setApplyImpulsesToDynamicBodies(true); this.cc.setCharacterMass(80);
    this.pos = new THREE.Vector3(); this.vy = 0; this.grounded = true; this.heading = 0;
    this.state = 'foot'; this.car = null; this.seatT = 0;
    this.health = 100; this.armor = 0; this.stamina = 1;
    this.weapon = 'fists'; this.ammo = {}; this.mag = {};
    this.fireT = 0; this.aiming = false; this.reloadT = 0;
    this.speed = 0; this.invuln = 0; this.lastHitT = -99; this.wasted = false;
    this.footT = 0;
  }
  makeBody(look) {
    if (this.h) { this.h.dispose(); }
    this.look = { ...look };
    this.h = new Human({ scene: G.scene, physics: G.physics }, this.look);
    this.h.isPlayer = true;
  }
  setOutfit(i) {
    const o = OUTFITS[i] || OUTFITS[0];
    const look = { ...ALEX_LOOK, ...o.look };
    const p = this.h.pos.clone(), hd = this.h.heading;
    this.makeBody(look);
    this.h.pos.copy(p); this.h.heading = hd; this.h.root.rotation.y = hd;
    if (this.state === 'car') this.h.pose = 'drive';
    this.h.hold(WEAPONS[this.weapon].mesh);
  }
  teleport(x, y, z, heading = 0) {
    this.pos.set(x, y, z); this.kb.setTranslation({ x, y, z }, true); this.kb.setNextKinematicTranslation({ x, y, z });
    this.heading = heading; this.vy = 0;
    this.h.pos.copy(this.pos); this.h.root.rotation.y = heading; this.h.heading = heading;
  }
  get x() { return this.state === 'car' && this.car ? this.car.pos.x : this.pos.x; }
  get z() { return this.state === 'car' && this.car ? this.car.pos.z : this.pos.z; }
  wpos() { return this.state === 'car' && this.car ? this.car.pos : this.state === 'ragdoll' ? this.h.hipsPos() : this.pos; }
  giveWeapon(id, ammo = 0) {
    const s = G.state; s.weapons[id] = 1; s.ammo[id] = (s.ammo[id] || 0) + ammo;
    if (WEAPONS[id].mag && this.mag[id] == null) this.mag[id] = 0;
    this.reloadIfNeeded(id, true);
  }
  reloadIfNeeded(id = this.weapon, instant = false) {
    const W = WEAPONS[id]; if (!W.mag) return;
    const s = G.state; const need = W.mag - (this.mag[id] || 0);
    const take = Math.min(need, s.ammo[id] || 0);
    if (take <= 0) return;
    if (!instant) { this.reloadT = W.reload || 1.2; }
    this.mag[id] = (this.mag[id] || 0) + take; s.ammo[id] -= take;
  }
  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((w) => G.state.weapons[w]);
    let i = owned.indexOf(this.weapon); i = (i + dir + owned.length) % owned.length;
    this.weapon = owned[i];
    this.h.hold(WEAPONS[this.weapon].mesh);
    G.audio.beep(600, 0.05, 0.08);
  }
  damage(n, src, dir) {
    if (this.invuln > 0 || this.wasted || G.cutscene) return;
    if (this.state === 'car' && src && src.melee) return;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.7); this.armor -= a; n -= a; }
    this.health -= n; this.lastHitT = G.t;
    G.hud && G.hud.damageFlash(Math.min(1, n / 30));
    if (this.health <= 0) { this.health = 0; this.die(); }
  }
  die() {
    if (this.wasted) return;
    this.wasted = true;
    if (this.state === 'car') this.exitCar(true);
    if (this.state !== 'ragdoll') this.h.startRagdoll(new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)), 2);
    this.state = 'ragdoll';
    bus.emit('playerDied');
  }
  knockdown(vel) {
    if (this.state !== 'foot' || this.invuln > 0) return;
    this.h.startRagdoll(vel, 4); this.state = 'ragdoll'; this.ragT = 0;
  }
  respawnAt(x, z, h = 0) {
    if (this.h.ragdoll) this.h.endRagdoll(true);
    this.h.frozen = false;
    this.state = 'foot'; this.wasted = false; this.health = 100; this.invuln = 3;
    this.h.pose = null; this.h.setVisible(true);
    this.teleport(x, CURB + 0.05, z, h);
  }
  nearestCar(r = 4) {
    let best = null, bd = r;
    for (const v of G.vehicles) {
      if (v.dead || v.locked) continue;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) - v.T.L * 0.3;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  enterCar(v) {
    if (!v || v.dead) return;
    const g = this.game;
    if (v.driver && v.driver !== this) { // carjack
      g.traffic.release(v);
      g.peds.ejectDriver(v, this);
      bus.emit('crime', 'carjack', this.pos.clone());
    } else if (v.mode === 'kinematic' || v.mode === 'none') g.traffic.release(v);
    if (v.mode !== 'dynamic') v.makeDynamic();
    v.driver = this; this.car = v; this.state = 'car';
    this.h.pose = 'drive';
    this.h.hold(null);
    this.kb.setTranslation({ x: 0, y: -50, z: 0 }, true);
    this.col.setEnabled(false);
    G.audio.beep(300, 0.08, 0.1, 'square');
    v.owner = v.owner || 'player';
    bus.emit('enteredCar', v);
  }
  exitCar(bail = false) {
    const v = this.car; if (!v) return;
    const right = _v1.set(Math.cos(v.heading), 0, -Math.sin(v.heading)); // car local +x = driver (left) side
    const p = v.pos.clone().addScaledVector(right, v.T.W / 2 + 0.7);
    p.y = Math.max(v.pos.y - v.originH + 0.1, 0.2);
    this.state = 'foot'; this.car = null; v.driver = null; v.throttle = 0; v.brake = 0.3; v.handbrake = 1; v.steer = 0;
    this.col.setEnabled(true);
    this.teleport(p.x, p.y, p.z, v.heading);
    this.h.pose = null;
    this.h.hold(WEAPONS[this.weapon].mesh);
    G.audio.horn(false);
    if (bail && Math.abs(v.speed) > 8) this.knockdown(v.vel.clone().multiplyScalar(0.7).add(_v2.set(0, 2, 0)));
    bus.emit('exitedCar', v);
  }
  update(dt) {
    this.invuln -= dt; this.fireT -= dt; this.reloadT -= dt;
    const h = this.h;
    if (this.state === 'ragdoll') {
      this.ragT = (this.ragT || 0) + dt;
      if (!this.wasted && h.ragdollUpdate(dt)) { h.endRagdoll(true); this.state = 'foot'; this.teleport(h.pos.x, Math.max(0.2, h.pos.y + 0.1), h.pos.z, this.heading); this.invuln = 1; }
      else if (this.wasted) h.ragdollUpdate(dt);
      return;
    }
    if (this.state === 'car') return this.updateCar(dt);
    if (G.cutscene || this.frozen) { h.speed = 0; return; }
    this.updateFoot(dt);
  }
  updateFoot(dt) {
    const h = this.h, cam = this.game.cam;
    const yaw = cam.yaw;
    const mx = I.mx, my = I.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    const aimHeld = has('aim') || (I.touch && I._aimToggle && this.weapon !== 'fists');
    this.aiming = aimHeld && this.weapon !== 'fists';
    const sprint = has('sprint') && this.stamina > 0.05 && !this.aiming;
    const inWater = this.pos.y < WATER_Y + 0.1;
    let sp = mag * (this.aiming ? 2.2 : sprint ? 6.8 : mag > 0.6 ? 4.4 : 1.7);
    if (inWater) sp = mag * 2.2;
    this.stamina = clamp(this.stamina + (sprint && mag > 0.2 ? -dt * 0.09 : dt * 0.15), 0, 1);
    // world move dir from camera yaw
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -Math.cos(yaw), rz = Math.sin(yaw); // camera right
    let mvx = fx * my + rx * mx, mvz = fz * my + rz * mx;
    const ml = Math.hypot(mvx, mvz) || 1; mvx /= ml; mvz /= ml;
    this.speed = damp(this.speed, sp, 10, dt);
    // jump / gravity
    if (this.grounded) { this.vy = -1; if (hit('jump') && !inWater) { this.vy = 5.4; this.grounded = false; } }
    else this.vy -= 15 * dt;
    if (inWater) { this.vy = Math.max(this.vy, 0); if (this.pos.y < WATER_Y - 0.9) this.vy = 1.5; }
    const desired = { x: mvx * this.speed * dt * (mag > 0.05 ? 1 : 0), y: this.vy * dt, z: mvz * this.speed * dt * (mag > 0.05 ? 1 : 0) };
    this.cc.computeColliderMovement(this.col, desired, undefined, groups(0xffff, GR.STATIC | GR.VEHICLE | GR.PROP));
    const m = this.cc.computedMovement();
    const t = this.kb.translation();
    const np = { x: t.x + m.x, y: t.y + m.y, z: t.z + m.z };
    if (np.y < -3 && !inWater) np.y = 0.5;
    this.kb.setNextKinematicTranslation(np);
    this.pos.set(np.x, np.y, np.z);
    this.grounded = this.cc.computedGrounded();
    if (this.grounded) this.vy = Math.min(this.vy, 0);
    // facing
    if (this.aiming || (this.fireT > -0.4 && this.weapon !== 'fists')) this.heading = wrapAng(this.heading + angDiff(this.heading, yaw) * Math.min(1, dt * 18));
    else if (mag > 0.1) this.heading = wrapAng(this.heading + angDiff(this.heading, Math.atan2(mvx, mvz)) * Math.min(1, dt * 10));
    h.pos.copy(this.pos); h.heading = this.heading; h.root.rotation.y = this.heading;
    h.speed = mag > 0.05 ? this.speed : 0;
    h.jumpY = this.grounded ? 0 : 1;
    h.pose = this.aiming ? 'aim' : null;
    if (this.aiming || this.fireT > -0.3) { h.pose = 'aim'; h.aimDir.copy(cam.aimDir()); }
    // footsteps
    if (this.grounded && h.speed > 0.5) { this.footT -= dt * h.speed; if (this.footT < 0) { this.footT = 1.4; G.audio.step(this.pos.x, this.pos.y, this.pos.z, h.speed > 4); } }
    // weapons
    if (hit('nextWeapon')) this.cycleWeapon(1);
    if (hit('prevWeapon')) this.cycleWeapon(-1);
    for (let i = 1; i <= 6; i++) if (hit('w' + i)) { const id = WEAPON_ORDER[i - 1]; if (G.state.weapons[id]) { this.weapon = id; h.hold(WEAPONS[id].mesh); } }
    if (hit('reload')) this.reloadIfNeeded();
    const W = WEAPONS[this.weapon];
    const wantFire = has('attack') && (W.auto || hit('attack'));
    if (wantFire && this.fireT <= 0 && this.reloadT <= 0) {
      if (W.melee) { this.fireT = W.rate; h.punchT = 0.35; this.game.weapons.melee(this); }
      else if (W.photo) { this.fireT = 0.6; this.game.weapons.photo(this); }
      else if ((this.mag[this.weapon] || 0) > 0) {
        this.fireT = W.rate; this.mag[this.weapon]--;
        const o = cam.camera.position.clone(), d = cam.aimDir();
        const muzzle = this.muzzlePos();
        fireWeapon(this, this.weapon, o, d, muzzle);
        cam.kick(W.recoil || 0.01);
        if (this.mag[this.weapon] <= 0) this.reloadIfNeeded();
      } else { this.reloadIfNeeded(); if (this.reloadT <= 0) G.audio.beep(200, 0.05, 0.08); this.fireT = 0.3; }
    }
    // enter vehicle
    if (hit('enter')) { const v = this.nearestCar(4.5); if (v) this.enterCar(v); }
    // drowning protection
    if (inWater && this.pos.y < WATER_Y - 2) this.damage(dt * 10);
  }
  muzzlePos() {
    const hand = this.h.bones.rHand; const p = new THREE.Vector3();
    if (hand) hand.getWorldPosition(p); else p.copy(this.pos).add(_v1.set(0, 1.4, 0));
    return p.addScaledVector(this.game.cam.aimDir(), 0.35);
  }
  updateCar(dt) {
    const v = this.car;
    if (!v) { this.state = 'foot'; return; }
    const h = this.h;
    // seat the avatar (driver on left side)
    const seat = v.localToWorld(0.38, v.T.belt - 1.32, 0.05 - v.T.L * 0.04);
    h.pos.copy(seat); h.root.position.copy(seat);
    h.root.quaternion.copy(v.quat); h.heading = v.heading; h.speed = 0; h.pose = 'drive'; h.steerVis = v.steerAng * 2;
    if (G.cutscene || this.frozen) { v.throttle = 0; v.brake = 1; return; }
    v.throttle = I.my; v.steer = I.mx; v.brake = 0; v.handbrake = has('jump') ? 1 : 0;
    if (has('horn')) { G.audio.horn(true); v.horn = 1; } else { G.audio.horn(false); v.horn = 0; }
    if (hit('siren') && v.T.police) v.siren = !v.siren;
    if (hit('radio')) { const n = G.audio.nextStation(); G.hud.notify('📻 ' + n); }
    if (hit('enter')) this.exitCar(true);
    this.pos.copy(v.pos);
    // flip recovery
    const up = _v1.set(0, 1, 0).applyQuaternion(v.quat);
    if (up.y < 0.2 && Math.abs(v.speed) < 2) { this._flipT = (this._flipT || 0) + dt; if (this._flipT > 2.5) { this._flipT = 0; v.rb_.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.heading), true); v.rb_.setTranslation({ x: v.pos.x, y: v.pos.y + 1.2, z: v.pos.z }, true); } } else this._flipT = 0;
    if (v.dead && v.exploded) { this.exitCar(); this.damage(200); }
  }
  // called each frame after physics to sync the visual
  post(dt) {
    if (this.state === 'car') {
      const v = this.car; if (!v) return;
      const seat = v.localToWorld(0.38, v.T.belt - 1.32, 0.05 - v.T.L * 0.04);
      this.h.root.position.copy(seat); this.h.root.quaternion.copy(v.quat);
    } else if (this.state === 'foot') this.h.root.quaternion.setFromAxisAngle(_v1.set(0, 1, 0), this.heading);
  }
}
