// Checks the town layout (src/world/town.js) without building anything:
// nothing may stand on a street or its sidewalk, footprints may not touch,
// and benches, cars and playgrounds must be clear of the walls.
//   node tools/check-town.mjs
import * as T from '../src/world/town.js';

const PAD = { x0: -250, x1: 250, z0: -210, z1: 200 };
const PORCH = 2.8;
const problems = [];
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const inside = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const fmt = (r) => `[${r.x0}..${r.x1}, ${r.z0}..${r.z1}]`;

// footprints: blocks carry their porch stairs on both long sides
const solids = [];
for (const b of T.BLOCKS) {
  solids.push({ id: b.id, rect: T.footprint(b), full: T.rectToWorld(b, -b.w / 2, b.w / 2, -b.d / 2 - PORCH, b.d / 2 + PORCH) });
}
for (const p of T.PUBLIC) solids.push({ id: p.id, rect: T.publicRect(p), full: T.publicRect(p, 1) });

const streets = T.STREETS.map((s) => ({ id: s.id, rect: T.streetRect(s, T.SIDEWALK) }));

for (const s of solids) {
  const r = s.full;
  if (r.x0 < PAD.x0 || r.x1 > PAD.x1 || r.z0 < PAD.z0 || r.z1 > PAD.z1) problems.push(`${s.id} leaves the pad ${fmt(r)}`);
  for (const st of streets) if (overlap(r, st.rect)) problems.push(`${s.id} ${fmt(r)} stands on ${st.id} ${fmt(st.rect)}`);
}
for (let i = 0; i < solids.length; i++) {
  for (let j = i + 1; j < solids.length; j++) {
    if (overlap(solids[i].full, solids[j].full)) problems.push(`${solids[i].id} ${fmt(solids[i].full)} touches ${solids[j].id} ${fmt(solids[j].full)}`);
  }
}

const points = [
  ...T.BENCHES.map((b) => ({ id: b.id, x: b.x, z: b.z, r: 1.4 })),
  ...T.PARKED.filter((c) => !c.curb).map((c, i) => ({ id: `car#${i} (${c.x},${c.z})`, x: c.x, z: c.z, r: 2.6 })),
  ...T.PLAYGROUNDS.map((p, i) => ({ id: `playground#${i}`, x: p.x, z: p.z, r: 7 })),
  { id: 'tree', ...T.SQUARE_TREE, r: 4 },
  { id: 'obelisk', ...T.OBELISK, r: 3 },
  { id: 'kiosk', x: T.KIOSK.x, z: T.KIOSK.z, r: 1.6 },
];
for (const p of points) {
  const box = { x0: p.x - p.r, x1: p.x + p.r, z0: p.z - p.r, z1: p.z + p.r };
  for (const s of solids) if (overlap(box, s.full)) problems.push(`${p.id} is inside ${s.id}`);
  if (p.id !== 'kiosk') for (const st of streets) if (overlap(box, st.rect)) problems.push(`${p.id} is on ${st.id}`);
}
for (const c of T.PARKED.filter((c) => c.curb && Math.abs(c.x) < 250)) {
  if (!T.STREETS.some((s) => inside(T.streetRect(s), c.x, c.z))) problems.push(`curb car (${c.x},${c.z}) is not on a street`);
}

// pipes: axis aligned, clear of walls (they may cross streets, on arches)
for (const run of T.PIPES) {
  for (let i = 1; i < run.length; i++) {
    const [ax, az] = run[i - 1];
    const [bx, bz] = run[i];
    if (ax !== bx && az !== bz) problems.push(`pipe segment (${ax},${az})→(${bx},${bz}) is not axis aligned`);
    const r = { x0: Math.min(ax, bx) - 1, x1: Math.max(ax, bx) + 1, z0: Math.min(az, bz) - 1, z1: Math.max(az, bz) + 1 };
    for (const s of solids) if (overlap(r, s.full)) problems.push(`pipe (${ax},${az})→(${bx},${bz}) runs through ${s.id} ${fmt(s.full)}`);
    for (const st of T.STREETS) {
      const sr = T.streetRect(st, T.SIDEWALK);
      const along = st.axis === 'z' ? ax === bx : az === bz;
      if (along && overlap(r, sr)) problems.push(`pipe (${ax},${az})→(${bx},${bz}) runs along ${st.id}`);
    }
  }
}

// walks: every point clear of the walls
for (const [name, walk] of Object.entries(T.WALKS)) {
  for (const p of walk.points) {
    const x = Array.isArray(p) ? p[0] : p.x;
    const z = Array.isArray(p) ? p[1] : p.z;
    for (const s of solids) if (inside(s.full, x, z)) problems.push(`walk ${name} point (${x},${z}) is inside ${s.id}`);
  }
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`town ok: ${T.BLOCKS.length} blocks, ${T.PUBLIC.length} public buildings, ${T.STREETS.length} streets`);
