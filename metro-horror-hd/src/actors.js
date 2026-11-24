/* =====================================================================
   actors: monster model & animation, phantom, hands, menu character, audio
   ===================================================================== */
const n3=(x,y,z,s)=>Math.sin(x*1.7+s)*Math.sin(y*2.3+s*2.1)*Math.sin(z*1.9+s*3.7)+.5*Math.sin(x*4.1+s*.7)*Math.sin(y*3.7+s)*Math.sin(z*4.3+s*1.3);
function deform(g,amp,f,seed){const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),d=amp*n3(x*f,y*f,z*f,seed);p.setXYZ(i,x+n.getX(i)*d,y+n.getY(i)*d,z+n.getZ(i)*d)}g.computeVertexNormals();return g}
function limbGeo(r0,r1,len,knob,seed){const g=new THREE.CylinderGeometry(r1,r0,len,12,8);g.translate(0,-len/2,0);const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const y=-p.getY(i)/len,x=p.getX(i),z=p.getZ(i),k=1+knob*Math.exp(-Math.pow((y-.06)*9,2))+knob*.7*Math.exp(-Math.pow((y-.94)*9,2))-.12*Math.sin(y*PI);p.setXYZ(i,x*k,p.getY(i),z*k*(.85+.15*Math.sin(y*6+seed)))}
 g.computeVertexNormals();return deform(g,.008,18,seed)}
/* monster skin: wet, veined, bruised (original palette 0x9a9c94 / 0x1b1514 / red eyes) */
let SKIN=null,SKD=null;
function monsterMats(){if(SKIN)return;const h=noiseCanvas(256,6,31,(v,x,y)=>{const rg=1-Math.abs(2*v-1),q=Math.pow(rg,6)*255;return[q,q,q]});
 const col=noiseCanvas(256,5,11,v=>{const b=v>.62?(v-.62)*2.2:0;return[154-40*b+v*30-15,156-70*b+v*26-13,148-60*b+v*24-12]});
 SKIN=new THREE.MeshPhysicalMaterial({color:0xffffff,map:ctex(col,1,1),normalMap:ctex(h2n(h,5),0,1),normalScale:new THREE.Vector2(.8,.8),roughness:.42,clearcoat:.55,clearcoatRoughness:.35,emissive:0x140505});
 SKIN.map.repeat.set(2,2);SKIN.normalMap.repeat.set(2,2);SKD=new THREE.MeshStandardMaterial({color:0x1b1514,roughness:.85})}
