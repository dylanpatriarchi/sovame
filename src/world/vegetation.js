// Vegetation: bare birches (with leaves in autumn), snow-laden spruces,
// bushes and crows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../util.js';

function birchGeometry(rng) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.085, 0.2, 8.6, 7, 4);
  trunk.translate(0, 4.3, 0);
  parts.push(trunk);
  const branch = (y, a, len, thick, tilt) => {
    const geo = new THREE.CylinderGeometry(thick * 0.35, thick, len, 4, 1);
    geo.translate(0, len / 2, 0);
    geo.rotateZ(tilt);
    geo.rotateY(a);
    geo.translate(0, y, 0);
    return geo;
  };
  for (let i = 0; i < 30; i++) {
    const t = rng.float(0.1, 1);
    const y = 3.2 + t * 5.0;
    parts.push(branch(y, rng.float(0, TAU), rng.float(1.1, 2.6) * (1 - t * 0.45), 0.05, rng.float(0.55, 1.15)));
  }
  for (let i = 0; i < 24; i++) {
    const t = rng.float(0.4, 1);
    const y = 5.2 + t * 3.2;
    parts.push(branch(y, rng.float(0, TAU), rng.float(0.5, 1.4), 0.028, rng.float(0.7, 1.35)));
  }
  return mergeGeometries(parts, false);
}

function spruceGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.0, 8);
  trunk.translate(0, 1, 0);
  parts.push(trunk);
  let y = 1.0;
  for (let i = 0; i < 6; i++) {
    const r = 2.6 - i * 0.36;
    const cone = new THREE.ConeGeometry(r, 2.1, 10);
    cone.translate(0, y + 1.0, 0);
    parts.push(cone);
    y += 1.2;
  }
  return mergeGeometries(parts, false);
}

function spruceSnowGeometry() {
  const parts = [];
  let y = 1.1;
  for (let i = 0; i < 6; i++) {
    const r = 2.5 - i * 0.36;
    const cone = new THREE.ConeGeometry(r, 1.0, 10);
    cone.translate(0, y + 1.3, 0);
    parts.push(cone);
    y += 1.2;
  }
  return mergeGeometries(parts, false);
}

function bushGeometry(detail = 2) {
  const parts = [];
  const rng = new Rng(99);
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.IcosahedronGeometry(rng.float(0.45, 0.85), detail);
    geo.scale(1, 0.7, 1);
    geo.translate(rng.float(-0.5, 0.5), rng.float(0.25, 0.6), rng.float(-0.5, 0.5));
    parts.push(geo);
  }
  return mergeGeometries(parts, false);
}

function makeCrowMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.5, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat);
  body.scale.set(1, 0.85, 1.9);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
  head.position.set(0, 0.12, 0.32);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), mat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.1, 0.48);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.42), mat);
  tail.position.set(0, 0.02, -0.42);
  tail.rotation.x = -0.15;
  g.add(tail);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.22), mat);
    wing.position.x = side * 0.3;
    pivot.add(wing);
    pivot.position.set(side * 0.1, 0.08, 0.02);
    g.add(pivot);
    wings.push({ pivot, side });
  }
  return { group: g, wings };
}

