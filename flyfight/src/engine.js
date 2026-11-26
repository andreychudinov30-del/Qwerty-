import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { QUALITY } from './data.js';
import { save, persist } from './save.js';
import { clamp } from './util.js';

export function defaultQuality() {
  const mob = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const cores = navigator.hardwareConcurrency || 4;
  if (mob) return 1;
  return cores >= 8 ? 3 : 2;
}
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true, stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scale = 1; this.ft = []; this.fps = 60; this.lastAdj = 0;
    this.setQuality(save.settings.quality < 0 ? defaultQuality() : save.settings.quality);
    addEventListener('resize', () => this.resize());
    const recover = () => { // GPU reset: drop quality one step and reload (max 3 times per session)
      let n = 0; try { n = +sessionStorage.getItem('ff_lost') || 0; sessionStorage.setItem('ff_lost', n + 1); } catch (e) { }
      save.settings.quality = Math.max(0, this.qi - 1); persist(); if (n < 3) location.reload();
    };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.lostTimer = setTimeout(recover, 1200); });
    canvas.addEventListener('webglcontextrestored', () => { clearTimeout(this.lostTimer); this.lost = false; recover(); });
  }
  setQuality(i) {
    this.qi = clamp(i, 0, 4); this.Q = QUALITY[this.qi];
    this.renderer.shadowMap.enabled = this.Q.shadows > 0;
    this.scale = 1; this.resize();
  }
  pr() { return Math.min(devicePixelRatio || 1, this.Q.pr) * this.scale; }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pr()); this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.pr()); this.composer.setSize(w, h); }
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (this.Q.post) {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.Q.aa ? 4 : 0 });
      const comp = new EffectComposer(this.renderer, rt);
      comp.addPass(new RenderPass(scene, camera));
      if (this.Q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.92); comp.addPass(this.bloom); }
      comp.addPass(new OutputPass());
      if (!this.Q.aa && this.qi >= 2) comp.addPass(new SMAAPass(innerWidth * this.pr(), innerHeight * this.pr()));
      this.composer = comp;
    }
    this.resize();
  }
  render(dt) {
    if (this.lost) return;
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
    // adaptive resolution
    this.ft.push(dt); if (this.ft.length > 40) this.ft.shift();
    const now = performance.now();
    if (now - this.lastAdj > 1500 && this.ft.length >= 40) {
      const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length; this.fps = 1 / avg;
      if (save.settings.adaptive) {
        if (avg > 1 / 40 && this.scale > 0.55) { this.scale = Math.max(0.55, this.scale - 0.1); this.resize(); }
        else if (avg < 1 / 57 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); this.resize(); }
      }
      this.lastAdj = now;
    }
  }
}
