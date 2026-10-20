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

const stats = await page.evaluate(() => {
  const game = window.__game;
  if (!game) return { error: 'window.__game missing' };
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
    children: game.scene.children.length,
    season: game.env.season,
    clock: game.env.clock,
    temp: game.env.temperature,
  };
});
console.log('→ stats:', JSON.stringify(stats, null, 2));

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
