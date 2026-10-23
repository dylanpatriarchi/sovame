// The western cluster on ул. Строителей: the cross street carried on past
// the old district limit, a north–south street, sidewalks, worn paths,
// lamps, benches, a playground and a parking pad. Everything here draws
// from its own seeds, so no historic placement moves; small props bake
// per material into the west far-detail group (hidden from the old
// district, where they would be fog-shrouded specks anyway).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../util.js';
import { WORLD } from '../config.js';
import { tiledPlane } from './terrain.js';

const R = WORLD.roadHalfWidth;
const SW = WORLD.sidewalkWidth;
const CROSS = WORLD.crossroadZ;
const SX = WORLD.westStreetX;
const X0 = -WORLD.boundsWest;
/** Where the historic cross street mesh ends. */
const OLD_END = -116;
const Z0 = -108;
const Z1 = 180;

/** Parking pad in the courtyard between W2 and W4. */
export const PARKING_WEST = { x0: -230, x1: -214, z0: -12, z1: 0 };

/** Trampled paths from the blocks to the sidewalks (like WALK_PATHS). */
export const WEST_WALK_PATHS = [
  // W1 / W3 courtyard: a cross of paths and the playground plaza
  { x0: -158, x1: -114, z0: -6, z1: -3.6 },
  { x0: -137.2, x1: -134.8, z0: -24, z1: 12 },
  { x0: -143, x1: -129, z0: -11, z1: 3, plaza: true },
  // W5 apron to the cross street sidewalk
  { x0: -150.2, x1: -147.8, z0: 53.2, z1: 72 },
  { x0: -124.2, x1: -121.8, z0: 53.2, z1: 72 },
  // west row: from the street sidewalk into the courtyards
  { x0: -184, x1: -179.2, z0: -10, z1: -7.6 },
  { x0: -184, x1: -179.2, z0: 110, z1: 112.4 },
  { x0: -226, x1: -184, z0: 110, z1: 112.4 },
  // W7 / W5 courtyard diagonal-ish walk
  { x0: -137.2, x1: -134.8, z0: 84, z1: 124 },
];

/** Lamp posts: [x, z, facing] — the arm reaches over the carriageway. */
export const WEST_LAMPS = [
  [SX + R + 2.2, -60, Math.PI],
  [SX - R - 2.2, -20, 0],
  [SX + R + 2.2, 20, Math.PI],
  [SX - R - 2.2, 70, 0],
  [SX + R + 2.2, 110, Math.PI],
  [SX - R - 2.2, 150, 0],
  [-140, CROSS + R + 2.2, Math.PI / 2],
  [-205, CROSS - R - 2.2, -Math.PI / 2],
  [-136, -8, 0.4], // courtyard, by the playground
];

/** Parked cars of the cluster (merged into vehicles.js' list). */
export const WEST_CARS = [
  { x: -226, z: -6, heading: Math.PI / 2, color: 0x5d6b52, west: true },
  { x: -218.5, z: -6, heading: Math.PI / 2 + 0.05, color: 0x9a9c94, west: true },
  { x: SX + R - 1.25, z: 96, heading: Math.PI, color: 0x3f5068, west: true },
  { x: SX - R + 1.25, z: -12, heading: 0, color: 0x7a3a2a, west: true },
  { x: -150, z: CROSS - R + 1.25, heading: -Math.PI / 2, color: 0x4b4f47, west: true },
];

/* ---------------------------------------------------------- terrain */

