// Scripted bug-hunt playtest: walks the whole district with real key events,
// probes the collider grid against an independent expectation, sweeps every
// interaction, cycles seasons × time presets and watches the pedestrians.
// Regression coverage for the fix/playtest-pass branch lives here.
// Usage: node tools/playtest.mjs [url] [outDir]   (dev server must run)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots';
// CHROME_PATH overrides the default (macOS) browser binary, e.g. on Linux
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
      [-7.0, 174], // up to the north gate (edges.js)
      [7.0, 174],
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
      [-41, -17.8], // round the birch at (-39.2, -16.2)
      [-41, -16],
      [-41, -4],
      [-36, -2.9],
      [-30, -2.9],
      [-29.4, -2.1], // north of the birch at (-28.5, -3.1)
      [-20, -2.1],
      [-15, -5.7], // between the end of the bench at (-12.5, -4) and the notice board at (-11.8, -8), power pole at (-12.6, 0)
      [-11, -5.7],
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
      [37.5, 10], // clear of the birch at (38.5, -3.5)
      [37.5, -8],
      [36, -21],
      [34, -22.8], // B2's courtyard-face path strip
      [26.3, -22.8],
      [26.3, -18.35], // west of the spruce at (27.5, -19.7), then along the kindergarten fence
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
  const { BUILDING_SPECS, EXPANSION_SPECS, WEST_SPECS, SOUTH_SPECS } = await import('/src/world/buildings.js');
  const { SOUTH_WALK_PATHS } = await import('/src/world/south.js');
  const { PARKING_LOT, PARKING_NORTH, WALK_PATHS, NEW_WALK_PATHS } = await import('/src/world/terrain.js');
  const w = window.__game.world;
  const rects = [...BUILDING_SPECS, ...EXPANSION_SPECS, ...WEST_SPECS, ...SOUTH_SPECS].map((s) => ({
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
    { id: 'universam', x: -122, z: 63.5, w: 18, d: 9, pad: 0.2 },
    { id: 'school', x: -50, z: -120, w: 54, d: 14, pad: 0.25 },
    { id: 'garages north', x: -134.2, z: -113, w: 47.6, d: 6, pad: 0.2 },
    { id: 'garages south', x: -134.2, z: -129, w: 47.6, d: 6, pad: 0.2 },
    { id: 'obelisk', x: 80, z: -118, w: 5.4, d: 5.4, pad: 0 },
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
  for (let x = -234; x <= 106; x += 4) {
    for (let z = -194; z <= 178; z += 4) {
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
      // a parked car carries its own (rotated) collider: always explained
      if (c.car) continue;
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
  for (const p of [...WALK_PATHS, ...NEW_WALK_PATHS, ...SOUTH_WALK_PATHS]) {
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
// the prompt follows the game loop, which can run at a few frames per
// second here: wait (up to a limit) for the expected text, not a fixed time
const promptWhen = async (text, timeout = 15000) => {
  await page
    .waitForFunction(
      (t) => {
        const el = document.getElementById('prompt');
        return el.classList.contains('visible') && el.textContent === t;
      },
      { timeout },
      text
    )
    .catch(() => {});
  return promptState();
};

// radio
await page.evaluate(() => {
  const g = window.__game;
  g.player.teleport(11.6, -1.5, 0);
  g.player.pitch = 0;
});
// the collision-grid sweep above can stall the page: wait for frames, not ms
let prompt = await promptWhen('E — turn on the radio');
check(prompt.visible && prompt.text === 'E — turn on the radio', `radio prompt appears ("${prompt.text}")`);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => window.__game.sound.radioOn, { timeout: 15000 }).catch(() => {});
const radioOn = await page.evaluate(() => window.__game.sound.radioOn);
prompt = await promptWhen('E — turn off the radio');
check(radioOn === true, 'radio: KeyE turns the station on');
check(prompt.visible && prompt.text === 'E — turn off the radio', `radio prompt flips ("${prompt.text}")`);
await page.keyboard.press('KeyE');
await page.waitForFunction(() => !window.__game.sound.radioOn, { timeout: 15000 }).catch(() => {});
check((await page.evaluate(() => window.__game.sound.radioOn)) === false, 'radio: KeyE again turns it off');

// the three stairwells, in and back out
const interiorsList = await page.evaluate(() => window.__game.world.interiors.map((i) => ({ id: i.id, doorOut: i.doorOut, doorIn: i.doorIn, outSpawn: i.outSpawn, bounds: i.bounds })));
for (const interior of interiorsList) {
  await page.evaluate((d) => {
    const g = window.__game;
    g.player.teleport(d.x, d.z, 0);
    g.player.pitch = 0;
  }, interior.doorOut);
  prompt = await promptWhen('E — enter the stairwell');
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
  prompt = await promptWhen('E — step outside');
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
  // the interior layer also holds the three shared flat lights: only the bulbs count here
  const flatLights = window.__game.world.flatLights ?? [];
  window.__game.scene.traverse((o) => {
    if (o.isPointLight && (o.layers.mask & 2) && !flatLights.includes(o)) {
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
      // the bench grannies, the slide kid and the balcony smoker sit, climb
      // or lean on furniture that carries colliders, by design
      else if (!p.onFurniture && w.collides(x, z, 0.22)) bad.push(`${p.name}: inside a collider at (${x.toFixed(1)}, ${z.toFixed(1)})`);
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

/* ================================================================ people doing things */
console.log('→ people doing things');
const life = await page.evaluate(() => {
  const g = window.__game;
  const P = g.world.people;
  const find = (name) => P.list.find((p) => p.name === name);
  const resident = find('resident No. 3');
  const kid = find('slide kid');
  const skater = find('skater 1');
  let wentIn = false;
  let cameOut = false;
  let top = 0;
  let slidDown = false;
  let skated = 0;
  let last = skater.position.clone();
  let t = g.state.elapsed;
  for (let i = 0; i < 1800 * 3; i++) {
    t += 0.05;
    P.update(0.05, t, g.player.position, -5);
    if (!resident.root.visible) wentIn = true;
    else if (wentIn) cameOut = true;
    top = Math.max(top, kid.position.y + kid.drop);
    if (top > 2.3 && kid.drop > 0.2 && kid.position.y + kid.drop < 0.3) slidDown = true;
    skated += skater.position.distanceTo(last);
    last.copy(skater.position);
  }
  return { wentIn, cameOut, top, slidDown, skated, names: P.list.map((p) => p.name) };
});
console.log(`  ${life.names.length} figures; slide top ${life.top.toFixed(2)} m, skater covered ${life.skated.toFixed(0)} m in 270 s`);
check(life.wentIn && life.cameOut, 'a resident goes in through the entrance door and comes back out');
check(life.top > 2.3 && life.slidDown, 'the slide kid climbs to the platform and slides down sitting');
check(life.skated > 300, 'the kids keep skating laps on the hockey box');

/* ================================================================ traffic */
// the lanes never cross a static collider, the fleet keeps going round, and
// a driver stops short of someone standing in the lane, then moves on
console.log('→ traffic');
const traffic = await page.evaluate(() => {
  const W = window.__game.world;
  const T = W.traffic;
  if (!T) return null;
  const blocked = [];
  for (const path of Object.values(T.paths)) {
    for (let i = 0; i < path.count; i += 2) {
      const s = Math.sin(path.heading[i]);
      const c = Math.cos(path.heading[i]);
      for (const off of [-1.25, 0, 1.25]) {
        const x = path.x[i] + off * s;
        const z = path.z[i] + off * c;
        const hit = W.colliders.some((r) => !r.car && (x - Math.max(r.minX, Math.min(x, r.maxX))) ** 2 + (z - Math.max(r.minZ, Math.min(z, r.maxZ))) ** 2 < 0.84 ** 2);
        if (hit || W.cars.some((car) => car.distanceTo(x, z) < 0.84)) blocked.push([Number(x.toFixed(1)), Number(z.toFixed(1))]);
      }
    }
  }
  const step = (secs, keepClear) => {
    for (let t = 0; t < secs; t += 0.05) T.update(0.05, { keepClear, lights: 0 });
  };
  const before = T.cars.map((t) => t.s);
  step(60, []);
  const moved = T.cars.map((t, i) => (t.s - before[i] + t.path.length) % t.path.length);
  // stand in the lane 25 m ahead of the first car
  const t0 = T.cars[0];
  const p = t0.path;
  const target = (t0.s + 25) % p.length;
  let j = 0;
  while (j < p.count - 1 && p.s[j + 1] <= target) j++;
  const me = { x: p.x[j], z: p.z[j] };
  let closest = Infinity;
  for (let k = 0; k < 400; k++) {
    step(0.05, [me]);
    closest = Math.min(closest, Math.hypot(t0.car.x - me.x, t0.car.z - me.z));
  }
  const waiting = t0.speed;
  const s0 = t0.s;
  step(10, []);
  return { blocked, moved, closest, waiting, resumed: (t0.s - s0 + p.length) % p.length };
});
if (traffic) {
  console.log(`  moved in 60 s: ${traffic.moved.map((m) => m.toFixed(0)).join(', ')} m; stopped ${traffic.closest.toFixed(2)} m from the player (speed ${traffic.waiting.toFixed(2)}), then went on ${traffic.resumed.toFixed(0)} m`);
  check(traffic.blocked.length === 0, `traffic lanes clear of static colliders and parked cars${traffic.blocked.length ? ' — ' + JSON.stringify(traffic.blocked.slice(0, 6)) : ''}`);
  check(traffic.moved.every((m) => m > 150), 'traffic keeps going round the block');
  check(traffic.closest > 3.5 && traffic.waiting < 0.05 && traffic.resumed > 10, 'a driver stops for the player in the lane and drives on after');
} else {
  check(false, 'world.traffic exists');
}

// walking into the bumper of a car of the traffic: neither must get stuck
// (the player is pushed out of its body, the car moves on once you step aside)
console.log('→ walking into a moving car');
const carBump = await page.evaluate(() => {
  const g = window.__game;
  const W = g.world;
  const P = g.player;
  const keep = { ...P.position };
  const step = (n, keys) => {
    for (let i = 0; i < n; i++) {
      P.keys = { ...keys };
      P.update(0.05);
      W.traffic.update(0.05, { keepClear: [P.position], lights: 0 });
    }
  };
  P.enabled = true;
  step(200, {});
  const out = [];
  for (const car of W.trafficCars.filter((c) => !c.isBus).slice(0, 2)) {
    for (const ahead of [3.5, 9]) {
      P.teleport(car.x + Math.sin(car.heading) * ahead, car.z + Math.cos(car.heading) * ahead, 0);
      let inside = 0;
      for (let i = 0; i < 80; i++) {
        P.yaw = Math.atan2(P.position.x - car.x, P.position.z - car.z);
        step(1, { forward: true });
        if (car.overlapsCircle(P.position.x, P.position.z, 0.3)) inside++;
      }
      const p0 = { x: P.position.x, z: P.position.z };
      P.yaw = car.heading + Math.PI / 2;
      step(40, { forward: true });
      const walked = Math.hypot(P.position.x - p0.x, P.position.z - p0.z);
      const c0 = { x: car.x, z: car.z };
      step(60, {});
      out.push({ ahead, inside, walked: Number(walked.toFixed(2)), carMoved: Number(Math.hypot(car.x - c0.x, car.z - c0.z).toFixed(2)) });
    }
  }
  P.keys = {};
  P.teleport(keep.x, keep.z, 0);
  return out;
});
console.log('  ' + carBump.map((r) => `from ${r.ahead} m: ${r.inside} steps inside, walked off ${r.walked} m, car on ${r.carMoved} m`).join('; '));
check(carBump.length > 0 && carBump.every((r) => r.inside === 0), 'walking into a car of the traffic never leaves you inside its body');
check(carBump.length > 0 && carBump.every((r) => r.walked > 1 && r.carMoved > 2), 'you walk off and the car drives on: no deadlock at the bumper');

// the bus: calls at the stop (pulls over, doors open and shut, drives on)
// and its long body never sweeps over a static collider on the way round
console.log('→ bus');
const bus = await page.evaluate(() => {
  const W = window.__game.world;
  const T = W.traffic;
  const bt = T?.cars.find((t) => t.bus);
  if (!bt) return null;
  const b = bt.car;
  const stop = W.points.busStop;
  let called = null;
  let maxDoors = 0;
  let hiss = 0;
  let left = false;
  const hits = [];
  // a whole call from its start: the bus may be halfway through one already
  let prev = bt.bus.state;
  for (let i = 0; i < 20 * 260 && !left; i++) {
    T.update(0.05, { lights: 0 });
    // (the calls at the far stops of the route are not this one)
    const atAvenue = Math.hypot(b.x - 4.5, b.z - (stop?.z ?? 24) - 2) < 8;
    const fresh = bt.bus.state === 'dwell' && prev !== 'dwell' && atAvenue;
    prev = bt.bus.state;
    if (fresh && !called) hiss = 0;
    if (b.hiss) {
      hiss++;
      b.hiss = false;
    }
    if (fresh) called = { x: b.x, z: b.z, heading: b.heading };
    if (called && bt.bus.state === 'dwell') {
      maxDoors = Math.max(maxDoors, b.doors);
    }
    if (called && bt.bus.state === 'run') left = true;
    if (i % 4) continue;
    const s = Math.sin(b.heading);
    const c = Math.cos(b.heading);
    for (let k = -5.2; k <= 5.2; k += 0.65) {
      for (const sx of [-1.25, 0, 1.25]) {
        const x = b.x + sx * c + k * s;
        const z = b.z - sx * s + k * c;
        if (W.colliders.some((r) => !r.car && !r.buildOnly && x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ)) hits.push([Number(x.toFixed(1)), Number(z.toFixed(1))]);
      }
    }
  }
  return { called, maxDoors, hiss, left, doorsAfter: b.doors, hits, stop: stop && { x: stop.x, z: stop.z } };
});
if (bus) {
  const c = bus.called;
  console.log(`  called at ${c ? `(${c.x.toFixed(2)}, ${c.z.toFixed(2)})` : '—'} by the stop at (${bus.stop?.x}, ${bus.stop?.z}); doors ${bus.maxDoors.toFixed(2)} → ${bus.doorsAfter.toFixed(2)}, ${bus.hiss} hisses, drove on: ${bus.left}`);
  check(!!c && Math.abs(c.z - bus.stop.z) < 4 && c.x > 4 && c.x < 5.2, 'the bus pulls over at the bus stop');
  check(bus.maxDoors > 0.99 && bus.doorsAfter === 0 && bus.hiss === 2, 'the bus opens its doors at the stop and shuts them');
  check(bus.left, 'the bus drives on after its call');
  check(bus.hits.length === 0, `the bus body stays clear of static colliders${bus.hits.length ? ' — ' + JSON.stringify(bus.hits.slice(0, 6)) : ''}`);
} else {
  check(false, 'the bus runs with the traffic');
}

// riding the bus: on at the avenue stop by an open door, along to the next
// stop in the seat, off on the kerb there
console.log('→ bus ride');
const ride = await page.evaluate(() => {
  const g = window.__game;
  const T = g.world.traffic;
  const R = g.busRide;
  const b = g.world.bus;
  const P = g.player;
  if (!T || !R || !b) return null;
  const keep = { x: P.position.x, z: P.position.z };
  // the bus at the avenue with its doors open
  for (let i = 0; i < 20000; i++) {
    T.update(0.05, { lights: 0 });
    const st = T.busState();
    if (st.state === 'dwell' && st.stop.name === T.stops[0].name && b.doors > 0.95) break;
  }
  const door = b.toWorld(new P.position.constructor(-2.0, 0, -0.3));
  P.teleport(door.x, door.z, 0);
  const near = R.distanceTo(P.position.x, P.position.z);
  const shut = (() => {
    // nobody gets on away from a stop: the doors are shut
    const doors = b.doors;
    b.doors = 0;
    const d = R.distanceTo(P.position.x, P.position.z);
    b.doors = doors;
    return Number.isFinite(d) ? d : -1;
  })();
  const on = R.board();
  let offEarly = null;
  let seatInBus = true;
  let next = null;
  let off = null;
  for (let i = 0; i < 20000 && !off; i++) {
    T.update(0.05, { lights: 0 });
    R.update();
    if (i % 40 === 0) seatInBus &&= b.distanceTo(P.position.x, P.position.z) === 0 && R.active;
    const st = T.busState();
    if (st.state === 'run') {
      next = st.stop.name;
      // under way: E does nothing
      if (offEarly === null && b.speed > 3) offEarly = R.getOff();
    }
    if (st.state === 'dwell' && st.stop.name !== T.stops[0].name && R.open) {
      const prompt = R.prompt;
      const ok = R.getOff();
      off = { stop: st.stop.name, prompt, ok, free: !g.world.collides(P.position.x, P.position.z, 0.3), outside: b.distanceTo(P.position.x, P.position.z) > 0.3, enabled: P.enabled };
    }
  }
  P.teleport(keep.x, keep.z, 0);
  return { near, shut, on, offEarly, seatInBus, next, off, stops: T.stops.map((s) => s.name) };
});
if (ride) {
  console.log(`  stops ${ride.stops.join(' → ')}; by the door ${ride.near.toFixed(2)} m (doors shut: ${ride.shut}); on: ${ride.on}, off before the next stop: ${ride.offEarly}; next stop "${ride.next}"; off at ${JSON.stringify(ride.off)}`);
  check(ride.stops.length >= 3, 'the bus calls at three stops round its route');
  check(ride.on && ride.near < 1 && ride.shut === -1, 'E by an open door at a stop gets you on (and not with the doors shut)');
  check(ride.offEarly === false && ride.seatInBus, 'you ride in your seat inside the bus, and cannot get off between stops');
  check(!!ride.off?.ok && ride.off.free && ride.off.outside && ride.off.enabled && ride.off.prompt?.includes('get off') && ride.off.stop === ride.next, 'at the next stop E gets you off on the kerb, free to walk');
} else {
  check(false, 'the bus can be ridden');
}

/* ========================================================== steppe highway */
// the cross street goes out through a gate in the east fence and on as a
// trunk road into the steppe: a car driven along it reaches the roundabout
// at the far end, faster than in town, and cannot leave the road
console.log('→ steppe highway');
const highway = await page.evaluate(async () => {
  const { HIGHWAY, highwayDistance } = await import('/src/world/highway.js');
  const g = window.__game;
  const w = g.world;
  const L = HIGHWAY.line;
  const mid = HIGHWAY.at(L.length / 2, 1.9);
  const walls = {
    gate: !w.collides(105, 44, 0.4),
    fence: w.collides(104, 30, 0.4),
    road: !w.collides(mid.x, mid.z, 0.4) && w.surfaceAt(mid.x, mid.z) === 'asphalt',
    field: w.collides(mid.x - mid.tz * 14, mid.z + mid.tx * 14, 0.4),
    station: !w.collides((HIGHWAY.pad.x0 + HIGHWAY.pad.x1) / 2 - 12, (HIGHWAY.pad.z0 + HIGHWAY.pad.z1) / 2 + 9, 0.4),
  };
  const car = w.cars[0];
  const keep = { x: car.x, z: car.z, heading: car.heading, px: g.player.position.x, pz: g.player.position.z };
  car.x = 92;
  car.z = 46.5;
  car.heading = Math.PI / 2;
  car.vx = car.vz = car.speed = 0;
  car.updateCollider();
  g.driving.enter(car);
  // an autopilot: the nearest point of the road, aim 18 m on in the right lane
  let top = 0;
  let worst = 0;
  let s = 0;
  let t = 0;
  for (; t < 200 && s < L.length - 30; t += 0.05) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < L.n; i += 2) {
      const d = (L.x[i] - car.x) ** 2 + (L.z[i] - car.z) ** 2;
      if (d < bd) [bd, best] = [d, i];
    }
    s = L.s[best];
    const aim = HIGHWAY.at(s + 18, 1.9);
    let dh = Math.atan2(aim.x - car.x, aim.z - car.z) - car.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    g.driving.update(0.05, { forward: true, left: dh > 0.03, right: dh < -0.03 });
    top = Math.max(top, car.speed);
    if (car.x > 120) worst = Math.max(worst, highwayDistance(car.x, car.z));
  }
  const reached = s >= L.length - 30;
  const time = t;
  // and straight off the road into the field: the verge stops it
  const p = HIGHWAY.at(L.length / 3, 2);
  car.x = p.x;
  car.z = p.z;
  car.heading = p.heading + 1.2;
  car.vx = car.vz = car.speed = 0;
  for (let k = 0; k < 200; k++) g.driving.update(0.05, { forward: true });
  const verge = highwayDistance(car.x, car.z);
  // put the car back where it was parked
  car.vx = car.vz = car.speed = 0;
  g.driving.exit();
  car.x = keep.x;
  car.z = keep.z;
  car.heading = keep.heading;
  car.updateCollider();
  g.player.teleport(keep.px, keep.pz, 0);
  return { walls, reached, time, topKmh: top * 3.6, worst, verge, out: !g.driving.active };
});
console.log(`  ${JSON.stringify(highway.walls)}; to the roundabout: ${highway.reached} in ${highway.time.toFixed(0)} s, top ${highway.topKmh.toFixed(0)} km/h, at most ${highway.worst.toFixed(1)} m off the centre line; off the road it stops ${highway.verge.toFixed(1)} m out`);
check(Object.values(highway.walls).every(Boolean), 'the gate in the east fence is open, the steppe off the road is not');
check(highway.reached && highway.topKmh > 95 && highway.worst < 6, 'a car driven out along the highway reaches the roundabout at the far end, at highway speed');
check(highway.verge < 7.2 && highway.out, 'driving off the road, the car stops at the verge');

/* ========================================================== private sector */
// ул. Таёжная turns off the highway into the private sector: you can walk
// or drive up the lane, through a gate into a yard, but not through the
// houses, the fences or out into the steppe behind them
console.log('→ private sector');
const sector = await page.evaluate(async () => {
  const { EAST } = await import('/src/world/east.js');
  const g = window.__game;
  const w = g.world;
  const P = EAST.plots[0];
  const local = (x, z) => {
    const v = new g.camera.position.constructor(x, 0, z).applyMatrix4(P.matrix);
    return [v.x, v.z];
  };
  const free = (x, z) => !w.collides(x, z, 0.4);
  const walls = {
    mouth: free(EAST.laneX, 62),
    lane: free(EAST.laneX, 150) && free(150, EAST.laneZ),
    gate: free(...local(P.gx, 0.3)),
    yard: free(...local(P.gx, 4)),
    house: !free(...local(P.hx, 5.7)),
    picket: !free(...local(P.gx + 3, 0.3)),
    field: !free(EAST.laneX - 8, 66),
    behind: !free(EAST.sector.x1 + 3, 120),
  };
  // drive in from the highway up the lane
  const car = w.cars[0];
  const keep = { x: car.x, z: car.z, heading: car.heading, px: g.player.position.x, pz: g.player.position.z };
  car.x = EAST.laneX + 1.4;
  car.z = 50.5;
  car.heading = 0;
  car.vx = car.vz = car.speed = 0;
  car.updateCollider();
  g.driving.enter(car);
  let off = 0;
  for (let t = 0; t < 14 && car.z < 112; t += 0.05) {
    let dh = Math.atan2(EAST.laneX + 1.4 - car.x, 12) - car.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    g.driving.update(0.05, { forward: car.speed < 9, left: dh > 0.03, right: dh < -0.03 });
    if (car.z > 76) off = Math.max(off, Math.abs(car.x - EAST.laneX));
  }
  const reached = car.z;
  car.vx = car.vz = car.speed = 0;
  g.driving.exit();
  car.x = keep.x;
  car.z = keep.z;
  car.heading = keep.heading;
  car.updateCollider();
  g.player.teleport(keep.px, keep.pz, 0);
  return { walls, reached, off, zone: w.zoneAt(EAST.laneX, 120)?.name, lamps: w.lamps.length };
});
console.log(`  ${JSON.stringify(sector.walls)}; driven up the lane to z ${sector.reached.toFixed(0)}, at most ${sector.off.toFixed(1)} m off its middle; zone ${sector.zone}`);
check(Object.values(sector.walls).every(Boolean), 'the private sector: the lane and the yards are open, houses, fences and the steppe behind are not');
check(sector.reached > 110 && sector.off < 2.5 && sector.zone === 'Частный сектор', 'a car turns off the highway and drives up ул. Таёжная');

// the district's edges: each street that meets the fence ends at a shut
// gate; Zavodskaya alone runs on through it into ул. Кедровая
console.log('→ world edges');
const edges = await page.evaluate(async () => {
  const { EDGE_GATES } = await import('/src/world/edges.js');
  const { EAST } = await import('/src/world/east.js');
  const w = window.__game.world;
  const free = (x, z) => !w.collides(x, z, 0.4);
  const shut = EDGE_GATES.filter((g) => free(g.x, g.z)).map((g) => g.name);
  let open = true;
  for (let x = 96; x <= 116; x += 0.5) open &&= free(x, EAST.laneZ);
  const fence = !free(104, EAST.laneZ - 6) && !free(104, EAST.laneZ + 6);
  return { gates: EDGE_GATES.length, shut, open, fence };
});
console.log(`  ${edges.gates} gates, open: ${JSON.stringify(edges.shut)}; Zavodskaya to Кедровая ${edges.open ? 'walkable' : 'blocked'}, fence beside it ${edges.fence ? 'up' : 'down'}`);
check(edges.gates >= 5 && edges.shut.length === 0, 'every street that meets the boundary fence ends at a shut gate');
check(edges.open && edges.fence, 'Zavodskaya runs on through the fence into ул. Кедровая, and the fence either side still stands');

// the sea port at the end of the highway: the spur, the apron and the
// breakwater are open ground, the sea, the warehouses and the fence are not,
// and a car drives up the spur through the gate
console.log('→ sea port');
const port = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const { spur, yard, mole } = w.port;
  const free = (x, z) => !w.collides(x, z, 0.4);
  const walls = {
    spur: free(spur.x, 150),
    gate: free(spur.x, yard.z0),
    apron: free(spur.x, 340),
    quay: free(2240, yard.z1 - 0.9),
    mole: free((mole.x0 + mole.x1) / 2, 440),
    sea: !free(2240, yard.z1 + 3),
    fence: !free(yard.x0 - 1, 340) && !free(spur.x - 12, yard.z0),
    shed: !free(yard.x0 + 30, 323),
    field: !free(spur.x + 20, 200),
  };
  const car = w.cars[0];
  const keep = { x: car.x, z: car.z, heading: car.heading, px: g.player.position.x, pz: g.player.position.z };
  car.x = spur.x - 1.9;
  car.z = 100;
  car.heading = 0;
  car.vx = car.vz = car.speed = 0;
  car.updateCollider();
  g.driving.enter(car);
  let off = 0;
  for (let t = 0; t < 30 && car.z < yard.z0 + 12; t += 0.05) {
    let dh = Math.atan2(spur.x - 1.9 - car.x, 12) - car.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    g.driving.update(0.05, { forward: car.speed < 12, left: dh > 0.03, right: dh < -0.03 });
    off = Math.max(off, Math.abs(car.x - spur.x));
  }
  const reached = car.z;
  car.vx = car.vz = car.speed = 0;
  g.driving.exit();
  car.x = keep.x;
  car.z = keep.z;
  car.heading = keep.heading;
  car.updateCollider();
  g.player.teleport(keep.px, keep.pz, 0);
  return { walls, reached, off, zone: w.zoneAt(2300, 360)?.name, cranes: w.port.cranes.length };
});
console.log(`  ${JSON.stringify(port.walls)}; driven up the spur to z ${port.reached.toFixed(0)}, at most ${port.off.toFixed(1)} m off its middle; zone ${port.zone}, ${port.cranes} cranes`);
check(Object.values(port.walls).every(Boolean), 'the sea port: spur, apron, quay and breakwater are open; the sea, the fence, the warehouses and the fields are not');
check(port.reached > 305 && port.off < 3.5 && port.zone === 'Морской порт' && port.cranes === 3, 'a car drives from the roundabout up the spur through the port gate');

// the chained yard dogs: up to the end of the chain barking at someone in
// the lane, never past the chain or through a fence, then back to lie down
console.log('→ yard dogs');
const yard = await page.evaluate(() => {
  const w = window.__game.world;
  const out = [];
  for (const dog of w.yardDogs ?? []) {
    const home = { x: dog.position.x, z: dog.position.z };
    // someone stands in the lane, 6 m out in front of the stake
    const dx = Math.sin(dog.home.yaw);
    const dz = Math.cos(dog.home.yaw);
    const who = { x: dog.stake.x + dx * 6.5, z: dog.stake.z + dz * 6.5 };
    let barks = 0;
    let far = 0;
    let blocked = 0;
    let closest = Infinity;
    for (let t = 0; t < 6; t += 1 / 30) {
      dog.update(1 / 30, [who]);
      if (dog.voice) barks++;
      dog.voice = null;
      far = Math.max(far, Math.hypot(dog.position.x - dog.stake.x, dog.position.z - dog.stake.z));
      if (w.collides(dog.position.x, dog.position.z, 0.2)) blocked++;
      closest = Math.min(closest, Math.hypot(dog.position.x - who.x, dog.position.z - who.z));
    }
    const state = dog.state;
    for (let t = 0; t < 14; t += 1 / 30) dog.update(1 / 30, []);
    out.push({ barks, far, blocked, closest, state, back: Math.hypot(dog.position.x - home.x, dog.position.z - home.z), rest: dog.state });
  }
  return out;
});
console.log(`  ${yard.map((d) => `${d.barks} barks, ${d.far.toFixed(1)} m out, ${d.closest.toFixed(1)} m from them, back ${d.back.toFixed(2)} m (${d.rest})`).join('; ')}`);
check(yard.length === 4 && yard.every((d) => d.barks >= 3 && d.state === 'alert' && d.closest < 4.5), 'the yard dogs run out on their chains and bark at someone in the lane');
check(yard.every((d) => d.far <= 4.2 && d.blocked === 0 && d.back < 0.3 && d.rest === 'rest'), 'a yard dog stays on its chain and inside its fence, then goes back to lie down');

/* ================================================================ snowballs */
// a snowball thrown at a wall leaves a splat on its face, one thrown at a
// passer-by makes them flinch, one lobbed up comes down on the ground
console.log('→ snowballs');
const snow = await page.evaluate(() => {
  const g = window.__game;
  const S = g.snowballs;
  if (!S) return null;
  const V = g.camera.position.constructor;
  const fly = () => {
    for (let i = 0; i < 600 && S.balls.some((b) => b.alive); i++) S.update(1 / 60);
    return S.hits.at(-1);
  };
  const throwAt = (from, dir) => {
    S.cooldown = 0;
    return S.throw(new V(...from), new V(...dir).normalize()) ? fly() : null;
  };
  // B1's courtyard face (z = -46), from the path in front of it
  const wall = throwAt([-30, 1.6, -36], [0, 0.12, -1]);
  const splat = S.splats.find((sp) => sp.mesh.visible && Math.abs(sp.mesh.position.z - wall.z) < 0.05);
  const ground = throwAt([7.2, 1.6, 19.5], [0, 0.3, 1]);
  // a passer-by out walking, from 6 m away
  const p = g.world.people.list.find((q) => !q.idle && q.root.visible && !q.onFurniture);
  const pp = p.position;
  const person = throwAt([pp.x + 6, pp.y + 1.3, pp.z], [-1, 0.02, 0]);
  const flinch = p.flinch;
  // a second throw straight away waits for the hand to be ready
  S.cooldown = 0;
  S.throw(new V(0, 2, 0), new V(0, 0, 1));
  const again = S.throw(new V(0, 2, 0), new V(0, 0, 1));
  fly();
  return { wall, splat: !!splat, ground, person, flinch, again };
});
if (snow) {
  console.log(`  wall: ${snow.wall?.kind} at z ${snow.wall?.z.toFixed(2)} n=(${snow.wall?.nx.toFixed(2)}, ${snow.wall?.nz.toFixed(2)}); ground: ${snow.ground?.kind}; person: ${snow.person?.kind} (flinch ${snow.flinch.toFixed(2)})`);
  check(snow.wall?.kind === 'wall' && Math.abs(snow.wall.z + 46) < 0.3 && snow.wall.nz > 0.9 && snow.splat, 'a snowball splats on the face of a wall');
  check(snow.ground?.kind === 'ground' && snow.ground.ny > 0.9, 'a snowball lobbed up lands on the ground');
  check(snow.person?.kind === 'person' && snow.flinch > 0.5, 'a passer-by hit by a snowball flinches');
  check(snow.again === false, 'throws are paced (one at a time from the hand)');
} else {
  check(false, 'snowballs exist');
}

/* ================================================================ dog */
// the stray on the obelisk square: wanders and sniffs about at home,
// tags along with the player, runs after a snowball, bolts when hit, and
// the drivers stop for it
console.log('→ dog');
const dog = await page.evaluate(() => {
  const g = window.__game;
  const D = g.world.dog;
  if (!D) return null;
  const run = (secs, opts = {}) => {
    const states = new Set();
    for (let t = 0; t < secs; t += 0.05) {
      D.update(0.05, { player: null, cars: [], ...opts });
      states.add(D.state);
    }
    return states;
  };
  const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // a minute on its own
  const states = run(60);
  const home = { x: D.position.x, z: D.position.z };
  const homeFree = !g.world.collides(home.x, home.z, 0.25);
  // the player comes up and walks off north along the avenue
  const pl = { x: D.position.x + 6, z: D.position.z };
  run(3, { player: pl });
  const noticed = D.state;
  for (const [x, z] of [[-8, 0], [-8, 20]]) {
    for (let k = 0; k < 160; k++) {
      pl.x += (x - pl.x) * 0.03;
      pl.z += (z - pl.z) * 0.03;
      D.update(0.05, { player: pl, cars: [] });
    }
  }
  const followGap = near(pl, D.position);
  const followFree = !g.world.collides(D.position.x, D.position.z, 0.25);
  // a snowball lands 5 m away
  D.state = 'idle';
  D.cooldown = 60;
  D.voice = null;
  const ball = { x: D.position.x + 4, z: D.position.z + 3 };
  D.snowball(ball.x, ball.z, false);
  const chasing = D.state;
  const before = near(ball, D.position);
  run(3);
  const after = near(ball, D.position);
  // hit by one thrown from 3 m to the west
  const from = { x: D.position.x - 3, z: D.position.z };
  D.snowball(from.x, from.z, true);
  const yelp = D.voice?.kind;
  const hitState = D.state;
  const d0 = near(from, D.position);
  run(2);
  const d1 = near(from, D.position);
  // stood in the lane ahead of a moving car: the driver stops
  const moving = () => g.world.trafficCars.find((c) => !c.isBus && c.speed > 4);
  for (let i = 0; i < 1200 && !moving(); i++) g.world.traffic.update(0.05, { keepClear: [], lights: 0 });
  const car = moving();
  let carStopped = null;
  if (car) {
    D.state = 'idle';
    D.timer = 99;
    D.position.set(car.x + Math.sin(car.heading) * 9, 0, car.z + Math.cos(car.heading) * 9);
    for (let i = 0; i < 80; i++) g.world.traffic.update(0.05, { keepClear: [], lights: 0 });
    carStopped = { speed: car.speed, gap: near(car, D.position) };
  }
  D.position.set(home.x, 0, home.z);
  D.state = 'idle';
  D.timer = 2;
  return { states: [...states], home, homeFree, noticed, followGap, followFree, chasing, before, after, yelp, hitState, d0, d1, carStopped };
});
if (dog) {
  console.log(`  alone: ${dog.states.join('/')}, at (${dog.home.x.toFixed(1)}, ${dog.home.z.toFixed(1)}); following ${dog.followGap.toFixed(1)} m behind; snowball ${dog.before.toFixed(1)} → ${dog.after.toFixed(1)} m; hit: ${dog.yelp}, ${dog.d0.toFixed(1)} → ${dog.d1.toFixed(1)} m away; car ${dog.carStopped ? `${dog.carStopped.speed.toFixed(2)} m/s at ${dog.carStopped.gap.toFixed(1)} m` : 'none'}`);
  check(dog.states.length >= 2 && dog.homeFree && dog.home.x > -32 && dog.home.x < -5 && dog.home.z > -14 && dog.home.z < 18, 'the dog wanders about its square, clear of everything');
  check(dog.noticed === 'follow' && dog.followGap < 6 && dog.followFree, 'the dog tags along with the player');
  check(dog.chasing === 'chase' && dog.after < dog.before - 2, 'the dog runs after a snowball');
  check(dog.yelp === 'yelp' && dog.hitState === 'flee' && dog.d1 > dog.d0 + 3, 'a dog hit by a snowball yelps and bolts');
  check(dog.carStopped && dog.carStopped.speed < 0.5 && dog.carStopped.gap > 1, 'drivers stop for the dog');
} else {
  check(false, 'the dog exists');
}

/* ================================================================ pigeons */
// two flocks peck about on the ground; whoever comes too close (or a
// snowball) sends them up, they wheel round and land again once it is quiet
console.log('→ pigeons');
const pig = await page.evaluate(() => {
  const g = window.__game;
  const P = g.world.pigeons;
  if (!P) return null;
  const D = g.world.dog;
  const dogAt = D.position.clone();
  const keepDogAway = () => D.position.set(-25, 0, 12);
  const run = (secs, opts = {}) => {
    for (let t = 0; t < secs; t += 0.05) {
      keepDogAway();
      P.update(0.05, opts);
    }
  };
  // land everyone, then let them potter about
  for (const f of P.flocks) {
    if (f.state !== 'ground') {
      f.state = 'landing';
      for (const b of f.birds) b.target = P.spot(f, b);
    }
  }
  run(30);
  const all = P.flocks.flatMap((f) => f.birds);
  const settled = P.flocks.every((f) => f.state === 'ground');
  const blocked = all.filter((b) => g.world.collides(b.pos.x, b.pos.z, 0.08)).length;
  const onGround = all.every((b) => Math.abs(b.pos.y - g.world.heightAt(b.pos.x, b.pos.z)) < 0.05);
  // the player walks up to the kiosk flock
  const f = P.flocks[0];
  P.voice.length = 0;
  const pl = { x: f.x + 5, z: f.z };
  run(0.3, { player: pl });
  const fled = f.state;
  const flutter = P.voice.some((v) => v.kind === 'flutter');
  run(5, { player: pl });
  const height = Math.min(...f.birds.map((b) => b.pos.y));
  // the player moves on: they come back down
  let back = null;
  for (let t = 0; t < 60 && back === null; t += 0.5) {
    run(0.5, {});
    if (f.state === 'ground') back = t;
  }
  // a snowball landing among the other flock
  const f2 = P.flocks[1];
  const b0 = f2.birds[0].pos;
  g.snowballs.cooldown = 0;
  const V = b0.constructor;
  g.snowballs.throw(new V(b0.x - 4, 1.4, b0.z), new V(1, -0.33, 0).normalize());
  for (let i = 0; i < 200 && g.snowballs.balls.some((b) => b.alive); i++) g.snowballs.update(1 / 60);
  const snowFled = `${f2.state} (${g.snowballs.hits.at(-1)?.kind} ${Math.hypot(g.snowballs.hits.at(-1).x - b0.x, g.snowballs.hits.at(-1).z - b0.z).toFixed(1)} m off)`;
  D.position.copy(dogAt);
  return { settled, blocked, onGround, count: all.length, fled, flutter, height, back, snowFled };
});
if (pig) {
  console.log(`  ${pig.count} birds, ${pig.blocked} in a collider; player near → ${pig.fled} (${pig.flutter ? 'flutter' : 'silent'}), lowest ${pig.height.toFixed(1)} m after 5 s, back down after ${pig.back} s; snowball → ${pig.snowFled}`);
  check(pig.settled && pig.blocked === 0 && pig.onGround, 'the pigeons peck about on open ground');
  check(pig.fled !== 'ground' && pig.flutter && pig.height > 3, 'pigeons clatter up when the player comes near');
  check(pig.back !== null, 'the pigeons land again once the player has gone');
  check(!pig.snowFled.startsWith('ground'), 'a snowball sends the pigeons up');
} else {
  check(false, 'the pigeons exist');
}

/* ================================================================ map */
// M opens the district map outdoors with a red arrow where you stand, and
// shuts it again; indoors it stays shut
console.log('→ map');
const mapR = await page.evaluate(() => {
  const g = window.__game;
  if (!g.map) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  g.player.teleport(-18, -30, 0);
  g.camera.position.copy(g.player.position);
  g.camera.updateMatrixWorld();
  const opened = g.toggleMap(true);
  g.map.update(g.player.position);
  // the arrow: red where the player stands on the paper
  const [sx, sy] = g.map.px(g.player.position.x, g.player.position.z);
  const px = g.map.canvas.getContext('2d').getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
  const red = px[0] > 150 && px[1] < 90 && px[2] < 90;
  const shown = getComputedStyle(g.map.el).opacity !== '0' || g.map.el.classList.contains('open');
  const closed = g.toggleMap() === false;
  g.state.interior = g.world.interiors[0];
  const indoors = g.toggleMap(true);
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { opened, red, shown, closed, indoors, size: [g.map.w, g.map.h] };
});
if (mapR) {
  console.log(`  ${mapR.size.join('×')} px paper; opened ${mapR.opened}, arrow ${mapR.red ? 'red' : 'missing'}, closed ${mapR.closed}, indoors ${mapR.indoors}`);
  check(mapR.opened && mapR.shown && mapR.red, 'M opens the district map with the player marked');
  check(mapR.closed && mapR.indoors === false, 'M shuts the map again, and it stays shut indoors');
} else {
  check(false, 'the district map exists');
}

/* ================================================================ photo */
// P swaps the HUD for a viewfinder; the wheel zooms; a shot prints the frame
// (vignette, date stamp) as a PNG; P again gives the HUD and the lens back
console.log('→ photo');
const photoR = await page.evaluate(async () => {
  const g = window.__game;
  if (!g.photo) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const fov0 = g.player.fovBase;
  const on = g.togglePhoto(true);
  const hudHidden = document.body.classList.contains('photo-mode') && getComputedStyle(document.getElementById('photo')).display !== 'none';
  g.photo.zoom(-600);
  const zoomed = g.player.fovBase;
  g.photo.last = null;
  g.photo.shoot();
  for (let i = 0; i < 300 && !g.photo.last; i++) await new Promise((r) => setTimeout(r, 100));
  const blob = g.photo.last;
  let size = null;
  if (blob) {
    const img = await createImageBitmap(blob);
    size = [img.width, img.height];
  }
  const off = g.togglePhoto(false);
  const hudBack = !document.body.classList.contains('photo-mode') && getComputedStyle(document.getElementById('photo')).display === 'none';
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { on, hudHidden, fov0, zoomed, fovAfter: g.player.fovBase, bytes: blob?.size ?? 0, size, canvas: [g.renderer.domElement.width, g.renderer.domElement.height], off, hudBack };
});
if (photoR) {
  console.log(`  fov ${photoR.fov0.toFixed(1)} → ${photoR.zoomed.toFixed(1)} → ${photoR.fovAfter.toFixed(1)}; print ${photoR.size?.join('×')} (${photoR.bytes} bytes, canvas ${photoR.canvas.join('×')})`);
  check(photoR.on && photoR.hudHidden && photoR.zoomed < photoR.fov0 - 5, 'P opens the viewfinder and the wheel zooms in');
  check(photoR.bytes > 20000 && photoR.size?.[0] === photoR.canvas[0] && photoR.size?.[1] === photoR.canvas[1], 'a shot prints the full frame as a PNG');
  check(photoR.off === false && photoR.hudBack && Math.abs(photoR.fovAfter - photoR.fov0) < 0.01, 'P again gives the HUD and the lens back');
} else {
  check(false, 'photo mode exists');
}

/* ================================================================ icicles */
// icicles hang under the eaves and the entrance canopies in winter only,
// and never low enough to brush a head
console.log('→ icicles');
const ice = await page.evaluate(() => {
  const g = window.__game;
  const I = g.world.icicles;
  if (!I) return null;
  const M = new g.camera.matrixWorld.constructor();
  let lowest = Infinity;
  for (const mesh of I.meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, M);
      const e = M.elements;
      // tip: the base minus the (scaled) length
      lowest = Math.min(lowest, e[13] - Math.hypot(e[4], e[5], e[6]));
    }
  }
  const was = g.world.season;
  g.env.setSeason('autumn');
  const autumn = I.meshes.some((m) => m.visible);
  g.env.setSeason('winter');
  const winter = I.meshes.every((m) => m.visible);
  g.env.setSeason(was);
  return { count: I.count, blocks: I.meshes.length, lowest, autumn, winter };
});
if (ice) {
  console.log(`  ${ice.count} icicles on ${ice.blocks} blocks, lowest tip ${ice.lowest.toFixed(2)} m`);
  check(ice.count > 2000 && ice.winter && !ice.autumn, 'icicles hang in winter and are gone in autumn');
  check(ice.lowest > 1.95, 'no icicle hangs low enough to brush a head');
} else {
  check(false, 'the icicles exist');
}

/* ================================================================ snowmen */
// looking down at open snow in winter, E rolls a snowman; it blocks the
// way, takes snowballs, only five stand at a time, and a thaw takes them
console.log('→ snowmen');
const sman = await page.evaluate(() => {
  const g = window.__game;
  const S = g.snowmen;
  if (!S) return null;
  const was = { mode: g.state.mode, interior: g.state.interior, pitch: g.player.pitch };
  const colliders0 = g.world.colliders.length;
  g.state.mode = 'playing';
  g.state.interior = null;
  // spots in the courtyard of building 12, facing north (+z), where one is offered
  const it = g.world.interactables.find((i) => i.id === 'snowman');
  const spots = [];
  for (let x = -60; x <= -14 && spots.length < 6; x += 2.5) {
    for (let z = -42; z <= -8 && spots.length < 6; z += 2.5) {
      g.player.teleport(x, z, Math.PI);
      g.player.pitch = -0.6;
      if (it.distanceTo() < it.radius) {
        spots.push([x, z]);
        x += 2.5;
      }
    }
  }
  const [sx, sz] = spots[0];
  g.player.teleport(sx, sz, Math.PI);
  g.player.pitch = 0;
  const levelOffer = it.distanceTo() < it.radius;
  g.player.pitch = -0.6;
  const offer = it.distanceTo() < it.radius ? it.prompt() : null;
  it.onUse();
  const man = S.list.at(-1);
  for (let i = 0; i < 70; i++) S.update(0.05);
  const done = man?.done;
  const blocks = g.world.collides(man.x, man.z, 0.2);
  // a snowball thrown at it from 4 m
  const B = g.snowballs;
  const V = g.camera.position.constructor;
  B.cooldown = 0;
  B.throw(new V(man.x, 1.0, man.z - 4), new V(0, -0.05, 1).normalize());
  for (let i = 0; i < 300 && B.balls.some((b) => b.alive); i++) B.update(1 / 60);
  const hit = B.hits.at(-1);
  const hitIt = Math.hypot(hit.x - man.x, hit.z - man.z) < 0.6 && hit.y > 0.3;
  // more than five: the oldest goes
  for (const [x, z] of spots.slice(1)) {
    g.player.teleport(x, z, Math.PI);
    it.onUse();
  }
  const standing = S.list.length;
  const firstGone = !S.list.includes(man) && !g.world.colliders.includes(man.rect);
  // a thaw
  g.env.setSeason('autumn');
  S.update(0.05);
  const thaw = S.list.length;
  g.env.setSeason('winter');
  const collidersAfter = g.world.colliders.length;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  g.player.pitch = was.pitch;
  return { spots: spots.length, levelOffer, offer, done, blocks, hit: hit.kind, hitIt, standing, firstGone, thaw, colliders0, collidersAfter };
});
if (sman) {
  console.log(`  ${sman.spots} spots; offer "${sman.offer}" (looking level: ${sman.levelOffer}); hit: ${sman.hit}; ${sman.standing} standing after six; ${sman.thaw} after a thaw; colliders ${sman.colliders0} → ${sman.collidersAfter}`);
  check(sman.offer === 'E — build a snowman' && !sman.levelOffer, 'looking down at open snow offers to build a snowman');
  check(sman.done && sman.blocks && sman.hitIt, 'a snowman gets built, blocks the way and takes a snowball');
  check(sman.spots === 6 && sman.standing === 5 && sman.firstGone, 'only five snowmen stand at a time');
  check(sman.thaw === 0 && sman.collidersAfter === sman.colliders0, 'a thaw takes the snowmen and their colliders');
} else {
  check(false, 'snowmen exist');
}

/* ================================================================ bread */
// the kiosk sells a loaf over the counter in opening hours; B crumbles a
// handful for the pigeons, who flutter over, eat it up and go home again
console.log('→ bread');
const bread = await page.evaluate(() => {
  const g = window.__game;
  const B = g.bread;
  const P = g.world.pigeons;
  if (!B || !P) return null;
  const was = { mode: g.state.mode, interior: g.state.interior, clock: g.env.cur.clockMinutes };
  g.state.mode = 'playing';
  g.state.interior = null;
  const kiosk = g.world.interactables.find((i) => i.id === 'kiosk');
  const crumbs = g.world.interactables.find((i) => i.id === 'crumbs');
  const c = g.world.points.counter;
  // at the window at noon, facing the counter
  g.env.cur.clockMinutes = 12 * 60;
  g.player.teleport(c.x, c.z, Math.PI);
  const here = kiosk.distanceTo(c.x, c.z) < kiosk.radius;
  const offer = kiosk.prompt();
  const radioStill = kiosk.distanceTo(11.6, -1.5) === Infinity;
  kiosk.onUse();
  const bought = B.handfuls;
  // after hours the window is shut
  g.env.cur.clockMinutes = 22 * 60;
  const shut = kiosk.prompt();
  kiosk.onUse();
  const afterShut = B.handfuls;
  g.env.cur.clockMinutes = 12 * 60;
  // land everyone, then crumble a handful on the snow 8 m from the kiosk flock
  const D = g.world.dog;
  const dogAt = D.position.clone();
  const run = (secs, pl) => {
    for (let t = 0; t < secs; t += 0.05) {
      D.position.set(-25, 0, 12);
      P.update(0.05, { player: pl });
    }
  };
  for (const f of P.flocks) {
    if (f.state !== 'ground') {
      f.state = 'landing';
      for (const b of f.birds) b.target = P.spot(f, b);
    }
  }
  run(30, null);
  const f = P.flocks[0];
  g.player.teleport(17.3, 2.7, Math.PI / 2);
  const pl = g.player.position;
  const feedOffer = crumbs.distanceTo() < crumbs.radius ? crumbs.prompt() : null;
  crumbs.onUse();
  const pile = P.piles.at(-1);
  const near = () => f.birds.filter((b) => Math.hypot(b.pos.x - pile.x, b.pos.z - pile.z) < 1.3).length;
  let came = null;
  for (let t = 0; t < 20 && came === null; t += 0.5) {
    run(0.5, pl);
    if (f.state === 'ground' && near() === f.birds.length) came = t;
  }
  const lowest = Math.min(...f.birds.map((b) => Math.hypot(b.pos.x - pl.x, b.pos.z - pl.z)));
  let eaten = null;
  for (let t = 0; t < 60 && eaten === null; t += 0.5) {
    run(0.5, pl);
    if (!P.piles.includes(pile)) eaten = t;
  }
  // the player walks off: they settle back home
  run(25, null);
  const home = Math.hypot(
    f.birds.reduce((s, b) => s + b.pos.x, 0) / f.birds.length - f.home.x,
    f.birds.reduce((s, b) => s + b.pos.z, 0) / f.birds.length - f.home.z,
  );
  // another handful, then the player treads on it
  crumbs.onUse();
  run(15, pl);
  const fedAgain = f.state === 'ground' && f.pile === P.piles.at(-1);
  const tread = { x: P.piles.at(-1).x, z: P.piles.at(-1).z };
  run(0.3, tread);
  const scattered = f.state;
  D.position.copy(dogAt);
  g.env.cur.clockMinutes = was.clock;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { here, offer, radioStill, bought, shut, afterShut, feedOffer, came, lowest, eaten, home, left: B.handfuls, fedAgain, scattered };
});
if (bread) {
  console.log(`  "${bread.offer}" → ${bread.bought} handfuls; at night "${bread.shut}"; "${bread.feedOffer}"; the flock at the crumbs after ${bread.came} s (nearest ${bread.lowest.toFixed(1)} m), eaten after ${bread.eaten} s, ${bread.home.toFixed(1)} m from home after; trodden on → ${bread.scattered}`);
  check(bread.here && bread.offer === 'E — buy a loaf (13 kop.)' && bread.bought === 4 && bread.radioStill, 'the kiosk sells a loaf at the window');
  check(bread.shut.startsWith('The kiosk is shut') && bread.afterShut === 4, 'the kiosk sells nothing after hours');
  check(bread.feedOffer?.startsWith('B — crumble bread') && bread.came !== null && bread.lowest < 2.5, 'crumbled bread brings the pigeons round your feet');
  check(bread.eaten !== null && bread.home < 3.5, 'the pigeons eat the crumbs up and go home');
  check(bread.fedAgain && bread.scattered !== 'ground' && bread.left === 2, 'treading on the crumbs puts them up');
} else {
  check(false, 'bread and pigeons exist');
}

/* ================================================================ cats */
// a cat sits on a handful of porches: walk up and E strokes it (it purrs);
// the dog, a sprint past or a snowball sends it down the basement vent, and
// it comes back out once nobody is about
console.log('→ cats');
const cat = await page.evaluate(() => {
  const g = window.__game;
  const C = g.world.cats;
  if (!C) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const D = g.world.dog;
  const dogAt = D.position.clone();
  D.position.set(-25, 0, 12);
  const onPorch = C.list.every((c) => c.state === 'sit' && c.root.visible && !g.world.collides(c.x, c.z, 0.1) && c.root.position.y > g.world.heightAt(c.x, c.z) + 0.2);
  const it = g.world.interactables.find((i) => i.id === 'cat');
  const c = C.list[0];
  const yaw = c.root.rotation.y;
  g.player.teleport(c.x + Math.sin(yaw), c.z + Math.cos(yaw), 0);
  const pl = g.player.position;
  const offer = it.distanceTo(pl.x, pl.z) < it.radius ? it.prompt() : null;
  C.voice.length = 0;
  it.onUse();
  C.update(0.1, { player: pl, speed: 0 });
  const purring = it.prompt();
  const purr = C.voice.some((v) => v.kind === 'purr');
  // a walk past is fine; a sprint past is not
  C.update(0.5, { player: pl, speed: 1.4 });
  const walked = c.state;
  for (let i = 0; i < 80; i++) C.update(0.05, { player: pl, speed: 6 });
  const sprinted = c.state;
  for (let i = 0; i < 1200; i++) C.update(0.05, { player: { x: 999, z: 999 }, speed: 0 });
  const back = c.state === 'sit' && c.root.visible;
  // the dog comes by another
  const c2 = C.list[1];
  C.voice.length = 0;
  D.position.set(c2.x + 3, 0, c2.z);
  C.update(0.05, {});
  const dogged = c2.state;
  const hiss = C.voice.some((v) => v.kind === 'hiss');
  D.position.set(-25, 0, 12);
  // a snowball near a third
  const c3 = C.list[2];
  const B = g.snowballs;
  const V = g.camera.position.constructor;
  B.cooldown = 0;
  B.throw(new V(c3.x + Math.sin(c3.root.rotation.y) * 6, 1.4, c3.z + Math.cos(c3.root.rotation.y) * 6), new V(-Math.sin(c3.root.rotation.y), -0.35, -Math.cos(c3.root.rotation.y)).normalize());
  for (let i = 0; i < 300 && B.balls.some((b) => b.alive); i++) B.update(1 / 60);
  const snowed = c3.state;
  for (let i = 0; i < 1200; i++) C.update(0.05, {});
  D.position.copy(dogAt);
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { count: C.list.length, onPorch, offer, purring, purr, walked, sprinted, back, dogged, hiss, snowed, home: C.list.every((k) => k.state === 'sit') };
});
if (cat) {
  console.log(`  ${cat.count} cats; "${cat.offer}" → "${cat.purring}"; walk past → ${cat.walked}, sprint → ${cat.sprinted}; dog → ${cat.dogged}${cat.hiss ? ' (hiss)' : ''}; snowball → ${cat.snowed}`);
  check(cat.count === 6 && cat.onPorch, 'the cats sit on the porches');
  check(cat.offer === 'E — stroke the cat' && cat.purring === 'The cat purrs' && cat.purr, 'E strokes a cat and it purrs');
  check(cat.walked === 'sit' && cat.sprinted === 'hidden' && cat.back, 'a sprint past sends a cat down the vent; it comes back out');
  check(cat.dogged === 'dash' && cat.hiss && cat.snowed === 'dash' && cat.home, 'the dog and snowballs put the cats to flight');
} else {
  check(false, 'the cats exist');
}

/* ================================================================ badges */
// ten badges lie about the district, each within reach of open ground; E
// picks one up, a card names it, the pause screen and localStorage keep it
console.log('→ badges');
const badge = await page.evaluate(() => {
  const g = window.__game;
  const B = g.badges;
  if (!B) return null;
  const was = { mode: g.state.mode, interior: g.state.interior, found: [...B.found] };
  g.state.mode = 'playing';
  g.state.interior = null;
  // every one can be reached from somewhere free to stand
  const standFor = (it) => {
    for (let r = 0.7; r <= 1.4; r += 0.1) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = it.x + Math.cos(a) * r;
        const z = it.z + Math.sin(a) * r;
        if (!g.world.collides(x, z, 0.3)) return { x, z };
      }
    }
    return null;
  };
  const unreachable = B.items.filter((it) => !standFor(it)).map((it) => it.badge.id);
  const resting = B.items.filter((it) => it.y >= g.world.heightAt(it.x, it.z) - 0.01).length;
  // pick up the first one
  const it = B.items[0];
  const at = standFor(it);
  g.player.teleport(at.x, at.z, 0);
  const pick = g.world.interactables.find((i) => i.id === 'badge');
  const offer = pick.distanceTo(at.x, at.z) < pick.radius ? pick.prompt() : null;
  B.found.clear();
  pick.onUse();
  const taken = B.found.has(it.badge.id) && !it.root.visible;
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem('pervyj-sneg:badges') ?? '[]');
  } catch {}
  const card = document.getElementById('badge-card');
  const shelf = document.getElementById('badge-shelf');
  const cardText = card.classList.contains('visible') ? card.textContent : null;
  const shelfText = shelf.querySelector('.shelf-title')?.textContent;
  const gone = pick.distanceTo(at.x, at.z) === Infinity;
  // put things back as they were
  B.found = new Set(was.found);
  for (const k of B.items) k.root.visible = !B.found.has(k.badge.id);
  localStorage.setItem('pervyj-sneg:badges', JSON.stringify(was.found));
  B.drawShelf();
  card.classList.remove('visible');
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { count: B.items.length, unreachable, resting, offer, taken, stored, cardText, shelfText, gone, id: it.badge.id };
});
if (badge) {
  console.log(`  ${badge.count} badges, ${badge.resting} resting on something; unreachable: ${badge.unreachable.join(', ') || 'none'}; "${badge.offer}" → card "${badge.cardText}", shelf "${badge.shelfText}"`);
  check(badge.count === 10 && badge.resting === 10 && badge.unreachable.length === 0, 'ten badges lie within reach about the district');
  check(badge.offer === 'E — pick up the badge' && badge.taken && badge.gone, 'E picks a badge up');
  check(badge.stored.includes(badge.id) && badge.cardText?.includes('1 of 10') && badge.shelfText?.includes('1 / 10'), 'a found badge is shown, shelved and remembered');
} else {
  check(false, 'the badges exist');
}

