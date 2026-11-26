// Procedural Web Audio engine / tire / wind / turbo sounds
let ctx = null, master = null, sfxBus = null, noiseBuf = null;
export function audioCtx() { return ctx; }
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v, sfx = 1) { if (master) master.gain.value = v; if (sfxBus) sfxBus.gain.value = sfx; }
function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; }
function shaper(amount) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = (1 + amount) * x / (1 + amount * Math.abs(x)); } const w = ctx.createWaveShaper(); w.curve = c; w.oversample = '2x'; return w; }

export class EngineSound {
  constructor(car, main = true) {
    this.ok = !!ctx; if (!this.ok) return; this.car = car; this.main = main; const cyl = car.cyl || 0; this.cyl = cyl; this.ev = !!car.ev;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.pan) { this.out.connect(this.pan); this.pan.connect(sfxBus); } else this.out.connect(sfxBus);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.5; this.lp.connect(this.out);
    this.sh = shaper(cyl >= 8 ? 6 : 3); this.sh.connect(this.lp);
    this.oscs = [];
    const mk = (type, mul, g) => { const o = ctx.createOscillator(); o.type = type; const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(this.ev ? this.lp : this.sh); o.start(); this.oscs.push([o, mul, gg]); return o; };
    if (this.ev) { mk('sine', 1, 0.25); mk('triangle', 2.01, 0.08); mk('sine', 3.5, 0.04); }
    else { mk('sawtooth', 1, 0.32); mk('square', 0.5, cyl >= 8 ? 0.28 : 0.12); mk('sawtooth', 2.003, 0.12); mk('triangle', 0.25, cyl >= 8 ? 0.2 : 0.05); }
    // burble AM for big engines
    if (!this.ev && cyl >= 6) { this.lfo = ctx.createOscillator(); this.lfo.type = 'square'; this.lfoG = ctx.createGain(); this.lfoG.gain.value = 0.18; this.lfo.connect(this.lfoG); this.lfoG.connect(this.out.gain); this.lfo.start(); }
    // exhaust noise
    this.nz = noise(); this.nf = ctx.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.Q.value = 1.2; this.ng = ctx.createGain(); this.ng.gain.value = 0; this.nz.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.out);
    if (main) {
      this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.tg = ctx.createGain(); this.tg.gain.value = 0; this.turbo.connect(this.tg); this.tg.connect(sfxBus); this.turbo.start();
      const tn = noise(); this.tf = ctx.createBiquadFilter(); this.tf.type = 'bandpass'; this.tf.frequency.value = 1100; this.tf.Q.value = 4; this.tireG = ctx.createGain(); this.tireG.gain.value = 0; tn.connect(this.tf); this.tf.connect(this.tireG); this.tireG.connect(sfxBus);
      const wn = noise(); this.wf = ctx.createBiquadFilter(); this.wf.type = 'lowpass'; this.wf.frequency.value = 500; this.windG = ctx.createGain(); this.windG.gain.value = 0; wn.connect(this.wf); this.wf.connect(this.windG); this.windG.connect(sfxBus);
      const rn = noise(); this.rf = ctx.createBiquadFilter(); this.rf.type = 'lowpass'; this.rf.frequency.value = 160; this.roadG = ctx.createGain(); this.roadG.gain.value = 0; rn.connect(this.rf); this.rf.connect(this.roadG); this.roadG.connect(sfxBus);
      const rain = noise(); this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 2500; this.rainG = ctx.createGain(); this.rainG.gain.value = 0; rain.connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(sfxBus);
    }
  }
  update(v, opts = {}) {
    if (!this.ok) return; const t = ctx.currentTime, k = 0.05; const rpm = v.rpm, thr = v.thr; const red = v.p.redline;
    const f = this.ev ? 60 + rpm / 16000 * 900 : rpm / 60 * Math.max(2, this.cyl) / 2;
    for (const [o, mul] of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.02);
    if (this.lfo) this.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    const load = 0.35 + thr * 0.65; const dist = opts.dist ?? 0; const att = this.main ? 1 : Math.max(0, 1 - dist / 90) ** 2 * 0.7;
    this.lp.frequency.setTargetAtTime(this.ev ? 1500 + rpm / 4 : 260 + thr * 2600 + rpm / red * 1800, t, k);
    this.out.gain.setTargetAtTime((this.ev ? 0.25 : 0.3) * load * att * (opts.interior ? 0.7 : 1), t, k);
    this.nf.frequency.setTargetAtTime(f * 3, t, k); this.ng.gain.setTargetAtTime((this.ev ? 0 : 0.18) * thr * att, t, k);
    if (this.pan && opts.pan !== undefined) this.pan.pan.setTargetAtTime(opts.pan, t, 0.05);
    if (!this.main) return;
    this.turbo.frequency.setTargetAtTime(2500 + v.boost * 5500, t, 0.05); this.tg.gain.setTargetAtTime(v.p.turboMax > 0 ? v.boost * 0.035 : 0, t, 0.05);
    let slip = 0; for (const w of v.wheels) if (w.contact && w.road) slip = Math.max(slip, Math.max(Math.abs(w.slip) - 0.12, w.slipL - 0.12) * 1.6);
    this.tireG.gain.setTargetAtTime(Math.min(0.32, slip * 0.32), t, 0.05); this.tf.frequency.setTargetAtTime(900 + Math.min(1, slip) * 500, t, 0.1);
    const sp = Math.abs(v.speed); this.windG.gain.setTargetAtTime(Math.min(0.25, sp * sp * 0.00004) * (opts.interior ? 0.4 : 1), t, 0.1); this.wf.frequency.setTargetAtTime(300 + sp * 12, t, 0.1);
    const off = v.wheels.some(w => !w.road && w.contact); this.roadG.gain.setTargetAtTime(Math.min(0.3, sp * (off ? 0.012 : 0.003)), t, 0.1);
    this.rainG.gain.setTargetAtTime(opts.rain ? 0.06 : 0, t, 0.5);
    if (v.blowoff) { v.blowoff = 0; if (v.p.turboMax > 0) burst(3200, 0.22, 0.25, 'highpass'); }
    if (v.backfire > 0.2 && Math.random() < 0.25) { pop(); }
  }
  stop() { if (!this.ok) return; this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); if (this.main) { this.tg.gain.value = 0; this.tireG.gain.value = 0; this.windG.gain.value = 0; this.roadG.gain.value = 0; this.rainG.gain.value = 0; } const all = this; setTimeout(() => { try { all.oscs.forEach(o => o[0].stop()); all.lfo && all.lfo.stop(); all.nz.stop(); all.turbo && all.turbo.stop(); } catch (e) { /* already stopped */ } }, 300); }
}
export function burst(freq, dur, gain, type = 'bandpass') { if (!ctx) return; const n = ctx.createBufferSource(); n.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); n.connect(f); f.connect(g); g.connect(sfxBus); n.start(t, Math.random()); n.stop(t + dur + 0.05); }
export function pop() { burst(180, 0.12, 0.5, 'lowpass'); burst(1200, 0.05, 0.2); }
export function crash(v) { burst(140, 0.4, Math.min(1, v * 0.06), 'lowpass'); burst(2400, 0.25, Math.min(0.6, v * 0.03), 'highpass'); }
export function clickSfx() { if (!ctx) return; const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 880; o.type = 'triangle'; const t = ctx.currentTime; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.connect(g); g.connect(sfxBus); o.start(); o.stop(t + 0.1); }
export function beep(f = 660, d = 0.18) { if (!ctx) return; const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f; o.type = 'square'; const t = ctx.currentTime; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g); g.connect(sfxBus); o.start(); o.stop(t + d + 0.02); }
export function shiftSfx() { burst(90, 0.08, 0.25, 'lowpass'); }
