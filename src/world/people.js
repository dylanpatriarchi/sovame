// Pedestrians: procedural low-poly figures walking deterministic routes along
// the sidewalks and courtyard paths, and a few doing something: kids skating
// on the hockey box and sliding down the ice slide, residents going in and
// out of their entrances, grannies on a bench, a smoker on a balcony.
// Ambient only — no player collision, no interaction, no AI. All body parts are vertex-colored and share a single
// material, so five figures cost ~26 draw calls plus a small pool of
// breath-vapor sprites.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp, damp } from '../util.js';
import { makeSoftCircleTexture } from '../textures.js';
import { PEOPLE } from '../config.js';
import { BUILDING_SPECS, FLOOR_H, entranceDoor } from './buildings.js';
import { RINK, SLIDE } from './south.js';

/* ------------------------------------------------------------ geometry */

/** Bakes a flat color into a geometry (the shared material reads vertex colors). */
function tint(geo, hex) {
  const color = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Head sphere: face tone on the front, hair/hat tone everywhere else. */
function tintHead(geo, faceHex, backHex) {
  const face = new THREE.Color(faceHex);
  const back = new THREE.Color(backHex);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getZ(i) > 0.03 ? face : back;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Dark muted palette: at blue hour the figures read as near-silhouettes.
 * `trim` is the hat/scarf tone, also reused for the sleeve cuffs.
 */
const VARIANTS = [
  { hat: 'ushanka', coat: 0x272b34, trim: 0x1b1e25, face: 0x6e5d50, legs: 0x191b20, boots: 0x101114 },
  { hat: 'hood', coat: 0x302d25, trim: 0x24221c, face: 0x6e5d50, legs: 0x1b1a17, boots: 0x12110f },
  { hat: 'beanie', coat: 0x25302b, trim: 0x3a2c2a, face: 0x6e5d50, legs: 0x181b1a, boots: 0x101211 },
  // grannies: long dark coats and wool headscarves
  { hat: 'scarf', coat: 0x2e2622, trim: 0x5b3a36, face: 0x75645a, legs: 0x1f1b19, boots: 0x141110 },
  { hat: 'scarf', coat: 0x262a30, trim: 0x6a6150, face: 0x75645a, legs: 0x1c1d20, boots: 0x121214 },
  // kids: the only bright coats in the district
  { hat: 'beanie', coat: 0x7a2a26, trim: 0x2a3a5c, face: 0x7a6656, legs: 0x1d2230, boots: 0x15171c },
  { hat: 'beanie', coat: 0x2c4a7a, trim: 0x8a6a2a, face: 0x7a6656, legs: 0x1c1f26, boots: 0x131417 },
  { hat: 'ushanka', coat: 0x3c5a3a, trim: 0x2a2622, face: 0x7a6656, legs: 0x1c1f1c, boots: 0x121312 },
];
const GRANNY = [3, 4];
const KID = [5, 6, 7];

/** Merged torso: coat chest + skirt + collar + head + hat. Faces +z. */
function buildTorsoGeometry(v) {
  const parts = [];
  const chest = new THREE.BoxGeometry(0.4, 0.52, 0.27);
  chest.translate(0, 1.18, 0);
  parts.push(tint(chest, v.coat));
  const skirt = new THREE.CylinderGeometry(0.215, 0.28, 0.5, 10, 1, true);
  skirt.scale(1, 1, 0.62);
  skirt.translate(0, 0.69, 0);
  parts.push(tint(skirt, v.coat));
  const collar = new THREE.CylinderGeometry(0.125, 0.16, 0.12, 8);
  collar.scale(1, 1, 0.8);
  collar.translate(0, 1.47, 0);
  parts.push(tint(collar, v.trim));
  const head = new THREE.SphereGeometry(0.105, 7, 5);
  head.translate(0, 1.585, 0.012);
  parts.push(tintHead(head, v.face, v.trim));
  if (v.hat === 'ushanka') {
    const cap = new THREE.SphereGeometry(0.128, 8, 5);
    cap.scale(1, 0.72, 1);
    cap.translate(0, 1.655, 0);
    parts.push(tint(cap, v.trim));
    for (const side of [-1, 1]) {
      const flap = new THREE.BoxGeometry(0.05, 0.15, 0.13);
      flap.translate(side * 0.115, 1.545, -0.01);
      parts.push(tint(flap, v.trim));
    }
    const back = new THREE.BoxGeometry(0.17, 0.14, 0.05);
    back.translate(0, 1.55, -0.105);
    parts.push(tint(back, v.trim));
  } else if (v.hat === 'hood') {
    const hood = new THREE.SphereGeometry(0.145, 8, 6);
    hood.scale(1, 1.08, 1.05);
    hood.translate(0, 1.6, -0.045);
    parts.push(tint(hood, v.trim));
  } else if (v.hat === 'scarf') {
    // платок: tied under the chin, the knot showing at the back
    const scarf = new THREE.SphereGeometry(0.128, 8, 6);
    scarf.scale(1, 1.06, 1.02);
    scarf.translate(0, 1.6, -0.02);
    parts.push(tint(scarf, v.trim));
    const knot = new THREE.BoxGeometry(0.07, 0.09, 0.05);
    knot.translate(0, 1.5, -0.11);
    parts.push(tint(knot, v.trim));
  } else {
    const beanie = new THREE.SphereGeometry(0.122, 8, 5);
    beanie.scale(1.04, 0.78, 1.04);
    beanie.translate(0, 1.645, -0.01);
    parts.push(tint(beanie, v.trim));
    const brim = new THREE.CylinderGeometry(0.118, 0.118, 0.05, 8);
    brim.translate(0, 1.6, 0);
    parts.push(tint(brim, v.trim));
  }
  return mergeGeometries(parts, false);
}

/** Sleeve + mitten, origin at the shoulder, hanging down. */
function buildArmGeometry(v) {
  const sleeve = new THREE.CylinderGeometry(0.052, 0.06, 0.5, 6);
  sleeve.translate(0, -0.25, 0);
  const mitten = new THREE.SphereGeometry(0.06, 5, 4);
  mitten.scale(0.9, 1.15, 0.9);
  mitten.translate(0, -0.53, 0);
  return mergeGeometries([tint(sleeve, v.coat), tint(mitten, v.trim)], false);
}

/** Leg + boot, origin at the hip. */
function buildLegGeometry(v) {
  const leg = new THREE.CylinderGeometry(0.068, 0.078, 0.8, 6);
  leg.translate(0, -0.42, 0);
  const boot = new THREE.BoxGeometry(0.115, 0.1, 0.27);
  boot.translate(0, -0.855, 0.05);
  return mergeGeometries([tint(leg, v.legs), tint(boot, v.boots)], false);
}

/** Small shopping bag, origin at the hand it hangs from. */
function buildBagGeometry() {
  const sack = new THREE.BoxGeometry(0.24, 0.3, 0.1);
  sack.translate(0, -0.2, 0);
  const parts = [tint(sack, 0x4a4438)];
  for (const side of [-1, 1]) {
    const handle = new THREE.BoxGeometry(0.03, 0.14, 0.025);
    handle.translate(side * 0.07, -0.02, 0);
    parts.push(tint(handle, 0x35322a));
  }
  return mergeGeometries(parts, false);
}

/** Bone positions in the figure (hips, shoulders; the bag hangs off the
 * right mitten). */
const LIMBS = {
  legL: [-0.105, 0.93, 0],
  legR: [0.105, 0.93, 0],
  armL: [-0.235, 1.375, 0],
  armR: [0.235, 1.375, 0],
  bag: [0, -0.56, 0.02],
};

/**
 * The whole figure in one geometry: each part rigidly skinned to its bone
 * (0 torso, 1-2 legs, 3-4 arms, 5 bag), in the bind pose.
 */
function buildFigureGeometry(parts, bag) {
  const pieces = [];
  const add = (geo, boneIndex, x, y, z) => {
    const g = geo.clone();
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((v, i) => (i % 4 === 0 ? boneIndex : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((v, i) => (i % 4 === 0 ? 1 : 0)), 4));
    pieces.push(g);
  };
  add(parts.torso, 0, 0, 0, 0);
  add(parts.leg, 1, ...LIMBS.legL);
  add(parts.leg, 2, ...LIMBS.legR);
  add(parts.arm, 3, ...LIMBS.armL);
  add(parts.arm, 4, ...LIMBS.armR);
  if (bag) add(parts.bag, 5, LIMBS.armR[0] + LIMBS.bag[0], LIMBS.armR[1] + LIMBS.bag[1], LIMBS.armR[2] + LIMBS.bag[2]);
  return mergeGeometries(pieces, false);
}

/* ------------------------------------------------------------ routes */

/**
 * Waypoint loops along the real lanes (see terrain.js). Every point and every
 * segment is validated against world.collides() on the first update — after
 * the whole world exists, tree colliders included — and nudged if needed.
 * `wait` pauses the figure at the point, `faceYaw` turns it while waiting.
 */
function makeRoutes() {
  return {
    // long ring: north along the east sidewalk, across the avenue at both
    // ends, back south along the west sidewalk; weaves around lamp posts,
    // the bus stop shelter pad and the stop sign. Since the district grew,
    // the ring keeps going to the new northern end of the avenue before
    // turning back
    avenue: {
      mode: 'loop',
      points: [
        [7.4, -100], [7.1, -78], [7.1, -6], [7.4, 10], [7.6, 16],
        [6.35, 21], [6.35, 27], [7.6, 32], [7.4, 44], [7.1, 66], [7.2, 100],
        [7.0, 124], [7.2, 150], [7.2, 168], [-7, 168], [-7, 150], [-7, 100],
        [-7, 66], [-7, 30], [-7, -6], [-7, -42], [-7, -78], [-7, -100],
      ],
    },
    // west courtyard: trampled paths and a short cut across the yard,
    // out to the avenue sidewalk and back
    courtyard: {
      mode: 'pingpong',
      points: [
        { x: -24, z: -44.5, wait: 2.5 },
        [-41, -44.5], [-41, -30], [-41, -6], [-29, -6], [-29, -18.4],
        [-12, -18.4],
        { x: 8.6, z: -18.4, wait: 3.5, face: [1, 0] },
      ],
    },
    // to the grocery kiosk and back to the avenue; the figure pauses at the
    // kiosk window, right where the radio plays
    kiosk: {
      mode: 'pingpong',
      points: [
        { x: 7.2, z: -16, wait: 2 },
        [7.2, -5], [9.6, -2.2], [11.0, -2.2],
        { x: 11.6, z: 1.3, wait: 7, face: [0, 1] },
      ],
    },
    // waiting for the bus: single spot under the shelter roof
    busStop: {
      mode: 'idle',
      points: [{ x: 8.1, z: 23.0, face: [-1, 0], groundY: 0.3 }],
    },
    // west courtyard of the northern cluster: down the avenue extension and
    // into the yard between B8 and B10, pausing by the benches
    northCourt: {
      mode: 'pingpong',
      points: [
        { x: -7, z: 112, wait: 1.5 },
        [-16, 133],
        { x: -30, z: 133, wait: 3, face: [0, -1] },
        [-46, 133],
        { x: -58, z: 133, wait: 2 },
      ],
    },
    // residents: from the street to their entrance, a pause at the door,
    // a while inside, then back out the way they came
    residentB3: {
      mode: 'pingpong',
      points: [{ x: -7.4, z: 36, wait: 1 }, [-20, 32], [-33.5, 30], { ...door('B3', 7, 1), wait: 1.2, inside: 16 }],
    },
    residentB1: {
      mode: 'pingpong',
      points: [{ x: -7.4, z: -40, wait: 1 }, [-24, -44.5], [-36.6, -44.5], { ...door('B1', 7, 1), wait: 1, inside: 22 }],
    },
    // kids skating laps of the hockey box
    rink: {
      mode: 'loop',
      points: Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * TAU;
        return [RINK.x + Math.cos(a) * 9.5, RINK.z + Math.sin(a) * 4.2];
      }),
    },
    // up the stairs of the ice slide, down the chute sitting, round again
    slide: {
      mode: 'loop',
      trusted: true,
      points: [
        { x: SLIDE.x, z: SLIDE.z + 5, y: 0 },
        { x: SLIDE.x, z: SLIDE.z + 3.9, y: 0 },
        { x: SLIDE.x, z: SLIDE.z + 1.0, y: 2.49, pose: 'climb', speed: 0.55 },
        { x: SLIDE.x, z: SLIDE.z - 0.5, y: 2.49, wait: 1.4, face: [0, -1] },
        { x: SLIDE.x, z: SLIDE.z - 1.1, y: 2.49, pose: 'sit', speed: 0.4, wait: 0.6 },
        { x: SLIDE.x, z: SLIDE.z - 10.1, y: 0.06, pose: 'sit', speed: 3.6 },
        { x: SLIDE.x, z: SLIDE.z - 14.4, y: 0.04, pose: 'sit', speed: 1.6, wait: 1.2 },
        { x: SLIDE.x + 2.4, z: SLIDE.z - 13, y: 0 },
        { x: SLIDE.x + 2.4, z: SLIDE.z + 5, y: 0 },
      ],
    },
    // two grannies on the bench by the avenue, talking
    bench: {
      mode: 'idle',
      trusted: true,
      points: [{ x: -19, z: 11.15, face: [0, 1], groundY: 0 }],
    },
    // a smoker on a balcony of No. 7, third floor, facing the avenue side
    balcony: {
      mode: 'idle',
      trusted: true,
      points: [{ ...BALCONY.stand, face: [0, 1], groundY: BALCONY.floorY }],
    },
    // out along Zavodskaya to the parked cars and back to the avenue
    eastArm: {
      mode: 'pingpong',
      points: [
        { x: 7.4, z: 112, wait: 1 },
        [30, 120.4],
        { x: 66, z: 120.4, wait: 2.5, face: [0, -1] },
      ],
    },
  };
}

