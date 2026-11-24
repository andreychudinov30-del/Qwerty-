// World entities & interactables: doors (kinematic physics, lockable, monster-openable/breakable), pickups,
// notes, switches/levers, fuse panels, generators, terminals, valves, radios, keypads, lockers (hiding),
// corpses, trains, exits, barricades, gas zones.
import * as THREE from 'three';
import { CELL } from '../world/mapgen.js';
import * as PG from '../world/procgeo.js';
import { getMat, plainMat } from '../core/materials.js';
import { loadModel } from '../core/assets.js';
import { audio } from '../core/audio.js';
import { Human } from './human.js';

export const ITEMS = {
  flashlight: { name: 'Фонарик', model: 'vintage_flashlight', size: 0.25 },
  battery: { name: 'Батарейка', shape: 'battery' },
  medkit: { name: 'Аптечка', model: 'medical_box', size: 0.35 },
  fuse: { name: 'Предохранитель', shape: 'fuse' },
  fuel: { name: 'Канистра топлива', model: 'metal_jerrycan', size: 0.5 },
  filter: { name: 'Фильтр противогаза', shape: 'filter' },
  gasmask: { name: 'Противогаз', model: 'old_gas_mask', size: 0.3 },
  radio_part: { name: 'Радиодеталь', shape: 'circuit' },
  keycard: { name: 'Ключ-карта', shape: 'card' },
  flare: { name: 'Фальшфейер', shape: 'flare' },
  bottle: { name: 'Бутылка', shape: 'bottle' },
  crowbar: { name: 'Лом', shape: 'crowbar' },
  key_red: { name: 'Красный ключ', shape: 'key', color: 0xaa2222 },
  key_blue: { name: 'Синий ключ', shape: 'key', color: 0x2244aa },
  key_tech: { name: 'Ключ техсектора', shape: 'key', color: 0xaaaa22 },
  key_depot: { name: 'Ключ от депо', shape: 'key', color: 0x22aa66 },
  key_lab: { name: 'Ключ лаборатории', shape: 'key', color: 0xdddddd },
  key_bunker: { name: 'Ключ бункера', shape: 'key', color: 0x885522 },
  tape: { name: 'Кассета', shape: 'tape' },
  sample: { name: 'Образец', shape: 'vial' },
  detonator: { name: 'Детонатор', shape: 'box', color: 0x444422 },
  wire: { name: 'Кабель', shape: 'wire' },
  wheel: { name: 'Штурвал', shape: 'wheel' },
  charge: { name: 'Заряд взрывчатки', shape: 'box', color: 0x5a4a2a },
};

function itemMesh(id) {
  const I = ITEMS[id] || { shape: 'box' };
  const g = new THREE.Group();
  const mk = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  switch (I.shape) {
    case 'battery': mk(new THREE.CylinderGeometry(0.017, 0.017, 0.065, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.4 })).rotation.z = Math.PI / 2; mk(new THREE.CylinderGeometry(0.0172, 0.0172, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xb08a20, metalness: 0.7, roughness: 0.3 })).position.set(0.022, 0, 0); g.children[1].rotation.z = Math.PI / 2; g.position.y = 0.017; break;
    case 'fuse': mk(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 10), plainMat('glass')).rotation.z = Math.PI / 2; for (const x of [-0.055, 0.055]) mk(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 10), plainMat('rail')).position.x = x; g.children.slice(1).forEach((c) => (c.rotation.z = Math.PI / 2)); break;
    case 'filter': mk(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 14), new THREE.MeshStandardMaterial({ color: 0x3a4a30, metalness: 0.5, roughness: 0.5 })); break;
    case 'circuit': mk(new THREE.BoxGeometry(0.12, 0.012, 0.08), new THREE.MeshStandardMaterial({ color: 0x1d5a2a, roughness: 0.6 })); for (let i = 0; i < 5; i++) mk(new THREE.BoxGeometry(0.015, 0.012, 0.015), plainMat('dark_metal')).position.set(-0.04 + i * 0.02, 0.01, 0); break;
    case 'card': mk(new THREE.BoxGeometry(0.085, 0.003, 0.054), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.5 })); break;
    case 'flare': mk(new THREE.CylinderGeometry(0.018, 0.018, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0xaa1a10, roughness: 0.6 })).rotation.z = Math.PI / 2; break;
    case 'bottle': mk(PG.bottleGeometry(), plainMat('glass_dirty')).rotation.z = Math.PI / 2; break;
    case 'crowbar': mk(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x8a1a10, metalness: 0.6, roughness: 0.4 })).rotation.z = Math.PI / 2; break;
    case 'key': { const mat = new THREE.MeshStandardMaterial({ color: 0xb8a060, metalness: 0.9, roughness: 0.3 }); mk(new THREE.TorusGeometry(0.018, 0.005, 6, 12), mat).rotation.x = Math.PI / 2; mk(new THREE.BoxGeometry(0.06, 0.004, 0.008), mat).position.x = 0.045; mk(new THREE.BoxGeometry(0.03, 0.02, 0.012), new THREE.MeshStandardMaterial({ color: I.color || 0x888888 })).position.set(-0.03, 0, 0); break; }
    case 'tape': mk(new THREE.BoxGeometry(0.1, 0.015, 0.065), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4 })); break;
    case 'vial': mk(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x40ff80, emissive: 0x20a040, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 })).rotation.z = Math.PI / 2; break;
    case 'wire': mk(new THREE.TorusGeometry(0.08, 0.015, 6, 16), plainMat('cable_red')).rotation.x = Math.PI / 2; break;
    case 'wheel': mk(new THREE.TorusGeometry(0.2, 0.025, 8, 20), new THREE.MeshStandardMaterial({ color: 0x8a1a10, metalness: 0.6, roughness: 0.5 })).rotation.x = Math.PI / 2; break;
    default: mk(new THREE.BoxGeometry(0.12, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: I.color || 0x555555 }));
  }
  return g;
}

