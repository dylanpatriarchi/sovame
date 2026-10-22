// Vegetation: recursive bare trees (poplars, birches, spreading yard trees)
// with clustered autumn foliage, winter snow caps and marcescent leaves,
// snow-laden spruces, bushes and crows.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scatterWestTrees } from './west.js';
import { scatterSouthTrees } from './south.js';
import { Rng, TAU, DEG, lerp, clamp } from '../util.js';
import { WORLD } from '../config.js';
import { PARKING_LOT, PARKING_NORTH, WALK_PATHS, NEW_WALK_PATHS } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------------ species
 * Four branching orders: trunk (0) -> primary limbs (1) -> secondary
 * branches (2) -> fine twigs (3). Children take 55-70% of the parent radius
 * at the attach point, branch at species-specific angles and bend upward a
 * little more with every segment (phototropism); birch terminal orders hang
 * downward instead (droop). All numbers are degrees/meters. */
const SPECIES = {
  poplar: {
    variants: 3,
    seed: 7201,
    wood: 'bark',
    height: [11, 14.5],
    base: [0.2, 0.27],
    tipR: [0.09, 0.14],
    flare: 0.55,
    lean: 0.02,
    curve: 0.03,
    segPhoto: [0.05, 0.3, 0.22, 0.12],
    segDroop: [0, 0, 0, 0],
    children: [[6, 9], [3, 4], [2, 3]],
    childAngle: [[10, 24], [8, 22], [10, 26]],
    childLen: [[0.28, 0.45], [0.32, 0.52], [0.35, 0.55]],
    childRad: [0.5, 0.65],
    childPhoto: [0.35, 0.3, 0.2],
    radial: [8, 6, 4, 3],
    shade: [1.0, 0.97, 0.85, 0.66],
    crownStart: 0.22,
    topShorten: 0.7,
    minY: [0.05, 0.1, 0.05, -0.3],
    anchors: [[0.35, 0.72], [0.5, 0.24]],
    blobR: [0.3, 0.52],
    blobStretch: 1.35,
    palette: [0xc9b13a, 0xbfa02e, 0xd8c05a, 0xa98f24, 0xc7a832],
    marcescent: 0,
  },
  birch: {
    variants: 4,
    seed: 7101,
    wood: 'birch',
    height: [6.6, 9.0],
    base: [0.12, 0.18],
    tipR: [0.1, 0.16],
    flare: 0.9,
    lean: 0.06,
    curve: 0.045,
    segPhoto: [0.03, 0.04, 0.02, 0],
    segDroop: [0, 0, 0.05, 0.16],
    children: [[3, 5], [2, 3], [3, 4]],
    childAngle: [[26, 44], [22, 42], [16, 38]],
    childLen: [[0.5, 0.7], [0.5, 0.7], [0.45, 0.65]],
    childRad: [0.55, 0.68],
    childPhoto: [0.1, 0.06, 0.02],
    radial: [7, 5, 4, 3],
    shade: [1.0, 0.92, 0.62, 0.4],
    crownStart: 0.34,
    topShorten: 0.55,
    minY: [-0.05, -0.2, -0.5, -1],
    anchors: [[0.35, 0.72], [0.5, 0.22]],
    blobR: [0.24, 0.44],
    blobStretch: 1.1,
    palette: [0xd9a92c, 0xcaa120, 0xbb8a1e, 0xe0b83a, 0xb57f1c],
    marcescent: 0.45,
  },
  yard: {
    variants: 3,
    seed: 7301,
    wood: 'bark',
    height: [4.5, 6.2],
    base: [0.17, 0.23],
    tipR: [0.1, 0.15],
    flare: 0.8,
    lean: 0.08,
    curve: 0.06,
    segPhoto: [0.02, 0.04, 0.06, 0.02],
    segDroop: [0, 0, 0, 0.05],
    children: [[3, 5], [3, 4], [2, 4]],
    childAngle: [[32, 55], [28, 52], [20, 48]],
    childLen: [[0.55, 0.8], [0.5, 0.72], [0.42, 0.62]],
    childRad: [0.55, 0.7],
    childPhoto: [0.06, 0.05, 0.03],
    radial: [7, 5, 4, 3],
    shade: [1.0, 0.96, 0.8, 0.58],
    crownStart: 0.4,
    topShorten: 0.4,
    minY: [-0.1, -0.2, -0.4, -0.8],
    anchors: [[0.35, 0.78], [0.5, 0.3]],
    blobR: [0.34, 0.6],
    blobStretch: 1.05,
    palette: [0xc9791f, 0xa85f1c, 0xb3702a, 0x8e5b1e, 0xcf8a26],
    marcescent: 0.5,
  },
};

const DEAD_PALETTE = [0x8a6a3a, 0x7a5c30, 0x96742e];

/* ------------------------------------------------------------ tree growth */

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Random tilt of `dir` by `angle` around a random horizontal axis. */
function spreadDir(dir, angle, rng, photo, minY) {
  _axis.set(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).cross(dir);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  const d = dir.clone().applyAxisAngle(_axis, angle);
  if (photo) d.y += photo;
  if (d.y < minY) d.y = minY;
  return d.normalize();
}

/** In-place small wobble plus an upward (or downward, when drooping) pull. */
function bendInPlace(d, rng, wobble, photo, droop) {
  if (wobble > 0) {
    _axis.set(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).cross(d);
    if (_axis.lengthSq() > 1e-6) {
      _axis.normalize();
      d.applyAxisAngle(_axis, rng.float(-wobble, wobble));
    }
  }
  if (photo) d.y += photo;
  if (droop) d.y -= droop;
  d.normalize();
}

/** One tapered, open-ended cylinder segment with a two-stop vertex shade. */
function addSegment(parts, p, dir, r0, r1, len, radial, shade) {
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = shade * (0.9 + 0.1 * (pos.getY(i) / len));
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  _q.setFromUnitVectors(UP, dir);
  geo.applyQuaternion(_q);
  geo.translate(p.x, p.y, p.z);
  parts.push(geo);
}

