// Boats: open aluminium cutters with a windscreen and a cuddy forward,
// moored where the land meets open water — off the port mole and on the
// beach of each island. A boat answers to the same wheel as a car
// (driving.js), but it only goes where there is water under it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../util.js';
import { isWater, SEA_Y } from './land.js';
import { ROUTES } from './routes.js';
import { PADS } from './town.js';

const LENGTH = 7.4;
const BEAM = 2.3;
const BOAT = { maxSpeed: 12, reverse: 3, accel: 2.6, drag: 0.4, turn: 0.75 };

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const color = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function box(w, h, d, x, y, z, hex, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return colored(g, hex);
}

/** The hull in plan (pointed bow toward +z), extruded up from `y0`. */
function hullSlab(grow, y0, h, hex) {
  const hw = BEAM / 2 + grow;
  const hl = LENGTH / 2 + grow;
  const s = new THREE.Shape();
  s.moveTo(-hw * 0.82, -hl);
  s.lineTo(hw * 0.82, -hl);
  s.lineTo(hw, -hl + 0.6);
  s.lineTo(hw, hl * 0.25);
  s.quadraticCurveTo(hw * 0.9, hl * 0.72, 0, hl);
  s.quadraticCurveTo(-hw * 0.9, hl * 0.72, -hw, hl * 0.25);
  s.lineTo(-hw, -hl + 0.6);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 8 });
  // shape (x, y) → boat (x, z); the extrusion comes out downward
  g.rotateX(Math.PI / 2);
  g.translate(0, y0 + h, 0);
  g.computeVertexNormals();
  return colored(g, hex);
}

