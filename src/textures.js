// Textures generated procedurally on 2D canvas: no external assets.
import * as THREE from 'three';
import { Rng, TAU, clamp, fitFont, makeCanvas, roundRect, starPath, wrappedBlob } from './util.js';

const CREAM = '#efe3cf';

export function canvasTexture(canvas, opts = {}) {
  return toTexture(canvas, opts);
}

function toTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ ground */

/** Ground: packed snow (winter) or dead grass, mud and leaves (autumn). */
export function makeGroundTexture(season, size = 1024) {
  const rng = new Rng(season === 'winter' ? 8123 : 4242);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');

  if (season === 'winter') {
    ctx.fillStyle = '#dde5ee';
    ctx.fillRect(0, 0, size, size);
    // patches of older snow / ice
    for (let i = 0; i < 90; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(40, 190), 'rgba(176,190,206,0.55)', rng.float(0.1, 0.3));
    }
    for (let i = 0; i < 70; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(30, 140), 'rgba(255,255,255,0.75)', rng.float(0.15, 0.4));
    }
    // trampled paths
    for (let i = 0; i < 26; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(20, 70), 'rgba(150,163,178,0.6)', rng.float(0.12, 0.3));
    }
    // tufts of grass and soil showing through
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 420; i++) {
      const x = rng.float(0, size);
      const y = rng.float(0, size);
      const h = rng.float(3, 11);
      ctx.strokeStyle = `rgba(${rng.int(96, 126)},${rng.int(88, 112)},${rng.int(64, 84)},${rng.float(0.25, 0.6)})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.float(-2.5, 2.5), y - h);
      ctx.stroke();
    }
    // granules
    for (let i = 0; i < 5200; i++) {
      ctx.fillStyle = `rgba(${rng.int(120, 200)},${rng.int(130, 205)},${rng.int(140, 215)},${rng.float(0.05, 0.22)})`;
      ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 2.6), rng.float(1, 2.6));
    }
  } else {
    ctx.fillStyle = '#6c6d5c';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 120; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(50, 210), `rgba(${rng.int(70, 100)},${rng.int(72, 96)},${rng.int(52, 72)},0.6)`, rng.float(0.15, 0.4));
    }
    // patches of old snow and mud
    for (let i = 0; i < 60; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(30, 130), 'rgba(214,222,231,0.8)', rng.float(0.25, 0.65));
    }
    for (let i = 0; i < 45; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(24, 90), 'rgba(64,58,46,0.7)', rng.float(0.2, 0.5));
    }
    // fallen leaves
    for (let i = 0; i < 2600; i++) {
      const x = rng.float(0, size);
      const y = rng.float(0, size);
      const r = rng.float(1.6, 4.4);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng.float(0, TAU));
      ctx.fillStyle = `rgba(${rng.int(126, 186)},${rng.int(74, 122)},${rng.int(28, 62)},${rng.float(0.35, 0.85)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.55, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // twigs
    for (let i = 0; i < 260; i++) {
      ctx.strokeStyle = `rgba(${rng.int(52, 86)},${rng.int(46, 70)},${rng.int(34, 52)},0.7)`;
      ctx.lineWidth = rng.float(0.8, 2);
      const x = rng.float(0, size);
      const y = rng.float(0, size);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rng.float(-22, 22), y + rng.float(-22, 22));
      ctx.stroke();
    }
  }
  return toTexture(canvas, { repeat: [1, 1] });
}

