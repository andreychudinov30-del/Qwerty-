import * as THREE from 'three';
import { atmo } from './sky.js';

const mat = (c, r = 0.7, m = 0.2) => atmo(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
let MM = null;
function M() { if (!MM) MM = { olive: mat(0x4f5a3a), olive2: mat(0x3d4630), grey: mat(0x7b8289, 0.6, 0.4), dark: mat(0x2b2f33), white: mat(0xd8dadc, 0.5, 0.2), hull: mat(0x6f7880, 0.55, 0.45), deck: mat(0x4e5358, 0.8, 0.2), red: mat(0x8a2a22), concrete: mat(0x8d8b84, 0.9, 0) }; return MM; }

export function radarStation() {
  const m = M(), g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 3, 16), m.concrete); base.position.y = 1.5; g.add(base);
  const bld = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 7), m.olive); bld.position.set(14, 2.5, 4); g.add(bld);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 10, 8), m.grey); mast.position.y = 8; g.add(mast);
  const rot = new THREE.Group(); rot.position.y = 13; g.add(rot);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, 0.9), m.white); dish.material = m.white; dish.rotation.x = -Math.PI / 2 - 0.3; dish.scale.set(1.4, 1, 0.5); rot.add(dish);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 6), m.grey); arm.position.z = 2; rot.add(arm);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.white); dome.position.set(-16, 0, -6); g.add(dome);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { root: g, update(dt) { rot.rotation.y += dt * 1.2; }, radius: 16, hp: 60 };
}
export function samLauncher() {
  const m = M(), g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 9), m.olive); body.position.y = 1.9; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.4), m.olive2); cab.position.set(0, 2.8, 4.6); g.add(cab);
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 12), m.dark); w.rotation.z = Math.PI / 2; w.position.set(i % 2 ? 1.7 : -1.7, 0.7, i < 2 ? 2.8 : -2.8); g.add(w); }
  const turret = new THREE.Group(); turret.position.set(0, 3.2, -1); g.add(turret);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 7), m.olive2); t.position.set((i % 2 - 0.5) * 0.9, (Math.floor(i / 2)) * 0.85 + 0.6, 0); t.rotation.x = -0.6; turret.add(t); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root: g, turret, update(dt) { }, radius: 8, hp: 40 };
}
export function ship() {
  const m = M(), g = new THREE.Group();
  const L = 140, B = 16;
  const shape = new THREE.Shape(); shape.moveTo(0, L / 2); shape.quadraticCurveTo(B / 2, L / 6, B / 2, -L / 3); shape.lineTo(B / 2 * 0.85, -L / 2); shape.lineTo(-B / 2 * 0.85, -L / 2); shape.lineTo(-B / 2, -L / 3); shape.quadraticCurveTo(-B / 2, L / 6, 0, L / 2);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false }), m.hull); hull.rotation.x = Math.PI / 2; hull.position.y = 5; g.add(hull);
  const deck = new THREE.Mesh(new THREE.ShapeGeometry(shape), m.deck); deck.rotation.x = -Math.PI / 2; deck.position.y = 5.05; g.add(deck);
  const sup = new THREE.Mesh(new THREE.BoxGeometry(11, 9, 30), m.hull); sup.position.set(0, 9.5, -5); g.add(sup);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 10), m.hull); bridge.position.set(0, 16, 6); g.add(bridge);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 18, 6), m.grey); mast.position.set(0, 26, 2); g.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 0.4), m.dark); radar.position.set(0, 33, 2); g.add(radar);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 8, 10), m.dark); funnel.position.set(0, 17, -14); g.add(funnel);
  const tur = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 2.5, 12), m.hull); tur.position.set(0, 6.5, 40); g.add(tur);
  const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8, 6), m.dark); gun.rotation.x = Math.PI / 2 - 0.15; gun.position.set(0, 7.5, 44); g.add(gun);
  const vls = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 12), m.dark); vls.position.set(0, 5.4, 25); g.add(vls);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root: g, update(dt) { radar.rotation.y += dt * 2; }, radius: 40, hp: 160, naval: true };
}
export function hangarTarget(h) { return { root: h, update() { }, radius: 30, hp: 90 }; }
