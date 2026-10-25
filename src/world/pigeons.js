// Pigeons (голуби): two small flocks peck about on the ground, one on the
// sidewalk in front of the kiosk and one on the obelisk square. Someone
// coming too close (the player, the dog, a passer-by, a car), or a snowball
// landing among them, sends the whole flock up with a clatter of wings: it
// wheels round over the roofs a while and glides back down once the coast is
// clear. Crumble some bread nearby and they come for it instead: they flutter
// over to the crumbs and feed round your feet, flighty only if you tread on
// them, and go home once it is all gone. Their own seeded stream, no
// colliders; every bird part is one instanced mesh, so the lot costs four
// draw calls (and one more for the crumbs).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { damp, Rng, TAU } from "../util.js";

/** Where the flocks feed: centre and radius (m). */
const FLOCKS = [
  { x: 12, z: -2.6, r: 2.4, n: 8 },
  { x: -15.5, z: -4.5, r: 3.0, n: 9 },
];
const WALK = 0.35; // m/s pottering about
const FLY = 7.5; // m/s wheeling round
const SCARE = { player: 4.5, dog: 4, person: 1.8, car: 4.5, snowball: 6 };
const AIR_MIN = 9; // s aloft at least
const CLEAR = 10; // m: nobody this near the feeding spot before landing
export const FEED_REACH = 22; // m: flocks living this near come for the crumbs
const PILE_R = 0.75; // m: they feed round the crumbs this close
const PILES = 4; // crumb piles on the ground at once
const SPECKS = 30; // crumbs per handful
const EAT = 0.008; // of a handful, per bird per second of pecking

const _m = new THREE.Matrix4();
const _p = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function tint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Body + tail (origin between the feet), head + neck + beak, one wing. */
function pigeonGeometry() {
  const body = new THREE.SphereGeometry(0.1, 10, 7);
  body.scale(0.95, 0.85, 1.55);
  body.translate(0, 0.13, -0.01);
  const breast = new THREE.SphereGeometry(0.075, 8, 6);
  breast.translate(0, 0.14, 0.08);
  const tail = new THREE.BoxGeometry(0.1, 0.02, 0.16);
  tail.rotateX(-0.25);
  tail.translate(0, 0.13, -0.19);
  // the folded wings with their two dark bars, along the back
  const folded = [];
  for (const side of [-1, 1]) {
    const w = new THREE.SphereGeometry(0.06, 8, 5);
    w.scale(0.7, 0.55, 2.0);
    w.translate(side * 0.055, 0.17, -0.05);
    folded.push(tint(w, 0x8b93a0));
    for (const bz of [-0.06, -0.1]) {
      const bar = new THREE.BoxGeometry(0.012, 0.02, 0.022);
      bar.translate(side * 0.093, 0.172, bz);
      folded.push(tint(bar, 0x2e3138));
    }
  }
  const legs = new THREE.BoxGeometry(0.06, 0.07, 0.02);
  legs.translate(0, 0.035, 0.01);
  const bodyGeo = mergeGeometries([
    tint(body, 0x7f8794),
    tint(breast, 0x6f7584),
    tint(tail, 0x3f444e),
    tint(legs, 0xa4544a),
    ...folded,
  ]);

  // the head pivots at the base of the neck
  const neck = new THREE.CylinderGeometry(0.035, 0.05, 0.08, 7);
  neck.translate(0, 0.03, 0.01);
  const head = new THREE.SphereGeometry(0.042, 8, 6);
  head.translate(0, 0.08, 0.03);
  const beak = new THREE.ConeGeometry(0.012, 0.04, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.075, 0.08);
  const headGeo = mergeGeometries([
    tint(neck, 0x4e6a68),
    tint(head, 0x535a68),
    tint(beak, 0x2a2a2c),
  ]);

  // a wing hinged at the shoulder, reaching out along +x or -x
  const wingGeo = (side) => {
    const wing = new THREE.BoxGeometry(0.26, 0.012, 0.13);
    wing.translate(side * 0.13, 0, -0.02);
    const tip = new THREE.BoxGeometry(0.06, 0.013, 0.11);
    tip.translate(side * 0.21, 0.001, -0.03);
    return mergeGeometries([tint(wing, 0x8a929e), tint(tip, 0x30343c)]);
  };
  return { bodyGeo, headGeo, wingR: wingGeo(1), wingL: wingGeo(-1) };
}

