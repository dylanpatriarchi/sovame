// A puck on the hockey box: in winter, walk up to it and E shoots it the way
// you face (or just skate into it to push it along). It slides on the ice,
// rings off the boards and, through either goal mouth, it's a goal; then it
// is dropped back on the centre spot. Live only: no draws on the seeded stream.
import * as THREE from 'three';
import { RINK } from './world/south.js';

const R = 0.038; // puck radius
const THICK = 0.025;
const ICE_Y = 0.05; // the ice sheet's top
const FRICTION = 0.32; // per second, on ice
const SHOT = 11; // m/s off the stick
const SHOT_SPRINT = 15;
const BOUNCE = 0.62; // speed kept off the boards
const REACH = 1.3; // to shoot
const NUDGE = 0.5; // the player's boots push it along within this
const GOAL_IN = 3.2; // goal line, in from each end
const MOUTH = 0.92; // half the goal's width
const DEPTH = 1.0; // the net, behind the line
const FACEOFF = 3; // s in the net before it is dropped back

export class Puck {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.rink = RINK;
    this.goals = [
      { side: -1, x: RINK.x - (RINK.l / 2 - GOAL_IN), count: 0 },
      { side: 1, x: RINK.x + (RINK.l / 2 - GOAL_IN), count: 0 },
    ];
    this.position = new THREE.Vector3(RINK.x, ICE_Y + THICK / 2, RINK.z);
    this.velocity = new THREE.Vector3();
    this.inNet = null; // the goal it is lying in
    this.t = 0;
    this.shots = 0;
    this.bounces = 0;
    this.lastGoal = null;
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, THICK, 16), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.55 }));
    this.mesh.castShadow = true;
    this.mesh.name = 'puck';
    world.group.add(this.mesh);
    this.#sync();
  }

  get usable() {
    return this.world.season === 'winter' && !this.inNet;
  }

  distanceTo(x, z) {
    if (!this.usable) return Infinity;
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  /** Off the stick, the way the player faces. */
  shoot(forward, hard = false) {
    if (!this.usable) return false;
    const len = Math.hypot(forward.x, forward.z) || 1;
    const v = hard ? SHOT_SPRINT : SHOT;
    this.velocity.set((forward.x / len) * v, 0, (forward.z / len) * v);
    this.shots++;
    this.sound?.puck?.('shot');
    return true;
  }

  /** Back on the centre spot. */
  faceoff() {
    this.inNet = null;
    this.position.set(this.rink.x, ICE_Y + THICK / 2, this.rink.z);
    this.velocity.set(0, 0, 0);
    this.#sync();
  }

  update(dt, { player = null } = {}) {
    dt = Math.max(0, dt);
    this.mesh.visible = this.world.season === 'winter';
    if (!this.mesh.visible) return;
    if (this.inNet) {
      this.t += dt;
      if (this.t >= FACEOFF) this.faceoff();
      return;
    }
    // walked into: the boots push it along ahead of them
    if (player && player.y < ICE_Y + 0.6) {
      const dx = this.position.x - player.x;
      const dz = this.position.z - player.z;
      const d = Math.hypot(dx, dz);
      const speed = Math.hypot(player.vx, player.vz);
      if (d < NUDGE && d > 1e-4 && speed > 0.4 && dx * player.vx + dz * player.vz > 0) {
        const push = speed * 1.15;
        this.velocity.set((dx / d) * push, 0, (dz / d) * push);
      }
    }
    const n = Math.max(1, Math.ceil((Math.hypot(this.velocity.x, this.velocity.z) * dt) / 0.05));
    const h = dt / n;
    for (let i = 0; i < n && !this.inNet; i++) this.#step(h);
    const decay = Math.exp(-FRICTION * dt);
    this.velocity.multiplyScalar(decay);
    if (Math.hypot(this.velocity.x, this.velocity.z) < 0.03) this.velocity.set(0, 0, 0);
    this.#sync();
  }

  #step(h) {
    const k = this.rink;
    const p = this.position;
    const v = this.velocity;
    const nx = p.x + v.x * h;
    const nz = p.z + v.z * h;
    // the goals: through the mouth is a goal, anywhere else the frame
    for (const g of this.goals) {
      const back = g.x + g.side * DEPTH;
      const lo = Math.min(g.x, back);
      const hi = Math.max(g.x, back);
      const inBox = (x, z) => x > lo - R && x < hi + R && Math.abs(z - k.z) < MOUTH + R;
      if (!inBox(p.x, p.z) && inBox(nx, nz)) {
        const crossing = (p.x - g.x) * g.side < 0 && Math.abs(nz - k.z) < MOUTH - R;
        if (crossing) {
          this.#goal(g, nx, nz);
          return;
        }
        // off the frame: whichever face was struck
        if (Math.abs(p.z - k.z) >= MOUTH + R) v.z = -v.z * BOUNCE;
        else v.x = -v.x * BOUNCE;
        this.#ring();
        return;
      }
    }
    // the rounded corners
    const cx = Math.abs(nx - k.x) - (k.l / 2 - k.r);
    const cz = Math.abs(nz - k.z) - (k.w / 2 - k.r);
    if (cx > 0 && cz > 0 && Math.hypot(cx, cz) > k.r - R) {
      // reflect about the corner's normal
      const d = Math.hypot(cx, cz);
      const ux = (cx / d) * Math.sign(nx - k.x);
      const uz = (cz / d) * Math.sign(nz - k.z);
      const dot = v.x * ux + v.z * uz;
      if (dot > 0) {
        v.x = (v.x - 2 * dot * ux) * BOUNCE;
        v.z = (v.z - 2 * dot * uz) * BOUNCE;
      }
      this.#ring();
      return;
    }
    // the boards
    let bounced = false;
    if (Math.abs(nx - k.x) > k.l / 2 - R) {
      v.x = -v.x * BOUNCE;
      bounced = true;
    }
    if (Math.abs(nz - k.z) > k.w / 2 - R) {
      v.z = -v.z * BOUNCE;
      bounced = true;
    }
    if (bounced) {
      this.#ring();
      return;
    }
    p.x = nx;
    p.z = nz;
  }

  #ring() {
    this.bounces++;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.6) this.sound?.puck?.('board', Math.min(1, speed / SHOT));
  }

  #goal(g, x, z) {
    g.count++;
    this.lastGoal = g;
    this.inNet = g;
    this.t = 0;
    // into the back of the net
    this.position.set(g.x + g.side * (DEPTH * 0.6), ICE_Y + THICK / 2, z);
    this.velocity.set(0, 0, 0);
    this.sound?.puck?.('goal');
    this.#sync();
  }

  /** The score, for the prompt: goals into the west net : the east. */
  get score() {
    return `${this.goals[0].count} : ${this.goals[1].count}`;
  }

  get prompt() {
    if (this.inNet) return `Goal! ${this.score}`;
    return 'E — shoot the puck (⇧ for a slapshot)';
  }

  #sync() {
    this.mesh.position.copy(this.position);
  }
}
