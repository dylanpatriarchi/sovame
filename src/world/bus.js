// The city bus: a LiAZ-677-like single-decker, ochre below and cream above,
// that goes round the block with the traffic (traffic.js) and calls at the
// bus stops: it pulls over to the curb, folds its doors open with a hiss of
// air, waits, closes them and pulls out again. It is hollow: real glass in
// rubber-framed panes with their top vents, and behind it the saloon with
// its rows of seats, chrome poles, the lamps along the ceiling, the driver
// at the wheel in his cab. You can get on (busride.js). It has the same
// surface as a Car for the traffic and the colliders (x, z, heading, speed,
// steer, pitch, roll, spin, sync, updateCollider, distanceTo...).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '../util.js';
import { makeSignTexture } from '../textures.js';
import { box, colorize, escapesFromBox, plain } from './vehicles.js';

export const BUS = {
  length: 10.5,
  width: 2.5,
  wheelR: 0.5,
  track: 2.0,
  frontAxle: 3.0,
  rearAxle: -2.2,
  floor: 0.86, // the saloon floor
};
const HALF_L = BUS.length / 2;
const HALF_W = BUS.width / 2;
const FLOOR = BUS.floor;
const R = 0.18; // the rounded corners of the body
const WALL = 0.06;
const SKIRT = 0.3; // bottom edge of the panels
const ARCH_TOP = 1.12;
const ARCH_Y = 0.48; // centre of the round arch over each wheel
const ARCH_R = 0.64;
const BELT = 1.44; // window sills
const WIN_TOP = 2.45;
const EAVE = 2.8; // top of the walls, where the roof curves over
const CROWN = 0.3; // the roof's rise over the eaves

const OCHRE = 0xcf9f3a;
const STRIPE = 0xa9372a;
const CREAM = 0xe2d9c0;
const ROOF = 0xe8e3d4;
const DARK = 0x1f2326;
const RUBBER = 0x141516;
const GREY = 0x4a4d50;
const LINING = 0x9a9282; // the saloon's wall panels
const CEILING = 0xe4dfd0;
const LINO = 0x4b4237;
const LEATHER = 0x7a3328; // the seats' red-brown leatherette
const FRAME = 0x3a3a38;

/** Doors on the right-hand side (local -x): [front edge, rear edge] in z. */
const DOORS = [
  [4.95, 4.0],
  [0.2, -0.8],
];
const LEAF_H = 2.08;
const LEAF_Y = 0.34;
const WELL = 0.75; // depth of the stepwell behind a door, across the bus

/** The seat you ride in: a single by the right-hand windows, just ahead of
 * the rear door. Eyes, in the bus's own frame. */
export const RIDE_EYE = new THREE.Vector3(-0.88, FLOOR + 1.2, 0.82);
/** Where you stand outside each door to get on, and step down to get off. */
export const DOOR_SPOTS = DOORS.map(([f, r]) => new THREE.Vector3(-(HALF_W + 0.75), 0, (f + r) / 2));

const _dummy = new THREE.Object3D();

/** A vertical cylinder from y0 to y1 (posts, poles, the rounded corners). */
function post(r, y0, y1, x, z, seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}

/** A horizontal rod along z, at (x, y), from z0 to z1. */
function rail(r, z0, z1, x, y) {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, 8);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}

/** The [z0, z1] spans of the right side left once the door openings are cut out. */
function cutDoors(z0, z1) {
  return cut([[z0, z1]], DOORS.map(([f, r]) => [r, f]));
}

/** The spans left of `spans` once the [a, b] holes are taken out. */
function cut(spans, holes) {
  for (const [r, f] of holes) {
    const next = [];
    for (const [a, b] of spans) {
      if (b <= r || a >= f) next.push([a, b]);
      else {
        if (a < r) next.push([a, r]);
        if (b > f) next.push([f, b]);
      }
    }
    spans = next;
  }
  return spans;
}

const ARCHES = [BUS.frontAxle, BUS.rearAxle].map((z) => [z - ARCH_R, z + ARCH_R]);

