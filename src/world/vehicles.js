// Cars of the district: Zhiguli-like sedans parked in the courtyards and at
// the curb. Every one of them can be driven: a light arcade model (bicycle
// steering, surface grip, slides on snow and ice) with the parked footprint
// turned into a moving collider while the car is under way.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, TAU } from '../util.js';

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

/** Shared geometry of the sedan, built once and cloned per car. */
function sedanParts() {
  const halfL = LENGTH / 2;
  // lower body: trunk, waist line, hood; the bottom edge carries the arches
  const body = profile(
    [
      [halfL - 0.02, 0.32],
      [halfL, 0.74],
      [halfL - 0.12, 0.86],
      [0.9, 0.95],
      [-1.15, 0.95],
      [-halfL + 0.25, 0.9],
      [-halfL, 0.78],
      [-halfL + 0.03, 0.32],
    ],
    WIDTH,
    0.04,
    true
  );
  // the greenhouse: tinted glass volume narrower than the body (tumblehome)
  const glass = profile(
    [
      [0.88, 0.95],
      [0.3, 1.33],
      [-0.72, 1.33],
      [-1.13, 0.95],
    ],
    1.38,
    0
  );
  glass.translate(0, 0.005, 0);

  // painted frame of the greenhouse: roof, pillars, waist moulding
  const frame = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  frame.push(box(1.42, 0.06, 1.06, 0, 1.35, -0.21));
  for (const s of [-1, 1]) {
    const x = s * 0.69;
    frame.push(bar(V(x, 0.95, 0.87), V(x, 1.34, 0.31), 0.06, 0.07)); // A
    frame.push(bar(V(x, 0.95, -0.16), V(x, 1.34, -0.16), 0.06, 0.1)); // B
    frame.push(bar(V(x, 0.95, -1.12), V(x, 1.34, -0.72), 0.06, 0.14)); // C
    frame.push(box(0.04, 0.05, 2.0, x, 0.955, -0.12)); // window sill
  }
  frame.push(box(1.36, 0.06, 0.06, 0, 1.33, 0.3)); // windshield header
  frame.push(box(1.36, 0.06, 0.08, 0, 1.33, -0.72)); // rear header

  // trim: chrome, rubber, lamps housings, plates, interior — vertex colored
  const trim = [];
  const CHROME = 0xb9bec2;
  const BLACK = 0x17191b;
  const DARK = 0x2a2c2e;
  const SEAT = 0x4a3326;
  const PLATE = 0xd9dad2;
  for (const z of [halfL + 0.06, -halfL - 0.06]) {
    trim.push(colorize(box(1.66, 0.11, 0.08, 0, 0.45, z), CHROME)); // bumper
    for (const x of [-0.42, 0.42]) trim.push(colorize(box(0.07, 0.2, 0.1, x, 0.47, z + Math.sign(z) * 0.02), CHROME)); // overriders
    trim.push(colorize(box(0.52, 0.12, 0.02, 0, 0.34, z + Math.sign(z) * 0.04), PLATE)); // plate
  }
  trim.push(colorize(box(1.04, 0.2, 0.03, 0, 0.65, halfL - 0.005), DARK)); // grille
  trim.push(colorize(box(1.1, 0.03, 0.04, 0, 0.765, halfL), CHROME));
  trim.push(colorize(box(1.1, 0.03, 0.04, 0, 0.54, halfL), CHROME));
  for (const s of [-1, 1]) {
    // door handles, rubbing strip, mirror
    for (const z of [0.28, -0.62]) trim.push(colorize(box(0.03, 0.03, 0.14, s * 0.81, 0.84, z), CHROME));
    trim.push(colorize(box(0.02, 0.03, 3.3, s * 0.815, 0.66, 0.05), CHROME));
    trim.push(colorize(box(0.05, 0.08, 0.13, s * 0.86, 1.04, 0.7), DARK));
    trim.push(colorize(box(0.12, 0.02, 0.03, s * 0.8, 1.0, 0.72), DARK));
    // wiper
    trim.push(colorize(bar(V(s * 0.05, 0.98, 0.84), V(s * 0.5, 1.0, 0.78), 0.02, 0.02), BLACK));
  }
  // interior: dark trim over the body top (the cabin seen from the seat),
  // a low dash, the thin-rimmed wheel
  trim.push(colorize(box(1.36, 0.01, 2.0, 0, 0.997, -0.12), 0x24221f));
  trim.push(colorize(box(1.3, 0.1, 0.34, 0, 0.99, 0.66), DARK));
  trim.push(colorize(box(1.32, 0.03, 0.22, 0, 1.045, 0.62), BLACK));
  trim.push(colorize(box(0.34, 0.08, 0.02, DRIVER_EYE.x, 1.0, 0.49), 0x111214)); // gauges
  {
    const wheel = new THREE.TorusGeometry(0.18, 0.014, 6, 24);
    wheel.rotateX(-0.55);
    wheel.translate(DRIVER_EYE.x, 0.95, 0.34);
    trim.push(colorize(wheel, BLACK));
    trim.push(colorize(bar(V(DRIVER_EYE.x, 0.95, 0.34), V(DRIVER_EYE.x, 0.86, 0.6), 0.04, 0.04), BLACK));
    const spoke = box(0.34, 0.018, 0.018, 0, 0, 0);
    spoke.rotateX(-0.55);
    spoke.translate(DRIVER_EYE.x, 0.95, 0.34);
    trim.push(colorize(spoke, BLACK));
  }
  // the cabin floor is the body's top (the waist line), so only the seat
  // backs and head restraints show above it, as through real side glass
  for (const x of [-0.36, 0.36]) {
    const back = new THREE.BoxGeometry(0.48, 0.3, 0.1);
    back.rotateX(-0.16);
    back.translate(x, 1.06, -0.46);
    trim.push(colorize(back, SEAT));
    trim.push(colorize(box(0.24, 0.13, 0.08, x, 1.25, -0.5), SEAT));
  }
  trim.push(colorize(box(1.3, 0.2, 0.08, 0, 1.04, -1.08), SEAT));

  // lamps: round headlights, flat tail clusters (their own emissive mesh)
  const lamps = [];
  for (const x of [-0.58, 0.58]) {
    const head = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 14);
    head.rotateX(Math.PI / 2);
    head.translate(x, 0.66, halfL + 0.005);
    lamps.push(colorize(head, 0xfff3d6));
    lamps.push(colorize(box(0.3, 0.13, 0.03, x * 1.08, 0.7, -halfL + 0.005), 0xff2a18));
    // unlit lenses, part of the trim (the glowing copy shows when driven)
    trim.push(colorize(head.clone().translate(0, 0, -0.004), 0x8f8a7c));
    trim.push(colorize(box(0.3, 0.13, 0.03, x * 1.08, 0.7, -halfL + 0.001), 0x5a1810));
  }
  for (const x of [-0.58, 0.58]) {
    const rim = new THREE.TorusGeometry(0.09, 0.012, 4, 14);
    rim.translate(x, 0.66, halfL + 0.02);
    trim.push(colorize(rim, CHROME));
  }

  // snow load: roof pillow, hood and trunk
  const snow = [];
  {
    const roof = new THREE.SphereGeometry(1, 12, 4, 0, TAU, 0, Math.PI / 2);
    roof.scale(0.66, 0.1, 0.5);
    roof.translate(0, 1.37, -0.21);
    snow.push(plain(roof));
    const hood = box(1.38, 0.05, 0.95, 0, 0.93, 1.45);
    hood.rotateX(0.04);
    snow.push(hood);
    snow.push(box(1.3, 0.05, 0.55, 0, 0.94, -1.55));
  }

  // wheel: tire, dark steel rim, chrome hubcap (axis along x)
  const wheelParts = [];
  {
    const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.18, 18);
    tire.rotateZ(Math.PI / 2);
    wheelParts.push(colorize(tire, 0x151617));
    const rim = new THREE.CylinderGeometry(0.19, 0.19, 0.19, 14);
    rim.rotateZ(Math.PI / 2);
    wheelParts.push(colorize(rim, 0x3b3e40));
    const cap = new THREE.CylinderGeometry(0.12, 0.13, 0.2, 12);
    cap.rotateZ(Math.PI / 2);
    wheelParts.push(colorize(cap, CHROME));
    // a lug bar so the spin reads
    wheelParts.push(colorize(box(0.205, 0.04, 0.22, 0, 0, 0), 0x2b2d2f));
  }

  const merge = (list) => mergeGeometries(list.map(plain), false);
  return {
    body: mergeGeometries([body, ...frame.map(plain)], false),
    glass,
    trim: merge(trim),
    lamps: merge(lamps),
    snow: merge(snow),
    wheel: merge(wheelParts),
  };
}

