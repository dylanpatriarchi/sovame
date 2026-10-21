// Scripted bug-hunt playtest: walks the whole district with real key events,
// probes the collider grid against an independent expectation, sweeps every
// interaction, cycles seasons × time presets and watches the pedestrians.
// Regression coverage for the fix/playtest-pass branch lives here.
// Usage: node tools/playtest.mjs [url] [outDir]   (dev server must run)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 420000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--window-size=1280,760',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

// swiftshader emits this for every screenshot/readback: headless noise, not a game error
const BENIGN = /GPU stall due to ReadPixels/;
const errors = [];
const warnings = [];
page.on('console', (message) => {
  const type = message.type();
  if (type === 'debug' || type === 'info') return;
  if (BENIGN.test(message.text())) return;
  const line = `[${type}] ${message.text()}`;
  if (type === 'error') errors.push(line);
  else warnings.push(line);
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
page.on('requestfailed', (request) => errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`));

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}`);
  if (!ok) problems.push(label);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`→ opening ${URL_BASE}`);
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(1200);
await page.evaluate(() => {
  window.__game.state.mode = 'playing';
  window.__game.env.snapTo(window.__game.env.preset); // freeze the title-time drift for determinism
});

/* ================================================================ walk soak
 * Real key events drive the input (page.keyboard + yaw writes); between key
 * holds the physics is stepped in bursts so the software renderer does not
 * stretch the walk into minutes. After every waypoint the player must be
 * outside every collider, on or above the ground and finite.
 */
const LEGS = [
  {
    name: 'avenue: spawn to the south end',
    sprint: true,
    start: [7.2, 19.5],
    waypoints: [
      [7.0, -30],
      [7.0, -70],
      [7.0, -104],
    ],
  },
  {
    name: 'avenue: full length south → north on the west sidewalk',
    sprint: true,
    start: [7.0, -104],
    waypoints: [
      [-7.0, -104],
      [-7.0, -40],
      [-7.0, 20],
      [-7.0, 60],
      [-7.0, 100],
      [-7.0, 140],
      [-7.0, 179],
      [7.0, 179],
      [7.0, 132],
    ],
  },
  {
    name: 'Zavodskaya arm, out and back',
    sprint: true,
    start: [10, 134.6], // a lamp at (52, 135.9) holds the north lane's middle
    waypoints: [
      [98, 134.6],
      [98, 120.4],
      [10, 120.4],
    ],
  },
  {
    name: 'west courtyard (№ 12) through the playground',
    sprint: false,
    start: [-7.0, -30],
    waypoints: [
      [-12, -38],
      [-14, -44.6],
      [-24, -44.9], // B1's face: the collider margin starts at z = -45.75
      [-41, -44.9],
      [-41, -33],
      [-41, -24],
      [-38.5, -22.6], // weave south of the swing frame
      [-33.5, -22.6],
      [-30, -22.4],
      [-30, -17.8],
      [-35, -17.8],
      [-41, -16],
      [-41, -4],
      [-36, -2.9],
      [-30, -2.9],
      [-20, -2.9],
      [-15, -5.2], // bench at (-12.5, -4), power pole at (-12.6, 0)
      [-11, -5.2],
      [-8.5, -2],
    ],
  },
  {
    name: 'east courtyard (№ 7): pond loop, around the kiosk and the bus stop',
    sprint: false,
    start: [7.0, 14],
    waypoints: [
      [12, 18],
      [24, 25.2],
      [34, 25.2],
      [38, 10],
      [38, -8],
      [36, -21],
      [34, -22.8], // B2's courtyard-face path strip
      [27, -22.8],
      [27, -19.5],
      [27, -18.35], // squeeze between the kindergarten fence and a bench
      [10, -18.35],
      [9, -18.35], // then around the kindergarten's west side
      [9, -6],
      [9, -2.2],
      [8.6, -1],
      [8.6, 7], // kiosk on the right
      [11, 8.8],
      [14.5, 8.6],
      [14.8, 1],
      [14.8, 0.5],
      [10, -1.2],
      [8.4, 4],
      [8.4, 14],
      [7.6, 18],
      [10.3, 22],
      [10.3, 26.5],
      [7.7, 29.5],
      [7.6, 32],
    ],
  },
  {
    name: 'north-west courtyard (№ 24): spines and spurs',
    sprint: false,
    start: [-7.0, 110],
    waypoints: [
      [-12, 133],
      [-30, 133],
      [-30, 142],
      [-30, 121],
      [-30, 133],
      [-43.3, 133],
      [-43.3, 122],
      [-43.3, 133],
      [-60, 133],
      [-75.6, 131],
      [-75.6, 122],
      [-75.6, 133],
      [-14, 133],
    ],
  },
  {
    name: 'north-east courtyard (№ 2) to the end of the arm',
    sprint: false,
    start: [12, 140.5], // benches and a bin face the path: slalom between them
    waypoints: [
      [26, 140.5],
      [30.5, 140.5],
      [30.5, 139.2],
      [33.4, 139.2],
      [34.4, 141.5],
      [34.4, 143.5],
      [34.4, 141.5],
      [41.6, 140.3],
      [46.6, 140.3],
      [48, 140.5],
      [60, 141],
      [74, 141],
      [74, 143.5],
      [74, 138],
      [86, 136],
      [98, 128],
    ],
  },
];

// route precheck: every segment must be walkable in a straight line
console.log('→ route precheck');
const routeBlocks = await page.evaluate((legs) => {
  const w = window.__game.world;
  const blocked = [];
  for (const leg of legs) {
    let from = leg.start;
    for (const to of leg.waypoints) {
      const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.max(2, Math.ceil(dist / 0.4));
      for (let i = 1; i <= n; i++) {
        const x = from[0] + ((to[0] - from[0]) * i) / n;
        const z = from[1] + ((to[1] - from[1]) * i) / n;
        if (w.collides(x, z, 0.34)) {
          blocked.push({ leg: leg.name, to, at: [Number(x.toFixed(1)), Number(z.toFixed(1))] });
          break;
        }
      }
      from = to;
    }
  }
  return blocked;
}, LEGS);
if (routeBlocks.length) console.log('  blocked segments:', JSON.stringify(routeBlocks));
check(routeBlocks.length === 0, 'route precheck: all soak segments walkable in a straight line');

console.log('→ walk soak');
for (const leg of LEGS) {
  await page.evaluate((start) => window.__game.player.teleport(start[0], start[1], 0), leg.start);
  await page.keyboard.down('KeyW');
  if (leg.sprint) await page.keyboard.down('ShiftLeft');
  let legOk = true;
  for (const [tx, tz] of leg.waypoints) {
    const res = await page.evaluate(
      async ({ tx, tz, sprint }) => {
        const g = window.__game;
        const p = g.player;
        const speed = sprint ? 5.6 : 2.75;
        const dist = Math.hypot(tx - p.position.x, tz - p.position.z);
        const budget = Math.ceil((dist / speed) * 60 * 3.5) + 120;
        let steps = 0;
        let jitter = 0;
        let stallChecks = 0;
        let lastX = p.position.x;
        let lastZ = p.position.z;
        while (steps < budget) {
          const dx = tx - p.position.x;
          const dz = tz - p.position.z;
          if (Math.hypot(dx, dz) < 0.4) break;
          // aim at the waypoint; when stuck against a collider face, wiggle
          // the aim sideways so the axis-separated solver slides along it
          p.yaw = Math.atan2(-dx, -dz) + jitter;
          for (let i = 0; i < 12 && steps < budget; i++) {
            p.update(1 / 60);
            steps++;
          }
          if (++stallChecks >= 24) {
            stallChecks = 0;
            const moved = Math.hypot(p.position.x - lastX, p.position.z - lastZ);
            if (moved < 0.05) jitter = jitter > 0 ? -0.75 : 0.75;
            else jitter = 0;
            lastX = p.position.x;
            lastZ = p.position.z;
          }
          await new Promise((r) => setTimeout(r, 0));
        }
        const w = g.world;
        return {
          arrived: Math.hypot(tx - p.position.x, tz - p.position.z) < 0.5,
          x: p.position.x,
          y: p.position.y,
          z: p.position.z,
          vx: p.velocity.x,
          vy: p.velocity.y,
          vz: p.velocity.z,
          stuckInCollider: w.collides(p.position.x, p.position.z, 0.3),
          ground: w.heightAt(p.position.x, p.position.z),
        };
      },
      { tx, tz, sprint: leg.sprint }
    );
    const finite = [res.x, res.y, res.z, res.vx, res.vy, res.vz].every(Number.isFinite);
    if (!res.arrived) {
      legOk = false;
      check(false, `${leg.name}: reached (${tx}, ${tz}) — stopped at (${res.x.toFixed(1)}, ${res.z.toFixed(1)})`);
    }
    if (!finite) {
      legOk = false;
      check(false, `${leg.name}: NaN in position/velocity at (${res.x}, ${res.z})`);
    }
    if (res.stuckInCollider) {
      legOk = false;
      check(false, `${leg.name}: player inside a collider at (${res.x.toFixed(2)}, ${res.z.toFixed(2)})`);
    }
    if (finite && res.y < res.ground - 0.01) {
      legOk = false;
      check(false, `${leg.name}: below ground at (${res.x.toFixed(1)}, ${res.z.toFixed(1)}): y=${res.y.toFixed(2)} < ${res.ground.toFixed(2)}`);
    }
    if (!legOk) break;
  }
  await page.keyboard.up('KeyW');
  if (leg.sprint) await page.keyboard.up('ShiftLeft');
  if (legOk) check(true, leg.name);
}
check(errors.length === 0, 'walk soak: zero page errors');

/* ================================================================ collision probe grid
 * Independent expectation: building footprints come from the spec tables,
 * not from the collider list. Missing colliders (walkable deep inside a
 * building) are always bugs; phantom candidates (collisions on open road or
 * big colliders on plain snow) are reported for curation.
 */
console.log('→ collision probe grid (4 m step)');
const grid = await page.evaluate(async () => {
  const { BUILDING_SPECS, EXPANSION_SPECS } = await import('/src/world/buildings.js');
  const { PARKING_LOT, PARKING_NORTH, WALK_PATHS, NEW_WALK_PATHS } = await import('/src/world/terrain.js');
  const w = window.__game.world;
  const rects = [...BUILDING_SPECS, ...EXPANSION_SPECS].map((s) => ({
    id: s.id,
    minX: s.x - s.w / 2 - 0.25,
    maxX: s.x + s.w / 2 + 0.25,
    minZ: s.z - s.d / 2 - 0.25,
    maxZ: s.z + s.d / 2 + 0.25,
  }));
  // standing structures with colliders that are not in the spec tables
  const structures = [
    { id: 'kindergarten', x: 20, z: -8, w: 16, d: 12, pad: 0.25 },
    { id: 'heating plant', x: -72, z: -62, w: 12, d: 8, pad: 0.3 },
    { id: 'chimney', x: -76.4, z: -64.6, w: 2.6, d: 2.6, pad: 0.2 },
    { id: 'garage row', x: -70, z: -15.2, w: 5.6, d: 28.6, pad: 0.2 },
  ].map((s) => ({ id: s.id, minX: s.x - s.w / 2 - s.pad, maxX: s.x + s.w / 2 + s.pad, minZ: s.z - s.d / 2 - s.pad, maxZ: s.z + s.d / 2 + s.pad }));
  const solid = [...rects, ...structures];
  const insideRect = (x, z, r, inset = 0) => x > r.minX + inset && x < r.maxX - inset && z > r.minZ + inset && z < r.maxZ - inset;
  const causing = (x, z, r) => {
    for (const c of w.colliders) {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return c;
    }
    return null;
  };
  const inParking = (x, z) => [PARKING_LOT, PARKING_NORTH].some((p) => x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
  const missing = [];
  const phantomRoad = [];
  const phantomOpen = [];
  for (let x = -106; x <= 106; x += 4) {
    for (let z = -106; z <= 178; z += 4) {
      const collides = w.collides(x, z, 0.34);
      const building = solid.find((r) => insideRect(x, z, r));
      if (building && !collides && insideRect(x, z, building, 0.45)) {
        missing.push({ x, z, building: building.id });
        continue;
      }
      if (!collides || building) continue;
      const surface = w.surfaceAt(x, z);
      const c = causing(x, z, 0.34);
      if (!c) {
        phantomRoad.push({ x, z, surface, note: 'collides without a rect (bounds?)' });
        continue;
      }
      const cw = c.maxX - c.minX;
      const cd = c.maxZ - c.minZ;
      const area = cw * cd;
      const minDim = Math.min(cw, cd);
      const nearSolid = solid.some((r) => c.maxX > r.minX - 0.6 && c.minX < r.maxX + 0.6 && c.maxZ > r.minZ - 0.6 && c.minZ < r.maxZ + 0.6);
      if (surface === 'asphalt' && !nearSolid) {
        // cars park on the asphalt pads: a vehicle-sized rect there is expected
        const carSized = cw <= 3.4 && cd <= 6.0 && Math.max(cw, cd) >= 2;
        if (!(carSized && inParking(x, z))) {
          phantomRoad.push({ x, z, surface, rect: [c.minX, c.maxX, c.minZ, c.maxZ].map((v) => Number(v.toFixed(1))) });
        }
      } else if (surface === 'snow' && !nearSolid && minDim > 2 && area > 30) {
        phantomOpen.push({ x, z, surface, rect: [c.minX, c.maxX, c.minZ, c.maxZ].map((v) => Number(v.toFixed(1))), area: Number(area.toFixed(0)) });
      }
    }
  }
  // walk paths must not disappear under a building: edge contact with a
  // facade is the house style, burial is a placement bug (regression: the
  // B2 courtyard-face path used to lie entirely inside the building)
  const buriedPaths = [];
  for (const p of [...WALK_PATHS, ...NEW_WALK_PATHS]) {
    const area = (p.x1 - p.x0) * (p.z1 - p.z0);
    let covered = 0;
    for (const r of rects) {
      const ox = Math.max(0, Math.min(p.x1, r.maxX) - Math.max(p.x0, r.minX));
      const oz = Math.max(0, Math.min(p.z1, r.maxZ) - Math.max(p.z0, r.minZ));
      covered += ox * oz;
    }
    if (covered / area > 0.6) buriedPaths.push({ path: [p.x0, p.x1, p.z0, p.z1], covered: Number(((covered / area) * 100).toFixed(0)) });
  }
  // the entrance pads must stay reachable: pad center not buried in the
  // facade, and the door's own standing spot (outSpawn) free for the player
  const pads = window.__game.world.interiors.map((i) => {
    const buried = w.collides(i.doorOut.x, i.doorOut.z, 0.2);
    const spotFree = !w.collides(i.outSpawn.x, i.outSpawn.z, 0.34);
    return { id: i.id, ok: !buried && spotFree };
  });
  return { missing, phantomRoad, phantomOpen, buriedPaths, pads };
});
console.log(`  grid: ${grid.missing.length} missing, ${grid.phantomRoad.length} on-road phantom candidates, ${grid.phantomOpen.length} open-snow phantom candidates, ${grid.buriedPaths.length} buried paths`);
if (grid.phantomRoad.length) console.log('  on-road candidates:', JSON.stringify(grid.phantomRoad));
if (grid.phantomOpen.length) console.log('  open-snow candidates:', JSON.stringify(grid.phantomOpen));
check(grid.missing.length === 0, `collision grid: no walkable points inside building footprints${grid.missing.length ? ' — ' + JSON.stringify(grid.missing) : ''}`);
check(grid.phantomRoad.length === 0, 'collision grid: no unexplained colliders on road surfaces');
check(grid.phantomOpen.length === 0, 'collision grid: no large unexplained colliders on open snow');
check(grid.buriedPaths.length === 0, `no walk path buried under a building${grid.buriedPaths.length ? ' — ' + JSON.stringify(grid.buriedPaths) : ''}`);
check(grid.pads.every((p) => p.ok), `every stairwell entrance pad is reachable${grid.pads.some((p) => !p.ok) ? ' — blocked: ' + grid.pads.filter((p) => !p.ok).map((p) => p.id).join(', ') : ''}`);

/* ================================================================ interaction sweep
 * Radio plus all three enter/exit door pairs: prompt text, KeyE effect, undo.
 */
console.log('→ interaction sweep');
const promptState = () =>
  page.evaluate(() => ({
    visible: document.getElementById('prompt').classList.contains('visible'),
    text: document.getElementById('prompt').textContent,
  }));

// radio
await page.evaluate(() => {
  const g = window.__game;
  g.player.teleport(11.6, -1.5, 0);
  g.player.pitch = 0;
});
// the collision-grid sweep above can stall the page: wait for frames, not ms
await page.waitForFunction(() => document.getElementById('prompt').classList.contains('visible'), { timeout: 10000 }).catch(() => {});
let prompt = await promptState();
check(prompt.visible && prompt.text === 'E — turn on the radio', `radio prompt appears ("${prompt.text}")`);
await page.keyboard.press('KeyE');
await wait(700);
const radioOn = await page.evaluate(() => window.__game.sound.radioOn);
prompt = await promptState();
check(radioOn === true, 'radio: KeyE turns the station on');
check(prompt.visible && prompt.text === 'E — turn off the radio', `radio prompt flips ("${prompt.text}")`);
await page.keyboard.press('KeyE');
await wait(500);
check((await page.evaluate(() => window.__game.sound.radioOn)) === false, 'radio: KeyE again turns it off');

// the three stairwells, in and back out
const interiorsList = await page.evaluate(() => window.__game.world.interiors.map((i) => ({ id: i.id, doorOut: i.doorOut, doorIn: i.doorIn, outSpawn: i.outSpawn, bounds: i.bounds })));
for (const interior of interiorsList) {
  await page.evaluate((d) => {
    const g = window.__game;
    g.player.teleport(d.x, d.z, 0);
    g.player.pitch = 0;
  }, interior.doorOut);
  await wait(700);
  prompt = await promptState();
  const enterOk = prompt.visible && prompt.text === 'E — enter the stairwell';
  await page.keyboard.press('KeyE');
  let entered = true;
  try {
    await page.waitForFunction((id) => window.__game.state.interior?.id === id && !window.__game.state.transitioning, { timeout: 20000 }, interior.id);
  } catch {
    entered = false;
  }
  const insidePos = await page.evaluate(() => ({ x: window.__game.player.position.x, z: window.__game.player.position.z }));
  const inBounds = insidePos.x >= interior.bounds.x0 && insidePos.x <= interior.bounds.x1 && insidePos.z >= interior.bounds.z0 && insidePos.z <= interior.bounds.z1;
  check(enterOk && entered && inBounds, `${interior.id}: enter door prompts, teleports inside`);
  // exit door
  await page.evaluate((d) => {
    const g = window.__game;
    g.player.teleport(d.x, d.z, 0);
    g.player.pitch = 0;
  }, interior.doorIn);
  await wait(700);
  prompt = await promptState();
  const exitOk = prompt.visible && prompt.text === 'E — step outside';
  await page.keyboard.press('KeyE');
  let exited = true;
  try {
    await page.waitForFunction(() => !window.__game.state.interior && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    exited = false;
  }
  const outPos = await page.evaluate(() => ({ x: window.__game.player.position.x, z: window.__game.player.position.z, inside: window.__game.world.interiorAt(window.__game.player.position.x, window.__game.player.position.z) }));
  const nearSpawn = Math.hypot(outPos.x - interior.outSpawn.x, outPos.z - interior.outSpawn.z) < 0.6 && !outPos.inside;
  check(exitOk && exited && nearSpawn, `${interior.id}: exit door prompts, returns outside`);
}
check(errors.length === 0, 'interaction sweep: zero page errors');

/* ================================================================ regression: footprints pause indoors */
console.log('→ footprints indoors (regression)');
const fp = await page.evaluate(() => {
  const g = window.__game;
  g.state.mode = 'playing';
  const it = g.world.interiors[0];
  g.state.interior = it;
  g.player.teleport(it.inSpawn.x, it.inSpawn.z, it.inSpawn.yaw);
  const idx0 = g.player.footprintIndex;
  g.player.keys.forward = true;
  for (let i = 0; i < 300; i++) g.player.update(1 / 60);
  g.player.keys.forward = false;
  const idx1 = g.player.footprintIndex;
  const arr = g.player.footprints.instanceMatrix.array;
  let nearInterior = 0;
  for (let i = 0; i < g.player.footprintMax; i++) {
    if (arr[i * 16 + 12] > 300) nearInterior++;
  }
  // and the control: outside, footprints must still stamp (free lane along
  // B1's courtyard path, clear of its collider margin)
  g.state.interior = null;
  g.player.teleport(-30, -44.8, Math.PI / 2);
  const out0 = g.player.footprintIndex;
  g.player.keys.forward = true;
  for (let i = 0; i < 300; i++) g.player.update(1 / 60);
  g.player.keys.forward = false;
  const out1 = g.player.footprintIndex;
  return {
    indoorStamped: (idx1 - idx0 + g.player.footprintMax) % g.player.footprintMax,
    nearInterior,
    outdoorStamped: (out1 - out0 + g.player.footprintMax) % g.player.footprintMax,
  };
});
check(fp.indoorStamped === 0 && fp.nearInterior === 0, `footprints pause inside stairwells (indoor stamped ${fp.indoorStamped}, instances near interiors ${fp.nearInterior})`);
check(fp.outdoorStamped > 0, `footprints still stamp outdoors (stamped ${fp.outdoorStamped})`);

/* ================================================================ regression: interior light containment */
console.log('→ stairwell light containment (regression)');
const lights = await page.evaluate(() => {
  const found = [];
  window.__game.scene.traverse((o) => {
    if (o.isPointLight && (o.layers.mask & 2)) {
      const p = o.getWorldPosition(new o.position.constructor());
      found.push({ x: p.x, z: p.z, distance: o.distance, decay: o.decay });
    }
  });
  return found;
});
{
  const allBounded = lights.length === 3 && lights.every((l) => l.distance > 0 && l.distance <= 15);
  check(allBounded, `stairwell bulbs have a bounded range (${lights.map((l) => `d=${l.distance}`).join(', ')})`);
  // nearest foreign interior wall must sit outside every bulb's range
  let contained = true;
  for (const l of lights) {
    const range = l.distance > 0 ? l.distance : Infinity;
    for (const other of lights) {
      if (other === l) continue;
      // walls of the other interior reach ±3.32 in z and ±2.36 in x from its center
      const dx = Math.max(0, Math.abs(l.x - other.x) - 2.36);
      const dz = Math.max(0, Math.abs(l.z - other.z) - 3.32);
      if (Math.hypot(dx, dz) < range) contained = false;
    }
  }
  check(contained, 'no bulb range reaches a foreign stairwell');
}

/* ================================================================ state sweep: seasons × time presets */
console.log('→ state sweep (2 seasons × 4 time presets)');
await page.evaluate(() => {
  const g = window.__game;
  g.state.interior = null;
  g.player.teleport(2.5, 40, Math.PI);
  g.player.pitch = 0.03;
});
const combos = await page.evaluate(() => ({ seasons: ['winter', 'autumn'], times: ['afternoon', 'sunset', 'dusk', 'night'] }));
const errorsBeforeSweep = errors.length;
for (const season of combos.seasons) {
  for (const time of combos.times) {
    await page.evaluate(
      ({ season, time }) => {
        const g = window.__game;
        g.settings.season = season;
        g.env.setSeason(season);
        g.player.setFootprintStyle(g.player.surface, season);
        g.env.setTime(time);
      },
      { season, time }
    );
    await wait(2800); // let the cross-fade settle
    if (season === 'autumn' && time === 'sunset') {
      await page.screenshot({ path: `${OUT}/15-playtest.png` });
      console.log('  → screenshot 15-playtest.png (autumn + sunset)');
    }
  }
}
check(errors.length === errorsBeforeSweep, 'state sweep: zero page errors across 8 season×time combos');
// restore the signature look
await page.evaluate(() => {
  const g = window.__game;
  g.settings.season = 'winter';
  g.env.setSeason('winter');
  g.player.setFootprintStyle(g.player.surface, 'winter');
  g.env.setTime('dusk');
});
await wait(1500);

/* ================================================================ pedestrian sanity */
console.log('→ pedestrian sanity (~20 s)');
await page.evaluate(() => {
  const g = window.__game;
  g.player.teleport(7.2, 19.5, 0.08);
});
const pedWatch = await page.evaluate(async () => {
  const g = window.__game;
  const w = g.world;
  const bad = [];
  if (!w.people.validated) bad.push('routes never validated');
  const t0 = performance.now();
  while (performance.now() - t0 < 20000) {
    for (const p of w.people.list) {
      const { x, y, z } = p.position;
      // 0.22 m: the figure's own body radius — collider boxes are conservative
      if (![x, y, z].every(Number.isFinite)) bad.push(`${p.name}: NaN position`);
      else if (w.collides(x, z, 0.22)) bad.push(`${p.name}: inside a collider at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
    for (const puff of w.people.puffs) {
      const s = puff.sprite;
      if (![s.position.x, s.position.y, s.position.z].every(Number.isFinite)) bad.push('vapor: NaN position');
      else if (Math.abs(s.position.x) > 400 || Math.abs(s.position.z) > 400 || s.position.y < -1 || s.position.y > 20) bad.push(`vapor: out of bounds at (${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)})`);
      if (!(s.material.opacity >= 0 && s.material.opacity <= 1)) bad.push(`vapor: opacity ${s.material.opacity}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return [...new Set(bad)];
});
check(pedWatch.length === 0, `pedestrians stay finite and outside colliders for 20 s${pedWatch.length ? ' — ' + pedWatch.slice(0, 4).join('; ') : ''}`);

/* ================================================================ performance (indicative only) */
const fps = await page.evaluate(async () => {
  let frames = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    const loop = () => {
      frames++;
      if (performance.now() - start > 3000) resolve();
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  return Math.round((frames * 1000) / (performance.now() - start));
});
console.log(`→ frames per second (software renderer, indicative only, not asserted): ${fps}`);

/* ================================================================ summary */
console.log('→ playtest summary');
if (warnings.length) {
  console.log('  warnings (non-fatal):');
  for (const w of warnings) console.log(`   ${w}`);
}
if (errors.length) {
  console.log('  page errors:');
  for (const e of errors) console.log(`   ${e}`);
}
if (problems.length) {
  console.log(`  FAILED checks (${problems.length}):`);
  for (const p of problems) console.log(`   ✗ ${p}`);
}
check(errors.length === 0, 'zero console/page errors across the whole playtest');
console.log(problems.length === 0 ? '  PLAYTEST GREEN' : '  PLAYTEST RED');

await browser.close();
process.exitCode = problems.length === 0 ? 0 : 1;
