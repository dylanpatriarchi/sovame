// What stands in the streets and yards of the town: lamps, benches, the
// kiosk with its radio, the bus shelter, playgrounds, the New Year tree and
// the obelisk on the square, the stele with the town's name on the way out.
// Everything goes into the merged meshes of arctic.js through its `kit`.
import * as THREE from 'three';
import { hash2 } from './noise.js';
import { STREETS, SIDEWALK, BENCHES, KIOSK, BUS_STOP, PLAYGROUNDS, SQUARE_TREE, OBELISK, streetRect } from './town.js';

const POLE = 0x34373a;
const CONCRETE = 0x8f8d86;
const PAINTS = [0xb5392c, 0x2f5f86, 0xc9a13f, 0x3d7257];

function makeNameTexture(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#8d8a82';
  c.fillRect(0, 0, 1024, 256);
  // weathered concrete
  let s = 5150;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 5000; i++) {
    const v = 110 + rnd() * 70;
    c.fillStyle = `rgba(${v},${v},${v - 6},0.35)`;
    c.fillRect(rnd() * 1024, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = 'bold 150px sans-serif';
  c.fillStyle = '#5a1512';
  c.fillText(text, 516, 112);
  c.fillStyle = '#c23a2c';
  c.fillText(text, 512, 106);
  c.font = 'bold 40px sans-serif';
  c.fillStyle = '#e9e4d6';
  c.fillText(sub, 512, 212);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildFurniture(ctx, kit) {
  const { world } = ctx;
  const { flat, tin, glow, box, cyl, placed, bench, lampPost, SNOW } = kit;

  /* ------------------------------------------------ street lamps */
  for (const s of STREETS) {
    let n = 0;
    for (let t = s.from + 9; t < s.to - 4; t += 27) {
      const side = n++ % 2 ? 1 : -1;
      const lat = s.at + side * (s.half + 0.7);
      const x = s.axis === 'z' ? lat : t;
      const z = s.axis === 'z' ? t : lat;
      // only where the sidewalk actually runs (it is cut at junctions)
      if (world.heightAt(x, z) < 0.1 || world.heightAt(x, z) > 0.2) continue;
      if (s.axis === 'z') lampPost(x, z, 8.5, 13, -side, 0);
      else lampPost(x, z, 8.5, 13, 0, -side);
      ctx.addBoxCollider(x, z, 0.2, 0.2, 0.05);
    }
  }

  /* ------------------------------------------------ benches */
  for (const b of BENCHES) bench(b.x, b.z, b.yaw, b.id, { barrel: false });

  /* ------------------------------------------------ kiosk */
  {
    const { x, z } = KIOSK;
    box(tin, 2.6, 2.5, 3.4, x, 1.25, z, 0x4f6f86, 0x3a4650);
    box(flat, 3.3, 0.12, 3.9, x + 0.25, 2.56, z, 0x2c3238);
    box(flat, 3.34, 0.12, 3.94, x + 0.25, 2.68, z, SNOW);
    // the lit window, the counter under it, the bars over the glass
    box(glow, 0.04, 0.95, 2.3, x + 1.32, 1.55, z, 0xffd9a0);
    box(flat, 0.34, 0.06, 2.5, x + 1.45, 1.03, z, 0x8f8d86);
    for (let k = -3; k <= 3; k++) box(flat, 0.03, 0.95, 0.03, x + 1.35, 1.55, z + k * 0.34, 0x24282b);
    box(glow, 0.04, 0.3, 2.9, x + 1.32, 2.28, z, 0xc8422e);
    ctx.addBoxCollider(x, z, 2.6, 3.4, 0.1);
    world.points.radio = new THREE.Vector3(x + 1.2, 1.5, z);
    ctx.addZone('Киоск', 'The kiosk — the radio is on the counter', x - 3, x + 6, z - 5, z + 5);
  }

  /* ------------------------------------------------ bus shelter */
  {
    const { x, z } = BUS_STOP;
    // open to the avenue (+x): a back wall, two cheeks, a roof
    box(tin, 0.08, 2.3, 4.4, x - 1.1, 1.25, z, 0xc9a13f, 0x6e5a36);
    for (const side of [-1, 1]) box(tin, 1.5, 2.3, 0.08, x - 0.35, 1.25, z + side * 2.2, 0xc9a13f, 0x6e5a36);
    box(flat, 2.5, 0.1, 4.8, x - 0.1, 2.45, z, 0x3a3d40);
    box(flat, 2.54, 0.14, 4.84, x - 0.1, 2.57, z, SNOW);
    ctx.addColliderRect(x - 1.2, x - 1.0, z - 2.2, z + 2.2);
    for (const side of [-1, 1]) ctx.addColliderRect(x - 1.1, x + 0.4, z + side * 2.2 - 0.06, z + side * 2.2 + 0.06);
    bench(x - 0.55, z, -Math.PI / 2, 'spot:bus', { barrel: false });
    // the stop sign on its own pole
    box(flat, 0.07, 2.9, 0.07, x + 1.7, 1.45, z + 3.2, POLE);
    box(flat, 0.05, 0.5, 0.7, x + 1.7, 2.75, z + 3.2, 0xd9b23c);
    world.points.busStop = { x, z };
  }

  /* ------------------------------------------------ playgrounds */
  PLAYGROUNDS.forEach((p, n) => {
    const col = (k) => PAINTS[(n + k) % PAINTS.length];
    const yaw = hash2(n, 1, 801) * Math.PI;
    // swings
    placed(
      () => {
        for (const sx of [-1.7, 1.7]) {
          for (const lean of [-0.28, 0.28]) placed(() => box(flat, 0.08, 2.5, 0.08, 0, 1.22, 0, col(0)), sx, 0, lean * 2.2, 0, 0);
          box(flat, 0.08, 2.4, 0.08, sx, 1.2, 0, col(0));
        }
        box(flat, 3.6, 0.08, 0.08, 0, 2.4, 0, col(0));
        for (const sx of [-0.8, 0.8]) {
          for (const c of [-0.22, 0.22]) box(flat, 0.02, 1.9, 0.02, sx + c, 1.45, 0, 0x2a2c2e);
          box(flat, 0.5, 0.04, 0.2, sx, 0.5, 0, 0x6e5238);
        }
      },
      p.x - 3.5,
      0,
      p.z - 3,
      yaw,
    );
    ctx.addBoxCollider(p.x - 3.5, p.z - 3, 0.8, 0.8, 0);
    // the rocket: every yard between Murmansk and Magadan has one
    placed(
      () => {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          placed(() => box(flat, 0.05, 4.2, 0.05, 0, 2.05, 0, col(1)), Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75, -a, 0.17);
        }
        for (const [y, r] of [[0.9, 0.82], [1.9, 0.6], [2.9, 0.4]]) cyl(flat, r, r, 0.05, 0, y, 0, col(2), null, 10);
        cyl(flat, 0, 0.36, 1.1, 0, 4.6, 0, 0xb5392c, null, 8);
      },
      p.x + 3,
      0,
      p.z + 2.5,
    );
    ctx.addBoxCollider(p.x + 3, p.z + 2.5, 1.5, 1.5, 0);
    // sandbox under the snow
    for (const [w, d, ox, oz] of [[3, 0.12, 0, -1.5], [3, 0.12, 0, 1.5], [0.12, 3, -1.5, 0], [0.12, 3, 1.5, 0]]) box(flat, w, 0.3, d, p.x + 3 + ox, 0.15, p.z - 4 + oz, col(3));
    box(flat, 2.9, 0.12, 2.9, p.x + 3, 0.2, p.z - 4, SNOW);
    // slide
    placed(
      () => {
        box(flat, 0.06, 1.9, 0.06, -0.3, 0.95, -0.3, col(1));
        box(flat, 0.06, 1.9, 0.06, -0.3, 0.95, 0.3, col(1));
        for (let k = 1; k <= 5; k++) box(flat, 0.04, 0.04, 0.6, -0.3, k * 0.3, 0, col(1));
        placed(() => box(tin, 3.1, 0.05, 0.6, 0, 0, 0, 0xb9bdc0), 1.1, 0.95, 0, 0, -0.6);
      },
      p.x - 2.5,
      0,
      p.z + 4,
      yaw + 1,
    );
    ctx.addBoxCollider(p.x - 2.5, p.z + 4, 0.9, 0.9, 0);
    // the frame for beating carpets
    for (const sx of [-1.2, 1.2]) box(flat, 0.07, 2.1, 0.07, p.x - 6 + sx, 1.05, p.z, POLE);
    box(flat, 2.5, 0.07, 0.07, p.x - 6, 2.1, p.z, POLE);
  });

  /* ------------------------------------------------ the square */
  {
    // New Year tree: it stands until the snow goes, which is June
    const { x, z } = SQUARE_TREE;
    cyl(flat, 0.2, 0.26, 1.6, x, 0.8, z, 0x4a3828, null, 8);
    const tiers = 6;
    const lights = [];
    const colors = [];
    const palette = [new THREE.Color(1, 0.25, 0.15), new THREE.Color(1, 0.75, 0.2), new THREE.Color(0.2, 0.55, 1), new THREE.Color(0.25, 1, 0.4)];
    for (let k = 0; k < tiers; k++) {
      const r = 2.9 - k * 0.42;
      const y = 1.5 + k * 1.25;
      cyl(flat, r * 0.28, r, 1.9, x, y + 0.95, z, 0x3a7a56, 0x23523a, 12);
      cyl(flat, r * 0.3, r * 0.62, 0.5, x, y + 1.72, z, SNOW, null, 12);
      const bulbs = 14 - k;
      for (let b = 0; b < bulbs; b++) {
        const a = (b / bulbs) * Math.PI * 2 + k * 0.6;
        const t = 0.25 + hash2(k, b, 811) * 0.5;
        const rr = r * (1 - 0.72 * t) + 0.06;
        lights.push(x + Math.cos(a) * rr, y + t * 1.9, z + Math.sin(a) * rr);
        palette[(b + k) % 4].toArray(colors, colors.length);
      }
    }
    box(glow, 0.5, 0.5, 0.12, x, 1.5 + tiers * 1.25 + 0.9, z, 0xff3a28);
    ctx.addBoxCollider(x, z, 1.6, 1.6, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.34, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const garland = new THREE.Points(geo, mat);
    garland.name = 'garland';
    world.group.add(garland);
    ctx.addUpdater((dt, t) => {
      const night = Math.min(1, (world.litLevel ?? 0) * 1.4);
      mat.opacity = night * (0.75 + 0.25 * Math.sin(t * 2.2));
    });
  }
  {
    // the obelisk to the first winterers
    const { x, z } = OBELISK;
    box(flat, 5, 0.4, 5, x, 0.2, z, CONCRETE);
    box(flat, 3.4, 0.4, 3.4, x, 0.6, z, CONCRETE);
    box(flat, 3.44, 0.1, 3.44, x, 0.85, z, SNOW);
    const shaft = new THREE.CylinderGeometry(0.42, 0.9, 11, 4);
    shaft.rotateY(Math.PI / 4);
    shaft.translate(x, 6.3, z);
    flat.push(kit.paint(shaft, 0xd6d2c8, 0xa09c92));
    box(glow, 0.9, 0.9, 0.16, x, 12.4, z, 0xd8362a, null, Math.PI / 2);
    box(flat, 1.5, 0.9, 0.08, x - 0.95, 2.0, z, 0x5a4a36, null, 0);
    ctx.addBoxCollider(x, z, 3.4, 3.4, 0);
    ctx.addHeightRect(x - 2.5, x + 2.5, z - 2.5, z + 2.5, 0.4);
  }

  /* ------------------------------------------------ the stele */
  {
    // the town's name in concrete where the road north leaves the last block
    const avenue = STREETS.find((s) => s.id === 'kosmonavtov');
    const r = streetRect(avenue, SIDEWALK);
    const x = r.x1 + 7.5;
    const z = avenue.to + 4;
    box(flat, 11.6, 0.7, 1.4, x, 0.35, z, CONCRETE);
    box(flat, 11, 2.9, 0.5, x, 2.1, z, 0x8d8a82);
    box(flat, 11.1, 0.14, 0.6, x, 3.62, z, SNOW);
    box(flat, 0.5, 6.2, 0.5, x + 5.6, 3.1, z, 0x8d8a82);
    box(glow, 0.7, 0.7, 0.12, x + 5.6, 6.5, z, 0xd8362a);
    const mat = new THREE.MeshStandardMaterial({ map: makeNameTexture('ПОЛЯРНЫЙ', 'ОСНОВАН В 1953 ГОДУ · 69° С. Ш.'), roughness: 0.9 });
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 2.7), mat);
      face.position.set(x, 2.1, z + side * 0.26);
      if (side < 0) face.rotation.y = Math.PI;
      world.group.add(face);
    }
    ctx.addBoxCollider(x, z, 11.6, 1.4, 0);
    world.points.stele = { x, z };
  }
}
