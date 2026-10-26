// The New Year tree (ёлка) put up by the playground in winter: a spruce
// with a garland of coloured bulbs chasing round it and a red star on top.
// E at the tree lights a firework (салют): the rocket whistles up, bursts
// into a ball of sparks that fall and fade, and the bang comes after it.
// One mesh for the tree, one for the bulbs, one point cloud for the sparks.
// Live only: its own Rng, a collider round the trunk only while it stands.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSoftCircleTexture } from './textures.js';
import { Rng, clamp } from './util.js';

export const TREE = { x: -33, z: -29 };
const HEIGHT = 6.2;
const TIERS = 6;
const BULBS = 84;
const SPARKS = 900;
const ROCKET = 26; // m/s up
const FUSE = 1.25; // s from the ground to the burst
const BURST_V = 9; // m/s, the sparks' speed out of the burst
const SPARK_LIFE = 2.2;
const MAX_UP = 3; // rockets in the air at once
const PALETTE = [
  [1, 0.25, 0.2],
  [0.3, 1, 0.35],
  [0.35, 0.55, 1],
  [1, 0.85, 0.3],
  [1, 0.4, 0.9],
  [0.95, 0.95, 1],
];
const BULB_COLORS = [0xff3b30, 0x2fd158, 0x3a7bff, 0xffc93a];

export class NewYear {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.rng = new Rng(3112);
    this.launched = 0;
    this.rockets = [];
    this.cooldown = 0;
    this.note = null;
    this.noteT = 0;
    this.t = 0;
    const ground = world.heightAt(TREE.x, TREE.z);
    this.base = new THREE.Vector3(TREE.x, ground, TREE.z);

