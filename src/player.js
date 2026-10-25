// First-person controls: walking, sprinting, jumping, collisions, footprints.
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';
import { PLAYER } from './config.js';
import { makeFootprintTexture } from './textures.js';

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  KeyE: 'use',
};

export class Player {
  constructor({ camera, world, domElement, settings = {} }) {
    this.camera = camera;
    this.world = world;
    this.dom = domElement;
    this.settings = settings;
    this.position = new THREE.Vector3(PLAYER.spawn.x, 0, PLAYER.spawn.z);
    this.velocity = new THREE.Vector3();
    this.yaw = PLAYER.spawnYaw;
    this.pitch = -0.02;
    this.eye = PLAYER.eyeHeight;
    this.eyeTarget = PLAYER.eyeHeight;
    this.onGround = true;
    this.crouching = false;
    this.speed = 0;
    this.bob = 0;
    this.stepAccumulator = 0;
    this.sprinting = false;
    this.keys = {};
    this.locked = false;
    this.enabled = false;
    this.sensitivity = settings.sensitivity ?? 1;
    this.invertY = settings.invertY ?? false;
    this.surface = 'snow';
    this.moving = false;
    this.distanceWalked = 0;
    this.onStep = null;
    this.onFootprint = null;
    this.onJump = null;
    this.onLand = null;
    this.fovBase = 68;
    this.fovTarget = 68;
    this.shake = 0;
    this.onIce = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideSway = 0;
    this.onSlide = null;
    this.eyeOverride = null; // seated eye height during a smoke break
    this.buildFootprints();
    this.bind();
  }

  /* --------------------------------------------------------- footprints */

