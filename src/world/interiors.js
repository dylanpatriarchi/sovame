// Stairwell interiors (подъезды): sealed boxes placed far outside the
// district, reached by a short fade-teleport through an entrance door.
// One warm tungsten bulb against the blue hour outside — that is the point.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, makeCanvas } from '../util.js';
import { canvasTexture, makeSignTexture, makeSoftCircleTexture } from '../textures.js';
import { BUILDING_SPECS, entranceDoor } from './buildings.js';

/** Camera/light layer shared by all interior meshes: they are lit only by
 * their own bulb, never by the sun, sky or street lamps of the district. */
export const INTERIOR_LAYER = 1;

/** The enterable doors: building id, entrance cell and long side (+1/-1). */
const INTERIOR_SPECS = [
  { id: 'b7-court', building: 'B2', cell: 3, side: 1, entrance: 1, paint: '#5c705f', seed: 101 },
  { id: 'b9-cross', building: 'B4', cell: 11, side: -1, entrance: 3, paint: '#54687a', seed: 202 },
  { id: 'b3-tower', building: 'B3', cell: 7, side: 1, entrance: 2, paint: '#6d6852', seed: 303 },
];

/* ---------------------------------------------------------- textures */

/** Two-tone worn paint: colored wainscot below, dirty whitewash above. */
function makePaintTexture(band, seed) {
  const rng = new Rng(seed);
  const canvas = makeCanvas(256, 256);
  const c = canvas.getContext('2d');
  c.fillStyle = '#a39d8f';
  c.fillRect(0, 0, 256, 256);
  // mottled whitewash
  for (let i = 0; i < 44; i++) {
    c.fillStyle = rng.chance(0.5) ? `rgba(255,255,255,${rng.float(0.02, 0.06)})` : `rgba(40,38,34,${rng.float(0.02, 0.07)})`;
    c.fillRect(rng.float(0, 230), rng.float(0, 150), rng.float(8, 60), rng.float(4, 28));
  }
  // damp streaks running down from the ceiling line
  for (let i = 0; i < 10; i++) {
    const x = rng.float(0, 256);
    const len = rng.float(30, 130);
    const grad = c.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, `rgba(56,52,46,${rng.float(0.08, 0.18)})`);
    grad.addColorStop(1, 'rgba(56,52,46,0)');
    c.fillStyle = grad;
    c.fillRect(x, 0, rng.float(2, 7), len);
  }
  // wainscot band (lower ~1.6 m of a 4.2 m wall)
  const y0 = 158;
  c.fillStyle = band;
  c.fillRect(0, y0, 256, 256 - y0);
  c.fillStyle = 'rgba(255,255,255,0.2)';
  c.fillRect(0, y0, 256, 2);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(0, y0 + 2, 256, 2);
  // scuffs, and the polished hand grime at rail height
  for (let i = 0; i < 34; i++) {
    c.fillStyle = `rgba(0,0,0,${rng.float(0.03, 0.1)})`;
    c.fillRect(rng.float(0, 240), rng.float(y0 + 4, 250), rng.float(4, 40), rng.float(2, 10));
  }
  const grad = c.createLinearGradient(0, 232, 0, 256);
  grad.addColorStop(0, 'rgba(18,16,14,0)');
  grad.addColorStop(1, 'rgba(18,16,14,0.42)');
  c.fillStyle = grad;
  c.fillRect(0, 232, 256, 24);
  const tex = canvasTexture(canvas);
  tex.repeat.set(2, 1);
  return tex;
}

