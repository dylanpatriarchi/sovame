// Hopscotch (классики) chalked on the avenue sidewalk by the kiosk, when it
// isn't winter: jump (Space) from square to square, 1 to 10 in order, and
// the time from the first square to the last comes up at the end. A wrong
// square or a hop off the drawing and it is back to 1. Live only: nothing
// here draws on the world's seeded stream.
import * as THREE from 'three';
import { makeCanvas, Rng } from './util.js';

// two columns, five rows of squares, running north along the sidewalk
const X0 = 7.3;
const Z0 = 10;
const C = 0.8; // a square
const ROWS = 5;
const NEAR = 1; // the drawing is offered from this close
const AWAY = 2.5; // and a run is given up this far off it

/** The square a point is in (1..10), or 0 off the drawing. Read from the
 * south end: 1 on the left (the higher x), 2 on the right, and so on up. */
function cellAt(x, z) {
  const r = Math.floor((z - Z0) / C);
  const k = Math.floor((x - X0) / C);
  if (r < 0 || r >= ROWS || k < 0 || k > 1) return 0;
  return 2 * r + (k === 1 ? 1 : 2);
}

function makeChalkTexture(w = 256, h = 640) {
  const canvas = makeCanvas(w, h);
  const c = canvas.getContext('2d');
  const rng = new Rng(2210);
  c.clearRect(0, 0, w, h);
  c.strokeStyle = 'rgba(246,244,238,0.9)';
  c.fillStyle = 'rgba(246,244,238,0.9)';
  c.lineCap = 'round';
  const s = w / 2; // a square, in pixels
  const pad = 4;
  const wobbly = (x0, y0, x1, y1) => {
    c.lineWidth = rng.float(3, 5);
    c.beginPath();
    c.moveTo(x0 + rng.float(-2, 2), y0 + rng.float(-2, 2));
    c.lineTo((x0 + x1) / 2 + rng.float(-2, 2), (y0 + y1) / 2 + rng.float(-2, 2));
    c.lineTo(x1 + rng.float(-2, 2), y1 + rng.float(-2, 2));
    c.stroke();
  };
  const top = h - ROWS * s;
  for (let r = 0; r <= ROWS; r++) wobbly(pad, h - pad - r * s, w - pad, h - pad - r * s);
  for (const x of [pad, w / 2, w - pad]) wobbly(x, h - pad, x, top + pad);
  c.font = 'bold 64px Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (let r = 0; r < ROWS; r++) {
    const y = h - pad - (r + 0.5) * s;
    c.fillText(String(2 * r + 1), s * 0.5, y);
    c.fillText(String(2 * r + 2), s * 1.5, y);
  }
  // dry chalk
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(0,0,0,${rng.float(0.3, 0.9)})`;
    c.fillRect(rng.float(0, w), rng.float(0, h), rng.float(1, 3), rng.float(1, 3));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Hopscotch {
  constructor({ world, player, sound }) {
    this.world = world;
    this.player = player;
    this.sound = sound;
    this.next = 0; // the last square reached in this run (0: not started)
    this.t = 0;
    this.best = null;
    this.runs = 0;
    this.note = null;
    this.noteT = 0;
    this.wasGround = true;
    const geo = new THREE.PlaneGeometry(2 * C, ROWS * C);
    // the drawing's top (the canvas's) points north, its left at the higher x
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: makeChalkTexture(),
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    const cx = X0 + C;
    const cz = Z0 + (ROWS * C) / 2;
    this.center = new THREE.Vector3(cx, world.heightAt(cx, cz), cz);
    this.mesh.position.set(cx, this.center.y + 0.01, cz);
    this.mesh.name = 'hopscotch';
    world.group.add(this.mesh);
  }

  get usable() {
    return this.world.season !== 'winter';
  }

  /** Which square a point is in, 1..10 (0: off the drawing). */
  cellAt(x, z) {
    return cellAt(x, z);
  }

  /** Where the middle of a square is, for the tests. */
  cellCenter(n) {
    const r = Math.floor((n - 1) / 2);
    const k = n % 2 === 1 ? 1 : 0;
    return { x: X0 + (k + 0.5) * C, z: Z0 + (r + 0.5) * C };
  }

  #near(x, z, d = NEAR) {
    return x > X0 - d && x < X0 + 2 * C + d && z > Z0 - d && z < Z0 + ROWS * C + d;
  }

  /** Down from a jump at (x, z). */
  land(x, z) {
    if (!this.usable) return;
    const cell = cellAt(x, z);
    if (cell === this.next + 1) {
      if (cell === 1) {
        this.t = 0;
        this.runs++;
      }
      this.next = cell;
      this.sound?.ui?.('tick');
      if (cell === 10) {
        const fresh = this.best === null || this.t < this.best;
        if (fresh) this.best = this.t;
        this.#say(`Hopscotch: all ten in ${this.t.toFixed(1)} s${fresh ? ' · a best' : ` · best ${this.best.toFixed(1)} s`}`, 4);
        this.sound?.ui?.('confirm');
        this.next = 0;
      }
      return;
    }
    if (this.next === 0) return;
    // a wrong square, or off the drawing mid-run: back to the start (a jump
    // straight into 1 starts again at once)
    this.next = 0;
    if (cell === 1) {
      this.land(x, z);
      return;
    }
    this.#say(cell ? `Square ${cell}? Back to 1` : 'Off the drawing: back to 1');
  }

  get prompt() {
    if (this.next > 0) return `Hopscotch: ${this.next} · now ${this.next + 1}`;
    return 'Hopscotch: Space to jump from square to square, 1 to 10';
  }

  /** The line for the prompt, if you are by the drawing (or in a run). */
  promptFor(x, z) {
    if (!this.usable) return null;
    if (this.note) return this.note;
    return this.next > 0 || this.#near(x, z) ? this.prompt : null;
  }

  #say(text, secs = 2.5) {
    this.note = text;
    this.noteT = secs;
  }

  update(dt, { active = true } = {}) {
    dt = Math.max(0, dt);
    this.mesh.visible = this.usable;
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    const p = this.player;
    const ground = p.onGround;
    if (this.next > 0) {
      this.t += dt;
      // wandered off, or stopped too long: the run is over
      if (!this.#near(p.position.x, p.position.z, AWAY) || this.t > 60) this.next = 0;
    }
    if (active && ground && !this.wasGround && this.#near(p.position.x, p.position.z, AWAY)) this.land(p.position.x, p.position.z);
    this.wasGround = ground;
  }
}
