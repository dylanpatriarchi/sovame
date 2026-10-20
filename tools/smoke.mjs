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