/** Solid color attribute for a whole geometry (foliage, dead leaves). */
function colorGeo(geo, hex, brightness) {
  const c = new THREE.Color(hex).multiplyScalar(brightness);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Grows one tree in local space (base at the origin). Returns merged wood
 * geometry plus the attachment records used for foliage, snow and dead
 * leaves. The branch skeleton is walked segment by segment and children
 * attach to the actual curved path, so limbs never float off the parent.
 */
function growTree(rng, spec) {
  const wood = [];
  const anchors = []; // { p, dir, scale } — autumn foliage / marcescence
  const limbs = []; // { p, dir, len, r } — snow caps on the main limbs

  const grow = (p, dir, len, r0, rTip, order) => {
    const segs = order === 0 ? 5 : len > 1.3 ? 3 : 2;
    const radial = spec.radial[Math.min(order, spec.radial.length - 1)];
    const shade = spec.shade[Math.min(order, spec.shade.length - 1)];
    const segLen = len / segs;
    // walk the branch, storing the path so children attach on the curve
    const path = [{ p: p.clone(), d: dir.clone(), r: r0 }];
    let cp = p.clone();
    let cd = dir.clone();
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const flare0 = order === 0 ? 1 + spec.flare * Math.max(0, 1 - t0 * 6) : 1;
      const flare1 = order === 0 ? 1 + spec.flare * Math.max(0, 1 - t1 * 6) : 1;
      addSegment(wood, cp, cd, lerp(r0, rTip, t0) * flare0, lerp(r0, rTip, t1) * flare1, segLen, radial, shade);
      cp.addScaledVector(cd, segLen);
      bendInPlace(cd, rng, spec.curve * (order === 0 ? 1 : 1.7), spec.segPhoto[order] ?? 0, (spec.segDroop[order] ?? 0) * (0.4 + t0));
      path.push({ p: cp.clone(), d: cd.clone(), r: lerp(r0, rTip, t1) });
    }
    const at = (t) => {
      const f = clamp(t, 0, 0.999) * segs;
      const i = Math.floor(f);
      const u = f - i;
      const a = path[i];
      const b = path[Math.min(i + 1, segs)];
      return {
        p: a.p.clone().lerp(b.p, u),
        d: a.d.clone().lerp(b.d, u).normalize(),
        r: lerp(a.r, b.r, u),
      };
    };

    if (order === 1) limbs.push({ p, dir, len, r: r0 });
    if (order === 2 && len > 1.2 && rng.chance(0.4)) limbs.push({ p, dir, len, r: r0 });

    // foliage anchors along the outer branch, thinning toward the tip
    if (order >= 2) {
      const [tBase, keep] = spec.anchors[order - 2];
      for (const t of [tBase, (tBase + 1) / 2, 0.88]) {
        if (!rng.chance(keep * lerp(1.1, 0.3, t))) continue;
        const s = at(t);
        anchors.push({ p: s.p, dir: s.d, scale: order === 2 ? 1.05 : 0.8 });
      }
    }

    if (order >= 3 || len < 0.3) return;
    const [minC, maxC] = spec.children[order];
    const n = rng.int(minC, maxC);
    for (let k = 0; k < n; k++) {
      const t = order === 0 ? rng.float(spec.crownStart, 0.97) : rng.float(0.25, 1.0);
      const s = at(t);
      const ang = rng.float(spec.childAngle[order][0], spec.childAngle[order][1]) * DEG;
      const childDir = spreadDir(s.d, ang, rng, spec.childPhoto[order] ?? 0, spec.minY[order + 1] ?? -0.2);
      let childLen = len * rng.float(spec.childLen[order][0], spec.childLen[order][1]);
      if (order === 0) childLen *= 1 - t * spec.topShorten + 0.25;
      else childLen *= rng.float(0.85, 1.15);
      childLen = Math.max(0.4, childLen);
      const childR = Math.max(0.011, s.r * rng.float(spec.childRad[0], spec.childRad[1]));
      grow(s.p, childDir, childLen, childR, childR * rng.float(0.4, 0.6), order + 1);
    }
  };

  const leanA = rng.float(0, TAU);
  const lean = rng.float(0, spec.lean);
  const dir0 = new THREE.Vector3(Math.cos(leanA) * lean, 1, Math.sin(leanA) * lean).normalize();
  const height = rng.float(spec.height[0], spec.height[1]);
  const baseR = rng.float(spec.base[0], spec.base[1]);
  grow(new THREE.Vector3(0, -0.18, 0), dir0, height, baseR, baseR * rng.float(spec.tipR[0], spec.tipR[1]), 0);

  // darken the buried/ground-contact band (cheap ambient occlusion)
  const woodGeo = mergeGeometries(wood, false);
  {
    const pos = woodGeo.attributes.position;
    const colors = woodGeo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0.55) {
        const m = lerp(0.62, 1, clamp(y / 0.55, 0, 1));
        colors.setXYZ(i, colors.getX(i) * m, colors.getY(i) * m, colors.getZ(i) * m);
      }
    }
  }
  return { wood: woodGeo, anchors, limbs, baseR, dir0 };
}

