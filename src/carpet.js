// The carpet-beating frame by the playground (выбивалка): a rug hangs over
// one bay, and E beats it with the wicker beater, every blow puffing dust
// out of it (less and less, until it is clean; it gathers dust again in a
// few minutes). The other bay is a bare bar: E hangs you from it, W pulls
// you up, again and again until the arms give out; E drops you. Built live
// with its own colliders: nothing here draws on the world's seeded stream.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, Rng, clamp } from './util.js';

const X = -52;
const Z = -20;
const BAR = 2.4; // the top pipe, out of reach standing
const BAY = 1.7; // each bay's width
const CW = 1.45; // the rug's width
const CL = 1.45; // and how far it hangs down each side
const RUG_X = -BAY / 2; // the rug's bay, west; the bare bar's bay east
const PULL_X = BAY / 2;
const BEAT_REACH = 1.7;
const BEAT_GAP = 0.3; // s between blows
const CLEANING = 0.09; // dust knocked out by a blow
const DUSTING = 0.002; // per second, as it gathers dust again
const CLEAN = 0.1; // below this it counts as clean
const PUFFS = 14;
const HANG_EYE = BAR - 0.55; // eyes above the ground, hanging on straight arms
const TOP_EYE = BAR + 0.1; // chin over the bar
const LIMIT = 11; // pull-ups in fresh arms
const UP = 0.6; // s to pull up, fresh
const DOWN = 0.45;

