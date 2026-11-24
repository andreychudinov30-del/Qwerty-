/* =====================================================================
   world: geometry merging, models, level generator & builder
   ===================================================================== */
const CS=3.2,CHK=6;
/* ---------- geometry accumulation & merging ---------- */
function boxGeo(w,h,d){const g=new THREE.BoxGeometry(w,h,d),u=g.attributes.uv,D=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
 for(let i=0;i<24;i++){const q=D[i>>2];u.setXY(i,u.getX(i)*q[0]/2,u.getY(i)*q[1]/2)}return g}
function mergeGeos(list){let n=0;const L=list.map(g=>{const q=g.index?g.toNonIndexed():g;n+=q.attributes.position.count;return q});
 const P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2);let o=0;
 for(const g of L){const p=g.attributes.position,nn=g.attributes.normal,u=g.attributes.uv;P.set(p.array,o*3);N.set(nn.array,o*3);if(u)U.set(u.array,o*2);o+=p.count}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));g.setAttribute('uv',new THREE.BufferAttribute(U,2));g.setAttribute('uv2',g.attributes.uv);g.computeBoundingSphere();return g}
class Acc{constructor(){this.b=new Map}
 add(geo,mat,x,y,z,ry,rx,rz,sx,sy,sz){const o=new THREE.Object3D;o.position.set(x,y,z);o.rotation.set(rx||0,ry||0,rz||0);if(sx)o.scale.set(sx,sy,sz);o.updateMatrix();
  const g=geo.clone();g.applyMatrix4(o.matrix);if(!this.b.has(mat))this.b.set(mat,[]);this.b.get(mat).push(g);return this}
 box(mat,x0,y0,z0,x1,y1,z1){return this.add(boxGeo(x1-x0,y1-y0,z1-z0),mat,(x0+x1)/2,(y0+y1)/2,(z0+z1)/2)}
 build(par,shadow){const grp=new THREE.Group;for(const[m,l]of this.b){const me=new THREE.Mesh(mergeGeos(l),typeof m==='string'?M[m]:m);me.castShadow=shadow!==false;me.receiveShadow=true;grp.add(me);l.forEach(g=>g.dispose())}if(par)par.add(grp);return grp}}

/* ---------- glTF models (embedded) ---------- */
const MOD={};
function deq(g){for(const k in g.attributes){const at=g.attributes[k],arr=at.isInterleavedBufferAttribute?at.data.array:at.array;if(arr instanceof Float32Array&&!at.isInterleavedBufferAttribute)continue;
 const n=at.count,sz=at.itemSize,o=new Float32Array(n*sz),dv=!at.normalized?1:arr instanceof Int16Array?32767:arr instanceof Uint16Array?65535:arr instanceof Int8Array?127:arr instanceof Uint8Array?255:1,G=['getX','getY','getZ','getW'];
 for(let i=0;i<n;i++)for(let c=0;c<sz;c++){let v=at[G[c]](i)/dv;if(dv!==1&&v<-1)v=-1;o[i*sz+c]=v}g.setAttribute(k,new THREE.BufferAttribute(o,sz))}return g}
function prepModel(name,gl){const root=gl.scene;root.updateMatrixWorld(true);const parts=[],bb=new THREE.Box3;
 root.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh){const g=deq(o.geometry.clone());g.applyMatrix4(o.matrixWorld);if(!g.attributes.normal)g.computeVertexNormals();g.computeBoundingBox();bb.union(g.boundingBox);
  const m=o.material;if(m.map)m.map.anisotropy=MAXANI;m.envMapIntensity=.6;parts.push({g,m})}});
 const c=bb.getCenter(new THREE.Vector3());for(const p of parts){p.g.translate(-c.x,-bb.min.y,-c.z);if(!p.g.attributes.uv2&&p.g.attributes.uv)p.g.setAttribute('uv2',p.g.attributes.uv);p.g.computeBoundingSphere()}
 let sz=bb.getSize(new THREE.Vector3());if(sz.y>3.5){const k=2/sz.y;for(const p of parts){p.g.scale(k,k,k);p.g.computeBoundingSphere()}sz.multiplyScalar(k)}MOD[name]={parts,sz,r:Math.hypot(sz.x,sz.z)/2+.1}}
/* single model instance as group (for unique objects) */
function modelMesh(name,s){const md=MOD[name];if(!md)return null;const g=new THREE.Group;for(const p of md.parts){const m=new THREE.Mesh(p.g,p.m);m.castShadow=m.receiveShadow=true;g.add(m)}if(s)g.scale.setScalar(s);return g}

/* ---------- canvas decals & signs ---------- */
function signTex(t,col,bg,w,h,font){const c=cvs(w||512,h||128),g=c.getContext('2d');g.fillStyle=bg||'#10161c';g.fillRect(0,0,c.width,c.height);g.strokeStyle=col;g.lineWidth=6;g.strokeRect(6,6,c.width-12,c.height-12);
 g.fillStyle=col;g.font=font||'bold 62px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t,c.width/2,c.height/2+4);
 g.globalCompositeOperation='multiply';const r=RNG(t.length*31);for(let i=0;i<40;i++){g.fillStyle='rgba('+(120+r()*80|0)+','+(110+r()*70|0)+','+(100+r()*60|0)+','+r()*.5+')';g.beginPath();g.arc(r()*c.width,r()*c.height,2+r()*24,0,TAU);g.fill()}
 return ctex(c,1)}
