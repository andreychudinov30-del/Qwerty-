'use strict';
/* =====================================================================
   METRO HORROR — Последний поезд (HD edition)
   core: utilities, save, quality, renderer, post-processing, materials
   ===================================================================== */
const $=i=>document.getElementById(i),PI=Math.PI,TAU=PI*2;let RNGF=Math.random;const rand=()=>RNGF();
const clamp=(v,a,b)=>v<a?a:v>b?b:v,lerp=(a,b,t)=>a+(b-a)*t,sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function RNG(s){s=s>>>0;return()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const angDiff=(a,b)=>((b-a+PI*3)%TAU)-PI;
const touch='ontouchstart' in window||navigator.maxTouchPoints>0;
const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);

/* ---------- save ---------- */
let sv={coins:0,own:[0],skin:0,q:touch?1:2,prog:0,done:{},lay:null,sens:1,vol:.8,hint:1,lore:[],uv:0,name:'Выживший',net:null};
try{Object.assign(sv,JSON.parse(localStorage.getItem('mh2')||'{}'))}catch(e){}
if(!Array.isArray(sv.lore))sv.lore=[];if(typeof sv.done!=='object'||!sv.done)sv.done={};
const put=()=>{try{localStorage.setItem('mh2',JSON.stringify(sv))}catch(e){}};
const SK=[{n:'Сталкер',c:0,a:0x6f7a52,h:0},{n:'Диггер',c:100,a:0xc8762a,h:1},{n:'Охранник',c:120,a:0x41558a,h:2},{n:'Спецназ',c:150,a:0x3c3f46,h:3}];
/* pr: pixel ratio cap, sh: shadow map, post: post-fx, ao: SSAO samples, bl: bloom, du: dust, tx: texture size, pl: pooled lights, vol: volumetrics, far: draw distance */
const Q=[{n:'Низкая',pr:1,sh:0,post:0,ao:0,bl:0,du:300,tx:256,pl:3,vol:0,far:30},
{n:'Средняя',pr:1.35,sh:512,post:1,ao:0,bl:1,du:800,tx:512,pl:4,vol:1,far:40},
{n:'Высокая',pr:1.8,sh:1024,post:1,ao:8,bl:1,du:1400,tx:1024,pl:6,vol:1,far:52},
{n:'Ультра',pr:2.5,sh:2048,post:1,ao:14,bl:1,du:2200,tx:1024,pl:8,vol:1,far:64}];
sv.q=clamp(sv.q|0,0,3);

/* ---------- renderer & scene ---------- */
const R=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance',stencil:false});
R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;R.shadowMap.autoUpdate=true;
document.body.prepend(R.domElement);
R.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();msg('Графический контекст потерян. Перезагрузи страницу.')});
const S=new THREE.Scene();S.background=new THREE.Color(0x04060a);S.fog=new THREE.FogExp2(0x0b121a,.03);
const cam=new THREE.PerspectiveCamera(72,1,.08,70);cam.rotation.order='YXZ';S.add(cam);
const MAXANI=Math.min(8,R.capabilities.getMaxAnisotropy());

