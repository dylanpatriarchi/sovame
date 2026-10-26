// The TV in the living-room flats: E at the set turns the knob round the
// channels: the evening news («Время») with the announcer's voice over a
// music bed, figure skating to music, the test card with its steady tone
// late at night, and off. The screen shows the channel and lights the rug
// in front of it; the sound is only for the flat you are in. Live only:
// nothing here draws on the seeded stream.
import * as THREE from 'three';
import { makeCanvas } from './util.js';

export const CHANNELS = [
  { id: 'news', name: 'Programme One: «Время», the evening news', tint: [0.75, 0.85, 1.1] },
  { id: 'skating', name: 'Programme Two: figure skating', tint: [0.95, 1, 1.1] },
  { id: 'test', name: 'The test card, and its tone', tint: [1, 1, 1] },
  { id: 'off', name: 'Off', tint: [0, 0, 0] },
];
const NOTE = 2.5;

function screenTexture(draw, w = 256, h = 192) {
  const canvas = makeCanvas(w, h);
  const c = canvas.getContext('2d');
  draw(c, w, h);
  // the scan lines of a tired tube
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const DRAW = {
  news(c, w, h) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d3768');
    g.addColorStop(1, '#0d1a36');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // the globe behind the desk
    c.strokeStyle = 'rgba(160,190,240,0.35)';
    c.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.ellipse(w * 0.72, h * 0.4, 46 - k * 12, 46, 0, 0, Math.PI * 2);
      c.stroke();
    }
    // the announcer: grey suit, white shirt, neatly combed hair
    c.fillStyle = '#4a4d55';
    c.beginPath();
    c.ellipse(w * 0.38, h * 0.92, 62, 46, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = '#e8e4da';
    c.beginPath();
    c.moveTo(w * 0.38 - 12, h * 0.62);
    c.lineTo(w * 0.38 + 12, h * 0.62);
    c.lineTo(w * 0.38, h * 0.8);
    c.fill();
    c.fillStyle = '#d6b39a';
    c.beginPath();
    c.ellipse(w * 0.38, h * 0.47, 21, 27, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3a2c22';
    c.beginPath();
    c.ellipse(w * 0.38, h * 0.36, 22, 12, 0, Math.PI, 0);
    c.fill();
    // the desk and the caption
    c.fillStyle = '#5a3a24';
    c.fillRect(0, h * 0.86, w, h * 0.14);
    c.fillStyle = '#f2f0ea';
    c.font = 'bold 22px Arial, sans-serif';
    c.fillText('ВРЕМЯ', 14, 30);
  },
  skating(c, w, h) {
    // the ice under the arena lights, the boards and the crowd behind
    c.fillStyle = '#2a2430';
    c.fillRect(0, 0, w, h * 0.35);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${150 + ((i * 37) % 90)},${120 + ((i * 53) % 80)},${110 + ((i * 29) % 70)},0.8)`;
      c.fillRect((i * 97) % w, ((i * 61) % 60) + 2, 2, 3);
    }
    c.fillStyle = '#1c5e9e';
    c.fillRect(0, h * 0.35, w, 14);
    const g = c.createLinearGradient(0, h * 0.35 + 14, 0, h);
    g.addColorStop(0, '#cfe0ee');
    g.addColorStop(1, '#f4f8fb');
    c.fillStyle = g;
    c.fillRect(0, h * 0.35 + 14, w, h);
    c.strokeStyle = 'rgba(120,150,180,0.35)';
    c.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      c.ellipse(w * 0.5, h * 0.75, 30 + k * 18, 10 + k * 6, 0.1, 0, Math.PI * 2);
      c.stroke();
    }
    // the skater in a spin, one arm up, one leg out
    c.strokeStyle = '#7a1428';
    c.lineCap = 'round';
    c.lineWidth = 6;
    const x = w * 0.55;
    const y = h * 0.62;
    c.beginPath();
    c.moveTo(x, y - 26);
    c.lineTo(x, y + 4);
    c.lineTo(x - 3, y + 26);
    c.moveTo(x, y + 4);
    c.lineTo(x + 22, y + 14);
    c.moveTo(x, y - 20);
    c.lineTo(x - 12, y - 42);
    c.moveTo(x, y - 20);
    c.lineTo(x + 16, y - 10);
    c.stroke();
    c.fillStyle = '#e0bfa6';
    c.beginPath();
    c.arc(x, y - 34, 6, 0, Math.PI * 2);
    c.fill();
  },
  test(c, w, h) {
    // the test card: a grid, the big circle, the grey steps and the bars
    c.fillStyle = '#7d7d7d';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f2f2f2';
    c.lineWidth = 1.5;
    for (let x = 8; x < w; x += 20) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 6; y < h; y += 20) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
    c.fillStyle = '#1a1a1a';
    c.beginPath();
    c.arc(w / 2, h / 2, 82, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f2f2f2';
    c.lineWidth = 3;
    c.stroke();
    const bars = ['#f2f2f2', '#e6e23a', '#3ac8d8', '#3ac83a', '#c83ac8', '#d83a3a', '#3a3ad8', '#101010'];
    bars.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(w / 2 - 70 + i * 17.5, h / 2 - 34, 17.5, 30);
    });
    for (let i = 0; i < 8; i++) {
      const v = Math.round(16 + i * 33);
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(w / 2 - 70 + i * 17.5, h / 2 + 2, 17.5, 22);
    }
    c.strokeStyle = '#f2f2f2';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(w / 2, h / 2 + 30);
    c.lineTo(w / 2, h / 2 + 70);
    c.moveTo(w / 2 - 40, h / 2 + 50);
    c.lineTo(w / 2 + 40, h / 2 + 50);
    c.stroke();
    c.fillStyle = '#f2f2f2';
    c.font = 'bold 14px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText('ТИТ-0249', w / 2, h / 2 - 48);
  },
};

export class Television {
  constructor({ world }) {
    this.world = world;
    this.textures = {};
    for (const ch of CHANNELS) if (DRAW[ch.id]) this.textures[ch.id] = screenTexture(DRAW[ch.id]);
    this.channel = new Map(); // flat id -> index into CHANNELS
    this.note = null;
    this.noteT = 0;
    this.sets = (world.flats ?? []).filter((f) => f.tv);
    // this module runs the screens from now on (the flats' own flicker stands down)
    for (const flat of this.sets) {
      flat.tv.manual = true;
      this.#show(flat);
    }
  }

  current(flat) {
    return CHANNELS[this.channel.get(flat.id) ?? 0];
  }

  prompt(flat) {
    const ch = this.current(flat);
    return ch.id === 'off' ? 'E — turn the TV on' : 'E — turn the knob to the next channel';
  }

  /** E at the set: round the channels to off and back on. */
  turn(flat) {
    const i = ((this.channel.get(flat.id) ?? 0) + 1) % CHANNELS.length;
    this.channel.set(flat.id, i);
    this.#show(flat);
    this.note = CHANNELS[i].name;
    this.noteT = NOTE;
    return CHANNELS[i].id;
  }

  #show(flat) {
    const ch = this.current(flat);
    const mat = flat.tv.screenMat;
    const map = this.textures[ch.id] ?? null;
    if (mat.map !== map) {
      mat.map = map;
      mat.needsUpdate = true;
    }
  }

  /** What the set in this flat sounds like: the voice, the music, the tone. */
  soundFor(flat) {
    if (!flat?.tv) return null;
    const id = this.current(flat).id;
    if (id === 'news') return { voice: 1, music: 0.035, tone: 0 };
    if (id === 'skating') return { voice: 0, music: 0.07, tone: 0 };
    if (id === 'test') return { voice: 0, music: 0, tone: 1 };
    return { voice: 0, music: 0, tone: 0 };
  }

  update(dt, t) {
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.note = null;
    }
    for (const flat of this.sets) {
      const tv = flat.tv;
      const ch = this.current(flat);
      if (ch.id === 'off') {
        tv.screenMat.color.setRGB(0.03, 0.035, 0.04);
        tv.glowMat.opacity = 0;
        continue;
      }
      // the picture breathes with the scenes; the test card holds steady
      const k = ch.id === 'test' ? 0.95 : 0.8 + 0.12 * Math.sin(t * 1.7 + tv.phase) * Math.sin(t * 0.63 + tv.phase * 2) + (Math.sin(t * 0.21 + tv.phase) > 0.9 ? 0.1 : 0);
      tv.screenMat.color.setRGB(ch.tint[0] * k, ch.tint[1] * k, ch.tint[2] * k);
      tv.glowMat.opacity = 0.06 + 0.1 * k;
    }
  }
}
