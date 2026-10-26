// The southern quarter on ул. Школьная: the avenue and ул. Строителей run
// on past the old south fence to an east–west street; between it and the
// old district stand School No. 14, an outdoor hockey box, the Victory
// square with its obelisk and eternal flame, a garage co-op and an ice
// slide; five more blocks line the street's far side. Like the western
// cluster, everything draws from its own seeds and the small props bake
// per material into a far-detail group, hidden from the rest of the map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas, starPath } from '../util.js';
import { WORLD } from '../config.js';
import { canvasTexture, makeSignTexture, makeSoftCircleTexture } from '../textures.js';
import { tiledPlane } from './terrain.js';
import { SOUTH_SPECS, entranceDoor, makeStarMesh } from './buildings.js';

const R = WORLD.roadHalfWidth;
const SW = WORLD.sidewalkWidth;
const SX = WORLD.westStreetX;
const SZ = WORLD.southStreetZ;
const X0 = -WORLD.boundsWest;
const XE = 104; // east fence
const ZF = -WORLD.boundsSouth;
/** Where the historic avenue mesh and ул. Строителей used to end. */
const AVENUE_END = -116;
const WEST_STREET_END = -108;
/** North and south edges of the street's sidewalks. */
const WALK_N = SZ + R + SW;
const WALK_S = SZ - R - SW;

/** School No. 14: main block, its yard and the football pitch. */
const SCHOOL = { x: -50, z: -120, w: 54, d: 14, floors: 3, fh: 3.6 };
const YARD = { x0: -96, x1: -8, z0: -140, z1: -106 };
/** Hockey box (хоккейная коробка). */
export const RINK = { x: 36, z: -124, l: 30, w: 15, r: 3.5 };
/** Victory square: plaza, obelisk, eternal flame. */
const PLAZA = { x0: 69, x1: 91, z0: -133, z1: -113 };
const OBELISK = { x: 80, z: -118 };
/** Garage co-op: two facing rows east of ул. Строителей. */
export const GARAGES = { x0: -158, count: 14, unit: 3.4, north: -113, south: -129, depth: 6 };
/** Ice slide (ледяная горка) west of ул. Строителей. */
export const SLIDE = { x: -205, z: -118 };

/** Trampled paths: block entrances to the street, the square, the alley. */
export const SOUTH_WALK_PATHS = (() => {
  const paths = [];
  for (const spec of SOUTH_SPECS) {
    const cells = Math.max(4, Math.round(spec.w / 3.4));
    for (let c = 0; c < cells; c++) {
      if (c % 4 !== 3) continue;
      const door = entranceDoor(spec, c, 1);
      paths.push({ x0: door.x - 1.2, x1: door.x + 1.2, z0: WALK_S, z1: spec.z + spec.d / 2 + 1.3 });
    }
  }
  // Victory square: from the street up the axis, and a cross walk
  paths.push({ x0: 78.6, x1: 81.4, z0: WALK_N, z1: PLAZA.z0 });
  // the garage alley, trodden flat by cars and boots
  paths.push({ x0: GARAGES.x0 - 2, x1: SX + R + SW, z0: -125.2, z1: -116.8 });
  // from ул. Строителей to the ice slide
  paths.push({ x0: SLIDE.x + 1.6, x1: SX - R - SW, z0: -113.2, z1: -110.8 });
  return paths;
})();

/** Lamp posts: [x, z, facing] — street lamps reach over the carriageway,
 * the four on the hockey box lean over the ice. */
export const SOUTH_LAMPS = (() => {
  const lamps = [];
  for (const x of [-214, -140, -100, -24, 22, 66]) lamps.push([x, SZ + R + 2.2, Math.PI / 2]);
  for (const x of [-190, -120, -64, 0, 54, 96]) lamps.push([x, SZ - R - 2.2, -Math.PI / 2]);
  lamps.push([R + 2.2, -131, Math.PI]); // avenue, down to the junction
  lamps.push([SX - R - 2.2, -128, 0]); // ул. Строителей
  lamps.push([-134, -121, 0.2]); // the garage alley
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = RINK.x + sx * (RINK.l / 2 + 1.6);
      const z = RINK.z + sz * (RINK.w / 2 + 1.6);
      lamps.push([x, z, Math.atan2(-(RINK.z - z), RINK.x - x)]);
    }
  }
  return lamps;
})();

/** Parked cars of the quarter (merged into vehicles.js' list). */
export const SOUTH_CARS = [
  { x: 62, z: SZ + R - 1.25, heading: -Math.PI / 2, color: 0x6a6f5c, south: true },
  { x: -95, z: SZ - R + 1.25, heading: Math.PI / 2, color: 0x2f4256, south: true },
  { x: 20, z: SZ - R + 1.25, heading: Math.PI / 2 + 0.03, color: 0xb8b2a0, south: true },
  { x: -127.5, z: -122.8, heading: 0.08, color: 0x7b2e26, south: true },
  { x: -147.2, z: -119.6, heading: Math.PI - 0.05, color: 0x55605a, south: true },
];

/* ---------------------------------------------------------- terrain */

