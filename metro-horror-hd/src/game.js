/* =====================================================================
   game: missions, objectives, monster AI, player, UI, input, loop
   ===================================================================== */
const S_ENV={};let MG=null,PHM=null,fl=null,flCone=null,hemi=null,dust=null,SP=null;
let mode='load',t=0,mi=0,md=null,si=0,pt=0,evT=25,bo=1,boT=0,uiOpen=0,cur=null,inv=null,code='',noiseQ=[],lockIn=0,phan={t:6,on:0,life:0,look:0},stepT=0,endLock=0;
const P={dead:0,specd:0,x:0,z:0,yaw:0,pit:0,h:1.65,hp:100,st:100,bat:100,san:100,light:true,hide:0,crouch:0,tired:0,moving:0,run:0,bob:0,ls:0,shk:0,lk:null,wet:0,uvT:0,hold:0};
const MO={x:0,z:0,yaw:0,st:'idle',t0:10,cool:0,lost:0,path:[],pT:0,gk:-1,lx:0,lz:0,sw:0,n:0,flee:0,stalk:0,look:0,unseen:0,stuck:0,turn:0,ts:1,chk:0,ph:0,hb:0,ls:0,lunge:0,scrT:0,clkT:3,crawl:0,saw:0,sp:0,huntT:0,lk:null,lkT:0};
let PT=P;let K={},T={x:0,y:0,run:0,act:0,j:null,l:null,ox:0,oy:0,lx:0,ly:0};
const show=(id,v)=>$(id).classList.toggle('hide',!v);
let mt=0;function msg(s){const m=$('msg');m.textContent=s;m.style.opacity=1;clearTimeout(mt);mt=setTimeout(()=>m.style.opacity=0,3800)}
let stt=0;function sub(s,d){const m=$('sub');m.textContent=s;m.style.opacity=1;clearTimeout(stt);stt=setTimeout(()=>m.style.opacity=0,d||6500)}

/* ---------- A* on the cell grid ---------- */
function walk(i,j){return i>=0&&j>=0&&i<LV.W&&j<LV.H&&LV.g[j*LV.W+i]&&!LV.nb[j*LV.W+i]}
function nearestWalk(i,j){if(walk(i,j))return[i,j];for(let r=1;r<5;r++)for(let a=-r;a<=r;a++)for(const[x,y]of[[i+a,j-r],[i+a,j+r],[i-r,j+a],[i+r,j+a]])if(walk(x,y))return[x,y];return null}
function astar(sx,sz,tx,tz){const W=LV.W,s=nearestWalk(Math.floor(sx/CS),Math.floor(sz/CS)),e=nearestWalk(Math.floor(tx/CS),Math.floor(tz/CS));if(!s||!e)return[];
 const N=W*LV.H,g=new Float32Array(N).fill(1e9),from=new Int32Array(N).fill(-1),cl=new Uint8Array(N),S0=s[0]+s[1]*W,E0=e[0]+e[1]*W,open=[S0];g[S0]=0;const h=k=>Math.abs(k%W-e[0])+Math.abs((k/W|0)-e[1]);
 while(open.length){let bi=0,bf=1e9;for(let i=0;i<open.length;i++){const f=g[open[i]]+h(open[i]);if(f<bf){bf=f;bi=i}}const k=open[bi];open[bi]=open[open.length-1];open.pop();if(k===E0)break;if(cl[k])continue;cl[k]=1;
  const x=k%W,y=k/W|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(!walk(nx,ny))continue;const n=nx+ny*W,c=g[k]+1+(LV.ty[n]===6?0:.1);if(c<g[n]){g[n]=c;from[n]=k;open.push(n)}}}
 const out=[];let k=E0;if(from[k]<0&&k!==S0)return[];while(k>=0&&k!==S0){out.push([(k%W+.5)*CS,((k/W|0)+.5)*CS]);k=from[k]}out.reverse();if(out.length)out[out.length-1]=[tx,tz];return out}

/* ---------- objective world objects ---------- */
let OB=[],used=[],exitO=null,annexDoor=null;
function spotPick(o){o=o||{};const L=LV,annex=L.annex?L.annex.room.i:-99;let c=L.spots.filter(s=>(o.A?s[2]===annex:s[2]!==annex));
 if(o.wall)c=c.filter(s=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!L.g[(s[1]+dy)*L.W+s[0]+dx]));
 if(!o.A){const md2=Math.max(...c.map(s=>L.dist[s[0]+s[1]*L.W]));const lo=(o.lo||0)*md2,hi=(o.hi==null?1:o.hi)*md2;const c2=c.filter(s=>{const d=L.dist[s[0]+s[1]*L.W];return d>=lo&&d<=hi});if(c2.length>2)c=c2}
 const c3=c.filter(s=>used.every(u=>Math.abs(u[0]-s[0])+Math.abs(u[1]-s[1])>=(o.sp||3)));if(c3.length)c=c3;if(!c.length)c=L.spots;
 const s=c[rand()*c.length|0];used.push(s);const p={i:s[0],j:s[1],x:wx(s[0])+(rand()-.5)*1.2,z:wx(s[1])+(rand()-.5)*1.2,ry:rand()*TAU};
 if(o.wall){const ds=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>!L.g[(s[1]+dy)*L.W+s[0]+dx]),d=ds[rand()*ds.length|0];p.x=wx(s[0])+d[0]*(CS/2-(o.off||.1));p.z=wx(s[1])+d[1]*(CS/2-(o.off||.1));p.ry=Math.atan2(-d[0],-d[1]);p.d=d;
  if(d[0])p.z=wx(s[1])+(rand()-.5)*1.4;else p.x=wx(s[0])+(rand()-.5)*1.4}return p}
const emis=(c,i)=>new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:i||.8,roughness:.4});
function itemMesh(k){const c=(ITEMS[k]||{}).c||0xffe9b0;let m;
 if(k==='fu'||k==='uv'||k==='ak'){m=new THREE.Group;const b=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.24,12),emis(c,1.1));m.add(b);for(const y of[-.13,.13]){const e=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.03,12),M.rail);e.position.y=y;m.add(e)}}
 else if(k==='bt')m=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.22,12),emis(0x39d96b));
 else if(k==='md'){m=modelMesh('medical_box',.6)||new THREE.Mesh(new THREE.BoxGeometry(.3,.12,.2),new THREE.MeshStandardMaterial({color:0xeeeeee}))}
 else if(k==='ky'||k==='kk'){m=new THREE.Mesh(new THREE.BoxGeometry(.16,.015,.1),emis(c,1.3))}
 else if(k==='tp'){m=new THREE.Mesh(new THREE.BoxGeometry(.11,.07,.018),new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:.4}));m.add(new THREE.Mesh(new THREE.BoxGeometry(.08,.03,.02),emis(c,.6)))}
 else if(k==='part'){m=new THREE.Mesh(new THREE.TorusGeometry(.08,.03,8,16),M.metal)}
 else if(k==='doc'){m=modelMesh('clipboard',.8)||new THREE.Mesh(new THREE.BoxGeometry(.22,.02,.3),new THREE.MeshStandardMaterial({color:0xd8d0b8}))}
 else m=new THREE.Mesh(new THREE.BoxGeometry(.2,.04,.28),new THREE.MeshStandardMaterial({color:0x6a4a2a}));
 m.traverse(o=>{if(o.isMesh)o.castShadow=true});return m}
function addItem(k,p,lab,fn,obj,lid){const y=k==='doc'||k==='md'?.02:.95,m=itemMesh(k);m.position.set(p.x,y,p.z);LV.root.add(m);const s=gs((ITEMS[k]||{}).c||(k==='bt'?0x39d96b:k==='md'?0xff5a4a:k==='doc'?0xffe9b0:0xffe9b0),k==='doc'?.6:.8,.55);s.position.set(p.x,y+.08,p.z);LV.root.add(s);
 const o={x:p.x,z:p.z,y,r:1.9,m,s,bob:k!=='doc'&&k!=='md',l:()=>lab,f:()=>{o.off=1;m.visible=false;s.visible=false;SFX.pick();netI(o);fn()},obj};regI(o,lid,!!lid);if(obj)OB.push(o);return o}
function wallThing(p,build,y){const g=new THREE.Group;g.position.set(p.x,y||0,p.z);g.rotation.y=p.ry;build(g);LV.root.add(g);return g}
function addObj(kind,p,o){/* p: position from spotPick */const A=new Acc;let g;
 if(kind==='panel'){g=wallThing(p,G=>{const m=modelMesh('power_box_01');if(m){const s=.9/Math.max(MOD.power_box_01.sz.y,.01);m.scale.setScalar(s);m.position.set(0,.7,MOD.power_box_01.sz.z*s/2);G.add(m)}else G.add(new THREE.Mesh(boxGeo(.8,1,.3),M.door))});
  o.leds=[];for(let i=0;i<(o.n||3);i++){const l=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.03),new THREE.MeshBasicMaterial({color:0xff3322}));l.position.set(-.25+i*(.5/Math.max(1,(o.n||3)-1)),1.85,.08);g.add(l);o.leds.push(l)}}
 else if(kind==='term'){g=wallThing(p,G=>{const a=new Acc;a.box('door',-.5,0,-.3,.5,.95,.25);a.box(M.dark,-.32,.95,-.25,.32,1.42,.15);a.build(G);const c=cvs(256,192),x=c.getContext('2d');x.fillStyle='#021a0a';x.fillRect(0,0,256,192);x.fillStyle='#4dff7a';x.font='bold 20px monospace';x.fillText('ОБЪЕКТ-7 ТЕРМИНАЛ',12,40);x.fillText('ВВЕДИТЕ КОД:',12,90);x.fillText('> ____',12,130);
   const sc=new THREE.Mesh(new THREE.PlaneGeometry(.5,.36),new THREE.MeshBasicMaterial({map:ctex(c,1)}));sc.position.set(0,1.19,.155);G.add(sc);const s=gs(0x39ff88,1,.25);s.position.set(0,1.2,.3);G.add(s)})}
 else if(kind==='lever'){g=wallThing(p,G=>{const a=new Acc;a.box('door',-.22,1,-.06,.22,1.6,.06);a.build(G);const arm=new THREE.Group;arm.position.set(0,1.3,.08);const h=new THREE.Mesh(boxGeo(.05,.36,.05),M.rail);h.position.y=.16;arm.add(h);const k2=new THREE.Mesh(new THREE.SphereGeometry(.05,10,8),new THREE.MeshStandardMaterial({color:0x8a1a12,roughness:.5}));k2.position.y=.34;arm.add(k2);arm.rotation.x=.7;G.add(arm);o.arm=arm;
   const sym=new THREE.Mesh(GEO.plane,new THREE.MeshStandardMaterial({map:decalTex('sym','',o.sym),transparent:true,depthWrite:false}));sym.scale.set(.6,.3,1);sym.position.set(0,1.85,.07);G.add(sym)},0)}
 else if(kind==='valve'){g=wallThing(p,G=>{const pp=new THREE.Mesh(GEO.pipe,M.metal);pp.scale.set(.8,.8,.5);pp.position.set(0,1.2,.25);G.add(pp);const w=new THREE.Group;w.position.set(0,1.2,.5);const tr=new THREE.Mesh(new THREE.TorusGeometry(.26,.03,8,24),new THREE.MeshStandardMaterial({color:0x8a2a1a,roughness:.5,metalness:.5}));w.add(tr);
   for(let i=0;i<4;i++){const s=new THREE.Mesh(boxGeo(.03,.5,.03),M.metal);s.rotation.z=i*PI/4;w.add(s)}G.add(w);o.wheel=w})}
 else if(kind==='gen'||kind==='bench'){g=wallThing(p,G=>{const nm=kind==='gen'?'portable_generator':'metal_office_desk',m=modelMesh(nm);if(m){m.position.z=MOD[nm].sz.z/2+.05;G.add(m)}else G.add(new THREE.Mesh(boxGeo(1,.8,.6),M.door));
   if(kind==='bench'){const t2=modelMesh('metal_tool_chest',.5);if(t2){t2.position.set(.3,(MOD.metal_office_desk||{sz:{y:.8}}).sz.y,.35);G.add(t2)}}})}
 else if(kind==='cab'){g=wallThing(p,G=>{const a=new Acc;if(md.cab==='car'){a.box(M.dark,-.9,.3,-.1,.9,.42,1.7);for(const x of[-.7,.7])for(const z of[.1,1.5]){const wh=new THREE.CylinderGeometry(.28,.28,.08,16);wh.rotateZ(PI/2);a.add(wh,M.rail,x,.28,z,0)}
    a.box('metal',-.05,.42,.7,.05,1.2,.8);a.add(boxGeo(1.2,.06,.06),M.rail,0,1.2,.75,0);a.box('wood',-.85,.42,-.05,.85,.47,1.65)}
   else{a.box('train',-.9,0,0,.9,1,.8);a.add(boxGeo(1.8,.08,.7),M.dark,0,1.1,.4,0,-.4);a.box(M.dark,-.9,1,.65,.9,1.6,.8)}a.build(G);
   for(let i=0;i<5;i++){const s=gs(i%2?0xff3322:0x39ff88,.18,.9);s.position.set(-.6+i*.3,md.cab==='car'?1.25:1.18,md.cab==='car'?.75:.35);G.add(s)}})}
 else if(kind==='scan'){g=new THREE.Mesh(GEO.plane,new THREE.MeshStandardMaterial({map:decalTex('sym','',o.sym||((rand()*5)|0)),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,emissive:0x000000}));g.scale.set(1.8,.9,1);
  g.position.set(p.x,1.7,p.z);g.rotation.y=p.ry;LV.root.add(g)}
 o.g=g;return o}

