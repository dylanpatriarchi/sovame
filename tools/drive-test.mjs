// Driving check through the town: an autopilot takes the curb car up the
// avenue, west along ул. Мира, down a yard lane into a courtyard and parks.
// Then the dashboard radio, the night sky, and tea on a yard bench.
// Usage (dev server running): node tools/drive-test.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/drive';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 600000,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
const fail = (m) => errors.push(m);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

// into the car at the curb of the avenue
await page.evaluate(() => {
  const g = window.__game;
  g.env.setTime('afternoon');
  const car = g.world.cars[0];
  g.player.teleport(car.x + 1.9, car.z, Math.PI / 2);
});
await wait(600);
await page.keyboard.press('KeyE');
await wait(1500);
if (!(await page.evaluate(() => window.__game.driving.active))) fail('[drive] E next to the car did not open the door');
await page.screenshot({ path: `${OUT}/01-seat.png` });

// autopilot: steer at the next waypoint, slow down for corners
const ROUTE = [[3, 38], [-10, 46.5], [-33, 46.5], [-40.5, 37], [-40.5, 0], [-40.5, -14]];
await page.evaluate((route) => {
  const g = window.__game;
  const car = g.driving.car;
  const pilot = { i: 0, done: false, impacts: 0, maxImpact: 0, stuck: 0, last: [car.x, car.z] };
  window.__pilot = pilot;
  pilot.timer = setInterval(() => {
    const keys = g.player.keys;
    const [tx, tz] = route[pilot.i];
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    if (car.impact > 0.5) {
      pilot.impacts++;
      pilot.maxImpact = Math.max(pilot.maxImpact, car.impact);
    }
    if (dist < 3.2) {
      pilot.i++;
      if (pilot.i >= route.length) {
        pilot.done = true;
        keys.forward = keys.left = keys.right = false;
        keys.jump = true;
        clearInterval(pilot.timer);
        return;
      }
    }
    let e = Math.atan2(dx, dz) - car.heading;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    keys.left = e > 0.06;
    keys.right = e < -0.06;
    const want = Math.abs(e) > 0.35 || dist < 9 ? 3.2 : 8;
    keys.forward = car.speed < want;
    keys.back = car.speed > want + 2.5;
    keys.jump = false;
  }, 30);
}, ROUTE);
const t0 = Date.now();
let shot = 0;
while (Date.now() - t0 < 420000) {
  await wait(4000);
  const p = await page.evaluate(() => ({ i: window.__pilot.i, done: window.__pilot.done, x: window.__game.driving.car.x, z: window.__game.driving.car.z, s: window.__game.driving.car.speed }));
  if (p.i >= 2 && shot === 0) await page.screenshot({ path: `${OUT}/02-mira.png` }), shot++;
  if (p.i >= 4 && shot === 1) await page.screenshot({ path: `${OUT}/03-lane.png` }), shot++;
  if (p.done) break;
}
const pilot = await page.evaluate(() => {
  const p = window.__pilot;
  clearInterval(p.timer);
  const c = window.__game.driving.car;
  return { done: p.done, leg: p.i, impacts: p.impacts, maxImpact: +p.maxImpact.toFixed(2), x: +c.x.toFixed(1), z: +c.z.toFixed(1), surface: window.__game.world.surfaceAt(c.x, c.z) };
});
console.log('autopilot:', JSON.stringify(pilot));
if (!pilot.done) fail(`[drive] the autopilot never reached the yard (leg ${pilot.leg}, at ${pilot.x}, ${pilot.z})`);
if (pilot.maxImpact > 2) fail(`[drive] hit something hard on the way (${pilot.maxImpact})`);
await page.waitForFunction(() => Math.abs(window.__game.driving.car.speed) < 0.5, { timeout: 60000 });
await page.evaluate(() => (window.__game.player.keys.jump = false));

// the dashboard radio
await page.keyboard.press('KeyR');
await wait(1200);
const radio = await page.evaluate(() => ({ set: window.__game.radioSets.car, on: window.__game.sound.radioOn, ready: window.__game.sound.ready }));
console.log('radio:', JSON.stringify(radio));
if (!radio.set || (radio.ready && !radio.on)) fail('[radio] R did not turn the car radio on');
await page.screenshot({ path: `${OUT}/04-parked.png` });

// out of the car, night, look north for the aurora
await page.keyboard.press('KeyE');
await wait(2000);
if (await page.evaluate(() => window.__game.driving.active)) fail('[drive] could not get out in the yard');
if (await page.evaluate(() => window.__game.sound.ready && window.__game.sound.radioOn)) fail('[radio] the car radio kept playing after getting out');
await page.evaluate(() => {
  const g = window.__game;
  g.env.setTime('night');
  g.player.teleport(0, 150, Math.PI);
  g.player.pitch = 0.42;
});
await wait(14000);
await page.screenshot({ path: `${OUT}/05-aurora.png` });

// tea on a yard bench
const spot = await page.evaluate(() => {
  const g = window.__game;
  const s = g.world.spots.find((x) => x.id === 'spot:yard-ne');
  g.env.setTime('afternoon');
  g.player.teleport(s.stand.x, s.stand.z, s.stand.yaw);
  return s.id;
});
await wait(6000);
await page.keyboard.press('KeyG');
await wait(4500);
const sitting = await page.evaluate(() => ({ smoking: window.__game.state.smoking, mode: window.__game.smoke.mode }));
console.log(`${spot}:`, JSON.stringify(sitting));
if (!sitting.smoking || sitting.mode !== 'tea') fail('[spot] tea on the yard bench did not start');
await page.screenshot({ path: `${OUT}/06-tea.png` });

await browser.close();
if (errors.length) {
  console.error(`FAILED:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('drive test passed');
