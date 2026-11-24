// GPU billboard particles (smoke, dust, sparks, fire, water, glass shards), tracers, flashes
import * as THREE from 'three';
import { G, canvasTex, rand } from '../core/util.js';

function atlas() {
  return canvasTex(512, 128, (g) => {
    // 0 smoke puff
    for (let i = 0; i < 18; i++) {
      const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 20 + Math.random() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    // 1 glow
    let gr = g.createRadialGradient(192, 64, 0, 192, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(128, 0, 128, 128);
    // 2 shard
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(300, 30); g.lineTo(350, 70); g.lineTo(310, 100); g.lineTo(285, 60); g.fill();
    // 3 drop / streak
    gr = g.createLinearGradient(448, 10, 448, 118); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(436, 10, 24, 108);
  }, { repeat: false });
}

class System {
  constructor(scene, map, blending, max) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.ml = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // xyz + size
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // rgb + alpha
    this.aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2); // kind, rot
    this.aP.setUsage(THREE.DynamicDrawUsage); this.aC.setUsage(THREE.DynamicDrawUsage); this.aK.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aC', this.aC); g.setAttribute('aK', this.aK);
    g.instanceCount = 0;
    this.col = new Float32Array(max * 3); this.kind = new Float32Array(max); this.rot = new Float32Array(max); this.vr = new Float32Array(max);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0 } }, transparent: true, depthWrite: false, blending,
      vertexShader: `attribute vec4 aP; attribute vec4 aC; attribute vec2 aK; varying vec2 vUv; varying vec4 vC; varying float vFog; uniform float uFogD;
        void main(){ vec4 mv=modelViewMatrix*vec4(aP.xyz,1.); float c=cos(aK.y), s=sin(aK.y);
          vec2 q=vec2(position.x*c-position.y*s, position.x*s+position.y*c)*aP.w; if(aK.x>2.5) q=position.xy*vec2(aP.w*0.15,aP.w);
          mv.xy+=q; gl_Position=projectionMatrix*mv; vUv=vec2((uv.x+aK.x)/4.,uv.y); vC=aC; float d=length(mv.xyz); vFog=1.-exp(-uFogD*uFogD*d*d); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uFogC; varying vec2 vUv; varying vec4 vC; varying float vFog;
        void main(){ vec4 t=texture2D(map,vUv); vec4 c=vec4(vC.rgb*t.rgb, t.a*vC.a); c.rgb=mix(c.rgb,uFogC*c.a,vFog*0.8); gl_FragColor=c; }`,
    });
    this.mat = m;
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, kind, grav = 0, drag = 0.5) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.a0[i] = a;
    this.kind[i] = kind; this.grav[i] = grav; this.drag[i] = drag; this.rot[i] = Math.random() * 6.28; this.vr[i] = (Math.random() - 0.5) * 2;
  }
  update(dt, scene) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.ml[i]) continue;
      if (w !== i) { // compact
        for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; this.col[w * 3 + k] = this.col[i * 3 + k]; }
        this.life[w] = this.life[i]; this.ml[w] = this.ml[i]; this.s0[w] = this.s0[i]; this.s1[w] = this.s1[i]; this.a0[w] = this.a0[i]; this.kind[w] = this.kind[i]; this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i]; this.rot[w] = this.rot[i]; this.vr[w] = this.vr[i];
      }
      const d = Math.exp(-this.drag[w] * dt);
      this.v[w * 3] *= d; this.v[w * 3 + 1] = this.v[w * 3 + 1] * d - this.grav[w] * dt; this.v[w * 3 + 2] *= d;
      this.p[w * 3] += this.v[w * 3] * dt; this.p[w * 3 + 1] += this.v[w * 3 + 1] * dt; this.p[w * 3 + 2] += this.v[w * 3 + 2] * dt;
      if (this.p[w * 3 + 1] < 0.02 && this.grav[w] > 0) { this.p[w * 3 + 1] = 0.02; this.v[w * 3 + 1] *= -0.3; this.v[w * 3] *= 0.6; this.v[w * 3 + 2] *= 0.6; }
      this.rot[w] += this.vr[w] * dt;
      const t = this.life[w] / this.ml[w];
      const P = this.aP.array, Cc = this.aC.array, K = this.aK.array;
      P[w * 4] = this.p[w * 3]; P[w * 4 + 1] = this.p[w * 3 + 1]; P[w * 4 + 2] = this.p[w * 3 + 2]; P[w * 4 + 3] = this.s0[w] + (this.s1[w] - this.s0[w]) * t;
      Cc[w * 4] = this.col[w * 3]; Cc[w * 4 + 1] = this.col[w * 3 + 1]; Cc[w * 4 + 2] = this.col[w * 3 + 2]; Cc[w * 4 + 3] = this.a0[w] * (1 - t) * Math.min(1, t * 8 + 0.2);
      K[w * 2] = this.kind[w]; K[w * 2 + 1] = this.rot[w];
      w++;
    }
    this.n = w;
    this.mesh.geometry.instanceCount = w;
    this.aP.needsUpdate = this.aC.needsUpdate = this.aK.needsUpdate = true;
    if (scene.fog) { this.mat.uniforms.uFogC.value.copy(scene.fog.color); this.mat.uniforms.uFogD.value = scene.fog.density; }
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const map = atlas();
    this.alpha = new System(scene, map, THREE.NormalBlending, 2500);
    this.add = new System(scene, map, THREE.AdditiveBlending, 1500);
    this.emitters = [];
    // tracers
    this.tr = []; const tg = new THREE.BufferGeometry(); this.trPos = new Float32Array(64 * 6); tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3));
    this.trLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2), transparent: true, opacity: 0.8 }));
    this.trLines.frustumCulled = false; scene.add(this.trLines);
    this.flashL = new THREE.PointLight(0xffaa55, 0, 40, 2); scene.add(this.flashL); this.flashT = 0;
  }
  smoke(x, y, z, n = 6, dark = 0.3, size = 1.5, up = 1.5) {
    for (let i = 0; i < n; i++) { const c = dark + Math.random() * 0.15; this.alpha.emit(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), rand(-0.6, 0.6), up * rand(0.5, 1.2), rand(-0.6, 0.6), rand(1.5, 3.5), size * 0.6, size * 2.4, c, c, c, 0.55, 0, -0.15, 0.6); }
  }
  dust(x, y, z, n = 8, col = [0.62, 0.56, 0.48]) {
    for (let i = 0; i < n; i++) this.alpha.emit(x, y, z, rand(-2, 2), rand(0.3, 1.8), rand(-2, 2), rand(0.6, 1.6), 0.3, 1.4, col[0], col[1], col[2], 0.5, 0, 0.5, 2);
  }
  tire(x, y, z, k = 1) { this.alpha.emit(x + rand(-0.2, 0.2), y + 0.2, z + rand(-0.2, 0.2), rand(-0.5, 0.5), rand(0.3, 0.9), rand(-0.5, 0.5), rand(1, 2.2), 0.6, 2.6 * k, 0.82, 0.82, 0.84, 0.35 * k, 0, -0.05, 1); }
  sparks(x, y, z, n = 10, dir) {
    for (let i = 0; i < n; i++) {
      const vx = rand(-4, 4) + (dir ? dir.x * 3 : 0), vy = rand(1, 5), vz = rand(-4, 4) + (dir ? dir.z * 3 : 0);
      this.add.emit(x, y, z, vx, vy, vz, rand(0.2, 0.6), 0.12, 0.05, 3, 1.8, 0.6, 1, 1, 9.8, 0.5);
    }
  }
  glass(x, y, z, n = 25) {
    for (let i = 0; i < n; i++) this.alpha.emit(x + rand(-0.6, 0.6), y + rand(0, 0.5), z + rand(-0.6, 0.6), rand(-3, 3), rand(0, 3), rand(-3, 3), rand(0.8, 2), 0.12, 0.1, 0.75, 0.9, 0.95, 0.9, 2, 9.8, 0.3);
  }
  muzzle(x, y, z, dir) {
    this.add.emit(x, y, z, dir.x * 2, dir.y * 2, dir.z * 2, 0.06, 0.45, 0.9, 4, 2.6, 1.2, 1, 1, 0, 0);
    this.alpha.emit(x, y, z, dir.x * 1.5, 0.4, dir.z * 1.5, 0.8, 0.15, 0.7, 0.7, 0.7, 0.7, 0.25, 0, -0.1, 1);
    this.flash(x, y, z, 6, 0.05);
  }
  impact(x, y, z, metal = false) {
    if (metal) this.sparks(x, y, z, 8); else this.dust(x, y, z, 5, [0.55, 0.52, 0.48]);
  }
  splash(x, y, z, n = 20) { for (let i = 0; i < n; i++) this.alpha.emit(x, y, z, rand(-2, 2), rand(2, 6), rand(-2, 2), rand(0.6, 1.2), 0.3, 0.8, 0.8, 0.88, 0.95, 0.6, 3, 9.8, 0.2); }
  fire(x, y, z, k = 1) {
    this.add.emit(x + rand(-0.4, 0.4) * k, y, z + rand(-0.4, 0.4) * k, rand(-0.3, 0.3), rand(1.5, 3.5), rand(-0.3, 0.3), rand(0.3, 0.7), 0.8 * k, 0.2, 3.5, 1.4, 0.35, 0.9, 1, -1, 0.5);
    if (Math.random() < 0.4) this.smoke(x, y + 1, z, 1, 0.12, 1.4 * k, 2.5);
  }
  explosion(x, y, z) {
    for (let i = 0; i < 40; i++) this.add.emit(x, y + 0.5, z, rand(-7, 7), rand(1, 9), rand(-7, 7), rand(0.4, 1.1), 2.5, 0.6, 4, 1.8, 0.5, 1, 1, 2, 2.5);
    for (let i = 0; i < 26; i++) { const c = 0.1 + Math.random() * 0.1; this.alpha.emit(x + rand(-1, 1), y + rand(0, 2), z + rand(-1, 1), rand(-3, 3), rand(2, 6), rand(-3, 3), rand(2.5, 5), 2, 7, c, c, c, 0.7, 0, -0.2, 0.8); }
    this.sparks(x, y + 1, z, 40);
    this.flash(x, y + 2, z, 400, 0.35);
  }
  flash(x, y, z, I, t) { this.flashL.position.set(x, y, z); this.flashL.intensity = Math.max(this.flashL.intensity, I); this.flashT = Math.max(this.flashT, t); }
  spray(x, y, z, dur) { this.emitters.push({ x, y, z, t: dur, kind: 'spray' }); }
  tracer(a, b) {
    this.tr.push({ a: a.clone(), b: b.clone(), t: 0.07 });
    if (this.tr.length > 64) this.tr.shift();
  }
  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]; e.t -= dt;
      if (e.kind === 'spray') for (let k = 0; k < 3; k++) this.alpha.emit(e.x, e.y, e.z, rand(-0.6, 0.6), rand(7, 10), rand(-0.6, 0.6), rand(1.2, 1.8), 0.25, 0.9, 0.85, 0.9, 0.95, 0.5, 3, 9.8, 0.1);
      if (e.t <= 0) this.emitters.splice(i, 1);
    }
    this.alpha.update(dt, this.scene); this.add.update(dt, this.scene);
    let n = 0;
    for (let i = this.tr.length - 1; i >= 0; i--) {
      const t = this.tr[i]; t.t -= dt; if (t.t <= 0) { this.tr.splice(i, 1); continue; }
      this.trPos.set([t.a.x, t.a.y, t.a.z, t.b.x, t.b.y, t.b.z], n * 6); n++;
    }
    this.trLines.geometry.setDrawRange(0, n * 2); this.trLines.geometry.attributes.position.needsUpdate = true;
    this.flashT -= dt; if (this.flashT <= 0) this.flashL.intensity *= Math.exp(-dt * 30);
  }
}