/* ---------- mission start ---------- */
function startMission(i,opts){audio();opts=opts||{};const nt=!!(opts.net&&NET.ch);NET.on=nt?1:0;NET.ingame=nt?1:0;NET.cl=nt&&!NET.host?1:0;NET.seed=nt?(opts.seed|0):null;NET.paused=0;IM={};idc=0;RNGF=Math.random;if(!nt&&NET.room)roomLeave();if(nt){netReset();RNGF=RNG(NET.seed>>>0)}$('pb').classList.add('hide');mi=i;md=Object.assign({},MS[i],{steps:MS[i].steps.map(q=>Object.assign({},q))});clearLevel();used=[];OB=[];exitO=null;annexDoor=null;
 const L=buildLevel(md);code=String(1000+(RNG(md.seed*13+(nt?NET.seed%1000:Date.now()%1000))()*9000|0));
 const sx=wx(L.start[0]),sz=wx(L.start[1]);Object.assign(P,{x:sx,z:sz,yaw:0,pit:0,h:1.65,hp:100,st:100,bat:100,san:100,light:true,hide:0,crouch:0,tired:0,shk:0,uvT:0,hold:0,wet:0,dead:0,specd:0,lk:null});
 P.yaw=Math.atan2(-(wx(L.rooms[0].cx|0)-sx)||-.001,-(wx(L.rooms[0].cy|0)-sz)||-1);if(nt)P.x+=NET.host?-.5:.5;
 inv={bat:1,med:1,it:{},key:0,need:0,got:{},uv:i>16?1:0};pt=0;evT=25;bo=1;boT=0;si=-1;phan={t:8,on:0,life:0,look:0};
 if(md.dark)LP.lamps.forEach(l=>{if(rand()<.75){l.on=0}});
 /* annex door */
 if(L.annex){const a=L.annex,dx=a.d[0],dy=a.d[1],bx=(a.fx+.5+dx*.5)*CS,bz=(a.fy+.5+dy*.5)*CS,g=new THREE.Group;g.position.set(bx,0,bz);g.rotation.y=Math.atan2(dx,dy);
  const ac=new Acc;ac.box('door',-1.6,2.6,-.15,1.6,3.2,.15).box('door',-1.6,0,-.15,-.75,2.6,.15).box('door',.75,0,-.15,1.6,2.6,.15);ac.build(g);const lf=new THREE.Mesh(boxGeo(1.5,2.6,.08),M.door);lf.position.set(0,1.3,0);lf.castShadow=true;g.add(lf);
  const led=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.04),new THREE.MeshBasicMaterial({color:0xff2211}));led.position.set(1.05,1.4,.17);g.add(led);L.root.add(g);
  const col=addCol(Math.min(bx,bx+dx*.3)-(dy?1.6:.2),Math.min(bz,bz+dy*.3)-(dx?1.6:.2),Math.max(bx,bx+dx*.3)+(dy?1.6:.2),Math.max(bz,bz+dy*.3)+(dx?1.6:.2),3,1);
  annexDoor={g,lf,led,col,open:0,x:bx-dx*.8,z:bz-dy*.8};regI({x:annexDoor.x,z:annexDoor.z,r:2,l:()=>annexDoor.open?'':(inv.key?'Открыть ключ-картой':'Заперто. Нужна ключ-карта'),f:()=>{if(inv.key)openAnnex();else{msg('Заперто. Нужна ключ-карта');SFX.err()}}})}
 /* exit door */
 placeExit();
 /* pickups: batteries, medkits, lockers, lore document */
 const nb=2+(rand()*2|0),nm=1+(rand()*2|0);for(let k=0;k<nb;k++)addItem('bt',spotPick({sp:2}),'Взять батарею',()=>{inv.bat++;msg('Запасная батарея для фонаря')});
 for(let k=0;k<nm;k++)addItem('md',spotPick({sp:2}),'Взять аптечку',()=>{inv.med++;msg('Аптечка')});
 const nl=3+(rand()*3|0);for(let k=0;k<nl;k++)locker(spotPick({wall:1,off:.42,sp:2}));
 if(md.doc&&!sv.lore.includes(i))addItem('doc',lorePick(),'Прочитать: '+md.doc[0],()=>{sv.lore.push(i);put();note(md.doc[0],md.doc[1]+'\n\n(Документ '+sv.lore.length+'/24)')},0,'lore');
 RNGF=Math.random;
 /* monster */
 Object.assign(MO,{st:'idle',t0:md.mon.d,cool:0,lost:0,path:[],pT:0,gk:-1,flee:0,stalk:0,look:0,unseen:0,saw:0,huntT:0,lk:null,lkT:0,scrT:0,crawl:0,lunge:0,sp:0});MG.visible=false;if(!NET.cl)spawnFar(1);
 /* camera/flashlight to first person */
 cam.add(fl);fl.position.set(.2,-.2,-.45);fl.target.position.set(.05,-.25,-8);cam.add(fl.target);fl.angle=.52;fl.penumbra=.55;fl.distance=34;HAND.visible=true;if(hum)hum.visible=false;
 cam.fov=72;cam.updateProjectionMatrix();S.fog.density=md.dark?.042:.032;
 mode='play';show('menu',0);show('pn',0);show('end',0);show('pause',0);show('hud',1);if(touch)show('tc',1);applyLayout();
 try{const q=R.domElement.requestPointerLock();q&&q.catch&&q.catch(()=>{})}catch(e){}
 R.compile(S,cam);
 if(i%6===0&&!sv.done[i])sub('Глава '+(i/6+1)+'. «'+CH[i/6|0]+'». '+CHT[i/6|0],9000);
 msg(md.intro);nextStep()}
function lorePick(){const c=LV.spots.filter(s=>!(LV.annex&&s[2]===LV.annex.room.i)),r=RNG(md.seed+5)(),s=c[(r*c.length)|0];return{x:wx(s[0])+.3,z:wx(s[1])-.3}}
function shuf(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=rand()*(i+1)|0;const t2=a[i];a[i]=a[j];a[j]=t2}return a}
function locker(p){const m=lockerMesh();m.position.set(p.x,0,p.z);m.rotation.y=p.ry;LV.root.add(m);const ex=p.x-(p.d?p.d[0]:0)*1.1,ez=p.z-(p.d?p.d[1]:0)*1.1;addCol(p.x-.45,p.z-.45,p.x+.45,p.z+.45,2,0);
 const o={x:ex,z:ez,lx:p.x,lz:p.z,r:1.5,l:()=>P.hide?'Выйти из шкафа':'Спрятаться в шкаф',f:()=>{if(P.hide){P.hide=0;P.x=o.x;P.z=o.z;noiseAt(P.x,P.z,5);SFX.door()}else{P.hide=1;P.lk=o;P.crouch=0;P.yaw=Math.atan2(o.x-o.lx,o.z-o.lz);P.pit=0;noiseAt(P.x,P.z,4);if(MO.st==='chase'&&MG.visible&&Math.hypot(MO.x-P.x,MO.z-P.z)<16&&los(MO.x,MO.z,P.x,P.z))MO.saw=1}}};
 regI(o);LV.lockers.push(o)}
function openAnnex(){if(!annexDoor||annexDoor.open)return;annexDoor.open=1;annexDoor.col[5]=-1;annexDoor.led.material.color.setHex(0x22ff55);SFX.door();noiseAt(annexDoor.x,annexDoor.z,14);msg('Замок открыт');if(!NET.remote&&NET.on)nsend('a',{an:1})}
function placeExit(far){const L=LV;let best=null,bd=-1;const cand=L.spots.filter(s=>(!L.annex||s[2]!==L.annex.room.i)&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!L.g[(s[1]+dy)*L.W+s[0]+dx]));
 for(const s of cand){let d=L.dist[s[0]+s[1]*L.W];if(far)d=Math.hypot(wx(s[0])-P.x,wx(s[1])-P.z)+rand()*6;if(d>bd&&!(exitO&&exitO.i===s[0]&&exitO.j===s[1])){bd=d;best=s}}
 const ds=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>!L.g[(best[1]+dy)*L.W+best[0]+dx]),d=ds[0],x=wx(best[0])+d[0]*(CS/2),z=wx(best[1])+d[1]*(CS/2),g=new THREE.Group;
 g.position.set(x,0,z);g.rotation.y=Math.atan2(-d[0],-d[1]);const ac=new Acc;ac.box('door',-1.3,0,-.05,-1.1,2.8,.25).box('door',1.1,0,-.05,1.3,2.8,.25).box('door',-1.3,2.6,-.05,1.3,2.9,.25);ac.build(g);
 const lv=[-.55,.55].map(s=>{const m=new THREE.Mesh(boxGeo(1.1,2.6,.12),M.door);m.position.set(s,1.3,.05);m.castShadow=true;g.add(m);return m});
 const sg=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.4),new THREE.MeshStandardMaterial({map:signTex('ВЫХОД','#37d67a'),emissive:0xffffff,emissiveIntensity:.5}));sg.material.emissiveMap=sg.material.map;sg.position.set(0,3.15,.12);g.add(sg);
 const bk=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.6),new THREE.MeshBasicMaterial({color:0x8fa0ad,fog:true}));bk.position.set(0,1.3,-.02);g.add(bk);const gl=gs(0xdfe8f0,5,.0);gl.position.set(0,1.4,.5);g.add(gl);const sl=gs(0x37d67a,1.6,.5);sl.position.set(0,3.15,.3);g.add(sl);LV.root.add(g);
 if(exitO){exitO.g.visible=false}exitO={g,lv,gl,i:best[0],j:best[1],x:wx(best[0])+d[0]*(CS/2-.9),z:wx(best[1])+d[1]*(CS/2-.9),open:0}}