function buildMonster(phantom){monsterMats();const sk=phantom?new THREE.MeshBasicMaterial({color:0x020203,transparent:true,opacity:.92,fog:true}):SKIN,dk=phantom?sk:SKD,
 tooth=phantom?sk:new THREE.MeshStandardMaterial({color:0xb8ad8f,roughness:.35}),mouth=phantom?sk:new THREE.MeshStandardMaterial({color:0x2a0505,roughness:.4}),eye=new THREE.MeshBasicMaterial({color:0xff2a14}),
 root=new THREE.Group,J={},add=(p,g,m,x,y,z)=>{const o=new THREE.Mesh(g,m);o.position.set(x||0,y||0,z||0);o.castShadow=!phantom;p.add(o);return o},grp=(p,x,y,z)=>{const g=new THREE.Group;g.position.set(x,y,z);p.add(g);return g};
 const hips=grp(root,0,1.12,0);J.hips=hips;add(hips,deform(new THREE.SphereGeometry(.15,14,10).scale(1.2,.7,.85),.01,9,1),sk);
 /* legs: digitigrade */
 J.leg=[];for(const s of[-1,1]){const th=grp(hips,s*.13,-.02,0);add(th,limbGeo(.085,.055,.56,.25,s),sk);const kn=grp(th,0,-.56,0);add(kn,new THREE.SphereGeometry(.06,10,8),sk);add(kn,limbGeo(.06,.04,.5,.3,s+2),sk);
  const an=grp(kn,0,-.5,0);add(an,limbGeo(.045,.03,.34,.3,s+4),sk);const ft=grp(an,0,-.34,0);for(let i=-1;i<=1;i++){const t=add(ft,new THREE.ConeGeometry(.025,.2,6),dk,i*.04,0,.08);t.rotation.x=PI/2}J.leg.push({th,kn,an,ft})}
 /* torso: emaciated lathe + ribs + spine spikes */
 const sp1=grp(hips,0,.08,0);J.sp1=sp1;const tp=[];[[.001,0],[.12,.02],[.095,.12],[.085,.22],[.13,.32],[.19,.45],[.2,.56],[.17,.66],[.1,.72],[.05,.76],[.001,.77]].forEach(a=>tp.push(new THREE.Vector2(a[0],a[1])));
 const tor=new THREE.LatheGeometry(tp,18);tor.scale(1,1,.68);deform(tor,.012,12,3);add(sp1,tor,sk);
 for(let i=0;i<6;i++)for(const s of[-1,1]){const rb=new THREE.TorusGeometry(.16-i*.005,.011,5,12,PI*.62);const m=add(sp1,rb,sk,0,.38+i*.055,0);m.rotation.set(PI/2,0,s>0?-PI*.12:PI*1.12-PI*.62+PI*.24);m.scale.set(1.06,.75,1)}
 for(let i=0;i<7;i++){const c=add(sp1,new THREE.ConeGeometry(.03-i*.002,.15,6),dk,0,.12+i*.09,-.12-.02*Math.sin(i));c.rotation.x=-PI/2-.4}
 const chest=grp(sp1,0,.6,0);J.chest=chest;
 /* neck & head */
 const nk=grp(chest,0,.16,.04);J.neck=nk;add(nk,limbGeo(.045,.04,.2,.2,7).rotateX(PI),sk);
 const hd=grp(nk,0,.2,.03);J.head=hd;const sg=new THREE.SphereGeometry(.15,28,20);sg.scale(.82,1.28,1.08);{const p=sg.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   for(const ex of[-.055,.055]){const d=Math.hypot(x-ex,y-.03,z-.15);if(d<.07){const k=(1-d/.07)*.045;p.setXYZ(i,x,y,z-k)}}if(y<-.05&&z>0)p.setZ(i,z*.9);if(z<0)p.setZ(i,z*1.25+y*.1)}sg.computeVertexNormals()}
 deform(sg,.007,22,9);add(hd,sg,sk,0,.12,0);
 for(const ex of[-.052,.052]){add(hd,new THREE.SphereGeometry(.026,10,8),mouth,ex,.15,.1);add(hd,new THREE.SphereGeometry(.011,8,6),eye,ex,.15,.118);if(!phantom){const e=gs(0xff2a14,.5,.85);e.position.set(ex,.15,.13);hd.add(e)}}
 add(hd,new THREE.SphereGeometry(.07,12,8).scale(1,.6,1),mouth,0,-.02,.07);
 for(let i=0;i<9;i++){const a=(i/8-.5)*2.2,t=add(hd,new THREE.ConeGeometry(.007,.05,4),tooth,Math.sin(a)*.065,-.02,.06+Math.cos(a)*.065);t.rotation.x=PI}
 const jaw=grp(hd,0,-.01,.02);J.jaw=jaw;const jg=new THREE.SphereGeometry(.1,16,10,0,TAU,PI*.5,PI*.5);jg.scale(.8,.9,1.25);add(jaw,jg,sk,0,0,.04);
 for(let i=0;i<9;i++){const a=(i/8-.5)*2.2;add(jaw,new THREE.ConeGeometry(.007,.045,4),tooth,Math.sin(a)*.065,.012,.06+Math.cos(a)*.07)}
 /* arms: overly long, three-jointed fingers with claws */
 J.arm=[];for(const s of[-1,1]){const sh=grp(chest,s*.2,.08,0);add(sh,new THREE.SphereGeometry(.065,10,8),sk);add(sh,limbGeo(.06,.04,.58,.25,s+11),sk);const el=grp(sh,0,-.58,0);add(el,limbGeo(.042,.03,.62,.3,s+13),sk);
  const wr=grp(el,0,-.62,0);add(wr,new THREE.BoxGeometry(.07,.11,.03),sk,0,-.05,0);const fg=[];
  for(let f=0;f<4;f++){let p=grp(wr,(f-1.5)*.022,-.1,0);const ch=[p];for(let k=0;k<3;k++){add(p,limbGeo(.009,.007,.11-k*.015,.3,f*3+k),sk);const n=grp(p,0,-(.11-k*.015),0);ch.push(n);p=n}const c=add(p,new THREE.ConeGeometry(.008,.09,5),dk,0,-.04,0);c.rotation.x=PI;fg.push(ch)}
  J.arm.push({sh,el,wr,fg})}
 root.userData=J;J.ph=0;J.tw=0;J.twT=1;J.hr=0;J.hy=0;J.ht=[0,0];J.cr=0;J.jw=0;return root}
