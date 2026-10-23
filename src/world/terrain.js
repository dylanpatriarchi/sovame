// Ground, roads, sidewalks, paths, ice and snow mounds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../util.js';
import { buildWestTerrain } from './west.js';
import { buildSouthTerrain } from './south.js';
import { WORLD } from '../config.js';

/** Parking pad in the east courtyard (asphalt). Shared with vegetation. */
export const PARKING_LOT = { x0: 40, x1: 56, z0: -21, z1: 5 };

/** Parking pad on Zavodskaya street, in the northern cluster (asphalt). */
export const PARKING_NORTH = { x0: 60, x1: 76, z0: 106, z1: 118 };

/**
 * Trampled walkways through the yards. Their surface type stays 'snow', so
 * anything that must never stand on a path (trees) needs the rects — they
 * are exported for the vegetation pass.
 */
export const WALK_PATHS = [
  { x0: -58, x1: -22, z0: -46.6, z1: -44.2 },
  { x0: -30, x1: WORLD.roadHalfWidth + 3.2, z0: -19.6, z1: -17.2 },
  { x0: -42.2, x1: -39.8, z0: -44, z1: -4 },
  { x0: -45, x1: -29, z0: -22.4, z1: -20 },
  { x0: WORLD.roadHalfWidth + 3.2, x1: 21, z0: -3.4, z1: -1 },
  { x0: WORLD.roadHalfWidth + 3.2, x1: 27, z0: 9, z1: 11.4 },
  { x0: 24, x1: 44, z0: 24, z1: 26.4 },
  { x0: -14.4, x1: WORLD.roadHalfWidth + 3.2, z0: 1, z1: 3.4 },
  { x0: -26, x1: -9.4, z0: -8, z1: 12, plaza: true },
  { x0: -14, x1: WORLD.roadHalfWidth + 3.2, z0: -78.5, z1: -76.1 },
  // along B2's courtyard face, serving its entrance doors (b7-court among
  // them): it must run north of the facade, never into the building
  { x0: 26, x1: 40, z0: -24, z1: -21.6 },
];

/**
 * Walkways of the northern cluster. Kept in a separate list on purpose: the
 * historic snow-mound scatter samples WALK_PATHS with the shared RNG and
 * must keep its exact distribution; vegetation checks both lists when
 * keeping trunks off the paths.
 */
export const NEW_WALK_PATHS = [
  { x0: -62, x1: -9.4, z0: 131.8, z1: 134.2 }, // west courtyard, east-west spine
  { x0: -31.2, x1: -28.8, z0: 119, z1: 144.5 }, // west courtyard, north-south spine
  { x0: -44.5, x1: -42.1, z0: 119, z1: 131.8 }, // spur to B8's west entrances
  { x0: -76.8, x1: -74.4, z0: 119, z1: 131.8 }, // spur to B12's entrances
  { x0: 9.4, x1: 11.6, z0: 110, z1: 118.8 }, // shortcut along B9's west wall
  // along B9's north facade: a worn apron between the entrance doors and the
  // arm sidewalk — it must not reach into the building (z < 118)
  { x0: 11.4, x1: 50, z0: 118, z1: 118.8 },
  { x0: 24, x1: 48, z0: 139.6, z1: 142 }, // east courtyard, east-west
  { x0: 33.2, x1: 35.6, z0: 137.4, z1: 145.2 }, // to B11's entrances
  { x0: 72.8, x1: 75.2, z0: 137.4, z1: 145 }, // to B13's entrance
];

