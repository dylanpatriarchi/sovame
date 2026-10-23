// Light traffic: a handful of sedans (the same Car as the parked ones) going
// slowly round the block formed by the avenue, ул. Школьная, ул. Строителей
// and the cross street, two each way, keeping to the right-hand lane. They
// follow a fixed lane path, slow down for the corners and stop for whatever
// stands in their lane: the player, a passer-by, the car being driven, or
// the car in front.
import { clamp, damp } from '../util.js';
import { WORLD } from '../config.js';
import { Car } from './vehicles.js';

/** Corners of the block, along the road centre lines (x, z). */
const BLOCK = [
  [0, WORLD.crossroadZ],
  [0, WORLD.southStreetZ],
  [WORLD.westStreetX, WORLD.southStreetZ],
  [WORLD.westStreetX, WORLD.crossroadZ],
];
const LANE = 2.8; // lane centre, right of the road centre line
const CORNER = 7; // turning radius at the junctions (m)
const CRUISE = 7; // ~25 km/h
const CORNER_SPEED = 3.6;
const ACCEL = 1.6;
const DECEL = 3.2;
const STEP = 0.5; // path sampling (m)
const LOOK = 22; // how far ahead a driver watches its lane (m)
const CLEAR = 1.25; // half width of the watched corridor (m)
const GAP = 2; // gap kept between the bumper and an obstacle (m)
const HALF_LENGTH = 2.05;

/** The cars: loop direction (1 = avenue southbound first) and start share. */
const FLEET = [
  { dir: 1, at: 0.08, color: 0x6f7f5a },
  { dir: 1, at: 0.58, color: 0x2d3b52 },
  { dir: -1, at: 0.3, color: 0xa79f86 },
  { dir: -1, at: 0.8, color: 0x7a2b25 },
];

/** Lane path round the block: offset corners, rounded, sampled every STEP. */
function lanePath(dir) {
  const corners = dir > 0 ? BLOCK : [...BLOCK].reverse();
  const n = corners.length;
  // each edge shifted to the driver's right, corners where they meet
  const shifted = corners.map((p, i) => {
    const q = corners[(i + 1) % n];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const dx = (q[0] - p[0]) / len;
    const dz = (q[1] - p[1]) / len;
    return { dx, dz, ox: -dz * LANE, oz: dx * LANE };
  });
  const lane = corners.map((p, i) => {
    const a = shifted[(i - 1 + n) % n];
    const b = shifted[i];
    // the corner of two perpendicular shifted edges takes both offsets
    return [p[0] + a.ox + b.ox, p[1] + a.oz + b.oz];
  });
  const pts = [];
  for (let i = 0; i < n; i++) {
    const c = lane[i];
    const din = shifted[(i - 1 + n) % n];
    const dout = shifted[i];
    // the turn: a quadratic curve from CORNER before to CORNER after
    const s = [c[0] - din.dx * CORNER, c[1] - din.dz * CORNER];
    const e = [c[0] + dout.dx * CORNER, c[1] + dout.dz * CORNER];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const u = 1 - t;
      pts.push([u * u * s[0] + 2 * u * t * c[0] + t * t * e[0], u * u * s[1] + 2 * u * t * c[1] + t * t * e[1]]);
    }
  }
  // resample evenly, with heading and a speed limit from the curvature
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.round(len / STEP));
    for (let k = 0; k < steps; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  }
  const m = dense.length;
  const path = { x: new Float32Array(m), z: new Float32Array(m), heading: new Float32Array(m), curve: new Float32Array(m), limit: new Float32Array(m), s: new Float32Array(m + 1) };
  for (let i = 0; i < m; i++) {
    path.x[i] = dense[i][0];
    path.z[i] = dense[i][1];
    const b = dense[(i + 1) % m];
    path.heading[i] = Math.atan2(b[0] - dense[i][0], b[1] - dense[i][1]);
    path.s[i + 1] = path.s[i] + Math.hypot(b[0] - dense[i][0], b[1] - dense[i][1]);
  }
  path.length = path.s[m];
  path.count = m;
  for (let i = 0; i < m; i++) {
    let dh = path.heading[(i + 1) % m] - path.heading[i];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    path.curve[i] = dh / Math.max(1e-3, path.s[i + 1] - path.s[i]);
    path.limit[i] = Math.abs(path.curve[i]) > 0.02 ? CORNER_SPEED : CRUISE;
  }
  return path;
}

/** Index of the path sample at distance s (wraps). */
function indexAt(path, s) {
  s = ((s % path.length) + path.length) % path.length;
  // samples are almost evenly spaced: guess, then correct
  let i = Math.min(path.count - 1, Math.floor((s / path.length) * path.count));
  while (i > 0 && path.s[i] > s) i--;
  while (i < path.count - 1 && path.s[i + 1] <= s) i++;
  return i;
}