/* ---------- steps ---------- */
const stp=()=>md.steps[si];
function nextStep(){if(NET.seed!=null){const o=RNGF;RNGF=RNG((NET.seed>>>0)+(si+1)*7919);try{nextStepI()}finally{RNGF=o}}else nextStepI()}
function nextStepI(){PT=tgt();si++;stepT=0;if(si>=md.steps.length){finish(1);return}const s=stp();s.c=0;s.p=0;
 const T2=(s.t||'').replace('{CODE}',code);
 if(s.k==='get'){s.c=0;for(let n=0;n<s.n;n++){const p=spotPick({lo:s.A?0:.25+n*.12,hi:1,A:s.A,sp:4});addItem(s.it,p,'Взять '+ITEMS[s.it].n,()=>{inv.it[s.it]=(inv.it[s.it]||0)+1;s.c++;msg(cap(ITEMS[s.it].n)+' ('+s.c+'/'+s.n+')');if(s.c>=s.n)done()},1)}}
 else if(s.k==='use'||s.k==='ride'){const o=addObj(s.o,spotPick({wall:1,off:s.o==='panel'?.05:.5,lo:.35,sp:3}),{n:(md.steps[si-1]||{}).n||3});o.x=o.g.position.x;o.z=o.g.position.z;
  if(o.leds)o.leds.forEach(l=>l.material.color.setHex(0xffaa22));const x=o.x+Math.sin(o.g.rotation.y)*.9,z=o.z+Math.cos(o.g.rotation.y)*.9;
  const it={x,z,r:2,obj:1,l:()=>s.k==='ride'?'Отправляемся!':s.t,f:()=>{if(o.leds)o.leds.forEach(l=>l.material.color.setHex(0x33ff66));SFX.ok();it.off=1;netI(it);done()}};regI(it);OB.push(it);
  const prev=md.steps.find(q=>q.k==='use'&&q.o===s.o&&q!==s);if(s.k==='ride'&&s.o==='cab'){}}
 else if(s.k==='code'){const o=addObj('term',spotPick({wall:1,off:.5,lo:.3,sp:3}),{});const x=o.g.position.x+Math.sin(o.g.rotation.y)*.9,z=o.g.position.z+Math.cos(o.g.rotation.y)*.9;
  const it={x,z,r:2,obj:1,l:()=>'Ввести код',f:()=>keypad(ok=>{if(ok){it.off=1;SFX.ok();netI(it);done()}else{SFX.err();noiseAt(P.x,P.z,26);msg('Неверный код. Сигнал тревоги разнёсся по станции…')}}),rf:()=>{it.off=1;SFX.ok();done()}};regI(it);OB.push(it)}
 else if(s.k==='seq'){const base=spotPick({wall:1,off:.1,lo:.3,sp:3}),syms=shuf([0,1,2,3,4]).slice(0,s.n),order=shuf(syms);s.order=order;s.pos=0;s.lv=[];
  const SYM=['◯⟋','△','✳','◎','✕'];const room=LV.rid[base.j*LV.W+base.i];
  for(let n=0;n<s.n;n++){const p=n?spotPick({wall:1,off:.1,sp:1,lo:0}):base;const ob=addObj('lever',p,{sym:syms[n]});ob.sym=syms[n];const x=p.x+Math.sin(p.ry)*.8,z=p.z+Math.cos(p.ry)*.8;
   const it={x,z,r:1.6,obj:1,l:()=>ob.on?'':'Повернуть рубильник',f:()=>{netI(it);SFX.lever();ob.on=1;ob.arm.rotation.x=-.7;noiseAt(P.x,P.z,12);
    if(order[s.pos]===ob.sym){s.pos++;if(s.pos>=s.n){it.off=1;s.lv.forEach(q=>q.it.off=1);done()}}else{SFX.err();noiseAt(P.x,P.z,28);msg('Не тот порядок! Механизм сбросился с грохотом');s.pos=0;s.lv.forEach(q=>{q.on=0;q.arm.rotation.x=.7})}}};ob.it=it;s.lv.push(ob);regI(it);OB.push(it)}
  const np=spotPick({lo:0,sp:2});addItem('doc',np,'Прочитать схему',()=>note('Схема',('Порядок включения:\n'+order.map(k=>SYM[k]).join('  →  ')+'\n\n(символы нарисованы над рубильниками)')),0,'schema').off=0}
 else if(s.k==='valve'||s.k==='hold'){const n=s.k==='valve'?s.n:1;s.c=0;s.items=[];for(let k=0;k<n;k++){const kind=s.k==='valve'?'valve':s.o,p=spotPick({wall:1,off:kind==='valve'?.05:.45,lo:.25,sp:3}),ob=addObj(kind,p,{});
   const x=p.x+Math.sin(p.ry)*.95,z=p.z+Math.cos(p.ry)*.95,it={x,z,r:1.8,obj:1,hold:s.s||3.5,p:0,ob,l:()=>s.t.replace(/\s*\(.*\)/,'')+' — удерживай',f:()=>{}};
   it.done=()=>{it.off=1;netI(it);s.c++;SFX.ok();if(kind==='valve')msg('Задвижка открыта ('+s.c+'/'+n+')');if(s.c>=n)done()};s.items.push(it);regI(it);OB.push(it)}}
 else if(s.k==='scan'){s.c=0;s.items=[];for(let k=0;k<s.n;k++){const p=spotPick({wall:1,off:.03,lo:.2,sp:3});const ob=addObj('scan',p,{sym:k+1});s.items.push({ob,x:p.x,z:p.z,p:0,obj:1});OB.push(s.items[k])}}
 else if(s.k==='read'){const p=spotPick({lo:s.A?0:.3,A:s.A,sp:3});addItem('doc',p,'Прочитать: '+s.ti,()=>{note(s.ti,s.x.replace('{CODE}',code),done)},1)}
 else if(s.k==='key'){addItem('ky',spotPick({lo:.35,sp:3}),'Взять ключ-карту',()=>{inv.key=1;msg('Ключ-карта. Подходит к запертой двери');done()},1)}
 else if(s.k==='survive'){s.p=s.s;MO.huntT=0;if(MO.st==='idle'&&!NET.cl)spawnFar()}
 else if(s.k==='exit'||s.k==='escape'){exitO.open=1;SFX.door();OB.push({x:exitO.x,z:exitO.z,obj:1,exit:1});if(s.k==='escape'&&!NET.cl)spawnBehind(19)}
 else if(s.k==='radio'){SFX.radio();sub(s.x,7000);setTimeout(()=>{if(stp()===s&&mode!=='end')done()},3500)}
 else if(s.k==='stun'){if(MO.st==='idle'&&!NET.cl)spawnFar();}
 $('obj').innerHTML='<b>'+(mi+1)+'. '+md.n.toUpperCase()+'</b>'+T2}
const cap=s=>s[0].toUpperCase()+s.slice(1);
function done(){const s=stp();if(!s||s.dn)return;s.dn=1;if(s.uv)inv.uv=1;if(NET.on&&!NET.remote)nsend('a',{st:si});OB=OB.filter(o=>!o.obj||o.off===0);OB=[];if(s.say)msg(s.say);if(s.ev)event(s.ev);const tok=md;setTimeout(()=>{if(md===tok&&(mode==='play'||mode==='pause'||mode==='spec'))nextStep()},s.k==='radio'?0:600)}
function event(e){const H=!NET.cl;PT=tgt();
 if(e==='scare'){bo=0;boT=1.4;SFX.clang();P.san-=8;if(H){MO.st!=='chase'&&(Object.assign(MO,{st:'search',lx:PT.x,lz:PT.z,sw:0,n:0}));if(MO.st==='idle')spawnFar()}msg('Шум разнёсся по станции…')}
 else if(e==='hunt'){if(H){if(MO.st==='idle')spawnFar();Object.assign(MO,{st:'search',lx:PT.x+(rand()-.5)*6,lz:PT.z+(rand()-.5)*6,sw:0,n:0})}}
 else if(e==='blackout'){bo=0;boT=4;beep(110,.5,'square',.3,40);P.san-=6;msg('Свет погас…')}
 else if(e==='spawn'){if(H)spawnSight()}
 else if(e==='quake'){P.shk=1.6;SFX.rumble();bo=.2;boT=1.5;msg('Своды тоннеля задрожали')}
 else if(e==='whisper'){SFX.whisper();P.san-=5}
 else if(e==='stalk'){if(H){if(MO.st==='idle')spawnFar();MO.st='stalk';MO.stalk=28}}
 else if(e==='phantoms'){phan.boost=40;phan.t=2;SFX.whisper()}
 else if(e==='flood'){LV.water.forEach(w=>w.tgt=.03);SFX.rumble()}}
function ambient(e){if(e===0){bo=0;boT=2.2;beep(110,.5,'square',.3,40);msg('Свет погас…')}else if(e===1){SFX.clang();msg('Где-то в тоннеле лязгнул металл')}else if(e===2){beep(90,1.5,'sawtooth',.18,35);msg('Из темноты донёсся низкий гул')}
 else if(e===3){SFX.rumble();P.shk=.5;msg('Вдалеке прошёл поезд… которого не может быть')}else if(e===4){SFX.whisper()}
 else if(MO.st==='patrol'){if(!NET.cl){PT=tgt();Object.assign(MO,{st:'search',lx:PT.x+(rand()-.5)*10,lz:PT.z+(rand()-.5)*10,sw:0,n:0})}beep(160,.6,'square',.25,60);msg('Что-то услышало шум…')}}

/* ---------- monster placement ---------- */
function freeSpot(minD,maxD,hidden){let best=null;for(let k=0;k<80;k++){const s=LV.spots[rand()*LV.spots.length|0];if(LV.annex&&s[2]===LV.annex.room.i)continue;const x=wx(s[0]),z=wx(s[1]),d=Math.hypot(x-PT.x,z-PT.z);
  if(d<minD||d>maxD)continue;if(hidden&&los(x,z,PT.x,PT.z))continue;best=[x,z];break}return best}
