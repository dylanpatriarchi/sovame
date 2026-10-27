// The shelters of the bus's other stops (traffic.js picks the places, on
// the kerb where the bus pulls over): the open-fronted concrete-and-steel
// pavilion of every Soviet route, a bench along its back wall, the stop's
// name on the "A" sign by the kerb. Built after the trees, so the seeded
// scatter never sees their colliders.
import * as THREE from 'three';
import { makeSignTexture } from '../textures.js';

const TAU = Math.PI * 2;
const LEN = 5.4; // along the kerb
const DEEP = 2.2; // back from it
const H = 2.6;

function signTexture(name) {
  return makeSignTexture(256, 320, (c, W, H) => {
    c.fillStyle = '#dcd7c6';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#2b3a55';
    c.beginPath();
    c.arc(W / 2, H * 0.24, W * 0.22, 0, TAU);
    c.fill();
    c.fillStyle = '#efe3cf';
    c.font = 'bold 58px "Arial Narrow", Arial, sans-serif';
    c.fillText('А', W / 2, H * 0.28);
    c.fillStyle = '#2b2a27';
    c.font = 'bold 30px "Arial Narrow", Arial, sans-serif';
    const words = name.split(' ');
    words.forEach((w, i) => c.fillText(w, W / 2, H * (0.56 + i * 0.12)));
    c.font = 'bold 28px Arial, sans-serif';
    c.fillStyle = '#a8231c';
    c.fillText('31', W / 2, H * 0.88);
  });
}

