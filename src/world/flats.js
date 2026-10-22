// Flats (квартиры): one per stairwell, behind the padded door on the
// landing. Hall, kitchen and the main room of a late-Soviet two-room flat,
// built as another sealed box far outside the district and reached by the
// same fade-teleport as the stairwells. One shared lamp light hops to the
// flat the player is in, so the scene light count stays constant.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, makeCanvas } from '../util.js';
import { canvasTexture, makeSignTexture, makeSoftCircleTexture } from '../textures.js';
import { INTERIOR_LAYER, LAND_H, STAIRWELL_D, makeRadiatorTexture, makeWindowViewTexture } from './interiors.js';
import { FLOOR_H } from './buildings.js';
import { paneMaterial, portalMatrix } from '../windowview.js';

const X0 = -3.5;
const X1 = 3.5;
const Z0 = -4;
const Z1 = 4;
const FH = 2.65; // ceiling height
const WT = 0.12;
const HALL_Z = -1.6; // hall / living partition
const SPLIT_X = -0.8; // kitchen | room partition
const KITCHEN_DOOR = [-2.6, -1.8];
const ROOM_DOOR = [0.4, 1.4];
const BATH_X = 1.8;

const FLAT_STYLES = [
  { wall: ['#c9b48a', '#a8865a'], carpet: ['#7a1f1c', '#c9a046', '#1d2f4a'], sofa: 0x5b6b4a, panel: 0x7f9a86 },
  { wall: ['#b9c2b0', '#8b977e'], carpet: ['#5a1a2a', '#d0b070', '#2a3b2a'], sofa: 0x6a4a3a, panel: 0x8fa4b4 },
  { wall: ['#c7b7a6', '#9c7f6e'], carpet: ['#6b2318', '#e0c27a', '#2b2a4c'], sofa: 0x48566e, panel: 0xa59a74 },
];

/* ---------------------------------------------------------- textures */