/** Autumn crown: many small blobs following the branch anchors. */
function bakeFoliage(rng, spec, anchors) {
  const parts = [];
  for (const a of anchors) {
    const r = rng.float(spec.blobR[0], spec.blobR[1]) * a.scale;
    const geo = new THREE.IcosahedronGeometry(r, 0);
    geo.scale(rng.float(0.85, 1.15), rng.float(0.6, 0.8) * spec.blobStretch, rng.float(0.85, 1.15));
    _q.setFromUnitVectors(UP, a.dir);
    geo.applyQuaternion(_q);
    geo.rotateY(rng.float(0, TAU));
    geo.translate(a.p.x + a.dir.x * r * 0.5, a.p.y + a.dir.y * r * 0.5, a.p.z + a.dir.z * r * 0.5);
    colorGeo(geo, rng.pick(spec.palette), rng.float(0.85, 1.08));
    parts.push(geo);
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

/** Winter: sparse clusters of dead leaves that never dropped. */
function bakeMarcescence(rng, spec, anchors) {
  const parts = [];
  if (!rng.chance(spec.marcescent)) return null;
  const n = rng.int(2, 4);
  for (let i = 0; i < n && anchors.length; i++) {
    const a = anchors[rng.int(0, anchors.length - 1)];
    // a small crumple of tiny blobs, not one smooth pod
    const blobs = rng.int(2, 3);
    for (let b = 0; b < blobs; b++) {
      const r = rng.float(0.07, 0.12);
      const geo = new THREE.IcosahedronGeometry(r, 0);
      geo.scale(1, 0.6, 1);
      geo.rotateY(rng.float(0, TAU));
      geo.translate(a.p.x + rng.float(-0.12, 0.12), a.p.y + rng.float(-0.08, 0.08), a.p.z + rng.float(-0.12, 0.12));
      colorGeo(geo, rng.pick(DEAD_PALETTE), rng.float(0.85, 1.05));
      parts.push(geo);
    }
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

/** Winter: snow crusts plastered on the windward side of the trunk (the part
 * a walking player actually sees) plus thin pillows on the lowest limbs. */
function bakeSnow(rng, spec, tree) {
  const parts = [];
  // trunk crust: an open shell hugging the base, centered on local +Z; the
  // region bake rotates it to face the storm azimuth of the district
  {
    const shell = new THREE.CylinderGeometry(tree.baseR * 1.15, tree.baseR * (1.15 + spec.flare), 1.3, 5, 1, true, -0.55, 1.1).toNonIndexed();
    shell.translate(0, 0.65, 0);
    _q.setFromUnitVectors(UP, tree.dir0);
    shell.applyQuaternion(_q);
    parts.push(shell);
  }
  // a wind-blown drift ringed around the trunk base
  {
    // a soft dome, not an icosahedron: the faceted one read as a white
    // star-shaped plate around every trunk
    const drift = new THREE.SphereGeometry(1, 14, 4, 0, TAU, 0, Math.PI / 2).toNonIndexed();
    drift.scale(tree.baseR * rng.float(3.6, 4.8), 0.13, tree.baseR * rng.float(2.8, 3.8));
    drift.rotateY(rng.float(0, TAU));
    drift.translate(rng.float(-0.05, 0.05), 0.03, rng.float(-0.05, 0.05));
    parts.push(drift);
  }
  for (const l of tree.limbs) {
    // steep limbs hold no snow, and neither do thin or high ones: from first
    // person a pillow up high is only ever seen from below, where its
    // underside catches nothing but the dark ground hemi
    if (l.dir.y > 0.8 || l.r < 0.035 || l.p.y > 3.2) continue;
    const caps = rng.int(1, 2);
    for (let c = 0; c < caps; c++) {
      const t = caps === 1 ? rng.float(0.12, 0.42) : 0.12 + c * 0.3 + rng.float(-0.03, 0.03);
      const cx = l.p.x + l.dir.x * l.len * t;
      const cy = l.p.y + l.dir.y * l.len * t;
      const cz = l.p.z + l.dir.z * l.len * t;
      if (cy > 3.5) continue;
      const rAt = lerp(l.r, l.r * 0.55, t);
      const capH = clamp(rAt * 1.1, 0.035, 0.1);
      const geo = new THREE.IcosahedronGeometry(1, 0);
      // a pillow narrower than the limb itself: from below it hides behind
      // the branch, from the side it reads as a snow line along the top
      geo.scale(Math.min(l.len * 0.38, rAt * 10, 0.9) * rng.float(0.75, 1.1), capH, rAt * 0.9);
      geo.rotateY(Math.atan2(-l.dir.z, l.dir.x) + rng.float(-0.15, 0.15));
      geo.translate(cx, cy + rAt * 0.55 + capH * 0.3, cz);
      parts.push(geo);
    }
  }
  return parts.length ? mergeGeometries(parts, false) : null;
}

/** Builds the seeded geometry variants of every species, once per load. */
function buildVariants() {
  const variants = {};
  for (const [key, spec] of Object.entries(SPECIES)) {
    variants[key] = [];
    for (let v = 0; v < spec.variants; v++) {
      const rng = new Rng(spec.seed + v * 101);
      const tree = growTree(rng, spec);
      variants[key].push({
        wood: tree.wood,
        foliage: bakeFoliage(rng, spec, tree.anchors),
        dead: spec.marcescent ? bakeMarcescence(rng, spec, tree.anchors) : null,
        snow: bakeSnow(rng, spec, tree),
      });
    }
  }
  return variants;
}

/* ------------------------------------------------------------------ spruces */

function spruceGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.2, 0.3, 2.0, 8);
  trunk.translate(0, 1, 0);
  parts.push(trunk);
  let y = 1.0;
  for (let i = 0; i < 6; i++) {
    const r = 2.6 - i * 0.36;
    const cone = new THREE.ConeGeometry(r, 2.1, 10);
    cone.translate(0, y + 1.0, 0);
    parts.push(cone);
    y += 1.2;
  }
  return mergeGeometries(parts, false);
}

function spruceSnowGeometry() {
  const parts = [];
  let y = 1.1;
  for (let i = 0; i < 6; i++) {
    const r = 2.5 - i * 0.36;
    const cone = new THREE.ConeGeometry(r, 1.0, 10);
    cone.translate(0, y + 1.3, 0);
    parts.push(cone);
    y += 1.2;
  }
  return mergeGeometries(parts, false);
}

function bushGeometry(detail = 2) {
  const parts = [];
  const rng = new Rng(99);
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.IcosahedronGeometry(rng.float(0.45, 0.85), detail);
    geo.scale(1, 0.7, 1);
    geo.translate(rng.float(-0.5, 0.5), rng.float(0.25, 0.6), rng.float(-0.5, 0.5));
    parts.push(geo);
  }
  return mergeGeometries(parts, false);
}

function makeCrowMesh() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.5, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat);
  body.scale.set(1, 0.85, 1.9);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
  head.position.set(0, 0.12, 0.32);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), mat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.1, 0.48);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.42), mat);
  tail.position.set(0, 0.02, -0.42);
  tail.rotation.x = -0.15;
  g.add(tail);
  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.22), mat);
    wing.position.x = side * 0.3;
    pivot.add(wing);
    pivot.position.set(side * 0.1, 0.08, 0.02);
    g.add(pivot);
    wings.push({ pivot, side });
  }
  return { group: g, wings };
}

/* ------------------------------------------------------------- wind sway */

