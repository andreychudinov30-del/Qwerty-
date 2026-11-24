/* =====================================================================
   net: Supabase backend (player ID, friends, invites, rooms) + realtime co-op
   - Identity/friends/rooms/invites: SECURITY DEFINER RPCs (mh_*), secret kept in localStorage.
   - Gameplay: Supabase Realtime broadcast, 15 Hz state packets, sender-timestamp interpolation
     (jitter buffer ~100 ms) so the partner glides instead of teleporting.
   - Host is authoritative for the monster; both clients replay the same deterministic level
     (shared seed) and exchange object actions by stable ids.
   ===================================================================== */
const SBURL='https://jygztbziluxcfwmeuhnj.supabase.co',SBKEY='sb_publishable_Q4PK0rozKFi_mLBLR2bV5Q_6acpeJc1';
const NET={on:0,host:0,cl:0,remote:0,ingame:0,room:0,code:'',ch:null,pres:{},seed:null,mis:0,paused:0,ping:0,off:null,delay:.1,jit:.01,lastRecv:0,lastArr:0,
 pbuf:[],mbuf:[],rp:null,av:null,specA:0,fr:{friends:[],requests:[],invites:[]},invs:[],err:'',note:'',sb:null,sendT:0,syncT:2,pingT:1,hbT:0,hbOn:0,
 partnerGone:0,partnerSeen:0,sawHost:0,pst:'idle',busy:0,msgs:0};
let IM={},idc=0;
const MST=['idle','patrol','search','chase','stalk','flee'];
const STN={menu:'в меню',lobby:'в лобби',game:'в игре'};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- supabase client & RPC ---------- */
function sbc(){if(NET.sb)return NET.sb;if(!window.supabase||!supabase.createClient)throw new Error('Библиотека Supabase не загружена');
 NET.sb=supabase.createClient(SBURL,SBKEY,{auth:{persistSession:false,autoRefreshToken:false},realtime:{params:{eventsPerSecond:60}}});return NET.sb}
async function rpc(fn,args){const{data,error}=await sbc().rpc(fn,args);if(error)throw new Error(error.message||'Ошибка сервера');return data}
const cr=()=>({p_id:sv.net.id,p_secret:sv.net.secret});
async function netEnsure(){if(sv.net&&sv.net.id&&sv.net.secret)return sv.net;const r=await rpc('mh_register',{p_name:sv.name||'Выживший'});sv.net={id:r.id,secret:r.secret};put();return sv.net}
async function call(fn,args){await netEnsure();try{return await rpc(fn,{...cr(),...args})}catch(e){if(/auth failed/.test(e.message)){sv.net=null;put();await netEnsure();return await rpc(fn,{...cr(),...args})}throw e}}
const emsg=e=>/Failed to fetch|NetworkError|network/i.test(e.message||'')?'Нет связи с сервером':(e.message||'Ошибка');

/* ---------- presence of this player: heartbeat, friends, invites ---------- */
async function netBeat(){if(NET.busy)return;NET.busy=1;try{const st=(NET.ingame||mode==='play'||mode==='pause'||mode==='spec'||mode==='scare')?'game':NET.room?'lobby':'menu';
 const d=await call('mh_heartbeat',{p_status:st,p_room:NET.code||'',p_name:sv.name||'Выживший',p_skin:String(sv.skin)});NET.fr=d;NET.err='';
 for(const iv of d.invites||[])if(!NET.invs.some(x=>x.room===iv.room&&x.from===iv.from))NET.invs.push({...iv,t:Date.now()})}catch(e){NET.err=emsg(e)}finally{NET.busy=0}showInv();refreshUI()}
setInterval(()=>{if(!NET.hbOn)return;NET.hbT-=1;if(NET.hbT<=0){NET.hbT=(mode==='menu'||mode==='end')?3:15;netBeat()}},1000);
function netStart(){if(!NET.hbOn){NET.hbOn=1;NET.hbT=0}}
if(sv.net&&sv.net.id)NET.hbOn=1;

