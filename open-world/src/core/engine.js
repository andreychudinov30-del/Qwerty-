// Renderer + HDR post-processing chain (GTAO, Bloom, ACES grade, vignette, speed blur), adaptive resolution
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { G, clamp, bus } from './util.js';
import { quality, settings } from './save.js';

const Grade = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1 }, uSat: { value: 1.06 }, uContrast: { value: 1.05 },
    uLift: { value: new THREE.Vector3(0.004, 0.006, 0.012) }, uGain: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    uVignette: { value: 0.38 }, uSpeed: { value: 0 }, uDamage: { value: 0 }, uGray: { value: 0 }, uFlash: { value: 0 }, uBlack: { value: 0 },
    uWet: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime,uExposure,uSat,uContrast,uVignette,uSpeed,uDamage,uGray,uFlash,uBlack,uWet; uniform vec3 uLift,uGain; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    vec3 RRT(vec3 v){ vec3 a=v*(v+0.0245786)-0.000090537; vec3 b=v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 c){ const mat3 i=mat3(0.59719,0.07600,0.02840,0.35458,0.90834,0.13383,0.04823,0.01566,0.83777);
      const mat3 o=mat3(1.60475,-0.10208,-0.00327,-0.53108,1.10813,-0.07276,-0.07367,-0.00605,1.07602); return clamp(o*RRT(i*c),0.,1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-0.055,step(vec3(0.0031308),c)); }
    void main(){
      vec2 uv=vUv; vec2 d=uv-0.5; float r2=dot(d,d);
      vec3 col=vec3(0.);
      if(uSpeed>0.01){
        float s=uSpeed*0.035*smoothstep(0.02,0.25,r2);
        for(int k=0;k<6;k++){ float f=float(k)/5.; col+=texture2D(tDiffuse,uv-d*s*f).rgb; }
        col/=6.;
      } else col=texture2D(tDiffuse,uv).rgb;
      float ab=0.0012*r2*4.;
      col.r=mix(col.r,texture2D(tDiffuse,uv+d*ab).r,0.5);
      col*=uExposure;
      col=aces(col);
      float l=dot(col,vec3(0.2126,0.7152,0.0722));
      col=mix(vec3(l),col,uSat*(1.-uGray));
      col=(col-0.5)*uContrast+0.5; col=max(col,0.);
      col=col*uGain+uLift*(1.-col);
      col=mix(col,col*vec3(0.92,0.97,1.05),uWet*0.5);
      float dm=uDamage*smoothstep(0.08,0.6,r2*2.);
      col=mix(col,vec3(0.55,0.02,0.02)*(0.4+l),dm*0.7);
      col*=1.-clamp(uVignette,0.,1.)*smoothstep(0.15,0.85,r2*2.);
      vec3 sc=srgb(clamp(col,0.,1.));
      sc+=(hash(floor(vUv*uRes)+fract(uTime*7.31)*91.7)-0.5)*0.018;
      sc=mix(sc,vec3(1.),uFlash); sc*=1.-uBlack;
      gl_FragColor=vec4(sc,1.);
    }`,
};

export class Engine {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
    this.renderer = r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    G.maxAniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    this.grade = new ShaderPass(Grade);
    this.u = this.grade.uniforms;
    this.dyn = 1; this.ft = 16; this.fps = 60; this._at = 0;
    this.q = quality();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); bus.emit('ctxlost'); });
  }
  setView(scene, camera) { this.scene = scene; this.camera = camera; this.build(); this.resize(); }
  pr() { return clamp(Math.min(devicePixelRatio || 1, this.q.dprCap) * this.q.res * this.dyn, 0.4, 2.5); }
  applyQuality() { this.q = quality(); this.dyn = 1; this.renderer.shadowMap.enabled = this.q.shadows > 0; this.build(); this.resize(); bus.emit('quality', this.q); }
  build() {
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); }
    this.composer = null; this.gtao = null; this.bloom = null;
    const q = this.q, r = this.renderer;
    if (!q.post) { r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; return; }
    r.toneMapping = THREE.NoToneMapping;
    const s = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    const c = new EffectComposer(r, rt);
    c.setPixelRatio(1); c.setSize(s.x, s.y);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      try {
        const g = new GTAOPass(this.scene, this.camera, s.x >> 1, s.y >> 1);
        g.blendIntensity = 0.8;
        g.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2.5, scale: 1.0, samples: 10 });
        g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
        c.addPass(g); this.gtao = g;
      } catch (e) { console.warn('GTAO off', e); }
    }
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(s.x >> 1, s.y >> 1), 0.3, 0.35, 3.0); c.addPass(this.bloom); }
    c.addPass(this.grade);
    this.composer = c;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pr());
    this.renderer.setSize(w, h, false);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.composer) { this.composer.setSize(s.x, s.y); if (this.gtao) this.gtao.setSize(s.x >> 1, s.y >> 1); }
    this.u.uRes.value.set(s.x, s.y);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  adapt(dt) {
    this.ft = this.ft * 0.95 + dt * 1000 * 0.05; this.fps = 1000 / this.ft;
    if (!settings.adaptive) return;
    this._at += dt; if (this._at < 2) return; this._at = 0;
    const p = this.dyn;
    if (this.fps < 40 && this.dyn > 0.55) this.dyn -= 0.08;
    else if (this.fps > 57 && this.dyn < 1) this.dyn = Math.min(1, this.dyn + 0.05);
    if (p !== this.dyn) this.resize();
  }
  render(dt) {
    this.u.uTime.value += dt;
    this.renderer.info.reset();
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  setNight(n) { if (this.bloom) { this.bloom.strength = 0.22 + n * 0.45; this.bloom.threshold = 3.2 - n * 2.2; this.bloom.radius = 0.3 + n * 0.25; } }
}