/* ================================================================ swings */
// the playground swings: E sits you on a plank, W/S in time with the swing
// pump it up to about 55°, E gets you off and the empty swing settles
console.log('→ swings');
const swing = await page.evaluate(() => {
  const g = window.__game;
  const S = g.swings;
  if (!S) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const seat = S.seats[0];
  const p = S.restSpot(seat);
  const f = S.facing(seat);
  // stand in front of the plank, looking at it
  g.player.teleport(p.x + f.x * 1.9, p.z + f.z * 1.9, Math.atan2(f.x, f.z));
  const pl = g.player.position;
  const standing = !g.world.collides(pl.x, pl.z, 0.3);
  const it = g.world.interactables.find((i) => i.id === 'swing');
  const offer = it.distanceTo(pl.x, pl.z) < it.radius ? it.prompt() : null;
  it.onUse();
  const sat = S.active === seat && !g.player.enabled;
  // pump in time: W on the way forward, S on the way back, for 25 s
  let lo = Infinity;
  let hi = -Infinity;
  let peak = 0;
  for (let i = 0; i < 1250; i++) {
    S.update(0.02, { forward: seat.w >= 0, back: seat.w < 0 });
    lo = Math.min(lo, g.camera.position.y);
    hi = Math.max(hi, g.camera.position.y);
    peak = Math.max(peak, Math.abs(seat.a));
  }
  const height = S.height;
  const finite = Number.isFinite(seat.a) && Number.isFinite(g.camera.position.y);
  const feet = Math.hypot(pl.x - S.seatPose(seat).x, pl.z - S.seatPose(seat).z);
  return { seats: S.seats.length, standing, offer, sat, lo, hi, peak, height, finite, feet, was };
});
if (swing) {
  // E, from the keyboard, gets you off
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 300));
}
const swingOff = swing
  ? await page.evaluate((was) => {
      const g = window.__game;
      const S = g.swings;
      const seat = S.seats[0];
      const off = !S.active && g.player.enabled;
      const pl = g.player.position;
      const clear = !g.world.collides(pl.x, pl.z, 0.3);
      const moving = seat.moving;
      // left alone, the plank settles and the wind has it again
      let t = 0;
      while (seat.moving && t < 120) {
        S.update(0.05);
        t += 0.05;
      }
      g.state.mode = was.mode;
      g.state.interior = was.interior;
      return { off, clear, moving, settled: !seat.moving && !seat.pivot.userData.swinging, t };
    }, swing.was)
  : null;