/** The point just in front of an entrance door of a building (by spec id). */
function door(id, cell, side) {
  const spec = BUILDING_SPECS.find((s) => s.id === id);
  const d = entranceDoor(spec, cell, side);
  // a step off the wall: building colliders reach 0.25 m out
  return { x: d.x, z: spec.z + side * (spec.d / 2 + 0.75), face: [0, -side] };
}

/** The smoker's balcony: building No. 7 (B2), north facade, third floor. */
const BALCONY = (() => {
  const spec = BUILDING_SPECS.find((s) => s.id === 'B2');
  const wallZ = spec.z + spec.d / 2;
  const floorY = 2 * FLOOR_H + 0.08;
  return { x: spec.x, wallZ, floorY, stand: { x: spec.x + 0.45, z: wallZ + 0.72 } };
})();

/** A balcony like the painted ones: concrete slab, steel railing (static). */
function buildBalcony(world) {
  const M = world.materials;
  const { x, wallZ, floorY } = BALCONY;
  const add = (w, h, d, px, py, pz, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(px, py, pz);
    world.group.add(mesh);
  };
  const depth = 1.1;
  const half = 1.3;
  add(half * 2 + 0.1, 0.14, depth, x, floorY - 0.07, wallZ + depth / 2, M.concrete);
  // railing: top and bottom rails round the three open sides, balusters
  const front = wallZ + depth - 0.04;
  for (const y of [floorY + 0.06, floorY + 0.98]) {
    add(half * 2, 0.04, 0.04, x, y, front, M.metal);
    for (const dx of [-half, half]) add(0.04, 0.04, depth - 0.04, x + dx, y, wallZ + depth / 2, M.metal);
  }
  for (let i = 0; i <= 16; i++) add(0.025, 0.92, 0.025, x - half + (i / 16) * half * 2, floorY + 0.52, front, M.metal);
  for (const dx of [-half, half]) for (let i = 1; i < 6; i++) add(0.025, 0.92, 0.025, x + dx, floorY + 0.52, wallZ + (i / 6) * depth, M.metal);
}