function boatParts() {
  const parts = [];
  const lamps = [];
  const HULL = 0x9aa3a6; // bare aluminium, dulled
  const BOTTOM = 0x7a2f28; // red anti-fouling below the waterline
  const WOOD = 0x7a5b3c;
  const DARK = 0x24272a;
  // the hull: red bottom, grey topsides, a rubbing strake, the deck inside
  parts.push(hullSlab(-0.06, -0.38, 0.4, BOTTOM));
  parts.push(hullSlab(0, 0.0, 0.62, HULL));
  parts.push(hullSlab(0.035, 0.52, 0.07, DARK));
  parts.push(hullSlab(-0.12, 0.6, 0.03, 0x6a7073)); // gunwale top / side decks
  // the cockpit floor sits lower than the gunwale: wooden boards
  parts.push(box(BEAM - 0.5, 0.04, 4.1, 0, 0.645, -1.35, WOOD));
  for (let i = 0; i < 6; i++) parts.push(box(0.012, 0.045, 4.1, -0.75 + i * 0.3, 0.647, -1.35, 0x4a3524));
  // cockpit coaming
  for (const s of [-1, 1]) parts.push(box(0.06, 0.34, 4.2, s * (BEAM / 2 - 0.22), 0.8, -1.35, HULL));
  parts.push(box(BEAM - 0.4, 0.34, 0.06, 0, 0.8, -3.42, HULL));
  // cuddy forward: a low cabin with two portholes a side and a hatch
  parts.push(box(1.7, 0.62, 2.1, 0, 0.94, 1.55, 0xd9d6cc));
  parts.push(box(1.5, 0.5, 0.9, 0, 0.88, 2.75, 0xd9d6cc));
  parts.push(box(1.78, 0.05, 2.2, 0, 1.27, 1.55, 0x5d7f8e));
  parts.push(box(0.7, 0.05, 0.7, 0, 1.31, 1.6, 0x8a8f92));
  for (const s of [-1, 1]) for (const z of [1.1, 2.0]) parts.push(box(0.02, 0.2, 0.34, s * 0.86, 1.0, z, 0x1a2a36));
  // the windscreen: a raked frame, three dark panes
  parts.push(box(1.7, 0.05, 0.05, 0, 1.78, 0.36, DARK));
  parts.push(box(1.7, 0.05, 0.05, 0, 1.3, 0.5, DARK));
  for (const x of [-0.85, -0.28, 0.28, 0.85]) parts.push(box(0.05, 0.52, 0.05, x, 1.54, 0.43, DARK, -0.28));
  // the helm: a console on the port side, a wheel, a throttle, a compass
  const HX = 0.5;
  parts.push(box(0.7, 0.62, 0.4, HX, 0.96, 0.2, 0xb9bcba));
  parts.push(box(0.6, 0.18, 0.02, HX, 1.18, -0.01, DARK));
  for (const ox of [-0.16, 0.02, 0.2]) {
    const dial = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10);
    dial.rotateX(Math.PI / 2);
    dial.translate(HX + ox, 1.19, -0.025);
    parts.push(colored(dial, 0xd8d6cc));
  }
  {
    const rim = new THREE.TorusGeometry(0.2, 0.016, 6, 20);
    rim.rotateX(-0.5);
    rim.translate(HX, 1.0, -0.16);
    parts.push(colored(rim, DARK));
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const spoke = new THREE.BoxGeometry(0.38, 0.016, 0.016);
      spoke.rotateZ(a);
      spoke.rotateX(-0.5);
      spoke.translate(HX, 1.0, -0.16);
      parts.push(colored(spoke, 0x8a8f92));
    }
  }
  parts.push(box(0.05, 0.2, 0.05, HX + 0.42, 1.0, -0.05, DARK, 0.4));
  const ball = new THREE.SphereGeometry(0.07, 8, 6);
  ball.translate(HX - 0.3, 1.33, 0.2);
  parts.push(colored(ball, 0x1c1c1c));
  // seats: a box for the helmsman, a thwart aft, a locker under it
  parts.push(box(0.5, 0.42, 0.45, HX, 0.87, -0.75, 0x4a3326));
  parts.push(box(0.5, 0.06, 0.45, HX, 1.1, -0.75, 0x8a1f1a));
  parts.push(box(BEAM - 0.56, 0.36, 0.5, 0, 0.84, -3.05, WOOD));
  // things a boat has aboard: fuel cans, a coil of rope, an anchor, oars
  for (const x of [-0.7, -0.42]) parts.push(box(0.22, 0.34, 0.34, x, 0.83, -2.3, 0x8a2f28));
  {
    const coil = new THREE.TorusGeometry(0.18, 0.05, 5, 12);
    coil.rotateX(Math.PI / 2);
    coil.translate(-0.55, 0.7, -0.6);
    parts.push(colored(coil, 0xb9a57e));
  }
  for (const s of [-1, 1]) parts.push(box(0.05, 0.05, 2.6, s * 0.92, 0.72, -1.6, 0x6a4a30));
  parts.push(box(0.3, 0.06, 0.4, 0, 1.33, 2.9, DARK));
  // rails on the foredeck, cleats, tyre fenders along the side
  for (const s of [-1, 1]) {
    for (const z of [0.9, 1.9, 2.8]) parts.push(box(0.03, 0.34, 0.03, s * (0.98 - (z > 2.5 ? 0.3 : 0)), 0.8, z, 0xb9bcba));
    parts.push(box(0.03, 0.03, 2.0, s * 0.94, 0.97, 1.5, 0xb9bcba));
    for (const z of [-2.2, -0.4, 1.2]) {
      const tyre = new THREE.TorusGeometry(0.2, 0.08, 6, 12);
      tyre.rotateY(Math.PI / 2);
      tyre.translate(s * (BEAM / 2 + 0.1), 0.32, z);
      parts.push(colored(tyre, 0x141516));
    }
    parts.push(box(0.1, 0.05, 0.22, s * 0.9, 0.66, -3.3, DARK));
  }
  // the outboard: cowling, leg, tiller arm
  parts.push(box(0.4, 0.5, 0.5, 0, 1.0, -3.85, 0x2a3440));
  parts.push(box(0.36, 0.06, 0.44, 0, 1.27, -3.85, 0xd9d6cc));
  parts.push(box(0.14, 1.0, 0.18, 0, 0.3, -3.92, 0x3a3f44));
  parts.push(box(0.5, 0.3, 0.1, 0, 0.75, -3.72, DARK));
  // a short mast with the masthead light, and a little red flag
  parts.push(box(0.04, 1.3, 0.04, 0, 1.95, 1.0, 0xb9bcba));
  parts.push(box(0.3, 0.2, 0.01, 0.17, 2.45, 1.0, 0xa3261f));
  // life ring on the cuddy bulkhead
  {
    const ring = new THREE.TorusGeometry(0.2, 0.05, 6, 14);
    ring.translate(-0.45, 1.0, 0.47);
    parts.push(colored(ring, 0xd9622a));
  }
  // lights: white at the masthead, red and green at the bow, a spot
  lamps.push(box(0.08, 0.08, 0.08, 0, 2.64, 1.0, 0xfff3d6));
  lamps.push(box(0.06, 0.07, 0.1, -0.5, 1.0, 3.05, 0xff2a18));
  lamps.push(box(0.06, 0.07, 0.1, 0.5, 1.0, 3.05, 0x30ff60));
  lamps.push(box(0.18, 0.14, 0.06, 0, 1.4, 2.62, 0xfff3d6));
  return { body: mergeGeometries(parts, false), lamps: mergeGeometries(lamps, false) };
}

