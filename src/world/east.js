// The private sector (частный сектор) on ул. Таёжная: a lane leaves the
// steppe highway just past the east fence and runs north between log izbas,
// crossed halfway up by ул. Кедровая. Every plot has its house with carved
// window casings and shutters, a porch, a shed, a banya, a woodpile and an
// outhouse behind picket and plank fences; stoves smoke, wooden lamp posts
// light the lanes, and a well stands where the lane leaves the road.
//
// Like the highway it draws from its own seeds, and its colliders go up only
// once the world is built, so the district's seeded scatter never sees it.
// The ground you may walk on out here is the sector itself (inEastSector).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas } from '../util.js';
import { canvasTexture, makeGlowTexture, makeBeamTexture, makeSignTexture, makeSmokeTexture } from '../textures.js';

/** The fenced sector north of the highway. */
export const SECTOR = { x0: 110, x1: 234, z0: 74, z1: 174 };
/** ул. Таёжная (x) and ул. Кедровая (z). */
export const LANE_X = 171;
const LANE_Z = 124;
const LANE_HALF = 3;
/** Where Таёжная leaves the highway, up to the sector fence. */
const MOUTH = { x0: LANE_X - LANE_HALF, x1: LANE_X + LANE_HALF, z0: 50, z1: SECTOR.z0 + 3 };
const EDGE = 0.4; // how far inside the perimeter fence you can walk

/** Whether a circle of radius r stands on the sector's open ground. */
export function inEastSector(x, z, r = 0) {
  if (x - r >= SECTOR.x0 + EDGE && x + r <= SECTOR.x1 - EDGE && z - r >= SECTOR.z0 + EDGE && z + r <= SECTOR.z1 - EDGE) return true;
  return x - r >= MOUTH.x0 && x + r <= MOUTH.x1 && z - r >= MOUTH.z0 && z + r <= MOUTH.z1;
}

/** The sector and a margin around it (the steppe keeps its groves and haystacks out). */
export function nearEastSector(x, z, margin = 12) {
  return x > SECTOR.x0 - margin && x < SECTOR.x1 + margin && z > SECTOR.z0 - margin && z < SECTOR.z1 + margin;
}

/* ------------------------------------------------------------- the plan */

// plots: [x0, x1, z0, z1, which side the street is on]
const ROWS = [
  [82, 100],
  [102, 119],
  [129, 147],
  [149, 172],
];
const SPECS = [
  ...ROWS.map(([z0, z1]) => [146, LANE_X - LANE_HALF - 1.5, z0, z1, '+x']),
  ...ROWS.map(([z0, z1]) => [LANE_X + LANE_HALF + 1.5, 196, z0, z1, '-x']),
  [112, 128.5, 102, 119, '+z'],
  [129, 145.5, 102, 119, '+z'],
  [112, 128.5, 129, 147, '-z'],
  [129, 145.5, 129, 147, '-z'],
  [196.5, 214, 102, 119, '+z'],
  [214.5, 232, 102, 119, '+z'],
  [196.5, 214, 129, 147, '-z'],
  [214.5, 232, 129, 147, '-z'],
];
const NUMBERS = ['1', '3', '5', '7', '2', '4', '6', '8', '1', '3', '2', '4', '5', '7', '6', '8'];
/** Kitchen gardens in the corners the plots leave over (a greenhouse each). */
const GARDENS = [
  [128, 91],
  [128, 160],
  [214, 91],
  [214, 160],
];
const WELL = { x: 179.5, z: 78 };
const PUMP = { x: 163, z: 78.5 };
const LAMPS = [
  [LANE_X + 3.8, 77, -Math.PI],
  [LANE_X + 3.8, 108, -Math.PI],
  [LANE_X - 3.8, 140, 0],
  [LANE_X + 3.8, 166, -Math.PI],
  [128, LANE_Z + 3.9, Math.PI / 2],
  [157, LANE_Z - 3.9, -Math.PI / 2],
  [186, LANE_Z + 3.9, Math.PI / 2],
  [215, LANE_Z - 3.9, -Math.PI / 2],
];

/** Each plot's frame: local +z points from the street into the plot, local
 * x runs along the street; the house stands on the side m points to. */