/* ---------- full-screen passes (custom HDR pipeline) ---------- */
const PP={on:0,ao:0,bl:0,scale:1};
const fsCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),fsScene=new THREE.Scene();
const fsGeo=new THREE.BufferGeometry();fsGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
fsGeo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array([0,0,2,0,0,2]),2));
const fsMesh=new THREE.Mesh(fsGeo,null);fsMesh.frustumCulled=false;fsScene.add(fsMesh);
const VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const sm=(fs,u,ext)=>new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:fs,uniforms:u,depthTest:false,depthWrite:false,extensions:ext||{}});
const MBright=sm(`uniform sampler2D t;uniform vec2 px;uniform float th;varying vec2 vUv;
void main(){vec3 c=texture2D(t,vUv+px*vec2(-1.,-1.)).rgb+texture2D(t,vUv+px*vec2(1.,-1.)).rgb+texture2D(t,vUv+px*vec2(-1.,1.)).rgb+texture2D(t,vUv+px).rgb;c*=.25;
float l=dot(c,vec3(.2126,.7152,.0722));gl_FragColor=vec4(min(c*smoothstep(th,th+.8,l),vec3(40.)),1.);}`,{t:{value:null},px:{value:new THREE.Vector2()},th:{value:.9}});
const MBlur=sm(`uniform sampler2D t;uniform vec2 dir;varying vec2 vUv;
void main(){vec3 c=texture2D(t,vUv).rgb*.227027;c+=(texture2D(t,vUv+dir*1.3846).rgb+texture2D(t,vUv-dir*1.3846).rgb)*.316216;c+=(texture2D(t,vUv+dir*3.2308).rgb+texture2D(t,vUv-dir*3.2308).rgb)*.07027;gl_FragColor=vec4(c,1.);}`,{t:{value:null},dir:{value:new THREE.Vector2()}});
/* depth-only SSAO (normals reconstructed from depth), rotated spiral kernel */
const MAO=sm(`#include <packing>
uniform sampler2D tD;uniform float cn,cf,rad,inten;uniform vec2 pj,res;uniform int ns;varying vec2 vUv;
float vz(vec2 uv){return perspectiveDepthToViewZ(texture2D(tD,uv).x,cn,cf);}
vec3 vp(vec2 uv){float z=vz(uv);return vec3((uv*2.-1.)*(-z)/pj,z);}
void main(){float d=texture2D(tD,vUv).x;if(d>=.9999){gl_FragColor=vec4(1.);return;}
vec3 p=vp(vUv);vec3 n=normalize(cross(dFdx(p),dFdy(p)));
float an=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*6.2831;
float sr=rad*pj.y/(-p.z)*.5;float ao=0.;
for(int i=0;i<16;i++){if(i>=ns)break;float f=(float(i)+.5)/float(ns);float a=an+float(i)*2.3999;
vec2 o=vec2(cos(a),sin(a))*sr*f*f;vec3 q=vp(vUv+o)-p;float l=length(q);
ao+=max(0.,dot(n,q/l)-.08)*(1.-smoothstep(rad*.4,rad*1.2,l));}
ao=clamp(1.-ao/float(ns)*inten,0.,1.);gl_FragColor=vec4(ao,ao,ao,1.);}`,
{tD:{value:null},cn:{value:.08},cf:{value:70},rad:{value:.7},inten:{value:1.9},pj:{value:new THREE.Vector2(1,1)},res:{value:new THREE.Vector2()},ns:{value:8}},{derivatives:true});
const MComp=sm(`uniform sampler2D tC,tB1,tB2,tAO;uniform float uAO,bl,ex,tm,ca,gr,sat,dmg,vg;uniform vec2 res;varying vec2 vUv;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec2 uv=vUv,d=uv-.5;float r2=dot(d,d);vec3 c;
if(ca>.001){vec2 o=d*ca*.025;c=vec3(texture2D(tC,uv+o).r,texture2D(tC,uv).g,texture2D(tC,uv-o).b);}else c=texture2D(tC,uv).rgb;
if(uAO>.5){vec2 p=2./res;float a=texture2D(tAO,uv).r*2.+texture2D(tAO,uv+vec2(p.x,0.)).r+texture2D(tAO,uv-vec2(p.x,0.)).r+texture2D(tAO,uv+vec2(0.,p.y)).r+texture2D(tAO,uv-vec2(0.,p.y)).r;c*=a/6.;}
c+=(texture2D(tB1,uv).rgb*.55+texture2D(tB2,uv).rgb*.9)*bl;
c=aces(c*ex);float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,sat);
c=pow(c,vec3(.4545));c*=1.-vg*smoothstep(.12,.75,r2*1.4);
c=mix(c,vec3(l*.9,l*.1,l*.08)+c*.35,dmg);
float n=fract(sin(dot(uv*res+fract(tm)*97.,vec2(12.9898,78.233)))*43758.5453);c+=(n-.5)*gr;
gl_FragColor=vec4(c,1.);}`,
{tC:{value:null},tB1:{value:null},tB2:{value:null},tAO:{value:null},uAO:{value:0},bl:{value:.8},ex:{value:1.0},tm:{value:0},ca:{value:0},gr:{value:.035},sat:{value:.92},dmg:{value:0},vg:{value:.55},res:{value:new THREE.Vector2()}});
const fs=(m,tgt)=>{fsMesh.material=m;R.setRenderTarget(tgt);R.render(fsScene,fsCam)};
function ppSetup(){const gl2=R.capabilities.isWebGL2,E=R.extensions;
 const hf=gl2?(E.has('EXT_color_buffer_float')||E.has('EXT_color_buffer_half_float')):(E.has('OES_texture_half_float')&&E.has('EXT_color_buffer_half_float'));
 PP.type=hf?THREE.HalfFloatType:THREE.UnsignedByteType;PP.depth=gl2||E.has('WEBGL_depth_texture');PP.deriv=gl2||E.has('OES_standard_derivatives');
 const o={type:PP.type,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false};
 PP.main=new THREE.WebGLRenderTarget(4,4,{type:PP.type,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
 if(PP.depth){PP.main.depthTexture=new THREE.DepthTexture(4,4);PP.main.depthTexture.type=THREE.UnsignedIntType}
 PP.ao=new THREE.WebGLRenderTarget(4,4,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false});
 PP.b=[0,1,2,3].map(()=>new THREE.WebGLRenderTarget(4,4,o));}
function ppSize(){const pr=R.getPixelRatio(),w=Math.max(4,innerWidth*pr|0),h=Math.max(4,innerHeight*pr|0);
 PP.main.setSize(w,h);PP.ao.setSize(w>>1,h>>1);PP.b[0].setSize(w>>2,h>>2);PP.b[1].setSize(w>>2,h>>2);PP.b[2].setSize(w>>3,h>>3);PP.b[3].setSize(w>>3,h>>3);
 MComp.uniforms.res.value.set(w,h);MAO.uniforms.res.value.set(w>>1,h>>1)}
function render(){const q=Q[sv.q];
 if(!q.post||!PP.main){R.setRenderTarget(null);R.render(S,cam);return}
 R.setRenderTarget(PP.main);R.render(S,cam);const U=MComp.uniforms;U.tC.value=PP.main.texture;U.tm.value=t;
 const useAO=q.ao&&PP.depth&&PP.deriv;U.uAO.value=useAO?1:0;
 if(useAO){const A=MAO.uniforms;A.tD.value=PP.main.depthTexture;A.cn.value=cam.near;A.cf.value=cam.far;A.pj.value.set(cam.projectionMatrix.elements[0],cam.projectionMatrix.elements[5]);A.ns.value=q.ao;fs(MAO,PP.ao);U.tAO.value=PP.ao.texture}
 if(q.bl){const b=PP.b;MBright.uniforms.t.value=PP.main.texture;MBright.uniforms.px.value.set(1/PP.main.width,1/PP.main.height);fs(MBright,b[0]);
  MBlur.uniforms.t.value=b[0].texture;MBlur.uniforms.dir.value.set(1/b[0].width,0);fs(MBlur,b[1]);MBlur.uniforms.t.value=b[1].texture;MBlur.uniforms.dir.value.set(0,1/b[0].height);fs(MBlur,b[0]);
  MBlur.uniforms.t.value=b[0].texture;MBlur.uniforms.dir.value.set(2/b[2].width,0);fs(MBlur,b[2]);MBlur.uniforms.t.value=b[2].texture;MBlur.uniforms.dir.value.set(0,2/b[2].height);fs(MBlur,b[3]);
  U.tB1.value=b[0].texture;U.tB2.value=b[3].texture;U.bl.value=.75}else{U.tB1.value=U.tB2.value=PP.b[3].texture;U.bl.value=0}
 fs(MComp,null)}

/* ---------- canvas helpers & procedural textures ---------- */
const cvs=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h||w;return c};
const ctex=(c,srgb,rep)=>{const t=new THREE.CanvasTexture(c);if(srgb)t.encoding=THREE.sRGBEncoding;if(rep)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=MAXANI;return t};
const gt=(()=>{const c=cvs(64),g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,255,255,.4)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
function gs(c,s,o){const p=new THREE.Sprite(new THREE.SpriteMaterial({map:gt,color:c,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:o,fog:true}));p.scale.set(s,s,1);return p}
/* height-field -> tangent-space normal map */
function h2n(src,str){const w=src.width,h=src.height,d=src.getContext('2d').getImageData(0,0,w,h).data,o=cvs(w,h),og=o.getContext('2d'),im=og.createImageData(w,h),D=im.data,L=i=>d[i*4];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=L(y*w+(x-1+w)%w),r=L(y*w+(x+1)%w),u=L(((y-1+h)%h)*w+x),dn=L(((y+1)%h)*w+x);let nx=(l-r)*str/255,ny=(dn-u)*str/255,nz=1;const k=1/Math.hypot(nx,ny,nz),i=(y*w+x)*4;D[i]=(nx*k*.5+.5)*255;D[i+1]=(ny*k*.5+.5)*255;D[i+2]=(nz*k*.5+.5)*255;D[i+3]=255}
 og.putImageData(im,0,0);return o}
