// Buildings: panel blocks, heating plant, garages, fences, skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas, starPath } from '../util.js';
import { makeSignTexture, canvasTexture } from '../textures.js';
import { OUTDOOR_LIGHT_LAYER } from './interiors.js';

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
  const fenceMat = M.concreteWhite;
  const panelFence = (x0, z0, x1, z1) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const panels = Math.max(1, Math.round(len / 2.6));
    const angle = Math.atan2(dz, dx);
    for (let i = 0; i < panels; i++) {
      const t = (i + 0.5) / panels;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
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
    ctx.addColliderRect(Math.min(x0, x1) - 0.3, Math.max(x0, x1) + 0.3, Math.min(z0, z1) - 0.3, Math.max(z0, z1) + 0.3);
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
  panelFence(104, -70, 104, -14);
  panelFence(104, 14, 104, 70);
  // the old north edge (z = 104) opened up: the avenue now runs on to the
  // second cluster. New limits sit at the expanded edges; unlike the
  // historic runs these bake panels, posts and snow into one mesh per
  // material, so the extra ~240 m of fence costs a handful of draw calls.
  const panelFenceMerged = (x0, z0, x1, z1) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const panels = Math.max(1, Math.round(len / 2.6));
    const angle = Math.atan2(dz, dx);
    const panelParts = [];
    const postParts = [];
    const snowParts = [];
    for (let i = 0; i < panels; i++) {
      const t = (i + 0.5) / panels;
      const px = x0 + dx * t;
      const pz = z0 + dz * t;
      const panel = new THREE.BoxGeometry(2.5, 2.3, 0.32);
      panel.rotateY(-angle);
      panel.translate(px, 1.15, pz);
      panelParts.push(panel);
      const t2 = (i + 1) / panels;
      const post = new THREE.BoxGeometry(0.34, 2.7, 0.34);
      post.rotateY(-angle);
      post.translate(x0 + dx * t2, 1.35, z0 + dz * t2);
      postParts.push(post);
      if (i % 2 === 0) {
        const snow = new THREE.BoxGeometry(2.55, 0.1, 0.36);
        snow.rotateY(-angle);
        snow.translate(px, 2.35, pz);
        snowParts.push(snow);
      }
    }
    const bake = (parts, material, season = null) => {
      const merged = new THREE.Mesh(mergeGeometries(parts, false), material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      world.group.add(season ? ctx.seasonable(season, merged) : merged);
    };
    bake(panelParts, fenceMat);
    bake(postParts, M.concreteDark);
    bake(snowParts, M.snow, 'winter');
    ctx.addColliderRect(Math.min(x0, x1) - 0.3, Math.max(x0, x1) + 0.3, Math.min(z0, z1) - 0.3, Math.max(z0, z1) + 0.3, true);
  };
  panelFenceMerged(-80, 176, -14, 176);
  panelFenceMerged(14, 176, 80, 176);
  // the western cluster's limits: its own edge, and the south and north
  // lines carried on westward
  panelFenceMerged(-236, -196, -236, 176);
  // the southern quarter's limits: its own edge and the east line carried down
  panelFenceMerged(-236, -196, 104, -196);
  panelFenceMerged(104, -196, 104, -70);
  panelFenceMerged(-236, 176, -80, 176);
  panelFenceMerged(104, 70, 104, 176);
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
  const distantMat = new THREE.MeshStandardMaterial({ color: 0x3b434e, roughness: 1 });
  // distant windows texture
  const winCanvas = makeCanvas(256, 256);
  const wctx = winCanvas.getContext('2d');
  wctx.fillStyle = '#000';
  wctx.fillRect(0, 0, 256, 256);
  const wrng = new Rng(4242);
  for (let y = 6; y < 256; y += 12) {
    for (let xx = 4; xx < 256; xx += 10) {
      if (wrng.chance(0.35)) {
        wctx.fillStyle = wrng.chance(0.7) ? 'rgba(255,183,94,0.95)' : 'rgba(190,215,255,0.8)';
        wctx.fillRect(xx, y, 5, 7);
      }
    }
  }
  const winTex = canvasTexture(winCanvas);
  winTex.repeat.set(3, 6);
  const distantLitMat = new THREE.MeshStandardMaterial({
    color: 0x3b434e,
    emissiveMap: winTex,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.5,
    roughness: 1,
  });
  world.windowMats.push(distantLitMat);

  const ring = new Rng(777);
  const skylineBoxes = [];
  for (let i = 0; i < 46; i++) {
    const a = ring.float(0, TAU);
    const r = ring.float(150, 300);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = ring.float(14, 44);
    const d = ring.float(12, 26);
    const h = ring.float(12, 42);
    const lit = ring.chance(0.65);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lit ? distantLitMat : distantMat);
    mesh.position.set(x, h / 2 - 1, z);
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
      const r = 215 + (i % 7) * 9;
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
  // industrial sites
  const factory = (x, z, h = 44) => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 22), distantMat);
    body.position.set(x, 7, z);
    world.group.add(body);
    for (const dx of [-9, 9]) {
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, h, 12), distantMat);
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
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 18, 8), distantMat);
    legs.position.y = 9;
    tower.add(legs);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 7, 12), distantMat);
    tank.position.y = 20;
    tower.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(5, 2.6, 12), distantMat);
    cap.position.y = 24.8;
    tower.add(cap);
    // beyond the western cluster now (it used to stand where W7 is)
    tower.position.set(-272, 0, 150);
    world.group.add(tower);
  }
}
