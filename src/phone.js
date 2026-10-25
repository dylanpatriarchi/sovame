// The phone box behind the kiosk (таксофон): two kopecks in, and E dials 100,
// the speaking clock. The dial tone, the rotary dial running back, a ring,
// then the exact time read out (in the prompt) over the six pips, and the
// short beeps of a line gone dead. E again, or walking off, hangs up. Built
// live with its own collider: nothing here draws on the world's seeded stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSignTexture } from './textures.js';

export const PRICE = 2; // kopecks
const NUMBER = '100';
const X = 10.4;
const Z = 6.25;
const S = 0.95; // the box is square
const H = 2.3;
const REACH = 2.4; // walk further off and the call is dropped

// the call, step by step: [stage, seconds]
const SCRIPT = [
  ['tone', 1.2],
  ['dial', 0],
  ['ring', 2.2],
  ['time', 6.4],
  ['dead', 1.6],
];

/** How long the rotary dial takes to run back from a digit (0 counts ten). */
const dialTime = (digit) => 0.35 + (digit === 0 ? 10 : digit) * 0.1;

export class Phone {
  constructor({ world, sound, env }) {
    this.world = world;
    this.sound = sound;
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'phone-box';
    this.stage = 'idle';
    this.t = 0;
    this.calls = 0;
    this.spent = 0;
    this.heard = null; // the time read out on the last call
    this.build();
    this.group.position.set(X, world.heightAt(X, Z), Z);
    world.group.add(this.group);
    // a live collider only: the seeded stream and the historic list stay as they were
    this.rect = { minX: X - S / 2 - 0.05, maxX: X + S / 2 + 0.05, minZ: Z - S / 2 - 0.05, maxZ: Z + S / 2 + 0.05 };
    world.colliders.push(this.rect);
    /** Where you stand to call, at the open front (+z). */
    this.stand = new THREE.Vector3(X, 0, Z + S / 2 + 0.6);
  }