/** Bank of little mailbox doors with apartment numbers. */
function makeMailboxTexture(base, seed) {
  return makeSignTexture(256, 192, (c, W, H) => {
    const rng = new Rng(seed);
    c.fillStyle = '#45503e';
    c.fillRect(0, 0, W, H);
    const cols = 2;
    const rows = 5;
    const cw = W / cols;
    const ch = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cw;
        const y = r * ch;
        const shade = rng.float(-8, 8);
        c.fillStyle = `rgb(${84 + shade},${96 + shade},${76 + shade})`;
        c.fillRect(x + 4, y + 4, cw - 8, ch - 8);
        c.strokeStyle = 'rgba(18,22,16,0.85)';
        c.lineWidth = 1.5;
        c.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
        c.fillStyle = 'rgba(14,16,12,0.9)';
        c.fillRect(x + cw * 0.2, y + ch * 0.3, cw * 0.6, 3);
        c.fillStyle = '#d6d0c0';
        c.font = 'bold 13px Arial';
        c.fillText(String(base + r * cols + col), x + cw / 2, y + ch * 0.68);
      }
    }
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(96,60,32,${rng.float(0.08, 0.2)})`;
      c.fillRect(rng.float(0, W - 8), rng.float(0, H - 4), rng.float(2, 12), rng.float(1, 4));
    }
  });
}

/** Notice board: pinned papers, deliberately illegible. */
function makeNoticeTexture(seed) {
  return makeSignTexture(256, 192, (c, W, H) => {
    const rng = new Rng(seed);
    c.fillStyle = '#4a3927';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#6c5f45';
    c.fillRect(10, 10, W - 20, H - 20);
    const papers = rng.int(5, 7);
    for (let i = 0; i < papers; i++) {
      const pw = rng.float(42, 66);
      const ph = rng.float(46, 68);
      const px = rng.float(16, W - 16 - pw);
      const py = rng.float(16, H - 16 - ph);
      c.save();
      c.translate(px + pw / 2, py + ph / 2);
      c.rotate(rng.float(-0.09, 0.09));
      c.fillStyle = rng.chance(0.75) ? '#c8c3b2' : '#b0b6ba';
      c.fillRect(-pw / 2, -ph / 2, pw, ph);
      if (rng.chance(0.3)) {
        c.fillStyle = 'rgba(143,32,25,0.85)';
        c.fillRect(-pw / 2, -ph / 2, pw, 7);
      }
      c.strokeStyle = 'rgba(60,58,52,0.7)';
      c.lineWidth = 1;
      const lines = Math.floor(ph / 9);
      for (let l = 2; l < lines; l++) {
        const lw = rng.float(pw * 0.4, pw * 0.85);
        c.beginPath();
        c.moveTo(-lw / 2, -ph / 2 + l * 9);
        c.lineTo(lw / 2, -ph / 2 + l * 9);
        c.stroke();
      }
      c.fillStyle = '#8f2019';
      c.beginPath();
      c.arc(0, -ph / 2 + 3, 2.4, 0, TAU);
      c.fill();
      c.restore();
    }
  });
}

/** Entrance door from inside: dark metal, wired-glass window with the cold
 * blue of the courtyard behind it. */
function makeDoorTexture(seed) {
  return makeSignTexture(128, 256, (c, W, H) => {
    const rng = new Rng(seed);
    c.fillStyle = '#3b4941';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(13,17,15,0.85)';
    c.lineWidth = 4;
    c.strokeRect(8, 8, W - 16, H - 16);
    c.fillStyle = '#20324a';
    c.fillRect(28, 22, W - 56, 54);
    c.strokeStyle = 'rgba(160,180,205,0.4)';
    c.lineWidth = 1;
    for (let i = -4; i < 8; i++) {
      c.beginPath();
      c.moveTo(28 + i * 12, 22);
      c.lineTo(28 + i * 12 + 24, 76);
      c.stroke();
      c.beginPath();
      c.moveTo(28 + i * 12 + 24, 22);
      c.lineTo(28 + i * 12, 76);
      c.stroke();
    }
    c.strokeStyle = 'rgba(10,12,14,0.9)';
    c.lineWidth = 2;
    c.strokeRect(28, 22, W - 56, 54);
    c.strokeRect(18, 120, W - 36, 110);
    c.fillStyle = '#8b9092';
    c.fillRect(W - 36, 128, 18, 5);
    c.fillRect(W - 24, 118, 6, 22);
    for (let i = 0; i < 18; i++) {
      c.fillStyle = rng.chance(0.5) ? `rgba(12,14,12,${rng.float(0.05, 0.16)})` : `rgba(208,212,204,${rng.float(0.04, 0.12)})`;
      c.fillRect(rng.float(6, W - 20), rng.float(6, H - 10), rng.float(2, 16), rng.float(1, 3));
    }
    c.fillStyle = 'rgba(20,22,20,0.5)';
    c.fillRect(10, H - 26, W - 20, 18);
  });
}

/** The landing window: painted courtyard view at blue hour, frost on the
 * panes, dark frame. Emissive, so it glows cold against the warm stairwell. */
export function makeWindowViewTexture(seed) {
  return makeSignTexture(256, 320, (c, W, H) => {
    const rng = new Rng(seed);
    const horizon = H * 0.56;
    // sky
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#27365a');
    sky.addColorStop(1, '#77809c');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, horizon);
    // warm remnant where the sun set
    const rem = c.createRadialGradient(W * 0.3, horizon, 4, W * 0.3, horizon, W * 0.5);
    rem.addColorStop(0, 'rgba(216,142,88,0.4)');
    rem.addColorStop(1, 'rgba(216,142,88,0)');
    c.fillStyle = rem;
    c.fillRect(0, 0, W, horizon);
    // ground: snow in shade
    const ground = c.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#525f7c');
    ground.addColorStop(1, '#333c52');
    c.fillStyle = ground;
    c.fillRect(0, horizon, W, H - horizon);
    // distant block with a few lit windows
    c.fillStyle = '#1c2434';
    c.fillRect(W * 0.06, horizon - 74, W * 0.52, 74);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = rng.chance(0.75) ? 'rgba(255,183,94,0.9)' : 'rgba(188,214,255,0.85)';
      c.fillRect(W * 0.1 + rng.float(0, W * 0.42), horizon - 66 + rng.float(0, 58), 2.5, 3.5);
    }
    // nearer slab edge on the right
    c.fillStyle = '#232c3e';
    c.fillRect(W * 0.74, horizon - 40, W * 0.26, 40 + H - horizon);
    // street lamp with a warm pool
    const lamp = c.createRadialGradient(W * 0.68, horizon + 26, 1, W * 0.68, horizon + 26, 30);
    lamp.addColorStop(0, 'rgba(255,190,110,0.9)');
    lamp.addColorStop(0.25, 'rgba(255,190,110,0.3)');
    lamp.addColorStop(1, 'rgba(255,190,110,0)');
    c.fillStyle = lamp;
    c.fillRect(W * 0.68 - 30, horizon - 4, 60, 60);
    // bare birch
    c.strokeStyle = '#99a2b2';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(W * 0.2, H);
    c.quadraticCurveTo(W * 0.22, horizon + 40, W * 0.18, horizon - 10);
    c.stroke();
    c.strokeStyle = 'rgba(20,24,32,0.8)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const y = horizon + 10 + i * 22;
      c.beginPath();
      c.moveTo(W * 0.19, y);
      c.lineTo(W * 0.23, y + rng.float(-14, -4));
      c.stroke();
    }
    // falling snow
    c.fillStyle = 'rgba(232,240,252,0.7)';
    for (let i = 0; i < 60; i++) c.fillRect(rng.float(0, W), rng.float(0, H), 1.2, 1.2);
    // frost creeping in from the edges, heaviest at the bottom corners
    const frost = (x, y, r, a) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(228,238,250,${a})`);
      g.addColorStop(1, 'rgba(228,238,250,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    frost(0, H, W * 0.5, 0.75);
    frost(W, H, W * 0.5, 0.7);
    frost(0, 0, W * 0.3, 0.4);
    frost(W, 0, W * 0.3, 0.4);
    for (let i = 0; i < 8; i++) frost(rng.float(0, W), rng.chance(0.5) ? 0 : H, rng.float(10, 30), 0.35);
    // frame and muntins
    c.strokeStyle = '#2c3833';
    c.lineWidth = 22;
    c.strokeRect(0, 0, W, H);
    c.strokeStyle = '#a9afa9';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(W / 2, 0);
    c.lineTo(W / 2, H);
    c.moveTo(0, H * 0.45);
    c.lineTo(W, H * 0.45);
    c.stroke();
  });
}

