// Town look check: a few fixed street-level views, by day and at blue hour.
// Usage (dev server running): node tools/town-test.mjs [url] [outDir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/town';
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

// yaw 0 looks toward -z, +PI/2 toward -x
const VIEWS = [
  ['facade-close', 36, 80, 0, 0.12],
  ['facade-piles', 30, 72.5, 0.5, -0.05],
  ['avenue', 7.2, 19.5, 0.08, 0.05],
  ['courtyard', -8, -30, Math.PI / 2, 0.08],
  ['tower', -20, 40, Math.PI / 2 + 0.5, 0.2],
  ['north', 0, 100, Math.PI, 0.08],
];
for (const time of (process.argv[4] ? [process.argv[4]] : ['afternoon', 'dusk'])) {
  for (const [name, x, z, yaw, pitch] of VIEWS) {
    await page.evaluate(
      (x, z, yaw, pitch, time) => {
        const g = window.__game;
        g.env.setTime(time);
        g.player.teleport(x, z, yaw);
        g.player.pitch = pitch;
      },
      x,
      z,
      yaw,
      pitch,
      time,
    );
    await wait(time === 'dusk' && name === VIEWS[0][0] ? 9000 : 1200);
    await page.screenshot({ path: `${OUT}/${time}-${name}.png` });
  }
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