/** Normalizes a raw waypoint into {x, z, wait, faceYaw, groundY}. */
function normPoint(raw) {
  const p = Array.isArray(raw) ? { x: raw[0], z: raw[1] } : { ...raw };
  p.wait = p.wait ?? 0;
  p.faceYaw = p.face ? Math.atan2(p.face[0], p.face[1]) : null;
  delete p.face;
  return p;
}

/* ------------------------------------------------------------ pedestrian */

class Pedestrian {
  constructor(world, parts, route, opts) {
    this.world = world;
    this.name = opts.name;
    this.idle = route.mode === 'idle';
    this.route = route;
    this.speed = opts.speed ?? 1.2;
    this.speedEase = 0;
    this.scaleF = opts.scale ?? 1;
    this.lateral = opts.lateral ?? 0;
    this.phase = opts.phase ?? 0;
    this.idlePhase = opts.phase ?? 0;
    this.startFraction = opts.startFraction ?? 0;
    this.bag = !!opts.bag;
    /** Default pose: 'walk', or an activity ('skate', 'bench', 'smoke'). */
    this.pose = opts.pose ?? 'walk';
    /** Sits, climbs or leans on things that carry colliders (by design). */
    this.onFurniture = !!opts.onFurniture;
    this.talkTo = opts.talkTo ?? 0;
    this.drop = 0;
    this.insideTimer = 0;
    this.exhale = false;
    this.waitTimer = 0;
    this.faceYaw = null;
    this.groundY = null;
    this.yaw = 0;
    this.moveX = 0;
    this.moveZ = 1;
    this.wp = 1; // waypoint index we are walking toward
    this.dir = 1;
    this.stride = (this.pose === 'skate' ? 1.9 : 0.66) * this.scaleF;
    this.breathTimer = 0;
    this.routeLength = 0;

    const mat = parts.material;
    this.root = new THREE.Group();
    this.root.name = `pedestrian:${this.name}`;
    this.root.userData.dynamic = true;
    // yaw first, then a whole-body lean (skaters)
    this.root.rotation.order = 'YXZ';
    this.lean = 0;
    // one skinned mesh per figure (a single draw call): torso, limbs and
    // bag are rigid parts on bones that the poses below rotate
    const mesh = new THREE.SkinnedMesh(parts.figure(this.bag), mat);
    mesh.castShadow = true;
    const bone = (parent, x, y, z) => {
      const b = new THREE.Bone();
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const base = bone(mesh, 0, 0, 0);
    this.torso = bone(base, 0, 0, 0);
    this.legL = bone(base, ...LIMBS.legL);
    this.legR = bone(base, ...LIMBS.legR);
    this.armL = bone(base, ...LIMBS.armL);
    this.armR = bone(base, ...LIMBS.armR);
    this.bagPivot = bone(this.armR, ...LIMBS.bag);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([this.torso, this.legL, this.legR, this.armL, this.armR, this.bagPivot]));
    mesh.computeBoundingSphere();
    // the bind pose stands still: leave room for swinging limbs and a lean
    mesh.boundingSphere.radius *= 1.4;
    this.root.add(mesh);
    this.armL.rotation.z = 0.07;
    this.armR.rotation.z = -0.07;
    if (opts.ember) {
      // the cigarette: a warm dot in the right mitten, brighter on a drag
      this.ember = new THREE.Sprite(opts.ember);
      this.ember.scale.setScalar(0.07);
      this.ember.position.set(0, -0.55, 0.07);
      this.armR.add(this.ember);
    }
    this.root.scale.setScalar(this.scaleF);
    // far-route figures join the far-detail group: hidden until the camera
    // actually walks north (world.farDetails is visibility-toggled there)
    (opts.group ?? (opts.far ? world.farDetails : world.group)).add(this.root);
    this.position = this.root.position;
  }

