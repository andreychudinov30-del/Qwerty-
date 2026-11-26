import * as THREE from 'three';
import { Flight } from './flight.js';
import { buildAircraft, buildBomber, missileGeometry } from './aircraft.js';
import { clamp, rand } from './util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3();
const BOMBER_STATS = { speed: 420, thrust: 0.7, pitch: 0.5, roll: 1.0, yaw: 0.2, hp: 300, missiles: 0, ammo: 0, stealth: 0, armor: 1 };
let missileMat = null;

export class Plane {
  constructor(game, spec, team, o = {}) {
    this.game = game; this.spec = spec; this.team = team; this.isPlayer = !!o.isPlayer; this.name = o.name || spec.name; this.bomber = !!o.bomber;
    this.stats = this.bomber ? BOMBER_STATS : spec.stats;
    this.flight = new Flight(this.stats); this.flight.assist = !!o.assist;
    this.root = new THREE.Group();
    if (this.bomber) { this.model = buildBomber(); this.root.add(this.model.root); this.models = [this.model]; }
    else {
      const hi = buildAircraft(spec, { livery: o.livery, number: o.number });
      this.model = hi;
      if (this.isPlayer) { this.root.add(hi.root); this.models = [hi]; }
      else {
        const lo = buildAircraft(spec, { livery: o.livery, detail: 'lo' });
        const lod = new THREE.LOD(); lod.addLevel(hi.root, 0); lod.addLevel(lo.root, 260 * game.Q.lod); this.root.add(lod); this.models = [hi, lo]; this.lod = lod;
      }
    }
    game.scene.add(this.root);
    const armor = this.stats.armor || 1; this.armor = armor * (o.hpMul || 1);
    this.maxHp = this.bomber ? 260 : 100; this.hp = this.maxHp;
    this.missiles = this.stats.missiles; this.ammo = (this.stats.ammo || 150) * 4; this.flares = this.bomber ? 0 : 30;
    this.ctrl = { pitch: 0, roll: 0, yaw: 0, throttle: 0.75, ab: false, gun: false, missile: false, flare: false, brake: false };
    this.alive = true; this.dying = 0; this.target = null; this.lockT = 0; this.locked = false; this.incoming = [];
    this.gunCd = 0; this.misCd = 0; this.flareCd = 0; this.lastHitBy = null; this.kills = 0; this.ai = null; this.engineDmg = 0;
    this.smokeT = 0; this.t = Math.random() * 10; this.radius = this.bomber ? 24 : spec.geo.L * 0.42;
    this.stealth = this.stats.stealth || 0; this.ace = !!o.ace;
    if (!this.bomber && game.Q.particles > 0.3) {
      this.vortex = [game.fx.trail(50, 0.2, 0xffffff, 0.32, 0.9), game.fx.trail(50, 0.2, 0xffffff, 0.32, 0.9)];
      this.contrail = [];
    }
  }
  get pos() { return this.flight.pos; }
  get vel() { return this.flight.vel; }
  get fwd() { return this.flight.f; }
  place(p, dir, speed) { this.flight.place(p, dir, speed); this.sync(); }
  sync() { this.root.position.copy(this.flight.pos); this.root.quaternion.copy(this.flight.q); }
  local(v, out) { return out.copy(v).applyQuaternion(this.flight.q).add(this.flight.pos); }
  update(dt) {
    const g = this.game; this.t += dt;
    if (this.alive) {
      this.flight.engine = 1 - this.engineDmg * 0.5;
      this.flight.step(dt, this.ctrl);
      this.sync();
      const c = this.ctrl, f = this.flight;
      if (this.model.setControls) for (const m of this.models) m.setControls(c.pitch, c.roll, c.yaw, clamp((120 - f.speed) / 60, 0, 1), f.thr, f.ab, this.t, this.stats.tvc);
      // vortices
      if (this.vortex) {
        const s = clamp((f.G - 4.5) / 3, 0, 1) * (f.speed > 120 ? 1 : 0) + clamp((f.aoa - 0.25) * 3, 0, 1) * 0.5;
        const wt = this.model.wingTip;
        for (let i = 0; i < 2; i++) { tv.set(wt.x * (i ? -1 : 1), wt.y, wt.z); this.local(tv, tv2); this.vortex[i].add(tv2, Math.min(1, s)); }
      }
      // contrails at altitude
      if (f.pos.y > 7500 && !this.bomber && (this.t % 0.05) < dt) {
        for (const n of this.model.nozzles) { n.grp.getWorldPosition(tv); g.fx.smokePuff(tv, tv2.set(0, 0, 0), 5, 0.95, 0.35, 6); }
      }
      // damage smoke / fire
      this.smokeT -= dt;
      const hpF = this.hp / this.maxHp;
      if (hpF < 0.6 && this.smokeT <= 0) {
        this.smokeT = 0.045;
        tv.set(0, 0, -this.model.length * 0.35); this.local(tv, tv2);
        g.fx.smokePuff(tv2, tv3.copy(f.vel).multiplyScalar(0.1), 7 + (1 - hpF) * 9, hpF < 0.3 ? 0.12 : 0.35, 0.7, 3.5);
        if (hpF < 0.3) g.fx.firePuff(tv2, tv3.copy(f.vel).multiplyScalar(0.3), 3.5, 0.4);
      }
      this.gunCd -= dt; this.misCd -= dt; this.flareCd -= dt;
    } else if (this.dying > 0) {
      this.dying -= dt;
      const f = this.flight;
      f.vel.y -= 9.81 * dt * 1.3; f.vel.multiplyScalar(Math.exp(-dt * 0.3)); f.pos.addScaledVector(f.vel, dt);
      tv.set(this.spinX, 0, this.spinZ).multiplyScalar(dt); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tv.x, 0, tv.z)); f.q.multiply(q);
      this.sync();
      if ((this.t += dt) % 0.03 < dt) { g.fx.firePuff(f.pos, tv3.set(0, 2, 0), 6, 0.6); g.fx.smokePuff(f.pos, tv3.set(0, 3, 0), 16, 0.1, 0.8, 7); }
      const gh = g.terrain.groundAt(f.pos.x, f.pos.z);
      if (f.pos.y < gh + 2 || this.dying <= 0) { this.dying = 0; this.root.visible = false; if (f.pos.y < gh + 5) { if (gh <= 0.5 && g.terrain.water) g.fx.splash(f.pos); else g.fx.groundExplosion(tv.set(f.pos.x, gh, f.pos.z), 1.2); g.audio && g.audio.explosion(f.pos, 1); } }
    }
  }
  damage(amount, by, kind) {
    if (!this.alive) return;
    if (this.game.invuln && this.isPlayer) return;
    this.hp -= amount / this.armor; this.lastHitBy = by;
    if (Math.random() < amount / 200) this.engineDmg = Math.min(1, this.engineDmg + 0.3);
    if (this.isPlayer) this.game.onPlayerHit(amount);
    if (this.hp <= 0) this.kill(by, kind);
  }
  kill(by, kind) {
    if (!this.alive) return;
    this.alive = false; this.dying = 12; this.hp = 0;
    this.spinX = rand(-1.5, 1.5); this.spinZ = rand(-4, 4);
    const g = this.game; g.fx.explosion(this.pos, this.bomber ? 2 : 1.2, this.vel); g.audio && g.audio.explosion(this.pos, 1.2);
    for (const m of this.models) for (const n of m.nozzles || []) if (n.flame) n.flame.visible = false;
    if (this.vortex) for (const v of this.vortex) v.emitting = false;
    g.onKill(this, by, kind);
  }
  dispose() { this.game.scene.remove(this.root); for (const m of this.models) m.dispose && m.dispose(); if (this.vortex) for (const v of this.vortex) v.emitting = false; }
}