function decalTex(kind,txt,seed){const c=cvs(512,256),g=c.getContext('2d'),r=RNG(seed);g.clearRect(0,0,512,256);
 if(kind==='graf'){g.font='bold '+(50+r()*30|0)+'px Georgia,serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle=r()<.5?'rgba(120,10,8,.85)':'rgba(210,210,200,.7)';g.save();g.translate(256,128);g.rotate((r()-.5)*.15);g.fillText(txt,0,0);g.restore();
  for(let i=0;i<12;i++){g.fillRect(80+r()*350,150+r()*10,2+r()*3,20+r()*80)}}
 else if(kind==='blood'){for(let i=0;i<5;i++){const x=150+r()*200,y=60+r()*80;g.fillStyle='rgba(90,6,6,'+(.5+r()*.4)+')';for(let f=0;f<5;f++){g.beginPath();g.ellipse(x+f*14-28,y-26+Math.abs(f-2)*8,6,22,0,0,TAU);g.fill()}g.beginPath();g.ellipse(x,y+10,26,30,0,0,TAU);g.fill();g.fillRect(x-4,y+30,6,40+r()*90)}}
 else if(kind==='sym'){g.strokeStyle='rgba(140,12,10,.92)';g.lineWidth=12;g.lineCap='round';g.translate(256,128);const k=seed%5;g.beginPath();
  if(k===0){g.arc(0,0,80,0,TAU);g.moveTo(-60,-60);g.lineTo(60,60)}else if(k===1){g.moveTo(0,-90);g.lineTo(80,70);g.lineTo(-80,70);g.closePath();g.moveTo(0,-20);g.lineTo(0,40)}
  else if(k===2){for(let i=0;i<7;i++){const a=i/7*TAU;g.moveTo(0,0);g.lineTo(Math.cos(a)*95,Math.sin(a)*95)}}else if(k===3){g.arc(0,0,40,0,TAU);g.moveTo(90,0);g.arc(0,0,90,0,TAU)}else{g.moveTo(-90,-80);g.lineTo(90,80);g.moveTo(90,-80);g.lineTo(-90,80);g.moveTo(0,-95);g.lineTo(0,95)}
  g.stroke();for(let i=0;i<8;i++)g.fillRect((r()-.5)*160,40+r()*30,4,30+r()*60)}
 return ctex(c,1)}

/* ---------- level generator ---------- */
const HT={hall:6,depot:7,flood:4.6,lab:3.4,tech:3.4,office:3.2,tun:3.8,annex:3.2};
const WM={hall:'conc',depot:'conc',flood:'tun',lab:'lab',tech:'tech',office:'tech',tun:'tun',annex:'tech'};
const FM={hall:'floor',depot:'dmg',flood:'dmg',lab:'lab',tech:'dmg',office:'wood',tun:'grav',annex:'dmg'};
const RSZ={hall:[[10,14],[4,5]],depot:[[8,11],[5,7]],flood:[[5,8],[3,5]],lab:[[4,6],[3,5]],tech:[[3,4],[3,4]],office:[[3,5],[3,4]]};
const TYPES=['hall','depot','flood','lab','tech','office','tun','annex'];
function genLevel(md){const r=RNG(md.seed),W=md.w,H=md.h,N=W*H,g=new Uint8Array(N),ty=new Uint8Array(N),rid=new Int16Array(N).fill(-1),rooms=[];
 const id=(x,y)=>y*W+x,inb=(x,y)=>x>0&&y>0&&x<W-1&&y<H-1;
 const want=[md.main].concat(md.rooms);
 for(let ri=0;ri<want.length;ri++){const tp=want[ri],sz=RSZ[tp]||RSZ.tech;
  for(let tr=0;tr<160;tr++){let w=sz[0][0]+(r()*(sz[0][1]-sz[0][0]+1)|0),h=sz[1][0]+(r()*(sz[1][1]-sz[1][0]+1)|0);if(r()<.5&&tp!=='hall'&&tp!=='depot'){const q=w;w=h;h=q}
   const x=1+(r()*(W-w-2)|0),y=1+(r()*(H-h-2)|0);if(x+w>W-1||y+h>H-1)continue;let ok=1;
   for(const o of rooms)if(x<o.x+o.w+2&&x+w+2>o.x&&y<o.y+o.h+2&&y+h+2>o.y){ok=0;break}
   if(!ok)continue;const R2={x,y,w,h,t:tp,i:rooms.length,cx:x+w/2,cy:y+h/2};rooms.push(R2);
   for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){g[id(xx,yy)]=1;ty[id(xx,yy)]=TYPES.indexOf(tp);rid[id(xx,yy)]=R2.i}break}}
 /* corridors: MST + loops, L-shaped */
 const carve=(a,b)=>{let x=a.cx|0,y=a.cy|0;const tx=b.cx|0,tyy=b.cy|0,hx=r()<.5;
  const step=(xx,yy)=>{const k=id(xx,yy);if(!g[k]){g[k]=1;ty[k]=6}};
  if(hx){while(x!==tx){x+=Math.sign(tx-x);step(x,y)}while(y!==tyy){y+=Math.sign(tyy-y);step(x,y)}}
  else{while(y!==tyy){y+=Math.sign(tyy-y);step(x,y)}while(x!==tx){x+=Math.sign(tx-x);step(x,y)}}};
 const inT=[0],E=[];const d2=(a,b)=>Math.hypot(a.cx-b.cx,a.cy-b.cy);
 while(inT.length<rooms.length){let best=null,bd=1e9;for(const i of inT)for(let j=0;j<rooms.length;j++){if(inT.includes(j))continue;const d=d2(rooms[i],rooms[j]);if(d<bd){bd=d;best=[i,j]}}inT.push(best[1]);E.push(best)}
 for(let l=0;l<(md.loops||1);l++){const a=r()*rooms.length|0,b=r()*rooms.length|0;if(a!==b)E.push([a,b])}
 for(const[a,b]of E)carve(rooms[a],rooms[b]);
 /* long extra tunnels for tunnel-themed missions */
 const L={W,H,g,ty,rid,rooms,id,seed:md.seed};
 /* annex (locked room) */
 if(md.annex){for(let tr=0;tr<400&&!L.annex;tr++){const k=r()*N|0,fx=k%W,fy=k/W|0;if(!g[k]||ty[k]===6)continue;const dirs=[[1,0],[-1,0],[0,1],[0,-1]],d=dirs[r()*4|0];
  const dx=fx+d[0],dy=fy+d[1];if(!inb(dx,dy)||g[id(dx,dy)])continue;const w=3,h=3;let x0,y0;
  if(d[0]){x0=d[0]>0?dx+1:dx-w;y0=fy-1}else{y0=d[1]>0?dy+1:dy-h;x0=fx-1}
  let ok=1;for(let yy=y0-1;yy<=y0+h&&ok;yy++)for(let xx=x0-1;xx<=x0+w;xx++){if(!inb(xx,yy)&&!(xx>=x0&&xx<x0+w&&yy>=y0&&yy<y0+h)){ok=0;break}if(xx<0||yy<0||xx>=W||yy>=H){ok=0;break}if(g[id(xx,yy)]){ok=0;break}}
  if(!ok||!inb(x0,y0)||!inb(x0+w-1,y0+h-1))continue;
  const lat=d[0]?[[dx,dy-1],[dx,dy+1]]:[[dx-1,dy],[dx+1,dy]];if(lat.some(([a,b])=>g[id(a,b)]))continue;
  const A={x:x0,y:y0,w,h,t:'annex',i:rooms.length,cx:x0+w/2,cy:y0+h/2,annex:1};rooms.push(A);
  for(let yy=y0;yy<y0+h;yy++)for(let xx=x0;xx<x0+w;xx++){g[id(xx,yy)]=1;ty[id(xx,yy)]=7;rid[id(xx,yy)]=A.i}
  g[id(dx,dy)]=1;ty[id(dx,dy)]=7;L.annex={room:A,dx,dy,fx,fy,d}}}
 /* bfs distances from start */
 const st=rooms[0];L.start=[st.x+1,st.y+st.h-1];
 if(st.t==='hall'){L.start=[st.x+1,st.y+st.h-1]}
 L.dist=bfs(L,L.start[0],L.start[1],1);
 return L}
