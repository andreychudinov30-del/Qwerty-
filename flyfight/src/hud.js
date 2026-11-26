import * as THREE from 'three';
import { clamp } from './util.js';
import { save } from './save.js';

const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
export class HUD {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d'); this.msgs = []; this.feed = []; this.hitT = 0; this.big = null; this.bigT = 0;
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { const d = Math.min(2, devicePixelRatio || 1); this.dpr = d; this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.W = innerWidth; this.H = innerHeight; }
  msg(text, color = '#fff', time = 3) { this.msgs.push({ text, color, t: time }); if (this.msgs.length > 4) this.msgs.shift(); }
  kill(text, color) { this.feed.push({ text, color, t: 6 }); if (this.feed.length > 5) this.feed.shift(); }
  banner(text, color = '#ffd34d', t = 2.5) { this.big = { text, color }; this.bigT = t; }
  hitMark() { this.hitT = 0.15; }
  proj(p, cam) {
    tv.copy(p).project(cam);
    const behind = tv.z > 1; return { x: (tv.x * 0.5 + 0.5) * this.W, y: (-tv.y * 0.5 + 0.5) * this.H, behind, z: tv.z };
  }
  draw(g, dt) {
    const c = this.c, W = this.W, H = this.H, S = save.settings.hud || 1;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
    const pl = g.player, cam = g.camera; if (!pl) return;
    const col = g.night ? '#7dffb0' : '#9dffb8';
    const mob = W < 900;
    const fs = Math.round((mob ? 12 : 14) * S);
    c.font = `600 ${fs}px "Segoe UI", Roboto, Arial, sans-serif`; c.lineWidth = 1.6; c.textBaseline = 'middle';
    const glow = (on) => { c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = on ? 4 : 0; c.shadowOffsetX = on ? 1 : 0; c.shadowOffsetY = on ? 1 : 0; };
    glow(true);
    const f = pl.flight;
    if (pl.alive && !g.cinematic) {
      // --- boresight & flight path marker
      const bs = this.proj(tv2.copy(pl.pos).addScaledVector(f.f, 1500), cam);
      c.strokeStyle = col; c.fillStyle = col;
      if (!bs.behind) { c.beginPath(); c.moveTo(bs.x - 14, bs.y); c.lineTo(bs.x - 5, bs.y); c.moveTo(bs.x + 5, bs.y); c.lineTo(bs.x + 14, bs.y); c.moveTo(bs.x, bs.y - 14); c.lineTo(bs.x, bs.y - 5); c.stroke(); }
      const fpm = this.proj(tv2.copy(pl.pos).addScaledVector(f.vel, 6), cam);
      if (!fpm.behind && g.camMode !== 'chase') { c.beginPath(); c.arc(fpm.x, fpm.y, 6, 0, 7); c.moveTo(fpm.x - 16, fpm.y); c.lineTo(fpm.x - 6, fpm.y); c.moveTo(fpm.x + 6, fpm.y); c.lineTo(fpm.x + 16, fpm.y); c.moveTo(fpm.x, fpm.y - 6); c.lineTo(fpm.x, fpm.y - 13); c.stroke(); }
      // --- pitch ladder (cockpit only or always light)
      if (g.camMode === 'cockpit' || save.settings.hud >= 1) {
        const pitch = f.pitchAngle(), bank = f.bank();
        const ppr = H / (cam.fov * Math.PI / 180);
        c.save(); c.translate(bs.behind ? W / 2 : bs.x, bs.behind ? H / 2 : bs.y); c.rotate(-bank);
        c.globalAlpha = g.camMode === 'cockpit' ? 0.9 : 0.55;
        for (let a = -90; a <= 90; a += 10) {
          if (a === 0) continue;
          const y = (pitch - a * Math.PI / 180) * ppr; if (Math.abs(y) > H * 0.3) continue;
          c.setLineDash(a < 0 ? [6, 5] : []); c.beginPath(); c.moveTo(-90, y); c.lineTo(-40, y); c.lineTo(-40, y + (a < 0 ? -6 : 6)); c.moveTo(90, y); c.lineTo(40, y); c.lineTo(40, y + (a < 0 ? -6 : 6)); c.stroke(); c.setLineDash([]);
          c.textAlign = 'right'; c.fillText(Math.abs(a), -95, y); c.textAlign = 'left'; c.fillText(Math.abs(a), 95, y);
        }
        const hy = pitch * ppr; if (Math.abs(hy) < H * 0.4) { c.beginPath(); c.moveTo(-220, hy); c.lineTo(-30, hy); c.moveTo(30, hy); c.lineTo(220, hy); c.stroke(); }
        c.restore(); c.globalAlpha = 1;
      }
      // --- speed / altitude tapes
      const kmh = Math.round(f.speed * 3.6), alt = Math.round(f.pos.y), mach = (f.speed / (340 - Math.min(f.pos.y, 11000) * 0.0039)).toFixed(2);
      const sx = W * 0.5 - (mob ? 170 : 230), ax = W * 0.5 + (mob ? 170 : 230), ty = H * 0.5;
      c.strokeRect(sx - 46, ty - 14, 92, 28); c.strokeRect(ax - 46, ty - 14, 92, 28);
      c.textAlign = 'center'; c.font = `700 ${fs + 3}px "Segoe UI", Roboto, Arial`; c.fillText(kmh, sx, ty); c.fillText(alt, ax, ty);
      c.font = `600 ${fs - 1}px "Segoe UI", Roboto, Arial`;
      c.fillText('СКОРОСТЬ км/ч', sx, ty - 26); c.fillText('ВЫСОТА м', ax, ty - 26);
      c.fillText('M ' + mach, sx, ty + 26); c.fillText(`G ${f.G.toFixed(1)}`, sx, ty + 44);
      const ra = Math.round(f.pos.y - g.terrain.groundAt(f.pos.x, f.pos.z)); c.fillText('РВ ' + ra, ax, ty + 26);
      c.fillText((f.ab > 0.5 ? 'ФОРСАЖ ' : 'ТЯГА ') + Math.round(f.thr * 100) + '%', ax, ty + 44);
      // heading tape
      const hdg = ((-f.heading() * 180 / Math.PI) % 360 + 360) % 360;
      c.save(); c.beginPath(); c.rect(W / 2 - 150, 54, 300, 30); c.clip();
      for (let k = -30; k <= 30; k += 5) { const hh = Math.round(hdg / 5) * 5 + k; const x = W / 2 + (hh - hdg) * 5; const v = ((hh % 360) + 360) % 360; c.beginPath(); c.moveTo(x, 70); c.lineTo(x, v % 10 === 0 ? 62 : 66); c.stroke(); if (v % 30 === 0) c.fillText(v === 0 ? 'С' : v === 90 ? 'В' : v === 180 ? 'Ю' : v === 270 ? 'З' : String(v / 10), x, 78); }
      c.restore(); c.beginPath(); c.moveTo(W / 2, 56); c.lineTo(W / 2 - 5, 50); c.lineTo(W / 2 + 5, 50); c.closePath(); c.fill();
    }
    // --- targets
    const sel = pl.target;
    for (const o of g.planes) {
      if (o === pl || !o.alive) continue;
      const p = this.proj(o.pos, cam); const d = o.pos.distanceTo(cam.position);
      const enemy = o.team !== pl.team; const cc = enemy ? (o === sel ? '#ff4d4d' : '#ff7a6a') : '#5fd0ff';
      if (p.behind || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) {
        if (o === sel) this.edgeArrow(p, cc);
        continue;
      }
      if (d > 26000) continue;
      const sz = Math.max(10, Math.min(60, 9000 / d));
      c.strokeStyle = cc; c.fillStyle = cc; c.lineWidth = o === sel ? 2.2 : 1.4;
      if (enemy) { c.strokeRect(p.x - sz, p.y - sz, sz * 2, sz * 2); }
      else { c.beginPath(); c.moveTo(p.x, p.y - sz); c.lineTo(p.x + sz, p.y); c.lineTo(p.x, p.y + sz); c.lineTo(p.x - sz, p.y); c.closePath(); c.stroke(); }
      c.textAlign = 'left'; c.font = `600 ${fs - 2}px "Segoe UI", Roboto, Arial`;
      const label = (o.bomber ? 'БМБ ' : o.ace ? 'АС ' : '') + o.spec.name;
      if (o === sel || d < 6000) { c.fillText(label, p.x + sz + 4, p.y - 6); c.fillText((d / 1000).toFixed(1) + ' км', p.x + sz + 4, p.y + 8); }
      if (o === sel && enemy) {
        // lead pipper
        if (d < 1800 && pl.alive) { const tof = d / (1050 + f.speed * 0.3); const lp = this.proj(tv2.copy(o.pos).addScaledVector(o.vel, tof).addScaledVector(f.vel, -tof).addScaledVector(pl.vel, tof), cam); if (!lp.behind) { c.beginPath(); c.arc(lp.x, lp.y, 9, 0, 7); c.stroke(); c.beginPath(); c.arc(lp.x, lp.y, 2, 0, 7); c.fill(); } }
        // lock
        if (pl.locked) { c.strokeStyle = '#ff2e2e'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, sz + 10, 0, 7); c.stroke(); c.fillStyle = '#ff2e2e'; c.textAlign = 'center'; c.font = `800 ${fs + 2}px "Segoe UI", Roboto, Arial`; c.fillText('ЗАХВАТ', p.x, p.y + sz + 26); }
        else if (pl.lockT > 0) { const r = sz + 10 + (1 - pl.lockT) * 50; c.strokeStyle = cc; c.setLineDash([4, 4]); c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.stroke(); c.setLineDash([]); }
      }
    }
    for (const gt of g.ground) {
      if (!gt.alive || gt.team === pl.team) continue; const p = this.proj(gt.pos, cam); if (p.behind) continue;
      const d = gt.pos.distanceTo(cam.position); if (d > 30000) continue;
      c.strokeStyle = '#ffb04d'; c.fillStyle = '#ffb04d'; c.lineWidth = 1.6; const s = Math.max(9, Math.min(40, 7000 / d));
      c.beginPath(); c.moveTo(p.x, p.y - s); c.lineTo(p.x + s, p.y + s * 0.7); c.lineTo(p.x - s, p.y + s * 0.7); c.closePath(); c.stroke();
      c.textAlign = 'left'; c.font = `600 ${fs - 2}px "Segoe UI", Roboto, Arial`; c.fillText(gt.label + ' ' + (d / 1000).toFixed(1) + ' км', p.x + s + 4, p.y);
    }
    // incoming missiles
    let warn = false;
    for (const m of g.weapons.missiles) {
      if (m.target !== pl) continue; warn = true;
      const p = this.proj(m.p, cam);
      if (p.behind || p.x < 0 || p.x > W || p.y < 0 || p.y > H) this.edgeArrow(p, '#ff3030');
      else { c.strokeStyle = '#ff3030'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.moveTo(p.x - 14, p.y); c.lineTo(p.x + 14, p.y); c.stroke(); }
    }
    // hit marker
    if (this.hitT > 0) { this.hitT -= dt; c.strokeStyle = '#fff'; c.lineWidth = 2.5; const x = W / 2, y = H / 2; c.beginPath(); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(x + a * 9, y + b * 9); c.lineTo(x + a * 17, y + b * 17); } c.stroke(); }
    // --- top center: score & objective
    c.textAlign = 'center'; c.font = `800 ${fs + 4}px "Segoe UI", Roboto, Arial`;
    const ta = g.planes.filter(o => o.team === 0 && o.alive && !o.bomber).length, tb = g.planes.filter(o => o.team === 1 && o.alive && !o.bomber).length;
    c.fillStyle = '#5fd0ff'; c.fillText(ta, W / 2 - 40, 22); c.fillStyle = '#fff'; c.fillText(':', W / 2, 22); c.fillStyle = '#ff6a5a'; c.fillText(tb, W / 2 + 40, 22);
    c.font = `600 ${fs - 1}px "Segoe UI", Roboto, Arial`; c.fillStyle = '#ffe9a8';
    if (g.objectiveText) c.fillText(g.objectiveText(), W / 2, 42);
    // --- weapons panel (top right)
    const rx = W - 14; c.textAlign = 'right'; c.font = `700 ${fs}px "Segoe UI", Roboto, Arial`;
    c.fillStyle = '#fff'; c.fillText(`ПУШКА ${pl.ammo}`, rx, 20); c.fillText(`РАКЕТЫ ${pl.missiles}`, rx, 40); c.fillText(`ЛТЦ ${pl.flares}`, rx, 60);
    const hp = clamp(pl.hp / pl.maxHp, 0, 1);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(rx - 120, 72, 120, 8); c.fillStyle = hp > 0.5 ? '#6dff8a' : hp > 0.25 ? '#ffd34d' : '#ff4040'; c.fillRect(rx - 120, 72, 120 * hp, 8);
    c.fillStyle = '#fff'; c.font = `600 ${fs - 2}px "Segoe UI", Roboto, Arial`; c.fillText(`ПРОЧНОСТЬ ${Math.round(hp * 100)}%`, rx, 92);
    c.fillText(`${g.score} очк.`, rx, 110);
    // --- radar (top left)
    this.radar(g, mob ? 58 : 76);
    // --- warnings
    c.textAlign = 'center'; c.font = `900 ${fs + 8}px "Segoe UI", Roboto, Arial`;
    let wy = H * 0.3; const blink = (g.time * 4 | 0) % 2;
    if (pl.alive) {
      if (warn && blink) { c.fillStyle = '#ff2e2e'; c.fillText('⚠ РАКЕТА НА ХВОСТЕ!', W / 2, wy); wy += 30; }
      const agl = f.pos.y - g.terrain.groundAt(f.pos.x, f.pos.z); const sink = -f.vel.y;
      if (agl < 300 && sink > agl / 6 && blink) { c.fillStyle = '#ff9f1a'; c.fillText('ВЫСОТА! ТЯНИ ВВЕРХ!', W / 2, wy); wy += 30; }
      if (f.stall > 0.4 && blink) { c.fillStyle = '#ffd34d'; c.fillText('СВАЛИВАНИЕ', W / 2, wy); wy += 30; }
      if (g.outT > 0) { c.fillStyle = '#ffd34d'; c.fillText(`ВЕРНИТЕСЬ В ЗОНУ БОЯ  ${Math.ceil(g.outT)}`, W / 2, wy); wy += 30; }
    }
    // --- messages & feed
    c.font = `700 ${fs + 1}px "Segoe UI", Roboto, Arial`;
    let my = H * 0.2;
    for (let i = this.msgs.length - 1; i >= 0; i--) { const m = this.msgs[i]; m.t -= dt; if (m.t <= 0) { this.msgs.splice(i, 1); continue; } }
    for (const m of this.msgs) { c.globalAlpha = Math.min(1, m.t); c.fillStyle = m.color; c.fillText(m.text, W / 2, my); my += 24; }
    c.globalAlpha = 1; c.textAlign = 'right'; c.font = `600 ${fs - 1}px "Segoe UI", Roboto, Arial`;
    let fy = 132;
    for (let i = this.feed.length - 1; i >= 0; i--) { const m = this.feed[i]; m.t -= dt; if (m.t <= 0) this.feed.splice(i, 1); }
    for (const m of this.feed) { c.globalAlpha = Math.min(1, m.t); c.fillStyle = m.color; c.fillText(m.text, W - 14, fy); fy += 20; }
    c.globalAlpha = 1;
    if (this.big && this.bigT > 0) { this.bigT -= dt; c.textAlign = 'center'; c.font = `900 ${fs + 18}px "Segoe UI", Roboto, Arial`; c.globalAlpha = Math.min(1, this.bigT * 2); c.fillStyle = this.big.color; c.fillText(this.big.text, W / 2, H * 0.38); c.globalAlpha = 1; }
    glow(false);
  }
  edgeArrow(p, color) {
    const c = this.c, W = this.W, H = this.H; let x = p.x - W / 2, y = p.y - H / 2; if (p.behind) { x = -x; y = -y; if (Math.abs(x) + Math.abs(y) < 1) y = 1; }
    const a = Math.atan2(y, x); const r = Math.min(W, H) * 0.42; const px = W / 2 + Math.cos(a) * r, py = H / 2 + Math.sin(a) * r;
    c.save(); c.translate(px, py); c.rotate(a); c.fillStyle = color; c.beginPath(); c.moveTo(16, 0); c.lineTo(-6, -10); c.lineTo(-6, 10); c.closePath(); c.fill(); c.restore();
  }
  radar(g, R) {
    const c = this.c, pl = g.player; const cx = R + 14, cy = R + 14; const range = 12000;
    c.save(); c.fillStyle = 'rgba(10,25,20,0.45)'; c.strokeStyle = 'rgba(140,255,180,0.6)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.arc(cx, cy, R / 2, 0, 7); c.stroke();
    c.beginPath(); c.arc(cx, cy, R, 0, 7); c.clip();
    const h = pl.flight.heading();
    const toR = (p) => { const dx = p.x - pl.pos.x, dz = p.z - pl.pos.z; const ca = Math.cos(-h), sa = Math.sin(-h); const rx = dx * ca + dz * sa, rz = -dx * sa + dz * ca; return [cx - rx / range * R, cy - rz / range * R]; };
    // arena circle
    c.strokeStyle = 'rgba(255,220,120,0.5)'; c.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; const [x, y] = toR({ x: g.center.x + Math.cos(a) * g.arenaR, z: g.center.z + Math.sin(a) * g.arenaR }); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    for (const o of g.planes) { if (!o.alive || o === pl) continue; const [x, y] = toR(o.pos); c.fillStyle = o.team === pl.team ? '#5fd0ff' : (o === pl.target ? '#ff3030' : '#ff7a6a'); c.fillRect(x - 2.5, y - 2.5, 5, 5); }
    for (const gt of g.ground) { if (!gt.alive) continue; const [x, y] = toR(gt.pos); c.fillStyle = gt.team === pl.team ? '#5fd0ff' : '#ffb04d'; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 4, y + 3); c.lineTo(x - 4, y + 3); c.fill(); }
    for (const m of g.weapons.missiles) { const [x, y] = toR(m.p); c.fillStyle = '#fff'; c.fillRect(x - 1, y - 1, 2, 2); }
    c.restore();
    c.fillStyle = '#9dffb8'; c.beginPath(); c.moveTo(cx, cy - 6); c.lineTo(cx + 4, cy + 4); c.lineTo(cx - 4, cy + 4); c.closePath(); c.fill();
  }
  drawPanel(canvas, g) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height, pl = g.player;
    c.fillStyle = '#121416'; c.fillRect(0, 0, W, H);
    const mfd = (x, title) => { c.fillStyle = '#050807'; c.fillRect(x + 6, 10, 160, H - 20); c.strokeStyle = '#3a4040'; c.lineWidth = 4; c.strokeRect(x + 6, 10, 160, H - 20); c.fillStyle = '#5dff8a'; c.font = 'bold 13px monospace'; c.fillText(title, x + 14, 28); };
    mfd(0, 'РЛС'); mfd(176, 'ПНК'); mfd(352, 'СИСТ');
    // radar
    c.save(); c.beginPath(); c.rect(10, 34, 152, H - 48); c.clip(); const cx = 86, cy = H - 20; const h = pl.flight.heading();
    c.strokeStyle = '#1f6a3a'; for (let r = 40; r < 160; r += 40) { c.beginPath(); c.arc(cx, cy, r, Math.PI, 2 * Math.PI); c.stroke(); }
    for (const o of g.planes) { if (!o.alive || o === pl) continue; const dx = o.pos.x - pl.pos.x, dz = o.pos.z - pl.pos.z; const ca = Math.cos(-h), sa = Math.sin(-h); const rx = dx * ca + dz * sa, rz = -dx * sa + dz * ca; if (rz < 0) continue; c.fillStyle = o.team === pl.team ? '#4cc8ff' : '#ff5a4a'; c.fillRect(cx - rx / 15000 * 150 - 3, cy - rz / 15000 * 150 - 3, 6, 6); }
    c.restore();
    // attitude
    const b = pl.flight.bank(), p = pl.flight.pitchAngle(); c.save(); c.beginPath(); c.rect(182, 34, 152, H - 48); c.clip(); c.translate(258, 34 + (H - 48) / 2); c.rotate(-b); c.fillStyle = '#2a5f9a'; c.fillRect(-150, -150 + p * 120, 300, 150); c.fillStyle = '#6a4a2a'; c.fillRect(-150, p * 120, 300, 150); c.restore();
    c.strokeStyle = '#ffd34d'; c.lineWidth = 3; c.beginPath(); c.moveTo(228, 34 + (H - 48) / 2); c.lineTo(288, 34 + (H - 48) / 2); c.stroke();
    // systems
    c.fillStyle = '#5dff8a'; c.font = 'bold 14px monospace';
    c.fillText(`ДВИГ ${Math.round((1 - pl.engineDmg * 0.5) * 100)}%`, 366, 56); c.fillText(`КОРП ${Math.round(pl.hp)}%`, 366, 80); c.fillText(`РКТ  ${pl.missiles}`, 366, 104); c.fillText(`ПУШ  ${pl.ammo}`, 366, 128); c.fillText(`ЛТЦ  ${pl.flares}`, 366, 152);
  }
}
