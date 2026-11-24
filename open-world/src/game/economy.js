// Economy: shops (weapons, clothes, cars, real estate), garages/respray, property income, safehouse + walkable interiors
import * as THREE from 'three';
import { G, fmtMoney, clamp, bus } from '../core/util.js';
import { WEAPONS } from './weapons.js';
import { OUTFITS } from './player.js';
import { VT, Vehicle } from '../entities/vehicle.js';
import { GeoBuilder, vcMat } from '../world/geo.js';
import { tex } from '../core/assets.js';
import { CURB } from '../world/citygen.js';

export const PROPERTIES = [
  { id: 'coffee', name: 'Кофейня «Зерно»', price: 15000, income: 600, x: 150, z: -191 },
  { id: 'wash', name: 'Автомойка «Блеск»', price: 28000, income: 1100, x: -350, z: 309 },
  { id: 'flat', name: 'Квартира в деловом центре', price: 60000, income: 0, x: 150, z: 9, home: true },
  { id: 'taxi', name: 'Таксопарк «Шашка»', price: 75000, income: 2600, x: 450, z: 409 },
  { id: 'club', name: 'Ночной клуб «Волна»', price: 150000, income: 5200, x: 891, z: -150 },
  { id: 'hangar', name: 'Ангар в аэропорту', price: 220000, income: 6500, x: -420, z: 1112 },
  { id: 'villa', name: 'Вилла на побережье', price: 350000, income: 0, x: 1060, z: -700, home: true },
  { id: 'tower', name: 'Этаж в башне «Вертекс»', price: 600000, income: 15000, x: -50, z: -9 },
];
const INTERIOR_Y = -300;