function makeRugTexture(w = 256, h = 512) {
  const canvas = makeCanvas(w, h);
  const c = canvas.getContext('2d');
  const rng = new Rng(4071);
  c.fillStyle = '#e8dcc0';
  c.fillRect(0, 0, w, h);
  // the fringe at both ends
  c.strokeStyle = '#efe6d2';
  c.lineWidth = 2;
  for (let x = 6; x < w - 4; x += 5) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + rng.float(-1, 1), 12);
    c.moveTo(x, h);
    c.lineTo(x + rng.float(-1, 1), h - 12);
    c.stroke();
  }
  // borders: dark blue, a cream stripe, then the red field
  c.fillStyle = '#1f2a4a';
  c.fillRect(4, 12, w - 8, h - 24);
  c.fillStyle = '#d9c9a0';
  c.fillRect(22, 30, w - 44, h - 60);
  c.fillStyle = '#8e1f22';
  c.fillRect(28, 36, w - 56, h - 72);
  // a running chain of small diamonds round the border
  c.fillStyle = '#c99a45';
  const diamond = (x, y, r) => {
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r, y);
    c.closePath();
    c.fill();
  };
  for (let y = 26; y < h - 20; y += 16) {
    diamond(13, y, 5);
    diamond(w - 13, y, 5);
  }
  for (let x = 26; x < w - 20; x += 16) {
    diamond(x, 21, 5);
    diamond(x, h - 21, 5);
  }
  // the central medallion and the corner pieces
  const medallion = (x, y, r) => {
    c.fillStyle = '#1f2a4a';
    diamond(x, y, r);
    c.fillStyle = '#d9c9a0';
    diamond(x, y, r * 0.72);
    c.fillStyle = '#8e1f22';
    diamond(x, y, r * 0.6);
    c.fillStyle = '#c99a45';
    diamond(x, y, r * 0.3);
  };
  medallion(w / 2, h / 2, 82);
  for (const [x, y] of [
    [28, 36],
    [w - 28, 36],
    [28, h - 36],
    [w - 28, h - 36],
  ])
    medallion(x, y, 44);
  // scattered rosettes over the field
  for (let i = 0; i < 26; i++) {
    const x = rng.float(46, w - 46);
    const y = rng.float(56, h - 56);
    if (Math.abs(x - w / 2) + Math.abs(y - h / 2) < 100) continue;
    c.fillStyle = rng.pick(['#1f2a4a', '#d9c9a0', '#c99a45']);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      c.beginPath();
      c.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  // worn
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(${rng.pick(['255,240,220', '20,10,10'])},${rng.float(0.03, 0.1)})`;
    c.fillRect(rng.float(0, w), rng.float(0, h), 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePuffTexture(size = 64) {
  const canvas = makeCanvas(size, size);
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class Carpet {
  constructor({ world, player, sound }) {
    this.world = world;
    this.player = player;
    this.sound = sound;
    this.rng = new Rng(9203); // its own: the world's seeded stream is never touched
    this.group = new THREE.Group();
    this.group.name = 'carpet-frame';
    this.dust = 1; // how dusty the rug is, 0..1
    this.blows = 0;
    this.cooldown = 0;
    this.sway = { a: 0, w: 0 };
    this.note = null; // a line for the prompt, for a moment
    this.noteT = 0;
    this.hanging = false;
    this.reps = 0;
    this.best = 0;
    this.fatigue = 0;
    this.phase = 'hang'; // hang → up → down
    this.t = 0;
    this.build();
    this.ground = world.heightAt(X, Z);
    this.group.position.set(X, this.ground, Z);
    world.group.add(this.group);
    // live colliders only: the three posts and the rug; under the bare bar is free
    for (const px of [-BAY, 0, BAY]) world.colliders.push({ minX: X + px - 0.12, maxX: X + px + 0.12, minZ: Z - 0.12, maxZ: Z + 0.12 });
    this.rect = { minX: X + RUG_X - CW / 2, maxX: X + RUG_X + CW / 2, minZ: Z - 0.14, maxZ: Z + 0.14 };
    world.colliders.push(this.rect);
  }

  build() {
    const g = this.group;
    const paint = new THREE.MeshStandardMaterial({ color: 0x3f6b4a, roughness: 0.6, metalness: 0.5 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8d8b85, roughness: 0.95 });
    const parts = new Map();
    const add = (mat, geo) => {
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(geo);
    };
    for (const px of [-BAY, 0, BAY]) {
      add(paint, new THREE.CylinderGeometry(0.035, 0.035, BAR + 0.04, 8).translate(px, (BAR + 0.04) / 2, 0));
      add(concrete, new THREE.BoxGeometry(0.26, 0.1, 0.26).translate(px, 0.05, 0));
    }
    add(paint, new THREE.CylinderGeometry(0.03, 0.03, BAY * 2 + 0.1, 8).rotateZ(Math.PI / 2).translate(0, BAR, 0));
    for (const [mat, geos] of parts) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    // the rug, folded over the bar: one half down each side
    const rugMat = new THREE.MeshStandardMaterial({ map: makeRugTexture(), roughness: 1, side: THREE.DoubleSide });
    const half = (side) => {
      const geo = new THREE.PlaneGeometry(CW, CL);
      if (side < 0) geo.rotateY(Math.PI);
      geo.translate(0, -CL / 2, side * 0.04);
      // each side shows its own half of the rug
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, side > 0 ? 1 - uv.getY(i) * 0.5 : uv.getY(i) * 0.5);
      return geo;
    };
    const fold = new THREE.BoxGeometry(CW, 0.03, 0.1).translate(0, 0.04, 0);
    const uv = fold.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0.5);
    this.rug = new THREE.Mesh(mergeGeometries([half(1), half(-1), fold], false), rugMat);
    this.rug.castShadow = true;
    this.rug.receiveShadow = true;
    this.rug.position.set(RUG_X, BAR, 0);
    g.add(this.rug);
    // the dust, a pool of soft puffs
    const puffTex = makePuffTexture();
    this.puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0x9c8f78, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      g.add(s);
      this.puffs.push({ sprite: s, t: 0, life: 1, v: new THREE.Vector3(), s0: 0.2, s1: 0.8, alpha: 0 });
    }
  }

  /** Which side of the frame (+1 south, -1 north) a point is on. */
  #side(z) {
    return z >= Z ? 1 : -1;
  }

  /* ------------------------------------------------------------ the rug */

  /** How far off the rug's face, if you stand in front of it facing it. */
  beatDistance(x, z) {
    if (this.hanging) return Infinity;
    const lx = x - X - RUG_X;
    const dz = z - Z;
    if (Math.abs(lx) > CW / 2 + 0.2 || Math.abs(dz) < 0.2) return Infinity;
    const f = this.player.forwardVector;
    if (f.z * -Math.sign(dz) < 0.35) return Infinity;
    return Math.abs(dz);
  }

  /** A blow with the beater: true if it landed. */
  beat() {
    if (this.cooldown > 0 || this.hanging) return false;
    this.cooldown = BEAT_GAP;
    const p = this.player.position;
    const side = this.#side(p.z);
    const before = this.dust;
    this.blows++;
    this.dust = Math.max(0, this.dust - CLEANING);
    // the rug swings away from the blow
    this.sway.w += side * 1.0;
    const lx = clamp(p.x - X - RUG_X, -CW / 2 + 0.15, CW / 2 - 0.15) + RUG_X;
    const y = BAR - this.rng.float(0.35, 1.0);
    this.#puff(lx, y, side, 0.2 + before * 0.8);
    this.sound?.thwack?.(0.5 + before * 0.5);
    if (before > CLEAN && this.dust <= CLEAN) this.#say('Beaten clean');
    return true;
  }

  #puff(x, y, side, strength) {
    for (let k = 0; k < 4; k++) {
      const p = this.puffs.find((q) => !q.sprite.visible) ?? this.puffs.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      p.t = 0;
      p.life = this.rng.float(1.1, 1.8);
      p.alpha = 0.45 * strength;
      p.s0 = this.rng.float(0.1, 0.2);
      p.s1 = p.s0 + 0.25 + strength * 0.35;
      // out of both faces: the blow drives it through the weave
      const out = k === 3 ? -side : side;
      p.v.set(this.rng.float(-0.3, 0.3), this.rng.float(0.1, 0.35), out * this.rng.float(0.35, 0.8));
      p.sprite.position.set(x + this.rng.float(-0.15, 0.15), y + this.rng.float(-0.15, 0.15), out * 0.08);
      p.sprite.visible = true;
    }
  }

  get beatPrompt() {
    return this.dust > CLEAN ? 'E — beat the carpet' : 'E — beat the carpet (it is clean)';
  }

  /* --------------------------------------------------------- the bar */

  /** How far from under the bare bar, facing it. */
  barDistance(x, z) {
    if (this.hanging) return Infinity;
    const lx = x - X - PULL_X;
    const dz = z - Z;
    if (Math.abs(lx) > BAY / 2 - 0.15) return Infinity;
    const f = this.player.forwardVector;
    if (Math.abs(dz) > 0.25 && f.z * -Math.sign(dz) < 0.35) return Infinity;
    return Math.hypot(lx * 0.5, dz);
  }

  get hangPrompt() {
    return this.fatigue > 0.6 ? 'E — hang on the bar (the arms are still tired)' : 'E — hang on the bar';
  }

  /** Up on the bar, under it, facing across. */
  hang() {
    if (this.hanging) return;
    const p = this.player;
    this.side = this.#side(p.position.z);
    this.hanging = true;
    this.reps = 0;
    this.phase = 'hang';
    this.t = 0;
    p.teleport(X + PULL_X, Z + this.side * 0.05, this.side > 0 ? 0 : Math.PI);
    p.pitch = 0.12;
    p.enabled = false;
    p.eyeOverride = HANG_EYE;
    this.sound?.creak?.(0.15, 0);
  }

  /** Down off the bar, a step back. */
  drop() {
    if (!this.hanging) return;
    this.hanging = false;
    const p = this.player;
    p.eyeOverride = null;
    p.teleport(X + PULL_X, Z + this.side * 0.75, p.yaw);
    p.enabled = true;
    if (this.reps > this.best) this.best = this.reps;
  }

  /** Off the bar at once (leaving for the title screen). */
  cancel() {
    this.drop();
  }

  get hangingPrompt() {
    if (this.phase === 'up') return `Pull-ups: ${this.reps}…`;
    const tired = this.fatigue > 0.75 ? ' (the arms are burning)' : '';
    return `Pull-ups: ${this.reps}${tired} · W — pull up · E — drop off`;
  }

  #say(text, secs = 2.5) {
    this.note = text;
    this.noteT = secs;
  }

  /* ---------------------------------------------------------- update */

  update(dt, keys = {}) {
    dt = Math.max(0, dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    this.dust = Math.min(1, this.dust + DUSTING * dt);
    // the rug: a damped swing on the bar
    const s = this.sway;
    if (s.w !== 0 || s.a !== 0) {
      const n = Math.ceil(dt / 0.01);
      for (let i = 0; i < n; i++) {
        const h = dt / n;
        s.w += (-14 * s.a - 3 * s.w) * h;
        s.a = clamp(s.a + s.w * h, -0.25, 0.25);
      }
      if (Math.abs(s.a) < 1e-3 && Math.abs(s.w) < 1e-3) s.a = s.w = 0;
      this.rug.rotation.x = s.a;
    }
    for (const p of this.puffs) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-1.2 * dt));
      p.sprite.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      p.sprite.material.opacity = p.alpha * (1 - k) * Math.min(1, k * 8);
    }
    if (!this.hanging) {
      this.fatigue = Math.max(0, this.fatigue - 0.06 * dt);
      return;
    }
    // on the bar
    const p = this.player;
    this.t += dt;
    p.velocity.set(0, 0, 0);
    const upTime = UP * (1 + 2.5 * this.fatigue * this.fatigue);
    if (this.phase === 'hang') {
      this.fatigue = Math.min(1, this.fatigue + 0.012 * dt);
      p.eyeOverride = HANG_EYE;
      if (this.fatigue >= 1) {
        this.#say(`The arms give out: ${this.reps} pull-ups`, 3);
        this.drop();
        return;
      }
      if (keys.forward || keys.jump) {
        this.phase = 'up';
        this.t = 0;
      }
    } else if (this.phase === 'up') {
      const k = Math.min(1, this.t / upTime);
      p.eyeOverride = HANG_EYE + (TOP_EYE - HANG_EYE) * (k * k * (3 - 2 * k));
      if (k >= 1) {
        this.reps++;
        this.fatigue = Math.min(1, this.fatigue + 1 / LIMIT);
        this.sound?.creak?.(0.25, 0);
        this.phase = 'down';
        this.t = 0;
      }
    } else if (this.phase === 'down') {
      const k = Math.min(1, this.t / DOWN);
      p.eyeOverride = TOP_EYE + (HANG_EYE - TOP_EYE) * (k * k * (3 - 2 * k));
      if (k >= 1) {
        this.phase = 'hang';
        this.t = 0;
      }
    }
  }
}