export function buildSouthTerrain(ctx) {
  const { world, materials: M, textures: T } = ctx;
  const roadMat = world.roadMats[0];
  const roadPlainMat = world.roadMats[1];

  // the avenue on to the junction, ул. Строителей likewise, and the street
  {
    const len = AVENUE_END - (SZ + R);
    const road = tiledPlane(R * 2, len, 12, roadMat, 0.02);
    road.position.set(0, 0.02, (AVENUE_END + SZ + R) / 2);
    world.group.add(road);
    ctx.addSurfaceRect(-R, R, SZ + R, AVENUE_END, 'asphalt');
  }
  {
    const len = WEST_STREET_END - (SZ + R);
    const road = tiledPlane(R * 2, len, 12, roadMat, 0.022);
    road.position.set(SX, 0.022, (WEST_STREET_END + SZ + R) / 2);
    world.group.add(road);
    ctx.addSurfaceRect(SX - R, SX + R, SZ + R, WEST_STREET_END, 'asphalt');
  }
  {
    const xa = X0 - 4;
    const xb = XE + 8;
    const road = tiledPlane(12, xb - xa, 12, roadMat, 0.021);
    road.rotation.y = Math.PI / 2;
    road.position.set((xa + xb) / 2, 0.021, SZ);
    world.group.add(road);
    ctx.addSurfaceRect(xa, xb, SZ - R, SZ + R, 'asphalt');
  }
  // school forecourt, plain asphalt from the gate to the porch
  {
    const pad = tiledPlane(16, 9, 12, roadPlainMat, 0.019);
    pad.position.set(SCHOOL.x, 0.019, YARD.z0 + 4.5 - 1);
    world.group.add(pad);
    ctx.addSurfaceRect(SCHOOL.x - 8, SCHOOL.x + 8, YARD.z0 - 1, YARD.z0 + 8, 'asphalt');
  }

  // sidewalks: split at the two junctions on the north side
  const walkMat = new THREE.MeshStandardMaterial({ map: T.sidewalk, roughness: 0.92 });
  const walks = [
    { x0: R, x1: R + SW, z0: WALK_N, z1: AVENUE_END },
    { x0: -R - SW, x1: -R, z0: WALK_N, z1: AVENUE_END },
    { x0: SX + R, x1: SX + R + SW, z0: WALK_N, z1: WEST_STREET_END },
    { x0: SX - R - SW, x1: SX - R, z0: WALK_N, z1: WEST_STREET_END },
    { x0: X0, x1: SX - R - SW, z0: SZ + R, z1: WALK_N },
    { x0: SX + R + SW, x1: -R - SW, z0: SZ + R, z1: WALK_N },
    { x0: R + SW, x1: XE, z0: SZ + R, z1: WALK_N },
    { x0: X0, x1: XE, z0: WALK_S, z1: SZ - R },
  ];
  const slabs = [];
  for (const w of walks) {
    const cx = (w.x0 + w.x1) / 2;
    const cz = (w.z0 + w.z1) / 2;
    const sx = w.x1 - w.x0;
    const sz = w.z1 - w.z0;
    slabs.push(new THREE.BoxGeometry(sx, 0.14, sz).translate(cx, 0.07, cz));
    const top = tiledPlane(sx, sz, 6, walkMat, 0.141);
    top.position.set(cx, 0.141, cz);
    world.group.add(top);
    ctx.addHeightRect(w.x0, w.x1, w.z0, w.z1, 0.14, true);
    ctx.addSurfaceRect(w.x0, w.x1, w.z0, w.z1, 'stone');
  }
  const slabMesh = new THREE.Mesh(mergeGeometries(slabs, false), M.concreteDark);
  slabMesh.receiveShadow = true;
  world.group.add(slabMesh);

  // white curbs along every new carriageway edge
  const curbs = [];
  const curbX = (x0, x1, z) => curbs.push(new THREE.BoxGeometry(x1 - x0, 0.2, 0.34).translate((x0 + x1) / 2, 0.1, z));
  const curbZ = (z0, z1, x) => curbs.push(new THREE.BoxGeometry(0.34, 0.2, z1 - z0).translate(x, 0.1, (z0 + z1) / 2));
  curbX(X0, XE, SZ - R - 0.17);
  curbX(X0, SX - R, SZ + R + 0.17);
  curbX(SX + R, -R, SZ + R + 0.17);
  curbX(R, XE, SZ + R + 0.17);
  for (const side of [-1, 1]) {
    curbZ(WALK_N, AVENUE_END, side * (R + 0.17));
    curbZ(WALK_N, WEST_STREET_END, SX + side * (R + 0.17));
  }
  const curbMesh = new THREE.Mesh(mergeGeometries(curbs, false), M.concreteWhite);
  curbMesh.receiveShadow = true;
  world.group.add(curbMesh);

  // Victory square: granite slabs, a step up from the snow
  {
    const stoneMat = new THREE.MeshStandardMaterial({ map: T.sidewalk, color: 0xb9b3ab, roughness: 0.8 });
    const w = PLAZA.x1 - PLAZA.x0;
    const d = PLAZA.z1 - PLAZA.z0;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), M.concreteDark);
    slab.position.set((PLAZA.x0 + PLAZA.x1) / 2, 0.06, (PLAZA.z0 + PLAZA.z1) / 2);
    slab.receiveShadow = true;
    world.group.add(slab);
    const top = tiledPlane(w, d, 4, stoneMat, 0.121);
    top.position.set((PLAZA.x0 + PLAZA.x1) / 2, 0.121, (PLAZA.z0 + PLAZA.z1) / 2);
    world.group.add(top);
    ctx.addHeightRect(PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, 0.12, true);
    ctx.addSurfaceRect(PLAZA.x0, PLAZA.x1, PLAZA.z0, PLAZA.z1, 'stone');
  }

  // trampled paths
  const pathMat = new THREE.MeshStandardMaterial({ map: T.path, roughness: 0.88 });
  for (const p of SOUTH_WALK_PATHS) {
    const mesh = tiledPlane(p.x1 - p.x0, p.z1 - p.z0, 4, pathMat, 0.03);
    mesh.position.set((p.x0 + p.x1) / 2, 0.03, (p.z0 + p.z1) / 2);
    world.group.add(mesh);
    ctx.addSurfaceRect(p.x0, p.x1, p.z0, p.z1, 'snow');
  }
}

/* ---------------------------------------------------------- textures */

/** Silicate-brick school facade: three floors of wide classroom windows,
 * the glazed stair hall in the middle. Returns colour and lit maps. */
