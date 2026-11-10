// Scripted camera tour: screenshots from fixed viewpoints for visual review.
// Usage: node tools/tour.mjs [url] [outDir] [views.json]
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const URL_BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? 'shots/tour';
const VIEWS = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : [];
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 420000,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--window-size=1280,760'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('hidden'), { timeout: 180000 });
await page.click('#btn-start');
await wait(800);

for (const v of VIEWS) {
  await page.evaluate((v) => {
    const g = window.__game;
    if (v.time) g.env.setTime(v.time);
    if (v.nofog && !g.__nofog) { g.__nofog = true; Object.defineProperty(g.scene.fog, 'density', { get: () => 0, set() {} }); }
    if (v.cam) {
      g.state.mode = 'inspect';
      const cam = g.camera;
      cam.position.set(...v.cam);
      cam.lookAt(...v.look);
      cam.fov = v.fov ?? 60;
      cam.updateProjectionMatrix();
    } else {
      g.state.mode = 'playing';
      g.player.teleport(v.x, v.z, v.yaw ?? 0);
      g.player.pitch = v.pitch ?? -0.05;
    }
  }, v);
  await wait(v.wait ?? 900);
  await page.screenshot({ path: `${OUT}/${v.name}.png` });
  console.log('shot', v.name);
}
await browser.close();