if (swing && swingOff) {
  console.log(
    `  ${swing.seats} planks; "${swing.offer}" → sat ${swing.sat}; pumped to ${((swing.peak * 180) / Math.PI).toFixed(0)}° (height ${swing.height.toFixed(2)}), eyes ${swing.lo.toFixed(2)}–${swing.hi.toFixed(2)} m; E → off ${swingOff.off}, clear ${swingOff.clear}; settled after ${swingOff.t.toFixed(1)} s`
  );
  check(swing.seats >= 4 && swing.standing && swing.offer === 'E — sit on the swing' && swing.sat, 'E sits the player on a swing');
  check(swing.finite && swing.peak > 0.7 && swing.hi - swing.lo > 0.4 && swing.feet < 0.01, 'pumping in time swings it up high, the view riding the plank');
  check(swingOff.off && swingOff.clear && swingOff.moving && swingOff.settled, 'E gets off, and the empty swing settles back to the wind');
} else {
  check(false, 'the swings exist');
}

/* ================================================================ ice */
// winter ice hardly grips: a run across the pond or the hockey box carries
// on into a long slide; on snow the player stops dead, and in autumn so
// does the ice
console.log('→ ice');
const rink = await page.evaluate(() => {
  const g = window.__game;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, enabled: P.enabled, season: W.season, keys: { ...P.keys } };
  g.state.mode = 'playing';
  g.state.interior = null;
  // the biggest sheet of ice (the hockey box), run along its long side
  const r = W.surfaceRects.filter((q) => q.type === 'ice').sort((a, b) => (b.maxX - b.minX) * (b.maxZ - b.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ))[0];
  const alongX = r.maxX - r.minX > r.maxZ - r.minZ;
  const cz = (r.minZ + r.maxZ) / 2;
  const cx = (r.minX + r.maxX) / 2;
  const run = (season, onSnow) => {
    W.season = season;
    let x = alongX ? r.minX + 5 : cx; // past the goal
    let z = alongX ? cz : r.minZ + 5;
    if (onSnow) {
      // the same run on open snow beside the bus stop
      x = 30;
      z = 4;
    }
    const yaw = alongX ? -Math.PI / 2 : Math.PI;
    P.teleport(x, z, yaw);
    P.enabled = true;
    P.keys = { forward: true, sprint: true };
    for (let i = 0; i < 75; i++) P.update(0.02);
    const top = Math.hypot(P.velocity.x, P.velocity.z);
    P.keys = {};
    const from = P.position.clone();
    let slid = false;
    for (let i = 0; i < 250; i++) {
      P.update(0.02);
      slid ||= P.sliding;
    }
    return { top, glide: Math.hypot(P.position.x - from.x, P.position.z - from.z), slid };
  };
  const winter = run('winter', false);
  const snow = run('winter', true);
  const autumn = run('autumn', false);
  W.season = was.season;
  P.keys = was.keys;
  P.enabled = was.enabled;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { winter, snow, autumn, size: `${(r.maxX - r.minX).toFixed(0)}×${(r.maxZ - r.minZ).toFixed(0)}` };
});
console.log(
  `  ${rink.size} m of ice; let go at ${rink.winter.top.toFixed(1)} m/s: ice ${rink.winter.glide.toFixed(1)} m, snow ${rink.snow.glide.toFixed(1)} m, autumn ${rink.autumn.glide.toFixed(1)} m`
);
check(rink.winter.slid && rink.winter.glide > 3 && rink.winter.glide > rink.snow.glide * 4, 'a run on the winter ice carries on into a slide');
check(!rink.snow.slid && rink.snow.glide < 1 && !rink.autumn.slid && rink.autumn.glide < 1, 'snow, and the ice out of winter, stop you short');

