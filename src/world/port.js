// The sea port at the end of the road: from the roundabout a spur runs north
// to the White Sea coast and the gate of the trading port (морской торговый
// порт). Behind the fence: a concrete apron, two warehouses, stacks of
// containers and packaged timber, three portal cranes on their rails along
// the quay, and the freighter «Полярный» moored at the berth. A breakwater
// runs out to a lighthouse. In winter the sea is frozen to the horizon but for
// the channel an icebreaker keeps open; in autumn it is grey open water.
//
// Like the highway it draws from its own seeds, and its colliders go up only
// once the world is built. The ground you may walk on out here is the spur,
// the apron and the breakwater (openPort).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas } from '../util.js';
import { canvasTexture, makeGlowTexture, makeBeamTexture, makeSignTexture } from '../textures.js';

/** The spur: its centre line (x) and how far it runs (z), from the roundabout's north side. */
export const SPUR = { x: 2262, z0: 80, z1: 302 };
const SPUR_HALF = 4.1; // asphalt
const SPUR_SHOULDER = 6.6;
const SPUR_OPEN = 7.2;
/** The port's apron, behind its fence; the quay edge is its north side. */
export const YARD = { x0: 2186, x1: 2370, z0: 300, z1: 380 };
/** The breakwater out to the lighthouse. */
export const MOLE = { x0: 2352, x1: 2364, z0: YARD.z1 - 1, z1: 474 };
/** The sea: everything north of the coast (z) east of the headland (x). */
export const SEA = { x0: 1950, z0: YARD.z1 };
export const WATER_Y = -1.6;
const ICE_Y = -1.25;
const EDGE = 0.4; // how close to a fence or the quay edge you can walk
const GATE = { x0: SPUR.x - 8, x1: SPUR.x + 8 };

/** Whether a circle of radius r stands on the port's open ground. */
export function openPort(x, z, r = 0) {
  if (Math.abs(x - SPUR.x) + r <= SPUR_OPEN && z - r >= SPUR.z0 && z + r <= YARD.z0 + 2) return true;
  if (x - r >= YARD.x0 + EDGE && x + r <= YARD.x1 - EDGE && z - r >= YARD.z0 + EDGE && z + r <= YARD.z1 - EDGE) return true;
  // through the gate
  if (x - r >= GATE.x0 && x + r <= GATE.x1 && z >= YARD.z0 - 2 && z <= YARD.z0 + 2) return true;
  return x - r >= MOLE.x0 + EDGE && x + r <= MOLE.x1 - EDGE && z - r >= MOLE.z0 && z + r <= MOLE.z1 - EDGE;
}

/** What is underfoot (null: not the port's). */
export function portSurface(x, z) {
  if (z >= SPUR.z0 && z <= YARD.z0 && Math.abs(x - SPUR.x) <= SPUR_SHOULDER) return Math.abs(x - SPUR.x) <= SPUR_HALF ? 'asphalt' : 'stone';
  if (x >= YARD.x0 && x <= YARD.x1 && z >= YARD.z0 && z <= YARD.z1) return 'asphalt';
  if (x >= MOLE.x0 && x <= MOLE.x1 && z >= MOLE.z0 && z <= MOLE.z1) return 'stone';
  return null;
}

/** The port, the spur and the sea, with a margin (the steppe keeps its groves and haystacks out). */
export function nearPort(x, z, margin = 12) {
  if (x > SEA.x0 - margin && z > SEA.z0 - margin) return true;
  if (Math.abs(x - SPUR.x) < SPUR_OPEN + margin && z > SPUR.z0 + 10 && z < YARD.z0) return true;
  return x > YARD.x0 - margin && x < YARD.x1 + margin && z > YARD.z0 - margin;
}

/* ------------------------------------------------------------- textures */

function noiseCanvas(size, seed, draw) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  draw(g, new Rng(seed), size);
  return c;
}

/** Sea ice: wind-packed snow over grey ice, cracks and pressure ridges. */
function iceTexture() {
  const c = noiseCanvas(512, 52501, (g, rng, S) => {
    g.fillStyle = '#dfe6ec';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 140; k++) {
      const x = rng.float(0, S);
      const y = rng.float(0, S);
      const r = rng.float(10, 60);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const blue = rng.chance(0.4);
      grad.addColorStop(0, blue ? 'rgba(150,172,190,0.35)' : 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(140,158,174,0.35)';
    for (let k = 0; k < 14; k++) {
      g.lineWidth = rng.float(0.5, 1.1);
      g.beginPath();
      let x = rng.float(0, S);
      let y = rng.float(0, S);
      g.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += rng.float(-14, 14);
        y += rng.float(-14, 14);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  return canvasTexture(c);
}

/** Ripples for the open water (a bump map, scrolled with the wind). */
function rippleTexture() {
  const c = noiseCanvas(256, 52502, (g, rng, S) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, S, S);
    for (let k = 0; k < 420; k++) {
      const x = rng.float(0, S);
      const y = rng.float(0, S);
      const w = rng.float(8, 30);
      g.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(x, y, w, w * 0.22, 0, 0, TAU);
      g.fill();
      // (and its copies across the edges, so the tile wraps)
      for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]]) {
        g.beginPath();
        g.ellipse(x + dx, y + dy, w, w * 0.22, 0, 0, TAU);
        g.fill();
      }
    }
  });
  return canvasTexture(c, { srgb: false });
}

/** Concrete apron slabs (ПАГ plates), 6 x 2 m, with their seams. */
function slabTexture() {
  const c = noiseCanvas(512, 52503, (g, rng, S) => {
    g.fillStyle = '#8f8d87';
    g.fillRect(0, 0, S, S);
    // the tile is 12 x 12 m: 2 slabs across, 6 down
    const sw = S / 2;
    const sh = S / 6;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 2; col++) {
        const off = row % 2 ? sw / 2 : 0;
        const k = rng.int(-12, 12);
        g.fillStyle = `rgb(${143 + k},${141 + k},${135 + k})`;
        g.fillRect(col * sw + off + 2, row * sh + 2, sw - 4, sh - 4);
        if (off) g.fillRect(off - sw + 2 + col * sw, row * sh + 2, sw - 4, sh - 4);
        // the dimpled pattern of the airfield slab
        g.fillStyle = 'rgba(70,68,64,0.18)';
        for (let i = 0; i < 40; i++) g.fillRect(col * sw + rng.float(4, sw - 6), row * sh + rng.float(4, sh - 6), 3, 3);
      }
    }
    g.fillStyle = 'rgba(40,38,36,0.55)';
    for (let row = 0; row <= 6; row++) g.fillRect(0, row * sh - 1, S, 2);
  });
  return canvasTexture(c);
}

