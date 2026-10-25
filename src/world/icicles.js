// Icicles (сосульки) along the eaves of every panel block in winter: they
// hang in ragged runs under the roof lip, thickest above the entrances and
// at the corners where the meltwater gathers, with bare stretches between.
// One instanced mesh per block (so the blocks out of view are culled), their
// own seeded stream (the shared one is untouched), no colliders: they are
// out of reach.
import * as THREE from 'three';
import { BUILDING_SPECS, EXPANSION_SPECS, FLOOR_H, SOUTH_SPECS, WEST_SPECS } from './buildings.js';
import { allEntrances } from './entrances.js';
import { Rng } from '../util.js';

const LIP_OUT = 0.08; // m out from the wall face, under the roof lip
const LIP_DROP = 0.1; // the lip's underside below the roof line

/** A tapered spike, base at y = 0, tip at y = -1. */
function icicleGeometry() {
  const geo = new THREE.ConeGeometry(1, 1, 6, 2);
  geo.rotateX(Math.PI);
  geo.translate(0, -0.5, 0);
  // a little lumpy: the rings bulge unevenly as the water froze
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + Math.sin(y * 19) * 0.12;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Icicle placements along one eave from (ax, az) to (bx, bz), facing outward. */
function eave(rng, out, ax, az, bx, bz, y, hot, size = 1, maxL = 2) {
  const len = Math.hypot(bx - ax, bz - az);
  let s = rng.float(0, 0.6);
  // runs and gaps: a run of icicles, then a bare stretch
  let run = rng.float(1, 5);
  let growing = rng.chance(0.6);
  while (s < len) {
    const t = s / len;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (growing) {
      // longer near the corners and over the doors
      const heat = hot(x, z, t);
      const long = rng.next() < 0.12 + heat * 0.3;
      const l = Math.min(maxL, (long ? rng.float(0.8, 1.8) : rng.float(0.2, 0.7)) * (0.7 + heat * 0.6) * size);
      const r = Math.min(0.11, 0.03 + l * rng.float(0.035, 0.06));
      out.push({
        x: x + rng.float(-0.03, 0.03),
        y,
        z: z + rng.float(-0.03, 0.03),
        r,
        l,
        tilt: rng.float(-0.05, 0.05),
      });
      s += rng.float(0.06, 0.22);
    } else {
      s += rng.float(0.3, 1.2);
    }
    run -= 0.3;
    if (run <= 0) {
      growing = !growing;
      run = growing ? rng.float(2, 8) : rng.float(0.5, 3);
    }
  }
}

export function buildIcicles(ctx) {
  const rng = new Rng(1966);
  const byBlock = new Map();
  for (const spec of [...BUILDING_SPECS, ...EXPANSION_SPECS, ...WEST_SPECS, ...SOUTH_SPECS]) {
    const list = [];
    byBlock.set(spec.id, list);
    const y = spec.floors * FLOOR_H - LIP_DROP;
    const hx = spec.w / 2 + LIP_OUT;
    const hz = spec.d / 2 + LIP_OUT;
    const cells = Math.max(1, Math.round(spec.w / 3.4));
    const cw = spec.w / cells;
    // meltwater gathers at the corners and above the stairwells (every
    // fourth cell, where the warm stair windows are)
    const hot = (x, z, t) => {
      const corner = Math.max(0, 1 - Math.min(t, 1 - t) * 6);
      const local = ((x - spec.x + spec.w / 2) / cw) % 4;
      const stair = Math.max(0, 1 - Math.abs(local - 3.5) * 1.6);
      return Math.min(1, corner + stair * 0.8);
    };
    eave(rng, list, spec.x - hx, spec.z + hz, spec.x + hx, spec.z + hz, y, hot);
    eave(rng, list, spec.x + hx, spec.z - hz, spec.x - hx, spec.z - hz, y, hot);
    const ends = (x, z, t) => Math.max(0, 1 - Math.min(t, 1 - t) * 6);
    eave(rng, list, spec.x + hx, spec.z + hz, spec.x + hx, spec.z - hz, y, ends);
    eave(rng, list, spec.x - hx, spec.z - hz, spec.x - hx, spec.z + hz, y, ends);
  }
  // the entrance canopies, along the drip edge above the door (short: they
  // hang over people's heads)
  for (const e of allEntrances()) {
    const list = byBlock.get(e.spec.id);
    const z = e.z + e.side * 1.56;
    const warm = () => 0.5;
    eave(rng, list, e.x - 1.5, z, e.x + 1.5, z, 2.65, warm, 0.8, 0.6);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0xe8f2f8,
    roughness: 0.1,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
    emissive: 0x26323e,
  });
  const geo = icicleGeometry();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const meshes = [];
  let count = 0;
  for (const [id, list] of byBlock) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.name = `icicles-${id}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    list.forEach((ic, i) => {
      q.setFromEuler(e.set(ic.tilt, 0, ic.tilt * 0.7));
      m.compose(v.set(ic.x, ic.y, ic.z), q, sc.set(ic.r, ic.l, ic.r));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    ctx.group.add(ctx.seasonable('winter', mesh));
    meshes.push(mesh);
    count += list.length;
  }
  ctx.world.icicles = { meshes, count };
}
