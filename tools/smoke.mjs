// Smoke test: boots the game in headless Chrome, looks around the town,
// drives a car for a few seconds and sits down at a spot. Fails (exit 1) on
// any console error. Usage (dev server running):
//   node tools/smoke.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/smoke';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 420000,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => errors.push(msg);

await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

// a few fixed looks at the town and the land
for (const [name, x, z, yaw] of [
  ['avenue', 7.2, 19.5, 0.08],
  ['courtyard', -8, -30, Math.PI / 2],
  ['port-road', 300, 90, -Math.PI / 2],
]) {
  await page.evaluate((x, z, yaw) => window.__game.player.teleport(x, z, yaw), x, z, yaw);
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const info = await page.evaluate(() => window.__game.renderer.info.render);
  console.log(`→ ${name}: ${info.calls} calls, ${info.triangles} triangles`);
}

// behind the wheel
const before = await page.evaluate(() => {
  const g = window.__game;
  const car = g.world.cars[0];
  car.x = 0;
  car.z = 230;
  car.heading = 0;
  car.vx = car.vz = 0;
  g.driving.enter(car);
  return { z: car.z, cars: g.world.cars.length };
});
await page.keyboard.down('KeyW');
await wait(6000);
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${OUT}/driving.png` });
const after = await page.evaluate(() => ({ z: window.__game.driving.car.z, speed: window.__game.driving.car.speed }));
console.log(`→ drove ${(after.z - before.z).toFixed(1)} m, ${after.speed.toFixed(1)} m/s (${before.cars} cars)`);
if (after.z - before.z < 3) fail('[drive] the car did not move');
await page.keyboard.down('Space');
await wait(3500);
await page.keyboard.up('Space');
await page.keyboard.press('KeyE');
await wait(2500);
if (await page.evaluate(() => window.__game.driving.active)) fail('[drive] could not get out of the car');

// a bench: tea from the thermos
const spot = await page.evaluate(() => {
  const g = window.__game;
  const s = g.world.spots[0];
  g.player.teleport(s.stand.x, s.stand.z, s.stand.yaw);
  return s.id;
});
await wait(800);
await page.keyboard.press('KeyG');
await wait(3000);
const sitting = await page.evaluate(() => ({ smoking: window.__game.state.smoking, mode: window.__game.smoke.mode }));
console.log(`→ ${spot}: ${JSON.stringify(sitting)}`);
if (!sitting.smoking || sitting.mode !== 'tea') fail('[spot] sitting down for tea did not start');
await page.screenshot({ path: `${OUT}/spot.png` });

await browser.close();
if (errors.length) {
  console.error(`FAILED:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('smoke test passed');