/** Corrugated steel (warehouse walls, containers): vertical ribs. */
function ribTexture() {
  const c = noiseCanvas(128, 52504, (g, rng, S) => {
    for (let x = 0; x < S; x++) {
      const v = 175 + 60 * Math.sin((x / S) * TAU * 8);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, S);
    }
    g.fillStyle = 'rgba(90,60,40,0.25)';
    for (let k = 0; k < 30; k++) g.fillRect(rng.float(0, S), rng.float(0, S), rng.float(1, 4), rng.float(4, 30));
  });
  return canvasTexture(c);
}

/* -------------------------------------------------------------- helpers */

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
      if (list.some((g) => !g.attributes.uv)) for (const g of list) g.attributes.uv && g.deleteAttribute('uv');
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(season ? ctx.seasonable(season, mesh) : mesh);
    }
    this.buckets.clear();
  }
}

/** A box with uv in metres / tile on every face. */
function box(w, h, d, tile = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!tile) return g;
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, (uv.getX(v) * sizes[f][0]) / tile, (uv.getY(v) * sizes[f][1]) / tile);
  return g;
}

/** A flat plane on the ground (y), uv in metres / tile. */
function flat(x0, x1, z0, z1, y, tile) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / tile, (uv.getY(i) * (z1 - z0)) / tile);
  return g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** A beam from a to b (THREE.Vector3), square section s. */
function beam(a, b, s) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(s, len, s);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/* ---------------------------------------------------------------- ships */

/**
 * A ship's hull in plan (bow toward -x), extruded from `bottom` to `top`
 * (y, local). `L` length, `B` beam; `bluff` how full the bow is (0..1).
 */
function hullGeo(L, B, bottom, top, bluff = 0.35, stern = 0.12) {
  const s = new THREE.Shape();
  const h = B / 2;
  const bowLen = L * (0.32 - bluff * 0.12);
  s.moveTo(L / 2, -h + B * stern);
  s.quadraticCurveTo(L / 2, -h, L / 2 - B * stern, -h);
  s.lineTo(-L / 2 + bowLen, -h);
  s.quadraticCurveTo(-L / 2 + bowLen * bluff, -h, -L / 2, 0);
  s.quadraticCurveTo(-L / 2 + bowLen * bluff, h, -L / 2 + bowLen, h);
  s.lineTo(L / 2 - B * stern, h);
  s.quadraticCurveTo(L / 2, h, L / 2, h - B * stern);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: top - bottom, bevelEnabled: false, curveSegments: 10 });
  // shape (x, y) -> plan (x, z); depth -> up
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  g.deleteAttribute('uv');
  return g;
}

/** A plate of text (canvas) for a hull's name. */
function namePlate(text, w, h, color = '#f1ede4') {
  const tex = makeSignTexture(512, 96, (c, W, H) => {
    c.clearRect(0, 0, W, H);
    c.fillStyle = color;
    c.font = 'bold 70px "Arial Narrow", Arial, sans-serif';
    c.fillText(text, W / 2, H / 2 + 4);
  });
  return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.7 });
}

/** The funnel band of the Soviet merchant fleet: red, with a hammer and sickle. */
function funnelTexture() {
  return makeSignTexture(256, 128, (c, W, H) => {
    c.fillStyle = '#1b1b1d';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#b3241d';
    c.fillRect(0, H * 0.25, W, H * 0.5);
    // a hammer and sickle on each side (the texture wraps round twice)
    for (const cx of [W * 0.25, W * 0.75]) {
      c.strokeStyle = '#e7c443';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(cx, H / 2, 17, Math.PI * 0.15, Math.PI * 1.35);
      c.stroke();
      c.fillStyle = '#e7c443';
      c.save();
      c.translate(cx, H / 2);
      c.rotate(-Math.PI / 4);
      c.fillRect(-3, -20, 6, 38);
      c.fillRect(-10, -22, 20, 8);
      c.restore();
    }
  });
}

/**
 * A ship built into `parts` in its own frame (bow toward -x, waterline y = 0),
 * then placed by `matrix`. kind: 'cargo' | 'icebreaker' | 'tug'.
 */
