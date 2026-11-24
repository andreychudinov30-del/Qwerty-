// Pedestrian AI: personalities, schedules, memory, perception, chats, reactions, fights, gang conflicts, cops on foot
import * as THREE from 'three';
import { G, clamp, lerp, rand, randi, pick, chance, angDiff, wrapAng, SpatialHash, bus, hash2, _v1, _v2 } from '../core/util.js';
import { Human, randomLook } from '../entities/human.js';
import { WEAPONS, fireWeapon } from '../game/weapons.js';
import { CELL, RW, CURB, isRoad, district } from '../world/citygen.js';

const LINES = {
  chat: [['Видел новости? Опять стройка у «Вертекса».', 'Эта корпорация скоро весь город скупит.'], ['Как работа?', 'Начальник снова орёт. Думаю уволиться.'], ['Пойдём вечером в «Волну»?', 'Если дождя не будет — пойдём!'], ['Цены на бензин опять выросли.', 'Скоро будем на велосипедах ездить.'], ['Слышал, в порту опять стреляли?', 'Говорят, банды делят территорию.'], ['Ты смотрел вчерашний матч?', 'Наши опять проиграли, позор!'], ['Мэр обещал новые дороги.', 'Он это каждый год обещает.'], ['У меня кот научился открывать холодильник.', 'Серьёзно? Мой только спит.'], ['Говорят, полиция берёт взятки.', 'Тише ты, не здесь.'], ['Видел того парня на старом седане?', 'Новенький какой-то. Или старенький…'], ['Я вчера выиграл в лотерею!', 'Сколько? Пятьсот? Поздравляю…'], ['Хочу переехать к морю.', 'Мы и так у моря. Просто его не видно за небоскрёбами.']],
  rain: ['Ну вот, опять дождь!', 'Зонт забыл, как всегда…', 'Промок до нитки!', 'Кто вообще заказывал эту погоду?'],
  bump: ['Эй, смотри куда идёшь!', 'Осторожнее!', 'Ты что, слепой?', 'Полегче, приятель!', 'Извините… хотя нет, это вы меня толкнули!'],
  angry: ['Ну всё, ты нарвался!', 'Сейчас получишь!', 'Иди сюда!', 'Я тебе покажу!'],
  flee: ['Помогите!', 'Он стреляет!', 'Бегите!', 'Вызовите полицию!', 'Не стреляйте!', 'А-а-а!'],
  crash: ['Ты где права купил?!', 'Моя машина!', 'Вызовите эвакуатор!', 'Куда ты гонишь?!', 'Совсем с ума сошёл!'],
  greet: ['Привет!', 'Добрый день!', 'Хорошего дня!', 'Чего уставился?', 'Классная куртка.'],
  aimed: ['Не стреляй! Забирай что хочешь!', 'Пожалуйста, не надо!', 'Спокойно, спокойно…'],
  cop: ['Стоять! Полиция!', 'Руки за голову!', 'На землю!', 'Подозреваемый вооружён!'],
  gang: ['Это наш район!', 'Вали отсюда!', 'Ребята, мочи их!', 'За Северных волков!', 'Порт наш!'],
  phone: ['Да, мам, я уже еду.', 'Нет, отчёт будет завтра.', 'Слушай, я перезвоню.', 'Ты не поверишь, что я сейчас видел!'],
  body: ['О боже! Тут человек лежит!', 'Кто-нибудь, вызовите скорую!'],
  night: ['Поздно уже, пора домой.', 'Не люблю ходить тут ночью.'],
};
const JOBS = ['office', 'worker', 'student', 'tourist', 'jogger', 'retiree', 'shopper', 'courier'];
const PSPEED = { walk: 1.35, jog: 3.4, run: 5.6 };

