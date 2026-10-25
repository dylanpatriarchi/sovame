// The district map (M): a paper схема микрорайона drawn from the world itself:
// the asphalt, paths and yards from the surface rects, the buildings from
// the larger colliders, the named places from the zones, and a red arrow
// where you stand. North (+z) is up; the drawing is not mirrored, so it
// matches what you see walking about.
import { WORLD } from './config.js';

const PAD = 14; // m of margin round the playable area
const SCALE = 2.6; // px per m on the paper (before CSS fitting)

const FILL = {
  asphalt: '#9a978f',
  stone: '#c9c0aa',
  concrete: '#c9c0aa',
  snow: '#d8dcc4',
  ice: '#b9d3df',
};

export class DistrictMap {
  constructor({ world, camera }) {
    this.world = world;
    this.camera = camera;
    this.open = false;
    this.x0 = -WORLD.boundsWest - PAD;
    this.x1 = WORLD.bounds + PAD;
    this.z0 = -WORLD.boundsSouth - PAD;
    this.z1 = WORLD.boundsNorth + PAD;
    this.w = Math.round((this.x1 - this.x0) * SCALE);
    this.h = Math.round((this.z1 - this.z0) * SCALE);

    this.el = document.createElement('div');
    this.el.id = 'map';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.el.appendChild(this.canvas);
    document.body.appendChild(this.el);
    this.paper = null;
  }

  /** Map pixel of a world point. +z is north (up); +x runs to the left. */
  px(x, z) {
    return [(this.x1 - x) * SCALE, (this.z1 - z) * SCALE];
  }

  rect(c, r) {
    const [ax, az] = this.px(r.maxX, r.maxZ);
    c.fillRect(ax, az, (r.maxX - r.minX) * SCALE, (r.maxZ - r.minZ) * SCALE);
  }