function spawnFar(now){const p=freeSpot(26,90,1)||freeSpot(18,99,0);if(!p)return;MO.x=p[0];MO.z=p[1];if(!now||MO.t0<=0){MO.st='patrol';MG.visible=true}else MO.st='idle'}
function spawnSight(){let p=null;const fx=-Math.sin(PT.yaw),fz=-Math.cos(PT.yaw);for(let k=0;k<120&&!p;k++){const s=LV.spots[rand()*LV.spots.length|0],x=wx(s[0]),z=wx(s[1]),dx=x-PT.x,dz=z-PT.z,d=Math.hypot(dx,dz);
  if(d>9&&d<20&&(dx*fx+dz*fz)/d>.5&&los(PT.x,PT.z,x,z))p=[x,z]}if(!p)p=freeSpot(10,24,0);if(!p)return;Object.assign(MO,{x:p[0],z:p[1],st:'chase',lost:0,lx:PT.x,lz:PT.z,cool:1.3,scrT:0});MO.yaw=Math.atan2(PT.x-MO.x,PT.z-MO.z);MG.visible=true;SFX.scream();MO.scrT=8;P.san-=12;P.shk=.4;if(NET.on&&NET.host)nsend('sc',{})}
function spawnBehind(d){const fx=Math.sin(PT.yaw),fz=Math.cos(PT.yaw);let p=null;for(let k=0;k<100&&!p;k++){const s=LV.spots[rand()*LV.spots.length|0],x=wx(s[0]),z=wx(s[1]),dx=x-PT.x,dz=z-PT.z,dd=Math.hypot(dx,dz);if(dd>d-4&&dd<d+8&&(dx*fx+dz*fz)/dd>.2)p=[x,z]}
 if(!p)p=freeSpot(d-4,d+12,0);if(!p)return;Object.assign(MO,{x:p[0],z:p[1],st:'chase',lost:0,lx:PT.x,lz:PT.z,cool:.8});MG.visible=true;SFX.scream();MO.scrT=8}

/* ---------- monster AI ---------- */
function monUpdate(dt){const m=MO,Q=tgt();PT=Q;const dx=Q.x-m.x,dz=Q.z-m.z,d=Math.hypot(dx,dz);
 if(m.st==='idle'){m.t0-=dt;if(m.t0<=0)spawnFar();return}
 MG.visible=true;m.cool-=dt;m.chk-=dt;m.scrT-=dt;m.lunge-=dt;
 const fx=-Math.sin(Q.yaw)*Math.cos(Q.pit),fz=-Math.cos(Q.yaw)*Math.cos(Q.pit),playerLooks=d<28&&-(dx*fx+dz*fz)/(d||1)>.82&&los(Q.x,Q.z,m.x,m.z);
 /* noise */
 for(const[nx,nz,r]of noiseQ){const nd=Math.hypot(nx-m.x,nz-m.z);if(nd<r&&m.st!=='chase'&&m.st!=='flee'){Object.assign(m,{st:'search',lx:nx+(rand()-.5)*2,lz:nz+(rand()-.5)*2,sw:0,n:0})}}noiseQ.length=0;
 /* perception */
 if(m.chk<=0&&m.st!=='flee'){m.chk=.12;const an=(dx*Math.sin(m.yaw)+dz*Math.cos(m.yaw))/(d||1),lit=Q.light&&Q.bat>0,rg=Q.hide?0:(lit?25:11)*(Q.crouch?.65:1)*(Q.moving?1:.8);
  let see=!Q.hide&&d<rg&&(an>.2||d<3)&&los(m.x,m.z,Q.x,Q.z);
  if(!see&&lit&&!Q.hide&&d<32&&playerLooks)see=1;/* it walks to the light */
  if(see){if(m.st!=='chase'){if(m.st!=='stalk'||d<8||playerLooks&&rand()<.15){m.st='chase';if(m.scrT<=0){SFX.scream();m.scrT=9;Q.san-=6}}}if(m.st==='chase'){m.lost=0;m.lx=Q.x;m.lz=Q.z}}
  else if(m.st==='chase'){m.lost+=.12;if(m.lost>4){Object.assign(m,{st:'search',sw:0,n:0})}}
  else if(lit&&d<18&&m.st==='patrol'&&rand()<.04){Object.assign(m,{st:'search',lx:Q.x+(rand()-.5)*8,lz:Q.z+(rand()-.5)*8,sw:0,n:0})}}
 /* hunt during survive */
 const s=stp();if(s&&s.k==='survive'&&m.st!=='chase'&&m.st!=='flee'){m.huntT-=dt;if(m.huntT<=0){m.huntT=5;Object.assign(m,{st:'search',lx:Q.x+(rand()-.5)*7,lz:Q.z+(rand()-.5)*7,sw:0,n:0})}}
 /* UV burns, light attracts */
 const aim=playerLooks&&d<10&&Q.light&&Q.bat>0&&!Q.hide;
 if(aim&&inv.uv&&m.st!=='flee'){Q.uvT+=dt;Q.bat=Math.max(0,Q.bat-dt*5);if(Q.uvT>1.1){Q.uvT=0;Object.assign(m,{st:'flee',flee:7});SFX.scream();m.scrT=4;msg('Оно горит в ультрафиолете и бежит!');const q=stp();if(q&&q.k==='stun')done()}}else Q.uvT=Math.max(0,Q.uvT-dt*2);
 /* stalk: hides when looked at */
 if(m.st==='stalk'){m.stalk-=dt;if(playerLooks){m.look+=dt;if(m.look>.5){m.look=0;const p=freeSpot(16,40,1);if(p&&rand()<.6){m.x=p[0];m.z=p[1];SFX.click()}else{Object.assign(m,{st:'chase',lx:Q.x,lz:Q.z,lost:0});SFX.scream();m.scrT=8}}}if(m.stalk<=0)m.st='patrol'}
 /* vent relocation when far & unseen */
 if(!playerLooks&&d>34&&m.st==='patrol'){m.unseen+=dt;if(m.unseen>20){m.unseen=0;const p=freeSpot(16,26,1);if(p){m.x=p[0];m.z=p[1];m.path=[];setTimeout(SFX.clang,400);msg('В вентиляции что-то проползло…')}}}else m.unseen=0;
 /* goal & speed */
 let gx=m.x,gz=m.z,sp=1.55;const mult=md.mon.sp;
 if(m.st==='patrol'){if(!m.pg||Math.hypot(m.x-m.pg[0],m.z-m.pg[1])<1.8){m.pg=freeSpot(10,34,0)||[m.x+(rand()-.5)*10,m.z+(rand()-.5)*10]}gx=m.pg[0];gz=m.pg[1]}
 else if(m.st==='chase'){gx=m.lx;gz=m.lz;sp=3.85;if(d<6&&m.lunge<-2&&rand()<.02)m.lunge=.55;if(m.lunge>0)sp=5.6;if(d<2.2&&m.cool>0)sp=.4;
  if(Math.hypot(m.x-gx,m.z-gz)<1.2&&m.lost>0)Object.assign(m,{st:'search',sw:0,n:0})}
 else if(m.st==='search'){gx=m.lx;gz=m.lz;sp=2.35;if(Math.hypot(m.x-gx,m.z-gz)<1.4){sp=0;m.sw+=dt;
   if(!m.lk&&Q.hide&&Q.lk&&Math.hypot(Q.lk.lx-m.x,Q.lk.lz-m.z)<6){m.lk=Q.lk;m.lkT=m.saw?1:3+rand()*2;m.lx=Q.lk.x;m.lz=Q.lk.z}
   if(m.lk&&Math.hypot(m.lk.x-m.x,m.lk.z-m.z)<1.6){m.lkT-=dt;sp=0;m.sw=0;if(m.lkT<=0){if(Q.hide&&Q.lk===m.lk&&(m.saw||rand()<.12)){if(Q===P){P.hide=0;P.x=m.lk.x;P.z=m.lk.z;deathScare()}else killRemote();return}m.lk=null;m.saw=0;m.lx=m.x+(rand()-.5)*12;m.lz=m.z+(rand()-.5)*12}}
   else if(m.sw>1.6+rand()){m.sw=0;m.lx=m.x+(rand()-.5)*14;m.lz=m.z+(rand()-.5)*12;if(++m.n>4){m.n=0;m.st='patrol'}}}}
 else if(m.st==='stalk'){gx=Q.x;gz=Q.z;sp=d>13?2.6:d>9?1.2:0}
 else if(m.st==='flee'){m.flee-=dt;sp=5;if(!m.fg||Math.hypot(m.x-m.fg[0],m.z-m.fg[1])<2)m.fg=freeSpot(25,70,1)||[m.x-dx,m.z-dz];gx=m.fg[0];gz=m.fg[1];if(m.flee<=0)m.st='patrol'}
 sp*=mult;if(s&&s.k==='escape'&&m.st==='chase')sp=Math.min(sp,3.4);
 /* path following */
 const gk=Math.floor(gx/CS)+Math.floor(gz/CS)*LV.W;m.pT-=dt;if(gk!==m.gk||m.pT<=0){m.gk=gk;m.pT=.5;m.path=astar(m.x,m.z,gx,gz)}
 let tx=gx,tz=gz;while(m.path.length&&Math.hypot(m.path[0][0]-m.x,m.path[0][1]-m.z)<.7)m.path.shift();
 if(m.path.length){tx=m.path[0][0];tz=m.path[0][1];if(m.path.length>1&&los(m.x,m.z,m.path[1][0],m.path[1][1])&&Math.hypot(m.path[1][0]-m.x,m.path[1][1]-m.z)<CS*2.2){tx=m.path[1][0];tz=m.path[1][1]}}
 if(m.st==='chase'&&d<7&&los(m.x,m.z,Q.x,Q.z)){tx=Q.x;tz=Q.z}
 let ax=tx-m.x,az=tz-m.z;const al=Math.hypot(ax,az)||1;ax/=al;az/=al;if(al<.15)sp=0;
 if(m.turn>0){m.turn-=dt;const c=Math.cos(m.ts),sn=Math.sin(m.ts),q=ax*c-az*sn;az=ax*sn+az*c;ax=q}
 if(m.cool>.9)sp=0;const ox=m.x,oz=m.z;move(m,ax*sp*dt,az*sp*dt,.42,1);m.sp=Math.hypot(m.x-ox,m.z-oz)/Math.max(dt,1e-4);
 if(sp>.2&&m.sp<sp*.25){m.stuck+=dt;if(m.stuck>.45){m.stuck=0;m.turn=.7;m.ts=(rand()<.5?-1:1)*1.3;m.pT=0}}else m.stuck=0;
 if(sp>0)m.yaw+=angDiff(m.yaw,Math.atan2(ax,az))*Math.min(1,dt*7);else if(m.st==='chase'||m.st==='stalk')m.yaw+=angDiff(m.yaw,Math.atan2(dx,dz))*Math.min(1,dt*4);
 monFx(dt,Q);
 /* attack */
 if(d<1.3&&(!Q.hide)&&m.st!=='flee'&&m.st!=='idle'){if(Q===P)deathScare();else killRemote()}}
