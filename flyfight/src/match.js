import * as THREE from 'three';
import { AIRCRAFT, MAPS, TIMES, WEATHER, MISSIONS, byId, PAINTS } from './data.js';
import { createSky, setupAtmosphere, ATMO } from './sky.js';
import { Terrain } from './terrain.js';
import { Clouds } from './clouds.js';
import { FX, Precip } from './fx.js';
import { Plane, Weapons } from './combat.js';
import { Pilot } from './ai.js';
import { radarStation, samLauncher, ship, hangarTarget } from './props.js';
import { save, persist } from './save.js';
import { clamp, lerp, rand, pick, damp } from './util.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tq = new THREE.Quaternion();
const CALLS = ['Беркут', 'Сокол', 'Стриж', 'Гром'], ECALLS = ['Кобра', 'Гадюка', 'Шакал', 'Призрак', 'Ворон'];
const wait = () => new Promise(r => setTimeout(r, 0));

class GroundTarget {
  constructor(game, kind, pos, team) {
    this.game = game; this.kind = kind; this.team = team; this.alive = true;
    const m = kind === 'radar' ? radarStation() : kind === 'sam' ? samLauncher() : kind === 'ship' ? ship() : hangarTarget(pos.obj);
    this.m = m; this.root = m.root; this.radius = m.radius; this.hp = m.hp; this.maxHp = m.hp;
    this.label = { radar: 'РЛС', sam: 'ЗРК', ship: 'КОРАБЛЬ', hangar: 'АНГАР' }[kind];
    if (kind !== 'hangar') { this.root.position.copy(pos); this.root.rotation.y = Math.random() * 6.28; game.scene.add(this.root); this.pos = pos.clone(); this.pos.y += kind === 'ship' ? 8 : 4; }
    else { this.pos = new THREE.Vector3(); pos.obj.getWorldPosition(this.pos); this.pos.y += 10; }
    this.samCd = 4 + Math.random() * 6; this.aaaCd = 1; this.sam = kind === 'sam' || (kind === 'ship' && game.mission && game.mission.ground && game.mission.ground.sam);
    this.aaa = kind === 'ship' || kind === 'radar';
    this.vel = kind === 'ship' ? new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)).multiplyScalar(6) : null;
    this.smokeT = 0;
  }
  damage(a, by, kind) {
    if (!this.alive) return; this.hp -= a;
    if (this.hp <= 0) {
      this.alive = false; const g = this.game; g.fx.groundExplosion(this.pos, this.kind === 'ship' ? 2.2 : 1.4); g.audio && g.audio.explosion(this.pos, 1.5);
      if (this.kind === 'hangar') this.root.scale.y = 0.3; else if (this.kind === 'ship') this.sink = 1; else this.root.scale.set(1, 0.25, 1);
      g.onGroundKill(this, by);
    }
  }
  update(dt) {
    const g = this.game; this.m.update(dt);
    if (this.vel && this.alive) { this.root.position.addScaledVector(this.vel, dt); this.pos.addScaledVector(this.vel, dt); if (g.terrain.heightAt(this.pos.x + this.vel.x * 20, this.pos.z + this.vel.z * 20) > -8) this.vel.negate(); this.root.rotation.y = Math.atan2(this.vel.x, this.vel.z); }
    if (this.sink) { this.root.position.y -= dt * 1.2; this.root.rotation.z += dt * 0.02; }
    if (!this.alive) { this.smokeT -= dt; if (this.smokeT < 0 && this.root.position.y > -40) { this.smokeT = 0.15; g.fx.smokePuff(this.pos, tv.set(rand(-2, 2), 10, rand(-2, 2)), 30, 0.12, 0.7, 10); if (Math.random() < 0.4) g.fx.firePuff(this.pos, tv.set(0, 6, 0), 10, 0.8); } return; }
    // air defence vs enemy team planes
    if (this.team === 1) {
      const targets = g.planes.filter(p => p.alive && p.team === 0 && !p.bomber);
      if (this.sam) {
        this.samCd -= dt;
        if (this.samCd <= 0) {
          this.samCd = 13 + Math.random() * 7 - g.skill * 4;
          let best = null, bd = 1e9; for (const p of targets) { const d = p.pos.distanceTo(this.pos); const agl = p.pos.y - g.terrain.groundAt(p.pos.x, p.pos.z); if (d < 8000 && agl > 180 && d < bd) { bd = d; best = p; } }
          if (best) { g.weapons.launchSAM(this.pos, best); if (best.isPlayer) g.hud.msg('Пуск ЗРК!', '#ff6a5a', 2); }
        }
      }
      if (this.aaa) {
        this.aaaCd -= dt;
        if (this.aaaCd <= 0) {
          this.aaaCd = 0.35;
          for (const p of targets) { const d = p.pos.distanceTo(this.pos); if (d < 3200) { tv.copy(p.pos).add(tv2.randomDirection().multiplyScalar(rand(40, 160) * (1.3 - g.skill * 0.5))); g.fx.smokePuff(tv, tv2.set(0, 0, 0), 14, 0.12, 0.9, 4); g.fx.glow(tv, 10, 1, 0.6, 0.3, 1, 0.08); if (tv.distanceTo(p.pos) < 60) p.damage(2.5, null, 'aaa'); } }
        }
      }
    }
  }
}

