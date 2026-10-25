// The soda-water machine by the kiosk (автомат газированной воды): drop a
// coin in, 1 kopeck plain or 3 with syrup, and the shared faceted glass in
// the niche fills, fizzing; then it is drunk. Built live, behind the kiosk,
// with its own collider: nothing here draws on the world's seeded stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSignTexture } from './textures.js';

export const PRICE_PLAIN = 1; // kopecks
export const PRICE_SYRUP = 3;
const FILL = 2.6; // s to fill the glass
const DRINK = 1.6; // s to drain it
const AFTER = 2.5; // s the "ahh" stays up

// against the back of the kiosk, facing the courtyard (+z)
const X = 13.2;
const Z = 5.98;
const W = 0.78;
const D = 0.56;
const H = 1.72;

export class Soda {
  constructor({ world, sound }) {
    this.world = world;
    this.sound = sound;
    this.group = new THREE.Group();
    this.group.name = 'soda-machine';
    this.state = 'idle'; // idle → filling → drinking → done → idle
    this.t = 0;
    this.syrup = true;
    this.drunk = 0;
    this.spent = 0;
    this.build();
    this.group.position.set(X, world.heightAt(X, Z), Z);
    world.group.add(this.group);
    // a live collider only: the seeded stream and the historic list stay as they were
    this.rect = { minX: X - W / 2 - 0.05, maxX: X + W / 2 + 0.05, minZ: Z - D / 2 - 0.05, maxZ: Z + D / 2 + 0.16 };
    world.colliders.push(this.rect);
    /** Where you stand to buy, in front of the coin slot. */
    this.stand = new THREE.Vector3(X, 0, Z + D / 2 + 0.75);
  }