/* procedural, deliberately unnatural animation */
function animMonster(m,dt,o){const J=m.userData,sp=o.sp,run=sp>3,cr=J.cr+=((o.crawl?1:0)-J.cr)*Math.min(1,dt*3);J.ph+=dt*(sp>0?(1.2+sp*1.25):0);const p=J.ph,s=Math.sin(p),c=Math.cos(p),w=Math.min(1,sp/1.5);
 J.twT-=dt;if(J.twT<=0){J.twT=.4+rand()*(o.calm?3:1.4);J.ht=[(rand()-.5)*(o.calm?.6:1.6),(rand()-.5)*.9]}
 J.hr+=(J.ht[0]-J.hr)*Math.min(1,dt*(rand()<.1?30:6));J.hy+=(J.ht[1]-J.hy)*Math.min(1,dt*8);
 const hunch=.35+(run?.35:0)+cr*.9;J.hips.position.y=1.12-cr*.55+Math.abs(c)*.05*w;J.hips.rotation.x=hunch*.4;J.sp1.rotation.x=hunch*.55+Math.sin(t*1.7)*.03;J.chest.rotation.x=hunch*.35;
 J.sp1.rotation.z=s*.08*w;J.chest.rotation.y=-s*.12*w;J.chest.scale.set(1+Math.sin(t*(o.breath||2.4))*.03,1,1+Math.sin(t*(o.breath||2.4))*.04);
 J.neck.rotation.x=-hunch*.9+(o.look||0);J.head.rotation.z=J.hr;J.head.rotation.y=J.hy+(o.hyaw||0);J.head.rotation.x=-.2;
 J.jaw.rotation.x=(o.jaw||0)*.95+Math.max(0,Math.sin(t*7))*.06;
 J.leg.forEach((L,i)=>{const q=i?-1:1,ss=s*q;L.th.rotation.x=-.45-ss*.55*w-cr*.6;L.kn.rotation.x=1.05+Math.max(0,-ss)*.8*w+cr*.4;L.an.rotation.x=-.75+ss*.25*w;L.ft.rotation.x=.2});
 J.arm.forEach((A,i)=>{const q=i?-1:1,ss=s*q;A.sh.rotation.x=cr?lerp(ss*.4*w,-1.25+ss*.9,cr):(run?-.6+ss*.9:ss*.45*w)+(o.reach||0)*-1.2;A.sh.rotation.z=q*(.12+.05*Math.sin(t*1.3+i));
  A.el.rotation.x=-.25-(run?.5:0)-cr*.3-Math.max(0,ss)*.3;A.wr.rotation.x=-.2;
  A.fg.forEach((ch,f)=>ch.forEach((j,k)=>{if(k)j.rotation.x=-.25-.25*Math.sin(t*(3+f)+k+i*2)-(o.reach||0)*.4}))})}

