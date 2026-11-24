// Weapons: hitscan with spread, tracers, impacts, damage routing to peds/player/vehicles/props, melee, photo camera
import * as THREE from 'three';
import { G, clamp, rand, bus, _v1, _v2 } from '../core/util.js';
import { GR } from '../core/physics.js';

export const WEAPONS = {
  fists: { name: 'Кулаки', melee: true, dmg: 14, rate: 0.45, range: 1.7, mesh: null },
  pistol: { name: 'Пистолет «Гюрза»', dmg: 30, rate: 0.26, mag: 12, reload: 1.1, spread: 0.012, range: 140, price: 900, ammoPrice: 60, ammoPack: 24, mesh: 'pistol', recoil: 0.018 },
  smg: { name: 'ПП «Вихрь»', dmg: 17, rate: 0.075, mag: 32, reload: 1.6, spread: 0.032, range: 110, price: 2800, ammoPrice: 120, ammoPack: 64, auto: true, mesh: 'smg', recoil: 0.009 },
  shotgun: { name: 'Дробовик «Сайга»', dmg: 16, pellets: 8, rate: 0.85, mag: 8, reload: 2.2, spread: 0.075, range: 45, price: 3600, ammoPrice: 140, ammoPack: 16, mesh: 'shotgun', recoil: 0.05 },
  rifle: { name: 'Автомат «Сокол»', dmg: 32, rate: 0.11, mag: 30, reload: 1.9, spread: 0.014, range: 220, price: 7200, ammoPrice: 200, ammoPack: 60, auto: true, mesh: 'rifle', recoil: 0.012 },
  camera: { name: 'Фотоаппарат', photo: true, rate: 0.6, mesh: 'camera' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'camera'];

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// distance from ray to segment AB (returns {t along ray, dist})
function raySeg(o, d, a, b) {
  const u = d, v = _b.copy(b).sub(a), w = _p.copy(o).sub(a);
  const A = 1, B = u.dot(v), C = v.dot(v), D = u.dot(w), E = v.dot(w);
  const den = A * C - B * B;
  let sc, tc;
  if (den < 1e-6) { sc = 0; tc = B > C ? D / B : E / C; } else { sc = (B * E - C * D) / den; tc = (A * E - B * D) / den; }
  tc = clamp(tc, 0, 1); sc = Math.max(0, (B * tc - D) / A);
  const px = o.x + u.x * sc - (a.x + v.x * tc), py = o.y + u.y * sc - (a.y + v.y * tc), pz = o.z + u.z * sc - (a.z + v.z * tc);
  return { t: sc, d: Math.sqrt(px * px + py * py + pz * pz), h: tc };
}

export function traceShot(o, d, range, shooter) {
  // world (buildings, vehicles, props)
  const exclude = shooter && shooter.car && shooter.car.rb_ ? shooter.car.rb_ : undefined;
  const wh = G.physics.ray(o, d, range, GR.STATIC | GR.VEHICLE | GR.PROP | GR.RAGDOLL, exclude);
  let best = wh ? { t: wh.t, kind: wh.owner ? wh.owner.type : 'world', owner: wh.owner, n: wh.n } : { t: range, kind: 'none' };
  // humans
  const list = G.game.peds.query(o.x + d.x * range * 0.5, o.z + d.z * range * 0.5, range * 0.5 + 2);
  for (const p of list) {
    if (p === shooter || p.dead || !p.h.visible) continue;
    if (p.inCar) continue;
    const base = p.h.ragdoll ? p.h.hipsPos() : p.h.pos;
    _a.set(base.x, base.y + (p.h.ragdoll ? 0 : 0.2), base.z); const top = _v2.set(base.x, base.y + (p.h.ragdoll ? 0.3 : 1.75), base.z);
    const r = raySeg(o, d, _a, top);
    if (r.d < 0.36 && r.t < best.t) best = { t: r.t, kind: 'ped', ped: p, head: r.h > 0.86 };
  }
  const pl = G.player;
  if (shooter !== pl && pl.state === 'foot' && !pl.wasted) {
    _a.set(pl.pos.x, pl.pos.y + 0.2, pl.pos.z); const top = _v2.set(pl.pos.x, pl.pos.y + 1.75, pl.pos.z);
    const r = raySeg(o, d, _a, top);
    if (r.d < 0.4 && r.t < best.t) best = { t: r.t, kind: 'player' };
  }
  best.p = new THREE.Vector3().copy(o).addScaledVector(d, best.t);
  return best;
}

export function fireWeapon(shooter, id, origin, dir, muzzle, accMul = 1) {
  const W = WEAPONS[id];
  const n = W.pellets || 1;
  let hitSomething = false;
  for (let i = 0; i < n; i++) {
    const s = W.spread * accMul * (shooter.isPlayer && shooter.aiming ? 0.5 : 1);
    _d.copy(dir).add(_v1.set(rand(-s, s), rand(-s, s), rand(-s, s))).normalize();
    // trace from camera for player (so crosshair is accurate), from muzzle for NPCs
    const res = traceShot(origin, _d, W.range, shooter);
    applyHit(res, W.dmg, shooter, _d);
    if (res.kind !== 'none') hitSomething = true;
    if (i < 2 && G.fx) G.fx.tracer(muzzle, res.p);
  }
  if (G.fx) G.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, dir);
  if (G.audio) G.audio.gun(id, muzzle.x, muzzle.y, muzzle.z);
  bus.emit('noise', { x: muzzle.x, z: muzzle.z, r: 90, type: 'gunshot', src: shooter });
  if (shooter.isPlayer) bus.emit('crime', 'shot', muzzle.clone());
  return hitSomething;
}