function makeSchoolFacade(seed) {
  const rng = new Rng(seed);
  const W = 1536;
  const H = 308;
  const cols = 9;
  const ppm = W / SCHOOL.w;
  const color = makeCanvas(W, H);
  const lit = makeCanvas(W, H);
  const c = color.getContext('2d');
  const e = lit.getContext('2d');
  c.fillStyle = '#d6d0c0';
  c.fillRect(0, 0, W, H);
  // brick courses and weathering
  for (let y = 0; y < H; y += 4) {
    c.fillStyle = `rgba(90,84,70,${0.05 + rng.float(0, 0.04)})`;
    c.fillRect(0, y, W, 1);
  }
  for (let i = 0; i < 70; i++) {
    c.fillStyle = `rgba(70,64,52,${rng.float(0.03, 0.08)})`;
    c.fillRect(rng.float(0, W), rng.float(0, H), rng.float(10, 90), rng.float(20, 120));
  }
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);
  const floorPx = SCHOOL.fh * ppm;
  // plinth and the slab bands between floors
  c.fillStyle = '#8c877c';
  c.fillRect(0, H - 0.9 * ppm, W, 0.9 * ppm);
  c.fillStyle = 'rgba(236,232,222,0.9)';
  for (let f = 1; f <= SCHOOL.floors; f++) c.fillRect(0, H - f * floorPx - 4, W, 8);
  const cellW = W / cols;
  for (let f = 0; f < SCHOOL.floors; f++) {
    const lightOn = rng.chance(0.55); // a whole corridor of classrooms tends to be lit or not
    for (let col = 0; col < cols; col++) {
      const yb = H - f * floorPx;
      if (col === 4) {
        // stair hall: one tall glazed strip over the upper floors, door below
        if (f === 0) {
          const dw = 2.4 * ppm;
          c.fillStyle = '#4a3a2c';
          c.fillRect(col * cellW + cellW / 2 - dw / 2, yb - 2.5 * ppm, dw, 2.5 * ppm - 0.9 * ppm + 4);
          c.fillStyle = '#e9e4d8';
          c.fillRect(col * cellW + cellW / 2 - 1, yb - 2.5 * ppm, 2, 1.6 * ppm);
        }
        continue;
      }
      const ww = 4.4 * ppm;
      const wh = 2.0 * ppm;
      const x = col * cellW + (cellW - ww) / 2;
      const y = yb - floorPx + 0.95 * ppm;
      c.fillStyle = '#e8e3d6';
      c.fillRect(x - 4, y - 4, ww + 8, wh + 8);
      const g = c.createLinearGradient(0, y, 0, y + wh);
      g.addColorStop(0, '#323c48');
      g.addColorStop(1, '#1b222b');
      c.fillStyle = g;
      c.fillRect(x, y, ww, wh);
      const on = lightOn ? rng.chance(0.75) : rng.chance(0.12);
      if (on) {
        e.fillStyle = rng.chance(0.85) ? '#dfe8f4' : '#ffd9a0';
        e.fillRect(x, y, ww, wh);
      }
      // three casements and a transom
      c.fillStyle = '#e8e3d6';
      e.fillStyle = '#000';
      for (let k = 1; k < 3; k++) {
        c.fillRect(x + (ww * k) / 3 - 3, y, 6, wh);
        e.fillRect(x + (ww * k) / 3 - 3, y, 6, wh);
      }
      c.fillRect(x, y + wh * 0.3 - 2, ww, 4);
      e.fillRect(x, y + wh * 0.3 - 2, ww, 4);
    }
  }
  // the stair hall glazing over floors 2-3
  {
    const x = 4 * cellW + cellW * 0.25;
    const ww = cellW * 0.5;
    const y = H - SCHOOL.floors * floorPx + 0.6 * ppm;
    const wh = (SCHOOL.floors - 1) * floorPx - 0.8 * ppm;
    c.fillStyle = '#e8e3d6';
    c.fillRect(x - 4, y - 4, ww + 8, wh + 8);
    c.fillStyle = '#26303b';
    c.fillRect(x, y, ww, wh);
    e.fillStyle = '#cfdcec';
    e.fillRect(x, y, ww, wh);
    c.fillStyle = '#e8e3d6';
    e.fillStyle = '#000';
    for (let k = 1; k < 4; k++) {
      c.fillRect(x + (ww * k) / 4 - 2, y, 4, wh);
      e.fillRect(x + (ww * k) / 4 - 2, y, 4, wh);
    }
    for (let yy = y + 60; yy < y + wh; yy += 60) {
      c.fillRect(x, yy, ww, 4);
      e.fillRect(x, yy, ww, 4);
    }
  }
  // cornice
  c.fillStyle = '#bdb7a9';
  c.fillRect(0, 0, W, 10);
  return { map: canvasTexture(color), emissive: canvasTexture(lit) };
}

/** Plain silicate brick for the end walls. */
function makeBrickTexture(seed) {
  const rng = new Rng(seed);
  const canvas = makeCanvas(256, 256);
  const c = canvas.getContext('2d');
  c.fillStyle = '#d6d0c0';
  c.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) {
    c.fillStyle = `rgba(90,84,70,${0.05 + rng.float(0, 0.04)})`;
    c.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 18; i++) {
    c.fillStyle = `rgba(70,64,52,${rng.float(0.03, 0.08)})`;
    c.fillRect(rng.float(0, 256), rng.float(0, 256), rng.float(10, 60), rng.float(20, 120));
  }
  c.fillStyle = '#8c877c';
  c.fillRect(0, 236, 256, 20);
  return canvasTexture(canvas);
}

/** Smalt mosaic for the school's end wall: a cosmonaut under the sun and a
 * rocket climbing past the stars, laid tile by tile. */
function makeMosaicTexture(seed) {
  const rng = new Rng(seed);
  const SW_ = 160;
  const SH_ = 112;
  const src = makeCanvas(SW_, SH_);
  const s = src.getContext('2d');
  const sky = s.createLinearGradient(0, 0, 0, SH_);
  sky.addColorStop(0, '#173a6e');
  sky.addColorStop(1, '#3f78a8');
  s.fillStyle = sky;
  s.fillRect(0, 0, SW_, SH_);
  // the sun, rays and all
  s.fillStyle = '#e7b23a';
  s.beginPath();
  s.arc(128, 26, 15, 0, TAU);
  s.fill();
  s.strokeStyle = '#e7b23a';
  s.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    s.beginPath();
    s.moveTo(128 + Math.cos(a) * 19, 26 + Math.sin(a) * 19);
    s.lineTo(128 + Math.cos(a) * 27, 26 + Math.sin(a) * 27);
    s.stroke();
  }
  // stars
  s.fillStyle = '#f2ead2';
  for (let i = 0; i < 14; i++) {
    starPath(s, rng.float(6, 100), rng.float(6, 60), rng.float(1.8, 3.4), rng.float(0.8, 1.4));
    s.fill();
  }
  // rocket with its exhaust, climbing to the upper right
  s.save();
  s.translate(96, 70);
  s.rotate(-0.75);
  s.fillStyle = '#e9e2cf';
  s.fillRect(-5, -22, 10, 34);
  s.beginPath();
  s.moveTo(-5, -22);
  s.lineTo(0, -32);
  s.lineTo(5, -22);
  s.fill();
  s.fillStyle = '#b8322a';
  s.fillRect(-5, -12, 10, 4);
  s.beginPath();
  s.moveTo(-5, 8);
  s.lineTo(-11, 16);
  s.lineTo(-5, 12);
  s.moveTo(5, 8);
  s.lineTo(11, 16);
  s.lineTo(5, 12);
  s.fill();
  s.fillStyle = '#e7b23a';
  s.beginPath();
  s.moveTo(-4, 12);
  s.lineTo(0, 30);
  s.lineTo(4, 12);
  s.fill();
  s.restore();
  // the cosmonaut: white suit, gold visor, the red CCCP band
  s.fillStyle = '#ece6d6';
  s.beginPath();
  s.arc(42, 62, 20, 0, TAU);
  s.fill();
  s.fillRect(16, 78, 52, 40);
  s.fillStyle = '#d7a13a';
  s.beginPath();
  s.ellipse(44, 62, 12, 10, 0, 0, TAU);
  s.fill();
  s.fillStyle = 'rgba(255,240,200,0.6)';
  s.beginPath();
  s.ellipse(40, 58, 4, 3, -0.5, 0, TAU);
  s.fill();
  s.fillStyle = '#b8322a';
  s.fillRect(22, 84, 40, 9);
  s.fillStyle = '#ece6d6';
  s.font = 'bold 8px Arial';
  s.textAlign = 'center';
  s.fillText('СССР', 42, 91.5);
  // lay it out in smalt tiles with grout and a little colour drift
  const T = 4;
  const W = SW_ * T;
  const H = SH_ * T;
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  c.fillStyle = '#7f7a70';
  c.fillRect(0, 0, W, H);
  const data = s.getImageData(0, 0, SW_, SH_).data;
  for (let y = 0; y < SH_; y++) {
    for (let x = 0; x < SW_; x++) {
      const i = (y * SW_ + x) * 4;
      const j = rng.float(-14, 14);
      c.fillStyle = `rgb(${data[i] + j},${data[i + 1] + j},${data[i + 2] + j})`;
      c.fillRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
    }
  }
  return canvasTexture(canvas);
}