/* ---------- first-person hands with flashlight ---------- */
const HAND=new THREE.Group;
function buildHands(){HAND.clear();const sl=new THREE.MeshStandardMaterial({color:0x1a1d17,roughness:.95}),gl=new THREE.MeshStandardMaterial({color:0x141518,roughness:.7});
 const arm=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,.34,12),sl);arm.rotation.x=PI/2;arm.position.set(.02,-.07,.2);HAND.add(arm);
 const fist=new THREE.Mesh(deform(new THREE.SphereGeometry(.055,14,10).scale(1,.9,1.3),.006,30,2),gl);fist.position.set(0,-.02,.02);HAND.add(fist);
 let fl=modelMesh('vintage_flashlight');if(fl){const s=.24/Math.max(MOD.vintage_flashlight.sz.z,.01);fl.scale.setScalar(s);fl.rotation.y=PI;fl.position.set(0,-.04,.06)}
 else{fl=new THREE.Mesh(new THREE.CylinderGeometry(.03,.025,.22,14),M.metal);fl.rotation.x=PI/2}
 fl.traverse(o=>{if(o.isMesh)o.castShadow=false});HAND.add(fl);HAND.userData.lens=new THREE.Mesh(new THREE.CircleGeometry(.03,16),new THREE.MeshBasicMaterial({color:0xfff6e0}));
 HAND.userData.lens.position.set(0,0,-.13);HAND.userData.lens.visible=false;HAND.add(HAND.userData.lens);HAND.position.set(.2,-.22,-.38);HAND.traverse(o=>{if(o.isMesh)o.renderOrder=5});cam.add(HAND)}

/* ---------- menu / skin character (three.js "Soldier" rig, tinted per skin) ---------- */
let hum=null,humMix=null,humAct={};
function setSkin(i){sv.skin=i;put();if(!hum)return;const s=SK[i];hum.userData.mat.color.setHex(s.a).convertSRGBToLinear().multiplyScalar(1.6);const hb=hum.userData.head,old=hb.getObjectByName('gear');if(old)hb.remove(old);
 const g=new THREE.Group;g.name='gear';const k=1/hum.userData.sc,M2=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m||0});
 const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x*k,y*k,z*k);o.scale.setScalar(k);o.castShadow=true;g.add(o);return o};
 if(s.h===0){add(new THREE.SphereGeometry(.13,16,12).scale(1,.9,1.05),M2(0x4a5236,.9),0,.12,-.01);const mk=add(new THREE.CylinderGeometry(.05,.06,.08,12),M2(0x15161a,.6),0,.06,.12);mk.rotation.x=PI/2}
 if(s.h===1){add(new THREE.SphereGeometry(.14,16,8,0,TAU,0,PI/2),M2(0xe8c020,.45),0,.12,0);const l=add(new THREE.SphereGeometry(.03,8,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff0b0,emissiveIntensity:3}),0,.19,.13)}
 if(s.h===2){add(new THREE.CylinderGeometry(.13,.135,.06,16),M2(0x151d33,.8),0,.17,0);add(new THREE.BoxGeometry(.22,.015,.1),M2(0x151d33,.8),0,.15,.12)}
 if(s.h===3)add(new THREE.SphereGeometry(.15,16,10,0,TAU,0,PI*.55),M2(0x121316,.5,.3),0,.1,0);
 hb.add(g)}
function buildHuman(){const gl=GLB.Soldier;if(!gl)return;hum=gl.scene;let mat=null,head=null;
 hum.traverse(o=>{if(o.isSkinnedMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(!mat){mat=o.material.clone()}o.material=mat}if(o.isBone&&/Head$/.test(o.name))head=o});
 if(mat){mat.roughness=.75;mat.metalness=.1}hum.updateMatrixWorld(true);const sc=new THREE.Vector3;head.getWorldScale(sc);hum.userData={mat,head,sc:sc.x||1};
 humMix=new THREE.AnimationMixer(hum);for(const a of gl.animations)humAct[a.name]=humMix.clipAction(a);if(humAct.Idle)humAct.Idle.play();S.add(hum);setSkin(sv.skin)}