/* ---------------------------------------------------------- the car */

const _dummy = new THREE.Object3D();
_dummy.rotation.order = 'YXZ';

export class Car {
  constructor(world, parts, mats, { x, z, heading, color, id }) {
    this.world = world;
    this.id = id;
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
    add(parts.glass, mats.glass, false);
    this.lampMat = mats.lamps.clone();
    this.setLights(0);
    this.lamps = add(parts.lamps, this.lampMat, false);
    this.lamps.visible = false;
    this.snow = add(parts.snow, mats.snow, false);

    this.wheels = new THREE.InstancedMesh(parts.wheel, mats.trim, 4);
    this.wheels.castShadow = false;
    this.wheels.frustumCulled = false;
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
    // stays parked far away until the world is built: the build-time
    // scatter passes keep seeing the historic footprints (see buildVehicles)
    this.collider.minX = this.collider.maxX = this.collider.minZ = this.collider.maxZ = 1e6;
    world.colliders.push(this.collider);
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
      for (const p of this.world.people?.list ?? []) {
        const pp = p.position;
        if ((pp.x - cx) ** 2 + (pp.z - cz) ** 2 < (CAR.radius + 0.35) ** 2) return true;
      }
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
    this.y = damp(this.y, this.world.heightAt(this.x, this.z), 10, dt);
    this.spin += (this.speed / WHEEL_R) * dt;
    this.updateCollider();
    this.sync();
  }

