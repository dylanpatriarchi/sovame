import * as THREE from 'three';
import { RIDE_EYE, DOOR_SPOTS } from './world/bus.js';

/* Riding the bus: while it stands at a stop with its doors open, E by a
 * door gets you on and sits you by the window; the mouse looks round the
 * saloon (relative to the bus), the bus goes on round its route, and E at
 * any stop with the doors open gets you off on the kerb by the rear door. */

const REACH = 1.9; // how close to a door's kerbside spot you must stand
const _v = new THREE.Vector3();

export class BusRide {
  constructor({ world, player, camera, sound }) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.sound = sound;
    this.active = false;
    this.boardedAt = null;
    this.rides = 0;
  }

  get bus() {
    return this.world.bus;
  }

  /** The call the bus is making: { state, stop } (null without traffic). */
  get call() {
    return this.world.traffic?.busState?.() ?? null;
  }

  /** Standing at a stop with its doors (nearly) open. */
  get open() {
    const call = this.call;
    return !!call && call.state === 'dwell' && this.bus.doors > 0.6;
  }

  /** The distance from a standing player to the nearest door, while you may board. */
  distanceTo(x, z) {
    if (this.active || !this.bus || !this.open) return Infinity;
    let best = Infinity;
    for (const spot of DOOR_SPOTS) {
      const p = this.bus.toWorld(spot, _v);
      best = Math.min(best, Math.hypot(p.x - x, p.z - z));
    }
    return best;
  }

  get reach() {
    return REACH;
  }

  board() {
    if (this.active || !this.open) return false;
    this.active = true;
    this.boardedAt = this.call.stop?.name ?? null;
    this.rides++;
    const player = this.player;
    player.enabled = false;
    player.velocity.set(0, 0, 0);
    // facing the way the bus goes, glancing out of the window
    player.yaw = 0.25;
    player.pitch = -0.05;
    this.sound.ui?.('tick');
    this.update();
    return true;
  }

  /** Off at the kerb outside a door (or wherever there is room); only at a
   * stop with the doors open, unless `force` (back to the title). */
  getOff(force = false) {
    if (!this.active) return false;
    if (!force && !this.open) return false;
    const bus = this.bus;
    const player = this.player;
    let spot = null;
    for (const door of [DOOR_SPOTS[1], DOOR_SPOTS[0]]) {
      for (const out of [0, 0.5, 1.0]) {
        const p = bus.toWorld(_v.set(door.x - out, 0, door.z), new THREE.Vector3());
        if (!this.world.collides(p.x, p.z, 0.35)) {
          spot = p;
          break;
        }
      }
      if (spot) break;
    }
    spot ??= bus.toWorld(_v.set(DOOR_SPOTS[1].x - 1.5, 0, DOOR_SPOTS[1].z), new THREE.Vector3());
    this.active = false;
    // facing out, away from the bus
    player.teleport(spot.x, spot.z, bus.heading + Math.PI / 2);
    player.pitch = -0.04;
    player.enabled = true;
    this.sound.ui?.('tick');
    return true;
  }

  get prompt() {
    if (!this.active) return null;
    const call = this.call;
    const name = call?.stop?.name ?? '';
    if (this.open) return `${name} · E — get off`;
    return call?.state === 'dwell' ? `${name} · the doors are shutting` : `Bus 31 · next stop: ${name}`;
  }

  /** Puts the camera in the seat (after the traffic has moved the bus). */
  update() {
    if (!this.active) return;
    const bus = this.bus;
    const eye = bus.toWorld(RIDE_EYE, _v);
    const player = this.player;
    // the feet go with the seat, for everything listening for the player
    player.position.set(eye.x, this.world.heightAt(eye.x, eye.z), eye.z);
    player.velocity.set(0, 0, 0);
    const cam = this.camera;
    cam.position.copy(eye);
    cam.rotation.set(0, 0, 0);
    // the bus's nose is its local +z; the camera looks down its own -z
    cam.rotateY(bus.heading + Math.PI + player.yaw);
    cam.rotateX(player.pitch);
    // the saloon dips and leans with the body
    cam.rotateZ(-bus.roll * 0.8);
  }
}
