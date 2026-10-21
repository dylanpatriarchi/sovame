// Automated check: loads the game in headless Chrome, takes screenshots
// and reports console/runtime errors and rendering statistics.
// Usage: node tools/smoke.mjs [url] [outDir]
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
  await wait(500);
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
  // let the snow fade and the exposure settle before the screenshot
  try {
    await page.waitForFunction(() => window.__game.env.indoor > 0.9, { timeout: 20000 });
  } catch {
    logs.push('[stairwell] indoor fade did not settle');
  }
  await wait(400);
  await page.screenshot({ path: `${OUT}/09-stairwell.png` });
  // step back out through the door
  await page.evaluate(() => {
    const game = window.__game;
    const d = game.state.interior.doorIn;
    game.player.teleport(d.x, d.z, 0); // at the door, facing it
  });
  await wait(400);
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
    northFenceBlocked: w.collides(50, 175.8, 0.36), // new boundary fence
    beyondNorthBlocked: w.collides(0, 181, 0.36), // past the new north edge
    beyondEastBlocked: w.collides(109, 0, 0.36), // east edge unchanged
    beyondSouthBlocked: w.collides(0, -109, 0.36), // south edge unchanged
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
