// Tundra check: leaves the town on foot and by car, far past the old world
// edge, with screenshots along the way. Usage (dev server running):
//   node tools/tundra-test.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/tundra';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

const TIME = process.argv[4] ?? 'afternoon';
const shot = async (name, x, z, yaw, pitch = 0) => {
  const info = await page.evaluate(
    (x, z, yaw, pitch, time) => {
      const g = window.__game;
      g.env.setTime(time);
      g.player.teleport(x, z, yaw);
      g.player.pitch = pitch;
      return { y: +g.player.position.y.toFixed(2) };
    },
    x,
    z,
    yaw,
    pitch,
    TIME,
  );
  await wait(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const stats = await page.evaluate(() => {
    const i = window.__game.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  });
  console.log(name, info, stats);
};

// the old east fence line, looking out; then further and further
await shot('01-town-edge', 100, 0, -Math.PI / 2);
await shot('02-past-the-edge', 300, 40, -Math.PI / 2);
await shot('03-back-at-town', 520, 60, Math.PI / 2, 0.05);
await shot('04-deep-tundra', 2400, -1800, 0.6);
await shot('05-hilltop', 5000, 5000, 2.2, -0.1);

// by car: off the avenue's north end and out across the land
const drive = await page.evaluate(() => {
  const g = window.__game;
  const car = g.world.cars[0];
  car.x = 0;
  car.z = 230;
  car.heading = 0;
  car.vx = car.vz = 0;
  g.driving.enter(car);
  return { cars: g.world.cars.length };
});
console.log('driving', drive);
await page.keyboard.down('KeyW');
await wait(9000);
await page.screenshot({ path: `${OUT}/06-drive-seat.png` });
await page.keyboard.press('KeyV');
await wait(2500);
await page.screenshot({ path: `${OUT}/07-drive-chase.png` });
await page.keyboard.up('KeyW');
console.log(
  'car',
  await page.evaluate(() => {
    const c = window.__game.driving.car;
    return { x: +c.x.toFixed(1), z: +c.z.toFixed(1), y: +c.y.toFixed(2), speed: +c.speed.toFixed(1), slopePitch: +c.slopePitch.toFixed(3), slopeRoll: +c.slopeRoll.toFixed(3) };
  }),
);
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