function monFx(dt,Q){const m=MO,dx=Q.x-m.x,dz=Q.z-m.z,d=Math.hypot(dx,dz),dP=Math.hypot(P.x-m.x,P.z-m.z);
 if(!NET.cl){const ci=Math.floor(m.x/CS)+Math.floor(m.z/CS)*LV.W,inTun=LV.ty[ci]===6;m.crawl=(m.st==='search'&&inTun)||(m.st==='stalk'&&d<16)||m.st==='flee'&&rand()<.002?1:m.crawl&&rand()<.995?m.crawl:0}
 const hy=clamp(angDiff(m.yaw,Math.atan2(dx,dz)),-1.4,1.4)*(m.st==='chase'||m.st==='stalk'?1:.2);
 animMonster(MG,dt,{sp:m.sp,crawl:m.crawl,calm:m.st==='patrol',jaw:m.st==='chase'?(.4+.5*Math.max(0,Math.sin(t*3))):m.st==='flee'?1:.08,hyaw:hy,reach:m.st==='chase'&&d<3?1:0,breath:m.st==='chase'?6:2.4});
 MG.position.set(m.x,0,m.z);MG.rotation.y=m.yaw;
 setPan(m.x,1.7,m.z);if(AU.mv){AU.mv.gain.value=1;AU.br.gain.value=m.st==='chase'?.6:m.st==='flee'?.3:.22;AU.gr.gain.value=m.st==='chase'?.35:.05;AU.bf.frequency.value=m.st==='chase'?500:850+Math.sin(t*.8)*200;AU.go.frequency.value=48+Math.sin(t*5)*6}
 m.clkT-=dt;if(m.clkT<=0){m.clkT=2+rand()*5;if(m.st!=='chase')SFX.click()}
 const ws=Math.floor(MG.userData.ph/PI);if(m.sp>.3&&ws!==m.ls){m.ls=ws;if(dP<26)SFX.mstep()}
 if(dP<14&&!P.hide||dP<6){m.hb-=dt;if(m.hb<=0){m.hb=Math.max(.38,dP/14*1.1);SFX.heart(1-dP/16)}}
 if(dP<20){const fx=-Math.sin(P.yaw)*Math.cos(P.pit),fz=-Math.cos(P.yaw)*Math.cos(P.pit);if(-((P.x-m.x)*fx+(P.z-m.z)*fz)/(dP||1)>.82&&los(P.x,P.z,m.x,m.z))P.san-=dt*4*(md.psy||1)}}
/* guest side: monster is simulated by the host; here we only present it (interpolated state arrives in MO) */
function monClient(dt){const m=MO;m.scrT-=dt;if(m.st==='idle'){MG.visible=false;NET.pst='idle';return}MG.visible=true;
 if(m.st==='chase'&&NET.pst!=='chase'&&m.scrT<=0){SFX.scream();m.scrT=9;P.san-=6}NET.pst=m.st;monFx(dt,P.dead&&NET.rp?NET.rp:P)}
let scT=0,sc0=0;
function deathScare(){if(mode!=='play')return;mode='scare';P.dead=1;if(NET.on)nsend('d',{});scT=0;sc0=performance.now();uiOpen=0;try{document.exitPointerLock()}catch(e){}show('hud',0);show('tc',0);show('pn',0);P.hide=0;HAND.visible=false;MG.visible=true;$('vig').classList.remove('h');
 SFX.jump();const f=$('fx');f.style.transition='none';f.style.opacity=.7;setTimeout(()=>{f.style.transition='opacity .6s';f.style.opacity=.35},60);if(navigator.vibrate)try{navigator.vibrate([300,80,500])}catch(e){}}
function scareUpdate(dt){scT=(performance.now()-sc0)/1000;const m=MO,ty=Math.atan2(-(m.x-P.x),-(m.z-P.z));P.yaw+=angDiff(P.yaw,ty)*Math.min(1,dt*16);P.pit+=(.02-P.pit)*Math.min(1,dt*10);
 const sh=scT<1.3?.05:0;cam.position.set(P.x+(rand()-.5)*sh,P.h,P.z+(rand()-.5)*sh);cam.rotation.set(P.pit+(rand()-.5)*sh*.8,P.yaw+(rand()-.5)*sh*.8,(rand()-.5)*sh*1.6);
 const k=Math.min(1,scT/.4),e=1-Math.pow(1-k,3),d=lerp(1.5,.38,e);animMonster(MG,dt,{sp:0,jaw:1,reach:1,hyaw:0,breath:9});MG.userData.jaw.rotation.x=1.05+Math.sin(scT*30)*.08;
 const fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);MG.rotation.y=Math.atan2(-fx,-fz);MG.position.set(0,0,0);MG.updateMatrixWorld(true);const hp=MG.userData.head.getWorldPosition(V3);
 MG.position.set(P.x+fx*d-hp.x,P.h-.08-hp.y,P.z+fz*d-hp.z);bo=scT<1.2?(rand()<.3?.15:1):0;
 MComp.uniforms.ca.value=1.6+Math.sin(scT*40)*.6;MComp.uniforms.dmg.value=Math.min(.8,scT);MComp.uniforms.vg.value=1;
 if(scT>1.25)$('blk').style.opacity=1;if(scT>2){$('blk').style.opacity=0;mode='play';finish(0)}}
function hurt(v){P.hp-=v;P.shk=.6;P.san-=10;const f=$('fx');f.style.transition='none';f.style.opacity=.85;setTimeout(()=>{f.style.transition='opacity .9s';f.style.opacity=0},40);beep(70,.5,'sawtooth',.4,30);if(P.hp<=0)finish(0)}

/* ---------- player update ---------- */
const V3=new THREE.Vector3,V4=new THREE.Vector3;
function play(dt){pt+=dt;const sn=Math.sin(P.yaw),cs=Math.cos(P.yaw);
 let fx=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0)-T.y,sx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0)+T.x;if(uiOpen||NET.paused){fx=0;sx=0}const l=Math.hypot(fx,sx);if(l>1){fx/=l;sx/=l}
 P.moving=l>.1&&!P.hide;if(P.tired&&P.st>30)P.tired=0;
 let water=0;for(const w of LV.water){if(w.tgt!=null){w.lv+=(w.tgt-w.lv)*dt*.25;w.m.position.y=w.lv}if(P.x>w.x0&&P.x<w.x1&&P.z>w.z0&&P.z<w.z1&&w.lv>.15)water=w.lv}P.wet=water;
 const wr=P.moving&&(K.ShiftLeft||K.ShiftRight||T.run)&&!P.crouch&&!P.tired&&P.st>0;P.run=wr;
 const spd=(wr?5.3:P.crouch?1.5:2.8)*(water?.62:1);if(P.moving)move(P,(-sn*fx+cs*sx)*spd*dt,(-cs*fx-sn*sx)*spd*dt,.33);
 P.st=clamp(P.st+(wr?-14:14)*dt,0,100);if(P.st<=0)P.tired=1;
 P.h+=((P.hide?1.45:P.crouch?1:1.65)-P.h)*Math.min(1,dt*9);if(P.moving)P.bob+=dt*(wr?11:P.crouch?5:7.5);
 const stp2=Math.floor(P.bob/PI);if(P.moving&&stp2!==P.ls){P.ls=stp2;SFX.step(wr,water);noiseAt(P.x,P.z,(wr?15:P.crouch?2.2:6.5)*(water?1.8:1))}
 P.shk=Math.max(0,P.shk-dt);
 cam.position.set(P.x+(rand()-.5)*P.shk*.15,P.h+(P.moving?Math.sin(P.bob)*(wr?.06:.035):0),P.z+(rand()-.5)*P.shk*.15);
 const sanK=1-P.san/100;cam.rotation.set(P.pit+Math.sin(t*1.3)*.012*sanK,P.yaw,Math.sin(t*.7)*.02*sanK);
 /* hands */
 HAND.visible=!P.hide;HAND.position.set(.2+Math.cos(P.bob*.5)*(P.moving?.012:0),-.22+Math.abs(Math.sin(P.bob*.5))*(P.moving?.012:0)-(wr?.03:0),-.38);HAND.rotation.set(wr?-.25:0,0,0);
 /* interaction */
 let best=null,bd=9,lab='';const fdx=-sn,fdz=-cs;for(const o of I){if(o.off)continue;const ox=o.x-P.x,oz=o.z-P.z,d=Math.hypot(ox,oz);if(d>o.r||d>=bd)continue;if(d>.9&&(ox*fdx+oz*fdz)/d<.3)continue;const L=o.l();if(!L)continue;best=o;bd=d;lab=L}
 cur=best;if(P.hide)lab='Выйти из шкафа';
 const holding=(K.KeyE||T.act)&&!uiOpen&&!NET.paused;if(cur&&cur.hold&&!P.hide){if(holding){cur.p+=dt;if(cur.ob&&cur.ob.wheel)cur.ob.wheel.rotation.z+=dt*2.5;if((cur.ptick=(cur.ptick||0)-dt)<=0){cur.ptick=.6;cur.ob&&cur.ob.wheel?SFX.valve():noise(80,1,.6,.3,'lowpass');noiseAt(P.x,P.z,cur.ob&&cur.ob.wheel?11:20)}
   if(cur.p>=cur.hold){cur.done()}}show('hold',1);$('hold').firstChild.style.width=clamp(cur.p/cur.hold,0,1)*100+'%'}else show('hold',0);
 $('pr').textContent=lab?(touch?'':(cur&&cur.hold?'[удерживай E] ':'[E] '))+lab:'';$('vig').classList.toggle('h',!!P.hide);
 /* scanning symbols with the flashlight */
 const s=stp();if(s&&s.k==='scan'&&P.light&&P.bat>0){for(const it of s.items){if(it.done)continue;const ox=it.x-P.x,oz=it.z-P.z,d=Math.hypot(ox,oz),dy=1.7-P.h;const dot=(ox*fdx*Math.cos(P.pit)+oz*fdz*Math.cos(P.pit)+dy*Math.sin(P.pit))/Math.hypot(d,dy);
  if(d<8&&dot>.94&&los(P.x,P.z,it.x-(ox/d)*.3,it.z-(oz/d)*.3)){it.p+=dt;$('pr').textContent='Изучаю знак…';if(it.p>1.3)scanMark(s,it,0)}}}
 /* exits */
 if(exitO){exitO.lv[0].position.x+=((exitO.open?-1.5:-.55)-exitO.lv[0].position.x)*dt*1.5;exitO.lv[1].position.x+=((exitO.open?1.5:.55)-exitO.lv[1].position.x)*dt*1.5;exitO.gl.material.opacity=exitO.open?.6+Math.sin(t*3)*.1:0;
  if(exitO.open&&s&&(s.k==='exit'||s.k==='escape')&&Math.hypot(P.x-exitO.x,P.z-exitO.z)<1.8){if(s.fake){msg(s.fake);s.fake=0;exitO.open=0;placeExit(1);exitO.open=1;if(s.ev)event(s.ev);s.ev=0;OB=[{x:exitO.x,z:exitO.z,obj:1,exit:1}];$('obj').innerHTML='<b>'+(mi+1)+'. '+md.n.toUpperCase()+'</b>'+'Найди другой путь'}else done()}}
 if(annexDoor&&annexDoor.open){annexDoor.lf.position.y+=(3.6-annexDoor.lf.position.y)*dt*1.2}
 /* survive timer */
 if(s&&s.k==='survive'){s.p-=dt;$('obj').innerHTML='<b>'+(mi+1)+'. '+md.n.toUpperCase()+'</b>'+s.t+' — '+Math.ceil(Math.max(0,s.p))+' с';if(s.p<=0)done()}
 /* flashlight & battery */
 if(P.light){P.bat-=dt*.45;if(P.bat<=0){P.bat=0;P.light=false;msg('Батарея села. Найди запасную')}}
 fl.intensity=P.light?(P.bat<15&&rand()<.15?.35:2.4):0;fl.color.setHex(P.uvT>.05?0xa070ff:0xeaf2ff);flCone.visible=P.light&&Q[sv.q].vol;flCone.material.uniforms.o.value=P.bat<15?.015:.03;HAND.userData.lens.material.color.setHex(P.light?(P.uvT>.05?0xb080ff:0xfff6e0):0x222222);
 /* sanity */
 let nearL=0;for(const lp of LP.lights)if(lp.intensity>.3&&lp.position.distanceTo(cam.position)<6)nearL=1;
 const psy=md.psy||1;P.san+=dt*((P.light||nearL)?(nearL?1.4:.25):-1.3*psy);if(P.hide)P.san+=dt*.4;P.san=clamp(P.san,0,100);if(P.san<=0){P.hp-=dt*2.5;if(P.hp<=0)finish(0)}
 phantoms(dt);
 for(const o of I)if(o.m&&!o.off&&o.bob){o.m.position.y=o.y+Math.sin(t*2+o.x)*.04;o.m.rotation.y+=dt}
 if(NET.cl)monClient(dt);else monUpdate(dt);if(mode!=='play')return;
 /* ambient events */
 evT-=dt;if(evT<=0){evT=25+rand()*35;if(!NET.cl){const e=rand()*6|0;if(NET.on)nsend('ev',{e});ambient(e)}}
 if(rand()<dt*.15&&(LV.ty[Math.floor(P.x/CS)+Math.floor(P.z/CS)*LV.W]===6||P.wet))SFX.drip();
 /* HUD */
 $('hp').style.width=clamp(P.hp,0,100)+'%';$('st').style.width=P.st+'%';$('bt').style.width=P.bat+'%';$('sn').style.width=P.san+'%';
 const mn=(md.clock||227)+(pt/9|0);$('clk').textContent=String(mn/60%24|0).padStart(2,'0')+':'+String(mn%60).padStart(2,'0');
 let iv='Батареи '+inv.bat+'  Аптечки '+inv.med;for(const k in inv.it)if(inv.it[k])iv+='  '+cap(ITEMS[k].n)+' ×'+inv.it[k];if(inv.key)iv+='  Ключ-карта';if(inv.uv)iv+='  УФ';if(NET.on)iv+='  Пинг '+NET.ping+' мс';$('iv').textContent=iv;
 /* objective arrow */
 const tg=OB.filter(o=>!o.off&&!o.done);let ta=null,tdd=1e9;for(const o of tg){const d=Math.hypot(o.x-P.x,o.z-P.z);if(d<tdd){tdd=d;ta=o}}
 if(ta&&sv.hint){show('arr',1);const a=angDiff(P.yaw,Math.atan2(-(ta.x-P.x),-(ta.z-P.z)));$('arr').firstChild.style.transform='rotate('+(-a)+'rad)';$('arr').lastChild.textContent=Math.round(tdd)+' м'}else show('arr',0);
 /* post-fx feedback */
 const U=MComp.uniforms;U.ca.value=Math.pow(sanK,2)*1.4+P.shk*.6+(P.uvT>0?.3:0);U.dmg.value=Math.max(0,(40-P.hp)/80);U.vg.value=.55+sanK*.4;U.gr.value=.035+sanK*.04}
