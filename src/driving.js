// Behind the wheel: hands the keyboard to a car, puts the camera on the
// driver's seat (or behind the car, V), and steps you back out on the
// pavement next to the driver's door.
import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { DRIVER_EYE } from './world/vehicles.js';

const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _beam = new THREE.Vector3();

export class Driving {
  constructor({ camera, world, player, sound, env }) {
    this.camera = camera;
    this.world = world;
    this.player = player;
    this.sound = sound;
    this.env = env;
    this.car = null;
    this.chase = false;
    this.chaseYaw = 0;
    this.shake = 0;
    this.chasePos = new THREE.Vector3();
  }

  get active() {
    return !!this.car;
  }

  enter(car) {
    this.car = car;
    car.setDriven(true);
    // the mouse now looks around the cabin, relative to the car's nose
    this.player.yaw = 0;
    this.player.pitch = -0.06;
    this.chasePos.copy(car.toWorld(0, 2.6, -7));
    this.sound.door?.();
    this.sound.engineStart?.();
  }

  /** Steps out on the driver's side (or wherever there is room). Returns
   * false when the car is still rolling or boxed in. */
  exit() {
    const car = this.car;
    if (!car || Math.abs(car.speed) > 1.5) return false;
    car.setDriven(false);
    const spots = [
      [1.45, 0.2],
      [-1.45, 0.2],
      [0, -2.75],
      [0, 2.75],
      [2.2, 0.2],
      [-2.2, 0.2],
    ];
    for (const [lx, lz] of spots) {
      const p = car.toWorld(lx, 0, lz);
      if (this.world.collides(p.x, p.z, 0.42)) continue;
      this.player.teleport(p.x, p.z, car.heading + Math.PI);
      this.player.pitch = -0.05;
      this.car = null;
      this.world.carBeam.light.intensity = 0;
      this.sound.engineStop?.();
      this.sound.door?.();
      return true;
    }
    car.setDriven(true);
    return false;
  }

  toggleView() {
    this.chase = !this.chase;
    this.player.yaw = 0;
  }

  update(dt, keys) {
    const car = this.car;
    if (!car) return;
    const input = {
      throttle: !!keys.forward,
      brake: !!keys.back,
      steer: (keys.left ? 1 : 0) - (keys.right ? 1 : 0),
      handbrake: !!keys.jump,
    };
    car.update(dt, input);
    if (car.impact > 0.5 && this.shake < car.impact) {
      this.sound.thud?.(car.impact);
    }
    this.shake = Math.max(this.shake - dt * 2.5, car.impact);
    this.sound.engineUpdate?.(Math.abs(car.speed), car.throttle);

    // the player rides along: zones, people and audio follow the car
    this.player.position.set(car.x, car.y, car.z);

    // headlights after dusk, a beam that follows the car
    const level = clamp(this.env.cur.lamp * 1.2, 0, 1);
    car.setLights(level > 0.15 ? 1 : 0.15);
    const beam = this.world.carBeam;
    beam.light.intensity = level * 60;
    beam.light.position.copy(car.toWorld(0, 0.75, 2.1, _beam));
    beam.target.position.copy(car.toWorld(0, -0.4, 14, _beam));
    beam.target.updateMatrixWorld();

    const cam = this.camera;
    const p = this.player;
    const jitter = this.shake * 0.03 + Math.min(Math.abs(car.speed) / 23, 1) * 0.0025;
    if (!this.chase) {
      p.yaw = clamp(p.yaw, -1.9, 1.9);
      p.pitch = clamp(p.pitch, -0.7, 0.5);
      car.toWorld(DRIVER_EYE.x, DRIVER_EYE.y, DRIVER_EYE.z, _eye);
      cam.position.copy(_eye);
      cam.position.y += (Math.random() - 0.5) * jitter;
      cam.rotation.set(0, 0, 0);
      cam.rotateY(car.heading + Math.PI + p.yaw);
      cam.rotateX(p.pitch - car.pitch);
      cam.rotateZ(-car.roll * 0.6);
      this.setFov(70, dt);
    } else {
      // chase camera: lags behind the car, orbits with the mouse
      p.pitch = clamp(p.pitch, -0.5, 0.25);
      const a = car.heading + p.yaw;
      const want = _eye.set(car.x - Math.sin(a) * 6.8, car.y + 2.3 - p.pitch * 4, car.z - Math.cos(a) * 6.8);
      const k = 1 - Math.exp(-6 * dt);
      this.chasePos.lerp(want, k);
      cam.position.copy(this.chasePos);
      cam.position.y += (Math.random() - 0.5) * jitter;
      cam.lookAt(_look.set(car.x, car.y + 1.0, car.z));
      this.setFov(64, dt);
    }
  }

  setFov(target, dt) {
    const cam = this.camera;
    const fov = damp(cam.fov, target, 4, dt);
    if (Math.abs(fov - cam.fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