    this.group = new THREE.Group();
    this.group.name = 'new-year-tree';
    this.group.position.copy(this.base);
    // the spruce: a trunk and stacked tiers, narrowing to the top
    const parts = [new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8).translate(0, 0.45, 0)];
    this.tiers = [];
    for (let i = 0; i < TIERS; i++) {
      const k = i / (TIERS - 1);
      const r = 1.75 * (1 - k * 0.78);
      const h = 1.6 - k * 0.45;
      const y = 0.6 + k * (HEIGHT - 2.2);
      parts.push(new THREE.ConeGeometry(r, h, 12, 1).translate(0, y + h / 2, 0));
      this.tiers.push({ y, r, h });
    }
    const greens = mergeGeometries(parts.map((g) => g.toNonIndexed()));
    this.tree = new THREE.Mesh(greens, new THREE.MeshStandardMaterial({ color: 0x1f4a2a, roughness: 0.95, flatShading: true }));
    this.tree.castShadow = true;
    this.group.add(this.tree);
    // the star on top
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? 0.13 : 0.32;
      if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03);
    this.star = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.2, 0.15) }));
    this.star.position.y = HEIGHT + 0.25;
    this.group.add(this.star);
    // the garland: a spiral of bulbs round the tiers
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial(), BULBS);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < BULBS; i++) {
      const u = i / BULBS;
      const y = 0.75 + u * (HEIGHT - 1.2);
      // the radius of the tree at that height: the tier it is on, near its rim
      const tier = this.tiers.findLast((t) => t.y <= y) ?? this.tiers[0];
      const within = clamp((y - tier.y) / tier.h, 0, 1);
      const r = tier.r * (1 - within) + 0.06;
      const a = u * Math.PI * 2 * 7.5;
      d.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      d.updateMatrix();
      this.bulbs.setMatrixAt(i, d.matrix);
      this.bulbs.setColorAt(i, col.set(BULB_COLORS[i % BULB_COLORS.length]));
    }
    this.bulbs.instanceColor.needsUpdate = true;
    this.group.add(this.bulbs);
    world.group.add(this.group);

    // the sparks: one point cloud, parked out of sight until a burst
    const pos = new Float32Array(SPARKS * 3).fill(-1000);
    const colors = new Float32Array(SPARKS * 3);
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sparks = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.55,
        map: makeSoftCircleTexture(64, '255,255,255', 1.6),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.sparks.name = 'firework-sparks';
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;
    world.group.add(this.sparks);
    this.spark = Array.from({ length: SPARKS }, () => ({ age: SPARK_LIFE, vx: 0, vy: 0, vz: 0, c: [1, 1, 1] }));
    this.nextSpark = 0;

    // only while the tree stands does its foot block the way
    this.rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    world.colliders.push(this.rect);
    this.wasWinter = null;
  }

  get usable() {
    return this.world.season === 'winter';
  }

  /** From the tree's foot (Infinity out of winter). */
  distanceTo(x, z) {
    if (!this.usable) return Infinity;
    return Math.max(0, Math.hypot(x - TREE.x, z - TREE.z) - 1.8);
  }

  get prompt() {
    return this.rockets.length >= MAX_UP ? null : 'E — light a firework (салют)';
  }

  /** In the air now, or still to burst. */
  get flying() {
    return this.rockets.length;
  }

  launch() {
    if (!this.usable || this.rockets.length >= MAX_UP || this.cooldown > 0) return false;
    this.cooldown = 0.6;
    const a = this.rng.float(0, Math.PI * 2);
    const out = this.rng.float(2.4, 3.2);
    const x = TREE.x + Math.cos(a) * out;
    const z = TREE.z + Math.sin(a) * out;
    const pos = new THREE.Vector3(x, this.world.heightAt(x, z) + 0.3, z);
    this.rockets.push({ pos, t: 0, vx: this.rng.float(-1.2, 1.2), vz: this.rng.float(-1.2, 1.2), color: PALETTE[this.rng.int(0, PALETTE.length - 1)], trail: 0 });
    this.launched++;
    this.onLaunch?.(pos);
    if (this.launched === 1 || this.launched % 10 === 0) {
      this.note = this.launched === 1 ? 'С Новым годом! Happy New Year!' : `${this.launched} rockets up`;
      this.noteT = 3;
    }
    return true;
  }

  #emit(p, vx, vy, vz, c, life = SPARK_LIFE * this.rng.float(0.7, 1.1)) {
    const s = this.spark[this.nextSpark];
    const i = this.nextSpark;
    this.nextSpark = (this.nextSpark + 1) % SPARKS;
    s.age = 0;
    s.vx = vx;
    s.vy = vy;
    s.vz = vz;
    s.c = c;
    s.life = life;
    this.sparkGeo.attributes.position.setXYZ(i, p.x, p.y, p.z);
  }

  #burst(r) {
    const n = 110;
    // sometimes a second colour mixed in
    const second = this.rng.chance(0.4) ? PALETTE[this.rng.int(0, PALETTE.length - 1)] : r.color;
    for (let k = 0; k < n; k++) {
      // even-ish over a sphere
      const y = 1 - (2 * (k + 0.5)) / n;
      const rr = Math.sqrt(1 - y * y);
      const a = k * 2.39996;
      const v = BURST_V * this.rng.float(0.85, 1.1);
      this.#emit(r.pos, Math.cos(a) * rr * v, y * v + 1, Math.sin(a) * rr * v, k % 3 ? r.color : second);
    }
    this.onBurst?.(r.pos);
  }

  update(dt) {
    dt = Math.max(0, dt);
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    const winter = this.usable;
    if (winter !== this.wasWinter) {
      this.wasWinter = winter;
      this.group.visible = winter;
      Object.assign(
        this.rect,
        winter ? { minX: TREE.x - 0.9, maxX: TREE.x + 0.9, minZ: TREE.z - 0.9, maxZ: TREE.z + 0.9 } : { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
      );
    }
    if (winter) {
      // the garland chases round in four colours, and the star pulses
      const col = new THREE.Color();
      for (let i = 0; i < BULBS; i++) {
        const lit = Math.sin(this.t * 3 - i * 0.6) > -0.2;
        col.set(BULB_COLORS[i % BULB_COLORS.length]).multiplyScalar(lit ? 1.6 : 0.18);
        this.bulbs.setColorAt(i, col);
      }
      this.bulbs.instanceColor.needsUpdate = true;
      const k = 1.3 + 0.4 * Math.sin(this.t * 2.2);
      this.star.material.color.setRGB(k, 0.18 * k, 0.12 * k);
      this.star.rotation.y = Math.sin(this.t * 0.5) * 0.4;
    }

    // rockets: up on a wobbling trail of sparks, then the burst
    for (const r of this.rockets) {
      r.t += dt;
      r.pos.x += r.vx * dt;
      r.pos.z += r.vz * dt;
      r.pos.y += ROCKET * (1 - r.t / (FUSE * 1.6)) * dt;
      r.trail -= dt;
      if (r.trail <= 0) {
        r.trail = 0.02;
        this.#emit(r.pos, this.rng.float(-0.4, 0.4), -1.5, this.rng.float(-0.4, 0.4), [1, 0.75, 0.4], 0.45);
      }
      if (r.t >= FUSE) {
        this.#burst(r);
        r.done = true;
      }
    }
    this.rockets = this.rockets.filter((r) => !r.done);

    // the sparks fall, slow in the air and fade
    const P = this.sparkGeo.attributes.position;
    const C = this.sparkGeo.attributes.color;
    let any = false;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < SPARKS; i++) {
      const s = this.spark[i];
      const life = s.life ?? SPARK_LIFE;
      if (s.age >= life) {
        if (s.shown) {
          P.setXYZ(i, 0, -1000, 0);
          s.shown = false;
        }
        continue;
      }
      s.age += dt;
      s.vx *= drag;
      s.vy = s.vy * drag - 4.5 * dt;
      s.vz *= drag;
      P.setXYZ(i, P.getX(i) + s.vx * dt, P.getY(i) + s.vy * dt, P.getZ(i) + s.vz * dt);
      const f = clamp(1 - s.age / life, 0, 1);
      // a twinkle as they die
      const tw = s.age > life * 0.6 ? 0.5 + 0.5 * Math.sin(s.age * 60 + i) : 1;
      C.setXYZ(i, s.c[0] * f * tw, s.c[1] * f * tw, s.c[2] * f * tw);
      s.shown = true;
      any = true;
    }
    this.sparks.visible = any;
    if (any || this.hadSparks) {
      P.needsUpdate = true;
      C.needsUpdate = true;
    }
    this.hadSparks = any;
  }
}
