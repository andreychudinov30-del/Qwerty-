// Police: crimes & witnesses, wanted level 1-5, search zone, pursuit cars, cops on foot, helicopter, arrests
import * as THREE from 'three';
import { G, clamp, rand, pick, chance, bus, _v1 } from '../core/util.js';
import { Vehicle } from '../entities/vehicle.js';
import { AIDriver } from './driver.js';
import { addBust } from './traffic.js';
import { Ped } from './peds.js';
import { fireWeapon } from '../game/weapons.js';
import { CELL, nodeDeg } from '../world/citygen.js';
import { vcMat } from '../world/geo.js';
import { nightU } from '../world/buildings.js';

export class Police {
  constructor(game) {
    this.game = game; G.wanted = 0; this.heat = 0;
    this.units = []; this.cops = []; this.helis = [];
    this.lastSeen = 0; this.lastPos = new THREE.Vector3(); this.seen = false; this.spawnT = 0; this.arrestT = 0;
    bus.on('crime', (type, pos) => this.crime(type, pos));
    bus.on('pedKilled', (p, src) => { if (src && (src.isPlayer || src === G.player)) this.crime(p.team === 'cop' ? 'copKilled' : 'kill', p.h.pos.clone(), p); });
    bus.on('pedHurt', (p, src, how) => { if (src && src.isPlayer) this.crime(p.team === 'cop' ? 'copHurt' : how === 'car' ? 'runover' : 'assault', p.h.pos.clone(), p); });
    bus.on('playerDamagedVehicle', (v) => { if (v.T.police) this.crime('copCar', v.pos.clone()); });
    bus.on('witness', (type) => { if (G.wanted < 1) this.setWanted(1); });
  }
  witnessed(pos, r = 45) {
    if (G.noWanted) return false;
    for (const c of this.cops) if (!c.dead && c.h.pos.distanceTo(pos) < r * 1.4) return true;
    for (const u of this.units) if (!u.v.dead && u.v.pos.distanceTo(pos) < r * 1.6) return true;
    if (this.helis.length) return true;
    const civ = this.game.peds.query(pos.x, pos.z, r).filter((p) => !p.dead && p.team === 'civ' && !p.mission);
    return civ.length > 0 && chance(Math.min(0.9, 0.3 + civ.length * 0.15));
  }
  crime(type, pos, victim) {
    if (G.noWanted || G.cutscene) return;
    const w = G.wanted;
    const copNear = this.cops.some((c) => !c.dead && c.h.pos.distanceTo(pos) < 60) || this.units.some((u) => u.v.pos.distanceTo(pos) < 70);
    switch (type) {
      case 'shot': if (w < 1 && this.witnessed(pos, 50)) this.setWanted(copNear ? 2 : 1); break;
      case 'assault': if (copNear || (this.witnessed(pos, 20) && chance(0.35))) this.setWanted(Math.max(w, 1)); break;
      case 'runover': if (this.witnessed(pos, 40)) this.setWanted(Math.max(w, 1)); break;
      case 'carjack': if (copNear || this.witnessed(pos, 25)) this.setWanted(Math.max(w, 1)); break;
      case 'kill': if (this.witnessed(pos, 60)) this.setWanted(Math.min(5, Math.max(w + (w >= 2 ? 0.34 : 1), 2))); break;
      case 'copHurt': this.setWanted(Math.max(w, 2)); break;
      case 'copKilled': this.setWanted(Math.min(5, Math.max(w + 1, 3))); break;
      case 'copCar': this.setWanted(Math.max(w, 1)); if (w >= 1) this.heat += 0.2; break;
    }
  }
  setWanted(n) {
    n = clamp(n, 0, 5);
    const prev = Math.floor(G.wanted);
    G.wanted = n;
    if (Math.floor(n) > prev) { G.hud.notify('★ Уровень розыска: ' + Math.floor(n)); this.lastSeen = G.t; this.lastPos.copy(G.player.wpos()); this.seen = true; }
    if (n === 0) this.clear();
  }
  clear() {
    G.wanted = 0;
    for (const u of this.units) { u.ai = null; u.v.siren = false; u.leaving = true; }
    for (const c of this.cops) { c.state = 'walk'; c.threat = null; c.patrolLeave = true; }
    for (const h of this.helis) h.leaving = true;
  }
  spawnUnit() {
    const pl = G.player.wpos();
    for (let i = 0; i < 12; i++) {
      const a = rand(0, 6.28), d = rand(140, 220);
      const k = Math.round((pl.x + Math.sin(a) * d) / CELL), m = Math.round((pl.z + Math.cos(a) * d) / CELL);
      if (!nodeDeg(k, m)) continue;
      const x = k * CELL + 2, z = m * CELL + 2;
      if (this.game.peds.inView(x, z) && G.city.los(x, z, pl.x, pl.z)) continue;
      const v = new Vehicle({ scene: G.scene, physics: G.physics }, G.wanted >= 4 && chance(0.4) ? 'suv' : 'police', { color: '#1a1a1a' });
      v.place(x, z, Math.atan2(pl.x - x, pl.z - z), 0);
      v.makeDynamic(); v.siren = true; v.policeUnit = true; v.locked = false;
      addBust(v, { shirt: '#1a2a5a', skin: pick(['#e0ac88', '#c68e68', '#f1c8a8']), hair: '#1a1410', jacket: '#141c38' });
      const ai = new AIDriver(v, { max: 30 + G.wanted * 4, aggr: 0.5 + G.wanted * 0.1 });
      ai.setTarget(() => (this.seen ? G.player.wpos() : this.lastPos));
      const u = { v, ai, crew: 2, deployed: false };
      v.driver = { npc: true, police: true };
      this.units.push(u); G.vehicles.add(v);
      return u;
    }
  }
  spawnHeli() {
    const g = new THREE.Group();
    const m = vcMat(0.4, 0.5);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a2440, roughness: 0.35, metalness: 0.5 })); g.add(body);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.9 })); glass.position.z = 1.4; g.add(glass);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 5, 8).rotateX(Math.PI / 2), body.material); tail.position.set(0, 0.3, -3.8); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.8), body.material); fin.position.set(0, 0.8, -6.1); g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111 })); rotor.position.y = 1.35; g.add(rotor);
    const r2 = rotor.clone(); r2.rotation.y = Math.PI / 2; rotor.add(r2);
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3), body.material); skid.position.set(0.8, -1.2, 0); g.add(skid); const s2 = skid.clone(); s2.position.x = -0.8; g.add(s2);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.2) })); blink.position.set(0, -0.9, 1); g.add(blink);
    const spot = new THREE.SpotLight(0xe8f0ff, 0, 140, 0.18, 0.5, 1.2); spot.position.set(0, -1, 1); g.add(spot); g.add(spot.target);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const pl = G.player.wpos();
    g.position.set(pl.x + 200, 80, pl.z + 200);
    G.scene.add(g);
    const h = { g, rotor, spot, blink, a: rand(0, 6), fireT: 3, leaving: false };
    this.helis.push(h);
  }
  update(dt) {
    const pl = G.player, pp = pl.wpos();
    const W = Math.floor(G.wanted);
    // visibility & search
    this.seen = false;
    if (W > 0) {
      for (const u of this.units) if (!u.v.dead && u.v.pos.distanceTo(pp) < 70 && G.city.los(u.v.pos.x, u.v.pos.z, pp.x, pp.z)) { this.seen = true; break; }
      if (!this.seen) for (const c of this.cops) if (!c.dead && c.h.pos.distanceTo(pp) < 55 && G.city.los(c.h.pos.x, c.h.pos.z, pp.x, pp.z)) { this.seen = true; break; }
      if (!this.seen && this.helis.some((h) => !h.leaving && h.g.position.distanceTo(pp) < 120)) this.seen = !G.interior && !(pl.state === 'car' && false);
      if (this.seen) { this.lastSeen = G.t; this.lastPos.copy(pp); }
      const searchT = 9 + W * 5, radius = 70 + W * 45;
      this.searching = G.t - this.lastSeen > 2.5;
      if (G.t - this.lastSeen > searchT && pp.distanceTo(this.lastPos) > radius * 0.6) { this.setWanted(0); G.hud.notify('✓ Вы оторвались от полиции'); G.audio.jingle(true); }
      this.searchRadius = radius;
      // spawn units
      this.spawnT -= dt;
      const wantCars = [0, 1, 2, 3, 4, 6][W], wantHeli = W >= 5 ? 2 : W >= 3 ? 1 : 0;
      const active = this.units.filter((u) => !u.v.dead && !u.leaving).length;
      if (this.spawnT < 0) { this.spawnT = 3; if (active < wantCars) this.spawnUnit(); if (this.helis.filter((h) => !h.leaving).length < wantHeli) this.spawnHeli(); }
      // arrest
      if (W === 1 && pl.state === 'foot' && !pl.wasted && this.cops.some((c) => !c.dead && c.h.pos.distanceTo(pl.pos) < 2.3)) { this.arrestT += dt; if (this.arrestT > 1.6 && pl.speed < 2.5) { this.arrestT = 0; bus.emit('busted'); } } else this.arrestT = 0;
    }
    // units
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v;
      const d = v.pos.distanceTo(pp);
      if ((u.leaving || v.dead) && d > 160) { this.units.splice(i, 1); G.vehicles.delete(v); v.dispose(); continue; }
      if (u.leaving && !u.ai) { v.throttle = 0.3; v.steer = 0; continue; }
      if (!u.ai) continue;
      if (G.player.car === v) { u.ai = null; continue; }
      u.ai.update(dt);
      // deploy cops on foot when close & player on foot or stopped
      const stop = pl.state !== 'car' || Math.abs(pl.car ? pl.car.speed : 0) < 3;
      if (!u.deployed && d < 26 && stop && Math.abs(v.speed) < 6) {
        u.deployed = true; v.brake = 1; v.throttle = 0; u.ai = null; v.driver = null; if (v.bust) v.bust.visible = false;
        for (let k = 0; k < u.crew; k++) {
          const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)).multiplyScalar(k ? -1.6 : 1.6);
          const c = new Ped(this.game.peds, v.pos.x + side.x, v.pos.z + side.z, { team: 'cop', showWeapon: true, weapon: G.wanted >= 4 && k ? 'smg' : 'pistol' });
          c.state = 'combat'; c.threat = G.player; c.unit = u; c.keep = false;
          this.game.peds.list.push(c); this.cops.push(c);
          if (k === 0) c.say(pick(['Стоять! Полиция!', 'Руки вверх!', 'Не двигаться!']), 2.5, true);
        }
      }
    }
    // cops: forget dead / far
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const c = this.cops[i];
      if (!this.game.peds.list.includes(c)) { this.cops.splice(i, 1); continue; }
      if (W === 0 && !c.dead) { c.state = 'walk'; c.threat = null; }
      else if (W >= 1 && !c.dead && c.state !== 'combat') { c.state = 'combat'; c.threat = G.player; }
      // only shoot from 2 stars or if player armed
      if (W === 1 && c.state === 'combat') { const armed = pl.weapon !== 'fists' && pl.aiming; if (!armed) { c.state = 'fight'; c.threat = G.player; } }
    }
    // helicopters
    for (let i = this.helis.length - 1; i >= 0; i--) {
      const h = this.helis[i];
      h.rotor.rotation.y += dt * 40;
      h.blink.visible = (G.t % 1) < 0.15;
      h.a += dt * 0.25;
      let tx, ty, tz;
      if (h.leaving) { tx = h.g.position.x + 50; ty = 120; tz = h.g.position.z + 50; if (h.g.position.distanceTo(pp) > 400) { G.scene.remove(h.g); this.helis.splice(i, 1); continue; } }
      else { const tgt = this.seen ? pp : this.lastPos; tx = tgt.x + Math.cos(h.a) * 32; ty = 42; tz = tgt.z + Math.sin(h.a) * 32; }
      const p = h.g.position; const k = 1 - Math.exp(-dt * 0.8);
      const vx = (tx - p.x) * k, vz = (tz - p.z) * k;
      p.x += vx; p.y += (ty - p.y) * k; p.z += vz;
      h.g.rotation.y = Math.atan2(pp.x - p.x, pp.z - p.z); h.g.rotation.z = -vx * 0.05; h.g.rotation.x = vz * 0.05;
      h.spot.intensity = nightU.value > 0.3 && !h.leaving ? 900 : 0;
      h.spot.target.position.copy(h.g.worldToLocal(pp.clone()));
      if (W >= 4 && !h.leaving && this.seen) {
        h.fireT -= dt;
        if (h.fireT < 0) { h.fireT = rand(0.8, 1.6); const o = p.clone().add(new THREE.Vector3(0, -1.2, 0)); const d = pp.clone().add(new THREE.Vector3(0, 1, 0)).sub(o).normalize(); fireWeapon({ team: 'cop', heli: true }, 'rifle', o, d, o, 2.4); }
      }
    }
    this.sirenLevel = 0;
    for (const u of this.units) if (u.v.siren && !u.v.dead) this.sirenLevel = Math.max(this.sirenLevel, 1 - u.v.pos.distanceTo(G.camera.position) / 200);
    this.heliLevel = 0;
    for (const h of this.helis) this.heliLevel = Math.max(this.heliLevel, 1 - h.g.position.distanceTo(G.camera.position) / 250);
  }
  reset() {
    for (const u of this.units) { G.vehicles.delete(u.v); u.v.dispose(); }
    for (const h of this.helis) G.scene.remove(h.g);
    for (const c of this.cops) this.game.peds.remove(c);
    this.units = []; this.helis = []; this.cops = []; G.wanted = 0;
  }
}
