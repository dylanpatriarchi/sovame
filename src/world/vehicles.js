// Cars of the district: Zhiguli-like sedans parked in the courtyards and at
// the curb. Every one of them can be driven: a light arcade model (bicycle
// steering, surface grip, slides on snow and ice) with the parked footprint
// turned into a moving collider while the car is under way.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, TAU } from '../util.js';
import { PARKED } from './town.js';

/* ---------------------------------------------------------- dimensions */

const LENGTH = 4.07;
const WIDTH = 1.61;
const WHEELBASE = 2.42;
const TRACK = 1.35;
const WHEEL_R = 0.3;
const AXLE_Z = WHEELBASE / 2;
/** Driver's eye in car-local space (+z forward, +x is the driver's side). */
export const DRIVER_EYE = new THREE.Vector3(0.36, 1.14, -0.08);

/** Physical constants of the model (SI, per second). */
const CAR = {
  maxSpeed: 23, // ~83 km/h
  reverseSpeed: 5,
  accel: 5,
  brake: 9,
  drag: 0.0045,
  rolling: 0.35,
  maxSteer: 0.6,
  steerRate: 3.4,
  // collision circles along the car axis (local z) and their radius
  circles: [-1.25, 0, 1.25],
  radius: 0.84,
};

/** Lateral grip per surface: snow and ice let the rear step out. */
const GRIP = { asphalt: 1, stone: 0.85, snow: 0.55, ice: 0.18, wood: 0.8 };

/* ---------------------------------------------------------- geometry */