let PID = 0;
export class Ped {
  constructor(sys, x, z, opts = {}) {
    this.sys = sys; this.id = ++PID;
    const look = opts.look || randomLook();
    if (opts.team === 'cop') Object.assign(look, { shirt: '#1a2a5a', pants: '#141a2a', jacket: '#141c38', hairStyle: 'cap', shoes: '#111111', vest: '#20283a' });
    if (opts.team === 'gangN') Object.assign(look, { jacket: '#1a1a1a', shirt: '#2a6a9a', hairStyle: pick(['beanie', 'bald', 'short']) });
    if (opts.team === 'gangP') Object.assign(look, { jacket: '#5a1a1a', shirt: '#c8a020', hairStyle: pick(['cap', 'short', 'bald']) });
    this.h = new Human({ scene: G.scene, physics: G.physics }, look);
    this.h.ped = this;
    this.h.pos.set(x, CURB, z); this.h.heading = rand(-3, 3);
    this.team = opts.team || 'civ';
    this.job = opts.job || pick(JOBS);
    this.p = { brave: Math.random(), aggr: Math.random() * (this.team === 'civ' ? 0.8 : 1), social: Math.random(), honest: Math.random() };
    if (this.team !== 'civ') { this.p.brave = 0.8 + Math.random() * 0.2; this.p.aggr = 0.85; }
    this.health = opts.health || (this.team === 'cop' ? 120 : 100);
    this.weapon = opts.weapon || (this.team === 'cop' ? 'pistol' : this.team.startsWith('gang') ? pick(['pistol', 'pistol', 'smg']) : null);
    this.state = 'walk'; this.t = 0; this.target = null; this.threat = null; this.memory = [];
    this.speedT = this.job === 'jogger' ? PSPEED.jog : PSPEED.walk * rand(0.85, 1.15);
    this.fireT = rand(0.5, 1.5); this.dead = false; this.inCar = null;
    this.mission = opts.mission || null; this.name = opts.name || null;
    this.umbrella = false; this.bubbleT = 0; this.decT = 0; this.angryAt = null;
    this.accuracy = opts.accuracy || (this.team === 'cop' ? 1.2 : 1.8);
    this.isPed = true;
    this.h.hold(this.weapon && opts.showWeapon ? WEAPONS[this.weapon].mesh : (chance(0.08) && this.team === 'civ' ? 'phone' : null));
    if (this.h.heldKind === 'phone') this.onPhone = true;
  }
  get pos() { return this.h.pos; }
  say(text, dur = 3, angry = false) { this.sys.bubble(this, text, dur, angry); }
  remember(type, who, x, z) { this.memory.push({ type, who, x, z, t: G.t }); if (this.memory.length > 8) this.memory.shift(); }
  hurt(dmg, src, dir, melee = false) {
    if (this.dead) return;
    if (this.invuln) return;
    this.health -= dmg;
    this.remember('hurt', src, this.h.pos.x, this.h.pos.z);
    if (src && src.isPlayer) { this.angryAt = src; bus.emit('pedHurt', this, src); }
    if (this.health <= 0) { this.die(src, dir, melee); return; }
    if (melee) {
      if (this.p.aggr > 0.55 || this.team !== 'civ') { this.state = 'fight'; this.threat = src; this.say(pick(LINES.angry), 2, true); }
      else { this.state = 'flee'; this.threat = src; this.say(pick(LINES.flee), 2); }
      if (Math.random() < 0.25 && dir) this.h.startRagdoll(new THREE.Vector3(dir.x * 3, 1.5, dir.z * 3), 2), this.state = 'ragdoll';
    } else if (this.weapon && this.team !== 'civ') { this.state = 'combat'; this.threat = src; }
    else { this.state = 'flee'; this.threat = src; }
  }
  die(src, dir, melee) {
    this.dead = true; this.state = 'dead'; this.deadT = 0;
    const v = dir ? new THREE.Vector3(dir.x * (melee ? 3 : 2), 1, dir.z * (melee ? 3 : 2)) : new THREE.Vector3(0, 0.5, 0);
    if (!this.h.ragdoll) this.h.startRagdoll(v, 2);
    this.h.hold(null);
    bus.emit('pedKilled', this, src);
    if (src && src.isPlayer) G.state.stats.kills++;
    if (this.bubbleEl) this.sys.hideBubble(this);
  }
  knock(vel, src) {
    if (this.dead) return;
    if (this.h.ragdoll) return;
    const sp = vel.length();
    this.h.startRagdoll(vel, 4);
    this.state = 'ragdoll';
    this.health -= sp * 5.5;
    if (src && src.isPlayer) bus.emit('pedHurt', this, src, 'car');
    if (this.health <= 0) { this.dead = true; this.state = 'dead'; this.deadT = 0; bus.emit('pedKilled', this, src); }
    else { this.remember('hitByCar', src, this.h.pos.x, this.h.pos.z); this.angryAt = src; }
  }
}

