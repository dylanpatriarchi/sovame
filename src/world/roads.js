// The roads out of town (routes.js): a packed-snow ribbon on the levelled
// ground, striped marker posts to find it by in a blizzard, and a leaning
// line of wooden poles along the coast.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROUTES } from './routes.js';
import { hash2 } from './noise.js';
import { landHeight, padDistance } from './land.js';

function makeTrackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#c9ced4';
  c.fillRect(0, 0, 256, 256);
  let s = 4242;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  // wheel ruts worn down to gravel and ice
  for (const u of [0.3, 0.7]) {
    const g = c.createLinearGradient((u - 0.13) * 256, 0, (u + 0.13) * 256, 0);
    g.addColorStop(0, 'rgba(120,116,110,0)');
    g.addColorStop(0.5, 'rgba(104,100,96,0.78)');
    g.addColorStop(1, 'rgba(120,116,110,0)');
    c.fillStyle = g;
    c.fillRect((u - 0.13) * 256, 0, 0.26 * 256, 256);
  }
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 256;
    const inRut = Math.abs(x / 256 - 0.3) < 0.11 || Math.abs(x / 256 - 0.7) < 0.11;
    const v = inRut ? 60 + rnd() * 70 : 170 + rnd() * 80;
    c.fillStyle = `rgba(${v},${v},${v + 6},${inRut ? 0.5 : 0.35})`;
    c.fillRect(x, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  // ploughed snow thrown to the verges
  for (const [x0, x1] of [
    [0, 30],
    [226, 256],
  ]) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(x0 === 0 ? 0 : 1, 'rgba(236,241,247,1)');
    g.addColorStop(x0 === 0 ? 1 : 0, 'rgba(236,241,247,0)');
    c.fillStyle = g;
    c.fillRect(x0, 0, 30, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function colored(geo, hex) {
  const color = new THREE.Color(hex).convertSRGBToLinear();
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function tangentAt(pts, i) {
  const a = pts[Math.max(i - 1, 0)];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
}

const LIFT = 0.09;

function ribbon(route) {
  const { pts, h, half } = route;
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [tx, tz] = tangentAt(pts, i);
    const nx = -tz;
    const nz = tx;
    const y = h[i] + LIFT;
    // verge, carriageway edge, edge, verge
    for (const [o, u, dy] of [
      [-half - 1.5, 0, -0.34],
      [-half, 0.11, 0],
      [half, 0.89, 0],
      [half + 1.5, 1, -0.34],
    ]) {
      pos.push(pts[i][0] + nx * o, y + dy, pts[i][1] + nz * o);
      uv.push(u, dist / 9);
    }
    if (i) {
      const b = (i - 1) * 4;
      for (let k = 0; k < 3; k++) idx.push(b + k, b + k + 1, b + k + 4, b + k + 1, b + k + 5, b + k + 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function plazaDisc(route) {
  const geo = new THREE.CircleGeometry(route.plaza, 40);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 420, p.getZ(i) / 9);
  geo.translate(route.end[0], route.endH + LIFT - 0.02, route.end[1]);
  return geo;
}

export function buildRoads(ctx) {
  const { world } = ctx;
  const trackMat = new THREE.MeshStandardMaterial({
    map: makeTrackTexture(),
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const parts = [];
  for (const route of ROUTES) {
    parts.push(ribbon(route));
    if (route.plaza) parts.push(plazaDisc(route));
  }
  const roads = new THREE.Mesh(mergeGeometries(parts, false), trackMat);
  roads.name = 'out-of-town-roads';
  roads.receiveShadow = true;
  roads.frustumCulled = false;
  world.group.add(roads);

  /* ---------------------------------------------- marker posts */
  // black-and-white striped posts either side, every 25 m
  const postGeo = mergeGeometries(
    [0, 1, 2, 3, 4].map((k) => {
      const g = new THREE.BoxGeometry(0.11, 0.26, 0.11);
      g.translate(0, 0.13 + k * 0.26, 0);
      return colored(g, k % 2 ? 0x16181a : 0xe8ebee);
    }),
    false,
  );
  const places = [];
  for (const route of ROUTES) {
    for (let i = 3; i < route.pts.length - 2; i += 5) {
      const [x, z] = route.pts[i];
      if (padDistance(x, z) <= 0) continue;
      const [tx, tz] = tangentAt(route.pts, i);
      for (const side of [-1, 1]) {
        const px = x - tz * side * (route.half + 0.9);
        const pz = z + tx * side * (route.half + 0.9);
        places.push([px, route.h[i], pz, hash2(i, side, 7)]);
      }
    }
  }
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), places.length);
  const d = new THREE.Object3D();
  places.forEach(([x, y, z, r], i) => {
    d.position.set(x, y - 0.05, z);
    // frost heave: none of them stands quite straight
    d.rotation.set((r - 0.5) * 0.22, r * 6, (hash2(i, 3, 9) - 0.5) * 0.22);
    d.updateMatrix();
    posts.setMatrixAt(i, d.matrix);
  });
  posts.name = 'marker-posts';
  posts.frustumCulled = false;
  posts.castShadow = true;
  world.group.add(posts);

  /* ---------------------------------------------- power line */
  const coast = ROUTES.find((r) => r.id === 'coast');
  const poleGeo = mergeGeometries(
    [
      (() => {
        const g = new THREE.CylinderGeometry(0.1, 0.15, 8.4, 7);
        g.translate(0, 4.2, 0);
        return colored(g, 0x4a3c2e);
      })(),
      (() => {
        const g = new THREE.BoxGeometry(2.2, 0.14, 0.14);
        g.translate(0, 7.7, 0);
        return colored(g, 0x40342a);
      })(),
      ...[-0.95, 0, 0.95].map((x) => {
        const g = new THREE.CylinderGeometry(0.05, 0.06, 0.2, 6);
        g.translate(x, 7.87, 0);
        return colored(g, 0xb9c2c4);
      }),
      // a concrete stub lashed to the foot, the way they are set in permafrost
      (() => {
        const g = new THREE.BoxGeometry(0.2, 2.2, 0.22);
        g.translate(0.2, 0.9, 0);
        return colored(g, 0x8f8d86);
      })(),
    ],
    false,
  );
  const poles = [];
  for (let i = 12; i < coast.pts.length - 6; i += 9) {
    const [x, z] = coast.pts[i];
    if (padDistance(x, z) <= 0) continue;
    const [tx, tz] = tangentAt(coast.pts, i);
    const px = x + tz * (coast.half + 7);
    const pz = z - tx * (coast.half + 7);
    poles.push({ x: px, y: landHeight(px, pz), z: pz, yaw: Math.atan2(tx, tz), lean: (hash2(i, 1, 13) - 0.5) * 0.16, lean2: (hash2(i, 2, 13) - 0.5) * 0.1 });
  }
  const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), poles.length);
  const tops = [];
  poles.forEach((p, i) => {
    d.position.set(p.x, p.y - 0.3, p.z);
    d.rotation.set(p.lean2, p.yaw, p.lean, 'YXZ');
    d.updateMatrix();
    poleMesh.setMatrixAt(i, d.matrix);
    tops.push([-0.95, 0, 0.95].map((ox) => new THREE.Vector3(ox, 7.97, 0).applyMatrix4(d.matrix)));
  });
  poleMesh.name = 'power-poles';
  poleMesh.frustumCulled = false;
  poleMesh.castShadow = true;
  world.group.add(poleMesh);
  const wire = [];
  for (let i = 1; i < tops.length; i++) {
    for (let k = 0; k < 3; k++) {
      const a = tops[i - 1][k];
      const b = tops[i][k];
      const SEG = 6;
      for (let s = 0; s < SEG; s++) {
        for (const t of [s / SEG, (s + 1) / SEG]) {
          wire.push(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.9, a.z + (b.z - a.z) * t);
        }
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.8 }));
  wires.frustumCulled = false;
  world.group.add(wires);
}