  sync() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
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

/** Parked cars: courtyards, the parking lot, the curb. */
const PARKED = [
  { x: -24, z: -39, heading: 0.06, color: 0x4a6076 },
  { x: -21, z: -39, heading: 0.02, color: 0x8a7a62 },
  { x: 44, z: -14, heading: Math.PI / 2, color: 0x6d3a30 },
  { x: 44, z: -8.5, heading: Math.PI / 2, color: 0x3f4a45 },
  { x: -38, z: 30, heading: 0.04, color: 0x5a5f63 },
  { x: -63, z: -44, heading: Math.PI / 2 + 0.06, color: 0x7d8078 },
  { x: 64, z: 111.5, heading: 0.04, color: 0x54585e, north: true },
  { x: 71.5, z: 111.5, heading: -0.05, color: 0x6b4a3a, north: true },
  // at the curb of the avenue, facing the traffic flow
  { x: 4.75, z: 86, heading: 0, color: 0xc9c2a8, curb: true },
  { x: -4.75, z: -28, heading: Math.PI, color: 0x8c2f28, curb: true },
];

export function buildVehicles(ctx) {
  const { world, materials: M } = ctx;
  const parts = sedanParts();
  const mats = {
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2229, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.82 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.35 }),
    lamps: new THREE.MeshBasicMaterial({ vertexColors: true }),
    snow: M.snow,
  };
  // While the world is being built, the scatter passes (trees, routes) must
  // see the parked cars exactly as they always were: the old axis-aligned
  // 2.5 × 4.7 m footprints. They go in as temporary rects (dropped once the
  // build is done, see World.build), the cars' own colliders take over then.
  world.cars = PARKED.map((spec, i) => {
    if (!spec.curb) {
      const rect = { minX: spec.x - 1.25, maxX: spec.x + 1.25, minZ: spec.z - 2.35, maxZ: spec.z + 2.35, buildOnly: true };
      world.colliders.push(rect);
      if (!spec.north) ctx.addLegacyGhostRect(rect.minX, rect.maxX, rect.minZ, rect.maxZ);
    }
    const car = new Car(world, parts, mats, { ...spec, id: i });
    world.group.add(car.root);
    ctx.seasonable('winter', car.snow);
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