function busParts() {
  const paint = []; // the bodywork, vertex-coloured
  const chrome = [];
  const glass = [];
  const inside = []; // the saloon: lining, floor, seats, the driver
  const add = (list, hex, w, h, d, x, y, z) => list.push(colorize(box(w, h, d, x, y, z), hex));
  const z0 = -HALF_L + R;
  const z1 = HALF_L - R;

  /* ----------------------------------------------------------- the sides */
  for (const side of [-1, 1]) {
    const x = side * (HALF_W - WALL / 2);
    const doors = side < 0 ? DOORS.map(([f, r]) => [r, f]) : [];
    const lower = cut([[z0, z1]], [...doors, ...ARCHES]);
    const upper = cut([[z0, z1]], doors);
    for (const [a, b] of lower) add(paint, OCHRE, WALL, ARCH_TOP - SKIRT, b - a, x, (SKIRT + ARCH_TOP) / 2, (a + b) / 2);
    for (const [a, b] of upper) {
      add(paint, OCHRE, WALL, BELT - 0.08 - ARCH_TOP, b - a, x, (ARCH_TOP + BELT - 0.08) / 2, (a + b) / 2);
      // the red belt line under the windows
      add(paint, STRIPE, WALL + 0.02, 0.08, b - a, x, BELT - 0.04, (a + b) / 2);
    }
    // the bright moulding along the flank
    for (const [a, b] of lower) chrome.push(box(0.03, 0.035, b - a, side * (HALF_W + 0.005), 0.98, (a + b) / 2));
    // round wheel arches: the panel fills the corners above the opening,
    // a black rubber lip runs round its edge
    for (const [a, b] of ARCHES) {
      const zc = (a + b) / 2;
      for (const half of [-1, 1]) {
        const shape = new THREE.Shape();
        const edge = zc + half * ARCH_R;
        shape.moveTo(edge, ARCH_Y);
        for (let k = 0; k <= 8; k++) {
          const t = (k / 8) * (Math.PI / 2);
          shape.lineTo(zc + half * ARCH_R * Math.cos(t), ARCH_Y + ARCH_R * Math.sin(t));
        }
        shape.lineTo(edge, ARCH_TOP);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: WALL, bevelEnabled: false });
        g.rotateY(-Math.PI / 2);
        g.translate(side > 0 ? HALF_W : -HALF_W + WALL, 0, 0);
        paint.push(colorize(plain(g), OCHRE));
      }
      const lip = new THREE.TorusGeometry(ARCH_R, 0.03, 4, 18, Math.PI);
      lip.rotateY(Math.PI / 2);
      lip.translate(side * (HALF_W + 0.005), ARCH_Y, zc);
      paint.push(colorize(plain(lip), RUBBER));
    }
    // cream band over the windows, uncut (the doors end under it)
    add(paint, CREAM, WALL, EAVE - WIN_TOP, z1 - z0, x, (WIN_TOP + EAVE) / 2, (z0 + z1) / 2);
    // the window band: panes in rubber, pillars between them, the top vents
    const runs = side < 0 ? cutDoors(-4.95, 4.95) : [[-4.95, 4.95]];
    for (const [a, b] of runs) {
      const n = Math.max(1, Math.round((b - a) / 1.1));
      const step = (b - a) / n;
      for (let k = 0; k <= n; k++) add(paint, CREAM, WALL + 0.01, WIN_TOP - BELT, 0.1, x, (BELT + WIN_TOP) / 2, a + k * step);
      for (let k = 0; k < n; k++) pane(a + k * step + 0.05, a + (k + 1) * step - 0.05, x, side, k);
    }
    // the gaps left at either end of the band, closed in cream
    for (const [a, b] of [
      [z0, -4.95],
      [4.95, z1],
    ]) {
      if (b - a > 0.01) add(paint, CREAM, WALL, WIN_TOP - BELT, b - a, x, (BELT + WIN_TOP) / 2, (a + b) / 2);
    }
    // the saloon's lining, inside the walls
    const xi = side * (HALF_W - WALL - 0.01);
    for (const [a, b] of cut([[z0, z1]], doors)) add(inside, LINING, 0.02, BELT - FLOOR, b - a, xi, (FLOOR + BELT) / 2, (a + b) / 2);
    add(inside, CEILING, 0.02, EAVE - WIN_TOP, z1 - z0, xi, (WIN_TOP + EAVE) / 2, (z0 + z1) / 2);
  }

  /** One side window between z = a and z = b: glass, its rubber, a vent. */
  function pane(a, b, x, side, k) {
    const yc = (BELT + WIN_TOP) / 2;
    const h = WIN_TOP - BELT;
    glass.push(box(0.012, h, b - a, x, yc, (a + b) / 2));
    const t = WALL + 0.03;
    add(paint, RUBBER, t, 0.035, b - a, x, BELT + 0.017, (a + b) / 2);
    add(paint, RUBBER, t, 0.035, b - a, x, WIN_TOP - 0.017, (a + b) / 2);
    add(paint, RUBBER, t, h, 0.03, x, yc, a + 0.015);
    add(paint, RUBBER, t, h, 0.03, x, yc, b - 0.015);
    // the fortochka: the top third slides open, in every other pane split down the middle
    const vent = WIN_TOP - 0.34;
    add(paint, 0x8e8f8c, t, 0.035, b - a, x, vent, (a + b) / 2);
    if (k % 2 === 0) add(paint, 0x8e8f8c, t, WIN_TOP - vent, 0.03, x, (vent + WIN_TOP) / 2, (a + b) / 2);
  }

  /* ------------------------------------------------- the rounded corners */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (HALF_W - R);
      const cz = sz * (HALF_L - R);
      paint.push(colorize(post(R, SKIRT, BELT - 0.08, cx, cz), OCHRE));
      paint.push(colorize(post(R + 0.01, BELT - 0.08, BELT, cx, cz), STRIPE));
      paint.push(colorize(post(R, BELT, EAVE, cx, cz), CREAM));
    }
  }

  /* ------------------------------------------------------------ the front */
  {
    const zf = HALF_L - WALL / 2;
    const w = BUS.width - 2 * R;
    add(paint, OCHRE, w, BELT - 0.08 - SKIRT, WALL, 0, (SKIRT + BELT - 0.08) / 2, zf);
    add(paint, STRIPE, w, 0.08, WALL + 0.02, 0, BELT - 0.04, zf);
    // the windscreen, in two panes split by a pillar
    const half = w / 2;
    for (const s of [-1, 1]) {
      const cx = (s * half) / 2;
      glass.push(box(half - 0.05, WIN_TOP - BELT, 0.012, cx, (BELT + WIN_TOP) / 2, zf));
      add(paint, RUBBER, half - 0.04, 0.04, WALL + 0.03, cx, BELT + 0.02, zf);
      add(paint, RUBBER, half - 0.04, 0.04, WALL + 0.03, cx, WIN_TOP - 0.02, zf);
      add(paint, RUBBER, 0.035, WIN_TOP - BELT, WALL + 0.03, s * (half - 0.02), (BELT + WIN_TOP) / 2, zf);
      // a wiper, parked
      add(paint, RUBBER, 0.6, 0.025, 0.03, cx - s * 0.05, BELT + 0.07, zf + 0.04);
    }
    add(paint, CREAM, 0.08, WIN_TOP - BELT, WALL + 0.02, 0, (BELT + WIN_TOP) / 2, zf);
    add(paint, CREAM, w, EAVE - WIN_TOP, WALL, 0, (WIN_TOP + EAVE) / 2, zf);
    // the grille, its bars, the bumper
    add(paint, DARK, 1.1, 0.36, 0.03, 0, 0.7, HALF_L + 0.005);
    for (let k = 0; k < 4; k++) chrome.push(box(1.08, 0.025, 0.02, 0, 0.57 + k * 0.085, HALF_L + 0.02));
    add(paint, GREY, BUS.width + 0.04, 0.22, 0.14, 0, 0.42, HALF_L + 0.04);
    // round headlights in chrome rims, the indicators beside them
    for (const s of [-1, 1]) {
      for (const hx of [0.74, 0.98]) {
        const rim = new THREE.CylinderGeometry(0.105, 0.105, 0.04, 16);
        rim.rotateX(Math.PI / 2);
        rim.translate(s * hx, 0.75, HALF_L + 0.0);
        chrome.push(rim);
      }
    }
    // the mirrors on their arms, out in front of the corners
    for (const s of [-1, 1]) {
      add(paint, DARK, 0.4, 0.03, 0.03, s * (HALF_W + 0.12), 2.3, HALF_L - 0.15);
      add(paint, DARK, 0.03, 0.3, 0.03, s * (HALF_W + 0.3), 2.17, HALF_L - 0.15);
      add(paint, DARK, 0.05, 0.34, 0.2, s * (HALF_W + 0.33), 1.98, HALF_L - 0.06);
    }
  }

  /* ------------------------------------------------------------- the rear */
  {
    const zr = -HALF_L + WALL / 2;
    const w = BUS.width - 2 * R;
    add(paint, OCHRE, w, BELT - 0.08 - SKIRT, WALL, 0, (SKIRT + BELT - 0.08) / 2, zr);
    add(paint, STRIPE, w, 0.08, WALL + 0.02, 0, BELT - 0.04, zr);
    // a small rear window over the back seat
    const rw = 1.3;
    const ry0 = 1.66;
    const ry1 = 2.36;
    add(paint, CREAM, w, ry0 - BELT, WALL, 0, (BELT + ry0) / 2, zr);
    add(paint, CREAM, w, EAVE - ry1, WALL, 0, (ry1 + EAVE) / 2, zr);
    for (const s of [-1, 1]) add(paint, CREAM, (w - rw) / 2, ry1 - ry0, WALL, (s * (w + rw)) / 4, (ry0 + ry1) / 2, zr);
    glass.push(box(rw, ry1 - ry0, 0.012, 0, (ry0 + ry1) / 2, zr));
    add(paint, RUBBER, rw + 0.04, 0.04, WALL + 0.03, 0, ry0, zr);
    add(paint, RUBBER, rw + 0.04, 0.04, WALL + 0.03, 0, ry1, zr);
    for (const s of [-1, 1]) add(paint, RUBBER, 0.04, ry1 - ry0, WALL + 0.03, (s * rw) / 2, (ry0 + ry1) / 2, zr);
    add(paint, GREY, BUS.width + 0.04, 0.22, 0.14, 0, 0.42, -HALF_L - 0.04);
    // the ladder up to the roof rack, on the left
    for (const lx of [0.62, 0.98]) add(paint, DARK, 0.03, EAVE - 1.0, 0.03, lx, (1.0 + EAVE) / 2, -HALF_L - 0.06);
    for (let y = 1.15; y < EAVE; y += 0.26) add(paint, DARK, 0.4, 0.025, 0.025, 0.8, y, -HALF_L - 0.06);
    // the number plate
    add(paint, 0xe9e6dc, 0.52, 0.12, 0.02, 0, 0.66, -HALF_L - 0.01);
  }

  /* ------------------------------------------------------------- the roof */
  {
    const s = new THREE.Shape();
    const hw = HALF_W;
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, 0.05);
    s.quadraticCurveTo(hw, CROWN - 0.04, hw - 0.42, CROWN);
    s.lineTo(-(hw - 0.42), CROWN);
    s.quadraticCurveTo(-hw, CROWN - 0.04, -hw, 0.05);
    s.closePath();
    const roof = new THREE.ExtrudeGeometry(s, { depth: BUS.length - 0.04, bevelEnabled: false, curveSegments: 6 });
    roof.translate(0, EAVE, -HALF_L + 0.02);
    paint.push(colorize(plain(roof), ROOF));
    // the little windows in the cove of the roof, each side
    for (const side of [-1, 1]) {
      for (let z = -4.2; z < 4.0; z += 1.1) {
        const g = box(0.012, 0.13, 0.9, 0, 0, 0);
        g.rotateZ(side * -0.85);
        g.translate(side * (HALF_W - 0.12), EAVE + 0.15, z + 0.45);
        paint.push(colorize(g, 0x2b3742));
      }
    }
    // two vent hatches on top
    for (const z of [1.6, -2.6]) add(paint, ROOF, 0.7, 0.06, 0.7, 0, EAVE + CROWN + 0.03, z);
  }

  /* ---------------------------------------- under the floor, the arches */
  // (inboard of the wheels: the tyres stand out in front of it)
  for (const [a, b] of ARCHES) add(paint, DARK, BUS.track - 0.42, ARCH_TOP - SKIRT, b - a, 0, (SKIRT + ARCH_TOP) / 2, (a + b) / 2);
  // the wheel-house roof under the floor, and its inner walls behind the tyres
  for (const [a, b] of ARCHES) add(paint, DARK, BUS.width - 2 * WALL, 0.04, b - a, 0, FLOOR - 0.08, (a + b) / 2);
  for (const [a, b] of ARCHES) for (const side of [-1, 1]) add(paint, DARK, 0.03, ARCH_TOP - SKIRT, b - a, side * (BUS.track / 2 - 0.22), (SKIRT + ARCH_TOP) / 2, (a + b) / 2);
  add(paint, DARK, 1.5, 0.5, BUS.length - 0.4, 0.3, 0.55, 0);

  /* ------------------------------------------------------------ the saloon */
  // the floor, its stepwells cut out behind the doors
  const floorZ = cutDoors(-HALF_L + 0.06, HALF_L - 0.06);
  add(inside, LINO, BUS.width - 2 * WALL - WELL, 0.06, BUS.length - 0.12, WELL / 2, FLOOR - 0.03, 0);
  for (const [a, b] of floorZ) add(inside, LINO, WELL, 0.06, b - a, -HALF_W + WALL + WELL / 2, FLOOR - 0.03, (a + b) / 2);
  // the rubber runner down the aisle
  add(inside, 0x2e2b27, 0.5, 0.01, BUS.length - 1.6, -0.12, FLOOR + 0.005, -0.4);
  // two steps up from the kerb in each doorway
  for (const [f, r] of DOORS) {
    const zc = (f + r) / 2;
    const d = f - r - 0.04;
    add(inside, 0x3d3832, WELL, 0.06, d, -HALF_W + WALL + WELL / 2, 0.33, zc);
    add(inside, 0x3d3832, WELL / 2, FLOOR - 0.36, d, -HALF_W + WALL + WELL * 0.75, (0.36 + FLOOR) / 2 - 0.13, zc);
    add(inside, LINING, 0.02, FLOOR - 0.36, d, -HALF_W + WALL + WELL + 0.01, (0.36 + FLOOR) / 2, zc);
    // the grab poles either side of the opening, and their ticket punch
    for (const z of [f - 0.08, r + 0.08]) chrome.push(post(0.02, 0.36, EAVE - 0.05, -HALF_W + WALL + WELL, z, 8));
    add(inside, 0xb0302a, 0.08, 0.16, 0.1, -HALF_W + WALL + WELL + 0.06, 1.55 + FLOOR - 0.86, r + 0.2);
  }
  // the wheel boxes, humped up through the floor
  for (const [a, b] of ARCHES) {
    for (const side of [-1, 1]) add(inside, 0x3b3731, 0.5, 0.2, b - a, side * (HALF_W - WALL - 0.25), FLOOR + 0.1, (a + b) / 2);
  }
  // the ceiling, and the lamps in two strips along it
  add(inside, CEILING, BUS.width - 2 * WALL, 0.03, BUS.length - 0.1, 0, EAVE - 0.015, 0);
  const lamps = [];
  for (const s of [-1, 1]) lamps.push(box(0.12, 0.03, 8.6, s * 0.62, EAVE - 0.04, -0.3));
  // the handrails along the ceiling, and the poles down to the seats
  for (const s of [-1, 1]) chrome.push(rail(0.018, -4.6, 3.8, s * 0.36, EAVE - 0.28));
  for (const z of [3.4, 1.8, -1.4, -3.0]) chrome.push(post(0.02, FLOOR, EAVE - 0.03, 0.34, z, 8));
  for (const z of [3.4, -2.2]) chrome.push(post(0.02, FLOOR, EAVE - 0.03, -0.58, z, 8));

  // the seats: doubles down the left, singles down the right
  const seat = (x, z, w) => {
    const y = FLOOR;
    add(inside, LEATHER, w, 0.1, 0.42, x, y + 0.42, z);
    const back = colorize(box(w, 0.52, 0.07, 0, 0.26, 0), LEATHER);
    back.rotateX(-0.12);
    back.translate(x, y + 0.47, z - 0.22);
    inside.push(back);
    add(inside, FRAME, w - 0.06, 0.37, 0.05, x, y + 0.185, z + 0.05);
    // the chrome grab bar along the top of the back
    chrome.push(new THREE.CylinderGeometry(0.015, 0.015, w - 0.04, 8).rotateZ(Math.PI / 2).translate(x, y + 0.98, z - 0.27));
  };
  for (let z = 3.2; z > -4.2; z -= 0.78) seat(HALF_W - WALL - 0.47, z, 0.86);
  for (let z = 3.2; z > -4.2; z -= 0.78) {
    if (DOORS.some(([f, r]) => z + 0.3 > r - 0.1 && z - 0.3 < f + 0.1)) continue;
    seat(-HALF_W + WALL + 0.31, z, 0.5);
  }
  // the long bench across the back
  seat(0, -HALF_L + 0.45, BUS.width - 2 * WALL - 0.06);

  /* ---------------------------------------------- the driver's cab, front left */
  {
    const cx = 0.72;
    const cz = 4.35;
    seat(cx, cz, 0.5);
    // the partition behind him, glazed above
    add(inside, LINING, HALF_W - WALL - 0.26, 0.95, 0.04, (0.26 + HALF_W - WALL) / 2, FLOOR + 0.475, 3.92);
    glass.push(box(HALF_W - WALL - 0.26, 0.8, 0.012, (0.26 + HALF_W - WALL) / 2, FLOOR + 1.35, 3.92));
    chrome.push(rail(0.015, 3.9, 3.94, 0.26, FLOOR + 1.0), post(0.015, FLOOR, FLOOR + 1.75, 0.26, 3.92, 8));
    // the engine cover between him and the front door
    add(inside, 0x5a5348, 0.6, 0.45, 1.1, -0.05, FLOOR + 0.225, 4.55);
    // the dashboard and the big flat wheel
    add(inside, 0x23262a, 1.2, 0.3, 0.3, 0.55, FLOOR + 0.6, HALF_L - 0.2);
    const wheel = new THREE.TorusGeometry(0.21, 0.022, 6, 18);
    wheel.rotateX(-Math.PI / 2 + 0.45);
    wheel.translate(cx, FLOOR + 0.86, cz + 0.45);
    inside.push(colorize(wheel, 0x1a1a1a));
    const column = post(0.03, FLOOR + 0.35, FLOOR + 0.84, cx, cz + 0.55, 6);
    inside.push(colorize(column, 0x1a1a1a));
    // the driver: grey jacket, cap, hands on the wheel
    const jacket = 0x39404a;
    add(inside, jacket, 0.44, 0.58, 0.26, cx, FLOOR + 0.82, cz - 0.08);
    add(inside, 0x2a2c30, 0.4, 0.14, 0.42, cx, FLOOR + 0.5, cz + 0.12);
    for (const s of [-1, 1]) {
      const arm = colorize(box(0.09, 0.09, 0.42, 0, 0, 0), jacket);
      arm.rotateX(0.5);
      arm.translate(cx + s * 0.2, FLOOR + 0.92, cz + 0.2);
      inside.push(arm);
    }
    const head = new THREE.SphereGeometry(0.11, 10, 8);
    head.translate(cx, FLOOR + 1.26, cz - 0.06);
    inside.push(colorize(head, 0xd5ad92));
    inside.push(colorize(post(0.115, FLOOR + 1.32, FLOOR + 1.4, cx, cz - 0.06, 10), 0x2b2d31));
    add(inside, 0x2b2d31, 0.2, 0.02, 0.12, cx, FLOOR + 1.33, cz + 0.06);
  }

  // the route board over the windscreen, and a smaller one by the front door
  const board = mergeGeometries([box(1.6, 0.26, 0.03, 0, 2.62, HALF_L + 0.01), box(0.02, 0.2, 0.9, -(HALF_W + 0.01), 2.62, 3.2)].map(plain), false);

  // lamps: headlights, the indicators, red tail lamps
  const lights = [];
  for (const s of [-1, 1]) {
    for (const hx of [0.74, 0.98]) {
      const head = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 14);
      head.rotateX(Math.PI / 2);
      head.translate(s * hx, 0.75, HALF_L + 0.015);
      lights.push(colorize(head, 0xfff3d6));
    }
    lights.push(colorize(box(0.1, 0.07, 0.03, s * 1.1, 0.98, HALF_L + 0.01), 0xffa020));
    lights.push(colorize(box(0.16, 0.22, 0.03, s * 0.98, 0.95, -HALF_L - 0.01), 0xff2a18));
    lights.push(colorize(box(0.16, 0.08, 0.03, s * 0.98, 1.12, -HALF_L - 0.01), 0xffa020));
  }

  const snow = box(BUS.width - 0.9, 0.1, BUS.length - 0.6, 0, EAVE + CROWN + 0.05, 0);

  // a wheel: tyre, painted disc, hub, spinning about local x
  const tyre = new THREE.CylinderGeometry(BUS.wheelR, BUS.wheelR, 0.34, 20);
  tyre.rotateZ(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(0.3, 0.3, 0.36, 14);
  disc.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
  hub.rotateZ(Math.PI / 2);
  const wheel = mergeGeometries([colorize(tyre, 0x1b1c1d), colorize(disc, 0x8a2d24), colorize(hub, 0x9a968c), colorize(box(0.41, 0.05, 0.3, 0, 0, 0), 0x55534c)].map(plain), false);

  // a door leaf: ochre panel below, glass above, in a rubber-edged frame,
  // hinged on its z = 0 edge
  const leaf = (sign) => {
    const w = 0.47;
    const zc = (sign * w) / 2;
    const low = 0.62;
    const parts = [
      colorize(box(0.05, low, w, 0, low / 2, zc), OCHRE),
      colorize(box(0.06, 0.06, w, 0, low, zc), CREAM),
      colorize(box(0.06, 0.06, w, 0, LEAF_H - 0.03, zc), CREAM),
      colorize(box(0.06, LEAF_H, 0.05, 0, LEAF_H / 2, sign * 0.025), CREAM),
      colorize(box(0.07, LEAF_H, 0.04, 0, LEAF_H / 2, sign * (w - 0.02)), RUBBER),
    ];
    return {
      frame: mergeGeometries(parts.map(plain), false),
      glass: box(0.012, LEAF_H - low - 0.09, w - 0.08, 0, (low + LEAF_H) / 2, zc),
    };
  };

  const merge = (list) => mergeGeometries(list.map(plain), false);
  return {
    body: merge(paint),
    chrome: merge(chrome),
    glass: merge(glass),
    inside: merge(inside),
    ceilingLamps: merge(lamps),
    lamps: merge(lights),
    board,
    snow,
    wheel,
    leafFront: leaf(-1),
    leafRear: leaf(1),
  };
}

