import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { tex } from './assets.js';
import { wetUniform, timeUniform } from './world.js';
import { nightUniform, windUniform } from './props.js';
import { clamp, smooth, lerp } from './noise.js';

export const WEATHERS = { clear: 'Ясно', cloudy: 'Облачно', rain: 'Дождь', fog: 'Туман' };

const cloudVS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const cloudFS = `uniform float uTime, uCover, uDark; uniform vec3 uSun, uSunCol, uAmb; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
void main(){ vec2 p = vW.xz/2600. + vec2(uTime*0.004, uTime*0.0015);
  float d = fbm(p*3.0); float c = smoothstep(1.0-uCover, 1.0-uCover+0.35, d);
  float d2 = fbm(p*3.0 + uSun.xz*0.04); float shade = clamp(1.0 - (d2 - d)*6.0, 0.35, 1.2);
  float dist = length(vW.xz - cameraPosition.xz); float fade = 1.0 - smoothstep(9000., 22000., dist);
  vec3 col = mix(uAmb, uSunCol, shade*0.75) * (1.0 - uDark*0.55);
  gl_FragColor = vec4(col, c*fade*0.95); }`;

export class Atmosphere {
  constructor(renderer, scene, world, q) {
    this.r = renderer; this.scene = scene; this.world = world; this.q = q; this.time = 13; this.weather = 'clear'; this.wet = 0; this.cover = 0.25; this.targetCover = 0.25; this.fogD = 0.00025;
    const sky = new Sky(); sky.scale.setScalar(45000); scene.add(sky); this.sky = sky;
    const u = sky.material.uniforms; u.turbidity.value = 4; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    this.sun = new THREE.DirectionalLight(0xffffff, 3); this.sun.castShadow = q.shadow > 0;
    if (q.shadow) { const s = this.sun.shadow; s.mapSize.set(q.shadow, q.shadow); const e = q.shadow >= 4096 ? 90 : 65; Object.assign(s.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 800 }); s.bias = -0.0004; s.normalBias = 0.04; s.camera.updateProjectionMatrix(); }
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 0.6); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xc8d6e6, this.fogD);
    // clouds
    this.cloudMat = new THREE.ShaderMaterial({ vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: timeUniform, uCover: { value: 0.3 }, uDark: { value: 0 }, uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() } } });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(50000, 50000).rotateX(-Math.PI / 2), this.cloudMat); this.clouds.position.y = 1400; this.clouds.renderOrder = -1; scene.add(this.clouds);
    // stars
    const sp = []; for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3().randomDirection(); if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05; v.normalize().multiplyScalar(30000); sp.push(v.x, v.y, v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); scene.add(this.stars);
    // env
    this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4a4a40 })); this.envGround.position.y = -5; this.envScene.add(this.envGround);
    this.envRT = null; this.lastEnvSun = new THREE.Vector3(9, 9, 9); this.envTimer = 0;
    // water
    if (world.waterY > -1e8) this.makeWater();
    // rain
    this.rainN = Math.floor(9000 * Math.max(0.4, q.trees)); const rp = new Float32Array(this.rainN * 6); this.rainSeed = new Float32Array(this.rainN * 3);
    for (let i = 0; i < this.rainN; i++) { this.rainSeed[i * 3] = Math.random() * 80 - 40; this.rainSeed[i * 3 + 1] = Math.random() * 40; this.rainSeed[i * 3 + 2] = Math.random() * 80 - 40; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.35, fog: false })); this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    this.moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.0); scene.add(this.moonLight);
    this.sunDir = new THREE.Vector3(); this.setTime(13);
  }
  makeWater() {
    const wn = tex('waternormals.jpg'); const city = this.world.biome === 'city';
    const size = city ? 30000 : 1400; const geo = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
    if (this.q.water) {
      this.water = new Water(geo, { textureWidth: 512, textureHeight: 512, waterNormals: wn, sunDirection: new THREE.Vector3(0.5, 0.5, 0), sunColor: 0xffffff, waterColor: city ? 0x0a3a4f : 0x163b33, distortionScale: city ? 3.2 : 1.6, fog: true });
      this.water.material.uniforms.size.value = city ? 2.5 : 4;
    } else {
      wn.repeat.set(size / 40, size / 40);
      this.water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: city ? 0x0e3b52 : 0x1b4038, roughness: 0.12, metalness: 0.0, normalMap: wn, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 0.55 }));
    }
    const p = city ? new THREE.Vector3(this.world.coastX + size / 2 - 120, 0, 0) : new THREE.Vector3(this.world.lake.x, this.world.waterY, this.world.lake.z);
    this.water.position.copy(p); this.water.receiveShadow = true; this.scene.add(this.water);
  }
  setTime(h) { this.time = ((h % 24) + 24) % 24; this.applySun(); }
  setWeather(w) {
    this.weather = w; this.targetCover = { clear: 0.18, cloudy: 0.62, rain: 0.92, fog: 0.5 }[w];
    this.rain.visible = w === 'rain' && this.q.trees > 0.3; this.fogTarget = { clear: 0.00022, cloudy: 0.0004, rain: 0.0016, fog: 0.004 }[w];
    windUniform.value = w === 'rain' ? 1.1 : w === 'cloudy' ? 0.6 : 0.3;
  }
  applySun() {
    const t = this.time; const ang = (t - 6) / 12 * Math.PI; const elev = Math.sin(ang) * 62 * Math.PI / 180; const az = Math.PI * 0.25 + (t - 12) / 12 * Math.PI * 0.9;
    this.sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
    const day = smooth(-0.08, 0.12, this.sunDir.y); this.day = day; const night = 1 - day; nightUniform.value = smooth(0.1, -0.04, this.sunDir.y);
    const sd = this.sunDir.clone(); if (sd.y < -0.05) sd.y = -0.05;
    this.sky.material.uniforms.sunPosition.value.copy(sd); this.envSky.material.uniforms.sunPosition.value.copy(sd);
    for (const s of [this.sky, this.envSky]) { const u = s.material.uniforms; u.turbidity.value = lerp(3.5, 12, this.cover); u.rayleigh.value = lerp(1.4, 3.2, smooth(0.3, 0.0, sd.y)) * (1 - this.cover * 0.5) + 0.2; }
    const warm = smooth(0.35, 0.02, this.sunDir.y); const cov = this.cover;
    const sunCol = new THREE.Color().setRGB(1, lerp(0.96, 0.58, warm), lerp(0.9, 0.34, warm));
    this.sun.color.copy(sunCol); this.sun.intensity = 3.4 * day * (1 - cov * 0.75);
    this.hemi.intensity = lerp(0.05, 0.75, day) * (1 + cov * 0.4); this.hemi.color.setRGB(lerp(0.2, 0.72, day), lerp(0.25, 0.82, day), lerp(0.45, 1.0, day));
    this.moonLight.intensity = night * 0.35; this.moonLight.position.set(-300, 500, 200);
    this.stars.material.opacity = night * (1 - cov) * 0.9;
    const fogCol = new THREE.Color().setRGB(lerp(0.03, 0.72, day), lerp(0.04, 0.8, day), lerp(0.08, 0.88, day)).lerp(new THREE.Color(0.95, 0.62, 0.42), warm * 0.45 * day);
    if (this.weather === 'rain' || this.weather === 'fog') fogCol.lerp(new THREE.Color(lerp(0.05, 0.55, day), lerp(0.06, 0.58, day), lerp(0.08, 0.62, day)), 0.7);
    this.scene.fog.color.copy(fogCol); this.fogCol = fogCol;
    const cu = this.cloudMat.uniforms; cu.uSun.value.copy(this.sunDir); cu.uSunCol.value.copy(sunCol).multiplyScalar(lerp(0.08, 1.25, day)); cu.uAmb.value.copy(fogCol).multiplyScalar(0.85); cu.uDark.value = smooth(0.5, 1, cov);
    this.envGround.material.color.setRGB(0.18 * (day + 0.05), 0.17 * (day + 0.05), 0.14 * (day + 0.05));
    if (this.water && this.water.material.uniforms && this.water.material.uniforms.sunDirection) { this.water.material.uniforms.sunDirection.value.copy(sd); this.water.material.uniforms.sunColor.value.copy(sunCol).multiplyScalar(day); }
    this.r.toneMappingExposure = lerp(1.5, 0.78, day) * (1 + cov * 0.25);
  }
  updateEnv(force) {
    if (!force && this.sunDir.distanceTo(this.lastEnvSun) < 0.02) return; this.lastEnvSun.copy(this.sunDir);
    if (this.envRT) this.envRT.dispose(); this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000, { size: this.q.envRes }); this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = lerp(0.08, 1.0, this.day) * (1 - this.cover * 0.35);
  }
  update(dt, camPos, focus, dynamicTime) {
    if (dynamicTime) this.time = (this.time + dt / 45) % 24; // 1 game hour per 45 s
    this.cover = lerp(this.cover, this.targetCover, Math.min(1, dt * 0.2)); this.cloudMat.uniforms.uCover.value = this.cover;
    const fd = this.fogTarget || 0.00022; this.scene.fog.density = lerp(this.scene.fog.density, fd * (this.world.biome === 'city' ? 1.0 : 1.0), Math.min(1, dt * 0.5));
    this.wet = clamp(this.wet + (this.weather === 'rain' ? dt * 0.05 : -dt * 0.02), 0, 1); wetUniform.value = this.wet;
    this.applySun();
    this.envTimer -= dt; if (this.envTimer <= 0) { this.envTimer = 1.5; this.updateEnv(); }
    // shadow follows focus
    this.sun.position.copy(focus).addScaledVector(this.sunDir.y > 0.02 ? this.sunDir : new THREE.Vector3(0, 1, 0), 300); this.sun.target.position.copy(focus);
    if (this.sun.castShadow) { const e = this.sun.shadow.camera.right * 2 / this.sun.shadow.mapSize.x; const m = this.sun.shadow.camera.matrixWorldInverse; }
    this.clouds.position.x = camPos.x; this.clouds.position.z = camPos.z; this.stars.position.copy(camPos);
    if (this.water && this.water.material.uniforms && this.water.material.uniforms.time) this.water.material.uniforms.time.value += dt * 0.6;
    else if (this.water) { const n = this.water.material.normalMap; n.offset.x += dt * 0.004; n.offset.y += dt * 0.002; }
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position.array; const s = this.rainSeed; const t = timeUniform.value;
      for (let i = 0; i < this.rainN; i++) { const y = 40 - ((s[i * 3 + 1] + t * 28) % 40); const x = camPos.x + s[i * 3], z = camPos.z + s[i * 3 + 2]; const o = i * 6; p[o] = x; p[o + 1] = camPos.y - 12 + y; p[o + 2] = z; p[o + 3] = x + 0.05; p[o + 4] = camPos.y - 12 + y - 0.9; p[o + 5] = z + 0.03; }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  }
}