class Pigeons {
  constructor(world) {
    this.world = world;
    this.rng = new Rng(1961);
    this.t = 0;
    /** Wing clatters and coos to be heard (main.js plays them). */
    this.voice = [];
    /** Crumbs on the ground: { x, z, left (0..1), specks }. */
    this.piles = [];
    this.flocks = FLOCKS.map((f) => ({
      ...f,
      home: { x: f.x, z: f.z, r: f.r },
      pile: null,
      state: "ground",
      timer: 0,
      ang: 0,
      alt: 9,
      R: 9,
      dir: 1,
      birds: [],
    }));
    const count = this.flocks.reduce((s, f) => s + f.n, 0);

    const { bodyGeo, headGeo, wingR, wingL } = pigeonGeometry();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
    });
    const make = (geo, n, name) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.name = name;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };
    this.group = new THREE.Group();
    this.group.name = "pigeons";
    // they move: never baked into the static batches
    this.group.userData.dynamic = true;
    this.bodies = make(bodyGeo, count, "pigeon-body");
    this.heads = make(headGeo, count, "pigeon-head");
    this.wingsL = make(wingL, count, "pigeon-wing");
    this.wingsR = make(wingR, count, "pigeon-wing");
    this.group.add(this.bodies, this.heads, this.wingsL, this.wingsR);
    // the crumbs: pale specks of bread on the snow
    this.crumbs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.03, 0.014, 0.024),
      new THREE.MeshStandardMaterial({ color: 0xd8b57a, roughness: 0.9 }),
      PILES * SPECKS,
    );
    this.crumbs.name = "bread-crumbs";
    this.crumbs.frustumCulled = false;
    this.crumbs.count = 0;
    this.crumbs.raycast = () => {};
    this.crumbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.crumbs);

    let i = 0;
    for (const f of this.flocks) {
      for (let k = 0; k < f.n; k++) {
        f.birds.push({
          i: i++,
          pos: new THREE.Vector3(f.x, 0, f.z),
          vel: new THREE.Vector3(),
          yaw: this.rng.float(0, TAU),
          pitch: 0,
          bank: 0,
          mode: "stand",
          timer: this.rng.float(0, 2),
          target: null,
          peck: 0,
          step: this.rng.float(0, TAU),
          flap: 0,
          spread: 0,
          delay: 0,
          slot: this.rng.float(0, TAU),
          dr: this.rng.float(-2.5, 2.5),
          dy: this.rng.float(-1.2, 1.2),
          scale: this.rng.float(0.9, 1.08),
          landed: true,
        });
      }
    }
    this.placed = false;
  }

  /** A free spot to stand on near the flock's feeding place, a little apart from the others. */
  spot(f, self = null) {
    const crowded = (x, z) =>
      f.birds.some(
        (o) =>
          o !== self &&
          (Math.hypot(o.pos.x - x, o.pos.z - z) < 0.3 ||
            (o.target && Math.hypot(o.target.x - x, o.target.z - z) < 0.3)),
      );
    for (let k = 0; k < 12; k++) {
      const a = this.rng.float(0, TAU);
      const r = Math.sqrt(this.rng.next()) * f.r;
      const x = f.x + Math.cos(a) * r;
      const z = f.z + Math.sin(a) * r;
      if (!this.world.collides(x, z, 0.12) && (k > 8 || !crowded(x, z)))
        return { x, z };
    }
    // nowhere better: stay put
    return self && !this.world.collides(self.pos.x, self.pos.z, 0.12)
      ? { x: self.pos.x, z: self.pos.z }
      : { x: f.x, z: f.z };
  }

  ground(x, z) {
    return this.world.heightAt ? this.world.heightAt(x, z) : 0;
  }

  /** Something startling at (x, z): flocks within `r` take off. */
  scare(x, z, r = SCARE.snowball) {
    for (const f of this.flocks) {
      if (f.state === "air") {
        f.timer = Math.max(f.timer, 4);
        continue;
      }
      const near = f.birds.some(
        (b) => Math.hypot(b.pos.x - x, b.pos.z - z) < r,
      );
      if (near) this.takeOff(f, x, z);
    }
  }

  takeOff(f, x, z) {
    f.state = "air";
    f.timer = AIR_MIN + this.rng.float(0, 6);
    f.ang = Math.atan2(f.z - z, f.x - x);
    f.dir = this.rng.sign();
    f.R = this.rng.float(8, 13);
    f.alt = this.rng.float(8, 12);
    for (const b of f.birds) {
      b.delay = this.rng.float(0, 0.35);
      b.landed = false;
      b.mode = "fly";
      // away from the fright and up
      const a =
        Math.atan2(b.pos.z - z, b.pos.x - x) + this.rng.float(-0.6, 0.6);
      b.vel.set(
        Math.cos(a) * 2.5,
        3.2 + this.rng.float(0, 1.2),
        Math.sin(a) * 2.5,
      );
    }
    this.voice.push({ kind: "flutter", x: f.x, z: f.z, n: f.birds.length });
  }

  /** A handful of crumbs scattered round (x, z): the flocks near enough come for them. */
  feed(x, z) {
    const specks = [];
    for (let k = 0; k < SPECKS; k++) {
      const a = this.rng.float(0, TAU);
      const r = Math.sqrt(this.rng.next()) * 0.55;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      specks.push({
        x: sx,
        y: this.ground(sx, sz) + 0.006,
        z: sz,
        yaw: this.rng.float(0, TAU),
        s: this.rng.float(0.6, 1.4),
      });
    }
    const pile = { x, z, left: 1, specks };
    this.piles.push(pile);
    if (this.piles.length > PILES) this.piles.shift();
    return pile;
  }

  /** The crumb pile this flock should be feeding at, if any. */
  pileFor(f) {
    let best = null;
    let bestD = FEED_REACH;
    for (const p of this.piles) {
      const d = Math.hypot(p.x - f.home.x, p.z - f.home.z);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  /** A short flight from where the birds stand to the flock's (new) feeding place. */
  hop(f) {
    f.state = "landing";
    // should something put them off on the way, they wheel round from here
    f.ang = this.rng.float(0, TAU);
    f.dir = this.rng.sign();
    f.R = this.rng.float(8, 13);
    f.alt = this.rng.float(8, 12);
    for (const b of f.birds) {
      b.delay = this.rng.float(0, 0.5);
      b.landed = false;
      b.mode = "fly";
      b.target = this.spot(f, b);
      b.vel.set(0, 2.4 + this.rng.float(0, 0.8), 0);
    }
    this.voice.push({ kind: "flutter", x: f.x, z: f.z, n: f.birds.length });
  }

  /** Follows the crumbs: off to a new pile, home again once it is eaten. */
  forage(f) {
    const pile = this.pileFor(f);
    if (pile === f.pile) return;
    f.pile = pile;
    const at = pile ?? f.home;
    f.x = at.x;
    f.z = at.z;
    f.r = pile ? PILE_R : f.home.r;
    if (f.state === "ground") {
      // too far to walk: they flutter over
      const far = f.birds.some(
        (b) => Math.hypot(b.pos.x - f.x, b.pos.z - f.z) > f.r + 1.5,
      );
      if (far) this.hop(f);
    } else {
      if (f.state === "landing")
        for (const b of f.birds) b.target = this.spot(f, b);
      else if (pile) f.timer = Math.min(f.timer, 1.5);
    }
  }

  /** Is anything alarming within reach of the flock? Returns its position. */
  threat(f, player, extra = 0) {
    const hit = (x, z, r) => Math.hypot(x - f.x, z - f.z) < f.r + r;
    // the player and the dog are watched from further off before landing;
    // at the crumbs only a car or treading right on them puts the birds up
    const fed = f.pile ? 0.6 - f.r : null;
    if (player && hit(player.x, player.z, fed ?? SCARE.player + extra))
      return player;
    const dog = this.world.dog;
    if (dog && hit(dog.position.x, dog.position.z, fed ?? SCARE.dog + extra))
      return dog.position;
    for (const c of this.world.trafficCars ?? [])
      if (Math.abs(c.speed) > 1 && hit(c.x, c.z, SCARE.car)) return c;
    for (const c of this.world.cars ?? [])
      if (c.driven && Math.abs(c.speed ?? 0) > 1 && hit(c.x, c.z, SCARE.car))
        return c;
    for (const p of this.world.people?.list ?? []) {
      if (!p.root.visible || p.idle || p.onFurniture) continue;
      if (hit(p.position.x, p.position.z, fed ?? SCARE.person))
        return p.position;
    }
    return null;
  }

  update(dt, { player = null } = {}) {
    this.t += dt;
    if (!this.placed) {
      // the trees go in after the props: spread out once every collider is in
      this.placed = true;
      for (const f of this.flocks) {
        for (const b of f.birds) {
          const s = this.spot(f, b);
          b.pos.set(s.x, this.ground(s.x, s.z), s.z);
        }
      }
    }
    // eaten up: the crumbs are gone
    this.piles = this.piles.filter((p) => p.left > 0);
    for (const f of this.flocks) {
      this.forage(f);
      if (f.state === "ground") {
        const t = this.threat(f, player);
        if (t) this.takeOff(f, t.x, t.z);
        else this.potter(f, dt, player);
      } else {
        this.wheel(f, dt, player);
      }
    }
    this.draw();
  }

  /** On the ground: little walks, pecking, looking about. */
  potter(f, dt, player) {
    for (const b of f.birds) {
      b.timer -= dt;
      if (b.timer <= 0) {
        const r = this.rng.next();
        if (r < 0.45) {
          b.mode = "walk";
          b.target = this.spot(f, b);
          b.timer = 6;
        } else if (r < 0.85) {
          b.mode = "peck";
          b.timer = this.rng.float(1, 3.5);
        } else {
          b.mode = "stand";
          b.timer = this.rng.float(1, 3);
        }
      }
      let moving = false;
      if (b.mode === "walk" && b.target) {
        const dx = b.target.x - b.pos.x;
        const dz = b.target.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          b.mode = "peck";
          b.timer = this.rng.float(1, 3);
        } else {
          const want = Math.atan2(dx, dz);
          let dy = want - b.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          b.yaw += dy * Math.min(1, dt * 8);
          const s = Math.min(d, WALK * dt);
          const nx = b.pos.x + Math.sin(b.yaw) * s;
          const nz = b.pos.z + Math.cos(b.yaw) * s;
          if (this.world.collides(nx, nz, 0.1)) {
            // a post or a bench in the way: peck here instead
            b.mode = "peck";
            b.timer = this.rng.float(1, 2.5);
          } else {
            b.pos.set(nx, this.ground(nx, nz), nz);
            moving = true;
          }
        }
      }
      // pecking at the crumbs eats them up
      if (
        f.pile &&
        b.mode === "peck" &&
        Math.hypot(b.pos.x - f.pile.x, b.pos.z - f.pile.z) < f.r + 0.3
      )
        f.pile.left -= EAT * dt;
      b.step += dt * (moving ? 14 : 0);
      b.peck = damp(b.peck, b.mode === "peck" ? 1 : 0, 6, dt);
      b.spread = damp(b.spread, 0, 8, dt);
      b.pitch = damp(b.pitch, 0, 6, dt);
      b.bank = damp(b.bank, 0, 6, dt);
      b.moving = moving;
    }
    // a soft coo now and then, for whoever is near enough to hear
    if (player && this.rng.chance(dt * 0.12))
      this.voice.push({ kind: "coo", x: f.x, z: f.z });
  }

  /** Aloft: up, round in a wide circle, and back down when it is quiet. */
  wheel(f, dt, player) {
    f.timer -= dt;
    f.ang += (f.dir * FLY * dt) / f.R;
    const landing = f.state === "landing";
    if (!landing && f.timer <= 0 && !this.threat(f, player, CLEAR)) {
      f.state = "landing";
      for (const b of f.birds) b.target = this.spot(f, b);
    }
    if (landing && this.threat(f, player, 1)) {
      // still not safe: round again
      f.state = "air";
      f.timer = 4;
    }
    let down = 0;
    for (const b of f.birds) {
      if (b.landed) {
        down++;
        continue;
      }
      if (b.delay > 0) {
        b.delay -= dt;
        b.flap += dt * 30;
        continue;
      }
      let tx;
      let ty;
      let tz;
      let speed;
      if (landing) {
        tx = b.target.x;
        tz = b.target.z;
        ty = this.ground(tx, tz);
        const d = _v.set(tx - b.pos.x, ty - b.pos.y, tz - b.pos.z).length();
        speed = Math.min(FLY, 0.6 + d * 0.9);
        if (d < 0.08) {
          b.landed = true;
          b.pos.set(tx, ty, tz);
          b.vel.set(0, 0, 0);
          b.mode = "stand";
          b.timer = this.rng.float(0.5, 2);
          down++;
          continue;
        }
      } else {
        const a = f.ang + b.slot * 0.35 * f.dir;
        const R = f.R + b.dr;
        tx = f.x + Math.cos(a) * R;
        tz = f.z + Math.sin(a) * R;
        ty = f.alt + b.dy + Math.sin(this.t * 0.6 + b.slot) * 0.8;
        speed = FLY;
      }
      _v.set(tx - b.pos.x, ty - b.pos.y, tz - b.pos.z);
      const d = _v.length();
      if (d > 1e-4)
        _v.multiplyScalar(Math.min(speed, d / Math.max(dt, 1e-3)) / d);
      const k = 1 - Math.exp(-(landing ? 3 : 1.6) * dt);
      b.vel.lerp(_v, k);
      b.pos.addScaledVector(b.vel, dt);
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0.2) {
        const want = Math.atan2(b.vel.x, b.vel.z);
        let dy = want - b.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.yaw += dy * Math.min(1, dt * 6);
        b.bank = damp(b.bank, -dy * 1.5, 4, dt);
      }
      b.pitch = damp(
        b.pitch,
        -Math.atan2(b.vel.y, Math.max(hs, 0.5)) * 0.6,
        5,
        dt,
      );
      // flapping climbs, a glide on the way down
      const gliding = b.vel.y < -0.4 && !(landing && d < 1.2);
      b.flap += dt * (gliding ? 0 : landing && d < 1.2 ? 34 : 24);
      b.spread = damp(b.spread, 1, 10, dt);
      b.gliding = gliding;
      b.peck = damp(b.peck, 0, 8, dt);
    }
    if (landing && down === f.birds.length) {
      f.state = "ground";
      for (const b of f.birds) b.timer = this.rng.float(0.5, 2.5);
    }
  }

  draw() {
    for (const f of this.flocks) {
      for (const b of f.birds) {
        // the body
        const bob = b.moving ? Math.abs(Math.sin(b.step)) * 0.012 : 0;
        _e.set(b.pitch, b.yaw, b.bank, "YXZ");
        _q.setFromEuler(_e);
        _s.setScalar(b.scale);
        _m.compose(_v.set(b.pos.x, b.pos.y + bob, b.pos.z), _q, _s);
        this.bodies.setMatrixAt(b.i, _m);
        // the head nods forward with each step, dips to peck
        const nod = b.moving ? Math.sin(b.step) * 0.025 : 0;
        const peck =
          b.peck *
          (0.55 + 0.45 * Math.max(0, Math.sin(this.t * 9 + b.slot * 3)));
        _p.compose(
          _v.set(0, 0.17 - peck * 0.06, 0.1 + nod + peck * 0.03),
          _q.setFromEuler(_e.set(peck * 1.3, 0, 0)),
          _s.setScalar(1),
        );
        this.heads.setMatrixAt(b.i, _p.premultiply(_m));
        // the wings: folded along the back on the ground, beating in the air
        const beat = b.gliding ? 0.15 : Math.sin(b.flap) * 0.9;
        for (const [mesh, side] of [
          [this.wingsR, 1],
          [this.wingsL, -1],
        ]) {
          const fold = 1 - b.spread;
          // folded: swung back along the flank, the plate draped down the side
          _e.set(
            fold * 0.9,
            side * fold * 1.55,
            -side * beat * b.spread,
            "YXZ",
          );
          _q.setFromEuler(_e);
          // they grow out of the body as they open (folded, the body has them)
          _s.setScalar(Math.max(1e-3, Math.min(1, b.spread * 1.6)));
          _p.compose(_v.set(side * 0.05, 0.19, 0.05), _q, _s);
          mesh.setMatrixAt(b.i, _p.premultiply(_m));
        }
      }
    }
    // the crumbs thin out as they are eaten
    let n = 0;
    for (const p of this.piles) {
      const shown = Math.ceil(p.left * SPECKS);
      for (let k = 0; k < shown; k++) {
        const c = p.specks[k];
        _q.setFromEuler(_e.set(0, c.yaw, 0));
        _m.compose(_v.set(c.x, c.y, c.z), _q, _s.setScalar(c.s));
        this.crumbs.setMatrixAt(n++, _m);
      }
    }
    this.crumbs.count = n;
    for (const m of [
      this.bodies,
      this.heads,
      this.wingsL,
      this.wingsR,
      this.crumbs,
    ])
      m.instanceMatrix.needsUpdate = true;
  }
}

export function buildPigeons(ctx) {
  const pigeons = new Pigeons(ctx.world);
  ctx.world.group.add(pigeons.group);
  ctx.world.pigeons = pigeons;
}
