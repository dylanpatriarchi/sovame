// The rooms behind the doors that open: a grocery and the flat that is
// yours. They are built once, far from the town and deep under the tundra,
// and a door takes you there behind a fade. Nothing outside can be seen
// from a closed room, so its light is baked into the vertex colours: the
// same warm bulbs at any hour, no real lights, one draw call a room.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../util.js';

const SITE = { x: -3000, y: -60, z: -3000 };

/**
 * Collects the pieces of one room in room-local space (origin on the floor
 * in the middle, the street door in the +z wall) and bakes the light of its
 * `lamps` into them.
 */
class Kit {
  constructor(lamps, ambient = 0.42) {
    this.lamps = lamps;
    this.ambient = ambient;
    this.parts = [];
    this.glow = [];
    this.solid = [];
  }

  /** Colours a geometry: `hex` under the room's lamps (or as is, `raw`). */
  paint(geo, hex, raw = false) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const base = new THREE.Color(hex);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let k = 1;
      if (!raw) {
        k = this.ambient + 0.1 * nor.getY(i);
        for (const l of this.lamps) {
          const dx = l.x - pos.getX(i);
          const dy = l.y - pos.getY(i);
          const dz = l.z - pos.getZ(i);
          const d = Math.hypot(dx, dy, dz) || 1;
          const facing = Math.max(0.25, (dx * nor.getX(i) + dy * nor.getY(i) + dz * nor.getZ(i)) / d);
          k += (l.power * facing) / (1 + (d * d) / (l.reach * l.reach));
        }
      }
      // incandescent: the light itself is warm
      col[i * 3] = base.r * k;
      col[i * 3 + 1] = base.g * k * (raw ? 1 : 0.95);
      col[i * 3 + 2] = base.b * k * (raw ? 1 : 0.84);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    return g;
  }

  box(w, h, d, x, y, z, hex, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.parts.push(this.paint(g, hex));
  }

  cyl(r, h, x, y, z, hex, seg = 10, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg);
    g.translate(x, y, z);
    this.parts.push(this.paint(g, hex));
  }

  /** A box that shines by itself: lamps, a window, a TV screen. */
  lit(w, h, d, x, y, z, hex, level = 1) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.glow.push(this.paint(g, new THREE.Color(hex).multiplyScalar(level), true));
  }

  /** A wall, floor or ceiling panel, cut fine enough to hold a pool of
   * light. `normal` is one of '+x', '-x', '+y', '-y', '+z', '-z'. */
  panel(normal, u0, u1, v0, v1, at, hex, hex2 = null) {
    const step = 0.8;
    const nu = Math.max(1, Math.round((u1 - u0) / step));
    const nv = Math.max(1, Math.round((v1 - v0) / step));
    const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0, nu, nv);
    g.translate((u0 + u1) / 2, (v0 + v1) / 2, 0);
    // PlaneGeometry looks along +z with u = x, v = y
    if (normal === '-z') g.rotateY(Math.PI);
    else if (normal === '+x') g.rotateY(Math.PI / 2);
    else if (normal === '-x') g.rotateY(-Math.PI / 2);
    else if (normal === '+y') g.rotateX(-Math.PI / 2);
    else if (normal === '-y') g.rotateX(Math.PI / 2);
    const axis = normal[1];
    g.translate(axis === 'x' ? at : 0, axis === 'y' ? at : 0, axis === 'z' ? at : 0);
    const painted = this.paint(g, hex);
    if (hex2 !== null) {
      // chequered: every other cell takes the second colour
      const c2 = new THREE.Color(hex2);
      const c1 = new THREE.Color(hex);
      const col = painted.attributes.color;
      for (let q = 0; q < nu * nv; q++) {
        if (((q % nu) + Math.floor(q / nu)) % 2 === 0) continue;
        for (let k = 0; k < 6; k++) {
          const i = q * 6 + k;
          col.setXYZ(i, (col.getX(i) / c1.r) * c2.r, (col.getY(i) / c1.g) * c2.g, (col.getZ(i) / c1.b) * c2.b);
        }
      }
    }
    this.parts.push(painted);
  }

  /** The shell: floor, ceiling and four two-tone walls facing inward. */
  shell(W, D, H, { floor, floor2 = null, ceiling, dado, wall, dadoH = 1.5 }) {
    this.panel('+y', -W / 2, W / 2, -D / 2, D / 2, 0, floor, floor2);
    // seen from below: mirror v so the panel still spans the room
    this.panel('-y', -W / 2, W / 2, -D / 2, D / 2, H, ceiling);
    for (const [n, a, b, at] of [
      ['+z', -W / 2, W / 2, -D / 2],
      ['-z', -W / 2, W / 2, D / 2],
      ['+x', -D / 2, D / 2, -W / 2],
      ['-x', -D / 2, D / 2, W / 2],
    ]) {
      this.panel(n, a, b, 0, dadoH, at, dado);
      this.panel(n, a, b, dadoH, H, at, wall);
    }
  }

  block(x0, x1, z0, z1) {
    this.solid.push([x0, x1, z0, z1]);
  }
}

