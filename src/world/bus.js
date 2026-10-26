// The city bus: a LiAZ-like single-decker, ochre below and cream above, that
// goes round the block with the traffic (traffic.js) and calls at the bus
// stop on the avenue: it pulls over to the curb, folds its doors open with a
// hiss of air, waits, closes them and pulls out again. It has the same
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
};
const HALF_L = BUS.length / 2;
const HALF_W = BUS.width / 2;

const OCHRE = 0xcf9f3a;
const STRIPE = 0xa9372a;
const CREAM = 0xe2d9c0;
const ROOF = 0xe8e3d4;
const DARK = 0x1f2326;
const PANE = 0x26303a;

/** Doors on the right-hand side (local -x): [front edge, rear edge] in z. */
const DOORS = [
  [4.95, 4.0],
  [0.2, -0.8],
];
const LEAF_H = 1.86;
const LEAF_Y = 0.42;

const _dummy = new THREE.Object3D();

function busParts() {
  const paint = [];
  const dark = [];
  const add = (list, hex, w, h, d, x, y, z) => list.push(colorize(box(w, h, d, x, y, z), hex));

  const bodyL = BUS.length - 0.2;
  // skirt: arches cut round the wheels, a dark core behind them
  add(dark, DARK, BUS.width - 0.4, 0.62, bodyL - 0.2, 0, 0.73, 0);
  const arches = [BUS.frontAxle, BUS.rearAxle].map((z) => [z - 0.68, z + 0.68]).sort((a, b) => a[0] - b[0]);
  let z0 = -bodyL / 2;
  for (const [a, b] of [...arches, [bodyL / 2, bodyL / 2]]) {
    if (a > z0) {
      for (const side of [-1, 1]) {
        // the right side leaves room for the doors (the leaves close it)
        const spans = side < 0 ? cutDoors(z0, a) : [[z0, a]];
        for (const [s0, s1] of spans) add(paint, OCHRE, 0.08, 0.56, s1 - s0, side * (HALF_W - 0.04), 0.72, (s0 + s1) / 2);
      }
    }
    z0 = b;
  }
  // ends of the skirt and the panel above the arches
  add(paint, OCHRE, BUS.width, 0.56, 0.1, 0, 0.72, bodyL / 2 - 0.05);
  add(paint, OCHRE, BUS.width, 0.56, 0.1, 0, 0.72, -bodyL / 2 + 0.05);
  for (const side of [-1, 1]) {
    const spans = side < 0 ? cutDoors(-bodyL / 2, bodyL / 2) : [[-bodyL / 2, bodyL / 2]];
    for (const [s0, s1] of spans) {
      add(paint, OCHRE, 0.08, 0.28, s1 - s0, side * (HALF_W - 0.04), 1.14, (s0 + s1) / 2);
      // the red belt line under the windows
      add(paint, STRIPE, 0.09, 0.08, s1 - s0, side * (HALF_W - 0.035), 1.31, (s0 + s1) / 2);
    }
  }
  add(paint, OCHRE, BUS.width, 0.28, 0.1, 0, 1.14, bodyL / 2 - 0.05);
  add(paint, OCHRE, BUS.width, 0.28, 0.1, 0, 1.14, -bodyL / 2 + 0.05);
  add(paint, STRIPE, BUS.width + 0.01, 0.08, 0.11, 0, 1.31, bodyL / 2 - 0.05);
  add(paint, STRIPE, BUS.width + 0.01, 0.08, 0.11, 0, 1.31, -bodyL / 2 + 0.05);
  // floor under the window band
  add(dark, DARK, BUS.width - 0.2, 0.1, bodyL - 0.2, 0, 1.3, 0);

  // window band: pillars between the panes, the ends closed in cream
  const pillars = [];
  for (let z = -4.6; z <= 3.6; z += 1.18) pillars.push(z);
  for (const z of pillars) {
    for (const side of [-1, 1]) {
      if (side < 0 && DOORS.some(([f, r]) => z > r - 0.1 && z < f + 0.1)) continue;
      add(paint, CREAM, 0.07, 1.0, 0.13, side * (HALF_W - 0.03), 1.85, z);
    }
  }
  // door posts
  for (const [f, r] of DOORS) for (const z of [f + 0.05, r - 0.05]) add(paint, CREAM, 0.08, LEAF_H + 0.1, 0.1, -(HALF_W - 0.03), LEAF_Y + LEAF_H / 2, z);
  add(paint, CREAM, BUS.width, 1.0, 0.24, 0, 1.85, -bodyL / 2 + 0.12);
  for (const side of [-1, 1]) add(paint, CREAM, 0.12, 1.0, 0.24, side * (HALF_W - 0.06), 1.85, bodyL / 2 - 0.12);
  // upper body and the rounded-off roof
  add(paint, CREAM, BUS.width, 0.5, bodyL, 0, 2.6, 0);
  add(paint, ROOF, BUS.width - 0.24, 0.1, bodyL - 0.3, 0, 2.9, 0);
  add(paint, ROOF, BUS.width - 0.7, 0.06, bodyL - 0.9, 0, 2.97, 0);
  // the front: a cream nose round the windscreen
  add(paint, CREAM, BUS.width, 0.12, 0.08, 0, 1.31, HALF_L - 0.08);

  // trim: bumpers, mirrors, the grille
  add(dark, DARK, BUS.width + 0.06, 0.22, 0.14, 0, 0.5, HALF_L - 0.07);
  add(dark, DARK, BUS.width + 0.06, 0.22, 0.14, 0, 0.5, -HALF_L + 0.07);
  add(dark, 0x3a3e40, 1.2, 0.18, 0.04, 0, 0.82, HALF_L - 0.08);
  for (const side of [-1, 1]) {
    add(dark, DARK, 0.3, 0.04, 0.04, side * (HALF_W + 0.13), 2.05, HALF_L - 0.25);
    add(dark, DARK, 0.06, 0.32, 0.14, side * (HALF_W + 0.28), 1.9, HALF_L - 0.25);
  }

  // glass: side panes (the saloon lights up at night), windscreen and rear
  // window (the dark cab and the back seats)
  const glass = box(BUS.width - 0.04, 0.92, bodyL - 0.5, 0, 1.85, 0);
  const screens = mergeGeometries([box(BUS.width - 0.16, 1.08, 0.04, 0, 1.86, HALF_L - 0.1), box(BUS.width - 0.5, 0.6, 0.04, 0, 1.98, -HALF_L + 0.08)].map(plain), false);

  // lamps: round headlights, red tail lamps
  const lamps = [];
  for (const side of [-1, 1]) {
    const head = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 14);
    head.rotateX(Math.PI / 2);
    head.translate(side * 0.88, 0.82, HALF_L - 0.06);
    lamps.push(colorize(head, 0xfff3d6));
    lamps.push(colorize(box(0.16, 0.24, 0.03, side * 1.0, 0.95, -HALF_L + 0.06), 0xff2a18));
  }

  // the route board over the windscreen
  const board = box(1.7, 0.28, 0.04, 0, 2.55, HALF_L + 0.005);

  const snow = box(BUS.width - 0.3, 0.12, bodyL - 0.5, 0, 3.03, 0);

  // a wheel: tyre and hub, spinning about local x
  const tyre = new THREE.CylinderGeometry(BUS.wheelR, BUS.wheelR, 0.34, 18);
  tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10);
  hub.rotateZ(Math.PI / 2);
  const wheel = mergeGeometries([colorize(tyre, 0x1b1c1d), colorize(hub, 0x8f8a7c), colorize(box(0.37, 0.06, 0.34, 0, 0, 0), 0x55534c)], false);

  // a door leaf: ochre panel below, glazing above, hinged on its z = 0 edge
  const leaf = (sign) => {
    const w = 0.46;
    const parts = [
      colorize(box(0.05, 0.58, w, 0, 0.29, (sign * w) / 2), OCHRE),
      colorize(box(0.05, LEAF_H - 0.58, w, 0, 0.58 + (LEAF_H - 0.58) / 2, (sign * w) / 2), PANE),
      colorize(box(0.06, 0.05, w, 0, LEAF_H - 0.03, (sign * w) / 2), CREAM),
      colorize(box(0.06, 0.05, w, 0, 0.6, (sign * w) / 2), CREAM),
    ];
    return mergeGeometries(parts, false);
  };

  const merge = (list) => mergeGeometries(list.map(plain), false);
  return {
    body: merge([...paint, ...dark]),
    glass,
    screens,
    lamps: merge(lamps),
    board,
    snow,
    wheel,
    leafFront: leaf(-1),
    leafRear: leaf(1),
  };
}

/** The [z0, z1] spans of the right side left once the door openings are cut out. */
function cutDoors(z0, z1) {
  let spans = [[z0, z1]];
  for (const [f, r] of DOORS) {
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
    add(parts.body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }));
    // the panes glow warm when the saloon lights are on
    this.glassMat = new THREE.MeshStandardMaterial({ color: PANE, roughness: 0.18, metalness: 0.5, emissive: 0xffcf8a, emissiveIntensity: 0 });
    add(parts.glass, this.glassMat, false);
    this.screenMat = this.glassMat.clone();
    add(parts.screens, this.screenMat, false);
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
        const leaf = new THREE.Mesh(geo, leafMat);
        leaf.position.set(-(HALF_W + 0.01), LEAF_Y, z);
        leaf.castShadow = true;
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

  /** 0 = day, 1 = night: headlights, saloon lights and the route board. */
  setLights(level) {
    this.lampMat.color.setScalar(0.32 + level * 1.6);
    this.glassMat.emissiveIntensity = level * 0.2;
    this.screenMat.emissiveIntensity = level * 0.06;
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
