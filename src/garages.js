// Icicles (сосульки) along the front edges of the garage roofs, in winter,
// low enough to reach (the blocks' own hang out of reach, under the eaves):
// a snowball through one knocks it down, it drops and shatters on the
// ground with a tinkle of ice. A knocked one grows back slowly. One
// instanced mesh for the icicles and one for the shards. Live only: its
// own Rng, nothing on the seeded stream, no colliders.
import * as THREE from 'three';
import { GARAGES } from './world/south.js';
import { Rng, clamp } from './util.js';

const EDGE = 3.35; // the roof's front edge, out from a row's middle
const UNDER = 2.5; // the roof's underside
const HIT = 0.13; // a ball's radius and an icicle's, near enough
const G = 9.81;
const REGROW = 120; // s before a knocked icicle starts to grow back
const GROW = 30; // s to grow back to full length
const SHARDS = 48;
const SHARD_LIFE = 0.9;
const NOTE = 2.5;

export class GarageIcicles {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.rng = new Rng(9091);
    this.knocked = 0;
    this.note = null;
    this.noteT = 0;
    this.list = [];
    const g = GARAGES;
    const rng = this.rng;
    for (const [rowZ, facing] of [
      [g.north, -1],
      [g.south, 1],
    ]) {
      for (let i = 0; i < g.count; i++) {
        const gx = g.x0 + (i + 0.5) * g.unit;
        const n = rng.int(3, 7);
        for (let k = 0; k < n; k++) {
          const dx = rng.float(-1.55, 1.55);
          // over the door they are kept short enough to clear it
          const len = Math.abs(dx) < 1.35 ? rng.float(0.12, 0.36) : rng.float(0.15, 0.55);
          this.list.push({
            x: gx + dx,
            z: rowZ + facing * EDGE,
            facing,
            len,
            r: rng.float(0.8, 1.5),
            state: 'hanging', // hanging → falling → gone → (growing) → hanging
            grow: 1,
            y: UNDER,
            vy: 0,
            t: 0,
          });
        }
      }
    }
    this.minX = g.x0 - 1;
    this.maxX = g.x0 + g.count * g.unit + 1;

    this.material = new THREE.MeshStandardMaterial({ color: 0xdbe9f5, roughness: 0.08, transparent: true, opacity: 0.82 });
    // a cone, its top at the origin and its tip a unit below
    const geo = new THREE.ConeGeometry(0.048, 1, 6);
    geo.rotateX(Math.PI);
    geo.translate(0, -0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.list.length);
    this.mesh.name = 'garage-icicles';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    world.group.add(this.mesh);

