// Visual effects: flashlight cookie, volumetric light cones, dust lit by the flashlight beam, sparks, blood mist.
import * as THREE from 'three';
import { canvasTexture } from '../core/assets.js';

export function flashlightCookie() {
  return canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    gr.addColorStop(0, 'rgba(255,250,240,1)');
    gr.addColorStop(0.16, 'rgba(255,245,230,0.95)');
    gr.addColorStop(0.22, 'rgba(255,240,220,0.55)');
    gr.addColorStop(0.3, 'rgba(255,240,220,0.62)'); // reflector ring
    gr.addColorStop(0.38, 'rgba(240,230,210,0.32)');
    gr.addColorStop(0.75, 'rgba(200,190,170,0.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // smudges on the lens
    for (let i = 0; i < 26; i++) {
      const x = cx + (Math.random() - 0.5) * w * 0.7, y = cy + (Math.random() - 0.5) * h * 0.7, r = 6 + Math.random() * 26;
      const s = g.createRadialGradient(x, y, 0, x, y, r);
      s.addColorStop(0, 'rgba(0,0,0,0.18)'); s.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = s; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, { srgb: true });
}

// additive volumetric cone (soft edges via view-angle falloff + animated noise)
export function makeBeam(length = 8, radius = 2.2, color = 0xfff0dc, strength = 0.11) {
  const geo = new THREE.CylinderGeometry(0.03, radius, length, 32, 12, true);
  geo.translate(0, -length / 2, 0);
  geo.rotateX(-Math.PI / 2); // point along -Z
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uLen: { value: length }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vLocal;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = -position.z; vLocal = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength; uniform float uLen; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying float vD; varying vec3 vLocal;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float along = clamp(vD / uLen, 0.0, 1.0);
        float fall = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.08, along);
        float n = 0.65 + 0.7 * noise(vLocal * 1.7 + vec3(0.0, uTime * 0.25, uTime * 0.1));
        float a = edge * fall * n * uStrength;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}

// dust motes around the camera, only visible inside the flashlight cone
export class Dust {
  constructor(count = 600) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * 12; pos[i * 3 + 1] = (Math.random() - 0.5) * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; seed[i] = Math.random(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uLPos: { value: new THREE.Vector3() }, uLDir: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(0.45) }, uOn: { value: 1 },
      uScale: { value: 300 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute float seed; uniform vec3 uCam; uniform float uTime; uniform vec3 uLPos; uniform vec3 uLDir; uniform float uCos; uniform float uOn; uniform float uScale;
        varying float vA;
        void main(){
          vec3 p = position;
          p += vec3(sin(uTime*0.13 + seed*40.0), sin(uTime*0.07 + seed*13.0)*0.6 - uTime*0.02, cos(uTime*0.11 + seed*27.0)) * 0.6;
          vec3 box = vec3(12.0, 6.0, 12.0);
          vec3 rel = mod(p - uCam + box*0.5, box) - box*0.5;
          vec3 wp = uCam + rel;
          vec3 toP = wp - uLPos; float d = length(toP);
          float inside = smoothstep(uCos, uCos + 0.05, dot(toP/d, uLDir)) * uOn;
          vA = inside * (1.0 - smoothstep(2.0, 7.0, d)) * (0.4 + 0.6*fract(seed*7.3)) * smoothstep(0.3, 0.8, d);
          vec4 mv = modelViewMatrix * vec4(wp, 1.0);
          gl_PointSize = (0.012 + 0.02*seed) * uScale / max(0.2, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c,c); if (r > 0.25) discard; gl_FragColor = vec4(vec3(1.0,0.95,0.85) * vA * (1.0 - r*4.0) * 0.9, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
  }
  update(dt, cam, lpos, ldir, on, angle, heightPx) {
    const u = this.uniforms;
    u.uTime.value += dt; u.uCam.value.copy(cam.position); u.uLPos.value.copy(lpos); u.uLDir.value.copy(ldir); u.uOn.value = on; u.uCos.value = Math.cos(angle);
    u.uScale.value = heightPx;
  }
}

// short-lived particle bursts (sparks, debris, splashes) with pooling
export class Particles {
  constructor(max = 300) {
    this.max = max;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.base = new Float32Array(max * 3);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.next = 0;
  }
  emit(p, n, { color = [3, 1.8, 0.6], speed = 3, up = 1.5, life = 0.6, gravity = 9.8, spread = 1 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.vel[i * 3] = Math.cos(a) * s * spread; this.vel[i * 3 + 1] = up * (0.5 + Math.random()); this.vel[i * 3 + 2] = Math.sin(a) * s * spread;
      this.life[i] = this.maxLife[i] = life * (0.5 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.base[i * 3] = color[0]; this.base[i * 3 + 1] = color[1]; this.base[i * 3 + 2] = color[2];
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 3] = this.base[i * 3] * k; this.col[i * 3 + 1] = this.base[i * 3 + 1] * k; this.col[i * 3 + 2] = this.base[i * 3 + 2] * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
