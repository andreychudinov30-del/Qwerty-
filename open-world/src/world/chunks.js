// Chunked world streaming: per-chunk groups with distance LOD (main / near-detail / far)
import * as THREE from 'three';

export class Chunks {
  constructor(scene, size = 200) {
    this.size = size; this.scene = scene; this.map = new Map();
    this.view = 1000; this.detail = 340;
  }
  key(x, z) { return Math.floor(x / this.size) + ',' + Math.floor(z / this.size); }
  get(k) {
    let c = this.map.get(k);
    if (!c) {
      const [a, b] = k.split(',').map(Number);
      c = { main: new THREE.Group(), near: new THREE.Group(), far: new THREE.Group(), cx: (a + 0.5) * this.size, cz: (b + 0.5) * this.size, vis: null };
      c.main.name = 'chunk' + k;
      this.scene.add(c.main); this.scene.add(c.near); this.scene.add(c.far);
      this.map.set(k, c);
    }
    return c;
  }
  add(k, obj, layer = 'main') { this.get(k)[layer].add(obj); }
  update(cam, force = false) {
    const x = cam.position.x, z = cam.position.z, h = Math.max(0, cam.position.y - 30);
    for (const c of this.map.values()) {
      const d = Math.hypot(c.cx - x, c.cz - z) - this.size * 0.7;
      const v = d < this.view + h;
      const n = d < this.detail + h * 0.5;
      c.main.visible = v; c.near.visible = v && n; c.far.visible = v && !n;
    }
  }
  showAll(on) { for (const c of this.map.values()) { c.main.visible = true; c.near.visible = on; c.far.visible = !on; } }
}
