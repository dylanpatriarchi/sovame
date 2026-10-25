// Courtyard cats (дворовые кошки): one sits on the porch of a handful of
// entrances, beside the door, tail curled round or twitching, and turns its
// head to watch whoever walks by. Walk up quietly and E strokes it: it leans
// into the hand and purrs. The dog, a sprint past or a snowball landing near
// sends it dashing round the porch cheek and down the basement vent (продух)
// beside it; it comes back out once the coast is clear. Their own seeded
// stream, no colliders; three small meshes a cat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING_SPECS, EXPANSION_SPECS } from './buildings.js';
import { allEntrances } from './entrances.js';
import { damp, Rng } from '../util.js';

const COUNT = 6;
const PAD_TOP = 0.26; // the porch slab
const SPRINT = 4; // m/s: anyone faster coming close is a fright
const NERVE = { player: 2.6, dog: 7, snowball: 3.5 };
const DASH = 4.2; // m/s
const AWAY = { player: 9, dog: 12 }; // m: clear before it comes back out
const PURR = 3.2; // s of purring to a stroke

const COATS = [
  { base: 0x8a8781, dark: 0x4f4d4a, pale: 0xc9c4ba }, // grey tabby
  { base: 0xc0773a, dark: 0x8a4a22, pale: 0xe8c39a }, // ginger
  { base: 0x232325, dark: 0x141415, pale: 0x3a3a3c }, // black
  { base: 0x2b2a2a, dark: 0x1a1919, pale: 0xe9e6e0 }, // black and white
  { base: 0x6e6157, dark: 0x3e352f, pale: 0xb7aa9a }, // brown tabby
  { base: 0xd8d2c8, dark: 0x9a9289, pale: 0xf2efe9 }, // white
];

function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A sitting cat, facing +z: body (origin on the ground), head and tail (each at its pivot). */
function catGeometry(coat) {
  const box = (w, h, d, x, y, z, hex, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return tint(g, hex);
  };
  const ball = (r, sx, sy, sz, x, y, z, hex) => {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return tint(g, hex);
  };
  const body = mergeGeometries([
    // haunches, the upright chest, the front legs, the paws
    ball(0.1, 1.05, 0.85, 1.25, 0, 0.09, -0.04, coat.base),
    ball(0.075, 1, 1.45, 0.9, 0, 0.17, 0.04, coat.base),
    ball(0.05, 0.9, 1.3, 0.5, 0, 0.17, 0.085, coat.pale),
    box(0.03, 0.15, 0.035, 0.035, 0.075, 0.075, coat.base),
    box(0.03, 0.15, 0.035, -0.035, 0.075, 0.075, coat.base),
    box(0.036, 0.022, 0.05, 0.035, 0.011, 0.09, coat.pale),
    box(0.036, 0.022, 0.05, -0.035, 0.011, 0.09, coat.pale),
    // tabby stripes along the back
    box(0.15, 0.012, 0.025, 0, 0.165, -0.06, coat.dark),
    box(0.15, 0.012, 0.025, 0, 0.16, -0.12, coat.dark),
  ]);
  const head = mergeGeometries([
    ball(0.058, 1.1, 0.95, 1, 0, 0.03, 0.01, coat.base),
    ball(0.028, 1.3, 0.8, 0.9, 0, 0.012, 0.05, coat.pale), // muzzle
    box(0.012, 0.01, 0.008, 0, 0.022, 0.075, 0xc98a86), // nose
    // the eyes: amber slits
    box(0.018, 0.012, 0.006, 0.024, 0.04, 0.062, 0xc9a43a),
    box(0.018, 0.012, 0.006, -0.024, 0.04, 0.062, 0xc9a43a),
    // the ears
    tint(new THREE.ConeGeometry(0.024, 0.05, 4).translate(0.034, 0.088, 0.005), coat.base),
    tint(new THREE.ConeGeometry(0.024, 0.05, 4).translate(-0.034, 0.088, 0.005), coat.base),
  ]);
  // the tail: three segments curving out along the ground and up a little
  const tail = mergeGeometries([
    box(0.03, 0.03, 0.12, 0, 0, -0.06, coat.base),
    box(0.028, 0.028, 0.1, 0.02, 0.008, -0.15, coat.dark, -0.15),
    box(0.026, 0.026, 0.09, 0.05, 0.025, -0.23, coat.base, -0.3),
  ]);
  return { body, head, tail };
}

