// HUD, minimap (real top-down render of the city), full map with GPS waypoint, notifications, subtitles, banners
import * as THREE from 'three';
import { G, clamp, fmtMoney } from '../core/util.js';
import { WEAPONS } from '../game/weapons.js';
import { CELL, vEdge, hEdge } from '../world/citygen.js';

const $ = (id) => document.getElementById(id);
const MAP = { cx: -25, cz: 125, half: 1375, size: 2048 };

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = { hud: $('hud'), money: $('money'), wanted: $('wanted'), weap: $('weap'), clock: $('clock'), hp: $('hpB'), ar: $('arB'), obj: $('objective'), sub: $('subtitle'), notify: $('notify'), speedo: $('speedo'), cross: $('cross'), prompt: $('prompt'), banner: $('banner'), letter: $('letter'), fade: $('fade'), hint: $('hint') };
    this.mm = $('mm'); this.mmc = this.mm.getContext('2d');
    this.mapImg = null; this.waypoint = null; this.route = []; this._routeT = 0;
    this.subQ = []; this.subT = 0; this.bannerT = 0; this.dmg = 0; this.flashV = 0;
    this.blips = []; // {x,z,color,icon,label,pulse}
    this.mapOpen = false; this.mapView = { x: 0, z: 0, s: 0.35 };
    this._initMap();
  }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }
  // ---------- top-down render ----------
  buildMapImage(renderer, scene, chunks) {
    try {
      const S = MAP.size;
      const rt = new THREE.WebGLRenderTarget(S, S, { samples: 0 });
      const cam = new THREE.OrthographicCamera(-MAP.half, MAP.half, MAP.half, -MAP.half, 1, 1500);
      cam.position.set(MAP.cx, 900, MAP.cz); cam.up.set(0, 0, -1); cam.lookAt(MAP.cx, 0, MAP.cz);
      const fog = scene.fog; scene.fog = null;
      chunks.showAll(true);
      const sh = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
      const tm = renderer.toneMapping; renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const hide = []; scene.traverse((o) => { if (o.isPoints || o.name === 'clouds' || (o.material && o.material.isShaderMaterial && !o.isInstancedMesh && o.frustumCulled === false)) { if (o.visible) { hide.push(o); o.visible = false; } } });
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      for (const o of hide) o.visible = true;
      renderer.toneMapping = tm; renderer.shadowMap.enabled = sh; scene.fog = fog;
      const px = new Uint8Array(S * S * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
      rt.dispose();
      const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'); const id = g.createImageData(S, S);
      for (let y = 0; y < S; y++) { const src = (S - 1 - y) * S * 4; id.data.set(px.subarray(src, src + S * 4), y * S * 4); }
      g.putImageData(id, 0, 0);
      // stylise: slight darken + crisp road overlay
      g.fillStyle = 'rgba(10,14,22,0.25)'; g.fillRect(0, 0, S, S);
      this._roads(g, S, 'rgba(210,214,222,0.55)', 0.9);
      this.mapImg = c;
    } catch (e) { console.warn('map render failed', e); this.mapImg = this._vectorMap(); }
  }
  w2m(x, z) { return [(x - (MAP.cx - MAP.half)) / (MAP.half * 2) * MAP.size, (z - (MAP.cz - MAP.half)) / (MAP.half * 2) * MAP.size]; }
  _roads(g, S, col, wMul) {
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 14 / (MAP.half * 2) * S * wMul;
    g.beginPath();
    for (let k = -10; k <= 10; k++) for (let m = -10; m <= 10; m++) {
      if (vEdge(k, m)) { const a = this.w2m(k * CELL, m * CELL), b = this.w2m(k * CELL, (m + 1) * CELL); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      if (hEdge(k, m)) { const a = this.w2m(k * CELL, m * CELL), b = this.w2m((k + 1) * CELL, m * CELL); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
    }
    g.stroke();
  }
  _vectorMap() {
    const S = MAP.size, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#3a4a34'; g.fillRect(0, 0, S, S);
    const [sx] = this.w2m(1120, 0); g.fillStyle = '#1c3a4c'; g.fillRect(sx, 0, S - sx, S);
    for (const b of G.city.buildings) { const [x, y] = this.w2m(b.x - b.w / 2, b.z - b.d / 2); const w = b.w / (MAP.half * 2) * S, h = b.d / (MAP.half * 2) * S; g.fillStyle = '#8a8a90'; g.fillRect(x, y, w, h); }
    this._roads(g, S, '#c8ccd4', 1);
    return c;
  }
  // ---------- per-frame ----------
  update(dt) {
    const pl = G.player, st = G.state;
    if (!pl || !st) return;
    this.el.money.textContent = fmtMoney(st.money);
    const W = Math.ceil(G.wanted - 0.01);
    const bs = this.el.wanted.children;
    for (let i = 0; i < 5; i++) bs[i].classList.toggle('on', i < W);
    this.el.wanted.classList.toggle('flash', W > 0 && this.game.police.searching);
    const w = WEAPONS[pl.weapon];
    this.el.weap.textContent = pl.state === 'car' ? (pl.car ? pl.car.T.name : '') : w.name + (w.mag ? `  ${pl.mag[pl.weapon] || 0} / ${st.ammo[pl.weapon] || 0}` : '');
    const hh = Math.floor(G.hour), mm = Math.floor((G.hour % 1) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  ${G.atmo ? weatherName() : ''}`;
    this.el.hp.style.width = clamp(pl.health, 0, 100) + '%'; this.el.ar.style.width = clamp(pl.armor, 0, 100) + '%';
    this.el.hp.style.background = pl.health < 30 ? '#ff3a3a' : '#4ddc6a';
    const car = pl.state === 'car' ? pl.car : null;
    this.el.speedo.classList.toggle('hidden', !car);
    if (car) { this.el.speedo.firstElementChild.textContent = Math.round(Math.abs(car.speed) * 3.6); this.el.speedo.querySelector('.hp i').style.width = (car.health / car.maxHealth * 100) + '%'; }
    this.el.cross.classList.toggle('hidden', !(pl.state === 'foot' && (pl.aiming || pl.weapon === 'camera')));
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.el.cross.classList.remove('hit'); }
    // subtitles
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this._nextSub(); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.add('hidden'); }
    // damage / flash in post
    const u = G.engine.u;
    this.dmg = Math.max(0, this.dmg - dt * 1.2);
    u.uDamage.value = Math.max(this.dmg, pl.health < 25 ? 0.35 + Math.sin(G.t * 4) * 0.1 : 0);
    this.flashV = Math.max(0, this.flashV - dt * 3); u.uFlash.value = this.flashV;
    u.uSpeed.value = car ? clamp((Math.abs(car.speed) - 25) / 30, 0, 1) : 0;
    u.uGray.value = pl.wasted ? Math.min(1, (u.uGray.value || 0) + dt) : Math.max(0, u.uGray.value - dt * 2);
    this.drawMinimap(dt);
    if (this.mapOpen) this.drawMap();
  }
  damageFlash(k) { this.dmg = Math.min(1, this.dmg + k); }
  flash(k) { this.flashV = k; }
  hitmarker() { this.el.cross.classList.add('hit'); this._hitT = 0.15; }
  notify(text, t = 4500) {
    const d = document.createElement('div'); d.innerHTML = text; this.el.notify.appendChild(d);
    setTimeout(() => d.remove(), t);
    while (this.el.notify.children.length > 4) this.el.notify.firstChild.remove();
  }
  objective(html) { this.el.obj.innerHTML = html || ''; }
  prompt(html) { if (!html) this.el.prompt.classList.add('hidden'); else { this.el.prompt.innerHTML = html; this.el.prompt.classList.remove('hidden'); } }
  hint(text, t = 5) { const h = this.el.hint; h.textContent = text; h.classList.remove('hidden'); clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.add('hidden'), t * 1000); }
  banner(title, sub = '', t = 4, red = false) { const b = this.el.banner; b.querySelector('.t').textContent = title; b.querySelector('.s').innerHTML = sub; b.classList.toggle('red', red); b.classList.remove('hidden'); this.bannerT = t; }
  letterbox(on) { this.el.letter.classList.toggle('on', on); }
  fade(on, dur = 0.5) { this.el.fade.style.transition = `opacity ${dur}s`; this.el.fade.style.opacity = on ? 1 : 0; return new Promise((r) => setTimeout(r, dur * 1000)); }
  say(who, text, dur) { this.subQ.push({ who, text, dur: dur || Math.max(2.4, text.length * 0.065) }); if (this.subT <= 0) this._nextSub(); }
  clearSubs() { this.subQ = []; this.subT = 0; this.el.sub.classList.add('hidden'); }
  get speaking() { return this.subT > 0 || this.subQ.length > 0; }
  _nextSub() {
    const s = this.subQ.shift();
    if (!s) { this.el.sub.classList.add('hidden'); this.subT = 0; return; }
    this.el.sub.innerHTML = (s.who ? `<span class="who">${s.who}:</span> ` : '') + s.text;
    this.el.sub.classList.remove('hidden'); this.subT = s.dur;
  }
  // ---------- minimap ----------
  drawMinimap(dt) {
    const g = this.mmc, S = 256, pl = G.player, p = pl.wpos();
    const car = pl.state === 'car' ? pl.car : null;
    const zoom = car ? clamp(1.5 - Math.abs(car.speed) * 0.018, 0.75, 1.5) : 1.7; // px per meter
    const rot = (G.camYaw || 0) - Math.PI;
    g.save(); g.clearRect(0, 0, S, S); g.fillStyle = '#1a2430'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2 + 30); g.rotate(rot);
    if (this.mapImg) {
      const k = MAP.size / (MAP.half * 2); // map px per meter
      const [mx, my] = this.w2m(p.x, p.z);
      const span = 200 / zoom;
      g.drawImage(this.mapImg, mx - span * k, my - span * k, span * 2 * k, span * 2 * k, -span * zoom, -span * zoom, span * 2 * zoom, span * 2 * zoom);
    }
    const toL = (x, z) => [(x - p.x) * zoom, (z - p.z) * zoom];
    // GPS route
    if (this.route.length) {
      g.strokeStyle = '#c84aff'; g.lineWidth = 5; g.lineJoin = 'round'; g.beginPath();
      const [x0, y0] = toL(p.x, p.z); g.moveTo(x0, y0);
      for (const r of this.route) { const [x, y] = toL(r.x, r.z); g.lineTo(x, y); }
      g.stroke();
    }
    // wanted search radius
    if (G.wanted > 0 && this.game.police.searching) {
      const lp = this.game.police.lastPos; const [x, y] = toL(lp.x, lp.z);
      g.strokeStyle = (G.t % 0.6) < 0.3 ? 'rgba(255,60,60,0.8)' : 'rgba(60,120,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, this.game.police.searchRadius * zoom, 0, 6.29); g.stroke();
    }
    // entities
    for (const ped of this.game.peds.list) {
      if (ped.dead) continue;
      const hostile = ped.team === 'enemy' || (ped.state === 'combat' && ped.threat === pl) || ped.state === 'fight' && ped.threat === pl;
      if (!hostile && ped.team !== 'cop' && !ped.mission) continue;
      const [x, y] = toL(ped.h.pos.x, ped.h.pos.z); if (x * x + y * y > 140 * 140) continue;
      g.fillStyle = ped.mission === 'ally' || ped.team === 'ally' ? '#4aa8ff' : hostile ? '#ff3a3a' : ped.team === 'cop' ? '#3a6aff' : '#f2b632';
      g.beginPath(); g.arc(x, y, 4, 0, 6.29); g.fill();
    }
    for (const v of G.vehicles) {
      if (!v.policeUnit && !v.mission) continue;
      const [x, y] = toL(v.pos.x, v.pos.z); if (x * x + y * y > 150 * 150) continue;
      g.fillStyle = v.mission ? (v.missionColor || '#ff9a2a') : (G.t % 0.5) < 0.25 ? '#ff2a2a' : '#2a5aff';
      g.fillRect(x - 4, y - 4, 8, 8);
    }
    g.restore();
    // blips clamped to edge (screen space)
    g.save(); g.translate(S / 2, S / 2 + 30);
    for (const b of this.allBlips()) {
      let [x, y] = toL(b.x, b.z);
      const c = Math.cos(rot), s = Math.sin(rot); let rx = x * c - y * s, ry = x * s + y * c;
      const lim = 112, d = Math.hypot(rx, ry + 30);
      if (d > lim) { if (!b.edge) continue; const k2 = lim / d; rx *= k2; ry = (ry + 30) * k2 - 30; }
      this._icon(g, rx, ry, b);
    }
    // player arrow
    g.rotate(rot - (pl.state === 'car' && pl.car ? pl.car.heading : pl.heading));
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 9); g.lineTo(6, -6); g.lineTo(0, -3); g.lineTo(-6, -6); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north indicator
    const na = rot; g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    g.fillText('С', S / 2 + Math.sin(-na) * -108, S / 2 + 30 + Math.cos(-na) * -108 + 5);
  }
  allBlips() {
    const out = [...this.blips];
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, icon: 'wp', color: '#c84aff', edge: true });
    return out;
  }
  _icon(g, x, y, b) {
    g.save(); g.translate(x, y);
    const r = b.big ? 8 : 6.5;
    if (b.icon === 'wp') { g.fillStyle = b.color; g.beginPath(); g.moveTo(0, 0); g.arc(0, -10, 7, Math.PI * 0.8, Math.PI * 2.2); g.closePath(); g.fill(); g.restore(); return; }
    if (b.icon === 'mission') { const pu = 1 + Math.sin(G.t * 5) * 0.15; g.fillStyle = b.color || '#f2b632'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * pu, 0, 6.29); g.fill(); g.stroke(); g.fillStyle = '#000'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.fillText(b.letter || '!', 0, 4); g.restore(); return; }
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(0, 0, r + 2, 0, 6.29); g.fill();
    g.fillStyle = b.color || '#fff'; g.font = `${b.big ? 13 : 11}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.glyph || '•', 0, 1);
    g.restore();
  }
  setRoute(target) {
    if (!target) { this.route = []; this._routeTarget = null; return; }
    this._routeTarget = target; this._routeT = 0;
  }
  updateRoute(dt) {
    if (!this._routeTarget) return;
    this._routeT -= dt;
    if (this._routeT > 0) return;
    this._routeT = 1.5;
    const p = G.player.wpos(), t = this._routeTarget;
    if (Math.hypot(t.x - p.x, t.z - p.z) < 25) { this.route = [t]; if (t === this.waypoint) { this.waypoint = null; this._routeTarget = this.game.missions.gpsTarget(); } return; }
    const path = G.city.path(p.x, p.z, t.x, t.z);
    this.route = [...path, t];
  }
  // ---------- full map ----------
  _initMap() {
    const c = $('mapC'); this.mapC = c; this.mapG = c.getContext('2d');
    let drag = null, pinch = null;
    const toWorld = (sx, sy) => { const v = this.mapView, S = MAP.size, k = v.s * innerHeight / S * (MAP.size / (MAP.half * 2)); return { x: v.x + (sx - innerWidth / 2) / k, z: v.z + (sy - innerHeight / 2) / k }; };
    c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: this.mapView.x, vz: this.mapView.z, moved: false }; });
    c.addEventListener('pointermove', (e) => { if (!drag || pinch) return; const v = this.mapView, k = v.s * innerHeight / MAP.size * (MAP.size / (MAP.half * 2)); const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true; v.x = drag.vx - dx / k; v.z = drag.vz - dy / k; });
    c.addEventListener('pointerup', (e) => { if (drag && !drag.moved) { const w = toWorld(e.clientX, e.clientY); this.waypoint = this.waypoint && Math.hypot(this.waypoint.x - w.x, this.waypoint.z - w.z) < 30 ? null : w; this.setRoute(this.waypoint || this.game.missions.gpsTarget()); G.audio.beep(900, 0.06, 0.1); } drag = null; });
    c.addEventListener('wheel', (e) => { this.mapView.s = clamp(this.mapView.s * (e.deltaY > 0 ? 0.88 : 1.14), 0.25, 6); }, { passive: true });
    c.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), s: this.mapView.s }; }, { passive: true });
    c.addEventListener('touchmove', (e) => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); this.mapView.s = clamp(pinch.s * d / pinch.d, 0.25, 6); } }, { passive: true });
    c.addEventListener('touchend', () => { pinch = null; });
    $('mapClose').addEventListener('click', () => this.toggleMap(false));
  }
  toggleMap(on = !this.mapOpen) {
    this.mapOpen = on; $('mapScreen').classList.toggle('hidden', !on);
    G.uiOpen = on;
    if (on) { const p = G.player.wpos(); this.mapView.x = p.x; this.mapView.z = p.z; this.mapView.s = 1.2; if (document.pointerLockElement) document.exitPointerLock(); }
    $('mapUI').innerHTML = '<b>КАРТА ГОРОДА</b><br>Клик/тап — поставить метку GPS<br>Колесо/щипок — масштаб, перетаскивание — сдвиг<br><span style="color:#f2b632">●</span> Миссия &nbsp;<span style="color:#7ef09a">$</span> Магазин &nbsp;<span style="color:#fff">⌂</span> Дом &nbsp;<span style="color:#c84aff">▼</span> Метка';
  }
  drawMap() {
    const c = this.mapC, g = this.mapG;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    const v = this.mapView, S = MAP.size;
    const k = v.s * innerHeight / S; // screen px per map px
    g.fillStyle = '#0b1622'; g.fillRect(0, 0, c.width, c.height);
    const [mx, my] = this.w2m(v.x, v.z);
    g.imageSmoothingEnabled = true;
    if (this.mapImg) g.drawImage(this.mapImg, innerWidth / 2 - mx * k, innerHeight / 2 - my * k, S * k, S * k);
    const toS = (x, z) => { const [a, b] = this.w2m(x, z); return [innerWidth / 2 + (a - mx) * k, innerHeight / 2 + (b - my) * k]; };
    if (this.route.length) { g.strokeStyle = '#c84aff'; g.lineWidth = 4; g.beginPath(); const p = G.player.wpos(); let [x, y] = toS(p.x, p.z); g.moveTo(x, y); for (const r of this.route) { [x, y] = toS(r.x, r.z); g.lineTo(x, y); } g.stroke(); }
    // district labels
    g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [n, x, z] of [['ДЕЛОВОЙ ЦЕНТР', -20, -20], ['ПРОМЗОНА', -600, 500], ['ПОРТ', 900, 700], ['ПЛЯЖ', 1070, -300], ['ЛЕС', -1100, 0], ['ПРИГОРОД', 0, -950], ['АЭРОПОРТ', 0, 1260], ['СПАЛЬНЫЙ РАЙОН', -650, -500], ['НАБЕРЕЖНАЯ', 900, -300]]) { const [x2, y2] = toS(x, z); g.fillText(n, x2, y2); }
    for (const b of this.allBlips()) { const [x, y] = toS(b.x, b.z); this._icon(g, x, y, { ...b, big: true }); if (b.label && v.s > 0.8) { g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(b.label, x, y + 20); } }
    const p = G.player.wpos(); const [px, py] = toS(p.x, p.z);
    g.save(); g.translate(px, py); g.rotate(-(G.player.state === 'car' && G.player.car ? G.player.car.heading : G.player.heading) + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
function weatherName() { const n = G.atmo.wName; return { clear: '☀', cloudy: '☁', rain: '🌧', storm: '⛈', fog: '🌫' }[n] || ''; }