function routeBoard() {
  return makeSignTexture(512, 84, (c, W, H) => {
    c.fillStyle = '#16191b';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#ffd98a';
    c.font = 'bold 62px "Arial Narrow", Arial, sans-serif';
    c.fillText('31', W * 0.13, H * 0.54);
    c.font = 'bold 40px "Arial Narrow", Arial, sans-serif';
    c.fillText('МИКРОРАЙОН', W * 0.6, H * 0.54);
  });
}

export class Bus {
  constructor(world, snowMat, { x, z, heading, id }) {
    this.world = world;
    this.id = id;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.spin = 0;
    this.pitch = 0;
    this.roll = 0;
    this.doors = 0; // 0 shut … 1 folded open
    this.isBus = true;

    const parts = busParts();
    this.root = new THREE.Group();
    this.root.name = `bus-${id}`;
    this.root.userData.dynamic = true;
    this.body = new THREE.Group();
    this.root.add(this.body);
    const add = (geo, mat, cast = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    add(parts.body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.22 }));
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.32, metalness: 0.75 });
    add(parts.chrome, chromeMat, false);
    // the saloon: it glows a little warm when its lamps are on
    this.insideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, emissive: 0xffe2b0, emissiveIntensity: 0 });
    // (the glow takes each surface's own colour: red seats stay red)
    this.insideMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
    };
    add(parts.inside, this.insideMat, false);
    this.ceilingMat = new THREE.MeshBasicMaterial({ color: 0x8a8678 });
    add(parts.ceilingLamps, this.ceilingMat, false);
    // real glass: you see the seats, and through to the other side
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x9fb2bc, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0.3, depthWrite: false });
    const glass = add(parts.glass, this.glassMat, false);
    glass.renderOrder = 2;
    this.lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.lamps = add(parts.lamps, this.lampMat, false);
    const tex = routeBoard();
    this.boardMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
    add(parts.board, this.boardMat, false);
    this.snow = add(parts.snow, snowMat, false);

    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    // folding doors: two leaves per opening, hinged on the door posts
    this.leaves = [];
    for (const [f, r] of DOORS) {
      for (const [z, geo, sign] of [
        [f, parts.leafFront, 1],
        [r, parts.leafRear, -1],
      ]) {
        const leaf = new THREE.Group();
        leaf.position.set(-(HALF_W - 0.02), LEAF_Y, z);
        const frame = new THREE.Mesh(geo.frame, leafMat);
        frame.castShadow = true;
        const pane = new THREE.Mesh(geo.glass, this.glassMat);
        pane.renderOrder = 2;
        leaf.add(frame, pane);
        this.body.add(leaf);
        this.leaves.push({ mesh: leaf, sign });
      }
    }

    this.wheels = new THREE.InstancedMesh(parts.wheel, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), 4);
    this.wheels.castShadow = false;
    this.wheels.frustumCulled = false;
    this.root.add(this.wheels);
    this.wheelPos = [
      [BUS.track / 2, BUS.frontAxle, true],
      [-BUS.track / 2, BUS.frontAxle, true],
      [BUS.track / 2, BUS.rearAxle, false],
      [-BUS.track / 2, BUS.rearAxle, false],
    ];

    // live-only collider, parked far away until the traffic first moves it
    this.collider = { minX: 1e6, maxX: 1e6, minZ: 1e6, maxZ: 1e6, car: this };
    world.colliders.push(this.collider);
    this.setLights(0);
    this.sync();
  }

  updateCollider() {
    const s = Math.abs(Math.sin(this.heading));
    const c = Math.abs(Math.cos(this.heading));
    const hw = HALF_W * c + HALF_L * s + 0.08;
    const hl = HALF_W * s + HALF_L * c + 0.08;
    const col = this.collider;
    col.minX = this.x - hw;
    col.maxX = this.x + hw;
    col.minZ = this.z - hl;
    col.maxZ = this.z + hl;
  }

  /** Distance from a ground point to the bodywork (0 inside). */
  distanceTo(x, z) {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const dx = x - this.x;
    const dz = z - this.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.hypot(lx - clamp(lx, -HALF_W, HALF_W), lz - clamp(lz, -HALF_L, HALF_L));
  }

  overlapsCircle(x, z, r) {
    return this.distanceTo(x, z) < r;
  }

  escapes(x, z, r) {
    return escapesFromBox(this.x, this.z, this.heading, HALF_W, HALF_L, x, z, r);
  }

  /** A point in the bus's own frame (x right-to-left, y up, z nose), in the world. */
  toWorld(local, out = new THREE.Vector3()) {
    this.body.updateWorldMatrix(true, false);
    return this.body.localToWorld(out.copy(local));
  }

  /** 0 = day, 1 = night: headlights, saloon lights and the route board. */
  setLights(level) {
    this.lampMat.color.setScalar(0.32 + level * 1.6);
    this.insideMat.emissiveIntensity = 0.06 + level * 0.55;
    this.ceilingMat.color.setRGB(0.54 + level * 0.46, 0.53 + level * 0.43, 0.48 + level * 0.32);
    this.boardMat.emissiveIntensity = 0.25 + level * 0.9;
  }

  sync() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
    this.body.rotation.set(this.pitch, 0, this.roll);
    for (const { mesh, sign } of this.leaves) mesh.rotation.y = sign * this.doors * 1.45;
    for (let i = 0; i < 4; i++) {
      const [x, z, front] = this.wheelPos[i];
      _dummy.position.set(x, BUS.wheelR, z);
      _dummy.rotation.set(this.spin, front ? this.steer : 0, 0, 'YXZ');
      _dummy.updateMatrix();
      this.wheels.setMatrixAt(i, _dummy.matrix);
    }
    this.wheels.instanceMatrix.needsUpdate = true;
  }
}