/* ---------- audio: reverb, 3D monster voice, whispers, procedural sfx ---------- */
let AC=null;const AU={};
function audio(){if(AC){if(AC.state!=='running')AC.resume();return}try{AC=new(window.AudioContext||window.webkitAudioContext)()}catch(e){return}
 const c=AC;AU.m=c.createGain();AU.m.gain.value=sv.vol;const cp=c.createDynamicsCompressor();AU.m.connect(cp);cp.connect(c.destination);
 const len=c.sampleRate*3,ir=c.createBuffer(2,len,c.sampleRate);for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3.2)}
 AU.rv=c.createConvolver();AU.rv.buffer=ir;AU.wet=c.createGain();AU.wet.gain.value=.45;AU.rv.connect(AU.wet);AU.wet.connect(AU.m);
 AU.fx=c.createGain();AU.fx.connect(AU.m);AU.fx.connect(AU.rv);
 const nb=c.createBuffer(1,c.sampleRate*2,c.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;AU.nb=nb;
 /* original drone, kept */
 [43,43.7,86.5].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),q=c.createBiquadFilter();o.type=i<2?'sawtooth':'sine';o.frequency.value=f;q.type='lowpass';q.frequency.value=150;g.gain.value=i<2?.06:.03;o.connect(q);q.connect(g);g.connect(AU.m);o.start()});
 /* tunnel draft */
 const ws=c.createBufferSource();ws.buffer=nb;ws.loop=true;const wf=c.createBiquadFilter();wf.type='bandpass';wf.frequency.value=320;wf.Q.value=.7;AU.wind=c.createGain();AU.wind.gain.value=.05;ws.connect(wf);wf.connect(AU.wind);AU.wind.connect(AU.fx);ws.start();
 const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=.07;lg.gain.value=.03;lfo.connect(lg);lg.connect(AU.wind.gain);lfo.start();
 /* monster voice: panner + breathing loop */
 AU.pan=c.createPanner();AU.pan.panningModel='HRTF';AU.pan.distanceModel='exponential';AU.pan.refDistance=2.5;AU.pan.rolloffFactor=1.3;AU.pan.maxDistance=60;AU.mv=c.createGain();AU.mv.gain.value=0;AU.mv.connect(AU.pan);AU.pan.connect(AU.fx);
 const bs=c.createBufferSource();bs.buffer=nb;bs.loop=true;const bf=c.createBiquadFilter();bf.type='bandpass';bf.frequency.value=700;bf.Q.value=1.4;AU.br=c.createGain();AU.br.gain.value=0;bs.connect(bf);bf.connect(AU.br);AU.br.connect(AU.mv);bs.start();AU.bf=bf;
 const go=c.createOscillator(),gg=c.createGain(),gq=c.createBiquadFilter();go.type='sawtooth';go.frequency.value=52;gq.type='lowpass';gq.frequency.value=260;AU.gr=gg;gg.gain.value=0;go.connect(gq);gq.connect(gg);gg.connect(AU.mv);go.start();AU.go=go}
function beep(f,d,ty,v,sl,dest){if(!AC)return;const n=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type=ty||'sine';o.frequency.setValueAtTime(f,n);if(sl)o.frequency.exponentialRampToValueAtTime(sl,n+d);g.gain.setValueAtTime(v||.2,n);g.gain.exponentialRampToValueAtTime(.001,n+d);o.connect(g);g.connect(dest||AU.fx);o.start(n);o.stop(n+d+.02)}
function noise(fr,q,d,v,ty,dest,sl){if(!AC)return;const n=AC.currentTime,s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=AU.nb;f.type=ty||'bandpass';f.frequency.setValueAtTime(fr,n);if(sl)f.frequency.exponentialRampToValueAtTime(sl,n+d);f.Q.value=q;
 g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(v,n+Math.min(.02,d/4));g.gain.exponentialRampToValueAtTime(.0001,n+d);s.connect(f);f.connect(g);g.connect(dest||AU.fx);s.start(n,Math.random()*1.5);s.stop(n+d+.05)}