/** Plane with scaled UVs: the texture repeats every `tile` meters. */
export function tiledPlane(w, d, tile, material, y = 0) {
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (d / tile));
  }
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** Strip with a gradient along the WIDTH (used for the snowy edges). */
export function stripPlane(w, l, tile, material, y = 0) {
  const geo = new THREE.PlaneGeometry(w, l);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    // v' = u (width: gradient 0..1), u' = v (repetitions along the length)
    uv.setXY(i, v * (l / tile), u);
  }
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTerrain(ctx) {
  const { world, materials: M, textures: T, rng } = ctx;
  const R = WORLD.roadHalfWidth;
  const CROSS = WORLD.crossroadZ;
  const CROSS2 = WORLD.crossroad2Z;
  // the avenue overruns the district fences at both ends, same as it always
  // did to the south: the road mesh and its lanes reach past the new north
  // fence (z = 176) up to here
  const ROAD_Z0 = -116;
  const ROAD_Z1 = 184;
  const ROAD_LEN = ROAD_Z1 - ROAD_Z0;
  const ROAD_MID = (ROAD_Z0 + ROAD_Z1) / 2;
  const free = (x, z, r = 1.6) => !world.collides(x, z, r);
  // the legacy scatter below (puddles, mounds, litter) runs against the
  // pre-expansion world: same bounds, same colliders, so the shared-RNG
  // stream keeps its historic length and every historic placement holds
  const freeHistoric = (x, z, r = 1.6) => !world.collidesHistoric(x, z, r);
  // everything the northern cluster adds beyond the historic layout draws
  // from this dedicated seed, so not a single historic placement shifts
  const rngNorth = new Rng(440440);

  /* ------------------------------------------------ ground */
  const groundMat = new THREE.MeshStandardMaterial({
    map: world.season === 'winter' ? T.groundWinter : T.groundAutumn,
    color: world.season === 'winter' ? 0xffffff : 0xf0ece4,
    roughness: 0.88,
  });
  world.materials.ground = groundMat;
  const ground = tiledPlane(WORLD.groundSize, WORLD.groundSize, 40, groundMat, 0);
  world.group.add(ground);

  /* ------------------------------------------------ roads */
  const winter = world.season === 'winter';
  const roadMat = new THREE.MeshStandardMaterial({
    map: winter ? T.asphaltWinter : T.asphalt,
    roughnessMap: winter ? T.asphaltRoughWinter : T.asphaltRough,
    roughness: 1,
  });
  roadMat.userData = { winterTex: T.asphaltWinter, autumnTex: T.asphalt, winterRough: T.asphaltRoughWinter, autumnRough: T.asphaltRough };
  const roadPlainMat = new THREE.MeshStandardMaterial({
    map: winter ? T.asphaltPlainWinter : T.asphaltPlain,
    roughnessMap: winter ? T.asphaltPlainRoughWinter : T.asphaltPlainRough,
    roughness: 1,
  });
  roadPlainMat.userData = { winterTex: T.asphaltPlainWinter, autumnTex: T.asphaltPlain, winterRough: T.asphaltPlainRoughWinter, autumnRough: T.asphaltPlainRough };
  world.roadMats.push(roadMat, roadPlainMat);

  const mainRoad = tiledPlane(R * 2, ROAD_LEN, 12, roadMat, 0.02);
  mainRoad.position.z = ROAD_MID;
  world.group.add(mainRoad);
  ctx.addSurfaceRect(-R, R, ROAD_Z0, ROAD_Z1, 'asphalt');

  const crossRoad = tiledPlane(12, 232, 12, roadMat, 0.021);
  crossRoad.rotation.y = Math.PI / 2;
  crossRoad.position.set(0, 0.021, CROSS);
  world.group.add(crossRoad);
  ctx.addSurfaceRect(-116, 116, CROSS - 6, CROSS + 6, 'asphalt');

  // Zavodskaya street: the east arm of the northern cluster's T-junction
  const armRoad = tiledPlane(12, 94, 12, roadMat, 0.021);
  armRoad.rotation.y = Math.PI / 2;
  armRoad.position.set(R + 47, 0.021, CROSS2);
  world.group.add(armRoad);
  ctx.addSurfaceRect(R, R + 94, CROSS2 - 6, CROSS2 + 6, 'asphalt');

  // parking lot in the east courtyard
  const lot = tiledPlane(16, 26, 12, roadPlainMat, 0.018);
  lot.position.set(48, 0.018, -8);
  world.group.add(lot);
  ctx.addSurfaceRect(PARKING_LOT.x0, PARKING_LOT.x1, PARKING_LOT.z0, PARKING_LOT.z1, 'asphalt');

  // parking pad on the new arm
  const lotNorth = tiledPlane(PARKING_NORTH.x1 - PARKING_NORTH.x0, PARKING_NORTH.z1 - PARKING_NORTH.z0, 12, roadPlainMat, 0.018);
  lotNorth.position.set((PARKING_NORTH.x0 + PARKING_NORTH.x1) / 2, 0.018, (PARKING_NORTH.z0 + PARKING_NORTH.z1) / 2);
  world.group.add(lotNorth);
  ctx.addSurfaceRect(PARKING_NORTH.x0, PARKING_NORTH.x1, PARKING_NORTH.z0, PARKING_NORTH.z1, 'asphalt');

  /* ------------------------------------------------ sidewalks */
  const walkMat = new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.92 });
  const walks = [
    { x0: R, x1: R + WORLD.sidewalkWidth, z0: ROAD_Z0, z1: ROAD_Z1 },
    { x0: -R - WORLD.sidewalkWidth, x1: -R, z0: ROAD_Z0, z1: ROAD_Z1 },
    { x0: -116, x1: 116, z0: CROSS + 6, z1: CROSS + 6 + WORLD.sidewalkWidth },
    { x0: -116, x1: 116, z0: CROSS - 6 - WORLD.sidewalkWidth, z1: CROSS - 6 },
    // along the east arm, starting clear of the avenue sidewalks
    { x0: R + WORLD.sidewalkWidth, x1: 100, z0: CROSS2 - 6 - WORLD.sidewalkWidth, z1: CROSS2 - 6 },
    { x0: R + WORLD.sidewalkWidth, x1: 100, z0: CROSS2 + 6, z1: CROSS2 + 6 + WORLD.sidewalkWidth },
  ];
  for (const w of walks) {
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    const sx = w.x1 - w.x0;
    const sz = w.z1 - w.z0;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.14, sz), M.concreteDark);
    slab.position.set(cx, 0.07, cz);
    slab.receiveShadow = true;
    world.group.add(slab);

    const top = tiledPlane(sx, sz, 6, walkMat, 0.141);
    top.position.set(cx, 0.141, cz);
    world.group.add(top);

    // the historic height registry stops at the old road end (z = 116):
    // the avenue extension registers as 'north' so legacy passes keep
    // reading the heights they were seeded with
    if (w.z0 >= 116) {
      ctx.addHeightRect(w.x0, w.x1, w.z0, w.z1, 0.14, true);
    } else if (w.z1 > 116) {
      ctx.addHeightRect(w.x0, w.x1, w.z0, 116, 0.14);
      ctx.addHeightRect(w.x0, w.x1, 116, w.z1, 0.14, true);
    } else {
      ctx.addHeightRect(w.x0, w.x1, w.z0, w.z1, 0.14);
    }
    ctx.addSurfaceRect(w.x0, w.x1, w.z0, w.z1, 'stone');
  }

  // curbs
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, ROAD_LEN), M.concreteWhite);
    curb.position.set(side * (R + 0.17), 0.1, ROAD_MID);
    curb.receiveShadow = true;
    world.group.add(curb);
  }

  // manholes (the two northern ones merge into a single far-detail mesh)
  for (const [mx, mz] of [[7.6, 2], [-7.8, -18.5], [7.4, -52]]) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 20),
      new THREE.MeshStandardMaterial({ map: T.manhole, roughness: 0.7, metalness: 0.35 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mx, 0.15, mz);
    mesh.receiveShadow = true;
    world.group.add(mesh);
  }
  {
    const parts = [];
    for (const [mx, mz] of [[-7.4, 152], [52, CROSS2]]) {
      const g = new THREE.CircleGeometry(0.36, 20);
      g.rotateX(-Math.PI / 2);
      g.translate(mx, 0.15, mz);
      parts.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ map: T.manhole, roughness: 0.7, metalness: 0.35 }));
    mesh.receiveShadow = true;
    world.farDetails.add(mesh);
  }

  /* ------------------------------------------------ trampled paths */
  const pathMat = new THREE.MeshStandardMaterial({ map: T.path, roughness: 0.88 });
  // the legacy list keeps its own name: the mound scatter below samples it
  // with the shared RNG and must see the historic entries only
  const paths = WALK_PATHS;
  for (const p of [...WALK_PATHS, ...NEW_WALK_PATHS]) {
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const y = p.plaza ? 0.045 : 0.03;
    const mesh = tiledPlane(p.x1 - p.x0, p.z1 - p.z0, 4, pathMat, y);
    mesh.position.set(cx, y, cz);
    world.group.add(mesh);
    if (p.plaza) ctx.addHeightRect(p.x0, p.x1, p.z0, p.z1, 0.05);
    ctx.addSurfaceRect(p.x0, p.x1, p.z0, p.z1, 'snow');
  }

  /* ------------------------------------------------ frozen pond */
  const pond = { x: 34, z: 16, r: 8.6 };
  world.pond = pond;
  const iceMat = new THREE.MeshStandardMaterial({ map: T.ice, roughness: 0.16, metalness: 0.25 });
  const ice = new THREE.Mesh(new THREE.CircleGeometry(pond.r, 40), iceMat);
  ice.rotation.x = -Math.PI / 2;
  ice.position.set(pond.x, 0.05, pond.z);
  ice.receiveShadow = true;
  world.group.add(ice);
  ctx.addSurfaceRect(pond.x - pond.r, pond.x + pond.r, pond.z - pond.r, pond.z + pond.r, 'ice');
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(pond.r, pond.r + 1.5, 40),
    new THREE.MeshStandardMaterial({ color: 0xeef3fa, roughness: 0.9, transparent: true, opacity: 0.95 })
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(pond.x, 0.06, pond.z);
  rim.receiveShadow = true;
  world.group.add(rim);

  /* ------------------------------------------------ puddles and ice sheets */
  // glossy dark planes near curbs and drains: they catch the sky and the
  // lamp glints. Emissive tint fakes the reflected sky, no real reflections.
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x1b232d,
    roughness: 0.07,
    metalness: 0.2,
    emissive: 0x0c1522,
    emissiveIntensity: 0.5,
  });
  const dropPuddle = (x, z, y, seasonKey, parent = world.group) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(rng.float(0.6, 1.6), 18), puddleMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rng.float(1, 1.7), rng.float(0.55, 1), 1);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    parent.add(ctx.seasonable(seasonKey, mesh));
  };
  // winter: meltwater sheets and dark ice, mostly along the curb line
  let placedW = 0;
  for (let i = 0; i < 70 && placedW < 10; i++) {
    const nearCurb = rng.chance(0.6);
    const x = nearCurb ? rng.sign() * (R - rng.float(0.5, 2.2)) : rng.float(-84, 80);
    const z = rng.float(-100, 100);
    if (!nearCurb && !freeHistoric(x, z, 3)) continue;
    dropPuddle(x, z, nearCurb ? 0.028 : 0.05, 'winter');
    placedW++;
  }
  // autumn: rain puddles after the thaw
  let placedA = 0;
  for (let i = 0; i < 70 && placedA < 8; i++) {
    const nearCurb = rng.chance(0.5);
    const x = nearCurb ? rng.sign() * (R - rng.float(0.5, 2.2)) : rng.float(-84, 80);
    const z = rng.float(-100, 100);
    if (!nearCurb && !freeHistoric(x, z, 3)) continue;
    dropPuddle(x, z, nearCurb ? 0.024 : 0.05, 'autumn');
    placedA++;
  }
  // northern cluster: same meltwater language, own seed, far-detail group
  const dropPuddleN = (x, z, y, seasonKey) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(rngNorth.float(0.6, 1.6), 18), puddleMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rngNorth.float(1, 1.7), rngNorth.float(0.55, 1), 1);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    world.farDetails.add(ctx.seasonable(seasonKey, mesh));
  };
  let placedWN = 0;
  for (let i = 0; i < 60 && placedWN < 7; i++) {
    const nearCurb = rngNorth.chance(0.6);
    const x = nearCurb ? rngNorth.sign() * (R - rngNorth.float(0.5, 2.2)) : rngNorth.float(10, 92);
    const z = nearCurb ? rngNorth.float(104, 178) : rngNorth.float(106, 172);
    if (!nearCurb && !free(x, z, 3)) continue;
    dropPuddleN(x, z, nearCurb ? 0.028 : 0.05, 'winter');
    placedWN++;
  }
  let placedAN = 0;
  for (let i = 0; i < 60 && placedAN < 5; i++) {
    const nearCurb = rngNorth.chance(0.5);
    const x = nearCurb ? rngNorth.sign() * (R - rngNorth.float(0.5, 2.2)) : rngNorth.float(10, 92);
    const z = nearCurb ? rngNorth.float(104, 178) : rngNorth.float(106, 172);
    if (!nearCurb && !free(x, z, 3)) continue;
    dropPuddleN(x, z, nearCurb ? 0.024 : 0.05, 'autumn');
    placedAN++;
  }

  /* ------------------------------------------------ snowy edges */
  const snowEdgeMat = new THREE.MeshStandardMaterial({
    map: T.snowEdge,
    color: 0xf4f8ff,
    transparent: true,
    opacity: 1,
    roughness: 0.85,
    depthWrite: false,
  });
  world.materials.snowEdge = snowEdgeMat;
  const edge = (w, l, x, z, ry) => {
    const mesh = stripPlane(w, l, 3, snowEdgeMat, 0.035);
    mesh.position.set(x, 0.035, z);
    mesh.rotation.y = ry;
    world.group.add(mesh);
  };
  edge(1.5, ROAD_LEN, R + 0.9, ROAD_MID, 0);
  edge(1.5, ROAD_LEN, -R - 0.9, ROAD_MID, Math.PI);
  edge(1.5, 232, 0, CROSS + 6.9, Math.PI / 2);
  edge(1.5, 232, 0, CROSS - 6.9, -Math.PI / 2);
  edge(1.5, 94, R + 47, CROSS2 + 6.9, Math.PI / 2);
  edge(1.5, 94, R + 47, CROSS2 - 6.9, -Math.PI / 2);

  /* ------------------------------------------------ snow mounds */
  // soft, lumpy drifts: a smooth dome with a little low-frequency noise
  // (the old faceted 9×6 sphere read as grey boulders, not snow)
  const moundGeo = new THREE.SphereGeometry(1, 16, 5, 0, TAU, 0, Math.PI / 2);
  {
    const pos = moundGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + 0.08 * Math.sin(v.x * 3.1 + v.z * 1.7) + 0.06 * Math.sin(v.z * 4.3 - v.x * 2.2) + 0.04 * Math.sin((v.x + v.z) * 6.1);
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    moundGeo.computeVertexNormals();
  }
  const total = 320;
  const moundMat = M.snow.clone();
  moundMat.roughness = 0.82;
  const mounds = new THREE.InstancedMesh(moundGeo, moundMat, total);
  mounds.castShadow = true;
  mounds.receiveShadow = true;
  mounds.userData.total = total;
  const dummy = new THREE.Object3D();
  const spots = [];
  const addSpot = (x, z) => {
    if (freeHistoric(x, z, 1.5)) spots.push([x, z]);
  };
  for (let i = 0; i < 240; i++) {
    const side = i % 2 ? 1 : -1;
    addSpot(side * (R + rng.float(0.7, 2.8)), rng.float(-110, 110));
  }
  for (let i = 0; i < 200; i++) {
    const p = rng.pick(paths);
    if (p.plaza) continue;
    const alongX = p.x1 - p.x0 > p.z1 - p.z0;
    if (alongX) addSpot(rng.float(p.x0, p.x1), rng.chance(0.5) ? p.z0 - rng.float(0.5, 1.6) : p.z1 + rng.float(0.5, 1.6));
    else addSpot(rng.chance(0.5) ? p.x0 - rng.float(0.5, 1.6) : p.x1 + rng.float(0.5, 1.6), rng.float(p.z0, p.z1));
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    addSpot(pond.x + Math.cos(a) * (pond.r + rng.float(0.9, 2.8)), pond.z + Math.sin(a) * (pond.r + rng.float(0.9, 2.8)));
  }
  for (let i = 0; i < 150; i++) addSpot(rng.float(-96, 96), rng.float(-96, 96));
  addSpot(-13.5, -44.5);
  spots.sort(() => rng.next() - 0.5);
  const count = Math.min(total, spots.length);
  mounds.count = count;
  for (let i = 0; i < count; i++) {
    const [x, z] = spots[i];
    dummy.position.set(x + rng.float(-0.4, 0.4), rng.float(-0.3, -0.12), z + rng.float(-0.4, 0.4));
    dummy.rotation.set(0, rng.float(0, TAU), 0);
    const s = rng.float(0.7, 1.25);
    dummy.scale.set(s * rng.float(1.2, 2.0), rng.float(0.34, 0.66), s * rng.float(0.9, 1.5));
    // spots sampled across the whole district can land on a carriageway:
    // those instances collapse (the RNG draws above still happen, so every
    // other placement keeps its historic value)
    if (world.surfaceAt(x, z) === 'asphalt') dummy.scale.set(0, 0, 0);
    else dummy.scale.y *= 0.8;
    dummy.updateMatrix();
    mounds.setMatrixAt(i, dummy.matrix);
  }
  mounds.instanceMatrix.needsUpdate = true;
  world.group.add(ctx.seasonable('winter', mounds));
  world.snowMounds = mounds;

  /* ------------------------------------------------ leaf litter */
  const litterMat = new THREE.MeshStandardMaterial({
    map: ctx.TEXTURES.makeLeafTexture(),
    alphaTest: 0.5,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const leafTotal = 1000;
  const litter = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.2), litterMat, leafTotal);
  litter.userData.total = leafTotal;
  litter.receiveShadow = true;
  const color = new THREE.Color();
  const palette = [0xb2652a, 0xc98a34, 0x8f5a22, 0x9a6a2c, 0x7d4a1e, 0xa8552a, 0x6b6b32];
  const clusters = [];
  for (let i = 0; i < 70 && clusters.length < 60; i++) {
    const x = rng.float(-92, 92);
    const z = rng.float(-92, 92);
    if (world.heightAtHistoric(x, z) > 0.1 || !freeHistoric(x, z, 2)) continue;
    clusters.push([x, z]);
  }
  let li = 0;
  for (let i = 0; i < leafTotal * 2 && li < leafTotal; i++) {
    const [cx, cz] = clusters[i % clusters.length];
    const x = cx + rng.float(-4.5, 4.5);
    const z = cz + rng.float(-4.5, 4.5);
    if (world.heightAtHistoric(x, z) > 0.1) continue;
    dummy.position.set(x, 0.055 + rng.float(0, 0.02), z);
    dummy.rotation.set(-Math.PI / 2 + rng.float(-0.22, 0.22), 0, rng.float(0, TAU));
    const s = rng.float(0.75, 1.7);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    litter.setMatrixAt(li, dummy.matrix);
    color.setHex(palette[Math.floor(rng.next() * palette.length)]);
    litter.setColorAt(li, color);
    li++;
  }
  litter.count = li;
  litter.userData.total = li;
  litter.instanceMatrix.needsUpdate = true;
  if (litter.instanceColor) litter.instanceColor.needsUpdate = true;
  world.leafLitter = litter;
  world.group.add(ctx.seasonable('autumn', litter));

  /* -------------------------------- northern cluster: mounds and litter ----
   * Own instanced meshes fed by rngNorth, so the historic scatter above
   * stays bit-identical. Both live in the far-detail group. */
  {
    const totalN = 150;
    const moundsN = new THREE.InstancedMesh(moundGeo, moundMat, totalN);
    moundsN.castShadow = true;
    moundsN.receiveShadow = true;
    moundsN.userData.total = totalN;
    const spotsN = [];
    // mounds pile on soil and sidewalks, never on the asphalt lanes
    const addSpotN = (x, z) => {
      if (world.surfaceAt(x, z) === 'asphalt') return;
      if (free(x, z, 1.5)) spotsN.push([x, z]);
    };
    for (let i = 0; i < 90; i++) {
      const side = i % 2 ? 1 : -1;
      addSpotN(side * (R + rngNorth.float(0.7, 2.8)), rngNorth.float(104, 180));
    }
    for (let i = 0; i < 50; i++) {
      const edgeZ = (rngNorth.chance(0.5) ? CROSS2 - 6 - rngNorth.float(0.7, 2.4) : CROSS2 + 6 + rngNorth.float(0.7, 2.4));
      addSpotN(rngNorth.float(8, 98), edgeZ);
    }
    for (let i = 0; i < 90; i++) {
      const p = rngNorth.pick(NEW_WALK_PATHS);
      const alongX = p.x1 - p.x0 > p.z1 - p.z0;
      if (alongX) addSpotN(rngNorth.float(p.x0, p.x1), rngNorth.chance(0.5) ? p.z0 - rngNorth.float(0.5, 1.6) : p.z1 + rngNorth.float(0.5, 1.6));
      else addSpotN(rngNorth.chance(0.5) ? p.x0 - rngNorth.float(0.5, 1.6) : p.x1 + rngNorth.float(0.5, 1.6), rngNorth.float(p.z0, p.z1));
    }
    for (let i = 0; i < 60; i++) addSpotN(rngNorth.float(-88, 92), rngNorth.float(106, 174));
    spotsN.sort(() => rngNorth.next() - 0.5);
    const countN = Math.min(totalN, spotsN.length);
    moundsN.count = countN;
    for (let i = 0; i < countN; i++) {
      const [x, z] = spotsN[i];
      dummy.position.set(x + rngNorth.float(-0.4, 0.4), rngNorth.float(-0.3, -0.12), z + rngNorth.float(-0.4, 0.4));
      dummy.rotation.set(0, rngNorth.float(0, TAU), 0);
      const s = rngNorth.float(0.7, 1.25);
      dummy.scale.set(s * rngNorth.float(1.2, 2.0), rngNorth.float(0.34, 0.66), s * rngNorth.float(0.9, 1.5));
      dummy.updateMatrix();
      moundsN.setMatrixAt(i, dummy.matrix);
    }
    moundsN.instanceMatrix.needsUpdate = true;
    world.farDetails.add(ctx.seasonable('winter', moundsN));
    world.snowMoundsNorth = moundsN;
  }
  {
    const leafTotalN = 420;
    const litterN = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.2), litterMat, leafTotalN);
    litterN.userData.total = leafTotalN;
    litterN.receiveShadow = true;
    const clustersN = [];
    for (let i = 0; i < 60 && clustersN.length < 26; i++) {
      const x = rngNorth.float(-86, 90);
      const z = rngNorth.float(106, 172);
      if (world.heightAt(x, z) > 0.1 || !free(x, z, 2)) continue;
      clustersN.push([x, z]);
    }
    let liN = 0;
    for (let i = 0; i < leafTotalN * 2 && liN < leafTotalN && clustersN.length; i++) {
      const [cx, cz] = clustersN[i % clustersN.length];
      const x = cx + rngNorth.float(-4.5, 4.5);
      const z = cz + rngNorth.float(-4.5, 4.5);
      if (world.heightAt(x, z) > 0.1) continue;
      dummy.position.set(x, 0.055 + rngNorth.float(0, 0.02), z);
      dummy.rotation.set(-Math.PI / 2 + rngNorth.float(-0.22, 0.22), 0, rngNorth.float(0, TAU));
      const s = rngNorth.float(0.75, 1.7);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      litterN.setMatrixAt(liN, dummy.matrix);
      color.setHex(palette[Math.floor(rngNorth.next() * palette.length)]);
      litterN.setColorAt(liN, color);
      liN++;
    }
    litterN.count = liN;
    litterN.userData.total = liN;
    litterN.instanceMatrix.needsUpdate = true;
    if (litterN.instanceColor) litterN.instanceColor.needsUpdate = true;
    world.leafLitterNorth = litterN;
    world.farDetails.add(ctx.seasonable('autumn', litterN));
  }

  // the western cluster: its own streets, sidewalks, paths and snow banks
  buildWestTerrain(ctx);
  buildSouthTerrain(ctx);
}
