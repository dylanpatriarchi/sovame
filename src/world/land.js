// The land: one analytic height function for the whole (endless) world and
// the ground meshes that follow the camera across it. The town stands on a
// flat pad at y = 0; past its edge the tundra rolls away forever — low bald
// hills, tussocks of dry grass and dark stones through the snow.
import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';
import { hash2, noise2 } from './noise.js';
import { ROUTES, SEA_Y, SOPKA, coastX, initRoutes, routeAt } from './routes.js';

import { PADS } from './town.js';

/** The flat pad the town is built on (m). */
export const TOWN_PAD = PADS[0];
const ISLANDS = PADS.filter((p) => p.island);
/** How far an island's shore runs out from its pad. */
const ISLAND_SHORE = 120;
/** Width of the ramp from the pad up into the hills. */
const PAD_BLEND = 220;
/** Height queries and the near mesh share this grid, so wheels and boots
 * meet exactly the surface that is drawn. */
const CELL = 6;

function rectDistance(p, x, z) {
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dz = Math.max(p.z0 - z, 0, z - p.z1);
  return Math.hypot(dx, dz);
}

/** Distance (m) from the nearest pad (the town or an island); 0 on one. */
export function padDistance(x, z) {
  // everything east of the mainland shore belongs to the islands
  if (x < 900) return rectDistance(TOWN_PAD, x, z);
  let best = Infinity;
  for (const p of ISLANDS) best = Math.min(best, rectDistance(p, x, z));
  return best;
}

/** The terrain before any road is cut into it: broad hills, rolls,
 * hummocks, the sopka west of town, the sea bed east of the shore. */
function landBase(x, z) {
  if (x >= 900) return seaBed(x, z);
  const d = padDistance(x, z);
  if (d <= 0) return 0;
  const k = smoothstep(0, PAD_BLEND, d);
  // sopki: wide bald hills, sharpened a little so valleys stay broad
  const broad = noise2(x / 940, z / 940, 11);
  const hills = (broad * 0.5 + 0.5) ** 1.6 * 62;
  const rolls = noise2(x / 310 + 9.3, z / 310 - 4.1, 23) * 11;
  const bumps = noise2(x / 96 - 2.7, z / 96 + 6.6, 37) * 2.6;
  const hummocks = noise2(x / 31, z / 31, 51) * 0.5;
  const sx = x - SOPKA.x;
  const sz = z - SOPKA.z;
  const sopka = SOPKA.h * Math.exp(-(sx * sx + sz * sz) / (2 * SOPKA.sigma * SOPKA.sigma));
  const land = k * (hills + rolls + bumps + sopka + 4) + k * k * hummocks;
  // the shore: the land sinks under the bay ice
  const s = smoothstep(-150, 24, x - coastX(z));
  return land * (1 - s) * (1 - s) - 5 * s;
}

/** Out in the bay: the sea bed, and the islands standing up out of it —
 * a low stony rim round each pad, then a beach running down under the
 * water. */
function seaBed(x, z) {
  const d = padDistance(x, z);
  if (d <= 0) return 0;
  if (d >= ISLAND_SHORE) return -5;
  const t = smoothstep(0, ISLAND_SHORE, d);
  const rim = Math.sin(Math.PI * clamp(d / 70, 0, 1)) * (0.9 + 1.5 * (noise2(x / 60, z / 60, 83) * 0.5 + 0.5));
  return rim * (1 - t) - 5 * t + noise2(x / 23, z / 23, 89) * 0.35 * (1 - t);
}

/** The exact terrain height, with the roads cut and filled into it. */
export function landExact(x, z) {
  if (padDistance(x, z) <= 0) return 0;
  const h = landBase(x, z);
  const r = routeAt(x, z);
  if (!r) return h;
  // level well past the verges (the mesh grid is coarse), then a long bank
  const w = 1 - smoothstep(r.half + 9, r.half + 30, r.d);
  return h + (r.h - h) * w;
}

initRoutes(landBase, (x, z) => padDistance(x, z) <= 0);