/** The mosaic panel on the back wall: a sun over birches, in tiles. */
function mosaicTexture(seed) {
  return makeSignTexture(512, 256, (c, W, H) => {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const tile = 8;
    for (let y = 0; y < H; y += tile) {
      for (let x = 0; x < W; x += tile) {
        const u = x / W;
        const v = y / H;
        let col = v < 0.55 ? [86, 128, 160] : [196, 182, 150];
        const dx = u - 0.72;
        const dy = v - 0.3;
        if (dx * dx * 4 + dy * dy < 0.02) col = [222, 160, 52];
        else if (dx * dx * 4 + dy * dy < 0.04) col = [205, 132, 64];
        for (const bx of [0.16, 0.26, 0.4]) if (Math.abs(u - bx) < 0.018 && v > 0.15) col = (y / tile) % 3 === 0 ? [40, 40, 38] : [236, 232, 220];
        if (v > 0.55 && Math.abs(v - 0.62 - Math.sin(u * 9) * 0.03) < 0.02) col = [120, 72, 52];
        const k = 0.86 + rnd() * 0.22;
        c.fillStyle = `rgb(${col.map((q) => Math.round(q * k)).join(',')})`;
        c.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
  });
}

export function buildBusStops(ctx) {
  const { world } = ctx;
  const M = ctx.materials;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.85 });
  for (const [k, stop] of (world.busStops ?? []).entries()) {
    if (k === 0) continue; // the avenue's stands in props.js
    const g = new THREE.Group();
    g.position.set(stop.x, world.heightAt(stop.x, stop.z), stop.z);
    // local +x back from the kerb, local z along it
    g.rotation.y = stop.heading + Math.PI;
    const put = (geo, mat, x, y, z, { cast = true, parent = g } = {}) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // the slab it stands on, a step up from the pavement
    put(B(DEEP + 0.8, 0.16, LEN + 0.6), M.concreteDark, 0.1, 0.08, 0, { cast: false });
    // back wall: concrete panel with its mosaic
    put(B(0.16, H, LEN), M.concrete, DEEP / 2, H / 2 + 0.16, 0);
    const mosaic = new THREE.MeshStandardMaterial({ map: mosaicTexture(4001 + k * 77), roughness: 0.6 });
    const panel = put(new THREE.PlaneGeometry(LEN - 0.6, 1.3), mosaic, DEEP / 2 - 0.085, 1.85, 0, { cast: false });
    panel.rotation.y = -Math.PI / 2;
    // the end walls: glass in steel frames
    for (const s of [-1, 1]) {
      put(B(DEEP, 0.08, 0.08), M.metal, 0, 0.6, s * (LEN / 2 - 0.04));
      put(B(DEEP, 0.08, 0.08), M.metal, 0, H + 0.1, s * (LEN / 2 - 0.04));
      put(B(0.08, H, 0.08), M.metal, -DEEP / 2 + 0.04, H / 2 + 0.16, s * (LEN / 2 - 0.04));
      put(B(DEEP - 0.1, H - 0.6, 0.04), M.glassPane, 0, 0.6 + (H - 0.6) / 2, s * (LEN / 2 - 0.04), { cast: false });
    }
    // the roof slab, lipped over the front
    put(B(DEEP + 0.7, 0.18, LEN + 0.4), M.concreteWhite, -0.2, H + 0.25, 0);
    const snow = put(B(DEEP + 0.66, 0.12, LEN + 0.36), M.snow, -0.2, H + 0.4, 0, { cast: false });
    ctx.seasonable('winter', snow);
    // the bench along the back wall
    for (const z of [-1.8, 0, 1.8]) put(B(0.4, 0.42, 0.08), M.metal, DEEP / 2 - 0.35, 0.37, z);
    for (let i = 0; i < 3; i++) put(B(0.13, 0.05, 4.4), woodMat, DEEP / 2 - 0.55 + i * 0.16, 0.6, 0);
    // the "A" sign on its post at the near end of the kerb
    const plateMat = new THREE.MeshStandardMaterial({ map: signTexture(stop.ru ?? stop.name.toUpperCase()), roughness: 0.75 });
    put(new THREE.CylinderGeometry(0.055, 0.055, 3.0, 8), M.metal, -DEEP / 2 - 0.5, 1.5, LEN / 2 + 1.2);
    // (faced along the kerb, to the bus coming in)
    put(B(0.8, 1.0, 0.06), [M.metal, M.metal, M.metal, M.metal, plateMat, plateMat], -DEEP / 2 - 0.5, 2.5, LEN / 2 + 1.2);
    // a litter bin by the door end
    put(new THREE.CylinderGeometry(0.22, 0.18, 0.7, 10), M.metal, -DEEP / 2 + 0.2, 0.51, -LEN / 2 - 0.5);
    world.group.add(g);

    // colliders: the back wall and its bench, the two end walls, the sign post (the road
    // here runs along x or z, so the walls stay axis-aligned)
    const at = (lx, lz) => {
      const c = Math.cos(g.rotation.y);
      const s = Math.sin(g.rotation.y);
      return { x: stop.x + lx * c + lz * s, z: stop.z - lx * s + lz * c };
    };
    const rect = (lx0, lx1, lz0, lz1) => {
      const a = at(lx0, lz0);
      const b = at(lx1, lz1);
      ctx.addColliderRect(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z));
    };
    rect(DEEP / 2 - 0.12, DEEP / 2 + 0.12, -LEN / 2, LEN / 2);
    // the bench along it
    rect(DEEP / 2 - 0.78, DEEP / 2 - 0.12, -2.25, 2.25);
    for (const s of [-1, 1]) rect(-DEEP / 2, DEEP / 2, s * (LEN / 2) - 0.08, s * (LEN / 2) + 0.08);
    const post = at(-DEEP / 2 - 0.5, LEN / 2 + 1.2);
    ctx.addBoxCollider(post.x, post.z, 0.12, 0.12, 0.1);
    const bin = at(-DEEP / 2 + 0.2, -LEN / 2 - 0.5);
    ctx.addBoxCollider(bin.x, bin.z, 0.44, 0.44, 0.05);
    const c0 = at(-DEEP / 2 - 1, -LEN / 2 - 1);
    const c1 = at(DEEP / 2 + 1, LEN / 2 + 1);
    ctx.addZone('Автобусная остановка', `Bus stop · ${stop.name}`, c0.x, c1.x, c0.z, c1.z);
  }
}
