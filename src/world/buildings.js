// Buildings: panel blocks, heating plant, garages, fences, skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas, starPath } from '../util.js';
import { makeSignTexture, canvasTexture, makeFencePanelTexture, makeGlowTexture } from '../textures.js';
import { OUTDOOR_LIGHT_LAYER } from './interiors.js';
import { highwayRange } from './highway.js';
import { EAST, nearEastSector } from './east.js';
import { EDGE_GATES, onEdgeRoad } from './edges.js';
import { WORLD } from '../config.js';

export const FLOOR_H = 3.0;
const CELL_W = 3.4;

/** Panel blocks of the district. Shared with the stairwell interiors, which
 * anchor their entrance doors to the same cells the facade texture paints. */
export const BUILDING_SPECS = [
  { id: 'B1', x: -40, z: -52, w: 44, d: 12, floors: 5, number: '12', street: 'ул. КОСМОНАВТОВ', base: '#c3bcac', plinth: '#8f8b80', balcony: 0.45, lit: 0.5, seed: 11, tv: true },
  { id: 'B2', x: 38, z: -30, w: 38, d: 12, floors: 5, number: '7', street: 'ул. КОСМОНАВТОВ', base: '#b6b9b8', plinth: '#87857c', balcony: 0.4, lit: 0.45, seed: 22 },
  { id: 'B3', x: -42, z: 20, w: 34, d: 12, floors: 9, number: '3', street: 'ул. МИРА', base: '#aab2b6', plinth: '#7f7d76', balcony: 0.5, lit: 0.55, seed: 33, tv: true },
  { id: 'B4', x: 36, z: 62, w: 40, d: 12, floors: 5, number: '9', street: 'ул. МИРА', base: '#c0b6a4', plinth: '#8a8578', balcony: 0.42, lit: 0.48, seed: 44, tv: true },
  { id: 'B5', x: -30, z: -80, w: 40, d: 12, floors: 5, number: '15', street: 'ул. СЕВЕРНАЯ', base: '#bcb9ae', plinth: '#8b8880', balcony: 0.38, lit: 0.42, seed: 55 },
  { id: 'B7', x: -46, z: 74, w: 36, d: 12, floors: 5, number: '21', street: 'ул. МИРА', base: '#c6bfb0', plinth: '#8f8b80', balcony: 0.44, lit: 0.46, seed: 66 },
];

/**
 * Second residential cluster, north of the old fence line (z > 104): the
 * avenue keeps going to a T-junction on Zavodskaya street, with six more
 * blocks around two courtyards. Kept apart from BUILDING_SPECS on purpose:
 * the historic blocks draw roof details from the shared RNG stream in a
 * fixed order (terrain and vegetation depend on it), so these specs use
 * their own seeds, and their small trim is merged per material — six extra
 * blocks for roughly the draw cost of one historic one.
 */
export const EXPANSION_SPECS = [
  { id: 'B8', x: -40, z: 112, w: 30, d: 12, floors: 9, number: '18', street: 'ул. КОСМОНАВТОВ', base: '#a8b0b8', plinth: '#7d7b74', balcony: 0.5, lit: 0.5, seed: 77, tv: true },
  { id: 'B9', x: 32, z: 112, w: 38, d: 12, floors: 5, number: '20', street: 'ул. КОСМОНАВТОВ', base: '#c9c0b0', plinth: '#8f8b80', balcony: 0.42, lit: 0.46, seed: 88 },
  { id: 'B10', x: -30, z: 151, w: 44, d: 12, floors: 5, number: '24', street: 'ул. СЕВЕРНАЯ', base: '#9e6f52', plinth: '#6f5140', balcony: 0.3, lit: 0.5, seed: 99, tv: true },
  { id: 'B11', x: 34, z: 152, w: 36, d: 12, floors: 5, number: '2', street: 'ул. ЗАВОДСКАЯ', base: '#b9b4a6', plinth: '#8a8578', balcony: 0.4, lit: 0.44, seed: 111, tv: true },
  { id: 'B12', x: -74, z: 112, w: 26, d: 12, floors: 5, number: '22', street: 'ул. СЕВЕРНАЯ', base: '#c2b8a8', plinth: '#8f8b80', balcony: 0.38, lit: 0.42, seed: 122 },
  { id: 'B13', x: 74, z: 151, w: 24, d: 12, floors: 9, number: '4', street: 'ул. ЗАВОДСКАЯ', base: '#9fa8ae', plinth: '#7d7b74', balcony: 0.52, lit: 0.52, seed: 133, tv: true },
];

/**
 * Third cluster, west of the old district limit (x < -104): the cross
 * street runs on to ул. Строителей (x = -170), a north–south street with
 * two rows of blocks on either side. Built exactly like the northern
 * expansion: own seeds, trim merged per material.
 */
export const WEST_SPECS = [
  { id: 'W1', x: -136, z: 18, w: 40, d: 12, floors: 9, number: '31', street: 'ул. СТРОИТЕЛЕЙ', base: '#aeb4b6', plinth: '#7f7d76', balcony: 0.5, lit: 0.52, seed: 211, tv: true },
  { id: 'W2', x: -206, z: 18, w: 44, d: 12, floors: 5, number: '33', street: 'ул. СТРОИТЕЛЕЙ', base: '#c4bcaa', plinth: '#8f8b80', balcony: 0.42, lit: 0.46, seed: 222 },
  { id: 'W3', x: -136, z: -30, w: 36, d: 12, floors: 5, number: '29', street: 'ул. СТРОИТЕЛЕЙ', base: '#bab6aa', plinth: '#8a8578', balcony: 0.4, lit: 0.44, seed: 233, tv: true },
  { id: 'W4', x: -206, z: -36, w: 40, d: 12, floors: 5, number: '35', street: 'ул. СТРОИТЕЛЕЙ', base: '#a5715a', plinth: '#6f5140', balcony: 0.3, lit: 0.5, seed: 244 },
  { id: 'W5', x: -136, z: 78, w: 42, d: 12, floors: 5, number: '27', street: 'ул. МИРА', base: '#c2b9a7', plinth: '#8a8578', balcony: 0.44, lit: 0.46, seed: 255 },
  { id: 'W6', x: -208, z: 80, w: 36, d: 12, floors: 9, number: '37', street: 'ул. СТРОИТЕЛЕЙ', base: '#a3abb2', plinth: '#7d7b74', balcony: 0.52, lit: 0.5, seed: 266, tv: true },
  { id: 'W7', x: -136, z: 130, w: 30, d: 12, floors: 12, number: '25', street: 'ул. СТРОИТЕЛЕЙ', base: '#b4b9bc', plinth: '#7d7b74', balcony: 0.55, lit: 0.55, seed: 277, tv: true },
  { id: 'W8', x: -206, z: 140, w: 40, d: 12, floors: 5, number: '39', street: 'ул. СТРОИТЕЛЕЙ', base: '#c8c0ae', plinth: '#8f8b80', balcony: 0.4, lit: 0.44, seed: 288 },
  { id: 'W9', x: -136, z: -76, w: 40, d: 12, floors: 5, number: '23', street: 'ул. СТРОИТЕЛЕЙ', base: '#bcb7ab', plinth: '#8b8880', balcony: 0.38, lit: 0.42, seed: 299 },
  { id: 'W10', x: -206, z: -82, w: 36, d: 12, floors: 9, number: '41', street: 'ул. СТРОИТЕЛЕЙ', base: '#9fa8ae', plinth: '#7d7b74', balcony: 0.5, lit: 0.5, seed: 311, tv: true },
];

/**
 * Fourth cluster, south of the old district limit (z < -104): the avenue
 * and ул. Строителей run on to ул. Школьная (z = -152); these blocks line
 * its far side, with the school quarter between them and the old district.
 */