/* ---------- rooms ---------- */
const nsend=(ev,p)=>{if(!NET.ch)return;try{const r=NET.ch.send({type:'broadcast',event:ev,payload:p});r&&r.catch&&r.catch(()=>{})}catch(e){}};
const pList=()=>{const L=[];for(const k in NET.pres){const a=NET.pres[k],m=a[a.length-1];L.push({id:k,name:m.name,skin:m.skin,host:m.host})}L.sort((a,b)=>(b.host?1:0)-(a.host?1:0));return L};
const partner=()=>pList().find(p=>p.id!==(sv.net&&sv.net.id));
async function roomCreate(){await netEnsure();await roomLeave();const r=await call('mh_room_create',{p_mission:String(NET.mis)});NET.code=r.code;NET.host=1;NET.room=1;NET.sawHost=1;await roomSub();netStart();NET.hbT=0}
async function roomJoin(code){code=String(code||'').trim();if(!/^\d{6}$/.test(code))throw new Error('Код — 6 цифр');await netEnsure();await roomLeave();
 const r=await call('mh_room_join',{p_code:code});NET.code=r.code;NET.host=r.host===sv.net.id?1:0;NET.mis=Math.max(0,Math.min(23,parseInt(r.mission)||0));NET.room=1;NET.sawHost=0;
 try{await roomSub()}catch(e){NET.room=0;NET.code='';throw e}netStart();NET.hbT=0}
async function roomLeave(){const code=NET.code,ch=NET.ch;NET.ch=null;NET.room=0;NET.code='';NET.pres={};NET.sawHost=0;
 if(ch){try{await ch.untrack()}catch(e){}try{sbc().removeChannel(ch)}catch(e){}}
 if(code){try{await rpc('mh_room_leave',{...cr(),p_code:code})}catch(e){}}refreshUI()}