  /** Snaps the figure onto its route (after route validation). */
  placeAtStart() {
    const pts = this.route.points;
    this.pos = { x: pts[0].x, z: pts[0].z };
    this.from = pts[0];
    if (this.idle) {
      const p = pts[0];
      this.yaw = p.faceYaw ?? 0;
      this.groundY = p.groundY ?? null;
      this.#setTransform();
      return;
    }
    // walk off the starting fraction so the figures begin spread out
    let remaining = this.startFraction * this.routeLength;
    let guard = 0;
    while (remaining > 0.01 && guard++ < 10000) {
      remaining -= this.#step(Math.min(0.5, remaining), false);
    }
    this.#setTransform();
  }

  /** Moves along the route by up to `dist`; returns the distance covered. */
  #step(dist, honorWaits = true) {
    const pts = this.route.points;
    let target = pts[this.wp];
    let dx = target.x - this.pos.x;
    let dz = target.z - this.pos.z;
    let d = Math.hypot(dx, dz);
    if (d <= dist || d < 1e-6) {
      this.pos.x = target.x;
      this.pos.z = target.z;
      if (honorWaits && target.wait > 0) {
        this.waitTimer = target.wait;
        this.faceYaw = target.faceYaw;
      }
      // through the door: gone for a while (after the pause at the door)
      if (honorWaits && target.inside) {
        this.insideFor = target.inside;
        this.insideTimer = target.inside + target.wait;
      }
      this.from = target;
      if (this.route.mode === 'loop') {
        this.wp = (this.wp + 1) % pts.length;
      } else {
        let next = this.wp + this.dir;
        if (next < 0 || next >= pts.length) {
          this.dir *= -1;
          next = this.wp + this.dir;
          if (honorWaits) this.waitTimer = Math.max(this.waitTimer, 2.2);
        }
        this.wp = next;
      }
      target = pts[this.wp];
      dx = target.x - this.pos.x;
      dz = target.z - this.pos.z;
      d = Math.hypot(dx, dz);
      // only the way to the old target was covered; the rest of the motion
      // continues on the next update, toward the new waypoint
      return d;
    }
    this.moveX = dx / d;
    this.moveZ = dz / d;
    this.pos.x += this.moveX * dist;
    this.pos.z += this.moveZ * dist;
    return dist;
  }

  #setTransform() {
    const px = this.pos.x - this.moveZ * this.lateral;
    const pz = this.pos.z + this.moveX * this.lateral;
    let y = this.groundY;
    // scripted heights (stairs, a chute): interpolated along the segment
    const a = this.from;
    const b = this.route.points[this.wp];
    if (y === null && a?.y !== undefined && b?.y !== undefined) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const t = len > 1e-6 ? 1 - Math.hypot(b.x - this.pos.x, b.z - this.pos.z) / len : 1;
      y = a.y + (b.y - a.y) * clamp(t, 0, 1);
    }
    this.root.position.set(px, (y ?? this.world.heightAt(px, pz)) - this.drop, pz);
  }

  update(dt, elapsed) {
    if (this.insideTimer > 0) {
      // the pause at the door first, then out of sight behind it
      this.insideTimer -= dt;
      const inside = this.insideTimer > 0 && this.insideTimer <= this.insideFor;
      this.root.visible = !inside;
      if (inside) return;
    }
    if (this.idle) {
      this.#applyPose(this.pose, elapsed);
      this.#setTransform();
      return;
    }
    const target = this.route.points[this.wp];
    const segSpeed = this.speed * (target.speed ?? 1);
    // ease the speed so pauses and resumes are soft
    const want = this.waitTimer > 0 ? 0 : segSpeed;
    if (this.waitTimer > 0) this.waitTimer -= dt;
    this.speedEase = damp(this.speedEase, want, 4, dt);
    if (this.speedEase > 0.02) {
      this.#step(this.speedEase * dt);
      this.phase += (Math.PI * this.speedEase * dt) / this.stride;
    }
    // facing: toward the movement, or toward faceYaw while waiting
    const targetYaw =
      this.waitTimer > 0 && this.faceYaw !== null ? this.faceYaw : Math.atan2(this.moveX ?? 0, this.moveZ ?? 1);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    this.yaw += diff * Math.min(1, dt * 5);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.lean;
    // a point's pose holds on the way to it and while waiting there
    const waiting = this.waitTimer > 0 && this.speedEase < 0.1;
    const pose = waiting ? (this.from.pose ?? (this.pose === 'walk' ? 'idle' : this.pose)) : (this.route.points[this.wp].pose ?? this.pose);
    this.#applyPose(pose, elapsed, clamp(this.speedEase / segSpeed, 0, 1));
    this.#setTransform();
  }

  #applyPose(pose, elapsed, frac = 1) {
    this.#resetPose();
    this.drop = 0;
    if (pose === 'walk') this.#poseWalk(frac, 0.5);
    else if (pose === 'climb') this.#poseWalk(frac, 0.8);
    else if (pose === 'skate') this.#poseSkate(frac);
    else if (pose === 'sit') this.#poseSit(-1.45, 0.1);
    else if (pose === 'bench') this.#poseBench(elapsed);
    else if (pose === 'smoke') this.#poseSmoke(elapsed);
    else this.#poseIdle(elapsed);
  }

  #resetPose() {
    this.lean = 0;
    for (const limb of [this.legL, this.legR, this.armL, this.armR]) limb.rotation.set(0, 0, 0);
    this.armL.rotation.z = 0.07;
    this.armR.rotation.z = -0.07;
    this.torso.position.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.bagPivot.rotation.x = 0;
  }

  /** Sitting: legs out at `legs` (rad), hips `seat` m above the ground. */
  #poseSit(legs, seat) {
    this.legL.rotation.x = legs;
    this.legR.rotation.x = legs;
    this.armL.rotation.x = -0.35;
    this.armR.rotation.x = -0.35;
    this.torso.rotation.x = -0.08;
    // the hips (0.93 m up the figure) come down onto the seat
    this.drop = 0.93 * this.scaleF - seat;
  }

  #poseBench(elapsed) {
    const t = elapsed + this.idlePhase;
    this.#poseSit(-1.05, 0.48);
    this.armL.rotation.x = -0.6;
    this.armR.rotation.x = -0.6;
    // a conversation: turn to the neighbour, a gesture now and then
    const turn = this.talkTo * (0.35 + 0.25 * Math.sin(t * 0.21));
    this.torso.rotation.y = turn;
    this.armL.rotation.y = turn * 0.6;
    this.armR.rotation.y = turn * 0.6;
    const gesture = Math.max(0, Math.sin(t * 0.37)) ** 4;
    this.armR.rotation.x = -0.6 - gesture * 0.7 + Math.sin(t * 3.1) * 0.08 * gesture;
    this.torso.position.x = Math.sin(t * 0.5) * 0.01;
  }

  #poseSkate(frac) {
    const s = Math.sin(this.phase);
    // push off one blade, then the other; lean into the stride
    this.legL.rotation.z = Math.max(0, s) * 0.42 * frac;
    this.legR.rotation.z = -Math.max(0, -s) * 0.42 * frac;
    // the whole body leans into the glide; the legs trail a little
    this.lean = 0.22 * frac;
    this.legL.rotation.x = -0.1 - Math.max(0, s) * 0.25 * frac;
    this.legR.rotation.x = -0.1 - Math.max(0, -s) * 0.25 * frac;
    this.armL.rotation.x = -s * 0.5 * frac;
    this.armR.rotation.x = s * 0.5 * frac;
    this.armL.rotation.z = 0.18;
    this.armR.rotation.z = -0.18;
    this.torso.rotation.set(0.04, -s * 0.08, s * 0.05);
  }

  #poseSmoke(elapsed) {
    // a drag every ~9 s: hand up to the mouth, the ember glows, then a slow
    // exhale over the parapet; elbows on the rail in between
    const cycle = 9;
    const t = (elapsed + this.idlePhase) % cycle;
    const up = clamp(Math.min((t - 0.2) / 0.5, (2.4 - t) / 0.5), 0, 1);
    this.torso.rotation.x = 0.16;
    this.armL.rotation.x = -0.9;
    this.armR.rotation.x = -0.9 - up * 1.35;
    this.armR.rotation.z = -0.07 - up * 0.35;
    if (this.ember) this.ember.material.opacity = 0.55 + 0.45 * up;
    const exhale = t > 2.9 && t < 3.0;
    if (exhale && !this.exhaled) this.exhale = true;
    this.exhaled = exhale;
    this.torso.rotation.y = Math.sin(elapsed * 0.11 + this.idlePhase) * 0.3;
  }

  #poseWalk(frac, stride = 0.5) {
    const s = Math.sin(this.phase);
    const swing = stride * frac;
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.armL.rotation.x = -s * swing * 0.62;
    this.armL.rotation.y = 0;
    if (this.bag) {
      this.armR.rotation.x = -0.16 * frac;
      this.armR.rotation.y = 0;
      this.bagPivot.rotation.x = Math.sin(this.phase - 0.7) * 0.17 * frac;
    } else {
      this.armR.rotation.x = s * swing * 0.62;
      this.armR.rotation.y = 0;
    }
    this.torso.position.y = Math.abs(Math.cos(this.phase)) * 0.032 * frac;
    this.torso.position.x = 0;
    this.torso.rotation.set(0.05 * frac, s * 0.055 * frac, s * 0.035 * frac);
  }

  #poseIdle(elapsed) {
    const t = elapsed + this.idlePhase;
    const shift = Math.sin(t * 0.5);
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.torso.position.y = 0;
    this.torso.position.x = shift * 0.028;
    // slow look-around: two detuned sines stay under a comfortable head turn
    const look = clamp(Math.sin(t * 0.14) * 0.55 + Math.sin(t * 0.081 + 1.7) * 0.35, -0.8, 0.8);
    this.torso.rotation.set(0.02, look * 0.55, shift * 0.032);
    // the sleeves follow the upper body so the turn reads as one piece
    this.armL.rotation.y = look * 0.4;
    this.armR.rotation.y = look * 0.4;
    this.armL.rotation.x = 0.05 + Math.sin(t * 0.5 + 1) * 0.02;
    this.armR.rotation.x = 0.05 + Math.sin(t * 0.5) * 0.02;
    if (this.bag) this.bagPivot.rotation.x = Math.sin(t * 0.9) * 0.04;
  }

  /** World position of the mouth, for breath vapor. */
  headPosition(out) {
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    out.multiplyScalar(0.16 * this.scaleF);
    out.x += this.root.position.x;
    out.y = this.root.position.y + 1.52 * this.scaleF;
    out.z += this.root.position.z;
    return out;
  }
}