/* ================================================================ soda */
// the soda-water machine by the kiosk: E pours a glass with syrup (3 kop.),
// B a plain one (1 kop.); it fills, fizzing, and is drunk
console.log('→ soda');
const soda = await page.evaluate(() => {
  const g = window.__game;
  const S = g.soda;
  if (!S) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  // its footprint is its own: no other collider, no road, no path under it
  const others = g.world.colliders.filter((c) => c !== S.rect && c.minX < S.rect.maxX && c.maxX > S.rect.minX && c.minZ < S.rect.maxZ && c.maxZ > S.rect.minZ).length;
  const ground = g.world.surfaceAt((S.rect.minX + S.rect.maxX) / 2, (S.rect.minZ + S.rect.maxZ) / 2);
  g.player.teleport(S.stand.x, S.stand.z, 0);
  const free = !g.world.collides(S.stand.x, S.stand.z, 0.3);
  const it = g.world.interactables.find((i) => i.id === 'soda');
  const plain = g.world.interactables.find((i) => i.id === 'soda-plain');
  const offer = it.distanceTo(S.stand.x, S.stand.z) < it.radius ? it.prompt() : null;
  it.onUse();
  const filling = S.state;
  let full = 0;
  for (let i = 0; i < 60 && S.state === 'filling'; i++) {
    S.update(0.05);
    full = Math.max(full, S.level);
  }
  const drinking = S.state;
  for (let i = 0; i < 200 && S.state !== 'idle'; i++) S.update(0.05);
  const after = { state: S.state, drunk: S.drunk, spent: S.spent };
  plain.onUse();
  for (let i = 0; i < 200 && S.state !== 'idle'; i++) S.update(0.05);
  const spent = S.spent;
  S.update(0, { season: 'winter' });
  const capWinter = S.cap.visible;
  S.update(0, { season: 'autumn' });
  const capAutumn = S.cap.visible;
  S.update(0, { season: g.world.season });
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { others, ground, free, offer, filling, full, drinking, after, spent, capWinter, capAutumn };
});
if (soda) {
  console.log(`  on ${soda.ground}, ${soda.others} colliders under it; "${soda.offer}" → ${soda.filling} (full ${soda.full.toFixed(2)}) → ${soda.drinking} → ${soda.after.state}; drunk ${soda.after.drunk}, spent ${soda.spent} kop.`);
  check(soda.others === 0 && soda.ground !== 'asphalt' && soda.free, 'the soda machine stands on its own patch of ground, free to walk up to');
  check(soda.offer?.startsWith('E — soda with syrup') && soda.filling === 'filling' && soda.full > 0.95 && soda.drinking === 'drinking' && soda.after.state === 'idle' && soda.after.drunk === 1, 'E pours a glass of soda, which fills and is drunk');
  check(soda.spent === 4 && soda.capWinter && !soda.capAutumn, 'syrup 3 kop., plain 1 kop.; snow on the lid only in winter');
} else {
  check(false, 'the soda machine exists');
}