export class Match {
  constructor(app, cfg) {
    this.app = app; this.cfg = cfg; this.engine = app.engine; this.Q = app.engine.Q; this.audio = app.audio;
    this.mission = cfg.mission ? MISSIONS.find(m => m.id === cfg.mission) : null;
    const m = this.mission;
    this.mapId = cfg.map || (m ? m.map : 'valley'); this.timeId = cfg.time || (m ? m.time : 'noon'); this.weatherId = cfg.weather || (m ? m.weather : 'scattered');
    this.mode = cfg.mode; this.type = m ? m.type : (cfg.mode === 'free' ? 'free' : 'dogfight');
    this.skill = m ? m.skill : clamp(0.3 + save.stats.wins * 0.03, 0.3, 0.8);
    this.planes = []; this.ground = []; this.time = 0; this.score = 0; this.kills = 0; this.groundKills = 0; this.lives = cfg.mode === 'free' ? 99 : 2;
    this.stats = { shots: 0, hits: 0, missiles: 0 }; this.camMode = save.settings.camera || 'chase'; this.over = false; this.timeScale = 1; this.slowT = 0;
    this.center = new THREE.Vector3(0, 0, 0); this.arenaR = 14000; this.outT = 0; this.playerThreat = 0.85; this.shake = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.lightningT = 6;
  }
  async load(progress) {
    const Q = this.Q, M = MAPS[this.mapId], T = TIMES[this.timeId], W = WEATHER[this.weatherId];
    this.M = M; this.W = W;
    const scene = this.scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xaaaaaa, 0.00001);
    const camera = this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 150000);
    progress(0.05, 'Атмосфера...'); await wait();
    this.sky = createSky(); scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffffff, 3); scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xaaccff, 0x444433, 0.8); scene.add(this.hemi);
    if (Q.shadows) { this.sun.castShadow = true; this.sun.shadow.mapSize.set(Q.shadows, Q.shadows); const s = this.sun.shadow.camera; s.left = s.bottom = -45; s.right = s.top = 45; s.near = 1; s.far = 3000; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05; }
    this.atm = setupAtmosphere({ scene, renderer: this.engine.renderer, sky: this.sky, sun: this.sun, hemi: this.hemi, envRT: null }, T, W);
    this.night = this.atm.night > 0.5;
    progress(0.15, 'Генерация рельефа...'); await wait();
    this.terrain = new Terrain(this.engine, M, Q).generate();
    progress(0.45, 'Текстуры местности...'); await wait();
    this.terrain.build(); scene.add(this.terrain.group);
    if (this.terrain.rwLights) this.terrain.rwLights.visible = this.atm.night > 0.3;
    progress(0.6, 'Облака...'); await wait();
    this.clouds = new Clouds(W, Q, M.seed + this.timeId.length, M.size, this.atm.cols); scene.add(this.clouds.mesh);
    this.fx = new FX(scene, Q); this.fx.setLighting(this.atm.cols.sun.clone().multiplyScalar(this.atm.cols.sunI / 3), this.atm.cols.ambSky);
    this.precip = new Precip(scene, W, Q);
    this.weapons = new Weapons(this);
    progress(0.7, 'Аэродромы и цели...'); await wait();
    // arena centre: keep over land-ish area near middle
    if (this.terrain.airbase) this.center.set(this.terrain.airbase.x * 0.3, 0, this.terrain.airbase.z * 0.3 - 4000);
    this.setupGround();
    progress(0.8, 'Звенья истребителей...'); await wait();
    this.spawnTeams();
    progress(0.95, 'Компиляция шейдеров...'); await wait();
    this.engine.setScene(scene, camera);
    this.updateCamera(0.016, true);
    this.terrain.update(camera);
    try { this.engine.renderer.compile(scene, camera); } catch (e) { }
    progress(1, 'Готово'); await wait();
    this.audio.startEngine();
  }
  safeAlt(x, z, add) { let m = 0; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) m = Math.max(m, this.terrain.groundAt(x + i * 800, z + j * 800)); return m + add; }
  spawnTeams() {
    const m = this.mission, spec = byId(this.cfg.aircraft || save.selected);
    const paintId = save.paints[spec.id] || 'std'; const paint = PAINTS.find(p => p.id === paintId);
    const myCountry = spec.country;
    // player team
    const dir0 = new THREE.Vector3(0, 0, -1), dir1 = new THREE.Vector3(0, 0, 1);
    const c = this.center;
    const base0 = new THREE.Vector3(c.x, 0, c.z + 7500), base1 = new THREE.Vector3(c.x, 0, c.z - 7500);
    if (this.type === 'free') base0.set(this.terrain.airbase ? this.terrain.airbase.x : 0, 0, this.terrain.airbase ? this.terrain.airbase.z + 3000 : 0);
    const alt0 = this.safeAlt(base0.x, base0.z, 1500), alt1 = this.safeAlt(base1.x, base1.z, 1500);
    this.player = new Plane(this, spec, 0, { isPlayer: true, livery: paint && paint.livery, number: String(10 + Math.floor(Math.random() * 89)), assist: save.settings.assist });
    this.player.place(tv.set(base0.x, alt0, base0.z), dir0, 220);
    this.planes.push(this.player); this.player.name = 'Вы';
    if (this.type === 'free' && !this.cfg.enemies) { this.player.target = null; return; }
    // allies: same country aircraft
    const allyPool = AIRCRAFT.filter(a => a.country === myCountry);
    for (let i = 0; i < 4; i++) {
      const a = allyPool[(i + 1) % allyPool.length];
      const p = new Plane(this, m && m.id >= 7 ? a : allyPool[i % 2 === 0 ? 0 : 1], 0, { name: CALLS[i] + '-' + (i + 2), number: String(20 + i) });
      const off = new THREE.Vector3((i % 2 ? 1 : -1) * (120 + 120 * Math.floor(i / 2)), (i % 2) * 40, 90 + 90 * Math.floor(i / 2));
      p.place(tv.set(base0.x + off.x, alt0 + off.y, base0.z + off.z), dir0, 220);
      p.ai = new Pilot(p, this, clamp(this.skill + 0.05, 0.3, 0.9), 'fighter');
      this.planes.push(p);
    }
    // enemies
    const enemyIds = m ? m.enemies : this.randomEnemies(myCountry);
    enemyIds.forEach((id, i) => {
      const ace = m && m.ace === i;
      const p = new Plane(this, byId(id), 1, { name: (ace ? 'Призрак-1' : ECALLS[i] + '-' + (i + 1)), number: String(50 + i), hpMul: ace ? 2.6 : 1 + this.skill * 0.2, ace });
      const off = new THREE.Vector3((i % 2 ? 1 : -1) * (150 + 140 * Math.floor(i / 2)), 0, -100 * Math.floor(i / 2));
      p.place(tv.set(base1.x + off.x, alt1 + rand(-100, 300), base1.z + off.z), dir1, 230);
      p.ai = new Pilot(p, this, ace ? 1 : this.skill + rand(-0.08, 0.08), 'fighter');
      this.planes.push(p);
    });
    // bombers
    if (m && m.bombers) {
      for (let i = 0; i < m.bombers; i++) {
        const p = new Plane(this, byId(enemyIds[0]), 1, { bomber: true, name: 'Бомбардировщик ' + (i + 1) });
        const start = new THREE.Vector3(c.x + (i - (m.bombers - 1) / 2) * 900, 0, c.z - 17000 - i * 1500);
        const tgt = this.defendPoint();
        p.place(start.setY(this.safeAlt(start.x, start.z, 2600)), tgt.clone().sub(start).setY(0).normalize(), 165);
        p.ai = new Pilot(p, this, 0.5, 'bomber'); p.ai.goal = tgt; p.ctrl.throttle = 0.8;
        this.planes.push(p);
      }
      // escorts for bombers
      this.planes.filter(p => p.team === 1 && !p.bomber).slice(0, 2).forEach((p, i) => { p.ai.role = 'escort'; p.ai.escortOf = this.planes.find(b => b.bomber); });
    }
    // ground attack roles
    if (this.type === 'defend') { const hs = this.ground.filter(g => g.team === 0); this.planes.filter(p => p.team === 1 && !p.bomber).slice(2, 4).forEach((p, i) => { p.ai.groundTarget = hs[i % hs.length]; }); }
    for (const p of this.planes) if (p.team === 0 && p.ai && this.ground.some(g => g.team === 1)) { /* allies help strike */ if (Math.random() < 0.4) p.ai.groundTarget = pick(this.ground.filter(g => g.team === 1)); }
    this.player.target = this.planes.find(p => p.team === 1);
  }
  randomEnemies(myCountry) {
    const pool = AIRCRAFT.filter(a => a.country !== myCountry && (a.price <= 40000 || this.skill > 0.6));
    return [0, 1, 2, 3, 4].map(() => pick(pool).id);
  }
  defendPoint() {
    if (this.type === 'defend' && this.terrain.airbase) { const a = this.terrain.airbase; return new THREE.Vector3(a.x, a.h, a.z); }
    const city = this.terrain.cities[0]; if (city) return new THREE.Vector3(city.x, city.h, city.z);
    return new THREE.Vector3(this.center.x, 0, this.center.z + 9000);
  }
  setupGround() {
    const m = this.mission; if (!m) return;
    if (m.ground) {
      const n = m.ground.count; let placed = 0, tries = 0;
      while (placed < n && tries++ < 4000) {
        const x = this.center.x + rand(-9000, 9000), z = this.center.z + rand(-10000, 1500);
        const h = this.terrain.heightAt(x, z);
        if (m.ground.kind === 'ship') { if (h > -30) continue; if (this.ground.some(g => g.pos.distanceTo(tv.set(x, 0, z)) < 1500)) continue; this.ground.push(new GroundTarget(this, 'ship', new THREE.Vector3(x, 0, z), 1)); placed++; }
        else { if (h < 5 || this.terrain.slopeAt(x, z) > 0.25) continue; if (this.ground.some(g => g.pos.distanceTo(tv.set(x, h, z)) < 1800)) continue; this.ground.push(new GroundTarget(this, m.ground.kind, new THREE.Vector3(x, h, z), 1)); placed++; }
      }
      // extra SAM sites guarding radars
      if (m.ground.kind === 'radar' && m.ground.sam) for (let i = 0; i < m.ground.sam && i < this.ground.length; i++) { const r = this.ground[i]; const p = r.pos.clone().add(tv.set(rand(-400, 400), 0, rand(-400, 400))); p.y = this.terrain.heightAt(p.x, p.z); const s = new GroundTarget(this, 'sam', p, 1); s.optional = true; this.ground.push(s); }
      if (m.ground.kind === 'sam') for (let i = 0; i < 2 && i < this.ground.length; i++) { const r = this.ground[i]; const p = r.pos.clone().add(tv.set(rand(-500, 500), 0, rand(-500, 500))); p.y = this.terrain.heightAt(p.x, p.z); const s = new GroundTarget(this, 'radar', p, 1); s.optional = true; this.ground.push(s); }
    }
    if (this.type === 'defend' && this.terrain.hangars) for (const h of this.terrain.hangars) this.ground.push(new GroundTarget(this, 'hangar', { obj: h }, 0));
  }
  objectiveText() {
    const enemies = this.planes.filter(p => p.team === 1 && p.alive && !p.bomber).length;
    const T = this.type;
    if (T === 'free') return 'Свободный полёт' + (this.cfg.enemies ? ` — противников: ${enemies}` : '');
    if (T === 'naval' || T === 'strike') { const left = this.ground.filter(g => g.team === 1 && g.alive && !g.optional).length; return `Наземные цели: ${left}  •  Истребители: ${enemies}`; }
    if (T === 'intercept') return `Перехватите бомбардировщики: ${this.planes.filter(p => p.bomber && p.alive).length}`;
    if (T === 'defend') return `Защитите базу: ангаров ${this.ground.filter(g => g.team === 0 && g.alive).length}  •  Бомбардировщики: ${this.planes.filter(p => p.bomber && p.alive).length}`;
    if (T === 'ace') { const ace = this.planes.find(p => p.ace); return ace && ace.alive ? `Сбейте аса «Призрак-1» (${ace.spec.name})` : `Добейте эскадрилью: ${enemies}`; }
    if (T === 'final') return `Уничтожьте всех: истребители ${enemies}, бомбардировщики ${this.planes.filter(p => p.bomber && p.alive).length}`;
    return `Уничтожьте противника: ${enemies}`;
  }
  onKill(victim, by, kind) {
    const pl = this.player;
    const byName = by ? (by.isPlayer ? 'Вы' : by.name) : (kind === 'crash' ? 'Земля' : 'ПВО');
    const col = victim.team === 0 ? '#ff8a7a' : '#8ad8ff';
    this.hud.kill(`${byName} ▸ ${victim.isPlayer ? 'Вы' : victim.name} (${victim.bomber ? 'бомбардировщик' : victim.spec.name})`, col);
    if (by && by.isPlayer && victim.team !== 0) {
      this.kills++; const pts = victim.bomber ? 150 : victim.ace ? 400 : 100; this.score += pts;
      save.stats.kills++; if (kind === 'gun') save.stats.gunKills++; else save.stats.missileKills++;
      this.hud.banner(victim.ace ? 'АС СБИТ!' : 'ЦЕЛЬ ПОРАЖЕНА', '#ffd34d', 1.8); this.slowT = 0.5;
      this.audio.click();
    }
    if (victim === pl) {
      save.stats.deaths++; this.lives--; this.deadT = 0; this.hud.banner(this.lives > 0 ? 'ВЫ СБИТЫ — возрождение...' : 'ВЫ СБИТЫ', '#ff4d4d', 4);
      this.audio.tones(null);
    }
    if (pl.target === victim) pl.target = null;
  }
  onGroundKill(gt, by) {
    if (gt.team === 1 && by && by.isPlayer) { this.score += 60; this.groundKills++; save.stats.ground++; this.hud.banner(gt.label + ' УНИЧТОЖЕН', '#ffd34d', 1.6); }
    this.hud.kill(`${gt.label} уничтожен${gt.team === 0 ? ' (наш)' : ''}`, gt.team === 0 ? '#ff8a7a' : '#ffd34d');
  }
  onPlayerHit(a) { this.shake = Math.min(1, this.shake + a / 40); this.app.ui.damageFlash(Math.min(1, a / 30)); }
  respawn() {
    const old = this.player; const spec = old.spec;
    old.dispose(); this.planes.splice(this.planes.indexOf(old), 1);
    const paintId = save.paints[spec.id] || 'std'; const paint = PAINTS.find(p => p.id === paintId);
    const p = new Plane(this, spec, 0, { isPlayer: true, livery: paint && paint.livery, number: old.model && '07', assist: save.settings.assist });
    const c = this.center; const x = c.x + rand(-2000, 2000), z = c.z + 9000; p.place(tv.set(x, this.safeAlt(x, z, 1800), z), new THREE.Vector3(0, 0, -1), 230);
    this.player = p; this.planes.push(p); p.name = 'Вы'; this.invulnT = 3;
    this.hud.msg('Возрождение. Осталось жизней: ' + (this.lives - 1), '#fff', 3);
  }
  // ---------- main update ----------
  update(rdt) {
    if (this.over && this.endT !== undefined) { this.endT -= rdt; }
    if (this.slowT > 0) { this.slowT -= rdt; this.timeScale = 0.35; } else this.timeScale = damp(this.timeScale, 1, 6, rdt);
    const dt = Math.min(rdt, 0.05) * this.timeScale; this.time += dt; ATMO.uTime.value = this.time;
    const pl = this.player, inp = this.app.input;
    this.invuln = this.invulnT > 0; if (this.invulnT > 0) this.invulnT -= dt;
    // --- player input
    for (const e of inp.poll()) this.handleEvent(e);
    if (pl.alive) {
      if (this.cfg.auto) { if (!pl.ai) pl.ai = new Pilot(pl, this, 0.8, 'fighter'); pl.ai.update(dt); if (pl.ctrl.missile && pl.locked) this.weapons.fireMissile(pl, pl.target); if (pl.ctrl.flare) this.weapons.dropFlares(pl); }
      else { const c = inp.read(rdt); Object.assign(pl.ctrl, c); }
      const c = pl.ctrl;
      if (c.gun) this.weapons.fireGun(pl, dt);
      // targeting & lock
      if (!pl.target || !pl.target.alive) this.cycleTarget(true);
      this.updateLock(pl, dt);
      // out of bounds
      const hd = Math.hypot(pl.pos.x - this.center.x, pl.pos.z - this.center.z);
      if (hd > this.arenaR * 1.08 && this.type !== 'free') { this.outT = this.outT > 0 ? this.outT - dt : 10; if (this.outT <= 0.05) { pl.kill(null, 'crash'); this.outT = 0; } } else this.outT = 0;
      save.stats.flightTime += dt;
    } else {
      this.deadT = (this.deadT || 0) + rdt;
      if (this.deadT > 4 && this.lives > 0 && !this.over) this.respawn();
    }
    // --- AI
    for (const p of this.planes) {
      if (p.isPlayer || !p.alive) continue;
      p.ai.update(dt); this.updateLock(p, dt);
      if (p.ctrl.gun) this.weapons.fireGun(p, dt);
      if (p.ctrl.missile && p.locked) this.weapons.fireMissile(p, p.target);
      if (p.ctrl.flare) this.weapons.dropFlares(p);
      // bombers
      if (p.bomber && p.ai.goal) {
        const d = Math.hypot(p.pos.x - p.ai.goal.x, p.pos.z - p.ai.goal.z);
        if (p.turned && p.ai.home && d < 2500 && this.type === 'defend') { p.turned = false; p.bombed = false; p.ai.goal = p.ai.home; }
        if (d < 1800 && !p.turned) {
          if (this.type === 'defend') { const hs = this.ground.filter(g => g.team === 0 && g.alive); if (hs.length && !p.bombed) { p.bombed = true; const h = hs[(Math.random() * hs.length) | 0]; h.damage(200, p, 'bomb'); this.hud.msg('Бомбардировщик поразил ангар!', '#ff6a5a', 2.5); } }
          else if (this.type === 'intercept' || this.type === 'final') { this.failReason = 'Бомбардировщик прорвался к цели'; if (this.type === 'intercept') this.finish(false); }
          if (!p.turned) { p.turned = true; p.ai.home = p.ai.goal.clone(); p.ai.goal = new THREE.Vector3(p.pos.x + rand(-4000, 4000), p.ai.goal.y, p.pos.z - 16000); }
        }
      }
    }
    // --- physics & entity update
    for (const p of this.planes) {
      p.incoming = p.incoming.filter(m => this.weapons.missiles.includes(m));
      p.update(dt);
      if (p.alive) {
        const gh = this.terrain.groundAt(p.pos.x, p.pos.z);
        if (p.pos.y < gh + 1.5) { p.kill(p.lastHitBy, 'crash'); if (gh <= 0.5 && this.terrain.water) this.fx.splash(p.pos); else this.fx.groundExplosion(tv.set(p.pos.x, gh, p.pos.z), 1.2); }
      }
    }
    for (const g of this.ground) g.update(dt);
    this.weapons.update(dt);
    // --- world
    this.updateCamera(rdt);
    this.terrain.update(this.camera);
    this.clouds.update(this.camera, rdt);
    this.fx.update(dt, this.camera);
    this.precip.update(rdt, this.camera, pl.alive ? pl.vel : null);
    if (this.Q.shadows) { const t = pl.alive ? pl.pos : this.camera.position; this.sun.target.position.copy(t); this.sun.position.copy(t).addScaledVector(ATMO.uSunDir.value, 1000); }
    // lightning
    if (this.W.lightning) { this.lightningT -= rdt; if (this.lightningT <= 0) { this.lightningT = rand(4, 12); this.flashT = 0.25; this.audio.thunder(); } if (this.flashT > 0) { this.flashT -= rdt; this.hemi.intensity = this.baseHemi * (1 + 6 * Math.max(0, Math.sin(this.flashT * 60))); } else this.hemi.intensity = this.baseHemi || this.hemi.intensity; }
    if (this.baseHemi === undefined) this.baseHemi = this.hemi.intensity;
    // --- audio
    const f = pl.flight; this.audio.setListener(this.camera.position);
    this.audio.engine(pl.alive ? f.thr : 0, pl.alive ? f.ab : 0, pl.alive ? f.speed : 0, pl.alive && pl.ctrl.gun && pl.ammo > 0, this.camMode === 'cockpit');
    const warn = pl.alive && pl.incoming.some(m => m.target === pl);
    this.audio.tones(warn ? 'warn' : pl.alive && pl.locked ? 'lock' : pl.alive && pl.lockT > 0 ? 'seek' : null); this.audio.tickTones(this.time);
    // --- end conditions
    if (!this.over) this.checkEnd();
    // --- HUD
    this.hud.draw(this, rdt);
    if (pl.model.panel && this.camMode === 'cockpit') { this.panelT = (this.panelT || 0) - rdt; if (this.panelT <= 0) { this.panelT = 0.2; this.hud.drawPanel(pl.model.panel.userData.canvas, this); pl.model.panel.userData.tex.needsUpdate = true; } }
    this.app.ui.blackout(pl.alive ? f.G : 1);
  }
  handleEvent(e) {
    const pl = this.player;
    if (e === 'pause') { this.app.pause(); return; }
    if (e === 'camera') { this.camMode = this.camMode === 'chase' ? 'cockpit' : 'chase'; save.settings.camera = this.camMode; persist(); }
    if (e === 'look') { this.lookBack = !this.lookBack; }
    if (e === 'mouse') { if (document.pointerLockElement) document.exitPointerLock(); else this.engine.canvas.requestPointerLock && this.engine.canvas.requestPointerLock(); }
    if (!pl.alive) return;
    if (e === 'target') this.cycleTarget(false);
    if (e === 'flare') this.weapons.dropFlares(pl);
    if (e === 'missile') { if (pl.missiles <= 0) this.hud.msg('Ракеты закончились', '#ffd34d', 1.5); else this.weapons.fireMissile(pl, pl.locked ? pl.target : null); }
  }
  cycleTarget(auto) {
    const pl = this.player; const cands = this.planes.filter(p => p.alive && p.team !== pl.team);
    if (!cands.length) { pl.target = null; return; }
    const score = (p) => { tv.subVectors(p.pos, pl.pos); const d = tv.length(); return d * (1.6 - tv.normalize().dot(pl.fwd)); };
    cands.sort((a, b) => score(a) - score(b));
    if (auto) pl.target = cands[0]; else { const i = cands.indexOf(pl.target); pl.target = cands[(i + 1) % cands.length]; pl.lockT = 0; pl.locked = false; }
  }
  updateLock(p, dt) {
    const t = p.target;
    if (!t || !t.alive || p.missiles <= 0) { p.lockT = 0; p.locked = false; return; }
    tv.subVectors(t.pos, p.pos); const d = tv.length(); const ang = Math.acos(clamp(tv.normalize().dot(p.fwd), -1, 1));
    const range = 4200 * (1 - t.stealth * 0.45);
    if (d < range && ang < 0.55) { p.lockT = Math.min(1, p.lockT + dt / (1.0 + t.stealth * 0.8)); } else { p.lockT = Math.max(0, p.lockT - dt * 2); }
    p.locked = p.lockT >= 1;
  }
  updateCamera(dt, snap) {
    const cam = this.camera; let pl = this.player;
    let follow = pl;
    if (!pl.alive && this.deadT > 2.5) { follow = this.planes.find(p => p.alive && p.team === 0 && !p.bomber) || pl; }
    const f = follow.flight; f.axes();
    const inp = this.app.input;
    this.lookYaw = inp.lookX ? clamp(inp.lookX, -3, 3) : damp(this.lookYaw, 0, 3, dt); this.lookPitch = inp.lookY ? clamp(inp.lookY, -1.2, 1.2) : damp(this.lookPitch, 0, 3, dt);
    if (inp.lookX || inp.lookY) { this.lookYaw = clamp(inp.lookX, -3, 3); this.lookPitch = clamp(inp.lookY, -1.2, 1.2); inp.lookX *= Math.exp(-dt * 1.5); inp.lookY *= Math.exp(-dt * 1.5); if (Math.abs(inp.lookX) < 0.01) inp.lookX = 0; if (Math.abs(inp.lookY) < 0.01) inp.lookY = 0; }
    const back = this.lookBack ? Math.PI : 0;
    const cockpit = this.camMode === 'cockpit' && follow === pl && pl.alive;
    if (pl.model.pilot) pl.model.pilot.visible = !cockpit;
    if (pl.model.canopy) pl.model.canopy.visible = true;
    const fovT = (cockpit ? 74 : 62) + (follow.flight.ab * 6) + clamp((follow.flight.speed - 250) / 30, 0, 6);
    cam.fov = snap ? fovT : damp(cam.fov, fovT, 3, dt); cam.near = cockpit ? 0.08 : 0.5; cam.updateProjectionMatrix();
    if (!follow.alive && follow === pl) {
      // orbit wreck
      this.orbitA = (this.orbitA || 0) + dt * 0.4;
      tv.set(Math.cos(this.orbitA) * 60, 25, Math.sin(this.orbitA) * 60).add(pl.pos); cam.position.lerp(tv, 1 - Math.exp(-dt * 3)); cam.lookAt(pl.pos); return;
    }
    if (!this.camQ) { this.camQ = f.q.clone(); }
    this.camQ.slerp(f.q, snap ? 1 : 1 - Math.exp(-dt * (cockpit ? 30 : 7)));
    const lookQ = tq.setFromEuler(new THREE.Euler(-this.lookPitch, this.lookYaw + back, 0, 'YXZ'));
    if (cockpit) {
      pl.model.eye.getWorldPosition(cam.position);
      cam.quaternion.copy(f.q).multiply(lookQ).multiply(new THREE.Quaternion().setFromAxisAngle(tv.set(0, 1, 0), Math.PI));
      cam.position.addScaledVector(f.up, 0.02);
    } else {
      const L = follow.model.length || 16; const dist = L * 1.35 + 6 + follow.flight.ab * 2;
      const q = this.camQ.clone().multiply(lookQ);
      tv.set(0, L * 0.26 + 1.5, -dist).applyQuaternion(q).add(f.pos);
      // smooth position lag
      if (snap || !this.camPos) this.camPos = tv.clone(); else this.camPos.lerp(tv, 1 - Math.exp(-dt * 18));
      cam.position.copy(this.camPos);
      tv2.set(0, L * 0.12, L * 0.9).applyQuaternion(q).add(f.pos);
      cam.up.copy(tv.set(0, 1, 0).applyQuaternion(this.camQ));
      cam.lookAt(tv2);
      // keep above ground
      const gh = this.terrain.groundAt(cam.position.x, cam.position.z) + 3; if (cam.position.y < gh) cam.position.y = gh;
    }
    // shake
    const sh = this.shake + follow.flight.ab * 0.04 + (this.W.wind || 0) * 0.04 + clamp((follow.flight.G - 6) / 20, 0, 0.1);
    if (sh > 0.001) { cam.rotateX((Math.random() - 0.5) * sh * 0.02); cam.rotateY((Math.random() - 0.5) * sh * 0.02); }
    this.shake = damp(this.shake, 0, 4, dt);
  }
  checkEnd() {
    const T = this.type; if (T === 'free') { if (this.cfg.enemies && !this.planes.some(p => p.team === 1 && p.alive)) { this.cfg.enemies = 0; this.hud.banner('Все цели уничтожены', '#8aff9a', 3); } return; }
    const enemies = this.planes.filter(p => p.team === 1 && p.alive && !p.bomber), bombers = this.planes.filter(p => p.team === 1 && p.bomber && p.alive);
    const allies = this.planes.filter(p => p.team === 0 && p.alive);
    const gLeft = this.ground.filter(g => g.team === 1 && g.alive && !g.optional).length;
    const playerOut = !this.player.alive && this.lives <= 0;
    if (!allies.length || (playerOut && this.deadT > 6 && !allies.some(a => !a.isPlayer))) return this.finish(false);
    if (T === 'defend' && !this.ground.some(g => g.team === 0 && g.alive)) { this.failReason = 'База уничтожена'; return this.finish(false); }
    let win = false;
    if (T === 'dogfight' || T === 'ace') win = !enemies.length;
    else if (T === 'naval' || T === 'strike') win = gLeft === 0 && enemies.length <= 2;
    else if (T === 'intercept') win = !bombers.length && enemies.length <= 1;
    else if (T === 'defend') win = !bombers.length && !enemies.length;
    else if (T === 'final') win = !bombers.length && !enemies.length;
    if (T === 'ace') { const ace = this.planes.find(p => p.ace); if (ace && !ace.alive && enemies.length <= 2) win = true; }
    if (win) this.finish(true);
    if (playerOut && this.deadT > 12) this.finish(false);
  }
  finish(win) {
    if (this.over) return; this.over = true; this.win = win;
    const m = this.mission;
    let credits = this.score * 6 + (win ? 1500 : 300);
    let first = false;
    if (m && win) { first = !save.done.includes(m.id); credits += first ? m.reward : Math.round(m.reward * 0.3); if (first) { save.done.push(m.id); save.stats.missions++; save.mission = Math.max(save.mission, m.id + 1); } }
    save.stats.battles++; if (win) save.stats.wins++; else save.stats.losses++;
    save.stats.shots += this.stats.shots; save.stats.hits += this.stats.hits; save.stats.missiles += this.stats.missiles; save.stats.best = Math.max(save.stats.best, this.score);
    save.credits += credits; save.stats.earned += credits; persist();
    this.result = { win, credits, first, score: this.score, kills: this.kills, ground: this.groundKills, acc: this.stats.shots ? Math.round(this.stats.hits / this.stats.shots * 100) : 0, reason: this.failReason };
    this.hud.banner(win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', win ? '#8aff9a' : '#ff5a5a', 4);
    setTimeout(() => this.app.showResult(this), 2600);
  }
  dispose() {
    this.audio.stopEngine();
    for (const p of this.planes) p.dispose();
    this.weapons.clear(); this.fx.dispose(); this.precip.dispose(); this.clouds.dispose(); this.terrain.dispose();
    if (this.atm && this.scene.environment) this.scene.environment.dispose();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