/* wrapped value noise for organic textures */
function noiseCanvas(s,oct,seed,fn){const r=RNG(seed),c=cvs(s),g=c.getContext('2d'),im=g.createImageData(s,s),D=im.data,G=[];
 for(let o=0;o<oct;o++){const n=4<<o,a=new Float32Array(n*n);for(let i=0;i<n*n;i++)a[i]=r();G.push([n,a])}
 for(let y=0;y<s;y++)for(let x=0;x<s;x++){let v=0,am=.5,tot=0;for(const[n,a]of G){const fx=x/s*n,fy=y/s*n,ix=fx|0,iy=fy|0,tx=fx-ix,ty=fy-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),
  A=a[iy%n*n+ix%n],B=a[iy%n*n+(ix+1)%n],C2=a[(iy+1)%n*n+ix%n],D2=a[(iy+1)%n*n+(ix+1)%n];v+=am*lerp(lerp(A,B,sx),lerp(C2,D2,sx),sy);tot+=am;am*=.5}
  v/=tot;const p=fn?fn(v,x,y):[v*255,v*255,v*255],i=(y*s+x)*4;D[i]=p[0];D[i+1]=p[1];D[i+2]=p[2];D[i+3]=255}
 g.putImageData(im,0,0);return c}

/* ---------- embedded assets (Poly Haven CC0, three.js example model) ---------- */
const IMG={},GLB={};
const b64ab=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer};
function loadImg(src){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src})}

