// Rapier physics: static world, vehicles, breakable props, ragdolls, queries
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CURB, SEA_X, WEST_WALL, NORTH_WALL } from '../world/citygen.js';

export { RAPIER };
export const GR = { STATIC: 1, VEHICLE: 2, PROP: 4, RAGDOLL: 8, PLAYER: 16, DEBRIS: 32 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export async function initPhysics() { await RAPIER.init(); }

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.queue = new RAPIER.EventQueue(true);
    this.acc = 0;
    this.handles = new Map(); // collider handle -> owner
    this.onContact = null;
    this.alpha = 0;
  }
  staticBox(x, y, z, hx, hy, hz, owner = null, rotY = 0) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(groups(GR.STATIC, 0xffff)).setFriction(0.9);
    if (rotY) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY); d.setRotation(q); }
    const c = this.world.createCollider(d);
    if (owner) this.handles.set(c.handle, owner);
    return c;
  }
  staticCyl(x, y, z, r, hh) {
    return this.world.createCollider(RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y + hh, z).setCollisionGroups(groups(GR.STATIC, 0xffff)));
  }
  buildWorld(city, trees) {
    // playable ground (water areas left open)
    this.staticBox((WEST_WALL + 1005) / 2, -1, (NORTH_WALL + 1440) / 2, (1005 - WEST_WALL) / 2, 1, (1440 - NORTH_WALL) / 2);
    this.staticBox((1005 + SEA_X) / 2, -1, (NORTH_WALL + 400) / 2, (SEA_X - 1005) / 2, 1, (400 - NORTH_WALL) / 2);
    this.staticBox((1005 + SEA_X) / 2, -1, (1000 + 1440) / 2, (SEA_X - 1005) / 2, 1, 220);
    for (const s of city.slabs) this.staticBox((s.x0 + s.x1) / 2, CURB / 2, (s.z0 + s.z1) / 2, (s.x1 - s.x0) / 2, CURB / 2, (s.z1 - s.z0) / 2);
    for (const c of city.colliders) this.staticBox(c.x, c.y, c.z, c.hx, c.hy, c.hz, c.b ? { type: 'building', b: c.b } : null);
    for (const t of trees) this.staticCyl(t.x, 0, t.z, t.type === 'palm' ? 0.3 : 0.3 * t.s + 0.08, 3);
  }
  step(dt, pre) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.world.timestep && n < 3) {
      pre && pre(this.world.timestep);
      this.world.step(this.queue);
      this.acc -= this.world.timestep; n++;
      this.queue.drainCollisionEvents((h1, h2, started) => { if (started && this.onContact) this.onContact(this.handles.get(h1), this.handles.get(h2), h1, h2); });
      this.queue.drainContactForceEvents((e) => {
        const a = this.handles.get(e.collider1()), b = this.handles.get(e.collider2());
        if (this.onForce) this.onForce(a, b, e.totalForceMagnitude(), e.maxForceDirection());
      });
    }
    if (n === 3) this.acc = 0;
    return n;
  }
  ray(o, d, max, filter = 0xffff, exclude) {
    const r = new RAPIER.Ray(o, d);
    const h = this.world.castRayAndGetNormal(r, max, true, undefined, groups(0xffff, filter), undefined, exclude);
    if (!h) return null;
    const t = h.timeOfImpact ?? h.toi;
    return { t, x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t, n: h.normal, collider: h.collider, owner: this.handles.get(h.collider.handle) };
  }
}