function bfs(L,sx,sy,noAnnex){const{W,H,g}=L,d=new Int32Array(W*H).fill(-1),q=[sx+sy*W];d[q[0]]=0;
 for(let h=0;h<q.length;h++){const k=q[h],x=k%W,y=k/W|0;for(const[a,b]of[[1,0],[-1,0],[0,1],[0,-1]]){const n=(y+b)*W+x+a;if(x+a<0||x+a>=W||y+b<0||y+b>=H||!g[n]||d[n]>=0)continue;if(noAnnex&&L.annex&&L.ty[n]===7)continue;d[n]=d[k]+1;q.push(n)}}return d}

/* ---------- level build ---------- */
let LV=null;const C=[],PH=new Map,I=[];
const wx=i=>(i+.5)*CS;
function addCol(x0,z0,x1,z1,h,fl){const c=[x0,z0,x1,z1,h,fl||0];C.push(c);const a=Math.floor(x0/CS),b=Math.floor(z0/CS),e=Math.floor(x1/CS),f=Math.floor(z1/CS);
 for(let y=b;y<=f;y++)for(let x=a;x<=e;x++){const k=x+','+y;if(!PH.has(k))PH.set(k,[]);PH.get(k).push(c)}return c}
function solid(x,z){if(!LV)return 0;const i=Math.floor(x/CS),j=Math.floor(z/CS);if(i<0||j<0||i>=LV.W||j>=LV.H)return 1;return!LV.g[j*LV.W+i]}
function hitAt(x,z,r,mon){const a=Math.floor((x-r)/CS),b=Math.floor((z-r)/CS),e=Math.floor((x+r)/CS),f=Math.floor((z+r)/CS);
 for(let j=b;j<=f;j++)for(let i=a;i<=e;i++){if(i<0||j<0||i>=LV.W||j>=LV.H||!LV.g[j*LV.W+i])return 1;const l=PH.get(i+','+j);if(l)for(const c of l){if(c[5]===-1)continue;if(mon&&c[5]===1)continue;if(x+r>c[0]&&x-r<c[2]&&z+r>c[1]&&z-r<c[3])return 1}}return 0}
function move(o,dx,dz,r,mon){const nx=o.x+dx;if(!hitAt(nx,o.z,r,mon))o.x=nx;const nz=o.z+dz;if(!hitAt(o.x,nz,r,mon))o.z=nz}
function los(ax,az,bx,bz){const d=Math.hypot(bx-ax,bz-az),n=Math.ceil(d/.4);for(let i=1;i<n;i++){const x=ax+(bx-ax)*i/n,z=az+(bz-az)*i/n;if(solid(x,z))return false;
 const l=PH.get(Math.floor(x/CS)+','+Math.floor(z/CS));if(l)for(const c of l)if(c[5]!==-1&&c[4]>=1.6&&x>c[0]&&x<c[2]&&z>c[1]&&z<c[3])return false}return true}

/* instanced props bucketed per chunk (frustum culling + distance culling) */
const PB=new Map;
function putProp(name,x,y,z,ry,s,col){const md=MOD[name];if(!md)return null;s=s||1;const k=name+'|'+(x/(CS*CHK)|0)+','+(z/(CS*CHK)|0);
 if(!PB.has(k))PB.set(k,{name,list:[]});const o=new THREE.Object3D;o.position.set(x,y,z);o.rotation.y=ry;o.scale.setScalar(s);o.updateMatrix();PB.get(k).list.push(o.matrix.clone());
 if(col){const c=Math.abs(Math.cos(ry))>.7,hx=(c?md.sz.x:md.sz.z)*s/2,hz=(c?md.sz.z:md.sz.x)*s/2;if(md.sz.y*s>.35)addCol(x-hx,z-hz,x+hx,z+hz,md.sz.y*s+y,0)}return md}