function roomSub(){return new Promise((res,rej)=>{const ch=sbc().channel('mh-room-'+NET.code,{config:{broadcast:{self:false,ack:false},presence:{key:sv.net.id}}});NET.ch=ch;
 ch.on('presence',{event:'sync'},()=>{NET.pres=ch.presenceState();onPres()});
 ch.on('broadcast',{event:'st'},({payload})=>onSt(payload));ch.on('broadcast',{event:'a'},({payload})=>onA(payload));ch.on('broadcast',{event:'ev'},({payload})=>onEv(payload));
 ch.on('broadcast',{event:'sync'},({payload})=>onSync(payload));ch.on('broadcast',{event:'n'},({payload})=>{if(NET.on&&NET.host&&payload)noiseQ.push([payload.x,payload.z,payload.r])});
 ch.on('broadcast',{event:'k'},()=>{if(mode==='play'&&!P.dead)deathScare()});ch.on('broadcast',{event:'sc'},()=>{P.san-=8;P.shk=.35});
 ch.on('broadcast',{event:'d'},()=>partnerDied());ch.on('broadcast',{event:'lob'},({payload})=>{if(!NET.host&&payload){NET.mis=payload.mis|0;refreshUI()}});
 ch.on('broadcast',{event:'start'},({payload})=>onStart(payload));
 ch.on('broadcast',{event:'png'},({payload})=>nsend('pog',payload));ch.on('broadcast',{event:'pog'},({payload})=>{if(payload&&payload.t)NET.ping=Math.round((performance.now()-payload.t))});
 let first=1;const to=setTimeout(()=>{if(first){first=0;rej(new Error('Не удалось подключиться к серверу реального времени'))}},12000);
 ch.subscribe(async s=>{if(s==='SUBSCRIBED'){try{await ch.track({id:sv.net.id,name:sv.name||'Выживший',skin:sv.skin,host:NET.host?1:0})}catch(e){}if(first){first=0;clearTimeout(to);res()}NET.note=''}
  else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'){if(first){first=0;clearTimeout(to);rej(new Error('Нет связи с сервером реального времени'))}else{NET.note='Соединение прервано, переподключение…'}}else if(s==='CLOSED'&&!first){NET.note='Соединение закрыто'}refreshUI()})})}
function onPres(){const p=partner();if(p)NET.partnerSeen=1;
 if(NET.ingame){if(NET.partnerSeen&&!p)partnerLeft()}
 else if(!NET.host){const h=pList().find(x=>x.host);if(h)NET.sawHost=1;else if(NET.sawHost){NET.note='Хост покинул комнату';roomLeave()}}
 refreshUI()}
function partnerLeft(){if(NET.partnerGone||!NET.on)return;NET.partnerGone=1;msg('Напарник отключился');if(NET.av){S.remove(NET.av.root);NET.av=null}NET.on=0;NET.cl=0;NET.host=1;NET.paused=0;
 if(mode==='spec'||(P.dead&&mode!=='end'))finish(0)}
function partnerDied(){if(!NET.rp||NET.rp.dead)return;NET.rp.dead=1;msg('Напарник погиб');if(P.dead&&mode==='spec')finish(0)}
function killRemote(){if(!NET.rp||NET.rp.dead)return;NET.rp.dead=1;MO.cool=2.5;nsend('k',{})}
const tgt=()=>{if(!NET.on||!NET.rp)return P;const a=!P.dead,b=!NET.rp.dead;if(a&&b){const sc=(q)=>Math.hypot(q.x-MO.x,q.z-MO.z)*(q.light&&q.bat>0?.7:1)*(q.hide?3:1);return sc(P)<=sc(NET.rp)?P:NET.rp}return b?NET.rp:P};
/* host starts / client follows */
function netHostStart(){if(!NET.host||!NET.ch||!partner())return;const seed=(Math.random()*1e9)|0,mi=NET.mis;nsend('start',{mi,seed});NET.pendingStart=1;loading(()=>startMission(mi,{net:1,seed}))}
function onStart(p){if(!p||NET.host||!NET.ch)return;if(mode==='play'&&NET.ingame)return;loading(()=>startMission(p.mi|0,{net:1,seed:p.seed|0}))}

/* ---------- in-game sync ---------- */
function netReset(){NET.pbuf.length=0;NET.mbuf.length=0;NET.off=null;NET.delay=.1;NET.jit=.01;NET.lastArr=0;NET.partnerGone=0;NET.partnerSeen=!!partner();NET.sendT=0;NET.syncT=2;NET.pingT=1;NET.specA=0;NET.pst='idle';NET.msgs=0;
 NET.rp={x:0,z:0,yaw:0,pit:0,hide:0,light:true,bat:60,crouch:0,moving:0,run:0,lk:null,dead:0,san:100,uvT:0,shk:0,h:1.65,hp:100};
 if(NET.av){S.remove(NET.av.root);NET.av=null}NET.lastRecv=performance.now()/1000+25}
const rnd2=v=>Math.round(v*100)/100;
function sendSt(now){const f=(P.moving?1:0)|(P.run?2:0)|(P.crouch?4:0)|(P.light&&P.bat>0?8:0)|(P.hide?16:0)|(P.dead?32:0);
 const o={t:now,x:rnd2(P.x),z:rnd2(P.z),y:rnd2(P.yaw),p:rnd2(P.pit),f,l:P.hide&&P.lk&&P.lk.id?P.lk.id:'',h:rnd2(P.h)};
 if(NET.host){const m=MO,i=MST.indexOf(m.st);o.m={x:rnd2(m.x),z:rnd2(m.z),y:rnd2(m.yaw),s:i<0?0:i,v:rnd2(m.sp||0),c:m.crawl?1:0}}
 nsend('st',o);NET.msgs++}
function onSt(p){if(!p||typeof p.t!=='number')return;const now=performance.now()/1000;NET.lastRecv=now;
 if(NET.lastArr){const gap=now-NET.lastArr;NET.jit+=(Math.abs(gap-1/15)-NET.jit)*.1;NET.delay=clamp(.075+NET.jit*2.5,.09,.26)}NET.lastArr=now;
 const o=now-p.t;NET.off=NET.off==null||o<NET.off?o:NET.off+(o-NET.off)*.02;
 NET.pbuf.push({t:p.t,x:p.x,z:p.z,y:p.y,p:p.p,f:p.f,l:p.l,h:p.h});if(NET.pbuf.length>40)NET.pbuf.shift();
 if(p.m){NET.mbuf.push({t:p.t,x:p.m.x,z:p.m.z,y:p.m.y,s:p.m.s,v:p.m.v,c:p.m.c});if(NET.mbuf.length>40)NET.mbuf.shift()}
 if(p.f&32&&NET.rp&&!NET.rp.dead)partnerDied()}
/* snapshot interpolation with short extrapolation; angles use shortest arc, jumps >8 m snap */
function sample(buf,rt){const n=buf.length;if(!n)return null;if(n===1||rt<=buf[0].t)return buf[0];const L=buf[n-1];
 if(rt>=L.t){const P2=buf[n-2],dt=L.t-P2.t,e=Math.min(rt-L.t,.2);if(dt<=0||Math.hypot(L.x-P2.x,L.z-P2.z)>8)return L;const k=e/dt;return{...L,x:L.x+(L.x-P2.x)*k,z:L.z+(L.z-P2.z)*k}}
 let i=n-2;while(i>0&&buf[i].t>rt)i--;const a=buf[i],b=buf[i+1],k=clamp((rt-a.t)/Math.max(1e-4,b.t-a.t),0,1);
 if(Math.hypot(b.x-a.x,b.z-a.z)>8)return k<.5?a:b;
 return{...a,x:lerp(a.x,b.x,k),z:lerp(a.z,b.z,k),y:a.y+angDiff(a.y,b.y)*k,p:a.p!=null?lerp(a.p,b.p,k):0,v:a.v!=null?lerp(a.v,b.v,k):0}}
function netUpdate(dt){const now=performance.now()/1000;
 NET.sendT-=dt;if(NET.sendT<=0){NET.sendT=1/15;sendSt(now)}
 const rt=now-(NET.off==null?now:NET.off)-NET.delay;
 const s=sample(NET.pbuf,rt);if(s){const r=NET.rp;r.x=s.x;r.z=s.z;r.yaw=s.y;r.pit=s.p;const f=s.f|0;r.moving=f&1;r.run=(f>>1)&1;r.crouch=(f>>2)&1;r.light=!!(f&8);r.bat=r.light?60:0;r.hide=(f>>4)&1;r.h=s.h||1.65;
  r.lk=s.l?IM[s.l]||null:null;if(NET.host&&r.hide&&!NET.phide&&MO.st==='chase'&&Math.hypot(MO.x-r.x,MO.z-r.z)<16&&los(MO.x,MO.z,r.x,r.z))MO.saw=1;NET.phide=r.hide;if((f&32)&&!r.dead)partnerDied();if(!NET.av&&GLB.Soldier)makeRemote();if(NET.av)avUpdate(dt,s)}
 if(NET.cl){const m=sample(NET.mbuf,rt);if(m){MO.x=m.x;MO.z=m.z;MO.yaw=m.y;MO.sp=m.v||0;MO.crawl=m.c?1:0;MO.st=MST[m.s]||'patrol'}}
 NET.syncT-=dt;if(NET.syncT<=0){NET.syncT=2.5;nsend('sync',mkSync())}
 NET.pingT-=dt;if(NET.pingT<=0){NET.pingT=2;nsend('png',{t:performance.now()})}
 if(NET.on&&NET.lastRecv>0&&now-NET.lastRecv>7){msg('Связь с напарником потеряна');partnerLeft()}}
/* object actions are broadcast by stable id and replayed identically on the other side */
function netI(o){if(NET.on&&!NET.remote&&o&&o.id&&!o.local)nsend('a',{id:o.id})}
function applyI(o){NET.remote=1;try{if(o.m&&!o.obj){o.off=1;o.m.visible=false;o.s.visible=false;SFX.pick()}else if(o.rf)o.rf();else if(o.done)o.done();else o.f()}catch(e){console.warn('applyI',e)}finally{NET.remote=0}}
function onA(p){if(!p||!NET.on)return;
 if(p.id){const o=IM[p.id];if(o&&!o.off)applyI(o)}
 else if(p.st!=null){const s=stp();if(s&&p.st===si&&!s.dn){NET.remote=1;try{done()}finally{NET.remote=0}}}
 else if(p.sc!=null){const s=stp();if(s&&s.k==='scan'&&s.items&&s.items[p.sc]&&!s.items[p.sc].done)scanMark(s,s.items[p.sc],1)}
 else if(p.an){NET.remote=1;try{openAnnex()}finally{NET.remote=0}}}
function mkSync(){const offs=[];for(const o of I)if(o.off&&o.id&&!o.local)offs.push(o.id);return{si,offs}}
function onSync(p){if(!p||!NET.on||p.si<si)return;for(const id of p.offs||[]){const o=IM[id];if(o&&!o.off)applyI(o)}
 if(p.si>si){const s=stp();if(s&&!s.dn){NET.remote=1;try{done()}finally{NET.remote=0}}}}
function onEv(p){if(p&&NET.on&&NET.cl)ambient(p.e|0)}
function regI(o,id,local){o.id=id||('i'+(idc++));if(local)o.local=1;IM[o.id]=o;I.push(o);return o}
function scanMark(s,it,remote){it.done=1;it.obj=0;it.off=1;s.c++;it.ob.g.material.emissive.setHex(0x330000);SFX.whisper();msg('Знак изучен ('+s.c+'/'+s.n+')');
 if(!remote&&NET.on)nsend('a',{sc:s.items.indexOf(it)});if(s.c>=s.n)done()}
function noiseAt(x,z,r){if(NET.remote)return;if(NET.on&&!NET.host)nsend('n',{x:rnd2(x),z:rnd2(z),r});else noiseQ.push([x,z,r])}

/* ---------- partner avatar (animated skinned model, nameplate, flashlight cone) ---------- */
function gearFor(i,k){const s=SK[i]||SK[0],g=new THREE.Group,M2=(c,r,m)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m||0});
 const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x*k,y*k,z*k);o.scale.setScalar(k);o.castShadow=true;g.add(o);return o};
 if(s.h===0){add(new THREE.SphereGeometry(.13,16,12).scale(1,.9,1.05),M2(0x4a5236,.9),0,.12,-.01);const mk=add(new THREE.CylinderGeometry(.05,.06,.08,12),M2(0x15161a,.6),0,.06,.12);mk.rotation.x=PI/2}
 if(s.h===1){add(new THREE.SphereGeometry(.14,16,8,0,TAU,0,PI/2),M2(0xe8c020,.45),0,.12,0);add(new THREE.SphereGeometry(.03,8,6),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xfff0b0,emissiveIntensity:3}),0,.19,.13)}
 if(s.h===2){add(new THREE.CylinderGeometry(.13,.135,.06,16),M2(0x151d33,.8),0,.17,0);add(new THREE.BoxGeometry(.22,.015,.1),M2(0x151d33,.8),0,.15,.12)}
 if(s.h===3)add(new THREE.SphereGeometry(.15,16,10,0,TAU,0,PI*.55),M2(0x121316,.5,.3),0,.1,0);return g}