export function buildWestTerrain(ctx) {
  const { world, materials: M, textures: T } = ctx;
  const rng = new Rng(707070);
  const roadMat = world.roadMats[0];
  const roadPlainMat = world.roadMats[1];

  // the cross street carried on from x = -116 to the west fence
  {
    const len = OLD_END - (X0 - 4);
    const road = tiledPlane(12, len, 12, roadMat, 0.021);
    road.rotation.y = Math.PI / 2;
    road.position.set((OLD_END + X0 - 4) / 2, 0.021, CROSS);
    world.group.add(road);
    ctx.addSurfaceRect(X0 - 4, OLD_END, CROSS - 6, CROSS + 6, 'asphalt');
  }
  // ул. Строителей, south fence to north fence (the junction square
  // belongs to the cross street, so the centre line stops at its edges)
  for (const [z0, z1] of [
    [Z0, CROSS - R],
    [CROSS + R, Z1],
  ]) {
    const road = tiledPlane(R * 2, z1 - z0, 12, roadMat, 0.022);
    road.position.set(SX, 0.022, (z0 + z1) / 2);
    world.group.add(road);
  }
  ctx.addSurfaceRect(SX - R, SX + R, Z0, Z1, 'asphalt');
  // parking pad
  {
    const p = PARKING_WEST;
    const lot = tiledPlane(p.x1 - p.x0, p.z1 - p.z0, 12, roadPlainMat, 0.018);
    lot.position.set((p.x0 + p.x1) / 2, 0.018, (p.z0 + p.z1) / 2);
    world.group.add(lot);
    ctx.addSurfaceRect(p.x0, p.x1, p.z0, p.z1, 'asphalt');
  }

  // sidewalks: split around the junction so no slab crosses a carriageway
  const walkMat = new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.92 });
  const xs = [SX - R - SW, SX + R + SW];
  const walks = [
    // along the cross street (north and south side), both sides of the junction
    { x0: X0, x1: xs[0], z0: CROSS + R, z1: CROSS + R + SW },
    { x0: xs[1], x1: OLD_END, z0: CROSS + R, z1: CROSS + R + SW },
    { x0: X0, x1: xs[0], z0: CROSS - R - SW, z1: CROSS - R },
    { x0: xs[1], x1: OLD_END, z0: CROSS - R - SW, z1: CROSS - R },
    // along ул. Строителей (west and east side), both sides of the junction
    { x0: SX - R - SW, x1: SX - R, z0: Z0, z1: CROSS - R - SW },
    { x0: SX - R - SW, x1: SX - R, z0: CROSS + R + SW, z1: Z1 },
    { x0: SX + R, x1: SX + R + SW, z0: Z0, z1: CROSS - R - SW },
    { x0: SX + R, x1: SX + R + SW, z0: CROSS + R + SW, z1: Z1 },
  ];
  const slabs = [];
  for (const w of walks) {
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    const sx = w.x1 - w.x0;
    const sz = w.z1 - w.z0;
    const slab = new THREE.BoxGeometry(sx, 0.14, sz);
    slab.translate(cx, 0.07, cz);
    slabs.push(slab);
    const top = tiledPlane(sx, sz, 6, walkMat, 0.141);
    top.position.set(cx, 0.141, cz);
    world.group.add(top);
    ctx.addHeightRect(w.x0, w.x1, w.z0, w.z1, 0.14, true);
    ctx.addSurfaceRect(w.x0, w.x1, w.z0, w.z1, 'stone');
  }
  const slabMesh = new THREE.Mesh(mergeGeometries(slabs, false), M.concreteDark);
  slabMesh.receiveShadow = true;
  world.group.add(slabMesh);

  // curbs along ул. Строителей
  const curbs = [];
  for (const side of [-1, 1]) {
    for (const [z0, z1] of [
      [Z0, CROSS - R - SW],
      [CROSS + R + SW, Z1],
    ]) {
      const g = new THREE.BoxGeometry(0.34, 0.2, z1 - z0);
      g.translate(SX + side * (R + 0.17), 0.1, (z0 + z1) / 2);
      curbs.push(g);
    }
  }
  const curbMesh = new THREE.Mesh(mergeGeometries(curbs, false), M.concreteWhite);
  curbMesh.receiveShadow = true;
  world.group.add(curbMesh);

  // trampled paths
  const pathMat = new THREE.MeshStandardMaterial({ map: T.path, roughness: 0.88 });
  for (const p of WEST_WALK_PATHS) {
    const y = p.plaza ? 0.045 : 0.03;
    const mesh = tiledPlane(p.x1 - p.x0, p.z1 - p.z0, 4, pathMat, y);
    mesh.position.set((p.x0 + p.x1) / 2, y, (p.z0 + p.z1) / 2);
    world.group.add(mesh);
    if (p.plaza) ctx.addHeightRect(p.x0, p.x1, p.z0, p.z1, 0.05, true);
    ctx.addSurfaceRect(p.x0, p.x1, p.z0, p.z1, 'snow');
  }

  // snow banks along the curbs and the paths (never on a carriageway)
  const moundGeo = world.snowMounds.geometry;
  const moundMat = world.snowMounds.material;
  const spots = [];
  const addSpot = (x, z) => {
    if (world.surfaceAt(x, z) === 'asphalt') return;
    if (!world.collides(x, z, 1.5)) spots.push([x, z]);
  };
  for (let i = 0; i < 90; i++) {
    const side = i % 2 ? 1 : -1;
    addSpot(SX + side * (R + rng.float(0.7, 2.8)), rng.float(Z0 + 4, Z1 - 4));
  }
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    addSpot(rng.float(X0 + 4, OLD_END), CROSS + side * (R + rng.float(0.7, 2.8)));
  }
  for (let i = 0; i < 70; i++) {
    const p = rng.pick(WEST_WALK_PATHS);
    if (p.plaza) continue;
    const alongX = p.x1 - p.x0 > p.z1 - p.z0;
    if (alongX) addSpot(rng.float(p.x0, p.x1), rng.chance(0.5) ? p.z0 - rng.float(0.5, 1.6) : p.z1 + rng.float(0.5, 1.6));
    else addSpot(rng.chance(0.5) ? p.x0 - rng.float(0.5, 1.6) : p.x1 + rng.float(0.5, 1.6), rng.float(p.z0, p.z1));
  }
  for (let i = 0; i < 60; i++) addSpot(rng.float(X0 + 6, -106), rng.float(Z0 + 6, Z1 - 8));
  const total = Math.min(170, spots.length);
  const mounds = new THREE.InstancedMesh(moundGeo, moundMat, total);
  mounds.castShadow = true;
  mounds.receiveShadow = true;
  mounds.userData.total = total;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < total; i++) {
    const [x, z] = spots[i];
    dummy.position.set(x + rng.float(-0.4, 0.4), rng.float(-0.3, -0.12), z + rng.float(-0.4, 0.4));
    dummy.rotation.set(0, rng.float(0, TAU), 0);
    const s = rng.float(0.7, 1.25);
    dummy.scale.set(s * rng.float(1.2, 2.0), rng.float(0.28, 0.52), s * rng.float(0.9, 1.5));
    dummy.updateMatrix();
    mounds.setMatrixAt(i, dummy.matrix);
  }
  mounds.instanceMatrix.needsUpdate = true;
  world.westDetails.add(ctx.seasonable('winter', mounds));
  world.snowMoundsWest = mounds;
}