function colorize(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const color = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const plain = (geo) => (geo.index ? geo.toNonIndexed() : geo);

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** A thin bar between two points (pillars, wipers). */
function bar(a, b, w, d) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.BoxGeometry(w, dir.length(), d);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Side profile (u = car z, v = height) extruded across the car's width. */
function profile(points, width, bevel = 0.035, arches = false) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  if (arches) {
    // bottom edge from the rear bumper forward, cut by the two wheel arches
    const r = WHEEL_R + 0.07;
    const y = 0.3;
    shape.lineTo(-AXLE_Z - r, y);
    shape.absarc(-AXLE_Z, y, r, Math.PI, 0, true);
    shape.lineTo(AXLE_Z - r, y);
    shape.absarc(AXLE_Z, y, r, Math.PI, 0, true);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  // shape x → car z, extrusion → car x (centered)
  geo.rotateY(-Math.PI / 2);
  geo.translate((width - bevel * 2) / 2, 0, 0);
  return plain(geo);
}

/** A flat four-cornered panel (a pane of glass, a slanted skin). */
function quad(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

/** A box tilted about x, then set down: decks, seat backs, the dash top. */
function tilted(w, h, d, x, y, z, rx) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}

/** A disc or a short drum facing along z (dials, lamps, knobs). */
function drum(r, len, x, y, z, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/**
 * Shared geometry of the sedan, built once and cloned per car. It is a real
 * shell: skins, decks and a floor round an open cabin, glass as thin panes,
 * and inside everything a driver has in front of them.
 *   body  — painted in the car's colour
 *   trim  — chrome, rubber, lamp housings (glossy)
 *   cabin — seats, dash, door cards, carpet (matt)
 */
function sedanParts() {
  const halfL = LENGTH / 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const HW = WIDTH / 2; // outer half width at the waist
  const IN = HW - 0.05; // inner face of the side skins
  const WAIST = 0.93;
  const ROOF = 1.37;
  /** half width of the greenhouse at the waist and at the roof (tumblehome) */
  const GW = 0.72;
  const GR = 0.6;
  const Z_COWL = 0.9; // foot of the windshield
  const Z_A = 0.32; // top of the windshield
  const Z_B = -0.17;
  const Z_C = -0.76; // top of the rear window
  const Z_DECK = -1.14; // foot of the rear window

  /* ---- painted shell */
  const body = [];
  const skin = profile(
    [
      [halfL - 0.03, 0.34],
      [halfL, 0.7],
      [halfL - 0.09, 0.86],
      [Z_COWL, WAIST],
      [Z_DECK, WAIST],
      [-halfL + 0.1, 0.88],
      [-halfL, 0.74],
      [-halfL + 0.04, 0.34],
    ],
    0.05,
    0.012,
    true,
  );
  for (const s of [-1, 1]) body.push(skin.clone().translate(s * (HW - 0.025), 0, 0));
  // hood and trunk lid follow the fall of the wings
  const hoodLen = halfL - 0.09 - Z_COWL;
  body.push(tilted(IN * 2, 0.04, hoodLen + 0.02, 0, (0.86 + WAIST) / 2 - 0.015, Z_COWL + hoodLen / 2, Math.atan2(WAIST - 0.86, hoodLen)));
  const lidLen = halfL - 0.1 + Z_DECK;
  body.push(tilted(IN * 2, 0.04, lidLen + 0.02, 0, (0.88 + WAIST) / 2 - 0.015, Z_DECK - lidLen / 2, -Math.atan2(WAIST - 0.88, lidLen)));
  // nose and tail panels, the valances under the bumpers
  body.push(box(IN * 2, 0.5, 0.04, 0, 0.6, halfL - 0.045));
  body.push(box(IN * 2, 0.5, 0.04, 0, 0.6, -halfL + 0.05));
  // cowl and rear deck: the ledges the two big panes stand on
  body.push(box(IN * 2, 0.03, 0.12, 0, WAIST - 0.005, Z_COWL + 0.02));
  body.push(box(IN * 2, 0.03, 0.1, 0, WAIST - 0.005, Z_DECK - 0.02));
  // shoulders: the step in from the door skins to the foot of the glass
  for (const s of [-1, 1]) body.push(box(HW - GW + 0.03, 0.035, Z_COWL - Z_DECK, s * (GW + (HW - GW) / 2 - 0.005), WAIST - 0.01, (Z_COWL + Z_DECK) / 2));
  // greenhouse: pillars leaning in, roof rails, the roof itself
  for (const s of [-1, 1]) {
    body.push(bar(V(s * GW, WAIST, Z_COWL - 0.02), V(s * GR, ROOF - 0.02, Z_A), 0.055, 0.075)); // A
    body.push(bar(V(s * GW, WAIST, Z_B), V(s * GR, ROOF - 0.02, Z_B), 0.05, 0.085)); // B
    body.push(bar(V(s * GW, WAIST, Z_DECK + 0.06), V(s * GR, ROOF - 0.02, Z_C - 0.02), 0.055, 0.2)); // C
    body.push(box(0.06, 0.05, Z_A - Z_C + 0.1, s * GR, ROOF - 0.015, (Z_A + Z_C) / 2)); // rail
  }
  body.push(box(GR * 2, 0.035, Z_A - Z_C + 0.1, 0, ROOF, (Z_A + Z_C) / 2));
  body.push(box(GR * 2 - 0.2, 0.02, Z_A - Z_C - 0.1, 0, ROOF + 0.022, (Z_A + Z_C) / 2)); // the roof's slight crown

  /* ---- glass: thin panes between the pillars */
  const glass = [];
  glass.push(quad([-GW + 0.03, WAIST, Z_COWL - 0.02], [GW - 0.03, WAIST, Z_COWL - 0.02], [GR - 0.03, ROOF - 0.03, Z_A], [-GR + 0.03, ROOF - 0.03, Z_A]));
  glass.push(quad([GW - 0.03, WAIST, Z_DECK + 0.02], [-GW + 0.03, WAIST, Z_DECK + 0.02], [-GR + 0.03, ROOF - 0.03, Z_C], [GR - 0.03, ROOF - 0.03, Z_C]));
  for (const s of [-1, 1]) {
    const a = s * (GW + 0.002);
    const b = s * (GR + 0.002);
    const front = [[a, WAIST, Z_B + 0.04], [a, WAIST, Z_COWL - 0.07], [b, ROOF - 0.04, Z_A - 0.02], [b, ROOF - 0.04, Z_B + 0.04]];
    const rear = [[a, WAIST, Z_DECK + 0.14], [a, WAIST, Z_B - 0.04], [b, ROOF - 0.04, Z_B - 0.04], [b, ROOF - 0.04, Z_C - 0.06]];
    for (const p of [front, rear]) glass.push(s < 0 ? quad(...p) : quad(p[1], p[0], p[3], p[2]));
  }

  /* ---- chrome, rubber, lamp housings */
  const trim = [];
  const CHROME = 0xc4c8cc;
  const BLACK = 0x121416;
  const DARK = 0x24262a;
  const PLATE = 0xe2e2da;
  for (const dir of [1, -1]) {
    const z = dir * (halfL + 0.055);
    trim.push(colorize(box(WIDTH + 0.02, 0.085, 0.07, 0, 0.44, z), CHROME)); // bumper blade
    for (const s of [-1, 1]) {
      trim.push(colorize(box(0.07, 0.085, 0.2, s * (HW + 0.0), 0.44, z - dir * 0.09), CHROME)); // wrap-round ends
      trim.push(colorize(box(0.08, 0.17, 0.09, s * 0.44, 0.45, z + dir * 0.012), BLACK)); // rubber overriders
    }
    // number plate: white, a black edge, a row of dark characters
    trim.push(colorize(box(0.5, 0.115, 0.012, 0, 0.6 - (dir < 0 ? 0.0 : 0.26), z + dir * (dir < 0 ? -0.04 : 0.04)), PLATE));
    for (let k = 0; k < 6; k++) trim.push(colorize(box(0.045, 0.06, 0.004, -0.19 + k * 0.075 + (k > 0 && k < 4 ? 0.01 : 0), 0.6 - (dir < 0 ? 0.0 : 0.26), z + dir * (dir < 0 ? -0.033 : 0.047)), BLACK));
  }
  // the face: a black grille panel edge to edge, four round lamps in chrome
  // bezels, a chrome surround, the badge
  const zf = halfL - 0.02;
  trim.push(colorize(box(1.46, 0.2, 0.02, 0, 0.67, zf), 0x1b1d20));
  for (let k = 0; k < 5; k++) trim.push(colorize(box(0.78, 0.01, 0.025, 0, 0.6 + k * 0.035, zf + 0.004), 0x4a4d52));
  trim.push(colorize(box(1.5, 0.018, 0.035, 0, 0.778, zf), CHROME));
  trim.push(colorize(box(1.5, 0.018, 0.035, 0, 0.562, zf), CHROME));
  trim.push(colorize(box(0.08, 0.06, 0.03, 0, 0.67, zf + 0.008), 0x8a1f1a));
  for (const s of [-1, 1]) {
    // amber indicators at the corners, under the lamps
    trim.push(colorize(box(0.17, 0.05, 0.02, s * 0.6, 0.53, zf + 0.002), 0xd88a2a));
    // door seams, handles, the rubbing strip along the flank
    for (const z of [Z_COWL - 0.04, Z_B, Z_DECK + 0.12]) trim.push(colorize(box(0.006, 0.56, 0.012, s * (HW + 0.002), 0.64, z), BLACK));
    for (const z of [Z_B + 0.14, Z_DECK + 0.28]) trim.push(colorize(box(0.025, 0.028, 0.13, s * (HW + 0.012), 0.83, z), CHROME));
    trim.push(colorize(box(0.014, 0.022, 3.2, s * (HW + 0.006), 0.63, 0.0), CHROME));
    trim.push(colorize(box(0.012, 0.05, 2.5, s * (HW + 0.004), 0.4, 0), BLACK)); // sill
    // chrome round the side glass and along the gutter
    trim.push(colorize(box(0.016, 0.018, Z_COWL - Z_DECK - 0.1, s * (GW + 0.012), WAIST + 0.012, (Z_COWL + Z_DECK) / 2), CHROME));
    trim.push(colorize(box(0.02, 0.016, Z_A - Z_C + 0.14, s * (GR + 0.035), ROOF - 0.03, (Z_A + Z_C) / 2), CHROME));
    // mud flaps behind the wheels
    for (const z of [AXLE_Z - 0.4, -AXLE_Z - 0.4]) trim.push(colorize(box(0.22, 0.2, 0.012, s * (HW - 0.14), 0.26, z), BLACK));
    // wipers parked on the glass
    trim.push(colorize(bar(V(s * 0.08 + 0.2, WAIST + 0.03, Z_COWL - 0.03), V(s * 0.08 - 0.22, WAIST + 0.07, Z_COWL - 0.09), 0.016, 0.016), BLACK));
  }
  // one door mirror, on the driver's side, as they came
  trim.push(colorize(box(0.1, 0.07, 0.03, HW + 0.07, 1.02, Z_COWL - 0.2), CHROME));
  trim.push(colorize(bar(V(HW - 0.02, 0.97, Z_COWL - 0.18), V(HW + 0.07, 1.0, Z_COWL - 0.2), 0.016, 0.016), CHROME));
  // aerial on the wing, filler cap, exhaust, boot lock
  trim.push(colorize(bar(V(-HW + 0.1, 0.9, 1.3), V(-HW + 0.12, 1.55, 1.18), 0.008, 0.008), CHROME));
  trim.push(colorize(drum(0.05, 0.012, 0, 0, 0, 10).rotateY(Math.PI / 2).translate(-HW - 0.002, 0.78, -1.5), DARK));
  trim.push(colorize(drum(0.025, 0.16, -0.42, 0.27, -halfL - 0.02, 8), 0x4a4640));
  trim.push(colorize(drum(0.018, 0.012, 0, 0.78, -halfL + 0.025, 8), CHROME));
  // the underside: a pan from bumper to bumper and liners in the arches, so
  // the shell never shows daylight where a real car has none
  trim.push(colorize(box(IN * 2, 0.03, LENGTH - 0.16, 0, 0.3, 0), BLACK));
  for (const s of [-1, 1]) {
    for (const z of [AXLE_Z, -AXLE_Z]) {
      trim.push(colorize(box(0.03, 0.46, 0.84, s * (HW - 0.33), 0.53, z), BLACK));
      trim.push(colorize(box(0.3, 0.03, 0.84, s * (HW - 0.19), 0.76, z), BLACK));
      for (const e of [-1, 1]) trim.push(colorize(box(0.3, 0.46, 0.03, s * (HW - 0.19), 0.53, z + e * 0.42), BLACK));
    }
  }
  // bulkheads closing the engine bay and the boot off from the cabin
  trim.push(colorize(box(IN * 2, 0.62, 0.03, 0, 0.62, Z_COWL + 0.02), BLACK));
  trim.push(colorize(box(IN * 2, 0.62, 0.03, 0, 0.62, Z_DECK - 0.02), BLACK));

  /* ---- cabin (matt) */
  const cabin = [];
  const VINYL = 0x5a4232; // seats and door cards: dark brown leatherette
  const VINYL2 = 0x73563f;
  const CARPET = 0x2e2c2a;
  const DASH = 0x2c2e32;
  const LINER = 0xb4ad9c;
  const DX = DRIVER_EYE.x;
  cabin.push(colorize(box(IN * 2, 0.03, Z_COWL - Z_DECK, 0, 0.33, (Z_COWL + Z_DECK) / 2), CARPET));
  cabin.push(colorize(box(0.2, 0.13, 1.5, 0, 0.4, 0.1), CARPET)); // transmission tunnel
  cabin.push(colorize(box(GR * 2 - 0.06, 0.012, Z_A - Z_C, 0, ROOF - 0.024, (Z_A + Z_C) / 2), LINER)); // headlining
  for (const s of [-1, 1]) {
    // door cards with an armrest, a pull and a window winder
    cabin.push(colorize(box(0.03, 0.58, Z_COWL - Z_DECK - 0.04, s * (IN - 0.012), 0.63, (Z_COWL + Z_DECK) / 2), VINYL));
    cabin.push(colorize(box(0.035, 0.1, Z_COWL - Z_DECK - 0.1, s * (IN - 0.016), 0.87, (Z_COWL + Z_DECK) / 2), DASH));
    for (const z of [0.3, -0.62]) {
      cabin.push(colorize(box(0.07, 0.05, 0.34, s * (IN - 0.05), 0.66, z), VINYL2));
      cabin.push(colorize(drum(0.022, 0.03, 0, 0, 0, 8).rotateY(Math.PI / 2).translate(s * (IN - 0.04), 0.74, z + 0.26), CHROME));
    }
    // front seat: cushion, raked back, head restraint on two stems
    const x = s * 0.36;
    cabin.push(colorize(tilted(0.5, 0.14, 0.5, x, 0.5, -0.12, 0.08), VINYL));
    cabin.push(colorize(tilted(0.5, 0.6, 0.1, x, 0.86, -0.43, -0.2), VINYL));
    cabin.push(colorize(tilted(0.4, 0.5, 0.02, x, 0.86, -0.375, -0.2), VINYL2)); // lighter centre panel
    cabin.push(colorize(box(0.26, 0.15, 0.09, x, 1.24, -0.5), VINYL));
    for (const e of [-0.07, 0.07]) cabin.push(colorize(box(0.012, 0.1, 0.012, x + e, 1.15, -0.5), CHROME));
    cabin.push(colorize(tilted(0.34, 0.012, 0.14, s * 0.3, ROOF - 0.05, Z_A - 0.09, 0.25), LINER)); // sun visor
  }
  // rear bench and the parcel shelf behind it
  cabin.push(colorize(tilted(IN * 2 - 0.1, 0.15, 0.5, 0, 0.5, -0.84, 0.08), VINYL));
  cabin.push(colorize(tilted(IN * 2 - 0.1, 0.5, 0.1, 0, 0.78, -1.08, -0.22), VINYL));
  cabin.push(colorize(box(GW * 2, 0.02, 0.16, 0, WAIST - 0.03, Z_DECK + 0.03), DASH));
  // the dash: a deep padded top, a flat face with the binnacle on the
  // driver's side, the radio and heater in the middle, a glovebox lid
  const ZD = 0.56; // the face you look at
  cabin.push(colorize(box(IN * 2, 0.05, Z_COWL - ZD + 0.04, 0, 0.955, (Z_COWL + ZD) / 2), DASH));
  cabin.push(colorize(box(IN * 2, 0.24, 0.03, 0, 0.83, ZD), 0x4a3d30));
  cabin.push(colorize(box(IN * 2, 0.05, 0.1, 0, 0.7, ZD + 0.03), DASH)); // lower rail
  cabin.push(colorize(box(0.48, 0.17, 0.02, DX, 0.845, ZD - 0.02), 0x0c0d0e)); // binnacle panel
  cabin.push(colorize(tilted(0.52, 0.03, 0.12, DX, 0.945, ZD - 0.05, -0.12), DASH)); // its hood
  for (const [ox, r] of [[-0.11, 0.062], [0.11, 0.062]]) {
    cabin.push(colorize(drum(r, 0.008, DX + ox, 0.85, ZD - 0.032), 0xd8d6cc)); // dial faces
    cabin.push(colorize(drum(r + 0.008, 0.006, DX + ox, 0.85, ZD - 0.028), CHROME));
    cabin.push(colorize(box(0.006, r * 0.85, 0.004, DX + ox + 0.012, 0.865, ZD - 0.038).rotateZ(0), 0xb5301f)); // needle
  }
  for (const ox of [-0.2, 0, 0.2]) cabin.push(colorize(drum(0.022, 0.008, DX + ox, 0.785, ZD - 0.032, 10), 0xd8d6cc)); // small gauges
  // radio: a chrome-edged face, a tuning scale, two knobs
  cabin.push(colorize(box(0.24, 0.085, 0.02, 0, 0.86, ZD - 0.02), CHROME));
  cabin.push(colorize(box(0.13, 0.03, 0.006, 0, 0.87, ZD - 0.032), 0xe6d9a8));
  for (const ox of [-0.095, 0.095]) cabin.push(colorize(drum(0.016, 0.03, ox, 0.86, ZD - 0.04, 10), BLACK));
  for (let k = 0; k < 3; k++) cabin.push(colorize(box(0.02, 0.012, 0.03, -0.06 + k * 0.06, 0.775, ZD - 0.03), CHROME)); // heater levers
  cabin.push(colorize(box(0.42, 0.13, 0.008, -DX - 0.04, 0.83, ZD - 0.02), 0x3d3228)); // glovebox lid
  cabin.push(colorize(drum(0.012, 0.012, -DX - 0.04, 0.875, ZD - 0.028, 8), CHROME));
  for (const ox of [-0.5, 0.5]) cabin.push(colorize(box(0.12, 0.03, 0.02, ox, 0.925, ZD - 0.012), 0x0a0b0c)); // vents
  // wheel: thin rim, two spokes, a horn pad, on a raked column with a stalk
  {
    const rake = -0.42;
    const hub = V(DX, 0.9, 0.36);
    const rim = new THREE.TorusGeometry(0.185, 0.013, 8, 28);
    rim.rotateX(rake);
    rim.translate(hub.x, hub.y, hub.z);
    cabin.push(colorize(rim, 0x1d1e21));
    for (const a of [0.25, Math.PI - 0.25]) {
      const spoke = new THREE.BoxGeometry(0.18, 0.022, 0.012);
      spoke.translate(0.09, 0, 0);
      spoke.rotateZ(a + Math.PI);
      spoke.rotateX(rake);
      spoke.translate(hub.x, hub.y, hub.z);
      cabin.push(colorize(spoke, 0x1d1e21));
    }
    const pad = new THREE.CylinderGeometry(0.05, 0.055, 0.03, 12);
    pad.rotateX(Math.PI / 2 + rake);
    pad.translate(hub.x, hub.y, hub.z);
    cabin.push(colorize(pad, 0x2a2b2e));
    cabin.push(colorize(bar(hub, V(DX, 0.79, ZD + 0.04), 0.045, 0.045), DASH));
    cabin.push(colorize(bar(V(DX - 0.02, 0.87, 0.43), V(DX - 0.2, 0.9, 0.4), 0.012, 0.012), BLACK));
  }
  // gear lever with its knob and gaiter, handbrake between the seats
  cabin.push(colorize(bar(V(0, 0.46, 0.22), V(0.02, 0.72, 0.14), 0.014, 0.014), CHROME));
  cabin.push(colorize(new THREE.SphereGeometry(0.026, 8, 6).translate(0.02, 0.73, 0.137), BLACK));
  cabin.push(colorize(box(0.09, 0.05, 0.09, 0, 0.48, 0.22), DASH));
  cabin.push(colorize(bar(V(0, 0.47, -0.2), V(0, 0.56, 0.02), 0.022, 0.022), BLACK));
  // pedals, because the eye goes looking for them
  for (const [ox, w] of [[-0.15, 0.06], [-0.03, 0.06], [0.1, 0.05]]) cabin.push(colorize(tilted(w, 0.08, 0.012, DX + ox, 0.45, 0.8, 0.5), BLACK));
  // rear-view mirror on the header
  cabin.push(colorize(box(0.2, 0.055, 0.02, 0, ROOF - 0.1, Z_A - 0.06), DASH));
  cabin.push(colorize(box(0.18, 0.04, 0.004, 0, ROOF - 0.1, Z_A - 0.072), 0x9aa6b0));
  cabin.push(colorize(box(0.016, 0.06, 0.016, 0, ROOF - 0.055, Z_A - 0.05), DASH));

  /* ---- lamps (their own emissive mesh; unlit copies sit in the trim) */
  const lamps = [];
  for (const s of [-1, 1]) {
    for (const ox of [0.47, 0.64]) {
      const head = drum(0.066, 0.03, s * ox, 0.67, zf + 0.012);
      lamps.push(colorize(head, 0xfff3d6));
      trim.push(colorize(head.clone().translate(0, 0, -0.004), 0xa8a595));
      const ring = new THREE.TorusGeometry(0.07, 0.009, 5, 16);
      ring.translate(s * ox, 0.67, zf + 0.026);
      trim.push(colorize(ring, CHROME));
    }
    // tail cluster: red outboard, amber, a white reversing lamp inboard
    const zt = -halfL + 0.026;
    for (const [ox, w, lit, dim] of [[0.66, 0.16, 0xff2a18, 0x6a1a12], [0.52, 0.1, 0xff8a20, 0x7a4a16], [0.43, 0.06, 0xfff0e0, 0x8a8880]]) {
      lamps.push(colorize(box(w, 0.13, 0.02, s * ox, 0.68, zt - 0.006), lit === 0xfff0e0 ? 0x2a2826 : lit));
      trim.push(colorize(box(w, 0.13, 0.02, s * ox, 0.68, zt), dim));
    }
    trim.push(colorize(box(0.36, 0.15, 0.012, s * 0.58, 0.68, zt + 0.012), CHROME));
  }

  // snow load: a pillow on the roof, drifts on the hood and the boot lid
  const snow = [];
  {
    const roof = new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2);
    roof.scale(GR * 0.98, 0.09, (Z_A - Z_C) / 2 + 0.02);
    roof.translate(0, ROOF + 0.02, (Z_A + Z_C) / 2);
    snow.push(plain(roof));
    snow.push(tilted(IN * 2 - 0.12, 0.045, hoodLen - 0.2, 0, 0.92, Z_COWL + hoodLen / 2 + 0.06, Math.atan2(WAIST - 0.86, hoodLen)));
    snow.push(tilted(IN * 2 - 0.14, 0.045, lidLen - 0.14, 0, 0.93, Z_DECK - lidLen / 2 - 0.02, -Math.atan2(WAIST - 0.88, lidLen)));
  }

  // wheel (axis along x): a rounded tyre, a dished steel rim, a chrome cap
  const wheelParts = [];
  {
    const tyre = new THREE.TorusGeometry(WHEEL_R - 0.085, 0.085, 7, 16);
    tyre.rotateY(Math.PI / 2);
    tyre.scale(1.08, 1, 1);
    wheelParts.push(colorize(tyre, 0x121314));
    const rim = new THREE.CylinderGeometry(0.175, 0.175, 0.15, 12);
    rim.rotateZ(Math.PI / 2);
    wheelParts.push(colorize(rim, 0x55595c));
    const lip = new THREE.TorusGeometry(0.172, 0.012, 4, 14);
    lip.rotateY(Math.PI / 2);
    for (const s of [-1, 1]) wheelParts.push(colorize(lip.clone().translate(s * 0.075, 0, 0), CHROME));
    const cap = new THREE.SphereGeometry(0.105, 8, 5);
    cap.scale(0.9, 1, 1);
    wheelParts.push(colorize(cap, CHROME));
    // slots in the rim so the spin reads
    for (let k = 0; k < 6; k++) {
      const slot = box(0.16, 0.03, 0.045, 0, 0.135, 0);
      slot.rotateX((k / 6) * TAU);
      wheelParts.push(colorize(slot, 0x1a1b1c));
    }
  }

  const merge = (list) => mergeGeometries(list.map(plain), false);
  return { body: merge(body), glass: merge(glass), trim: merge(trim), cabin: merge(cabin), lamps: merge(lamps), snow: merge(snow), wheel: merge(wheelParts) };
}

/** The UAZ-452 van, the "loaf": one tall rounded box on the same running
 * gear. Reuses the sedan's wheel. */
const VAN_EYE = new THREE.Vector3(0.36, 1.52, 0.86);

function vanParts(wheel) {
  const halfL = LENGTH / 2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const body = profile(
    [
      [halfL - 0.03, 0.42],
      [halfL, 0.98],
      [halfL - 0.05, 1.12],
      [halfL - 0.42, 1.84],
      [halfL - 0.7, 1.95],
      [-halfL + 0.16, 1.95],
      [-halfL, 1.82],
      [-halfL, 0.42],
    ],
    WIDTH + 0.12,
    0.06,
    true
  );
  const W = (WIDTH + 0.12) / 2;
  // glass: panels standing just proud of the bodywork
  // single-sided, like the sedan's: tinted from outside, clear from the seat
  const glassParts = [];
  const pane = (w, h, x, y, z, ry, rx = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (rx) g.rotateX(rx);
    g.rotateY(ry);
    g.translate(x, y, z);
    glassParts.push(g);
  };
  pane(1.36, 0.6, 0, 1.531, halfL - 0.185, 0, -0.47);
  for (const s of [-1, 1]) {
    pane(0.62, 0.48, s * (W + 0.006), 1.5, 0.95, (s * Math.PI) / 2);
    pane(0.7, 0.4, s * (W + 0.006), 1.52, -0.1, (s * Math.PI) / 2);
    pane(0.7, 0.4, s * (W + 0.006), 1.52, -1.0, (s * Math.PI) / 2);
  }
  for (const x of [-0.36, 0.36]) pane(0.5, 0.36, x, 1.55, -halfL - 0.066, Math.PI);
  const trim = [];
  const CHROME = 0xb9bec2;
  const BLACK = 0x17191b;
  const DARK = 0x2a2c2e;
  for (const z of [halfL + 0.07, -halfL - 0.07]) {
    trim.push(colorize(box(1.7, 0.13, 0.1, 0, 0.5, z), DARK));
    trim.push(colorize(box(0.52, 0.12, 0.02, 0, 0.5, z + Math.sign(z) * 0.06), 0xd9dad2));
  }
  // the loaf's face: a small oval grille between two round lamps
  trim.push(colorize(box(0.7, 0.2, 0.03, 0, 0.9, halfL + 0.065), DARK));
  for (let k = 0; k < 4; k++) trim.push(colorize(box(0.66, 0.015, 0.035, 0, 0.83 + k * 0.045, halfL + 0.068), CHROME));
  // waist stripe and door seams
  for (const s of [-1, 1]) {
    trim.push(colorize(box(0.02, 0.07, LENGTH - 0.2, s * (W + 0.002), 1.16, 0), 0xd8d4c4));
    for (const z of [1.3, 0.55, -0.55]) trim.push(colorize(box(0.015, 1.3, 0.02, s * (W + 0.003), 1.1, z), BLACK));
    for (const z of [0.72, -0.4]) trim.push(colorize(box(0.03, 0.03, 0.14, s * (W + 0.02), 1.08, z), CHROME));
    trim.push(colorize(box(0.05, 0.16, 0.1, s * (W + 0.12), 1.42, 1.42), DARK));
    trim.push(colorize(box(0.14, 0.02, 0.03, s * (W + 0.05), 1.4, 1.44), DARK));
    trim.push(colorize(bar(V(s * 0.08, 1.33, halfL - 0.07), V(s * 0.5, 1.36, halfL - 0.085), 0.02, 0.02), BLACK));
  }
  const cabin = [];
  // cab seen from the seat: flat dash, the big thin wheel almost level
  cabin.push(colorize(box(1.5, 0.08, 0.3, 0, 1.12, 1.5), DARK));
  cabin.push(colorize(box(0.3, 0.07, 0.02, VAN_EYE.x, 1.19, 1.37), 0x111214));
  {
    const rim = new THREE.TorusGeometry(0.2, 0.015, 6, 24);
    rim.rotateX(-1.05);
    rim.translate(VAN_EYE.x, 1.22, 1.2);
    cabin.push(colorize(rim, BLACK));
    cabin.push(colorize(bar(V(VAN_EYE.x, 1.22, 1.2), V(VAN_EYE.x, 1.0, 1.36), 0.04, 0.04), BLACK));
  }
  cabin.push(colorize(box(0.5, 0.5, 0.1, VAN_EYE.x, 1.15, 0.52), 0x4a3326));
  cabin.push(colorize(box(0.5, 0.5, 0.1, -VAN_EYE.x, 1.15, 0.52), 0x4a3326));
  // what you see of the cab from inside: pillars, header, headlining, sills
  for (const s of [-1, 1]) {
    cabin.push(colorize(bar(V(s * 0.74, 1.14, halfL - 0.1), V(s * 0.74, 1.84, halfL - 0.46), 0.055, 0.06), 0x565c50));
    cabin.push(colorize(box(0.05, 0.1, 0.9, s * 0.8, 1.22, 1.0), 0x565c50));
    cabin.push(colorize(box(0.05, 0.08, 0.9, s * 0.8, 1.8, 1.0), 0x565c50));
    cabin.push(colorize(box(0.06, 0.6, 0.07, s * 0.8, 1.5, 0.6), 0x565c50));
  }
  cabin.push(colorize(box(1.56, 0.08, 0.08, 0, 1.85, halfL - 0.47), 0x565c50));
  cabin.push(colorize(box(1.56, 0.03, 1.6, 0, 1.9, 0.7), 0x4a4a44));
  cabin.push(colorize(box(1.56, 1.0, 0.04, 0, 1.4, 0.2), 0x4a5044));
  // the cab is lined: floor, door cards under the glass, the panel below
  // the dash, the quarter panels beside the windshield, seat cushions
  const LINING = 0x565c50;
  cabin.push(colorize(box(1.6, 0.04, 1.8, 0, 0.74, 1.08), 0x1c1c1b));
  cabin.push(colorize(box(1.6, 0.42, 0.04, 0, 0.93, halfL - 0.07), LINING));
  for (const s of [-1, 1]) {
    cabin.push(colorize(box(0.04, 0.52, 1.74, s * 0.8, 1.0, 1.07), LINING));
    cabin.push(colorize(box(0.06, 0.05, 0.4, s * 0.76, 1.1, 0.95), 0x24262a)); // armrest
    const q = [[s * 0.8, 1.26, 1.26], [s * 0.8, 1.26, 1.86], [s * 0.8, 1.77, 1.61], [s * 0.8, 1.77, 1.26]];
    cabin.push(colorize(quad(...q), LINING), colorize(quad(q[1], q[0], q[3], q[2]), LINING));
    cabin.push(colorize(box(0.5, 0.12, 0.5, s * VAN_EYE.x, 0.94, 0.78), 0x4a3326));
    cabin.push(colorize(box(0.44, 0.16, 0.44, s * VAN_EYE.x, 0.82, 0.78), 0x24262a));
  }
  // the engine cover between the seats
  cabin.push(colorize(box(0.4, 0.5, 0.9, 0, 0.95, 0.9), 0x45403a));

  const lamps = [];
  for (const x of [-0.55, 0.55]) {
    const head = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 14);
    head.rotateX(Math.PI / 2);
    head.translate(x, 0.9, halfL + 0.072);
    lamps.push(colorize(head, 0xfff3d6));
    lamps.push(colorize(box(0.1, 0.2, 0.03, x * 1.3, 0.95, -halfL - 0.066), 0xff2a18));
    trim.push(colorize(head.clone().translate(0, 0, -0.004), 0x8f8a7c));
    trim.push(colorize(box(0.1, 0.2, 0.03, x * 1.3, 0.95, -halfL - 0.062), 0x5a1810));
    const ring = new THREE.TorusGeometry(0.105, 0.014, 4, 14);
    ring.translate(x, 0.9, halfL + 0.085);
    trim.push(colorize(ring, CHROME));
  }
  const snow = [box(WIDTH - 0.1, 0.07, LENGTH - 1.1, 0, 1.98, -0.3)];
  const merge = (list) => mergeGeometries(list.map(plain), false);
  return { body, glass: merge(glassParts), trim: merge(trim), cabin: merge(cabin), lamps: merge(lamps), snow: merge(snow), wheel, eye: VAN_EYE, lift: 0.1 };
}