/** Rink ice: scratched, with the red centre line, blue lines and circles. */
function makeIceTexture(seed) {
  const rng = new Rng(seed);
  const W = 1024;
  const H = 512;
  const canvas = makeCanvas(W, H);
  const c = canvas.getContext('2d');
  c.fillStyle = '#dce6ee';
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    c.strokeStyle = `rgba(255,255,255,${rng.float(0.1, 0.35)})`;
    c.lineWidth = rng.float(0.5, 1.5);
    const x = rng.float(0, W);
    const y = rng.float(0, H);
    const a = rng.float(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI);
    const l = rng.float(20, 120);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + rng.float(-8, 8), x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(150,170,190,${rng.float(0.05, 0.14)})`;
    c.beginPath();
    c.ellipse(rng.float(0, W), rng.float(0, H), rng.float(20, 90), rng.float(10, 40), rng.float(0, TAU), 0, TAU);
    c.fill();
  }
  c.fillStyle = 'rgba(176,40,36,0.8)';
  c.fillRect(W / 2 - 5, 0, 10, H);
  c.fillStyle = 'rgba(36,70,150,0.75)';
  c.fillRect(W * 0.33 - 6, 0, 12, H);
  c.fillRect(W * 0.67 - 6, 0, 12, H);
  c.strokeStyle = 'rgba(36,70,150,0.75)';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(W / 2, H / 2, 70, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(176,40,36,0.7)';
  for (const [x, y] of [[0.18, 0.28], [0.18, 0.72], [0.82, 0.28], [0.82, 0.72]]) {
    c.beginPath();
    c.arc(W * x, H * y, 50, 0, TAU);
    c.stroke();
  }
  c.fillStyle = 'rgba(176,40,36,0.8)';
  c.fillRect(W * 0.08, 0, 4, H);
  c.fillRect(W * 0.92 - 4, 0, 4, H);
  c.fillStyle = 'rgba(70,120,200,0.35)';
  for (const x of [0.08, 0.92]) {
    c.beginPath();
    c.arc(W * x, H / 2, 34, x < 0.5 ? -Math.PI / 2 : Math.PI / 2, x < 0.5 ? Math.PI / 2 : (Math.PI * 3) / 2);
    c.fill();
  }
  return canvasTexture(canvas);
}

/** Flame for the eternal fire: hot core, orange tongue, soft edge. */
function makeFlameTexture() {
  const canvas = makeCanvas(64, 128);
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(32, 104, 2, 32, 90, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  g.addColorStop(0.6, 'rgba(240,110,30,0.6)');
  g.addColorStop(1, 'rgba(200,60,20,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(32, 2);
  c.quadraticCurveTo(58, 70, 50, 104);
  c.quadraticCurveTo(32, 126, 14, 104);
  c.quadraticCurveTo(6, 70, 32, 2);
  c.fill();
  return canvasTexture(canvas);
}

/* ---------------------------------------------------------- props */

export function buildSouthProps(ctx) {
  const { world, materials: M } = ctx;
  const sd = world.southDetails;
  const bake = (parts, mat, { season = null, cast = true, parent = sd } = {}) => {
    if (!parts.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(season ? ctx.seasonable(season, mesh) : mesh);
    return mesh;
  };
  const bx = (w, h, d, x, y, z, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  };
  const pipe = (list, a, b, r = 0.035, seg = 6) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    list.push(g);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const C = (x0, x1, z0, z1) => ctx.addColliderRect(x0, x1, z0, z1, true);
  const metal = [];
  const wood = [];
  const snow = [];
  const bins = [];

  /* ---- benches and bins ---- */
  const bench = (x, z, ry) => {
    const rot = new THREE.Matrix4().makeRotationY(ry);
    const put = (list, g) => list.push(g.applyMatrix4(rot).translate(x, 0, z));
    for (const dx of [-0.75, 0.75]) put(metal, bx(0.09, 0.44, 0.5, dx, 0.22, 0));
    for (let i = 0; i < 3; i++) put(wood, bx(1.8, 0.06, 0.14, 0, 0.46, -0.2 + i * 0.2));
    for (let i = 0; i < 2; i++) put(wood, bx(1.8, 0.14, 0.06, 0, 0.72 + i * 0.2, -0.28));
    put(snow, bx(1.84, 0.06, 0.5, 0, 0.52, -0.05));
    const ex = Math.abs(Math.cos(ry)) * 1.05 + Math.abs(Math.sin(ry)) * 0.45;
    const ez = Math.abs(Math.sin(ry)) * 1.05 + Math.abs(Math.cos(ry)) * 0.45;
    C(x - ex, x + ex, z - ez, z + ez);
    const bxp = x + Math.cos(ry) * 1.4;
    const bzp = z - Math.sin(ry) * 1.4;
    bins.push(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 12).translate(bxp, 0.4, bzp));
    C(bxp - 0.35, bxp + 0.35, bzp - 0.35, bzp + 0.35);
  };
  // one by each south block's entrance path, facing the path
  for (const p of SOUTH_WALK_PATHS.slice(0, -3)) bench(p.x1 + 1.3, -166.5, -Math.PI / 2);
  // around the square
  bench(PLAZA.x0 + 1.4, -127, Math.PI / 2);
  bench(PLAZA.x0 + 1.4, -121, Math.PI / 2);
  bench(PLAZA.x1 - 1.4, -127, -Math.PI / 2);
  bench(PLAZA.x1 - 1.4, -121, -Math.PI / 2);
  // by the rink, for the skates and the spectators
  bench(RINK.x - 6, RINK.z - RINK.w / 2 - 2.6, 0);
  bench(RINK.x + 6, RINK.z - RINK.w / 2 - 2.6, 0);

  /* ---- School No. 14 ---- */
  {
    const s = SCHOOL;
    const h = s.floors * s.fh;
    const facade = makeSchoolFacade(1414);
    const facadeMat = new THREE.MeshStandardMaterial({ map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.9 });
    world.windowMats.push(facadeMat);
    const brickMat = new THREE.MeshStandardMaterial({ map: makeBrickTexture(1415), roughness: 0.92 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), [brickMat, brickMat, roofMat, M.concreteDark, facadeMat, facadeMat]);
    body.position.set(s.x, h / 2, s.z);
    body.castShadow = true;
    body.receiveShadow = true;
    world.group.add(body);
    C(s.x - s.w / 2 - 0.25, s.x + s.w / 2 + 0.25, s.z - s.d / 2 - 0.25, s.z + s.d / 2 + 0.25);
    // parapet and its snow
    const lip = [];
    const lipSnow = [];
    for (const side of [-1, 1]) {
      lip.push(bx(s.w + 0.3, 0.5, 0.3, s.x, h + 0.15, s.z + side * s.d / 2));
      lip.push(bx(0.3, 0.5, s.d + 0.3, s.x + side * s.w / 2, h + 0.15, s.z));
      lipSnow.push(bx(s.w + 0.34, 0.08, 0.34, s.x, h + 0.44, s.z + side * s.d / 2));
      lipSnow.push(bx(0.34, 0.08, s.d + 0.34, s.x + side * s.w / 2, h + 0.44, s.z));
    }
    lipSnow.push(bx(s.w - 0.2, 0.1, s.d - 0.2, s.x, h + 0.05, s.z));
    bake(lip, M.concreteWhite, { parent: world.group });
    bake(lipSnow, M.snow, { season: 'winter', parent: world.group });

    // the porch: canopy on four pillars, three steps, the name on the fascia
    const front = s.z - s.d / 2;
    const porch = [];
    porch.push(bx(10, 0.32, 3.4, s.x, 3.4, front - 1.7));
    for (const dx of [-4.4, -1.6, 1.6, 4.4]) porch.push(bx(0.42, 3.3, 0.42, s.x + dx, 1.65, front - 3.1));
    for (let i = 0; i < 3; i++) porch.push(bx(10.4 - i * 0.6, 0.15, 3.4 - i * 0.5, s.x, 0.075 + i * 0.15, front - 1.7 + i * 0.25));
    bake(porch, M.concreteWhite);
    ctx.addHeightRect(s.x - 5, s.x + 5, front - 3.4, front, 0.45, true);
    for (const dx of [-4.4, -1.6, 1.6, 4.4]) C(s.x + dx - 0.3, s.x + dx + 0.3, front - 3.4, front - 2.8);
    bake([bx(10.1, 0.12, 3.5, s.x, 3.62, front - 1.7)], M.snow, { season: 'winter' });
    const nameTex = makeSignTexture(1024, 96, (c, W, H) => {
      c.fillStyle = '#2b4a6f';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#efe6d2';
      c.font = 'bold 60px "Arial Narrow", Arial, sans-serif';
      c.fillText('СРЕДНЯЯ ШКОЛА № 14', W / 2, H * 0.56);
    });
    const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: nameTex, emissiveIntensity: 0.15 });
    world.posterMats.push(nameMat);
    const name = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 0.9), nameMat);
    name.position.set(s.x, 3.4, front - 3.42);
    name.rotation.y = Math.PI;
    sd.add(name);

    // mosaic on the east end wall, facing the avenue
    const mosaic = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), new THREE.MeshStandardMaterial({ map: makeMosaicTexture(1416), roughness: 0.55, metalness: 0.05 }));
    mosaic.rotation.y = Math.PI / 2;
    mosaic.position.set(s.x + s.w / 2 + 0.03, 5.6, s.z);
    world.group.add(mosaic);

    // flagpole on the forecourt
    const pole = [];
    pipe(pole, V(s.x + 6.5, 0, front - 5.2), V(s.x + 6.5, 9, front - 5.2), 0.06, 8);
    bake(pole, M.metalLight);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9, 6, 1), new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.8, side: THREE.DoubleSide }));
    flag.position.set(s.x + 6.5 + 0.92, 8.5, front - 5.2);
    flag.userData.dynamic = true;
    sd.add(flag);
    const base = flag.geometry.attributes.position.array.slice();
    ctx.addUpdater((dt, t) => {
      const pos = flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const k = (x + 0.9) / 1.8;
        pos.setZ(i, Math.sin(t * 3.1 - k * 4) * 0.12 * k);
        pos.setY(i, base[i * 3 + 1] - k * k * 0.12);
      }
      pos.needsUpdate = true;
    });
    C(s.x + 6.3, s.x + 6.7, front - 5.4, front - 5);
  }

  /* ---- the schoolyard: low green railing, football pitch ---- */
  {
    const y = YARD;
    const rails = [];
    const gate = [SCHOOL.x - 4, SCHOOL.x + 4];
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pipe(rails, V(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t), V(x0 + (x1 - x0) * t, 1.1, z0 + (z1 - z0) * t), 0.03, 5);
      }
      for (const h of [0.15, 1.05]) pipe(rails, V(x0, h, z0), V(x1, h, z1), 0.025, 5);
      for (let i = 0; i < n * 6; i++) {
        const t = (i + 0.5) / (n * 6);
        pipe(rails, V(x0 + (x1 - x0) * t, 0.15, z0 + (z1 - z0) * t), V(x0 + (x1 - x0) * t, 1.05, z0 + (z1 - z0) * t), 0.012, 4);
      }
      C(Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1);
    };
    run(y.x0, y.z0, gate[0], y.z0);
    run(gate[1], y.z0, y.x1, y.z0);
    run(y.x0, y.z0, y.x0, y.z1);
    run(y.x1, y.z0, y.x1, y.z1);
    run(y.x0, y.z1, y.x1, y.z1);
    bake(rails, new THREE.MeshStandardMaterial({ color: 0x3e6a4a, roughness: 0.6, metalness: 0.35 }));
    // goals of the little pitch west of the school
    const goals = [];
    for (const gz of [-110, -136]) {
      const dir = gz > -123 ? -1 : 1;
      for (const gx of [-88.5, -85.5]) pipe(goals, V(gx, 0, gz), V(gx, 2, gz), 0.05, 8);
      pipe(goals, V(-88.5, 2, gz), V(-85.5, 2, gz), 0.05, 8);
      for (const gx of [-88.5, -85.5]) pipe(goals, V(gx, 2, gz), V(gx, 0, gz - dir * 1.2), 0.03, 6);
      C(-88.7, -85.3, Math.min(gz, gz - dir * 1.2) - 0.1, Math.max(gz, gz - dir * 1.2) + 0.1);
    }
    bake(goals, M.concreteWhite);
  }

  /* ---- hockey box ---- */
  {
    const k = RINK;
    // rounded-rectangle outline, about a metre per board section
    const outline = [];
    const hx = k.l / 2 - k.r;
    const hz = k.w / 2 - k.r;
    const corners = [
      [hx, hz, 0],
      [-hx, hz, Math.PI / 2],
      [-hx, -hz, Math.PI],
      [hx, -hz, (Math.PI * 3) / 2],
    ];
    for (const [cx, cz, a0] of corners) {
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * (Math.PI / 2);
        outline.push([k.x + cx + Math.cos(a) * k.r, k.z + cz + Math.sin(a) * k.r]);
      }
    }
    const boards = [];
    const rail = [];
    const kick = [];
    const gateX = [k.x - 1.2, k.x + 1.2];
    for (let i = 0; i < outline.length; i++) {
      const [ax, az] = outline[i];
      const [cx, cz] = outline[(i + 1) % outline.length];
      const len = Math.hypot(cx - ax, cz - az);
      const n = Math.max(1, Math.round(len / 1.2));
      for (let j = 0; j < n; j++) {
        const x0 = ax + ((cx - ax) * j) / n;
        const z0 = az + ((cz - az) * j) / n;
        const x1 = ax + ((cx - ax) * (j + 1)) / n;
        const z1 = az + ((cz - az) * (j + 1)) / n;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        // the spectators' side has a gate in the middle
        if (mz > k.z && mx > gateX[0] && mx < gateX[1]) continue;
        const seg = Math.hypot(x1 - x0, z1 - z0) + 0.02;
        const ry = -Math.atan2(z1 - z0, x1 - x0);
        boards.push(bx(seg, 1.0, 0.07, mx, 0.6, mz, ry));
        kick.push(bx(seg, 0.18, 0.08, mx, 0.12, mz, ry));
        rail.push(bx(seg, 0.08, 0.14, mx, 1.12, mz, ry));
      }
    }
    bake(boards, new THREE.MeshStandardMaterial({ color: 0x3d5b78, roughness: 0.75 }));
    bake(kick, new THREE.MeshStandardMaterial({ color: 0xc9a13f, roughness: 0.7 }));
    bake(rail, M.concreteWhite);
    bake(rail.map((g) => g.clone().translate(0, 0.08, 0)), M.snow, { season: 'winter' });
    // the ice: a rounded slab, glossy where the skates have polished it
    const shape = new THREE.Shape();
    outline.forEach(([x, z], i) => (i ? shape.lineTo(x - k.x, -(z - k.z)) : shape.moveTo(x - k.x, -(z - k.z))));
    const iceGeo = new THREE.ShapeGeometry(shape);
    iceGeo.rotateX(-Math.PI / 2);
    const uv = iceGeo.attributes.uv;
    const pos = iceGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + k.l / 2) / k.l, (pos.getZ(i) + k.w / 2) / k.w);
    const ice = new THREE.Mesh(iceGeo, new THREE.MeshStandardMaterial({ map: makeIceTexture(2424), roughness: 0.16, metalness: 0.05 }));
    ice.position.set(k.x, 0.05, k.z);
    ice.receiveShadow = true;
    world.group.add(ice);
    ctx.addSurfaceRect(k.x - k.l / 2 + 0.2, k.x + k.l / 2 - 0.2, k.z - k.w / 2 + 0.2, k.z + k.w / 2 - 0.2, 'ice');
    ctx.addHeightRect(k.x - k.l / 2 + 0.2, k.x + k.l / 2 - 0.2, k.z - k.w / 2 + 0.2, k.z + k.w / 2 - 0.2, 0.05, true);
    // board colliders: four straight runs (the corners are close enough)
    const t = 0.25;
    C(k.x - k.l / 2 - t, k.x + k.l / 2 + t, k.z - k.w / 2 - t, k.z - k.w / 2 + t);
    C(k.x - k.l / 2 - t, gateX[0], k.z + k.w / 2 - t, k.z + k.w / 2 + t);
    C(gateX[1], k.x + k.l / 2 + t, k.z + k.w / 2 - t, k.z + k.w / 2 + t);
    C(k.x - k.l / 2 - t, k.x - k.l / 2 + t, k.z - k.w / 2, k.z + k.w / 2);
    C(k.x + k.l / 2 - t, k.x + k.l / 2 + t, k.z - k.w / 2, k.z + k.w / 2);
    // two goals, red frames and a white net
    const frames = [];
    const nets = [];
    const netTex = makeSignTexture(128, 128, (c, W, H) => {
      c.clearRect(0, 0, W, H);
      c.strokeStyle = 'rgba(240,240,236,0.85)';
      c.lineWidth = 2;
      for (let i = 0; i <= W; i += 12) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, H);
        c.moveTo(0, i);
        c.lineTo(W, i);
        c.stroke();
      }
    });
    for (const side of [-1, 1]) {
      const gx = k.x + side * (k.l / 2 - 3.2);
      const back = gx + side * 1.0;
      for (const dz of [-0.92, 0.92]) {
        pipe(frames, V(gx, 0.05, k.z + dz), V(gx, 1.27, k.z + dz), 0.035, 8);
        pipe(frames, V(gx, 1.27, k.z + dz), V(back, 0.05, k.z + dz), 0.025, 6);
      }
      pipe(frames, V(gx, 1.27, k.z - 0.92), V(gx, 1.27, k.z + 0.92), 0.035, 8);
      pipe(frames, V(back, 0.05, k.z - 0.92), V(back, 0.05, k.z + 0.92), 0.025, 6);
      const net = new THREE.PlaneGeometry(1.84, 1.6);
      net.rotateX(-Math.PI / 2 + Math.atan2(1.22, 1.0) * 0 - 0.0);
      net.rotateZ(side * Math.atan2(1.22, 1.0));
      net.translate((gx + back) / 2, 0.66, k.z);
      nets.push(net);
      C(Math.min(gx, back) - 0.1, Math.max(gx, back) + 0.1, k.z - 1.0, k.z + 1.0);
    }
    bake(frames, new THREE.MeshStandardMaterial({ color: 0xb02a22, roughness: 0.5, metalness: 0.3 }));
    bake(nets, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }), { cast: false });
  }

  /* ---- Victory square ---- */
  {
    const o = OBELISK;
    const granite = new THREE.MeshStandardMaterial({ color: 0x5b4440, roughness: 0.45, metalness: 0.08 });
    const stone = new THREE.MeshStandardMaterial({ color: 0x9d978d, roughness: 0.6 });
    const plinth = [bx(5.2, 0.3, 5.2, o.x, 0.27, o.z), bx(4.2, 0.3, 4.2, o.x, 0.57, o.z), bx(3, 1.6, 3, o.x, 1.52, o.z)];
    bake(plinth, granite);
    const shaft = new THREE.CylinderGeometry(0.42, 0.95, 11, 4, 1);
    shaft.rotateY(Math.PI / 4);
    shaft.translate(o.x, 2.32 + 5.5, o.z);
    bake([shaft], stone);
    bake([bx(5.3, 0.06, 5.3, o.x, 0.45, o.z), bx(3.1, 0.08, 3.1, o.x, 2.36, o.z)], M.snow, { season: 'winter' });
    C(o.x - 2.7, o.x + 2.7, o.z - 2.7, o.z + 2.7);
    const star = makeStarMesh(0.95, 0.2, 0xb2241c);
    star.position.set(o.x, 14.1, o.z);
    world.group.add(star);
    // dedication on the plinth's face
    const plaqueTex = makeSignTexture(512, 256, (c, W, H) => {
      c.fillStyle = '#3a2a27';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#d9b45a';
      c.font = 'bold 66px "Arial Narrow", Arial, sans-serif';
      c.fillText('1941 — 1945', W / 2, H * 0.36);
      c.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
      c.fillText('ВЕЧНАЯ СЛАВА ГЕРОЯМ', W / 2, H * 0.72);
    });
    const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveMap: plaqueTex, emissiveIntensity: 0.1 });
    world.posterMats.push(plaqueMat);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), plaqueMat);
    plaque.position.set(o.x, 1.5, o.z - 1.51);
    plaque.rotation.y = Math.PI;
    sd.add(plaque);
    // wreaths leaning on the plinth
    const wreaths = [];
    const ribbons = [];
    for (const dx of [-0.85, 0.85]) {
      const tor = new THREE.TorusGeometry(0.42, 0.12, 8, 18);
      tor.rotateX(-0.25);
      tor.translate(o.x + dx, 0.95, o.z - 1.72);
      wreaths.push(tor);
      ribbons.push(bx(0.12, 0.5, 0.03, o.x + dx, 0.62, o.z - 1.86));
    }
    bake(wreaths, new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9 }));
    bake(ribbons, new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.7 }));

    // the eternal flame: a bronze star laid in a granite square
    const fz = o.z - 5.6;
    bake([bx(2.6, 0.18, 2.6, o.x, 0.21, fz)], granite);
    const bowl = makeStarMesh(1.05, 0.18, 0x6b5636);
    bowl.rotation.x = -Math.PI / 2;
    bowl.position.set(o.x, 0.36, fz);
    sd.add(bowl);
    C(o.x - 1.4, o.x + 1.4, fz - 1.4, fz + 1.4);
    const flameMat = new THREE.MeshBasicMaterial({ map: makeFlameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const flames = new THREE.Group();
    flames.userData.dynamic = true;
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.1), flameMat);
      f.rotation.y = (i / 3) * Math.PI;
      f.position.y = 0.55;
      flames.add(f);
    }
    flames.position.set(o.x, 0.4, fz);
    sd.add(flames);
    const glowTex = makeSoftCircleTexture(128, '255,170,90', 2.0);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffa050, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(o.x, 0.14, fz);
    sd.add(pool);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2.6, 2.6, 1);
    halo.position.set(o.x, 1.0, fz);
    sd.add(halo);
    ctx.addUpdater((dt, t) => {
      const flick = 0.85 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 29.7 + 1.3);
      flames.scale.set(1 + 0.05 * Math.sin(t * 7.3), flick, 1 + 0.05 * Math.sin(t * 5.1 + 2));
      flames.rotation.y = Math.sin(t * 0.7) * 0.2;
      pool.material.opacity = 0.28 + 0.08 * flick;
      halo.material.opacity = 0.42 + 0.12 * flick;
    });
  }

  /* ---- garage co-op ---- */
  {
    const g = GARAGES;
    const rng = new Rng(3131);
    const bodies = [];
    const doors = [];
    const roofs = [];
    const roofSnow = [];
    const colors = [0x3f5b49, 0x5a3a2c, 0x34506a, 0x6b4a2a, 0x4c5250, 0x7a3a2a, 0x56614a];
    const colored = (geo, hex) => {
      const col = new THREE.Color(hex);
      const arr = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < geo.attributes.position.count; i++) col.toArray(arr, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    };
    for (const [rowZ, facing] of [
      [g.north, -1],
      [g.south, 1],
    ]) {
      for (let i = 0; i < g.count; i++) {
        const x = g.x0 + (i + 0.5) * g.unit;
        const shade = rng.float(-0.04, 0.04);
        bodies.push(colored(bx(g.unit - 0.08, 2.5, g.depth, x, 1.25, rowZ), new THREE.Color(0.55 + shade, 0.53 + shade, 0.5 + shade).getHex()));
        const face = rowZ + facing * (g.depth / 2 + 0.03);
        const door = colored(bx(2.6, 2.1, 0.06, x, 1.08, face), rng.pick(colors));
        doors.push(door);
        doors.push(colored(bx(0.03, 2.1, 0.08, x, 1.08, face + facing * 0.01), 0x1c1c1c));
        doors.push(colored(bx(0.08, 0.18, 0.09, x + 0.25, 1.05, face + facing * 0.02), 0x9a9a92));
        roofs.push(bx(g.unit, 0.14, g.depth + 0.5, x, 2.57, rowZ + facing * 0.15));
        roofSnow.push(bx(g.unit, 0.12, g.depth + 0.5, x, 2.7, rowZ + facing * 0.15));
      }
      C(g.x0 - 0.1, g.x0 + g.count * g.unit + 0.1, rowZ - g.depth / 2 - 0.2, rowZ + g.depth / 2 + 0.2);
    }
    bake(bodies, new THREE.MeshStandardMaterial({ vertexColors: true, map: ctx.textures.concrete ?? null, roughness: 0.92 }));
    bake(doors, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));
    bake(roofs, new THREE.MeshStandardMaterial({ color: 0x2c2c2e, roughness: 0.95 }));
    bake(roofSnow, M.snow, { season: 'winter' });
  }

  /* ---- ice slide ---- */
  {
    const s = SLIDE;
    const top = 2.4;
    const timber = [];
    const iceParts = [];
    // platform on four posts, a railing round it
    timber.push(bx(2.2, 0.18, 2.2, s.x, top, s.z));
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) timber.push(bx(0.16, top, 0.16, s.x + dx, top / 2, s.z + dz));
    for (const dx of [-1.05, 1.05]) timber.push(bx(0.08, 0.9, 2.2, s.x + dx, top + 0.5, s.z));
    timber.push(bx(2.2, 0.08, 0.08, s.x, top + 0.9, s.z + 1.06));
    // stairs up the north side
    for (let i = 0; i < 8; i++) timber.push(bx(1.2, 0.08, 0.34, s.x, 0.3 * (i + 1), s.z + 1.1 + (7 - i) * 0.34 + 0.17));
    for (const dx of [-0.62, 0.62]) {
      const stringer = new THREE.BoxGeometry(0.08, 0.2, 3.6);
      stringer.rotateX(Math.atan2(top, 2.72));
      stringer.translate(s.x + dx, top / 2, s.z + 1.1 + 1.36);
      timber.push(stringer);
      const hand = new THREE.BoxGeometry(0.06, 0.06, 3.6);
      hand.rotateX(Math.atan2(top, 2.72));
      hand.translate(s.x + dx, top / 2 + 0.9, s.z + 1.1 + 1.36);
      timber.push(hand);
    }
    // the ramp: an icy chute with board sides, down to the south
    const rampLen = 9;
    const slope = Math.atan2(top, rampLen);
    const ramp = new THREE.BoxGeometry(1.5, 0.1, Math.hypot(top, rampLen));
    ramp.rotateX(-slope);
    ramp.translate(s.x, top / 2 - 0.02, s.z - 1.1 - rampLen / 2);
    timber.push(ramp);
    const sheet = new THREE.BoxGeometry(1.3, 0.03, Math.hypot(top, rampLen) + 1.5);
    sheet.rotateX(-slope);
    sheet.translate(s.x, top / 2 + 0.05, s.z - 1.1 - rampLen / 2 - 0.4);
    iceParts.push(sheet);
    for (const dx of [-0.72, 0.72]) {
      const side = new THREE.BoxGeometry(0.06, 0.32, Math.hypot(top, rampLen));
      side.rotateX(-slope);
      side.translate(s.x + dx, top / 2 + 0.16, s.z - 1.1 - rampLen / 2);
      timber.push(side);
    }
    bake(timber, new THREE.MeshStandardMaterial({ color: 0x6e4f34, roughness: 0.9 }));
    bake(iceParts, new THREE.MeshStandardMaterial({ color: 0xd6e4ef, roughness: 0.12 }));
    // and the run-out glazed by a whole winter of sledges
    const runOut = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6), new THREE.MeshStandardMaterial({ color: 0xcfdde9, roughness: 0.14, polygonOffset: true, polygonOffsetFactor: -2 }));
    runOut.rotation.x = -Math.PI / 2;
    runOut.position.set(s.x, 0.035, s.z - 1.1 - rampLen - 3);
    sd.add(runOut);
    ctx.addSurfaceRect(s.x - 0.8, s.x + 0.8, s.z - 1.1 - rampLen - 6, s.z - 1.1 - rampLen, 'ice');
    C(s.x - 1.2, s.x + 1.2, s.z - 1.1, s.z + 1.1 + 2.8); // platform and stairs
    C(s.x - 0.8, s.x + 0.8, s.z - 1.1 - rampLen, s.z - 1.1); // the chute
  }

  bake(metal, M.metal);
  bake(wood, M.wood);
  bake(snow, M.snow, { season: 'winter' });
  bake(bins, M.metal);

  /* ---- snow banks: curbs, paths, round the rink, behind the blocks ---- */
  {
    const rng = new Rng(717171);
    const spots = [];
    const addSpot = (x, z) => {
      const s = world.surfaceAt(x, z);
      if (s === 'asphalt' || s === 'stone' || s === 'ice') return;
      if (!world.collides(x, z, 1.5)) spots.push([x, z]);
    };
    for (let i = 0; i < 80; i++) addSpot(rng.float(X0 + 4, XE - 4), rng.chance(0.5) ? WALK_N + rng.float(0.8, 2.6) : WALK_S - rng.float(0.8, 2.6));
    for (let i = 0; i < 40; i++) {
      const a = rng.float(0, TAU);
      addSpot(RINK.x + Math.cos(a) * (RINK.l / 2 + rng.float(1.2, 3)), RINK.z + Math.sin(a) * (RINK.w / 2 + rng.float(1.2, 3)));
    }
    for (let i = 0; i < 50; i++) {
      const p = rng.pick(SOUTH_WALK_PATHS);
      const alongX = p.x1 - p.x0 > p.z1 - p.z0;
      if (alongX) addSpot(rng.float(p.x0, p.x1), rng.chance(0.5) ? p.z0 - rng.float(0.5, 1.6) : p.z1 + rng.float(0.5, 1.6));
      else addSpot(rng.chance(0.5) ? p.x0 - rng.float(0.5, 1.6) : p.x1 + rng.float(0.5, 1.6), rng.float(p.z0, p.z1));
    }
    for (let i = 0; i < 60; i++) addSpot(rng.float(X0 + 6, XE - 6), rng.float(ZF + 4, -106));
    const total = Math.min(180, spots.length);
    const mounds = new THREE.InstancedMesh(world.snowMounds.geometry, world.snowMounds.material, total);
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
    sd.add(ctx.seasonable('winter', mounds));
    world.snowMoundsSouth = mounds;
  }

  ctx.addZone('Улица Школьная', 'School street', X0, XE, WALK_S, WALK_N);
  ctx.addZone('Школа № 14', 'School No. 14', YARD.x0, YARD.x1, YARD.z0, YARD.z1);
  ctx.addZone('Хоккейная коробка', 'Ice hockey box', RINK.x - RINK.l / 2 - 3, RINK.x + RINK.l / 2 + 3, RINK.z - RINK.w / 2 - 3, RINK.z + RINK.w / 2 + 3);
  ctx.addZone('Сквер Победы', 'Victory square', 62, XE, WALK_N, -106);
  ctx.addZone('Гаражи', 'Garage co-op', GARAGES.x0 - 2, SX + R + SW, -134, -108);
  ctx.addZone('Ледяная горка', 'Ice slide', SLIDE.x - 8, SLIDE.x + 8, -134, -108);
  ctx.addZone('Южный микрорайон', 'Southern district', X0, XE, ZF, -104);
}

/** Tree lists of the quarter: birches in the front yards and behind the
 * blocks, poplars on the new street verges, a birch alley in the square,
 * blue spruces behind the obelisk, and a treeline past the south fence. */
export function scatterSouthTrees(okPlace) {
  const rng = new Rng(919191);
  const lists = { birch: [], poplar: [], spruce: [], outer: [] };
  const onPath = (x, z) => SOUTH_WALK_PATHS.some((p) => x >= p.x0 - 0.8 && x <= p.x1 + 0.8 && z >= p.z0 - 0.8 && z <= p.z1 + 0.8);
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
  // front yards between the street and the blocks, and behind them
  scatter(lists.birch, 18, X0 + 4, XE - 4, -170, -163.5);
  scatter(lists.birch, 16, X0 + 4, XE - 4, -193, -186);
  // the schoolyard's back fence row and the slide's field
  scatter(lists.birch, 8, YARD.x0 + 2, YARD.x1 - 2, -110, -107);
  scatter(lists.birch, 8, -232, -180, -140, -108);
  // verges of the avenue and ул. Строителей down to the junctions
  scatter(lists.poplar, 4, R + SW + 1.2, R + SW + 2.6, WALK_N + 2, -118);
  scatter(lists.poplar, 4, -R - SW - 2.6, -R - SW - 1.2, WALK_N + 2, -118);
  scatter(lists.poplar, 4, SX + R + SW + 1.2, SX + R + SW + 2.6, WALK_N + 2, -110);
  // birch alley along the square
  for (let z = -140; z <= -108; z += 4.5) {
    for (const x of [PLAZA.x0 - 3, PLAZA.x1 + 3]) if (okPlace(x, z, 1.0)) lists.birch.push({ x: x + rng.float(-0.3, 0.3), z });
  }
  // blue spruces behind the obelisk, as at every memorial
  for (let x = PLAZA.x0 + 2; x <= PLAZA.x1 - 2; x += 3.6) lists.spruce.push({ x, z: PLAZA.z1 + 2.2 + rng.float(-0.2, 0.2) });
  // a treeline beyond the south fence, so the edge reads as woodland
  for (let i = 0; i < 46; i++) lists.outer.push({ x: rng.float(X0 - 10, XE + 14), z: rng.float(ZF - 30, ZF - 5) });
  return lists;
}
