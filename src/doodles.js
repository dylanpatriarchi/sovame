// Breath on a cold window, in winter: E at a flat's window and you breathe
// on the glass, it mists over round where you stood, and a finger draws
// something in the mist (a heart, a sun, a name...). The mist clears again
// in half a minute and takes the drawing with it. Each pane draws into its
// own small canvas, which the window shader reads. Live only: its own Rng.
import * as THREE from 'three';
import { makeCanvas, Rng, clamp } from './util.js';

const PX = 200; // canvas pixels per metre of glass
const H = 1.35; // a pane's height
const BOTTOM = 0.925; // its bottom edge above the floor
const CLEAR = 30; // s for the mist to clear
const DOODLES = ['heart', 'sun', 'smile', 'house', 'snowflake', 'name', 'peace', 'tictactoe'];
const NAMES = ['Оля', 'Таня + Серёжа', 'Вова', 'Лена', 'Саша', 'Миша + Наташа'];

export class WindowDoodles {
  constructor({ world }) {
    this.world = world;
    this.rng = new Rng(5150);
    this.panes = new Map(); // pane mesh -> its canvas, texture and mist
    this.drawn = 0;
    this.last = null;
  }

  get usable() {
    return this.world.season === 'winter';
  }

  /** The panes of a flat, where they are and the nearest place to stand
   * at each (the kitchen table is pushed up under its window). */
  static spots(flat, world) {
    return (flat.panes ?? []).map((pane) => {
      const x = flat.group.position.x + pane.position.x;
      const z = flat.group.position.z + pane.position.z;
      const w = pane.geometry.parameters.width;
      let stand = null;
      for (const dx of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
        for (const dz of [0.55, 0.75]) {
          if (!stand && !world.collides(x + dx, z - dz, 0.32)) stand = { x: x + dx, z: z - dz };
        }
      }
      return { pane, x, z, w, stand: stand ?? { x, z: z - 0.55 } };
    });
  }

