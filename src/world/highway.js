// The steppe highway: the cross street leaves the district through a gap in
// the east fence and carries on as a two-lane trunk road, over two
// kilometres of long sweeping bends across the open snow, to a roundabout
// with a petrol station at the far end. Telegraph poles and a power line keep
// it company, birch groves (колки) and haystacks dot the fields, a village
// and a grain elevator stand off in the haze.
//
// Everything here draws from its own seeds, and the few colliders it needs go
// up after the world is built: the district's seeded scatter never sees it.
// The playable area beyond the district's east edge is the road corridor
// itself (openRoad), so a car or a walker can go all the way out and back.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../util.js';
import { WORLD } from '../config.js';
import { makeSignTexture } from '../textures.js';
import { LANE_X, nearEastSector } from './east.js';
import { SEA, SPUR, nearPort } from './port.js';

/** Where the road runs (x, z): out of the cross street, east into the steppe. */
const CONTROL = [
  [104, WORLD.crossroadZ],
  [150, 46],
  [220, 56],
  [300, 74],
  [390, 92],
  [490, 104],
  [600, 100],
  [700, 86],
  [800, 84],
  [900, 100],
  [1000, 120],
  [1100, 110],
  [1240, 40],
  [1380, -60],
  [1520, -110],
  [1680, -90],
  [1820, -20],
  [1960, 60],
  [2100, 90],
  [2240, 70],
];
/** The sealed stairwell and flat interiors stand out here along z = 0
 * (interiors.js, flats.js): the road keeps north of them and nothing of the
 * steppe is set down among them. */
const clearOfInteriors = (x, z) => !(x > 340 && x < 880 && Math.abs(z) < 50);
const STEP = 1; // centre-line sampling (m)
const LANE_W = 3.75;
const HALF = 4.1; // asphalt half width
const SHOULDER = 6.6; // gravel shoulder out to here
/** Half width of the corridor you may drive or walk on (m from the centre line). */
const OPEN = 7.2;
const RING_R = 22; // roundabout centre-line radius
const START_X = 116; // the cross street's own asphalt reaches this far
const CELL = 16;
const MARGIN = 40; // how far from the road the distance query answers

function buildCentreLine() {
  const curve = new THREE.CatmullRomCurve3(CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const length = curve.getLength();
  const n = Math.round(length / STEP);
  const pts = curve.getSpacedPoints(n);
  const line = { n: pts.length, x: new Float32Array(pts.length), z: new Float32Array(pts.length), tx: new Float32Array(pts.length), tz: new Float32Array(pts.length), s: new Float32Array(pts.length) };
  for (let i = 0; i < pts.length; i++) {
    line.x[i] = pts[i].x;
    line.z[i] = pts[i].z;
    if (i) line.s[i] = line.s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  }
  for (let i = 0; i < line.n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(line.n - 1, i + 1);
    const dx = line.x[b] - line.x[a];
    const dz = line.z[b] - line.z[a];
    const l = Math.hypot(dx, dz);
    line.tx[i] = dx / l;
    line.tz[i] = dz / l;
  }
  line.length = line.s[line.n - 1];
  return line;
}

const LINE = buildCentreLine();
const END = LINE.n - 1;
/** The roundabout the road ends in: its centre-line circle passes through the end. */
const RING = { x: LINE.x[END] + LINE.tx[END] * RING_R, z: LINE.z[END] + LINE.tz[END] * RING_R, r: RING_R };
/** The petrol station's forecourt, off the far side of the roundabout. */
const PAD = { x0: RING.x + RING_R + 2, x1: RING.x + RING_R + 34, z0: RING.z - 15, z1: RING.z + 15 };

// segments into a coarse grid, for the distance query
const GRID = new Map();
for (let i = 0; i < LINE.n - 1; i++) {
  const x0 = Math.floor((Math.min(LINE.x[i], LINE.x[i + 1]) - MARGIN) / CELL);
  const x1 = Math.floor((Math.max(LINE.x[i], LINE.x[i + 1]) + MARGIN) / CELL);
  const z0 = Math.floor((Math.min(LINE.z[i], LINE.z[i + 1]) - MARGIN) / CELL);
  const z1 = Math.floor((Math.max(LINE.z[i], LINE.z[i + 1]) + MARGIN) / CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const key = cx * 4096 + cz;
      let list = GRID.get(key);
      if (!list) GRID.set(key, (list = []));
      list.push(i);
    }
  }
}

