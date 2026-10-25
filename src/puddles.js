// Autumn puddles you can splash in: jump into one and the water flies up
// round your boots, rings spreading out over it; run through and every
// step kicks up a little spray. And keep back from the curb: a car going
// through a puddle by the road throws a sheet of it over the pavement,
// and over you if you are standing there. Live only: its own Rng.
import * as THREE from 'three';
import { makeSoftCircleTexture } from './textures.js';
import { Rng, clamp } from './util.js';

const DROPS = 420;
const RINGS = 10;
const G = 9.81;
const STEP = 0.75; // m run between the splashes of the steps
const SOAK_REACH = 2.6; // m from a car's splash that soaks you
const CAR_SPLASH = 5; // m/s through a puddle that throws it
const NOTE = 3;

export class PuddleSplash {
  constructor({ world }) {
    this.world = world;
    this.rng = new Rng(8823);
    this.puddles = (world.puddles ?? []).filter((p) => p.season === 'autumn');
    this.group = new THREE.Group();
    this.group.name = 'puddle-splashes';
    world.group.add(this.group);
    this.#lanePuddles();
    this.splashes = 0;
    this.soaked = 0;
    this.note = null;
    this.noteT = 0;
    this.onSplash = null; // (x, z, strength, byCar) => void

    // the drops: one pool of points, parked far below when idle
    this.pos = new Float32Array(DROPS * 3).fill(-1000);
    this.vel = new Float32Array(DROPS * 3);
    this.life = new Float32Array(DROPS);
    this.next = 0;
    this.live = 0;
    this.wasLive = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.dropGeo = geo;
    this.drops = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: makeSoftCircleTexture(32, '210,225,240', 1.6), size: 0.1, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.drops.frustumCulled = false;
    this.group.add(this.drops);

    // the rings spreading over the water
    const ringGeo = new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xc8d6e4, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, life: 1, size: 1, puddle: null });
    }
    this.ringNext = 0;
    this.prev = null; // the player last frame
    this.run = 0;
    this.cars = new Map(); // car -> where it was, for its speed
  }

  /** The puddles in the road itself, where the right-hand wheels run by
   * the curb on the straights: two on each lane, the cars' own to splash. */
  #lanePuddles() {
    const paths = this.world.traffic?.paths;
    if (!paths) return;
    const rng = new Rng(8824);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b232d, roughness: 0.07, metalness: 0.2, emissive: 0x0c1522, emissiveIntensity: 0.5 });
    for (const path of [paths[1], paths[-1]]) {
      if (!path?.x) continue;
      const n = path.x.length;
      let placed = 0;
      for (let tries = 0; tries < 60 && placed < 2; tries++) {
        const i = rng.int(0, n - 1);
        // on a straight: the heading the same a car length either way
        const h = path.heading[i];
        const near = [-8, 8].every((d) => Math.abs(Math.sin(path.heading[(i + d + n) % n] - h)) < 0.02);
        if (!near) continue;
        // under the right-hand wheels
        const x = path.x[i] - Math.cos(h) * 0.8;
        const z = path.z[i] + Math.sin(h) * 0.8;
        if (this.world.surfaceAt(x, z) !== 'asphalt' || this.puddles.some((p) => Math.hypot(p.x - x, p.z - z) < 25)) continue;
        // long along the road
        const along = rng.float(1.2, 1.7);
        const across = rng.float(0.55, 0.75);
        const alongX = Math.abs(Math.sin(h)) > Math.abs(Math.cos(h));
        const p = { x, z, y: this.world.heightAt(x, z) + 0.024, a: alongX ? along : across, b: alongX ? across : along, season: 'autumn', lane: true };
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 18), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.set(p.a, p.b, 1);
        mesh.position.set(x, p.y, z);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.puddles.push(p);
        placed++;
      }
    }
  }

  get usable() {
    return this.world.season === 'autumn';
  }

  /** The puddle (x, z) is in, if any. */
  puddleAt(x, z) {
    for (const p of this.puddles) {
      const u = (x - p.x) / p.a;
      const v = (z - p.z) / p.b;
      if (u * u + v * v <= 1) return p;
    }
    return null;
  }

  /** Water thrown up from (x, z): `n` drops at up to `up` m/s, pushed along (dx, dz). */
  #drops(x, y, z, n, up, spread, dx = 0, dz = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % DROPS;
      const a = this.rng.float(0, Math.PI * 2);
      const s = this.rng.float(0.2, 1) * spread;
      this.pos.set([x + Math.cos(a) * 0.15, y + 0.03, z + Math.sin(a) * 0.15], i * 3);
      this.vel.set([Math.cos(a) * s + dx * this.rng.float(0.5, 1), up * this.rng.float(0.45, 1), Math.sin(a) * s + dz * this.rng.float(0.5, 1)], i * 3);
      this.life[i] = 2;
    }
  }

  #ring(p, x, z, size, life) {
    const r = this.rings[this.ringNext];
    this.ringNext = (this.ringNext + 1) % RINGS;
    r.mesh.position.set(x, p.y + 0.012, z);
    r.mesh.visible = true;
    r.t = 0;
    r.life = life;
    r.size = size;
    r.puddle = p;
  }

  /** A splash in puddle p at (x, z): strength 0..1.5. */
  splash(p, x, z, strength = 1, dx = 0, dz = 0, byCar = false) {
    if (!p) return false;
    this.splashes++;
    const n = Math.round(clamp(strength, 0.1, 1.5) * (byCar ? 180 : 70));
    this.#drops(x, p.y, z, n, 1.2 + strength * 2.6, 0.5 + strength * 1.4, dx, dz);
    this.#ring(p, x, z, 0.5 + strength * 1.1, 1.4 + strength * 0.6);
    if (strength > 0.7) this.#ring(p, x, z, 0.3 + strength * 0.5, 1.1);
    this.onSplash?.(x, z, strength, byCar);
    return true;
  }

  /** The player in the water: a jump in, or the steps of a run. */
  #wade(player) {
    const P = player.position;
    const prev = this.prev;
    this.prev = { x: P.x, z: P.z, ground: !!player.onGround, vy: player.velocity?.y ?? 0 };
    if (!prev) return;
    const p = this.puddleAt(P.x, P.z);
    if (!p) {
      this.run = 0;
      return;
    }
    if (player.onGround && !prev.ground) {
      // down into it from a jump
      const strength = clamp(-prev.vy / 5, 0.5, 1.5);
      this.splash(p, P.x, P.z, strength);
      if (this.splashes === 1 || this.rng.chance(0.3)) this.#say(strength > 0.9 ? 'Splash! Wet to the knees' : 'Splash!');
      this.run = 0;
      return;
    }
    if (!player.onGround) return;
    this.run += Math.hypot(P.x - prev.x, P.z - prev.z);
    const speed = player.speed ?? 0;
    if (this.run >= STEP && speed > 1.2) {
      this.run = 0;
      const v = player.velocity;
      const l = Math.hypot(v.x, v.z) || 1;
      this.splash(p, P.x, P.z, clamp(speed / 6, 0.25, 0.8), (v.x / l) * speed * 0.3, (v.z / l) * speed * 0.3);
    }
  }

  /** The traffic through the puddles by the curb, and who stands there. */
  #cars(cars, player, dt) {
    for (const car of cars) {
      const was = this.cars.get(car);
      const now = { x: car.x, z: car.z, cool: Math.max(0, (was?.cool ?? 0) - dt) };
      this.cars.set(car, now);
      if (!was || dt <= 0) continue;
      const speed = Math.hypot(car.x - was.x, car.z - was.z) / dt;
      if (speed < CAR_SPLASH || now.cool > 0) continue;
      // the wheels: either side of the car, a little ahead of its middle
      const sx = Math.cos(car.heading ?? 0);
      const sz = -Math.sin(car.heading ?? 0);
      for (const side of [-1, 1]) {
        const wx = car.x + sx * side * 0.75;
        const wz = car.z + sz * side * 0.75;
        const p = this.puddleAt(wx, wz);
        if (!p) continue;
        now.cool = 0.8;
        // thrown out sideways, away from the car
        const strength = clamp(speed / 10, 0.8, 1.5);
        this.splash(p, wx, wz, strength, sx * side * speed * 0.35, sz * side * speed * 0.35, true);
        if (player?.position && Math.hypot(player.position.x - wx, player.position.z - wz) < SOAK_REACH) {
          this.soaked++;
          this.#say(this.soaked > 1 ? `Soaked by a passing car again (${this.soaked})` : 'Soaked by a passing car!');
        }
        break;
      }
    }
  }

  #say(text) {
    this.note = text;
    this.noteT = NOTE;
  }

  update(dt, { player = null, cars = [] } = {}) {
    dt = Math.max(0, Math.min(dt, 0.1));
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    const on = this.usable;
    this.group.visible = on;
    if (on && player) this.#wade(player);
    else this.prev = null;
    if (on) this.#cars(cars, player, dt);
    // the drops fly and fall back
    let live = 0;
    for (let i = 0; i < DROPS; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k + 1] -= G * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.world.heightAt(this.pos[k], this.pos[k + 2]) || this.life[i] <= 0) {
        this.life[i] = 0;
        this.pos[k + 1] = -1000;
      } else live++;
    }
    this.live = live;
    // (one more upload after the last drop is down, to park it)
    if (live || this.wasLive) this.dropGeo.attributes.position.needsUpdate = true;
    this.wasLive = live > 0;
    // and the rings spread and fade
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.life;
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      // not past the puddle's own edge
      const s = r.size * (0.15 + 0.85 * Math.sqrt(u));
      const p = r.puddle;
      r.mesh.scale.set(Math.min(s, p.a * 1.05), 1, Math.min(s, p.b * 1.05));
      r.mesh.material.opacity = 0.55 * (1 - u);
    }
  }
}