export function applyHit(res, dmg, shooter, dir) {
  const p = res.p;
  switch (res.kind) {
    case 'ped': res.ped.hurt(res.head ? dmg * 2.5 : dmg, shooter, dir); if (G.fx) G.fx.dust(p.x, p.y, p.z, 3, [0.5, 0.45, 0.4]); if (shooter.isPlayer) G.hud.hitmarker(); break;
    case 'player': G.player.damage(dmg * 0.55, shooter, dir); break;
    case 'vehicle': {
      const v = res.owner.v; v.damage(dmg * 1.4, shooter, p);
      if (Math.random() < 0.15 && !v.glassBroken && p.y > v.pos.y) v.breakGlass();
      if (G.fx) G.fx.sparks(p.x, p.y, p.z, 5);
      if (v.rb_) v.rb_.applyImpulseAtPoint({ x: dir.x * dmg * 4, y: 0, z: dir.z * dmg * 4 }, p, true);
      if (v.driver && v.driver.ped && !v.driver.ped.dead && Math.random() < 0.25) v.driver.ped.hurt(dmg * 0.5, shooter, dir);
      if (shooter.isPlayer) G.hud.hitmarker();
      break;
    }
    case 'prop': {
      const pr = res.owner.p; if (pr.body) pr.body.applyImpulseAtPoint({ x: dir.x * 60, y: 20, z: dir.z * 60 }, p, true);
      if (G.fx) G.fx.sparks(p.x, p.y, p.z, 4); break;
    }
    case 'ragdoll': { const h = res.owner.h; if (G.fx) G.fx.dust(p.x, p.y, p.z, 2); break; }
    case 'world': case 'building': if (G.fx) G.fx.impact(p.x, p.y, p.z, false); if (G.audio && Math.random() < 0.3) G.audio.hit(p.x, p.y, p.z, 'light'); break;
  }
}

export class Weapons {
  constructor(game) { this.game = game; }
  melee(attacker) {
    const f = _v1.set(Math.sin(attacker.heading ?? attacker.h.heading), 0, Math.cos(attacker.heading ?? attacker.h.heading));
    const pos = attacker.isPlayer ? attacker.pos : attacker.h.pos;
    G.audio.burst(pos.x, pos.y + 1, pos.z, { dur: 0.08, f0: 1500, f1: 600, vol: 0.2, maxD: 20 });
    setTimeout(() => {
      const list = this.game.peds.query(pos.x, pos.z, 3);
      let hitAny = false;
      for (const p of list) {
        if (p === attacker || p.dead || p.inCar) continue;
        const dx = p.h.pos.x - pos.x, dz = p.h.pos.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 1.8 || (dx * f.x + dz * f.z) / (d || 1) < 0.3) continue;
        p.hurt(WEAPONS.fists.dmg, attacker, f.clone(), true); hitAny = true;
        G.audio.punch(p.h.pos.x, p.h.pos.y + 1.4, p.h.pos.z);
        break;
      }
      if (!attacker.isPlayer && G.player.state === 'foot') {
        const dx = G.player.pos.x - pos.x, dz = G.player.pos.z - pos.z, d = Math.hypot(dx, dz);
        if (d < 1.8 && (dx * f.x + dz * f.z) / (d || 1) > 0.3) { G.player.damage(8, { melee: true }, f); G.audio.punch(G.player.pos.x, 1.4, G.player.pos.z); if (Math.random() < 0.12) G.player.knockdown(f.clone().multiplyScalar(3).add(new THREE.Vector3(0, 1.5, 0))); }
      }
      if (attacker.isPlayer && hitAny) bus.emit('crime', 'assault', pos.clone());
    }, 160);
  }
  photo(pl) {
    G.hud.flash(0.8); G.audio.beep(2400, 0.05, 0.2, 'square');
    bus.emit('photo', this.game.cam.camera.position.clone(), this.game.cam.aimDir().clone());
  }
}