const SWAY_GLSL = /* glsl */ `
  {
    float treeW = smoothstep(2.0, 8.0, transformed.y);
    if (treeW > 0.0) {
      float treePh = transformed.x * 0.29 + transformed.z * 0.23;
      float treeS = sin(uTreeTime * 1.2 + treePh) * 0.65 + sin(uTreeTime * 2.4 + treePh * 1.8) * 0.35;
      transformed.xz += uTreeDir * (treeS * treeW * uTreeAmp);
    }
  }
`;

function patchSway(mat, uniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTreeTime = uniforms.uTime;
    shader.uniforms.uTreeAmp = uniforms.uAmp;
    shader.uniforms.uTreeDir = uniforms.uDir;
    shader.vertexShader =
      'uniform float uTreeTime;\nuniform float uTreeAmp;\nuniform vec2 uTreeDir;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + SWAY_GLSL);
  };
  return mat;
}

/* ------------------------------------------------------------------ build */

export function buildVegetation(ctx) {
  const { world, materials: M, rng } = ctx;
  const group = world.group;
  const dummy = new THREE.Object3D();

  /* ------------------------------------------- positions (exact, seeded) */
  // The scatter sequence below reproduces the historic layout tree for tree:
  // trunk colliders and pedestrian routes depend on it — do not reorder.
  const west = [];
  const east = [];
  const farNorth = [];
  const central = [];
  const roadside = [];
  const belt = [];
  const spruces = [];
  const pond = world.pond;
  const okPlace = (x, z, r = 1.4) => {
    if (world.collides(x, z, r)) return false;
    if (world.heightAt(x, z) > 0.05) return false;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 2.6) return false;
    return true;
  };
  // relocation candidates for the historic clusters must see the world they
  // were seeded into (bounds and colliders before the northern expansion),
  // otherwise a handful of edge trees drift and every cluster after them
  // shifts with the stream
  const okPlaceHistoric = (x, z, r = 1.4) => {
    if (world.collidesHistoric(x, z, r)) return false;
    if (world.heightAtHistoric(x, z) > 0.05) return false;
    if (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r + 2.6) return false;
    return true;
  };
  const scatter = (list, count, x0, x1, z0, z1, radius = 1.4) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = rng.float(x0, x1);
      const z = rng.float(z0, z1);
      if (!okPlace(x, z, radius)) continue;
      list.push({ x, z });
      placed++;
    }
  };

  scatter(west, 26, -60, -14, -44, -3);
  scatter(east, 20, 14, 58, -22, 54);
  scatter(west, 7, -46, -8, -72, -60);
  scatter(farNorth, 8, -64, -26, 66, 82);
  scatter(central, 6, -26, -12, -10, 14, 1.8);
  scatter(roadside, 10, 12, 40, -30, -22);
  scatter(spruces, 5, 12, 30, -20, -16, 2.0);
  scatter(spruces, 8, -100, -84, -80, 60, 2.2);
  scatter(spruces, 8, 84, 100, -60, 80, 2.2);
  scatter(spruces, 6, -60, 60, 88, 100, 2.2);
  scatter(spruces, 6, -60, 60, -100, -88, 2.2);
  // woodland belt beyond the district
  for (let i = 0; i < 130; i++) {
    const a = rng.float(0, TAU);
    const r = rng.float(112, 165);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 17 || Math.abs(z) < 17) continue;
    (rng.chance(0.6) ? belt : spruces).push({ x, z });
  }

  /* ---------------- northern cluster scatter (dedicated seed) ------------
   * Everything below feeds rngNorth only: the historic scatter above — and
   * the spruces, bushes and crows drawn from the shared stream after it —
   * stays bit-identical. */
  const rngNorth = new Rng(606606);
  const north = [];
  const northEast = [];
  const roadsideNorth = [];
  const scatterN = (list, count, x0, x1, z0, z1, radius = 1.4) => {
    let tries = 0;
    let placed = 0;
    while (placed < count && tries < count * 30) {
      tries++;
      const x = rngNorth.float(x0, x1);
      const z = rngNorth.float(z0, z1);
      if (!okPlace(x, z, radius)) continue;
      list.push({ x, z });
      placed++;
    }
  };
  scatterN(north, 16, -60, -13, 106, 146);
  scatterN(northEast, 14, 13, 92, 105, 162);
  scatterN(roadsideNorth, 7, 10.6, 13.6, 108, 170);
  scatterN(roadsideNorth, 7, -13.6, -10.6, 108, 174);
  // the woodland belt thins where the district grew north: these trees are
  // felled, but they stay in their lists as zero-scale stumps so every RNG
  // draw after them — and therefore every surviving tree's transform and
  // every historic relocation — holds bit-identical
  for (const b of belt) {
    if (Math.abs(b.x) < 100 && b.z > 100) b.dead = true;
  }
  for (const s of spruces) {
    if (Math.abs(s.x) < 100 && s.z > 100) s.dead = true;
  }
  // a fresh arc thickens the treeline again beyond the new fence line
  for (let i = 0; i < 40; i++) {
    const a = rngNorth.float(0.3, Math.PI - 0.3);
    const r = rngNorth.float(186, 238);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 24) continue;
    belt.push({ x, z });
  }

  /* ---------------- western cluster (dedicated seed) --------------------
   * Same deal as the north: felled belt trees and spruces where the new
   * blocks stand (kept as zero-scale stumps), fresh clusters from west.js */
  for (const b of belt) {
    if (b.x < -100 && b.z > -112 && b.z < 184) b.dead = true;
  }
  for (const s of spruces) {
    if (s.x < -104 && s.z > -112 && s.z < 184) s.dead = true;
  }
  // trunks keep a step away from asphalt and paving, not just off it
  const soft = (x, z) => {
    const surface = world.surfaceAt(x, z);
    return surface !== 'asphalt' && surface !== 'stone';
  };
  const westLists = scatterWestTrees((x, z, r) => soft(x, z) && soft(x + 0.7, z) && soft(x - 0.7, z) && soft(x, z + 0.7) && soft(x, z - 0.7) && okPlace(x, z, r));
  const westBirch = westLists.birch;
  const westPoplar = westLists.poplar;
  const westSpruce = westLists.spruce;

  /* ---------------- southern quarter (dedicated seed) -------------------
   * The belt and the spruces give way where ул. Школьная now runs; the
   * quarter's own trees come from south.js */
  for (const b of belt) {
    if (b.x > -240 && b.x < 112 && b.z < -100) b.dead = true;
  }
  for (const s of spruces) {
    if (s.x > -240 && s.x < 112 && s.z < -100) s.dead = true;
  }
  const southLists = scatterSouthTrees((x, z, r) => soft(x, z) && soft(x + 0.7, z) && soft(x - 0.7, z) && soft(x, z + 0.7) && soft(x, z - 0.7) && okPlace(x, z, r));
  const southBirch = southLists.birch;
  const southPoplar = southLists.poplar;
  const southSpruce = southLists.spruce;
  const southOuter = southLists.outer;

  /* ---------------- relocation: trunks never stand on hard surfaces,
   * inside another tree or inside a prop collider
   * The historic scatter only avoided the colliders that existed at that
   * moment (buildings and props — never other trees), so a few trees ended
   * up on asphalt, on the trampled walkways, in the boundary fences or
   * inside a neighbour. Every offender is moved to the nearest spot that is
   * free, on soil and clear, inside its own cluster; the search is a fixed
   * golden-angle spiral, fully deterministic. Road/sidewalk rects derive
   * from the same constants terrain.js uses. */
  {
    const R = WORLD.roadHalfWidth;
    const CROSS = WORLD.crossroadZ;
    const CROSS2 = WORLD.crossroad2Z;
    const SW = WORLD.sidewalkWidth;
    const hardRects = [
      [-R, R, -116, 184], // main road
      [-116, 116, CROSS - 6, CROSS + 6], // crossroad
      [R, 100, CROSS2 - 6, CROSS2 + 6], // Zavodskaya street
      [PARKING_LOT.x0, PARKING_LOT.x1, PARKING_LOT.z0, PARKING_LOT.z1],
      [PARKING_NORTH.x0, PARKING_NORTH.x1, PARKING_NORTH.z0, PARKING_NORTH.z1],
      [R, R + SW, -116, 184], // sidewalks
      [-R - SW, -R, -116, 184],
      [-116, 116, CROSS + 6, CROSS + 6 + SW],
      [-116, 116, CROSS - 6 - SW, CROSS - 6],
      [R + SW, 100, CROSS2 - 6 - SW, CROSS2 - 6],
      [R + SW, 100, CROSS2 + 6, CROSS2 + 6 + SW],
    ];
    const inRect = (x, z, r, pad) => x >= r[0] - pad && x <= r[1] + pad && z >= r[2] - pad && z <= r[3] + pad;
    const offending = (x, z) => {
      const s = world.surfaceAt(x, z);
      if (s === 'asphalt' || s === 'stone') return true;
      if (hardRects.some((r) => inRect(x, z, r, 0.6))) return true;
      if (WALK_PATHS.some((p) => inRect(x, z, [p.x0, p.x1, p.z0, p.z1], 0.6))) return true;
      if (NEW_WALK_PATHS.some((p) => inRect(x, z, [p.x0, p.x1, p.z0, p.z1], 0.6))) return true;
      return false;
    };
    for (const b of [...west, ...east, ...farNorth, ...belt]) b.species = 'birch';
    for (const b of [...north, ...northEast]) b.species = 'birch';
    for (const b of central) b.species = 'yard';
    for (const b of roadside) b.species = 'poplar';
    for (const b of roadsideNorth) b.species = 'poplar';
    for (const b of westBirch) b.species = 'birch';
    for (const b of westPoplar) b.species = 'poplar';
    for (const b of westSpruce) b.species = 'spruce';
    for (const b of southBirch) b.species = 'birch';
    for (const b of southPoplar) b.species = 'poplar';
    for (const b of southSpruce) b.species = 'spruce';
    for (const s of spruces) s.species = 'spruce';
    // the historic pool is exactly the tree set the relocations were tuned
    // against (felled belt trees included); the new clusters relocate
    // against the living trees only
    const allTreesHistoric = [...west, ...east, ...farNorth, ...central, ...roadside, ...belt, ...spruces];
    const allTrees = [...allTreesHistoric, ...north, ...northEast, ...roadsideNorth, ...westBirch, ...westPoplar, ...westSpruce, ...southBirch, ...southPoplar, ...southSpruce].filter((t) => !t.dead);
    const gap = (a, b) => (a.species === 'spruce' || b.species === 'spruce' ? 2.2 : 1.2);
    // trunk point inside a collider that is not its own trunk box
    const foreignHit = (item, ownW) =>
      world.colliders.some((c) => {
        const w = c.maxX - c.minX;
        const ccx = (c.minX + c.maxX) / 2;
        const ccz = (c.minZ + c.maxZ) / 2;
        if (Math.abs(ccx - item.x) < 0.05 && Math.abs(ccz - item.z) < 0.05 && Math.abs(w - ownW) < 0.1) return false;
        const cx = Math.max(c.minX, Math.min(item.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(item.z, c.maxZ));
        return Math.hypot(item.x - cx, item.z - cz) < 0.25;
      });
    const relocate = (list, radius, ownW, nearDistrict = true, historic = false) => {
      const ok = historic ? okPlaceHistoric : okPlace;
      const pool = historic ? allTreesHistoric : allTrees;
      // new clusters also keep their trunks a step back from hard edges
      const bad = historic ? offending : (x, z) => offending(x, z) || !(soft(x + 0.7, z) && soft(x - 0.7, z) && soft(x, z + 0.7) && soft(x, z - 0.7));
      const cramped = (item) => pool.some((o) => o !== item && Math.hypot(o.x - item.x, o.z - item.z) < gap(item, o));
      const clearOfTrees = (x, z, self) => pool.every((o) => o === self || Math.hypot(o.x - x, o.z - z) >= (o.species === 'spruce' ? 2.2 : 1.6));
      for (const item of list) {
        if (item.dead) continue;
        if (!bad(item.x, item.z) && !cramped(item) && !foreignHit(item, ownW)) continue;
        let placed = null;
        for (let ring = 1; ring <= 26 && !placed; ring++) {
          const rr = ring * 0.7;
          const steps = Math.max(8, Math.round((rr * TAU) / 0.7));
          for (let i = 0; i < steps; i++) {
            const a = i * 2.39996 + ring * 0.61;
            const x = item.x + Math.cos(a) * rr;
            const z = item.z + Math.sin(a) * rr;
            if (bad(x, z)) continue;
            // the belt sits mostly outside the playable bounds, where
            // okPlace always fails; fences still reach it near the edge
            if (nearDistrict || (Math.abs(x) < 107 && Math.abs(z) < 107)) {
              if (!ok(x, z, radius)) continue;
            }
            if (!clearOfTrees(x, z, item)) continue;
            placed = [x, z];
            break;
          }
        }
        if (placed) {
          item.x = placed[0];
          item.z = placed[1];
        } else {
          console.warn(`[trees] no valid spot near (${item.x.toFixed(1)}, ${item.z.toFixed(1)}), keeping it`);
        }
      }
    };
    relocate(west, 1.4, 0.6, true, true);
    relocate(east, 1.4, 0.6, true, true);
    relocate(farNorth, 1.4, 0.6, true, true);
    relocate(central, 1.8, 0.6, true, true);
    relocate(roadside, 1.4, 0.6, true, true);
    relocate(belt, 1.4, 0.6, false, true);
    relocate(spruces, 2.2, 1.4, true, true);
    relocate(north, 1.4, 0.6);
    relocate(northEast, 1.4, 0.6);
    relocate(roadsideNorth, 1.4, 0.6);
    relocate(westBirch, 1.4, 0.6);
    relocate(westPoplar, 1.4, 0.6);
    relocate(southBirch, 1.4, 0.6);
    relocate(southPoplar, 1.4, 0.6);
  }

  // trunk colliders follow the final (possibly relocated) positions
  for (const b of [...west, ...east, ...farNorth, ...central, ...roadside, ...belt]) {
    if (b.dead) continue;
    ctx.addBoxCollider(b.x, b.z, 0.5, 0.5, 0.05);
  }
  for (const b of [...north, ...northEast, ...roadsideNorth, ...westBirch, ...westPoplar]) {
    ctx.addBoxCollider(b.x, b.z, 0.5, 0.5, 0.05, true);
  }
  for (const b of [...southBirch, ...southPoplar]) ctx.addBoxCollider(b.x, b.z, 0.5, 0.5, 0.05, true);
  for (const s of [...westSpruce, ...southSpruce]) ctx.addBoxCollider(s.x, s.z, 1.2, 1.2, 0.1, true);

  /* ------------------------------------------- materials (with wind sway) */
  const sway = {
    uTime: { value: 0 },
    uAmp: { value: 0.035 },
    uDir: { value: new THREE.Vector2(0.85, 0.53).normalize() },
  };
  const birchMat = patchSway(M.birch.clone(), sway);
  birchMat.vertexColors = true;
  const barkMat = patchSway(M.bark.clone(), sway);
  barkMat.vertexColors = true;
  const treeSnowMat = patchSway(M.snow.clone(), sway);
  const crownMat = patchSway(new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, vertexColors: true }), sway);
  world.updaters.push((dt, t) => {
    sway.uTime.value = t;
    const gust = 0.55 + 0.45 * Math.sin(t * 0.13) * Math.sin(t * 0.049 + 1.2) + 0.2 * Math.sin(t * 0.31 + 0.5);
    sway.uAmp.value = 0.02 + Math.max(0, gust) * 0.035;
  });

  /* ------------------------------------------- regions merged from variants
   * Each cluster becomes one static mesh per material: variants keep the
   * forest organic, merging keeps the draw calls low and the bounding boxes
   * tight enough for the frustum to drop the clusters behind the camera. */
  const variants = buildVariants();
  const regions = [
    { key: 'west', species: 'birch', list: west, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'east', species: 'birch', list: east, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'far-north', species: 'birch', list: farNorth, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'central', species: 'yard', list: central, scale: [0.9, 1.3], tilt: 0.06 },
    { key: 'roadside', species: 'poplar', list: roadside, scale: [0.85, 1.2], tilt: 0.03 },
    { key: 'belt-south', species: 'birch', list: belt.filter((b) => b.z < 0), scale: [0.9, 1.35], tilt: 0.05 },
    { key: 'belt-north', species: 'birch', list: belt.filter((b) => b.z >= 0), scale: [0.9, 1.35], tilt: 0.05 },
    { key: 'north', species: 'birch', list: north, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'north-east', species: 'birch', list: northEast, scale: [0.8, 1.25], tilt: 0.05 },
    // labelled apart so the historic poplar mean (smoke framing) stays put
    { key: 'roadside-north', species: 'poplar', alias: 'poplar-north', list: roadsideNorth, scale: [0.85, 1.2], tilt: 0.03 },
    // the western cluster comes last: the region RNG draws for every
    // region above stay exactly as they were
    { key: 'west-yards', species: 'birch', alias: 'birch-west', list: westBirch, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'west-verges', species: 'poplar', alias: 'poplar-west', list: westPoplar, scale: [0.85, 1.2], tilt: 0.03 },
    { key: 'south-yards', species: 'birch', alias: 'birch-south', list: southBirch, scale: [0.8, 1.25], tilt: 0.05 },
    { key: 'south-verges', species: 'poplar', alias: 'poplar-south', list: southPoplar, scale: [0.85, 1.2], tilt: 0.03 },
    { key: 'south-treeline', species: 'birch', alias: 'birch-south', list: southOuter, scale: [0.9, 1.35], tilt: 0.05 },
  ];

  const treeSpots = [];
  const foliageParts = [];
  const deadParts = [];
  const snowParts = [];
  const regionRng = new Rng(5050);
  for (const region of regions) {
    const spec = SPECIES[region.species];
    const pool = variants[region.species];
    const woodParts = [];
    for (const item of region.list) {
      const variant = pool[regionRng.int(0, pool.length - 1)];
      dummy.position.set(item.x, 0, item.z);
      const tiltX = regionRng.float(-region.tilt, region.tilt);
      const yaw = regionRng.float(0, TAU);
      const tiltZ = regionRng.float(-region.tilt, region.tilt);
      dummy.rotation.set(tiltX, yaw, tiltZ);
      const s = regionRng.float(region.scale[0], region.scale[1]);
      dummy.scale.set(s, s * regionRng.float(0.92, 1.12), s);
      dummy.updateMatrix();
      // felled belt trees consume their draws but leave no geometry behind,
      // so every surviving tree keeps its seeded variant and transform
      if (item.dead) {
        if (variant.snow) regionRng.float(-0.35, 0.35);
        continue;
      }
      woodParts.push(variant.wood.clone().applyMatrix4(dummy.matrix));
      if (variant.foliage) foliageParts.push(variant.foliage.clone().applyMatrix4(dummy.matrix));
      if (variant.dead) deadParts.push(variant.dead.clone().applyMatrix4(dummy.matrix));
      if (variant.snow) {
        // trunk crusts face the same storm side on every tree of the district
        const storm = 2.6 + regionRng.float(-0.35, 0.35) - yaw;
        snowParts.push(variant.snow.clone().rotateY(storm).applyMatrix4(dummy.matrix));
      }
      treeSpots.push({ x: item.x, z: item.z, species: region.alias ?? region.species });
    }
    if (!woodParts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(woodParts, false), spec.wood === 'birch' ? birchMat : barkMat);
    mesh.name = `trees:${region.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const s of spruces) if (!s.dead) treeSpots.push({ x: s.x, z: s.z, species: 'spruce' });
  world.treeSpots = treeSpots;
  world.treeSway = sway;

  // one global mesh per seasonal layer: cheap, and the crowns of every tree
  // move with the same vertex-shader wind as the wood they hang on
  if (foliageParts.length) {
    const foliage = new THREE.Mesh(mergeGeometries(foliageParts, false), crownMat);
    foliage.name = 'trees:foliage';
    foliage.castShadow = true;
    group.add(ctx.seasonable('autumn', foliage));
  }
  if (deadParts.length) {
    const dead = new THREE.Mesh(mergeGeometries(deadParts, false), crownMat);
    dead.name = 'trees:marcescence';
    group.add(ctx.seasonable('winter', dead));
  }
  if (snowParts.length) {
    const snow = new THREE.Mesh(mergeGeometries(snowParts, false), treeSnowMat);
    snow.name = 'trees:snow-caps';
    snow.castShadow = true;
    snow.receiveShadow = true;
    group.add(ctx.seasonable('winter', snow));
  }

  /* ---------------------------------------------- spruces */
  const makeInstanced = (geo, mat, list, scaleRange, tiltRange, yOffset = 0) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    list.forEach((item, i) => {
      dummy.position.set(item.x, yOffset, item.z);
      dummy.rotation.set(rng.float(-tiltRange, tiltRange), rng.float(0, TAU), rng.float(-tiltRange, tiltRange));
      const s = rng.float(scaleRange[0], scaleRange[1]);
      dummy.scale.set(s, s * rng.float(0.9, 1.15), s);
      // felled spruces keep their draws but collapse to nothing (see belt)
      if (item.dead) dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };

  const spruceMesh = makeInstanced(spruceGeometry(), new THREE.MeshStandardMaterial({ color: 0x22452f, roughness: 0.92 }), spruces, [0.75, 1.15], 0.03);
  for (const s of spruces) {
    if (s.dead) continue;
    ctx.addBoxCollider(s.x, s.z, 1.2, 1.2, 0.1);
  }
  const snowMesh = new THREE.InstancedMesh(spruceSnowGeometry(), M.snow, spruces.length);
  snowMesh.castShadow = true;
  snowMesh.receiveShadow = true;
  snowMesh.instanceMatrix = spruceMesh.instanceMatrix;
  group.add(ctx.seasonable('winter', snowMesh));
  // western spruce line: own instanced pair, own seed (the shared stream
  // above feeds the bushes and crows next)
  if (westSpruce.length) {
    const rngW = new Rng(818181);
    const mesh = new THREE.InstancedMesh(spruceMesh.geometry, spruceMesh.material, westSpruce.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    westSpruce.forEach((item, i) => {
      dummy.position.set(item.x, 0, item.z);
      dummy.rotation.set(rngW.float(-0.03, 0.03), rngW.float(0, TAU), rngW.float(-0.03, 0.03));
      const sc = rngW.float(0.75, 1.15);
      dummy.scale.set(sc, sc * rngW.float(0.9, 1.15), sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      treeSpots.push({ x: item.x, z: item.z, species: 'spruce-west' });
    });
    mesh.instanceMatrix.needsUpdate = true;
    world.westDetails.add(mesh);
    const snowW = new THREE.InstancedMesh(snowMesh.geometry, M.snow, westSpruce.length);
    snowW.instanceMatrix = mesh.instanceMatrix;
    world.westDetails.add(ctx.seasonable('winter', snowW));
  }
  // blue spruces behind the Victory obelisk
  if (southSpruce.length) {
    const rngS = new Rng(929292);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c5c58, roughness: 0.9 });
    const mesh = new THREE.InstancedMesh(spruceMesh.geometry, mat, southSpruce.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    southSpruce.forEach((item, i) => {
      dummy.position.set(item.x, 0, item.z);
      dummy.rotation.set(0, rngS.float(0, TAU), 0);
      const sc = rngS.float(0.85, 1.0);
      dummy.scale.set(sc, sc * rngS.float(1.0, 1.12), sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      treeSpots.push({ x: item.x, z: item.z, species: 'spruce-south' });
    });
    mesh.instanceMatrix.needsUpdate = true;
    world.southDetails.add(mesh);
    const snowS = new THREE.InstancedMesh(snowMesh.geometry, M.snow, southSpruce.length);
    snowS.instanceMatrix = mesh.instanceMatrix;
    world.southDetails.add(ctx.seasonable('winter', snowS));
  }

  /* ---------------------------------------------- bushes */
  const bushes = [];
  scatter(bushes, 30, -62, -12, -46, 0, 1.0);
  scatter(bushes, 22, 12, 60, -24, 56, 1.0);
  scatter(bushes, 14, -80, 80, -100, -60, 1.0);
  scatter(bushes, 10, -70, 70, 60, 100, 1.0);
  // at the foot of garages and fences
  for (const [bx, bz] of [[-64.6, -30], [-64.6, -8], [-64.6, 12], [12.4, -16], [30.6, -14], [-59, -47], [-59, -49.5]]) {
    bushes.push({ x: bx + rng.float(-0.5, 0.5), z: bz + rng.float(-0.5, 0.5) });
  }
  // the historic scatter only dodged colliders, so a handful of bushes grew
  // out of the asphalt of the cross street and the avenue: they keep their
  // RNG draws (stream intact) but collapse to nothing, like felled trees
  const hard = (x, z) => {
    const surface = world.surfaceAt(x, z);
    return surface === 'asphalt' || surface === 'stone';
  };
  for (const b of bushes) {
    if (hard(b.x, b.z) || hard(b.x + 0.6, b.z) || hard(b.x - 0.6, b.z) || hard(b.x, b.z + 0.6) || hard(b.x, b.z - 0.6)) b.dead = true;
  }
  const bushGeo = bushGeometry(1);
  const bushAutumn = makeInstanced(bushGeo, new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 1, flatShading: true }), bushes.map((b) => ({ ...b })), [0.8, 1.4], 0.1);
  group.add(ctx.seasonable('autumn', bushAutumn));
  // snow-laden shrubs are rounded: smooth shading and a finer mesh
  const bushSnowGeo = bushGeometry(2);
  const bushWinter = makeInstanced(bushSnowGeo, new THREE.MeshStandardMaterial({ color: 0xdfe7f0, roughness: 0.9 }), bushes.map((b) => ({ ...b })), [0.75, 1.25], 0.1);
  group.add(ctx.seasonable('winter', bushWinter));

  /* ---------------------------------------------- crows */
  const crows = [];
  for (let i = 0; i < 6; i++) {
    const { group: crow, wings } = makeCrowMesh();
    const radius = rng.float(22, 46);
    const cx = rng.float(-30, 30);
    const cz = rng.float(-30, 30);
    const height = rng.float(17, 30);
    const speed = rng.float(0.05, 0.11) * rng.sign();
    const phase = rng.float(0, TAU);
    crow.position.set(cx + radius, height, cz);
    crow.scale.setScalar(rng.float(0.85, 1.2));
    group.add(crow);
    crows.push({ crow, wings, cx, cz, radius, height, speed, phase, flap: rng.float(5.5, 8.5) });
  }
  // crows perched on the wires
  const perched = [
    [-12.6, 7.9, -24],
    [-12.6, 7.9, 0],
    [-12.6, 7.9, 48],
    [-18.5, 8.9, 2],
  ];
  for (const [px, py, pz] of perched) {
    const { group: crow } = makeCrowMesh();
    crow.position.set(px, py, pz);
    crow.rotation.y = rng.float(0, TAU);
    crow.scale.setScalar(0.9);
    group.add(crow);
  }
  world.updaters.push((dt, t) => {
    for (const c of crows) {
      const a = c.phase + t * c.speed;
      c.crow.position.set(c.cx + Math.cos(a) * c.radius, c.height + Math.sin(t * 0.7 + c.phase) * 1.4, c.cz + Math.sin(a) * c.radius);
      c.crow.rotation.y = -a + (c.speed > 0 ? 0 : Math.PI);
      c.crow.rotation.z = Math.sin(t * 0.5 + c.phase) * 0.12;
      for (const w of c.wings) {
        w.pivot.rotation.z = w.side * (0.35 - Math.abs(Math.sin(t * c.flap + c.phase)) * 0.85);
      }
    }
  });

  /* ---------------------------------------------- northern cluster extras */
  // two more crows ride the wind over the new courtyards (far-detail group:
  // they join the same updater and appear once the player walks north)
  for (const [cx, cz] of [
    [-24, 134],
    [38, 142],
  ]) {
    const { group: crow, wings } = makeCrowMesh();
    const radius = rngNorth.float(20, 34);
    const height = rngNorth.float(18, 28);
    const speed = rngNorth.float(0.05, 0.1) * rngNorth.sign();
    const phase = rngNorth.float(0, TAU);
    crow.position.set(cx + radius, height, cz);
    crow.scale.setScalar(rngNorth.float(0.85, 1.15));
    world.farDetails.add(crow);
    crows.push({ crow, wings, cx, cz, radius, height, speed, phase, flap: rngNorth.float(5.5, 8.5) });
  }

  // bushes in the new courtyards, clear of the trampled paths
  {
    const northBushes = [];
    const onPath = (x, z) => NEW_WALK_PATHS.some((p) => x >= p.x0 - 0.8 && x <= p.x1 + 0.8 && z >= p.z0 - 0.8 && z <= p.z1 + 0.8);
    const scatterB = (count, x0, x1, z0, z1) => {
      let tries = 0;
      let placed = 0;
      while (placed < count && tries < count * 30) {
        tries++;
        const x = rngNorth.float(x0, x1);
        const z = rngNorth.float(z0, z1);
        if (onPath(x, z)) continue;
        if (!okPlace(x, z, 1.0)) continue;
        northBushes.push({ x, z });
        placed++;
      }
    };
    scatterB(10, -58, -14, 108, 144);
    scatterB(8, 14, 90, 106, 160);
    const bushGeo = bushGeometry(1);
    const mkBush = (mat, scaleRange, geo = bushGeo) => {
      const mesh = new THREE.InstancedMesh(geo, mat, northBushes.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      northBushes.forEach((b, i) => {
        dummy.position.set(b.x, 0, b.z);
        dummy.rotation.set(rngNorth.float(-0.1, 0.1), rngNorth.float(0, TAU), rngNorth.float(-0.1, 0.1));
        const s = rngNorth.float(scaleRange[0], scaleRange[1]);
        dummy.scale.set(s, s * rngNorth.float(0.9, 1.15), s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      return mesh;
    };
    group.add(ctx.seasonable('autumn', mkBush(new THREE.MeshStandardMaterial({ color: 0x6a5a34, roughness: 1, flatShading: true }), [0.8, 1.4])));
    group.add(ctx.seasonable('winter', mkBush(new THREE.MeshStandardMaterial({ color: 0xdfe7f0, roughness: 0.9 }), [0.75, 1.25], bushSnowGeo)));
  }
}
