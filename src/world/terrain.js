// Ground, roads, sidewalks, paths, ice and snow mounds.
import * as THREE from 'three';
import { TAU } from '../util.js';
import { WORLD } from '../config.js';

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
  const free = (x, z, r = 1.6) => !world.collides(x, z, r);

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
  const roadMat = new THREE.MeshStandardMaterial({ map: winter ? T.asphaltWinter : T.asphalt, roughness: 0.82 });
  roadMat.userData = { winterTex: T.asphaltWinter, autumnTex: T.asphalt };
  const roadPlainMat = new THREE.MeshStandardMaterial({ map: winter ? T.asphaltPlainWinter : T.asphaltPlain, roughness: 0.85 });
  roadPlainMat.userData = { winterTex: T.asphaltPlainWinter, autumnTex: T.asphaltPlain };
  world.roadMats.push(roadMat, roadPlainMat);

  const mainRoad = tiledPlane(R * 2, 232, 12, roadMat, 0.02);
  world.group.add(mainRoad);
  ctx.addSurfaceRect(-R, R, -116, 116, 'asphalt');

  const crossRoad = tiledPlane(12, 232, 12, roadMat, 0.021);
  crossRoad.rotation.y = Math.PI / 2;
  crossRoad.position.set(0, 0.021, CROSS);
  world.group.add(crossRoad);
  ctx.addSurfaceRect(-116, 116, CROSS - 6, CROSS + 6, 'asphalt');

  // parking lot in the east courtyard
  const lot = tiledPlane(16, 26, 12, roadPlainMat, 0.018);
  lot.position.set(48, 0.018, -8);
  world.group.add(lot);
  ctx.addSurfaceRect(40, 56, -21, 5, 'asphalt');

  /* ------------------------------------------------ sidewalks */
  const walkMat = new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.92 });
  const walks = [
    { x0: R, x1: R + WORLD.sidewalkWidth, z0: -116, z1: 116 },
    { x0: -R - WORLD.sidewalkWidth, x1: -R, z0: -116, z1: 116 },
    { x0: -116, x1: 116, z0: CROSS + 6, z1: CROSS + 6 + WORLD.sidewalkWidth },
    { x0: -116, x1: 116, z0: CROSS - 6 - WORLD.sidewalkWidth, z1: CROSS - 6 },
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

    ctx.addHeightRect(w.x0, w.x1, w.z0, w.z1, 0.14);
    ctx.addSurfaceRect(w.x0, w.x1, w.z0, w.z1, 'stone');
  }

  // curbs
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 232), M.concreteWhite);
    curb.position.set(side * (R + 0.17), 0.1, 0);
    curb.receiveShadow = true;
    world.group.add(curb);
  }

  // manholes
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

  /* ------------------------------------------------ trampled paths */
  const pathMat = new THREE.MeshStandardMaterial({ map: T.path, roughness: 0.88 });
  const paths = [
    { x0: -58, x1: -22, z0: -46.6, z1: -44.2 },
    { x0: -30, x1: R + 3.2, z0: -19.6, z1: -17.2 },
    { x0: -42.2, x1: -39.8, z0: -44, z1: -4 },
    { x0: -45, x1: -29, z0: -22.4, z1: -20 },
    { x0: R + 3.2, x1: 21, z0: -3.4, z1: -1 },
    { x0: R + 3.2, x1: 27, z0: 9, z1: 11.4 },
    { x0: 24, x1: 44, z0: 24, z1: 26.4 },
    { x0: -14.4, x1: R + 3.2, z0: 1, z1: 3.4 },
    { x0: -26, x1: -9.4, z0: -8, z1: 12, plaza: true },
    { x0: -14, x1: R + 3.2, z0: -78.5, z1: -76.1 },
    { x0: 26, x1: 40, z0: -26.4, z1: -24 },
  ];
  for (const p of paths) {
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
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x22292f, roughness: 0.12, metalness: 0.3 });
  let placed = 0;
  for (let i = 0; i < 60 && placed < 16; i++) {
    const onRoad = rng.chance(0.5);
    const x = onRoad ? rng.float(-R + 0.6, R - 0.6) : rng.float(-84, 80);
    const z = rng.float(-100, 100);
    if (!onRoad && !free(x, z, 3)) continue;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(rng.float(0.5, 1.5), 16), puddleMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rng.float(1, 1.6), rng.float(0.6, 1.1), 1);
    mesh.position.set(x, onRoad ? 0.028 : 0.05, z);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    world.group.add(ctx.seasonable('winter', mesh));
    if (rng.chance(0.4)) {
      const clone = mesh.clone();
      clone.position.y = 0.022;
      world.group.add(ctx.seasonable('autumn', clone));
    }
    placed++;
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
  edge(1.5, 232, R + 0.9, 0, 0);
  edge(1.5, 232, -R - 0.9, 0, Math.PI);
  edge(1.5, 232, 0, CROSS + 6.9, Math.PI / 2);
  edge(1.5, 232, 0, CROSS - 6.9, -Math.PI / 2);

  /* ------------------------------------------------ snow mounds */
  const moundGeo = new THREE.SphereGeometry(1, 9, 6);
  const total = 320;
  const moundMat = M.snow.clone();
  moundMat.flatShading = true;
  moundMat.roughness = 0.78;
  const mounds = new THREE.InstancedMesh(moundGeo, moundMat, total);
  mounds.castShadow = true;
  mounds.receiveShadow = true;
  mounds.userData.total = total;
  const dummy = new THREE.Object3D();
  const spots = [];
  const addSpot = (x, z) => {
    if (free(x, z, 1.5)) spots.push([x, z]);
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
    if (world.heightAt(x, z) > 0.1 || !free(x, z, 2)) continue;
    clusters.push([x, z]);
  }
  let li = 0;
  for (let i = 0; i < leafTotal * 2 && li < leafTotal; i++) {
    const [cx, cz] = clusters[i % clusters.length];
    const x = cx + rng.float(-4.5, 4.5);
    const z = cz + rng.float(-4.5, 4.5);
    if (world.heightAt(x, z) > 0.1) continue;
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
}
