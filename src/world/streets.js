// The ground under the town: the land itself, the asphalt of the streets,
// raised sidewalks cut at every junction, the paved square and the dirty
// snow the plough leaves along the kerbs. All from the plan in town.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Land } from './land.js';
import { hash2 } from './noise.js';
import { STREETS, SIDEWALK, SQUARE, ZONES, DRIVEWAYS, PATHS, BLOCKS, rectToWorld, streetRect } from './town.js';

const KERB = 0.14;

/** [a, b] minus a list of [c, d] cuts → the pieces left. */
function subtract(a, b, cuts) {
  let pieces = [[a, b]];
  for (const [c, d] of cuts) {
    pieces = pieces.flatMap(([p, q]) => {
      if (d <= p || c >= q) return [[p, q]];
      const out = [];
      if (c > p) out.push([p, c]);
      if (d < q) out.push([d, q]);
      return out;
    });
  }
  return pieces.filter(([p, q]) => q - p > 0.5);
}

/** Sidewalk strips of every street, as world rects. Corners belong to the
 * north-south streets, so no two slabs ever share a top face. */
export function sidewalkRects() {
  const rects = [];
  for (const s of STREETS) {
    for (const side of [-1, 1]) {
      const lat0 = s.at + side * s.half;
      const lat1 = s.at + side * (s.half + SIDEWALK);
      const lo = Math.min(lat0, lat1);
      const hi = Math.max(lat0, lat1);
      const cuts = [];
      for (const o of STREETS) {
        if (o.axis === s.axis) continue;
        if (o.at <= s.from - o.half || o.at >= s.to + o.half) continue;
        if (o.to <= lo || o.from >= hi) continue;
        const reach = o.half + (s.axis === 'x' ? SIDEWALK : 0);
        cuts.push([o.at - reach, o.at + reach]);
      }
      // dropped kerb at every lane into a yard
      for (const d of DRIVEWAYS) {
        const [l0, l1, a0, a1] = s.axis === 'z' ? [d.x0, d.x1, d.z0, d.z1] : [d.z0, d.z1, d.x0, d.x1];
        if (l0 < hi && l1 > lo) cuts.push([a0, a1]);
      }
      for (const [a, b] of subtract(s.from, s.to, cuts)) {
        rects.push(s.axis === 'z' ? { x0: lo, x1: hi, z0: a, z1: b } : { x0: a, x1: b, z0: lo, z1: hi });
      }
    }
  }
  return rects;
}

function metricBox(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, (uv.getX(f * 4 + k) * dims[f][0]) / tile, (uv.getY(f * 4 + k) * dims[f][1]) / tile);
  }
  return g;
}