/** Asphalt: worn, patched, with cracks and (optional) centerline markings. */
export function makeAsphaltTexture({ dashes = true, size = 512, winter = false } = {}) {
  const rng = new Rng((dashes ? 991 : 992) + (winter ? 40 : 0));
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // the road stays dark but never black: it is the largest surface in frame
  ctx.fillStyle = winter ? '#50555c' : '#45484c';
  ctx.fillRect(0, 0, size, size);

  // grit
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${rng.int(70, 140)},${rng.int(72, 142)},${rng.int(76, 148)},${rng.float(0.05, 0.3)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 2.2), rng.float(1, 2.2));
  }
  // damp patches: darker, they read as wet film under lamps
  for (let i = 0; i < 30; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(30, 130), 'rgba(46,50,56,0.8)', rng.float(0.25, 0.55));
  }
  for (let i = 0; i < 12; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(60, 170), 'rgba(36,40,46,0.55)', rng.float(0.15, 0.35));
  }
  for (let i = 0; i < 14; i++) {
    const w = rng.float(40, 150);
    const h = rng.float(30, 110);
    ctx.save();
    ctx.globalAlpha = rng.float(0.25, 0.5);
    ctx.fillStyle = '#32353a';
    ctx.fillRect(rng.float(0, size), rng.float(0, size), w, h);
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#4d5158';
    ctx.lineWidth = 2;
    ctx.strokeRect(rng.float(0, size), rng.float(0, size), w, h);
    ctx.restore();
  }
  // cracks: few, hairline, running mostly along or across the lane with a
  // slight meander (random-walk zig-zags read as scribbles at eye level)
  ctx.strokeStyle = 'rgba(28,30,33,0.38)';
  for (let i = 0; i < 14; i++) {
    ctx.lineWidth = rng.float(0.6, 1.3);
    let x = rng.float(0, size);
    let y = rng.float(0, size);
    let a = rng.chance(0.6) ? Math.PI / 2 + rng.float(-0.25, 0.25) : rng.float(-0.3, 0.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = rng.int(5, 12);
    for (let s = 0; s < steps; s++) {
      a += rng.float(-0.35, 0.35);
      const len = rng.float(6, 14);
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // tire tracks (darker, glossy)
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(size * 0.18, 0, size * 0.14, size);
  ctx.fillRect(size * 0.68, 0, size * 0.14, size);
  ctx.restore();

  if (dashes) {
    // faded broken centerline
    const cx = size * 0.5;
    const dashH = size * 0.34;
    for (const y of [size * 0.05, size * 0.55]) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#c9c8bd';
      ctx.fillRect(cx - 5, y, 10, dashH);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#8e8e88';
      for (let i = 0; i < 60; i++) {
        ctx.fillRect(cx - 5 + rng.float(0, 9), y + rng.float(0, dashH), 2, 2);
      }
      ctx.restore();
    }
    // road edge
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#bfc0b8';
    ctx.fillRect(2, 0, 4, size);
    ctx.fillRect(size - 6, 0, 4, size);
    ctx.restore();
  }
  if (winter) {
    // veil of ice and packed snow: lightens the asphalt and ties it to the rest
    for (let i = 0; i < 34; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(40, 150), 'rgba(214,224,235,0.5)', rng.float(0.12, 0.34));
    }
    for (let i = 0; i < 40; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(14, 60), 'rgba(235,241,248,0.55)', rng.float(0.2, 0.5));
    }
    // slushy tire lanes: churned dirty snow with polished wet lines underneath
    for (const cx of [size * 0.25, size * 0.75]) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#2b2f36';
      ctx.fillRect(cx - 14, 0, 7, size);
      ctx.fillRect(cx + 7, 0, 7, size);
      ctx.restore();
      for (let y = 0; y < size; y += 6) {
        const wob = Math.sin(y * 0.021 + cx) * 4;
        ctx.save();
        ctx.globalAlpha = rng.float(0.1, 0.3);
        ctx.fillStyle = rng.chance(0.6) ? '#828c9a' : '#5d6570';
        ctx.beginPath();
        ctx.ellipse(cx + wob + rng.float(-10, 10), y, rng.float(6, 17), rng.float(3, 8), 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    // snow piled up at the edges of the carriageway
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#e6edf6';
    for (let y = 0; y < size; y += 26) {
      const w = 12 + 10 * Math.sin(y * 0.05);
      ctx.beginPath();
      ctx.ellipse(4, y, w, 13, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(size - 4, y + 12, w, 13, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  return toTexture(canvas);
}

/**
 * Roughness map for wet asphalt (linear, not sRGB): a mid-rough base with
 * broad damp sheen patches and polished tire lanes. Winter keeps the lanes
 * glossy but roughens the slush between them.
 */
export function makeAsphaltRoughnessTexture({ dashes = true, size = 512, winter = false } = {}) {
  const rng = new Rng((dashes ? 881 : 882) + (winter ? 40 : 0));
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = winter ? '#c4c4c4' : '#d6d6d6';
  ctx.fillRect(0, 0, size, size);

  // broad damp patches with a lower roughness
  for (let i = 0; i < 24; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(50, 170), 'rgba(118,118,118,0.85)', rng.float(0.25, 0.6));
  }
  // polished tire lanes: wet film is the smoothest part of the road
  ctx.save();
  ctx.globalAlpha = winter ? 0.7 : 0.55;
  ctx.fillStyle = '#6e6e6e';
  ctx.fillRect(size * 0.19, 0, size * 0.13, size);
  ctx.fillRect(size * 0.68, 0, size * 0.13, size);
  ctx.restore();
  if (winter) {
    // slush is rough again; only the two polished lines per lane stay smooth
    for (const cx of [size * 0.25, size * 0.75]) {
      for (let i = 0; i < 70; i++) {
        wrappedBlob(ctx, size, cx + rng.float(-16, 16), rng.float(0, size), rng.float(6, 18), 'rgba(208,208,208,0.9)', rng.float(0.3, 0.7));
      }
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#565656';
      ctx.fillRect(cx - 14, 0, 7, size);
      ctx.fillRect(cx + 7, 0, 7, size);
      ctx.restore();
    }
  }
  // speckle so the sheen breaks up instead of reading as plastic
  for (let i = 0; i < 2600; i++) {
    const v = rng.int(140, 235);
    ctx.fillStyle = `rgba(${v},${v},${v},${rng.float(0.08, 0.3)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 2.4), rng.float(1, 2.4));
  }
  return toTexture(canvas, { srgb: false });
}

/** Sidewalk made of concrete slabs. */
export function makeSidewalkTexture(size = 512) {
  const rng = new Rng(777);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8d8f8c';
  ctx.fillRect(0, 0, size, size);

  const tiles = 6; // 6 x 6 slabs, 1 m each
  const step = size / tiles;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const v = rng.float(-14, 14);
      ctx.fillStyle = `rgb(${clamp(141 + v, 0, 255) | 0},${clamp(143 + v, 0, 255) | 0},${clamp(140 + v, 0, 255) | 0})`;
      ctx.fillRect(tx * step + 1.5, ty * step + 1.5, step - 3, step - 3);
    }
  }
  // joints
  ctx.strokeStyle = 'rgba(85,87,86,0.85)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  // stains, cracks, trampled snow
  for (let i = 0; i < 30; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(24, 90), 'rgba(108,110,108,0.55)', rng.float(0.15, 0.45));
  }
  for (let i = 0; i < 40; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(10, 40), 'rgba(222,229,238,0.8)', rng.float(0.1, 0.35));
  }
  ctx.strokeStyle = 'rgba(62,64,64,0.35)';
  for (let i = 0; i < 12; i++) {
    ctx.lineWidth = rng.float(0.6, 1.2);
    let x = rng.float(0, size);
    let y = rng.float(0, size);
    let a = rng.float(0, TAU);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      a += rng.float(-0.5, 0.5);
      x += Math.cos(a) * rng.float(8, 18);
      y += Math.sin(a) * rng.float(8, 18);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return toTexture(canvas);
}

/** Trampled snow path in the courtyards. */
export function makeTrampledSnowTexture(size = 512) {
  const rng = new Rng(303);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c7cfd9';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(26, 110), `rgba(${rng.int(150, 205)},${rng.int(158, 210)},${rng.int(166, 218)},0.6)`, rng.float(0.12, 0.4));
  }
  for (let i = 0; i < 60; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(20, 70), 'rgba(126,122,110,0.5)', rng.float(0.1, 0.3));
  }
  // footprints and ruts
  for (let i = 0; i < 700; i++) {
    const x = rng.float(0, size);
    const y = rng.float(0, size);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng.float(0, TAU));
    ctx.fillStyle = `rgba(${rng.int(96, 140)},${rng.int(100, 144)},${rng.int(110, 156)},${rng.float(0.08, 0.26)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, rng.float(3, 6), rng.float(6, 12), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(canvas);
}

/** Snowy road edge: opaque at the ground, fading toward the road center. */
export function makeSnowEdgeTexture(size = 256) {
  const rng = new Rng(555);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.45, 'rgba(240,245,252,0.55)');
  grad.addColorStop(1, 'rgba(252,253,255,0.98)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // irregular edge
  for (let i = 0; i < 90; i++) {
    ctx.save();
    ctx.globalAlpha = rng.float(0.06, 0.3);
    ctx.fillStyle = rng.chance(0.5) ? '#ffffff' : '#c3ccd8';
    ctx.beginPath();
    ctx.ellipse(rng.float(0, size), size * rng.float(0.35, 0.75), rng.float(8, 34), rng.float(4, 14), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(canvas);
}

/** Ice: dark slab with skate scratches and cracks. */
export function makeIceTexture(size = 512) {
  const rng = new Rng(2024);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#232c38';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(40, 150), `rgba(${rng.int(40, 76)},${rng.int(54, 92)},${rng.int(74, 116)},0.6)`, rng.float(0.2, 0.5));
  }
  // cracks
  ctx.strokeStyle = 'rgba(196,214,232,0.35)';
  for (let i = 0; i < 46; i++) {
    ctx.lineWidth = rng.float(0.5, 1.6);
    let x = rng.float(0, size);
    let y = rng.float(0, size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += rng.float(-40, 40);
      y += rng.float(-40, 40);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // skate scratches
  ctx.strokeStyle = 'rgba(226,238,250,0.22)';
  for (let i = 0; i < 40; i++) {
    ctx.lineWidth = rng.float(0.7, 1.6);
    const cx = rng.float(0, size);
    const cy = rng.float(0, size);
    const r = rng.float(40, 160);
    ctx.beginPath();
    ctx.arc(cx, cy, r, rng.float(0, TAU), rng.float(0, TAU));
    ctx.stroke();
  }
  // snow dust
  for (let i = 0; i < 50; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(14, 60), 'rgba(240,246,253,0.75)', rng.float(0.1, 0.4));
  }
  return toTexture(canvas);
}

/* ------------------------------------------------------------------ buildings */

function drawWindow(ctx, x, y, w, h, rng, opts) {
  const { winter, litChance, tv = false } = opts;
  // opening
  ctx.fillStyle = 'rgba(48,46,44,0.85)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  // frame
  ctx.fillStyle = '#7c817f';
  ctx.fillRect(x, y, w, h);

  const panes = rng.chance(0.5) ? 2 : 3;
  const inner = { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
  const lit = !tv && rng.chance(litChance);
  const cool = rng.chance(0.25);
  const occluders = [];

  let glass;
  if (lit) {
    glass = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.h);
    if (cool) {
      glass.addColorStop(0, '#dfeaff');
      glass.addColorStop(1, '#9fb6d6');
    } else {
      glass.addColorStop(0, '#ffd7a0');
      glass.addColorStop(1, '#e08a34');
    }
    ctx.fillStyle = glass;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    glass = null;
    // curtain layout: some windows are half-lit or top-lit behind fabric
    const r = rng.next();
    const style = r < 0.48 ? 'full' : r < 0.76 ? 'bottom' : r < 0.88 ? 'top' : 'side';
    if (style === 'bottom') {
      const frac = rng.float(0.42, 0.62);
      occluders.push({ x: inner.x, y: inner.y + inner.h * (1 - frac), w: inner.w, h: inner.h * frac });
    } else if (style === 'top') {
      const frac = rng.float(0.26, 0.44);
      occluders.push({ x: inner.x, y: inner.y, w: inner.w, h: inner.h * frac });
    } else if (style === 'side') {
      const sw = inner.w * rng.float(0.28, 0.44);
      occluders.push({ x: rng.chance(0.5) ? inner.x : inner.x + inner.w - sw, y: inner.y, w: sw, h: inner.h });
    }
    for (const o of occluders) {
      ctx.save();
      ctx.globalAlpha = rng.float(0.82, 0.95);
      ctx.fillStyle = rng.pick(['#6b5f4e', '#7a6b54', '#5d5648', '#4e4a42']);
      ctx.fillRect(o.x, o.y, o.w, o.h);
      // faint light leaking over the curtain edge
      if (o.y > inner.y) {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(255,196,128,0.6)';
        ctx.fillRect(o.x, o.y - 1, o.w, 1.6);
      }
      ctx.restore();
    }
  } else if (tv) {
    // TV window: cold navy glass, kept dark in the emissive map —
    // the animated flicker quad provides the light (see buildings.js)
    glass = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.h);
    glass.addColorStop(0, '#26344c');
    glass.addColorStop(1, '#101825');
    ctx.fillStyle = glass;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    glass = null;
  } else if (rng.chance(0.55)) {
    // curtains
    const curtain = rng.pick(['#8d7c66', '#a39784', '#7f8b93', '#9a8d7a', '#6f7c86']);
    glass = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.h);
    glass.addColorStop(0, '#2a333e');
    glass.addColorStop(1, '#20262e');
    ctx.fillStyle = glass;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    ctx.save();
    ctx.globalAlpha = rng.float(0.55, 0.9);
    ctx.fillStyle = curtain;
    const cw = inner.w * rng.float(0.35, 0.6);
    ctx.fillRect(inner.x, inner.y, cw, inner.h);
    if (rng.chance(0.4)) ctx.fillRect(inner.x + inner.w - cw, inner.y, cw, inner.h);
    ctx.restore();
    ctx.fillStyle = 'rgba(180,196,214,0.25)';
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h * 0.3);
    glass = null;
  } else {
    glass = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.h);
    glass.addColorStop(0, '#4a5765');
    glass.addColorStop(0.5, '#26303b');
    glass.addColorStop(1, '#1c232c');
  }
  if (glass) {
    ctx.fillStyle = glass;
    ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  }
  // mullions
  ctx.fillStyle = rng.chance(0.5) ? '#8b8f8c' : '#6e7472';
  for (let p = 1; p < panes; p++) {
    const px = inner.x + (inner.w / panes) * p;
    ctx.fillRect(px - 1, inner.y, 2.4, inner.h);
  }
  ctx.fillRect(inner.x, inner.y + inner.h * 0.5 - 1, inner.w, 2);
  // windowsill with snow
  ctx.fillStyle = 'rgba(228,224,216,0.9)';
  ctx.fillRect(x - 4, y + h, w + 8, 4);
  ctx.fillStyle = 'rgba(60,56,52,0.35)';
  ctx.fillRect(x - 4, y + h + 4, w + 8, 3);
  if (winter) {
    ctx.fillStyle = 'rgba(250,252,255,0.95)';
    ctx.fillRect(x - 4, y + h - 1, w + 8, 3);
  }
  // occasional broken pane
  if (rng.chance(0.05) && !lit) {
    ctx.strokeStyle = 'rgba(220,232,244,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(inner.x + rng.float(0, inner.w), inner.y);
    ctx.lineTo(inner.x + rng.float(0, inner.w), inner.y + inner.h);
    ctx.stroke();
  }
  return { lit, cool, x, y, w, h, inner, panes, occluders };
}

function drawBalcony(ctx, x, y, w, h, rng, opts) {
  const slabY = y + h + 3;
  const slabH = 7;
  // slab
  ctx.fillStyle = '#b9b6ac';
  ctx.fillRect(x - 2, slabY, w + 4, slabH);
  ctx.fillStyle = 'rgba(52,50,48,0.45)';
  ctx.fillRect(x - 2, slabY + slabH - 2.5, w + 4, 2.5);
  // railing
  const railY = slabY - 20;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#6b7570';
  ctx.fillRect(x - 2, railY, w + 4, 20);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#3f4744';
  for (let bx = x; bx < x + w; bx += 4) {
    ctx.fillRect(bx, railY + 1, 1.6, 18);
  }
  ctx.restore();
  ctx.fillStyle = '#8d9490';
  ctx.fillRect(x - 2, railY, w + 4, 2.5);
  // hanging rug / clutter
  if (rng.chance(0.14)) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = rng.pick(['#7c2f2a', '#4a5a73', '#6b5334']);
    ctx.fillRect(x + 2, railY + 3, w - 4, 15);
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 4.5, railY + 5.5, w - 9, 10);
    ctx.restore();
  } else if (rng.chance(0.2)) {
    ctx.fillStyle = 'rgba(48,50,52,0.9)';
    ctx.fillRect(x + rng.float(3, w - 12), railY - 6, rng.float(6, 11), 10);
  }
  if (opts.winter) {
    ctx.fillStyle = 'rgba(250,252,255,0.95)';
    ctx.fillRect(x - 2, slabY - 2, w + 4, 2.5);
  }
}

function drawEntrance(ctx, x, yTop, cell, floors, opts) {
  const w = cell * 0.62;
  const x0 = x + (cell - w) * 0.5;
  // kozyrëk (canopy) + door
  const doorH = cell * 0.72;
  const y = yTop + cell - doorH - 4;
  ctx.fillStyle = '#5c5a55';
  ctx.fillRect(x0 - 5, y - 12, w + 10, 8);
  ctx.fillStyle = 'rgba(40,38,36,0.5)';
  ctx.fillRect(x0 - 5, y - 4, w + 10, 3);
  // stairwell
  ctx.fillStyle = '#6d6a63';
  ctx.fillRect(x0, y, w, doorH);
  ctx.fillStyle = 'rgba(30,32,34,0.85)';
  const dw = w * 0.86;
  const dh = doorH * 0.9;
  ctx.fillRect(x0 + (w - dw) / 2, y + doorH - dh, dw, dh);
  ctx.fillStyle = '#7d8484';
  ctx.fillRect(x0 + (w - dw) / 2 + dw / 2 - 1.5, y + doorH - dh, 3, dh);
  // house number
  ctx.fillStyle = '#d8d3c6';
  ctx.fillRect(x0 + w * 0.5 - 8, y - 2, 16, 10);
  ctx.fillStyle = '#3a3a38';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(opts.number, x0 + w * 0.5, y + 6);
  // entrance lamp
  ctx.fillStyle = opts.lit ? '#ffcf8a' : '#585c5c';
  roundRect(ctx, x0 + w * 0.5 - 4, y - 16, 8, 5, 2);
  ctx.fill();
  return { x: x0 + w * 0.5, y: y - 14, lit: opts.lit };
}

/**
 * Facade of a prefab panel building: windows, balconies, entrances,
 * dirt stains, plaques. Returns color map + emissive map.
 */
export function makeFacadeTextures(spec) {
  const {
    floors = 5,
    cells = 8,
    cell = 64,
    base = '#c0bcae',
    plinth = '#8d8a80',
    rng = new Rng(1),
    entranceEvery = 4,
    balconyChance = 0.42,
    litChance = 0.3,
    winter = true,
    street = 'ул. КОСМОНАВТОВ',
    number = '12',
    tall = false,
    tvCells = null,
  } = spec;

  const W = cells * cell;
  const H = floors * cell;
  const map = makeCanvas(W, H);
  const glow = makeCanvas(W, H);
  const ctx = map.getContext('2d');
  const gctx = glow.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  gctx.fillStyle = '#000';
  gctx.fillRect(0, 0, W, H);

  // soft vertical grime streak, fading as it runs down
  const grimeStreak = (x, y, w, len, alpha) => {
    const grad = ctx.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, `rgba(54,51,46,${alpha})`);
    grad.addColorStop(1, 'rgba(54,51,46,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - w / 2, y, w, len);
    // damper source right at the origin
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = '#3c3a35';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, w * 0.7, 2.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  };

  // per-panel albedo variance: brightness plus a faint temperature shift
  // (replaced panels and decades of uneven weathering)
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cells; c++) {
      const v = rng.float(-11, 11);
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 62})` : `rgba(0,0,0,${-v / 62})`;
      ctx.fillRect(c * cell, (floors - 1 - f) * cell, cell, cell);
      if (rng.chance(0.2)) {
        ctx.fillStyle = rng.chance(0.5) ? 'rgba(150,128,98,0.045)' : 'rgba(94,116,140,0.045)';
        ctx.fillRect(c * cell, (floors - 1 - f) * cell, cell, cell);
      }
    }
  }
  // joints between panels
  for (let f = 0; f <= floors; f++) {
    const y = f * cell;
    ctx.fillStyle = 'rgba(60,58,55,0.4)';
    ctx.fillRect(0, y - 1, W, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y + 1, W, 1);
  }
  for (let c = 0; c <= cells; c++) {
    ctx.fillStyle = 'rgba(60,58,55,0.32)';
    ctx.fillRect(c * cell - 1, 0, 2, H);
  }
  // staining running down from the horizontal joints
  for (let f = 0; f < floors; f++) {
    const y = f * cell + 2;
    for (let c = 0; c < cells; c++) {
      if (!rng.chance(0.34)) continue;
      grimeStreak(c * cell + rng.float(4, cell - 4), y, rng.float(2, 9), rng.float(cell * 0.15, cell * 0.55), rng.float(0.05, 0.12));
    }
  }
  // gutters / downspouts
  for (let c = 0; c < cells; c++) {
    if (!rng.chance(0.3)) continue;
    const x = c * cell;
    ctx.fillStyle = 'rgba(72,70,66,0.75)';
    ctx.fillRect(x - 2, 0, 4, H - cell * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - 2, 0, 1.5, H - cell * 0.6);
  }

  const balconyCols = new Set();
  for (let c = 0; c < cells; c++) if (rng.chance(balconyChance)) balconyCols.add(c);

  const lamps = [];
  const streaks = [];
  for (let f = 0; f < floors; f++) {
    const yTop = (floors - 1 - f) * cell;
    for (let c = 0; c < cells; c++) {
      const x = c * cell;
      const isEntrance = f === 0 && c % entranceEvery === entranceEvery - 1;
      if (isEntrance) {
        const lit = rng.chance(0.75);
        const lamp = drawEntrance(ctx, x, yTop, cell, floors, { number, lit });
        if (lamp.lit) lamps.push(lamp);
        continue;
      }
      const w = cell * (f === 0 ? 0.42 : 0.5);
      const h = cell * (f === 0 ? 0.34 : 0.42);
      const xw = x + (cell - w) / 2;
      const yw = yTop + cell * (f === 0 ? 0.34 : 0.28);
      const res = drawWindow(ctx, xw, yw, w, h, rng, { winter, litChance, tv: tvCells ? tvCells.has(`${f}:${c}`) : false });
      // grime washing down from the sill (soft, anchored, low alpha)
      if (rng.chance(0.42)) {
        streaks.push({ x: xw + rng.float(w * 0.2, w * 0.8), y: yw + h + 5, w: rng.float(2, 6), len: rng.float(cell * 0.2, cell * 0.85), a: rng.float(0.08, 0.18) });
        if (rng.chance(0.3)) streaks.push({ x: xw + rng.float(0, w), y: yw + h + 5, w: rng.float(1, 2.6), len: rng.float(cell * 0.15, cell * 0.5), a: rng.float(0.06, 0.12) });
      }
      if (res.lit) {
        // Emissive map: crisp glass + very restrained halo, so the window
        // stays a readable rectangle and not a glowing orb.
        const { inner } = res;
        const cx = res.x + res.w / 2;
        const cy = res.y + res.h / 2;
        const tint = res.cool ? [198, 222, 255] : [255, 183, 94];
        const rgb = `${tint[0]},${tint[1]},${tint[2]}`;
        const rad = Math.max(res.w, res.h) * 0.72;
        const g = gctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${rgb},0.5)`);
        g.addColorStop(0.55, `rgba(${rgb},0.2)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        gctx.fillStyle = g;
        gctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        // lit glass with sharp edges
        gctx.fillStyle = `rgb(${rgb})`;
        gctx.fillRect(inner.x, inner.y, inner.w, inner.h);
        // frames and crossbar stay dark: the window reads as such
        gctx.fillStyle = 'rgba(0,0,0,0.85)';
        for (let p = 1; p < res.panes; p++) {
          const px = inner.x + (inner.w / res.panes) * p;
          gctx.fillRect(px - 1, inner.y, 2.4, inner.h);
        }
        gctx.fillRect(inner.x, inner.y + inner.h * 0.5 - 1, inner.w, 2);
        // curtains: the emissive map repeats the color map's occluders,
        // so half-lit and top-lit windows glow with the same shape
        gctx.fillStyle = 'rgba(0,0,0,0.9)';
        for (const o of res.occluders) {
          gctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }
      if (f > 0 && balconyCols.has(c) && rng.chance(0.9)) {
        drawBalcony(ctx, xw - 3, yw, w + 6, h, rng, { winter });
        // streak from the balcony slab edge
        if (rng.chance(0.55)) {
          streaks.push({ x: xw + rng.float(0, w), y: yw + h + 11, w: rng.float(3, 8), len: rng.float(cell * 0.25, cell * 0.9), a: rng.float(0.09, 0.2) });
        }
      }
    }
  }
  for (const lamp of lamps) {
    const g = gctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 16);
    g.addColorStop(0, 'rgba(255,206,150,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    gctx.fillStyle = g;
    gctx.beginPath();
    gctx.arc(lamp.x, lamp.y, 16, 0, TAU);
    gctx.fill();
  }

  // plinth
  const plinthH = cell * 0.34;
  const pgrad = ctx.createLinearGradient(0, H - plinthH, 0, H);
  pgrad.addColorStop(0, plinth);
  pgrad.addColorStop(1, '#6f6d66');
  ctx.fillStyle = pgrad;
  ctx.fillRect(0, H - plinthH, W, plinthH);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, H - plinthH, W, 2);

  // cornice / parapet
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, 0, W, 7);
  ctx.fillStyle = 'rgba(52,50,48,0.45)';
  ctx.fillRect(0, 7, W, 3);
  if (winter) {
    ctx.fillStyle = 'rgba(250,252,255,0.95)';
    ctx.fillRect(0, 0, W, 3);
  }

  // anchored grime: sills, balcony slabs and joint stains collected above
  for (const s of streaks) grimeStreak(s.x, s.y, s.w, s.len, s.a);

  // long dirt streaks from the cornice and downspout lines
  for (let i = 0; i < cells * 1.5; i++) {
    const x = rng.float(0, W);
    const y = rng.float(0, H - plinthH);
    const len = rng.float(20, 150);
    const grad = ctx.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, 'rgba(58,56,52,0.24)');
    grad.addColorStop(1, 'rgba(58,56,52,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, rng.float(1.5, 6), len);
  }
  for (let i = 0; i < 70; i++) {
    ctx.save();
    ctx.globalAlpha = rng.float(0.05, 0.16);
    ctx.fillStyle = rng.chance(0.5) ? '#3f3d39' : '#e8e4da';
    ctx.beginPath();
    ctx.ellipse(rng.float(0, W), rng.float(0, H), rng.float(10, 60), rng.float(6, 30), rng.float(0, TAU), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // splash zone: damp dark band (~0.8 m) kicked up from the ground
  const splashH = cell * 0.27;
  const sgrad = ctx.createLinearGradient(0, H - splashH, 0, H);
  sgrad.addColorStop(0, 'rgba(42,40,36,0)');
  sgrad.addColorStop(0.55, 'rgba(42,40,36,0.14)');
  sgrad.addColorStop(1, 'rgba(38,36,32,0.42)');
  ctx.fillStyle = sgrad;
  ctx.fillRect(0, H - splashH, W, splashH);
  for (let i = 0; i < cells * 5; i++) {
    ctx.save();
    ctx.globalAlpha = rng.float(0.06, 0.2);
    ctx.fillStyle = rng.chance(0.72) ? '#2e2c28' : '#b9b4a6';
    ctx.beginPath();
    ctx.ellipse(rng.float(0, W), H - rng.float(0, splashH), rng.float(1.5, 7), rng.float(1, 4), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // street name plaque
  const plateW = 66;
  const plateH = 18;
  const px = rng.float(10, Math.max(12, W - plateW - 10));
  const py = H - cell * 0.34 - plateH - 6;
  ctx.fillStyle = '#d9d4c4';
  ctx.fillRect(px, py, plateW, plateH);
  ctx.strokeStyle = 'rgba(70,68,64,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, plateW - 1, plateH - 1);
  ctx.fillStyle = '#2f2f2d';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = `${number}`;
  fitFont(ctx, label, plateW - 46, 11);
  ctx.fillText(label, px + 8 + (plateW - 46) / 2, py + plateH / 2);
  ctx.textAlign = 'left';
  fitFont(ctx, street, 40, 8, 'Arial, sans-serif');
  ctx.fillText(street, px + plateW - 6 - ctx.measureText(street).width, py + plateH / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  return {
    map: toTexture(map),
    emissive: toTexture(glow),
    litChance,
    floors,
    cells,
    tall,
  };
}

/**
 * Snow line clinging to roof parapets and ledges: an alpha strip with a
 * bumpy top edge and sparse drips below. Applied to thin planes under the
 * parapet in winter (see buildings.js).
 */
export function makeSnowLedgeTexture(w = 512, h = 64) {
  const rng = new Rng(7331);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // main bumpy body of snow along the top edge
  ctx.fillStyle = 'rgba(246,250,255,0.97)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h * 0.3);
  for (let x = w; x >= 0; x -= 7) {
    ctx.lineTo(x, h * 0.3 + rng.float(-3, 11));
  }
  ctx.closePath();
  ctx.fill();
  // soft lumps and shaded underside
  for (let i = 0; i < 70; i++) {
    ctx.save();
    ctx.globalAlpha = rng.float(0.1, 0.4);
    ctx.fillStyle = rng.chance(0.6) ? '#ffffff' : '#c9d4e4';
    ctx.beginPath();
    ctx.ellipse(rng.float(0, w), rng.float(0, h * 0.42), rng.float(4, 16), rng.float(2, 6), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // sparse melt drips below the ledge
  for (let i = 0; i < 30; i++) {
    const x = rng.float(0, w);
    const y0 = h * rng.float(0.3, 0.45);
    const len = rng.float(3, h * 0.5);
    const grad = ctx.createLinearGradient(0, y0, 0, y0 + len);
    grad.addColorStop(0, `rgba(228,238,250,${rng.float(0.25, 0.55)})`);
    grad.addColorStop(1, 'rgba(228,238,250,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y0, rng.float(1, 2.4), len);
  }
  return toTexture(canvas);
}

/** Bituminous roof covering, with snow patches (in winter). */
export function makeRoofTexture(winter, size = 512) {  const rng = new Rng(31);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3c3e';
  ctx.fillRect(0, 0, size, size);
  const strips = 8;
  const step = size / strips;
  for (let i = 0; i < strips; i++) {
    const v = rng.float(-10, 10);
    ctx.fillStyle = `rgb(${58 + v},${60 + v},${62 + v})`;
    ctx.fillRect(0, i * step + 1, size, step - 3);
  }
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${rng.int(40, 110)},${rng.int(42, 112)},${rng.int(44, 116)},${rng.float(0.08, 0.3)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 3), rng.float(1, 3));
  }
  for (let i = 0; i < 30; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(20, 80), 'rgba(30,32,34,0.6)', rng.float(0.1, 0.35));
  }
  if (winter) {
    for (let i = 0; i < 60; i++) {
      wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(24, 110), 'rgba(238,244,252,0.9)', rng.float(0.3, 0.8));
    }
  }
  // drains and lifted old roofing membrane
  ctx.strokeStyle = 'rgba(20,22,24,0.5)';
  for (let i = 0; i < 18; i++) {
    ctx.lineWidth = rng.float(1, 3);
    const x = rng.float(0, size);
    ctx.beginPath();
    ctx.moveTo(x, rng.float(0, size * 0.4));
    ctx.lineTo(x + rng.float(-20, 20), rng.float(size * 0.6, size));
    ctx.stroke();
  }
  return toTexture(canvas);
}

/* ------------------------------------------------------------------ props */

export function makeRustTexture(size = 256) {
  const rng = new Rng(88);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7a5b48';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(10, 70), `rgba(${rng.int(96, 158)},${rng.int(52, 92)},${rng.int(28, 54)},0.65)`, rng.float(0.15, 0.5));
  }
  for (let i = 0; i < 60; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(6, 30), `rgba(${rng.int(150, 190)},${rng.int(120, 150)},${rng.int(96, 124)},0.5)`, rng.float(0.1, 0.35));
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(${rng.int(60, 120)},${rng.int(40, 80)},${rng.int(24, 56)},${rng.float(0.06, 0.25)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 3), rng.float(1, 3));
  }
  return toTexture(canvas);
}

/** Corrugated sheet metal of the garage ("rakuška"). */
export function makeCorrugatedTexture(size = 256) {
  const rng = new Rng(404);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5b6166';
  ctx.fillRect(0, 0, size, size);
  const period = 10;
  for (let x = 0; x < size; x += period) {
    const g = ctx.createLinearGradient(x, 0, x + period, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.75, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, period, size);
  }
  for (let i = 0; i < 40; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(8, 46), `rgba(${rng.int(112, 152)},${rng.int(64, 92)},${rng.int(40, 62)},0.55)`, rng.float(0.2, 0.6));
  }
  return toTexture(canvas);
}

/** Birch bark: white with black streaks. */
export function makeBirchTexture(size = 128) {
  const rng = new Rng(66);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#dcdcd4';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${rng.int(40, 90)},${rng.int(40, 88)},${rng.int(38, 84)},${rng.float(0.35, 0.95)})`;
    const w = rng.float(6, 34);
    const h = rng.float(1.5, 5);
    ctx.fillRect(rng.float(0, size), rng.float(0, size), w, h);
  }
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(${rng.int(120, 190)},${rng.int(120, 190)},${rng.int(116, 184)},${rng.float(0.05, 0.2)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), 1.5, 1.5);
  }
  return toTexture(canvas);
}

