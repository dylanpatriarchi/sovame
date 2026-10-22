// Driving check: walks up to a parked car, gets in, drives, steers, takes
// screenshots from the seat and the chase camera, crashes into a wall and
// steps out again. Usage: node tools/drive-test.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/drive';
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
const state = () => page.evaluate(() => {
  const g = window.__game;
  const c = g.driving.car;
  return { driving: g.driving.active, x: +g.player.position.x.toFixed(2), z: +g.player.position.z.toFixed(2), speed: c ? +c.speed.toFixed(2) : 0, heading: c ? +c.heading.toFixed(2) : 0, prompt: document.getElementById('prompt')?.textContent };
});

// the curb car on the avenue (4.75, 86) facing north
await page.evaluate(() => {
  const g = window.__game;
  g.env.setTime('afternoon');
  g.player.teleport(6.6, 85, Math.PI / 2);
});
await wait(600);
console.log('near car:', await state());
await page.keyboard.press('KeyE');
await wait(1500);
await wait(1500);
console.log('after E:', await state());
await page.screenshot({ path: `${OUT}/01-seat.png` });
await page.keyboard.down('KeyW');
await wait(3000);
console.log('throttle 3 s:', await state());
await page.screenshot({ path: `${OUT}/02-driving.png` });
await page.keyboard.down('KeyA');
await wait(1500);
await page.keyboard.up('KeyA');
console.log('steer left 1.5 s:', await state());
await page.keyboard.press('KeyV');
await wait(900);
await page.screenshot({ path: `${OUT}/03-chase.png` });
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
await wait(2500);
await page.keyboard.up('KeyS');
console.log('braked:', await state());
// crash test: aim at a building and floor it
await page.evaluate(() => {
  const c = window.__game.driving.car;
  c.x = 0; c.z = 95; c.heading = Math.PI / 2 * 0; c.vx = 0; c.vz = 0;
});
await page.keyboard.down('KeyW');
await wait(6000);
await page.keyboard.up('KeyW');
console.log('crash run north (fence at z=176?):', await state());
// coast to a stop (engine braking)
await page.waitForFunction(() => Math.abs(window.__game.driving.car.speed) < 0.5, { timeout: 60000 });
await page.screenshot({ path: `${OUT}/04-after.png` });
console.log('before exit:', await state());
await page.keyboard.press('KeyE');
await wait(1500);
console.log('after exit E:', await state());
await page.screenshot({ path: `${OUT}/05-out.png` });
console.log('errors:', errors);
await browser.close();