function planPlots() {
  const rng = new Rng(41723);
  return SPECS.map(([x0, x1, z0, z1, face], i) => {
    const xc = (x0 + x1) / 2;
    const zc = (z0 + z1) / 2;
    const plot = { i, number: NUMBERS[i], m: rng.sign() };
    if (face === '+x') Object.assign(plot, { ox: x1, oz: zc, theta: -Math.PI / 2, W: z1 - z0, D: x1 - x0 });
    if (face === '-x') Object.assign(plot, { ox: x0, oz: zc, theta: Math.PI / 2, W: z1 - z0, D: x1 - x0 });
    if (face === '+z') Object.assign(plot, { ox: xc, oz: z1, theta: Math.PI, W: x1 - x0, D: z1 - z0 });
    if (face === '-z') Object.assign(plot, { ox: xc, oz: z0, theta: 0, W: x1 - x0, D: z1 - z0 });
    plot.matrix = new THREE.Matrix4().makeRotationY(plot.theta).setPosition(plot.ox, 0, plot.oz);
    const { W, D, m } = plot;
    plot.hx = m * (W / 2 - 4.3); // the house's centre
    plot.gx = plot.hx - m * 5.6; // the gate
    plot.tree = rng.chance(0.6) ? { x: plot.gx - m * rng.float(2.2, 3.2), z: rng.float(1.4, 2.0) } : null;
    // what blocks you in the yard, local [x0, x1, z0, z1]
    const hx = plot.hx;
    const W2 = W / 2;
    const L = [
      [hx - 3.35, hx + 3.35, 2.1, 9.3], // house
      [hx - m * 3.2, hx - m * 4.75, 5.9, 8.7], // porch
      [-m * (W2 - 0.4), -m * (W2 - 5.1), D - 5.1, D - 0.4], // shed
      [-m * (W2 - 5.9), -m * (W2 - 7.3), D - 1.8, D - 0.4], // outhouse
      [hx - 2.3, hx + 2.3, D - 5.1, D - 0.6], // banya
      [-m * (W2 - 0.3), -m * (W2 - 1.5), 3, 8.2], // woodpile
      // fences: the front either side of the gate, the sides, the back
      [-W2, plot.gx - 0.75, 0.2, 0.42],
      [plot.gx + 0.75, W2, 0.2, 0.42],
      [-W2, -W2 + 0.3, 0.2, D],
      [W2 - 0.3, W2, 0.2, D],
      [-W2, W2, D - 0.3, D],
    ].map((r) => [Math.min(r[0], r[1]), Math.max(r[0], r[1]), r[2], r[3]]);
    if (plot.tree) L.push([plot.tree.x - 0.25, plot.tree.x + 0.25, plot.tree.z - 0.25, plot.tree.z + 0.25]);
    plot.local = L;
    plot.rects = L.map((r) => worldRect(plot.matrix, r));
    return plot;
  });
}

const _v = new THREE.Vector3();
function worldRect(matrix, [x0, x1, z0, z1]) {
  const a = _v.set(x0, 0, z0).applyMatrix4(matrix).clone();
  const b = _v.set(x1, 0, z1).applyMatrix4(matrix);
  return [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)];
}

const PLOTS = planPlots();
const COMMON = [
  [WELL.x - 1.0, WELL.x + 1.0, WELL.z - 1.0, WELL.z + 1.0],
  [PUMP.x - 0.3, PUMP.x + 0.3, PUMP.z - 0.3, PUMP.z + 0.3],
  ...GARDENS.map(([x, z]) => [x - 3.2, x + 3.2, z - 1.7, z + 1.7]),
  ...LAMPS.map(([x, z]) => [x - 0.25, x + 0.25, z - 0.25, z + 0.25]),
];

/** The birches of the sector: one in some front gardens, a few in the corner gardens. */
export function eastTrees() {
  const out = [];
  const v = new THREE.Vector3();
  for (const p of PLOTS) {
    if (!p.tree) continue;
    v.set(p.tree.x, 0, p.tree.z).applyMatrix4(p.matrix);
    out.push({ x: v.x, z: v.z });
  }
  for (const [x, z] of GARDENS) out.push({ x: x - 6, z: z + 4 }, { x: x + 7, z: z - 3.5 });
  return out;
}

/** Whether a tree of the district's woodland belt stands in the way of the
 * sector (on a lane, a building, a fence or out in the lane's mouth). */
export function eastBlocked(x, z) {
  if (!nearEastSector(x, z, 2)) return false;
  if (x > MOUTH.x0 - 2 && x < MOUTH.x1 + 2 && z > MOUTH.z0 - 6 && z < MOUTH.z1 + 2) return true;
  // the perimeter fence and the lanes
  if (x < SECTOR.x0 + 1.5 || x > SECTOR.x1 - 1.5 || z < SECTOR.z0 + 1.5 || z > SECTOR.z1 - 1.5) return true;
  if (Math.abs(x - LANE_X) < LANE_HALF + 1.5 || Math.abs(z - LANE_Z) < LANE_HALF + 1.5) return true;
  const hit = (r) => x > r[0] - 1.6 && x < r[1] + 1.6 && z > r[2] - 1.6 && z < r[3] + 1.6;
  for (const p of PLOTS) if (p.rects.some(hit)) return true;
  return COMMON.some(hit);
}

/* -------------------------------------------------------------- textures */

function logTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(4171);
  for (let k = 0; k < 8; k++) {
    const y = k * 32;
    const grad = g.createLinearGradient(0, y, 0, y + 32);
    grad.addColorStop(0, '#4a3a2c');
    grad.addColorStop(0.18, '#9c8064');
    grad.addColorStop(0.5, '#b09276');
    grad.addColorStop(0.85, '#7d6450');
    grad.addColorStop(1, '#2f241b');
    g.fillStyle = grad;
    g.fillRect(0, y, 256, 32);
    // grain and cracks
    for (let n = 0; n < 26; n++) {
      g.strokeStyle = `rgba(40,28,18,${rng.float(0.08, 0.28)})`;
      g.lineWidth = rng.float(0.6, 1.6);
      const yy = y + rng.float(6, 26);
      const x0 = rng.float(-20, 256);
      g.beginPath();
      g.moveTo(x0, yy);
      g.lineTo(x0 + rng.float(20, 90), yy + rng.float(-1.2, 1.2));
      g.stroke();
    }
    // moss / tow caulking in the seam
    g.fillStyle = 'rgba(70,62,44,0.8)';
    g.fillRect(0, y + 30, 256, 2);
  }
  return canvasTexture(c);
}

function plankTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(4172);
  for (let k = 0; k < 8; k++) {
    const x = k * 32;
    const l = rng.float(0.82, 1.08);
    g.fillStyle = `rgb(${Math.round(176 * l)},${Math.round(168 * l)},${Math.round(156 * l)})`;
    g.fillRect(x, 0, 32, 256);
    for (let n = 0; n < 14; n++) {
      g.strokeStyle = `rgba(50,44,38,${rng.float(0.08, 0.24)})`;
      g.lineWidth = rng.float(0.6, 1.4);
      const xx = x + rng.float(4, 28);
      g.beginPath();
      g.moveTo(xx, rng.float(-20, 256));
      g.lineTo(xx + rng.float(-1, 1), rng.float(0, 276));
      g.stroke();
    }
    // a knot or two
    g.fillStyle = 'rgba(60,46,34,0.5)';
    g.beginPath();
    g.ellipse(x + rng.float(8, 24), rng.float(0, 256), 2.5, 4, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(28,24,20,0.85)';
    g.fillRect(x, 0, 2, 256);
  }
  return canvasTexture(c);
}

function slateTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  // corrugated asbestos-cement sheets: eight waves across, laps every half
  for (let x = 0; x < 256; x++) {
    const s = 0.5 + 0.5 * Math.sin((x / 32) * TAU);
    const v = Math.round(150 + 70 * s);
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(x, 0, 1, 256);
  }
  g.fillStyle = 'rgba(30,30,30,0.35)';
  g.fillRect(0, 126, 256, 3);
  g.fillRect(0, 254, 256, 2);
  const rng = new Rng(4173);
  for (let n = 0; n < 40; n++) {
    g.fillStyle = `rgba(70,80,60,${rng.float(0.05, 0.16)})`;
    g.beginPath();
    g.arc(rng.float(0, 256), rng.float(0, 256), rng.float(4, 18), 0, TAU);
    g.fill();
  }
  return canvasTexture(c);
}

