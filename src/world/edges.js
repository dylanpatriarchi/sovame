// The district's edges: where a street reaches the boundary fence it no
// longer just stops. A steel gate with a red star closes it, a "no entry"
// sign hangs on its post, and the road carries on beyond, between its snow
// banks and a line of lamp posts, until the haze takes it. On Zavodskaya the
// fence is open instead: the street runs on into ул. Кедровая in the private
// sector (east.js).
//
// Only meshes here: the boundary itself keeps you in (index.js collides).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSignTexture } from '../textures.js';

const FAR = 340; // the roads run out to here (the ground plane ends at 350)

/**
 * Where streets meet the fence: the gate's centre, which way the fence runs
 * ('x' or 'z'), the road's half width, and which way the road goes on.
 */
export const EDGE_GATES = [
  // (`from`: where the street's own asphalt, overrunning the fence, ends)
  { name: 'avenue north', x: 0, z: 176, along: 'x', half: 6, dir: [0, 1], from: 184 },
  { name: 'Stroiteley north', x: -170, z: 176, along: 'x', half: 6, dir: [0, 1], from: 180 },
  { name: 'cross street west', x: -236, z: 44, along: 'z', half: 6, dir: [-1, 0], from: -240 },
  { name: 'Shkolnaya west', x: -236, z: -152, along: 'z', half: 6, dir: [-1, 0], from: -240 },
  { name: 'Shkolnaya east', x: 104, z: -152, along: 'z', half: 6, dir: [1, 0], from: 112 },
];

/** The road strips beyond the fence: [x0, x1, z0, z1]. */
export const EDGE_ROADS = EDGE_GATES.map((g) => {
  const [dx, dz] = g.dir;
  const x0 = dx > 0 ? (g.from ?? g.x + 0.4) : dx < 0 ? -FAR : g.x - g.half;
  const x1 = dx > 0 ? FAR : dx < 0 ? (g.from ?? g.x - 0.4) : g.x + g.half;
  const z0 = dz > 0 ? (g.from ?? g.z + 0.4) : dz < 0 ? -FAR : g.z - g.half;
  const z1 = dz > 0 ? FAR : dz < 0 ? g.z - 0.4 : g.z + g.half;
  return [x0, x1, z0, z1];
});