function nameTag(txt){const c=cvs(256,64),g=c.getContext('2d');g.font='bold 30px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(0,0,0,.55)';const w=Math.min(250,g.measureText(txt).width+26);g.fillRect(128-w/2,10,w,44);g.fillStyle='#e9d7b8';g.fillText(txt,128,33);
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:ctex(c,1),transparent:true,depthWrite:false,fog:false}));s.scale.set(1.1,.275,1);s.position.y=2.25;return s}
function makeRemote(){const gl=GLB.Soldier;if(!gl||!THREE.SkeletonUtils||!hum)return;const p=partner()||{name:'Напарник',skin:0},m=THREE.SkeletonUtils.clone(gl.scene);m.visible=true;m.position.set(0,0,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);
 let mat=null,head=null;m.traverse(o=>{if(o.isSkinnedMesh){o.castShadow=true;o.frustumCulled=false;if(!mat)mat=o.material.clone();o.material=mat}if(o.isBone&&/Head$/.test(o.name))head=o});
 const s=SK[p.skin]||SK[0];if(mat){mat.color.setHex(s.a).convertSRGBToLinear().multiplyScalar(1.15);mat.roughness=.75;mat.metalness=.1}
 if(head)head.add(gearFor(p.skin|0,1/(hum.userData.sc||1)));
 const root=new THREE.Group;root.add(m);const mx=new THREE.AnimationMixer(m),acts={};for(const a of gl.animations)if(a.name!=='TPose')acts[a.name]=mx.clipAction(a);
 if(acts.Idle)acts.Idle.play();
 const cg=new THREE.Group;cg.position.set(0,1.45,.25);root.add(cg);const cone=new THREE.Mesh(flCone.geometry,flCone.material.clone());cone.material.uniforms.o.value=.03;cone.rotation.y=PI;cg.add(cone);
 const gw=gs(0xeaf2ff,.6,.8);gw.position.set(0,0,.35);cg.add(gw);
 root.add(nameTag(p.name||'Напарник'));S.add(root);NET.av={root,m,mx,acts,cur:'Idle',cg,cone,gw,v:0,px:null,pz:null,fall:0,yaw:0}}