function flushProps(par){const groups=[];for(const[k,b]of PB){const md=MOD[b.name],sp=new THREE.Sphere,v=new THREE.Vector3;let cx=0,cz=0;
 b.list.forEach(m=>{v.setFromMatrixPosition(m);cx+=v.x;cz+=v.z});cx/=b.list.length;cz/=b.list.length;let rr=0;b.list.forEach(m=>{v.setFromMatrixPosition(m);rr=Math.max(rr,Math.hypot(v.x-cx,v.z-cz))});
 for(const p of md.parts){const g=p.g.clone();g.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx,md.sz.y/2,cz),rr+md.r+md.sz.y);const im=new THREE.InstancedMesh(g,p.m,b.list.length);
  b.list.forEach((m,i)=>im.setMatrixAt(i,m));im.castShadow=md.sz.y>.3;im.receiveShadow=true;im.userData.c=[cx,cz];par.add(im);groups.push(im)}}PB.clear();return groups}
/* instanced primitives (rails, sleepers, pipes, ribs) */
const IB=new Map;
function putI(key,geo,mat,x,y,z,ry,sx,sy,sz,rx,rz){const k=key+'|'+(x/(CS*CHK)|0)+','+(z/(CS*CHK)|0);if(!IB.has(k))IB.set(k,{geo,mat,list:[]});
 const o=new THREE.Object3D;o.position.set(x,y,z);o.rotation.set(rx||0,ry||0,rz||0);o.scale.set(sx||1,sy||1,sz||1);o.updateMatrix();IB.get(k).list.push(o.matrix.clone())}
function flushI(par,out){for(const[k,b]of IB){const im=new THREE.InstancedMesh(b.geo,b.mat,b.list.length);let cx=0,cz=0;const v=new THREE.Vector3;b.list.forEach((m,i)=>{im.setMatrixAt(i,m);v.setFromMatrixPosition(m);cx+=v.x;cz+=v.z});
 cx/=b.list.length;cz/=b.list.length;im.geometry=b.geo.clone();im.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx,2,cz),CS*CHK*.8+4);im.castShadow=false;im.receiveShadow=true;im.userData.c=[cx,cz];par.add(im);out.push(im)}IB.clear()}

const GEO={rail:boxGeo(.075,.16,1),sleeper:boxGeo(2.4,.12,.26),pipe:new THREE.CylinderGeometry(.09,.09,1,10),cable:new THREE.CylinderGeometry(.025,.025,1,5),
 rib:boxGeo(.3,1,.14),brk:boxGeo(.08,.12,.3),beam:boxGeo(.45,.4,1),col:boxGeo(.9,1,.9),lampP:boxGeo(1.4,.1,.26),plane:new THREE.PlaneGeometry(1,1)};
GEO.pipe.rotateX(PI/2);GEO.cable.rotateX(PI/2);
[GEO.pipe,GEO.cable].forEach(g=>g.setAttribute('uv2',g.attributes.uv));

/* ---------- wagon (81-717 style metro car) ---------- */
M.seat=new THREE.MeshStandardMaterial({color:0x5a2a22,roughness:.55});M.inner=new THREE.MeshStandardMaterial({color:0x8a8a7a,roughness:.7});M.stripe=new THREE.MeshStandardMaterial({color:0x9aa6ac,roughness:.5,metalness:.4});
M.rubber=new THREE.MeshStandardMaterial({color:0x0d0e10,roughness:.9});M.head=new THREE.MeshStandardMaterial({color:0x111111,emissive:0xfff1d0,emissiveIntensity:3});
function wagon(par,x,z,len,openSide,head,seed,dark){const A=new Acc,B=new Acc,L=len,w=2.7,h=3.05,fl=.18,x0=-L/2,x1=L/2,z0=-w/2,z1=w/2,r=RNG(seed);
 const doors=[-L*.36,-L*.12,L*.12,L*.36],dw=1.25;
 for(const side of[-1,1]){const zz=side*(w/2-.04),open=side===openSide;let px=x0;
  const seg=(a,b)=>{A.box('train',a,fl,zz-.04,b,1.05,zz+.04);A.box('train',a,2.05,zz-.04,b,h-.25,zz+.04);A.box(M.stripe,a,1.05,zz-.05,b,1.12,zz+.05);
   const n=Math.max(1,Math.round((b-a)/1.3));for(let i=0;i<=n;i++){const xx=a+(b-a)*i/n;A.box('train',xx-.07,1.12,zz-.04,xx+.07,2.05,zz+.04)}A.box(M.glass,a,1.12,zz-.01,b,2.05,zz+.01)};
  for(const d of doors){seg(px,d-dw/2);if(!open){A.box('train',d-dw/2,fl,zz-.03,d+dw/2,h-.25,zz+.03);A.box(M.glass,d-dw/2+.12,1.2,zz-.035,d-.06,2.0,zz+.035);A.box(M.glass,d+.06,1.2,zz-.035,d+dw/2-.12,2.0,zz+.035)}
   else A.box(M.rubber,d-dw/2-.05,fl,zz-.06,d-dw/2+.03,h-.25,zz+.06).box(M.rubber,d+dw/2-.03,fl,zz-.06,d+dw/2+.05,h-.25,zz+.06);px=d+dw/2}
  seg(px,x1);
  for(let i=0;i<3;i++){const a=doors[i]+dw/2+.15,b=doors[i+1]-dw/2-.15;A.box(M.seat,a,.45,side*(w/2-.55),b,.6,side*(w/2-.1));A.box(M.seat,a,.6,side*(w/2-.2),b,1.15,side*(w/2-.08))}
  A.box(M.seat,x0+.2,.45,side*(w/2-.55),doors[0]-dw/2-.15,.6,side*(w/2-.1));A.box(M.seat,doors[3]+dw/2+.15,.45,side*(w/2-.55),x1-.2,.6,side*(w/2-.1));
  A.add(GEO.pipe,M.rail,0,1.95,side*.55,PI/2,0,0,.4,.4,L-.4)}
 for(const e of[x0,x1]){A.box('train',e-.05,fl,z0,e+.05,h-.25,-.45).box('train',e-.05,fl,.45,e+.05,h-.25,z1).box('train',e-.05,2.1,-.45,e+.05,h-.25,.45);A.box(M.glass,e-.02,1.2,-.4,e+.02,2.0,.4)}
 A.box(M.inner,x0,0,z0+.05,x1,fl,z1-.05);A.box(M.inner,x0,h-.3,z0,x1,h-.25,z1);
 const roof=new THREE.CylinderGeometry(2.1,2.1,L,24,1,true,-.72,1.44);roof.rotateZ(PI/2);roof.rotateX(-PI/2);roof.translate(0,h-.25-2.1*Math.cos(.72),0);A.add(roof,'train',0,0,0,0);
 for(const s of[-1,1])A.box(dark?M.dark:M.lamp,x0+.6,h-.33,s*.5-.08,x1-.6,h-.3,s*.5+.08);
 for(let i=-3;i<=3;i++)A.add(boxGeo(.05,1.85,.05),M.rail,i*L/7.5+.6,fl+.92,(i%2?.5:-.5),0);
 A.box(M.rubber,x0+.2,fl-.03,z0+.1,x1-.2,fl+.012,z1-.1);A.box(M.dark,x0+.3,.02,z0-.02,x1-.3,.55,z0+.08).box(M.dark,x0+.3,.02,z1-.08,x1-.3,.55,z1+.02);
 for(const bx of[x0+2.2,x1-2.2])for(const s of[-1,1])for(const wx2 of[-.7,.7]){const wh=new THREE.CylinderGeometry(.42,.42,.12,18);wh.rotateX(PI/2);A.add(wh,M.rail,bx+wx2,.42,s*.76,0)}
 for(const e of[x0-.25,x1+.25])A.box(M.dark,Math.min(e,e+Math.sign(e)*.3),.6,-.12,Math.max(e,e+Math.sign(e)*.3)+.01,.85,.12);
 if(head){A.box(M.head,x1+.02,.75,-1.05,x1+.08,.95,-.8).box(M.head,x1+.02,.75,.8,x1+.08,.95,1.05);A.box(M.lampW,x1+.02,2.55,-.15,x1+.08,2.7,.15)}
 // simple LOD body
 B.box('train',x0,fl,z0,x1,h-.25,z1);B.box(M.stripe,x0,1.05,z0-.01,x1,1.12,z1+.01);B.add(roof,'train',0,0,0,0);B.box(M.dark,x0+.3,.02,z0,x1-.3,.55,z1);
 const lod=new THREE.LOD,hi=A.build(),lo=B.build();lod.addLevel(hi,0);lod.addLevel(lo,26);lod.position.set(x,0,z);par.add(lod);
 /* colliders: sides (door gaps on open side), ends, seats */
 for(const side of[-1,1]){const zz=z+side*(w/2-.04);if(side===openSide){let px=x+x0;for(const d of doors){addCol(px,zz-.08,x+d-dw/2,zz+.08,3,2);px=x+d+dw/2}addCol(px,zz-.08,x+x1,zz+.08,3,2)}else addCol(x+x0,zz-.08,x+x1,zz+.08,3,2)}
 addCol(x+x0-.1,z+z0,x+x0+.1,z+z1,3,2);addCol(x+x1-.1,z+z0,x+x1+.1,z+z1,3,2);return lod}

