// The kettle on the kitchen stove: E lights the gas under it, a ring of blue
// flame, and after a while it steams and whistles until it is taken off and
// a glass of tea is poured. Each flat's kettle keeps its own heat (it cools
// again off the gas); the flame, the steam and the sound are only for the
// flat you are in. Live only: its own Rng, nothing on the seeded stream.
import * as THREE from 'three';
import { Rng, clamp } from './util.js';
import { makeSoftCircleTexture } from './textures.js';
import { INTERIOR_LAYER } from './world/interiors.js';

const HEAT = 24; // seconds on the gas from cold to the boil
const COOL = 150; // and from the boil back to cold, off it
const STEAM_FROM = 0.6; // it starts to breathe steam at this heat
const PUFFS = 12;
const LIFE = 1.8; // a puff of steam, seconds
const NOTE = 3.5;
const TEAS = [
  'A glass of tea in a подстаканник',
  'Strong tea, three sugars',
  'Tea with a slice of lemon',
  'Tea and a spoon of jam from the jar',
  'Weak tea: the leaves are nearly gone',
];

export class Kettle {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.rng = new Rng(4417);
    this.state = new Map(); // flat id -> { on, heat }
    this.teas = 0;
    this.note = null;
    this.noteT = 0;
    this.here = null; // the flat whose kettle is shown and heard
    this.flicker = 0;

    // a ring of blue gas flame licking round the kettle's bottom
    this.flame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.115, 0.03, 22, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.12, 0.32, 1.7),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.flame.name = 'kettle-flame';
    this.flame.visible = false;
    this.flame.layers.set(INTERIOR_LAYER);
    world.group.add(this.flame);

    const tex = makeSoftCircleTexture(64, '245,246,248', 1.8);
    this.steam = new THREE.Group();
    this.steam.name = 'kettle-steam';
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.layers.set(INTERIOR_LAYER);
      s.visible = false;
      this.steam.add(s);
      this.puffs.push({ sprite: s, age: LIFE, vx: 0, vz: 0 });
    }
    this.steam.layers.set(INTERIOR_LAYER);
    world.group.add(this.steam);
    this.nextPuff = 0;
  }

  #of(flat) {
    let k = this.state.get(flat.id);
    if (!k) {
      k = { on: false, heat: 0 };
      this.state.set(flat.id, k);
    }
    return k;
  }

  /** On the gas, and how hot (0..1). */
  status(flat) {
    const k = this.#of(flat);
    return { on: k.on, heat: k.heat, boiling: k.on && k.heat >= 1 };
  }

  prompt(flat) {
    const k = this.#of(flat);
    if (!k.on) return 'E — put the kettle on';
    if (k.heat >= 1) return 'E — take the kettle off and pour the tea';
    return 'E — turn the gas off';
  }

  /** E at the stove. */
  use(flat) {
    const k = this.#of(flat);
    if (!k.on) {
      k.on = true;
      this.sound?.lighter?.();
      return;
    }
    k.on = false;
    this.sound?.ui?.('tick');
    if (k.heat >= 1) {
      this.teas++;
      this.#say(TEAS[(this.teas - 1) % TEAS.length]);
      this.sound?.gulp?.();
    }
  }

  #say(text) {
    this.note = text;
    this.noteT = NOTE;
  }

  /** Every frame, with the flat the player is in (or null). */
  update(dt, flat) {
    dt = Math.max(0, dt);
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    for (const k of this.state.values()) k.heat = clamp(k.heat + (k.on ? dt / HEAT : -dt / COOL), 0, 1);
    const here = flat?.kettle ? flat : null;
    this.here = here;
    const k = here ? this.#of(here) : null;
    const pos = here?.kettle;

    // the flame
    this.flame.visible = !!(k && k.on);
    if (this.flame.visible) {
      this.flicker += dt;
      this.flame.position.set(pos.x, pos.y - 0.095, pos.z);
      const s = 1 + Math.sin(this.flicker * 31) * 0.04 + Math.sin(this.flicker * 17.3) * 0.03;
      this.flame.scale.set(s, 1 + Math.sin(this.flicker * 23) * 0.25, s);
    }

    // the steam: a wisp as it warms, a plume at the boil, a breath as it cools
    const strength = k ? clamp((k.heat - STEAM_FROM) / (1 - STEAM_FROM), 0, 1) * (k.on ? 1 : 0.35) : 0;
    this.nextPuff -= dt;
    if (strength > 0.02 && this.nextPuff <= 0) {
      this.nextPuff = 0.6 - 0.45 * strength;
      const p = this.puffs.find((q) => q.age >= LIFE);
      if (p) {
        p.age = 0;
        p.strength = strength;
        p.vx = this.rng.float(-0.05, 0.05) + 0.1 * strength;
        p.vz = this.rng.float(-0.05, 0.05);
        p.sprite.position.set(pos.x + 0.21, pos.y + 0.08, pos.z); // the spout
        p.sprite.visible = true;
      }
    }
    for (const p of this.puffs) {
      if (p.age >= LIFE) continue;
      p.age += dt;
      const t = p.age / LIFE;
      if (t >= 1 || !here) {
        p.age = LIFE;
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vz * dt;
      p.sprite.position.y += (0.35 + 0.2 * p.strength) * dt;
      p.sprite.scale.setScalar(0.08 + 0.35 * t);
      p.sprite.material.opacity = 0.42 * p.strength * Math.sin(Math.PI * t) * (1 - t * 0.4);
    }

    // the gas and the whistle, for the flat you are in
    const whistle = k && k.on ? clamp((k.heat - 0.93) / 0.07, 0, 1) : 0;
    this.sound?.kettle?.({ gas: k && k.on ? 1 : 0, boil: k && k.on ? clamp((k.heat - 0.5) / 0.5, 0, 1) : 0, whistle });
  }

  cancel() {
    for (const k of this.state.values()) k.on = false;
    this.update(0, null);
  }
}