async function modelInstance(name, size) {
  const gltf = await loadModel(name);
  if (!gltf) return null;
  const o = gltf.scene.clone(true);
  if (size) { const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3()); o.scale.setScalar(size / Math.max(s.x, s.y, s.z)); }
  return o;
}

// glint sprite so pickups can be found in the dark
let glintTex = null;
function glint() {
  if (!glintTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.2, 'rgba(255,220,160,0.5)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glintTex = new THREE.CanvasTexture(c); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: new THREE.Color(0.5, 0.45, 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(0.25);
  return s;
}

export class Interactable {
  constructor(game, data) {
    this.game = game; this.data = data;
    this.id = data.id; this.type = data.type;
    this.pos = data.pos.clone();
    this.reach = data.reach ?? 2.1;
    this.hold = data.hold ?? 0;
    this.enabled = data.enabled !== false;
    this.used = false;
    this.object = new THREE.Group();
    this.object.position.copy(this.pos);
    this.object.rotation.y = data.rotY || 0;
  }
  prompt() { return this.data.prompt || 'Использовать'; }
  canUse() { return this.enabled; }
  use() {}
  update() {}
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.doors = new Map(); // "x,y" -> door
    this.byId = new Map();
    this.group = new THREE.Group();
    game.scene.add(this.group);
  }

  add(e) { this.list.push(e); if (e.id) this.byId.set(e.id, e); this.group.add(e.object); return e; }
  get(id) { return this.byId.get(id) || this.doorsById?.get(id); }
  remove(e) { this.list.splice(this.list.indexOf(e), 1); e.object.removeFromParent(); if (e.id) this.byId.delete(e.id); }

  // ---------------- doors ----------------
  buildDoors(grid, level) {
    this.doorsById = new Map();
    for (const d of Object.values(grid.doors)) {
      const door = this.makeDoor(d, level);
      this.doors.set(`${d.x},${d.y}`, door);
      this.doorsById.set(door.id, door);
    }
  }

  makeDoor(d, level) {
    const g = this.game, ph = g.physics;
    const cx = (d.x + 0.5) * CELL, cz = (d.y + 0.5) * CELL;
    const b = level.builder;
    const floorY = b.floorH[b.idx(d.x, d.y)], ceilY = b.ceilH[b.idx(d.x, d.y)];
    const ew = !b.solid(d.x - 1, d.y) && !b.solid(d.x + 1, d.y);
    const type = d.type || 'door';
    const W = type === 'gate' ? CELL - 0.1 : type === 'hermetic' ? 1.6 : 1.25;
    const H = type === 'gate' ? Math.min(ceilY - floorY - 0.05, 3.2) : type === 'hermetic' ? 2.3 : 2.15;
    const root = new THREE.Group();
    root.position.set(cx, floorY, cz);
    root.rotation.y = ew ? Math.PI / 2 : 0; // door plane faces passage axis
    const wallMat = getMat(type === 'hermetic' ? 'bunker_wall' : 'concrete', { vc: false });
    // side fills + lintel (so the doorway is narrower than the cell)
    const fillW = (CELL - W) / 2 - 0.12;
    if (fillW > 0.05) for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(fillW, ceilY - floorY, 0.3), wallMat); f.position.set(s * (W / 2 + 0.12 + fillW / 2), (ceilY - floorY) / 2, 0); f.castShadow = f.receiveShadow = true; root.add(f); }
    if (ceilY - floorY - H > 0.15) { const l = new THREE.Mesh(new THREE.BoxGeometry(CELL, ceilY - floorY - H - 0.12, 0.3), wallMat); l.position.set(0, H + 0.12 + (ceilY - floorY - H - 0.12) / 2, 0); l.castShadow = l.receiveShadow = true; root.add(l); }
    const frame = new THREE.Mesh(PG.doorFrameGeometry(W, H, 0.3), plainMat('dark_metal')); frame.castShadow = true; root.add(frame);
    // static colliders for fills
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), root.rotation.y);
    for (const s of [-1, 1]) {
      const local = new THREE.Vector3(s * (W / 2 + (CELL - W) / 4), 0, 0).applyQuaternion(q);
      ph.addBox({ x: cx + local.x, y: floorY + 1.5, z: cz + local.z, hx: ew ? 0.15 : (CELL - W) / 4, hy: 2.5, hz: ew ? (CELL - W) / 4 : 0.15 });
    }
    let leaf, hinge = new THREE.Group();
    if (d.rubble) {
      leaf = new THREE.Group();
      const rm = getMat('rock', { vc: false });
      for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(PG.rockGeometry(20 + i, 0.55 + (i % 3) * 0.2), rm); r.position.set((Math.random() - 0.5) * (CELL - 0.4), 0.3 + Math.floor(i / 5) * 0.8 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); r.castShadow = r.receiveShadow = true; leaf.add(r); }
    } else if (type === 'gate') leaf = new THREE.Mesh(d.shutter ? PG.shutterGeometry(W, H) : PG.gateGeometry(W, H), d.shutter ? getMat('rusty_paint', { vc: false }) : plainMat('steel'));
    else if (type === 'hermetic') leaf = new THREE.Mesh(PG.hermeticLeafGeometry(W, H), getMat('rusty_paint', { vc: false }));
    else leaf = new THREE.Mesh(PG.doorLeafGeometry(W, H), getMat(d.metal ? 'rusty_paint' : 'rust_light', { vc: false }));
    leaf.castShadow = true; leaf.receiveShadow = true;
    if (type === 'gate') { hinge.position.set(0, 0, 0); leaf.position.set(0, 0, 0); }
    else { hinge.position.set(-W / 2, 0, 0); }
    hinge.add(leaf);
    root.add(hinge);
    g.scene.add(root);
    const col = ph.addKinematicBox(type === 'gate' ? W / 2 : W / 2, H / 2, 0.08, new THREE.Vector3(cx, floorY + H / 2, cz), q);
    const door = {
      ...d, type, root, hinge, leaf, col, W, H, ew, floorY, cx, cz,
      open: !!d.open, locked: !!d.locked, sealed: !!d.sealed, angle: 0, targetAngle: d.open ? 1 : 0, hp: d.hp ?? 3,
      pos: new THREE.Vector3(cx, floorY + 1.2, cz), dir: 1,
    };
    if (door.open) door.angle = 1;
    this.updateDoorTransform(door);
    // interactable proxy
    const it = new Interactable(g, { id: door.id, type: 'door', pos: door.pos, reach: 2.4 });
    it.door = door;
    it.prompt = () => door.locked ? (door.key ? `Заперто (${ITEMS[door.key]?.name || 'ключ'})` : door.lockText || 'Заперто') : door.open ? (type === 'gate' ? '' : 'Закрыть') : (type === 'hermetic' ? 'Открыть гермодверь' : type === 'gate' ? 'Поднять решётку' : 'Открыть');
    it.hold = type === 'hermetic' ? 1.6 : 0;
    it.canUse = () => !(type === 'gate' && door.open) && !door.sealed && !d.rubble && !d.noUse;
    if (d.rubble) { door.sealed = true; }
    it.use = (p) => this.tryDoor(door, p);
    this.list.push(it);
    door.interact = it;
    return door;
  }

  tryDoor(door, player) {
    const g = this.game;
    if (door.locked) {
      if (door.key && player.hasItem(door.key)) {
        door.locked = false;
        if (!door.keepKey) player.useItem(door.key);
        g.hud.toast(`Использован: ${ITEMS[door.key]?.name || door.key}`);
        audio.play('switch_lever', { pos: door.pos, volume: 0.6 });
        g.mission?.event('unlock:' + door.id);
        g.net?.sendEvent({ t: 'door', id: door.id, open: true, unlock: true });
      } else {
        audio.play('knock', { pos: door.pos, volume: 0.4, rate: 1.6 });
        g.hud.toast(door.lockText || (door.key ? `Нужен: ${ITEMS[door.key]?.name || 'ключ'}` : 'Заперто'), 'warn');
        g.emitNoise(door.pos, 4, 'rattle');
        return;
      }
    }
    // open away from the player
    const toP = player.position.clone().sub(door.pos);
    const nrm = door.ew ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    door.dir = toP.dot(nrm) > 0 ? -1 : 1;
    this.setDoor(door, !door.open);
    g.net?.sendEvent({ t: 'door', id: door.id, open: door.open, dir: door.dir });
  }

  setDoor(door, open, byMonster = false) {
    if (door.open === open) return;
    door.open = open;
    door.targetAngle = open ? 1 : 0;
    const g = this.game;
    if (door.type === 'hermetic') audio.play('door_heavy', { pos: door.pos, volume: 1, reverb: 0.6 });
    else if (door.type === 'gate') audio.play('metal_screech', { pos: door.pos, volume: 0.7, rate: 1.3 });
    else audio.play('creak', { pos: door.pos, volume: byMonster ? 1 : 0.75, rate: 0.9 + Math.random() * 0.3, reverb: 0.4 });
    g.emitNoise(door.pos, door.type === 'door' ? 9 : 16, 'door');
    g.mission?.event((open ? 'open:' : 'close:') + door.id);
  }

  bashDoor(door) {
    const g = this.game;
    door.hp -= 1;
    audio.play('slam', { pos: door.pos, volume: 1, reverb: 0.6 });
    g.emitNoise(door.pos, 20, 'bash');
    g.player.shake = Math.min(1, g.player.shake + 0.3 / Math.max(1, door.pos.distanceTo(g.player.position) / 5));
    g.fx?.emit(door.pos, 12, { color: [0.4, 0.35, 0.3], speed: 2, life: 0.8 });
    if (door.hp <= 0) { door.locked = false; door.sealed = false; door.broken = true; this.setDoor(door, true, true); door.leaf.rotation.z = 0.3; }
  }

  updateDoorTransform(door) {
    const a = door.angle;
    if (door.rubble) {
      door.hinge.position.y = -a * 3.5;
      door.hinge.visible = a < 0.98;
      const p = door.col.body.translation();
      door.col.body.setNextKinematicTranslation({ x: p.x, y: door.floorY + door.H / 2 - a * 8, z: p.z });
      if (a > 0 && a < 0.9 && Math.random() < 0.5) this.game.fx?.emit(door.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)), 3, { color: [0.35, 0.32, 0.28], speed: 2, up: 2, life: 1.2, gravity: 1 });
      return;
    }
    if (door.type === 'gate') {
      door.hinge.position.y = a * (door.H - 0.3);
      const p = door.col.body.translation();
      door.col.body.setNextKinematicTranslation({ x: p.x, y: door.floorY + door.H / 2 + a * (door.H + 0.4), z: p.z });
    } else {
      const ang = a * (door.type === 'hermetic' ? 1.45 : 1.75) * door.dir;
      door.hinge.rotation.y = ang;
      // collider follows the leaf: centre at hinge + rotated half width
      const worldRot = door.root.rotation.y + ang;
      const Y = new THREE.Vector3(0, 1, 0);
      const local = new THREE.Vector3(-door.W / 2, 0, 0).add(new THREE.Vector3(door.W / 2, 0, 0).applyAxisAngle(Y, ang)).applyAxisAngle(Y, door.root.rotation.y);
      const q = new THREE.Quaternion().setFromAxisAngle(Y, worldRot);
      door.col.body.setNextKinematicTranslation({ x: door.cx + local.x, y: door.floorY + door.H / 2, z: door.cz + local.z });
      door.col.body.setNextKinematicRotation(q);
    }
  }

  doorAt(x, y) { return this.doors.get(`${x},${y}`); }

  // ---------------- spawn mission entities ----------------
  async spawn(def, level) {
    const g = this.game;
    const cx = (def.x + 0.5) * CELL + (def.ox || 0), cz = (def.y + 0.5) * CELL + (def.oz || 0);
    const fy = level.floorAt(cx, cz);
    const pos = new THREE.Vector3(cx, fy + (def.oy || 0), cz);
    const T = def.type;
    let e;
    if (T === 'item') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + (def.h ?? 0.02)), prompt: `Подобрать: ${ITEMS[def.item]?.name || def.item}${(def.count || 1) > 1 ? ' ×' + def.count : ''}` });
      const I = ITEMS[def.item] || {};
      const mesh = I.model ? await modelInstance(I.model, I.size) : itemMesh(def.item);
      if (mesh) { mesh.rotation.y = Math.random() * 6; e.object.add(mesh); }
      const gl = glint(); gl.position.y = 0.12; e.object.add(gl); e.glint = gl;
      e.use = (p) => {
        p.addItem(def.item, def.count || 1);
        if (def.item === 'flashlight') { p.hasFlashlight = true; p.setFlashlight(true); }
        if (def.item === 'gasmask') g.gasMask = true;
        audio.play('pickup', { bus: 'ui' });
        g.hud.toast(`Получено: ${ITEMS[def.item]?.name || def.item}${(def.count || 1) > 1 ? ' ×' + def.count : ''}`);
        g.mission?.event('pickup:' + def.item, def);
        if (def.id) g.mission?.event('use:' + def.id);
        g.net?.sendEvent({ t: 'pickup', id: e.id, item: def.item, count: def.count || 1 });
        this.remove(e);
        g.markTaken(e.id);
      };
      e.update = (dt) => { if (e.glint) e.glint.material.opacity = 0.5 + 0.5 * Math.sin(performance.now() * 0.004 + cx); };
    } else if (T === 'note') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + (def.h ?? 0.01)), prompt: 'Прочитать' });
      const paper = new THREE.Mesh(PG.paperGeometry(), new THREE.MeshStandardMaterial({ color: 0xd8cfb4, emissive: 0x3a3426, roughness: 0.9, side: THREE.DoubleSide })); paper.scale.setScalar(2.2); e.object.add(paper);
      const gl = glint(); gl.position.y = 0.08; gl.scale.setScalar(0.18); e.object.add(gl);
      e.use = () => { g.hud.showNote(def.title, def.text, def.sign); g.collectNote(def.noteId || def.id); g.mission?.event('read:' + (def.id || def.noteId)); if (def.id) g.mission?.event('use:' + def.id); };
    } else if (T === 'locker') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 1), prompt: 'Спрятаться', reach: 1.8 });
      const body = new THREE.Mesh(PG.lockerGeometry(), getMat('metal', { vc: false })); body.castShadow = true; e.object.add(body);
      const doorM = new THREE.Mesh(PG.lockerDoorGeometry(), getMat('rust_light', { vc: false })); doorM.position.set(-0.29, 0, 0.28); e.object.add(doorM);
      e.object.position.y = fy;
      const rot = def.rotY || 0;
      e.object.rotation.y = rot;
      const fwd = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      e.eye = pos.clone().setY(fy + 1.55).addScaledVector(fwd, 0.05);
      e.exit = pos.clone().setY(fy).addScaledVector(fwd, 0.8);
      e.yaw = rot + Math.PI;
      g.physics.addBox({ x: cx, y: fy + 1, z: cz, hx: 0.32, hy: 1, hz: 0.3, rotY: rot });
      e.use = (p) => p.hideIn(e);
    } else if (T === 'switch' || T === 'lever' || T === 'panel' || T === 'terminal' || T === 'valve' || T === 'generator' || T === 'radio' || T === 'keypad' || T === 'trainControls' || T === 'exit' || T === 'barricade' || T === 'device') {
      e = await this.makeDevice(def, pos, fy);
    } else if (T === 'body') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 0.3), prompt: 'Осмотреть', reach: 2 });
      const h = await Human.create({ mode: 'corpse', skin: def.skin || 'stalker' });
      if (h) { h.root.rotation.y = def.rotY ?? Math.random() * 6; e.object.add(h.root); e.object.position.copy(pos); }
      e.use = (p) => {
        if (def.text) g.hud.subtitle(def.text, 5, def.who);
        if (def.item && !e.looted) { e.looted = true; p.addItem(def.item, def.count || 1); g.hud.toast(`Найдено: ${ITEMS[def.item]?.name || def.item}`); audio.play('pickup', { bus: 'ui' }); }
        g.mission?.event('use:' + def.id);
        e.enabled = !!def.repeat;
      };
      if (def.blood !== false) { /* blood pool via decal-like plane */ const bm = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), plainMat('blood')); bm.rotation.x = -Math.PI / 2; bm.position.set(cx, fy + 0.012, cz); g.scene.add(bm); }
    } else if (T === 'npc') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 1.2), prompt: def.prompt || 'Поговорить', reach: 2.4 });
      const hm = await Human.create({ mode: 'player', skin: def.skin || 'military' });
      if (hm) { hm.root.rotation.y = def.rotY ?? 0; e.object.add(hm.root); e.object.position.copy(pos); e.human = hm; hm.crouch = !!def.sit; }
      e.lineIdx = 0;
      e.use = () => {
        const lines = def.lines || [];
        if (lines.length) { const [t, d] = Array.isArray(lines[Math.min(e.lineIdx, lines.length - 1)]) ? lines[Math.min(e.lineIdx, lines.length - 1)] : [lines[Math.min(e.lineIdx, lines.length - 1)], 4]; g.hud.subtitle(t, d, def.name || 'Выживший'); e.lineIdx++; }
        g.mission?.event('use:' + def.id);
      };
      e.update = (dt) => { if (e.human && e.object.visible) { e.human.update(dt); const pl = g.player.position; const lp = e.object.position; const want = Math.atan2(pl.x - lp.x, pl.z - lp.z); if (pl.distanceTo(lp) < 6) e.human.root.rotation.y += (want - e.human.root.rotation.y) * Math.min(1, dt * 2); } };
    } else if (T === 'camera') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + (def.oy ?? 2.6)), prompt: '' });
      e.enabled = false;
      const cm = await modelInstance('security_camera_01', 0.45);
      if (cm) { cm.rotation.y = def.rotY || 0; e.object.add(cm); }
      e.object.position.copy(pos).setY(fy + (def.oy ?? 2.6));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1) })); led.position.y = -0.1; e.object.add(led);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.38) * 9, 9, 20, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.05, 0.02), transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      cone.rotation.x = -Math.PI / 2; cone.position.z = 4.5; const pivot = new THREE.Group(); pivot.add(cone); pivot.rotation.x = 0.35; e.object.add(pivot);
      e.sweep = 0; e.cd = 0; e.on = def.active !== false;
      e.update = (dt) => {
        e.sweep += dt * 0.5;
        const yaw = (def.rotY || 0) + Math.sin(e.sweep) * (def.sweep ?? 0.7);
        pivot.rotation.y = yaw - (def.rotY || 0); if (cm) cm.rotation.y = yaw;
        cone.visible = e.on;
        e.cd -= dt;
        if (!e.on || e.cd > 0 || g.player.hidden) return;
        const pl = g.player.position;
        const to = pl.clone().sub(e.object.position); const d = to.length();
        if (d > 10) return;
        const dir = new THREE.Vector3(Math.sin(yaw), -0.35, Math.cos(yaw)).normalize();
        const dark = g.level.lamps.lightAt(pl) < 0.2 && !g.player.flashOn && g.player.crouching;
        if (to.normalize().dot(dir) > Math.cos(0.42) && !dark && g.level.losWorld(e.object.position, pl)) {
          e.cd = 8; led.material.color.set(new THREE.Color(5, 0.5, 0.2));
          audio.play('buzz', { pos: e.object.position, volume: 1, rate: 1.6 });
          g.hud.toast('Камера заметила вас! Тревога!', 'warn');
          g.emitNoise(pl, 30, 'alarm');
          g.mission?.event('alarm:' + (def.id || 'cam'));
          g.mission?.event('alarm');
        }
      };
    } else if (T === 'fire') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 0.8), prompt: def.prompt || 'Разжечь огонь', reach: 2.2 });
      const bm = await modelInstance('barrel_03', 1.0);
      if (bm) e.object.add(bm);
      e.object.position.set(pos.x, fy, pos.z);
      g.physics.addBox({ x: pos.x, y: fy + 0.5, z: pos.z, hx: 0.32, hy: 0.5, hz: 0.32 });
      e.canUse = () => e.enabled && !e.used;
      e.use = (p) => {
        if (def.needs && !p.hasItem(def.needs)) { g.hud.toast(`Нужно: ${ITEMS[def.needs]?.name}`, 'warn'); return; }
        if (def.needs) p.useItem(def.needs);
        e.used = true;
        e.lamp = g.level.lamps.add({ type: 'fire', x: pos.x, y: fy + 1.2, z: pos.z, circuit: 'always', state: 'flicker', intensity: 50, range: 12 });
        audio.play('spark', { pos: e.pos, volume: 0.8 });
        e.snd = audio.play('steam', { pos: e.pos, loop: true, volume: 0.15, rate: 0.6 });
        g.mission?.event('use:' + def.id);
        g.net?.sendEvent({ t: 'use', id: e.id });
      };
      e.update = () => { if (e.used && Math.random() < 0.5) g.fx?.emit(e.pos.clone().setY(fy + 1.05), 1, { color: [4, 1.6, 0.4], speed: 0.3, up: 2, life: 0.7, gravity: -0.5 }); };
    } else if (T === 'train') {
      e = new Interactable(g, { ...def, pos, prompt: '' });
      e.enabled = false;
      const n = def.cars || 1;
      const len = 19;
      const tr = new THREE.Group();
      for (let i = 0; i < n; i++) { const car = PG.buildTrainCar({ length: len, cab: i === 0, lit: !!def.lit }); car.position.x = -i * (len + 0.6); tr.add(car); }
      tr.rotation.y = def.axis === 'y' ? Math.PI / 2 * (def.dir || 1) : def.dir === -1 ? Math.PI : 0;
      tr.position.set(0, (def.railY ?? 0) + 0.18, 0);
      e.object.add(tr);
      e.train = tr;
      e.object.position.copy(pos);
      if (def.collide !== false) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tr.rotation.y);
        for (let i = 0; i < n; i++) {
          const off = new THREE.Vector3(-i * (len + 0.6), 0, 0).applyQuaternion(q);
          const kb = g.physics.addKinematicBox(len / 2, 1.8, 1.4, new THREE.Vector3(pos.x + off.x, pos.y + 1.9, pos.z + off.z), q);
          (e.colliders ||= []).push({ kb, off });
        }
      }
      e.setLit = (on) => tr.traverse((o) => { if (o.name === 'headlights') o.material.color.set(on ? new THREE.Color(6, 5.2, 4) : new THREE.Color(0.08, 0.08, 0.07)); if (o.name === 'interiorLights') o.material.color.set(on ? new THREE.Color(2.6, 2.4, 2.0) : new THREE.Color(0.06, 0.06, 0.06)); });
      e.moveTo = (target, dur) => { e.anim = { from: e.object.position.clone(), to: target.clone(), t: 0, dur }; };
      e.update = (dt) => {
        if (!e.anim) return;
        e.anim.t += dt;
        const k = Math.min(1, e.anim.t / e.anim.dur);
        const s = k * k * (3 - 2 * k);
        e.object.position.lerpVectors(e.anim.from, e.anim.to, s);
        if (e.colliders) for (const c of e.colliders) c.kb.body.setNextKinematicTranslation({ x: e.object.position.x + c.off.x, y: e.object.position.y + 1.9, z: e.object.position.z + c.off.z });
        if (k >= 1) { e.anim = null; e.onArrive && e.onArrive(); }
      };
    } else if (T === 'gas') {
      e = new Interactable(g, { ...def, pos, prompt: '' });
      e.enabled = false;
      e.area = { x0: def.x * CELL, z0: def.y * CELL, x1: (def.x + def.w) * CELL, z1: (def.y + def.h) * CELL };
      // green haze particles
      const cnt = Math.floor(def.w * def.h * 6);
      const pp = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { pp[i * 3] = e.area.x0 + Math.random() * (e.area.x1 - e.area.x0); pp[i * 3 + 1] = fy + Math.random() * 2.2; pp[i * 3 + 2] = e.area.z0 + Math.random() * (e.area.z1 - e.area.z0); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(0.25, 0.5, 0.12), size: 0.9, transparent: true, opacity: 0.12, depthWrite: false, sizeAttenuation: true }));
      g.scene.add(pts);
      e.haze = pts;
      e.inside = (p) => p.x > e.area.x0 && p.x < e.area.x1 && p.z > e.area.z0 && p.z < e.area.z1;
      e.update = (dt) => { pts.rotation.y = 0; pts.position.y = Math.sin(performance.now() * 0.0003) * 0.2; };
    } else if (T === 'steam') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 0.2), prompt: '' });
      e.enabled = false; e.active = def.active !== false;
      e.update = (dt) => {
        if (!e.active) { if (e.snd) { e.snd.stop(); e.snd = null; } return; }
        if (!e.snd && g.player.position.distanceTo(e.pos) < 25) e.snd = audio.play('steam', { pos: e.pos, loop: true, volume: 0.5 });
        g.fx?.emit(e.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), 2, { color: [0.35, 0.36, 0.38], speed: 0.4, up: 3.5, life: 1.0, gravity: -1 });
        const d = g.player.position.distanceTo(e.pos.clone().setY(g.player.position.y));
        if (d < 1.4) g.player.damage(dt * 30, e.pos);
      };
    } else if (T === 'lamp') {
      e = new Interactable(g, { ...def, pos, prompt: '' });
      e.enabled = false;
      const L = g.level.lamps.add({ type: def.lamp || 'beacon', x: cx, y: fy + (def.oy ?? 2.4), z: cz, circuit: def.circuit || 'always', state: def.state || 'on', id: def.id, color: def.color, intensity: def.intensity, range: def.range, rotY: def.rotY });
      if (def.group) L.group = def.group;
      g.level.lamps.finalize();
      e.lamp = L;
    } else if (T === 'prop') {
      e = new Interactable(g, { ...def, pos, prompt: '' });
      e.enabled = false;
      const o = await modelInstance(def.model, def.size);
      if (o) { o.rotation.y = def.rotY || 0; o.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); e.object.add(o); if (def.solid) { const b = new THREE.Box3().setFromObject(o); const s = b.getSize(new THREE.Vector3()); g.physics.addBox({ x: cx, y: fy + s.y / 2, z: cz, hx: s.x / 2, hy: s.y / 2, hz: s.z / 2 }); } }
    } else if (T === 'ambient') {
      e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 1.5), prompt: '' });
      e.enabled = false;
      e.update = () => { if (!e.snd && g.player.position.distanceTo(e.pos) < 30) e.snd = audio.play(def.sound, { pos: e.pos, loop: true, volume: def.volume ?? 0.5 }); };
    } else {
      e = new Interactable(g, { ...def, pos, prompt: def.prompt || '' });
      e.enabled = false;
    }
    e.def = def;
    if (def.hidden) { e.object.visible = false; e.enabled = false; }
    this.add(e);
    return e;
  }

  async makeDevice(def, pos, fy) {
    const g = this.game;
    const T = def.type;
    const e = new Interactable(g, { ...def, pos: pos.clone().setY(fy + 1.2), reach: def.reach ?? 2.2 });
    const rot = def.rotY || 0;
    e.object.position.set(pos.x, fy, pos.z);
    e.object.rotation.y = rot;
    const dark = plainMat('dark_metal');
    const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; e.object.add(m); return m; };
    let indicator = null;
    const lightMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.2, 0.1) });
    const setInd = (on) => indicator && indicator.material.color.set(on ? new THREE.Color(0.2, 3, 0.4) : new THREE.Color(2.5, 0.2, 0.1));
    e.setIndicator = setInd;
    switch (T) {
      case 'switch': case 'lever': {
        mk(new THREE.BoxGeometry(0.45, 0.6, 0.15), getMat('metal', { vc: false }), 0, 1.3, 0);
        const lev = new THREE.Group(); lev.position.set(0, 1.3, 0.1); e.object.add(lev);
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.32, 0.04), plainMat('pipe_red')); h.position.y = 0.14; lev.add(h);
        lev.rotation.x = -0.6; e.lever = lev;
        indicator = mk(new THREE.SphereGeometry(0.025, 8, 6), lightMat(), 0.15, 1.55, 0.08);
        e.object.position.y = fy;
        break;
      }
      case 'panel': {
        mk(new THREE.BoxGeometry(0.7, 0.9, 0.22), getMat('metal', { vc: false }), 0, 1.4, 0);
        for (let i = 0; i < (def.count || 3); i++) mk(new THREE.BoxGeometry(0.1, 0.16, 0.04), dark, -0.2 + i * 0.2, 1.4, 0.12);
        indicator = mk(new THREE.SphereGeometry(0.03, 8, 6), lightMat(), 0.25, 1.75, 0.12);
        mk(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), plainMat('cable'), 0.3, 0.7, 0.05);
        break;
      }
      case 'terminal': {
        mk(new THREE.BoxGeometry(0.9, 1.0, 0.6), getMat('metal', { vc: false }), 0, 0.5, 0);
        const scr = mk(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.25, 0.08) }), 0, 1.25, 0.06);
        mk(new THREE.BoxGeometry(0.62, 0.48, 0.12), dark, 0, 1.25, 0);
        scr.position.z = 0.065;
        e.screen = scr;
        indicator = mk(new THREE.SphereGeometry(0.02, 8, 6), lightMat(), 0.35, 0.95, 0.31);
        break;
      }
      case 'valve': {
        const pipe = mk(new THREE.CylinderGeometry(0.12, 0.12, 3, 12), plainMat('pipe'), 0, 1.5, -0.1);
        void pipe;
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 20), plainMat('pipe_red')); wheel.position.set(0, 1.3, 0.12); e.object.add(wheel);
        for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.02), plainMat('pipe_red')); sp.rotation.z = i * Math.PI / 3; wheel.add(sp); }
        e.wheel = wheel;
        e.hold = def.hold ?? 2.0;
        break;
      }
      case 'generator': {
        const gen = await modelInstance('portable_generator', 1.0);
        if (gen) { e.object.add(gen); }
        else mk(new THREE.BoxGeometry(1, 0.7, 0.6), getMat('rusty_paint', { vc: false }), 0, 0.35, 0);
        indicator = mk(new THREE.SphereGeometry(0.03, 8, 6), lightMat(), 0, 0.9, 0.3);
        e.hold = def.hold ?? 1.5;
        g.physics.addBox({ x: pos.x, y: fy + 0.4, z: pos.z, hx: 0.55, hy: 0.4, hz: 0.4, rotY: rot });
        break;
      }
      case 'radio': {
        const r = await modelInstance('vintage_radio_transceiver', 0.5);
        mk(new THREE.BoxGeometry(0.9, 0.75, 0.55), getMat('wood', { vc: false }), 0, 0.375, 0);
        if (r) { r.position.y = 0.75; e.object.add(r); }
        indicator = mk(new THREE.SphereGeometry(0.02, 8, 6), lightMat(), 0.25, 0.95, 0.2);
        break;
      }
      case 'keypad': {
        mk(new THREE.BoxGeometry(0.2, 0.3, 0.05), dark, 0, 1.35, 0);
        for (let i = 0; i < 12; i++) mk(new THREE.BoxGeometry(0.04, 0.035, 0.02), plainMat('steel'), -0.05 + (i % 3) * 0.05, 1.42 - Math.floor(i / 3) * 0.05, 0.03);
        indicator = mk(new THREE.SphereGeometry(0.012, 8, 6), lightMat(), 0.07, 1.48, 0.03);
        break;
      }
      case 'trainControls': {
        indicator = mk(new THREE.SphereGeometry(0.03, 8, 6), lightMat(), 0, 0.1, 0);
        break;
      }
      case 'exit': {
        const lad = await modelInstance('ladder_sectioned_01', 3.0);
        if (lad) e.object.add(lad);
        else for (let i = 0; i < 10; i++) mk(new THREE.BoxGeometry(0.5, 0.03, 0.03), plainMat('steel'), 0, 0.3 + i * 0.3, 0);
        mk(new THREE.BoxGeometry(0.03, 3.2, 0.03), plainMat('steel'), -0.25, 1.6, 0); mk(new THREE.BoxGeometry(0.03, 3.2, 0.03), plainMat('steel'), 0.25, 1.6, 0);
        break;
      }
      case 'barricade': {
        e.planks = [];
        for (let i = 0; i < 3; i++) { const p = mk(new THREE.BoxGeometry(CELL * 0.95, 0.18, 0.05), getMat('wood', { vc: false }), 0, 0.5 + i * 0.6, 0); p.rotation.z = (Math.random() - 0.5) * 0.15; p.visible = false; e.planks.push(p); }
        e.hold = def.hold ?? 1.2;
        break;
      }
      default: {
        mk(new THREE.BoxGeometry(0.5, 0.5, 0.3), getMat('metal', { vc: false }), 0, 1.2, 0);
        indicator = mk(new THREE.SphereGeometry(0.02, 8, 6), lightMat(), 0.2, 1.4, 0.16);
      }
    }
    e.indicator = indicator;
    setInd(!!def.on);
    e.prompt = () => (typeof def.prompt === 'function' ? def.prompt(e) : def.prompt) || ({ switch: 'Переключить', lever: 'Опустить рычаг', panel: 'Вставить предохранители', terminal: 'Использовать терминал', valve: 'Повернуть вентиль', generator: 'Запустить генератор', radio: 'Настроить радио', keypad: 'Ввести код', trainControls: 'Пульт машиниста', exit: 'Выбраться', barricade: 'Заколотить проход', device: 'Использовать' }[T]);
    e.canUse = () => e.enabled && (def.toggle || !(def.once !== false && e.used && T !== 'radio' && T !== 'keypad' && T !== 'trainControls'));
    e.use = (p) => this.useDevice(e, p);
    return e;
  }

  useDevice(e, p) {
    const g = this.game;
    const def = e.def;
    const T = def.type;
    if (def.requiresFlag && !g.mission?.flags[def.requiresFlag]) { g.hud.toast(def.requiresText || 'Не работает', 'warn'); return; }
    // requirements (items to deliver)
    if (def.needs) {
      const have = p.inventory[def.needs] || 0;
      e.delivered = e.delivered || 0;
      const need = (def.count || 1) - e.delivered;
      if (have <= 0 && need > 0) { g.hud.toast(def.needText || `Нужно: ${ITEMS[def.needs]?.name || def.needs} (${e.delivered}/${def.count || 1})`, 'warn'); audio.play('click', { bus: 'ui' }); return; }
      const give = Math.min(have, need);
      p.useItem(def.needs, give);
      e.delivered += give;
      audio.play('switch_lever', { pos: e.pos, volume: 0.6 });
      if (e.delivered < (def.count || 1)) { g.hud.toast(`${ITEMS[def.needs]?.name}: ${e.delivered}/${def.count}`); g.net?.sendEvent({ t: 'deliver', id: e.id, n: e.delivered }); return; }
    }
    if (T === 'keypad') { g.hud.keypad(def.code, (ok) => { if (ok) this.activate(e); }); return; }
    if (T === 'radio') { g.hud.radio(def.freq ?? 104.7, () => this.activate(e)); return; }
    this.activate(e);
  }

  activate(e, remote = false) {
    const g = this.game, def = e.def, T = def.type;
    if (def.toggle) {
      e.on = !e.on;
      if (e.setIndicator) e.setIndicator(e.on);
      if (e.lever) e.lever.rotation.x = e.on ? 0.6 : -0.6;
      audio.play('switch_lever', { pos: e.pos, volume: 0.7 });
      if (!remote) g.net?.sendEvent({ t: 'use', id: e.id });
      g.mission?.event('use:' + e.id, def);
      return;
    }
    if (e.used && def.once !== false && T !== 'trainControls') return;
    e.used = true;
    if (e.setIndicator) e.setIndicator(true);
    if (e.lever) e.lever.rotation.x = 0.6;
    if (e.screen) e.screen.material.color.set(new THREE.Color(0.2, 1.2, 0.4));
    if (e.wheel) e.wheel.rotation.z += Math.PI * 2;
    if (e.planks) e.planks.forEach((pl) => (pl.visible = true));
    const snd = { switch: 'switch_lever', lever: 'switch_lever', panel: 'power_on', generator: 'generator', terminal: 'ui', valve: 'metal_screech', radio: 'radio_static', keypad: 'click', barricade: 'impact_wood' }[T];
    if (snd) audio.play(snd, { pos: e.pos, volume: 0.8, rate: T === 'valve' ? 1.6 : 1 });
    if (T === 'generator') { e.genLoop = audio.play('generator', { pos: e.pos, loop: true, volume: 0.7 }); g.emitNoise(e.pos, 22, 'generator'); }
    else g.emitNoise(e.pos, T === 'barricade' ? 14 : 5, 'device');
    if (def.text) g.hud.subtitle(def.text, 4, def.who);
    if (!remote) g.net?.sendEvent({ t: 'use', id: e.id });
    g.mission?.event('use:' + e.id, def);
  }

  update(dt) {
    for (const door of this.doors.values()) {
      if (Math.abs(door.angle - door.targetAngle) > 0.001) {
        const sp = door.type === 'hermetic' ? 0.5 : door.type === 'gate' ? 0.6 : 2.2;
        door.angle += Math.sign(door.targetAngle - door.angle) * Math.min(Math.abs(door.targetAngle - door.angle), dt * sp);
        this.updateDoorTransform(door);
      }
    }
    for (const e of this.list) e.update && e.update(dt);
  }

  // best interactable in front of the player
  pick(player) {
    const cam = player.camera;
    const o = new THREE.Vector3(); cam.getWorldPosition(o);
    const d = new THREE.Vector3(); cam.getWorldDirection(d);
    let best = null, bestScore = 0;
    for (const e of this.list) {
      if (!e.enabled || !e.canUse()) continue;
      const pr = typeof e.prompt === 'function' ? e.prompt() : e.prompt;
      if (!pr) continue;
      const to = e.pos.clone().sub(o);
      const dist = to.length();
      if (dist > e.reach) continue;
      const dot = to.normalize().dot(d);
      if (dot < 0.8) continue;
      const score = dot - dist * 0.05;
      if (score > bestScore) {
        // occlusion check against walls
        const hit = this.game.physics.raycast({ x: o.x, y: o.y, z: o.z }, d.clone(), dist, player.char?.col);
        if (hit && hit.toi < dist - 0.6 && e.type !== 'door') continue;
        best = e; bestScore = score;
      }
    }
    return best;
  }

  dispose() { this.group.removeFromParent(); for (const d of this.doors.values()) d.root.removeFromParent(); }
}