function makeWallpaperTexture(colors, seed) {
  const rng = new Rng(seed);
  const canvas = makeCanvas(256, 256);
  const c = canvas.getContext('2d');
  c.fillStyle = colors[0];
  c.fillRect(0, 0, 256, 256);
  // thin stripes with a small repeated flower between them
  c.fillStyle = colors[1];
  for (let x = 0; x < 256; x += 32) {
    c.globalAlpha = 0.35;
    c.fillRect(x, 0, 3, 256);
    c.globalAlpha = 0.5;
    for (let y = (x / 32) % 2 ? 16 : 0; y < 256; y += 32) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        c.beginPath();
        c.arc(x + 16 + Math.cos(a) * 3.5, y + 16 + Math.sin(a) * 3.5, 2.4, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(60,48,30,${rng.float(0.02, 0.06)})`;
    c.fillRect(rng.float(0, 256), rng.float(0, 256), rng.float(6, 40), rng.float(6, 40));
  }
  return canvasTexture(canvas, { repeat: true });
}

function makeParquetTexture(seed) {
  const rng = new Rng(seed);
  const canvas = makeCanvas(256, 256);
  const c = canvas.getContext('2d');
  // herringbone-ish blocks of oak strips, waxed and worn
  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const vertical = (bx + by) % 2 === 0;
      for (let s = 0; s < 4; s++) {
        const l = 52 + rng.float(-6, 8);
        c.fillStyle = `hsl(${rng.float(26, 34)}, ${rng.float(38, 52)}%, ${rng.float(28, 38)}%)`;
        if (vertical) c.fillRect(bx * 64 + s * 16, by * 64, 15, 63);
        else c.fillRect(bx * 64, by * 64 + s * 16, 63, 15);
        c.fillStyle = `rgba(0,0,0,${rng.float(0.05, 0.12)})`;
        if (vertical) c.fillRect(bx * 64 + s * 16 + rng.float(2, 10), by * 64, 1, l);
        else c.fillRect(bx * 64, by * 64 + s * 16 + rng.float(2, 10), l, 1);
      }
    }
  }
  return canvasTexture(canvas, { repeat: true });
}

function makeLinoleumTexture() {
  const canvas = makeCanvas(128, 128);
  const c = canvas.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      c.fillStyle = (x + y) % 2 ? '#8a7a64' : '#a49276';
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  c.fillStyle = 'rgba(30,24,16,0.12)';
  for (let i = 0; i < 4; i++) c.fillRect(0, i * 32, 128, 1);
  return canvasTexture(canvas, { repeat: true });
}

/** Wall carpet (ковёр): borders, a central medallion, repeating guls. */
function makeCarpetTexture(colors, seed) {
  return makeSignTexture(256, 180, (c, W, H) => {
    const rng = new Rng(seed);
    const [base, gold, dark] = colors;
    c.fillStyle = dark;
    c.fillRect(0, 0, W, H);
    c.fillStyle = base;
    c.fillRect(12, 12, W - 24, H - 24);
    c.strokeStyle = gold;
    c.lineWidth = 3;
    c.strokeRect(18, 18, W - 36, H - 36);
    c.lineWidth = 1.5;
    c.strokeRect(26, 26, W - 52, H - 52);
    const gul = (x, y, r, fill) => {
      c.fillStyle = fill;
      c.beginPath();
      c.moveTo(x, y - r);
      c.lineTo(x + r * 1.4, y);
      c.lineTo(x, y + r);
      c.lineTo(x - r * 1.4, y);
      c.closePath();
      c.fill();
    };
    gul(W / 2, H / 2, 34, dark);
    gul(W / 2, H / 2, 24, gold);
    gul(W / 2, H / 2, 13, base);
    for (const [x, y] of [[62, 56], [W - 62, 56], [62, H - 56], [W - 62, H - 56]]) {
      gul(x, y, 14, gold);
      gul(x, y, 7, dark);
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = rng.chance(0.5) ? gold : dark;
      c.globalAlpha = 0.5;
      c.fillRect(rng.float(30, W - 34), rng.float(30, H - 34), 3, 3);
    }
    c.globalAlpha = 1;
    // fringe
    c.fillStyle = '#d8ccb0';
    for (let x = 4; x < W; x += 4) {
      c.fillRect(x, 0, 1.5, 6);
      c.fillRect(x, H - 6, 1.5, 6);
    }
  });
}

/** Padded leatherette flat door with brass studs and the flat number. */
function makePaddedDoorTexture(number, seed) {
  return makeSignTexture(128, 256, (c, W, H) => {
    const rng = new Rng(seed);
    c.fillStyle = '#4a2c22';
    c.fillRect(0, 0, W, H);
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.5, 'rgba(255,220,190,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // diamond quilting with studs at the crossings
    c.strokeStyle = 'rgba(20,10,6,0.55)';
    c.lineWidth = 1.5;
    for (let i = -6; i < 10; i++) {
      c.beginPath();
      c.moveTo(i * 32, 0);
      c.lineTo(i * 32 + 256, 256);
      c.stroke();
      c.beginPath();
      c.moveTo(i * 32 + 256, 0);
      c.lineTo(i * 32, 256);
      c.stroke();
    }
    c.fillStyle = '#b8954e';
    for (let y = 16; y < H; y += 32) {
      for (let x = (y / 32) % 2 > 1 ? 0 : 16; x < W; x += 32) {
        c.beginPath();
        c.arc(x, y, 2.2, 0, Math.PI * 2);
        c.fill();
      }
    }
    // number plate, peephole, handle
    c.fillStyle = '#c9a65c';
    c.fillRect(W / 2 - 16, 46, 32, 18);
    c.fillStyle = '#2a1a10';
    c.font = 'bold 15px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(number), W / 2, 56);
    c.fillStyle = '#1a1410';
    c.beginPath();
    c.arc(W / 2, 84, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c9a65c';
    c.fillRect(W - 26, 134, 16, 5);
    for (let i = 0; i < 12; i++) {
      c.fillStyle = `rgba(0,0,0,${rng.float(0.05, 0.15)})`;
      c.fillRect(rng.float(0, W), rng.float(140, H), rng.float(4, 18), rng.float(2, 5));
    }
  });
}

function makeOilclothTexture() {
  const canvas = makeCanvas(128, 128);
  const c = canvas.getContext('2d');
  c.fillStyle = '#e8e0cc';
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = 'rgba(170,40,36,0.55)';
  for (let i = 0; i < 128; i += 16) {
    c.fillRect(i, 0, 8, 128);
    c.fillRect(0, i, 128, 8);
  }
  return canvasTexture(canvas, { repeat: true });
}

/* ---------------------------------------------------------- helpers */

/** World-space UVs so tiled textures keep their scale on any box. */
function worldUV(geometry, scale) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / scale, z / scale);
    else if (nx > 0.5) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
  return geometry;
}

function colored(geometry, hex) {
  const color = new THREE.Color(hex);
  const n = geometry.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geometry;
}

/* ---------------------------------------------------------- build */

/** Padded door textures, one per flat number actually shown. */
const doorTextures = new Map();
function doorTexture(number) {
  if (!doorTextures.has(number)) doorTextures.set(number, makePaddedDoorTexture(number, 900 + number * 7));
  return doorTextures.get(number);
}

function buildFlat(ctx, stairwell, index, variant) {
  const { world, materials: M } = ctx;
  const style = FLAT_STYLES[index % FLAT_STYLES.length];
  const seed = 900 + index * 37;
  const rng = new Rng(seed);
  const cx = 600 + index * 40;
  const cz = 0;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const walls = [];
  const furn = [];
  const wallBox = (x0, x1, z0, z1, y0 = 0, y1 = FH) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    walls.push(worldUV(g, 0.9));
  };
  const box = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    furn.push(colored(g, hex));
  };
  const cyl = (rt, rb, h, x, y, z, hex, seg = 14) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y, z);
    furn.push(colored(g, hex));
  };
  const addMesh = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  };

  /* ---- shell and partitions ---- */
  wallBox(X0 - WT, X1 + WT, Z0 - WT, Z0); // entrance wall
  wallBox(X0 - WT, X1 + WT, Z1, Z1 + WT); // window wall
  wallBox(X0 - WT, X0, Z0, Z1);
  wallBox(X1, X1 + WT, Z0, Z1);
  // hall partition with the kitchen and room doorways
  const hz0 = HALL_Z - WT / 2;
  const hz1 = HALL_Z + WT / 2;
  wallBox(X0, KITCHEN_DOOR[0], hz0, hz1);
  wallBox(KITCHEN_DOOR[1], ROOM_DOOR[0], hz0, hz1);
  wallBox(ROOM_DOOR[1], X1, hz0, hz1);
  wallBox(KITCHEN_DOOR[0], KITCHEN_DOOR[1], hz0, hz1, 2.08);
  wallBox(ROOM_DOOR[0], ROOM_DOOR[1], hz0, hz1, 2.08);
  // kitchen | room
  wallBox(SPLIT_X - WT / 2, SPLIT_X + WT / 2, HALL_Z, Z1);
  // bathroom block in the hall's east end (closed door)
  wallBox(BATH_X - WT / 2, BATH_X + WT / 2, Z0, -3.05);
  wallBox(BATH_X - WT / 2, BATH_X + WT / 2, -2.2, HALL_Z);
  wallBox(BATH_X - WT / 2, BATH_X + WT / 2, -3.05, -2.2, 2.08);
  // window openings are painted views on the inner wall face (see below)
  const wallpaper = new THREE.MeshStandardMaterial({ map: makeWallpaperTexture(style.wall, seed), roughness: 0.92 });
  addMesh(mergeGeometries(walls), wallpaper);

  // floor: parquet everywhere, linoleum laid over it in the kitchen and hall
  addMesh(worldUV(new THREE.BoxGeometry(X1 - X0, 0.1, Z1 - Z0).translate(0, -0.05, 0), 1.6), new THREE.MeshStandardMaterial({ map: makeParquetTexture(seed + 1), roughness: 0.55 }));
  const lino = new THREE.MeshStandardMaterial({ map: makeLinoleumTexture(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 });
  const linoGeos = [
    new THREE.PlaneGeometry(SPLIT_X - X0, Z1 - HALL_Z).rotateX(-Math.PI / 2).translate((X0 + SPLIT_X) / 2, 0.004, (HALL_Z + Z1) / 2),
    new THREE.PlaneGeometry(BATH_X - X0, HALL_Z - Z0).rotateX(-Math.PI / 2).translate((X0 + BATH_X) / 2, 0.004, (Z0 + HALL_Z) / 2),
  ];
  addMesh(worldUV(mergeGeometries(linoGeos), 0.8), lino);
  // ceiling
  addMesh(new THREE.BoxGeometry(X1 - X0 + 2 * WT, 0.08, Z1 - Z0 + 2 * WT).translate(0, FH + 0.04, 0), new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.95 }));

  /* ---- doors ---- */
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTexture(stairwell.flatBase ?? 1), roughness: 0.7 });
  addMesh(new THREE.BoxGeometry(0.92, 2.04, 0.06), doorMat).position.set(-2.2, 1.02, Z0 + 0.03);
  // bathroom door, closed: painted panel with the little figure window
  box(0.06, 2.0, 0.78, BATH_X - 0.07, 1.0, -2.62, 0xe6e1d4);
  box(0.02, 0.22, 0.3, BATH_X - 0.11, 1.75, -2.62, 0x9bb5c8);
  box(0.04, 0.03, 0.12, BATH_X - 0.12, 1.0, -2.36, 0xb9a46a);
  // door frames (casings) of the open doorways
  for (const [a, b] of [KITCHEN_DOOR, ROOM_DOOR]) {
    box(0.06, 2.1, WT + 0.04, a + 0.03, 1.05, HALL_Z, 0xe8e2d4);
    box(0.06, 2.1, WT + 0.04, b - 0.03, 1.05, HALL_Z, 0xe8e2d4);
    box(b - a, 0.06, WT + 0.04, (a + b) / 2, 2.1, HALL_Z, 0xe8e2d4);
  }
  // skirting boards along the main walls
  box(X1 - X0, 0.08, 0.02, 0, 0.04, Z1 - 0.01, 0x6a4a2e);
  box(0.02, 0.08, Z1 - HALL_Z, X1 - 0.01, 0.04, (HALL_Z + Z1) / 2, 0x6a4a2e);

  /* ---- hall ---- */
  box(0.05, 0.12, 1.1, X0 + 0.03, 1.72, -3.0, 0x5a3d26);
  for (const z of [-3.4, -3.0, -2.6]) box(0.12, 0.04, 0.04, X0 + 0.1, 1.68, z, 0xb9a46a);
  box(0.22, 1.05, 0.5, X0 + 0.16, 1.15, -3.25, 0x2e3440); // winter coat
  box(0.2, 0.95, 0.42, X0 + 0.15, 1.2, -2.75, 0x5b4a3a); // a second one
  box(0.36, 0.28, 0.32, X0 + 0.22, 1.86, -3.0, 0x6b2a24); // ushanka on the shelf
  box(0.32, 0.4, 0.9, X0 + 0.2, 0.2, -2.0, 0x4b3524); // shoe cabinet
  box(0.3, 0.08, 0.1, X0 + 0.24, 0.45, -1.95, 0x1d1d1d); // valenki-ish pair
  box(0.06, 0.9, 0.55, X0 + 0.03, 1.45, -1.95, 0x8f9a9e); // mirror backing
  const mirror = addMesh(new THREE.PlaneGeometry(0.47, 0.8), new THREE.MeshStandardMaterial({ color: 0x9fb0bc, roughness: 0.08, metalness: 0.9 }));
  mirror.position.set(X0 + 0.065, 1.45, -1.95);
  mirror.rotation.y = Math.PI / 2;
  box(1.1, 0.01, 0.6, -2.2, 0.006, -3.5, 0x6b4031); // door mat

  /* ---- kitchen (x < SPLIT_X, z > HALL_Z) ---- */
  // oil-painted lower half of the walls
  box(0.01, 1.4, Z1 - HALL_Z, X0 + 0.005, 0.7, (HALL_Z + Z1) / 2, style.panel);
  box(0.01, 1.4, Z1 - HALL_Z, SPLIT_X - WT / 2 - 0.005, 0.7, (HALL_Z + Z1) / 2, style.panel);
  // stove, sink cabinet and counter along the west wall
  box(0.6, 0.85, 0.55, X0 + 0.3, 0.425, 0.0, 0xe9e6dc);
  for (const [dx, dz] of [[-0.13, -0.12], [0.13, -0.12], [-0.13, 0.12], [0.13, 0.12]]) cyl(0.08, 0.08, 0.02, X0 + 0.3 + dx, 0.86, dz, 0x1c1c1c);
  box(0.02, 0.4, 0.42, X0 + 0.61, 0.45, 0.0, 0x2c2c2c); // oven window
  cyl(0.11, 0.12, 0.2, X0 + 0.27, 0.97, 0.12, 0xb8bcc0); // kettle
  box(0.6, 0.85, 1.1, X0 + 0.3, 0.425, 0.95, 0xd6cfba); // cabinet
  box(0.62, 0.04, 1.12, X0 + 0.3, 0.87, 0.95, 0x7d7f80); // counter
  box(0.4, 0.06, 0.45, X0 + 0.3, 0.87, 1.2, 0x9ea4a8); // sink
  cyl(0.015, 0.015, 0.25, X0 + 0.08, 1.0, 1.2, 0xb8bcc0, 6); // tap
  box(0.32, 0.6, 1.6, X0 + 0.16, 1.85, 0.55, 0xd6cfba); // wall cabinets
  // fridge in the corner by the door
  box(0.6, 1.5, 0.6, SPLIT_X - WT / 2 - 0.32, 0.75, HALL_Z + 0.4, 0xeeebe2);
  box(0.02, 0.3, 0.04, SPLIT_X - WT / 2 - 0.63, 1.05, HALL_Z + 0.55, 0xa9adb0);
  // table under the window, oilcloth on top, two stools
  box(0.08, 0.72, 0.08, -2.75, 0.36, 2.9, 0x6b4a2e);
  box(0.08, 0.72, 0.08, -1.65, 0.36, 2.9, 0x6b4a2e);
  box(0.08, 0.72, 0.08, -2.75, 0.36, 3.6, 0x6b4a2e);
  box(0.08, 0.72, 0.08, -1.65, 0.36, 3.6, 0x6b4a2e);
  const cloth = addMesh(new THREE.BoxGeometry(1.25, 0.03, 0.85).translate(-2.2, 0.74, 3.25), new THREE.MeshStandardMaterial({ map: makeOilclothTexture(), roughness: 0.45 }));
  cloth.geometry = worldUV(cloth.geometry, 0.25);
  for (const [sx, sz] of [[-2.2, 2.45], [-1.25, 3.2]]) {
    cyl(0.17, 0.17, 0.04, sx, 0.45, sz, 0x7a5a3a);
    for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) box(0.03, 0.45, 0.03, sx + dx, 0.22, sz + dz, 0x5a4026);
  }
  // tea things on the table
  cyl(0.07, 0.09, 0.13, -2.35, 0.82, 3.2, 0xf0ece0); // teapot
  cyl(0.04, 0.035, 0.07, -2.0, 0.79, 3.05, 0xf4f0e6); // cups
  cyl(0.04, 0.035, 0.07, -1.95, 0.79, 3.4, 0xf4f0e6);
  cyl(0.1, 0.1, 0.02, -2.6, 0.77, 3.45, 0xd8c9a8); // bread plate

  // kitchen wall radio (радиоточка) above the table: the interactable one
  box(0.24, 0.3, 0.1, X0 + 0.06, 1.55, 3.3, 0x7a5236);
  box(0.02, 0.18, 0.16, X0 + 0.115, 1.6, 3.3, 0xc8b88e); // grille cloth
  cyl(0.025, 0.025, 0.03, X0 + 0.125, 1.44, 3.24, 0x2a2a2a, 8);

  /* ---- room (x > SPLIT_X, z > HALL_Z): a living room or a bedroom ---- */
  const living = variant === 'living';
  if (living) {
    // sofa against the east wall
    box(0.85, 0.42, 2.0, X1 - 0.45, 0.21, 1.4, style.sofa);
    box(0.25, 0.55, 2.0, X1 - 0.15, 0.6, 1.4, style.sofa);
    box(0.85, 0.3, 0.18, X1 - 0.45, 0.55, 0.32, style.sofa);
    box(0.85, 0.3, 0.18, X1 - 0.45, 0.55, 2.48, style.sofa);
    box(0.4, 0.14, 0.4, X1 - 0.5, 0.5, 2.05, 0xc9a046); // cushion
  } else {
    // double bed, headboard on the east wall, under the wall carpet
    box(2.0, 0.3, 1.5, X1 - 1.0, 0.2, 1.4, 0x5a3a24);
    box(0.06, 0.95, 1.56, X1 - 0.03, 0.5, 1.4, 0x4e321e);
    box(0.06, 0.55, 1.56, X1 - 2.0, 0.3, 1.4, 0x4e321e);
    box(1.94, 0.16, 1.44, X1 - 1.0, 0.43, 1.4, 0xe9e4d8); // mattress and sheet
    box(1.45, 0.07, 1.5, X1 - 1.22, 0.53, 1.4, style.sofa); // blanket
    box(0.42, 0.12, 0.6, X1 - 0.3, 0.57, 1.05, 0xf3f0e8); // pillows
    box(0.42, 0.12, 0.6, X1 - 0.3, 0.57, 1.75, 0xf3f0e8);
    box(0.45, 0.5, 0.4, X1 - 0.25, 0.25, 0.3, 0x5a3a24); // bedside table
    cyl(0.07, 0.1, 0.05, X1 - 0.25, 0.53, 0.3, 0x2a2a2a); // alarm clock base
    box(0.12, 0.12, 0.06, X1 - 0.25, 0.6, 0.3, 0xb84a32); // the clock
  }
  // wall carpet above the sofa or the bed
  const carpetMat = new THREE.MeshStandardMaterial({ map: makeCarpetTexture(style.carpet, seed + 3), roughness: 0.98 });
  const carpet = addMesh(new THREE.PlaneGeometry(2.3, 1.6), carpetMat);
  carpet.rotation.y = -Math.PI / 2;
  carpet.position.set(X1 - 0.012, 1.55, 1.4);
  // floor rug
  const rug = addMesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshStandardMaterial({ map: makeCarpetTexture([style.carpet[2], style.carpet[1], style.carpet[0]], seed + 4), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(living ? 1.3 : 0.75, 0.006, living ? 1.5 : 2.6);
  // wall unit (стенка) along the partition: wardrobe, glass shelves, TV niche
  const unitX = SPLIT_X + WT / 2 + 0.25;
  box(0.5, 2.2, 0.8, unitX, 1.1, -1.05 + 0.4 + 0.05, 0x5a3a24); // wardrobe
  box(0.5, 0.75, 1.3, unitX, 0.375, 0.75, 0x5a3a24); // low cabinet
  box(0.5, 0.06, 1.3, unitX, 1.45, 0.75, 0x5a3a24); // shelf over the TV
  box(0.5, 0.75, 1.3, unitX, 1.85, 0.75, 0x5a3a24); // top cabinet
  box(0.5, 2.2, 1.2, unitX, 1.1, 2.0, 0x5a3a24); // glass bookcase body
  box(0.02, 1.9, 1.1, unitX + 0.26, 1.15, 2.0, 0x3a4a4c); // its glass
  for (let s = 0; s < 4; s++) {
    let z = 1.48;
    while (z < 2.5) {
      const w = rng.float(0.03, 0.07);
      const hh = rng.float(0.2, 0.32);
      box(0.18, hh, w, unitX + 0.1, 0.32 + s * 0.48 + hh / 2, z + w / 2, [0x6b1f1a, 0x1f3a5a, 0x2d4a2a, 0x8a6a3a, 0x3a2a4a, 0xa89a7a][rng.int(0, 5)]);
      z += w + 0.005;
    }
  }
  let screenMat = null;
  let tvGlow = null;
  if (living) {
    // the TV: a CRT on the low cabinet, screen faces the sofa
    box(0.5, 0.48, 0.58, unitX + 0.02, 0.99, 0.75, 0x2b2622);
    box(0.03, 0.06, 0.06, unitX + 0.28, 0.82, 1.0, 0x8a8a8a); // knob
    screenMat = new THREE.MeshBasicMaterial({ color: 0x8fb4ef });
    const screen = addMesh(new THREE.PlaneGeometry(0.42, 0.32), screenMat);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(unitX + 0.275, 1.01, 0.72);
    tvGlow = addMesh(
      new THREE.PlaneGeometry(2.6, 2.0),
      new THREE.MeshBasicMaterial({ map: makeSoftCircleTexture(128, '150,180,240', 2.2), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    tvGlow.rotation.x = -Math.PI / 2;
    tvGlow.position.set(unitX + 1.2, 0.012, 0.8);
    // armchair by the window, floor lamp beside it
    box(0.7, 0.4, 0.7, 2.6, 0.2, 3.35, style.sofa);
    box(0.7, 0.55, 0.18, 2.6, 0.62, 3.65, style.sofa);
    cyl(0.015, 0.015, 1.5, 3.15, 0.75, 3.6, 0x2a2a2a, 6);
    cyl(0.14, 0.14, 0.03, 3.15, 0.015, 3.6, 0x2a2a2a);
  } else {
    // the niche holds the good crystal and a record player
    box(0.4, 0.14, 0.4, unitX + 0.02, 0.82, 0.55, 0x3a2a20);
    cyl(0.15, 0.15, 0.01, unitX + 0.02, 0.9, 0.55, 0x151515, 20);
    for (let k = 0; k < 4; k++) cyl(0.035, 0.045, 0.14, unitX + 0.05, 0.82, 0.95 + k * 0.1, 0xbfd2dc, 10);
    // school desk by the window: lamp, exercise books, a chair
    box(1.1, 0.04, 0.6, 2.62, 0.74, 3.4, 0x7a5a3a);
    for (const [dx, dz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) box(0.04, 0.72, 0.04, 2.62 + dx, 0.36, 3.4 + dz, 0x5a4026);
    box(0.3, 0.02, 0.22, 2.4, 0.77, 3.35, 0x3a6a8a);
    box(0.3, 0.02, 0.22, 2.45, 0.79, 3.33, 0xd8d2c0);
    cyl(0.07, 0.09, 0.03, 3.0, 0.775, 3.55, 0x2c4a32);
    cyl(0.012, 0.012, 0.34, 3.0, 0.93, 3.55, 0x2c4a32, 6);
    box(0.42, 0.04, 0.42, 2.62, 0.45, 2.85, 0x6b4a2e); // chair
    box(0.42, 0.42, 0.04, 2.62, 0.68, 2.66, 0x6b4a2e);
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) box(0.03, 0.45, 0.03, 2.62 + dx, 0.22, 2.85 + dz, 0x5a4026);
  }
  // ceiling chandelier: three small shades
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    cyl(0.06, 0.1, 0.1, 1.3 + Math.cos(a) * 0.2, FH - 0.38, 1.2 + Math.sin(a) * 0.2, 0xd8c79a);
  }
  cyl(0.008, 0.008, 0.3, 1.3, FH - 0.15, 1.2, 0x2a2a2a, 6);
  // kitchen pendant: orange plastic shade over the table
  cyl(0.006, 0.006, 0.7, -2.2, FH - 0.35, 3.2, 0x2a2a2a, 6);

  /* ---- windows: painted night views, radiators under them ---- */
  const radiatorMat = new THREE.MeshStandardMaterial({ map: makeRadiatorTexture(seed + 5), roughness: 0.78, metalness: 0.3 });
  const windows = [
    { x: -2.15, w: 1.2 },
    { x: 1.35, w: 1.5 },
  ];
  const panes = [];
  windows.forEach((win, k) => {
    const view = addMesh(new THREE.PlaneGeometry(win.w, 1.35), paneMaterial(world, makeWindowViewTexture(seed + 10 + k), 0.85));
    view.rotation.y = Math.PI;
    view.position.set(win.x, 1.6, Z1 - 0.008);
    panes.push(view);
    // white-painted wooden frames: two casements, transom, the fortochka
    const fz = Z1 - 0.04;
    const fc = 0xe4ded0;
    box(win.w + 0.12, 0.07, 0.08, win.x, 1.6 + 0.71, fz, fc);
    box(win.w + 0.12, 0.07, 0.08, win.x, 1.6 - 0.71, fz, fc);
    box(0.07, 1.42, 0.08, win.x - win.w / 2 - 0.03, 1.6, fz, fc);
    box(0.07, 1.42, 0.08, win.x + win.w / 2 + 0.03, 1.6, fz, fc);
    box(0.06, 1.35, 0.07, win.x, 1.6, fz, fc);
    box(win.w, 0.05, 0.07, win.x, 1.6 + 0.3, fz, fc);
    box(0.04, 0.37, 0.06, win.x - win.w / 4, 1.6 + 0.49, fz - 0.01, fc);
    box(0.05, 0.12, 0.03, win.x + 0.06, 1.55, fz - 0.05, 0xb9a46a); // latch
    box(win.w + 0.16, 0.05, 0.22, win.x, 0.9, Z1 - 0.1, 0xe8e2d4); // sill
    addMesh(new THREE.BoxGeometry(win.w * 0.8, 0.5, 0.1), radiatorMat).position.set(win.x, 0.45, Z1 - 0.12);
  });
  // room curtains and tulle
  box(0.4, 2.2, 0.04, 1.35 - 0.95, 1.4, Z1 - 0.2, 0x7a3a2a);
  box(0.4, 2.2, 0.04, 1.35 + 0.95, 1.4, Z1 - 0.2, 0x7a3a2a);
  addMesh(
    new THREE.PlaneGeometry(1.6, 1.9),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, transparent: true, opacity: 0.13, roughness: 1, depthWrite: false, side: THREE.DoubleSide })
  ).position.set(1.35, 1.4, Z1 - 0.15);
  box(2.4, 0.04, 0.06, 1.35, 2.52, Z1 - 0.2, 0x8a7a5a); // curtain rail

  const furnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  addMesh(mergeGeometries(furn), furnMat);

  // emissive lamps: chandelier bulbs, kitchen pendant, floor-lamp shade
  const lampGeos = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    lampGeos.push(new THREE.SphereGeometry(0.045, 10, 6).translate(1.3 + Math.cos(a) * 0.2, FH - 0.45, 1.2 + Math.sin(a) * 0.2));
  }
  lampGeos.push(new THREE.CylinderGeometry(0.08, 0.26, 0.2, 18, 1, true).translate(-2.2, FH - 0.8, 3.2));
  if (living) lampGeos.push(new THREE.CylinderGeometry(0.14, 0.22, 0.3, 16, 1, true).translate(3.15, 1.55, 3.6));
  else lampGeos.push(new THREE.CylinderGeometry(0.05, 0.12, 0.12, 14, 1, true).translate(3.0, 1.12, 3.5));
  lampGeos.push(new THREE.SphereGeometry(0.18, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.45, 1).translate(-0.6, FH, -2.8));
  addMesh(mergeGeometries(lampGeos), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.15, 0.55), side: THREE.DoubleSide }));

  group.traverse((obj) => {
    obj.layers.set(INTERIOR_LAYER);
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  world.group.add(group);

  /* ---- physics ---- */
  const C = (x0, x1, z0, z1) => ctx.addColliderRect(cx + x0, cx + x1, cz + z0, cz + z1, true);
  C(X0 - WT - 0.2, X1 + WT + 0.2, Z0 - WT - 0.2, Z0);
  C(X0 - WT - 0.2, X1 + WT + 0.2, Z1, Z1 + WT + 0.2);
  C(X0 - WT - 0.2, X0, Z0, Z1);
  C(X1, X1 + WT + 0.2, Z0, Z1);
  C(X0, KITCHEN_DOOR[0], hz0, hz1);
  C(KITCHEN_DOOR[1], ROOM_DOOR[0], hz0, hz1);
  C(ROOM_DOOR[1], X1, hz0, hz1);
  C(SPLIT_X - WT / 2, SPLIT_X + WT / 2, HALL_Z, Z1);
  C(BATH_X - WT / 2 - 0.05, X1, Z0, HALL_Z); // bathroom is closed
  // furniture footprints
  C(X0, X0 + 0.62, -0.3, 1.52); // stove + cabinet
  C(SPLIT_X - WT / 2 - 0.64, SPLIT_X - WT / 2, HALL_Z, HALL_Z + 0.72); // fridge
  C(-2.82, -1.58, 2.82, 3.68); // table
  C(SPLIT_X, unitX + 0.27, HALL_Z, 2.62); // wall unit
  if (living) {
    C(X1 - 0.9, X1, 0.22, 2.58); // sofa
    C(2.24, 3.3, 3.0, Z1); // armchair + lamp
  } else {
    C(X1 - 2.05, X1, 0.08, 2.18); // bed and bedside table
    C(2.04, 3.2, 3.08, 3.72); // desk
  }
  C(X0, X0 + 0.42, -3.6, -1.5); // coats and shoe cabinet
  ctx.addSurfaceRect(cx + X0, cx + X1, cz + Z0, cz + Z1, 'wood');
  ctx.addSurfaceRect(cx + X0, cx + SPLIT_X, cz + HALL_Z, cz + Z1, 'concrete');

  // hidden unless the player is in this flat or on its stairwell
  group.visible = false;
  return {
    group,
    cx,
    cz,
    panes,
    doorMat,
    wallpaper,
    carpetMat,
    radio: new THREE.Vector3(cx + X0 + 0.15, 1.55, cz + 3.3),
    // kitchen pendant, room chandelier, hall ceiling dome
    lights: [new THREE.Vector3(cx - 2.2, FH - 1.0, cz + 2.7), new THREE.Vector3(cx + 0.8, FH - 0.6, cz + 0.2), new THREE.Vector3(cx - 0.6, FH - 0.35, cz - 2.8)],
    tv: screenMat ? { screenMat, glowMat: tvGlow.material, phase: rng.float(0, 6) } : null,
  };
}

/** Where each landing door leads: the left-wall flat looks out on the
 * entrance side, the one behind the far wall on the opposite facade. */
const SLOTS = [
  { variant: 'living', offset: 2, windowSide: 1, along: -1 },
  { variant: 'bedroom', offset: 3, windowSide: -1, along: 0 },
];

/** Flat doors on the landings and the flats behind them. */
export function buildFlats(ctx) {
  const { world } = ctx;
  world.flats = [];
  const wallpapers = FLAT_STYLES.map((st, k) => makeWallpaperTexture(st.wall, 950 + k * 13));
  const carpets = FLAT_STYLES.map((st, k) => makeCarpetTexture(st.carpet, 970 + k * 17));
  world.interiors.forEach((stairwell, si) => {
    const scx = (stairwell.bounds.x0 + stairwell.bounds.x1) / 2;
    const scz = (stairwell.bounds.z0 + stairwell.bounds.z1) / 2;
    SLOTS.forEach((slot, k) => {
      const index = si * 2 + k;
      const number = (stairwell.flatBase ?? 1) + slot.offset;
      // the padded door on the landing: left wall, or the far wall beside the window
      const landingDoorMat = new THREE.MeshStandardMaterial({ map: doorTexture(number), roughness: 0.7 });
      const door = k === 0 ? new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.92), landingDoorMat) : new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.0, 0.06), landingDoorMat);
      // the texture's front faces +x (left wall) or -z (far wall)
      if (k === 0) door.position.set(scx - 2.2 + 0.11, LAND_H + 1.0, scz + 2.62);
      else {
        door.rotation.y = Math.PI;
        door.position.set(scx + 1.62, LAND_H + 1.0, scz + STAIRWELL_D / 2 - 0.11);
      }
      door.layers.set(INTERIOR_LAYER);
      world.group.add(door);

      const f = buildFlat(ctx, stairwell, index, slot.variant);
      const flat = {
        id: k === 0 ? `${stairwell.id}:flat` : `${stairwell.id}:flat${k + 1}`,
        kind: 'flat',
        slot,
        number,
        caption: `Flat ${number} · ${stairwell.caption.toLowerCase()}`,
        parent: stairwell,
        bounds: { x0: f.cx + X0, x1: f.cx + X1, z0: f.cz + Z0, z1: f.cz + Z1 },
        // landing side: in front of the padded door
        doorOut: k === 0 ? { x: scx - 1.75, z: scz + 2.62, y: LAND_H } : { x: scx + 1.62, z: scz + 2.72, y: LAND_H },
        doorFacing: k === 0 ? { x: -1, z: 0 } : { x: 0, z: 1 },
        outSpawn: k === 0 ? { x: scx - 1.35, z: scz + 2.62, yaw: -Math.PI / 2 } : { x: scx + 1.55, z: scz + 2.4, yaw: 0 },
        // inside: just past the flat's own door, facing into the hall
        doorIn: { x: f.cx - 2.2, z: f.cz + Z0 + 0.45 },
        inSpawn: { x: f.cx - 2.2, z: f.cz + Z0 + 1.0, yaw: Math.PI },
        // outer face of the window wall: lands on the facade
        windowRef: new THREE.Vector3(f.cx, 0, f.cz + Z1 + WT),
        panes: f.panes,
        radio: f.radio,
        lightPos: f.lights,
        tv: f.tv,
        group: f.group,
        /** Renumbers the flat (both sides of its door) and redecorates it. */
        setNumber(n, look) {
          flat.number = n;
          landingDoorMat.map = doorTexture(n);
          f.doorMat.map = doorTexture(n);
          f.wallpaper.map = wallpapers[look % wallpapers.length];
          f.carpetMat.map = carpets[(look + k) % carpets.length];
        },
      };
      world.flats.push(flat);
    });
  });

  // three warm lamp lights shared by all flats, parked in the one you are in
  world.flatLights = [new THREE.PointLight(0xffb86e, 0, 7, 1.5), new THREE.PointLight(0xffc888, 0, 11, 1.2), new THREE.PointLight(0xffd29a, 0, 6, 1.5)];
  for (const light of world.flatLights) world.group.add(light);
  ctx.addUpdater((dt, t) => {
    for (const flat of world.flats) {
      if (!flat.tv) continue;
      const k = 0.55 + 0.3 * Math.sin(t * 1.7 + flat.tv.phase) * Math.sin(t * 0.63 + flat.tv.phase * 2) + (Math.sin(t * 0.21 + flat.tv.phase) > 0.9 ? 0.25 : 0);
      flat.tv.screenMat.color.setRGB(0.45 * k, 0.6 * k, 0.95 * k);
      flat.tv.glowMat.opacity = 0.08 + 0.08 * k;
    }
  });
}

/**
 * Numbers the landing's flats for the stairwell's current floor and entrance
 * (four flats a floor, as on the mailboxes) and gives them a look of their own.
 */
export function numberFlats(world, stairwell) {
  const a = stairwell.address;
  const floors = a?.spec.floors ?? 5;
  const base = a ? (a.entrance - 1) * 4 * floors + 1 : (stairwell.flatBase ?? 1);
  const seed = a ? Math.abs(Math.round(a.x * 3.1 + a.spec.z * 1.7)) : 0;
  for (const flat of world.flats ?? []) {
    if (flat.parent !== stairwell) continue;
    const n = base + (stairwell.floor - 1) * 4 + flat.slot.offset;
    flat.setNumber(n, seed + stairwell.floor);
    flat.caption = `Flat ${n} · floor ${stairwell.floor} · ${stairwell.caption.toLowerCase()}`;
  }
}

/**
 * Where a flat's windows really are: same floor and entrance as its
 * stairwell, a cell or two along the block, on the facade it faces.
 */
export function flatView(flat) {
  const stairwell = flat.parent;
  const a = stairwell.address;
  if (!a) return null;
  const spec = a.spec;
  const side = a.side * flat.slot.windowSide;
  const half = spec.w / 2 - 4.2;
  const x = Math.min(spec.x + half, Math.max(spec.x - half, a.x + flat.slot.along * a.side * 5.1));
  const facadeZ = spec.z + side * (spec.d / 2);
  // ground-floor flats sit a little above the street, like the real ones
  const y = (stairwell.floor - 1) * FLOOR_H + 0.1;
  return {
    toWorld: portalMatrix(flat.windowRef, new THREE.Vector3(x, y, facadeZ), side),
    point: new THREE.Vector3(x, 0, facadeZ + side * 0.03),
    normal: new THREE.Vector3(0, 0, side),
    panes: flat.panes,
  };
}

/** Parks the shared flat lights in the given flat (or turns them off) and
 * shows only the flats reachable from where the player is. */
export function setFlatLight(world, flat, interior = flat) {
  for (const f of world.flats ?? []) f.group.visible = !!interior && (f === interior || f.parent === interior);
  const levels = [5.5, 11, 3.5];
  world.flatLights?.forEach((light, i) => {
    if (flat) light.position.copy(flat.lightPos[i]);
    light.intensity = flat ? levels[i] : 0;
  });
}
