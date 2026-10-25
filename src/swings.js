import * as THREE from "three";
import { clamp } from "./util.js";

/* The playground swings, ridden: E sits you on the plank, W pumps on the
 * way forward and S on the way back (or just keep W down and lean into it),
 * E gets you off. A swing let go keeps going on its own pendulum until it
 * settles, then the wind has it again (see makeSwing in world/props.js). */

const ARM = 2.05; // pivot to the rider's center of mass, m
const GRAVITY = 9.81;
const PUMP = 0.62; // rad/s² while leaning into the swing
const MAX = 0.95; // about 55°: the rods don't go any higher
const DAMP_RIDDEN = 0.08;
const DAMP_EMPTY = 0.3;
const SEAT_Y = -1.85;
const EYE = 0.74; // eyes above the plank, sitting
const REACH = 2.2; // the frame's collider keeps you ~1.6 m off
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Swings {
  constructor({ world, player, camera, sound }) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.sound = sound;
    /** Every plank, with its own pendulum: angle `a` (positive swings the
     * seat out along the frame's +z), angular speed `w`. */
    this.seats = (world.swingSeats ?? []).map((s, i) => ({
      id: i,
      ...s,
      a: 0,
      w: 0,
      moving: false,
    }));
    this.active = null;
    this.peak = 0; // the last turning point reached, rad
  }

  /** The seat's ground spot and its facing, in world space. */
  seatPose(seat, out = new THREE.Vector3()) {
    seat.pivot.updateWorldMatrix(true, false);
    return seat.pivot.localToWorld(out.set(0, SEAT_Y, 0));
  }

  /** World direction the rider faces (the frame's +z). */
  facing(seat, out = new THREE.Vector3()) {
    seat.swingGroup.updateWorldMatrix(true, false);
    out.setFromMatrixColumn(seat.swingGroup.matrixWorld, 2);
    out.y = 0;
    return out.normalize();
  }

  /** Where the plank hangs at rest: right under its pivot, in world space. */
  restSpot(seat, out = new THREE.Vector3()) {
    seat.pivot.updateWorldMatrix(true, false);
    return seat.pivot.getWorldPosition(out);
  }

  /** The nearest plank within reach of a standing player (measured from
   * where it hangs at rest, so a plank stirring in the wind doesn't count). */
  near(x, z) {
    let best = null;
    let bestD = REACH;
    for (const seat of this.seats) {
      const p = this.restSpot(seat, _v);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = seat;
      }
    }
    return best;
  }

  distanceTo(x, z) {
    const seat = this.near(x, z);
    if (!seat) return Infinity;
    const p = this.restSpot(seat, _v);
    return Math.hypot(p.x - x, p.z - z);
  }

  sit(seat) {
    if (this.active) return;
    this.active = seat;
    seat.moving = true;
    seat.pivot.userData.swinging = true;
    // pick the plank up where the wind left it
    seat.a = -seat.pivot.rotation.x;
    seat.w = 0;
    this.peak = Math.abs(seat.a);
    const f = this.facing(seat, _axis);
    const p = this.seatPose(seat, _v);
    this.player.teleport(p.x, p.z, Math.atan2(-f.x, -f.z));
    this.player.pitch = -0.08;
    this.player.enabled = false;
  }

  /** Off the plank: a step out in front, carrying some of the swing's speed
   * when you jump off on the way forward. */
  getOff() {
    const seat = this.active;
    if (!seat) return;
    this.active = null;
    const f = this.facing(seat, new THREE.Vector3());
    seat.pivot.updateWorldMatrix(true, false);
    const pivot = seat.pivot.getWorldPosition(new THREE.Vector3());
    // the ground in front of the frame, clear of its collider; behind if not
    let spot = null;
    for (const dir of [1, -1]) {
      for (const out of [1.9, 2.2, 2.6]) {
        const x = pivot.x + f.x * out * dir;
        const z = pivot.z + f.z * out * dir;
        if (!this.world.collides(x, z, 0.3)) {
          spot = { x, z, dir };
          break;
        }
      }
      if (spot) break;
    }
    const player = this.player;
    if (spot) player.teleport(spot.x, spot.z, player.yaw);
    // a leap off on the forward swing carries on a little
    const fwd = seat.w * ARM * Math.cos(seat.a);
    if (spot?.dir === 1 && fwd > 0.5) {
      const v = Math.min(fwd * 0.7, 4.5);
      player.velocity.set(f.x * v, Math.min(3, v * 0.6), f.z * v);
      player.onGround = false;
    }
    player.enabled = true;
  }

  /** Steps every moving plank; with a rider, puts the camera on it. */
  update(dt, keys = {}) {
    dt = Math.max(0, dt);
    const n = dt > 0 ? Math.ceil(dt / 0.01) : 0;
    for (const seat of this.seats) {
      if (!seat.moving) continue;
      const ridden = seat === this.active;
      for (let i = 0; i < n; i++) {
        const h = dt / n;
        let acc =
          -(GRAVITY / ARM) * Math.sin(seat.a) -
          (ridden ? DAMP_RIDDEN : DAMP_EMPTY) * seat.w;
        if (ridden) {
          // lean into it: W on the way forward, S on the way back
          const forward = seat.w >= 0;
          if ((keys.forward && forward) || (keys.back && !forward))
            acc += PUMP * (forward ? 1 : -1) * Math.cos(seat.a);
        }
        // the rods are only so long before the chains go slack: soften
        if (Math.abs(seat.a) > MAX * 0.85)
          acc -= Math.sign(seat.a) * (Math.abs(seat.a) - MAX * 0.85) * 40;
        const before = seat.w;
        seat.w += acc * h;
        seat.a = clamp(seat.a + seat.w * h, -MAX, MAX);
        // a turning point: the pivot squeals
        if (before !== 0 && Math.sign(before) !== Math.sign(seat.w))
          this.#turn(seat, ridden);
      }
      seat.pivot.rotation.x = -seat.a;
      // let go and settled: back to the wind
      if (!ridden && Math.abs(seat.a) < 0.02 && Math.abs(seat.w) < 0.05) {
        seat.moving = false;
        seat.pivot.userData.swinging = false;
        seat.a = 0;
        seat.w = 0;
      }
    }
    if (this.active) this.#ride();
  }

  #turn(seat, ridden) {
    const amp = Math.abs(seat.a);
    if (ridden) this.peak = amp;
    if (amp < 0.12 || !this.sound?.ready) return;
    const p = this.seatPose(seat, _v);
    const d = ridden
      ? 0
      : Math.hypot(p.x - this.player.position.x, p.z - this.player.position.z);
    this.sound.creak(amp / MAX, d);
  }

  /** The rider's view: eyes above the plank, the head tipped with the swing. */
  #ride() {
    const seat = this.active;
    const player = this.player;
    const p = this.seatPose(seat, _v);
    // feet go where the plank is, for everything listening for the player
    player.position.set(p.x, this.world.heightAt(p.x, p.z), p.z);
    player.velocity.set(0, 0, 0);
    const eye = seat.pivot.localToWorld(_v.set(0, SEAT_Y + EYE, 0.04));
    const cam = this.camera;
    cam.position.copy(eye);
    cam.rotation.set(0, 0, 0);
    cam.rotateY(player.yaw);
    cam.rotateX(player.pitch);
    // tip the view about the bar
    _axis.setFromMatrixColumn(seat.swingGroup.matrixWorld, 0).normalize();
    _q.setFromAxisAngle(_axis, -seat.a * 0.55);
    cam.quaternion.premultiply(_q);
  }

  /** How high the swing is going, 0..1 (for the prompt and the tests). */
  get height() {
    return this.active ? this.peak / MAX : 0;
  }
}