/* ------------------------------------------------------------ system */

class People {
  constructor(ctx) {
    this.world = ctx.world;
    this.rng = new Rng(20260207);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      flatShading: true,
    });

    // shared geometry: three hat variants, reused across figures
    this.parts = VARIANTS.map((v) => ({
      torso: buildTorsoGeometry(v),
      arm: buildArmGeometry(v),
      leg: buildLegGeometry(v),
    }));
    this.bagGeo = buildBagGeometry();

    const routes = makeRoutes();
    this.routes = Object.values(routes);
    // merged figures, built once per variant (with and without a bag)
    const figures = new Map();
    const partsFor = (i) => ({
      material: this.material,
      figure: (bag) => {
        const key = `${i}:${bag}`;
        if (!figures.has(key)) figures.set(key, buildFigureGeometry({ ...this.parts[i], bag: this.bagGeo }, bag));
        return figures.get(key);
      },
    });
    this.list = [
      new Pedestrian(this.world, partsFor(0), routes.avenue, {
        name: 'avenue ring',
        speed: 1.35,
        scale: 1.03,
        phase: 0.7,
        startFraction: 0.33,
      }),
      new Pedestrian(this.world, partsFor(1), routes.courtyard, {
        name: 'courtyard pair A',
        speed: 1.1,
        scale: 1.0,
        lateral: 0.42,
        phase: 0,
        startFraction: 0.45,
      }),
      new Pedestrian(this.world, partsFor(2), routes.courtyard, {
        name: 'courtyard pair B',
        speed: 1.1,
        scale: 0.95,
        lateral: -0.42,
        phase: 1.9,
        startFraction: 0.45,
      }),
      new Pedestrian(this.world, partsFor(2), routes.kiosk, {
        name: 'kiosk run',
        speed: 1.25,
        scale: 1.04,
        phase: 2.8,
        startFraction: 0.55,
        bag: true,
      }),
      new Pedestrian(this.world, partsFor(1), routes.busStop, {
        name: 'bus stop wait',
        scale: 0.97,
        phase: 4.1,
      }),
      new Pedestrian(this.world, partsFor(0), routes.northCourt, {
        name: 'north courtyard',
        speed: 1.15,
        scale: 1.01,
        phase: 3.6,
        startFraction: 0.4,
        far: true,
      }),
      new Pedestrian(this.world, partsFor(2), routes.eastArm, {
        name: 'zavodskaya stroll',
        speed: 1.2,
        scale: 0.96,
        phase: 5.2,
        startFraction: 0.6,
        bag: true,
        far: true,
      }),
      // residents of No. 3 and No. 12, in and out of their entrances
      new Pedestrian(this.world, partsFor(0), routes.residentB3, {
        name: 'resident No. 3',
        speed: 1.15,
        scale: 1.0,
        phase: 1.3,
        startFraction: 0.2,
        bag: true,
      }),
      new Pedestrian(this.world, partsFor(GRANNY[1]), routes.residentB1, {
        name: 'resident No. 12',
        speed: 0.95,
        scale: 0.94,
        phase: 2.2,
        startFraction: 0.7,
      }),
      // kids on the hockey box (the far-south group: shown once you get there)
      ...KID.map(
        (v, i) =>
          new Pedestrian(this.world, partsFor(v), routes.rink, {
            name: `skater ${i + 1}`,
            pose: 'skate',
            speed: 2.3 + i * 0.25,
            scale: 0.6 + i * 0.04,
            lateral: [0, 0.8, -0.8][i],
            phase: i * 1.7,
            startFraction: i * 0.31,
            group: this.world.southDetails,
          })
      ),
      new Pedestrian(this.world, partsFor(KID[1]), routes.slide, {
        name: 'slide kid',
        speed: 1.3,
        scale: 0.62,
        phase: 0.4,
        onFurniture: true,
        group: this.world.southDetails,
      }),
      // the bench grannies, turned toward each other
      ...[-1, 1].map(
        (side, i) =>
          new Pedestrian(this.world, partsFor(GRANNY[i]), routes.bench, {
            name: `bench granny ${i + 1}`,
            pose: 'bench',
            scale: 0.93,
            lateral: side * 0.42,
            phase: i * 3.3,
            talkTo: side,
            onFurniture: true,
          })
      ),
      new Pedestrian(this.world, partsFor(1), routes.balcony, {
        name: 'balcony smoker',
        pose: 'smoke',
        scale: 1.0,
        phase: 1.1,
        onFurniture: true,
        ember: new THREE.SpriteMaterial({
          map: makeSoftCircleTexture(32, '255,150,60', 1.6),
          color: 0xffa050,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      }),
    ];
    buildBalcony(this.world);

    // breath vapor: pooled sprites, one shared soft-circle texture
    const tex = makeSoftCircleTexture(64, '228,238,246', 2.4);
    this.puffs = [];
    for (let i = 0; i < PEOPLE.puffPool; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xd9e2ea,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.userData.breathPuff = true;
      this.world.group.add(sprite);
      this.puffs.push({ sprite, age: 0, active: false, vel: new THREE.Vector3() });
    }
    this.puffCursor = 0;
    this.headTmp = new THREE.Vector3();
    this.validated = false;
  }

  /**
   * Runs once on the first update, when every collider exists (trees are
   * planted after this module is built). Waypoints that collide are nudged
   * in a spiral; blocked segments get a detour point inserted beside them.
   */
  validateRoutes() {
    const world = this.world;
    const free = (x, z) => !world.collides(x, z, 0.4);
    const fixPoint = (p) => {
      if (free(p.x, p.z)) return true;
      for (const r of [0.5, 0.8, 1.2, 1.7, 2.3, 3.0]) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * TAU;
          const nx = p.x + Math.cos(ang) * r;
          const nz = p.z + Math.sin(ang) * r;
          if (free(nx, nz)) {
            p.x = nx;
            p.z = nz;
            return true;
          }
        }
      }
      return false;
    };

    for (const route of this.routes) {
      // scripted routes (stairs, a bench, a balcony) sit on colliders by design
      if (route.trusted) {
        route.points = route.points.map(normPoint);
        route.length = 0;
        const pts = route.points;
        for (let i = 0; i < pts.length; i++) {
          if (route.mode !== 'loop' && i === pts.length - 1) break;
          route.length += Math.hypot(pts[(i + 1) % pts.length].x - pts[i].x, pts[(i + 1) % pts.length].z - pts[i].z);
        }
        continue;
      }
      const fixed = route.points.map(normPoint).filter((p) => fixPoint(p));
      // routes are hand-placed on free lanes, so this should never trigger;
      // if a map change ever kills every point, keep the raw one instead
      route.points = fixed.length ? fixed : route.points.map(normPoint);
      // insert detour points where a segment crosses a collider (e.g. a tree)
      let insertions = 0;
      for (let pass = 0; pass < 40 && insertions < 30; pass++) {
        let inserted = false;
        const pts = route.points;
        const segCount = route.mode === 'loop' ? pts.length : pts.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const len = Math.hypot(dx, dz);
          const steps = Math.ceil(len / 2.5);
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const x = a.x + dx * t;
            const z = a.z + dz * t;
            if (free(x, z)) continue;
            const px = (-dz / len) * 1;
            const pz = (dx / len) * 1;
            let fixed = null;
            for (const off of [0.9, -0.9, 1.6, -1.6, 2.4, -2.4, 3.4, -3.4]) {
              if (free(x + px * off, z + pz * off)) {
                fixed = { x: x + px * off, z: z + pz * off, wait: 0, faceYaw: null };
                break;
              }
            }
            if (fixed) {
              pts.splice(i + 1, 0, fixed);
              insertions++;
              inserted = true;
            }
            break;
          }
          if (inserted) break;
        }
        if (!inserted) break;
      }
      route.length = 0;
      const pts = route.points;
      const segCount = route.mode === 'loop' ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++) {
        route.length += Math.hypot(pts[(i + 1) % pts.length].x - pts[i].x, pts[(i + 1) % pts.length].z - pts[i].z);
      }
    }
    for (const p of this.list) {
      p.routeLength = p.route.length;
      p.placeAtStart();
    }
  }

  update(dt, elapsed, playerPos, temperature) {
    if (!this.validated) {
      this.validateRoutes();
      this.validated = true;
    }
    const breathing = temperature <= 0;
    for (const p of this.list) {
      p.update(dt, elapsed);
      if (p.exhale) {
        p.exhale = false;
        this.#emitPuff(p, true);
      }
      if (!breathing || p.pose === 'smoke' || !p.root.visible) continue;
      p.breathTimer -= dt;
      if (p.breathTimer <= 0) {
        p.breathTimer = this.rng.float(PEOPLE.breathInterval[0], PEOPLE.breathInterval[1]);
        const dx = p.position.x - playerPos.x;
        const dz = p.position.z - playerPos.z;
        if (dx * dx + dz * dz < PEOPLE.vaporRange * PEOPLE.vaporRange) this.#emitPuff(p);
      }
    }
    this.#updateVapor(dt, elapsed);
  }

  #emitPuff(p, smoke = false) {
    const puff = this.puffs[this.puffCursor];
    // cigarette smoke: greyer, slower to fade, spreading wider
    puff.life = smoke ? PEOPLE.puffLife * 3.2 : PEOPLE.puffLife;
    puff.grow = smoke ? 0.9 : 0.4;
    puff.alpha = smoke ? 0.4 : 0.3;
    puff.sprite.material.color.setHex(smoke ? 0xb8bcc0 : 0xd9e2ea);
    this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
    p.headPosition(this.headTmp);
    puff.active = true;
    puff.age = 0;
    puff.sprite.visible = true;
    puff.sprite.position.copy(this.headTmp);
    // a short push forward (the exhale), then the wind takes over
    puff.vel.set(Math.sin(p.yaw) * 0.22, 0.17, Math.cos(p.yaw) * 0.22);
  }

  #updateVapor(dt, elapsed) {
    // same slow drift the weather system uses, so puffs bend with the snow
    const windX = Math.cos(elapsed * 0.03) * 0.5;
    const windZ = Math.sin(elapsed * 0.024 + 1.1) * 0.4;
    for (const puff of this.puffs) {
      if (!puff.active) continue;
      puff.age += dt;
      const life = puff.age / puff.life;
      if (life >= 1) {
        puff.active = false;
        puff.sprite.visible = false;
        puff.sprite.material.opacity = 0;
        continue;
      }
      const s = puff.sprite;
      s.position.x += (puff.vel.x + windX * 0.6) * dt;
      s.position.y += puff.vel.y * (1 - life * 0.6) * dt;
      s.position.z += (puff.vel.z + windZ * 0.6) * dt;
      const size = 0.13 + life * puff.grow;
      s.scale.set(size, size, 1);
      s.material.opacity = Math.sin(life * Math.PI) * puff.alpha;
    }
  }
}

export function buildPeople(ctx) {
  const people = new People(ctx);
  ctx.world.people = people;
}