export class Weapons {
  constructor(game) {
    this.g = game; this.bullets = []; this.missiles = []; this.flares = [];
    if (!missileMat) missileMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.45, metalness: 0.15, vertexColors: true });
  }
  fireGun(pl, dt) {
    if (pl.ammo <= 0) return false;
    if (pl.gunCd > 0) return false;
    const rate = 1 / 28; pl.gunCd += rate; if (pl.gunCd < -rate) pl.gunCd = 0;
    pl.ammo--;
    const f = pl.flight; const gp = pl.model.gunPos;
    pl.local(gp, tv);
    const spread = pl.isPlayer ? 0.0035 : 0.006 + (1 - (pl.ai ? pl.ai.skill : 1)) * 0.01;
    const dir = tv2.copy(f.f); dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread); dir.normalize();
    const v = dir.clone().multiplyScalar(1050).add(f.vel);
    this.bullets.push({ p: tv.clone(), v, life: 1.6, owner: pl, team: pl.team });
    if (this.bullets.length % 2 === 0 || pl.isPlayer) this.g.fx.tracer(tv, v, 0.8);
    if (Math.random() < 0.5) this.g.fx.muzzle(tv, f.f);
    if (pl.isPlayer) this.g.stats.shots++;
    return true;
  }
  fireMissile(pl, target) {
    if (pl.missiles <= 0 || pl.misCd > 0) return false;
    pl.missiles--; pl.misCd = pl.isPlayer ? 0.6 : 2.5;
    const f = pl.flight;
    let start = tv.set(0, -1.2, 0); const vis = pl.model.missiles || [];
    const idx = vis.findIndex(m => m.visible);
    if (idx >= 0) { start = vis[idx].position.clone(); vis[idx].visible = false; }
    const p = pl.local(start, new THREE.Vector3());
    const mesh = new THREE.Mesh(missileGeometry(), missileMat); mesh.position.copy(p); this.g.scene.add(mesh);
    const trail = this.g.fx.trail(120, 1.2, 0xe8e8e8, 0.55, 3.5);
    const m = { p, v: f.vel.clone().addScaledVector(f.f, 15).addScaledVector(f.up, -6), target, owner: pl, team: pl.team, life: 11, t: 0, mesh, trail, sam: false };
    this.missiles.push(m);
    if (target) target.incoming.push(m);
    if (pl.isPlayer) this.g.stats.missiles++;
    this.g.audio && this.g.audio.missileLaunch(p, pl.isPlayer);
    return true;
  }
  launchSAM(from, target) {
    const p = from.clone(); p.y += 6;
    const mesh = new THREE.Mesh(missileGeometry(), missileMat); mesh.scale.setScalar(1.6); mesh.position.copy(p); this.g.scene.add(mesh);
    const trail = this.g.fx.trail(160, 2.2, 0xdddddd, 0.6, 5);
    const m = { p, v: new THREE.Vector3(0, 120, 0), target, owner: null, team: 1 - target.team, life: 16, t: 0, mesh, trail, sam: true };
    this.missiles.push(m); target.incoming.push(m);
    this.g.audio && this.g.audio.missileLaunch(p, false);
  }
  dropFlares(pl) {
    if (pl.flares <= 0 || pl.flareCd > 0) return;
    pl.flareCd = 2.2; const n = Math.min(4, pl.flares); pl.flares -= n;
    for (let i = 0; i < n; i++) {
      const v = pl.vel.clone().multiplyScalar(0.55).add(new THREE.Vector3(rand(-25, 25), rand(-30, 5), rand(-25, 25))).addScaledVector(pl.flight.up, -20);
      const fl = { p: pl.pos.clone(), v, life: 4.2, team: pl.team, owner: pl, t: i * 0.12 };
      this.flares.push(fl);
    }
    // decoy incoming missiles
    for (const m of pl.incoming) if (m.target === pl && !m.sam && Math.random() < 0.62) m.decoyAt = 0.25 + Math.random() * 0.5;
    for (const m of pl.incoming) if (m.target === pl && m.sam && Math.random() < 0.35) m.decoyAt = 0.3;
    this.g.audio && this.g.audio.flare(pl.isPlayer);
  }
  update(dt) {
    const g = this.g, fx = g.fx, planes = g.planes;
    // bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; b.life -= dt;
      const ox = b.p.x, oy = b.p.y, oz = b.p.z;
      b.v.y -= 9.81 * dt; b.p.addScaledVector(b.v, dt);
      let hit = false;
      for (const pl of planes) {
        if (!pl.alive || pl.team === b.team) continue;
        // segment-sphere
        tv.set(ox, oy, oz); tv2.subVectors(b.p, tv); const len2 = tv2.lengthSq();
        tv3.subVectors(pl.pos, tv); let t = clamp(tv3.dot(tv2) / len2, 0, 1);
        tv.addScaledVector(tv2, t);
        const r = pl.radius * 0.75;
        if (tv.distanceToSquared(pl.pos) < r * r) {
          pl.damage(pl.bomber ? 2.2 : 3.4, b.owner, 'gun'); fx.sparks(tv, 4); hit = true;
          if (b.owner && b.owner.isPlayer) { g.stats.hits++; g.hud && g.hud.hitMark(); }
          if (pl.isPlayer) g.audio && g.audio.hit();
          break;
        }
      }
      if (!hit) for (const gt of g.ground) {
        if (!gt.alive || gt.team === b.team) continue;
        if (b.p.distanceToSquared(gt.pos) < gt.radius * gt.radius) { gt.damage(3, b.owner, 'gun'); fx.sparks(b.p, 3); hit = true; break; }
      }
      if (!hit && b.p.y < g.terrain.groundAt(b.p.x, b.p.z)) { if (Math.random() < 0.3) fx.smokePuff(b.p, tv.set(0, 4, 0), 4, 0.45, 0.6, 1.5); hit = true; }
      if (hit || b.life <= 0) this.bullets.splice(i, 1);
    }
    // flares
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i]; f.life -= dt; f.t -= dt; if (f.t > 0) continue;
      f.v.y -= 9.81 * dt * 0.6; f.v.multiplyScalar(Math.exp(-dt * 0.9)); f.p.addScaledVector(f.v, dt);
      fx.glow(f.p, 6 + Math.random() * 3, 1, 0.85, 0.6, 1.6, 0.06);
      if (Math.random() < 0.5) fx.smokePuff(f.p, tv.set(0, 1, 0), 3, 0.85, 0.5, 2.5);
      if (f.life <= 0) this.flares.splice(i, 1);
    }
    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]; m.t += dt; m.life -= dt;
      const sp = m.v.length();
      const tgtSpeed = m.sam ? 620 : 720;
      const accel = m.t < 2.4 ? 260 : -25;
      const ns = clamp(sp + accel * dt, 120, tgtSpeed);
      // decoy to flare
      if (m.decoyAt !== undefined) { m.decoyAt -= dt; if (m.decoyAt <= 0) { const fl = this.flares.find(f => f.team !== m.team && f.p.distanceTo(m.p) < 2500); if (fl) { this.untrack(m); m.target = null; m.flare = fl; } m.decoyAt = undefined; } }
      let tp = null, tvl = null;
      if (m.target && m.target.alive) { tp = m.target.pos; tvl = m.target.vel; }
      else if (m.flare && m.flare.life > 0) { tp = m.flare.p; tvl = m.flare.v; }
      const dir = tv.copy(m.v).normalize();
      if (tp && m.t > 0.25) {
        const dist = tp.distanceTo(m.p);
        const tgo = dist / Math.max(ns + 50, 200);
        const aim = tv2.copy(tp).addScaledVector(tvl, tgo * 0.9).sub(m.p).normalize();
        const off = Math.acos(clamp(aim.dot(dir), -1, 1));
        if (off > 1.4 && m.t > 1) { this.untrack(m); m.target = null; m.flare = null; }
        else {
          const maxTurn = (m.sam ? 22 : 34) * 9.81 / Math.max(ns, 100) * dt;
          const ang = Math.min(off, maxTurn);
          if (ang > 1e-5) { tv3.crossVectors(dir, aim).normalize(); dir.applyAxisAngle(tv3, ang); }
        }
        if (dist < (m.sam ? 22 : 16)) { this.detonate(m, i); continue; }
      }
      m.v.copy(dir).multiplyScalar(ns); m.v.y -= m.t > 2.4 ? 9.81 * dt * 0.3 : 0;
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p); m.mesh.lookAt(tv2.copy(m.p).add(m.v));
      if (m.t < 2.6 || m.sam) { tv2.copy(m.p).addScaledVector(dir, -2.2); fx.glow(tv2, 2.6 + Math.random(), 1, 0.7, 0.35, 1.6, 0.04); m.trail.add(tv2, 1); }
      else m.trail.emitting = false;
      if (m.trail.emitting && Math.random() < 0.5) fx.smokePuff(tv2, tv3.set(0, 0, 0), 3.5, 0.85, 0.4, 2.2);
      if (m.p.y < g.terrain.groundAt(m.p.x, m.p.z)) { this.detonate(m, i, true); continue; }
      if (m.life <= 0) { this.detonate(m, i); continue; }
    }
  }
  untrack(m) { if (m.target) { const a = m.target.incoming; const k = a.indexOf(m); if (k >= 0) a.splice(k, 1); } }
  detonate(m, i, ground) {
    const g = this.g;
    g.fx.explosion(m.p, 0.55);
    g.audio && g.audio.explosion(m.p, 0.6);
    for (const pl of g.planes) {
      if (!pl.alive || pl.team === m.team) continue;
      const d = pl.pos.distanceTo(m.p); if (d < 45) pl.damage((m.sam ? 70 : 82) * clamp(1.25 - d / 40, 0.2, 1), m.owner, 'missile');
    }
    for (const gt of g.ground) { if (gt.alive && gt.team !== m.team && gt.pos.distanceTo(m.p) < gt.radius + 25) gt.damage(m.sam ? 0 : 70, m.owner, 'missile'); }
    this.untrack(m); m.trail.emitting = false; g.scene.remove(m.mesh);
    this.missiles.splice(i, 1);
  }
  clear() { for (const m of this.missiles) { this.g.scene.remove(m.mesh); m.trail.emitting = false; } this.missiles = []; this.bullets = []; this.flares = []; }
}