function bilinear(x, z) {
  const gx = Math.floor(x / CELL);
  const gz = Math.floor(z / CELL);
  const fx = x / CELL - gx;
  const fz = z / CELL - gz;
  const x0 = gx * CELL;
  const z0 = gz * CELL;
  const a = landExact(x0, z0);
  const b = landExact(x0 + CELL, z0);
  const c = landExact(x0, z0 + CELL);
  const d = landExact(x0 + CELL, z0 + CELL);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** The surface you stand and drive on: the ground as drawn (bilinear over
 * the mesh grid), or the sea ice where the ground is under it. */
export function landHeight(x, z) {
  if (padDistance(x, z) <= 0) return 0;
  return Math.max(bilinear(x, z), SEA_Y);
}

/** How far the fast ice reaches out from the mainland shore. The port
 * keeps a channel open, so the mole ends in open water. */
export function iceEdge(z) {
  return coastX(z) + 150 + noise2(z / 210, 4.4, 97) * 34 - 112 * Math.exp(-(((z - 60) / 90) ** 2));
}

/** True over open water: the bay beyond the fast ice. */
export function isWater(x, z) {
  if (x < 440) return false;
  return x > iceEdge(z) && padDistance(x, z) > 0 && bilinear(x, z) < SEA_Y;
}

/** True over the frozen bay (and every frozen lake inland). */
export function isIce(x, z) {
  return padDistance(x, z) > 0 && bilinear(x, z) < SEA_Y && !isWater(x, z);
}

export { SEA_Y, ROUTES };

/* ---------------------------------------------------------- ground meshes */

/** A square grid of ground that re-centers on the camera in whole steps and
 * resamples the height function — the same patch of mesh, forever. */
class GroundRing {
  constructor({ cell, segments, snap, material, tile, drop = 0, hole = 0 }) {
    this.cell = cell;
    this.n = segments;
    this.snap = snap;
    this.tile = tile;
    this.drop = drop;
    this.hole = hole;
    this.cx = NaN;
    this.cz = NaN;
    const count = (segments + 1) ** 2;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.uv = new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('uv', this.uv);
    geo.setAttribute('normal', this.nor);
    const index = new Uint32Array(segments * segments * 6);
    let k = 0;
    const row = segments + 1;
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * row + i;
        index[k++] = a;
        index[k++] = a + row;
        index[k++] = a + 1;
        index[k++] = a + 1;
        index[k++] = a + row;
        index[k++] = a + row + 1;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.heights = new Float32Array(count);
  }

  update(x, z) {
    const cx = Math.round(x / this.snap) * this.snap;
    const cz = Math.round(z / this.snap) * this.snap;
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const { n, cell, pos, uv, nor, heights, tile } = this;
    const row = n + 1;
    const half = (n * cell) / 2;
    const p = pos.array;
    const u = uv.array;
    for (let j = 0; j <= n; j++) {
      const wz = cz - half + j * cell;
      for (let i = 0; i <= n; i++) {
        const wx = cx - half + i * cell;
        const idx = j * row + i;
        let h = landExact(wx, wz);
        heights[idx] = h;
        h -= this.drop;
        // the finer ring covers the middle: sink this one out of its way
        if (this.hole && Math.abs(wx - x) < this.hole && Math.abs(wz - z) < this.hole) h -= 40;
        p[idx * 3] = wx;
        p[idx * 3 + 1] = h;
        p[idx * 3 + 2] = wz;
        u[idx * 2] = wx / tile;
        u[idx * 2 + 1] = wz / tile;
      }
    }
    // normals from the height grid (central differences)
    const q = nor.array;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const idx = j * row + i;
        const hl = heights[j * row + Math.max(i - 1, 0)];
        const hr = heights[j * row + Math.min(i + 1, n)];
        const hd = heights[Math.max(j - 1, 0) * row + i];
        const hu = heights[Math.min(j + 1, n) * row + i];
        const nx = hl - hr;
        const nz = hd - hu;
        const ny = 2 * cell;
        const inv = 1 / Math.hypot(nx, ny, nz);
        q[idx * 3] = nx * inv;
        q[idx * 3 + 1] = ny * inv;
        q[idx * 3 + 2] = nz * inv;
      }
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

/* ---------------------------------------------------------- tundra scatter */

function makeTussockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const c = canvas.getContext('2d');
  let s = 91;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 150; i++) {
    const x = 8 + rnd() * 112;
    const lean = (rnd() - 0.5) * 26;
    const h = 16 + rnd() * 44;
    const tone = rnd();
    c.strokeStyle = tone < 0.5 ? `rgba(${150 + tone * 60},${128 + tone * 50},${78 + tone * 30},1)` : `rgba(${96 + tone * 40},${84 + tone * 34},${58 + tone * 20},1)`;
    c.lineWidth = 1 + rnd() * 1.4;
    c.beginPath();
    c.moveTo(x, 64);
    c.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h);
    c.stroke();
  }
  // snow caught in the base
  const grad = c.createLinearGradient(0, 50, 0, 64);
  grad.addColorStop(0, 'rgba(226,232,240,0)');
  grad.addColorStop(1, 'rgba(226,232,240,0.95)');
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = grad;
  c.fillRect(0, 50, 128, 14);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Three crossed blades of grass, lit like the ground they stand on. */
function makeTussockGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const dx = Math.cos(a) * 0.6;
    const dz = Math.sin(a) * 0.6;
    parts.push([-dx, 0, -dz, 0, 0], [dx, 0, dz, 1, 0], [dx, 0.55, dz, 1, 1], [-dx, 0.55, -dz, 0, 1]);
  }
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  parts.forEach((v, i) => {
    pos.push(v[0], v[1], v[2]);
    uv.push(v[3], v[4]);
    nor.push(0, 1, 0);
    if (i % 4 === 3) idx.push(i - 3, i - 2, i - 1, i - 3, i - 1, i);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

const SCATTER_CELL = 7;
const SCATTER_RANGE = 196;
const MAX_TUSSOCKS = 2600;
const MAX_STONES = 420;
const MAX_FLOES = 520;

/** Bay ice: wind-packed snow over blue-grey ice, cracks, old ski-doo trails. */
function makeSeaIceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = '#dfe6ee';
  c.fillRect(0, 0, 512, 512);
  let s = 577;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  // scoured patches of bare ice
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const rx = 18 + rnd() * 70;
    const ry = 6 + rnd() * 20;
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rx);
      g.addColorStop(0, `rgba(${150 + rnd() * 20},${172 + rnd() * 16},${192 + rnd() * 14},0.55)`);
      g.addColorStop(1, 'rgba(160,180,198,0)');
      c.fillStyle = g;
      c.save();
      c.translate(x + ox, y + oy);
      c.scale(1, ry / rx);
      c.translate(-x - ox, -y - oy);
      c.fillRect(x + ox - rx, y + oy - rx, rx * 2, rx * 2);
      c.restore();
    }
  }
  // sastrugi: long low drifts all combed one way by the wind
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const len = 10 + rnd() * 46;
    c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(176,190,208,0.35)';
    c.lineWidth = 0.6 + rnd() * 1.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len, y + len * 0.12);
    c.stroke();
  }
  // cracks
  c.strokeStyle = 'rgba(84,108,132,0.5)';
  c.lineWidth = 0.9;
  for (let i = 0; i < 9; i++) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    c.beginPath();
    c.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      x += (rnd() - 0.5) * 70;
      y += (rnd() - 0.5) * 70;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Grass and stones around the camera: every 7 m cell of the world decides
 * from its own coordinates what grows there, so the tundra is the same
 * each time you come back to it. */
class Scatter {
  constructor(group) {
    const grassMat = new THREE.MeshStandardMaterial({
      map: makeTussockTexture(),
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    this.tussocks = new THREE.InstancedMesh(makeTussockGeometry(), grassMat, MAX_TUSSOCKS);
    const stoneGeo = new THREE.DodecahedronGeometry(0.5, 0);
    stoneGeo.scale(1, 0.55, 0.8);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77746f, roughness: 0.96, flatShading: true });
    this.stones = new THREE.InstancedMesh(stoneGeo, stoneMat, MAX_STONES);
    this.stones.castShadow = true;
    // rafted ice: slabs pushed up along the pressure ridges of the bay
    const floeGeo = new THREE.BoxGeometry(1, 0.34, 0.8);
    const floeMat = new THREE.MeshStandardMaterial({ color: 0xcfe0ee, roughness: 0.5, flatShading: true });
    this.floes = new THREE.InstancedMesh(floeGeo, floeMat, MAX_FLOES);
    this.floes.castShadow = true;
    for (const mesh of [this.tussocks, this.stones, this.floes]) {
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      group.add(mesh);
    }
    this.cx = NaN;
    this.cz = NaN;
    this.dummy = new THREE.Object3D();
  }