class Cat {
  constructor(home, coat, rng, mat) {
    this.home = home;
    this.rng = rng;
    const { body, head, tail } = catGeometry(coat);
    this.root = new THREE.Group();
    this.root.name = 'cat';
    this.body = new THREE.Mesh(body, mat);
    this.head = new THREE.Mesh(head, mat);
    this.head.position.set(0, 0.27, 0.07);
    this.tail = new THREE.Mesh(tail, mat);
    this.tail.position.set(0, 0.03, -0.14);
    for (const m of [this.body, this.head, this.tail]) {
      m.castShadow = true;
      this.root.add(m);
    }
    this.root.scale.setScalar(rng.float(0.92, 1.1));
    this.state = 'sit';
    this.timer = 0;
    this.purr = 0;
    this.groom = 0;
    this.look = 0;
    this.swish = rng.float(0, 6);
    this.path = null;
    this.seen = false;
    this.meowIn = 0;
    this.place(home);
  }

  place(at) {
    this.root.position.set(at.x, at.y, at.z);
    this.root.rotation.y = at.yaw;
    this.root.visible = true;
  }

  get x() {
    return this.root.position.x;
  }

  get z() {
    return this.root.position.z;
  }
}

class Cats {
  constructor(world) {
    this.world = world;
    this.rng = new Rng(1957);
    /** Meows, purrs and hisses to be heard (main.js plays them). */
    this.voice = [];
    this.group = new THREE.Group();
    this.group.name = 'cats';
    // they move: never baked into the static batches
    this.group.userData.dynamic = true;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
    });
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0c });
    const ventGeo = new THREE.PlaneGeometry(0.34, 0.22);

    // a handful of porches on the central blocks, near where you walk,
    // never two on one block
    const ids = new Set([...BUILDING_SPECS, ...EXPANSION_SPECS].map((s) => s.id));
    const porches = allEntrances().filter((e) => ids.has(e.spec.id) && Math.hypot(e.x, e.z) < 80);
    const used = new Set();
    this.list = [];
    let guard = 0;
    while (this.list.length < COUNT && guard++ < 200) {
      const e = porches[this.rng.int(0, porches.length - 1)];
      if (used.has(e.spec.id)) continue;
      used.add(e.spec.id);
      const s = e.side;
      const lx = this.rng.sign();
      // porch-local (x along the wall, +z outward) to world
      const at = (x, z) => ({ x: e.x + s * x, z: e.z + s * z });
      const sit = at(lx * 1.02, 0.36);
      const ground = world.heightAt ? world.heightAt(e.pad.x, e.pad.z) : 0;
      const home = {
        ...sit,
        y: ground + PAD_TOP,
        yaw: (s > 0 ? 0 : Math.PI) + this.rng.float(-0.5, 0.5),
      };
      // round the cheek and down the vent beside the porch
      const vent = at(lx * 2.3, 0);
      const path = [at(lx * 1.02, 0.75), at(lx * 2.3, 0.75), at(lx * 2.3, 0.12)];
      home.path = path.map((p) => ({ ...p, y: ground }));
      home.vent = { ...vent, y: ground };
      const v = new THREE.Mesh(ventGeo, ventMat);
      v.position.set(vent.x, ground + 0.2, vent.z + s * 0.012);
      v.rotation.y = s > 0 ? 0 : Math.PI;
      this.group.add(v);
      const cat = new Cat(home, COATS[this.list.length], this.rng, mat);
      this.group.add(cat.root);
      this.list.push(cat);
    }
  }

  /** Something startling at (x, z): the cats within `r` bolt. */
  scare(x, z, r = NERVE.snowball) {
    for (const c of this.list) if (c.state === 'sit' && Math.hypot(c.x - x, c.z - z) < r) this.bolt(c);
  }

  bolt(c, hiss = false) {
    c.state = 'dash';
    c.path = c.home.path.slice();
    c.purr = 0;
    if (hiss) this.voice.push({ kind: 'hiss', x: c.x, z: c.z });
  }

  /** E: a stroke behind the ears. */
  stroke(c) {
    if (c.state !== 'sit') return false;
    c.purr = PURR;
    c.meowIn = 8;
    this.voice.push({ kind: 'purr', x: c.x, z: c.z, t: PURR });
    return true;
  }

  /** The sitting cat within `r` of (x, z), nearest first. */
  near(x, z, r) {
    let best = null;
    let bestD = r;
    for (const c of this.list) {
      if (c.state !== 'sit') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  update(dt, { player = null, speed = 0 } = {}) {
    // the first frame can come in with a step back in time
    dt = Math.max(0, dt);
    const dog = this.world.dog?.position;
    for (const c of this.list) {
      const dp = player ? Math.hypot(player.x - c.x, player.z - c.z) : Infinity;
      const dd = dog ? Math.hypot(dog.x - c.x, dog.z - c.z) : Infinity;
      if (c.state === 'sit') {
        if (dd < NERVE.dog) this.bolt(c, true);
        else if (dp < NERVE.player && speed > SPRINT) this.bolt(c);
      }
      if (c.state === 'sit') this.sit(c, dt, player, dp);
      else if (c.state === 'dash') this.dash(c, dt);
      else {
        // below in the basement: out again once nobody is about
        c.timer -= dt;
        if (c.timer <= 0 && dp > AWAY.player && dd > AWAY.dog) {
          c.state = 'sit';
          c.place(c.home);
        }
      }
    }
  }

  /** On the porch: watches, grooms now and then, purrs when stroked. */
  sit(c, dt, player, dp) {
    c.purr = Math.max(0, c.purr - dt);
    c.timer -= dt;
    if (c.timer <= 0) {
      c.timer = this.rng.float(3, 9);
      c.groom = this.rng.chance(0.3) ? this.rng.float(2, 4) : 0;
    }
    c.groom = Math.max(0, c.groom - dt);
    // watch whoever comes near, turning the head (not the body)
    let want = 0;
    if (player && dp < 6) {
      const a = Math.atan2(player.x - c.x, player.z - c.z) - c.root.rotation.y;
      want = Math.max(-1.1, Math.min(1.1, Math.atan2(Math.sin(a), Math.cos(a))));
    }
    c.look = damp(c.look, c.groom > 0 ? 0.5 : want, 5, dt);
    c.head.rotation.y = c.look;
    // purring: the head tilts up into the hand; grooming: it dips to the chest
    const tilt = c.purr > 0 ? -0.35 : c.groom > 0 ? 0.6 + Math.sin(c.groom * 9) * 0.12 : 0;
    c.head.rotation.x = damp(c.head.rotation.x, tilt, 6, dt);
    // the tail: curled and still when content, twitching at the tip otherwise
    c.swish += dt * (c.purr > 0 ? 1.2 : 2.4);
    c.tail.rotation.y = 0.5 + Math.sin(c.swish) * (c.purr > 0 ? 0.08 : 0.3);
    c.tail.rotation.x = damp(c.tail.rotation.x, c.purr > 0 ? -0.5 : 0, 4, dt);
    c.body.position.y = 0;
    // a meow for someone stopping close by, once in a while
    c.meowIn = Math.max(0, c.meowIn - dt);
    if (player && dp < 3 && !c.seen && c.meowIn <= 0) {
      c.seen = true;
      c.meowIn = 20;
      this.voice.push({ kind: 'meow', x: c.x, z: c.z });
    }
    if (dp > 5) c.seen = false;
  }

  /** Off the porch, round the cheek and down the vent. */
  dash(c, dt) {
    const to = c.path[0];
    const dx = to.x - c.x;
    const dz = to.z - c.z;
    const d = Math.hypot(dx, dz);
    const step = DASH * dt;
    c.root.rotation.y = Math.atan2(dx, dz);
    c.head.rotation.set(0.2, 0, 0);
    c.tail.rotation.set(-0.2, 0, 0);
    c.body.position.y = Math.abs(Math.sin(c.swish * 2)) * 0.03;
    c.swish += dt * 9;
    if (d <= step) {
      c.root.position.set(to.x, to.y, to.z);
      c.path.shift();
      if (!c.path.length) {
        c.state = 'hidden';
        c.root.visible = false;
        c.timer = this.rng.float(25, 45);
      }
    } else {
      c.root.position.x += (dx / d) * step;
      c.root.position.z += (dz / d) * step;
      c.root.position.y = damp(c.root.position.y, to.y, 12, dt);
    }
  }
}

export function buildCats(ctx) {
  const cats = new Cats(ctx.world);
  ctx.world.group.add(cats.group);
  ctx.world.cats = cats;
}
