// A ride down the ice slide (ледяная горка), in winter: E at the foot of
// its stairs and you climb up, sit at the top of the chute and go: faster
// all the way down the ice, out over the glazed run-out and on into the
// snow until it stops you. Then up on your feet, and how far you went from
// the top. Live only: nothing drawn from the seeded stream, no colliders.
import { SLIDE } from './world/south.js';
import { clamp, damp } from './util.js';

const DECK = 2.49; // the platform's top
const CHUTE = 9; // the chute's length, along the ground
const LOW = 0.06; // the ice at its foot
const SLOPE = Math.atan2(DECK - LOW, CHUTE);
const G = 9.81;
const MU_CHUTE = 0.03; // sitting on a scrap of cardboard on glazed ice
const MU_ICE = 0.05;
const MU_SNOW = 0.45;
const DRAG = 0.012; // air, per m/s squared
const SEAT_EYE = 0.82;
const CLIMB = 2.6; // s up the stairs
const SIT = 0.9; // s to the top of the chute and sit down
const STAND = 0.9; // s back on your feet at the end
const FOOT = { x: SLIDE.x, z: SLIDE.z + 4.5 }; // where the ride is offered
const TOP_Z = SLIDE.z - 1.1; // the chute's top edge
const END_Z = TOP_Z - CHUTE; // and its foot