  update(x, z) {
    const snap = SCATTER_CELL * 4;
    const cx = Math.round(x / snap) * snap;
    const cz = Math.round(z / snap) * snap;
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const d = this.dummy;
    let nt = 0;
    let ns = 0;
    let nf = 0;
    const i0 = Math.floor((cx - SCATTER_RANGE) / SCATTER_CELL);
    const i1 = Math.floor((cx + SCATTER_RANGE) / SCATTER_CELL);
    const j0 = Math.floor((cz - SCATTER_RANGE) / SCATTER_CELL);
    const j1 = Math.floor((cz + SCATTER_RANGE) / SCATTER_CELL);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const r = hash2(i, j, 71);
        const px = (i + hash2(i, j, 72)) * SCATTER_CELL;
        const pz = (j + hash2(i, j, 73)) * SCATTER_CELL;
        const pad = padDistance(px, pz);
        if (pad < 14) continue;
        const ground = landHeight(px, pz);
        if (ground <= SEA_Y) {
          // ridges run in long wandering lines; smooth ice between them
          const ridge = Math.abs(noise2(px / 130, pz / 130, 91));
          if (ridge < 0.05 && r < 0.75 && nf < MAX_FLOES) {
            const s = 1 + hash2(i, j, 74) ** 2 * 3.4;
            d.position.set(px, SEA_Y + s * 0.2, pz);
            d.rotation.set((hash2(i, j, 75) - 0.5) * 1.5, r * 40, (hash2(i, j, 76) - 0.5) * 1.2);
            d.scale.set(s, s, s);
            d.updateMatrix();
            this.floes.setMatrixAt(nf++, d.matrix);
          }
          continue;
        }
        const road = routeAt(px, pz);
        if (road && road.d < road.half + 3) continue;
        // grass gathers in patches, stones on the wind-scoured rises
        const patch = noise2(px / 140, pz / 140, 81) * 0.5 + 0.5;
        const scree = noise2(px / 75 + 3.1, pz / 75 - 1.7, 83) * 0.5 + 0.5;
        const size = hash2(i, j, 74);
        if (r < 0.1 + patch * patch * 0.62 && nt < MAX_TUSSOCKS) {
          const s = 0.55 + size * 0.8;
          d.position.set(px, ground - 0.04, pz);
          d.rotation.set(0, r * 40, 0);
          d.scale.set(s, s * (0.7 + hash2(i, j, 75) * 0.7), s);
          d.updateMatrix();
          this.tussocks.setMatrixAt(nt++, d.matrix);
        } else if (r > 0.985 - scree * scree * 0.09 && ns < MAX_STONES) {
          const s = 0.4 + size * size * 1.5;
          d.position.set(px, ground + s * 0.08, pz);
          d.rotation.set(size * 0.5, r * 90, hash2(i, j, 76) * 0.5);
          d.scale.set(s, s, s);
          d.updateMatrix();
          this.stones.setMatrixAt(ns++, d.matrix);
        }
      }
    }
    this.tussocks.count = nt;
    this.stones.count = ns;
    this.floes.count = nf;
    this.floes.instanceMatrix.needsUpdate = true;
    this.tussocks.instanceMatrix.needsUpdate = true;
    this.stones.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------------------------------------------------- land */