function avUpdate(dt,s){const a=NET.av,r=NET.rp;a.root.position.set(s.x,0,s.z);a.yaw+=angDiff(a.yaw,s.y+PI)*Math.min(1,dt*14);a.root.rotation.y=a.yaw;
 if(a.px!=null){const v=Math.hypot(s.x-a.px,s.z-a.pz)/Math.max(dt,1e-3);a.v+=(Math.min(v,9)-a.v)*Math.min(1,dt*8)}a.px=s.x;a.pz=s.z;
 const want=a.v<.35?'Idle':a.v<3.7?'Walk':'Run';if(want!==a.cur&&a.acts[want]){const n=a.acts[want],o=a.acts[a.cur];n.reset().fadeIn(.18).play();if(o)o.fadeOut(.18);a.cur=want}
 if(a.acts[a.cur]&&a.cur==='Walk')a.acts.Walk.timeScale=clamp(a.v/1.6,.6,1.6);a.mx.update(dt);
 a.root.visible=!r.hide;a.root.scale.y+=((r.crouch?.82:1)-a.root.scale.y)*Math.min(1,dt*10);
 a.fall+=((r.dead?1:0)-a.fall)*Math.min(1,dt*5);a.m.rotation.x=-a.fall*PI/2;a.m.position.y=a.fall*.18;
 const lit=r.light&&!r.dead;a.cg.visible=lit;a.cg.rotation.x=-(s.p||0)}