export const SOUTH_SPECS = [
  { id: 'S1', x: -60, z: -178, w: 44, d: 12, floors: 9, number: '43', street: 'ул. ШКОЛЬНАЯ', base: '#a9b1b5', plinth: '#7d7b74', balcony: 0.5, lit: 0.52, seed: 411, tv: true },
  { id: 'S2', x: 34, z: -178, w: 36, d: 12, floors: 5, number: '45', street: 'ул. ШКОЛЬНАЯ', base: '#a26f56', plinth: '#6f5140', balcony: 0.32, lit: 0.48, seed: 422 },
  { id: 'S3', x: -136, z: -178, w: 36, d: 12, floors: 5, number: '41', street: 'ул. ШКОЛЬНАЯ', base: '#c3bba9', plinth: '#8f8b80', balcony: 0.42, lit: 0.46, seed: 433, tv: true },
  { id: 'S4', x: -210, z: -178, w: 36, d: 12, floors: 9, number: '39', street: 'ул. ШКОЛЬНАЯ', base: '#a0a9b0', plinth: '#7d7b74', balcony: 0.5, lit: 0.5, seed: 444 },
  { id: 'S5', x: 82, z: -178, w: 30, d: 12, floors: 5, number: '47', street: 'ул. ШКОЛЬНАЯ', base: '#bfb8a6', plinth: '#8a8578', balcony: 0.4, lit: 0.44, seed: 455, tv: true },
];

/**
 * World coordinates of one painted entrance door: cell c (c % 4 === 3) on a
 * long side (+1 faces +z, -1 faces -z). The facade texture is mirrored on the
 * -z side, hence the x flip — same formula as the entrance pads below.
 */
export function entranceDoor(spec, c, side) {
  const cells = Math.max(4, Math.round(spec.w / CELL_W));
  const cw = spec.w / cells;
  const localX = -spec.w / 2 + (c + 0.5) * cw;
  const x = spec.x + side * localX;
  return {
    x,
    z: spec.z + side * (spec.d / 2),
    /** Center of the entrance pad: where the prompt is offered. */
    pad: { x, z: spec.z + side * (spec.d / 2 + 0.55) },
    /** A step in front of the door, facing away from the building. */
    out: { x, z: spec.z + side * (spec.d / 2 + 1.7), yaw: side > 0 ? Math.PI : 0 },
  };
}

/** Extruded red star, the Soviet detail par excellence. */
export function makeStarMesh(size = 0.9, thickness = 0.16, color = 0xa8231c) {
  const shape = new THREE.Shape();
  const points = 5;
  const inner = size * 0.42;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? size : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  geo.center();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.25, emissive: 0x220404 }));
  mesh.castShadow = true;
  return mesh;
}

