// Snowmen (снеговики): in winter, on open snow, E rolls one up in front of
// you: the base, the middle, the head, one after the other, then coal eyes
// and buttons, a carrot nose, twig arms, and now and then a scarf or a tin
// bucket for a hat. It stays where it was built (a live-only collider, so
// the seeded world is untouched), takes snowballs, and the oldest melts
// away once there are too many. A thaw takes them all.
import * as THREE from "three";
import { Rng } from "./util.js";

const MAX = 5;
const AHEAD = 1.3; // m in front of the player
const CLEAR = 0.75; // m of free ground round the spot
const BALLS = [
  { r: 0.42, y: 0.36, at: 0, dur: 1.1 },
  { r: 0.3, y: 0.9, at: 1.1, dur: 0.8 },
  { r: 0.2, y: 1.29, at: 1.9, dur: 0.6 },
];
const DONE = 2.8; // s: the face and the arms go on

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - (1 - t) ** 3);

export class Snowmen {
  constructor({ world, sound, snowballs }) {
    this.world = world;
    this.sound = sound;
    this.snowballs = snowballs;
    this.list = [];
    this.made = 0;
    this.snow = new THREE.MeshStandardMaterial({
      color: 0xf1f4f7,
      roughness: 0.95,
    });
    this.coal = new THREE.MeshStandardMaterial({
      color: 0x18191b,
      roughness: 0.6,
    });
    this.carrot = new THREE.MeshStandardMaterial({
      color: 0xe0661c,
      roughness: 0.7,
    });
    this.twig = new THREE.MeshStandardMaterial({
      color: 0x3b2a1e,
      roughness: 0.95,
    });
    this.ball = new THREE.IcosahedronGeometry(1, 3);
    // a little lumpy, the way packed snow rolls
    const pos = this.ball.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const k =
        1 + Math.sin(x * 7 + z * 5) * 0.025 + Math.sin(y * 9 - x * 4) * 0.02;
      pos.setXYZ(i, x * k, y * k * 0.94, z * k);
    }
    this.ball.computeVertexNormals();
  }

  /** Where a snowman would go if built now, or null if the spot is no good. */
  spotFor(pos, forward) {
    if (this.world.season !== "winter") return null;
    const len = Math.hypot(forward.x, forward.z) || 1;
    const x = pos.x + (forward.x / len) * AHEAD;
    const z = pos.z + (forward.z / len) * AHEAD;
    if (this.world.surfaceAt(x, z) !== "snow") return null;
    if (
      Math.abs(this.world.heightAt(x, z) - this.world.heightAt(pos.x, pos.z)) >
      0.05
    )
      return null;
    if (this.world.collides(x, z, CLEAR)) return null;
    if (this.world.interiorAt?.(x, z)) return null;
    // off the lanes: never on a road
    if (this.world.trafficCars?.some((c) => Math.hypot(c.x - x, c.z - z) < 3))
      return null;
    return { x, z, yaw: Math.atan2(pos.x - x, pos.z - z) };
  }

  /** Starts rolling a snowman at the spot, facing the player. */
  build(spot) {
    const rng = new Rng(5100 + this.made * 17);
    this.made++;
    const root = new THREE.Group();
    root.name = "snowman";
    root.position.set(spot.x, this.world.heightAt(spot.x, spot.z), spot.z);
    root.rotation.y = spot.yaw;
    const k = rng.float(0.88, 1.12);
    root.scale.setScalar(k);
    const balls = BALLS.map((b) => {
      const m = new THREE.Mesh(this.ball, this.snow);
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.y = b.y;
      m.scale.setScalar(1e-3);
      m.rotation.y = rng.float(0, Math.PI * 2);
      root.add(m);
      return m;
    });
    const extras = new THREE.Group();
    extras.visible = false;
    root.add(extras);
    this.dress(extras, rng);
    // in the world group: the snowballs look for their targets there
    this.world.group.add(root);
    // a live collider only: the seeded stream and the historic list stay as they were
    const r = 0.45 * k;
    const rect = {
      minX: spot.x - r,
      maxX: spot.x + r,
      minZ: spot.z - r,
      maxZ: spot.z + r,
      snowman: true,
    };
    this.world.colliders.push(rect);
    const man = {
      root,
      balls,
      extras,
      rect,
      t: 0,
      done: false,
      x: spot.x,
      z: spot.z,
    };
    this.list.push(man);
    if (this.list.length > MAX) this.remove(this.list[0]);
    this.dirty();
    return man;
  }

  /** Coal face and buttons, carrot, twig arms; maybe a scarf, maybe a bucket. */
  dress(g, rng) {
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const coal = new THREE.IcosahedronGeometry(0.028, 0);
    // the face looks along +z (towards the player who built it)
    for (const sx of [-0.07, 0.07]) add(coal, this.coal, sx, 1.34, 0.17);
    for (let i = 0; i < 5; i++) {
      const a = -0.5 + i * 0.25;
      add(
        coal,
        this.coal,
        Math.sin(a) * 0.1,
        1.215 - Math.abs(a) * 0.05 - 0.02,
        0.165 + Math.cos(a) * 0.01,
      ).scale.setScalar(0.6);
    }
    for (let i = 0; i < 3; i++)
      add(
        coal,
        this.coal,
        0,
        0.98 - i * 0.14,
        0.29 - Math.abs(i - 0.5) * 0.02,
      ).scale.setScalar(1.2);
    const nose = new THREE.ConeGeometry(0.03, rng.float(0.16, 0.26), 7);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, 0.1);
    add(
      nose,
      this.carrot,
      0,
      1.29,
      0.17,
      rng.float(-0.15, 0.05),
      rng.float(-0.15, 0.15),
    );
    // twig arms with a forked end
    for (const side of [-1, 1]) {
      const up = rng.float(0.15, 0.7);
      const arm = new THREE.Group();
      arm.position.set(side * 0.27, 0.98, 0);
      arm.rotation.z = side * (Math.PI / 2 - up);
      arm.rotation.y = rng.float(-0.3, 0.3);
      g.add(arm);
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.018, 0.55, 5),
        this.twig,
      );
      stick.position.y = 0.27;
      arm.add(stick);
      for (const f of [-1, 1]) {
        const finger = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.009, 0.14, 4),
          this.twig,
        );
        finger.position.set(f * 0.03, 0.56, 0);
        finger.rotation.z = -f * 0.5;
        arm.add(finger);
      }
    }
    if (rng.chance(0.5)) {
      const color = rng.pick([0xa4262c, 0x2f5d3a, 0x2d4a7a, 0xc9a227]);
      const wool = new THREE.MeshStandardMaterial({ color, roughness: 1 });
      const scarf = new THREE.TorusGeometry(0.2, 0.045, 6, 16);
      scarf.rotateX(Math.PI / 2);
      add(scarf, wool, 0, 1.13, 0);
      const tail = new THREE.BoxGeometry(0.09, 0.26, 0.03);
      add(tail, wool, 0.1, 1.0, 0.2, 0.15, 0, 0.12);
    }
    if (rng.chance(0.4)) {
      const tin = new THREE.MeshStandardMaterial({
        color: rng.pick([0x8a9097, 0x2f4f7a, 0x8a2a25]),
        roughness: 0.5,
        metalness: 0.4,
      });
      const bucket = new THREE.CylinderGeometry(0.15, 0.12, 0.2, 12, 1, true);
      const m = add(
        bucket,
        tin,
        0.02,
        1.53,
        -0.01,
        rng.float(-0.25, 0.1),
        0,
        rng.float(-0.2, 0.2),
      );
      m.material.side = THREE.DoubleSide;
      const bottom = new THREE.CircleGeometry(0.15, 12);
      bottom.rotateX(-Math.PI / 2);
      bottom.translate(0, 0.1, 0);
      m.add(new THREE.Mesh(bottom, tin));
    }
  }

  remove(man) {
    man.root.removeFromParent();
    const i = this.world.colliders.indexOf(man.rect);
    if (i >= 0) this.world.colliders.splice(i, 1);
    this.list.splice(this.list.indexOf(man), 1);
    this.dirty();
  }

  /** The snowballs look for something new to hit. */
  dirty() {
    if (this.snowballs) this.snowballs.targetList = null;
  }

  update(dt, listener = null) {
    // a thaw: they are gone
    if (this.world.season !== "winter" && this.list.length) {
      for (const man of [...this.list]) this.remove(man);
      return;
    }
    for (const man of this.list) {
      if (man.done) continue;
      const before = man.t;
      man.t += dt;
      BALLS.forEach((b, i) => {
        const p = ease((man.t - b.at) / b.dur);
        man.balls[i].scale.setScalar(Math.max(1e-3, b.r * p));
        man.balls[i].position.y = b.y - b.r * (1 - p) * 0.9;
        // a pat as each one is set in place
        if (before < b.at + b.dur && man.t >= b.at + b.dur && listener) {
          const { dist, pan } = listener(man.x, man.z);
          this.sound?.splat?.(dist + 2, pan, "ground");
        }
      });
      if (man.t >= DONE) {
        man.done = true;
        man.extras.visible = true;
        man.root.updateMatrixWorld(true);
        this.dirty();
      }
    }
  }
}
