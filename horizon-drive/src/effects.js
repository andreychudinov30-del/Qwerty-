import * as THREE from 'three';
import { canvasTex } from './assets.js';

const puffTex = () => canvasTex(128, 128, (g, w, h) => {
  const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2); const d = Math.sqrt(dx * dx + dy * dy); let a = Math.max(0, 1 - d); a = a * a * (0.65 + 0.35 * Math.random()); const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255; }
  g.putImageData(img, 0, 0); g.filter = 'blur(3px)'; g.drawImage(g.canvas, 0, 0);
}, { srgb: false });

export class Particles {
  constructor(scene, max = 1200, additive = false) {
    this.max = max; this.n = 0; this.p = []; const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: puffTex() }, uScale: { value: 600 }, uLight: { value: new THREE.Color(1, 1, 1) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `attribute float aSize, aAlpha, aRot; attribute vec3 aCol; varying float vA, vR; varying vec3 vC; varying float vFog; uniform float uScale, fogDensity;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = min(512., aSize * uScale / -mv.z); vA = aAlpha; vC = aCol; vR = aRot; float d = -mv.z; vFog = 1.0 - exp(-fogDensity*fogDensity*d*d); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uLight, fogColor; varying float vA, vR; varying vec3 vC; varying float vFog;
        void main(){ vec2 c = gl_PointCoord - .5; float s = sin(vR), co = cos(vR); c = mat2(co,-s,s,co)*c + .5; vec4 t = texture2D(map, c); vec3 col = vC * uLight; ${additive ? 'col *= 3.0;' : ''} col = mix(col, fogColor, vFog); gl_FragColor = vec4(col, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    this.next = 0;
  }
  emit(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, gravity = 0) {
    const p = this.p[this.next]; this.next = (this.next + 1) % this.max;
    Object.assign(p, { x, y, z, vx, vy, vz, size, grow, life, maxLife: life, r, g, b, a, gravity, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.5 });
  }
  update(dt) {
    let n = 0;
    for (const p of this.p) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue;
      p.vy -= p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const drag = Math.exp(-dt * 1.4); p.vx *= drag; p.vz *= drag; if (!p.gravity) p.vy = p.vy * drag + dt * 0.6; p.size += p.grow * dt; p.rot += p.vr * dt;
      const t = p.life / p.maxLife; this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z; this.size[n] = p.size; this.alpha[n] = p.a * Math.min(1, t * 2) * Math.min(1, (1 - t) * 8); this.col[n * 3] = p.r; this.col[n * 3 + 1] = p.g; this.col[n * 3 + 2] = p.b; this.rot[n] = p.rot; n++;
    }
    const g = this.points.geometry; g.setDrawRange(0, n); for (const k of ['position', 'aSize', 'aAlpha', 'aCol', 'aRot']) g.attributes[k].needsUpdate = true;
  }
}

export class Skids {
  constructor(scene, max = 3000) {
    this.max = max; this.i = 0; const g = new THREE.BufferGeometry(); this.pos = new Float32Array(max * 4 * 3); this.a = new Float32Array(max * 4); const idx = new Uint32Array(max * 6);
    for (let k = 0; k < max; k++) { const b = k * 4; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], k * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({ vertexShader: 'attribute float aA; varying float vA; void main(){ vA=aA; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying float vA; void main(){ gl_FragColor=vec4(0.02,0.02,0.02,vA*0.65);}', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1; scene.add(this.mesh); this.last = new Map();
  }
  add(key, x, y, z, rx, rz, w, alpha) {
    const l = this.last.get(key); this.last.set(key, [x, y, z, rx, rz]); if (!l) return;
    if ((l[0] - x) ** 2 + (l[2] - z) ** 2 > 9) return;
    const k = this.i; this.i = (this.i + 1) % this.max; const o = k * 12;
    const P = this.pos; P.set([l[0] + l[3] * w, l[1] + 0.03, l[2] + l[4] * w, l[0] - l[3] * w, l[1] + 0.03, l[2] - l[4] * w, x + rx * w, y + 0.03, z + rz * w, x - rx * w, y + 0.03, z - rz * w], o);
    this.a.set([alpha, alpha, alpha, alpha], k * 4);
    this.dirty = true;
  }
  flush() { if (!this.dirty) return; this.dirty = false; this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.aA.needsUpdate = true; }
  cut(key) { this.last.delete(key); }
}
