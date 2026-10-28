// Chained yard dogs (цепные псы) in the private sector: each lies by its
// kennel just inside the gate. When someone comes up the lane it jumps up,
// runs to the end of its chain and barks over the pickets until they have
// gone on; a car crawling by gets the same. Then it trots back and lies
// down again. Like the stray, it is skinned and has no collider of its own;
// the yard's fences and buildings keep it in.
import * as THREE from 'three';
import { clamp, damp, Rng } from '../util.js';
import { BONES, PIVOTS, dogGeometry } from './dog.js';
import { EAST } from './east.js';

const CHAIN = 4.2; // m from the stake
const ALERT = 13; // m: notices you
const CALM = 17; // m: you have gone
const RUN = 4.4;
const TROT = 1.6;
const RADIUS = 0.22;
// tints over the stray's tan coat: as it is, near black, grey, pale
const COATS = [0xffffff, 0x4a4542, 0x9c9894, 0xf0e6dc];

class YardDog {
  constructor(world, stake, home, coat, seed) {
    this.world = world;
    this.rng = new Rng(seed);
    this.stake = stake;
    this.home = home; // where it lies, facing the street
    this.position = new THREE.Vector3(home.x, 0, home.z);
    this.yaw = home.yaw;
    this.speed = 0;
    this.phase = 0;
    this.state = 'rest';
    this.calmT = 0;
    this.barkT = 0;
    this.nextBark = 0;
    this.lie = 1;
    this.t = this.rng.float(0, 10);
    /** Set when it barks (main.js turns it into a sound). */
    this.voice = null;

    this.root = new THREE.Group();
    this.root.name = 'yard-dog';
    this.root.userData.dynamic = true;
    const mesh = new THREE.SkinnedMesh(dogGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, color: coat }));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.bones = {};
    for (const name of BONES) this.bones[name] = new THREE.Bone();
    const body = this.bones.body;
    body.position.set(...PIVOTS.body);
    mesh.add(body);
    for (const name of BONES.slice(1)) {
      const p = PIVOTS[name];
      this.bones[name].position.set(p[0] - PIVOTS.body[0], p[1] - PIVOTS.body[1], p[2] - PIVOTS.body[2]);
      body.add(this.bones[name]);
    }
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(BONES.map((n) => this.bones[n])));
    this.root.add(mesh);

    // the chain: a sagging line from the stake to the collar
    this.chainPos = new Float32Array(12 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.chainPos, 3));
    this.chain = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a3b3d }));
    this.chain.frustumCulled = false;
    this.chain.userData.dynamic = true;
    this.animate(0);
  }

  bark(times) {
    this.voice = { kind: 'bark', times };
    this.barkT = 0.5;
  }

  /** The spot on its chain's reach nearest to (x, z). */
  reach(x, z) {
    const dx = x - this.stake.x;
    const dz = z - this.stake.z;
    const d = Math.hypot(dx, dz);
    const k = d > CHAIN - 0.3 ? (CHAIN - 0.3) / d : 1;
    return { x: this.stake.x + dx * k, z: this.stake.z + dz * k };
  }

  moveToward(tx, tz, speed, dt) {
    const p = this.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    this.speed = damp(this.speed, dist > 0.15 ? speed : 0, 6, dt);
    if (dist < 0.15) return;
    const want = Math.atan2(dx, dz);
    const step = Math.min(dist, this.speed * dt);
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
      const a = want + off;
      const nx = p.x + Math.sin(a) * step;
      const nz = p.z + Math.cos(a) * step;
      if (Math.hypot(nx - this.stake.x, nz - this.stake.z) > CHAIN) continue;
      if (this.world.collides(nx, nz, RADIUS)) continue;
      p.x = nx;
      p.z = nz;
      this.turnTo(a, dt);
      return;
    }
    this.speed = 0;
  }

  turnTo(yaw, dt, rate = 8) {
    const d = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.yaw += d * Math.min(1, dt * rate);
  }

  /** `who`: whoever is about on foot or in a car ({x, z}), nearest first. */
  update(dt, who) {
    const p = this.position;
    let near = null;
    let nd = Infinity;
    for (const w of who) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < nd) [near, nd] = [w, d];
    }
    this.barkT = Math.max(0, this.barkT - dt);
    this.nextBark -= dt;
    if (nd < ALERT) {
      if (this.state === 'rest') {
        this.state = 'alert';
        this.nextBark = this.rng.float(0.1, 0.5);
      }
      this.calmT = 0;
    } else if (this.state === 'alert' && (nd > CALM || !near)) {
      this.calmT += dt;
      if (this.calmT > 3) this.state = 'back';
    }

    if (this.state === 'alert' && near) {
      const spot = this.reach(near.x, near.z);
      this.moveToward(spot.x, spot.z, RUN, dt);
      if (this.speed < 0.3) this.turnTo(Math.atan2(near.x - p.x, near.z - p.z), dt, 5);
      if (this.nextBark <= 0) {
        this.bark(this.rng.int(1, 3));
        this.nextBark = this.rng.float(0.9, 1.8);
      }
    } else if (this.state === 'back') {
      this.moveToward(this.home.x, this.home.z, TROT, dt);
      if (Math.hypot(this.home.x - p.x, this.home.z - p.z) < 0.2) {
        this.turnTo(this.home.yaw, dt, 3);
        if (Math.abs(Math.atan2(Math.sin(this.home.yaw - this.yaw), Math.cos(this.home.yaw - this.yaw))) < 0.2) this.state = 'rest';
      }
    } else {
      this.speed = damp(this.speed, 0, 6, dt);
    }
    this.animate(dt);
  }

  animate(dt) {
    this.t += dt;
    const b = this.bones;
    const p = this.position;
    this.lie = damp(this.lie, this.state === 'rest' ? 1 : 0, 3, dt);
    const L = this.lie;
    this.phase += dt * 2.0 * (this.speed / 0.55);
    const swing = clamp(this.speed / 2.6, 0, 1) * 0.7;
    const s = Math.sin(this.phase);
    const gallop = this.speed > 3;
    // braced at the end of the chain, barking: leans in on its forelegs
    const brace = this.state === 'alert' && this.speed < 0.3 ? 1 : 0;
    b.legFL.rotation.x = s * swing - 1.4 * L + 0.25 * brace;
    b.legFR.rotation.x = -s * swing - 1.4 * L + 0.25 * brace;
    b.legBL.rotation.x = (gallop ? s : -s) * swing - 1.25 * L - 0.15 * brace;
    b.legBR.rotation.x = (gallop ? -s : s) * swing - 1.25 * L - 0.15 * brace;
    b.body.rotation.x = 0.08 * brace + (gallop ? Math.cos(this.phase) * 0.06 : 0);
    b.body.position.y = PIVOTS.body[1] - 0.29 * L + Math.abs(Math.cos(this.phase)) * 0.02 * swing;
    // the head: down on the paws at rest (lifting now and then), up to bark
    const look = L * (Math.sin(this.t * 0.37) > 0.8 ? -0.2 : 0.35);
    b.head.rotation.x = look - (this.barkT > 0 ? 0.35 + Math.sin(this.barkT * 30) * 0.08 : 0);
    b.head.rotation.y = 0;
    b.tail.rotation.y = Math.sin(this.t * 7) * (0.1 + 0.25 * brace);
    b.tail.rotation.x = 0.3 * L - 0.25 * brace;
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = this.yaw;

    // the chain sags from the stake to the collar
    const cx = p.x + Math.sin(this.yaw) * 0.3;
    const cz = p.z + Math.cos(this.yaw) * 0.3;
    const cy = 0.6 - 0.3 * L;
    const span = Math.hypot(cx - this.stake.x, cz - this.stake.z);
    const sag = Math.max(0.02, (CHAIN - span) * 0.3);
    for (let k = 0; k < 12; k++) {
      const t = k / 11;
      this.chainPos[k * 3] = this.stake.x + (cx - this.stake.x) * t;
      this.chainPos[k * 3 + 1] = Math.max(0.02, 0.15 + (cy - 0.15) * t - sag * 4 * t * (1 - t));
      this.chainPos[k * 3 + 2] = this.stake.z + (cz - this.stake.z) * t;
    }
    this.chain.geometry.attributes.position.needsUpdate = true;
  }
}

