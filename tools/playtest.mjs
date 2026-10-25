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
      [-41, -17.8], // round the birch at (-39.2, -16.2)
      [-41, -16],
      [-41, -4],
      [-36, -2.9],
      [-30, -2.9],
      [-29.4, -2.1], // north of the birch at (-28.5, -3.1)
      [-20, -2.1],
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
    const fresh = bt.bus.state === 'dwell' && prev !== 'dwell';
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

/* ================================================================ ambience */
// the zone sounds follow where you are: a TV murmurs in a stairwell and
// falls silent outside, the engine of a passing car is heard by the road
console.log('→ ambience');
const amb = await page.evaluate(async () => {
  const g = window.__game;
  const s = g.sound;
  s.init();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