export function buildVegetation(ctx) {
  const { world, materials: M, rng } = ctx;
  const group = world.group;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  /* ---------------------------------------------- birch positions */
  const birches = [];
  const spruces = [];
  const pond = world.pond;
  const okPlace = (x, z, r = 1.4) => {
    if (world.collides(x, z, r)) return false;
    if (world.heightAt(x, z) > 0.05) return false;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 2.6) return false;
    return true;
  };
  const scatter = (list, count, x0, x1, z0, z1, radius = 1.4) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = rng.float(x0, x1);
      const z = rng.float(z0, z1);
      if (!okPlace(x, z, radius)) continue;
      list.push({ x, z });
      placed++;
    }
  };

  scatter(birches, 26, -60, -14, -44, -3);
  scatter(birches, 20, 14, 58, -22, 54);
  scatter(birches, 7, -46, -8, -72, -60);
  scatter(birches, 8, -64, -26, 66, 82);
  scatter(birches, 6, -26, -12, -10, 14, 1.8);
  scatter(birches, 10, 12, 40, -30, -22);
  scatter(spruces, 5, 12, 30, -20, -16, 2.0);
  scatter(spruces, 8, -100, -84, -80, 60, 2.2);
  scatter(spruces, 8, 84, 100, -60, 80, 2.2);
  scatter(spruces, 6, -60, 60, 88, 100, 2.2);
  scatter(spruces, 6, -60, 60, -100, -88, 2.2);
  // woodland belt beyond the district
  for (let i = 0; i < 130; i++) {
    const a = rng.float(0, TAU);
    const r = rng.float(112, 165);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 17 || Math.abs(z) < 17) continue;
    (rng.chance(0.6) ? birches : spruces).push({ x, z });
  }

  const makeInstanced = (geo, mat, list, scaleRange, tiltRange, yOffset = 0) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((item, i) => {
      dummy.position.set(item.x, yOffset, item.z);
      dummy.rotation.set(rng.float(-tiltRange, tiltRange), rng.float(0, TAU), rng.float(-tiltRange, tiltRange));
      const s = rng.float(scaleRange[0], scaleRange[1]);
      dummy.scale.set(s, s * rng.float(0.9, 1.15), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      item.scale = s;
      item.yaw = dummy.rotation.y;
      item.matrix = dummy.matrix.clone();
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };

  /* ---------------------------------------------- birches */
  const birchGeo = birchGeometry(new Rng(1234));
  makeInstanced(birchGeo, M.birch, birches, [0.8, 1.25], 0.05).name = 'birches';
  for (const b of birches) {
    ctx.addBoxCollider(b.x, b.z, 0.5, 0.5, 0.05);
  }

  // autumn foliage: clusters of orange masses on top of the branches
  const foliageMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const foliageGeo = new THREE.IcosahedronGeometry(1, 1);
  const blobsPerTree = 10;
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, birches.length * blobsPerTree);
  const palette = [0xc9791f, 0xd99b2c, 0xa85f1c, 0xb8811f, 0x8e6b1e, 0xcf8a26];
  const m4 = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  let fi = 0;
  for (const b of birches) {
    for (let i = 0; i < blobsPerTree; i++) {
      // sparse crown: small tufts arranged in a ring around the top
      const r = rng.float(0.42, 0.82);
      const a = rng.float(0, TAU);
      const d = rng.float(0.35, 1.9);
      const y = rng.float(4.5, 7.9);
      local.compose(
        new THREE.Vector3(Math.cos(a) * d, y * (b.scale || 1), Math.sin(a) * d),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU))),
        new THREE.Vector3(r, r * 0.8, r)
      );
      m4.multiplyMatrices(b.matrix || new THREE.Matrix4(), local);
      foliage.setMatrixAt(fi, m4);
      col.setHex(palette[Math.floor(rng.next() * palette.length)]);
      foliage.setColorAt(fi, col);
      fi++;
    }
  }
  foliage.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  foliage.castShadow = true;
  group.add(ctx.seasonable('autumn', foliage));

  /* ---------------------------------------------- spruces */
  const spruceMesh = makeInstanced(spruceGeometry(), new THREE.MeshStandardMaterial({ color: 0x22452f, roughness: 0.92 }), spruces, [0.75, 1.15], 0.03);
  for (const s of spruces) {
    ctx.addBoxCollider(s.x, s.z, 1.2, 1.2, 0.1);
  }
  const snowMesh = new THREE.InstancedMesh(spruceSnowGeometry(), M.snow, spruces.length);
  snowMesh.castShadow = true;
  snowMesh.receiveShadow = true;
  snowMesh.instanceMatrix = spruceMesh.instanceMatrix;
  group.add(ctx.seasonable('winter', snowMesh));

  /* ---------------------------------------------- bushes */
  const bushes = [];
  scatter(bushes, 30, -62, -12, -46, 0, 1.0);
  scatter(bushes, 22, 12, 60, -24, 56, 1.0);
  scatter(bushes, 14, -80, 80, -100, -60, 1.0);
  scatter(bushes, 10, -70, 70, 60, 100, 1.0);
  // at the foot of garages and fences
  for (const [bx, bz] of [[-64.6, -30], [-64.6, -8], [-64.6, 12], [12.4, -16], [30.6, -14], [-59, -47], [-59, -49.5]]) {
    bushes.push({ x: bx + rng.float(-0.5, 0.5), z: bz + rng.float(-0.5, 0.5) });
  }
  const bushGeo = bushGeometry(1);
  const bushAutumn = makeInstanced(bushGeo, new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 1, flatShading: true }), bushes.map((b) => ({ ...b })), [0.8, 1.4], 0.1);
  group.add(ctx.seasonable('autumn', bushAutumn));
  const bushWinter = makeInstanced(bushGeo, new THREE.MeshStandardMaterial({ color: 0xdfe7f0, roughness: 0.95, flatShading: true }), bushes.map((b) => ({ ...b })), [0.75, 1.25], 0.1);
  group.add(ctx.seasonable('winter', bushWinter));

  /* ---------------------------------------------- crows */
  const crows = [];
  for (let i = 0; i < 6; i++) {
    const { group: crow, wings } = makeCrowMesh();
    const radius = rng.float(22, 46);
    const cx = rng.float(-30, 30);
    const cz = rng.float(-30, 30);
    const height = rng.float(17, 30);
    const speed = rng.float(0.05, 0.11) * rng.sign();
    const phase = rng.float(0, TAU);
    crow.position.set(cx + radius, height, cz);
    crow.scale.setScalar(rng.float(0.85, 1.2));
    group.add(crow);
    crows.push({ crow, wings, cx, cz, radius, height, speed, phase, flap: rng.float(5.5, 8.5) });
  }
  // crows perched on the wires
  const perched = [
    [-12.6, 7.9, -24],
    [-12.6, 7.9, 0],
    [-12.6, 7.9, 48],
    [-18.5, 8.9, 2],
  ];
  for (const [px, py, pz] of perched) {
    const { group: crow } = makeCrowMesh();
    crow.position.set(px, py, pz);
    crow.rotation.y = rng.float(0, TAU);
    crow.scale.setScalar(0.9);
    group.add(crow);
  }
  world.updaters.push((dt, t) => {
    for (const c of crows) {
      const a = c.phase + t * c.speed;
      c.crow.position.set(c.cx + Math.cos(a) * c.radius, c.height + Math.sin(t * 0.7 + c.phase) * 1.4, c.cz + Math.sin(a) * c.radius);
      c.crow.rotation.y = -a + (c.speed > 0 ? 0 : Math.PI);
      c.crow.rotation.z = Math.sin(t * 0.5 + c.phase) * 0.12;
      for (const w of c.wings) {
        w.pivot.rotation.z = w.side * (0.35 - Math.abs(Math.sin(t * c.flap + c.phase)) * 0.85);
      }
    }
  });
}