  /** The static drawing, made once (the first time the map is opened). */
  drawPaper() {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    const c = canvas.getContext('2d');
    const W = this.w;
    const H = this.h;
    // the paper, a faint 50 m grid
    c.fillStyle = '#ebe4d0';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(90, 80, 60, 0.12)';
    c.lineWidth = 1;
    for (let x = Math.ceil(this.x0 / 50) * 50; x <= this.x1; x += 50) {
      const [sx] = this.px(x, 0);
      c.beginPath();
      c.moveTo(sx, 0);
      c.lineTo(sx, H);
      c.stroke();
    }
    for (let z = Math.ceil(this.z0 / 50) * 50; z <= this.z1; z += 50) {
      const [, sz] = this.px(0, z);
      c.beginPath();
      c.moveTo(0, sz);
      c.lineTo(W, sz);
      c.stroke();
    }

    // the playable area
    const area = { minX: -WORLD.boundsWest, maxX: WORLD.bounds, minZ: -WORLD.boundsSouth, maxZ: WORLD.boundsNorth };
    c.fillStyle = '#e4ddc6';
    this.rect(c, area);

    // ground: yards and parks first, then paths, then the roads on top
    const order = ['snow', 'ice', 'stone', 'concrete', 'asphalt'];
    const surfaces = this.world.surfaceRects.filter((r) => order.includes(r.type) && !this.world.interiorAt?.(0.5 * (r.minX + r.maxX), 0.5 * (r.minZ + r.maxZ)));
    for (const type of order) {
      c.fillStyle = FILL[type];
      for (const r of surfaces) if (r.type === type) this.rect(c, r);
    }

    // buildings: the big footprints among the colliders
    c.fillStyle = '#b8846a';
    c.strokeStyle = '#6d4636';
    c.lineWidth = 1.5;
    for (const r of this.world.colliders) {
      const w = r.maxX - r.minX;
      const d = r.maxZ - r.minZ;
      if (Math.min(w, d) < 3.5 || w * d < 40) continue;
      this.rect(c, r);
      const [ax, az] = this.px(r.maxX, r.maxZ);
      c.strokeRect(ax, az, w * SCALE, d * SCALE);
    }

    // names: the outer districts big and faint, then the streets along their
    // length, then the places, smallest first, each where it does not cover
    // a name already written (nudged a little, or left out)
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    const placed = [];
    const free = (x, y, w, h) => !placed.some((q) => Math.abs(q.x - x) * 2 < q.w + w && Math.abs(q.y - y) * 2 < q.h + h);
    const centre = (z) => this.px((z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2);
    const districts = this.world.zones.filter((z) => /микрорайон/i.test(z.name));
    const streets = this.world.zones.filter((z) => /^Улица/.test(z.name));
    const places = this.world.zones.filter((z) => !districts.includes(z) && !streets.includes(z)).sort((a, b) => a.area - b.area);
    c.font = 'italic bold 30px Georgia, serif';
    c.fillStyle = 'rgba(80, 60, 40, 0.22)';
    for (const z of districts) {
      // the home district spans the whole old map: its name is in the title
      if (z.x0 <= 0 && z.x1 >= 0 && z.z0 <= 0 && z.z1 >= 0) continue;
      const [cx, cy] = centre(z);
      c.fillText(z.name.toUpperCase(), cx, cy);
    }
    c.font = 'italic 17px Georgia, serif';
    c.fillStyle = '#3d3a35';
    for (const z of streets) {
      const [cx, cy] = centre(z);
      const upright = z.z1 - z.z0 > z.x1 - z.x0;
      const w = c.measureText(z.name).width + 8;
      c.save();
      c.translate(cx, cy);
      if (upright) c.rotate(-Math.PI / 2);
      c.fillText(z.name, 0, 0);
      c.restore();
      placed.push(upright ? { x: cx, y: cy, w: 22, h: w } : { x: cx, y: cy, w, h: 22 });
    }
    c.font = '600 14px Arial, sans-serif';
    c.strokeStyle = 'rgba(235, 228, 208, 0.92)';
    c.lineWidth = 4;
    c.fillStyle = '#2d2a26';
    for (const z of places) {
      const [cx, cy] = centre(z);
      const w = c.measureText(z.name).width + 6;
      const h = 18;
      const at = [0, -18, 18, -36, 36].map((dy) => [cx, cy + dy]).find(([x, y]) => free(x, y, w, h));
      if (!at) continue;
      placed.push({ x: at[0], y: at[1], w, h });
      c.strokeText(z.name, at[0], at[1]);
      c.fillText(z.name, at[0], at[1]);
    }

    // the bus stop
    const stop = this.world.points.busStop;
    if (stop) {
      const [sx, sy] = this.px(stop.x, stop.z);
      c.fillStyle = '#ece3d3';
      c.strokeStyle = '#2d2a26';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(sx, sy, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#2d2a26';
      c.font = 'bold 12px Arial, sans-serif';
      c.fillText('А', sx, sy + 1);
    }

    // title block, north arrow and scale
    c.fillStyle = '#2d2a26';
    c.textAlign = 'left';
    c.font = 'bold 30px Arial Narrow, Arial, sans-serif';
    c.fillText('СХЕМА МИКРОРАЙОНА № 7', 28, 40);
    c.font = '15px Arial, sans-serif';
    c.fillText('Северный · 1964', 28, 66);
    const nx = W - 52;
    c.beginPath();
    c.moveTo(nx, 26);
    c.lineTo(nx - 11, 62);
    c.lineTo(nx, 54);
    c.lineTo(nx + 11, 62);
    c.closePath();
    c.fill();
    c.textAlign = 'center';
    c.font = 'bold 16px Arial, sans-serif';
    c.fillText('С', nx, 78);
    const bar = 50 * SCALE;
    c.fillRect(28, H - 34, bar, 5);
    c.fillStyle = '#ebe4d0';
    c.fillRect(28 + bar / 2, H - 33, bar / 2 - 1, 3);
    c.fillStyle = '#2d2a26';
    c.textAlign = 'left';
    c.font = '13px Arial, sans-serif';
    c.fillText('0', 26, H - 46);
    c.fillText('50 м', 28 + bar - 14, H - 46);
    // a worn edge
    c.strokeStyle = 'rgba(60, 50, 35, 0.5)';
    c.lineWidth = 6;
    c.strokeRect(3, 3, W - 6, H - 6);
    this.paper = canvas;
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) this.update(this.lastPos ?? this.camera.position);
    return this.open;
  }

  /** Redraws the "you are here" arrow (only while the map is open). */
  update(pos) {
    this.lastPos = pos;
    if (!this.open) return;
    if (!this.paper) this.drawPaper();
    const c = this.canvas.getContext('2d');
    c.drawImage(this.paper, 0, 0);
    const [sx, sy] = this.px(pos.x, pos.z);
    // the view direction, flattened onto the map
    const e = this.camera.matrixWorld.elements;
    const fx = -e[8];
    const fz = -e[10];
    const [tx, ty] = this.px(pos.x + fx, pos.z + fz);
    const a = Math.atan2(ty - sy, tx - sx);
    c.save();
    c.translate(sx, sy);
    c.fillStyle = 'rgba(190, 30, 30, 0.18)';
    c.beginPath();
    c.arc(0, 0, 22, 0, Math.PI * 2);
    c.fill();
    c.rotate(a);
    c.fillStyle = '#c0261f';
    c.strokeStyle = '#ebe4d0';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(14, 0);
    c.lineTo(-9, -9);
    c.lineTo(-4, 0);
    c.lineTo(-9, 9);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    c.fillStyle = '#c0261f';
    c.font = 'bold 14px Arial, sans-serif';
    c.textAlign = 'left';
    c.lineJoin = 'round';
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(235, 228, 208, 0.95)';
    c.strokeText('Вы здесь', sx + 18, sy - 16);
    c.fillText('Вы здесь', sx + 18, sy - 16);
  }
}