/* ================================================================ phone */
// the phone box behind the kiosk: E dials 100 for the speaking clock, which
// reads out the game's own time; walking off hangs up
console.log('→ phone');
const phoneBox = await page.evaluate(() => {
  const g = window.__game;
  const P = g.phone;
  if (!P) return null;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const others = g.world.colliders.filter((c) => c !== P.rect && c.minX < P.rect.maxX && c.maxX > P.rect.minX && c.minZ < P.rect.maxZ && c.maxZ > P.rect.minZ).length;
  g.player.teleport(P.stand.x, P.stand.z, 0);
  const pl = g.player.position;
  const free = !g.world.collides(pl.x, pl.z, 0.3);
  const it = g.world.interactables.find((i) => i.id === 'phone');
  const offer = it.distanceTo ? null : Math.hypot(it.x - pl.x, it.z - pl.z) < it.radius ? it.prompt() : null;
  it.onUse();
  const stages = [];
  let heard = null;
  for (let i = 0; i < 400 && P.busy; i++) {
    P.update(0.05, { player: pl });
    if (P.busy && stages.at(-1) !== P.stage) stages.push(P.stage);
    if (P.stage === 'time') heard = it.prompt();
  }
  const m = Math.round(g.env.cur.clockMinutes) % 1440;
  const clock = `${Math.floor(m / 60)} hours ${m % 60} minutes`;
  const after = { busy: P.busy, calls: P.calls, spent: P.spent };
  // a second call, and the caller walks off
  it.onUse();
  P.update(0.5, { player: pl });
  const ringing = P.busy;
  P.update(0.05, { player: { x: pl.x + 5, z: pl.z } });
  const dropped = !P.busy;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { others, free, offer, stages, heard, clock, after, ringing, dropped };
});
if (phoneBox) {
  console.log(`  ${phoneBox.others} colliders under it; "${phoneBox.offer}" → ${phoneBox.stages.join(' → ')}; heard ${phoneBox.heard}; walked off → dropped ${phoneBox.dropped}`);
  check(phoneBox.others === 0 && phoneBox.free && phoneBox.offer?.startsWith('E — call the speaking clock'), 'the phone box stands clear, with a call offered at its front');
  check(phoneBox.stages.join() === 'tone,dial,ring,time,dead' && phoneBox.heard?.includes(phoneBox.clock) && !phoneBox.after.busy && phoneBox.after.spent === 2, 'dialling 100 gets the speaking clock, telling the time of day');
  check(phoneBox.ringing && phoneBox.dropped, 'walking off with the call on hangs up');
} else {
  check(false, 'the phone box exists');
}

/* ================================================================ snow angels */
// in winter, looking up on open snow, E lies the player back in it; E again
// gets them up and leaves an angel pressed in the snow
console.log('→ snow angels');
const angel = await page.evaluate(() => {
  const g = window.__game;
  const A = g.angels;
  if (!A) return null;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season, enabled: P.enabled };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'winter';
  // somewhere open in the courtyard of building 12, facing north
  let at = null;
  for (let x = -60; x <= -14 && !at; x += 2.5) {
    for (let z = -42; z <= -8 && !at; z += 2.5) {
      P.teleport(x, z, Math.PI);
      P.pitch = 0.8;
      if (A.spotFor(P.position, P.forwardVector, P.pitch)) at = [x, z];
    }
  }
  const it = W.interactables.find((i) => i.id === 'angel');
  const offer = at ? it.prompt() : null;
  P.pitch = 0;
  const level = !!A.spotFor(P.position, P.forwardVector, P.pitch);
  P.pitch = 0.8;
  P.enabled = true;
  it.onUse();
  const down = A.active && !P.enabled;
  for (let i = 0; i < 80; i++) {
    P.update(0.05);
    A.update(0.05);
  }
  const lying = { stage: A.stage, eye: P.eye, sweeps: A.sweeps, prompt: A.prompt, head: Math.hypot(P.position.x - A.spot.hx, P.position.z - A.spot.hz) };
  const up = A.getUp();
  for (let i = 0; i < 40; i++) {
    P.update(0.05);
    A.update(0.05);
  }
  const m = A.list.at(-1);
  const after = { active: A.active, enabled: P.enabled, stamped: A.list.length, at: m ? Math.hypot(m.position.x - A.spot.cx, m.position.z - A.spot.cz) : null, back: Math.hypot(P.position.x - A.spot.x, P.position.z - A.spot.z) };
  A.update(0);
  const winter = A.group.visible;
  W.season = 'autumn';
  A.update(0);
  const autumn = A.group.visible;
  W.season = was.season;
  A.update(0);
  P.enabled = was.enabled;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { at, offer, level, down, lying, up, after, winter, autumn };
});
if (angel) {
  console.log(
    `  at ${angel.at}; "${angel.offer}" (looking level: ${angel.level}); lying: ${angel.lying.stage}, eyes ${angel.lying.eye.toFixed(2)} m, ${angel.lying.sweeps} sweeps, "${angel.lying.prompt}"; up ${angel.up} → ${angel.after.stamped} angel, back ${angel.after.back.toFixed(2)} m from the start`
  );
  check(angel.at && angel.offer === 'E — lie back in the snow' && !angel.level, 'looking up at open snow offers to lie back in it');
  check(angel.down && angel.lying.stage === 'lying' && angel.lying.eye < 0.4 && angel.lying.sweeps >= 2 && angel.lying.head < 0.01 && angel.lying.prompt === 'E — get up', 'E lies the player back in the snow, arms sweeping');
  check(angel.up && !angel.after.active && angel.after.enabled && angel.after.stamped >= 1 && angel.after.at < 0.01 && angel.after.back < 0.01, 'E gets them up, leaving an angel in the snow');
  check(angel.winter && !angel.autumn, 'the angels are only there while winter lasts');
} else {
  check(false, 'the snow angels exist');
}

/* ================================================================ hockey */
// a puck on the hockey box: E shoots it, it rings off the boards, never
// leaves the ice, and through a goal mouth it scores and is faced off again
console.log('→ hockey');
const hockey = await page.evaluate(() => {
  const g = window.__game;
  const H = g.puck;
  if (!H) return null;
  const P = g.player;
  const W = g.world;
  const k = H.rink;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'winter';
  H.faceoff();
  // from just behind the puck, facing the east goal down the centre line
  P.teleport(k.x - 0.8, k.z, -Math.PI / 2);
  const it = W.interactables.find((i) => i.id === 'puck');
  const offer = it.distanceTo(P.position.x, P.position.z) < it.radius ? it.prompt() : null;
  it.onUse();
  let t = 0;
  while (!H.inNet && t < 6) {
    H.update(0.02);
    t += 0.02;
  }
  const scored = { inNet: !!H.inNet, side: H.lastGoal?.side, score: H.score, t };
  for (let i = 0; i < 200; i++) H.update(0.02);
  const faced = !H.inNet && Math.hypot(H.position.x - k.x, H.position.z - k.z) < 0.01;
  // shots every which way: it stays on the ice, between the boards
  let out = 0;
  let maxBounces = 0;
  for (let a = 0; a < 12; a++) {
    H.faceoff();
    H.bounces = 0;
    const ang = (a / 12) * Math.PI * 2 + 0.13;
    H.shoot({ x: Math.cos(ang), z: Math.sin(ang) }, true);
    for (let i = 0; i < 1500 && (H.velocity.x || H.velocity.z) && !H.inNet; i++) {
      H.update(0.02);
      const dx = Math.abs(H.position.x - k.x) - (k.l / 2 - k.r);
      const dz = Math.abs(H.position.z - k.z) - (k.w / 2 - k.r);
      const outside = Math.abs(H.position.x - k.x) > k.l / 2 || Math.abs(H.position.z - k.z) > k.w / 2 || (dx > 0 && dz > 0 && Math.hypot(dx, dz) > k.r + 0.01);
      if (outside) out++;
    }
    maxBounces = Math.max(maxBounces, H.bounces);
  }
  // walking into it pushes it along
  H.faceoff();
  H.update(0.02, { player: { x: k.x - 0.3, y: 0.05, z: k.z, vx: 2.7, vz: 0 } });
  const pushed = H.velocity.x;
  W.season = 'autumn';
  H.update(0);
  const autumn = { visible: H.mesh.visible, none: it.distanceTo(k.x, k.z) === Infinity };
  W.season = was.season;
  H.faceoff();
  H.update(0);
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offer, scored, faced, out, maxBounces, pushed, autumn };
});
if (hockey) {
  console.log(
    `  "${hockey.offer}" → goal ${hockey.scored.inNet} (side ${hockey.scored.side}, ${hockey.scored.score}, ${hockey.scored.t.toFixed(2)} s), faced off ${hockey.faced}; 12 slapshots: ${hockey.out} steps off the ice, up to ${hockey.maxBounces} bounces; pushed at ${hockey.pushed.toFixed(1)} m/s`
  );
  check(hockey.offer?.startsWith('E — shoot the puck') && hockey.scored.inNet && hockey.scored.side === 1 && hockey.scored.score === '0 : 1' && hockey.faced, 'a shot down the middle scores, and the puck is faced off again');
  check(hockey.out === 0 && hockey.maxBounces >= 2, 'the puck rings off the boards and never leaves the ice');
  check(hockey.pushed > 2 && !hockey.autumn.visible && hockey.autumn.none, 'skating into it pushes it; out of winter there is no puck');
} else {
  check(false, 'the puck exists');
}

/* ================================================================ carpet */
// the carpet-beating frame: E beats the rug and dust comes out, less with every
// blow until it is clean; the bare bay is a pull-up bar, W pulls you up until
// the arms give out, E drops you back on your feet
console.log('→ carpet');
const carpet = await page.evaluate(() => {
  const g = window.__game;
  const C = g.carpet;
  if (!C) return null;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const X = C.group.position.x;
  const Z = C.group.position.z;
  // nothing of it stands on the seeded colliders, and the ground around it is free
  const blocked = [];
  for (const [dx, dz] of [[-0.85, 0.9], [-0.85, -0.9], [0.85, 0.9], [0.85, -0.9], [0.85, 0]]) if (W.collides(X + dx, Z + dz, 0.3)) blocked.push([dx, dz]);
  // in front of the rug, facing it
  P.teleport(X - 0.85, Z + 0.9, 0);
  const beatIt = W.interactables.find((i) => i.id === 'carpet');
  const offer = beatIt.distanceTo(P.position.x, P.position.z) < beatIt.radius ? beatIt.prompt() : null;
  P.teleport(X - 0.85, Z + 0.9, Math.PI);
  const turned = beatIt.distanceTo(P.position.x, P.position.z);
  P.teleport(X - 0.85, Z + 0.9, 0);
  C.dust = 1;
  let blows = 0;
  let refused = 0;
  const puffs = [];
  while (C.dust > 0.1 && blows < 30) {
    if (!C.beat()) refused++;
    blows++;
    puffs.push(C.puffs.filter((p) => p.sprite.visible).length);
    C.update(0.31, {});
  }
  const clean = { dust: C.dust, blows, note: C.note, swung: Math.abs(C.sway.a) > 0 || Math.abs(C.sway.w) > 0 };
  const quick = C.beat() && !C.beat(); // a second blow at once is too soon
  // the bar: E hangs you on it, W pulls you up, until the arms give out
  P.teleport(X + 0.85, Z + 0.8, 0);
  const barIt = W.interactables.find((i) => i.id === 'pull-up-bar');
  const barOffer = barIt.distanceTo(P.position.x, P.position.z) < barIt.radius ? barIt.prompt() : null;
  C.fatigue = 0;
  barIt.onUse();
  const hung = { hanging: C.hanging, enabled: P.enabled, eye: P.eyeOverride };
  let peak = 0;
  for (let i = 0; i < 2000 && C.hanging; i++) {
    C.update(0.02, { forward: true });
    peak = Math.max(peak, P.eyeOverride ?? 0);
  }
  const gaveOut = { reps: C.reps, hanging: C.hanging, enabled: P.enabled, note: C.note, eye: P.eyeOverride, free: !W.collides(P.position.x, P.position.z, 0.3) };
  // and E drops you, fresh
  C.fatigue = 0;
  barIt.onUse();
  for (let i = 0; i < 60; i++) C.update(0.02, { forward: true });
  const some = C.reps;
  C.drop();
  const dropped = { hanging: C.hanging, enabled: P.enabled, eye: P.eyeOverride };
  C.fatigue = 0;
  C.dust = 1;
  C.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { blocked, offer, turned: turned === Infinity, clean, refused, firstPuffs: puffs[0], quick, barOffer, hung, peak, gaveOut, some, dropped };
});
if (carpet) {
  console.log(
    `  ${carpet.blocked.length} blocked spots; "${carpet.offer}" (turned away: none ${carpet.turned}); clean after ${carpet.clean.blows} blows ("${carpet.clean.note}"), ${carpet.firstPuffs} puffs on the first; "${carpet.barOffer}" → hung ${carpet.hung.hanging} (eye ${carpet.hung.eye?.toFixed(2)}, up to ${carpet.peak.toFixed(2)}); ${carpet.gaveOut.reps} pull-ups, "${carpet.gaveOut.note}"; ${carpet.some} then E`
  );
  check(carpet.blocked.length === 0 && carpet.offer === 'E — beat the carpet' && carpet.turned, 'the carpet frame stands clear, and the rug is offered to whoever faces it');
  check(carpet.clean.dust <= 0.1 && carpet.clean.blows >= 8 && carpet.clean.blows <= 14 && carpet.refused === 0 && carpet.firstPuffs >= 4 && carpet.clean.swung && carpet.clean.note === 'Beaten clean' && carpet.quick, 'beating the rug puffs dust out of it until it is clean');
  check(
    carpet.barOffer === 'E — hang on the bar' && carpet.hung.hanging && !carpet.hung.enabled && carpet.peak > carpet.hung.eye + 0.5 && carpet.gaveOut.reps >= 8 && carpet.gaveOut.reps <= 14 && !carpet.gaveOut.hanging && carpet.gaveOut.enabled && carpet.gaveOut.eye === null && carpet.gaveOut.free && carpet.some >= 1 && !carpet.dropped.hanging && carpet.dropped.enabled,
    'pull-ups on the bar until the arms give out; E drops you'
  );
} else {
  check(false, 'the carpet frame exists');
}

