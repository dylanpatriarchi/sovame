// Panel blocks and public buildings, built from the town plan (town.js).
// Every block owns its seed, so adding or moving one never changes another.
// Each is modelled around its own origin and set down with a matrix, which
// is what lets a block stand along either axis. Trim is merged across the
// whole town: one mesh per material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../util.js';
import { BLOCKS, PUBLIC, CELL_W, FLOOR_H, blockCells, footprint, publicRect } from './town.js';

/** The matrix that sets a block-local model down in the world. */
export function blockMatrix(spec) {
  return new THREE.Matrix4().makeRotationY(spec.rot ? Math.PI / 2 : 0).setPosition(spec.x, 0, spec.z);
}

/** Frame of a public building's front door: local +z looks out of it. */
export function publicFrame(p) {
  const alongX = p.front.endsWith('x');
  const side = p.front.startsWith('+') ? 1 : -1;
  const depth = alongX ? p.w : p.d;
  return {
    matrix: new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0).setPosition(p.x, 0, p.z),
    side,
    lz: side * (depth / 2),
    width: alongX ? p.d : p.w,
  };
}

const PUBLIC_LOOK = {
  shop: { base: '#b9b2a2', lit: 0.75 },
  kindergarten: { base: '#cfc7b4', lit: 0.3 },
  culture: { base: '#c4b9a4', lit: 0.5 },
  school: { base: '#c9bfae', lit: 0.25 },
  clinic: { base: '#bfc6c4', lit: 0.4 },
};

function makeSignTexture(text, { fg = '#f4ead2', bg = '#3d1512', font = 'bold 64px sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d');
  c.font = font;
  canvas.width = Math.ceil(c.measureText(text).width) + 56;
  canvas.height = 96;
  if (bg) {
    c.fillStyle = bg;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  c.font = font;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillStyle = fg;
  c.fillText(text, canvas.width / 2, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: canvas.width / canvas.height };
}

/** A box with three draw groups — the two ends, the roof, the two long
 * faces — and no underside: nobody ever sees it. */
function wallBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.clearGroups();
  g.addGroup(0, 12, 0);
  g.addGroup(12, 6, 1);
  g.addGroup(24, 12, 2);
  return g;
}