export function makeBarkTexture(size = 128) {
  const rng = new Rng(67);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b3d31';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(${rng.int(28, 70)},${rng.int(22, 56)},${rng.int(16, 44)},0.7)`;
    ctx.lineWidth = rng.float(1, 3.4);
    const x = rng.float(0, size);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + rng.float(-6, 6), size);
    ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${rng.int(96, 150)},${rng.int(78, 120)},${rng.int(56, 90)},0.35)`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 3), rng.float(4, 26));
  }
  return toTexture(canvas);
}

/** Brickwork, for the heating plant and the chimney base. */
export function makeBrickTexture(size = 256) {
  const rng = new Rng(51);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6d5a4c';
  ctx.fillRect(0, 0, size, size);
  const rows = 10;
  const bh = size / rows;
  const bw = size / 5;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * bw * 0.5;
    for (let c = -1; c < 6; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const v = rng.float(-20, 20);
      ctx.fillStyle = `rgb(${clamp(136 + v, 0, 255) | 0},${clamp(102 + v, 0, 255) | 0},${clamp(84 + v, 0, 255) | 0})`;
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      ctx.fillStyle = `rgba(40,32,26,${rng.float(0.02, 0.16)})`;
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  for (let i = 0; i < 24; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(12, 46), 'rgba(48,46,44,0.35)', rng.float(0.1, 0.3));
  }
  return toTexture(canvas);
}

export function makeMetalTexture(size = 128, base = '#4a4f52') {
  const rng = new Rng(12);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${rng.int(60, 130)},${rng.int(62, 132)},${rng.int(64, 134)},${rng.float(0.05, 0.2)})`;
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, 3), rng.float(1, 6));
  }
  for (let i = 0; i < 26; i++) {
    wrappedBlob(ctx, size, rng.float(0, size), rng.float(0, size), rng.float(8, 30), 'rgba(140,86,52,0.35)', rng.float(0.1, 0.3));
  }
  return toTexture(canvas);
}

