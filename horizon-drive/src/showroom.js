import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { pbr, canvasTex } from './assets.js';
import { CarVisual } from './carModel.js';

export class Showroom {
  constructor(renderer, hdr, q) {
    this.r = renderer; this.q = q; const s = this.scene = new THREE.Scene();
    RectAreaLightUniformsLib.init();
    const pm = new THREE.PMREMGenerator(renderer); this.env = pm.fromEquirectangular(hdr).texture; s.environment = this.env; s.environmentIntensity = 0.42;
    s.background = new THREE.Color(0x07080b); s.fog = new THREE.Fog(0x07080b, 18, 48);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    // floor
    if (q.reflections) { const refl = new Reflector(new THREE.CircleGeometry(40, 64), { textureWidth: 1024, textureHeight: 1024, color: 0x888888 }); refl.rotation.x = -Math.PI / 2; refl.position.y = -0.002; s.add(refl); }
    const fm = pbr('concrete', 8); fm.color.setHex(0x1c1d20); fm.roughness = 0.55; fm.transparent = !!q.reflections; fm.opacity = q.reflections ? 0.86 : 1; fm.envMapIntensity = 0.6;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), fm); floor.receiveShadow = true; s.add(floor);
    // turntable
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.08, 96), new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, metalness: 0.6, roughness: 0.25, clearcoat: 1, transparent: !!q.reflections, opacity: 0.92 })); tt.position.y = 0.04; tt.receiveShadow = true; s.add(tt); this.table = tt;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.025, 8, 128).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a6d, toneMapped: false })); ring.position.y = 0.075; s.add(ring); this.ring = ring;
    // ceiling light panels + rect lights
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    for (const [x, z, w, h, int] of [[0, 0, 7, 1.0, 7], [-3.2, 0, 0.6, 7, 3], [3.2, 0, 0.6, 7, 3]]) {
      const rl = new THREE.RectAreaLight(0xffffff, int, w, h); rl.position.set(x, 6, z); rl.lookAt(x, 0, z); s.add(rl);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMat); p.position.set(x, 6.01, z); p.rotation.x = Math.PI / 2; s.add(p);
    }
    const key = new THREE.SpotLight(0xfff2e0, 110, 30, 0.6, 0.6, 1.5); key.position.set(5, 9, 6); key.castShadow = q.shadow > 0; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.radius = 6; s.add(key);
    const rim1 = new THREE.SpotLight(0x5ab4ff, 60, 25, 0.5, 0.8); rim1.position.set(-7, 3, -6); s.add(rim1);
    const rim2 = new THREE.SpotLight(0xff3d8b, 50, 25, 0.5, 0.8); rim2.position.set(7, 2.5, -7); s.add(rim2);
    s.add(new THREE.HemisphereLight(0x8090a0, 0x101010, 0.25));
    // backdrop walls with light strips and logo
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.8, metalness: 0.1 });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 12, 64, 1, true, Math.PI * 0.6, Math.PI * 0.8), wallMat); wall.material.side = THREE.BackSide; wall.position.y = 6; s.add(wall);
    for (let i = 0; i < 9; i++) { const a = Math.PI * 0.65 + i / 8 * Math.PI * 0.7; const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 9, 0.08), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff2a6d : 0x3ab0ff, toneMapped: false })); st.position.set(Math.sin(a) * 21.8, 4.5, Math.cos(a) * 21.8); s.add(st); }
    const logo = canvasTex(1024, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff2a6d'); gr.addColorStop(1, '#ffb000'); g.fillStyle = gr; g.font = 'italic 900 150px Arial'; g.textAlign = 'center'; g.fillText('HORIZON DRIVE', w / 2, 170); });
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshBasicMaterial({ map: logo, transparent: true, toneMapped: false, opacity: 0.9 })); lm.position.set(0, 7.5, -21); s.add(lm);
    this.yaw = 0.7; this.pitch = 0.18; this.dist = 8.5; this.target = new THREE.Vector3(0, 0.6, 0); this.auto = true; this.car = null;
  }
  setCar(car, tune) {
    if (this.car) { this.table.remove(this.car.root); this.scene.remove(this.car.root); this.car.dispose(); }
    this.car = new CarVisual(car, tune, { lights: true }); this.car.root.position.y = 0.08; this.scene.add(this.car.root);
    this.car.root.traverse(o => { if (o.isMesh && o !== this.car.shadow) o.castShadow = true; });
    const st = { pos: new THREE.Vector3(0, 0.08, 0), yaw: 0, pitch: 0, roll: 0, wheels: [0, 1, 2, 3].map(() => ({ vis: 0, steer: 0, dSpin: 0 })) }; st.wheels[0].steer = st.wheels[1].steer = 0.25; this.car.pose(st); this.car.root.rotation.y = this.spin || 0;
    this.car.setLights(false, 0.08, false);
    return this.car;
  }
  update(dt) {
    if (this.auto) this.yaw += dt * 0.12; this.spin = (this.spin || 0);
    const d = this.dist; this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, 0.3 + Math.sin(this.pitch) * d, Math.cos(this.yaw) * Math.cos(this.pitch) * d).add(this.target);
    this.camera.lookAt(this.target); this.ring.material.color.setHSL((performance.now() * 0.00005) % 1, 1, 0.55);
  }
}
