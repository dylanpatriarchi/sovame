// The dvornik's leaf piles, in autumn: heaps raked up under the courtyard's
// birches and poplars. Run through one (or land in it from a jump) and it
// bursts, the leaves thrown up round you to flutter down and lie scattered;
// E at one kicks it the way you face. A minute and a half later the
// dvornik has raked it up again. Live only: its own Rng, no colliders.
import * as THREE from 'three';
import { makeLeafTexture } from './textures.js';
import { Rng, clamp } from './util.js';

const PILES = 7;
const LEAVES = 140; // per pile
const R = 1.05; // a pile's radius
const TOP = 0.5; // and its height
const BURST_SPEED = 3.6; // m/s through it that bursts it
const REGROW = 90; // s until it is raked up again
const RAKE = 3; // s the raking takes
const PALETTE = [0xb2652a, 0xc98a34, 0x8f5a22, 0x9a6a2c, 0xd0a040, 0xa8552a, 0x7d4a1e];
const NOTE = 2.5;

export class LeafPiles {
  constructor({ world }) {
    this.world = world;
    this.rng = new Rng(7310);
    this.piles = LeafPiles.spots(world).map((s) => ({ ...s, state: 'heap', t: 0, rake: 1 }));
    this.bursts = 0;
    this.note = null;
    this.noteT = 0;
    this.onBurst = null; // (pile, strength) => void
    this.group = new THREE.Group();
    this.group.name = 'leaf-piles';
    world.group.add(this.group);

    const n = this.piles.length * LEAVES;
    // each leaf: where it lies in the heap, where it is, how it flies
    this.home = new Float32Array(n * 3);
    this.homeRot = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.rot = new Float32Array(n * 3);
    this.spin = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.flying = new Uint8Array(n);
    const mat = new THREE.MeshStandardMaterial({ map: makeLeafTexture(), alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide });
    this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.2), mat, Math.max(1, n));
    this.leaves.count = n;
    this.leaves.frustumCulled = false;
    this.leaves.receiveShadow = true;
    const color = new THREE.Color();
    this.piles.forEach((p, k) => {
      p.index = k;
      for (let j = 0; j < LEAVES; j++) {
        const i = k * LEAVES + j;
        // over the mound's surface, more of them low down
        const a = this.rng.float(0, Math.PI * 2);
        const u = Math.sqrt(this.rng.next());
        const r = R * u;
        const y = p.y + TOP * Math.sqrt(Math.max(0, 1 - u * u)) * this.rng.float(0.85, 1.05) + 0.03;
        this.home.set([p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r], i * 3);
        // tipped with the slope, flat on top
        this.homeRot.set([-Math.PI / 2 + Math.cos(a) * u * 0.9 + this.rng.float(-0.3, 0.3), this.rng.float(-0.3, 0.3), this.rng.float(0, Math.PI * 2)], i * 3);
        this.size[i] = this.rng.float(0.8, 1.5);
        color.setHex(PALETTE[this.rng.int(0, PALETTE.length - 1)]);
        this.leaves.setColorAt(i, color);
      }
    });
    this.pos.set(this.home);
    this.rot.set(this.homeRot);
    this.group.add(this.leaves);

    // the mound under the top leaves: a squashed dome, leaf brown
    this.domes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xa8682c, roughness: 1 }),
      Math.max(1, this.piles.length),
    );
    this.domes.count = this.piles.length;
    this.domes.receiveShadow = true;
    this.group.add(this.domes);
    this.dummy = new THREE.Object3D();
    this.piles.forEach((p) => this.#dome(p));
    this.#write(0, n);
    this.group.visible = this.usable;
  }

  /** Where the dvornik rakes them: on open ground a step from a courtyard
   * tree that drops its leaves, the nearest few to the start, apart. */
  static spots(world) {
    const rng = new Rng(7311);
    const out = [];
    const trees = (world.treeSpots ?? []).filter((t) => !t.species?.startsWith('spruce'));
    trees.sort((a, b) => Math.hypot(a.x - 7, a.z - 19) - Math.hypot(b.x - 7, b.z - 19));
    for (const t of trees) {
      if (out.length >= PILES) break;
      for (let k = 0; k < 6; k++) {
        const a = rng.float(0, Math.PI * 2);
        const x = t.x + Math.cos(a) * 2.4;
        const z = t.z + Math.sin(a) * 2.4;
        if (world.collides(x, z, R + 0.3)) continue;
        if (Math.abs(world.heightAt(x, z)) > 0.08 || Math.abs(world.heightAt(x + R, z) - world.heightAt(x - R, z)) > 0.05) continue;
        if (['asphalt', 'stone', 'ice'].includes(world.surfaceAt(x, z))) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) continue;
        if ((world.interactables ?? []).some((i) => i.x !== undefined && Math.hypot(i.x - x, i.z - z) < 3.5)) continue;
        out.push({ x, z, y: world.heightAt(x, z) });
        break;
      }
    }
    return out;
  }

  get usable() {
    return this.world.season === 'autumn';
  }

  /** The nearest pile still heaped up, within reach of (x, z). */
  nearest(x, z, reach = Infinity) {
    let best = null;
    let bd = reach;
    for (const p of this.piles) {
      if (p.state !== 'heap') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        best = p;
        bd = d;
      }
    }
    return best;
  }

  /** From the edge of the nearest heap (Infinity out of autumn). */
  distanceTo(x, z) {
    if (!this.usable) return Infinity;
    const p = this.nearest(x, z);
    return p ? Math.max(0, Math.hypot(p.x - x, p.z - z) - R) : Infinity;
  }

  /** Bursts a heap: its leaves thrown up and out, along (dx, dz) if given. */
  burst(p, strength = 1, dx = 0, dz = 0) {
    if (!p || p.state !== 'heap') return false;
    p.state = 'scattered';
    p.t = 0;
    p.rake = 0;
    this.bursts++;
    const from = p.index * LEAVES;
    for (let j = 0; j < LEAVES; j++) {
      const i = from + j;
      const ox = this.pos[i * 3] - p.x;
      const oz = this.pos[i * 3 + 2] - p.z;
      const l = Math.hypot(ox, oz) || 1;
      const out = this.rng.float(1.2, 3.4) * strength;
      const push = this.rng.float(0.5, 2.2) * strength;
      this.vel[i * 3] = (ox / l) * out + dx * push + this.rng.float(-0.4, 0.4);
      this.vel[i * 3 + 1] = this.rng.float(1.6, 4.6) * strength;
      this.vel[i * 3 + 2] = (oz / l) * out + dz * push + this.rng.float(-0.4, 0.4);
      this.spin.set([this.rng.float(-7, 7), this.rng.float(-7, 7), this.rng.float(-7, 7)], i * 3);
      this.flying[i] = 1;
    }
    this.note = this.bursts > 1 ? `Leaves everywhere · ${this.bursts} heaps scattered` : 'Leaves everywhere: the dvornik will not be pleased';
    this.noteT = NOTE;
    this.onBurst?.(p, strength);
    return true;
  }

  /** E at a heap: a kick along where you face. */
  kick(x, z, fx, fz) {
    return this.burst(this.nearest(x, z, R + 1.6), 0.8, fx, fz);
  }

  /** The player through a heap: at a run, or coming down into it. */
  #trample(player) {
    if (!player?.position) return;
    const P = player.position;
    const p = this.nearest(P.x, P.z, R * 0.85);
    if (!p) return;
    const ground = this.world.heightAt(P.x, P.z);
    const fast = (player.speed ?? 0) > BURST_SPEED;
    const landing = P.y > ground + 0.15 && (player.velocity?.y ?? 0) < 0;
    if (!fast && !landing) return;
    const v = player.velocity;
    const l = Math.hypot(v.x, v.z) || 1;
    this.burst(p, landing ? 1.15 : clamp((player.speed ?? 0) / 5, 0.7, 1.1), v.x / l, v.z / l);
  }

  #dome(p) {
    const s = clamp(p.rake, 0.12, 1);
    this.dummy.position.set(p.x, p.y - 0.02, p.z);
    this.dummy.rotation.set(0, p.index, 0);
    this.dummy.scale.set(R * (0.75 + 0.2 * s), TOP * 0.85 * s, R * (0.75 + 0.2 * s));
    this.dummy.updateMatrix();
    this.domes.setMatrixAt(p.index, this.dummy.matrix);
    this.domes.instanceMatrix.needsUpdate = true;
  }

  #write(from, to) {
    const d = this.dummy;
    for (let i = from; i < to; i++) {
      d.position.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      d.rotation.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]);
      d.scale.setScalar(this.size[i]);
      d.updateMatrix();
      this.leaves.setMatrixAt(i, d.matrix);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
  }

  update(dt, player = null) {
    dt = Math.max(0, Math.min(dt, 0.1));
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    this.group.visible = this.usable;
    if (!this.usable) return;
    this.#trample(player);
    for (const p of this.piles) {
      if (p.state === 'heap') continue;
      const from = p.index * LEAVES;
      const to = from + LEAVES;
      p.t += dt;
      if (p.state === 'scattered') {
        let still = true;
        for (let i = from; i < to; i++) {
          if (!this.flying[i]) continue;
          still = false;
          const k = i * 3;
          // air drag holds a leaf back hard: it rises a little and flutters down
          const drag = Math.exp(-2.2 * dt);
          this.vel[k] *= drag;
          this.vel[k + 2] *= drag;
          this.vel[k + 1] = Math.max(-0.9, this.vel[k + 1] * Math.exp(-1.2 * dt) - 6 * dt);
          const flutter = Math.sin(p.t * 5 + i) * 0.5;
          this.pos[k] += (this.vel[k] + flutter * 0.4) * dt;
          this.pos[k + 1] += this.vel[k + 1] * dt;
          this.pos[k + 2] += (this.vel[k + 2] + Math.cos(p.t * 4 + i) * 0.2) * dt;
          this.rot[k] += this.spin[k] * dt;
          this.rot[k + 1] += this.spin[k + 1] * dt;
          this.rot[k + 2] += this.spin[k + 2] * dt;
          const ground = this.world.heightAt(this.pos[k], this.pos[k + 2]) + 0.03;
          if (this.pos[k + 1] <= ground && this.vel[k + 1] < 0) {
            // down: flat on the ground, a little askew
            this.pos[k + 1] = ground;
            this.rot[k] = -Math.PI / 2 + Math.sin(i) * 0.15;
            this.rot[k + 1] = Math.cos(i) * 0.15;
            this.flying[i] = 0;
          }
        }
        if (still && p.t > REGROW) {
          p.state = 'raking';
          p.t = 0;
          // where each leaf lies now, for the rake to gather from
          p.from = this.pos.slice(from * 3, to * 3);
          p.fromRot = this.rot.slice(from * 3, to * 3);
        }
      } else if (p.state === 'raking') {
        // the dvornik's rake: everything drawn back into the heap
        const u = clamp(p.t / RAKE, 0, 1);
        const e = u * u * (3 - 2 * u);
        for (let k = from * 3, m = 0; k < to * 3; k++, m++) {
          this.pos[k] = p.from[m] + (this.home[k] - p.from[m]) * e;
          this.rot[k] = p.fromRot[m] + (this.homeRot[k] - p.fromRot[m]) * e;
        }
        p.rake = e;
        if (u >= 1) {
          p.state = 'heap';
          p.from = p.fromRot = null;
        }
      }
      this.#dome(p);
      this.#write(from, to);
    }
  }
}