/* ================================================================ target */
// a chalk target on a garage door: a snowball in the middle scores 10, in
// the rings 5 and 2, on the door outside it nothing; E at the door wipes it
console.log('→ target');
const target = await page.evaluate(() => {
  const g = window.__game;
  const T = g.target;
  if (!T) return null;
  const S = g.snowballs;
  const P = g.player;
  const W = g.world;
  const V = g.camera.position.constructor;
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = null;
  const fly = () => {
    for (let i = 0; i < 600 && S.balls.some((b) => b.alive); i++) S.update(1 / 60);
    return S.hits.at(-1);
  };
  const c = T.center;
  // 7 m out from the door, throwing straight at it: find the lift that hits the middle
  const throwAt = (k, dz) => {
    S.cooldown = 0;
    const before = T.score;
    S.throw(new V(c.x + 7, c.y, c.z), new V(-1, k, dz / 7).normalize());
    const hit = fly();
    return { points: T.score - before, kind: hit?.kind, y: hit?.y, z: hit?.z };
  };
  T.wipe();
  let lift = null;
  for (let k = -0.08; k <= 0.25 && lift === null; k += 0.005) {
    const r = throwAt(k, 0);
    if (r.points === 10) lift = k;
  }
  const bull = { lift, note: T.note, score: T.score };
  const middle = lift === null ? null : throwAt(lift, 0.26);
  const outer = lift === null ? null : throwAt(lift, 0.42);
  const door = lift === null ? null : throwAt(lift, 0.9);
  const total = T.score;
  const hits = T.hits;
  // the door: E wipes it, from right in front
  P.teleport(c.x + 1.5, c.z, Math.PI / 2);
  const it = W.interactables.find((i) => i.id === 'target');
  const offer = it.distanceTo(P.position.x, P.position.z) < it.radius ? it.prompt() : null;
  it.onUse();
  const wiped = { score: T.score, none: it.distanceTo(P.position.x, P.position.z) === Infinity };
  T.wipe();
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { bull, middle, outer, door, total, hits, offer, wiped };
});
if (target) {
  console.log(
    `  bullseye at lift ${target.bull.lift?.toFixed(3)} ("${target.bull.note}"); 0.26 m off: +${target.middle?.points}; 0.42 m off: +${target.outer?.points}; 0.9 m off: +${target.door?.points} (${target.door?.kind}); ${target.total} in ${target.hits}; "${target.offer}"`
  );
  check(target.bull.lift !== null && target.bull.note?.startsWith('Bullseye! +10'), 'a snowball in the middle of the chalk target scores 10');
  check(target.middle?.points === 5 && target.outer?.points === 2 && target.door?.points === 0 && target.door?.kind === 'wall' && target.hits >= 3, 'the rings score 5 and 2, the door outside them nothing');
  check(target.offer?.startsWith(`Chalk target: ${target.total} points`) && target.wiped.score === 0 && target.wiped.none, 'E at the door wipes the score');
} else {
  check(false, 'the chalk target exists');
}

/* ================================================================ mail */
// the post boxes in a stairwell's vestibule: E looks through the slots and
// something turns up in one of this entrance's boxes, a few times, then
// nothing until the post comes again at seven; only on the ground floor
console.log('→ mail');
const mail = await page.evaluate(() => {
  const g = window.__game;
  const M = g.mail;
  if (!M) return null;
  const P = g.player;
  const W = g.world;
  const it = W.interiors[0];
  const was = { mode: g.state.mode, interior: g.state.interior, address: it.address, floor: it.floor, clock: g.env.cur.clockMinutes, last: M.lastClock };
  g.state.mode = 'playing';
  g.state.interior = it;
  it.floor = 1;
  // as if come in by entrance 2 of a nine-storey block: the boxes are the ten on the wall
  it.address = { spec: { id: 'test-block', floors: 9 }, x: 0, side: 1, entrance: 2 };
  const scz = (it.bounds.z0 + it.bounds.z1) / 2;
  P.teleport(it.bounds.x0 + 0.75, scz - 1.9, Math.PI / 2);
  const box = W.interactables.find((i) => i.id === `${it.id}:mail`);
  const f = P.forwardVector;
  const reach = box.distanceTo ? box.distanceTo(P.position.x, P.position.z) : Math.hypot(box.x - P.position.x, box.z - P.position.z);
  const offered = box.available() && reach < box.radius && f.x * box.facing.x + f.z * box.facing.z > 0.35 && Math.abs(P.position.y - box.y) < 0.6 && !W.collides(P.position.x, P.position.z, 0.3);
  const offer = box.prompt();
  M.looked.clear();
  const finds = [];
  for (let i = 0; i < 4; i++) finds.push(box.onUse());
  const empty = { note: M.note, prompt: box.prompt() };
  const numbers = finds.filter(Boolean).map((t) => +/^Box (\d+):/.exec(t)?.[1]);
  // another entrance has its own boxes
  it.address = { ...it.address, entrance: 3 };
  const other = M.left(it);
  it.address = { ...it.address, entrance: 2 };
  // the post comes at seven
  M.lastClock = 400;
  g.env.cur.clockMinutes = 430;
  M.update(0);
  const refilled = M.left(it);
  it.floor = 2;
  const upstairs = box.available();
  it.floor = was.floor;
  it.address = was.address;
  g.env.cur.clockMinutes = was.clock;
  M.lastClock = was.last;
  M.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, offer, finds, empty, numbers, lo: it.flatBase, other, refilled, upstairs };
});
if (mail) {
  console.log(`  "${mail.offer}" (offered ${mail.offered}); ${mail.finds.map((t) => `"${t}"`).join(', ')}; then "${mail.empty.note}"; other entrance ${mail.other} left; after seven ${mail.refilled}`);
  check(mail.offered && mail.offer === 'E — look through the post boxes' && !mail.upstairs, 'the post boxes are offered in the vestibule, on the ground floor only');
  check(
    mail.finds.slice(0, 3).every((t) => /^Box \d+: ./.test(t ?? '')) && mail.numbers.every((n) => n >= mail.lo && n <= mail.lo + 9) && mail.finds[3] === null && mail.empty.note?.startsWith('Nothing sticking out') && mail.empty.prompt.includes('the post comes at seven'),
    "three finds in this entrance's boxes, then nothing"
  );
  check(mail.other === 3 && mail.refilled === 3, 'each entrance has its own post, and it comes again at seven');
} else {
  check(false, 'the post boxes exist');
}

/* ================================================================ hopscotch */
// hopscotch on the sidewalk, out of winter: a real jump into square 1 starts
// a run, 1 to 10 in order finishes it with a time; a wrong square or a hop
// off the drawing is back to 1; under the winter snow there is none
console.log('→ hopscotch');
const hop = await page.evaluate(() => {
  const g = window.__game;
  const H = g.hopscotch;
  if (!H) return null;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'autumn';
  H.next = 0;
  H.note = null;
  // a real jump: up from square 1 and down into it again
  const c1 = H.cellCenter(1);
  P.teleport(c1.x, c1.z - 1.2, 0);
  const offer = H.promptFor(P.position.x, P.position.z);
  P.teleport(c1.x, c1.z, 0);
  H.update(0.02);
  P.velocity.set(0, 4.5, 0);
  P.onGround = false;
  P.position.y += 0.01;
  let air = 0;
  for (let i = 0; i < 120 && (air === 0 || !P.onGround); i++) {
    P.update(1 / 60);
    if (!P.onGround) air++;
    H.update(1 / 60);
  }
  const first = { next: H.next, air, prompt: H.promptFor(P.position.x, P.position.z) };
  // and on up to ten
  const cells = [];
  for (let n = 2; n <= 10; n++) {
    const c = H.cellCenter(n);
    cells.push(H.cellAt(c.x, c.z));
    H.update(0.35);
    H.land(c.x, c.z);
  }
  const done = { note: H.note, best: H.best, next: H.next };
  // a wrong square
  H.land(c1.x, c1.z);
  const c3 = H.cellCenter(3);
  H.land(c3.x, c3.z);
  const wrong = { note: H.note, next: H.next };
  // off the drawing mid-run
  H.land(c1.x, c1.z);
  H.land(c1.x - 1.4, c1.z + 1);
  const off = { note: H.note, next: H.next };
  // the winter snow covers it
  W.season = 'winter';
  H.note = null;
  H.update(0);
  H.land(c1.x, c1.z);
  const winter = { visible: H.mesh.visible, next: H.next, prompt: H.promptFor(c1.x, c1.z) };
  W.season = was.season;
  H.update(0);
  H.note = null;
  H.next = 0;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offer, first, cells, done, wrong, off, winter };
});
if (hop) {
  console.log(`  "${hop.offer}"; jumped into 1 (${hop.first.air} frames in the air) → "${hop.first.prompt}"; squares ${hop.cells.join(' ')}; "${hop.done.note}"; "${hop.wrong.note}"; "${hop.off.note}"`);
  check(hop.offer?.startsWith('Hopscotch: Space') && hop.first.air > 10 && hop.first.next === 1 && hop.first.prompt === 'Hopscotch: 1 · now 2', 'a jump into square 1 starts a game of hopscotch');
  check(hop.cells.join() === '2,3,4,5,6,7,8,9,10' && hop.done.note?.startsWith('Hopscotch: all ten in') && hop.done.best > 2 && hop.done.next === 0, 'squares 1 to 10 in order finish it, with the time');
  check(hop.wrong.note === 'Square 3? Back to 1' && hop.wrong.next === 0 && hop.off.note === 'Off the drawing: back to 1' && hop.off.next === 0 && !hop.winter.visible && hop.winter.next === 0 && hop.winter.prompt === null, 'a wrong square or a hop off it is back to 1; none under the winter snow');
} else {
  check(false, 'the hopscotch exists');
}

/* ================================================================ pebbles */
// a pebble tossed from the edge of the frozen pond skips, sings on the ice
// each time it touches, slides on and stays where it stops, on the ice
console.log('→ pebbles');
const peb = await page.evaluate(() => {
  const g = window.__game;
  const B = g.pebbles;
  if (!B) return null;
  const P = g.player;
  const W = g.world;
  const S = g.sound;
  const pond = W.pond;
  const was = { mode: g.state.mode, interior: g.state.interior, sing: S.iceSing };
  g.state.mode = 'playing';
  g.state.interior = null;
  let sings = 0;
  S.iceSing = () => sings++;
  const it = W.interactables.find((i) => i.id === 'pebble');
  // on the east bank, facing the ice; then facing away; then too far back
  P.teleport(pond.x + pond.r + 1, pond.z, Math.PI / 2);
  const offer = it.distanceTo(P.position.x, P.position.z) < it.radius ? it.prompt() : null;
  P.teleport(pond.x + pond.r + 1, pond.z, -Math.PI / 2);
  const away = it.distanceTo(P.position.x, P.position.z);
  P.teleport(pond.x + pond.r + 5, pond.z, Math.PI / 2);
  const far = it.distanceTo(P.position.x, P.position.z);
  P.teleport(pond.x + pond.r + 1, pond.z, Math.PI / 2);
  P.update(0);
  it.onUse();
  const p = B.list.at(-1);
  let t = 0;
  while (p.moving && t < 30) {
    B.update(1 / 60);
    t += 1 / 60;
  }
  const res = {
    t,
    skips: p.skips,
    sings,
    lost: p.lost,
    travel: Math.hypot(p.pos.x - p.from.x, p.pos.z - p.from.z),
    onIce: Math.hypot(p.pos.x - pond.x, p.pos.z - pond.z) < pond.r,
    y: p.pos.y,
  };
  // a whole handful: only the last dozen stay
  for (let i = 0; i < 14; i++) it.onUse();
  for (let i = 0; i < 1800 && B.list.some((q) => q.moving); i++) B.update(1 / 60);
  const kept = B.list.length;
  S.iceSing = was.sing;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offer, away: away === Infinity, far: far === Infinity, res, kept };
});
if (peb) {
  console.log(`  "${peb.offer}" (facing away: none ${peb.away}, too far back: none ${peb.far}); ${peb.res.skips} skips, ${peb.res.sings} songs, ${peb.res.travel.toFixed(1)} m in ${peb.res.t.toFixed(1)} s, on the ice ${peb.res.onIce} (y ${peb.res.y.toFixed(3)}); ${peb.kept} kept`);
  check(peb.offer === 'E — toss a pebble onto the ice' && peb.away && peb.far, 'a pebble is offered at the edge of the pond, facing the ice');
  check(peb.res.skips >= 2 && peb.res.sings === peb.res.skips && !peb.res.lost && peb.res.onIce && peb.res.travel > 6 && peb.res.y < 0.1, 'it skips, singing on the ice each time, and slides to a stop on it');
  check(peb.kept === 12, 'only the last dozen pebbles stay on the ice');
} else {
  check(false, 'the pebbles exist');
}

/* ================================================================ kettle */
// the kettle on a flat's stove: E lights the gas, it comes to the boil and
// whistles, E takes it off and pours the tea; the flame, the steam and the
// whistle stay in that flat
console.log('→ kettle');
const kettle = await page.evaluate(() => {
  const g = window.__game;
  const K = g.kettle;
  if (!K) return null;
  const P = g.player;
  const W = g.world;
  const flat = W.flats[0];
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = flat;
  const it = W.interactables.find((i) => i.id === `${flat.id}:kettle`);
  P.teleport(it.x, it.z, Math.PI / 2);
  const f = P.forwardVector;
  const offered = Math.hypot(it.x - P.position.x, it.z - P.position.z) < it.radius && f.x * it.facing.x + f.z * it.facing.z > 0.35 && !W.collides(P.position.x, P.position.z, 0.3);
  const offer = it.prompt();
  it.onUse();
  const lit = { prompt: it.prompt(), flame: (K.update(0.1, flat), K.flame.visible), flameAt: K.flame.position.distanceTo(flat.kettle) };
  // half a minute on the gas, a frame at a time
  let steamed = 0;
  for (let t = 0; t < 30; t += 0.1) {
    K.update(0.1, flat);
    steamed = Math.max(steamed, K.puffs.filter((p) => p.sprite.visible && p.sprite.material.opacity > 0.05).length);
  }
  const boiling = { ...K.status(flat), prompt: it.prompt() };
  // to the stairwell and back: the flame and the steam stay in the flat
  K.update(0.5, null);
  const away = { flame: K.flame.visible, steam: K.puffs.filter((p) => p.sprite.visible).length, boiling: K.status(flat).boiling };
  K.update(0.1, flat);
  const teas = K.teas;
  it.onUse();
  const poured = { note: K.note, status: K.status(flat), prompt: it.prompt(), teas: K.teas - teas };
  K.update(0.1, flat);
  const off = K.flame.visible;
  // another flat's kettle is cold
  const other = K.status(W.flats[1]);
  K.cancel();
  K.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, offer, lit, steamed, boiling, away, poured, off, other };
});
if (kettle) {
  console.log(`  "${kettle.offer}" (offered ${kettle.offered}) → "${kettle.lit.prompt}"; ${kettle.steamed} puffs at most; boiling ${kettle.boiling.boiling} "${kettle.boiling.prompt}"; poured "${kettle.poured.note}"`);
  check(kettle.offered && kettle.offer === 'E — put the kettle on' && kettle.lit.flame && kettle.lit.flameAt < 0.15 && kettle.lit.prompt === 'E — turn the gas off', 'the kettle is offered at the stove and E lights the gas under it');
  check(kettle.boiling.boiling && kettle.steamed >= 3 && kettle.boiling.prompt.startsWith('E — take the kettle off') && !kettle.away.flame && kettle.away.steam === 0 && kettle.away.boiling, 'it comes to the boil and steams, and its flame and steam stay in the flat');
  check(!kettle.poured.status.on && kettle.poured.teas === 1 && /tea/i.test(kettle.poured.note ?? '') && !kettle.off && kettle.poured.prompt === 'E — put the kettle on' && !kettle.other.on && kettle.other.heat === 0, 'E takes it off and pours the tea; the other kettles are cold');
} else {
  check(false, 'the kettle exists');
}