export class Land {
  constructor({ group, material, tile = 40 }) {
    // near: 6 m cells out to 360 m; far: 48 m cells out to ~2.9 km
    this.near = new GroundRing({ cell: CELL, segments: 120, snap: CELL * 4, material, tile });
    this.far = new GroundRing({ cell: 48, segments: 120, snap: 96, material, tile, drop: 1.2, hole: 200 });
    this.far.mesh.receiveShadow = false;
    group.add(this.near.mesh, this.far.mesh);
    // the bay (and every tundra lake): one sheet of ice under the land
    const iceTex = makeSeaIceTexture();
    const SEA_SIZE = 9600;
    this.seaTile = 96;
    iceTex.repeat.set(SEA_SIZE / this.seaTile, SEA_SIZE / this.seaTile);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE), new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.62 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    sea.receiveShadow = true;
    sea.frustumCulled = false;
    this.sea = sea;
    group.add(sea);
    // open water beyond the fast ice: a dark strip laid over the ice sheet
    // from the ice edge out to sea, re-cut as the camera moves along it
    const ROWS = 240;
    this.waterStep = 40;
    const wgeo = new THREE.BufferGeometry();
    this.waterPos = new THREE.BufferAttribute(new Float32Array((ROWS + 1) * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    wgeo.setAttribute('position', this.waterPos);
    const widx = [];
    for (let r = 0; r < ROWS; r++) widx.push(r * 2, r * 2 + 2, r * 2 + 1, r * 2 + 2, r * 2 + 3, r * 2 + 1);
    wgeo.setIndex(widx);
    const normals = new Float32Array((ROWS + 1) * 2 * 3);
    for (let i = 0; i < (ROWS + 1) * 2; i++) normals[i * 3 + 1] = 1;
    wgeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.waterRows = ROWS;
    this.waterTime = { value: 0 };
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x15364a, roughness: 0.22, metalness: 0.35 });
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWaterPos;')
        // a short chop: the normal rocks with two crossing wave trains
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          vec2 wp = vWaterPos.xz;
          float wa = sin(wp.x * 0.9 + uTime * 1.3) + sin(wp.y * 1.3 - uTime * 1.1) + sin((wp.x + wp.y) * 0.37 + uTime * 0.7);
          float wb = cos(wp.x * 1.1 - uTime * 0.9) + cos(wp.y * 0.8 + uTime * 1.4) + cos((wp.x - wp.y) * 0.45 - uTime * 0.6);
          normal = normalize(normal + (viewMatrix * vec4(wa * 0.05, 0.0, wb * 0.05, 0.0)).xyz);`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (0.25 + 0.12 * sin(vWaterPos.x * 0.21 + vWaterPos.z * 0.17 + uTime));');
    };
    this.water = new THREE.Mesh(wgeo, waterMat);
    this.water.frustumCulled = false;
    this.water.receiveShadow = false;
    this.waterZ = NaN;
    group.add(this.water);
    this.scatter = new Scatter(group);
    this.update(0, 0);
  }

  update(x, z) {
    this.near.update(x, z);
    // the far ring only resamples on its own (coarser) steps; its sunken
    // middle is measured from the snapped center, so it never drifts
    this.far.update(Math.round(x / 96) * 96, Math.round(z / 96) * 96);
    this.scatter.update(x, z);
    // whole texture tiles, so the ice never slides under your wheels
    this.sea.position.x = Math.round(x / this.seaTile) * this.seaTile;
    this.sea.position.z = Math.round(z / this.seaTile) * this.seaTile;
    const wz = Math.round(z / this.waterStep) * this.waterStep;
    if (wz !== this.waterZ) {
      this.waterZ = wz;
      const half = (this.waterRows / 2) * this.waterStep;
      for (let r = 0; r <= this.waterRows; r++) {
        const rz = wz - half + r * this.waterStep;
        this.waterPos.setXYZ(r * 2, iceEdge(rz), SEA_Y + 0.05, rz);
        this.waterPos.setXYZ(r * 2 + 1, 9000, SEA_Y + 0.05, rz);
      }
      this.waterPos.needsUpdate = true;
    }
  }

  /** Moves the chop on the open water. */
  tick(t) {
    this.waterTime.value = t;
  }
}

/** Slope along a heading at a point: rise per metre over a wheelbase. */
export function landSlope(x, z, dirX, dirZ, span = 1.3) {
  return clamp((landHeight(x + dirX * span, z + dirZ * span) - landHeight(x - dirX * span, z - dirZ * span)) / (span * 2), -1, 1);
}