    this.shards = [];
    this.shardMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.03), this.material, SHARDS);
    this.shardMesh.name = 'icicle-shards';
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    world.group.add(this.shardMesh);
    for (let i = 0; i < SHARDS; i++) this.shards.push({ age: SHARD_LIFE, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0 });
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SHARDS; i++) this.shardMesh.setMatrixAt(i, hidden);
    this.nextShard = 0;

    this.dummy = new THREE.Object3D();
    this.wasWinter = null;
    for (let i = 0; i < this.list.length; i++) this.#place(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get usable() {
    return this.world.season === 'winter';
  }

  /** Still up there, to be knocked (the tests count these). */
  get hanging() {
    return this.list.filter((c) => c.state === 'hanging').length;
  }

  #place(i) {
    const c = this.list[i];
    const d = this.dummy;
    const shown = c.state !== 'gone' && c.grow > 0.01;
    d.position.set(c.x, c.y, c.z);
    d.rotation.set(0, 0, 0);
    d.scale.set(shown ? c.r : 0, shown ? c.len * c.grow : 0, shown ? c.r : 0);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
  }

  /** A ball between `a` and `b`: knocks the icicles on its way, how many. */
  sweep(a, b) {
    if (!this.usable) return 0;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (hi < this.minX || lo > this.maxX || Math.max(a.y, b.y) < UNDER - 0.7 || Math.min(a.y, b.y) > UNDER + 0.1) return 0;
    let n = 0;
    for (const c of this.list) {
      if (c.state !== 'hanging' || c.grow < 0.5) continue;
      if (c.x < lo - HIT || c.x > hi + HIT) continue;
      // the closest the ball's path comes to the icicle, sampled along it
      for (let s = 0; s <= 6; s++) {
        const u = s / 6;
        const x = a.x + (b.x - a.x) * u;
        const y = a.y + (b.y - a.y) * u;
        const z = a.z + (b.z - a.z) * u;
        if (y > c.y + 0.05 || y < c.y - c.len * c.grow - 0.05) continue;
        if (Math.hypot(x - c.x, z - c.z) < HIT) {
          this.#knock(c);
          n++;
          break;
        }
      }
    }
    return n;
  }

  /** A ball splatted on a garage door or the roof's edge right behind one. */
  impact(kind, pos) {
    if (!this.usable || kind !== 'wall' || pos.x < this.minX || pos.x > this.maxX) return 0;
    let n = 0;
    for (const c of this.list) {
      if (c.state !== 'hanging' || c.grow < 0.5) continue;
      if (Math.abs(pos.z - c.z) > 0.5 || Math.abs(pos.x - c.x) > 0.2) continue;
      if (pos.y > c.y + 0.15 || pos.y < c.y - c.len * c.grow - 0.1) continue;
      this.#knock(c);
      n++;
    }
    return n;
  }

  #knock(c) {
    c.state = 'falling';
    c.vy = 0;
    c.t = 0;
    this.knocked++;
  }

  #shatter(c) {
    c.state = 'gone';
    c.t = 0;
    c.y = UNDER;
    const ground = this.world.heightAt(c.x, c.z);
    const pieces = clamp(Math.round(3 + c.len * 10), 3, 8);
    for (let k = 0; k < pieces; k++) {
      const s = this.shards[this.nextShard];
      this.nextShard = (this.nextShard + 1) % SHARDS;
      s.age = 0;
      s.pos.set(c.x, ground + 0.03, c.z);
      const a = this.rng.float(0, Math.PI * 2);
      const v = this.rng.float(0.6, 1.8);
      s.vel.set(Math.cos(a) * v, this.rng.float(0.8, 2.2), Math.sin(a) * v);
      s.spin = this.rng.float(6, 14);
      s.ground = ground;
    }
    this.note = `Icicles knocked down: ${this.knocked}`;
    this.noteT = NOTE;
    this.onShatter?.(c);
  }

  update(dt, balls = []) {
    dt = Math.max(0, dt);
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    const winter = this.usable;
    this.mesh.visible = winter;
    if (winter !== this.wasWinter) {
      // a new winter: all of them hanging again, full length
      if (winter) for (const c of this.list) Object.assign(c, { state: 'hanging', grow: 1, y: UNDER, vy: 0, t: 0 });
      this.wasWinter = winter;
      for (let i = 0; i < this.list.length; i++) this.#place(i);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    if (!winter) {
      this.shardMesh.visible = false;
      return;
    }
    // the balls in flight, along their paths since the last frame
    for (const b of balls) {
      if (!b.alive) {
        b.icicleFrom = null;
        continue;
      }
      if (b.icicleFrom) this.sweep(b.icicleFrom, b.pos);
      (b.icicleFrom ??= new THREE.Vector3()).copy(b.pos);
    }
    let dirty = false;
    this.list.forEach((c, i) => {
      if (c.state === 'falling') {
        c.vy -= G * dt;
        c.y += c.vy * dt;
        if (c.y - c.len * c.grow <= this.world.heightAt(c.x, c.z)) this.#shatter(c);
        this.#place(i);
        dirty = true;
      } else if (c.state === 'gone') {
        c.t += dt;
        if (c.t >= REGROW) {
          c.state = 'hanging';
          c.grow = 0;
        }
      } else if (c.grow < 1) {
        c.grow = Math.min(1, c.grow + dt / GROW);
        this.#place(i);
        dirty = true;
      }
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    // the shards skitter out over the snow and are gone
    let any = false;
    const d = this.dummy;
    this.shards.forEach((s, i) => {
      if (s.age >= SHARD_LIFE) {
        if (s.shown) {
          d.scale.setScalar(0);
          d.updateMatrix();
          this.shardMesh.setMatrixAt(i, d.matrix);
          s.shown = false;
          dirty = true;
        }
        return;
      }
      s.age += dt;
      s.vel.y -= G * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < s.ground + 0.02) {
        s.pos.y = s.ground + 0.02;
        s.vel.set(s.vel.x * 0.4, 0, s.vel.z * 0.4);
      }
      d.position.copy(s.pos);
      d.rotation.set(s.age * s.spin, s.age * s.spin * 0.7, 0);
      d.scale.setScalar(1 - (s.age / SHARD_LIFE) ** 3);
      d.updateMatrix();
      this.shardMesh.setMatrixAt(i, d.matrix);
      s.shown = true;
      any = true;
    });
    this.shardMesh.visible = any;
    if (any || dirty) this.shardMesh.instanceMatrix.needsUpdate = true;
  }
}
