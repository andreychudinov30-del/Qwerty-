// Animated 3D backdrop for the main menu: a dim abandoned platform, flickering chandeliers, a dead train,
// dust in a light shaft, and the full-height player character (selected skin) idling and glancing at the cursor.
import * as THREE from 'three';
import { MapGrid } from '../world/mapgen.js';
import { Level } from '../world/level.js';
import { Human } from '../game/human.js';
import { buildTrainCar } from '../world/procgeo.js';
import { makeBeam, Dust } from '../game/fx.js';
import { getProfile } from '../core/save.js';
import { damp } from '../core/util.js';

export class MenuScene {
  constructor(engine) {
    this.engine = engine;
    this.mouse = new THREE.Vector2();
    this.t = 0;
    window.addEventListener('pointermove', (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); });
  }

  async build(progress = () => {}) {
    const g = new MapGrid(30, 16);
    g.station(2, 2, 24, { pw: 6, name: 'ЗАРЯ' });
    g.tunnel([[26, 2], [29, 2]]); g.tunnel([[26, 10], [29, 10]]);
    this.level = new Level(this.engine, g, { seed: 'menu', fog: 0.05, lampBroken: 0.35, lampFlicker: 0.45, ambient: 0.4, envIntensity: 0.3, chapter: 1 });
    await this.level.build(progress);
    const scene = this.level.scene;
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 120);
    scene.add(this.camera);
    this.camera.position.set(33.6, 1.25, 22.7);
    // character spot
    this.charPos = new THREE.Vector3(36, 0, 17.5);
    const key = new THREE.SpotLight(0xffd9b0, 140, 18, 0.42, 0.75, 1.6);
    key.position.set(this.charPos.x + 1.2, 6.2, this.charPos.z + 0.8);
    key.target.position.copy(this.charPos);
    key.castShadow = this.engine.quality.shadows > 0;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.PointLight(0x6080a0, 6, 8, 2);
    rim.position.set(this.charPos.x - 1.5, 2.2, this.charPos.z - 2);
    scene.add(rim);
    // light shaft (volumetric cone) + dust
    const beam = makeBeam(6.5, 1.8, 0xffd2a0, 0.05);
    beam.position.copy(key.position);
    beam.lookAt(this.charPos);
    scene.add(beam);
    this.beam = beam;
    this.dust = new Dust(500);
    scene.add(this.dust.points);
    // dead train on the north track
    const train = buildTrainCar({ length: 19, cab: true, lit: false });
    train.position.set(30, -1.1 + 0.18, 7.5);
    scene.add(train);
    const train2 = buildTrainCar({ length: 19, cab: false, lit: false });
    train2.position.set(10.6, -1.1 + 0.18, 7.5);
    scene.add(train2);
    await this.setSkin(getProfile().skin);
    this.engine.setView(scene, this.camera);
    return this;
  }

  async setSkin(id) {
    const h = await Human.create({ skin: id, mode: 'player' });
    if (!h) return;
    if (this.human) this.human.dispose();
    this.human = h;
    h.root.position.copy(this.charPos);
    h.root.rotation.y = -0.5;
    h.play('Idle', 0);
    this.scene.add(h.root);
    this.flash = 1;
  }

  update(dt) {
    if (!this.level) return;
    this.t += dt;
    const t = this.t;
    // camera: slow drift around the character, framing it on the right side
    const mobile = innerWidth < innerHeight;
    const base = new THREE.Vector3(this.charPos.x - (mobile ? 0.6 : 2.4), 1.25 + Math.sin(t * 0.2) * 0.08, this.charPos.z + (mobile ? 6.4 : 5.2));
    base.x += Math.sin(t * 0.11) * 0.35 + this.mouse.x * 0.25;
    base.y += -this.mouse.y * 0.12;
    this.camera.position.lerp(base, Math.min(1, dt * 1.5));
    const look = this.charPos.clone().add(new THREE.Vector3(mobile ? 0 : -1.35, 1.05, 0));
    this.camera.lookAt(look);
    this.camera.fov = mobile ? 52 : 38;
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    if (this.human) {
      // turn slightly toward the cursor
      const want = -0.5 + this.mouse.x * 0.35;
      this.human.root.rotation.y = damp(this.human.root.rotation.y, want, 2, dt);
      this.human.update(dt);
      const B = this.human.bones;
      if (B.Head) { B.Head.rotation.y += this.mouse.x * 0.35; B.Head.rotation.x += this.mouse.y * 0.2; }
    }
    // flicker the key light occasionally
    const f = Math.sin(t * 17.3) * Math.sin(t * 3.1) > 0.92 ? 0.25 : 1;
    this.key.intensity = damp(this.key.intensity, 140 * f, 30, dt);
    this.beam.material.uniforms.uStrength.value = 0.05 * f;
    this.beam.material.uniforms.uTime.value = t;
    this.dust.update(dt, this.camera, this.key.position, this.key.target.position.clone().sub(this.key.position).normalize(), f, 0.45, innerHeight * 0.7);
    this.level.update(dt, this.camera);
  }

  dispose() {
    this.human?.dispose();
    this.level?.dispose();
    this.level = null;
  }
}