/* ================================================================ ice slide */
// a ride down the ice slide in winter: up the stairs, sit at the top, down
// the chute faster and faster, out over the run-out and into the snow, then
// back on your feet with how far it went; out of winter it is not offered
console.log('→ ice slide');
const slide = await page.evaluate(() => {
  const g = window.__game;
  const S = g.iceSlide;
  if (!S) return null;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season, enabled: P.enabled };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'winter';
  const it = W.interactables.find((i) => i.id === 'ice-slide');
  // at the foot of the stairs, looking up them
  P.teleport(-205, -118 + 4.6, 0);
  const f = P.forwardVector;
  const reach = it.distanceTo(P.position.x, P.position.z);
  const offered = reach < it.radius && f.x * it.facing.x + f.z * it.facing.z > 0.35 && !W.collides(P.position.x, P.position.z, 0.3);
  const offer = it.prompt();
  it.onUse();
  const stages = [];
  let topY = 0;
  let topV = 0;
  let t = 0;
  for (; t < 40 && S.active; t += 0.05) {
    S.update(0.05);
    if (stages[stages.length - 1] !== S.stage) stages.push(S.stage);
    topY = Math.max(topY, P.position.y);
    topV = Math.max(topV, S.v);
  }
  const end = { x: P.position.x, z: P.position.z, enabled: P.enabled, active: S.active, note: S.note, last: S.last, clear: !W.collides(P.position.x, P.position.z, 0.3), cam: g.camera.position.y - P.position.y };
  // out of winter: no ride
  W.season = 'autumn';
  const autumn = Number.isFinite(it.distanceTo(-205, -113.4));
  W.season = was.season;
  S.note = null;
  P.enabled = was.enabled;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, offer, stages, topY, topV, t, end, autumn };
});
if (slide) {
  console.log(`  "${slide.offer}" (offered ${slide.offered}); ${slide.stages.join(' → ')} in ${slide.t.toFixed(1)} s; up to ${slide.topY.toFixed(2)} m, ${slide.topV.toFixed(1)} m/s; "${slide.end.note}"`);
  check(slide.offered && slide.offer.startsWith('E — climb up and slide down') && !slide.autumn, 'the ice slide is offered at the foot of its stairs, in winter only');
  check(slide.stages.join(' ') === 'climb sit down out stand idle' && slide.topY > 2.4 && slide.topV > 5 && slide.topV < 9, 'up the stairs, sat at the top and down the chute at a good speed');
  check(!slide.end.active && slide.end.enabled && slide.end.clear && slide.end.last > 12 && slide.end.last < 30 && /^Slid \d+\.\d m/.test(slide.end.note ?? '') && slide.end.cam > 1.2, 'out over the run-out into the snow, and back on your feet with how far it went');
} else {
  check(false, 'the ice slide ride exists');
}

/* ================================================================ icicles */
// icicles hanging from the garage roofs' front edges in winter: a snowball
// thrown through one knocks it down, it shatters on the ground, and it
// grows back after a while; out of winter there are none
console.log('→ icicles');
const icicles = await page.evaluate(() => {
  const g = window.__game;
  const I = g.icicles;
  if (!I) return null;
  const S = g.snowballs;
  const W = g.world;
  const V = g.camera.position.constructor;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'winter';
  I.update(0, []);
  const total = I.list.length;
  const placed = I.list.every((c) => c.y - c.len > 1.9 && !W.collides(c.x, c.z, 0.02));
  const step = () => {
    S.update(1 / 60);
    I.update(1 / 60, S.balls);
  };
  // a long one, and a throw at it from 6 m out in front of the garages
  const c = I.list.find((q) => q.len > 0.3 && q.state === 'hanging');
  const aim = { x: c.x, y: c.y - c.len * 0.6, z: c.z };
  const from = new V(c.x, aim.y - 0.4, c.z + c.facing * 6);
  const before = I.knocked;
  let lift = null;
  for (let k = -0.1; k <= 0.25 && lift === null; k += 0.004) {
    S.cooldown = 0;
    S.throw(from, new V(0, k, -c.facing).normalize());
    for (let i = 0; i < 300 && S.balls.some((b) => b.alive); i++) step();
    if (c.state !== 'hanging') lift = k;
  }
  const knocked = I.knocked - before;
  let shards = 0;
  for (let i = 0; i < 200 && c.state === 'falling'; i++) step();
  for (let i = 0; i < 10; i++) {
    step();
    shards = Math.max(shards, I.shardMesh.visible ? I.shards.filter((s) => s.age < 0.9).length : 0);
  }
  const fell = { state: c.state, note: I.note };
  // it grows back
  I.update(121, []);
  const regrowing = { state: c.state, grow: c.grow };
  for (let i = 0; i < 40; i++) I.update(1, []);
  const grown = { state: c.state, grow: c.grow };
  // out of winter: none to see, none to knock
  W.season = 'autumn';
  I.update(0, []);
  const autumn = { shown: I.mesh.visible, swept: I.sweep(new V(c.x, aim.y, c.z + 1), new V(c.x, aim.y, c.z - 1)) };
  W.season = was.season;
  I.update(0, []);
  I.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { total, placed, lift, knocked, shards, fell, regrowing, grown, autumn };
});
if (icicles) {
  console.log(`  ${icicles.total} icicles; knocked at lift ${icicles.lift?.toFixed(3)} (${icicles.knocked}); ${icicles.shards} shards; "${icicles.fell.note}"; regrown ${icicles.grown.grow}`);
  check(icicles.total > 60 && icicles.placed, 'icicles hang along the garage roofs, clear of the doors and the walls');
  check(icicles.lift !== null && icicles.knocked >= 1 && icicles.knocked <= 3 && icicles.fell.state === 'gone' && icicles.shards >= 3 && /^Icicles knocked down: \d+/.test(icicles.fell.note ?? ''), 'a snowball knocks one down and it shatters on the ground');
  check(icicles.regrowing.state === 'hanging' && icicles.regrowing.grow < 0.1 && icicles.grown.grow === 1 && !icicles.autumn.shown && icicles.autumn.swept === 0, 'it grows back, and out of winter there are none');
} else {
  check(false, 'the icicles exist');
}

/* ================================================================ tv */
// the TV in a living-room flat: E at the set turns the knob round the
// channels (news, figure skating, the test card, off) and the screen and
// the sound follow; bedroom flats have no set
console.log('→ tv');
const tv = await page.evaluate(() => {
  const g = window.__game;
  const T = g.television;
  if (!T) return null;
  const P = g.player;
  const W = g.world;
  const flat = W.flats.find((f) => f.tv);
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  g.state.interior = flat;
  const it = W.interactables.find((i) => i.id === `${flat.id}:tv`);
  P.teleport(it.x, it.z, Math.PI / 2);
  const f = P.forwardVector;
  const offered = Math.hypot(it.x - P.position.x, it.z - P.position.z) < it.radius && f.x * it.facing.x + f.z * it.facing.z > 0.35 && !W.collides(P.position.x, P.position.z, 0.3);
  const screen = flat.tv.screenMat;
  const look = () => ({ id: T.current(flat).id, map: !!screen.map, bright: screen.color.r + screen.color.g + screen.color.b, glow: flat.tv.glowMat.opacity, sound: T.soundFor(flat), prompt: it.prompt() });
  T.update(0.1, 10);
  const seen = [look()];
  const maps = new Set([screen.map]);
  for (let i = 0; i < 4; i++) {
    it.onUse();
    T.update(0.1, 10 + i);
    seen.push(look());
    maps.add(screen.map);
  }
  const note = T.note;
  const sets = W.flats.filter((q) => q.tv).length;
  const knobs = W.interactables.filter((i) => i.id.endsWith(':tv')).length;
  const bedroom = W.flats.find((q) => !q.tv);
  const noSet = !W.interactables.some((i) => i.id === `${bedroom.id}:tv`);
  T.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, seen, maps: maps.size, note, sets, knobs, noSet };
});
if (tv) {
  console.log(`  ${tv.seen.map((s) => `${s.id} (${s.bright.toFixed(2)})`).join(' → ')}; "${tv.seen[0].prompt}"; ${tv.knobs} sets`);
  const [news, skating, test, off, again] = tv.seen;
  check(tv.offered && news.id === 'news' && news.map && news.sound.voice === 1 && news.prompt === 'E — turn the knob to the next channel' && tv.knobs === tv.sets && tv.noSet, 'the TV is offered in the living-room flats, on the news');
  check(skating.id === 'skating' && skating.sound.voice === 0 && skating.sound.music > 0 && test.id === 'test' && test.sound.tone === 1 && tv.maps === 4, 'the knob turns to figure skating and the test card, each with its own picture and sound');
  check(off.id === 'off' && !off.map && off.bright < 0.2 && off.glow === 0 && off.prompt === 'E — turn the TV on' && off.sound.voice + off.sound.music + off.sound.tone === 0 && again.id === 'news' && again.bright > 1, 'and to off (dark and silent), then round to the news again');
} else {
  check(false, 'the TV exists');
}

/* ================================================================ window doodles */
// breath on a flat's window in winter: E mists the glass round where you
// stand and a finger draws in the mist; it clears in half a minute; out of
// winter it is not offered
console.log('→ window doodles');
const doodle = await page.evaluate(() => {
  const g = window.__game;
  const D = g.doodles;
  if (!D) return null;
  const P = g.player;
  const W = g.world;
  const flat = W.flats[0];
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = flat;
  W.season = 'winter';
  const it = W.interactables.find((i) => i.id === `${flat.id}:window1`);
  // every window has somewhere free to stand at it
  const free = W.flats.every((q) => [1, 2].every((k) => {
    const w = W.interactables.find((i) => i.id === `${q.id}:window${k}`);
    return w && !W.collides(w.x, w.z, 0.3);
  }));
  P.teleport(it.x, it.z, Math.PI);
  const f = P.forwardVector;
  const offered = it.available() && Math.hypot(it.x - P.position.x, it.z - P.position.z) < it.radius && f.x * it.facing.x + f.z * it.facing.z > 0.35 && !W.collides(P.position.x, P.position.z, 0.3);
  const offer = it.prompt();
  const kinds = [it.onUse(), it.onUse()];
  D.update(0.1);
  const pane = flat.panes[0];
  const s = D.panes.get(pane);
  const px = s.ctx.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
  let mist = 0;
  let lines = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 128) mist++;
    if (px[i + 1] > 128) lines++;
  }
  const u = pane.material.uniforms;
  const misted = { fog: u?.uFog.value, bound: u?.tDraw.value === s.tex, share: mist / (px.length / 4), lines };
  for (let t = 0; t < 32; t++) D.update(1);
  const cleared = u?.uFog.value;
  W.season = 'autumn';
  const autumn = it.available();
  W.season = was.season;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, free, offer, kinds, misted, cleared, autumn, windows: W.interactables.filter((i) => /:window\d$/.test(i.id)).length, flats: W.flats.length };
});
if (doodle) {
  console.log(`  "${doodle.offer}" (offered ${doodle.offered}); drew ${doodle.kinds.join(', ')}; mist ${(doodle.misted.share * 100).toFixed(0)}% of the pane, ${doodle.misted.lines} px of lines; fog ${doodle.misted.fog?.toFixed(2)} → ${doodle.cleared}`);
  check(doodle.offered && doodle.free && doodle.offer === 'E — breathe on the glass and draw in the mist' && doodle.windows === doodle.flats * 2 && !doodle.autumn, 'every flat window is offered for a breath in winter, and not out of it');
  check(doodle.kinds.every(Boolean) && doodle.misted.bound && doodle.misted.fog > 0.95 && doodle.misted.share > 0.05 && doodle.misted.share < 0.8 && doodle.misted.lines > 100, 'E mists the glass round where you stand and draws in the mist');
  check(doodle.cleared === 0, 'the mist clears again, drawing and all');
} else {
  check(false, 'the window doodles exist');
}

/* ================================================================ new year */
// the New Year tree by the playground in winter: the garland chases round,
// E at the tree sends a rocket up that bursts into sparks which fall and
// fade; out of winter the tree is gone and so is its collider
console.log('→ new year');
const newyear = await page.evaluate(() => {
  const g = window.__game;
  const N = g.newYear;
  if (!N) return null;
  const P = g.player;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'winter';
  N.update(0.1);
  const it = W.interactables.find((i) => i.id === 'new-year-tree');
  const tree = { x: N.base.x, z: N.base.z };
  // walk up to it: blocked at the trunk, offered a step away
  P.teleport(tree.x + 2.6, tree.z, Math.PI / 2);
  const reach = it.distanceTo(P.position.x, P.position.z);
  const offered = reach < it.radius && !W.collides(P.position.x, P.position.z, 0.3);
  const offer = it.prompt();
  const trunk = W.collides(tree.x, tree.z, 0.3);
  // the garland changes from frame to frame
  const c0 = [];
  const c1 = [];
  const col = N.bulbs.instanceColor;
  for (let i = 0; i < 8; i++) c0.push(col.getX(i));
  N.update(0.4);
  for (let i = 0; i < 8; i++) c1.push(col.getX(i));
  const chasing = c0.some((v, i) => Math.abs(v - c1[i]) > 0.3);
  // a rocket: up, the burst, the sparks falling
  it.onUse();
  const up = N.flying;
  let maxY = 0;
  let sparks = 0;
  for (let t = 0; t < 2; t += 0.05) {
    N.update(0.05);
    const pos = N.sparkGeo.attributes.position;
    let lit = 0;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > -100) {
      lit++;
      maxY = Math.max(maxY, pos.getY(i));
    }
    sparks = Math.max(sparks, lit);
  }
  const burst = { flying: N.flying, sparks, maxY: maxY - N.base.y, note: N.note };
  for (let t = 0; t < 4; t += 0.1) N.update(0.1);
  const after = { shown: N.sparks.visible };
  // three at most in the air
  N.cooldown = 0;
  for (let i = 0; i < 5; i++) {
    N.cooldown = 0;
    it.onUse();
  }
  const capped = N.flying;
  for (let t = 0; t < 6; t += 0.1) N.update(0.1);
  // out of winter: no tree, no collider
  W.season = 'autumn';
  N.update(0.1);
  const autumn = { shown: N.group.visible, trunk: W.collides(tree.x, tree.z, 0.3), offered: Number.isFinite(it.distanceTo(tree.x + 2.6, tree.z)) };
  W.season = was.season;
  N.update(0);
  N.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { offered, offer, trunk, chasing, up, burst, after, capped, autumn };
});
if (newyear) {
  console.log(`  "${newyear.offer}" (offered ${newyear.offered}); ${newyear.burst.sparks} sparks up to ${newyear.burst.maxY.toFixed(1)} m; "${newyear.burst.note}"; ${newyear.capped} at once`);
  check(newyear.offered && newyear.offer === 'E — light a firework (салют)' && newyear.trunk && newyear.chasing, 'the New Year tree stands by the playground in winter, its garland chasing round');
  check(newyear.up === 1 && newyear.burst.flying === 0 && newyear.burst.sparks > 80 && newyear.burst.maxY > 15 && newyear.burst.note?.startsWith('С Новым годом') && !newyear.after.shown && newyear.capped === 3, 'E sends a rocket up to burst into sparks that fall and fade, three at most at once');
  check(!newyear.autumn.shown && !newyear.autumn.trunk && !newyear.autumn.offered, 'out of winter the tree is gone, and its collider with it');
} else {
  check(false, 'the New Year tree exists');
}

