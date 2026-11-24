// Terrain + roads (analytic road markings, puddles, wet asphalt), sidewalks/curbs, water
import * as THREE from 'three';
import { G } from '../core/util.js';
import { tex } from '../core/assets.js';
import { CELL, RW, CURB, vEdge, hEdge, nodeDeg, terrainH, WATER_Y } from './citygen.js';
import { GeoBuilder } from './geo.js';

export const wetU = { value: 0 }; // shared wetness uniform (0 dry..1 soaked)
export const timeU = { value: 0 };

function roadTexture() {
  const N = 22, data = new Uint8Array(N * N * 4);
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const k = a - 10, m = b - 10, o = (b * N + a) * 4;
    data[o] = vEdge(k, m) * 60; data[o + 1] = hEdge(k, m) * 60; data[o + 2] = nodeDeg(k, m) * 60; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

const GLSL_COMMON = /* glsl */`
  uniform sampler2D tRoad, tAsD, tAsN, tGrD, tGrN, tSaD, tFoD, tRoD;
  uniform float uWet, uTime;
  varying vec3 vW; varying vec3 vWN;
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm2(vec2 p){ return vn(p)*0.5+vn(p*2.1)*0.3+vn(p*4.3)*0.2; }
  vec4 rd(float k, float m){ return texture2D(tRoad, (vec2(k+10., m+10.)+0.5)/22.)*255./60.; }
`;

export function makeTerrain(scene) {
  const S = 3200, seg = 320;
  const g = new THREE.PlaneGeometry(S, S, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(-100, 0, 100);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const rt = roadTexture();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tRoad: { value: rt }, tAsD: { value: tex.asphalt_02_diff }, tAsN: { value: tex.asphalt_02_nor }, tGrD: { value: tex.leafy_grass_diff }, tGrN: { value: tex.leafy_grass_nor },
      tSaD: { value: tex.coast_sand_01_diff }, tFoD: { value: tex.forest_ground_04_diff }, tRoD: { value: tex.rock_face_diff }, uWet: wetU, uTime: timeU,
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL_COMMON + `
      vec3 gAlb; float gRough; vec3 gN; float gRoad;
      void surface(){
        vec2 p=vW.xz;
        float k=floor(p.x/100.+0.5), m=floor(p.y/100.+0.5);
        float mz=floor(p.y/100.), mx=floor(p.x/100.);
        float dv=p.x-k*100., dh=p.y-m*100.;
        float tv=rd(k,mz).r, th=rd(mx,m).g;
        float deg=rd(k,m).b;
        bool onV = tv>0.5 && abs(dv)<${RW.toFixed(1)};
        bool onH = th>0.5 && abs(dh)<${RW.toFixed(1)};
        // airport surfaces
        bool apron = p.y>1035. && p.y<1125. && p.x>-560. && p.x<330.;
        bool runway = p.y>1225. && p.y<1295. && abs(p.x)<760.;
        bool taxi = (abs(p.x+620.)<12. || abs(p.x-260.)<12.) && p.y>1100. && p.y<1240.;
        gRoad = (onV||onH||apron||runway||taxi)?1.:0.;
        vec2 uvA=p/7.; uvA.y=-uvA.y;
        vec3 asph=texture2D(tAsD,uvA).rgb*vec3(0.5,0.5,0.53);
        float big=fbm2(p*0.02);
        asph*=0.85+0.3*big;
        vec3 nA=texture2D(tAsN,uvA).xyz*2.-1.;
        float rough=0.86;
        vec3 mark=vec3(0.); float mk=0.;
        if(onV||onH){
          bool inter = onV&&onH;
          float d = onV? dv: dh;  float s = onV? abs(dh): abs(dv); float along = onV? p.y: p.x;
          float typ = onV? tv: th;
          float ad=abs(d);
          // wheel tracks
          float tr = smoothstep(0.9,0.0,abs(abs(ad-1.75)-0.8))+smoothstep(0.9,0.0,abs(abs(ad-5.25)-0.8));
          asph*=1.-0.12*tr*(inter?0.:1.); rough-=0.08*tr;
          if(!inter){
            float nearNode = s;
            bool cross = deg>2.5 && nearNode>7.6 && nearNode<11.2 && ad<6.6;
            if(cross){ float st=step(0.5,fract((onV?p.x:p.y)/1.2)); mark+=vec3(0.92)*st; mk=max(mk,st); }
            else {
              if(typ<1.5 || typ>2.5){ float y=step(ad,0.28)*step(0.09,ad); mark+=vec3(0.95,0.72,0.12)*y; mk=max(mk,y);}
              else { float y=step(ad,0.6); mark+=vec3(0.5)*y; mk=max(mk,y*0.6); }
              float dash = step(abs(ad-3.5),0.08)*step(fract(along/9.),0.45)*step(13.,nearNode);
              float edge = step(abs(ad-6.55),0.09);
              mark+=vec3(0.9)*(dash+edge); mk=max(mk,max(dash,edge));
              float stop = step(abs(nearNode-12.),0.3)*step(ad,6.6)*step(0.3,ad)*(deg>2.5?1.:0.)*step(0.,d*((onV?dh:dv)));
              mark+=vec3(0.95)*stop; mk=max(mk,stop);
            }
          }
          float wear=0.75+0.25*vn(p*0.9);
          mk*=wear;
        }
        if(runway){
          float ry=p.y-1260.; float ar=abs(ry);
          float cl = step(ar,0.5)*step(fract(p.x/30.),0.5);
          float ed = step(abs(ar-33.),0.6);
          float th1 = step(abs(abs(p.x)-720.),20.)*step(fract(ry/3.6),0.5)*step(ar,28.);
          float m2=max(max(cl,ed),th1); mark+=vec3(0.92)*m2; mk=max(mk,m2);
        }
        if(taxi){ float c=step(abs(abs(p.x+620.)<12.?p.x+620.:p.x-260.),0.25); mark+=vec3(0.95,0.75,0.1)*c; mk=max(mk,c);}
        // natural ground
        vec2 uvG=p/5.;
        vec3 grass=texture2D(tGrD,uvG).rgb*mix(vec3(0.75,0.85,0.6),vec3(1.05,1.,0.85),big);
        vec3 sand=texture2D(tSaD,p/6.).rgb*vec3(1.08,1.02,0.92);
        vec3 forest=texture2D(tFoD,p/5.).rgb;
        vec3 rock=texture2D(tRoD,vec2(vW.x+vW.z,vW.y)/14.).rgb*0.9;
        float sandW = smoothstep(1000.,1018.,p.x) + smoothstep(1400.,1420.,p.y);
        float forW = smoothstep(-990.,-1010.,p.x) + smoothstep(-990.,-1010.,p.y);
        forW*=0.75+0.25*vn(p*0.03);
        vec3 nat = mix(grass, forest, clamp(forW,0.,1.));
        nat = mix(nat, sand, clamp(sandW,0.,1.));
        float slope = 1.-vWN.y;
        float rockW = smoothstep(0.12,0.35,slope) + smoothstep(90.,150.,vW.y);
        nat = mix(nat, rock, clamp(rockW,0.,1.));
        nat = mix(nat, vec3(0.92,0.94,0.97), smoothstep(210.,260.,vW.y+vn(p*0.02)*30.)); // snow caps
        float wetSand = smoothstep(${(WATER_Y + 0.9).toFixed(2)},${WATER_Y.toFixed(2)},vW.y);
        nat *= 1.-0.35*wetSand;
        vec3 alb = mix(nat, asph, gRoad);
        alb = mix(alb, mark, mk*gRoad);
        rough = mix(mix(0.95,0.8,sandW), rough, gRoad);
        vec3 nG=texture2D(tGrN,uvG).xyz*2.-1.;
        vec3 nn = mix(nG, nA, gRoad);
        // puddles
        float pud = smoothstep(0.55,0.68, fbm2(p*0.07+3.1)) * gRoad;
        float wet = uWet;
        float pw = pud*smoothstep(0.15,0.6,wet);
        alb *= 1.-0.45*wet*gRoad - 0.15*pw;
        rough = mix(rough, 0.32, wet*gRoad*0.8);
        rough = mix(rough, 0.03, pw);
        nn = mix(nn, vec3(0.,0.,1.), pw*0.95 + wet*0.3);
        // rain ripples
        if(wet>0.3 && pw>0.1){
          vec2 c=floor(p*1.4); vec2 f=fract(p*1.4)-0.5; float ph=fract(uTime*0.9+h21(c));
          float r=length(f+vec2(h21(c+1.)-0.5,h21(c+2.)-0.5)*0.4);
          float ring=sin((r-ph*0.5)*60.)*smoothstep(0.5*ph+0.05,0.5*ph,r)*(1.-ph);
          nn.xy+=ring*0.25*pw*(f/max(r,0.01));
        }
        gAlb=alb; gRough=clamp(rough,0.02,1.);
        gN=normalize(vWN + vec3(nn.x,0.,-nn.y)*0.9);
      }`)
      .replace('#include <map_fragment>', 'surface(); diffuseColor.rgb*=gAlb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=gRough;')
      .replace('#include <normal_fragment_maps>', 'normal=normalize((viewMatrix*vec4(gN,0.)).xyz);');
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  scene.add(mesh);
  return mesh;
}

// curbs, sidewalks, plazas, grass courts (merged per chunk)
export function makeSlabs(city, chunks) {
  const pave = new THREE.MeshStandardMaterial({ map: tex.concrete_pavement_diff, normalMap: tex.concrete_pavement_nor, roughnessMap: tex.concrete_pavement_arm, roughness: 1, color: 0x8e8a84 });
  const grassM = new THREE.MeshStandardMaterial({ map: tex.leafy_grass_diff, normalMap: tex.leafy_grass_nor, roughness: 0.95, color: 0xb8c8a0 });
  const conc = new THREE.MeshStandardMaterial({ map: tex.concrete_wall_008_diff, normalMap: tex.concrete_wall_008_nor, roughnessMap: tex.concrete_wall_008_arm, roughness: 1, color: 0xa8a49c });
  const curbM = new THREE.MeshStandardMaterial({ map: tex.concrete_wall_008_diff, roughness: 0.85, color: 0xbab6ae });
  for (const m of [pave, grassM, conc]) wetPatch(m, 0.55);
  const mats = { pave, grass: grassM, conc, curb: curbM };
  const gb = new Map();
  const B = (x, z) => { const k = chunks.key(x, z); if (!gb.has(k)) gb.set(k, new GeoBuilder()); return gb.get(k); };
  const top = (b, key, x0, x1, z0, z1, y, ts) => b.quad(key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0 / ts, -z1 / ts], [x1 / ts, -z0 / ts]);
  for (const s of city.slabs) {
    const b = B((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
    const y = CURB;
    if (s.kind === 'grass') {
      const e = 4.2;
      top(b, 'pave', s.x0, s.x1, s.z0, s.z0 + e, y, 3); top(b, 'pave', s.x0, s.x1, s.z1 - e, s.z1, y, 3);
      top(b, 'pave', s.x0, s.x0 + e, s.z0 + e, s.z1 - e, y, 3); top(b, 'pave', s.x1 - e, s.x1, s.z0 + e, s.z1 - e, y, 3);
      top(b, 'grass', s.x0 + e, s.x1 - e, s.z0 + e, s.z1 - e, y, 4);
    } else if (s.kind === 'concrete') {
      const e = 4.2;
      top(b, 'pave', s.x0, s.x1, s.z0, s.z0 + e, y, 3); top(b, 'pave', s.x0, s.x1, s.z1 - e, s.z1, y, 3);
      top(b, 'pave', s.x0, s.x0 + e, s.z0 + e, s.z1 - e, y, 3); top(b, 'pave', s.x1 - e, s.x1, s.z0 + e, s.z1 - e, y, 3);
      top(b, 'conc', s.x0 + e, s.x1 - e, s.z0 + e, s.z1 - e, y, 6);
    } else top(b, 'pave', s.x0, s.x1, s.z0, s.z1, y, 3);
    // curb faces
    const c = 'curb';
    b.quad(c, [s.x0, 0, s.z1], [s.x1, 0, s.z1], [s.x1, y, s.z1], [s.x0, y, s.z1], [s.x0 / 2, 0], [s.x1 / 2, 0.08]);
    b.quad(c, [s.x1, 0, s.z0], [s.x0, 0, s.z0], [s.x0, y, s.z0], [s.x1, y, s.z0], [s.x0 / 2, 0], [s.x1 / 2, 0.08]);
    b.quad(c, [s.x1, 0, s.z1], [s.x1, 0, s.z0], [s.x1, y, s.z0], [s.x1, y, s.z1], [s.z0 / 2, 0], [s.z1 / 2, 0.08]);
    b.quad(c, [s.x0, 0, s.z0], [s.x0, 0, s.z1], [s.x0, y, s.z1], [s.x0, y, s.z0], [s.z0 / 2, 0], [s.z1 / 2, 0.08]);
  }
  for (const a of city.grassAreas) {
    if (a.forest) continue;
    const b = B((a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2);
    if (a.d < 1 && !city.blocks.find((bl) => bl.dist === 'park' && bl.x0 === a.x0 && bl.z0 === a.z0)) top(b, 'grass', a.x0, a.x1, a.z0, a.z1, CURB + 0.012, 4);
  }
  for (const [k, b] of gb) {
    for (const key of b.keys()) {
      const g = b.build(key); if (!g) continue;
      const mesh = new THREE.Mesh(g, mats[key]);
      mesh.receiveShadow = true;
      chunks.add(k, mesh, 'near');
    }
  }
  return mats;
}

// make a standard material react to global wetness (darker + glossier)
export function wetPatch(m, amount = 0.6) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uWet = wetU;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.18,uWet*${amount.toFixed(2)});`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb*=1.-0.35*uWet*${amount.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'wet' + amount + (m.name || '') + (m.map ? m.map.uuid : '');
}

export function makeWater(scene) {
  const g = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x0c3a4a, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.93 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU; sh.uniforms.uWet = wetU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime, uWet; varying vec3 vW;
      vec2 wv(vec2 p, vec2 d, float f, float s){ float ph=dot(p,d)*f+uTime*s; return d*cos(ph)*f; }`)
      .replace('#include <normal_fragment_maps>', `
        vec2 p=vW.xz; vec2 g=vec2(0.);
        g+=wv(p,normalize(vec2(1.,0.3)),0.09,1.3)*0.9; g+=wv(p,normalize(vec2(-0.4,1.)),0.15,1.7)*0.6;
        g+=wv(p,normalize(vec2(0.7,-0.7)),0.31,2.3)*0.35; g+=wv(p,normalize(vec2(-1.,-0.2)),0.62,3.1)*0.22;
        g+=wv(p,normalize(vec2(0.2,1.)),1.3,4.7)*0.12; g+=wv(p,normalize(vec2(1.,-0.5)),2.7,6.1)*0.07;
        g*=1.+uWet*0.8;
        vec3 wn=normalize(vec3(-g.x*0.55,1.,-g.y*0.55));
        normal=normalize((viewMatrix*vec4(wn,0.)).xyz);`)
      .replace('#include <opaque_fragment>', `
        float fr=pow(1.-clamp(dot(normalize(vViewPosition),-normal)*-1.,0.,1.),3.);
        outgoingLight=mix(outgoingLight,outgoingLight*1.2,fr);
        #include <opaque_fragment>`);
  };
  const w = new THREE.Mesh(g, m);
  w.position.y = WATER_Y;
  w.receiveShadow = true;
  w.name = 'water';
  scene.add(w);
  return w;
}
