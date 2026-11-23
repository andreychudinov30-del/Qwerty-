// Procedural set dressing per zone: rails, columns, cables, pipes, lamps, Poly Haven props, posters, graffiti, debris.
import * as THREE from 'three';
import { CELL, ZONES } from './mapgen.js';
import * as PG from './procgeo.js';
import { Instancer, modelProto, geoProto, makeMatrix } from './props.js';
import { getMat, plainMat } from '../core/materials.js';
import { stationNameTexture, posterTexture, graffitiTexture, bloodTexture, crackTexture, decalMaterial, signTexture } from './signs.js';

export const PROP_MODELS = [
  'painted_wooden_bench', 'metal_trash_can', 'trashbag', 'cardboard_box_01', 'Barrel_01', 'barrel_03', 'wooden_crate_01',
  'old_military_crate', 'metal_jerrycan', 'power_box_01', 'utility_box_02', 'hanging_industrial_lamp', 'WetFloorSign_01',
  'wheelchair_01', 'metal_office_desk', 'steel_frame_shelves_01', 'medical_box', 'old_bed_frame', 'propane_tank',
  'korean_fire_extinguisher_01', 'security_camera_01', 'metal_tool_chest', 'old_tyre', 'russian_food_cans_01', 'cement_bag',
  'chemistry_set', 'industrial_microscope', 'vintage_suitcase', 'old_military_compressor', 'drawer_cabinet', 'clipboard',
  'binder_notebook', 'modular_airduct_rectangular_01', 'old_gas_mask', 'portable_generator', 'vintage_radio_transceiver', 'street_rat',
];

const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// rotation that makes a prop's +Z face away from a wall located in direction (dx,dy)
const faceAway = (dx, dy) => Math.atan2(-dx, -dy);

