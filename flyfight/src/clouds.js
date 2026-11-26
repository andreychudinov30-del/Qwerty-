import * as THREE from 'three';
import { rng, clamp, smooth } from './util.js';
import { ATMO, ATMO_GLSL } from './sky.js';
import { cloudAtlas } from './textures.js';

export class Clouds {
  constructor(weather, Q, seed, size, colors) {
    const R = rng(seed * 13 + 5);
    const clusters = []; const puffs = [];
    const cov = weather.clouds; const n = Math.floor((40 + cov * 190) * Q.clouds);
    const base = weather.overcast > 0.5 ? 2200 : 1400 + R() * 900;
    const half = Math.min(size * 0.5, 26000);
    for (let i = 0; i < n; i++) {
      const storm = weather.lightning > 0 && R() < 0.25;
      const cx = (R() - 0.5) * 2 * half, cz = (R() - 0.5) * 2 * half;
      const rx = (storm ? 1800 : 700) + R() * (storm ? 1500 : 1300), rz = rx * (0.6 + R() * 0.6);
      const ry = storm ? 2500 + R() * 2500 : weather.overcast > 0.5 ? 220 + R() * 200 : 300 + R() * 600;
      const cy = base + R() * 300 + ry * 0.55;
      const c = { x: cx, y: cy, z: cz, rx, ry, rz, base: cy - ry * 0.55 };
      clusters.push(c);
      const np = Math.floor((storm ? 70 : 16 + rx / 60) * Math.min(1.3, Q.clouds + 0.2));
      for (let k = 0; k < np; k++) {
        let ox, oy, oz;
        do { ox = R() * 2 - 1; oy = R() * 2 - 1; oz = R() * 2 - 1; } while (ox * ox + oy * oy + oz * oz > 1);
        oy = Math.abs(oy) * (R() < 0.75 ? 1 : -0.35); // flat bottoms
        const size = (0.35 + R() * 0.45) * Math.min(rx, rz) * (1 - oy * 0.35) * (storm ? 0.9 : 1.1);
        puffs.push({ x: cx + ox * rx * 0.85, y: c.base + (oy * 0.5 + 0.5) * ry * 1.1 + size * 0.2, z: cz + oz * rz * 0.85, s: size, v: (R() * 4) | 0, h: oy * 0.5 + 0.5, ox, oy, oz });
      }
    }
    this.clusters = clusters; this.puffs = puffs; this.count = puffs.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 4), 4); this.aData.setUsage(THREE.DynamicDrawUsage);
    this.aOff = new THREE.InstancedBufferAttribute(new Float32Array(this.count * 3), 3); this.aOff.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aData', this.aData); geo.setAttribute('aOff', this.aOff);
    geo.instanceCount = this.count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ tAtlas: { value: cloudAtlas() }, uSunCol: { value: colors.sun.clone().multiplyScalar(colors.sunI / 3) }, uAmb: { value: colors.ambSky.clone() }, uDark: { value: weather.overcast } }, ATMO),
      vertexShader: `attribute vec3 aPos; attribute vec4 aData; attribute vec3 aOff; varying vec2 vUv; varying vec2 vC; varying float vA; varying vec3 vW; varying vec4 vD; varying vec3 vO; varying vec3 vN;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){
          float s = aData.x; vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float dist = -mv.z;
          float fade = smoothstep(s*0.4, s*1.6, dist) * (1.0 - smoothstep(40000.0, 52000.0, dist));
          mv.xy += position.xy * s; vC = position.xy;
          float v = aData.y; vUv = (position.xy*0.5+0.5)*0.5 + vec2(mod(v,2.0), floor(v/2.0))*0.5;
          vA = fade; vD = aData; vO = aOff;
          vN = normalize((inverse(viewMatrix) * vec4(position.xy*0.85, 0.6, 0.0)).xyz);
          vW = (inverse(viewMatrix) * mv).xyz;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D tAtlas; uniform vec3 uSunCol, uAmb; uniform float uDark; varying vec2 vUv; varying vec2 vC; varying float vA; varying vec3 vW; varying vec4 vD; varying vec3 vO; varying vec3 vN;
        ${ATMO_GLSL}
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(tAtlas, vUv);
          float a = t.a * vA; if (a < 0.01) discard;
          vec3 n = normalize(vN + vO*0.8);
          float ndl = dot(n, uSunDir);
          float lit = clamp(ndl*0.55 + 0.45, 0.0, 1.0);
          float h = vD.z; // height in cluster
          float occ = mix(0.45, 1.0, h) * (0.75 + 0.25*t.r);
          float sunSide = clamp(dot(normalize(vO+vec3(0.0,0.3,0.0)), uSunDir)*0.5+0.5, 0.0, 1.0);
          vec3 rd = normalize(vW - cameraPosition);
          float fw = pow(max(dot(rd, uSunDir), 0.0), 8.0);
          vec3 col = uAmb * (0.55 + 0.35*h) * (1.0 - uDark*0.35);
          col += uSunCol * lit * occ * mix(0.55, 1.0, sunSide) * (1.0 - uDark*0.55);
          col += uSunCol * fw * (1.0 - t.a) * 2.5 * (1.0 - uDark);
          col *= mix(0.85, 1.08, t.r);
          col = applyAtmo(col, vW);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 30;
    this.order = new Uint32Array(this.count); for (let i = 0; i < this.count; i++) this.order[i] = i;
    this.depth = new Float32Array(this.count);
    this.frame = 0; this.sort(new THREE.Vector3(0, 1000, 0));
  }
  sort(cp) {
    const P = this.puffs, d = this.depth;
    for (let i = 0; i < this.count; i++) { const p = P[i]; d[i] = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 + (p.z - cp.z) ** 2; }
    const o = Array.from(this.order); o.sort((a, b) => d[b] - d[a]);
    const ap = this.aPos.array, ad = this.aData.array, ao = this.aOff.array;
    for (let i = 0; i < o.length; i++) { const p = P[o[i]]; ap[i * 3] = p.x; ap[i * 3 + 1] = p.y; ap[i * 3 + 2] = p.z; ad[i * 4] = p.s; ad[i * 4 + 1] = p.v; ad[i * 4 + 2] = p.h; ao[i * 3] = p.ox; ao[i * 3 + 1] = p.oy; ao[i * 3 + 2] = p.oz; }
    this.order = Uint32Array.from(o);
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true; this.aOff.needsUpdate = true;
  }
  update(cam, dt) {
    if ((this.frame++ % 12) === 0) this.sort(cam.position);
    // in-cloud factor
    let inC = 0; const p = cam.position;
    for (const c of this.clusters) {
      const dx = (p.x - c.x) / (c.rx * 0.8), dy = (p.y - (c.base + c.ry * 0.5)) / (c.ry * 0.6), dz = (p.z - c.z) / (c.rz * 0.8);
      const d = dx * dx + dy * dy + dz * dz; if (d < 1) inC = Math.max(inC, smooth(1, 0.4, d));
    }
    ATMO.uInCloud.value += (inC * 0.85 - ATMO.uInCloud.value) * Math.min(1, dt * 3);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