export function buildBuildings(ctx) {
  const { world, materials: M, textures: T, rng } = ctx;
  const TX = ctx.TEXTURES;

  const roofMat = new THREE.MeshStandardMaterial({
    map: world.season === 'winter' ? T.roofWinter : T.roofAutumn,
    roughness: 0.95,
  });
  world.roofMats.push(roofMat);

  // snow line clinging to the facade top under the parapet (winter only)
  const snowLedgeMat = new THREE.MeshStandardMaterial({
    map: T.snowLedge,
    transparent: true,
    depthWrite: false,
    roughness: 0.85,
  });
  const addSnowLedges = (x, z, w, d, h) => {
    for (const side of [1, -1]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.75), snowLedgeMat);
      strip.position.set(x, h - 0.04, z + side * (d / 2 + 0.045));
      if (side < 0) strip.rotation.y = Math.PI;
      strip.receiveShadow = true;
      world.group.add(ctx.seasonable('winter', strip));
    }
  };

  for (const spec of BUILDING_SPECS) {
    const cells = Math.max(4, Math.round(spec.w / CELL_W));
    const sideCells = Math.max(2, Math.round(spec.d / CELL_W));
    const facadeRng = new Rng(spec.seed);
    const sideRng = new Rng(spec.seed + 101);

    // one window per chosen building glows with TV light: baked dark into the
    // facade texture, the animated flicker comes from an additive quad
    let tvPick = null;
    if (spec.tv) {
      const tvRng = new Rng(spec.seed + 500);
      tvPick = {
        f: tvRng.int(1, spec.floors - 1),
        c: tvRng.int(0, cells - 1),
        side: tvRng.sign(),
        phase: tvRng.float(0, TAU),
        speed: tvRng.float(0.5, 1.05),
      };
    }

    const facade = TX.makeFacadeTextures({
      floors: spec.floors,
      cells,
      base: spec.base,
      plinth: spec.plinth,
      rng: facadeRng,
      entranceEvery: 4,
      balconyChance: spec.balcony,
      litChance: spec.lit,
      winter: false,
      street: spec.street,
      number: spec.number,
      tvCells: tvPick ? new Set([`${tvPick.f}:${tvPick.c}`]) : null,
    });
    const side = TX.makeFacadeTextures({
      floors: spec.floors,
      cells: sideCells,
      base: spec.base,
      plinth: spec.plinth,
      rng: sideRng,
      entranceEvery: 99,
      balconyChance: 0.08,
      litChance: spec.lit * 0.8,
      winter: false,
      street: spec.street,
      number: spec.number,
    });

    const mkMat = (t) => {
      const mat = new THREE.MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.5,
        roughness: 0.93,
      });
      world.windowMats.push(mat);
      return mat;
    };
    const facadeMat = mkMat(facade);
    const sideMat = mkMat(side);

    const h = spec.floors * FLOOR_H;
    const geo = new THREE.BoxGeometry(spec.w, h, spec.d);
    const longAxisX = spec.w >= spec.d;
    const mats = longAxisX
      ? [sideMat, sideMat, roofMat, M.concreteDark, facadeMat, facadeMat]
      : [facadeMat, facadeMat, roofMat, M.concreteDark, sideMat, sideMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(spec.x, h / 2, spec.z);
    ctx.place(mesh);
    ctx.addBoxCollider(spec.x, spec.z, spec.w, spec.d, 0.25);
    addSnowLedges(spec.x, spec.z, spec.w, spec.d, h);

    // TV flicker quad, sitting exactly on the baked-dark window
    if (tvPick) {
      const cellW = spec.w / cells;
      const wx =
        tvPick.side > 0
          ? spec.x - spec.w / 2 + (tvPick.c + 0.5) * cellW
          : spec.x + spec.w / 2 - (tvPick.c + 0.5) * cellW;
      const wz = spec.z + tvPick.side * (spec.d / 2 + 0.03);
      const tvMat = new THREE.MeshBasicMaterial({
        map: T.tvGlow,
        color: 0x8fb4ef,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.5, FLOOR_H * 0.42), tvMat);
      quad.position.set(wx, tvPick.f * FLOOR_H + 1.53, wz);
      if (tvPick.side < 0) quad.rotation.y = Math.PI;
      world.group.add(quad);
      world.tvMats.push({ mat: tvMat, phase: tvPick.phase, speed: tvPick.speed });
    }

    // perimeter apron / отмостка
    const apron = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 1.8, 0.06, spec.d + 1.8), M.concreteDark);
    apron.position.set(spec.x, 0.04, spec.z);
    apron.receiveShadow = true;
    world.group.add(apron);

    // roof lip + snow
    const lipH = 0.45;
    const lips = [
      { w: spec.w + 0.3, d: 0.3, x: 0, z: spec.d / 2 },
      { w: spec.w + 0.3, d: 0.3, x: 0, z: -spec.d / 2 },
      { w: 0.3, d: spec.d + 0.3, x: spec.w / 2, z: 0 },
      { w: 0.3, d: spec.d + 0.3, x: -spec.w / 2, z: 0 },
    ];
    for (const lip of lips) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(lip.w, lipH, lip.d), M.concreteWhite);
      box.position.set(spec.x + lip.x, h + lipH / 2 - 0.1, spec.z + lip.z);
      box.castShadow = true;
      box.receiveShadow = true;
      world.group.add(box);
      const snow = new THREE.Mesh(new THREE.BoxGeometry(lip.w + 0.04, 0.09, lip.d + 0.04), M.snow);
      snow.position.set(spec.x + lip.x, h + lipH - 0.08, spec.z + lip.z);
      snow.castShadow = true;
      world.group.add(ctx.seasonable('winter', snow));
    }

    // roof access
    const access = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.7, 3.4), M.concreteDark);
    access.position.set(spec.x + spec.w * 0.22, h + 1.25, spec.z);
    ctx.place(access);
    const accessCap = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.14, 3.7), M.snow);
    accessCap.position.set(access.position.x, h + 2.66, spec.z);
    world.group.add(ctx.seasonable('winter', accessCap));

    // roof vents
    for (let i = 0; i < rng.int(3, 6); i++) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, rng.float(0.4, 0.9), 8), M.metal);
      vent.position.set(spec.x + rng.float(-spec.w * 0.42, spec.w * 0.42), h + 0.3, spec.z + rng.float(-spec.d * 0.32, spec.d * 0.32));
      ctx.place(vent);
    }

    // TV antennas
    for (let i = 0; i < 2; i++) {
      const ax = spec.x + (i === 0 ? -1 : 1) * spec.w * rng.float(0.18, 0.4);
      const az = spec.z + rng.sign() * (spec.d / 2 - 0.4);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 6), M.metal);
      mast.position.set(ax, h + 1.8, az);
      ctx.place(mast);
      for (let j = 0; j < 4; j++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, rng.float(0.7, 1.5), 4), M.metal);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(ax, h + 0.6 + j * 0.72, az);
        ctx.place(bar);
      }
    }

    // entrance pads on both long sides
    const cw = spec.w / cells;
    const entranceCells = [];
    for (let c = 0; c < cells; c++) if (c % 4 === 3) entranceCells.push(c);
    for (const c of entranceCells) {
      const localX = -spec.w / 2 + (c + 0.5) * cw;
      for (const side of [1, -1]) {
        const px = spec.x + side * 1 * localX;
        const pz = spec.z + side * (spec.d / 2 + 0.55);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.26, 1.5), M.concreteDark);
        pad.position.set(px, 0.13, pz);
        pad.receiveShadow = true;
        world.group.add(pad);
        const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.13, 0.4), M.concreteDark);
        step.position.set(px, 0.065, pz + side * 0.9);
        step.receiveShadow = true;
        world.group.add(step);
      }
    }
  }

  /* ---------------------------------------------------- northern cluster */
  // Same archetypes as the historic blocks, but every small repeated part is
  // baked into one mesh per material (apron/pads/access, lips, snow, metal)
  // and the roof details draw from per-building seeds, leaving the shared
  // RNG stream untouched.
  const buildExpansionBlock = (spec) => {
    const cells = Math.max(4, Math.round(spec.w / CELL_W));
    const sideCells = Math.max(2, Math.round(spec.d / CELL_W));
    const detailRng = new Rng(spec.seed + 7000);
    const facadeRng = new Rng(spec.seed);
    const sideRng = new Rng(spec.seed + 101);

    let tvPick = null;
    if (spec.tv) {
      const tvRng = new Rng(spec.seed + 500);
      tvPick = {
        f: tvRng.int(1, spec.floors - 1),
        c: tvRng.int(0, cells - 1),
        side: tvRng.sign(),
        phase: tvRng.float(0, TAU),
        speed: tvRng.float(0.5, 1.05),
      };
    }

    const facade = TX.makeFacadeTextures({
      floors: spec.floors,
      cells,
      base: spec.base,
      plinth: spec.plinth,
      rng: facadeRng,
      entranceEvery: 4,
      balconyChance: spec.balcony,
      litChance: spec.lit,
      winter: false,
      street: spec.street,
      number: spec.number,
      tvCells: tvPick ? new Set([`${tvPick.f}:${tvPick.c}`]) : null,
    });
    const side = TX.makeFacadeTextures({
      floors: spec.floors,
      cells: sideCells,
      base: spec.base,
      plinth: spec.plinth,
      rng: sideRng,
      entranceEvery: 99,
      balconyChance: 0.08,
      litChance: spec.lit * 0.8,
      winter: false,
      street: spec.street,
      number: spec.number,
    });

    const mkMat = (t) => {
      const mat = new THREE.MeshStandardMaterial({
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.5,
        roughness: 0.93,
      });
      world.windowMats.push(mat);
      return mat;
    };
    const facadeMat = mkMat(facade);
    const sideMat = mkMat(side);

    const h = spec.floors * FLOOR_H;
    const geo = new THREE.BoxGeometry(spec.w, h, spec.d);
    const mats = [sideMat, sideMat, roofMat, M.concreteDark, facadeMat, facadeMat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(spec.x, h / 2, spec.z);
    ctx.place(mesh);
    ctx.addBoxCollider(spec.x, spec.z, spec.w, spec.d, 0.25, true);
    addSnowLedges(spec.x, spec.z, spec.w, spec.d, h);

    // TV flicker quad, sitting exactly on the baked-dark window
    if (tvPick) {
      const cellW = spec.w / cells;
      const wx =
        tvPick.side > 0
          ? spec.x - spec.w / 2 + (tvPick.c + 0.5) * cellW
          : spec.x + spec.w / 2 - (tvPick.c + 0.5) * cellW;
      const wz = spec.z + tvPick.side * (spec.d / 2 + 0.03);
      const tvMat = new THREE.MeshBasicMaterial({
        map: T.tvGlow,
        color: 0x8fb4ef,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.5, FLOOR_H * 0.42), tvMat);
      quad.position.set(wx, tvPick.f * FLOOR_H + 1.53, wz);
      if (tvPick.side < 0) quad.rotation.y = Math.PI;
      world.group.add(quad);
      world.tvMats.push({ mat: tvMat, phase: tvPick.phase, speed: tvPick.speed });
    }

    // merged trim: one bake per material
    const darkParts = [];
    const whiteParts = [];
    const snowParts = [];
    const metalParts = [];
    const bx = (w, hh, d, x, y, z) => {
      const g = new THREE.BoxGeometry(w, hh, d);
      g.translate(x, y, z);
      return g;
    };

    // perimeter apron / отмостка
    darkParts.push(bx(spec.w + 1.8, 0.06, spec.d + 1.8, spec.x, 0.04, spec.z));

    // entrance pads on both long sides
    const cw = spec.w / cells;
    for (let c = 0; c < cells; c++) {
      if (c % 4 !== 3) continue;
      const localX = -spec.w / 2 + (c + 0.5) * cw;
      for (const s of [1, -1]) {
        const px = spec.x + s * localX;
        const pz = spec.z + s * (spec.d / 2 + 0.55);
        darkParts.push(bx(2.4, 0.26, 1.5, px, 0.13, pz));
        darkParts.push(bx(2.4, 0.13, 0.4, px, 0.065, pz + s * 0.9));
      }
    }

    // roof lip + snow
    const lipH = 0.45;
    const lips = [
      { w: spec.w + 0.3, d: 0.3, x: 0, z: spec.d / 2 },
      { w: spec.w + 0.3, d: 0.3, x: 0, z: -spec.d / 2 },
      { w: 0.3, d: spec.d + 0.3, x: spec.w / 2, z: 0 },
      { w: 0.3, d: spec.d + 0.3, x: -spec.w / 2, z: 0 },
    ];
    for (const lip of lips) {
      whiteParts.push(bx(lip.w, lipH, lip.d, spec.x + lip.x, h + lipH / 2 - 0.1, spec.z + lip.z));
      snowParts.push(bx(lip.w + 0.04, 0.09, lip.d + 0.04, spec.x + lip.x, h + lipH - 0.08, spec.z + lip.z));
    }

    // roof access + snow cap
    darkParts.push(bx(3.2, 2.7, 3.4, spec.x + spec.w * 0.22, h + 1.25, spec.z));
    snowParts.push(bx(3.5, 0.14, 3.7, spec.x + spec.w * 0.22, h + 2.66, spec.z));

    // roof vents
    for (let i = 0; i < detailRng.int(3, 6); i++) {
      const g = new THREE.CylinderGeometry(0.14, 0.16, detailRng.float(0.4, 0.9), 8);
      g.translate(spec.x + detailRng.float(-spec.w * 0.42, spec.w * 0.42), h + 0.3, spec.z + detailRng.float(-spec.d * 0.32, spec.d * 0.32));
      metalParts.push(g);
    }

    // TV antennas
    for (let i = 0; i < 2; i++) {
      const ax = spec.x + (i === 0 ? -1 : 1) * spec.w * detailRng.float(0.18, 0.4);
      const az = spec.z + detailRng.sign() * (spec.d / 2 - 0.4);
      const mast = new THREE.CylinderGeometry(0.05, 0.06, 3.6, 6);
      mast.translate(ax, h + 1.8, az);
      metalParts.push(mast);
      for (let j = 0; j < 4; j++) {
        const bar = new THREE.CylinderGeometry(0.02, 0.02, detailRng.float(0.7, 1.5), 4);
        bar.rotateZ(Math.PI / 2);
        bar.translate(ax, h + 0.6 + j * 0.72, az);
        metalParts.push(bar);
      }
    }

    const bakeTrim = (parts, material, season = null) => {
      if (!parts.length) return;
      const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      world.group.add(season ? ctx.seasonable(season, merged) : merged);
    };
    bakeTrim(darkParts, M.concreteDark);
    bakeTrim(whiteParts, M.concreteWhite);
    bakeTrim(snowParts, M.snow, 'winter');
    bakeTrim(metalParts, M.metal);
  };
  for (const spec of EXPANSION_SPECS) buildExpansionBlock(spec);
  for (const spec of WEST_SPECS) buildExpansionBlock(spec);
  for (const spec of SOUTH_SPECS) buildExpansionBlock(spec);

  /* ---------------------------------------------------- kindergarten no. 5 */
  {
    const x = 20;
    const z = -8;
    const w = 16;
    const d = 12;
    const floors = 2;
    const cells = 5;
    const t = TX.makeFacadeTextures({
      floors,
      cells,
      base: '#cfc7b4',
      plinth: '#8f8b80',
      rng: new Rng(909),
      entranceEvery: 2,
      balconyChance: 0,
      litChance: 0.3,
      winter: false,
      street: 'ДЕТСКИЙ САД',
      number: '5',
    });
    const side = TX.makeFacadeTextures({
      floors,
      cells: 4,
      base: '#cfc7b4',
      plinth: '#8f8b80',
      rng: new Rng(910),
      entranceEvery: 99,
      balconyChance: 0,
      litChance: 0.3,
      winter: false,
      street: 'ДЕТСКИЙ САД',
      number: '5',
    });
    const mkMat = (tt) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tt.map,
        emissiveMap: tt.emissive,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.6,
        roughness: 0.9,
      });
      world.windowMats.push(mat);
      return mat;
    };
    const h = floors * FLOOR_H + 0.6;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, [mkMat(side), mkMat(side), roofMat, M.concreteDark, mkMat(t), mkMat(t)]);
    mesh.position.set(x, h / 2, z);
    ctx.place(mesh);
    ctx.addBoxCollider(x, z, w, d, 0.25);
    addSnowLedges(x, z, w, d, h);

    // colored canopy and star above the entrance
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2.2), M.paintGreen);
    canopy.position.set(x, 2.9, z + d / 2 + 0.9);
    ctx.place(canopy);
    for (const dx of [-2, 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), M.metal);
      post.position.set(x + dx, 1.4, z + d / 2 + 1.8);
      ctx.place(post);
    }
    const star = makeStarMesh(0.55);
    star.position.set(x, h + 0.5, z + d / 2 + 0.2);
    star.rotation.y = Math.PI / 2;
    world.group.add(star);
    // swings and sandbox are in props.js
    ctx.addZone('Детский сад № 5', 'Kindergarten no. 5', 10, 32, -18, 4);
  }

  /* ---------------------------------------------------- heating plant */
  {
    const x = -72;
    const z = -62;
    const w = 12;
    const h = 6.5;
    const d = 8;
    const mill = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.brick);
    mill.position.set(x, h / 2, z);
    ctx.place(mill);
    ctx.addBoxCollider(x, z, w, d, 0.3);
    // gabled roof (two sloped slabs)
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.26, 4.7), M.metal);
      slab.rotation.x = s * 0.44;
      slab.position.set(x, h + 0.85, z + s * 2.05);
      ctx.place(slab);
      const snow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.84, 0.16, 4.74), M.snow);
      snow.rotation.x = s * 0.44;
      snow.position.set(x, h + 0.98, z + s * 2.05);
      world.group.add(ctx.seasonable('winter', snow));
    }
    // chimney
    const cx = x - 4.4;
    const cz = z - 2.6;
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.35, 24, 14), M.brick);
    chimney.position.set(cx, 12, cz);
    ctx.place(chimney);
    ctx.addBoxCollider(cx, cz, 2.6, 2.6, 0.2);
    const chimneyTop = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.8, 14), M.concreteDark);
    chimneyTop.position.set(cx, 24.2, cz);
    ctx.place(chimneyTop);
    world.points.chimney = new THREE.Vector3(cx + 0.4, 24.6, cz + 0.4);
    // pipes along the wall
    for (const dz of [0.9, -0.9]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, w + 1.4, 8), M.rust);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(x, 3.4, z + d / 2 + 0.35 + dz * 0.4);
      ctx.place(pipe);
    }
    // coal pile
    const coal = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshStandardMaterial({ color: 0x181a1c, roughness: 1 }));
    coal.scale.set(1.4, 0.42, 1);
    coal.position.set(x + 6.4, 0.3, z + 3.6);
    ctx.place(coal);
    ctx.addZone('Котельная № 4', 'Heating plant no. 4', -84, -56, -74, -50);
  }

  /* ---------------------------------------------------- garages */
  {
    const x = -70;
    const z0 = -28;
    const n = 9;
    const gw = 3.0;
    const gh = 2.35;
    const gd = 5.6;
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b6f70, roughness: 0.7, metalness: 0.45 });
    for (let i = 0; i < n; i++) {
      const z = z0 + i * (gw + 0.2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(gd, gh, gw), M.corrugated);
      body.position.set(x, gh / 2, z);
      ctx.place(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(gd + 0.3, 0.14, gw + 0.3), M.metal);
      roof.position.set(x, gh + 0.07, z);
      ctx.place(roof);
      const snow = new THREE.Mesh(new THREE.BoxGeometry(gd + 0.34, 0.12, gw + 0.34), M.snow);
      snow.position.set(x, gh + 0.2, z);
      world.group.add(ctx.seasonable('winter', snow));
      if (i !== 3 && i !== 7) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.14, gh * 0.82, gw * 0.86), doorMat);
        door.position.set(x + gd / 2 + 0.02, gh * 0.42, z);
        ctx.place(door);
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.16), M.metalLight);
        lock.position.set(x + gd / 2 + 0.12, gh * 0.42, z + gw * 0.3);
        ctx.place(lock);
      } else {
        const dark = new THREE.Mesh(new THREE.PlaneGeometry(gw * 0.86, gh * 0.82), new THREE.MeshBasicMaterial({ color: 0x0a0c0d }));
        dark.rotation.y = Math.PI / 2;
        dark.position.set(x + gd / 2 - 0.01, gh * 0.42, z);
        world.group.add(dark);
      }
    }
    ctx.addBoxCollider(x, z0 + ((n - 1) * (gw + 0.2)) / 2, gd, (n - 1) * (gw + 0.2) + gw, 0.2);
    ctx.addZone('Гаражи', 'Garages', -80, -60, -34, 18);
  }

  /* ---------------------------------------------------- fences */
  // ПО-2 panels: the rhombus relief maps once onto each panel face
  const fenceMat = new THREE.MeshStandardMaterial({ map: makeFencePanelTexture(), roughness: 0.92 });
  const panelFence = (x0, z0, x1, z1, gap = null, { ghost = false } = {}) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const panels = Math.max(1, Math.round(len / 2.6));
    const angle = Math.atan2(dz, dx);
    for (let i = 0; i < panels && !ghost; i++) {
      const t = (i + 0.5) / panels;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      // (a run along z with a gate cut in it: no panels, posts or snow there)
      if (gap && pz > gap[0] - 1.3 && pz < gap[1] + 1.3) continue;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.3, 0.32), fenceMat);
      panel.position.set(px, 1.15, pz);
      panel.rotation.y = -angle;
      ctx.place(panel);
      const t2 = (i + 1) / panels;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.7, 0.34), M.concreteDark);
      post.position.set(x0 + dx * t2, 1.35, z0 + dz * t2);
      post.rotation.y = -angle;
      ctx.place(post);
      if (i % 2 === 0) {
        const snow = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.1, 0.36), M.snow);
        snow.position.set(px, 2.35, pz);
        snow.rotation.y = -angle;
        world.group.add(ctx.seasonable('winter', snow));
      }
    }
    const rect = { x0: Math.min(x0, x1) - 0.3, x1: Math.max(x0, x1) + 0.3, z0: Math.min(z0, z1) - 0.3, z1: Math.max(z0, z1) + 0.3 };
    ctx.addColliderRect(rect.x0, rect.x1, rect.z0, rect.z1);
    // (a ghost: the seeded scatter still sees the run, nothing else does)
    if (ghost) world.colliders.at(-1).buildOnly = true;
    else if (gap) {
      // the whole run still shapes the seeded scatter; once the world is
      // built only the two stretches either side of the gate stand
      ctx.world.colliders[ctx.world.colliders.length - 1].buildOnly = true;
      ctx.addLateColliderRect(rect.x0, rect.x1, rect.z0, gap[0]);
      ctx.addLateColliderRect(rect.x0, rect.x1, gap[1], rect.z1);
    }
  };
  // kindergarten
  panelFence(11, -17.4, 31, -17.4);
  panelFence(31, -17.4, 31, 3);
  panelFence(11, -17.4, 11, -5);
  // garages and heating plant
  panelFence(-76, -34, -76, 16);
  panelFence(-78, -48, -62, -48);
  panelFence(-62, -50, -62, -70);
  // the south limit (z = -104) opened up for the school quarter: its runs
  // stay as legacy ghosts so the historic scatter keeps its placements
  ctx.addLegacyGhostRect(-70.3, -13.7, -104.3, -103.7);
  ctx.addLegacyGhostRect(13.7, 70.3, -104.3, -103.7);
  // the west limit (x = -104) opened up for ул. Строителей: its runs stay
  // as legacy ghosts so the historic scatter passes keep their placements
  ctx.addLegacyGhostRect(-104.3, -103.7, -70.3, -13.7);
  ctx.addLegacyGhostRect(-104.3, -103.7, 13.7, 70.3);
  // the old east limit is gone as well: the district runs out on to the
  // steppe. Ghosts, like every run of the outer limits below
  panelFence(104, -70, 104, -14, null, { ghost: true });
  panelFence(104, 14, 104, 70, [WORLD.crossroadZ - 7, WORLD.crossroadZ + 7], { ghost: true });
  // the old north edge (z = 104) opened up: the avenue now runs on to the
  // second cluster. The limits that then stood at the expanded edges are
  // gone too, the streets running on past them (edges.js): by default a run
  // is a ghost, its collider only shaping the seeded scatter as it always
  // has. A standing run (ghost: false) bakes panels, posts and snow into one
  // mesh per material; `gaps` ([from, to] along the run) are cut in its
  // collider and `open` ones can be walked through once the world is built.
  const panelFenceMerged = (x0, z0, x1, z1, { gaps = [], open = false, ghost = true } = {}) => {
    const alongX = z0 === z1;
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const at = (a) => (alongX ? [a, z0] : [x0, a]);
    const angle = alongX ? 0 : Math.PI / 2;
    const segments = [];
    let from = a0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      segments.push([from, g0]);
      from = g1;
    }
    segments.push([from, a1]);
    const panelParts = [];
    const postParts = [];
    const snowParts = [];
    for (const [s0, s1] of segments) {
      const len = s1 - s0;
      const panels = Math.max(1, Math.round(len / 2.6));
      const step = len / panels;
      for (let i = 0; i <= panels; i++) {
        const post = new THREE.BoxGeometry(0.34, 2.7, 0.34);
        post.rotateY(-angle);
        post.translate(at(s0 + step * i)[0], 1.35, at(s0 + step * i)[1]);
        postParts.push(post);
        if (i === panels) break;
        const [px, pz] = at(s0 + step * (i + 0.5));
        const panel = new THREE.BoxGeometry(step - 0.1, 2.3, 0.32);
        panel.rotateY(-angle);
        panel.translate(px, 1.15, pz);
        panelParts.push(panel);
        if (i % 2 === 0) {
          const snow = new THREE.BoxGeometry(step - 0.05, 0.1, 0.36);
          snow.rotateY(-angle);
          snow.translate(px, 2.35, pz);
          snowParts.push(snow);
        }
      }
    }
    const bake = (parts, material, season = null) => {
      const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      world.group.add(season ? ctx.seasonable(season, merged) : merged);
    };
    if (!ghost) {
      bake(panelParts, fenceMat);
      bake(postParts, M.concreteDark);
      bake(snowParts, M.snow, 'winter');
    }
    ctx.addColliderRect(Math.min(x0, x1) - 0.3, Math.max(x0, x1) + 0.3, Math.min(z0, z1) - 0.3, Math.max(z0, z1) + 0.3, true);
    if (ghost) world.colliders.at(-1).buildOnly = true;
    else if (open) {
      world.colliders.at(-1).buildOnly = true;
      for (const [s0, s1] of segments) {
        const [ax, az] = at(s0);
        const [bx, bz] = at(s1);
        ctx.addLateColliderRect(ax - 0.3, bx + 0.3, az - 0.3, bz + 0.3);
      }
    }
  };
  // where a street crossed one of these lines, the run had a gap
  const gateGap = (along, fence) => EDGE_GATES.filter((g) => g.along === along && (along === 'x' ? g.z : g.x) === fence).map((g) => {
    const c = along === 'x' ? g.x : g.z;
    return [c - g.half - 1.2, c + g.half + 1.2];
  });
  panelFenceMerged(-80, 176, -14, 176);
  panelFenceMerged(14, 176, 80, 176);
  // the western cluster's limits: its own edge, and the south and north
  // lines carried on westward
  panelFenceMerged(-236, -196, -236, 176, { gaps: gateGap('z', -236) });
  // the southern quarter's limits: its own edge and the east line carried down
  panelFenceMerged(-236, -196, 104, -196);
  panelFenceMerged(104, -196, 104, -70, { gaps: gateGap('z', 104) });
  panelFenceMerged(-236, 176, -80, 176, { gaps: gateGap('x', 176) });
  // Zavodskaya runs on through it into the private sector's ул. Кедровая
  panelFenceMerged(104, 70, 104, 176, { gaps: [[EAST.link.z0 - 0.4, EAST.link.z1 + 0.4]], open: true });
  // ghosts of the removed z = 104 fence runs: the historic scatter passes
  // still see them, the player does not
  ctx.addLegacyGhostRect(-70.3, -13.7, 103.7, 104.3);
  ctx.addLegacyGhostRect(13.7, 70.3, 103.7, 104.3);

  /* ---------------------------------------------------- microdistrict sign */
  const signTex = makeSignTexture(1024, 320, (c, W, H) => {
    c.fillStyle = '#c8cdd2';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#2b4a6f';
    c.fillRect(0, 0, W, H * 0.62);
    c.fillStyle = '#efe3cf';
    c.font = 'bold 96px "Arial Narrow", Arial, sans-serif';
    c.fillText('МИКРОРАЙОН № 7', W / 2, H * 0.32);
    c.font = 'bold 52px "Arial Narrow", Arial, sans-serif';
    c.fillText('1964', W / 2, H * 0.54);
    c.fillStyle = '#a8231c';
    starPath(c, W * 0.5, H * 0.8, 20, 8.5);
    c.fill();
  });
  const signFor = (x, z, ry) => {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(16, 5, 0.3),
      [M.metal, M.metal, M.metal, M.metal, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }), M.metal]
    );
    board.position.set(x, 5.4, z);
    board.rotation.y = ry;
    ctx.place(board);
    for (const dx of [-6, 6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), M.concreteDark);
      const px = x + Math.cos(ry) * dx;
      const pz = z - Math.sin(ry) * dx;
      post.position.set(px, 1.6, pz);
      ctx.place(post);
    }
    const snow = new THREE.Mesh(new THREE.BoxGeometry(16.1, 0.12, 0.5), M.snow);
    snow.position.set(x, 7.9, z);
    snow.rotation.y = ry;
    world.group.add(ctx.seasonable('winter', snow));
  };
  // the district sign now closes the view down the avenue, past ул. Школьная
  signFor(-8, -192.5, 0);
  signFor(20, 174, Math.PI);

  /* ---------------------------------------------------- distant skyline */
  // the far blocks are panel blocks too: a facade of storey-high panels
  // (8 bays x 10 floors a tile), dark windows by day, a scatter of them lit
  // at night, mapped at real size on every face
  const BAY = 3.4;
  const STOREY = 2.8;
  const TILE_W = BAY * 8;
  const TILE_H = STOREY * 10;
  // two series: grey ribbed panels (II-18) and cream tiled panels with a
  // brick-red band under every sill (1-464); 128 px a bay, so the facades
  // still hold up when you walk right to them
  const makeFacade = (series, seed) => {
    const W = 1024;
    const facadeCanvas = makeCanvas(W, W);
    const litCanvas = makeCanvas(W, W);
    const fc = facadeCanvas.getContext('2d');
    const lc = litCanvas.getContext('2d');
    const tiled = series === 'tiled';
    fc.fillStyle = tiled ? '#c9c4b6' : '#9a9fa2';
    fc.fillRect(0, 0, W, W);
    lc.fillStyle = '#000';
    lc.fillRect(0, 0, W, W);
    const wrng = new Rng(seed);
    const bw = W / 8;
    const fh = W / 10;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 8; col++) {
        const x = col * bw;
        const y = row * fh;
        // each panel a shade of its own, and the sealed seams between them
        const k = wrng.int(-9, 9);
        fc.fillStyle = tiled ? `rgb(${203 + k},${198 + k},${184 + k})` : `rgb(${152 + k},${157 + k},${160 + k})`;
        fc.fillRect(x + 2, y + 2, bw - 4, fh - 4);
        if (tiled) {
          // the little tiles
          fc.fillStyle = 'rgba(120,112,96,0.18)';
          for (let ty = y + 2; ty < y + fh; ty += 6) fc.fillRect(x, ty, bw, 1);
          for (let tx = x + 2; tx < x + bw; tx += 8) fc.fillRect(tx, y, 1, fh);
          fc.fillStyle = '#9b5a44';
          fc.fillRect(x, y + fh * 0.8, bw, fh * 0.09);
        } else {
          // the ribs of the panel
          fc.fillStyle = 'rgba(60,64,66,0.12)';
          for (let tx = x + 8; tx < x + bw - 4; tx += 10) fc.fillRect(tx, y + 4, 2, fh - 8);
        }
        fc.fillStyle = tiled ? '#7d7668' : '#4f5457';
        fc.fillRect(x, y, bw, 3);
        fc.fillRect(x, y, 3, fh);
        // the window: a painted frame, two panes and a transom, a sill
        const wx = x + bw * 0.24;
        const wy = y + fh * 0.22;
        const ww = bw * 0.52;
        const wh = fh * 0.52;
        fc.fillStyle = wrng.chance(0.18) ? '#8a6a48' : '#d8d6cf';
        fc.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        const lit = wrng.chance(0.24);
        const warm = wrng.chance(0.75);
        fc.fillStyle = lit ? (warm ? '#7c6347' : '#5b6670') : '#262c31';
        fc.fillRect(wx, wy, ww, wh);
        fc.fillStyle = 'rgba(255,255,255,0.07)';
        fc.fillRect(wx, wy, ww * 0.45, wh * 0.4);
        fc.fillStyle = '#d8d6cf';
        fc.fillRect(wx + ww / 2 - 2, wy, 4, wh);
        fc.fillRect(wx, wy + wh * 0.3, ww, 3);
        fc.fillStyle = '#6f7275';
        fc.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
        // rust and rain under the sill
        fc.fillStyle = 'rgba(70,60,50,0.12)';
        fc.fillRect(wx + wrng.float(0, ww * 0.6), wy + wh + 6, 6, wrng.float(8, fh * 0.3));
        if (lit) {
          lc.fillStyle = warm ? `rgb(255,${170 + wrng.int(0, 40)},${90 + wrng.int(0, 30)})` : 'rgb(185,210,255)';
          lc.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
          lc.fillStyle = '#000';
          lc.fillRect(wx + ww / 2 - 2, wy, 4, wh);
        }
        // a loggia every fourth bay: slab, railing, a glazed one now and then
        if (col % 4 === 1 && row > 0) {
          const by = y + fh * 0.74;
          fc.fillStyle = tiled ? '#b9b3a3' : '#878c90';
          fc.fillRect(x + bw * 0.08, by, bw * 0.84, fh * 0.2);
          fc.fillStyle = '#3e4447';
          for (let rx = x + bw * 0.1; rx < x + bw * 0.9; rx += 7) fc.fillRect(rx, by - fh * 0.16, 2, fh * 0.16);
          fc.fillRect(x + bw * 0.08, by - fh * 0.17, bw * 0.84, 3);
          if (wrng.chance(0.3)) {
            fc.fillStyle = 'rgba(190,200,205,0.35)';
            fc.fillRect(x + bw * 0.1, y + fh * 0.12, bw * 0.8, fh * 0.46);
          }
        }
      }
    }
    // streaks of damp running down from the roof
    for (let i = 0; i < 26; i++) {
      fc.fillStyle = `rgba(40,40,36,${wrng.float(0.03, 0.08)})`;
      fc.fillRect(wrng.float(0, W), 0, wrng.float(3, 14), wrng.float(60, 400));
    }
    const facadeTex = canvasTexture(facadeCanvas);
    facadeTex.anisotropy = 4;
    const lit = new THREE.MeshStandardMaterial({
      map: facadeTex,
      emissiveMap: canvasTexture(litCanvas),
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.5,
      roughness: 0.95,
    });
    world.windowMats.push(lit);
    return { lit };
  };
  const SERIES = [makeFacade('panel', 4242), makeFacade('tiled', 4243)];
  /** A box with its facades mapped at real size, starting at a whole bay. */
  const towerGeo = (w, h, d, shift) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    // faces in BoxGeometry order: +x, -x, +y, -y, +z, -z (4 vertices each)
    const sizes = [[d, h], [d, h], null, null, [w, h], [w, h]];
    sizes.forEach((size, f) => {
      // (the roof takes one plain spot of a panel: one material, one draw)
      for (let v = f * 4; v < f * 4 + 4; v++) {
        if (size) uv.setXY(v, shift + (uv.getX(v) * size[0]) / TILE_W, (uv.getY(v) * size[1]) / TILE_H);
        else uv.setXY(v, 0.06, 0.985);
      }
    });
    return geo;
  };

  const ring = new Rng(777);
  const skylineBoxes = [];
  for (let i = 0; i < 46; i++) {
    const a = ring.float(0, TAU);
    const r = ring.float(150, 300);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = ring.float(14, 44);
    const d = ring.float(12, 26);
    // (whole storeys, plus the parapet)
    const h = Math.max(4, Math.round(ring.float(12, 42) / STOREY)) * STOREY + 0.6;
    ring.chance(0.65); // (once the pick of a dark block: every block has its evenings now)
    const series = SERIES[i % 3 === 1 ? 1 : 0];
    const mesh = new THREE.Mesh(towerGeo(w, h, d, (i % 8) / 8), series.lit);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = ring.float(0, TAU) * 0.2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    world.group.add(mesh);
    skylineBoxes.push(mesh);
  }
  // the northern cluster (playable up to z = 180) now occupies space the
  // ring used to have to itself: boxes that would stand among the new
  // blocks slide outward along their own bearing, keeping the belt unbroken
  for (let i = 0; i < skylineBoxes.length; i++) {
    const mesh = skylineBoxes[i];
    const { x, z } = mesh.position;
    if (Math.abs(x) < 132 && z > 96 && z < 206) {
      const a = Math.atan2(z, x);
      // (well back from the north fence, z = 176: up close a box reads as one)
      const r = 265 + (i % 7) * 10;
      mesh.position.x = Math.cos(a) * r;
      mesh.position.z = Math.sin(a) * r;
    }
  }
  // the same for the western cluster (playable down to x = -236)
  for (let i = 0; i < skylineBoxes.length; i++) {
    const mesh = skylineBoxes[i];
    const { x, z } = mesh.position;
    if (x < -96 && x > -262 && z > -140 && z < 214) {
      const a = Math.atan2(z, x);
      // far enough past the west fence (x = -236) to stay a silhouette
      const r = 345 + (i % 5) * 14;
      mesh.position.x = Math.cos(a) * r;
      mesh.position.z = Math.sin(a) * r;
    }
  }
  // and for the southern quarter (playable down to z = -196)
  for (let i = 0; i < skylineBoxes.length; i++) {
    const mesh = skylineBoxes[i];
    const { x, z } = mesh.position;
    if (x > -262 && x < 132 && z < -96 && z > -236) {
      const a = Math.atan2(z, x);
      const r = 290 + (i % 6) * 12;
      mesh.position.x = Math.cos(a) * r;
      mesh.position.z = Math.sin(a) * r;
    }
  }
  // the steppe highway runs out east through the ring: boxes standing on or
  // near the road would wall it in, so they are left out (their draws are
  // made all the same)
  for (const mesh of skylineBoxes) {
    const { x, z } = mesh.position;
    if (x > 100 && (highwayRange(x, z) < 90 || nearEastSector(x, z, 45))) mesh.removeFromParent();
    // nor on the streets that run on past the fences (edges.js)
    else if (onEdgeRoad(x, z, 30)) mesh.removeFromParent();
  }
  // the streets that run on past the gates are streets still: blocks line
  // them on both sides, set back behind their own yards, so that through a
  // gate the town carries on into the haze instead of an empty plain
  const frontRng = new Rng(5150);
  const standing = skylineBoxes.filter((m) => m.parent);
  const frontage = [];
  for (const g of EDGE_GATES) {
    const [dx, dz] = g.dir;
    // (sideways from the road)
    const sx = -dz;
    const sz = dx;
    const start = Math.abs(dx ? g.from - g.x : g.from - g.z) + 26;
    for (const side of [-1, 1]) {
      let s = start + frontRng.float(0, 14);
      for (;;) {
        const len = frontRng.pick([BAY * 6, BAY * 8, BAY * 10, BAY * 12]);
        const deep = frontRng.float(11, 14);
        const h = frontRng.pick([5, 5, 9, 9, 12]) * STOREY + 0.6;
        const off = g.half + frontRng.float(20, 30) + deep / 2;
        const along = s + len / 2;
        const x = g.x + dx * along + sx * side * off;
        const z = g.z + dz * along + sz * side * off;
        s += len + frontRng.float(10, 26);
        // out past the ground's edge, on the highway, by the private sector,
        // on another of these roads or on top of a skyline box: left out
        if (Math.max(Math.abs(x), Math.abs(z)) + len / 2 > 335) break;
        if ((x > 100 && (highwayRange(x, z) < 90 || nearEastSector(x, z, 45))) || onEdgeRoad(x, z, deep / 2 + 8)) continue;
        if (standing.some((m) => Math.hypot(m.position.x - x, m.position.z - z) < 30 + len / 2)) continue;
        // the long side faces the road
        const series = SERIES[frontage.length % 3 === 2 ? 1 : 0];
        const shift = frontRng.int(0, 7) / 8;
        frontRng.chance(0.8); // (the old dark-block pick, kept for the stream)
        const mesh = new THREE.Mesh(towerGeo(len, h, deep, shift), series.lit);
        mesh.userData.faces = [g.x + dx * along, g.z + dz * along];
        mesh.userData.roadHalf = g.half;
        mesh.position.set(x, h / 2, z);
        mesh.rotation.y = dx ? 0 : Math.PI / 2;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        world.group.add(mesh);
        frontage.push(mesh);
      }
    }
  }
  // out there can be walked to now (WORLD.limit): every block stands solid
  for (const mesh of [...standing, ...frontage]) {
    const { width, depth } = mesh.geometry.parameters;
    ctx.addLateOrientedBox(mesh.position.x, mesh.position.z, width + 0.6, depth + 0.6, mesh.rotation.y);
  }
  dressOuterBlocks(ctx, [...standing, ...frontage], BAY);
  // industrial sites
  // the halls: grimy brick with two ribbons of factory glazing, a few panes
  // lit for the night shift; the stacks banded red and white up top
  const HALL_W = 12;
  const hallCanvas = makeCanvas(256, 256);
  const hallLitCanvas = makeCanvas(256, 256);
  {
    const hc = hallCanvas.getContext('2d');
    const lc = hallLitCanvas.getContext('2d');
    const hr = new Rng(6161);
    hc.fillStyle = '#6e5a4e';
    hc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const k = hr.int(-14, 14);
      hc.fillStyle = `rgb(${104 + k},${84 + k},${72 + k})`;
      hc.fillRect(hr.float(0, 256), hr.float(0, 256), hr.float(4, 10), 2);
    }
    lc.fillStyle = '#000';
    lc.fillRect(0, 0, 256, 256);
    for (const [y0, y1] of [[0.2, 0.38], [0.52, 0.7]]) {
      for (let c = 0; c < 4; c++) {
        const x = c * 64 + 6;
        hc.fillStyle = '#2a3036';
        hc.fillRect(x, y0 * 256, 52, (y1 - y0) * 256);
        hc.fillStyle = '#4e5559';
        for (let m = 1; m < 4; m++) hc.fillRect(x + m * 13, y0 * 256, 1.5, (y1 - y0) * 256);
        hc.fillRect(x, ((y0 + y1) / 2) * 256, 52, 1.5);
        if (hr.chance(0.45)) {
          lc.fillStyle = `rgb(255,${200 + hr.int(0, 40)},${130 + hr.int(0, 50)})`;
          lc.fillRect(x + 1, y0 * 256 + 1, 50, (y1 - y0) * 256 - 2);
        }
      }
    }
    // soot streaks down from the parapet
    for (let i = 0; i < 30; i++) {
      const g = hc.createLinearGradient(0, 0, 0, hr.float(60, 200));
      g.addColorStop(0, 'rgba(30,26,24,0.35)');
      g.addColorStop(1, 'rgba(30,26,24,0)');
      hc.fillStyle = g;
      hc.fillRect(hr.float(0, 256), 0, hr.float(3, 12), 256);
    }
  }
  const hallMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(hallCanvas),
    emissiveMap: canvasTexture(hallLitCanvas),
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.5,
    roughness: 1,
  });
  world.windowMats.push(hallMat);
  const hallGeo = (w, h, d) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const sizes = [d, d, null, null, w, w];
    sizes.forEach((size, f) => {
      for (let v = f * 4; v < f * 4 + 4; v++) {
        // (the roof takes a plain spot of brick)
        if (size) uv.setXY(v, (uv.getX(v) * size) / HALL_W, uv.getY(v));
        else uv.setXY(v, 0.5, 0.97);
      }
    });
    return geo;
  };
  const stackCanvas = makeCanvas(16, 256);
  {
    const sc = stackCanvas.getContext('2d');
    sc.fillStyle = '#8a8580';
    sc.fillRect(0, 0, 16, 256);
    // (the canvas top is the stack's top)
    for (let b = 0; b < 6; b++) {
      sc.fillStyle = b % 2 ? '#d8d4cc' : '#a3322a';
      sc.fillRect(0, b * 16, 16, 16);
    }
    const g = sc.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, 'rgba(20,18,16,0.7)');
    g.addColorStop(1, 'rgba(20,18,16,0)');
    sc.fillStyle = g;
    sc.fillRect(0, 0, 16, 40);
  }
  const stackMat = new THREE.MeshStandardMaterial({ map: canvasTexture(stackCanvas), roughness: 0.95 });
  const factory = (x, z, h = 44) => {
    const body = new THREE.Mesh(hallGeo(34, 16, 22), hallMat);
    body.position.set(x, 7, z);
    world.group.add(body);
    ctx.addLateColliderRect(x - 17.1, x + 17.1, z - 11.1, z + 11.1);
    // a lower annex along one side
    const annex = new THREE.Mesh(hallGeo(20, 9, 12), hallMat);
    annex.position.set(x - 4, 3.5, z + 16.5);
    world.group.add(annex);
    ctx.addLateColliderRect(x - 14.1, x + 6.1, z + 10.4, z + 22.6);
    for (const dx of [-9, 9]) {
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, h, 12), stackMat);
      chim.position.set(x + dx, h / 2 - 2, z);
      world.group.add(chim);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    beacon.position.set(x + 9, h - 1, z);
    world.group.add(beacon);
    beacons.push(beacon);
  };
  // the chimneys blink in step; one red light sits on the beacon nearest to
  // the camera (environment.js), the others are far in the fog anyway
  const beacons = [];
  factory(-210, -268, 46);
  factory(168, -214, 52);
  factory(150, 190, 38);
  const beaconLight = new THREE.PointLight(0xff4020, 0, 60, 2);
  beaconLight.layers.set(OUTDOOR_LIGHT_LAYER);
  beaconLight.position.copy(beacons[0].position);
  world.group.add(beaconLight);
  world.beacon = { light: beaconLight, spots: beacons.map((b) => b.position) };
  ctx.addUpdater((dt, t) => {
    const on = Math.sin(t * 1.6) > 0;
    for (const beacon of beacons) beacon.material.color.setHex(on ? 0xff3020 : 0x3a0c08);
    beaconLight.intensity = on ? 6 : 0;
  });

  // water tower
  {
    const tower = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 18, 8), new THREE.MeshStandardMaterial({ color: 0x8e8c86, roughness: 1 }));
    legs.position.y = 9;
    tower.add(legs);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x6b6458, roughness: 0.8, metalness: 0.2 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 7, 12), tankMat);
    tank.position.y = 20;
    tower.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5, 2.6, 12), tankMat);
    cap.position.y = 24.8;
    tower.add(cap);
    // beyond the western cluster now (it used to stand where W7 is)
    tower.position.set(-272, 0, 150);
    world.group.add(tower);
    ctx.addLateColliderRect(-275.4, -268.6, 146.6, 153.4);
  }
}