export function buildTraffic(ctx) {
  const { world } = ctx;
  const kit = world.carKit;
  const paths = { 1: lanePath(1), [-1]: lanePath(-1) };
  const cars = FLEET.map((spec, k) => {
    const path = paths[spec.dir];
    const s = spec.at * path.length;
    const i = indexAt(path, s);
    // live-only: no collider exists until the world is built (Car parks it
    // far away), so the seeded scatter passes never see these cars
    const car = new Car(world, kit.parts, kit.mats, { x: path.x[i], z: path.z[i], heading: path.heading[i], color: spec.color, id: `traffic-${k}` });
    car.root.name = `traffic-${k}`;
    world.group.add(car.root);
    ctx.seasonable('winter', car.snow);
    return { car, path, dir: spec.dir, s, speed: 0, blocked: 0 };
  });
  world.trafficCars = cars.map((t) => t.car);

  /** Free road ahead of a car's front bumper, keeping a gap (Infinity if clear). */
  function roomAhead(t, points) {
    const { path } = t;
    let room = Infinity;
    // the car in front on the same loop, by path distance (centre to centre)
    for (const o of cars) {
      if (o === t || o.path !== path) continue;
      const d = (((o.s - t.s) % path.length) + path.length) % path.length;
      if (d < LOOK + HALF_LENGTH * 2) room = Math.min(room, d - HALF_LENGTH * 2 - GAP);
    }
    // anything else standing in the corridor ahead, from the car's own centre
    for (let d = 0; d < LOOK && d - HALF_LENGTH - GAP < room; d += 0.75) {
      const i = indexAt(path, t.s + d);
      const x = path.x[i];
      const z = path.z[i];
      for (const p of points) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < (CLEAR + p.r) ** 2) {
          room = Math.min(room, d - HALF_LENGTH - GAP);
          break;
        }
      }
    }
    return room;
  }

  world.traffic = {
    cars,
    paths,
    /**
     * keepClear: [{ x, z }] people the drivers must not run over (the
     * player, or the camera on the title screen). lights: 0..1 street-lamp
     * level, the headlights come on with the lamps.
     */
    update(dt, { keepClear = [], lights = 0 } = {}) {
      const points = [];
      for (const p of keepClear) points.push({ x: p.x, z: p.z, r: 0.5 });
      for (const p of world.people?.list ?? []) points.push({ x: p.position.x, z: p.position.z, r: 0.4 });
      for (const c of world.cars ?? []) if (c.driven) points.push({ x: c.x, z: c.z, r: 2.3 });
      const lit = lights > 0.15;
      for (const t of cars) {
        const { car, path } = t;
        // the speed the corners ahead allow (braking in time)
        let target = CRUISE;
        for (let d = 0; d < 24; d += 2) {
          const limit = path.limit[indexAt(path, t.s + d)];
          target = Math.min(target, Math.sqrt(limit * limit + 2 * DECEL * 0.6 * d));
        }
        // and the room left before the obstacle
        const room = roomAhead(t, points);
        if (room < Infinity) target = Math.min(target, Math.sqrt(2 * DECEL * Math.max(0, room)));
        if (room < 0.2) target = 0;
        t.speed = target < t.speed ? Math.max(target, t.speed - DECEL * 1.6 * dt) : Math.min(target, t.speed + ACCEL * dt);
        t.s = (t.s + t.speed * dt) % path.length;

        const i = indexAt(path, t.s);
        const j = (i + 1) % path.count;
        const f = clamp((t.s - path.s[i]) / Math.max(1e-4, path.s[i + 1] - path.s[i]), 0, 1);
        car.x = path.x[i] + (path.x[j] - path.x[i]) * f;
        car.z = path.z[i] + (path.z[j] - path.z[i]) * f;
        let dh = path.heading[j] - path.heading[i];
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        car.heading = path.heading[i] + dh * f;
        car.speed = t.speed;
        // the front wheels follow the curve, the body dips when braking
        car.steer = damp(car.steer, Math.atan(2.42 * path.curve[i]), 6, dt);
        const accel = (t.speed - (t.lastSpeed ?? t.speed)) / Math.max(dt, 1e-3);
        t.lastSpeed = t.speed;
        car.pitch = damp(car.pitch, clamp(-accel * 0.006, -0.03, 0.02), 5, dt);
        car.roll = damp(car.roll, clamp(path.curve[i] * t.speed * t.speed * 0.004, -0.04, 0.04), 4, dt);
        car.y = damp(car.y, world.heightAt(car.x, car.z), 10, dt);
        car.spin += (t.speed / 0.3) * dt;
        car.lamps.visible = lit;
        car.setLights(lit ? 1 : 0);
        car.updateCollider();
        car.sync();
      }
    },
  };
}
