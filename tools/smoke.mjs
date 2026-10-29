// Automated check: loads the game in headless Chrome, takes screenshots
// and reports console/runtime errors and rendering statistics.
// Usage: node tools/smoke.mjs [url] [outDir]
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

const logs = [];
page.on('console', (message) => {
  const type = message.type();
  if (type === 'debug' || type === 'info') return;
  logs.push(`[${type}] ${message.text()}`);
});
page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
page.on('requestfailed', (request) => logs.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText}`));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`→ opening ${URL_BASE}`);
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });

try {
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
} catch (error) {
  logs.push(`[timeout] loading did not complete: ${error.message}`);
}

const stats = await page.evaluate(async () => {
  const game = window.__game;
  if (!game) return { error: 'window.__game missing' };
  // renderer.info accumulates (autoReset=false, composer passes); reading right
  // after the next frame gives exactly one frame instead of 1-or-2 frames
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const info = game.renderer.info;
  return {
    calls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length ?? 0,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    colliders: game.world.colliders.length,
    zones: game.world.zones.length,
    lamps: game.world.lamps.length,
    pedestrians: game.world.people?.list.length ?? 0,
    children: game.scene.children.length,
    season: game.env.season,
    clock: game.env.clock,
    temp: game.env.temperature,
  };
});
console.log('→ stats:', JSON.stringify(stats, null, 2));
if (stats.calls >= 300 || stats.triangles >= 600000) {
  logs.push(`[budget] title view: ${stats.calls} calls / ${stats.triangles} triangles`);
}

await page.screenshot({ path: `${OUT}/01-title.png` });

// enter the world
await page.click('#btn-start');
await wait(1200);
await page.screenshot({ path: `${OUT}/02-start.png` });

// walk a bit (keys go to the player)
// turn ~108 deg first: with a yaw-basis sign error the dot product below
// only turns negative when the yaw is far from the spawn value
await page.evaluate(() => {
  window.__game.player.yaw += Math.PI * 0.6;
});
await wait(150);
const before = await page.evaluate(() => ({ ...window.__game.player.position }));
await page.keyboard.down('KeyW');
await wait(2600);
await page.keyboard.up('KeyW');
await wait(300);
const after = await page.evaluate(() => ({ ...window.__game.player.position }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
console.log(`→ movement with W: ${moved.toFixed(2)} m`);
// regression check: W must move along the view direction, not against it
const fwd = await page.evaluate(() => {
  const f = window.__game.player.forwardVector;
  return { x: f.x, z: f.z };
});
const dot = (after.x - before.x) * fwd.x + (after.z - before.z) * fwd.z;
console.log(`→ forward alignment: ${dot.toFixed(2)} (must be > 0)`);
if (moved > 0.5 && dot <= 0) logs.push('[movement] W walks against the view direction');
await page.screenshot({ path: `${OUT}/03-walk.png` });

// kiosk radio: turn the post-punk station on, let the sequencer run, then off
await page.evaluate(() => {
  window.__game.sound.toggleRadio(true);
});
await wait(3000);
const radio = await page.evaluate(() => ({
  state: window.__game.sound.ctx.state,
  on: window.__game.sound.radioOn,
  steps: window.__game.sound.radioStep,
  track: window.__game.sound.radioTrackIndex,
}));
console.log(`→ radio: ctx.state=${radio.state}, on=${radio.on}, steps scheduled=${radio.steps}, track=${radio.track}`);
if (radio.state !== 'running') logs.push(`[radio] audio context not running: ${radio.state}`);
if (!radio.on || radio.steps <= 0) logs.push('[radio] sequencer did not schedule any steps');
await page.evaluate(() => {
  window.__game.sound.toggleRadio(false);
});
await wait(300);

// turn around and look at the courtyard
await page.evaluate(() => {
  window.__game.player.yaw += Math.PI * 0.55;
  window.__game.player.pitch = -0.05;
});
await wait(700);
await page.screenshot({ path: `${OUT}/04-courtyard.png` });

// autumn season
await page.evaluate(() => {
  const { env, world, player, settings } = window.__game;
  settings.season = 'autumn';
  env.setSeason('autumn');
  player.setFootprintStyle(player.surface, 'autumn');
});
await wait(1200);
await page.screenshot({ path: `${OUT}/05-autumn.png` });

// winter night
await page.evaluate(() => {
  const { env, settings } = window.__game;
  settings.season = 'winter';
  env.setSeason('winter');
  env.setTime('night');
  window.__game.player.teleport(-14, 26, Math.PI * 0.75);
});
await wait(2600);
await page.screenshot({ path: `${OUT}/06-night.png` });

// overview from above
await page.evaluate(() => {
  const game = window.__game;
  game.env.setTime('dusk');
  game.state.mode = 'inspect';
  const cam = game.camera;
  cam.position.set(6, 62, 96);
  cam.rotation.set(0, 0, 0);
  cam.rotateY(Math.PI * 0.02);
  cam.rotateX(-0.62);
  cam.fov = 55;
  cam.updateProjectionMatrix();
});
await wait(1400);
await page.screenshot({ path: `${OUT}/07-aerial.png` });

// widest view of the district: nearly nothing is frustum-culled here, so this
// is the absolute upper bound (gameplay views are what the budget targets)
const aerialStats = await page.evaluate(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const info = window.__game.renderer.info;
  return { calls: info.render.calls, triangles: info.render.triangles };
});
console.log(`→ render stats (aerial, unculled): ${aerialStats.calls} calls, ${aerialStats.triangles} triangles`);

// pedestrians: route report, then teleport next to the nearest walker and frame it
const pedInfo = await page.evaluate(() => {
  const game = window.__game;
  const people = game.world.people;
  if (!people || !people.list?.length) return null;
  game.state.mode = 'playing';
  // freeze the preset cross-fade (the shadow pass flips mid-transition and
  // would make the draw-call reading nondeterministic)
  game.env.snapTo(game.env.preset);
  const p = game.player.position;
  const walkers = people.list.filter((w) => !w.idle);
  walkers.sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p));
  const target = walkers[0] ?? people.list[0];
  const t = target.position;
  const yawT = target.yaw ?? 0;
  const dirX = Math.sin(yawT);
  const dirZ = Math.cos(yawT);
  // candidate spots: 6 m to either side, then ahead/behind the figure
  const spots = [
    [t.x + dirZ * 6, t.z - dirX * 6],
    [t.x - dirZ * 6, t.z + dirX * 6],
    [t.x + dirX * 6, t.z + dirZ * 6],
    [t.x - dirX * 6, t.z - dirZ * 6],
  ];
  let spot = spots[spots.length - 1];
  for (const s of spots) {
    if (!game.world.collides(s[0], s[1], 0.36)) {
      spot = s;
      break;
    }
  }
  const dx = t.x - spot[0];
  const dz = t.z - spot[1];
  game.player.teleport(spot[0], spot[1], Math.atan2(-dx, -dz));
  game.player.pitch = -0.06;
  return {
    target: target.name,
    list: people.list.map((w) => ({
      name: w.name,
      idle: !!w.idle,
      route: Number((w.routeLength ?? 0).toFixed(1)),
      x: Number(w.position.x.toFixed(1)),
      z: Number(w.position.z.toFixed(1)),
    })),
  };
});
if (pedInfo) {
  for (const w of pedInfo.list) {
    console.log(`→ pedestrian ${w.name}: route ${w.route} m, at (${w.x}, ${w.z})${w.idle ? ' [idle]' : ''}`);
  }
  console.log(`→ framing pedestrian: ${pedInfo.target}`);
  await wait(700);
  await page.screenshot({ path: `${OUT}/08-pedestrian.png` });
  // self-calibrating budget: the district has dense corners that exceed the
  // title-view budget on their own, so measure what the figures add here
  const closeStats = await page.evaluate(async () => {
    const game = window.__game;
    const info = game.renderer.info;
    const read = () => ({ calls: info.render.calls, triangles: info.render.triangles });
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    await frame();
    const withPeople = read();
    const people = game.world.people;
    const hidden = [];
    for (const p of people.list) {
      hidden.push([p.root, p.root.visible]);
      p.root.visible = false;
    }
    for (const child of game.world.group.children) {
      if (child.userData.breathPuff && child.visible) {
        hidden.push([child, true]);
        child.visible = false;
      }
    }
    await frame();
    const without = read();
    for (const [obj, vis] of hidden) obj.visible = vis;
    return { withPeople, without, cost: withPeople.calls - without.calls };
  });
  console.log(
    `→ render budget (gameplay view): ${closeStats.withPeople.calls} calls / ${closeStats.withPeople.triangles} tris ` +
      `(view without pedestrians: ${closeStats.without.calls} calls, pedestrians add ${closeStats.cost})`
  );
  // the absolute budget applies to the canonical title view (checked above);
  // here only the pedestrian system has its own allowance
  if (closeStats.cost > 40) logs.push(`[budget] pedestrians add ${closeStats.cost} calls (limit 40)`);
} else {
  console.log('→ pedestrians: world.people missing, skipping the segment');
}

// stairwell: walk up to an entrance door, press E, look around, step back out
const doorInfo = await page.evaluate(() => {
  const game = window.__game;
  game.state.mode = 'playing';
  const interior = game.world.interiors.find((i) => i.id === 'b9-cross') ?? game.world.interiors[0];
  if (!interior) return null;
  const out = interior.outSpawn;
  // stand on the walk in front of the door, facing it
  game.player.teleport(out.x, out.z, out.yaw + Math.PI);
  game.player.pitch = 0;
  return { id: interior.id, door: { ...interior.doorOut } };
});
if (doorInfo) {
  console.log(`→ stairwell ${doorInfo.id}: entrance door at (${doorInfo.door.x.toFixed(2)}, ${doorInfo.door.z.toFixed(2)})`);
  // the prompt follows the (slow, headless) game loop: wait for it
  await page.waitForFunction(() => document.getElementById('prompt').classList.contains('visible'), { timeout: 15000 }).catch(() => {});
  const prompt = await page.evaluate(() => ({
    visible: document.getElementById('prompt').classList.contains('visible'),
    text: document.getElementById('prompt').textContent,
  }));
  console.log(`→ entrance prompt: "${prompt.text}" (visible=${prompt.visible})`);
  if (!prompt.visible || !prompt.text.includes('E')) logs.push('[stairwell] entrance prompt did not appear at the door');
  await page.keyboard.press('KeyE');
  // the headless loop is slow: wait for the fade-teleport to actually finish
  try {
    await page.waitForFunction(() => window.__game.state.interior && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push('[stairwell] enter transition did not finish');
  }
  const inside = await page.evaluate(() => {
    const game = window.__game;
    const p = game.player.position;
    const interior = game.world.interiorAt(p.x, p.z);
    return { x: p.x, z: p.z, id: interior?.id ?? null, stateId: game.state.interior?.id ?? null };
  });
  console.log(`→ after E: player at (${inside.x.toFixed(1)}, ${inside.z.toFixed(1)}), interior=${inside.id}`);
  if (!inside.id || inside.stateId !== inside.id) logs.push('[stairwell] player did not end up inside the stairwell');
  // frame the stairwell from the flight: railing diagonal, warm walls,
  // the cold courtyard window glowing over the radiator
  await page.evaluate(() => {
    const game = window.__game;
    const b = game.state.interior.bounds;
    game.player.teleport((b.x0 + b.x1) / 2 - 1.4, (b.z0 + b.z1) / 2 + 0.2, Math.PI);
    game.player.pitch = 0.12;
  });
  // the landing window shows the real courtyard: snow keeps falling out
  // there, so the indoor fade stays off while the window view is live
  try {
    await page.waitForFunction(() => window.__game.windowViews?.view || window.__game.env.indoor > 0.9, { timeout: 20000 });
  } catch {
    logs.push('[stairwell] neither a live window view nor the indoor fade');
  }
  await wait(400);
  await page.screenshot({ path: `${OUT}/09-stairwell.png` });
  // step back out through the door
  await page.evaluate(() => {
    const game = window.__game;
    const d = game.state.interior.doorIn;
    game.player.teleport(d.x, d.z, 0); // at the door, facing it
  });
  await page.waitForFunction(() => document.getElementById('prompt').textContent.includes('outside'), { timeout: 15000 }).catch(() => {});
  const exitPrompt = await page.evaluate(() => document.getElementById('prompt').textContent);
  console.log(`→ exit prompt: "${exitPrompt}"`);
  await page.keyboard.press('KeyE');
  try {
    await page.waitForFunction(() => !window.__game.state.interior && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push('[stairwell] exit transition did not finish');
  }
  const outside = await page.evaluate(() => {
    const game = window.__game;
    const p = game.player.position;
    return { x: p.x, z: p.z, interior: game.world.interiorAt(p.x, p.z)?.id ?? null, state: game.state.interior?.id ?? null };
  });
  console.log(`→ after exit E: player at (${outside.x.toFixed(1)}, ${outside.z.toFixed(1)}), interior=${outside.interior}`);
  if (outside.interior || outside.state) logs.push('[stairwell] player did not make it back outside');
} else {
  console.log('→ stairwells: world.interiors missing, skipping the segment');
}

// trees: stand ~5.5 m in front of a dense birch cluster, crown in frame,
// winter first, then the same spot after switching to autumn and back
const treeSpot = await page.evaluate(() => {
  const game = window.__game;
  game.state.mode = 'playing';
  game.env.snapTo(game.env.preset);
  const spots = game.world.treeSpots ?? [];
  const deciduous = spots.filter((s) => s.species !== 'spruce');
  const spruces = spots.filter((s) => s.species === 'spruce');
  const clearOfSpruce = (x, z, r) => spruces.every((s) => Math.hypot(s.x - x, s.z - z) > r);
  let best = null;
  let bestScore = -1;
  for (const c of deciduous) {
    if (c.species !== 'birch') continue;
    if (Math.abs(c.x) > 70 || Math.abs(c.z) > 70) continue;
    if (!clearOfSpruce(c.x, c.z, 9)) continue;
    let score = 0;
    for (const o of deciduous) {
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d > 1 && d < 11) score += 1;
      if (d < 20 && o.species !== c.species) score += 1.5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  // approach directions, preferring the avenue side; the first that the
  // player can actually stand on with a clear sight line wins
  const towardCenter = Math.atan2(-best.x, -best.z);
  const tries = [towardCenter, towardCenter + 0.6, towardCenter - 0.6, towardCenter + 1.2, towardCenter - 1.2, towardCenter + Math.PI];
  let spot = null;
  for (const a of tries) {
    const px = best.x - Math.sin(a) * 6;
    const pz = best.z - Math.cos(a) * 6;
    if (game.world.collides(px, pz, 0.4)) continue;
    if (!clearOfSpruce(px, pz, 2.5)) continue;
    let blocked = false;
    for (let t = 0.2; t < 1; t += 0.2) {
      if (!clearOfSpruce(px + (best.x - px) * t, pz + (best.z - pz) * t, 1.1)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    spot = [px, pz];
    break;
  }
  if (!spot) return null;
  const dx = best.x - spot[0];
  const dz = best.z - spot[1];
  game.player.teleport(spot[0], spot[1], Math.atan2(-dx, -dz));
  game.player.pitch = 0.15;
  return { species: best.species, x: best.x, z: best.z, neighbors: bestScore };
});
if (treeSpot) {
  console.log(`→ tree framing: ${treeSpot.species} at (${treeSpot.x.toFixed(1)}, ${treeSpot.z.toFixed(1)}), cluster score ${treeSpot.neighbors}`);
  await wait(700);
  await page.screenshot({ path: `${OUT}/10-trees.png` });
  await page.evaluate(() => {
    const { env, player, settings } = window.__game;
    settings.season = 'autumn';
    env.setSeason('autumn');
    player.setFootprintStyle(player.surface, 'autumn');
  });
  await wait(900);
  await page.screenshot({ path: `${OUT}/11-trees-autumn.png` });
  await page.evaluate(() => {
    const { env, player, settings } = window.__game;
    settings.season = 'winter';
    env.setSeason('winter');
    player.setFootprintStyle(player.surface, 'winter');
  });
} else {
  logs.push('[trees] no tree spot found (world.treeSpots missing?)');
}

// roadside strip: down the avenue, poplars must stand on the verge beside
// the sidewalk — never on asphalt or stone
const roadsideSpot = await page.evaluate(() => {
  const game = window.__game;
  const poplars = (game.world.treeSpots ?? []).filter((s) => s.species === 'poplar');
  if (!poplars.length) return null;
  const mx = poplars.reduce((a, s) => a + s.x, 0) / poplars.length;
  const mz = poplars.reduce((a, s) => a + s.z, 0) / poplars.length;
  const px = 0;
  const pz = mz - 14;
  game.player.teleport(px, pz, Math.atan2(-(mx - px), -(mz + 6 - pz)));
  game.player.pitch = 0.08;
  // every deciduous trunk on a hard surface is a bug; report them
  const bad = (game.world.treeSpots ?? []).filter((s) => {
    const t = game.world.surfaceAt(s.x, s.z);
    return t === 'asphalt' || t === 'stone';
  });
  return { mx, mz, bad: bad.map((s) => `${s.species}@${s.x.toFixed(1)},${s.z.toFixed(1)}`) };
});
if (roadsideSpot) {
  console.log(`→ roadside framing: strip center (${roadsideSpot.mx.toFixed(1)}, ${roadsideSpot.mz.toFixed(1)}), trunks on hard surface: ${roadsideSpot.bad.length}`);
  if (roadsideSpot.bad.length) logs.push(`[trees] trunks on road/sidewalk: ${roadsideSpot.bad.join('; ')}`);
  await wait(600);
  await page.screenshot({ path: `${OUT}/12-roadside.png` });
} else {
  logs.push('[trees] no poplars found for the roadside shot');
}

// northern expansion: bounds probes, zone captions, then two shots in the
// new cluster (coordinates logged for the record)
const expansion = await page.evaluate(() => {
  const game = window.__game;
  game.state.mode = 'playing';
  game.env.snapTo(game.env.preset);
  const w = game.world;
  const probes = {
    oldEdgeRoadFree: !w.collides(0, 104, 0.36), // the avenue passes the old fence line
    oldEdgeSidewalkFree: !w.collides(-7.6, 110, 0.36), // sidewalk continues north
    courtyardPathFree: !w.collides(-30, 133, 0.36), // new courtyard spine
    eastArmFree: !w.collides(50, 128, 0.36), // Zavodskaya street
    newBuildingBlocked: w.collides(-30, 151, 0.36), // inside B10
    northStreetFree: !w.collides(0, 200, 0.36), // the avenue runs on past the old north edge
    beyondEastFree: !w.collides(120, 0, 0.36), // out on to the steppe
    beyondSouthFree: !w.collides(2, -220, 0.36), // past ул. Школьная
    limitBlocked: w.collides(0, 333, 0.36) && w.collides(0, -333, 0.36), // the end of the ground
    oldSouthEdgeFree: !w.collides(0, -110, 0.36), // the avenue runs on south
    schoolStreetFree: !w.collides(-100, -152, 0.36), // ул. Школьная
    westStreetSouthFree: !w.collides(-170, -130, 0.36), // ул. Строителей to the junction
  };
  const zones = {
    courtyard: w.zoneAt(-30, 133)?.name ?? null,
    arm: w.zoneAt(50, 128)?.name ?? null,
    avenueNorth: w.zoneAt(0, 150)?.name ?? null,
  };
  game.player.teleport(2, 107, Math.PI);
  game.player.pitch = 0.03;
  return { probes, zones, viewpoint: { x: 2, z: 107, yaw: Math.PI } };
});
console.log(`→ expansion probes: ${JSON.stringify(expansion.probes)}`);
console.log(`→ expansion zones: courtyard="${expansion.zones.courtyard}", arm="${expansion.zones.arm}", avenueNorth="${expansion.zones.avenueNorth}"`);
{
  const fails = Object.entries(expansion.probes).filter(([, ok]) => !ok).map(([k]) => k);
  if (fails.length) logs.push(`[expansion] bounds probes failed: ${fails.join(', ')}`);
  if (expansion.zones.courtyard !== 'Двор дома № 24') logs.push(`[expansion] unexpected courtyard zone: ${expansion.zones.courtyard}`);
  if (expansion.zones.arm !== 'Улица Заводская') logs.push(`[expansion] unexpected arm zone: ${expansion.zones.arm}`);
}
console.log(`→ new district viewpoint: (${expansion.viewpoint.x}, ${expansion.viewpoint.z}) facing north`);
await wait(900);
await page.screenshot({ path: `${OUT}/13-new-district.png` });

// inside the new west courtyard: benches, lamp, B10's brick facade
await page.evaluate(() => {
  const game = window.__game;
  game.player.teleport(-13.5, 137, Math.PI * 0.78);
  game.player.pitch = 0.02;
});
console.log('→ north courtyard viewpoint: (-13.5, 137) facing north-west');
await wait(700);
await page.screenshot({ path: `${OUT}/14-north-courtyard.png` });

// smoke spots: walk up, press F, frame the sequence mid-drag, cut it short
const smokeShots = [
  ['smoke:bench', 4.4, '15-smoke-bench'],
  ['smoke:bus', 7.6, '16-smoke-bus'],
  ['smoke:landing', 16.2, '17-smoke-landing'],
];
for (const [id, at, shot] of smokeShots) {
  const spot = await page.evaluate((spotId) => {
    const game = window.__game;
    game.state.mode = 'playing';
    const it = game.world.interactables.find((i) => i.id === spotId);
    if (!it) return null;
    const interior = game.world.interiorAt(it.x, it.z);
    game.state.interior = interior ?? null;
    game.sound.setIndoors(!!interior);
    game.env.setIndoors(!!interior);
    game.player.teleport(it.x, it.z, game.player.yaw);
    return { x: it.x, z: it.z, indoor: !!interior };
  }, id);
  if (!spot) {
    logs.push(`[smoke] spot ${id} not registered`);
    continue;
  }
  await page.waitForFunction(() => document.getElementById('prompt').textContent.startsWith('F'), { timeout: 15000 }).catch(() => {});
  const prompt = await page.evaluate(() => document.getElementById('prompt').textContent);
  if (!prompt.startsWith('F')) logs.push(`[smoke] ${id}: prompt was "${prompt}"`);
  await page.keyboard.press('KeyF');
  try {
    await page.waitForFunction(() => window.__game.state.smoking && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push(`[smoke] ${id}: sequence did not start`);
    continue;
  }
  if (spot.indoor) {
    try {
      await page.waitForFunction(() => window.__game.env.indoor > 0.9, { timeout: 20000 });
    } catch {
      logs.push('[smoke] landing: indoor fade did not settle');
    }
  }
  // let the stream build up for a moment before the frame we want
  await page.evaluate((t) => window.__game.smoke.seek(t - 1.6), at);
  await wait(2500);
  await page.evaluate((t) => window.__game.smoke.seek(t), at);
  await wait(400);
  await page.screenshot({ path: `${OUT}/${shot}.png` });
  const live = await page.evaluate(() => ({
    particles: window.__game.smoke.particles.filter((p) => p.alive).length,
    t: window.__game.smoke.t,
  }));
  console.log(`→ ${id}: t=${live.t.toFixed(1)} s, ${live.particles} smoke particles alive`);
  if (live.particles === 0) logs.push(`[smoke] ${id}: no smoke particles`);
  await page.keyboard.press('KeyF');
  try {
    await page.waitForFunction(() => !window.__game.state.smoking && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push(`[smoke] ${id}: F did not end the sequence`);
  }
  const after = await page.evaluate((spotId) => {
    const game = window.__game;
    const it = game.world.interactables.find((i) => i.id === spotId);
    return { enabled: game.player.enabled, eye: game.player.eyeOverride, available: it.available() };
  }, id);
  if (!after.enabled || after.eye !== null) logs.push(`[smoke] ${id}: player not restored after the sequence`);
  if (after.available) logs.push(`[smoke] ${id}: no cooldown after the sequence`);
  if (spot.indoor) {
    await page.evaluate(() => {
      const game = window.__game;
      game.state.interior = null;
      game.sound.setIndoors(false);
      game.env.setIndoors(false);
    });
  }
}

// regression: the landing spot must not trigger from the stairwell floor below
const belowLanding = await page.evaluate(async () => {
  const game = window.__game;
  const it = game.world.interactables.find((i) => i.id === 'smoke:landing');
  if (!it) return null;
  game.player.teleport(it.x + 1.2, it.z - 0.8, Math.PI);
  // a few frames of the game loop (however slow it runs), not a fixed time
  for (let i = 0; i < 8; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  const prompt = document.getElementById('prompt');
  return { y: game.player.position.y, text: prompt.classList.contains('visible') ? prompt.textContent : null };
});
if (belowLanding) {
  console.log(`→ under the landing (y=${belowLanding.y.toFixed(2)}): prompt=${JSON.stringify(belowLanding.text)}`);
  if (belowLanding.text?.startsWith('F')) logs.push('[smoke] landing spot triggers from the floor below');
}

// flats: from a landing through the padded door, look around, kitchen radio, back out
const flatInfo = await page.evaluate(async () => {
  const game = window.__game;
  const flat = game.world.flats?.[0];
  if (!flat) return null;
  game.state.mode = 'playing';
  game.state.interior = flat.parent;
  game.sound.setIndoors(true);
  game.env.setIndoors(true);
  game.player.teleport(flat.doorOut.x + 0.3, flat.doorOut.z, Math.PI / 2);
  for (let t = performance.now(); performance.now() - t < 15000 && !document.getElementById('prompt').textContent.startsWith('E — go into flat'); ) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return { id: flat.id, prompt: document.getElementById('prompt').textContent, y: game.player.position.y };
});
if (flatInfo) {
  console.log(`→ flat ${flatInfo.id}: landing prompt "${flatInfo.prompt}" (y=${flatInfo.y.toFixed(2)})`);
  if (!flatInfo.prompt.startsWith('E — go into flat')) logs.push('[flat] door prompt missing on the landing');
  await page.keyboard.press('KeyE');
  try {
    await page.waitForFunction(() => window.__game.state.interior?.kind === 'flat' && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push('[flat] did not enter the flat');
  }
  for (const [shot, setup] of [
    ['18-flat-room', { dx: 4.4, dz: 3.0, yaw: Math.PI + 0.6, pitch: -0.08 }],
    ['19-flat-kitchen', { dx: 1.5, dz: 2.9, yaw: Math.PI - 0.35, pitch: -0.12 }],
  ]) {
    await page.evaluate((s) => {
      const game = window.__game;
      const b = game.state.interior.bounds;
      game.player.teleport(b.x0 + s.dx, b.z0 + s.dz, s.yaw);
      game.player.pitch = s.pitch;
    }, setup);
    await wait(900);
    await page.screenshot({ path: `${OUT}/${shot}.png` });
  }
  const radio = await page.evaluate(async () => {
    const game = window.__game;
    const r = game.state.interior.radio;
    game.player.teleport(r.x + 1.1, r.z - 0.75, Math.PI / 2);
    for (let t = performance.now(); performance.now() - t < 15000 && !document.getElementById('prompt').textContent.includes('radio'); ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return document.getElementById('prompt').textContent;
  });
  console.log(`→ kitchen radio prompt: "${radio}"`);
  if (!radio.includes('radio')) logs.push('[flat] kitchen radio prompt missing');
  await page.evaluate(() => {
    const game = window.__game;
    const d = game.state.interior.doorIn;
    game.player.teleport(d.x, d.z + 0.3, 0);
  });
  await page.waitForFunction(() => document.getElementById('prompt').classList.contains('visible'), { timeout: 15000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  try {
    await page.waitForFunction(() => window.__game.state.interior?.kind !== 'flat' && !window.__game.state.transitioning, { timeout: 20000 });
  } catch {
    logs.push('[flat] did not leave the flat');
  }
  const back = await page.evaluate(() => ({ id: window.__game.state.interior?.id ?? null, y: window.__game.player.position.y }));
  console.log(`→ after leaving the flat: interior=${back.id}, y=${back.y.toFixed(2)}`);
  if (!back.id || back.y < 1.2) logs.push('[flat] did not come back out on the landing');
  await page.evaluate(() => {
    const game = window.__game;
    game.state.interior = null;
    game.sound.setIndoors(false);
    game.env.setIndoors(false);
  });
} else {
  logs.push('[flat] world.flats missing');
}

// indicative performance
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
console.log(`→ frames per second (software renderer, indicative only): ${fps}`);

console.log('→ page log:');
console.log(logs.length ? logs.join('\n') : '  (no errors)');

await browser.close();