/* ---------- spectator: free third-person view behind the surviving partner ---------- */
function enterSpec(){mode='spec';NET.specA=0;const U=MComp.uniforms;U.dmg.value=0;U.ca.value=0;U.vg.value=.6;U.gr.value=.035;$('fx').style.transition='none';$('fx').style.opacity=0;$('blk').style.opacity=0;show('hud',1);show('tc',0);show('pr',0);HAND.visible=false;flCone.visible=false;fl.intensity=1.1;
 $('obj').innerHTML='<b>НАБЛЮДЕНИЕ</b>Вы погибли. Смотрите за напарником';$('pb').classList.remove('hide');$('pb').textContent='Выйти в меню';$('pb').onclick=()=>{toMenu()};
 $('iv').textContent='';show('arr',0);$('pr').textContent='';sub('Вы погибли. Напарник ещё в игре — перетаскивайте экран, чтобы вращать камеру.',6000)}
function specCam(dt){const r=NET.rp;if(!r)return;const a=r.yaw+NET.specA,bx=Math.sin(a),bz=Math.cos(a),ty=1.15;let d=3.1;while(d>.7&&hitAt(r.x+bx*d,r.z+bz*d,.25))d-=.25;
 const dx=r.x+bx*d,dy=ty+.55+d*.12,dz=r.z+bz*d,k=1-Math.exp(-12*dt);cam.position.x+=(dx-cam.position.x)*k;cam.position.y+=(dy-cam.position.y)*k;cam.position.z+=(dz-cam.position.z)*k;
 cam.lookAt(r.x,ty+.35,r.z);fl.intensity=1.1}
function specTick(dt){pt+=dt;if(NET.on){if(NET.host)monUpdate(dt);else monClient(dt)}specCam(dt);
 const mn=(md.clock||227)+(pt/9|0);$('clk').textContent=String(mn/60%24|0).padStart(2,'0')+':'+String(mn%60).padStart(2,'0');
 $('iv').textContent=(NET.on?'Пинг '+NET.ping+' мс':'')}

/* ---------- UI: invites banner, friends & online panels ---------- */
function showInv(){const b=$('invb');NET.invs=NET.invs.filter(x=>Date.now()-x.t<180000);const ok=(mode==='menu'||mode==='end')&&NET.invs.length;
 if(!ok){b.classList.add('hide');return}const iv=NET.invs[0];b.classList.remove('hide');
 b.innerHTML='<div><b>'+esc(iv.name)+'</b> приглашает вас в комнату <b>'+esc(iv.room)+'</b></div><div class="row"><button data-i="y">Принять</button><button data-i="n">Отклонить</button></div>'+(NET.invErr?'<div style="color:#e88">'+esc(NET.invErr)+'</div>':'')}
$('invb').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const iv=NET.invs[0];if(!iv)return;
 if(b.dataset.i==='n'){NET.invs.shift();NET.invErr='';showInv();return}
 try{NET.invErr='';await roomJoin(iv.room);NET.invs.shift();showInv();hideEnd();panel('o')}catch(er){NET.invErr=emsg(er);NET.invs.shift();showInv()}};