/* ------------------------------------------------------------ grocery */

function buildShop() {
  const W = 11;
  const D = 7;
  const H = 3.3;
  const lamps = [-3.2, 0, 3.2].map((x) => ({ x, y: H - 0.25, z: -0.4, power: 0.62, reach: 3.4 }));
  const k = new Kit(lamps, 0.4);
  const rng = new Rng(771);
  k.shell(W, D, H, { floor: 0x9a9080, floor2: 0x6f6a60, ceiling: 0xd6d2c6, dado: 0x5d7f6e, wall: 0xd8d3c4 });
  for (const l of lamps) {
    k.lit(1.25, 0.05, 0.16, l.x, H - 0.09, l.z, 0xfff1d0, 1.9);
    k.box(1.35, 0.06, 0.26, l.x, H - 0.04, l.z, 0x8a8c88);
  }
  // the dark line where the oil paint ends
  for (const [w, d, x, z] of [[W, 0.02, 0, -D / 2 + 0.011], [W, 0.02, 0, D / 2 - 0.011], [0.02, D, -W / 2 + 0.011, 0], [0.02, D, W / 2 - 0.011, 0]]) k.box(w, 0.04, d, x, 1.5, z, 0x3d5548);

  // counter along the back, a gap at the right end
  const cz = -D / 2 + 2.05;
  k.box(7.4, 0.9, 0.7, -1.6, 0.45, cz, 0x7b5d40);
  k.box(7.5, 0.05, 0.8, -1.6, 0.925, cz, 0xc9c3b2);
  k.box(7.4, 0.5, 0.02, -1.6, 0.5, cz + 0.36, 0x9a7a55);
  k.block(-5.3, 2.1, cz - 0.4, cz + 0.4);
  // refrigerated case at its left end: white enamel, a slanted pane
  k.box(2.0, 0.34, 0.74, -4.2, 1.12, cz, 0xdfe4e2);
  k.box(1.9, 0.03, 0.62, -4.2, 1.31, cz, 0xa9c7cc);
  for (let i = 0; i < 7; i++) k.box(0.2, 0.1, 0.14, -5.0 + i * 0.27, 1.0, cz + 0.05, [0xc98a5a, 0xe2d6b0, 0xb5524a][i % 3]);
  // scales, a till, a jar of sweets, wrapping paper
  k.box(0.34, 0.1, 0.3, -1.9, 1.0, cz, 0x3f6a8a);
  k.cyl(0.16, 0.015, -1.9, 1.16, cz, 0xb9bcba, 16);
  k.box(0.04, 0.12, 0.04, -1.9, 1.1, cz, 0x55595c);
  k.box(0.24, 0.3, 0.05, -1.9, 1.2, cz - 0.2, 0xe8e2cc);
  k.box(0.42, 0.26, 0.4, 0.2, 1.08, cz, 0x2f3134);
  k.box(0.34, 0.1, 0.2, 0.2, 1.23, cz - 0.08, 0x4a4d50);
  for (let i = 0; i < 12; i++) k.box(0.03, 0.02, 0.03, 0.06 + (i % 4) * 0.09, 1.215, cz + 0.06 + Math.floor(i / 4) * 0.06, 0xd8d6cc);
  k.cyl(0.09, 0.22, -0.7, 1.06, cz + 0.1, 0xb7c9c4, 10);
  k.cyl(0.095, 0.02, -0.7, 1.18, cz + 0.1, 0x8a2f28, 10);
  k.box(0.5, 0.03, 0.36, 1.2, 0.965, cz, 0xb9a57e);
  // an abacus, because the till is only for show
  k.box(0.3, 0.03, 0.2, -2.9, 0.965, cz + 0.12, 0x6a4a30);
  for (let i = 0; i < 5; i++) k.box(0.26, 0.016, 0.016, -2.9, 0.985, cz + 0.05 + i * 0.035, [0x2a2a2a, 0xc9a13f][i % 2]);

  // shelves on the back wall, stocked the way they were: a lot of very
  // few things
  const sz = -D / 2 + 0.2;
  for (const y of [0.95, 1.45, 1.95, 2.45]) k.box(8.6, 0.04, 0.38, -1.0, y, sz, 0x6f5238);
  for (const x of [-5.3, -3.15, -1.0, 1.15, 3.3]) k.box(0.05, 2.5, 0.38, x, 1.25, sz, 0x5c432d);
  const CANS = [0x9c2a22, 0x2f4a68, 0xc9a13f, 0x3b5c46, 0xd9d2bc];
  for (let bay = 0; bay < 4; bay++) {
    const x0 = -5.2 + bay * 2.15;
    for (const [row, y] of [[0, 0.97], [1, 1.47], [2, 1.97], [3, 2.47]]) {
      const kind = (bay * 3 + row * 5) % 5;
      const color = CANS[(bay + row * 2) % CANS.length];
      if (kind === 0) {
        // tins in a pyramid
        for (let i = 0; i < 9; i++) k.cyl(0.05, 0.11, x0 + 0.2 + i * 0.2, y + 0.055, sz, color, 8);
        for (let i = 0; i < 8; i++) k.cyl(0.05, 0.11, x0 + 0.3 + i * 0.2, y + 0.165, sz, color, 8);
      } else if (kind === 1) {
        for (let i = 0; i < 12; i++) {
          const glass = [0x3f5c3a, 0x5a3c22, 0x9fb5aa][(i + row) % 3];
          k.cyl(0.036, 0.2, x0 + 0.15 + i * 0.16, y + 0.1, sz, glass, 8);
          k.cyl(0.014, 0.09, x0 + 0.15 + i * 0.16, y + 0.24, sz, glass, 6);
        }
      } else if (kind === 2) {
        // bricks of bread
        for (let i = 0; i < 7; i++) k.box(0.24, 0.11, 0.12, x0 + 0.22 + i * 0.27, y + 0.055 + (i % 3 === 2 ? 0.01 : 0), sz + rng.float(-0.03, 0.03), i % 2 ? 0x8a5a30 : 0x5e3d22);
      } else if (kind === 3) {
        // packets: tea, salt, macaroni
        for (let i = 0; i < 10; i++) k.box(0.13, 0.19, 0.08, x0 + 0.16 + i * 0.19, y + 0.095, sz, i % 3 ? color : 0xd8cfb4);
      } else {
        // three-litre jars
        for (let i = 0; i < 6; i++) {
          k.cyl(0.075, 0.24, x0 + 0.25 + i * 0.32, y + 0.12, sz, [0xb9743a, 0x8a9a52, 0xa63f38][i % 3], 10);
          k.cyl(0.05, 0.02, x0 + 0.25 + i * 0.32, y + 0.25, sz, 0xc9a13f, 10);
        }
      }
    }
  }
  // a household fridge, crates of empties and sacks by the right wall
  k.box(0.62, 1.5, 0.62, 4.9, 0.75, -2.6, 0xe4e6e2);
  k.box(0.02, 0.3, 0.04, 4.58, 1.0, -2.36, 0x8a8c88);
  k.block(4.5, 5.5, -3.1, -2.2);
  for (const [x, z, n] of [[4.9, -1.5, 3], [4.9, -0.85, 2]]) {
    for (let i = 0; i < n; i++) {
      k.box(0.5, 0.26, 0.4, x + (i % 2) * 0.02, 0.14 + i * 0.28, z, i % 2 ? 0x6f8a5a : 0x7a5a3a);
      for (let b = 0; b < 6 && i === n - 1; b++) k.cyl(0.03, 0.12, x - 0.16 + (b % 3) * 0.16, 0.33 + i * 0.28, z - 0.08 + Math.floor(b / 3) * 0.16, 0x3f5c3a, 6);
    }
  }
  k.block(4.55, 5.5, -1.8, -0.55);
  for (const [x, z] of [[-4.9, 0.3], [-4.85, 1.0]]) k.box(0.55, 0.5, 0.6, x, 0.26, z, 0xb9ab8a, 0.2);
  k.box(0.5, 0.3, 0.55, -4.88, 0.66, 0.6, 0xa89a7a, -0.15);
  k.block(-5.5, -4.5, -0.1, 1.4);

  // the front wall: a shop window gone white with frost, a radiator under
  // it, the door you came in by
  const fz = D / 2 - 0.02;
  k.lit(3.4, 1.7, 0.02, -1.6, 1.85, fz, 0xbfd3e6, 1.15);
  for (const x of [-3.32, -1.6, 0.12]) k.box(0.07, 1.8, 0.06, x, 1.85, fz - 0.02, 0xe6e2d6);
  for (const y of [0.97, 2.73]) k.box(3.52, 0.07, 0.06, -1.6, y, fz - 0.02, 0xe6e2d6);
  k.box(3.6, 0.05, 0.22, -1.6, 0.93, fz - 0.1, 0xe6e2d6);
  for (let i = 0; i < 16; i++) k.box(0.07, 0.56, 0.12, -2.65 + i * 0.14, 0.5, fz - 0.1, 0xd9d6c9);
  doorway(k, 3.6, fz, 0x5a3f2a);
  // a red banner and the price board on the left wall
  k.box(0.02, 0.5, 2.6, -W / 2 + 0.02, 2.55, -0.6, 0xa3261f);
  k.box(0.025, 0.04, 2.3, -W / 2 + 0.03, 2.55, -0.6, 0xe8dcb4);
  k.box(0.03, 0.9, 0.7, -W / 2 + 0.02, 1.9, 1.9, 0x2b3a30);
  for (let i = 0; i < 5; i++) k.box(0.035, 0.04, 0.5 - (i % 2) * 0.12, -W / 2 + 0.03, 2.2 - i * 0.15, 1.9, 0xd9d6c9);

  return { k, W, D, H, name: 'Продукты', sub: 'Grocery', spawn: { x: 3.6, z: D / 2 - 1.1, yaw: 0 }, door: { x: 3.6, z: D / 2 - 0.4 } };
}