/** Whether (x, z) is on one of those roads or its banks (trees keep off, skyline boxes too). */
export function onEdgeRoad(x, z, margin = 4) {
  return EDGE_ROADS.some(([x0, x1, z0, z1]) => x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
}

export function buildEdges(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const winter = world.season === 'winter';
  const parts = new Map();
  const add = (mat, geo, season = null) => {
    const key = `${mat.uuid}:${season}`;
    if (!parts.has(key)) parts.set(key, { mat, season, list: [] });
    parts.get(key).list.push(geo.index ? geo.toNonIndexed() : geo);
  };

  const gateMat = new THREE.MeshStandardMaterial({ color: 0x3f5c48, roughness: 0.6, metalness: 0.35 });
  const starMat = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.5, metalness: 0.2 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6f7376, roughness: 0.8 });
  const bankMat = winter ? M.snow : new THREE.MeshStandardMaterial({ color: 0x7f7458, roughness: 1 });
  const signTex = makeSignTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#c4161c';
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f4f4f4';
    c.fillRect(W * 0.18, H * 0.42, W * 0.64, H * 0.16);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, transparent: true, alphaTest: 0.5 });

  // a five-pointed star as a flat slab (in the xy plane, 1 m across)
  const star = (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.2 : 0.5;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
    g.translate(0, 0, -0.03);
    g.deleteAttribute('uv');
    return g;
  })();

  for (const g of EDGE_GATES) {
    // gate-local frame: x along the fence, z across it (toward the road beyond)
    const m = new THREE.Matrix4().makeRotationY(g.along === 'x' ? 0 : Math.PI / 2).setPosition(g.x, 0, g.z);
    const put = (mat, geo, x, y, z, season) => add(mat, geo.translate(x, y, z).applyMatrix4(m), season);
    const w = g.half + 0.6;
    // concrete posts with caps
    for (const s of [-1, 1]) {
      put(M.concreteDark, new THREE.BoxGeometry(0.55, 3.1, 0.55), s * (w + 0.3), 1.55, 0);
      put(M.concrete, new THREE.BoxGeometry(0.7, 0.16, 0.7), s * (w + 0.3), 3.18, 0);
      put(M.snow, new THREE.BoxGeometry(0.62, 0.08, 0.62), s * (w + 0.3), 3.3, 0, 'winter');
    }
    // two leaves: a tube frame, bars, a star in a ring in the middle of each
    for (const s of [-1, 1]) {
      const cx = (s * w) / 2;
      const lw = w - 0.06;
      put(gateMat, new THREE.BoxGeometry(lw, 0.09, 0.09), cx, 0.2, 0);
      put(gateMat, new THREE.BoxGeometry(lw, 0.09, 0.09), cx, 2.4, 0);
      put(gateMat, new THREE.BoxGeometry(lw, 0.07, 0.07), cx, 1.3, 0);
      for (const e of [-1, 1]) put(gateMat, new THREE.BoxGeometry(0.09, 2.3, 0.09), cx + (e * lw) / 2, 1.3, 0);
      for (let k = -lw / 2 + 0.2; k < lw / 2 - 0.1; k += 0.2) put(gateMat, new THREE.BoxGeometry(0.035, 2.2, 0.035), cx + k, 1.3, 0);
      // the spikes along the top
      for (let k = -lw / 2 + 0.2; k < lw / 2 - 0.1; k += 0.4) put(gateMat, new THREE.ConeGeometry(0.04, 0.16, 4), cx + k, 2.52, 0);
      put(starMat, new THREE.TorusGeometry(0.62, 0.05, 6, 24), cx, 1.3, 0);
      for (const f of [-1, 1]) put(starMat, star.clone().scale(0.95, 0.95, 1), cx, 1.3, f * 0.05);
    }
    // the "no entry" sign on the left post, facing the district
    for (const f of [-1, 1]) {
      const plate = new THREE.PlaneGeometry(0.6, 0.6);
      if (f > 0) plate.rotateY(Math.PI);
      // the district is on local -z of the fence when the road goes on to +z, and so on
      put(signMat, plate, -(w + 0.3), 2.2, f * 0.29);
    }

    // the road beyond: asphalt, banks, a line of lamp posts
    const [x0, x1, z0, z1] = EDGE_ROADS[EDGE_GATES.indexOf(g)];
    const road = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    road.rotateX(-Math.PI / 2);
    const uv = road.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (x1 - x0)) / 12, (uv.getY(i) * (z1 - z0)) / 12);
    road.translate((x0 + x1) / 2, 0.021, (z0 + z1) / 2);
    add(world.roadMats[1], road);
    const alongX = g.along === 'z'; // the road runs along x when the fence runs along z
    const len = alongX ? x1 - x0 : z1 - z0;
    for (const s of [-1, 1]) {
      const bank = new THREE.BoxGeometry(alongX ? len : 1.6, 0.5, alongX ? 1.6 : len);
      bank.translate(alongX ? (x0 + x1) / 2 : g.x + s * (g.half + 1.4), 0.12, alongX ? g.z + s * (g.half + 1.4) : (z0 + z1) / 2);
      add(bankMat, bank);
    }
    for (let d = 14; d < len - 4; d += 36) {
      const px = alongX ? (g.dir[0] > 0 ? x0 + d : x1 - d) : g.x + g.half + 2.6;
      const pz = alongX ? g.z + g.half + 2.6 : g.dir[1] > 0 ? z0 + d : z1 - d;
      add(poleMat, new THREE.CylinderGeometry(0.1, 0.14, 8, 6).translate(px, 4, pz));
      const arm = new THREE.BoxGeometry(alongX ? 0.08 : 1.6, 0.08, alongX ? 1.6 : 0.08);
      arm.translate(alongX ? px : px - 0.75, 7.9, alongX ? pz - 0.75 : pz);
      add(poleMat, arm);
    }
  }

  for (const { mat, season, list } of parts.values()) {
    for (const geo of list) for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    // (the star has no uv: give everything in its bucket the same set)
    if (list.some((geo) => !geo.attributes.uv)) for (const geo of list) geo.attributes.uv && geo.deleteAttribute('uv');
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
    mesh.castShadow = mat !== world.roadMats[1];
    mesh.receiveShadow = true;
    world.group.add(season ? ctx.seasonable(season, mesh) : mesh);
  }
}