  build() {
    const g = this.group;
    const red = new THREE.MeshStandardMaterial({
      color: 0xb8322a,
      roughness: 0.55,
      metalness: 0.25,
    });
    const cream = new THREE.MeshStandardMaterial({
      color: 0xe9e2cf,
      roughness: 0.6,
      metalness: 0.15,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x1d1f22,
      roughness: 0.8,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x9aa0a6,
      roughness: 0.35,
      metalness: 0.8,
    });
    // the cabinet's boxes, merged by material: a handful of draw calls
    const parts = new Map();
    const box = (w, h, d, mat, x, y, z) => {
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    };
    // the cabinet: red below, cream above, on a plinth
    box(W, 0.08, D, dark, 0, 0.04, 0);
    box(W, 1.02, D, red, 0, 0.59, 0);
    box(W, H - 1.1, D, cream, 0, 1.1 + (H - 1.1) / 2, 0);
    box(W + 0.04, 0.05, D + 0.04, red, 0, H + 0.025, 0);
    // the lit sign along the top front
    const signTex = makeSignTexture(512, 128, (c, w, h) => {
      c.fillStyle = '#f3ecd6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#b8322a';
      c.font = 'bold 50px Arial, sans-serif';
      c.fillText('ГАЗИРОВАННАЯ', w / 2, h * 0.36);
      c.font = 'bold 44px Arial, sans-serif';
      c.fillText('ВОДА', w / 2, h * 0.78);
    });
    this.signMat = new THREE.MeshStandardMaterial({
      map: signTex,
      roughness: 0.7,
      emissive: 0xffe6b0,
      emissiveMap: signTex,
      emissiveIntensity: 0,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, 0.2), this.signMat);
    sign.position.set(0, H - 0.16, D / 2 + 0.002);
    g.add(sign);
    // the price plate and the two coin slots
    const priceTex = makeSignTexture(256, 160, (c, w, h) => {
      c.fillStyle = '#efe8d4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#2b2a27';
      c.font = 'bold 26px Arial, sans-serif';
      c.fillText('без сиропа', w * 0.5, h * 0.2);
      c.font = 'bold 34px Arial, sans-serif';
      c.fillText('1 коп.', w * 0.5, h * 0.42);
      c.font = 'bold 26px Arial, sans-serif';
      c.fillText('с сиропом', w * 0.5, h * 0.66);
      c.font = 'bold 34px Arial, sans-serif';
      c.fillText('3 коп.', w * 0.5, h * 0.88);
    });
    const price = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17), new THREE.MeshStandardMaterial({ map: priceTex, roughness: 0.8 }));
    price.position.set(-0.2, 1.36, D / 2 + 0.002);
    g.add(price);
    for (const [y, x] of [
      [1.42, 0.2],
      [1.3, 0.2],
    ]) {
      box(0.09, 0.07, 0.02, steel, x, y, D / 2 + 0.01);
      box(0.03, 0.005, 0.022, dark, x, y + 0.01, D / 2 + 0.012);
    }
    // the niche, with its rinsing grate and the glass
    // (it stands out from the front: N is the niche's depth center)
    const N = D / 2 + 0.07;
    box(0.34, 0.36, 0.01, dark, 0, 0.94, D / 2 + 0.006);
    box(0.36, 0.02, 0.14, steel, 0, 0.77, N);
    box(0.02, 0.38, 0.14, red, -0.18, 0.95, N);
    box(0.02, 0.38, 0.14, red, 0.18, 0.95, N);
    box(0.38, 0.02, 0.14, red, 0, 1.13, N);
    box(0.04, 0.05, 0.04, steel, 0, 1.09, N); // the spout
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdfeef2,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.12, 10, 1, true), glassMat);
    glass.position.set(0, 0.84, N);
    g.add(glass);
    this.liquidMat = new THREE.MeshStandardMaterial({
      color: 0xe0a24a,
      roughness: 0.15,
      transparent: true,
      opacity: 0.75,
    });
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.029, 1, 10), this.liquidMat);
    liquid.position.set(0, 0.785, N);
    liquid.scale.y = 0.001;
    liquid.visible = false;
    g.add(liquid);
    this.liquid = liquid;
    // a stream from the spout while it pours
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.2, 5),
      new THREE.MeshStandardMaterial({
        color: 0xdfeef2,
        transparent: true,
        opacity: 0.6,
      }),
    );
    stream.position.set(0, 0.97, N);
    stream.visible = false;
    g.add(stream);
    this.stream = stream;
    for (const [mat, geos] of parts) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    // snow on the lid in winter
    this.cap = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.05, D + 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.95 }));
    this.cap.position.set(0, H + 0.075, 0);
    this.cap.receiveShadow = true;
    g.add(this.cap);
  }

  /** Can a glass be bought now? */
  get ready() {
    return this.state === 'idle';
  }

  /** In with a coin: true if the machine took it. */
  buy(syrup = true) {
    if (!this.ready) return false;
    this.syrup = syrup;
    this.state = 'filling';
    this.t = 0;
    this.spent += syrup ? PRICE_SYRUP : PRICE_PLAIN;
    this.liquidMat.color.setHex(syrup ? 0xe0a24a : 0xd8ecf2);
    this.liquid.visible = true;
    this.sound?.soda?.(FILL);
    return true;
  }

  get prompt() {
    if (this.state === 'filling') return 'The glass fills, fizzing…';
    if (this.state === 'drinking') return 'Cold and fizzy';
    if (this.state === 'done') return this.syrup ? 'Ahh. Pear syrup.' : 'Ahh.';
    return `E — soda with syrup (${PRICE_SYRUP} kop.) · B — plain (${PRICE_PLAIN} kop.)`;
  }

  /** The fraction of the glass that is full. */
  get level() {
    return this.liquid.visible ? this.liquid.scale.y / 0.1 : 0;
  }

  update(dt, { night = 0, season = 'winter' } = {}) {
    dt = Math.max(0, dt);
    this.signMat.emissiveIntensity = night * 0.9;
    this.cap.visible = season === 'winter';
    if (this.state === 'idle') return;
    this.t += dt;
    if (this.state === 'filling') {
      const f = Math.min(1, this.t / FILL);
      this.liquid.scale.y = 0.1 * Math.max(0.001, f);
      this.liquid.position.y = 0.785 + this.liquid.scale.y / 2;
      this.stream.visible = f < 1;
      if (f >= 1) this.#next('drinking');
    } else if (this.state === 'drinking') {
      const f = Math.min(1, this.t / DRINK);
      this.liquid.scale.y = 0.1 * Math.max(0.001, 1 - f);
      this.liquid.position.y = 0.785 + this.liquid.scale.y / 2;
      if (f >= 1) {
        this.liquid.visible = false;
        this.drunk++;
        this.#next('done');
      }
    } else if (this.state === 'done' && this.t >= AFTER) {
      this.#next('idle');
    }
  }

  #next(state) {
    this.state = state;
    this.t = 0;
    this.stream.visible = false;
    if (state === 'drinking') this.sound?.gulp?.();
  }
}
