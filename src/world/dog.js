// A stray dog (дворняга) that lives on the obelisk square. It wanders the
// square, stops to sniff the snow, sits, scratches. When the player comes
// near it trots over and tags along a while, tail going, and sits down
// whenever they stop; it chases the snowballs that land near it, yelps and
// bolts when one hits it, and barks at the cars going by. Its own seeded
// stream drives its whims; it has no collider (the player walks round it,
// the drivers stop for it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, Rng } from '../util.js';

/** The square it calls home: wanders inside, comes back here. */
const HOME = { x0: -27, x1: -10, z0: -9, z1: 13 };
const FOLLOW_FROM = 9; // m: notices the player
const FOLLOW_TIME = 45; // s of tagging along before it loses interest
const LEASH = 70; // m from home: goes back
const TROT = 2.6;
const RUN = 5.5;
const WALK = 1.1;
const RADIUS = 0.3;

const BONES = ['body', 'head', 'tail', 'legFL', 'legFR', 'legBL', 'legBR'];
/** Pivot of each bone (body-relative), the body pivot at the withers. */
const PIVOTS = {
  body: [0, 0.46, 0],
  head: [0, 0.6, 0.27],
  tail: [0, 0.55, -0.31],
  legFL: [0.085, 0.42, 0.22],
  legFR: [-0.085, 0.42, 0.22],
  legBL: [0.085, 0.42, -0.22],
  legBR: [-0.085, 0.42, -0.22],
};

function dogGeometry() {
  const pieces = [];
  const part = (bone, hex, w, h, d, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const b = BONES.indexOf(bone);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((v, i) => (i % 4 === 0 ? b : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((v, i) => (i % 4 === 0 ? 1 : 0)), 4));
    pieces.push(g);
  };
  const TAN = 0x8a6644;
  const DARK = 0x4a3626;
  const PALE = 0xcdb79b;
  // body: barrel, a darker saddle, a pale chest
  part('body', TAN, 0.27, 0.25, 0.6, 0, 0.48, -0.02);
  part('body', DARK, 0.24, 0.06, 0.46, 0, 0.62, -0.04);
  part('body', PALE, 0.22, 0.2, 0.12, 0, 0.47, 0.26);
  part('body', TAN, 0.16, 0.18, 0.14, 0, 0.6, 0.27, -0.6); // neck
  // head: skull, muzzle, black nose, folded ears
  part('head', TAN, 0.19, 0.18, 0.2, 0, 0.71, 0.36);
  part('head', PALE, 0.11, 0.09, 0.15, 0, 0.66, 0.5);
  part('head', 0x161412, 0.06, 0.04, 0.03, 0, 0.69, 0.585);
  part('head', DARK, 0.06, 0.09, 0.03, 0.075, 0.8, 0.31, 0.5);
  part('head', DARK, 0.06, 0.09, 0.03, -0.075, 0.8, 0.31, 0.5);
  // tail, up and back
  part('tail', DARK, 0.05, 0.05, 0.28, 0, 0.62, -0.42, 0.55);
  // legs, paws a shade paler
  for (const [bone, x, z] of [
    ['legFL', 0.085, 0.22],
    ['legFR', -0.085, 0.22],
    ['legBL', 0.085, -0.22],
    ['legBR', -0.085, -0.22],
  ]) {
    part(bone, TAN, 0.07, 0.36, 0.08, x, 0.24, z);
    part(bone, PALE, 0.075, 0.05, 0.1, x, 0.03, z + 0.01);
  }
  return mergeGeometries(pieces, false);
}

class Dog {
  constructor(world) {
    this.world = world;
    this.rng = new Rng(1957);
    this.position = new THREE.Vector3(-18, 0, 2);
    this.yaw = 0;
    this.speed = 0;
    this.phase = 0;
    this.wag = 0; // 0..1 how happy the tail is
    this.state = 'idle';
    this.timer = 2;
    this.target = null;
    this.followT = 0;
    this.cooldown = 0; // s before it follows again after giving up
    this.barkT = 0;
    this.lastBark = 0;
    /** Set when it barks or yelps (main.js turns them into sounds). */
    this.voice = null;
    this.t = 0;
    this.sit = 0; // 0 standing … 1 sitting
    this.sniff = 0;
    this.scratch = 0;

    this.root = new THREE.Group();
    this.root.name = 'dog';
    this.root.userData.dynamic = true;
    const mesh = new THREE.SkinnedMesh(dogGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.bones = {};
    for (const name of BONES) {
      const b = new THREE.Bone();
      this.bones[name] = b;
    }
    const body = this.bones.body;
    body.position.set(...PIVOTS.body);
    mesh.add(body);
    for (const name of BONES.slice(1)) {
      const b = this.bones[name];
      const p = PIVOTS[name];
      b.position.set(p[0] - PIVOTS.body[0], p[1] - PIVOTS.body[1], p[2] - PIVOTS.body[2]);
      body.add(b);
    }
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(BONES.map((n) => this.bones[n])));
    this.mesh = mesh;
    this.root.add(mesh);
    this.root.position.copy(this.position);
  }