function buildShip(parts, mats, kind, name, matrix, winter) {
  const put = (mat, geo, opts) => parts.add(mat, geo.applyMatrix4(matrix), opts);
  const spec = {
    cargo: { L: 116, B: 17, free: 5, bluff: 0.3, hull: mats.hullBlack },
    icebreaker: { L: 92, B: 22, free: 6, bluff: 0.55, hull: mats.hullRed },
    tug: { L: 26, B: 8, free: 2.4, bluff: 0.5, hull: mats.hullBlack },
  }[kind];
  const { L, B, free } = spec;
  // the hull, the red boot-topping at the waterline, the deck
  put(spec.hull, hullGeo(L, B, -1.0, free, spec.bluff));
  put(mats.hullRed, hullGeo(L + 0.06, B + 0.06, -1.4, 0.5, spec.bluff));
  put(mats.deck, hullGeo(L - 0.5, B - 0.5, free - 0.2, free + 0.02, spec.bluff), { cast: false });
  if (winter) put(mats.snow, hullGeo(L - 1.4, B - 1.4, free + 0.02, free + 0.1, spec.bluff), { season: 'winter', cast: false });
  // a white stripe below the deck edge, and the name on both bows
  put(mats.white, hullGeo(L + 0.04, B + 0.04, free - 0.5, free - 0.25, spec.bluff), { cast: false });
  if (name) {
    for (const s of [-1, 1]) {
      const plate = new THREE.PlaneGeometry(L * 0.11, L * 0.022);
      if (s < 0) plate.rotateY(Math.PI);
      // (just aft of the bow's flare, where the side runs straight)
      plate.translate(-L / 2 + L * (0.32 - spec.bluff * 0.12) + L * 0.07, free - 1.4, s * (B / 2 + 0.06));
      put(mats.names.get(name), plate, { cast: false });
    }
  }
  const lamps = [];
  if (kind === 'cargo') {
    // forecastle
    put(spec.hull, hullGeo(L * 0.14, B * 0.86, free, free + 2.2, 0.6).translate(-L / 2 + L * 0.075, 0, 0));
    // four hatches, kingposts with their derricks, the foremast
    for (const hx of [-36, -16, 4, 22]) {
      put(mats.hatch, box(10, 1.3, B - 5).translate(hx, free + 0.6, 0));
      if (winter) put(mats.snow, box(9.8, 0.2, B - 5.2).translate(hx, free + 1.35, 0), { season: 'winter', cast: false });
    }
    for (const kx of [-26, -6, 13]) {
      for (const s of [-1, 1]) {
        put(mats.white, box(0.6, 11, 0.6).translate(kx, free + 5.5, s * 3));
        const a = new THREE.Vector3(kx, free + 2, s * 3);
        const b = new THREE.Vector3(kx + (kx < 0 ? -8 : 8), free + 7.5, s * 2.4);
        put(mats.hullBlack, beam(a, b, 0.3));
      }
      put(mats.white, box(0.5, 0.5, 6.6).translate(kx, free + 10.8, 0));
    }
    put(mats.white, box(0.5, 16, 0.5).translate(-46, free + 8, 0));
    lamps.push(new THREE.Vector3(-46, free + 16.3, 0));
    // the superstructure aft: three decks and the bridge with its wings
    const sx = 40;
    put(mats.white, box(16, 3, B - 1.5).translate(sx, free + 1.5, 0));
    put(mats.white, box(13, 2.8, B - 3).translate(sx - 1, free + 4.4, 0));
    put(mats.white, box(7, 2.6, B + 1.5).translate(sx - 3, free + 7.1, 0));
    put(mats.glassLit, box(0.1, 1.0, B - 4).translate(sx - 6.56, free + 7.4, 0), { cast: false });
    for (const [y, w] of [[1.7, B - 1.5], [4.6, B - 3]]) for (const s of [-1, 1]) put(mats.glassLit, box(10, 0.7, 0.1).translate(sx, free + y, (s * w) / 2 + s * 0.06), { cast: false });
    // the funnel
    put(mats.funnel, new THREE.CylinderGeometry(2.0, 2.2, 6, 16).scale(1.4, 1, 1).translate(sx + 4, free + 9.5, 0));
    put(mats.white, box(0.3, 6, 0.3).translate(sx - 3, free + 11.4, 0));
    lamps.push(new THREE.Vector3(sx - 3, free + 14.5, 0));
  } else if (kind === 'icebreaker') {
    // the long superstructure forward of amidships, the bridge on top, two funnels
    put(mats.white, box(36, 3.2, B - 3).translate(-6, free + 1.6, 0));
    put(mats.white, box(26, 3, B - 5).translate(-8, free + 4.7, 0));
    put(mats.white, box(10, 2.8, B + 1).translate(-14, free + 7.6, 0));
    put(mats.glassLit, box(0.1, 1.0, B - 2).translate(-19.06, free + 7.9, 0), { cast: false });
    for (const [y, w] of [[2.1, B - 3], [5.1, B - 5]]) for (const s of [-1, 1]) put(mats.glassLit, box(24, 0.7, 0.1).translate(-7, free + y, (s * w) / 2 + s * 0.06), { cast: false });
    for (const fx of [4, 11]) put(mats.funnel, new THREE.CylinderGeometry(1.8, 2.0, 6, 16).scale(1.2, 1, 1).translate(fx, free + 9, 0));
    put(mats.white, box(0.5, 9, 0.5).translate(-12, free + 13.5, 0));
    lamps.push(new THREE.Vector3(-12, free + 18.2, 0));
    // the helicopter deck aft
    put(mats.deck, box(16, 0.3, B - 4).translate(30, free + 3.2, 0));
    for (const s of [-1, 1]) put(mats.white, box(0.3, 3.2, 0.3).translate(24, free + 1.6, s * (B / 2 - 3)));
  } else {
    put(mats.white, box(8, 2.4, B - 2.5).translate(-1, free + 1.2, 0));
    put(mats.white, box(4, 1.8, B - 3.2).translate(-2, free + 3.3, 0));
    put(mats.glassLit, box(0.1, 0.6, B - 3.6).translate(-4.06, free + 3.5, 0), { cast: false });
    put(mats.funnel, new THREE.CylinderGeometry(0.8, 0.9, 2.6, 12).translate(3.5, free + 3.6, 0));
    // the fender round the bow
    put(mats.rubber, hullGeo(L + 0.6, B + 0.6, free - 0.9, free - 0.3, spec.bluff), { cast: false });
    lamps.push(new THREE.Vector3(-2, free + 5.3, 0));
  }
  return lamps.map((p) => p.applyMatrix4(matrix));
}

/* --------------------------------------------------------------- cranes */

/**
 * A portal crane (портальный кран): the portal straddles the rails, the
 * slewing top carries the machinery house, the cab and the luffing boom.
 * Returns { portal, top } in local frames (top turns about y).
 */
function craneGeometry() {
  const portal = [];
  const top = [];
  const H = 10.5; // under the portal
  const G = 5; // half the rail gauge (z) and the leg spread (x)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      portal.push(beam(new THREE.Vector3(sx * (G + 0.6), 0.9, sz * G), new THREE.Vector3(sx * 2.2, H, sz * 2.2), 0.8));
      portal.push(box(3.2, 0.9, 1.0).translate(sx * (G + 0.6), 0.45, sz * G));
    }
    portal.push(box(0.5, 0.5, 2 * G).translate(sx * (G * 0.62), 4.2, 0));
  }
  for (const sz of [-1, 1]) portal.push(box(2 * G + 1.2, 0.6, 0.6).translate(0, 1.6, sz * G));
  portal.push(box(5.6, 1.0, 5.6).translate(0, H + 0.2, 0));
  portal.push(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 20).translate(0, H + 1, 0));
  // the slewing top (boom toward local +x)
  top.push(box(8, 4, 5).translate(-2.5, H + 3.3, 0)); // machinery house
  top.push(box(2.6, 2.8, 4.4).translate(-6.6, H + 2.7, 0)); // counterweight
  top.push(box(2.4, 2.4, 2.2).translate(2.6, H + 2.6, 2.4)); // cab
  // the tower: an A-frame up to the head
  const head = new THREE.Vector3(0.5, H + 14, 0);
  for (const sz of [-1, 1]) {
    top.push(beam(new THREE.Vector3(-2, H + 5.2, sz * 1.8), head, 0.5));
    top.push(beam(new THREE.Vector3(2, H + 5.2, sz * 1.8), head, 0.5));
  }
  // the boom: two chords tapering out to the tip, lattice between
  const foot = new THREE.Vector3(2.2, H + 4, 0);
  const tip = new THREE.Vector3(26, H + 20, 0);
  for (const sz of [-1, 1]) top.push(beam(foot.clone().setZ(sz * 1.1), tip.clone().setZ(sz * 0.3), 0.36));
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    const p = foot.clone().lerp(tip, t);
    const w = 1.1 + (0.3 - 1.1) * t;
    top.push(box(0.16, 0.16, 2 * w).translate(p.x, p.y, 0));
    const q = foot.clone().lerp(tip, t + 1 / 16);
    const wq = 1.1 + (0.3 - 1.1) * (t + 1 / 16);
    for (const sz of [-1, 1]) top.push(beam(new THREE.Vector3(p.x, p.y, sz * w), new THREE.Vector3(q.x, q.y + 0.9, sz * wq * 0.2), 0.12));
  }
  // the jib at the tip, the luffing stays back to the head
  top.push(beam(tip, new THREE.Vector3(31, H + 18, 0), 0.4));
  top.push(beam(head, tip, 0.14));
  top.push(beam(head, new THREE.Vector3(-6, H + 6, 0), 0.14));
  return { portal: mergeGeometries(portal.map((g) => g.toNonIndexed())), top: mergeGeometries(top.map((g) => g.toNonIndexed())), H, jib: new THREE.Vector3(31, H + 18, 0) };
}

/* ---------------------------------------------------------------- build */

