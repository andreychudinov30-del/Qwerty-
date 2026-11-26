import { save } from './save.js';
export class Audio {
  constructor() { this.ctx = null; this.ok = false; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const c = this.ctx; this.master = c.createGain(); this.master.connect(c.destination); this.setVolume();
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicG = c.createGain(); this.musicG.connect(this.master); this.musicG.gain.value = save.settings.music * 0.5;
    // noise buffer
    const n = c.sampleRate * 2; const b = c.createBuffer(1, n, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
    // brown noise
    const bb = c.createBuffer(1, n, c.sampleRate); const dd = bb.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; dd[i] = last * 3.5; } this.brown = bb;
    this.ok = true;
  }
  setVolume() { if (this.master) this.master.gain.value = save.settings.volume; if (this.musicG) this.musicG.gain.value = save.settings.music * 0.5; }
  src(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }
  startEngine() {
    if (!this.ok || this.eng) return; const c = this.ctx;
    const e = {}; e.g = c.createGain(); e.g.gain.value = 0; e.g.connect(this.sfx);
    e.roar = this.src(this.noise); e.bp = c.createBiquadFilter(); e.bp.type = 'bandpass'; e.bp.Q.value = 0.7; e.roar.connect(e.bp); e.rg = c.createGain(); e.bp.connect(e.rg); e.rg.connect(e.g);
    e.rum = this.src(this.brown); e.lp = c.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 180; e.rum.connect(e.lp); e.ug = c.createGain(); e.lp.connect(e.ug); e.ug.connect(e.g);
    e.osc = c.createOscillator(); e.osc.type = 'sawtooth'; e.og = c.createGain(); e.og.gain.value = 0.02; const of = c.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 900; e.osc.connect(of); of.connect(e.og); e.og.connect(e.g);
    e.wind = this.src(this.noise); e.wf = c.createBiquadFilter(); e.wf.type = 'highpass'; e.wf.frequency.value = 1200; e.wind.connect(e.wf); e.wg = c.createGain(); e.wf.connect(e.wg); e.wg.connect(e.g);
    e.gun = this.src(this.noise); e.gf = c.createBiquadFilter(); e.gf.type = 'bandpass'; e.gf.frequency.value = 500; e.gf.Q.value = 0.8; e.gm = c.createGain(); e.gm.gain.value = 0; e.gun.connect(e.gf); e.gf.connect(e.gm); e.gm.connect(this.sfx);
    e.gl = c.createOscillator(); e.gl.frequency.value = 38; e.gl.type = 'square'; e.glg = c.createGain(); e.glg.gain.value = 0; e.gl.connect(e.glg); e.glg.connect(e.gm.gain);
    for (const s of [e.roar, e.rum, e.osc, e.wind, e.gun, e.gl]) s.start();
    e.g.gain.setTargetAtTime(1, c.currentTime, 0.5);
    this.eng = e;
  }
  stopEngine() { if (!this.eng) return; const e = this.eng; e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); setTimeout(() => { for (const s of [e.roar, e.rum, e.osc, e.wind, e.gun, e.gl]) try { s.stop(); } catch (x) { } }, 800); this.eng = null; this.tones(null); }
  engine(thr, ab, speed, gun, cockpit) {
    if (!this.eng) return; const e = this.eng, t = this.ctx.currentTime;
    e.bp.frequency.setTargetAtTime(300 + thr * 900 + ab * 400, t, 0.1);
    e.rg.gain.setTargetAtTime((0.12 + thr * 0.25) * (cockpit ? 0.5 : 1), t, 0.1);
    e.ug.gain.setTargetAtTime(0.25 + ab * 0.9, t, 0.1);
    e.osc.frequency.setTargetAtTime(70 + thr * 90, t, 0.1); e.og.gain.setTargetAtTime(0.015 + thr * 0.02, t, 0.1);
    e.wg.gain.setTargetAtTime(Math.min(0.35, speed / 900) * (cockpit ? 1.3 : 0.6), t, 0.2);
    e.gm.gain.setTargetAtTime(gun ? 0.5 : 0, t, 0.01); e.glg.gain.setTargetAtTime(gun ? 0.5 : 0, t, 0.01);
  }
  oneShot(buf, { f = 1000, type = 'lowpass', q = 0.7, gain = 1, dur = 1, attack = 0.005, rate = 1, delay = 0 } = {}) {
    if (!this.ok) return; const c = this.ctx; const s = this.src(buf, false); s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.1); return { s, fl, g };
  }
  setListener(p) { this.lp = p; }
  att(p) { if (!this.lp || !p) return 1; const d = this.lp.distanceTo(p); return Math.min(1, 600 / (d + 1)); }
  explosion(p, s = 1) { if (!this.ok) return; const a = this.att(p) * s; if (a < 0.02) return; const delay = this.lp ? Math.min(2, this.lp.distanceTo(p) / 340) : 0; this.oneShot(this.brown, { f: 300, gain: a * 2.2, dur: 2.5, delay }); this.oneShot(this.noise, { f: 1800, gain: a * 0.6, dur: 0.4, delay }); }
  missileLaunch(p, mine) { if (!this.ok) return; const a = mine ? 1 : this.att(p); const r = this.oneShot(this.noise, { f: 600, type: 'bandpass', q: 1, gain: a * 0.8, dur: 1.6, attack: 0.05 }); if (r) r.fl.frequency.exponentialRampToValueAtTime(3000, this.ctx.currentTime + 1.2); }
  flare(mine) { if (!this.ok) return; for (let i = 0; i < 4; i++) this.oneShot(this.noise, { f: 2500, type: 'highpass', gain: mine ? 0.3 : 0.05, dur: 0.15, delay: i * 0.12 }); }
  hit() { this.oneShot(this.noise, { f: 900, gain: 0.5, dur: 0.12 }); }
  click() { if (!this.ok) return; const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 1400; g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06); o.connect(g); g.connect(this.sfx); o.start(); o.stop(c.currentTime + 0.08); }
  thunder() { this.oneShot(this.brown, { f: 200, gain: 1.6, dur: 4, attack: 0.3, delay: 0.5 + Math.random() * 1.5 }); }
  // continuous tones: 'seek' | 'lock' | 'warn' | null
  tones(mode) {
    if (!this.ok) return; const c = this.ctx;
    if (!this.toneO) { this.toneO = c.createOscillator(); this.toneO.type = 'square'; this.toneG = c.createGain(); this.toneG.gain.value = 0; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; this.toneO.connect(f); f.connect(this.toneG); this.toneG.connect(this.sfx); this.toneO.start(); }
    this.toneMode = mode;
  }
  tickTones(t) {
    if (!this.toneO) return; const m = this.toneMode, g = this.toneG.gain, f = this.toneO.frequency, ct = this.ctx.currentTime;
    if (m === 'warn') { f.setTargetAtTime((t * 6 | 0) % 2 ? 1250 : 850, ct, 0.005); g.setTargetAtTime(0.05, ct, 0.01); }
    else if (m === 'lock') { f.setTargetAtTime(1650, ct, 0.01); g.setTargetAtTime(0.035, ct, 0.01); }
    else if (m === 'seek') { f.setTargetAtTime(950, ct, 0.01); g.setTargetAtTime((t * 3 % 1) < 0.25 ? 0.03 : 0, ct, 0.005); }
    else g.setTargetAtTime(0, ct, 0.02);
  }
  music(on) {
    if (!this.ok) return; const c = this.ctx;
    if (!on) { if (this.mus) { this.mus.g.gain.setTargetAtTime(0, c.currentTime, 0.5); const m = this.mus; setTimeout(() => m.nodes.forEach(n => { try { n.stop(); } catch (e) { } }), 2000); this.mus = null; } return; }
    if (this.mus) return;
    const g = c.createGain(); g.gain.value = 0; g.connect(this.musicG); g.gain.setTargetAtTime(0.5, c.currentTime, 1.5);
    const dl = c.createDelay(1); dl.delayTime.value = 0.45; const fb = c.createGain(); fb.gain.value = 0.35; dl.connect(fb); fb.connect(dl); dl.connect(g);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g); lp.connect(dl);
    const nodes = [];
    const chords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 55]];
    const oscs = []; for (let i = 0; i < 4; i++) for (const det of [-6, 6]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; const og = c.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(lp); o.start(); nodes.push(o); oscs.push(o); }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 500; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
    let k = 0; const step = () => { if (!this.mus) return; const ch = chords[k++ % 4]; oscs.forEach((o, i) => o.frequency.setTargetAtTime(440 * Math.pow(2, (ch[i >> 1] - 69) / 12), c.currentTime, 0.8)); this.mus.timer = setTimeout(step, 6000); };
    this.mus = { g, nodes }; step();
  }
}