export function buildStreets(ctx) {
  const { world, materials: M, textures: T } = ctx;

  /* ------------------------------------------------ ground */
  const groundMat = new THREE.MeshStandardMaterial({ map: T.groundWinter, roughness: 0.88 });
  world.materials.ground = groundMat;
  // the ground is the land itself: flat under the town, tundra beyond
  world.land = new Land({ group: world.group, material: groundMat, tile: 40 });

  /* ------------------------------------------------ asphalt */
  const roadMat = new THREE.MeshStandardMaterial({
    map: T.asphaltWinter,
    roughnessMap: T.asphaltRoughWinter,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const lanes = STREETS.map((s) => {
    const len = s.to - s.from;
    const g = new THREE.PlaneGeometry(s.half * 2, len);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / 12);
    g.rotateX(-Math.PI / 2);
    const mid = (s.from + s.to) / 2;
    if (s.axis === 'z') g.translate(s.at, 0.02, mid);
    else {
      g.rotateY(Math.PI / 2);
      g.translate(mid, 0.026, s.at);
    }
    const r = streetRect(s);
    ctx.addSurfaceRect(r.x0, r.x1, r.z0, r.z1, 'asphalt');
    const z = streetRect(s, SIDEWALK);
    ctx.addZone(s.name, s.sub, z.x0, z.x1, z.z0, z.z1);
    return g;
  });
  const asphalt = new THREE.Mesh(mergeGeometries(lanes, false), roadMat);
  asphalt.name = 'streets';
  asphalt.receiveShadow = true;
  world.group.add(asphalt);

  /* ------------------------------------------------ yard lanes */
  const laneMat = new THREE.MeshStandardMaterial({
    map: T.asphaltPlainWinter,
    roughnessMap: T.asphaltPlainRoughWinter,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const laneParts = DRIVEWAYS.map((r) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 12, (uv.getY(i) * d) / 12);
    g.rotateX(-Math.PI / 2);
    g.translate((r.x0 + r.x1) / 2, 0.016, (r.z0 + r.z1) / 2);
    ctx.addSurfaceRect(r.x0, r.x1, r.z0, r.z1, 'asphalt');
    return g;
  });
  const lanes2 = new THREE.Mesh(mergeGeometries(laneParts, false), laneMat);
  lanes2.name = 'yard-lanes';
  lanes2.receiveShadow = true;
  world.group.add(lanes2);

  /* ------------------------------------------------ sidewalks, square */
  const slabs = [];
  const walks = sidewalkRects();
  for (const r of walks) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const g = metricBox(w, KERB, d, 3.2);
    g.translate((r.x0 + r.x1) / 2, KERB / 2, (r.z0 + r.z1) / 2);
    slabs.push(g);
    ctx.addHeightRect(r.x0, r.x1, r.z0, r.z1, KERB);
    ctx.addSurfaceRect(r.x0, r.x1, r.z0, r.z1, 'stone');
  }
  {
    const w = SQUARE.x1 - SQUARE.x0;
    const d = SQUARE.z1 - SQUARE.z0;
    const g = metricBox(w, 0.06, d, 3.2);
    g.translate((SQUARE.x0 + SQUARE.x1) / 2, 0.03, (SQUARE.z0 + SQUARE.z1) / 2);
    slabs.push(g);
    ctx.addHeightRect(SQUARE.x0, SQUARE.x1, SQUARE.z0, SQUARE.z1, 0.06);
    ctx.addSurfaceRect(SQUARE.x0, SQUARE.x1, SQUARE.z0, SQUARE.z1, 'stone');
  }
  const paving = new THREE.Mesh(mergeGeometries(slabs, false), new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.92 }));
  paving.name = 'sidewalks';
  paving.receiveShadow = true;
  world.group.add(paving);

  /* ------------------------------------------------ footpaths */
  // snow trodden hard: along both long sides of every block, just past the
  // foot of the porch steps, and across the yards. Laid in short pieces so
  // a path simply stops where something stands in its way.
  const trodden = [];
  const tread = (r) => {
    const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
    const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
    const wide = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
    const n = Math.max(1, Math.round(len / 2));
    const step = len / n;
    for (let i = 0; i < n; i++) {
      const c = (alongX ? r.x0 : r.z0) + (i + 0.5) * step;
      const x = alongX ? c : (r.x0 + r.x1) / 2;
      const z = alongX ? (r.z0 + r.z1) / 2 : c;
      if (world.surfaceAt(x, z) !== 'snow' || world.heightAt(x, z) > 0.01 || world.collides(x, z, 0.7)) continue;
      const g = new THREE.PlaneGeometry(alongX ? step : wide, alongX ? wide : step);
      const uv = g.attributes.uv;
      // the texture runs along the path, whichever way it goes
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k);
        const v = uv.getY(k);
        uv.setXY(k, alongX ? ((i + u) * step) / 3 : ((i + v) * step) / 3, alongX ? v : u);
      }
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.012, z);
      trodden.push(g);
    }
  };
  for (const b of BLOCKS) {
    for (const side of [1, -1]) {
      const a = side * (b.d / 2 + 2.9);
      const c = side * (b.d / 2 + 4.3);
      tread(rectToWorld(b, -b.w / 2 - 3, b.w / 2 + 3, Math.min(a, c), Math.max(a, c)));
    }
  }
  for (const [x0, x1, z0, z1] of PATHS) tread({ x0, x1, z0, z1 });
  if (trodden.length) {
    const pathMat = new THREE.MeshStandardMaterial({ map: T.path, roughness: 0.9, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    // v runs across the path: fade both edges into the loose snow
    pathMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\ndiffuseColor.a *= 0.9 * smoothstep(0.0, 0.32, vMapUv.y) * smoothstep(1.0, 0.68, vMapUv.y);',
      );
    };
    const paths = new THREE.Mesh(mergeGeometries(trodden, false), pathMat);
    paths.name = 'footpaths';
    paths.receiveShadow = true;
    world.group.add(paths);
  }

  for (const [name, sub, x0, x1, z0, z1] of ZONES) ctx.addZone(name, sub, x0, x1, z0, z1);

  /* ------------------------------------------------ ploughed snow */
  // lumps of dirty snow thrown onto the far edge of every sidewalk
  const lumps = [];
  walks.forEach((r, n) => {
    const alongZ = r.z1 - r.z0 > r.x1 - r.x0;
    const len = alongZ ? r.z1 - r.z0 : r.x1 - r.x0;
    // the edge away from the carriageway: the one farther from any street
    const mid = alongZ ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
    const street = STREETS.find((s) => (s.axis === 'z') === alongZ && Math.abs(Math.abs(mid - s.at) - s.half - SIDEWALK / 2) < 0.01);
    const out = Math.sign(mid - street.at);
    for (let t = 3; t < len - 3; t += 5 + hash2(n, Math.round(t), 71) * 6) {
      const along = (alongZ ? r.z0 : r.x0) + t;
      const lat = mid + out * (SIDEWALK / 2 + 0.9 + hash2(n, Math.round(t), 72) * 0.8);
      const x = alongZ ? lat : along;
      const z = alongZ ? along : lat;
      if (world.collides(x, z, 1.6) || world.heightAt(x, z) > 0.01 || world.surfaceAt(x, z) !== 'snow') continue;
      const s = 0.7 + hash2(n, Math.round(t), 73) * 0.9;
      lumps.push({ x, z, sx: alongZ ? s : s * 1.8, sz: alongZ ? s * 1.8 : s, sy: 0.35 + hash2(n, Math.round(t), 74) * 0.45, yaw: hash2(n, Math.round(t), 75) });
    }
  });
  const lumpGeo = new THREE.SphereGeometry(1, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(lumpGeo, M.snowDirty, lumps.length);
  const d = new THREE.Object3D();
  lumps.forEach((l, i) => {
    d.position.set(l.x, -0.04, l.z);
    d.rotation.y = (l.yaw - 0.5) * 0.5;
    d.scale.set(l.sx, l.sy, l.sz);
    d.updateMatrix();
    mounds.setMatrixAt(i, d.matrix);
  });
  mounds.name = 'ploughed-snow';
  mounds.receiveShadow = true;
  mounds.frustumCulled = false;
  world.group.add(mounds);
}