export class Boat {
  constructor(world, parts, mats, { x, z, heading, id }) {
    this.world = world;
    this.id = id;
    this.boat = true;
    this.eye = new THREE.Vector3(0.5, 1.72, -0.7);
    this.x = x;
    this.z = z;
    this.y = SEA_Y;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.slopePitch = 0;
    this.slopeRoll = 0;
    this.throttle = 0;
    this.impact = 0;
    this.driven = false;
    this.t = id * 3.7;
    this.root = new THREE.Group();
    this.root.name = `boat-${id}`;
    const body = new THREE.Mesh(parts.body, mats.body);
    body.castShadow = true;
    body.receiveShadow = true;
    this.lampMat = mats.lamps.clone();
    this.lamps = new THREE.Mesh(parts.lamps, this.lampMat);
    this.root.add(body, this.lamps);
    this.setLights(0);
    this.sync();
  }

  toWorld(lx, ly, lz, out = new THREE.Vector3()) {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    return out.set(this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c);
  }

  /** Distance from a point to the hull (0 aboard). */
  distanceTo(x, z) {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const dx = x - this.x;
    const dz = z - this.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.hypot(lx - clamp(lx, -BEAM / 2, BEAM / 2), lz - clamp(lz, -LENGTH / 2, LENGTH / 2));
  }

  /** Water under the whole hull at (x, z, heading)? */
  afloat(x, z, heading) {
    const s = Math.sin(heading);
    const c = Math.cos(heading);
    for (const [lx, lz] of [[0, LENGTH / 2], [0, -LENGTH / 2], [BEAM / 2, 0], [-BEAM / 2, 0], [0, 0]]) {
      if (!isWater(x + lx * c + lz * s, z - lx * s + lz * c)) return false;
    }
    return true;
  }

