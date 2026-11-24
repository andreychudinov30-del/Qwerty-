// Mission runner + scripting helpers (async scripts with markers, cutscenes, chases, races, fights, choices)
import * as THREE from 'three';
import { G, clamp, rand, pick, bus, fmtMoney } from '../core/util.js';
import { Vehicle } from '../entities/vehicle.js';
import { Ped } from '../ai/peds.js';
import { AIDriver } from '../ai/driver.js';
import { addBust } from '../ai/traffic.js';
import { STORY } from './story.js';
import { CURB } from '../world/citygen.js';
import { setTouchMode, I } from '../core/input.js';

class Abort extends Error { constructor(r) { super(r); this.reason = r; } }

const markerGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
const markerMat = (c) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uC: { value: new THREE.Color(c) }, uT: { value: 0 } },
  vertexShader: 'varying float vY; void main(){ vY=position.y+0.5; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 uC; uniform float uT; varying float vY; void main(){ float a=(1.-vY)*0.55*(0.75+0.25*sin(uT*4.)); gl_FragColor=vec4(uC*a*1.6,a); }',
});

export class Missions {
  constructor(game) {
    this.game = game; this.waiters = []; this.fails = []; this.active = null; this.tracked = { peds: [], cars: [], markers: [], blips: [] };
    this.token = 0; this.giverMarker = null; this.timer = null;
    G.missionActive = false;
    bus.on('playerDied', () => { if (this.active) this.fail('Вы погибли'); });
    bus.on('busted', () => { if (this.active) this.fail('Вы арестованы'); });
  }
  // ----- progression -----
  current() { return STORY[G.state.mission] || null; }
  gpsTarget() {
    if (this.active && this._gps) return this._gps;
    const m = this.current(); return m && !this.active ? m.start : null;
  }
  refreshGiver() {
    if (this.giverMarker) { this.removeMarker(this.giverMarker); this.giverMarker = null; }
    const m = this.current();
    this.game.hud.blips = this.game.hud.blips.filter((b) => b.kind !== 'giver');
    if (!m || this.active) return;
    this.giverMarker = this.marker(m.start, { color: '#f2b632', r: 1.6, h: 2.5 });
    this.game.hud.blips.push({ x: m.start.x, z: m.start.z, icon: 'mission', letter: m.letter, color: '#f2b632', edge: true, kind: 'giver', label: m.title });
    this.game.hud.setRoute(this.game.hud.waypoint || m.start);
  }
  update(dt) {
    for (const mk of this.tracked.markers) mk.mat.uniforms.uT.value += dt;
    if (this.giverMarker) this.giverMarker.mat.uniforms.uT.value += dt;
    if (!this.active) {
      const m = this.current();
      if (m && !G.cutscene && !G.interior && !this.game.player.wasted) {
        const p = this.game.player.wpos();
        const d = Math.hypot(p.x - m.start.x, p.z - m.start.z);
        const pl = this.game.player; if (d > 6) this.needLeave = false;
        if (!this.needLeave && d < 3.5 && (pl.state === 'foot' || (pl.state === 'car' && pl.car && Math.abs(pl.car.speed) < 4))) this.start(G.state.mission);
        else if (d < 30) this.game.hud.prompt(`<b>${m.chapter}</b> · ${m.title}`);
      }
      return;
    }
    // timer
    if (this.timer) {
      this.timer.left -= dt;
      this.game.hud.el.obj.dataset.timer = '';
      if (this.timer.left <= 0) { const r = this.timer.fail; this.timer = null; this.fail(r || 'Время вышло'); return; }
    }
    for (const f of this.fails) { const r = f(); if (r) { this.fail(r); return; } }
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      let ok = false; try { ok = w.check(dt); } catch (e) { console.error(e); }
      if (ok) { this.waiters.splice(i, 1); w.resolve(ok); }
    }
    if (this.objText) this.game.hud.objective(this.objText + (this.timer ? ` <b>⏱ ${Math.max(0, Math.ceil(this.timer.left))}</b>` : ''));
  }
  async start(idx) {
    const m = STORY[idx]; if (!m || this.active) return;
    this.game.hud.prompt(null);
    this.active = m; G.missionActive = true; const tok = ++this.token;
    if (this.giverMarker) { this.removeMarker(this.giverMarker); this.giverMarker = null; }
    this.game.hud.blips = this.game.hud.blips.filter((b) => b.kind !== 'giver');
    this.game.hud.banner(m.title, `${m.chapter} · Миссия ${idx + 1}`, 3.5);
    G.audio.jingle(true);
    const M = this.helpers(tok);
    this.saveSnap = { money: G.state.money };
    try {
      await m.run(M, G.state);
      if (tok !== this.token) return;
      this.complete(m, idx);
    } catch (e) {
      if (!(e instanceof Abort)) console.error(e);
    }
  }
  complete(m, idx) {
    const st = G.state;
    this.cleanup();
    const reward = typeof m.reward === 'function' ? m.reward(st) : m.reward || 0;
    st.money += reward;
    if (!st.completed.includes(idx)) st.completed.push(idx);
    st.mission = Math.max(st.mission, idx + 1);
    st.stats.missions++;
    this.game.hud.banner('МИССИЯ ВЫПОЛНЕНА', reward ? `<span style="color:#7ef09a">+${fmtMoney(reward)}</span>` : '', 5);
    G.audio.jingle(true); G.audio.money();
    this.active = null; G.missionActive = false; this.objText = '';
    this.game.hud.objective('');
    this.game.save();
    if (m.after) m.after(st, this.game);
    if (st.mission >= STORY.length && !st.endingShown) { st.endingShown = true; this.game.save(); this.game.showEnding(); }
    setTimeout(() => this.refreshGiver(), 3000);
  }
  fail(reason) {
    if (!this.active) return;
    const m = this.active;
    this.token++;
    for (const w of this.waiters) w.reject(new Abort(reason));
    this.waiters = [];
    this.cleanup();
    this.active = null; G.missionActive = false; this.objText = '';
    this.game.hud.objective('');
    this.needLeave = true;
    this.game.hud.banner('МИССИЯ ПРОВАЛЕНА', reason, 5, true);
    G.audio.jingle(false);
    this.endCutscene();
    setTimeout(() => this.refreshGiver(), 4000);
  }
  cleanup() {
    for (const p of this.tracked.peds) if (this.game.peds.list.includes(p)) { if (p.dead) { p.mission = null; p.keep = false; } else this.game.peds.remove(p); }
    for (const v of this.tracked.cars) { if (G.player.car === v) { v.mission = null; continue; } if (v.keepAfter) { v.mission = null; continue; } G.vehicles.delete(v); v.dispose(); }
    for (const mk of this.tracked.markers) this.removeMarker(mk, true);
    this.game.hud.blips = this.game.hud.blips.filter((b) => b.kind !== 'mission');
    this.tracked = { peds: [], cars: [], markers: [], blips: [] };
    this.fails = []; this.timer = null; this._gps = null;
    this.game.hud.setRoute(this.game.hud.waypoint || null);
    this.game.hud.clearSubs();
    G.lockWeather = false; G.noWanted = false;
    if (this.drivers) this.drivers = [];
  }
  marker(p, { color = '#f2b632', r = 2.5, h = 3, ring = false } = {}) {
    const mat = markerMat(color);
    const m = new THREE.Mesh(markerGeo, mat);
    m.scale.set(r, h, r); m.position.set(p.x, (p.y ?? CURB) + h / 2, p.z); m.renderOrder = 6;
    G.scene.add(m);
    const mk = { mesh: m, mat };
    return mk;
  }
  removeMarker(mk, fromTracked) { G.scene.remove(mk.mesh); mk.mat.dispose(); if (!fromTracked) { const i = this.tracked.markers.indexOf(mk); if (i >= 0) this.tracked.markers.splice(i, 1); } }
  endCutscene() {
    G.cutscene = false; this.game.cam.setCinematic(null); this.game.hud.letterbox(false);
    document.getElementById('skip').classList.add('hidden');
    this.game.hud.show(true);
    setTouchMode(this.game.player.state === 'car' ? 'car' : 'foot');
  }
  // =============== helper API for scripts ===============
  helpers(tok) {
    const self = this, game = this.game, hud = game.hud;
    const alive = () => { if (tok !== self.token) throw new Abort('stale'); };
    const until = (check) => { alive(); return new Promise((resolve, reject) => self.waiters.push({ check, resolve, reject })); };
    const plp = () => game.player.wpos();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const M = {
      st: G.state, game, flags: G.state.flags,
      text(t) { self.objText = t; hud.objective(t); },
      gps(p) { self._gps = p; hud.setRoute(p); },
      wait(sec) { let t = sec; return until((dt) => (t -= dt) <= 0); },
      until,
      blip(p, opts = {}) { const b = { x: p.x, z: p.z, icon: opts.icon || 'mission', color: opts.color || '#f2b632', letter: opts.letter, edge: opts.edge !== false, kind: 'mission', label: opts.label }; hud.blips.push(b); return b; },
      unblip(b) { hud.blips = hud.blips.filter((x) => x !== b); },
      marker(p, o) { const mk = self.marker(p, o); self.tracked.markers.push(mk); return mk; },
      unmark(mk) { if (mk) self.removeMarker(mk); },
      async goto(p, { r = 4, text, car = 'any', color, marker = true, label } = {}) {
        if (text) M.text(text);
        const mk = marker ? M.marker(p, { color: color || '#f2b632', r: Math.min(r, 3) }) : null;
        const b = M.blip(p, { color: color || '#f2b632', label }); M.gps(p);
        await until(() => {
          const pl = game.player; if (pl.wasted) return false;
          if (car === 'none' && pl.state !== 'foot') return false;
          if (car instanceof Vehicle && pl.car !== car) return false;
          if (car === 'vehicle' && pl.state !== 'car') return false;
          return dist(plp(), p) < r;
        });
        M.unmark(mk); M.unblip(b); M.gps(null);
      },
      say(who, text, dur) { alive(); hud.say(who, text, dur); },
      async talk(lines) { for (const [w, t] of lines) hud.say(w, t); await until(() => !hud.speaking); },
      async cutscene(shots, lines = [], { keepPlayer = false } = {}) {
        alive();
        G.cutscene = true; hud.letterbox(true); hud.show(false); hud.objective('');
        const skip = document.getElementById('skip'); skip.classList.remove('hidden');
        let skipped = false; const onSkip = () => { skipped = true; }; skip.onclick = onSkip;
        for (const [w, t] of lines) hud.say(w, t);
        let i = 0, t = 0;
        const next = () => { const s = shots[i]; if (!s) return; game.cam.setCinematic({ ...s, cut: true, t: 0 }); };
        next();
        await until((dt) => {
          if (I.pressed.has('cineSkip') || I.pressed.has('pause') || I.pressed.has('confirm')) skipped = true;
          t += dt;
          if (shots[i] && t > (shots[i].hold || shots[i].dur || 4) && i < shots.length - 1) { i++; t = 0; next(); }
          return skipped || (!hud.speaking && t > (shots[i] ? (shots[i].hold || shots[i].dur || 3) : 0));
        });
        hud.clearSubs();
        self.endCutscene();
      },
      shot(from, at, opts = {}) { return { from: new THREE.Vector3(from[0], from[1], from[2]), at: new THREE.Vector3(at[0], at[1], at[2]), to: opts.to ? new THREE.Vector3(...opts.to) : null, at2: opts.at2 ? new THREE.Vector3(...opts.at2) : null, dur: opts.dur || 5, hold: opts.hold, fov: opts.fov || 45 }; },
      // camera shot relative to a world point (orbit-ish)
      around(p, ang, dist, h, opts = {}) { const fx = p.x + Math.sin(ang) * dist, fz = p.z + Math.cos(ang) * dist; return M.shot([fx, (p.y || 0) + h, fz], [p.x, (p.y || 0) + (opts.lookH ?? 1.5), p.z], { to: opts.orbit ? [p.x + Math.sin(ang + opts.orbit) * dist, (p.y || 0) + h, p.z + Math.cos(ang + opts.orbit) * dist] : null, dur: opts.dur || 5, fov: opts.fov }); },
      ped(pos, opts = {}) {
        const p = new Ped(game.peds, pos.x, pos.z, opts); p.mission = opts.role || 'actor'; p.keep = true; p.name = opts.name;
        if (opts.weapon && opts.showWeapon !== false) p.h.hold(opts.weapon === 'fists' ? null : (opts.weapon === 'pistol' ? 'pistol' : opts.weapon));
        p.h.pos.y = pos.y ?? CURB; p.state = opts.state || 'stand'; p.h.heading = opts.heading ?? 0; p.faceTo = opts.faceTo || null;
        if (opts.team) p.team = opts.team;
        if (opts.health) p.health = opts.health;
        game.peds.list.push(p); self.tracked.peds.push(p);
        if (opts.blip) p._blip = M.blip(p.h.pos, { color: opts.blip, icon: 'dot', edge: false });
        return p;
      },
      enemies(center, n, opts = {}) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), r = opts.spread ?? rand(3, 9);
          const p = M.ped({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }, { team: 'enemy', weapon: opts.weapon || pick(['pistol', 'pistol', 'smg']), showWeapon: true, look: opts.look ? { ...opts.look } : undefined, health: opts.health || 90, accuracy: opts.accuracy || 1.8 });
          p.mission = 'enemy'; p.state = opts.passive ? 'stand' : 'combat'; p.threat = opts.passive ? null : G.player;
          out.push(p);
        }
        return out;
      },
      ally(pos, opts = {}) { const p = M.ped(pos, { ...opts, team: 'ally', role: 'ally' }); p.mission = 'ally'; p.state = opts.state || 'stand'; p.invuln = opts.invuln; return p; },
      car(type, pos, heading = 0, opts = {}) {
        const v = new Vehicle({ scene: G.scene, physics: G.physics }, type, { color: opts.color });
        v.place(pos.x, pos.z, heading, pos.y ?? 0);
        if (opts.kinematic) v.makeKinematic(); else v.makeDynamic();
        v.mission = true; v.missionColor = opts.color2 || '#ff9a2a'; v.keepAfter = opts.keep;
        if (opts.driver) { addBust(v, opts.driverLook || { shirt: '#1a1a1a', skin: '#e0ac88', hair: '#1a1410' }); v.driver = { npc: true, mission: true }; }
        if (opts.health) { v.health = v.maxHealth = opts.health; }
        G.vehicles.add(v); self.tracked.cars.push(v);
        return v;
      },
      drive(v, opts) { const ai = new AIDriver(v, opts); self.drivers = self.drivers || []; self.drivers.push(ai); v.ai = ai; return ai; },
      stopDrive(v) { if (v.ai) { self.drivers = (self.drivers || []).filter((a) => a !== v.ai); v.ai = null; v.throttle = 0; v.brake = 1; } },
      async enterCar(v, text = 'Сядьте в машину') {
        M.text(text); const b = M.blip(v.pos, { color: '#4aa8ff', icon: 'mission', letter: '🚗' });
        await until(() => { b.x = v.pos.x; b.z = v.pos.z; return game.player.car === v; });
        M.unblip(b);
      },
      failIf(fn) { self.fails.push(fn); },
      protect(ped, name) { self.fails.push(() => ped.dead ? `${name || 'Союзник'} погиб` : null); },
      protectCar(v, name = 'Машина') { self.fails.push(() => v.dead || v.health <= 0 ? `${name} уничтожена` : null); },
      timer(sec, fail) { self.timer = { left: sec, fail }; },
      stopTimer() { self.timer = null; },
      async eliminate(list, text = 'Уничтожьте противников') {
        M.text(text + ` (${list.length})`);
        for (const p of list) if (!p._blip) p._blip = M.blip(p.h.pos, { color: '#ff3a3a', icon: 'dot', edge: false });
        await until(() => {
          let left = 0; for (const p of list) { if (!p.dead) { left++; p._blip.x = p.h.pos.x; p._blip.z = p.h.pos.z; } else if (p._blip) { M.unblip(p._blip); p._blip = null; } }
          M.text(text + ` (${left})`); return left === 0;
        });
      },
      async chase(v, { mode = 'destroy', text, escape = 220, hp = 0.25 } = {}) {
        M.text(text || 'Догоните цель'); const b = M.blip(v.pos, { color: '#ff3a3a', icon: 'mission', letter: '◎' });
        self.fails.push(() => dist(v.pos, plp()) > escape ? 'Цель скрылась' : null);
        await until(() => {
          b.x = v.pos.x; b.z = v.pos.z;
          if (mode === 'destroy') return v.dead || v.health <= 0;
          if (mode === 'stop') return v.health < v.maxHealth * hp || v.dead;
          return false;
        });
        M.unblip(b); self.fails.pop();
        M.stopDrive(v);
      },
      async tail(v, { min = 12, max = 110, text = 'Следуйте за целью, не приближаясь', until: endFn }) {
        M.text(text); const b = M.blip(v.pos, { color: '#ff9a2a', icon: 'mission', letter: '◎' });
        let close = 0;
        await until((dt) => {
          b.x = v.pos.x; b.z = v.pos.z;
          const d = dist(v.pos, plp());
          if (d > max) { self.fail('Вы потеряли цель'); return false; }
          if (d < min) { close += dt; M.text('<b>Слишком близко!</b> Отстаньте'); if (close > 3) { self.fail('Вас заметили'); return false; } } else { close = Math.max(0, close - dt); M.text(text); }
          return endFn();
        });
        M.unblip(b);
      },
      async race(cps, opps = [], { text = 'Гонка', laps = 1, ghostStart } = {}) {
        let i = 0; const all = [];
        for (let l = 0; l < laps; l++) all.push(...cps);
        let mk = null, b = null;
        const show = () => { if (mk) M.unmark(mk); if (b) M.unblip(b); const c = all[i]; if (!c) return; mk = M.marker(c, { color: '#3fd0ff', r: 7, h: 5 }); b = M.blip(c, { color: '#3fd0ff', label: 'КП' }); M.gps(c); };
        show();
        for (const o of opps) { o.ai = new AIDriver(o, { mode: 'checkpoints', checkpoints: all, max: o.raceMax || 40, aggr: 0.8 }); self.drivers = self.drivers || []; self.drivers.push(o.ai); }
        await until(() => {
          const c = all[i]; const p = plp();
          if (dist(c, p) < 9) { i++; G.audio.beep(1200, 0.08, 0.15); if (i >= all.length) return true; show(); }
          let pos = 1; for (const o of opps) if (o.ai.cpi > i || (o.ai.cpi === i && dist(all[i], o.pos) < dist(all[i], p))) pos++;
          M.text(`${text}: позиция <b>${pos}/${opps.length + 1}</b> · КП ${i}/${all.length}`);
          for (const o of opps) if (o.ai.cpi >= all.length) { self.fail('Соперник финишировал первым'); return false; }
          return false;
        });
        if (mk) M.unmark(mk); if (b) M.unblip(b); M.gps(null);
        for (const o of opps) M.stopDrive(o);
      },
      async collect(points, text = 'Найдите улики') {
        const items = points.map((p) => ({ p, mk: M.marker(p, { color: '#7ef09a', r: 0.8, h: 1.5 }), b: M.blip(p, { color: '#7ef09a', icon: 'mission', letter: '?' }), got: false }));
        await until(() => {
          let left = 0;
          for (const it of items) { if (it.got) continue; if (dist(it.p, plp()) < 1.8 && game.player.state === 'foot') { it.got = true; M.unmark(it.mk); M.unblip(it.b); G.audio.beep(1500, 0.1, 0.15); if (it.p.note) hud.notify('🔎 ' + it.p.note, 6000); } else left++; }
          M.text(`${text} (${items.length - left}/${items.length})`); return left === 0;
        });
      },
      async photo(target, text = 'Сфотографируйте цель') {
        if (!G.state.weapons.camera) game.player.giveWeapon('camera');
        game.player.weapon = 'camera'; game.player.h.hold('camera');
        M.text(text + ' (оружие: Фотоаппарат, прицел и выстрел)');
        let ok = false;
        const off = bus.on('photo', (o, d) => {
          const t = typeof target === 'function' ? target() : target;
          const v = new THREE.Vector3(t.x - o.x, (t.y ?? 1.5) - o.y, t.z - o.z); const l = v.length();
          if (l < 60 && v.normalize().dot(d) > 0.96) { ok = true; hud.notify('📷 Отличный снимок!'); } else hud.notify('📷 Цель не в кадре — подойдите ближе');
        });
        await until(() => ok); off();
      },
      async loseCops(n, text = 'Оторвитесь от полиции') {
        G.noWanted = false; game.police.setWanted(n); M.text(text);
        await until(() => G.wanted <= 0);
      },
      async defend(center, waves, text = 'Удержите позицию') {
        for (let w = 0; w < waves.length; w++) {
          M.text(`${text}: волна ${w + 1}/${waves.length}`); hud.notify(`⚔ Волна ${w + 1}`);
          const a = rand(0, 6.28); const c = { x: center.x + Math.cos(a) * 35, z: center.z + Math.sin(a) * 35 };
          const list = M.enemies(c, waves[w], { spread: 5 });
          await M.eliminate(list, `${text}: волна ${w + 1}/${waves.length}`);
          await M.wait(2);
        }
      },
      async escort(ped, to, text = 'Доставьте союзника') {
        ped.state = 'follow'; M.protect(ped, ped.name || 'Союзник');
        await M.goto(to, { text, r: 6 });
        await until(() => game.player.state === 'foot' ? dist(ped.h.pos, to) < 8 : true);
        ped.state = 'stand';
      },
      passenger(ped, v) { // seat an ally into vehicle (visual bust)
        ped.inCar = v; ped.h.setVisible(false); if (!v.passBust) { const b = addBust(v, ped.h.look); b.position.x = -0.38; v.passBust = b; v.bust = v.bust === b ? null : v.bust; }
      },
      unpassenger(ped, v) { ped.inCar = null; ped.h.setVisible(true); const s = v.pos.clone().add(new THREE.Vector3(-Math.cos(v.heading) * 2, 0, Math.sin(v.heading) * 2)); ped.h.pos.set(s.x, CURB, s.z); if (v.passBust) { v.inner.remove(v.passBust); v.passBust = null; } },
      async choice(q, opts) {
        alive();
        G.cutscene = true; if (document.pointerLockElement) document.exitPointerLock();
        const el = document.getElementById('choice');
        el.innerHTML = `<div class="q">${q}</div>` + opts.map((o, i) => `<button class="btn" data-i="${i}">${i + 1}. ${o}</button>`).join('');
        el.classList.remove('hidden'); G.uiOpen = true;
        const r = await new Promise((res) => { el.querySelectorAll('button').forEach((b) => b.onclick = () => res(+b.dataset.i)); });
        el.classList.add('hidden'); G.uiOpen = false; G.cutscene = false;
        return r;
      },
      setTime(h) { G.hour = h; },
      weather(w) { G.lockWeather = true; G.atmo.setWeather(w, false); },
      give(id, ammo) { game.player.giveWeapon(id, ammo); hud.notify(`Получено: ${id === 'camera' ? 'фотоаппарат' : id}`); },
      money(n) { G.state.money += n; G.audio.money(); },
      wanted(n) { game.police.setWanted(n); },
      noWanted(on = true) { G.noWanted = on; if (on) game.police.setWanted(0); },
      async fade(fn) { await hud.fade(true, 0.6); if (fn) await fn(); await hud.fade(false, 0.6); },
      teleport(p, h = 0) { const pl = game.player; if (pl.state === 'car') pl.exitCar(); pl.teleport(p.x, p.y ?? CURB + 0.05, p.z, h); game.cam.yaw = h; },
      putInCar(v) { game.player.enterCar(v); },
      dist, plp,
      LM: G.city.landmarks,
    };
    return M;
  }
  updateDrivers(dt) { if (this.drivers) for (const d of this.drivers) d.update(dt); }
}