/* ================================================================ light switches */
// three switches in each flat's hall: E at one snaps its rocker over and the
// lamp it serves goes out (its light and its glowing bulb), or comes back on;
// each flat keeps its own, and they hold when you leave and come back
console.log('→ light switches');
const switched = await page.evaluate(async () => {
  const g = window.__game;
  const S = g.switches;
  if (!S) return null;
  const P = g.player;
  const W = g.world;
  const flat = W.flats[0];
  const other = W.flats[1];
  const was = { mode: g.state.mode, interior: g.state.interior };
  g.state.mode = 'playing';
  const ids = ['kitchen', 'room', 'hall'];
  // every flat has its three, each with somewhere free to stand
  const all = W.flats.every((q) => ids.every((r) => {
    const it = W.interactables.find((i) => i.id === `${q.id}:switch-${r}`);
    return it && !W.collides(it.x, it.z, 0.3);
  }));
  // in through the padded door, as the player would
  g.state.interior = flat.parent;
  P.teleport(flat.doorOut.x, flat.doorOut.z, 0);
  W.interactables.find((i) => i.id === `${flat.id}:enter`).onUse();
  await new Promise((r) => setTimeout(r, 5000));
  const inside = g.state.interior === flat && W.litFlat === flat;
  const lit0 = W.flatLights.map((l) => l.intensity);
  // the nearest offer at each switch, as the game picks it
  const nearest = () => {
    let best = null;
    let bd = Infinity;
    const f = P.forwardVector;
    for (const it of W.interactables) {
      if ((it.key ?? 'KeyE') !== 'KeyE' || (it.available && !it.available())) continue;
      if (it.y !== undefined && Math.abs(P.position.y - it.y) > 0.6) continue;
      if (it.facing && f.x * it.facing.x + f.z * it.facing.z < 0.35) continue;
      const d = it.distanceTo ? it.distanceTo(P.position.x, P.position.z) : Math.hypot(it.x - P.position.x, it.z - P.position.z);
      if (d < it.radius && d < bd) {
        best = it;
        bd = d;
      }
    }
    return best;
  };
  const offers = [];
  const flips = [];
  ids.forEach((r, i) => {
    const it = W.interactables.find((q) => q.id === `${flat.id}:switch-${r}`);
    // face the wall the switch is on
    P.teleport(it.x, it.z, it.facing.z < 0 ? 0 : Math.PI);
    const n = nearest();
    offers.push(n?.id === it.id ? n.prompt() : `(${n?.id ?? 'nothing'})`);
    const rocker = flat.rockers[i].rotation.x;
    it.onUse();
    flips.push({ on: flat.lightOn[i], light: W.flatLights[i].intensity, lamp: flat.lampMats[i].color.r, moved: flat.rockers[i].rotation.x !== rocker, prompt: it.prompt() });
  });
  S.update(0.1);
  const dark = { note: S.note, lights: W.flatLights.map((l) => l.intensity), otherOn: other.lightOn.every(Boolean), otherLamp: other.lampMats[0].color.r };
  // out to the landing and back in: still dark
  W.interactables.find((i) => i.id === `${flat.id}:exit`).onUse();
  await new Promise((r) => setTimeout(r, 4000));
  const outLights = W.flatLights.map((l) => l.intensity);
  g.state.interior = flat.parent;
  P.teleport(flat.doorOut.x, flat.doorOut.z, 0);
  W.interactables.find((i) => i.id === `${flat.id}:enter`).onUse();
  await new Promise((r) => setTimeout(r, 4000));
  const back = W.flatLights.map((l) => l.intensity);
  // on again, one by one
  ids.forEach((r, i) => W.interactables.find((q) => q.id === `${flat.id}:switch-${r}`).onUse());
  const relit = { lights: W.flatLights.map((l) => l.intensity), lamp: flat.lampMats[1].color.r, note: S.note };
  // and out of the stairwell, back where the next section expects you
  W.interactables.find((i) => i.id === `${flat.id}:exit`).onUse();
  await new Promise((r) => setTimeout(r, 4000));
  W.interactables.find((i) => i.id === `${flat.parent.id}:exit`).onUse();
  await new Promise((r) => setTimeout(r, 4000));
  const outdoors = g.state.interior === was.interior;
  g.state.mode = was.mode;
  return { outdoors, all, inside, lit0, offers, flips, dark, outLights, back, relit };
});
if (switched) {
  console.log(`  ${switched.offers.map((o) => `"${o}"`).join(', ')}; lights ${switched.lit0.join('/')} → ${switched.dark.lights.join('/')}; "${switched.dark.note}"; back in ${switched.back.join('/')}`);
  check(switched.all && switched.inside && switched.lit0.every((v) => v > 0) && switched.offers.every((o, i) => o === `E — switch the ${['kitchen', 'room', 'hall'][i]} light off`), 'each flat has its three switches in the hall, each offered where you stand at it');
  check(switched.flips.every((f) => !f.on && f.light === 0 && f.lamp < 0.5 && f.moved && f.prompt.endsWith(' on')) && switched.dark.lights.every((v) => v === 0) && switched.dark.note?.startsWith('All dark') && switched.dark.otherOn && switched.dark.otherLamp > 1, 'E snaps a switch over: its lamp and its light go out, in that flat only');
  check(switched.outLights.every((v) => v === 0) && switched.back.every((v) => v === 0) && switched.relit.lights.every((v) => v > 0) && switched.relit.lamp > 1 && !switched.relit.note && switched.outdoors, 'the flat stays dark when you leave and come back, and lights up again switch by switch');
} else {
  check(false, 'the light switches exist');
}

/* ================================================================ leaf piles */
// the dvornik's leaf piles in autumn: a run (or a jump) through one bursts
// it, the leaves thrown up to flutter down and lie scattered; a walk does
// not; E kicks one; a minute and a half on it is raked up again
console.log('→ leaf piles');
const leaves = await page.evaluate(() => {
  const g = window.__game;
  const L = g.leafPiles;
  if (!L) return null;
  const W = g.world;
  const was = { mode: g.state.mode, interior: g.state.interior, season: W.season };
  g.state.mode = 'playing';
  g.state.interior = null;
  W.season = 'autumn';
  L.update(0);
  const piles = L.piles.length;
  const free = L.piles.every((p) => !W.collides(p.x, p.z, 0.8) && !['asphalt', 'stone', 'ice'].includes(W.surfaceAt(p.x, p.z)));
  const shown = L.group.visible;
  const [a, b] = L.piles;
  const runner = (p, speed, vy = 0, up = 0) => ({ position: { x: p.x - 0.3, y: W.heightAt(p.x, p.z) + up, z: p.z }, speed, velocity: { x: speed, y: vy, z: 0 } });
  // a walk through leaves it be, a run bursts it
  L.update(0.05, runner(a, 2.7));
  const walked = a.state;
  L.update(0.05, runner(a, 5.6));
  const ran = a.state;
  const note = L.note;
  let high = 0;
  const n = L.leaves.count / L.piles.length;
  const i0 = a.index * n;
  for (let t = 0; t < 8; t += 0.05) {
    L.update(0.05, null);
    for (let i = i0; i < i0 + n; i++) high = Math.max(high, L.pos[i * 3 + 1] - a.y);
  }
  let flying = 0;
  let spread = 0;
  let ahead = 0;
  for (let i = i0; i < i0 + n; i++) {
    flying += L.flying[i];
    spread += Math.hypot(L.pos[i * 3] - a.x, L.pos[i * 3 + 2] - a.z) / n;
    ahead += (L.pos[i * 3] - a.x) / n;
  }
  const burst = { high, flying, spread, ahead, note };
  // landing in one from a jump
  L.update(0.05, runner(b, 0.5, -3, 0.4));
  const jumped = b.state;
  // E at the next: offered from a step away, the kick bursts it
  const c = L.piles[2];
  const it = W.interactables.find((i) => i.id === 'leaf-pile');
  g.player.teleport(c.x - 1.9, c.z, -Math.PI / 2);
  const reach = it.distanceTo(g.player.position.x, g.player.position.z);
  const offer = it.prompt();
  it.onUse();
  const kicked = c.state;
  // raked up again a minute and a half later
  for (let t = 0; t < 100; t += 0.1) L.update(0.1, null);
  let home = 0;
  for (let i = i0; i < i0 + n; i++) home = Math.max(home, Math.hypot(L.pos[i * 3] - L.home[i * 3], L.pos[i * 3 + 1] - L.home[i * 3 + 1], L.pos[i * 3 + 2] - L.home[i * 3 + 2]));
  const raked = { a: a.state, b: b.state, c: c.state, home };
  // out of autumn: no heaps, nothing offered
  W.season = 'winter';
  L.update(0.1, null);
  const winter = { shown: L.group.visible, offered: Number.isFinite(it.distanceTo(c.x - 1.9, c.z)) };
  W.season = was.season;
  L.update(0);
  L.note = null;
  g.state.mode = was.mode;
  g.state.interior = was.interior;
  return { piles, free, shown, walked, ran, burst, jumped, reach, radius: it.radius, offer, kicked, raked, winter };
});
if (leaves) {
  console.log(`  ${leaves.piles} piles; walk → ${leaves.walked}, run → ${leaves.ran}: up to ${leaves.burst.high.toFixed(1)} m, spread ${leaves.burst.spread.toFixed(1)} m, ${leaves.burst.ahead.toFixed(1)} m ahead; "${leaves.burst.note}"; jump → ${leaves.jumped}; "${leaves.offer}" at ${leaves.reach.toFixed(2)} m → ${leaves.kicked}; later ${leaves.raked.a}/${leaves.raked.b}/${leaves.raked.c}`);
  check(leaves.piles >= 5 && leaves.free && leaves.shown, 'the leaf piles lie raked up on open ground in autumn');
  check(leaves.walked === 'heap' && leaves.ran === 'scattered' && leaves.burst.high > 0.9 && leaves.burst.flying === 0 && leaves.burst.spread > 1.4 && leaves.burst.ahead > 0.3 && leaves.burst.note?.startsWith('Leaves everywhere') && leaves.jumped === 'scattered', 'a run or a jump through a pile bursts it, the leaves thrown up to land scattered on ahead; a walk does not');
  check(leaves.reach < leaves.radius && leaves.offer === 'E — kick the leaf pile' && leaves.kicked === 'scattered', 'E at a pile kicks it apart');
  check(leaves.raked.a === 'heap' && leaves.raked.b === 'heap' && leaves.raked.c === 'heap' && leaves.raked.home < 0.01 && !leaves.winter.shown && !leaves.winter.offered, 'the dvornik rakes them up again; out of autumn they are gone');
} else {
  check(false, 'the leaf piles exist');
}

/* ================================================================ puddles */
// the autumn puddles: a jump into one throws the water up round you with
// rings spreading over it, a run through kicks up spray at every step, and
// a car going through one by the curb soaks whoever stands there; not in
// winter, when they are ice
console.log('→ puddles');
const puddled = await page.evaluate(() => {
  const g = window.__game;
  const S = g.puddles;
  if (!S) return null;
  const W = g.world;
  const was = { season: W.season };
  W.season = 'autumn';
  S.update(0);
  const count = S.puddles.length;
  const p = [...S.puddles].sort((a, b) => b.a * b.b - a.a * a.b)[0];
  const found = !!S.puddleAt(p.x, p.z) && S.puddleAt(p.x + p.a + 0.3, p.z) !== p;
  const body = (x, z, ground, vy = 0, speed = 0, vx = 0) => ({ position: { x, y: ground ? p.y : p.y + 0.5, z }, onGround: ground, speed, velocity: { x: vx, y: vy, z: 0 } });
  const settle = () => {
    for (let t = 0; t < 3; t += 0.1) S.update(0.1);
  };
  // a jump in
  S.update(0.05, { player: body(p.x, p.z, false, -5) });
  S.update(0.05, { player: body(p.x, p.z, true) });
  S.update(0.05);
  const jump = { splashes: S.splashes, drops: S.live, rings: S.rings.filter((r) => r.mesh.visible).length, note: S.note };
  settle();
  const after = { drops: S.live, rings: S.rings.filter((r) => r.mesh.visible).length };
  // a run straight across it
  const s0 = S.splashes;
  S.update(0);
  for (let x = p.x - p.a + 0.05; x < p.x + p.a - 0.05; x += 5 * 0.05) S.update(0.05, { player: body(x, p.z, true, 0, 5, 5) });
  const ran = S.splashes - s0;
  settle();
  // a car through it at 12 m/s with you on the pavement, then one creeping by
  const s1 = S.splashes;
  const car = { x: p.x - 0.75, z: p.z - 6, heading: 0 };
  const you = { position: { x: p.x + 1.2, y: p.y, z: p.z }, onGround: true, speed: 0, velocity: { x: 0, y: 0, z: 0 } };
  S.update(0);
  for (let t = 0; t < 1; t += 0.05) {
    car.z += 12 * 0.05;
    S.update(0.05, { player: you, cars: [car] });
  }
  const byCar = { splashes: S.splashes - s1, soaked: S.soaked, note: S.note };
  settle();
  const s2 = S.splashes;
  const slow = { x: p.x - 0.75, z: p.z - 1.5, heading: 0 };
  for (let t = 0; t < 1; t += 0.05) {
    slow.z += 3 * 0.05;
    S.update(0.05, { cars: [slow] });
  }
  const crept = S.splashes - s2;
  settle();
  // and the traffic itself, two minutes round the block: the puddles in the
  // road by the curb get splashed
  const lanes = S.puddles.filter((q) => q.lane).length;
  const onSplash = S.onSplash;
  let trafficSplashes = 0;
  S.onSplash = (x, z, strength, car) => (trafficSplashes += car ? 1 : 0);
  for (let t = 0; t < 120; t += 0.05) {
    W.traffic.update(0.05, {});
    S.update(0.05, { cars: W.trafficCars });
  }
  S.onSplash = onSplash;
  settle();
  // in winter the puddles are ice: nothing to splash
  W.season = 'winter';
  const s3 = S.splashes;
  S.update(0.05, { player: body(p.x, p.z, false, -5) });
  S.update(0.05, { player: body(p.x, p.z, true) });
  const winter = { splashes: S.splashes - s3, shown: S.group.visible };
  W.season = was.season;
  S.update(0);
  S.note = null;
  return { count, found, size: [p.a, p.b], jump, after, ran, byCar, crept, lanes, trafficSplashes, winter };
});
if (puddled) {
  console.log(`  ${puddled.count} autumn puddles; jump → ${puddled.jump.drops} drops, ${puddled.jump.rings} rings, "${puddled.jump.note}"; run across ${(puddled.size[0] * 2).toFixed(1)} m → ${puddled.ran} splashes; a car at 12 m/s → ${puddled.byCar.splashes}, "${puddled.byCar.note}"; at 3 m/s → ${puddled.crept}; ${puddled.lanes} in the road, splashed ${puddled.trafficSplashes}× by the traffic in 2 min`);
  check(puddled.count >= 5 && puddled.found, 'the autumn puddles are known, each an ellipse of water on the ground');
  check(puddled.jump.splashes === 1 && puddled.jump.drops > 40 && puddled.jump.rings >= 1 && puddled.jump.note?.startsWith('Splash') && puddled.after.drops === 0 && puddled.after.rings === 0, 'a jump into one throws the water up and rings spread over it, then all is still again');
  check(puddled.ran >= 2, 'a run through one kicks up spray at the steps');
  check(puddled.byCar.splashes === 1 && puddled.byCar.soaked === 1 && puddled.byCar.note === 'Soaked by a passing car!' && puddled.crept === 0, 'a car going through one fast soaks whoever stands by it; one creeping by does not');
  check(puddled.lanes >= 3 && puddled.trafficSplashes >= 2, 'the traffic splashes through the puddles in the road by the curb');
  check(puddled.winter.splashes === 0 && !puddled.winter.shown, 'in winter there is nothing to splash');
} else {
  check(false, 'the puddles exist');
}

/* ================================================================ ambience */
// the zone sounds follow where you are: a TV murmurs in a stairwell and
// falls silent outside, the engine of a passing car is heard by the road
console.log('→ ambience');
const amb = await page.evaluate(async () => {
  const g = window.__game;
  const s = g.sound;
  s.init();
  // the gains follow the game loop: wait for frames as well as time, so a
  // slow, loaded renderer still gets its 2.5 s of game time
  const sleep = (ms, frames = 60) =>
    new Promise((r) => {
      const until = performance.now() + ms;
      let n = 0;
      const tick = () => (++n >= frames && performance.now() >= until ? r() : requestAnimationFrame(tick));
      requestAnimationFrame(tick);
    });
  const it = g.world.interiors[0];
  const b = it.bounds;
  g.state.mode = 'playing';
  g.state.interior = it;
  g.player.teleport((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0);
  s.setIndoors(true);
  for (let i = 0; i < 30; i++) s.ambience(0.1, { tv: 1 });
  await sleep(2500);
  const tvIn = s.tvGain.gain.value;
  s.setIndoors(false);
  g.state.interior = null;
  // stand on the curb beside a car of the traffic (the game loop hears it)
  const car = g.world.trafficCars[0];
  g.player.teleport(car.x + Math.cos(car.heading) * 4, car.z - Math.sin(car.heading) * 4, 0);
  await sleep(2500);
  const tvOut = s.tvGain.gain.value;
  const carNear = s.carGain.gain.value;
  // the one-shots run without throwing
  s.step('stairs', 2.7);
  s.step('asphalt', 2.7);
  s.skate(8, 0.4);
  s.caw(20, -0.5);
  return { tvIn, tvOut, carNear, state: s.ctx.state };
});
console.log(`  tv in the stairwell ${amb.tvIn.toFixed(3)}, outside ${amb.tvOut.toFixed(4)}; engine beside a car of the traffic ${amb.carNear.toFixed(3)} (audio ${amb.state})`);
check(amb.tvIn > 0.02 && amb.tvOut < 0.005, 'a muffled TV plays in the stairwell, not outside');
check(amb.carNear > 0.01, 'a passing car is heard from the road');

/* ================================================================ static batches */
// everything baked into the static batches must have stayed put through the
// whole run (walks, doors, seasons, time presets): a moved, hidden or
// re-skinned source would be an animation frozen by the batching
console.log('→ static batches');
const batch = await page.evaluate(async () => {
  const { staticBatchDrift } = await import('/src/world/batch.js');
  const g = window.__game;
  return { report: g.world.batchReport, drift: staticBatchDrift(g.world) };
});
console.log(`  baked ${batch.report?.sources} meshes into ${batch.report?.batches} batches (${batch.report?.kept} kept apart)`);
check(batch.report?.batches > 0, 'static batching ran');
check(batch.drift.length === 0, `no baked mesh moved or changed${batch.drift.length ? ' — ' + JSON.stringify(batch.drift.slice(0, 4)) : ''}`);

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