/* ---------------------------------------------------------- props */

export function buildWestProps(ctx, { makeSwing }) {
  const { world, materials: M } = ctx;
  const wd = world.westDetails;
  const bake = (parts, mat, season = null, cast = true) => {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    wd.add(season ? ctx.seasonable(season, mesh) : mesh);
    return mesh;
  };
  const bx = (w, h, d, x, y, z, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };

  // benches: two by the playground, two along the W5 apron, one on the
  // west row's path, each with a bin
  const metal = [];
  const wood = [];
  const snow = [];
  const bins = [];
  const bench = (x, z, ry) => {
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const put = (list, g) => {
      g.applyMatrix4(rot);
      g.translate(x, 0, z);
      list.push(g);
    };
    for (const dx of [-0.75, 0.75]) put(metal, bx(0.09, 0.44, 0.5, dx, 0.22, 0));
    for (let i = 0; i < 3; i++) put(wood, bx(1.8, 0.06, 0.14, 0, 0.46, -0.2 + i * 0.2));
    for (let i = 0; i < 2; i++) put(wood, bx(1.8, 0.14, 0.06, 0, 0.72 + i * 0.2, -0.28));
    put(snow, bx(1.84, 0.06, 0.5, 0, 0.52, -0.05));
    ctx.addColliderRect(x - 1.05, x + 1.05, z - 0.45, z + 0.45, true);
    const bin = new THREE.CylinderGeometry(0.28, 0.24, 0.8, 12);
    const bxp = x + Math.cos(ry) * 1.4;
    const bzp = z - Math.sin(ry) * 1.4;
    bin.translate(bxp, 0.4, bzp);
    bins.push(bin);
    ctx.addColliderRect(bxp - 0.35, bxp + 0.35, bzp - 0.35, bzp + 0.35, true);
  };
  bench(-143.5, -13, 0);
  bench(-128.5, -13, 0);
  bench(-140, 61.5, Math.PI);
  bench(-131, 61.5, Math.PI);
  bench(-200, 107.5, 0);
  bake(metal, M.metal);
  bake(wood, M.wood);
  bake(snow, M.snow, 'winter');
  bake(bins, M.metal);

  // the playground in the W1 / W3 courtyard: swing set, sandbox, a climbing
  // frame (лазалка) of painted pipes
  makeSwing(-136, -4, wd);
  {
    const frame = [];
    const paint = new THREE.MeshStandardMaterial({ color: 0xa4452f, roughness: 0.6, metalness: 0.3 });
    const cx = -129;
    const cz = -17;
    const pipe = (ax, ay, az, bxx, by, bz, r = 0.035) => {
      const a = new THREE.Vector3(ax, ay, az);
      const b = new THREE.Vector3(bxx, by, bz);
      const dir = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      g.translate((ax + bxx) / 2 + cx, (ay + by) / 2, (az + bz) / 2 + cz);
      frame.push(g);
    };
    // a 2 × 1 × 1 cube lattice, 1.2 m cells
    const xs = [-1.2, 0, 1.2];
    const zs = [-0.6, 0.6];
    const ys = [0, 1.2, 2.4];
    for (const x of xs) for (const z of zs) pipe(x, 0, z, x, 2.4, z);
    for (const y of ys.slice(1)) {
      for (const z of zs) pipe(-1.2, y, z, 1.2, y, z);
      for (const x of xs) pipe(x, y, -0.6, x, y, 0.6);
    }
    bake(frame, paint);
    ctx.addColliderRect(cx - 1.4, cx + 1.4, cz - 0.8, cz + 0.8, true);
  }
  {
    // sandbox under its winter lid of snow
    const sx = -142;
    const sz = -18;
    const rails = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      rails.push(bx(2.6, 0.3, 0.18, sx + Math.cos(a) * 1.25, 0.18, sz + Math.sin(a) * 1.25, -a - Math.PI / 2));
    }
    bake(rails, M.wood);
    bake([bx(2.42, 0.16, 2.42, sx, 0.26, sz)], M.snow, 'winter');
    ctx.addColliderRect(sx - 1.5, sx + 1.5, sz - 1.5, sz + 1.5, true);
  }

  // dumpster pad by the parking
  {
    const pad = bx(4.6, 0.14, 2.4, -222, 0.09, 4.5);
    bake([pad], M.concreteDark, null, false);
    const containerMat = new THREE.MeshStandardMaterial({ color: 0x4d5a4c, roughness: 0.75, metalness: 0.35 });
    const boxes = [];
    const lids = [];
    const snows = [];
    for (let i = 0; i < 2; i++) {
      const x = -222.75 + i * 1.5;
      boxes.push(bx(1.2, 1.0, 1.0, x, 0.66, 4.5));
      const lid = new THREE.BoxGeometry(1.26, 0.1, 1.06);
      lid.rotateZ(i ? -0.06 : 0.06);
      lid.translate(x, 1.2, 4.5);
      lids.push(lid);
      const s = new THREE.BoxGeometry(1.28, 0.1, 1.08);
      s.rotateZ(i ? -0.06 : 0.06);
      s.translate(x, 1.28, 4.5);
      snows.push(s);
    }
    bake(boxes, containerMat);
    bake(lids, M.metal);
    bake(snows, M.snow, 'winter');
    ctx.addColliderRect(-224, -220, 3.6, 5.4, true);
  }

  // универсам on the corner of the cross street: a long low shop with a
  // band of lit glass and one word on the fascia
  {
    const x = -122;
    const z = 63.5;
    const w = 18;
    const d = 9;
    const h = 4.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.concrete);
    body.position.set(x, h / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    world.group.add(body);
    // shop window: aluminium mullions, a warm fluorescent interior with
    // rows of shelving and a couple of hand-lettered price cards
    const shopTex = ctx.TEXTURES.makeSignTexture(1024, 160, (c, W, H) => {
      const rng = new Rng(4545);
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#f3e6c4');
      grad.addColorStop(1, '#b9a57c');
      c.fillStyle = grad;
      c.fillRect(0, 0, W, H);
      for (let y = 0.38; y < 1; y += 0.22) {
        c.fillStyle = 'rgba(70,58,40,0.55)';
        c.fillRect(0, H * y, W, H * 0.035);
        for (let x = 0; x < W; x += rng.float(10, 26)) {
          c.fillStyle = `rgba(${rng.int(60, 160)},${rng.int(50, 120)},${rng.int(30, 90)},0.55)`;
          c.fillRect(x, H * y - H * rng.float(0.06, 0.14), rng.float(6, 18), H * rng.float(0.06, 0.14));
        }
      }
      c.fillStyle = 'rgba(40,36,30,0.35)';
      for (let i = 0; i < 4; i++) c.fillRect(rng.float(0, W), H * 0.08, rng.float(14, 28), H * 0.28);
      c.fillStyle = '#4b4f52';
      for (let x = 0; x <= W; x += W / 8) c.fillRect(x - 5, 0, 10, H);
      c.fillRect(0, 0, W, 8);
      c.fillRect(0, H - 8, W, 8);
    });
    const glassMat = new THREE.MeshStandardMaterial({ map: shopTex, roughness: 0.2, metalness: 0.1, emissive: 0xffffff, emissiveMap: shopTex, emissiveIntensity: 0.6 });
    world.windowMats.push(glassMat);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, 2.3), glassMat);
    glass.position.set(x, 1.55, z - d / 2 - 0.02);
    glass.rotation.y = Math.PI;
    world.group.add(glass);
    const signTex = ctx.TEXTURES.makeSignTexture(1024, 128, (c, W, H) => {
      c.fillStyle = '#26313b';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#e8dcc3';
      c.font = 'bold 84px "Arial Narrow", Arial, sans-serif';
      c.fillText('УНИВЕРСАМ', W / 2, H * 0.55);
    });
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.9, 0.3),
      [M.metal, M.metal, M.metal, M.metal, new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.25 }), M.metal]
    );
    fascia.position.set(x, h - 0.3, z - d / 2 - 0.12);
    fascia.rotation.y = Math.PI;
    world.group.add(fascia);
    const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), M.snow);
    roofSnow.position.set(x, h + 0.06, z);
    world.group.add(ctx.seasonable('winter', roofSnow));
    ctx.addColliderRect(x - w / 2 - 0.2, x + w / 2 + 0.2, z - d / 2 - 0.2, z + d / 2 + 0.2, true);
  }

  ctx.addZone('Улица Строителей', 'Builders street', SX - R - SW, SX + R + SW, Z0, Z1);
  ctx.addZone('Двор дома № 31', 'Courtyard of building 31', -164, -108, -24, 12);
  ctx.addZone('Универсам', 'Supermarket', -132, -112, 53, 70);
  ctx.addZone('Западный микрорайон', 'Western district', X0, -104, Z0, Z1);
}