  buildFootprints() {
    const geo = new THREE.PlaneGeometry(0.24, 0.4);
    geo.rotateX(-Math.PI / 2);
    this.footprintMat = new THREE.MeshStandardMaterial({
      map: makeFootprintTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      color: 0x9dafc4,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const max = 260;
    this.footprints = new THREE.InstancedMesh(geo, this.footprintMat, max);
    this.footprints.frustumCulled = false;
    this.footprints.receiveShadow = true;
    this.footprints.count = max;
    this.footprintIndex = 0;
    this.footprintMax = max;
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -10, 0);
    dummy.updateMatrix();
    for (let i = 0; i < max; i++) this.footprints.setMatrixAt(i, dummy.matrix);
    this.footprints.instanceMatrix.needsUpdate = true;
    this.footprintDummy = new THREE.Object3D();
    this.stepSide = 1;
  }

  /** Shows/hides the footprints and changes their color by surface. */
  setFootprintStyle(surface, season) {
    this.footprintMat.visible = surface !== 'ice';
    if (season === 'winter') {
      this.footprintMat.color.setHex(surface === 'snow' ? 0x9fb2c8 : 0xa9b6c4);
      this.footprintMat.opacity = surface === 'snow' ? 0.85 : 0.5;
    } else {
      this.footprintMat.color.setHex(surface === 'snow' ? 0x776c5c : 0x6b635a);
      this.footprintMat.opacity = surface === 'snow' ? 0.55 : 0.35;
    }
  }

  placeFootprint(x, z, yaw) {
    // no snow to mark inside a stairwell: footprints pause indoors
    if (this.world.interiorAt(x, z)) return;
    const side = this.stepSide;
    this.stepSide *= -1;
    const ox = Math.cos(yaw) * 0.14 * side;
    const oz = -Math.sin(yaw) * 0.14 * side;
    this.footprintDummy.position.set(x + ox, this.world.heightAt(x, z) + 0.06, z + oz);
    this.footprintDummy.rotation.y = yaw + (Math.random() - 0.5) * 0.25;
    this.footprintDummy.scale.setScalar(0.95 + Math.random() * 0.2);
    this.footprintDummy.updateMatrix();
    this.footprints.setMatrixAt(this.footprintIndex, this.footprintDummy.matrix);
    this.footprints.instanceMatrix.needsUpdate = true;
    this.footprintIndex = (this.footprintIndex + 1) % this.footprintMax;
  }

  /* --------------------------------------------------------- input */

  bind() {
    this.onKeyDown = (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      this.keys[action] = true;
      if (action === 'jump' && this.enabled) e.preventDefault();
    };
    this.onKeyUp = (e) => {
      const action = KEY_MAP[e.code];
      if (action) this.keys[action] = false;
    };
    this.onMouseMove = (e) => {
      if (!this.locked) return;
      const s = 0.0022 * this.sensitivity;
      this.yaw -= e.movementX * s;
      this.pitch -= (e.movementY * s) * (this.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.35, 1.3);
    };
    this.onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  requestLock() {
    // newer browsers return a promise: a refusal is handled by the
    // pointerlockerror retry in main.js, so don't let it surface as uncaught
    if (this.dom.requestPointerLock) this.dom.requestPointerLock()?.catch?.(() => {});
  }

  releaseLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  setSensitivity(value) {
    this.sensitivity = value;
  }

  /* --------------------------------------------------------- update */

  update(dt) {
    const keys = this.enabled ? this.keys : {};
    const wish = new THREE.Vector3(
      (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      0,
      (keys.back ? 1 : 0) - (keys.forward ? 1 : 0)
    );
    const wishLen = wish.length();
    if (wishLen > 0) wish.divideScalar(wishLen);

    this.crouching = !!keys.crouch;
    this.sprinting = !!keys.sprint && !this.crouching && wishLen > 0;
    const targetSpeed = this.crouching ? PLAYER.crouchSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    // world-space direction (camera is -Z forward: dir = R_y(yaw) * wish)
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dirX = wish.x * cos + wish.z * sin;
    const dirZ = -wish.x * sin + wish.z * cos;

    // on winter ice the boots hardly grip: speed builds slowly, and a run
    // carries on into a long slide once you let go
    this.onIce = this.world.season === 'winter' && this.world.surfaceAt(this.position.x, this.position.z) === 'ice';
    const grip = !this.onGround ? 0.35 : this.onIce ? (wishLen > 0 ? 0.16 : 0.07) : 1;
    const accel = PLAYER.accel * grip;
    this.velocity.x = damp(this.velocity.x, dirX * targetSpeed, accel, dt);
    this.velocity.z = damp(this.velocity.z, dirZ * targetSpeed, accel, dt);

    // jump and gravity
    if (keys.jump && this.onGround && !this.crouching) {
      this.velocity.y = PLAYER.jumpSpeed;
      this.onGround = false;
      if (this.onJump) this.onJump();
    }
    this.velocity.y -= PLAYER.gravity * dt;

    // movement with collisions solved separately on the two axes
    const r = PLAYER.radius;
    let nx = this.position.x + this.velocity.x * dt;
    if (!this.world.collides(nx, this.position.z, r)) this.position.x = nx;
    else this.velocity.x *= 0.2;
    let nz = this.position.z + this.velocity.z * dt;
    if (!this.world.collides(this.position.x, nz, r)) this.position.z = nz;
    else this.velocity.z *= 0.2;

    // terrain height
    const groundY = this.world.heightAt(this.position.x, this.position.z);
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= groundY) {
      if (!this.onGround) {
        const impact = clamp(-this.velocity.y / 8, 0, 1);
        if (this.onLand) this.onLand(impact);
      }
      this.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // actual speed and head bobbing
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = horizontal;
    this.moving = horizontal > 0.35;
    this.sliding = this.onIce && this.onGround && wishLen === 0 && horizontal > 1.2;
    if (this.sliding) {
      // no steps while gliding, just the soles hissing on the ice
      this.slideT -= dt;
      if (this.slideT <= 0) {
        this.slideT = 0.45;
        if (this.onSlide) this.onSlide(horizontal);
      }
      this.bob += dt * 1.2;
    } else if (this.moving) {
      this.bob += dt * (this.sprinting ? 12.5 : 8.6);
      this.stepAccumulator += horizontal * dt;
      if (this.stepAccumulator > PLAYER.stepDistance) {
        this.stepAccumulator = 0;
        this.surface = this.world.surfaceAt(this.position.x, this.position.z);
        this.distanceWalked += PLAYER.stepDistance;
        if (this.onStep) this.onStep(this.surface, horizontal);
        this.placeFootprint(this.position.x, this.position.z, this.yaw);
      }
    } else {
      this.bob += dt * 1.2;
    }

    // eye height (crouched) and breathing
    this.eyeTarget = this.eyeOverride ?? (this.crouching ? PLAYER.crouchHeight : PLAYER.eyeHeight);
    this.eye = damp(this.eye, this.eyeTarget, 9, dt);
    const bobAmount = clamp(horizontal / PLAYER.walkSpeed, 0, 1.4);
    const bobY = Math.sin(this.bob * 2) * 0.035 * bobAmount;
    const bobX = Math.sin(this.bob) * 0.026 * bobAmount;
    const breathe = Math.sin(this.bob * 0.5) * 0.008;
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // camera
    const cam = this.camera;
    cam.position.set(this.position.x + bobX * Math.cos(this.yaw), this.position.y + this.eye + bobY + breathe, this.position.z - bobX * Math.sin(this.yaw));
    cam.rotation.set(0, 0, 0);
    cam.rotateY(this.yaw);
    cam.rotateX(this.pitch);
    // arms out on a slide: the view sways a little
    this.slideSway = damp(this.slideSway, this.sliding ? Math.sin(this.bob * 1.7) * 0.025 : 0, 4, dt);
    cam.rotateZ(Math.sin(this.bob) * 0.008 * bobAmount + this.shake * 0.02 + this.slideSway);

    // dynamic FOV
    this.fovTarget = this.fovBase + (this.sprinting ? 7 : 0) - (this.crouching ? 2 : 0);
    const fov = damp(cam.fov, this.fovTarget, 6, dt);
    if (Math.abs(fov - cam.fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  teleport(x, z, yaw) {
    this.position.set(x, this.world.heightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
  }

  /** Horizontal look direction (for audio and interactions). */
  get forwardVector() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}