/* ---------------------------------------------------------- the car */

const _dummy = new THREE.Object3D();
_dummy.rotation.order = 'YXZ';

export class Car {
  constructor(world, parts, mats, { x, z, heading, color, id }) {
    this.world = world;
    this.id = id;
    /** Driver's eye in car-local space. */
    this.eye = parts.eye ?? DRIVER_EYE;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0; // signed, along the car axis
    this.steer = 0;
    this.spin = 0;
    this.pitch = 0;
    this.roll = 0;
    // tilt of the ground under the wheels (nose down / right side up > 0)
    this.slopePitch = 0;
    this.slopeRoll = 0;
    this.throttle = 0;
    this.driven = false;
    this.impact = 0;

    this.root = new THREE.Group();
    this.root.name = `car-${id}`;
    this.body = new THREE.Group();
    this.root.add(this.body);
    const add = (geo, mat, cast = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.body.add(mesh);
      return mesh;
    };
    // paint and trim share one vertex-colored mesh: the paint is baked
    // into this car's copy of the body
    const painted = colorize(parts.body.clone(), color);
    add(mergeGeometries([painted, parts.trim], false), mats.trim);
    // what only reads from close by: the cabin, the glass, the badge
    this.fine = [];
    if (parts.cabin) this.fine.push(add(parts.cabin, mats.cabin, false));
    const glass = add(parts.glass, mats.glass, false);
    glass.renderOrder = 2;
    this.fine.push(glass);
    if (parts.badge) this.fine.push(add(parts.badge, mats.badge, false));
    this.model = parts.model ?? 'car';
    this.lampMat = mats.lamps.clone();
    this.setLights(0);
    this.lamps = add(parts.lamps, this.lampMat, false);
    this.lamps.visible = false;
    this.snow = add(parts.snow, mats.snow, false);

    this.wheels = new THREE.InstancedMesh(parts.wheel, mats.trim, 4);
    this.wheels.castShadow = false;
    // the four wheels never leave the car: one fixed sphere in its frame
    this.wheels.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, WHEEL_R, 0), 2.3);
    this.root.add(this.wheels);
    this.wheelPos = [
      [TRACK / 2, WHEEL_R, AXLE_Z, true],
      [-TRACK / 2, WHEEL_R, AXLE_Z, true],
      [TRACK / 2, WHEEL_R, -AXLE_Z, false],
      [-TRACK / 2, WHEEL_R, -AXLE_Z, false],
    ];

    // the collider rect is ours: refreshed while moving, out of the way
    // while someone is behind the wheel
    this.collider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, car: this };
    world.colliders.push(this.collider);
    this.updateCollider();
    this.sync();
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Car-local point to world space (ignores pitch/roll). */
  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    return out.set(this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c);
  }

  updateCollider() {
    const s = Math.abs(Math.sin(this.heading));
    const c = Math.abs(Math.cos(this.heading));
    const hw = (WIDTH / 2) * c + (LENGTH / 2) * s + 0.08;
    const hl = (WIDTH / 2) * s + (LENGTH / 2) * c + 0.08;
    const col = this.collider;
    if (this.driven) {
      // parked far below the world: the driver's own car never blocks them
      col.minX = col.maxX = col.minZ = col.maxZ = 1e6;
      return;
    }
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
    return Math.hypot(lx - clamp(lx, -WIDTH / 2, WIDTH / 2), lz - clamp(lz, -LENGTH / 2, LENGTH / 2));
  }

  /** Narrow phase for World.collides: circle against the oriented body. */
  overlapsCircle(x, z, r) {
    return this.distanceTo(x, z) < r;
  }

  /** True when the car's footprint at (x, z, heading) hits anything. */
  blocked(x, z, heading) {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    for (const off of CAR.circles) {
      const cx = x + off * s;
      const cz = z + off * c;
      if (this.world.collides(cx, cz, CAR.radius)) return true;
    }
    return false;
  }

  setDriven(on) {
    this.driven = on;
    this.lamps.visible = on;
    this.updateCollider();
    if (!on) {
      this.throttle = 0;
      this.setLights(0);
    }
  }

  /** 0 = unlit lenses, 1 = full beam (over the bloom threshold). */
  setLights(level) {
    this.lampMat.color.setScalar(0.32 + level * 1.6);
  }

  /**
   * One physics step. input: { throttle, brake, steer (-1 right … 1 left),
   * handbrake } — all 0/1 except steer.
   */
  update(dt, input) {
    const f = this.forward;
    const rx = Math.cos(this.heading);
    const rz = -Math.sin(this.heading);
    let vLong = this.vx * f.x + this.vz * f.z;
    let vLat = this.vx * rx + this.vz * rz;
    const surface = this.world.surfaceAt(this.x, this.z);
    const grip = (GRIP[surface] ?? 0.6) * (this.world.season === 'winter' ? 0.85 : 1);

    // engine, brakes, reverse
    let a = 0;
    if (input.throttle) {
      if (vLong < -0.4) a = CAR.brake;
      else a = CAR.accel * clamp(1 - (vLong / CAR.maxSpeed) ** 2, 0, 1) * (0.55 + 0.45 * grip);
    } else if (input.brake) {
      if (vLong > 0.4) a = -CAR.brake * (0.5 + 0.5 * grip);
      else a = -CAR.accel * 0.7 * clamp(1 + vLong / CAR.reverseSpeed, 0, 1);
    }
    // a hill pulls the car back down (never enough to roll a parked one)
    if (Math.abs(vLong) > 0.3 || input.throttle || input.brake) vLong += 9.8 * Math.sin(this.slopePitch) * 0.7 * dt;
    vLong += a * dt;
    // rolling resistance and air drag, never flipping the sign
    // off the throttle the engine holds the car back (engine braking)
    const engineBrake = input.throttle || input.brake ? 0 : 1.1;
    const resist = (CAR.rolling + engineBrake + CAR.drag * vLong * vLong + (input.handbrake ? 5 * grip : 0)) * dt;
    vLong = Math.abs(vLong) <= resist ? 0 : vLong - Math.sign(vLong) * resist;
    this.throttle = damp(this.throttle, input.throttle ? 1 : 0, 6, dt);

    // steering: less lock at speed, the yaw follows the bicycle model
    const lock = CAR.maxSteer * (1 - 0.65 * clamp(Math.abs(vLong) / 20, 0, 1));
    this.steer = damp(this.steer, (input.steer ?? 0) * lock, CAR.steerRate, dt);
    const yawRate = (vLong / WHEELBASE) * Math.tan(this.steer);
    const newHeading = this.heading + yawRate * dt * (0.55 + 0.45 * grip);

    // lateral slip dies out with grip (handbrake lets the tail go)
    const latGrip = grip * (input.handbrake ? 1.2 : 9);
    vLat = damp(vLat, 0, latGrip, dt);
    // a sliding tail swings the nose a little
    const slideYaw = -vLat * 0.08 * dt;

    // integrate with collisions: full move, then each axis alone
    const nf = { x: Math.sin(newHeading), z: Math.cos(newHeading) };
    const nrx = Math.cos(newHeading);
    const nrz = -Math.sin(newHeading);
    let vx = nf.x * vLong + nrx * vLat;
    let vz = nf.z * vLong + nrz * vLat;
    let nx = this.x + vx * dt;
    let nz = this.z + vz * dt;
    let heading = newHeading + slideYaw;
    this.impact = Math.max(0, this.impact - dt * 3);
    if (this.blocked(nx, nz, heading)) {
      let moved = false;
      if (!this.blocked(nx, this.z, this.heading)) {
        nz = this.z;
        vz = 0;
        heading = this.heading;
        moved = true;
      } else if (!this.blocked(this.x, nz, this.heading)) {
        nx = this.x;
        vx = 0;
        heading = this.heading;
        moved = true;
      }
      const hit = Math.abs(vLong);
      if (!moved) {
        nx = this.x;
        nz = this.z;
        heading = this.heading;
        vx = -vx * 0.25;
        vz = -vz * 0.25;
      } else {
        vx *= 0.7;
        vz *= 0.7;
      }
      if (hit > 2) this.impact = Math.max(this.impact, clamp(hit / 14, 0.15, 1));
    }
    this.x = nx;
    this.z = nz;
    this.heading = heading;
    this.vx = vx;
    this.vz = vz;
    this.speed = vx * Math.sin(heading) + vz * Math.cos(heading);

    // body language: squat under throttle, dive under brakes, lean in turns
    this.pitch = damp(this.pitch, clamp(-a * 0.006, -0.05, 0.035), 5, dt);
    this.roll = damp(this.roll, clamp(yawRate * vLong * 0.004, -0.06, 0.06), 4, dt);
    // marker posts give way: a knock, a little speed lost
    if (this.world.posts?.hit(this)) {
      this.vx *= 0.97;
      this.vz *= 0.97;
      this.impact = Math.max(this.impact, 0.6);
    }
    this.y = damp(this.y, this.world.heightAt(this.x, this.z), 10, dt);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const hAt = (lx, lz) => this.world.heightAt(this.x + fx * lz + Math.cos(heading) * lx, this.z + fz * lz - Math.sin(heading) * lx);
    this.slopePitch = damp(this.slopePitch, Math.atan2(hAt(0, -WHEELBASE / 2) - hAt(0, WHEELBASE / 2), WHEELBASE), 9, dt);
    this.slopeRoll = damp(this.slopeRoll, Math.atan2(hAt(0.75, 0) - hAt(-0.75, 0), 1.5), 9, dt);
    this.spin += (this.speed / WHEEL_R) * dt;
    this.updateCollider();
    this.sync();
  }

  sync() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.slopePitch, this.heading, this.slopeRoll, 'YXZ');
    this.body.rotation.set(this.pitch, 0, this.roll);
    for (let i = 0; i < 4; i++) {
      const [x, y, z, front] = this.wheelPos[i];
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(this.spin, front ? this.steer : 0, 0);
      _dummy.updateMatrix();
      this.wheels.setMatrixAt(i, _dummy.matrix);
    }
    this.wheels.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------------------------------------------------- placement */

