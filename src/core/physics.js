// Rapier physics wrapper: static level colliders, dynamic props, kinematic doors, character controller.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init().then(() => RAPIER);
  return ready;
}
export { RAPIER };

export const GROUP_STATIC = 0x0001, GROUP_PLAYER = 0x0002, GROUP_DYNAMIC = 0x0004, GROUP_MONSTER = 0x0008, GROUP_DOOR = 0x0010;
const groups = (member, filter) => (member << 16) | filter;

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
    this.dynamics = []; // {body, mesh, lastVel, onImpact}
    this.acc = 0;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.handleToProp = new Map();
  }

  addBox({ x, y, z, hx, hy, hz, rotY = 0, tag = null }) {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(groups(GROUP_STATIC, 0xffff));
    if (rotY) desc.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY));
    const c = this.world.createCollider(desc);
    if (tag) c.userTag = tag;
    return c;
  }
  addCylinder({ x, z, r, y0, y1 }) {
    const hh = (y1 - y0) / 2;
    return this.world.createCollider(RAPIER.ColliderDesc.cylinder(hh, r).setTranslation(x, y0 + hh, z).setCollisionGroups(groups(GROUP_STATIC, 0xffff)));
  }
  addHull(points) {
    const desc = RAPIER.ColliderDesc.convexHull(points);
    if (!desc) return null;
    desc.setCollisionGroups(groups(GROUP_STATIC, 0xffff));
    return this.world.createCollider(desc);
  }

  // dynamic prop with a box/cylinder collider approximating the mesh bounds
  addDynamic(mesh, { shape = 'box', mass = 10, friction = 0.8, restitution = 0.1, size, onImpact } = {}) {
    const box = new THREE.Box3().setFromObject(mesh);
    const s = size || box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const offset = c.clone().sub(mesh.position);
    const bd = RAPIER.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setRotation(mesh.quaternion).setLinearDamping(0.4).setAngularDamping(0.6).setCcdEnabled(false);
    const body = this.world.createRigidBody(bd);
    const cd = shape === 'cyl' ? RAPIER.ColliderDesc.cylinder(s.y / 2, Math.max(s.x, s.z) / 2) : RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2);
    cd.setMass(mass).setFriction(friction).setRestitution(restitution).setCollisionGroups(groups(GROUP_DYNAMIC, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = this.world.createCollider(cd, body);
    const prop = { body, mesh, offset, lastSpeed: 0, onImpact, collider: col, cooldown: 0 };
    this.dynamics.push(prop);
    this.handleToProp.set(col.handle, prop);
    return prop;
  }

  removeDynamic(prop) {
    this.world.removeRigidBody(prop.body);
    this.dynamics.splice(this.dynamics.indexOf(prop), 1);
  }

  // kinematic body (doors)
  addKinematicBox(hx, hy, hz, pos, quat) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z).setRotation(quat));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(groups(GROUP_DOOR, 0xffff)), body);
    return { body, col };
  }

  // kinematic capsule (monsters / remote player) so the local player collides with them
  addKinematicCapsule(halfH, r, pos) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfH, r).setCollisionGroups(groups(GROUP_MONSTER, GROUP_PLAYER | GROUP_DYNAMIC)), body);
    return { body, col };
  }

  createCharacter(pos, radius = 0.3, halfH = 0.6) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfH, radius).setCollisionGroups(groups(GROUP_PLAYER, GROUP_STATIC | GROUP_DYNAMIC | GROUP_DOOR | GROUP_MONSTER)), body);
    const cc = this.world.createCharacterController(0.02);
    cc.enableAutostep(0.42, 0.25, true);
    cc.enableSnapToGround(0.35);
    cc.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    cc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(75);
    cc.setSlideEnabled(true);
    return { body, col, cc };
  }

  // ray cast against static + dynamic + doors; returns {toi, point, normal, collider}
  raycast(origin, dir, maxToi = 50, excludeCollider = null, filterGroups = 0xffff & ~GROUP_PLAYER) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxToi, true, undefined, groups(0xffff, filterGroups), excludeCollider || undefined);
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    return { toi, point: { x: origin.x + dir.x * toi, y: origin.y + dir.y * toi, z: origin.z + dir.z * toi }, normal: hit.normal, collider: hit.collider };
  }

  step(dt) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= this.world.timestep && n < 4) {
      this.world.step(this.eventQueue);
      this.acc -= this.world.timestep;
      n++;
    }
    if (n === 4) this.acc = 0;
    // impact detection (for noise + sounds)
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      for (const h of [h1, h2]) {
        const p = this.handleToProp.get(h);
        if (p && p.cooldown <= 0) {
          const v = p.body.linvel();
          const sp = Math.hypot(v.x, v.y, v.z);
          if (sp > 1.2 && p.onImpact) { p.onImpact(p, sp); p.cooldown = 0.25; }
        }
      }
    });
    for (const p of this.dynamics) {
      p.cooldown -= dt;
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      const off = p.offset.clone().applyQuaternion(p.mesh.quaternion);
      p.mesh.position.set(t.x - off.x, t.y - off.y, t.z - off.z);
      if (t.y < -30) p.body.setTranslation({ x: t.x, y: 2, z: t.z }, true);
    }
  }

  dispose() {
    try { this.world.free(); } catch (e) { /* ignore */ }
    this.dynamics = [];
    this.handleToProp.clear();
  }
}