function phantoms(dt){if(!PHM)return;const sanK=1-P.san/100;phan.boost=Math.max(0,(phan.boost||0)-dt);const want=sanK>.45||phan.boost>0;
 if(phan.on){phan.life-=dt;const dx=PHM.position.x-P.x,dz=PHM.position.z-P.z,d=Math.hypot(dx,dz),looks=(dx*-Math.sin(P.yaw)+dz*-Math.cos(P.yaw))/d>.9;if(looks)phan.look+=dt;
  PHM.rotation.y=Math.atan2(-dx,-dz);animMonster(PHM,dt,{sp:0,calm:1,jaw:.3,hyaw:0});
  if(d<7||phan.life<=0||phan.look>.9){PHM.visible=false;phan.on=0;SFX.whisper();P.san-=5}}
 else if(want){phan.t-=dt;if(phan.t<=0){phan.t=6+rand()*10;const fx=-Math.sin(P.yaw),fz=-Math.cos(P.yaw);for(let k=0;k<40;k++){const s=LV.spots[rand()*LV.spots.length|0],x=wx(s[0])+(rand()-.5),z=wx(s[1])+(rand()-.5),dx=x-P.x,dz=z-P.z,d=Math.hypot(dx,dz);
   if(d>11&&d<24&&(dx*fx+dz*fz)/d>.75&&los(P.x,P.z,x,z)&&Math.hypot(x-MO.x,z-MO.z)>8){PHM.position.set(x,0,z);PHM.visible=true;phan.on=1;phan.life=1.5+rand()*2;phan.look=0;break}}
   if(!phan.on&&rand()<.5){noise(120,1,.15,.35,'lowpass');setTimeout(()=>noise(120,1,.15,.3,'lowpass'),380)}}}}

/* ---------- lights, particles, culling ---------- */
const LT=new THREE.Vector3;
function lights(dt){const cp=cam.position;boT-=dt;if(boT<=0&&bo<1)bo=Math.min(1,bo+dt*1.6);
 const arr=[];for(const l of LP.lamps){const d=l.p.distanceToSquared(cp);let k=l.on;if(l.fl===1)k*=.8+.2*Math.sin(t*(9+l.ph))*Math.sin(t*(2.3+l.ph))-(rand()<.03?.7:0);if(l.fl===2)k*=(rand()<.04?1:0)+.05;
  k=Math.max(0,k)*bo*(md&&mode==='play'?1:1);l.k=k;l.s.material.opacity=(l.fl===2?.3:.4)*k;if(l.cone)l.cone.visible=k>.2;if(d<1600)arr.push([d,l])}
 arr.sort((a,b)=>a[0]-b[0]);LP.lights.forEach((L,i)=>{const e=arr[i];if(e){const l=e[1];L.position.copy(l.p);L.color.copy(l.c);L.intensity=l.i*l.k*(l.fl===2?2.5:1)}else L.intensity=0});
 hemi.intensity=.12+.1*bo}
function sparks(dt){if(!SP)return;const a=SP.geometry.attributes.position,v=SP.userData.v,life=SP.userData.l;
 for(const l of(LV?LV.sparks:[])){if(l.p.distanceTo(cam.position)<26&&rand()<dt*.6){SFX.spark();l.s.material.opacity=1;let n=0;for(let i=0;i<v.length/3&&n<18;i++)if(life[i]<=0){life[i]=.6+rand()*.6;a.setXYZ(i,l.p.x,l.p.y,l.p.z);v[i*3]=(rand()-.5)*3;v[i*3+1]=rand()*1.5;v[i*3+2]=(rand()-.5)*3;n++}}}
 for(let i=0;i<life.length;i++){if(life[i]>0){life[i]-=dt;v[i*3+1]-=9.8*dt;let x=a.getX(i)+v[i*3]*dt,y=a.getY(i)+v[i*3+1]*dt,z=a.getZ(i)+v[i*3+2]*dt;if(y<.02){y=.02;v[i*3+1]*=-.3;v[i*3]*=.6;v[i*3+2]*=.6}a.setXYZ(i,x,y,z)}else a.setY(i,-99)}a.needsUpdate=true}
let cullT=0;function cull(dt){if(!LV)return;cullT-=dt;if(cullT>0)return;cullT=.25;const f=Q[sv.q].far+CS*CHK*.7,cp=cam.position;for(const m of LV.cull){const c=m.userData.c;m.visible=!c||Math.hypot(c[0]-cp.x,c[1]-cp.z)<f}
 cam.far=Q[sv.q].far+6;cam.updateProjectionMatrix()}
