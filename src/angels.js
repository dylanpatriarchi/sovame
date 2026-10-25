// Snow angels: in winter, on open snow, look up at the sky and E lets you
// fall back into the snow. Lie there and watch it come down, arms and legs
// sweeping on their own; E gets you up again, and the angel stays pressed in
// the snow behind you (the last few of them, and only while winter lasts).
import * as THREE from 'three';
import { makeCanvas } from './util.js';

const LOOK_UP = 0.5; // pitch needed to be offered a lie-down
const BODY = 1.9; // m from heels to the top of the head, lying
const SPAN = 1.6; // wing tip to wing tip
const FALL = 0.8; // s to go down (and to get back up)
const EYE = 0.22; // eyes above the snow, lying
const SWEEP = 1.1; // s for each sweep of arms and legs
const MAX = 8; // angels kept in the snow
const GET_UP = 1.2; // s before E gets you up again

/** The imprint: a head, a body, two fanned wings and the legs' fan. */
function makeAngelTexture(w = 256, h = 320) {
  const canvas = makeCanvas(w, h);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.filter = 'blur(2.5px)';
  const shapes = [];
  const fan = (cx, cy, r, a0, a1) =>
    shapes.push(() => {
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, r, a0, a1);
      c.closePath();
    });
  // the wings: each arm swept from straight out to over the head, with the
  // head left clear between them; the legs swept apart from the hips
  fan(w * 0.5, h * 0.3, w * 0.5, Math.PI * 0.97, Math.PI * 1.4);
  fan(w * 0.5, h * 0.3, w * 0.5, Math.PI * 1.6, Math.PI * 2.03);
  fan(w * 0.5, h * 0.56, h * 0.42, Math.PI * 0.33, Math.PI * 0.67);
  // body and head
  shapes.push(() => {
    c.beginPath();
    c.ellipse(w * 0.5, h * 0.45, w * 0.13, h * 0.2, 0, 0, Math.PI * 2);
  });
  shapes.push(() => {
    c.beginPath();
    c.arc(w * 0.5, h * 0.15, w * 0.085, 0, Math.PI * 2);
  });
  // pressed hollows, then the ridges of snow pushed up round their edges
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (const shape of shapes) {
    shape();
    c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 5;
  for (const shape of shapes) {
    shape();
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Angels {
  constructor({ world, player, sound }) {
    this.world = world;
    this.player = player;
    this.sound = sound;
    this.active = false;
    this.stage = 'idle'; // falling → lying → rising
    this.t = 0;
    this.sweeps = 0;
    this.made = 0;
    this.material = new THREE.MeshStandardMaterial({
      map: makeAngelTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      color: 0x9fb2c8,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.geometry = new THREE.PlaneGeometry(SPAN, BODY);
    this.geometry.rotateX(-Math.PI / 2);
    this.group = new THREE.Group();
    this.group.name = 'snow-angels';
    world.group.add(this.group);
    this.list = [];
  }

  /** Where the body would lie: the heels where you stand, the head behind
   * you. Null if it is not winter, not open level snow, or not clear. */
  spotFor(pos, forward, pitch) {
    if (this.world.season !== 'winter' || pitch < LOOK_UP) return null;
    const len = Math.hypot(forward.x, forward.z) || 1;
    const fx = forward.x / len;
    const fz = forward.z / len;
    const cx = pos.x - fx * (BODY / 2);
    const cz = pos.z - fz * (BODY / 2);
    const hx = pos.x - fx * BODY;
    const hz = pos.z - fz * BODY;
    const ground = this.world.heightAt(pos.x, pos.z);
    for (const [x, z] of [
      [pos.x, pos.z],
      [cx, cz],
      [hx, hz],
    ]) {
      if (this.world.surfaceAt(x, z) !== 'snow') return null;
      if (Math.abs(this.world.heightAt(x, z) - ground) > 0.05) return null;
      if (this.world.interiorAt?.(x, z)) return null;
    }
    if (this.world.collides(cx, cz, SPAN / 2 + 0.1)) return null;
    if (this.world.trafficCars?.some((c) => Math.hypot(c.x - cx, c.z - cz) < 3.5)) return null;
    return { x: pos.x, z: pos.z, cx, cz, hx, hz, yaw: Math.atan2(fx, fz) };
  }

  /** Falls back into the snow. */
  lie(spot) {
    if (this.active) return;
    this.active = true;
    this.spot = spot;
    this.stage = 'falling';
    this.t = 0;
    this.sweeps = 0;
    const p = this.player;
    p.enabled = false;
    p.velocity.set(0, 0, 0);
    p.eyeOverride = EYE;
    this.pitch0 = p.pitch;
  }

  /** Back on your feet (once you have lain there a moment). */
  getUp() {
    if (this.stage !== 'lying' || this.t < GET_UP) return false;
    this.stage = 'rising';
    this.t = 0;
    this.#stamp();
    this.player.eyeOverride = null;
    return true;
  }

  get canGetUp() {
    return this.stage === 'lying' && this.t >= GET_UP;
  }

  get prompt() {
    if (this.stage === 'lying') return this.t >= GET_UP ? 'E — get up' : null;
    return null;
  }

  /** The angel pressed into the snow, left behind as you get up. */
  #stamp() {
    let mesh = this.list.length >= MAX ? this.list.shift() : null;
    if (!mesh) {
      mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    const s = this.spot;
    mesh.position.set(s.cx, this.world.heightAt(s.cx, s.cz) + 0.065, s.cz);
    // the head lies away from where you stood
    mesh.rotation.y = s.yaw;
    this.list.push(mesh);
    this.made++;
  }

  update(dt) {
    dt = Math.max(0, dt);
    this.group.visible = this.world.season === 'winter';
    if (!this.active) return;
    this.t += dt;
    const p = this.player;
    const s = this.spot;
    const ground = this.world.heightAt(s.x, s.z);
    if (this.stage === 'falling') {
      const k = Math.min(1, this.t / FALL);
      const e = k * k * (3 - 2 * k);
      p.position.set(s.x + (s.hx - s.x) * e, ground, s.z + (s.hz - s.z) * e);
      p.pitch = this.pitch0 + (1.25 - this.pitch0) * e;
      if (k >= 1) {
        this.stage = 'lying';
        this.t = 0;
        this.sound?.land?.(0.55);
      }
    } else if (this.stage === 'lying') {
      p.position.set(s.hx, ground, s.hz);
      // arms and legs sweep the snow, a few times
      if (this.sweeps < 3 && this.t > 0.4 + this.sweeps * SWEEP) {
        this.sweeps++;
        this.sound?.swish?.();
      }
    } else if (this.stage === 'rising') {
      const k = Math.min(1, this.t / FALL);
      const e = k * k * (3 - 2 * k);
      p.position.set(s.hx + (s.x - s.hx) * e, ground, s.hz + (s.z - s.hz) * e);
      p.pitch = 1.25 + (0.1 - 1.25) * e;
      if (k >= 1) {
        this.active = false;
        this.stage = 'idle';
        p.enabled = true;
      }
    }
    p.velocity.set(0, 0, 0);
  }

  /** Straight back on your feet, no fuss (leaving for the title screen). */
  cancel() {
    if (!this.active) return;
    this.active = false;
    this.stage = 'idle';
    this.player.eyeOverride = null;
    this.player.teleport(this.spot.x, this.spot.z, this.player.yaw);
  }

  /** Clears every angel (a thaw). */
  clear() {
    for (const m of this.list) this.group.remove(m);
    this.list.length = 0;
  }
}