export class IceSlide {
  constructor({ world, player, camera, sound }) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.sound = sound;
    this.active = false;
    this.stage = 'idle'; // climb → sit → down → out → stand
    this.t = 0;
    this.rides = 0;
    this.best = 0;
    this.last = 0;
    this.top = 0; // the most speed this ride, m/s
    this.note = null;
    this.noteT = 0;
    this.pos = { x: FOOT.x, y: 0, z: FOOT.z };
    this.v = 0;
    this.eye = 1.72;
    this.hiss = 0;
  }

  get usable() {
    return this.world.season === 'winter';
  }

  /** From the foot of the stairs (Infinity out of winter). */
  distanceTo(x, z) {
    if (!this.usable || this.active) return Infinity;
    return Math.hypot(x - FOOT.x, z - FOOT.z);
  }

  get prompt() {
    return this.best > 0 ? `E — climb up and slide down (best ${this.best.toFixed(1)} m)` : 'E — climb up and slide down';
  }

  start() {
    if (this.active || !this.usable) return false;
    const p = this.player;
    this.active = true;
    this.stage = 'climb';
    this.t = 0;
    this.v = 0;
    this.top = 0;
    this.eye = p.eye ?? 1.72;
    this.pos = { x: FOOT.x, y: 0, z: p.position.z };
    this.from = p.position.z;
    p.enabled = false;
    p.velocity.set(0, 0, 0);
    p.yaw = 0; // facing south, down the chute
    p.pitch = 0.05;
    return true;
  }

  /** The ice under a point on the flat (winter ice, or snow). */
  #mu(x, z) {
    return this.world.surfaceAt(x, z) === 'ice' ? MU_ICE : MU_SNOW;
  }

  update(dt) {
    dt = Math.max(0, dt);
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    if (!this.active) return;
    this.t += dt;
    const P = this.pos;
    let eye = 1.72;
    if (this.stage === 'climb') {
      // up the steps to the platform
      const u = clamp(this.t / CLIMB, 0, 1);
      P.z = this.from + (SLIDE.z + 0.9 - this.from) * u;
      P.y = DECK * clamp((SLIDE.z + 4.0 - P.z) / 2.8, 0, 1);
      if (u >= 1) this.#next('sit');
    } else if (this.stage === 'sit') {
      const u = clamp(this.t / SIT, 0, 1);
      P.z = SLIDE.z + 0.9 + (TOP_Z - SLIDE.z - 0.9) * u;
      P.y = DECK;
      eye = 1.72 + (SEAT_EYE - 1.72) * u;
      if (u >= 1) {
        this.#next('down');
        this.v = 0.6; // a push off with the hands
      }
    } else if (this.stage === 'down' || this.stage === 'out') {
      eye = SEAT_EYE;
      this.#glide(dt);
    } else if (this.stage === 'stand') {
      const u = clamp(this.t / STAND, 0, 1);
      eye = SEAT_EYE + (1.72 - SEAT_EYE) * u;
      if (u >= 1) this.#finish();
    }
    this.eye = damp(this.eye, eye, 10, dt);
    if (this.active) this.#view();
  }

  #next(stage) {
    this.stage = stage;
    this.t = 0;
  }

  #glide(dt) {
    const P = this.pos;
    const n = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      if (this.stage === 'down') {
        // down the chute: gravity along it, a little friction
        this.v += G * (Math.sin(SLOPE) - MU_CHUTE * Math.cos(SLOPE)) * h - DRAG * this.v * this.v * h;
        P.z -= this.v * Math.cos(SLOPE) * h;
        if (P.z <= END_Z) {
          P.z = END_Z;
          this.#next('out');
        }
        P.y = LOW + ((P.z - END_Z) / CHUTE) * (DECK - LOW);
      } else {
        // out over the flat: the glazed run-out, then the snow
        const mu = this.#mu(P.x, P.z);
        this.v = Math.max(0, this.v - (mu * G + DRAG * this.v * this.v) * h);
        const nz = P.z - this.v * h;
        // (clear of the chute's own foot first)
        if (nz < END_Z - 0.6 && this.world.collides(P.x, nz, 0.3)) {
          // into something: a bump, and that is the end of it
          this.sound?.thud?.(clamp(this.v / 6, 0.1, 0.8));
          this.v = 0;
        } else P.z = nz;
        P.y = Math.max(LOW * 0.5, this.world.heightAt(P.x, P.z));
        if (this.v < 0.15) {
          this.v = 0;
          this.#next('stand');
          this.#land();
          break;
        }
      }
    }
    this.top = Math.max(this.top, this.v);
    // the hiss of the cardboard on the ice, or the crunch in the snow
    this.hiss -= dt;
    if (this.hiss <= 0 && this.v > 0.5) {
      this.hiss = 0.22;
      if (this.stage === 'down' || this.#mu(P.x, P.z) === MU_ICE) this.sound?.slide?.(this.v);
      else this.sound?.step?.('snow', this.v);
    }
  }

  /** At a standstill: how far from the top of the chute. */
  #land() {
    const d = TOP_Z - this.pos.z;
    this.rides++;
    this.last = d;
    const fresh = d > this.best + 0.05;
    if (fresh) this.best = d;
    this.note = `Slid ${d.toFixed(1)} m from the top${fresh && this.rides > 1 ? ' · a best' : this.rides > 1 ? ` · best ${this.best.toFixed(1)} m` : ''}`;
    this.noteT = 4;
  }

  /** The rider's eyes, with the player's own look about. */
  #view() {
    const p = this.player;
    const P = this.pos;
    p.position.set(P.x, P.y, P.z);
    p.velocity.set(0, 0, 0);
    const cam = this.camera;
    cam.position.set(P.x, P.y + this.eye, P.z);
    cam.rotation.set(0, 0, 0);
    cam.rotateY(p.yaw);
    cam.rotateX(p.pitch);
    // leaning back on the way down, the view tipped with the chute
    if (this.stage === 'down') cam.rotateX(-SLOPE * 0.6);
  }

  #finish() {
    const p = this.player;
    this.active = false;
    this.stage = 'idle';
    p.position.set(this.pos.x, this.world.heightAt(this.pos.x, this.pos.z), this.pos.z);
    p.velocity.set(0, 0, 0);
    p.eye = this.eye;
    p.onGround = true;
    p.enabled = true;
  }

  /** Off the slide at once (back to the title, or the season changed). */
  cancel() {
    if (!this.active) return;
    // anywhere on the stairs, the deck or the chute: back down at the foot
    if (this.stage !== 'out' && this.stage !== 'stand') this.pos = { x: FOOT.x, y: 0, z: FOOT.z };
    this.#finish();
  }
}
