// What makes the town an Arctic one: the heat-and-power plant and its
// striped chimneys, heating mains boxed above the frozen ground with arches
// over the streets, tin garages, shipping containers used as sheds, roofs
// bristling with aerials, the port mole with its cranes and a ship caught in
// the ice, the lighthouse at the end of the coast road, the viewpoint on the
// hill. Nearly everything is baked into three merged meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, PIPES, GARAGE_ROWS, FLOOR_H, toWorld } from './town.js';
import { buildFurniture } from './furniture.js';
import { ROUTES, SEA_Y } from './routes.js';
import { landHeight } from './land.js';
import { hash2, seeded } from './noise.js';
import { makeSmokeTexture, makeGlowTexture } from '../textures.js';

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

function paint(geo, color, color2 = null) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const a = color.isColor ? color : lin(color);
  if (color2 === null) {
    for (let i = 0; i < n; i++) a.toArray(col, i * 3);
  } else {
    // vertical gradient: grime climbing up from the ground
    const b = color2.isColor ? color2 : lin(color2);
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = (geo.attributes.position.getY(i) - min.y) / (max.y - min.y || 1);
      tmp.copy(b).lerp(a, t).toArray(col, i * 3);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Scales a box's UVs to metres, so a tiling texture keeps its grain. */
function metricUv(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return geo;
}

/** Same dusk lift the facades get: unlit walls keep a little of their own
 * colour instead of dropping to black silhouettes. */
function liftAtDusk(world, material, strength = 3.5) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFacadeLift = world.facadeLift;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFacadeLift;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uFacadeLift * ${strength.toFixed(1)};`);
  };
  // three.js shares programs between materials whose hook reads the same
  material.customProgramCacheKey = () => `dusk-lift-${strength}`;
  return material;
}

/** Pale ribbed sheet metal: the paint colour comes from the vertices. */
function makeRibTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = '#f2f2f0';
  c.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    const g = c.createLinearGradient(x, 0, x + 8, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.3)');
    g.addColorStop(0.35, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = g;
    c.fillRect(x, 0, 8, 128);
  }
  let s = 31;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  // rust weeping down from the top edge and from scratches
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 128;
    const y = rnd() < 0.5 ? 0 : rnd() * 100;
    const len = 10 + rnd() * 50;
    const g = c.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(96,52,28,0.5)');
    g.addColorStop(1, 'rgba(96,52,28,0)');
    c.fillStyle = g;
    c.fillRect(x, y, 1.5 + rnd() * 3, len);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 4;
  return tex;
}

export function buildArctic(ctx) {
  const { world } = ctx;
  /** flat painted parts / ribbed tin parts / brick parts */
  const flat = [];
  const tin = [];
  const brick = [];
  /** unlit parts that shine by themselves: lit windows, lamp heads */
  const glow = [];
  const lamps = [];

  const box = (list, w, h, d, x, y, z, color, color2 = null, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (list === brick) metricUv(g, w, h, d, 2.6);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    list.push(paint(g, color, color2));
    return g;
  };
  const cyl = (list, r0, r1, h, x, y, z, color, color2 = null, seg = 14) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg);
    g.translate(x, y, z);
    list.push(paint(g, color, color2));
    return g;
  };
  /** A group of parts built around the origin, then set down somewhere. */
  const placed = (build, x, y, z, ry = 0, rz = 0) => {
    const lists = [flat, tin, brick, glow];
    const marks = lists.map((l) => l.length);
    build();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    lists.forEach((l, i) => {
      for (let k = marks[i]; k < l.length; k++) l[k].applyMatrix4(m);
    });
  };
  const SNOW = 0xe6ecf4;
  const beacons = [];
  const beacon = (x, y, z) => beacons.push(new THREE.Vector3(x, y, z));

  /* ------------------------------------------------ heat-and-power plant */
  const PLANT = { x: 196, z: -96 };
  const plumes = [];
  {
    const { x, z } = PLANT;
    // turbine hall, boiler house a head taller, a low office block in front
    box(brick, 52, 15, 24, x, 7.5, z, 0xa46a52, 0x6a463a);
    box(brick, 26, 25, 22, x + 9, 12.5, z - 2, 0x9a6650, 0x62423a);
    box(flat, 53, 0.5, 25, x, 15.2, z, SNOW);
    box(flat, 27, 0.5, 23, x + 9, 25.2, z - 2, SNOW);
    box(brick, 20, 7, 9, x - 14, 3.5, z + 16, 0xb7a58c, 0x7a6e5e);
    box(flat, 20.6, 0.4, 9.6, x - 14, 7.2, z + 16, SNOW);
    // tall glazed strips of the turbine hall, a few of them lit
    for (let i = 0; i < 9; i++) {
      const lit = hash2(i, 5, 301) < 0.62;
      box(lit ? glow : flat, 2.2, 9, 0.2, x - 22 + i * 5.4, 8, z + 12.06, lit ? 0xe0b25e : 0x26303a);
      box(flat, 2.2, 9, 0.2, x - 22 + i * 5.4, 8, z - 12.06, 0x232c36);
    }
    // the boiler house never sleeps: rows of small lit panes high up, on
    // the town side too, so the plant reads as a building after dark
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 7; i++) {
        if (hash2(i, row, 305) < 0.3) continue;
        const hot = hash2(i, row, 306) < 0.5 ? 0xe0b25e : 0xbfd0d8;
        box(glow, 1.5, 1.9, 0.2, x - 1.5 + i * 3.5, 16.5 + row * 2.9, z + 9.06, hot);
        box(glow, 0.2, 1.9, 1.5, x - 4.06, 16.5 + row * 2.9, z - 11 + i * 3, hot);
      }
    }
    for (let i = 0; i < 4; i++) box(glow, 0.2, 5, 1.8, x - 26.06, 8, z - 8 + i * 5.2, hash2(i, 7, 307) < 0.7 ? 0xe0b25e : 0x26303a);
    for (let i = 0; i < 5; i++) if (hash2(i, 9, 308) < 0.7) box(glow, 1.4, 1.5, 0.2, x - 21 + i * 3.6, 4.2, z + 20.56, 0xe6c27a);
    // inclined coal gallery from the yard up into the boiler house
    placed(
      () => {
        box(tin, 30, 2.6, 2.8, 0, 0, 0, 0x9aa3a8, 0x6c6f6e);
      },
      x + 34,
      11,
      z - 2,
      0,
      0.5,
    );
    box(brick, 7, 5, 7, x + 48, 2.5, z - 2, 0x8a5e4c, 0x5a4038);
    // coal heap
    const heap = new THREE.ConeGeometry(11, 6, 9);
    heap.translate(x + 50, 2.6, z + 16);
    flat.push(paint(heap, 0x4a4a4c, 0x1c1c1e));
    ctx.addColliderRect(x - 26, x + 26, z - 12, z + 12, true);
    ctx.addColliderRect(x - 24, x - 4, z + 11, z + 20.5, true);
    ctx.addColliderRect(x + 44, x + 52, z - 6, z + 2, true);
    ctx.addColliderRect(x + 43, x + 57, z + 9, z + 23, true);
    // chimneys: red and white bands, a lamp on top, steam bent by the wind
    for (const [cx, cz, h, r] of [
      [x - 35, z - 13, 78, 3.3],
      [x - 46, z - 21, 58, 2.6],
    ]) {
      const bands = 9;
      for (let b = 0; b < bands; b++) {
        const t0 = b / bands;
        const t1 = (b + 1) / bands;
        const upper = b >= bands - 5;
        const color = upper ? ((bands - b) % 2 ? 0xb5392c : 0xdcdcd6) : 0x8e8a82;
        cyl(flat, r * (1 - t1 * 0.45), r * (1 - t0 * 0.45), h / bands, cx, h * (t0 + t1) * 0.5, cz, color, upper ? null : 0x6b6862, 16);
      }
      cyl(flat, r * 1.5, r * 1.7, 3, cx, 1.5, cz, 0x8a867c, null, 12);
      beacon(cx + r * 0.6, h + 0.4, cz);
      beacon(cx - r * 0.6, h * 0.55, cz);
      plumes.push({ x: cx, y: h + 1, z: cz, size: r * 2.4 });
      // the grey smoke of environment.js rises from the first stack
      world.points.chimney ??= new THREE.Vector3(cx, h + 1, cz);
      ctx.addBoxCollider(cx, cz, r * 3.2, r * 3.2, 0.1, true);
    }
    world.points.plant = { x, z };
  }

  /* ------------------------------------------------ fuel depot */
  for (const [tx, tz, r] of [
    [164, 164, 8.5],
    [188, 170, 8.5],
    [212, 164, 8.5],
    [236, 172, 6],
  ]) {
    cyl(flat, r, r, 11, tx, 5.5, tz, 0xd3d6d8, 0x9a8f84, 22);
    const roof = new THREE.ConeGeometry(r + 0.15, 1.6, 22);
    roof.translate(tx, 11.8, tz);
    flat.push(paint(roof, SNOW));
    // spiral stair
    for (let s = 0; s < 22; s++) {
      const a = 0.4 + s * 0.13;
      box(flat, 0.9, 0.08, 0.5, tx + Math.cos(a) * (r + 0.45), 0.4 + s * 0.5, tz + Math.sin(a) * (r + 0.45), 0x4b5054, null, -a);
    }
    ctx.addBoxCollider(tx, tz, r * 1.8, r * 1.8, 0.2, true);
  }
  // the bund wall round the tanks
  box(flat, 96, 1.1, 0.5, 198, 0.55, 150.5, 0x9c9a94, 0x74726c);
  ctx.addColliderRect(150, 246, 150.2, 150.8, true);

  /* ------------------------------------------------ garage cooperative */
  // tin boxes door to door, every one painted when its owner found paint
  const GARAGE_COLORS = [0x8b5a3c, 0x6f7f6a, 0x5f7890, 0x9a9da0, 0x7a4c40, 0x8f8660, 0x5e6a70, 0xa6603a];
  const garageRow = (x0, z, count, facing) => {
    for (let i = 0; i < count; i++) {
      const r = hash2(i, Math.round(z), 411);
      const w = 3.5;
      const h = 2.5 + r * 0.5;
      const dpt = 6;
      const gx = x0 + i * w + w / 2;
      const color = GARAGE_COLORS[Math.floor(hash2(i, Math.round(z), 412) * GARAGE_COLORS.length)];
      box(tin, w - 0.08, h, dpt, gx, h / 2, z, color, 0x4a3e36);
      box(flat, w - 0.7, h - 0.5, 0.1, gx, (h - 0.5) / 2 + 0.05, z + facing * (dpt / 2 + 0.03), lin(color).multiplyScalar(0.62));
      box(flat, w + 0.1, 0.22 + r * 0.2, dpt + 0.3, gx, h + 0.1, z, SNOW);
    }
    ctx.addColliderRect(x0, x0 + count * 3.5, z - 3.1, z + 3.1, true);
  };
  garageRow(140, -18, 16, 1);
  garageRow(140, 8, 16, -1);
  garageRow(140, 14.2, 16, 1);
  garageRow(140, 40, 16, -1);
  for (const row of GARAGE_ROWS) garageRow(...row);

  /* ------------------------------------------------ containers */
  const CONTAINER_COLORS = [0x9a3b2a, 0x2f5f86, 0x3d7257, 0xc27a2c, 0x8c8f92, 0x7a2f30, 0x1f4f6a];
  const container = (x, z, turned, level, seed) => {
    const color = CONTAINER_COLORS[Math.floor(hash2(seed, 1, 431) * CONTAINER_COLORS.length)];
    const w = turned ? 2.44 : 6.06;
    const d = turned ? 6.06 : 2.44;
    box(tin, w, 2.59, d, x, 1.3 + level * 2.59 + 0.08, z, color, lin(color).multiplyScalar(0.72));
    if (level === 0) ctx.addBoxCollider(x, z, w, d, 0.1, true);
    return { w, d };
  };
  {
    let placedCount = 0;
    for (let i = 0; i < 400 && placedCount < 14; i++) {
      const x = -238 + hash2(i, 1, 441) * 350;
      const z = -200 + hash2(i, 2, 441) * 392;
      const turned = hash2(i, 3, 441) < 0.5;
      const rx = turned ? 2 : 3.8;
      const rz = turned ? 3.8 : 2;
      let clear = !world.collides(x, z, 5.2);
      for (const [ox, oz] of [[-rx, -rz], [rx, -rz], [-rx, rz], [rx, rz], [0, 0]]) {
        if (world.surfaceAt(x + ox, z + oz) !== 'snow' || world.heightAt(x + ox, z + oz) > 0.01) clear = false;
      }
      if (!clear) continue;
      container(x, z, turned, 0, i);
      box(flat, turned ? 2.5 : 6.1, 0.16, turned ? 6.1 : 2.5, x, 2.59 + 0.16, z, SNOW);
      placedCount++;
    }
    // the container yard by the port road: rows, some two high
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        if (hash2(r, c, 451) < 0.2) continue;
        const x = 270 + c * 6.9;
        const z = 132 + r * 4.2;
        if (landHeight(x, z) > 2.5) continue;
        const base = landHeight(x, z);
        placed(() => container(0, 0, false, 0, r * 31 + c), x, base, z);
        ctx.addBoxCollider(x, z, 6.06, 2.44, 0.1, true);
        if (hash2(r, c, 452) < 0.45) placed(() => box(tin, 6.06, 2.59, 2.44, 0, 1.3 + 2.67, 0, CONTAINER_COLORS[(r + c * 3) % CONTAINER_COLORS.length], 0x5a4636), x, base, z);
      }
    }
  }

  /* ------------------------------------------------ heating mains */
  // the pipes cannot be buried in permafrost: they run boxed along the
  // streets on concrete sleepers and climb over every road on a frame
  const PIPE_W = 1.1;
  const pipeRun = (points) => {
    for (let s = 0; s < points.length - 1; s++) {
      const [ax, az] = points[s];
      const [bx, bz] = points[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const alongX = Math.abs(ux) > 0.5;
      const n = Math.round(len);
      const onRoad = (t) => world.surfaceAt(ax + ux * t, az + uz * t) === 'asphalt';
      const road = [];
      for (let t = 0; t <= n; t++) {
        let hit = false;
        for (let k = -4; k <= 4 && !hit; k++) hit = t + k >= 0 && t + k <= n && onRoad(t + k);
        road.push(hit);
      }
      const span = (t0, t1, raised) => {
        const mx = ax + (ux * (t0 + t1)) / 2;
        const mz = az + (uz * (t0 + t1)) / 2;
        const l = t1 - t0;
        if (l <= 0) return;
        const w = alongX ? l : PIPE_W;
        const d = alongX ? PIPE_W : l;
        if (!raised) {
          box(tin, w, 0.62, d, mx, 0.75, mz, 0x9a968c, 0x6e665c);
          box(flat, alongX ? l : PIPE_W + 0.08, 0.12, alongX ? PIPE_W + 0.08 : l, mx, 1.12, mz, SNOW);
          for (let t = t0 + 1; t < t1; t += 4) box(flat, alongX ? 0.34 : 1.5, 0.46, alongX ? 1.5 : 0.34, ax + ux * t, 0.22, az + uz * t, 0x8f8d86);
          ctx.addBoxCollider(mx, mz, w, d, 0.05, true);
          return;
        }
        // arch: two lagged pipes up, across at 5.4 m and down, on a frame
        const top = 5.4;
        for (const off of [-0.28, 0.28]) {
          const px = alongX ? 0 : off;
          const pz = alongX ? off : 0;
          const across = new THREE.CylinderGeometry(0.2, 0.2, l, 8);
          across.rotateZ(Math.PI / 2);
          if (!alongX) across.rotateY(Math.PI / 2);
          across.translate(mx + px, top, mz + pz);
          flat.push(paint(across, 0xb9bdc0));
          for (const t of [t0, t1]) cyl(flat, 0.2, 0.2, top - 0.7, ax + ux * t + px, (top + 0.7) / 2, az + uz * t + pz, 0xb9bdc0, 0x8a8478, 8);
        }
        for (const t of [t0, t1]) {
          const ex = ax + ux * t;
          const ez = az + uz * t;
          for (const off of [-0.62, 0.62]) box(flat, 0.14, top + 0.3, 0.14, ex + (alongX ? 0 : off), (top + 0.3) / 2, ez + (alongX ? off : 0), 0x3d3f40);
          box(flat, alongX ? 0.14 : 1.4, 0.14, alongX ? 1.4 : 0.14, ex, top - 0.34, ez, 0x3d3f40);
          ctx.addBoxCollider(ex, ez, 1.3, 1.3, 0.05, true);
        }
      };
      let start = 0;
      let stile = 26;
      for (let t = 1; t <= n; t++) {
        if (t === n || road[t] !== road[start]) {
          if (road[start]) {
            span(start, t, true);
          } else {
            // break long ground runs with a wooden step-over
            let a = start;
            while (t - a > 60) {
              const b = a + stile;
              span(a, b, false);
              const sx = ax + ux * (b + 0.9);
              const sz = az + uz * (b + 0.9);
              box(tin, alongX ? 1.8 : PIPE_W, 0.62, alongX ? PIPE_W : 1.8, sx, 0.75, sz, 0x9a968c, 0x6e665c);
              for (let k = 0; k < 3; k++) {
                const h = 0.4 * (k + 1);
                const reach = 2.5 - k * 0.42;
                const wdt = alongX ? 1.5 : reach * 2;
                const dpt = alongX ? reach * 2 : 1.5;
                box(flat, wdt, 0.07, dpt, sx, h, sz, 0x7a5f44);
                ctx.addHeightRect(sx - wdt / 2, sx + wdt / 2, sz - dpt / 2, sz + dpt / 2, h, true);
              }
              for (const side of [-1, 1]) box(flat, alongX ? 0.08 : 1.2, 0.9, alongX ? 1.2 : 0.08, sx + (alongX ? side * 0.78 : 0), 1.65, sz + (alongX ? 0 : side * 0.78), 0x6a5038);
              a = b + 1.8;
              stile = 44;
            }
            span(a, t, false);
          }
          start = t;
        }
      }
    }
  };
  for (const run of PIPES) pipeRun(run);

  /* ------------------------------------------------ roofs */
  // aerials on every roof, dishes on the walls all looking the same way
  for (const spec of BLOCKS) {
    const rnd = seeded(spec.seed * 7919 + 13);
    const top = spec.floors * FLOOR_H;
    const count = Math.round(spec.w / 5);
    for (let i = 0; i < count; i++) {
      const at = toWorld(spec, -spec.w / 2 + 1.5 + rnd() * (spec.w - 3), -spec.d / 2 + 1.2 + rnd() * (spec.d - 2.4));
      const h = 2.2 + rnd() * 3.4;
      const lean = (rnd() - 0.5) * 0.12;
      placed(
        () => {
          box(flat, 0.06, h, 0.06, 0, h / 2, 0, 0x2c2f31);
          const bars = 2 + Math.floor(rnd() * 4);
          for (let b = 0; b < bars; b++) box(flat, 1.5 - b * 0.22, 0.035, 0.035, 0, h - 0.15 - b * 0.34, 0, 0x2c2f31);
          box(flat, 0.035, 0.035, bars * 0.36, 0, h - 0.5, 0, 0x2c2f31);
        },
        at.x,
        top + 0.3,
        at.z,
        rnd() * 3,
        lean,
      );
    }
    const dishes = Math.round(spec.w / 9);
    for (let i = 0; i < dishes; i++) {
      const side = rnd() < 0.5 ? 1 : -1;
      const lx = -spec.w / 2 + 2 + rnd() * (spec.w - 4);
      const y = (1 + Math.floor(rnd() * (spec.floors - 1))) * FLOOR_H + 1.3;
      const at = toWorld(spec, lx, side * (spec.d / 2 + 0.42));
      const arm = toWorld(spec, lx, side * (spec.d / 2 + 0.22));
      const dish = new THREE.CylinderGeometry(0.46, 0.4, 0.07, 14);
      // every dish in town looks at the same satellite, low in the south
      dish.rotateX(Math.PI / 2 - 0.5);
      dish.rotateY(-0.5);
      dish.translate(at.x, y, at.z);
      flat.push(paint(dish, rnd() < 0.3 ? 0x8a6a58 : 0xc9cdd0));
      box(flat, spec.rot ? 0.5 : 0.05, 0.05, spec.rot ? 0.05 : 0.5, arm.x, y - 0.1, arm.z, 0x3a3d3f);
    }
  }

  /* ------------------------------------------------ port */
  const port = ROUTES.find((r) => r.id === 'port');
  {
    const [ex, ez] = port.end;
    const y = port.endH;
    const crane = (cx, cz, yaw, boomPitch, color) => {
      placed(
        () => {
          // portal: four legs on bogies, wide enough to drive under
          for (const sx of [-4.2, 4.2]) {
            for (const sz of [-4.2, 4.2]) {
              box(flat, 0.8, 11, 0.8, sx, 5.5, sz, color, 0x4c3f30);
              box(flat, 1.6, 0.9, 2.4, sx, 0.45, sz, 0x2c2c2e);
            }
          }
          box(flat, 9.6, 1.1, 9.6, 0, 11.4, 0, color, 0x6a5a3a);
          cyl(flat, 2.4, 2.8, 2.2, 0, 13, 0, 0x3b3d40, null, 12);
          box(tin, 6.5, 4.6, 5, -1.5, 16.4, 0, 0x9ea4a6, 0x6e6a60);
          box(flat, 2.2, 2.4, 2.6, 3.4, 15.6, 1.6, 0x2a3640);
          box(flat, 6.9, 0.3, 5.4, -1.5, 18.9, 0, SNOW);
          box(flat, 3.2, 2.6, 3.6, -6.2, 15.4, 0, 0x4a4c4e);
        },
        cx,
        y,
        cz,
        yaw,
      );
      // the jib is a separate tilted piece
      placed(
        () => {
          for (const sz of [-0.9, 0.9]) box(flat, 34, 0.5, 0.3, 17, 0, sz, color, null);
          for (let k = 0; k < 9; k++) box(flat, 0.2, 0.2, 1.8, 2 + k * 3.8, 0, 0, color);
          box(flat, 0.9, 0.9, 2.2, 34, 0, 0, 0x2c2c2e);
          box(flat, 0.3, 9, 0.3, -2, 4.5, 0, color);
        },
        cx + Math.sin(yaw + Math.PI / 2) * 1,
        y + 18,
        cz + Math.cos(yaw + Math.PI / 2) * 1,
        yaw,
        boomPitch,
      );
      const tipX = cx + Math.cos(yaw) * 34 * Math.cos(boomPitch);
      const tipZ = cz - Math.sin(yaw) * 34 * Math.cos(boomPitch);
      const tipY = y + 18 + Math.sin(boomPitch) * 34;
      box(flat, 0.06, tipY - y - 9, 0.06, tipX, (tipY + y + 9) / 2, tipZ, 0x1c1c1e);
      box(flat, 0.7, 1.1, 0.7, tipX, y + 8.6, tipZ, 0x2c2c2e);
      beacon(tipX, tipY + 0.6, tipZ);
      for (const sx of [-4.2, 4.2]) for (const sz of [-4.2, 4.2]) ctx.addBoxCollider(cx + sx, cz + sz, 1.8, 2.4, 0.1, true);
    };
    crane(ex + 6, ez - 15, 0.5, 0.62, 0xb9973a);
    crane(ex + 9, ez + 14, -0.35, 0.86, 0xa8553a);
    // bollards and a stack of timber on the quay
    for (let i = 0; i < 6; i++) {
      const a = -1.1 + i * 0.44;
      cyl(flat, 0.3, 0.36, 0.7, ex + Math.cos(a) * 27.5, y + 0.35, ez + Math.sin(a) * 27.5, 0x2a2a2c, null, 8);
    }
    box(flat, 6, 1.6, 2.4, ex - 12, y + 0.8, ez - 18, 0x8a6a48, 0x5e4a36);
    box(flat, 6.2, 0.2, 2.6, ex - 12, y + 1.7, ez - 18, SNOW);
    ctx.addBoxCollider(ex - 12, ez - 18, 6, 2.4, 0.1, true);
    // harbour office: a blue-grey box with a lit window
    box(tin, 9, 3.2, 5, ex - 16, y + 1.6, ez + 17, 0x587086, 0x3a4650);
    box(flat, 9.3, 0.3, 5.3, ex - 16, y + 3.35, ez + 17, SNOW);
    box(glow, 1.3, 1.1, 0.1, ex - 14, y + 1.9, ez + 14.46, 0xe9c06a);
    ctx.addBoxCollider(ex - 16, ez + 17, 9, 5, 0.1, true);

    // the ship: came in late one autumn and never got out
    const sx = ex + 4;
    const sz = ez + 92;
    placed(
      () => {
        const shape = new THREE.Shape();
        shape.moveTo(-38, -6.4);
        shape.lineTo(24, -6.4);
        shape.quadraticCurveTo(36, -5, 41, 0);
        shape.quadraticCurveTo(36, 5, 24, 6.4);
        shape.lineTo(-38, 6.4);
        shape.quadraticCurveTo(-41, 0, -38, -6.4);
        const hull = new THREE.ExtrudeGeometry(shape, { depth: 7.2, bevelEnabled: false, curveSegments: 8 });
        hull.rotateX(-Math.PI / 2);
        hull.translate(0, -1.6, 0);
        const g = hull.toNonIndexed();
        g.deleteAttribute('uv');
        // red lead below the waterline, black topsides weeping rust
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        const red = lin(0x7a2f26);
        const black = lin(0x1e2226);
        const rust = lin(0x6e4630);
        const tmp = new THREE.Color();
        for (let i = 0; i < n; i++) {
          const py = g.attributes.position.getY(i);
          const px = g.attributes.position.getX(i);
          if (py < 0.6) tmp.copy(red);
          else tmp.copy(black).lerp(rust, hash2(Math.round(px * 0.7), Math.round(py), 77) * 0.7);
          tmp.toArray(col, i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        flat.push(g);
        box(flat, 77, 0.25, 12.4, -0.5, 5.7, 0, 0x5e4a3c);
        // hatch coamings forward, two pairs of king posts with derricks
        for (const hx of [-10, 6, 20]) box(flat, 11, 1.2, 8, hx, 6.3, 0, 0x4c5a52, 0x39403c);
        for (const kx of [-2, 13.5]) {
          for (const kz of [-3.4, 3.4]) box(flat, 0.5, 11, 0.5, kx, 11.2, kz, 0xb8a888, 0x6e5a48);
          box(flat, 0.4, 0.4, 7.2, kx, 16.4, 0, 0xb8a888);
          placed(() => box(flat, 10, 0.3, 0.3, 5, 0, 0, 0xb8a888), kx, 8, 0, 0, 0.5);
        }
        // superstructure aft: three decks, once white
        box(flat, 14, 3, 11.6, -27, 7.3, 0, 0xcfcfc8, 0x8f8a80);
        box(flat, 11, 2.8, 10, -27.5, 10.2, 0, 0xd4d4cc, 0x9a958a);
        box(flat, 8, 2.6, 8.6, -27, 12.9, 0, 0xd4d4cc, 0xa39e92);
        for (let w = 0; w < 6; w++) box(w === 2 ? glow : flat, 0.7, 0.7, 8.7, -30.2 + w * 1.3, 13.2, 0, w === 2 ? 0xe9c06a : 0x1c2630);
        box(flat, 9, 0.2, 9.4, -27, 14.3, 0, SNOW);
        cyl(flat, 1.5, 1.7, 5.4, -31, 16.6, 0, 0x26282a, null, 12);
        cyl(flat, 1.56, 1.7, 1.3, -31, 16.9, 0, 0xa8322a, null, 12);
        box(flat, 0.16, 8, 0.16, -24, 18, 0, 0xb8a888);
        // snow along the deck edges and on the forecastle
        box(flat, 60, 0.2, 2, -4, 5.95, -5.2, SNOW);
        box(flat, 14, 0.25, 9, 28, 5.95, 0, SNOW);
      },
      sx,
      SEA_Y,
      sz,
      0.42,
      0.035,
    );
    // the hull is turned: guard it with a few boxes along its length
    for (let k = -4; k <= 4; k++) {
      const ox = Math.cos(0.42) * k * 9;
      const oz = -Math.sin(0.42) * k * 9;
      ctx.addBoxCollider(sx + ox, sz + oz, 11, 12.5, 0.2, true);
    }
    beacon(sx + Math.cos(0.42) * -24, SEA_Y + 22.6, sz - Math.sin(0.42) * -24);
    world.points.ship = { x: sx, z: sz };
  }

  /* ------------------------------------------------ lighthouse */
  const coast = ROUTES.find((r) => r.id === 'coast');
  const lamp = new THREE.Group();
  {
    const [ex, ez] = coast.end;
    const y = coast.endH;
    const lx = ex + 6;
    const lz = ez + 8;
    cyl(flat, 3.6, 4, 1.4, lx, y + 0.7, lz, 0x8f8d86, null, 12);
    const bands = 6;
    const H = 19;
    for (let b = 0; b < bands; b++) {
      const r0 = 2.6 - (b / bands) * 1.0;
      const r1 = 2.6 - ((b + 1) / bands) * 1.0;
      cyl(flat, r1, r0, H / bands, lx, y + 1.4 + (b + 0.5) * (H / bands), lz, b % 2 ? 0xa8362c : 0xdcdad2, b === 0 ? 0x9a958c : null, 14);
    }
    cyl(flat, 2.5, 2.3, 0.3, lx, y + 1.4 + H + 0.15, lz, 0x2e3032, null, 14);
    cyl(flat, 1.25, 1.25, 2.2, lx, y + 1.4 + H + 1.4, lz, 0x1b2228, null, 10);
    const cap = new THREE.ConeGeometry(1.6, 1.4, 10);
    cap.translate(lx, y + 1.4 + H + 3.2, lz);
    flat.push(paint(cap, 0x8a2f28));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      box(flat, 0.05, 1, 0.05, lx + Math.cos(a) * 2.4, y + 1.4 + H + 0.8, lz + Math.sin(a) * 2.4, 0x2e3032);
    }
    ctx.addBoxCollider(lx, lz, 6.4, 6.4, 0.1, true);
    // keeper's house, boarded up
    box(flat, 8, 3, 5.4, ex - 13, y + 1.5, ez + 7, 0x6f5a48, 0x4a3e34);
    const roof = new THREE.CylinderGeometry(0.1, 3.5, 2, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(1.75, 1, 1.2);
    roof.translate(ex - 13, y + 4, ez + 7);
    flat.push(paint(roof, SNOW));
    box(flat, 1.2, 1.2, 0.1, ex - 14.6, y + 1.8, ez + 4.26, 0x3a2e24);
    box(flat, 1.2, 1.2, 0.1, ex - 11.6, y + 1.8, ez + 4.26, 0x3a2e24);
    ctx.addBoxCollider(ex - 13, ez + 7, 8, 5.4, 0.1, true);
    // the light itself: a warm lamp and two beams sweeping the bay
    lamp.position.set(lx, y + 1.4 + H + 1.4, lz);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlowTexture(128, '255,226,170'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(9);
    lamp.add(glow);
    const beamGeo = new THREE.ConeGeometry(7, 150, 14, 1, true);
    beamGeo.rotateZ(Math.PI / 2);
    beamGeo.translate(75, 0, 0);
    {
      // bright at the lens, gone by the far end
      const n = beamGeo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.fill((1 - beamGeo.attributes.position.getX(i) / 150) ** 2, i * 3, i * 3 + 3);
      beamGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffe2a8, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beams = new THREE.Group();
    for (const a of [0, Math.PI]) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.y = a;
      beams.add(beam);
    }
    lamp.add(beams);
    lamp.userData.beams = beams;
    lamp.userData.beamMat = beamMat;
    world.group.add(lamp);
    world.points.lighthouse = { x: lx, z: lz };
  }

  /* ------------------------------------------------ benches and spots */
  // a plank bench on two concrete feet, facing `yaw` (player convention:
  // 0 looks to -z, -PI/2 to +x)
  const spots = [];
  const bench = (x, z, yaw, id, { barrel = true } = {}) => {
    const y = landHeight(x, z);
    placed(
      () => {
        for (const sx of [-0.75, 0.75]) box(flat, 0.16, 0.42, 0.44, sx, 0.21, 0, 0x8f8d86);
        for (const pz of [-0.14, 0.02, 0.18]) box(flat, 1.9, 0.05, 0.13, 0, 0.46, pz, 0x6e5238);
        for (const py of [0.72, 0.9]) box(flat, 1.9, 0.11, 0.04, 0, py, 0.26, 0x6e5238);
        for (const sx of [-0.75, 0.75]) box(flat, 0.06, 0.56, 0.06, sx, 0.7, 0.28, 0x3a3c3e);
        if (barrel) {
          // an oil drum for the ends, another on its side under the snow
          cyl(tin, 0.29, 0.29, 0.88, 1.7, 0.44, 0.1, 0x8a4a30, 0x4a3a30, 12);
          cyl(flat, 0.27, 0.27, 0.03, 1.7, 0.86, 0.1, 0x1a1a1a, null, 12);
        }
      },
      x,
      y,
      z,
      yaw,
    );
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    ctx.addBoxCollider(x + fx * -0.1, z + fz * -0.1, 1.4, 1.4, -0.3, true);
    spots.push({
      id,
      x: x + fx * 0.9,
      z: z + fz * 0.9,
      radius: 2.6,
      seat: { x: x + fx * 0.08, z: z + fz * 0.08, yaw, eyeY: y + 1.22, pitch: -0.1 },
      stand: { x: x + fx * 1.1, z: z + fz * 1.1, yaw },
    });
  };
  const sopka = ROUTES.find((r) => r.id === 'sopka');
  {
    const [ex, ez] = sopka.end;
    const y = sopka.endH;
    // the lookout: benches on the town side, a rail, a wind-bent signpost
    bench(ex + 11.5, ez - 3, -Math.PI / 2, 'spot:lookout');
    bench(ex + 10.5, ez + 5.5, -Math.PI / 2 - 0.25, 'spot:lookout-2', { barrel: false });
    for (let k = -4; k <= 4; k++) {
      const a = k * 0.2;
      const px = ex + Math.cos(a) * 14.3;
      const pz = ez + Math.sin(a) * 14.3;
      box(flat, 0.1, 0.66, 0.1, px, y + 0.33, pz, 0x3a3c3e);
      if (k < 4) {
        const a2 = (k + 0.5) * 0.2;
        box(flat, 0.06, 0.06, 2.9, ex + Math.cos(a2) * 14.3, y + 0.62, ez + Math.sin(a2) * 14.3, 0x5a5c5e, null, -a2);
        box(flat, 0.06, 0.06, 2.9, ex + Math.cos(a2) * 14.3, y + 0.32, ez + Math.sin(a2) * 14.3, 0x5a5c5e, null, -a2);
      }
    }
    // survey beacon: a timber tripod on the very top of the hill
    const tx = ex - 12;
    const tz = ez - 2;
    const ty = landHeight(tx, tz);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      placed(() => box(flat, 0.14, 6.4, 0.14, 0, 3.1, 0, 0x5a4634), tx + Math.cos(a) * 1.2, ty, tz + Math.sin(a) * 1.2, -a, 0.2);
    }
    box(flat, 0.9, 0.9, 0.06, tx, ty + 5.6, tz, 0xb5392c);
    world.points.lookout = { x: ex, z: ez, y };
  }
  {
    const [ex, ez] = coast.end;
    bench(ex + 9, ez - 6, -Math.PI / 2 + 0.3, 'spot:lighthouse');
  }
  {
    const [ex, ez] = port.end;
    // looks across the ice at the ship
    bench(ex + 8, ez + 26, Math.PI - 0.19, 'spot:mole');
  }
  world.spots = spots;

  /* ------------------------------------------------ lamps */
  // a pole, a sodium head and the pool of light it throws on the snow
  const lampPost = (x, z, h = 7, reach = 11, dx = 1, dz = 0) => {
    const y = landHeight(x, z);
    box(flat, 0.14, h, 0.14, x, y + h / 2, z, 0x34373a);
    box(flat, dx ? 0.9 : 0.1, 0.08, dx ? 0.1 : 0.9, x + dx * 0.4, y + h, z + dz * 0.4, 0x34373a);
    box(glow, dx ? 0.5 : 0.28, 0.12, dx ? 0.28 : 0.5, x + dx * 0.75, y + h - 0.08, z + dz * 0.75, 0xffd9a0);
    lamps.push({ x: x + dx * 0.75, y: y + h - 0.1, z: z + dz * 0.75, ground: y, reach });
  };
  for (const lx of [150, 172, 194]) {
    lampPost(lx, -5, 6.5);
    lampPost(lx, 27, 6.5);
  }
  for (const [lx, lz] of [[166, -78], [206, -78], [232, -120], [160, -124]]) lampPost(lx, lz, 10, 16);
  // floodlights on the town side of the plant and at the foot of the stacks
  for (const [lx, lz] of [[164, -70], [150, -92], [146, -106], [186, -70], [226, -70]]) lampPost(lx, lz, 11, 20, lx < 160 ? 1 : 0, lx < 160 ? 0 : -1);
  for (const [lx, lz] of [[176, 147], [224, 147]]) lampPost(lx, lz, 8, 13);
  {
    const [ex, ez] = port.end;
    for (const [ox, oz] of [[-20, -8], [-6, 22], [16, 0], [-2, -24]]) lampPost(ex + ox, ez + oz, 12, 18);
    lampPost(292, 127, 9, 14);
    const [cx, cz] = coast.end;
    lampPost(cx - 9, cz + 3, 5.5, 9);
  }

  /* ------------------------------------------------ the town's own things */
  buildFurniture(ctx, { flat, tin, glow, box, cyl, placed, paint, bench, lampPost, SNOW });

  /* ------------------------------------------------ meshes */
  const add = (list, material, name) => {
    if (!list.length) return;
    const clean = list.map((g) => {
      const out = g.index ? g.toNonIndexed() : g;
      if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
      if (!out.attributes.normal) out.computeVertexNormals();
      return out;
    });
    const mesh = new THREE.Mesh(mergeGeometries(clean, false), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    world.group.add(mesh);
  };
  add(flat, liftAtDusk(world, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }), 9), 'arctic-flat');
  const tinTex = makeRibTexture();
  add(tin, liftAtDusk(world, new THREE.MeshStandardMaterial({ vertexColors: true, map: tinTex, color: 0xffffff, roughness: 0.75, metalness: 0.08 }), 7), 'arctic-tin');
  const brickTex = world.textures.brick.clone();
  brickTex.repeat.set(1, 1);
  brickTex.needsUpdate = true;
  add(brick, liftAtDusk(world, new THREE.MeshStandardMaterial({ vertexColors: true, map: brickTex, roughness: 0.95 }), 40), 'arctic-brick');
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true }), 'arctic-glow');
  world.group.children[world.group.children.length - 1].castShadow = false;

  // light pools on the ground and halos round the heads: no real lights
  const glowTex = makeGlowTexture(128, '255,196,128');
  const poolParts = lamps.map((l) => {
    const g = new THREE.PlaneGeometry(l.reach * 2, l.reach * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(l.x, l.ground + 0.14, l.z);
    return g;
  });
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const pools = new THREE.Mesh(mergeGeometries(poolParts, false), poolMat);
  pools.frustumCulled = false;
  pools.renderOrder = 2;
  world.group.add(pools);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap((l) => [l.x, l.y, l.z]), 3));
  const haloMat = new THREE.PointsMaterial({ map: glowTex, size: 5.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  world.group.add(halos);

  /* ------------------------------------------------ lights and steam */
  const beaconGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false });
  const beaconMesh = new THREE.InstancedMesh(beaconGeo, beaconMat, beacons.length);
  const dummy = new THREE.Object3D();
  beacons.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.updateMatrix();
    beaconMesh.setMatrixAt(i, dummy.matrix);
  });
  beaconMesh.frustumCulled = false;
  world.group.add(beaconMesh);

  const steamTex = makeSmokeTexture(128);
  const puffs = [];
  const PER = 16;
  for (const plume of plumes) {
    for (let i = 0; i < PER; i++) {
      const mat = new THREE.SpriteMaterial({ map: steamTex, color: 0xe4e8ee, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.material.rotation = i * 1.7;
      world.group.add(sprite);
      puffs.push({ sprite, plume, phase: i / PER, wobble: hash2(i, 3, 91) });
    }
  }
  const LIFE = 26;
  ctx.addUpdater((dt, t) => {
    beaconMat.color.setHex(Math.sin(t * 1.7) > -0.2 ? 0xff3020 : 0x4a0e0a);
    for (const p of puffs) {
      const age = (t / LIFE + p.phase) % 1;
      const rise = 1 - Math.exp(-age * 3.2);
      // rises a little, then lies down on the wind toward the bay
      p.sprite.position.set(p.plume.x + age * 120 + Math.sin(t * 0.2 + p.wobble * 9) * 2 * age, p.plume.y + rise * 16 + p.wobble * 4 * age, p.plume.z - age * 46 + (p.wobble - 0.5) * 12 * age);
      const s = p.plume.size * (1 + age * 7);
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = Math.min(1, age * 14) * (1 - age) ** 1.5 * 0.62;
    }
    lamp.userData.beams.rotation.y = t * 0.5;
    const night = Math.min(1, world.litLevel ?? 0);
    poolMat.opacity = 0.5 * night;
    haloMat.opacity = 0.85 * night;
    // the beams only show once the windows are lit
    lamp.userData.beamMat.opacity = 0.012 + 0.1 * night;
  });
}