/** Ribbed radiator panel with rust bleeding from the edges. */
export function makeRadiatorTexture(seed) {
  return makeSignTexture(128, 96, (c, W, H) => {
    const rng = new Rng(seed);
    c.fillStyle = '#7c786d';
    c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 10) {
      c.fillStyle = 'rgba(30,28,25,0.55)';
      c.fillRect(x + 6, 0, 4, H);
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(x, 0, 2, H);
    }
    for (let i = 0; i < 12; i++) {
      c.fillStyle = `rgba(110,66,32,${rng.float(0.1, 0.3)})`;
      const y = rng.chance(0.5) ? 0 : H - rng.float(2, 12);
      c.fillRect(rng.float(0, W - 6), y, rng.float(2, 8), rng.float(2, 10));
    }
  });
}

/* ---------------------------------------------------------- geometry */

const W = 4.4; // interior width (x)
const D = 6.4; // interior depth (z)
const H = 4.2; // wall height
const WT = 0.16; // wall thickness
const STEPS = 10;
const RISE = 0.15;
const RUN = 0.3;
const STAIR_X0 = -2.12; // flight against the left wall
const STAIR_X1 = -0.72;
const STAIR_Z0 = -0.9; // first step starts here
const LAND_Z = 2.1; // landing starts where the flight ends
export const LAND_H = STEPS * RISE;

