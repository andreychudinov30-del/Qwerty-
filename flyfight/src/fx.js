import * as THREE from 'three';
import { rand, clamp } from './util.js';
import { ATMO, ATMO_GLSL } from './sky.js';
import { smokeAtlas, fireAtlas } from './textures.js';

const V = new THREE.Vector3();
class ParticleSystem {
  constructor(max, tex, additive, lit) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.ml = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.var = new Float32Array(max); this.rot = new Float32Array(max); this.rs = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.st = new Float32Array(max); this.cool = new Float32Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aV = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aP', this.aP); g.setAttribute('aS', this.aS); g.setAttribute('aC', this.aC); g.setAttribute('aV', this.aV); g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ tTex: { value: tex }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.5, 0.55, 0.6) } }, ATMO),
      vertexShader: `attribute vec3 aP; attribute vec4 aS; attribute vec4 aC; attribute vec4 aV; varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec2 vQ;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          vec4 mv = viewMatrix * vec4(aP, 1.0);
          vec2 q = position.xy; vQ = q;
          float c = cos(aS.y), s = sin(aS.y);
          if (aV.w > 0.0) {
            vec3 d = (viewMatrix * vec4(aV.xyz, 0.0)).xyz; vec2 ax = normalize(d.xy + 1e-5);
            vec2 px = vec2(-ax.y, ax.x);
            mv.xy += px * q.x * aS.x + ax * q.y * (aS.x + aV.w);
          } else mv.xy += vec2(c*q.x - s*q.y, s*q.x + c*q.y) * aS.x;
          float v = aS.w; vUv = (q*0.5+0.5)*0.5 + vec2(mod(v,2.0), floor(v/2.0))*0.5;
          vCol = vec4(aC.rgb, aS.z); vW = (inverse(viewMatrix)*mv).xyz;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D tTex; uniform vec3 uSunCol, uAmb; varying vec2 vUv; varying vec4 vCol; varying vec3 vW; varying vec2 vQ;
        ${ATMO_GLSL}
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(tTex, vUv);
          ${lit ? `float sh = clamp(dot(normalize(vec3(vQ, 0.7)), vec3(0.0,0.6,0.5))*0.5+0.6, 0.0, 1.2);
          vec3 col = vCol.rgb * t.rgb * (uAmb + uSunCol*0.55*sh);
          col = applyAtmo(col, vW);
          gl_FragColor = vec4(col, t.a * vCol.a);` : `vec3 col = vCol.rgb * t.rgb; float a = t.a * vCol.a;
          float f = 1.0 - exp(-uFogDensity*length(vW-cameraPosition)*0.6);
          gl_FragColor = vec4(col * a * (1.0 - f), a);`}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
    });
    if (additive) { this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor; this.mat.blendEquation = THREE.AddEquation; }
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 42 : 40;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, variant, o = {}) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b; this.life[i] = 0; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.var[i] = variant;
    this.rot[i] = Math.random() * 6.28; this.rs[i] = o.rs ?? (Math.random() - 0.5) * 0.8; this.drag[i] = o.drag ?? 0.5; this.grav[i] = o.grav ?? 0; this.st[i] = o.stretch ?? 0; this.cool[i] = o.cool ?? 0;
    return i;
  }
  update(dt) {
    let w = 0; const n = this.n;
    const P = this.aP.array, S = this.aS.array, C = this.aC.array, Vv = this.aV.array;
    for (let i = 0; i < n; i++) {
      const l = this.life[i] + dt; if (l >= this.ml[i]) continue;
      // compact
      if (w !== i) {
        for (const arr of [this.p, this.v, this.c]) { arr[w * 3] = arr[i * 3]; arr[w * 3 + 1] = arr[i * 3 + 1]; arr[w * 3 + 2] = arr[i * 3 + 2]; }
        for (const arr of [this.ml, this.s0, this.s1, this.a0, this.var, this.rot, this.rs, this.drag, this.grav, this.st, this.cool]) arr[w] = arr[i];
      }
      this.life[w] = l;
      const dr = Math.exp(-this.drag[w] * dt);
      this.v[w * 3] *= dr; this.v[w * 3 + 1] = this.v[w * 3 + 1] * dr + this.grav[w] * dt; this.v[w * 3 + 2] *= dr;
      this.p[w * 3] += this.v[w * 3] * dt; this.p[w * 3 + 1] += this.v[w * 3 + 1] * dt; this.p[w * 3 + 2] += this.v[w * 3 + 2] * dt;
      this.rot[w] += this.rs[w] * dt;
      const t = l / this.ml[w];
      P[w * 3] = this.p[w * 3]; P[w * 3 + 1] = this.p[w * 3 + 1]; P[w * 3 + 2] = this.p[w * 3 + 2];
      const fadeIn = Math.min(1, t * 12);
      S[w * 4] = this.s0[w] + (this.s1[w] - this.s0[w]) * Math.sqrt(t); S[w * 4 + 1] = this.rot[w]; S[w * 4 + 2] = this.a0[w] * (1 - t) * (1 - t * 0.3) * fadeIn; S[w * 4 + 3] = this.var[w];
      const cool = this.cool[w] * t; // fire cools to smoke colour
      C[w * 4] = this.c[w * 3] * (1 - cool); C[w * 4 + 1] = this.c[w * 3 + 1] * (1 - cool * 1.2); C[w * 4 + 2] = this.c[w * 3 + 2] * (1 - cool);
      if (this.st[w] > 0) { const vx = this.v[w * 3], vy = this.v[w * 3 + 1], vz = this.v[w * 3 + 2]; const sp = Math.hypot(vx, vy, vz) + 1e-5; Vv[w * 4] = vx / sp; Vv[w * 4 + 1] = vy / sp; Vv[w * 4 + 2] = vz / sp; Vv[w * 4 + 3] = this.st[w]; }
      else Vv[w * 4 + 3] = 0;
      w++;
    }
    this.n = w; this.mesh.geometry.instanceCount = w;
    if (w) { this.aP.needsUpdate = this.aS.needsUpdate = this.aC.needsUpdate = this.aV.needsUpdate = true; }
  }
  clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
}

// Camera-facing ribbon trail
export class Trail {
  constructor(fx, max, width, color, opacity, life, additive = false) {
    this.fx = fx; this.max = max; this.w = width; this.life = life; this.pts = []; this.alive = true; this.emitting = true;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3); this.al = new Float32Array(max * 2); this.uvv = new Float32Array(max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('side', new THREE.BufferAttribute(this.uvv, 1));
    const idx = []; for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    for (let i = 0; i < max; i++) { this.uvv[i * 2] = -1; this.uvv[i * 2 + 1] = 1; }
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uCol: { value: new THREE.Color(color) }, uOp: { value: opacity } }, ATMO),
      vertexShader: `attribute float alpha; attribute float side; varying float vA; varying float vS; varying vec3 vW;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vA = alpha; vS = side; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0);
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform vec3 uCol; uniform float uOp; varying float vA; varying float vS; varying vec3 vW;
        ${ATMO_GLSL}
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          float e = 1.0 - vS*vS; float a = vA * uOp * e;
          ${additive ? 'gl_FragColor = vec4(uCol * a, a);' : 'gl_FragColor = vec4(applyAtmo(uCol, vW), a);'}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 41;
    fx.scene.add(this.mesh);
  }
  add(p, strength = 1) {
    const last = this.pts[this.pts.length - 1];
    if (last && last.p.distanceToSquared(p) < 4) { last.p.copy(p); last.s = strength; return; }
    this.pts.push({ p: p.clone(), t: 0, s: strength });
    if (this.pts.length > this.max) this.pts.shift();
  }
  update(dt, cam) {
    for (const q of this.pts) q.t += dt;
    while (this.pts.length && this.pts[0].t > this.life) this.pts.shift();
    if (!this.emitting && !this.pts.length) { this.alive = false; return; }
    const n = this.pts.length; const cp = cam.position;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
    for (let i = 0; i < this.max; i++) {
      const q = this.pts[Math.min(i, n - 1)];
      if (!q) break;
      const a = this.pts[Math.min(Math.max(i - 1, 0), n - 1)].p, b = this.pts[Math.min(i + 1, n - 1)].p;
      A.subVectors(b, a); Cc.subVectors(q.p, cp); B.crossVectors(A, Cc).normalize();
      const age = q.t / this.life; const w = this.w * (1 + age * 3);
      this.pos[i * 6] = q.p.x + B.x * w; this.pos[i * 6 + 1] = q.p.y + B.y * w; this.pos[i * 6 + 2] = q.p.z + B.z * w;
      this.pos[i * 6 + 3] = q.p.x - B.x * w; this.pos[i * 6 + 4] = q.p.y - B.y * w; this.pos[i * 6 + 5] = q.p.z - B.z * w;
      const al = i < n ? (1 - age) * q.s * Math.min(1, i / 3) : 0;
      this.al[i * 2] = al; this.al[i * 2 + 1] = al;
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
  dispose() { this.fx.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

export class FX {
  constructor(scene, Q) {
    this.scene = scene; this.Q = Q;
    this.smoke = new ParticleSystem(Math.floor(4000 * Q.particles), smokeAtlas(), false, true);
    this.fire = new ParticleSystem(Math.floor(3500 * Q.particles), fireAtlas(), true, false);
    scene.add(this.smoke.mesh); scene.add(this.fire.mesh);
    this.trails = []; this.lights = [];
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 1500, 1.6); scene.add(this.flashLight); this.flashT = 0;
  }
  setLighting(sunCol, amb) { this.smoke.mat.uniforms.uSunCol.value.copy(sunCol); this.smoke.mat.uniforms.uAmb.value.copy(amb); }
  trail(max, width, color, opacity, life, additive) { const t = new Trail(this, max, width, color, opacity, life, additive); this.trails.push(t); return t; }
  explosion(p, scale = 1, vel = null) {
    const q = this.Q.particles; const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.35, 20 * scale, 70 * scale, 1, 0.9, 0.7, 1.6, 1, { rs: 0 });
    this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.9, 30 * scale, 90 * scale, 1, 0.6, 0.3, 0.6, 3, { rs: 0 });
    const nf = Math.floor(16 * q * scale + 4);
    for (let i = 0; i < nf; i++) { V.randomDirection().multiplyScalar(rand(10, 45) * scale); this.fire.emit(p.x, p.y, p.z, V.x + vx, V.y + vy, V.z + vz, rand(0.6, 1.4), 6 * scale, rand(14, 26) * scale, 1, rand(0.45, 0.7), 0.2, 1.3, 0, { drag: 2.2, cool: 0.6, grav: 3 }); }
    const ns = Math.floor(22 * q * scale + 4);
    for (let i = 0; i < ns; i++) { V.randomDirection().multiplyScalar(rand(4, 22) * scale); const g = rand(0.08, 0.2); this.smoke.emit(p.x + V.x, p.y + V.y, p.z + V.z, V.x + vx * 0.5, V.y + 3 + vy * 0.5, V.z + vz * 0.5, rand(4, 9), 10 * scale, rand(30, 55) * scale, g, g, g * 1.05, 0.85, (Math.random() * 4) | 0, { drag: 0.9, grav: 1.5 }); }
    const nk = Math.floor(30 * q * scale);
    for (let i = 0; i < nk; i++) { V.randomDirection().multiplyScalar(rand(60, 180)); this.fire.emit(p.x, p.y, p.z, V.x + vx, V.y + vy, V.z + vz, rand(0.5, 1.6), 0.6, 0.3, 1, 0.7, 0.3, 1.5, 2, { drag: 1.2, grav: -9.8, stretch: 4 }); }
    this.flash(p, 6 * scale);
  }
  groundExplosion(p, scale = 1) {
    this.explosion(p, scale * 1.3);
    for (let i = 0; i < 16 * this.Q.particles; i++) { V.randomDirection(); V.y = Math.abs(V.y) * 2; V.multiplyScalar(rand(10, 40) * scale); const g = rand(0.25, 0.4); this.smoke.emit(p.x, p.y + 5, p.z, V.x, V.y, V.z, rand(5, 11), 15 * scale, 60 * scale, g * 1.1, g, g * 0.85, 0.8, (Math.random() * 4) | 0, { drag: 0.8, grav: 2 }); }
  }
  splash(p) { for (let i = 0; i < 24; i++) { V.set(rand(-1, 1), rand(2, 5), rand(-1, 1)).multiplyScalar(rand(6, 18)); this.smoke.emit(p.x, 1, p.z, V.x, V.y, V.z, rand(1.5, 3.5), 6, 22, 0.95, 0.97, 1, 0.8, (Math.random() * 4) | 0, { grav: -9.8, drag: 0.6 }); } }
  sparks(p, n = 6) { for (let i = 0; i < n; i++) { V.randomDirection().multiplyScalar(rand(20, 70)); this.fire.emit(p.x, p.y, p.z, V.x, V.y, V.z, rand(0.2, 0.5), 0.4, 0.2, 1, 0.8, 0.4, 1.5, 2, { stretch: 2, drag: 2 }); }
    this.fire.emit(p.x, p.y, p.z, 0, 0, 0, 0.12, 2.5, 5, 1, 0.8, 0.5, 1.2, 1, { rs: 0 }); }
  smokePuff(p, v, size, gray, alpha, life) { this.smoke.emit(p.x, p.y, p.z, v.x, v.y, v.z, life, size * 0.4, size, gray, gray, gray * 1.03, alpha, (Math.random() * 4) | 0, { drag: 1.2, grav: 0.8 }); }
  firePuff(p, v, size, life = 0.5) { this.fire.emit(p.x, p.y, p.z, v.x, v.y, v.z, life, size, size * 0.4, 1, rand(0.45, 0.7), 0.15, 1.2, 0, { drag: 2, cool: 0.4 }); }
  glow(p, size, r, g, b, a, life = 0.05) { this.fire.emit(p.x, p.y, p.z, 0, 0, 0, life, size, size, r, g, b, a, 3, { rs: 0 }); }
  muzzle(p, dir) { this.fire.emit(p.x + dir.x * 1.5, p.y + dir.y * 1.5, p.z + dir.z * 1.5, 0, 0, 0, 0.05, 1.6, 2.4, 1, 0.75, 0.4, 1.6, 1, { rs: 0 }); }
  tracer(p, v, life = 0.12) { this.fire.emit(p.x, p.y, p.z, v.x, v.y, v.z, life, 0.35, 0.35, 1, 0.75, 0.35, 2.0, 2, { stretch: 12, drag: 0 }); }
  flash(p, intensity) { this.flashLight.position.copy(p); this.flashLight.intensity = intensity * 2e5; this.flashT = 0.25; }
  update(dt, cam) {
    this.smoke.update(dt); this.fire.update(dt);
    for (let i = this.trails.length - 1; i >= 0; i--) { const t = this.trails[i]; t.update(dt, cam); if (!t.alive) { t.dispose(); this.trails.splice(i, 1); } }
    if (this.flashT > 0) { this.flashT -= dt; this.flashLight.intensity *= Math.exp(-dt * 14); if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }
  clear() { this.smoke.clear(); this.fire.clear(); for (const t of this.trails) t.dispose(); this.trails = []; }
  dispose() { this.clear(); this.scene.remove(this.smoke.mesh); this.scene.remove(this.fire.mesh); this.scene.remove(this.flashLight); }
}

// Precipitation around the camera
export class Precip {
  constructor(scene, weather, Q) {
    this.kind = weather.rain ? 'rain' : weather.snow ? 'snow' : null; this.scene = scene;
    if (!this.kind) return;
    const n = Math.floor((this.kind === 'rain' ? 5000 : 4000) * Q.particles); this.n = n; this.R = 70;
    this.base = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) this.base[i] = (Math.random() - 0.5) * 2 * this.R;
    const g = new THREE.BufferGeometry();
    if (this.kind === 'rain') {
      this.pos = new Float32Array(n * 6); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.35, depthWrite: false }));
    } else {
      this.pos = new Float32Array(n * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      this.mesh = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, transparent: true, opacity: 0.85, depthWrite: false }));
    }
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 50; scene.add(this.mesh); this.t = 0;
  }
  update(dt, cam, vel) {
    if (!this.kind) return; this.t += dt;
    const fall = this.kind === 'rain' ? 9 : 1.5; const R = this.R, R2 = R * 2;
    const vx = vel ? vel.x : 0, vy = vel ? vel.y : 0, vz = vel ? vel.z : 0;
    const off = this.t * fall; const cp = cam.position;
    const wrap = (v, c) => { let x = ((v - c) % R2 + R2 * 1.5) % R2 - R; return c + x; };
    for (let i = 0; i < this.n; i++) {
      const bx = this.base[i * 3], by = this.base[i * 3 + 1] - off * (0.8 + (i % 7) * 0.05), bz = this.base[i * 3 + 2];
      const x = wrap(bx - vx * this.t * 0.0, cp.x), y = wrap(by, cp.y), z = wrap(bz, cp.z);
      if (this.kind === 'rain') {
        const k = 0.012; this.pos[i * 6] = x; this.pos[i * 6 + 1] = y; this.pos[i * 6 + 2] = z;
        this.pos[i * 6 + 3] = x + vx * k; this.pos[i * 6 + 4] = y + (vy + fall * 6) * k; this.pos[i * 6 + 5] = z + vz * k;
      } else { this.pos[i * 3] = x + Math.sin(this.t + i) * 0.5; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); } }
}