/* ---------- monster-safe locker ---------- */
function lockerMesh(){const A=new Acc;A.box('door',-.45,0,-.3,.45,2,.3);A.box(M.dark,-.42,1.55,.3,.42,1.6,.33);for(let i=0;i<5;i++)A.box(M.rubber,-.25,1.62+i*.06,.3,.25,1.64+i*.06,.32);A.box(M.rail,.3,.9,.3,.34,1.2,.36);return A.build()}

/* ---------- full level build ---------- */
const VOLM=new THREE.ShaderMaterial({uniforms:{c:{value:new THREE.Color(0xbfe0ff)},o:{value:.03}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
 vertexShader:'varying float vY;varying vec3 vN,vV;void main(){vY=uv.y;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
 fragmentShader:'uniform vec3 c;uniform float o;varying float vY;varying vec3 vN,vV;void main(){float f=pow(abs(dot(vN,vV)),2.);gl_FragColor=vec4(c*o*f*vY*vY,1.);}'});
let WATER=null;
function waterMat(){if(WATER)return WATER;const n=h2n(noiseCanvas(256,5,77),2.2);WATER=new THREE.MeshStandardMaterial({color:0x0b1612,roughness:.05,metalness:.35,normalMap:ctex(n,0,1),normalScale:new THREE.Vector2(.35,.35),transparent:true,opacity:.92});WATER.normalMap.repeat.set(3,3);return WATER}

function buildLevel(md){const L=genLevel(md);LV=L;C.length=0;PH.clear();I.length=0;LP.lamps.length=0;
 const root=new THREE.Group;root.name='level';L.root=root;L.cull=[];L.anim=[];L.water=[];L.sparks=[];L.spots=[];L.lockers=[];
 const r=RNG(md.seed*7+3),{W,H,g,ty,id}=L,tp=(x,y)=>(x<0||y<0||x>=W||y>=H||!g[id(x,y)])?null:TYPES[ty[id(x,y)]];
 const A=new Map,acc=(x,z)=>{const k=(x/(CS*CHK)|0)+','+(z/(CS*CHK)|0);if(!A.has(k))A.set(k,new Acc);return A.get(k)};
 /* track rows in halls / depots */
 const track=new Uint8Array(W*H);
 for(const rm of L.rooms){if(rm.t==='hall'){rm.track=rm.y;for(let x=rm.x;x<rm.x+rm.w;x++)track[id(x,rm.y)]=1}
  if(rm.t==='depot'){rm.tracks=[];for(let y=rm.y;y<rm.y+rm.h;y+=2){rm.tracks.push(y);for(let x=rm.x;x<rm.x+rm.w;x++)track[id(x,y)]=1}}}
 L.track=track;L.nb=new Uint8Array(W*H);
 /* walls, floors, ceilings */
 const Q4=(a,mat,p,n,rep)=>{const q=new THREE.BufferGeometry(),P=new Float32Array([...p[0],...p[1],...p[2],...p[0],...p[2],...p[3]]);q.setAttribute('position',new THREE.BufferAttribute(P,3));
  q.setAttribute('normal',new THREE.BufferAttribute(new Float32Array([n[0],n[1],n[2],n[0],n[1],n[2],n[0],n[1],n[2],n[0],n[1],n[2],n[0],n[1],n[2],n[0],n[1],n[2]]),3));
  const U=new Float32Array(12);for(let i=0;i<6;i++){const x=P[i*3],y=P[i*3+1],z=P[i*3+2];U[i*2]=(n[1]?x:(n[0]?z:x))/rep;U[i*2+1]=(n[1]?z:y)/rep}q.setAttribute('uv',new THREE.BufferAttribute(U,2));
  if(!a.b.has(mat))a.b.set(mat,[]);a.b.get(mat).push(q)};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=tp(x,y);if(!t)continue;const h=HT[t],x0=x*CS,x1=x0+CS,z0=y*CS,z1=z0+CS,a=acc(x0+1,z0+1);
  const fm=track[id(x,y)]?'grav':FM[t];Q4(a,fm,[[x0,0,z1],[x1,0,z1],[x1,0,z0],[x0,0,z0]],[0,1,0],MD[fm].rep);
  Q4(a,'ceil',[[x0,h,z0],[x1,h,z0],[x1,h,z1],[x0,h,z1]],[0,-1,0],MD.conc.rep);
  const F=[[-1,0,[x0,z1],[x0,z0],[1,0,0]],[1,0,[x1,z0],[x1,z1],[-1,0,0]],[0,-1,[x0,z0],[x1,z0],[0,0,1]],[0,1,[x1,z1],[x0,z1],[0,0,-1]]];
  for(const[dx,dy,pa,pb,n]of F){const nt=tp(x+dx,y+dy);let y0=0;if(nt){const nh=HT[nt];if(nh>=h)continue;y0=nh}
   const wm=WM[t];const band=(t==='hall'||t==='lab')&&!y0?2.6:0;
   if(band)Q4(a,'tile',[[pa[0],0,pa[1]],[pb[0],0,pb[1]],[pb[0],band,pb[1]],[pa[0],band,pa[1]]],n,MD.tile.rep);
   Q4(a,y0?wm:wm,[[pa[0],Math.max(y0,band),pa[1]],[pb[0],Math.max(y0,band),pb[1]],[pb[0],h,pb[1]],[pa[0],h,pa[1]]],n,MD[wm].rep);
   if(!y0){const o=.012;Q4(a,M.grime,[[pa[0]+n[0]*o,0,pa[1]+n[2]*o],[pb[0]+n[0]*o,0,pb[1]+n[2]*o],[pb[0]+n[0]*o,1.1,pb[1]+n[2]*o],[pa[0]+n[0]*o,1.1,pa[1]+n[2]*o]],n,1.1)}
   if(!y0){const mx=(pa[0]+pb[0])/2,mz=(pa[1]+pb[1])/2,ry=Math.atan2(n[0],n[2]);
    /* pipes & cables along walls */
    if(t==='tun'||t==='flood'||t==='tech'||t==='depot'){putI('pipe',GEO.pipe,M.metal,mx+n[0]*.2,h-.55,mz+n[2]*.2,ry+PI/2,1,1,CS);if(t!=='tech')putI('pipe2',GEO.pipe,M.metal,mx+n[0]*.32,h-.95,mz+n[2]*.32,ry+PI/2,.7,.7,CS)}
    if(t==='tun'){for(let c=0;c<3;c++)putI('cab',GEO.cable,M.cable,mx+n[0]*(.08+c*.03),1.45+c*.16,mz+n[2]*(.08+c*.03),ry+PI/2,1,1,CS);putI('brk',GEO.brk,M.dark,mx+n[0]*.1,1.6,mz+n[2]*.1,ry,1,2.4,1);
     putI('rib',GEO.rib,M.tun,pa[0]+n[0]*.07,h/2,pa[1]+n[2]*.07,ry,1,h,1)}
    if(t==='hall'&&!track[id(x,y)]&&(x+y)%2===0)putI('brk',GEO.brk,M.dark,mx+n[0]*.06,3.2,mz+n[2]*.06,ry,3,1,1)}}}
 /* tunnel rails & ceiling ribs, hall track */
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=tp(x,y),k=id(x,y);if(!t)continue;const cx=wx(x),cz=wx(y);
  const isT=track[k],tun=t==='tun';if(!(isT||tun))continue;
  const hx=!!(tp(x-1,y)||tp(x+1,y)),hz=!!(tp(x,y-1)||tp(x,y+1));if(tun&&hx&&hz)continue;const alongX=isT?1:hx;
  for(const s of[-.76,.76]){if(alongX)putI('rail',GEO.rail,M.rail,cx,.08,cz+s,PI/2,1,1,CS);else putI('rail',GEO.rail,M.rail,cx+s,.08,cz,0,1,1,CS)}
  for(let i=0;i<4;i++){const o=-CS/2+(i+.5)*CS/4;if(alongX)putI('slp',GEO.sleeper,M.wood,cx+o,.04,cz,PI/2);else putI('slp',GEO.sleeper,M.wood,cx,.04,cz+o,0)}
  if(tun){const h=HT.tun;if(alongX)putI('ribc',GEO.rib,M.tun,x*CS,h-.07,cz,0,1,.14,CS/.14);else putI('ribc',GEO.rib,M.tun,cx,h-.07,y*CS,0,CS/.3,.14,1)}}
 /* rooms: per-type dressing */
 const occ=new Uint8Array(W*H);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=L.start[0]+dx,y=L.start[1]+dy;if(x>=0&&y>=0&&x<W&&y<H)occ[id(x,y)]=1}
 const wallSpots=(rm)=>{const o=[];for(let y=rm.y;y<rm.y+rm.h;y++)for(let x=rm.x;x<rm.x+rm.w;x++){if(track[id(x,y)])continue;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(!tp(x+dx,y+dy))o.push([x,y,dx,dy])}return o};
 const PT={hall:['painted_wooden_bench','painted_wooden_bench','trashbag','WetFloorSign_01','cardboard_box_01','korean_fire_extinguisher_01'],
  depot:['Barrel_01','barrel_03','wooden_crate_01','metal_tool_chest','propane_tank','old_tyre','steel_frame_shelves_01','cement_bag'],
  flood:['Barrel_01','trashbag','old_tyre','wooden_crate_01'],lab:['metal_office_desk','steel_frame_shelves_01','metal_office_desk','cardboard_box_01','medical_box'],
  tech:['power_box_01','utility_box_02','steel_frame_shelves_01','Barrel_01','portable_generator','korean_fire_extinguisher_01'],
  office:['metal_office_desk','steel_frame_shelves_01','cardboard_box_01','russian_food_cans_01','trashbag'],annex:['steel_frame_shelves_01','cardboard_box_01','wooden_crate_01']};
 for(const rm of L.rooms){const t=rm.t,h=HT[t],cx=(rm.x+rm.w/2)*CS,cz=(rm.y+rm.h/2)*CS;
  /* lamps */
  if(t==='hall'){const lz=(rm.y+1+(rm.h-1)/2)*CS;for(let x=rm.x+1;x<rm.x+rm.w;x+=2){const lx=x*CS;const a=acc(lx,lz);a.add(GEO.lampP,M.lamp,lx,h-.35,lz,0);a.add(boxGeo(.1,.3,.1),M.dark,lx,h-.17,lz,0);lamp(lx,h-.45,lz,0xbfe0ff,1.15,r()<.2?1:0,root);
    putI('beam',GEO.beam,M.conc,lx,h-.2,(rm.y+rm.h/2)*CS,0,1,1,rm.h*CS)}
   /* columns between track and platform, ceiling beams */
   for(let x=rm.x+2;x<rm.x+rm.w-1;x+=3){const px=x*CS,pz=(rm.y+2)*CS;putI('col',GEO.col,M.conc,px,h/2,pz,0,1,h,1);putI('colb',GEO.col,M.tile,px,1.2,pz,0,1.08,2.4,1.08);addCol(px-.5,pz-.5,px+.5,pz+.5,h)}
   const a=acc(cx,(rm.y+1)*CS);a.box('metal',rm.x*CS,0,(rm.y+1)*CS-.18,(rm.x+rm.w)*CS,.04,(rm.y+1)*CS+.02);a.box(M.yel,rm.x*CS,0,(rm.y+1)*CS+.02,(rm.x+rm.w)*CS,.045,(rm.y+1)*CS+.2);
   /* station name sign */
   const sg=new THREE.Mesh(new THREE.PlaneGeometry(7,1.75),new THREE.MeshStandardMaterial({map:signTex(md.sign||'НУЛЕВАЯ','#d8dde4'),emissiveMap:null,emissive:0x000000,roughness:.6}));sg.material.emissiveMap=sg.material.map;sg.material.emissive.set(0x555555);
   sg.position.set(cx,4.1,rm.y*CS+.03);root.add(sg);
   /* wagons */
   const wl=4*CS;if(rm.w>=6&&!md.noTrain){const n=rm.w>=11?2:1;for(let i=0;i<n;i++){const x0=rm.x+1+i*(4+(rm.w>=12?1:0)),xc=(x0+2)*CS;if(x0+4>rm.x+rm.w)break;wagon(root,xc,(rm.y+.5)*CS-.15,wl-.4,1,i===n-1,md.seed+i,md.dark);for(let k=x0;k<x0+4;k++)L.nb[id(k,rm.y)]=1;rm.wag=(rm.wag||[]).concat([[xc,(rm.y+.5)*CS]])}}}
  else if(t==='depot'){for(let y=rm.y;y<rm.y+rm.h;y+=2)for(let x=rm.x+1;x<rm.x+rm.w;x+=3)if(r()<.55)hang(x*CS,h,(y+1)*CS,root,r);
   for(const ty2 of rm.tracks)if(ty2>rm.y&&r()<.8&&rm.w>=6){const x0=rm.x+1+(r()*(rm.w-5)|0);wagon(root,(x0+2)*CS,(ty2+.5)*CS-.1,4*CS-.4,r()<.5?1:-1,0,md.seed+ty2,1);for(let k=x0;k<x0+4;k++)L.nb[id(k,ty2)]=1}
   for(let x=rm.x;x<rm.x+rm.w;x+=2)putI('beam',GEO.beam,M.metal,x*CS,h-.25,cz,0,1,1,rm.h*CS)}
  else if(t==='lab'){for(let y=rm.y;y<rm.y+rm.h;y++)for(let x=rm.x;x<rm.x+rm.w;x+=2){const lx=wx(x),lz=wx(y);acc(lx,lz).add(GEO.lampP,(x+y)%3?M.lamp:M.dark,lx,h-.06,lz,PI/2);if((x+y)%3)lamp(lx,h-.2,lz,0xd8f0ff,.8,r()<.35?1:0,root)}}
  else{hang(cx,h,cz,root,r)}
  /* wall props */
  const ws=wallSpots(rm),types=PT[t]||PT.tech;for(const[x,y,dx,dy]of ws){if(r()>(t==='hall'?.32:.58)||occ[id(x,y)])continue;const nm=types[r()*types.length|0],md2=MOD[nm];if(!md2)continue;
   const ry=Math.atan2(-dx,-dy)+(r()-.5)*.25,dep=Math.min(md2.sz.z,md2.sz.x),px=wx(x)+dx*(CS/2-dep/2-.12),pz=wx(y)+dy*(CS/2-dep/2-.12);
   const lat=(r()-.5)*.8;putProp(nm,px+dy*lat,0,pz+dx*lat,ry,1,1);occ[id(x,y)]=1;
   if(nm==='metal_office_desk'&&r()<.6){const top=md2.sz.y;putProp(t==='lab'&&MOD.chemistry_set?'chemistry_set':'russian_food_cans_01',px,top,pz,ry,1,0)}}
  /* clutter in the middle of depots/tech */
  if(t==='depot'||t==='flood'){for(let i=0;i<rm.w;i++){const x=rm.x+(r()*rm.w|0),y=rm.y+(r()*rm.h|0);if(track[id(x,y)]||occ[id(x,y)])continue;putProp(r()<.5?'Barrel_01':'wooden_crate_01',wx(x)+(r()-.5),0,wx(y)+(r()-.5),r()*TAU,1,1);occ[id(x,y)]=1}}
  /* flood water */
  if(t==='flood'){const wm=new THREE.Mesh(new THREE.PlaneGeometry(rm.w*CS,rm.h*CS),waterMat());wm.rotation.x=-PI/2;wm.position.set(cx,md.water||.55,cz);wm.receiveShadow=true;root.add(wm);L.water.push({m:wm,x0:rm.x*CS,z0:rm.y*CS,x1:(rm.x+rm.w)*CS,z1:(rm.y+rm.h)*CS,lv:md.water||.55})}
  /* puddles */
  if(t==='hall'||t==='depot'||t==='tech'){for(let i=0;i<3;i++){const p=new THREE.Mesh(new THREE.CircleGeometry(1,20),M.puddle);p.rotation.x=-PI/2;p.scale.set(1+r()*2,.6+r(),1);p.position.set(rm.x*CS+r()*rm.w*CS,.012,rm.y*CS+CS+r()*(rm.h-1)*CS);root.add(p)}}}
 /* tunnel lamps every few cells */
 let tc=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(tp(x,y)!=='tun')continue;if(++tc%3)continue;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(!tp(x+dx,y+dy)){const px=wx(x)+dx*(CS/2-.15),pz=wx(y)+dy*(CS/2-.15);
   if(MOD.industrial_wall_lamp)putProp('industrial_wall_lamp',px-dx*.0,2.3,pz,Math.atan2(-dx,-dy),.8,0);lamp(px-dx*.35,2.45,pz-dy*.35,0xffa860,.9,r()<.25?(r()<.5?2:1):0,root);break}}
 /* graffiti, blood, symbols */
 const GR=md.graf||['ОНО ИДЁТ НА СВЕТ','НЕ ВЫКЛЮЧАЙ ФОНАРЬ?','ВЫХОДА НЕТ','03:47','НЕ СМОТРИ ЕМУ В ГЛАЗА','ОНО СЛЫШИТ'];
 for(let i=0;i<Math.min(8,L.rooms.length+3);i++){const rm=L.rooms[r()*L.rooms.length|0],ws=wallSpots(rm);if(!ws.length)continue;const[x,y,dx,dy]=ws[r()*ws.length|0];const kind=r()<.6?'graf':'blood';
  const dm=new THREE.Mesh(GEO.plane,new THREE.MeshStandardMaterial({map:decalTex(kind,GR[r()*GR.length|0],i+md.seed),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.8}));
  dm.scale.set(2.6,1.3,1);dm.position.set(wx(x)+dx*(CS/2-.02),1.5+r()*.8,wx(y)+dy*(CS/2-.02));dm.rotation.y=Math.atan2(-dx,-dy);root.add(dm)}
 /* merge static geometry per chunk */
 for(const[k,a]of A){const grp=a.build(root,false);grp.children.forEach(m=>{m.castShadow=false;const s=m.geometry.boundingSphere;m.userData.c=[s.center.x,s.center.z]});L.cull.push(...grp.children)}
 flushI(root,L.cull);L.cull.push(...flushProps(root));
 /* spots: cells usable for objectives */
 for(const rm of L.rooms)for(let y=rm.y;y<rm.y+rm.h;y++)for(let x=rm.x;x<rm.x+rm.w;x++){const k=id(x,y);if(track[k]&&!L.nb[k]&&rm.t!=='hall')continue;if(L.nb[k]||occ[k])continue;L.spots.push([x,y,rm.i])}
 S.add(root);return L}