/* ---------- world PBR materials: photo-scanned detail, tinted to the original palette ---------- */
const MD={
 conc:{s:'concrete_wall_008',tint:[112,116,115],rep:3.2,rust:'rgba(60,45,35,.5)',drip:26},
 tile:{s:'dirty_tiles',tint:[132,134,124],rep:1.6,rust:'rgba(70,52,38,.35)',drip:14},
 floor:{s:'granite_tile',tint:[88,91,92],rep:2.4,wet:1},
 tun:{s:'concrete_panels',tint:[90,92,88],rep:3.2,rust:'rgba(80,55,30,.5)',drip:30},
 grav:{s:'gravel_floor',tint:[78,74,69],rep:2},
 train:{s:'rusty_painted_metal',tint:[65,98,122],rep:2.4,rust:'rgba(120,55,20,.6)',drip:24,mix:.35},
 metal:{s:'rusty_metal_02',tint:[89,96,106],rep:1.6,mix:.5},
 wood:{s:'old_planks_02',tint:[78,62,47],rep:2,mix:.2},
 door:{s:'metal_plate',tint:[44,48,54],rep:1.4,rust:'rgba(90,50,25,.4)',drip:8},
 lab:{s:'long_white_tiles',tint:[150,155,146],rep:1.8,rust:'rgba(60,70,40,.35)',drip:18},
 tech:{s:'peeling_painted_wall',tint:[92,102,96],rep:3,rust:'rgba(70,50,30,.4)',drip:18},
 dmg:{s:'damaged_concrete_floor',tint:[85,87,90],rep:3,wet:1}};