/** Tree lists of the cluster: birch clumps in the courtyards, poplars on
 * the street verges, spruces along the west fence. */
export function scatterWestTrees(okPlace) {
  const rng = new Rng(808080);
  const lists = { birch: [], poplar: [], spruce: [] };
  const onPath = (x, z) => WEST_WALK_PATHS.some((p) => x >= p.x0 - 0.8 && x <= p.x1 + 0.8 && z >= p.z0 - 0.8 && z <= p.z1 + 0.8);
  const scatter = (list, count, x0, x1, z0, z1, radius = 1.4) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = rng.float(x0, x1);
      const z = rng.float(z0, z1);
      if (onPath(x, z) || !okPlace(x, z, radius)) continue;
      list.push({ x, z });
      placed++;
    }
  };
  // courtyards (between the rows of blocks)
  scatter(lists.birch, 12, -162, -110, -22, 10);
  scatter(lists.birch, 10, -232, -182, -26, 8);
  scatter(lists.birch, 10, -162, -110, 88, 122);
  scatter(lists.birch, 8, -232, -182, 90, 132);
  scatter(lists.birch, 6, -162, -110, -66, -38);
  scatter(lists.birch, 6, -232, -182, -72, -44);
  // verges just outside the street's sidewalks
  scatter(lists.poplar, 8, SX - R - SW - 3.2, SX - R - SW - 1.2, Z0 + 6, Z1 - 6);
  scatter(lists.poplar, 8, SX + R + SW + 1.2, SX + R + SW + 3.2, Z0 + 6, Z1 - 6);
  // a spruce line along the west fence
  scatter(lists.spruce, 10, X0 + 2.5, X0 + 6, Z0 + 6, Z1 - 6, 2.0);
  return lists;
}