const hideEnd=()=>{show('end',0);if(mode==='end')toMenu()};
function refreshUI(){const pn=$('pn');if(pn.classList.contains('hide'))return;const o=$('pc').dataset.owner;if(o==='o'||o==='f')panelNet(o,1)}
function fmtF(f){const on=f.online,st=on?(STN[f.status]||'в сети'):'не в сети';return'<span style="color:'+(on?'#7dff9a':'#8d9aa6')+'">● '+st+'</span>'}
function panelNet(k,keep){const c=$('pc');netStart();const me=sv.net&&sv.net.id,keepV={},ae=document.activeElement;let af=null,ss=0;
 if(keep){for(const id of['fid','rc','nm']){const e=$(id);if(e)keepV[id]=e.value}if(ae&&ae.id){af=ae.id;try{ss=ae.selectionStart}catch(e){}}}
 let h='';const idRow='<p>Ваш ID: <b id="myid" style="color:#e9d7b8;letter-spacing:.05em">'+esc(me||'создаётся…')+'</b></p>'+(me?'<button data-a="copy">Копировать ID</button>':'');
 const err=NET.err?'<p style="color:#e88">'+esc(NET.err)+'</p>':'';
 if(k==='f'){const fr=NET.fr.friends||[],rq=NET.fr.requests||[];
  h='<h2>Друзья</h2>'+idRow+'<label>Ваш ник <input type="text" id="nm" maxlength="18" value="'+esc(sv.name||'Выживший')+'"></label>'+
   '<h3>Добавить друга по ID</h3><div class="row"><input type="text" id="fid" maxlength="12" placeholder="MH-XXXXXX" autocapitalize="characters" autocomplete="off"><button data-a="add" style="flex:0 0 auto">Добавить</button></div><p id="fm">'+esc(NET.fmsg||'')+'</p>'+err;
  if(rq.length)h+='<h3>Заявки в друзья</h3>'+rq.map(q=>'<div class="row"><span style="flex:2">'+esc(q.name)+' <small>'+esc(q.id)+'</small></span><button data-a="yes" data-id="'+esc(q.id)+'" style="flex:0 0 auto">Принять</button><button data-a="no" data-id="'+esc(q.id)+'" style="flex:0 0 auto">✕</button></div>').join('');
  h+='<h3>Мои друзья ('+fr.length+')</h3>'+(fr.length?fr.map(f=>'<div class="row" style="border-bottom:1px solid #ffffff14;padding-bottom:6px"><span style="flex:2"><b>'+esc(f.name)+'</b><br><small>'+esc(f.id)+' · '+fmtF(f)+'</small></span>'+
    (f.online?(f.room&&f.status==='lobby'?'<button data-a="goto" data-id="'+esc(f.room)+'" style="flex:0 0 auto">К нему</button>':'<button data-a="inv" data-id="'+esc(f.id)+'" style="flex:0 0 auto">Пригласить</button>'):'')+
    '<button data-a="del" data-id="'+esc(f.id)+'" style="flex:0 0 auto">✕</button></div>').join(''):'<p>Пока никого. Передайте другу свой ID или введите его ID выше.</p>');
 }else if(!NET.room){
  h='<h2>Онлайн</h2><p>Кооператив на двоих: общая миссия, монстр охотится на обоих. Создайте комнату или войдите по коду.</p>'+err+'<button data-a="create">Создать комнату</button>'+
   '<h3>Войти по коду</h3><div class="row"><input type="text" id="rc" inputmode="numeric" maxlength="6" placeholder="6 цифр" autocomplete="off"><button data-a="join" style="flex:0 0 auto">Войти</button></div><p id="om">'+esc(NET.omsg||'')+'</p>'+
   '<button data-a="friends">Друзья и приглашения</button>';
 }else{const pl=pList(),pa=partner(),fr=(NET.fr.friends||[]).filter(f=>f.online),mn=MS[NET.mis];
  h='<h2>Комната '+esc(NET.code)+'</h2><p>Сообщите код другу или пригласите из списка. '+(NET.note?'<span style="color:#e9b86a">'+esc(NET.note)+'</span>':'')+'</p>'+
   '<div>'+pl.map(p=>'<div class="row"><span style="flex:2">'+esc(p.name)+(p.id===me?' (вы)':'')+(p.host?' · хост':'')+'</span><span style="color:#7dff9a;flex:0 0 auto">●</span></div>').join('')+(pa?'':'<p>Ждём второго игрока…</p>')+'</div>'+
   (NET.ping&&pa?'<p>Пинг: '+NET.ping+' мс</p>':'');
  if(NET.host)h+='<h3>Миссия</h3><div class="row"><button data-a="mp" style="flex:0 0 auto">◀</button><span style="flex:3;text-align:center">'+(NET.mis+1)+'. '+esc(mn.n)+'</span><button data-a="mn" style="flex:0 0 auto">▶</button></div>'+
    '<button data-a="start"'+(pa?'':' disabled')+'>'+(pa?'Начать миссию':'Ждём напарника')+'</button>';
  else h+='<h3>Миссия</h3><p>'+(NET.mis+1)+'. '+esc(mn.n)+'</p><p>Ждём, пока хост начнёт…</p>';
  h+='<h3>Пригласить друга</h3>'+(fr.length?fr.map(f=>'<div class="row"><span style="flex:2">'+esc(f.name)+' <small>'+(STN[f.status]||'')+'</small></span><button data-a="inv" data-id="'+esc(f.id)+'" style="flex:0 0 auto">Пригласить</button></div>').join(''):'<p>Нет друзей в сети.</p>')+
   '<p id="om">'+esc(NET.omsg||'')+'</p><button data-a="leave">Покинуть комнату</button>'}
 const full=h+'<button data-x="1">Назад</button>';if(keep&&c.dataset.owner===k&&c.dataset.sig===full)return;c.dataset.sig=full;c.innerHTML=full;c.dataset.owner=k;
 if(keep){for(const id in keepV){const e=$(id);if(e)e.value=keepV[id]}if(af){const e=$(af);if(e){e.focus();try{e.setSelectionRange(ss,ss)}catch(x){}}}}
 c.onclick=async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;if(d.x){show('pn',0);return}const A=d.a;
  const say=m=>{if(k==='f')NET.fmsg=m;else NET.omsg=m;panelNet(k,1)};
  try{
   if(A==='copy'){try{await navigator.clipboard.writeText(me);say('ID скопирован')}catch(x){say('Скопируйте ID вручную: '+me)}}
   else if(A==='add'){const v=($('fid').value||'').trim();if(!v)return say('Введите ID друга');const r=await call('mh_friend_request',{p_target:v});say(r&&r.status==='accepted'?'Теперь вы друзья!':'Заявка отправлена. Друг увидит её во вкладке «Друзья».');$('fid')&&($('fid').value='');netBeat()}
   else if(A==='yes'||A==='no'){await call('mh_friend_respond',{p_other:d.id,p_accept:A==='yes'});netBeat()}
   else if(A==='del'){if(confirm('Удалить из друзей?')){await call('mh_friend_remove',{p_other:d.id});netBeat()}}
   else if(A==='inv'){say('Отправляю приглашение…');if(!NET.room)await roomCreate();await call('mh_invite',{p_to:d.id,p_room:NET.code});NET.omsg='Приглашение отправлено';NET.fmsg='Приглашение отправлено. Вы в комнате '+NET.code+'.';panelNet(NET.room?'o':k)}
   else if(A==='goto'){await roomJoin(d.id);panelNet('o')}
   else if(A==='create'){NET.omsg='';await roomCreate();panelNet('o')}
   else if(A==='join'){const v=($('rc').value||'').trim();say('Подключаюсь…');await roomJoin(v);NET.omsg='';panelNet('o')}
   else if(A==='friends'){panelNet('f')}
   else if(A==='leave'){await roomLeave();NET.omsg='';panelNet('o')}
   else if(A==='mp'||A==='mn'){const mx=Math.min(23,sv.prog);NET.mis=A==='mp'?(NET.mis+23)%24:(NET.mis+1)%24;if(NET.mis>mx)NET.mis=A==='mn'?0:mx;nsend('lob',{mis:NET.mis});call('mh_room_update',{p_code:NET.code,p_mission:String(NET.mis),p_state:''}).catch(()=>{});panelNet('o',1)}
   else if(A==='start')netHostStart()
  }catch(er){say(emsg(er))}};
 const nm=$('nm');if(nm)nm.onchange=()=>{sv.name=(nm.value||'').trim().slice(0,18)||'Выживший';put();if(NET.ch){try{NET.ch.track({id:sv.net.id,name:sv.name,skin:sv.skin,host:NET.host?1:0})}catch(x){}}netBeat()};
 if(!keep)netBeat()}
/* leave the room cleanly when the player exits to the menu */
function netExitGame(){NET.on=0;NET.cl=0;NET.ingame=0;NET.paused=0;if(NET.av){S.remove(NET.av.root);NET.av=null}P.dead=0;$('pb').classList.add('hide')}

function shufNet(){}
