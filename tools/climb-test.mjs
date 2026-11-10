// Climb check: an autopilot drives a UAZ van up the sopka spiral to the
// lookout. Usage (dev server running): node tools/climb-test.mjs [time]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const TIME = process.argv[2] ?? 'dusk';
const OUT = 'shots/climb';
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
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

const route = await page.evaluate(async (time) => {
  const g = window.__game;
  g.env.setTime(time);
  const { ROUTES } = await import('/src/world/routes.js');
  const r = ROUTES.find((x) => x.id === 'sopka');
  const van = g.world.cars.find((c) => c.eye.y > 1.4);
  van.x = r.pts[2][0];
  van.z = r.pts[2][1];
  van.heading = Math.atan2(r.pts[4][0] - r.pts[2][0], r.pts[4][1] - r.pts[2][1]);
  van.vx = van.vz = 0;
  g.driving.enter(van);
  window.__van = van;
  window.__pts = r.pts;
  return { n: r.pts.length, end: r.end, endH: r.endH };
}, TIME);
console.log('route', JSON.stringify(route));
await wait(1500);
await page.screenshot({ path: `${OUT}/${TIME}-00-seat.png` });

let held = null;
const press = async (code) => {
  if (held === code) return;
  if (held) await page.keyboard.up(held);
  if (code) await page.keyboard.down(code);
  held = code;
};
await page.keyboard.down('KeyW');
let gas = true;
let last = 0;
for (let tick = 0; tick < 12000; tick++) {
  const s = await page.evaluate(() => {
    const van = window.__van;
    const pts = window.__pts;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - van.x, pts[i][1] - van.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const t = pts[Math.min(best + 3, pts.length - 1)];
    let err = Math.atan2(t[0] - van.x, t[1] - van.z) - van.heading;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    return { i: best, off: bd, err, speed: van.speed, y: van.y };
  });
  await press(s.err > 0.04 ? 'KeyA' : s.err < -0.04 ? 'KeyD' : null);
  // keep it to a sensible pace on the bends
  const want = s.speed < 11;
  if (want !== gas) {
    if (want) await page.keyboard.down('KeyW');
    else await page.keyboard.up('KeyW');
    gas = want;
  }
  if (s.i - last >= 45) {
    last = s.i;
    console.log(`sample ${s.i}/${route.n} off ${s.off.toFixed(1)} m, ${s.speed.toFixed(1)} m/s, y ${s.y.toFixed(1)}`);
    await page.screenshot({ path: `${OUT}/${TIME}-${String(s.i).padStart(3, '0')}.png` });
  }
  if (s.i >= route.n - 4) break;
  await wait(30);
}
await press(null);
await page.keyboard.up('KeyW');
await page.keyboard.down('Space');
await wait(2500);
await page.keyboard.up('Space');
await page.keyboard.press('KeyV');
await wait(2000);
await page.screenshot({ path: `${OUT}/${TIME}-top-chase.png` });
console.log('arrived', JSON.stringify(await page.evaluate(() => ({ x: +window.__van.x.toFixed(1), z: +window.__van.z.toFixed(1), y: +window.__van.y.toFixed(1), speed: +window.__van.speed.toFixed(1) }))));
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