export function buildBlocks(ctx) {
  const { world, materials: M, textures: T } = ctx;
  const TX = ctx.TEXTURES;

  const roofMat = new THREE.MeshStandardMaterial({ map: T.roofWinter, roughness: 0.95 });
  world.roofMats.push(roofMat);
  const snowLedgeMat = new THREE.MeshStandardMaterial({ map: T.snowLedge, transparent: true, depthWrite: false, roughness: 0.85 });

  const trim = { dark: [], white: [], snow: [], metal: [], ledge: [] };
  /** Runs `build` and moves whatever trim it added by `matrix`. */
  const framed = (matrix, build) => {
    const lists = Object.values(trim);
    const marks = lists.map((l) => l.length);
    build();
    lists.forEach((l, i) => {
      for (let k = marks[i]; k < l.length; k++) l[k].applyMatrix4(matrix);
    });
  };
  const bx = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const mkMat = (t, intensity = 0.5) => {
    const mat = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color(0xffffff), emissiveIntensity: intensity, roughness: 0.93 });
    world.windowMats.push(mat);
    return mat;
  };
  /** Parapet, its snow and the snow line under it, around a w × d roof. */
  const roofEdge = (w, d, h) => {
    const lipH = 0.45;
    for (const [lw, ld, x, z] of [
      [w + 0.3, 0.3, 0, d / 2],
      [w + 0.3, 0.3, 0, -d / 2],
      [0.3, d + 0.3, w / 2, 0],
      [0.3, d + 0.3, -w / 2, 0],
    ]) {
      trim.white.push(bx(lw, lipH, ld, x, h + lipH / 2 - 0.1, z));
      trim.snow.push(bx(lw + 0.04, 0.09, ld + 0.04, x, h + lipH - 0.08, z));
    }
    for (const side of [1, -1]) {
      const strip = new THREE.PlaneGeometry(w, 0.75);
      if (side < 0) strip.rotateY(Math.PI);
      strip.translate(0, h - 0.04, side * (d / 2 + 0.045));
      trim.ledge.push(strip);
    }
    trim.dark.push(bx(w + 1.8, 0.06, d + 1.8, 0, 0.04, 0));
  };

  /* ------------------------------------------------ panel blocks */
  for (const spec of BLOCKS) {
    const cells = blockCells(spec);
    const sideCells = Math.max(2, Math.round(spec.d / CELL_W));
    const detail = new Rng(spec.seed + 7000);
    const matrix = blockMatrix(spec);
    const h = spec.floors * FLOOR_H;

    let tv = null;
    if (spec.tv) {
      const r = new Rng(spec.seed + 500);
      tv = { f: r.int(1, spec.floors - 1), c: r.int(0, cells - 1), side: r.sign(), phase: r.float(0, TAU), speed: r.float(0.5, 1.05) };
    }
    // the long faces are what you stand in front of: drawn finer on good hardware
    const fine = world.quality === 'high' ? 1.5 : 1;
    const common = { floors: spec.floors, winter: false, street: spec.street, number: spec.number };
    const facadeMat = mkMat(
      TX.makeFacadeTextures({ ...common, scale: fine, cells, rng: new Rng(spec.seed), entranceEvery: 4, balconyChance: spec.balcony, litChance: spec.lit, tvCells: tv ? new Set([`${tv.f}:${tv.c}`]) : null }),
    );
    const sideMat = mkMat(TX.makeFacadeTextures({ ...common, cells: sideCells, rng: new Rng(spec.seed + 101), entranceEvery: 99, balconyChance: 0.08, litChance: spec.lit * 0.8 }));

    const mesh = new THREE.Mesh(wallBox(spec.w, h, spec.d), [sideMat, roofMat, facadeMat]);
    mesh.name = `block-${spec.id}`;
    mesh.position.y = h / 2;
    mesh.applyMatrix4(matrix);
    ctx.place(mesh);
    const f = footprint(spec, 0.25);
    ctx.addColliderRect(f.x0, f.x1, f.z0, f.z1);

    if (tv) {
      const cellW = spec.w / cells;
      const tvMat = new THREE.MeshBasicMaterial({ map: T.tvGlow, color: 0x8fb4ef, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(cellW * 0.5, FLOOR_H * 0.42), tvMat);
      quad.position.set(tv.side * (-spec.w / 2 + (tv.c + 0.5) * cellW), tv.f * FLOOR_H + 1.53, tv.side * (spec.d / 2 + 0.03));
      if (tv.side < 0) quad.rotation.y = Math.PI;
      quad.applyMatrix4(matrix);
      world.group.add(quad);
      world.tvMats.push({ mat: tvMat, phase: tv.phase, speed: tv.speed });
    }

    framed(matrix, () => {
      roofEdge(spec.w, spec.d, h);
      // roof access and its snow cap
      trim.dark.push(bx(3.2, 2.7, 3.4, spec.w * 0.22, h + 1.25, 0));
      trim.snow.push(bx(3.5, 0.14, 3.7, spec.w * 0.22, h + 2.66, 0));
      const vents = detail.int(3, 6);
      for (let i = 0; i < vents; i++) {
        const g = new THREE.CylinderGeometry(0.14, 0.16, detail.float(0.4, 0.9), 8);
        g.translate(detail.float(-spec.w * 0.42, spec.w * 0.42), h + 0.3, detail.float(-spec.d * 0.32, spec.d * 0.32));
        trim.metal.push(g);
      }
    });

    if (spec.slogan) {
      // red letters on a frame along the roof edge, lit from behind at night
      const { tex, aspect } = makeSignTexture(spec.slogan, { fg: '#d8362a', bg: null, font: 'bold 76px sans-serif' });
      const sh = 3.2;
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.1, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7 });
      world.posterMats.push(mat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(sh * aspect, sh), mat);
      sign.position.set(0, h + 0.5 + sh / 2, spec.d / 2 - 0.5);
      sign.applyMatrix4(matrix);
      world.group.add(sign);
      framed(matrix, () => {
        for (let x = (-sh * aspect) / 2; x <= (sh * aspect) / 2 + 0.01; x += (sh * aspect) / 6) trim.metal.push(bx(0.08, sh + 0.6, 0.08, x, h + 0.2 + sh / 2, spec.d / 2 - 0.62));
      });
    }
  }

  /* ------------------------------------------------ public buildings */
  for (const p of PUBLIC) {
    const look = PUBLIC_LOOK[p.kind];
    const seed = p.x * 131 + p.z * 17 + 9000;
    const h = p.floors * FLOOR_H + 0.6;
    const common = { floors: p.floors, base: look.base, plinth: '#8f8b80', entranceEvery: 99, balconyChance: 0, litChance: look.lit, winter: false, street: p.street, number: p.number };
    const zMat = mkMat(TX.makeFacadeTextures({ ...common, cells: Math.max(3, Math.round(p.w / 3.8)), rng: new Rng(seed) }), 0.6);
    const xMat = mkMat(TX.makeFacadeTextures({ ...common, cells: Math.max(3, Math.round(p.d / 3.8)), rng: new Rng(seed + 1) }), 0.6);
    const mesh = new THREE.Mesh(wallBox(p.w, h, p.d), [xMat, roofMat, zMat]);
    mesh.name = `public-${p.id}`;
    mesh.position.set(p.x, h / 2, p.z);
    ctx.place(mesh);
    const r = publicRect(p, 0.25);
    ctx.addColliderRect(r.x0, r.x1, r.z0, r.z1);
    framed(new THREE.Matrix4().makeTranslation(p.x, 0, p.z), () => roofEdge(p.w, p.d, h));

    // the sign over the door
    const frame = publicFrame(p);
    const { tex, aspect } = makeSignTexture(p.sign, p.kind === 'shop' ? { bg: '#14324a' } : {});
    const sh = p.kind === 'culture' ? 1.5 : 1.0;
    const sw = Math.min(frame.width * 0.8, sh * aspect);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.1, roughness: 0.6 });
    world.posterMats.push(mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / aspect), mat);
    sign.position.set(0, Math.min(h - 0.9, 5.2), frame.lz + frame.side * 0.08);
    if (frame.side < 0) sign.rotation.y = Math.PI;
    sign.applyMatrix4(frame.matrix);
    world.group.add(sign);
    if (p.kind === 'culture') {
      // a colonnade, because every House of Culture has one
      framed(frame.matrix, () => {
        for (let i = -3; i <= 3; i++) {
          if (i === 0) continue;
          const col = new THREE.CylinderGeometry(0.42, 0.46, h - 0.5, 12);
          col.translate(i * 2.6 - Math.sign(i) * 0.6, (h - 0.5) / 2, frame.lz + frame.side * 2.6);
          trim.white.push(col);
        }
        trim.white.push(bx(18.4, 0.5, 3.6, 0, h - 0.25, frame.lz + frame.side * 1.8));
        trim.snow.push(bx(18.5, 0.12, 3.7, 0, h + 0.06, frame.lz + frame.side * 1.8));
      });
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const v = new THREE.Vector3(i * 2.6 - Math.sign(i) * 0.6, 0, frame.lz + frame.side * 2.6).applyMatrix4(frame.matrix);
        ctx.addBoxCollider(v.x, v.z, 0.9, 0.9, 0);
      }
    }
  }

  /* ------------------------------------------------ meshes */
  const bake = (parts, material, name) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), material);
    mesh.name = name;
    mesh.castShadow = material !== snowLedgeMat;
    mesh.receiveShadow = true;
    world.group.add(mesh);
  };
  bake(trim.dark, M.concreteDark, 'trim-dark');
  bake(trim.white, M.concreteWhite, 'trim-white');
  bake(trim.snow, M.snow, 'trim-snow');
  bake(trim.metal, M.metal, 'trim-metal');
  bake(trim.ledge, snowLedgeMat, 'trim-ledge');
}