  /* ------------------------------------------------------------ moving */

  /** Free to stand at (x, z)? (colliders, the world edge, the traffic lanes) */
  free(x, z) {
    if (this.world.collides(x, z, RADIUS)) return false;
    return true;
  }

  /** Steps toward (tx, tz) at `speed`, sliding round what is in the way. */
  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz);
    this.speed = damp(this.speed, dist > 0.05 ? speed : 0, 5, dt);
    if (dist < 0.05) return dist;
    const want = Math.atan2(dx, dz);
    const step = Math.min(dist, this.speed * dt);
    // the straight way first, then ever wider swerves
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = want + off;
      const nx = this.position.x + Math.sin(a) * step;
      const nz = this.position.z + Math.cos(a) * step;
      if (this.free(nx, nz)) {
        this.position.x = nx;
        this.position.z = nz;
        this.turnTo(a, dt);
        return dist;
      }
    }
    // boxed in: give up on this target
    this.speed = 0;
    this.stuck = (this.stuck ?? 0) + dt;
    return dist;
  }

  turnTo(yaw, dt, rate = 7) {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  /** A random free spot on the home square. */
  pickHomeSpot() {
    for (let i = 0; i < 20; i++) {
      const x = this.rng.float(HOME.x0, HOME.x1);
      const z = this.rng.float(HOME.z0, HOME.z1);
      if (this.free(x, z)) return { x, z };
    }
    return { x: (HOME.x0 + HOME.x1) / 2, z: (HOME.z0 + HOME.z1) / 2 };
  }

  homeDistance() {
    const cx = clamp(this.position.x, HOME.x0, HOME.x1);
    const cz = clamp(this.position.z, HOME.z0, HOME.z1);
    return Math.hypot(this.position.x - cx, this.position.z - cz);
  }

  bark(times = 2, kind = 'bark') {
    this.voice = { kind, times };
    this.barkT = 0.6;
  }

  /** A snowball came down at (x, z): hit, or something to chase. */
  snowball(x, z, hitMe) {
    if (hitMe) {
      this.bark(1, 'yelp');
      // bolt away from where it came from
      const a = Math.atan2(this.position.x - x, this.position.z - z) + this.rng.float(-0.5, 0.5);
      this.target = { x: this.position.x + Math.sin(a) * 9, z: this.position.z + Math.cos(a) * 9 };
      this.state = 'flee';
      this.timer = 2.5;
      this.cooldown = 12;
      this.followT = 0;
      return;
    }
    if (this.state === 'flee') return;
    if (Math.hypot(x - this.position.x, z - this.position.z) > 14) return;
    this.target = { x, z };
    this.state = 'chase';
    this.timer = 4;
  }

  /* ------------------------------------------------------------ brain */

  update(dt, { player = null, cars = [], indoors = false } = {}) {
    const p = this.position;
    if (!this.placed) {
      // the trees are planted after the props: find a free spot on the
      // first update, once every collider is in
      this.placed = true;
      const spot = this.pickHomeSpot();
      p.set(spot.x, 0, spot.z);
    }
    this.timer -= dt;
    this.cooldown -= dt;
    this.barkT = Math.max(0, this.barkT - dt);
    this.stuck = Math.max(0, (this.stuck ?? 0) - dt * 0.5);
    const pd = player && !indoors ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;
    let goal = null;
    let pace = 0;
    let happy = 0;

    // notices the player: comes over
    if (pd < FOLLOW_FROM && this.cooldown <= 0 && ['idle', 'wander', 'sniff', 'home'].includes(this.state)) {
      if (this.state !== 'follow' && this.followT <= 0) this.bark(this.rng.chance(0.5) ? 1 : 2);
      this.state = 'follow';
      this.followT = FOLLOW_TIME;
    }

    switch (this.state) {
      case 'follow': {
        this.followT -= dt;
        happy = 1;
        if (this.followT <= 0 || pd > 30 || this.homeDistance() > LEASH) {
          // bored, lost or too far from home: back to the square
          this.state = 'home';
          this.cooldown = 25;
          this.target = this.pickHomeSpot();
          break;
        }
        // keeps a couple of metres off, a little to the side
        if (pd > 2.4) {
          const k = (pd - 1.8) / pd;
          goal = { x: p.x + (player.x - p.x) * k, z: p.z + (player.z - p.z) * k };
          pace = pd > 7 ? RUN : pd > 3.5 ? TROT : WALK;
        } else {
          this.turnTo(Math.atan2(player.x - p.x, player.z - p.z), dt, 3);
        }
        break;
      }
      case 'chase': {
        happy = 1;
        goal = this.target;
        pace = RUN;
        if (Math.hypot(goal.x - p.x, goal.z - p.z) < 0.6 || this.timer <= 0 || this.stuck > 1) {
          // found it: a good sniff at the spot
          this.state = 'sniff';
          this.timer = this.rng.float(1.5, 3);
        }
        break;
      }
      case 'flee':
        goal = this.target;
        pace = RUN;
        if (this.timer <= 0 || Math.hypot(goal.x - p.x, goal.z - p.z) < 0.6 || this.stuck > 1) {
          this.state = 'idle';
          this.timer = this.rng.float(2, 4);
        }
        break;
      case 'home':
      case 'wander':
        goal = this.target;
        pace = this.state === 'home' ? TROT : WALK;
        if (!goal || Math.hypot(goal.x - p.x, goal.z - p.z) < 0.5 || this.stuck > 1.5) {
          this.stuck = 0;
          // there: sniff around, sit or scratch
          const r = this.rng.next();
          this.state = r < 0.45 ? 'sniff' : 'idle';
          this.timer = this.state === 'sniff' ? this.rng.float(2, 5) : this.rng.float(3, 9);
          this.scratch = this.state === 'idle' && this.rng.chance(0.3) ? 1.6 : 0;
        }
        break;
      case 'sniff':
      case 'idle':
      default:
        if (this.timer <= 0) {
          this.state = this.homeDistance() > 1 ? 'home' : 'wander';
          this.target = this.pickHomeSpot();
        }
    }

    // barks at a car driving close by, now and then
    if (!indoors) {
      for (const c of cars) {
        if (Math.abs(c.speed) < 3) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < 9 && this.lastBark <= 0 && this.rng.chance(dt * 0.8)) {
          this.bark(this.rng.int(2, 3));
          this.lastBark = 12;
          this.turnTo(Math.atan2(c.x - p.x, c.z - p.z), 1, 1);
        }
      }
    }
    this.lastBark -= dt;

    if (goal) this.moveToward(goal.x, goal.z, pace, dt);
    else this.speed = damp(this.speed, 0, 6, dt);
    this.wag = damp(this.wag, happy, 2, dt);
    this.animate(dt);
  }

  /* ------------------------------------------------------------ pose */

  animate(dt) {
    this.t += dt;
    const b = this.bones;
    const moving = this.speed > 0.15;
    const sits = !moving && (this.state === 'follow' || (this.state === 'idle' && this.scratch <= 0 && this.timer > 1.5));
    this.sit = damp(this.sit, sits ? 1 : 0, 4, dt);
    this.sniff = damp(this.sniff, this.state === 'sniff' && !moving ? 1 : 0, 4, dt);
    this.phase += dt * (this.speed > 3.5 ? 2.2 : 1.7) * (this.speed / 0.55);
    const swing = clamp(this.speed / TROT, 0, 1) * (this.speed > 3.5 ? 0.75 : 0.55);
    const s = Math.sin(this.phase);
    // trot: diagonal pairs; the gallop (fast) pairs front and back legs
    const gallop = this.speed > 3.5;
    b.legFL.rotation.x = s * swing;
    b.legBR.rotation.x = (gallop ? -s : s) * swing;
    b.legFR.rotation.x = -s * swing;
    b.legBL.rotation.x = (gallop ? s : -s) * swing;
    // sitting: the body tips up at the front, the hind legs fold
    const sit = this.sit;
    b.body.rotation.x = -0.55 * sit + (gallop ? Math.cos(this.phase) * 0.06 : 0);
    b.body.position.y = PIVOTS.body[1] - 0.1 * sit + Math.abs(Math.cos(this.phase)) * 0.02 * swing;
    b.legFL.rotation.x += 0.55 * sit;
    b.legFR.rotation.x += 0.55 * sit;
    b.legBL.rotation.x += -1.0 * sit;
    b.legBR.rotation.x += -1.0 * sit;
    // scratching an ear with a hind leg
    if (this.scratch > 0 && !moving) {
      this.scratch = Math.max(0, this.scratch - dt);
      b.legBL.rotation.x = -1.3 + Math.sin(this.t * 30) * 0.25;
      b.head.rotation.z = 0.3;
    } else {
      b.head.rotation.z = 0;
    }
    // head: nose to the snow when sniffing, up when barking
    b.head.rotation.x = 0.75 * this.sniff - (this.barkT > 0 ? 0.25 : 0) + 0.3 * sit;
    b.head.rotation.y = this.sniff * Math.sin(this.phase * 0.3 + this.timer * 2) * 0.3;
    // tail: wagging when happy, low when it bolts
    this.tailPhase = (this.tailPhase ?? 0) + dt * (6 + this.wag * 10);
    b.tail.rotation.y = Math.sin(this.tailPhase) * (0.15 + this.wag * 0.55);
    b.tail.rotation.x = this.state === 'flee' ? 0.9 : -0.1 * this.wag;
    this.root.position.set(this.position.x, this.world.heightAt(this.position.x, this.position.z), this.position.z);
    this.root.rotation.y = this.yaw;
  }
}

export function buildDog(ctx) {
  const dog = new Dog(ctx.world);
  ctx.world.group.add(dog.root);
  ctx.world.dog = dog;
}