export class PedSystem {
  constructor(game) {
    this.game = game; this.list = []; this.hash = new SpatialHash(12); this._q = [];
    this.bubbles = document.getElementById('bubbles'); this.bubblePool = [];
    this.spawnT = 0; this.eventT = 90;
    bus.on('noise', (n) => this.onNoise(n));
    bus.on('crash', (v, mag, p) => { if (mag > 6) this.onNoise({ x: p.x, z: p.z, r: 30, type: 'crash', src: v.driver }); });
    bus.on('explosion', (p, r) => { this.onNoise({ x: p.x, z: p.z, r: 80, type: 'gunshot', src: null }); this.blast(p, r); });
    G.peds = this.list;
  }
  query(x, z, r) { return this.hash.query(x, z, r, this._q); }
  max() { return this.game.q.peds; }
  spawnAround(px, pz, n) {
    const pts = G.city.walkPts;
    for (let i = 0; i < n; i++) {
      // pick random sidewalk point 40..140 m away, prefer outside view
      let best = null;
      for (let k = 0; k < 12; k++) {
        const w = pts[(Math.random() * pts.length) | 0];
        const d = Math.hypot(w.x - px, w.z - pz);
        if (d < 35 || d > 150) continue;
        best = w; if (!this.inView(w.x, w.z)) break;
      }
      if (!best) continue;
      const hr = G.hour;
      const night = hr < 6 || hr > 22;
      const dist = district(Math.floor(best.x / CELL), Math.floor(best.z / CELL));
      if (night && Math.random() < 0.5) continue;
      let team = 'civ';
      if ((dist === 'industrial' || dist === 'port') && night && chance(0.35)) team = chance(0.5) ? 'gangN' : 'gangP';
      if (dist === 'downtown' && chance(0.05)) team = 'cop';
      const p = new Ped(this, best.x + rand(-1, 1), best.z + rand(-1, 1), { team });
      p.target = this.nextWalk(p, best);
      if (G.atmo && G.atmo.w.rain > 0.4 && chance(0.45) && team === 'civ') { p.h.hold('umbrella'); p.umbrella = true; }
      if (team === 'cop') { p.h.hold('pistol'); p.patrol = true; }
      this.list.push(p);
    }
  }
  inView(x, z) {
    const c = G.camera; const dx = x - c.position.x, dz = z - c.position.z;
    const f = _v1.set(0, 0, -1).applyQuaternion(c.quaternion);
    return (dx * f.x + dz * f.z) / Math.hypot(dx, dz) > 0.5;
  }
  // choose next sidewalk waypoint (corner of block, or cross the street at a crosswalk)
  nextWalk(p, from) {
    const x = from ? from.x : p.h.pos.x, z = from ? from.z : p.h.pos.z;
    const i = Math.floor(x / CELL + 0.5 - 0.5), j = Math.floor(z / CELL);
    const bi = Math.round((x - CELL / 2) / CELL), bj = Math.round((z - CELL / 2) / CELL);
    const e = RW + 3.0;
    const corners = [[bi * CELL + e, bj * CELL + e], [bi * CELL + CELL - e, bj * CELL + e], [bi * CELL + CELL - e, bj * CELL + CELL - e], [bi * CELL + e, bj * CELL + CELL - e]];
    // find nearest corner index
    let ci = 0, bd = 1e9; corners.forEach((c, k) => { const d = Math.hypot(c[0] - x, c[1] - z); if (d < bd) { bd = d; ci = k; } });
    if (bd < 3 && Math.random() < 0.3) {
      // cross street: mirror across the nearer road
      const c = corners[ci];
      const crossX = Math.random() < 0.5;
      const nx = crossX ? (ci === 0 || ci === 3 ? c[0] - 2 * e : c[0] + 2 * e) : c[0];
      const nz = crossX ? c[1] : (ci === 0 || ci === 1 ? c[1] - 2 * e : c[1] + 2 * e);
      if (G.city.blocks.some((b) => nx > b.x0 - 6 && nx < b.x1 + 6 && nz > b.z0 - 6 && nz < b.z1 + 6)) return { x: nx, z: nz, cross: true, axis: crossX ? 'EW' : 'NS' };
    }
    const nxt = corners[(ci + (Math.random() < 0.5 ? 1 : 3)) % 4];
    if (bd >= 3) return { x: corners[ci][0] + rand(-0.6, 0.6), z: corners[ci][1] + rand(-0.6, 0.6) };
    return { x: nxt[0] + rand(-0.8, 0.8), z: nxt[1] + rand(-0.8, 0.8) };
  }
  ejectDriver(v, jacker) {
    const look = v.driverLook || randomLook();
    const side = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
    const p0 = v.pos.clone().addScaledVector(side, v.T.W / 2 + 0.8);
    const p = new Ped(this, p0.x, p0.z, { look });
    p.h.pos.y = Math.max(0, v.pos.y - v.originH);
    this.list.push(p);
    v.driver = null; if (v.bust) v.bust.visible = false;
    p.h.startRagdoll(side.clone().multiplyScalar(3).add(new THREE.Vector3(0, 2, 0)), 3); p.state = 'ragdoll';
    p.angryAt = jacker; p.remember('carjacked', jacker, p0.x, p0.z);
    p.afterGetUp = p.p.aggr > 0.6 ? 'fight' : 'flee';
    setTimeout(() => p.say(pick(['Моя машина!', 'Эй! Это угон!', 'Вор! Держи вора!', 'Полиция!']), 3, true), 500);
    return p;
  }
  onNoise(n) {
    const list = this.query(n.x, n.z, n.r);
    for (const p of list) {
      if (p.dead || p.mission === 'actor' || p.state === 'ragdoll') continue;
      const d = Math.hypot(p.h.pos.x - n.x, p.h.pos.z - n.z);
      if (d > n.r) continue;
      p.remember(n.type, n.src, n.x, n.z);
      if (n.type === 'gunshot') {
        if (p.team === 'cop') { if (n.src && n.src !== p && !n.src.team) { p.state = 'combat'; p.threat = n.src; if (chance(0.3)) p.say(pick(LINES.cop), 2); } continue; }
        if (p.team !== 'civ' && p.weapon) { if (n.src && n.src.team !== p.team && n.src !== p) { p.state = 'combat'; p.threat = n.src; } continue; }
        if (p.mission) continue;
        if (p.state !== 'flee' && p.state !== 'cower') {
          if (d < 14 && p.p.brave < 0.45) { p.state = 'cower'; p.t = rand(5, 9); }
          else { p.state = 'flee'; p.threat = n.src || { pos: new THREE.Vector3(n.x, 0, n.z) }; p.fleeFrom = new THREE.Vector3(n.x, 0, n.z); p.t = rand(8, 14); }
          if (chance(0.35)) p.say(pick(LINES.flee), 2);
          if (n.src && n.src.isPlayer && chance(0.25)) bus.emit('witness', 'shot', p);
        }
      } else if (n.type === 'crash') {
        if (p.team === 'civ' && !p.mission && d < 25 && p.state === 'walk' && chance(0.4)) { p.state = 'look'; p.lookAt = new THREE.Vector3(n.x, 0, n.z); p.t = rand(2, 4); if (chance(0.5)) p.say(pick(LINES.crash), 2.5, true); }
      }
    }
  }
  blast(p, r) {
    for (const ped of this.query(p.x, p.z, r)) {
      const d = ped.h.pos.distanceTo(p); if (d > r || ped.inCar) continue;
      const dir = ped.h.pos.clone().sub(p).setY(0).normalize();
      if (!ped.h.ragdoll) ped.knock(dir.multiplyScalar((r - d) * 1.6).add(new THREE.Vector3(0, (r - d) * 0.8, 0)), null);
    }
    const pl = G.player;
    const d = pl.wpos().distanceTo(p);
    if (d < r) { pl.damage((r - d) * 9); if (pl.state === 'foot') pl.knockdown(pl.pos.clone().sub(p).setY(0).normalize().multiplyScalar(r - d).add(new THREE.Vector3(0, 3, 0))); }
    for (const v of G.vehicles) { if (v === undefined) continue; const dv = v.pos.distanceTo(p); if (dv < r && dv > 0.5) { v.damage((r - dv) * 60); if (v.rb_) v.rb_.applyImpulse({ x: (v.pos.x - p.x) / dv * (r - dv) * v.T.mass * 0.6, y: (r - dv) * v.T.mass * 0.5, z: (v.pos.z - p.z) / dv * (r - dv) * v.T.mass * 0.6 }, true); } }
  }
  // spawn a gang conflict near the player
  gangFight(x, z) {
    const a = rand(0, 6.28), sep = 22;
    const out = [];
    for (let s = 0; s < 2; s++) {
      const cx = x + Math.cos(a) * sep * (s ? 0.5 : -0.5), cz = z + Math.sin(a) * sep * (s ? 0.5 : -0.5);
      for (let i = 0; i < 3 + randi(0, 2); i++) {
        const p = new Ped(this, cx + rand(-3, 3), cz + rand(-3, 3), { team: s ? 'gangP' : 'gangN', showWeapon: true });
        p.state = 'combat'; p.gangEvent = true; this.list.push(p); out.push(p);
      }
    }
    for (const p of out) p.threat = this.closestEnemy(p, 80);
    out[0].say(pick(LINES.gang), 3, true); out[out.length - 1].say(pick(LINES.gang), 3, true);
    return out;
  }
  closestEnemy(p, r) {
    let best = null, bd = r;
    for (const o of this.query(p.h.pos.x, p.h.pos.z, r)) {
      if (o.dead || o === p || o.inCar) continue;
      if (!this.hostile(p, o)) continue;
      const d = o.h.pos.distanceTo(p.h.pos); if (d < bd) { bd = d; best = o; }
    }
    if (this.hostile(p, G.player) && !G.player.wasted) { const d = G.player.wpos().distanceTo(p.h.pos); if (d < bd) best = G.player; }
    return best;
  }
  hostile(a, b) {
    if (b.isPlayer) return a.team === 'cop' ? G.wanted > 0 : (a.team === 'enemy' || a.angryAt === b || (a.team.startsWith('gang') && a.provoked));
    if (a.team === 'ally') return b.team === 'enemy' || (b.team === 'cop' && G.wanted > 1);
    if (a.team === 'enemy') return b.team === 'ally';
    if (a.team.startsWith('gang') && b.team.startsWith('gang')) return a.team !== b.team;
    if (a.team === 'cop') return b.team.startsWith('gang') && b.state === 'combat';
    return false;
  }
  update(dt) {
    const pl = G.player, px = pl.x, pz = pl.z;
    this.hash.clear();
    for (const p of this.list) { const hp = p.h.ragdoll ? p.h.hipsPos() : p.h.pos; this.hash.insert(p, hp.x, hp.z); }
    // spawn / despawn
    this.spawnT -= dt;
    if (this.spawnT < 0 && !G.interior) {
      this.spawnT = 0.5;
      const civ = this.list.filter((p) => !p.mission && !p.gangEvent).length;
      const want = Math.round(this.max() * (G.hour > 23 || G.hour < 6 ? 0.45 : G.hour > 7 && G.hour < 20 ? 1 : 0.75) * (G.atmo && G.atmo.w.rain > 0.5 ? 0.7 : 1));
      if (civ < want) this.spawnAround(px, pz, Math.min(3, want - civ));
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d = Math.hypot(p.h.pos.x - px, p.h.pos.z - pz);
      const far = d > 190 || (p.dead && p.deadT > 40 && d > 40);
      if (far && !p.mission && !p.keep) { this.remove(p, i); continue; }
    }
    // gang conflicts (random event)
    this.eventT -= dt;
    if (this.eventT < 0 && !G.missionActive) {
      this.eventT = rand(150, 300);
      const night = G.hour < 6 || G.hour > 20;
      if (night || chance(0.4)) {
        const a = rand(0, 6.28), r = rand(70, 120), x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
        if (!G.city.insideBuilding(x, z)) { this.gangFight(x, z); G.hud.notify('⚠ Слышна перестрелка неподалёку'); }
      }
    }
    // chats: pair idle walkers
    if (Math.random() < 0.05) {
      const a = this.list[(Math.random() * this.list.length) | 0];
      if (a && a.state === 'walk' && a.team === 'civ' && !a.mission && a.p.social > 0.4) {
        for (const b of this.query(a.h.pos.x, a.h.pos.z, 4)) {
          if (b !== a && b.state === 'walk' && b.team === 'civ' && !b.mission && b.p.social > 0.3) { this.startChat(a, b); break; }
        }
      }
    }
    for (const p of this.list) this.think(p, dt, px, pz);
    this.updateBubbles();
  }
  startChat(a, b) {
    const conv = pick(LINES.chat).slice();
    // dynamic topics from memory / world
    if (G.atmo && G.atmo.w.rain > 0.4) conv.unshift(pick(LINES.rain));
    const mem = a.memory.find((m) => m.type === 'gunshot' && G.t - m.t < 120);
    if (mem) conv.unshift('Ты слышал выстрелы? Совсем рядом!');
    if (G.wanted > 2) conv.unshift('Вертолёт полиции кружит уже полчаса…');
    a.state = b.state = 'chat'; a.partner = b; b.partner = a; a.t = b.t = rand(7, 14);
    a.conv = conv; a.convI = 0; a.convT = 0.5; b.conv = null;
  }
  think(p, dt, px, pz) {
    const h = p.h;
    if (p.inCar) return;
    const dPl = Math.hypot(h.pos.x - px, h.pos.z - pz);
    p.t -= dt; p.decT -= dt; p.fireT -= dt;
    const lod = dPl > 70;
    if (p.state === 'ragdoll' || p.dead) {
      if (p.dead) { p.deadT += dt; if (h.ragdoll && h.ragdollUpdate(dt)) h.freezeRagdoll(); h.animate(dt); return; }
      if (h.ragdollUpdate(dt)) { h.endRagdoll(true); p.state = p.afterGetUp || (p.p.aggr > 0.7 && p.angryAt ? 'fight' : 'flee'); p.threat = p.angryAt; p.t = rand(6, 10); p.afterGetUp = null; if (p.state === 'fight') p.say(pick(LINES.angry), 2.5, true); else if (chance(0.5)) p.say(pick(LINES.crash), 2.5, true); }
      h.animate(dt); return;
    }
    // hit by vehicles
    this.vehicleHits(p);
    let speed = 0, face = null;
    switch (p.state) {
      case 'walk': {
        if (!p.target) p.target = this.nextWalk(p);
        // wait at crosswalk for green
        if (p.target.cross && G.props) {
          const sig = G.props.signal(p.target.axis === 'EW' ? 'NS' : 'EW');
          const onRoad = isRoad(h.pos.x, h.pos.z, -0.5);
          if (sig !== 0 && !onRoad && Math.hypot(p.target.x - h.pos.x, p.target.z - h.pos.z) > 10) { speed = 0; face = p.target; break; }
        }
        speed = p.speedT * (G.atmo && G.atmo.w.rain > 0.4 && !p.umbrella ? 1.6 : 1);
        face = p.target;
        if (Math.hypot(p.target.x - h.pos.x, p.target.z - h.pos.z) < 1.2) {
          p.target = this.nextWalk(p);
          if (chance(0.08)) { p.state = 'idle'; p.t = rand(2, 6); }
        }
        // greet / react to player nearby
        if (dPl < 3 && p.decT < 0 && G.player.state === 'foot') { p.decT = 8; if (chance(0.25)) p.say(pick(LINES.greet), 2); }
        if (G.atmo && G.atmo.w.rain > 0.5 && !p.umbrella && p.decT < 0 && chance(0.01)) { p.decT = 10; p.say(pick(LINES.rain), 2.5); }
        if (p.onPhone && chance(0.003)) p.say(pick(LINES.phone), 3);
        // player aiming at me
        if (G.player.aiming && dPl < 18 && this.aimedAt(p)) { p.state = p.p.brave > 0.7 ? 'flee' : 'handsup'; p.t = rand(3, 6); p.threat = G.player; p.say(pick(LINES.aimed), 2.5); }
        if (p.patrol && G.wanted > 0 && dPl < 60) { p.state = 'combat'; p.threat = G.player; }
        break;
      }
      case 'idle': if (p.t < 0) p.state = 'walk'; break;
      case 'look': face = p.lookAt; if (p.t < 0) p.state = 'walk'; break;
      case 'chat': {
        const o = p.partner;
        if (!o || o.state !== 'chat' || p.t < 0) { p.state = 'walk'; if (o && o.state === 'chat') o.state = 'walk'; p.partner = null; break; }
        face = o.h.pos;
        if (p.conv) { p.convT -= dt; if (p.convT < 0 && p.convI < p.conv.length) { const who = p.convI % 2 ? o : p; who.say(p.conv[p.convI], 3); who.h.talkT = 2.5; p.convI++; p.convT = 3.2; } }
        break;
      }
      case 'handsup': h.pose = 'handsup'; if (p.t < 0) { h.pose = null; p.state = 'flee'; p.t = 8; } break;
      case 'cower': h.pose = 'cower'; if (p.t < 0) { h.pose = null; p.state = 'flee'; p.t = 6; } break;
      case 'flee': {
        h.pose = null;
        const from = p.threat && (p.threat.isPlayer ? p.threat.wpos() : p.threat.h ? p.threat.h.pos : p.threat.pos) || p.fleeFrom || G.player.wpos();
        const dx = h.pos.x - from.x, dz = h.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
        face = { x: h.pos.x + dx / l * 5, z: h.pos.z + dz / l * 5 };
        speed = PSPEED.run * (0.85 + p.p.brave * 0.2);
        if (p.t < 0 || l > 70) { p.state = 'walk'; p.target = null; }
        break;
      }
      case 'fight': {
        const tg = p.threat;
        if (!tg || (tg.isPlayer ? tg.wasted || tg.state === 'car' : tg.dead) || p.t < -20) { p.state = 'walk'; p.threat = null; break; }
        const tp = tg.isPlayer ? tg.wpos() : tg.h.pos;
        const d = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
        face = tp;
        if (d > 1.3) speed = d > 6 ? PSPEED.run : PSPEED.jog;
        else if (p.fireT < 0) { p.fireT = rand(0.7, 1.3); h.punchT = 0.35; this.game.weapons.melee(p); }
        if (d > 40) { p.state = 'walk'; }
        break;
      }
      case 'combat': {
        let tg = p.threat;
        const alive = tg && (tg.isPlayer ? !tg.wasted && this.hostile(p, tg) : !tg.dead);
        if (!alive) { tg = p.threat = this.closestEnemy(p, 90); if (!tg) { p.state = p.team === 'cop' || p.mission ? 'idle' : 'walk'; h.pose = null; p.t = 3; break; } }
        const tp = tg.isPlayer ? tg.wpos() : (tg.h.ragdoll ? tg.h.hipsPos() : tg.h.pos);
        const d = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
        face = tp;
        if (!p.weapon) { p.state = 'fight'; break; }
        if (h.heldKind !== WEAPONS[p.weapon].mesh) h.hold(WEAPONS[p.weapon].mesh);
        const range = p.weapon === 'shotgun' ? 25 : 45;
        const los = G.city.los(h.pos.x, h.pos.z, tp.x, tp.z);
        if (d > range || !los) { speed = PSPEED.run * 0.9; h.pose = null; if (!los && p.coverT == null) p.strafe = rand(-1, 1); }
        else {
          h.pose = 'aim';
          h.aimDir.set(tp.x - h.pos.x, (tp.y + 1.2) - (h.pos.y + 1.4), tp.z - h.pos.z).normalize();
          speed = d < 8 ? 0 : (Math.sin(G.t * 0.7 + p.id) > 0.3 ? 1.6 : 0);
          if (p.fireT < 0) {
            const W = WEAPONS[p.weapon];
            p.fireT = W.rate * (W.auto ? rand(1, 3) : rand(2.5, 5)) + (p.team === 'cop' && G.wanted < 2 ? 1.5 : 0);
            const m = new THREE.Vector3(h.pos.x, h.pos.y + 1.4, h.pos.z).addScaledVector(h.aimDir, 0.6);
            fireWeapon(p, p.weapon, m, h.aimDir.clone(), m, p.accuracy * (d / 20 + 0.6) * (tg.isPlayer && tg.state === 'car' ? 1.6 : 1));
          }
        }
        break;
      }
      case 'goto': {
        if (!p.target) { p.state = 'idle'; break; }
        face = p.target; speed = p.runTo ? PSPEED.run : PSPEED.walk;
        if (Math.hypot(p.target.x - h.pos.x, p.target.z - h.pos.z) < 1.2) { p.state = 'idle'; p.t = 1e9; p.arrived = true; }
        break;
      }
      case 'follow': {
        const tp = G.player.wpos();
        const d = Math.hypot(tp.x - h.pos.x, tp.z - h.pos.z);
        face = tp; speed = d > 6 ? PSPEED.run : d > 2.5 ? PSPEED.walk * 1.4 : 0;
        if (d > 3 && p.weapon) { const e = this.closestEnemy(p, 35); if (e) { p.state = 'combat'; p.threat = e; p.returnTo = 'follow'; } }
        break;
      }
      case 'stand': face = p.faceTo || null; break;
    }
    if (p.state === 'combat' && p.returnTo && !p.threat) p.state = p.returnTo;
    // steering
    if (face) {
      const want = Math.atan2(face.x - h.pos.x, face.z - h.pos.z);
      h.heading = wrapAng(h.heading + angDiff(h.heading, want) * Math.min(1, dt * 8));
    }
    p.curSp = lerp(p.curSp || 0, speed, Math.min(1, dt * 6));
    if (p.curSp > 0.05) {
      const nx = h.pos.x + Math.sin(h.heading) * p.curSp * dt, nz = h.pos.z + Math.cos(h.heading) * p.curSp * dt;
      const np = { x: nx, z: nz };
      // separation
      for (const o of this.query(nx, nz, 1.2)) { if (o === p || o.dead) continue; const dx = nx - o.h.pos.x, dz = nz - o.h.pos.z, d = Math.hypot(dx, dz); if (d < 0.7 && d > 0.01) { np.x += dx / d * (0.7 - d) * 0.5; np.z += dz / d * (0.7 - d) * 0.5; } }
      if (G.player.state === 'foot') { const dx = np.x - G.player.pos.x, dz = np.z - G.player.pos.z, d = Math.hypot(dx, dz); if (d < 0.75 && d > 0.01) { np.x += dx / d * (0.75 - d); np.z += dz / d * (0.75 - d); if (p.state === 'walk' && p.decT < 0 && G.player.speed > 3) { p.decT = 6; p.say(pick(LINES.bump), 2, true); p.remember('bump', G.player, np.x, np.z); if (p.p.aggr > 0.85 && chance(0.4)) { p.state = 'fight'; p.threat = G.player; p.angryAt = G.player; } } } }
      if (G.city.collideCircle(np, 0.35, h.pos.y)) { if (p.state === 'walk') p.target = this.nextWalk(p); }
      h.pos.x = np.x; h.pos.z = np.z;
      const onSlab = !isRoad(h.pos.x, h.pos.z, -0.3) && Math.abs(h.pos.x) < 1000 && Math.abs(h.pos.z) < 1000;
      h.pos.y = lerp(h.pos.y, onSlab ? CURB : 0, 0.3);
    }
    h.speed = p.curSp;
    h.root.rotation.y = h.heading;
    if (p.state !== 'aim' && p.state !== 'combat' && h.pose === 'aim') h.pose = null;
    const vis = dPl < 160;
    if (h.visible !== vis) h.setVisible(vis);
    h.animate(dt, lod && ((G.frame + p.id) % 3 !== 0));
  }
  aimedAt(p) {
    const c = G.camera.position, d = this.game.cam.aimDir();
    const tx = p.h.pos.x - c.x, ty = p.h.pos.y + 1.2 - c.y, tz = p.h.pos.z - c.z, l = Math.hypot(tx, ty, tz);
    return (tx * d.x + ty * d.y + tz * d.z) / l > 0.985;
  }
  vehicleHits(p) {
    const h = p.h;
    for (const v of this.game.movingVehicles) {
      const sp = Math.abs(v.speed);
      if (sp < 2.5) continue;
      const dx = h.pos.x - v.pos.x, dz = h.pos.z - v.pos.z;
      if (dx * dx + dz * dz > 30) continue;
      const c = Math.cos(v.heading), s = Math.sin(v.heading);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < v.T.W / 2 + 0.3 && Math.abs(lz) < v.T.L / 2 + 0.3) {
        const vel = v.vel.clone(); if (vel.lengthSq() < 1) vel.set(Math.sin(v.heading) * v.speed, 0, Math.cos(v.heading) * v.speed);
        vel.multiplyScalar(0.85); vel.y = 2 + sp * 0.15;
        p.knock(vel, v.driver);
        G.audio.punch(h.pos.x, 1, h.pos.z);
        if (v.rb_) { const lv = v.rb_.linvel(); v.rb_.setLinvel({ x: lv.x * 0.97, y: lv.y, z: lv.z * 0.97 }, true); }
        return;
      }
    }
  }
  remove(p, i) {
    p.h.dispose(); this.hideBubble(p);
    if (i == null) i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }
  // ---------- speech bubbles ----------
  bubble(p, text, dur, angry) {
    const d = Math.hypot(p.h.pos.x - G.camera.position.x, p.h.pos.z - G.camera.position.z);
    if (d > 30) return;
    if (!p.bubbleEl) { p.bubbleEl = this.bubblePool.pop() || document.createElement('div'); this.bubbles.appendChild(p.bubbleEl); }
    p.bubbleEl.className = 'bub' + (angry ? ' angry' : ''); p.bubbleEl.textContent = text; p.bubbleT = dur;
    if (!this.active) this.active = new Set();
    this.active.add(p);
  }
  hideBubble(p) { if (p.bubbleEl) { p.bubbleEl.remove(); this.bubblePool.push(p.bubbleEl); p.bubbleEl = null; } if (this.active) this.active.delete(p); }
  updateBubbles() {
    if (!this.active) return;
    const cam = G.camera, v = new THREE.Vector3();
    for (const p of [...this.active]) {
      p.bubbleT -= G.dt;
      if (p.bubbleT <= 0 || !p.h.visible) { this.hideBubble(p); continue; }
      v.copy(p.h.ragdoll ? p.h.hipsPos() : p.h.pos); v.y += 2.15;
      v.project(cam);
      if (v.z > 1) { p.bubbleEl.style.display = 'none'; continue; }
      p.bubbleEl.style.display = 'block';
      p.bubbleEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px'; p.bubbleEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    }
  }
}