const M={};
for(const k in MD){const d=MD[k];M[k]=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,metalness:k==='train'?.55:k==='metal'||k==='door'?.8:.0})}
M.floor.roughness=.7;M.dmg.roughness=.85;M.tile.roughness=.78;M.lab.roughness=.72;
const grimeT=(()=>{const c=cvs(256,64),g=c.getContext('2d'),r=RNG(9);for(let x=0;x<256;x++){const h=18+r()*30+Math.sin(x*.05)*10,q=g.createLinearGradient(0,64-h,0,64);q.addColorStop(0,'rgba(8,7,6,0)');q.addColorStop(1,'rgba(8,7,6,'+(.55+r()*.3)+')');g.fillStyle=q;g.fillRect(x,64-h,1,h)}return ctex(c,1,1)})();
M.grime=new THREE.MeshBasicMaterial({map:grimeT,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
M.ceil=M.conc.clone();M.ceil.color.setRGB(.5,.5,.5);
M.rail=new THREE.MeshStandardMaterial({color:0x6b6e72,roughness:.32,metalness:.95});
M.dark=new THREE.MeshStandardMaterial({color:0x1d2024,roughness:.7,metalness:.4});
M.cable=new THREE.MeshStandardMaterial({color:0x121314,roughness:.55});
M.lamp=new THREE.MeshStandardMaterial({color:0x111111,emissive:0xcfe6ff,emissiveIntensity:2.2});
M.lampW=new THREE.MeshStandardMaterial({color:0x111111,emissive:0xffb878,emissiveIntensity:2.4});
M.yel=new THREE.MeshStandardMaterial({color:0xc9a227,emissive:0x2a2000,roughness:.6});
M.glass=new THREE.MeshStandardMaterial({color:0x0a1218,roughness:.05,metalness:.2,transparent:true,opacity:.35,depthWrite:false});
M.puddle=new THREE.MeshStandardMaterial({color:0x10161b,roughness:.06,metalness:.4,transparent:true,opacity:.55,polygonOffset:true,polygonOffsetFactor:-2});
M.green=new THREE.MeshBasicMaterial({color:0x39ff88});
M.blood=null;
function buildWorldTex(sz){
 for(const k in MD){const d=MD[k],im=IMG[d.s];if(!im||!im.d)continue;const m=M[k];
  // albedo: photo luminance detail x original tint (keeps palette), plus original-style rust drips
  const c=cvs(sz),g=c.getContext('2d');g.drawImage(im.d,0,0,sz,sz);const id=g.getImageData(0,0,sz,sz),D=id.data;let mean=0;for(let i=0;i<D.length;i+=4)mean+=D[i];mean/=D.length/4;
  const tr=d.tint,mx=d.mix||0;for(let i=0;i<D.length;i+=4){const l=D[i]/mean,v=Math.pow(l,1.15);D[i]=clamp(tr[0]*v*(1-mx)+D[i]*mx*tr[0]/120,0,255);D[i+1]=clamp(tr[1]*v*(1-mx)+D[i]*mx*tr[1]/120,0,255);D[i+2]=clamp(tr[2]*v*(1-mx)+D[i]*mx*tr[2]/120,0,255)}
  g.putImageData(id,0,0);
  if(d.rust){const r=RNG(k.length*977);for(let i=0;i<d.drip;i++){const x=r()*sz,y=r()*sz*.6,hh=sz*(.25+r()*.5),q=g.createLinearGradient(0,y,0,y+hh);q.addColorStop(0,d.rust);q.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=q;const w=1+r()*sz/40;g.fillRect(x,y,w,hh);if(x+w>sz)g.fillRect(x-sz,y,w,hh)}}
  if(d.wet){const r=RNG(5);g.globalCompositeOperation='multiply';for(let i=0;i<6;i++){const x=r()*sz,y=r()*sz,rr=sz*(.08+r()*.15),q=g.createRadialGradient(x,y,0,x,y,rr);q.addColorStop(0,'rgba(175,175,180,1)');q.addColorStop(1,'rgba(255,255,255,1)');g.fillStyle=q;g.fillRect(x-rr,y-rr,rr*2,rr*2)}g.globalCompositeOperation='source-over'}
  const set=(key,cv,srgb)=>{if(m[key])m[key].dispose();m[key]=ctex(cv,srgb,1)};
  set('map',c,1);
  if(im.n){const n=cvs(sz);n.getContext('2d').drawImage(im.n,0,0,sz,sz);set('normalMap',n);m.normalScale.set(1.1,1.1)}
  if(im.a){const a=cvs(sz);a.getContext('2d').drawImage(im.a,0,0,sz,sz);set('roughnessMap',a);m.metalnessMap=m.metalness>0?m.roughnessMap:null;m.aoMap=m.roughnessMap;m.aoMapIntensity=.9}
  m.needsUpdate=true}
 M.ceil.map=M.dmg.map;M.ceil.normalMap=M.dmg.normalMap;M.ceil.roughnessMap=M.dmg.roughnessMap;M.ceil.aoMap=M.dmg.aoMap;M.ceil.needsUpdate=true}

/* environment reflections: tiny emissive "metro" environment pre-filtered with PMREM */
function buildEnv(){const es=new THREE.Scene(),bx=new THREE.Mesh(new THREE.BoxGeometry(20,8,20),new THREE.MeshBasicMaterial({color:0x07090c,side:THREE.BackSide}));es.add(bx);
 const st=(x,y,z,w,h,d,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:c}));m.position.set(x,y,z);es.add(m)};
 for(let i=-2;i<=2;i++){st(i*4,3.8,0,1.6,.1,.4,0x9fbfd8);st(i*4,3.8,5,1.6,.1,.4,0x6a7f90)}st(-9.9,1,0,.1,1,3,0x5a3a20);st(9.9,1.5,4,.1,.6,1.2,0x1a6a3a);
 const pm=new THREE.PMREMGenerator(R),rt=pm.fromScene(es,.04);pm.dispose();return rt.texture}

/* ---------- light pool: only the nearest lamps get real lights ---------- */
const LP={lights:[],lamps:[]};
function lightPool(n){LP.lights.forEach(l=>S.remove(l));LP.lights=[];for(let i=0;i<n;i++){const l=new THREE.PointLight(0xffffff,0,13,2);l.position.set(0,-50,0);S.add(l);LP.lights.push(l)}}