export function buildPort(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const T = ctx.textures;
  const winter = world.season === 'winter';
  const group = world.portDetails;
  const rng = new Rng(52511);
  const parts = new Parts();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  // how far the street lamps are on (0 by day, 1 at night)
  const night = () => Math.min(1, world.lampMats.head.emissiveIntensity / 2.4);

  const slabMat = std({ map: slabTexture(), color: winter ? 0xd8dce2 : 0xffffff, roughness: 0.95 });
  const ribTex = ribTexture();
  const glassLit = std({ color: 0x2a2f36, roughness: 0.25, emissive: 0xffc27a, emissiveIntensity: 0.6 });
  world.windowMats.push(glassLit);
  const shipMats = {
    hullBlack: std({ color: 0x24262a, roughness: 0.6, metalness: 0.3 }),
    hullRed: std({ color: 0x9c2b22, roughness: 0.6, metalness: 0.25 }),
    deck: std({ color: 0x6d4a3a, roughness: 0.9 }),
    white: std({ color: 0xe6e3da, roughness: 0.6 }),
    hatch: std({ color: 0x4f6a52, roughness: 0.7, metalness: 0.3 }),
    rubber: std({ color: 0x1a1a1a, roughness: 0.95 }),
    funnel: std({ map: funnelTexture(), roughness: 0.6 }),
    glassLit,
    snow: M.snow,
    names: new Map([
      ['ПОЛЯРНЫЙ', namePlate('ПОЛЯРНЫЙ', 1, 1)],
      ['ДИКСОН', namePlate('ДИКСОН', 1, 1)],
      ['БУКСИР-7', namePlate('БУКСИР-7', 1, 1)],
    ]),
  };
  const craneMats = [std({ color: 0xc7462e, roughness: 0.6, metalness: 0.3 }), std({ color: 0xd8a634, roughness: 0.6, metalness: 0.3 })];
  const steel = std({ color: 0x55595b, roughness: 0.6, metalness: 0.5 });
  const rail = std({ color: 0x6b6460, roughness: 0.5, metalness: 0.6 });

  /* ---- the sea: open water under it all, sea ice over it in winter */
  const WX1 = 3200;
  const WZ1 = 1250;
  const ripples = rippleTexture();
  ripples.repeat.set((WX1 - SEA.x0) / 14, (WZ1 - SEA.z0) / 14);
  const water = new THREE.Mesh(
    flat(SEA.x0, WX1, SEA.z0, WZ1, WATER_Y, WX1 - SEA.x0),
    std({ color: 0x34474f, roughness: 0.3, metalness: 0.1, bumpMap: ripples, bumpScale: 0.6 })
  );
  water.receiveShadow = true;
  water.userData.dynamic = true;
  group.add(water);
  world.updaters.push((dt, t) => {
    if (!group.visible) return;
    ripples.offset.set((t * 0.011) % 1, (t * 0.006) % 1);
  });
  // the channel the icebreaker keeps open: from the berth out to the north-east
  const channel = [
    [2190, 381], [2348, 381], [2348, 416], [2318, 430], [2442, 610], [2492, 682],
    [2508, 712], [2474, 726], [2428, 668], [2300, 452], [2262, 424], [2196, 420],
  ];
  {
    const s = new THREE.Shape();
    s.moveTo(SEA.x0 + 8, -(SEA.z0 + 1));
    s.lineTo(WX1, -(SEA.z0 + 1));
    s.lineTo(WX1, -WZ1);
    s.lineTo(SEA.x0 + 8, -WZ1);
    s.closePath();
    const hole = new THREE.Path();
    channel.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
    hole.closePath();
    s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 4);
    g.rotateX(-Math.PI / 2); // shape y = -z
    const uv = g.attributes.uv;
    const p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 60, p.getZ(i) / 60);
    g.translate(0, ICE_Y, 0);
    const ice = new THREE.Mesh(g, std({ map: iceTexture(), roughness: 0.7 }));
    ice.receiveShadow = true;
    group.add(ctx.seasonable('winter', ice));
    // the broken edge of the channel: a low rim of ice blocks, and floes in it
    const blocks = [];
    const floes = [];
    const frng = new Rng(52512);
    for (let i = 0; i < channel.length; i++) {
      const [ax, az] = channel[i];
      const [bx, bz] = channel[(i + 1) % channel.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (az < SEA.z0 + 2 && bz < SEA.z0 + 2) continue; // (along the quay wall)
      for (let d = 0; d < len; d += frng.float(1.5, 3.5)) {
        const t = d / len;
        const b = box(frng.float(0.8, 2.4), frng.float(0.3, 0.8), frng.float(0.6, 1.8));
        b.rotateY(frng.float(0, TAU)).rotateX(frng.float(-0.4, 0.4));
        blocks.push(b.translate(ax + (bx - ax) * t + frng.float(-0.6, 0.6), ICE_Y + 0.1, az + (bz - az) * t + frng.float(-0.6, 0.6)));
      }
    }
    // floes: inside the channel, clear of the moored ship and the tug
    const inside = (x, z) => {
      let c = false;
      for (let i = 0, j = channel.length - 1; i < channel.length; j = i++) {
        const [xi, zi] = channel[i];
        const [xj, zj] = channel[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    for (let k = 0; k < 400 && floes.length < 90; k++) {
      const x = frng.float(2190, 2500);
      const z = frng.float(384, 720);
      if (!inside(x, z) || (z < 414 && x > 2196 && x < 2346)) continue;
      const r = frng.float(1.2, 4.5);
      const shape = new THREE.Shape();
      const n = frng.int(5, 8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const rr = r * frng.float(0.6, 1.1);
        if (i) shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      const g2 = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
      g2.rotateX(-Math.PI / 2);
      g2.deleteAttribute('uv');
      floes.push(g2.translate(x, WATER_Y - 0.1, z));
    }
    const iceBlock = std({ color: 0xe4ecf2, roughness: 0.55 });
    for (const list of [blocks, floes]) {
      for (const g3 of list) g3.deleteAttribute('uv');
      const m = new THREE.Mesh(mergeGeometries(list.map((g3) => (g3.index ? g3.toNonIndexed() : g3))), iceBlock);
      m.receiveShadow = true;
      group.add(ctx.seasonable('winter', m));
    }
  }

  /* ---- the coast: a shore sloping into the sea either side of the port */
  {
    const shoreMat = winter ? M.snow : std({ color: 0x6f6a5e, roughness: 1 });
    const slope = (x0, x1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, 22, 1, 4);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getZ(i) + 11) / 22; // 0 at the land edge
        p.setY(i, 0.04 - 3 * t * t);
      }
      g.computeVertexNormals();
      return g.translate((x0 + x1) / 2, 0, SEA.z0 + 3);
    };
    parts.add(shoreMat, slope(SEA.x0, YARD.x0), { cast: false });
    parts.add(shoreMat, slope(YARD.x1, 2560), { cast: false });
    // the headland west of the bay
    const west = new THREE.PlaneGeometry(22, WZ1 - SEA.z0, 4, 1);
    west.rotateX(-Math.PI / 2);
    const p = west.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getX(i) + 11) / 22;
      p.setY(i, 0.04 - 3 * t * t);
    }
    west.computeVertexNormals();
    parts.add(shoreMat, west.translate(SEA.x0 - 3, 0, (SEA.z0 + WZ1) / 2), { cast: false });
    // boulders along the waterline
    const brng = new Rng(52513);
    const rock = std({ color: 0x5d5e5c, roughness: 1, flatShading: true });
    for (let k = 0; k < 90; k++) {
      const onWest = k % 3 === 0;
      const x = onWest ? SEA.x0 + brng.float(2, 9) : brng.chance(0.6) ? brng.float(SEA.x0 + 10, YARD.x0 - 4) : brng.float(YARD.x1 + 4, 2540);
      const z = onWest ? brng.float(SEA.z0 + 4, 760) : SEA.z0 + brng.float(1, 7);
      const r = brng.float(0.6, 2.2);
      parts.add(rock, new THREE.DodecahedronGeometry(r, 0).scale(1, 0.6, 1).rotateY(brng.float(0, TAU)).translate(x, -0.6 - brng.float(0, 0.8), z));
    }
  }

  /* ---- the spur: asphalt, shoulders, banks, edge lines */
  {
    const roadMat = world.roadMats[1];
    const z0 = SPUR.z0 + 8; // (under the roundabout's own asphalt)
    const z1 = YARD.z0;
    parts.add(roadMat, flat(SPUR.x - SPUR_HALF, SPUR.x + SPUR_HALF, z0, z1, 0.023, 12), { cast: false });
    for (const s of [-1, 1]) {
      const a = SPUR.x + s * SPUR_HALF;
      const b = SPUR.x + s * SPUR_SHOULDER;
      parts.add(world.highwayGravel ?? M.concrete, flat(Math.min(a, b), Math.max(a, b), z0 + 4, z1, 0.016, 4), { cast: false });
      // ploughed banks (snow) / dry grass, as along the highway
      const bank = box(3.2, 0.5, z1 - z0 - 14, 4).translate(SPUR.x + s * 8.6, 0.15, (z0 + 10 + z1 - 4) / 2);
      parts.add(M.snow, bank, { season: 'winter', cast: false });
      parts.add(std({ color: 0x8c7b55, roughness: 1 }), box(3.2, 0.12, z1 - z0 - 14).translate(SPUR.x + s * 8.6, 0.04, (z0 + 10 + z1 - 4) / 2), { season: 'autumn', cast: false });
    }
    const paint = std({ color: 0xd9dcd8, roughness: 0.75 });
    paint.polygonOffset = true;
    paint.polygonOffsetFactor = -2;
    for (const s of [-1, 1]) parts.add(paint, flat(SPUR.x + s * 3.75 - 0.075, SPUR.x + s * 3.75 + 0.075, z0 + 6, z1 - 2, 0.03, 12), { cast: false });
    for (let z = z0 + 8; z < z1 - 6; z += 12) parts.add(paint, flat(SPUR.x - 0.07, SPUR.x + 0.07, z, z + 3, 0.03, 12), { cast: false });
    // delineators and a few lamp posts
    for (let z = z0 + 14; z < z1 - 4; z += 40) for (const s of [-1, 1]) {
      parts.add(M.concreteWhite, box(0.12, 1, 0.12).translate(SPUR.x + s * 7.8, 0.5, z));
      parts.add(std({ color: 0x1b1c1e }), box(0.125, 0.18, 0.125).translate(SPUR.x + s * 7.8, 0.8, z));
    }
    // the road sign at the roundabout
    const tex = makeSignTexture(512, 256, (c, W, H) => {
      c.fillStyle = '#1d4f9a';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#f2f2f2';
      c.lineWidth = 8;
      c.strokeRect(10, 10, W - 20, H - 20);
      c.fillStyle = '#f2f2f2';
      c.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
      c.fillText('МОРПОРТ', W / 2, H * 0.36);
      c.font = 'bold 50px "Arial Narrow", Arial, sans-serif';
      c.fillText('↑ 0,2 км', W / 2, H * 0.7);
    });
    const plate = new THREE.Mesh(box(2.4, 1.2, 0.06), [steel, steel, steel, steel, std({ map: tex, roughness: 0.6 }), steel]);
    // (on the right, -x, for whoever drives north)
    plate.position.set(SPUR.x - 9.4, 2.6, z0 + 20);
    plate.rotation.y = Math.PI;
    group.add(plate);
    parts.add(steel, box(0.1, 2.6, 0.1).translate(SPUR.x - 9.4, 1.3, z0 + 20.05));
  }

  /* ---- the apron, the quay wall, the crane rails, bollards */
  parts.add(slabMat, flat(YARD.x0, YARD.x1, YARD.z0, YARD.z1, 0.025, 12), { cast: false });
  parts.add(slabMat, flat(MOLE.x0, MOLE.x1, YARD.z1, MOLE.z1, 0.025, 12), { cast: false });
  const quayMat = std({ color: 0x77736c, roughness: 0.95 });
  parts.add(quayMat, box(YARD.x1 - YARD.x0, 5, 1.2, 4).translate((YARD.x0 + YARD.x1) / 2, -2.45, YARD.z1 - 0.6));
  for (const x of [MOLE.x0, MOLE.x1]) parts.add(quayMat, box(1.2, 5, MOLE.z1 - YARD.z1, 4).translate(x + (x === MOLE.x0 ? 0.6 : -0.6), -2.45, (YARD.z1 + MOLE.z1) / 2));
  parts.add(quayMat, box(MOLE.x1 - MOLE.x0, 5, 1.2, 4).translate((MOLE.x0 + MOLE.x1) / 2, -2.45, MOLE.z1 - 0.6));
  // the yellow-and-black edge, and fenders along the berth
  const edgeTex = makeSignTexture(256, 32, (c, W, H) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#1c1c1c' : '#d8b13a';
      c.beginPath();
      c.moveTo(i * 32, H);
      c.lineTo(i * 32 + 16, 0);
      c.lineTo(i * 32 + 48, 0);
      c.lineTo(i * 32 + 32, H);
      c.fill();
    }
  });
  edgeTex.repeat.set(1, 1);
  const edgeMat = std({ map: edgeTex, roughness: 0.8 });
  parts.add(edgeMat, box(YARD.x1 - YARD.x0, 0.3, 0.5, 4).translate((YARD.x0 + YARD.x1) / 2, 0.15, YARD.z1 - 0.25), { cast: false });
  for (let x = YARD.x0 + 6; x < MOLE.x0 - 2; x += 8) parts.add(shipMats.rubber, box(1.6, 1.8, 0.5).translate(x, -0.8, YARD.z1 + 0.2));
  const bollards = [];
  for (let x = YARD.x0 + 10; x < MOLE.x0 - 4; x += 12) {
    parts.add(steel, new THREE.CylinderGeometry(0.3, 0.38, 0.7, 10).translate(x, 0.35, YARD.z1 - 1.2));
    parts.add(steel, new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10).translate(x, 0.72, YARD.z1 - 1.2));
    ctx.addLateColliderRect(x - 0.4, x + 0.4, YARD.z1 - 1.6, YARD.z1 - 0.8);
    bollards.push(new THREE.Vector3(x, 0.6, YARD.z1 - 1.2));
  }
  const RAIL_Z = [366, 376];
  for (const z of RAIL_Z) for (const dz of [-0.4, 0.4]) parts.add(rail, box(YARD.x1 - YARD.x0 - 4, 0.08, 0.14).translate((YARD.x0 + YARD.x1) / 2, 0.06, z + dz), { cast: false });

  /* ---- the fence round the port, the gate, the gatehouse */
  {
    const fenceMat = std({ color: 0xb4b0a6, roughness: 0.95 });
    const run = (x0, z0, x1, z1) => {
      const along = z0 === z1;
      const len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const n = Math.max(1, Math.round(len / 2.6));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        const p = box(along ? len / n - 0.1 : 0.2, 2.3, along ? 0.2 : len / n - 0.1, 3).translate(px, 1.15, pz);
        parts.add(fenceMat, p);
        parts.add(M.concreteDark, box(0.3, 2.6, 0.3).translate(x0 + (x1 - x0) * (i / n), 1.3, z0 + (z1 - z0) * (i / n)));
        if (i % 2 === 0) parts.add(M.snow, box(along ? len / n : 0.26, 0.08, along ? 0.26 : len / n).translate(px, 2.34, pz), { season: 'winter', cast: false });
      }
      // barbed wire along the top
      parts.add(steel, box(along ? len : 0.04, 0.04, along ? 0.04 : len).translate((x0 + x1) / 2, 2.75, (z0 + z1) / 2), { cast: false });
    };
    run(YARD.x0, YARD.z0, GATE.x0, YARD.z0);
    run(GATE.x1, YARD.z0, YARD.x1, YARD.z0);
    run(YARD.x0, YARD.z0, YARD.x0, YARD.z1 - 0.5);
    run(YARD.x1, YARD.z0, YARD.x1, YARD.z1 - 0.5);
    // the gate: two posts and the arch with the port's name
    const tex = makeSignTexture(1024, 160, (c, W, H) => {
      c.fillStyle = '#23466e';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#efe7d6';
      c.font = 'bold 74px "Arial Narrow", Arial, sans-serif';
      c.fillText('МОРСКОЙ ТОРГОВЫЙ ПОРТ', W / 2, H / 2 + 4);
    });
    for (const x of [GATE.x0, GATE.x1]) {
      parts.add(M.concreteDark, box(0.8, 6.6, 0.8).translate(x, 3.3, YARD.z0));
      ctx.addLateColliderRect(x - 0.5, x + 0.5, YARD.z0 - 0.5, YARD.z0 + 0.5);
    }
    const arch = new THREE.Mesh(box(GATE.x1 - GATE.x0 + 0.8, 1.6, 0.3), [steel, steel, steel, steel, std({ map: tex, roughness: 0.7 }), std({ map: tex, roughness: 0.7 })]);
    arch.position.set(SPUR.x, 6.2, YARD.z0);
    arch.rotation.y = Math.PI;
    group.add(arch);
    parts.add(M.snow, box(GATE.x1 - GATE.x0 + 0.8, 0.12, 0.4).translate(SPUR.x, 7.06, YARD.z0), { season: 'winter', cast: false });
    // the barrier, raised, and the gatehouse (КПП)
    const kx = GATE.x1 + 4;
    const kz = YARD.z0 + 4.5;
    parts.add(M.concreteWhite, box(5, 3, 4, 3).translate(kx, 1.5, kz));
    parts.add(M.concreteDark, box(5.6, 0.25, 4.6).translate(kx, 3.12, kz));
    parts.add(M.snow, box(5.4, 0.12, 4.4).translate(kx, 3.3, kz), { season: 'winter', cast: false });
    parts.add(glassLit, box(0.06, 1.1, 2.6).translate(kx - 2.53, 1.7, kz), { cast: false });
    ctx.addLateColliderRect(kx - 2.6, kx + 2.6, kz - 2.1, kz + 2.1);
    const stripes = makeSignTexture(256, 16, (c, W, H) => {
      for (let i = 0; i < 8; i++) {
        c.fillStyle = i % 2 ? '#f0f0f0' : '#c4161c';
        c.fillRect(i * 32, 0, 32, H);
      }
    });
    parts.add(M.concreteDark, box(0.5, 1.1, 0.5).translate(GATE.x1 - 0.8, 0.55, YARD.z0 + 1.2));
    parts.add(std({ map: stripes, roughness: 0.6 }), box(0.14, 6.4, 0.14).translate(GATE.x1 - 0.8, 4.3, YARD.z0 + 1.2));
  }

  /* ---- two warehouses */
  {
    const wallMat = std({ map: ribTex, color: 0x9aa3a6, roughness: 0.7, metalness: 0.3 });
    ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping;
    const roofMat = std({ map: ribTex, color: 0x7c8487, roughness: 0.6, metalness: 0.4 });
    const doorMat = std({ color: 0x3f5a4a, roughness: 0.7, metalness: 0.3 });
    const shed = (x0, x1, z0, z1, n) => {
      const w = x1 - x0;
      const d = z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const H = 7;
      parts.add(wallMat, box(w, H, d, 3).translate(cx, H / 2, cz));
      // a gable roof over the depth (z)
      const slope = Math.atan2(2.6, d / 2);
      const rl = Math.hypot(2.6, d / 2) + 0.4;
      for (const s of [-1, 1]) {
        parts.add(roofMat, box(w + 0.6, 0.18, rl, 3).rotateX(s * slope).translate(cx, H + 1.3, cz + (s * d) / 4));
        parts.add(M.snow, box(w + 0.4, 0.14, rl - 0.4).rotateX(s * slope).translate(cx, H + 1.44, cz + (s * d) / 4), { season: 'winter', cast: false });
      }
      // the gable ends
      const gable = new THREE.Shape();
      gable.moveTo(-d / 2, 0);
      gable.lineTo(d / 2, 0);
      gable.lineTo(0, 2.6);
      gable.closePath();
      for (const x of [x0, x1]) {
        parts.add(wallMat, new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x - 0.05, H, cz));
      }
      // sliding doors on both long sides, a number, a lamp over each door
      const tex = makeSignTexture(256, 96, (c, W, Hh) => {
        c.fillStyle = '#efe7d6';
        c.fillRect(0, 0, W, Hh);
        c.fillStyle = '#23466e';
        c.font = 'bold 56px "Arial Narrow", Arial, sans-serif';
        c.fillText(`СКЛАД № ${n}`, W / 2, Hh / 2 + 3);
      });
      const sign = std({ map: tex, roughness: 0.7 });
      for (const s of [-1, 1]) {
        const z = s < 0 ? z0 - 0.06 : z1 + 0.06;
        for (const k of [-1, 1]) parts.add(doorMat, box(5, 5, 0.12).translate(cx + k * w * 0.25, 2.5, z));
        const plate = new THREE.PlaneGeometry(3.2, 1.2);
        if (s < 0) plate.rotateY(Math.PI);
        parts.add(sign, plate.translate(cx, 6, z + s * 0.02), { cast: false });
      }
      ctx.addLateColliderRect(x0 - 0.2, x1 + 0.2, z0 - 0.2, z1 + 0.2);
    };
    shed(YARD.x0 + 8, YARD.x0 + 58, 312, 334, 2);
    shed(SPUR.x + 18, SPUR.x + 74, 312, 334, 3);
  }

  /* ---- containers and packaged timber */
  {
    const cols = [0x9c3b2a, 0x2f5f8c, 0x6f7a74, 0x3f6d43, 0xc7742a, 0x8a8f94];
    const mats = cols.map((c) => std({ map: ribTex, color: c, roughness: 0.7, metalness: 0.3 }));
    const crng = new Rng(52514);
    const stack = (x0, z0, nx, nz) => {
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const h = crng.int(1, 3);
          for (let k = 0; k < h; k++) {
            const x = x0 + i * 6.3;
            const z = z0 + j * 2.6;
            parts.add(mats[crng.int(0, mats.length - 1)], box(6.06, 2.59, 2.44, 2.5).translate(x + 3.03, 1.3 + k * 2.6, z + 1.22));
            if (k === h - 1) parts.add(M.snow, box(5.9, 0.1, 2.3).translate(x + 3.03, 2.64 + k * 2.6, z + 1.22), { season: 'winter', cast: false });
          }
        }
      }
      ctx.addLateColliderRect(x0 - 0.1, x0 + nx * 6.3, z0 - 0.1, z0 + nz * 2.6);
    };
    stack(YARD.x0 + 8, 342, 4, 5);
    stack(YARD.x0 + 40, 342, 2, 5);
    // timber: packets of sawn boards in stacks, battens between the tiers
    const wood = std({ color: 0xc8a676, roughness: 0.9 });
    const ends = makeSignTexture(128, 64, (c, W, H) => {
      c.fillStyle = '#b9935f';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#8a6a40';
      for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 24) c.fillRect(x + (y % 16 ? 12 : 0), y, 22, 7);
    });
    const endMat = std({ map: ends, roughness: 0.9 });
    const timber = (x0, z0, n) => {
      for (let i = 0; i < n; i++) {
        const h = crng.int(2, 4);
        for (let k = 0; k < h; k++) {
          const x = x0 + i * 7;
          const y = 0.15 + k * 1.3;
          parts.add(wood, box(6, 1.1, 2.4).translate(x + 3, y + 0.55, z0 + 1.2));
          for (const ex of [x - 0.01, x + 6.01]) parts.add(endMat, new THREE.PlaneGeometry(2.4, 1.1).rotateY(ex === x - 0.01 ? -Math.PI / 2 : Math.PI / 2).translate(ex, y + 0.55, z0 + 1.2), { cast: false });
          for (const bx of [0.6, 3, 5.4]) parts.add(M.woodDark, box(0.12, 0.15, 2.5).translate(x + bx, y - 0.07, z0 + 1.2));
          if (k === h - 1) parts.add(M.snow, box(5.9, 0.12, 2.3).translate(x + 3, y + 1.16, z0 + 1.2), { season: 'winter', cast: false });
        }
      }
      ctx.addLateColliderRect(x0 - 0.2, x0 + (n - 1) * 7 + 6.2, z0 - 0.1, z0 + 2.5);
    };
    timber(SPUR.x + 18, 344, 7);
    timber(SPUR.x + 18, 350, 6);
  }

  /* ---- the freighter at the berth, the icebreaker in the channel, a tug */
  const shipLamps = [];
  {
    const at = (x, z, yaw) => new THREE.Matrix4().compose(new THREE.Vector3(x, WATER_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    shipLamps.push(...buildShip(parts, shipMats, 'cargo', 'ПОЛЯРНЫЙ', at(2262, YARD.z1 + 9.4, 0), winter));
    // the icebreaker comes in down its channel toward the port
    const ib = { x: 2470, z: 688 };
    shipLamps.push(...buildShip(parts, shipMats, 'icebreaker', 'ДИКСОН', at(ib.x, ib.z, Math.atan2(452 - ib.z, ib.x - 2300)), winter));
    shipLamps.push(...buildShip(parts, shipMats, 'tug', 'БУКСИР-7', at(2336, 398, Math.PI / 2), winter));
    // mooring lines from the bow and stern to the bollards
    const lines = [];
    const shipZ = YARD.z1 + 9.4 - 8.5;
    for (const [bx, sx] of [[YARD.x0 + 22, 2262 - 52], [YARD.x0 + 34, 2262 - 44], [2262 + 38, 2262 + 46], [2262 + 50, 2262 + 56]]) {
      const b = bollards.reduce((best, p) => (Math.abs(p.x - bx) < Math.abs(best.x - bx) ? p : best));
      const a = new THREE.Vector3(sx, WATER_Y + 5.2, shipZ);
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        const t2 = (k + 1) / 12;
        const p1 = b.clone().lerp(a, t);
        const p2 = b.clone().lerp(a, t2);
        p1.y -= Math.sin(t * Math.PI) * 0.8;
        p2.y -= Math.sin(t2 * Math.PI) * 0.8;
        lines.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x2b2a27 })));
    // the gangway from the quay up to the deck
    const g0 = new THREE.Vector3(2290, 0.1, YARD.z1 - 1.8);
    const g1 = new THREE.Vector3(2290, WATER_Y + 5.1, YARD.z1 + 1.8);
    parts.add(steel, beam(g0, g1, 0.12));
    const ramp = new THREE.BoxGeometry(1.2, 0.08, g0.distanceTo(g1));
    ramp.rotateX(Math.atan2(g1.y - g0.y, g1.z - g0.z));
    parts.add(steel, ramp.translate(2290, (g0.y + g1.y) / 2, (g0.z + g1.z) / 2));
    ctx.addLateColliderRect(2289.3, 2290.7, YARD.z1 - 2.2, YARD.z1);
  }

  /* ---- three portal cranes on the rails; the middle one is at work */
  const cranes = [];
  {
    const geo = craneGeometry();
    const cz = (RAIL_Z[0] + RAIL_Z[1]) / 2;
    [[2212, 0.5, 0], [2256, 0.15, 1], [2308, -0.35, 0]].forEach(([x, yaw, col], i) => {
      const mat = craneMats[col];
      const portal = new THREE.Mesh(geo.portal, mat);
      portal.position.set(x, 0, cz);
      portal.castShadow = true;
      portal.receiveShadow = true;
      group.add(portal);
      const top = new THREE.Mesh(geo.top, mat);
      top.castShadow = true;
      top.position.set(x, 0, cz);
      // the boom out over the water (+z): local +x turned to the north
      top.rotation.y = -Math.PI / 2 + yaw;
      const cab = new THREE.Mesh(box(0.06, 1.0, 1.6), glassLit);
      cab.position.set(3.83, geo.H + 2.8, 2.4);
      top.add(cab);
      // the hook on its ropes, from the jib
      const hook = new THREE.Group();
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), steel);
      const block = new THREE.Mesh(box(0.7, 1.0, 0.5), std({ color: 0xd8a634 }));
      hook.add(rope, block);
      top.add(hook);
      group.add(top);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ctx.addLateColliderRect(x + sx * 5.6 - 1.7, x + sx * 5.6 + 1.7, cz + sz * 5 - 0.6, cz + sz * 5 + 0.6);
      const c = { top, hook, rope, block, yaw0: top.rotation.y, jib: geo.jib, drop: 8 + i * 3, phase: i * 2.1, working: i === 1 };
      cranes.push(c);
      top.userData.dynamic = true;
      setHook(c, c.drop);
    });
  }
  function setHook(c, drop) {
    const { jib } = c;
    c.rope.scale.y = drop;
    c.rope.position.set(jib.x, jib.y - drop / 2, 0);
    c.block.position.set(jib.x, jib.y - drop - 0.5, 0);
  }
  world.updaters.push((dt, t) => {
    if (!group.visible) return;
    for (const c of cranes) {
      if (!c.working) continue;
      // a slow cycle: swing from the hold over the quay and back, the hook
      // going down into the hold and up again
      const cyc = (t * 0.05 + c.phase) % 1;
      const swing = Math.sin(cyc * TAU) * 0.9;
      c.top.rotation.y = c.yaw0 + swing;
      setHook(c, 9 + 9 * Math.max(0, Math.cos(cyc * TAU * 2)));
    }
  });

  /* ---- the breakwater and its lighthouse */
  let beaconMat;
  {
    const lx = (MOLE.x0 + MOLE.x1) / 2;
    const lz = MOLE.z1 - 5;
    const bands = makeSignTexture(64, 256, (c, W, H) => {
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? '#f1eee6' : '#b3241d';
        c.fillRect(0, (i * H) / 6, W, H / 6);
      }
    });
    parts.add(std({ map: bands, roughness: 0.7 }), new THREE.CylinderGeometry(1.4, 2.2, 15, 18).translate(lx, 7.5, lz));
    parts.add(steel, new THREE.CylinderGeometry(2.0, 2.0, 0.2, 18).translate(lx, 15.1, lz));
    parts.add(steel, new THREE.CylinderGeometry(1.0, 1.0, 0.4, 12).translate(lx, 17.8, lz));
    parts.add(steel, new THREE.ConeGeometry(1.1, 0.9, 12).translate(lx, 18.4, lz));
    beaconMat = std({ color: 0xfff2d0, emissive: 0xfff0c0, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.85 });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.4, 12), beaconMat);
    lantern.position.set(lx, 16.4, lz);
    group.add(lantern);
    for (let k = 0; k < 10; k++) parts.add(steel, box(0.05, 1.0, 0.05).translate(lx + Math.cos((k / 10) * TAU) * 1.95, 15.7, lz + Math.sin((k / 10) * TAU) * 1.95), { cast: false });
    ctx.addLateColliderRect(lx - 2.3, lx + 2.3, lz - 2.3, lz + 2.3);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(128, '255,236,190'), color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(lx, 16.4, lz);
    glow.scale.set(14, 14, 1);
    glow.userData.dynamic = true;
    group.add(glow);
    world.updaters.push((dt, t) => {
      if (!group.visible) return;
      // two flashes every eight seconds (Fl(2) 8s)
      const p = t % 8;
      const on = p < 0.6 || (p > 1.4 && p < 2.0) ? 1 : 0;
      beaconMat.emissiveIntensity = 0.3 + on * 3;
      glow.material.opacity = on * (0.25 + 0.65 * night());
    });
    // a low parapet along the seaward side of the mole
    parts.add(M.concrete, box(0.6, 1.0, MOLE.z1 - YARD.z1 - 6, 3).translate(MOLE.x1 - 0.3, 0.5, (YARD.z1 + MOLE.z1 - 6) / 2));
    ctx.addLateColliderRect(MOLE.x1 - 0.7, MOLE.x1, YARD.z1, MOLE.z1);
  }

  /* ---- floodlight masts over the apron (street lamps to the environment) */
  {
    const glowTex = makeGlowTexture();
    const beamTex = makeBeamTexture();
    const beamGeo = new THREE.PlaneGeometry(10, 18);
    for (const [x, z] of [[YARD.x0 + 4, 340], [SPUR.x - 10, 340], [SPUR.x + 10, 340], [YARD.x1 - 6, 360], [YARD.x0 + 4, 304], [SPUR.x - 10, 304], [2232, 360], [2284, 360]]) {
      const H = 16;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      parts.add(steel, new THREE.CylinderGeometry(0.18, 0.32, H, 8).translate(x, H / 2, z));
      parts.add(steel, box(2.6, 0.2, 0.3).translate(x, H, z));
      for (const dx of [-0.9, 0, 0.9]) parts.add(world.lampMats.head, box(0.6, 0.4, 0.5).translate(x + dx, H - 0.3, z));
      const lightPos = new THREE.Vector3(0, H - 0.6, 0);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(5, 5, 1);
      glow.position.copy(lightPos);
      g.add(glow);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.2, 0);
      g.add(pool);
      const coneMat = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffcf90, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Group();
      cone.add(new THREE.Mesh(beamGeo, coneMat), new THREE.Mesh(beamGeo, coneMat));
      cone.children[1].rotation.y = Math.PI / 2;
      cone.position.set(0, H / 2, 0);
      g.add(cone);
      group.add(g);
      ctx.addLateColliderRect(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
      g.updateMatrixWorld();
      world.lamps.push({ lightPos: g.localToWorld(lightPos.clone()), glow, pool, cone, coneMat, group: g, height: H });
    }
    // the ships' masthead lights
    const shipGlow = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff4dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const bulb = std({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1 });
    // (they come on with the street lamps)
    world.updaters.push(() => {
      if (!group.visible) return;
      shipGlow.opacity = 0.85 * night();
      bulb.emissiveIntensity = 0.2 + night();
    });
    for (const p of shipLamps) {
      const s = new THREE.Sprite(shipGlow);
      s.position.copy(p);
      s.scale.set(2.4, 2.4, 1);
      group.add(s);
      parts.add(bulb, new THREE.SphereGeometry(0.2, 8, 6).translate(p.x, p.y, p.z), { cast: false });
    }
  }

  parts.build(ctx, group);
  ctx.addZone('Морской порт', 'Sea port', YARD.x0, YARD.x1, YARD.z0 - 4, MOLE.z1);
  world.port = { cranes, yard: YARD, mole: MOLE, spur: SPUR };
}