function lamp(x,y,z,c,i,fl,root){const s=gs(c,fl===2?1.2:2,fl===2?.25:.4);s.position.set(x,y-.05,z);root.add(s);const o={p:new THREE.Vector3(x,y,z),c:new THREE.Color(c),i,fl,s,ph:rand()*9,on:1};
 if(Q[sv.q].vol&&y>3){const cone=new THREE.Mesh(new THREE.CylinderGeometry(.3,2.2,y-.1,16,1,true),VOLM);cone.position.set(x,(y-.1)/2,z);cone.geometry.translate(0,0,0);root.add(cone);o.cone=cone}
 if(fl===2)LV.sparks.push(o);LP.lamps.push(o);return o}
function hang(x,h,z,root,r){const m=modelMesh('hanging_industrial_lamp',1);if(m){m.position.set(x,h-1.15,z);root.add(m);const cb=new THREE.Mesh(GEO.cable,M.cable);cb.rotation.x=PI/2;cb.scale.set(1,1,1.2);cb.position.set(x,h-.6,z);root.add(cb)}
 lamp(x,h-1.05,z,0xffb878,1.0,r()<.2?1:0,root)}
function clearLevel(){if(!LV)return;S.remove(LV.root);LV.root.traverse(o=>{if(o.geometry&&!Object.values(GEO).includes(o.geometry)&&!o.isSprite){let keep=0;for(const k in MOD)for(const p of MOD[k].parts)if(p.g===o.geometry)keep=1;if(!keep)o.geometry.dispose()}
 if(o.material&&o.material.map&&o.material.map!==gt&&!Object.values(M).includes(o.material)&&o.material!==WATER&&o.material!==VOLM&&!o.isSprite){o.material.map.dispose();o.material.dispose()}
 if(o.isSprite)o.material.dispose()});LV=null;C.length=0;PH.clear();I.length=0;LP.lamps.length=0}