/**
 * What makes a box a block when you walk up to it: a plinth, a cornice, the
 * lift motor rooms on the roof, and its entrances (подъезды) — a door under
 * a concrete canopy and a step every section, on the long side that faces
 * its street (or the district). One merged mesh per material for them all.
 */
function dressOuterBlocks(ctx, blocks, BAY) {
  const { world, materials: M } = ctx;
  const parts = { plinth: [], concrete: [], door: [], snow: [], bulb: [], wood: [], path: [] };
  const bulbs = [];
  const worldRect = (pts) => {
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  };
  const put = (list, w, h, d, x, y, z, m) => list.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z).applyMatrix4(m));
  for (const mesh of blocks) {
    const { width: w, height: h, depth: d } = mesh.geometry.parameters;
    const m = new THREE.Matrix4().makeRotationY(mesh.rotation.y).setPosition(mesh.position.x, 0, mesh.position.z);
    put(parts.plinth, w + 0.3, 0.9, d + 0.3, 0, 0.45, 0, m);
    put(parts.concrete, w + 0.36, 0.45, d + 0.36, 0, h - 0.2, 0, m);
    put(parts.snow, w + 0.2, 0.12, d + 0.2, 0, h + 0.06, 0, m);
    if (h > 20) {
      for (const lx of w > 30 ? [-w / 4, w / 4] : [0]) {
        put(parts.concrete, 3.2, 2.6, 4.2, lx, h + 1.3, 0, m);
        put(parts.snow, 3.3, 0.12, 4.3, lx, h + 2.66, 0, m);
      }
    }
    // which long side faces the street (local +z or -z)
    const [fx, fz] = mesh.userData.faces ?? [0, 0];
    const ax = fx - mesh.position.x;
    const az = fz - mesh.position.z;
    const side = Math.sin(mesh.rotation.y) * ax + Math.cos(mesh.rotation.y) * az >= 0 ? 1 : -1;
    const bays = Math.floor(w / BAY);
    const sections = Math.max(1, Math.round(bays / 4));
    for (let k = 0; k < sections; k++) {
      // the middle bay of each section, on the bay grid of that face
      const bay = Math.min(bays - 1, Math.floor(((k + 0.5) * bays) / sections));
      const lx = side > 0 ? -w / 2 + (bay + 0.5) * BAY : w / 2 - (bay + 0.5) * BAY;
      const zf = (side * d) / 2;
      put(parts.door, 1.5, 2.3, 0.2, lx, 1.15, zf + side * 0.08, m);
      // a bare bulb over the door, the stairwell lit behind it
      put(parts.bulb, 0.22, 0.16, 0.22, lx, 2.56, zf + side * 0.3, m);
      bulbs.push(new THREE.Vector3(lx, 2.5, zf + side * 0.3).applyMatrix4(m));
      put(parts.concrete, 2.8, 0.16, 1.5, lx, 2.75, zf + side * 0.75, m);
      put(parts.snow, 2.7, 0.08, 1.4, lx, 2.87, zf + side * 0.75, m);
      put(parts.plinth, 2.4, 0.18, 1.3, lx, 0.09, zf + side * 0.65, m);
      for (const s of [-1, 1]) {
        put(parts.concrete, 0.12, 2.75, 0.12, lx + s * 1.25, 1.37, zf + side * 1.4, m);
        const p = new THREE.Vector3(lx + s * 1.25, 0, zf + side * 1.4).applyMatrix4(m);
        ctx.addLateColliderRect(p.x - 0.12, p.x + 0.12, p.z - 0.12, p.z + 0.12);
      }
      // the bench by the door (лавочка у подъезда): slats on concrete legs
      const bx = lx - Math.sign(lx || 1) * 2.5;
      const bz = zf + side * 0.95;
      put(parts.wood, 1.8, 0.07, 0.42, bx, 0.46, bz, m);
      put(parts.wood, 1.8, 0.32, 0.05, bx, 0.74, bz - side * 0.2, m);
      for (const e of [-0.75, 0.75]) put(parts.concrete, 0.1, 0.44, 0.4, bx + e, 0.22, bz, m);
      put(parts.snow, 1.7, 0.05, 0.36, bx, 0.52, bz, m);
      const b = worldRect([new THREE.Vector3(bx - 0.95, 0, bz - 0.3), new THREE.Vector3(bx + 0.95, 0, bz + 0.3)].map((v) => v.applyMatrix4(m)));
      ctx.addLateColliderRect(b.minX, b.maxX, b.minZ, b.maxZ);
      // and the trodden path from the street to the step
      if (mesh.userData.faces) {
        const reach = Math.abs(Math.sin(mesh.rotation.y) * ax + Math.cos(mesh.rotation.y) * az);
        const len = reach - d / 2 - 1.3 - (mesh.userData.roadHalf + 2.2);
        if (len > 2) {
          const pz = zf + side * (1.3 + len / 2);
          const plane = new THREE.PlaneGeometry(2, len).rotateX(-Math.PI / 2);
          const uv = plane.attributes.uv;
          for (let v = 0; v < uv.count; v++) uv.setXY(v, (uv.getX(v) * 2) / 4, (uv.getY(v) * len) / 4);
          parts.path.push(plane.translate(lx, 0.028, pz).applyMatrix4(m));
          // (the steppe's grass and trees keep off it; nothing blocks you)
          const r = worldRect([new THREE.Vector3(lx - 1.2, 0, pz - len / 2), new THREE.Vector3(lx + 1.2, 0, pz + len / 2)].map((v) => v.applyMatrix4(m)));
          world.lateColliders.push({ ...r, buildOnly: true });
        }
      }
    }
  }
  const mats = {
    plinth: new THREE.MeshStandardMaterial({ color: 0x6d6c68, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x9c9d98, roughness: 0.95 }),
    door: new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.85 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0x8a8678, emissive: 0xffd9a0, emissiveIntensity: 0 }),
    snow: M.snow,
    wood: M.wood,
    path: new THREE.MeshStandardMaterial({ map: world.season === 'winter' ? ctx.textures.path : ctx.textures.pathAutumn, roughness: 0.88 }),
  };
  world.pathMats.push(mats.path);
  for (const [key, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mats[key]);
    mesh.name = `outer-blocks:${key}`;
    mesh.receiveShadow = true;
    world.group.add(key === 'snow' ? ctx.seasonable('winter', mesh) : mesh);
  }
  // their halo, one draw for all, in step with the street lamps (props.js)
  const glowMat = new THREE.PointsMaterial({ map: makeGlowTexture(64, '255,214,160'), size: 2.4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Points(new THREE.BufferGeometry().setFromPoints(bulbs), glowMat);
  glow.name = 'outer-blocks:bulb-glow';
  world.group.add(glow);
  ctx.addUpdater(() => {
    const night = Math.min(1, (world.lampMats?.head.emissiveIntensity ?? 0) / 2.4);
    mats.bulb.emissiveIntensity = night * 1.6;
    glowMat.opacity = night * 0.9;
  });
}