/** Kennels and dogs in four of the sector's yards. */
export function buildYardDogs(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const group = world.eastDetails;
  const rng = new Rng(41741);
  // (in yards with no birch in the front garden: it would stand in the chain's way)
  const plots = EAST.plots.filter((p) => !p.tree);
  const chosen = [];
  while (chosen.length < 4) chosen.push(...plots.splice(rng.int(0, plots.length - 1), 1));
  const v = new THREE.Vector3();
  const local = (p, x, z) => {
    v.set(x, 0, z).applyMatrix4(p.matrix);
    return { x: v.x, z: v.z };
  };
  world.yardDogs = [];
  chosen.forEach((p, k) => {
    const kx = p.gx - p.m * 2.0;
    // the kennel, its door to the street, and the stake a step in front
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.72, 1.0), M.wood);
    walls.position.y = 0.36;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.46), new THREE.MeshBasicMaterial({ color: 0x0d0b09 }));
    door.position.set(0, 0.3, -0.505);
    door.rotation.y = Math.PI;
    g.add(walls, door);
    for (const s of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 1.16), M.woodDark);
      roof.position.set(s * 0.25, 0.86, 0);
      roof.rotation.z = -s * 0.62;
      const snow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 1.1), M.snow);
      snow.position.set(s * 0.24, 0.91, 0);
      snow.rotation.z = -s * 0.62;
      g.add(roof, ctx.seasonable('winter', snow));
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.07, 10), M.metal);
    bowl.position.set(0.62, 0.035, -0.75);
    g.add(bowl);
    g.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
    const at = local(p, kx, 5.75);
    g.position.set(at.x, 0, at.z);
    g.rotation.y = p.theta;
    group.add(g);
    const c = local(p, kx, 5.75);
    ctx.addLateColliderRect(c.x - 0.55, c.x + 0.55, c.z - 0.55, c.z + 0.55);
    const stake = local(p, kx, 4.75);
    const rest = local(p, kx, 4.55);
    // facing the street: the plot's local -z
    const dog = new YardDog(world, stake, { ...rest, yaw: p.theta + Math.PI }, COATS[k % COATS.length], 41750 + k);
    group.add(dog.root, dog.chain);
    world.yardDogs.push(dog);
  });
}