  build() {
    const g = this.group;
    const frame = new THREE.MeshStandardMaterial({ color: 0x8f969a, roughness: 0.45, metalness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa9322a, roughness: 0.55, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.6, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xc9dbe3, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
    // the box's parts, merged by material: a handful of draw calls
    const parts = new Map();
    const box = (w, h, d, mat, x, y, z) => {
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    };
    const h = S / 2;
    // four corner posts, a floor plate and the roof with its red band
    for (const x of [-h + 0.03, h - 0.03]) for (const z of [-h + 0.03, h - 0.03]) box(0.06, H, 0.06, frame, x, H / 2, z);
    box(S, 0.06, S, dark, 0, 0.03, 0);
    box(S + 0.06, 0.08, S + 0.06, frame, 0, H + 0.04, 0);
    box(S + 0.02, 0.22, S + 0.02, red, 0, H - 0.13, 0);
    // glazed back and sides, in small panes with rails between
    for (const [w, d, x, z] of [
      [S - 0.08, 0.01, 0, -h + 0.03],
      [0.01, S - 0.08, -h + 0.03, 0],
      [0.01, S - 0.08, h - 0.03, 0],
    ]) {
      box(w, H - 0.5, d, glass, x, 0.25 + (H - 0.5) / 2, z);
      for (const y of [0.25, 1.0, 1.6, H - 0.25]) box(Math.max(w, 0.04), 0.04, Math.max(d, 0.04), frame, x, y, z);
    }
    // the sign over the open front
    const signTex = makeSignTexture(512, 112, (c, w, ht) => {
      c.fillStyle = '#a9322a';
      c.fillRect(0, 0, w, ht);
      c.fillStyle = '#f3ecd6';
      c.font = 'bold 74px Arial, sans-serif';
      c.fillText('ТЕЛЕФОН', w / 2, ht * 0.55);
    });
    this.signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, emissive: 0xffd9a0, emissiveMap: signTex, emissiveIntensity: 0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(S - 0.04, 0.2), this.signMat);
    sign.position.set(0, H - 0.13, h + 0.012);
    g.add(sign);
    // the payphone on the back wall: a grey case, the dial, the handset
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x6c7276, roughness: 0.5, metalness: 0.6 });
    box(0.3, 0.42, 0.14, caseMat, 0, 1.38, -h + 0.11);
    box(0.12, 0.03, 0.02, dark, 0.06, 1.55, -h + 0.19); // the coin slot
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: 0.4 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0, 1.36, -h + 0.19);
    g.add(dial);
    this.dial = dial;
    const handset = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.045), dark);
    handset.add(grip);
    for (const y of [-0.11, 0.11]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 10), dark);
      cup.rotation.x = Math.PI / 2;
      cup.position.set(0, y, 0.02);
      handset.add(cup);
    }
    handset.position.set(-0.19, 1.38, -h + 0.18);
    g.add(handset);
    this.handset = handset;
    this.handsetRest = handset.position.clone();
    // the cord
    box(0.012, 0.3, 0.012, dark, -0.17, 1.15, -h + 0.16);
    // a lamp in the roof, lit at night
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe2a8, emissiveIntensity: 0 });
    box(0.3, 0.02, 0.1, this.lampMat, 0, H - 0.27, 0);
    // snow on the roof in winter
    for (const [mat, geos] of parts) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = mat !== glass && mat !== this.lampMat;
      m.receiveShadow = true;
      g.add(m);
    }
    this.cap = new THREE.Mesh(new THREE.BoxGeometry(S + 0.04, 0.06, S + 0.04), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.95 }));
    this.cap.position.set(0, H + 0.11, 0);
    this.cap.receiveShadow = true;
    g.add(this.cap);
  }

  get busy() {
    return this.stage !== 'idle';
  }

  /** Two kopecks in, the handset up: true if the call started. */
  call() {
    if (this.busy) return false;
    this.spent += PRICE;
    this.calls++;
    this.digit = 0;
    this.#go('tone');
    // in the hand now
    this.handset.position.set(0.3, 1.45, this.handsetRest.z + 0.25);
    this.handset.rotation.z = 0.4;
    return true;
  }

  /** The handset back on its hook. */
  hangUp() {
    if (!this.busy) return;
    this.stage = 'idle';
    this.t = 0;
    this.handset.position.copy(this.handsetRest);
    this.handset.rotation.z = 0;
    this.dial.rotation.y = 0;
    this.sound?.phone?.('hangup');
  }

  /** What the caller hears, for the prompt. */
  get prompt() {
    switch (this.stage) {
      case 'tone':
        return 'A long dial tone…';
      case 'dial':
        return `Dialling ${NUMBER.slice(0, this.digit + 1)}…`;
      case 'ring':
        return 'Ringing…';
      case 'time':
        return `"Moscow time: ${this.heard}" · E — hang up`;
      case 'dead':
        return 'Short beeps · E — hang up';
      default:
        return `E — call the speaking clock, 100 (${PRICE} kop.)`;
    }
  }

  #go(stage) {
    this.stage = stage;
    this.t = 0;
    if (stage === 'time') {
      const m = Math.round(this.env?.cur?.clockMinutes ?? 0) % 1440;
      this.heard = `${Math.floor(m / 60)} hours ${m % 60} minutes`;
    }
    if (stage === 'dial') this.sound?.phone?.('dial', dialTime(+NUMBER[this.digit]), +NUMBER[this.digit]);
    else this.sound?.phone?.(stage);
  }

  update(dt, { player = null, night = 0, season = 'winter' } = {}) {
    dt = Math.max(0, dt);
    this.signMat.emissiveIntensity = night * 0.9;
    this.lampMat.emissiveIntensity = night * 1.4;
    this.cap.visible = season === 'winter';
    if (!this.busy) return;
    // walked off with the call still on: the handset swings back
    if (player && Math.hypot(player.x - this.stand.x, player.z - this.stand.z) > REACH) {
      this.hangUp();
      return;
    }
    this.t += dt;
    if (this.stage === 'dial') {
      const len = dialTime(+NUMBER[this.digit]);
      // pulled round, then running back
      this.dial.rotation.y = -Math.sin(Math.min(1, this.t / len) * Math.PI) * 1.6;
      if (this.t >= len) {
        this.digit++;
        if (this.digit < NUMBER.length) this.#go('dial');
        else this.#go('ring');
      }
      return;
    }
    const i = SCRIPT.findIndex(([s]) => s === this.stage);
    if (this.t >= SCRIPT[i][1]) {
      if (i + 1 < SCRIPT.length) this.#go(SCRIPT[i + 1][0]);
      else this.hangUp();
    }
  }
}