  /** Where you can step ashore from here: dry ground within a few paces,
   * nearest first, in boat-local space. */
  get exitSpots() {
    const spots = [];
    for (let r = 2.2; r <= 9; r += 1.1) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        spots.push([Math.sin(a) * r, Math.cos(a) * r]);
      }
    }
    return spots;
  }

  setDriven(on) {
    this.driven = on;
    if (!on) {
      this.throttle = 0;
      this.setLights(0);
    }
  }

  setLights(level) {
    this.lampMat.color.setScalar(0.3 + level * 1.6);
  }

  update(dt, input) {
    this.t += dt;
    this.impact = Math.max(0, this.impact - dt * 3);
    this.throttle = input.throttle ? 1 : 0;
    const want = input.throttle ? BOAT.maxSpeed : input.brake ? -BOAT.reverse : 0;
    if (input.throttle || input.brake) this.speed = damp(this.speed, want, BOAT.accel * 0.22, dt);
    else this.speed -= this.speed * BOAT.drag * dt;
    this.steer = damp(this.steer, input.steer, 3, dt);
    // a rudder only bites with way on
    const way = clamp(this.speed / 3.5, -1, 1);
    const heading = this.heading + this.steer * BOAT.turn * way * dt;
    const nx = this.x + Math.sin(heading) * this.speed * dt;
    const nz = this.z + Math.cos(heading) * this.speed * dt;
    // touching bottom somewhere already (left on a beach, turned in the
    // shallows): she may still work herself off into deeper water
    const stuck = !this.afloat(this.x, this.z, this.heading);
    if (this.afloat(nx, nz, heading) || (stuck && isWater(nx, nz))) {
      this.x = nx;
      this.z = nz;
      this.heading = heading;
    } else if (this.afloat(this.x, this.z, heading)) {
      // nosed onto the beach or the ice: she stops and can still turn away
      this.heading = heading;
      this.ground();
    } else {
      this.ground();
    }
    this.sync();
  }

  ground() {
    if (Math.abs(this.speed) > 1.2) this.impact = Math.min(2, Math.abs(this.speed) / 4);
    this.speed *= -0.15;
  }

  /** Rides the chop: called every frame, under way or moored. */
  sync() {
    const chop = 0.4 + Math.min(Math.abs(this.speed) / BOAT.maxSpeed, 1) * 0.8;
    this.y = SEA_Y + 0.3 + Math.sin(this.t * 1.3) * 0.035 * chop;
    // the bow lifts as she gets on the plane and she leans into her turns
    this.pitch = -clamp(this.speed / BOAT.maxSpeed, -0.3, 1) * 0.06 + Math.sin(this.t * 1.7 + 1) * 0.012 * chop;
    this.roll = -this.steer * clamp(this.speed / BOAT.maxSpeed, -1, 1) * 0.12 + Math.sin(this.t * 0.9) * 0.02 * chop;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
  }
}

/** The first stretch of open water going from (x, z) along (dx, dz). */
function shoreline(x, z, dx, dz) {
  for (let d = 0; d < 400; d += 1) {
    if (isWater(x + dx * d, z + dz * d)) return d;
  }
  return null;
}

export function buildBoats(ctx) {
  const { world } = ctx;
  const parts = boatParts();
  const mats = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }),
    lamps: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  // one off the end of the port mole, one on the west beach of each island
  const moorings = [];
  const port = ROUTES.find((r) => r.id === 'port');
  moorings.push([port.end[0], port.end[1] - 8, 1, 0]);
  for (const p of PADS.filter((q) => q.island)) moorings.push([p.x0, (p.z0 + p.z1) / 2, -1, 0]);
  world.boats = [];
  for (const [x, z, dx] of moorings) {
    const d = shoreline(x, z, dx, 0);
    if (d === null) continue;
    // stern to the shore, bow out to sea
    const boat = new Boat(world, parts, mats, { x: x + dx * (d + LENGTH / 2 + 0.8), z, heading: (dx * Math.PI) / 2, id: world.boats.length });
    for (let k = 0; k < 20 && !boat.afloat(boat.x, boat.z, boat.heading); k++) boat.x += dx * 0.5;
    boat.sync();
    world.group.add(boat.root);
    world.boats.push(boat);
  }
  // moored boats ride the chop too
  ctx.addUpdater((dt) => {
    for (const boat of world.boats) {
      if (boat.driven) continue;
      boat.t += dt;
      boat.sync();
    }
  });
}
