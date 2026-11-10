// Roads out of town, as data: where they run, how high, how wide. The land
// reads this to cut and fill itself under them (land.js); roads.js lays the
// surface, the marker posts and the poles on top.
import { noise2 } from './noise.js';
import { WORLD } from '../config.js';

/** Level of the sea ice (the town pad is 0). */
export const SEA_Y = -0.9;

/** The shoreline: land west of it, the frozen bay east, forever north-south. */
export function coastX(z) {
  return 520 + noise2(z / 760, 3.3, 61) * 86 + noise2(z / 170, 8.1, 67) * 14;
}

/** The bald hill west of town with the viewpoint on its shoulder. */
export const SOPKA = { x: -560, z: 30, sigma: 125, h: 60 };

const STEP = 5;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Control points → an even polyline of ~STEP m samples. */
function resample(points) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2));
    for (let k = 0; k < n; k++) dense.push([catmull(p0[0], p1[0], p2[0], p3[0], k / n), catmull(p0[1], p1[1], p2[1], p3[1], k / n)]);
  }
  dense.push(points[points.length - 1]);
  const out = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = STEP - carry;
    while (at <= len) {
      out.push([a[0] + ((b[0] - a[0]) * at) / len, a[1] + ((b[1] - a[1]) * at) / len]);
      at += STEP;
    }
    carry = (carry + len) % STEP;
  }
  out.push(dense[dense.length - 1]);
  return out;
}

function spiral() {
  // one turn round the sopka, from the town side up to its east shoulder
  const pts = [
    [-240, WORLD.crossroadZ],
    [-290, WORLD.crossroadZ],
  ];
  const turns = 1;
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = 0.02 + t * turns * Math.PI * 2;
    const r = 236 - 184 * t ** 0.9;
    pts.push([SOPKA.x + Math.cos(a) * r, SOPKA.z + Math.sin(a) * r]);
  }
  return pts;
}

function coastRoad() {
  const pts = [
    [0, 184],
    [0, 250],
    [30, 400],
    [150, 590],
  ];
  for (let z = 800; z <= 2300; z += 250) pts.push([coastX(z) - 78 + Math.sin(z / 190) * 14, z]);
  pts.push([coastX(2480) - 40, 2480]);
  return pts;
}

function portRoad() {
  const z = 60;
  return [
    [WORLD.roadHalfWidth + 94, WORLD.crossroad2Z],
    [170, WORLD.crossroad2Z],
    [262, 104],
    [340, 70],
    [coastX(z) - 60, z],
    [coastX(z) + 46, z],
  ];
}

/**
 * id, half-width of the carriageway, an optional round levelled end
 * (`plaza`, radius in m) and a floor for the height (the port mole stands
 * clear of the ice).
 */
export const ROUTES = [
  { id: 'sopka', half: 3.6, plaza: 15, control: spiral(), name: 'Смотровая' },
  { id: 'coast', half: 3.8, plaza: 14, control: coastRoad(), name: 'Маяк' },
  { id: 'port', half: 4.4, plaza: 30, control: portRoad(), floor: 1.25, name: 'Порт' },
];

for (const route of ROUTES) {
  route.pts = resample(route.control);
  route.h = new Float32Array(route.pts.length);
  route.end = route.pts[route.pts.length - 1];
}

/* ---------------------------------------------------------- lookup */

const GRID = 48;
const REACH = 38;
const buckets = new Map();
const key = (i, j) => `${i},${j}`;

function register(entry, x0, x1, z0, z1) {
  for (let j = Math.floor((z0 - REACH) / GRID); j <= Math.floor((z1 + REACH) / GRID); j++) {
    for (let i = Math.floor((x0 - REACH) / GRID); i <= Math.floor((x1 + REACH) / GRID); i++) {
      const k = key(i, j);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(entry);
    }
  }
}

/**
 * Fixes every route's height profile from the untouched terrain: sampled,
 * then smoothed so a car climbs an even grade instead of every hummock.
 * `onPad` marks samples inside the town, which stay at street level.
 */
export function initRoutes(base, onPad) {
  for (const route of ROUTES) {
    const { pts, h } = route;
    const n = pts.length;
    const pinned = pts.map((p) => onPad(p[0], p[1]));
    for (let i = 0; i < n; i++) h[i] = pinned[i] ? 0 : Math.max(base(pts[i][0], pts[i][1]), route.floor ?? 0.1);
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        for (let k = -7; k <= 7; k++) {
          sum += h[Math.min(Math.max(i + k, 0), n - 1)];
          count++;
        }
        tmp[i] = pinned[i] ? 0 : sum / count;
      }
      h.set(tmp);
    }
    if (route.floor) {
      // rise to the floor gently once clear of the town
      let out = 0;
      for (let i = 0; i < n; i++) {
        out = pinned[i] ? 0 : out + 1;
        h[i] = Math.max(h[i], Math.min(route.floor, out * 0.05));
      }
    }
    // the plaza is level: the last stretch of road eases onto it
    const last = h[n - 1];
    const ease = Math.min(8, n - 1);
    for (let k = 0; k < ease; k++) h[n - 1 - k] = last + (h[n - 1 - k] - last) * (k / ease) ** 2;
    route.endH = h[n - 1];
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      register({ route, i }, Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]));
    }
    if (route.plaza) register({ route, disc: true }, route.end[0] - route.plaza, route.end[0] + route.plaza, route.end[1] - route.plaza, route.end[1] + route.plaza);
  }
}

const hit = { d: 0, h: 0, half: 0, route: null };

/** The nearest road within reach of a point: distance from its centre line,
 * its height there and its half-width — or null. The result is reused. */
export function routeAt(x, z) {
  const list = buckets.get(key(Math.floor(x / GRID), Math.floor(z / GRID)));
  if (!list) return null;
  let best = Infinity;
  for (const e of list) {
    const { route } = e;
    let d;
    let h;
    if (e.disc) {
      d = Math.max(0, Math.hypot(x - route.end[0], z - route.end[1]) - route.plaza + route.half);
      h = route.endH;
    } else {
      const a = route.pts[e.i];
      const b = route.pts[e.i + 1];
      const vx = b[0] - a[0];
      const vz = b[1] - a[1];
      const t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz)));
      d = Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
      h = route.h[e.i] + (route.h[e.i + 1] - route.h[e.i]) * t;
    }
    if (d - route.half < best) {
      best = d - route.half;
      hit.d = d;
      hit.h = h;
      hit.half = route.half;
      hit.route = route;
    }
  }
  return best === Infinity ? null : hit;
}
