import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';

// Shared atmosphere uniforms (aerial perspective fog) used by every patched material
export const ATMO = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogCol: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uFogSun: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogDensity: { value: 0.00006 },
  uFogFall: { value: 1 / 2600 },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uInCloud: { value: 0 },
};
export const ATMO_GLSL = `
uniform vec3 uSunDir; uniform vec3 uFogCol; uniform vec3 uFogSun; uniform float uFogDensity; uniform float uFogFall; uniform float uInCloud;
vec3 applyAtmo(vec3 col, vec3 wp){
  vec3 d = wp - cameraPosition; float dist = length(d); vec3 rd = d / max(dist, 1e-3);
  float h0 = max(cameraPosition.y, 0.0), h1 = max(wp.y, 0.0); float dh = h1 - h0;
  float hf = abs(dh) > 1.0 ? (exp(-h0*uFogFall) - exp(-h1*uFogFall)) / (dh*uFogFall) : exp(-h0*uFogFall);
  float f = 1.0 - exp(-uFogDensity * dist * hf);
  f = max(f, uInCloud * (1.0 - exp(-dist*0.004)));
  float s = pow(max(dot(rd, uSunDir), 0.0), 6.0);
  vec3 fc = mix(uFogCol, uFogSun, s);
  return mix(col, fc, clamp(f, 0.0, 1.0));
}`;
// Patch a built-in material to use the atmosphere fog. Chains existing onBeforeCompile.
export function atmo(mat) {
  const prev = mat.onBeforeCompile;
  mat.fog = true;
  mat.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r);
    Object.assign(sh.uniforms, ATMO);
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vAtmoW;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
      { vec4 aw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        aw = instanceMatrix * aw;
        #endif
        vAtmoW = (modelMatrix * aw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec3 vAtmoW;\n' + ATMO_GLSL)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyAtmo(gl_FragColor.rgb, vAtmoW);');
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => 'atmo' + key();
  return mat;
}

