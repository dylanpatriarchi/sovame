// Light traffic: a handful of sedans (the same Car as the parked ones) going
// slowly round the block formed by the avenue, ул. Школьная, ул. Строителей
// and the cross street, two each way, keeping to the right-hand lane. They
// follow a fixed lane path, slow down for the corners and stop for whatever
// stands in their lane: the player, a passer-by, the car being driven, or
// the vehicle in front. The bus runs on the southbound-first loop and calls
// at the bus stop on the avenue (pulls over, opens its doors, waits).
import { clamp, damp } from '../util.js';
import { WORLD } from '../config.js';
import { Car } from './vehicles.js';
import { Bus, BUS } from './bus.js';

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

/** The bus at the stop: how far it pulls over, and the timings of a call (s). */
const PULL_OVER = 1.7;
const PULL_IN = [34, 10]; // starts / has pulled over this far before the stop (m)
const PULL_OUT = [-1, -24]; // starts / is back in lane this far past it
const DOORS_OPEN = [0.8, 2.0]; // folding open, from the moment it stops
const DOORS_SHUT = [8.0, 9.2]; // folding shut
const DWELL = 10.4; // pulls out

/** The cars: loop direction (1 = avenue southbound first) and start share. */
const FLEET = [
  { dir: 1, at: 0.08, color: 0x6f7f5a },
  { dir: 1, at: 0.58, color: 0x2d3b52 },
  { dir: -1, at: 0.3, color: 0xa79f86 },
  { dir: -1, at: 0.8, color: 0x7a2b25 },
  { dir: 1, at: 0.33, bus: true },
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
    const at = { x: path.x[i], z: path.z[i], heading: path.heading[i], color: spec.color, id: `traffic-${k}` };
    const car = spec.bus ? new Bus(world, ctx.materials.snow, at) : new Car(world, kit.parts, kit.mats, at);
    car.root.name = spec.bus ? 'bus' : `traffic-${k}`;
    world.group.add(car.root);
    ctx.seasonable('winter', car.snow);
    const half = spec.bus ? BUS.length / 2 : HALF_LENGTH;
    const clear = spec.bus ? BUS.width / 2 : CLEAR;
    return { car, path, dir: spec.dir, s, speed: 0, half, clear, bus: spec.bus ? { state: 'run', t: 0 } : null };
  });
  world.trafficCars = cars.map((t) => t.car);

  // the bus stop: the bus halts with the shelter between its two doors
  const busT = cars.find((t) => t.bus);
  const stopZ = (world.points.busStop?.z ?? 24) + 2;
  let stopS = 0;
  {
    const p = busT.path;
    let best = Infinity;
    for (let i = 0; i < p.count; i++) {
      const d = Math.abs(p.x[i] - LANE) + Math.abs(p.z[i] - stopZ);
      if (d < best) {
        best = d;
        stopS = p.s[i];
      }
    }
  }
  world.bus = busT.car;
  busT.stopS = stopS;

  /** Signed path distance from s to the bus stop, in (-len/2, len/2]. */
  const toStop = (s) => {
    const len = busT.path.length;
    const d = (((stopS - s) % len) + len) % len;
    return d > len / 2 ? d - len : d;
  };
  const ease = (x) => x * x * (3 - 2 * x);
  /**
   * How far right of its lane the vehicle t runs at path distance s: the
   * bus eases over to the curb before the stop and back after it (a fixed
   * profile, so its axles trace it one after the other, like a real one).
   */
  const sideAt = (t, s) => {
    if (!t.bus) return 0;
    const q = toStop(s);
    if (q > PULL_IN[0] || q < PULL_OUT[1]) return 0;
    if (q > PULL_IN[1]) return PULL_OVER * ease((PULL_IN[0] - q) / (PULL_IN[0] - PULL_IN[1]));
    if (q < PULL_OUT[0]) return PULL_OVER * ease((q - PULL_OUT[1]) / (PULL_OUT[0] - PULL_OUT[1]));
    return PULL_OVER;
  };
  /** Point of the lane at path distance s, moved `side` m to the right. */
  const _pt = { x: 0, z: 0, heading: 0, curve: 0 };
  const pointAt = (path, s, side = 0) => {
    s = ((s % path.length) + path.length) % path.length;
    const i = indexAt(path, s);
    const j = (i + 1) % path.count;
    const f = clamp((s - path.s[i]) / Math.max(1e-4, path.s[i + 1] - path.s[i]), 0, 1);
    let dh = path.heading[j] - path.heading[i];
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const h = path.heading[i] + dh * f;
    // the driver's right is (-cos h, sin h)
    _pt.x = path.x[i] + (path.x[j] - path.x[i]) * f - Math.cos(h) * side;
    _pt.z = path.z[i] + (path.z[j] - path.z[i]) * f + Math.sin(h) * side;
    _pt.heading = h;
    _pt.curve = path.curve[i];
    return _pt;
  };

  /** Free road ahead of a car's front bumper, keeping a gap (Infinity if clear). */
  function roomAhead(t, points) {
    const { path } = t;
    let room = Infinity;
    // the vehicle in front on the same loop, by path distance (centre to centre)
    for (const o of cars) {
      if (o === t || o.path !== path) continue;
      const d = (((o.s - t.s) % path.length) + path.length) % path.length;
      if (d < LOOK + t.half + o.half) room = Math.min(room, d - t.half - o.half - GAP);
    }
    // anything else standing in the corridor ahead, from the vehicle's own centre
    for (let d = 0; d < LOOK + t.half && d - t.half - GAP < room; d += 0.75) {
      const { x, z } = pointAt(path, t.s + d, sideAt(t, t.s + d));
      for (const p of points) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < (t.clear + p.r) ** 2) {
          room = Math.min(room, d - t.half - GAP);
          break;
        }
      }
    }
    return room;
  }

  /**
   * The bus's call at the stop: the speed it allows. Runs (pulls over as it
   * nears the stop), dwells (doors open, then shut), leaves (pulls out).
   */
  function busCall(t, dt) {
    const b = t.bus;
    const d = toStop(t.s);
    const bus = t.car;
    if (b.state === 'run') {
      if (d > -1 && d < 0.6 && t.speed < 0.4) {
        b.state = 'dwell';
        b.t = 0;
        return 0;
      }
      return d > -1 ? Math.sqrt(2 * DECEL * 0.45 * Math.max(0, d - 0.3)) + 0.25 * clamp(d, 0, 1) : CRUISE;
    }
    if (b.state === 'dwell') {
      const before = b.t;
      b.t += dt;
      // the hiss of the air as the doors fold open and shut again
      if (before < DOORS_OPEN[0] && b.t >= DOORS_OPEN[0]) bus.hiss = true;
      if (before < DOORS_SHUT[0] && b.t >= DOORS_SHUT[0]) bus.hiss = true;
      bus.doors =
        b.t < DOORS_SHUT[0] ? clamp((b.t - DOORS_OPEN[0]) / (DOORS_OPEN[1] - DOORS_OPEN[0]), 0, 1) : clamp(1 - (b.t - DOORS_SHUT[0]) / (DOORS_SHUT[1] - DOORS_SHUT[0]), 0, 1);
      if (b.t >= DWELL) b.state = 'leave';
      return 0;
    }
    // leaving: on to the next lap once well past the stop
    if (d < -20) b.state = 'run';
    return CRUISE;
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
        if (t.bus) target = Math.min(target, busCall(t, dt));
        t.speed = target < t.speed ? Math.max(target, t.speed - DECEL * 1.6 * dt) : Math.min(target, t.speed + ACCEL * dt);
        t.s = (t.s + t.speed * dt) % path.length;

        const i = indexAt(path, t.s);
        if (t.bus) {
          // the axles each trace the lane (pulled over near the stop): the
          // body hangs between them, the front wheels point along their trace
          const at = (s) => {
            const p = pointAt(path, s, sideAt(t, s));
            return [p.x, p.z];
          };
          const fa = at(t.s + BUS.frontAxle);
          const ra = at(t.s + BUS.rearAxle);
          const heading = Math.atan2(fa[0] - ra[0], fa[1] - ra[1]);
          car.heading = heading;
          car.x = ra[0] - Math.sin(heading) * BUS.rearAxle;
          car.z = ra[1] - Math.cos(heading) * BUS.rearAxle;
          const f0 = at(t.s + BUS.frontAxle - 0.5);
          const f1 = at(t.s + BUS.frontAxle + 0.5);
          let steer = Math.atan2(f1[0] - f0[0], f1[1] - f0[1]) - heading;
          steer = Math.atan2(Math.sin(steer), Math.cos(steer));
          car.steer = damp(car.steer, steer, 6, dt);
        } else {
          const p = pointAt(path, t.s);
          car.x = p.x;
          car.z = p.z;
          car.heading = p.heading;
          // the front wheels follow the curve
          car.steer = damp(car.steer, Math.atan(2.42 * path.curve[i]), 6, dt);
        }
        car.speed = t.speed;
        // the body dips when braking
        const accel = (t.speed - (t.lastSpeed ?? t.speed)) / Math.max(dt, 1e-3);
        t.lastSpeed = t.speed;
        car.pitch = damp(car.pitch, clamp(-accel * 0.006, -0.03, 0.02), 5, dt);
        car.roll = damp(car.roll, clamp(path.curve[i] * t.speed * t.speed * 0.004, -0.04, 0.04), 4, dt);
        car.y = damp(car.y, world.heightAt(car.x, car.z), 10, dt);
        car.spin += (t.speed / (t.bus ? BUS.wheelR : 0.3)) * dt;
        car.lamps.visible = lit;
        car.setLights(lit ? 1 : 0);
        car.updateCollider();
        car.sync();
      }
    },
  };
}