/** Distance from the highway's centre line (Infinity beyond MARGIN). */
function lineDistance(x, z) {
  const list = GRID.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!list) return Infinity;
  let best = Infinity;
  for (const i of list) {
    const ax = LINE.x[i];
    const az = LINE.z[i];
    const dx = LINE.x[i + 1] - ax;
    const dz = LINE.z[i + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) best = d;
  }
  return best;
}

/** Distance from the nearest lane centre line, the roundabout's included. */
export function highwayDistance(x, z) {
  return Math.min(lineDistance(x, z), Math.abs(Math.hypot(x - RING.x, z - RING.z) - RING.r));
}

/** The same at any range, coarsely (to clear the skyline off the road). */
export function highwayRange(x, z) {
  let best = Math.abs(Math.hypot(x - RING.x, z - RING.z) - RING.r);
  for (let i = 0; i < LINE.n; i += 4) best = Math.min(best, Math.hypot(x - LINE.x[i], z - LINE.z[i]));
  return best;
}

/** Whether a circle of radius r fits on the road out in the steppe. */
export function openRoad(x, z, r = 0) {
  if (highwayDistance(x, z) + r <= OPEN) return true;
  return x - r >= PAD.x0 && x + r <= PAD.x1 && z - r >= PAD.z0 && z + r <= PAD.z1;
}

/** What is underfoot out there (for footsteps and tyre grip). */
export function highwaySurface(x, z) {
  const d = highwayDistance(x, z);
  if (d <= HALF || (x >= PAD.x0 && x <= PAD.x1 && z >= PAD.z0 && z <= PAD.z1)) return 'asphalt';
  return d <= SHOULDER ? 'stone' : 'snow';
}

/** Point at distance s along the road, lateral offset `side` to the right. */
function at(s, side = 0) {
  const i = Math.max(0, Math.min(END, Math.round(s / STEP)));
  return { x: LINE.x[i] - LINE.tz[i] * side, z: LINE.z[i] + LINE.tx[i] * side, tx: LINE.tx[i], tz: LINE.tz[i], heading: Math.atan2(LINE.tx[i], LINE.tz[i]) };
}

/** The birch groves out in the fields (vegetation.js plants them). */
export function steppeGroves() {
  const rng = new Rng(25425);
  const trees = [];
  const centres = [];
  for (let k = 0; k < 240 && centres.length < 48; k++) {
    const p = at(rng.float(60, LINE.length - 30), rng.sign() * rng.float(32, 170));
    if (p.x < 150 || !clearOfInteriors(p.x, p.z) || nearEastSector(p.x, p.z, 20) || nearPort(p.x, p.z, 24) || highwayDistance(p.x, p.z) < 30 || Math.hypot(p.x - RING.x, p.z - RING.z) < 80) continue;
    if (centres.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 60)) continue;
    centres.push(p);
  }
  for (const c of centres) {
    const count = rng.int(5, 12);
    const spread = rng.float(6, 14);
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, TAU);
      const r = spread * Math.sqrt(rng.float(0, 1));
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      if (highwayDistance(x, z) < 24 || !clearOfInteriors(x, z) || nearEastSector(x, z) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.2)) continue;
      trees.push({ x, z });
    }
  }
  return trees;
}

/* ------------------------------------------------------------------ meshes */

/**
 * A strip along the centre line between samples i0..i1, through the cross
 * profile [[offset to the right, height], ...]; u runs across (m / uTile),
 * v along (m / vTile).
 */
function profileStrip(line, profile, i0, i1, uTile = 12, vTile = 12, closed = false, uShift = 0) {
  const cols = profile.length;
  const rows = i1 - i0 + 1 + (closed ? 1 : 0);
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) {
    const i = closed ? i0 + (r % (i1 - i0 + 1)) : i0 + r;
    const s = closed ? r * STEP : line.s[i];
    for (let c = 0; c < cols; c++) {
      const [off, y] = profile[c];
      const k = r * cols + c;
      pos[k * 3] = line.x[i] - line.tz[i] * off;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = line.z[i] + line.tx[i] * off;
      uv[k * 2] = (off + uShift) / uTile;
      uv[k * 2 + 1] = s / vTile;
    }
  }
  const index = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** The roundabout as a closed line of its own (same layout as LINE). */