// colour tables by sun elevation (deg)
const T = [
  // elev, zenith, horizonSun, horizonAway, sunLight, sunI, ambSky, ambGround, fog, fogSun
  [-30, '#02040c', '#0b1222', '#080c18', '#8aa0d0', 0.22, '#2a3858', '#0a0c12', '#101828', '#18203a'],
  [-8, '#08102a', '#2e2a48', '#141c34', '#8aa0d0', 0.25, '#2c3a5c', '#0a0c12', '#18203a', '#2e2a40'],
  [-3, '#141f3e', '#a8584a', '#2c3050', '#ff9a6a', 0.35, '#3a4468', '#14121a', '#3a3850', '#9a5a50'],
  [0, '#24396a', '#f07a3c', '#5a5878', '#ff8a4a', 1.3, '#6a7aa0', '#2a2420', '#8a7a80', '#f09a60'],
  [4, '#2e4c86', '#f5a362', '#8a90a8', '#ffb070', 2.2, '#8ea0c4', '#4a4034', '#b0a8a8', '#f8b880'],
  [12, '#2f5fa6', '#e8d0b0', '#b8c6d6', '#ffe0b8', 3.0, '#a8bcd8', '#5a5246', '#c4ccd6', '#f0dcc0'],
  [30, '#2a5ea8', '#c8d8e8', '#aec6de', '#fff2e0', 3.4, '#b4c8e4', '#605a50', '#b8cce0', '#e8e6e0'],
  [70, '#2558a6', '#c0d4e8', '#aac4de', '#fff8f0', 3.6, '#bcd0ec', '#665e54', '#b4c8de', '#dfe6ec'],
];
const C = (h) => new THREE.Color(h);
export function skyColors(elev, overcast = 0) {
  let i = 0; while (i < T.length - 2 && elev > T[i + 1][0]) i++;
  const a = T[i], b = T[i + 1]; const t = clamp((elev - a[0]) / (b[0] - a[0]), 0, 1);
  const mix = (k) => C(a[k]).lerp(C(b[k]), t);
  const r = { zenith: mix(1), horSun: mix(2), horAway: mix(3), sun: mix(4), sunI: lerp(a[5], b[5], t), ambSky: mix(6), ambGround: mix(7), fog: mix(8), fogSun: mix(9) };
  if (overcast > 0) {
    const grey = C('#8d949c').multiplyScalar(clamp((elev + 6) / 30, 0.08, 1));
    for (const k of ['zenith', 'horSun', 'horAway', 'fog', 'fogSun']) r[k].lerp(grey, overcast * 0.85);
    r.ambSky.lerp(grey, overcast * 0.6); r.sunI *= 1 - overcast * 0.75;
  }
  return r;
}

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uZenith: { value: new THREE.Color() }, uHorSun: { value: new THREE.Color() }, uHorAway: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3() }, uCirrus: { value: 0.5 }, uOvercast: { value: 0 }, uStars: { value: 0 },
      uDisk: { value: 1 },
    }, ATMO),
    vertexShader: `varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uZenith, uHorSun, uHorAway, uSunCol, uMoonDir; uniform float uCirrus, uOvercast, uStars, uTime, uDisk;
      uniform vec3 uSunDir; uniform vec3 uFogCol; uniform vec3 uFogSun; uniform float uInCloud;
      #include <logdepthbuf_pars_fragment>
      float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5;} return s; }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir); float y = d.y;
        vec2 dxz = normalize(d.xz + 1e-5); vec2 sxz = normalize(uSunDir.xz + 1e-5);
        float sa = pow(dot(dxz, sxz)*0.5+0.5, 2.5);
        vec3 hor = mix(uHorAway, uHorSun, sa);
        float yy = max(y, 0.0);
        vec3 col = mix(hor, uZenith, pow(yy, 0.42));
        // horizon haze band
        col = mix(col, hor*1.05, exp(-yy*18.0)*0.5);
        float mu = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(mu, 10.0)*0.22 + pow(mu, 120.0)*0.5) * (1.0 - uOvercast*0.8);
        float disk = smoothstep(0.99955, 0.9997, mu) * uDisk;
        col += uSunCol * disk * 28.0 * (1.0 - uOvercast) * step(-0.02, uSunDir.y);
        // stars & moon
        if (uStars > 0.01) {
          vec3 p = d * 420.0; vec3 c = floor(p); float h = hash(c);
          float st = step(0.9965, h) * smoothstep(0.5, 0.0, length(fract(p)-0.5)) * (0.6 + 0.4*sin(uTime*3.0 + h*90.0));
          col += vec3(0.85,0.9,1.0) * st * uStars * 2.5 * smoothstep(0.0, 0.15, y) * (1.0 - uOvercast);
          // milky way glow
          col += vec3(0.05,0.06,0.09) * uStars * fbm(d.xz/(abs(d.y)+0.3)*3.0) * smoothstep(0.0,0.5,y) * (1.0 - uOvercast);
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.9,0.92,1.0) * (smoothstep(0.99975, 0.9999, md)*6.0 + pow(md, 300.0)*0.25 + pow(md, 12.0)*0.05) * uStars * (1.0 - uOvercast*0.7);
        }
        // cirrus layer
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.06) * 0.9 + vec2(uTime*0.003, 0.0);
          float c = fbm(uv*1.3) ; c = smoothstep(0.55 - uCirrus*0.25, 0.95, c) * uCirrus;
          c *= smoothstep(0.0, 0.12, y);
          vec3 cc = mix(hor*1.1, uSunCol*0.35 + hor*0.9, pow(mu,3.0));
          col = mix(col, cc, c*0.55);
          // overcast deck
          float o = fbm(uv*0.6 + 3.0)*0.6 + 0.4;
          col = mix(col, uFogCol*(0.85 + o*0.3), uOvercast * smoothstep(0.0, 0.08, y));
        } else {
          col = mix(hor, uFogCol, clamp(-y*6.0, 0.0, 1.0));
        }
        col = mix(col, uFogCol*1.1, uInCloud);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); };
  return mesh;
}

// Configure sky, lights, fog and env for given time + weather
export function setupAtmosphere(ctx, time, weather) {
  const { scene, renderer, sky, sun, hemi } = ctx;
  const elev = time.elev, az = time.az * Math.PI / 180;
  const e = elev * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az)).normalize();
  const night = smooth(2, -10, elev);
  const ov = weather.overcast;
  const cols = skyColors(elev, ov);
  const u = sky.material.uniforms;
  u.uZenith.value.copy(cols.zenith); u.uHorSun.value.copy(cols.horSun); u.uHorAway.value.copy(cols.horAway);
  u.uSunCol.value.copy(cols.sun).multiplyScalar(elev > -2 ? 1 : 0);
  const moonDir = new THREE.Vector3(-sunDir.x, Math.abs(sunDir.y) * 0.8 + 0.35, -sunDir.z).normalize();
  u.uMoonDir.value.copy(moonDir);
  u.uStars.value = night; u.uOvercast.value = ov; u.uCirrus.value = weather.clouds * 0.7 + 0.15;
  ATMO.uSunDir.value.copy(elev > -2 ? sunDir : moonDir);
  ATMO.uFogCol.value.copy(cols.fog); ATMO.uFogSun.value.copy(cols.fogSun);
  ATMO.uFogDensity.value = 0.000045 * weather.fog;
  ATMO.uFogFall.value = 1 / (2600 + (1 - ov) * 1200);
  ATMO.uNight.value = night;
  // lights
  const lightDir = elev > -2 ? sunDir : moonDir;
  sun.position.copy(lightDir).multiplyScalar(1000);
  sun.color.copy(elev > -2 ? cols.sun : new THREE.Color('#9fb4e0'));
  sun.intensity = elev > -2 ? cols.sunI : 0.35 * (1 - ov * 0.6);
  hemi.color.copy(cols.ambSky); hemi.groundColor.copy(cols.ambGround);
  hemi.intensity = lerp(1.1, 0.75, night) * (1 + ov * 0.6);
  scene.fog.color.copy(cols.fog);
  // environment map from the sky only
  const envScene = new THREE.Scene();
  const s2 = sky.clone(); s2.material = sky.material; s2.onBeforeRender = () => {}; s2.position.set(0, 0, 0);
  const groundMat = new THREE.MeshBasicMaterial({ color: cols.ambGround.clone().lerp(cols.fog, 0.5).multiplyScalar(0.6), side: THREE.BackSide });
  const ground = new THREE.Mesh(new THREE.SphereGeometry(500, 16, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), groundMat);
  envScene.add(s2); envScene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  u.uDisk.value = 0.15; // dim sun disk in env to avoid fireflies
  const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  const rt = pm.fromScene(envScene, 0, 1, 2000);
  renderer.toneMapping = tm; u.uDisk.value = 1;
  if (ctx.envRT) ctx.envRT.dispose(); ctx.envRT = rt;
  scene.environment = rt.texture; scene.environmentIntensity = lerp(1.0, 0.35, night) * (1 - ov * 0.25);
  pm.dispose(); groundMat.dispose(); ground.geometry.dispose();
  return { sunDir, night, cols, moonDir, elev };
}
