// Pebbles on the frozen pond: at the edge, facing the ice, E tosses one out.
// It skips and slides a long way over the sheet, and new ice sings as it
// goes, the falling "pew" of a stone on a frozen lake. The pebbles stay
// where they stop (the last dozen). Live only: its own Rng, no colliders.
import * as THREE from 'three';
import { Rng } from './util.js';

const ICE_Y = 0.05; // the ice sheet's top
const SIZE = 0.05; // a pebble's radius
const SPEED = 7; // m/s out of the hand
const LIFT = 2; // m/s up
const GRAVITY = 9.81;
const HOP = 0.32; // vertical speed kept on a skip
const SKIP_MIN = 0.7; // m/s down: any slower and it settles to slide
const FRICTION = 0.9; // per second, sliding
const SHORE = 2.8; // how far back from the ice you can still throw
const MAX = 12;

export class Pebbles {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.pond = world.pond;
    this.rng = new Rng(6122);
    this.list = [];
    this.thrown = 0;
    this.material = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.65 });
    this.geometry = new THREE.IcosahedronGeometry(SIZE, 0);
    this.geometry.scale(1, 0.55, 1);
    this.group = new THREE.Group();
    this.group.name = 'pebbles';
    world.group.add(this.group);
  }

  /** On the shore, facing the ice: how far from its edge (Infinity if not). */
  distanceTo(x, z, forward) {
    const p = this.pond;
    if (!p) return Infinity;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz);
    const edge = d - p.r;
    if (edge < -0.3 || edge > SHORE) return Infinity;
    const len = Math.hypot(forward.x, forward.z) || 1;
    if ((forward.x * dx + forward.z * dz) / (len * d) < 0.5) return Infinity;
    return Math.max(0, edge);
  }

  /** Out of the hand at `from`, along `forward`. */
  toss(from, forward) {
    let p = this.list.length >= MAX ? this.list.shift() : null;
    if (!p) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.castShadow = true;
      this.group.add(mesh);
      p = { mesh };
    }
    const len = Math.hypot(forward.x, forward.z) || 1;
    const speed = SPEED * this.rng.float(0.9, 1.1);
    p.pos = new THREE.Vector3(from.x, from.y, from.z);
    p.vel = new THREE.Vector3((forward.x / len) * speed, LIFT, (forward.z / len) * speed);
    p.from = p.pos.clone();
    p.flying = true;
    p.moving = true;
    p.skips = 0;
    p.lost = false;
    p.spin = this.rng.float(8, 14);
    p.mesh.position.copy(p.pos);
    p.mesh.visible = true;
    this.list.push(p);
    this.thrown++;
    return p;
  }

  /** On the ice? */
  #onIce(x, z) {
    const p = this.pond;
    return Math.hypot(x - p.x, z - p.z) < p.r - SIZE;
  }

  update(dt) {
    dt = Math.max(0, dt);
    for (const p of this.list) {
      if (!p.moving) continue;
      const n = Math.max(1, Math.ceil(dt / 0.01));
      const h = dt / n;
      for (let i = 0; i < n && p.moving; i++) this.#step(p, h);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y += p.spin * dt;
    }
  }

  #step(p, h) {
    if (p.flying) {
      p.vel.y -= GRAVITY * h;
      p.pos.addScaledVector(p.vel, h);
      const floor = this.#onIce(p.pos.x, p.pos.z) ? ICE_Y : this.world.heightAt(p.pos.x, p.pos.z);
      if (p.pos.y - SIZE * 0.55 > floor) return;
      p.pos.y = floor + SIZE * 0.55;
      if (!this.#onIce(p.pos.x, p.pos.z)) {
        // into the snow on the bank: it stays there
        p.moving = false;
        p.lost = true;
        p.mesh.visible = false;
        return;
      }
      // a skip: the ice sings, and it hops on lower, or settles to slide
      const down = -p.vel.y;
      const speed = Math.hypot(p.vel.x, p.vel.z);
      this.sound?.iceSing?.(Math.min(1, 0.35 + speed / SPEED) * (p.skips === 0 ? 1 : 0.7 ** p.skips));
      p.skips++;
      if (down > SKIP_MIN && p.skips < 5) {
        p.vel.y = down * HOP;
        p.vel.x *= 0.85;
        p.vel.z *= 0.85;
      } else {
        p.vel.y = 0;
        p.flying = false;
      }
      return;
    }
    // sliding: slowing, ringing off the frozen bank at the edge
    p.pos.x += p.vel.x * h;
    p.pos.z += p.vel.z * h;
    const decay = Math.exp(-FRICTION * h);
    p.vel.x *= decay;
    p.vel.z *= decay;
    const pond = this.pond;
    const dx = p.pos.x - pond.x;
    const dz = p.pos.z - pond.z;
    const d = Math.hypot(dx, dz);
    if (d > pond.r - SIZE) {
      // the snow bank: it stops dead against it
      p.pos.x = pond.x + (dx / d) * (pond.r - SIZE);
      p.pos.z = pond.z + (dz / d) * (pond.r - SIZE);
      p.vel.set(0, 0, 0);
    }
    if (Math.hypot(p.vel.x, p.vel.z) < 0.05) {
      p.vel.set(0, 0, 0);
      p.moving = false;
    }
  }

  get prompt() {
    return 'E — toss a pebble onto the ice';
  }
}