const SFX={step:(run,wet)=>{wet?noise(900,.6,.22,run?.35:.2,'bandpass',0,400):noise(run?160:120,1.2,.09,run?.4:.22,'lowpass')},
 clang:()=>{[220,331,447,612].forEach((f,i)=>beep(f*(.95+Math.random()*.1),1.6-i*.3,'triangle',.12,f*.97))},drip:()=>beep(1400+Math.random()*900,.12,'sine',.07,600),
 spark:()=>{for(let i=0;i<4;i++)setTimeout(()=>noise(3500,2,.05,.18,'highpass'),i*40*Math.random())},rumble:()=>noise(60,.7,4,.5,'lowpass',0,30),
 pick:()=>beep(520,.12,'triangle',.2),ok:()=>{beep(660,.12,'triangle',.2);setTimeout(()=>beep(880,.18,'triangle',.2),110)},err:()=>{beep(140,.4,'square',.25,90)},
 lever:()=>{noise(500,3,.12,.4);beep(90,.3,'square',.15,60)},valve:()=>noise(250,4,.25,.25,'bandpass',0,180),door:()=>{noise(200,1,1.2,.35,'lowpass',0,90);beep(60,1,'sawtooth',.12,40)},
 heart:v=>{beep(55,.14,'sine',.45*v,32,AU.m);setTimeout(()=>beep(48,.14,'sine',.35*v,30,AU.m),150)},
 whisper:()=>{if(!AC)return;const n=AC.currentTime,s=AC.createBufferSource(),p=AC.createStereoPanner?AC.createStereoPanner():AC.createGain(),g=AC.createGain();s.buffer=AU.nb;if(p.pan)p.pan.value=Math.random()*2-1;
  const f1=AC.createBiquadFilter(),f2=AC.createBiquadFilter();f1.type=f2.type='bandpass';f1.Q.value=f2.Q.value=9;for(let i=0;i<12;i++){f1.frequency.setValueAtTime(500+Math.random()*700,n+i*.13);f2.frequency.setValueAtTime(1600+Math.random()*1300,n+i*.13)}
  g.gain.setValueAtTime(0,n);for(let i=0;i<12;i++)g.gain.linearRampToValueAtTime(Math.random()<.3?0:.35,n+i*.13);g.gain.linearRampToValueAtTime(0,n+1.7);s.connect(f1);s.connect(f2);f1.connect(g);f2.connect(g);g.connect(p);p.connect(AU.fx);s.start(n);s.stop(n+1.8)},
 scream:()=>{if(!AC)return;const n=AC.currentTime,o=AC.createOscillator(),m=AC.createOscillator(),mg=AC.createGain(),g=AC.createGain();o.type='sawtooth';o.frequency.setValueAtTime(380,n);o.frequency.exponentialRampToValueAtTime(900,n+.3);o.frequency.exponentialRampToValueAtTime(240,n+1.4);
  m.frequency.value=73;mg.gain.value=260;m.connect(mg);mg.connect(o.frequency);g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(.5,n+.05);g.gain.exponentialRampToValueAtTime(.0001,n+1.5);o.connect(g);g.connect(AU.mv);o.start(n);m.start(n);o.stop(n+1.6);m.stop(n+1.6);
  noise(2500,1,1.2,.35,'bandpass',AU.mv,800)},
 click:()=>{for(let i=0;i<3+Math.random()*4;i++)setTimeout(()=>noise(2800+Math.random()*2000,6,.03,.4,'bandpass',AU.mv),i*(60+Math.random()*70))},
 mstep:()=>noise(90,1,.16,.6,'lowpass',AU.mv),
 radio:()=>{noise(2000,.5,.5,.12,'bandpass');beep(1000,.08,'square',.05)}};
function setListener(){if(!AC)return;const L=AC.listener,p=cam.getWorldPosition(new THREE.Vector3()),d=cam.getWorldDirection(new THREE.Vector3());
 if(L.positionX){const n=AC.currentTime;L.positionX.setTargetAtTime(p.x,n,.05);L.positionY.setTargetAtTime(p.y,n,.05);L.positionZ.setTargetAtTime(p.z,n,.05);L.forwardX.setTargetAtTime(d.x,n,.05);L.forwardY.setTargetAtTime(d.y,n,.05);L.forwardZ.setTargetAtTime(d.z,n,.05);L.upX.value=0;L.upY.value=1;L.upZ.value=0}
 else{L.setPosition(p.x,p.y,p.z);L.setOrientation(d.x,d.y,d.z,0,1,0)}}
function setPan(x,y,z){if(!AU.pan)return;if(AU.pan.positionX){const n=AC.currentTime;AU.pan.positionX.setTargetAtTime(x,n,.05);AU.pan.positionY.setTargetAtTime(y,n,.05);AU.pan.positionZ.setTargetAtTime(z,n,.05)}else AU.pan.setPosition(x,y,z)}