  #state(pane) {
    let s = this.panes.get(pane);
    if (!s) {
      const w = pane.geometry.parameters.width;
      const canvas = makeCanvas(Math.round(w * PX), Math.round(H * PX));
      const ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      s = { canvas, ctx, tex, fog: 0, w };
      this.panes.set(pane, s);
      const u = pane.material.uniforms;
      if (u?.tDraw) u.tDraw.value = tex;
    }
    return s;
  }

  /** Mist on the glass of `pane`, 0..1. */
  fogOf(pane) {
    return this.panes.get(pane)?.fog ?? 0;
  }

  /** Breathe on the pane from (x, eye) and draw something in the mist.
   * `along` is where you stand across the glass, m from its middle. */
  breathe(spot, along = 0, eye = 1.72) {
    if (!this.usable) return null;
    const s = this.#state(spot.pane);
    const c = s.ctx;
    const W = s.canvas.width;
    const Hp = s.canvas.height;
    if (s.fog <= 0.01) c.clearRect(0, 0, W, Hp);
    c.fillStyle = '#000';
    if (s.fog <= 0.01) c.fillRect(0, 0, W, Hp);
    // the pane is seen from inside: its u runs to your right, against world x
    let u = clamp(0.5 - along / s.w, 0.25, 0.75) + this.rng.float(-0.06, 0.06);
    // a second breath while the first is still misted goes beside it
    if (s.fog > 0.01 && s.u !== undefined && Math.abs(u - s.u) < 0.3) u = s.u > 0.5 ? s.u - 0.34 : s.u + 0.34;
    s.u = u;
    const v = clamp((eye - 0.15 - BOTTOM) / H, 0.3, 0.75);
    const cx = u * W;
    const cy = (1 - v) * Hp;
    const r = 0.3 * PX;
    // the misted patch, soft at its edge
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, 'rgba(255,0,0,1)');
    g.addColorStop(0.7, 'rgba(255,0,0,0.85)');
    g.addColorStop(1, 'rgba(255,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    // and a finger through it
    const kind = DOODLES[this.rng.int(0, DOODLES.length - 1)];
    c.strokeStyle = 'rgb(0,255,0)';
    c.fillStyle = 'rgb(0,255,0)';
    c.lineWidth = 0.022 * PX;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    this.#draw(c, kind, cx, cy, r * 0.62);
    c.globalCompositeOperation = 'source-over';
    s.tex.needsUpdate = true;
    s.fog = 1;
    this.drawn++;
    this.last = kind;
    return kind;
  }

  #draw(c, kind, x, y, r) {
    const line = (pts) => {
      c.beginPath();
      pts.forEach(([px, py], i) => (i ? c.lineTo(x + px * r, y + py * r) : c.moveTo(x + px * r, y + py * r)));
      c.stroke();
    };
    const circle = (px, py, rr) => {
      c.beginPath();
      c.arc(x + px * r, y + py * r, rr * r, 0, Math.PI * 2);
      c.stroke();
    };
    if (kind === 'heart') {
      c.beginPath();
      c.moveTo(x, y + 0.75 * r);
      c.bezierCurveTo(x - 1.1 * r, y - 0.1 * r, x - 0.6 * r, y - 0.9 * r, x, y - 0.35 * r);
      c.bezierCurveTo(x + 0.6 * r, y - 0.9 * r, x + 1.1 * r, y - 0.1 * r, x, y + 0.75 * r);
      c.stroke();
    } else if (kind === 'sun') {
      circle(0, 0, 0.35);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        line([
          [Math.cos(a) * 0.5, Math.sin(a) * 0.5],
          [Math.cos(a) * 0.85, Math.sin(a) * 0.85],
        ]);
      }
    } else if (kind === 'smile') {
      circle(0, 0, 0.8);
      circle(-0.3, -0.25, 0.04);
      circle(0.3, -0.25, 0.04);
      c.beginPath();
      c.arc(x, y + 0.05 * r, 0.45 * r, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    } else if (kind === 'house') {
      line([
        [-0.6, 0.7],
        [-0.6, -0.1],
        [0, -0.7],
        [0.6, -0.1],
        [0.6, 0.7],
        [-0.6, 0.7],
      ]);
      line([
        [-0.15, 0.7],
        [-0.15, 0.25],
        [0.15, 0.25],
        [0.15, 0.7],
      ]);
    } else if (kind === 'snowflake') {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        line([
          [-dx * 0.8, -dy * 0.8],
          [dx * 0.8, dy * 0.8],
        ]);
      }
    } else if (kind === 'tictactoe') {
      for (const k of [-0.25, 0.25]) {
        line([
          [k, -0.75],
          [k, 0.75],
        ]);
        line([
          [-0.75, k],
          [0.75, k],
        ]);
      }
      line([
        [-0.65, -0.65],
        [-0.35, -0.35],
      ]);
      line([
        [-0.35, -0.65],
        [-0.65, -0.35],
      ]);
      circle(0, 0, 0.13);
    } else {
      // words: a name, or the slogan off every roof
      const text = kind === 'peace' ? 'МИРУ МИР' : NAMES[this.rng.int(0, NAMES.length - 1)];
      c.font = `${Math.round(r * 0.55)}px "Comic Sans MS", cursive, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const width = c.measureText(text).width;
      const k = Math.min(1, (r * 1.9) / width);
      c.save();
      c.translate(x, y);
      c.scale(k, k);
      c.fillText(text, 0, 0);
      c.restore();
    }
  }

  update(dt) {
    dt = Math.max(0, dt);
    for (const [pane, s] of this.panes) {
      if (s.fog <= 0) continue;
      // out of winter the glass clears at once
      s.fog = this.usable ? Math.max(0, s.fog - dt / CLEAR) : 0;
      const u = pane.material.uniforms;
      // it lingers, then thins quickly at the end
      if (u?.uFog) u.uFog.value = Math.sqrt(s.fog);
    }
  }
}