export class Economy {
  constructor(game) {
    this.game = game; this.lastDay = Math.floor(G.dayCount || 0); this.inside = null; this.points = [];
    this.buildInterior();
  }
  setup() {
    const L = G.city.landmarks;
    const add = (id, p, label, glyph, color = '#7ef09a') => { if (!p) return; this.points.push({ id, x: p.x, z: p.z, label }); this.game.hud.blips.push({ x: p.x, z: p.z, glyph, color, label, kind: 'shop', edge: false }); };
    add('weapons', L.weapons, 'Оружейный «Арсенал»', '⌖');
    add('clothes', L.clothes, 'Одежда «Стиль»', '👕');
    add('dealer', L.dealer, 'Автосалон «Премьер»', '🚘');
    add('realty', L.realty, 'Недвижимость «Квадрат»', '🏢');
    add('home', L.safehouse, 'Квартира Алекса', '⌂', '#ffffff');
    add('garage', L.garage, 'Автосервис (покраска)', '🔧', '#f2b632');
    for (const g of ['gas1', 'gas2', 'gas3']) add('gas', L[g], 'АЗС — ремонт', '⛽', '#f2b632');
    add('hospital', L.hospital, 'Больница', '✚', '#ff6a6a');
    add('police', L.police, 'Полиция', '★', '#4a7aff');
    this.refreshProps();
  }
  refreshProps() {
    this.game.hud.blips = this.game.hud.blips.filter((b) => b.kind !== 'prop');
    for (const p of PROPERTIES) if (G.state.props.includes(p.id)) this.game.hud.blips.push({ x: p.x, z: p.z, glyph: p.home ? '⌂' : '$', color: '#7ef09a', label: p.name, kind: 'prop', edge: false });
  }
  // property income once per in-game day
  update(dt) {
    const day = Math.floor(G.dayCount || 0);
    if (day > this.lastDay) {
      this.lastDay = day;
      const inc = PROPERTIES.filter((p) => G.state.props.includes(p.id)).reduce((a, p) => a + p.income, 0);
      if (inc > 0) { G.state.money += inc; this.game.hud.notify(`💼 Доход от недвижимости: <b style="color:#7ef09a">+${fmtMoney(inc)}</b>`); G.audio.money(); }
    }
    const pl = this.game.player;
    if (G.cutscene || pl.wasted) { this.game.hud.prompt(null); return; }
    if (this.inside) {
      const d = Math.hypot(pl.pos.x - this.exitPt.x, pl.pos.z - this.exitPt.z);
      const dc = Math.hypot(pl.pos.x - this.counter.x, pl.pos.z - this.counter.z);
      if (d < 1.6) { this.game.hud.prompt('<kbd>E</kbd> Выйти на улицу'); if (G.inputHit('interact') || G.inputHit('enter')) this.exit(); }
      else if (dc < 2.2) { this.game.hud.prompt('<kbd>E</kbd> ' + (this.inside === 'home' ? 'Гардероб / сон / гараж' : 'Купить')); if (G.inputHit('interact')) this.open(this.inside); }
      else this.game.hud.prompt(null);
      return;
    }
    let near = null;
    const p = pl.wpos();
    for (const s of this.points) if (Math.hypot(p.x - s.x, p.z - s.z) < (pl.state === 'car' ? 6 : 2.4)) { near = s; break; }
    if (near && !G.missionActive || (near && ['gas', 'garage', 'hospital'].includes(near.id))) {
      const carOnly = near.id === 'gas' || near.id === 'garage';
      if (carOnly && pl.state !== 'car') { this.game.hud.prompt(`${near.label}: подъедьте на машине`); return; }
      if (!carOnly && pl.state === 'car') { this.game.hud.prompt(`${near.label}: выйдите из машины`); return; }
      this.game.hud.prompt(`<kbd>E</kbd> ${near.label}`);
      if (G.inputHit('interact')) {
        if (['weapons', 'clothes', 'home'].includes(near.id)) this.enter(near.id, near);
        else this.open(near.id);
      }
    } else if (!this.game.missions.active) { /* mission prompt handled elsewhere */ }
  }
  // ---------- interiors ----------
  buildInterior() {
    const gb = new GeoBuilder(), y = INTERIOR_Y, W = 16, D = 12, H = 3.6;
    const floor = new THREE.MeshStandardMaterial({ map: tex.old_planks_02_diff || null, roughness: 0.6, color: 0xb89070 });
    const wall = new THREE.MeshStandardMaterial({ map: tex.grey_plaster_diff, roughness: 0.9, color: 0xe8e0d4 });
    this.room = new THREE.Group(); this.room.visible = false; G.scene.add(this.room);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floor); fl.position.set(0, y, 0); fl.receiveShadow = true; this.room.add(fl);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), wall); ce.position.set(0, y + H, 0); this.room.add(ce);
    for (const [x, z, r, w] of [[0, -D / 2, 0, W], [0, D / 2, Math.PI, W], [-W / 2, 0, Math.PI / 2, D], [W / 2, 0, -Math.PI / 2, D]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wall); m.position.set(x, y + H / 2, z); m.rotation.y = r; m.receiveShadow = true; this.room.add(m); }
    const P = G.physics;
    P.staticBox(0, y - 0.5, 0, W / 2, 0.5, D / 2); P.staticBox(0, y + H / 2, -D / 2 - 0.2, W / 2, H / 2, 0.2); P.staticBox(0, y + H / 2, D / 2 + 0.2, W / 2, H / 2, 0.2); P.staticBox(-W / 2 - 0.2, y + H / 2, 0, 0.2, H / 2, D / 2); P.staticBox(W / 2 + 0.2, y + H / 2, 0, 0.2, H / 2, D / 2);
    P.staticBox(0, y + 0.5, -3, 3, 0.5, 0.5); // counter
    this.lights = [];
    for (const x of [-4, 4]) { const L = new THREE.PointLight(0xfff0d8, 0, 18, 1.5); L.position.set(x, y + H - 0.3, 0); this.room.add(L); this.lights.push(L); const pan = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.5) })); pan.position.set(x, y + H - 0.03, 0); this.room.add(pan); }
    this.furn = new THREE.Group(); this.room.add(this.furn);
    this.counter = { x: 0, z: -2 }; this.exitPt = { x: 0, z: D / 2 - 1 };
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), vcMat(0.5, 0.2)); door.position.set(0, y + 1.2, D / 2 - 0.06); this.room.add(door);
  }
  furnish(kind) {
    this.furn.clear();
    const y = INTERIOR_Y, g = new GeoBuilder();
    const wood = [0.45, 0.3, 0.2], dark = [0.12, 0.12, 0.13], red = [0.6, 0.1, 0.1];
    g.box('a', 0, y, -3, 6, 1, 1, { color: kind === 'weapons' ? dark : wood }); // counter
    if (kind === 'weapons') {
      for (let i = 0; i < 5; i++) { g.box('a', -6 + i * 3, y, -5.6, 2.4, 2.8, 0.6, { color: [0.3, 0.28, 0.25] }); for (let k = 0; k < 3; k++) g.box('m', -6 + i * 3, y + 0.8 + k * 0.7, -5.2, 1.8, 0.08, 0.15, { color: dark }); }
      g.box('a', 6.5, y, 2, 1.2, 1.6, 4, { color: [0.2, 0.25, 0.2] });
    } else if (kind === 'clothes') {
      for (let i = 0; i < 4; i++) { g.box('m', -6 + i * 4, y + 1.6, 3, 2.6, 0.05, 0.05, { color: [0.7, 0.7, 0.72] }); for (let k = 0; k < 6; k++) g.box('a', -7 + i * 4 + k * 0.4, y + 0.7, 3, 0.05, 0.9, 0.6, { color: [Math.random(), Math.random(), Math.random()] }); }
      g.box('a', 6, y, -4, 1.4, 2.4, 0.1, { color: [0.85, 0.9, 0.95] });
    } else {
      g.box('a', -5, y, 3, 2.2, 0.5, 3.2, { color: [0.85, 0.85, 0.9] }); g.box('a', -5, y + 0.5, 1.6, 2.2, 0.6, 0.3, { color: wood }); // bed
      g.box('a', 4, y, 3.5, 3, 0.45, 1, { color: [0.3, 0.3, 0.4] }); g.box('a', 4, y + 0.45, 4, 3, 0.5, 0.3, { color: [0.3, 0.3, 0.4] }); // sofa
      g.box('m', 4, y + 1.2, -5.8, 2.4, 1.3, 0.08, { color: dark }); g.box('a', 4, y, -5.5, 2.6, 0.6, 0.5, { color: wood }); // tv
      g.box('a', -6.5, y, -4.5, 1.6, 2.4, 1, { color: wood }); // wardrobe
      g.box('a', 0, y, 0.5, 3, 0.02, 2, { color: red }); // rug
    }
    for (const k of g.keys()) { const m = new THREE.Mesh(g.build(k), k === 'm' ? vcMat(0.35, 0.6) : vcMat(0.7, 0.05)); m.castShadow = m.receiveShadow = true; this.furn.add(m); }
  }
  async enter(kind, from) {
    const pl = this.game.player;
    await this.game.hud.fade(true, 0.4);
    this.inside = kind; this.from = { x: from.x, z: from.z, h: pl.heading };
    this.furnish(kind);
    this.room.visible = true; for (const L of this.lights) L.intensity = 40;
    G.interior = true;
    pl.teleport(0, INTERIOR_Y + 0.05, 4, Math.PI);
    this.game.cam.yaw = Math.PI; this.game.cam.pitch = 0.12;
    if (kind !== 'home') { this.clerk = this.game.missions.helpers(this.game.missions.token).ped({ x: 0, z: -4.2, y: INTERIOR_Y }, { name: 'Продавец', heading: 0 }); this.game.missions.tracked.peds.pop(); }
    await this.game.hud.fade(false, 0.4);
    this.game.hud.notify(kind === 'home' ? '⌂ Дом. Подойдите к шкафу/кровати (E)' : 'Подойдите к прилавку (E)');
  }
  async exit() {
    const pl = this.game.player;
    await this.game.hud.fade(true, 0.4);
    this.inside = null; this.room.visible = false; for (const L of this.lights) L.intensity = 0;
    G.interior = false;
    if (this.clerk) { this.game.peds.remove(this.clerk); this.clerk = null; }
    pl.teleport(this.from.x, CURB + 0.05, this.from.z + 0.8, 0);
    await this.game.hud.fade(false, 0.4);
  }
  // ---------- shop panels ----------
  open(id) {
    const menu = this.game.menu, st = G.state, pl = this.game.player;
    const items = []; let title = '';
    const buy = (price, fn, label) => { if (st.money < price) { G.audio.beep(200, 0.15, 0.15); this.game.hud.notify('Недостаточно денег'); return; } st.money -= price; fn(); G.audio.money(); this.game.hud.notify(label); this.game.save(); this.open(id); };
    if (id === 'weapons') {
      title = 'Оружейный магазин «Арсенал»';
      for (const w of ['pistol', 'smg', 'shotgun', 'rifle']) {
        const W = WEAPONS[w], own = st.weapons[w];
        items.push({ name: W.name, price: own ? W.ammoPrice : W.price, sub: own ? `Патроны ×${W.ammoPack} (сейчас: ${(st.ammo[w] || 0) + (pl.mag[w] || 0)})` : `Урон ${W.dmg}${W.pellets ? '×' + W.pellets : ''}, магазин ${W.mag}`, act: () => buy(own ? W.ammoPrice : W.price, () => pl.giveWeapon(w, W.ammoPack), own ? 'Куплены патроны' : 'Куплено: ' + W.name) });
      }
      items.push({ name: 'Бронежилет', price: 500, sub: `Броня ${Math.round(pl.armor)}/100`, act: () => buy(500, () => { pl.armor = 100; st.armor = 100; }, 'Бронежилет надет') });
    } else if (id === 'clothes' || id === 'wardrobe') {
      title = id === 'clothes' ? 'Магазин одежды «Стиль»' : 'Гардероб';
      OUTFITS.forEach((o, i) => {
        const own = st.outfits.includes(i);
        if (id === 'wardrobe' && !own) return;
        items.push({ name: o.name + (st.outfit === i ? ' ✓' : ''), price: own ? 0 : o.price, sub: own ? 'Надеть' : 'Купить и надеть', own: st.outfit === i, act: () => { if (own) { st.outfit = i; pl.setOutfit(i); this.game.save(); this.open(id); } else buy(o.price, () => { st.outfits.push(i); st.outfit = i; pl.setOutfit(i); }, 'Новый образ: ' + o.name); } });
      });
    } else if (id === 'dealer') {
      title = 'Автосалон «Премьер»';
      for (const [k, T] of Object.entries(VT)) {
        if (!T.price) continue;
        const own = st.cars.includes(k);
        items.push({ name: T.name, price: T.price, own, sub: own ? 'В вашем гараже' : `Макс. ${Math.round(T.top * 3.6)} км/ч · ${T.style}`, act: () => { if (own) return; buy(T.price, () => { st.cars.push(k); this.spawnOwned(k, G.city.landmarks.dealer); }, 'Покупка: ' + T.name + '. Машина ждёт у салона!'); } });
      }
    } else if (id === 'realty') {
      title = 'Агентство недвижимости «Квадрат»';
      for (const p of PROPERTIES) {
        const own = st.props.includes(p.id);
        items.push({ name: p.name, price: p.price, own, sub: own ? 'Ваша собственность' : p.income ? `Доход ${fmtMoney(p.income)}/день` : 'Жильё и точка сохранения', act: () => { if (own) return; buy(p.price, () => { st.props.push(p.id); this.refreshProps(); }, 'Куплено: ' + p.name); } });
      }
    } else if (id === 'garage' || id === 'gas') {
      const car = pl.car; if (!car) return;
      title = id === 'garage' ? 'Автосервис: ремонт и покраска' : 'АЗС: ремонт';
      items.push({ name: 'Ремонт', price: id === 'gas' ? 250 : 400, sub: `Состояние: ${Math.round(car.health / car.maxHealth * 100)}%`, act: () => buy(id === 'gas' ? 250 : 400, () => this.repair(car), 'Машина отремонтирована') });
      if (id === 'garage') {
        items.push({ name: 'Покраска + новые номера', price: 700, sub: G.wanted > 0 ? 'Сбросит розыск, если вас не видят' : 'Новый цвет', act: () => buy(700, () => { this.repair(car); const c = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); car.body.material = new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.55, roughness: 0.32, clearcoat: 1 }); if (!this.game.police.seen) this.game.police.setWanted(0); }, 'Перекрашено!') });
        if (!st.cars.includes(car.typeId) && car.typeId !== 'police') items.push({ name: 'Поставить в свой гараж', price: 0, sub: 'Сохранить эту машину', act: () => { st.cars.push(car.typeId); this.game.save(); this.game.hud.notify('Машина сохранена в гараже'); this.open(id); } });
      }
    } else if (id === 'home') {
      title = 'Квартира Алекса';
      items.push({ name: 'Поспать до утра', price: 0, sub: 'Сохранение, восстановление здоровья', act: () => { menu.close('shop'); this.sleep(); } });
      items.push({ name: 'Гардероб', price: 0, sub: 'Сменить одежду', act: () => this.open('wardrobe') });
      for (const k of st.cars) items.push({ name: 'Гараж: ' + VT[k].name, price: 0, sub: 'Подогнать к дому', act: () => { menu.close('shop'); this.spawnOwned(k, G.city.landmarks.safehouse); this.game.hud.notify(VT[k].name + ' ждёт у подъезда'); } });
    } else if (id === 'hospital') {
      title = 'Городская больница';
      items.push({ name: 'Лечение', price: 300, sub: `Здоровье: ${Math.round(pl.health)}`, act: () => buy(300, () => { pl.health = 100; }, 'Вы здоровы') });
    } else if (id === 'police') { this.game.hud.notify('Лучше здесь не задерживаться…'); return; }
    const el = menu.panel('shop', `<h2>${title}</h2><div style="margin-bottom:10px;color:#7ef09a;font-weight:800">${fmtMoney(st.money)}</div><div class="items">${items.map((it, i) => `<div class="it ${it.own ? 'own' : ''}" data-i="${i}"><b>${it.name}</b>${it.price ? `<span>${fmtMoney(it.price)}</span>` : ''}<small>${it.sub || ''}</small></div>`).join('')}</div>`);
    el.querySelectorAll('.it').forEach((d) => d.onclick = () => items[+d.dataset.i].act());
  }
  repair(car) {
    car.health = car.maxHealth; car.burning = 0;
    if (car._ownGeo) { car.body.geometry.attributes.position.array.set(car._orig); car.body.geometry.attributes.position.needsUpdate = true; car.body.geometry.computeVertexNormals(); }
    if (car.glassBroken) { car.glassBroken = false; car.glass.visible = true; }
  }
  spawnOwned(type, at) {
    const old = this.ownedSpawn; if (old && G.player.car !== old && !old.dead) { G.vehicles.delete(old); old.dispose(); }
    const v = new Vehicle({ scene: G.scene, physics: G.physics }, type);
    const x = at.x + 6, z = at.z - 7;
    v.place(x, z, Math.PI / 2, 0); v.makeDynamic(); v.owner = 'player';
    G.vehicles.add(v); this.ownedSpawn = v;
    return v;
  }
  async sleep() {
    await this.game.hud.fade(true, 0.8);
    const target = 8;
    let h = G.hour; const add = (target - h + 24) % 24 || 24;
    G.hour = (G.hour + add) % 24; G.dayCount = (G.dayCount || 0) + (h + add >= 24 ? 1 : 0);
    this.game.player.health = 100;
    this.game.save();
    await new Promise((r) => setTimeout(r, 900));
    await this.game.hud.fade(false, 0.8);
    this.game.hud.notify('💾 Игра сохранена. Доброе утро!');
  }
}