/* camera-local dust lit by the flashlight */
function buildDust(){const n=2400,g=new THREE.BufferGeometry(),p=new Float32Array(n*3),r=new Float32Array(n);for(let i=0;i<n;i++){p[i*3]=rand()*24;p[i*3+1]=rand()*6;p[i*3+2]=rand()*24;r[i]=rand()}
 g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('rnd',new THREE.BufferAttribute(r,1));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{cp:{value:new THREE.Vector3()},cd:{value:new THREE.Vector3()},tm:{value:0},li:{value:1},pr:{value:1}},
  vertexShader:`attribute float rnd;uniform vec3 cp,cd;uniform float tm,li,pr;varying float a;void main(){vec3 p=position+vec3(sin(tm*.1+rnd*20.)*.6,-tm*.05*(.3+rnd),cos(tm*.08+rnd*9.)*.6);
   p.xz=mod(p.xz-cp.xz+12.,24.)-12.+cp.xz;p.y=mod(p.y,6.);vec3 d=p-cp;float l=length(d);float beam=smoothstep(.86,.97,dot(d/l,cd))*li*smoothstep(14.,1.,l);a=(.05+beam*.8)*smoothstep(.3,1.,l);
   vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(1.+rnd*1.5)*pr*3.5/-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:'varying float a;void main(){vec2 c=gl_PointCoord-.5;float f=smoothstep(.5,0.,length(c));gl_FragColor=vec4(vec3(.85,.88,.9)*a*f,1.);}'});
 dust=new THREE.Points(g,m);dust.frustumCulled=false;S.add(dust)}
function buildSparks(){const n=200,g=new THREE.BufferGeometry(),p=new Float32Array(n*3).fill(-99);g.setAttribute('position',new THREE.BufferAttribute(p,3));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);
 SP=new THREE.Points(g,new THREE.PointsMaterial({color:0xffb050,size:.05,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));SP.userData={v:new Float32Array(n*3),l:new Float32Array(n)};SP.frustumCulled=false;S.add(SP)}

/* ---------- UI: notes, keypad, panels ---------- */
function note(ti,x,cb){if(NET.remote){cb&&cb();return}uiOpen=1;$('pc').dataset.owner='n';try{document.exitPointerLock()}catch(e){}show('pn',1);$('pc').onclick=null;$('pc').innerHTML='<h2>'+ti+'</h2><div class="note">'+x+'</div><button id="nx">Закрыть</button>';SFX.pick();
 $('nx').onclick=()=>{show('pn',0);uiOpen=0;relock();if(cb)cb()}}
function keypad(cb){uiOpen=1;$('pc').dataset.owner='n';try{document.exitPointerLock()}catch(e){}show('pn',1);let v='';const c=$('pc');c.innerHTML='<h2>Пульт</h2><div id="kd">____</div><div id="kp">'+[1,2,3,4,5,6,7,8,9,'⌫',0,'OK'].map(k=>'<button data-v="'+k+'">'+k+'</button>').join('')+'</div><button data-v="x">Отмена</button>';
 const upd=()=>$('kd').textContent=(v+'____').slice(0,4);c.onclick=e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.v;if(k===undefined)return;beep(900,.05,'square',.08);
  if(k==='x'){show('pn',0);uiOpen=0;relock();return}if(k==='⌫')v=v.slice(0,-1);else if(k==='OK'){show('pn',0);uiOpen=0;relock();cb(v===code);return}else if(v.length<4)v+=k;upd()}}
function relock(){if(mode==='play'&&!touch)try{const q=R.domElement.requestPointerLock();q&&q.catch&&q.catch(()=>{})}catch(e){}}
function panel(k){show('pn',1);const c=$('pc');c.onclick=null;c.dataset.owner=k;if(k==='o'||k==='f')return panelNet(k);let h='';
 if(k==='s')h='<h2>Скины</h2><p>Монеты: '+sv.coins+'</p>'+SK.map((s,i)=>'<button data-s="'+i+'">'+s.n+(sv.own.includes(i)?(sv.skin===i?' — выбран':''):' — '+s.c+' монет')+'</button>').join('')+'<p id="pm"></p>';
 else if(k==='g')h='<h2>Настройки</h2><h3>Графика</h3>'+Q.map((q,i)=>'<button data-q="'+i+'">'+q.n+(sv.q===i?' — выбрано':'')+'</button>').join('')+
  '<label>Чувствительность обзора <input type="range" id="sS" min="30" max="250" value="'+(sv.sens*100|0)+'"></label><label>Громкость <input type="range" id="sV" min="0" max="100" value="'+(sv.vol*100|0)+'"></label>'+
  '<button data-h="1">Указатель цели: '+(sv.hint?'вкл':'выкл')+'</button><h3>Управление</h3><button data-ed="1">Редактор кнопок</button><p>Перемещай кнопки пальцем, меняй размер и прозрачность. Раскладка сохраняется.</p>';
 else if(k==='c'){h='<h2>Кампания</h2><p>Пройдено миссий: '+Object.keys(sv.done).length+'/24 · Документы: '+sv.lore.length+'/24</p><button data-m="'+Math.min(sv.prog,23)+'">Продолжить: '+(Math.min(sv.prog,23)+1)+'. '+MS[Math.min(sv.prog,23)].n+'</button>';
  for(let c2=0;c2<4;c2++){h+='<h3>Глава '+(c2+1)+'. '+CH[c2]+'</h3><div class="ms">';for(let j=0;j<6;j++){const i=c2*6+j;h+='<button data-m="'+i+'"'+(i>sv.prog?' disabled':'')+(sv.done[i]?' class="dn"':'')+'>'+(i+1)+'. '+MS[i].n+(i>sv.prog?' 🔒':'')+'</button>'}h+='</div>'}}
 else h='<h2>Онлайн</h2><p>Кооператив на двоих (комната, шестизначный код, синхронизация) работает через Supabase Realtime и требует URL и публичный ключ вашего проекта. Их у меня нет, поэтому режим не включён и выдуманных данных здесь нет.</p>';
 c.innerHTML=h+'<button data-x="1">Назад</button>';
 const sS=$('sS'),sV=$('sV');if(sS)sS.oninput=()=>{sv.sens=sS.value/100;put()};if(sV)sV.oninput=()=>{sv.vol=sV.value/100;if(AU.m)AU.m.gain.value=sv.vol;put()};
 c.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;if(d.x)return show('pn',0);
  if(d.q!==undefined){sv.q=+d.q;put();applyQ();return panel('g')}if(d.h){sv.hint=sv.hint?0:1;put();return panel('g')}if(d.ed){show('pn',0);return editor(1)}
  if(d.m!==undefined){show('pn',0);return loading(()=>startMission(+d.m))}
  if(d.s!==undefined){const i=+d.s,s=SK[i];if(!sv.own.includes(i)){if(sv.coins<s.c){$('pm').textContent='Не хватает монет: нужно '+s.c;return}sv.coins-=s.c;sv.own.push(i)}setSkin(i);$('cn').textContent='Монеты: '+sv.coins;panel('s')}}}
function loading(fn){show('load',1);$('lt').textContent='Подготовка уровня…';$('lb').style.width='100%';setTimeout(()=>{try{fn()}finally{show('load',0)}},60)}
function pause(on){if(NET.on&&(mode==='play'||mode==='spec')){if(on){if(uiOpen)return;NET.paused=1;try{document.exitPointerLock()}catch(e){}show('pause',1);
  $('pac').innerHTML='<h2>Меню</h2><p>Кооператив: игра продолжается, монстр не ждёт.</p><button id="pR">Продолжить</button><button id="pG">Настройки</button><button id="pM">Покинуть игру</button>';
  $('pR').onclick=()=>pause(0);$('pG').onclick=()=>panel('g');$('pM').onclick=()=>{show('pause',0);toMenu()}}
  else{NET.paused=0;show('pause',0);show('pn',0);relock()}return}
 if(mode!=='play'&&mode!=='pause')return;if(on){if(uiOpen)return;mode='pause';try{document.exitPointerLock()}catch(e){}show('pause',1);
  $('pac').innerHTML='<h2>Пауза</h2><p>'+(mi+1)+'. '+md.n+'</p><button id="pR">Продолжить</button><button id="pG">Настройки</button><button id="pRs">Начать миссию заново</button><button id="pM">Выйти в меню</button>';
  $('pR').onclick=()=>pause(0);$('pG').onclick=()=>panel('g');$('pRs').onclick=()=>{show('pause',0);loading(()=>startMission(mi))};$('pM').onclick=()=>{show('pause',0);toMenu()}}
 else{show('pause',0);show('pn',0);mode='play';relock()}}

/* ---------- end of mission ---------- */
function finish(win){if(mode!=='play'&&mode!=='pause'&&mode!=='spec')return;
 if(!win&&NET.on&&NET.rp&&!NET.rp.dead&&!P.specd){P.dead=1;P.specd=1;nsend('d',{});enterSpec();return}
 const co=NET.room&&NET.ingame,host=NET.host;mode='end';NET.on=0;NET.cl=0;NET.ingame=0;NET.paused=0;if(NET.av){S.remove(NET.av.root);NET.av=null}$('pb').classList.add('hide');
 try{document.exitPointerLock()}catch(e){}show('hud',0);show('tc',0);show('pn',0);show('pause',0);uiOpen=0;$('blk').style.opacity=0;
 let ti,tx,r;const last=mi===MS.length-1;
 if(!win){[ti,tx]=END.dead;r=si*10}else{r=60+(mi/6|0)*25+(sv.done[mi]?0:40);sv.done[mi]=1;sv.prog=Math.max(sv.prog,Math.min(23,mi+1));
  if(last){const k=sv.lore.length>=18?'truth':'free';[ti,tx]=END[k];r+=200;if(k==='truth')r+=100}else{ti='Миссия пройдена: '+md.n;tx=md.out}}
 sv.coins+=r;put();
 let bt;if(co&&!host)bt='<p>Хост выберет следующую миссию. Вы остаётесь в комнате.</p><button id="eL">В лобби</button>';
 else if(co)bt=(win&&!last?'<button id="eN">Следующая миссия (вместе)</button>':'')+'<button id="eR">'+(win?'Переиграть':'Ещё раз')+'</button><button id="eL">В лобби</button>';
 else bt=(win&&!last?'<button id="eN">Следующая миссия</button>':'')+'<button id="eR">'+(win?'Переиграть':'Ещё раз')+'</button>';
 $('ec').innerHTML='<h2>'+ti+'</h2><p>'+tx+'</p><p>Награда: '+r+' монет. Всего: '+sv.coins+'</p>'+bt+'<button id="eM">В меню</button>';show('end',1);
 if(co){if($('eN'))$('eN').onclick=()=>{NET.mis=Math.min(23,mi+1);netStartFromEnd()};if($('eR'))$('eR').onclick=()=>{NET.mis=mi;netStartFromEnd()};if($('eL'))$('eL').onclick=()=>{toMenu();panel('o')}}
 else{if($('eN'))$('eN').onclick=()=>loading(()=>startMission(mi+1));$('eR').onclick=()=>loading(()=>startMission(mi))}
 $('eM').onclick=toMenu;showInv()}
function netStartFromEnd(){if(!partner()){$('ec').insertAdjacentHTML('afterbegin','<p style="color:#e88">Напарник вышел из комнаты.</p>');return}netHostStart()}
const MENU_MD={seed:7,w:18,h:9,main:'hall',rooms:['office'],loops:0,sign:'НУЛЕВАЯ',mon:{d:1e9,sp:1},steps:[]};
function toMenu(){if(NET.ingame||NET.on){netExitGame();roomLeave()}mode='menu';show('menu',1);show('hud',0);show('tc',0);show('end',0);show('pn',0);show('pause',0);editor(0);try{document.exitPointerLock()}catch(e){}
 clearLevel();md=MENU_MD;const L=buildLevel(MENU_MD);const hall=L.rooms[0];MG.visible=false;if(PHM)PHM.visible=false;
 const hx=(hall.x+4)*CS,hz=(hall.y+2.2)*CS;if(hum){hum.visible=true;hum.position.set(hx,0,hz);hum.rotation.y=0}S_ENV.menu=[hx,hz];
 S.add(fl);fl.position.set(hx-3,3.4,hz+4.5);fl.target.position.set(hx,.9,hz);S.add(fl.target);fl.intensity=4.5;fl.angle=.6;fl.penumbra=.7;fl.distance=20;fl.color.setHex(0xffe2c0);HAND.visible=false;flCone.visible=false;
 cam.fov=42;cam.updateProjectionMatrix();$('cn').textContent='Монеты: '+sv.coins;$('vig').classList.remove('h');S.fog.density=.03;MComp.uniforms.ca.value=0;MComp.uniforms.dmg.value=0;MComp.uniforms.vg.value=.55;showInv()}
function menuCam(){const[hx,hz]=S_ENV.menu||[0,0];if(hum)hum.rotation.y=PI+Math.sin(t*.35)*.3;cam.position.set(hx+Math.sin(t*.2)*.25,1.25,hz+3.9);cam.lookAt(hx-(innerWidth>innerHeight?1.1:0),.95,hz);cam.rotation.order='YXZ'}

/* ---------- quality & resize, adaptive resolution ---------- */
let dyn=1,ftAcc=0,ftN=0,ftT=0;
function resize(){const q=Q[sv.q];R.setPixelRatio(Math.min(devicePixelRatio||1,q.pr)*dyn);R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();if(PP.main)ppSize();
 if(dust)dust.material.uniforms.pr.value=R.getPixelRatio();applyLayout()}
function applyQ(){const q=Q[sv.q];fl.castShadow=q.sh>0;if(q.sh){fl.shadow.mapSize.set(q.sh,q.sh);if(fl.shadow.map){fl.shadow.map.dispose();fl.shadow.map=null}}fl.shadow.camera.near=.2;fl.shadow.camera.far=30;fl.shadow.bias=-.0005;
 R.toneMapping=q.post?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.3;R.outputEncoding=q.post?THREE.LinearEncoding:THREE.sRGBEncoding;
 if(IMG._tx!==q.tx){IMG._tx=q.tx;buildWorldTex(q.tx)}lightPool(q.pl);dust.geometry.setDrawRange(0,q.du);dust.visible=q.du>0;dyn=1;resize();
 S.traverse(o=>{if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.needsUpdate=true)}})}
function adapt(dt){if(mode!=='play')return;ftAcc+=dt;ftN++;ftT+=dt;if(ftT<2.5)return;const avg=ftAcc/ftN;ftAcc=ftN=ftT=0;
 if(avg>.026&&dyn>.55){dyn=Math.max(.55,dyn*.85);resize()}else if(avg<.0155&&dyn<1){dyn=Math.min(1,dyn*1.1);resize()}}
addEventListener('resize',resize);

/* ---------- touch layout editor ---------- */
let edSel=null;
function applyLayout(){const L=sv.lay||{};document.querySelectorAll('#tc button').forEach(b=>{const k=b.dataset.k,o=L[k];if(!b.dataset.css)b.dataset.css=b.getAttribute('style');
 if(o){b.setAttribute('style','left:'+o.x+'%;top:'+o.y+'%;width:'+o.s+'px;height:'+o.s+'px;margin:0;opacity:'+o.o+';font-size:'+Math.max(10,o.s/5.2)+'px')}else{b.setAttribute('style',b.dataset.css)}})}
function editor(on){const tc=$('tc');tc.classList.toggle('ed',!!on);show('edc',on);if(on){show('tc',1);show('menu',0);edSel=null;$('edn').textContent='Выбери кнопку'}else{tc.classList.remove('ed');if(mode!=='play')show('tc',0);if(mode==='menu')show('menu',1);document.querySelectorAll('#tc button').forEach(b=>b.classList.remove('sel'))}}
function edState(b){const r=b.getBoundingClientRect();return{x:r.left/innerWidth*100,y:r.top/innerHeight*100,s:r.width,o:+getComputedStyle(b).opacity||.8}}
(()=>{let drag=null;document.querySelectorAll('#tc button').forEach(b=>{b.addEventListener('pointerdown',e=>{if(!$('tc').classList.contains('ed'))return;e.preventDefault();e.stopPropagation();
  document.querySelectorAll('#tc button').forEach(q=>q.classList.remove('sel'));b.classList.add('sel');edSel=b;const st=edState(b);sv.lay=sv.lay||{};sv.lay[b.dataset.k]=st;applyLayout();
  $('edn').textContent=b.textContent;$('eds').value=st.s;$('edo').value=st.o*100;drag={b,ox:e.clientX,oy:e.clientY,sx:st.x,sy:st.y};try{b.setPointerCapture(e.pointerId)}catch(_){}});
 b.addEventListener('pointermove',e=>{if(!drag||drag.b!==b)return;const o=sv.lay[b.dataset.k];o.x=clamp(drag.sx+(e.clientX-drag.ox)/innerWidth*100,0,96);o.y=clamp(drag.sy+(e.clientY-drag.oy)/innerHeight*100,0,94);applyLayout()});
 b.addEventListener('pointerup',()=>{drag=null})});
 $('eds').oninput=()=>{if(!edSel)return;sv.lay[edSel.dataset.k].s=+$('eds').value;applyLayout()};$('edo').oninput=()=>{if(!edSel)return;sv.lay[edSel.dataset.k].o=$('edo').value/100;applyLayout()};
 $('edr').onclick=()=>{sv.lay=null;put();applyLayout()};$('edx').onclick=()=>{put();editor(0);msg('Раскладка сохранена')}})();

/* ---------- input ---------- */
const act=()=>{if(P.hide)P.lk.f();else if(cur&&!cur.hold)cur.f()},tog=()=>{if(P.bat>0){P.light=!P.light;beep(1800,.03,'square',.05)}},crch=()=>{if(!P.hide)P.crouch=!P.crouch};
const useB=()=>{if(inv.bat<1)return msg('Нет запасных батарей');if(P.bat>70)return msg('Батарея ещё заряжена');inv.bat--;P.bat=100;P.light=true;msg('Батарея заменена')};
const useM=()=>{if(inv.med<1)return msg('Нет аптечек');if(P.hp>=100)return msg('Ты здоров');inv.med--;P.hp=Math.min(100,P.hp+50);P.san=Math.min(100,P.san+15);msg('Аптечка использована')};
addEventListener('keydown',e=>{if(e.repeat&&e.code!=='KeyE')return;K[e.code]=1;if(e.code==='Escape'||e.code==='KeyP'){if(NET.on&&(mode==='play'||mode==='spec')){NET.paused?pause(0):pause(1);return}if(mode==='play')pause(1);else if(mode==='pause')pause(0);return}
 if(mode!=='play'||uiOpen)return;if(e.code==='KeyE'&&!e.repeat)act();if(e.code==='KeyF')tog();if(e.code==='KeyC'||e.code==='ControlLeft')crch();if(e.code==='KeyQ'||e.code==='KeyR')useB();if(e.code==='KeyH')useM()});
addEventListener('keyup',e=>{K[e.code]=0});addEventListener('blur',()=>{K={}});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&mode==='play'&&!uiOpen&&!touch)pause(1)});
addEventListener('mousemove',e=>{if(mode==='spec'&&(e.buttons&1))NET.specA-=e.movementX*.004;if(mode==='play'&&!uiOpen&&!NET.paused&&(document.pointerLockElement||e.buttons&1)){const k=.0022*sv.sens;P.yaw-=e.movementX*k;P.pit=clamp(P.pit-e.movementY*k,-1.4,1.4)}});
R.domElement.addEventListener('click',()=>{if(mode==='play'&&!touch&&!uiOpen)try{const q=R.domElement.requestPointerLock();q&&q.catch&&q.catch(()=>{})}catch(e){}});
addEventListener('touchstart',e=>{if(mode!=='play'||uiOpen||$('tc').classList.contains('ed'))return;for(const q of e.changedTouches){if(q.target.closest&&q.target.closest('button'))continue;
 if(q.clientX<innerWidth*.45&&T.j==null){T.j=q.identifier;T.ox=q.clientX;T.oy=q.clientY;const j=$('jr');j.style.display='block';j.style.left=q.clientX+'px';j.style.top=q.clientY+'px'}
 else if(T.l==null){T.l=q.identifier;T.lx=q.clientX;T.ly=q.clientY}}if(e.target===R.domElement||e.target.id==='tc')e.preventDefault()},{passive:false});
addEventListener('touchmove',e=>{if(mode!=='play')return;for(const q of e.changedTouches){
 if(q.identifier===T.j){let dx=(q.clientX-T.ox)/50,dy=(q.clientY-T.oy)/50;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}T.x=Math.abs(dx)<.12?0:dx;T.y=Math.abs(dy)<.12?0:dy;$('kn').style.transform='translate('+dx*34+'px,'+dy*34+'px)'}
 else if(q.identifier===T.l){const k=.006*sv.sens;P.yaw-=(q.clientX-T.lx)*k;P.pit=clamp(P.pit-(q.clientY-T.ly)*k,-1.4,1.4);T.lx=q.clientX;T.ly=q.clientY}}if(!e.target.closest||!e.target.closest('.card'))e.preventDefault()},{passive:false});
let spd=null;addEventListener('touchstart',e=>{if(mode==='spec'&&!(e.target.closest&&e.target.closest('button')))spd=e.touches[0].clientX},{passive:true});
addEventListener('touchmove',e=>{if(mode==='spec'&&spd!=null){const x=e.touches[0].clientX;NET.specA-=(x-spd)*.008;spd=x}},{passive:true});
const tend=e=>{spd=null;for(const q of e.changedTouches){if(q.identifier===T.j){T.j=null;T.x=T.y=0;$('jr').style.display='none';$('kn').style.transform=''}if(q.identifier===T.l)T.l=null}};
addEventListener('touchend',tend);addEventListener('touchcancel',tend);
document.querySelectorAll('#tc button').forEach(b=>{const k=b.dataset.k,up=()=>{if(k==='run')T.run=0;if(k==='e')T.act=0};
 b.addEventListener('pointerdown',e=>{if($('tc').classList.contains('ed'))return;e.preventDefault();if(k==='p'){mode==='play'?pause(1):0;return}if(mode!=='play'||uiOpen)return;if(k==='run')T.run=1;else if(k==='e'){T.act=1;act()}else if(k==='f')tog();else if(k==='c')crch();else if(k==='b')useB();else if(k==='m')useM()});
 b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up)});
$('bP').onclick=()=>{audio();panel('c')};$('bO').onclick=()=>panel('o');$('bF').onclick=()=>panel('f');$('bS').onclick=()=>panel('s');$('bG').onclick=()=>panel('g');
$('ht').textContent=touch?'Левая часть экрана: движение. Правая: поворот камеры. Кнопки настраиваются в «Настройки → Редактор кнопок».':'WASD ходьба, Shift бег, C присесть, F фонарь, E действие (удерживай для долгих), Q батарея, H аптечка, Esc пауза.';

/* ---------- main loop ---------- */
const clk=new THREE.Clock();
function loop(){requestAnimationFrame(loop);const dt=Math.min(clk.getDelta(),.05);t+=dt;
 if(NET.on&&(mode==='play'||mode==='scare'||mode==='spec'))netUpdate(dt);
 if(mode==='play'&&(!uiOpen||NET.on))play(dt);else if(mode==='scare')scareUpdate(dt);else if(mode==='spec')specTick(dt);else if(mode==='menu'){menuCam();if(humMix)humMix.update(dt)}
 if(LV){lights(dt);sparks(dt);cull(dt);if(WATER&&WATER.normalMap){WATER.normalMap.offset.x=t*.02;WATER.normalMap.offset.y=t*.013}}
 if(dust){const u=dust.material.uniforms;u.tm.value=t;u.cp.value.copy(cam.position);cam.getWorldDirection(u.cd.value);u.li.value=mode==='play'&&P.light?1:.15}
 setListener();adapt(dt);render()}

/* ---------- boot: decode embedded assets, build everything ---------- */
async function boot(){const A=window.ASSETS||{tex:{},glb:{}},names=Object.keys(A.tex),gl=Object.keys(A.glb);let n=0;const tot=names.length*3+gl.length,step=()=>{n++;$('lb').style.width=(n/tot*100)+'%'};
 await Promise.all(names.map(async k=>{const e=A.tex[k];IMG[k]={};await Promise.all(['d','n','a'].map(async q=>{if(e[q])IMG[k][q]=await loadImg(e[q]);step()}))}));
 if(window.MeshoptDecoder&&THREE.GLTFLoader){const L=new THREE.GLTFLoader();L.setMeshoptDecoder(MeshoptDecoder);try{await MeshoptDecoder.ready}catch(e){}
  for(const k of gl){try{const g=await new Promise((res,rej)=>L.parse(b64ab(A.glb[k]),'',res,rej));GLB[k]=g;if(k!=='Soldier')prepModel(k,g)}catch(e){console.warn('glb',k,e)}step();await new Promise(r=>setTimeout(r,0))}}
 $('lt').textContent='Сборка сцены…';await new Promise(r=>setTimeout(r,20));
 ppSetup();S.environment=buildEnv();hemi=new THREE.HemisphereLight(0x7a93ad,0x2a221a,.35);S.add(hemi);
 fl=new THREE.SpotLight(0xeaf2ff,2.4,32,.5,.6,1.4);fl.shadow.bias=-.0005;
 flCone=new THREE.Mesh(new THREE.CylinderGeometry(.04,2.6,10,20,1,true),VOLM.clone());flCone.material.uniforms.c.value=new THREE.Color(0xeaf2ff);flCone.geometry.translate(0,-5,0);flCone.geometry.rotateX(PI/2);flCone.position.set(.2,-.2,-.5);flCone.rotation.x=.03;
 cam.add(flCone);
 MG=buildMonster(0);MG.visible=false;S.add(MG);PHM=buildMonster(1);PHM.visible=false;S.add(PHM);buildHands();buildHuman();buildDust();buildSparks();
 for(const k in M){if(M[k]&&M[k].isMeshStandardMaterial)M[k].envMapIntensity=.45}
 applyQ();show('load',0);toMenu();R.compile(S,cam)}
boot().catch(e=>{console.error(e);$('lt').textContent='Ошибка загрузки: '+e.message});loop();
