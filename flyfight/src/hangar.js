import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildAircraft } from './aircraft.js';
import { byId, PAINTS } from './data.js';
import { save } from './save.js';
import { Noise, canvas, clamp, damp } from './util.js';

function floorTextures() {
  const S = 1024, c = canvas(S), g = c.getContext('2d'); const n = new Noise(4);
  const id = g.createImageData(S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 118 + (n.fbm(x / 40, y / 40, 5, 25.6) - 0.5) * 50 + (n.v(x / 2, y / 2) - 0.5) * 14; const i = (y * S + x) * 4; d[i] = v; d[i + 1] = v * 0.99; d[i + 2] = v * 0.96; d[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  g.strokeStyle = 'rgba(40,40,40,0.8)'; g.lineWidth = 3; for (let k = 0; k <= S; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  for (let k = 0; k < 14; k++) { const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(20,18,15,0.35)'); gr.addColorStop(1, 'rgba(20,18,15,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 8); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function wallTexture() {
  const c = canvas(512), g = c.getContext('2d');
  for (let x = 0; x < 512; x++) { const v = 120 + Math.sin(x / 512 * Math.PI * 32) * 35; g.fillStyle = `rgb(${v * 0.85},${v * 0.9},${v * 0.92})`; g.fillRect(x, 0, 1, 512); }
  g.fillStyle = 'rgba(30,30,30,0.3)'; for (let y = 0; y < 512; y += 128) g.fillRect(0, y, 512, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function markingTex() {
  const c = canvas(1024), g = c.getContext('2d'); g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(240,190,30,0.85)'; g.lineWidth = 14; g.beginPath(); g.arc(512, 512, 470, 0, 7); g.stroke();
  g.setLineDash([40, 30]); g.lineWidth = 8; g.beginPath(); g.arc(512, 512, 420, 0, 7); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(240,190,30,0.85)'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.fillText('FLY FIGHT', 512, 990);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class Hangar {
  constructor(engine) {
    this.engine = engine; const r = engine.renderer;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x0d0f12); s.fog = new THREE.Fog(0x0d0f12, 60, 140);
    const pm = new THREE.PMREMGenerator(r); this.env = pm.fromScene(new RoomEnvironment(), 0.03); s.environment = this.env.texture; s.environmentIntensity = 0.75; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 120), new THREE.MeshStandardMaterial({ map: floorTextures(), roughness: 0.38, metalness: 0.05, envMapIntensity: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: markingTex(), transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mark.rotation.x = -Math.PI / 2; mark.position.y = 0.01; s.add(mark);
    const turn = new THREE.Mesh(new THREE.CylinderGeometry(11, 11.3, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.4, roughness: 0.55 })); turn.position.y = 0.06; turn.receiveShadow = true; s.add(turn);
    // arched hangar shell
    const wt = wallTexture(); wt.repeat.set(6, 3);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 110, 64, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: wt, side: THREE.BackSide, roughness: 0.6, metalness: 0.5, color: 0x9aa4ac }));
    shell.geometry.rotateX(-Math.PI / 2); s.add(shell);
    const ribM = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.8, roughness: 0.4 });
    for (let z = -50; z <= 50; z += 9) { const rib = new THREE.Mesh(new THREE.TorusGeometry(33.4, 0.35, 6, 48, Math.PI), ribM); rib.position.z = z; s.add(rib); }
    // back wall with door opening to bright sky
    const back = new THREE.Mesh(new THREE.CircleGeometry(34, 48, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.8, metalness: 0.3 })); back.position.z = -55; s.add(back);
    const skyC = canvas(16, 256), sg = skyC.getContext('2d'); const gr = sg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6f9fd8'); gr.addColorStop(0.75, '#e8eef2'); gr.addColorStop(0.8, '#8a8f7a'); gr.addColorStop(1, '#55584a'); sg.fillStyle = gr; sg.fillRect(0, 0, 16, 256);
    const skyT = new THREE.CanvasTexture(skyC); skyT.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.CircleGeometry(34, 48, 0, Math.PI), new THREE.MeshBasicMaterial({ map: skyT, color: 0xdddddd })); sky.position.set(0, 0, 55); sky.rotation.y = Math.PI; s.add(sky);
    { const uv = sky.geometry.getAttribute('uv'), ps = sky.geometry.getAttribute('position'); for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.12 + ps.getY(i) / 34 * 0.88); }
    // lights
    s.add(new THREE.HemisphereLight(0x9fb2c8, 0x2a2622, 0.6));
    const key = new THREE.SpotLight(0xfff1dd, 520, 90, 0.6, 0.7, 1.5); key.position.set(14, 26, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.03; s.add(key); s.add(key.target);
    const rim = new THREE.SpotLight(0xa8c8ff, 420, 100, 0.7, 0.8, 1.5); rim.position.set(-16, 18, -22); s.add(rim); s.add(rim.target);
    const fill = new THREE.PointLight(0xffd8a8, 300, 60, 1.6); fill.position.set(-10, 6, 16); s.add(fill);
    const lampM = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
    for (let z = -40; z <= 40; z += 14) for (const x of [-9, 9]) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 5), lampM); l.position.set(x, 30.5, z); s.add(l); }
    // props
    const prop = (geo, col, x, y, z, ry = 0, met = 0.3) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: met })); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; s.add(m); return m; };
    prop(new THREE.BoxGeometry(1.6, 1.1, 0.8), 0xb02020, -15, 0.55, -6, 0.3); prop(new THREE.BoxGeometry(1.6, 0.4, 0.8), 0x8a1818, -15, 1.3, -6, 0.3);
    prop(new THREE.BoxGeometry(1.2, 1.4, 0.7), 0x2050a0, 16, 0.7, -10, -0.4);
    for (let i = 0; i < 4; i++) prop(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 20), i % 2 ? 0x2c5a2a : 0x6a1d1a, 18 + (i % 2) * 1.0, 0.65, 10 + Math.floor(i / 2) * 1.0, 0, 0.6);
    for (let i = 0; i < 3; i++) { const t = prop(new THREE.TorusGeometry(0.5, 0.22, 10, 20), 0x111111, -18, 0.22 + i * 0.44, 12, 0, 0); t.rotation.x = Math.PI / 2; }
    const cart = prop(new THREE.BoxGeometry(4, 0.3, 1.4), 0x555b60, -17, 0.8, 2, 0.1, 0.6);
    for (let i = 0; i < 2; i++) { const m = prop(new THREE.CylinderGeometry(0.11, 0.11, 3.6, 14), 0xe8e8e4, -17, 1.15, 1.6 + i * 0.8, 0.1, 0.1); m.rotation.z = Math.PI / 2; }
    const tug = prop(new THREE.BoxGeometry(2.4, 1.2, 3.6), 0xd8a020, 14, 0.9, 18, -0.6, 0.2);
    prop(new THREE.BoxGeometry(2, 0.9, 1.4), 0x222222, 14.3, 1.9, 17.6, -0.6, 0.2);
    for (let i = 0; i < 5; i++) prop(new THREE.ConeGeometry(0.25, 0.7, 16), 0xff6a10, -6 + i * 3, 0.35, 15, 0, 0);
    this.key = key; this.rim = rim; this.yaw = 0.7; this.pitch = 0.16; this.dist = 30; this.auto = true; this.idle = 0;
    this.plane = null; this.current = null; this.bindControls(); this.t = 0;
  }
  bindControls() {
    const el = this.engine.canvas; let drag = null; let pinch = null;
    const down = (x, y) => { drag = { x, y }; this.auto = false; this.idle = 0; };
    const move = (x, y) => { if (!drag || !this.active) return; this.yaw -= (x - drag.x) * 0.006; this.pitch = clamp(this.pitch + (y - drag.y) * 0.004, 0.02, 0.9); drag = { x, y }; };
    el.addEventListener('mousedown', e => { if (this.active) down(e.clientX, e.clientY); });
    addEventListener('mousemove', e => move(e.clientX, e.clientY)); addEventListener('mouseup', () => drag = null);
    el.addEventListener('wheel', e => { if (this.active) this.dist = clamp(this.dist + Math.sign(e.deltaY) * 2, 14, 48); });
    el.addEventListener('touchstart', e => { if (!this.active) return; if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY); else if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); drag = null; } }, { passive: true });
    el.addEventListener('touchmove', e => { if (!this.active) return; if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY); else if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); this.dist = clamp(this.dist * pinch / d, 14, 48); pinch = d; } }, { passive: true });
    el.addEventListener('touchend', () => { drag = null; pinch = null; });
  }
  show(id, paintId) {
    const key = id + ':' + (paintId || save.paints[id] || 'std');
    if (this.current === key) return; this.current = key;
    if (this.plane) { this.scene.remove(this.plane.root); this.plane.dispose(); }
    const spec = byId(id); const pid = paintId || save.paints[id] || 'std'; const paint = PAINTS.find(p => p.id === pid);
    const pl = buildAircraft(spec, { gear: true, livery: paint && paint.livery, number: '01' });
    pl.root.position.y = pl.groundOffset + 0.12; pl.setControls(0, 0, 0, 0.4, 0.0, 0, 0); for (const n of pl.nozzles) { n.flame.visible = false; n.glowM.opacity = 0; }
    pl.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(pl.root); this.plane = pl; this.spec = spec;
    this.dist = clamp(spec.geo.L * 1.6, 22, 40);
    this.key.target.position.set(0, 1, 0); this.rim.target.position.set(0, 2, 0);
  }
  update(dt) {
    this.t += dt; this.idle += dt; if (this.idle > 6) this.auto = true;
    if (this.auto) this.yaw += dt * 0.12;
    if (this.plane) { this.plane.root.rotation.y = 0; const k = Math.sin(this.t * 0.8) * 0.3; this.plane.setControls(Math.sin(this.t * 0.6) * 0.4, k, Math.sin(this.t * 0.45) * 0.5, 0.4, 0, 0, this.t); for (const n of this.plane.nozzles) { n.flame.visible = false; n.glowM.opacity = 0; } }
    const c = this.camera; const h = 2.2;
    c.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, h + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(0, h * 0.8, 0);
  }
}
