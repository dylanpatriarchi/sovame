// The map (M): the town, the bay and the islands drawn from the same data
// the world is built from, with where you are and where the parcel goes.
import { BLOCKS, PUBLIC, STREETS, PADS, HOME, footprint, publicRect, streetRect } from './world/town.js';
import { isIce, isWater, ROUTES } from './world/land.js';

const BOUNDS = { x0: -780, x1: 1740, z0: -980, z1: 440 };
const CELL = 10;
const PAD_NAMES = { town: 'Полярный', medvezhiy: 'о. Медвежий', rudny: 'пос. Рудный' };

export class GameMap {
  constructor({ world, camera, errands }) {
    Object.assign(this, { world, camera, errands });
    this.canvas = document.getElementById('map');
    this.open = false;
    this.t = 0;
    this.base = null;
  }

  toggle(on = !this.open) {
    this.open = on;
    this.canvas.classList.toggle('hidden', !on);
    if (on) this.draw(0);
  }

  /** Land, ice and open water, sampled once. */
  ground() {
    const w = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL);
    const h = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      const z = BOUNDS.z1 - (j + 0.5) * CELL;
      for (let i = 0; i < w; i++) {
        const x = BOUNDS.x0 + (i + 0.5) * CELL;
        const c = isWater(x, z) ? [20, 46, 62] : isIce(x, z) ? [104, 128, 141] : [44, 51, 58];
        image.data.set([c[0], c[1], c[2], 255], (j * w + i) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  update(dt, t) {
    if (!this.open) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.12;
      this.draw(t);
    }
  }

  draw(t) {
    const { canvas, world, camera } = this;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = Math.round(window.innerWidth * 0.86);
    const H = Math.round(window.innerHeight * 0.8);
    const scale = Math.min(W / (BOUNDS.x1 - BOUNDS.x0), H / (BOUNDS.z1 - BOUNDS.z0));
    const cw = Math.round((BOUNDS.x1 - BOUNDS.x0) * scale);
    const ch = Math.round((BOUNDS.z1 - BOUNDS.z0) * scale);
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }
    this.base ??= this.ground();
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base, 0, 0, cw, ch);
    const X = (x) => (x - BOUNDS.x0) * scale;
    const Z = (z) => (BOUNDS.z1 - z) * scale;
    const rect = (r) => ctx.fillRect(X(r.x0), Z(r.z1), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);

    // roads out of town, then the streets
    ctx.strokeStyle = '#7d858a';
    ctx.lineWidth = 1.4;
    for (const route of ROUTES) {
      ctx.beginPath();
      route.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
      ctx.stroke();
    }
    ctx.fillStyle = '#8d9498';
    for (const s of STREETS) rect(streetRect(s));
    ctx.fillStyle = '#cdbb9f';
    for (const b of BLOCKS) rect(footprint(b));
    for (const p of PUBLIC) {
      ctx.fillStyle = p.inside ? '#e0a64a' : '#9fb0b8';
      rect(publicRect(p));
    }

    // names, each on a dark halo so they read over anything
    const fill = ctx.fillText.bind(ctx);
    ctx.lineJoin = 'round';
    ctx.fillText = (text, x, y) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(11, 15, 20, 0.85)';
      ctx.lineWidth = 3;
      ctx.strokeText(text, x, y);
      ctx.restore();
      fill(text, x, y);
    };
    ctx.textAlign = 'center';
    ctx.font = '600 12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ece3d3';
    for (const pad of PADS) ctx.fillText(PAD_NAMES[pad.id] ?? '', X((pad.x0 + pad.x1) / 2), Z(pad.z1) - 8);
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#e0a64a';
    for (const p of PUBLIC) if (p.inside) ctx.fillText(p.sign, X(p.x), Z(p.z + p.d / 2) - 3);
    ctx.fillStyle = '#aebbc2';
    const far = world.points.lighthouse;
    if (far) ctx.fillText(`↑ Маяк · ${((far.z - BOUNDS.z1) / 1000).toFixed(1)} km`, X(Math.min(far.x, BOUNDS.x1 - 80)), 14);
    const look = world.points.lookout;
    if (look) ctx.fillText('Смотровая', X(look.x), Z(look.z) - 6);

    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(x), Z(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    // home, the boats
    const home = world.doors.find((d) => d.label === 'home');
    if (home) {
      dot(home.x, home.z, 3.5, '#7fd08a');
      ctx.fillStyle = '#7fd08a';
      ctx.fillText(`дом · ${HOME.flat}`, X(home.x), Z(home.z) + 14);
    }
    for (const boat of world.boats ?? []) {
      dot(boat.x, boat.z, 3, '#ffffff');
      ctx.fillStyle = '#ffffff';
      ctx.fillText('лодка', X(boat.x), Z(boat.z) + 13);
    }
    // the parcel
    const job = this.errands?.job;
    if (job) {
      const pulse = 5 + 2.5 * Math.sin(t * 5);
      ctx.strokeStyle = '#ff5a48';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(job.door.x), Z(job.door.z), pulse + 3, 0, Math.PI * 2);
      ctx.stroke();
      dot(job.door.x, job.door.z, 3, '#ff5a48');
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText(job.door.address, X(job.door.x), Z(job.door.z) - 13);
    }
    delete ctx.fillText;
    // you: an arrow the way the camera looks (rooms are far off the map)
    const here = world.inside ? (this.errands?.actions.lastDoor ?? camera.position) : camera.position;
    const dir = camera.getWorldDirection(this.dir ?? (this.dir = camera.position.clone()));
    const a = Math.atan2(dir.x, dir.z);
    ctx.save();
    ctx.translate(X(here.x), Z(here.z));
    ctx.rotate(a);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b0f14';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
