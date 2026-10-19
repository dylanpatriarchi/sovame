// Small shared utilities: math, deterministic RNG, canvas 2D helpers.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));

/** Framerate-independent interpolation. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** mulberry32: fast deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1337) {
    this.next = mulberry32(seed);
  }
  float(a = 0, b = 1) {
    return a + this.next() * (b - a);
  }
  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Approximate gaussian (sum of uniforms), useful for natural shapes. */
  bell(a = 0, b = 1) {
    const u = (this.next() + this.next() + this.next()) / 3;
    return a + u * (b - a);
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** Soft blob, also drawn at opposite edges to make the texture repeatable. */
export function wrappedBlob(ctx, size, x, y, r, color, alpha = 1) {
  const offsets = [
    [0, 0],
    [size, 0],
    [-size, 0],
    [0, size],
    [0, -size],
    [size, size],
    [-size, -size],
    [size, -size],
    [-size, size],
  ];
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [ox, oy] of offsets) {
    const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Rectangle/ellipse drawn with wraparound (for tileable textures). */
export function wrappedShape(ctx, size, x, y, drawFn) {
  const offsets = [
    [0, 0],
    [size, 0],
    [-size, 0],
    [0, size],
    [0, -size],
  ];
  for (const [ox, oy] of offsets) {
    ctx.save();
    ctx.translate(x + ox, y + oy);
    drawFn(ctx);
    ctx.restore();
  }
}

/** Fits text to the given width by shrinking the font size. */
export function fitFont(ctx, text, maxWidth, baseSize, family = 'Arial, sans-serif') {
  ctx.font = `bold ${baseSize}px ${family}`;
  const w = ctx.measureText(text).width;
  const size = w > maxWidth ? Math.floor((baseSize * maxWidth) / w) : baseSize;
  ctx.font = `bold ${size}px ${family}`;
  return size;
}

export function starPath(ctx, cx, cy, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