/** Sheet with lettering (posters, plaques, signs). */
export function makeSignTexture(w, h, drawFn) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawFn(ctx, w, h);
  return toTexture(canvas);
}

export function posterSlava(w = 512, h = 320) {
  return makeSignTexture(w, h, (ctx, W, H) => {
    const rng = new Rng(9);
    ctx.fillStyle = '#a8231c';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = CREAM;
    starPath(ctx, W * 0.5, H * 0.5, 34, 14);
    ctx.fill();
    // wear
    for (let i = 0; i < 240; i++) {
      ctx.fillStyle = `rgba(${rng.int(30, 90)},${rng.int(26, 70)},${rng.int(22, 60)},${rng.float(0.05, 0.2)})`;
      ctx.fillRect(rng.float(0, W), rng.float(0, H), rng.float(1, 4), rng.float(1, 4));
    }
  });
}

export function posterNewYear(w = 512, h = 320) {
  return makeSignTexture(w, h, (ctx, W, H) => {
    const rng = new Rng(2025);
    ctx.fillStyle = '#17314f';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rng.float(0.15, 0.7)})`;
      ctx.beginPath();
      ctx.arc(rng.float(0, W), rng.float(0, H), rng.float(1, 2.6), 0, TAU);
      ctx.fill();
    }
    // stylized fir tree
    ctx.fillStyle = '#1f4a35';
    for (let i = 0; i < 4; i++) {
      const y = H * 0.34 + i * 30;
      const half = 26 + i * 20;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, y - 42);
      ctx.lineTo(W * 0.5 - half, y);
      ctx.lineTo(W * 0.5 + half, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#5a3b22';
    ctx.fillRect(W * 0.5 - 7, H * 0.86, 14, 26);
    ctx.fillStyle = '#d94a3d';
    starPath(ctx, W * 0.5, H * 0.09, 20, 8.5);
    ctx.fill();
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = `rgba(${rng.int(220, 255)},${rng.int(150, 230)},${rng.int(60, 160)},0.9)`;
      ctx.beginPath();
      ctx.arc(rng.float(W * 0.3, W * 0.7), rng.float(H * 0.3, H * 0.8), rng.float(2, 4), 0, TAU);
      ctx.fill();
    }
  });
}

export function posterFire(w = 400, h = 512) {
  return makeSignTexture(w, h, (ctx, W, H) => {
    ctx.fillStyle = '#e8e2d2';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#2b2b28';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.fillStyle = '#1f4a35';
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.14);
    ctx.lineTo(W * 0.22, H * 0.44);
    ctx.lineTo(W * 0.78, H * 0.44);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c8452f';
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.6);
    ctx.lineTo(W * 0.34, H * 0.48);
    ctx.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.5, H * 0.6);
    ctx.closePath();
    ctx.fill();
  });
}

export function makeManholeTexture(size = 128) {
  return makeSignTexture(size, size, (ctx, W, H) => {
    ctx.fillStyle = '#3e3f3d';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#565855';
    ctx.lineWidth = 3;
    for (let r = 8; r < W * 0.5; r += 12) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2);
      ctx.lineTo(W / 2 + Math.cos(a) * W * 0.48, H / 2 + Math.sin(a) * W * 0.48);
      ctx.stroke();
    }
    ctx.fillStyle = '#2c2d2b';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 9, 0, TAU);
    ctx.fill();
  });
}

/* ------------------------------------------------------------------ particles */

export function makeSoftCircleTexture(size = 64, color = '255,255,255', power = 2.4) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = Math.pow(1 - t, power);
    g.addColorStop(t, `rgba(${color},${a.toFixed(3)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stylized maple/birch leaf, used for particles and litter. */
export function makeLeafTexture(size = 64) {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = '#d98b3a';
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.42);
  ctx.bezierCurveTo(size * 0.3, -size * 0.3, size * 0.42, -size * 0.02, size * 0.24, size * 0.16);
  ctx.bezierCurveTo(size * 0.34, size * 0.26, size * 0.12, size * 0.44, 0, size * 0.34);
  ctx.bezierCurveTo(-size * 0.12, size * 0.44, -size * 0.34, size * 0.26, -size * 0.24, size * 0.16);
  ctx.bezierCurveTo(-size * 0.42, -size * 0.02, -size * 0.3, -size * 0.3, 0, -size * 0.42);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,64,26,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.36);
  ctx.lineTo(0, size * 0.34);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const y = -size * 0.24 + i * size * 0.13;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size * 0.22, y - size * 0.06);
    ctx.moveTo(0, y);
    ctx.lineTo(-size * 0.22, y - size * 0.06);
    ctx.stroke();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSmokeTexture(size = 128) {  const rng = new Rng(17);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const r = rng.float(size * 0.1, size * 0.28);
    const x = size / 2 + rng.float(-size * 0.16, size * 0.16);
    const y = size / 2 + rng.float(-size * 0.16, size * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = rng.float(0.06, 0.18);
    g.addColorStop(0, `rgba(214,218,224,${a})`);
    g.addColorStop(1, 'rgba(214,218,224,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Wide horizontal wisp for the drifting mist planes: an elongated radial
 * gradient with a few offset lobes, fading to zero on every side.
 */
export function makeMistTexture(w = 256, h = 128) {
  const rng = new Rng(241);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    const x = w * 0.5 + rng.float(-w * 0.22, w * 0.22);
    const y = h * 0.5 + rng.float(-h * 0.16, h * 0.16);
    const rx = rng.float(w * 0.16, w * 0.4);
    const ry = rx * rng.float(0.28, 0.5);
    const a = rng.float(0.1, 0.26);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeFootprintTexture(w = 64, h = 96) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, w * 0.24, h * 0.08, w * 0.52, h * 0.62, w * 0.26);
  ctx.fill();
  roundRect(ctx, w * 0.28, h * 0.68, w * 0.44, h * 0.26, w * 0.2);
  ctx.fill();
  // tread
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w * 0.24, h * (0.12 + i * 0.075), w * 0.52, 2.6);
  }
  ctx.fillRect(w * 0.28, h * 0.74, w * 0.44, 2.6);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Light-beam card for the street lamps: an isosceles beam profile, bright
 * under the lamp head and fading downward and sideways, so the silhouette
 * never shows a hard edge. Used on two crossed planes per lamp.
 */
export function makeBeamTexture(w = 128, h = 256) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 = lamp head, 1 = ground
    const half = 0.05 + v * 0.45; // beam half-width as a fraction of w
    // brightest right under the head, dissolving before the ground
    const vert = Math.pow(1 - v, 1.45) * 0.62 * (v > 0.9 ? (1 - v) / 0.1 : 1);
    for (let x = 0; x < w; x++) {
      const u = Math.abs(x / w - 0.5) / half;
      const edge = u >= 1 ? 0 : 1 - u * u;
      const a = Math.max(0, Math.min(1, vert * edge));
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Soft window-shaped glow for the TV flicker quads: a feathered rectangle,
 * slightly brighter toward the top (the set against the ceiling).
 */
export function makeTvGlowTexture(w = 96, h = 72) {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const ramp = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  for (let y = 0; y < h; y++) {
    const fy = ramp(y / h, 0.06, 0.22) * (1 - ramp(y / h, 0.8, 0.98));
    for (let x = 0; x < w; x++) {
      const fx = ramp(x / w, 0.05, 0.2) * (1 - ramp(x / w, 0.8, 0.97));
      const a = fx * fy * (0.7 + 0.3 * (1 - y / h));
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGlowTexture(size = 128, color = '255,190,120') {
  return makeSoftCircleTexture(size, color, 3.2);
}
