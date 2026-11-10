// Crows: the only thing alive above a town where nothing grows. A few
// circle over the courtyards and the port, a few sit on the wires.
import * as THREE from 'three';
import { seeded } from './noise.js';

function makeCrowMesh(mat) {
  const g = new THREE.Group();
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

/** Centres the flocks circle over: [x, z, how many]. */
const FLOCKS = [
  [0, 0, 5],
  [-10, 130, 2],
  [-170, 20, 2],
  [-40, -150, 1],
  [196, -96, 2],
];

export function buildCrows(ctx) {
  const { world } = ctx;
  const rnd = seeded(7717);
  const mat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.5, metalness: 0.15 });
  const crows = [];
  for (const [fx, fz, count] of FLOCKS) {
    for (let i = 0; i < count; i++) {
      const { group: crow, wings } = makeCrowMesh(mat);
      crow.scale.setScalar(0.85 + rnd() * 0.35);
      world.group.add(crow);
      crows.push({
        crow,
        wings,
        cx: fx + (rnd() - 0.5) * 60,
        cz: fz + (rnd() - 0.5) * 60,
        radius: 22 + rnd() * 24,
        height: 17 + rnd() * 13,
        speed: (0.05 + rnd() * 0.06) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * Math.PI * 2,
        flap: 5.5 + rnd() * 3,
      });
    }
  }
  // perched on the parapet of the nine-storey block on the avenue and on
  // the roof of the bus shelter
  for (const [px, py, pz] of [
    [20, 27.5, -12],
    [20, 27.5, -3],
    [32, 27.5, 9],
    [-11.6, 2.78, 64.6],
  ]) {
    const { group: crow } = makeCrowMesh(mat);
    crow.position.set(px, py, pz);
    crow.rotation.y = rnd() * Math.PI * 2;
    crow.scale.setScalar(0.9);
    world.group.add(crow);
  }
  ctx.addUpdater((dt, t) => {
    for (const c of crows) {
      const a = c.phase + t * c.speed;
      c.crow.position.set(c.cx + Math.cos(a) * c.radius, c.height + Math.sin(t * 0.7 + c.phase) * 1.4, c.cz + Math.sin(a) * c.radius);
      c.crow.rotation.y = -a + (c.speed > 0 ? 0 : Math.PI);
      c.crow.rotation.z = Math.sin(t * 0.5 + c.phase) * 0.12;
      for (const w of c.wings) w.pivot.rotation.z = w.side * (0.35 - Math.abs(Math.sin(t * c.flap + c.phase)) * 0.85);
    }
  });
}
