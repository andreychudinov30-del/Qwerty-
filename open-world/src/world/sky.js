// Atmosphere: physical sky, sun/moon, day-night cycle, PMREM reflections, volumetric-looking clouds, rain, fog, lightning
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { G, clamp, lerp, smooth, rand, pick, bus } from '../core/util.js';
import { quality } from '../core/save.js';
import { wetU, timeU } from './ground.js';
import { nightU } from './buildings.js';

export const WEATHERS = {
  clear: { name: 'Ясно', clouds: 0.18, rain: 0, fog: 0.00022, wind: 0.3 },
  cloudy: { name: 'Облачно', clouds: 0.62, rain: 0, fog: 0.00035, wind: 0.6 },
  rain: { name: 'Дождь', clouds: 0.85, rain: 0.7, fog: 0.0007, wind: 0.8 },
  storm: { name: 'Гроза', clouds: 0.97, rain: 1, fog: 0.0009, wind: 1.3 },
  fog: { name: 'Туман', clouds: 0.5, rain: 0, fog: 0.0028, wind: 0.1 },
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.sky = new Sky(); this.sky.scale.setScalar(5000); this.sky.material.depthWrite = false; this.sky.renderOrder = -10;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.12;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4238, 0.8);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb8c8d8, 0.0003);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(900, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a3a3c }));
    gnd.position.y = -40; this.envScene.add(gnd); this.envGround = gnd;
    this.envRT = null; this._envT = -99; this._envKey = '';
    this.w = { ...WEATHERS.clear }; this.target = WEATHERS.clear; this.wName = 'clear'; this.nextChange = 300;
    this.lightning = 0; this.flash = 0; this.wet = 0;
    this.night = 0;
    this._stars(); this._clouds(); this._rain();
    this.applyQuality();
  }
  applyQuality() {
    const q = quality();
    this.sun.castShadow = q.shadows > 0;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadows, q.shadows);
      const s = q.shadows >= 4096 ? 140 : q.shadows >= 2048 ? 110 : 80;
      const c = this.sun.shadow.camera; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 900; c.updateProjectionMatrix();
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.shadowExtent = s;
    }
    this.clouds.visible = q.clouds;
  }
  _stars() {
    const n = 3000, p = new Float32Array(n * 3), c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      p[i * 3] = r * Math.cos(a) * 2300; p[i * 3 + 1] = Math.abs(u) * 2300; p[i * 3 + 2] = r * Math.sin(a) * 2300; c[i] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aB', new THREE.BufferAttribute(c, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: timeU }, transparent: true, depthWrite: false, fog: false,
      vertexShader: 'attribute float aB; varying float vB; uniform float uT; void main(){ vB=aB*(0.7+0.3*sin(uT*3.+aB*50.)); vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=1.+aB*2.2; }',
      fragmentShader: 'varying float vB; uniform float uA; void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(vec3(0.9,0.95,1.)*vB*2.,uA*smoothstep(0.5,0.,d)); }',
    });
    this.stars = new THREE.Points(g, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -9; this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.0), fog: false }));
    this.scene.add(this.moon);
  }
  _clouds() {
    const g = new THREE.PlaneGeometry(10000, 10000, 1, 1); g.rotateX(Math.PI / 2);
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uT: timeU, uCov: { value: 0.3 }, uSun: { value: new THREE.Vector3() }, uSunC: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uWind: { value: new THREE.Vector2(1, 0.3) } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uT,uCov; uniform vec3 uSun,uSunC,uAmb; uniform vec2 uWind; varying vec3 vW;
        float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
        float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        float fb(vec2 p){ float s=0.,a=0.5; for(int i=0;i<6;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5;} return s; }
        void main(){
          vec2 p=vW.xz*0.00028+uWind*uT*0.004;
          float d=fb(p); float d2=fb(p+uSun.xz*0.02);
          float c=smoothstep(1.-uCov,1.-uCov+0.32,d);
          float shadow=clamp((d2-d)*4.+0.6,0.,1.);
          vec3 col=mix(uAmb*0.9, uSunC*1.15+uAmb*0.4, shadow);
          col=mix(col, col*0.55, smoothstep(0.75,1.,uCov));
          float fade=smoothstep(5000.,1500.,length(vW.xz-cameraPosition.xz));
          gl_FragColor=vec4(col, c*fade*0.95);
        }`,
    });
    this.clouds = new THREE.Mesh(g, this.cloudMat); this.clouds.position.y = 900; this.clouds.frustumCulled = false; this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  }
  _rain() {
    const n = 9000, p = new Float32Array(n * 6), o = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 60, y = Math.random() * 40, z = Math.random() * 60;
      for (let k = 0; k < 2; k++) { o[i * 6 + k * 3] = x; o[i * 6 + k * 3 + 1] = y; o[i * 6 + k * 3 + 2] = z; p[i * 6 + k * 3 + 1] = k; }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aO', new THREE.BufferAttribute(o, 3));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uT: timeU, uC: { value: new THREE.Vector3() }, uA: { value: 0 }, uWind: { value: new THREE.Vector2(2, 1) }, uCol: { value: new THREE.Color(0.7, 0.75, 0.8) } },
      vertexShader: `attribute vec3 aO; uniform float uT; uniform vec3 uC; uniform vec2 uWind; varying float vK;
        void main(){ vec3 b=vec3(60.,40.,60.); vec3 q=aO+vec3(uWind.x*uT, -22.*uT, uWind.y*uT);
          q=mod(q-uC+b*0.5, b)-b*0.5+uC; q.y=mod(aO.y-22.*uT, 40.)+uC.y-15.;
          q+=vec3(uWind.x,-22.,uWind.y)*0.045*position.y; vK=position.y;
          gl_Position=projectionMatrix*viewMatrix*vec4(q,1.); }`,
      fragmentShader: 'uniform float uA; uniform vec3 uCol; varying float vK; void main(){ gl_FragColor=vec4(uCol, uA*(0.25+0.3*vK)); }',
    });
    this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false;
    this.scene.add(this.rain);
  }
  setWeather(name, instant = false) {
    this.wName = name; this.target = WEATHERS[name];
    if (instant) Object.assign(this.w, this.target);
    bus.emit('weather', name);
  }
  update(dt, cam, focus) {
    // weather transitions
    const gm = dt * 24 / G.dayLen * 60; // game minutes elapsed
    this.nextChange -= gm;
    if (this.nextChange < 0 && !G.lockWeather) {
      this.nextChange = 180 + Math.random() * 360;
      const r = Math.random();
      this.setWeather(r < 0.45 ? 'clear' : r < 0.68 ? 'cloudy' : r < 0.84 ? 'rain' : r < 0.93 ? 'storm' : 'fog');
    }
    const k = 1 - Math.exp(-dt * 0.08);
    for (const key of ['clouds', 'rain', 'fog', 'wind']) this.w[key] = lerp(this.w[key], this.target[key], k);
    this.wet = clamp(this.wet + (this.w.rain > 0.2 ? dt * 0.02 * this.w.rain : -dt * 0.004), 0, 1);
    wetU.value = this.wet;
    timeU.value += dt;

    // sun / moon
    const h = G.hour;
    const elev = Math.sin(((h - 6) / 24) * Math.PI * 2) * 64 * Math.PI / 180;
    const az = (h / 24) * Math.PI * 2 + 0.6;
    this.sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
    const ed = elev * 180 / Math.PI;
    const day = smooth(-3, 10, ed);
    this.night = 1 - smooth(-6, 6, ed);
    nightU.value = this.night;
    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunDir);
    su.turbidity.value = 4 + this.w.clouds * 10; su.rayleigh.value = lerp(1.2, 3.2, smooth(15, -2, ed)) * (1 - this.w.clouds * 0.5);
    this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    for (const n of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) this.envSky.material.uniforms[n].value = su[n].value;

    const moonDir = this.sunDir.clone().negate(); moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.25; moonDir.normalize();
    const lightDir = day > 0.05 ? this.sunDir : moonDir;
    const warm = smooth(2, 25, ed);
    const sunCol = new THREE.Color().setRGB(1, lerp(0.55, 0.96, warm), lerp(0.3, 0.9, warm));
    const cloudDim = 1 - this.w.clouds * 0.72;
    if (day > 0.05) { this.sun.color.copy(sunCol); this.sun.intensity = 2.7 * day * cloudDim; }
    else { this.sun.color.setRGB(0.55, 0.65, 1); this.sun.intensity = 0.6 * (1 - this.w.clouds * 0.5); }
    this.sun.intensity += this.flash * 6;
    const skyCol = new THREE.Color().setRGB(lerp(0.13, 0.6, day), lerp(0.15, 0.72, day), lerp(0.26, 0.95, day)).multiplyScalar(lerp(1, 0.75, this.w.clouds));
    this.hemi.color.copy(skyCol); this.hemi.groundColor.setRGB(lerp(0.03, 0.32, day), lerp(0.03, 0.28, day), lerp(0.04, 0.24, day));
    this.hemi.intensity = lerp(0.75, 0.85, day) + this.flash * 2;
    // fog color follows horizon
    const fogDay = new THREE.Color().setRGB(0.62, 0.72, 0.82).lerp(new THREE.Color(0.95, 0.62, 0.42), (1 - warm) * day * 0.6);
    const fogCol = new THREE.Color(0.018, 0.024, 0.04).lerp(fogDay, day).lerp(new THREE.Color().setRGB(0.5 * day + 0.03, 0.52 * day + 0.035, 0.55 * day + 0.05), this.w.clouds * 0.6);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = this.w.fog * (1 + this.night * 0.4);
    this.renderer.setClearColor(fogCol);
    // skydome darkening at night (Sky shader is too bright under horizon)
    this.sky.visible = true;
    this.starMat.uniforms.uA.value = this.night * (1 - this.w.clouds);
    this.moon.position.copy(cam.position).addScaledVector(moonDir, 2100); this.moon.visible = this.night > 0.2;
    // shadow camera follows the player, texel-snapped
    if (this.sun.castShadow && focus) {
      const ext = this.shadowExtent || 100;
      const texel = (ext * 2) / (quality().shadows || 1024);
      const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
      this.sun.target.position.set(fx, 0, fz);
      this.sun.position.set(fx + lightDir.x * 400, lightDir.y * 400, fz + lightDir.z * 400);
      this.sun.target.updateMatrixWorld();
    }
    // clouds
    this.clouds.position.x = cam.position.x; this.clouds.position.z = cam.position.z;
    const cu = this.cloudMat.uniforms;
    cu.uCov.value = this.w.clouds; cu.uSun.value.copy(this.sunDir);
    cu.uSunC.value.copy(sunCol).multiplyScalar(day * 1.1 + 0.05); cu.uAmb.value.copy(skyCol).multiplyScalar(1.1).addScalar(0.02);
    cu.uWind.value.set(this.w.wind, this.w.wind * 0.4);
    // rain
    this.rain.visible = this.w.rain > 0.03 && !G.interior;
    this.rainMat.uniforms.uA.value = this.w.rain * 0.55;
    this.rainMat.uniforms.uC.value.copy(cam.position);
    this.rainMat.uniforms.uWind.value.set(this.w.wind * 3, this.w.wind * 1.2);
    this.rainMat.uniforms.uCol.value.setRGB(0.5 + day * 0.3, 0.55 + day * 0.3, 0.62 + day * 0.3);
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.wName === 'storm' && this.w.rain > 0.6) {
      this.lightning -= dt;
      if (this.lightning < 0) { this.lightning = 6 + Math.random() * 14; this.flash = 1; bus.emit('thunder', 0.6 + Math.random() * 2.5); }
    }
    // reflections env refresh
    const key = Math.round(h * 4) + '|' + Math.round(this.w.clouds * 10);
    if (key !== this._envKey && G.t - this._envT > 1.5) {
      this._envKey = key; this._envT = G.t;
      this.envGround.material.color.setRGB(0.06 + 0.25 * day, 0.06 + 0.24 * day, 0.07 + 0.22 * day);
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.1, 0.75, day) * lerp(1, 0.7, this.w.clouds);
      if (old) old.dispose();
    }
    return { day, night: this.night, elev: ed };
  }
}