/** Chrome script on the boot lid. */
function badgeMaterial(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const c = canvas.getContext('2d');
  c.font = 'italic bold 38px sans-serif';
  c.textBaseline = 'middle';
  c.fillStyle = '#e9edf0';
  c.fillText(text, 4, 26, 248);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.3, metalness: 0.7 });
}

/** Matt cabin material. A cabin sits in its own shadow and would go black
 * under the roof, so it gives back a share of its own colour, the way the
 * light bouncing round a real one does. */
function cabinMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.3;');
  };
  mat.customProgramCacheKey = () => 'cabin';
  return mat;
}

export function buildVehicles(ctx) {
  const { world, materials: M } = ctx;
  const parts = sedanParts();
  const van = vanParts(parts.wheel);
  const mats = {
    // thin panes facing out: a tint over the cabin from the street, clear
    // from the seat
    glass: new THREE.MeshStandardMaterial({ color: 0x0f181e, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.62, depthWrite: false }),
    // vinyl, carpet, padded dash: nothing in the cabin shines
    cabin: cabinMaterial(),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.35 }),
    lamps: new THREE.MeshBasicMaterial({ vertexColors: true }),
    snow: M.snow,
  };
  // read from behind the car, where +x is on your left
  const bz = -LENGTH / 2 + 0.022;
  parts.badge = quad([-0.22, 0.775, bz], [-0.6, 0.775, bz], [-0.6, 0.84, bz], [-0.22, 0.84, bz]);
  mats.badge = badgeMaterial('LADA 1500');
  parts.model = 'Lada';
  van.model = 'UAZ';
  // far cars are a few pixels: past shouting distance they lose the cabin
  // and the glass, and well beyond that they are not drawn at all
  ctx.addUpdater(() => {
    const { viewX = 0, viewZ = 0 } = world;
    for (const car of world.cars) {
      const d2 = (car.x - viewX) ** 2 + (car.z - viewZ) ** 2;
      car.root.visible = car.driven || d2 < 420 * 420;
      const near = car.driven || d2 < 70 * 70;
      for (const mesh of car.fine) mesh.visible = near;
    }
  });
  world.cars = PARKED.map((spec, i) => {
    const car = new Car(world, spec.van ? van : parts, mats, { ...spec, id: i });
    world.group.add(car.root);
    return car;
  });

  // one pair of headlight beams, handed to whichever car is being driven
  const beam = new THREE.SpotLight(0xffe2b0, 0, 45, 0.5, 0.55, 1.4);
  beam.castShadow = false;
  const target = new THREE.Object3D();
  beam.target = target;
  world.group.add(beam, target);
  world.carBeam = { light: beam, target };
}