export async function decorate(builder, grid, rng, opts = {}) {
  const inst = new Instancer(builder);
  const lamps = [];
  const dynamics = [];
  const P = {};
  await Promise.all(PROP_MODELS.map(async (n) => { P[n] = await modelProto(n); }));
  const C = CELL;
  const g = grid;
  const zoneAt = (x, y) => builder.zone[builder.idx(x, y)] && g.in(x, y) ? builder.zone[builder.idx(x, y)] : null;
  const solid = (x, y) => builder.solid(x, y);
  const fl = (x, y) => builder.floorH[builder.idx(x, y)];
  const ce = (x, y) => builder.ceilH[builder.idx(x, y)];
  const brokenP = opts.lampBroken ?? 0.25, flickerP = opts.lampFlicker ?? 0.2;
  const lampState = () => { const r = rng.next(); return r < brokenP ? 'broken' : r < brokenP + flickerP ? 'flicker' : r < brokenP + flickerP + 0.06 ? 'dying' : 'on'; };
  const chapter = opts.chapter || 1;

  // cells reserved for gameplay (keep clear of clutter)
  const reserved = new Set();
  const reserve = (x, y, r = 1) => { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) reserved.add(`${x + ox},${y + oy}`); };
  for (const s of Object.values(g.spots)) reserve(s.x, s.y, 1);
  for (const e of g.entities) reserve(e.x, e.y, 0);
  for (const d of Object.values(g.doors)) reserve(d.x, d.y, 1);
  const clutterOk = (x, y) => !reserved.has(`${x},${y}`) && '.-_=~lkdrhcqw'.includes(g.get(x, y));

  // shared protos
  const protos = {
    rail: geoProto(PG.railGeometry(C), plainMat('rail'), { castShadow: false }),
    sleeper: geoProto(PG.sleeperGeometry(), getMat('wood', { vc: false }), { castShadow: false }),
    third: geoProto(PG.thirdRailGeometry(C), plainMat('steel'), { castShadow: false }),
    cable: geoProto(PG.cableGeometry(C, 0.07, 0.02), plainMat('cable'), { castShadow: false }),
    cable2: geoProto(PG.cableGeometry(C, 0.1, 0.028), plainMat('cable'), { castShadow: false }),
    cableR: geoProto(PG.cableGeometry(C, 0.05, 0.015), plainMat('cable_red'), { castShadow: false }),
    bracket: geoProto(PG.bracketGeometry(), plainMat('steel'), { castShadow: false }),
    pipe: geoProto(PG.pipeGeometry(C, 0.09), plainMat('pipe'), { castShadow: false }),
    pipeR: geoProto(PG.pipeGeometry(C, 0.06), plainMat('pipe_red'), { castShadow: false }),
    pipeY: geoProto(PG.pipeGeometry(C, 0.05), plainMat('pipe_yellow'), { castShadow: false }),
    clamp: geoProto(PG.pipeClampGeometry(0.09), plainMat('steel'), { castShadow: false }),
    edge: geoProto(PG.edgeStripGeometry(), plainMat('yellow_paint'), { castShadow: false }),
    lip: geoProto(PG.edgeLipGeometry(), getMat('marble', { vc: false }), { castShadow: false }),
    paper: geoProto(PG.paperGeometry(), plainMat('paper'), { castShadow: false }),
    can: geoProto(PG.canGeometry(), getMat('rust_light', { vc: false }), { castShadow: false }),
    bottle: geoProto(PG.bottleGeometry(), plainMat('glass_dirty'), { castShadow: false }),
    shard: geoProto(PG.tileShardGeometry(), getMat('station_tiles', { vc: false }), { castShadow: false }),
    sandbags: geoProto(PG.sandbagWallGeometry(), plainMat('sandbag')),
    tent: geoProto(PG.tentGeometry(), plainMat('cloth')),
    tentDark: geoProto(PG.tentGeometry(), plainMat('cloth_dark')),
    shack: geoProto(PG.shackGeometry(), getMat('corrugated', { vc: false })),
    bunk: geoProto(PG.bunkGeometry(), plainMat('dark_metal')),
    mattress: geoProto(PG.mattressGeometry(), plainMat('cloth')),
    tank: geoProto(PG.specimenTankGeometry(), plainMat('steel')),
    tankGlass: geoProto(PG.specimenGlassGeometry(), plainMat('glass'), { castShadow: false }),
    tankLiq: geoProto(PG.specimenLiquidGeometry(), plainMat('liquid'), { castShadow: false }),
    stal: geoProto(PG.stalactiteGeometry(), getMat('rock', { vc: false })),
    fungus: geoProto(PG.fungusGeometry(), plainMat('fungus'), { castShadow: false }),
    egg: geoProto(PG.eggSacGeometry(), plainMat('flesh_wall')),
    bones: geoProto(PG.boneGeometry(), plainMat('bone')),
    barrier: geoProto(PG.barrierGeometry(), plainMat('yellow_paint')),
    rocks: [1, 2, 3, 4, 5].map((s) => geoProto(PG.rockGeometry(s, 0.25), getMat('rock', { vc: false }))),
    bigRocks: [6, 7, 8].map((s) => geoProto(PG.rockGeometry(s, 0.8), getMat('rock', { vc: false }))),
  };
  protos.rail.name = 'p_rail'; protos.sleeper.name = 'p_sleeper';
  for (const [k, v] of Object.entries(protos)) if (!Array.isArray(v)) v.name = 'p_' + k;
  protos.rocks.forEach((p, i) => (p.name = 'p_rock' + i));
  protos.bigRocks.forEach((p, i) => (p.name = 'p_brock' + i));

  const add = (proto, x, y, z, ry = 0, s = 1, opts2 = {}) => inst.add(proto, makeMatrix(x, y, z, ry, s, opts2.rx || 0, opts2.rz || 0), opts2);
  const decalGroups = new Map(); // chunk|material -> {cx, cy, mat, mats[]}
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const decal = (texture, x, y, z, ry, w, h, matOpts = {}) => {
    const mat = decalMaterial(texture, matOpts);
    const cxx = Math.floor(x / C), cyy = Math.floor(z / C);
    const key = builder.chunkOf(cxx, cyy) + '|' + mat.uuid;
    if (!decalGroups.has(key)) decalGroups.set(key, { cx: cxx, cy: cyy, mat, mats: [] });
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    if (matOpts.floor) o.rotation.set(-Math.PI / 2, 0, ry); else o.rotation.y = ry;
    o.scale.set(w, h, 1);
    o.updateMatrix();
    decalGroups.get(key).mats.push(o.matrix.clone());
  };
  const wallDecal = (x, y, dx, dy, texture, hgt, w, h, offset = 0) => {
    const cx = (x + 0.5) * C + dx * (C / 2 - 0.02), cz = (y + 0.5) * C + dy * (C / 2 - 0.02);
    const along = dx !== 0 ? [0, 1] : [1, 0];
    decal(texture, cx + along[0] * offset, hgt, cz + along[1] * offset, faceAway(dx, dy), w, h);
  };

  // ---------- rails / tracks ----------
  const railZone = (x, y) => { const z = zoneAt(x, y); return z && ZONES[z].rails && g.get(x, y) !== '#'; };
  const runLen = (x, y, dx, dy) => { let n = 0; let cx = x + dx, cy = y + dy; while (railZone(cx, cy) && n < 30) { n++; cx += dx; cy += dy; } return n; };
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!railZone(x, y)) continue;
    const lx = runLen(x, y, -1, 0) + runLen(x, y, 1, 0) + 1;
    const ly = runLen(x, y, 0, -1) + runLen(x, y, 0, 1) + 1;
    const axis = lx >= ly ? 'x' : 'y';
    // perpendicular run: only the first cell of each perpendicular run of 2 emits a track centred on the run
    const [pdx, pdy] = axis === 'x' ? [0, 1] : [1, 0];
    const before = runLen(x, y, -pdx, -pdy);
    const total = before + runLen(x, y, pdx, pdy) + 1;
    if (total >= 2 && before % 2 === 1) continue; // second cell of a pair
    const center = total >= 2 ? 1 : 0.5; // offset (cells) from this cell's start along perpendicular
    const fy = fl(x, y) + 0.02;
    const cxw = axis === 'x' ? (x + 0.5) * C : (x + center) * C;
    const czw = axis === 'x' ? (y + center) * C : (y + 0.5) * C;
    const ry = axis === 'x' ? 0 : Math.PI / 2;
    const gauge = 0.76;
    const off = (o) => axis === 'x' ? [cxw, czw + o] : [cxw + o, czw];
    // sleepers (4 per cell)
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4 - 0.5;
      const [sx, sz] = axis === 'x' ? [cxw + t * C, czw] : [cxw, czw + t * C];
      add(protos.sleeper, sx, fy + 0.03, sz, ry + (rng.next() - 0.5) * 0.06);
    }
    for (const o of [-gauge, gauge]) { const [rx, rz] = off(o); add(protos.rail, rx, fy + 0.1, rz, ry); }
    if (g.get(x, y) !== 's') { const [tx, tz] = off(1.45); add(protos.third, tx, fy, tz, ry); }
    // rocks/debris in track bed
    if (rng.chance(0.25) && clutterOk(x, y)) add(rng.pick(protos.rocks), cxw + (rng.next() - 0.5) * 2, fy + 0.05, czw + (rng.next() - 0.5) * 2, rng.next() * 6, 0.6 + rng.next() * 0.8);
  }

  // ---------- per-cell zone dressing ----------
  const lampCounter = {};
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const zc = zoneAt(x, y);
    if (!zc) continue;
    const Z = ZONES[zc];
    const ch = g.get(x, y);
    const cx = (x + 0.5) * C, cz = (y + 0.5) * C;
    const fy = fl(x, y), cy = ce(x, y);
    const walls = DIR4.filter(([dx, dy]) => solid(x + dx, y + dy));
    const ok = clutterOk(x, y);

    // columns
    if (ch === 'o') {
      const h = cy - fy;
      add(geoProto(PG.columnGeometry(h), getMat('marble', { vc: false })), cx, fy, cz, 0);
      add(geoProto(PG.columnTrimGeometry(h), plainMat('pipe_yellow')), cx, fy, cz, 0);
      continue;
    }
    if (ch === 'x') {
      for (let k = 0; k < 4; k++) add(rng.pick(protos.bigRocks), cx + (rng.next() - 0.5) * 1.2, fy + 0.2, cz + (rng.next() - 0.5) * 1.2, rng.next() * 6, 0.6 + rng.next() * 0.5);
      add(rng.pick(protos.rocks), cx, fy + 0.6, cz, 0, 1.5);
      continue;
    }

    switch (Z.id) {
      case 'station': {
        // platform edges
        for (const [dx, dy] of DIR4) {
          if (zoneAt(x + dx, y + dy) === '_') {
            const ry = dx !== 0 ? Math.PI / 2 : 0;
            add(protos.edge, cx + dx * (C / 2 - 0.45), fy, cz + dy * (C / 2 - 0.45), ry);
            add(protos.lip, cx + dx * (C / 2 - 0.06), fy, cz + dy * (C / 2 - 0.06), ry);
          }
        }
        // posters / graffiti on walls
        for (const [dx, dy] of walls) {
          if (rng.chance(0.1)) wallDecal(x, y, dx, dy, posterTexture(rng.int(0, 7)), 1.7, 0.75, 1.05, (rng.next() - 0.5) * 1.2);
          else if (rng.chance(0.06)) wallDecal(x, y, dx, dy, graffitiTexture(rng.int(0, 13)), 1.4 + rng.next(), 2.2, 0.8);
          if (rng.chance(0.04)) wallDecal(x, y, dx, dy, crackTexture(rng.int(0, 5)), 2.5 + rng.next() * 2, 1.6, 1.6);
        }
        // lamps
        const interior = DIR4.every(([dx, dy]) => !solid(x + dx, y + dy));
        if (interior && (x % 3 === 1) && (y % 2 === 0) && !DIR4.some(([dx, dy]) => zoneAt(x + dx, y + dy) === '_') && g.get(x, y) === '.') {
          lamps.push({ type: 'chandelier', x: cx, y: cy, z: cz, state: lampState() });
        } else if (walls.length && (x + y) % 4 === 0) {
          const [dx, dy] = walls[0];
          lamps.push({ type: 'cage', x: cx + dx * (C / 2 - 0.05), y: fy + 2.6, z: cz + dy * (C / 2 - 0.05), rotY: faceAway(dx, dy), state: lampState() });
        }
        if (ok) {
          if (rng.chance(0.35)) for (let k = rng.int(1, 3); k > 0; k--) add(protos.paper, cx + (rng.next() - 0.5) * 2.2, fy + 0.002, cz + (rng.next() - 0.5) * 2.2, rng.next() * 6);
          if (rng.chance(0.12)) add(rng.chance(0.5) ? protos.can : protos.bottle, cx + (rng.next() - 0.5) * 2, fy + (rng.chance(0.5) ? 0.03 : 0), cz + (rng.next() - 0.5) * 2, rng.next() * 6, 1, { rz: Math.PI / 2 });
          if (rng.chance(0.08)) add(protos.shard, cx + (rng.next() - 0.5) * 2, fy + 0.006, cz + (rng.next() - 0.5) * 2, rng.next() * 6);
          if (walls.length && rng.chance(0.07)) { const [dx, dy] = walls[0]; add(P.metal_trash_can, cx + dx * 0.85, fy, cz + dy * 0.85, rng.next() * 6, 1, { collider: true }); }
          else if (rng.chance(0.035)) add(P.trashbag, cx + (rng.next() - 0.5), fy, cz + (rng.next() - 0.5), rng.next() * 6);
          else if (rng.chance(0.03)) add(P.vintage_suitcase, cx + (rng.next() - 0.5), fy, cz + (rng.next() - 0.5), rng.next() * 6, 1, { collider: true });
          else if (rng.chance(0.025)) dynamics.push({ model: 'cardboard_box_01', x: cx, y: fy + 0.3, z: cz, ry: rng.next() * 6 });
          else if (rng.chance(0.012)) add(P.wheelchair_01, cx, fy, cz, rng.next() * 6, 1, { collider: true });
          else if (rng.chance(0.015)) add(P.WetFloorSign_01, cx + (rng.next() - 0.5), fy, cz, rng.next() * 6);
          if (rng.chance(0.025)) decal(bloodTexture(rng.int(0, 5)), cx, fy + 0.01, cz, rng.next() * 6, 1.6, 1.6, { floor: true });
        }
        break;
      }
      case 'pit': break;
      case 'tunnel': case 'flooded': {
        // cables & brackets along walls
        for (const [dx, dy] of walls) {
          const ry = dx !== 0 ? Math.PI / 2 : 0;
          const wx = cx + dx * (C / 2 - 0.12), wz = cz + dy * (C / 2 - 0.12);
          const base = fy + 1.25;
          add(protos.bracket, cx + dx * (C / 2 - 0.02), base + 0.2, cz + dy * (C / 2 - 0.02), faceAway(dx, dy));
          add(protos.cable, wx, base + 0.4, wz, ry);
          add(protos.cable2, wx, base + 0.2, wz, ry);
          add(protos.cable, wx, base, wz, ry);
          if ((x + y) % 2 === 0) add(protos.cableR, wx, base + 0.55, wz, ry);
          // wall lamps
          const key = `${dx},${dy}`;
          lampCounter[key] = (lampCounter[key] || 0) + 1;
          if ((dx !== 0 ? y : x) % 5 === (dx + dy > 0 ? 0 : 2)) {
            lamps.push({ type: 'cage', x: cx + dx * (C / 2 - 0.06), y: fy + 2.45, z: cz + dy * (C / 2 - 0.06), rotY: faceAway(dx, dy), state: lampState() });
          }
          if (rng.chance(0.025)) wallDecal(x, y, dx, dy, graffitiTexture(rng.int(0, 13)), fy + 1.9, 2.0, 0.75);
          if (rng.chance(0.02)) { add(P.utility_box_02, cx + dx * (C / 2 - 0.1), fy + 1.0, cz + dy * (C / 2 - 0.1), faceAway(dx, dy)); }
          if (rng.chance(0.012)) lamps.push({ type: 'signal', x: cx + dx * (C / 2 - 0.1), y: fy + 1.9, z: cz + dy * (C / 2 - 0.1), rotY: faceAway(dx, dy), state: 'on', circuit: 'always', color: rng.chance(0.7) ? 0xff2212 : 0x22ff66 });
        }
        if (ok && rng.chance(0.03) && chapter >= 2) add(protos.bones, cx + (rng.next() - 0.5) * 2, fy + 0.02, cz + (rng.next() - 0.5) * 2, rng.next() * 6);
        if (ok && rng.chance(0.04)) add(P.old_tyre, cx + (rng.next() - 0.5) * 1.5, fy + 0.02, cz + (rng.next() - 0.5) * 1.5, rng.next() * 6, 1, { rx: Math.PI / 2 });
        break;
      }
      case 'service': case 'flooded_service': {
        for (const [dx, dy] of walls) {
          const ry = dx !== 0 ? Math.PI / 2 : 0;
          if ((x + y) % 3 !== 1) {
            add(protos.pipe, cx + dx * (C / 2 - 0.15), cy - 0.25, cz + dy * (C / 2 - 0.15), ry);
            add(protos.pipeR, cx + dx * (C / 2 - 0.15), cy - 0.5, cz + dy * (C / 2 - 0.15), ry);
            if ((x * 7 + y) % 2) add(protos.pipeY, cx + dx * (C / 2 - 0.1), fy + 0.35, cz + dy * (C / 2 - 0.1), ry);
            add(protos.clamp, cx + dx * (C / 2 - 0.15), cy - 0.25, cz + dy * (C / 2 - 0.15), ry);
          }
          if ((dx !== 0 ? y : x) % 3 === 0) lamps.push({ type: 'cage', x: cx + dx * (C / 2 - 0.06), y: cy - 0.55, z: cz + dy * (C / 2 - 0.06), rotY: faceAway(dx, dy), state: lampState() });
          if (ok && rng.chance(0.07)) add(rng.chance(0.5) ? P.power_box_01 : P.utility_box_02, cx + dx * (C / 2 - 0.12), fy + 1.2, cz + dy * (C / 2 - 0.12), faceAway(dx, dy));
          if (ok && rng.chance(0.07)) add(P.steel_frame_shelves_01, cx + dx * (C / 2 - 0.35), fy, cz + dy * (C / 2 - 0.35), faceAway(dx, dy), 1, { collider: true });
          if (rng.chance(0.03)) wallDecal(x, y, dx, dy, graffitiTexture(rng.int(0, 13)), fy + 1.6, 1.8, 0.7);
          if (rng.chance(0.02)) add(P.korean_fire_extinguisher_01, cx + dx * (C / 2 - 0.15), fy, cz + dy * (C / 2 - 0.15), faceAway(dx, dy));
        }
        if (ok) {
          if (rng.chance(0.06)) dynamics.push({ model: rng.chance(0.5) ? 'Barrel_01' : 'barrel_03', x: cx + (rng.next() - 0.5), y: fy + 0.5, z: cz + (rng.next() - 0.5), ry: rng.next() * 6 });
          else if (rng.chance(0.05)) dynamics.push({ model: 'wooden_crate_01', x: cx, y: fy + 0.4, z: cz, ry: rng.next() * 6 });
          else if (rng.chance(0.035)) add(P.metal_jerrycan, cx + (rng.next() - 0.5), fy, cz + (rng.next() - 0.5), rng.next() * 6);
          else if (rng.chance(0.03)) add(P.metal_tool_chest, cx, fy, cz, rng.next() * 6, 1, { collider: true });
          else if (rng.chance(0.03)) add(P.cement_bag, cx, fy, cz, rng.next() * 6);
          if (rng.chance(0.2)) add(protos.paper, cx + (rng.next() - 0.5) * 2, fy + 0.002, cz + (rng.next() - 0.5) * 2, rng.next() * 6);
        }
        break;
      }
      case 'lab': {
        if ((x % 2 === 0) && (y % 2 === 0)) lamps.push({ type: 'tube', x: cx, y: cy - 0.03, z: cz, rotY: 0, state: lampState() });
        for (const [dx, dy] of walls) {
          if (ok && rng.chance(0.16)) {
            const px = cx + dx * (C / 2 - 0.45), pz = cz + dy * (C / 2 - 0.45);
            add(P.metal_office_desk, px, fy, pz, faceAway(dx, dy) + Math.PI, 1, { collider: true });
            const top = fy + 0.76;
            const r = rng.next();
            if (r < 0.35) add(P.chemistry_set, px, top, pz, rng.next() * 6);
            else if (r < 0.6) add(P.industrial_microscope, px, top, pz, faceAway(dx, dy));
            else if (r < 0.8) add(P.clipboard, px, top, pz, rng.next() * 6);
            else add(P.binder_notebook, px, top, pz, rng.next() * 6);
          } else if (ok && rng.chance(0.07)) add(P.drawer_cabinet, cx + dx * (C / 2 - 0.3), fy, cz + dy * (C / 2 - 0.3), faceAway(dx, dy), 1, { collider: true });
          if (rng.chance(0.06)) wallDecal(x, y, dx, dy, bloodTexture(rng.int(0, 5)), fy + 1.2 + rng.next(), 1.2, 1.2);
        }
        if (ok && walls.length === 0 && rng.chance(0.07)) {
          add(protos.tank, cx, fy, cz, 0, 1, { collider: true }); add(protos.tankGlass, cx, fy, cz, 0); add(protos.tankLiq, cx, fy, cz, 0);
        }
        if (ok && rng.chance(0.3)) add(protos.paper, cx + (rng.next() - 0.5) * 2, fy + 0.002, cz + (rng.next() - 0.5) * 2, rng.next() * 6);
        if (ok && rng.chance(0.04)) add(P.medical_box, cx + (rng.next() - 0.5), fy, cz + (rng.next() - 0.5), rng.next() * 6);
        if (ok && rng.chance(0.05)) decal(bloodTexture(rng.int(0, 5)), cx, fy + 0.01, cz, rng.next() * 6, 1.8, 1.8, { floor: true });
        break;
      }
      case 'bunker': {
        for (const [dx, dy] of walls) {
          if ((dx !== 0 ? y : x) % 3 === 0) lamps.push({ type: 'cage', x: cx + dx * (C / 2 - 0.06), y: cy - 0.4, z: cz + dy * (C / 2 - 0.06), rotY: faceAway(dx, dy), state: lampState() });
          if (ok && rng.chance(0.12)) { const ry = dx !== 0 ? 0 : Math.PI / 2; add(protos.bunk, cx + dx * (C / 2 - 0.5), fy, cz + dy * (C / 2 - 0.5), ry, 1, { collider: true }); add(protos.mattress, cx + dx * (C / 2 - 0.5), fy, cz + dy * (C / 2 - 0.5), ry); }
          else if (ok && rng.chance(0.06)) add(P.old_military_crate, cx + dx * 0.7, fy, cz + dy * 0.7, faceAway(dx, dy), 1, { collider: true });
          if (rng.chance(0.08)) wallDecal(x, y, dx, dy, posterTexture(rng.pick([1, 7, 3])), fy + 1.6, 0.7, 1.0);
          if (rng.chance(0.03)) { const ry = dx !== 0 ? Math.PI / 2 : 0; add(protos.pipe, cx + dx * (C / 2 - 0.15), cy - 0.2, cz + dy * (C / 2 - 0.15), ry); }
        }
        if (ok && rng.chance(0.06)) add(P.russian_food_cans_01, cx + (rng.next() - 0.5), fy, cz + (rng.next() - 0.5), rng.next() * 6);
        if (ok && rng.chance(0.03)) add(P.old_gas_mask, cx + (rng.next() - 0.5), fy + 0.05, cz + (rng.next() - 0.5), rng.next() * 6, 1, { rx: -Math.PI / 2 });
        if (ok && rng.chance(0.03)) add(P.propane_tank, cx, fy, cz, rng.next() * 6, 1, { collider: true });
        break;
      }
      case 'depot': case 'depot_track': {
        if (Z.id === 'depot' && x % 4 === 0 && y % 4 === 0 && walls.length === 0 && ok) add(geoProto(PG.steelColumnGeometry(cy - fy), plainMat('steel')), cx, fy, cz, 0, 1, { collider: true });
        if (x % 4 === 2 && y % 4 === 2) lamps.push({ type: 'hanging', x: cx, y: cy - 2.2, z: cz, state: lampState() });
        if (y % 6 === 0 && x % 8 === 4) add(geoProto(PG.trussGeometry(8 * C), plainMat('steel')), cx, cy - 0.3, cz, 0);
        for (const [dx, dy] of walls) {
          if (rng.chance(0.04)) wallDecal(x, y, dx, dy, graffitiTexture(rng.int(0, 13)), fy + 1.8, 2.4, 0.9);
          if ((dx !== 0 ? y : x) % 4 === 0) lamps.push({ type: 'cage', x: cx + dx * (C / 2 - 0.06), y: fy + 3.2, z: cz + dy * (C / 2 - 0.06), rotY: faceAway(dx, dy), state: lampState() });
        }
        if (ok && Z.id === 'depot') {
          if (rng.chance(0.05)) dynamics.push({ model: 'Barrel_01', x: cx, y: fy + 0.5, z: cz, ry: rng.next() * 6 });
          else if (rng.chance(0.04)) add(P.old_tyre, cx, fy + 0.02, cz, rng.next() * 6, 1, { rx: Math.PI / 2 });
          else if (rng.chance(0.03)) add(P.metal_tool_chest, cx, fy, cz, rng.next() * 6, 1, { collider: true });
          else if (rng.chance(0.03)) add(P.old_military_compressor, cx, fy, cz, rng.next() * 6, 1, { collider: true });
        }
        break;
      }
      case 'hall': {
        if (x % 5 === 2 && y % 5 === 2) lamps.push({ type: 'hanging', x: cx, y: Math.min(cy - 3, fy + 6), z: cz, state: lampState() });
        if (ok) {
          const r = rng.next();
          if (r < 0.05) add(rng.chance(0.5) ? protos.tent : protos.tentDark, cx, fy, cz, rng.pick([0, Math.PI / 2]), 1, { collider: true });
          else if (r < 0.08) add(protos.shack, cx, fy, cz, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 1, { collider: true });
          else if (r < 0.11) add(protos.sandbags, cx, fy, cz, rng.pick([0, Math.PI / 2]), 1, { collider: true });
          else if (r < 0.13) { add(P.barrel_03, cx, fy, cz, 0, 1, { collider: true }); if (rng.chance(0.4)) lamps.push({ type: 'fire', x: cx, y: fy + 1.0, z: cz, state: 'flicker', circuit: 'always' }); }
          else if (r < 0.17) add(P.wooden_crate_01, cx, fy, cz, rng.next() * 6, 1, { collider: true });
          else if (r < 0.2) add(P.old_military_crate, cx, fy, cz, rng.next() * 6, 1, { collider: true });
          if (rng.chance(0.25)) add(protos.paper, cx + (rng.next() - 0.5) * 2, fy + 0.002, cz + (rng.next() - 0.5) * 2, rng.next() * 6);
          if (rng.chance(0.05)) add(protos.bones, cx, fy + 0.02, cz, rng.next() * 6);
        }
        for (const [dx, dy] of walls) if (rng.chance(0.08)) wallDecal(x, y, dx, dy, graffitiTexture(rng.int(0, 13)), fy + 2, 2.6, 1.0);
        break;
      }
      case 'cave': case 'nest': {
        if (ok && rng.chance(0.3)) add(rng.pick(protos.rocks), cx + (rng.next() - 0.5) * 2, fy + 0.05, cz + (rng.next() - 0.5) * 2, rng.next() * 6, 0.8 + rng.next() * 1.5);
        if (walls.length && ok && rng.chance(0.3)) { const [dx, dy] = walls[0]; add(rng.pick(protos.bigRocks), cx + dx * 0.9, fy + 0.3, cz + dy * 0.9, rng.next() * 6, 0.8 + rng.next() * 0.6, { collider: true }); }
        if (rng.chance(0.18)) add(protos.stal, cx + (rng.next() - 0.5) * 2, cy, cz + (rng.next() - 0.5) * 2, rng.next() * 6, 0.6 + rng.next());
        if (rng.chance(0.12)) { add(protos.fungus, cx + (rng.next() - 0.5) * 2, fy, cz + (rng.next() - 0.5) * 2, rng.next() * 6, 1 + rng.next()); if (rng.chance(0.25)) lamps.push({ type: 'fungus', x: cx, y: fy + 0.2, z: cz, state: 'on', circuit: 'always' }); }
        if (Z.id === 'nest' && ok && rng.chance(0.18)) add(protos.egg, cx + (rng.next() - 0.5) * 1.5, fy, cz + (rng.next() - 0.5) * 1.5, rng.next() * 6, 0.7 + rng.next() * 0.8);
        if (ok && rng.chance(0.06)) add(protos.bones, cx, fy + 0.02, cz, rng.next() * 6);
        break;
      }
    }
  }

  // ---------- station name plates ----------
  for (const hnt of g.decorHints) {
    if (hnt.type === 'stationName') {
      const tex = stationNameTexture(hnt.name);
      // outer walls of pits (north wall of first pit row, south wall of last pit row)
      const rows = [{ y: hnt.y, dy: -1 }];
      if (hnt.sides === 2) rows.push({ y: hnt.y + 2 + hnt.pw + 1, dy: 1 });
      for (const r of rows) for (let x = hnt.x + 2; x < hnt.x + hnt.len - 2; x += 6) {
        if (!solid(x, r.y + r.dy)) continue;
        wallDecal(x, r.y, 0, r.dy, tex, 2.4, 3.6, 0.68);
      }
      // benches along platform center
      const midY = hnt.y + 2 + hnt.pw / 2;
      for (let x = hnt.x + 3; x < hnt.x + hnt.len - 3; x += 6) {
        if (!clutterOk(x, Math.floor(midY))) continue;
        add(P.painted_wooden_bench, (x + 0.5) * C + 1.25, 0, midY * C, 0, 1, { collider: true });
      }
    }
    if (hnt.type === 'sign') {
      wallDecal(hnt.x, hnt.y, hnt.dx, hnt.dy, signTexture(hnt.text, { bg: hnt.bg || '#1d3d1a', arrow: hnt.arrow || 0 }), hnt.h || 2.2, hnt.w || 1.6, 0.4);
    }
  }

  if (opts.lampSystem) for (const l of lamps) opts.lampSystem.add(l, inst);
  inst.build();
  for (const d of decalGroups.values()) {
    const im = new THREE.InstancedMesh(unitPlane, d.mat, d.mats.length);
    d.mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.renderOrder = 2; im.receiveShadow = true; im.castShadow = false;
    im.matrixAutoUpdate = false;
    builder.ensureChunk(d.cx, d.cy).group.add(im);
  }
  return { instancer: inst, lamps, dynamics, colliders: inst.colliders };
}