function logEndsTexture() {
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const rng = new Rng(4174);
  g.fillStyle = '#2d241c';
  g.fillRect(0, 0, 256, 256);
  for (let y = 12; y < 256; y += 22) {
    for (let x = (y / 22) % 2 ? 12 : 0; x < 268; x += 24) {
      const r = rng.float(8, 12);
      const xx = x + rng.float(-2, 2);
      const yy = y + rng.float(-2, 2);
      g.fillStyle = `rgb(${Math.round(rng.float(170, 205))},${Math.round(rng.float(140, 165))},${Math.round(rng.float(100, 120))})`;
      g.beginPath();
      g.arc(xx, yy, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(120,90,60,0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(xx, yy, r * 0.55, 0, TAU);
      g.stroke();
      g.strokeStyle = 'rgba(70,50,32,0.9)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(xx, yy, r, 0, TAU);
      g.stroke();
    }
  }
  return canvasTexture(c);
}

/* -------------------------------------------------------------- geometry */

/** A box whose texture repeats every `tile` metres on each face. */
function box(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

/** A flat shape in the xy plane pushed `depth` along z (uv in metres / tile). */
function slab(points, depth, tile = 1) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return g;
}

/** Geometry gathered per material (and season), merged into one mesh each. */
class Parts {
  constructor() {
    this.buckets = new Map();
  }
  add(mat, geo, { season = null, cast = true } = {}) {
    const key = `${mat.uuid}:${season}:${cast}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, season, cast, list: [] }));
    b.list.push(geo.index ? geo.toNonIndexed() : geo);
  }
  build(ctx, group) {
    for (const { mat, season, cast, list } of this.buckets.values()) {
      for (const g of list) for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(season ? ctx.seasonable(season, mesh) : mesh);
    }
  }
}

/* ----------------------------------------------------------------- build */

export function buildEast(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const T = ctx.textures;
  const group = world.eastDetails;
  const winter = world.season === 'winter';
  const rng = new Rng(41729);
  const parts = new Parts();

  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  const logTex = logTexture();
  const plankTex = plankTexture();
  const slateTex = slateTexture();
  const logs = [std({ map: logTex, color: 0xa88866 }), std({ map: logTex, color: 0x8a7462 }), std({ map: logTex, color: 0xa29a90 })];
  const fencePlank = std({ map: plankTex, color: 0x9a9286 });
  const shedPlank = std({ map: plankTex, color: 0x8c735a });
  const roofs = [std({ map: slateTex, color: 0xb8bab4, roughness: 0.85 }), std({ map: slateTex, color: 0x96583c, roughness: 0.7, metalness: 0.25 }), std({ map: slateTex, color: 0x5f8068, roughness: 0.7, metalness: 0.2 })];
  const paints = [std({ color: 0xebe7dc, roughness: 0.7 }), std({ color: 0x4f7fb0, roughness: 0.7 }), std({ color: 0x5f9068, roughness: 0.7 }), std({ color: 0xd2a64e, roughness: 0.7 })];
  const brick = std({ map: T.brick, color: 0xc49a88 });
  const woodpile = std({ map: logEndsTexture() });
  const lane = std({ map: T.path, color: winter ? 0xf4f6fa : 0x7a6a55, roughness: 0.95 });
  const rut = std({ map: T.path, color: winter ? 0xd3d8df : 0x564736, roughness: 0.95 });
  const glassLit = std({ color: 0x2a2f36, roughness: 0.25, emissive: 0xffbf72, emissiveIntensity: 0.6 });
  world.windowMats.push(glassLit);
  const glassDark = std({ color: 0x1b2026, roughness: 0.2, metalness: 0.2 });
  const film = new THREE.MeshStandardMaterial({ color: 0xdfe8e4, roughness: 0.4, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });

  const chimneys = [];

  /* ---- the plots */
  for (const p of PLOTS) {
    const { W, D, m, hx, gx, matrix } = p;
    const W2 = W / 2;
    const put = (mat, geo, x, y, z, ry = 0, opts) => parts.add(mat, geo.rotateY(ry).translate(x, y, z).applyMatrix4(matrix), opts);
    const logMat = rng.pick(logs);
    const roofMat = rng.pick(roofs);
    const trim = rng.pick(paints);
    const shutter = rng.pick(paints.filter((c) => c !== trim));
    const glass = rng.chance(0.72) ? glassLit : glassDark;
    const picket = rng.chance(0.5) ? M.wood : rng.pick(paints);

    /* the izba: log walls on a low plinth, its gable to the street */
    const hz0 = 2.2;
    const hz1 = 9.2;
    const hzc = (hz0 + hz1) / 2;
    const BASE = 0.5;
    const TOP = 3.5;
    put(M.concreteDark, box(6.6, BASE, 7.2, 1), hx, BASE / 2, hzc);
    put(logMat, box(6.4, TOP - BASE, 7, 2.1), hx, (TOP + BASE) / 2, hzc);
    // the crossed log ends standing out at the corners
    for (const sx of [-1, 1]) for (const sz of [hz0, hz1]) put(M.woodDark, box(0.34, TOP - BASE, 0.34, 1), hx + sx * 3.25, (TOP + BASE) / 2, sz + (sz === hz0 ? -0.05 : 0.05));
    // gables (boards) and the roof
    const RISE = 2.3;
    const RUN = 3.7;
    const DROP = 0.26; // the roof sits this much lower, so the eaves close over the walls
    const gable = [[-3.2, 0], [3.2, 0], [3.2, 0.03], [0, RISE - DROP - 0.08], [-3.2, 0.03]];
    for (const z of [hz0 + 0.04, hz1 - 0.04]) put(shedPlank, slab(gable, 0.12, 1.6), hx, TOP, z);
    const pitch = Math.atan2(RISE, RUN);
    const sw = Math.hypot(RISE, RUN);
    for (const s of [-1, 1]) {
      const r = box(sw, 0.1, 8, 1.4).rotateZ(-s * pitch);
      put(roofMat, r, hx + (s * RUN) / 2, TOP + RISE / 2 - DROP + 0.04, hzc);
      const cap = box(sw - 0.1, 0.14, 7.8, 2).rotateZ(-s * pitch);
      put(M.snow, cap, hx + s * (RUN / 2 - 0.05 * Math.sin(pitch)), TOP + RISE / 2 - DROP + 0.16, hzc, 0, { season: 'winter' });
    }
    // the ridge board, and an attic window in the street gable
    put(M.woodDark, box(0.22, 0.12, 8.1, 1), hx, TOP + RISE - DROP + 0.06, hzc);
    put(glassDark, new THREE.PlaneGeometry(0.5, 0.6), hx, TOP + 0.95, hz0 - 0.03, Math.PI);
    put(trim, box(0.7, 0.8, 0.05, 1), hx, TOP + 0.95, hz0 + 0.02);

    /* windows: three to the street, two on the far side, one by the porch */
    const windowAt = (x, z, nx, nz) => {
      const ry = Math.atan2(nx, nz);
      const w = (mat, geo, lx, ly, lz) => put(mat, geo.translate(lx, ly, lz).rotateY(ry), x, 1.95, z);
      w(glass, new THREE.PlaneGeometry(0.8, 1.15), 0, 0, 0.03);
      w(trim, box(0.05, 1.15, 0.04), 0, 0, 0.05);
      w(trim, box(0.8, 0.05, 0.04), 0, 0.18, 0.05);
      for (const sx of [-1, 1]) {
        w(trim, box(0.12, 1.42, 0.06), sx * 0.46, -0.04, 0.06);
        w(shutter, box(0.42, 1.25, 0.04), sx * 0.75, 0, 0.04);
      }
      w(trim, box(1.25, 0.1, 0.18), 0, -0.68, 0.09);
      w(trim, box(1.0, 0.2, 0.04), 0, -0.84, 0.05);
      w(trim, box(1.3, 0.16, 0.08), 0, 0.68, 0.07);
      w(trim, slab([[-0.65, 0], [0.65, 0], [0, 0.3]], 0.05), 0, 0.76, 0.07);
    };
    for (const dx of [-1.95, 0, 1.95]) windowAt(hx + dx, hz0 - 0.02, 0, -1);
    for (const z of [3.9, 7.6]) windowAt(hx + m * 3.22, z, m, 0);
    windowAt(hx - m * 3.22, 3.9, -m, 0);
    // the house number on the street gable, under the attic window
    p.plate = { x: hx, z: hz0 - 0.03 };

    /* the brick chimney through the roof, and its smoke */
    const cx = hx + m * 0.9;
    const cz = hzc + 0.8;
    put(brick, box(0.56, 3.0, 0.56, 1), cx, 5.05, cz);
    put(M.concreteDark, box(0.72, 0.12, 0.72, 1), cx, 6.6, cz);
    put(M.snow, box(0.6, 0.06, 0.6, 1), cx, 6.69, cz, 0, { season: 'winter' });
    if (rng.chance(0.75)) chimneys.push(new THREE.Vector3(cx, 6.75, cz).applyMatrix4(matrix));

    /* the porch: a platform, two steps, posts and a little roof */
    const px = hx - m * 3.95;
    put(M.wood, box(1.5, 0.12, 2.7, 1), px, 0.6, 7.3);
    put(M.woodDark, box(1.4, 0.54, 2.6, 1), px, 0.27, 7.3);
    for (const k of [0, 1]) put(M.wood, box(0.36, 0.1, 1.4, 1), px - m * (0.93 + k * 0.32), 0.4 - k * 0.2, 7.3);
    for (const dz of [-1.2, 1.2]) put(M.wood, box(0.1, 2.5, 0.1, 1), px - m * 0.62, 1.9, 7.3 + dz);
    put(roofMat, box(1.9, 0.07, 3.1, 1.4).rotateZ(m * 0.28), px - m * 0.1, 3.25, 7.3);
    put(M.snow, box(1.8, 0.1, 3.0, 2).rotateZ(m * 0.28), px - m * 0.1, 3.33, 7.3, 0, { season: 'winter' });
    put(M.woodDark, box(0.06, 1.95, 0.95, 1), hx - m * 3.22, 1.6, 7.3);
    put(M.wood, box(0.1, 0.08, 2.6, 1), px - m * 0.62, 1.05, 7.3); // the rail

    /* the shed, the outhouse, the banya, the woodpile */
    const shx = -m * (W2 - 2.75);
    put(shedPlank, box(4.5, 2.5, 4.5, 1.6), shx, 1.25, D - 2.75);
    put(roofMat, box(5.0, 0.08, 5.0, 1.4).rotateX(-0.16), shx, 2.72, D - 2.75);
    put(M.snow, box(4.9, 0.12, 4.9, 2).rotateX(-0.16), shx, 2.82, D - 2.75, 0, { season: 'winter' });
    put(M.woodDark, box(1.2, 1.9, 0.05), shx + m * 0.6, 0.95, D - 5.02);
    const ohx = -m * (W2 - 6.6);
    put(shedPlank, box(1.2, 2.1, 1.2, 1.6), ohx, 1.05, D - 1.1);
    put(roofMat, box(1.5, 0.06, 1.5, 1.4).rotateX(-0.2), ohx, 2.2, D - 1.1);
    put(M.woodDark, box(0.7, 1.7, 0.04), ohx, 0.9, D - 1.72);
    put(trim, box(0.16, 0.16, 0.02), ohx, 1.5, D - 1.75); // the heart cut-out's frame
    const bx = hx;
    const bz = D - 2.85;
    put(M.concreteDark, box(4.0, 0.3, 3.8, 1), bx, 0.15, bz);
    put(logMat, box(3.8, 2.1, 3.6, 2.1), bx, 1.35, bz);
    const bg = [[-1.9, 0], [1.9, 0], [0, 1.3]];
    for (const z of [bz - 1.76, bz + 1.76]) put(shedPlank, slab(bg, 0.1, 1.6), bx, 2.4, z);
    const bp = Math.atan2(1.3, 2.2);
    for (const s of [-1, 1]) {
      put(roofMat, box(Math.hypot(1.3, 2.2), 0.08, 4.4, 1.4).rotateZ(-s * bp), bx + s * 1.1, 3.07, bz);
      put(M.snow, box(Math.hypot(1.3, 2.2) - 0.1, 0.12, 4.2, 2).rotateZ(-s * bp), bx + s * 1.08, 3.17, bz, 0, { season: 'winter' });
    }
    put(M.metal, new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), bx - m * 0.9, 3.4, bz + 0.6);
    put(M.woodDark, box(0.8, 1.7, 0.05), bx - m * 0.8, 1.15, bz - 1.82);
    put(glassDark, new THREE.PlaneGeometry(0.4, 0.3), bx + m * 0.9, 1.7, bz - 1.83, Math.PI);
    if (rng.chance(0.4)) chimneys.push(new THREE.Vector3(bx - m * 0.9, 4.3, bz + 0.6).applyMatrix4(matrix));
    const wx = -m * (W2 - 0.9);
    put(woodpile, box(1.0, 1.7, 5.0, 1), wx, 0.85, 5.6);
    put(shedPlank, box(1.3, 0.06, 5.3, 1.6).rotateZ(m * 0.12), wx, 1.8, 5.6);
    put(M.snow, box(1.2, 0.1, 5.2, 2).rotateZ(m * 0.12), wx, 1.88, 5.6, 0, { season: 'winter' });

    /* fences: pickets to the street, boards around */
    const pickets = [];
    for (let x = -W2 + 0.1; x < W2 - 0.05; x += 0.2) {
      if (Math.abs(x - gx) < 0.8) continue;
      pickets.push(box(0.09, 1.4, 0.025).translate(x, 0.75, 0.31));
    }
    for (const y of [0.45, 1.15]) {
      pickets.push(box(gx - 0.8 + W2, 0.07, 0.05).translate((-W2 + gx - 0.8) / 2, y, 0.34));
      pickets.push(box(W2 - gx - 0.8, 0.07, 0.05).translate((W2 + gx + 0.8) / 2, y, 0.34));
    }
    for (let x = -W2 + 0.06; x <= W2; x += 2.5) if (Math.abs(x - gx) > 1) pickets.push(box(0.1, 1.55, 0.1).translate(x, 0.78, 0.34));
    for (const sx of [-0.78, 0.78]) pickets.push(box(0.15, 1.9, 0.15).translate(gx + sx, 0.95, 0.31));
    pickets.push(box(1.75, 0.12, 0.12).translate(gx, 1.85, 0.31));
    parts.add(picket, mergeGeometries(pickets.map((g) => g.toNonIndexed()), false).applyMatrix4(matrix));
    put(fencePlank, box(0.05, 1.8, D - 0.3, 1.6), -W2 + 0.15, 0.9, (D + 0.3) / 2);
    put(fencePlank, box(0.05, 1.8, D - 0.3, 1.6), W2 - 0.15, 0.9, (D + 0.3) / 2);
    put(fencePlank, box(W - 0.3, 1.8, 0.05, 1.6), 0, 0.9, D - 0.15);
    // the path from the gate to the porch
    put(lane, box(1.1, 0.02, 7.0, 3), gx, 0.02, 3.8, 0, { cast: false });
    put(lane, box(Math.abs(px - gx) + 0.2, 0.02, 1.1, 3), (gx + px) / 2, 0.021, 7.3, 0, { cast: false });

    for (const r of p.rects) ctx.addLateColliderRect(r[0], r[1], r[2], r[3]);
  }

  /* ---- the lanes: packed snow with two ruts */
  const laneZ0 = MOUTH.z0 + 3.6;
  const laneZ1 = SECTOR.z1 - 2;
  parts.add(lane, box(LANE_HALF * 2, 0.02, laneZ1 - laneZ0, 4).translate(LANE_X, 0.03, (laneZ0 + laneZ1) / 2), { cast: false });
  parts.add(lane, box(SECTOR.x1 - SECTOR.x0 - 4, 0.02, LANE_HALF * 2, 4).translate((SECTOR.x0 + SECTOR.x1) / 2, 0.032, LANE_Z), { cast: false });
  for (const s of [-0.95, 0.95]) {
    parts.add(rut, box(0.5, 0.02, laneZ1 - laneZ0, 3).translate(LANE_X + s, 0.036, (laneZ0 + laneZ1) / 2), { cast: false });
    parts.add(rut, box(SECTOR.x1 - SECTOR.x0 - 4, 0.02, 0.5, 3).translate((SECTOR.x0 + SECTOR.x1) / 2, 0.038, LANE_Z + s), { cast: false });
  }

  /* ---- the perimeter fence, open where the lane comes in */
  const fx0 = SECTOR.x0 + 0.2;
  const fx1 = SECTOR.x1 - 0.2;
  const fz0 = SECTOR.z0 + 0.2;
  const fz1 = SECTOR.z1 - 0.2;
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = box(len, 2.0, 0.05, 1.6);
    if (x0 === x1) g.rotateY(Math.PI / 2);
    parts.add(fencePlank, g.translate((x0 + x1) / 2, 1.0, (z0 + z1) / 2));
  };
  run(fx0, fz0, MOUTH.x0 - 0.6, fz0);
  run(MOUTH.x1 + 0.6, fz0, fx1, fz0);
  run(fx0, fz1, fx1, fz1);
  run(fx0, fz0, fx0, fz1);
  run(fx1, fz0, fx1, fz1);
  // gate posts at the lane, with a name board across the top
  for (const x of [MOUTH.x0 - 0.6, MOUTH.x1 + 0.6]) parts.add(M.woodDark, box(0.24, 2.6, 0.24).translate(x, 1.3, fz0));

  /* ---- the well, the pump, a bench */
  {
    const { x, z } = WELL;
    parts.add(M.woodDark, box(1.6, 0.9, 1.6, 2.1).translate(x, 0.45, z));
    parts.add(logs[1], box(1.64, 0.6, 1.64, 2.1).translate(x, 0.3, z));
    for (const sx of [-0.7, 0.7]) parts.add(M.wood, box(0.12, 2.2, 0.12).translate(x + sx, 1.1, z));
    parts.add(M.wood, new THREE.CylinderGeometry(0.12, 0.12, 1.5, 10).rotateZ(Math.PI / 2).translate(x, 1.55, z));
    parts.add(M.metal, box(0.04, 0.3, 0.4).translate(x + 0.8, 1.45, z + 0.1));
    for (const s of [-1, 1]) {
      parts.add(roofs[0], box(1.2, 0.06, 1.8, 1.4).rotateX(s * 0.7).translate(x, 2.45, z + s * 0.42));
      parts.add(M.snow, box(1.1, 0.1, 1.7, 2).rotateX(s * 0.7).translate(x, 2.52, z + s * 0.45), { season: 'winter' });
    }
    parts.add(M.metal, new THREE.CylinderGeometry(0.22, 0.18, 0.32, 10).translate(x + 0.55, 0.06 + 0.9, z + 0.55));
    const b = { x: x + 4.6, z };
    parts.add(M.wood, box(0.42, 0.06, 1.9).translate(b.x, 0.46, b.z));
    for (const dz of [-0.75, 0.75]) parts.add(M.woodDark, box(0.36, 0.44, 0.1).translate(b.x, 0.22, b.z + dz));
    ctx.addLateColliderRect(b.x - 0.25, b.x + 0.25, b.z - 0.98, b.z + 0.98);
    ctx.addLateColliderRect(x - 1.0, x + 1.0, z - 1.0, z + 1.0);
    const q = PUMP;
    parts.add(paints[1], new THREE.CylinderGeometry(0.13, 0.16, 1.35, 10).translate(q.x, 0.68, q.z));
    parts.add(paints[1], new THREE.CylinderGeometry(0.17, 0.17, 0.2, 10).translate(q.x, 1.42, q.z));
    parts.add(M.metal, box(0.06, 0.06, 0.6).rotateX(0.5).translate(q.x, 1.25, q.z + 0.3));
    parts.add(M.metal, new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateX(Math.PI / 2).translate(q.x, 0.95, q.z - 0.22));
    parts.add(M.snow, new THREE.CylinderGeometry(0.17, 0.17, 0.05, 10).translate(q.x, 1.55, q.z), { season: 'winter' });
    ctx.addLateColliderRect(q.x - 0.3, q.x + 0.3, q.z - 0.3, q.z + 0.3);
  }

  /* ---- greenhouses in the corner gardens */
  for (const [x, z] of GARDENS) {
    parts.add(film, new THREE.CylinderGeometry(1.5, 1.5, 6, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(x, 0, z), { cast: false });
    for (let k = -3; k <= 3; k += 1.5) parts.add(M.metal, new THREE.TorusGeometry(1.5, 0.025, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(x + k, 0, z));
    parts.add(M.woodDark, box(6.4, 0.2, 3.3).translate(x, 0.1, z));
    ctx.addLateColliderRect(x - 3.2, x + 3.2, z - 1.7, z + 1.7);
  }

  /* ---- the sector's birches need trunks you bump into (vegetation.js plants them) */
  // (the front-garden ones already stand in their plot's rects)
  for (const t of eastTrees().slice(PLOTS.filter((p) => p.tree).length)) ctx.addLateColliderRect(t.x - 0.25, t.x + 0.25, t.z - 0.25, t.z + 0.25);

  parts.build(ctx, group);

  /* ---- house numbers and street name plates */
  {
    const tex = makeSignTexture(512, 512, (c, Wt, Ht) => {
      for (let k = 0; k < 16; k++) {
        const x = (k % 4) * 128;
        const y = Math.floor(k / 4) * 128;
        c.fillStyle = '#1f4f8f';
        c.fillRect(x + 4, y + 20, 120, 88);
        c.strokeStyle = '#f0f0f0';
        c.lineWidth = 4;
        c.strokeRect(x + 10, y + 26, 108, 76);
        c.fillStyle = '#f4f4f4';
        c.font = 'bold 60px Arial, sans-serif';
        c.fillText(NUMBERS[k] ?? '', x + 64, y + 66);
      }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const plates = [];
    for (const p of PLOTS) {
      const g = new THREE.PlaneGeometry(0.5, 0.36);
      const u0 = (p.i % 4) / 4;
      const v1 = 1 - Math.floor(p.i / 4) / 4;
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (uv.getX(i) * 120 + 4) / 512, v1 - ((1 - uv.getY(i)) * 88 + 20) / 512);
      g.rotateY(Math.PI).translate(p.plate.x + 0.98, 3.05, p.plate.z - 0.02).applyMatrix4(p.matrix);
      plates.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(plates, false), std({ map: tex, roughness: 0.6 }));
    group.add(mesh);

    const street = (name, x, z, ry) => {
      const t = makeSignTexture(512, 128, (c, Wt, Ht) => {
        c.fillStyle = '#1f4f8f';
        c.fillRect(0, 0, Wt, Ht);
        c.strokeStyle = '#f0f0f0';
        c.lineWidth = 6;
        c.strokeRect(8, 8, Wt - 16, Ht - 16);
        c.fillStyle = '#f4f4f4';
        c.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
        c.fillText(name, Wt / 2, Ht / 2 + 3);
      });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), std({ map: t, roughness: 0.6 }));
      plate.position.set(x, 1.95, z);
      plate.rotation.y = ry;
      group.add(plate);
    };
    // on the picket fences of the corner plots, facing the lanes
    street('ул. Таёжная', LANE_X - LANE_HALF - 1.5 - 0.27, 85, Math.PI / 2);
    street('ул. Таёжная', LANE_X + LANE_HALF + 1.5 + 0.27, 85, -Math.PI / 2);
    street('ул. Кедровая', 141, 119 - 0.27, 0);
    street('ул. Кедровая', 201, 129 + 0.27, Math.PI);
  }

  /* ---- wooden lamp posts along the lanes */
  {
    const glowTex = makeGlowTexture(128, '255,186,110');
    const beamTex = makeBeamTexture();
    const beamGeo = new THREE.PlaneGeometry(3.0, 6.0);
    const poleMat = std({ color: 0x5a4a3a, roughness: 0.95 });
    for (const [x, z, facing] of LAMPS) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6.8, 8), poleMat);
      pole.position.y = 3.4;
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), poleMat);
      strut.position.set(-0.45, 1.2, 0);
      strut.rotation.z = -0.35;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.08), M.metal);
      arm.position.set(0.6, 6.25, 0);
      arm.rotation.z = 0.1;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 12, 1, true), world.lampMats.head);
      head.position.set(1.2, 6.2, 0);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), world.lampMats.glass);
      bulb.position.set(1.2, 6.06, 0);
      for (const o of [pole, strut, arm, head]) o.castShadow = true;
      g.add(pole, strut, arm, head, bulb);
      const lightPos = new THREE.Vector3(1.2, 5.95, 0);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc681, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2.2, 2.2, 1);
      glow.position.copy(lightPos);
      g.add(glow);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 14),
        new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa54d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(1.2, 0.2, 0);
      g.add(pool);
      const coneMat = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffbe78, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Group();
      cone.add(new THREE.Mesh(beamGeo, coneMat), new THREE.Mesh(beamGeo, coneMat));
      cone.position.set(1.2, 3.0, 0);
      g.add(cone);
      g.position.set(x, 0, z);
      g.rotation.y = facing;
      cone.children[1].rotation.y = Math.PI / 2;
      group.add(g);
      ctx.addLateColliderRect(x - 0.25, x + 0.25, z - 0.25, z + 0.25);
      g.updateMatrixWorld();
      world.lamps.push({ lightPos: g.localToWorld(lightPos), glow, pool, cone, coneMat, group: g, height: 6.2 });
    }
  }

  /* ---- stove smoke: one cloud of soft points for every chimney */
  {
    const PER = 12;
    const n = chimneys.length * PER;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const life = new Float32Array(n);
    const drift = new Float32Array(n);
    const srng = new Rng(41731);
    for (let i = 0; i < n; i++) {
      life[i] = srng.float(0, 1);
      drift[i] = srng.float(-1, 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const smoke = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: makeSmokeTexture(64), size: 2.0, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false })
    );
    smoke.frustumCulled = false;
    smoke.userData.dynamic = true;
    group.add(smoke);
    const shade = winter ? 0.62 : 0.55;
    ctx.addUpdater((dt) => {
      if (!group.visible) return;
      for (let c = 0; c < chimneys.length; c++) {
        const o = chimneys[c];
        for (let k = 0; k < PER; k++) {
          const i = c * PER + k;
          life[i] = (life[i] + dt * 0.08) % 1;
          const t = life[i];
          pos[i * 3] = o.x + t * 5.5 + drift[i] * t * 1.6;
          pos[i * 3 + 1] = o.y + t * 7;
          pos[i * 3 + 2] = o.z + t * 2.4 + drift[i] * t * 1.2;
          col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = shade;
          col[i * 4 + 3] = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 0.34 * (1 - t);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    });
  }

  ctx.addZone('Частный сектор', 'ул. Таёжная · private houses', SECTOR.x0, SECTOR.x1, MOUTH.z0 + 6, SECTOR.z1);
}

/** For the tools and the playtest: the sector, its lanes and plots. */
export const EAST = { sector: SECTOR, mouth: MOUTH, laneX: LANE_X, laneZ: LANE_Z, plots: PLOTS };
