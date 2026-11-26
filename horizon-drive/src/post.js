import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const FinalShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uVig: { value: 0.35 }, uCA: { value: 0.0015 }, uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.45) }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur, uVig, uCA, uTime, uFlash; uniform vec2 uCenter; varying vec2 vUv;
    void main(){ vec2 d = vUv - uCenter; float r = length(d); vec3 c = vec3(0.);
      float amt = uBlur * smoothstep(0.12, 0.7, r);
      if (amt < 0.0008) { c = texture2D(tDiffuse, vUv).rgb; } else {
        for (int i = 0; i < 10; i++) { float t = float(i) / 9.0; vec2 uv = vUv - d * amt * t * 0.09; c += texture2D(tDiffuse, uv).rgb; }
        c /= 10.0; }
      vec2 off = d * uCA * (1.0 + uBlur * 2.0); c.r = mix(c.r, texture2D(tDiffuse, vUv + off).r, 0.6); c.b = mix(c.b, texture2D(tDiffuse, vUv - off).b, 0.6);
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(vec3(0.0), mix(vec3(lum), c, 1.18));
      c *= 1.0 - uVig * smoothstep(0.35, 0.95, r * 1.25);
      c += uFlash;
      gl_FragColor = vec4(c, 1.0); }`,
};

export class Post {
  constructor(renderer, scene, camera, q) {
    this.r = renderer; this.q = q; this.scene = scene; this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.render = new RenderPass(scene, camera); this.composer.addPass(this.render);
    if (q.ao) { this.ao = new GTAOPass(scene, camera, size.x, size.y); this.ao.output = GTAOPass.OUTPUT.Default; this.ao.blendIntensity = 0.85; this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 }); this.composer.addPass(this.ao); }
    if (q.bloom) { this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.92); this.composer.addPass(this.bloom); }
    this.final = new ShaderPass(FinalShader); this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    if (!q.msaa) { this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa); }
    this.resize();
  }
  setScene(scene, camera) { this.render.scene = scene; this.render.camera = camera; if (this.ao) { this.ao.scene = scene; this.ao.camera = camera; } }
  resize() {
    const s = this.r.getSize(new THREE.Vector2()); const pr = this.r.getPixelRatio(); this.composer.setPixelRatio(pr); this.composer.setSize(s.x, s.y);
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (s.x * pr), 1 / (s.y * pr));
  }
  draw(dt) { this.composer.render(dt); }
}