function buildStairwell(ctx, spec, index) {
  const { world, materials: M } = ctx;
  const rng = new Rng(spec.seed);
  const cx = 400 + index * 40;
  const cz = 0;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const geos = [];
  const boxAt = (list, w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    list.push(g);
  };
  const addMesh = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    return mesh;
  };

  // walls (two-tone paint, merged into one draw call)
  boxAt(geos, W + 2 * WT, H, WT, 0, H / 2, -D / 2);
  boxAt(geos, W + 2 * WT, H, WT, 0, H / 2, D / 2);
  boxAt(geos, WT, H, D, -W / 2, H / 2, 0);
  boxAt(geos, WT, H, D, W / 2, H / 2, 0);
  const paintTex = makePaintTexture(spec.paint, spec.seed);
  addMesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.92 }));

  // ceiling and the vestibule soffit (plain dirty whitewash)
  geos.length = 0;
  boxAt(geos, W + 2 * WT, WT, D + 2 * WT, 0, H + WT / 2, 0);
  boxAt(geos, W, 0.14, 2.2, 0, 2.57, -2.1);
  addMesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.96 }));

  // floor
  addMesh(new THREE.BoxGeometry(W, 0.14, D), new THREE.MeshStandardMaterial({ color: 0x45423c, roughness: 0.9 }))
    .position.set(0, -0.07, 0);

  // stairs and landing (solid concrete mass)
  geos.length = 0;
  for (let i = 0; i < STEPS; i++) {
    const top = (i + 1) * RISE;
    boxAt(geos, STAIR_X1 - STAIR_X0, top, RUN, (STAIR_X0 + STAIR_X1) / 2, top / 2, STAIR_Z0 + (i + 0.5) * RUN);
  }
  boxAt(geos, 4.24, LAND_H, 3.12 - LAND_Z, 0, LAND_H / 2, (LAND_Z + 3.12) / 2);
  addMesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x767165, roughness: 0.95 }));

  // railings: sloped rail along the flight, rail on the landing edge
  geos.length = 0;
  const railX = -0.69;
  const slope = Math.atan2(LAND_H, STEPS * RUN);
  const rail = new THREE.BoxGeometry(0.05, 0.05, Math.hypot(LAND_H, STEPS * RUN) + 0.1);
  rail.rotateX(-slope);
  rail.translate(railX, 0.95 + LAND_H / 2, (STAIR_Z0 + LAND_Z) / 2);
  geos.push(rail);
  for (const i of [1, 4, 7]) {
    const stepTop = (i + 1) * RISE;
    const z = STAIR_Z0 + (i + 0.5) * RUN;
    const railY = 0.95 + ((z - STAIR_Z0) * LAND_H) / (STEPS * RUN);
    boxAt(geos, 0.04, railY - stepTop, 0.04, railX, (stepTop + railY) / 2, z);
  }
  boxAt(geos, 2.84, 0.05, 0.05, 0.7, LAND_H + 0.95, LAND_Z - 0.02);
  for (const x of [-0.4, 0.7, 1.8]) boxAt(geos, 0.04, 0.95, 0.04, x, LAND_H + 0.475, LAND_Z - 0.02);
  addMesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x374f3e, roughness: 0.58, metalness: 0.4 }));

  // entrance door from inside, slightly proud of the wall
  addMesh(new THREE.BoxGeometry(0.98, 2.08, 0.07), new THREE.MeshStandardMaterial({ map: makeDoorTexture(spec.seed + 1), roughness: 0.7, metalness: 0.25 }))
    .position.set(0, 1.04, -D / 2 + WT / 2 + 0.045);

  // mailboxes on the vestibule wall (numbers of this entrance's flats)
  addMesh(new THREE.BoxGeometry(0.16, 0.5, 0.74), new THREE.MeshStandardMaterial({ map: makeMailboxTexture(spec.flatBase, spec.seed + 2), roughness: 0.62, metalness: 0.35 }))
    .position.set(-W / 2 + 0.08, 1.5, -1.9);

  // notice board opposite
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), new THREE.MeshStandardMaterial({ map: makeNoticeTexture(spec.seed + 3), roughness: 0.9 }));
  board.rotation.y = -Math.PI / 2;
  board.position.set(W / 2 - 0.095, 1.58, -1.7);
  group.add(board);

  // radiator under the landing window, heating riser and branch
  addMesh(new THREE.BoxGeometry(1.35, 0.52, 0.16), new THREE.MeshStandardMaterial({ map: makeRadiatorTexture(spec.seed + 4), roughness: 0.78, metalness: 0.3 }))
    .position.set(0, LAND_H + 0.29, 3.04);
  geos.length = 0;
  const riser = new THREE.CylinderGeometry(0.05, 0.05, H, 10);
  riser.translate(1.98, H / 2, 3.0);
  geos.push(riser);
  const branch = new THREE.CylinderGeometry(0.032, 0.032, 1.28, 8);
  branch.rotateZ(Math.PI / 2);
  branch.translate(1.34, LAND_H + 0.12, 3.0);
  geos.push(branch);
  addMesh(mergeGeometries(geos), M.rust);

  // landing window: emissive cold courtyard view
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: makeWindowViewTexture(spec.seed + 5),
    emissiveIntensity: 1.05,
    roughness: 0.5,
  });
  const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.25), windowMat);
  windowMesh.rotation.y = Math.PI;
  windowMesh.position.set(0, 2.75, D / 2 - 0.085);
  group.add(windowMesh);

  // cold light pooling on the landing floor under the window
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.5),
    new THREE.MeshBasicMaterial({
      map: makeSoftCircleTexture(128, '150,178,228', 2.0),
      color: 0x8fa4c8,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, LAND_H + 0.012, 2.5);
  group.add(pool);

  // bare bulb on a long cord under a green shade, between vestibule and hall
  geos.length = 0;
  const cord = new THREE.CylinderGeometry(0.008, 0.008, 1.14, 6);
  cord.translate(0.2, H - 0.57, -0.5);
  geos.push(cord);
  const shade = new THREE.CylinderGeometry(0.045, 0.18, 0.12, 14, 1, true);
  shade.translate(0.2, H - 1.14, -0.5);
  geos.push(shade);
  addMesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x2c3a32, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x100c08, emissive: 0xffc576, emissiveIntensity: 5 })
  );
  bulb.position.set(0.2, H - 1.23, -0.5);
  group.add(bulb);

  // the one warm light of the stairwell, with a faint mains flicker; the
  // range cutoff keeps it out of the neighboring stairwells 40 m away
  const light = new THREE.PointLight(0xffb168, 36, 12, 2);
  light.position.set(0.2, H - 1.25, -0.5);
  group.add(light);
  ctx.addUpdater((dt, t) => {
    light.intensity = 36 * (0.93 + 0.05 * Math.sin(t * 11 + spec.seed) + 0.02 * Math.sin(t * 29 + spec.seed * 1.7));
  });

  // interior meshes live on their own layer, unlit by the district lights
  group.traverse((obj) => {
    obj.layers.set(INTERIOR_LAYER);
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  world.group.add(group);

  /* ---------------- physics ---------------- */

  // walls
  ctx.addColliderRect(cx - 2.36, cx + 2.36, cz - 3.32, cz - 3.06);
  ctx.addColliderRect(cx - 2.36, cx + 2.36, cz + 3.06, cz + 3.32);
  ctx.addColliderRect(cx - 2.32, cx - 2.06, cz - 3.26, cz + 3.26);
  ctx.addColliderRect(cx + 2.06, cx + 2.32, cz - 3.26, cz + 3.26);
  // flight railing and the landing edge (also blocks the height pop-up)
  ctx.addColliderRect(cx - 0.8, cx - 0.58, cz + STAIR_Z0 - 0.05, cz + LAND_Z);
  ctx.addColliderRect(cx - 0.66, cx + 2.14, cz + LAND_Z - 0.08, cz + LAND_Z + 0.06);

  // steps and landing heights
  for (let i = 0; i < STEPS; i++) {
    ctx.addHeightRect(cx + STAIR_X0 - 0.02, cx + STAIR_X1 + 0.02, cz + STAIR_Z0 + i * RUN, cz + STAIR_Z0 + (i + 1) * RUN, (i + 1) * RISE);
  }
  ctx.addHeightRect(cx - 2.14, cx + 2.14, cz + LAND_Z, cz + 3.14, LAND_H);

  // hard floor footsteps everywhere inside
  ctx.addSurfaceRect(cx - 2.2, cx + 2.2, cz - 3.2, cz + 3.2, 'concrete');

  return { cx, cz };
}

export function buildInteriors(ctx) {
  const { world } = ctx;
  INTERIOR_SPECS.forEach((spec, index) => {
    const bSpec = BUILDING_SPECS.find((b) => b.id === spec.building);
    const door = entranceDoor(bSpec, spec.cell, spec.side);
    // flats of this entrance (4 per floor): mailbox numbers 1..10 of the range
    spec.flatBase = (spec.entrance - 1) * 4 * bSpec.floors + 1;
    const { cx, cz } = buildStairwell(ctx, spec, index);
    world.interiors.push({
      id: spec.id,
      caption: `Entrance ${spec.entrance} · building ${bSpec.number}`,
      flatBase: spec.flatBase,
      bounds: { x0: cx - 2.2, x1: cx + 2.2, z0: cz - 3.2, z1: cz + 3.2 },
      doorOut: { x: door.pad.x, z: door.pad.z },
      doorIn: { x: cx, z: cz - 2.75 },
      inSpawn: { x: cx, z: cz - 1.15, yaw: Math.PI },
      outSpawn: door.out,
    });
  });
}