/** The way out: a planked door in the +z wall with a frame and a mat. */
function doorway(k, x, fz, hex) {
  k.box(0.96, 2.06, 0.05, x, 1.03, fz - 0.01, hex);
  for (const sx of [-0.52, 0.52]) k.box(0.08, 2.14, 0.08, x + sx, 1.07, fz - 0.02, 0xd9d4c4);
  k.box(1.12, 0.08, 0.08, x, 2.14, fz - 0.02, 0xd9d4c4);
  for (const y of [0.55, 1.55]) k.box(0.7, 0.72, 0.02, x, y, fz - 0.045, new THREE.Color(hex).multiplyScalar(0.82));
  k.box(0.03, 0.12, 0.05, x - 0.36, 1.05, fz - 0.07, 0xb9bcba);
  k.box(0.8, 0.02, 0.5, x, 0.012, fz - 0.45, 0x4a4036);
}

/* ------------------------------------------------------------ the flat */

function buildFlat() {
  const W = 8.2;
  const D = 6;
  const H = 2.7;
  const lamps = [
    { x: -1.6, y: 2.1, z: -0.2, power: 0.6, reach: 2.9 }, // the room's shade
    { x: 2.7, y: 2.3, z: -1.6, power: 0.5, reach: 2.2 }, // kitchen bulb
    { x: 2.9, y: 2.2, z: 1.9, power: 0.3, reach: 1.8 }, // hall
    { x: -3.5, y: 1.3, z: -2.4, power: 0.3, reach: 1.5 }, // floor lamp
  ];
  const k = new Kit(lamps, 0.36);
  k.shell(W, D, H, { floor: 0x8a6238, floor2: 0x7a5530, ceiling: 0xd9d5c9, dado: 0xb7a887, wall: 0xb7a887, dadoH: 1.2 });
  // wallpaper: a darker stripe every pace along the two long walls
  for (let x = -W / 2 + 0.4; x < 1.2; x += 0.8) for (const z of [-D / 2 + 0.008, D / 2 - 0.008]) k.box(0.1, H, 0.004, x, H / 2, z, 0xa3946f);
  // skirting
  for (const [w, d, x, z] of [[W, 0.03, 0, -D / 2 + 0.015], [W, 0.03, 0, D / 2 - 0.015], [0.03, D, -W / 2 + 0.015, 0], [0.03, D, W / 2 - 0.015, 0]]) k.box(w, 0.09, d, x, 0.045, z, 0x5a3c26);

  // the partition between the room and the hall-and-kitchen strip
  const px = 1.3;
  k.box(0.1, H, 3.7, px, H / 2, -D / 2 + 1.85, 0xc4b796);
  k.block(px - 0.12, px + 0.12, -D / 2, 0.75);
  k.box(0.14, 2.1, 0.08, px, 1.05, 0.72, 0xd9d4c4); // door jamb, no door
  k.box(0.14, 0.6, 2.3, px, 2.4, 1.85, 0xc4b796); // header over the opening
  // kitchen / hall divider stub
  k.box(1.1, H, 0.1, W / 2 - 0.55, H / 2, 0.3, 0xc4b796);
  k.block(W / 2 - 1.15, W / 2, 0.2, 0.4);

  /* ---- the room */
  // ceiling shade: an orange fabric drum
  k.lit(0.36, 0.2, 0.36, -1.6, 2.2, -0.2, 0xffa860, 1.5);
  k.cyl(0.008, 0.36, -1.6, 2.52, -0.2, 0x2a2a2a, 4);
  // carpet on the wall over the sofa: red field, border, medallions
  const wx = -W / 2 + 0.015;
  k.box(0.02, 1.5, 2.6, wx, 1.55, 0.2, 0x7a1f1c);
  k.box(0.024, 1.3, 2.4, wx, 1.55, 0.2, 0x9a2a22);
  k.box(0.028, 1.18, 2.28, wx, 1.55, 0.2, 0x5e1716);
  for (const [dz, s] of [[-0.75, 0.3], [0, 0.42], [0.75, 0.3]]) {
    const g = new THREE.BoxGeometry(0.02, s, s);
    g.rotateX(Math.PI / 4);
    g.translate(wx + 0.012, 1.55, 0.2 + dz);
    k.parts.push(k.paint(g, 0xc9a13f));
    const g2 = new THREE.BoxGeometry(0.022, s * 0.55, s * 0.55);
    g2.rotateX(Math.PI / 4);
    g2.translate(wx + 0.014, 1.55, 0.2 + dz);
    k.parts.push(k.paint(g2, 0x243a52));
  }
  // sofa-bed under it, with a folded blanket
  k.box(0.9, 0.36, 2.1, -W / 2 + 0.5, 0.2, 0.2, 0x5c6b4a);
  k.box(0.22, 0.5, 2.1, -W / 2 + 0.14, 0.62, 0.2, 0x55633f);
  for (const z of [-0.95, 1.35]) k.box(0.9, 0.3, 0.16, -W / 2 + 0.5, 0.5, z, 0x4d5a3a);
  k.box(0.5, 0.1, 0.6, -W / 2 + 0.55, 0.43, 0.9, 0xb9ab8a);
  k.block(-W / 2, -W / 2 + 1.0, -0.95, 1.4);
  // a rug, a low table with a newspaper and a glass in a holder
  k.box(1.9, 0.012, 2.6, -1.5, 0.008, 0.1, 0x6a2a26);
  k.box(1.6, 0.014, 2.3, -1.5, 0.01, 0.1, 0x8a3a30);
  k.box(0.9, 0.04, 0.55, -1.7, 0.46, 0.2, 0x5a3c26);
  for (const [sx, sz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) k.box(0.04, 0.44, 0.04, -1.7 + sx, 0.22, 0.2 + sz, 0x4a301e);
  k.box(0.3, 0.008, 0.4, -1.85, 0.486, 0.2, 0xd8d4c4, 0.2);
  k.cyl(0.035, 0.1, -1.45, 0.53, 0.3, 0x9a5a2a, 8);
  k.block(-2.2, -1.2, -0.12, 0.52);
  // the wall unit along the street wall: books, crystal behind glass, TV
  const uz = D / 2 - 0.24;
  k.box(4.2, 2.05, 0.44, -1.75, 1.025, uz, 0x5a3c26);
  k.box(1.3, 0.75, 0.04, -3.1, 1.45, uz - 0.21, 0x3f2a1a);
  k.box(1.24, 0.69, 0.02, -3.1, 1.45, uz - 0.225, 0x9fb5b0);
  for (let i = 0; i < 6; i++) k.box(0.07, 0.11, 0.07, -3.55 + i * 0.18, 1.25, uz - 0.24, 0xe6f0f0);
  for (let i = 0; i < 4; i++) k.box(0.09, 0.07, 0.09, -3.45 + i * 0.22, 1.6, uz - 0.24, 0xdfe9ea);
  k.box(1.2, 0.02, 0.03, -3.1, 1.52, uz - 0.24, 0x3f2a1a);
  const BOOKS = [0x7a2f30, 0x2f4a68, 0x3b5c46, 0x6a5a40, 0x8a7a62, 0x4a3b30];
  for (let i = 0; i < 22; i++) k.box(0.045, 0.2 + ((i * 7) % 5) * 0.012, 0.03, -0.75 + i * 0.05, 1.5, uz - 0.225, BOOKS[(i * 5) % BOOKS.length]);
  k.box(1.2, 0.3, 0.03, -0.2, 1.5, uz - 0.21, 0x3a2617);
  k.box(1.4, 0.75, 0.03, -1.65, 1.05, uz - 0.205, 0x2e1e12); // the niche
  k.box(0.72, 0.52, 0.34, -1.65, 1.0, uz - 0.34, 0x3a2f28); // TV cabinet
  k.box(0.1, 0.4, 0.02, -1.36, 1.0, uz - 0.515, 0x8a8c88); // its dial panel
  for (const y of [0.9, 1.08]) k.cyl(0.022, 0.03, -1.36, y, uz - 0.525, 0x1c1c1c, 8);
  for (const x of [-3.6, -2.3, -1.0, 0.1]) k.box(0.02, 0.5, 0.02, x, 0.35, uz - 0.225, 0xb89a4a);
  k.block(-3.9, 0.4, D / 2 - 0.7, D / 2);
  // armchair and a floor lamp in the back corner
  k.box(0.75, 0.36, 0.7, -3.35, 0.2, -2.2, 0x6a4a3a, 0.5);
  k.box(0.75, 0.55, 0.16, -3.6, 0.6, -2.5, 0x5e4132, 0.5);
  k.block(-W / 2, -2.85, -D / 2, -1.75);
  k.cyl(0.14, 0.02, -2.75, 0.01, -2.65, 0x2a2a2a, 10);
  k.cyl(0.012, 1.4, -2.75, 0.7, -2.65, 0xb89a4a, 6);
  k.lit(0.3, 0.26, 0.3, -2.75, 1.5, -2.65, 0xffc890, 1.35);
  // the window on the back wall: night glass, tulle, a heavy curtain drawn
  // half across, a radiator, flowers on the sill
  const bz = -D / 2 + 0.02;
  k.lit(1.5, 1.3, 0.02, -0.9, 1.6, bz, 0x5f7ea8, 0.75);
  for (const x of [-1.66, -0.9, -0.14]) k.box(0.06, 1.38, 0.05, x, 1.6, bz + 0.02, 0xe6e2d6);
  for (const y of [0.93, 1.6, 2.27]) k.box(1.6, 0.06, 0.05, -0.9, y, bz + 0.02, 0xe6e2d6);
  k.box(1.8, 0.04, 0.24, -0.9, 0.9, bz + 0.12, 0xe6e2d6);
  for (let i = 0; i < 9; i++) k.box(0.07, 0.5, 0.11, -1.46 + i * 0.14, 0.5, bz + 0.1, 0xd9d6c9);
  k.box(0.7, 1.75, 0.05, -0.1, 1.6, bz + 0.1, 0x7a5a3a);
  k.box(0.5, 1.75, 0.04, -1.9, 1.6, bz + 0.1, 0x7a5a3a);
  k.box(2.4, 0.05, 0.08, -0.9, 2.5, bz + 0.1, 0x5a3c26);
  for (const x of [-1.3, -0.7]) {
    k.cyl(0.07, 0.11, x, 0.975, bz + 0.13, 0x9a5a3a, 8, 0.085);
    k.cyl(0.11, 0.16, x, 1.1, bz + 0.13, 0x3f6a45, 6, 0.04);
  }
  // a desk with a lamp and the radio set
  k.box(1.1, 0.04, 0.55, 0.55, 0.74, -2.6, 0x6a4a30);
  for (const [sx, sz] of [[-0.5, -0.22], [0.5, -0.22], [-0.5, 0.22], [0.5, 0.22]]) k.box(0.05, 0.72, 0.05, 0.55 + sx, 0.36, -2.6 + sz, 0x4a301e);
  k.box(0.42, 0.24, 0.2, 0.75, 0.88, -2.7, 0x4a3326);
  k.box(0.2, 0.14, 0.01, 0.68, 0.88, -2.595, 0xc9b98a);
  k.block(-0.05, 1.2, -D / 2, -2.25);

  /* ---- the kitchen (back of the strip) */
  const kx = W / 2 - 0.32;
  k.lit(0.14, 0.14, 0.14, 2.7, 2.42, -1.6, 0xffe0b0, 1.9);
  k.cyl(0.006, 0.22, 2.7, 2.59, -1.6, 0x2a2a2a, 4);
  // stove: white enamel, black top, four rings, a kettle
  k.box(0.56, 0.86, 0.56, kx, 0.43, -2.62, 0xe4e4de);
  k.box(0.57, 0.03, 0.57, kx, 0.875, -2.62, 0x1c1c1c);
  for (const [sx, sz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) k.cyl(0.085, 0.012, kx + sx, 0.895, -2.62 + sz, 0x3a3a3a, 10);
  k.box(0.02, 0.36, 0.42, kx - 0.285, 0.42, -2.62, 0x2a2a2a);
  k.cyl(0.1, 0.13, kx - 0.13, 0.96, -2.49, 0x3f6a8a, 10, 0.07);
  k.cyl(0.02, 0.03, kx - 0.13, 1.04, -2.49, 0x1c1c1c, 6);
  // sink cabinet and a cupboard over it
  k.box(0.56, 0.86, 0.9, kx, 0.43, -1.85, 0xd8d6cc);
  k.box(0.5, 0.03, 0.5, kx, 0.87, -1.85, 0x9aa0a2);
  k.cyl(0.012, 0.22, kx + 0.2, 0.99, -1.85, 0xb9bcba, 6);
  k.box(0.34, 0.6, 1.5, W / 2 - 0.18, 1.85, -2.15, 0xd8d6cc);
  for (const z of [-2.52, -1.78]) k.box(0.02, 0.5, 0.66, W / 2 - 0.36, 1.85, z, 0xc4c2b6);
  k.block(W / 2 - 0.65, W / 2, -D / 2, -1.35);
  // the fridge with a bread bin on top
  k.box(0.6, 1.35, 0.6, kx - 0.02, 0.675, -0.75, 0xe6e8e4);
  k.box(0.02, 0.26, 0.04, kx - 0.33, 0.95, -0.52, 0x8a8c88);
  k.box(0.4, 0.2, 0.3, kx - 0.02, 1.45, -0.75, 0xc9a13f);
  k.block(W / 2 - 0.68, W / 2, -1.1, -0.4);
  // table against the partition: oilcloth, two glasses of tea, sugar,
  // a stool either end
  k.box(0.6, 0.04, 0.95, px + 0.4, 0.74, -1.9, 0xd9d2bc);
  k.box(0.56, 0.7, 0.9, px + 0.4, 0.36, -1.9, 0x6a4a30);
  for (const z of [-2.15, -1.7]) {
    k.cyl(0.032, 0.09, px + 0.42, 0.805, z, 0x9a5a2a, 8);
    k.cyl(0.04, 0.03, px + 0.42, 0.775, z, 0xb9bcba, 8);
  }
  k.cyl(0.05, 0.07, px + 0.3, 0.795, -1.92, 0xe6e2d6, 8);
  k.block(px, px + 0.75, -2.4, -1.4);
  for (const z of [-2.75, -1.05]) {
    k.box(0.32, 0.04, 0.32, px + 0.45, 0.45, z, 0x7a5a3a);
    for (const [sx, sz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) k.box(0.03, 0.44, 0.03, px + 0.45 + sx, 0.22, z + sz, 0x5a3c26);
  }
  // kitchen window with a short curtain, a calendar by the fridge
  k.lit(0.9, 1.1, 0.02, 2.2, 1.7, bz, 0x5f7ea8, 0.75);
  for (const x of [1.72, 2.2, 2.68]) k.box(0.05, 1.16, 0.05, x, 1.7, bz + 0.02, 0xe6e2d6);
  for (const y of [1.13, 2.27]) k.box(1.0, 0.05, 0.05, 2.2, y, bz + 0.02, 0xe6e2d6);
  k.box(1.1, 0.4, 0.03, 2.2, 2.1, bz + 0.08, 0xd8c8a0);
  k.box(0.02, 0.4, 0.3, W / 2 - 0.02, 1.6, -0.1, 0xe6e2d6);
  k.box(0.022, 0.16, 0.3, W / 2 - 0.021, 1.72, -0.1, 0xa3261f);

  /* ---- the hall */
  k.lit(0.22, 0.1, 0.22, 2.9, 2.6, 1.9, 0xffe0b0, 1.6);
  // coat rack: a board with hooks, a sheepskin coat, a parka, a hat shelf
  k.box(0.03, 0.12, 1.3, W / 2 - 0.03, 1.75, 1.55, 0x5a3c26);
  k.box(0.26, 0.03, 1.3, W / 2 - 0.15, 1.95, 1.55, 0x5a3c26);
  k.box(0.18, 1.05, 0.44, W / 2 - 0.13, 1.2, 1.25, 0x6a4a30);
  k.box(0.16, 0.95, 0.4, W / 2 - 0.12, 1.25, 1.8, 0x2f4a68);
  k.box(0.24, 0.14, 0.26, W / 2 - 0.15, 2.04, 1.3, 0x4a3b30);
  for (const z of [1.2, 1.5, 1.85]) k.box(0.26, 0.1, 0.11, W / 2 - 0.2, 0.05, z, 0x2a2420);
  // a mirror and a shelf with the telephone by the door
  k.box(0.5, 0.8, 0.02, 2.0, 1.5, D / 2 - 0.02, 0x9fb0b8);
  k.box(0.56, 0.86, 0.015, 2.0, 1.5, D / 2 - 0.012, 0x5a3c26);
  k.box(0.5, 0.03, 0.22, 2.0, 0.95, D / 2 - 0.13, 0x5a3c26);
  k.box(0.2, 0.08, 0.16, 2.0, 1.0, D / 2 - 0.14, 0x8a1f1a);
  k.box(0.22, 0.04, 0.05, 2.0, 1.07, D / 2 - 0.14, 0x8a1f1a);
  doorway(k, 3.2, D / 2 - 0.02, 0x4a3326);

  return {
    k, W, D, H, name: 'Дом', sub: 'Home, flat 24',
    spawn: { x: 3.2, z: D / 2 - 1.1, yaw: 0 },
    door: { x: 3.2, z: D / 2 - 0.4 },
    // things to do at home, in room-local space
    uses: [{ id: 'sleep', x: -W / 2 + 1.2, z: 0.2, radius: 1.3 }],
    tv: { x: -1.72, y: 1.0, z: uz - 0.515, w: 0.5, h: 0.4 },
  };
}

/* ------------------------------------------------------------ assembly */

export function buildInteriors(ctx) {
  const { world } = ctx;
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  world.rooms = {};
  const defs = { shop: buildShop(), flat: buildFlat() };
  let n = 0;
  for (const [id, def] of Object.entries(defs)) {
    const { k, W, D } = def;
    const ox = SITE.x + n++ * 60;
    const oz = SITE.z;
    const group = new THREE.Group();
    group.name = `room-${id}`;
    group.position.set(ox, SITE.y, oz);
    const mesh = new THREE.Mesh(mergeGeometries(k.parts, false), mat);
    const glow = new THREE.Mesh(mergeGeometries(k.glow, false), glowMat);
    group.add(mesh, glow);
    if (def.tv) {
      // the one thing that moves: the picture on the television
      const tvMat = new THREE.MeshBasicMaterial({ color: 0x8fb4ef, fog: false });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(def.tv.w, def.tv.h), tvMat);
      screen.rotation.y = Math.PI;
      screen.position.set(def.tv.x, def.tv.y, def.tv.z);
      group.add(screen);
      ctx.addUpdater((dt, t) => {
        const f = 0.62 + 0.2 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + 0.16 * Math.sin(t * 23.0);
        tvMat.color.setRGB(0.5 * f, 0.66 * f, 0.95 * f);
      });
    }
    group.visible = false;
    world.group.add(group);

    // walls keep you in, furniture keeps you off it
    const t = 0.6;
    ctx.addColliderRect(ox - W / 2 - t, ox + W / 2 + t, oz - D / 2 - t, oz - D / 2);
    ctx.addColliderRect(ox - W / 2 - t, ox + W / 2 + t, oz + D / 2, oz + D / 2 + t);
    ctx.addColliderRect(ox - W / 2 - t, ox - W / 2, oz - D / 2, oz + D / 2);
    ctx.addColliderRect(ox + W / 2, ox + W / 2 + t, oz - D / 2, oz + D / 2);
    for (const [x0, x1, z0, z1] of k.solid) ctx.addColliderRect(ox + x0, ox + x1, oz + z0, oz + z1);
    ctx.addSurfaceRect(ox - W / 2, ox + W / 2, oz - D / 2, oz + D / 2, 'wood');
    ctx.addZone(def.name, def.sub, ox - W / 2 - 1, ox + W / 2 + 1, oz - D / 2 - 1, oz + D / 2 + 1);
    const here = (p) => ({ ...p, x: ox + p.x, z: oz + p.z });
    world.rooms[id] = {
      id,
      group,
      y: SITE.y,
      x0: ox - W / 2 - 1,
      x1: ox + W / 2 + 1,
      z0: oz - D / 2 - 1,
      z1: oz + D / 2 + 1,
      spawn: here(def.spawn),
      door: here(def.door),
      uses: (def.uses ?? []).map(here),
    };
  }
  world.roomList = Object.values(world.rooms);
  /** The room the player is in, or null out of doors. */
  world.inside = null;
}
