import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AIRCRAFT } from '../src/data.js';
import { buildAircraft } from '../src/aircraft.js';
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(1400, 900); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping;
const s = new THREE.Scene(); s.background = new THREE.Color(0x7090b0);
const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(30, 50, 20); s.add(sun);
const id = new URLSearchParams(location.search).get('id') || 'su27';
const view = new URLSearchParams(location.search).get('v') || '0';
const cam = new THREE.PerspectiveCamera(35, 1400 / 900, 0.1, 500);
if (id === 'all') {
  AIRCRAFT.forEach((a, i) => { const p = buildAircraft(a, { number: '27' }); p.root.position.set((i % 4 - 1.5) * 24, 0, -Math.floor(i / 4) * 26); p.root.rotation.y = 0.6; s.add(p.root); });
  cam.position.set(0, 70, 60); cam.lookAt(0, 0, -26);
} else {
  const p = buildAircraft(AIRCRAFT.find(a => a.id === id), { number: '27', gear: view === '3' });
  p.setControls(0.3, 0.5, 0.3, 0.3, 1, 1, 0);
  s.add(p.root);
  const vs = [[22, 12, 22], [0, 25, 0.01], [0, 2, -22], [-15, 1, 10], [5, 3.5, 9]];
  cam.position.set(...vs[+view]); cam.lookAt(0, view === '4' ? 1 : 0, view === '4' ? 4 : 0);
}
r.render(s, cam); window.done = true;
s.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; const sz = b.getSize(new THREE.Vector3()); if (sz.length() > 40 || isNaN(sz.x)) console.log('BIG', o.parent && o.parent.parent && o.parent.parent.name, o.material.type, JSON.stringify(b)); } });
