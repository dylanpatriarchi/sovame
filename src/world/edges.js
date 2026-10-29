// The district's edges: where a street reaches the old boundary line it no
// longer stops. The road carries on, between its snow banks and a line of
// lamp posts, out past the blocks that line it (buildings.js) until the haze
// takes it, and you can walk it all the way out to the end of the ground
// (WORLD.limit, index.js collides). On Zavodskaya the street runs on into
// ул. Кедровая in the private sector (east.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FAR = 340; // the roads run out to here (the ground plane ends at 350)

/**
 * Where streets cross the old boundary line: the crossing's centre, which way
 * the line runs ('x' or 'z'), the road's half width, and which way the road
 * goes on.
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

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6f7376, roughness: 0.8 });
  const bankMat = winter ? M.snow : new THREE.MeshStandardMaterial({ color: 0x7f7458, roughness: 1 });

  for (const g of EDGE_GATES) {
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
      ctx.addLateColliderRect(px - 0.2, px + 0.2, pz - 0.2, pz + 0.2);
    }
  }

  for (const { mat, season, list } of parts.values()) {
    for (const geo of list) for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
    mesh.castShadow = mat !== world.roadMats[1];
    mesh.receiveShadow = true;
    world.group.add(season ? ctx.seasonable(season, mesh) : mesh);
  }
}
