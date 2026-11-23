// Renderer, post-processing chain, quality management, adaptive resolution, context-loss handling.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { getQuality, getProfile } from './save.js';
import { bus, clamp } from './util.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 1.0 },
    uSat: { value: 0.82 },
    uContrast: { value: 1.08 },
    uLift: { value: new THREE.Vector3(0.006, 0.008, 0.012) },
    uGain: { value: new THREE.Vector3(1.0, 0.97, 0.92) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.045 },
    uAberr: { value: 1.0 },
    uFear: { value: 0 },
    uDamage: { value: 0 },
    uFlash: { value: 0 },
    uBlack: { value: 0 },
    uDistort: { value: 0 },
    uToxic: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uExposure, uSat, uContrast, uVignette, uGrain, uAberr, uFear, uDamage, uFlash, uBlack, uDistort, uToxic;
    uniform vec3 uLift, uGain; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 color){
      const mat3 i = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
      const mat3 o = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
      color = i*color; color = RRTAndODTFit(color); color = o*color; return clamp(color,0.,1.);
    }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), c)); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      // fear / toxic wobble
      float wob = uDistort*0.006 + uToxic*0.004;
      uv += vec2(sin(uv.y*24.0 + uTime*3.1), cos(uv.x*19.0 + uTime*2.3)) * wob;
      float r2 = dot(d, d);
      float ab = uAberr * (0.0015 + 0.007*uFear + 0.01*uDamage) * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d*ab).b;
      col *= uExposure * 1.25;
      col = aces(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat - uFear*0.25);
      col = (col - 0.5)*uContrast + 0.5;
      col = max(col, 0.0);
      col = col*uGain + uLift*(1.0 - col);
      col = mix(col, col*vec3(0.9,1.15,0.7), uToxic*0.6);
      float dmg = uDamage * smoothstep(0.05, 0.5, r2*2.0);
      col = mix(col, vec3(l*1.2+0.05, 0.0, 0.0), dmg*0.8);
      col *= 1.0 - clamp(uVignette*(1.0+uFear*0.6), 0.0, 1.0) * smoothstep(0.12, 0.72, r2*2.0);
      vec3 sc = toSRGB(clamp(col, 0.0, 1.0));
      float g = hash(floor(vUv*uRes) + fract(uTime*7.31)*91.7) - 0.5;
      sc += g * uGrain * (0.7 + uFear*0.8);
      sc = mix(sc, vec3(1.0), uFlash);
      sc *= 1.0 - uBlack;
      gl_FragColor = vec4(sc, 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false, preserveDrawingBuffer: false });
    } catch (e) {
      throw new Error('WebGL2 недоступен на этом устройстве');
    }
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.setClearColor(0x000000, 1);
    renderer.info.autoReset = false;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.gpu = this._gpuName();

    this.composer = null;
    this.scene = null;
    this.camera = null;
    this.quality = getQuality();
    this.dynScale = 1; // adaptive resolution multiplier
    this.fpsSamples = [];
    this.fps = 60;
    this.frameTime = 16;
    this.contextLost = false;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.contextLost = true; bus.emit('engine:contextlost'); }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.contextLost = false; bus.emit('engine:contextrestored'); }, false);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.grade = new ShaderPass(GradeShader);
    this.uniforms = this.grade.uniforms;
    this.resize();
  }

  _gpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) { return 'unknown'; }
  }

  pixelRatio() {
    const q = this.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
    return clamp(dpr * q.resolution * this.dynScale, 0.35, 3);
  }

  setView(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.buildComposer();
  }

  applyQuality() {
    this.quality = getQuality();
    this.dynScale = 1;
    this.renderer.shadowMap.enabled = this.quality.shadows > 0;
    this.buildComposer();
    this.resize();
    bus.emit('quality', this.quality);
  }

  buildComposer() {
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (this.gtao) { this.gtao.dispose?.(); this.gtao = null; }
    if (this.bloom) { this.bloom.dispose?.(); this.bloom = null; }
    if (!this.scene || !this.camera) return;
    const q = this.quality;
    if (!q.postfx) { this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15; return; }
    this.renderer.toneMapping = THREE.NoToneMapping;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const gtao = new GTAOPass(this.scene, this.camera, Math.max(2, size.x >> 1), Math.max(2, size.y >> 1));
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      composer.addPass(gtao);
      this.gtao = gtao;
    }
    if (q.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x >> 1, size.y >> 1), 0.55, 0.6, 0.82);
      composer.addPass(bloom);
      this.bloom = bloom;
    }
    composer.addPass(this.grade);
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (this.composer) {
      this.composer.setSize(size.x, size.y);
      if (this.gtao) this.gtao.setSize(Math.max(2, size.x >> 1), Math.max(2, size.y >> 1));
    }
    this.uniforms.uRes.value.set(size.x, size.y);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  // adaptive resolution: keep framerate playable on weak devices
  adapt(dt) {
    this.frameTime = this.frameTime * 0.95 + dt * 1000 * 0.05;
    this.fps = 1000 / this.frameTime;
    if (!getProfile().settings.adaptive) return;
    this._adaptT = (this._adaptT || 0) + dt;
    if (this._adaptT < 2.5) return;
    this._adaptT = 0;
    const prev = this.dynScale;
    if (this.fps < 26 && this.dynScale > 0.55) this.dynScale = Math.max(0.55, this.dynScale - 0.12);
    else if (this.fps > 52 && this.dynScale < 1) this.dynScale = Math.min(1, this.dynScale + 0.08);
    if (prev !== this.dynScale) this.resize();
  }

  render(dt) {
    if (this.contextLost || !this.scene || !this.camera) return;
    this.renderer.info.reset();
    this.uniforms.uTime.value += dt;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
