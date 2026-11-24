// Procedural audio: engines, tires, wind, rain, city ambience, weapons, crashes, sirens, helicopter, radio stations
import { G, clamp, rand, pick } from './util.js';
import { settings } from './save.js';

export class Audio {
  constructor() { this.ctx = null; this.ok = false; this.station = 0; this.radioOn = false; this.ambT = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.comp);
    this.music = c.createGain(); this.music.connect(this.comp);
    this.amb = c.createGain(); this.amb.connect(this.comp);
    // reverb
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(2.2, 3); this.verbG = c.createGain(); this.verbG.gain.value = 0.25; this.verb.connect(this.verbG); this.verbG.connect(this.sfx);
    this.noiseBuf = this._noise(2);
    this.brown = this._brown(4);
    this._loops();
    this.applyVolume();
    this.ok = true;
  }
  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.music.gain.value = settings.music * 0.6;
    this.sfx.gain.value = settings.sfx;
    this.amb.gain.value = settings.sfx * 0.7;
  }
  _noise(sec) { const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  _brown(sec) { const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; }
  _impulse(sec, decay) { const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); } return b; }
  _src(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  _loops() {
    const c = this.ctx;
    // engine (player)
    this.eng = { g: c.createGain(), f: c.createBiquadFilter(), o1: c.createOscillator(), o2: c.createOscillator(), o3: c.createOscillator(), ws: c.createWaveShaper() };
    const e = this.eng;
    e.o1.type = 'sawtooth'; e.o2.type = 'sawtooth'; e.o3.type = 'square';
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); } e.ws.curve = curve;
    e.f.type = 'lowpass'; e.f.Q.value = 2.5;
    const og = c.createGain(); og.gain.value = 0.22;
    e.o1.connect(og); e.o2.connect(og); e.o3.connect(og); og.connect(e.ws); e.ws.connect(e.f); e.f.connect(e.g); e.g.connect(this.sfx);
    e.g.gain.value = 0; e.o1.start(); e.o2.start(); e.o3.start();
    // tires
    this.tire = this._noiseLoop('bandpass', 1800, 3, this.sfx);
    // wind
    this.wind = this._noiseLoop('lowpass', 500, 0.7, this.amb);
    // rain
    this.rain = this._noiseLoop('highpass', 1500, 0.3, this.amb);
    // city hum
    const hs = this._src(this.brown); const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 280; this.hum = c.createGain(); this.hum.gain.value = 0.0; hs.connect(hf); hf.connect(this.hum); this.hum.connect(this.amb); hs.start();
    // siren (nearest police)
    this.sir = { o: c.createOscillator(), g: c.createGain(), lfo: c.createOscillator(), lg: c.createGain() };
    this.sir.o.type = 'sawtooth'; this.sir.lfo.frequency.value = 0.55; this.sir.lg.gain.value = 380; this.sir.o.frequency.value = 900;
    this.sir.lfo.connect(this.sir.lg); this.sir.lg.connect(this.sir.o.frequency);
    const sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1100; sf.Q.value = 0.8;
    this.sir.o.connect(sf); sf.connect(this.sir.g); this.sir.g.connect(this.sfx); this.sir.g.gain.value = 0; this.sir.o.start(); this.sir.lfo.start();
    // helicopter
    const hn = this._src(this.noiseBuf); const hlp = c.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 400; const am = c.createGain(); am.gain.value = 0;
    const hl = c.createOscillator(); hl.frequency.value = 17; const hlg = c.createGain(); hlg.gain.value = 0.5; hl.connect(hlg); hlg.connect(am.gain);
    hn.connect(hlp); hlp.connect(am); this.heliG = c.createGain(); this.heliG.gain.value = 0; am.connect(this.heliG); this.heliG.connect(this.sfx); hn.start(); hl.start();
    this.am = am;
  }
  _noiseLoop(type, f, q, out) { const c = this.ctx, s = this._src(this.noiseBuf), fl = c.createBiquadFilter(), g = c.createGain(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(out); s.start(); return { g, f: fl }; }
  // positional gain/pan
  _spatial(x, y, z, maxD = 120) {
    const cam = G.camera; if (!cam || x === undefined) return { gain: 1, pan: 0 };
    const dx = x - cam.position.x, dy = y - cam.position.y, dz = z - cam.position.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const gain = clamp(1 - d / maxD, 0, 1) ** 1.6 * (1 / (1 + d * 0.03));
    const yaw = Math.atan2(dx, dz) - (G.camYaw || 0);
    return { gain, pan: clamp(Math.sin(-yaw), -0.9, 0.9), d };
  }
  _out(gain, pan, verb = 0.3) {
    const c = this.ctx, g = c.createGain(), p = c.createStereoPanner ? c.createStereoPanner() : null;
    g.gain.value = gain;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); if (verb) { const vg = c.createGain(); vg.gain.value = verb; p.connect(vg); vg.connect(this.verb); } }
    else g.connect(this.sfx);
    return g;
  }
  burst(x, y, z, { dur = 0.2, f0 = 1200, f1 = 200, type = 'lowpass', vol = 1, q = 1, maxD = 200, verb = 0.35, tone = 0 } = {}) {
    if (!this.ok) return;
    const { gain, pan } = this._spatial(x, y, z, maxD); if (gain < 0.01) return;
    const c = this.ctx, t = c.currentTime, s = this._src(this.noiseBuf, false), f = c.createBiquadFilter(), g = c.createGain();
    s.playbackRate.value = rand(0.8, 1.2);
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this._out(gain, pan, verb)); s.start(t, rand(0, 1)); s.stop(t + dur + 0.05);
    if (tone) { const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(tone, t); o.frequency.exponentialRampToValueAtTime(tone * 0.4, t + dur * 0.6); og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6); o.connect(og); og.connect(this._out(gain, pan, verb)); o.start(t); o.stop(t + dur); }
  }
  gun(kind, x, y, z) {
    const p = { pistol: [0.22, 3000, 300, 0.9, 140], smg: [0.12, 3500, 400, 0.7, 160], shotgun: [0.4, 2000, 150, 1.2, 90], rifle: [0.25, 4000, 250, 1, 120] }[kind] || [0.2, 3000, 300, 0.8, 140];
    this.burst(x, y, z, { dur: p[0], f0: p[1], f1: p[2], vol: p[3], tone: p[4], maxD: 260, verb: 0.6 });
  }
  explosion(x, y, z) { this.burst(x, y, z, { dur: 2.2, f0: 900, f1: 40, vol: 2, tone: 60, maxD: 500, verb: 0.8 }); }
  crash(x, y, z, k) { this.burst(x, y, z, { dur: 0.5 + k * 0.03, f0: 2400, f1: 120, vol: clamp(k / 10, 0.3, 1.6), tone: 80, maxD: 160, verb: 0.4 }); if (k > 8) setTimeout(() => this.glass(x, y, z, 0.4), 60); }
  glass(x, y, z, v = 0.8) { for (let i = 0; i < 5; i++) setTimeout(() => this.burst(x, y, z, { dur: 0.15 + Math.random() * 0.2, f0: 6000 + Math.random() * 3000, f1: 3000, type: 'highpass', vol: v * 0.6, maxD: 90 }), i * 30); }
  hit(x, y, z, kind) { this.burst(x, y, z, kind === 'metal' ? { dur: 0.6, f0: 1500, f1: 600, type: 'bandpass', q: 8, vol: 0.8, maxD: 100 } : { dur: 0.2, f0: 900, f1: 200, vol: 0.6, maxD: 60 }); }
  punch(x, y, z) { this.burst(x, y, z, { dur: 0.12, f0: 600, f1: 100, vol: 0.9, tone: 90, maxD: 40, verb: 0.1 }); }
  step(x, y, z, run) { this.burst(x, y, z, { dur: 0.06, f0: run ? 1500 : 1100, f1: 300, vol: run ? 0.18 : 0.1, maxD: 25, verb: 0.05 }); }
  thunder(dist) { const c = this.ctx; if (!this.ok) return; setTimeout(() => this.burst(G.camera.position.x, 50, G.camera.position.z, { dur: 3.5, f0: 300, f1: 30, vol: 1.6 / (1 + dist * 0.2), tone: 45, maxD: 1e5, verb: 0.9 }), dist * 900); }
  horn(on) {
    if (!this.ok) return;
    if (on && !this._horn) { const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o1.type = o2.type = 'square'; o1.frequency.value = 415; o2.frequency.value = 523; g.gain.value = 0.08; o1.connect(g); o2.connect(g); g.connect(this.sfx); o1.start(); o2.start(); this._horn = [o1, o2, g]; }
    if (!on && this._horn) { this._horn[0].stop(); this._horn[1].stop(); this._horn = null; }
  }
  beep(f = 880, d = 0.12, v = 0.15, type = 'sine') { if (!this.ok) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + d + 0.02); }
  jingle(good = true) { const n = good ? [523, 659, 784, 1046] : [392, 330, 262, 196]; n.forEach((f, i) => setTimeout(() => this.beep(f, 0.35, 0.18, 'triangle'), i * 140)); }
  money() { this.beep(1318, 0.08, 0.12); setTimeout(() => this.beep(1760, 0.12, 0.12), 70); }
  // continuous mix update
  update(dt, st) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime;
    const e = this.eng;
    if (st.car && !st.car.dead) {
      const rpm = st.car.rpm, f = rpm / 60 * 2;
      e.o1.frequency.setTargetAtTime(f, t, 0.04); e.o2.frequency.setTargetAtTime(f * 1.007, t, 0.04); e.o3.frequency.setTargetAtTime(f * 0.5, t, 0.04);
      e.f.frequency.setTargetAtTime(300 + rpm * 0.35 + Math.abs(st.car.throttle) * 900, t, 0.05);
      e.g.gain.setTargetAtTime(0.16 + Math.abs(st.car.throttle) * 0.12, t, 0.05);
      this.tire.g.gain.setTargetAtTime(clamp(st.car.slip, 0, 1) * 0.35, t, 0.05);
    } else { e.g.gain.setTargetAtTime(0, t, 0.1); this.tire.g.gain.setTargetAtTime(0, t, 0.1); }
    this.wind.g.gain.setTargetAtTime(clamp((st.speed - 8) / 40, 0, 1) * 0.25 + (G.atmo ? G.atmo.w.wind * 0.05 : 0), t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + st.speed * 15, t, 0.2);
    this.rain.g.gain.setTargetAtTime(G.atmo ? G.atmo.w.rain * 0.22 * (G.interior ? 0.2 : 1) : 0, t, 0.3);
    this.hum.gain.setTargetAtTime(G.interior ? 0.02 : 0.08 + (1 - (G.atmo ? G.atmo.night : 0)) * 0.08, t, 0.5);
    // siren
    this.sir.g.gain.setTargetAtTime(st.siren ? clamp(st.siren, 0, 1) * 0.09 : 0, t, 0.1);
    this.heliG.gain.setTargetAtTime(st.heli ? clamp(st.heli, 0, 1) * 0.6 : 0, t, 0.2);
    // random ambience events
    this.ambT -= dt;
    if (this.ambT < 0 && !G.interior) {
      this.ambT = rand(3, 9);
      const cam = G.camera.position, a = rand(0, 6.28), d = rand(40, 120);
      const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
      const night = G.atmo ? G.atmo.night : 0;
      const r = Math.random();
      if (night < 0.5 && r < 0.4) this._bird(x, z); else if (night > 0.5 && r < 0.5) this._cricket(); else if (r < 0.8) this._distHorn(x, z); else this.burst(x, 2, z, { dur: 1.2, f0: 900, f1: 500, type: 'bandpass', q: 3, vol: 0.12, maxD: 300 });
    }
    // radio
    if (this.radioOn && st.car) this._radio(); else if (this._radioPlaying) { this._radioPlaying = false; }
  }
  _bird(x, z) { const c = this.ctx, t = c.currentTime; const { gain, pan } = this._spatial(x, 8, z, 140); for (let i = 0; i < 3; i++) { const o = c.createOscillator(), g = c.createGain(); const f = rand(2500, 4500); o.frequency.setValueAtTime(f, t + i * 0.12); o.frequency.exponentialRampToValueAtTime(f * 1.4, t + i * 0.12 + 0.08); g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.06 * gain + 0.0001, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.1); o.connect(g); g.connect(this._out(1, pan, 0.2)); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.12); } }
  _cricket() { const c = this.ctx, t = c.currentTime; for (let i = 0; i < 6; i++) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 4200; g.gain.setValueAtTime(0.0001, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.02, t + i * 0.07 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.07 + 0.05); o.connect(g); g.connect(this.amb); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.06); } }
  _distHorn(x, z) { const c = this.ctx, t = c.currentTime; const { gain, pan } = this._spatial(x, 1, z, 200); const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = pick([370, 415, 440]); g.gain.setValueAtTime(0.025 * gain + 0.0001, t); g.gain.setValueAtTime(0.025 * gain + 0.0001, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200; o.connect(f); f.connect(g); g.connect(this._out(1, pan, 0.5)); o.start(t); o.stop(t + 0.45); }
  // ---------------- procedural radio ----------------
  stations() { return ['Ночной драйв FM', 'Лоу-фай 88', 'Пульс Техно', 'Радио выключено']; }
  nextStation() { this.station = (this.station + 1) % 4; this.radioOn = this.station < 3; this._step = 0; this._next = 0; return this.stations()[this.station]; }
  _radio() {
    const c = this.ctx; const now = c.currentTime;
    if (!this._next || this._next < now - 1) { this._next = now + 0.05; this._step = 0; }
    const bpm = [100, 78, 126][this.station], st = 60 / bpm / 4;
    while (this._next < now + 0.2) { this._note(this._step, this._next, st); this._next += st; this._step++; }
    this._radioPlaying = true;
  }
  _note(s, t, st) {
    const c = this.ctx, out = this.music, S = this.station;
    const bar = Math.floor(s / 16) % 4, b = s % 16;
    const prog = S === 0 ? [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] : S === 1 ? [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]] : [[45, 48, 52], [45, 48, 52], [43, 47, 50], [41, 45, 48]];
    const chord = prog[bar];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const tone = (f, d, v, type = 'sawtooth', cut = 2000, att = 0.01) => { const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter(); o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = cut; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05); };
    const drum = (k) => { if (k === 'kick') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.32); } else { const s = this._src(this.noiseBuf, false), f = c.createBiquadFilter(), g = c.createGain(); f.type = k === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = k === 'hat' ? 7000 : 1800; g.gain.setValueAtTime(k === 'hat' ? 0.06 : 0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + (k === 'hat' ? 0.05 : 0.18)); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + 0.2); } };
    if (S === 0) {
      if (b === 0) chord.forEach((n) => tone(mtof(n), st * 16, 0.045, 'sawtooth', 1400, 0.3));
      if (b % 2 === 0) tone(mtof(chord[0] - 12 + (b % 4 === 2 ? 12 : 0)), st * 1.8, 0.12, 'square', 700);
      if (b % 4 === 0) drum('kick'); if (b === 4 || b === 12) drum('snare'); if (b % 2 === 1) drum('hat');
      if (b % 3 === 0) tone(mtof(chord[(b / 3 | 0) % 3] + 12), st * 2, 0.03, 'triangle', 3000);
    } else if (S === 1) {
      if (b === 0 || b === 10) chord.forEach((n) => tone(mtof(n), st * 9, 0.05, 'triangle', 1800, 0.02));
      if (b === 0 || b === 7 || b === 10) drum('kick'); if (b === 4 || b === 12) drum('snare'); if (b % 2 === 0) drum('hat');
      if (b === 0 || b === 8) tone(mtof(chord[0] - 24), st * 6, 0.18, 'sine', 400);
    } else {
      if (b % 4 === 0) drum('kick'); if (b % 4 === 2) drum('hat'); if (b === 4 || b === 12) drum('snare');
      const acid = [0, 0, 12, 0, 3, 0, 15, 7][b % 8];
      tone(mtof(chord[0] - 12 + acid), st * 0.9, 0.09, 'sawtooth', 400 + 1500 * (0.5 + 0.5 * Math.sin(s * 0.05)));
      if (b === 0 && bar % 2 === 0) chord.forEach((n) => tone(mtof(n + 12), st * 30, 0.02, 'sawtooth', 2500, 1));
    }
  }
  menuMusic(on) {
    if (!this.ok) return;
    if (on && !this._menu) {
      const c = this.ctx; const g = c.createGain(); g.gain.value = 0.0; g.connect(this.music); g.gain.linearRampToValueAtTime(0.5, c.currentTime + 3);
      const notes = [45, 52, 57, 60, 64]; const osc = [];
      for (const n of notes) { const o = c.createOscillator(), og = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12); o.detune.value = rand(-8, 8); f.type = 'lowpass'; f.frequency.value = 600; og.gain.value = 0.03; o.connect(f); f.connect(og); og.connect(g); o.start(); osc.push(o); const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = rand(0.05, 0.2); lg.gain.value = 300; l.connect(lg); lg.connect(f.frequency); l.start(); osc.push(l); }
      this._menu = { g, osc };
    } else if (!on && this._menu) { const m = this._menu; m.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1); setTimeout(() => m.osc.forEach((o) => o.stop()), 1200); this._menu = null; }
  }
}