function ringLine() {
  const n = Math.round((TAU * RING.r) / STEP);
  const a0 = Math.atan2(LINE.z[END] - RING.z, LINE.x[END] - RING.x);
  const line = { n, x: new Float32Array(n), z: new Float32Array(n), tx: new Float32Array(n), tz: new Float32Array(n), s: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const a = a0 - (i / n) * TAU;
    line.x[i] = RING.x + Math.cos(a) * RING.r;
    line.z[i] = RING.z + Math.sin(a) * RING.r;
    line.tx[i] = Math.sin(a);
    line.tz[i] = -Math.cos(a);
    line.s[i] = i * STEP;
  }
  return line;
}

function signPlate(tex, w, h, back) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), [back, back, back, back, mat, back]);
}

export function buildHighway(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const T = ctx.textures;
  const group = world.highwayDetails;
  const winter = world.season === 'winter';
  const rng = new Rng(81881);
  const add = (mesh, { cast = false, receive = true, season = null } = {}) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(season ? ctx.seasonable(season, mesh) : mesh);
    return mesh;
  };
  const ring = ringLine();
  // the road mesh starts where the cross street's asphalt stops
  let first = 0;
  while (first < END && LINE.x[first] < START_X) first++;

  /* ---- the steppe beyond the district's ground plane */
  // (x 140..2540, z -600..600, but for the sea in the north-east corner: port.js)
  for (const [x0, x1, z0, z1] of [[140, SEA.x0, -600, 600], [SEA.x0, 2540, -600, SEA.z0 - 5]]) {
    const steppe = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), world.materials.ground);
    steppe.geometry.rotateX(-Math.PI / 2);
    steppe.geometry.attributes.uv.array.forEach((v, k, arr) => (arr[k] = v * (k % 2 ? (z1 - z0) / 40 : (x1 - x0) / 40)));
    steppe.position.set((x0 + x1) / 2, -0.03, (z0 + z1) / 2);
    add(steppe);
  }

  /* ---- asphalt, shoulders, markings */
  const roadMat = world.roadMats[1];
  // (the middle of the texture down the middle of the road, as on the avenue)
  add(new THREE.Mesh(profileStrip(LINE, [[-HALF, 0.024], [HALF, 0.024]], first, END, 12, 12, false, 6), roadMat));
  add(new THREE.Mesh(profileStrip(ring, [[-HALF, 0.024], [HALF, 0.024]], 0, ring.n - 1, 12, 12, true, 6), roadMat));
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD.x1 - PAD.x0, PAD.z1 - PAD.z0), roadMat);
  pad.geometry.rotateX(-Math.PI / 2);
  pad.geometry.attributes.uv.array.forEach((v, k, arr) => (arr[k] = v * (k % 2 ? (PAD.z1 - PAD.z0) / 12 : (PAD.x1 - PAD.x0) / 12)));
  pad.position.set((PAD.x0 + PAD.x1) / 2, 0.022, (PAD.z0 + PAD.z1) / 2);
  add(pad);
  const gravelMat = new THREE.MeshStandardMaterial({ map: T.path, color: winter ? 0xe4e6ea : 0xb7aa92, roughness: 0.95 });
  world.highwayGravel = gravelMat;
  for (const side of [-1, 1]) {
    const prof = side < 0 ? [[-SHOULDER, 0.012], [-HALF, 0.02]] : [[HALF, 0.02], [SHOULDER, 0.012]];
    add(new THREE.Mesh(profileStrip(LINE, prof, first, END, 4, 4), gravelMat));
    add(new THREE.Mesh(profileStrip(ring, prof, 0, ring.n - 1, 4, 4, true), gravelMat));
  }
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xd9dcd8, roughness: 0.75, transparent: true, opacity: winter ? 0.7 : 0.9, depthWrite: false });
  paintMat.polygonOffset = true;
  paintMat.polygonOffsetFactor = -2;
  const paint = [];
  const y = 0.03;
  for (const side of [-1, 1]) {
    const o = side * LANE_W;
    paint.push(profileStrip(LINE, [[o - 0.075, y], [o + 0.075, y]], first, END));
    paint.push(profileStrip(ring, [[o - 0.075, y], [o + 0.075, y]], 0, ring.n - 1, 12, 12, true));
  }
  // the centre line: 3 m dashes, 9 m gaps
  for (let i = first; i + 3 < END - 6; i += 12) paint.push(profileStrip(LINE, [[-0.07, y], [0.07, y]], i, i + 3));
  const marks = add(new THREE.Mesh(mergeGeometries(paint, false), paintMat));
  marks.renderOrder = 1;

  /* ---- verges: ploughed snow banks in winter, dry grass in autumn */
  const bank = (side) =>
    side < 0
      ? [[-11.5, -0.02], [-10, 0.32], [-8.6, 0.55], [-7.5, 0.36], [-SHOULDER - 0.2, 0.0]]
      : [[SHOULDER + 0.2, 0.0], [7.5, 0.36], [8.6, 0.55], [10, 0.32], [11.5, -0.02]];
  // the right-hand verge opens where ул. Таёжная turns off into the private sector
  let gap0 = first;
  while (gap0 < END && LINE.x[gap0] < LANE_X - 9) gap0++;
  let gap1 = gap0;
  while (gap1 < END && LINE.x[gap1] < LANE_X + 9) gap1++;
  const verges = (side, prof) =>
    side < 0 ? [profileStrip(LINE, prof, first, END, 4, 4)] : [profileStrip(LINE, prof, first, gap0, 4, 4), profileStrip(LINE, prof, gap1, END, 4, 4)];
  // round the roundabout the outer verge opens where the highway comes in,
  // at the petrol station and at the spur north to the port
  const gaps = [[Math.atan2(LINE.z[END] - RING.z, LINE.x[END] - RING.x), 0.42], [0, 0.6], [Math.atan2(SPUR.z0 + 20 - RING.z, SPUR.x - RING.x), 0.42]];
  const ringVerge = (side, prof) => {
    if (side < 0) return [profileStrip(ring, prof, 0, ring.n - 1, 4, 4, true)];
    const a0 = Math.atan2(LINE.z[END] - RING.z, LINE.x[END] - RING.x);
    const open = (i) => {
      const a = a0 - (i / ring.n) * TAU;
      return !gaps.some(([g, half]) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < half);
    };
    const out = [];
    let i0 = -1;
    for (let i = 0; i <= ring.n; i++) {
      const ok = i < ring.n && open(i);
      if (ok && i0 < 0) i0 = i;
      if (!ok && i0 >= 0) {
        if (i - 1 > i0) out.push(profileStrip(ring, prof, i0, i - 1, 4, 4));
        i0 = -1;
      }
    }
    return out;
  };
  const banks = [];
  for (const side of [-1, 1]) {
    banks.push(...verges(side, bank(side)));
    banks.push(...ringVerge(side, bank(side)));
  }
  add(new THREE.Mesh(mergeGeometries(banks, false), M.snow), { season: 'winter', receive: true });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x8c7b55, roughness: 1 });
  const verge = (side) => (side < 0 ? [[-11, 0.0], [-9, 0.14], [-7.2, 0.0]] : [[7.2, 0.0], [9, 0.14], [11, 0.0]]);
  const grass = [];
  for (const side of [-1, 1]) {
    grass.push(...verges(side, verge(side)));
    grass.push(...ringVerge(side, verge(side)));
  }
  add(new THREE.Mesh(mergeGeometries(grass, false), grassMat), { season: 'autumn' });

  // the roundabout's island: a snowy mound with a stele on it
  const island = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - 7.5, RING_R - 6.2, 0.5, 40), winter ? M.snow : grassMat);
  island.position.set(RING.x, 0.25, RING.z);
  add(island);
  const islandSnow = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - 7.6, RING_R - 7.4, 0.08, 40), M.snow);
  islandSnow.position.set(RING.x, 0.52, RING.z);
  add(islandSnow, { season: 'winter' });

  /* ---- delineator posts, every 50 m on both sides */
  const postGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
  postGeo.translate(0, 0.5, 0);
  const bandGeo = new THREE.BoxGeometry(0.125, 0.18, 0.125);
  bandGeo.translate(0, 0.8, 0);
  const postSpots = [];
  for (let s = 10; s < LINE.length - 4; s += 50) {
    if (LINE.x[Math.round(s / STEP)] < START_X) continue;
    for (const side of [-1, 1]) {
      const p = at(s, side * 7.8);
      if (side < 0 || Math.abs(p.x - LANE_X) > 10) postSpots.push(p);
    }
  }
  const posts = new THREE.InstancedMesh(postGeo, M.concreteWhite, postSpots.length);
  const bands = new THREE.InstancedMesh(bandGeo, new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.7 }), postSpots.length);
  const dummy = new THREE.Object3D();
  postSpots.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.heading, 0);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
    bands.setMatrixAt(i, dummy.matrix);
  });
  add(posts, { cast: true });
  add(bands);

  /* ---- telegraph poles on the left, a power line further out on the right */
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e4134, roughness: 0.95 });
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.14, 8, 7).translate(0, 4, 0),
    new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 7.4, 0),
    new THREE.BoxGeometry(1.2, 0.1, 0.1).translate(0, 6.8, 0),
  ]);
  const poles = [];
  for (let s = 14; s < LINE.length - 10; s += 42) {
    const p = at(s, -12.5);
    if (p.x > START_X) poles.push(p);
  }
  const poleMesh = new THREE.InstancedMesh(poleGeo, woodMat, poles.length);
  poles.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(rng.float(-0.02, 0.02), p.heading, rng.float(-0.03, 0.03));
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
  });
  add(poleMesh, { cast: true });

  const steel = new THREE.MeshStandardMaterial({ color: 0x59605f, roughness: 0.7, metalness: 0.4 });
  const pylonParts = [];
  {
    // a lattice tower: four raked legs, cross bracing, two arms
    const H = 26;
    const leg = (sx, sz) => {
      const g = new THREE.BoxGeometry(0.22, H, 0.22);
      g.translate(0, H / 2, 0);
      // raked in towards the top
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-sz * 0.08, 0, sx * 0.08));
      g.applyMatrix4(m);
      g.translate(sx * 2.2, 0, sz * 2.2);
      return g;
    };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pylonParts.push(leg(sx, sz));
    for (let k = 0; k < 6; k++) {
      const h = 2 + k * 3.6;
      const w = 4.4 - (h / H) * 4.2 + 0.2;
      for (const [rx, rz, ww] of [[0, w / 2, w], [0, -w / 2, w]]) pylonParts.push(new THREE.BoxGeometry(ww, 0.12, 0.12).translate(rx, h, rz));
      for (const rx of [w / 2, -w / 2]) pylonParts.push(new THREE.BoxGeometry(0.12, 0.12, w).translate(rx, h, 0));
      // the X bracing on two faces
      const d = new THREE.BoxGeometry(0.08, 4.4, 0.08);
      for (const sgn of [-1, 1]) {
        pylonParts.push(d.clone().rotateZ(sgn * 0.75).translate(0, h + 1.8, w / 2));
        pylonParts.push(d.clone().rotateX(sgn * 0.75).translate(w / 2, h + 1.8, 0));
      }
    }
    pylonParts.push(new THREE.BoxGeometry(11, 0.4, 0.5).translate(0, 20, 0));
    pylonParts.push(new THREE.BoxGeometry(7, 0.4, 0.5).translate(0, 24.5, 0));
    pylonParts.push(new THREE.CylinderGeometry(0.02, 0.5, 2.4, 4).translate(0, H + 0.9, 0));
  }
  const pylonGeo = mergeGeometries(pylonParts);
  const pylons = [];
  // (from past the private sector on)
  for (let s = 80; s < LINE.length - 40; s += 230) if (at(s, 58).x > 250) pylons.push(at(s, 58));
  const pylonMesh = new THREE.InstancedMesh(pylonGeo, steel, pylons.length);
  pylons.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.heading, 0);
    dummy.updateMatrix();
    pylonMesh.setMatrixAt(i, dummy.matrix);
  });
  add(pylonMesh, { cast: true });

  // sagging wires between consecutive supports
  const wire = [];
  const span = (a, b, ox, h, sag) => {
    // ox along the cross-arm (across the road)
    const ax = a.x + a.tz * ox;
    const az = a.z - a.tx * ox;
    const bx = b.x + b.tz * ox;
    const bz = b.z - b.tx * ox;
    const N = 10;
    for (let k = 0; k < N; k++) {
      for (const t of [k / N, (k + 1) / N]) {
        wire.push(ax + (bx - ax) * t, h - sag * 4 * t * (1 - t), az + (bz - az) * t);
      }
    }
  };
  for (let i = 0; i + 1 < poles.length; i++) for (const ox of [-0.8, 0.8, -0.5, 0.5]) span(poles[i], poles[i + 1], ox, Math.abs(ox) > 0.6 ? 7.5 : 6.9, 0.55);
  for (let i = 0; i + 1 < pylons.length; i++) for (const [ox, h] of [[-5.3, 19.6], [5.3, 19.6], [-3.3, 24.1], [3.3, 24.1]]) span(pylons[i], pylons[i + 1], ox, h, 4.5);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  group.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x2a2d30, transparent: true, opacity: 0.7 })));

  /* ---- haystacks in the fields */
  const stackGeo = new THREE.LatheGeometry(
    [[0, 0], [2.3, 0], [2.5, 0.8], [2.4, 1.8], [1.9, 2.8], [1.0, 3.6], [0, 3.9]].map(([r, h]) => new THREE.Vector2(r, h)),
    10
  );
  const capGeo = new THREE.LatheGeometry(
    [[0, 4.05], [1.1, 3.7], [2.0, 2.85], [2.25, 2.3]].map(([r, h]) => new THREE.Vector2(r, h)).reverse(),
    10
  );
  const stacks = [];
  for (let k = 0; k < 200 && stacks.length < 70; k++) {
    const p = at(rng.float(40, LINE.length - 40), rng.sign() * rng.float(22, 150));
    if (p.x < 150 || !clearOfInteriors(p.x, p.z) || nearEastSector(p.x, p.z, 14) || nearPort(p.x, p.z, 16) || highwayDistance(p.x, p.z) < 20 || stacks.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 14)) continue;
    stacks.push({ x: p.x, z: p.z, s: rng.float(0.75, 1.15), yaw: rng.float(0, TAU) });
  }
  const hayMat = new THREE.MeshStandardMaterial({ color: 0x9a8455, roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const stackMesh = new THREE.InstancedMesh(stackGeo, hayMat, stacks.length);
  const capMesh = new THREE.InstancedMesh(capGeo, M.snow, stacks.length);
  stacks.forEach((q, i) => {
    dummy.position.set(q.x, -0.05, q.z);
    dummy.rotation.set(0, q.yaw, 0);
    dummy.scale.set(q.s, q.s * rng.float(0.85, 1.1), q.s);
    dummy.updateMatrix();
    stackMesh.setMatrixAt(i, dummy.matrix);
    capMesh.setMatrixAt(i, dummy.matrix);
  });
  dummy.scale.set(1, 1, 1);
  add(stackMesh, { cast: true });
  add(capMesh, { season: 'winter' });

  /* ---- signs at the edge of town */
  const back = M.metal;
  const signPost = (x, z, h) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 8), back);
    post.position.set(x, h / 2, z);
    add(post, { cast: true });
  };
  const board = (s, side, w, h, lift, tex, twoPosts = false) => {
    const p = at(s, side);
    const plate = signPlate(tex, w, h, back);
    // faces the traffic coming out of town
    plate.rotation.y = p.heading + Math.PI;
    plate.position.set(p.x, lift + h / 2, p.z);
    add(plate, { cast: true });
    const offs = twoPosts ? [-w / 2 + 0.3, w / 2 - 0.3] : [0];
    for (const o of offs) signPost(p.x + Math.cos(p.heading) * o, p.z - Math.sin(p.heading) * o, lift + h / 2);
  };
  const s0 = LINE.s[first];
  board(
    s0 + 30,
    9.2,
    4.2,
    2.4,
    1.6,
    makeSignTexture(840, 480, (c, W, H) => {
      c.fillStyle = '#1f5fa8';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f2f2f2';
      c.lineWidth = 10;
      c.strokeRect(14, 14, W - 28, H - 28);
      c.fillStyle = '#f2f2f2';
      c.font = 'bold 66px "Arial Narrow", Arial, sans-serif';
      c.textAlign = 'left';
      c.fillText('ОМСК', 60, H * 0.3);
      c.fillText('НОВОСИБИРСК', 60, H * 0.68);
      c.textAlign = 'right';
      c.fillText('214', W - 60, H * 0.3);
      c.fillText('431', W - 60, H * 0.68);
      c.textAlign = 'center';
      c.fillStyle = '#e8d24a';
      c.fillRect(W / 2 - 110, H - 104, 220, 66);
      c.fillStyle = '#1b1b1b';
      c.font = 'bold 46px Arial, sans-serif';
      c.fillText('Р-254', W / 2, H - 70);
    }),
    true
  );
  board(
    s0 + 70,
    8.4,
    0.9,
    0.9,
    1.5,
    makeSignTexture(256, 256, (c, W, H) => {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(W / 2, H / 2, W / 2 - 4, 0, TAU);
      c.fill();
      c.strokeStyle = '#c4161c';
      c.lineWidth = 30;
      c.beginPath();
      c.arc(W / 2, H / 2, W / 2 - 22, 0, TAU);
      c.stroke();
      c.fillStyle = '#111';
      c.font = 'bold 110px Arial, sans-serif';
      c.fillText('90', W / 2, H / 2 + 6);
    })
  );

  // the town's farewell stele: a concrete slab with the star, on the left
  {
    const p = at(s0 + 46, -10.5);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.heading + Math.PI;
    const tex = makeSignTexture(256, 1024, (c, W, H) => {
      c.fillStyle = '#cfcabd';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#a8231c';
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 34 : 84;
        c.lineTo(W / 2 + Math.cos(a) * r, 150 + Math.sin(a) * r);
      }
      c.fill();
      c.fillStyle = '#2b2a27';
      c.font = 'bold 54px "Arial Narrow", Arial, sans-serif';
      ['СЧАСТ-', 'ЛИВОГО', 'ПУТИ!'].forEach((w, k) => c.fillText(w, W / 2, 380 + k * 80));
    });
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 8, 0.7), [M.concrete, M.concrete, M.concrete, M.concrete, face, M.concrete]);
    slab.position.y = 4.6;
    g.add(slab);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.8), M.concreteDark);
    plinth.position.y = 0.3;
    g.add(plinth);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.8), M.snow);
    cap.position.y = 8.66;
    g.add(ctx.seasonable('winter', cap));
    g.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    group.add(g);
  }

  /* ---- the petrol station at the roundabout */
  {
    const cx = (PAD.x0 + PAD.x1) / 2;
    const cz = (PAD.z0 + PAD.z1) / 2;
    const roofY = 5.2;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.7, 16), M.concreteWhite);
    canopy.position.set(cx - 4, roofY, cz);
    add(canopy, { cast: true });
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.36, 16.1), new THREE.MeshStandardMaterial({ color: 0xb0261f, roughness: 0.6 }));
    fascia.position.set(cx - 4, roofY - 0.1, cz);
    add(fascia);
    const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.16, 15.8), M.snow);
    roofSnow.position.set(cx - 4, roofY + 0.43, cz);
    add(roofSnow, { season: 'winter' });
    for (const dx of [-3.5, 3.5]) {
      for (const dz of [-5.5, 5.5]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, roofY, 0.4), M.concreteWhite);
        pillar.position.set(cx - 4 + dx, roofY / 2, cz + dz);
        add(pillar, { cast: true });
        ctx.addLateColliderRect(cx - 4 + dx - 0.25, cx - 4 + dx + 0.25, cz + dz - 0.25, cz + dz + 0.25);
      }
    }
    // two pump islands, a pump each side of the canopy's spine
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0xd9c84a, roughness: 0.55 });
    const dial = new THREE.MeshStandardMaterial({ color: 0x223, roughness: 0.3, emissive: 0x88a0c0, emissiveIntensity: 0.25 });
    for (const dz of [-2.6, 2.6]) {
      const island = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 5.2), M.concreteDark);
      island.position.set(cx - 4, 0.09, cz + dz);
      add(island);
      for (const ez of [-1.2, 1.2]) {
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.6), pumpMat);
        pump.position.set(cx - 4, 1.03, cz + dz + ez);
        add(pump, { cast: true });
        for (const sx of [-1, 1]) {
          const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34), dial);
          face.position.set(cx - 4 + sx * 0.352, 1.45, cz + dz + ez);
          face.rotation.y = (sx * Math.PI) / 2;
          add(face);
        }
      }
      ctx.addLateColliderRect(cx - 4.65, cx - 3.35, cz + dz - 2.65, cz + dz + 2.65);
    }
    // the cashier's booth at the back, a lit window and the АЗС sign
    const booth = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 7), M.concreteWhite);
    booth.position.set(PAD.x1 - 4, 1.5, cz);
    add(booth, { cast: true });
    const boothRoof = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 7.4), M.concreteDark);
    boothRoof.position.set(PAD.x1 - 4, 3.1, cz);
    add(boothRoof);
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.12, 7.3), M.snow);
    roofCap.position.set(PAD.x1 - 4, 3.25, cz);
    add(roofCap, { season: 'winter' });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.25, emissive: 0xffc77a, emissiveIntensity: 0.6 });
    world.windowMats.push(winMat);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), winMat);
    win.position.set(PAD.x1 - 6.52, 1.7, cz);
    win.rotation.y = -Math.PI / 2;
    add(win);
    ctx.addLateColliderRect(PAD.x1 - 6.6, PAD.x1 - 1.4, cz - 3.6, cz + 3.6);
    const tex = makeSignTexture(512, 256, (c, W, H) => {
      c.fillStyle = '#f4f1e8';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#b0261f';
      c.fillRect(0, 0, W, H * 0.22);
      c.fillRect(0, H * 0.78, W, H * 0.22);
      c.fillStyle = '#1b2a4a';
      c.font = 'bold 120px "Arial Narrow", Arial, sans-serif';
      c.fillText('АЗС', W / 2, H / 2 + 4);
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 4.0), [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }), back, back, back, back, back]);
    plate.position.set(cx - 4 - 6.1, roofY + 1.5, cz);
    plate.rotation.y = Math.PI;
    add(plate);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), back);
    stand.position.set(cx - 4 - 6.05, roofY + 0.4, cz);
    add(stand);
  }

  /* ---- off in the haze: a village and a grain elevator */
  {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x55605a, roughness: 0.8, metalness: 0.2 });
    const winLit = new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xffbe6a, emissiveIntensity: 0.6 });
    world.windowMats.push(winLit);
    const houses = [];
    const roofs = [];
    const wins = [];
    const vrng = new Rng(7307);
    const village = at(LINE.length * 0.52, -120);
    for (let k = 0; k < 14; k++) {
      const x = village.x + (k % 7) * 17 - 50 + vrng.float(-3, 3);
      const z = village.z + Math.floor(k / 7) * 26 - 13 + vrng.float(-3, 3);
      const w = vrng.float(6, 8);
      const d = vrng.float(7, 9);
      const yaw = vrng.float(-0.12, 0.12);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
      houses.push(new THREE.BoxGeometry(w, 3, d).translate(0, 1.5, 0).applyMatrix4(m));
      const roof = new THREE.CylinderGeometry(0.01, w * 0.62, 2.6, 4, 1);
      roof.rotateY(Math.PI / 4);
      roof.scale(1, 1, d / w);
      roofs.push(roof.translate(0, 4.3, 0).applyMatrix4(m));
      for (const dx of [-w / 4, w / 4]) wins.push(new THREE.PlaneGeometry(0.8, 0.9).rotateY(Math.PI).translate(dx, 1.6, -d / 2 - 0.02).applyMatrix4(m));
    }
    add(new THREE.Mesh(mergeGeometries(houses), logMat), { cast: true });
    add(new THREE.Mesh(mergeGeometries(roofs), roofMat), { cast: true });
    add(new THREE.Mesh(mergeGeometries(wins), winLit));

    const elevator = at(LINE.length * 0.72, 150);
    const silo = [];
    for (let k = 0; k < 6; k++) silo.push(new THREE.CylinderGeometry(3.4, 3.4, 30, 16).translate(elevator.x + (k % 3) * 7, 15, elevator.z + Math.floor(k / 3) * 7));
    silo.push(new THREE.BoxGeometry(8, 44, 9).translate(elevator.x - 9, 22, elevator.z + 3.5));
    silo.push(new THREE.BoxGeometry(24, 4, 16).translate(elevator.x + 7, 32, elevator.z + 3.5));
    add(new THREE.Mesh(mergeGeometries(silo), M.concrete));
  }
  ctx.addZone('Трасса Р-254', 'Steppe highway', WORLD.bounds, PAD.x1 + 200, -500, 500);
  ctx.addZone('АЗС', 'Petrol station', PAD.x0, PAD.x1, PAD.z0, PAD.z1);
}

/** For the tools and the playtest: the road's end points and the roundabout. */
export const HIGHWAY = { line: LINE, ring: RING, pad: PAD, open: OPEN, startX: START_X, at };
